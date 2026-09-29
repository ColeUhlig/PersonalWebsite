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
