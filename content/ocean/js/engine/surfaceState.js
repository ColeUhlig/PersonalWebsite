// Twin of src/client/OceanCoordinator/Surface.luau: the surface's patches, as plain state the
// renderer binds straight into vertex buffers. Where the Luau keeps one fixed-size EditableMesh
// and MeshPart per patch, this keeps one set of typed arrays per patch (positions and normals,
// written by the sampler each frame, and world-anchored UVs, rewritten when the patch's ring
// moves) plus the patch's world position. The template mesh, the id checks, the corner push-out
// and every part property are Roblox-only and gone: the renderer gives each patch an explicit
// bounding sphere instead. `Transparency` becomes the `hidden` flag and `BatchSetValues` becomes
// the `written` / `uvsChanged` flags, which the renderer clears once it has uploaded.
//
// Shape only: nothing here writes a colour. The sea's colour is the shared colour map every
// patch material samples. The UVs are the part of this file the maps depend on: they are
// anchored to the world and re-based by whole texture tiles when a ring moves, so the maps stay
// still on the water while the lattice slides under them.
//
// Each RING has its own window centre, snapped to twice its own spacing (RingLayout's
// windowCentre), and its patches sit at that centre plus their patch centre. A ring only moves
// when the viewer crosses one of ITS steps: the coarse rings therefore hold still while the near
// ones shift, every vertex stays on its ring's world lattice, and nothing re-interpolates as the
// viewer walks. Moving a ring means moving its patches and rewriting their world-anchored UVs;
// both reach the renderer in the same frame as the vertex rewrite, so a shift is invisible.
//
// The rings overlap rather than leaving a hole for the finer ones. The sampler drops every
// vertex inside the next finer ring's window to `skirtY`, which hangs the covered coarse
// triangles as a vertical skirt under the finer ring's edge where the water hides them, and
// reports a patch whose vertices are ALL covered; those are hidden and not written at all until
// they are needed again.
//
// Only the OUTERMOST ring is refreshed less often than the rest (`outerRate=1/2` on the tier
// line; the rule is RingLayout.writesRing): it takes the even frames, 30 Hz against 60 for every
// ring inside it. The geometry is not changed, only rewritten less often, and the exceptions keep
// that invisible: a frame on which ANY ring's window shifted writes every ring (a ring that
// shifted must be rewritten in the same step its patches move, and a patch only stops being
// covered by a finer ring when a window moves), and so does the first write, before which a ring
// still holds its flat starting grid.
//
// `write` tracks the real extremes each frame against `bounds`, so a displacement past the
// bounding volume the renderer was given shows up as a number instead of as patches popping.
import * as RingLayout from '../core/ringLayout.js';
import * as SurfaceSampler from '../core/surfaceSampler.js';
import { check } from '../core/luau.js';

// How far above the bottom of the patch's bounds the skirt hangs. A skirt at exactly
// -bounds.height would sit on the boundary; two studs of margin keeps it inside.
export const SKIRT_MARGIN = 2;

// Scratch for the snapping and UV maths; every use is synchronous and finished before it returns.
const CENTRE_OUT = new Float64Array(2);
const BASE_OUT = new Float64Array(2);
const UV_OUT = new Float64Array(2);

// A patch's starting state: the flat grid at its local positions, so a patch looks flat before
// its first write (the Luau template's non-corner vertices), normals up, UVs zero until placed.
function patchState(patch) {
	const cells = patch.cells;
	const patchSize = cells * patch.spacing;
	const count = (cells + 1) * (cells + 1);
	const positions = new Float32Array(count * 3);
	const normals = new Float32Array(count * 3);
	for (let row = 0; row <= cells; row++) {
		for (let column = 0; column <= cells; column++) {
			const o = (RingLayout.vertexIndex(cells, column, row) - 1) * 3;
			positions[o] = (column / cells - 0.5) * patchSize;
			positions[o + 2] = (row / cells - 0.5) * patchSize;
			normals[o + 1] = 1;
		}
	}
	return {
		patch,
		ring: patch.ring,
		half: patchSize / 2, // the edge the lateral overshoot is measured from
		hidden: false, // entirely under a finer ring: not drawn and not written
		positions,
		normals,
		uvs: new Float32Array(count * 2),
		worldX: patch.centreX,
		worldZ: patch.centreZ,
		written: false,
		uvsChanged: false,
	};
}

function checkBounds(bounds) {
	check(
		bounds.height > SKIRT_MARGIN && bounds.lateral > 0,
		`patch bounds must be positive, got lateral=${bounds.lateral} height=${bounds.height}: the skirt hangs ${SKIRT_MARGIN} studs above the bottom of the bounds`,
	);
}

function contextsFor(specs) {
	return Object.freeze(specs.map((spec, i) => SurfaceSampler.ringContext(spec, specs[i + 1])));
}

/**
 * @param {import('../core/ringLayout.js').Layout} layout
 * @param {{ height: number, lateral: number }} bounds studs above and below sea level, and past
 *   the patch edge, the renderer's bounding volume contains
 * @param {boolean} flatNormals normals stay up and are never rewritten
 */
export function create(layout, bounds, flatNormals) {
	checkBounds(bounds);
	const ringCount = layout.spec.rings.length;
	const byRing = [];
	const centres = [];
	const dirty = [];
	for (let ring = 1; ring <= ringCount; ring++) {
		byRing.push([]);
		// No window yet: the first snap moves every ring.
		centres.push(Object.freeze({ x: Infinity, z: Infinity }));
		dirty.push(false);
	}
	const patches = [];
	for (const patch of layout.patches) {
		const state = patchState(patch);
		patches.push(state);
		byRing[patch.ring - 1].push(state);
	}
	const surface = {
		layout,
		patches,
		byRing, // the same states as `patches`, in the same order, grouped by ring
		bounds,
		flatNormals,
		// Through float32, so the value the sampler writes into a Float32Array and the value
		// `write` compares against are the same and a skirted vertex is recognised exactly.
		skirtY: Math.fround(-(bounds.height - SKIRT_MARGIN)),
		centres, // one window centre per ring, centres[ring - 1]
		dirty, // rings whose centre changed and whose patches have not moved yet
		everWritten: false, // false until a write has covered every ring at least once
		focusX: 0, // the viewer the current centres and fades were computed for
		focusZ: 0,
		// Worst case seen since the caller last took them, so the report can prove the bounds hold.
		maxAbsY: 0,
		maxLateral: 0,
		// Seconds the last snapAndWrite spent moving patches (0 when no ring moved): the Luau
		// returns it as snapAndWrite's second value, and the coordinator charges it to `snap`.
		snapSeconds: 0,
		// The cascades each ring samples, filtered by setRingCascades (all of them until then), and
		// the sampler's per-ring working for those lists, worked out once per change rather than once
		// per ring per frame.
		ringSpecs: layout.spec.rings,
		contexts: contextsFor(layout.spec.rings),
		// Set by a change the next write must cover whole: new ring lists, bounds or normals.
		stale: false,
		// Bumped by setBounds, so the renderer knows to refit its bounding spheres.
		boundsVersion: 0,
		// True when the last snapAndWrite had nothing to do: a still surface whose windows held.
		skipped: false,
		// Whether the last snapAndWrite wrote a still surface. The first still frame after a live one
		// is written whole: the outer ring still carries the live geometry.
		wasStill: false,
	};
	snap(surface, 0, 0);
	return surface;
}

// Moves one ring's patches to its window centre and rewrites their world-anchored UVs. Only this
// ring's patches are touched: a ring that did not move must not have its UVs rebased, or the
// texture would slide on rings that are meant to be standing still.
function repositionRing(surface, ring) {
	const centre = surface.centres[ring - 1];
	const tile = surface.layout.spec.textureTile;
	RingLayout.uvBase(centre.x, centre.z, tile, BASE_OUT);
	const baseX = BASE_OUT[0];
	const baseZ = BASE_OUT[1];
	for (const state of surface.byRing[ring - 1]) {
		const patch = state.patch;
		const centreX = centre.x + patch.centreX;
		const centreZ = centre.z + patch.centreZ;
		state.worldX = centreX;
		state.worldZ = centreZ;
		const uvs = state.uvs;
		const localX = patch.localX;
		const localZ = patch.localZ;
		for (let index = 1; index <= localX.length; index++) {
			RingLayout.uv(centreX + localX[index - 1], centreZ + localZ[index - 1], baseX, baseZ, tile, UV_OUT);
			uvs[(index - 1) * 2] = UV_OUT[0];
			uvs[(index - 1) * 2 + 1] = UV_OUT[1];
		}
		state.uvsChanged = true;
	}
}

function repositionDirty(surface) {
	const dirty = surface.dirty;
	for (let ring = 1; ring <= dirty.length; ring++) {
		if (dirty[ring - 1]) {
			repositionRing(surface, ring);
			dirty[ring - 1] = false;
		}
	}
}

// Takes each ring's window centre for this viewer and marks the ones that changed. Returns how
// many rings moved; their patches are still where they were until repositionDirty runs.
function adopt(surface, focusX, focusZ) {
	surface.focusX = focusX;
	surface.focusZ = focusZ;
	const rings = surface.layout.spec.rings;
	let moved = 0;
	for (let ring = 1; ring <= rings.length; ring++) {
		RingLayout.windowCentre(focusX, focusZ, rings[ring - 1].spacing, CENTRE_OUT);
		const x = CENTRE_OUT[0];
		const z = CENTRE_OUT[1];
		const centre = surface.centres[ring - 1];
		if (x !== centre.x || z !== centre.z) {
			surface.centres[ring - 1] = Object.freeze({ x, z });
			surface.dirty[ring - 1] = true;
			moved += 1;
		}
	}
	return moved;
}

// Adopts the windows for a viewer and moves the rings that changed. Returns how many rings
// moved. Used to place the patches at start-up; the frame loop uses snapAndWrite instead, which
// orders the two writes.
export function snap(surface, focusX, focusZ) {
	const moved = adopt(surface, focusX, focusZ);
	if (moved > 0) {
		repositionDirty(surface);
	}
	return moved;
}

// Has a window moved this frame? `adopt` marks the rings it moved and `repositionDirty` clears
// the marks after the write, so inside a write these flags mean "shifted in this very step".
function anyDirty(surface) {
	for (const dirty of surface.dirty) {
		if (dirty) {
			return true;
		}
	}
	return false;
}

// Worst case this frame, against the patch's half-width. Skirted vertices are at a known depth
// and say nothing about the waves. Returns nothing; folds into surface.maxAbsY / maxLateral.
function scanExtremes(surface, state) {
	const positions = state.positions;
	const half = state.half;
	const skirtY = surface.skirtY;
	let maxAbsY = surface.maxAbsY;
	let maxLateral = surface.maxLateral;
	for (let o = 0; o < positions.length; o += 3) {
		const y = positions[o + 1];
		if (y !== skirtY) {
			if (y > maxAbsY || -y > maxAbsY) {
				maxAbsY = Math.abs(y);
			}
			const overshootX = Math.abs(positions[o]) - half;
			const overshootZ = Math.abs(positions[o + 2]) - half;
			if (overshootX > maxLateral) {
				maxLateral = overshootX;
			}
			if (overshootZ > maxLateral) {
				maxLateral = overshootZ;
			}
		}
	}
	surface.maxAbsY = maxAbsY;
	surface.maxLateral = maxLateral;
}

// One ring's patches through the sampler, with the hidden transitions.
function writeRing(surface, ring, store, swells, t, chop) {
	// The FILTERED ring specs (setRingCascades): the same spacing and reach as the layout's, with
	// only the cascades that are switched on, and their contexts worked out when they changed.
	const rings = surface.ringSpecs;
	const ringSpec = rings[ring - 1];
	const nextRingSpec = rings[ring]; // Luau rings[ring + 1]; undefined on the last ring
	const context = surface.contexts[ring - 1];
	const halfExtent = ringSpec.halfExtent;
	const centre = surface.centres[ring - 1];
	// The next FINER ring's window, whose ground this ring skirts. Ring 1 has none, and an
	// innerHalf of 0 skirts nothing.
	const inner = ring > 1 ? surface.centres[ring - 2] : null;
	const innerX = inner ? inner.x : 0;
	const innerZ = inner ? inner.z : 0;
	const innerHalf = ring > 1 ? rings[ring - 2].halfExtent : 0;
	for (const state of surface.byRing[ring - 1]) {
		const covered = SurfaceSampler.fill(
			state.patch,
			ringSpec,
			nextRingSpec,
			halfExtent,
			store,
			swells,
			t,
			chop,
			centre.x,
			centre.z,
			surface.focusX,
			surface.focusZ,
			innerX,
			innerZ,
			innerHalf,
			surface.skirtY,
			state.positions,
			state.normals,
			surface.flatNormals,
			context,
		);
		if (covered) {
			// Entirely under the finer ring: leave it hidden and unwritten until the window
			// moves off it.
			state.hidden = true;
			continue;
		}
		state.hidden = false;
		scanExtremes(surface, state);
		state.written = true;
	}
}

// Positions, and normals when they are not flat: nothing here writes a colour. With flatNormals
// the normals are never rewritten either: they start up and the normal map alone tilts the light.
// `frame` is the caller's frame counter and is what halves the outermost ring's rate (see the
// note at the top of this file). Leave it out and every ring is written, which is what a
// one-shot caller wants.
export function write(surface, store, swells, t, chop, frame) {
	// Unnumbered frames, the first write and any frame on which a window shifted write the lot;
	// otherwise the outermost ring sits out the odd frames.
	const everyRing = frame == null || !surface.everWritten || anyDirty(surface);
	const ringCount = surface.layout.spec.rings.length;
	// Ring by ring, not patch by patch: a ring's window, the finer window it skirts and the
	// sampler's per-ring working are the same for every one of its patches, so they are worked
	// out once per ring instead of once per patch.
	for (let ring = 1; ring <= ringCount; ring++) {
		if (!everyRing && !RingLayout.writesRing(ring, ringCount, frame)) {
			continue;
		}
		writeRing(surface, ring, store, swells, t, chop);
	}
	if (everyRing) {
		surface.everWritten = true;
	}
}

// Reads the worst case since the last call and starts a fresh window. Returns [maxAbsY, maxLateral].
export function takeExtremes(surface) {
	const extremes = [surface.maxAbsY, surface.maxLateral];
	surface.maxAbsY = 0;
	surface.maxLateral = 0;
	return extremes;
}

/**
 * Which cascades the rings sample (A3's layer switches): enabled[c - 1] for Luau cascade c. A
 * cascade switched off leaves every ring's list and its vertex normals, and the fades follow, since
 * each ring fades what the next one out no longer samples. All off leaves every ring with an empty
 * list, which is how the teaching sources draw: their waves come through the swells bank alone.
 * @param {ReadonlyArray<boolean>} enabled
 */
export function setRingCascades(surface, enabled) {
	const on = (cascadeIndex) => enabled[cascadeIndex - 1] === true;
	const specs = surface.layout.spec.rings.map((ring) =>
		Object.freeze({
			...ring,
			cascades: Object.freeze(ring.cascades.filter(on)),
			normalCascades: Object.freeze((ring.normalCascades ?? ring.cascades).filter(on)),
		}),
	);
	surface.ringSpecs = Object.freeze(specs);
	surface.contexts = contextsFor(specs);
	surface.stale = true;
}

/**
 * New bounds (they grow when a slider raises the sea: bounds.js). The skirt moves with them, so the
 * next write is whole, and `boundsVersion` tells the renderer to refit its bounding spheres.
 * @param {{ lateral: number, height: number }} bounds
 */
export function setBounds(surface, bounds) {
	checkBounds(bounds);
	surface.bounds = Object.freeze({ lateral: bounds.lateral, height: bounds.height });
	surface.skirtY = Math.fround(-(bounds.height - SKIRT_MARGIN));
	surface.boundsVersion += 1;
	surface.stale = true;
}

// Whether the vertex normals are written: not while the look is unlit (white or flat colour) or
// the config asks for flat normals. Turning them back on rewrites them on the next write.
// Turning flat normals on leaves the previous normals in the buffers, which is fine only because
// flat normals are used by unlit looks.
export function setFlatNormals(surface, flat) {
	if (surface.flatNormals === flat) {
		return;
	}
	surface.flatNormals = flat;
	surface.stale = true;
}

// One frame of the surface, with the two writes in a deliberate order. The new windows are
// adopted FIRST, so the vertices written this frame are the ones that belong where the patches
// are about to be, and only then do the patches move. Returns how many rings shifted; the time
// the move took is left in `surface.snapSeconds` (the Luau's second return value).
// `still` (A3) says nothing on the surface moves by itself -- the flat plane of step 1 -- so once
// every ring has been written, a frame on which no window shifted and nothing set the surface
// stale writes nothing at all (`surface.skipped`). A stale surface is written whole, and so is the
// first still frame after a live one: the frames after it are skipped, so it must leave no ring
// (the half-rate outer ring above all) holding the live geometry.
export function snapAndWrite(surface, focusX, focusZ, store, swells, t, chop, frame, still = false) {
	const moved = adopt(surface, focusX, focusZ);
	surface.skipped = still && surface.wasStill && moved === 0 && surface.everWritten && !surface.stale;
	if (!surface.skipped) {
		const whole = surface.stale || (still && !surface.wasStill);
		// `adopt` has already marked the rings that shifted, so the write sees them and covers every
		// ring on this frame; `repositionDirty` below clears the marks once it is done.
		write(surface, store, swells, t, chop, whole ? undefined : frame);
		surface.stale = false;
		surface.wasStill = still;
	}
	surface.snapSeconds = 0;
	if (moved > 0) {
		const started = performance.now();
		repositionDirty(surface);
		surface.snapSeconds = (performance.now() - started) / 1000;
	}
	return moved;
}
