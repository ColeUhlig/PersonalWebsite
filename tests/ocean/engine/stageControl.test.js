import { test } from 'node:test';
import * as expect from '../expect.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';
import * as Ocean from '../../../content/ocean/js/engine/ocean.js';
import * as StageControl from '../../../content/ocean/js/engine/stageControl.js';
import * as SurfaceState from '../../../content/ocean/js/engine/surfaceState.js';
import { probeSurface } from '../../../content/ocean/js/engine/surfaceProbe.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const SUN = [-0.9526530504226685, 0.2821884751319885, 0.11323313415050507];

// A Worker-shaped wrapper that counts every message the ocean posts, by type.
function counting(create, counts) {
	return () => {
		const inner = createInProcessWorker(create);
		const worker = {
			onmessage: null,
			onerror: null,
			postMessage: (message, transfer) => {
				counts[message.type] = (counts[message.type] ?? 0) + 1;
				inner.postMessage(message, transfer);
			},
			terminate: () => inner.terminate(),
		};
		inner.onmessage = (event) => worker.onmessage?.(event);
		inner.onerror = (event) => worker.onerror?.(event);
		return worker;
	};
}

function build(query = '?tier=High', extra = {}) {
	const cascadeCounts = {};
	const painterCounts = {};
	let clock = 0;
	const ocean = Ocean.create(readConfig(query), {
		spawnCascade: counting(createCascadeWorker, cascadeCounts),
		spawnPainter: counting(createPainterWorker, painterCounts),
		now: () => clock,
		log: { warn() {} },
		...extra,
	});
	Ocean.attachSink(ocean, { uploadColourBand() {}, uploadMaskOrNormal() {}, uploadRoughness() {} });
	const advance = async (frames, each) => {
		for (let i = 0; i < frames; i++) {
			clock += 1 / 60;
			each?.(i);
			Ocean.step(ocean, 1 / 60, [0, 0], [0, 14, 40], SUN);
			await flush();
		}
	};
	return { ocean, cascadeCounts, painterCounts, advance };
}

const settings = (over = {}) => ({ ...StageControl.DEFAULT_SETTINGS, ...over });
const TEACHING = { maps: false, foam: false, glow: false, layers: [true, false, false], chop: 0 };
const since = (counts, before, type) => (counts[type] ?? 0) - (before[type] ?? 0);

test("before any stage is configured the ocean is A2's: every part on, the FFT shown", async () => {
	const { ocean, advance } = build('?tier=Low');
	await advance(6);
	const status = Ocean.status(ocean);
	expect.equal(status.source, 'fft', 'the FFT');
	expect.truthy(status.parts.cascades && status.parts.painter && status.parts.glow && !status.parts.still, 'every part on');
	expect.equal(status.tierReason, 'url', 'the tier came from the URL');
	expect.equal(status.seed, 7, 'the shipped seed');
});

test('a teaching step switches the cascades, the painter and the glow off: they cost nothing', async () => {
	const { ocean, cascadeCounts, painterCounts, advance } = build();
	await advance(12);
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'sine' }));
	const cascadeBefore = { ...cascadeCounts };
	const painterBefore = { ...painterCounts };
	const evolveSeconds = ocean.stage.evolve;
	const paintSeconds = ocean.stage.paint;
	await advance(30);
	expect.equal(since(cascadeCounts, cascadeBefore, 'evolve'), 0, 'no evolve requests');
	expect.equal(since(painterCounts, painterBefore, 'paint'), 0, 'no Paints');
	expect.equal(ocean.stage.evolve, evolveSeconds, 'no evolve time');
	expect.equal(ocean.stage.paint, paintSeconds, 'no paint time');
	expect.truthy(ocean.strengths.every((s) => s === 0), 'no glow');
	const probe = probeSurface(ocean.surface);
	expect.equal(probe.zSpread, 0, 'one sine along x');
	expect.truthy(probe.maxAbsY > 1 && probe.maxAbsY <= 1.5, `amplitude 1.5: ${probe.maxAbsY}`);
	expect.equal(Ocean.status(ocean).source, 'waves', 'the status says so');
});

test('the flat plane is written once and then skipped every frame', async () => {
	const { ocean, advance } = build('?tier=Low');
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'sine', sine: { amplitude: 0, wavelength: 40, speed: 8 } }));
	await advance(3);
	expect.equal(ocean.parts.still, true, 'still');
	for (const p of ocean.surface.patches) p.written = false;
	await advance(5);
	expect.equal(ocean.surface.skipped, true, 'skipped');
	expect.truthy(ocean.surface.patches.every((p) => !p.written), 'nothing written');
	expect.equal(probeSurface(ocean.surface).maxAbsY, 0, 'flat');
});

test('the teaching bank draws its waves; chop moves the vertices sideways', async () => {
	const { ocean, advance } = build('?tier=Low');
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'bank', bank: { count: 32 } }));
	await advance(2);
	expect.equal(ocean.waves.count, 32, 'all 32 waves');
	expect.equal(probeSurface(ocean.surface).maxLateral, 0, 'chop 0: no sideways motion');
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'bank', bank: { count: 32 }, chop: 1 }));
	await advance(2);
	expect.truthy(probeSurface(ocean.surface).maxLateral > 0.1, 'chop 1: pointy crests pull the vertices sideways');
});

test('layers: only the switched-on cascades evolve, the rings sample them and the painter reads them', async () => {
	const { ocean, cascadeCounts, painterCounts, advance } = build();
	await advance(6);
	const painterBefore = { ...painterCounts };
	Ocean.configureStage(ocean, settings({ layers: [true, false, false] }));
	expect.truthy(ocean.surface.ringSpecs.every((spec) => spec.cascades.every((c) => c === 1)), 'the rings sample cascade 1 only');
	expect.truthy(since(painterCounts, painterBefore, 'update') >= 2, 'the painter lists updated on both workers');
	expect.equal(ocean.painter.mapsConfig.colourCascades.join(','), '1', 'the painter reads cascade 1');
	expect.equal(ocean.painter.mapsConfig.normalCascades.length, 0, 'and paints no normal map');
	const cascadeBefore = { ...cascadeCounts };
	await advance(12);
	expect.equal(since(cascadeCounts, cascadeBefore, 'evolve'), 4, 'cascade 1 alone, once every three frames');
	expect.equal(Ocean.status(ocean).layers.join(','), 'true,false,false', 'the status says so');
});

test('a wind slider dragged every frame retunes one cascade at a time, never faster than the gap, and never reconfigures anything (Review Focus 1)', async () => {
	const { ocean, cascadeCounts, painterCounts, advance } = build();
	await advance(6);
	const cascadeBefore = { ...cascadeCounts };
	const painterBefore = { ...painterCounts };
	const retuneFrames = [];
	const retuned = new Set();
	const original = ocean.cascades.retune;
	ocean.cascades.retune = (index) => {
		retuneFrames.push(ocean.frame);
		retuned.add(index);
		return original(index);
	};
	await advance(60, (i) => Ocean.configureStage(ocean, settings({ sea: { windSpeed: 6 + (i % 20), fetch: 80000 } })));
	const most = Math.ceil(60 / StageControl.RETUNE_GAP_FRAMES) + 1;
	expect.truthy(retuneFrames.length >= 3 && retuneFrames.length <= most, `retunes: ${retuneFrames.length}`);
	for (let i = 1; i < retuneFrames.length; i++) {
		expect.truthy(retuneFrames[i] - retuneFrames[i - 1] >= StageControl.RETUNE_GAP_FRAMES, 'spaced by the gap');
	}
	expect.equal(retuned.size, 3, 'every cascade took its turn: none starved while the slider moved');
	expect.equal(since(cascadeCounts, cascadeBefore, 'retune'), retuneFrames.length, 'every retune reached a worker');
	expect.equal(since(cascadeCounts, cascadeBefore, 'configure'), 0, 'no cascade Configure');
	expect.equal(since(painterCounts, painterBefore, 'configure'), 0, 'no painter Configure: the foam is never wiped');
	await advance(30);
	expect.truthy(ocean.retune.pending.every((pending) => !pending), 'the last wind reached every cascade');
});

test('a storm grows the bounds before its waves arrive, and the surface stays inside them (Review Focus 4)', async () => {
	const { ocean, advance } = build();
	await advance(6);
	const before = ocean.surface.bounds.height;
	Ocean.configureStage(ocean, settings({ sea: { windSpeed: 25, fetch: 200000 } }));
	expect.truthy(ocean.surface.bounds.height > before, `grew: ${ocean.surface.bounds.height}`);
	expect.equal(ocean.bounds, ocean.surface.bounds, 'the ocean and the surface agree');
	await advance(40);
	SurfaceState.takeExtremes(ocean.surface);
	await advance(12);
	const [maxY, maxLateral] = SurfaceState.takeExtremes(ocean.surface);
	expect.truthy(maxY > 20, `the storm arrived: ${maxY}`);
	expect.truthy(maxY < ocean.surface.bounds.height - SurfaceState.SKIRT_MARGIN, 'inside the height bound, above the skirt');
	expect.truthy(maxLateral < ocean.surface.bounds.lateral, 'inside the lateral bound');
	Ocean.configureStage(ocean, settings({ sea: { windSpeed: 3, fetch: 5000 } }));
	expect.truthy(ocean.surface.bounds.height > before, 'the bounds never shrink');
});

test('settings the maths cannot take are refused before anything changes (Review Focus 3)', () => {
	const { ocean } = build('?tier=Low');
	const params = ocean.live.params;
	for (const [bad, name] of [
		[settings({ sea: { windSpeed: 0, fetch: 80000 } }), 'windSpeed'],
		[settings({ source: 'wobble' }), 'source'],
		[settings({ chop: Number.NaN }), 'chop'],
		[settings({ layers: 'all' }), 'layers'],
		[settings({ bank: { count: 40 } }), 'bank.count'],
		[settings({ sine: { amplitude: 1, wavelength: -3, speed: 1 } }), 'wavelength'],
		[settings({ warm: { fft: true } }), 'warm'],
	]) {
		let message = '';
		try {
			Ocean.configureStage(ocean, bad);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes(name), `${name}: ${message}`);
	}
	expect.equal(ocean.live.params, params, 'the sea is untouched');
	expect.equal(ocean.stageSettings, null, 'no settings adopted');
});

test('glow off zeroes every strength; the glow slider scales it', async () => {
	const { ocean, advance } = build('?tier=Low');
	await advance(4);
	const strongest = Math.max(...ocean.strengths);
	expect.truthy(strongest > 0, 'glowing');
	Ocean.configureStage(ocean, settings({ glowStrength: 60 }));
	await advance(2);
	expect.near(Math.max(...ocean.strengths), strongest * 2, 1e-4 * strongest, 'twice the strength');
	Ocean.configureStage(ocean, settings({ glow: false }));
	await advance(2);
	expect.truthy(ocean.strengths.every((s) => s === 0), 'dark');
});

test('chop and the foam sliders reach the painter as updates, never as a Configure', async () => {
	const { ocean, painterCounts, advance } = build('?tier=Low');
	await advance(4);
	const before = { ...painterCounts };
	Ocean.configureStage(ocean, settings({ chop: 0.5, foamKnobs: { whitecap: 0.7, decay: 0.8 } }));
	expect.equal(since(painterCounts, before, 'update'), 2, 'one update to each worker');
	expect.equal(since(painterCounts, before, 'configure'), 0, 'no Configure');
	expect.equal(ocean.painter.mapsConfig.chop, 0.5, 'chop kept');
	expect.equal(ocean.painter.colourConfig.foamWhitecap, 0.7, 'whitecap kept');
	Ocean.configureStage(ocean, settings({ chop: 0.5, foamKnobs: { whitecap: 0.7, decay: 0.8 } }));
	expect.equal(since(painterCounts, before, 'update'), 2, 'the same settings again send nothing');
});

test('a warm part runs while the scroll sits between two recipes, so it is ready when it shows', async () => {
	const { ocean, cascadeCounts, painterCounts, advance } = build();
	await advance(4);
	const cascadeBefore = { ...cascadeCounts };
	const painterBefore = { ...painterCounts };
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'bank', warm: { fft: true, maps: true, layers: [true, false, false] } }));
	await advance(12);
	expect.truthy(since(cascadeCounts, cascadeBefore, 'evolve') > 0, 'cascade 1 evolving while the bank shows');
	expect.truthy(since(painterCounts, painterBefore, 'paint') > 0, 'the painter painting');
	expect.equal(Ocean.status(ocean).source, 'waves', 'the bank is what shows');
	expect.truthy(ocean.surface.ringSpecs.every((spec) => spec.cascades.length === 0), 'the rings sample no cascade');
});

test('phones get the lighter tier by rule; the URL still wins (Review Focus 5)', () => {
	const phone = build('', { deviceTier: 'Medium' }).ocean;
	expect.equal(phone.tierName, 'Medium', 'Medium');
	expect.equal(Ocean.status(phone).tierReason, 'phone rule', 'and says why');
	expect.equal(phone.layout.vertexCount, 6480, "lighter: 6,480 vertices against High's 18,144");
	const forced = build('?tier=Low', { deviceTier: 'Medium' }).ocean;
	expect.equal(forced.tierName, 'Low', 'the URL wins');
});

test('a Medium ocean takes three-layer settings without complaint (Review Focus 5)', async () => {
	const { ocean, advance } = build('?tier=Medium');
	Ocean.configureStage(ocean, settings({ layers: [true, true, true] }));
	await advance(6);
	expect.equal(ocean.layerOn.length, 2, 'two cascades');
	expect.equal(Ocean.status(ocean).layers.join(','), 'true,true', 'both sampled');
});
