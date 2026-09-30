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

test('step 2 puts one sine wave on the surface: along x only, nothing sideways', async () => {
	const { ocean, director, advance } = build();
	director.setStep(2);
	await advance(3);
	const probe = probeSurface(ocean.surface);
	expect.equal(probe.zSpread, 0, 'no change along z');
	expect.truthy(probe.xSpread > 0.2, `changes along x: ${probe.xSpread}`);
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
	expect.equal(out.shot.position.join(','), '0,352.5,272.5', 'halfway between the crest and the fly-up');
	expect.equal(out.look.material, 'sea', 'the sea look');
	expect.equal(out.recipe.from, 5, 'from');
	expect.equal(out.charts, out.recipe.charts, 'charts');
});

test('on Medium the third layer toggle is unavailable (Review Focus 5)', () => {
	const { director } = build('?tier=Medium');
	director.setStep(10);
	const available = director.sliders().map((s) => `${s.id}:${s.available}`).join(',');
	expect.equal(available, 'layer1:true,layer2:true,layer3:false', 'two layers to toggle');
	director.frame();
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
