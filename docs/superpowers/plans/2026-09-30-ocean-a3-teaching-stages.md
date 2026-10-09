# Ocean Showcase A3: Teaching Stages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The engine side of the story's thirteen steps: a pure recipe for every step (which engine parts are on, the sea, the look, the camera shot, the sliders with their ranges and bindings), blending between neighbouring recipes by scroll progress, the engine hooks that let the running Roblox-mode ocean become a flat white plane, one sine wave, a Gerstner sum and then the FFT sea layer by layer without restarting a worker, the data the page's charts need, and a `?step=N&progress=P` dev route with a browser check per step.

**Architecture:** Four layers. `stages/` (new, browser-free) holds the recipes, the slider binding, the blend, the URL route parser and the director, which turns (step, progress, slider values) into engine settings plus a look and a camera shot; piece C drives the director. `engine/` gains the switches the recipes need: teaching wave banks drawn through SurfaceSampler's swells slot with no cascades (exactly how the Roblox coordinator's Gerstner-bank A/B drew the original prototype), per-ring cascade filtering, bounds that grow with the sea, a cascade `retune` and a painter `update` message that change the sea and the maps without a Configure, chart data, and `stageControl.js`, which diffs each new set of settings against the last and switches unused parts off so they cost nothing. `render/` gains the look (white, lit sea, unlit sea, painted; wireframe; fog; sun) and the camera shot; `ui/devStage.js` wires the dev route and the test hooks.

**Tech Stack:** As A2: plain ES modules with no build step, Three.js 0.186.1 from jsDelivr through the page's import map, module Web Workers, Node 25 `node --test`, `@playwright/test` 1.63.0 with headless Chromium on SwiftShader.

**Spec:** `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md`: section 3 (the step table: what each step shows and controls), 4.2 (teaching helpers in `core/`), 4.3 (stage recipes: "each step declares which engine parts are on (flat plane, wave source, lighting, choppiness, layers, foam, glow, maps), its slider bindings, and its camera shot. The engine reads the blended recipe every frame; parts off in a recipe cost nothing"), 4.4 (tiers), the Decided-with-Cole list (the hero sea is the rough default; phones get the lighter tier by rule) and the A1/A2 status lines. This is build step 4 of section 9, extended by the brief from "steps 1 to 8" to the engine side of steps 1 to 12 and the finale's controls. Piece C (story, panels, slider widgets, KaTeX, cards, charts drawn) is not in this plan.

**Decisions this plan takes, so no task re-decides them:**

- **The phone rule lives here, in A3** (`engine/config.js` `tierForDevice`): a touch-first device (`(pointer: coarse)`) whose screen's shorter side is under 900 CSS px gets **Medium**, unmeasured, and `status().tierReason` says `'phone rule'` so the page's numbers can say so. Medium, not Low: it draws 6,480 vertices against High's 18,144 and keeps two of the three cascade layers, so step 10 still has layers to toggle (Low has one cascade). No tier has smaller maps (the spec's 4.4 says "smaller maps"): that is left as a gap for piece C's copy.
- **Steps 1 to 6 run the Gerstner sum** through `SurfaceSampler.fill` with every ring's cascade list emptied and a teaching bank in the swells slot. Every ring samples the whole bank, as the Roblox A/B did, so the coarse rings alias the short waves far away; that is the prototype's behaviour and is not corrected here.
- **The teaching bank** is the prototype's 32 JONSWAP waves (howhow2315's recipe as `OceanClient.client.luau` builds it, spread 45 degrees), sorted tallest first so the wave-count slider adds waves that show, with every wavevector snapped to the 256-stud lattice so the sum repeats exactly every 256 studs (step 6's repetition, and the same repetition an FFT patch has). The four lowest bins have zero amplitude, so counts 29 to 32 add nothing visible. Steps 4 to 6 sum the 16 tallest: 32 waves cost about 27 ms a frame over 18,144 vertices in Node (measured 2026-09-30), 16 about half.
- **The teaching clock** is unwrapped (`now - startedAt`, or the frozen time), so a sine whose speed the visitor sets never meets the 120 s loop seam. The FFT keeps the looping clock.
- **What blends and what snaps:** numbers lerp (fetch and fog on a log scale, the sun's azimuth the short way round, camera position and target in straight lines); everything discrete (wave source, seed, layers, maps, foam, glow, material, shading, wireframe, camera move, charts) snaps at progress 0.5. A part either neighbour needs runs "warm" while the scroll is strictly between them, so the FFT, the painter and a newly switched-on layer are ready by the time they show. The panel's sliders stay the step being read (the `from` step).
- **Wind, fetch and seed changes** rebuild a cascade's spectrum in its worker with a `retune` message, one cascade at a time, at least `RETUNE_GAP_FRAMES` (7, so the cascades take turns while a slider is dragged) frames apart, on that cascade's own rotation frame; the FieldStore cross-fade blends the old sea into the new over three frames. A Cascade.create at n = 64 takes 4 to 9 ms in Node (measured 2026-09-30), so the main-thread fallback hitches, never stalls.
- **Bounds only grow** during a session, from a closed-form estimate of how much taller the sea is than the shipped one (`bounds.js`), so a storm widens the bounding spheres and lowers the skirt before its waves arrive.
- **Without `?step` the page is A2's**, unchanged: no director, every part on, the config's sea.

## Global Constraints

- Work only in the worktree `/Users/cole/Projects/Wesbite-ocean` on branch `ocean-showcase`. Never touch `/Users/cole/Projects/Wesbite` itself.
- No build step; plain ES modules a browser imports as they are. The only external library is `three@0.186.1` from `cdn.jsdelivr.net/npm/` through the page's existing import map.
- The A1 core (`content/ocean/js/core/`) is used, never forked. A core bug found on the way is fixed in the core with a test and named in the report. One new core file is allowed: `core/naiveDft.js`, a teaching helper (spec 4.2: "small teaching helpers").
- Browser-free code (`content/ocean/js/engine/`, `content/ocean/js/stages/`, `content/ocean/js/workers/*Core.js`) must import cleanly in Node: no DOM, no Three.js, no `window`/`self`/`document`. Only `render/`, `ui/`, `main.js` and the two `*.worker.js` entry files touch browser APIs. `stages/` imports `render/lighting.js`, which is constants only and must stay free of imports.
- Roblox mode keeps the Roblox constraints on the FFT steps (spec 4.4): vertex positions and normals written from JavaScript every frame, no displacement shader; painted colour, mask, normal and roughness maps; 232 materials with per-patch glow.
- Tests live in `tests/ocean/`: core in `tests/ocean/core/`, engine in `tests/ocean/engine/`, stages in `tests/ocean/stages/`, browser in `tests/ocean/e2e/`. Unit tests: `npm run test:ocean`. Browser tests: `npm run test:ocean:e2e` (headless Chromium on SwiftShader, about 5 fps: wait in frames, read the canvas inside `requestAnimationFrame`). If a browser threshold fails on a page that renders correctly, report the measured value; never lower a threshold silently.
- No `Math.random` anywhere; randomness only through `core/random.js`.
- Files use tabs. Every new file opens with a header comment saying what it is; engine twins name the Luau file they mirror, and A3's new files say they are A3's and not twins.
- Index rule, as in A1 and A2: cascade and ring numbers keep their Luau values (1-based) and arrays are read at `[n - 1]`. A `layers` array is by position: `layers[0]` is cascade 1 (the 256-stud layer).
- The page without `?step` behaves exactly as A2's: every A2 unit and browser test passes unchanged.
- Commit messages: `<type>: <description>` (feat, fix, test, docs, chore), no attribution trailers. A hook blocks any Bash command that contains `git commit` together with a `-n` flag: never put `-n` in a commit command.
- Subagents run on opus and never use the Roblox Studio MCP tools.

## Review Focus

Inputs and conditions the spec implies but no step table row names, most likely to bite first; each has a test in the named task:

1. **A slider scrubbed continuously** (the wind dragged every frame, chop and the foam sliders moved fast): no Configure storm, no foam wiped, retunes throttled to one cascade per `RETUNE_GAP_FRAMES`, no main-thread stall. Test in Task 5 ("a wind slider dragged every frame ...").
2. **Scroll jitter across progress 0.5** between steps whose discrete parts differ (6 and 7, 9 and 10): the parts flip cleanly, the FFT stays warm, every position stays finite. Test in Task 9 ("progress jittering across 0.5 ...").
3. **Malformed or out-of-range input** from the URL route or a slider call (`step=99`, `progress=-1`, `s.wind=abc`, an unknown slider id, a wind of 0 handed to the engine): clamped with a warning, or refused with a named error before it reaches the maths, the ocean left as it was. Tests in Task 7 (`clampSlider`), Task 8 (the route) and Task 5 ("settings the maths cannot take ..."), browser test in Task 10.
4. **Slider extremes** (wind 25 m/s at fetch 200,000 m, chop 1 on the bank, a sine 4 studs tall): the bounds cover the waves, the skirts stay under the troughs, nothing is NaN. Tests in Task 2 ("the bounds cover the waves at the slider extremes") and Task 5 ("a storm grows the bounds ...").
5. **A phone on the lighter tier** (Medium, two cascades) given three-layer recipes: the third layer's toggle reports unavailable and nothing throws; the rule picks Medium only for a touch-first small screen. Tests in Task 5 ("phones get the lighter tier by rule ...", "a Medium ocean takes three-layer settings ...") and Task 9 ("on Medium the third layer toggle is unavailable").

---

## Conventions every task follows

- **EngineSettings**, the object `Ocean.configureStage(ocean, settings)` takes (Task 5 defines and validates it; the director builds it from a blended recipe):

  ```
  source:       'sine' | 'bank' | 'fft'
  sine:         { amplitude (studs, >= 0), wavelength (studs, > 0), speed (studs/s) }
  bank:         { count (0 .. 32; a fraction fades the last wave in) }
  chop:         number in 0 .. 2
  sea:          { windSpeed (m/s), fetch (m) }
  seed:         integer
  layers:       boolean[]   layers[0] = cascade 1 (256 studs), [1] = cascade 2 (64), [2] = cascade 3 (16)
  maps, foam, glow, normals: boolean
  foamKnobs:    { whitecap, decay }
  glowStrength: number >= 0
  warm:         { fft: boolean, maps: boolean, layers: boolean[] }
  ```

- **Recipe**, the frozen object `stages/recipes.js` holds per step (Task 7):

  ```
  { step, id, title,
    engine:  EngineSettings without `normals` and `warm`,
    look:    { material: 'white' | 'sea' | 'painted', shading: boolean, wireframe: boolean, fog: number, sun: { azimuth, elevation } },
    shot:    { position: [x, y, z], target: [x, y, z], move: 'still' | 'drift' },
    charts:  { spectrum: boolean, phaseArrows: boolean, transformN: number | null },
    sliders: Slider[] }
  Slider: { id, label, kind: 'range' | 'toggle' | 'counter' | 'choice', bind: 'dotted.path', default,
            min?, max?, step?, unit?, scale?: 'linear' | 'log', options?: number[] }
  ```

  A **blended recipe** (Task 8) has the same fields plus `from`, `to`, `progress` and `warm`.
- **Worker-shaped objects** as in A2: `{ postMessage(message, transfer?), onmessage, onerror, terminate() }`; a worker core is `createXWorker(post) -> handle(message)`. Node tests run cores through `engine/inProcessWorker.js`, which delivers each message a microtask later; a test flushes them with `const flush = () => new Promise((resolve) => setImmediate(resolve));`.
- **Timing** uses `performance.now()` (a global in Node and browsers).
- **Test style** as A1 and A2: `import { test } from 'node:test'` and the Luau-style helpers in `tests/ocean/expect.js` (`equal`, `near`, `truthy`).

---
### Task 1: Teaching wave banks

**Files:**
- Create: `content/ocean/js/engine/waveBanks.js`
- Test: `tests/ocean/engine/waveBanks.test.js`

**Interfaces:**
- Consumes: A1 `core/jonswap.js` (`generateWaves`, `GRAVITY`), `core/waveSampler.js` (`STRIDE`, `sample`), `core/luau.js` (`clamp`, `mod`, `round`); `engine/config.js` (`SEED`).
- Produces (`engine/waveBanks.js`), used by Tasks 2 and 5. A **bank** is a frozen `{ packed: Float64Array, count: number, weights: Float64Array, silent: boolean }`, the `Swells.Bank` shape `SurfaceSampler.fill` takes as its `swells` (STRIDE 6 per wave: k, omega, A, phase, dx, dz).
  - `TEACHING_RECIPE` (frozen Jonswap config), `TEACHING_TILE` (256)
  - `checkSine(spec) -> void`, throws `RangeError` naming `amplitude`, `wavelength` or `speed`
  - `nextSine(previous: { omega, phase } | null, spec: { amplitude, wavelength, speed }, t: number) -> { omega, phase, bank }` (frozen)
  - `teachingBank(seed = SEED, tile = TEACHING_TILE) -> bank` (32 waves, tallest first, lattice-snapped)
  - `withCount(full: bank, count: number) -> bank` (shares `full.packed`)
  - `bankExtent(bank) -> number` (summed weighted amplitude)

- [ ] **Step 1: Write the failing tests**

`tests/ocean/engine/waveBanks.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';

const STRIDE = WaveSampler.STRIDE;
const TAU = 2 * Math.PI;
const heightAt = (bank, t, x, z, chop = 0) => WaveSampler.sample(bank.packed, bank.count, t, x, z, chop, bank.weights, 0, new Float64Array(7))[1];

test("one sine wave travels along +x with the panel's height, length and speed", () => {
	const { bank, omega, phase } = WaveBanks.nextSine(null, { amplitude: 1.5, wavelength: 40, speed: 8 }, 0);
	expect.equal(bank.count, 1, 'one wave');
	expect.near(bank.packed[0], TAU / 40, 1e-12, 'k');
	expect.near(omega, (TAU / 40) * 8, 1e-12, 'omega = k c');
	expect.equal(bank.packed[2], 1.5, 'amplitude');
	expect.equal(phase, 0, 'starts at phase 0');
	expect.equal(bank.packed[4], 1, 'dx');
	expect.equal(bank.packed[5], 0, 'dz');
	expect.equal(bank.silent, false, 'not silent');
	for (const x of [-37.5, 0, 12.25, 300]) {
		const h = heightAt(bank, 3, x, 0);
		expect.equal(heightAt(bank, 3, x, 91.5), h, `no change along z at x=${x}`);
		expect.near(h, 1.5 * Math.sin((TAU / 40) * x - omega * 3), 1e-12, `y = A sin(kx - wt) at x=${x}`);
	}
});

test('an amplitude of zero is a silent bank: the flat plane', () => {
	const { bank } = WaveBanks.nextSine(null, { amplitude: 0, wavelength: 40, speed: 8 }, 0);
	expect.equal(bank.silent, true, 'silent');
	expect.equal(heightAt(bank, 5, 10, 10), 0, 'flat');
});

test('changing the speed does not jump the wave: the phase at that instant is kept', () => {
	const t = 17.3;
	const slow = WaveBanks.nextSine(null, { amplitude: 1, wavelength: 30, speed: 4 }, 0);
	const fast = WaveBanks.nextSine(slow, { amplitude: 1, wavelength: 30, speed: 12 }, t);
	for (const x of [0, 7, -22.5, 150]) {
		expect.near(heightAt(fast.bank, t, x, 0), heightAt(slow.bank, t, x, 0), 1e-9, `continuous at x=${x}`);
	}
	expect.truthy(Math.abs(heightAt(fast.bank, t + 0.5, 5, 0) - heightAt(slow.bank, t + 0.5, 5, 0)) > 1e-3, 'and then moves at the new speed');
	expect.truthy(fast.phase >= 0 && fast.phase < TAU, 'phase kept in 0 .. 2 pi');
});

test('a sine the maths cannot draw is refused with a named error (Review Focus 3)', () => {
	for (const [spec, name] of [
		[{ amplitude: -1, wavelength: 40, speed: 8 }, 'amplitude'],
		[{ amplitude: 1, wavelength: 0, speed: 8 }, 'wavelength'],
		[{ amplitude: 1, wavelength: 40, speed: Number.NaN }, 'speed'],
	]) {
		let message = '';
		try {
			WaveBanks.nextSine(null, spec, 0);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes(name), `${name}: ${message}`);
	}
});

test("the teaching bank is the prototype's 32 waves, tallest first", () => {
	const bank = WaveBanks.teachingBank();
	expect.equal(bank.count, 32, 'count');
	expect.equal(bank.packed.length, 32 * STRIDE, 'packed');
	for (let wave = 1; wave < 32; wave++) {
		expect.truthy(bank.packed[wave * STRIDE + 2] <= bank.packed[(wave - 1) * STRIDE + 2], `wave ${wave} no taller than wave ${wave - 1}`);
	}
	expect.truthy(bank.packed[2] > 0.5, `the tallest wave shows: ${bank.packed[2]}`);
	expect.equal(WaveBanks.teachingBank().packed.join(','), bank.packed.join(','), 'same seed, same bank');
});

test('every teaching wavevector sits on the 256-stud lattice, so the sum repeats every 256 studs', () => {
	const bank = WaveBanks.teachingBank();
	const unit = TAU / WaveBanks.TEACHING_TILE;
	for (let wave = 0; wave < bank.count; wave++) {
		const o = wave * STRIDE;
		const kx = bank.packed[o] * bank.packed[o + 4];
		const kz = bank.packed[o] * bank.packed[o + 5];
		expect.near(kx / unit, Math.round(kx / unit), 1e-9, `wave ${wave} kx on the lattice`);
		expect.near(kz / unit, Math.round(kz / unit), 1e-9, `wave ${wave} kz on the lattice`);
		expect.truthy(bank.packed[o] > 0, `wave ${wave} not snapped to k = 0`);
		expect.near(bank.packed[o + 1], Math.sqrt(9.81 * bank.packed[o]), 1e-12, `wave ${wave} deep-water dispersion`);
	}
	for (const [x, z] of [[3.5, -12], [100.25, 40], [-250, 7]]) {
		const a = WaveSampler.sample(bank.packed, bank.count, 6, x, z, 0.6, bank.weights, 0, new Float64Array(7));
		const b = WaveSampler.sample(bank.packed, bank.count, 6, x + 256, z, 0.6, bank.weights, 0, new Float64Array(7));
		const c = WaveSampler.sample(bank.packed, bank.count, 6, x, z - 256, 0.6, bank.weights, 0, new Float64Array(7));
		for (let i = 0; i < 3; i++) {
			expect.near(b[i], a[i], 1e-9, `repeats along x at (${x}, ${z}), component ${i}`);
			expect.near(c[i], a[i], 1e-9, `repeats along z at (${x}, ${z}), component ${i}`);
		}
	}
});

test('withCount sums only the first waves, fading the last one in by the fraction', () => {
	const full = WaveBanks.teachingBank();
	const one = WaveBanks.withCount(full, 1);
	expect.equal(one.count, 1, 'one wave summed');
	expect.equal(one.weights[0], 1, 'full weight');
	expect.equal(one.packed, full.packed, 'the packed waves are shared, not copied');
	const partial = WaveBanks.withCount(full, 2.5);
	expect.equal(partial.count, 3, 'three waves summed');
	expect.equal([...partial.weights.slice(0, 4)].join(','), '1,1,0.5,0', 'weights');
	expect.equal(WaveBanks.withCount(full, 0).silent, true, 'none: silent');
	expect.equal(WaveBanks.withCount(full, 99).count, 32, 'clamped to the bank');
	let message = '';
	try {
		WaveBanks.withCount(full, Number.NaN);
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('count'), `NaN refused: ${message}`);
});

test('bankExtent is the summed weighted amplitude: the tallest the bank can stand', () => {
	const full = WaveBanks.teachingBank();
	const two = WaveBanks.withCount(full, 1.5);
	expect.near(WaveBanks.bankExtent(two), full.packed[2] + 0.5 * full.packed[STRIDE + 2], 1e-12, 'extent');
	expect.equal(WaveBanks.bankExtent(WaveBanks.withCount(full, 0)), 0, 'silent extent');
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/engine/waveBanks.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `waveBanks.js`.

- [ ] **Step 3: Write `content/ocean/js/engine/waveBanks.js`**

```js
// The Gerstner wave banks of the teaching steps 2 to 6 (A3; not a twin). Each is a bank in the
// packed layout WaveSampler and Swells share (k, omega, A, phase, dx, dz per wave) and in the
// Swells.Bank shape SurfaceSampler.fill takes as its `swells`: { packed, count, weights, silent }.
// Handing the sampler one of these with every ring's cascade list empty is exactly how the Roblox
// coordinator's Gerstner-bank A/B drew the original prototype's sea (OceanClient.client.luau,
// `gerstnerBank`): every ring samples the whole bank, the last ring flattens it into the horizon,
// and the vertex normals are the bank's analytic ones.
//
// Two sources:
//   * one sine wave (step 2) travelling along +x, from the panel's height, length and speed.
//     Changing the speed keeps the wave's phase where it was at that instant, so a slider drag
//     slows or quickens the wave instead of jumping it;
//   * the teaching bank (steps 3 to 6): the prototype's 32 JONSWAP waves, sorted tallest first so
//     the wave-count slider adds waves that show, with every wavevector snapped to the 256-stud
//     lattice. A sum of waves whose wavevectors sit on a 2 pi / 256 lattice repeats exactly every
//     256 studs, which is the repetition step 6 shows and the one an FFT patch has too.
import * as Jonswap from '../core/jonswap.js';
import * as WaveSampler from '../core/waveSampler.js';
import { clamp, mod, round } from '../core/luau.js';
import { SEED } from './config.js';

const TAU = 2 * Math.PI;
const STRIDE = WaveSampler.STRIDE;

// howhow2315/JONSWAP-Ocean's recipe as the Roblox A/B builds it (OceanClient.client.luau), except
// the spread: the A/B's absent spread drew headings over the whole circle from a second generator;
// 45 degrees either side of +x keeps the teaching sea rolling one way.
export const TEACHING_RECIPE = Object.freeze({
	count: 32,
	firstFrequency: 0.02,
	deltaF: 0.02,
	peakFrequency: 0.16,
	alpha: 0.0081,
	gamma: 3.3,
	scale: 2.6,
	windDirection: 0,
	spread: 45,
	tailBoost: 0,
});
export const TEACHING_TILE = 256;

function fail(name, rule, value) {
	throw new RangeError(`wave bank: ${name} must be ${rule}, got ${value}`);
}

// Silent when every summed wave has zero weighted amplitude: the surface can then skip the bank.
function bank(packed, count, weights) {
	let silent = true;
	for (let wave = 0; wave < count; wave++) {
		if (packed[wave * STRIDE + 2] * weights[wave] !== 0) {
			silent = false;
			break;
		}
	}
	return Object.freeze({ packed, count, weights, silent });
}

export function checkSine(spec) {
	if (!(Number.isFinite(spec.amplitude) && spec.amplitude >= 0)) {
		fail('sine amplitude', 'finite and not negative', spec.amplitude);
	}
	if (!(Number.isFinite(spec.wavelength) && spec.wavelength > 0)) {
		fail('sine wavelength', 'finite and above 0', spec.wavelength);
	}
	if (!Number.isFinite(spec.speed)) {
		fail('sine speed', 'finite', spec.speed);
	}
}

/**
 * The single sine wave of step 2, y = A sin(k x - omega t + phase), with k = 2 pi / wavelength and
 * omega = k * speed (the visitor sets the speed; the wave need not obey dispersion).
 * @param {{ omega: number, phase: number } | null} previous the last sine, or null for the first
 * @param {{ amplitude: number, wavelength: number, speed: number }} spec
 * @param {number} t the teaching clock now
 */
export function nextSine(previous, spec, t) {
	checkSine(spec);
	const k = TAU / spec.wavelength;
	const omega = k * spec.speed;
	// phase - omega t is what the wave shows at this instant; keep it when omega changes.
	const phase = previous ? mod(previous.phase + (omega - previous.omega) * t, TAU) : 0;
	const packed = Float64Array.of(k, omega, spec.amplitude, phase, 1, 0);
	return Object.freeze({ omega, phase, bank: bank(packed, 1, Float64Array.of(1)) });
}

// A wavevector rounded to the tile's lattice. One that rounds to zero (a wave longer than the tile)
// takes the lattice's shortest step along its larger component instead, so no wave stands still.
function snap(k, dx, dz, unit) {
	let m = round((k * dx) / unit);
	let n = round((k * dz) / unit);
	if (m === 0 && n === 0) {
		if (Math.abs(dx) >= Math.abs(dz)) {
			m = dx < 0 ? -1 : 1;
		} else {
			n = dz < 0 ? -1 : 1;
		}
	}
	return [m * unit, n * unit];
}

export function teachingBank(seed = SEED, tile = TEACHING_TILE) {
	const source = Jonswap.generateWaves(TEACHING_RECIPE, seed);
	const count = source.count;
	const amplitude = (wave) => source.packed[wave * STRIDE + 2];
	// Tallest first; ties keep the bank's own (frequency) order.
	const order = Array.from({ length: count }, (_, wave) => wave).sort((a, b) => amplitude(b) - amplitude(a) || a - b);
	const packed = new Float64Array(count * STRIDE);
	const unit = TAU / tile;
	order.forEach((from, to) => {
		const i = from * STRIDE;
		const o = to * STRIDE;
		const [kx, kz] = snap(source.packed[i], source.packed[i + 4], source.packed[i + 5], unit);
		const k = Math.hypot(kx, kz);
		packed[o] = k;
		// Deep water, the bank's own dispersion (Jonswap gives each wave k = omega^2 / g).
		packed[o + 1] = Math.sqrt(Jonswap.GRAVITY * k);
		packed[o + 2] = source.packed[i + 2];
		packed[o + 3] = source.packed[i + 3];
		packed[o + 4] = kx / k;
		packed[o + 5] = kz / k;
	});
	return bank(packed, count, new Float64Array(count).fill(1));
}

// The first `count` waves of a full bank; a fractional count fades the last one in. Only the waves
// with weight are summed (`count` rounded up), so fewer waves cost less.
export function withCount(full, count) {
	if (!Number.isFinite(count)) {
		fail('wave count', 'finite', count);
	}
	const total = full.packed.length / STRIDE;
	const clamped = clamp(count, 0, total);
	const summed = Math.ceil(clamped);
	const weights = new Float64Array(total);
	for (let wave = 0; wave < summed; wave++) {
		weights[wave] = clamp(clamped - wave, 0, 1);
	}
	return bank(full.packed, summed, weights);
}

export function bankExtent(waves) {
	let sum = 0;
	for (let wave = 0; wave < waves.count; wave++) {
		sum += Math.abs(waves.packed[wave * STRIDE + 2]) * waves.weights[wave];
	}
	return sum;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/engine/waveBanks.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean
git add content/ocean/js/engine/waveBanks.js tests/ocean/engine/waveBanks.test.js
git commit -m "feat: the teaching wave banks, one sine and the prototype's 32 waves on the tile lattice"
```

---

### Task 2: Surface hooks, growing bounds and the surface probe

**Files:**
- Create: `content/ocean/js/engine/bounds.js`, `content/ocean/js/engine/surfaceProbe.js`
- Modify: `content/ocean/js/engine/surfaceState.js` (create, writeRing, snapAndWrite; three new exports)
- Modify: `content/ocean/js/engine/ocean.js` (use `bounds.js` instead of its local `boundsFor`)
- Test: `tests/ocean/engine/bounds.test.js` (new), `tests/ocean/engine/surfaceState.test.js` (append)

**Interfaces:**
- Consumes: A1 `core/spectrum.js` (`alpha`, `peakOmega`, `validateParams`, `NORMAL`), `core/ringLayout.js`, `core/surfaceSampler.js` (`ringContext`); Task 1 `engine/waveBanks.js` (tests only).
- Produces:
  - `engine/bounds.js`: `seaFactor(params) -> number`; `boundsFor({ params, chop, swellScale }) -> { lateral, height }` (frozen; identical to A2's at the shipped sea); `bankBounds(extent, chop) -> { lateral, height }`; `grow(a, b) -> { lateral, height }` (frozen, each the larger).
  - `engine/surfaceProbe.js`: `probeSurface(surface) -> { patches, maxAbsY, maxLateral, xSpread, zSpread, sumY }` over ring 1's interior vertices (rows and columns 1 .. cells - 1 of every visible ring-1 patch).
  - `engine/surfaceState.js`: new state fields `ringSpecs` (the filtered RingSpecs, finest first), `contexts` (one `SurfaceSampler.ringContext` per ring), `stale` (boolean), `boundsVersion` (integer, starts 0), `skipped` (boolean); new exports `setRingCascades(surface, enabled: boolean[])` (`enabled[c - 1]` for Luau cascade c), `setBounds(surface, { lateral, height })`, `setFlatNormals(surface, flat: boolean)`; `snapAndWrite(surface, focusX, focusZ, store, swells, t, chop, frame, still = false)` gains the `still` argument.

- [ ] **Step 1: Write the failing bounds tests**

`tests/ocean/engine/bounds.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FFT from '../../../content/ocean/js/core/fft.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as WaveField from '../../../content/ocean/js/core/waveField.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import * as Bounds from '../../../content/ocean/js/engine/bounds.js';

const HERO = readConfig('').params;

// The worst the three High cascades reach at a few times: each cascade's largest |height| summed
// (a bound on any one point of the surface), and the widest lateral displacement times chop.
function measured(params, chop) {
	const preset = Tier.presets.High;
	const bands = WaveField.bands(preset.sizes, preset.n);
	const plan = FFT.plan(preset.n);
	const cascades = preset.sizes.map((size, i) =>
		Cascade.create({ n: preset.n, size, kMin: bands[i].kMin, kMax: bands[i].kMax, seed: 7 * 7919 + i + 1, loopPeriod: 120, params }),
	);
	let height = 0;
	let lateral = 0;
	for (const t of [0, 12, 40, 77]) {
		let h = 0;
		let l = 0;
		for (const c of cascades) {
			Cascade.evolve(c, t);
			Cascade.synthesise(c, plan);
			let mh = 0;
			let ml = 0;
			for (let i = 0; i < c.cells; i++) {
				mh = Math.max(mh, Math.abs(c.height[i]));
				ml = Math.max(ml, Math.abs(c.dispX[i]), Math.abs(c.dispZ[i]));
			}
			h += mh;
			l += ml;
		}
		height = Math.max(height, h);
		lateral = Math.max(lateral, l * chop);
	}
	return { height, lateral };
}

test("at the shipped sea the bounds are A2's, to the last bit", () => {
	const b = Bounds.boundsFor({ params: HERO, chop: 0.8, swellScale: 0 });
	expect.equal(b.lateral, 8 + 6 * 0.8 * 8 + 2 * 0, 'lateral 46.4');
	expect.equal(b.height, 8 + 4 * 8 + 2.5 * 0, 'height 40');
	expect.equal(Bounds.seaFactor(HERO), 1, 'the reference sea');
	expect.truthy(Object.isFrozen(b), 'frozen');
});

test('the bounds cover the waves at the slider extremes (Review Focus 4)', () => {
	for (const [windSpeed, fetch] of [[25, 200000], [20, 80000], [25, 5000], [3, 200000], [3, 5000]]) {
		const params = { ...HERO, windSpeed, fetch };
		const bounds = Bounds.boundsFor({ params, chop: 0.8, swellScale: 0 });
		const worst = measured(params, 0.8);
		expect.truthy(bounds.height > worst.height + 2, `wind ${windSpeed} fetch ${fetch}: height bound ${bounds.height} over ${worst.height} plus the skirt margin`);
		expect.truthy(bounds.lateral > worst.lateral, `wind ${windSpeed} fetch ${fetch}: lateral bound ${bounds.lateral} over ${worst.lateral}`);
	}
});

test('a stronger wind or a longer fetch never shrinks the sea factor', () => {
	let last = 0;
	for (const windSpeed of [3, 6, 12, 18, 25]) {
		const factor = Bounds.seaFactor({ ...HERO, windSpeed });
		expect.truthy(factor > last, `wind ${windSpeed}: ${factor} over ${last}`);
		last = factor;
	}
	last = 0;
	for (const fetch of [5000, 20000, 80000, 200000]) {
		const factor = Bounds.seaFactor({ ...HERO, fetch });
		expect.truthy(factor > last, `fetch ${fetch}: ${factor} over ${last}`);
		last = factor;
	}
});

test('bankBounds covers a Gerstner bank and grow keeps the larger of each', () => {
	const b = Bounds.bankBounds(5, 0.6);
	expect.equal(b.height, 13, 'headroom plus the extent');
	expect.equal(b.lateral, 8 + 0.6 * 5, 'headroom plus chop times the extent');
	const g = Bounds.grow({ lateral: 10, height: 50 }, { lateral: 30, height: 20 });
	expect.equal(g.lateral, 30, 'the wider lateral');
	expect.equal(g.height, 50, 'the taller height');
	expect.truthy(Object.isFrozen(g), 'frozen');
});
```

- [ ] **Step 2: Append the failing surface tests**

In `tests/ocean/engine/surfaceState.test.js`, add these two imports under the existing ones:

```js
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { probeSurface } from '../../../content/ocean/js/engine/surfaceProbe.js';
```

and append these tests at the end of the file (they use the file's existing `setup`, `BOUNDS`, `SurfaceState` and `RingLayout`):

```js
test("probeSurface reads ring 1's interior: sixteen patches on High, all zero on a fresh surface", () => {
	const { layout } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	const probe = probeSurface(surface);
	expect.equal(probe.patches, 16, 'ring 1 has sixteen patches');
	for (const name of ['maxAbsY', 'maxLateral', 'xSpread', 'zSpread', 'sumY']) {
		expect.equal(probe[name], 0, `${name} on the flat starting grid`);
	}
});

test('setRingCascades drops a cascade from every ring, and the write follows', () => {
	const { layout, store, swells } = setup();
	// Only cascade 2 carries waves.
	for (let cell = 0; cell < store.cells; cell++) store.display[1].height[cell] = 3;
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.write(surface, store, swells, 0, 0.8);
	expect.truthy(probeSurface(surface).maxAbsY > 2, 'cascade 2 lifts ring 1');
	SurfaceState.setRingCascades(surface, [true, false, true]);
	expect.truthy(surface.ringSpecs.every((spec) => !spec.cascades.includes(2)), 'no ring samples cascade 2');
	expect.equal(surface.ringSpecs[0].cascades.join(','), '1', 'ring 1 keeps cascade 1');
	expect.equal(surface.ringSpecs[0].normalCascades.join(','), '1', 'and its vertex normals keep cascade 1');
	expect.equal(surface.contexts.length, surface.ringSpecs.length, 'one sampler context per ring');
	expect.equal(surface.stale, true, 'the next write must be whole');
	SurfaceState.write(surface, store, swells, 0, 0.8);
	expect.equal(probeSurface(surface).maxAbsY, 0, 'cascade 2 gone from the surface');
});

test('with no cascades the swells slot carries a teaching bank: one sine is z-invariant', () => {
	const { layout, store } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.setRingCascades(surface, [false, false, false]);
	const { bank } = WaveBanks.nextSine(null, { amplitude: 2, wavelength: 24, speed: 5 }, 0);
	SurfaceState.write(surface, store, bank, 1.5, 0);
	const probe = probeSurface(surface);
	expect.equal(probe.zSpread, 0, 'nothing changes along z');
	expect.truthy(probe.xSpread > 0.5, `the wave changes along x: ${probe.xSpread}`);
	expect.equal(probe.maxLateral, 0, 'chop 0: no sideways motion');
	expect.truthy(probe.maxAbsY <= 2 && probe.maxAbsY > 1.5, `height within the amplitude: ${probe.maxAbsY}`);
});

test('a still surface is written once and then left alone until a window moves', () => {
	const { layout, store } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.setRingCascades(surface, [false, false, false]);
	const flat = WaveBanks.nextSine(null, { amplitude: 0, wavelength: 40, speed: 8 }, 0).bank;
	SurfaceState.snapAndWrite(surface, 0, 0, store, flat, 0, 0, 1, true);
	expect.equal(surface.skipped, false, 'the first write happens');
	for (const p of surface.patches) p.written = false;
	SurfaceState.snapAndWrite(surface, 0, 0, store, flat, 1, 0, 2, true);
	expect.equal(surface.skipped, true, 'nothing to do');
	expect.truthy(surface.patches.every((p) => !p.written), 'no patch rewritten');
	SurfaceState.snapAndWrite(surface, 40, 0, store, flat, 2, 0, 3, true);
	expect.equal(surface.skipped, false, 'a window moved: written');
	expect.equal(probeSurface(surface).maxAbsY, 0, 'still flat');
});

test('setBounds moves the skirt and makes the next write whole', () => {
	const { layout, store, swells, preset } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.write(surface, store, swells, 0, 0.8, 1);
	SurfaceState.setBounds(surface, { lateral: 100, height: 90 });
	expect.equal(surface.skirtY, Math.fround(-(90 - SurfaceState.SKIRT_MARGIN)), 'skirt lowered');
	expect.equal(surface.boundsVersion, 1, 'version bumped for the renderer');
	expect.equal(surface.bounds.height, 90, 'bounds kept');
	for (const p of surface.patches) p.written = false;
	SurfaceState.snapAndWrite(surface, 0, 0, store, swells, 0, 0.8, 3);
	const outer = preset.rings.length;
	expect.truthy(surface.patches.some((p) => p.ring === outer && p.written), 'odd frame, yet the outer ring is rewritten: the skirt moved');
	let message = '';
	try {
		SurfaceState.setBounds(surface, { lateral: 10, height: 1 });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('bounds'), `a bound under the skirt margin is refused: ${message}`);
});

test('setFlatNormals switches the normal writes and marks the surface stale', () => {
	const { layout } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	expect.equal(surface.stale, false, 'fresh');
	SurfaceState.setFlatNormals(surface, false);
	expect.equal(surface.stale, false, 'no change, nothing to do');
	SurfaceState.setFlatNormals(surface, true);
	expect.equal(surface.flatNormals, true, 'flat');
	expect.equal(surface.stale, true, 'stale');
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/engine/bounds.test.js tests/ocean/engine/surfaceState.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `bounds.js` and `surfaceProbe.js`.

- [ ] **Step 4: Write `content/ocean/js/engine/bounds.js`**

```js
// A patch's bounding volume and the skirt under it have to cover the worst displacement the sea
// can reach. Twin of the coordinator's bounds guess (OceanClient.client.luau), moved out of
// ocean.js by A3 and extended for the page's sliders: Studio never changed the wind while the
// ocean ran, the page does, so the guess scales with the sea state as well as the shape knobs.
import * as Spectrum from '../core/spectrum.js';

const REFERENCE = Spectrum.NORMAL;

// How much taller this sea is than the shipped one (wind 12 m/s, fetch 80,000 m): the square root
// of the ratio of the JONSWAP spectrum's total variance, which for the fetch-limited form is
// proportional to alpha / peakOmega^4 (the integral of alpha g^2 w^-5 exp(-1.25 (wp / w)^4) over
// w is alpha g^2 / (5 wp^4)). The gamma bump and the depth factor change that by a factor that
// barely moves with the wind, and the FFT lattice holds less than the whole spectrum, so this
// over-covers: on the three High cascades (2026-09-30, t = 0, 12, 40, 77) wind 25 m/s at
// 200,000 m reached 47.8 studs where this gives 110. Exactly 1 at the reference sea.
export function seaFactor(params) {
	Spectrum.validateParams(params);
	const variance = (p) => Spectrum.alpha(p) / Spectrum.peakOmega(p) ** 4;
	return Math.sqrt(variance(params) / variance(REFERENCE));
}

// A2's generous linear guesses (lateral 46.4 and height 40 at the shipped sea, against measured
// extremes of about 10 and 17.5), with the amplitude scaled by the sea factor.
export function boundsFor({ params, chop, swellScale }) {
	const scale = params.scale * seaFactor(params);
	return Object.freeze({
		lateral: 8 + 6 * chop * scale + 2 * swellScale,
		height: 8 + 4 * scale + 2.5 * swellScale,
	});
}

// A Gerstner bank can stand no taller than its summed amplitude (waveBanks.bankExtent), nor move a
// vertex further sideways than chop times that. The same 8 studs of headroom as above.
export function bankBounds(extent, chop) {
	return Object.freeze({ lateral: 8 + chop * extent, height: 8 + extent });
}

// The bounds only grow while the page runs: a sea that calms keeps the wider volume rather than
// making the renderer refit 224 spheres back and forth as a slider moves.
export function grow(a, b) {
	return Object.freeze({ lateral: Math.max(a.lateral, b.lateral), height: Math.max(a.height, b.height) });
}
```

- [ ] **Step 5: Write `content/ocean/js/engine/surfaceProbe.js`**

```js
// What the surface's finest ring is doing, as numbers a test can check (A3; not a twin): the
// tallest vertex, the furthest any vertex has moved sideways, and how much the height changes
// between neighbours along each axis. Read over the INTERIOR of every visible ring-1 patch: ring 1
// is never faded, and its edge vertices are seam averages that would make a wave running along x
// look as if it changed along z. `sumY` is a checksum that tells two seas apart.
import * as RingLayout from '../core/ringLayout.js';

export function probeSurface(surface) {
	let patches = 0;
	let maxAbsY = 0;
	let maxLateral = 0;
	let xSpread = 0;
	let zSpread = 0;
	let sumY = 0;
	for (const state of surface.byRing[0]) {
		if (state.hidden) {
			continue;
		}
		patches += 1;
		const { cells, localX, localZ } = state.patch;
		const p = state.positions;
		for (let row = 1; row < cells; row++) {
			for (let column = 1; column < cells; column++) {
				const v = RingLayout.vertexIndex(cells, column, row) - 1;
				const o = v * 3;
				const y = p[o + 1];
				sumY += y;
				maxAbsY = Math.max(maxAbsY, Math.abs(y));
				// Against the float32 the positions are stored in, so an undisplaced vertex reads exactly 0
				// on every tier (Low's 48-stud patches in six cells put local offsets off the binary grid).
				maxLateral = Math.max(maxLateral, Math.abs(p[o] - Math.fround(localX[v])), Math.abs(p[o + 2] - Math.fround(localZ[v])));
				if (column < cells - 1) {
					xSpread = Math.max(xSpread, Math.abs(y - p[(v + 1) * 3 + 1]));
				}
				if (row < cells - 1) {
					zSpread = Math.max(zSpread, Math.abs(y - p[(RingLayout.vertexIndex(cells, column, row + 1) - 1) * 3 + 1]));
				}
			}
		}
	}
	return { patches, maxAbsY, maxLateral, xSpread, zSpread, sumY };
}
```

- [ ] **Step 6: Change `content/ocean/js/engine/surfaceState.js`**

(a) Replace the bounds check at the top of `create` with a call to a shared helper, and add the helper above `create`:

```js
function checkBounds(bounds) {
	check(
		bounds.height > SKIRT_MARGIN && bounds.lateral > 0,
		`patch bounds must be positive, got lateral=${bounds.lateral} height=${bounds.height}: the skirt hangs ${SKIRT_MARGIN} studs above the bottom of the bounds`,
	);
}

function contextsFor(specs) {
	return Object.freeze(specs.map((spec, i) => SurfaceSampler.ringContext(spec, specs[i + 1])));
}
```

In `create`, the first statement becomes `checkBounds(bounds);` (the old `check(...)` call is removed).

(b) In `create`, add these fields to the `surface` object literal, after `snapSeconds: 0,`:

```js
		// The cascades each ring samples, filtered by setRingCascades (all of them until then), and
		// the sampler's per-ring working for those lists, worked out once per change rather than once
		// per ring per frame.
		ringSpecs: layout.spec.rings,
		contexts: contextsFor(layout.spec.rings),
		// Set by a change the next write must cover whole: new ring lists, bounds or normals.
		stale: false,
		// Bumped by setBounds, so the renderer knows to refit its bounding spheres.
		boundsVersion: 0,
		// True when the last snapAndWrite had nothing to do: a still surface whose windows held.
		skipped: false,
```

(c) At the top of `writeRing`, replace

```js
	const rings = surface.layout.spec.rings;
	const ringSpec = rings[ring - 1];
	const nextRingSpec = rings[ring]; // Luau rings[ring + 1]; undefined on the last ring
	const context = SurfaceSampler.ringContext(ringSpec, nextRingSpec);
```

with

```js
	// The FILTERED ring specs (setRingCascades): the same spacing and reach as the layout's, with
	// only the cascades that are switched on, and their contexts worked out when they changed.
	const rings = surface.ringSpecs;
	const ringSpec = rings[ring - 1];
	const nextRingSpec = rings[ring]; // Luau rings[ring + 1]; undefined on the last ring
	const context = surface.contexts[ring - 1];
```

(d) Add these three exports after `takeExtremes`:

```js
/**
 * Which cascades the rings sample (A3's layer switches): enabled[c - 1] for Luau cascade c. A
 * cascade switched off leaves every ring's list and its vertex normals, and the fades follow, since
 * each ring fades what the next one out no longer samples. All off leaves every ring with an empty
 * list, which is how the teaching sources draw: their waves come through the swells bank alone.
 * @param {ReadonlyArray<boolean>} enabled
 */
export function setRingCascades(surface, enabled) {
	const on = (cascadeIndex) => enabled[cascadeIndex - 1] === true;
	const specs = surface.layout.spec.rings.map((ring) =>
		Object.freeze({
			...ring,
			cascades: Object.freeze(ring.cascades.filter(on)),
			normalCascades: Object.freeze((ring.normalCascades ?? ring.cascades).filter(on)),
		}),
	);
	surface.ringSpecs = Object.freeze(specs);
	surface.contexts = contextsFor(specs);
	surface.stale = true;
}

/**
 * New bounds (they grow when a slider raises the sea: bounds.js). The skirt moves with them, so the
 * next write is whole, and `boundsVersion` tells the renderer to refit its bounding spheres.
 * @param {{ lateral: number, height: number }} bounds
 */
export function setBounds(surface, bounds) {
	checkBounds(bounds);
	surface.bounds = Object.freeze({ lateral: bounds.lateral, height: bounds.height });
	surface.skirtY = Math.fround(-(bounds.height - SKIRT_MARGIN));
	surface.boundsVersion += 1;
	surface.stale = true;
}

// Whether the vertex normals are written: not while the look is unlit (white or flat colour) or
// the config asks for flat normals. Turning them back on rewrites them on the next write.
export function setFlatNormals(surface, flat) {
	if (surface.flatNormals === flat) {
		return;
	}
	surface.flatNormals = flat;
	surface.stale = true;
}
```

(e) Replace `snapAndWrite` with:

```js
// One frame of the surface, with the two writes in a deliberate order. The new windows are
// adopted FIRST, so the vertices written this frame are the ones that belong where the patches
// are about to be, and only then do the patches move. Returns how many rings shifted; the time
// the move took is left in `surface.snapSeconds` (the Luau's second return value).
// `still` (A3) says nothing on the surface moves by itself -- the flat plane of step 1 -- so once
// every ring has been written, a frame on which no window shifted and nothing set the surface
// stale writes nothing at all (`surface.skipped`). A stale surface is written whole.
export function snapAndWrite(surface, focusX, focusZ, store, swells, t, chop, frame, still = false) {
	const moved = adopt(surface, focusX, focusZ);
	surface.skipped = still && moved === 0 && surface.everWritten && !surface.stale;
	if (!surface.skipped) {
		// `adopt` has already marked the rings that shifted, so the write sees them and covers every
		// ring on this frame; `repositionDirty` below clears the marks once it is done.
		write(surface, store, swells, t, chop, surface.stale ? undefined : frame);
		surface.stale = false;
	}
	surface.snapSeconds = 0;
	if (moved > 0) {
		const started = performance.now();
		repositionDirty(surface);
		surface.snapSeconds = (performance.now() - started) / 1000;
	}
	return moved;
}
```

- [ ] **Step 7: Point `content/ocean/js/engine/ocean.js` at `bounds.js`**

Delete the local `boundsFor(config)` function and its comment block ("A patch's bounding volume is fixed when it is made ..."), add `import { boundsFor } from './bounds.js';` to the imports, and in `create` replace `const bounds = boundsFor(config);` with:

```js
	const bounds = boundsFor({ params: config.params, chop: config.chop, swellScale: config.swellScale });
```

- [ ] **Step 8: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/engine/bounds.test.js tests/ocean/engine/surfaceState.test.js && npm run test:ocean`
Expected: PASS: 4 bounds tests, 12 surface tests (6 A2 + 6 new), and the whole suite green.

- [ ] **Step 9: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean
git add content/ocean/js/engine/bounds.js content/ocean/js/engine/surfaceProbe.js content/ocean/js/engine/surfaceState.js content/ocean/js/engine/ocean.js tests/ocean/engine/bounds.test.js tests/ocean/engine/surfaceState.test.js
git commit -m "feat: per-ring cascade switches, growing bounds and a still surface that costs nothing"
```

---
### Task 3: Cascade retune without a Configure

**Files:**
- Modify: `content/ocean/js/workers/cascadeWorkerCore.js`
- Modify: `content/ocean/js/engine/cascadeTransport.js`
- Test: `tests/ocean/engine/cascadeWorkerCore.test.js` (new), `tests/ocean/engine/cascadeTransport.test.js` (append)

**Interfaces:**
- Consumes: A1 `core/cascade.js`, `core/fft.js`, `core/fieldStore.js`.
- Produces:
  - Cascade worker message `{ type: 'retune', index, config }` (a full `Cascade.Config`), answered by `{ type: 'retuned', index, ms }`. It rebuilds the cascade's starting spectrum from the new config (the same seed gives the same random numbers, so the waves keep their identity and change height); the next `evolve` answers with the new sea. A retune before a configure throws.
  - Transport (`createCascades(...)` return value) gains `retune(index) -> 'sent' | 'waiting' | 'local'` (reads `configFor(index)` at call time; `'waiting'` means the worker has not answered its Configure yet, so the caller keeps the retune pending) and `lastRetuneMs: Float64Array` (per cascade, `NaN` until a rebuild has been timed).

- [ ] **Step 1: Write the failing worker tests**

`tests/ocean/engine/cascadeWorkerCore.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';

const N = 16;
const config = (scale) => ({ n: N, size: 64, kMin: 0, kMax: Infinity, seed: 101, loopPeriod: 120, params: { ...Spectrum.NORMAL, scale } });

function evolveAt(handle, replies, t) {
	handle({ type: 'evolve', t, buffer: new ArrayBuffer(FieldStore.bufferSize(N * N)) });
	return new Float32Array(replies.at(-1).buffer);
}

test('a retune rebuilds the spectrum with the same seed: the same waves, new heights', () => {
	const replies = [];
	const handle = createCascadeWorker((message) => replies.push(message));
	handle({ type: 'configure', index: 2, config: config(4) });
	const before = evolveAt(handle, replies, 9);
	handle({ type: 'retune', index: 2, config: config(8) });
	const retuned = replies.at(-1);
	expect.equal(retuned.type, 'retuned', 'answered retuned, not ready');
	expect.equal(retuned.index, 2, 'index echoed');
	expect.truthy(Number.isFinite(retuned.ms) && retuned.ms >= 0, 'the rebuild time');
	const after = evolveAt(handle, replies, 9);
	let nonZero = 0;
	for (const i of [0, 5, 77, 200]) {
		// Scale enters the variance squared and the amplitude once: doubling it doubles every value
		// exactly, since every step of the synthesis commutes with a power-of-two scaling.
		expect.equal(after[i], before[i] * 2, `height ${i} doubled`);
		if (before[i] !== 0) nonZero += 1;
	}
	expect.truthy(nonZero > 0, 'the compared heights are not all zero');
});

test('a retune before configure is refused', () => {
	const handle = createCascadeWorker(() => {});
	let message = '';
	try {
		handle({ type: 'retune', index: 1, config: config(8) });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('retune before configure'), message);
});
```

- [ ] **Step 2: Append the failing transport tests**

Append to `tests/ocean/engine/cascadeTransport.test.js` (it already imports `Spectrum`, `createInProcessWorker`, `createCascadeWorker`, `createCascades` and defines `flush`, `CELLS` and `configFor`):

```js
function retuneHarness(useWorkers) {
	const state = { scale: 1 };
	const received = [];
	const cascades = createCascades({
		count: 1,
		cells: CELLS,
		configFor: (index) => ({ ...configFor(index), params: { ...Spectrum.NORMAL, scale: state.scale } }),
		spawn: () => createInProcessWorker(createCascadeWorker),
		useWorkers,
		onFields: (index, packed) => received.push(packed.slice()),
		onReady: () => {},
		log: { warn() {} },
	});
	return { cascades, received, state };
}

function doubled(later, earlier) {
	let nonZero = 0;
	for (const i of [3, 50, 101]) {
		expect.equal(later[i], earlier[i] * 2, `value ${i} doubled`);
		if (earlier[i] !== 0) nonZero += 1;
	}
	expect.truthy(nonZero > 0, 'the compared values are not all zero');
}

test('retune sends the current config to a ready worker, and the next result carries it', async () => {
	const { cascades, received, state } = retuneHarness(true);
	expect.equal(cascades.retune(1), 'waiting', 'not ready: the caller keeps it pending');
	await flush();
	cascades.request(1, 4, 1);
	await flush();
	state.scale = 2;
	expect.equal(cascades.retune(1), 'sent', 'sent to the ready worker');
	cascades.request(1, 4, 2);
	await flush();
	expect.equal(received.length, 2, 'two results');
	doubled(received[1], received[0]);
	expect.truthy(Number.isFinite(cascades.lastRetuneMs[0]), 'the rebuild time is kept');
});

test('on the main thread a retune rebuilds the local cascade at once', () => {
	const { cascades, received, state } = retuneHarness(false);
	expect.truthy(Number.isNaN(cascades.lastRetuneMs[0]), 'no rebuild timed yet');
	cascades.request(1, 4, 1);
	state.scale = 2;
	expect.equal(cascades.retune(1), 'local', 'rebuilt on this thread');
	cascades.request(1, 4, 2);
	doubled(received[1], received[0]);
	expect.truthy(Number.isFinite(cascades.lastRetuneMs[0]), 'the rebuild time is kept');
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/engine/cascadeWorkerCore.test.js tests/ocean/engine/cascadeTransport.test.js`
Expected: FAIL: `cascade worker: unknown message type retune` and `cascades.retune is not a function`.

- [ ] **Step 4: Add `retune` to `content/ocean/js/workers/cascadeWorkerCore.js`**

Add to the header comment, after "... nothing is allocated per frame.":

```js
// `retune` (A3; the Luau has no such message, Studio never changed the sea while it ran) rebuilds
// the cascade from a new config -- the page's wind, fetch or seed -- and answers `retuned` with
// the time it took. The seed decides the random numbers, so the same seed gives the same waves
// at new heights; the next `evolve` answers with the new sea.
```

and in `handle`, before the final `throw`, add:

```js
		if (message.type === 'retune') {
			if (!cascade) {
				throw new Error(`cascade worker ${index}: retune before configure`);
			}
			const started = performance.now();
			cascade = Cascade.create(message.config);
			if (plan.n !== message.config.n) {
				plan = FFT.plan(message.config.n);
			}
			post({ type: 'retuned', index, ms: performance.now() - started });
			return;
		}
```

- [ ] **Step 5: Add `retune` to `content/ocean/js/engine/cascadeTransport.js`**

(a) Add to the header comment:

```js
// `retune(index)` (A3) hands a cascade the config `configFor` gives NOW -- the page's live wind,
// fetch and seed -- without a Configure: the worker rebuilds its spectrum and keeps its buffer, or
// on the main thread the local cascade is rebuilt in place.
```

(b) After `const replied = new Uint8Array(count);` add:

```js
	// The last spectrum rebuild per cascade, in ms; NaN until one has been timed.
	const lastRetuneMs = new Float64Array(count).fill(Number.NaN);
```

(c) In the worker's `onmessage`, after the `fields` branch, add:

```js
					} else if (data.type === 'retuned') {
						lastRetuneMs[index - 1] = data.ms;
```

so the chain reads `if (data.type === 'ready') { ... } else if (data.type === 'fields') { ... } else if (data.type === 'retuned') { ... }`.

(d) After the `request` function add:

```js
	// A worker that has not answered its Configure is left alone ('waiting'): the caller keeps the
	// retune pending and tries again, because a Configure re-sent after a timeout reads configFor
	// anyway, and a retune posted ahead of a Configure would be refused.
	function retune(index) {
		if (mode === 'main-thread') {
			const started = performance.now();
			local.cascades[index - 1] = Cascade.create(configFor(index));
			lastRetuneMs[index - 1] = performance.now() - started;
			return 'local';
		}
		const slot = slots[index - 1];
		if (!slot.ready) {
			return 'waiting';
		}
		slot.worker.postMessage({ type: 'retune', index, config: configFor(index) });
		return 'sent';
	}
```

(e) Add `retune,` and `lastRetuneMs,` to the returned object.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/engine/cascadeWorkerCore.test.js tests/ocean/engine/cascadeTransport.test.js && npm run test:ocean`
Expected: PASS, the whole suite green.

- [ ] **Step 7: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean
git add content/ocean/js/workers/cascadeWorkerCore.js content/ocean/js/engine/cascadeTransport.js tests/ocean/engine/cascadeWorkerCore.test.js tests/ocean/engine/cascadeTransport.test.js
git commit -m "feat: retune a cascade's spectrum in its worker without a Configure"
```

---

### Task 4: A lightweight painter update

**Files:**
- Modify: `content/ocean/js/workers/painterWorkerCore.js`
- Modify: `content/ocean/js/engine/painterClient.js`
- Test: `tests/ocean/engine/painterWorkerCore.test.js` (append), `tests/ocean/engine/painterClient.test.js` (append)

**Interfaces:**
- Consumes: the existing painter worker and client (A2).
- Produces:
  - `painterWorkerCore.js`: `UPDATABLE` (frozen list of config keys), `checkUpdate(settings, cascadeCount) -> void` (throws naming the key), and the worker message `{ type: 'update', settings }`: merges `settings` into the role's config, rebuilds the colour role's derived knobs, reallocates and resets nothing (foam field, quarter means, running maximum, lace all carry on), sends no reply.
  - `painterClient.js`: `update(painter, settings) -> void`: validates, posts to both workers, merges into `painter.mapsConfig` and `painter.colourConfig` (so a re-sent Configure carries it), recomputes `painter.paintsNormal`, and asks the sink to put maps back to rest: `sink.clearNormal?.()` when the normal map loses its last cascade, `sink.resetRoughness?.()` (and the kept coverage zeroed) when the foam is switched off. Both sink methods are optional; Task 10 adds them to the renderer's sink.

- [ ] **Step 1: Append the failing worker tests**

Append to `tests/ocean/engine/painterWorkerCore.test.js` (it already has `N`, `SIZES`, `config`, `fieldBuffers`, `run`, `FieldStore`, `MapRotation`, `createPainterWorker`):

```js
// fieldBuffers with every height scaled.
function scaledFieldBuffers(scale) {
	return SIZES.map((size, i) => {
		const fields = FieldStore.newFields(N, size);
		for (let c = 0; c < N * N; c++) {
			fields.height[c] = Math.sin(c * 0.3 + i) * 3 * scale;
			fields.jxx[c] = Math.cos(c * 0.17) * 0.6;
		}
		const packed = new Float32Array(FieldStore.bufferSize(N * N) / 4);
		FieldStore.pack(fields, packed);
		return packed.buffer;
	});
}

test('an update changes the knobs without resetting the running maximum; a Configure resets it', () => {
	const coverage = new Float32Array(64 * 64);
	const viaUpdate = run('maps');
	viaUpdate.handle({ type: 'paint', turn: MapRotation.MASK, sequence: 1, t: 0, fields: scaledFieldBuffers(1), coverage });
	const first = viaUpdate.replies[1].message.first;
	viaUpdate.handle({ type: 'update', settings: { gamma: 0.5, chop: 0.4 } });
	expect.equal(viaUpdate.replies.length, 2, 'an update sends no reply');
	viaUpdate.handle({ type: 'paint', turn: MapRotation.MASK, sequence: 2, t: 0, fields: scaledFieldBuffers(0.5), coverage });
	expect.near(viaUpdate.replies[2].message.first, first * 0.98, 1e-4 * first, 'the running maximum carried on and decayed');
	const viaConfigure = run('maps');
	viaConfigure.handle({ type: 'paint', turn: MapRotation.MASK, sequence: 1, t: 0, fields: scaledFieldBuffers(1), coverage });
	viaConfigure.handle({ type: 'configure', config: config('maps', { gamma: 0.5 }) });
	viaConfigure.handle({ type: 'paint', turn: MapRotation.MASK, sequence: 2, t: 0, fields: scaledFieldBuffers(0.5), coverage });
	expect.near(viaConfigure.replies.at(-1).message.first, first / 2, 1e-4 * first, 'a Configure starts the maximum again');
});

test('an update reaches the colour role: fewer cascades paint a different band, and foam off paints none', () => {
	const all = run('colour');
	all.handle({ type: 'paint', turn: 1, sequence: 1, t: 0, fields: fieldBuffers() });
	const one = run('colour');
	one.handle({ type: 'update', settings: { colourCascades: [1] } });
	one.handle({ type: 'paint', turn: 1, sequence: 1, t: 0, fields: fieldBuffers() });
	const a = all.replies[1].message.pixels;
	const b = one.replies[1].message.pixels;
	expect.truthy(a.some((value, i) => value !== b[i]), 'the band differs with cascades 2 and 3 left out');
	const off = run('colour');
	off.handle({ type: 'update', settings: { foamEnabled: false } });
	for (let band = 1; band <= 4; band++) {
		off.handle({ type: 'paint', turn: band, sequence: band, t: 0, fields: fieldBuffers() });
	}
	expect.equal(off.replies[4].message.roughness, undefined, 'foam switched off by update: no roughness');
});

test('an update may only change what needs no reallocation, and only to valid values', () => {
	const { handle } = run('colour');
	const attempt = (settings) => {
		try {
			handle({ type: 'update', settings });
			return 'ok';
		} catch (error) {
			return error.message;
		}
	};
	expect.truthy(attempt({ texels: 32 }).includes('texels'), 'texels needs a Configure');
	expect.truthy(attempt({ colourCascades: [0, 4] }).includes('colourCascades'), 'cascades out of range');
	expect.truthy(attempt({ chop: Number.NaN }).includes('chop'), 'a NaN chop');
	expect.truthy(attempt({ foamEnabled: 1 }).includes('foamEnabled'), 'not a boolean');
	expect.equal(attempt({ chop: 0.5, foamWhitecap: 0.6, maskCascades: [] }), 'ok', 'a valid update is taken');
	let before = '';
	try {
		createPainterWorker(() => {})({ type: 'update', settings: { chop: 1 } });
	} catch (error) {
		before = error.message;
	}
	expect.truthy(before.includes('update before configure'), before);
});
```

- [ ] **Step 2: Append the failing client test**

Append to `tests/ocean/engine/painterClient.test.js` (it already has `flush`, `N`, `SIZES`, `mapsConfig`, `FieldStore`, `PainterClient`, `createInProcessWorker`, `createPainterWorker`):

```js
// A painter spawn that records every message type the client posts.
function recordingSpawn(posted) {
	return () => {
		const inner = createInProcessWorker(createPainterWorker);
		const worker = {
			onmessage: null,
			onerror: null,
			postMessage: (message, transfer) => {
				posted.push(message.type);
				inner.postMessage(message, transfer);
			},
			terminate: () => inner.terminate(),
		};
		inner.onmessage = (event) => worker.onmessage?.(event);
		inner.onerror = (event) => worker.onerror?.(event);
		return worker;
	};
}

test('update reaches both workers and both kept configs, and puts cleared maps back to rest', async () => {
	const posted = [];
	const calls = [];
	const store = FieldStore.create(N, SIZES);
	const painter = PainterClient.create({
		config: mapsConfig(),
		spawn: recordingSpawn(posted),
		sink: {
			uploadColourBand() {},
			uploadMaskOrNormal() {},
			uploadRoughness() {},
			clearNormal: () => calls.push('clearNormal'),
			resetRoughness: () => calls.push('resetRoughness'),
		},
		stage: { paint: 0, upload: 0 },
		log: { warn() {} },
	});
	await flush();
	painter.coverage[0] = 0.5;
	PainterClient.update(painter, { chop: 0.3, normalCascades: [], foamEnabled: false });
	expect.equal(posted.filter((type) => type === 'update').length, 2, 'one update to each worker');
	expect.equal(posted.filter((type) => type === 'configure').length, 2, 'no Configure beyond the first two');
	expect.equal(painter.mapsConfig.chop, 0.3, 'the maps config keeps it');
	expect.equal(painter.colourConfig.chop, 0.3, 'the colour config keeps it');
	expect.equal(painter.colourConfig.role, 'colour', 'the roles are untouched');
	expect.equal(painter.paintsNormal, false, 'no normal cascade left');
	expect.equal(calls.join(','), 'clearNormal,resetRoughness', 'the sink put both maps back to rest');
	expect.truthy(painter.coverage.every((value) => value === 0), 'the kept coverage cleared');
	for (let frame = 2; frame <= 9; frame++) {
		PainterClient.step(painter, frame, 0, store);
		await flush();
	}
	expect.equal(PainterClient.ready(painter), true, 'still painting');
	let message = '';
	try {
		PainterClient.update(painter, { lut: [] });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('lut'), `refused on this side too: ${message}`);
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/engine/painterWorkerCore.test.js tests/ocean/engine/painterClient.test.js`
Expected: FAIL: `painter worker: unknown message type update` and `PainterClient.update is not a function`.

- [ ] **Step 4: Add the update to `content/ocean/js/workers/painterWorkerCore.js`**

(a) Add to the header comment:

```js
//
// `update` (A3; the Luau has none, Studio never moved a slider while the painter ran) changes the
// knobs a slider or a stage switch moves without a Configure: it merges them into the config and
// rebuilds the colour role's derived knobs, and reallocates and resets nothing. The foam field,
// its quarter means, the running maximum and the lace carry on, which is the whole difference: a
// Configure per slider tick would wipe the foam and stutter the maps.
```

(b) After the `ROLE_MAPS` constant add:

```js
// What an `update` may change: every knob that no allocation depends on. The sizes, the texels,
// the tile, the lut, the foam colour and the ring roughness bases still need a Configure.
export const UPDATABLE = Object.freeze([
	'chop',
	'peak',
	'tint',
	'gamma',
	'decay',
	'maskCascades',
	'colourCascades',
	'normalCascades',
	'foamEnabled',
	'foamWhitecap',
	'foamGrow',
	'foamDecay',
	'foamThreshold',
	'foamFeather',
	'foamLace',
	'foamOpacity',
	'foamRoughness',
]);
const CASCADE_LISTS = Object.freeze(['maskCascades', 'colourCascades', 'normalCascades']);

// Throws naming the first key that cannot be updated or holds a value the painter cannot use.
export function checkUpdate(settings, cascadeCount) {
	for (const [key, value] of Object.entries(settings)) {
		if (!UPDATABLE.includes(key)) {
			throw new Error(`painter update: ${key} cannot change without a Configure`);
		}
		if (CASCADE_LISTS.includes(key)) {
			const valid = Array.isArray(value) && value.every((c) => Number.isInteger(c) && c >= 1 && c <= cascadeCount);
			if (!valid) {
				throw new Error(`painter update: ${key} must list cascades 1..${cascadeCount}, got ${JSON.stringify(value)}`);
			}
		} else if (key === 'foamEnabled') {
			if (typeof value !== 'boolean') {
				throw new Error(`painter update: foamEnabled must be true or false, got ${value}`);
			}
		} else if (!Number.isFinite(value)) {
			throw new Error(`painter update: ${key} must be a finite number, got ${value}`);
		}
	}
}

// The colour role's knobs that come from the config rather than being allocated: worked out by
// Configure and again by every update.
function colourKnobs(config) {
	const [r, g, b] = config.foamColour;
	return {
		// Clamped: above 1 WaterColour.base would index past the lut's end.
		tint: clamp(config.tint, 0, 1),
		stepParams: { whitecap: config.foamWhitecap, grow: config.foamGrow, decay: config.foamDecay },
		paintParams: {
			// With foam off the fade is given a foot no sum reaches, so every texel of every band is
			// the base colour exactly: the switch as one number rather than a second fill.
			threshold: config.foamEnabled ? config.foamThreshold : 2,
			feather: config.foamFeather,
			laceSoft: config.foamLace,
			// Clamped as the tint is: over 1 the byte lerp would overshoot the foam colour.
			opacity: clamp(config.foamOpacity, 0, 1),
			r,
			g,
			b,
		},
	};
}
```

(c) In `colourState`, delete the `const [r, g, b] = config.foamColour;` line and the `tint: ...`, `stepParams: ...` and `paintParams: { ... }` entries of the returned object (with their comments, which now live in `colourKnobs`), and put `...colourKnobs(config),` where `tint` was, so the object reads:

```js
	return {
		lut: config.lut,
		...colourKnobs(config),
		field,
		fieldList: [field],
		lace: FoamPaint.lace(config.colourTexels, LACE_CELLS, LACE_SEED, LACE_OCTAVES, LACE_FALLOFF),
		quarterRows: idiv(config.foamTexels, MapRotation.BANDS),
		// ... the rest unchanged
```

(d) Inside `createPainterWorker`, after `configure`, add:

```js
	// A slider's worth of change: see the header. No reply: messages arrive in order, so the next
	// Paint already sees the new settings, and that Paint's pixels are the answer.
	function update(settings) {
		if (!config) {
			throw new Error('painter worker: update before configure');
		}
		checkUpdate(settings, config.sizes.length);
		config = { ...config, ...settings };
		if (colour) {
			Object.assign(colour, colourKnobs(config));
		}
	}
```

and in `handle`, before the final `throw`:

```js
		if (message.type === 'update') {
			update(message.settings);
			return;
		}
```

- [ ] **Step 5: Add `update` to `content/ocean/js/engine/painterClient.js`**

Change the worker-core import to `import { checkUpdate, createPainterWorker } from '../workers/painterWorkerCore.js';`, add to the header comment:

```js
//
// `update` (A3) changes painter knobs without a Configure (painterWorkerCore's `update`).
```

and add after `create`:

```js
/**
 * Changes painter knobs without a Configure: both workers get it, and both kept configs take it,
 * so a Configure re-sent after a timeout or on the main-thread fallback carries it too. When the
 * normal map loses its last cascade, or the foam is switched off, what was painted before would
 * otherwise stay on the water, so the sink is asked to put those maps back to rest.
 * @param {object} settings keys from painterWorkerCore's UPDATABLE
 */
export function update(painter, settings) {
	checkUpdate(settings, painter.count);
	const hadNormal = painter.paintsNormal;
	const hadFoam = painter.mapsConfig.foamEnabled;
	painter.mapsConfig = { ...painter.mapsConfig, ...settings };
	painter.colourConfig = { ...painter.colourConfig, ...settings };
	painter.paintsNormal = painter.mapsConfig.normalCascades.length > 0;
	for (const role of ROLES) {
		painter.workers[role]?.postMessage({ type: 'update', settings });
	}
	if (hadNormal && !painter.paintsNormal) {
		painter.sink?.clearNormal?.();
	}
	if (hadFoam && !painter.mapsConfig.foamEnabled) {
		painter.coverage.fill(0);
		painter.sink?.resetRoughness?.();
	}
}
```

- [ ] **Step 6: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/engine/painterWorkerCore.test.js tests/ocean/engine/painterClient.test.js && npm run test:ocean`
Expected: PASS, the whole suite green (the A2 painter tests prove the `colourKnobs` refactor changed nothing).

- [ ] **Step 7: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean
git add content/ocean/js/workers/painterWorkerCore.js content/ocean/js/engine/painterClient.js tests/ocean/engine/painterWorkerCore.test.js tests/ocean/engine/painterClient.test.js
git commit -m "feat: a painter update that moves the knobs without wiping the foam"
```

---
### Task 5: Stage control: per-stage switches in the ocean

**Files:**
- Create: `content/ocean/js/engine/stageControl.js`
- Modify: `content/ocean/js/engine/ocean.js`
- Modify: `content/ocean/js/engine/config.js` (the phone rule and the cascade seed)
- Test: `tests/ocean/engine/stageControl.test.js` (new), `tests/ocean/engine/config.test.js` (append)

**Interfaces:**
- Consumes: Task 1 `engine/waveBanks.js`; Task 2 `engine/bounds.js`, `SurfaceState.setRingCascades/setBounds/setFlatNormals`, `snapAndWrite(..., still)`, `engine/surfaceProbe.js` (tests); Task 3 transport `retune(index)`; Task 4 `PainterClient.update(painter, settings)`; A1 `core/spectrum.js`, `core/swells.js`.
- Produces:
  - `engine/config.js`: `PHONE_SHORT_SIDE` (900), `PHONE_TIER` ('Medium'), `tierForDevice({ shortSide, coarsePointer }) -> 'Medium' | null`, `cascadeSeed(seed, index) -> number` (`seed * 7919 + index`).
  - `engine/stageControl.js`: `RETUNE_GAP_FRAMES` (7), `SOURCES`, `DEFAULT_SETTINGS` (frozen EngineSettings of the hero sea: A2's behaviour), `normalise(settings) -> settings` (throws `RangeError` naming the field), `configure(ocean, settings)`, `retuneDue(ocean, index) -> boolean`, `teachTime(ocean) -> number`.
  - `engine/ocean.js`: `create(config, { spawnCascade, spawnPainter, now, probeMs, deviceTier = null, log })`; `configureStage(ocean, settings)`; `teachTime(ocean)`; `status(ocean)` gains `tierReason` ('url' | 'phone rule' | 'probe'), `source` ('fft' | 'waves'), `parts` ({ cascades, painter, glow, still }), `layers` (the cascades the rings sample, one boolean per tier cascade), `evolving` (the cascades that run), `chop`, `windSpeed`, `fetch`, `seed`, `foamCover`. New ocean fields used by later tasks: `live` ({ params, chop, seed, scatter }), `parts`, `source`, `waves` (the teaching bank being drawn), `layerOn`, `sampled`, `teachT`, `stageSettings`, `tierReason`.

- [ ] **Step 1: Append the failing config tests**

Append to `tests/ocean/engine/config.test.js`:

```js
test('the phone rule: a touch-first screen under 900 px on its short side gets Medium', () => {
	expect.equal(Config.tierForDevice({ shortSide: 390, coarsePointer: true }), 'Medium', 'a phone');
	expect.equal(Config.tierForDevice({ shortSide: 899, coarsePointer: true }), 'Medium', 'just under');
	expect.equal(Config.tierForDevice({ shortSide: 900, coarsePointer: true }), null, 'a 900 px tablet side');
	expect.equal(Config.tierForDevice({ shortSide: 390, coarsePointer: false }), null, 'a narrow desktop window');
	expect.equal(Config.tierForDevice({ shortSide: Number.NaN, coarsePointer: true }), null, 'no screen size: the probe decides');
	expect.equal(Config.PHONE_TIER, 'Medium', 'Medium');
});

test('cascadeSeed is the seed every cascade has used since A1', () => {
	expect.equal(Config.cascadeSeed(7, 1), 7 * 7919 + 1, 'cascade 1');
	expect.equal(Config.cascadeSeed(8, 3), 8 * 7919 + 3, 'cascade 3 of the next sea');
});
```

- [ ] **Step 2: Write the failing stage-control tests**

`tests/ocean/engine/stageControl.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';
import * as Ocean from '../../../content/ocean/js/engine/ocean.js';
import * as StageControl from '../../../content/ocean/js/engine/stageControl.js';
import * as SurfaceState from '../../../content/ocean/js/engine/surfaceState.js';
import { probeSurface } from '../../../content/ocean/js/engine/surfaceProbe.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const SUN = [-0.9526530504226685, 0.2821884751319885, 0.11323313415050507];

// A Worker-shaped wrapper that counts every message the ocean posts, by type.
function counting(create, counts) {
	return () => {
		const inner = createInProcessWorker(create);
		const worker = {
			onmessage: null,
			onerror: null,
			postMessage: (message, transfer) => {
				counts[message.type] = (counts[message.type] ?? 0) + 1;
				inner.postMessage(message, transfer);
			},
			terminate: () => inner.terminate(),
		};
		inner.onmessage = (event) => worker.onmessage?.(event);
		inner.onerror = (event) => worker.onerror?.(event);
		return worker;
	};
}

function build(query = '?tier=High', extra = {}) {
	const cascadeCounts = {};
	const painterCounts = {};
	let clock = 0;
	const ocean = Ocean.create(readConfig(query), {
		spawnCascade: counting(createCascadeWorker, cascadeCounts),
		spawnPainter: counting(createPainterWorker, painterCounts),
		now: () => clock,
		log: { warn() {} },
		...extra,
	});
	Ocean.attachSink(ocean, { uploadColourBand() {}, uploadMaskOrNormal() {}, uploadRoughness() {} });
	const advance = async (frames, each) => {
		for (let i = 0; i < frames; i++) {
			clock += 1 / 60;
			each?.(i);
			Ocean.step(ocean, 1 / 60, [0, 0], [0, 14, 40], SUN);
			await flush();
		}
	};
	return { ocean, cascadeCounts, painterCounts, advance };
}

const settings = (over = {}) => ({ ...StageControl.DEFAULT_SETTINGS, ...over });
const TEACHING = { maps: false, foam: false, glow: false, layers: [true, false, false], chop: 0 };
const since = (counts, before, type) => (counts[type] ?? 0) - (before[type] ?? 0);

test("before any stage is configured the ocean is A2's: every part on, the FFT shown", async () => {
	const { ocean, advance } = build('?tier=Low');
	await advance(6);
	const status = Ocean.status(ocean);
	expect.equal(status.source, 'fft', 'the FFT');
	expect.truthy(status.parts.cascades && status.parts.painter && status.parts.glow && !status.parts.still, 'every part on');
	expect.equal(status.tierReason, 'url', 'the tier came from the URL');
	expect.equal(status.seed, 7, 'the shipped seed');
});

test('a teaching step switches the cascades, the painter and the glow off: they cost nothing', async () => {
	const { ocean, cascadeCounts, painterCounts, advance } = build();
	await advance(12);
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'sine' }));
	const cascadeBefore = { ...cascadeCounts };
	const painterBefore = { ...painterCounts };
	const evolveSeconds = ocean.stage.evolve;
	const paintSeconds = ocean.stage.paint;
	await advance(30);
	expect.equal(since(cascadeCounts, cascadeBefore, 'evolve'), 0, 'no evolve requests');
	expect.equal(since(painterCounts, painterBefore, 'paint'), 0, 'no Paints');
	expect.equal(ocean.stage.evolve, evolveSeconds, 'no evolve time');
	expect.equal(ocean.stage.paint, paintSeconds, 'no paint time');
	expect.truthy(ocean.strengths.every((s) => s === 0), 'no glow');
	const probe = probeSurface(ocean.surface);
	expect.equal(probe.zSpread, 0, 'one sine along x');
	expect.truthy(probe.maxAbsY > 1 && probe.maxAbsY <= 1.5, `amplitude 1.5: ${probe.maxAbsY}`);
	expect.equal(Ocean.status(ocean).source, 'waves', 'the status says so');
});

test('the flat plane is written once and then skipped every frame', async () => {
	const { ocean, advance } = build('?tier=Low');
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'sine', sine: { amplitude: 0, wavelength: 40, speed: 8 } }));
	await advance(3);
	expect.equal(ocean.parts.still, true, 'still');
	for (const p of ocean.surface.patches) p.written = false;
	await advance(5);
	expect.equal(ocean.surface.skipped, true, 'skipped');
	expect.truthy(ocean.surface.patches.every((p) => !p.written), 'nothing written');
	expect.equal(probeSurface(ocean.surface).maxAbsY, 0, 'flat');
});

test('the teaching bank draws its waves; chop moves the vertices sideways', async () => {
	const { ocean, advance } = build('?tier=Low');
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'bank', bank: { count: 32 } }));
	await advance(2);
	expect.equal(ocean.waves.count, 32, 'all 32 waves');
	expect.equal(probeSurface(ocean.surface).maxLateral, 0, 'chop 0: no sideways motion');
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'bank', bank: { count: 32 }, chop: 1 }));
	await advance(2);
	expect.truthy(probeSurface(ocean.surface).maxLateral > 0.1, 'chop 1: pointy crests pull the vertices sideways');
});

test('layers: only the switched-on cascades evolve, the rings sample them and the painter reads them', async () => {
	const { ocean, cascadeCounts, painterCounts, advance } = build();
	await advance(6);
	const painterBefore = { ...painterCounts };
	Ocean.configureStage(ocean, settings({ layers: [true, false, false] }));
	expect.truthy(ocean.surface.ringSpecs.every((spec) => spec.cascades.every((c) => c === 1)), 'the rings sample cascade 1 only');
	expect.truthy(since(painterCounts, painterBefore, 'update') >= 2, 'the painter lists updated on both workers');
	expect.equal(ocean.painter.mapsConfig.colourCascades.join(','), '1', 'the painter reads cascade 1');
	expect.equal(ocean.painter.mapsConfig.normalCascades.length, 0, 'and paints no normal map');
	const cascadeBefore = { ...cascadeCounts };
	await advance(12);
	expect.equal(since(cascadeCounts, cascadeBefore, 'evolve'), 4, 'cascade 1 alone, once every three frames');
	expect.equal(Ocean.status(ocean).layers.join(','), 'true,false,false', 'the status says so');
});

test('a wind slider dragged every frame retunes one cascade at a time, never faster than the gap, and never reconfigures anything (Review Focus 1)', async () => {
	const { ocean, cascadeCounts, painterCounts, advance } = build();
	await advance(6);
	const cascadeBefore = { ...cascadeCounts };
	const painterBefore = { ...painterCounts };
	const retuneFrames = [];
	const retuned = new Set();
	const original = ocean.cascades.retune;
	ocean.cascades.retune = (index) => {
		retuneFrames.push(ocean.frame);
		retuned.add(index);
		return original(index);
	};
	await advance(60, (i) => Ocean.configureStage(ocean, settings({ sea: { windSpeed: 6 + (i % 20), fetch: 80000 } })));
	const most = Math.ceil(60 / StageControl.RETUNE_GAP_FRAMES) + 1;
	expect.truthy(retuneFrames.length >= 3 && retuneFrames.length <= most, `retunes: ${retuneFrames.length}`);
	for (let i = 1; i < retuneFrames.length; i++) {
		expect.truthy(retuneFrames[i] - retuneFrames[i - 1] >= StageControl.RETUNE_GAP_FRAMES, 'spaced by the gap');
	}
	expect.equal(retuned.size, 3, 'every cascade took its turn: none starved while the slider moved');
	expect.equal(since(cascadeCounts, cascadeBefore, 'retune'), retuneFrames.length, 'every retune reached a worker');
	expect.equal(since(cascadeCounts, cascadeBefore, 'configure'), 0, 'no cascade Configure');
	expect.equal(since(painterCounts, painterBefore, 'configure'), 0, 'no painter Configure: the foam is never wiped');
	await advance(30);
	expect.truthy(ocean.retune.pending.every((pending) => !pending), 'the last wind reached every cascade');
});

test('a storm grows the bounds before its waves arrive, and the surface stays inside them (Review Focus 4)', async () => {
	const { ocean, advance } = build();
	await advance(6);
	const before = ocean.surface.bounds.height;
	Ocean.configureStage(ocean, settings({ sea: { windSpeed: 25, fetch: 200000 } }));
	expect.truthy(ocean.surface.bounds.height > before, `grew: ${ocean.surface.bounds.height}`);
	expect.equal(ocean.bounds, ocean.surface.bounds, 'the ocean and the surface agree');
	await advance(40);
	SurfaceState.takeExtremes(ocean.surface);
	await advance(12);
	const [maxY, maxLateral] = SurfaceState.takeExtremes(ocean.surface);
	expect.truthy(maxY > 20, `the storm arrived: ${maxY}`);
	expect.truthy(maxY < ocean.surface.bounds.height - SurfaceState.SKIRT_MARGIN, 'inside the height bound, above the skirt');
	expect.truthy(maxLateral < ocean.surface.bounds.lateral, 'inside the lateral bound');
	Ocean.configureStage(ocean, settings({ sea: { windSpeed: 3, fetch: 5000 } }));
	expect.truthy(ocean.surface.bounds.height > before, 'the bounds never shrink');
});

test('settings the maths cannot take are refused before anything changes (Review Focus 3)', () => {
	const { ocean } = build('?tier=Low');
	const params = ocean.live.params;
	for (const [bad, name] of [
		[settings({ sea: { windSpeed: 0, fetch: 80000 } }), 'windSpeed'],
		[settings({ source: 'wobble' }), 'source'],
		[settings({ chop: Number.NaN }), 'chop'],
		[settings({ layers: 'all' }), 'layers'],
		[settings({ bank: { count: 40 } }), 'bank.count'],
		[settings({ sine: { amplitude: 1, wavelength: -3, speed: 1 } }), 'wavelength'],
		[settings({ warm: { fft: true } }), 'warm'],
	]) {
		let message = '';
		try {
			Ocean.configureStage(ocean, bad);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes(name), `${name}: ${message}`);
	}
	expect.equal(ocean.live.params, params, 'the sea is untouched');
	expect.equal(ocean.stageSettings, null, 'no settings adopted');
});

test('glow off zeroes every strength; the glow slider scales it', async () => {
	const { ocean, advance } = build('?tier=Low');
	await advance(4);
	const strongest = Math.max(...ocean.strengths);
	expect.truthy(strongest > 0, 'glowing');
	Ocean.configureStage(ocean, settings({ glowStrength: 60 }));
	await advance(2);
	expect.near(Math.max(...ocean.strengths), strongest * 2, 1e-4 * strongest, 'twice the strength');
	Ocean.configureStage(ocean, settings({ glow: false }));
	await advance(2);
	expect.truthy(ocean.strengths.every((s) => s === 0), 'dark');
});

test('chop and the foam sliders reach the painter as updates, never as a Configure', async () => {
	const { ocean, painterCounts, advance } = build('?tier=Low');
	await advance(4);
	const before = { ...painterCounts };
	Ocean.configureStage(ocean, settings({ chop: 0.5, foamKnobs: { whitecap: 0.7, decay: 0.8 } }));
	expect.equal(since(painterCounts, before, 'update'), 2, 'one update to each worker');
	expect.equal(since(painterCounts, before, 'configure'), 0, 'no Configure');
	expect.equal(ocean.painter.mapsConfig.chop, 0.5, 'chop kept');
	expect.equal(ocean.painter.colourConfig.foamWhitecap, 0.7, 'whitecap kept');
	Ocean.configureStage(ocean, settings({ chop: 0.5, foamKnobs: { whitecap: 0.7, decay: 0.8 } }));
	expect.equal(since(painterCounts, before, 'update'), 2, 'the same settings again send nothing');
});

test('a warm part runs while the scroll sits between two recipes, so it is ready when it shows', async () => {
	const { ocean, cascadeCounts, painterCounts, advance } = build();
	await advance(4);
	const cascadeBefore = { ...cascadeCounts };
	const painterBefore = { ...painterCounts };
	Ocean.configureStage(ocean, settings({ ...TEACHING, source: 'bank', warm: { fft: true, maps: true, layers: [true, false, false] } }));
	await advance(12);
	expect.truthy(since(cascadeCounts, cascadeBefore, 'evolve') > 0, 'cascade 1 evolving while the bank shows');
	expect.truthy(since(painterCounts, painterBefore, 'paint') > 0, 'the painter painting');
	expect.equal(Ocean.status(ocean).source, 'waves', 'the bank is what shows');
	expect.truthy(ocean.surface.ringSpecs.every((spec) => spec.cascades.length === 0), 'the rings sample no cascade');
});

test('phones get the lighter tier by rule; the URL still wins (Review Focus 5)', () => {
	const phone = build('', { deviceTier: 'Medium' }).ocean;
	expect.equal(phone.tierName, 'Medium', 'Medium');
	expect.equal(Ocean.status(phone).tierReason, 'phone rule', 'and says why');
	expect.equal(phone.layout.vertexCount, 6480, "lighter: 6,480 vertices against High's 18,144");
	const forced = build('?tier=Low', { deviceTier: 'Medium' }).ocean;
	expect.equal(forced.tierName, 'Low', 'the URL wins');
});

test('a Medium ocean takes three-layer settings without complaint (Review Focus 5)', async () => {
	const { ocean, advance } = build('?tier=Medium');
	Ocean.configureStage(ocean, settings({ layers: [true, true, true] }));
	await advance(6);
	expect.equal(ocean.layerOn.length, 2, 'two cascades');
	expect.equal(Ocean.status(ocean).layers.join(','), 'true,true', 'both sampled');
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/engine/config.test.js tests/ocean/engine/stageControl.test.js`
Expected: FAIL: `Config.tierForDevice is not a function` and `ERR_MODULE_NOT_FOUND` for `stageControl.js`.

- [ ] **Step 4: Add the phone rule and the cascade seed to `content/ocean/js/engine/config.js`**

After `export const CAMERAS = ...` add:

```js
// Phones get the lighter tier by rule, not by measurement (decided with Cole 2026-09-30; A3 owns
// the rule): a touch-first device whose screen's SHORTER side is under 900 CSS px, so a phone held
// sideways still counts. Medium, not Low: it draws 6,480 vertices against High's 18,144 and keeps
// two of the three cascade layers, so the story's step 10 still has layers to toggle, where Low's
// single cascade would leave one. Unmeasured on a real phone; the page's numbers say so.
export const PHONE_SHORT_SIDE = 900;
export const PHONE_TIER = 'Medium';

// The tier the phone rule gives this device, or null when it does not apply (the probe decides).
export function tierForDevice({ shortSide, coarsePointer }) {
	return Number.isFinite(shortSide) && shortSide < PHONE_SHORT_SIDE && coarsePointer === true ? PHONE_TIER : null;
}

// Cascade `index`'s random seed for the sea numbered `seed`: the formula WaveField.create and the
// coordinator have used since A1, so seed 7 is the shipped sea.
export function cascadeSeed(seed, index) {
	return seed * 7919 + index;
}
```

- [ ] **Step 5: Write `content/ocean/js/engine/stageControl.js`**

```js
// The stage switches (A3; not a twin): how a story step's recipe reaches the running ocean (spec
// 4.3). The director hands `configure` the blended recipe's settings whenever they change, and
// this works out what differs from the last ones and does only that:
//   * the wave source: a sine or the teaching bank drawn through the surface's swells slot with
//     every ring's cascade list empty (waveBanks.js), or the FFT cascades;
//   * which parts run at all -- the cascades (evolve and blend), the painter, the glow -- so a
//     part a recipe switches off costs nothing: no evolve request, no Paint, no glow pass, and a
//     still surface is not rewritten. A part the neighbouring recipe needs keeps running while
//     the scroll is between the two (`warm`), so it is ready by the time it shows;
//   * which cascade layers run and which the rings sample (step 10), and the painter's lists;
//   * live knobs without restarting anything: chop and the foam sliders reach the painter as an
//     `update` (painterWorkerCore); a wind, fetch or seed change marks every cascade for a
//     retune, which the frame loop sends one cascade at a time, on that cascade's own rotation
//     frame and no closer than RETUNE_GAP_FRAMES to the last (retuneDue), so a slider dragged
//     every frame costs at most one spectrum rebuild in seven frames, the cascades in turn;
//   * the patch bounds, which only grow (bounds.js), and whether the vertex normals are written.
// Settings are checked whole before anything changes, so a refused set leaves the ocean as it was.
import * as Spectrum from '../core/spectrum.js';
import * as Swells from '../core/swells.js';
import { bankBounds, boundsFor, grow } from './bounds.js';
import { LOOK, SEED } from './config.js';
import * as PainterClient from './painterClient.js';
import * as SurfaceState from './surfaceState.js';
import * as WaveBanks from './waveBanks.js';

// Seven, not six: a gap that is a multiple of the three-frame rotation would land every retune on
// the same cascade's rotation frame, and while a slider is dragged (which re-marks every cascade
// each frame) that cascade would take every retune and starve the other two. Seven steps on to the
// next cascade each time, so they take turns.
export const RETUNE_GAP_FRAMES = 7;
export const SOURCES = Object.freeze(['sine', 'bank', 'fft']);

// The hero sea as settings: the rough default Cole judged in A2 (config.js's defaults), every
// part on, the FFT shown. What the ocean runs before any stage is configured.
export const DEFAULT_SETTINGS = Object.freeze({
	source: 'fft',
	sine: Object.freeze({ amplitude: 1.5, wavelength: 40, speed: 8 }),
	bank: Object.freeze({ count: 32 }),
	chop: LOOK.SEA.chop,
	sea: Object.freeze({ windSpeed: Spectrum.NORMAL.windSpeed, fetch: Spectrum.NORMAL.fetch }),
	seed: SEED,
	layers: Object.freeze([true, true, true]),
	maps: true,
	foam: true,
	foamKnobs: Object.freeze({ whitecap: LOOK.FOAM.whitecap, decay: LOOK.FOAM.decay }),
	glow: true,
	glowStrength: LOOK.SCATTER.strength,
	normals: true,
	warm: Object.freeze({ fft: false, maps: false, layers: Object.freeze([false, false, false]) }),
});

function fail(name, rule, value) {
	const shown = value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value);
	throw new RangeError(`stage settings: ${name} must be ${rule}, got ${shown}`);
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const flagList = (value) => Array.isArray(value) && value.length >= 1 && value.every((v) => typeof v === 'boolean');

// Checks a whole EngineSettings (see the plan's Conventions) and returns it; throws a RangeError
// naming the first field that is missing or out of range.
export function normalise(s) {
	if (s === null || typeof s !== 'object') {
		fail('settings', 'an object', s);
	}
	if (!SOURCES.includes(s.source)) {
		fail('source', `one of ${SOURCES.join(', ')}`, s.source);
	}
	WaveBanks.checkSine(s.sine ?? {});
	const most = WaveBanks.TEACHING_RECIPE.count;
	if (!finite(s.bank?.count) || s.bank.count < 0 || s.bank.count > most) {
		fail('bank.count', `a number in 0 .. ${most}`, s.bank?.count);
	}
	if (!finite(s.chop) || s.chop < 0 || s.chop > 2) {
		fail('chop', 'a number in 0 .. 2', s.chop);
	}
	if (!finite(s.sea?.windSpeed) || !finite(s.sea?.fetch)) {
		fail('sea', 'a finite windSpeed and fetch', s.sea);
	}
	if (!Number.isInteger(s.seed)) {
		fail('seed', 'an integer', s.seed);
	}
	if (!flagList(s.layers)) {
		fail('layers', 'a list of true or false', s.layers);
	}
	for (const name of ['maps', 'foam', 'glow', 'normals']) {
		if (typeof s[name] !== 'boolean') {
			fail(name, 'true or false', s[name]);
		}
	}
	if (!finite(s.foamKnobs?.whitecap) || !finite(s.foamKnobs?.decay)) {
		fail('foamKnobs', 'a finite whitecap and decay', s.foamKnobs);
	}
	if (!finite(s.glowStrength) || s.glowStrength < 0) {
		fail('glowStrength', 'a finite number >= 0', s.glowStrength);
	}
	if (typeof s.warm?.fft !== 'boolean' || typeof s.warm?.maps !== 'boolean' || !flagList(s.warm?.layers)) {
		fail('warm', '{ fft, maps, layers } of true or false', s.warm);
	}
	return s;
}

// The teaching clock: never wrapped, so a sine whose speed the visitor sets never meets the FFT's
// 120 s loop seam; the frozen time when the URL freezes the clock.
export function teachTime(ocean) {
	return ocean.config.freeze ?? ocean.now() - ocean.startedAt;
}

const sameFlags = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
const sameLists = (a, b) => ['mask', 'colour', 'normal'].every((key) => a[key].join(',') === b[key].join(','));

// The painter's lists for the layers shown: mask and colour read every layer that is on, the
// normal map every one but cascade 1, whose slopes the vertices carry (PainterClient.cascades).
function cascadeLists(shown) {
	const on = [];
	shown.forEach((value, i) => {
		if (value) on.push(i + 1);
	});
	return { mask: on, colour: on, normal: on.filter((c) => c > 1) };
}

function applySource(ocean, s, before) {
	if (s.source === 'sine') {
		const same =
			before?.source === 'sine' &&
			before.sine.amplitude === s.sine.amplitude &&
			before.sine.wavelength === s.sine.wavelength &&
			before.sine.speed === s.sine.speed;
		if (!same) {
			ocean.sine = WaveBanks.nextSine(ocean.sine, s.sine, teachTime(ocean));
		}
		ocean.waves = ocean.sine.bank;
	} else if (s.source === 'bank') {
		ocean.teachingBank ??= WaveBanks.teachingBank();
		if (before?.source !== 'bank' || before.bank.count !== s.bank.count) {
			ocean.waves = WaveBanks.withCount(ocean.teachingBank, s.bank.count);
		}
	}
	ocean.source = s.source === 'fft' ? 'fft' : 'waves';
}

function applyLayers(ocean, s) {
	const count = ocean.preset.sizes.length;
	const shown = Array.from({ length: count }, (_, i) => s.layers[i] === true);
	const fft = s.source === 'fft';
	const running = fft || s.warm.fft;
	// What runs: the layers shown, and the ones the neighbouring recipe needs while between.
	ocean.layerOn = shown.map((on, i) => running && (on || s.warm.layers[i] === true));
	// What the rings sample: the layers shown, and only while the FFT is what shows.
	const sampled = shown.map((on) => fft && on);
	if (!sameFlags(sampled, ocean.sampled)) {
		ocean.sampled = sampled;
		SurfaceState.setRingCascades(ocean.surface, sampled);
	}
	const lists = cascadeLists(shown);
	if (!sameLists(lists, ocean.painterLists)) {
		ocean.painterLists = lists;
		const update = { maskCascades: lists.mask, colourCascades: lists.colour };
		// The calibration views set their own normal map (ocean.js painterConfigFor); leave it.
		if (!ocean.config.calibrate) {
			update.normalCascades = lists.normal;
		}
		PainterClient.update(ocean.painter, update);
	}
}

function applyKnobs(ocean, s, before, params) {
	const live = ocean.live;
	const painter = {};
	if (s.chop !== live.chop) {
		live.chop = s.chop;
		painter.chop = s.chop;
	}
	if (params.windSpeed !== live.params.windSpeed || params.fetch !== live.params.fetch || s.seed !== live.seed) {
		live.params = Object.freeze(params);
		live.seed = s.seed;
		ocean.retune.pending.fill(true);
	}
	const foamChanged =
		!before ||
		before.foam !== s.foam ||
		before.foamKnobs.whitecap !== s.foamKnobs.whitecap ||
		before.foamKnobs.decay !== s.foamKnobs.decay;
	if (foamChanged) {
		painter.foamEnabled = s.foam;
		painter.foamWhitecap = s.foamKnobs.whitecap;
		painter.foamDecay = s.foamKnobs.decay;
	}
	if (Object.keys(painter).length > 0) {
		PainterClient.update(ocean.painter, painter);
	}
	if (s.glowStrength !== live.scatter.strength) {
		live.scatter = Object.freeze({ ...live.scatter, strength: s.glowStrength });
	}
}

function applyBounds(ocean) {
	const live = ocean.live;
	let next = grow(ocean.surface.bounds, boundsFor({ params: live.params, chop: live.chop, swellScale: ocean.config.swellScale }));
	if (ocean.source === 'waves') {
		next = grow(next, bankBounds(WaveBanks.bankExtent(ocean.waves), live.chop));
	}
	if (next.lateral !== ocean.surface.bounds.lateral || next.height !== ocean.surface.bounds.height) {
		SurfaceState.setBounds(ocean.surface, next);
		ocean.bounds = ocean.surface.bounds;
	}
}

function applyParts(ocean, s) {
	const wasGlowing = ocean.parts.glow;
	const still = s.source === 'fft' ? !ocean.sampled.some(Boolean) && Swells.isSilent(ocean.swells) : ocean.waves.silent;
	ocean.parts = Object.freeze({
		cascades: ocean.layerOn.some(Boolean),
		painter: s.maps || s.warm.maps,
		glow: s.glow,
		still,
	});
	if (wasGlowing && !s.glow) {
		ocean.strengths.fill(0);
	}
}

/**
 * Brings the ocean to these settings, doing only what differs from the last ones.
 * @param {object} ocean from Ocean.create
 * @param {object} settings an EngineSettings (plan Conventions)
 */
export function configure(ocean, settings) {
	const s = normalise(settings);
	// Checked before anything changes, like the rest: a refused sea leaves the ocean as it was.
	const params = Spectrum.validateParams({ ...ocean.live.params, windSpeed: s.sea.windSpeed, fetch: s.sea.fetch });
	const before = ocean.stageSettings;
	applySource(ocean, s, before);
	applyLayers(ocean, s);
	applyKnobs(ocean, s, before, params);
	applyBounds(ocean);
	applyParts(ocean, s);
	SurfaceState.setFlatNormals(ocean.surface, !s.normals || ocean.config.flatNormals);
	ocean.stageSettings = s;
}

/**
 * Sends cascade `index` its retune if one is pending and the last retune was at least
 * RETUNE_GAP_FRAMES ago. Called by the frame loop on that cascade's own rotation frame, BEFORE its
 * evolve request, so the worker rebuilds and then answers the evolve with the new sea. A worker
 * that has not answered its Configure keeps the retune pending.
 */
export function retuneDue(ocean, index) {
	const retune = ocean.retune;
	if (!retune.pending[index - 1] || ocean.frame - retune.lastFrame < RETUNE_GAP_FRAMES) {
		return false;
	}
	if (ocean.cascades.retune(index) === 'waiting') {
		return false;
	}
	retune.pending[index - 1] = false;
	retune.lastFrame = ocean.frame;
	return true;
}
```

- [ ] **Step 6: Wire the switches into `content/ocean/js/engine/ocean.js`**

(a) Add to the header comment, after the paragraph beginning "Differences from the Luau":

```js
//
// A3 adds the stage switches (stageControl.js): `configureStage` picks the wave source (the FFT,
// or a teaching sine or bank drawn through the surface's swells slot), which parts run at all,
// which cascade layers run and are sampled, and the live sea (wind, fetch, seed, chop, foam and
// glow knobs), which the cascades pick up through a retune and the painter through an update.
// Until a stage is configured every part runs and the FFT shows: the ocean is A2's.
```

(b) Imports: add `import * as StageControl from './stageControl.js';` and add `cascadeSeed` to the names imported from `./config.js`.

(c) Replace `cascadeConfigFor` with:

```js
// `live` is the ocean's live sea (params and seed), read whenever a cascade is configured or
// retuned, so a Configure re-sent after a timeout carries the sea the sliders last set.
function cascadeConfigFor(live, preset, bands, index) {
	return {
		n: preset.n,
		size: preset.sizes[index - 1],
		kMin: bands[index - 1].kMin,
		kMax: bands[index - 1].kMax,
		seed: cascadeSeed(live.seed, index),
		loopPeriod: LOOP_PERIOD,
		params: live.params,
	};
}
```

(d) In `tierLine`, replace `probeMs=${probe}` with `probeMs=${probe} tierReason=${ocean.tierReason}`.

(e) Replace the JSDoc and the first lines of `create` down to (not including) `const layout = ...` with:

```js
/**
 * @param {object} config from readConfig
 * @param {object} deps
 * @param {(index: number) => object} deps.spawnCascade a WorkerLike for a cascade, or throws
 * @param {(role: string) => object} deps.spawnPainter a WorkerLike for a painter role, or throws
 * @param {() => number} deps.now the wall clock in seconds (the Luau's GetServerTimeNow)
 * @param {number} [deps.probeMs] skips the probe with this result when nothing forces a tier
 * @param {string | null} [deps.deviceTier] the phone rule's tier (config.js tierForDevice), or null
 * @param {{ warn: Function, info?: Function }} [deps.log]
 */
export function create(config, { spawnCascade, spawnPainter, now, probeMs, deviceTier = null, log = console }) {
	// The sea the sliders can change while the ocean runs. It starts as the config's and is read by
	// every cascade Configure and retune, the surface write and the glow.
	const live = { params: config.params, chop: config.chop, seed: SEED, scatter: config.scatter };
	const bounds = boundsFor({ params: config.params, chop: config.chop, swellScale: config.swellScale });
	// The URL's tier first, then the phone rule, then the probe.
	const forced = config.tier ?? deviceTier;
	const measured = forced ? null : (probeMs ?? probeCascadeMs());
	const tierName = forced ?? Tier.choose(measured);
	const tierReason = config.tier ? 'url' : deviceTier ? 'phone rule' : 'probe';
	const preset = Tier.presets[tierName];
```

(f) In the `createCascades({...})` call, change `configFor` to `configFor: (index) => cascadeConfigFor(live, preset, bands, index),`.

(g) Add `tierReason,` after `tierName,` in the `ocean` object literal, and these fields after `quadCentre: new Float64Array(2),`:

```js
		live,
		// The stage switches (stageControl.js). Until a stage is configured every part runs and the
		// FFT shows: the ocean is A2's.
		parts: Object.freeze({ cascades: true, painter: true, glow: true, still: false }),
		source: 'fft',
		waves: null, // the teaching bank drawn while the source is 'waves'
		sine: null, // the last sine (waveBanks.nextSine), kept for its phase
		teachingBank: null, // the 32-wave bank, built the first time a step asks for it
		layerOn: preset.sizes.map(() => true), // which cascades evolve and blend
		sampled: preset.sizes.map(() => true), // which cascades the rings sample
		painterLists: PainterClient.cascades(preset.sizes.length),
		retune: { pending: preset.sizes.map(() => false), lastFrame: -Infinity },
		startedAt: now(),
		teachT: 0,
		stageSettings: null,
```

(h) Replace `evolveStage` and `blendStage` with:

```js
// Promote BEFORE asking for the next result, on this cascade's own rotation frame: whatever arrived
// since the last rotation becomes current, the old previous becomes the free waiting slot, and only
// then can a new result be sent into it. The fixed schedule is what lets the fade be counted in
// frames, and freeing the slot first is what stops an arrival from landing in a slot the display is
// reading. The request is at the CURRENT clock: the worker answers about a frame later, so a result
// is already slightly in the past when it lands. Leading the request was tried and reverted in the
// Luau (Cole saw the near water jitter); `blend` on the report is the measurement that says whether
// the frame-counted fade is working: 0.67 when nothing misses its rotation. The main-thread path
// receives synchronously after the promotion, so its result waits one rotation before it shows.
// A layer switched off (A3) is neither promoted nor asked for anything; a pending retune goes out
// just before the request, so the worker rebuilds first and answers with the new sea.
function evolveStage(ocean, t) {
	// null on a frame whose slot belongs to a cascade this tier does not have: no evolve at all.
	const index = OceanClock.cascadeForFrame(ocean.frame, ocean.store.count);
	if (index === null || !ocean.layerOn[index - 1]) {
		return;
	}
	StageControl.retuneDue(ocean, index);
	FieldStore.promote(ocean.store, index, ocean.frame);
	ocean.cascades.request(index, t, ocean.frame);
}

function blendStage(ocean) {
	const store = ocean.store;
	for (let index = 1; index <= store.count; index++) {
		const fraction = OceanClock.fadeFraction(ocean.frame, store.promotedFrame[index - 1], OceanClock.PERIOD);
		if (index === 1) {
			ocean.blendSum += fraction;
		}
		// A layer switched off keeps whatever its display last held; nothing samples it meanwhile.
		if (ocean.layerOn[index - 1]) {
			FieldStore.blend(store, index, fraction, BLEND_FIELDS);
		}
	}
}
```

(i) In `strengthStage`, replace `const params = ocean.config.scatter;` with `const params = ocean.live.scatter;`.

(j) Replace the body of `step` (keep its JSDoc) with:

```js
export function step(ocean, dtSeconds, focus, eye, sun) {
	ocean.frame += 1;
	if (Number.isFinite(dtSeconds) && dtSeconds > 0) {
		ocean.elapsed += dtSeconds;
	}
	const config = ocean.config;
	const t = config.freeze ?? OceanClock.time(ocean.now(), LOOP_PERIOD);
	ocean.t = t;
	ocean.teachT = StageControl.teachTime(ocean);
	const parts = ocean.parts;
	// A part switched off by the stage costs nothing: not called at all.
	if (parts.cascades) {
		timed(ocean, 'evolve', () => evolveStage(ocean, t));
		timed(ocean, 'blend', () => blendStage(ocean));
	}
	// One map to the painter, from the fields that were just blended. Sent BEFORE the vertices are
	// written so a worker paints alongside the write stage; the client charges `paint` itself.
	if (parts.painter) {
		PainterClient.step(ocean.painter, ocean.frame, t, ocean.store);
	}
	// Every ring follows what the camera LOOKS AT; each snaps that focus to its own lattice. The
	// frame number lets the outermost ring sit out the odd frames. A teaching source rides in the
	// swells slot on the teaching clock; a still surface is written only when a window moves.
	const surface = ocean.surface;
	const waves = ocean.source === 'waves';
	const started = performance.now();
	ocean.snapCount += SurfaceState.snapAndWrite(
		surface,
		focus[0],
		focus[1],
		ocean.store,
		waves ? ocean.waves : ocean.swells,
		waves ? ocean.teachT : t,
		ocean.live.chop,
		ocean.frame,
		parts.still,
	);
	ocean.stage.snap += surface.snapSeconds;
	ocean.stage.write += (performance.now() - started) / 1000 - surface.snapSeconds;
	// The horizon follows the LAST ring's window, never the raw camera: the hole it leaves for the
	// patches and that ring's square must be the same square.
	timed(ocean, 'horizon', () => {
		const outer = surface.centres[surface.centres.length - 1];
		HorizonState.update(ocean.horizon, outer.x, outer.z);
	});
	if (parts.glow) {
		timed(ocean, 'strength', () => strengthStage(ocean, eye, sun));
	}
	if (ocean.frame % REPORT_EVERY_FRAMES === 0) {
		ocean.lastReport = buildReport(ocean);
	}
}

/**
 * Brings the ocean to a story step's engine settings (stageControl.js); cheap when nothing changed.
 * @param {object} settings an EngineSettings (plan Conventions)
 */
export function configureStage(ocean, settings) {
	StageControl.configure(ocean, settings);
}

// The teaching clock (stageControl.js teachTime): the camera drift reads it too.
export function teachTime(ocean) {
	return StageControl.teachTime(ocean);
}
```

(k) In `status`, add after `sinkAttached: ocean.sink !== null,`:

```js
		tierReason: ocean.tierReason,
		source: ocean.source,
		parts: ocean.parts,
		layers: ocean.sampled.slice(),
		evolving: ocean.layerOn.slice(),
		chop: ocean.live.chop,
		windSpeed: ocean.live.params.windSpeed,
		fetch: ocean.live.params.fetch,
		seed: ocean.live.seed,
		foamCover: ocean.painter.foamCover,
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/engine/config.test.js tests/ocean/engine/stageControl.test.js && npm run test:ocean`
Expected: PASS: 6 config tests, 13 stage-control tests, and the whole suite green (the A2 ocean tests prove the default path is unchanged).

- [ ] **Step 8: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean
git add content/ocean/js/engine/stageControl.js content/ocean/js/engine/ocean.js content/ocean/js/engine/config.js tests/ocean/engine/stageControl.test.js tests/ocean/engine/config.test.js
git commit -m "feat: stage switches: wave source, parts that cost nothing when off, layers and a live sea"
```

---

### Task 6: Chart data: the spectrum, the phase arrows and the transform timing

**Files:**
- Create: `content/ocean/js/core/naiveDft.js` (teaching helper)
- Create: `content/ocean/js/engine/charts.js`
- Test: `tests/ocean/core/naiveDft.test.js`, `tests/ocean/engine/charts.test.js`

**Interfaces:**
- Consumes: A1 `core/cascade.js`, `core/fft.js`, `core/random.js`, `core/spectrum.js`, `core/tier.js`, `core/waveField.js`, `core/luau.js`; Task 5 `engine/config.js` `cascadeSeed`, plus `LOOP_PERIOD`, `SEED`.
- Produces:
  - `core/naiveDft.js`: `inverse2D(n, re, im, outRe, outIm) -> void` (same convention as `FFT.inverse2D`, out of place).
  - `engine/charts.js`: `SPECTRUM_AXIS` ({ from: 0.2, to: 6, points: 200 }), `MAX_NAIVE_N` (64);
    `spectrumCurve(params, { from, to, points, sizes, n } = {}) -> { omega: number[], physical: number[], shaped: number[], peakOmega, peakWavelength, bands: [{ size, kMin, kMax, omegaMin, omegaMax }] }`;
    `createPhaseArrows(params, { seed = 7, count = 8, sizes = High's, n = 64 } = {}) -> { components: [{ kx, kz, wavelength, omega, h0Re, h0Im, amplitude }] }` (cascade 1's tallest components, the very waves the ocean's cascade 1 holds at that seed);
    `phaseArrowsAt(arrows, t) -> [{ re, im, amplitude, omega, wavelength, kx, kz }]`;
    `measureTransforms(n, { seed = 1 } = {}) -> { n, waves, naiveMs, fftMs, speedup, operations: { naive, fft }, maxDifference }`.

- [ ] **Step 1: Write the failing tests**

`tests/ocean/core/naiveDft.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as FFT from '../../../content/ocean/js/core/fft.js';
import * as NaiveDft from '../../../content/ocean/js/core/naiveDft.js';
import * as Random from '../../../content/ocean/js/core/random.js';

test('the term-by-term sum agrees with the FFT, value for value', () => {
	const n = 8;
	const random = Random.create(3);
	const re = new Float64Array(n * n).map(() => random.nextNumber() - 0.5);
	const im = new Float64Array(n * n).map(() => random.nextNumber() - 0.5);
	const outRe = new Float64Array(n * n);
	const outIm = new Float64Array(n * n);
	NaiveDft.inverse2D(n, re, im, outRe, outIm);
	const fftRe = re.slice();
	const fftIm = im.slice();
	FFT.inverse2D(FFT.plan(n), fftRe, fftIm);
	for (let i = 0; i < n * n; i++) {
		expect.near(outRe[i], fftRe[i], 1e-12, `re ${i}`);
		expect.near(outIm[i], fftIm[i], 1e-12, `im ${i}`);
	}
});

test('one frequency in, one plane wave out: exp(+2 pi i (kColumn mColumn + kRow mRow) / n)', () => {
	const n = 8;
	const re = new Float64Array(n * n);
	const im = new Float64Array(n * n);
	re[1 * n + 2] = 1; // kRow 1, kColumn 2
	const outRe = new Float64Array(n * n);
	const outIm = new Float64Array(n * n);
	NaiveDft.inverse2D(n, re, im, outRe, outIm);
	for (const [row, column] of [[0, 0], [3, 5], [7, 1]]) {
		const angle = (2 * Math.PI * (2 * column + 1 * row)) / n;
		expect.near(outRe[row * n + column], Math.cos(angle), 1e-12, `cos at ${row},${column}`);
		expect.near(outIm[row * n + column], Math.sin(angle), 1e-12, `sin at ${row},${column}`);
	}
});

test('arrays of the wrong size, or the output given as the input, are refused', () => {
	const attempt = (fn) => {
		try {
			fn();
			return 'ok';
		} catch (error) {
			return error.message;
		}
	};
	const a = new Float64Array(16);
	expect.truthy(attempt(() => NaiveDft.inverse2D(4, a, a, new Float64Array(15), new Float64Array(16))).includes('outRe'), 'short output');
	expect.truthy(attempt(() => NaiveDft.inverse2D(4, a, new Float64Array(16), a, new Float64Array(16))).includes('output'), 'in place');
});
```

`tests/ocean/engine/charts.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import * as WaveField from '../../../content/ocean/js/core/waveField.js';
import { cascadeSeed, readConfig } from '../../../content/ocean/js/engine/config.js';
import * as Charts from '../../../content/ocean/js/engine/charts.js';

const HERO = readConfig('').params;

test('the spectrum curve is plain arrays over the fixed axis, peaking where JONSWAP says', () => {
	const curve = Charts.spectrumCurve(HERO);
	for (const name of ['omega', 'physical', 'shaped']) {
		expect.truthy(Array.isArray(curve[name]), `${name} is a plain array`);
		expect.equal(curve[name].length, Charts.SPECTRUM_AXIS.points, `${name} has one value per point`);
	}
	expect.equal(curve.omega[0], Charts.SPECTRUM_AXIS.from, 'axis start');
	expect.equal(curve.omega.at(-1), Charts.SPECTRUM_AXIS.to, 'axis end');
	const step = curve.omega[1] - curve.omega[0];
	const peakIndex = curve.physical.indexOf(Math.max(...curve.physical));
	expect.near(curve.omega[peakIndex], Spectrum.peakOmega(HERO), step, 'the peak where peakOmega is');
	expect.near(curve.peakWavelength, (2 * Math.PI * 9.81) / Spectrum.peakOmega(HERO) ** 2, 1e-9, 'the deep-water peak wavelength');
	for (const i of [10, peakIndex, 150]) {
		const w = curve.omega[i];
		const boost = w > curve.peakOmega ? (w / curve.peakOmega) ** (2 * HERO.tailBoost) : 1;
		expect.near(curve.shaped[i], curve.physical[i] * HERO.scale ** 2 * boost, 1e-9 * curve.shaped[i] + 1e-15, `shaped ${i} is the sea's shaping`);
	}
});

test('a stronger wind moves the peak to longer waves and lifts it', () => {
	const calm = Charts.spectrumCurve({ ...HERO, windSpeed: 6 });
	const storm = Charts.spectrumCurve({ ...HERO, windSpeed: 20 });
	expect.truthy(storm.peakOmega < calm.peakOmega, 'the peak moves down');
	expect.truthy(Math.max(...storm.physical) > Math.max(...calm.physical), 'and up');
});

test("the bands are the cascades' wavenumber ranges, in omega too", () => {
	const curve = Charts.spectrumCurve(HERO);
	const bands = WaveField.bands([256, 64, 16], 64);
	expect.equal(curve.bands.length, 3, 'three layers');
	expect.equal(curve.bands[0].size, 256, 'largest first');
	expect.equal(curve.bands[1].kMin, bands[1].kMin, 'the handover');
	expect.equal(curve.bands[2].kMax, (Math.PI * 64) / 16, 'the open top capped at Nyquist');
	expect.near(curve.bands[1].omegaMin, Spectrum.omega(bands[1].kMin, HERO), 1e-12, 'omega of the handover');
});

test('the spectrum refuses a sea the maths cannot take', () => {
	let message = '';
	try {
		Charts.spectrumCurve({ ...HERO, windSpeed: 0 });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('windSpeed'), message);
});

test("the phase arrows are cascade 1's tallest waves at the ocean's seed, turning at their own omega", () => {
	const arrows = Charts.createPhaseArrows(HERO, { seed: 7, count: 6 });
	expect.equal(arrows.components.length, 6, 'six arrows');
	for (let i = 1; i < 6; i++) {
		expect.truthy(arrows.components[i].amplitude <= arrows.components[i - 1].amplitude, 'tallest first');
	}
	const band = WaveField.bands([256, 64, 16], 64)[0];
	const cascade = Cascade.create({ n: 64, size: 256, kMin: band.kMin, kMax: band.kMax, seed: cascadeSeed(7, 1), loopPeriod: 120, params: HERO });
	let tallest = 0;
	for (let i = 1; i < cascade.cells; i++) {
		if (Math.hypot(cascade.h0Re[i], cascade.h0Im[i]) > Math.hypot(cascade.h0Re[tallest], cascade.h0Im[tallest])) tallest = i;
	}
	expect.equal(arrows.components[0].h0Re, cascade.h0Re[tallest], "the ocean's own tallest wave");
	const start = Charts.phaseArrowsAt(arrows, 0);
	expect.equal(start[0].re, arrows.components[0].h0Re, 'at t = 0 the arrow is h0');
	const later = Charts.phaseArrowsAt(arrows, 3.7);
	for (let i = 0; i < 6; i++) {
		const c = arrows.components[i];
		expect.near(Math.hypot(later[i].re, later[i].im), c.amplitude, 1e-12, `arrow ${i} keeps its length`);
		const turned = Math.atan2(later[i].im, later[i].re) - Math.atan2(c.h0Im, c.h0Re);
		const expected = -c.omega * 3.7;
		expect.near(Math.cos(turned), Math.cos(expected), 1e-9, `arrow ${i} turned by -omega t`);
		expect.near(Math.sin(turned), Math.sin(expected), 1e-9, `arrow ${i} turned by -omega t (sine)`);
	}
	const looped = Charts.phaseArrowsAt(arrows, 120);
	expect.near(looped[0].re, start[0].re, 1e-9, 'the loop period brings every arrow home');
	expect.truthy(Array.isArray(later), 'plain array');
});

test('the transform timing measures both ways and proves they agree', () => {
	const result = Charts.measureTransforms(8);
	expect.equal(result.n, 8, 'n');
	expect.equal(result.waves, 64, 'n x n waves');
	expect.truthy(result.naiveMs > 0 && result.fftMs > 0, `both timed: ${result.naiveMs}, ${result.fftMs}`);
	expect.near(result.speedup, result.naiveMs / result.fftMs, 1e-12, 'speedup');
	expect.equal(result.operations.naive, 64 * 64, 'naive: every wave into every point');
	expect.equal(result.operations.fft, 64 * 3, 'fft: n^2 log2 n butterflies');
	expect.truthy(result.maxDifference < 1e-9, `the two agree: ${result.maxDifference}`);
	for (const bad of [12, 128, 1, 8.5]) {
		let message = '';
		try {
			Charts.measureTransforms(bad);
		} catch (error) {
			message = error.message;
		}
		expect.truthy(message.includes('power of two'), `n=${bad} refused: ${message}`);
	}
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/core/naiveDft.test.js tests/ocean/engine/charts.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `content/ocean/js/core/naiveDft.js`**

```js
// Teaching helper for step 9, not a twin of any Luau module: the inverse 2-D DFT summed term by
// term, the O(n^4) way the FFT replaces. Same convention as FFT.inverse2D, so the two can be
// compared value for value: x[m] = sum_k X[k] exp(+2 pi i k . m / n), no scaling, n x n row-major
// arrays, index = row * n + column. Out of place: every output sums the whole input.
import { check } from './luau.js';

export function inverse2D(n, re, im, outRe, outIm) {
	check(Number.isInteger(n) && n >= 1, `n must be a positive integer, got ${n}`);
	const cells = n * n;
	for (const [name, array] of [['re', re], ['im', im], ['outRe', outRe], ['outIm', outIm]]) {
		check(array.length === cells, `${name} holds ${array.length} values, needs ${cells}`);
	}
	check(outRe !== re && outRe !== im && outIm !== re && outIm !== im, 'the output must not be the input: every sum reads the whole input');
	const cosines = new Float64Array(n);
	const sines = new Float64Array(n);
	for (let j = 0; j < n; j++) {
		cosines[j] = Math.cos((2 * Math.PI * j) / n);
		sines[j] = Math.sin((2 * Math.PI * j) / n);
	}
	for (let mRow = 0; mRow < n; mRow++) {
		for (let mColumn = 0; mColumn < n; mColumn++) {
			let sumRe = 0;
			let sumIm = 0;
			for (let kRow = 0; kRow < n; kRow++) {
				const rowTurn = (kRow * mRow) % n;
				for (let kColumn = 0; kColumn < n; kColumn++) {
					// The angle in whole n-ths of a turn: exp(+2 pi i j / n).
					const j = (rowTurn + kColumn * mColumn) % n;
					const index = kRow * n + kColumn;
					const c = cosines[j];
					const s = sines[j];
					sumRe += re[index] * c - im[index] * s;
					sumIm += re[index] * s + im[index] * c;
				}
			}
			outRe[mRow * n + mColumn] = sumRe;
			outIm[mRow * n + mColumn] = sumIm;
		}
	}
}
```

- [ ] **Step 4: Write `content/ocean/js/engine/charts.js`**

```js
// The numbers behind the story's charts (A3; not a twin): the spectrum curve of step 7, the
// spinning phase arrows of step 8 and the naive-sum against FFT timing of step 9, as plain arrays
// and objects. Nothing here draws; piece C does. Every number comes from the same core the ocean
// runs, at the parameters it is given (the page passes the ocean's live ones), so a chart never
// shows a sea the water is not.
import * as Cascade from '../core/cascade.js';
import * as FFT from '../core/fft.js';
import * as NaiveDft from '../core/naiveDft.js';
import * as Random from '../core/random.js';
import * as Spectrum from '../core/spectrum.js';
import * as Tier from '../core/tier.js';
import * as WaveField from '../core/waveField.js';
import { check } from '../core/luau.js';
import { cascadeSeed, LOOP_PERIOD, SEED } from './config.js';

// A fixed axis, so moving the wind moves the curve rather than the axis: 0.2 to 6 rad/s holds the
// peak from the calmest slider setting (wind 3 m/s at 5,000 m, peak 4.1 rad/s) to the stormiest
// (25 m/s at 200,000 m, 0.59 rad/s).
export const SPECTRUM_AXIS = Object.freeze({ from: 0.2, to: 6, points: 200 });
// The naive sum is O(n^4): 38 ms at n = 64 in Node on Cole's Mac (2026-09-30), about 0.6 s at 128,
// which would freeze the page.
export const MAX_NAIVE_N = 64;
// Fast runs are repeated until the clock has something to read: browsers coarsen performance.now().
const MIN_TIMED_MS = 5;
const MAX_RUNS = 2000;

/**
 * S(omega) across the axis: `physical` is JONSWAP with the depth factor (m^2 s / rad), `shaped` is
 * what the sea actually runs, times scale^2 and the tail boost above the peak (Spectrum.variance's
 * shaping). `bands` are the cascades' wavenumber ranges, open tops capped at Nyquist, in k and in
 * omega, for a chart that shades which layer carries which waves.
 */
export function spectrumCurve(
	params,
	{
		from = SPECTRUM_AXIS.from,
		to = SPECTRUM_AXIS.to,
		points = SPECTRUM_AXIS.points,
		sizes = Tier.presets.High.sizes,
		n = Tier.presets.High.n,
	} = {},
) {
	Spectrum.validateParams(params);
	check(Number.isFinite(from) && from > 0 && Number.isFinite(to) && to > from, `the axis must run upwards from a positive omega, got ${from} .. ${to}`);
	check(Number.isInteger(points) && points >= 2, `points must be an integer of at least 2, got ${points}`);
	const peakOmega = Spectrum.peakOmega(params);
	const omega = [];
	const physical = [];
	const shaped = [];
	for (let i = 0; i < points; i++) {
		const w = i === points - 1 ? to : from + ((to - from) * i) / (points - 1);
		const s = Spectrum.jonswap(w, params) * Spectrum.depthFactor(w, params);
		const boost = w > peakOmega ? (w / peakOmega) ** (2 * params.tailBoost) : 1;
		omega.push(w);
		physical.push(s);
		shaped.push(s * params.scale * params.scale * boost);
	}
	const bands = WaveField.bands(sizes, n).map((band, i) => {
		const kMax = Math.min(band.kMax, (Math.PI * n) / sizes[i]);
		return { size: sizes[i], kMin: band.kMin, kMax, omegaMin: Spectrum.omega(band.kMin, params), omegaMax: Spectrum.omega(kMax, params) };
	});
	return { omega, physical, shaped, peakOmega, peakWavelength: (2 * Math.PI * params.gravity) / (peakOmega * peakOmega), bands };
}

/**
 * The `count` tallest starting waves of cascade 1 at this sea and seed: the very h0 the ocean's
 * cascade 1 holds (same band, seed and loop period), so the arrows beside the ocean are its own
 * waves. Builds one cascade (4 to 9 ms in Node): make it once per sea and seed, then read it with
 * phaseArrowsAt every frame.
 */
export function createPhaseArrows(params, { seed = SEED, count = 8, sizes = Tier.presets.High.sizes, n = Tier.presets.High.n } = {}) {
	check(Number.isInteger(count) && count >= 1 && count <= n * n, `count must be an integer 1 .. ${n * n}, got ${count}`);
	const band = WaveField.bands(sizes, n)[0];
	const cascade = Cascade.create({ n, size: sizes[0], kMin: band.kMin, kMax: band.kMax, seed: cascadeSeed(seed, 1), loopPeriod: LOOP_PERIOD, params });
	const amplitude = (i) => Math.hypot(cascade.h0Re[i], cascade.h0Im[i]);
	const order = Array.from({ length: cascade.cells }, (_, i) => i).sort((a, b) => amplitude(b) - amplitude(a) || a - b);
	const components = order.slice(0, count).map((i) =>
		Object.freeze({
			kx: cascade.kx[i],
			kz: cascade.kz[i],
			wavelength: 2 * Math.PI * cascade.invK[i],
			omega: cascade.omega[i],
			h0Re: cascade.h0Re[i],
			h0Im: cascade.h0Im[i],
			amplitude: amplitude(i),
		}),
	);
	return Object.freeze({ components: Object.freeze(components) });
}

// Each arrow at time t: h0 e^{-i omega t} (Euler's formula), the phasor the cascade's evolve turns.
export function phaseArrowsAt(arrows, t) {
	check(Number.isFinite(t), `t must be finite, got ${t}`);
	return arrows.components.map((c) => {
		const phase = -c.omega * t;
		const cp = Math.cos(phase);
		const sp = Math.sin(phase);
		return { re: c.h0Re * cp - c.h0Im * sp, im: c.h0Re * sp + c.h0Im * cp, amplitude: c.amplitude, omega: c.omega, wavelength: c.wavelength, kx: c.kx, kz: c.kz };
	});
}

function timePerRun(run) {
	let runs = 0;
	let elapsed = 0;
	const started = performance.now();
	do {
		run();
		runs += 1;
		elapsed = performance.now() - started;
	} while (elapsed < MIN_TIMED_MS && runs < MAX_RUNS);
	return elapsed / runs;
}

/**
 * One n x n grid of random waves summed both ways, timed live on this machine: the naive
 * term-by-term inverse DFT and the radix-2 FFT the ocean runs, and the largest difference between
 * their answers. `operations` counts complex multiply-adds: n^4 for the naive sum, n^2 log2 n
 * butterflies for the FFT. The FFT time includes copying its input (it works in place). Runs on
 * the calling thread: the naive sum at n = 64 blocks for tens of milliseconds, so call it on a
 * slider change, never per frame.
 */
export function measureTransforms(n, { seed = 1 } = {}) {
	check(
		Number.isInteger(n) && n >= 2 && n <= MAX_NAIVE_N && (n & (n - 1)) === 0,
		`n must be a power of two from 2 to ${MAX_NAIVE_N}, got ${n}`,
	);
	const cells = n * n;
	const random = Random.create(seed);
	const re = new Float64Array(cells);
	const im = new Float64Array(cells);
	for (let i = 0; i < cells; i++) {
		re[i] = random.nextNumber() * 2 - 1;
		im[i] = random.nextNumber() * 2 - 1;
	}
	const naiveRe = new Float64Array(cells);
	const naiveIm = new Float64Array(cells);
	const naiveMs = timePerRun(() => NaiveDft.inverse2D(n, re, im, naiveRe, naiveIm));
	const plan = FFT.plan(n);
	const fftRe = new Float64Array(cells);
	const fftIm = new Float64Array(cells);
	const fftMs = timePerRun(() => {
		fftRe.set(re);
		fftIm.set(im);
		FFT.inverse2D(plan, fftRe, fftIm);
	});
	let maxDifference = 0;
	for (let i = 0; i < cells; i++) {
		maxDifference = Math.max(maxDifference, Math.abs(naiveRe[i] - fftRe[i]), Math.abs(naiveIm[i] - fftIm[i]));
	}
	return Object.freeze({
		n,
		waves: cells,
		naiveMs,
		fftMs,
		speedup: naiveMs / fftMs,
		operations: Object.freeze({ naive: cells * cells, fft: cells * Math.log2(n) }),
		maxDifference,
	});
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/core/naiveDft.test.js tests/ocean/engine/charts.test.js && npm run test:ocean`
Expected: PASS: 3 naive-DFT tests, 6 chart tests, the whole suite green.

- [ ] **Step 6: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean
git add content/ocean/js/core/naiveDft.js content/ocean/js/engine/charts.js tests/ocean/core/naiveDft.test.js tests/ocean/engine/charts.test.js
git commit -m "feat: chart data for the spectrum, the phase arrows and the naive sum against the FFT"
```

---
### Task 7: The recipes and their sliders

**Files:**
- Modify: `package.json` (the unit-test script runs and measures `stages/`)
- Create: `content/ocean/js/stages/paths.js`, `content/ocean/js/stages/sun.js`, `content/ocean/js/stages/sliders.js`, `content/ocean/js/stages/recipes.js`
- Test: `tests/ocean/stages/sliders.test.js`, `tests/ocean/stages/recipes.test.js`

**Interfaces:**
- Consumes: Task 5 `engine/stageControl.js` (`DEFAULT_SETTINGS`, `normalise`), `engine/config.js` (`SEED`); `render/lighting.js` (`FOG_DENSITY`, `SUN_DIRECTION`: constants only); A1 `core/luau.js`, `core/tier.js` (tests).
- Produces:
  - `stages/paths.js`: `getPath(object, path) -> value` (throws `RangeError` for a missing path), `setPath(object, path, value) -> copy` (copies along the path, throws for a path that does not exist), `deepFreeze(value) -> value`.
  - `stages/sun.js`: `sunAngles([x, y, z]) -> { azimuth, elevation }` (degrees; azimuth from +x towards +z in 0 .. 360), `sunDirection({ azimuth, elevation }) -> [x, y, z]` (unit), `PLACE_SUN` (the Studio place's sun as angles).
  - `stages/sliders.js`: `KINDS`, `clampSlider(slider, value) -> value` (range: clamp and snap to step; toggle: boolean only; counter: floor, at least min; choice: the nearest option; throws `RangeError` for the wrong type), `sliderById(recipe, id) -> slider` (throws), `applySliders(recipe, values) -> recipe` (frozen copy with each given value clamped and bound; values not given keep the recipe's own), `sliderValue(recipe, id) -> value`.
  - `stages/recipes.js`: `STEP_COUNT` (13), `MATERIALS`, `MOVES`, `ENGINE_FIELDS`, `RECIPES` (13 frozen recipes, shape in the plan's Conventions), `recipeFor(step) -> recipe` (throws `RangeError` outside 1 .. 13).

- [ ] **Step 1: Let the unit tests find `stages/`**

In `package.json`, replace the `test:ocean` script with:

```json
		"test:ocean": "node --test --experimental-test-coverage --test-coverage-include='content/ocean/js/core/**' --test-coverage-include='content/ocean/js/engine/**' --test-coverage-include='content/ocean/js/workers/**' --test-coverage-include='content/ocean/js/stages/**' 'tests/ocean/core/**/*.test.js' 'tests/ocean/engine/**/*.test.js' 'tests/ocean/stages/**/*.test.js'",
```

- [ ] **Step 2: Write the failing slider tests**

`tests/ocean/stages/sliders.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { deepFreeze, getPath, setPath } from '../../../content/ocean/js/stages/paths.js';
import { applySliders, clampSlider, sliderById, sliderValue } from '../../../content/ocean/js/stages/sliders.js';
import { PLACE_SUN, sunAngles, sunDirection } from '../../../content/ocean/js/stages/sun.js';
import * as Lighting from '../../../content/ocean/js/render/lighting.js';

const RANGE = { id: 'wind', kind: 'range', bind: 'engine.sea.windSpeed', min: 3, max: 25, step: 0.5, default: 12 };
const TOGGLE = { id: 'wire', kind: 'toggle', bind: 'look.wireframe', default: true };
const COUNTER = { id: 'seed', kind: 'counter', bind: 'engine.seed', min: 1, default: 7 };
const CHOICE = { id: 'n', kind: 'choice', bind: 'charts.transformN', options: [8, 16, 32, 64], default: 32 };
const RECIPE = deepFreeze({
	step: 99,
	engine: { sea: { windSpeed: 12, fetch: 80000 }, seed: 7, layers: [true, false, false] },
	look: { wireframe: true },
	charts: { transformN: 32 },
	sliders: [RANGE, TOGGLE, COUNTER, CHOICE, { id: 'layer2', kind: 'toggle', bind: 'engine.layers.1', default: false }],
});

test('clampSlider keeps a range inside its ends and on its step (Review Focus 3)', () => {
	expect.equal(clampSlider(RANGE, 40), 25, 'clamped to max');
	expect.equal(clampSlider(RANGE, -5), 3, 'clamped to min');
	expect.equal(clampSlider(RANGE, 12.3), 12.5, 'snapped to the 0.5 step');
	expect.equal(clampSlider(RANGE, 12.1), 12, 'snapped down');
	for (const bad of [Number.NaN, Infinity, '12', null]) {
		let message = '';
		try {
			clampSlider(RANGE, bad);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes('wind'), `${bad} refused: ${message}`);
	}
});

test('toggles take only booleans, counters whole numbers from their minimum, choices the nearest option', () => {
	expect.equal(clampSlider(TOGGLE, false), false, 'boolean kept');
	let message = '';
	try {
		clampSlider(TOGGLE, 1);
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('wire'), `1 is not a boolean: ${message}`);
	expect.equal(clampSlider(COUNTER, 9.7), 9, 'floored');
	expect.equal(clampSlider(COUNTER, -3), 1, 'at least min');
	expect.equal(clampSlider(CHOICE, 20), 16, 'nearest option');
	expect.equal(clampSlider(CHOICE, 1000), 64, 'the largest');
});

test('applySliders binds values into a frozen copy and leaves the recipe alone', () => {
	const bound = applySliders(RECIPE, { wind: 20, wire: false, layer2: true });
	expect.equal(bound.engine.sea.windSpeed, 20, 'wind bound');
	expect.equal(bound.look.wireframe, false, 'wireframe bound');
	expect.equal(bound.engine.layers.join(','), 'true,true,false', 'an array element bound');
	expect.equal(bound.engine.sea.fetch, 80000, 'the rest kept');
	expect.equal(RECIPE.engine.sea.windSpeed, 12, 'the original untouched');
	expect.truthy(Object.isFrozen(bound.engine.sea) && Object.isFrozen(bound.engine.layers), 'frozen down the path');
	expect.equal(applySliders(RECIPE, {}), RECIPE, 'no values: the same recipe');
	expect.equal(applySliders(RECIPE, { wind: 99 }).engine.sea.windSpeed, 25, 'clamped on the way in');
	expect.equal(sliderValue(bound, 'wind'), 20, 'sliderValue reads through the binding');
	let message = '';
	try {
		applySliders(RECIPE, { sideways: 1 });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('sideways'), `an unknown slider is refused: ${message}`);
	expect.equal(sliderById(RECIPE, 'seed').kind, 'counter', 'sliderById');
});

test('paths: a missing path is an error, never a silent new field', () => {
	expect.equal(getPath(RECIPE, 'engine.layers.0'), true, 'array index');
	for (const fn of [() => getPath(RECIPE, 'engine.tide'), () => setPath(RECIPE, 'engine.tide.level', 1)]) {
		let message = '';
		try {
			fn();
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes('engine.tide'), message);
	}
});

test("the sun's angles and direction are one another's inverse, and PLACE_SUN is the page's sun", () => {
	const back = sunDirection(sunAngles([0.3, 0.5, -0.8]));
	const length = Math.hypot(0.3, 0.5, -0.8);
	[0.3, 0.5, -0.8].forEach((value, i) => expect.near(back[i], value / length, 1e-12, `component ${i}`));
	const place = sunDirection(PLACE_SUN);
	// lighting.js holds the place's sun as float32 values read from Studio, a few 1e-8 off unit length.
	Lighting.SUN_DIRECTION.forEach((value, i) => expect.near(place[i], value, 1e-6, `place sun ${i}`));
	expect.truthy(PLACE_SUN.azimuth > 170 && PLACE_SUN.azimuth < 176, `azimuth ${PLACE_SUN.azimuth}`);
	expect.truthy(PLACE_SUN.elevation > 16 && PLACE_SUN.elevation < 17, `elevation ${PLACE_SUN.elevation}`);
});
```

- [ ] **Step 3: Write the failing recipe tests**

`tests/ocean/stages/recipes.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as StageControl from '../../../content/ocean/js/engine/stageControl.js';
import * as Lighting from '../../../content/ocean/js/render/lighting.js';
import { getPath } from '../../../content/ocean/js/stages/paths.js';
import * as Recipes from '../../../content/ocean/js/stages/recipes.js';
import { KINDS } from '../../../content/ocean/js/stages/sliders.js';

const R = Recipes.RECIPES;
const deepFrozen = (value) => value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen));
const ids = (recipe) => recipe.sliders.map((s) => s.id).join(',');

test('thirteen recipes, one per step, in order, with unique ids, frozen all the way down', () => {
	expect.equal(R.length, Recipes.STEP_COUNT, 'thirteen');
	R.forEach((recipe, i) => expect.equal(recipe.step, i + 1, `step ${i + 1}`));
	expect.equal(new Set(R.map((r) => r.id)).size, 13, 'unique ids');
	expect.truthy(deepFrozen(R), 'deep frozen');
	expect.equal(Recipes.recipeFor(7), R[6], 'recipeFor');
});

test("every recipe's engine part is settings the engine accepts", () => {
	for (const recipe of R) {
		expect.equal(Object.keys(recipe.engine).sort().join(','), [...Recipes.ENGINE_FIELDS].sort().join(','), `step ${recipe.step} engine fields`);
		StageControl.normalise({ ...recipe.engine, normals: true, warm: { fft: false, maps: false, layers: [false, false, false] } });
		expect.truthy(Recipes.MATERIALS.includes(recipe.look.material), `step ${recipe.step} material`);
		expect.truthy(Recipes.MOVES.includes(recipe.shot.move), `step ${recipe.step} move`);
		expect.truthy(recipe.look.fog > 0, `step ${recipe.step} fog`);
	}
});

test('steps 1 to 6 draw the Gerstner sum, steps 7 to 13 the FFT (spec section 3)', () => {
	expect.equal(R.map((r) => r.engine.source).join(','), 'sine,sine,bank,bank,bank,bank,fft,fft,fft,fft,fft,fft,fft', 'sources');
});

test('step 1 is a flat white plane under its wireframe', () => {
	const one = R[0];
	expect.equal(one.engine.sine.amplitude, 0, 'no wave');
	expect.equal(one.look.material, 'white', 'white');
	expect.equal(one.look.wireframe, true, 'grid on');
	expect.equal(one.engine.sine.wavelength, R[1].engine.sine.wavelength, "step 2's wave, so scrolling raises it");
});

test("the parts come on in the story's order: light at 4, chop at 5, maps at 7, three layers at 10, foam at 11, glow at 12", () => {
	expect.equal(R.map((r) => r.look.material).join(','), 'white,white,white,sea,sea,sea,painted,painted,painted,painted,painted,painted,painted', 'materials');
	expect.equal(R.map((r) => r.engine.chop > 0).join(','), 'false,false,false,false,true,true,true,true,true,true,true,true,true', 'chop from 5');
	expect.equal(R.map((r) => r.engine.maps).join(','), 'false,false,false,false,false,false,true,true,true,true,true,true,true', 'maps from 7');
	expect.equal(R.map((r) => r.engine.layers.filter(Boolean).length).join(','), '1,1,1,1,1,1,1,1,1,3,3,3,3', 'layers');
	expect.equal(R.map((r) => r.engine.foam).join(','), 'false,false,false,false,false,false,false,false,false,false,true,true,true', 'foam from 11');
	expect.equal(R.map((r) => r.engine.glow).join(','), 'false,false,false,false,false,false,false,false,false,false,false,true,true', 'glow from 12');
});

test('the finale is the hero sea: the rough default, every part on', () => {
	for (const field of Recipes.ENGINE_FIELDS) {
		expect.equal(JSON.stringify(R[12].engine[field]), JSON.stringify(StageControl.DEFAULT_SETTINGS[field]), `finale ${field}`);
	}
	expect.equal(R[12].shot.move, 'drift', 'the finale camera drifts');
});

test('every slider is well formed and its default is the value its binding holds', () => {
	for (const recipe of R) {
		expect.equal(new Set(recipe.sliders.map((s) => s.id)).size, recipe.sliders.length, `step ${recipe.step} unique slider ids`);
		for (const slider of recipe.sliders) {
			const where = `step ${recipe.step} ${slider.id}`;
			expect.truthy(KINDS.includes(slider.kind), `${where} kind`);
			expect.truthy(typeof slider.label === 'string' && slider.label.length > 0, `${where} label`);
			expect.equal(getPath(recipe, slider.bind), slider.default, `${where} default is the bound value`);
			if (slider.kind === 'range') {
				expect.truthy(slider.min < slider.max && slider.step > 0, `${where} range`);
				expect.truthy(slider.default >= slider.min && slider.default <= slider.max, `${where} default inside`);
			}
			if (slider.kind === 'toggle') expect.equal(typeof slider.default, 'boolean', `${where} boolean`);
			if (slider.kind === 'counter') expect.truthy(Number.isInteger(slider.default) && slider.default >= slider.min, `${where} counter`);
			if (slider.kind === 'choice') expect.truthy(slider.options.includes(slider.default), `${where} choice`);
		}
	}
});

test('each step offers the controls the story table names', () => {
	const expected = [
		'wireframe',
		'amplitude,wavelength,speed',
		'waveCount',
		'sunAzimuth,shading',
		'chop',
		'',
		'wind,fetch',
		'seed',
		'transformN',
		'layer1,layer2,layer3',
		'whitecap,fade',
		'sunHeight,glow',
		'',
	];
	R.forEach((recipe, i) => expect.equal(ids(recipe), expected[i], `step ${i + 1}`));
	const count = R[2].sliders[0];
	expect.equal(count.min, 1, 'wave count from 1');
	expect.equal(count.max, 32, 'to 32');
	expect.equal(R[8].sliders[0].options.join(','), '8,16,32,64', 'naive sum against FFT at these grid sizes');
	expect.equal(R[6].sliders[1].scale, 'log', 'fetch on a log slider');
});

test("the layer toggles name the High tier's cascade sizes", () => {
	R[9].sliders.forEach((slider, i) => {
		expect.truthy(slider.label.includes(String(Tier.presets.High.sizes[i])), `${slider.label}`);
		expect.equal(slider.bind, `engine.layers.${i}`, 'bound to its layer');
	});
});

test('step 6 flies the camera up and thins the fog so the repetition shows', () => {
	expect.truthy(R[5].shot.position[1] > 5 * R[4].shot.position[1], 'far higher than step 5');
	expect.truthy(R[5].look.fog < Lighting.FOG_DENSITY / 4, 'thin fog');
	expect.truthy(R[9].look.fog < Lighting.FOG_DENSITY, 'thinner fog again for the layers');
});

test("the look's defaults are the page's lighting", () => {
	expect.equal(R[12].look.fog, Lighting.FOG_DENSITY, 'the A2 fog');
	expect.equal(R[3].sliders[0].default, R[12].look.sun.azimuth, 'the sun slider starts at the place sun');
});

test('recipeFor refuses a step outside 1..13', () => {
	for (const bad of [0, 14, 2.5, '3']) {
		let message = '';
		try {
			Recipes.recipeFor(bad);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes('step'), `${bad}: ${message}`);
	}
});
```

- [ ] **Step 4: Run the tests and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/stages/sliders.test.js tests/ocean/stages/recipes.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 5: Write `content/ocean/js/stages/paths.js`**

```js
// Small pure helpers the stage recipes share (A3): reading and writing a value at a dotted path
// ("engine.sea.windSpeed", "engine.layers.1") without mutating anything, and freezing a recipe all
// the way down.

export function getPath(object, path) {
	let value = object;
	for (const key of path.split('.')) {
		if (value === null || typeof value !== 'object' || !(key in value)) {
			throw new RangeError(`no value at ${path}`);
		}
		value = value[key];
	}
	return value;
}

// A copy of `object` with `value` at `path`: every object and array along the path is copied, the
// rest is shared. The path must already exist: a binding may change a value a recipe declares,
// never add one.
export function setPath(object, path, value) {
	const keys = path.split('.');
	const write = (node, index) => {
		const key = keys[index];
		if (node === null || typeof node !== 'object' || !(key in node)) {
			throw new RangeError(`no value at ${path}`);
		}
		const next = index === keys.length - 1 ? value : write(node[key], index + 1);
		if (Array.isArray(node)) {
			const copy = node.slice();
			copy[Number(key)] = next;
			return copy;
		}
		return { ...node, [key]: next };
	};
	return write(object, 0);
}

export function deepFreeze(value) {
	if (value !== null && typeof value === 'object') {
		Object.freeze(value);
		for (const key of Object.keys(value)) {
			deepFreeze(value[key]);
		}
	}
	return value;
}
```

- [ ] **Step 6: Write `content/ocean/js/stages/sun.js`**

```js
// The sun as the story's sliders move it (A3): azimuth and elevation in degrees, azimuth measured
// from +x towards +z, and the unit vector towards the sun the renderer and the glow use.
import { mod } from '../core/luau.js';
import { SUN_DIRECTION } from '../render/lighting.js';

const RADIANS = Math.PI / 180;

export function sunAngles(direction) {
	const [x, y, z] = direction;
	const length = Math.hypot(x, y, z);
	if (!(Number.isFinite(length) && length > 0)) {
		throw new RangeError(`the sun needs a non-zero direction, got ${JSON.stringify(direction)}`);
	}
	return {
		azimuth: mod(Math.atan2(z, x) / RADIANS, 360),
		elevation: Math.asin(y / length) / RADIANS,
	};
}

export function sunDirection({ azimuth, elevation }) {
	if (!Number.isFinite(azimuth) || !Number.isFinite(elevation) || Math.abs(elevation) > 90) {
		throw new RangeError(`the sun needs a finite azimuth and an elevation in -90..90, got ${azimuth}, ${elevation}`);
	}
	const a = azimuth * RADIANS;
	const e = elevation * RADIANS;
	return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
}

// The Studio place's sun (render/lighting.js), as the angles the recipes blend.
export const PLACE_SUN = Object.freeze(sunAngles(SUN_DIRECTION));
```

- [ ] **Step 7: Write `content/ocean/js/stages/sliders.js`**

```js
// The story panels' sliders as data (A3): what kinds there are, how a raw value is brought inside a
// slider (clamped, snapped, or refused when it is the wrong type), and how slider values are bound
// into a recipe through each slider's dotted `bind` path. Piece C draws the widgets; this decides
// what a value means.
import { clamp } from '../core/luau.js';
import { deepFreeze, getPath, setPath } from './paths.js';

export const KINDS = Object.freeze(['range', 'toggle', 'counter', 'choice']);

function refuse(slider, rule, value) {
	throw new RangeError(`slider ${slider.id} needs ${rule}, got ${String(value)}`);
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

export function clampSlider(slider, value) {
	switch (slider.kind) {
		case 'range': {
			if (!finite(value)) refuse(slider, 'a finite number', value);
			const steps = Math.round((clamp(value, slider.min, slider.max) - slider.min) / slider.step);
			// toFixed drops the float noise the step multiplication leaves (12.000000000000002).
			return clamp(Number((slider.min + steps * slider.step).toFixed(10)), slider.min, slider.max);
		}
		case 'toggle':
			if (typeof value !== 'boolean') refuse(slider, 'true or false', value);
			return value;
		case 'counter':
			if (!finite(value)) refuse(slider, 'a finite number', value);
			return Math.max(slider.min, Math.floor(value));
		case 'choice':
			if (!finite(value)) refuse(slider, 'a finite number', value);
			return slider.options.reduce((best, option) => (Math.abs(option - value) < Math.abs(best - value) ? option : best));
		default:
			throw new RangeError(`slider ${slider.id} has an unknown kind ${slider.kind}`);
	}
}

export function sliderById(recipe, id) {
	const slider = recipe.sliders.find((s) => s.id === id);
	if (!slider) {
		throw new RangeError(`step ${recipe.step} has no slider ${id}`);
	}
	return slider;
}

// The recipe with each given slider value clamped and bound in; values not given keep the
// recipe's own. No values gives back the recipe itself.
export function applySliders(recipe, values = {}) {
	let result = recipe;
	for (const [id, value] of Object.entries(values)) {
		const slider = sliderById(recipe, id);
		result = setPath(result, slider.bind, clampSlider(slider, value));
	}
	return result === recipe ? recipe : deepFreeze(result);
}

export function sliderValue(recipe, id) {
	return getPath(recipe, sliderById(recipe, id).bind);
}
```

- [ ] **Step 8: Write `content/ocean/js/stages/recipes.js`**

```js
// The thirteen steps of the story (spec section 3), each as a recipe (spec 4.3; A3): which parts
// of the engine are on and the sea they run (`engine`, the EngineSettings stageControl.js takes,
// less the `normals` and `warm` the blend works out), how the surface is drawn (`look`), where the
// camera stands (`shot`), which charts the step shows (`charts`) and which sliders its panel
// offers, with their ranges and the value each drives (`sliders`). Pure data: the director
// (director.js) binds slider values in, blends two neighbours by the scroll progress (blend.js)
// and hands the result to the engine and the renderer.
//
// Steps 1 to 6 run the Gerstner sum (the `sine` source, then the 32-wave `bank`, through
// WaveSampler as the original Roblox prototype did); from step 7 the surface is the FFT pipeline,
// one layer until step 10 brings in all three. Every step starts from the hero sea, the rough
// default Cole judged in A2 (stageControl.js DEFAULT_SETTINGS), which the finale is unchanged.
// Steps 4 to 6 sum the 16 tallest bank waves rather than 32: 32 cost about 27 ms a frame over
// 18,144 vertices in Node (2026-09-30), and waves 17 to 32 are under 0.15 studs tall.
import { DEFAULT_SETTINGS } from '../engine/stageControl.js';
import { SEED } from '../engine/config.js';
import { FOG_DENSITY } from '../render/lighting.js';
import { deepFreeze } from './paths.js';
import { PLACE_SUN } from './sun.js';

export const STEP_COUNT = 13;
export const MATERIALS = Object.freeze(['white', 'sea', 'painted']);
export const MOVES = Object.freeze(['still', 'drift']);
// The recipe fields the engine reads (EngineSettings without `normals` and `warm`).
export const ENGINE_FIELDS = Object.freeze(['source', 'sine', 'bank', 'chop', 'sea', 'seed', 'layers', 'maps', 'foam', 'foamKnobs', 'glow', 'glowStrength']);

const BASE = deepFreeze({
	engine: Object.fromEntries(ENGINE_FIELDS.map((name) => [name, DEFAULT_SETTINGS[name]])),
	look: { material: 'painted', shading: true, wireframe: false, fog: FOG_DENSITY, sun: { azimuth: PLACE_SUN.azimuth, elevation: PLACE_SUN.elevation } },
	shot: { position: [0, 14, 40], target: [0, 2, -120], move: 'still' },
	charts: { spectrum: false, phaseArrows: false, transformN: null },
	sliders: [],
});

const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Plain objects merge key by key; arrays and everything else replace.
function merge(base, over) {
	const result = { ...base };
	for (const [key, value] of Object.entries(over)) {
		result[key] = isPlain(value) && isPlain(base[key]) ? merge(base[key], value) : value;
	}
	return result;
}

function make(step, id, title, over) {
	return deepFreeze({ step, id, title, ...merge(BASE, over) });
}

function range(id, label, bind, { min, max, step, value, unit = '', scale = 'linear' }) {
	return { id, label, kind: 'range', bind, min, max, step, default: value, unit, scale };
}

function toggle(id, label, bind, value) {
	return { id, label, kind: 'toggle', bind, default: value };
}

function counter(id, label, bind, value) {
	return { id, label, kind: 'counter', bind, min: 1, default: value };
}

function choice(id, label, bind, options, value) {
	return { id, label, kind: 'choice', bind, options, default: value };
}

// The Gerstner steps: one layer named (so the painter's lists match step 7's while it warms up),
// no chop until step 5, and no maps, foam or glow.
const TEACHING = { layers: [true, false, false], chop: 0, maps: false, foam: false, glow: false };
const ONE_LAYER = { source: 'fft', layers: [true, false, false], foam: false, glow: false };
const WHITE = { material: 'white', wireframe: true };
const DECK = { position: [0, 14, 40], target: [0, 2, -120] };
const CREST = { position: [0, 5, 25], target: [0, 1, -15] };
const HIGH = { position: [0, 110, 150], target: [0, 0, -60] };

export const RECIPES = Object.freeze([
	make(1, 'flat-plane', 'A flat white plane', {
		engine: { ...TEACHING, source: 'sine', sine: { amplitude: 0 } },
		look: WHITE,
		shot: { position: [0, 40, 70], target: [0, 0, 0] },
		sliders: [toggle('wireframe', 'Wireframe', 'look.wireframe', true)],
	}),
	make(2, 'one-sine', 'One sine wave', {
		engine: { ...TEACHING, source: 'sine' },
		look: WHITE,
		shot: { position: [0, 12, 45], target: [0, 0, 0] },
		sliders: [
			range('amplitude', 'Height', 'engine.sine.amplitude', { min: 0, max: 4, step: 0.05, value: 1.5, unit: 'studs' }),
			range('wavelength', 'Length', 'engine.sine.wavelength', { min: 8, max: 120, step: 1, value: 40, unit: 'studs' }),
			range('speed', 'Speed', 'engine.sine.speed', { min: 0, max: 20, step: 0.1, value: 8, unit: 'studs/s' }),
		],
	}),
	make(3, 'many-sines', 'Many sine waves', {
		engine: { ...TEACHING, source: 'bank', bank: { count: 8 } },
		look: WHITE,
		shot: { position: [0, 18, 55], target: [0, 0, -20] },
		sliders: [range('waveCount', 'Waves', 'engine.bank.count', { min: 1, max: 32, step: 1, value: 8 })],
	}),
	make(4, 'light', 'Light', {
		engine: { ...TEACHING, source: 'bank', bank: { count: 16 } },
		look: { material: 'sea', shading: true },
		shot: DECK,
		sliders: [
			range('sunAzimuth', 'Sun direction', 'look.sun.azimuth', { min: 0, max: 360, step: 1, value: PLACE_SUN.azimuth, unit: '°' }),
			toggle('shading', 'Shading', 'look.shading', true),
		],
	}),
	make(5, 'pointy-crests', 'Pointy crests', {
		engine: { ...TEACHING, source: 'bank', bank: { count: 16 }, chop: 0.6 },
		look: { material: 'sea' },
		shot: CREST,
		sliders: [range('chop', 'Choppiness', 'engine.chop', { min: 0, max: 1, step: 0.01, value: 0.6 })],
	}),
	make(6, 'repetition', 'The repetition problem', {
		engine: { ...TEACHING, source: 'bank', bank: { count: 16 }, chop: 0.6 },
		look: { material: 'sea', fog: 0.00012 },
		shot: { position: [0, 700, 520], target: [0, 0, -300] },
	}),
	make(7, 'real-data', 'Real ocean data', {
		engine: ONE_LAYER,
		shot: { position: [0, 60, 110], target: [0, 0, -40] },
		charts: { spectrum: true },
		sliders: [
			range('wind', 'Wind speed', 'engine.sea.windSpeed', { min: 3, max: 25, step: 0.5, value: 12, unit: 'm/s' }),
			range('fetch', 'Fetch', 'engine.sea.fetch', { min: 5000, max: 200000, step: 1000, value: 80000, unit: 'm', scale: 'log' }),
		],
	}),
	make(8, 'random-ocean', 'A random ocean, moving', {
		engine: ONE_LAYER,
		shot: { position: [0, 30, 60], target: [0, 0, 0] },
		charts: { phaseArrows: true },
		sliders: [counter('seed', 'New sea', 'engine.seed', SEED)],
	}),
	make(9, 'fft', 'The FFT', {
		engine: ONE_LAYER,
		shot: HIGH,
		charts: { transformN: 32 },
		sliders: [choice('transformN', 'Waves per side', 'charts.transformN', [8, 16, 32, 64], 32)],
	}),
	make(10, 'three-layers', 'Three layers of waves', {
		engine: { source: 'fft', foam: false, glow: false },
		look: { fog: 0.0003 },
		shot: { position: [0, 420, 380], target: [0, 0, -200] },
		sliders: [
			toggle('layer1', '256-stud layer', 'engine.layers.0', true),
			toggle('layer2', '64-stud layer', 'engine.layers.1', true),
			toggle('layer3', '16-stud layer', 'engine.layers.2', true),
		],
	}),
	make(11, 'foam', 'Foam', {
		engine: { glow: false },
		shot: { position: [0, 8, 30], target: [0, 1, -20] },
		sliders: [
			range('whitecap', 'Whitecaps', 'engine.foamKnobs.whitecap', { min: 0, max: 1, step: 0.01, value: DEFAULT_SETTINGS.foamKnobs.whitecap }),
			range('fade', 'Fade', 'engine.foamKnobs.decay', { min: 0.5, max: 0.97, step: 0.01, value: DEFAULT_SETTINGS.foamKnobs.decay }),
		],
	}),
	make(12, 'glow', 'Glow', {
		// Looking towards the sun (azimuth about 173 degrees, towards -x), where the scatter lobe glows.
		shot: { position: [40, 12, 10], target: [-120, 2, 20] },
		sliders: [
			range('sunHeight', 'Sun height', 'look.sun.elevation', { min: 2, max: 50, step: 0.5, value: PLACE_SUN.elevation, unit: '°' }),
			range('glow', 'Glow strength', 'engine.glowStrength', { min: 0, max: 60, step: 1, value: DEFAULT_SETTINGS.glowStrength }),
		],
	}),
	make(13, 'finale', 'Finale', {
		shot: { ...DECK, move: 'drift' },
	}),
]);

export function recipeFor(step) {
	if (!Number.isInteger(step) || step < 1 || step > STEP_COUNT) {
		throw new RangeError(`step must be an integer 1..${STEP_COUNT}, got ${step}`);
	}
	return RECIPES[step - 1];
}
```

- [ ] **Step 9: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/stages/sliders.test.js tests/ocean/stages/recipes.test.js && npm run test:ocean`
Expected: PASS: 5 slider tests, 12 recipe tests, and `npm run test:ocean` now also lists the `tests/ocean/stages/` files and covers `content/ocean/js/stages/**`.

- [ ] **Step 10: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean
git add package.json content/ocean/js/stages/paths.js content/ocean/js/stages/sun.js content/ocean/js/stages/sliders.js content/ocean/js/stages/recipes.js tests/ocean/stages/sliders.test.js tests/ocean/stages/recipes.test.js
git commit -m "feat: the thirteen stage recipes and their sliders"
```

---

### Task 8: Blending two recipes, and the dev route

**Files:**
- Create: `content/ocean/js/stages/blend.js`, `content/ocean/js/stages/route.js`
- Test: `tests/ocean/stages/blend.test.js`, `tests/ocean/stages/route.test.js`

**Interfaces:**
- Consumes: Task 7 (`recipeFor`, `STEP_COUNT`, `applySliders`, `clampSlider`, `deepFreeze`); Task 5 `StageControl.normalise` (tests); A1 `core/luau.js` (`mod`).
- Produces:
  - `stages/blend.js`: `blendRecipes(a, b, progress) -> blendedRecipe` (frozen; the rules are in the plan's Decisions; progress outside 0 .. 1 is clamped, a non-number throws `RangeError`); `engineSettings(blended) -> EngineSettings` (adds `warm` and `normals`: true for `painted`, and for `sea` while `shading` is on).
  - `stages/route.js`: `parseStageRoute(search) -> { step, progress, sliders: { id: rawText }, shots: boolean, warnings: string[] } | null` (null without `step`; `shot=0` turns the recipe camera off); `resolveSliderValues(recipe, raw) -> { values, warnings }`.

- [ ] **Step 1: Write the failing tests**

`tests/ocean/stages/blend.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as StageControl from '../../../content/ocean/js/engine/stageControl.js';
import { blendRecipes, engineSettings } from '../../../content/ocean/js/stages/blend.js';
import { recipeFor, STEP_COUNT } from '../../../content/ocean/js/stages/recipes.js';
import { applySliders } from '../../../content/ocean/js/stages/sliders.js';

test('progress 0 is the first recipe and 1 the second, number for number', () => {
	const a = recipeFor(4);
	const b = recipeFor(5);
	const start = blendRecipes(a, b, 0);
	const end = blendRecipes(a, b, 1);
	expect.equal(start.engine.chop, a.engine.chop, 'start chop');
	expect.equal(end.engine.chop, b.engine.chop, 'end chop');
	expect.equal(start.shot.position.join(','), a.shot.position.join(','), 'start shot');
	expect.equal(end.shot.position.join(','), b.shot.position.join(','), 'end shot');
	expect.equal(end.look.sun.azimuth, b.look.sun.azimuth, 'end sun');
	expect.equal(start.from, 4, 'from');
	expect.equal(start.to, 5, 'to');
	expect.truthy(Object.isFrozen(start.engine.sine), 'frozen');
});

test('numbers lerp between; fetch and fog on a log scale; the sun the short way round', () => {
	const rise = blendRecipes(recipeFor(1), recipeFor(2), 0.25);
	expect.near(rise.engine.sine.amplitude, 0.375, 1e-12, "a quarter of step 2's 1.5");
	const fetch = blendRecipes(applySliders(recipeFor(7), { fetch: 5000 }), recipeFor(7), 0.5);
	expect.near(fetch.engine.sea.fetch, Math.sqrt(5000 * 80000), 1e-6, 'geometric midpoint of the fetches');
	const fog = blendRecipes(recipeFor(5), recipeFor(6), 0.5);
	expect.near(fog.look.fog, Math.sqrt(recipeFor(5).look.fog * recipeFor(6).look.fog), 1e-12, 'geometric midpoint of the fogs');
	const sun = blendRecipes(applySliders(recipeFor(4), { sunAzimuth: 350 }), applySliders(recipeFor(4), { sunAzimuth: 10 }), 0.5);
	expect.near(sun.look.sun.azimuth, 0, 1e-9, 'through north, not round the long way');
	const shot = blendRecipes(recipeFor(5), recipeFor(6), 0.5);
	expect.equal(shot.shot.position.join(','), '0,352.5,272.5', 'the camera halfway up');
});

test('everything discrete snaps at the halfway point', () => {
	const before = blendRecipes(recipeFor(6), recipeFor(7), 0.49);
	const after = blendRecipes(recipeFor(6), recipeFor(7), 0.5);
	expect.equal(before.engine.source, 'bank', 'still the bank');
	expect.equal(after.engine.source, 'fft', 'the FFT from halfway');
	expect.equal(before.look.material, 'sea', 'sea material');
	expect.equal(after.look.material, 'painted', 'painted from halfway');
	expect.equal(before.engine.maps, false, 'maps off');
	expect.equal(after.engine.maps, true, 'maps on');
	const layers = blendRecipes(recipeFor(9), recipeFor(10), 0.7);
	expect.equal(layers.engine.layers.join(','), 'true,true,true', 'layers snap');
	expect.equal(layers.step, 10, 'the nearer step names the blend');
});

test('the parts the next step needs run warm while between, and not at the ends', () => {
	const between = blendRecipes(recipeFor(6), recipeFor(7), 0.3);
	expect.equal(between.warm.fft, true, 'the FFT warming');
	expect.equal(between.warm.maps, true, 'the painter warming');
	const atSix = blendRecipes(recipeFor(6), recipeFor(7), 0);
	expect.equal(atSix.warm.fft, false, 'at step 6 itself nothing warms');
	const layers = blendRecipes(recipeFor(9), recipeFor(10), 0.2);
	expect.equal(layers.warm.layers.join(','), 'true,true,true', 'the new layers warm up before they show');
	expect.equal(layers.engine.layers.join(','), 'true,false,false', 'while only one shows');
});

test("the panel's sliders stay the step being read until the next step is reached", () => {
	const late = blendRecipes(recipeFor(7), recipeFor(8), 0.9);
	expect.equal(late.sliders.map((s) => s.id).join(','), 'wind,fetch', "step 7's panel");
	expect.equal(late.charts.phaseArrows, true, "but step 8's chart is what shows");
});

test('engineSettings adds the normals the look needs and the warm parts, and the engine accepts every one', () => {
	expect.equal(engineSettings(blendRecipes(recipeFor(1), recipeFor(2), 0)).normals, false, 'white: unlit');
	expect.equal(engineSettings(blendRecipes(recipeFor(4), recipeFor(5), 0)).normals, true, 'lit sea');
	const unlit = applySliders(recipeFor(4), { shading: false });
	expect.equal(engineSettings(blendRecipes(unlit, unlit, 0)).normals, false, 'shading off: unlit');
	expect.equal(engineSettings(blendRecipes(recipeFor(7), recipeFor(8), 0)).normals, true, 'painted');
	for (let step = 1; step <= STEP_COUNT; step++) {
		const next = recipeFor(Math.min(step + 1, STEP_COUNT));
		for (const progress of [0, 0.3, 0.5, 0.8]) {
			StageControl.normalise(engineSettings(blendRecipes(recipeFor(step), next, progress)));
		}
	}
});

test('a progress that is not a number is refused; outside 0..1 it is clamped', () => {
	let message = '';
	try {
		blendRecipes(recipeFor(1), recipeFor(2), Number.NaN);
	} catch (error) {
		message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
	}
	expect.truthy(message.includes('progress'), message);
	expect.equal(blendRecipes(recipeFor(1), recipeFor(2), 7).progress, 1, 'clamped to 1');
	expect.equal(blendRecipes(recipeFor(1), recipeFor(2), -3).engine.sine.amplitude, 0, 'clamped to 0');
});
```

`tests/ocean/stages/route.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { parseStageRoute, resolveSliderValues } from '../../../content/ocean/js/stages/route.js';

test('no step, no route: the page stays the A2 hero sea', () => {
	expect.equal(parseStageRoute(''), null, 'empty');
	expect.equal(parseStageRoute('?cam=deck&stats=1'), null, 'other knobs only');
});

test('step, progress, slider values and the camera switch are read', () => {
	const route = parseStageRoute('?step=3&progress=0.25&s.waveCount=12&shot=0&freeze=12');
	expect.equal(route.step, 3, 'step');
	expect.equal(route.progress, 0.25, 'progress');
	expect.equal(route.sliders.waveCount, '12', 'raw slider text');
	expect.equal(route.shots, false, 'the recipe camera off');
	expect.equal(route.warnings.length, 0, 'no warnings');
	expect.equal(parseStageRoute('?step=13').progress, 0, 'progress defaults to 0');
	expect.equal(parseStageRoute('?step=13').shots, true, 'the recipe camera on by default');
});

test('a route out of range is clamped and a garbled one falls back, each with a warning (Review Focus 3)', () => {
	const high = parseStageRoute('?step=99&progress=-1');
	expect.equal(high.step, 13, 'step clamped');
	expect.equal(high.progress, 0, 'progress clamped');
	expect.truthy(high.warnings.some((w) => w.includes('step=99')), 'a step warning');
	expect.truthy(high.warnings.some((w) => w.includes('progress=-1')), 'a progress warning');
	const garbled = parseStageRoute('?step=abc&progress=lots');
	expect.equal(garbled.step, 1, 'a non-number step is step 1');
	expect.equal(garbled.progress, 0, 'a non-number progress is 0');
	expect.equal(garbled.warnings.length, 2, 'both said');
	expect.equal(parseStageRoute('?step=2.6').step, 3, 'a fractional step rounds');
});

test("slider values are resolved against the step's own sliders, with a warning for anything that does not fit", () => {
	const seven = resolveSliderValues(recipeFor(7), { wind: '20', fetch: '9999999', sideways: '1' });
	expect.equal(seven.values.wind, 20, 'wind');
	expect.equal(seven.values.fetch, 200000, 'fetch clamped');
	expect.equal(seven.values.sideways, undefined, 'unknown dropped');
	expect.truthy(seven.warnings.some((w) => w.includes('s.fetch')), 'the clamp said');
	expect.truthy(seven.warnings.some((w) => w.includes('s.sideways')), 'the unknown said');
	const one = resolveSliderValues(recipeFor(1), { wireframe: '0' });
	expect.equal(one.values.wireframe, false, 'a toggle from 0');
	const bad = resolveSliderValues(recipeFor(1), { wireframe: 'maybe' });
	expect.equal(bad.values.wireframe, undefined, 'not a toggle value');
	expect.equal(bad.warnings.length, 1, 'said');
	const garbled = resolveSliderValues(recipeFor(7), { wind: 'abc' });
	expect.equal(garbled.values.wind, undefined, 'not a number');
	expect.truthy(garbled.warnings[0].includes('s.wind'), 'said');
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/stages/blend.test.js tests/ocean/stages/route.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `content/ocean/js/stages/blend.js`**

```js
// Blending two neighbouring recipes by the scroll progress (A3; spec 4.3 "the engine reads the
// blended recipe every frame"). What blends and what snaps:
//   * numbers lerp: the sine, the wave count, chop, wind, the foam and glow knobs, the fog, the
//     sun, the camera. Fetch and fog, which act multiplicatively, lerp on a log scale; the sun's
//     azimuth goes the short way round;
//   * everything discrete snaps at progress 0.5: the wave source, the seed, the layers, maps, foam
//     and glow, the material, shading, wireframe, the camera move and the charts;
//   * `warm`: while the scroll is strictly between the two, every part EITHER recipe runs is kept
//     running (the FFT, the painter, each layer), so what the next step shows is ready when it
//     snaps in. At the ends only the recipe's own parts run;
//   * `sliders` stay the first recipe's: the panel the visitor is reading.
import { mod } from '../core/luau.js';
import { deepFreeze } from './paths.js';

const lerp = (a, b, p) => (p === 1 ? b : a + (b - a) * p);
const logLerp = (a, b, p) => {
	if (p === 1) return b;
	return a > 0 && b > 0 ? a * (b / a) ** p : a + (b - a) * p;
};
function angleLerp(a, b, p) {
	if (p === 1) return mod(b, 360);
	const delta = mod(b - a + 180, 360) - 180;
	return mod(a + delta * p, 360);
}
const lerp3 = (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p)];

/**
 * @param {object} a the recipe being read (sliders bound)
 * @param {object} b the next recipe (sliders bound); the same recipe for the last step
 * @param {number} progress 0 at a, 1 at b; clamped to 0 .. 1
 */
export function blendRecipes(a, b, progress) {
	if (typeof progress !== 'number' || !Number.isFinite(progress)) {
		throw new RangeError(`progress must be a finite number, got ${progress}`);
	}
	const p = Math.min(Math.max(progress, 0), 1);
	const near = p < 0.5 ? a : b;
	const between = p > 0 && p < 1;
	const ea = a.engine;
	const eb = b.engine;
	const en = near.engine;
	return deepFreeze({
		step: near.step,
		id: near.id,
		title: near.title,
		from: a.step,
		to: b.step,
		progress: p,
		engine: {
			source: en.source,
			sine: {
				amplitude: lerp(ea.sine.amplitude, eb.sine.amplitude, p),
				wavelength: lerp(ea.sine.wavelength, eb.sine.wavelength, p),
				speed: lerp(ea.sine.speed, eb.sine.speed, p),
			},
			bank: { count: lerp(ea.bank.count, eb.bank.count, p) },
			chop: lerp(ea.chop, eb.chop, p),
			sea: { windSpeed: lerp(ea.sea.windSpeed, eb.sea.windSpeed, p), fetch: logLerp(ea.sea.fetch, eb.sea.fetch, p) },
			seed: en.seed,
			layers: en.layers,
			maps: en.maps,
			foam: en.foam,
			glow: en.glow,
			foamKnobs: {
				whitecap: lerp(ea.foamKnobs.whitecap, eb.foamKnobs.whitecap, p),
				decay: lerp(ea.foamKnobs.decay, eb.foamKnobs.decay, p),
			},
			glowStrength: lerp(ea.glowStrength, eb.glowStrength, p),
		},
		warm: between
			? {
					fft: ea.source === 'fft' || eb.source === 'fft',
					maps: ea.maps || eb.maps,
					layers: ea.layers.map((on, i) => on || eb.layers[i] === true),
				}
			: { fft: en.source === 'fft', maps: en.maps, layers: en.layers },
		look: {
			material: near.look.material,
			shading: near.look.shading,
			wireframe: near.look.wireframe,
			fog: logLerp(a.look.fog, b.look.fog, p),
			sun: { azimuth: angleLerp(a.look.sun.azimuth, b.look.sun.azimuth, p), elevation: lerp(a.look.sun.elevation, b.look.sun.elevation, p) },
		},
		shot: { position: lerp3(a.shot.position, b.shot.position, p), target: lerp3(a.shot.target, b.shot.target, p), move: near.shot.move },
		charts: near.charts,
		sliders: a.sliders,
	});
}

// What Ocean.configureStage takes: the blended engine part, its warm parts, and whether the look
// needs vertex normals (lit materials do; white and the unlit sea colour do not).
export function engineSettings(blended) {
	const look = blended.look;
	return Object.freeze({
		...blended.engine,
		warm: blended.warm,
		normals: look.material === 'painted' || (look.material === 'sea' && look.shading),
	});
}
```

- [ ] **Step 4: Write `content/ocean/js/stages/route.js`**

```js
// The dev route (A3): `?step=N&progress=P` drives the stage director straight from the URL, with
// `s.<slider>=<value>` for the step's own sliders and `shot=0` to leave the camera free, so every
// step can be loaded, tested and screenshotted without the story page. A value that does not fit
// is clamped or dropped with a warning, never handed to the maths.
import { STEP_COUNT } from './recipes.js';
import { clampSlider } from './sliders.js';

function readNumber(query, name, fallback, min, max, warnings, whole = false) {
	if (!query.has(name)) {
		return fallback;
	}
	const text = query.get(name);
	const value = Number(text);
	if (text.trim() === '' || !Number.isFinite(value)) {
		warnings.push(`${name}=${text} is not a number; using ${fallback}`);
		return fallback;
	}
	// A step rounds to the nearest whole step without a word; only leaving the range is said.
	const rounded = whole ? Math.round(value) : value;
	const fitted = Math.min(Math.max(rounded, min), max);
	if (fitted !== rounded) {
		warnings.push(`${name}=${text} is outside ${min}..${max}; using ${fitted}`);
	}
	return fitted;
}

/**
 * @param {string | URLSearchParams} search
 * @returns {null | { step: number, progress: number, sliders: Record<string, string>, shots: boolean, warnings: string[] }}
 */
export function parseStageRoute(search) {
	const query = search instanceof URLSearchParams ? search : new URLSearchParams(search ?? '');
	if (!query.has('step')) {
		return null;
	}
	const warnings = [];
	const step = readNumber(query, 'step', 1, 1, STEP_COUNT, warnings, true);
	const progress = readNumber(query, 'progress', 0, 0, 1, warnings);
	const sliders = {};
	for (const [key, value] of query) {
		if (key.startsWith('s.')) {
			sliders[key.slice(2)] = value;
		}
	}
	return Object.freeze({ step, progress, sliders: Object.freeze(sliders), shots: query.get('shot') !== '0', warnings: Object.freeze(warnings) });
}

// The route's raw slider texts turned into values for this recipe's sliders.
export function resolveSliderValues(recipe, raw) {
	const values = {};
	const warnings = [];
	for (const [id, text] of Object.entries(raw)) {
		const slider = recipe.sliders.find((s) => s.id === id);
		if (!slider) {
			warnings.push(`s.${id} is not a slider of step ${recipe.step}; ignored`);
			continue;
		}
		if (slider.kind === 'toggle') {
			if (text === '1' || text === 'true') {
				values[id] = true;
			} else if (text === '0' || text === 'false') {
				values[id] = false;
			} else {
				warnings.push(`s.${id}=${text} is not 0 or 1; ignored`);
			}
			continue;
		}
		const number = Number(text);
		if (text.trim() === '' || !Number.isFinite(number)) {
			warnings.push(`s.${id}=${text} is not a number; ignored`);
			continue;
		}
		const value = clampSlider(slider, number);
		if (value !== number) {
			warnings.push(`s.${id}=${text} does not fit the slider; using ${value}`);
		}
		values[id] = value;
	}
	return { values: Object.freeze(values), warnings: Object.freeze(warnings) };
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/stages/blend.test.js tests/ocean/stages/route.test.js && npm run test:ocean`
Expected: PASS: 7 blend tests, 4 route tests, the whole suite green.

- [ ] **Step 6: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean
git add content/ocean/js/stages/blend.js content/ocean/js/stages/route.js tests/ocean/stages/blend.test.js tests/ocean/stages/route.test.js
git commit -m "feat: blend neighbouring recipes by scroll progress, and a URL route to any step"
```

---

### Task 9: The stage director

**Files:**
- Create: `content/ocean/js/stages/director.js`
- Test: `tests/ocean/stages/director.test.js`

**Interfaces:**
- Consumes: Task 5 `Ocean.configureStage`, `Ocean.status`; Task 7 `recipeFor`, `STEP_COUNT`, `applySliders`, `clampSlider`, `sliderById`, `sliderValue`, `getPath`; Task 8 `blendRecipes`, `engineSettings`; Task 2 `probeSurface` (tests).
- Produces (`stages/director.js`), the object piece C drives:
  `createDirector(ocean, { configure = Ocean.configureStage } = {}) -> {`
  `setStep(step: 1..13, progress = 0)` (throws for a bad step or a non-number progress; progress clamped),
  `setSlider(id, value) -> clampedValue` (on the step being read; throws for an unknown id or a wrong type),
  `press(id) -> newValue` (a counter slider: +1; throws for anything else),
  `sliders() -> [{ ...slider, value, available }]` (`available` is false for a layer toggle the tier has no cascade for),
  `frame() -> { recipe, look, shot, charts }` (configures the engine only when the step, progress or a slider changed),
  `state() -> { step, progress, values }` `}`.

- [ ] **Step 1: Write the failing tests**

`tests/ocean/stages/director.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';
import * as Ocean from '../../../content/ocean/js/engine/ocean.js';
import { probeSurface } from '../../../content/ocean/js/engine/surfaceProbe.js';
import { createDirector } from '../../../content/ocean/js/stages/director.js';
import { STEP_COUNT } from '../../../content/ocean/js/stages/recipes.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const SUN = [-0.9526530504226685, 0.2821884751319885, 0.11323313415050507];

function build(query = '?tier=Low', options) {
	let clock = 0;
	const ocean = Ocean.create(readConfig(query), {
		spawnCascade: () => createInProcessWorker(createCascadeWorker),
		spawnPainter: () => createInProcessWorker(createPainterWorker),
		now: () => clock,
		log: { warn() {} },
	});
	Ocean.attachSink(ocean, { uploadColourBand() {}, uploadMaskOrNormal() {}, uploadRoughness() {} });
	const director = createDirector(ocean, options);
	const advance = async (frames, each) => {
		for (let i = 0; i < frames; i++) {
			clock += 1 / 60;
			each?.(i);
			director.frame();
			Ocean.step(ocean, 1 / 60, [0, 0], [0, 14, 40], SUN);
			await flush();
		}
	};
	return { ocean, director, advance };
}

const finite = (ocean) => ocean.surface.patches.every((p) => p.positions.every(Number.isFinite) && p.normals.every(Number.isFinite));

test('step 2 puts one sine wave on the surface: along x only, nothing sideways', async () => {
	const { ocean, director, advance } = build();
	director.setStep(2);
	await advance(3);
	const probe = probeSurface(ocean.surface);
	expect.equal(probe.zSpread, 0, 'no change along z');
	expect.truthy(probe.xSpread > 0.2, `changes along x: ${probe.xSpread}`);
	expect.equal(probe.maxLateral, 0, 'no sideways motion');
	expect.equal(Ocean.status(ocean).source, 'waves', 'a teaching source');
});

test('every step configures without error and draws a finite surface', async () => {
	const { ocean, director, advance } = build();
	for (let step = 1; step <= STEP_COUNT; step++) {
		director.setStep(step);
		await advance(4);
		expect.truthy(finite(ocean), `step ${step} finite`);
		expect.equal(director.frame().recipe.step, step, `step ${step} shown`);
	}
	expect.equal(Ocean.status(ocean).source, 'fft', 'the finale is the FFT');
});

test('a slider value is clamped, kept per step, and survives a visit elsewhere', async () => {
	const { ocean, director, advance } = build();
	director.setStep(2);
	expect.equal(director.setSlider('amplitude', 9), 4, 'clamped to the slider');
	director.setStep(3);
	await advance(2);
	director.setStep(2);
	await advance(2);
	expect.equal(director.sliders().find((s) => s.id === 'amplitude').value, 4, 'kept');
	expect.truthy(probeSurface(ocean.surface).maxAbsY > 3, 'and drawn');
	expect.equal(director.state().values[2].amplitude, 4, 'in the state');
});

test('setSlider refuses an id the step does not have and a value of the wrong kind (Review Focus 3)', () => {
	const { director } = build();
	director.setStep(1);
	const attempt = (fn) => {
		try {
			fn();
			return 'ok';
		} catch (error) {
			return error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
	};
	expect.truthy(attempt(() => director.setSlider('wind', 12)).includes('wind'), 'not a slider of step 1');
	expect.truthy(attempt(() => director.setSlider('wireframe', 'yes')).includes('wireframe'), 'not a boolean');
	expect.truthy(attempt(() => director.press('wireframe')).includes('counter'), 'press needs a counter');
	expect.truthy(attempt(() => director.setStep(14)).includes('step'), 'step 14');
	expect.truthy(attempt(() => director.setStep(3, Number.NaN)).includes('progress'), 'a NaN progress');
});

test('press on step 8 draws a new random sea', async () => {
	const { ocean, director, advance } = build();
	director.setStep(8);
	await advance(2);
	expect.equal(director.press('seed'), 8, 'seed 7 becomes 8');
	await advance(1);
	expect.equal(ocean.live.seed, 8, 'the ocean took it');
	expect.truthy(ocean.retune.pending.some(Boolean) || ocean.retune.lastFrame > 0, 'and retunes towards it');
});

test('the engine is configured only when something changed', async () => {
	let calls = 0;
	const { director, advance } = build('?tier=Low', {
		configure: (ocean, settings) => {
			calls += 1;
			Ocean.configureStage(ocean, settings);
		},
	});
	director.setStep(5);
	await advance(5);
	expect.equal(calls, 1, 'once for the step');
	director.setSlider('chop', 0.2);
	await advance(3);
	expect.equal(calls, 2, 'once for the slider');
	director.setStep(5, 0.4);
	await advance(3);
	expect.equal(calls, 3, 'once for the progress');
	director.setStep(5, 0.4);
	await advance(2);
	expect.equal(calls, 3, 'the same step and progress again: nothing');
});

test('frame() returns the look, the shot and the charts of the blended recipe', () => {
	const { director } = build();
	director.setStep(5, 0.5);
	const out = director.frame();
	expect.equal(out.shot.position.join(','), '0,352.5,272.5', 'halfway between the crest and the fly-up');
	expect.equal(out.look.material, 'sea', 'the sea look');
	expect.equal(out.recipe.from, 5, 'from');
	expect.equal(out.charts, out.recipe.charts, 'charts');
});

test('on Medium the third layer toggle is unavailable (Review Focus 5)', () => {
	const { director } = build('?tier=Medium');
	director.setStep(10);
	const available = director.sliders().map((s) => `${s.id}:${s.available}`).join(',');
	expect.equal(available, 'layer1:true,layer2:true,layer3:false', 'two layers to toggle');
	director.frame();
});

test('progress jittering across 0.5 between steps 6 and 7 flips the parts cleanly and keeps the FFT warm (Review Focus 2)', async () => {
	const { ocean, director, advance } = build('?tier=High');
	await advance(30, (i) => {
		director.setStep(6, i % 2 === 0 ? 0.49 : 0.51);
	});
	expect.truthy(finite(ocean), 'finite throughout');
	expect.equal(ocean.parts.cascades, true, 'the cascades kept running both sides of halfway');
	expect.equal(ocean.parts.painter, true, 'the painter too');
	expect.truthy(ocean.store.current[0].filled, 'layer 1 has fields, ready to show');
	director.setStep(7);
	await advance(2);
	expect.equal(Ocean.status(ocean).source, 'fft', 'step 7 shows the FFT');
	expect.equal(Ocean.status(ocean).layers.join(','), 'true,false,false', 'one layer');
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/stages/director.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `content/ocean/js/stages/director.js`**

```js
// The stage director (A3): the one object piece C drives. It holds which step the story is at,
// how far the scroll has run towards the next, and the slider values the visitor has set on each
// step. Each frame it hands the engine the blended recipe's settings -- only when the step, the
// progress or a slider changed, since the engine keeps what it was last given -- and gives back
// what the renderer needs: the look, the camera shot and the charts, with the recipe itself.
// Browser-free; the Three.js side (render/stageLook.js, render/cameraRig.js applyShot) applies the
// look and the shot.
import * as Ocean from '../engine/ocean.js';
import { blendRecipes, engineSettings } from './blend.js';
import { getPath } from './paths.js';
import { recipeFor, STEP_COUNT } from './recipes.js';
import { applySliders, clampSlider, sliderById, sliderValue } from './sliders.js';

const LAYER_BIND = /^engine\.layers\.(\d+)$/;

/**
 * @param {object} ocean from Ocean.create
 * @param {{ configure?: (ocean: object, settings: object) => void }} [options] the engine hook;
 *   Ocean.configureStage unless a test wraps it
 */
export function createDirector(ocean, { configure = Ocean.configureStage } = {}) {
	let step = 1;
	let progress = 0;
	const values = new Map(); // step -> frozen { sliderId: value }
	let current = null;
	let dirty = true;

	const bound = (n) => applySliders(recipeFor(n), values.get(n) ?? {});

	function setStep(n, p = 0) {
		recipeFor(n); // throws for a step outside 1..13
		if (typeof p !== 'number' || !Number.isFinite(p)) {
			throw new RangeError(`progress must be a finite number, got ${p}`);
		}
		const clamped = Math.min(Math.max(p, 0), 1);
		if (n !== step || clamped !== progress) {
			step = n;
			progress = clamped;
			dirty = true;
		}
	}

	function setSlider(id, value) {
		const slider = sliderById(recipeFor(step), id);
		const next = clampSlider(slider, value);
		values.set(step, Object.freeze({ ...(values.get(step) ?? {}), [id]: next }));
		dirty = true;
		return next;
	}

	function press(id) {
		const recipe = bound(step);
		const slider = sliderById(recipe, id);
		if (slider.kind !== 'counter') {
			throw new RangeError(`slider ${id} is a ${slider.kind}, not a counter`);
		}
		return setSlider(id, getPath(recipe, slider.bind) + 1);
	}

	// A layer toggle for a cascade this tier does not run (Medium has two, Low one) is shown
	// unavailable rather than hidden, so the panel can say why.
	function available(slider) {
		const match = LAYER_BIND.exec(slider.bind);
		return match ? Number(match[1]) < ocean.preset.sizes.length : true;
	}

	function sliders() {
		const recipe = bound(step);
		return recipe.sliders.map((slider) => Object.freeze({ ...slider, value: sliderValue(recipe, slider.id), available: available(slider) }));
	}

	function frame() {
		if (dirty) {
			const from = bound(step);
			const last = step === STEP_COUNT;
			const recipe = blendRecipes(from, last ? from : bound(step + 1), last ? 0 : progress);
			configure(ocean, engineSettings(recipe));
			current = Object.freeze({ recipe, look: recipe.look, shot: recipe.shot, charts: recipe.charts });
			dirty = false;
		}
		return current;
	}

	function state() {
		return Object.freeze({ step, progress, values: Object.fromEntries(values) });
	}

	return { setStep, setSlider, press, sliders, frame, state };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/stages/director.test.js && npm run test:ocean`
Expected: PASS: 9 director tests, the whole suite green.

- [ ] **Step 5: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean
git add content/ocean/js/stages/director.js tests/ocean/stages/director.test.js
git commit -m "feat: the stage director, the object the story drives"
```

---
### Task 10: The look, the camera shot and the dev route in the page

**Files:**
- Create: `content/ocean/js/render/stageLook.js`, `content/ocean/js/ui/devStage.js`
- Modify: `content/ocean/js/render/scene.js`, `content/ocean/js/render/cameraRig.js`, `content/ocean/js/render/oceanMeshes.js`, `content/ocean/js/render/materials.js`, `content/ocean/js/ui/perfReadout.js`, `content/ocean/js/main.js`
- Test: `tests/ocean/e2e/stages.spec.js`

**Interfaces:**
- Consumes: Task 9 `createDirector`; Task 8 `parseStageRoute`, `resolveSliderValues`; Task 7 `recipeFor`, `sunDirection`; Task 6 `spectrumCurve`, `createPhaseArrows`, `phaseArrowsAt`, `measureTransforms`; Task 5 `tierForDevice`, `Ocean.teachTime`, `status().tierReason`; Task 4 sink methods `clearNormal`, `resetRoughness`; Task 2 `surface.boundsVersion`, `probeSurface`.
- Produces:
  - `render/scene.js` view gains `setFog(density)`, `setStageSun(direction)` (moves the light, the engine's sun vector and the sky dome's sun; the environment reflections follow once the sun has held still for 20 frames) and `settleEnvironment()` (call once a frame).
  - `render/cameraRig.js` rig gains `applyShot(shot, seconds)` (`move: 'drift'` circles the target once every 240 s).
  - `render/oceanMeshes.js` `sync()` refits every patch's bounding sphere when `surface.boundsVersion` changes.
  - `render/materials.js` sink gains `clearNormal()` and `resetRoughness()`.
  - `render/stageLook.js`: `createStageLook({ view, meshes, materials, config }) -> { apply(look), probe() -> { mode: 'white' | 'sea-lit' | 'sea-flat' | 'painted', wireframe, fog, sun: [x, y, z], wireMeshes } }`.
  - `ui/devStage.js`: `startStageRoute({ route, ocean, view, rig, meshes, materials, config }) -> { beforeStep(), afterStep(), hooks }`.
  - `window.__ocean.stage` (null without `?step`): `{ set(step, progress), setSlider(id, value), press(id), sliders(), recipe(), state(), surface(), look(), spectrum(), phaseArrows(), transforms(n) }`.

- [ ] **Step 1: Write the failing browser tests**

`tests/ocean/e2e/stages.spec.js`:

```js
import { test, expect } from '@playwright/test';

// Loads the page and waits until it has drawn `frames` frames. Returns the page errors seen.
async function load(page, query, frames = 20) {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`/ocean/?${query}`);
	await page.waitForFunction((target) => (window.__ocean?.status().frame ?? 0) > target, frames, { timeout: 90_000 });
	return errors;
}

test("without ?step there is no stage and the page is A2's", async ({ page }) => {
	const errors = await load(page, 'cam=deck', 5);
	expect(await page.evaluate(() => window.__ocean.stage)).toBeNull();
	const status = await page.evaluate(() => window.__ocean.status());
	expect(status.source).toBe('fft');
	expect(status.parts).toEqual({ cascades: true, painter: true, glow: true, still: false });
	expect(errors).toEqual([]);
});

test("each step's look reaches the meshes: white under its grid, the lit sea, the painted sea", async ({ page }) => {
	test.setTimeout(240_000);
	for (const [step, mode, wireframe] of [[1, 'white', true], [4, 'sea-lit', false], [7, 'painted', false], [13, 'painted', false]]) {
		const errors = await load(page, `step=${step}&freeze=12`, 10);
		const look = await page.evaluate(() => window.__ocean.stage.look());
		expect(look.mode).toBe(mode);
		expect(look.wireframe).toBe(wireframe);
		expect(await page.evaluate(() => window.__ocean.stage.recipe().step)).toBe(step);
		expect(errors).toEqual([]);
	}
});

test("the camera stands where the blended recipe's shot says", async ({ page }) => {
	await load(page, 'step=5&progress=0.5&freeze=12', 5);
	const position = await page.evaluate(() => window.__ocean.camera.position.toArray());
	// Step 5's crest shot [0, 5, 25] and step 6's fly-up [0, 700, 520], halfway.
	[0, 352.5, 272.5].forEach((value, i) => expect(position[i]).toBeCloseTo(value, 3));
});

test('a bad route warns and falls back instead of breaking (Review Focus 3)', async ({ page }) => {
	const warnings = [];
	page.on('console', (message) => {
		if (message.type() === 'warning') warnings.push(message.text());
	});
	const errors = await load(page, 'step=99&progress=-1&s.wind=abc', 10);
	expect(await page.evaluate(() => window.__ocean.stage.recipe().step)).toBe(13);
	expect(warnings.some((w) => w.includes('step=99'))).toBe(true);
	expect(warnings.some((w) => w.includes('progress=-1'))).toBe(true);
	expect(warnings.some((w) => w.includes('s.wind'))).toBe(true);
	expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run the browser tests and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/stages.spec.js`
Expected: FAIL: `window.__ocean.stage` is undefined in all four (the page has no stage hook yet).

- [ ] **Step 3: Add the stage sun, the fog and the environment rebuild to `content/ocean/js/render/scene.js`**

Replace the environment block (from `// Environment reflections from the same sky` down to and including `pmrem.dispose();`) with:

```js
	// Environment reflections from the same sky (Roblox EnvironmentSpecularScale 1). Rebuilt when a
	// stage moves the sun and it has settled (settleEnvironment), so the reflections follow it.
	const environmentScene = new THREE.Scene();
	const environmentSky = new Sky();
	environmentSky.scale.setScalar(8000);
	Object.assign(environmentSky.material.uniforms, THREE.UniformsUtils.clone(uniforms));
	environmentScene.add(environmentSky);
	function buildEnvironment() {
		const generator = new THREE.PMREMGenerator(renderer);
		const texture = generator.fromScene(environmentScene).texture;
		generator.dispose();
		return texture;
	}
	let environment = buildEnvironment();
	scene.environment = environment;
	scene.environmentIntensity = Lighting.ENVIRONMENT_INTENSITY;
```

After `setEnvironment`, add:

```js
	// Frames the stage sun must hold still before the environment is rebuilt: a PMREM pass costs a
	// few milliseconds on a GPU and far more under SwiftShader, too much for every frame of a drag.
	const ENVIRONMENT_SETTLE_FRAMES = 20;
	let environmentStale = false;
	let stillFrames = 0;

	// A3: the sun a stage recipe asks for (steps 4 and 12 move it). Unlike setSun, which the
	// calibration uses, it moves the sky dome's sun too, and the environment reflections follow once
	// the sun has held still. A direction equal to the current one changes nothing.
	function setStageSun(direction) {
		const before = [...sunArray];
		setSun(direction);
		if (sunArray.every((value, i) => value === before[i])) {
			return;
		}
		uniforms.sunPosition.value.set(sunArray[0], sunArray[1], sunArray[2]);
		environmentStale = true;
		stillFrames = 0;
	}

	// Once a frame: rebuilds the environment when the stage sun has settled.
	function settleEnvironment() {
		if (!environmentStale) {
			return;
		}
		stillFrames += 1;
		if (stillFrames < ENVIRONMENT_SETTLE_FRAMES) {
			return;
		}
		environmentSky.material.uniforms.sunPosition.value.set(sunArray[0], sunArray[1], sunArray[2]);
		const next = buildEnvironment();
		if (scene.environment === environment) {
			scene.environment = next;
		}
		environment.dispose();
		environment = next;
		environmentStale = false;
	}

	// A3: the fog a stage recipe asks for (step 6 thins it so the repetition shows).
	function setFog(density) {
		if (!(Number.isFinite(density) && density >= 0)) {
			throw new Error(`setFog needs a finite density of at least 0, got ${density}`);
		}
		scene.fog.density = density;
	}
```

and add `setStageSun,`, `settleEnvironment,` and `setFog,` to the returned object.

- [ ] **Step 4: Add `applyShot` to `content/ocean/js/render/cameraRig.js`**

Above `createCameraRig` add:

```js
// A3: the finale's `drift` circles the shot's target once every four minutes.
const DRIFT_RADIANS_PER_SECOND = (2 * Math.PI) / 240;
```

and add to the returned object:

```js
		// A3: puts the camera where a stage recipe's shot says (its target is what the rings
		// follow). Damping is turned off so no leftover orbit momentum carries the camera off the
		// shot; piece C decides when the visitor may orbit freely between steps.
		applyShot(shot, seconds) {
			const [tx, ty, tz] = shot.target;
			let [px, py, pz] = shot.position;
			if (shot.move === 'drift') {
				const angle = seconds * DRIFT_RADIANS_PER_SECOND;
				const dx = px - tx;
				const dz = pz - tz;
				px = tx + dx * Math.cos(angle) - dz * Math.sin(angle);
				pz = tz + dx * Math.sin(angle) + dz * Math.cos(angle);
			}
			controls.enableDamping = false;
			camera.position.set(px, py, pz);
			controls.target.set(tx, ty, tz);
			controls.update();
		},
```

- [ ] **Step 5: Refit the bounding spheres in `content/ocean/js/render/oceanMeshes.js`**

Add to the header comment: `// When a slider raises the sea the engine grows the bounds (A3); sync refits every sphere then.`

In `createOceanMeshes`, replace the two bounding-sphere lines inside the `patchMeshes` map

```js
		const reach = state.half + surface.bounds.lateral;
		geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(reach, reach, surface.bounds.height));
```

with

```js
		geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), sphereRadius(state));
```

add above the `patchMeshes` map:

```js
	const sphereRadius = (state) => {
		const reach = state.half + surface.bounds.lateral;
		return Math.hypot(reach, reach, surface.bounds.height);
	};
	let boundsVersion = surface.boundsVersion;
```

and make the first statements of `sync()`:

```js
		if (surface.boundsVersion !== boundsVersion) {
			surface.patches.forEach((state, i) => {
				patchMeshes[i].geometry.boundingSphere.radius = sphereRadius(state);
			});
			boundsVersion = surface.boundsVersion;
		}
```

- [ ] **Step 6: Give the sink `clearNormal` and `resetRoughness` in `content/ocean/js/render/materials.js`**

Replace the roughness construction

```js
	const roughness = Array.from({ length: ringCount }, (_, i) => {
		const base = config.roughness[Math.min(i + 1, config.roughness.length) - 1];
		const texture = dataTexture(MAP_TEXELS, [0, 0, 0], THREE.NoColorSpace, anisotropy);
		FoamRoughness.fill(texture.image.data, MAP_TEXELS, coverage, base, base);
		texture.needsUpdate = true;
		return texture;
	});
```

with

```js
	// A ring's roughness at rest: its base everywhere, as no foam leaves it.
	const restRoughness = (texture, i) => {
		const base = config.roughness[Math.min(i + 1, config.roughness.length) - 1];
		FoamRoughness.fill(texture.image.data, MAP_TEXELS, coverage, base, base);
		texture.needsUpdate = true;
	};
	const roughness = Array.from({ length: ringCount }, (_, i) => {
		const texture = dataTexture(MAP_TEXELS, [0, 0, 0], THREE.NoColorSpace, anisotropy);
		restRoughness(texture, i);
		return texture;
	});
```

and add to the `sink` object, after `uploadRoughness`:

```js
		// A3 (PainterClient.update): the painter has no cascade left for the normal map, so the last
		// ripples must not stay on the water: back to flat.
		clearNormal() {
			const data = normal.image.data;
			for (let i = 0; i < data.length; i += 4) {
				data[i] = 128;
				data[i + 1] = 128;
				data[i + 2] = 255;
				data[i + 3] = 255;
			}
			normal.needsUpdate = true;
		},
		// A3: the foam was switched off, so every ring's roughness goes back to its base.
		resetRoughness() {
			roughness.forEach(restRoughness);
		},
```

- [ ] **Step 7: Say why the tier was chosen in `content/ocean/js/ui/perfReadout.js`**

Replace ``` `fps ${fps}  frame ${status.frame}  tier ${status.tier}  vertices ${status.vertices}`, ``` with:

```js
				`fps ${fps}  frame ${status.frame}  tier ${status.tier} (${status.tierReason === 'phone rule' ? 'phone rule, unmeasured' : status.tierReason})  vertices ${status.vertices}`,
```

- [ ] **Step 8: Write `content/ocean/js/render/stageLook.js`**

```js
// The look a stage recipe asks for, applied to the ocean's meshes (A3; not a twin): which material
// the surface wears -- flat white (step 1's plane and the unlit steps 2 and 3), the sea colour lit by
// the sun and the sky (steps 4 to 6) or unlit (step 4 with its shading off), or the painted
// Roblox-mode materials (step 7 on) -- the wireframe over it, the fog and the sun. A material
// change swaps the meshes' material references; nothing is rebuilt, and the painted materials keep
// their textures and glow for when they come back. The wireframe is one extra mesh per patch,
// sharing the patch's geometry as its child (so it moves and hides with it), built the first time
// it is asked for and hidden, not removed, when it is switched off. The horizon quads get the
// material but no wireframe: two triangles 2,048 studs wide would draw one huge diagonal.
import * as THREE from 'three';
import { sunDirection } from '../stages/sun.js';

const WHITE = Object.freeze([0.95, 0.95, 0.94]);
const WIRE = Object.freeze([0.11, 0.17, 0.21]);
const WIRE_OPACITY = 0.55;
// The lit sea's roughness: shiny enough for the sun's highlight and the sky's Fresnel to read on
// the Gerstner waves of steps 4 to 6.
const SEA_ROUGHNESS = 0.3;
const MODES = Object.freeze(['white', 'sea-lit', 'sea-flat', 'painted']);

const srgb = (rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);

// The unpainted sea's colour: the painted map's own mix, deep water tinted towards the subsurface
// colour by the tint (config.deep, config.subsurface, config.tint).
function seaColour(config) {
	const mix = (i) => (config.deep[i] + (config.subsurface[i] - config.deep[i]) * config.tint) / 255;
	return srgb([mix(0), mix(1), mix(2)]);
}

function modeOf(look) {
	const mode = look.material === 'sea' ? (look.shading ? 'sea-lit' : 'sea-flat') : look.material;
	if (!MODES.includes(mode)) {
		throw new Error(`stage look: unknown material ${look.material}`);
	}
	return mode;
}

export function createStageLook({ view, meshes, materials, config }) {
	const sea = seaColour(config);
	const shared = {
		// Pushed back a little in depth so the wireframe drawn at the same depth sits on top of it.
		white: new THREE.MeshBasicMaterial({ color: srgb(WHITE), toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
		'sea-lit': new THREE.MeshStandardMaterial({ color: sea, roughness: SEA_ROUGHNESS, metalness: 0 }),
		'sea-flat': new THREE.MeshBasicMaterial({ color: sea }),
	};
	const wireMaterial = new THREE.MeshBasicMaterial({ color: srgb(WIRE), wireframe: true, transparent: true, opacity: WIRE_OPACITY, toneMapped: false });
	let mode = 'painted';
	let wires = null;
	let wireframe = false;
	let sunKey = '';

	function setMode(next) {
		if (next === mode) {
			return;
		}
		const material = shared[next] ?? null;
		meshes.patchMeshes.forEach((mesh, i) => {
			mesh.material = material ?? materials.patchMaterials[i];
		});
		meshes.quadMeshes.forEach((mesh, i) => {
			mesh.material = material ?? materials.quadMaterials[i];
		});
		mode = next;
	}

	function setWireframe(on) {
		if (on === wireframe) {
			return;
		}
		if (on && !wires) {
			wires = meshes.patchMeshes.map((mesh) => {
				const wire = new THREE.Mesh(mesh.geometry, wireMaterial);
				mesh.add(wire);
				return wire;
			});
		}
		for (const wire of wires ?? []) {
			wire.visible = on;
		}
		wireframe = on;
	}

	function apply(look) {
		setMode(modeOf(look));
		setWireframe(look.wireframe);
		view.setFog(look.fog);
		const key = `${look.sun.azimuth}|${look.sun.elevation}`;
		if (key !== sunKey) {
			view.setStageSun(sunDirection(look.sun));
			sunKey = key;
		}
	}

	function probe() {
		return { mode, wireframe, fog: view.scene.fog.density, sun: [...view.sunDirection], wireMeshes: wires ? wires.length : 0 };
	}

	return { apply, probe };
}
```

- [ ] **Step 9: Write `content/ocean/js/ui/devStage.js`**

```js
// The dev route in the page (A3): with ?step=N&progress=P the stage director drives the ocean
// straight from the URL, applying each frame's look and camera shot, so every step can be loaded,
// tested and screenshotted without the story. Piece C replaces the URL with the scroll story and
// keeps the director; the hooks on window.__ocean.stage stay for the browser tests.
import * as Charts from '../engine/charts.js';
import * as Ocean from '../engine/ocean.js';
import { probeSurface } from '../engine/surfaceProbe.js';
import { createDirector } from '../stages/director.js';
import { recipeFor } from '../stages/recipes.js';
import { resolveSliderValues } from '../stages/route.js';
import { createStageLook } from '../render/stageLook.js';

export function startStageRoute({ route, ocean, view, rig, meshes, materials, config }) {
	const director = createDirector(ocean);
	director.setStep(route.step, route.progress);
	const { values, warnings } = resolveSliderValues(recipeFor(route.step), route.sliders);
	for (const warning of warnings) {
		console.warn(`[ocean] ${warning}`);
	}
	for (const [id, value] of Object.entries(values)) {
		director.setSlider(id, value);
	}
	const look = createStageLook({ view, meshes, materials, config });

	// The phase arrows are built once per sea (a cascade build) and turned every call.
	let arrows = null;
	let arrowsKey = '';
	function phaseArrows() {
		const { params, seed } = ocean.live;
		const key = `${params.windSpeed}|${params.fetch}|${seed}`;
		if (key !== arrowsKey) {
			arrows = Charts.createPhaseArrows(params, { seed, sizes: ocean.preset.sizes, n: ocean.preset.n });
			arrowsKey = key;
		}
		return Charts.phaseArrowsAt(arrows, ocean.t);
	}

	return {
		// Before Ocean.step: the recipe's settings reach the engine and its look and shot the scene,
		// so the rings follow the shot's target in the same frame.
		beforeStep() {
			const out = director.frame();
			look.apply(out.look);
			if (route.shots) {
				rig.applyShot(out.shot, Ocean.teachTime(ocean));
			}
		},
		afterStep() {
			view.settleEnvironment();
		},
		hooks: Object.freeze({
			set: (step, progress = 0) => director.setStep(step, progress),
			setSlider: (id, value) => director.setSlider(id, value),
			press: (id) => director.press(id),
			sliders: () => director.sliders(),
			recipe: () => director.frame().recipe,
			state: () => director.state(),
			surface: () => probeSurface(ocean.surface),
			look: () => look.probe(),
			spectrum: () => Charts.spectrumCurve(ocean.live.params, { sizes: ocean.preset.sizes, n: ocean.preset.n }),
			phaseArrows,
			transforms: (n) => Charts.measureTransforms(n),
		}),
	};
}
```

- [ ] **Step 10: Replace `content/ocean/js/main.js`**

```js
// Page boot: read the config, check WebGL, and start the ocean: scene, camera, the painted
// materials, the CPU-written meshes over the engine's typed arrays, the frame loop and the stats
// readout. With ?step=N the stage director drives the ocean through the story's steps
// (ui/devStage.js); without it the page is the A2 hero sea, unchanged.
import { readConfig, tierForDevice } from './engine/config.js';
import * as Ocean from './engine/ocean.js';
import { parseStageRoute } from './stages/route.js';
import { createScene } from './render/scene.js';
import { createCameraRig } from './render/cameraRig.js';
import { createOceanMeshes } from './render/oceanMeshes.js';
import { createMaterials } from './render/materials.js';
import { createPerfReadout } from './ui/perfReadout.js';
import { startStageRoute } from './ui/devStage.js';

// three@0.186's WebGLRenderer asks for WebGL 2 only and throws without it, so WebGL 1 does not count.
export function webglSupported() {
	try {
		const probe = document.createElement('canvas');
		const gl = probe.getContext('webgl2');
		// Give the probe's context back now rather than at garbage collection: browsers cap live
		// contexts, and the renderer's own is next.
		gl?.getExtension('WEBGL_lose_context')?.loseContext();
		return Boolean(gl);
	} catch {
		return false;
	}
}

function showNotice(text) {
	const notice = document.getElementById('notice');
	notice.textContent = text;
	notice.hidden = false;
}

// The phone rule's two facts about this device (engine/config.js tierForDevice decides).
function deviceTier() {
	return tierForDevice({
		shortSide: Math.min(window.screen.width, window.screen.height),
		coarsePointer: window.matchMedia('(pointer: coarse)').matches,
	});
}

function start(config, route) {
	const canvas = document.getElementById('ocean');
	const view = createScene(canvas);
	const rig = createCameraRig(view.camera, canvas, config);
	const ocean = Ocean.create(config, {
		spawnCascade: () => new Worker(new URL('./workers/cascade.worker.js', import.meta.url), { type: 'module' }),
		spawnPainter: () => new Worker(new URL('./workers/painter.worker.js', import.meta.url), { type: 'module' }),
		now: () => performance.now() / 1000,
		deviceTier: deviceTier(),
	});
	const materials = createMaterials(ocean, view.renderer);
	Ocean.attachSink(ocean, materials.sink);
	const meshes = createOceanMeshes(view.scene, ocean, materials);
	const stats = document.getElementById('stats');
	stats.hidden = !config.stats;
	const readout = createPerfReadout(stats);
	const focus = [0, 0];
	const eye = [0, 0, 0];
	let last = performance.now();
	view.resize();
	window.addEventListener('resize', view.resize);
	const stage = route ? startStageRoute({ route, ocean, view, rig, meshes, materials, config }) : null;
	window.__ocean = {
		status: () => Ocean.status(ocean),
		report: () => Ocean.report(ocean),
		camera: view.camera,
		materialsProbe: () => materials.probe(),
		setNormalScale: (x, y) => materials.setNormalScale(x, y),
		setSun: (direction) => view.setSun(direction),
		setEnvironment: (enabled) => view.setEnvironment(enabled),
		stage: stage ? stage.hooks : null,
	};

	function frame(now) {
		const dt = (now - last) / 1000;
		last = now;
		rig.update();
		stage?.beforeStep();
		Ocean.step(ocean, dt, rig.focus(focus), rig.eye(eye), view.sunDirection);
		materials.applyStrengths(ocean.strengths);
		meshes.sync();
		view.follow();
		stage?.afterStep();
		const renderStarted = performance.now();
		view.render();
		Ocean.addStageSeconds(ocean, 'render', (performance.now() - renderStarted) / 1000);
		readout.frame(now);
		if (config.stats) readout.show(Ocean.status(ocean), Ocean.report(ocean));
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);
}

const config = readConfig(location.search);
const route = parseStageRoute(location.search);
for (const warning of [...config.warnings, ...(route?.warnings ?? [])]) {
	console.warn(`[ocean] ${warning}`);
}
const NO_WEBGL = 'This live ocean needs WebGL 2, which this browser has turned off or does not support.';
if (webglSupported()) {
	// The probe can pass and the renderer's own context still fail (a lost GPU process, a blocklist
	// that applies to the second context): say so instead of leaving a blank page.
	try {
		start(config, route);
	} catch (error) {
		console.error('[ocean] could not start', error);
		showNotice(NO_WEBGL);
	}
} else {
	showNotice(NO_WEBGL);
}
```

- [ ] **Step 11: Run every test and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npm run test:ocean && npm run test:ocean:e2e`
Expected: PASS: the unit suite, the four new browser tests and every A2 browser test (shell, ocean, materials) unchanged. If a threshold or a timeout fails on a page that renders correctly, report the measured value rather than changing the test.

- [ ] **Step 12: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean
git add content/ocean/js/render/stageLook.js content/ocean/js/ui/devStage.js content/ocean/js/render/scene.js content/ocean/js/render/cameraRig.js content/ocean/js/render/oceanMeshes.js content/ocean/js/render/materials.js content/ocean/js/ui/perfReadout.js content/ocean/js/main.js tests/ocean/e2e/stages.spec.js
git commit -m "feat: the stage look, the camera shot and the ?step dev route in the page"
```

---

### Task 11: A browser check per step, the capture script, and the status line

**Files:**
- Create: `tests/ocean/e2e/stageSteps.spec.js`
- Create: `scripts/ocean-stage-capture.mjs`
- Modify: `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md` (the A3 status line)

**Interfaces:**
- Consumes: the page from Task 10 (`window.__ocean.status()`, `.materialsProbe()`, `.camera`, `.stage.*`).
- Produces: one browser test per story step proving the canvas and the engine do what the recipe says; `node scripts/ocean-stage-capture.mjs <dir>` writing `step-01.png` .. `step-13.png`; the spec's A3 status line.

- [ ] **Step 1: Write the per-step browser tests**

`tests/ocean/e2e/stageSteps.spec.js`:

```js
import { test, expect } from '@playwright/test';

// One check per story step through the dev route: the engine state the recipe asks for, and the
// canvas changing when a slider says it should. Headless Chromium draws through SwiftShader at
// about 5 fps, so every wait is in frames, and every threshold was chosen before measuring: if one
// fails on a page that renders correctly, report the measured value rather than lowering it.
const DIFFERENT = 1; // mean absolute luminance change (0..255) that counts as "the canvas changed"
const MOVING = 2; // the same, over frames with the clock running

let errors;
test.beforeEach(({ page }) => {
	errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

async function load(page, query, frames = 20) {
	await page.goto(`/ocean/?${query}`);
	await page.waitForFunction((target) => (window.__ocean?.status().frame ?? 0) > target, frames, { timeout: 120_000 });
}

async function waitFrames(page, frames) {
	const start = await page.evaluate(() => window.__ocean.status().frame);
	await page.waitForFunction((target) => window.__ocean.status().frame >= target, start + frames, { timeout: 120_000 });
}

const stage = (page, name, ...args) => page.evaluate(([name, args]) => window.__ocean.stage[name](...args), [name, args]);

// The canvas (or its lower half) as a 64-wide luminance grid, read inside a frame callback after
// the page's own render: the renderer does not keep its drawing buffer between frames.
async function grid(page, lower = false) {
	return page.evaluate((lower) => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const copy = document.createElement('canvas');
		copy.width = 64;
		copy.height = lower ? 18 : 36;
		const context = copy.getContext('2d');
		const top = lower ? source.height / 2 : 0;
		context.drawImage(source, 0, top, source.width, source.height - top, 0, 0, copy.width, copy.height);
		const data = context.getImageData(0, 0, copy.width, copy.height).data;
		const out = [];
		for (let i = 0; i < data.length; i += 4) out.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
		resolve(out);
	})), lower);
}

const meanDiff = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

async function lowerHalfMotion(page, frames) {
	const before = await grid(page, true);
	await waitFrames(page, frames);
	return meanDiff(before, await grid(page, true));
}

test('step 1: a flat white plane under a grid; the wireframe toggles off', async ({ page }) => {
	await load(page, 'step=1&freeze=12', 10);
	const surface = await stage(page, 'surface');
	expect(surface.maxAbsY).toBe(0);
	expect(surface.maxLateral).toBe(0);
	const status = await page.evaluate(() => window.__ocean.status());
	expect(status.parts).toEqual({ cascades: false, painter: false, glow: false, still: true });
	const withGrid = await grid(page, true);
	expect(mean(withGrid)).toBeGreaterThan(150);
	await stage(page, 'setSlider', 'wireframe', false);
	await waitFrames(page, 3);
	expect(meanDiff(withGrid, await grid(page, true))).toBeGreaterThan(DIFFERENT);
	expect((await stage(page, 'look')).wireframe).toBe(false);
});

test('step 2: one sine wave, changing along one axis only, moving', async ({ page }) => {
	await load(page, 'step=2', 10);
	const surface = await stage(page, 'surface');
	expect(surface.zSpread).toBe(0);
	expect(surface.xSpread).toBeGreaterThan(0.2);
	expect(surface.maxLateral).toBe(0);
	expect(await lowerHalfMotion(page, 10)).toBeGreaterThan(MOVING);
});

test('step 3: the wave-count slider adds waves to the canvas', async ({ page }) => {
	await load(page, 'step=3&freeze=12&s.waveCount=1', 10);
	const one = await grid(page);
	await stage(page, 'setSlider', 'waveCount', 32);
	await waitFrames(page, 3);
	expect(meanDiff(one, await grid(page))).toBeGreaterThan(DIFFERENT);
});

test('step 4: light: turning the shading off and moving the sun both change the sea', async ({ page }) => {
	await load(page, 'step=4&freeze=12', 10);
	expect((await stage(page, 'look')).mode).toBe('sea-lit');
	const lit = await grid(page, true);
	await stage(page, 'setSlider', 'shading', false);
	await waitFrames(page, 3);
	expect((await stage(page, 'look')).mode).toBe('sea-flat');
	expect(meanDiff(lit, await grid(page, true))).toBeGreaterThan(DIFFERENT);
	await stage(page, 'setSlider', 'shading', true);
	await waitFrames(page, 3);
	const before = await grid(page, true);
	await stage(page, 'setSlider', 'sunAzimuth', 0);
	await waitFrames(page, 3);
	expect(meanDiff(before, await grid(page, true))).toBeGreaterThan(DIFFERENT);
});

test('step 5: choppiness moves the vertices sideways', async ({ page }) => {
	await load(page, 'step=5&freeze=12&s.chop=0', 10);
	expect((await stage(page, 'surface')).maxLateral).toBe(0);
	await stage(page, 'setSlider', 'chop', 1);
	await waitFrames(page, 3);
	expect((await stage(page, 'surface')).maxLateral).toBeGreaterThan(0.1);
});

test('step 6: the camera flies up and the fog thins so the repetition shows', async ({ page }) => {
	await load(page, 'step=6&freeze=12', 10);
	const position = await page.evaluate(() => window.__ocean.camera.position.toArray());
	expect(position[1]).toBeGreaterThan(600);
	expect((await stage(page, 'look')).fog).toBeLessThan(0.0002);
});

test('step 7: the FFT with one layer; a stronger wind raises the sea; the spectrum chart has data', async ({ page }) => {
	test.setTimeout(240_000);
	await load(page, 'step=7&freeze=12&s.wind=6', 40);
	const status = await page.evaluate(() => window.__ocean.status());
	expect(status.source).toBe('fft');
	expect(status.layers).toEqual([true, false, false]);
	const calm = (await stage(page, 'surface')).maxAbsY;
	await stage(page, 'setSlider', 'wind', 22);
	await waitFrames(page, 60);
	expect((await stage(page, 'surface')).maxAbsY).toBeGreaterThan(calm * 1.5);
	const spectrum = await stage(page, 'spectrum');
	expect(spectrum.omega.length).toBe(200);
	expect(spectrum.physical.every(Number.isFinite)).toBe(true);
});

test('step 8: New sea draws another random ocean, and the phase arrows turn', async ({ page }) => {
	test.setTimeout(180_000);
	await load(page, 'step=8&freeze=12', 40);
	const before = (await stage(page, 'surface')).sumY;
	expect(await stage(page, 'press', 'seed')).toBe(8);
	await waitFrames(page, 30);
	expect(Math.abs((await stage(page, 'surface')).sumY - before)).toBeGreaterThan(1e-3);
	const arrows = await stage(page, 'phaseArrows');
	expect(arrows.length).toBe(8);
	expect(arrows.every((a) => Number.isFinite(a.re) && Number.isFinite(a.im))).toBe(true);
});

test('step 9: the naive sum and the FFT are timed live and agree', async ({ page }) => {
	await load(page, 'step=9&freeze=12', 10);
	expect((await stage(page, 'recipe')).charts.transformN).toBe(32);
	const result = await stage(page, 'transforms', 16);
	expect(result.naiveMs).toBeGreaterThan(0);
	expect(result.fftMs).toBeGreaterThan(0);
	expect(result.maxDifference).toBeLessThan(1e-6);
});

test('step 10: switching a layer off changes the sea on screen', async ({ page }) => {
	test.setTimeout(240_000);
	await load(page, 'step=10&freeze=12', 60);
	expect((await page.evaluate(() => window.__ocean.status())).layers).toEqual([true, true, true]);
	const all = await grid(page);
	await stage(page, 'setSlider', 'layer1', false);
	await waitFrames(page, 12);
	expect(meanDiff(all, await grid(page))).toBeGreaterThan(DIFFERENT);
	expect((await page.evaluate(() => window.__ocean.status())).layers).toEqual([false, true, true]);
});

test('step 11: the whitecap slider sets how much foam there is', async ({ page }) => {
	test.setTimeout(300_000);
	await load(page, 'step=11&freeze=12&s.whitecap=0', 80);
	const little = await page.evaluate(() => window.__ocean.status().foamCover);
	await load(page, 'step=11&freeze=12&s.whitecap=1', 80);
	const lots = await page.evaluate(() => window.__ocean.status().foamCover);
	expect(lots).toBeGreaterThan(little);
});

test('step 12: the glow slider drives the emissive glow and the sun-height slider moves the sun', async ({ page }) => {
	test.setTimeout(180_000);
	await load(page, 'step=12&freeze=12&s.glow=0', 40);
	expect(await page.evaluate(() => window.__ocean.materialsProbe().maxEmissiveIntensity)).toBe(0);
	await stage(page, 'setSlider', 'glow', 60);
	await waitFrames(page, 3);
	expect(await page.evaluate(() => window.__ocean.materialsProbe().maxEmissiveIntensity)).toBeGreaterThan(0);
	await stage(page, 'setSlider', 'sunHeight', 40);
	await waitFrames(page, 3);
	expect((await stage(page, 'look')).sun[1]).toBeCloseTo(Math.sin((40 * Math.PI) / 180), 6);
});

test('step 13: the hero sea, every part on, moving', async ({ page }) => {
	test.setTimeout(180_000);
	await load(page, 'step=13', 40);
	const status = await page.evaluate(() => window.__ocean.status());
	expect(status.source).toBe('fft');
	expect(status.layers).toEqual([true, true, true]);
	expect(status.parts).toEqual({ cascades: true, painter: true, glow: true, still: false });
	expect(status.windSpeed).toBe(12);
	expect(status.chop).toBe(0.8);
	expect(await lowerHalfMotion(page, 30)).toBeGreaterThan(MOVING);
});
```

- [ ] **Step 2: Run the per-step tests**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/stageSteps.spec.js`
Expected: PASS, 13 tests. These test what Tasks 1 to 10 built; a failure is a bug to find with superpowers:systematic-debugging (or a threshold to report with its measured value), not a test to loosen.

- [ ] **Step 3: Write `scripts/ocean-stage-capture.mjs`**

```js
// Screenshots every story step through the dev route, one PNG per step (A3), for looking at the
// thirteen steps side by side. The clock is frozen at t = 12 so a rerun draws the same seas.
// Usage: node scripts/ocean-stage-capture.mjs <out-dir> [progress] [extra query, e.g. "tier=Medium"]
// Needs the page served on :8767 (npm run serve:ocean).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = 'stage-capture', progress = '0', extra = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 767 } });
page.on('pageerror', (error) => console.error(`page error: ${error.message}`));
for (let step = 1; step <= 13; step++) {
	const query = `?step=${step}&progress=${progress}&freeze=12&hud=0${extra ? `&${extra}` : ''}`;
	await page.goto(`http://localhost:8767/ocean/${query}`);
	// The FFT steps need their cascades and painter warm; the Gerstner steps draw at once.
	const frames = step >= 7 ? 90 : 20;
	await page.waitForFunction((target) => (window.__ocean?.status().frame ?? 0) > target, frames, { timeout: 180_000 });
	const file = join(outDir, `step-${String(step).padStart(2, '0')}.png`);
	await page.screenshot({ path: file });
	console.log(`wrote ${file}`);
}
await browser.close();
```

- [ ] **Step 4: Capture the thirteen steps and look at them**

Run: `cd /Users/cole/Projects/Wesbite-ocean && (npm run serve:ocean > /dev/null 2>&1 &) && node scripts/ocean-stage-capture.mjs /private/tmp/claude-501/-Users-cole-Projects-Personal-Website/a38b7a5e-8c1d-439a-bc41-f6bc2536f799/scratchpad/stage-capture-0 0`
Expected: `wrote .../step-01.png` through `step-13.png`, no `page error` lines.

Then open each PNG with the Read tool and check it against its recipe, writing one line per step into the report: 1 a white plane under a dark grid to the horizon; 2 parallel crests running across the view (the grid shows them); 3 a crossed, irregular white sea; 4 a lit blue-green sea with a highlight; 5 sharper crests from low down; 6 the sea from high up with a visible repeat; 7 to 9 the painted sea, smooth (one layer); 10 the painted sea from high up with fine detail; 11 foam on the crests from low down; 12 turquoise glow on the crests looking towards the sun; 13 the A2 deck view. Do not tune any look here: report what differs. Stop the server afterwards (`pkill -f "http.server 8767"`).

- [ ] **Step 5: Record A3 in the spec's status lines**

In `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md`, add after the `**A2 (Roblox mode on screen):**` line (fill `<sha>` from `git log -1 --format=%h` and the two counts from the last `npm run test:ocean` and `npm run test:ocean:e2e` runs):

```markdown
**A3 (teaching stages, engine side):** done on 2026-09-30 at commit `<sha>`: recipes for all 13 steps (parts, sea, look, camera shot, sliders with ranges and bindings) and their blending by scroll progress; teaching wave sources for steps 1 to 6 (one sine, and the prototype's 32 waves snapped to the 256-stud lattice so step 6's repetition is real); per-stage switches so parts that are off cost nothing; cascade retune and painter update messages so sliders change the sea without restarting a worker or wiping the foam; growing bounds; chart data (spectrum curve, phase arrows, naive sum against FFT timed live); the dev route `?step=N&progress=P`. <U> unit and <B> browser tests. Phones get Medium by rule (touch-first, screen under 900 px on its short side), unmeasured. Cole has not seen the steps; piece C builds the story on the director (`stages/director.js`).
```

- [ ] **Step 6: Run everything once more**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npm run test:ocean && npm run test:ocean:e2e`
Expected: PASS, both suites.

- [ ] **Step 7: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean
git add tests/ocean/e2e/stageSteps.spec.js scripts/ocean-stage-capture.mjs docs/superpowers/specs/2026-09-27-ocean-showcase-design.md
git commit -m "test: a browser check per story step, the stage capture script, and A3's status line"
```
