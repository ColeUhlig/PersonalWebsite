// Arrows on the surface (piece C2; lane C owns this file; spec 10.7 steps 5, 8 and 9): each wave's
// heading (step 5), the surface's normals with the tangent and binormal (step 8), and the
// central-difference normal beside the exact one (step 9, Task 6). The arrows come from
// page/overlayModel.js, read from the waves the surface is written from; each is a thin cylinder and
// a cone, two instanced meshes for every arrow at once. Everything is made once; a frame writes
// matrices and colours into the instance buffers and allocates nothing. An arrow that is not finite
// (it never should be) is drawn at zero size and reported through probe().finite. With no overlay
// (every other step) a frame returns at once once the meshes are hidden: no sampling, no upload, no draw.
import * as THREE from 'three';
import { ARROW_STRIDE, MAX_ARROWS, directionArrows, normalArrows } from '../page/overlayModel.js';

const srgb = (hex) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
// Normal (a darker accent), tangent and binormal (term colours), the central difference (orange),
// then one colour per wave heading: all clear against the white teaching sea.
const PALETTE = [
	srgb('#1aa392'), srgb('#d9891a'), srgb('#d6457a'), srgb('#ef6c1a'),
	srgb('#e4572e'), srgb('#17a2a0'), srgb('#c9a000'), srgb('#5a9b2f'), srgb('#2e86ab'), srgb('#a23b72'), srgb('#f18f01'), srgb('#6a4c93'),
];
const HEAD_LENGTH = 0.6;
// How much thicker the heading arrows are than the normals: they are seen from about 90 studs away
// (the directions shot), the normals from about 40, and must read at 390 px wide.
const HEADING_THICKNESS = 5;
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
	let kind = null;
	let spacing = 4;
	let count = 0;
	let meanAngle = null;
	let finite = true;

	// Arrow i's two instances, thicker for the long heading arrows so they read from higher up.
	function place(i, thick) {
		const o = i * ARROW_STRIDE;
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
		size.set(thick, Math.max(length - HEAD_LENGTH * thick, 0.01), thick);
		shafts.setMatrixAt(i, matrix.compose(base, turn, size));
		size.set(thick, thick, thick);
		heads.setMatrixAt(i, matrix.compose(tip, turn, size));
		const colour = PALETTE[Math.min(arrows[o + 6], PALETTE.length - 1)];
		shafts.setColorAt(i, colour);
		heads.setColorAt(i, colour);
	}

	function draw(t, focus) {
		const waves = ocean.source === 'waves' ? ocean.waves : null;
		meanAngle = null;
		if (kind === null || waves === null) return 0;
		if (kind === 'directions') return directionArrows(waves, t, focus, arrows);
		if (kind === 'normals') return normalArrows(waves, t, focus, arrows);
		return 0;
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
			const thick = kind === 'directions' ? HEADING_THICKNESS : 1;
			for (let i = 0; i < count; i++) place(i, thick);
			shafts.count = count;
			heads.count = count;
			shafts.visible = count > 0;
			heads.visible = count > 0;
			if (count > 0) {
				shafts.instanceMatrix.needsUpdate = true;
				heads.instanceMatrix.needsUpdate = true;
				shafts.instanceColor.needsUpdate = true;
				heads.instanceColor.needsUpdate = true;
			}
		},
		probe() {
			return { kind, arrows: count, spacing, meanAngle, finite, first: count > 0 ? Array.from(arrows.subarray(0, 6)) : null };
		},
	};
}
