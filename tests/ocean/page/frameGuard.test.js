import { test } from 'node:test';
import * as expect from '../expect.js';
import { createFrameGuard, LOG_EVERY, NOTICE_AFTER_FRAMES } from '../../../content/ocean/js/page/frameGuard.js';

function recorder() {
	const lines = [];
	return { lines, log: { error: (...args) => lines.push(args) } };
}

test('one failed frame is logged once and raises no notice', () => {
	const { lines, log } = recorder();
	let noticed = 0;
	const guard = createFrameGuard({ log, onPersistent: () => { noticed += 1; } });
	guard.failed(new Error('boom'));
	guard.ok();
	expect.equal(guard.failures(), 1, 'counted');
	expect.equal(lines.length, 1, 'logged once');
	expect.truthy(String(lines[0][0]).includes('frame failed'), `says so: ${lines[0][0]}`);
	expect.equal(noticed, 0, 'no notice');
});

test('failures in every frame are logged sparingly and raise the notice once', () => {
	const { lines, log } = recorder();
	let noticed = 0;
	const guard = createFrameGuard({ log, onPersistent: () => { noticed += 1; } });
	for (let i = 0; i < LOG_EVERY * 2; i++) guard.failed(new Error(`boom ${i}`));
	expect.equal(noticed, 1, 'notice once');
	expect.equal(lines.length, 3, 'the first, then every LOG_EVERY');
	expect.equal(guard.failures(), LOG_EVERY * 2, 'all counted');
});

test('a streak broken by a good frame starts again', () => {
	let noticed = 0;
	const guard = createFrameGuard({ log: { error() {} }, onPersistent: () => { noticed += 1; } });
	for (let round = 0; round < 5; round++) {
		for (let i = 0; i < NOTICE_AFTER_FRAMES - 1; i++) guard.failed(new Error('boom'));
		guard.ok();
	}
	expect.equal(noticed, 0, 'never a streak long enough');
});
