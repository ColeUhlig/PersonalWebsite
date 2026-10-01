// The dev route in the page (A3; not a twin): with ?step=N&progress=P the stage director drives
// the ocean straight from the URL, applying each frame's look and camera shot, so every step can be
// loaded, tested and screenshotted without the story. Piece C replaces the URL with the scroll story and
// keeps the director; the hooks on window.__ocean.stage stay for the browser tests.
import * as Charts from '../engine/charts.js';
import * as Ocean from '../engine/ocean.js';
import { probeSurface } from '../engine/surfaceProbe.js';
import { createDirector } from '../stages/director.js';
import { recipeFor } from '../stages/recipes.js';
import { resolveSliderValues } from '../stages/route.js';
import { createStageLook } from '../render/stageLook.js';
import { createGraphStage } from '../render/graphStage.js';
import { createSurfaceOverlays } from '../render/surfaceOverlays.js';

export function startStageRoute({ route, ocean, view, rig, meshes, materials, config }) {
	const director = createDirector(ocean);
	director.setStep(route.step, route.progress);
	const { values, warnings } = resolveSliderValues(recipeFor(route.step), route.sliders);
	for (const warning of warnings) {
		console.warn(`[ocean] ${warning}`);
	}
	// A value the slider takes but the engine would refuse (director.setSlider throws, naming the
	// slider) is dropped with a warning like any other bad route value, rather than stopping the page.
	for (const [id, value] of Object.entries(values)) {
		try {
			director.setSlider(id, value);
		} catch (error) {
			console.warn(`[ocean] s.${id}=${value} refused; ignored (${error.message})`);
		}
	}
	const look = createStageLook({ view, meshes, materials, config, surface: ocean.surface });
	// C2: the flat graph and the arrows on the surface (spec 10.4, 10.7).
	const graph = createGraphStage({ view, ocean, look });
	const overlays = createSurfaceOverlays({ view, ocean });
	const focusNow = [0, 0];

	// The teaching clock when the shot's move last became 'drift': the finale turns from there, so
	// the camera does not jump at the snap into the finale however long the page has been open. The
	// route's `drift` pins it to one point of the circle instead (captures, tests).
	let driftStart = null;
	function shotSeconds(shot) {
		if (shot.move !== 'drift') {
			driftStart = null;
			return 0;
		}
		if (route.drift !== null) {
			return route.drift;
		}
		const now = Ocean.teachTime(ocean);
		driftStart ??= now;
		return now - driftStart;
	}

	// A refused frame is reported once per distinct error, not on every frame it repeats on.
	const reported = new Set();

	// The phase arrows are built once per sea (a cascade build) and turned every call; the story
	// shares the cache (engine/charts.js createPhaseArrowCache).
	const arrowsAt = Charts.createPhaseArrowCache({ sizes: ocean.preset.sizes, n: ocean.preset.n });
	const phaseArrows = () => arrowsAt(ocean.live.params, ocean.live.seed, ocean.t);

	return {
		// Before Ocean.step: the recipe's settings reach the engine and its look and shot the scene,
		// so the rings follow the shot's target in the same frame.
		// A frame the engine refuses (the director has already gone back to the values it last took)
		// is reported (once per distinct error) and skipped, so the page's frame loop keeps running.
		beforeStep() {
			let out;
			try {
				out = director.frame();
			} catch (error) {
				if (!reported.has(error.message)) {
					reported.add(error.message);
					console.error('[ocean] the stage frame was refused', error);
				}
				return;
			}
			look.apply(out.look);
			graph.apply(out.look.graph);
			overlays.apply(out.look.overlay);
			const seconds = shotSeconds(out.shot);
			if (route.shots) {
				rig.applyShot(out.shot, seconds);
			}
		},
		afterStep() {
			view.settleEnvironment();
			graph.frame(ocean.teachT);
			overlays.frame(ocean.teachT, rig.focus(focusNow));
		},
		hooks: Object.freeze({
			set: (step, progress = 0) => director.setStep(step, progress),
			setSlider: (id, value) => director.setSlider(id, value),
			press: (id) => director.press(id),
			sliders: () => director.sliders(),
			recipe: () => director.frame().recipe,
			state: () => director.state(),
			surface: () => probeSurface(ocean.surface),
			look: () => look.probe(),
			graph: () => graph.probe(),
			overlays: () => overlays.probe(),
			spectrum: () => Charts.spectrumCurve(ocean.live.params, { sizes: ocean.preset.sizes, n: ocean.preset.n }),
			phaseArrows,
			transforms: (n) => Charts.measureTransforms(n),
		}),
	};
}
