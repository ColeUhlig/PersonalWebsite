# Ocean Showcase A1: Core Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A JavaScript twin of every pure Luau module of the Roblox ocean, under `content/ocean/js/core/`,
with every Luau spec case (159 of them) carried over as a Node test and passing.

**Architecture:** One ES module per Luau module, same function names, same numbers, same outputs. Luau
tables of numbers become `Float64Array`s, Luau `buffer`s become typed arrays with the same byte layout,
multiple return values go into an `out` array. Index values (cascade numbers, ring numbers, vertex indices)
keep their Luau value; only the JavaScript arrays underneath start at 0. No DOM, no Three.js: everything
here runs in Node.

**Tech Stack:** Plain ES modules, Node 25 built-in test runner (`node --test`) with its built-in coverage.
No npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md`, sections 4.1, 4.2, 4.6 and 7 (this
plan is build step 1, "A1 Core port", of section 9).

**Source being ported:** `/Users/cole/Projects/roblox-ocean/src/shared/Ocean/*.luau` (the modules) and
`/Users/cole/Projects/roblox-ocean/tests/*.spec.luau` (the specs). Read-only: nothing in that repo changes.

## Global Constraints

- Work only in the worktree `/Users/cole/Projects/Wesbite-ocean` on branch `ocean-showcase`. Never touch
  `/Users/cole/Projects/Wesbite` itself: another session works there on the VEX page.
- No build step; plain ES modules that a browser can import as they are.
- Twins live in `content/ocean/js/core/`, tests in `tests/ocean/` (never under `content/`, which is uploaded
  to the site as it is).
- Core modules have no DOM and no Three.js and must import cleanly in Node.
- Every Luau spec case is carried over with its exact name and its exact expected numbers and tolerances.
  A tolerance is never loosened to make a port pass; a failure that looks like a tolerance problem is
  reported, not patched (see "When a carried-over case fails").
- Randomness comes only from `core/random.js` (xoshiro128** seeded by SplitMix32; spec 4.6). Nothing
  calls `Math.random`.
- Files use tabs for indentation, like the Luau source. Comments follow the Luau source's comments where
  they explain the maths (keep them, translated where they mention Luau syntax); drop comments that are
  only about Roblox engine behaviour the twin does not have.
- Commit messages: `<type>: <description>` (feat, fix, test, docs, chore). No attribution trailers.

## Review Focus

Inputs the spec implies (a web page with sliders, open for a long time, on phones) that no Luau spec
exercises; each has a test in the named task:

1. **Negative world coordinates.** The camera wanders to negative x and z; sampling there must wrap like
   Luau's floored `%`, not JavaScript's truncating `%`. Tests in Task 3 (`Cascade.sample`) and Task 7
   (`FoamField.sample`).
2. **Slider extremes.** Wind, fetch and depth near zero, or a zero scale: the maths must either return
   finite numbers or throw a clear `RangeError` from `Spectrum.validateParams`, never hand NaN to the
   renderer. Tests in Task 2 and Task 3.
3. **A tab left open for hours.** Time grows large; the looped dispersion must make `t` and
   `t + loopPeriod` give the same sea. Test in Task 3.
4. **Odd seeds.** Negative, fractional and huge seeds (WaveField derives `seed * 7919 + index`) must be
   normalised the same way everywhere. Test in Task 1.
5. **The lighter phone tier.** Smaller FFT sizes (16, 32) must work and a size that is not a power of two
   must fail with a clear message. Test in Task 3.

---

## Porting rules (every task follows these)

Read this section before any task. The per-task notes only add what is specific to a module.

### Files and names

| Luau | JavaScript |
|---|---|
| `src/shared/Ocean/Spectrum.luau` | `content/ocean/js/core/spectrum.js` (camelCase file name) |
| `tests/Spectrum.spec.luau` | `tests/ocean/core/spectrum.test.js` |
| `local Spectrum = require(script.Parent.Spectrum)` | `import * as Spectrum from './spectrum.js';` |
| `function Spectrum.peakOmega(p)` | `export function peakOmega(p)` |
| `Spectrum.NORMAL = table.freeze({...})` | `export const NORMAL = Object.freeze({...});` |
| `X.new(...)` (`new` is reserved in JS) | `export function create(...)` |
| a local helper `local function corners(...)` | a non-exported `function corners(...)` |
| `export type Foo = {...}` | a JSDoc `@typedef` above the first function that uses it |

### Values and semantics

| Luau | JavaScript |
|---|---|
| `{ number }` built by `table.create(n, 0)` | `new Float64Array(n)` (`zeros(n)` from `luau.js`) |
| `{ number }` literal lists of constants (e.g. `{ 1, 2 }`) | plain arrays `[1, 2]` |
| `buffer` read/written with `readf32`/`writef32` | `Float32Array`; byte offset `o` becomes index `o / 4` |
| `buffer` read/written with `readu8`/`writeu8` | `Uint8Array`; byte offset unchanged |
| `buffer.create(bytes)` | `new Float32Array(bytes / 4)` or `new Uint8Array(bytes)`, by element type |
| `buffer.len(b)` | `b.byteLength` |
| `buffer.copy(dst, dOff, src, sOff, count)` | `dst.set(src.subarray(sOff, sOff + count), dOff)` (u8 arrays) |
| `a % b` | `mod(a, b)` from `luau.js` (floored); use JS `%` only where both sides are provably non-negative integers and say so in a comment |
| `a // b` | `idiv(a, b)` |
| `x ^ y` | `x ** y` |
| `math.huge` | `Infinity` |
| `math.round(x)` | `round(x)` from `luau.js` (half away from zero) |
| `math.clamp(x, a, b)` | `clamp(x, a, b)` from `luau.js` |
| `math.log(x, 2)` | `Math.log2(x)` |
| `math.sign`, `math.max`, `math.floor`, `math.sqrt`, trig, `math.exp`, `math.log(x)` | `sign` from `luau.js`; the `Math.*` equivalent otherwise |
| `bit32.band/bxor/rshift/lshift` | `bit32.*` from `luau.js` (unsigned results) |
| `assert(cond, msg)` / `error(msg)` | `check(cond, msg)` from `luau.js` / `throw new Error(msg)` |
| `table.freeze(t)` on a result table | `Object.freeze(t)` (typed arrays inside stay writable, as Luau's inner tables do) |
| `table.clone(t)` | `{ ...t }` for records, `t.slice()` for arrays |
| `Random.new(seed)`, `r:NextNumber()`, `r:NextNumber(a, b)` | `Random.create(seed)`, `r.nextNumber()`, `r.nextNumber(a, b)` (`import * as Random from './random.js'`) |
| `Color3.new(r, g, b)`, `c.R`, `a:Lerp(b, t)` | `color3(r, g, b)`, `c.r`, `lerpColor3(a, b, t)` from `luau.js` (float32 channels) |
| `Vector3` positions and normals | `Float32Array` of xyz triples: vertex `v` (Luau index) at `(v - 1) * 3` |
| `Vector2` (only `RingLayout.uv`) | the `out` convention below, 2 values `[u, v]` |
| `if c then a else b` expression | `c ? a : b` |
| `for i = a, b do` | `for (let i = a; i <= b; i++)` |
| `for _, v in t do` over a `{ number }` | `for (const v of t)` |

### Indices: values stay Luau, storage starts at 0

Luau arrays start at 1; JavaScript arrays at 0. **Every number that the Luau code or its callers treat as
an index keeps its Luau value** (cascade 1, 2, 3; ring numbers in `Patch.ring`; `RingLayout.vertexIndex`'s
result; seam indices; `FieldStore` slot indices; `OceanClock.cascadeForFrame`'s result; `MapRotation.band`'s
result). Only the **container access** subtracts 1: Luau `store.display[index]` becomes
`store.display[index - 1]`, and Luau `height[row * n + column + 1]` becomes `height[row * n + column]`.
Offsets the Luau already treats as 0-based (FFT `offset`, foam `rowStart`, texel `i`/`j`, packed-bank offsets
`o = wave * STRIDE`) stay 0-based. So the expected numbers in every spec carry over unchanged; the only edits
in a translated test are the `+ 1` that a Luau test adds when it reads storage directly.

Parameters that are lists of cascade numbers (`cascades: { number }` in `FoamField.stepRows`,
`WaterColour.base`, `PeakMask.fill`, `NormalTexels.fill`, `RingSpec.cascades`, `RingSpec.normalCascades`)
stay lists of Luau cascade numbers (`[1, 2, 3]`), and the module reads `fields[c - 1]`. Tables that Luau
keys by cascade number (`RingContext.fades`, `RingContext.slopes`) become arrays read at `[c - 1]`.

### Multiple return values

A Luau function that returns several numbers takes an optional trailing `out` argument (any array-like,
usually a reusable `Float64Array`), writes the values into `out[0..count-1]` in Luau order, and returns
`out`. When `out` is omitted it allocates `new Float64Array(count)`. Hot paths in later pieces pass a reused
`out`; tests may destructure: `const [height, dispX, dispZ] = Cascade.sampleHeight(c, x, z);`. A Luau
caller that keeps only the first value (`local h = Cascade.sample(c, x, z)`) becomes
`Cascade.sample(c, x, z)[0]`. `Jacobian.minimum` and `RingLayout.snapOrigin`/`windowCentre`/`uvBase`/`uv`
follow the same rule.

### Translating a spec file

- `local cases = {}` and `cases["name"] = function() ... end` become `test("name", () => { ... });`
  (`import { test } from 'node:test';`). Keep every case name exactly.
- `expect.equal / near / truthy` become the same calls on `tests/ocean/expect.js` (Task 1), with the same
  labels. Template-string labels `` `height[{index}]` `` become `` `height[${index}]` ``.
- A spec's local helpers (`config`, `synthesised`, `finiteDifference`, ...) are translated into the test
  file as local functions, keeping their Luau index conventions per the rule above.
- Reading storage in a test: `cascade.height[5 * N + 3 + 1]` becomes `cascade.height[5 * N + 3]`;
  `buffer.readf32(packed, CELLS * 4)` becomes `packed[CELLS]`.
- A case that uses Roblox's `Random` for test data (`FFT.spec.luau`'s `randomField`) uses `Random.create`.
- **Count check:** after translating, `grep -c '^test(' tests/ocean/core/<module>.test.js` must equal
  `grep -c '^cases\[' /Users/cole/Projects/roblox-ocean/tests/<Module>.spec.luau`. The per-task table gives
  the numbers.

### When a carried-over case fails

1. Re-read the Luau line by line against the JavaScript for the failing path; the usual causes are a JS `%`
   on a negative number, a missed `- 1` or an extra one at a container access, a multiple return read as a
   single value, and a `buffer` byte offset used as an element index.
2. **Statistical cases** (averages over seeds, for example `Cascade`'s "the height variance matches the
   spectrum's resolved energy") draw different random numbers than in Roblox, because the generator is
   different (spec 4.6). If such a case misses, first check the same case with a few other seed ranges in a
   scratch script. If the port is right and one seed set is simply unlucky, stop and report it with the
   numbers; do not change the tolerance or the seeds yourself.
3. Never edit the expected number of a carried-over case.

### Running

- One file: `node --test tests/ocean/core/spectrum.test.js`
- Everything: `npm run test:ocean` (added in Task 1)

---

### Task 1: Scaffold, Luau helpers, random generator, test helpers

**Files:**
- Create: `package.json`
- Create: `content/ocean/js/core/luau.js`
- Create: `content/ocean/js/core/random.js`
- Create: `tests/ocean/expect.js`
- Test: `tests/ocean/core/luau.test.js`, `tests/ocean/core/random.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `luau.js`: `HUGE`, `mod(a, b)`, `idiv(a, b)`, `round(x)`, `clamp(x, min, max)`, `sign(x)`,
    `bit32.{band, bxor, rshift, lshift}`, `zeros(count) -> Float64Array`, `check(condition, message)`,
    `color3(r, g, b) -> {r, g, b}` (frozen, float32 channels), `lerpColor3(a, b, alpha) -> {r, g, b}`.
  - `random.js`: `create(seed) -> Generator`, `fromState(a, b, c, d) -> Generator`, where `Generator` is
    `{ nextU32() -> number, nextNumber(min?, max?) -> number, state() -> number[4] }`.
  - `tests/ocean/expect.js`: `equal(actual, expected, label)`, `near(actual, expected, tolerance, label)`,
    `truthy(condition, label)`.

- [ ] **Step 1: Add `package.json`**

```json
{
	"name": "personal-website",
	"private": true,
	"type": "module",
	"scripts": {
		"test:ocean": "node --test --experimental-test-coverage --test-coverage-include='content/ocean/js/core/**' 'tests/ocean/**/*.test.js'"
	}
}
```

The VEX branch adds its own `package.json` (with a `test` script for `tests/vex`). When the two branches
meet, the merge keeps both scripts in one file; nothing here depends on the other.

- [ ] **Step 2: Write `tests/ocean/expect.js`**

```js
// The Luau specs' expect helpers (roblox-ocean/tests/expect.luau), so carried-over cases read the same.

export function equal(actual, expected, label) {
	if (actual !== expected) {
		throw new Error(`${label}: expected ${expected}, got ${actual}`);
	}
}

// Stricter than the Luau original in one way: a NaN fails here, where Luau's `>` let it pass.
export function near(actual, expected, tolerance, label) {
	if (!(Math.abs(actual - expected) <= tolerance)) {
		throw new Error(`${label}: expected ${expected} +/- ${tolerance}, got ${actual}`);
	}
}

// Luau truthiness: only false and nil fail (0 and "" pass, unlike JavaScript).
export function truthy(condition, label) {
	if (condition === false || condition === null || condition === undefined) {
		throw new Error(label);
	}
}
```

- [ ] **Step 3: Write the failing tests `tests/ocean/core/luau.test.js`**

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { mod, idiv, round, clamp, sign, bit32, zeros, check, color3, lerpColor3 } from '../../../content/ocean/js/core/luau.js';

test("mod is floored like Luau's %", () => {
	expect.equal(mod(-1, 4), 3, '-1 % 4');
	expect.equal(mod(5.5, 4), 1.5, '5.5 % 4');
	expect.equal(mod(-0.5, 4), 3.5, '-0.5 % 4');
	expect.equal(mod(7, -4), -1, '7 % -4 takes the divisor sign');
});

test('idiv floors', () => {
	expect.equal(idiv(7, 2), 3, '7 // 2');
	expect.equal(idiv(-7, 2), -4, '-7 // 2');
});

test('round sends halves away from zero', () => {
	expect.equal(round(2.5), 3, '2.5');
	expect.equal(round(-2.5), -3, '-2.5');
	expect.equal(round(2.4), 2, '2.4');
	expect.equal(round(-2.6), -3, '-2.6');
});

test('clamp clamps and rejects max below min', () => {
	expect.equal(clamp(5, 0, 1), 1, 'above');
	expect.equal(clamp(-5, 0, 1), 0, 'below');
	expect.equal(clamp(0.5, 0, 1), 0.5, 'inside');
	let threw = false;
	try {
		clamp(0, 1, 0);
	} catch (error) {
		threw = error instanceof RangeError;
	}
	expect.truthy(threw, 'max below min throws a RangeError');
});

test('sign', () => {
	expect.equal(sign(-3), -1, 'negative');
	expect.equal(sign(0), 0, 'zero');
	expect.equal(sign(2), 1, 'positive');
});

test('bit32 results are unsigned 32-bit', () => {
	expect.equal(bit32.bxor(0xffffffff, 1), 4294967294, 'bxor');
	expect.equal(bit32.band(-1), 4294967295, 'band of one value');
	expect.equal(bit32.band(12, 10), 8, 'band');
	expect.equal(bit32.rshift(0x80000000, 31), 1, 'rshift');
	expect.equal(bit32.rshift(5, 32), 0, 'rshift by 32 is 0 in Luau');
	expect.equal(bit32.lshift(1, 31), 2147483648, 'lshift stays unsigned');
});

test('zeros is a Float64Array of zeros', () => {
	const values = zeros(4);
	expect.truthy(values instanceof Float64Array, 'Float64Array');
	expect.equal(values.length, 4, 'length');
	expect.equal(values[3], 0, 'zero');
});

test('check throws the message', () => {
	let message = '';
	try {
		check(false, 'broken');
	} catch (error) {
		message = error.message;
	}
	expect.equal(message, 'broken', 'message');
});

test('color3 channels are float32 and lerp between them', () => {
	const c = color3(0.1, 0.25, 1);
	expect.equal(c.r, Math.fround(0.1), 'float32 red');
	expect.truthy(Object.isFrozen(c), 'frozen');
	const mid = lerpColor3(color3(0.125, 0.25, 0.375), color3(0.625, 0.75, 0.875), 0.5);
	expect.equal(mid.r, 0.375, 'red');
	expect.equal(mid.g, 0.5, 'green');
	expect.equal(mid.b, 0.625, 'blue');
});
```

- [ ] **Step 4: Write the failing tests `tests/ocean/core/random.test.js`**

The expected numbers come from the reference C code (xoshiro128** 1.1 plus the SplitMix32 seeder in
`random.js`'s header comment), compiled and run on 2026-09-27. The first row is the published reference
sequence for state `1, 2, 3, 4`.

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Random from '../../../content/ocean/js/core/random.js';

function draws(generator, count) {
	const values = [];
	for (let i = 0; i < count; i++) {
		values.push(generator.nextU32());
	}
	return values.join(' ');
}

test('xoshiro128** matches the reference sequence from state 1, 2, 3, 4', () => {
	expect.equal(draws(Random.fromState(1, 2, 3, 4), 6), '11520 0 5927040 70819200 2031721883 1637235492', 'sequence');
});

test('SplitMix32 seeding matches the reference C code', () => {
	const cases = [
		[0, '2462723854 1020716019 454327756 1275600319', '3809008728 1133695204 53579671 2891528803'],
		[7, '588686121 1937383562 4286812467 2372217166', '1004282400 2200021487 1928073449 741806228'],
		[4294967295, '920564995 4230986166 697614773 1778835764', '835879718 1921286648 2356205009 1885780724'],
	];
	for (const [seed, state, next] of cases) {
		const generator = Random.create(seed);
		expect.equal(generator.state().join(' '), state, `seed ${seed} state`);
		expect.equal(draws(generator, 4), next, `seed ${seed} draws`);
	}
});

test('seeds are floored then taken modulo 2^32', () => {
	expect.equal(Random.create(-1).state().join(' '), Random.create(4294967295).state().join(' '), '-1 is 2^32 - 1');
	expect.equal(Random.create(7.9).state().join(' '), Random.create(7).state().join(' '), '7.9 floors to 7');
	expect.equal(Random.create(4294967296 + 7).state().join(' '), Random.create(7).state().join(' '), 'wraps at 2^32');
	// WaveField derives seed * 7919 + index; a large product must still seed deterministically.
	expect.equal(Random.create(123456 * 7919 + 3).nextU32(), Random.create(123456 * 7919 + 3).nextU32(), 'deterministic');
});

test('non-finite seeds throw', () => {
	for (const seed of [NaN, Infinity, -Infinity]) {
		let threw = false;
		try {
			Random.create(seed);
		} catch (error) {
			threw = error instanceof RangeError;
		}
		expect.truthy(threw, `seed ${seed}`);
	}
});

test('nextNumber is in [0, 1) and nextNumber(min, max) in [min, max)', () => {
	const generator = Random.create(42);
	let low = Infinity;
	let high = -Infinity;
	for (let i = 0; i < 10000; i++) {
		const value = generator.nextNumber();
		low = Math.min(low, value);
		high = Math.max(high, value);
	}
	expect.truthy(low >= 0 && high < 1, `unit range ${low} .. ${high}`);
	expect.truthy(low < 0.01 && high > 0.99, 'spans the range');
	const ranged = Random.fromState(1, 2, 3, 4);
	expect.equal(ranged.nextNumber(-1, 1), -1 + 2 * (11520 / 4294967296), 'maps the first draw');
});
```

- [ ] **Step 5: Run the tests and watch them fail**

Run: `node --test tests/ocean/core/luau.test.js tests/ocean/core/random.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `content/ocean/js/core/luau.js`.

- [ ] **Step 6: Write `content/ocean/js/core/luau.js`**

```js
// The Luau semantics JavaScript does not share, for the core twins. Each helper names the Luau it
// stands in for; the twins call these instead of the JavaScript operator that looks the same.

export const HUGE = Infinity; // math.huge

// a % b: Luau's modulo is floored (the result takes the divisor's sign); JavaScript's % truncates.
export function mod(a, b) {
	return a - Math.floor(a / b) * b;
}

// a // b
export function idiv(a, b) {
	return Math.floor(a / b);
}

// math.round: halves go away from zero; Math.round sends -2.5 to -2.
export function round(x) {
	return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
}

// math.clamp, which errors when max < min.
export function clamp(x, min, max) {
	if (max < min) {
		throw new RangeError(`clamp: max ${max} is below min ${min}`);
	}
	return x < min ? min : x > max ? max : x;
}

// math.sign
export function sign(x) {
	return x > 0 ? 1 : x < 0 ? -1 : 0;
}

// bit32: arguments are taken modulo 2^32 and results are unsigned.
export const bit32 = Object.freeze({
	band: (...values) => values.reduce((a, b) => a & b, -1) >>> 0,
	bxor: (...values) => values.reduce((a, b) => a ^ b, 0) >>> 0,
	rshift: (x, n) => (n >= 32 ? 0 : x >>> n),
	lshift: (x, n) => (n >= 32 ? 0 : (x << n) >>> 0),
});

// table.create(count, 0)
export function zeros(count) {
	return new Float64Array(count);
}

// assert(condition, message)
export function check(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

// Color3: Roblox stores the channels as 32-bit floats. Roblox does not document Lerp's rounding;
// this rounds once per channel, and the specs only use eighths, which are exact either way.
const f32 = Math.fround;

export function color3(r, g, b) {
	return Object.freeze({ r: f32(r), g: f32(g), b: f32(b) });
}

export function lerpColor3(a, c, alpha) {
	const t = f32(alpha);
	return color3(a.r + (c.r - a.r) * t, a.g + (c.g - a.g) * t, a.b + (c.b - a.b) * t);
}
```

- [ ] **Step 7: Write `content/ocean/js/core/random.js`**

```js
// Stands in for Roblox's Random, which exists only inside Roblox and whose algorithm Roblox does not
// publish. xoshiro128** 1.1 (Blackman and Vigna, public-domain reference code), its four words
// seeded from a SplitMix32 sequence (a golden-ratio Weyl step through the MurmurHash3 fmix32
// finaliser). Chosen because every step is a 32-bit xor, shift or rotate, or a multiply by 5 or 9,
// all exact in Luau's doubles and bit32, so the Luau shim in the proof panel draws the same numbers.
import { mod } from './luau.js';

const GOLDEN = 0x9e3779b9;
const TWO_32 = 4294967296;

function rotl(x, k) {
	return ((x << k) | (x >>> (32 - k))) >>> 0;
}

function fmix32(value) {
	let z = value;
	z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
	z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
	return (z ^ (z >>> 16)) >>> 0;
}

// Random.new(seed): any finite number; it is floored, then taken modulo 2^32.
export function create(seed) {
	if (!Number.isFinite(seed)) {
		throw new RangeError(`seed must be a finite number, got ${seed}`);
	}
	let weyl = mod(Math.floor(seed), TWO_32);
	const words = [];
	for (let i = 0; i < 4; i++) {
		weyl = (weyl + GOLDEN) >>> 0;
		words.push(fmix32(weyl));
	}
	return fromState(words[0], words[1], words[2], words[3]);
}

// A generator from four raw state words, for the reference vectors.
export function fromState(a, b, c, d) {
	const s = Uint32Array.of(a, b, c, d);
	function nextU32() {
		const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
		const t = s[1] << 9;
		s[2] ^= s[0];
		s[3] ^= s[1];
		s[1] ^= s[2];
		s[0] ^= s[3];
		s[2] ^= t;
		s[3] = rotl(s[3], 11);
		return result;
	}
	// random:NextNumber() is [0, 1); random:NextNumber(min, max) is [min, max).
	function nextNumber(min, max) {
		const unit = nextU32() / TWO_32;
		return min === undefined ? unit : min + (max - min) * unit;
	}
	function state() {
		return [s[0], s[1], s[2], s[3]];
	}
	return Object.freeze({ nextU32, nextNumber, state });
}
```

- [ ] **Step 8: Run the tests and watch them pass**

Run: `node --test tests/ocean/core/luau.test.js tests/ocean/core/random.test.js`
Expected: PASS, 14 tests.

- [ ] **Step 9: Commit**

```bash
git add package.json content/ocean/js/core/luau.js content/ocean/js/core/random.js tests/ocean/expect.js tests/ocean/core/luau.test.js tests/ocean/core/random.test.js
git commit -m "feat: ocean core scaffold, Luau helpers and the shared random generator"
```

---

### Task 2: The scalar maths: Spectrum, Jacobian, WaveSampler, Jonswap

**Files:**
- Create: `content/ocean/js/core/spectrum.js`, `jacobian.js`, `waveSampler.js`, `jonswap.js`
- Test: `tests/ocean/core/spectrum.test.js` (13 cases + 1 new), `jacobian.test.js` (4),
  `waveSampler.test.js` (8), `jonswap.test.js` (11)

**Interfaces:**
- Consumes: `luau.js`, `random.js` (Task 1).
- Produces:
  - `spectrum.js`: `NORMAL` (frozen, same fields and values as `Spectrum.NORMAL`), `peakOmega(p)`,
    `alpha(p)`, `jonswap(omega, p)`, `depthFactor(omega, p)`, `omega(k, p)`, `omegaDerivative(k, p)`,
    `beta(omega, p)`, `spread(omega, theta, p)`, `spreadNormaliser(omega, p)`, `directional(omega, theta, p)`,
    `variance(kx, kz, p)`, all `-> number`; plus the new `validateParams(p) -> p` (throws `RangeError`).
  - `jacobian.js`: `determinant(jxx, jzz, jxz, lambda) -> number`,
    `minimum(jxx, jzz, jxz, lambda, out?) -> out[3]` (Luau order).
  - `waveSampler.js`: `STRIDE`, `sample(packed, count, t, x, z, chop, weights, weightOffset, out?) -> out[7]`
    (`packed` and `weights` are `Float64Array`s; `weights[weightOffset + wave]` for wave `0 .. count - 1`).
  - `jonswap.js`: `GRAVITY`, `STRIDE`, `spectrum(f, peakFrequency, gamma, alpha) -> number`,
    `generateWaves(config, seed) -> { packed: Float64Array, count, peakHeight, rmsHeight }` (frozen object).

- [ ] **Step 1: Translate the four spec files into failing tests**

Translate, following "Translating a spec file": `Spectrum.spec.luau` (13 cases), `Jacobian.spec.luau` (4),
`WaveSampler.spec.luau` (8), `Jonswap.spec.luau` (11). The first Spectrum case shows the shape:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';

// The spec's P: the physical defaults with no swell narrowing (carry the whole literal from the Luau).
const P = Object.freeze({
	windSpeed: 12,
	fetch: 80000,
	depth: 60,
	gamma: 3.3,
	swell: 0,
	windDirection: 0,
	gravity: 9.81,
	// ...the remaining fields exactly as in Spectrum.spec.luau
});

test('peak frequency and alpha follow the fetch laws', () => {
	expect.near(Spectrum.peakOmega(P), 1.021985987944935, 1e-9, 'peakOmega');
	expect.near(Spectrum.alpha(P), 0.011450023071790175, 1e-12, 'alpha');
});
```

Jonswap's "is deterministic per seed and frozen" case checks `table.isfrozen`; translate it to
`Object.isFrozen` on the returned bank, and its `packed[4]` reads become `packed[3]` (storage access).

- [ ] **Step 2: Add the slider-extremes test (Review Focus 2) to `spectrum.test.js`**

```js
test('validateParams rejects zero or negative wind, fetch and depth, and extreme but valid seas stay finite', () => {
	for (const [name, value] of [['windSpeed', 0], ['windSpeed', -3], ['fetch', 0], ['depth', 0], ['depth', -1]]) {
		let threw = false;
		try {
			Spectrum.validateParams({ ...Spectrum.NORMAL, [name]: value });
		} catch (error) {
			threw = error instanceof RangeError && error.message.includes(name);
		}
		expect.truthy(threw, `${name} = ${value} throws a RangeError naming it`);
	}
	expect.equal(Spectrum.validateParams(Spectrum.NORMAL), Spectrum.NORMAL, 'returns the params it accepted');
	for (const windSpeed of [0.5, 2, 12, 40]) {
		for (const fetch of [1000, 80000, 1000000]) {
			const p = { ...Spectrum.NORMAL, windSpeed, fetch, isotropy: 0.4, scale: 8 };
			for (const k of [0.01, 0.1, 1, 10]) {
				for (const theta of [0, 1, Math.PI]) {
					const v = Spectrum.variance(k * Math.cos(theta), k * Math.sin(theta), p);
					expect.truthy(Number.isFinite(v) && v >= 0, `variance finite at wind ${windSpeed}, fetch ${fetch}, k ${k}: ${v}`);
				}
			}
		}
	}
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `node --test tests/ocean/core/spectrum.test.js tests/ocean/core/jacobian.test.js tests/ocean/core/waveSampler.test.js tests/ocean/core/jonswap.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for each module.

- [ ] **Step 4: Port the four modules**

Port `Spectrum.luau`, `Jacobian.luau`, `WaveSampler.luau` and `Jonswap.luau` line by line under the
porting rules. Module notes:
- `Spectrum.variance` wraps theta with `(theta + math.pi) % (2 * math.pi) - math.pi`: use `mod`, the angle
  is negative half the time.
- `Spectrum.validateParams` is new (spec 4.2). Add it after `NORMAL`:

```js
// Not in the Luau: the web page's sliders can reach values Studio never saw, and a zero here turns
// the fetch laws into divisions by zero. Returns p so callers can write validateParams(p) inline.
export function validateParams(p) {
	for (const name of ['windSpeed', 'fetch', 'depth', 'gravity']) {
		if (!(p[name] > 0)) {
			throw new RangeError(`Spectrum params: ${name} must be above 0, got ${p[name]}`);
		}
	}
	return p;
}
```

- `WaveSampler.sample` reads `packed[o + 1] .. packed[o + 6]` with `o = wave * STRIDE`: in JS `packed[o]
  .. packed[o + 5]`, and `weights[weightOffset + wave + 1]` becomes `weights[weightOffset + wave]`.
- `Jonswap.generateWaves` builds `packed` with `table.insert`: preallocate
  `new Float64Array(config.count * STRIDE)` and write by offset. Its `Random.new(seed)` becomes
  `Random.create(seed)`, drawn in the same order.

- [ ] **Step 5: Run the tests and watch them pass; check the counts**

Run: `node --test tests/ocean/core/spectrum.test.js tests/ocean/core/jacobian.test.js tests/ocean/core/waveSampler.test.js tests/ocean/core/jonswap.test.js`
Expected: PASS, 37 tests (13 + 1, 4, 8, 11).
Run: `for m in spectrum:Spectrum jacobian:Jacobian waveSampler:WaveSampler jonswap:Jonswap; do js=${m%%:*}; lu=${m##*:}; echo "$js $(grep -c '^test(' tests/ocean/core/$js.test.js) / $(grep -c '^cases\[' /Users/cole/Projects/roblox-ocean/tests/$lu.spec.luau)"; done`
Expected: spectrum 14 / 13 (one new), the others equal.

- [ ] **Step 6: Commit**

```bash
git add content/ocean/js/core/spectrum.js content/ocean/js/core/jacobian.js content/ocean/js/core/waveSampler.js content/ocean/js/core/jonswap.js tests/ocean/core/spectrum.test.js tests/ocean/core/jacobian.test.js tests/ocean/core/waveSampler.test.js tests/ocean/core/jonswap.test.js
git commit -m "feat: port Spectrum, Jacobian, WaveSampler and Jonswap to the ocean core"
```

---

### Task 3: FFT and Cascade

**Files:**
- Create: `content/ocean/js/core/fft.js`, `content/ocean/js/core/cascade.js`
- Test: `tests/ocean/core/fft.test.js` (4 cases + 1 new), `tests/ocean/core/cascade.test.js` (16 + 3 new)

**Interfaces:**
- Consumes: `luau.js`, `random.js` (Task 1); `spectrum.js` (Task 2).
- Produces:
  - `fft.js`: `plan(n) -> { n, reversed: Int32Array, cosines: Float64Array, sines: Float64Array }` (frozen;
    `reversed[i]` is the 0-based bit-reversed index of 0-based `i`; `cosines[j] = cos(2 pi j / n)` for
    `j = 0 .. n/2 - 1`), `inverse1D(plan, re, im, offset, stride)` (elements at `offset + i * stride`,
    0-based), `inverse2D(plan, re, im)`.
  - `cascade.js`: `create(config) -> Cascade`, `evolve(c, t)`, `synthesise(c, plan)`,
    `heightSpectrum(c, re, im)`, `sample(c, x, z, out?) -> out[8]`, `sampleHeight(c, x, z, out?) -> out[3]`,
    `sampleNoJacobian(c, x, z, out?) -> out[5]`, `sampleJacobian(c, x, z, out?) -> out[3]`. A `Cascade` has
    the Luau fields with `Float64Array`s for every per-cell array and `spectrumRe`/`spectrumIm` as arrays of
    4 `Float64Array`s. The samplers accept any object with the `Fields` shape
    (`{ n, size, height, dispX, dispZ, slopeX, slopeZ, jxx, jzz, jxz }`).

- [ ] **Step 1: Translate `FFT.spec.luau` (4) and `Cascade.spec.luau` (16) into failing tests**

`FFT.spec.luau`'s `randomField` uses `Random.new(seed)` and `random:NextNumber(-1, 1)`: translate to
`Random.create(seed)` and `random.nextNumber(-1, 1)`, and its arrays to `Float64Array`s with the `+ 1`
removed from storage indices. A Cascade case shows the storage-index edit and the `out` convention:

```js
test('bilinear sampling reproduces the grid and wraps', () => {
	const cascade = synthesised(9, 2);
	const spacing = SIZE / N;
	const height = Cascade.sample(cascade, 3 * spacing, 5 * spacing)[0];
	expect.near(height, cascade.height[5 * N + 3], 1e-9, 'grid point');
	const wrapped = Cascade.sample(cascade, 3 * spacing + SIZE, 5 * spacing - SIZE)[0];
	expect.near(wrapped, height, 1e-9, 'wraps');
	const mid = Cascade.sample(cascade, 3.5 * spacing, 5 * spacing)[0];
	expect.near(mid, (cascade.height[5 * N + 3] + cascade.height[5 * N + 4]) / 2, 1e-9, 'midpoint');
});
```

The spec's `finiteDifference(field, alongX, index)` helper takes a Luau cell index (1-based) and computes
`row, column = (index - 1) // N, (index - 1) % N`: keep that, using `idiv` and `mod`, and read
`field[after - 1]` / `field[before - 1]`, since the helper builds 1-based `after` and `before`.

- [ ] **Step 2: Add the Review Focus tests to `fft.test.js` and `cascade.test.js`**

In `fft.test.js` (Review Focus 5):

```js
test('plan accepts the phone sizes and rejects a size that is not a power of two', () => {
	for (const n of [16, 32, 64]) {
		expect.equal(FFT.plan(n).n, n, `plan(${n})`);
	}
	for (const n of [0, 1, 12, 48, 64.5]) {
		let threw = false;
		try {
			FFT.plan(n);
		} catch (error) {
			threw = /power of two/.test(error.message);
		}
		expect.truthy(threw, `plan(${n}) throws naming the power-of-two rule`);
	}
});
```

(If the Luau `FFT.plan` message does not contain "power of two", keep the Luau message and change this
regex to match it; report the wording in the task report.)

In `cascade.test.js`, using the file's own `N`, `SIZE`, `LOOP` and `config` helper:

```js
test('sampling at negative world coordinates wraps like the positive side (Review Focus 1)', () => {
	const cascade = synthesised(4, 3);
	for (const [x, z] of [[-1.25, 7.5], [-SIZE - 3.3, -0.1], [-0.0001, -SIZE * 5 + 2]]) {
		const a = Cascade.sample(cascade, x, z);
		const b = Cascade.sample(cascade, x + 7 * SIZE, z + 11 * SIZE);
		for (let i = 0; i < 8; i++) {
			expect.near(a[i], b[i], 1e-9, `field ${i} at (${x}, ${z})`);
		}
	}
});

test('a zero scale gives a flat, finite sea (Review Focus 2)', () => {
	const flat = { ...config(3), params: { ...Spectrum.NORMAL, scale: 0 } };
	const cascade = Cascade.create(flat);
	Cascade.evolve(cascade, 5);
	Cascade.synthesise(cascade, FFT.plan(N));
	for (const name of ['height', 'dispX', 'dispZ', 'slopeX', 'slopeZ', 'jxx', 'jzz', 'jxz']) {
		for (const value of cascade[name]) {
			expect.equal(value, 0, `${name} is flat`);
		}
	}
});

test('an hour later the looped sea repeats (Review Focus 3)', () => {
	const t = 3600 * 5 + 17.25; // five hours in
	const a = synthesised(6, t);
	const b = synthesised(6, t + LOOP);
	for (let index = 0; index < N * N; index++) {
		expect.near(a.height[index], b.height[index], 1e-6, `height[${index}]`);
	}
});
```

If the zero-scale case yields `-0` values, `expect.equal(-0, 0)` passes (`-0 === 0`); if it yields NaN, the
port has a division by the variance: find it rather than editing the test.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `node --test tests/ocean/core/fft.test.js tests/ocean/core/cascade.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Port `FFT.luau` and `Cascade.luau`**

Module notes:
- `FFT.plan` computes bits with `math.round(math.log(n, 2))`: use `round(Math.log2(n))`. Its
  `isPowerOfTwo` uses `n % 1 == 0` and `bit32.band(n, n - 1)`: keep the logic with `mod` and `bit32.band`.
- `FFT.inverse1D`: Luau `base = offset + 1` exists only to index a 1-based table; in JS `base = offset`.
  `reversed[index + 1]` becomes `reversed[index]`; `cosines[twiddle]` with `twiddle` starting at 1 becomes
  `cosines[twiddle - 1]` (or start `twiddle` at 0: either, but say which in a comment).
- `Cascade.create` validates `config.params` with `Spectrum.validateParams` before anything else (the one
  addition to the Luau), draws the gaussians with `gaussianPair(random)` for every cell in the same row-major
  order (the comment explains why), and builds the mirror index
  `((n - row) % n) * n + ((n - column) % n)`: here both operands are non-negative, so JS `%` is safe; say so
  in a comment.
- `Cascade.sample`/`sampleHeight` compute `u = (x / size * n) % n`: `mod`, never `%` (Review Focus 1).
- `sampleNoJacobian` returns the first five of `sample`'s eight; `sampleHeight` the first three;
  `sampleJacobian` the last three (`jxx, jzz, jxz`). Each takes its own `out` and allocates only when it is
  omitted.

- [ ] **Step 5: Run the tests and watch them pass; check the counts**

Run: `node --test tests/ocean/core/fft.test.js tests/ocean/core/cascade.test.js`
Expected: PASS, 24 tests (4 + 1, 16 + 3).
Run: `echo "fft $(grep -c '^test(' tests/ocean/core/fft.test.js)/5 cascade $(grep -c '^test(' tests/ocean/core/cascade.test.js)/19"`
Expected: `fft 5/5 cascade 19/19`.

- [ ] **Step 6: Commit**

```bash
git add content/ocean/js/core/fft.js content/ocean/js/core/cascade.js tests/ocean/core/fft.test.js tests/ocean/core/cascade.test.js
git commit -m "feat: port FFT and Cascade to the ocean core"
```

---

### Task 4: Swells and WaveField

**Files:**
- Create: `content/ocean/js/core/swells.js`, `content/ocean/js/core/waveField.js`
- Test: `tests/ocean/core/swells.test.js` (6), `tests/ocean/core/waveField.test.js` (8)

**Interfaces:**
- Consumes: `spectrum.js`, `waveSampler.js`, `jacobian.js` (Task 2); `fft.js`, `cascade.js` (Task 3).
- Produces:
  - `swells.js`: `create(list, params, loopPeriod) -> Bank` where `Bank` is
    `{ packed: Float64Array, count, weights: Float64Array, silent }` (frozen), `isSilent(bank) -> boolean`,
    `sample(bank, t, x, z, chop, out?) -> out[7]`, `heightAt(bank, t, x, z) -> number`.
  - `waveField.js`: `bands(sizes, n) -> [{ kMin, kMax }]` (the last `kMax` is `Infinity`),
    `create(config) -> Field` (`{ config, plan, cascades, swells }`, `cascades` a JS array, cascade `i` at
    `cascades[i - 1]`), `update(field, index, t)` (`index` is the Luau cascade number),
    `sample(field, x, z, t, out?) -> out[6]`, `heightAt(field, x, z, t) -> number`.

- [ ] **Step 1: Translate `Swells.spec.luau` (6) and `WaveField.spec.luau` (8) into failing tests**

The first WaveField case shows `math.huge` and a list read:

```js
const N = 32;
const SIZES = [256, 128, 64];

test('bands hand over at 12 pi over the next size and cap at Nyquist', () => {
	const bands = WaveField.bands(SIZES, N);
	expect.equal(bands.length, 3, 'three bands');
	expect.equal(bands[0].kMin, 0, 'first starts at 0');
	expect.near(bands[0].kMax, (12 * Math.PI) / 128, 1e-12, 'first hands over');
	expect.near(bands[1].kMin, (12 * Math.PI) / 128, 1e-12, 'second starts there');
	expect.near(bands[1].kMax, (12 * Math.PI) / 64, 1e-12, 'second hands over');
	expect.near(bands[2].kMin, (12 * Math.PI) / 64, 1e-12, 'third starts there');
	expect.equal(bands[2].kMax, Infinity, 'third is open above (Cascade caps at Nyquist)');
});
```

(`bands` is a list of records, not an index value, so `bands[1]` in Luau is `bands[0]` in JS; a call like
`WaveField.update(field, 2, t)` keeps the `2`.)

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/ocean/core/swells.test.js tests/ocean/core/waveField.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Port `Swells.luau` and `WaveField.luau`**

Module notes:
- `Swells.create` preallocates `packed` (`count * WaveSampler.STRIDE`) and `weights` (all 1) as
  `Float64Array`s instead of `table.insert`.
- `WaveField.create` builds cascades with `seed = config.seed * 7919 + index` where `index` is the Luau
  cascade number (1-based): keep it 1-based so a given seed produces the same cascades as the proof panel's
  Luau will.
- `WaveField.update(field, index, t)` reads `field.cascades[index - 1]`.
- `WaveField.sample` sums the cascades' samples and the swells: reuse module-level scratch `Float64Array`s
  for the per-cascade `out` so a call allocates only its own result when `out` is omitted.

- [ ] **Step 4: Run the tests and watch them pass; check the counts**

Run: `node --test tests/ocean/core/swells.test.js tests/ocean/core/waveField.test.js`
Expected: PASS, 14 tests.
Run: `echo "swells $(grep -c '^test(' tests/ocean/core/swells.test.js)/6 waveField $(grep -c '^test(' tests/ocean/core/waveField.test.js)/8"`
Expected: `swells 6/6 waveField 8/8`.

- [ ] **Step 5: Commit**

```bash
git add content/ocean/js/core/swells.js content/ocean/js/core/waveField.js tests/ocean/core/swells.test.js tests/ocean/core/waveField.test.js
git commit -m "feat: port Swells and WaveField to the ocean core"
```

---

### Task 5: FieldStore, OceanClock, MapRotation

**Files:**
- Create: `content/ocean/js/core/fieldStore.js`, `oceanClock.js`, `mapRotation.js`
- Test: `tests/ocean/core/fieldStore.test.js` (14), `oceanClock.test.js` (4), `mapRotation.test.js` (3)

**Interfaces:**
- Consumes: `luau.js` (Task 1); `cascade.js` and `fft.js` (Task 3, used by the FieldStore spec).
- Produces:
  - `fieldStore.js`: `FIELD_NAMES`, `SURFACE_FIELDS`, `FLAT_FIELDS` (frozen string arrays, Luau order),
    `bufferSize(cells) -> bytes` (unchanged meaning: `8 * cells * 4`), `newFields(n, size) -> Fields`,
    `create(n, sizes) -> Store`, `pack(fields, out: Float32Array)`, `unpack(input: Float32Array, fields)`,
    `receive(store, index, input: Float32Array, t)`, `promote(store, index, frame) -> boolean`,
    `hasFields(store, index) -> boolean`, `blend(store, index, fraction, names?)`. `index` is the Luau cascade
    number; `store.previous/current/waiting/display/promotedFrame` are JS arrays read at `[index - 1]`. A
    packed buffer is a `Float32Array` of length `bufferSize(cells) / 4`, field-major in `FIELD_NAMES` order.
  - `oceanClock.js`: `PERIOD`, `time(serverTime, loopPeriod)`,
    `cascadeForFrame(frame, cascadeCount) -> number | null` (Luau cascade number; `null` where Luau returns
    nil), `fadeFraction(frame, promotedFrame, period)`.
  - `mapRotation.js`: `COLOUR = 1`, `MASK = 2`, `NORMAL = 3`, `MAPS` (frozen `[2, 3]`),
    `mapsSlot(frame) -> number` (a map constant), `BANDS = 4`, `band(frame, bands) -> number` (Luau band
    number, 1-based).

- [ ] **Step 1: Translate the three spec files into failing tests**

The first FieldStore case shows the buffer translation:

```js
test('a packed buffer holds eight fields of 32-bit floats, field-major', () => {
	expect.equal(FieldStore.bufferSize(CELLS), 8 * CELLS * 4, 'size');
	const fields = FieldStore.newFields(N, 128);
	FieldStore.FIELD_NAMES.forEach((name, i) => {
		const which = i + 1; // the Luau loop's 1-based field number
		for (let index = 1; index <= CELLS; index++) {
			fields[name][index - 1] = which * 1000 + index;
		}
	});
	const packed = new Float32Array(FieldStore.bufferSize(CELLS) / 4);
	FieldStore.pack(fields, packed);
	expect.near(packed[0], 1001, 0, 'first height');
	expect.near(packed[CELLS], 2001, 0, 'first dispX follows the heights');
	expect.near(packed[7 * CELLS + CELLS - 1], 8000 + CELLS, 0, 'last jxz');
});
```

`OceanClock` cases that `expect.equal(..., nil)` become `expect.equal(..., null)`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/ocean/core/fieldStore.test.js tests/ocean/core/oceanClock.test.js tests/ocean/core/mapRotation.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Port the three modules**

Module notes:
- `FieldStore.pack/unpack` loop over `FIELD_NAMES` writing `out[(which - 1) * cells + (index - 1)]`; the
  float32 rounding happens in the `Float32Array` store exactly as `buffer.writef32` does.
- `FieldStore.receive` checks the input size the way the Luau does (`buffer.len` becomes `byteLength`).
- `FieldStore.blend(store, index, fraction, names)` defaults `names` to `FIELD_NAMES` like the Luau.
- `OceanClock.time` is `serverTime % loopPeriod`: `mod` (a clock can be negative in tests).
- `OceanClock.cascadeForFrame` returns the Luau value or `null`.
- `MapRotation.mapsSlot(frame)` returns `MAPS[((frame - 1) % 2) + 1]` in Luau, which is
  `MAPS[mod(frame - 1, 2)]` in JS; `band(frame, bands)` returns `mod(frame - 1, bands) + 1`.

- [ ] **Step 4: Run the tests and watch them pass; check the counts**

Run: `node --test tests/ocean/core/fieldStore.test.js tests/ocean/core/oceanClock.test.js tests/ocean/core/mapRotation.test.js`
Expected: PASS, 21 tests.
Run: `echo "$(grep -c '^test(' tests/ocean/core/fieldStore.test.js)/14 $(grep -c '^test(' tests/ocean/core/oceanClock.test.js)/4 $(grep -c '^test(' tests/ocean/core/mapRotation.test.js)/3"`
Expected: `14/14 4/4 3/3`.

- [ ] **Step 5: Commit**

```bash
git add content/ocean/js/core/fieldStore.js content/ocean/js/core/oceanClock.js content/ocean/js/core/mapRotation.js tests/ocean/core/fieldStore.test.js tests/ocean/core/oceanClock.test.js tests/ocean/core/mapRotation.test.js
git commit -m "feat: port FieldStore, OceanClock and MapRotation to the ocean core"
```

---

### Task 6: RingLayout, Tier, SurfaceSampler

**Files:**
- Create: `content/ocean/js/core/ringLayout.js`, `tier.js`, `surfaceSampler.js`
- Test: `tests/ocean/core/ringLayout.test.js` (11), `tier.test.js` (6), `surfaceSampler.test.js` (17)

**Interfaces:**
- Consumes: `luau.js` (Task 1); `spectrum.js` (Task 2); `cascade.js`, `fft.js` (Task 3); `swells.js`,
  `waveField.js` (Task 4); `fieldStore.js` (Task 5).
- Produces:
  - `ringLayout.js`: `vertexIndex(cells, column, row) -> number` (Luau 1-based vertex index),
    `build(spec) -> Layout` (`{ spec, patches, vertexCount }`; each `Patch` is
    `{ ring, spacing, cells, centreX, centreZ, localX: Float64Array, localZ: Float64Array, seams }` with
    `ring` the Luau ring number and `seams` a frozen array of `{ index, a, b }` holding Luau vertex indices),
    `writesRing(ring, ringCount, frame) -> boolean` (`ring` 1-based, as in Luau),
    `snapOrigin(x, z, step, out?) -> out[2]`, `windowCentre(focusX, focusZ, spacing, out?) -> out[2]`,
    `uvBase(originX, originZ, tile, out?) -> out[2]`, `uv(worldX, worldZ, baseX, baseZ, tile, out?) -> out[2]`.
    `RingSpec.cascades` and `normalCascades` hold Luau cascade numbers.
  - `tier.js`: `ORDER` (frozen `['High', 'Medium', 'Low']`), `presets` (frozen `{ High, Medium, Low }`, each
    `{ patchCells, textureTile, n, sizes, rings }` with the Luau values), `choose(probeMs) -> string`.
  - `surfaceSampler.js`: `ringContext(ringSpec, nextRingSpec?) -> { fades: boolean[], slopes: boolean[],
    last, fadeWidth, fadeEdge }` (`fades[c - 1]` for Luau cascade `c`),
    `fill(patch, ringSpec, nextRingSpec, halfExtent, store, swells, t, chop, centreX, centreZ, focusX, focusZ,
    innerCentreX, innerCentreZ, innerHalf, skirtY, positions, normals, flat?, context?) -> boolean`, where
    `positions` and `normals` are `Float32Array(patchVertexCount * 3)` and vertex `v` (Luau index from
    `vertexIndex`) is written at `(v - 1) * 3`. `nextRingSpec` is `null` on the last ring.

- [ ] **Step 1: Translate the three spec files into failing tests**

The first RingLayout case shows a table keyed by ring number (a Luau index value, kept 1-based in a `Map`
or an object):

```js
test('the high layout has 224 patches of 81 vertices', () => {
	const layout = RingLayout.build(HIGH);
	expect.equal(layout.patches.length, 224, 'patches');
	expect.equal(layout.vertexCount, 224 * 81, 'vertices');
	const perRing = {};
	for (const patch of layout.patches) {
		perRing[patch.ring] = (perRing[patch.ring] ?? 0) + 1;
	}
	let total = 0;
	HIGH.rings.forEach((ringSpec, i) => {
		const index = i + 1;
		const perSide = (2 * ringSpec.halfExtent) / (HIGH.patchCells * ringSpec.spacing);
		expect.equal(perRing[index], perSide * perSide, `ring ${index} is a full ${perSide} x ${perSide}`);
		total += perSide * perSide;
	});
	expect.equal(total, 224, '16 + 16 + 64 + 64 + 64');
});
```

`SurfaceSampler.spec.luau` builds `positions`/`normals` as `{ Vector3 }` and reads `positions[v].X`: in JS
they are `Float32Array`s and the read is `positions[(v - 1) * 3]` (`.Y` is `+ 1`, `.Z` is `+ 2`). Tolerances
written for doubles still apply; if a case compares a position against a double to `1e-9`, the float32
store will miss it. In that case keep the tolerance, and note it in the task report as a float32 finding for
the reviewer, with the measured difference. (Roblox's `Vector3` is also float32, so the Luau spec likely
already allows for it.)

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/ocean/core/ringLayout.test.js tests/ocean/core/tier.test.js tests/ocean/core/surfaceSampler.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Port the three modules**

Module notes:
- `RingLayout.vertexIndex` keeps returning the Luau 1-based index; `build` asserts
  `cells % 2 == 0` and `half % patchSize == 0` with the Luau messages (`mod`).
- `RingLayout.uv` returns a `Vector2` in Luau: the `out[2]` convention.
- `Tier.presets` is data: copy every number exactly; keep the cascade lists 1-based.
- `SurfaceSampler.fill` writes `positions[index] = Vector3.new(a, b, c)`: write the three floats at
  `(index - 1) * 3`. `Vector3.new(...).Unit` normalises: compute the length and divide, in doubles, before the
  store. `Vector3.yAxis` is `0, 1, 0`. Reuse module-level scratch `out` arrays for its `Cascade.sample*` and
  `Swells.sample` calls: `fill` runs once per patch per frame in A2 and must not allocate per vertex.

- [ ] **Step 4: Run the tests and watch them pass; check the counts**

Run: `node --test tests/ocean/core/ringLayout.test.js tests/ocean/core/tier.test.js tests/ocean/core/surfaceSampler.test.js`
Expected: PASS, 34 tests.
Run: `echo "$(grep -c '^test(' tests/ocean/core/ringLayout.test.js)/11 $(grep -c '^test(' tests/ocean/core/tier.test.js)/6 $(grep -c '^test(' tests/ocean/core/surfaceSampler.test.js)/17"`
Expected: `11/11 6/6 17/17`.

- [ ] **Step 5: Commit**

```bash
git add content/ocean/js/core/ringLayout.js content/ocean/js/core/tier.js content/ocean/js/core/surfaceSampler.js tests/ocean/core/ringLayout.test.js tests/ocean/core/tier.test.js tests/ocean/core/surfaceSampler.test.js
git commit -m "feat: port RingLayout, Tier and SurfaceSampler to the ocean core"
```

---

### Task 7: Foam: FoamField, FoamPaint, FoamRoughness

**Files:**
- Create: `content/ocean/js/core/foamField.js`, `foamPaint.js`, `foamRoughness.js`
- Test: `tests/ocean/core/foamField.test.js` (5 + 1 new), `foamPaint.test.js` (11), `foamRoughness.test.js` (1)

**Interfaces:**
- Consumes: `luau.js` (Task 1); `jacobian.js` (Task 2); `cascade.js` (Task 3).
- Produces:
  - `foamField.js`: `create(texels) -> Field`, `newGrid(texels, size) -> Field`, `at(field, i, j) -> number`
    (0-based texel coordinates, as in Luau), `stepRows(field, rowStart, rowCount, fields, cascades, tile,
    chop, params) -> number` (`rowStart` 0-based; `fields` a JS array read at `[c - 1]` for each Luau cascade
    number `c` in `cascades`), `sample(field, x, z) -> number`. A `Field` is
    `{ texels, size, foam: Float32Array(texels * texels), scratch: Float32Array }`; texel `(i, j)` is
    `foam[j * texels + i]`.
  - `foamPaint.js`: `lace(texels, cells, seed, octaves, falloff) -> Float32Array(texels * texels)`,
    `band(out: Uint8Array, colourTexels, rowStart, rowCount, base: Uint8Array, baseTexels, fields, tile,
    params, lace?: Float32Array, coverageOut?: Float32Array)`. `out` holds `rowCount` rows of RGBA bytes;
    `base` is the RGBA colour map. `params` is `{ threshold, feather, laceSoft, opacity, r, g, b }`.
  - `foamRoughness.js`: `fill(out: Uint8Array, texels, coverage: Float32Array, base, foamRoughness)`.

- [ ] **Step 1: Translate the three spec files into failing tests**

The first FoamField case shows a cascade list and texel reads:

```js
test('stepRows folds where the summed Jacobian is under the whitecap', () => {
	const field = stepField();
	const a = fields(-0.4, 0, 0);
	const b = fields(-0.4, 0, 0);
	const params = { whitecap: 0.5, grow: 1, decay: 0 };
	const cover = FoamField.stepRows(field, 0, FIELD_TEXELS, [a, b], [1, 2], TILE, 1, params);
	expect.near(cover, 0.3, 1e-9, 'the mean of the rows it stepped');
	for (let j = 0; j < FIELD_TEXELS; j++) {
		for (let i = 0; i < FIELD_TEXELS; i++) {
			expect.near(FoamField.at(field, i, j), 0.3, 1e-6, `texel (${i}, ${j})`);
		}
	}
	const single = stepField();
	const alone = FoamField.stepRows(single, 0, FIELD_TEXELS, [a], [1], TILE, 1, params);
	expect.equal(alone, 0, "one cascade's own fold is over the cap");
	expect.equal(FoamField.at(single, 3, 5), 0, 'so its texels stay dry');
});
```

The spec's `fields(jxx, jzz, jxz)` helper builds a `Fields` table of `{ number }` arrays: build
`Float64Array`s.

- [ ] **Step 2: Add the negative-coordinate test to `foamField.test.js` (Review Focus 1)**

```js
test('sample at negative world coordinates wraps like the positive side', () => {
	const field = FoamField.newGrid(8, 16);
	for (let index = 0; index < 64; index++) {
		field.foam[index] = (index % 7) / 7;
	}
	for (const [x, z] of [[-1.5, 3.25], [-16.1, -0.2], [-0.001, -47.9]]) {
		expect.near(FoamField.sample(field, x, z), FoamField.sample(field, x + 32, z + 48), 1e-6, `(${x}, ${z})`);
	}
});
```

If the Luau `newGrid`'s `size` is not the tile studs this test assumes, read `FoamField.luau`'s `sample` and
use the period it wraps at; keep the three negative points.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `node --test tests/ocean/core/foamField.test.js tests/ocean/core/foamPaint.test.js tests/ocean/core/foamRoughness.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Port the three modules**

Module notes:
- `BYTES = 4` means one float32 in the foam and lace buffers (index = texel) and four RGBA bytes in the
  colour buffers (index = texel * 4 + channel). Check each `buffer.read*`/`write*` for which it is.
- `FoamField.sample` and `FoamPaint`'s `corners` wrap with `%` on coordinates that can be negative: `mod`.
- `FoamPaint`'s `hash` multiplies integers up to 2^53 exactly and wraps with `% 4294967296`, then uses
  `bit32.bxor`/`bit32.rshift`: use `mod` for the `%` (the lattice coordinates can be negative) and the
  `bit32` helpers; plain JS `^` would go signed.
- `FoamPaint` mentions `math.random` only in a comment; the module is deterministic. Keep it that way.
- `FoamPaint.band` and `FoamRoughness.fill` round bytes with `math.floor(value * 255 + 0.5)` then clamp:
  translate literally.

- [ ] **Step 5: Run the tests and watch them pass; check the counts**

Run: `node --test tests/ocean/core/foamField.test.js tests/ocean/core/foamPaint.test.js tests/ocean/core/foamRoughness.test.js`
Expected: PASS, 18 tests.
Run: `echo "$(grep -c '^test(' tests/ocean/core/foamField.test.js)/6 $(grep -c '^test(' tests/ocean/core/foamPaint.test.js)/11 $(grep -c '^test(' tests/ocean/core/foamRoughness.test.js)/1"`
Expected: `6/6 11/11 1/1`.

- [ ] **Step 6: Commit**

```bash
git add content/ocean/js/core/foamField.js content/ocean/js/core/foamPaint.js content/ocean/js/core/foamRoughness.js tests/ocean/core/foamField.test.js tests/ocean/core/foamPaint.test.js tests/ocean/core/foamRoughness.test.js
git commit -m "feat: port FoamField, FoamPaint and FoamRoughness to the ocean core"
```

---

### Task 8: The maps: WaterColour, PeakMask, NormalTexels, ScatterLobe

**Files:**
- Create: `content/ocean/js/core/waterColour.js`, `peakMask.js`, `normalTexels.js`, `scatterLobe.js`
- Test: `tests/ocean/core/waterColour.test.js` (3), `peakMask.test.js` (7), `normalTexels.test.js` (4),
  `scatterLobe.test.js` (3)

**Interfaces:**
- Consumes: `luau.js` (Task 1); `cascade.js` (Task 3); `foamField.js` (Task 7).
- Produces:
  - `waterColour.js`: `lut(deep, subsurface) -> Uint8Array(768)` (colours are `color3` records),
    `base(out: Uint8Array, texels, tile, fields, cascades, peak, tint, lut)`.
  - `peakMask.js`: `DECAY = 0.98`, `nextMax(previous, found, decay) -> number`,
    `fill(out: Uint8Array, texels, tile, fields, cascades, dMax, gamma, foam?) -> number`.
  - `normalTexels.js`: `FLIP_G = false`, `fill(out: Uint8Array, blockTexels, blockStuds, fields, cascades,
    flipG = FLIP_G)`, `tile(block: Uint8Array, blockTexels, image: Uint8Array, imageTexels)`. (The Luau
    module is left unfrozen so a caller can set `FLIP_G`; an ES module's export cannot be reassigned from
    outside, so the switch becomes the trailing `flipG` argument.)
  - `scatterLobe.js`: `DEFAULTS` (frozen `{ strength: 2, viewPower: 3, facePower: 2 }`),
    `strength(centreX, centreZ, cameraX, cameraY, cameraZ, sunX, sunY, sunZ, params) -> number`.

- [ ] **Step 1: Translate the four spec files into failing tests**

The first WaterColour case shows `Color3` and a `u8` buffer:

```js
const DEEP = color3(0.125, 0.25, 0.375);
// SUBSURFACE and byteOf exactly as in WaterColour.spec.luau (byteOf is the spec's own helper).

test('the LUT runs from deep to subsurface', () => {
	const lut = WaterColour.lut(DEEP, SUBSURFACE);
	expect.equal(lut.byteLength, 256 * 3, '256 RGB triples');
	expect.equal(lut[0], byteOf(DEEP.r), 'entry 0 red');
	expect.equal(lut[1], byteOf(DEEP.g), 'entry 0 green');
	expect.equal(lut[2], byteOf(DEEP.b), 'entry 0 blue');
	expect.equal(lut[255 * 3], byteOf(SUBSURFACE.r), 'entry 255 red');
	expect.equal(lut[255 * 3 + 1], byteOf(SUBSURFACE.g), 'entry 255 green');
	expect.equal(lut[255 * 3 + 2], byteOf(SUBSURFACE.b), 'entry 255 blue');
	const middle = lerpColor3(DEEP, SUBSURFACE, 128 / 255);
	expect.equal(lut[128 * 3], byteOf(middle.r), 'entry 128 red');
	expect.equal(lut[128 * 3 + 1], byteOf(middle.g), 'entry 128 green');
	expect.equal(lut[128 * 3 + 2], byteOf(middle.b), 'entry 128 blue');
	expect.truthy(lut[0] < lut[128 * 3], 'deep below the middle');
	expect.truthy(lut[128 * 3] < lut[255 * 3], 'middle below the top');
});
```

A NormalTexels case that sets `NormalTexels.FLIP_G = true` becomes a call with `flipG = true`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/ocean/core/waterColour.test.js tests/ocean/core/peakMask.test.js tests/ocean/core/normalTexels.test.js tests/ocean/core/scatterLobe.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Port the four modules**

Module notes:
- `WaterColour.lut` lerps with `deep:Lerp(subsurface, k / 255)`: `lerpColor3`, then the module's `byte`
  helper (`clamp(Math.floor(value * 255 + 0.5), 0, 255)`).
- `PeakMask.fill` keeps a scratch `magnitudes` buffer between calls in Luau (`held`): keep a module-level
  `Float32Array` reused when large enough, allocated otherwise, the same rule.
- `NormalTexels.tile` uses `buffer.copy` per row: `image.set(block.subarray(source, source + rowBytes),
  destination)`.

- [ ] **Step 4: Run the tests and watch them pass; check the counts**

Run: `node --test tests/ocean/core/waterColour.test.js tests/ocean/core/peakMask.test.js tests/ocean/core/normalTexels.test.js tests/ocean/core/scatterLobe.test.js`
Expected: PASS, 17 tests.
Run: `echo "$(grep -c '^test(' tests/ocean/core/waterColour.test.js)/3 $(grep -c '^test(' tests/ocean/core/peakMask.test.js)/7 $(grep -c '^test(' tests/ocean/core/normalTexels.test.js)/4 $(grep -c '^test(' tests/ocean/core/scatterLobe.test.js)/3"`
Expected: `3/3 7/7 4/4 3/3`.

- [ ] **Step 5: Commit**

```bash
git add content/ocean/js/core/waterColour.js content/ocean/js/core/peakMask.js content/ocean/js/core/normalTexels.js content/ocean/js/core/scatterLobe.js tests/ocean/core/waterColour.test.js tests/ocean/core/peakMask.test.js tests/ocean/core/normalTexels.test.js tests/ocean/core/scatterLobe.test.js
git commit -m "feat: port WaterColour, PeakMask, NormalTexels and ScatterLobe to the ocean core"
```

---

### Task 9: The whole pipeline once, coverage, and the record

**Files:**
- Create: `tests/ocean/core/pipeline.test.js`
- Modify: `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md` (add a "Status" line under the
  header)

**Interfaces:**
- Consumes: every module from Tasks 1 to 8.
- Produces: nothing new; proves the modules compose the way A2 will call them.

- [ ] **Step 1: Write the pipeline test**

It runs one frame of the High tier the way the Roblox coordinator does, in plain JavaScript, and checks the
outputs are finite and in range. Read `Tier.presets.High` for the sizes, `n` and rings.

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import * as WaveField from '../../../content/ocean/js/core/waveField.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as SurfaceSampler from '../../../content/ocean/js/core/surfaceSampler.js';
import * as Swells from '../../../content/ocean/js/core/swells.js';
import * as FoamField from '../../../content/ocean/js/core/foamField.js';
import * as WaterColour from '../../../content/ocean/js/core/waterColour.js';
import * as PeakMask from '../../../content/ocean/js/core/peakMask.js';
import { color3 } from '../../../content/ocean/js/core/luau.js';

const LOOP = 120;
const T = 12;

test('one High-tier frame: cascades, store, every patch, foam and the colour and mask maps', () => {
	const preset = Tier.presets.High;
	const params = Spectrum.validateParams({ ...Spectrum.NORMAL, scale: 8, tailBoost: -0.3, isotropy: 0.4 });
	const field = WaveField.create({ params, n: preset.n, sizes: preset.sizes, seed: 1, loopPeriod: LOOP, chop: 0.8, swells: [] });
	const store = FieldStore.create(preset.n, preset.sizes);
	const cells = preset.n * preset.n;
	const packed = new Float32Array(FieldStore.bufferSize(cells) / 4);
	const started = performance.now();
	for (let index = 1; index <= preset.sizes.length; index++) {
		WaveField.update(field, index, T);
		FieldStore.pack(field.cascades[index - 1], packed);
		FieldStore.receive(store, index, packed, T);
		FieldStore.promote(store, index, index);
		FieldStore.blend(store, index, 1);
	}
	const cascadeMs = performance.now() - started;

	const layout = RingLayout.build({ rings: preset.rings, patchCells: preset.patchCells, textureTile: preset.textureTile });
	const swells = Swells.create([], params, LOOP);
	let written = 0;
	let maxHeight = 0;
	const fillStarted = performance.now();
	for (const patch of layout.patches) {
		const ringSpec = preset.rings[patch.ring - 1];
		const nextRingSpec = preset.rings[patch.ring] ?? null;
		const inner = preset.rings[patch.ring - 2];
		const count = (patch.cells + 1) * (patch.cells + 1);
		const positions = new Float32Array(count * 3);
		const normals = new Float32Array(count * 3);
		SurfaceSampler.fill(patch, ringSpec, nextRingSpec, ringSpec.halfExtent, store, swells, T, 0.8, 0, 0, 0, 0, 0, 0, inner ? inner.halfExtent : 0, -4, positions, normals);
		for (let i = 0; i < positions.length; i++) {
			expect.truthy(Number.isFinite(positions[i]) && Number.isFinite(normals[i]), `patch value ${i} finite`);
		}
		for (let v = 0; v < count; v++) {
			maxHeight = Math.max(maxHeight, Math.abs(positions[v * 3 + 1]));
		}
		written += count;
	}
	const fillMs = performance.now() - fillStarted;
	expect.equal(written, layout.vertexCount, 'every vertex of the layout was written');
	expect.truthy(maxHeight > 0.5 && maxHeight < 60, `plausible heights at scale 8: max ${maxHeight}`);

	const texels = 128;
	const colour = new Uint8Array(texels * texels * 4);
	const lut = WaterColour.lut(color3(8 / 255, 46 / 255, 72 / 255), color3(28 / 255, 168 / 255, 156 / 255));
	WaterColour.base(colour, texels, preset.textureTile, store.display, [1, 2, 3], 10.3, 0.35, lut);
	const mask = new Uint8Array(texels * texels * 4);
	const found = PeakMask.fill(mask, texels, preset.textureTile, store.display, [1, 2, 3], 10.3, 0.8);
	expect.truthy(Number.isFinite(found) && found > 0, `mask found a crest: ${found}`);
	expect.truthy(colour.some((byte, i) => i % 4 !== 3 && byte > 0), 'the colour map has colour');

	const foam = FoamField.create(256);
	const cover = FoamField.stepRows(foam, 0, 256, store.display, [1, 2, 3], preset.textureTile, 0.8, { whitecap: 0.35, grow: 2, decay: 0.86 });
	expect.truthy(cover >= 0 && cover <= 1, `foam cover in range: ${cover}`);

	console.log(`[ocean-core] cascades ${cascadeMs.toFixed(1)} ms, surface fill ${fillMs.toFixed(1)} ms (${written} vertices), foam cover ${cover.toFixed(3)}`);
});
```

The argument lists above follow the Interfaces blocks of Tasks 5 to 8. If a real signature from those tasks
differs (for example the arguments `WaterColour.base` takes for `cascades`, or the vertex count per patch,
`(cells + 1)^2`), follow the real module and note the difference in the task report. The ring loop mirrors
how `roblox-ocean/src/client/OceanCoordinator/Surface.luau` calls `SurfaceSampler.fill`: check its call
site for the `innerCentre`/`innerHalf`/`skirtY` arguments and match them.

- [ ] **Step 2: Run it**

Run: `node --test tests/ocean/core/pipeline.test.js`
Expected: PASS, with one `[ocean-core]` line. Record the three numbers in the task report (they are the
first measurement of the port in Node; A2 measures in the browser).

- [ ] **Step 3: Run the whole suite with coverage**

Run: `npm run test:ocean`
Expected: every test passes (14 + 37 + 24 + 14 + 21 + 34 + 18 + 17 + 1 = 180), and the coverage table shows
at least 80% line coverage for every file under `content/ocean/js/core/`. A file under 80% gets tests for
its uncovered branches in this step, written against the Luau behaviour of those branches.

- [ ] **Step 4: Record the status in the spec**

Under the spec's `**Status:**` line, add:

```markdown
**A1 (core port):** done on 2026-MM-DD at commit `<hash>`: 21 modules, 159 carried-over Luau cases plus
21 new tests, coverage <lowest file>% or better. Node timing for one High-tier frame: cascades <x> ms,
surface fill <y> ms.
```

with the real date, hash, coverage and timings filled in from Steps 2 and 3.

- [ ] **Step 5: Commit**

```bash
git add tests/ocean/core/pipeline.test.js docs/superpowers/specs/2026-09-27-ocean-showcase-design.md
git commit -m "test: one High-tier frame through the whole ocean core"
```
