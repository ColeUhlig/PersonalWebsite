// The story's hold on the live ocean (piece C). It turns the scroll reading (ui/story.js) into A3's
// director step and progress, applies each frame's look and camera shot, lets the visitor orbit
// between shots (page/shotControl.js, within page/orbitLimits.js), and serves the panels' sliders
// and the charts' data. Until the visitor first scrolls into a step the ocean is left exactly as A2
// built it. Above step 1 (the opening) it shows step 13's recipe, the finished sea, under the
// opening camera. The position (step + progress) is smoothed toward the scroll and cut when it jumps
// more than a step, so a fling never sweeps the engine through the recipes in between
// (page/scrollMap.js). The director blends by holdThenBlend of the progress (page/scrollMap.js):
// each step holds its own recipe while its panel is read, the first half of its section, and eases
// into the next over the second half; the smoothing and the jump check work in scroll units. Under
// reduced motion there is no smoothing, no blending of shots, no drift and no easing back.
// Scrolling back up out of the finale lets its drift go: the camera eases from where the drift left
// it to the still shot (page/shotControl.js returnToShot) rather than jumping there. The camera and
// its tilt range are set only when the pose (or the frame's aspect) changed, so a settled scroll
// costs nothing.
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
import { holdThenBlend, positionOf, smoothPosition, splitPosition } from '../page/scrollMap.js';
import { createShotControl, resolveShot } from '../page/shotControl.js';

const TRAIL_LENGTH = 64;
const MAX_FRAME_SECONDS = 0.25;
export const HOLD_MAX_FRAMES = 10;

// Whether a recipe's engine asks for an FFT layer this tier runs (the first `count` layers).
function wantsFftLayers(engine, count) {
	if (engine.source !== 'fft') {
		return false;
	}
	for (let i = 0; i < count && i < engine.layers.length; i++) {
		if (engine.layers[i]) {
			return true;
		}
	}
	return false;
}

const samePose = (a, b) =>
	a !== null &&
	a.position[0] === b.position[0] && a.position[1] === b.position[1] && a.position[2] === b.position[2] &&
	a.target[0] === b.target[0] && a.target[1] === b.target[1] && a.target[2] === b.target[2];

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
	let previousKey = 0;
	let clock = null;
	// The teaching clock when the shot's move last became 'drift': the finale turns from there, so
	// the camera does not jump at the snap into step 13 however long the page has been open.
	let driftStart = null;
	// Set when the scroll leaves the finale while the blend still asks for the drift: the drift is
	// let go (the camera eases back to the still shot) until the shot stops asking or the finale
	// is read again.
	let driftLetGo = false;
	let tilt = null;
	// The pose the tilt range was last worked out for, and the frame's aspect then; the pose last
	// put on the camera.
	const tiltPose = { position: [...openingShot.position], target: [...openingShot.target] };
	let tiltAspect = Number.NaN;
	// What the camera was last put at (copied, since the shot's pose is rewritten every frame), or
	// null when it must be put again whatever the pose.
	let placed = null;
	const placedPose = { position: [0, 0, 0], target: [0, 0, 0] };
	// The pose the shot asks for, rewritten every frame (resolveShot).
	const resolved = { position: [0, 0, 0], target: [0, 0, 0] };
	let applied = 0;
	let wantsLayers = false;
	let holding = false;
	let held = 0;
	let watching = 0;
	let pictures = [];
	let cameraFrames = 0;
	let cameraTrail = [];
	const stillShot = { position: null, target: null, move: 'still' };
	const applyOptions = { cut: false, ease: true };

	// The visitor moved the camera: what was last placed is no longer where it stands, so the next
	// pose the story asks for is placed even if it is the same one.
	rig.onUserOrbit(() => {
		shots.orbited(key);
		placed = null;
	});

	// The tilt range for `pose` at the frame's aspect now; the pose is copied, so a resize can work
	// the range out again for it (the visitor's free camera, the opening) after the shot's own pose
	// has been rewritten.
	function limitTilt(pose) {
		if (pose !== tiltPose) {
			for (let i = 0; i < 3; i++) {
				tiltPose.position[i] = pose.position[i];
				tiltPose.target[i] = pose.target[i];
			}
		}
		tiltAspect = view.camera.aspect;
		const range = polarRange(tiltPose, { aspect: tiltAspect, fovDegrees: view.camera.fov, reach });
		tilt = Object.freeze({ min: range.min, max: range.max, aspect: tiltAspect });
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
		director.setStep(step, reducedMotion ? 0 : holdThenBlend(progress));
		return step;
	}

	// How long the shot's drift has run. Leaving the finale (scrolling back up into step 12, where
	// the blend still asks for the drift) or the shot no longer asking for it lets the drift go, and
	// the camera eases from where the drift left it instead of jumping to the still shot.
	function shotSeconds(shot, now) {
		if (key === STEP_COUNT) {
			driftLetGo = false;
		} else if (previousKey === STEP_COUNT && shot.move === 'drift') {
			letGoOfDrift(now);
			driftLetGo = true;
		}
		if (shot.move !== 'drift') {
			letGoOfDrift(now);
			driftLetGo = false;
			return 0;
		}
		if (driftLetGo) {
			return 0;
		}
		driftStart ??= now;
		return now - driftStart;
	}

	function letGoOfDrift(now) {
		if (driftStart !== null && now > driftStart) {
			shots.returnToShot();
		}
		driftStart = null;
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
		let shot = out.shot;
		if (key === 0) {
			shot = openingShot;
		} else if (reducedMotion) {
			const own = recipeFor(key).shot;
			stillShot.position = own.position;
			stillShot.target = own.target;
			shot = stillShot;
		}
		const target = resolveShot(shot, shotSeconds(shot, now), resolved);
		applyOptions.cut = cutPending;
		applyOptions.ease = seconds > 0;
		// Only a return reads where the camera is (a shot or a cut ignores it).
		const current = shots.mode() === 'shot' ? null : rig.pose();
		const pose = shots.frame(key, current, target, seconds, applyOptions);
		cutPending = false;
		if (pose) {
			place(pose);
		}
	}

	// Puts the camera at `pose`, and works out its tilt range, only when either changed.
	function place(pose) {
		if (samePose(placed, pose) && tiltAspect === view.camera.aspect) {
			return;
		}
		limitTilt(pose);
		rig.applyShot({ position: pose.position, target: pose.target, move: 'still' }, 0);
		for (let i = 0; i < 3; i++) {
			placedPose.position[i] = pose.position[i];
			placedPose.target[i] = pose.target[i];
		}
		placed = placedPose;
		applied += 1;
	}

	// Before Ocean.step (dt is the frame's wall time and is not used: motion reads the play clock).
	function beforeStep() {
		// A resize changes the frame's aspect, and with it how far the visitor may tilt.
		if (view.camera.aspect !== tiltAspect) {
			limitTilt(tiltPose);
		}
		if (!started) {
			return;
		}
		const now = Ocean.teachTime(ocean);
		const seconds = clockSeconds(now);
		previousKey = key;
		key = followScroll(seconds);
		trail.push(key);
		if (trail.length > TRAIL_LENGTH) trail.shift();
		const out = directorFrame();
		if (!out) {
			return;
		}
		look.apply(out.look);
		applyCamera(out, seconds, now);
		if (cameraFrames > 0) {
			cameraFrames -= 1;
			cameraTrail.push(Object.freeze({ clock: now, step: key, mode: shots.mode(), position: rig.pose().position }));
		}
		wantsLayers = wantsFftLayers(out.recipe.engine, ocean.preset.sizes.length);
	}

	// After Ocean.step, when this frame's sea is written: hold the picture while the recipe asks for
	// FFT layers and none is sampled yet.
	function afterStep() {
		if (!started) {
			return;
		}
		view.settleEnvironment();
		const flat = wantsLayers && !Ocean.anyLayerSampled(ocean);
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
	// call, through the cache the dev route uses too. Step 8's sea is its recipe's own (it has no sea
	// sliders), so a blend from step 7 does not rebuild them every frame.
	const arrowsAt = Charts.createPhaseArrowCache({ sizes: ocean.preset.sizes, n: ocean.preset.n });
	const charts = Object.freeze({
		spectrum() {
			const params = { ...ocean.live.params, windSpeed: director.valueOf(7, 'wind'), fetch: director.valueOf(7, 'fetch') };
			return Charts.spectrumCurve(params, { sizes: ocean.preset.sizes, n: ocean.preset.n });
		},
		phaseArrows() {
			const sea = recipeFor(8).engine.sea;
			return arrowsAt({ ...ocean.live.params, windSpeed: sea.windSpeed, fetch: sea.fetch }, director.valueOf(8, 'seed'), ocean.t);
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
		// Test hooks: the camera's pose and the tilt range it may orbit through; how many times the
		// story has put the camera somewhere new; whether the visitor may orbit at all; the next
		// `frames` frames' pictures (the step, whether the picture was held, the sea's tallest vertex).
		pose: () => rig.pose(),
		tilt: () => tilt,
		applied: () => applied,
		orbitEnabled: () => rig.orbitEnabled(),
		watchPictures: (frames) => {
			pictures = [];
			watching = frames;
		},
		pictures: () => [...pictures],
		// The play clock (Ocean.teachTime) and, for the next `frames` frames, the clock each frame
		// moved the camera by and where the camera stood after it.
		clock: () => Ocean.teachTime(ocean),
		watchCamera: (frames) => {
			cameraTrail = [];
			cameraFrames = frames;
		},
		cameraTrail: () => [...cameraTrail],
	});

	return Object.freeze({ setScroll, beforeStep, afterStep, holdsPicture: () => holding, sliders, setSlider, press, charts, hooks });
}
