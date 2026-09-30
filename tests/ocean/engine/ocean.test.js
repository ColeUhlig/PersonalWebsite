import { test } from 'node:test';
import * as expect from '../expect.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';
import * as Ocean from '../../../content/ocean/js/engine/ocean.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const SUN = [-0.9526530504226685, 0.2821884751319885, 0.11323313415050507];

function recordingSink() {
	const counts = { colour: 0, maskOrNormal: 0, roughness: 0 };
	return {
		counts,
		uploadColourBand: () => { counts.colour += 1; },
		uploadMaskOrNormal: () => { counts.maskOrNormal += 1; },
		uploadRoughness: () => { counts.roughness += 1; },
	};
}

function build(query = '?tier=Low', deps = {}) {
	let clock = 0;
	const ocean = Ocean.create(readConfig(query), {
		spawnCascade: () => createInProcessWorker(createCascadeWorker),
		spawnPainter: () => createInProcessWorker(createPainterWorker),
		now: () => clock,
		log: { warn() {} },
		...deps,
	});
	const sink = recordingSink();
	Ocean.attachSink(ocean, sink);
	const advance = async (frames, dt = 1 / 60) => {
		for (let i = 0; i < frames; i++) {
			clock += dt;
			Ocean.step(ocean, dt, [0, 0], [0, 14, 40], SUN);
			await flush();
		}
	};
	return { ocean, sink, advance, setClock: (value) => { clock = value; } };
}

function everyPositionFinite(ocean) {
	return ocean.surface.patches.every((p) => p.positions.every(Number.isFinite) && p.normals.every(Number.isFinite));
}

test('workers come up, fields arrive and the surface moves', async () => {
	const { ocean, advance } = build();
	await advance(12);
	const status = Ocean.status(ocean);
	expect.equal(status.mode, 'workers', 'workers');
	expect.equal(status.workersReady, ocean.preset.sizes.length, 'every cascade worker ready');
	expect.equal(status.painterReady, true, 'painters ready');
	expect.truthy(ocean.surface.patches.some((p) => p.positions.some((v, i) => i % 3 === 1 && v !== 0 && v !== ocean.surface.skirtY)), 'a vertex left sea level');
	expect.truthy(everyPositionFinite(ocean), 'finite');
});

test('the cross-fade settles at a mean of two thirds when every result arrives in time', async () => {
	const { ocean, advance } = build();
	await advance(Ocean.REPORT_WINDOW * 2);
	const report = Ocean.report(ocean);
	expect.truthy(report !== null, 'a report window completed');
	expect.near(report.blend, 0.67, 0.02, 'blend mean');
	expect.truthy(report.writeMs > 0 && Number.isFinite(report.cascadeMs), 'stage timings present');
});

test('the report carries the render stage the page adds each frame', async () => {
	const { ocean } = build();
	let clock = 0;
	for (let i = 0; i < Ocean.REPORT_WINDOW * 2; i++) {
		clock += 1 / 60;
		Ocean.step(ocean, 1 / 60, [0, 0], [0, 14, 40], SUN);
		// As main.js does after view.render(): 4 ms of render charged to every frame.
		Ocean.addStageSeconds(ocean, 'render', 0.004);
		await flush();
	}
	const report = Ocean.report(ocean);
	expect.near(report.renderMs, 4, 1e-6, 'renderMs is the render time per frame over the window');
});

test('addStageSeconds refuses a stage the report does not know and a non-finite time', () => {
	const { ocean } = build();
	const messages = [];
	try { Ocean.addStageSeconds(ocean, 'rendr', 0.001); } catch (error) { messages.push(error.message); }
	try { Ocean.addStageSeconds(ocean, 'render', Number.NaN); } catch (error) { messages.push(error.message); }
	expect.equal(messages.length, 2, 'both refused');
	expect.truthy(messages.every((m) => m.startsWith('addStageSeconds')), `named errors: ${messages.join(' | ')}`);
});

test('cascadeMs is null until a worker reply has been measured', async () => {
	const silent = () => ({ onmessage: null, onerror: null, terminate() {}, postMessage() {} });
	const { ocean, advance } = build('?tier=Low', { spawnCascade: silent });
	await advance(Ocean.REPORT_WINDOW);
	expect.equal(Ocean.status(ocean).workersReady, 0, 'no cascade worker ever answered');
	expect.equal(Ocean.report(ocean).cascadeMs, null, 'no reply measured: null, not 0');
});

test('the painter fills every map through the sink', async () => {
	const { ocean, sink, advance } = build();
	await advance(30);
	expect.truthy(sink.counts.colour >= 4, `colour bands: ${sink.counts.colour}`);
	expect.truthy(sink.counts.maskOrNormal >= 2, `mask and normal: ${sink.counts.maskOrNormal}`);
	expect.truthy(sink.counts.roughness >= ocean.preset.rings.length, `roughness maps: ${sink.counts.roughness}`);
});

test('strengths hold one finite glow per patch and quad', async () => {
	const { ocean, advance } = build();
	await advance(5);
	expect.equal(ocean.strengths.length, ocean.surface.patches.length + ocean.horizon.quads.length, 'length');
	expect.truthy(ocean.strengths.every(Number.isFinite), 'finite');
	expect.truthy(ocean.strengths.some((s) => s > 0), 'some glow towards the sun');
});

test('workers off runs everything on the main thread (Review Focus 1)', async () => {
	const { ocean, advance } = build('?tier=Low&workers=0');
	await advance(12);
	const status = Ocean.status(ocean);
	expect.equal(status.mode, 'main-thread', 'main thread');
	expect.truthy(status.fallbackReason.includes('workers=0'), 'reason');
	expect.truthy(everyPositionFinite(ocean), 'finite');
	await advance(Ocean.REPORT_WINDOW);
	expect.equal(Ocean.report(ocean).cascadeMs, null, 'no cascade workers: cascadeMs is null, not 0');
});

test('a frozen clock evolves every cascade at the frozen time', async () => {
	const { ocean, advance } = build('?tier=Low&freeze=12');
	await advance(20);
	expect.equal(Ocean.status(ocean).t, 12, 'clock frozen');
	for (const slot of ocean.store.current) {
		if (slot.filled) expect.equal(slot.time, 12, 'result stamped 12');
	}
});

test('a hidden tab (a long gap, replies held back, then a flood) recovers without NaN (Review Focus 2)', async () => {
	const held = [];
	let holding = false;
	const holdingSpawn = (create) => () => {
		const inner = createInProcessWorker(create);
		const worker = { onmessage: null, onerror: null, terminate: () => inner.terminate(), postMessage: (m, t) => inner.postMessage(m, t) };
		inner.onmessage = (event) => (holding ? held.push(() => worker.onmessage(event)) : worker.onmessage(event));
		return worker;
	};
	const { ocean, advance } = build('?tier=Low', { spawnCascade: holdingSpawn(createCascadeWorker), spawnPainter: holdingSpawn(createPainterWorker) });
	await advance(12);
	holding = true;
	await advance(5);
	await advance(1, 45); // the tab comes back after 45 s: one huge dt
	holding = false;
	for (const deliver of held.splice(0)) deliver();
	await advance(90);
	expect.truthy(everyPositionFinite(ocean), 'finite after the flood');
	expect.equal(Ocean.status(ocean).painterReady, true, 'painters still ready');
	const before = ocean.store.promotedFrame.slice();
	await advance(6);
	expect.truthy(ocean.store.promotedFrame.some((f, i) => f > before[i]), 'cascades promoting again');
});
