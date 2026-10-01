// The arrows of the surface overlays (piece C2; lane C owns this file; spec 10.7 steps 5, 8 and 9;
// browser-free): each wave's heading from a hub above the surface; the surface's normals on a grid
// round the focus, the exact ones the engine's own WaveSampler gives from the waves' slopes (chop 0,
// as these steps run, so a grid point is a vertex of the finest ring: they sit on the 2-stud
// lattice); the tangent T = (1, dy/dx, 0) and binormal B = (0, dy/dz, 1) at the grid's centre; and
// (Task 6) the central-difference normal beside the exact one. Arrows go into a Float64Array,
// ARROW_STRIDE numbers each: base x, y, z, tip x, y, z, colour. Nothing allocates per call.
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
// A heading arrow's length: this share of its wave's length, held between these studs, so a longer
// wave reads as a longer arrow and the shortest still reads on a phone from the step's shot.
const HEADING_SHARE = 0.4;
const HEADING_MIN = 10;
const HEADING_MAX = 24;
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

/** One arrow per summed wave with height (at most MAX_DIRECTIONS), along its heading. */
export function directionArrows(waves, t, focus, out) {
	const hx = focus[0];
	const hz = focus[1];
	const hy = sampleAt(waves, t, hx, hz)[1] + HUB_LIFT;
	let n = 0;
	for (let wave = 0; wave < waves.count && n < MAX_DIRECTIONS; wave++) {
		const o = wave * STRIDE;
		if (waves.weights[wave] === 0 || waves.packed[o + 2] === 0) continue;
		const length = Math.min(Math.max(((2 * Math.PI) / waves.packed[o]) * HEADING_SHARE, HEADING_MIN), HEADING_MAX);
		write(out, n, hx, hy, hz, hx + waves.packed[o + 4] * length, hy, hz + waves.packed[o + 5] * length, COLOURS.WAVE + n);
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
