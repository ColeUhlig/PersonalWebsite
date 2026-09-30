// The stage director (A3): the one object piece C drives. It holds which step the story is at,
// how far the scroll has run towards the next, and the slider values the visitor has set on each
// step. Each frame it hands the engine the blended recipe's settings -- only when the step, the
// progress or a slider changed, since the engine keeps what it was last given -- and gives back
// what the renderer needs: the look, the camera shot and the charts, with the recipe itself.
// Browser-free; the Three.js side (render/stageLook.js, render/cameraRig.js applyShot) applies the
// look and the shot.
import * as Ocean from '../engine/ocean.js';
import { blendRecipes, engineSettings } from './blend.js';
import { getPath } from './paths.js';
import { recipeFor, STEP_COUNT } from './recipes.js';
import { applySliders, clampSlider, sliderById, sliderValue } from './sliders.js';

const LAYER_BIND = /^engine\.layers\.(\d+)$/;

/**
 * @param {object} ocean from Ocean.create
 * @param {{ configure?: (ocean: object, settings: object) => void }} [options] the engine hook;
 *   Ocean.configureStage unless a test wraps it
 */
export function createDirector(ocean, { configure = Ocean.configureStage } = {}) {
	let step = 1;
	let progress = 0;
	const values = new Map(); // step -> frozen { sliderId: value }
	let current = null;
	let dirty = true;

	const bound = (n) => applySliders(recipeFor(n), values.get(n) ?? {});

	function setStep(n, p = 0) {
		recipeFor(n); // throws for a step outside 1..13
		if (typeof p !== 'number' || !Number.isFinite(p)) {
			throw new RangeError(`progress must be a finite number, got ${p}`);
		}
		const clamped = Math.min(Math.max(p, 0), 1);
		if (n !== step || clamped !== progress) {
			step = n;
			progress = clamped;
			dirty = true;
		}
	}

	function setSlider(id, value) {
		const slider = sliderById(recipeFor(step), id);
		const next = clampSlider(slider, value);
		values.set(step, Object.freeze({ ...(values.get(step) ?? {}), [id]: next }));
		dirty = true;
		return next;
	}

	function press(id) {
		const recipe = bound(step);
		const slider = sliderById(recipe, id);
		if (slider.kind !== 'counter') {
			throw new RangeError(`slider ${id} is a ${slider.kind}, not a counter`);
		}
		return setSlider(id, getPath(recipe, slider.bind) + 1);
	}

	// A layer toggle for a cascade this tier does not run (Medium has two, Low one) is shown
	// unavailable rather than hidden, so the panel can say why.
	function available(slider) {
		const match = LAYER_BIND.exec(slider.bind);
		return match ? Number(match[1]) < ocean.preset.sizes.length : true;
	}

	function sliders() {
		const recipe = bound(step);
		return recipe.sliders.map((slider) => Object.freeze({ ...slider, value: sliderValue(recipe, slider.id), available: available(slider) }));
	}

	function frame() {
		if (dirty) {
			const from = bound(step);
			const last = step === STEP_COUNT;
			const recipe = blendRecipes(from, last ? from : bound(step + 1), last ? 0 : progress);
			configure(ocean, engineSettings(recipe));
			current = Object.freeze({ recipe, look: recipe.look, shot: recipe.shot, charts: recipe.charts });
			dirty = false;
		}
		return current;
	}

	function state() {
		return Object.freeze({ step, progress, values: Object.fromEntries(values) });
	}

	return { setStep, setSlider, press, sliders, frame, state };
}
