// Turns display tables and swells into one patch's vertex positions and normals. Positions
// are patch-local (the patch's mesh sits at its ring's window centre + the patch centre).
// Hot path: allocates nothing per vertex (the Cascade and Swells samplers write into
// module-level scratch), only the small per-cascade boolean tables a caller without a
// `ringContext` leaves it to work out once per call; the caller owns the arrays.
//
// Ring fades. Two rings that meet must agree on the height along their shared edge, and the
// outermost ring must meet the flat horizon plane. Both are one mechanism: over a band at the
// ring's edge a fade f runs from 1 down to 0, and
//   * a cascade the next ring out does NOT sample is multiplied by f, so it has died away by
//     the boundary and the coarse side, which never had it, matches. The distance is measured
//     from the FOCUS (Chebyshev, so the band is square) and f reaches 0 one cell inside the
//     ring's extent: each ring's window is snapped to its own lattice, so the boundary itself
//     sits up to a cell from the viewer's square, and a window-relative fade would put a
//     different weight on each side of it. Band: the ring's outer quarter, wide enough that
//     the cascade leaves gradually rather than popping;
//   * on the last ring (no next ring) every cascade AND the swell terms are multiplied by f,
//     so the outer cell flattens to sea level and meets the horizon instead of dipping below
//     it. That one is measured from the FOCUS too, and reaches 0 TWO cells inside the extent
//     over a band FLATTEN_CELLS cells wide. Two cells inside, because the window snaps to
//     2 * spacing and so sits up to a cell from the viewer's own square: two cells of margin
//     flatten the WHOLE outermost cell whatever the offset, which is what the horizon plane
//     (tucked under that edge) needs -- a band that only reached 0 exactly at the edge still
//     left a quarter of the amplitude over the join at scale 8, and open water showed. From the
//     focus, because a window-relative band jumped a whole window step (64 studs at High) each
//     time the last ring shifted, and Cole saw the far silhouette pop. The WIDTH is in cells of
//     that ring rather than a fraction of it or a fixed distance: a quarter of the last ring is
//     256 studs at High, which Cole saw as a bright mirror-smooth strip against the darker
//     horizon, and the fixed 64 studs that replaced it was two cells only at High -- half a cell
//     on Low's 128-stud last ring, which is a fade so abrupt it is nearly a step, and a quarter
//     of a cell if a tier ever reached wider. Two cells is 64 studs at High (unchanged), 128 at
//     Medium and 256 at Low.
// Seam averaging still runs afterwards, over two already-faded even neighbours.
//
// The skirt. Every ring draws its whole square, so each one also covers the ground the finer
// rings are drawing in detail. A vertex strictly inside the finer ring's window is not sampled
// at all: it is written straight down at `skirtY`, which folds the coarse triangles into a
// vertical skirt hanging under the finer ring's outer edge, out of sight from above the water.
// `fill` returns true when EVERY vertex went into the skirt, which is the caller's signal to
// hide the patch and stop writing it. A ring's outer edge is never skirted: the gap between the
// finer window's reach and this ring's boundary is at least (cells - 3) cells of the finer ring,
// so seam averaging never touches a skirted vertex.
// What a vertex normal sums. The ring's `normalCascades`, not everything it samples: from M3 the
// finer cascades ride in the NORMAL MAP, which carries them at the texel resolution of the
// 256-stud tile rather than at the ring's vertex spacing, so a ring samples them for height and
// chop displacement and leaves their slopes out of the normal. (At High that is the 64-stud
// cascade on the 8-stud ring: 1.3 samples across its longest wave, a vertex tilted by whatever
// the lattice happened to catch.) A null list means every cascade the ring samples, the M2
// behaviour. Positions never depend on the list, and fading is unchanged: a cascade left out of
// the normals still fades out of the height at the ring's edge.
// Flat mode (`flat = true`): every vertex normal stays up, so no slopes or normals are computed
// at all, height and displacement only, the cheapest path. It was M2's look, where the colour
// ramp drew the whole shape; from M3 what tilts the light in it is the normal map.
//
// Positions and normals are Float32Arrays of xyz triples: Luau vertex v (RingLayout.vertexIndex)
// at (v - 1) * 3. The store rounds each component to float32, as a Vector3 does.
// Twin of roblox-ocean/src/shared/Ocean/SurfaceSampler.luau.
import * as Cascade from './cascade.js';
import * as Swells from './swells.js';
import { clamp } from './luau.js';

const FADE_FRACTION = 0.25; // dropped cascades fade over the outer quarter of their ring
const FLATTEN_CELLS = 2; // cells of the LAST ring the flatten rises over; see the header

// Per-vertex scratch for the samplers' multiple returns. Shared at module level, so fill() is
// not reentrant (single-threaded use only).
const HEIGHT_OUT = new Float64Array(3);
const CASCADE_OUT = new Float64Array(5);
const SWELL_OUT = new Float64Array(7);

/**
 * Everything `fill` can work out from the RING rather than from the patch. A ring has tens of
 * patches (224 across the five rings at the High tier) and `fill` was deciding all of this, and
 * allocating the `fades` table, on every one of them; the caller hoists it out of its patch loop
 * with `ringContext` and hands it back. Frozen: it is the same answer for the whole tier.
 * @typedef {object} RingContext
 * @property {ReadonlyArray<boolean>} fades fades[c - 1] for Luau cascade c: true when this
 *   cascade fades out at the ring's edge
 * @property {ReadonlyArray<boolean>} slopes slopes[c - 1]: true when cascade c tilts the vertex
 *   normals
 * @property {boolean} last nothing follows this ring, so the swells fade with the cascades
 * @property {number} fadeWidth studs the fade runs over
 * @property {number} fadeEdge distance from the focus at which it reaches 0
 */

function contains(list, value) {
	for (const entry of list) {
		if (entry === value) {
			return true;
		}
	}
	return false;
}

// A dense boolean array long enough to answer for every Luau cascade number in `list`, false
// where the Luau table would hold nil.
function flagsFor(list) {
	let largest = 0;
	for (const cascadeIndex of list) {
		largest = Math.max(largest, cascadeIndex);
	}
	return new Array(largest).fill(false);
}

// Which of this ring's cascades die away at its edge: the ones the next ring out does not
// sample, so that both sides of the boundary compute the same height there. The last ring fades
// everything (nothing follows it to agree with; it meets the flat horizon instead).
function fadingCascades(ringSpec, nextRingSpec) {
	const fades = flagsFor(ringSpec.cascades);
	for (const cascadeIndex of ringSpec.cascades) {
		fades[cascadeIndex - 1] = !(nextRingSpec != null && contains(nextRingSpec.cascades, cascadeIndex));
	}
	return fades;
}

// Which of this ring's cascades tilt its vertices: `normalCascades`, or every cascade it samples
// when the ring names none. A table rather than a search, because the vertex loop asks the
// question once per cascade per vertex and the answer is the ring's for as long as it lives.
function slopeCascades(ringSpec) {
	const list = ringSpec.normalCascades ?? ringSpec.cascades;
	const slopes = flagsFor(list);
	for (const cascadeIndex of list) {
		slopes[cascadeIndex - 1] = true;
	}
	return slopes;
}

/**
 * The ring's share of `fill`'s working, computed once. The fade band comes from the ring's own
 * `halfExtent` and `spacing` -- and `halfExtent` is the half-extent every caller passes `fill`
 * for that ring -- so a context and a bare call describe the same band.
 * @param {import('./ringLayout.js').RingSpec} ringSpec
 * @param {import('./ringLayout.js').RingSpec | null} [nextRingSpec] null on the last ring
 * @returns {Readonly<RingContext>}
 */
export function ringContext(ringSpec, nextRingSpec) {
	const last = nextRingSpec == null;
	const halfExtent = ringSpec.halfExtent;
	return Object.freeze({
		fades: Object.freeze(fadingCascades(ringSpec, nextRingSpec)),
		slopes: Object.freeze(slopeCascades(ringSpec)),
		last,
		fadeWidth: last ? FLATTEN_CELLS * ringSpec.spacing : halfExtent * FADE_FRACTION,
		fadeEdge: halfExtent - (last ? 2 : 1) * ringSpec.spacing,
	});
}

/**
 * @param {import('./ringLayout.js').Patch} patch
 * @param {import('./ringLayout.js').RingSpec} ringSpec
 * @param {import('./ringLayout.js').RingSpec | null | undefined} nextRingSpec null on the last ring
 * @param {number} halfExtent this ring's
 * @param {import('./fieldStore.js').Store} store
 * @param {Readonly<import('./swells.js').Bank>} swells
 * @param {number} t
 * @param {number} chop
 * @param {number} centreX this ring's window centre; vertex world = centre + patch centre + local
 * @param {number} centreZ
 * @param {number} focusX the viewer, which every fade follows
 * @param {number} focusZ
 * @param {number} innerCentreX the next FINER ring's window, whose vertices this ring skirts
 * @param {number} innerCentreZ
 * @param {number} innerHalf 0 on the finest ring: nothing is finer, so nothing is skirted
 * @param {number} skirtY
 * @param {Float32Array} positions patchVertexCount * 3
 * @param {Float32Array} normals patchVertexCount * 3
 * @param {boolean} [flat] true: positions only; normals are left untouched (flat lighting)
 * @param {Readonly<RingContext>} [context] the ring's share of the working, from ringContext
 * @returns {boolean} true when every vertex was skirted and the patch does not need drawing
 */
export function fill(
	patch,
	ringSpec,
	nextRingSpec,
	halfExtent,
	store,
	swells,
	t,
	chop,
	centreX,
	centreZ,
	focusX,
	focusZ,
	innerCentreX,
	innerCentreZ,
	innerHalf,
	skirtY,
	positions,
	normals,
	flat,
	context,
) {
	const patchX = centreX + patch.centreX;
	const patchZ = centreZ + patch.centreZ;
	const localX = patch.localX;
	const localZ = patch.localZ;
	const count = localX.length;
	const cascades = ringSpec.cascades;
	const cascadeCount = cascades.length;
	const display = store.display;
	// A ring either has a next ring (dropped cascades fade over its outer quarter, ending a cell
	// inside the extent) or is the last one (everything fades over FLATTEN_CELLS of its own
	// cells, ending TWO cells inside the extent so the whole outer cell is flat), so one band
	// serves the whole call. Both are measured from the FOCUS, never from the snapped window.
	// A caller with many patches on this ring hands all of it over in a context instead of having
	// it worked out again per patch; without one this call answers the same questions for itself.
	const last = context ? context.last : nextRingSpec == null;
	const fadeWidth = context
		? context.fadeWidth
		: last
			? FLATTEN_CELLS * ringSpec.spacing
			: halfExtent * FADE_FRACTION;
	const fadeEdge = context ? context.fadeEdge : halfExtent - (last ? 2 : 1) * ringSpec.spacing;
	// Which of this ring's cascades fade, so the vertex loop only reads a boolean.
	const fades = context ? context.fades : fadingCascades(ringSpec, nextRingSpec);
	const swellWeighted = last;
	let skirted = 0;
	// Swells that are all zero amplitude cost four trig calls a vertex for nothing. The bank
	// decided this in Swells.create, so the read is a field, not a scan of the pack.
	const silentSwells = Swells.isSilent(swells);
	if (flat) {
		for (let index = 1; index <= count; index++) {
			const o = (index - 1) * 3;
			const lx = localX[index - 1];
			const lz = localZ[index - 1];
			const wx = patchX + lx;
			const wz = patchZ + lz;
			if (Math.abs(wx - innerCentreX) < innerHalf && Math.abs(wz - innerCentreZ) < innerHalf) {
				positions[o] = lx;
				positions[o + 1] = skirtY;
				positions[o + 2] = lz;
				skirted += 1;
				continue;
			}
			const distance = Math.max(Math.abs(wx - focusX), Math.abs(wz - focusZ));
			const fade = clamp((fadeEdge - distance) / fadeWidth, 0, 1);
			let height = 0;
			let dispX = 0;
			let dispZ = 0;
			for (let i = 0; i < cascadeCount; i++) {
				const cascadeIndex = cascades[i];
				const s = Cascade.sampleHeight(display[cascadeIndex - 1], wx, wz, HEIGHT_OUT);
				const weight = fades[cascadeIndex - 1] ? fade : 1;
				height += s[0] * weight;
				dispX += s[1] * chop * weight;
				dispZ += s[2] * chop * weight;
			}
			if (silentSwells) {
				positions[o] = lx + dispX;
				positions[o + 1] = height;
				positions[o + 2] = lz + dispZ;
			} else {
				const swell = Swells.sample(swells, t, wx, wz, chop, SWELL_OUT);
				const swellWeight = swellWeighted ? fade : 1;
				positions[o] = lx + dispX + swell[0] * swellWeight;
				positions[o + 1] = height + swell[1] * swellWeight;
				positions[o + 2] = lz + dispZ + swell[2] * swellWeight;
			}
		}
		if (skirted === count) {
			return true;
		}
		for (const seam of patch.seams) {
			const s = (seam.index - 1) * 3;
			const a = (seam.a - 1) * 3;
			const b = (seam.b - 1) * 3;
			positions[s] = (positions[a] + positions[b]) * 0.5;
			positions[s + 1] = (positions[a + 1] + positions[b + 1]) * 0.5;
			positions[s + 2] = (positions[a + 2] + positions[b + 2]) * 0.5;
		}
		return false;
	}
	// Which of this ring's cascades tilt the vertices. Only the full path asks: flat mode writes
	// no normals, so it is not made to allocate the table (this is the one piece of the working
	// the two paths do not share).
	const slopes = context ? context.slopes : slopeCascades(ringSpec);
	for (let index = 1; index <= count; index++) {
		const o = (index - 1) * 3;
		const lx = localX[index - 1];
		const lz = localZ[index - 1];
		const wx = patchX + lx;
		const wz = patchZ + lz;
		if (Math.abs(wx - innerCentreX) < innerHalf && Math.abs(wz - innerCentreZ) < innerHalf) {
			positions[o] = lx;
			positions[o + 1] = skirtY;
			positions[o + 2] = lz;
			// Vector3.yAxis
			normals[o] = 0;
			normals[o + 1] = 1;
			normals[o + 2] = 0;
			skirted += 1;
			continue;
		}
		const distance = Math.max(Math.abs(wx - focusX), Math.abs(wz - focusZ));
		const fade = clamp((fadeEdge - distance) / fadeWidth, 0, 1);
		let height = 0;
		let dispX = 0;
		let dispZ = 0;
		let slopeX = 0;
		let slopeZ = 0;
		for (let i = 0; i < cascadeCount; i++) {
			const cascadeIndex = cascades[i];
			const s = Cascade.sampleNoJacobian(display[cascadeIndex - 1], wx, wz, CASCADE_OUT);
			const weight = fades[cascadeIndex - 1] ? fade : 1;
			height += s[0] * weight;
			dispX += s[1] * chop * weight;
			dispZ += s[2] * chop * weight;
			// A cascade the normal map carries displaces this vertex and does not tilt it.
			if (slopes[cascadeIndex - 1]) {
				slopeX += s[3] * weight;
				slopeZ += s[4] * weight;
			}
		}
		if (silentSwells) {
			positions[o] = lx + dispX;
			positions[o + 1] = height;
			positions[o + 2] = lz + dispZ;
			writeUnit(normals, o, -slopeX, 1, -slopeZ);
			continue;
		}
		const swell = Swells.sample(swells, t, wx, wz, chop, SWELL_OUT);
		const swellWeight = swellWeighted ? fade : 1;
		positions[o] = lx + dispX + swell[0] * swellWeight;
		positions[o + 1] = height + swell[1] * swellWeight;
		positions[o + 2] = lz + dispZ + swell[2] * swellWeight;
		// The swell normal (nx, ny, nz) = swell[3..5] encodes slope -nx/ny, which adds to the
		// cascade slopes.
		const ny = swell[4];
		writeUnit(
			normals,
			o,
			-slopeX + (swell[3] / ny) * swellWeight,
			1,
			-slopeZ + (swell[5] / ny) * swellWeight,
		);
	}
	if (skirted === count) {
		return true;
	}
	for (const seam of patch.seams) {
		const s = (seam.index - 1) * 3;
		const a = (seam.a - 1) * 3;
		const b = (seam.b - 1) * 3;
		positions[s] = (positions[a] + positions[b]) * 0.5;
		positions[s + 1] = (positions[a + 1] + positions[b + 1]) * 0.5;
		positions[s + 2] = (positions[a + 2] + positions[b + 2]) * 0.5;
		writeUnit(
			normals,
			s,
			normals[a] + normals[b],
			normals[a + 1] + normals[b + 1],
			normals[a + 2] + normals[b + 2],
		);
	}
	return false;
}

// Vector3.new(x, y, z).Unit written at out[o..o + 2]: normalised in doubles, rounded to float32
// by the store.
function writeUnit(out, o, x, y, z) {
	const length = Math.sqrt(x * x + y * y + z * z);
	out[o] = x / length;
	out[o + 1] = y / length;
	out[o + 2] = z / length;
}
