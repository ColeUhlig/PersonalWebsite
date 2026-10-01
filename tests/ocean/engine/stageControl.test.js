import { test } from 'node:test';
import * as expect from '../expect.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';
import * as OceanClock from '../../../content/ocean/js/core/oceanClock.js';
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
	expect.equal(probe.xSpread, 0, 'one sine along z');
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
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'bank', bank: { count: 32, fan: 1 } }));
	await advance(2);
	expect.equal(ocean.waves.count, 32, 'all 32 waves');
	expect.equal(probeSurface(ocean.surface).maxLateral, 0, 'chop 0: no sideways motion');
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'bank', bank: { count: 32, fan: 1 }, chop: 1 }));
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

// The story checks every frame whether any layer is sampled (ui/storyStage.js): a cheap read that
// agrees with the status.
test('anyLayerSampled says whether the rings sample any cascade, as the status does', async () => {
	const { ocean, advance } = build();
	await advance(6);
	expect.equal(Ocean.anyLayerSampled(ocean), true, 'the finished sea samples its layers');
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'bank', bank: { count: 32, fan: 1 } }));
	await advance(2);
	expect.equal(Ocean.anyLayerSampled(ocean), false, 'a bank sea samples none');
	expect.equal(Ocean.anyLayerSampled(ocean), Ocean.status(ocean).layers.some(Boolean), 'agrees with the status');
	Ocean.configureStage(ocean, settings({ layers: [true, true, true] }));
	await advance(12);
	expect.equal(Ocean.anyLayerSampled(ocean), Ocean.status(ocean).layers.some(Boolean), 'agrees again');
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

// How old, in seconds of the ocean clock, the fields the display holds for cascade c are: the
// fade's weighted mix of its previous and current results' request times. Steady state is five
// frames (a result requested one rotation before its promotion, faded in over the next two).
function displayAge(ocean, c) {
	const store = ocean.store;
	const current = store.current[c - 1];
	const previous = store.previous[c - 1];
	const fraction = OceanClock.fadeFraction(ocean.frame, store.promotedFrame[c - 1], OceanClock.PERIOD);
	const time = previous.filled ? previous.time + (current.time - previous.time) * fraction : current.time;
	return ocean.t - time;
}

// Every cascade a ring samples or the painter reads.
function readCascades(ocean) {
	const read = new Set(ocean.painter.mapsConfig.colourCascades);
	for (const spec of ocean.surface.ringSpecs) {
		for (const c of spec.cascades) read.add(c);
	}
	return [...read];
}

test('a layer switched back on shows fresh fields, never the ones it froze with (fix round 1)', async () => {
	// Two rotations: the steady five frames of latency, and a frame of slack.
	const most = (2 * OceanClock.PERIOD) / 60 + 1e-9;
	for (const [query, rest] of [
		['?tier=High', 600],
		['?tier=High', 4],
		['?tier=High&workers=0', 30],
	]) {
		const { ocean, advance } = build(query);
		await advance(6);
		Ocean.configureStage(ocean, settings({ layers: [true, false, true] }));
		await advance(rest);
		Ocean.configureStage(ocean, settings({ layers: [true, true, true] }));
		expect.equal(ocean.sampled[1], false, `${query} ${rest}: not sampled until a fresh result is promoted`);
		expect.truthy(!ocean.painter.mapsConfig.colourCascades.includes(2), `${query} ${rest}: nor painted`);
		for (let frame = 1; frame <= 12; frame++) {
			await advance(1);
			for (const c of readCascades(ocean)) {
				const age = displayAge(ocean, c);
				expect.truthy(age >= 0 && age <= most, `${query} ${rest}: frame ${frame}, cascade ${c} shows fields ${age.toFixed(3)} s old`);
			}
		}
		expect.equal(ocean.sampled.join(','), 'true,true,true', `${query} ${rest}: rejoined the rings`);
		expect.equal(ocean.painter.mapsConfig.colourCascades.join(','), '1,2,3', `${query} ${rest}: and the painter`);
	}
});

test('the sea has a floor and a ceiling; the sliders and the shipped sea sit inside them (fix round 1)', () => {
	for (const [sea, name] of [
		[{ windSpeed: -1, fetch: 80000 }, 'sea.windSpeed'],
		[{ windSpeed: 40.5, fetch: 80000 }, 'sea.windSpeed'],
		[{ windSpeed: 12, fetch: 0 }, 'sea.fetch'],
		[{ windSpeed: 12, fetch: 1.5e6 }, 'sea.fetch'],
		[{ windSpeed: 12, fetch: Number.POSITIVE_INFINITY }, 'sea.fetch'],
	]) {
		let message = '';
		try {
			StageControl.normalise(settings({ sea }));
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes(name), `${JSON.stringify(sea)}: ${message}`);
	}
	expect.equal(StageControl.SEA_LIMITS.windSpeed, 40, '40 m/s');
	expect.equal(StageControl.SEA_LIMITS.fetch, 1e6, '1,000,000 m');
	// The shipped sea, the sliders' corners (recipes.js: wind 3 .. 25, fetch 5,000 .. 200,000) and the ceilings themselves.
	for (const sea of [
		StageControl.DEFAULT_SETTINGS.sea,
		{ windSpeed: 3, fetch: 5000 },
		{ windSpeed: 25, fetch: 200000 },
		{ windSpeed: 40, fetch: 1e6 },
	]) {
		const s = settings({ sea });
		expect.equal(StageControl.normalise(s), s, `${sea.windSpeed} m/s at ${sea.fetch} m is taken`);
	}
});

test('normalise names every field it refuses (fix round 1)', () => {
	for (const [bad, name] of [
		[null, 'settings'],
		['fft', 'settings'],
		[settings({ seed: 1.5 }), 'seed'],
		// Fix round 1 (Task 7 review): a seed past 2^31 - 1 overflows cascadeSeed (Infinity at
		// 1e305) or collapses the three cascade seeds into one (at 2^53).
		[settings({ seed: 1e305 }), 'seed'],
		[settings({ seed: 2 ** 53 }), 'seed'],
		[settings({ seed: 2 ** 31 }), 'seed'],
		[settings({ seed: -1 }), 'seed'],
		[settings({ maps: 'yes' }), 'maps'],
		[settings({ foam: 1 }), 'foam'],
		[settings({ glow: null }), 'glow'],
		[settings({ normals: undefined }), 'normals'],
		[settings({ foamKnobs: { whitecap: Number.NaN, decay: 0.8 } }), 'foamKnobs'],
		[settings({ foamKnobs: null }), 'foamKnobs'],
		[settings({ glowStrength: -1 }), 'glowStrength'],
	]) {
		let message = '';
		try {
			StageControl.normalise(bad);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes(name), `${name}: ${message}`);
	}
});

test('the status says what evolves and the live sea (fix round 1)', async () => {
	const { ocean, advance } = build();
	await advance(6);
	Ocean.configureStage(ocean, settings({ chop: 0.5, sea: { windSpeed: 20, fetch: 100000 }, layers: [true, false, true] }));
	await advance(12);
	const status = Ocean.status(ocean);
	expect.equal(status.evolving.join(','), 'true,false,true', 'evolving');
	expect.equal(status.chop, 0.5, 'chop');
	expect.equal(status.windSpeed, 20, 'wind');
	expect.equal(status.fetch, 100000, 'fetch');
	expect.equal(status.seed, 7, 'seed');
	expect.truthy(Number.isFinite(status.foamCover) && status.foamCover === ocean.painter.foamCover, `foam cover ${status.foamCover}`);
	status.evolving[0] = false;
	expect.equal(ocean.layerOn[0], true, 'a copy: the caller cannot switch a layer off through it');
});

test("the report's blend counts only running layers, and says off when none ran (fix round 1)", async () => {
	const off = build('?tier=Low');
	Ocean.configureStage(off.ocean, settings({ ...TEACHING, source: 'sine' }));
	await off.advance(300);
	expect.equal(Ocean.report(off.ocean).blend, null, 'no layer ran: off, not a misleading 0');
	const first = build();
	await first.advance(3);
	Ocean.configureStage(first.ocean, settings({ layers: [false, true, true] }));
	await first.advance(297);
	expect.near(Ocean.report(first.ocean).blend, 0.67, 0.02, "cascade 1 stopped: cascade 2's fade, not cascade 1's frozen 1");
});

test('create refuses a device tier that is not a preset (fix round 1)', () => {
	let message = '';
	try {
		build('', { deviceTier: 'Huge' });
	} catch (error) {
		message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
	}
	expect.truthy(message.includes('deviceTier') && message.includes('Huge'), message);
	expect.equal(build('', { deviceTier: null, probeMs: 1 }).ocean.tierReason, 'probe', 'null lets the probe decide');
});

// Task 5 minors (the Task 5 reviewer's scratch test, made a case): replies that take several
// frames keep a cascade 'busy', so a layer switched back on meets a refused request while its old
// reply is still out. It must still rejoin, and show fields no older than the steady sea does.
test('a layer switched back on while its worker is slow still rejoins, with fields no older than steady ones', async () => {
	const DELAY = 4; // frames a cascade reply takes to arrive
	for (const off of [1, 3, 8]) {
		let frame = 0;
		const queue = [];
		const slow = () => {
			const inner = createInProcessWorker(createCascadeWorker);
			const worker = { onmessage: null, onerror: null, postMessage: (m, t) => inner.postMessage(m, t), terminate: () => inner.terminate() };
			inner.onmessage = (event) => {
				if (event.data.type === 'fields') queue.push({ due: frame + DELAY, event, worker });
				else worker.onmessage?.(event);
			};
			return worker;
		};
		let clock = 0;
		const ocean = Ocean.create(readConfig('?tier=High'), {
			spawnCascade: slow,
			spawnPainter: () => createInProcessWorker(createPainterWorker),
			now: () => clock,
			log: { warn() {} },
		});
		Ocean.attachSink(ocean, { uploadColourBand() {}, uploadMaskOrNormal() {}, uploadRoughness() {} });
		const results = [];
		const request = ocean.cascades.request;
		ocean.cascades.request = (...args) => {
			const result = request(...args);
			results.push(result);
			return result;
		};
		const advance = async (frames, each) => {
			for (let i = 0; i < frames; i++) {
				clock += 1 / 60;
				frame += 1;
				for (let k = queue.length - 1; k >= 0; k--) {
					if (queue[k].due <= frame) {
						const { event, worker } = queue.splice(k, 1)[0];
						worker.onmessage?.(event);
					}
				}
				Ocean.step(ocean, 1 / 60, [0, 0], [0, 14, 40], SUN);
				await flush();
				each?.();
			}
		};
		await advance(40);
		let steady = 0;
		await advance(20, () => {
			for (const c of [1, 2, 3]) steady = Math.max(steady, displayAge(ocean, c));
		});
		Ocean.configureStage(ocean, settings({ layers: [true, false, true] }));
		await advance(off);
		Ocean.configureStage(ocean, settings({ layers: [true, true, true] }));
		results.length = 0;
		let rejoined = 0;
		await advance(40, () => {
			if (ocean.sampled[1]) rejoined = Math.max(rejoined, displayAge(ocean, 2));
		});
		expect.truthy(results.includes('busy'), `off ${off}: the busy path was met`);
		expect.truthy(ocean.sampled[1], `off ${off}: cascade 2 rejoined`);
		expect.truthy(rejoined <= steady + 1e-9, `off ${off}: rejoined fields ${(rejoined * 60).toFixed(1)} frames old, steady ${(steady * 60).toFixed(1)}`);
	}
});

// Task 5 minor: the report's blend is the first running layer's fade, and a layer still rejoining
// holds its frozen fields, so its fade is not the one to count.
test("the report's blend skips a cascade 1 that is still rejoining", async () => {
	const { ocean, advance } = build();
	await advance(6);
	Ocean.configureStage(ocean, settings({ layers: [false, true, true] }));
	await advance(30);
	Ocean.configureStage(ocean, settings({ layers: [true, true, true] }));
	let checked = 0;
	for (let i = 0; i < 12; i++) {
		const before = ocean.blendSum;
		await advance(1);
		if (ocean.rejoin[0] !== null) {
			const expected = OceanClock.fadeFraction(ocean.frame, ocean.store.promotedFrame[1], OceanClock.PERIOD);
			expect.near(ocean.blendSum - before, expected, 1e-12, `frame ${i}: cascade 2's fade counted while cascade 1 rejoins`);
			checked += 1;
		}
	}
	expect.truthy(checked > 0, 'some frames had cascade 1 rejoining');
});

// Task 5 minor: `layers` is what the rings sample, so a layer switched on reads false for a few
// frames while it rejoins; `rejoining` says why.
test('the status names a layer that is rejoining', async () => {
	const { ocean, advance } = build();
	await advance(6);
	Ocean.configureStage(ocean, settings({ layers: [true, false, true] }));
	await advance(12);
	Ocean.configureStage(ocean, settings({ layers: [true, true, true] }));
	const status = Ocean.status(ocean);
	expect.equal(status.layers.join(','), 'true,false,true', 'not sampled yet');
	expect.equal(status.rejoining.join(','), 'false,true,false', 'because it is rejoining');
	await advance(12);
	expect.equal(Ocean.status(ocean).rejoining.join(','), 'false,false,false', 'rejoined');
	expect.equal(Ocean.status(ocean).layers.join(','), 'true,true,true', 'and sampled');
});

// Final fix: the foam knobs are held to what the painter takes before anything changes, so a
// refused fade leaves the ocean as it was instead of throwing from the painter halfway through.
test('foam knobs the painter cannot take are refused by normalise, before anything changes', () => {
	const { ocean } = build('?tier=Low');
	for (const foamKnobs of [
		{ whitecap: 0.3, decay: 1.2 },
		{ whitecap: 0.3, decay: -0.1 },
	]) {
		let message = '';
		try {
			Ocean.configureStage(ocean, settings({ foamKnobs }));
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes('foamKnobs'), `${JSON.stringify(foamKnobs)}: ${message}`);
	}
	expect.equal(ocean.stageSettings, null, 'no settings adopted');
});

// Final review minor 10: a configure that changes the layers and a knob together sends the
// painter one update, not one for the lists and another for the knobs.
test('one configure sends each painter worker at most one update', async () => {
	const { ocean, painterCounts, advance } = build();
	await advance(4);
	const before = { ...painterCounts };
	Ocean.configureStage(ocean, settings({ layers: [true, false, false], chop: 0.5 }));
	expect.equal(since(painterCounts, before, 'update'), 2, 'one update to each of the two workers');
	expect.equal(ocean.painter.mapsConfig.chop, 0.5, 'the knob arrived');
	expect.equal(ocean.painter.mapsConfig.maskCascades.join(','), '1', 'and the lists');
});

// Final review minor 9: two layers switched on together. The retune gap held back the second
// one's pending retune, so it rejoined with the spectrum it froze with and swapped seas a few
// frames later. A layer rejoining takes its pending retune before its fresh request.
test('a layer rejoining takes its pending retune first, even inside the retune gap', async () => {
	const sequences = { 1: [], 2: [], 3: [] };
	let clock = 0;
	const ocean = Ocean.create(readConfig('?tier=High'), {
		spawnCascade: (index) => {
			const inner = createInProcessWorker(createCascadeWorker);
			const worker = {
				onmessage: null,
				onerror: null,
				postMessage: (message, transfer) => {
					sequences[index].push(message.type);
					inner.postMessage(message, transfer);
				},
				terminate: () => inner.terminate(),
			};
			inner.onmessage = (event) => worker.onmessage?.(event);
			inner.onerror = (event) => worker.onerror?.(event);
			return worker;
		},
		spawnPainter: () => createInProcessWorker(createPainterWorker),
		now: () => clock,
		log: { warn() {} },
	});
	Ocean.attachSink(ocean, { uploadColourBand() {}, uploadMaskOrNormal() {}, uploadRoughness() {} });
	const advance = async (frames) => {
		for (let i = 0; i < frames; i++) {
			clock += 1 / 60;
			Ocean.step(ocean, 1 / 60, [0, 0], [0, 14, 40], SUN);
			await flush();
		}
	};
	await advance(6);
	Ocean.configureStage(ocean, settings({ layers: [true, false, false] }));
	await advance(12);
	Ocean.configureStage(ocean, settings({ layers: [true, false, false], sea: { windSpeed: 18, fetch: 80000 } }));
	await advance(30);
	expect.equal(ocean.retune.pending.join(','), 'false,true,true', 'the stopped layers keep their retunes pending');
	for (const c of [2, 3]) sequences[c].length = 0;
	Ocean.configureStage(ocean, settings({ layers: [true, true, true], sea: { windSpeed: 18, fetch: 80000 } }));
	await advance(12);
	for (const c of [2, 3]) {
		const firstEvolve = sequences[c].indexOf('evolve');
		expect.truthy(firstEvolve > 0 && sequences[c].slice(0, firstEvolve).includes('retune'), `cascade ${c} retuned before its fresh evolve: ${sequences[c].slice(0, 4).join(',')}`);
	}
	expect.equal(ocean.sampled.join(','), 'true,true,true', 'both rejoined');
});

// C2: bank.fan reaches the surface and is checked like every other field.
test('bank.fan must be a number in 0..1, and a new spread rebuilds the waves the surface draws', async () => {
	const { ocean } = build();
	const settings = (fan) => ({ ...StageControl.DEFAULT_SETTINGS, source: 'bank', bank: { count: 4, fan }, layers: [true, false, false] });
	for (const bad of [-0.5, 2, Number.NaN, undefined]) {
		let message = '';
		try { StageControl.configure(ocean, settings(bad)); } catch (error) { message = error.message; }
		expect.truthy(message.includes('bank.fan'), `refused ${bad}`);
	}
	StageControl.configure(ocean, settings(0));
	const line = ocean.waves;
	expect.equal(line.packed[4], 0, 'spread 0: the first wave along +z');
	StageControl.configure(ocean, settings(1));
	expect.truthy(ocean.waves.packed !== line.packed, 'a new spread, new waves');
	expect.equal(ocean.waves.packed, ocean.teachingBank.packed, 'spread 1 draws the bank itself');
});
