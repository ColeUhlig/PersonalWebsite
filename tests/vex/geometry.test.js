import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapAngle, localToGlobal, globalToLocal, arcChord, headingVector, angleTo, pointOnCircle, degrees } from '../../content/vex/js/core/geometry.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !≈ ${b}`);

test('wrapAngle keeps angles in (-π, π]', () => {
  near(wrapAngle(3 * Math.PI), Math.PI);
  near(wrapAngle(-Math.PI), Math.PI);
  near(wrapAngle(0.5), 0.5);
  near(wrapAngle(-4 * Math.PI + 0.1), 0.1);
});

test('heading 0 faces +y, +90° faces +x (clockwise)', () => {
  const [fx, fy] = localToGlobal([0, 1], 0);
  near(fx, 0); near(fy, 1);
  const [gx, gy] = localToGlobal([0, 1], Math.PI / 2);
  near(gx, 1); near(gy, 0);
  const h = headingVector(Math.PI / 2);
  near(h[0], 1); near(h[1], 0);
});

test('globalToLocal undoes localToGlobal', () => {
  const v = localToGlobal([1.5, -2], 0.7);
  const [x, y] = globalToLocal(v, 0.7);
  near(x, 1.5); near(y, -2);
});

test('arcChord is the identity when there is no turn', () => {
  assert.deepEqual(arcChord([1, 2], 0), [1, 2]);
});

test('arcChord shortens a quarter-circle arc to its chord', () => {
  // arc length r·(π/2) forward, turning π/2 → chord length r·√2
  const r = 10;
  const [x, y] = arcChord([0, r * Math.PI / 2], Math.PI / 2);
  near(x, 0); near(y, r * Math.SQRT2, 1e-9);
});

test('angleTo and pointOnCircle agree', () => {
  const c = [3, 4];
  const p = pointOnCircle(c, 5, 1.1);
  near(angleTo(c, p), 1.1);
});

test('degrees converts radians', () => { near(degrees(Math.PI), 180); });
