// The story's camera between shots (piece C): page/shotControl.js, the shot, the visitor's free
// orbit and the ease back to the next step's shot.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { createShotControl, DRIFT_PERIOD_SECONDS, resolveShot, RETURN_SECONDS } from '../../../content/ocean/js/page/shotControl.js';

const SHOT = { position: [0, 14, 40], target: [0, 2, -120] };
const AWAY = { position: [90, 30, 10], target: [0, 2, -120] };
const close = (a, b, label) => a.forEach((v, i) => expect.near(v, b[i], 1e-9, `${label}[${i}]`));

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
