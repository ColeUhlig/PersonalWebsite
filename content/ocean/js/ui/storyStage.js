// The story's hold on the live ocean (piece C). It turns the scroll reading (ui/story.js) into A3's
// director step and progress, applies each frame's look and camera shot, lets the visitor orbit
// between shots (page/shotControl.js, within page/orbitLimits.js), and serves the panels' sliders
// and the charts' data. Until the visitor first scrolls into a step the ocean is left exactly as A2
// built it. Above step 1 (the opening) it shows step 13's recipe, the finished sea, under the
// opening camera. The position (step + progress) is smoothed toward the scroll and cut when it jumps
// more than a step, so a fling never sweeps the engine through the recipes in between
// (page/scrollMap.js). Under reduced motion there is no smoothing, no blending of shots, no drift
// and no easing back.
// Motion reads the play clock (Ocean.teachTime), never the frame's wall time: the smoothing and the
// ease back run on its seconds, and while it is stopped (reduced motion, a paused sea) the story
// goes straight to where the scroll says.
// Other steps' sliders are read through the director's read-only slidersFor/valueOf. A slider on a
// panel that is not the step being read is applied to that panel's own step: the director is set to
// it, the slider applied, and the director set back before the next frame.
// A layer that switches on rejoins the sea 3 to 6 frames later, so a jump into an FFT step (a fling,
// the opening, a reduced-motion step change) would show flat water for those frames. The stage holds
// the last picture instead (main.js skips the render while holdsPicture() says so) until a layer is
// sampled, for HOLD_MAX_FRAMES at most.
import * as Charts from '../engine/charts.js';
import * as Ocean from '../engine/ocean.js';
import { probeSurface } from '../engine/surfaceProbe.js';
import { createDirector } from '../stages/director.js';
import { recipeFor, STEP_COUNT } from '../stages/recipes.js';
import { createStageLook } from '../render/stageLook.js';
import { SHOTS } from '../render/cameraRig.js';
import { movingReach, polarRange } from '../page/orbitLimits.js';
import { positionOf, smoothPosition, splitPosition } from '../page/scrollMap.js';
import { createShotControl, resolveShot } from '../page/shotControl.js';

const TRAIL_LENGTH = 64;
const MAX_FRAME_SECONDS = 0.25;
export const HOLD_MAX_FRAMES = 10;

export function createStoryStage({ ocean, view, rig, meshes, materials, config, reducedMotion = false }) {
	const director = createDirector(ocean);
	const look = createStageLook({ view, meshes, materials, config });
	const shots = createShotControl(reducedMotion ? { returnSeconds: 0 } : {});
	const openingShot = Object.freeze({ ...(SHOTS[config.camera] ?? SHOTS.deck), move: 'still' });
	const reach = movingReach(ocean.preset.rings);
	const trail = [];
	const reported = new Set();
	let reading = Object.freeze({ phase: 'opening', step: 1, progress: 0 });
	let started = false;
	let cutPending = false;
	let position = Number.NaN;
	let key = 0;
	let clock = null;
	// The teaching clock when the shot's move last became 'drift': the finale turns from there, so
	// the camera does not jump at the snap into step 13 however long the page has been open.
	let driftStart = null;
	let tilt = null;
	let wantsLayers = false;
	let holding = false;
	let held = 0;
	let watching = 0;
	let pictures = [];

	rig.onUserOrbit(() => shots.orbited(key));

	function limitTilt(pose) {
		tilt = polarRange(pose, { aspect: view.camera.aspect, fovDegrees: view.camera.fov, reach });
		rig.limitTilt(tilt.min, tilt.max);
	}
	// The opening camera is A2's until the first scroll, but the visitor's orbit is the story's
	// from the start: no dragging it down into the crests.
	limitTilt(openingShot);

	function setScroll(next) {
		if (next.phase !== reading.phase) {
			cutPending = true;
			position = Number.NaN;
		}
		if (next.phase === 'step') {
			started = true;
		}
		reading = next;
	}

	// The play clock's seconds since the last frame, capped; 0 while it is stopped.
	function clockSeconds(now) {
		const seconds = clock === null ? 0 : Math.min(Math.max(now - clock, 0), MAX_FRAME_SECONDS);
		clock = now;
		return seconds;
	}

	function followScroll(seconds) {
		if (reading.phase === 'opening') {
			director.setStep(STEP_COUNT, 0);
			return 0;
		}
		const target = positionOf(reading);
		if (Number.isFinite(position) && Math.abs(target - position) > 1) {
			cutPending = true;
		}
		position = reducedMotion || !(seconds > 0) ? target : smoothPosition(position, target, seconds);
		const { step, progress } = splitPosition(position);
		director.setStep(step, reducedMotion ? 0 : progress);
		return step;
	}

	function shotSeconds(shot, now) {
		if (shot.move !== 'drift') {
			driftStart = null;
			return 0;
		}
		driftStart ??= now;
		return now - driftStart;
	}

	// A frame the engine refuses (the director has already gone back to the values it last took) is
	// reported once per distinct error and skipped, as ui/devStage.js does.
	function directorFrame() {
		try {
			return director.frame();
		} catch (error) {
			if (!reported.has(error.message)) {
				reported.add(error.message);
				console.error('[ocean] the story frame was refused', error);
			}
			return null;
		}
	}

	function applyCamera(out, seconds, now) {
		const shot = key === 0 ? openingShot : reducedMotion ? { ...recipeFor(key).shot, move: 'still' } : out.shot;
		const target = resolveShot(shot, shotSeconds(shot, now));
		const pose = shots.frame(key, rig.pose(), target, seconds, { cut: cutPending, ease: seconds > 0 });
		cutPending = false;
		if (pose) {
			limitTilt(pose);
			rig.applyShot({ position: pose.position, target: pose.target, move: 'still' }, 0);
		}
	}

	// Before Ocean.step (dt is the frame's wall time and is not used: motion reads the play clock).
	function beforeStep() {
		if (!started) {
			return;
		}
		const now = Ocean.teachTime(ocean);
		const seconds = clockSeconds(now);
		key = followScroll(seconds);
		trail.push(key);
		if (trail.length > TRAIL_LENGTH) trail.shift();
		const out = directorFrame();
		if (!out) {
			return;
		}
		look.apply(out.look);
		applyCamera(out, seconds, now);
		const { source, layers } = out.recipe.engine;
		wantsLayers = source === 'fft' && layers.some((on, i) => on && i < ocean.preset.sizes.length);
	}

	// After Ocean.step, when this frame's sea is written: hold the picture while the recipe asks for
	// FFT layers and none is sampled yet.
	function afterStep() {
		if (!started) {
			return;
		}
		view.settleEnvironment();
		const flat = wantsLayers && !Ocean.status(ocean).layers.some(Boolean);
		holding = flat && held < HOLD_MAX_FRAMES;
		held = flat ? held + 1 : 0;
		if (watching > 0) {
			watching -= 1;
			pictures.push(Object.freeze({ key, held: holding, maxAbsY: probeSurface(ocean.surface).maxAbsY }));
		}
	}

	function onStep(step, fn) {
		const saved = director.state();
		director.setStep(step, 0);
		try {
			return fn();
		} finally {
			director.setStep(saved.step, saved.progress);
		}
	}

	const sliders = (step) => director.slidersFor(step);
	const setSlider = (step, id, value) => onStep(step, () => director.setSlider(id, value));
	const press = (step, id) => onStep(step, () => director.press(id));

	// The phase arrows are built once per sea and seed (a cascade build, 4 to 9 ms) and turned every
	// call. Step 8's sea is its recipe's own (it has no sea sliders), so a blend from step 7 does not
	// rebuild them every frame.
	let arrows = null;
	let arrowsKey = '';
	const charts = Object.freeze({
		spectrum() {
			const params = { ...ocean.live.params, windSpeed: director.valueOf(7, 'wind'), fetch: director.valueOf(7, 'fetch') };
			return Charts.spectrumCurve(params, { sizes: ocean.preset.sizes, n: ocean.preset.n });
		},
		phaseArrows() {
			const sea = recipeFor(8).engine.sea;
			const params = { ...ocean.live.params, windSpeed: sea.windSpeed, fetch: sea.fetch };
			const seed = director.valueOf(8, 'seed');
			const arrowsFor = `${params.windSpeed}|${params.fetch}|${seed}`;
			if (arrowsFor !== arrowsKey) {
				arrows = Charts.createPhaseArrows(params, { seed, sizes: ocean.preset.sizes, n: ocean.preset.n });
				arrowsKey = arrowsFor;
			}
			return Charts.phaseArrowsAt(arrows, ocean.t);
		},
		transforms: (n) => Charts.measureTransforms(n),
		seed: () => director.valueOf(8, 'seed'),
	});

	const hooks = Object.freeze({
		started: () => started,
		reading: () => reading,
		state: () => director.state(),
		recipe: () => (started ? director.frame().recipe : null),
		look: () => look.probe(),
		shotMode: () => shots.mode(),
		trail: () => [...trail],
		clearTrail: () => {
			trail.length = 0;
		},
		surface: () => probeSurface(ocean.surface),
		sliders,
		setSlider,
		press,
		// Test hooks: the camera's pose and the tilt range it may orbit through; the next `frames`
		// frames' pictures (the step, whether the picture was held, the sea's tallest vertex).
		pose: () => rig.pose(),
		tilt: () => tilt,
		watchPictures: (frames) => {
			pictures = [];
			watching = frames;
		},
		pictures: () => [...pictures],
	});

	return Object.freeze({ setScroll, beforeStep, afterStep, holdsPicture: () => holding, sliders, setSlider, press, charts, hooks });
}
