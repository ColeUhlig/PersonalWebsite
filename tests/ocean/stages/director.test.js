import { test } from 'node:test';
import * as expect from '../expect.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';
import * as Ocean from '../../../content/ocean/js/engine/ocean.js';
import { probeSurface } from '../../../content/ocean/js/engine/surfaceProbe.js';
import { createDirector } from '../../../content/ocean/js/stages/director.js';
import { STEP_COUNT } from '../../../content/ocean/js/stages/recipes.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const SUN = [-0.9526530504226685, 0.2821884751319885, 0.11323313415050507];

function build(query = '?tier=Low', options) {
	let clock = 0;
	const ocean = Ocean.create(readConfig(query), {
		spawnCascade: () => createInProcessWorker(createCascadeWorker),
		spawnPainter: () => createInProcessWorker(createPainterWorker),
		now: () => clock,
		log: { warn() {} },
	});
	Ocean.attachSink(ocean, { uploadColourBand() {}, uploadMaskOrNormal() {}, uploadRoughness() {} });
	const director = createDirector(ocean, options);
	const advance = async (frames, each) => {
		for (let i = 0; i < frames; i++) {
			clock += 1 / 60;
			each?.(i);
			director.frame();
			Ocean.step(ocean, 1 / 60, [0, 0], [0, 14, 40], SUN);
			await flush();
		}
	};
	return { ocean, director, advance };
}

const finite = (ocean) => ocean.surface.patches.every((p) => p.positions.every(Number.isFinite) && p.normals.every(Number.isFinite));

test('step 2 puts one sine wave on the surface: along z only, nothing sideways', async () => {
	const { ocean, director, advance } = build();
	director.setStep(2);
	await advance(3);
	const probe = probeSurface(ocean.surface);
	expect.equal(probe.xSpread, 0, 'no change along x');
	expect.truthy(probe.zSpread > 0.2, `changes along z: ${probe.zSpread}`);
	expect.equal(probe.maxLateral, 0, 'no sideways motion');
	expect.equal(Ocean.status(ocean).source, 'waves', 'a teaching source');
});

test('every step configures without error and draws a finite surface', async () => {
	const { ocean, director, advance } = build();
	for (let step = 1; step <= STEP_COUNT; step++) {
		director.setStep(step);
		await advance(4);
		expect.truthy(finite(ocean), `step ${step} finite`);
		expect.equal(director.frame().recipe.step, step, `step ${step} shown`);
	}
	expect.equal(Ocean.status(ocean).source, 'fft', 'the finale is the FFT');
});

test('a slider value is clamped, kept per step, and survives a visit elsewhere', async () => {
	const { ocean, director, advance } = build();
	director.setStep(2);
	expect.equal(director.setSlider('amplitude', 9), 4, 'clamped to the slider');
	director.setStep(3);
	await advance(2);
	director.setStep(2);
	await advance(2);
	expect.equal(director.sliders().find((s) => s.id === 'amplitude').value, 4, 'kept');
	expect.truthy(probeSurface(ocean.surface).maxAbsY > 3, 'and drawn');
	expect.equal(director.state().values[2].amplitude, 4, 'in the state');
});

test('setSlider refuses an id the step does not have and a value of the wrong kind (Review Focus 3)', () => {
	const { director } = build();
	director.setStep(1);
	const attempt = (fn) => {
		try {
			fn();
			return 'ok';
		} catch (error) {
			return error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
	};
	expect.truthy(attempt(() => director.setSlider('wind', 12)).includes('wind'), 'not a slider of step 1');
	expect.truthy(attempt(() => director.setSlider('wireframe', 'yes')).includes('wireframe'), 'not a boolean');
	expect.truthy(attempt(() => director.press('wireframe')).includes('counter'), 'press needs a counter');
	expect.truthy(attempt(() => director.setStep(14)).includes('step'), 'step 14');
	expect.truthy(attempt(() => director.setStep(3, Number.NaN)).includes('progress'), 'a NaN progress');
});

test('press on step 8 draws a new random sea', async () => {
	const { ocean, director, advance } = build();
	director.setStep(8);
	await advance(2);
	expect.equal(director.press('seed'), 8, 'seed 7 becomes 8');
	await advance(1);
	expect.equal(ocean.live.seed, 8, 'the ocean took it');
	expect.truthy(ocean.retune.pending.some(Boolean) || ocean.retune.lastFrame > 0, 'and retunes towards it');
});

test('the engine is configured only when something changed', async () => {
	let calls = 0;
	const { director, advance } = build('?tier=Low', {
		configure: (ocean, settings) => {
			calls += 1;
			Ocean.configureStage(ocean, settings);
		},
	});
	director.setStep(5);
	await advance(5);
	expect.equal(calls, 1, 'once for the step');
	director.setSlider('chop', 0.2);
	await advance(3);
	expect.equal(calls, 2, 'once for the slider');
	director.setStep(5, 0.4);
	await advance(3);
	expect.equal(calls, 3, 'once for the progress');
	director.setStep(5, 0.4);
	await advance(2);
	expect.equal(calls, 3, 'the same step and progress again: nothing');
});

test('frame() returns the look, the shot and the charts of the blended recipe', () => {
	const { director } = build();
	director.setStep(5, 0.5);
	const out = director.frame();
	expect.equal(out.shot.position.join(','), '0,153,57.5', 'halfway between the crest [0, 6, 25] and the look-down [0, 300, 90]');
	expect.equal(out.look.material, 'sea', 'the sea look');
	expect.equal(out.recipe.from, 5, 'from');
	expect.equal(out.charts, out.recipe.charts, 'charts');
});

test('on Medium the third layer toggle is unavailable (Review Focus 5)', () => {
	const { ocean, director } = build('?tier=Medium');
	director.setStep(10);
	const available = director.sliders().map((s) => `${s.id}:${s.available}`).join(',');
	expect.equal(available, 'layer1:true,layer2:true,layer3:false', 'two layers to toggle');
	const out = director.frame();
	expect.equal(out.recipe.engine.layers.join(','), 'true,true,true', 'the recipe still asks for three');
	expect.equal(Ocean.status(ocean).layers.length, 2, 'and the engine runs the two it has');
});

test('on Low only the first layer toggle is available, on High all three', () => {
	const low = build('?tier=Low').director;
	low.setStep(10);
	expect.equal(low.sliders().map((s) => `${s.id}:${s.available}`).join(','), 'layer1:true,layer2:false,layer3:false', 'one layer on Low');
	low.setStep(3);
	expect.equal(low.slidersFor(10).map((s) => s.available).join(','), 'true,false,false', 'the same read from another step');
	expect.equal(low.state().step, 3, 'without moving the story');
	const high = build('?tier=High').director;
	high.setStep(10);
	expect.equal(high.sliders().map((s) => s.available).join(','), 'true,true,true', 'three on High');
});

test('progress jittering across 0.5 between steps 6 and 7 flips the parts cleanly and keeps the FFT warm (Review Focus 2)', async () => {
	const { ocean, director, advance } = build('?tier=High');
	await advance(30, (i) => {
		director.setStep(6, i % 2 === 0 ? 0.49 : 0.51);
	});
	expect.truthy(finite(ocean), 'finite throughout');
	expect.equal(ocean.parts.cascades, true, 'the cascades kept running both sides of halfway');
	expect.equal(ocean.parts.painter, true, 'the painter too');
	expect.truthy(ocean.store.current[0].filled, 'layer 1 has fields, ready to show');
	director.setStep(7);
	await advance(2);
	expect.equal(Ocean.status(ocean).source, 'fft', 'step 7 shows the FFT');
	expect.equal(Ocean.status(ocean).layers.join(','), 'true,false,false', 'one layer');
});

function counted(query = '?tier=Low', extra = {}) {
	const count = { calls: 0 };
	const built = build(query, {
		configure: (ocean, settings) => {
			count.calls += 1;
			Ocean.configureStage(ocean, settings);
		},
		...extra,
	});
	return { ...built, count };
}

test('reading other steps, by accessor or by a save/flip/restore round trip, never reconfigures', async () => {
	const { director, advance, count } = counted();
	director.setStep(7, 0.3);
	await advance(2);
	const before = count.calls;
	await advance(10, () => {
		const saved = director.state();
		director.setStep(8, 0);
		director.sliders();
		director.setStep(saved.step, saved.progress);
	});
	expect.equal(count.calls, before, 'ten round trips over ten frames: no configure');
	await advance(3, () => {
		director.slidersFor(8);
		director.valueOf(2, 'amplitude');
	});
	expect.equal(count.calls, before, 'the accessors: no configure either');
	expect.equal(director.state().step, 7, 'still on step 7');
	expect.equal(director.state().progress, 0.3, 'at the same progress');
});

test('slidersFor and valueOf read any step without moving the story', () => {
	const { director } = build();
	director.setStep(2);
	director.setSlider('amplitude', 3);
	director.setStep(8);
	expect.equal(director.valueOf(2, 'amplitude'), 3, 'a stored value');
	expect.equal(director.valueOf(2, 'wavelength'), 40, 'a default');
	const two = director.slidersFor(2);
	expect.equal(two.map((s) => s.id).join(','), 'amplitude,wavelength,speed', 'step 2 sliders');
	expect.equal(two[0].value, 3, 'with values');
	expect.truthy(Object.isFrozen(two) && Object.isFrozen(two[0]), 'frozen');
	expect.equal(director.state().step, 8, 'the story stays on step 8');
	expect.equal(director.sliders()[0].id, 'seed', 'and sliders() is still step 8');
	let message = '';
	try {
		director.valueOf(2, 'wind');
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('wind'), 'an unknown id is refused');
});

test('a slider set to the value it already has, or a press at the cap, does not reconfigure', async () => {
	const { director, advance, count } = counted();
	director.setStep(5);
	await advance(2);
	const before = count.calls;
	expect.equal(director.setSlider('chop', 1.3), 1.3, 'the default');
	expect.equal(director.setSlider('chop', 1.304), 1.3, 'snaps back to the default');
	await advance(2);
	expect.equal(count.calls, before, 'no configure for the default');
	expect.equal(director.state().values[5], undefined, 'and nothing stored');
	director.setSlider('chop', 0.2);
	await advance(1);
	expect.equal(count.calls, before + 1, 'a real change configures once');
	director.setSlider('chop', 0.2);
	await advance(2);
	expect.equal(count.calls, before + 1, 'the same value again: nothing');
	director.setStep(8);
	await advance(1);
	director.setSlider('seed', 9999);
	await advance(1);
	const capped = count.calls;
	expect.equal(director.press('seed'), 9999, 'the counter stays at its cap');
	await advance(2);
	expect.equal(count.calls, capped, 'a press at the cap: no configure');
});

test('on the last step progress means nothing, so it is kept as 0 and does not reconfigure', async () => {
	const { director, advance, count } = counted();
	director.setStep(13);
	await advance(2);
	const before = count.calls;
	director.setStep(13, 0.7);
	expect.equal(director.state().progress, 0, 'progress kept as 0');
	await advance(2);
	expect.equal(count.calls, before, 'no configure');
});

test('a configure that throws rethrows once, goes back to the last good values, and later frames work', async () => {
	let boom = false;
	const { director, advance } = build('?tier=Low', {
		configure: (ocean, settings) => {
			if (boom) throw new Error('boom');
			Ocean.configureStage(ocean, settings);
		},
	});
	director.setStep(2);
	await advance(1);
	const shown = director.frame();
	boom = true;
	director.setSlider('amplitude', 2);
	let throws = 0;
	let last = null;
	for (let i = 0; i < 3; i++) {
		try {
			last = director.frame();
		} catch {
			throws += 1;
		}
	}
	expect.equal(throws, 1, 'thrown once, not every frame');
	expect.equal(last, shown, 'the frame keeps what it showed');
	expect.equal(director.valueOf(2, 'amplitude'), 2.5, 'the value went back');
	expect.equal(director.state().values[2], undefined, 'nothing kept');
	boom = false;
	director.setStep(2, 0.5);
	const moved = director.frame();
	expect.equal(moved.recipe.progress, 0.5, 'a later change configures again');
	expect.truthy(moved.shot !== shown.shot, 'and the camera moves on');
	expect.equal(director.setSlider('amplitude', 2), 2, 'the slider works again');
	director.setStep(2);
	expect.equal(director.frame().recipe.engine.sine.amplitude, 2, 'and is shown');
	await advance(2);
});

// Task 9 minor: a frame served from the cache must still count as the engine having taken the
// values, or a later refused configure rolls back values an earlier step was given.
test('a configure refused later keeps a value set on another step while the cache served the frames', async () => {
	let boom = false;
	const { director, advance } = build('?tier=Low', {
		configure: (ocean, settings) => {
			if (boom) throw new Error('boom');
			Ocean.configureStage(ocean, settings);
		},
	});
	director.setStep(3);
	await advance(1);
	director.setStep(7);
	director.setSlider('wind', 20);
	director.setStep(3); // back before any frame: the cache serves step 3's frame unchanged
	director.frame();
	boom = true;
	director.setSlider('waveCount', 12);
	try {
		director.frame();
	} catch {
		// refused, and rolled back
	}
	expect.equal(director.valueOf(3, 'waveCount'), 8, "step 3's refused value went back");
	expect.equal(director.valueOf(7, 'wind'), 20, "step 7's value, taken earlier, is kept");
});

test('a slider value the engine would refuse throws at the call site, names the slider, and stores nothing', () => {
	let calls = 0;
	const { director } = build('?tier=Low', {
		configure: (ocean, settings) => {
			calls += 1;
			Ocean.configureStage(ocean, settings);
		},
		validate: (settings) => {
			if (settings.sine.amplitude > 3) {
				throw new RangeError('stage settings: sine amplitude too tall for this test');
			}
			return settings;
		},
	});
	director.setStep(2);
	director.frame();
	let error = null;
	try {
		director.setSlider('amplitude', 3.5);
	} catch (caught) {
		error = caught;
	}
	expect.truthy(error instanceof RangeError, 'a RangeError');
	expect.truthy(error.message.includes('slider amplitude') && error.message.includes('too tall'), error.message);
	expect.equal(director.valueOf(2, 'amplitude'), 2.5, 'nothing stored');
	director.frame();
	expect.equal(calls, 1, 'and nothing configured');
});

test('state() is frozen all the way to the values', () => {
	const { director } = build();
	director.setStep(2);
	director.setSlider('amplitude', 2);
	const s = director.state();
	expect.truthy(Object.isFrozen(s), 'the state');
	expect.truthy(Object.isFrozen(s.values), 'its values');
	expect.truthy(Object.isFrozen(s.values[2]), 'each step');
});
