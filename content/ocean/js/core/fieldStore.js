// Field tables from the cascade workers. A worker packs its cascade's eight fields into one
// buffer (field-major, 32-bit floats) and sends it; the coordinator unpacks it into the
// "waiting" slot, PROMOTES it on the cascade's own rotation frame (waiting becomes current, the
// old current becomes previous), and once per frame blends previous and current into display
// tables that the surface samples. Display tables carry n and size so Cascade.sample works on
// them unchanged. The store is mutable on purpose: every array is allocated here once and
// rewritten every frame.
//
// Three slots, not two, because a result must not reach the display the instant it happens to
// arrive: a worker answers a frame or two after its request, and a fade driven by those arrivals
// moves in irregular steps, which Cole saw as jitter in the near water (2026-09-19). The waiting
// slot lets arrival and display come apart. Arrival fills waiting whenever it happens; promote
// runs on the fixed three-frame rotation, so the fade downstream can be counted in FRAMES.
//
// The latency that buys: a result requested at frame F - 3 is promoted at F and fully displayed
// at F + 2, so the surface shows the sea of about five frames ago.
//
// `index` is always the Luau cascade number (1, 2, 3); the per-cascade arrays are read at
// `[index - 1]`. A packed buffer is a Float32Array of bufferSize(cells) / 4 values.
// Twin of roblox-ocean/src/shared/Ocean/FieldStore.luau.
import { zeros } from './luau.js';

/**
 * The sampleable shape, owned by Cascade so there is one definition of it.
 * @typedef {import('./cascade.js').Fields} Fields
 */

/**
 * @typedef {object} Slot
 * @property {Fields} fields
 * @property {number} time
 * @property {boolean} filled
 */

/**
 * @typedef {object} Store
 * @property {number} count
 * @property {number} cells
 * @property {Slot[]} previous
 * @property {Slot[]} current
 * @property {Slot[]} waiting the last arrival, not yet on screen; promote moves it into current
 * @property {Fields[]} display
 * @property {number[]} promotedFrame the frame each cascade last promoted on; 0 before the first
 */

const BYTES_PER_VALUE = 4;

export const FIELD_NAMES = Object.freeze(['height', 'dispX', 'dispZ', 'slopeX', 'slopeZ', 'jxx', 'jzz', 'jxz']);
// What the surface reads every frame: the coordinator blends all eight now, since the painter's
// foam reads the Jacobian fields, so this set is the preview's and the sampler's and no longer
// the blend's.
export const SURFACE_FIELDS = Object.freeze(['height', 'dispX', 'dispZ', 'slopeX', 'slopeZ']);
// What flat lighting reads: with flatNormals the sampler takes Cascade.sampleHeight, which
// touches these three alone, so the slopes are two fifths of the blend spent on nothing.
export const FLAT_FIELDS = Object.freeze(['height', 'dispX', 'dispZ']);

// In bytes, as in the Luau; the Float32Array that holds it has bufferSize(cells) / 4 values.
export function bufferSize(cells) {
	return FIELD_NAMES.length * cells * BYTES_PER_VALUE;
}

/** @returns {Fields} */
export function newFields(n, size) {
	const cells = n * n;
	const fields = { n, size };
	for (const name of FIELD_NAMES) {
		fields[name] = zeros(cells);
	}
	return fields;
}

/** @returns {Slot} */
function newSlot(n, size) {
	return { fields: newFields(n, size), time: -1, filled: false };
}

/**
 * @param {number} n
 * @param {number[]} sizes one patch size per cascade, in cascade order
 * @returns {Store}
 */
export function create(n, sizes) {
	const previous = [];
	const current = [];
	const waiting = [];
	const display = [];
	const promotedFrame = [];
	for (const size of sizes) {
		previous.push(newSlot(n, size));
		current.push(newSlot(n, size));
		waiting.push(newSlot(n, size));
		display.push(newFields(n, size));
		promotedFrame.push(0);
	}
	return {
		count: sizes.length,
		cells: n * n,
		previous,
		current,
		waiting,
		display,
		promotedFrame,
	};
}

// Not in the Luau, where a buffer has one type: a Float64Array of half the count or an Int32Array
// of the same count has the right byteLength and would be read element by element as wrong values.
function checkFloat32(buffer) {
	if (!(buffer instanceof Float32Array)) {
		const kind = buffer?.constructor?.name ?? typeof buffer;
		throw new Error(`field buffer must be a Float32Array, got ${kind}`);
	}
}

/**
 * Writes the eight fields of `fields` (a Cascade satisfies Fields) into `out`, field-major:
 * field `which` (1-based, FIELD_NAMES order), cell `index` (1-based) lands at
 * `out[(which - 1) * cells + (index - 1)]`. The Float32Array store rounds each value to float32
 * exactly as buffer.writef32 does.
 * @param {Fields} fields
 * @param {Float32Array} out at least bufferSize(cells) bytes
 */
export function pack(fields, out) {
	checkFloat32(out);
	const cells = fields.n * fields.n;
	const needed = bufferSize(cells);
	if (out.byteLength < needed) {
		throw new Error(`field buffer holds ${out.byteLength} bytes, needs ${needed}`);
	}
	for (let which = 1; which <= FIELD_NAMES.length; which++) {
		const values = fields[FIELD_NAMES[which - 1]];
		const base = (which - 1) * cells;
		for (let index = 1; index <= cells; index++) {
			out[base + (index - 1)] = values[index - 1];
		}
	}
}

/**
 * The size must match exactly: a longer buffer (a worker built with a bigger n) would read in
 * bounds and fill every field with the wrong values instead of failing.
 * @param {Float32Array} input exactly bufferSize(cells) bytes
 * @param {Fields} fields
 */
export function unpack(input, fields) {
	checkFloat32(input);
	const cells = fields.n * fields.n;
	const expected = bufferSize(cells);
	if (input.byteLength !== expected) {
		throw new Error(`field buffer holds ${input.byteLength} bytes, expected ${expected}`);
	}
	for (let which = 1; which <= FIELD_NAMES.length; which++) {
		const values = fields[FIELD_NAMES[which - 1]];
		const base = (which - 1) * cells;
		for (let index = 1; index <= cells; index++) {
			values[index - 1] = input[base + (index - 1)];
		}
	}
}

/**
 * The buffer fills the WAITING slot, which nothing on screen is reading, and nothing moves: the
 * display keeps showing previous and current until promote is called. A rejected buffer leaves
 * the store exactly as it was, because unpack checks the type and length before it writes a single value.
 * Two results arriving between two promotions is not an error, just the first one lost.
 * @param {Store} store
 * @param {number} index Luau cascade number
 * @param {Float32Array} input
 * @param {number} t
 */
export function receive(store, index, input, t) {
	const slot = store.waiting[index - 1];
	unpack(input, slot.fields);
	slot.time = t;
	slot.filled = true;
}

/**
 * Rotates the three slots on the caller's schedule: previous takes the old current, current
 * takes what was waiting, and waiting takes the old previous, whose contents are now two updates
 * stale and free for the next receive to overwrite. Answers false and changes nothing when
 * nothing has arrived, so the display holds instead of restarting a fade over the same pair.
 * A pointer rotation between three fixed tables: nothing is copied and nothing is allocated.
 * @param {Store} store
 * @param {number} index Luau cascade number
 * @param {number} frame
 * @returns {boolean}
 */
export function promote(store, index, frame) {
	const i = index - 1;
	const arrived = store.waiting[i];
	if (!arrived.filled) {
		return false;
	}
	const stale = store.previous[i];
	store.previous[i] = store.current[i];
	store.current[i] = arrived;
	store.waiting[i] = stale;
	stale.filled = false;
	store.promotedFrame[i] = frame;
	return true;
}

/**
 * @param {Store} store
 * @param {number} index Luau cascade number
 * @returns {boolean}
 */
export function hasFields(store, index) {
	return store.current[index - 1].filled;
}

/**
 * display = previous + (current - previous) * fraction. With only one result, display is a
 * copy of it. With none, the display is left as it is (flat at start). `names` limits the work
 * to the fields the caller reads; the rest keep whatever they last held.
 * @param {Store} store
 * @param {number} index Luau cascade number
 * @param {number} fraction
 * @param {readonly string[]} [names] defaults to FIELD_NAMES
 */
export function blend(store, index, fraction, names) {
	const previous = store.previous[index - 1];
	const current = store.current[index - 1];
	const display = store.display[index - 1];
	if (!current.filled) {
		return;
	}
	const cells = store.cells;
	for (const name of names ?? FIELD_NAMES) {
		const to = current.fields[name];
		const out = display[name];
		if (previous.filled) {
			const from = previous.fields[name];
			for (let cell = 0; cell < cells; cell++) {
				const a = from[cell];
				out[cell] = a + (to[cell] - a) * fraction;
			}
		} else {
			// table.move(to, 1, cells, 1, out)
			out.set(to.subarray(0, cells), 0);
		}
	}
}
