// Tilting a phone to look around the ocean (piece C Task 9b): page/tiltLook.js, the phone's
// orientation turned into a small yaw and pitch round the current shot, smoothed on the play clock,
// and eased back to the shot when the story moves on.
import { test } from 'node:test';
import * as expect from '../expect.js';
import {
	applyOffset,
	clampPolar,
	createTiltFollower,
	isZeroOffset,
	orientationToOffset,
	RETURN_SECONDS,
	SMOOTHING_SECONDS,
	smoothOffset,
	TILT_LIMITS,
} from '../../../content/ocean/js/page/tiltLook.js';

const DEG = Math.PI / 180;
const BASE = { beta: 45, gamma: 0 };
const YAW_MAX = TILT_LIMITS.yawDeg * DEG;
const PITCH_MAX = TILT_LIMITS.pitchDeg * DEG;
const SHOT = { position: [0, 18, 55], target: [0, 0, -20] };
const sub = (a, b) => a.map((v, i) => v - b[i]);
const distance = (pose) => Math.hypot(...sub(pose.position, pose.target));
const polarOf = (pose) => {
	const [dx, dy, dz] = sub(pose.position, pose.target);
	return Math.atan2(Math.hypot(dx, dz), dy);
};
const offsetAt = (reading, angle = 0) => orientationToOffset(reading, BASE, angle);

test('the limits, the smoothing and the return are the brief\'s, and the limits are frozen', () => {
	expect.equal(TILT_LIMITS.yawDeg, 12, 'yaw limit');
	expect.equal(TILT_LIMITS.pitchDeg, 8, 'pitch limit');
	expect.equal(Object.isFrozen(TILT_LIMITS), true, 'frozen');
	expect.equal(SMOOTHING_SECONDS, 0.25, 'smoothing');
	expect.equal(RETURN_SECONDS, 1.2, 'return');
});

test('in portrait a left-right tilt turns the view and a forward-back tilt lifts or lowers it, degree for degree', () => {
	const right = offsetAt({ beta: 45, gamma: 5 });
	expect.near(right.yaw, -5 * DEG, 1e-12, 'tilting the right edge away swings the view right (the camera clockwise from above)');
	expect.near(right.pitch, 0, 1e-12, 'no pitch from a sideways tilt');
	const upright = offsetAt({ beta: 50, gamma: 0 });
	expect.near(upright.pitch, -5 * DEG, 1e-12, 'standing the phone up lowers the camera towards the horizon');
	expect.near(upright.yaw, 0, 1e-12, 'no yaw from a forward tilt');
	const still = offsetAt(BASE);
	expect.equal(isZeroOffset(still), true, 'the baseline itself is no offset');
});

test('each axis is clamped to its limit at both ends', () => {
	expect.near(offsetAt({ beta: 45, gamma: 40 }).yaw, -YAW_MAX, 1e-12, 'far right');
	expect.near(offsetAt({ beta: 45, gamma: -40 }).yaw, YAW_MAX, 1e-12, 'far left');
	expect.near(offsetAt({ beta: 90, gamma: 0 }).pitch, -PITCH_MAX, 1e-12, 'far up');
	expect.near(offsetAt({ beta: 0, gamma: 0 }).pitch, PITCH_MAX, 1e-12, 'far down');
	const wild = offsetAt({ beta: 179, gamma: -89 });
	expect.truthy(Math.abs(wild.yaw) <= YAW_MAX && Math.abs(wild.pitch) <= PITCH_MAX, 'extreme input stays inside');
});

test('the change from the baseline wraps round, so crossing beta 180 is a small change', () => {
	const offset = orientationToOffset({ beta: -178, gamma: 0 }, { beta: 178, gamma: 0 }, 0);
	expect.near(offset.pitch, -4 * DEG, 1e-12, 'four degrees on, not 356 back');
});

test('landscape maps through the screen angle: 90 and 270 swap the axes, with opposite signs', () => {
	const at90 = offsetAt({ beta: 50, gamma: 0 }, 90);
	expect.near(at90.yaw, -5 * DEG, 1e-12, '90: beta turns the view');
	expect.near(at90.pitch, 0, 1e-12, '90: beta does not pitch');
	expect.near(offsetAt({ beta: 45, gamma: 5 }, 90).pitch, 5 * DEG, 1e-12, '90: gamma pitches');
	const at270 = offsetAt({ beta: 50, gamma: 0 }, 270);
	expect.near(at270.yaw, 5 * DEG, 1e-12, '270: beta turns the view the other way');
	expect.near(offsetAt({ beta: 45, gamma: 5 }, 270).pitch, -5 * DEG, 1e-12, '270: gamma pitches the other way');
	expect.near(offsetAt({ beta: 45, gamma: 5 }, 180).yaw, 5 * DEG, 1e-12, '180: upside down reverses gamma');
	expect.near(offsetAt({ beta: 50, gamma: 0 }, -90).yaw, at270.yaw, 1e-12, 'window.orientation\'s -90 is 270');
});

test('non-finite input is no offset', () => {
	for (const reading of [{ beta: Number.NaN, gamma: 3 }, { beta: null, gamma: null }, { beta: 4 }, { beta: Infinity, gamma: 0 }]) {
		const offset = offsetAt(reading);
		expect.equal(offset.yaw, 0, `yaw for ${JSON.stringify(reading)}`);
		expect.equal(offset.pitch, 0, `pitch for ${JSON.stringify(reading)}`);
	}
	expect.equal(isZeroOffset(orientationToOffset({ beta: 50, gamma: 5 }, { beta: Number.NaN, gamma: 0 }, 0)), true, 'no baseline');
	expect.equal(isZeroOffset(orientationToOffset({ beta: 50, gamma: 5 }, BASE, Number.NaN)), true, 'no screen angle');
});

test('the smoothing converges on the target and lands on it exactly', () => {
	const target = { yaw: 0.2, pitch: -0.1 };
	let current = { yaw: 0, pitch: 0 };
	current = smoothOffset(current, target, 1 / 60);
	expect.truthy(current.yaw > 0 && current.yaw < 0.2, 'one frame moves part of the way');
	for (let i = 0; i < 240; i++) current = smoothOffset(current, target, 1 / 60);
	expect.equal(current.yaw, 0.2, 'four seconds on it is there exactly');
	expect.equal(current.pitch, -0.1, 'pitch too');
});

test('the smoothing is frame-rate independent: the same clock time gives the same offset at 30 and 60 fps', () => {
	const target = { yaw: 0.2, pitch: -0.1 };
	const run = (fps, seconds) => {
		let current = { yaw: 0, pitch: 0 };
		for (let i = 0; i < fps * seconds; i++) current = smoothOffset(current, target, 1 / fps);
		return current;
	};
	const slow = run(30, 0.3);
	const fast = run(60, 0.3);
	expect.near(slow.yaw, fast.yaw, 1e-12, 'yaw');
	expect.near(slow.pitch, fast.pitch, 1e-12, 'pitch');
	expect.near(fast.yaw, 0.2 * (1 - Math.exp(-0.3 / SMOOTHING_SECONDS)), 1e-12, 'an exponential approach');
	const long = smoothOffset({ yaw: 0, pitch: 0 }, target, 10);
	const capped = smoothOffset({ yaw: 0, pitch: 0 }, target, 0.25);
	expect.equal(long.yaw, capped.yaw, 'a long stall counts as a quarter second');
	const out = { yaw: 0, pitch: 0 };
	expect.equal(smoothOffset({ yaw: 0, pitch: 0 }, target, 0.1, out), out, 'writes into out');
});

test('applyOffset turns the camera round its target and keeps its distance', () => {
	const pose = { position: [0, 10, 10], target: [0, 0, 0] };
	const quarter = applyOffset(pose, { yaw: Math.PI / 2, pitch: 0 });
	[10, 10, 0].forEach((v, i) => expect.near(quarter.position[i], v, 1e-9, `yaw +90 degrees [${i}]`));
	const lifted = applyOffset(pose, { yaw: 0, pitch: 10 * DEG });
	expect.near(polarOf(lifted), 35 * DEG, 1e-12, 'pitch up steepens the tilt');
	const both = applyOffset(SHOT, { yaw: -YAW_MAX, pitch: -PITCH_MAX });
	expect.near(distance(both), distance(SHOT), 1e-9, 'distance unchanged');
	both.target.forEach((v, i) => expect.equal(v, SHOT.target[i], `target unchanged [${i}]`));
	const over = applyOffset(pose, { yaw: 0, pitch: Math.PI });
	expect.truthy(polarOf(over) > 0 && over.position[1] > 0, 'never flipped over the top');
});

test('a zero offset gives the same pose values in new arrays; the out variant reuses its arrays', () => {
	const same = applyOffset(SHOT, { yaw: 0, pitch: 0 });
	SHOT.position.forEach((v, i) => expect.equal(same.position[i], v, `position [${i}]`));
	SHOT.target.forEach((v, i) => expect.equal(same.target[i], v, `target [${i}]`));
	expect.truthy(same.position !== SHOT.position && same.target !== SHOT.target, 'new arrays');
	const out = { position: [0, 0, 0], target: [0, 0, 0] };
	const { position, target } = out;
	expect.equal(applyOffset(SHOT, { yaw: 0.1, pitch: 0.05 }, out), out, 'returns out');
	expect.truthy(out.position === position && out.target === target, 'same arrays');
});

test('clampPolar holds the tilt inside a range, keeping heading and distance', () => {
	const steep = { position: [0, 50, 5], target: [0, 0, 0] };
	const out = clampPolar(steep, 0.5, 1.2, { position: [0, 0, 0], target: [0, 0, 0] });
	expect.near(polarOf(out), 0.5, 1e-12, 'raised to the minimum');
	expect.near(distance(out), distance(steep), 1e-9, 'distance');
	expect.truthy(out.position[0] === 0 && out.position[2] > 0, 'heading kept');
	const low = clampPolar(SHOT, 0, 1.2);
	expect.near(polarOf(low), 1.2, 1e-12, 'lowered to the maximum');
	const inside = clampPolar(SHOT, 0, 1.5);
	SHOT.position.forEach((v, i) => expect.equal(inside.position[i], v, `inside is unchanged [${i}]`));
});

// Frames of `seconds` each on the play clock, `count` of them, at step `key`.
const run = (follower, key, count, seconds = 1 / 60) => {
	let offset = null;
	for (let i = 0; i < count; i++) offset = follower.frame(key, seconds);
	return offset;
};

test('the follower starts from the first reading and follows the phone, smoothed', () => {
	const follower = createTiltFollower();
	expect.equal(isZeroOffset(run(follower, 3, 5)), true, 'nothing before a reading');
	follower.sense(45, 0, 0);
	expect.equal(isZeroOffset(run(follower, 3, 5)), true, 'the first reading is the baseline');
	follower.sense(45, 20, 0);
	const early = run(follower, 3, 3);
	expect.truthy(early.yaw < 0 && early.yaw > -YAW_MAX, 'on its way');
	expect.near(run(follower, 3, 240).yaw, -YAW_MAX, 1e-12, 'arrives at the limit');
	follower.sense(Number.NaN, null, 0);
	expect.near(run(follower, 3, 5).yaw, -YAW_MAX, 1e-12, 'a blank reading changes nothing');
});

test('a step change eases the offset to zero over the return, then follows from a new baseline', () => {
	const follower = createTiltFollower();
	follower.sense(45, 0, 0);
	run(follower, 3, 1);
	follower.sense(45, 20, 0);
	run(follower, 3, 240);
	const half = run(follower, 4, 36); // 0.6 s of 1.2
	expect.truthy(half.yaw < -0.2 * YAW_MAX && half.yaw > -0.8 * YAW_MAX, `half way back (${half.yaw})`);
	expect.equal(isZeroOffset(run(follower, 4, 40)), true, 'back on the shot after the return, though the phone is still tilted');
	follower.sense(45, 25, 0);
	expect.near(run(follower, 4, 240).yaw, -5 * DEG, 1e-12, 'follows the phone again from where it was held');
});

test('while the clock is stopped the offset holds, and a step change cuts it to zero', () => {
	const follower = createTiltFollower();
	follower.sense(45, 0, 0);
	run(follower, 3, 1);
	follower.sense(45, 6, 0);
	const before = run(follower, 3, 3).yaw;
	follower.sense(45, 12, 0);
	expect.equal(run(follower, 3, 10, 0).yaw, before, 'paused: the camera stays put');
	expect.equal(isZeroOffset(run(follower, 5, 1, 0)), true, 'a step change with no clock is a cut');
	expect.equal(isZeroOffset(run(follower, 5, 10)), true, 'and the phone as held is the new baseline');
});

test('turning the screen, or resetting, takes a new baseline', () => {
	const follower = createTiltFollower();
	follower.sense(45, 0, 0);
	run(follower, 2, 1);
	follower.sense(10, 40, 90);
	expect.equal(isZeroOffset(run(follower, 2, 240)), true, 'a rotation to landscape rebases');
	follower.sense(10, 45, 90);
	expect.truthy(!isZeroOffset(run(follower, 2, 240)), 'then follows');
	follower.reset();
	expect.equal(isZeroOffset(follower.offset()), true, 'reset clears the offset');
	follower.sense(30, 10, 90);
	expect.equal(isZeroOffset(run(follower, 2, 240)), true, 'and the next reading is the baseline');
});
