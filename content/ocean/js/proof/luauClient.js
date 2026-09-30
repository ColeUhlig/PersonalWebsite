// The page's side of the Luau worker (workers/luauWorkerCore.js): spawns it on the first run,
// matches replies to runs by id, and turns every way the Luau side can fail into a rejected
// promise with a `stage` the panel can explain. Browser-free: the caller passes `spawn`, which
// returns a Worker-shaped object ({ postMessage, onmessage, onerror, terminate }) or throws.
//
// Stages: 'spawn' (no worker could be made: no Web Workers here), 'load' (the worker script, the
// runtime or the bundle did not load), 'run' (the Luau raised an error), 'crash' (the WebAssembly
// module aborted), 'timeout' (no answer in time). After 'load' from the worker script itself,
// 'crash' and 'timeout' the worker is thrown away and the next run spawns a fresh one.

export const TIMEOUT_MS = 60_000;

export class LuauRunError extends Error {
	constructor(stage, message) {
		super(message);
		this.name = 'LuauRunError';
		this.stage = stage;
	}
}

/**
 * @param {{ spawn: () => object, timeoutMs?: number, setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout }} deps
 */
export function createLuauClient({ spawn, timeoutMs = TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
	let worker = null;
	let nextId = 1;
	const pending = new Map();

	function settle(id, outcome) {
		const entry = pending.get(id);
		if (!entry) {
			return; // a late reply from a run that already timed out, or from a discarded worker
		}
		pending.delete(id);
		clearTimer(entry.timer);
		if (outcome instanceof Error) {
			entry.reject(outcome);
		} else {
			entry.resolve(outcome);
		}
	}

	// Throws the worker away and fails every run still waiting on it.
	function discard(stage, message) {
		const current = worker;
		worker = null;
		if (current) {
			current.onmessage = null;
			current.onerror = null;
			current.terminate();
		}
		for (const id of [...pending.keys()]) {
			settle(id, new LuauRunError(stage, message));
		}
	}

	function ensureWorker() {
		if (worker) {
			return worker;
		}
		const created = spawn(); // may throw: the caller turns that into a 'spawn' rejection
		created.onmessage = ({ data }) => {
			if (data?.type === 'cascade') {
				settle(data.id, { packed: data.packed, ms: data.ms, loadMs: data.loadMs });
			} else if (data?.type === 'error') {
				if (data.fatal) {
					settle(data.id, new LuauRunError('crash', data.message));
					discard('crash', data.message);
				} else {
					settle(data.id, new LuauRunError(data.stage === 'load' ? 'load' : 'run', data.message));
				}
			}
		};
		// A module worker whose script (or one of its imports) fails to load reports it here.
		created.onerror = (event) => {
			event?.preventDefault?.();
			discard('load', event?.message || 'the Luau worker failed to start');
		};
		worker = created;
		return worker;
	}

	/**
	 * @param {import('./luauRunner.js').CascadeOptions} options
	 * @returns {Promise<{ packed: Float32Array, ms: number, loadMs: number }>}
	 */
	function runCascade(options) {
		return new Promise((resolve, reject) => {
			let target;
			try {
				target = ensureWorker();
			} catch (error) {
				reject(new LuauRunError('spawn', error?.message ?? String(error)));
				return;
			}
			const id = nextId++;
			const timer = setTimer(() => {
				if (pending.has(id)) {
					discard('timeout', `the Luau run did not answer within ${Math.round(timeoutMs / 1000)} s`);
				}
			}, timeoutMs);
			pending.set(id, { resolve, reject, timer });
			target.postMessage({ type: 'cascade', id, options });
		});
	}

	function dispose() {
		discard('run', 'the Luau client was disposed');
	}

	return Object.freeze({ runCascade, dispose });
}
