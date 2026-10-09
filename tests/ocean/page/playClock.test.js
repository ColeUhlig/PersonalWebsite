import { test } from 'node:test';
import * as expect from '../expect.js';
import { createPlayClock } from '../../../content/ocean/js/engine/playClock.js';

function fakeWall(start = 100) {
	let t = start;
	return { wall: () => t, advance: (seconds) => { t += seconds; } };
}

test('a playing clock follows the wall clock', () => {
	const { wall, advance } = fakeWall();
	const clock = createPlayClock(wall);
	const start = clock.now();
	advance(2.5);
	expect.near(clock.now() - start, 2.5, 1e-12, 'moved with the wall');
	expect.equal(clock.playing(), true, 'playing');
});

test('a paused clock holds still, and playing again carries on from where it stopped', () => {
	const { wall, advance } = fakeWall();
	const clock = createPlayClock(wall);
	advance(1);
	clock.pause();
	const held = clock.now();
	advance(10);
	expect.equal(clock.now(), held, 'held while paused');
	clock.play();
	expect.equal(clock.now(), held, 'no jump on play');
	advance(0.5);
	expect.near(clock.now(), held + 0.5, 1e-12, 'moves again');
});

test('a clock can start paused (reduced motion), and pause and play twice are harmless', () => {
	const { wall, advance } = fakeWall();
	const clock = createPlayClock(wall, { playing: false });
	const start = clock.now();
	advance(3);
	expect.equal(clock.now(), start, 'starts paused');
	clock.pause();
	clock.play();
	clock.play();
	advance(1);
	expect.near(clock.now(), start + 1, 1e-12, 'one play counts once');
	expect.truthy(Object.isFrozen(clock), 'frozen');
});
