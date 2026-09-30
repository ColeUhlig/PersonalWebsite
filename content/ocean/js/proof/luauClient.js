// The page's side of the Luau worker (workers/luauWorkerCore.js): spawns it on the first run,
// matches replies to runs by id, and turns every way the Luau side can fail into a rejected
// promise with a `stage` the panel can explain. Browser-free: the caller passes `spawn`, which
// returns a Worker-shaped object ({ postMessage, onmessage, onerror, terminate }) or throws.
//
// Stages: 'spawn' (no worker could be made: no Web Workers here), 'wasm' (this browser has no
// WebAssembly, so the runtime cannot exist), 'load' (the worker script, the runtime or the bundle
// did not load), 'run' (the Luau raised an error), 'crash' (the WebAssembly module aborted, the
// worker failed after it had answered, or a reply could not be read), 'timeout' (no answer in
// time), 'disposed' (the client was disposed while the run waited). After every stage but 'run'
// the worker is thrown away and the next run spawns a fresh one. That includes 'load': a module
// worker keeps a failed import in its module map, so only a fresh worker can really try again.
//
// Timeouts: a run sent to a worker that has not answered yet also waits for the worker script,
// the runtime download (about 0.3 to 0.4 MB compressed) and the compile, which on a slow
// connection can take well over a minute, so it gets FIRST_RUN_TIMEOUT_MS. Every later run gets
// TIMEOUT_MS (the Luau run itself takes well under a second). A load that never ends still ends.

export const TIMEOUT_MS = 60_000;
export const FIRST_RUN_TIMEOUT_MS = 180_000;

export class LuauRunError extends Error {
	constructor(stage, message) {
		super(message);
		this.name = 'LuauRunError';
		this.stage = stage;
	}
}

/**
 * @param {{ spawn: () => object, timeoutMs?: number, firstRunTimeoutMs?: number, setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout, now?: () => number, hasWebAssembly?: () => boolean }} deps
 */
export function createLuauClient({
	spawn,
	timeoutMs = TIMEOUT_MS,
	firstRunTimeoutMs = FIRST_RUN_TIMEOUT_MS,
	setTimer = setTimeout,
	clearTimer = clearTimeout,
	now = () => performance.now(),
	hasWebAssembly = () => typeof WebAssembly !== 'undefined',
}) {
	// The live worker: { worker, spawnedAt, replied }.
	let current = null;
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
		const record = current;
		current = null;
		if (record) {
			record.worker.onmessage = null;
			record.worker.onerror = null;
			record.worker.onmessageerror = null;
			record.worker.terminate();
		}
		for (const id of [...pending.keys()]) {
			settle(id, new LuauRunError(stage, message));
		}
	}

	function onReply(record, data) {
		if (record !== current) {
			return; // a discarded worker's handler, still called by a browser after terminate()
		}
		const first = !record.replied;
		record.replied = true;
		if (data?.type === 'cascade') {
			// On a fresh worker, everything but the Luau run itself was start-up: spawning the
			// worker, fetching its script and the runtime, and compiling the bundle.
			const loadMs = first ? Math.max(0, now() - record.spawnedAt - data.ms) : data.loadMs;
			settle(data.id, { packed: data.packed, ms: data.ms, loadMs });
		} else if (data?.type === 'error') {
			if (data.fatal) {
				settle(data.id, new LuauRunError('crash', data.message));
				discard('crash', data.message);
			} else if (data.stage === 'load' || data.stage === 'wasm') {
				settle(data.id, new LuauRunError(data.stage, data.message));
				discard(data.stage, data.message);
			} else {
				settle(data.id, new LuauRunError('run', data.message));
			}
		}
	}

	function ensureWorker() {
		if (current) {
			return current;
		}
		const created = spawn(); // may throw: the caller turns that into a 'spawn' rejection
		const record = { worker: created, spawnedAt: now(), replied: false };
		created.onmessage = ({ data }) => onReply(record, data);
		// A module worker whose script (or one of its imports) fails to load reports it here; so
		// does an uncaught error later, which after an answer means the worker has crashed.
		created.onerror = (event) => {
			event?.preventDefault?.();
			if (record === current) {
				discard(record.replied ? 'crash' : 'load', event?.message || 'the Luau worker failed');
			}
		};
		created.onmessageerror = () => {
			if (record === current) {
				discard('crash', 'a reply from the Luau worker could not be read');
			}
		};
		current = record;
		return record;
	}

	/**
	 * @param {import('./luauRunner.js').CascadeOptions} options
	 * @returns {Promise<{ packed: Float32Array, ms: number, loadMs: number }>} loadMs is the
	 *   start-up (worker, runtime and bundle) on a fresh worker's first answer, and 0 after
	 */
	function runCascade(options) {
		return new Promise((resolve, reject) => {
			if (!hasWebAssembly()) {
				reject(new LuauRunError('wasm', 'WebAssembly is not available in this browser'));
				return;
			}
			let record;
			try {
				record = ensureWorker();
			} catch (error) {
				reject(new LuauRunError('spawn', error?.message ?? String(error)));
				return;
			}
			const id = nextId++;
			const limit = record.replied ? timeoutMs : firstRunTimeoutMs;
			const timer = setTimer(() => {
				if (pending.has(id)) {
					discard('timeout', `the Luau run did not answer within ${Math.round(limit / 1000)} s`);
				}
			}, limit);
			pending.set(id, { resolve, reject, timer });
			record.worker.postMessage({ type: 'cascade', id, options });
		});
	}

	function dispose() {
		discard('disposed', 'the Luau client was disposed');
	}

	return Object.freeze({ runCascade, dispose });
}
