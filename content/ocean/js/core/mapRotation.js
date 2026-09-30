// Which animated map a frame paints. The three maps are named here, and the two rotations that
// share them out: the maps worker alternates the mask and the normal (MAPS, mapsSlot), and the
// colour worker takes its own map a band of rows at a time (BANDS, band).
// Twin of roblox-ocean/src/shared/Ocean/MapRotation.luau.
import { mod } from './luau.js';

export const COLOUR = 1;
export const MASK = 2;
export const NORMAL = 3;

// At 512 texels the colour map is sixteen times the fill it was, far too much to share a turn
// with the other two, so it takes a worker to itself and the mask and the normal alternate on the
// second: each of them refreshes every other frame, which is faster than the three-way turn it
// replaces. The colour map's own worker is on the band rotation below.
export const MAPS = Object.freeze([MASK, NORMAL]);

// Luau: MAPS[((frame - 1) % 2) + 1]; the slot is 0-based storage here, the result a map constant.
export function mapsSlot(frame) {
	return MAPS[mod(frame - 1, 2)];
}

// The colour map's turn is a band of rows and not the whole map: four of them, one a frame, so no
// single fill outruns the frame that started it and a texel comes round every fourth frame.
export const BANDS = 4;

// The Luau band number, 1-based.
export function band(frame, bands) {
	return mod(frame - 1, bands) + 1;
}
