// Arrows on the surface (piece C2; lane C owns this file; spec 10.7 steps 5, 8 and 9): each wave's
// heading (step 5), the surface's normals with the tangent and binormal (step 8), and the
// central-difference normal beside each exact one, with their mean angle (step 9, Task 6). The
// arrows come from page/overlayModel.js, read from the waves the surface is written from; each is a
// thin cylinder and a cone, two instanced meshes for every arrow at once. Everything is made once; a frame writes
// matrices and colours into the instance buffers and allocates nothing. An arrow that is not finite
// (it never should be) is drawn at zero size and reported through probe().finite. With no overlay
// (every other step) a frame returns at once once the meshes are hidden: no sampling, no upload, no draw.
import * as THREE from 'three';
import { ARROW_STRIDE, COLOURS, MAX_ARROWS, PALETTE_HEX, directionArrows, normalArrows, slopeArrows } from '../page/overlayModel.js';

// The model's colours (one per role, then one per wave heading), as three.js colours.
const PALETTE = PALETTE_HEX.map((hex) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace));
const HEAD_LENGTH = 0.6;
// How much thicker the heading arrows are than the normals: they are seen from about 90 studs away
// (the directions shot), the normals from about 40, and must read at 390 px wide.
const HEADING_THICKNESS = 5;
// The normals' (and the tangent's, binormal's and difference's) shafts against the base cylinder: a
// shaft of one is about a pixel wide on a phone.
const NORMAL_SHAFT = 1.5;
// The tangent and binormal: thicker still, so the one frame on the grid reads among its normals.
const FRAME_SHAFT = 2.5;
const FRAME_HEAD = 1.6;
// The central-difference arrow: thinner than the exact one beside it, its head smaller, so where the
// two coincide the exact one shows round it and the difference's longer tip shows past it.
const DIFFERENCE_SHAFT = 1;
const DIFFERENCE_HEAD = 0.85;
// Studs the normals' grid moves right of the camera's focus on a canvas wider than tall, where the
// step's panel sits over the left of the picture (the grid points stay on the 2-stud lattice and well
// inside the finest ring, whose half-width is 32 studs at High).
const GRID_SHIFT = 9;
// Head and shaft girths by role (COLOURS: normal, tangent, binormal, difference); every heading
// (COLOURS.WAVE and up) takes HEADING_THICKNESS for both.
const HEADS = Object.freeze([1, FRAME_HEAD, FRAME_HEAD, DIFFERENCE_HEAD]);
const SHAFTS = Object.freeze([NORMAL_SHAFT, FRAME_SHAFT, FRAME_SHAFT, DIFFERENCE_SHAFT]);
const headOf = (role) => (role >= COLOURS.WAVE ? HEADING_THICKNESS : HEADS[role]);
const shaftOf = (role) => (role >= COLOURS.WAVE ? HEADING_THICKNESS : SHAFTS[role]);
const UP = new THREE.Vector3(0, 1, 0);

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
	const base = new THREE.Vector3();
	const tip = new THREE.Vector3();
	const direction = new THREE.Vector3();
	const turn = new THREE.Quaternion();
	const size = new THREE.Vector3();
	const matrix = new THREE.Matrix4();
	const nothing = new THREE.Matrix4().makeScale(0, 0, 0);
	const slope = { count: 0, meanAngle: 0 };
	const right = new THREE.Vector3();
	const gridFocus = [0, 0];
	const colour = new THREE.Color();
	let colourUploads = 0;
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

	// The grid's centre: the focus, moved GRID_SHIFT studs to the camera's right on a wide canvas.
	function shiftGrid(focus) {
		const camera = view.camera;
		const shift = camera.aspect > 1 ? GRID_SHIFT : 0;
		right.setFromMatrixColumn(camera.matrixWorld, 0);
		right.y = 0;
		const length = right.length();
		const scale = length > 0 ? shift / length : 0;
		gridFocus[0] = focus[0] + right.x * scale;
		gridFocus[1] = focus[1] + right.z * scale;
	}

	function draw(t, focus) {
		const waves = ocean.source === 'waves' ? ocean.waves : null;
		meanAngle = null;
		if (kind === null || waves === null) return 0;
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
		},
		frame(t, focus) {
			// Hidden and already cleared: nothing to sample, write or upload, and both meshes stay invisible.
			if (kind === null && count === 0) return;
			count = draw(t, focus);
			finite = true;
			const recolour = kind !== colouredKind || count > colouredCount;
			for (let i = 0; i < count; i++) {
				const role = arrows[i * ARROW_STRIDE + 6];
				place(i, headOf(role), shaftOf(role), recolour);
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
		// `colours`: the first two arrows' colours as their instance buffer holds them; `colourUploads`:
		// how many times the colours have been sent to the GPU.
		probe() {
			const colours = [];
			for (let i = 0; i < Math.min(count, 2); i++) colours.push(`#${shafts.getColorAt(i, colour).getHexString(THREE.SRGBColorSpace)}`);
			return { kind, arrows: count, spacing, meanAngle, finite, first: count > 0 ? Array.from(arrows.subarray(0, 6)) : null, colours, colourUploads };
		},
	};
}
