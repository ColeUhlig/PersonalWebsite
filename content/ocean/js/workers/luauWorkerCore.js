// The proof panel's Luau worker, browser-free so Node can test it: it loads the WebAssembly Luau
// runtime and the bundle on the first message, keeps one runner for every run after it, and
// answers every message with exactly one reply, never a throw.
//
// Messages in: { type: 'cascade', id, options } with options a CascadeOptions (luauRunner.js).
// Replies:
//   { type: 'cascade', id, packed: Float32Array, ms, loadMs }  packed's buffer is transferred;
//     ms is the Luau's own time (os.clock) for build, evolve and synthesis; loadMs is what loading
//     the runtime and compiling the bundle took, on the run that did it, and 0 after (the client
//     reports the fuller start-up, from spawning the worker, in its place).
//   { type: 'error', id, stage: 'wasm' | 'load' | 'run', message, fatal }
//     stage 'wasm': this worker has no WebAssembly (iOS Lockdown Mode, a managed browser), so the
//     runtime cannot exist; nothing is fetched. This file never touches WebAssembly when it is
//     missing, since the error path would throw a second time and leave the message unanswered.
//     stage 'load': the runtime or the bundle could not be loaded (the next message tries again,
//     though the client throws a browser worker away instead: its module map keeps the failure).
//     fatal: the WebAssembly module aborted (its fixed heap ran out, or a trap); nothing in this
//     worker can be trusted after it, so the client throws the worker away.
import { createLuauRunner } from '../proof/luauRunner.js';

/**
 * @param {(message: object, transfer?: Transferable[]) => void} post
 * @param {{ loadRuntime: () => Promise<{ LuauState: object }>, loadSource: () => Promise<string>, now?: () => number }} deps
 * @returns {(message: object) => Promise<void>}
 */
export function createLuauWorker(post, { loadRuntime, loadSource, now = () => performance.now() }) {
	let loading = null;

	function load() {
		if (!loading) {
			loading = (async () => {
				const started = now();
				const [runtime, source] = await Promise.all([loadRuntime(), loadSource()]);
				const runner = await createLuauRunner(runtime.LuauState, source);
				return { runner, loadMs: now() - started };
			})();
			// A failed load is not kept: the next message tries again (the network may be back).
			loading.catch(() => {
				loading = null;
			});
		}
		return loading;
	}

	function fail(id, stage, error) {
		post({
			type: 'error',
			id,
			stage,
			message: error?.message ?? String(error),
			fatal: typeof WebAssembly !== 'undefined' && error instanceof WebAssembly.RuntimeError,
		});
	}

	return async function handle(message) {
		const id = message?.id;
		if (message?.type !== 'cascade') {
			fail(id, 'run', new Error(`unknown message type ${message?.type}`));
			return;
		}
		if (typeof WebAssembly === 'undefined') {
			fail(id, 'wasm', new Error('this browser has WebAssembly switched off'));
			return;
		}
		let loaded;
		let firstRun;
		try {
			firstRun = loading === null;
			loaded = await load();
		} catch (error) {
			fail(id, 'load', error);
			return;
		}
		try {
			const { packed, ms } = await loaded.runner.cascade(message.options);
			post({ type: 'cascade', id, packed, ms, loadMs: firstRun ? loaded.loadMs : 0 }, [packed.buffer]);
		} catch (error) {
			fail(id, 'run', error);
		}
	};
}
