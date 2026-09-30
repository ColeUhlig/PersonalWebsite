// Twin of CascadeWorker.client.luau: one cascade per worker. `configure` builds the cascade and
// answers `ready`; `evolve` steps it to t, synthesises the eight fields, packs them into the buffer
// the coordinator lent with the request and sends that buffer back. The coordinator lends it again
// with the next request, so one buffer shuttles per cascade and nothing is allocated per frame.
// `retune` (A3; the Luau has no such message, Studio never changed the sea while it ran) rebuilds
// the cascade from a new config -- the page's wind, fetch or seed -- and answers `retuned` with
// the time it took. The seed decides the random numbers, so the same seed gives the same waves
// at new heights; the next `evolve` answers with the new sea.
// Browser-free: the Worker entry point is cascade.worker.js.
import * as Cascade from '../core/cascade.js';
import * as FFT from '../core/fft.js';
import * as FieldStore from '../core/fieldStore.js';

export function createCascadeWorker(post) {
	let cascade = null;
	let plan = null;
	let index = 0;
	return function handle(message) {
		if (message.type === 'configure') {
			cascade = Cascade.create(message.config);
			plan = FFT.plan(message.config.n);
			index = message.index;
			post({ type: 'ready', index });
			return;
		}
		if (message.type === 'evolve') {
			if (!cascade) {
				throw new Error('cascade worker: evolve before configure');
			}
			const started = performance.now();
			Cascade.evolve(cascade, message.t);
			Cascade.synthesise(cascade, plan);
			FieldStore.pack(cascade, new Float32Array(message.buffer));
			const ms = performance.now() - started;
			post({ type: 'fields', index, t: message.t, buffer: message.buffer, ms }, [message.buffer]);
			return;
		}
		if (message.type === 'retune') {
			// Named by the message: before a Configure this worker has no index of its own.
			const named = message.index ?? index;
			if (!cascade) {
				throw new Error(`cascade worker ${named}: retune before configure`);
			}
			// The lent buffer and the FFT plan are sized by n: a new lattice needs a Configure.
			if (message.config.n !== plan.n) {
				throw new Error(`cascade worker ${named}: a retune cannot change n (${plan.n} to ${message.config.n}); send a configure`);
			}
			const started = performance.now();
			cascade = Cascade.create(message.config);
			post({ type: 'retuned', index, ms: performance.now() - started });
			return;
		}
		throw new Error(`cascade worker: unknown message type ${message.type}`);
	};
}
