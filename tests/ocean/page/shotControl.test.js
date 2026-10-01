// The story's camera between shots (piece C): page/shotControl.js, the shot, the visitor's free
// orbit and the ease back to the next step's shot.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { createShotControl, DRIFT_PERIOD_SECONDS, MAX_RETURN_SECONDS, resolveShot, RETURN_SECONDS, RETURN_STUDS_PER_SECOND } from '../../../content/ocean/js/page/shotControl.js';
import { DRIFT_PERIOD, shotPosition } from '../../../content/ocean/js/stages/drift.js';
import { recipeFor, STEP_COUNT } from '../../../content/ocean/js/stages/recipes.js';
import { stepOf } from '../../../content/ocean/js/stages/steps.js';

// The finale and the step before it, by id (piece C2, Task 0); other keys here are any two neighbours.
const FINALE = stepOf('finale');
const GLOW = stepOf('glow');

const SHOT = { position: [0, 14, 40], target: [0, 2, -120] };
const AWAY = { position: [90, 30, 10], target: [0, 2, -120] };
const close = (a, b, label) => a.forEach((v, i) => expect.near(v, b[i], 1e-9, `${label}[${i}]`));
const sub = (a, b) => a.map((v, i) => v - b[i]);
const length = (v) => Math.hypot(...v);

test('a still shot resolves to itself; a drift circles its target once every four minutes', () => {
	const still = resolveShot({ ...SHOT, move: 'still' }, 100);
	close(still.position, SHOT.position, 'still');
	const quarter = resolveShot({ position: [10, 5, 0], target: [0, 0, 0], move: 'drift' }, DRIFT_PERIOD_SECONDS / 4);
	close(quarter.position, [0, 5, 10], 'a quarter turn');
	close(quarter.target, [0, 0, 0], 'target fixed');
});

test('the shot holds until the visitor orbits; then the camera is theirs while the step stays', () => {
	const shots = createShotControl();
	close(shots.frame(3, AWAY, SHOT, 0.1).position, SHOT.position, 'shot mode applies the shot');
	shots.orbited(3);
	expect.equal(shots.mode(), 'free', 'free');
	expect.equal(shots.frame(3, AWAY, SHOT, 0.1), null, 'same step: leave the camera alone');
	expect.equal(shots.frame(3, AWAY, SHOT, 5), null, 'still the same step');
});

test('a new step eases the camera back from where the visitor left it', () => {
	const shots = createShotControl();
	shots.orbited(3);
	const first = shots.frame(4, AWAY, SHOT, 0);
	expect.equal(shots.mode(), 'returning', 'returning');
	close(first.position, AWAY.position, 'starts where the camera is: no jump');
	const middle = shots.frame(4, first, SHOT, RETURN_SECONDS / 2);
	expect.truthy(middle.position[0] > 0 && middle.position[0] < 90, `on the way: ${middle.position[0]}`);
	const done = shots.frame(4, middle, SHOT, RETURN_SECONDS);
	close(done.position, SHOT.position, 'arrives');
	expect.equal(shots.mode(), 'shot', 'back to the shot');
});

test('a cut, or no return time (reduced motion), goes straight to the shot', () => {
	const shots = createShotControl();
	shots.orbited(3);
	close(shots.frame(3, AWAY, SHOT, 0.1, { cut: true }).position, SHOT.position, 'cut');
	expect.equal(shots.mode(), 'shot', 'shot after a cut');
	const still = createShotControl({ returnSeconds: 0 });
	still.orbited(5);
	close(still.frame(6, AWAY, SHOT, 0.016).position, SHOT.position, 'no easing');
});

test('with the clock stopped (ease: false) a return goes straight to the shot, and a free camera stays free', () => {
	const shots = createShotControl();
	shots.orbited(3);
	expect.equal(shots.frame(3, AWAY, SHOT, 0, { ease: false }), null, 'same step: still the visitor');
	close(shots.frame(4, AWAY, SHOT, 0, { ease: false }).position, SHOT.position, 'straight to the new shot');
	expect.equal(shots.mode(), 'shot', 'shot');
	// A return already under way when the clock stops finishes at once rather than stalling.
	const moving = createShotControl();
	moving.orbited(3);
	moving.frame(4, AWAY, SHOT, RETURN_SECONDS / 4);
	expect.equal(moving.mode(), 'returning', 'under way');
	close(moving.frame(4, AWAY, SHOT, 0, { ease: false }).position, SHOT.position, 'finished');
	expect.equal(moving.mode(), 'shot', 'shot');
});

// One drift source: the camera rig (stages/drift.js shotPosition, which the clearance check walks)
// and the story's resolveShot must put the camera in the same place.
test("the story's drift is A3's drift, to the last bit", () => {
	const finale = recipeFor(STEP_COUNT).shot;
	expect.equal(DRIFT_PERIOD_SECONDS, DRIFT_PERIOD, 'one period');
	for (const seconds of [0, 0.37, 10, 61.5, 239.9, 1000]) {
		const resolved = resolveShot(finale, seconds);
		expect.equal(resolved.position.join(','), shotPosition(finale, seconds).join(','), `at ${seconds} s`);
		expect.equal(resolved.target.join(','), finale.target.join(','), `target at ${seconds} s`);
	}
});

// The finale's drift letting go (scrolling back up out of it) would jump the camera from the
// drifted pose to the still shot: it eases there from where the camera is instead.
test('returnToShot eases from where the camera is, unless the visitor has the camera', () => {
	const shots = createShotControl();
	close(shots.frame(GLOW, SHOT, SHOT, 0.016).position, SHOT.position, 'on the shot');
	shots.returnToShot();
	expect.equal(shots.mode(), 'returning', 'returning');
	const first = shots.frame(GLOW, AWAY, SHOT, 0);
	close(first.position, AWAY.position, 'starts where the camera is');
	let pose = first;
	for (let t = 0; t < MAX_RETURN_SECONDS + 1; t += 0.05) {
		pose = shots.frame(GLOW, pose, SHOT, 0.05);
	}
	close(pose.position, SHOT.position, 'arrives');
	expect.equal(shots.mode(), 'shot', 'back on the shot');
	// A visitor holding the camera on this step keeps it.
	shots.orbited(GLOW);
	shots.returnToShot();
	expect.equal(shots.mode(), 'free', 'still free');
	expect.equal(shots.frame(GLOW, AWAY, SHOT, 0.016), null, 'left alone');
});

// Returning from a long way round (the finale drifted half a turn) takes longer, so no frame's
// step is large; a short way takes RETURN_SECONDS.
test('the return orbits round the target and takes longer the further it has to go', () => {
	const target = [0, 2, -120];
	const shot = { position: [0, 21, 40], target };
	const far = { position: [0, 21, -280], target };
	const radius = length(sub(shot.position, target));
	const shots = createShotControl();
	shots.returnToShot();
	let pose = shots.frame(FINALE, far, shot, 0);
	let seconds = 0;
	let largest = 0;
	while (shots.mode() === 'returning' && seconds < 10) {
		const next = shots.frame(FINALE, pose, shot, 1 / 60);
		largest = Math.max(largest, length(sub(next.position, pose.position)));
		// Spherical: the camera stays its distance from the target all the way round.
		expect.near(length(sub(next.position, target)), radius, 1e-6, `radius at ${seconds.toFixed(2)} s`);
		pose = next;
		seconds += 1 / 60;
	}
	const expected = Math.min(MAX_RETURN_SECONDS, Math.max(RETURN_SECONDS, (Math.PI * radius) / RETURN_STUDS_PER_SECOND));
	expect.near(seconds, expected, 2 / 60, `half a turn takes ${seconds.toFixed(2)} s`);
	expect.truthy(seconds > RETURN_SECONDS, 'longer than a short return');
	expect.truthy(largest < 8, `no frame moves more than 8 studs at 60 fps: ${largest.toFixed(2)}`);
	// A short way round still takes RETURN_SECONDS.
	const near = createShotControl();
	near.orbited(3);
	let short = near.frame(4, AWAY, SHOT, 0);
	let elapsed = 0;
	while (near.mode() === 'returning' && elapsed < 10) {
		short = near.frame(4, short, SHOT, 1 / 60);
		elapsed += 1 / 60;
	}
	expect.near(elapsed, RETURN_SECONDS, 2 / 60, 'a short return');
});

// The return's target is the live blend, and its heading can keep turning during the ease (the
// shot moving round the target as the blend changes). Once the target's heading passes from + 180
// degrees, picking the shortest turn again each frame would swap to the other way round and throw
// the camera across the circle in one frame. The turn is followed continuously instead.
test("a target whose heading sweeps past half a turn from the start never flips the camera across the circle", () => {
	const target = [0, 0, 0];
	const radius = 100;
	const at = (degrees) => {
		const a = (degrees * Math.PI) / 180;
		return { position: [radius * Math.sin(a), 20, radius * Math.cos(a)], target };
	};
	const shots = createShotControl();
	shots.returnToShot();
	// The camera starts at heading 0; the target starts at 150 degrees and sweeps on to 230 while
	// the ease runs, crossing 180 (from + 180) part-way.
	let pose = shots.frame(FINALE, at(0), at(150), 0);
	let largest = 0;
	let elapsed = 0;
	while (shots.mode() === 'returning' && elapsed < 10) {
		elapsed += 1 / 60;
		const heading = 150 + Math.min(1, elapsed / 1.0) * 80;
		const next = shots.frame(FINALE, pose, at(heading), 1 / 60);
		largest = Math.max(largest, length(sub(next.position, pose.position)));
		pose = next;
	}
	expect.truthy(largest < 8, `no frame moves more than 8 studs: the largest was ${largest.toFixed(1)}`);
	close(pose.position, at(230).position, 'arrives on the target');
});

test('resolveShot writes into the pose it is given, so the story allocates nothing per frame', () => {
	const out = { position: [0, 0, 0], target: [0, 0, 0] };
	const finale = recipeFor(STEP_COUNT).shot;
	const resolved = resolveShot(finale, 12, out);
	expect.equal(resolved, out, 'the same object back');
	expect.equal(out.position.join(','), shotPosition(finale, 12).join(','), 'the drifted position');
	expect.equal(out.target.join(','), finale.target.join(','), 'the target');
	expect.truthy(out.target !== finale.target, "the recipe's own array is not handed out");
});
