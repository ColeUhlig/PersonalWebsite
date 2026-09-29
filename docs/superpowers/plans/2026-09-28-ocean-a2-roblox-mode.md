# Ocean Showcase A2: Roblox Mode on Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Roblox ocean running live in a browser tab at `content/ocean/index.html`, in "Roblox mode": the A1 core driven the way the Roblox coordinator drives it (three cascade workers, a painter, a CPU vertex write every frame, painted textures, 232 materials with per-patch glow), rendered with Three.js and matched by eye against Studio.

**Architecture:** Three layers. `engine/` holds browser-free JavaScript twins of the Roblox engine-facing Luau (the coordinator, Surface, Horizon, Painter and the two worker scripts), talking to workers through a small Worker-shaped interface so Node can test all of it with in-process workers. `workers/` holds thin Web Worker entry points around those cores. `render/` is the only Three.js code: it binds the engine's typed arrays straight into vertex attributes and data textures, so the CPU writes every vertex and every texel exactly as Roblox forces the Luau to.

**Tech Stack:** Plain ES modules, no build step. Three.js 0.186.1 from jsDelivr through an import map (addons `Sky` and `OrbitControls`). Module Web Workers. Node 25 `node --test` for unit tests; `@playwright/test` 1.63.0 (the VEX branch's pinned version) with headless Chromium for browser tests. A Python static server for local serving.

**Spec:** `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md`, sections 2, 4.1, 4.3, 4.4, 4.5, 7 and 8 (this plan is build step 2, "A2 Roblox mode on screen", of section 9).

**Roblox source being mirrored (read-only):** `/Users/cole/Projects/roblox-ocean/src/client/OceanCoordinator/` (`OceanClient.client.luau`, `Surface.luau`, `Horizon.luau`, `Materials.luau`, `Painter.luau`, `PainterWorker.client.luau`, `CascadeWorker.client.luau`, `Look.luau`, `FoamKnobs.luau`). Nothing in that repo changes.

## Global Constraints

- Work only in the worktree `/Users/cole/Projects/Wesbite-ocean` on branch `ocean-showcase`. Never touch `/Users/cole/Projects/Wesbite` itself: another session works there on the VEX page.
- No build step; plain ES modules a browser imports as they are. External libraries only from `cdn.jsdelivr.net/npm/` with exact pinned versions through the page's import map: `three@0.186.1` (`build/three.module.js` and `examples/jsm/`).
- The A1 core (`content/ocean/js/core/`) is used, never forked. If a core bug turns up, fix it in the core with a test and say so in the report.
- Browser-free code (`content/ocean/js/engine/`, `content/ocean/js/workers/*Core.js`) must import cleanly in Node: no DOM, no Three.js, no `window`/`self`/`document`. Only `render/`, `ui/`, `main.js` and the two `*.worker.js` entry files touch browser APIs.
- Roblox mode copies the Roblox constraints (spec 4.4): vertex positions and normals are written from JavaScript every frame with no displacement shader; colour 512, peak mask 128, ripple normal map 512 (tiled from a 128 block over 64 studs), foam field 256 and per-ring roughness 128 are painted on a worker and uploaded as textures, one map turn per frame; 232 materials (224 patches plus 8 horizon quads), each with its own emissive strength from `ScatterLobe`; the same rings, lattice snapping, skirts, horizon and frame-counted cross-fade.
- One scene unit is one Roblox stud. Axes as Roblox: +Y up, right-handed, same as Three.js.
- Tests live in `tests/ocean/` (unit: `tests/ocean/engine/`, browser: `tests/ocean/e2e/`), never under `content/`.
- No `Math.random` anywhere; randomness only through `core/random.js`.
- Files use tabs. Every engine twin names the Luau file it mirrors in its header comment.
- Commit messages: `<type>: <description>` (feat, fix, test, docs, chore). No attribution trailers.
- Subagents do not use the Roblox Studio MCP tools; Studio captures are the controller's (Task 8).

## Review Focus

Inputs a visitor's browser will produce that no Luau spec covers; each has a test in the named task:

1. **Workers unavailable or failing** (old browser, blocked module workers, a worker that errors): the ocean falls back to the main thread and says so in its status, never a frozen or blank sea. Tests in Task 2 (cascades) and Task 4 (painter), browser test in Task 6 (`?workers=0`).
2. **The tab hidden and shown again** (rAF stops, a huge `dt`, worker replies arriving late or all at once): no NaN, no permanent stall; the pending-reply timeouts recover. Test in Task 5.
3. **Resize, device pixel ratio and phone portrait**: canvas and camera follow the window, pixel ratio capped at 2. Browser test in Task 6.
4. **No WebGL**: a readable notice, no uncaught exceptions. Browser test in Task 1.
5. **The camera far from the origin or at negative coordinates**: rings follow the focus, positions stay finite, the horizon follows. Test in Task 3.

---

## Conventions every task follows

- **Worker-shaped objects.** Every worker, real or in-process, is `{ postMessage(message, transfer?), onmessage, onerror, terminate() }`, with `onmessage` receiving `{ data }`. A worker core is a factory `createXWorker(post) -> handle(message)` where `post(message, transfer?)` sends a reply. `engine/inProcessWorker.js` (Task 2) wraps a core into a Worker-shaped object that delivers every message a microtask later; the Node tests and the main-thread fallback both use it.
- **Index rule, as in A1.** Cascade numbers, ring numbers, band numbers and vertex indices keep their Luau values (1-based); JavaScript arrays are 0-based and read at `[n - 1]`.
- **Timing.** Stage timings use `performance.now()` (a global in Node and browsers). Stage totals are kept in seconds, like the Luau `stageSeconds`.
- **Flushing in tests.** In-process workers deliver on microtasks; a test flushes them with `await flush()` where `const flush = () => new Promise((resolve) => setImmediate(resolve));`.
- **Luau references.** When a step says "port X from `Y.luau`", read the Luau file, keep its logic, order and comments that explain the logic, and drop what exists only because of Roblox instances (EditableMesh ids, `BatchSetValues`, `Content`, part properties, the corner push-out of the template mesh: Three.js takes an explicit bounding sphere instead).

---

### Task 1: Page shell, config and the no-WebGL notice

**Files:**
- Modify: `package.json` (scripts and dev dependency)
- Create: `.gitignore`
- Create: `playwright.ocean.config.js`
- Create: `content/ocean/index.html`, `content/ocean/style.css`
- Create: `content/ocean/js/main.js` (boot only in this task)
- Create: `content/ocean/js/engine/config.js`
- Test: `tests/ocean/engine/config.test.js`, `tests/ocean/e2e/shell.spec.js`

**Interfaces:**
- Consumes: A1 `core/spectrum.js` (`NORMAL`, `validateParams`), `core/mapRotation.js` (`BANDS`), `core/tier.js` (`presets`), `core/luau.js` (`clamp`).
- Produces (`engine/config.js`): the constants `LOOP_PERIOD` (120), `SEED` (7), `SWELL_SPECS`, `MAP_TEXELS` (128), `COLOUR_TEXELS` (512), `FOAM_TEXELS` (256), `BAND_ROWS` (128), `NORMAL_BLOCK_TEXELS` (128), `NORMAL_BLOCK_STUDS` (64), `NORMAL_IMAGE_TEXELS` (512), `REPORT_EVERY_FRAMES` (300), `CONFIGURE_TIMEOUT_FRAMES` (60), `PAINT_TIMEOUT_FRAMES` (60), `CAMERAS`, `LOOK`, `PLACE`; and `readConfig(search) -> Config` (frozen) with fields `params, chop, swellScale, peak, flatNormals, deep, subsurface, tint, scatter {strength, viewPower, facePower}, maskGamma, maskDecay, roughness, foam {enabled, whitecap, grow, decay, threshold, feather, lace, opacity, roughness, colour}, tier, useWorkers, freeze, camera, focusOrigin, hud, stats, calibrate, warnings`. Colours (`deep`, `subsurface`, `foam.colour`) are frozen `[r, g, b]` byte arrays.
- Produces (`main.js`): `webglSupported() -> boolean` (used again in Task 6) and the `#notice` element behaviour.

- [ ] **Step 1: Tooling**

Replace `package.json` with (keeping the A1 script):

```json
{
	"name": "personal-website",
	"private": true,
	"type": "module",
	"scripts": {
		"test:ocean": "node --test --experimental-test-coverage --test-coverage-include='content/ocean/js/core/**' --test-coverage-include='content/ocean/js/engine/**' --test-coverage-include='content/ocean/js/workers/**' 'tests/ocean/core/**/*.test.js' 'tests/ocean/engine/**/*.test.js'",
		"test:ocean:e2e": "playwright test -c playwright.ocean.config.js",
		"serve:ocean": "python3 -m http.server 8767 --directory content"
	},
	"devDependencies": {
		"@playwright/test": "1.63.0"
	}
}
```

Create `.gitignore`:

```
node_modules/
test-results/
playwright-report/
.superpowers/
.DS_Store
```

(The VEX branch adds its own `.gitignore` and `package.json`; the eventual merge keeps the union of both. Nothing here depends on the other branch.)

Create `playwright.ocean.config.js`:

```js
import { defineConfig } from '@playwright/test';

// Browser tests for the ocean page. Headless Chromium renders WebGL through SwiftShader, which is
// slow but deterministic: these tests check behaviour and that pixels appear, never frame rates.
export default defineConfig({
	testDir: 'tests/ocean/e2e',
	timeout: 90_000,
	expect: { timeout: 30_000 },
	workers: 1,
	use: {
		baseURL: 'http://localhost:8767',
		viewport: { width: 1366, height: 767 },
		launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
	},
	webServer: {
		command: 'python3 -m http.server 8767 --directory content',
		url: 'http://localhost:8767/ocean/',
		reuseExistingServer: true,
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

Run: `cd /Users/cole/Projects/Wesbite-ocean && npm install && npx playwright install chromium`
Expected: `node_modules/` created, Chromium downloaded, no errors.

- [ ] **Step 2: Write the failing config tests**

`tests/ocean/engine/config.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Config from '../../../content/ocean/js/engine/config.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';

test('the defaults are Look.luau with the place attributes applied', () => {
	const c = Config.readConfig('');
	expect.equal(c.params.windSpeed, Spectrum.NORMAL.windSpeed, 'wind');
	expect.equal(c.params.fetch, Spectrum.NORMAL.fetch, 'fetch');
	expect.equal(c.params.scale, 8, 'scale from Look.SEA');
	expect.equal(c.params.tailBoost, -0.3, 'tailBoost');
	expect.equal(c.params.isotropy, 0.4, 'isotropy from the place (OceanIsotropy 0.4)');
	expect.equal(c.chop, 0.8, 'chop');
	expect.equal(c.peak, 10.3, 'peak');
	expect.equal(c.tint, 0.35, 'tint');
	expect.equal(c.scatter.strength, 30, 'scatter strength');
	expect.equal(c.scatter.viewPower, 3, 'viewPower');
	expect.equal(c.scatter.facePower, 1, 'facePower');
	expect.equal(c.maskGamma, 0.8, 'gamma');
	expect.equal(c.maskDecay, 0.98, 'mask decay');
	expect.equal(c.roughness.join(','), '0.15,0.2,0.3,0.45,0.6', 'roughness');
	expect.equal(c.foam.enabled, true, 'foam on');
	expect.equal(c.foam.whitecap, 0.35, 'whitecap');
	expect.equal(c.foam.opacity, 0.7, 'opacity');
	expect.equal(c.deep.join(','), '8,46,72', 'deep');
	expect.equal(c.subsurface.join(','), '28,168,156', 'subsurface');
	expect.equal(c.foam.colour.join(','), '232,228,210', 'foam colour');
	expect.equal(c.tier, null, 'tier chosen at start-up');
	expect.equal(c.useWorkers, true, 'workers on');
	expect.equal(c.freeze, null, 'clock running');
	expect.equal(c.camera, 'orbit', 'free camera');
	expect.equal(c.calibrate, null, 'no calibration');
	expect.equal(c.warnings.length, 0, 'no warnings');
	expect.truthy(Object.isFrozen(c), 'frozen');
});

test('URL parameters override the defaults', () => {
	const c = Config.readConfig('?scale=4&whitecap=0.55&isotropy=1&tier=Low&workers=0&freeze=12&cam=high&focus=origin&hud=0&stats=1&deep=1,2,3&foam=0');
	expect.equal(c.params.scale, 4, 'scale');
	expect.equal(c.foam.whitecap, 0.55, 'whitecap');
	expect.equal(c.params.isotropy, 1, 'isotropy');
	expect.equal(c.tier, 'Low', 'tier');
	expect.equal(c.useWorkers, false, 'workers off');
	expect.equal(c.freeze, 12, 'frozen clock');
	expect.equal(c.camera, 'high', 'camera');
	expect.equal(c.focusOrigin, true, 'focus pinned to the origin');
	expect.equal(c.hud, false, 'hud off');
	expect.equal(c.stats, true, 'stats on');
	expect.equal(c.deep.join(','), '1,2,3', 'deep colour');
	expect.equal(c.foam.enabled, false, 'foam off');
});

test('bad values fall back with a warning instead of reaching the maths', () => {
	const c = Config.readConfig('?wind=0&scale=abc&tint=2&opacity=-1&roughness=0.1,x,0.3&tier=Ultra&cam=sideways&deep=300,1');
	expect.equal(c.params.windSpeed, Spectrum.NORMAL.windSpeed, 'wind 0 rejected by validateParams');
	expect.equal(c.params.scale, 8, 'non-number scale ignored');
	expect.equal(c.tint, 1, 'tint clamped to 1');
	expect.equal(c.foam.opacity, 0, 'opacity clamped to 0');
	expect.equal(c.roughness.join(','), '0.1,0.3', 'unparseable roughness entry dropped');
	expect.equal(c.tier, null, 'unknown tier ignored');
	expect.equal(c.camera, 'orbit', 'unknown camera ignored');
	expect.equal(c.deep.join(','), '8,46,72', 'malformed colour ignored');
	for (const name of ['wind', 'scale', 'tint', 'opacity', 'roughness', 'tier', 'cam', 'deep']) {
		expect.truthy(c.warnings.some((w) => w.includes(name)), `a warning names ${name}`);
	}
});

test('calibration modes paint grey, drop foam and glow, and set the vertex normals', () => {
	const map = Config.readConfig('?calibrate=map');
	expect.equal(map.calibrate, 'map', 'map mode');
	expect.equal(map.flatNormals, true, 'map mode lights only through the normal map');
	expect.equal(map.deep.join(','), '128,128,128', 'grey deep');
	expect.equal(map.subsurface.join(','), '128,128,128', 'grey subsurface');
	expect.equal(map.foam.enabled, false, 'no foam');
	expect.equal(map.scatter.strength, 0, 'no glow');
	const vertex = Config.readConfig('?calibrate=vertex');
	expect.equal(vertex.flatNormals, false, 'vertex mode lights through the vertex normals');
	expect.equal(Config.readConfig('?calibrate=sideways').calibrate, null, 'unknown mode ignored');
});
```

(`tests/ocean/expect.js` exists from A1.)

- [ ] **Step 3: Run the tests and watch them fail**

Run: `node --test tests/ocean/engine/config.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Write `content/ocean/js/engine/config.js`**

```js
// The numbers the sea ships with and the URL knobs that override them. Twin of the Roblox
// coordinator's constants and knob reading (OceanClient.client.luau), Look.luau and FoamKnobs.luau:
// every knob the place reads from a Workspace attribute is a URL parameter here, read once.
import * as Spectrum from '../core/spectrum.js';
import * as MapRotation from '../core/mapRotation.js';
import * as Tier from '../core/tier.js';
import { clamp } from '../core/luau.js';

export const LOOP_PERIOD = 120;
export const SEED = 7;
export const SWELL_SPECS = Object.freeze([
	Object.freeze({ wavelength: 420, amplitude: 1.2, direction: 0.2, phase: 0 }),
	Object.freeze({ wavelength: 260, amplitude: 0.7, direction: -0.4, phase: 1 }),
]);
export const MAP_TEXELS = 128;
export const COLOUR_TEXELS = 512;
export const FOAM_TEXELS = 256;
export const BAND_ROWS = COLOUR_TEXELS / MapRotation.BANDS;
export const NORMAL_BLOCK_TEXELS = 128;
export const NORMAL_BLOCK_STUDS = 64;
export const NORMAL_IMAGE_TEXELS = 512;
export const REPORT_EVERY_FRAMES = 300;
export const CONFIGURE_TIMEOUT_FRAMES = 60;
export const PAINT_TIMEOUT_FRAMES = 60;
export const CAMERAS = Object.freeze(['orbit', 'deck', 'high', 'crest']);
const CALIBRATIONS = Object.freeze(['vertex', 'map']);
const GREY = Object.freeze([128, 128, 128]);

// Look.luau, verbatim. Colours are bytes (Color3.fromRGB).
export const LOOK = Object.freeze({
	SEA: Object.freeze({ scale: 8, tailBoost: -0.3, chop: 0.8, swellScale: 0, isotropy: 1, peak: 10.3 }),
	PALETTE: Object.freeze({ deep: Object.freeze([8, 46, 72]), subsurface: Object.freeze([28, 168, 156]) }),
	TINT: 0.35,
	SCATTER: Object.freeze({ strength: 30, viewPower: 3, facePower: 1 }),
	MASK_GAMMA: 0.8,
	ROUGHNESS: Object.freeze([0.15, 0.2, 0.3, 0.45, 0.6]),
	MASK_DECAY: 0.98,
	FOAM: Object.freeze({
		whitecap: 0.35,
		grow: 2,
		decay: 0.86,
		threshold: 0,
		feather: 1.3,
		lace: 0.3,
		opacity: 0.7,
		roughness: 1,
		colour: Object.freeze([232, 228, 210]),
	}),
});

// The Workspace attributes the Studio place "SOT jonswap ocean" carries on top of Look (read
// 2026-09-23): OceanIsotropy 0.4 (OceanWind 12 and OceanFetch 80000 equal the defaults).
export const PLACE = Object.freeze({ isotropy: 0.4 });

function reader(query, warnings) {
	const number = (name, fallback) => {
		if (!query.has(name)) {
			return fallback;
		}
		const text = query.get(name);
		const value = Number(text);
		if (text.trim() === '' || !Number.isFinite(value)) {
			warnings.push(`${name}=${text} is not a number; using ${fallback}`);
			return fallback;
		}
		return value;
	};
	const clamped = (name, fallback, min, max) => {
		const value = number(name, fallback);
		const result = clamp(value, min, max);
		if (result !== value) {
			warnings.push(`${name}=${value} is outside ${min}..${max}; using ${result}`);
		}
		return result;
	};
	const colour = (name, fallback) => {
		if (!query.has(name)) {
			return fallback;
		}
		const parts = query.get(name).split(',').map(Number);
		const valid = parts.length === 3 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255);
		if (!valid) {
			warnings.push(`${name}=${query.get(name)} is not three bytes r,g,b; using ${fallback.join(',')}`);
			return fallback;
		}
		return Object.freeze(parts);
	};
	const choice = (name, allowed, fallback) => {
		if (!query.has(name)) {
			return fallback;
		}
		const value = query.get(name);
		if (!allowed.includes(value)) {
			warnings.push(`${name}=${value} is not one of ${allowed.join(', ')}; using ${fallback}`);
			return fallback;
		}
		return value;
	};
	return { number, clamped, colour, choice };
}

// Roughness is a list, one value per ring; like OceanRoughness in the Luau, an entry that does not
// parse is dropped rather than becoming a hole, and an empty list keeps Look's.
function roughnessList(query, warnings) {
	if (!query.has('roughness')) {
		return LOOK.ROUGHNESS;
	}
	const entries = query.get('roughness').split(',');
	const parsed = entries.map(Number).filter((value, i) => entries[i].trim() !== '' && Number.isFinite(value));
	if (parsed.length !== entries.length) {
		warnings.push(`roughness=${query.get('roughness')} had entries that are not numbers; they were dropped`);
	}
	return parsed.length > 0 ? Object.freeze(parsed) : LOOK.ROUGHNESS;
}

export function readConfig(search) {
	const query = search instanceof URLSearchParams ? search : new URLSearchParams(search ?? '');
	const warnings = [];
	const read = reader(query, warnings);

	const defaults = Spectrum.validateParams({
		...Spectrum.NORMAL,
		scale: LOOK.SEA.scale,
		tailBoost: LOOK.SEA.tailBoost,
		isotropy: PLACE.isotropy,
	});
	let params = {
		...defaults,
		windSpeed: read.number('wind', defaults.windSpeed),
		fetch: read.number('fetch', defaults.fetch),
		scale: read.number('scale', defaults.scale),
		tailBoost: read.number('tailBoost', defaults.tailBoost),
		isotropy: read.number('isotropy', defaults.isotropy),
	};
	try {
		Spectrum.validateParams(params);
	} catch (error) {
		// Name the URL parameter as well as the Spectrum field, so the warning says what to fix.
		const url = { windSpeed: 'wind', fetch: 'fetch', scale: 'scale', tailBoost: 'tailBoost', isotropy: 'isotropy' };
		const field = Object.keys(url).find((key) => error.message.includes(key));
		warnings.push(`${field ? url[field] : 'sea'}: ${error.message}; using the default sea`);
		params = defaults;
	}

	const calibrate = read.choice('calibrate', CALIBRATIONS, null);
	const foamEnabled = query.get('foam') !== '0';
	const config = {
		params: Object.freeze(params),
		chop: read.number('chop', LOOK.SEA.chop),
		swellScale: read.number('swellScale', LOOK.SEA.swellScale),
		peak: read.number('peak', LOOK.SEA.peak),
		flatNormals: calibrate === 'map' ? true : calibrate === 'vertex' ? false : query.get('flat') === '1',
		deep: calibrate ? GREY : read.colour('deep', LOOK.PALETTE.deep),
		subsurface: calibrate ? GREY : read.colour('subsurface', LOOK.PALETTE.subsurface),
		tint: read.clamped('tint', LOOK.TINT, 0, 1),
		scatter: Object.freeze({
			strength: calibrate ? 0 : read.number('scatter', LOOK.SCATTER.strength),
			viewPower: read.number('viewPower', LOOK.SCATTER.viewPower),
			facePower: read.number('facePower', LOOK.SCATTER.facePower),
		}),
		maskGamma: read.number('gamma', LOOK.MASK_GAMMA),
		maskDecay: read.number('maskDecay', LOOK.MASK_DECAY),
		roughness: roughnessList(query, warnings),
		foam: Object.freeze({
			enabled: calibrate ? false : foamEnabled,
			whitecap: read.number('whitecap', LOOK.FOAM.whitecap),
			grow: read.number('grow', LOOK.FOAM.grow),
			decay: read.number('foamDecay', LOOK.FOAM.decay),
			threshold: read.number('threshold', LOOK.FOAM.threshold),
			feather: read.number('feather', LOOK.FOAM.feather),
			lace: read.number('lace', LOOK.FOAM.lace),
			opacity: read.clamped('opacity', LOOK.FOAM.opacity, 0, 1),
			roughness: read.number('foamRoughness', LOOK.FOAM.roughness),
			colour: read.colour('foamColour', LOOK.FOAM.colour),
		}),
		tier: read.choice('tier', Object.keys(Tier.presets), null),
		useWorkers: query.get('workers') !== '0',
		freeze: query.has('freeze') ? read.number('freeze', 12) : null,
		camera: read.choice('cam', CAMERAS, 'orbit'),
		focusOrigin: query.get('focus') === 'origin',
		hud: query.get('hud') !== '0',
		stats: query.get('stats') === '1',
		calibrate,
		warnings: Object.freeze(warnings),
	};
	return Object.freeze(config);
}
```

- [ ] **Step 5: Run the config tests and watch them pass**

Run: `node --test tests/ocean/engine/config.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the page shell**

`content/ocean/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Roblox Ocean</title>
	<meta name="description" content="A Sea of Thieves-style FFT ocean built in Roblox, running live in the browser.">
	<link rel="canonical" href="https://coleuhlig.com/ocean/">
	<script src="/js/canonical-host.js"></script>
	<link rel="stylesheet" href="style.css">
	<script type="importmap">
	{
		"imports": {
			"three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js",
			"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/"
		}
	}
	</script>
</head>
<body>
	<canvas id="ocean" aria-label="Live ocean simulation"></canvas>
	<div id="notice" hidden></div>
	<pre id="stats" hidden></pre>
	<script type="module" src="js/main.js"></script>
</body>
</html>
```

`content/ocean/style.css`:

```css
:root {
	--ink: #e8eef2;
	--panel: rgba(8, 20, 30, 0.72);
	--warn: #ffb4a8;
}
html,
body {
	margin: 0;
	height: 100%;
	background: #0b1a24;
	color: var(--ink);
	font: 14px/1.4 system-ui, sans-serif;
	overflow: hidden;
}
#ocean {
	position: fixed;
	inset: 0;
	width: 100%;
	height: 100%;
	display: block;
}
#notice {
	position: fixed;
	inset: auto 16px 16px 16px;
	padding: 12px 16px;
	background: var(--panel);
	border-left: 3px solid var(--warn);
	max-width: 640px;
}
#stats {
	position: fixed;
	top: 8px;
	left: 8px;
	margin: 0;
	padding: 8px 10px;
	background: var(--panel);
	font: 12px/1.35 ui-monospace, monospace;
	pointer-events: none;
	max-width: calc(100% - 32px);
	white-space: pre-wrap;
}
```

`content/ocean/js/main.js` (boot only; Task 6 extends it):

```js
// Page boot: read the config, check WebGL, and start the ocean (Task 6 adds the ocean itself).
import { readConfig } from './engine/config.js';

export function webglSupported() {
	try {
		const probe = document.createElement('canvas');
		return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
	} catch {
		return false;
	}
}

function showNotice(text) {
	const notice = document.getElementById('notice');
	notice.textContent = text;
	notice.hidden = false;
}

const config = readConfig(location.search);
for (const warning of config.warnings) {
	console.warn(`[ocean] ${warning}`);
}
if (!webglSupported()) {
	showNotice('This live ocean needs WebGL, which this browser has turned off or does not support.');
}
```

- [ ] **Step 7: Write the failing browser test**

`tests/ocean/e2e/shell.spec.js`:

```js
import { test, expect } from '@playwright/test';

test('the page loads without errors and hides the notice when WebGL exists', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto('/ocean/');
	await expect(page.locator('#ocean')).toBeVisible();
	await expect(page.locator('#notice')).toBeHidden();
	expect(errors).toEqual([]);
});

test('without WebGL the page shows a notice and throws nothing (Review Focus 4)', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
			return kind === 'webgl' || kind === 'webgl2' ? null : original.call(this, kind, ...rest);
		};
	});
	await page.goto('/ocean/');
	await expect(page.locator('#notice')).toBeVisible();
	await expect(page.locator('#notice')).toContainText('WebGL');
	expect(errors).toEqual([]);
});
```

- [ ] **Step 8: Run the browser tests**

Run: `npm run test:ocean:e2e -- shell.spec.js`
Expected: PASS, 2 tests. (If you wrote the test before the page, it fails first with a 404 or a missing `#notice`; note that as the red run.)

- [ ] **Step 9: Run everything and commit**

Run: `npm run test:ocean` (expect the A1 187 plus 4) and `npm run test:ocean:e2e`.

```bash
git add package.json package-lock.json .gitignore playwright.ocean.config.js content/ocean/index.html content/ocean/style.css content/ocean/js/main.js content/ocean/js/engine/config.js tests/ocean/engine/config.test.js tests/ocean/e2e/shell.spec.js
git commit -m "feat: ocean page shell, URL config and the no-WebGL notice"
```

---

### Task 2: Cascade workers, the in-process fallback and the transport

**Files:**
- Create: `content/ocean/js/engine/inProcessWorker.js`
- Create: `content/ocean/js/workers/cascadeWorkerCore.js`, `content/ocean/js/workers/cascade.worker.js`
- Create: `content/ocean/js/engine/cascadeTransport.js`
- Test: `tests/ocean/engine/cascadeTransport.test.js`

**Interfaces:**
- Consumes: A1 `core/cascade.js`, `core/fft.js`, `core/fieldStore.js`; `engine/config.js` (`CONFIGURE_TIMEOUT_FRAMES`).
- Produces:
  - `inProcessWorker.js`: `createInProcessWorker(createCore) -> WorkerLike`.
  - `cascadeWorkerCore.js`: `createCascadeWorker(post) -> handle(message)`. Messages in: `{ type: 'configure', index, config }` (a `Cascade.create` config), `{ type: 'evolve', t, buffer }` (an `ArrayBuffer` of `FieldStore.bufferSize(n*n)` bytes, transferred). Replies: `{ type: 'ready', index }`, `{ type: 'fields', index, t, buffer, ms }` (the same buffer, transferred back).
  - `cascadeTransport.js`: `createCascades({ count, cells, configFor, spawn, useWorkers, onFields, onReady, log }) -> Cascades` where `configFor(index)` returns the config for Luau cascade `index`, `spawn(index)` returns a WorkerLike (or throws), `onFields(index, packed: Float32Array, t)`, `onReady(index)`. `Cascades` is `{ request(index, t, frame) -> 'local' | 'sent' | 'busy' | 'waiting' | 'resent', mode() -> 'workers' | 'main-thread', fallbackReason() -> string | null, readyCount() -> number, lastMs: Float64Array(count), terminate() }`.

- [ ] **Step 1: Write the failing tests**

`tests/ocean/engine/cascadeTransport.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FFT from '../../../content/ocean/js/core/fft.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';
import { createCascades } from '../../../content/ocean/js/engine/cascadeTransport.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const N = 16;
const CELLS = N * N;
const configFor = (index) => ({ n: N, size: 64 * index, kMin: 0, kMax: Infinity, seed: 100 + index, loopPeriod: 120, params: Spectrum.NORMAL });

function harness(overrides = {}) {
	const received = [];
	const readied = [];
	const warnings = [];
	const cascades = createCascades({
		count: 2,
		cells: CELLS,
		configFor,
		spawn: () => createInProcessWorker(createCascadeWorker),
		useWorkers: true,
		onFields: (index, packed, t) => received.push({ index, packed: packed.slice(), t, buffer: packed.buffer }),
		onReady: (index) => readied.push(index),
		log: { warn: (text) => warnings.push(text) },
		...overrides,
	});
	return { cascades, received, readied, warnings };
}

test('a worker must answer its configure before it is asked to evolve', async () => {
	const { cascades, readied } = harness();
	expect.equal(cascades.request(1, 0, 1), 'waiting', 'not ready yet');
	await flush();
	expect.equal(readied.join(','), '1,2', 'both workers ready');
	expect.equal(cascades.readyCount(), 2, 'ready count');
	expect.equal(cascades.mode(), 'workers', 'mode');
});

test('evolve ships the fields back in the buffer it lent, one request in flight at a time', async () => {
	const { cascades, received } = harness();
	await flush();
	expect.equal(cascades.request(1, 5, 2), 'sent', 'sent');
	expect.equal(cascades.request(1, 6, 3), 'busy', 'a second request waits for the reply');
	await flush();
	expect.equal(received.length, 1, 'one reply');
	expect.equal(received[0].index, 1, 'from cascade 1');
	expect.equal(received[0].t, 5, 'stamped with the request time');
	expect.equal(received[0].packed.length, FieldStore.bufferSize(CELLS) / 4, 'a whole packed buffer');
	const direct = Cascade.create(configFor(1));
	Cascade.evolve(direct, 5);
	Cascade.synthesise(direct, FFT.plan(N));
	const expected = new Float32Array(FieldStore.bufferSize(CELLS) / 4);
	FieldStore.pack(direct, expected);
	for (const i of [0, 17, CELLS + 3, 7 * CELLS + 5]) {
		expect.equal(received[0].packed[i], expected[i], `packed[${i}] matches a direct synthesis`);
	}
	const firstBuffer = received[0].buffer;
	expect.equal(cascades.request(1, 7, 4), 'sent', 'free again after the reply');
	await flush();
	expect.equal(received[1].buffer, firstBuffer, 'the same buffer shuttles back and forth');
	expect.truthy(cascades.lastMs[0] >= 0, 'worker time recorded');
});

test('a spawn that throws puts every cascade on the main thread (Review Focus 1)', () => {
	const { cascades, received } = harness({
		spawn: () => {
			throw new Error('module workers are not supported');
		},
	});
	expect.equal(cascades.mode(), 'main-thread', 'fell back');
	expect.truthy(cascades.fallbackReason().includes('module workers are not supported'), 'reason kept');
	expect.equal(cascades.request(2, 3, 1), 'local', 'served here');
	expect.equal(received.length, 1, 'delivered synchronously');
	expect.equal(received[0].index, 2, 'cascade 2');
});

test('a worker error also falls back, and later requests are served locally (Review Focus 1)', async () => {
	const failing = () => {
		const worker = { onmessage: null, onerror: null, terminate() {} };
		worker.postMessage = () => queueMicrotask(() => worker.onerror?.({ message: 'worker crashed' }));
		return worker;
	};
	const { cascades, received } = harness({ spawn: failing });
	await flush();
	expect.equal(cascades.mode(), 'main-thread', 'fell back after the error');
	expect.truthy(cascades.fallbackReason().includes('worker crashed'), 'reason kept');
	expect.equal(cascades.request(1, 2, 5), 'local', 'served here');
	expect.equal(received.length, 1, 'delivered');
});

test('useWorkers false never spawns', () => {
	let spawned = 0;
	const { cascades } = harness({ useWorkers: false, spawn: () => { spawned += 1; return createInProcessWorker(createCascadeWorker); } });
	expect.equal(spawned, 0, 'no workers');
	expect.equal(cascades.mode(), 'main-thread', 'main thread');
	expect.equal(cascades.fallbackReason(), 'workers turned off (?workers=0)', 'reason');
});

test('a silent worker gets its configure re-sent once after the timeout', async () => {
	const posted = [];
	const silent = () => ({ onmessage: null, onerror: null, terminate() {}, postMessage: (m) => posted.push(m.type) });
	const { cascades, warnings } = harness({ spawn: silent });
	for (let frame = 1; frame <= 60; frame++) {
		expect.equal(cascades.request(1, 0, frame), 'waiting', `frame ${frame} waits`);
	}
	expect.equal(cascades.request(1, 0, 61), 'resent', 'frame 61 re-sends');
	expect.equal(cascades.request(1, 0, 62), 'waiting', 'then waits another timeout');
	expect.equal(posted.filter((t) => t === 'configure').length, 3, 'two initial configures plus one re-send');
	expect.equal(warnings.length, 1, 'warned once');
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test tests/ocean/engine/cascadeTransport.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write the three modules**

`content/ocean/js/engine/inProcessWorker.js`:

```js
// A Worker-shaped object that runs a worker core on this thread, delivering every message a
// microtask later so callers see the same asynchrony as a real Worker. It is the main-thread
// fallback when module workers are unavailable, and what the Node tests run the cores through.
// Transfer lists are accepted and ignored: nothing is detached, which a caller must not rely on.
export function createInProcessWorker(createCore) {
	const worker = {
		onmessage: null,
		onerror: null,
		terminated: false,
		postMessage(message) {
			if (worker.terminated) {
				return;
			}
			queueMicrotask(() => {
				if (worker.terminated) {
					return;
				}
				try {
					handle(message);
				} catch (error) {
					if (worker.onerror) {
						worker.onerror({ message: error.message, error });
					} else {
						throw error;
					}
				}
			});
		},
		terminate() {
			worker.terminated = true;
		},
	};
	const handle = createCore((reply) => {
		queueMicrotask(() => {
			if (!worker.terminated && worker.onmessage) {
				worker.onmessage({ data: reply });
			}
		});
	});
	return worker;
}
```

`content/ocean/js/workers/cascadeWorkerCore.js`:

```js
// Twin of CascadeWorker.client.luau: one cascade per worker. `configure` builds the cascade and
// answers `ready`; `evolve` steps it to t, synthesises the eight fields, packs them into the buffer
// the coordinator lent with the request and sends that buffer back. The coordinator lends it again
// with the next request, so one buffer shuttles per cascade and nothing is allocated per frame.
// Browser-free: the Worker entry point is cascade.worker.js.
import * as Cascade from '../core/cascade.js';
import * as FFT from '../core/fft.js';
import * as FieldStore from '../core/fieldStore.js';

export function createCascadeWorker(post) {
	let cascade = null;
	let plan = null;
	let index = 0;
	return function handle(message) {
		if (message.type === 'configure') {
			cascade = Cascade.create(message.config);
			plan = FFT.plan(message.config.n);
			index = message.index;
			post({ type: 'ready', index });
			return;
		}
		if (message.type === 'evolve') {
			if (!cascade) {
				throw new Error(`cascade worker ${index}: evolve before configure`);
			}
			const started = performance.now();
			Cascade.evolve(cascade, message.t);
			Cascade.synthesise(cascade, plan);
			FieldStore.pack(cascade, new Float32Array(message.buffer));
			const ms = performance.now() - started;
			post({ type: 'fields', index, t: message.t, buffer: message.buffer, ms }, [message.buffer]);
			return;
		}
		throw new Error(`cascade worker: unknown message type ${message.type}`);
	};
}
```

`content/ocean/js/workers/cascade.worker.js`:

```js
// Module Web Worker entry point for one cascade; the logic is in cascadeWorkerCore.js.
import { createCascadeWorker } from './cascadeWorkerCore.js';

const handle = createCascadeWorker((message, transfer) => self.postMessage(message, transfer ?? []));
self.onmessage = (event) => handle(event.data);
```

`content/ocean/js/engine/cascadeTransport.js`: port the worker half of `OceanClient.client.luau` (the `Fields`/`Ready` bindings, the worker spawn loop, the `evolve(index, requestTime)` function and its not-ready/timeout branch) to this interface:

```js
// Twin of the cascade-worker wiring in OceanClient.client.luau: spawns one worker per cascade,
// configures each, lends each its packed buffer with every evolve request, and falls back to
// running every cascade on this thread when workers cannot be created or report an error.
import * as Cascade from '../core/cascade.js';
import * as FFT from '../core/fft.js';
import * as FieldStore from '../core/fieldStore.js';
import { CONFIGURE_TIMEOUT_FRAMES } from './config.js';

export function createCascades({ count, cells, configFor, spawn, useWorkers, onFields, onReady, log = console }) {
	const bytes = FieldStore.bufferSize(cells);
	const lastMs = new Float64Array(count);
	const slots = [];
	let mode = 'workers';
	let reason = null;
	let local = null; // { cascades, plan, scratch } once on the main thread

	function toMainThread(why) {
		if (mode === 'main-thread') {
			return;
		}
		mode = 'main-thread';
		reason = why;
		for (const slot of slots) {
			slot.worker?.terminate();
		}
		local = {
			cascades: Array.from({ length: count }, (_, i) => Cascade.create(configFor(i + 1))),
			plan: FFT.plan(configFor(1).n),
			scratch: new Float32Array(bytes / 4),
		};
		log.warn(`[ocean] cascades on the main thread: ${why}`);
	}

	function configure(index) {
		slots[index - 1].worker.postMessage({ type: 'configure', index, config: configFor(index) });
	}

	if (!useWorkers) {
		toMainThread('workers turned off (?workers=0)');
	} else {
		try {
			for (let index = 1; index <= count; index++) {
				const worker = spawn(index);
				const slot = { worker, ready: false, pending: false, configuredFrame: 0, warned: false, buffer: new ArrayBuffer(bytes) };
				slots.push(slot);
				worker.onmessage = ({ data }) => {
					if (data.type === 'ready') {
						slot.ready = true;
						onReady(index);
					} else if (data.type === 'fields') {
						slot.buffer = data.buffer;
						slot.pending = false;
						lastMs[index - 1] = data.ms;
						onFields(index, new Float32Array(data.buffer), data.t);
					}
				};
				worker.onerror = (event) => toMainThread(`cascade worker ${index} failed: ${event?.message ?? 'unknown error'}`);
			}
			for (let index = 1; index <= count; index++) {
				configure(index);
			}
		} catch (error) {
			toMainThread(`cascade workers could not start: ${error.message}`);
		}
	}

	function request(index, t, frame) {
		if (mode === 'main-thread') {
			const cascade = local.cascades[index - 1];
			Cascade.evolve(cascade, t);
			Cascade.synthesise(cascade, local.plan);
			FieldStore.pack(cascade, local.scratch);
			onFields(index, local.scratch, t);
			return 'local';
		}
		const slot = slots[index - 1];
		if (slot.ready) {
			if (slot.pending) {
				return 'busy';
			}
			slot.pending = true;
			const buffer = slot.buffer;
			slot.buffer = null;
			slot.worker.postMessage({ type: 'evolve', t, buffer }, [buffer]);
			return 'sent';
		}
		if (frame - slot.configuredFrame <= CONFIGURE_TIMEOUT_FRAMES) {
			return 'waiting';
		}
		if (!slot.warned) {
			log.warn(`[ocean] worker ${index} not ready after ${CONFIGURE_TIMEOUT_FRAMES} frames; re-sending Configure`);
			slot.warned = true;
		}
		slot.configuredFrame = frame;
		configure(index);
		return 'resent';
	}

	return {
		request,
		mode: () => mode,
		fallbackReason: () => reason,
		readyCount: () => (mode === 'main-thread' ? count : slots.filter((s) => s.ready).length),
		lastMs,
		terminate() {
			for (const slot of slots) {
				slot.worker?.terminate();
			}
		},
	};
}
```

(The code above is complete; it is here so the ported Luau behaviour is fixed, not left to taste: requests at the current clock, one in flight per cascade, a timeout re-send of Configure warned once. Compare it with `OceanClient.client.luau`'s `evolve` and report any behavioural difference you find.)

- [ ] **Step 4: Run and watch them pass**

Run: `node --test tests/ocean/engine/cascadeTransport.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add content/ocean/js/engine/inProcessWorker.js content/ocean/js/workers/cascadeWorkerCore.js content/ocean/js/workers/cascade.worker.js content/ocean/js/engine/cascadeTransport.js tests/ocean/engine/cascadeTransport.test.js
git commit -m "feat: cascade workers with buffer ping-pong and a main-thread fallback"
```

---

### Task 3: Surface and horizon state

**Files:**
- Create: `content/ocean/js/engine/surfaceState.js`, `content/ocean/js/engine/horizonState.js`
- Test: `tests/ocean/engine/surfaceState.test.js`, `tests/ocean/engine/horizonState.test.js`

**Interfaces:**
- Consumes: A1 `core/ringLayout.js`, `core/surfaceSampler.js`, `core/luau.js` (`mod`, `check`); `core/fieldStore.js` and `core/swells.js` in tests.
- Produces:
  - `surfaceState.js`: `SKIRT_MARGIN` (2); `create(layout, bounds, flatNormals) -> Surface`; `snap(surface, focusX, focusZ) -> moved`; `write(surface, store, swells, t, chop, frame?)`; `snapAndWrite(surface, focusX, focusZ, store, swells, t, chop, frame?) -> moved`; `takeExtremes(surface) -> [maxAbsY, maxLateral]`. `Surface` is `{ layout, patches, byRing, bounds, flatNormals, skirtY, centres, dirty, everWritten, focusX, focusZ, maxAbsY, maxLateral }`; `centres[ring - 1]` is `{ x, z }`. Each entry of `patches` is `{ patch, ring, half, hidden, positions: Float32Array(count * 3), normals: Float32Array(count * 3), uvs: Float32Array(count * 2), worldX, worldZ, written, uvsChanged }` where `count = (patchCells + 1)^2`, positions are local to the patch centre, `written` is set when `write` filled it this call, and `uvsChanged` when its ring moved. The renderer clears both flags after uploading.
  - `horizonState.js`: `QUAD` (2048), `HORIZON_DISTANCE` (3000), `OVERLAP` (8), `QUAD_Y` (-0.05), `CORNERS` (`[[-1,-1],[1,-1],[-1,1],[1,1]]`), `TRIANGLES` (`[[0,2,1],[1,2,3]]`); `create(tile, surfaceHalfExtent) -> Horizon`; `update(horizon, originX, originZ) -> boolean` (true when it moved); `quadCentre(horizon, quad, out?) -> out[2]`. `Horizon` is `{ quads, half, tile, originX, originZ }`, each quad `{ offsetX, offsetZ, worldX, worldZ, uvs: Float32Array(8), uvsChanged }`.

- [ ] **Step 1: Write the failing tests**

`tests/ocean/engine/surfaceState.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as Swells from '../../../content/ocean/js/core/swells.js';
import * as Spectrum from '../../../content/ocean/js/core/spectrum.js';
import * as SurfaceState from '../../../content/ocean/js/engine/surfaceState.js';

const BOUNDS = Object.freeze({ height: 40, lateral: 46.4 });
const SILENT = [
	{ wavelength: 420, amplitude: 0, direction: 0.2, phase: 0 },
	{ wavelength: 260, amplitude: 0, direction: -0.4, phase: 1 },
];

function setup({ wavy = false } = {}) {
	const preset = Tier.presets.High;
	const layout = RingLayout.build({ rings: preset.rings, patchCells: preset.patchCells, textureTile: preset.textureTile });
	const store = FieldStore.create(preset.n, preset.sizes);
	for (let index = 1; index <= preset.sizes.length; index++) {
		const display = store.display[index - 1];
		for (let cell = 0; cell < preset.n * preset.n; cell++) {
			display.height[cell] = wavy ? Math.sin(cell * 0.37 + index) * 2 : 0;
			display.slopeX[cell] = wavy ? Math.cos(cell * 0.21) * 0.1 : 0;
		}
	}
	const swells = Swells.create(SILENT, Spectrum.NORMAL, 120);
	return { preset, layout, store, swells };
}

test('create gives every patch typed arrays sized for it and snaps to the origin', () => {
	const { layout, preset } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	const count = (preset.patchCells + 1) ** 2;
	expect.equal(surface.patches.length, layout.patches.length, 'one state per patch');
	expect.equal(surface.patches[0].positions.length, count * 3, 'positions');
	expect.equal(surface.patches[0].normals[1], 1, 'normals start up');
	expect.equal(surface.patches[0].uvs.length, count * 2, 'uvs');
	expect.equal(surface.skirtY, Math.fround(-(BOUNDS.height - SurfaceState.SKIRT_MARGIN)), 'skirt parked float32-exact');
	for (let ring = 1; ring <= preset.rings.length; ring++) {
		const [x, z] = RingLayout.windowCentre(0, 0, preset.rings[ring - 1].spacing);
		expect.equal(surface.centres[ring - 1].x, x, `ring ${ring} centre x`);
		expect.equal(surface.centres[ring - 1].z, z, `ring ${ring} centre z`);
	}
	expect.truthy(surface.patches.every((p) => p.uvsChanged), 'every ring placed once');
});

test('snap moves exactly the rings whose window centre changed and rewrites only their uvs', () => {
	const { layout, preset } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	for (const p of surface.patches) p.uvsChanged = false;
	const focusX = 5;
	const focusZ = -3;
	const expected = preset.rings.map((spec, i) => {
		const [x, z] = RingLayout.windowCentre(focusX, focusZ, spec.spacing);
		return x !== surface.centres[i].x || z !== surface.centres[i].z;
	});
	const moved = SurfaceState.snap(surface, focusX, focusZ);
	expect.equal(moved, expected.filter(Boolean).length, 'moved count');
	for (const p of surface.patches) {
		expect.equal(p.uvsChanged, expected[p.ring - 1], `patch in ring ${p.ring} uvsChanged`);
		const centre = surface.centres[p.ring - 1];
		expect.equal(p.worldX, centre.x + p.patch.centreX, 'worldX');
		expect.equal(p.worldZ, centre.z + p.patch.centreZ, 'worldZ');
	}
	expect.equal(SurfaceState.snap(surface, focusX, focusZ), 0, 'the same focus moves nothing');
});

test('write fills every uncovered patch and hides the ones a finer ring covers', () => {
	const { layout, store, swells } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.write(surface, store, swells, 0, 0.8);
	const hidden = surface.patches.filter((p) => p.hidden);
	expect.truthy(hidden.length > 0 && hidden.length < surface.patches.length, `some but not all hidden: ${hidden.length}`);
	for (const p of surface.patches) {
		expect.equal(p.written, !p.hidden, 'written unless hidden');
		if (!p.hidden) {
			for (let v = 0; v < p.positions.length / 3; v++) {
				const y = p.positions[v * 3 + 1];
				expect.truthy(y === 0 || y === surface.skirtY, `flat sea or skirt, got ${y}`);
			}
		}
	}
	expect.equal(surface.everWritten, true, 'every ring written once');
});

test('after the first full write the outer ring takes only even frames', () => {
	const { layout, store, swells, preset } = setup();
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.write(surface, store, swells, 0, 0.8, 1);
	const outer = preset.rings.length;
	for (const p of surface.patches) p.written = false;
	SurfaceState.write(surface, store, swells, 0, 0.8, 3);
	expect.truthy(surface.patches.filter((p) => p.ring === outer).every((p) => !p.written), 'odd frame skips the outer ring');
	expect.truthy(surface.patches.some((p) => p.ring === 1 && p.written), 'inner rings still written');
	SurfaceState.write(surface, store, swells, 0, 0.8, 4);
	expect.truthy(surface.patches.some((p) => p.ring === outer && p.written), 'even frame writes it');
});

test('a focus far from the origin keeps every position finite (Review Focus 5)', () => {
	const { layout, store, swells, preset } = setup({ wavy: true });
	const surface = SurfaceState.create(layout, BOUNDS, false);
	for (const [fx, fz] of [[-5000.3, 12000.7], [123456.5, -98765.25]]) {
		SurfaceState.snapAndWrite(surface, fx, fz, store, swells, 3, 0.8);
		for (const p of surface.patches) {
			for (const value of p.positions) expect.truthy(Number.isFinite(value), 'position finite');
			for (const value of p.normals) expect.truthy(Number.isFinite(value), 'normal finite');
			for (const value of p.uvs) expect.truthy(Number.isFinite(value), 'uv finite');
		}
		const inner = preset.rings[0].spacing;
		expect.truthy(Math.abs(surface.centres[0].x - fx) <= 4 * inner, 'finest ring follows x');
		expect.truthy(Math.abs(surface.centres[0].z - fz) <= 4 * inner, 'finest ring follows z');
	}
});

test('takeExtremes returns the running extremes and resets them', () => {
	const { layout, store, swells } = setup({ wavy: true });
	const surface = SurfaceState.create(layout, BOUNDS, false);
	SurfaceState.write(surface, store, swells, 0, 0.8);
	const [maxY, maxLateral] = SurfaceState.takeExtremes(surface);
	expect.truthy(maxY > 0, `height extreme recorded: ${maxY}`);
	expect.truthy(Number.isFinite(maxLateral), 'lateral extreme finite');
	const [again] = SurfaceState.takeExtremes(surface);
	expect.equal(again, 0, 'reset after taking');
});
```

`tests/ocean/engine/horizonState.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Horizon from '../../../content/ocean/js/engine/horizonState.js';

test('the quads ring the surface out past the horizon distance with no gaps', () => {
	const horizon = Horizon.create(256, 1024);
	expect.truthy(horizon.quads.length >= 8, `a ring of quads: ${horizon.quads.length}`);
	const far = Math.max(...horizon.quads.map((q) => Math.abs(q.offsetX) + horizon.half));
	expect.truthy(far >= Horizon.HORIZON_DISTANCE, `far edge ${far}`);
	const hole = 1024 - Horizon.OVERLAP;
	for (const q of horizon.quads) {
		const inner = Math.max(Math.abs(q.offsetX), Math.abs(q.offsetZ)) - horizon.half;
		expect.truthy(inner <= hole + 1e-9, 'each quad reaches the hole edge');
	}
});

test('update moves every quad with the origin and wraps its uvs on the tile', () => {
	const horizon = Horizon.create(256, 1024);
	expect.equal(Horizon.update(horizon, 100, -300), true, 'moved');
	for (const q of horizon.quads) {
		expect.equal(q.worldX, 100 + q.offsetX, 'worldX');
		expect.equal(q.worldZ, -300 + q.offsetZ, 'worldZ');
		const fractionZ = -300 - Math.floor(-300 / 256) * 256;
		expect.near(q.uvs[1], (fractionZ + q.offsetZ - horizon.half) / 256, 1e-6, 'corner 1 v');
		expect.equal(q.uvsChanged, true, 'uvs flagged');
	}
	expect.equal(Horizon.update(horizon, 100, -300), false, 'same origin, no move');
	const [x, z] = Horizon.quadCentre(horizon, horizon.quads[0]);
	expect.equal(x, 100 + horizon.quads[0].offsetX, 'quadCentre x');
	expect.equal(z, -300 + horizon.quads[0].offsetZ, 'quadCentre z');
});

test('a surface too small for the overlap is refused', () => {
	let message = '';
	try {
		Horizon.create(256, 10);
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('overlap'), `clear error: ${message}`);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test tests/ocean/engine/surfaceState.test.js tests/ocean/engine/horizonState.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Port `Surface.luau` into `surfaceState.js`**

Keep: `adopt`, `snap`, `anyDirty`, `write` (the `everyRing` rule with `RingLayout.writesRing`, the per-ring `SurfaceSampler.ringContext`, the `fill` arguments exactly as `Surface.write` passes them, the hidden transitions, the extremes scan that skips `skirtY`), `takeExtremes`, `snapAndWrite` (adopt, write, then reposition dirty rings). `repositionRing` becomes: for each patch of the ring set `worldX/worldZ` to `centre + patch.centre`, rewrite its `uvs` with `RingLayout.uvBase` and `RingLayout.uv` (reuse one `out` array), set `uvsChanged = true`. Drop: `buildTemplate`, `checkedIds`, EditableMesh, parts, `Transparency` (becomes the `hidden` flag), `BatchSetValues` (becomes `written = true`).

`create(layout, bounds, flatNormals)`: check `bounds.height > SKIRT_MARGIN && bounds.lateral > 0` with the Luau message; build one state per patch with `positions` holding the flat grid `((column / cells - 0.5) * patchSize, 0, (row / cells - 0.5) * patchSize)` at `(RingLayout.vertexIndex(cells, column, row) - 1) * 3` (so a patch looks flat before its first write), `normals` all `(0, 1, 0)`, `uvs` zero; `skirtY = Math.fround(-(bounds.height - SKIRT_MARGIN))`; `centres` start at `{ x: Infinity, z: Infinity }`; then `snap(surface, 0, 0)` as the Luau does.

- [ ] **Step 4: Port `Horizon.luau` into `horizonState.js`**

Keep `axisOffsets`, the three asserts in `Horizon.new` with their messages (via `check`), the edge-only quad selection, `update` (fraction by `mod(origin, tile)`, world position `origin + offset`, uvs for the four `CORNERS` in order, `uvsChanged = true`) and `quadCentre`. Drop the meshes and parts; the renderer builds one quad geometry from `CORNERS`, `TRIANGLES` and `QUAD_Y`. `originX/originZ` start at `Infinity`.

- [ ] **Step 5: Run and watch them pass**

Run: `node --test tests/ocean/engine/surfaceState.test.js tests/ocean/engine/horizonState.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add content/ocean/js/engine/surfaceState.js content/ocean/js/engine/horizonState.js tests/ocean/engine/surfaceState.test.js tests/ocean/engine/horizonState.test.js
git commit -m "feat: surface and horizon state, twins of the Roblox Surface and Horizon"
```

---

### Task 4: The painter worker and its client

**Files:**
- Create: `content/ocean/js/workers/painterWorkerCore.js`, `content/ocean/js/workers/painter.worker.js`
- Create: `content/ocean/js/engine/painterClient.js`
- Test: `tests/ocean/engine/painterWorkerCore.test.js`, `tests/ocean/engine/painterClient.test.js`

**Interfaces:**
- Consumes: A1 `core/fieldStore.js`, `core/foamField.js`, `core/foamPaint.js`, `core/foamRoughness.js`, `core/mapRotation.js`, `core/normalTexels.js`, `core/peakMask.js`, `core/waterColour.js`; `engine/config.js` (`PAINT_TIMEOUT_FRAMES`, `CONFIGURE_TIMEOUT_FRAMES`); `engine/inProcessWorker.js` (Task 2).
- Produces:
  - `painterWorkerCore.js`: `createPainterWorker(post) -> handle(message)`. In: `{ type: 'configure', config }` where `config` has exactly the fields of the Luau `Painter.Config` (`role` `'maps' | 'colour'`, `n`, `sizes`, `texels`, `colourTexels`, `bandRows`, `tile`, `blockTexels`, `blockStuds`, `imageTexels`, `maskCascades`, `colourCascades`, `normalCascades`, `peak`, `tint`, `gamma`, `decay`, `lut` (Uint8Array 768), `foamEnabled`, `foamTexels`, `foamWhitecap`, `foamGrow`, `foamDecay`, `foamThreshold`, `foamFeather`, `foamLace`, `foamOpacity`, `foamRoughness`, `foamColour` ([r,g,b] bytes), `ringRoughness`, `chop`). `{ type: 'paint', turn, sequence, t, fields, coverage? }` where `fields` is an array of `ArrayBuffer`s (one per cascade, transferred) and `coverage` a `Float32Array` of `texels * texels` (maps role only). Replies: `{ type: 'ready' }`; `{ type: 'pixels', slot, sequence, band, pixels: Uint8Array, first, second, third, coverage?: Float32Array, roughness?: Uint8Array[], fields }` with `fields` transferred back. For the colour role `slot = MapRotation.COLOUR`, `band = turn`, `first/second/third` = foam cover, foam ms, colour ms, and on band 4 with foam on `coverage` plus one roughness map per ring. For the maps role `slot = turn`, `band = 0`, `first` = the mask's running maximum.
  - `painter.worker.js`: the module Worker entry point.
  - `painterClient.js`: `cascades(count) -> { mask, colour, normal }` (the Luau `Painter.cascades`); `create({ config, spawn, sink, stage, log }) -> Painter` where `config` is the maps role's `Painter.Config` (the client clones it for the colour role), `spawn(role)` returns a WorkerLike or throws, `sink` is `{ uploadColourBand(band, pixels), uploadMaskOrNormal(slot, pixels), uploadRoughness(ring, pixels) }` (settable later as `painter.sink`), `stage` is the coordinator's stage-seconds object; `step(painter, frame, t, store)`; `report(painter) -> { paintMs, uploadMs, skipped, stale, cycleFrames, maskMax, foamMs, foamCover, colourMs }` (per-window, resets like the Luau); `mode(painter) -> 'workers' | 'main-thread'`, `fallbackReason(painter)`, `ready(painter) -> boolean`.

- [ ] **Step 1: Write the failing tests**

`tests/ocean/engine/painterWorkerCore.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as MapRotation from '../../../content/ocean/js/core/mapRotation.js';
import * as WaterColour from '../../../content/ocean/js/core/waterColour.js';
import { color3 } from '../../../content/ocean/js/core/luau.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';

const N = 16;
const SIZES = [256, 64, 16];

function config(role, overrides = {}) {
	return {
		// colourTexels 512: FoamPaint.lace needs it to be a multiple of 64 cells x 2^(4 - 1) octaves.
		role, n: N, sizes: SIZES, texels: 64, colourTexels: 512, bandRows: 128, tile: 256,
		blockTexels: 32, blockStuds: 64, imageTexels: 64,
		maskCascades: [1, 2, 3], colourCascades: [1, 2, 3], normalCascades: [2, 3],
		peak: 10.3, tint: 0.35, gamma: 0.8, decay: 0.98,
		lut: WaterColour.lut(color3(8 / 255, 46 / 255, 72 / 255), color3(28 / 255, 168 / 255, 156 / 255)),
		foamEnabled: true, foamTexels: 64, foamWhitecap: 0.35, foamGrow: 2, foamDecay: 0.86,
		foamThreshold: 0, foamFeather: 1.3, foamLace: 0.3, foamOpacity: 0.7, foamRoughness: 1,
		foamColour: [232, 228, 210], ringRoughness: [0.15, 0.2, 0.3], chop: 0.8,
		...overrides,
	};
}

function fieldBuffers() {
	return SIZES.map((size, i) => {
		const fields = FieldStore.newFields(N, size);
		for (let c = 0; c < N * N; c++) {
			fields.height[c] = Math.sin(c * 0.3 + i) * 3;
			fields.jxx[c] = Math.cos(c * 0.17) * 0.6;
		}
		const packed = new Float32Array(FieldStore.bufferSize(N * N) / 4);
		FieldStore.pack(fields, packed);
		return packed.buffer;
	});
}

function run(role, overrides) {
	const replies = [];
	const handle = createPainterWorker((message, transfer) => replies.push({ message, transfer }));
	handle({ type: 'configure', config: config(role, overrides) });
	return { handle, replies };
}

test('the colour worker answers ready and paints a band of RGBA rows', () => {
	const { handle, replies } = run('colour');
	expect.equal(replies[0].message.type, 'ready', 'ready');
	const fields = fieldBuffers();
	handle({ type: 'paint', turn: 1, sequence: 1, t: 0, fields });
	const reply = replies[1].message;
	expect.equal(reply.slot, MapRotation.COLOUR, 'colour slot');
	expect.equal(reply.band, 1, 'band 1');
	expect.equal(reply.pixels.length, 512 * 128 * 4, 'one band of RGBA');
	expect.equal(reply.fields.length, 3, 'field buffers returned');
	expect.truthy(replies[1].transfer.includes(fields[0]), 'and transferred back');
	expect.truthy(Number.isFinite(reply.first) && Number.isFinite(reply.third), 'foam cover and colour ms');
	expect.equal(reply.roughness, undefined, 'no roughness before the last band');
});

test('band 4 with foam on also returns the coverage and one roughness map per ring', () => {
	const { handle, replies } = run('colour');
	for (let band = 1; band <= 4; band++) {
		handle({ type: 'paint', turn: band, sequence: band, t: 0, fields: fieldBuffers() });
	}
	const last = replies[4].message;
	expect.equal(last.band, 4, 'band 4');
	expect.equal(last.coverage.length, 64 * 64, 'coverage over the base texels');
	expect.equal(last.roughness.length, 3, 'one map per ring');
	expect.equal(last.roughness[0].length, 64 * 64 * 4, 'RGBA roughness');
});

test('with foam off band 4 sends no roughness', () => {
	const { handle, replies } = run('colour', { foamEnabled: false });
	for (let band = 1; band <= 4; band++) {
		handle({ type: 'paint', turn: band, sequence: band, t: 0, fields: fieldBuffers() });
	}
	expect.equal(replies[4].message.roughness, undefined, 'no roughness');
});

test('the maps worker paints the mask and the normal block', () => {
	const { handle, replies } = run('maps');
	const coverage = new Float32Array(64 * 64);
	handle({ type: 'paint', turn: MapRotation.MASK, sequence: 1, t: 0, fields: fieldBuffers(), coverage });
	const mask = replies[1].message;
	expect.equal(mask.slot, MapRotation.MASK, 'mask slot');
	expect.equal(mask.pixels.length, 64 * 64 * 4, 'RGBA mask');
	expect.truthy(mask.first > 0, `running maximum found a crest: ${mask.first}`);
	handle({ type: 'paint', turn: MapRotation.NORMAL, sequence: 2, t: 0, fields: fieldBuffers(), coverage });
	expect.equal(replies[2].message.pixels.length, 32 * 32 * 4, 'RGBA normal block');
});

test('a paint with the wrong number of field buffers or an unknown role is refused', () => {
	const { handle } = run('colour');
	let message = '';
	try {
		handle({ type: 'paint', turn: 1, sequence: 1, t: 0, fields: fieldBuffers().slice(0, 2) });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('expected 3'), `field count error: ${message}`);
	let roleError = '';
	try {
		createPainterWorker(() => {})({ type: 'configure', config: config('sideways') });
	} catch (error) {
		roleError = error.message;
	}
	expect.truthy(roleError.includes('role'), `role error: ${roleError}`);
});
```

`tests/ocean/engine/painterClient.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as MapRotation from '../../../content/ocean/js/core/mapRotation.js';
import * as WaterColour from '../../../content/ocean/js/core/waterColour.js';
import { color3 } from '../../../content/ocean/js/core/luau.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';
import * as PainterClient from '../../../content/ocean/js/engine/painterClient.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const N = 16;
const SIZES = [256, 64, 16];

function mapsConfig() {
	const { mask, colour, normal } = PainterClient.cascades(3);
	return {
		role: 'maps', n: N, sizes: SIZES, texels: 64, colourTexels: 512, bandRows: 128, tile: 256,
		blockTexels: 32, blockStuds: 64, imageTexels: 64,
		maskCascades: mask, colourCascades: colour, normalCascades: normal,
		peak: 10.3, tint: 0.35, gamma: 0.8, decay: 0.98,
		lut: WaterColour.lut(color3(0.1, 0.2, 0.3), color3(0.2, 0.6, 0.6)),
		foamEnabled: true, foamTexels: 64, foamWhitecap: 0.35, foamGrow: 2, foamDecay: 0.86,
		foamThreshold: 0, foamFeather: 1.3, foamLace: 0.3, foamOpacity: 0.7, foamRoughness: 1,
		foamColour: [232, 228, 210], ringRoughness: [0.15, 0.2, 0.3], chop: 0.8,
	};
}

function harness(spawn) {
	const uploads = [];
	const warnings = [];
	const stage = { paint: 0, upload: 0 };
	const store = FieldStore.create(N, SIZES);
	const painter = PainterClient.create({
		config: mapsConfig(),
		spawn: spawn ?? (() => createInProcessWorker(createPainterWorker)),
		sink: {
			uploadColourBand: (band, pixels) => uploads.push(`colour${band}:${pixels.length}`),
			uploadMaskOrNormal: (slot, pixels) => uploads.push(`${slot === MapRotation.MASK ? 'mask' : 'normal'}:${pixels.length}`),
			uploadRoughness: (ring, pixels) => uploads.push(`rough${ring}:${pixels.length}`),
		},
		stage,
		log: { warn: (text) => warnings.push(text) },
	});
	return { painter, uploads, warnings, stage, store };
}

test('cascades gives the mask and colour every cascade and the normal map all but the first', () => {
	const { mask, colour, normal } = PainterClient.cascades(3);
	expect.equal(mask.join(','), '1,2,3', 'mask');
	expect.equal(colour.join(','), '1,2,3', 'colour');
	expect.equal(normal.join(','), '2,3', 'normal');
});

test('both painters must be ready; then colour bands rotate 1..4 and maps alternate mask and normal', async () => {
	const { painter, uploads, store } = harness();
	PainterClient.step(painter, 1, 0, store);
	expect.equal(uploads.length, 0, 'nothing before ready');
	await flush();
	expect.equal(PainterClient.ready(painter), true, 'ready');
	for (let frame = 2; frame <= 9; frame++) {
		PainterClient.step(painter, frame, 0, store);
		await flush();
	}
	const colours = uploads.filter((u) => u.startsWith('colour')).map((u) => u.split(':')[0]);
	expect.equal(colours.slice(0, 5).join(','), 'colour1,colour2,colour3,colour4,colour1', 'band rotation');
	const maps = uploads.filter((u) => u.startsWith('mask') || u.startsWith('normal')).map((u) => u.split(':')[0]);
	expect.equal(maps.slice(0, 4).join(','), 'mask,normal,mask,normal', 'maps rotation');
	expect.equal(uploads.filter((u) => u.startsWith('rough')).length >= 3, true, 'one roughness map per ring after band 4');
});

test('a paint still in flight is skipped and counted', async () => {
	const { painter, store } = harness();
	await flush();
	PainterClient.step(painter, 2, 0, store);
	PainterClient.step(painter, 3, 0, store);
	const report = PainterClient.report(painter);
	expect.truthy(report.skipped >= 2, `skipped counted: ${report.skipped}`);
});

test('a silent painter has its pending paint dropped after the timeout, warned once', async () => {
	const silent = () => {
		const worker = { onmessage: null, onerror: null, terminate() {} };
		worker.postMessage = (message) => {
			if (message.type === 'configure') queueMicrotask(() => worker.onmessage({ data: { type: 'ready' } }));
		};
		return worker;
	};
	const { painter, warnings, store } = harness(silent);
	await flush();
	for (let frame = 1; frame <= 70; frame++) PainterClient.step(painter, frame, 0, store);
	expect.equal(warnings.filter((w) => w.includes('colour painter silent')).length, 1, 'colour warned once');
	expect.equal(warnings.filter((w) => w.includes('maps painter silent')).length, 1, 'maps warned once');
});

test('a reply with a stale sequence is dropped and counted', async () => {
	// The first pixels reply comes back numbered one below the paint it answers, as a reply to an
	// earlier, dropped paint would.
	const staling = () => {
		const inner = createInProcessWorker(createPainterWorker);
		const worker = { onmessage: null, onerror: null, terminate() {}, postMessage: (m, t) => inner.postMessage(m, t) };
		let first = true;
		inner.onmessage = (event) => {
			if (event.data.type === 'pixels' && first) {
				first = false;
				worker.onmessage({ data: { ...event.data, sequence: event.data.sequence - 1 } });
				return;
			}
			worker.onmessage(event);
		};
		return worker;
	};
	const { painter, store } = harness(staling);
	await flush();
	PainterClient.step(painter, 2, 0, store);
	await flush();
	PainterClient.step(painter, 3, 0, store);
	await flush();
	expect.truthy(PainterClient.report(painter).stale >= 1, 'stale reply counted');
});

test('a spawn that throws paints on the main thread instead (Review Focus 1)', async () => {
	const { painter, uploads, store } = harness(() => {
		throw new Error('no module workers');
	});
	expect.equal(PainterClient.mode(painter), 'main-thread', 'fell back');
	expect.truthy(PainterClient.fallbackReason(painter).includes('no module workers'), 'reason');
	await flush();
	PainterClient.step(painter, 2, 0, store);
	await flush();
	expect.truthy(uploads.length > 0, 'still paints');
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test tests/ocean/engine/painterWorkerCore.test.js tests/ocean/engine/painterClient.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Port `PainterWorker.client.luau` into `painterWorkerCore.js`**

Keep the Configure branch (role check with a message containing "role"; the colour state with `FoamField.newGrid(foamTexels, tile)`, `FoamPaint.lace(colourTexels, 64, 11, 4, 0.7)`, the step and paint params, `threshold = foamEnabled ? foamThreshold : 2`, `opacity` clamped 0..1, the base (RGB, `texels * texels * 3`), one band of RGBA, the coverage `Float32Array(texels * texels)`, one RGBA roughness map per ring; the maps state with the mask, the normal block and the coverage mirror `{ texels, foam: Float32Array(texels * texels), scratch: new Float32Array(0) }`), `paintColour` (unpack every field buffer into the worker's own `FieldStore.newFields`, the foam quarter step at `(band - 1) * quarterRows` with the running quarter means, `WaterColour.base` on band 1 only, `FoamPaint.band`, the roughness fill on band 4 when foam is on) and `paintMaps` (the coverage copy into the mirror when foam is on, `PeakMask.fill` then `PeakMask.nextMax`, or `NormalTexels.fill`). The field-count check throws ``Paint carried ${count} field buffers, expected ${sizes.length}``. Every reply `post`s with the field `ArrayBuffer`s in its transfer list and returns them as `fields`; pixels, coverage and roughness are sent as copies (`.slice()`), because the worker keeps writing into its own. `painter.worker.js` is the three-line entry point, the same shape as `cascade.worker.js`.

- [ ] **Step 4: Port `Painter.luau` into `painterClient.js`**

Keep `Painter.cascades`, the two roles (the colour config is a clone of the maps config with `role: 'colour'`), the ready count (two), the configure timeout re-send (`CONFIGURE_TIMEOUT_FRAMES`, warned once), `sendColour` and `sendMaps` (pending flags, `skipped`, the `PAINT_TIMEOUT_FRAMES` drop warned once with the texts `colour painter silent` and `maps painter silent`, `MapRotation.band` and `MapRotation.mapsSlot`, the normal slot skipped when `normalCascades` is empty), the `Pixels` handler (sequence check with `stale`, uploads through `painter.sink` charged to `stage.upload`, the coverage copy on band 4, `cycleColour`/`cycleMaps`) and `report` (per window, then reset). Per-frame packing: pack `store.display` into the client's own per-cascade `Float32Array`s only when a paint will be sent, and send their `ArrayBuffer`s transferred; when a reply returns them (`fields`), keep those as the client's buffers again. Because two painters may both be sent the same frame, keep one set of buffers per role. If `spawn` throws, or a painter reports an error, switch both roles to `createInProcessWorker(createPainterWorker)` with the reason kept and warned once. A `null` sink drops pixels (count them in a `dropped` field on the report).

- [ ] **Step 5: Run and watch them pass**

Run: `node --test tests/ocean/engine/painterWorkerCore.test.js tests/ocean/engine/painterClient.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add content/ocean/js/workers/painterWorkerCore.js content/ocean/js/workers/painter.worker.js content/ocean/js/engine/painterClient.js tests/ocean/engine/painterWorkerCore.test.js tests/ocean/engine/painterClient.test.js
git commit -m "feat: the painter worker and its client, twins of the Roblox Painter"
```

---

### Task 5: The ocean coordinator

**Files:**
- Create: `content/ocean/js/engine/ocean.js`
- Test: `tests/ocean/engine/ocean.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1 to 4; A1 `core/cascade.js`, `core/fft.js`, `core/fieldStore.js`, `core/oceanClock.js`, `core/ringLayout.js`, `core/swells.js`, `core/tier.js`, `core/waterColour.js`, `core/waveField.js`, `core/scatterLobe.js`, `core/luau.js`.
- Produces (`ocean.js`):
  - `probeCascadeMs() -> number` (the Luau `probeCascadeMs`: one High-lattice cascade, median of three runs).
  - `create(config, { spawnCascade(index), spawnPainter(role), now() -> seconds, probeMs?, log? }) -> Ocean`. `Ocean` holds `config, tierName, preset, layout, bounds, store, swells, surface, horizon, cascades, painter, strengths: Float32Array(patchCount + quadCount), frame, sink` (the sink starts `null`).
  - `attachSink(ocean, sink)` (sets it on the painter too).
  - `step(ocean, dtSeconds, focus, eye, sun)` with `focus` `[x, z]`, `eye` `[x, y, z]`, `sun` `[x, y, z]` (unit vector towards the sun).
  - `status(ocean) -> { frame, t, tier, mode, fallbackReason, workersReady, painterReady, patches, vertices, sinkAttached }` (`mode` is `'workers'` only when both the cascades and the painter use workers).
  - `report(ocean) -> object | null`: the last complete window (every `REPORT_EVERY_FRAMES` frames), with the Luau report line's fields: `frame, t, evolveMs, blendMs, blend, snapMs, snaps, writeMs, horizonMs, paintMs, uploadMs, strengthMs, paintSkipped, paintStale, cycleFrames, maskMax, foamMs, foamCover, colourMs, maxY, maxLateral, cascadeMs` (the workers' mean evolve time); `null` before the first window.

- [ ] **Step 1: Write the failing tests**

`tests/ocean/engine/ocean.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';
import * as Ocean from '../../../content/ocean/js/engine/ocean.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const SUN = [-0.9526530504226685, 0.2821884751319885, 0.11323313415050507];

function recordingSink() {
	const counts = { colour: 0, maskOrNormal: 0, roughness: 0 };
	return {
		counts,
		uploadColourBand: () => { counts.colour += 1; },
		uploadMaskOrNormal: () => { counts.maskOrNormal += 1; },
		uploadRoughness: () => { counts.roughness += 1; },
	};
}

function build(query = '?tier=Low', deps = {}) {
	let clock = 0;
	const ocean = Ocean.create(readConfig(query), {
		spawnCascade: () => createInProcessWorker(createCascadeWorker),
		spawnPainter: () => createInProcessWorker(createPainterWorker),
		now: () => clock,
		log: { warn() {} },
		...deps,
	});
	const sink = recordingSink();
	Ocean.attachSink(ocean, sink);
	const advance = async (frames, dt = 1 / 60) => {
		for (let i = 0; i < frames; i++) {
			clock += dt;
			Ocean.step(ocean, dt, [0, 0], [0, 14, 40], SUN);
			await flush();
		}
	};
	return { ocean, sink, advance, setClock: (value) => { clock = value; } };
}

function everyPositionFinite(ocean) {
	return ocean.surface.patches.every((p) => p.positions.every(Number.isFinite) && p.normals.every(Number.isFinite));
}

test('workers come up, fields arrive and the surface moves', async () => {
	const { ocean, advance } = build();
	await advance(12);
	const status = Ocean.status(ocean);
	expect.equal(status.mode, 'workers', 'workers');
	expect.equal(status.workersReady, ocean.preset.sizes.length, 'every cascade worker ready');
	expect.equal(status.painterReady, true, 'painters ready');
	expect.truthy(ocean.surface.patches.some((p) => p.positions.some((v, i) => i % 3 === 1 && v !== 0 && v !== ocean.surface.skirtY)), 'a vertex left sea level');
	expect.truthy(everyPositionFinite(ocean), 'finite');
});

test('the cross-fade settles at a mean of two thirds when every result arrives in time', async () => {
	const { ocean, advance } = build();
	await advance(Ocean.REPORT_WINDOW * 2);
	const report = Ocean.report(ocean);
	expect.truthy(report !== null, 'a report window completed');
	expect.near(report.blend, 0.67, 0.02, 'blend mean');
	expect.truthy(report.writeMs > 0 && Number.isFinite(report.cascadeMs), 'stage timings present');
});

test('the painter fills every map through the sink', async () => {
	const { ocean, sink, advance } = build();
	await advance(30);
	expect.truthy(sink.counts.colour >= 4, `colour bands: ${sink.counts.colour}`);
	expect.truthy(sink.counts.maskOrNormal >= 2, `mask and normal: ${sink.counts.maskOrNormal}`);
	expect.truthy(sink.counts.roughness >= ocean.preset.rings.length, `roughness maps: ${sink.counts.roughness}`);
});

test('strengths hold one finite glow per patch and quad', async () => {
	const { ocean, advance } = build();
	await advance(5);
	expect.equal(ocean.strengths.length, ocean.surface.patches.length + ocean.horizon.quads.length, 'length');
	expect.truthy(ocean.strengths.every(Number.isFinite), 'finite');
	expect.truthy(ocean.strengths.some((s) => s > 0), 'some glow towards the sun');
});

test('workers off runs everything on the main thread (Review Focus 1)', async () => {
	const { ocean, advance } = build('?tier=Low&workers=0');
	await advance(12);
	const status = Ocean.status(ocean);
	expect.equal(status.mode, 'main-thread', 'main thread');
	expect.truthy(status.fallbackReason.includes('workers=0'), 'reason');
	expect.truthy(everyPositionFinite(ocean), 'finite');
});

test('a frozen clock evolves every cascade at the frozen time', async () => {
	const { ocean, advance } = build('?tier=Low&freeze=12');
	await advance(20);
	expect.equal(Ocean.status(ocean).t, 12, 'clock frozen');
	for (const slot of ocean.store.current) {
		if (slot.filled) expect.equal(slot.time, 12, 'result stamped 12');
	}
});

test('a hidden tab (a long gap, replies held back, then a flood) recovers without NaN (Review Focus 2)', async () => {
	const held = [];
	let holding = false;
	const holdingSpawn = (create) => () => {
		const inner = createInProcessWorker(create);
		const worker = { onmessage: null, onerror: null, terminate: () => inner.terminate(), postMessage: (m, t) => inner.postMessage(m, t) };
		inner.onmessage = (event) => (holding ? held.push(() => worker.onmessage(event)) : worker.onmessage(event));
		return worker;
	};
	const { ocean, advance } = build('?tier=Low', { spawnCascade: holdingSpawn(createCascadeWorker), spawnPainter: holdingSpawn(createPainterWorker) });
	await advance(12);
	holding = true;
	await advance(5);
	await advance(1, 45); // the tab comes back after 45 s: one huge dt
	holding = false;
	for (const deliver of held.splice(0)) deliver();
	await advance(90);
	expect.truthy(everyPositionFinite(ocean), 'finite after the flood');
	expect.equal(Ocean.status(ocean).painterReady, true, 'painters still ready');
	const before = ocean.store.promotedFrame.slice();
	await advance(6);
	expect.truthy(ocean.store.promotedFrame.some((f, i) => f > before[i]), 'cascades promoting again');
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `node --test tests/ocean/engine/ocean.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Port `OceanClient.client.luau` into `ocean.js`**

`create` mirrors the Luau set-up: `params` from the config; `bounds = { lateral: 8 + 6 * chop * scale + 2 * swellScale, height: 8 + 4 * scale + 2.5 * swellScale }`; the tier (`config.tier`, else `Tier.choose(deps.probeMs ?? probeCascadeMs())`); `RingLayout.build`, `FieldStore.create`, `WaveField.bands`; the swells from `SWELL_SPECS` with amplitudes times `swellScale` (the Gerstner-bank A/B is not ported); `SurfaceState.create`; `HorizonState.create(textureTile, outer ring halfExtent)`; the cascade configs (`seed = SEED * 7919 + index`, the band's `kMin/kMax`, `loopPeriod = LOOP_PERIOD`) through `createCascades` with `onFields = (index, packed, t) => FieldStore.receive(store, index, packed, t)`; the painter config exactly as the Luau `painterConfig` (MAP_TEXELS, COLOUR_TEXELS, BAND_ROWS, NORMAL_BLOCK_TEXELS, NORMAL_BLOCK_STUDS, NORMAL_IMAGE_TEXELS, `PainterClient.cascades(count)`, `lut = WaterColour.lut(color3(deep / 255), color3(subsurface / 255))`, the flattened foam knobs, `ringRoughness[ring] = roughness[min(ring, roughness.length)]`, `chop`), with the calibration overrides: `calibrate === 'map'` sets `normalCascades: [1], blockStuds: textureTile, blockTexels: NORMAL_IMAGE_TEXELS`; `calibrate === 'vertex'` sets `normalCascades: []`. `strengths` is a `Float32Array(patches + quads)`.

`step` mirrors the Luau `step`: `frame += 1`; `t = config.freeze ?? OceanClock.time(now(), LOOP_PERIOD)`; the rotation (`cascadeForFrame`, `promote` then `request`); the blend of every cascade with `fadeFraction` over `FieldStore.FIELD_NAMES` (summing cascade 1's fraction for the report); `PainterClient.step`; `SurfaceState.snapAndWrite(surface, focus[0], focus[1], store, swells, t, chop, frame)`; `HorizonState.update(horizon, outer centre)`; then the strengths: for each patch not hidden `ScatterLobe.strength(centre.x + patch.centreX, centre.z + patch.centreZ, eye…, sun…, config.scatter)` (hidden patches keep their last value), then each quad from `HorizonState.quadCentre`. Stage seconds as the Luau (`evolve, blend, snap, write, horizon, paint, upload, strength`), and every `REPORT_EVERY_FRAMES` frames build the report object (the Luau report line's numbers, with `cascadeMs` the mean of `cascades.lastMs`). Export `REPORT_WINDOW = REPORT_EVERY_FRAMES` for the tests. `dtSeconds` only feeds elapsed time for the report; it must never enter the maths (a 45 s gap must not be integrated into anything).

- [ ] **Step 4: Run and watch them pass**

Run: `node --test tests/ocean/engine/ocean.test.js`
Expected: PASS, 7 tests. (These run a few hundred frames at the Low tier; if the file takes over 60 s, report the time instead of shortening the windows.)

- [ ] **Step 5: Run everything and commit**

Run: `npm run test:ocean`

```bash
git add content/ocean/js/engine/ocean.js tests/ocean/engine/ocean.test.js
git commit -m "feat: the ocean coordinator, twin of the Roblox OceanClient frame loop"
```

---

### Task 6: Rendering the surface: scene, camera, meshes, main loop, stats

**Files:**
- Create: `content/ocean/js/render/lighting.js`, `content/ocean/js/render/scene.js`, `content/ocean/js/render/cameraRig.js`, `content/ocean/js/render/oceanMeshes.js`, `content/ocean/js/ui/perfReadout.js`
- Modify: `content/ocean/js/main.js`
- Test: `tests/ocean/e2e/ocean.spec.js`

**Interfaces:**
- Consumes: `engine/ocean.js` (`create`, `attachSink`, `step`, `status`, `report`, `probeCascadeMs`); `engine/config.js`; `engine/horizonState.js` (`CORNERS`, `TRIANGLES`, `QUAD`, `QUAD_Y`); `core/ringLayout.js` (`vertexIndex`).
- Produces:
  - `lighting.js`: the constants `SUN_DIRECTION`, `SUN_COLOUR`, `SUN_INTENSITY`, `SKY_AMBIENT`, `GROUND_AMBIENT`, `AMBIENT_INTENSITY`, `EXPOSURE`, `FOG_COLOUR`, `FOG_DENSITY`, `FIELD_OF_VIEW`, `CSS_FILTER`, `EMISSIVE_SCALE`, `NORMAL_SCALE_Y`, `SKY`, `MAX_PIXEL_RATIO`.
  - `scene.js`: `createScene(canvas) -> { renderer, scene, camera, resize(), render() }`.
  - `cameraRig.js`: `SHOTS`; `createCameraRig(camera, dom, config) -> { update(), focus(out) -> out[2], eye(out) -> out[3] }`.
  - `oceanMeshes.js`: `createOceanMeshes(scene, ocean, materials) -> { sync() }` where `materials` is `{ patchMaterials: Material[], quadMaterials: Material[] }` (in this task a stand-in; Task 7 passes the real ones).
  - `perfReadout.js`: `createPerfReadout(element) -> { frame(nowMs), show(status, report) }`.
  - `main.js`: exposes `window.__ocean = { status(), report(), camera }` for the browser tests.

- [ ] **Step 1: Write the failing browser test**

`tests/ocean/e2e/ocean.spec.js`:

```js
import { test, expect } from '@playwright/test';

async function ready(page) {
	await page.waitForFunction(() => {
		const s = window.__ocean?.status();
		return s && s.painterReady && s.workersReady > 0 && s.frame > 30;
	}, null, { timeout: 60_000 });
}

async function canvasVariance(page) {
	return page.evaluate(() => {
		const source = document.getElementById('ocean');
		const copy = document.createElement('canvas');
		copy.width = 64;
		copy.height = 36;
		const context = copy.getContext('2d');
		context.drawImage(source, 0, 0, 64, 36);
		const data = context.getImageData(0, 0, 64, 36).data;
		let sum = 0;
		let sumSquares = 0;
		for (let i = 0; i < data.length; i += 4) {
			const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
			sum += luminance;
			sumSquares += luminance * luminance;
		}
		const count = data.length / 4;
		return sumSquares / count - (sum / count) ** 2;
	});
}

test('the ocean starts, workers and painters come up, and the canvas shows something', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
	await page.goto('/ocean/?cam=deck');
	await ready(page);
	const status = await page.evaluate(() => window.__ocean.status());
	expect(status.mode).toBe('workers');
	expect(status.vertices).toBe(18144);
	expect(await canvasVariance(page)).toBeGreaterThan(20);
	expect(errors).toEqual([]);
});

test('workers off still renders on the main thread (Review Focus 1)', async ({ page }) => {
	await page.goto('/ocean/?workers=0&cam=deck');
	await ready(page);
	const status = await page.evaluate(() => window.__ocean.status());
	expect(status.mode).toBe('main-thread');
	expect(await canvasVariance(page)).toBeGreaterThan(20);
});

test('the canvas and camera follow a resize to phone portrait, pixel ratio capped (Review Focus 3)', async ({ page }) => {
	await page.goto('/ocean/?cam=deck');
	await ready(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.waitForFunction(() => document.getElementById('ocean').width === 390 * Math.min(window.devicePixelRatio, 2));
	const aspect = await page.evaluate(() => window.__ocean.camera.aspect);
	expect(aspect).toBeCloseTo(390 / 844, 3);
});

test('stats=1 shows the live numbers', async ({ page }) => {
	await page.goto('/ocean/?stats=1&cam=deck');
	await ready(page);
	await expect(page.locator('#stats')).toBeVisible();
	await expect(page.locator('#stats')).toContainText('fps');
	await expect(page.locator('#stats')).toContainText('workers');
});

test('the camera shots place the camera where the Studio captures stand', async ({ page }) => {
	await page.goto('/ocean/?cam=high&focus=origin');
	await ready(page);
	const position = await page.evaluate(() => window.__ocean.camera.position.toArray());
	[0, 110, 150].forEach((value, i) => expect(position[i]).toBeCloseTo(value, 6));
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npm run test:ocean:e2e -- ocean.spec.js`
Expected: FAIL (`window.__ocean` is undefined).

- [ ] **Step 3: Write `lighting.js`**

```js
// The Studio place's lighting, read from "SOT jonswap ocean" on 2026-09-28: Lighting Brightness 2.6,
// ClockTime 16.9, GeographicLatitude 30, Ambient (0.27, 0.33, 0.40), OutdoorAmbient (0.45, 0.52,
// 0.60), ExposureCompensation 0.1, sun direction (-0.953, 0.282, 0.113); Atmosphere Density 0.22,
// Offset 0.1, Color (0.74, 0.84, 0.90), Decay (0.55, 0.68, 0.78), Glare 0.35, Haze 0.6;
// ColorCorrection Contrast 0.08, Saturation 0.12; Bloom 0.55 / size 30 / threshold 2.2; SunRays 0.06;
// camera FieldOfView 70 (vertical, as Three.js). Three.js lights are not Roblox's: every intensity
// below is a starting point, tuned against Studio captures in the look-match task, which records
// the final values and why here.
export const SUN_DIRECTION = Object.freeze([-0.9526530504226685, 0.2821884751319885, 0.11323313415050507]);
export const SUN_COLOUR = Object.freeze([1, 0.96, 0.9]);
export const SUN_INTENSITY = 2.6;
export const SKY_AMBIENT = Object.freeze([0.45, 0.52, 0.6]);
export const GROUND_AMBIENT = Object.freeze([0.27, 0.33, 0.4]);
export const AMBIENT_INTENSITY = 1;
export const EXPOSURE = 2 ** 0.1;
export const FOG_COLOUR = Object.freeze([0.74, 0.84, 0.9]);
export const FOG_DENSITY = 0.00035;
export const FIELD_OF_VIEW = 70;
export const CSS_FILTER = 'contrast(1.08) saturate(1.12)';
// Roblox EmissiveStrength reaches about 30 on the brightest patch; Three.js emissive intensity is
// on another scale. Tuned in the look match.
export const EMISSIVE_SCALE = 0.05;
// The ripple normal map's green channel carries +z; whether Three.js reads it as +v or -v is decided
// by the calibration test in Task 7, which sets this to 1 or -1 and records the measurement.
export const NORMAL_SCALE_Y = 1;
export const SKY = Object.freeze({ turbidity: 4, rayleigh: 1.5, mieCoefficient: 0.005, mieDirectionalG: 0.8 });
export const MAX_PIXEL_RATIO = 2;
```

- [ ] **Step 4: Write `scene.js` and `cameraRig.js`**

`scene.js`:

```js
// The renderer, camera, sun, ambient light, sky and fog: the Studio place's Lighting and Atmosphere
// approximated in Three.js (values in lighting.js).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import * as Lighting from './lighting.js';

const srgb = (rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);

export function createScene(canvas) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = Lighting.EXPOSURE;
	canvas.style.filter = Lighting.CSS_FILTER;

	const scene = new THREE.Scene();
	scene.fog = new THREE.FogExp2(srgb(Lighting.FOG_COLOUR), Lighting.FOG_DENSITY);
	const camera = new THREE.PerspectiveCamera(Lighting.FIELD_OF_VIEW, 1, 0.5, 9000);

	const sunDirection = new THREE.Vector3(...Lighting.SUN_DIRECTION).normalize();
	const sun = new THREE.DirectionalLight(srgb(Lighting.SUN_COLOUR), Lighting.SUN_INTENSITY);
	sun.position.copy(sunDirection).multiplyScalar(1000);
	scene.add(sun, sun.target);
	scene.add(new THREE.HemisphereLight(srgb(Lighting.SKY_AMBIENT), srgb(Lighting.GROUND_AMBIENT), Lighting.AMBIENT_INTENSITY));

	const sky = new Sky();
	sky.scale.setScalar(8000);
	const uniforms = sky.material.uniforms;
	uniforms.turbidity.value = Lighting.SKY.turbidity;
	uniforms.rayleigh.value = Lighting.SKY.rayleigh;
	uniforms.mieCoefficient.value = Lighting.SKY.mieCoefficient;
	uniforms.mieDirectionalG.value = Lighting.SKY.mieDirectionalG;
	uniforms.sunPosition.value.copy(sunDirection);
	scene.add(sky);

	// Environment reflections from the same sky (Roblox EnvironmentSpecularScale 1).
	const pmrem = new THREE.PMREMGenerator(renderer);
	const environmentScene = new THREE.Scene();
	const environmentSky = new Sky();
	environmentSky.scale.setScalar(8000);
	Object.assign(environmentSky.material.uniforms, THREE.UniformsUtils.clone(uniforms));
	environmentScene.add(environmentSky);
	scene.environment = pmrem.fromScene(environmentScene).texture;
	pmrem.dispose();

	function resize() {
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, Lighting.MAX_PIXEL_RATIO));
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	}

	return {
		renderer,
		scene,
		camera,
		sunDirection: sunDirection.toArray(),
		resize,
		render: () => renderer.render(scene, camera),
	};
}
```

`cameraRig.js`:

```js
// The free camera (orbit and drag) and the fixed shots the Studio captures use. The rings follow
// what the camera looks at (its orbit target), never its position, as the Roblox rings follow
// Camera.Focus; focus=origin pins that point to (0, 0) the way the Edit-mode preview does.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const SHOTS = Object.freeze({
	orbit: Object.freeze({ position: [0, 30, 60], target: [0, 0, 0] }),
	deck: Object.freeze({ position: [0, 14, 40], target: [0, 2, -120] }),
	high: Object.freeze({ position: [0, 110, 150], target: [0, 0, -60] }),
	crest: Object.freeze({ position: [0, 5, 25], target: [0, 1, -15] }),
});

export function createCameraRig(camera, dom, config) {
	const shot = SHOTS[config.camera];
	camera.position.set(...shot.position);
	const controls = new OrbitControls(camera, dom);
	controls.target.set(...shot.target);
	controls.enableDamping = config.camera === 'orbit';
	controls.maxPolarAngle = Math.PI * 0.495;
	controls.minDistance = 4;
	controls.maxDistance = 2500;
	controls.update();
	return {
		update: () => controls.update(),
		focus(out) {
			out[0] = config.focusOrigin ? 0 : controls.target.x;
			out[1] = config.focusOrigin ? 0 : controls.target.z;
			return out;
		},
		eye(out) {
			out[0] = camera.position.x;
			out[1] = camera.position.y;
			out[2] = camera.position.z;
			return out;
		},
	};
}
```

- [ ] **Step 5: Write `oceanMeshes.js`**

```js
// One Three.js mesh per patch and per horizon quad, over the engine's own typed arrays: the
// position, normal and uv attributes ARE the Float32Arrays SurfaceSampler.fill writes, so the CPU
// write each frame is the whole vertex path (Roblox mode: no displacement shader). A mesh's
// vertices move every frame, so each gets an explicit bounding sphere large enough for the
// worst displacement the bounds allow, in place of the Roblox template's corner push-out.
import * as THREE from 'three';
import * as HorizonState from '../engine/horizonState.js';

function patchIndices(cells) {
	const perSide = cells + 1;
	const indices = [];
	for (let row = 0; row < cells; row++) {
		for (let column = 0; column < cells; column++) {
			const a = row * perSide + column;
			const b = a + 1;
			const c = a + perSide;
			const d = c + 1;
			indices.push(a, c, b, b, c, d);
		}
	}
	return indices;
}

function dynamic(array, itemSize) {
	const attribute = new THREE.BufferAttribute(array, itemSize);
	attribute.setUsage(THREE.DynamicDrawUsage);
	return attribute;
}

export function createOceanMeshes(scene, ocean, materials) {
	const { surface, horizon } = ocean;
	const cells = surface.layout.spec.patchCells;
	const indices = patchIndices(cells);
	const group = new THREE.Group();
	scene.add(group);

	const patchMeshes = surface.patches.map((state, i) => {
		const geometry = new THREE.BufferGeometry();
		geometry.setIndex(indices);
		geometry.setAttribute('position', dynamic(state.positions, 3));
		geometry.setAttribute('normal', dynamic(state.normals, 3));
		geometry.setAttribute('uv', dynamic(state.uvs, 2));
		const reach = state.half + surface.bounds.lateral;
		geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(reach, reach, surface.bounds.height));
		const mesh = new THREE.Mesh(geometry, materials.patchMaterials[i]);
		mesh.position.set(state.worldX, 0, state.worldZ);
		group.add(mesh);
		return mesh;
	});

	const quadPositions = new Float32Array(HorizonState.CORNERS.flatMap(([x, z]) => [x * horizon.half, 0, z * horizon.half]));
	const quadNormals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
	const quadMeshes = horizon.quads.map((quad, i) => {
		const geometry = new THREE.BufferGeometry();
		geometry.setIndex(HorizonState.TRIANGLES.flat());
		geometry.setAttribute('position', new THREE.BufferAttribute(quadPositions, 3));
		geometry.setAttribute('normal', new THREE.BufferAttribute(quadNormals, 3));
		geometry.setAttribute('uv', dynamic(quad.uvs, 2));
		geometry.computeBoundingSphere();
		const mesh = new THREE.Mesh(geometry, materials.quadMaterials[i]);
		mesh.position.set(quad.worldX, HorizonState.QUAD_Y, quad.worldZ);
		group.add(mesh);
		return mesh;
	});

	function sync() {
		const flat = surface.flatNormals;
		surface.patches.forEach((state, i) => {
			const mesh = patchMeshes[i];
			mesh.visible = !state.hidden;
			if (state.written) {
				mesh.geometry.attributes.position.needsUpdate = true;
				if (!flat) mesh.geometry.attributes.normal.needsUpdate = true;
				state.written = false;
			}
			if (state.uvsChanged) {
				mesh.geometry.attributes.uv.needsUpdate = true;
				mesh.position.set(state.worldX, 0, state.worldZ);
				state.uvsChanged = false;
			}
		});
		horizon.quads.forEach((quad, i) => {
			if (quad.uvsChanged) {
				quadMeshes[i].geometry.attributes.uv.needsUpdate = true;
				quadMeshes[i].position.set(quad.worldX, HorizonState.QUAD_Y, quad.worldZ);
				quad.uvsChanged = false;
			}
		});
	}

	return { sync, patchMeshes, quadMeshes };
}
```

Check the winding once: with `(a, c, b)` a triangle's normal `(c - a) × (b - a)` points +Y for increasing column (+x) and row (+z), which is Three.js's front face, the same order as `Surface.luau`'s `{ a, c, b }`. If the surface renders only from below, the winding is inverted: report it rather than switching to `DoubleSide`.

- [ ] **Step 6: Write `perfReadout.js` and extend `main.js`**

`perfReadout.js`:

```js
// The live numbers: frames per second measured here, the ocean's status, and its last report
// window (the Roblox report line's fields). Hidden unless ?stats=1.
export function createPerfReadout(element) {
	const times = [];
	let lastText = '';
	return {
		frame(nowMs) {
			times.push(nowMs);
			while (times.length > 0 && nowMs - times[0] > 1000) times.shift();
		},
		show(status, report) {
			const fps = times.length;
			const lines = [
				`fps ${fps}  frame ${status.frame}  tier ${status.tier}  vertices ${status.vertices}`,
				`${status.mode === 'workers' ? 'workers' : `main thread (${status.fallbackReason})`}  cascades ready ${status.workersReady}  painter ${status.painterReady ? 'ready' : 'starting'}`,
			];
			if (report) {
				lines.push(
					`write ${report.writeMs.toFixed(2)} ms  blend ${report.blendMs.toFixed(2)} ms (${report.blend.toFixed(2)})  paint ${report.paintMs.toFixed(2)} ms  upload ${report.uploadMs.toFixed(2)} ms  glow ${report.strengthMs.toFixed(2)} ms`,
					`workers: cascade ${report.cascadeMs.toFixed(2)} ms  colour ${report.colourMs.toFixed(2)} ms  foam ${report.foamMs.toFixed(2)} ms (cover ${report.foamCover.toFixed(3)})`,
				);
			}
			const text = lines.join('\n');
			if (text !== lastText) {
				element.textContent = text;
				lastText = text;
			}
		},
	};
}
```

`main.js` gains, after the WebGL check (keep `webglSupported` and the notice):

```js
import * as Ocean from './engine/ocean.js';
import { createScene } from './render/scene.js';
import { createCameraRig } from './render/cameraRig.js';
import { createOceanMeshes } from './render/oceanMeshes.js';
import { createPerfReadout } from './ui/perfReadout.js';
import * as THREE from 'three';

function start(config) {
	const canvas = document.getElementById('ocean');
	const view = createScene(canvas);
	const rig = createCameraRig(view.camera, canvas, config);
	const ocean = Ocean.create(config, {
		spawnCascade: () => new Worker(new URL('./workers/cascade.worker.js', import.meta.url), { type: 'module' }),
		spawnPainter: () => new Worker(new URL('./workers/painter.worker.js', import.meta.url), { type: 'module' }),
		now: () => performance.now() / 1000,
	});
	// Task 7 replaces this stand-in with the painted materials.
	const plain = new THREE.MeshStandardMaterial({ color: 0x1e5b78, roughness: 0.4 });
	const materials = {
		patchMaterials: ocean.surface.patches.map(() => plain),
		quadMaterials: ocean.horizon.quads.map(() => plain),
		sink: { uploadColourBand() {}, uploadMaskOrNormal() {}, uploadRoughness() {} },
	};
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
	window.__ocean = { status: () => Ocean.status(ocean), report: () => Ocean.report(ocean), camera: view.camera };

	function frame(now) {
		const dt = (now - last) / 1000;
		last = now;
		rig.update();
		Ocean.step(ocean, dt, rig.focus(focus), rig.eye(eye), view.sunDirection);
		meshes.sync();
		view.render();
		readout.frame(now);
		if (config.stats) readout.show(Ocean.status(ocean), Ocean.report(ocean));
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);
}

if (webglSupported()) {
	start(config);
}
```

(Move the existing `if (!webglSupported()) showNotice(...)` into an `else` branch of that final `if`.)

- [ ] **Step 7: Run the browser tests and watch them pass**

Run: `npm run test:ocean:e2e`
Expected: PASS, 7 tests (2 from Task 1, 5 here). If the variance threshold (20) fails on a correctly rendering page under SwiftShader, report the measured value rather than lowering it silently.

- [ ] **Step 8: Commit**

```bash
git add content/ocean/js/render/lighting.js content/ocean/js/render/scene.js content/ocean/js/render/cameraRig.js content/ocean/js/render/oceanMeshes.js content/ocean/js/ui/perfReadout.js content/ocean/js/main.js tests/ocean/e2e/ocean.spec.js
git commit -m "feat: render the Roblox-mode surface: scene, camera shots, CPU-written meshes, stats"
```

---

### Task 7: Painted materials, glow, and the normal-map calibration

**Files:**
- Create: `content/ocean/js/render/materials.js`
- Modify: `content/ocean/js/main.js` (use the real materials), `content/ocean/js/render/lighting.js` (`NORMAL_SCALE_Y` from the calibration)
- Test: `tests/ocean/e2e/materials.spec.js`

**Interfaces:**
- Consumes: `engine/config.js` (texel constants); `core/foamRoughness.js`, `core/normalTexels.js`, `core/mapRotation.js`; `render/lighting.js`; the `Ocean` from Task 5.
- Produces (`materials.js`): `createMaterials(ocean, renderer) -> { patchMaterials, quadMaterials, sink: { uploadColourBand(band, pixels), uploadMaskOrNormal(slot, pixels), uploadRoughness(ring, pixels) }, applyStrengths(strengths), textures: { colour, mask, normal, roughness } }`.

- [ ] **Step 1: Write the failing browser tests**

`tests/ocean/e2e/materials.spec.js`:

```js
import { test, expect } from '@playwright/test';

async function settle(page, url) {
	await page.goto(url);
	await page.waitForFunction(() => {
		const s = window.__ocean?.status();
		return s && s.painterReady && s.frame > 120;
	}, null, { timeout: 90_000 });
}

async function luminanceGrid(page) {
	return page.evaluate(() => {
		const source = document.getElementById('ocean');
		const copy = document.createElement('canvas');
		copy.width = 48;
		copy.height = 27;
		const context = copy.getContext('2d');
		context.drawImage(source, 0, 0, 48, 27);
		const data = context.getImageData(0, 0, 48, 27).data;
		const grid = [];
		for (let i = 0; i < data.length; i += 4) grid.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
		return grid;
	});
}

function correlation(a, b) {
	const n = a.length;
	const ma = a.reduce((s, v) => s + v, 0) / n;
	const mb = b.reduce((s, v) => s + v, 0) / n;
	let num = 0;
	let da = 0;
	let db = 0;
	for (let i = 0; i < n; i++) {
		num += (a[i] - ma) * (b[i] - mb);
		da += (a[i] - ma) ** 2;
		db += (b[i] - mb) ** 2;
	}
	return num / Math.sqrt(da * db);
}

test('the painted maps reach the textures and the glow reaches the materials', async ({ page }) => {
	await settle(page, '/ocean/?freeze=12&cam=deck&focus=origin&hud=0');
	const probe = await page.evaluate(() => window.__ocean.materialsProbe());
	expect(probe.colourUploads).toBeGreaterThanOrEqual(4);
	expect(probe.maskUploads).toBeGreaterThanOrEqual(1);
	expect(probe.normalUploads).toBeGreaterThanOrEqual(1);
	expect(probe.roughnessUploads).toBeGreaterThanOrEqual(5);
	expect(probe.maxEmissiveIntensity).toBeGreaterThan(0);
	expect(probe.distinctColourTexels).toBeGreaterThan(8);
});

test('the normal map lights the same side of a slope as the vertex normals (calibration)', async ({ page }) => {
	await settle(page, '/ocean/?freeze=12&cam=high&focus=origin&hud=0&calibrate=vertex');
	const vertex = await luminanceGrid(page);
	await settle(page, '/ocean/?freeze=12&cam=high&focus=origin&hud=0&calibrate=map');
	const map = await luminanceGrid(page);
	const r = correlation(vertex, map);
	console.log(`[calibration] luminance correlation vertex vs map: ${r.toFixed(3)}`);
	expect(r).toBeGreaterThan(0.5);
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm run test:ocean:e2e -- materials.spec.js`
Expected: FAIL (`materialsProbe` is not a function).

- [ ] **Step 3: Write `materials.js`**

Port `Materials.luau` to Three.js:

```js
// Twin of Materials.luau: one image set shared by every surface material, one material per patch
// and per horizon quad (232 on the High tier), each with its own emissive intensity from the glow
// lobe. The images are data textures the CPU rewrites: the colour map a band of rows at a time, the
// mask and the normal image whole, one roughness map per ring. They start at resting contents
// (deep water, an empty mask, a flat normal, the ring's base roughness) so nothing renders white
// before the painter's first pixels land.
import * as THREE from 'three';
import * as FoamRoughness from '../core/foamRoughness.js';
import * as MapRotation from '../core/mapRotation.js';
import * as NormalTexels from '../core/normalTexels.js';
import { BAND_ROWS, COLOUR_TEXELS, MAP_TEXELS, NORMAL_IMAGE_TEXELS } from '../engine/config.js';
import * as Lighting from './lighting.js';

function dataTexture(texels, fill, colourSpace, anisotropy) {
	const data = new Uint8Array(texels * texels * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = fill[0];
		data[i + 1] = fill[1];
		data[i + 2] = fill[2];
		data[i + 3] = 255;
	}
	const texture = new THREE.DataTexture(data, texels, texels, THREE.RGBAFormat);
	texture.colorSpace = colourSpace;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.anisotropy = anisotropy;
	texture.needsUpdate = true;
	return texture;
}

export function createMaterials(ocean, renderer) {
	const { config, preset } = ocean;
	const anisotropy = renderer.capabilities.getMaxAnisotropy();
	const colour = dataTexture(COLOUR_TEXELS, config.deep, THREE.SRGBColorSpace, anisotropy);
	const mask = dataTexture(MAP_TEXELS, [0, 0, 0], THREE.NoColorSpace, anisotropy);
	const normal = dataTexture(NORMAL_IMAGE_TEXELS, [128, 128, 255], THREE.NoColorSpace, anisotropy);
	const coverage = new Float32Array(MAP_TEXELS * MAP_TEXELS);
	const ringCount = preset.rings.length;
	const roughness = Array.from({ length: ringCount }, (_, i) => {
		const base = config.roughness[Math.min(i + 1, config.roughness.length) - 1];
		const texture = dataTexture(MAP_TEXELS, [0, 0, 0], THREE.NoColorSpace, anisotropy);
		FoamRoughness.fill(texture.image.data, MAP_TEXELS, coverage, base, base);
		texture.needsUpdate = true;
		return texture;
	});
	const emissive = new THREE.Color().setRGB(config.subsurface[0] / 255, config.subsurface[1] / 255, config.subsurface[2] / 255, THREE.SRGBColorSpace);
	const normalScale = new THREE.Vector2(1, Lighting.NORMAL_SCALE_Y);
	const make = (ring) =>
		new THREE.MeshStandardMaterial({
			map: colour,
			normalMap: normal,
			normalScale,
			roughnessMap: roughness[ring - 1],
			roughness: 1,
			metalness: 0,
			emissive,
			emissiveMap: mask,
			emissiveIntensity: 0,
		});
	const patchMaterials = ocean.surface.patches.map((state) => make(state.ring));
	const quadMaterials = ocean.horizon.quads.map(() => make(ringCount));
	const counts = { colour: 0, mask: 0, normal: 0, roughness: 0 };

	const sink = {
		uploadColourBand(band, pixels) {
			colour.image.data.set(pixels, (band - 1) * BAND_ROWS * COLOUR_TEXELS * 4);
			colour.needsUpdate = true;
			counts.colour += 1;
		},
		uploadMaskOrNormal(slot, pixels) {
			if (slot === MapRotation.MASK) {
				mask.image.data.set(pixels);
				mask.needsUpdate = true;
				counts.mask += 1;
			} else if (slot === MapRotation.NORMAL) {
				const blockTexels = Math.round(Math.sqrt(pixels.length / 4));
				if (blockTexels === NORMAL_IMAGE_TEXELS) {
					normal.image.data.set(pixels);
				} else {
					NormalTexels.tile(pixels, blockTexels, normal.image.data, NORMAL_IMAGE_TEXELS);
				}
				normal.needsUpdate = true;
				counts.normal += 1;
			} else {
				throw new Error(`uploadMaskOrNormal was given an unknown map slot: ${slot}`);
			}
		},
		uploadRoughness(ring, pixels) {
			roughness[ring - 1].image.data.set(pixels);
			roughness[ring - 1].needsUpdate = true;
			counts.roughness += 1;
		},
	};

	function applyStrengths(strengths) {
		const patchCount = patchMaterials.length;
		for (let i = 0; i < patchCount; i++) patchMaterials[i].emissiveIntensity = strengths[i] * Lighting.EMISSIVE_SCALE;
		for (let i = 0; i < quadMaterials.length; i++) quadMaterials[i].emissiveIntensity = strengths[patchCount + i] * Lighting.EMISSIVE_SCALE;
	}

	function probe() {
		const data = colour.image.data;
		const distinct = new Set();
		for (let i = 0; i < data.length; i += 4 * 97) distinct.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
		return {
			colourUploads: counts.colour,
			maskUploads: counts.mask,
			normalUploads: counts.normal,
			roughnessUploads: counts.roughness,
			maxEmissiveIntensity: Math.max(...patchMaterials.map((m) => m.emissiveIntensity)),
			distinctColourTexels: distinct.size,
		};
	}

	return { patchMaterials, quadMaterials, sink, applyStrengths, probe, textures: { colour, mask, normal, roughness } };
}
```

The normal block is 128 texels except under `?calibrate=map`, where the painter paints the whole 512-texel image and the upload copies it straight; the block size is read from the pixel count, so no constant is needed here.

- [ ] **Step 4: Use the real materials in `main.js`**

Replace the stand-in: `const materials = createMaterials(ocean, view.renderer); Ocean.attachSink(ocean, materials.sink);`, call `materials.applyStrengths(ocean.strengths)` after each `Ocean.step`, and extend `window.__ocean` with `materialsProbe: () => materials.probe()`.

- [ ] **Step 5: Run the tests; settle the normal map's orientation**

Run: `npm run test:ocean:e2e -- materials.spec.js`

The first test must pass as written. For the calibration test, read the logged correlation:
- above 0.5: the orientation is right; keep `NORMAL_SCALE_Y = 1`.
- below -0.5: the green channel is read the wrong way round; set `NORMAL_SCALE_Y = -1` in `lighting.js`, re-run, and expect above 0.5.
- between -0.5 and 0.5 either way: the x channel may be flipped too, or the calibration builds differ in more than the normal path. Stop and report both correlations and a screenshot of each mode (`page.screenshot`) to the task report; do not tune past this.

Record the measured correlation(s) and the chosen sign in the `NORMAL_SCALE_Y` comment in `lighting.js`.

- [ ] **Step 6: Run everything and commit**

Run: `npm run test:ocean` and `npm run test:ocean:e2e`
Expected: all pass (e2e: 9 tests).

```bash
git add content/ocean/js/render/materials.js content/ocean/js/render/lighting.js content/ocean/js/main.js tests/ocean/e2e/materials.spec.js
git commit -m "feat: painted materials, per-patch glow and the normal-map calibration"
```

---

### Task 8: Look match against Studio, and Cole's check (controller-run)

This task is run by the controller, not an implementer subagent: it needs the Roblox Studio MCP and Cole.

**Files:**
- Create: `scripts/ocean-capture.mjs`
- Modify: `content/ocean/js/render/lighting.js` (tuned values, with the reasons in its comments)
- Modify: `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md` (status line)

**Interfaces:**
- Consumes: the page from Tasks 1 to 7; `roblox-ocean/scripts/m2_preview.py` and the Studio place "SOT jonswap ocean".
- Produces: web and Studio captures at the same three cameras, a tuned `lighting.js`, Cole's verdict recorded.

- [ ] **Step 1: Write the capture script**

`scripts/ocean-capture.mjs`:

```js
// Screenshots the ocean page at the three Studio camera shots, frozen at t = 12 with the rings
// pinned to the origin as the Edit-mode preview pins them, at Studio's 1366 x 767 viewport.
// Usage: node scripts/ocean-capture.mjs <out-dir> [extra query, e.g. "scale=4&whitecap=0.55"]
// Needs the page served on :8767 (npm run serve:ocean).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = 'capture', extra = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 767 } });
for (const cam of ['deck', 'high', 'crest']) {
	const query = `?freeze=12&cam=${cam}&focus=origin&hud=0${extra ? `&${extra}` : ''}`;
	await page.goto(`http://localhost:8767/ocean/${query}`);
	await page.waitForFunction(() => {
		const s = window.__ocean?.status();
		return s && s.painterReady && s.frame > 150;
	}, null, { timeout: 120_000 });
	const file = join(outDir, `web-${cam}.png`);
	await page.screenshot({ path: file });
	console.log(`wrote ${file}`);
}
await browser.close();
```

- [ ] **Step 2: Capture both sides**

- Web: `npm run serve:ocean` (detached) and `node scripts/ocean-capture.mjs <scratchpad>/look-1`.
- Studio: `python3 /Users/cole/Projects/roblox-ocean/scripts/m2_preview.py`, then through the MCP in Edit: build with the same sea (`{ time = 12, wind = 12, isotropy = 0.4, materials = true }`), `screen_capture` at deck `[0,14,40]→[0,2,-120]`, high `[0,110,150]→[0,0,-60]` and crest `[0,5,25]→[0,1,-15]`, then destroy `Workspace.OceanPreview`.

- [ ] **Step 3: Compare and tune, at most three rounds**

Put each pair side by side. Judge what differs first (colour of the water, crest tint, glow strength and where it sits, foam amount and texture, specular shine, sky and horizon haze, overall exposure), change the matching constants in `lighting.js` (one or two per round), re-capture the web side. The waves themselves differ (different random generator: spec 4.6), so compare character, not individual crests. Stop after three rounds or when nothing important differs; write the final values and the reason for each change into `lighting.js`'s comments.

- [ ] **Step 4: Cole's check**

Tell Cole in one line what he is looking at (the Roblox ocean running in his browser, Roblox mode, not the final page), give him `npm run serve:ocean` and the URL `http://localhost:8767/ocean/?stats=1`, and ask for: a verdict against the Roblox version, a deck and a high screenshot, and the fps line from the stats box. Record his verdict, the fps and his machine in the spec status line. If he rejects the look, the next step is a look-fix plan, not more knob-turning in this one.

- [ ] **Step 5: Commit**

```bash
git add scripts/ocean-capture.mjs content/ocean/js/render/lighting.js docs/superpowers/specs/2026-09-27-ocean-showcase-design.md
git commit -m "docs: A2 look match against Studio and Cole's check"
```
