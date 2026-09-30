// The live ocean: scene, camera, the painted materials, the CPU-written meshes over the engine's
// typed arrays, the frame loop and the stats readout. With ?step=N A3's stage director drives the
// ocean from the URL (ui/devStage.js); without it the scroll story does (ui/storyStage.js).
// Piece C: this module no longer runs by itself. boot.js
// imports it dynamically once WebGL is known to work, so a CDN failure cannot stop the page; the
// frame loop schedules its next frame before running this one, so an exception cannot stop it
// (page/frameGuard.js); the renderer follows a change of device pixel ratio; and the ocean reads
// the page's pausable clock (engine/playClock.js) through `now`.
import * as Ocean from './engine/ocean.js';
import { tierForDevice } from './engine/config.js';
import { createFrameGuard } from './page/frameGuard.js';
import { createScene } from './render/scene.js';
import { createCameraRig } from './render/cameraRig.js';
import { createOceanMeshes } from './render/oceanMeshes.js';
import { createMaterials } from './render/materials.js';
import { createPerfReadout } from './ui/perfReadout.js';
import { startStageRoute } from './ui/devStage.js';
import { createStoryStage } from './ui/storyStage.js';
import { watchPixelRatio } from './ui/pixelRatio.js';

// The phone rule's two facts about this device (engine/config.js tierForDevice decides).
function deviceTier() {
	return tierForDevice({
		shortSide: Math.min(window.screen.width, window.screen.height),
		coarsePointer: window.matchMedia('(pointer: coarse)').matches,
	});
}

export function startOcean({ config, route, now, reducedMotion = false, onPersistentError = () => {} }) {
	const canvas = document.getElementById('ocean');
	const view = createScene(canvas);
	const rig = createCameraRig(view.camera, canvas, config);
	const ocean = Ocean.create(config, {
		spawnCascade: () => new Worker(new URL('./workers/cascade.worker.js', import.meta.url), { type: 'module' }),
		spawnPainter: () => new Worker(new URL('./workers/painter.worker.js', import.meta.url), { type: 'module' }),
		now,
		deviceTier: deviceTier(),
	});
	const materials = createMaterials(ocean, view.renderer);
	Ocean.attachSink(ocean, materials.sink);
	const meshes = createOceanMeshes(view.scene, ocean, materials);
	const stats = document.getElementById('stats');
	stats.hidden = !config.stats;
	const readout = createPerfReadout(stats);
	const guard = createFrameGuard({ onPersistent: onPersistentError });
	const focus = [0, 0];
	const eye = [0, 0, 0];
	let last = performance.now();
	let injected = 0;
	// The device pixel ratio the renderer was last sized for. watchPixelRatio hears a real screen
	// change at once; the frame loop also compares this each frame, because a browser can change the
	// ratio without the media query's change event (headless Chromium under device emulation fires
	// neither that nor a resize).
	let ratio = window.devicePixelRatio;
	function resize() {
		ratio = window.devicePixelRatio;
		view.resize();
	}
	resize();
	window.addEventListener('resize', resize);
	// The canvas changes size without a window resize when the narrow layout's top half changes
	// (a browser without ResizeObserver still resizes with the window).
	if (typeof ResizeObserver === 'function') {
		new ResizeObserver(resize).observe(canvas);
	}
	watchPixelRatio(resize);
	const parts = { ocean, view, rig, meshes, materials, config };
	const dev = route ? startStageRoute({ route, ...parts }) : null;
	// Piece C: without a route the scroll story drives the ocean (ui/storyStage.js).
	const story = route ? null : createStoryStage({ ...parts, reducedMotion });
	if (story) {
		rig.limitForStory({ coarsePointer: window.matchMedia('(pointer: coarse)').matches });
	}
	const stage = dev ?? story;
	window.__ocean = {
		status: () => Ocean.status(ocean),
		report: () => Ocean.report(ocean),
		camera: view.camera,
		materialsProbe: () => materials.probe(),
		setNormalScale: (x, y) => materials.setNormalScale(x, y),
		setSun: (direction) => view.setSun(direction),
		setEnvironment: (enabled) => view.setEnvironment(enabled),
		stage: dev ? dev.hooks : null,
		story: story ? story.hooks : null,
		frameFailures: () => guard.failures(),
		// Test hook: the next `count` frames throw before stepping (tests/ocean/e2e/boot.spec.js).
		injectFrameErrors: (count) => {
			injected = count;
		},
	};

	function tick(time) {
		const dt = (time - last) / 1000;
		last = time;
		if (window.devicePixelRatio !== ratio) resize();
		if (injected > 0) {
			injected -= 1;
			throw new Error('injected frame error (test hook)');
		}
		rig.update();
		stage?.beforeStep(dt);
		Ocean.step(ocean, dt, rig.focus(focus), rig.eye(eye), view.sunDirection);
		materials.applyStrengths(ocean.strengths);
		meshes.sync();
		view.follow();
		stage?.afterStep(dt);
		// The story holds the last picture while a layer it switched on rejoins (ui/storyStage.js): a
		// frame not drawn leaves the canvas showing the one before.
		if (!stage?.holdsPicture?.()) {
			const renderStarted = performance.now();
			view.render();
			Ocean.addStageSeconds(ocean, 'render', (performance.now() - renderStarted) / 1000);
		}
		readout.frame(time);
		if (config.stats) readout.show(Ocean.status(ocean), Ocean.report(ocean));
	}

	function frame(time) {
		requestAnimationFrame(frame);
		try {
			tick(time);
			guard.ok();
		} catch (error) {
			guard.failed(error);
		}
	}
	requestAnimationFrame(frame);

	return Object.freeze({ ...parts, canvas, reducedMotion, stage: dev ? dev.hooks : null, story });
}
