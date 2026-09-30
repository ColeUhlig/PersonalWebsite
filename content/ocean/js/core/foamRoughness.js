// One ring's roughness map: the ring's base roughness lifted toward the foam roughness by the
// colour fill's coverage, so foam is matte and the sky reflection dies on it. Grey RGBA; the
// renderer reads the red channel.
//
// Storage: `coverage` is a Float32Array, one float per texel; `out` is a Uint8Array of RGBA bytes,
// texel `index` at bytes index * 4 .. index * 4 + 3.
// Twin of roblox-ocean/src/shared/Ocean/FoamRoughness.luau.
import { clamp } from './luau.js';

const BYTES = 4; // RGBA bytes per texel in `out`

export function fill(out, texels, coverage, base, foamRoughness) {
	const span = foamRoughness - base;
	for (let index = 0; index <= texels * texels - 1; index++) {
		const value = base + coverage[index] * span;
		const byte = clamp(Math.floor(value * 255 + 0.5), 0, 255);
		const offset = index * BYTES;
		out[offset] = byte;
		out[offset + 1] = byte;
		out[offset + 2] = byte;
		out[offset + 3] = 255;
	}
}
