import { test } from 'node:test';
import * as expect from '../expect.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as MapRotation from '../../../content/ocean/js/core/mapRotation.js';
import * as WaterColour from '../../../content/ocean/js/core/waterColour.js';
import { color3 } from '../../../content/ocean/js/core/luau.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';
import * as PainterClient from '../../../content/ocean/js/engine/painterClient.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const N = 16;
const SIZES = [256, 64, 16];

function mapsConfig() {
	const { mask, colour, normal } = PainterClient.cascades(3);
	return {
		role: 'maps', n: N, sizes: SIZES, texels: 64, colourTexels: 512, bandRows: 128, tile: 256,
		blockTexels: 32, blockStuds: 64, imageTexels: 64,
		maskCascades: mask, colourCascades: colour, normalCascades: normal,
		peak: 10.3, tint: 0.35, gamma: 0.8, decay: 0.98,
		lut: WaterColour.lut(color3(0.1, 0.2, 0.3), color3(0.2, 0.6, 0.6)),
		foamEnabled: true, foamTexels: 64, foamWhitecap: 0.35, foamGrow: 2, foamDecay: 0.86,
		foamThreshold: 0, foamFeather: 1.3, foamLace: 0.3, foamOpacity: 0.7, foamRoughness: 1,
		foamColour: [232, 228, 210], ringRoughness: [0.15, 0.2, 0.3], chop: 0.8,
	};
}

function harness(spawn) {
	const uploads = [];
	const warnings = [];
	const stage = { paint: 0, upload: 0 };
	const store = FieldStore.create(N, SIZES);
	const painter = PainterClient.create({
		config: mapsConfig(),
		spawn: spawn ?? (() => createInProcessWorker(createPainterWorker)),
		sink: {
			uploadColourBand: (band, pixels) => uploads.push(`colour${band}:${pixels.length}`),
			uploadMaskOrNormal: (slot, pixels) => uploads.push(`${slot === MapRotation.MASK ? 'mask' : 'normal'}:${pixels.length}`),
			uploadRoughness: (ring, pixels) => uploads.push(`rough${ring}:${pixels.length}`),
		},
		stage,
		log: { warn: (text) => warnings.push(text) },
	});
	return { painter, uploads, warnings, stage, store };
}

test('cascades gives the mask and colour every cascade and the normal map all but the first', () => {
	const { mask, colour, normal } = PainterClient.cascades(3);
	expect.equal(mask.join(','), '1,2,3', 'mask');
	expect.equal(colour.join(','), '1,2,3', 'colour');
	expect.equal(normal.join(','), '2,3', 'normal');
});

test('both painters must be ready; then colour bands rotate 1..4 and maps alternate mask and normal', async () => {
	const { painter, uploads, store } = harness();
	PainterClient.step(painter, 1, 0, store);
	expect.equal(uploads.length, 0, 'nothing before ready');
	await flush();
	expect.equal(PainterClient.ready(painter), true, 'ready');
	for (let frame = 2; frame <= 9; frame++) {
		PainterClient.step(painter, frame, 0, store);
		await flush();
	}
	const colours = uploads.filter((u) => u.startsWith('colour')).map((u) => u.split(':')[0]);
	expect.equal(colours.slice(0, 5).join(','), 'colour1,colour2,colour3,colour4,colour1', 'band rotation');
	const maps = uploads.filter((u) => u.startsWith('mask') || u.startsWith('normal')).map((u) => u.split(':')[0]);
	expect.equal(maps.slice(0, 4).join(','), 'mask,normal,mask,normal', 'maps rotation');
	expect.equal(uploads.filter((u) => u.startsWith('rough')).length >= 3, true, 'one roughness map per ring after band 4');
});

test('a paint still in flight is skipped and counted', async () => {
	const { painter, store } = harness();
	await flush();
	PainterClient.step(painter, 2, 0, store);
	PainterClient.step(painter, 3, 0, store);
	const report = PainterClient.report(painter);
	expect.truthy(report.skipped >= 2, `skipped counted: ${report.skipped}`);
});

test('a silent painter has its pending paint dropped after the timeout, warned once', async () => {
	const silent = () => {
		const worker = { onmessage: null, onerror: null, terminate() {} };
		worker.postMessage = (message) => {
			if (message.type === 'configure') queueMicrotask(() => worker.onmessage({ data: { type: 'ready' } }));
		};
		return worker;
	};
	const { painter, warnings, store } = harness(silent);
	await flush();
	for (let frame = 1; frame <= 70; frame++) PainterClient.step(painter, frame, 0, store);
	expect.equal(warnings.filter((w) => w.includes('colour painter silent')).length, 1, 'colour warned once');
	expect.equal(warnings.filter((w) => w.includes('maps painter silent')).length, 1, 'maps warned once');
});

test('a reply with a stale sequence is dropped and counted', async () => {
	// The first pixels reply comes back numbered one below the paint it answers, as a reply to an
	// earlier, dropped paint would.
	const staling = () => {
		const inner = createInProcessWorker(createPainterWorker);
		const worker = { onmessage: null, onerror: null, terminate() {}, postMessage: (m, t) => inner.postMessage(m, t) };
		let first = true;
		inner.onmessage = (event) => {
			if (event.data.type === 'pixels' && first) {
				first = false;
				worker.onmessage({ data: { ...event.data, sequence: event.data.sequence - 1 } });
				return;
			}
			worker.onmessage(event);
		};
		return worker;
	};
	const { painter, store } = harness(staling);
	await flush();
	PainterClient.step(painter, 2, 0, store);
	await flush();
	PainterClient.step(painter, 3, 0, store);
	await flush();
	expect.truthy(PainterClient.report(painter).stale >= 1, 'stale reply counted');
});

test('a spawn that throws paints on the main thread instead (Review Focus 1)', async () => {
	const { painter, uploads, store } = harness(() => {
		throw new Error('no module workers');
	});
	expect.equal(PainterClient.mode(painter), 'main-thread', 'fell back');
	expect.truthy(PainterClient.fallbackReason(painter).includes('no module workers'), 'reason');
	await flush();
	PainterClient.step(painter, 2, 0, store);
	await flush();
	expect.truthy(uploads.length > 0, 'still paints');
});

// Wraps the real core, but every paint reports an error instead of painting, as a worker whose
// fill throws would.
function failingOnPaint() {
	const inner = createInProcessWorker(createPainterWorker);
	const worker = { onmessage: null, onerror: null, terminate: () => inner.terminate() };
	inner.onmessage = (event) => worker.onmessage(event);
	worker.postMessage = (message, transfer) => {
		if (message.type === 'paint') {
			queueMicrotask(() => worker.onerror({ message: 'boom' }));
			return;
		}
		inner.postMessage(message, transfer);
	};
	return worker;
}

test('events queued by replaced workers are ignored: one fallback, no false main-thread failure, no stray readies', async () => {
	// Both module workers fail to load: both error events (and anything else they queued) can be
	// waiting before the first is handled, and terminate() cancels none of them.
	const spawned = [];
	const fake = () => {
		const worker = { onmessage: null, onerror: null, postMessage() {}, terminate() {} };
		spawned.push(worker);
		return worker;
	};
	const { painter, warnings } = harness(fake);
	const handlers = spawned.map((worker) => ({ error: worker.onerror, message: worker.onmessage }));
	handlers[0].error({ message: '' });
	handlers[1].error({ message: 'blocked' });
	handlers[0].message({ data: { type: 'ready' } });
	handlers[1].message({ data: { type: 'ready' } });
	expect.equal(PainterClient.mode(painter), 'main-thread', 'fell back');
	expect.equal(PainterClient.fallbackReason(painter), 'maps painter failed: unknown error', 'an empty message still names a reason');
	expect.equal(warnings.filter((w) => w.includes('painters on the main thread')).length, 1, 'one fallback warning');
	expect.equal(warnings.filter((w) => w.includes('failed on the main thread')).length, 0, 'no false main-thread failure');
	expect.equal(PainterClient.ready(painter), false, 'readies from the replaced workers not counted');
	await flush();
	expect.equal(PainterClient.ready(painter), true, 'the new pair answers for itself');
});

test('a worker that reports an error moves painting to the main thread, reason kept, and painting continues', async () => {
	const { painter, uploads, warnings, store } = harness(failingOnPaint);
	await flush();
	expect.equal(PainterClient.mode(painter), 'workers', 'workers until something fails');
	PainterClient.step(painter, 2, 0, store);
	await flush();
	expect.equal(PainterClient.mode(painter), 'main-thread', 'fell back');
	expect.truthy(PainterClient.fallbackReason(painter).includes('boom'), `reason: ${PainterClient.fallbackReason(painter)}`);
	expect.equal(warnings.filter((w) => w.includes('failed on the main thread')).length, 0, 'the second error is not a main-thread failure');
	for (let frame = 3; frame <= 5; frame++) {
		PainterClient.step(painter, frame, 0, store);
		await flush();
	}
	expect.truthy(uploads.some((u) => u.startsWith('colour')), 'colour still paints');
	expect.truthy(uploads.some((u) => u.startsWith('mask')), 'maps still paint');
});

test('after a fallback the colour rotation restarts at band 1', async () => {
	const { painter, uploads, store } = harness(failingOnPaint);
	await flush();
	PainterClient.step(painter, 2, 0, store); // band 1 goes to the failing worker and is lost
	await flush();
	for (let frame = 3; frame <= 6; frame++) {
		PainterClient.step(painter, frame, 0, store);
		await flush();
	}
	const colours = uploads.filter((u) => u.startsWith('colour')).map((u) => u.split(':')[0]);
	expect.equal(colours.join(','), 'colour1,colour2,colour3,colour4', 'the new colour worker starts on band 1');
});

test('with no sink the pixels are dropped and counted', async () => {
	const { painter, uploads, store } = harness();
	painter.sink = null;
	await flush();
	for (let frame = 2; frame <= 5; frame++) {
		PainterClient.step(painter, frame, 0, store);
		await flush();
	}
	expect.equal(uploads.length, 0, 'nothing uploaded');
	expect.equal(PainterClient.report(painter).dropped, 8, 'four colour and four maps replies dropped');
	expect.equal(PainterClient.report(painter).dropped, 0, 'per window');
});

test('a worker error event is cancelled so it does not also surface as an uncaught page error', () => {
	const spawned = [];
	const fake = () => {
		const worker = { onmessage: null, onerror: null, postMessage() {}, terminate() {} };
		spawned.push(worker);
		return worker;
	};
	const { painter } = harness(fake);
	let prevented = 0;
	const handlers = spawned.map((worker) => worker.onerror);
	handlers[0]({ message: 'blocked', preventDefault: () => { prevented += 1; } });
	expect.equal(prevented, 1, 'preventDefault called');
	expect.equal(PainterClient.mode(painter), 'main-thread', 'fell back');
	handlers[1]({ message: 'blocked', preventDefault: () => { prevented += 1; } });
	expect.equal(prevented, 2, 'an error from a replaced worker is cancelled too');
});

// A painter spawn that records every message type the client posts.
function recordingSpawn(posted) {
	return () => {
		const inner = createInProcessWorker(createPainterWorker);
		const worker = {
			onmessage: null,
			onerror: null,
			postMessage: (message, transfer) => {
				posted.push(message.type);
				inner.postMessage(message, transfer);
			},
			terminate: () => inner.terminate(),
		};
		inner.onmessage = (event) => worker.onmessage?.(event);
		inner.onerror = (event) => worker.onerror?.(event);
		return worker;
	};
}

test('update reaches both workers and both kept configs, and puts cleared maps back to rest', async () => {
	const posted = [];
	const calls = [];
	const store = FieldStore.create(N, SIZES);
	const painter = PainterClient.create({
		config: mapsConfig(),
		spawn: recordingSpawn(posted),
		sink: {
			uploadColourBand() {},
			uploadMaskOrNormal() {},
			uploadRoughness() {},
			clearNormal: () => calls.push('clearNormal'),
			resetRoughness: () => calls.push('resetRoughness'),
		},
		stage: { paint: 0, upload: 0 },
		log: { warn() {} },
	});
	await flush();
	painter.coverage[0] = 0.5;
	PainterClient.update(painter, { chop: 0.3, normalCascades: [], foamEnabled: false });
	expect.equal(posted.filter((type) => type === 'update').length, 2, 'one update to each worker');
	expect.equal(posted.filter((type) => type === 'configure').length, 2, 'no Configure beyond the first two');
	expect.equal(painter.mapsConfig.chop, 0.3, 'the maps config keeps it');
	expect.equal(painter.colourConfig.chop, 0.3, 'the colour config keeps it');
	expect.equal(painter.colourConfig.role, 'colour', 'the roles are untouched');
	expect.equal(painter.paintsNormal, false, 'no normal cascade left');
	expect.equal(calls.join(','), 'clearNormal,resetRoughness', 'the sink put both maps back to rest');
	expect.truthy(painter.coverage.every((value) => value === 0), 'the kept coverage cleared');
	for (let frame = 2; frame <= 9; frame++) {
		PainterClient.step(painter, frame, 0, store);
		await flush();
	}
	expect.equal(PainterClient.ready(painter), true, 'still painting');
	let message = '';
	try {
		PainterClient.update(painter, { lut: [] });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('lut'), `refused on this side too: ${message}`);
});
