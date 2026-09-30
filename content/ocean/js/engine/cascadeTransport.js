// Twin of the cascade-worker wiring in OceanClient.client.luau: spawns one worker per cascade,
// configures each, lends each its packed buffer with every evolve request, and falls back to
// running every cascade on this thread when workers cannot be created or report an error.
// `retune(index)` (A3) hands a cascade the config `configFor` gives NOW -- the page's live wind,
// fetch and seed -- without a Configure: the worker rebuilds its spectrum and keeps its buffer, or
// on the main thread the local cascade is rebuilt in place.
import * as Cascade from '../core/cascade.js';
import * as FFT from '../core/fft.js';
import * as FieldStore from '../core/fieldStore.js';
import { CONFIGURE_TIMEOUT_FRAMES } from './config.js';

export function createCascades({ count, cells, configFor, spawn, useWorkers, onFields, onReady, log = console }) {
	const bytes = FieldStore.bufferSize(cells);
	const lastMs = new Float64Array(count);
	// 1 once cascade i+1's worker has replied, so lastMs[i] is a measurement and not the initial 0.
	const replied = new Uint8Array(count);
	// The last spectrum rebuild per cascade, in ms; NaN until one has been timed.
	const lastRetuneMs = new Float64Array(count).fill(Number.NaN);
	const slots = [];
	let mode = 'workers';
	let reason = null;
	let local = null; // { cascades, plan, scratch } once on the main thread

	function toMainThread(why) {
		if (mode === 'main-thread') {
			return;
		}
		// Built before anything changes: if it throws, the transport stays as it was (still on its
		// workers) and the error goes to the caller, rather than 'main-thread' with no cascades.
		const built = {
			cascades: Array.from({ length: count }, (_, i) => Cascade.create(configFor(i + 1))),
			plan: FFT.plan(configFor(1).n),
			scratch: new Float32Array(bytes / 4),
		};
		local = built;
		mode = 'main-thread';
		reason = why;
		for (const slot of slots) {
			slot.worker?.terminate();
		}
		log.warn(`[ocean] cascades on the main thread: ${why}`);
	}

	function configure(index) {
		slots[index - 1].worker.postMessage({ type: 'configure', index, config: configFor(index) });
	}

	if (!useWorkers) {
		toMainThread('workers turned off (?workers=0)');
	} else {
		try {
			for (let index = 1; index <= count; index++) {
				const worker = spawn(index);
				const slot = { worker, ready: false, pending: false, configuredFrame: 0, warned: false, buffer: new ArrayBuffer(bytes) };
				slots.push(slot);
				worker.onmessage = ({ data }) => {
					if (data.type === 'ready') {
						slot.ready = true;
						onReady(index);
					} else if (data.type === 'fields') {
						slot.buffer = data.buffer;
						slot.pending = false;
						lastMs[index - 1] = data.ms;
						replied[index - 1] = 1;
						onFields(index, new Float32Array(data.buffer), data.t);
					} else if (data.type === 'retuned') {
						lastRetuneMs[index - 1] = data.ms;
					}
				};
				worker.onerror = (event) => {
					// Handled here: cancelled so the page does not also report it as uncaught. `||`, not
					// `??`: a worker that fails to load reports an empty message.
					event?.preventDefault?.();
					toMainThread(`cascade worker ${index} failed: ${event?.message || 'unknown error'}`);
				};
			}
			for (let index = 1; index <= count; index++) {
				configure(index);
			}
		} catch (error) {
			toMainThread(`cascade workers could not start: ${error.message}`);
		}
	}

	function request(index, t, frame) {
		if (mode === 'main-thread') {
			const cascade = local.cascades[index - 1];
			Cascade.evolve(cascade, t);
			Cascade.synthesise(cascade, local.plan);
			FieldStore.pack(cascade, local.scratch);
			onFields(index, local.scratch, t);
			return 'local';
		}
		const slot = slots[index - 1];
		if (slot.ready) {
			if (slot.pending) {
				return 'busy';
			}
			slot.pending = true;
			const buffer = slot.buffer;
			slot.buffer = null;
			slot.worker.postMessage({ type: 'evolve', t, buffer }, [buffer]);
			return 'sent';
		}
		if (frame - slot.configuredFrame <= CONFIGURE_TIMEOUT_FRAMES) {
			return 'waiting';
		}
		if (!slot.warned) {
			log.warn(`[ocean] worker ${index} not ready after ${CONFIGURE_TIMEOUT_FRAMES} frames; re-sending Configure`);
			slot.warned = true;
		}
		slot.configuredFrame = frame;
		configure(index);
		return 'resent';
	}

	// A worker that has not answered its Configure is left alone ('waiting'): the caller keeps the
	// retune pending and tries again, because a Configure re-sent after a timeout reads configFor
	// anyway, and a retune posted ahead of a Configure would be refused.
	function retune(index) {
		if (mode === 'main-thread') {
			const started = performance.now();
			local.cascades[index - 1] = Cascade.create(configFor(index));
			lastRetuneMs[index - 1] = performance.now() - started;
			return 'local';
		}
		const slot = slots[index - 1];
		if (!slot.ready) {
			return 'waiting';
		}
		slot.worker.postMessage({ type: 'retune', index, config: configFor(index) });
		return 'sent';
	}

	return {
		request,
		retune,
		mode: () => mode,
		fallbackReason: () => reason,
		readyCount: () => (mode === 'main-thread' ? count : slots.filter((s) => s.ready).length),
		lastMs,
		replied,
		lastRetuneMs,
		terminate() {
			for (const slot of slots) {
				slot.worker?.terminate();
			}
		},
	};
}
