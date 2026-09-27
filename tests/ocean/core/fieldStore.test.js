import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FFT from '../../../content/ocean/js/core/fft.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';

const N = 16;
const SIZES = [128, 64];
const CELLS = N * N;

function synthesised(seed, t, size) {
	const cascade = Cascade.create({
		n: N,
		size,
		kMin: 0,
		kMax: Infinity,
		seed,
		loopPeriod: 120,
		params: Spectrum.NORMAL,
	});
	Cascade.evolve(cascade, t);
	Cascade.synthesise(cascade, FFT.plan(N));
	return cascade;
}

// Luau's `not pcall(f, ...)`: true when the call throws.
function throws(fn, ...args) {
	try {
		fn(...args);
		return false;
	} catch {
		return true;
	}
}

function newBuffer(bytes) {
	return new Float32Array(bytes / 4);
}

test('a packed buffer holds eight fields of 32-bit floats, field-major', () => {
	expect.equal(FieldStore.bufferSize(CELLS), 8 * CELLS * 4, 'size');
	const fields = FieldStore.newFields(N, 128);
	FieldStore.FIELD_NAMES.forEach((name, i) => {
		const which = i + 1; // the Luau loop's 1-based field number
		for (let index = 1; index <= CELLS; index++) {
			fields[name][index - 1] = which * 1000 + index;
		}
	});
	const packed = newBuffer(FieldStore.bufferSize(CELLS));
	FieldStore.pack(fields, packed);
	expect.near(packed[0], 1001, 0, 'first height');
	expect.near(packed[CELLS], 2001, 0, 'first dispX follows the heights');
	expect.near(packed[7 * CELLS + CELLS - 1], 8000 + CELLS, 0, 'last jxz');
});

test('unpack reverses pack to float precision', () => {
	const cascade = synthesised(1, 3, 128);
	const packed = newBuffer(FieldStore.bufferSize(CELLS));
	FieldStore.pack(cascade, packed);
	const fields = FieldStore.newFields(N, 128);
	FieldStore.unpack(packed, fields);
	for (const name of FieldStore.FIELD_NAMES) {
		const from = cascade[name];
		const to = fields[name];
		for (let index = 1; index <= CELLS; index++) {
			const tolerance = Math.abs(from[index - 1]) * 1e-6 + 1e-9;
			expect.near(to[index - 1], from[index - 1], tolerance, `${name}[${index}]`);
		}
	}
});

// A result lands in the WAITING slot and shows only when promote moves it, on the frame the
// rotation picks. Receive on its own must therefore leave the two slots the display reads
// exactly where they were, however many results arrive between two promotions.
test('receive fills waiting and promote moves it into current', () => {
	const store = FieldStore.create(N, SIZES);
	expect.truthy(!FieldStore.hasFields(store, 1), 'empty at start');
	const packed = newBuffer(FieldStore.bufferSize(CELLS));
	FieldStore.pack(synthesised(2, 1, 128), packed);
	FieldStore.receive(store, 1, packed, 1);
	expect.truthy(store.waiting[0].filled, 'the result is waiting');
	expect.equal(store.waiting[0].time, 1, 'waiting time');
	expect.truthy(!FieldStore.hasFields(store, 1), 'nothing is displayed until it is promoted');
	expect.truthy(FieldStore.promote(store, 1, 3), 'promoted');
	expect.truthy(FieldStore.hasFields(store, 1), 'filled');
	expect.equal(store.current[0].time, 1, 'current time');
	expect.equal(store.promotedFrame[0], 3, 'the promotion frame is recorded');
	expect.truthy(!store.waiting[0].filled, 'the waiting slot is free again');
	expect.truthy(!store.previous[0].filled, 'no previous yet');
	const firstHeight = store.current[0].fields.height[5 - 1];
	const wasCurrent = store.current[0];
	FieldStore.pack(synthesised(2, 2, 128), packed);
	FieldStore.receive(store, 1, packed, 2);
	expect.equal(store.current[0], wasCurrent, 'current holds while the next result waits');
	expect.truthy(FieldStore.promote(store, 1, 6), 'promoted again');
	expect.equal(
		store.previous[0],
		wasCurrent,
		'the old current slot object moved, not its contents',
	);
	expect.equal(store.previous[0].time, 1, 'previous time');
	expect.equal(store.previous[0].fields.height[5 - 1], firstHeight, 'previous holds the old current');
	expect.equal(store.current[0].time, 2, 'current time advanced');
	expect.equal(store.promotedFrame[0], 6, 'the promotion frame advanced');
	expect.truthy(!FieldStore.hasFields(store, 2), 'other cascade untouched');
});

test('promote rotates waiting into current and current into previous', () => {
	const store = FieldStore.create(N, SIZES);
	const packed = newBuffer(FieldStore.bufferSize(CELLS));
	FieldStore.pack(synthesised(9, 1, 128), packed);
	FieldStore.receive(store, 1, packed, 1);
	FieldStore.promote(store, 1, 3);
	FieldStore.pack(synthesised(9, 2, 128), packed);
	FieldStore.receive(store, 1, packed, 2);
	FieldStore.promote(store, 1, 6);
	const previous = store.previous[0].fields;
	const current = store.current[0].fields;
	FieldStore.blend(store, 1, 0.5);
	for (let index = 1; index <= CELLS; index += 37) {
		expect.near(
			store.display[0].height[index - 1],
			(previous.height[index - 1] + current.height[index - 1]) * 0.5,
			1e-12,
			`height[${index}] is halfway between the two promoted results`,
		);
	}
});

test('promote with nothing waiting returns false and changes nothing', () => {
	const store = FieldStore.create(N, SIZES);
	expect.truthy(!FieldStore.promote(store, 1, 4), 'nothing has arrived yet');
	expect.equal(store.promotedFrame[0], 0, 'no promotion frame was recorded');
	expect.truthy(!FieldStore.hasFields(store, 1), 'still empty');
	const packed = newBuffer(FieldStore.bufferSize(CELLS));
	FieldStore.pack(synthesised(10, 1, 128), packed);
	FieldStore.receive(store, 1, packed, 1);
	expect.truthy(FieldStore.promote(store, 1, 5), 'the one result is promoted');
	const previous = store.previous[0];
	const current = store.current[0];
	expect.truthy(!FieldStore.promote(store, 1, 8), 'the waiting slot is empty again');
	expect.equal(store.previous[0], previous, 'previous slot unchanged');
	expect.equal(store.current[0], current, 'current slot unchanged');
	expect.equal(store.promotedFrame[0], 5, 'the promotion frame stays where it was');
});

// Three slots rotating in a cycle of three: the store allocates nothing after FieldStore.create
// and the same three field tables take turns. A round is a receive and its promotion, so the
// fourth round unpacks into the table the first result was unpacked into. Table IDENTITY is what
// says so; the values could not tell a reused table from a fresh one.
test('a third result reuses the slot the first result held', () => {
	const store = FieldStore.create(N, SIZES);
	const packed = newBuffer(FieldStore.bufferSize(CELLS));
	const started = new Set([store.previous[0].fields, store.current[0].fields, store.waiting[0].fields]);
	let firstSlot = null;
	for (let round = 1; round <= 4; round++) {
		FieldStore.pack(synthesised(11, round, 128), packed);
		FieldStore.receive(store, 1, packed, round);
		expect.truthy(FieldStore.promote(store, 1, round * 3), `round ${round} promoted`);
		if (round === 1) {
			firstSlot = store.current[0];
		}
		for (const slot of [store.previous[0], store.current[0], store.waiting[0]]) {
			expect.truthy(started.has(slot.fields), `round ${round}: no table was allocated`);
		}
	}
	expect.equal(store.current[0], firstSlot, "the fourth result is in the first result's slot");
	// And the display still follows the LAST two results, whichever tables they landed in.
	const previous = store.previous[0].fields;
	const current = store.current[0].fields;
	FieldStore.blend(store, 1, 0.25);
	for (let index = 1; index <= CELLS; index += 37) {
		const want = previous.height[index - 1] + (current.height[index - 1] - previous.height[index - 1]) * 0.25;
		expect.near(store.display[0].height[index - 1], want, 1e-12, `height[${index}]`);
	}
});

test('a buffer of the wrong size is rejected', () => {
	const store = FieldStore.create(N, SIZES);
	const tooLarge = newBuffer(FieldStore.bufferSize(CELLS) + 4);
	expect.truthy(throws(FieldStore.receive, store, 1, tooLarge, 1), 'too large');
	const tooSmall = newBuffer(FieldStore.bufferSize(CELLS) - 4);
	expect.truthy(throws(FieldStore.receive, store, 1, tooSmall, 1), 'too small');
	expect.truthy(!FieldStore.hasFields(store, 1), 'nothing was filled');
	const fields = FieldStore.newFields(N, 128);
	expect.truthy(throws(FieldStore.pack, fields, tooSmall), 'pack into a short buffer');
});

test('a rejected buffer leaves the store as it was', () => {
	const store = FieldStore.create(N, SIZES);
	const packed = newBuffer(FieldStore.bufferSize(CELLS));
	FieldStore.pack(synthesised(6, 1, 128), packed);
	FieldStore.receive(store, 1, packed, 1);
	FieldStore.promote(store, 1, 3);
	FieldStore.pack(synthesised(6, 2, 128), packed);
	FieldStore.receive(store, 1, packed, 2);
	FieldStore.promote(store, 1, 6);
	const previous = store.previous[0];
	const current = store.current[0];
	const wrong = newBuffer(FieldStore.bufferSize(CELLS) + 4);
	expect.truthy(throws(FieldStore.receive, store, 1, wrong, 3), 'rejected');
	expect.equal(store.previous[0], previous, 'previous slot unchanged');
	expect.equal(store.current[0], current, 'current slot unchanged');
	expect.equal(store.previous[0].time, 1, 'previous time');
	expect.equal(store.current[0].time, 2, 'current time');
	FieldStore.blend(store, 1, 0);
	for (let index = 1; index <= CELLS; index += 37) {
		expect.near(
			store.display[0].height[index - 1],
			previous.fields.height[index - 1],
			1e-12,
			`at 0 the display is the previous: height[${index}]`,
		);
	}
	FieldStore.blend(store, 1, 1);
	for (let index = 1; index <= CELLS; index += 37) {
		expect.near(
			store.display[0].height[index - 1],
			current.fields.height[index - 1],
			1e-12,
			`at 1 the display is the current: height[${index}]`,
		);
	}
});

test('blend interpolates previous and current into the display tables', () => {
	const store = FieldStore.create(N, SIZES);
	const packed = newBuffer(FieldStore.bufferSize(CELLS));
	FieldStore.pack(synthesised(3, 1, 128), packed);
	FieldStore.receive(store, 1, packed, 1);
	FieldStore.promote(store, 1, 3);
	FieldStore.pack(synthesised(3, 2, 128), packed);
	FieldStore.receive(store, 1, packed, 2);
	FieldStore.promote(store, 1, 6);
	const previous = store.previous[0].fields;
	const current = store.current[0].fields;
	for (const fraction of [0, 0.25, 1]) {
		FieldStore.blend(store, 1, fraction);
		for (let index = 1; index <= CELLS; index += 37) {
			const want = previous.height[index - 1] + (current.height[index - 1] - previous.height[index - 1]) * fraction;
			expect.near(
				store.display[0].height[index - 1],
				want,
				1e-12,
				`height[${index}] at ${fraction}`,
			);
			const wantJ = previous.jxz[index - 1] + (current.jxz[index - 1] - previous.jxz[index - 1]) * fraction;
			expect.near(store.display[0].jxz[index - 1], wantJ, 1e-12, `jxz[${index}] at ${fraction}`);
		}
	}
});

test('blend can be limited to named fields', () => {
	const store = FieldStore.create(N, SIZES);
	const packed = newBuffer(FieldStore.bufferSize(CELLS));
	FieldStore.pack(synthesised(7, 1, 128), packed);
	FieldStore.receive(store, 1, packed, 1);
	FieldStore.promote(store, 1, 3);
	FieldStore.pack(synthesised(7, 2, 128), packed);
	FieldStore.receive(store, 1, packed, 2);
	FieldStore.promote(store, 1, 6);
	const previous = store.previous[0].fields;
	const current = store.current[0].fields;
	// Blend everything at 0 first, so every display field holds the previous values.
	FieldStore.blend(store, 1, 0);
	FieldStore.blend(store, 1, 0.5, ['height']);
	for (let index = 1; index <= CELLS; index += 37) {
		const want = previous.height[index - 1] + (current.height[index - 1] - previous.height[index - 1]) * 0.5;
		expect.near(store.display[0].height[index - 1], want, 1e-12, `height[${index}] blended`);
		expect.near(
			store.display[0].jxz[index - 1],
			previous.jxz[index - 1],
			1e-12,
			`jxz[${index}] was not touched`,
		);
	}
});

test('FLAT_FIELDS blends what flat lighting reads and nothing else', () => {
	expect.equal(
		FieldStore.FLAT_FIELDS.join(','),
		'height,dispX,dispZ',
		'the flat list is the three fields Cascade.sampleHeight reads',
	);
	// Two stores fed the same two results, so one can be blended with each list and compared.
	function loaded() {
		const store = FieldStore.create(N, SIZES);
		const packed = newBuffer(FieldStore.bufferSize(CELLS));
		FieldStore.pack(synthesised(8, 1, 128), packed);
		FieldStore.receive(store, 1, packed, 1);
		FieldStore.promote(store, 1, 3);
		FieldStore.pack(synthesised(8, 2, 128), packed);
		FieldStore.receive(store, 1, packed, 2);
		FieldStore.promote(store, 1, 6);
		return store;
	}
	const full = loaded();
	const flat = loaded();
	const SENTINEL = -12345.5;
	for (const name of FieldStore.SURFACE_FIELDS) {
		const values = flat.display[0][name];
		for (let index = 1; index <= CELLS; index++) {
			values[index - 1] = SENTINEL;
		}
	}
	FieldStore.blend(full, 1, 0.375, FieldStore.SURFACE_FIELDS);
	FieldStore.blend(flat, 1, 0.375, FieldStore.FLAT_FIELDS);
	for (const name of FieldStore.FLAT_FIELDS) {
		const want = full.display[0][name];
		const got = flat.display[0][name];
		for (let index = 1; index <= CELLS; index += 29) {
			expect.equal(got[index - 1], want[index - 1], `${name}[${index}] matches the SURFACE_FIELDS blend`);
		}
	}
	for (const name of ['slopeX', 'slopeZ']) {
		const got = flat.display[0][name];
		for (let index = 1; index <= CELLS; index += 29) {
			expect.equal(got[index - 1], SENTINEL, `${name}[${index}] was not touched`);
		}
	}
});

test('with one result the display is a copy of it, whatever the fraction', () => {
	const store = FieldStore.create(N, SIZES);
	const packed = newBuffer(FieldStore.bufferSize(CELLS));
	FieldStore.pack(synthesised(4, 5, 64), packed);
	FieldStore.receive(store, 2, packed, 5);
	FieldStore.promote(store, 2, 3);
	FieldStore.blend(store, 2, 0.3);
	for (let index = 1; index <= CELLS; index += 41) {
		expect.equal(
			store.display[1].dispX[index - 1],
			store.current[1].fields.dispX[index - 1],
			`dispX[${index}]`,
		);
	}
	expect.equal(store.display[1].n, N, 'n');
	expect.equal(store.display[1].size, 64, 'size');
});

test('blend on an empty cascade leaves the display flat', () => {
	const store = FieldStore.create(N, SIZES);
	FieldStore.blend(store, 1, 0.5);
	for (let index = 1; index <= CELLS; index += 53) {
		expect.equal(store.display[0].height[index - 1], 0, `height[${index}]`);
	}
});

test('the display tables can be sampled like a cascade', () => {
	const store = FieldStore.create(N, SIZES);
	const packed = newBuffer(FieldStore.bufferSize(CELLS));
	const cascade = synthesised(5, 4, 128);
	FieldStore.pack(cascade, packed);
	FieldStore.receive(store, 1, packed, 4);
	FieldStore.promote(store, 1, 3);
	FieldStore.blend(store, 1, 1);
	const fromDisplay = Cascade.sample(store.display[0], 10.5, 3.25)[0];
	const fromCascade = Cascade.sample(cascade, 10.5, 3.25)[0];
	expect.near(fromDisplay, fromCascade, Math.abs(fromCascade) * 1e-6 + 1e-9, 'height');
});
