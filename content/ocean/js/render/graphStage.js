// The flat graph of steps 1 to 4, 14 and 15 (piece C2; lane B owns this file; spec 10.4): a dark
// backdrop over the sky and the world, and the curve the teaching surface makes along the plane the
// camera faces, drawn in the main canvas so the swing into step 4 is a camera move, not a cut. The
// curve is the engine's own (page/graphModel.js samples WaveSampler over ocean.waves, the bank or
// sine the surface is written from), every frame, drawn GRAPH_Y_SCALE times taller while the graph
// shows and at true scale on the sheet's edge by the end of step 4. Step 3 adds each summed wave as a
// faint curve under the bold sum.
// The stage look clips the surface to the graph's band (stages/graph.js graphBand); while the
// backdrop is opaque the band is emptied, so no sliver of sea shows edge-on under the taller curve.
// The backdrop fades on the play clock (FADE_SECONDS) so the step from the hero sea into the graph
// is not a pop. It starts from whatever it shows on its first frame (pre-flight R9: the story's
// first step frame eases in rather than snapping); under reduced motion, or once the clock has
// stopped, it goes straight to its target.
// The band never eases: the lens clearance depends on it. Nothing allocates per frame.
// The probe's `components` is a number: how many component curves are drawn.
import * as THREE from 'three';
import { CURVE_POINTS, MAX_COMPONENTS, componentWaves, graphSpan, ribbon, ribbonIndices, sampleComponent, sampleCurve } from '../page/graphModel.js';
import { GRAPH_OFF, graphBand } from '../stages/graph.js';

const BACKDROP_DISTANCE = 3000; // studs: inside the far plane
// The backdrop draws over the whole scene, not behind it: transparent things draw after the opaque
// sea, and with no depth test its opacity dims the band's sliver of sea, and the strands where the
// band cuts the patches' skirts, as much as the sky. A depth-tested backdrop this far out let them
// show at full brightness through every fade. The curves draw over it (orders 11 and 12).
const BACKDROP_ORDER = 10;
const BACKDROP_COLOUR = new THREE.Color().setRGB(0x0b / 255, 0x1a / 255, 0x24 / 255, THREE.SRGBColorSpace); // style.css --body-bg
const CURVE_COLOUR = new THREE.Color().setRGB(0x5f / 255, 0xd4 / 255, 0xc4 / 255, THREE.SRGBColorSpace); // --accent
const COMPONENT_COLOUR = new THREE.Color().setRGB(0xa9 / 255, 0xbc / 255, 0xc8 / 255, THREE.SRGBColorSpace); // --ink-dim
const COMPONENT_OPACITY = 0.5;
const BOLD_PX = 3;
const FAINT_PX = 1.5;
export const FADE_SECONDS = 0.35;
const OPAQUE = 0.999;

function ribbonMesh(colour, opacity, order) {
	const positions = new Float32Array(CURVE_POINTS * 6);
	const attribute = new THREE.BufferAttribute(positions, 3);
	attribute.setUsage(THREE.DynamicDrawUsage);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', attribute);
	geometry.setIndex(new THREE.BufferAttribute(ribbonIndices(CURVE_POINTS), 1));
	const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.renderOrder = order;
	mesh.frustumCulled = false;
	mesh.visible = false;
	return { mesh, attribute, positions, points: new Float32Array(CURVE_POINTS * 3) };
}

export function createGraphStage({ view, ocean, look, reducedMotion = false }) {
	const camera = view.camera;
	const group = new THREE.Group();
	group.visible = false;
	view.scene.add(group);
	const backdrop = new THREE.Mesh(
		new THREE.PlaneGeometry(1, 1),
		new THREE.MeshBasicMaterial({ color: BACKDROP_COLOUR, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false }),
	);
	backdrop.frustumCulled = false;
	backdrop.renderOrder = BACKDROP_ORDER;
	group.add(backdrop);
	const curve = ribbonMesh(CURVE_COLOUR, 1, 12);
	group.add(curve.mesh);
	const components = Array.from({ length: MAX_COMPONENTS }, () => {
		const r = ribbonMesh(COMPONENT_COLOUR, COMPONENT_OPACITY, 11);
		group.add(r.mesh);
		return r;
	});
	// Points whose signed distance n.p + c is negative are clipped: keep x >= xMin and x <= xMax.
	const minPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
	const maxPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
	const planes = [minPlane, maxPlane];
	const forward = new THREE.Vector3();
	const forwardArray = [0, 0, 0];
	const positionArray = [0, 0, 0];
	const spanInput = { position: positionArray, forward: forwardArray, fovDegrees: 70, aspect: 1, heightPx: 1 };
	const span = { zMin: 0, zMax: 0, depth: 0, studsPerPixel: 0 };
	const chosen = new Int32Array(MAX_COMPONENTS);
	let current = GRAPH_OFF;
	let band = null;
	let shown = 0;
	let lastT = null;
	let hasSpan = false;
	let drawing = false;
	let drawn = 0;
	let tallest = 0;

	function clip() {
		if (band === null) {
			look.setClip(null);
			return;
		}
		if (shown >= OPAQUE) {
			// Keep x >= far + 1 and x <= far: nothing.
			minPlane.constant = -(band[1] + 1);
		} else {
			minPlane.constant = -band[0];
		}
		maxPlane.constant = band[1];
		look.setClip(planes);
	}

	function apply(graph) {
		current = graph;
		band = graphBand(graph);
		clip();
	}

	// The backdrop's opacity follows the recipe's on the play clock. The first frame only notes the
	// time and keeps what is shown (R9), so the next frame eases from there.
	function ease(t) {
		const target = current.opacity;
		if (reducedMotion) {
			lastT = t;
			shown = target;
			return;
		}
		if (lastT === null) {
			lastT = t;
			return;
		}
		const dt = t - lastT;
		lastT = t;
		if (!(dt > 0)) {
			shown = target;
			return;
		}
		shown = target + (shown - target) * Math.exp(-dt / FADE_SECONDS);
		if (Math.abs(shown - target) < 1e-3) shown = target;
	}

	// A plane square to the view, inside the far plane (9000), filling the frame with room to spare.
	function placeBackdrop() {
		backdrop.position.copy(camera.position).addScaledVector(forward, BACKDROP_DISTANCE);
		backdrop.quaternion.copy(camera.quaternion);
		const height = 2 * BACKDROP_DISTANCE * Math.tan((camera.fov / 2) * (Math.PI / 180)) * 1.2;
		backdrop.scale.set(height * camera.aspect, height, 1);
	}

	function drawLine(target, halfWidth) {
		ribbon(target.points, CURVE_POINTS, halfWidth, target.positions);
		target.attribute.needsUpdate = true;
	}

	function frame(t) {
		ease(t);
		clip();
		const on = band !== null || shown > 0;
		group.visible = on;
		drawing = false;
		drawn = 0;
		if (!on) {
			return;
		}
		camera.getWorldDirection(forward);
		backdrop.visible = shown > 0;
		backdrop.material.opacity = shown;
		placeBackdrop();
		forwardArray[0] = forward.x;
		forwardArray[1] = forward.y;
		forwardArray[2] = forward.z;
		positionArray[0] = camera.position.x;
		positionArray[1] = camera.position.y;
		positionArray[2] = camera.position.z;
		spanInput.fovDegrees = camera.fov;
		spanInput.aspect = camera.aspect;
		spanInput.heightPx = view.renderer.domElement.clientHeight || 1;
		if (graphSpan(spanInput, span) !== null) hasSpan = true;
		const waves = ocean.source === 'waves' ? ocean.waves : null;
		drawing = band !== null && waves !== null && hasSpan;
		curve.mesh.visible = drawing;
		if (drawing) {
			tallest = sampleCurve(waves, t, span, current.yScale, curve.points);
			drawLine(curve, (BOLD_PX * span.studsPerPixel) / 2);
			if (current.components) drawn = componentWaves(waves, chosen);
		}
		for (let c = 0; c < MAX_COMPONENTS; c++) {
			const visible = c < drawn;
			components[c].mesh.visible = visible;
			if (visible) {
				sampleComponent(waves, chosen[c], t, span, current.yScale, components[c].points);
				drawLine(components[c], (FAINT_PX * span.studsPerPixel) / 2);
			}
		}
	}

	function probe() {
		const p = curve.points;
		const last = (CURVE_POINTS - 1) * 3;
		return {
			opacity: current.opacity,
			shown,
			yScale: current.yScale,
			band: band === null ? null : [band[0], band[1]],
			emptied: band !== null && shown >= OPAQUE,
			components: drawn,
			curve: drawing ? { points: CURVE_POINTS, maxAbsY: tallest, first: [p[0], p[1], p[2]], last: [p[last], p[last + 1], p[last + 2]] } : null,
		};
	}

	return { apply, frame, probe };
}
