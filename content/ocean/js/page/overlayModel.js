// The arrows of the surface overlays (piece C2; lane C owns this file; spec 10.7 steps 5, 8 and 9;
// browser-free): each wave's heading from a hub above the surface, one rung up it per wave, its
// length in proportion to the wave's; the surface's normals on a grid round the focus, the exact ones
// the engine's own WaveSampler gives from the waves' slopes (chop 0, as these steps run, so a grid
// point is a vertex of the finest ring: they sit on the 2-stud lattice); the tangent
// T = (1, dy/dx, 0) and binormal B = (0, dy/dz, 1) at the grid's centre, from the same point as its
// normal; and step 9: at each grid point the exact normal and the one the central difference gives
// from heights `h` studs either side along x and z, and their mean angle in degrees; `readoutText`
// words it for the panel. Arrows go into a Float64Array, ARROW_STRIDE numbers each: base x, y, z,
// tip x, y, z, colour. Nothing allocates per call.
import * as WaveSampler from '../core/waveSampler.js';

export const ARROW_STRIDE = 7;
export const GRID = 7;
export const GRID_SPACING = 4;
export const MAX_DIRECTIONS = 8;
// The heading roles (WAVE and up) end at WAVE + MAX_DIRECTIONS; the frame normal comes after them.
export const COLOURS = Object.freeze({ NORMAL: 0, TANGENT: 1, BINORMAL: 2, DIFFERENCE: 3, WAVE: 4, FRAME_NORMAL: 4 + MAX_DIRECTIONS });
export const NORMAL_LENGTH = 3;
// The frame at the grid's centre: the normal n, the tangent T and the binormal B, all from one point
// P on the surface and longer than the grid's normals, so they read on a phone.
export const FRAME_LENGTH = 6;
// How many grid points T (along +x) or B (along +z) lies over, each; those grid normals are left out.
const CROSSED = Math.floor(FRAME_LENGTH / GRID_SPACING);
// Step 8's arrows: the grid less its centre (n stands there), the normals T and B cross, and the two
// just past their tips that from the step's shot would stand across them; then n, T and B.
export const NORMAL_ARROWS = GRID * GRID - 1 - 2 * CROSSED - 2 + 3;
// Step 9 draws the most: an exact and a difference arrow at every grid point.
export const MAX_ARROWS = Math.max(2 * GRID * GRID, NORMAL_ARROWS, MAX_DIRECTIONS);
// Studs the grid's centre sits from the focus on a wide screen (where the step's panel covers the
// left of the picture): about 9 studs along the right-hand direction of the vector steps' shot
// (stages/chapters/vectors.js, CLOSE), snapped to the 2-stud lattice. Fixed in the world, so orbiting
// never slides the grid (overlayModel.test.js holds it to the shot).
export const WIDE_GRID_OFFSET = Object.freeze([6, -8]);
// The central-difference arrow is a little longer than the exact one beside it, so where the two all
// but coincide (a small h) its head still shows past the exact head (0.6 studs long).
export const DIFFERENCE_LENGTH = 3.75;
// One colour per COLOURS entry, then one per heading: the normal (a darker accent), the tangent and
// binormal (term colours), the central difference (orange), the waves, then the frame normal (the
// normals' teal again), all clear against the white teaching sea. The renderer builds its colours
// from these, and the browser tests read them.
export const PALETTE_HEX = Object.freeze([
	'#1aa392', '#d9891a', '#d6457a', '#ef6c1a',
	'#e4572e', '#17a2a0', '#c9a000', '#5a9b2f', '#2e86ab', '#a23b72', '#f18f01', '#6a4c93',
	'#1aa392',
]);
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

/**
 * GRID x GRID exact normals round the focus, less the centre, the grid points T and B lie over and
 * the one just past each tip; then the frame at the centre point P: the normal n, the tangent T and
 * the binormal B, all from P.
 */
export function normalArrows(waves, t, focus, out) {
	const cx = lattice(focus[0]);
	const cz = lattice(focus[1]);
	const half = (GRID - 1) / 2;
	let n = 0;
	for (let i = 0; i < GRID; i++) {
		for (let j = 0; j < GRID; j++) {
			// Grid steps from the centre; T runs along +x (i), B along +z (j).
			const di = i - half;
			const dj = j - half;
			const crossed = (dj === 0 && di >= 0 && di <= CROSSED) || (di === 0 && dj > 0 && dj <= CROSSED);
			const pastTip = (di === CROSSED + 1 && dj === 1) || (di === 1 && dj === CROSSED + 1);
			if (crossed || pastTip) continue;
			const x = cx + di * GRID_SPACING;
			const z = cz + dj * GRID_SPACING;
			const s = sampleAt(waves, t, x, z);
			const y = s[1] + LIFT;
			write(out, n, x, y, z, x + s[3] * NORMAL_LENGTH, y + s[4] * NORMAL_LENGTH, z + s[5] * NORMAL_LENGTH, COLOURS.NORMAL);
			n += 1;
		}
	}
	const s = sampleAt(waves, t, cx, cz);
	const py = s[1] + LIFT;
	// The normal lies along (-dy/dx, 1, -dy/dz), so each slope is minus a horizontal part over the vertical one.
	const sx = -s[3] / s[4];
	const sz = -s[5] / s[4];
	const tl = Math.hypot(1, sx);
	const bl = Math.hypot(sz, 1);
	write(out, n, cx, py, cz, cx + s[3] * FRAME_LENGTH, py + s[4] * FRAME_LENGTH, cz + s[5] * FRAME_LENGTH, COLOURS.FRAME_NORMAL);
	write(out, n + 1, cx, py, cz, cx + FRAME_LENGTH / tl, py + (sx * FRAME_LENGTH) / tl, cz, COLOURS.TANGENT);
	write(out, n + 2, cx, py, cz, cx, py + (sz * FRAME_LENGTH) / bl, cz + FRAME_LENGTH / bl, COLOURS.BINORMAL);
	return n + 3;
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
			write(out, n + 1, x, y, z, x + dx * DIFFERENCE_LENGTH, y + dy * DIFFERENCE_LENGTH, z + dz * DIFFERENCE_LENGTH, COLOURS.DIFFERENCE);
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
	return `On this sea, sampling ${studsText(spacing)} studs either side, the two arrows differ by ${angleText(meanAngle)}° on average, measured in this browser just now.`;
}
