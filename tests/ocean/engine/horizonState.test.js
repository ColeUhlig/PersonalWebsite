import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Horizon from '../../../content/ocean/js/engine/horizonState.js';

test('the quads ring the surface out past the horizon distance with no gaps', () => {
	const horizon = Horizon.create(256, 1024);
	expect.truthy(horizon.quads.length >= 8, `a ring of quads: ${horizon.quads.length}`);
	const far = Math.max(...horizon.quads.map((q) => Math.abs(q.offsetX) + horizon.half));
	expect.truthy(far >= Horizon.HORIZON_DISTANCE, `far edge ${far}`);
	const hole = 1024 - Horizon.OVERLAP;
	for (const q of horizon.quads) {
		const inner = Math.max(Math.abs(q.offsetX), Math.abs(q.offsetZ)) - horizon.half;
		expect.truthy(inner <= hole + 1e-9, 'each quad reaches the hole edge');
	}
});

test('update moves every quad with the origin and wraps its uvs on the tile', () => {
	const horizon = Horizon.create(256, 1024);
	expect.equal(Horizon.update(horizon, 100, -300), true, 'moved');
	for (const q of horizon.quads) {
		expect.equal(q.worldX, 100 + q.offsetX, 'worldX');
		expect.equal(q.worldZ, -300 + q.offsetZ, 'worldZ');
		const fractionZ = -300 - Math.floor(-300 / 256) * 256;
		expect.near(q.uvs[1], (fractionZ + q.offsetZ - horizon.half) / 256, 1e-6, 'corner 1 v');
		expect.equal(q.uvsChanged, true, 'uvs flagged');
	}
	expect.equal(Horizon.update(horizon, 100, -300), false, 'same origin, no move');
	const [x, z] = Horizon.quadCentre(horizon, horizon.quads[0]);
	expect.equal(x, 100 + horizon.quads[0].offsetX, 'quadCentre x');
	expect.equal(z, -300 + horizon.quads[0].offsetZ, 'quadCentre z');
});

test('a surface too small for the overlap is refused', () => {
	let message = '';
	try {
		Horizon.create(256, 10);
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('overlap'), `clear error: ${message}`);
});
