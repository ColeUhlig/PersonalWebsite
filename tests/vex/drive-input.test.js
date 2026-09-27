import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDriveInput } from '../../content/vex/js/input/drive-input.js';

// A minimal stand-in for window / an element: addEventListener + a way to fire events.
function fakeTarget(navigator = {}) {
  const listeners = new Map();
  return {
    navigator,
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: (type, fn) => listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)),
    fire: (type, event = {}) => (listeners.get(type) ?? []).forEach((fn) => fn({ preventDefault() {}, ...event })),
    count: () => [...listeners.values()].reduce((n, l) => n + l.length, 0),
  };
}

const enabledInput = (stage, win) => { const input = createDriveInput(stage, win); input.setEnabled(true); return input; };

test('no input gives zero commands', () => {
  const input = enabledInput(fakeTarget(), fakeTarget());
  assert.deepEqual(input.read(), { left: 0, right: 0 });
});

test('starts disabled: keys are ignored and not prevented, so the page still scrolls with arrows', () => {
  const win = fakeTarget();
  const input = createDriveInput(fakeTarget(), win);
  let prevented = false;
  win.fire('keydown', { code: 'ArrowUp', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  assert.deepEqual(input.read(), { left: 0, right: 0 });
  input.setEnabled(true);
  win.fire('keydown', { code: 'ArrowUp', preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(input.read(), { left: 1, right: 1 });
  input.setEnabled(false);
  assert.deepEqual(input.read(), { left: 0, right: 0 }, 'disabling clears held keys');
});

test('W drives forward, D adds a right turn, releasing stops', () => {
  const win = fakeTarget();
  const input = enabledInput(fakeTarget(), win);
  win.fire('keydown', { code: 'KeyW' });
  assert.deepEqual(input.read(), { left: 1, right: 1 });
  win.fire('keydown', { code: 'KeyD' });
  const turning = input.read();
  assert.ok(turning.left > turning.right);
  win.fire('keyup', { code: 'KeyW' }); win.fire('keyup', { code: 'KeyD' });
  assert.deepEqual(input.read(), { left: 0, right: 0 });
});

test('unrelated keys are ignored', () => {
  const win = fakeTarget();
  const input = enabledInput(fakeTarget(), win);
  win.fire('keydown', { code: 'KeyQ' });
  assert.deepEqual(input.read(), { left: 0, right: 0 });
});

test('dragging up on the stage drives forward, proportional to distance', () => {
  const stage = fakeTarget();
  const input = enabledInput(stage, fakeTarget());
  stage.fire('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 });
  stage.fire('pointermove', { clientX: 100, clientY: 60 });
  const half = input.read();
  assert.ok(Math.abs(half.left - 0.5) < 1e-9 && Math.abs(half.right - 0.5) < 1e-9);
  stage.fire('pointerup', {});
  assert.deepEqual(input.read(), { left: 0, right: 0 });
});

test('a gamepad stick is used when no drag is active', () => {
  const win = fakeTarget({ getGamepads: () => [{ axes: [0, -1] }] });
  const input = enabledInput(fakeTarget(), win);
  assert.deepEqual(input.read(), { left: 1, right: 1 });
});

test('destroy removes every listener', () => {
  const stage = fakeTarget(); const win = fakeTarget();
  const input = createDriveInput(stage, win);
  assert.ok(stage.count() > 0 && win.count() > 0);
  input.destroy();
  assert.equal(stage.count() + win.count(), 0);
});
