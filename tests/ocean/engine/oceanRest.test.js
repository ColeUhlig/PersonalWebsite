// A paused sea costs less than a moving one (piece C, Task 9; the 2026-09-30 ruling): while the
// page's play clock is paused and no stage setting changes, the ocean stops asking its cascades
// and painters for work it already has, once they have caught up with the held time. The rings,
// the horizon and the glow still follow the camera, and the frame count and the report go on.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';
import { DEFAULT_SETTINGS } from '../../../content/ocean/js/engine/stageControl.js';
import * as Ocean from '../../../content/ocean/js/engine/ocean.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const SUN = [-0.9526530504226685, 0.2821884751319885, 0.11323313415050507];

// Counts every message of each type the ocean posts to its workers.
function counting(create, posts) {
	return () => {
		const worker = createInProcessWorker(create);
		const post = worker.postMessage;
		worker.postMessage = (message, transfer) => {
			posts[message.type] = (posts[message.type] ?? 0) + 1;
			post(message, transfer);
		};
		return worker;
	};
}

function build({ paused }) {
	let clock = 0;
	const posts = {};
	const ocean = Ocean.create(readConfig('?tier=Low'), {
		spawnCascade: counting(createCascadeWorker, posts),
		spawnPainter: counting(createPainterWorker, posts),
		now: () => clock,
		paused,
		log: { warn() {} },
	});
	Ocean.attachSink(ocean, { uploadColourBand() {}, uploadMaskOrNormal() {}, uploadRoughness() {} });
	const advance = async (frames, dt) => {
		for (let i = 0; i < frames; i++) {
			clock += dt;
			Ocean.step(ocean, 1 / 60, [0, 0], [0, 14, 40], SUN);
			await flush();
		}
	};
	const take = () => {
		const taken = { ...posts };
		for (const key of Object.keys(posts)) delete posts[key];
		return taken;
	};
	return { ocean, advance, take };
}

const work = (posts) => (posts.evolve ?? 0) + (posts.paint ?? 0);

test('a paused clock with nothing changing stops the evolve and paint requests once caught up', async () => {
	let paused = false;
	const { ocean, advance, take } = build({ paused: () => paused });
	await advance(30, 1 / 60);
	paused = true;
	await advance(Ocean.REST_AFTER_FRAMES + 10, 0);
	take();
	const held = ocean.surface.patches[0].positions.slice();
	const frame = Ocean.status(ocean).frame;
	await advance(60, 0);
	const posts = take();
	expect.equal(work(posts), 0, `no evolve or paint while resting: ${JSON.stringify(posts)}`);
	expect.equal(Ocean.status(ocean).frame, frame + 60, 'the frame count goes on');
	expect.truthy(ocean.surface.patches[0].positions.every((v, i) => v === held[i]), 'the surface holds exactly still');
	// Pressing Play: the clock moves again and so does the work.
	paused = false;
	await advance(6, 1 / 60);
	expect.truthy((take().evolve ?? 0) > 0, 'evolving again after play');
});

test('the first frames after the pause still finish the held time, so nothing freezes half-blended', async () => {
	let paused = false;
	const { ocean, advance, take } = build({ paused: () => paused });
	await advance(30, 1 / 60);
	paused = true;
	take();
	await advance(Ocean.REST_AFTER_FRAMES, 0);
	expect.truthy(work(take()) > 0, 'work continues until the rest begins');
	const t = Ocean.status(ocean).t;
	for (const slot of ocean.store.current) {
		if (slot.filled) expect.equal(slot.time, t, 'every result is at the held time');
	}
});

test('a stage change while paused wakes the work, and a report still arrives while resting', async () => {
	let paused = true;
	const { ocean, advance, take } = build({ paused: () => paused });
	await advance(Ocean.REST_AFTER_FRAMES + 20, 0);
	take();
	Ocean.configureStage(ocean, { ...DEFAULT_SETTINGS, chop: DEFAULT_SETTINGS.chop * 0.5 });
	await advance(10, 0);
	expect.truthy(work(take()) > 0, 'a stage change wakes the cascades and painters');
	await advance(Ocean.REPORT_WINDOW, 0);
	const report = Ocean.report(ocean);
	expect.truthy(report !== null && Number.isFinite(report.writeMs), 'a report still arrives');
});

test('without a paused clock (the default) a held time keeps working, as a frozen clock always has', async () => {
	const { advance, take } = build({ paused: undefined });
	await advance(Ocean.REST_AFTER_FRAMES + 20, 0);
	take();
	await advance(30, 0);
	expect.truthy(work(take()) > 0, 'no rest without the page asking for it');
});

test('a paused that is not a function is refused', () => {
	let message = '';
	try {
		Ocean.create(readConfig('?tier=Low'), { spawnCascade: () => createInProcessWorker(createCascadeWorker), spawnPainter: () => createInProcessWorker(createPainterWorker), now: () => 0, paused: true, log: { warn() {} } });
	} catch (error) {
		message = error instanceof TypeError ? error.message : `not a TypeError: ${error}`;
	}
	expect.truthy(message.includes('paused'), message);
});
