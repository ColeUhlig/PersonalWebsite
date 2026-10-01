// The arrows of the surface overlays (piece C2; lane C owns this file; spec 10.7 steps 5, 8 and 9;
// browser-free): each wave's heading from a hub above the surface, one rung up it per wave, its
// length in proportion to the wave's; the surface's normals on a grid round the focus, the exact ones
// the engine's own WaveSampler gives from the waves' slopes (chop 0, as these steps run, so a grid
// point is a vertex of the finest ring: they sit on the 2-stud lattice); the tangent
// T = (1, dy/dx, 0) and binormal B = (0, dy/dz, 1) at the grid's centre; and step 9: at each grid
// point the exact normal and the one the central difference gives from heights `h` studs either side
// along x and z, and their mean angle in degrees; `readoutText` words it for the panel. Arrows go
// into a Float64Array, ARROW_STRIDE numbers each: base x, y, z, tip x, y, z, colour. Nothing
// allocates per call.
import * as WaveSampler from '../core/waveSampler.js';

export const ARROW_STRIDE = 7;
export const GRID = 7;
export const GRID_SPACING = 4;
export const MAX_DIRECTIONS = 8;
export const MAX_ARROWS = 2 * GRID * GRID + MAX_DIRECTIONS + 2;
export const COLOURS = Object.freeze({ NORMAL: 0, TANGENT: 1, BINORMAL: 2, DIFFERENCE: 3, WAVE: 4 });
export const NORMAL_LENGTH = 3;
// Studs the arrows start above the surface, so their bases are not buried in it.
const LIFT = 0.15;
// Studs the heading hub floats above the surface.
const HUB_LIFT = 1.5;
// Studs between one heading arrow and the next up the hub, so arrows along one heading (spread 0)
// lie one above another instead of on top of each other.
const HUB_STEP = 0.8;
// A heading arrow's length in studs: the longest drawn wave's is HEADING_LONGEST and every other is
// in proportion to its wavelength, never shorter than HEADING_MIN (none is clamped from above, so two
// long waves never look equal).
const HEADING_LONGEST = 24;
const HEADING_MIN = 6;
const STRIDE = WaveSampler.STRIDE;
const SAMPLE = new Float64Array(7);

function write(out, i, bx, by, bz, tx, ty, tz, colour) {
	const o = i * ARROW_STRIDE;
	out[o] = bx;
	out[o + 1] = by;
	out[o + 2] = bz;
	out[o + 3] = tx;
	out[o + 4] = ty;
	out[o + 5] = tz;
	out[o + 6] = colour;
}

const sampleAt = (waves, t, x, z) => WaveSampler.sample(waves.packed, waves.count, t, x, z, 0, waves.weights, 0, SAMPLE);

// Whether a wave is drawn as a heading: it is summed with some weight and has height.
const drawn = (waves, wave) => waves.weights[wave] !== 0 && waves.packed[wave * STRIDE + 2] !== 0;

/** One arrow per summed wave with height (at most MAX_DIRECTIONS), along its heading, each a rung up the hub. */
export function directionArrows(waves, t, focus, out) {
	const hx = focus[0];
	const hz = focus[1];
	const hy = sampleAt(waves, t, hx, hz)[1] + HUB_LIFT;
	// The smallest k among the waves that will be drawn is the longest wavelength.
	let kLongest = Infinity;
	for (let wave = 0, seen = 0; wave < waves.count && seen < MAX_DIRECTIONS; wave++) {
		if (!drawn(waves, wave)) continue;
		kLongest = Math.min(kLongest, waves.packed[wave * STRIDE]);
		seen += 1;
	}
	let n = 0;
	for (let wave = 0; wave < waves.count && n < MAX_DIRECTIONS; wave++) {
		if (!drawn(waves, wave)) continue;
		const o = wave * STRIDE;
		// lambda / lambdaLongest = kLongest / k.
		const length = Math.max((HEADING_LONGEST * kLongest) / waves.packed[o], HEADING_MIN);
		const y = hy + n * HUB_STEP;
		write(out, n, hx, y, hz, hx + waves.packed[o + 4] * length, y, hz + waves.packed[o + 5] * length, COLOURS.WAVE + n);
		n += 1;
	}
	return n;
}

// The grid's centre on the 2-stud lattice, so each point is a vertex of the finest ring.
const lattice = (value) => Math.round(value / 2) * 2;

/** GRID x GRID exact normals round the focus, then the tangent and binormal at the centre. */
export function normalArrows(waves, t, focus, out) {
	const cx = lattice(focus[0]);
	const cz = lattice(focus[1]);
	const half = (GRID - 1) / 2;
	let n = 0;
	for (let i = 0; i < GRID; i++) {
		for (let j = 0; j < GRID; j++) {
			const x = cx + (i - half) * GRID_SPACING;
			const z = cz + (j - half) * GRID_SPACING;
			const s = sampleAt(waves, t, x, z);
			const y = s[1] + LIFT;
			write(out, n, x, y, z, x + s[3] * NORMAL_LENGTH, y + s[4] * NORMAL_LENGTH, z + s[5] * NORMAL_LENGTH, COLOURS.NORMAL);
			n += 1;
		}
	}
	const s = sampleAt(waves, t, cx, cz);
	const y = s[1] + LIFT;
	// The normal lies along (-dy/dx, 1, -dy/dz), so each slope is minus a horizontal part over the vertical one.
	const sx = -s[3] / s[4];
	const sz = -s[5] / s[4];
	const tl = Math.hypot(1, sx);
	const bl = Math.hypot(sz, 1);
	write(out, n, cx, y, cz, cx + NORMAL_LENGTH / tl, y + (sx * NORMAL_LENGTH) / tl, cz, COLOURS.TANGENT);
	write(out, n + 1, cx, y, cz, cx, y + (sz * NORMAL_LENGTH) / bl, cz + NORMAL_LENGTH / bl, COLOURS.BINORMAL);
	return n + 2;
}

const height = (waves, t, x, z) => sampleAt(waves, t, x, z)[1];

/** The central-difference slopes (dy/dx, dy/dz) at (x, z) from heights h studs either side, into out. */
export function differenceSlope(waves, t, x, z, h, out) {
	out[0] = (height(waves, t, x + h, z) - height(waves, t, x - h, z)) / (2 * h);
	out[1] = (height(waves, t, x, z + h) - height(waves, t, x, z - h)) / (2 * h);
	return out;
}

const SLOPES = new Float64Array(2);
const DEGREES = 180 / Math.PI;

/** Exact and central-difference normals on the grid, in that order per point; the mean angle between them. */
export function slopeArrows(waves, t, focus, h, out, result) {
	const cx = lattice(focus[0]);
	const cz = lattice(focus[1]);
	const half = (GRID - 1) / 2;
	let n = 0;
	let sum = 0;
	for (let i = 0; i < GRID; i++) {
		for (let j = 0; j < GRID; j++) {
			const x = cx + (i - half) * GRID_SPACING;
			const z = cz + (j - half) * GRID_SPACING;
			const s = sampleAt(waves, t, x, z);
			const y = s[1] + LIFT;
			const nx = s[3];
			const ny = s[4];
			const nz = s[5];
			differenceSlope(waves, t, x, z, h, SLOPES);
			const length = Math.hypot(SLOPES[0], 1, SLOPES[1]);
			const dx = -SLOPES[0] / length;
			const dy = 1 / length;
			const dz = -SLOPES[1] / length;
			sum += Math.acos(Math.min(1, Math.max(-1, nx * dx + ny * dy + nz * dz)));
			write(out, n, x, y, z, x + nx * NORMAL_LENGTH, y + ny * NORMAL_LENGTH, z + nz * NORMAL_LENGTH, COLOURS.NORMAL);
			write(out, n + 1, x, y, z, x + dx * NORMAL_LENGTH, y + dy * NORMAL_LENGTH, z + dz * NORMAL_LENGTH, COLOURS.DIFFERENCE);
			n += 2;
		}
	}
	result.count = n;
	result.meanAngle = (sum / (GRID * GRID)) * DEGREES;
	return result;
}

const angleText = (degrees) => (degrees < 0.1 ? degrees.toFixed(3) : degrees < 10 ? degrees.toFixed(1) : degrees.toFixed(0));
const studsText = (studs) => String(Number(studs.toFixed(1)));

/** The panel's live line: empty until there is a gap to show. */
export function readoutText({ meanAngle, spacing }) {
	if (!Number.isFinite(meanAngle)) return '';
	return `On this sea just now, the two arrows differ by ${angleText(meanAngle)}° on average, sampling ${studsText(spacing)} studs either side.`;
}
