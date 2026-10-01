// The stage director (A3; not a twin): the one object piece C drives. It holds which step the
// story is at, how far the scroll has run towards the next, and the slider values the visitor has
// set on each step. Each frame it hands the engine the blended recipe's settings -- only when the
// step, the progress or a slider value actually changed, since the engine keeps what it was last
// given -- and gives back what the renderer needs: the look, the camera shot and the charts, with
// the recipe itself. Browser-free; the Three.js side (render/stageLook.js, render/cameraRig.js
// applyShot) applies the look and the shot.
//
// For piece C: frame() is the per-frame call and allocates nothing when nothing changed. sliders(),
// slidersFor(), state() and Ocean.status() build fresh objects on every call (a step with stored
// values re-binds its whole recipe), so read them when the step or a value changes, not every
// frame.
import * as Ocean from '../engine/ocean.js';
import * as StageControl from '../engine/stageControl.js';
import { blendRecipes, engineSettings } from './blend.js';
import { getPath } from './paths.js';
import { recipeFor, STEP_COUNT } from './recipes.js';
import { applySliders, clampSlider, sliderById, sliderValue } from './sliders.js';

const LAYER_BIND = /^engine\.layers\.(\d+)$/;

/**
 * @param {object} ocean from Ocean.create
 * @param {{ configure?: (ocean: object, settings: object) => void, validate?: (settings: object) => object }} [options]
 *   the engine hook (Ocean.configureStage unless a test wraps it) and the settings check a slider
 *   value must pass before it is kept (StageControl.normalise unless a test injects one)
 */
export function createDirector(ocean, { configure = Ocean.configureStage, validate = StageControl.normalise } = {}) {
	let step = 1;
	let progress = 0;
	// step -> frozen { sliderId: value }. Replaced, never changed in place, so a Map kept from a
	// good frame is a snapshot to go back to, and a step's entry changes identity only when one
	// of its values changes.
	let values = new Map();
	let good = values; // the values the engine last took
	let current = null;
	// What the last configured (or refused) frame showed: its step and progress, and the stored
	// values of that step and the next (entries change identity only when a value changes).
	let lastKey = null;

	const boundIn = (map, n) => applySliders(recipeFor(n), map.get(n) ?? {});
	const bound = (n) => boundIn(values, n);
	// The blend a frame shows: the last step has no next, so its progress means nothing.
	const blendIn = (map, n, p) => (n === STEP_COUNT ? blendRecipes(boundIn(map, n), boundIn(map, n), 0) : blendRecipes(boundIn(map, n), boundIn(map, n + 1), p));

	function setStep(n, p = 0) {
		recipeFor(n); // throws for a step outside 1..STEP_COUNT
		if (typeof p !== 'number' || !Number.isFinite(p)) {
			throw new RangeError(`progress must be a finite number, got ${p}`);
		}
		step = n;
		progress = n === STEP_COUNT ? 0 : Math.min(Math.max(p, 0), 1);
	}

	// Every blend a value of step n takes part in must pass the engine's check before it is kept:
	// n itself, n at the progress being shown, and the previous step blending into n. That these
	// few stand for every progress relies on the check being per field with interval bounds
	// (StageControl.normalise): a lerped number lies between its two ends and a snapped one is one
	// of them, so a blend passes whenever both of its recipes do, and n's own recipe is the only
	// new end. A check that is not per field (a bound on a sum of fields) would need every blend.
	function check(next, id) {
		const blends = [blendIn(next, step, 0), blendIn(next, step, progress)];
		if (step > 1) {
			blends.push(blendIn(next, step - 1, 0.5));
		}
		try {
			for (const blended of blends) {
				validate(engineSettings(blended));
			}
		} catch (error) {
			throw new RangeError(`slider ${id}: ${error.message}`);
		}
	}

	function setSlider(id, value) {
		const recipe = bound(step);
		const slider = sliderById(recipe, id);
		const clamped = clampSlider(slider, value);
		if (clamped === getPath(recipe, slider.bind)) {
			return clamped; // already the stored value or the default: nothing changes
		}
		const next = new Map(values).set(step, Object.freeze({ ...(values.get(step) ?? {}), [id]: clamped }));
		check(next, id);
		values = next;
		return clamped;
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

	// Any step's sliders with their values, read without moving the story: piece C's charts read
	// other steps through this, never by flipping setStep back and forth.
	function slidersFor(n) {
		const recipe = bound(n);
		return Object.freeze(recipe.sliders.map((slider) => Object.freeze({ ...slider, value: sliderValue(recipe, slider.id), available: available(slider) })));
	}

	const sliders = () => slidersFor(step);
	const valueOf = (n, id) => sliderValue(bound(n), id);

	const keyNow = () => ({ step, progress, a: values.get(step), b: values.get(step + 1) });
	// Compared field by field, so the per-frame check builds no key object.
	const unchanged = () =>
		lastKey !== null && lastKey.step === step && lastKey.progress === progress && lastKey.a === values.get(step) && lastKey.b === values.get(step + 1);

	function frame() {
		if (current !== null && unchanged()) {
			// The engine runs exactly what this key shows, and any value of another step stored
			// since passed check(), so these values are good: a later refused configure must not
			// roll them back.
			good = values;
			return current;
		}
		const key = keyNow();
		const recipe = blendIn(values, step, progress);
		try {
			configure(ocean, engineSettings(recipe));
		} catch (error) {
			// Back to the values the engine last took; the frame keeps showing what it showed.
			// The key after going back is recorded so the same state does not throw again every
			// frame; the next step, progress or slider change tries afresh.
			values = good;
			if (current !== null) {
				lastKey = keyNow();
			}
			throw error;
		}
		good = values;
		lastKey = key;
		current = Object.freeze({ recipe, look: recipe.look, shot: recipe.shot, charts: recipe.charts });
		return current;
	}

	function state() {
		return Object.freeze({ step, progress, values: Object.freeze(Object.fromEntries(values)) });
	}

	return { setStep, setSlider, press, sliders, slidersFor, valueOf, frame, state };
}
