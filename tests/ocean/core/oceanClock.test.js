import { test } from 'node:test';
import * as expect from '../expect.js';
import * as OceanClock from '../../../content/ocean/js/core/oceanClock.js';

const LOOP = 120;

test('time wraps at the loop period', () => {
	expect.near(OceanClock.time(0, LOOP), 0, 1e-12, 'zero');
	expect.near(OceanClock.time(119.5, LOOP), 119.5, 1e-12, 'inside');
	expect.near(OceanClock.time(120, LOOP), 0, 1e-12, 'at the period');
	expect.near(OceanClock.time(1234.25, LOOP), 34.25, 1e-9, 'many loops in');
});

// The period is a fixed THREE frames whatever the tier, not the cascade count. A tier with one
// cascade used to evolve it every single frame: 60 Hz of FFT work for a Low machine, and a sea
// that jumped a whole update every frame instead of being blended towards one. Slots the tier
// has no cascade for are simply idle, so every tier updates a given cascade at the same 20 Hz.
function slots(count) {
	const seen = [];
	for (let frame = 1; frame <= 6; frame++) {
		seen.push(OceanClock.cascadeForFrame(frame, count) ?? '-');
	}
	return seen.join(',');
}

test('cascades take turns on a fixed three-frame period', () => {
	expect.equal(slots(3), '2,3,1,2,3,1', 'three cascades fill every slot');
	expect.equal(slots(2), '2,-,1,2,-,1', 'two cascades leave the third slot idle');
	expect.equal(slots(1), '-,-,1,-,-,1', 'one cascade evolves one frame in three, not every frame');
	expect.equal(OceanClock.cascadeForFrame(300, 3), 1, 'the slot follows the frame, not a counter');
	expect.equal(OceanClock.cascadeForFrame(301, 1), null, 'an idle frame answers nil');
});

// The cross-fade is counted in FRAMES from the promotion, never on the wall clock. The promotion
// happens on the rotation's own frame, so however irregularly a worker's result arrives, the
// display moves by the same third of a step every frame. The fraction reaches 1 on the third
// frame and STAYS there, so a result that misses its rotation holds the current fields rather
// than overshooting past them and popping back.
test('fade fraction runs 1/3, 2/3, 1 from the promotion frame and holds', () => {
	const promoted = 12;
	const period = OceanClock.PERIOD;
	expect.near(OceanClock.fadeFraction(12, promoted, period), 1 / 3, 1e-12, 'the promotion frame');
	expect.near(OceanClock.fadeFraction(13, promoted, period), 2 / 3, 1e-12, 'one frame on');
	expect.near(OceanClock.fadeFraction(14, promoted, period), 1, 1e-12, 'two frames on');
	expect.near(OceanClock.fadeFraction(19, promoted, period), 1, 1e-12, 'a late result holds at 1');
});

// promotedFrame starts at 0, so frame 1 of a session reads 2/3 and every frame after it reads 1:
// the fade is whole before anything has been promoted rather than part way through one. Nothing
// can flash on frame 1 either, because with no promotion there is no current result and blend
// leaves the display alone, and the first promoted result has no previous, so blend copies it
// whole whatever fraction it is handed.
test('fade fraction before any promotion is 1 from the second frame', () => {
	const period = OceanClock.PERIOD;
	expect.near(OceanClock.fadeFraction(1, 0, period), 2 / 3, 1e-12, "the session's first frame");
	expect.near(OceanClock.fadeFraction(2, 0, period), 1, 1e-12, 'the second');
	expect.near(OceanClock.fadeFraction(300, 0, period), 1, 1e-12, 'long after');
});
