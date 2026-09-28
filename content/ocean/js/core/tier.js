// Quality presets: how dense the surface is, how far it reaches, how many cascades run and
// which rings sample them. Chosen at start-up from a CPU probe. Numbers are starting points
// for the M2 bench to adjust.
// Twin of roblox-ocean/src/shared/Ocean/Tier.luau.

/**
 * @typedef {object} Preset
 * @property {number} patchCells
 * @property {number} textureTile
 * @property {number} n
 * @property {ReadonlyArray<number>} sizes cascade patch sizes, largest first
 * @property {ReadonlyArray<Readonly<import('./ringLayout.js').RingSpec>>} rings
 */

// Cascade lists hold Luau cascade numbers (1 is the largest patch).
function ring(spacing, halfExtent, cascades, jacobian) {
	return Object.freeze({
		spacing,
		halfExtent,
		cascades: Object.freeze(cascades),
		// The vertex normals take cascade 1 alone on every ring of every preset; the note above
		// High's rings says why the rest belong in the normal map instead.
		normalCascades: Object.freeze([1]),
		jacobian,
	});
}

export const ORDER = Object.freeze(['High', 'Medium', 'Low']);

/** @type {Readonly<Record<string, Readonly<Preset>>>} */
export const presets = Object.freeze({
	High: Object.freeze({
		patchCells: 8,
		textureTile: 256,
		n: 64,
		sizes: Object.freeze([256, 64, 16]),
		// Which cascades a ring SAMPLES, which is not which cascades run. The rule the lists
		// below actually apply: a ring samples a cascade only while its cells are NARROWER than
		// that cascade's LONGEST wave. Cascade 2 runs from 2.67 to 10.67 studs (k from 12 pi / 64
		// to 12 pi / 16), so the 2, 4 and 8-stud rings carry it -- ring 3 on 8 < 10.67, kept
		// deliberately although its cells give the band's longest wave only 1.3 samples, a look
		// decision -- and the 16 and 32-stud rings, wider than anything in it, drop it.
		// Necessary, not sufficient: cascade 3 is everything under 2.67 studs, which not even the
		// 2-stud ring resolves (two samples a wave wants 4-stud waves at best), so it is sampled
		// nowhere at all. What a ring cannot resolve it can only alias, and under the flat
		// lighting of M2, where the colour ramp alone drew the shape, an alias was all it would
		// add. All three still RUN: M3's normal map is where the short waves belong.
		// What a ring samples is not what tilts it: from M3 the VERTEX normals take cascade 1
		// only (`normalCascades`, which the `ring` helper above sets on every ring of every
		// preset). The normal map carries the shorter waves at the texel resolution of the
		// 256-stud tile, finer than any ring's vertices, and the case that showed why is cascade 2
		// on the 8-stud ring: 1.3 samples across its longest wave tilted a vertex by whatever the
		// lattice happened to catch. The rings still SAMPLE those cascades; the height and the
		// chop displacement are theirs.
		rings: Object.freeze([
			ring(2, 32, [1, 2], true),
			ring(4, 64, [1, 2], true),
			ring(8, 256, [1, 2], false),
			ring(16, 512, [1], false),
			ring(32, 1024, [1], false),
		]),
	}),
	Medium: Object.freeze({
		patchCells: 8,
		textureTile: 256,
		n: 64,
		sizes: Object.freeze([256, 64]),
		// Medium's cascade 2 is the 64-stud patch and the last of its sizes, so it is open above
		// (kMax = Infinity): 10.67 studs down to the 64-cell grid's Nyquist at 2. Its finest
		// ring is 4 studs, which clears the High rule above (4 < 10.67) but resolves only the 8
		// to 10.67-stud top of that band and aliases the rest, so it is dropped everywhere --
		// which also leaves the tier no interior fade band. Sampled nowhere, still run.
		rings: Object.freeze([
			ring(4, 64, [1], true),
			ring(8, 128, [1], false),
			ring(16, 256, [1], false),
			ring(32, 512, [1], false),
			ring(64, 1024, [1], false),
		]),
	}),
	Low: Object.freeze({
		patchCells: 6,
		textureTile: 256,
		// The same lattice as the other tiers. Cascade.create draws its random numbers over the
		// n x n grid, so n = 32 was a DIFFERENT realisation of the spectrum: the Low tier
		// computed a different sea from the same seed, and two viewers on different tiers
		// would not have agreed about where the waves were.
		n: 64,
		sizes: Object.freeze([256]),
		// One cascade, and being the last size it is open above (kMax = Infinity), so it carries
		// everything down to its 64-cell grid's Nyquist at 8 studs -- the 8 to 10.67-stud sliver
		// High hands to cascade 2 included. Low's finest ring has 8-stud cells and can only alias
		// that top of the band, but there is no second cascade to put it in and dropping it would
		// mean dropping the only cascade there is.
		// Five rings, not four. The horizon's quads tuck under the last ring's edge and reach
		// 2,040 studs past it, so this reach is what carries the far sea beyond the haze:
		// stopping at 768 would bring it in to 2,808 from the design's 3,064. 1,536 is the next
		// reach a 768-stud patch (6 cells of 128) tiles: two patches out from the centre each
		// way. This reach is also why Low's horizon is twelve quads and not eight: a 1,528-stud
		// hole is wider than one 2,048-stud quad can span, so the grid takes two a side.
		rings: Object.freeze([
			ring(8, 96, [1], false),
			ring(16, 192, [1], false),
			ring(32, 384, [1], false),
			ring(64, 768, [1], false),
			ring(128, 1536, [1], false),
		]),
	}),
});

// Milliseconds from the start-up CPU probe: one 64-cell cascade evolved and synthesised, the
// median of three runs. NOT a frame time -- the old measurement timed 60 frames of an empty
// scene, which sits on the 60 fps cap whatever the machine, so it read the same on every
// device. Provisional thresholds: Cole's Mac measures about 4.8 ms non-native, so High has room
// above it and Medium catches a machine about twice as slow.
const HIGH_BELOW_MS = 8;
const MEDIUM_BELOW_MS = 16;

export function choose(probeMs) {
	if (probeMs < HIGH_BELOW_MS) {
		return 'High';
	} else if (probeMs < MEDIUM_BELOW_MS) {
		return 'Medium';
	}
	return 'Low';
}
