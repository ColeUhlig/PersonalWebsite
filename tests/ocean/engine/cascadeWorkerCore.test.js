import { test } from 'node:test';
import * as expect from '../expect.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';

const N = 16;
const config = (scale) => ({ n: N, size: 64, kMin: 0, kMax: Infinity, seed: 101, loopPeriod: 120, params: { ...Spectrum.NORMAL, scale } });

function evolveAt(handle, replies, t) {
	handle({ type: 'evolve', t, buffer: new ArrayBuffer(FieldStore.bufferSize(N * N)) });
	return new Float32Array(replies.at(-1).buffer);
}

test('a retune rebuilds the spectrum with the same seed: the same waves, new heights', () => {
	const replies = [];
	const handle = createCascadeWorker((message) => replies.push(message));
	handle({ type: 'configure', index: 2, config: config(4) });
	const before = evolveAt(handle, replies, 9);
	handle({ type: 'retune', index: 2, config: config(8) });
	const retuned = replies.at(-1);
	expect.equal(retuned.type, 'retuned', 'answered retuned, not ready');
	expect.equal(retuned.index, 2, 'index echoed');
	expect.truthy(Number.isFinite(retuned.ms) && retuned.ms >= 0, 'the rebuild time');
	const after = evolveAt(handle, replies, 9);
	let nonZero = 0;
	for (const i of [0, 5, 77, 200]) {
		// Scale enters the variance squared and the amplitude once: doubling it doubles every value
		// exactly, since every step of the synthesis commutes with a power-of-two scaling.
		expect.equal(after[i], before[i] * 2, `height ${i} doubled`);
		if (before[i] !== 0) nonZero += 1;
	}
	expect.truthy(nonZero > 0, 'the compared heights are not all zero');
});

test('a retune before configure is refused', () => {
	const handle = createCascadeWorker(() => {});
	let message = '';
	try {
		handle({ type: 'retune', index: 1, config: config(8) });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('retune before configure'), message);
});
