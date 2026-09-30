// The Luau worker core and the client the panel talks to it through, in Node: the real runtime
// and bundle through an in-process worker, and fake workers for the failures a browser produces.
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';
import * as luauWeb from 'luau-web';
import { BUNDLE_URL } from '../../../content/ocean/js/proof/runtime.js';
import { createLuauWorker } from '../../../content/ocean/js/workers/luauWorkerCore.js';
import { createLuauClient, LuauRunError } from '../../../content/ocean/js/proof/luauClient.js';
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
	workers[1].reply({ type: 'cascade', id: workers[1].sent[0].id, packed: new Float32Array(1), ms: 1, loadMs: 2 });
	expect.equal((await second).loadMs, 2, 'the fresh worker answers');
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

test('a load error reply keeps the worker; a run error is the run stage', async () => {
	const workers = [];
	const client = createLuauClient({ spawn: () => { const w = fakeWorker(); workers.push(w); return w; } });
	const load = client.runCascade(cascadeOptions());
	workers[0].reply({ type: 'error', id: 1, stage: 'load', message: 'offline', fatal: false });
	expect.equal((await rejection(load)).stage, 'load', 'load stage');
	const run = client.runCascade(cascadeOptions());
	workers[0].reply({ type: 'error', id: 2, stage: 'run', message: 'bad', fatal: false });
	expect.equal((await rejection(run)).stage, 'run', 'run stage');
	expect.equal(workers.length, 1, 'the same worker throughout');
});

test('no answer in time rejects with the timeout stage and a late reply is ignored', async () => {
	const workers = [];
	const timers = [];
	const client = createLuauClient({
		spawn: () => { const w = fakeWorker(); workers.push(w); return w; },
		timeoutMs: 1000,
		setTimer: (fn) => { timers.push(fn); return timers.length; },
		clearTimer: () => {},
	});
	const run = client.runCascade(cascadeOptions());
	timers[0]();
	const error = await rejection(run);
	expect.equal(error.stage, 'timeout', 'timeout stage');
	expect.equal(workers[0].terminated, true, 'discarded');
	workers[0].reply({ type: 'cascade', id: 1, packed: new Float32Array(1), ms: 1, loadMs: 0 });
});
