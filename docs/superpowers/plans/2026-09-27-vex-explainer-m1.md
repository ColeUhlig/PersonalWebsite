# VEX Motion Explainer — Milestone 1 (Foundation + Odometry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `coleuhlig.com/vex/`: a scroll-driven page whose first chapter explains tracking-wheel odometry with a 3D field that flattens into annotated 2D geometry, ending in a live "drive it yourself" panel.

**Architecture:** Pure, immutable simulation math in `content/vex/js/core/` (drivetrain → sensors → odometry on a fixed 10 ms tick) is tested in Node and consumed by a Three.js scene plus a 2D canvas overlay. GSAP ScrollTrigger maps every `.beat` element to a chapter progress value; chapters set camera/model state instantly from that value (so scrolling backwards works) and return overlay primitives each frame. No build step: ES modules with an import map to pinned CDN versions.

**Tech Stack:** Vanilla ES modules, Three.js 0.186.1, GSAP 3.15.0 (ScrollTrigger), KaTeX 0.18.9, `node:test` (Node ≥ 22) for unit tests, Playwright 1.63.0 for E2E, `http-server` for a local static server.

**Spec:** `docs/superpowers/specs/2026-09-27-vex-explainer-design.md`

All code in this plan was run and verified in a prototype: 52 unit tests pass with 100% line coverage of `core/`, and the Playwright suite passes on desktop and mobile Chromium with zero console errors. Copy the code exactly; do not "improve" it while implementing.

## Global Constraints

- The site is static files under `content/`; everything in `content/` is uploaded as-is on every push to `main` (see `README.md`, `scripts/deploy.sh`). Nothing outside `content/` is deployed. **Commit as you go, but do not `git push` unless Cole asks — a push goes live.**
- No build step. Browser code is plain ES modules. Libraries come from jsDelivr through an import map, pinned exactly: `three@0.186.1`, `gsap@3.15.0`, `katex@0.18.9`.
- Every HTML page loads `/js/canonical-host.js` in `<head>` (existing site convention) and has a `<link rel="canonical">`.
- Units everywhere: inches, radians, seconds. Field frame: x to the right, y away from the driver, origin at field centre. Headings are compass-style like the VEX IMU and LemLib: 0 = facing +y, clockwise positive. Robot frame: x to the robot's right, y forward.
- Notation follows the Purdue SIGBots wiki: ΔL, ΔR, ΔS for wheel travel; s_L, s_R, s_S for wheel offsets.
- `core/` is pure and immutable: functions take state and return new state, never mutate inputs, and all randomness comes from an injected seeded RNG.
- Colours mean one thing everywhere: truth = translucent white `rgba(255,255,255,0.55)`, estimate/robot = cyan `#3be3ff`, target = amber `#ffb347`, error = red `#ff5c6c`, construction geometry = magenta `#ff4fd8`, background `#0b1020`.
- Overlay geometry is drawn only when the camera is fully orthographic (top-down).
- Mobile (< 900 px): stage pinned to the top 50vh, text below, no horizontal scroll. Device pixel ratio capped at 2.
- Files ≤ 800 lines, functions small; many focused files.
- Unit tests: `npm test` (node:test with coverage; `core/` must stay ≥ 80%, it is currently 100%). E2E: `npm run test:e2e` on desktop + mobile projects.
- Commit messages: `<type>: <description>` (feat, fix, test, docs, chore).
- Cole's policy: never dispatch a Haiku subagent; use Opus/Fable for all subagents.

## Review Focus

1. **Browser without WebGL** — the notice must appear and the story text must still be readable (no crash before the text renders). Test: Task 8 E2E `without WebGL the notice shows…`.
2. **HTML/JS beat-count mismatch** (someone adds a `.beat` div without updating `beats`) — the page must fail loudly, not silently mis-map beats. `story.js` throws a descriptive error at boot; the Task 11 E2E "no page errors" assertion catches it.
3. **Window resized while a top-down beat is showing** — the 3D canvas, overlay canvas and camera frustum must stay matched, or the geometry drifts off the field. Test: Task 11 E2E `resizing during a top-down beat…`.
4. **Arrow keys pressed anywhere except the try-it panel** — must still scroll the page; the driving input may only capture keys while the live beat is on screen. Test: Task 10 unit test `starts disabled…`.
5. **Tab left in the background for minutes, then foregrounded** — the sim must not run thousands of catch-up ticks in one frame. Test: Task 7 unit test `planSteps caps catch-up…`.
6. **Sensor setup switched mid-drive** — history from two different setups must not be mixed; the run resets. Test: Task 11 E2E `changing the sensor setup resets the run`.

---

### Task 1: Project scaffolding + seeded RNG

**Files:**
- Create: `package.json`, `.gitignore`
- Create: `content/vex/js/core/random.js`
- Test: `tests/vex/random.test.js`

**Interfaces:**
- Produces: `createRng(seed: number) → { next(): number in [0,1), normal(): number ~ N(0,1) }`
- Produces: `npm test` (node:test + coverage over `content/vex/js/core/**`)

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
test-results/
playwright-report/
cad-src/
.DS_Store
```

- [ ] **Step 2: Create `package.json`** (repo root — not deployed, since only `content/` is uploaded)

```json
{
  "name": "personal-website",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test --experimental-test-coverage --test-coverage-include='content/vex/js/core/**' 'tests/vex/**/*.test.js'",
    "test:e2e": "playwright test",
    "serve": "http-server content -p 8766 -s -c-1"
  },
  "devDependencies": {
    "@playwright/test": "1.63.0",
    "http-server": "14.1.1"
  }
}
```

- [ ] **Step 3: Install dev dependencies**

Run: `npm install`
Expected: `node_modules/` and `package-lock.json` appear. Commit the lock file.

- [ ] **Step 4: Write the failing test** — `tests/vex/random.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../content/vex/js/core/random.js';

test('same seed gives the same sequence', () => {
  const a = createRng(42);
  const b = createRng(42);
  assert.deepEqual([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);
});

test('values are in [0, 1)', () => {
  const rng = createRng(7);
  for (let i = 0; i < 1000; i += 1) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1);
  }
});

test('normal() has mean ≈ 0 and standard deviation ≈ 1', () => {
  const rng = createRng(3);
  const n = 20000;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i += 1) { const v = rng.normal(); sum += v; sumSq += v * v; }
  const mean = sum / n;
  const sd = Math.sqrt(sumSq / n - mean * mean);
  assert.ok(Math.abs(mean) < 0.03, `mean ${mean}`);
  assert.ok(Math.abs(sd - 1) < 0.03, `sd ${sd}`);
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../content/vex/js/core/random.js'`

- [ ] **Step 6: Implement** — `content/vex/js/core/random.js`

```js
// Seeded pseudo-random numbers (mulberry32), so every run and every test is reproducible.
// The generator keeps its own position in the sequence; everything else in core/ is pure.

export function createRng(seed) {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Standard normal sample (mean 0, standard deviation 1), Box-Muller transform.
  const normal = () => {
    const u = Math.max(next(), 1e-12);
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  return { next, normal };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test`
Expected: `ℹ pass 3`, `ℹ fail 0`, coverage table shows `random.js` at 100%.

- [ ] **Step 8: Commit**

```bash
git add .gitignore package.json package-lock.json content/vex/js/core/random.js tests/vex/random.test.js
git commit -m "chore: add test tooling and seeded RNG for the VEX explainer"
```

---

### Task 2: Geometry helpers

**Files:**
- Create: `content/vex/js/core/geometry.js`
- Test: `tests/vex/geometry.test.js`

**Interfaces:**
- Produces: `add, sub, scale, length, lerp, lerpVec, clamp, degrees, wrapAngle(θ), headingVector(θ) → [x,y], localToGlobal([lx,ly], θ), globalToLocal([gx,gy], θ), pointOnCircle(center, r, compassAngle), angleTo(from, to), arcChord([sideways, forward], dTheta)`, constant `ARC_EPSILON = 1e-9`. Vectors are plain `[x, y]` arrays.

- [ ] **Step 1: Write the failing test** — `tests/vex/geometry.test.js`

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `geometry.js`.

- [ ] **Step 3: Implement** — `content/vex/js/core/geometry.js`

```js
// 2D helpers for field coordinates.
// Field frame: x to the right, y away from the driver (up in the top-down view), inches, origin at center.
// Headings are compass-style like the VEX IMU and LemLib: 0 = facing +y, clockwise positive, radians.
// Robot (local) frame: x to the robot's right, y straight ahead.

export const ARC_EPSILON = 1e-9;

export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const scale = (a, k) => [a[0] * k, a[1] * k];
export const length = (a) => Math.hypot(a[0], a[1]);
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerpVec = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const degrees = (radians) => (radians * 180) / Math.PI;

// Wraps an angle into (-π, π].
export function wrapAngle(angle) {
  const wrapped = angle - 2 * Math.PI * Math.floor((angle + Math.PI) / (2 * Math.PI));
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

// Unit vector pointing along a compass heading.
export const headingVector = (theta) => [Math.sin(theta), Math.cos(theta)];

// Rotates a robot-frame vector into the field frame for a robot facing `theta`.
export function localToGlobal([lx, ly], theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [lx * c + ly * s, -lx * s + ly * c];
}

export function globalToLocal([gx, gy], theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return [gx * c - gy * s, gx * s + gy * c];
}

export const pointOnCircle = (center, radius, compassAngle) =>
  add(center, scale(headingVector(compassAngle), radius));

// Compass angle of the direction from `from` to `to`.
export const angleTo = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);

/**
 * Straight-line displacement (chord) of a point that travelled `travel` = [sideways, forward]
 * inches along an arc while turning dTheta radians. This is the 2·sin(Δθ/2)/Δθ factor from the
 * 5225A tracking paper; with no turn the arc is a straight line.
 */
export function arcChord(travel, dTheta) {
  if (Math.abs(dTheta) < ARC_EPSILON) return [travel[0], travel[1]];
  return scale(travel, (2 * Math.sin(dTheta / 2)) / dTheta);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add content/vex/js/core/geometry.js tests/vex/geometry.test.js
git commit -m "feat: add field-frame geometry helpers"
```

---

### Task 3: Robot config + robot geometry

**Files:**
- Create: `content/vex/js/core/robot-config.js`, `content/vex/js/core/robot-geometry.js`
- Test: `tests/vex/robot-geometry.test.js`

**Interfaces:**
- Consumes: `add, localToGlobal` from `geometry.js`.
- Produces: `ROBOT` (frozen config: `chassis {width,length,height}`, `trackWidth`, `driveWheel {diameter,width,wheelbase}`, `maxSpeed`, `motorTimeConstant`, `tracking {sL,sR,sS,diameter}`, `imu {x,y}`, `distanceSensors {rear,left: {x,y,heading}}`).
- Produces: `chassisCorners(pose, cfg) → [[x,y]×4]` (front-left, front-right, rear-right, rear-left); `trackingWheelPoints(pose, cfg, rightForward = 0) → { center, left, right, strafe }`.
- A `pose` is always `{ x, y, theta }`.

- [ ] **Step 1: Write the failing test** — `tests/vex/robot-geometry.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { chassisCorners, trackingWheelPoints } from '../../content/vex/js/core/robot-geometry.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !≈ ${b}`);

test('chassis corners are centred on the pose and rotate with heading', () => {
  const corners = chassisCorners({ x: 10, y: 20, theta: Math.PI / 2 }, ROBOT);
  assert.equal(corners.length, 4);
  const cx = corners.reduce((s, c) => s + c[0], 0) / 4;
  const cy = corners.reduce((s, c) => s + c[1], 0) / 4;
  near(cx, 10); near(cy, 20);
  // facing +x: the front-left corner (-w, +l) lands at (x + l, y + w)
  near(corners[0][0], 10 + ROBOT.chassis.length / 2); near(corners[0][1], 20 + ROBOT.chassis.width / 2);
});

test('tracking wheel points sit at their offsets', () => {
  const p = trackingWheelPoints({ x: 0, y: 0, theta: 0 }, ROBOT);
  near(p.left[0], -ROBOT.tracking.sL); near(p.right[0], ROBOT.tracking.sR); near(p.strafe[1], -ROBOT.tracking.sS);
  const slid = trackingWheelPoints({ x: 0, y: 0, theta: 0 }, ROBOT, 3);
  near(slid.right[1], 3);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `robot-config.js`.

- [ ] **Step 3: Implement** — `content/vex/js/core/robot-config.js`

```js
// One description of the robot, shared by the math (core/) and the 3D model (scene/robot.js),
// so the picture and the numbers always agree. Inches, radians, seconds.
// Tracking wheel offsets use the Purdue SIGBots wiki's names: s_L, s_R, s_S are the distances from
// the tracking center to the left, right and back (strafe) tracking wheels.

export const ROBOT = Object.freeze({
  chassis: Object.freeze({ width: 15, length: 15, height: 2.5 }),
  trackWidth: 12, // left-to-right distance between drive wheels
  driveWheel: Object.freeze({ diameter: 3.25, width: 1.2, wheelbase: 10 }),
  maxSpeed: 60, // in/s at full power
  motorTimeConstant: 0.12, // s, how quickly wheel speed follows the command
  tracking: Object.freeze({ sL: 4.5, sR: 4.5, sS: 3.5, diameter: 2 }),
  imu: Object.freeze({ x: 2.5, y: 2.5 }),
  distanceSensors: Object.freeze({
    rear: Object.freeze({ x: 0, y: -7.5, heading: Math.PI }),
    left: Object.freeze({ x: -7.5, y: 0, heading: -Math.PI / 2 }),
  }),
});
```

- [ ] **Step 4: Implement** — `content/vex/js/core/robot-geometry.js`

```js
import { add, localToGlobal } from './geometry.js';

// Field positions of the robot's parts, used for drawing.

const toField = (pose, local) => add([pose.x, pose.y], localToGlobal(local, pose.theta));

export function chassisCorners(pose, cfg) {
  const w = cfg.chassis.width / 2;
  const l = cfg.chassis.length / 2;
  return [
    [-w, l],
    [w, l],
    [w, -l],
    [-w, -l],
  ].map((corner) => toField(pose, corner));
}

// `rightForward` slides the right tracking wheel along the robot (used by the "only the sideways
// offset matters" beat).
export function trackingWheelPoints(pose, cfg, rightForward = 0) {
  const { sL, sR, sS } = cfg.tracking;
  return {
    center: [pose.x, pose.y],
    left: toField(pose, [-sL, 0]),
    right: toField(pose, [sR, rightForward]),
    strafe: toField(pose, [0, -sS]),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add content/vex/js/core/robot-config.js content/vex/js/core/robot-geometry.js tests/vex/robot-geometry.test.js
git commit -m "feat: add shared robot config and part geometry"
```

---

### Task 4: Drivetrain (the "true" robot)

**Files:**
- Create: `content/vex/js/core/drivetrain.js`
- Test: `tests/vex/drivetrain.test.js`

**Interfaces:**
- Consumes: `arcChord, clamp, localToGlobal` from `geometry.js`; `ROBOT` shape from Task 3.
- Produces: `initialDrive(pose?) → { pose, vl, vr }`; `stepDrive(state, command {left,right ∈ [-1,1]}, dt, cfg, slip = 0) → { state, motion }` where `motion = { forward, lateral, dTheta, motorL, motorR }` (inches / radians moved this tick; `motorL/R` is what the drive encoders count).

- [ ] **Step 1: Write the failing test** — `tests/vex/drivetrain.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { initialDrive, stepDrive } from '../../content/vex/js/core/drivetrain.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !≈ ${b}`);
const run = (command, seconds, slip = 0) => {
  let state = initialDrive();
  let motion;
  for (let i = 0; i < Math.round(seconds / 0.01); i += 1) ({ state, motion } = stepDrive(state, command, 0.01, ROBOT, slip));
  return { state, motion };
};

test('full power forward approaches max speed and drives along +y', () => {
  const { state } = run({ left: 1, right: 1 }, 2);
  near(state.vl, ROBOT.maxSpeed, 1e-3);
  near(state.pose.x, 0); near(state.pose.theta, 0);
  assert.ok(state.pose.y > 100 && state.pose.y < 2 * ROBOT.maxSpeed);
});

test('does not mutate the input state', () => {
  const state = initialDrive();
  const frozen = JSON.stringify(state);
  stepDrive(state, { left: 1, right: 0.5 }, 0.01, ROBOT);
  assert.equal(JSON.stringify(state), frozen);
});

test('left faster than right turns clockwise (heading increases) and curves to +x', () => {
  const { state } = run({ left: 1, right: 0.5 }, 1);
  assert.ok(state.pose.theta > 0);
  assert.ok(state.pose.x > 0);
});

test('a steady arc has radius (vl+vr)/2 ÷ ((vl−vr)/trackWidth)', () => {
  const frames = [];
  let state = initialDrive();
  for (let i = 0; i < 400; i += 1) { ({ state } = stepDrive(state, { left: 1, right: 0.5 }, 0.01, ROBOT)); if (i >= 200) frames.push(state.pose); }
  const R = ((60 + 30) / 2) / ((60 - 30) / ROBOT.trackWidth);
  const p0 = frames[0];
  const center = [p0.x + R * Math.cos(p0.theta), p0.y - R * Math.sin(p0.theta)];
  for (const p of frames) near(Math.hypot(p.x - center[0], p.y - center[1]), R, 0.01);
});

test('commands are clamped to [-1, 1]', () => {
  const { state } = run({ left: 5, right: 5 }, 1);
  assert.ok(state.vl <= ROBOT.maxSpeed + 1e-9);
});

test('slip reduces ground travel during acceleration but not motor travel', () => {
  const noSlip = run({ left: 1, right: 1 }, 0.3, 0);
  const slip = run({ left: 1, right: 1 }, 0.3, 1);
  assert.ok(slip.state.pose.y < noSlip.state.pose.y);
  near(slip.motion.motorL, noSlip.motion.motorL);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `drivetrain.js`.

- [ ] **Step 3: Implement** — `content/vex/js/core/drivetrain.js`

```js
import { arcChord, clamp, localToGlobal } from './geometry.js';

// The "true" robot: a tank drive whose wheel speeds lag behind the command like real motors,
// with optional wheel slip under hard acceleration and sideways skid in fast turns.

const SLIP_LOSS = 0.25; // share of wheel speed lost at full acceleration when slip = 1
const SKID = 0.02; // sideways slide, in/s per (in/s × rad/s), when slip = 1

export const initialDrive = (pose = { x: 0, y: 0, theta: 0 }) => ({ pose, vl: 0, vr: 0 });

function followCommand(speed, command, dt, cfg) {
  const target = clamp(command, -1, 1) * cfg.maxSpeed;
  return speed + (target - speed) * (1 - Math.exp(-dt / cfg.motorTimeConstant));
}

function groundSpeed(speed, previous, dt, cfg, slip) {
  const maxAccel = cfg.maxSpeed / cfg.motorTimeConstant;
  const accel = Math.min(1, Math.abs(speed - previous) / dt / maxAccel);
  return speed * (1 - SLIP_LOSS * slip * accel);
}

/**
 * Advances the true robot one tick.
 * command: { left, right } in [-1, 1].
 * Returns the new state plus `motion`: how far the robot's center moved along its own axes
 * (`forward`, `lateral`, inches), its heading change `dTheta` (clockwise +), and how far each
 * drive wheel's surface turned (`motorL`, `motorR`), which is what the drive encoders count.
 */
export function stepDrive(state, command, dt, cfg, slip = 0) {
  const vl = followCommand(state.vl, command.left, dt, cfg);
  const vr = followCommand(state.vr, command.right, dt, cfg);
  const groundL = groundSpeed(vl, state.vl, dt, cfg, slip);
  const groundR = groundSpeed(vr, state.vr, dt, cfg, slip);
  const vForward = (groundL + groundR) / 2;
  const omega = (groundL - groundR) / cfg.trackWidth;
  const vLateral = -SKID * slip * vForward * omega;

  const motion = {
    forward: vForward * dt,
    lateral: vLateral * dt,
    dTheta: omega * dt,
    motorL: vl * dt,
    motorR: vr * dt,
  };
  const { pose } = state;
  const chord = arcChord([motion.lateral, motion.forward], motion.dTheta);
  const [dx, dy] = localToGlobal(chord, pose.theta + motion.dTheta / 2);
  return {
    state: { pose: { x: pose.x + dx, y: pose.y + dy, theta: pose.theta + motion.dTheta }, vl, vr },
    motion,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add content/vex/js/core/drivetrain.js tests/vex/drivetrain.test.js
git commit -m "feat: add tank-drive kinematics with motor lag and slip"
```

---

### Task 5: Sensors

**Files:**
- Create: `content/vex/js/core/sensors.js`
- Test: `tests/vex/sensors.test.js`

**Interfaces:**
- Consumes: `motion` from Task 4; `cfg.tracking` from Task 3; `rng.normal()` from Task 1.
- Produces: `wheelTravel(motion, { axis: 'forward'|'lateral', x, y }) → inches`; `readSensors(motion, cfg, rng, noise = 0) → { dL, dR, dS, driveL, driveR, imuDTheta }`.

- [ ] **Step 1: Write the failing test** — `tests/vex/sensors.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { readSensors, wheelTravel } from '../../content/vex/js/core/sensors.js';
import { createRng } from '../../content/vex/js/core/random.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !≈ ${b}`);
const motion = { forward: 0.5, lateral: 0.02, dTheta: 0.03, motorL: 0.6, motorR: 0.4 };

test('a forward-rolling wheel only feels its sideways offset', () => {
  const a = wheelTravel(motion, { axis: 'forward', x: 4, y: 0 });
  const b = wheelTravel(motion, { axis: 'forward', x: 4, y: 7 });
  near(a, b);
  near(a, motion.forward - 4 * motion.dTheta);
});

test('with zero noise the readings are exact and deterministic', () => {
  const r = readSensors(motion, ROBOT, createRng(1), 0);
  near(r.dL, motion.forward + ROBOT.tracking.sL * motion.dTheta);
  near(r.dR, motion.forward - ROBOT.tracking.sR * motion.dTheta);
  near(r.dS, motion.lateral - ROBOT.tracking.sS * motion.dTheta);
  near(r.imuDTheta, motion.dTheta);
  near(r.driveL, motion.motorL);
});

test('wheel-derived heading equals the true turn with zero noise', () => {
  const r = readSensors(motion, ROBOT, createRng(1), 0);
  near((r.dL - r.dR) / (ROBOT.tracking.sL + ROBOT.tracking.sR), motion.dTheta);
});

test('noise is reproducible for the same seed and differs between seeds', () => {
  const a = readSensors(motion, ROBOT, createRng(5), 1);
  const b = readSensors(motion, ROBOT, createRng(5), 1);
  const c = readSensors(motion, ROBOT, createRng(6), 1);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.notEqual(a.dL, motion.forward + ROBOT.tracking.sL * motion.dTheta);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `sensors.js`.

- [ ] **Step 3: Implement** — `content/vex/js/core/sensors.js`

```js
// What the robot's sensors report for one tick of true motion.
// Tracking wheels are unpowered, so they only see real ground motion. Drive encoders count motor
// rotation, so wheel slip fools them. `noise` scales every error source (0 = perfect sensors).

const TRACKING_NOISE = 0.01; // standard deviation, as a fraction of the distance travelled
const TRACKING_FLOOR = 0.001; // in per tick
const IMU_NOISE = 0.0004; // rad per tick
const IMU_BIAS = 0.00002; // rad per tick of steady drift
const SCALE_BIAS = 0.004; // every wheel measured the same amount too big/small (fraction, per unit of noise)
const WHEEL_MISMATCH = 0.0004; // left vs right wheel disagreement (fraction, per unit of noise)

/**
 * Distance an omni wheel mounted at robot-frame point (x, y) measures along its rolling axis.
 * A rigid body turning clockwise at rate ω moves the point (x, y) at
 * (v_lateral + ω·y, v_forward − ω·x), so a forward-rolling wheel's reading never depends on y:
 * only its sideways offset matters.
 */
export function wheelTravel(motion, mount) {
  return mount.axis === 'forward'
    ? motion.forward - mount.x * motion.dTheta
    : motion.lateral + mount.y * motion.dTheta;
}

export function readSensors(motion, cfg, rng, noise = 0) {
  const { sL, sR, sS } = cfg.tracking;
  const jitter = (distance) =>
    noise === 0 ? 0 : noise * rng.normal() * (TRACKING_NOISE * Math.abs(distance) + TRACKING_FLOOR);
  const withJitter = (distance) => distance + jitter(distance);

  // A wheel measured slightly wrong reads a little long or short on every tick: the dominant
  // real-world drift. The small left/right mismatch is what skews a wheel-derived heading.
  const scaleL = 1 + noise * (SCALE_BIAS + WHEEL_MISMATCH);
  const scaleR = 1 + noise * (SCALE_BIAS - WHEEL_MISMATCH);
  const dL = wheelTravel(motion, { axis: 'forward', x: -sL, y: 0 }) * scaleL;
  const dR = wheelTravel(motion, { axis: 'forward', x: sR, y: 0 }) * scaleR;
  const dS = wheelTravel(motion, { axis: 'lateral', x: 0, y: -sS });
  const imuError = noise === 0 ? 0 : noise * (IMU_BIAS + IMU_NOISE * rng.normal());

  return {
    dL: withJitter(dL),
    dR: withJitter(dR),
    dS: withJitter(dS),
    driveL: withJitter(motion.motorL * scaleL),
    driveR: withJitter(motion.motorR * scaleR),
    imuDTheta: motion.dTheta + imuError,
  };
}
```

These constants were tuned so that on a 14 s stop-start run at noise 1 the three sensor setups drift about 5" (2 wheels + IMU), 11" (3 wheels) and 17" (drive encoders + IMU) — the ordering the "Sensors" switcher is meant to teach. Don't change them without re-checking that ordering.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add content/vex/js/core/sensors.js tests/vex/sensors.test.js
git commit -m "feat: simulate tracking wheels, drive encoders and IMU with noise"
```

---

### Task 6: Odometry (5225A arc method, as in LemLib)

**Files:**
- Create: `content/vex/js/core/odometry.js`
- Test: `tests/vex/odometry.test.js`

**Interfaces:**
- Consumes: `ARC_EPSILON, add, arcChord, localToGlobal` from `geometry.js`; readings shape from Task 5.
- Produces: `SETUPS` (`[{id:'threeWheel'|'twoWheelImu'|'driveImu', label}]`); `selectInputs(setupId, readings, cfg) → { dR, dS, dTheta, sR, sS }`; `stepOdometry(pose, input) → { pose, debug: { start, dTheta, radius, travel, localChord, rotation, globalDelta, center|null } }`; `stepStraightLine(pose, input) → pose`; `combineReadings(readings[]) → readings`.

- [ ] **Step 1: Write the failing test** — `tests/vex/odometry.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { stepOdometry, selectInputs, combineReadings } from '../../content/vex/js/core/odometry.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !≈ ${b}`);
const origin = { x: 0, y: 0, theta: 0 };

test('straight tick moves forward by ΔR with no turn (Δθ = 0 guard)', () => {
  const { pose, debug } = stepOdometry(origin, { dR: 0.5, dS: 0, dTheta: 0, sR: 4.5, sS: 3.5 });
  near(pose.x, 0); near(pose.y, 0.5); near(pose.theta, 0);
  assert.equal(debug.center, null);
  assert.equal(debug.radius, Infinity);
});

test('matches LemLib formula for a known tick', () => {
  // dR = 0.5, Δθ = 0.05, sR = 4.5, sS = 3.5, dS = 0.02, θ = 0.3
  const input = { dR: 0.5, dS: 0.02, dTheta: 0.05, sR: 4.5, sS: 3.5 };
  const { pose, debug } = stepOdometry({ x: 1, y: 2, theta: 0.3 }, input);
  const k = 2 * Math.sin(0.025);
  const localX = k * (0.02 / 0.05 + 3.5);
  const localY = k * (0.5 / 0.05 + 4.5);
  near(debug.localChord[0], localX); near(debug.localChord[1], localY);
  const rot = 0.3 + 0.025;
  near(pose.x, 1 + localX * Math.cos(rot) + localY * Math.sin(rot));
  near(pose.y, 2 - localX * Math.sin(rot) + localY * Math.cos(rot));
  near(pose.theta, 0.35);
  near(debug.radius, 0.5 / 0.05 + 4.5);
});

test('arc integration over 1000 ticks lands on the analytic circle', () => {
  // Constant inputs: Δθ = 0.002 rad/tick and the tracking centre moving 0.3"/tick straight ahead.
  // The right wheel (sR outboard) rolls a little less than the centre on a clockwise turn, and the
  // strafe wheel (sS behind the centre) is dragged sideways by −sS·Δθ even though the centre isn't.
  let pose = origin;
  const dTheta = 0.002; const sR = 4.5; const sS = 3.5;
  const centreTravel = 0.3; const dR = centreTravel - sR * dTheta; const dS = -sS * dTheta;
  for (let i = 0; i < 1000; i += 1) pose = stepOdometry(pose, { dR, dS, dTheta, sR, sS }).pose;
  const R = centreTravel / dTheta; // 150"
  // circle centre is R to the right of the start (clockwise turn from heading 0)
  near(Math.hypot(pose.x - R, pose.y), R, 0.01);
  near(pose.theta, 2, 1e-9);
});

test('selectInputs picks readings per setup', () => {
  const readings = { dL: 1.1, dR: 0.9, dS: 0.1, driveL: 1.2, driveR: 0.8, imuDTheta: 0.02 };
  const three = selectInputs('threeWheel', readings, ROBOT);
  near(three.dTheta, (1.1 - 0.9) / (ROBOT.tracking.sL + ROBOT.tracking.sR));
  const imu = selectInputs('twoWheelImu', readings, ROBOT);
  near(imu.dTheta, 0.02); near(imu.dR, 0.9);
  const drive = selectInputs('driveImu', readings, ROBOT);
  near(drive.dR, 0.8); near(drive.dS, 0); near(drive.sR, ROBOT.trackWidth / 2);
});

test('selectInputs rejects unknown setups', () => {
  assert.throws(() => selectInputs('nope', {}, ROBOT), /Unknown odometry setup/);
});

test('combineReadings sums every field', () => {
  const sum = combineReadings([{ dL: 1, dR: 2, dS: 3, driveL: 4, driveR: 5, imuDTheta: 6 }, { dL: 1, dR: 1, dS: 1, driveL: 1, driveR: 1, imuDTheta: 1 }]);
  assert.deepEqual(sum, { dL: 2, dR: 3, dS: 4, driveL: 5, driveR: 6, imuDTheta: 7 });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `odometry.js`.

- [ ] **Step 3: Implement** — `content/vex/js/core/odometry.js`

```js
import { ARC_EPSILON, add, arcChord, localToGlobal } from './geometry.js';

// Tracking-wheel odometry, 5225A (E-Bots PiLons) arc method: the same steps as LemLib's
// TrackingWheelOdometry::update. Notation follows the Purdue SIGBots wiki.

export const SETUPS = Object.freeze([
  Object.freeze({ id: 'threeWheel', label: '3 tracking wheels' }),
  Object.freeze({ id: 'twoWheelImu', label: '2 tracking wheels + IMU' }),
  Object.freeze({ id: 'driveImu', label: 'Drive motor encoders + IMU' }),
]);

/** Picks the readings and offsets a sensor setup uses: { dR, dS, dTheta, sR, sS }. */
export function selectInputs(setupId, readings, cfg) {
  const { sL, sR, sS } = cfg.tracking;
  switch (setupId) {
    case 'threeWheel':
      return { dR: readings.dR, dS: readings.dS, dTheta: (readings.dL - readings.dR) / (sL + sR), sR, sS };
    case 'twoWheelImu':
      return { dR: readings.dR, dS: readings.dS, dTheta: readings.imuDTheta, sR, sS };
    case 'driveImu':
      return { dR: readings.driveR, dS: 0, dTheta: readings.imuDTheta, sR: cfg.trackWidth / 2, sS: 0 };
    default:
      throw new Error(`Unknown odometry setup: ${setupId}`);
  }
}

/**
 * One odometry update. Returns the new pose plus every intermediate value so the page can draw
 * them: the local chord, the rotation applied, the turning radius and the arc's center.
 */
export function stepOdometry(pose, input) {
  const { dR, dS, dTheta, sR, sS } = input;
  const travel = [dS + sS * dTheta, dR + sR * dTheta]; // the tracking center's arc length, per axis
  const localChord = arcChord(travel, dTheta);
  const rotation = pose.theta + dTheta / 2;
  const globalDelta = localToGlobal(localChord, rotation);
  const turning = Math.abs(dTheta) >= ARC_EPSILON;
  const radius = turning ? dR / dTheta + sR : Infinity;
  // Instant center of rotation, in the robot frame: (forward travel / Δθ, −sideways travel / Δθ).
  const center = turning
    ? add([pose.x, pose.y], localToGlobal([travel[1] / dTheta, -travel[0] / dTheta], pose.theta))
    : null;

  return {
    pose: { x: pose.x + globalDelta[0], y: pose.y + globalDelta[1], theta: pose.theta + dTheta },
    debug: { start: pose, dTheta, radius, travel, localChord, rotation, globalDelta, center },
  };
}

/** The naive alternative: treat the tick as a straight step in the starting heading. */
export function stepStraightLine(pose, input) {
  const { dR, dS, dTheta, sR, sS } = input;
  const [dx, dy] = localToGlobal([dS + sS * dTheta, dR + sR * dTheta], pose.theta);
  return { x: pose.x + dx, y: pose.y + dy, theta: pose.theta + dTheta };
}

/** Adds up several ticks of readings, as if odometry ran less often. */
export function combineReadings(list) {
  return list.reduce(
    (sum, r) => Object.fromEntries(Object.keys(sum).map((key) => [key, sum[key] + r[key]])),
    { dL: 0, dR: 0, dS: 0, driveL: 0, driveR: 0, imuDTheta: 0 },
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add content/vex/js/core/odometry.js tests/vex/odometry.test.js
git commit -m "feat: port 5225A/LemLib arc odometry with per-tick debug output"
```

---

### Task 7: Sim loop + bounded trail

**Files:**
- Create: `content/vex/js/core/sim.js`, `content/vex/js/core/trail.js`
- Test: `tests/vex/sim.test.js`, `tests/vex/odometry-integration.test.js`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: `TICK = 0.01`, `MAX_STEPS_PER_FRAME = 10`, `DEFAULT_ENV = { setup:'threeWheel', noise:0, slip:0 }`; `createSim(pose?) → { t, drive, estimate }`; `stepSim(sim, command, env, cfg, rng) → { sim, motion, readings, debug }`; `runScript(script: [{duration,left,right}], { cfg, pose?, env?, seed? }) → frames[{ t, truth, estimate, motion, readings, debug }]`; `planSteps(accumulator, elapsedSeconds) → { steps, accumulator }`; `appendBounded(list, item, max) → newList`.

- [ ] **Step 1: Write the failing tests** — `tests/vex/sim.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { createSim, stepSim, runScript, planSteps, MAX_STEPS_PER_FRAME } from '../../content/vex/js/core/sim.js';
import { createRng } from '../../content/vex/js/core/random.js';
import { appendBounded } from '../../content/vex/js/core/trail.js';

test('runScript records one frame per tick with truth, estimate and debug', () => {
  const frames = runScript([{ duration: 0.5, left: 1, right: 1 }], { cfg: ROBOT });
  assert.equal(frames.length, 50);
  const f = frames.at(-1);
  assert.ok(Math.abs(f.t - 0.5) < 1e-9);
  assert.ok(f.truth.y > 0 && f.estimate.y > 0);
  assert.ok('localChord' in f.debug);
});

test('runScript is deterministic for a seed, even with noise', () => {
  const opts = { cfg: ROBOT, env: { setup: 'threeWheel', noise: 2, slip: 1 }, seed: 9 };
  const a = runScript([{ duration: 1, left: 1, right: 0.7 }], opts);
  const b = runScript([{ duration: 1, left: 1, right: 0.7 }], opts);
  assert.deepEqual(a.at(-1), b.at(-1));
});

test('noise makes the estimate drift from the truth; zero noise does not', () => {
  const script = [{ duration: 3, left: 1, right: 0.6 }, { duration: 3, left: 0.6, right: 1 }];
  const noisy = runScript(script, { cfg: ROBOT, env: { setup: 'threeWheel', noise: 3, slip: 1 } }).at(-1);
  const clean = runScript(script, { cfg: ROBOT }).at(-1);
  const err = (f) => Math.hypot(f.estimate.x - f.truth.x, f.estimate.y - f.truth.y);
  assert.ok(err(noisy) > 1, `drift ${err(noisy)}`);
  assert.ok(err(clean) < 1e-6);
});

test('stepSim does not mutate its input', () => {
  const sim = createSim();
  const frozen = JSON.stringify(sim);
  stepSim(sim, { left: 1, right: 1 }, {}, ROBOT, createRng(1));
  assert.equal(JSON.stringify(sim), frozen);
});

test('planSteps splits elapsed time into whole ticks and keeps the remainder', () => {
  const a = planSteps(0, 0.025);
  assert.equal(a.steps, 2); assert.ok(Math.abs(a.accumulator - 0.005) < 1e-9);
  const b = planSteps(0.005, 0.005);
  assert.equal(b.steps, 1); assert.ok(b.accumulator < 1e-9);
});

test('planSteps caps catch-up after a stall and drops the backlog', () => {
  assert.deepEqual(planSteps(0, 5), { steps: MAX_STEPS_PER_FRAME, accumulator: 0 });
  assert.deepEqual(planSteps(0, -1), { steps: 0, accumulator: 0 });
});

test('appendBounded keeps at most max items and returns a new array', () => {
  const a = [1, 2, 3];
  const b = appendBounded(a, 4, 3);
  assert.deepEqual(b, [2, 3, 4]);
  assert.deepEqual(a, [1, 2, 3]);
  assert.deepEqual(appendBounded([], 1, 3), [1]);
});
```

And `tests/vex/odometry-integration.test.js` (odometry driven by the full sim):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { stepOdometry, stepStraightLine, selectInputs, combineReadings, SETUPS } from '../../content/vex/js/core/odometry.js';
import { runScript } from '../../content/vex/js/core/sim.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} !≈ ${b}`);
const origin = { x: 0, y: 0, theta: 0 };

test('a full spin in place returns to the same point', () => {
  const frames = runScript([{ duration: 2, left: 1, right: -1 }], { cfg: ROBOT });
  const last = frames.at(-1).estimate;
  near(last.x, 0, 1e-6); near(last.y, 0, 1e-6);
  assert.ok(Math.abs(last.theta) > Math.PI);
});

for (const { id } of SETUPS) {
  test(`${id}: with perfect sensors the estimate equals the truth on an S-curve`, () => {
    const frames = runScript([{ duration: 3, left: 1, right: 0.6 }, { duration: 2, left: 0.5, right: 1 }], { cfg: ROBOT, env: { setup: id, noise: 0, slip: 0 } });
    const { truth, estimate } = frames.at(-1);
    near(estimate.x, truth.x, 1e-6); near(estimate.y, truth.y, 1e-6); near(estimate.theta, truth.theta, 1e-9);
  });
}

test('straight-line integration is worse than arcs and gets worse with a longer period', () => {
  const frames = runScript([{ duration: 3, left: 1, right: 0.4 }], { cfg: ROBOT });
  const errorFor = (period) => {
    let arc = origin; let straight = origin; let truth;
    for (let i = 0; i + period <= frames.length; i += period) {
      const input = selectInputs('threeWheel', combineReadings(frames.slice(i, i + period).map((f) => f.readings)), ROBOT);
      arc = stepOdometry(arc, input).pose; straight = stepStraightLine(straight, input); truth = frames[i + period - 1].truth;
    }
    return { arc: Math.hypot(arc.x - truth.x, arc.y - truth.y), straight: Math.hypot(straight.x - truth.x, straight.y - truth.y) };
  };
  const e1 = errorFor(1); const e10 = errorFor(10);
  assert.ok(e1.arc < 1e-6 && e10.arc < 1e-6);
  assert.ok(e10.straight > e1.straight * 5);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `sim.js` / `trail.js`.

- [ ] **Step 3: Implement** — `content/vex/js/core/trail.js`

```js
// Returns a new list with `item` appended, keeping at most `max` items (oldest dropped).
export function appendBounded(list, item, max) {
  const kept = list.length >= max ? list.slice(list.length - max + 1) : list;
  return [...kept, item];
}
```

- [ ] **Step 4: Implement** — `content/vex/js/core/sim.js`

```js
import { initialDrive, stepDrive } from './drivetrain.js';
import { createRng } from './random.js';
import { readSensors } from './sensors.js';
import { selectInputs, stepOdometry } from './odometry.js';

// Ties the true robot, its sensors and odometry together on a fixed 10 ms tick (the period of a
// typical PROS odometry task). Controllers only ever see `estimate`, like on a real robot.

export const TICK = 0.01;
export const MAX_STEPS_PER_FRAME = 10;
export const DEFAULT_ENV = Object.freeze({ setup: 'threeWheel', noise: 0, slip: 0 });

export const createSim = (pose = { x: 0, y: 0, theta: 0 }) => ({ t: 0, drive: initialDrive(pose), estimate: pose });

export function stepSim(sim, command, env, cfg, rng) {
  const { setup, noise, slip } = { ...DEFAULT_ENV, ...env };
  const { state: drive, motion } = stepDrive(sim.drive, command, TICK, cfg, slip);
  const readings = readSensors(motion, cfg, rng, noise);
  const odom = stepOdometry(sim.estimate, selectInputs(setup, readings, cfg));
  return { sim: { t: sim.t + TICK, drive, estimate: odom.pose }, motion, readings, debug: odom.debug };
}

/**
 * Plays a script of { duration, left, right } segments and records every tick as
 * { t, truth, estimate, motion, readings, debug }.
 */
export function runScript(script, { cfg, pose, env = DEFAULT_ENV, seed = 1 }) {
  const rng = createRng(seed);
  const frames = [];
  let sim = createSim(pose);
  for (const segment of script) {
    const ticks = Math.round(segment.duration / TICK);
    for (let i = 0; i < ticks; i += 1) {
      const step = stepSim(sim, segment, env, cfg, rng);
      sim = step.sim;
      frames.push({
        t: sim.t,
        truth: sim.drive.pose,
        estimate: sim.estimate,
        motion: step.motion,
        readings: step.readings,
        debug: step.debug,
      });
    }
  }
  return frames;
}

/**
 * Splits elapsed real time into whole sim ticks. After a stall (a background tab, a slow frame)
 * it runs at most MAX_STEPS_PER_FRAME ticks and drops the rest instead of trying to catch up.
 */
export function planSteps(accumulator, elapsed) {
  const total = accumulator + Math.max(0, elapsed);
  const steps = Math.floor(total / TICK + 1e-9);
  if (steps > MAX_STEPS_PER_FRAME) return { steps: MAX_STEPS_PER_FRAME, accumulator: 0 };
  return { steps, accumulator: Math.max(0, total - steps * TICK) };
}
```

- [ ] **Step 5: Run tests to verify they pass, with coverage**

Run: `npm test`
Expected: `ℹ fail 0`; the coverage table's `all files` line shows 100% lines for `core/`.

- [ ] **Step 6: Commit**

```bash
git add content/vex/js/core/sim.js content/vex/js/core/trail.js tests/vex/sim.test.js tests/vex/odometry-integration.test.js
git commit -m "feat: add fixed-tick sim loop, script runner and bounded trail"
```

---

### Task 8: Page shell, 3D scene, overlay, scroll engine and E2E harness

This task produces a deployable page that renders the field and the robot (no chapters yet) and is covered by a Playwright smoke test.

**Files:**
- Create: `content/vex/index.html`, `content/vex/style.css`
- Create: `content/vex/js/scene/style.js`, `field.js`, `robot.js`, `camera-rig.js`, `overlay.js`
- Create: `content/vex/js/story.js`, `content/vex/js/chapters/index.js`, `content/vex/js/main.js`
- Create: `playwright.config.js`, `tests/e2e/vex.spec.js`

**Interfaces:**
- Consumes: `ROBOT`, `planSteps`.
- Produces (scene): `COLORS`, `matte(color, extra)`, `outlineOf(mesh)`, `outlinedBox(size, color, position)`, `addLights(scene)`; `FIELD_SIZE = 144`, `buildField() → { root, parts }`, `toScene([x,y], up)`; `buildRobot(cfg) → { root, parts: { chassis, driveWheels[4], trackingWheels {left,right,strafe}, imu, distanceSensors {rear,left}, headingArrow } }`, `placeRobot(root, pose)`, `spinWheels(parts, cfg, motion, readings)`, `setXray(parts, amount)`, `setShading(root, amount)`.
- Produces (camera): `createCameraRig(aspect) → { perspective, ortho, state {mode, orbitAngle, topdown, focus}, resize(w,h), update(), active(), isTopdown(), setMode(m), set(vars), setFocus([x,y]) }`, `overheadExtent(aspect)`.
- Produces (overlay): `createOverlay(canvas) → { resize(w,h,dpr), draw(camera, primitives, alpha), clear(), project(camera,[x,y]), scale(camera) }`. Primitive types: `polyline, polygon, circle, dot, arc, ray, dimension, label` (fields documented in the code).
- Produces (story): `createStory(chapters, ctx, root = document) → { active(), refresh(), destroy() }`. A chapter is `{ id, beats, setup(ctx), progress(p), frame?(), overlay?() → primitives[], teardown() }` and its `<section id="chapter-<id>">` must contain exactly `beats` elements with class `beat`.
- Produces (boot): `window.__vex` = ctx `{ scene, field, robot, camera, overlay, cfg, reducedMotion, story, stage, ui }` or `null` without WebGL.

- [ ] **Step 1: Write the failing E2E test** — `playwright.config.js`

```js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  webServer: {
    command: 'npx http-server content -p 8766 -s -c-1',
    url: 'http://127.0.0.1:8766/vex/',
    reuseExistingServer: true,
  },
  use: { baseURL: 'http://127.0.0.1:8766' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
```

`tests/e2e/vex.spec.js`:

```js
import { test, expect } from '@playwright/test';

test('the page loads with a 3D canvas and no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await expect(page.locator('#three')).toBeVisible();
  await expect(page.locator('#stage-notice')).toBeHidden();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__vex !== null)).toBe(true);
});

test('without WebGL the notice shows and the page still renders', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(type, ...rest) {
      return type === 'webgl' || type === 'webgl2' ? null : original.call(this, type, ...rest);
    };
  });
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await expect(page.locator('#stage-notice')).toBeVisible();
});

test('no horizontal scrolling at any viewport', async ({ page }) => {
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright install chromium` (once per machine), then `npm run test:e2e`
Expected: FAIL — `/vex/` returns 404.

- [ ] **Step 3: Create `content/vex/index.html`** (the chapter section is added in Task 11; `<main>` is empty for now)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>How a VEX robot knows where it is</title>
  <link rel="canonical" href="https://coleuhlig.com/vex/">
  <script src="/js/canonical-host.js"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.9/dist/katex.min.css">
  <link rel="stylesheet" href="style.css">
  <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/",
        "gsap": "https://cdn.jsdelivr.net/npm/gsap@3.15.0/index.js",
        "gsap/ScrollTrigger": "https://cdn.jsdelivr.net/npm/gsap@3.15.0/ScrollTrigger.js",
        "katex": "https://cdn.jsdelivr.net/npm/katex@0.18.9/dist/katex.mjs"
      }
    }
  </script>
</head>
<body>
  <div class="stage" id="stage">
    <canvas id="three"></canvas>
    <canvas id="overlay"></canvas>
    <p class="stage-notice" id="stage-notice" hidden>The 3D view needs WebGL, which this browser doesn't provide. The text still works.</p>
  </div>
  <main class="story" id="story">
  </main>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Create `content/vex/style.css`**

```css
:root {
  --bg: #0b1020;
  --bg-panel: #111a2e;
  --text: #e6ecf5;
  --muted: #8b98b3;
  --truth: rgba(255, 255, 255, 0.55);
  --estimate: #3be3ff;
  --target: #ffb347;
  --error: #ff5c6c;
  --construct: #ff4fd8;
  --stage-height: 50vh;
}
* { box-sizing: border-box; }
html { scroll-behavior: auto; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.stage {
  position: fixed;
  top: 0;
  right: 0;
  width: 60vw;
  height: 100vh;
  background: var(--bg);
}
.stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
#overlay { pointer-events: none; }
.stage-notice { position: absolute; inset: auto 16px 16px; color: var(--muted); }
.story { width: 40vw; padding: 0 32px 0 16px; }
.chapter { min-height: 100vh; padding: 12vh 0; }
.beat { min-height: 70vh; display: flex; flex-direction: column; justify-content: center; }
.beat h1, .beat h2 { margin: 0 0 12px; line-height: 1.2; }
.beat p { margin: 0 0 12px; }
.beat .formula { margin: 12px 0; font-size: 1.15em; overflow-x: auto; }
.tryit { background: var(--bg-panel); border-radius: 12px; padding: 16px; margin-top: 16px; }
.tryit label { display: block; margin: 8px 0; color: var(--muted); }
.tryit input[type="range"] { width: 100%; }
.readout { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--estimate); }
.credit { color: var(--muted); font-size: 0.9em; margin-top: 24px; }
.credit a { color: var(--text); }
.t-truth { color: var(--truth); }
.t-estimate { color: var(--estimate); }
.t-target { color: var(--target); }
.t-error { color: var(--error); }
.t-construct { color: var(--construct); }
@media (max-width: 900px) {
  .stage { width: 100vw; height: var(--stage-height); }
  .story { width: 100vw; padding: calc(var(--stage-height) + 16px) 16px 0; }
  .chapter { min-height: auto; padding: 4vh 0; }
  .beat { min-height: 60vh; }
}
```

- [ ] **Step 5: Create `content/vex/js/scene/style.js`**

```js
import * as THREE from 'three';

// The page's look: matte surfaces with crisp edge outlines, like a clean CAD render.
// Colors mirror the CSS tokens in style.css so 3D and 2D layers match.

export const COLORS = Object.freeze({
  bg: 0x0b1020,
  tile: 0x1b2540,
  tileAlt: 0x202c4c,
  wall: 0x2c3a5e,
  chassis: 0x3a4a6e,
  wheel: 0x1a2136,
  outline: 0x9fb4d8,
  estimate: 0x3be3ff,
  target: 0xffb347,
  construct: 0xff4fd8,
});

export const matte = (color, extra = {}) =>
  new THREE.MeshLambertMaterial({ color, ...extra });

/** Returns a mesh's outline as thin line segments (edges sharper than 30°). */
export function outlineOf(mesh, color = COLORS.outline) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 30);
  const lines = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color, transparent: true }));
  lines.name = 'outline';
  return lines;
}

/** A box mesh with its outline attached, positioned by its center. */
export function outlinedBox(size, color, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), matte(color));
  mesh.position.set(...position);
  mesh.add(outlineOf(mesh));
  return mesh;
}

export function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x0b1020, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(60, 140, 90);
  scene.add(key);
}
```

- [ ] **Step 6: Create `content/vex/js/scene/field.js`**

```js
import * as THREE from 'three';
import { COLORS, matte, outlineOf } from './style.js';

// A generic V5 field: 6×6 foam tiles of 24", a 12" wall around the edge. Built from simple shapes.
// Scene axes: field x → scene x, field y → scene −z (so +y is "away from the driver"), up is scene y.

export const FIELD_SIZE = 144; // inches
export const TILE = 24;
export const WALL_HEIGHT = 12;
const WALL_THICKNESS = 1;

/** Converts a field-frame point [x, y] (inches) to a scene Vector3 at height `up`. */
export const toScene = ([x, y], up = 0) => new THREE.Vector3(x, up, -y);

export function buildField() {
  const root = new THREE.Group();
  root.name = 'field';
  const half = FIELD_SIZE / 2;

  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(TILE, 0.5, TILE),
        matte((row + col) % 2 === 0 ? COLORS.tile : COLORS.tileAlt),
      );
      tile.position.set(-half + TILE / 2 + col * TILE, -0.25, -half + TILE / 2 + row * TILE);
      root.add(tile);
    }
  }

  const grid = new THREE.GridHelper(FIELD_SIZE, 6, COLORS.outline, COLORS.outline);
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  grid.position.y = 0.01;
  root.add(grid);

  const wallSpecs = [
    [[FIELD_SIZE + 2, WALL_HEIGHT, WALL_THICKNESS], [0, WALL_HEIGHT / 2, -half - 0.5]],
    [[FIELD_SIZE + 2, WALL_HEIGHT, WALL_THICKNESS], [0, WALL_HEIGHT / 2, half + 0.5]],
    [[WALL_THICKNESS, WALL_HEIGHT, FIELD_SIZE], [-half - 0.5, WALL_HEIGHT / 2, 0]],
    [[WALL_THICKNESS, WALL_HEIGHT, FIELD_SIZE], [half + 0.5, WALL_HEIGHT / 2, 0]],
  ];
  for (const [size, position] of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), matte(COLORS.wall, { transparent: true, opacity: 0.85 }));
    wall.position.set(...position);
    wall.add(outlineOf(wall));
    root.add(wall);
  }

  return { root, parts: { walls: root.children.slice(-4) } };
}
```

- [ ] **Step 7: Create `content/vex/js/scene/robot.js`**

```js
import * as THREE from 'three';
import { COLORS, matte, outlinedBox, outlineOf } from './style.js';

// A procedural robot built from the shared robot config. Every part the chapters point at is a
// named object in `parts`, so a future CAD model only has to provide the same names.

const WHEEL_SEGMENTS = 24;

function wheel(diameter, width, color = COLORS.wheel) {
  const geometry = new THREE.CylinderGeometry(diameter / 2, diameter / 2, width, WHEEL_SEGMENTS);
  geometry.rotateZ(Math.PI / 2); // axle along x
  const mesh = new THREE.Mesh(geometry, matte(color));
  mesh.add(outlineOf(mesh));
  return mesh;
}

// robot frame [x (right), y (forward)] at height `up` → local scene position
const local = (x, y, up) => new THREE.Vector3(x, up, -y);

export function buildRobot(cfg) {
  const root = new THREE.Group();
  root.name = 'robot';
  const { chassis, driveWheel, trackWidth, tracking } = cfg;
  const wheelRadius = driveWheel.diameter / 2;

  const body = outlinedBox([chassis.width, chassis.height, chassis.length], COLORS.chassis, [0, wheelRadius + 0.5, 0]);
  body.material.transparent = true;
  body.name = 'chassis';
  root.add(body);

  const driveWheels = [];
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const w = wheel(driveWheel.diameter, driveWheel.width);
      w.position.copy(local(side * trackWidth / 2, end * driveWheel.wheelbase / 2, wheelRadius));
      w.name = `driveWheel_${side < 0 ? 'left' : 'right'}_${end < 0 ? 'rear' : 'front'}`;
      driveWheels.push(w);
      root.add(w);
    }
  }

  const trackingRadius = tracking.diameter / 2;
  const left = wheel(tracking.diameter, 0.5, 0x304a7a);
  left.position.copy(local(-tracking.sL, 0, trackingRadius));
  const right = wheel(tracking.diameter, 0.5, 0x304a7a);
  right.position.copy(local(tracking.sR, 0, trackingRadius));
  const strafe = wheel(tracking.diameter, 0.5, 0x304a7a);
  strafe.rotateY(Math.PI / 2); // rolls sideways
  strafe.position.copy(local(0, -tracking.sS, trackingRadius));
  for (const [name, w] of Object.entries({ left, right, strafe })) {
    w.name = `trackingWheel_${name}`;
    root.add(w);
  }

  const imu = outlinedBox([1.2, 0.5, 1.2], COLORS.target, [cfg.imu.x, wheelRadius + chassis.height + 0.8, -cfg.imu.y]);
  imu.name = 'imu';
  root.add(imu);

  const sensors = {};
  for (const [name, mount] of Object.entries(cfg.distanceSensors)) {
    const s = outlinedBox([1.5, 1, 0.6], COLORS.estimate, [mount.x, wheelRadius + 1.5, -mount.y]);
    s.rotation.y = -mount.heading;
    s.name = `distanceSensor_${name}`;
    sensors[name] = s;
    root.add(s);
  }

  const heading = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), local(0, 0, wheelRadius + chassis.height + 1.2), chassis.length / 2, COLORS.estimate, 3, 2);
  heading.name = 'headingArrow';
  root.add(heading);

  return {
    root,
    parts: {
      chassis: body,
      driveWheels,
      trackingWheels: { left, right, strafe },
      imu,
      distanceSensors: sensors,
      headingArrow: heading,
    },
  };
}

/** Moves the model to a field pose { x, y, theta } (compass heading, clockwise +). */
export function placeRobot(root, pose) {
  root.position.set(pose.x, 0, -pose.y);
  root.rotation.y = -pose.theta;
}

/** Spins wheels by the distance each travelled this tick (inches). */
export function spinWheels(parts, cfg, motion, readings) {
  const driveTurn = (d) => d / (cfg.driveWheel.diameter / 2);
  const trackTurn = (d) => d / (cfg.tracking.diameter / 2);
  parts.driveWheels[0].rotation.x -= driveTurn(motion.motorL); // left rear
  parts.driveWheels[1].rotation.x -= driveTurn(motion.motorL); // left front
  parts.driveWheels[2].rotation.x -= driveTurn(motion.motorR);
  parts.driveWheels[3].rotation.x -= driveTurn(motion.motorR);
  parts.trackingWheels.left.rotation.x -= trackTurn(readings.dL);
  parts.trackingWheels.right.rotation.x -= trackTurn(readings.dR);
  parts.trackingWheels.strafe.rotation.z -= trackTurn(readings.dS);
}

/** 0 = solid, 1 = fully see-through (outlines stay). */
export function setXray(parts, amount) {
  parts.chassis.material.opacity = 1 - amount * 0.85;
}

/** Fades the shaded surfaces of everything under `root`, leaving outlines, for the flatten beat. */
export function setShading(root, amount) {
  root.traverse((obj) => {
    if (obj.isMesh && obj.name !== 'outline') {
      obj.material.transparent = true;
      obj.material.opacity = amount * (obj.userData.baseOpacity ?? 1);
      obj.visible = amount > 0.02;
    }
  });
}
```

(Three.js scene objects are mutated in place — that is how Three.js works and is the one place the immutability rule does not apply. All *simulation* state stays immutable.)

- [ ] **Step 8: Create `content/vex/js/scene/camera-rig.js`**

```js
import * as THREE from 'three';
import { FIELD_SIZE } from './field.js';

// One camera rig with three framings: orbiting the whole field, close on the robot, or straight
// overhead. State is set directly by the chapters as the reader scrolls (no tweens). The overhead
// move is a dolly-zoom: the perspective camera rises while its field of view narrows to almost
// nothing, which looks orthographic, and at the end the true orthographic camera takes over so 2D
// overlays project exactly.

const ORBIT_RADIUS = 190;
const ORBIT_HEIGHT = 120;
const CLOSE_RADIUS = 40;
const CLOSE_HEIGHT = 22;
const WIDE_FOV = 40;
const NARROW_FOV = 2;

const FIELD_MARGIN = 1.08;

/** Half the field-plane extent the overhead view shows: [horizontal, vertical], inches. */
export function overheadExtent(aspect) {
  const base = (FIELD_SIZE / 2) * FIELD_MARGIN;
  return aspect >= 1 ? [base * aspect, base] : [base, base / aspect];
}

export function createCameraRig(aspect) {
  const perspective = new THREE.PerspectiveCamera(WIDE_FOV, aspect, 1, 12000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  ortho.up.set(0, 0, -1);

  const state = { mode: 'orbit', orbitAngle: 0.6, topdown: 0, focus: new THREE.Vector3() };
  let aspectNow = aspect;

  function resize(width, height) {
    aspectNow = width / height;
    perspective.aspect = aspectNow;
    perspective.updateProjectionMatrix();
    const [hx, hy] = overheadExtent(aspectNow);
    ortho.left = -hx; ortho.right = hx; ortho.top = hy; ortho.bottom = -hy;
    ortho.updateProjectionMatrix();
  }

  function framingPosition() {
    const { mode, orbitAngle, focus } = state;
    if (mode === 'close') {
      return new THREE.Vector3(focus.x + Math.sin(orbitAngle) * CLOSE_RADIUS, CLOSE_HEIGHT, focus.z + Math.cos(orbitAngle) * CLOSE_RADIUS);
    }
    return new THREE.Vector3(Math.sin(orbitAngle) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.cos(orbitAngle) * ORBIT_RADIUS);
  }

  function update() {
    const t = state.topdown;
    const fov = THREE.MathUtils.lerp(WIDE_FOV, NARROW_FOV, t);
    perspective.fov = fov;
    perspective.updateProjectionMatrix();
    // Height at which this FOV shows the same span the orthographic camera shows.
    const overheadHeight = overheadExtent(aspectNow)[1] / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const overhead = new THREE.Vector3(state.focus.x, overheadHeight, state.focus.z + 0.001);
    perspective.position.copy(framingPosition()).lerp(overhead, t);
    perspective.up.set(0, 1, 0);
    perspective.lookAt(state.focus);

    ortho.position.set(state.focus.x, 500, state.focus.z);
    ortho.lookAt(state.focus.x, 0, state.focus.z);
  }

  return {
    perspective,
    ortho,
    state,
    resize,
    update,
    /** The camera to render with this frame. */
    active: () => (state.topdown >= 0.999 ? ortho : perspective),
    isTopdown: () => state.topdown >= 0.999,
    setMode(mode) { state.mode = mode; },
    /** Beats are scroll-scrubbed, so every camera change is an instant state change. */
    set(vars) { Object.assign(state, vars); },
    setFocus: ([x, y]) => state.focus.set(x, 0, -y),
  };
}
```

- [ ] **Step 9: Create `content/vex/js/scene/overlay.js`**

```js
import * as THREE from 'three';

// A 2D canvas drawn over the 3D view. Field-frame points are projected through the active camera,
// so everything lines up with the field once the camera is overhead. Chapters call `draw` with a
// list of primitives every frame; the overlay owns no state of its own.

const COLORS = Object.freeze({
  truth: 'rgba(255,255,255,0.55)',
  estimate: '#3be3ff',
  target: '#ffb347',
  error: '#ff5c6c',
  construct: '#ff4fd8',
  muted: '#8b98b3',
});

export function createOverlay(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize(w, h, ratio) {
    width = w; height = h; dpr = ratio;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  /** Field [x, y] → canvas pixel [px, py] for the given camera. */
  function project(camera, [x, y]) {
    const v = new THREE.Vector3(x, 0, -y).project(camera);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
  }

  /** Pixels per inch at the field plane (top-down only). */
  function scale(camera) {
    const a = project(camera, [0, 0]);
    const b = project(camera, [10, 0]);
    return Math.hypot(b[0] - a[0], b[1] - a[1]) / 10;
  }

  const color = (name) => COLORS[name] ?? name;

  const painters = {
    polyline(cam, p) {
      if (p.points.length < 2) return;
      ctx.beginPath();
      p.points.forEach((pt, i) => { const [px, py] = project(cam, pt); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.strokeStyle = color(p.color); ctx.lineWidth = p.width ?? 2; ctx.setLineDash(p.dash ?? []);
      if (p.close) ctx.closePath();
      ctx.stroke();
      if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
    },
    polygon(cam, p) { painters.polyline(cam, { ...p, close: true, fill: p.fill }); },
    circle(cam, p) {
      const [px, py] = project(cam, p.center);
      ctx.beginPath(); ctx.arc(px, py, p.radius * scale(cam), 0, Math.PI * 2);
      ctx.strokeStyle = color(p.color); ctx.lineWidth = p.width ?? 1.5; ctx.setLineDash(p.dash ?? []); ctx.stroke();
      if (p.fill) { ctx.fillStyle = color(p.fill); ctx.fill(); }
    },
    dot(cam, p) {
      const [px, py] = project(cam, p.at);
      ctx.beginPath(); ctx.arc(px, py, p.radius ?? 4, 0, Math.PI * 2);
      ctx.fillStyle = color(p.color); ctx.fill();
    },
    // Arc of a circle between two compass angles (clockwise from `from` to `to`).
    arc(cam, p) {
      const [px, py] = project(cam, p.center);
      const r = p.radius * scale(cam);
      // compass angle a → canvas angle: canvas 0 is +x, clockwise positive (y down). compass 0 is up.
      const toCanvas = (a) => a - Math.PI / 2;
      ctx.beginPath(); ctx.arc(px, py, r, toCanvas(p.from), toCanvas(p.to), p.to < p.from);
      ctx.strokeStyle = color(p.color); ctx.lineWidth = p.width ?? 2; ctx.setLineDash(p.dash ?? []); ctx.stroke();
    },
    ray(cam, p) {
      const [ax, ay] = project(cam, p.from);
      const [bx, by] = project(cam, p.to);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      ctx.strokeStyle = color(p.color); ctx.lineWidth = p.width ?? 2; ctx.setLineDash(p.dash ?? []); ctx.stroke();
      if (p.arrow) {
        const ang = Math.atan2(by - ay, bx - ax);
        ctx.beginPath(); ctx.moveTo(bx, by);
        ctx.lineTo(bx - 10 * Math.cos(ang - 0.4), by - 10 * Math.sin(ang - 0.4));
        ctx.lineTo(bx - 10 * Math.cos(ang + 0.4), by - 10 * Math.sin(ang + 0.4));
        ctx.closePath(); ctx.fillStyle = color(p.color); ctx.fill();
      }
    },
    // Dimension line with perpendicular end ticks and a label (in the middle, or at the end).
    dimension(cam, p) {
      painters.ray(cam, { from: p.from, to: p.to, color: p.color ?? 'muted', width: 1 });
      const [ax, ay] = project(cam, p.from); const [bx, by] = project(cam, p.to);
      const ang = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
      for (const [x, y] of [[ax, ay], [bx, by]]) {
        ctx.beginPath(); ctx.moveTo(x - 5 * Math.cos(ang), y - 5 * Math.sin(ang)); ctx.lineTo(x + 5 * Math.cos(ang), y + 5 * Math.sin(ang)); ctx.stroke();
      }
      const at = p.labelAt === 'end' ? p.to : [(p.from[0] + p.to[0]) / 2, (p.from[1] + p.to[1]) / 2];
      painters.label(cam, { at, text: p.text, color: p.color ?? 'muted', offset: p.offset ?? [0, -10] });
    },
    label(cam, p) {
      const [px, py] = project(cam, p.at);
      const [ox, oy] = p.offset ?? [8, -8];
      ctx.font = `${p.size ?? 13}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = color(p.color); ctx.textAlign = p.align ?? 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(p.text, px + ox, py + oy);
    },
  };

  function draw(camera, primitives, alpha = 1) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = alpha;
    for (const p of primitives) {
      const paint = painters[p.type];
      if (!paint) throw new Error(`Unknown overlay primitive: ${p.type}`);
      paint(camera, p);
    }
    ctx.globalAlpha = 1;
  }

  function clear() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height); }

  return { resize, draw, clear, project, scale };
}
```

- [ ] **Step 10: Create `content/vex/js/story.js`**

```js
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Maps scroll position to chapters. Each chapter is a <section class="chapter"> holding one
// <div class="beat"> per beat. Exactly one chapter is set up at a time. Every beat element gets its
// own trigger, so the drawing always matches the text beside it: while beat k is in the middle of
// the screen, chapter.progress(k + local) runs with local going 0 → 1 as the beat passes.

gsap.registerPlugin(ScrollTrigger);

const BEAT_START = 'top 65%';
const BEAT_END = 'bottom 35%';

export function createStory(chapters, ctx, root = document) {
  let active = null;
  let lastProgress = new Map();

  function activate(chapter) {
    if (active === chapter) return;
    if (active) active.teardown();
    active = chapter;
    chapter.setup(ctx);
    chapter.progress(lastProgress.get(chapter) ?? 0);
  }

  const triggers = [];
  for (const chapter of chapters) {
    const section = root.querySelector(`#chapter-${chapter.id}`);
    if (!section) throw new Error(`Missing section #chapter-${chapter.id}`);
    const beats = [...section.querySelectorAll('.beat')];
    if (beats.length !== chapter.beats) {
      throw new Error(`Chapter ${chapter.id} declares ${chapter.beats} beats but has ${beats.length} .beat elements`);
    }
    triggers.push(ScrollTrigger.create({
      trigger: section,
      start: 'top 90%',
      end: 'bottom 10%',
      onToggle: (self) => { if (self.isActive) activate(chapter); },
    }));
    beats.forEach((beat, k) => {
      triggers.push(ScrollTrigger.create({
        trigger: beat,
        start: BEAT_START,
        end: BEAT_END,
        onUpdate: (self) => {
          const p = k + self.progress;
          lastProgress.set(chapter, p);
          if (active === chapter) chapter.progress(p);
        },
      }));
    });
  }

  if (!active && chapters.length > 0) activate(chapters[0]);

  return {
    active: () => active,
    refresh: () => ScrollTrigger.refresh(),
    destroy: () => { triggers.forEach((t) => t.kill()); if (active) active.teardown(); active = null; },
  };
}
```

- [ ] **Step 11: Create `content/vex/js/chapters/index.js`** (filled in Task 11)

```js
export const CHAPTERS = [];
```

- [ ] **Step 12: Create `content/vex/js/main.js`**

```js
import * as THREE from 'three';
import { ROBOT } from './core/robot-config.js';
import { planSteps } from './core/sim.js';
import { addLights, COLORS } from './scene/style.js';
import { buildField } from './scene/field.js';
import { buildRobot } from './scene/robot.js';
import { createCameraRig } from './scene/camera-rig.js';
import { createOverlay } from './scene/overlay.js';
import { createStory } from './story.js';
import { CHAPTERS } from './chapters/index.js';

const MAX_PIXEL_RATIO = 2;

function webglAvailable() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

function boot() {
  const stage = document.getElementById('stage');
  const threeCanvas = document.getElementById('three');
  const overlayCanvas = document.getElementById('overlay');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!webglAvailable()) {
    document.getElementById('stage-notice').hidden = false;
    threeCanvas.hidden = true;
    return null;
  }

  const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true });
  renderer.setClearColor(COLORS.bg, 1);
  const scene = new THREE.Scene();
  addLights(scene);
  const field = buildField();
  const robot = buildRobot(ROBOT);
  scene.add(field.root, robot.root);
  const camera = createCameraRig(1);
  const overlay = createOverlay(overlayCanvas);

  function resize() {
    const { clientWidth: w, clientHeight: h } = stage;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.resize(w, h);
    overlay.resize(w, h, dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  const ctx = { scene, field, robot, camera, overlay, cfg: ROBOT, reducedMotion, story: null, stage, ui: document.getElementById('story') };
  const story = createStory(CHAPTERS, ctx);
  ctx.story = story;

  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    const elapsed = (now - last) / 1000;
    last = now;
    const chapter = story.active();
    if (chapter?.frame) {
      const plan = planSteps(accumulator, elapsed);
      accumulator = plan.accumulator;
      for (let i = 0; i < plan.steps; i += 1) chapter.frame();
    }
    camera.update();
    renderer.render(scene, camera.active());
    const primitives = chapter?.overlay?.() ?? [];
    if (camera.isTopdown()) overlay.draw(camera.active(), primitives); else overlay.clear();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return ctx;
}

window.__vex = boot();
```

- [ ] **Step 13: Run the E2E test to verify it passes**

Run: `npm run test:e2e`
Expected: 6 passed (3 tests × desktop + mobile). Also open `npm run serve` → `http://127.0.0.1:8766/vex/` in a browser and confirm: dark field with 6×6 tiles and walls, a small robot with a cyan heading arrow at the centre, seen from a raised orbit angle.

- [ ] **Step 14: Commit**

```bash
git add content/vex playwright.config.js tests/e2e/vex.spec.js
git commit -m "feat: add VEX explainer page shell with 3D field, robot, overlay and scroll engine"
```

---

### Task 9: Odometry chapter drawing (pure)

**Files:**
- Create: `content/vex/js/chapters/odometry/script.js`, `content/vex/js/chapters/odometry/beats.js`
- Test: `tests/vex/beats.test.js`
- Modify: `package.json` (add coverage includes)

**Interfaces:**
- Consumes: geometry helpers, `chassisCorners`, `trackingWheelPoints`, `runScript` (tests only).
- Produces: `S_CURVE` script, `START_POSE`; `robotDiagram(pose, cfg, { dimensions?, rightForward? })`, `truthGhost(pose, cfg)`, `trails(frames, { truth?, estimate? })`, `tickArc(debug, exaggerate = 1)`, `frameAxes(debug, len = 12)`, `errorLink(truth, estimate)` — all return overlay primitive arrays (Task 8 overlay types).

- [ ] **Step 1: Extend coverage in `package.json`** — replace the `test` script with:

```json
"test": "node --test --experimental-test-coverage --test-coverage-include='content/vex/js/core/**' --test-coverage-include='content/vex/js/input/**' --test-coverage-include='content/vex/js/chapters/**/beats.js' 'tests/vex/**/*.test.js'",
```

- [ ] **Step 2: Write the failing test** — `tests/vex/beats.test.js`

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT } from '../../content/vex/js/core/robot-config.js';
import { runScript } from '../../content/vex/js/core/sim.js';
import { robotDiagram, truthGhost, trails, tickArc, frameAxes, errorLink } from '../../content/vex/js/chapters/odometry/beats.js';

const pose = { x: 10, y: -20, theta: 0.4 };
const types = (prims) => prims.map((p) => p.type);

test('robotDiagram draws the chassis, three wheels and the centre, plus dimensions on request', () => {
  const plain = robotDiagram(pose, ROBOT);
  assert.deepEqual(types(plain), ['polygon', 'ray', 'ray', 'ray', 'dot']);
  const dims = robotDiagram(pose, ROBOT, { dimensions: true });
  assert.equal(dims.filter((p) => p.type === 'dimension').length, 3);
  assert.ok(dims.some((p) => p.text === `s_L = ${ROBOT.tracking.sL}"`));
});

test('truthGhost is a dashed polygon in the truth colour', () => {
  const [g] = truthGhost(pose, ROBOT);
  assert.equal(g.type, 'polygon'); assert.equal(g.color, 'truth'); assert.deepEqual(g.dash, [4, 4]);
});

test('trails follow the requested poses', () => {
  const frames = [{ truth: { x: 0, y: 0 }, estimate: { x: 1, y: 1 } }, { truth: { x: 2, y: 0 }, estimate: { x: 3, y: 1 } }];
  const both = trails(frames, { truth: true, estimate: true });
  assert.equal(both.length, 2);
  assert.deepEqual(both[1].points, [[1, 1], [3, 1]]);
  assert.equal(trails(frames).length, 1);
});

test('tickArc draws nothing for a straight tick and a full construction for a turning one', () => {
  assert.deepEqual(tickArc({ center: null }), []);
  const frames = runScript([{ duration: 1, left: 1, right: 0.5 }], { cfg: ROBOT });
  const prims = tickArc(frames.at(-1).debug, 40);
  assert.ok(types(prims).includes('arc'));
  const chord = prims.find((p) => p.type === 'ray' && p.arrow);
  assert.ok(chord, 'chord arrow present');
  const start = frames.at(-1).debug.start;
  assert.deepEqual(chord.from, [start.x, start.y]);
});

test('frameAxes labels the rotation angle in degrees', () => {
  const frames = runScript([{ duration: 1, left: 1, right: 0.5 }], { cfg: ROBOT });
  const prims = frameAxes(frames.at(-1).debug);
  const label = prims.find((p) => p.type === 'label' && p.text.startsWith('θ + Δθ/2'));
  assert.ok(label);
  assert.match(label.text, /°$/);
});

test('errorLink reports the distance between truth and estimate', () => {
  const [ray, label] = errorLink({ x: 0, y: 0 }, { x: 3, y: 4 });
  assert.equal(ray.type, 'ray'); assert.equal(ray.color, 'error');
  assert.equal(label.text, '5.0" off');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `beats.js`.

- [ ] **Step 4: Create `content/vex/js/chapters/odometry/script.js`**

```js
// The S-curve the robot drives in chapter 1: { duration (s), left, right } motor commands.
export const S_CURVE = Object.freeze([
  { duration: 1.2, left: 0.9, right: 0.9 },
  { duration: 1.6, left: 0.95, right: 0.55 },
  { duration: 1.0, left: 0.85, right: 0.85 },
  { duration: 1.8, left: 0.5, right: 0.95 },
  { duration: 1.2, left: 0.8, right: 0.8 },
]);

export const START_POSE = Object.freeze({ x: -48, y: -48, theta: 0 });
```

- [ ] **Step 5: Create `content/vex/js/chapters/odometry/beats.js`**

```js
import { degrees, pointOnCircle, angleTo, headingVector, add, scale, sub } from '../../core/geometry.js';
import { chassisCorners, trackingWheelPoints } from '../../core/robot-geometry.js';

// Overlay primitives for the odometry chapter's top-down beats. Pure: frames in, drawing out.

const trailPoints = (frames, key) => frames.map((f) => [f[key].x, f[key].y]);

export function robotDiagram(pose, cfg, opts = {}) {
  const wheels = trackingWheelPoints(pose, cfg, opts.rightForward ?? 0);
  const { sL, sR, sS } = cfg.tracking;
  const wheelLine = (center, along, len = cfg.tracking.diameter) => ({
    type: 'ray', from: add(center, scale(along, -len / 2)), to: add(center, scale(along, len / 2)), color: 'estimate', width: 3,
  });
  const fwd = headingVector(pose.theta);
  const right = headingVector(pose.theta + Math.PI / 2);
  const prims = [
    { type: 'polygon', points: chassisCorners(pose, cfg), color: 'estimate', width: 1.5 },
    wheelLine(wheels.left, fwd), wheelLine(wheels.right, fwd), wheelLine(wheels.strafe, right),
    { type: 'dot', at: wheels.center, color: 'estimate', radius: 3 },
  ];
  if (opts.dimensions) {
    prims.push(
      { type: 'dimension', from: wheels.center, to: wheels.left, text: `s_L = ${sL}"`, color: 'muted', labelAt: 'end', offset: [-64, 0] },
      { type: 'dimension', from: wheels.center, to: wheels.right, text: `s_R = ${sR}"`, color: 'muted', labelAt: 'end', offset: [12, 0] },
      { type: 'dimension', from: wheels.center, to: wheels.strafe, text: `s_S = ${sS}"`, color: 'muted', labelAt: 'end', offset: [-30, 18] },
    );
  }
  return prims;
}

export function truthGhost(pose, cfg) {
  return [{ type: 'polygon', points: chassisCorners(pose, cfg), color: 'truth', width: 1.5, dash: [4, 4] }];
}

export function trails(frames, { truth = false, estimate = true } = {}) {
  const out = [];
  if (truth) out.push({ type: 'polyline', points: trailPoints(frames, 'truth'), color: 'truth', width: 2, dash: [3, 5] });
  if (estimate) out.push({ type: 'polyline', points: trailPoints(frames, 'estimate'), color: 'estimate', width: 2 });
  return out;
}

/** One tick's arc: the instant center, radius, the arc itself, and the chord across it. */
export function tickArc(debug, exaggerate = 1) {
  if (!debug.center) return [];
  const { start, center, dTheta, radius, globalDelta } = debug;
  const from = [start.x, start.y];
  const end = add(from, scale(globalDelta, exaggerate));
  const a0 = angleTo(center, from);
  const a1 = a0 + dTheta * exaggerate;
  const r = Math.abs(radius);
  return [
    { type: 'ray', from: center, to: from, color: 'construct', width: 1, dash: [4, 4] },
    { type: 'ray', from: center, to: pointOnCircle(center, r, a1), color: 'construct', width: 1, dash: [4, 4] },
    { type: 'dot', at: center, color: 'construct', radius: 4 },
    { type: 'label', at: center, text: 'center', color: 'construct' },
    { type: 'arc', center, radius: r, from: a0, to: a1, color: 'construct', width: 3 },
    { type: 'ray', from, to: end, color: 'target', width: 2.5, arrow: true },
    { type: 'label', at: end, text: 'chord', color: 'target' },
    { type: 'label', at: center, text: `r = ${radius.toFixed(1)}"`, color: 'construct', offset: [8, 12] },
  ];
}

/** Local and global axes at the robot, plus the chord rotated by θ + Δθ/2. */
export function frameAxes(debug, len = 12) {
  const { start, localChord, rotation } = debug;
  const o = [start.x, start.y];
  const local = (v) => add(o, scale(headingVector(start.theta + Math.atan2(v[0], v[1])), len));
  return [
    { type: 'ray', from: o, to: add(o, [len, 0]), color: 'muted', width: 1, arrow: true },
    { type: 'ray', from: o, to: add(o, [0, len]), color: 'muted', width: 1, arrow: true },
    { type: 'label', at: add(o, [len, 0]), text: 'field x', color: 'muted' },
    { type: 'label', at: add(o, [0, len]), text: 'field y', color: 'muted' },
    { type: 'ray', from: o, to: local([1, 0]), color: 'estimate', width: 1, arrow: true },
    { type: 'ray', from: o, to: local([0, 1]), color: 'estimate', width: 1, arrow: true },
    { type: 'label', at: local([0, 1]), text: 'robot fwd', color: 'estimate' },
    { type: 'arc', center: o, radius: len * 0.6, from: 0, to: rotation, color: 'construct', width: 2 },
    { type: 'label', at: pointOnCircle(o, len * 0.7, rotation / 2), text: `θ + Δθ/2 = ${degrees(rotation).toFixed(1)}°`, color: 'construct' },
  ];
}

export function errorLink(truth, estimate) {
  const a = [truth.x, truth.y]; const b = [estimate.x, estimate.y];
  const d = Math.hypot(...sub(a, b));
  return [
    { type: 'ray', from: a, to: b, color: 'error', width: 2 },
    { type: 'label', at: b, text: `${d.toFixed(1)}" off`, color: 'error', offset: [14, 22] },
  ];
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: `ℹ fail 0`.

- [ ] **Step 7: Commit**

```bash
git add package.json content/vex/js/chapters/odometry/script.js content/vex/js/chapters/odometry/beats.js tests/vex/beats.test.js
git commit -m "feat: add odometry chapter drawing primitives and demo script"
```

---

### Task 10: Drive input (keyboard, gamepad, touch drag)

**Files:**
- Create: `content/vex/js/input/drive-input.js`
- Test: `tests/vex/drive-input.test.js`

**Interfaces:**
- Produces: `createDriveInput(dragTarget, win = window) → { read() → { left, right }, setEnabled(bool), destroy() }`. Starts **disabled**: keys are ignored (and not `preventDefault`ed) until `setEnabled(true)`.

- [ ] **Step 1: Write the failing test** — `tests/vex/drive-input.test.js`

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `drive-input.js`.

- [ ] **Step 3: Implement** — `content/vex/js/input/drive-input.js`

```js
// Turns keyboard (WASD / arrows), the first connected gamepad, or a touch/mouse drag on the stage
// into tank-drive commands { left, right } in [-1, 1]. Call `read()` once per sim tick.

const KEYS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
});
const DRAG_RADIUS = 80; // px for full deflection

const arcade = (throttle, turn) => ({
  left: Math.max(-1, Math.min(1, throttle + turn)),
  right: Math.max(-1, Math.min(1, throttle - turn)),
});

export function createDriveInput(dragTarget, win = window) {
  const down = new Set();
  let drag = null; // { startX, startY, x, y }
  let enabled = false; // only capture keys while the try-it panel is on screen, so arrow keys still scroll elsewhere

  const onKey = (pressed) => (e) => {
    const known = Object.values(KEYS).some((codes) => codes.includes(e.code));
    if (!known || !enabled) return;
    e.preventDefault();
    pressed ? down.add(e.code) : down.delete(e.code);
  };
  const keydown = onKey(true);
  const keyup = onKey(false);
  const pointerdown = (e) => { drag = { startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY }; dragTarget.setPointerCapture?.(e.pointerId); };
  const pointermove = (e) => { if (drag) { drag = { ...drag, x: e.clientX, y: e.clientY }; } };
  const pointerup = () => { drag = null; };

  win.addEventListener('keydown', keydown);
  win.addEventListener('keyup', keyup);
  dragTarget.addEventListener('pointerdown', pointerdown);
  dragTarget.addEventListener('pointermove', pointermove);
  dragTarget.addEventListener('pointerup', pointerup);
  dragTarget.addEventListener('pointercancel', pointerup);

  const anyDown = (codes) => codes.some((c) => down.has(c));

  function setEnabled(on) {
    enabled = on;
    if (!on) { down.clear(); drag = null; }
  }

  function read() {
    if (!enabled) return { left: 0, right: 0 };
    if (drag) {
      const dx = (drag.x - drag.startX) / DRAG_RADIUS;
      const dy = (drag.startY - drag.y) / DRAG_RADIUS;
      return arcade(Math.max(-1, Math.min(1, dy)), Math.max(-1, Math.min(1, dx)));
    }
    const pad = win.navigator?.getGamepads?.()?.[0];
    if (pad && pad.axes.length >= 2 && (Math.abs(pad.axes[1]) > 0.1 || Math.abs(pad.axes[0]) > 0.1)) {
      return arcade(-pad.axes[1], pad.axes[0]);
    }
    const throttle = (anyDown(KEYS.forward) ? 1 : 0) - (anyDown(KEYS.back) ? 1 : 0);
    const turn = (anyDown(KEYS.right) ? 0.6 : 0) - (anyDown(KEYS.left) ? 0.6 : 0);
    return arcade(throttle, turn);
  }

  function destroy() {
    win.removeEventListener('keydown', keydown);
    win.removeEventListener('keyup', keyup);
    dragTarget.removeEventListener('pointerdown', pointerdown);
    dragTarget.removeEventListener('pointermove', pointermove);
    dragTarget.removeEventListener('pointerup', pointerup);
    dragTarget.removeEventListener('pointercancel', pointerup);
  }

  return { read, setEnabled, destroy };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: `ℹ fail 0`; coverage table lists `input/drive-input.js` (≥ 90%).

- [ ] **Step 5: Commit**

```bash
git add content/vex/js/input/drive-input.js tests/vex/drive-input.test.js
git commit -m "feat: add keyboard/gamepad/touch drive input"
```

---

### Task 11: Chapter 1 — odometry (beats, try-it panel, HTML) + full E2E

**Files:**
- Create: `content/vex/js/chapters/odometry/tryit.js`, `content/vex/js/chapters/odometry/chapter.js`
- Modify: `content/vex/js/chapters/index.js`, `content/vex/index.html` (fill `<main>`)
- Modify: `tests/e2e/vex.spec.js` (replace with the full suite)

**Interfaces:**
- Consumes: everything above.
- Produces: the chapter object `{ id: 'odometry', beats: 12, setup, progress, frame, overlay, teardown }`; `createTryIt(ctx, panelEl) → { tick(), overlay(), reset(), setActive(bool), destroy() }`.

- [ ] **Step 1: Replace `tests/e2e/vex.spec.js` with the full suite (failing until the chapter exists)**

```js
import { test, expect } from '@playwright/test';

test('the page loads with a 3D canvas and no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await expect(page.locator('#three')).toBeVisible();
  await expect(page.locator('#stage-notice')).toBeHidden();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__vex !== null)).toBe(true);
});

test('the explainer survives a full scroll through every beat in both directions', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/vex/', { waitUntil: 'networkidle' });

  const beats = page.locator('.beat');
  const count = await beats.count();
  expect(count).toBe(12);
  const order = [...Array(count).keys()];
  for (const i of [...order, ...order.reverse()]) {
    await page.evaluate((k) => document.querySelectorAll('.beat')[k].scrollIntoView({ block: 'center' }), i);
    await page.waitForTimeout(150);
    await expect(beats.nth(i).locator('h1, h2, h3').first()).toBeInViewport();
  }
  expect(errors).toEqual([]);
});

test('the odometry chapter is active on load', async ({ page }) => {
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  expect(await page.evaluate(() => window.__vex.story.active().id)).toBe('odometry');
});

test('the try-it panel drives the robot with the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#tryit-odometry').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const before = await page.textContent('#odom-readout');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  const after = await page.textContent('#odom-readout');
  expect(after).not.toBe(before);
});

test('changing the sensor setup resets the run', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#tryit-odometry').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const start = await page.textContent('#odom-readout');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  expect(await page.textContent('#odom-readout')).not.toBe(start);
  await page.selectOption('#odom-setup', 'twoWheelImu');
  await page.waitForTimeout(100);
  expect(await page.textContent('#odom-readout')).toBe(start);
});

test('without WebGL the notice shows and the story text is still readable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(type, ...rest) {
      return type === 'webgl' || type === 'webgl2' ? null : original.call(this, type, ...rest);
    };
  });
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await expect(page.locator('#stage-notice')).toBeVisible();
  await expect(page.locator('.beat h1').first()).toBeVisible();
});

test('resizing during a top-down beat keeps the canvases matched to the stage', async ({ page, isMobile }) => {
  test.skip(isMobile, 'viewport is fixed on the mobile project');
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelectorAll('.beat')[5].scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(300);
  const sizes = await page.evaluate(() => {
    const stage = document.getElementById('stage');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return { stage: [stage.clientWidth, stage.clientHeight], three: [document.getElementById('three').width, document.getElementById('three').height], overlay: [document.getElementById('overlay').width, document.getElementById('overlay').height], dpr };
  });
  expect(sizes.three).toEqual([Math.round(sizes.stage[0] * sizes.dpr), Math.round(sizes.stage[1] * sizes.dpr)]);
  expect(sizes.overlay).toEqual(sizes.three);
});

test('no horizontal scrolling at any viewport', async ({ page }) => {
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
```

- [ ] **Step 2: Run it to verify the new tests fail**

Run: `npm run test:e2e`
Expected: the scroll, active-chapter, try-it and setup-reset tests FAIL (no `.beat` elements / `story.active()` is null).

- [ ] **Step 3: Create `content/vex/js/chapters/odometry/tryit.js`**

```js
import { createRng } from '../../core/random.js';
import { createSim, stepSim } from '../../core/sim.js';
import { appendBounded } from '../../core/trail.js';
import { degrees, wrapAngle } from '../../core/geometry.js';
import { createDriveInput } from '../../input/drive-input.js';
import { placeRobot, spinWheels } from '../../scene/robot.js';
import * as draw from './beats.js';

// The live "drive it yourself" panel at the end of chapter 1.

const TRAIL_TICKS = 1500; // 15 s of history
const START = Object.freeze({ x: 0, y: -40, theta: 0 });

export function createTryIt(ctx, panel) {
  const noiseInput = panel.querySelector('#odom-noise');
  const setupInput = panel.querySelector('#odom-setup');
  const readout = panel.querySelector('#odom-readout');
  const input = createDriveInput(ctx.stage);
  const rng = createRng(7);
  let sim = createSim(START);
  let frames = [];
  let lastDebug = null;

  const reset = () => { sim = createSim(START); frames = []; lastDebug = null; };
  setupInput.addEventListener('change', reset);

  function tick() {
    const env = { setup: setupInput.value, noise: Number(noiseInput.value), slip: Number(noiseInput.value) > 0 ? 1 : 0 };
    const step = stepSim(sim, input.read(), env, ctx.cfg, rng);
    sim = step.sim;
    lastDebug = step.debug;
    frames = appendBounded(frames, { truth: sim.drive.pose, estimate: sim.estimate }, TRAIL_TICKS);
    placeRobot(ctx.robot.root, sim.drive.pose);
    spinWheels(ctx.robot.parts, ctx.cfg, step.motion, step.readings);
    const e = sim.estimate;
    readout.textContent = `x ${e.x.toFixed(1)}  y ${e.y.toFixed(1)}  θ ${degrees(wrapAngle(e.theta)).toFixed(1)}°`;
  }

  function overlay() {
    const f = frames.at(-1);
    if (!f) return [];
    return [
      ...draw.trails(frames, { truth: true }),
      ...draw.truthGhost(f.truth, ctx.cfg),
      ...draw.robotDiagram(f.estimate, ctx.cfg),
      ...(lastDebug ? draw.tickArc(lastDebug, 25) : []),
      ...(Number(noiseInput.value) > 0 ? draw.errorLink(f.truth, f.estimate) : []),
    ];
  }

  return {
    tick,
    overlay,
    reset,
    setActive: (on) => input.setEnabled(on),
    destroy: () => { input.destroy(); setupInput.removeEventListener('change', reset); },
  };
}
```

- [ ] **Step 4: Create `content/vex/js/chapters/odometry/chapter.js`**

```js
import katex from 'katex';
import { runScript } from '../../core/sim.js';
import { combineReadings, selectInputs, stepOdometry, stepStraightLine } from '../../core/odometry.js';
import { setXray, setShading, placeRobot } from '../../scene/robot.js';
import { S_CURVE, START_POSE } from './script.js';
import * as draw from './beats.js';
import { createTryIt } from './tryit.js';

// Chapter 1: odometry. Beats are scroll-scrubbed over precomputed runs; the "try it" panel at the
// end runs live. Beat order (0-based) matches the .beat elements in index.html:
// 0 opening orbit, 1 field off, 2 close-up/x-ray, 3 flatten, 4 heading from wheels, 5 one tick,
// 6 robot→field frame, 7 stacking ticks, 8 arcs vs straight lines, 9 sideways offset only,
// 10 the catch (drift), 11 try it.

const BEATS = 12; // 11 story beats + the try-it panel
const ARC_EXAGGERATION = 40; // one 10 ms tick is too small to see, so the geometry beats scale it up

function formulas(root) {
  const render = (selector, tex) => {
    const el = root.querySelector(selector);
    if (el) katex.render(tex, el, { throwOnError: false, displayMode: true });
  };
  render('#f-heading', String.raw`\Delta\theta = \frac{\Delta L - \Delta R}{s_L + s_R}`);
  render('#f-chord', String.raw`\Delta\vec d_{\text{local}} = 2\sin\frac{\Delta\theta}{2}\begin{bmatrix}\dfrac{\Delta S}{\Delta\theta} + s_S \\[8pt] \dfrac{\Delta R}{\Delta\theta} + s_R\end{bmatrix}`);
  render('#f-rotate', String.raw`\Delta\vec d_{\text{field}} = R\!\left(\theta + \tfrac{\Delta\theta}{2}\right)\,\Delta\vec d_{\text{local}}`);
}

export default {
  id: 'odometry',
  beats: BEATS,
  wikiUrl: 'https://wiki.purduesigbots.com/software/odometry',
  _ctx: null,
  _clean: null,
  _noisy: null,
  _view: { beat: 0, local: 0 },

  setup(ctx) {
    this._ctx = ctx;
    this._clean = runScript(S_CURVE, { cfg: ctx.cfg, pose: START_POSE, env: { setup: 'threeWheel', noise: 0, slip: 0 } });
    this._noisy = runScript(S_CURVE, { cfg: ctx.cfg, pose: START_POSE, env: { setup: 'threeWheel', noise: 3, slip: 1 } });
    ctx.camera.setMode('orbit');
    ctx.camera.set({ topdown: 0, orbitAngle: 0.6 });
    ctx.camera.setFocus([0, 0]);
    formulas(ctx.ui);
    placeRobot(ctx.robot.root, START_POSE);
    this._tryit = createTryIt(ctx, ctx.ui.querySelector('#tryit-odometry'));
  },

  progress(p) {
    const beat = Math.min(BEATS - 1, Math.floor(p));
    const local = p - beat;
    this._view = { beat, local };
    const { camera, robot } = this._ctx;
    const frames = this._clean;
    const at = (t) => frames[Math.min(frames.length - 1, Math.max(0, Math.floor(t * (frames.length - 1))))];

    // Camera + model state per beat (instant, so scrolling backwards works).
    const topdownBeats = beat >= 3;
    camera.set({ topdown: topdownBeats ? 1 : 0, orbitAngle: 0.6 + (beat <= 1 ? local * 0.6 : 0.6) });
    camera.setMode(beat === 2 ? 'close' : 'orbit');
    setXray(robot.parts, beat === 2 ? local : 0);
    setShading(robot.root, topdownBeats ? 0 : 1);
    this._ctx.field.root.visible = beat !== 1;

    this._live = beat === BEATS - 1;
    this._tryit.setActive(this._live);
    if (this._live) { camera.set({ topdown: 1 }); camera.setFocus([0, 0]); return; }
    const frame =
      beat <= 1 ? at(local) // drive the S-curve during the opening shot
      : beat === 2 ? at(0)
      : beat === 7 ? at(local) // stacking ticks
      : beat >= 9 ? this._noisy[Math.floor(local * (this._noisy.length - 1))]
      : at(0.35); // frozen mid-curve for the geometry beats
    placeRobot(robot.root, frame.truth);
    camera.setFocus(beat === 2 ? [frame.truth.x, frame.truth.y] : [0, 0]);
    this._frame = frame;
  },

  frame() {
    if (this._live) this._tryit.tick();
  },

  overlay() {
    const { beat, local } = this._view;
    if (this._live) return this._tryit.overlay();
    const { cfg } = this._ctx;
    const f = this._frame;
    if (!f || beat < 3) return [];
    const frames = this._clean;
    const mid = Math.floor(frames.length * 0.35);
    const base = draw.robotDiagram(f.estimate, cfg, { dimensions: beat === 3 || beat === 4 });
    switch (beat) {
      case 3: return base;
      case 4: return [...base, ...draw.tickArc(frames[mid].debug, ARC_EXAGGERATION)];
      case 5: return [...base, ...draw.tickArc(frames[mid].debug, ARC_EXAGGERATION)];
      case 6: return [...base, ...draw.frameAxes(frames[mid].debug)];
      case 7: return [...draw.trails(frames.slice(0, Math.floor(local * frames.length))), ...base];
      case 8: return [...draw.trails(frames), ...base, ...this._straightVsArc(local)];
      case 9: return [...base, ...draw.robotDiagram(f.estimate, cfg, { rightForward: Math.sin(local * Math.PI * 2) * 5 })];
      default: return [...draw.trails(this._noisy.slice(0, Math.floor(local * this._noisy.length)), { truth: true }), ...base, ...draw.truthGhost(f.truth, cfg), ...draw.errorLink(f.truth, f.estimate)];
    }
  },

  // Re-integrates the recorded readings at a coarser period with both methods.
  _straightVsArc(local) {
    const period = 1 + Math.round(local * 9); // 10 ms → 100 ms
    const { cfg } = this._ctx;
    let arc = START_POSE; let straight = START_POSE;
    const arcPts = [[arc.x, arc.y]]; const straightPts = [[straight.x, straight.y]];
    for (let i = 0; i + period <= this._clean.length; i += period) {
      const input = selectInputs('threeWheel', combineReadings(this._clean.slice(i, i + period).map((fr) => fr.readings)), cfg);
      arc = stepOdometry(arc, input).pose; straight = stepStraightLine(straight, input);
      arcPts.push([arc.x, arc.y]); straightPts.push([straight.x, straight.y]);
    }
    return [
      { type: 'polyline', points: straightPts, color: 'error', width: 2 },
      { type: 'polyline', points: arcPts, color: 'construct', width: 2, dash: [6, 4] },
      { type: 'label', at: straightPts.at(-1), text: `straight lines @ ${period * 10} ms`, color: 'error' },
    ];
  },

  teardown() {
    const { robot, field } = this._ctx;
    setXray(robot.parts, 0); setShading(robot.root, 1); field.root.visible = true;
    this._tryit.destroy(); this._tryit = null;
    this._clean = null; this._noisy = null; this._frame = null;
  },
};
```

- [ ] **Step 5: Register the chapter** — replace `content/vex/js/chapters/index.js` with:

```js
import odometry from './odometry/chapter.js';

export const CHAPTERS = [odometry];
```

- [ ] **Step 6: Fill in `<main>` in `content/vex/index.html`** — replace the empty `<main class="story" id="story">…</main>` with exactly 12 `.beat` elements:

```html
  <main class="story" id="story">
    <section class="chapter" id="chapter-odometry">
      <div class="beat">
        <h1>How does a robot know where it is?</h1>
        <p>No GPS, no cameras watching the field. Yet a good VEX robot can drive a 20-second autonomous routine and end up within an inch of where it planned. Here's how.</p>
      </div>
      <div class="beat">
        <h2>It's dark in here</h2>
        <p>Turn the field off and the robot has exactly what it has in a match: its own sensors, bolted to its own frame. Everything it knows about the world, it has to work out from those.</p>
      </div>
      <div class="beat">
        <h2>Three little wheels and a gyro</h2>
        <p>Under the chassis sit three free-spinning <em>tracking wheels</em>: two rolling forward (left and right), one rolling sideways. An inertial sensor (IMU) measures how much the robot has turned.</p>
      </div>
      <div class="beat">
        <h2>Flatten it</h2>
        <p>Everything from here on is 2D geometry. The robot becomes a rectangle, the wheels become lines, and the numbers that matter are the wheels' sideways offsets from the center: <span class="t-estimate">s<sub>L</sub></span>, <span class="t-estimate">s<sub>R</sub></span>, <span class="t-estimate">s<sub>S</sub></span>.</p>
      </div>
      <div class="beat">
        <h2>Heading from wheels</h2>
        <p>If the robot turns, the outer wheel rolls farther than the inner one. The difference divided by the distance between them is the turn angle.</p>
        <div class="formula" id="f-heading"></div>
        <p>An IMU gives the same number more directly, which is why most teams use one.</p>
      </div>
      <div class="beat">
        <h2>One tick</h2>
        <p>Every 10 ms the robot asks: how far did each wheel roll, and how much did I turn? It assumes it moved along a <span class="t-construct">circular arc</span>. The arc's radius is wheel distance divided by turn angle (plus the wheel's offset), and the straight-line <span class="t-target">chord</span> across it is:</p>
        <div class="formula" id="f-chord"></div>
      </div>
      <div class="beat">
        <h2>Robot frame to field frame</h2>
        <p>That chord is in the robot's own coordinates. Rotating it by the heading <em>halfway</em> through the tick puts it on the field.</p>
        <div class="formula" id="f-rotate"></div>
      </div>
      <div class="beat">
        <h2>Stack up the ticks</h2>
        <p>Do that a hundred times a second, add each chord to the last position, and the path appears.</p>
      </div>
      <div class="beat">
        <h2>Why arcs and not straight lines?</h2>
        <p>Treating each tick as a straight step seems fine at 10 ms. Slow the loop down and the error piles up, while the arc method stays exact.</p>
      </div>
      <div class="beat">
        <h2>Only the sideways offset matters</h2>
        <p>Slide a tracking wheel forward or back and its reading doesn't change: a rolling wheel only feels motion along its own axis. That's why only <span class="t-estimate">s</span> appears in the math.</p>
      </div>
      <div class="beat">
        <h2>The catch</h2>
        <p>Real wheels slip, real encoders jitter, and a diameter measured a hair wrong adds up. Turn the noise on and the robot's belief (<span class="t-estimate">cyan</span>) slowly parts from where it really is (<span class="t-truth">white</span>). We'll fix this in chapter 8.</p>
      </div>
      <div class="beat">
        <div class="tryit" id="tryit-odometry">
          <h3>Try it</h3>
          <p>Drive with WASD or the arrow keys (or drag on a phone).</p>
          <p class="readout" id="odom-readout">x 0.0  y 0.0  θ 0.0°</p>
          <label>Noise <input type="range" id="odom-noise" min="0" max="5" step="0.5" value="0"></label>
          <label>Sensors <select id="odom-setup"><option value="threeWheel">3 tracking wheels</option><option value="twoWheelImu">2 tracking wheels + IMU</option><option value="driveImu">Drive motor encoders + IMU</option></select></label>
        </div>
        <p class="credit">Same math as <a href="https://github.com/LemLib/LemLib">LemLib</a>'s tracking-wheel odometry, based on 5225A's tracking paper. Explanation follows the <a href="https://wiki.purduesigbots.com/software/odometry">Purdue SIGBots wiki</a>.</p>
      </div>
    </section>
  </main>
```

- [ ] **Step 7: Run both suites**

Run: `npm test && npm run test:e2e`
Expected: unit `ℹ fail 0`; E2E: 13 passed, 3 skipped (the keyboard and resize tests skip on the mobile project).

- [ ] **Step 8: Look at it**

Run: `npm run serve` and open `http://127.0.0.1:8766/vex/`. Scroll slowly through all 12 beats and check against the spec:
- beats 0–1: orbiting 3D field, robot drives the S-curve; beat 1 hides the field;
- beat 2: close-up, chassis goes see-through;
- beat 3 onward: exact top-down view, robot drawn as a cyan rectangle with three wheel lines; beat 3 shows `s_L`, `s_R`, `s_S` dimension lines;
- beats 4–6: magenta arc + centre + radius, amber chord arrow, then the field/robot axes with the `θ + Δθ/2` label; formulas rendered by KaTeX beside the text;
- beat 7: trail grows as you scroll; beat 8: red straight-line path diverges from the dashed magenta arc path as the label counts up to 100 ms; beat 9: the right wheel slides back and forth; beat 10: dashed white truth trail and ghost separate from cyan, with the red "off" link;
- beat 11: hold W — the robot drives, wheels spin, the readout updates; slide Noise up and the white ghost drifts away.
Also check at a phone width (DevTools device toolbar): stage pinned in the top half, text below, no sideways scroll.

- [ ] **Step 9: Commit**

```bash
git add content/vex tests/e2e/vex.spec.js
git commit -m "feat: add odometry chapter with scroll-scrubbed beats and live try-it panel"
```

---

### Task 12: Home page link, README, final verification

**Files:**
- Modify: `content/index.html`
- Modify: `README.md`

- [ ] **Step 1: Link the explainer from the home page** — in `content/index.html`, replace

```html
  <h1>Hello World 2.0</h1>
```

with

```html
  <h1>Hello World 2.0</h1>
  <p><a href="/vex/">How a VEX robot knows where it is →</a></p>
```

- [ ] **Step 2: Document the tests in `README.md`** — append after the "Manual deploys" section:

```markdown
## VEX explainer (`content/vex/`)

An interactive, scroll-driven explanation of VEX robot motion software, served at `/vex/`. Design spec:
`docs/superpowers/specs/2026-09-27-vex-explainer-design.md`. Plain ES modules with pinned CDN libraries — no build step.

```sh
npm install                    # once
npm test                       # unit tests + coverage (node:test)
npx playwright install chromium   # once
npm run test:e2e               # Playwright, desktop + mobile
npm run serve                  # http://127.0.0.1:8766/vex/
```
```

- [ ] **Step 3: Run everything one last time**

Run: `npm test && npm run test:e2e`
Expected: all unit tests pass with `core/` coverage ≥ 80% (should be 100%); E2E 13 passed, 3 skipped.

- [ ] **Step 4: Confirm nothing outside `content/` would be deployed and nothing stray is inside it**

Run: `git status --short && ls content content/vex`
Expected: `content/` holds only `index.html`, `js/`, `vex/`; `content/vex/` holds `index.html`, `style.css`, `js/`. No `node_modules`, tests or config inside `content/`.

- [ ] **Step 5: Commit**

```bash
git add content/index.html README.md
git commit -m "docs: link the VEX explainer from the home page and document its tests"
```

Then tell Cole the milestone is complete and ask before pushing — the push deploys to coleuhlig.com.
