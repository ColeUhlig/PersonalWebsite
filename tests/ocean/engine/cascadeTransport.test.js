import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FFT from '../../../content/ocean/js/core/fft.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';
import { createCascades } from '../../../content/ocean/js/engine/cascadeTransport.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const N = 16;
const CELLS = N * N;
const configFor = (index) => ({ n: N, size: 64 * index, kMin: 0, kMax: Infinity, seed: 100 + index, loopPeriod: 120, params: Spectrum.NORMAL });

function harness(overrides = {}) {
	const received = [];
	const readied = [];
	const warnings = [];
	const cascades = createCascades({
		count: 2,
		cells: CELLS,
		configFor,
		spawn: () => createInProcessWorker(createCascadeWorker),
		useWorkers: true,
		onFields: (index, packed, t) => received.push({ index, packed: packed.slice(), t, buffer: packed.buffer }),
		onReady: (index) => readied.push(index),
		log: { warn: (text) => warnings.push(text) },
		...overrides,
	});
	return { cascades, received, readied, warnings };
}

test('a worker must answer its configure before it is asked to evolve', async () => {
	const { cascades, readied } = harness();
	expect.equal(cascades.request(1, 0, 1), 'waiting', 'not ready yet');
	await flush();
	expect.equal(readied.join(','), '1,2', 'both workers ready');
	expect.equal(cascades.readyCount(), 2, 'ready count');
	expect.equal(cascades.mode(), 'workers', 'mode');
});

test('evolve ships the fields back in the buffer it lent, one request in flight at a time', async () => {
	const { cascades, received } = harness();
	await flush();
	expect.equal(cascades.request(1, 5, 2), 'sent', 'sent');
	expect.equal(cascades.request(1, 6, 3), 'busy', 'a second request waits for the reply');
	await flush();
	expect.equal(received.length, 1, 'one reply');
	expect.equal(received[0].index, 1, 'from cascade 1');
	expect.equal(received[0].t, 5, 'stamped with the request time');
	expect.equal(received[0].packed.length, FieldStore.bufferSize(CELLS) / 4, 'a whole packed buffer');
	const direct = Cascade.create(configFor(1));
	Cascade.evolve(direct, 5);
	Cascade.synthesise(direct, FFT.plan(N));
	const expected = new Float32Array(FieldStore.bufferSize(CELLS) / 4);
	FieldStore.pack(direct, expected);
	for (const i of [0, 17, CELLS + 3, 7 * CELLS + 5]) {
		expect.equal(received[0].packed[i], expected[i], `packed[${i}] matches a direct synthesis`);
	}
	const firstBuffer = received[0].buffer;
	expect.equal(cascades.request(1, 7, 4), 'sent', 'free again after the reply');
	await flush();
	expect.equal(received[1].buffer, firstBuffer, 'the same buffer shuttles back and forth');
	expect.truthy(cascades.lastMs[0] >= 0, 'worker time recorded');
});

test('a spawn that throws puts every cascade on the main thread (Review Focus 1)', () => {
	const { cascades, received } = harness({
		spawn: () => {
			throw new Error('module workers are not supported');
		},
	});
	expect.equal(cascades.mode(), 'main-thread', 'fell back');
	expect.truthy(cascades.fallbackReason().includes('module workers are not supported'), 'reason kept');
	expect.equal(cascades.request(2, 3, 1), 'local', 'served here');
	expect.equal(received.length, 1, 'delivered synchronously');
	expect.equal(received[0].index, 2, 'cascade 2');
});

test('a worker error also falls back, and later requests are served locally (Review Focus 1)', async () => {
	const failing = () => {
		const worker = { onmessage: null, onerror: null, terminate() {} };
		worker.postMessage = () => queueMicrotask(() => worker.onerror?.({ message: 'worker crashed' }));
		return worker;
	};
	const { cascades, received } = harness({ spawn: failing });
	await flush();
	expect.equal(cascades.mode(), 'main-thread', 'fell back after the error');
	expect.truthy(cascades.fallbackReason().includes('worker crashed'), 'reason kept');
	expect.equal(cascades.request(1, 2, 5), 'local', 'served here');
	expect.equal(received.length, 1, 'delivered');
});

test('useWorkers false never spawns', () => {
	let spawned = 0;
	const { cascades } = harness({ useWorkers: false, spawn: () => { spawned += 1; return createInProcessWorker(createCascadeWorker); } });
	expect.equal(spawned, 0, 'no workers');
	expect.equal(cascades.mode(), 'main-thread', 'main thread');
	expect.equal(cascades.fallbackReason(), 'workers turned off (?workers=0)', 'reason');
});

test('a silent worker gets its configure re-sent once after the timeout', async () => {
	const posted = [];
	const silent = () => ({ onmessage: null, onerror: null, terminate() {}, postMessage: (m) => posted.push(m.type) });
	const { cascades, warnings } = harness({ spawn: silent });
	for (let frame = 1; frame <= 60; frame++) {
		expect.equal(cascades.request(1, 0, frame), 'waiting', `frame ${frame} waits`);
	}
	expect.equal(cascades.request(1, 0, 61), 'resent', 'frame 61 re-sends');
	expect.equal(cascades.request(1, 0, 62), 'waiting', 'then waits another timeout');
	expect.equal(posted.filter((t) => t === 'configure').length, 3, 'two initial configures plus one re-send');
	expect.equal(warnings.length, 1, 'warned once');
});

function fakeWorker() {
	return { onmessage: null, onerror: null, terminate() {}, postMessage() {} };
}

test('a worker error event is cancelled so it does not also surface as an uncaught page error', () => {
	const spawned = [];
	const { cascades } = harness({ spawn: () => { const w = fakeWorker(); spawned.push(w); return w; } });
	let prevented = 0;
	spawned[0].onerror({ message: '', preventDefault: () => { prevented += 1; } });
	expect.equal(prevented, 1, 'preventDefault called');
	expect.equal(cascades.mode(), 'main-thread', 'fell back');
	expect.equal(cascades.fallbackReason(), 'cascade worker 1 failed: unknown error', 'an empty message still names a reason');
	spawned[1].onerror({ message: 'late', preventDefault: () => { prevented += 1; } });
	expect.equal(prevented, 2, 'a later error after the fallback is cancelled too');
});

test('a fallback whose build throws leaves the transport as it was (no main-thread mode without cascades)', () => {
	const spawned = [];
	let broken = false;
	const throwingConfigFor = (index) => {
		if (broken) throw new Error('config unavailable');
		return configFor(index);
	};
	const { cascades } = harness({ configFor: throwingConfigFor, spawn: () => { const w = fakeWorker(); spawned.push(w); return w; } });
	broken = true;
	let caught = null;
	try {
		spawned[0].onerror({ message: 'worker crashed' });
	} catch (error) {
		caught = error;
	}
	expect.truthy(caught !== null && caught.message === 'config unavailable', `the build error propagates: ${caught?.message}`);
	expect.equal(cascades.mode(), 'workers', 'mode unchanged');
	expect.equal(cascades.fallbackReason(), null, 'no reason recorded');
	expect.equal(cascades.request(1, 0, 1), 'waiting', 'a later request is answered, not a TypeError');
});

function retuneHarness(useWorkers) {
	const state = { scale: 1 };
	const received = [];
	const cascades = createCascades({
		count: 1,
		cells: CELLS,
		configFor: (index) => ({ ...configFor(index), params: { ...Spectrum.NORMAL, scale: state.scale } }),
		spawn: () => createInProcessWorker(createCascadeWorker),
		useWorkers,
		onFields: (index, packed) => received.push(packed.slice()),
		onReady: () => {},
		log: { warn() {} },
	});
	return { cascades, received, state };
}

function doubled(later, earlier) {
	let nonZero = 0;
	for (const i of [3, 50, 101]) {
		expect.equal(later[i], earlier[i] * 2, `value ${i} doubled`);
		if (earlier[i] !== 0) nonZero += 1;
	}
	expect.truthy(nonZero > 0, 'the compared values are not all zero');
}

test('retune sends the current config to a ready worker, and the next result carries it', async () => {
	const { cascades, received, state } = retuneHarness(true);
	expect.equal(cascades.retune(1), 'waiting', 'not ready: the caller keeps it pending');
	await flush();
	cascades.request(1, 4, 1);
	await flush();
	state.scale = 2;
	expect.equal(cascades.retune(1), 'sent', 'sent to the ready worker');
	cascades.request(1, 4, 2);
	await flush();
	expect.equal(received.length, 2, 'two results');
	doubled(received[1], received[0]);
	expect.truthy(Number.isFinite(cascades.lastRetuneMs[0]), 'the rebuild time is kept');
});

test('on the main thread a retune rebuilds the local cascade at once', () => {
	const { cascades, received, state } = retuneHarness(false);
	expect.truthy(Number.isNaN(cascades.lastRetuneMs[0]), 'no rebuild timed yet');
	cascades.request(1, 4, 1);
	state.scale = 2;
	expect.equal(cascades.retune(1), 'local', 'rebuilt on this thread');
	cascades.request(1, 4, 2);
	doubled(received[1], received[0]);
	expect.truthy(Number.isFinite(cascades.lastRetuneMs[0]), 'the rebuild time is kept');
});
