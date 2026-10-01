// The story's hold on the live ocean (piece C). It turns the scroll reading (ui/story.js) into A3's
// director step and progress, applies each frame's look and camera shot, lets the visitor orbit
// between shots (page/shotControl.js, within page/orbitLimits.js), and serves the panels' sliders
// and the charts' data. Until the visitor first scrolls into a step the ocean is left exactly as A2
// built it. Above step 1 (the opening) it shows the last step's recipe (the finale), the finished
// sea, under the opening camera. The position (step + progress) is smoothed toward the scroll and
// cut when it jumps more than a step, so a fling never sweeps the engine through the recipes in
// between (page/scrollMap.js). The director blends by holdThenBlend of the progress (page/scrollMap.js):
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
// On a touch-first phone the visitor may tilt the phone to swing the camera a little round the
// shot (Task 9b: ui/tilt.js hands a follower to useTilt, page/tiltLook.js does the maths). The
// offset is applied to the pose the shot asks for, the opening's included, and the tilt range is
// worked out from the shot itself, so the offset camera is then held inside it: the floor, the tilt
// range and the reach hold whatever the phone does. With no offset nothing extra runs.
// C2: each frame also applies the flat graph (render/graphStage.js) and the surface overlays
// (render/surfaceOverlays.js); while the graph's backdrop is half opaque or more the orbit and the
// phone's tilt are held: a camera the visitor dragged eases back to the shot as the hold comes on,
// and the tilt eases out and back in as a step change eases it.
import * as Charts from '../engine/charts.js';
import * as Ocean from '../engine/ocean.js';
import { probeSurface } from '../engine/surfaceProbe.js';
import { createDirector } from '../stages/director.js';
import { recipeFor, STEP_COUNT } from '../stages/recipes.js';
import { createStageLook } from '../render/stageLook.js';
import { createGraphStage } from '../render/graphStage.js';
import { createSurfaceOverlays } from '../render/surfaceOverlays.js';
import { GRAPH_HOLD } from '../stages/graph.js';
import { stepOf } from '../stages/steps.js';
import { SHOTS } from '../render/cameraRig.js';
import { movingReach, polarRange } from '../page/orbitLimits.js';
import { holdThenBlend, positionOf, smoothPosition, splitPosition } from '../page/scrollMap.js';
import { createShotControl, resolveShot } from '../page/shotControl.js';
import { applyOffset, clampPolar, isZeroOffset } from '../page/tiltLook.js';

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
	// C2: the flat graph and the arrows on the surface (spec 10.4, 10.7).
	const graph = createGraphStage({ view, ocean, look, reducedMotion });
	const overlays = createSurfaceOverlays({ view, ocean });
	const focusNow = [0, 0];
	// True while the graph's backdrop is at least GRAPH_HOLD opaque: the visitor's orbit and the
	// phone's tilt are held then, so nobody drags the camera off the graph.
	let graphHeld = false;
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
	// the camera does not jump at the snap into the finale however long the page has been open.
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
	// The phone's tilt (useTilt): its follower, the play clock it last read, the tilted pose
	// (rewritten each frame it is used), whether the opening was last placed tilted, and, when the
	// camera was last placed tilted, the pose it was tilted from.
	let tiltSource = null;
	let tiltClock = null;
	const tiltedPose = { position: [0, 0, 0], target: [0, 0, 0] };
	let tiltedOpening = false;
	const untiltedPose = { position: [0, 0, 0], target: [0, 0, 0] };
	let placedTilted = false;
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

	// How long the shot's drift has run. Leaving the finale (scrolling back up into the glow step,
	// where the blend still asks for the drift) or the shot no longer asking for it lets the drift
	// go, and the camera eases from where the drift left it instead of jumping to the still shot.
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

	// The phone's tilt for this frame at step `key` (0 for the opening), or null when there is none:
	// the follower runs every frame so it sees each step change, on the play clock's seconds.
	function tiltOffset(key) {
		if (tiltSource === null) {
			return null;
		}
		const now = Ocean.teachTime(ocean);
		const seconds = tiltClock === null ? 0 : Math.min(Math.max(now - tiltClock, 0), MAX_FRAME_SECONDS);
		tiltClock = now;
		// The graph's hold eases the tilt out (and back in) like a step change (tiltLook.js).
		const offset = tiltSource.frame(key, seconds, graphHeld);
		return isZeroOffset(offset) ? null : offset;
	}

	// Before the first scroll the camera is A2's opening shot; a tilt swings it round that shot, and
	// once the tilt is back to nothing the shot itself is put back.
	function tiltOpening() {
		const offset = tiltOffset(0);
		if (offset !== null || tiltedOpening) {
			place(openingShot, offset);
			tiltedOpening = offset !== null;
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
		// Only a return reads where the camera is (a shot or a cut ignores it). A tilted camera returns
		// from the pose it was tilted from, since the tilt goes on top of whatever the return gives.
		const current = shots.mode() === 'shot' ? null : currentPose();
		const pose = shots.frame(key, current, target, seconds, applyOptions);
		cutPending = false;
		const offset = tiltOffset(key);
		if (pose) {
			place(pose, offset);
		}
	}

	// Where the camera stands for a return, without the phone's tilt (a copy: the return keeps it).
	function currentPose() {
		if (placed !== null && placedTilted) {
			return { position: [...untiltedPose.position], target: [...untiltedPose.target] };
		}
		return rig.pose();
	}

	// Puts the camera at `pose` turned by the phone's tilt `offset` (null for none), and works out
	// its tilt range, only when either changed. The range is the shot's own (worked out before the
	// offset), and the tilted camera is held inside it.
	function place(pose, offset) {
		const stale = tiltAspect !== view.camera.aspect || !samePose(tiltPose, pose);
		if (stale) {
			limitTilt(pose);
		}
		const final = offset === null ? pose : clampPolar(applyOffset(pose, offset, tiltedPose), tilt.min, tilt.max, tiltedPose);
		if (!stale && samePose(placed, final)) {
			return;
		}
		rig.applyShot({ position: final.position, target: final.target, move: 'still' }, 0);
		for (let i = 0; i < 3; i++) {
			placedPose.position[i] = final.position[i];
			placedPose.target[i] = final.target[i];
			untiltedPose.position[i] = pose.position[i];
			untiltedPose.target[i] = pose.target[i];
		}
		placedTilted = offset !== null;
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
			if (tiltSource !== null) {
				tiltOpening();
			}
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
		graph.apply(out.look.graph);
		overlays.apply(out.look.overlay);
		const wasHeld = graphHeld;
		graphHeld = out.look.graph.opacity >= GRAPH_HOLD;
		// A camera the visitor dragged before the hold came on goes back to the shot (Task 0 fix
		// round 1): the graph must never be seen from off its shot.
		if (graphHeld && !wasHeld) {
			shots.release();
		}
		rig.holdOrbit(graphHeld);
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
		graph.frame(ocean.teachT);
		overlays.frame(ocean.teachT, rig.focus(focusNow));
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
	// call, through the cache the dev route uses too. The random-sea step's sea is its recipe's own (it
	// has no sea sliders), so a blend from the jonswap step does not rebuild them every frame.
	// C2 (Task 0 fix round 1): one cache per step, so the random-sea step's arrows (its seed slider)
	// and the time step's (its own recipe seed, pre-flight R13) never rebuild each other every frame.
	const arrowCaches = new Map();
	const arrowsFor = (step) => {
		let cache = arrowCaches.get(step);
		if (!cache) {
			cache = Charts.createPhaseArrowCache({ sizes: ocean.preset.sizes, n: ocean.preset.n });
			arrowCaches.set(step, cache);
		}
		return cache;
	};
	// A step's seed: its New sea slider's value when it has one, else its recipe's own seed.
	const seedOf = (step) => (recipeFor(step).sliders.some((s) => s.id === 'seed') ? director.valueOf(step, 'seed') : recipeFor(step).engine.seed);
	// The spectrum chart's fixed top: JONSWAP at the wind and fetch sliders' maxima, so a stronger
	// wind raises the curve on the chart instead of rescaling the axis.
	let ceiling = null;
	const charts = Object.freeze({
		spectrum() {
			const params = { ...ocean.live.params, windSpeed: director.valueOf(stepOf('jonswap'), 'wind'), fetch: director.valueOf(stepOf('jonswap'), 'fetch') };
			return Charts.spectrumCurve(params, { sizes: ocean.preset.sizes, n: ocean.preset.n });
		},
		spectrumCeiling() {
			if (ceiling === null) {
				const slider = (id) => recipeFor(stepOf('jonswap')).sliders.find((s) => s.id === id);
				const storm = { ...ocean.live.params, windSpeed: slider('wind').max, fetch: slider('fetch').max };
				ceiling = Math.max(...Charts.spectrumCurve(storm, { sizes: ocean.preset.sizes, n: ocean.preset.n }).physical);
			}
			return ceiling;
		},
		// C2: an optional time, so the random-sea step's arrows can be drawn still at t = 0, and an
		// optional step whose sea and seed they show (lane E draws the time step's with its own seed,
		// pre-flight R13).
		phaseArrows(t = ocean.t, step = stepOf('random-sea')) {
			const sea = recipeFor(step).engine.sea;
			return arrowsFor(step)({ ...ocean.live.params, windSpeed: sea.windSpeed, fetch: sea.fetch }, seedOf(step), t);
		},
		transforms: (n) => Charts.measureTransforms(n),
		seed: (step = stepOf('random-sea')) => seedOf(step),
	});

	const hooks = Object.freeze({
		started: () => started,
		reading: () => reading,
		state: () => director.state(),
		recipe: () => (started ? director.frame().recipe : null),
		look: () => look.probe(),
		graph: () => graph.probe(),
		overlays: () => overlays.probe(),
		// C2 fix round 1: the phase arrows and the seed of a given step, as the charts read them.
		phaseArrows: (t, step) => charts.phaseArrows(t, step),
		seed: (step) => charts.seed(step),
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

	// ui/tilt.js hands over the phone's tilt once it is on: { frame(key, seconds) -> { yaw, pitch } }.
	const useTilt = (source) => {
		tiltSource = source;
		tiltClock = null;
	};

	return Object.freeze({ setScroll, beforeStep, afterStep, holdsPicture: () => holding, sliders, setSlider, press, charts, hooks, useTilt });
}
