// A paused sea costs less than a moving one (piece C, Task 9; the 2026-09-30 ruling): while the
// page's play clock is paused and no stage setting changes, the ocean stops asking its cascades
// and painters for work it already has, once they have caught up with the held time: every
// running layer's two slots at that time, a full rotation of maps painted from it and landed. The rings,
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

// A worker whose replies of one type can be held back and let through later, as a slow worker's.
function holdable(create, posts, gate, type) {
	return () => {
		const inner = counting(create, posts)();
		const outer = { onmessage: null, onerror: null, postMessage: (message, transfer) => inner.postMessage(message, transfer), terminate: () => inner.terminate() };
		inner.onmessage = (event) => {
			if (gate.hold && event.data.type === type) gate.held.push(() => outer.onmessage?.(event));
			else outer.onmessage?.(event);
		};
		inner.onerror = (event) => outer.onerror?.(event);
		return outer;
	};
}

function build({ paused, holdPixels = null, holdFields = null }) {
	let clock = 0;
	const posts = {};
	const ocean = Ocean.create(readConfig('?tier=Low'), {
		spawnCascade: holdFields ? holdable(createCascadeWorker, posts, holdFields, 'fields') : counting(createCascadeWorker, posts),
		spawnPainter: holdPixels ? holdable(createPainterWorker, posts, holdPixels, 'pixels') : counting(createPainterWorker, posts),
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
	// Steps with the clock held until the ocean rests; the frames it took, or null.
	const untilResting = async (limit) => {
		for (let frames = 1; frames <= limit; frames++) {
			await advance(1, 0);
			if (Ocean.status(ocean).resting) return frames;
		}
		return null;
	};
	const take = () => {
		const taken = { ...posts };
		for (const key of Object.keys(posts)) delete posts[key];
		return taken;
	};
	return { ocean, advance, untilResting, take };
}

const work = (posts) => (posts.evolve ?? 0) + (posts.paint ?? 0);
const gate = () => ({ hold: false, held: [] });
const release = (g) => {
	g.hold = false;
	for (const deliver of g.held.splice(0)) deliver();
};

test('a paused clock rests once every layer and map has caught up with the held time, then does no work', async () => {
	let paused = false;
	const { ocean, advance, untilResting, take } = build({ paused: () => paused });
	await advance(30, 1 / 60);
	paused = true;
	const frames = await untilResting(120);
	expect.truthy(frames !== null && frames > Ocean.REST_MARGIN_FRAMES, `rests, after the margin: ${frames}`);
	// What the rest condition promises: both slots of every running layer hold the held time.
	const t = Ocean.status(ocean).t;
	for (let i = 0; i < ocean.store.count; i++) {
		expect.equal(ocean.store.current[i].time, t, `layer ${i + 1} current at the held time`);
		expect.equal(ocean.store.previous[i].time, t, `layer ${i + 1} previous at the held time`);
	}
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
	expect.equal(Ocean.status(ocean).resting, false, 'awake');
	expect.truthy((take().evolve ?? 0) > 0, 'evolving again after play');
});

test('a painter reply still out keeps the work going until it lands', async () => {
	const pixels = gate();
	let paused = false;
	const { ocean, advance, untilResting } = build({ paused: () => paused, holdPixels: pixels });
	await advance(30, 1 / 60);
	paused = true;
	pixels.hold = true;
	expect.equal(await untilResting(30), null, 'no rest while the painters have not answered');
	release(pixels);
	expect.truthy((await untilResting(60)) !== null, 'rests once the replies land and a full rotation has painted');
	expect.truthy(Ocean.status(ocean).resting, 'resting');
});

test('a layer whose result has not come back keeps the work going', async () => {
	const fields = gate();
	let paused = false;
	const { advance, untilResting } = build({ paused: () => paused, holdFields: fields });
	await advance(30, 1 / 60);
	paused = true;
	fields.hold = true;
	expect.equal(await untilResting(40), null, 'no rest while a layer is behind the held time');
	release(fields);
	expect.truthy((await untilResting(60)) !== null, 'rests once every layer has caught up');
});

test('a stage change while paused wakes the work, and a report still arrives while resting', async () => {
	const { ocean, advance, untilResting, take } = build({ paused: () => true });
	expect.truthy((await untilResting(120)) !== null, 'resting');
	take();
	Ocean.configureStage(ocean, { ...DEFAULT_SETTINGS, chop: DEFAULT_SETTINGS.chop * 0.5 });
	await advance(1, 0);
	expect.equal(Ocean.status(ocean).resting, false, 'a stage change ends the rest at once');
	await advance(9, 0);
	expect.truthy(work(take()) > 0, 'a stage change wakes the cascades and painters');
	await advance(Ocean.REPORT_WINDOW, 0);
	const report = Ocean.report(ocean);
	expect.truthy(report !== null && Number.isFinite(report.writeMs), 'a report still arrives');
});

test('without a paused clock (the default) a held time keeps working, as a frozen clock always has', async () => {
	const { ocean, advance, take } = build({ paused: undefined });
	await advance(150, 0);
	expect.equal(Ocean.status(ocean).resting, false, 'never rests');
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
