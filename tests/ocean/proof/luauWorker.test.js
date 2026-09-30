// The Luau worker core and the client the panel talks to it through, in Node: the real runtime
// and bundle through an in-process worker, and fake workers for the failures a browser produces.
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';
import * as luauWeb from 'luau-web';
import { BUNDLE_URL } from '../../../content/ocean/js/proof/runtime.js';
import { createLuauWorker } from '../../../content/ocean/js/workers/luauWorkerCore.js';
import { createLuauClient, FIRST_RUN_TIMEOUT_MS, LuauRunError, TIMEOUT_MS } from '../../../content/ocean/js/proof/luauClient.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { runCascadeTwin } from '../../../content/ocean/js/proof/twinRunner.js';
import { cascadeOptions } from '../../../content/ocean/js/proof/proofConfig.js';
import { compareFloat32 } from '../../../content/ocean/js/proof/compare.js';

const loadSource = () => readFile(fileURLToPath(BUNDLE_URL), 'utf8');
// Every worker core here shares ONE Luau state. In a browser each worker has its own WebAssembly
// module and one state; in this process every state shares one fixed heap, and an idle state's
// garbage is only collected when that state allocates, so a state per test would run the heap out.
const sharedState = await luauWeb.LuauState.createAsync();
const runtime = { LuauState: { createAsync: async () => sharedState } };
const loadRuntime = async () => runtime;

// Replies a worker core posts, collected in order.
function recorder() {
	const replies = [];
	return { replies, post: (message, transfer) => replies.push({ message, transfer }) };
}

async function rejection(promise) {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	return null;
}

test('a cascade run answers the packed fields, the Luau time and the load time once', async () => {
	const { replies, post } = recorder();
	const handle = createLuauWorker(post, { loadRuntime, loadSource });
	await handle({ type: 'cascade', id: 1, options: cascadeOptions() });
	await handle({ type: 'cascade', id: 2, options: cascadeOptions({ index: 2 }) });
	const [first, second] = replies;
	expect.equal(first.message.type, 'cascade', 'first reply');
	expect.equal(first.message.id, 1, 'id echoed');
	expect.truthy(first.message.loadMs > 0, 'the first run reports the load');
	expect.equal(second.message.loadMs, 0, 'later runs do not');
	expect.truthy(first.transfer[0] === first.message.packed.buffer, 'the packed buffer is transferred');
	const js = runCascadeTwin(cascadeOptions()).packed;
	expect.truthy(compareFloat32(first.message.packed, js).within, 'agrees with the twin');
});

// Review Focus 1: a runtime that cannot load (offline, blocked CDN, no WebAssembly).
test('a runtime that fails to load answers a load error, and the next message tries again', async () => {
	const { replies, post } = recorder();
	let attempts = 0;
	const handle = createLuauWorker(post, {
		loadRuntime: async () => {
			attempts++;
			if (attempts === 1) {
				throw new Error('Failed to fetch dynamically imported module');
			}
			return runtime;
		},
		loadSource,
	});
	await handle({ type: 'cascade', id: 1, options: cascadeOptions() });
	expect.equal(replies[0].message.type, 'error', 'error reply');
	expect.equal(replies[0].message.stage, 'load', 'load stage');
	expect.equal(replies[0].message.fatal, false, 'not fatal');
	expect.truthy(replies[0].message.message.includes('Failed to fetch'), 'the message says why');
	await handle({ type: 'cascade', id: 2, options: cascadeOptions() });
	expect.equal(replies[1].message.type, 'cascade', 'the retry runs');
});

test('a bundle that fails to load is a load error too', async () => {
	const { replies, post } = recorder();
	const handle = createLuauWorker(post, { loadRuntime, loadSource: async () => { throw new Error('the Luau bundle did not load (HTTP 404)'); } });
	await handle({ type: 'cascade', id: 7, options: cascadeOptions() });
	expect.equal(replies[0].message.stage, 'load', 'load stage');
	expect.truthy(replies[0].message.message.includes('404'), 'says 404');
});

test('a Luau error is a run error and the worker keeps working', async () => {
	const { replies, post } = recorder();
	const handle = createLuauWorker(post, { loadRuntime, loadSource });
	await handle({ type: 'cascade', id: 1, options: cascadeOptions({ n: 48 }) });
	expect.equal(replies[0].message.stage, 'run', 'run stage');
	expect.truthy(replies[0].message.message.includes('power of two'), `the Luau assert (${replies[0].message.message})`);
	await handle({ type: 'cascade', id: 2, options: cascadeOptions() });
	expect.equal(replies[1].message.type, 'cascade', 'the next run works');
	await handle({ type: 'paint', id: 3 });
	expect.equal(replies[2].message.stage, 'run', 'an unknown message is a run error');
});

test('a WebAssembly abort is fatal', async () => {
	const { replies, post } = recorder();
	const aborting = { LuauState: { createAsync: async () => { throw new WebAssembly.RuntimeError('unreachable'); } } };
	const handle = createLuauWorker(post, { loadRuntime: async () => aborting, loadSource });
	await handle({ type: 'cascade', id: 1, options: cascadeOptions() });
	expect.equal(replies[0].message.fatal, true, 'fatal');
});

// Review Focus 1, no WebAssembly (iOS Lockdown Mode, managed browsers): luau-web's own import
// throws a ReferenceError, and the core must still answer, without touching WebAssembly itself.
test('without WebAssembly the core answers a wasm error and never touches WebAssembly', async () => {
	const { replies, post } = recorder();
	let loads = 0;
	const handle = createLuauWorker(post, {
		loadRuntime: async () => {
			loads++;
			throw new ReferenceError('WebAssembly is not defined');
		},
		loadSource,
	});
	const saved = Object.getOwnPropertyDescriptor(globalThis, 'WebAssembly');
	delete globalThis.WebAssembly;
	try {
		await handle({ type: 'cascade', id: 4, options: cascadeOptions() });
	} finally {
		Object.defineProperty(globalThis, 'WebAssembly', saved);
	}
	expect.equal(replies.length, 1, 'exactly one reply');
	expect.equal(replies[0].message.type, 'error', 'an error reply');
	expect.equal(replies[0].message.stage, 'wasm', 'the wasm stage');
	expect.equal(replies[0].message.id, 4, 'id echoed');
	expect.equal(replies[0].message.fatal, false, 'not fatal');
	expect.equal(loads, 0, 'the runtime is not even fetched');
});

test('a load error thrown while WebAssembly is missing mid-load is still answered, not fatal', async () => {
	const { replies, post } = recorder();
	const saved = Object.getOwnPropertyDescriptor(globalThis, 'WebAssembly');
	const handle = createLuauWorker(post, {
		// WebAssembly vanishes during the load: the core's error path must not evaluate
		// WebAssembly.RuntimeError when the global is gone.
		loadRuntime: async () => {
			delete globalThis.WebAssembly;
			throw new ReferenceError('WebAssembly is not defined');
		},
		loadSource,
	});
	try {
		await handle({ type: 'cascade', id: 5, options: cascadeOptions() });
	} finally {
		Object.defineProperty(globalThis, 'WebAssembly', saved);
	}
	expect.equal(replies.length, 1, 'exactly one reply');
	expect.equal(replies[0].message.stage, 'load', 'load stage');
	expect.equal(replies[0].message.fatal, false, 'not fatal');
});

// Review Focus 2: a visitor pressing Run again and again. The WebAssembly heap is fixed at about
// 16 MB and a failed allocation aborts, so the garbage of every run must be collected in time.
test('twenty-five runs in a row in one worker', async () => {
	const { replies, post } = recorder();
	const handle = createLuauWorker(post, { loadRuntime, loadSource });
	for (let run = 1; run <= 25; run++) {
		await handle({ type: 'cascade', id: run, options: cascadeOptions({ index: 1 + (run % 3) }) });
	}
	expect.equal(replies.filter((r) => r.message.type === 'cascade').length, 25, 'every run answered with fields');
});

test('the client runs through an in-process worker and agrees with the twin', async () => {
	const client = createLuauClient({ spawn: () => createInProcessWorker((post) => createLuauWorker(post, { loadRuntime, loadSource })) });
	const result = await client.runCascade(cascadeOptions());
	expect.truthy(result.ms > 0, 'Luau time');
	expect.truthy(compareFloat32(result.packed, runCascadeTwin(cascadeOptions()).packed).within, 'agrees');
	client.dispose();
});

// A fake Worker-shaped object that the test drives by hand.
function fakeWorker() {
	const worker = {
		sent: [],
		terminated: false,
		onmessage: null,
		onerror: null,
		postMessage(message) {
			worker.sent.push(message);
		},
		terminate() {
			worker.terminated = true;
		},
		reply(data) {
			worker.onmessage?.({ data });
		},
	};
	return worker;
}

// Review Focus 3: no Web Workers (or a browser that refuses module workers).
test('a spawn that throws rejects with the spawn stage', async () => {
	const client = createLuauClient({ spawn: () => { throw new ReferenceError('Worker is not defined'); } });
	const error = await rejection(client.runCascade(cascadeOptions()));
	expect.truthy(error instanceof LuauRunError, 'a LuauRunError');
	expect.equal(error.stage, 'spawn', 'spawn stage');
});

test('a worker script that fails to load rejects with the load stage and the next run respawns', async () => {
	const workers = [];
	const client = createLuauClient({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; } });
	const first = client.runCascade(cascadeOptions());
	workers[0].onerror({ message: 'Failed to fetch a worker script' });
	const error = await rejection(first);
	expect.equal(error.stage, 'load', 'load stage');
	expect.equal(workers[0].terminated, true, 'the broken worker is thrown away');
	const second = client.runCascade(cascadeOptions());
	expect.equal(workers.length, 2, 'a fresh worker');
	workers[1].reply({ type: 'cascade', id: workers[1].sent[0].id, packed: new Float32Array(1), ms: 1.5, loadMs: 2 });
	expect.equal((await second).ms, 1.5, 'the fresh worker answers');
});

test('a fatal reply rejects with the crash stage and discards the worker', async () => {
	const workers = [];
	const client = createLuauClient({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; } });
	const run = client.runCascade(cascadeOptions());
	workers[0].reply({ type: 'error', id: workers[0].sent[0].id, stage: 'run', message: 'unreachable', fatal: true });
	expect.equal((await rejection(run)).stage, 'crash', 'crash stage');
	expect.equal(workers[0].terminated, true, 'discarded');
	client.runCascade(cascadeOptions()).catch(() => {});
	expect.equal(workers.length, 2, 'the next run spawns again');
	client.dispose();
});

// Final review, Important 1: a module worker keeps a failed import in its module map, so a retry
// in the same worker fails at once without a request. A load failure throws the worker away.
test('a load error reply rejects with the load stage and discards the worker; the next run spawns a fresh one', async () => {
	const workers = [];
	const client = createLuauClient({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; } });
	const load = client.runCascade(cascadeOptions());
	workers[0].reply({ type: 'error', id: workers[0].sent[0].id, stage: 'load', message: 'offline', fatal: false });
	expect.equal((await rejection(load)).stage, 'load', 'load stage');
	expect.equal(workers[0].terminated, true, 'the worker holding the failed import is thrown away');
	const retry = client.runCascade(cascadeOptions());
	expect.equal(workers.length, 2, 'a fresh worker for the retry');
	workers[1].reply({ type: 'cascade', id: workers[1].sent[0].id, packed: new Float32Array(1), ms: 1, loadMs: 3 });
	expect.truthy((await retry).packed instanceof Float32Array, 'the retry answers');
	client.dispose();
});

test('a run error is the run stage and keeps the worker', async () => {
	const workers = [];
	const client = createLuauClient({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; } });
	const run = client.runCascade(cascadeOptions());
	workers[0].reply({ type: 'error', id: workers[0].sent[0].id, stage: 'run', message: 'bad', fatal: false });
	expect.equal((await rejection(run)).stage, 'run', 'run stage');
	client.runCascade(cascadeOptions()).catch(() => {});
	expect.equal(workers.length, 1, 'the same worker');
	expect.equal(workers[0].terminated, false, 'kept');
	client.dispose();
});

test('a wasm error reply rejects with the wasm stage', async () => {
	const workers = [];
	const client = createLuauClient({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; } });
	const run = client.runCascade(cascadeOptions());
	workers[0].reply({ type: 'error', id: workers[0].sent[0].id, stage: 'wasm', message: 'WebAssembly is switched off', fatal: false });
	expect.equal((await rejection(run)).stage, 'wasm', 'wasm stage');
	expect.equal(workers[0].terminated, true, 'discarded');
});

test('without WebAssembly on the page the client rejects with the wasm stage and spawns nothing', async () => {
	let spawns = 0;
	const client = createLuauClient({ spawn: () => { spawns++; return fakeWorker(); }, hasWebAssembly: () => false, timeoutMs: 10, firstRunTimeoutMs: 10 });
	const error = await rejection(client.runCascade(cascadeOptions()));
	expect.equal(error.stage, 'wasm', 'wasm stage');
	expect.equal(spawns, 0, 'no worker');
});

test('onerror before the first reply is a load failure; after a reply it is a crash', async () => {
	const workers = [];
	const client = createLuauClient({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; } });
	const first = client.runCascade(cascadeOptions());
	workers[0].reply({ type: 'cascade', id: workers[0].sent[0].id, packed: new Float32Array(1), ms: 1, loadMs: 2 });
	await first;
	const second = client.runCascade(cascadeOptions());
	workers[0].onerror({ message: 'Uncaught RangeError' });
	const error = await rejection(second);
	expect.equal(error.stage, 'crash', 'a worker that already answered and then errors has crashed');
	expect.equal(workers[0].terminated, true, 'discarded');
});

test('a reply that cannot be read (messageerror) is a crash, not a 60 s wait', async () => {
	const workers = [];
	const client = createLuauClient({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; } });
	const run = client.runCascade(cascadeOptions());
	workers[0].onmessageerror({});
	expect.equal((await rejection(run)).stage, 'crash', 'crash stage');
	expect.equal(workers[0].terminated, true, 'discarded');
});

test('dispose rejects pending runs with the disposed stage', async () => {
	const client = createLuauClient({ spawn: () => fakeWorker() });
	const run = client.runCascade(cascadeOptions());
	client.dispose();
	expect.equal((await rejection(run)).stage, 'disposed', 'disposed, not a Luau run error');
});

// Timers the test fires by hand, with the delay each was set for.
function manualTimers() {
	const timers = [];
	return {
		timers,
		setTimer: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
		clearTimer: () => {},
	};
}

test('the first run on a fresh worker gets the longer load timeout; later runs the normal one', async () => {
	const workers = [];
	const { timers, setTimer, clearTimer } = manualTimers();
	const client = createLuauClient({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; }, setTimer, clearTimer });
	const first = client.runCascade(cascadeOptions());
	expect.equal(timers[0].delay, FIRST_RUN_TIMEOUT_MS, 'the first run covers the download and compile');
	workers[0].reply({ type: 'cascade', id: workers[0].sent[0].id, packed: new Float32Array(1), ms: 1, loadMs: 2 });
	await first;
	client.runCascade(cascadeOptions()).catch(() => {});
	expect.equal(timers[1].delay, TIMEOUT_MS, 'a warm worker gets the normal timeout');
	expect.truthy(FIRST_RUN_TIMEOUT_MS > TIMEOUT_MS, 'longer');
	client.dispose();
});

test('no answer in time rejects with the timeout stage, and a late reply to the captured handler changes nothing', async () => {
	const workers = [];
	const { timers, setTimer, clearTimer } = manualTimers();
	const client = createLuauClient({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; }, setTimer, clearTimer });
	const run = client.runCascade(cascadeOptions());
	const handler = workers[0].onmessage; // what a real Worker could still call after terminate()
	timers[0].fn();
	const error = await rejection(run);
	expect.equal(error.stage, 'timeout', 'timeout stage');
	expect.truthy(error.message.includes(`${FIRST_RUN_TIMEOUT_MS / 1000} s`), `the message names the limit (${error.message})`);
	expect.equal(workers[0].terminated, true, 'discarded');
	handler({ data: { type: 'cascade', id: workers[0].sent[0].id, packed: new Float32Array(1), ms: 1, loadMs: 0 } });
	handler({ data: { type: 'error', id: workers[0].sent[0].id, stage: 'run', message: 'late', fatal: true } });
	// The next run is on a fresh worker and is not disturbed by the old worker's late replies.
	const next = client.runCascade(cascadeOptions());
	expect.equal(workers.length, 2, 'a fresh worker');
	handler({ data: { type: 'cascade', id: workers[1].sent[0].id, packed: new Float32Array(1), ms: 9, loadMs: 0 } });
	workers[1].reply({ type: 'cascade', id: workers[1].sent[0].id, packed: new Float32Array(1), ms: 2, loadMs: 0 });
	expect.equal((await next).ms, 2, 'answered by the fresh worker, not the old one');
});

test('a reply with an unknown id on a live worker is ignored and the pending run still settles', async () => {
	const workers = [];
	const client = createLuauClient({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; } });
	const run = client.runCascade(cascadeOptions());
	workers[0].reply({ type: 'cascade', id: 999, packed: new Float32Array(1), ms: 5, loadMs: 0 });
	workers[0].reply({ type: 'cascade', id: workers[0].sent[0].id, packed: new Float32Array(1), ms: 6, loadMs: 0 });
	expect.equal((await run).ms, 6, 'the right run');
	client.dispose();
});

test('the first answer from a fresh worker reports everything but the Luau run as start-up time', async () => {
	const workers = [];
	let clock = 1000;
	const client = createLuauClient({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; }, now: () => clock });
	const first = client.runCascade(cascadeOptions());
	clock = 1750; // spawned at 1000, answered at 1750, the Luau itself ran for 200
	workers[0].reply({ type: 'cascade', id: workers[0].sent[0].id, packed: new Float32Array(1), ms: 200, loadMs: 300 });
	expect.equal((await first).loadMs, 550, 'spawn to answer, minus the Luau run');
	const second = client.runCascade(cascadeOptions());
	clock = 2000;
	workers[0].reply({ type: 'cascade', id: workers[0].sent[1].id, packed: new Float32Array(1), ms: 200, loadMs: 0 });
	expect.equal((await second).loadMs, 0, 'a warm worker reports no start-up');
	client.dispose();
});
