// Page boot: read the config, check WebGL, and start the ocean: scene, camera, the painted
// materials, the CPU-written meshes over the engine's typed arrays, the frame loop and the stats
// readout. With ?step=N the stage director drives the ocean through the story's steps
// (ui/devStage.js); without it the page is the A2 hero sea, unchanged.
import { readConfig, tierForDevice } from './engine/config.js';
import * as Ocean from './engine/ocean.js';
import { parseStageRoute } from './stages/route.js';
import { createScene } from './render/scene.js';
import { createCameraRig } from './render/cameraRig.js';
import { createOceanMeshes } from './render/oceanMeshes.js';
import { createMaterials } from './render/materials.js';
import { createPerfReadout } from './ui/perfReadout.js';
import { startStageRoute } from './ui/devStage.js';

// three@0.186's WebGLRenderer asks for WebGL 2 only and throws without it, so WebGL 1 does not count.
export function webglSupported() {
	try {
		const probe = document.createElement('canvas');
		const gl = probe.getContext('webgl2');
		// Give the probe's context back now rather than at garbage collection: browsers cap live
		// contexts, and the renderer's own is next.
		gl?.getExtension('WEBGL_lose_context')?.loseContext();
		return Boolean(gl);
	} catch {
		return false;
	}
}

function showNotice(text) {
	const notice = document.getElementById('notice');
	notice.textContent = text;
	notice.hidden = false;
}

// The phone rule's two facts about this device (engine/config.js tierForDevice decides).
function deviceTier() {
	return tierForDevice({
		shortSide: Math.min(window.screen.width, window.screen.height),
		coarsePointer: window.matchMedia('(pointer: coarse)').matches,
	});
}

function start(config, route) {
	const canvas = document.getElementById('ocean');
	const view = createScene(canvas);
	const rig = createCameraRig(view.camera, canvas, config);
	const ocean = Ocean.create(config, {
		spawnCascade: () => new Worker(new URL('./workers/cascade.worker.js', import.meta.url), { type: 'module' }),
		spawnPainter: () => new Worker(new URL('./workers/painter.worker.js', import.meta.url), { type: 'module' }),
		now: () => performance.now() / 1000,
		deviceTier: deviceTier(),
	});
	const materials = createMaterials(ocean, view.renderer);
	Ocean.attachSink(ocean, materials.sink);
	const meshes = createOceanMeshes(view.scene, ocean, materials);
	const stats = document.getElementById('stats');
	stats.hidden = !config.stats;
	const readout = createPerfReadout(stats);
	const focus = [0, 0];
	const eye = [0, 0, 0];
	let last = performance.now();
	view.resize();
	window.addEventListener('resize', view.resize);
	const stage = route ? startStageRoute({ route, ocean, view, rig, meshes, materials, config }) : null;
	window.__ocean = {
		status: () => Ocean.status(ocean),
		report: () => Ocean.report(ocean),
		camera: view.camera,
		materialsProbe: () => materials.probe(),
		setNormalScale: (x, y) => materials.setNormalScale(x, y),
		setSun: (direction) => view.setSun(direction),
		setEnvironment: (enabled) => view.setEnvironment(enabled),
		stage: stage ? stage.hooks : null,
	};

	function frame(now) {
		const dt = (now - last) / 1000;
		last = now;
		rig.update();
		stage?.beforeStep();
		Ocean.step(ocean, dt, rig.focus(focus), rig.eye(eye), view.sunDirection);
		materials.applyStrengths(ocean.strengths);
		meshes.sync();
		view.follow();
		stage?.afterStep();
		const renderStarted = performance.now();
		view.render();
		Ocean.addStageSeconds(ocean, 'render', (performance.now() - renderStarted) / 1000);
		readout.frame(now);
		if (config.stats) readout.show(Ocean.status(ocean), Ocean.report(ocean));
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);
}

const config = readConfig(location.search);
const route = parseStageRoute(location.search);
for (const warning of [...config.warnings, ...(route?.warnings ?? [])]) {
	console.warn(`[ocean] ${warning}`);
}
const NO_WEBGL = 'This live ocean needs WebGL 2, which this browser has turned off or does not support.';
if (webglSupported()) {
	// The probe can pass and the renderer's own context still fail (a lost GPU process, a blocklist
	// that applies to the second context): say so instead of leaving a blank page.
	try {
		start(config, route);
	} catch (error) {
		console.error('[ocean] could not start', error);
		showNotice(NO_WEBGL);
	}
} else {
	showNotice(NO_WEBGL);
}
