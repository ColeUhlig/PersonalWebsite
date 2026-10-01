// The flat graph of steps 1 to 4, 14 and 15 (piece C2; lane B owns this file; spec 10.4): a dark
// backdrop over the sky and the world, and the curve the teaching surface makes along the plane the
// camera faces, drawn in the main canvas so the swing into step 4 is a camera move, not a cut. The
// curve is the engine's own (page/graphModel.js samples WaveSampler over ocean.waves, the bank or
// sine the surface is written from), every frame, drawn GRAPH_Y_SCALE times taller while the graph
// shows and at true scale on the sheet's edge by the end of step 4. Step 3 adds each summed wave as a
// faint curve under the bold sum.
// The stage look clips the surface to the graph's band (stages/graph.js graphBand); while the
// backdrop is opaque the band is emptied, so no sliver of sea shows edge-on under the taller curve.
// A third clip plane keeps the sheet above floorDepth (the deepest the summed waves reach, plus a
// margin) during the graph bands: the rings' skirts hang under the clipped edge down to the bounds'
// depth, and without it they show from the dry side as a stepped wire pit (Task 4).
// The backdrop fades on the play clock at a steady rate (FADE_SECONDS for the whole way) so the step
// from the hero sea into the graph is not a pop. It starts from whatever it shows on its first frame
// (pre-flight R9: the story's first step frame eases in rather than snapping); under reduced motion,
// or once the clock has stopped, it goes straight to its target. The curves fade the same way: in
// while a band is on and the camera faces the plane, out when either goes (the step after step 4, or
// a camera turned away), sampled live only while there is a span this frame, so a curve never pops
// and never redraws on a span the camera has left.
// Task 4 adds the axes, their ticks and words, faded with the backdrop, and on the sine steps the
// live height and crest-to-crest length marked on the curve (render/graphLabels.js).
// The band never eases: the lens clearance depends on it. Nothing allocates per frame: tick values
// go into a buffer made once, and a label's text is rebuilt only when its number changes (R18).
// The probe's `components` is a number: how many component curves are drawn.
import * as THREE from 'three';
import { AXIS_LEFT_PX, AXIS_RIGHT_PX, CURVE_POINTS, LINE_LIFT, MAX_COMPONENTS, axisLayout, axisOpacityOf, axisTicksInto, componentWaves, crestAfter, floorDepth, graphSpan, lambdaPair, niceStep, ribbon, ribbonIndices, sampleComponent, sampleCurve, studsPerPixelAt, uprightLean } from '../page/graphModel.js';
import { GRAPH_OFF, GRAPH_PLANE_X, graphBand } from '../stages/graph.js';
import { createAxes, createLabel } from './graphLabels.js';

const BACKDROP_DISTANCE = 3000; // studs: inside the far plane
// Draw order among the graph's transparent pieces (three sorts transparent things by renderOrder
// before distance). The backdrop draws over the whole scene, not behind it: transparent things draw
// after the opaque sea, and with no depth test its opacity dims the band's sliver of sea, and the
// strands where the band cuts the patches' skirts, as much as the sky. A depth-tested backdrop this
// far out let them show at full brightness through every fade. Everything else draws over it.
export const ORDER = Object.freeze({ backdrop: 10, axes: 11, components: 12, curve: 13, labels: 14 });
const BACKDROP_COLOUR = new THREE.Color().setRGB(0x0b / 255, 0x1a / 255, 0x24 / 255, THREE.SRGBColorSpace); // style.css --body-bg
const CURVE_COLOUR = new THREE.Color().setRGB(0x5f / 255, 0xd4 / 255, 0xc4 / 255, THREE.SRGBColorSpace); // --accent
const COMPONENT_COLOUR = new THREE.Color().setRGB(0xa9 / 255, 0xbc / 255, 0xc8 / 255, THREE.SRGBColorSpace); // --ink-dim
const COMPONENT_OPACITY = 0.5;
const BOLD_PX = 3;
const FAINT_PX = 1.5;
export const FADE_SECONDS = 0.5;
const OPAQUE = 0.999;
// The floor clip's constant when there is no wave bank to bound the sheet: no floor at all.
const NO_FLOOR = 1e6;
const TICK_LABELS = 16;
const TICK_COLOUR = '#a9bcc8'; // --ink-dim
// Pixels the λ bracket stays in from the frame's right edge.
const BRACKET_EDGE_PX = 8;
// About one distance tick per this many pixels (a phone's top half gets three or four), at most eight.
const TICK_SPACING_PX = 90;
const MAX_DISTANCE_TICKS = 8;
const MINUS = '\u2212';
const signed = (v) => (v < 0 ? `${MINUS}${-v}` : `${v}`);

function ribbonMesh(colour, opacity, order) {
	const positions = new Float32Array(CURVE_POINTS * 6);
	const attribute = new THREE.BufferAttribute(positions, 3);
	attribute.setUsage(THREE.DynamicDrawUsage);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', attribute);
	geometry.setIndex(new THREE.BufferAttribute(ribbonIndices(CURVE_POINTS), 1));
	// Single pass: a double-sided transparent mesh is otherwise drawn twice (back faces, then front).
	// Fogged like the sheet whose edge it rides, so a far end hazes out with it.
	const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: true, toneMapped: false });
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
	backdrop.renderOrder = ORDER.backdrop;
	group.add(backdrop);
	const curve = ribbonMesh(CURVE_COLOUR, 1, ORDER.curve);
	group.add(curve.mesh);
	const components = Array.from({ length: MAX_COMPONENTS }, () => {
		const r = ribbonMesh(COMPONENT_COLOUR, COMPONENT_OPACITY, ORDER.components);
		group.add(r.mesh);
		return r;
	});
	// Points whose signed distance n.p + c is negative are clipped: keep x >= xMin and x <= xMax.
	const minPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
	const maxPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
	// Keep y >= -floor.
	const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), NO_FLOOR);
	const planes = [minPlane, maxPlane, floorPlane];
	// The distance axis, its ticks and the sine's marks; the height axis and its ticks apart, as they
	// fade on their own (axisLayout's `upright`).
	const axes = createAxes({ order: ORDER.axes });
	const heightAxes = createAxes({ order: ORDER.axes });
	group.add(axes.lines, heightAxes.lines);
	const layoutOut = { left: 0, right: 0, sppLeft: 0, sppRight: 0, lean: 0, upright: 1, top: 0, bottom: 0 };
	const pairOut = { start: 0, crest: true };
	const word = () => createLabel({ order: ORDER.labels });
	const words = { distance: word(), height: word(), lambda: word(), amplitude: word() };
	const ticks = Array.from({ length: TICK_LABELS }, () => createLabel({ colour: TICK_COLOUR, order: ORDER.labels }));
	for (const label of [...Object.values(words), ...ticks]) group.add(label.sprite);
	// What each tick label last said (its value, and whether it was a height), so its text is built
	// only when that changes.
	const tickValues = new Float64Array(TICK_LABELS).fill(Number.NaN);
	const tickHeights = new Uint8Array(TICK_LABELS);
	const zTicks = new Float64Array(TICK_LABELS);
	const yTicks = new Float64Array(TICK_LABELS);
	const shownLabels = [];
	let markers = null;
	let heightScale = Number.NaN;
	let lambdaShown = Number.NaN;
	let amplitudeShown = Number.NaN;
	const forward = new THREE.Vector3();
	const forwardArray = [0, 0, 0];
	const positionArray = [0, 0, 0];
	const spanInput = { position: positionArray, forward: forwardArray, fovDegrees: 70, aspect: 1, heightPx: 1 };
	const span = { zMin: 0, zMax: 0, frameMin: 0, frameMax: 0, depth: 0, studsPerPixel: 0 };
	const chosen = new Int32Array(MAX_COMPONENTS);
	let current = GRAPH_OFF;
	let band = null;
	let shown = 0;
	let curveShown = 0;
	let lastT = null;
	let sampled = false;
	let drawing = false;
	let drawn = 0;
	let tallest = 0;

	function clip() {
		if (band === null) {
			look.setClip(null);
			return;
		}
		const waves = ocean.source === 'waves' ? ocean.waves : null;
		floorPlane.constant = waves === null ? NO_FLOOR : floorDepth(waves);
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

	// Seconds on the play clock since the last frame: null on the first frame (R9: keep what is
	// shown), and Infinity, which goes straight to the target, under reduced motion or a stopped clock.
	function clockStep(t) {
		const previous = lastT;
		lastT = t;
		if (reducedMotion) {
			return Infinity;
		}
		if (previous === null) {
			return null;
		}
		const dt = t - previous;
		return dt > 0 ? dt : Infinity;
	}

	// A fade's next value: a steady FADE_SECONDS for the whole way.
	function approach(value, target, dt) {
		if (dt === null) {
			return value;
		}
		const most = dt / FADE_SECONDS;
		return value < target ? Math.min(target, value + most) : Math.max(target, value - most);
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

	// The camera's view of the plane this frame into `span`; false when it does not face the plane.
	function measureSpan() {
		camera.getWorldDirection(forward);
		forwardArray[0] = forward.x;
		forwardArray[1] = forward.y;
		forwardArray[2] = forward.z;
		positionArray[0] = camera.position.x;
		positionArray[1] = camera.position.y;
		positionArray[2] = camera.position.z;
		spanInput.fovDegrees = camera.fov;
		spanInput.aspect = camera.aspect;
		spanInput.heightPx = view.renderer.domElement.clientHeight || 1;
		return graphSpan(spanInput, span) !== null;
	}

	// The bold sum and, on step 3, each summed wave alone, on this frame's span.
	function sampleLines(waves, t) {
		tallest = sampleCurve(waves, t, span, current.yScale, curve.points);
		drawLine(curve, (BOLD_PX * span.studsPerPixel) / 2);
		sampled = true;
		drawn = band !== null && current.components ? componentWaves(waves, chosen) : 0;
		for (let c = 0; c < drawn; c++) {
			sampleComponent(waves, chosen[c], t, span, current.yScale, components[c].points);
			drawLine(components[c], (FAINT_PX * span.studsPerPixel) / 2);
		}
	}

	function frame(t) {
		const dt = clockStep(t);
		shown = approach(shown, current.opacity, dt);
		clip();
		const waves = ocean.source === 'waves' ? ocean.waves : null;
		const faced = band !== null || curveShown > 0 ? measureSpan() : false;
		curveShown = approach(curveShown, band !== null && waves !== null && faced ? 1 : 0, dt);
		const on = band !== null || shown > 0 || curveShown > 0;
		group.visible = on;
		drawn = 0;
		if (!on) {
			drawing = false;
			markers = null;
			shownLabels.length = 0;
			return;
		}
		camera.getWorldDirection(forward);
		backdrop.visible = shown > 0;
		backdrop.material.opacity = shown;
		placeBackdrop();
		// Live only on this frame's span; with none, the last curve fades where it was drawn.
		if (waves !== null && faced) sampleLines(waves, t);
		drawing = sampled && curveShown > 0;
		curve.mesh.visible = drawing;
		curve.mesh.material.opacity = curveShown;
		for (let c = 0; c < MAX_COMPONENTS; c++) {
			components[c].mesh.visible = drawing && c < drawn;
			components[c].mesh.material.opacity = COMPONENT_OPACITY * curveShown;
		}
		if (drawing && band !== null && axisOpacityOf(shown) > 0) {
			decorate(t, axisOpacityOf(shown));
		} else {
			undecorate();
		}
	}

	function undecorate() {
		for (const label of ticks) label.hide();
		words.distance.hide();
		words.height.hide();
		words.lambda.hide();
		words.amplitude.hide();
		axes.begin();
		axes.end(0);
		heightAxes.begin();
		heightAxes.end(0);
		shownLabels.length = 0;
		markers = null;
	}

	function tickLabel(slot, value, height, x, y, z, spp, opacity, anchor) {
		if (tickValues[slot] !== value || tickHeights[slot] !== height) {
			tickValues[slot] = value;
			tickHeights[slot] = height;
			ticks[slot].set(height && value > 0 ? `+${value}` : signed(value));
		}
		ticks[slot].place(x, y, z, spp, opacity, anchor);
	}

	// The axes, their ticks and words, faded with the backdrop (axisOpacityOf): they belong to the flat
	// picture and go as the swing turns it into a surface. They are placed from the camera's own view
	// of the curve's line (graphModel.js axisLayout), so their ends stay on the frame however oblique
	// it gets, and every offset in pixels is taken at its own depth. The height axis also fades as it
	// nears the most it can lean (layout.upright). The distance ticks' numbers sit along the graph's
	// foot, where the curve never crosses them. The sine steps also mark the live height and length.
	function decorate(t, opacity) {
		const layout = axisLayout(spanInput, layoutOut);
		if (layout === null) {
			undecorate();
			return;
		}
		const x = GRAPH_PLANE_X - LINE_LIFT;
		const { left, right, sppLeft, sppRight, lean } = layout;
		const heightOpacity = opacity * layout.upright;
		const yScale = current.yScale;
		// A quarter over the tallest crest, kept inside the frame with room for the height word over
		// it and the distance numbers and word under its foot.
		const heightTop = Math.max(0.5 * yScale, Math.min(Math.max(tallest, 0.5) * yScale * 1.25, layout.top - 30 * sppLeft, -layout.bottom - 44 * sppLeft));
		axes.begin();
		heightAxes.begin();
		axes.segment(x, 0, left, x, 0, right);
		heightAxes.segment(x, -heightTop, left - heightTop * lean, x, heightTop, left + heightTop * lean);
		// The axis spans the frame less its insets on screen, however oblique the view.
		const axisPx = spanInput.heightPx * spanInput.aspect - AXIS_LEFT_PX - AXIS_RIGHT_PX;
		const wanted = Math.min(MAX_DISTANCE_TICKS, Math.max(2, Math.round(axisPx / TICK_SPACING_PX)));
		const zCount = axisTicksInto(left, right, niceStep(right - left, wanted), zTicks);
		const yCount = axisTicksInto(-heightTop / yScale, heightTop / yScale, niceStep(heightTop / yScale, 3), yTicks);
		shownLabels.length = 0;
		let slot = 0;
		for (let i = 0; i < zCount; i++) {
			const z = zTicks[i];
			const spp = studsPerPixelAt(spanInput, z);
			axes.segment(x, -5 * spp, z, x, 5 * spp, z);
			if (slot < TICK_LABELS) {
				tickLabel(slot, z, 0, x, -heightTop - 14 * spp, z, spp, opacity, 'centre');
				slot += 1;
			}
		}
		for (let i = 0; i < yCount; i++) {
			const y = yTicks[i];
			if (y === 0) continue;
			const at = left + y * yScale * lean;
			heightAxes.segment(x, y * yScale, at - 5 * sppLeft, x, y * yScale, at + 5 * sppLeft);
			if (slot < TICK_LABELS) {
				tickLabel(slot, y, 1, x, y * yScale, at - 8 * sppLeft, sppLeft, heightOpacity, 'right');
				slot += 1;
			}
		}
		for (let i = slot; i < TICK_LABELS; i++) ticks[i].hide();
		const scale = Math.round(yScale * 10) / 10;
		if (scale !== heightScale) {
			heightScale = scale;
			words.height.set(scale === 1 ? 'height (studs)' : `height (studs, drawn ×${scale})`);
		}
		// Clear of the λ marker's words, which sit just over the crests; inside the frame's top.
		const wordY = Math.min(heightTop + 30 * sppLeft, layout.top);
		words.height.place(x, wordY, left + wordY * lean, sppLeft, heightOpacity, 'left');
		words.distance.set('distance (studs)');
		words.distance.place(x, -heightTop - 32 * sppRight, right, sppRight, opacity, 'right');
		if (heightOpacity > 0) shownLabels.push(words.height.text());
		shownLabels.push(words.distance.text());
		const sine = ocean.stageSettings?.source === 'sine' ? ocean.waves : null;
		if (sine !== null && sine.packed[2] > 0) {
			markSine(sine, t, x, opacity, left, right);
		} else {
			markers = null;
			words.lambda.hide();
			words.amplitude.hide();
		}
		axes.end(opacity);
		heightAxes.end(heightOpacity);
	}

	// The sine's crest-to-crest length and its height. The λ bracket rides a crest pair between the
	// height axis and the frame's right edge (pre-flight R10: preferring the pair a quarter wave in
	// from the axis), or a trough pair under the curve when no crest pair fits there, so it never blinks
	// out as the wave slides (graphModel.js lambdaPair). The height is marked at a crest.
	function markSine(sine, t, x, opacity, left, right) {
		const k = sine.packed[0];
		const omega = sine.packed[1];
		const amplitude = sine.packed[2] * sine.weights[0];
		const phase = sine.packed[3];
		const wavelength = (2 * Math.PI) / k;
		const top = amplitude * current.yScale;
		const shownLength = Number(wavelength.toFixed(1));
		const shownHeight = Number(amplitude.toFixed(2));
		const edge = span.frameMax - BRACKET_EDGE_PX * studsPerPixelAt(spanInput, span.frameMax);
		const pair = lambdaPair(k, omega, phase, t, left, edge, pairOut);
		if (pair !== null) {
			const first = pair.start;
			const second = first + wavelength;
			const spp = studsPerPixelAt(spanInput, (first + second) / 2);
			const side = pair.crest ? 1 : -1;
			const lift = side * (top + 10 * spp);
			axes.segment(x, lift, first, x, lift, second);
			axes.segment(x, lift - 4 * spp, first, x, lift + 4 * spp, first);
			axes.segment(x, lift - 4 * spp, second, x, lift + 4 * spp, second);
			if (shownLength !== lambdaShown) {
				lambdaShown = shownLength;
				words.lambda.set(`λ = ${shownLength} studs`);
			}
			words.lambda.place(x, lift + side * 12 * spp, (first + second) / 2, spp, opacity);
			shownLabels.push(words.lambda.text());
		} else {
			words.lambda.hide();
		}
		const crest = pair !== null && pair.crest ? pair.start : crestAfter(k, omega, phase, t, left + wavelength * 0.25);
		if (crest < right) {
			const spp = studsPerPixelAt(spanInput, crest);
			axes.segment(x, 0, crest, x, top, crest + top * uprightLean(positionArray, forwardArray, crest));
			if (shownHeight !== amplitudeShown) {
				amplitudeShown = shownHeight;
				words.amplitude.set(`A = ${shownHeight} studs`);
			}
			words.amplitude.place(x, top / 2, crest + 6 * spp, spp, opacity, 'left');
			shownLabels.push(words.amplitude.text());
		} else {
			words.amplitude.hide();
		}
		if (markers === null || markers.wavelength !== shownLength || markers.amplitude !== shownHeight) {
			markers = { wavelength: shownLength, amplitude: shownHeight };
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
			// The backdrop covers the scene (no depth test, over the sea) rather than sitting behind it.
			covers: backdrop.material.depthTest === false && backdrop.material.transparent && backdrop.renderOrder < ORDER.axes,
			curveShown,
			floor: band !== null && floorPlane.constant < NO_FLOOR ? -floorPlane.constant : null,
			components: drawn,
			axes: drawing && band !== null && axisOpacityOf(shown) > 0,
			labels: drawing && band !== null && axisOpacityOf(shown) > 0 ? [...shownLabels] : [],
			markers,
			curve: drawing ? { points: CURVE_POINTS, maxAbsY: tallest, first: [p[0], p[1], p[2]], last: [p[last], p[last + 1], p[last + 2]] } : null,
		};
	}

	return { apply, frame, probe };
}
