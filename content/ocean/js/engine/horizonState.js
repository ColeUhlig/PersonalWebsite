// Twin of src/client/OceanCoordinator/Horizon.luau: the far sea, a frame of 2,048-stud quads
// around the surface with the middle left open for the patches. The frame follows the LAST
// ring's window centre AND takes its hole from that ring's reach, so the hole and that ring's
// square are always the same square, at every tier. Neighbouring quads OVERLAP -- that is the
// invariant the layout rests on -- so a hole wider than one quad takes MORE quads per side rather
// than bigger ones. High and Medium hole 1,016: one quad a side, a 3 x 3 grid of eight. Low hole
// 1,528: two a side, a 4 x 4 grid of twelve. UVs are world-anchored and re-based as the origin
// moves.
//
// The Luau builds one EditableMesh copy and MeshPart per quad; here each quad is plain state (its
// offset, world position and four UVs) and the renderer builds one quad geometry from CORNERS,
// TRIANGLES and QUAD_Y. The quads carry the same materials as the patches, so the far sea and
// the near water are painted by the same maps and the boundary has nothing to give it away.
import { check, mod } from '../core/luau.js';

// One quad's width: the Roblox engine's ceiling on a mesh's extents (ledger M5), kept so the
// browser draws the same frame. The grid grows instead of the quad -- see axisOffsets.
export const QUAD = 2048;
// The design's "covering to about 3,000 studs": what puts the far sea beyond the haze. Asserted
// below, because a preset that reached too short would pull the horizon in silently.
export const HORIZON_DISTANCE = 3000;
// Studs the quads tuck under the patch square's edge. The hole is the last ring's reach LESS
// this margin, so it is always smaller than that ring, never larger: the quads are given that
// ring's own window centre too, so the two squares are concentric whatever the viewer does, and
// this margin only insures against a hairline seam where two coplanar edges meet. Keep it small:
// the horizon plane sits 0.05 studs under the patches, and the last ring is flat only over its
// outermost cell, so an overlap wider than that flat strip would show the plane through the
// troughs of water that is still moving.
export const OVERLAP = 8;
// The plane's height, just under the patches (the Luau part's Position.Y).
export const QUAD_Y = -0.05;
// Corner order of the quad, (-,-), (+,-), (-,+), (+,+), in units of the half-width.
export const CORNERS = Object.freeze([
	Object.freeze([-1, -1]),
	Object.freeze([1, -1]),
	Object.freeze([-1, 1]),
	Object.freeze([1, 1]),
]);
// The quad's two triangles as 0-based CORNERS indices (the Luau { 1, 3, 2 }, { 2, 3, 4 }).
export const TRIANGLES = Object.freeze([Object.freeze([0, 2, 1]), Object.freeze([1, 2, 3])]);

// Where the quads' centres sit on ONE axis, inner to outer. The two outer rows tuck their inner
// edge exactly against the hole (`holeHalf + half`), and between them sit as many quads as it
// takes to span the hole's width, spread evenly across it: `ceil(holeHalf / half)`, which is what
// makes every neighbouring pair overlap instead of abut. One is enough while the hole is no wider
// than a quad -- High and Medium's 1,016 under a 2,048 quad gives {-2,040, 0, 2,040} -- and Low's
// 1,528 hole needs two, giving {-2,552, -764, 764, 2,552}.
function axisOffsets(holeHalf, half) {
	const perSide = Math.ceil(holeHalf / half);
	const offsets = [-(holeHalf + half)];
	for (let index = 1; index <= perSide; index++) {
		offsets.push(((2 * index - perSide - 1) * holeHalf) / perSide);
	}
	offsets.push(holeHalf + half);
	return offsets;
}

/**
 * @param {number} tile the texture tile the UVs are measured in
 * @param {number} surfaceHalfExtent the outermost ring's halfExtent: the half-width of the square
 *   the patches cover. The hole is derived from it, so every tier fits by construction and the far
 *   edge sits `surfaceHalfExtent + QUAD - OVERLAP` studs out (3,064 at High and Medium).
 */
export function create(tile, surfaceHalfExtent) {
	// Not a fit test -- the hole follows the reach -- just a floor under the arithmetic below: a
	// reach shorter than two overlaps makes the tuck-under comparable to the whole ring, and at
	// less than one it inverts.
	check(
		surfaceHalfExtent >= OVERLAP * 2,
		`the surface covers only ${surfaceHalfExtent} studs, under twice the horizon's ${OVERLAP}-stud overlap`,
	);
	const holeHalf = surfaceHalfExtent - OVERLAP;
	const half = QUAD / 2;
	const offsets = axisOffsets(holeHalf, half);
	// The invariant the layout depends on, stated out loud: neighbouring quads OVERLAP. Centres
	// exactly 2 * half apart would only touch, and any further apart leaves open water between them.
	for (let index = 2; index <= offsets.length; index++) {
		const pitch = offsets[index - 1] - offsets[index - 2];
		check(
			pitch <= 2 * half,
			`horizon quads ${index - 1} and ${index} sit ${pitch} studs apart, past their ${2 * half}-stud width: open water between them`,
		);
	}
	// And the frame reaches past the haze. The far edge is `holeHalf + 2 * half`.
	const farEdge = offsets[offsets.length - 1] + half;
	check(
		farEdge >= HORIZON_DISTANCE,
		`the horizon's far edge is ${farEdge} studs out, inside the design's ${HORIZON_DISTANCE}`,
	);
	// Every cell of the grid except the interior ones, which are the hole: a quad is made wherever
	// its row or its column is one of the two outer ones.
	const last = offsets.length;
	const quads = [];
	for (let iz = 1; iz <= last; iz++) {
		for (let ix = 1; ix <= last; ix++) {
			if (ix === 1 || ix === last || iz === 1 || iz === last) {
				quads.push({
					offsetX: offsets[ix - 1],
					offsetZ: offsets[iz - 1],
					worldX: Infinity,
					worldZ: Infinity,
					uvs: new Float32Array(CORNERS.length * 2),
					uvsChanged: false,
				});
			}
		}
	}
	return {
		quads,
		half, // a quad's half-width, which the UV maths needs as well as the layout
		tile,
		originX: Infinity,
		originZ: Infinity,
	};
}

// Follows the LAST RING's window centre, not the camera: the caller passes that ring's centre, so
// the hole and that ring's square stay the same square; any other ring's would drift away from
// the hole by up to its own step.
//
// UVs stay world-anchored and small: the whole-tile part of the origin is subtracted, so only its
// sub-tile remainder moves the pattern, and the values never grow large enough to lose precision.
// Nothing scrolls, so an origin that has not moved leaves every UV where it already is and the
// whole pass is skipped. Returns true when the frame moved.
export function update(horizon, originX, originZ) {
	if (originX === horizon.originX && originZ === horizon.originZ) {
		return false;
	}
	const tile = horizon.tile;
	horizon.originX = originX;
	horizon.originZ = originZ;
	// The quad's own half-width, from the state rather than the constant: the UVs are world
	// positions in tile units, so a corner's UV is its offset from the origin over `tile`.
	const half = horizon.half;
	// Distance from the last whole tile boundary, so the UVs carry the origin's motion without
	// carrying its magnitude.
	const fractionX = mod(originX, tile);
	const fractionZ = mod(originZ, tile);
	for (const quad of horizon.quads) {
		quad.worldX = originX + quad.offsetX;
		quad.worldZ = originZ + quad.offsetZ;
		const uvs = quad.uvs;
		for (let index = 0; index < CORNERS.length; index++) {
			const corner = CORNERS[index];
			uvs[index * 2] = (fractionX + quad.offsetX + corner[0] * half) / tile;
			uvs[index * 2 + 1] = (fractionZ + quad.offsetZ + corner[1] * half) / tile;
		}
		quad.uvsChanged = true;
	}
	return true;
}

// A quad's world centre, written into out[0..1]. Meaningless until the first update, before which
// the origin is still the Infinity `create` starts at.
export function quadCentre(horizon, quad, out = new Float64Array(2)) {
	out[0] = horizon.originX + quad.offsetX;
	out[1] = horizon.originZ + quad.offsetZ;
	return out;
}
