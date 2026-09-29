// Page boot: read the config, check WebGL, and start the ocean: scene, camera, the CPU-written
// meshes over the engine's typed arrays, the frame loop and the stats readout.
import * as THREE from 'three';
import { readConfig } from './engine/config.js';
import * as Ocean from './engine/ocean.js';
import { createScene } from './render/scene.js';
import { createCameraRig } from './render/cameraRig.js';
import { createOceanMeshes } from './render/oceanMeshes.js';
import { createPerfReadout } from './ui/perfReadout.js';

// three@0.186's WebGLRenderer asks for WebGL 2 only and throws without it, so WebGL 1 does not count.
export function webglSupported() {
	try {
		const probe = document.createElement('canvas');
		return Boolean(probe.getContext('webgl2'));
	} catch {
		return false;
	}
}

function showNotice(text) {
	const notice = document.getElementById('notice');
	notice.textContent = text;
	notice.hidden = false;
}

function start(config) {
	const canvas = document.getElementById('ocean');
	const view = createScene(canvas);
	const rig = createCameraRig(view.camera, canvas, config);
	const ocean = Ocean.create(config, {
		spawnCascade: () => new Worker(new URL('./workers/cascade.worker.js', import.meta.url), { type: 'module' }),
		spawnPainter: () => new Worker(new URL('./workers/painter.worker.js', import.meta.url), { type: 'module' }),
		now: () => performance.now() / 1000,
	});
	// Task 7 replaces this stand-in with the painted materials.
	const plain = new THREE.MeshStandardMaterial({ color: 0x1e5b78, roughness: 0.4 });
	const materials = {
		patchMaterials: ocean.surface.patches.map(() => plain),
		quadMaterials: ocean.horizon.quads.map(() => plain),
		sink: { uploadColourBand() {}, uploadMaskOrNormal() {}, uploadRoughness() {} },
	};
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
	window.__ocean = { status: () => Ocean.status(ocean), report: () => Ocean.report(ocean), camera: view.camera };

	function frame(now) {
		const dt = (now - last) / 1000;
		last = now;
		rig.update();
		Ocean.step(ocean, dt, rig.focus(focus), rig.eye(eye), view.sunDirection);
		meshes.sync();
		view.render();
		readout.frame(now);
		if (config.stats) readout.show(Ocean.status(ocean), Ocean.report(ocean));
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);
}

const config = readConfig(location.search);
for (const warning of config.warnings) {
	console.warn(`[ocean] ${warning}`);
}
const NO_WEBGL = 'This live ocean needs WebGL 2, which this browser has turned off or does not support.';
if (webglSupported()) {
	// The probe can pass and the renderer's own context still fail (a lost GPU process, a blocklist
	// that applies to the second context): say so instead of leaving a blank page.
	try {
		start(config);
	} catch (error) {
		console.error('[ocean] could not start', error);
		showNotice(NO_WEBGL);
	}
} else {
	showNotice(NO_WEBGL);
}
