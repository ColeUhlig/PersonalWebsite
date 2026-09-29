// Twin of the cascade-worker wiring in OceanClient.client.luau: spawns one worker per cascade,
// configures each, lends each its packed buffer with every evolve request, and falls back to
// running every cascade on this thread when workers cannot be created or report an error.
import * as Cascade from '../core/cascade.js';
import * as FFT from '../core/fft.js';
import * as FieldStore from '../core/fieldStore.js';
import { CONFIGURE_TIMEOUT_FRAMES } from './config.js';

export function createCascades({ count, cells, configFor, spawn, useWorkers, onFields, onReady, log = console }) {
	const bytes = FieldStore.bufferSize(cells);
	const lastMs = new Float64Array(count);
	const slots = [];
	let mode = 'workers';
	let reason = null;
	let local = null; // { cascades, plan, scratch } once on the main thread

	function toMainThread(why) {
		if (mode === 'main-thread') {
			return;
		}
		mode = 'main-thread';
		reason = why;
		for (const slot of slots) {
			slot.worker?.terminate();
		}
		local = {
			cascades: Array.from({ length: count }, (_, i) => Cascade.create(configFor(i + 1))),
			plan: FFT.plan(configFor(1).n),
			scratch: new Float32Array(bytes / 4),
		};
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
						onFields(index, new Float32Array(data.buffer), data.t);
					}
				};
				worker.onerror = (event) => toMainThread(`cascade worker ${index} failed: ${event?.message ?? 'unknown error'}`);
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

	return {
		request,
		mode: () => mode,
		fallbackReason: () => reason,
		readyCount: () => (mode === 'main-thread' ? count : slots.filter((s) => s.ready).length),
		lastMs,
		terminate() {
			for (const slot of slots) {
				slot.worker?.terminate();
			}
		},
	};
}
