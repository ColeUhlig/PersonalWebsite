// Where the surface's vertices are. A clipmap: square windows of patches around the camera,
// each ring twice the spacing of the one inside it, every ring the same number of cells
// across. Patches are described in local coordinates (relative to the patch centre) so the
// renderer can build one template mesh per ring and copy it. Seams: on an edge that faces a
// coarser ring, the fine ring's odd vertices have no partner on the coarse side, so the
// sampler sets each to the average of its even neighbours and the edge stays straight.
//
// Every ring is a FULL square and keeps its own world lattice. Ring k's window centre is the
// focus snapped to 2 * spacing (`windowCentre`), so its vertices are always multiples of its
// spacing in world space and its edges land on ring k+1's lattice: when the focus crosses a
// step the whole ring moves by one snap and every vertex that stays inside lands on the world
// point it already had, so nothing re-interpolates and nothing swims. The rings overlap
// instead of leaving holes; the sampler drops the vertices a finer ring already covers into a
// hidden skirt, which is why the layout has no hole logic. (Before 2026-09-19 the whole
// assembly shared one origin snapped by the FINEST spacing, and the coarse rings resampled
// 60-stud waves onto new world points every 2 studs the camera moved: the shudder Cole saw.)
// Twin of roblox-ocean/src/shared/Ocean/RingLayout.luau.
import { check, mod } from './luau.js';

/**
 * @typedef {object} RingSpec
 * @property {number} spacing studs between vertices
 * @property {number} halfExtent the ring's square runs from -halfExtent to +halfExtent
 * @property {number[]} cascades which cascades (Luau numbers, indices into the tier's sizes)
 *   this ring samples
 * @property {number[] | null} [normalCascades] which feed the VERTEX normals; null/undefined
 *   means all of them. The sampled cascades a ring leaves out of its vertices ride in the
 *   normal map instead.
 * @property {boolean} jacobian reserved for M4 foam; nothing samples it in M2
 */

/**
 * @typedef {object} Spec
 * @property {RingSpec[]} rings finest first
 * @property {number} patchCells cells per patch side, even
 * @property {number} textureTile studs per texture repeat (the design's 256)
 */

/**
 * @typedef {object} Seam Luau vertex indices (1-based)
 * @property {number} index
 * @property {number} a
 * @property {number} b
 */

/**
 * @typedef {object} Patch
 * @property {number} ring Luau ring number (1 is the finest)
 * @property {number} spacing
 * @property {number} cells
 * @property {number} centreX relative to its ring's window centre
 * @property {number} centreZ
 * @property {Float64Array} localX vertex offsets from the patch centre, shared by the ring's
 *   patches; Luau vertex v at [v - 1]
 * @property {Float64Array} localZ
 * @property {ReadonlyArray<Seam>} seams
 */

/**
 * @typedef {object} Layout
 * @property {Spec} spec
 * @property {ReadonlyArray<Readonly<Patch>>} patches
 * @property {number} vertexCount including vertices duplicated along patch edges
 */

// Vertex index of (column, row), 1-based (the Luau value), row-major, rows along z.
export function vertexIndex(cells, column, row) {
	return row * (cells + 1) + column + 1;
}

// Seam entries for one patch edge. `along(k)` gives the vertex index at position k along it.
function edgeSeams(cells, along, seams) {
	for (let k = 1; k <= cells - 1; k += 2) {
		seams.push({ index: along(k), a: along(k - 1), b: along(k + 1) });
	}
}

// The Luau freezes both lists; a non-empty Float64Array cannot be frozen, so they stay writable.
function localGrid(cells, patchSize) {
	const count = (cells + 1) * (cells + 1);
	const localX = new Float64Array(count);
	const localZ = new Float64Array(count);
	for (let row = 0; row <= cells; row++) {
		for (let column = 0; column <= cells; column++) {
			const index = vertexIndex(cells, column, row);
			localX[index - 1] = (column / cells - 0.5) * patchSize;
			localZ[index - 1] = (row / cells - 0.5) * patchSize;
		}
	}
	return [localX, localZ];
}

/**
 * @param {Spec} spec
 * @returns {Readonly<Layout>}
 */
export function build(spec) {
	const cells = spec.patchCells;
	check(cells >= 2 && mod(cells, 2) === 0, `patchCells must be even and at least 2, got ${cells}`);
	check(spec.rings.length >= 1, 'at least one ring');
	const patches = [];
	let innerHalf = 0;
	for (let ring = 1; ring <= spec.rings.length; ring++) {
		const ringSpec = spec.rings[ring - 1];
		const spacing = ringSpec.spacing;
		const half = ringSpec.halfExtent;
		const patchSize = cells * spacing;
		check(
			mod(half, patchSize) === 0,
			`ring ${ring}: halfExtent ${half} is not a multiple of the patch size ${patchSize}`,
		);
		check(half > innerHalf, `ring ${ring}: halfExtent ${half} must exceed the inner ring's ${innerHalf}`);
		const nextRing = spec.rings[ring]; // Luau spec.rings[ring + 1]
		if (nextRing) {
			check(nextRing.spacing === 2 * spacing, `ring ${ring + 1} must double the spacing of ring ${ring}`);
		}
		const [localX, localZ] = localGrid(cells, patchSize);
		const perSide = (2 * half) / patchSize;
		for (let pz = 0; pz <= perSide - 1; pz++) {
			for (let px = 0; px <= perSide - 1; px++) {
				const minX = -half + px * patchSize;
				const minZ = -half + pz * patchSize;
				const maxX = minX + patchSize;
				const maxZ = minZ + patchSize;
				// Only the ring's OUTER edges are seamed, and only when a coarser ring meets
				// them there. A ring has no inner edge: it covers its whole window and the
				// sampler skirts what the finer ring draws instead.
				const seams = [];
				if (nextRing) {
					if (maxX === half) {
						edgeSeams(cells, (k) => vertexIndex(cells, cells, k), seams);
					}
					if (minX === -half) {
						edgeSeams(cells, (k) => vertexIndex(cells, 0, k), seams);
					}
					if (maxZ === half) {
						edgeSeams(cells, (k) => vertexIndex(cells, k, cells), seams);
					}
					if (minZ === -half) {
						edgeSeams(cells, (k) => vertexIndex(cells, k, 0), seams);
					}
				}
				patches.push(
					Object.freeze({
						ring,
						spacing,
						cells,
						centreX: minX + patchSize / 2,
						centreZ: minZ + patchSize / 2,
						localX,
						localZ,
						seams: Object.freeze(seams),
					}),
				);
			}
		}
		innerHalf = half;
	}
	return Object.freeze({
		spec,
		patches: Object.freeze(patches),
		vertexCount: patches.length * (cells + 1) * (cells + 1),
	});
}

// Which rings a numbered frame writes. Every ring goes every frame except the OUTERMOST, which
// takes the even frames: 60 Hz everywhere the viewer can see detail, 30 Hz for the one ring
// whose cells are so wide and so far away that half the updates cannot show (`outerRate=1/2` on
// the tier line). A tier with a single ring has nothing to spare and writes it every frame.
// Before 2026-09-19 this was a three-step ladder (the third-from-last on even frames, the
// second-from-last on odd, the last one frame in three). Cole judged the mid-distance water
// CHOPPY under it and the machine had headroom, so everything but the outermost went back to
// 60 Hz; the saving was never the constraint.
// `ring` is the Luau ring number (1-based).
export function writesRing(ring, ringCount, frame) {
	if (ringCount < 2 || ring < ringCount) {
		return true;
	}
	return mod(frame, 2) === 0;
}

// Writes the snapped x, z into out[0..1] and returns out.
export function snapOrigin(x, z, step, out = new Float64Array(2)) {
	out[0] = Math.floor(x / step + 0.5) * step;
	out[1] = Math.floor(z / step + 0.5) * step;
	return out;
}

// Where a ring of this spacing puts its window for a viewer at (focusX, focusZ): the nearest
// multiple of TWICE the spacing. Twice, not once, so that the window's edge vertices always
// land on the next ring's lattice and the two sides of a boundary keep agreeing; the viewer is
// then never more than one cell from the centre, which is what the fade band allows for.
// Writes x, z into out[0..1] and returns out.
export function windowCentre(focusX, focusZ, spacing, out = new Float64Array(2)) {
	return snapOrigin(focusX, focusZ, 2 * spacing, out);
}

// Writes the base x, z into out[0..1] and returns out.
export function uvBase(originX, originZ, tile, out = new Float64Array(2)) {
	out[0] = Math.floor(originX / tile) * tile;
	out[1] = Math.floor(originZ / tile) * tile;
	return out;
}

// The Luau returns a Vector2; this writes [u, v] into out[0..1] and returns out.
export function uv(worldX, worldZ, baseX, baseZ, tile, out = new Float64Array(2)) {
	out[0] = (worldX - baseX) / tile;
	out[1] = (worldZ - baseZ) / tile;
	return out;
}
