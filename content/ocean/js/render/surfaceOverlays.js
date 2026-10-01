// Arrows on the surface (piece C2; lane C owns this file; spec 10.7 steps 5, 8 and 9): each wave's
// heading (step 5), the surface's normals with the tangent and binormal (step 8), and the
// central-difference normal beside each exact one, with their mean angle (step 9, Task 6), and, as
// the 'tiles' kind, the tile's edges on step 13 (Task 15, render/tileEdges.js). The
// arrows come from page/overlayModel.js, read from the waves the surface is written from; each is a
// thin cylinder and a cone, two instanced meshes for every arrow at once. Everything is made once; a frame writes
// matrices and colours into the instance buffers and allocates nothing. An arrow that is not finite
// (it never should be) is drawn at zero size and reported through probe().finite. With no overlay
// (every other step) a frame returns at once once the meshes are hidden: no sampling, no upload, no draw.
import * as THREE from 'three';
import { ARROW_STRIDE, COLOURS, MAX_ARROWS, PALETTE_HEX, WIDE_GRID_OFFSET, directionArrows, normalArrows, slopeArrows } from '../page/overlayModel.js';
import { NARROW_QUERY } from '../page/scrollMap.js';
import { createTileEdges } from './tileEdges.js';

// The model's colours (one per role, then one per wave heading), as three.js colours.
const PALETTE = PALETTE_HEX.map((hex) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace));
const HEAD_LENGTH = 0.6;
// How much thicker the heading arrows are than the normals: they are seen from about 90 studs away
// (the directions shot), the normals from about 40, and must read at 390 px wide.
const HEADING_THICKNESS = 5;
// The normals' (and the tangent's, binormal's and difference's) shafts against the base cylinder: a
// shaft of one is about a pixel wide on a phone.
const NORMAL_SHAFT = 1.5;
// The frame (n, T and B at the grid's centre): thicker still, so it reads among the grid's normals.
const FRAME_SHAFT = 2.5;
const FRAME_HEAD = 1.6;
// The central-difference arrow: thinner than the exact one beside it, its head smaller, so where the
// two coincide the exact one shows round it and the difference's longer tip shows past it.
const DIFFERENCE_SHAFT = 1;
const DIFFERENCE_HEAD = 0.85;
// Head and shaft girths by role (COLOURS: normal, tangent, binormal, difference); the frame normal
// takes the tangent's and binormal's; every heading (COLOURS.WAVE up to the frame normal) takes
// HEADING_THICKNESS for both.
const HEADS = Object.freeze([1, FRAME_HEAD, FRAME_HEAD, DIFFERENCE_HEAD]);
const SHAFTS = Object.freeze([NORMAL_SHAFT, FRAME_SHAFT, FRAME_SHAFT, DIFFERENCE_SHAFT]);
const headOf = (role) => (role === COLOURS.FRAME_NORMAL ? FRAME_HEAD : role >= COLOURS.WAVE ? HEADING_THICKNESS : HEADS[role]);
const shaftOf = (role) => (role === COLOURS.FRAME_NORMAL ? FRAME_SHAFT : role >= COLOURS.WAVE ? HEADING_THICKNESS : SHAFTS[role]);
const UP = new THREE.Vector3(0, 1, 0);
// Task 15: on the narrow layout (a phone's top half) every arrow is this much thicker, shaft and
// head, its length unchanged: at the base girth the heading arrows and the frame's T and B were a few
// pixels across there.
const NARROW_GIRTH = 1.8;

export function createSurfaceOverlays({ view, ocean }) {
	const arrows = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const shaftGeometry = new THREE.CylinderGeometry(0.07, 0.07, 1, 6);
	shaftGeometry.translate(0, 0.5, 0); // from its base at the origin, one stud along +y
	const headGeometry = new THREE.ConeGeometry(0.22, HEAD_LENGTH, 10);
	headGeometry.translate(0, -HEAD_LENGTH / 2, 0); // its tip at the origin
	const material = new THREE.MeshBasicMaterial({ toneMapped: false });
	const shafts = new THREE.InstancedMesh(shaftGeometry, material, MAX_ARROWS);
	const heads = new THREE.InstancedMesh(headGeometry, material, MAX_ARROWS);
	for (let i = 0; i < MAX_ARROWS; i++) {
		shafts.setColorAt(i, PALETTE[0]);
		heads.setColorAt(i, PALETTE[0]);
	}
	for (const mesh of [shafts, heads]) {
		mesh.count = 0;
		mesh.frustumCulled = false;
		mesh.visible = false;
		mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		view.scene.add(mesh);
	}
	// Task 15: the 'tiles' kind (step 13) draws the tile's edges, not arrows (render/tileEdges.js).
	const tiles = createTileEdges(view);
	const base = new THREE.Vector3();
	const tip = new THREE.Vector3();
	const direction = new THREE.Vector3();
	const turn = new THREE.Quaternion();
	const size = new THREE.Vector3();
	const matrix = new THREE.Matrix4();
	const nothing = new THREE.Matrix4().makeScale(0, 0, 0);
	const slope = { count: 0, meanAngle: 0 };
	const gridFocus = [0, 0];
	// The page's own narrow-layout test: below it the panel sits under the picture, not over its left.
	const narrow = window.matchMedia(NARROW_QUERY);
	const colour = new THREE.Color();
	let colourUploads = 0;
	let girth = 1;
	let kind = null;
	let spacing = 4;
	let count = 0;
	let meanAngle = null;
	let finite = true;
	// The kind and the number of arrows the instance colours were last written for.
	let colouredKind = null;
	let colouredCount = 0;

	// Arrow i's two instances: its shaft `shaft` times the base cylinder's girth, its head `head` times
	// the base cone. Its colour is written only when `recolour` (a new kind, or more arrows than were
	// coloured): an arrow's colour depends on nothing but the kind and its index.
	function place(i, head, shaft, recolour) {
		const o = i * ARROW_STRIDE;
		if (recolour) {
			const colour = PALETTE[Math.min(arrows[o + 6], PALETTE.length - 1)];
			shafts.setColorAt(i, colour);
			heads.setColorAt(i, colour);
		}
		base.set(arrows[o], arrows[o + 1], arrows[o + 2]);
		tip.set(arrows[o + 3], arrows[o + 4], arrows[o + 5]);
		direction.subVectors(tip, base);
		const length = direction.length();
		if (!(Number.isFinite(length) && length > 0) || !Number.isFinite(base.x + base.y + base.z)) {
			finite = false;
			shafts.setMatrixAt(i, nothing);
			heads.setMatrixAt(i, nothing);
			return;
		}
		direction.divideScalar(length);
		turn.setFromUnitVectors(UP, direction);
		size.set(shaft, Math.max(length - HEAD_LENGTH * head, 0.01), shaft);
		shafts.setMatrixAt(i, matrix.compose(base, turn, size));
		size.set(head, head, head);
		heads.setMatrixAt(i, matrix.compose(tip, turn, size));
	}

	// The grid's centre: the focus, moved WIDE_GRID_OFFSET (fixed in the world, so orbiting never
	// slides it) on a wide layout, where the step's panel sits over the left of the picture.
	function shiftGrid(focus) {
		const wide = !narrow.matches;
		gridFocus[0] = focus[0] + (wide ? WIDE_GRID_OFFSET[0] : 0);
		gridFocus[1] = focus[1] + (wide ? WIDE_GRID_OFFSET[1] : 0);
	}

	function draw(t, focus) {
		const waves = ocean.source === 'waves' ? ocean.waves : null;
		meanAngle = null;
		if (kind === null || kind === 'tiles' || waves === null) return 0;
		if (kind === 'directions') return directionArrows(waves, t, focus, arrows);
		shiftGrid(focus);
		if (kind === 'normals') return normalArrows(waves, t, gridFocus, arrows);
		slopeArrows(waves, t, gridFocus, spacing, arrows, slope);
		meanAngle = slope.meanAngle;
		return slope.count;
	}

	return {
		apply(overlay) {
			kind = overlay.kind;
			spacing = overlay.spacing;
			tiles.show(kind === 'tiles');
		},
		frame(t, focus) {
			// Hidden and already cleared: nothing to sample, write or upload, and both meshes stay invisible.
			if (kind === null && count === 0) return;
			count = draw(t, focus);
			finite = true;
			const recolour = kind !== colouredKind || count > colouredCount;
			girth = narrow.matches ? NARROW_GIRTH : 1;
			for (let i = 0; i < count; i++) {
				const role = arrows[i * ARROW_STRIDE + 6];
				place(i, headOf(role) * girth, shaftOf(role) * girth, recolour);
			}
			shafts.count = count;
			heads.count = count;
			shafts.visible = count > 0;
			heads.visible = count > 0;
			if (count > 0) {
				shafts.instanceMatrix.needsUpdate = true;
				heads.instanceMatrix.needsUpdate = true;
			}
			if (count > 0 && recolour) {
				shafts.instanceColor.needsUpdate = true;
				heads.instanceColor.needsUpdate = true;
				colouredKind = kind;
				colouredCount = count;
				colourUploads += 1;
			}
		},
		// `colours` and `headColours`: the first two arrows' shaft and head colours as their instance
		// buffers hold them; `colourUploads`: how many times the colours have been sent to the GPU.
		probe() {
			const hex = (mesh, i) => `#${mesh.getColorAt(i, colour).getHexString(THREE.SRGBColorSpace)}`;
			const shown = Math.min(count, 2);
			const colours = Array.from({ length: shown }, (_, i) => hex(shafts, i));
			const headColours = Array.from({ length: shown }, (_, i) => hex(heads, i));
			return { kind, arrows: count, spacing, girth, meanAngle, finite, tiles: tiles.probe(), first: count > 0 ? Array.from(arrows.subarray(0, 6)) : null, colours, headColours, colourUploads };
		},
	};
}
