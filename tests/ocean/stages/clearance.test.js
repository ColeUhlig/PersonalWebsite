// How close the water comes to the camera's lens in the story's shots (A3 final review, I1; not a
// twin). Every recipe shot and every blend between neighbours at PROGRESS_STEP, and the finale's
// drift circle, is checked against the sea that frame shows, sampled by the engine's own samplers:
//   * the FFT steps against the hero sea: the three High cascades and the swells, built as
//     Ocean.create builds them (WaveField.create), synthesised every TIME_STEP over the whole 120 s
//     loop and read with Cascade.sampleHeight and Swells.sample, as the surface write reads them;
//   * the Gerstner steps against their wave source (WaveSampler over the sine or the teaching bank)
//     at every chop the step's sliders reach, over GERSTNER_SECONDS of the teaching clock.
// The sea is read at the finest ring's vertices (2 studs apart at High) within SEARCH of the camera,
// each moved by its own displacement; the water "under the lens" is the tallest displaced vertex
// that lands within LENS of the camera's x and z. The drift's time and the sea's are unrelated (the
// drift starts when the visitor reaches step 13), so every point of the circle is tried at every
// time. It fails if the water ever comes within MARGIN of the camera's height.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as Swells from '../../../content/ocean/js/core/swells.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as WaveField from '../../../content/ocean/js/core/waveField.js';
import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';
import { LOOP_PERIOD, readConfig, SEED, SWELL_SPECS } from '../../../content/ocean/js/engine/config.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { blendRecipes } from '../../../content/ocean/js/stages/blend.js';
import { DRIFT_PERIOD, shotPosition } from '../../../content/ocean/js/stages/drift.js';
import { recipeFor, STEP_COUNT } from '../../../content/ocean/js/stages/recipes.js';

const PROGRESS_STEP = 0.1;
const TIME_STEP = 0.5; // seconds between samples of the sea
const GERSTNER_SECONDS = 240; // the Gerstner sea never loops; four minutes of its clock
const DRIFT_SAMPLES = 144; // points around the drift circle: 7 studs apart at its 160-stud radius
const LENS = 4.5; // half the square around the camera's x and z the water is read over
const MARGIN = 1.5; // studs: the 0.5 near plane plus one stud
const SEARCH = LENS + 14; // how far out a vertex may start and still land under the lens
const MAX_LATERAL = SEARCH - LENS; // the widest displacement SEARCH allows for (checked below)
const PRESET = Tier.presets.High;
const SPACING = PRESET.rings[0].spacing;

const config = readConfig('');

function heroSea() {
	const swells = SWELL_SPECS.map((spec) => ({ ...spec, amplitude: spec.amplitude * config.swellScale }));
	return WaveField.create({ params: config.params, n: PRESET.n, sizes: PRESET.sizes, seed: SEED, loopPeriod: LOOP_PERIOD, chop: config.chop, swells });
}

// The hero sea's height and sideways move at (x, z) into out[0..2], at the time the cascades were
// last synthesised (the swells at `t`).
function heroSample(field, t, x, z, out) {
	const chop = field.config.chop;
	let height = 0;
	let dx = 0;
	let dz = 0;
	for (const cascade of field.cascades) {
		const s = Cascade.sampleHeight(cascade, x, z, CASCADE_OUT);
		height += s[0];
		dx += s[1] * chop;
		dz += s[2] * chop;
	}
	if (!Swells.isSilent(field.swells)) {
		const swell = Swells.sample(field.swells, t, x, z, chop, SWELL_OUT);
		dx += swell[0];
		height += swell[1];
		dz += swell[2];
	}
	out[0] = height;
	out[1] = dx;
	out[2] = dz;
	return out;
}
const CASCADE_OUT = new Float64Array(3);
const SWELL_OUT = new Float64Array(7);

// The tallest water under the lens at (cx, cz), from `sample(x, z, out)` writing height, dispX,
// dispZ into out[0..2]; also the widest displacement met, so the search is known to be wide enough.
function underLens(cx, cz, sample, out, widest) {
	let tallest = -Infinity;
	const x0 = SPACING * Math.floor((cx - SEARCH) / SPACING);
	const z0 = SPACING * Math.floor((cz - SEARCH) / SPACING);
	for (let x = x0; x <= cx + SEARCH; x += SPACING) {
		for (let z = z0; z <= cz + SEARCH; z += SPACING) {
			sample(x, z, out);
			widest.value = Math.max(widest.value, Math.abs(out[1]), Math.abs(out[2]));
			if (Math.abs(x + out[1] - cx) < LENS && Math.abs(z + out[2] - cz) < LENS) {
				tallest = Math.max(tallest, out[0]);
			}
		}
	}
	return tallest;
}

// Every recipe's own shot and every neighbour blend.
function everyFrame() {
	const frames = [];
	for (let n = 1; n <= STEP_COUNT; n++) {
		frames.push({ name: `step ${n}`, blended: blendRecipes(recipeFor(n), recipeFor(n), 0) });
		if (n < STEP_COUNT) {
			for (let i = 1; i * PROGRESS_STEP < 1 - 1e-9; i++) {
				const p = i * PROGRESS_STEP;
				frames.push({ name: `${n}->${n + 1} at ${p.toFixed(1)}`, blended: blendRecipes(recipeFor(n), recipeFor(n + 1), p) });
			}
		}
	}
	return frames;
}

// The camera positions a frame puts the lens at: one for a still shot, the whole circle for a drift.
function lensPositions({ name, blended }) {
	const shot = blended.shot;
	if (shot.move !== 'drift') {
		return [{ name, position: shot.position }];
	}
	return Array.from({ length: DRIFT_SAMPLES }, (_, i) => {
		const seconds = (i / DRIFT_SAMPLES) * DRIFT_PERIOD;
		return { name: `${name} drifting at ${seconds.toFixed(1)} s`, position: shotPosition(shot, seconds) };
	});
}

// The lenses the water came within MARGIN of: how many, and the first few by name.
function report(worst) {
	const wet = worst.filter((w) => w.water > w.position[1] - MARGIN);
	const named = wet.slice(0, 8).map((w) => `${w.name}: water ${w.water.toFixed(2)} under a lens at y ${w.position[1].toFixed(2)} (t ${w.t.toFixed(2)})`);
	return wet.length === 0 ? '' : `${wet.length} of ${worst.length} lenses; ${named.join('; ')}`;
}

// The tallest the hero sea stands anywhere at the last synthesised time: every cascade's tallest
// cell added to every swell's amplitude. A lens above it (less MARGIN) needs no closer look.
function tallestAnywhere(field) {
	let sum = 0;
	for (const cascade of field.cascades) {
		let most = 0;
		for (const height of cascade.height) {
			most = Math.max(most, Math.abs(height));
		}
		sum += most;
	}
	for (let wave = 0; wave < field.swells.count; wave++) {
		sum += Math.abs(field.swells.packed[wave * WaveSampler.STRIDE + 2]);
	}
	return sum;
}

test('the FFT frames keep their lens clear of the hero sea over the whole loop and the drift circle', () => {
	const frames = everyFrame().filter(({ blended }) => blended.engine.source === 'fft');
	const lenses = frames.flatMap((frame) => lensPositions(frame).map((lens) => ({ ...lens, engine: frame.blended.engine, water: -Infinity, t: 0, read: false })));
	const field = heroSea();
	const out = new Float64Array(3);
	const widest = { value: 0 };
	let t = 0;
	const sample = (x, z, into) => heroSample(field, t, x, z, into);
	for (let i = 0; i * TIME_STEP < LOOP_PERIOD; i++) {
		t = i * TIME_STEP;
		for (let index = 1; index <= PRESET.sizes.length; index++) {
			WaveField.update(field, index, t);
		}
		const ceiling = tallestAnywhere(field);
		for (const lens of lenses) {
			if (ceiling < lens.position[1] - MARGIN) {
				continue;
			}
			lens.read = true;
			const water = underLens(lens.position[0], lens.position[2], sample, out, widest);
			if (water > lens.water) {
				lens.water = water;
				lens.t = t;
			}
		}
	}
	// A frame read closely must be running the hero sea (steps 7 to 13 differ only in their layers);
	// the blend out of step 6 still lerps the chop, but its camera is far above any crest.
	for (const lens of lenses.filter((l) => l.read)) {
		const e = lens.engine;
		const hero = e.sea.windSpeed === config.params.windSpeed && e.sea.fetch === config.params.fetch && e.seed === SEED && e.chop === config.chop;
		expect.truthy(hero, `${lens.name} is read against the hero sea but runs another`);
	}
	expect.truthy(lenses.some((l) => l.read), 'some lens is low enough to be read closely');
	expect.truthy(widest.value < MAX_LATERAL, `the search reaches every vertex that can land under the lens (widest move ${widest.value.toFixed(2)})`);
	expect.equal(report(lenses), '', 'the water reaches the lens');
});

test('the Gerstner frames keep their lens clear of their own waves at every chop the sliders reach', () => {
	const bank = WaveBanks.teachingBank();
	const frames = everyFrame().filter(({ blended }) => blended.engine.source !== 'fft');
	const out = new Float64Array(7);
	const widest = { value: 0 };
	const worst = [];
	for (const { name, blended } of frames) {
		const e = blended.engine;
		// The tallest each source can stand: the sine's height slider at its top, every summed wave's
		// amplitude added up. A lens clear of that is clear at any time.
		const heightSlider = recipeFor(2).sliders.find((s) => s.id === 'amplitude');
		const waves = e.source === 'sine' ? WaveBanks.nextSine(null, { ...e.sine, amplitude: heightSlider.max }, 0).bank : WaveBanks.withCount(bank, e.bank.count);
		const position = blended.shot.position;
		if (WaveBanks.bankExtent(waves) <= position[1] - MARGIN) {
			continue;
		}
		const chopSlider = recipeFor(blended.step).sliders.find((s) => s.id === 'chop');
		const chops = chopSlider ? [chopSlider.min, e.chop, chopSlider.max] : [e.chop];
		const lens = { name, position, water: -Infinity, t: 0 };
		for (const chop of chops) {
			for (let t = 0; t < GERSTNER_SECONDS; t += TIME_STEP) {
				const sample = (x, z, into) => {
					WaveSampler.sample(waves.packed, waves.count, t, x, z, chop, waves.weights, 0, into);
					// WaveSampler writes dx, dy, dz: put the height first, as underLens reads it.
					const dx = into[0];
					into[0] = into[1];
					into[1] = dx;
				};
				const water = underLens(position[0], position[2], sample, out, widest);
				if (water > lens.water) {
					lens.water = water;
					lens.t = t;
				}
			}
		}
		worst.push(lens);
	}
	expect.truthy(widest.value < MAX_LATERAL, `the search reaches every vertex that can land under the lens (widest move ${widest.value.toFixed(2)})`);
	expect.equal(report(worst), '', 'the water reaches the lens');
});
