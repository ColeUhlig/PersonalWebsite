// Tilting a phone to look around the ocean (piece C Task 9b): page/tiltLook.js, the phone's
// orientation turned into a small yaw and pitch round the current shot, smoothed on the play clock,
// and eased back to the shot when the story moves on. The orientation cases build the phone's real
// rotation (W3C DeviceOrientation: R = Rz(alpha) Rx(beta) Ry(gamma), device to earth), turn it about
// the screen's own axes, and decompose it back into the alpha, beta and gamma a browser reports, the
// way the Task 9b review's checker (orient.mjs) does.
import { test } from 'node:test';
import * as expect from '../expect.js';
import {
	applyOffset,
	clampPolar,
	createTiltFollower,
	DEAD_BAND_DEG,
	isZeroOffset,
	orientationToOffset,
	RETURN_SECONDS,
	SMOOTHING_SECONDS,
	smoothOffset,
	TILT_LIMITS,
} from '../../../content/ocean/js/page/tiltLook.js';

const DEG = Math.PI / 180;
const YAW_MAX = TILT_LIMITS.yawDeg * DEG;
const PITCH_MAX = TILT_LIMITS.pitchDeg * DEG;
const SHOT = { position: [0, 18, 55], target: [0, 0, -20] };
const sub = (a, b) => a.map((v, i) => v - b[i]);
const distance = (pose) => Math.hypot(...sub(pose.position, pose.target));
const polarOf = (pose) => {
	const [dx, dy, dz] = sub(pose.position, pose.target);
	return Math.atan2(Math.hypot(dx, dz), dy);
};
// A reading as the follower and orientationToOffset take it.
const at = (beta, gamma, alpha = 0) => ({ alpha, beta, gamma });

// The W3C rotation and its decomposition (the spec's appendix: beta in [-180, 180), gamma in
// [-90, 90)), so each case feeds the code exactly what a browser would.
const mul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, _, k) => s + r[k] * B[k][j], 0)));
const Rx = (d) => [[1, 0, 0], [0, Math.cos(d * DEG), -Math.sin(d * DEG)], [0, Math.sin(d * DEG), Math.cos(d * DEG)]];
const Ry = (d) => [[Math.cos(d * DEG), 0, Math.sin(d * DEG)], [0, 1, 0], [-Math.sin(d * DEG), 0, Math.cos(d * DEG)]];
const Rz = (d) => [[Math.cos(d * DEG), -Math.sin(d * DEG), 0], [Math.sin(d * DEG), Math.cos(d * DEG), 0], [0, 0, 1]];
function reading(M) {
	let a;
	let b;
	let g;
	if (M[2][2] > 0) {
		a = Math.atan2(-M[0][1], M[1][1]);
		b = Math.asin(M[2][1]);
		g = Math.atan2(-M[2][0], M[2][2]);
	} else {
		a = Math.atan2(M[0][1], -M[1][1]);
		b = -Math.asin(M[2][1]);
		b += b >= 0 ? -Math.PI : Math.PI;
		g = Math.atan2(M[2][0], -M[2][2]);
	}
	return { alpha: a / DEG, beta: b / DEG, gamma: g / DEG };
}
// The phone held `lean` degrees back from upright (90 is flat on its back), facing a heading of 30
// degrees, with the screen turned `angle` (0, 90, 180, 270: the device turned that far
// anticlockwise).
const held = (lean, angle) => mul(Rz(30), mul(Rx(90 - lean), Rz(angle)));
// A turn of `degrees` about the screen's up axis (positive: the right edge goes away from the
// visitor) or its right axis (positive: the top edge comes towards the visitor), in device axes.
const SCREEN_UP = { 0: (d) => Ry(d), 90: (d) => Rx(d), 180: (d) => Ry(-d), 270: (d) => Rx(-d) };
const SCREEN_RIGHT = { 0: (d) => Rx(d), 90: (d) => Ry(-d), 180: (d) => Rx(-d), 270: (d) => Ry(d) };
// The offset after the phone at M turns by the body rotation T.
const offsetFor = (M, T, angle) => orientationToOffset(reading(mul(M, T)), reading(M), angle);
// What a turn of `degrees` gives once the dead band is taken off.
const banded = (degrees) => Math.sign(degrees) * Math.max(Math.abs(degrees) - DEAD_BAND_DEG, 0) * DEG;
const LEANS = Object.freeze({ flat: 90, 'at 45°': 45, '20° from upright': 20, '5° from upright': 5 });
const near = (actual, expected, label) => expect.near(actual, expected, 0.01 * DEG, label);

test('the limits, the dead band, the smoothing and the return are the brief\'s, and the limits are frozen', () => {
	expect.equal(TILT_LIMITS.yawDeg, 12, 'yaw limit');
	expect.equal(TILT_LIMITS.pitchDeg, 8, 'pitch limit');
	expect.equal(Object.isFrozen(TILT_LIMITS), true, 'frozen');
	expect.equal(DEAD_BAND_DEG, 0.1, 'dead band');
	expect.equal(SMOOTHING_SECONDS, 0.25, 'smoothing');
	expect.equal(RETURN_SECONDS, 1.2, 'return');
});

test('the joystick convention: top edge away lifts the camera, right edge away or a roll right swings the view right', () => {
	const M = held(45, 0);
	const away = offsetFor(M, SCREEN_RIGHT[0](-3), 0);
	near(away.pitch, banded(3), 'top edge away: the camera rises and looks down');
	near(away.yaw, 0, 'no yaw from a nod');
	const right = offsetFor(M, SCREEN_UP[0](3), 0);
	near(right.yaw, banded(-3), 'right edge away: the view swings right (the camera clockwise from above)');
	near(right.pitch, 0, 'no pitch from a twist');
	const roll = offsetFor(M, Rz(-3), 0);
	near(roll.yaw, banded(-3), 'a roll to the right (clockwise as the visitor sees the screen): the view swings right');
	near(roll.pitch, 0, 'no pitch from a roll');
	expect.equal(isZeroOffset(offsetFor(M, Rz(0), 0)), true, 'the baseline itself is no offset');
});

test('a 3° twist gives 3° of yaw and a 3° nod 3° of pitch at every lean, in portrait and landscape', () => {
	for (const angle of [0, 90, 180, 270]) {
		for (const [name, lean] of Object.entries(LEANS)) {
			const M = held(lean, angle);
			const twist = offsetFor(M, SCREEN_UP[angle](3), angle);
			near(twist.yaw, banded(-3), `screen ${angle}, ${name}: twist yaw`);
			near(twist.pitch, 0, `screen ${angle}, ${name}: twist pitch`);
			const nod = offsetFor(M, SCREEN_RIGHT[angle](-3), angle);
			near(nod.pitch, banded(3), `screen ${angle}, ${name}: nod pitch`);
			near(nod.yaw, 0, `screen ${angle}, ${name}: nod yaw`);
		}
	}
});

test('a small move through upright changes the offset smoothly, with no jump at the corner', () => {
	for (const angle of [0, 90, 270]) {
		const M = held(1, angle);
		let previous = null;
		for (let k = 0; k <= 13; k++) {
			// From 1° back from upright to 2.9° past it, in steps of 0.3° (stepping over exact upright,
			// where the reported angles themselves are undefined), the top edge coming forward.
			const offset = offsetFor(M, SCREEN_RIGHT[angle](k * 0.3), angle);
			near(offset.pitch, banded(-k * 0.3), `screen ${angle}, step ${k}: pitch`);
			near(offset.yaw, 0, `screen ${angle}, step ${k}: yaw`);
			if (previous) {
				expect.truthy(Math.abs(offset.pitch - previous.pitch) <= 0.31 * DEG, `screen ${angle}, step ${k}: no jump`);
			}
			previous = offset;
		}
	}
});

test('a turn under the dead band is no offset, so a still phone\'s noise costs nothing', () => {
	const M = held(30, 0);
	expect.equal(isZeroOffset(offsetFor(M, mul(SCREEN_UP[0](0.05), SCREEN_RIGHT[0](-0.08)), 0)), true, 'sensor noise');
	expect.truthy(offsetFor(M, SCREEN_UP[0](0.3), 0).yaw < 0, 'a real turn still counts');
});

test('each axis is clamped to its limit at both ends', () => {
	const M = held(45, 0);
	near(offsetFor(M, SCREEN_UP[0](40), 0).yaw, -YAW_MAX, 'far right');
	near(offsetFor(M, SCREEN_UP[0](-40), 0).yaw, YAW_MAX, 'far left');
	near(offsetFor(M, SCREEN_RIGHT[0](-30), 0).pitch, PITCH_MAX, 'far away');
	near(offsetFor(M, SCREEN_RIGHT[0](30), 0).pitch, -PITCH_MAX, 'far towards');
	const wild = orientationToOffset(at(-170, 89, 200), at(45, 0), 0);
	expect.truthy(Math.abs(wild.yaw) <= YAW_MAX && Math.abs(wild.pitch) <= PITCH_MAX, 'extreme input stays inside');
});

test('non-finite input is no offset; a missing alpha (no compass) counts as 0', () => {
	for (const bad of [at(Number.NaN, 3), at(null, null), { beta: 4 }, at(Infinity, 0)]) {
		const offset = orientationToOffset(bad, at(45, 0), 0);
		expect.equal(offset.yaw, 0, `yaw for ${JSON.stringify(bad)}`);
		expect.equal(offset.pitch, 0, `pitch for ${JSON.stringify(bad)}`);
	}
	expect.equal(isZeroOffset(orientationToOffset(at(50, 5), at(Number.NaN, 0), 0)), true, 'no baseline');
	expect.equal(isZeroOffset(orientationToOffset(at(50, 5), at(45, 0), Number.NaN)), true, 'no screen angle');
	const blind = orientationToOffset({ alpha: null, beta: 45, gamma: 5 }, { alpha: null, beta: 45, gamma: 0 }, 0);
	near(blind.yaw, banded(-5), 'beta and gamma alone still turn the view');
	const out = { yaw: 0, pitch: 0 };
	expect.equal(orientationToOffset(at(50, 5), at(45, 0), 0, out), out, 'writes into out');
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
	follower.sense(at(45, 0), 0);
	expect.equal(isZeroOffset(run(follower, 3, 5)), true, 'the first reading is the baseline');
	follower.sense(at(45, 20), 0);
	const early = run(follower, 3, 3);
	expect.truthy(early.yaw < 0 && early.yaw > -YAW_MAX, 'on its way');
	expect.near(run(follower, 3, 240).yaw, -YAW_MAX, 1e-12, 'arrives at the limit');
	follower.sense(at(Number.NaN, null), 0);
	expect.near(run(follower, 3, 5).yaw, -YAW_MAX, 1e-12, 'a blank reading changes nothing');
});

test('a step change eases the offset to zero over the return, then follows from a new baseline', () => {
	const follower = createTiltFollower();
	follower.sense(at(45, 0), 0);
	run(follower, 3, 1);
	follower.sense(at(45, 20), 0);
	run(follower, 3, 240);
	const half = run(follower, 4, 36); // 0.6 s of 1.2
	expect.truthy(half.yaw < -0.2 * YAW_MAX && half.yaw > -0.8 * YAW_MAX, `half way back (${half.yaw})`);
	expect.equal(isZeroOffset(run(follower, 4, 40)), true, 'back on the shot after the return, though the phone is still tilted');
	follower.sense(at(45, 25), 0);
	expect.near(run(follower, 4, 240).yaw, banded(-5), 1e-9, 'follows the phone again from where it was held');
});

test('while the clock is stopped the offset holds, and a step change cuts it to zero', () => {
	const follower = createTiltFollower();
	follower.sense(at(45, 0), 0);
	run(follower, 3, 1);
	follower.sense(at(45, 6), 0);
	const before = run(follower, 3, 3).yaw;
	follower.sense(at(45, 12), 0);
	expect.equal(run(follower, 3, 10, 0).yaw, before, 'paused: the camera stays put');
	expect.equal(isZeroOffset(run(follower, 5, 1, 0)), true, 'a step change with no clock is a cut');
	expect.equal(isZeroOffset(run(follower, 5, 10)), true, 'and the phone as held is the new baseline');
});

test('turning the screen, or resetting, takes a new baseline', () => {
	const follower = createTiltFollower();
	follower.sense(at(45, 0), 0);
	run(follower, 2, 1);
	follower.sense(at(10, 40), 90);
	expect.equal(isZeroOffset(run(follower, 2, 240)), true, 'a rotation to landscape rebases');
	follower.sense(at(10, 45), 90);
	expect.truthy(!isZeroOffset(run(follower, 2, 240)), 'then follows');
	follower.reset();
	expect.equal(isZeroOffset(follower.offset()), true, 'reset clears the offset');
	follower.sense(at(30, 10), 90);
	expect.equal(isZeroOffset(run(follower, 2, 240)), true, 'and the next reading is the baseline');
});
