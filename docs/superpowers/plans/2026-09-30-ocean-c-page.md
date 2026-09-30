# Ocean Showcase C: The Scrolling Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The finished showcase page at `content/ocean/index.html`, "Building an Ocean in Roblox": the finished ocean behind an opening title, thirteen glass panels that scroll over the pinned live ocean and build it from a flat white plane (copy, sliders bound to A3's stage director, collapsed KaTeX "The math" lines, "Roblox says no" cards, charts for steps 7 to 9, a camera shot per step with free orbit between), and a finale with live performance numbers, the Luau proof panel, the hidden footage section and Play button, the recap, the "things we believed" list and the credits; mobile, reduced-motion, no-WebGL and CDN-failure behaviour; a home-page link and an Azure MIME entry for `.luau`. Nothing is deployed.

**Architecture:** A small boot module (`js/boot.js`) sets up the page (scroll story, maths, footage, proof panel, Play button) without importing three, GSAP or KaTeX, checks WebGL, and only then loads the ocean with a dynamic `import('./main.js')`, so a missing CDN script or a missing WebGL leaves the story readable with a notice. `main.js` becomes `startOcean(...)`: A2's renderer and A3's engine plus a frame loop that survives exceptions, a pixel-ratio listener and a pausable clock. Without `?step` it creates the story stage (`ui/storyStage.js`), which turns the scroll reading (GSAP ScrollTrigger, with a native fallback) into A3's `createDirector(ocean).setStep(step, progress)`, applies A3's look and camera shots, lets the visitor orbit between shots and serves the panels' sliders and the charts. With `?step=N` A3's dev route runs as before. Pure logic (scroll maths, shot easing, slider mapping, chart geometry, live-number summaries, knob clamping, frame guard) lives in browser-free `js/page/` modules tested in Node; DOM code lives in `js/ui/` and is tested in Playwright. The copy is static HTML, and a copy check proves every number on the page sits inside a sourced phrase.

**Tech Stack:** Plain ES modules, no build step; from `cdn.jsdelivr.net/npm/` at exact versions through the page's import map: `three@0.186.1`, `gsap@3.15.0` (`index.js`, `ScrollTrigger.js`, ES modules), `katex@0.18.10` (`dist/katex.mjs`, `dist/katex.min.css`); B's `luau-web@1.4.0` for the proof panel. Node 25 `node --test`; `@playwright/test` 1.63.0, headless Chromium on SwiftShader.

**Spec:** `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md`: section 1 (purpose, audience, honesty rules, credits), 2 (page and layout), 3 (the thirteen steps), 8 (targets), 9 (build step 5), the status lines, and the Decided-with-Cole list including 2026-09-30 (title, first-person casual voice, rough hero sea, footage hidden until clips exist, Play hidden until a place URL, nothing deployed, phones on the lighter tier by rule and unmeasured). Interfaces consumed: `docs/superpowers/plans/2026-09-30-ocean-a3-teaching-stages.md` (director, recipes, charts, stage look, camera shot, dev route), `docs/superpowers/plans/2026-09-30-ocean-b-luau-panel.md` (`proof.css`, `mountProofPanelWhenNear`), and `content/ocean/js/engine/showcase.js` (piece D: `placeUrl`, `footageClips`, `FOOTAGE_MANIFEST`).

**Decisions this plan takes, so no task re-decides them:**

- **The copy is static HTML** in `index.html`, so the text renders before any script and survives every failure. Sliders, charts and live numbers are built by script only once the ocean runs; without the ocean their slots stay empty and the prose says why where it matters.
- **Story mode versus the dev route.** Without `?step` the page is the story. Until the visitor first scrolls into step 1, the story touches nothing: the ocean is exactly A2's hero sea under the config's camera, so every A2 browser test (which never scrolls) still describes it. In story mode a URL without `cam` gets `cam=deck` (the Studio-matched view) as the opening camera. With `?step=N` A3's dev route drives the ocean and the story leaves it alone.
- **Opening and finale.** Scrolling back above step 1 shows step 13's recipe (the finished sea) under the opening camera. Step 13's section holds the whole finale, so the director stays on step 13 through the live numbers, footage, proof, recap and credits.
- **Scroll to director.** The reading line is the middle of the viewport on desktop and the middle of the lower half on narrow screens. The reading is a continuous position `step + progress`; the stage smooths it with a 0.25 s time constant and cuts (no smoothing) whenever it would move more than one step at once, so a fling never sweeps the engine through intermediate recipes.
- **Camera.** Each frame applies the blended shot, until the visitor drags the ocean; the camera then stays free until the step being read changes, and eases back to the new shot over 1.2 s. The opening-to-step-1 boundary is a cut. In story mode OrbitControls have no zoom (the wheel scrolls the page), no pan and a 1,200-stud reach (the farthest shot, step 6, stands about 1,078 studs from its target); touch-first devices get no orbit at all, so a swipe over the ocean scrolls.
- **Sliders on a panel that is not being read.** The story stage sets the director to that panel's step, applies the slider and sets it back before the next frame, so the value is stored for its own step and the ocean does not jump.
- **Reduced motion** (`prefers-reduced-motion: reduce`): the ocean's clock starts paused and a Play button starts it; shots are each step's own (no blending, no drift, no ease-back); no scroll smoothing and no GSAP tweens.
- **A4 hook.** The finale's Roblox/Unleashed toggle is built but hidden; it appears and calls `handle.setRenderMode('roblox' | 'unleashed')` only if the ocean handle `startOcean` returns has a `setRenderMode` function (A4 adds it).
- **Footage manifest.** C commits `content/ocean/media/footage.json` as `{ "clips": [] }` so the page's fetch never 404s (a 404 is a console error); D's `ocean-footage.mjs` reads it through `withClip` like any manifest.
- **"Things we believed"** lists rows of the roblox-ocean engine-assumptions ledger that are about Roblox itself (W1, W2, W3, W5, W6, T10, T16), as "we" (Cole and Claude, per the spec's wording).

## Global Constraints

- Work only in the worktree `/Users/cole/Projects/Wesbite-ocean` on branch `ocean-showcase`. Never touch `/Users/cole/Projects/Wesbite`. Nothing is deployed: never run `scripts/deploy.sh`, never push.
- Pieces A3 and B are merged into `ocean-showcase` before this plan runs. Task 1 Step 1 checks their files exist; if one is missing, stop and report which.
- No build step: plain ES modules the browser imports as they are. External code only from `cdn.jsdelivr.net/npm/` at exact versions, through the import map in `index.html`: `three@0.186.1`, `gsap@3.15.0`, `katex@0.18.10` (plus B's `luau-web@1.4.0`, which its worker imports by full URL). Stylesheets: only `katex@0.18.10/dist/katex.min.css` from jsDelivr, plus the page's own.
- **Boot rule (A2 hand-off):** `content/ocean/js/boot.js` and every module it imports statically must never import `three`, `three/addons/...`, `gsap`, `gsap/...` or `katex`. Those load only through dynamic `import()`, so a CDN failure cannot stop the page's text, notice or story. `tests/ocean/page/bootGraph.test.js` (Task 1) enforces it.
- Browser-free code: `content/ocean/js/page/`, `engine/`, `stages/` import cleanly in Node (no `window`, `document`, `self`, no three). DOM code lives in `content/ocean/js/ui/`, `boot.js`, `main.js`. Unit tests in `tests/ocean/page/`, browser tests in `tests/ocean/e2e/`; never under `content/`.
- **Copy:** first person, casual, true, never overstated ("I built this in Roblox, and Roblox fought me the whole way"). Page title exactly `Building an Ocean in Roblox`. Every number in the page's text must sit inside a phrase listed in `tests/ocean/page/copySources.js` (Task 3), each phrase backed by a quote that exists in a named source file. Never invent a number; a new number needs a new sourced phrase. Numbers computed live (sliders, charts, performance) appear only inside elements marked `data-copy-skip="live"` and are labelled as measured in the visitor's browser. Maths inside `.tex` elements is marked `data-copy-skip="math"`.
- **Established facts the copy honours:** the three wave layers (256/64/16 studs) hide the 256-stud tiling, they do not remove it; at most 3 × 64 × 64 = 12,288 wave components on a CPU script, beside Acerola's about 4 million on the GPU; the proof runtime is luau-interop, a fork of Luau 0.711, and 196,608 float32 values matched bit for bit; the look was matched to Studio in three lighting rounds and Cole's verdict was "looks pretty good"; phones get the lighter tier by rule and are unmeasured; native code generation on a live Roblox client is unmeasured; the page is not pixel-identical to Roblox.
- Hidden until real: the footage section until `media/footage.json` lists a clip; the Play button until `placeUrl()` returns a URL. Never edit `ROBLOX_PLACE_URL` (it stays `''`).
- **Performance (A2 hand-offs):** no `backdrop-filter` anywhere and no new CSS `filter` (the canvas already carries `render/lighting.js` `CSS_FILTER`; stacking filters over a full-screen WebGL canvas re-composites every frame). Per-frame DOM writes only for the phase arrows while step 8's chart is on screen; live numbers update at most twice a second. An exception inside a frame never stops the frame loop. A device-pixel-ratio change resizes the renderer.
- Files use tabs (the one exception: `content/index.html` keeps its existing two-space indentation). Every new file opens with a header comment saying what it is and that it is piece C's. No `Math.random` anywhere.
- Unit tests: `cd /Users/cole/Projects/Wesbite-ocean && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean`. Browser tests: `npm run test:ocean:e2e` (headless Chromium on SwiftShader at about 5 fps; `OCEAN_PORT` picks the port, a running server is reused only with `OCEAN_REUSE_SERVER=1`). Wait in frames, read canvases inside `requestAnimationFrame`. If a browser threshold fails on a page that behaves correctly, report the measured value; never lower a threshold silently.
- Every A2, A3 and B test keeps passing. The one expectation C changes on purpose: the device-pixel-ratio-3 phone-portrait test in `tests/ocean/e2e/ocean.spec.js` (the canvas is now the top half of a narrow screen), in Task 2.
- Commit messages `<type>: <description>` (feat, fix, test, docs, chore), no trailers. A hook blocks any Bash command containing `git commit` together with a `-n` flag: never put `-n` (or `--no-verify`) in a commit command; run `git commit` in its own command.
- Subagents run on opus and never use the Roblox Studio MCP tools.

## Review Focus

Inputs a visitor's browser will produce that the spec implies but no step row names, most likely first; each has a test in the named task:

1. **A fling or a jump through many steps at once** (a fast wheel, the End key, find-in-page, a slow machine that samples the scroll rarely): the director lands on the target step without sweeping the engine through the steps in between, the camera cuts to the target shot, nothing throws. Test in Task 5 ("a jump from step 1 to step 12 cuts straight there").
2. **The wheel or a swipe over the ocean itself** rather than over a panel: the page scrolls (OrbitControls must not eat the wheel), and on a touch-first screen a swipe over the ocean scrolls instead of orbiting. Tests in Task 5 ("the wheel over the ocean scrolls the page" and "a touch-first screen gets no orbit").
3. **A CDN library that never arrives** (three, GSAP or KaTeX blocked, offline, a strict network): the text, cards and footage stay, three's absence shows a notice, GSAP's falls back to a native scroll listener, KaTeX's leaves the raw TeX readable, and nothing throws uncaught. Tests in Task 1 (three), Task 4 (GSAP), Task 7 (KaTeX).
4. **A slider moved on a panel that is not the step being read** (the next panel already on screen, or a slider dragged fast): the value lands on that panel's own step, the ocean does not jump steps, nothing throws, and the value is still there when the visitor scrolls to it. Test in Task 6 ("a slider on the next panel changes that step, not the one being read").
5. **A phone in portrait, touch-first** (the lighter tier by rule): the ocean fills the top half, panels scroll beneath, no horizontal scroll, the third layer's toggle says it is not on this tier, and the finale says the tier was picked by rule and is unmeasured. Tests in Task 2 (layout), Task 6 (toggle), Task 9 (the sentence).

---

## File map

New (piece C):

| File | Responsibility |
|---|---|
| `content/ocean/js/boot.js` | Entry module: config, route, clock, page features, WebGL check, dynamic import of `main.js`, notices |
| `content/ocean/js/webgl.js` | `webglSupported()` (moved out of `main.js`, no imports) |
| `content/ocean/js/engine/playClock.js` | Pausable wall clock the ocean reads |
| `content/ocean/js/page/frameGuard.js` | Counts frame exceptions, logs sparingly, raises the notice when they persist |
| `content/ocean/js/page/scrollMap.js` | Reading line, section reading, position smoothing and splitting |
| `content/ocean/js/page/shotControl.js` | Shot / free / returning camera state, drift resolution, easing |
| `content/ocean/js/page/sliderModel.js` | Slider input mapping (log scale), value formatting, term colours |
| `content/ocean/js/page/knobs.js` | Clamps slider-owned URL knobs into the sliders' ranges |
| `content/ocean/js/page/chartGeometry.js` | Scales, ticks, SVG paths, arrow ends |
| `content/ocean/js/page/mathTrust.js` | KaTeX options: only `\htmlClass` trusted; the pinned stylesheet URL |
| `content/ocean/js/page/liveSummary.js` | Rows of live numbers from status and report |
| `content/ocean/js/page/renderMode.js` | Whether the A4 toggle is available, and its guarded setter |
| `content/ocean/js/page/notices.js` | The notice sentences |
| `content/ocean/js/ui/page.js` | Composes the page features; `attachOcean`, `oceanUnavailable` |
| `content/ocean/js/ui/notice.js` | Shows a notice |
| `content/ocean/js/ui/pixelRatio.js` | Device-pixel-ratio change listener |
| `content/ocean/js/ui/story.js` | GSAP ScrollTrigger (native fallback) to the scroll reading |
| `content/ocean/js/ui/storyStage.js` | The story's hold on the ocean: director, look, shots, sliders, chart data |
| `content/ocean/js/ui/controls.js` | Slider widgets per panel |
| `content/ocean/js/ui/math.js` | Lazy KaTeX rendering of "The math" lines |
| `content/ocean/js/ui/charts.js` | Spectrum, phase-arrow and transform-timing charts |
| `content/ocean/js/ui/finale.js` | Live numbers, footage, Play button, proof panel, render toggle, motion button |
| `content/ocean/media/footage.json` | `{ "clips": [] }` |
| `content/staticwebapp.config.json` | `.luau` MIME type |
| `tests/ocean/page/*.test.js`, `tests/ocean/page/copySources.js`, `tests/ocean/page/copyCheck.js` | Unit tests, the copy source list and checker |
| `tests/ocean/e2e/helpers/story.js` | Shared browser-test helpers |
| `tests/ocean/e2e/boot.spec.js`, `layout.spec.js`, `copy.spec.js`, `story.spec.js`, `storyStage.spec.js`, `controls.spec.js`, `math.spec.js`, `charts.spec.js`, `finale.spec.js`, `walk.spec.js` | Browser tests per section |

Modified: `content/ocean/index.html` (rewritten), `content/ocean/style.css` (rewritten), `content/ocean/js/main.js`, `content/ocean/js/render/cameraRig.js`, `content/index.html`, `package.json`, `playwright.ocean.config.js` (only if it lacks `OCEAN_PORT`), `tests/ocean/e2e/ocean.spec.js` (one test), the spec's status lines.

---

### Task 1: Boot without the CDN, a frame loop that survives, a pausable clock

The page's entry becomes `js/boot.js`, which imports nothing from a CDN; the live ocean loads only once WebGL is confirmed, through `import('./main.js')`. `main.js` stops running by itself and exports `startOcean`. The frame loop schedules its next frame before it runs, so one exception cannot stop it; a device-pixel-ratio change resizes the renderer; and the ocean reads a clock the page can pause (reduced motion, Task 9).

**Files:**
- Create: `content/ocean/js/webgl.js`, `content/ocean/js/boot.js`, `content/ocean/js/engine/playClock.js`, `content/ocean/js/page/frameGuard.js`, `content/ocean/js/page/notices.js`, `content/ocean/js/ui/notice.js`, `content/ocean/js/ui/page.js`, `content/ocean/js/ui/pixelRatio.js`
- Modify: `content/ocean/js/main.js` (replaced), `content/ocean/index.html` (import map and entry script only), `package.json` (test globs), `playwright.ocean.config.js` (only if it lacks `OCEAN_PORT`)
- Test: `tests/ocean/page/playClock.test.js`, `tests/ocean/page/frameGuard.test.js`, `tests/ocean/page/bootGraph.test.js`, `tests/ocean/e2e/boot.spec.js`

**Interfaces:**
- Consumes: A2/A3 `engine/config.js` (`readConfig(search)`, `tierForDevice({ shortSide, coarsePointer })`), `engine/ocean.js` (`create(config, { spawnCascade, spawnPainter, now, deviceTier })`, `attachSink`, `step`, `addStageSeconds`, `status`, `report`), `stages/route.js` (`parseStageRoute(search) -> route | null`), `ui/devStage.js` (`startStageRoute({ route, ocean, view, rig, meshes, materials, config }) -> { beforeStep(), afterStep(), hooks }`), `render/*` (`createScene`, `createCameraRig`, `createOceanMeshes`, `createMaterials`), `ui/perfReadout.js`.
- Produces:
  - `webgl.js`: `webglSupported() -> boolean`.
  - `engine/playClock.js`: `createPlayClock(wall: () => seconds, { playing = true } = {}) -> { now() -> seconds, play(), pause(), playing() -> boolean }` (frozen).
  - `page/frameGuard.js`: `NOTICE_AFTER_FRAMES` (30), `LOG_EVERY` (300), `createFrameGuard({ log = console, onPersistent = () => {} } = {}) -> { ok(), failed(error), failures() -> number }`.
  - `page/notices.js`: `NOTICES` = frozen `{ webgl, load, frames }` (sentences).
  - `ui/notice.js`: `showNotice(text)`.
  - `ui/pixelRatio.js`: `watchPixelRatio(onChange, win = window) -> stop()`.
  - `ui/page.js`: `startPage({ route, reducedMotion, clock }) -> { context, attachOcean(handle), oceanUnavailable(reason) }`; sets `document.body.dataset.ocean` to `'loading' | 'running' | 'unavailable'` (and `data-ocean-reason`). Later tasks add features at two marked lines: their import directly above `// Feature imports end.` and their lines directly above `// Features end.` (so features run in task order and a later one can use an earlier one's variables). A feature is an object with optional `attachOcean(handle)` and `oceanUnavailable(reason)`; the page's `context` is `{ route, reducedMotion, clock }`.
  - `main.js`: `startOcean({ config, route, now, reducedMotion = false, onPersistentError = () => {} }) -> handle`, `handle = { ocean, view, rig, meshes, materials, config, canvas, reducedMotion, stage, story }` (frozen; `stage`: the dev route's hooks or null; `story`: null until Task 5). `window.__ocean` keeps every A2/A3 hook and gains `story` (null until Task 5), `frameFailures() -> number` and `injectFrameErrors(count)` (test hook: the next `count` frames throw before stepping).
  - `boot.js`: the page entry; story mode sets `cam=deck` when the URL names no camera.

- [ ] **Step 1: Check that A3 and B are merged**

Run:
```bash
cd /Users/cole/Projects/Wesbite-ocean && ls content/ocean/js/stages/director.js content/ocean/js/stages/recipes.js content/ocean/js/stages/route.js content/ocean/js/ui/devStage.js content/ocean/js/render/stageLook.js content/ocean/js/engine/charts.js content/ocean/js/engine/surfaceProbe.js content/ocean/js/ui/proofLazy.js content/ocean/proof.css && grep -n "OCEAN_PORT" playwright.ocean.config.js
```
Expected: every file listed, and one or more `OCEAN_PORT` lines. If a file is missing, stop and report which piece is not merged. If only the `OCEAN_PORT` grep is empty, replace the whole of `playwright.ocean.config.js` with:

```js
import { defineConfig } from '@playwright/test';

// Browser tests for the ocean page. Headless Chromium draws WebGL on the machine's GPU through ANGLE's
// Metal backend (about 60 fps on an M4, against about 1 fps on SwiftShader). OCEAN_GL=swiftshader
// switches back to the CPU renderer, for a machine without a usable GPU. These tests check behaviour
// and that pixels appear, never frame rates.
// OCEAN_PORT picks the test server's port (default 8767), so two worktrees can test side by side.
// A server already on that port is reused only when OCEAN_REUSE_SERVER=1; otherwise Playwright fails
// loudly, so a run never tests another tree's content/ by accident.
const PORT = process.env.OCEAN_PORT || '8767';
const GL_ARGS = process.env.OCEAN_GL === 'swiftshader'
	? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
	: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

export default defineConfig({
	testDir: 'tests/ocean/e2e',
	timeout: 90_000,
	expect: { timeout: 30_000 },
	workers: 1,
	use: {
		baseURL: `http://localhost:${PORT}`,
		viewport: { width: 1366, height: 767 },
		launchOptions: { args: GL_ARGS },
	},
	webServer: {
		command: `python3 -m http.server ${PORT} --directory content`,
		url: `http://localhost:${PORT}/ocean/`,
		reuseExistingServer: process.env.OCEAN_REUSE_SERVER === '1',
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

- [ ] **Step 2: Let the unit tests find `tests/ocean/page/`**

In `package.json`, edit the `test:ocean` script string in two places and change nothing else: insert ` --test-coverage-include='content/ocean/js/page/**'` directly after `node --test --experimental-test-coverage`, and append ` 'tests/ocean/page/**/*.test.js'` at the end of the string (inside its closing double quote).

Run: `cd /Users/cole/Projects/Wesbite-ocean && node -e "const s=require('./package.json').scripts['test:ocean']; if(!s.includes(\"'tests/ocean/page/**/*.test.js'\")||!s.includes('content/ocean/js/page/**')) process.exit(1); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Write the failing unit tests**

`tests/ocean/page/playClock.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { createPlayClock } from '../../../content/ocean/js/engine/playClock.js';

function fakeWall(start = 100) {
	let t = start;
	return { wall: () => t, advance: (seconds) => { t += seconds; } };
}

test('a playing clock follows the wall clock', () => {
	const { wall, advance } = fakeWall();
	const clock = createPlayClock(wall);
	const start = clock.now();
	advance(2.5);
	expect.near(clock.now() - start, 2.5, 1e-12, 'moved with the wall');
	expect.equal(clock.playing(), true, 'playing');
});

test('a paused clock holds still, and playing again carries on from where it stopped', () => {
	const { wall, advance } = fakeWall();
	const clock = createPlayClock(wall);
	advance(1);
	clock.pause();
	const held = clock.now();
	advance(10);
	expect.equal(clock.now(), held, 'held while paused');
	clock.play();
	expect.equal(clock.now(), held, 'no jump on play');
	advance(0.5);
	expect.near(clock.now(), held + 0.5, 1e-12, 'moves again');
});

test('a clock can start paused (reduced motion), and pause and play twice are harmless', () => {
	const { wall, advance } = fakeWall();
	const clock = createPlayClock(wall, { playing: false });
	const start = clock.now();
	advance(3);
	expect.equal(clock.now(), start, 'starts paused');
	clock.pause();
	clock.play();
	clock.play();
	advance(1);
	expect.near(clock.now(), start + 1, 1e-12, 'one play counts once');
	expect.truthy(Object.isFrozen(clock), 'frozen');
});
```

`tests/ocean/page/frameGuard.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { createFrameGuard, LOG_EVERY, NOTICE_AFTER_FRAMES } from '../../../content/ocean/js/page/frameGuard.js';

function recorder() {
	const lines = [];
	return { lines, log: { error: (...args) => lines.push(args) } };
}

test('one failed frame is logged once and raises no notice', () => {
	const { lines, log } = recorder();
	let noticed = 0;
	const guard = createFrameGuard({ log, onPersistent: () => { noticed += 1; } });
	guard.failed(new Error('boom'));
	guard.ok();
	expect.equal(guard.failures(), 1, 'counted');
	expect.equal(lines.length, 1, 'logged once');
	expect.truthy(String(lines[0][0]).includes('frame failed'), `says so: ${lines[0][0]}`);
	expect.equal(noticed, 0, 'no notice');
});

test('failures in every frame are logged sparingly and raise the notice once', () => {
	const { lines, log } = recorder();
	let noticed = 0;
	const guard = createFrameGuard({ log, onPersistent: () => { noticed += 1; } });
	for (let i = 0; i < LOG_EVERY * 2; i++) guard.failed(new Error(`boom ${i}`));
	expect.equal(noticed, 1, 'notice once');
	expect.equal(lines.length, 3, 'the first, then every LOG_EVERY');
	expect.equal(guard.failures(), LOG_EVERY * 2, 'all counted');
});

test('a streak broken by a good frame starts again', () => {
	let noticed = 0;
	const guard = createFrameGuard({ log: { error() {} }, onPersistent: () => { noticed += 1; } });
	for (let round = 0; round < 5; round++) {
		for (let i = 0; i < NOTICE_AFTER_FRAMES - 1; i++) guard.failed(new Error('boom'));
		guard.ok();
	}
	expect.equal(noticed, 0, 'never a streak long enough');
});
```

`tests/ocean/page/bootGraph.test.js`:

```js
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';

// Every static import and re-export ("import ... from", "export ... from", "import '...'"), across
// lines. Dynamic import() calls are not matched: they are how the page loads CDN code on purpose.
const STATIC_IMPORT = /^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;
const FORBIDDEN = /^(three|gsap|katex)(\/|$)/;
const file = (path) => fileURLToPath(new URL(`../../../content/ocean/js/${path}`, import.meta.url));

function walk(entry) {
	const seen = new Set();
	const bare = [];
	const stack = [entry];
	while (stack.length > 0) {
		const current = stack.pop();
		if (seen.has(current)) continue;
		seen.add(current);
		for (const match of readFileSync(current, 'utf8').matchAll(STATIC_IMPORT)) {
			const specifier = match[1] ?? match[2];
			if (specifier.startsWith('.')) stack.push(resolve(dirname(current), specifier));
			else bare.push({ from: current, specifier });
		}
	}
	return { files: seen, bare };
}

test('boot.js statically reaches no CDN library: three, GSAP and KaTeX load only by dynamic import', () => {
	const { files, bare } = walk(file('boot.js'));
	expect.truthy(files.size > 5, `walked ${files.size} files`);
	const forbidden = bare.filter(({ specifier }) => FORBIDDEN.test(specifier));
	expect.equal(forbidden.length, 0, `static CDN imports reachable from boot.js: ${JSON.stringify(forbidden)}`);
});

test('the walker does see three behind main.js, so the check above can fail', () => {
	const { bare } = walk(file('main.js'));
	expect.truthy(bare.some(({ specifier }) => specifier === 'three'), 'main.js reaches three');
});
```

- [ ] **Step 4: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/`
Expected: FAIL: `Cannot find module .../engine/playClock.js`, `.../page/frameGuard.js`, and `ENOENT ... boot.js`.

- [ ] **Step 5: Write the pure modules**

`content/ocean/js/engine/playClock.js`:

```js
// The clock the ocean reads (piece C): the wall clock, minus the time it spent paused. Reduced
// motion starts it paused and the page's Play button starts it (spec 2: "the ocean keeps animating
// only when the visitor presses play"). Both of the engine's clocks, the FFT's looping one and the
// teaching steps' unwrapped one, read ocean.now(), so pausing this holds the whole sea still.
export function createPlayClock(wall, { playing = true } = {}) {
	let removed = 0;
	let pausedAt = playing ? null : wall();
	return Object.freeze({
		now: () => (pausedAt ?? wall()) - removed,
		play() {
			if (pausedAt !== null) {
				removed += wall() - pausedAt;
				pausedAt = null;
			}
		},
		pause() {
			if (pausedAt === null) {
				pausedAt = wall();
			}
		},
		playing: () => pausedAt === null,
	});
}
```

`content/ocean/js/page/frameGuard.js`:

```js
// Keeps one bad frame from killing the live ocean (piece C; A2 final review: "one exception must
// not stop the frame loop"). The loop schedules its next frame first and reports each exception
// here: the first is logged with its stack, then one line every LOG_EVERY failures, and when
// NOTICE_AFTER_FRAMES frames in a row have failed the page is told once, so it can say the ocean
// may have stopped while the story keeps working.
export const NOTICE_AFTER_FRAMES = 30;
export const LOG_EVERY = 300;

export function createFrameGuard({ log = console, onPersistent = () => {} } = {}) {
	let failures = 0;
	let streak = 0;
	let noticed = false;
	return Object.freeze({
		ok() {
			streak = 0;
		},
		failed(error) {
			failures += 1;
			streak += 1;
			if (failures === 1 || failures % LOG_EVERY === 0) {
				log.error(`[ocean] frame failed (${failures} so far)`, error);
			}
			if (!noticed && streak >= NOTICE_AFTER_FRAMES) {
				noticed = true;
				onPersistent(error);
			}
		},
		failures: () => failures,
	});
}
```

`content/ocean/js/page/notices.js`:

```js
// The notices the page can show over the story (piece C). Plain sentences; the copy check
// (tests/ocean/page/copy.test.js) checks their numbers like the rest of the copy.
export const NOTICES = Object.freeze({
	webgl: "This live ocean needs WebGL 2, which this browser has turned off or doesn't support. The story, the maths and the footage still work.",
	load: "The live ocean couldn't load: one of its scripts didn't arrive from cdn.jsdelivr.net. The story still works; reload the page to try again.",
	frames: 'The live ocean hit an error and may have stopped moving. The story still works; reload the page to try again.',
});
```

- [ ] **Step 6: Write the browser modules and the boot**

`content/ocean/js/webgl.js`:

```js
// Whether this browser can run the live ocean (moved here from main.js by piece C, so boot.js can
// ask before it loads anything from a CDN). No imports.
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
```

`content/ocean/js/ui/notice.js`:

```js
// Shows one of the page's notices (page/notices.js) in the #notice strip (piece C).
export function showNotice(text) {
	const notice = document.getElementById('notice');
	notice.textContent = text;
	notice.hidden = false;
}
```

`content/ocean/js/ui/pixelRatio.js`:

```js
// Calls onChange when the device pixel ratio changes: a window dragged to another screen, or the
// browser's zoom (piece C; A2 final review). A resize event does not always come with it, and the
// renderer's pixel ratio is read only in view.resize(). A resolution media query matches the ratio
// at the time it was made, so each change re-arms it with the new one.
export function watchPixelRatio(onChange, win = window) {
	let query = null;
	function fire() {
		onChange();
		arm();
	}
	function arm() {
		query = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`);
		query.addEventListener('change', fire, { once: true });
	}
	arm();
	return () => query?.removeEventListener('change', fire);
}
```

`content/ocean/js/ui/page.js`:

```js
// The page around the live ocean (piece C): the scroll story, the panels' controls, the maths, the
// charts and the finale are features composed here. Each feature starts when the page does (none of
// them needs the ocean to show its text) and may take the ocean's handle once it runs
// (attachOcean) or learn that it will not (oceanUnavailable: 'webgl', 'load' or 'start').
// body[data-ocean] is 'loading', 'running' or 'unavailable', for the stylesheet and the tests.
// Feature imports (each later task adds its import directly above the next line).
// Feature imports end.

export function startPage({ route, reducedMotion, clock }) {
	const features = [];
	const context = Object.freeze({ route, reducedMotion, clock });
	// Features (each later task adds its lines directly above the next line, so they run in task order).
	// Features end.
	document.body.dataset.ocean = 'loading';
	return Object.freeze({
		context,
		attachOcean(handle) {
			document.body.dataset.ocean = 'running';
			for (const feature of features) {
				feature.attachOcean?.(handle);
			}
		},
		oceanUnavailable(reason) {
			document.body.dataset.ocean = 'unavailable';
			document.body.dataset.oceanReason = reason;
			for (const feature of features) {
				feature.oceanUnavailable?.(reason);
			}
		},
	});
}
```

`content/ocean/js/boot.js`:

```js
// The ocean page's entry module (piece C). Everything it imports statically is local and free of
// three, GSAP and KaTeX (tests/ocean/page/bootGraph.test.js checks), so the text, the story and the
// notice work even when a CDN script never arrives. It reads the config and the dev route, starts
// the page's features, checks WebGL, and only then loads the live ocean with a dynamic import.
import { readConfig } from './engine/config.js';
import { createPlayClock } from './engine/playClock.js';
import { parseStageRoute } from './stages/route.js';
import { NOTICES } from './page/notices.js';
import { webglSupported } from './webgl.js';
import { showNotice } from './ui/notice.js';
import { startPage } from './ui/page.js';

// The story opens on the deck camera, the view matched against Studio, unless the URL names one.
// The dev route (?step=N) keeps readConfig's own default.
function searchFor(search, route) {
	const query = new URLSearchParams(search);
	if (!route && !query.has('cam')) {
		query.set('cam', 'deck');
	}
	return query;
}

const route = parseStageRoute(location.search);
const config = readConfig(searchFor(location.search, route));
for (const warning of [...config.warnings, ...(route?.warnings ?? [])]) {
	console.warn(`[ocean] ${warning}`);
}
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = createPlayClock(() => performance.now() / 1000, { playing: !reducedMotion });
const page = startPage({ route, reducedMotion, clock });

async function startLiveOcean() {
	let startOcean;
	try {
		({ startOcean } = await import('./main.js'));
	} catch (error) {
		// three (or another module of the ocean) did not arrive: the story carries on without it.
		console.warn('[ocean] the live ocean could not load', error);
		showNotice(NOTICES.load);
		page.oceanUnavailable('load');
		return;
	}
	try {
		const handle = startOcean({
			config,
			route,
			now: clock.now,
			reducedMotion,
			onPersistentError: () => showNotice(NOTICES.frames),
		});
		page.attachOcean(handle);
	} catch (error) {
		// The probe can pass and the renderer's own context still fail (a lost GPU process, a
		// blocklist that applies to the second context): say so instead of leaving a blank page.
		console.error('[ocean] could not start', error);
		showNotice(NOTICES.webgl);
		page.oceanUnavailable('start');
	}
}

if (webglSupported()) {
	startLiveOcean();
} else {
	showNotice(NOTICES.webgl);
	page.oceanUnavailable('webgl');
}
```

- [ ] **Step 7: Replace `content/ocean/js/main.js`**

Replace the whole file with the following. Before replacing, read the merged file: if its `window.__ocean` object has hooks that are not in the object below (A3's final version may have added some), keep them in the new object too and name them in your report.

```js
// The live ocean: scene, camera, the painted materials, the CPU-written meshes over the engine's
// typed arrays, the frame loop and the stats readout. With ?step=N A3's stage director drives the
// ocean from the URL (ui/devStage.js). Piece C: this module no longer runs by itself. boot.js
// imports it dynamically once WebGL is known to work, so a CDN failure cannot stop the page; the
// frame loop schedules its next frame before running this one, so an exception cannot stop it
// (page/frameGuard.js); the renderer follows a change of device pixel ratio; and the ocean reads
// the page's pausable clock (engine/playClock.js) through `now`.
import * as Ocean from './engine/ocean.js';
import { tierForDevice } from './engine/config.js';
import { createFrameGuard } from './page/frameGuard.js';
import { createScene } from './render/scene.js';
import { createCameraRig } from './render/cameraRig.js';
import { createOceanMeshes } from './render/oceanMeshes.js';
import { createMaterials } from './render/materials.js';
import { createPerfReadout } from './ui/perfReadout.js';
import { startStageRoute } from './ui/devStage.js';
import { watchPixelRatio } from './ui/pixelRatio.js';

// The phone rule's two facts about this device (engine/config.js tierForDevice decides).
function deviceTier() {
	return tierForDevice({
		shortSide: Math.min(window.screen.width, window.screen.height),
		coarsePointer: window.matchMedia('(pointer: coarse)').matches,
	});
}

export function startOcean({ config, route, now, reducedMotion = false, onPersistentError = () => {} }) {
	const canvas = document.getElementById('ocean');
	const view = createScene(canvas);
	const rig = createCameraRig(view.camera, canvas, config);
	const ocean = Ocean.create(config, {
		spawnCascade: () => new Worker(new URL('./workers/cascade.worker.js', import.meta.url), { type: 'module' }),
		spawnPainter: () => new Worker(new URL('./workers/painter.worker.js', import.meta.url), { type: 'module' }),
		now,
		deviceTier: deviceTier(),
	});
	const materials = createMaterials(ocean, view.renderer);
	Ocean.attachSink(ocean, materials.sink);
	const meshes = createOceanMeshes(view.scene, ocean, materials);
	const stats = document.getElementById('stats');
	stats.hidden = !config.stats;
	const readout = createPerfReadout(stats);
	const guard = createFrameGuard({ onPersistent: onPersistentError });
	const focus = [0, 0];
	const eye = [0, 0, 0];
	let last = performance.now();
	let injected = 0;
	view.resize();
	window.addEventListener('resize', view.resize);
	// The canvas changes size without a window resize when the narrow layout's top half changes.
	new ResizeObserver(() => view.resize()).observe(canvas);
	watchPixelRatio(view.resize);
	const parts = { ocean, view, rig, meshes, materials, config };
	const dev = route ? startStageRoute({ route, ...parts }) : null;
	const stage = dev;
	window.__ocean = {
		status: () => Ocean.status(ocean),
		report: () => Ocean.report(ocean),
		camera: view.camera,
		materialsProbe: () => materials.probe(),
		setNormalScale: (x, y) => materials.setNormalScale(x, y),
		setSun: (direction) => view.setSun(direction),
		setEnvironment: (enabled) => view.setEnvironment(enabled),
		stage: dev ? dev.hooks : null,
		story: null,
		frameFailures: () => guard.failures(),
		// Test hook: the next `count` frames throw before stepping (tests/ocean/e2e/boot.spec.js).
		injectFrameErrors: (count) => {
			injected = count;
		},
	};

	function tick(time) {
		const dt = (time - last) / 1000;
		last = time;
		if (injected > 0) {
			injected -= 1;
			throw new Error('injected frame error (test hook)');
		}
		rig.update();
		stage?.beforeStep(dt);
		Ocean.step(ocean, dt, rig.focus(focus), rig.eye(eye), view.sunDirection);
		materials.applyStrengths(ocean.strengths);
		meshes.sync();
		view.follow();
		stage?.afterStep(dt);
		const renderStarted = performance.now();
		view.render();
		Ocean.addStageSeconds(ocean, 'render', (performance.now() - renderStarted) / 1000);
		readout.frame(time);
		if (config.stats) readout.show(Ocean.status(ocean), Ocean.report(ocean));
	}

	function frame(time) {
		requestAnimationFrame(frame);
		try {
			tick(time);
			guard.ok();
		} catch (error) {
			guard.failed(error);
		}
	}
	requestAnimationFrame(frame);

	return Object.freeze({ ...parts, canvas, reducedMotion, stage: dev ? dev.hooks : null, story: null });
}
```

- [ ] **Step 8: Point `content/ocean/index.html` at the boot and pin the libraries**

In `content/ocean/index.html`, replace the import map's `"imports"` object with:

```json
		"imports": {
			"three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js",
			"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/",
			"gsap": "https://cdn.jsdelivr.net/npm/gsap@3.15.0/index.js",
			"gsap/ScrollTrigger": "https://cdn.jsdelivr.net/npm/gsap@3.15.0/ScrollTrigger.js",
			"katex": "https://cdn.jsdelivr.net/npm/katex@0.18.10/dist/katex.mjs"
		}
```

and replace `<script type="module" src="js/main.js"></script>` with `<script type="module" src="js/boot.js"></script>`. (Task 2 rewrites the rest of the page and keeps both.)

- [ ] **Step 9: Run the unit tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/ && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean`
Expected: PASS: 3 clock, 3 guard and 2 boot-graph tests, and the whole suite green with `tests/ocean/page/` listed.

- [ ] **Step 10: Write the browser tests**

`tests/ocean/e2e/boot.spec.js`:

```js
import { test, expect } from '@playwright/test';

function watch(page) {
	const errors = [];
	const consoleErrors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});
	return { errors, consoleErrors };
}

async function running(page, url = '/ocean/?cam=deck') {
	await page.goto(url);
	await page.waitForFunction(() => (window.__ocean?.status().frame ?? 0) > 5, null, { timeout: 90_000 });
}

test('three blocked at the CDN: a notice names it, the page stays, nothing throws (Review Focus 3)', async ({ page }) => {
	const { errors } = watch(page);
	await page.route('**/npm/three@0.186.1/**', (route) => route.abort());
	await page.goto('/ocean/');
	await expect(page.locator('#notice')).toBeVisible();
	await expect(page.locator('#notice')).toContainText('cdn.jsdelivr.net');
	await expect(page.locator('body')).toHaveAttribute('data-ocean', 'unavailable');
	await expect(page.locator('body')).toHaveAttribute('data-ocean-reason', 'load');
	expect(errors).toEqual([]);
});

test('an exception inside a frame is logged once and the loop keeps going', async ({ page }) => {
	const { errors, consoleErrors } = watch(page);
	await running(page);
	await page.evaluate(() => window.__ocean.injectFrameErrors(3));
	await page.waitForFunction(() => window.__ocean.frameFailures() === 3, null, { timeout: 60_000 });
	const frame = await page.evaluate(() => window.__ocean.status().frame);
	await page.waitForFunction((f) => window.__ocean.status().frame > f + 5, frame, { timeout: 60_000 });
	expect(consoleErrors.filter((text) => text.includes('frame failed')).length).toBe(1);
	await expect(page.locator('#notice')).toBeHidden();
	expect(errors).toEqual([]);
});

test('exceptions in frame after frame raise the notice, and the loop still runs', async ({ page }) => {
	test.setTimeout(180_000);
	const { errors } = watch(page);
	await running(page);
	await page.evaluate(() => window.__ocean.injectFrameErrors(40));
	await expect(page.locator('#notice')).toBeVisible({ timeout: 120_000 });
	await expect(page.locator('#notice')).toContainText('hit an error');
	await page.waitForFunction(() => window.__ocean.frameFailures() === 40, null, { timeout: 120_000 });
	const frame = await page.evaluate(() => window.__ocean.status().frame);
	await page.waitForFunction((f) => window.__ocean.status().frame > f + 3, frame, { timeout: 60_000 });
	expect(errors).toEqual([]);
});

test('a change of device pixel ratio resizes the renderer', async ({ page }) => {
	await running(page);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 767, deviceScaleFactor: 1.5, mobile: false });
	await page.waitForFunction(() => {
		const canvas = document.getElementById('ocean');
		return canvas.width === Math.floor(canvas.clientWidth * 1.5);
	}, null, { timeout: 30_000 });
});

test('story mode opens on the deck camera when the URL names none', async ({ page }) => {
	await running(page, '/ocean/');
	const position = await page.evaluate(() => window.__ocean.camera.position.toArray());
	[0, 14, 40].forEach((value, i) => expect(position[i]).toBeCloseTo(value, 3));
});
```

- [ ] **Step 11: Run the browser tests**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/boot.spec.js && npm run test:ocean:e2e`
Expected: the 5 new tests pass, and every earlier browser test (A2 shell, ocean, materials; A3 stages and steps; B proof) still passes: the shell tests' notice sentences still contain `WebGL`.

- [ ] **Step 12: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean && git add package.json playwright.ocean.config.js content/ocean/index.html content/ocean/js/boot.js content/ocean/js/webgl.js content/ocean/js/main.js content/ocean/js/engine/playClock.js content/ocean/js/page/frameGuard.js content/ocean/js/page/notices.js content/ocean/js/ui/notice.js content/ocean/js/ui/page.js content/ocean/js/ui/pixelRatio.js tests/ocean/page/playClock.test.js tests/ocean/page/frameGuard.test.js tests/ocean/page/bootGraph.test.js tests/ocean/e2e/boot.spec.js
```

```bash
cd /Users/cole/Projects/Wesbite-ocean && git commit -m "feat: boot the ocean page without the CDN and keep the frame loop alive"
```

---

### Task 2: The page: layout, themes and every word of the copy

The whole page as static HTML (opening, thirteen panels with their prose, "The math" lines as raw TeX, the "Roblox says no" cards, the finale's blocks, the recap, the "things we believed" list, the credits) and its stylesheet: glass panels on the left third over the fixed canvas on desktop; below 900 px the ocean pinned to the top half with the panels scrolling beneath it; one dark cinematic theme whatever the system prefers (spec: dark glass panels); no `backdrop-filter`. Plus the home-page link. Nothing here needs JavaScript to be read.

**Files:**
- Modify: `content/ocean/index.html` (replaced), `content/ocean/style.css` (replaced), `content/index.html` (one link), `tests/ocean/e2e/ocean.spec.js` (the phone-portrait expectation)
- Test: `tests/ocean/e2e/layout.spec.js`

**Interfaces:**
- Consumes: Task 1's import map and `js/boot.js` entry; B's `proof.css` (linked); the ids the A2 tests use (`#ocean`, `#notice`, `#stats`).
- Produces (the DOM later tasks rely on):
  - `main#story`; `section#opening.opening` (with `h1`, `p.lede`, `p.cue`).
  - `section.step#step-N[data-step="N"]` for N = 1 .. 13, each with `article.panel` holding `h2#step-N-title`, prose `p`, `div.controls[data-controls="N"][data-copy-skip="live"]` (empty; Task 6 fills it), and for N = 1 .. 12 `details.math` > `summary` ("The math") + `div.tex[data-copy-skip="math"]` > `code` (the TeX source) + `p.math-note`.
  - `aside.card` ("Roblox says no") in steps 1, 2, 3, 4, 6, 9, 10, 11, 12: `h3` + `dl` with four `dt`/`dd` pairs in the order Normally, In Roblox, What I did, The number.
  - `figure.chart[data-chart="spectrum" | "phase" | "transforms"][data-copy-skip="live"]` in steps 7, 8, 9 (empty `div.chart-body` + `figcaption`).
  - Step 13 (`section.step.step-finale`): `div.render-mode[data-render-mode][hidden]` with `button[data-mode="roblox" | "unleashed"]`; `section#live` with `dl[data-live][data-copy-skip="live"]`, `p[data-live-phone][hidden]`, `p[data-live-none][hidden]`; `section#footage[hidden]` with `div[data-clips]`; `section#proof-block` with `div#proof[data-copy-skip="live"]`; `a#play[hidden]`; `section#recap`, `section#believed`, `section#credits`.
  - `button#motion.motion[hidden]` (Task 9); `header.site`, `footer.site`.
  - CSS: `body[data-ocean="unavailable"]` hides `.controls` and `.chart`; term colour classes `.t-amp`, `.t-len`, `.t-speed`, `.t-count`, `.t-sun`, `.t-chop`, `.t-tile`, `.t-wind`, `.t-fetch`, `.t-seed`, `.t-n`, `.t-layer`, `.t-whitecap`, `.t-fade`, `.t-glow`, `.t-grid`; chart tokens `--chart-bg`, `--chart-ink`, `--chart-a`, `--chart-b`, `--chart-grid`; `.is-active` on the step being read (Task 4 sets it).

- [ ] **Step 1: Write the failing layout tests**

`tests/ocean/e2e/layout.spec.js`:

```js
import { test, expect } from '@playwright/test';

const TITLES = [
	'A flat white plane',
	'One sine wave',
	'Many sine waves',
	'Light',
	'Pointy crests',
	'The repetition problem',
	'Real ocean data',
	'A random ocean, moving',
	'The FFT',
	'Three layers of waves',
	'Foam',
	'Glow',
	'The whole thing',
];
const CARD_STEPS = [1, 2, 3, 4, 6, 9, 10, 11, 12];

function watch(page) {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	return errors;
}

// WCAG contrast of two sRGB colours given as [r, g, b] bytes.
function contrast(a, b) {
	const lum = (rgb) => {
		const [r, g, bl] = rgb.map((v) => {
			const c = v / 255;
			return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

const parse = (css) => css.match(/[\d.]+/g).map(Number);
const over = (rgba, backdrop) => {
	const alpha = rgba.length > 3 ? rgba[3] : 1;
	return [0, 1, 2].map((i) => rgba[i] * alpha + backdrop[i] * (1 - alpha));
};

test('the title, the opening and thirteen steps in order', async ({ page }) => {
	await page.goto('/ocean/');
	await expect(page).toHaveTitle('Building an Ocean in Roblox');
	await expect(page.locator('#opening h1')).toHaveText('Building an Ocean in Roblox');
	await expect(page.locator('#opening .cue')).toContainText('Scroll to build it from nothing');
	await expect(page.locator('#opening .lede')).toContainText('Roblox fought me the whole way');
	const steps = page.locator('section.step[data-step]');
	await expect(steps).toHaveCount(13);
	for (let n = 1; n <= 13; n++) {
		await expect(page.locator(`#step-${n}`)).toHaveAttribute('data-step', String(n));
		await expect(page.locator(`#step-${n}-title`)).toHaveText(TITLES[n - 1]);
		await expect(page.locator(`#step-${n} [data-controls="${n}"]`)).toHaveCount(1);
	}
});

test('every step to 12 has a collapsed maths line, and the cards sit where the spec puts them', async ({ page }) => {
	await page.goto('/ocean/');
	for (let n = 1; n <= 12; n++) {
		const math = page.locator(`#step-${n} details.math`);
		await expect(math).toHaveCount(1);
		expect(await math.evaluate((d) => d.open)).toBe(false);
		await expect(math.locator('summary')).toHaveText('The math');
		expect((await math.locator('.tex code').textContent()).trim().length).toBeGreaterThan(10);
		const cards = page.locator(`#step-${n} aside.card`);
		await expect(cards).toHaveCount(CARD_STEPS.includes(n) ? 1 : 0);
		if (CARD_STEPS.includes(n)) {
			await expect(cards.locator('h3')).toHaveText('Roblox says no');
			await expect(cards.locator('dt')).toHaveText(['Normally', 'In Roblox', 'What I did', 'The number']);
		}
	}
	await expect(page.locator('#step-13 aside.card')).toHaveCount(0);
	for (const [step, kind] of [[7, 'spectrum'], [8, 'phase'], [9, 'transforms']]) {
		await expect(page.locator(`#step-${step} figure.chart[data-chart="${kind}"]`)).toHaveCount(1);
	}
});

test('the finale holds its blocks, with footage, Play and the render toggle hidden', async ({ page }) => {
	await page.goto('/ocean/');
	for (const id of ['live', 'proof-block', 'recap', 'believed', 'credits']) {
		await expect(page.locator(`#step-13 #${id}`)).toHaveCount(1);
	}
	await expect(page.locator('#footage')).toBeHidden();
	await expect(page.locator('#play')).toBeHidden();
	await expect(page.locator('[data-render-mode]')).toBeHidden();
	await expect(page.locator('#believed h3')).toHaveText('Things we believed about Roblox that turned out false');
	for (const href of [
		'https://www.youtube.com/watch?v=PH9q0HNBjT4',
		'https://www.youtube.com/watch?v=yPfagLeUa7k',
		'https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf',
		'https://gpuopen.com/gdc-presentations/2019/gdc-2019-agtd6-interactive-water-simulation-in-atlas.pdf',
		'https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf',
		'https://github.com/howhow2315/jonswap-ocean',
	]) {
		await expect(page.locator(`#credits a[href="${href}"]`)).toHaveCount(1);
	}
});

test('on desktop the panels sit in the left third over the full-screen ocean', async ({ page }) => {
	await page.goto('/ocean/');
	const canvas = await page.locator('#ocean').boundingBox();
	expect(canvas.width).toBe(1366);
	expect(canvas.height).toBe(767);
	await page.locator('#step-3').scrollIntoViewIfNeeded();
	const panel = await page.locator('#step-3 .panel').boundingBox();
	expect(panel.x).toBeGreaterThanOrEqual(16);
	expect(panel.x + panel.width).toBeLessThanOrEqual(1366 / 3);
});

test('nothing on the page uses backdrop-filter, and only the canvas carries a filter', async ({ page }) => {
	await page.goto('/ocean/');
	const offenders = await page.evaluate(() => [...document.querySelectorAll('*')]
		.filter((el) => {
			const style = getComputedStyle(el);
			return (style.backdropFilter && style.backdropFilter !== 'none') || (style.filter !== 'none' && el.id !== 'ocean');
		})
		.map((el) => el.tagName + (el.id ? `#${el.id}` : '') + (el.className ? `.${el.className}` : '')));
	expect(offenders).toEqual([]);
});

for (const scheme of ['dark', 'light']) {
	test(`panel text keeps 4.5:1 contrast over a black or a white sea when the system prefers ${scheme} (the page is always dark)`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });
		await page.goto('/ocean/');
		const { ink, glass, cardInk, cardBg } = await page.evaluate(() => ({
			ink: getComputedStyle(document.querySelector('#step-2 .panel p')).color,
			glass: getComputedStyle(document.querySelector('#step-2 .panel')).backgroundColor,
			cardInk: getComputedStyle(document.querySelector('#step-2 .card dd')).color,
			cardBg: getComputedStyle(document.querySelector('#step-2 .card')).backgroundColor,
		}));
		for (const backdrop of [[0, 0, 0], [255, 255, 255]]) {
			const panel = over(parse(glass), backdrop);
			expect(contrast(parse(ink).slice(0, 3), panel)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(parse(cardInk).slice(0, 3), over(parse(cardBg), panel))).toBeGreaterThanOrEqual(4.5);
		}
	});
}

test.describe('on a phone in portrait', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

	test('the ocean fills the top half above the panels and nothing scrolls sideways (Review Focus 5)', async ({ page }) => {
		await page.goto('/ocean/');
		const canvas = await page.locator('#ocean').boundingBox();
		expect(canvas.y).toBe(0);
		expect(Math.abs(canvas.height - 422)).toBeLessThanOrEqual(1);
		const layers = await page.evaluate(() => ({
			canvas: Number(getComputedStyle(document.getElementById('ocean')).zIndex),
			story: Number(getComputedStyle(document.getElementById('story')).zIndex),
		}));
		expect(layers.canvas).toBeGreaterThan(layers.story);
		await page.locator('#step-7').scrollIntoViewIfNeeded();
		const panel = await page.locator('#step-7 .panel').boundingBox();
		expect(panel.x).toBeGreaterThanOrEqual(15);
		expect(panel.x + panel.width).toBeLessThanOrEqual(375);
		for (const id of ['opening', 'step-4', 'step-13', 'credits']) {
			await page.locator(`#${id}`).scrollIntoViewIfNeeded();
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
		}
	});
});

test('with three blocked the whole story still reads (Review Focus 3)', async ({ page }) => {
	const errors = watch(page);
	await page.route('**/npm/three@0.186.1/**', (route) => route.abort());
	await page.goto('/ocean/');
	await expect(page.locator('body')).toHaveAttribute('data-ocean', 'unavailable');
	for (let n = 1; n <= 13; n++) {
		await page.locator(`#step-${n}`).scrollIntoViewIfNeeded();
		await expect(page.locator(`#step-${n}-title`)).toBeVisible();
	}
	await expect(page.locator('#step-9 .card')).toContainText('12,288');
	await expect(page.locator('#step-7 figure.chart')).toBeHidden();
	expect(errors).toEqual([]);
});

test('the home page links to the ocean, and the ocean links home', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('a[href="/ocean/"]')).toHaveText('Building an Ocean in Roblox');
	await page.goto('/ocean/');
	await expect(page.locator('header.site a[href="/"]')).toHaveCount(1);
	await expect(page.locator('footer.site a[href="/"]')).toHaveCount(1);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/layout.spec.js`
Expected: FAIL: the title is `Roblox Ocean`, `#opening` does not exist.

- [ ] **Step 3: Replace `content/ocean/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Building an Ocean in Roblox</title>
	<meta name="description" content="I built a Sea of Thieves-style ocean in Roblox, and Roblox fought me the whole way. Scroll to build it from nothing, live in your browser.">
	<meta name="color-scheme" content="dark">
	<link rel="canonical" href="https://coleuhlig.com/ocean/">
	<script src="/js/canonical-host.js"></script>
	<link rel="stylesheet" href="style.css">
	<link rel="stylesheet" href="proof.css">
	<script type="importmap">
	{
		"imports": {
			"three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js",
			"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/",
			"gsap": "https://cdn.jsdelivr.net/npm/gsap@3.15.0/index.js",
			"gsap/ScrollTrigger": "https://cdn.jsdelivr.net/npm/gsap@3.15.0/ScrollTrigger.js",
			"katex": "https://cdn.jsdelivr.net/npm/katex@0.18.10/dist/katex.mjs"
		}
	}
	</script>
</head>
<body>
	<header class="site"><a href="/">coleuhlig.com</a></header>
	<canvas id="ocean" aria-label="Live ocean simulation"></canvas>
	<div id="notice" role="status" hidden></div>
	<pre id="stats" hidden></pre>
	<button id="motion" class="motion" type="button" hidden>Pause the ocean</button>
	<noscript><p class="noscript">The live ocean needs JavaScript. The story below reads fine without it.</p></noscript>

	<main id="story">
		<section id="opening" class="opening">
			<div class="opening-inner">
				<h1>Building an Ocean in Roblox</h1>
				<p class="lede">I built this in Roblox, and Roblox fought me the whole way. The sea behind this text is a port of that ocean, running live in your browser.</p>
				<p class="cue">Scroll to build it from nothing <span aria-hidden="true">↓</span></p>
			</div>
		</section>

		<section class="step" id="step-1" data-step="1" aria-labelledby="step-1-title">
			<article class="panel">
				<h2 id="step-1-title">A flat white plane</h2>
				<p>Every game ocean starts out boring: a flat sheet of points joined into triangles. Everything after this is about moving those points.</p>
				<div class="controls" data-controls="1" data-copy-skip="live"></div>
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>\htmlClass{t-grid}{(x_i,\ z_j)} = (i\,\Delta,\ j\,\Delta), \qquad y_{ij} = 0</code></div>
					<p class="math-note">A grid of points Δ apart, every height zero. The wireframe shows the triangles between them.</p>
				</details>
				<aside class="card" aria-label="Roblox says no">
					<h3>Roblox says no</h3>
					<dl>
						<dt>Normally</dt>
						<dd>You hand the graphics card a mesh once, and it takes it from there.</dd>
						<dt>In Roblox</dt>
						<dd>There's no way to give the GPU your own moving mesh. The surface has to be built by a script while the game runs, with EditableMesh.</dd>
						<dt>What I did</dt>
						<dd>Built the sea out of mesh patches in rings around the camera, plus a horizon that reaches the edge of the world.</dd>
						<dt>The number</dt>
						<dd>224 patches in 5 rings.</dd>
					</dl>
				</aside>
			</article>
		</section>

		<section class="step" id="step-2" data-step="2" aria-labelledby="step-2-title">
			<article class="panel">
				<h2 id="step-2-title">One sine wave</h2>
				<p>Lift the points with a sine wave and the floor starts to roll. Three knobs make a wave: how tall, how long, how fast.</p>
				<div class="controls" data-controls="2" data-copy-skip="live"></div>
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>y = \htmlClass{t-amp}{A}\,\sin\!\big(\htmlClass{t-len}{k}\,x - \htmlClass{t-speed}{\omega}\,t\big), \qquad \htmlClass{t-len}{k} = \frac{2\pi}{\htmlClass{t-len}{\lambda}}</code></div>
					<p class="math-note">A is the height, λ the length from crest to crest, and the wave travels at ω/k.</p>
				</details>
				<aside class="card" aria-label="Roblox says no">
					<h3>Roblox says no</h3>
					<dl>
						<dt>Normally</dt>
						<dd>A vertex shader moves every point on the GPU, thousands at a time, almost for free.</dd>
						<dt>In Roblox</dt>
						<dd>No vertex shaders. A Luau script has to move every point itself.</dd>
						<dt>What I did</dt>
						<dd>Wrote every point from a script, every frame: 18,144 of them (the outermost ring every other frame).</dd>
						<dt>The number</dt>
						<dd>About 3.5 ms a frame in Studio with Luau's native code generation, 7.7 ms without it. Roblox documents native code for servers, and I haven't measured a player's client yet.</dd>
					</dl>
				</aside>
			</article>
		</section>

		<section class="step" id="step-3" data-step="3" aria-labelledby="step-3-title">
			<article class="panel">
				<h2 id="step-3-title">Many sine waves</h2>
				<p>One wave looks like a machine. Stack up waves with their own directions, lengths and speeds, and it starts to look like water. These are the 32 waves from the Roblox ocean I started from, tallest first.</p>
				<div class="controls" data-controls="3" data-copy-skip="live"></div>
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>y(\mathbf{x}, t) = \sum_{i=1}^{\htmlClass{t-count}{N}} A_i \sin(\mathbf{k}_i\cdot\mathbf{x} - \omega_i t + \varphi_i)</code></div>
					<p class="math-note">N waves, each with its own height, direction, length and starting phase. The last few barely show: they're small, and fitting them to the tile's grid stacked a few on top of each other.</p>
				</details>
				<aside class="card" aria-label="Roblox says no">
					<h3>Roblox says no</h3>
					<dl>
						<dt>Normally</dt>
						<dd>Each extra wave is a few more instructions in a shader, spread across the GPU's thousands of cores.</dd>
						<dt>In Roblox</dt>
						<dd>Each extra wave is another trip of a Luau loop over every point, on the CPU, inside the frame.</dd>
						<dt>What I did</dt>
						<dd>Kept the count down. From the next step on, this page sums the 16 tallest.</dd>
						<dt>The number</dt>
						<dd>All 32 over 18,144 points cost about 27 ms a frame in this page's JavaScript (measured in Node). A 60 fps frame lasts 16.7 ms.</dd>
					</dl>
				</aside>
			</article>
		</section>

		<section class="step" id="step-4" data-step="4" aria-labelledby="step-4-title">
			<article class="panel">
				<h2 id="step-4-title">Light</h2>
				<p>Shape alone reads as grey mush; light makes it water. The sun brightens whatever faces it, and a highlight and a reflection of the sky do the rest.</p>
				<div class="controls" data-controls="4" data-copy-skip="live"></div>
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>\mathbf{n} = \frac{(-\partial_x y,\ 1,\ -\partial_z y)}{\lVert(-\partial_x y,\ 1,\ -\partial_z y)\rVert}, \quad L = \max(0,\ \mathbf{n}\cdot\htmlClass{t-sun}{\mathbf{s}}), \quad F = F_0 + (1 - F_0)(1 - \mathbf{n}\cdot\mathbf{v})^5</code></div>
					<p class="math-note">n is the way the surface faces, s points at the sun and v at your eye. L is the plain sunlight, and F (Schlick's Fresnel term) is why water turns into a mirror when you look across it.</p>
				</details>
				<aside class="card" aria-label="Roblox says no">
					<h3>Roblox says no</h3>
					<dl>
						<dt>Normally</dt>
						<dd>A pixel shader works out the colour of every pixel on screen, every frame.</dd>
						<dt>In Roblox</dt>
						<dd>No pixel shaders. Colour has to be painted into an image and wrapped onto the mesh. Ripples come from a normal map, and on a mesh built by code that only worked when I passed the map in the moment the material was created; assigning it afterwards, the obvious way, broke the shine.</dd>
						<dt>What I did</dt>
						<dd>Paint the colour, the glow mask and the ripple map on a worker thread, and hand Roblox one image per frame, which is all it uploads anyway.</dd>
						<dt>The number</dt>
						<dd>Handing over the frame's image costs 0.037 ms of script time in Studio.</dd>
					</dl>
				</aside>
			</article>
		</section>

		<section class="step" id="step-5" data-step="5" aria-labelledby="step-5-title">
			<article class="panel">
				<h2 id="step-5-title">Pointy crests</h2>
				<p>Real waves have sharp tops and wide troughs, because the water moves in circles. Slide each point toward the nearest crest as well as up (a Gerstner wave) and the tops pinch into points; push too far and they fold over themselves.</p>
				<div class="controls" data-controls="5" data-copy-skip="live"></div>
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>\mathbf{x}' = \mathbf{x} + \htmlClass{t-chop}{c}\sum_i \hat{\mathbf{k}}_i\,A_i\cos\theta_i, \qquad y = \sum_i A_i \sin\theta_i, \qquad \theta_i = \mathbf{k}_i\cdot\mathbf{x} - \omega_i t + \varphi_i</code></div>
					<p class="math-note">Each point also moves sideways along each wave's direction k̂, by the choppiness c times that wave's height.</p>
				</details>
			</article>
		</section>

		<section class="step" id="step-6" data-step="6" aria-labelledby="step-6-title">
			<article class="panel">
				<h2 id="step-6-title">The repetition problem</h2>
				<p>Fly up and the trick falls apart. Every wave here fits a 256-stud tile exactly, so the whole sea is one tile copied over and over: invisible from the deck, wallpaper from up here.</p>
				<div class="controls" data-controls="6" data-copy-skip="live"></div>
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>y(\mathbf{x} + \htmlClass{t-tile}{L}\,\mathbf{e}_x) = y(\mathbf{x} + \htmlClass{t-tile}{L}\,\mathbf{e}_z) = y(\mathbf{x}) \quad\text{when every}\quad \mathbf{k}_i = \frac{2\pi}{\htmlClass{t-tile}{L}}\,(m_i,\ n_i)</code></div>
					<p class="math-note">Waves whose wavevectors sit on that grid all line up again after L studs. Here L is the 256-stud tile.</p>
				</details>
				<aside class="card" aria-label="Roblox says no">
					<h3>Roblox says no</h3>
					<dl>
						<dt>Normally</dt>
						<dd>Tessellation hardware adds triangles near the camera and drops them far away, on the fly.</dd>
						<dt>In Roblox</dt>
						<dd>No tessellation. Whatever detail the sea has must already be in the mesh.</dd>
						<dt>What I did</dt>
						<dd>Rings of patches around the camera, each ring twice as coarse as the one inside it, snapping to a fixed world grid as the camera moves so nothing swims.</dd>
						<dt>The number</dt>
						<dd>Points 2, 4, 8, 16 and 32 studs apart, ring by ring.</dd>
					</dl>
				</aside>
			</article>
		</section>

		<section class="step" id="step-7" data-step="7" aria-labelledby="step-7-title">
			<article class="panel">
				<h2 id="step-7-title">Real ocean data</h2>
				<p>Instead of picking waves by hand, ask oceanographers. The JONSWAP spectrum, fitted to North Sea measurements, gives the energy at each wavelength for a wind speed and a fetch (how far the wind has blown over open water).</p>
				<div class="controls" data-controls="7" data-copy-skip="live"></div>
				<figure class="chart" data-chart="spectrum" data-copy-skip="live">
					<div class="chart-body"></div>
					<figcaption>Energy at each wave frequency for the sea on screen, and which layer of waves carries it.</figcaption>
				</figure>
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>S(\omega) = \frac{\alpha g^2}{\omega^5}\exp\!\left[-\frac{5}{4}\left(\frac{\omega_p}{\omega}\right)^4\right]\gamma^{\,r}, \quad \omega_p = 22\left(\frac{g^2}{\htmlClass{t-wind}{U}\,\htmlClass{t-fetch}{F}}\right)^{1/3}, \quad \alpha = 0.076\left(\frac{\htmlClass{t-wind}{U}^2}{\htmlClass{t-fetch}{F}\,g}\right)^{0.22}</code></div>
					<p class="math-note">U is the wind speed and F the fetch; ω_p is where the energy peaks. γ = 3.3 sharpens the peak, and a spreading function D(θ) fans each wave's energy out around the wind direction.</p>
				</details>
			</article>
		</section>

		<section class="step" id="step-8" data-step="8" aria-labelledby="step-8-title">
			<article class="panel">
				<h2 id="step-8-title">A random ocean, moving</h2>
				<p>A real sea isn't a neat set of chosen waves, so each wave from the spectrum gets a random height from a bell curve and a random starting angle, then spins at its own speed (long waves travel faster than short ones). The arrows are real waves from this sea, spinning.</p>
				<div class="controls" data-controls="8" data-copy-skip="live"></div>
				<figure class="chart" data-chart="phase" data-copy-skip="live">
					<div class="chart-body"></div>
					<figcaption>The tallest waves in the 256-stud layer, each one an arrow turning at its own speed.</figcaption>
				</figure>
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>\tilde h_0(\mathbf{k}) = \tfrac{1}{\sqrt{2}}\,(\xi_r + i\,\xi_i)\sqrt{S(\mathbf{k})\,\Delta k_x\,\Delta k_z}, \quad \tilde h(\mathbf{k}, t) = \tilde h_0(\mathbf{k})\,e^{i\omega t} + \tilde h_0^{*}(-\mathbf{k})\,e^{-i\omega t}, \quad \omega = \sqrt{g k \tanh(k d)}, \quad e^{i\theta} = \cos\theta + i\sin\theta</code></div>
					<p class="math-note">The ξ are random numbers from a bell curve, picked by the seed (the New sea button). In deep water ω is close to √(gk), so long waves outrun short ones, and Euler's formula turns each wave into an arrow spinning in the complex plane. The random numbers come from a documented generator rather than Roblox's own, so this is the same kind of sea as the game's, not the same waves.</p>
				</details>
			</article>
		</section>

		<section class="step" id="step-9" data-step="9" aria-labelledby="step-9-title">
			<article class="panel">
				<h2 id="step-9-title">The FFT</h2>
				<p>Adding up thousands of waves at every point, one by one, is hopeless. The fast Fourier transform does the same sum for a whole grid at once by reusing work; pick a grid size and this page times both ways, right now, in your browser.</p>
				<div class="controls" data-controls="9" data-copy-skip="live"></div>
				<figure class="chart" data-chart="transforms" data-copy-skip="live">
					<div class="chart-body"></div>
					<figcaption>The same sum done wave by wave and by the FFT, timed in your browser.</figcaption>
				</figure>
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>h(\mathbf{x}, t) = \sum_{\mathbf{k}} \tilde h(\mathbf{k}, t)\,e^{i\,\mathbf{k}\cdot\mathbf{x}}, \qquad \underbrace{O(\htmlClass{t-n}{N}^4)}_{\text{wave by wave}} \;\to\; \underbrace{O(\htmlClass{t-n}{N}^2 \log \htmlClass{t-n}{N})}_{\text{FFT}}, \qquad \begin{aligned} X &amp;= E + W^k O \\ Y &amp;= E - W^k O \end{aligned}</code></div>
					<p class="math-note">For an N × N grid, summing wave by wave costs N⁴ steps. The radix-2 FFT splits the sum in half again and again, and each butterfly (X and Y) gets two answers out of one multiply.</p>
				</details>
				<aside class="card" aria-label="Roblox says no">
					<h3>Roblox says no</h3>
					<dl>
						<dt>Normally</dt>
						<dd>The FFT runs on the GPU as a compute shader, alongside everything else.</dd>
						<dt>In Roblox</dt>
						<dd>No GPU compute. The FFT is written in Luau and runs on the CPU, on three worker Actors (Parallel Luau), 64 × 64 per layer.</dd>
						<dt>What I did</dt>
						<dd>Kept every layer at 64 × 64, so the whole sea is at most 3 × 64 × 64 = 12,288 wave components on a CPU script. Acerola's GPU ocean runs about 4 million.</dd>
						<dt>The number</dt>
						<dd>One 64 × 64 inverse FFT takes 1.00 ms in Studio on my MacBook Air.</dd>
					</dl>
				</aside>
			</article>
		</section>

		<section class="step" id="step-10" data-step="10" aria-labelledby="step-10-title">
			<article class="panel">
				<h2 id="step-10-title">Three layers of waves</h2>
				<p>One 64 × 64 grid can't hold both the long swells and the small ripples, so there are three, tiling patches of 256, 64 and 16 studs. The tiles don't line up, so your eye stops finding the pattern: it's still there, just well hidden. That's how 12,288 wave components pass for far more.</p>
				<div class="controls" data-controls="10" data-copy-skip="live"></div>
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>h(\mathbf{x}, t) = \sum_{j=1}^{3} h_j(\mathbf{x}, t), \qquad h_j \text{ keeps only } k_j^{\min} \le \lvert\mathbf{k}\rvert &lt; k_j^{\max}, \qquad \htmlClass{t-layer}{L_j} = 256,\ 64,\ 16</code></div>
					<p class="math-note">Each layer carries only the wavelengths that suit its patch, so no wave is counted twice.</p>
				</details>
				<aside class="card" aria-label="Roblox says no">
					<h3>Roblox says no</h3>
					<dl>
						<dt>Normally</dt>
						<dd>Each layer is a GPU pass, and they all finish together every frame.</dd>
						<dt>In Roblox</dt>
						<dd>Three worker Actors that take turns: each layer got a fresh result only every third frame.</dd>
						<dt>What I did</dt>
						<dd>Fade from each layer's old result to its new one, counted in frames.</dd>
						<dt>The number</dt>
						<dd>Before the fade it looked like 20 fps. The game ran at about 44 fps, but the waves only moved 15 times a second.</dd>
					</dl>
				</aside>
			</article>
		</section>

		<section class="step" id="step-11" data-step="11" aria-labelledby="step-11-title">
			<article class="panel">
				<h2 id="step-11-title">Foam</h2>
				<p>Where a wave gets steep enough to fold, it breaks, and breaking water turns white. The maths can spot exactly where the surface squeezes together; each frame adds foam there and old foam fades a little, so it trails off in streaks.</p>
				<div class="controls" data-controls="11" data-copy-skip="live"></div>
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>J = (1 + \partial_x D_x)(1 + \partial_z D_z) - \partial_x D_z\,\partial_z D_x, \qquad f \leftarrow \operatorname{clamp}\!\big(\htmlClass{t-fade}{d}\,f + g\,\max(0,\ \htmlClass{t-whitecap}{w} - J),\ 0,\ 1\big)</code></div>
					<p class="math-note">J (the Jacobian) drops below the whitecap level w where the water folds. f is the foam: it grows there, and everywhere it keeps a fraction d of itself each step.</p>
				</details>
				<aside class="card" aria-label="Roblox says no">
					<h3>Roblox says no</h3>
					<dl>
						<dt>Normally</dt>
						<dd>Foam lives in a texture the GPU updates in place, every frame.</dd>
						<dt>In Roblox</dt>
						<dd>Game scripts can't swap a material's textures; only plugins can. Every image has to be handed over the moment the material is created, and after that I can only rewrite its pixels.</dd>
						<dt>What I did</dt>
						<dd>Run the foam on a painter worker and paint it into the colour map a quarter at a time.</dd>
						<dt>The number</dt>
						<dd>A 256 × 256 foam field, painted into the 512 × 512 colour map.</dd>
					</dl>
				</aside>
			</article>
		</section>

		<section class="step" id="step-12" data-step="12" aria-labelledby="step-12-title">
			<article class="panel">
				<h2 id="step-12-title">Glow</h2>
				<p>The last touch is the one Sea of Thieves is famous for: wave tops glow blue-green when the sun shines through them. It's light scattering inside the water, strongest near the crests when you look toward the sun.</p>
				<div class="controls" data-controls="12" data-copy-skip="live"></div>
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>E = \htmlClass{t-glow}{k}\,\max(0,\ -\mathbf{s}\cdot\mathbf{v})^{3}\,\big(\tfrac{1}{2} - \tfrac{1}{2}\,\htmlClass{t-sun}{s_y}\big), \qquad \text{glow} = E \cdot M(h)</code></div>
					<p class="math-note">v points from the water to your eye and s toward the sun, so E is largest looking into a low sun. M(h) is a mask from the wave's height above the average surface: crests glow, troughs don't.</p>
				</details>
				<aside class="card" aria-label="Roblox says no">
					<h3>Roblox says no</h3>
					<dl>
						<dt>Normally</dt>
						<dd>A lighting hook or a pixel shader adds the scattered light, pixel by pixel.</dd>
						<dt>In Roblox</dt>
						<dd>No lighting hooks. The only thing a script can turn is how strongly each material glows.</dd>
						<dt>What I did</dt>
						<dd>An emissive mask painted from the waves, plus one glow strength per patch, set on 232 separate materials every frame. Sea of Thieves' published mask measured wrong on my waves (it lit their sides, not their crests), so the mask is height above the average surface instead.</dd>
						<dt>The number</dt>
						<dd>Those 232 glow writes take 0.062 ms a frame in Studio.</dd>
					</dl>
				</aside>
			</article>
		</section>

		<section class="step step-finale" id="step-13" data-step="13" aria-labelledby="step-13-title">
			<article class="panel">
				<h2 id="step-13-title">The whole thing</h2>
				<p>That's all of it at once: three layers of FFT waves on the CPU, foam, glow, painted maps and 232 materials, with a script moving all 18,144 points. Scroll back up any time; every step still works.</p>
				<div class="controls" data-controls="13" data-copy-skip="live"></div>
				<div class="render-mode" data-render-mode hidden>
					<p class="render-mode-label">Rendering</p>
					<div class="segmented" role="radiogroup" aria-label="Rendering">
						<button type="button" role="radio" aria-checked="true" data-mode="roblox">Roblox mode</button>
						<button type="button" role="radio" aria-checked="false" data-mode="unleashed">Unleashed</button>
					</div>
					<p>Unleashed runs the same wave maths through GPU shaders, the way a normal engine would. The gap between the two is what Roblox costs.</p>
				</div>
			</article>

			<section class="block" id="live" aria-labelledby="live-title">
				<h3 id="live-title">How it's running for you</h3>
				<p class="dim">Measured in your browser, right now.</p>
				<dl class="live" data-live data-copy-skip="live"></dl>
				<p data-live-phone hidden>Your screen looks like a phone's, so the page picked the lighter tier by rule: 6,480 points instead of 18,144, and two layers of waves instead of three. I haven't measured this ocean on a phone myself yet.</p>
				<p data-live-none hidden>The live ocean isn't running in this browser, so there's nothing to measure.</p>
				<p>For comparison, in a Roblox Studio playtest on my MacBook Air the same ocean holds 60 fps: a 16.65 ms median frame with 2.81 ms of script time. That's with native code on, and I haven't measured a live Roblox client yet.</p>
				<p>I matched this page's look to Studio captures over three rounds of lighting changes. My verdict: looks pretty good. It isn't pixel for pixel the same, and can't be: a browser doesn't light things the way Roblox does.</p>
			</section>

			<section class="block" id="footage" aria-labelledby="footage-title" hidden>
				<h3 id="footage-title">The real thing, in Roblox Studio</h3>
				<p>Recorded in Studio, with the camera flown along fixed paths.</p>
				<div class="clips" data-clips></div>
			</section>

			<section class="block" id="proof-block" aria-labelledby="proof-title">
				<h3 id="proof-title">This is the actual Roblox code</h3>
				<p>The panel below runs the ocean's real Luau modules in your browser, compiled to WebAssembly (luau-interop, a fork of Luau 0.711), next to this page's JavaScript version of the same code, and compares what they produce. The Luau takes well under a second once it has loaded; the JavaScript takes milliseconds.</p>
				<p>When I checked six cascades at four seeds, all 196,608 float32 values matched bit for bit, and so did the maps.</p>
				<div id="proof" data-copy-skip="live"></div>
			</section>

			<p class="play-row"><a id="play" class="play" rel="noopener" target="_blank" hidden>Play it in Roblox</a></p>

			<section class="block" id="recap" aria-labelledby="recap-title">
				<h3 id="recap-title">Every time Roblox said no</h3>
				<ul>
					<li>No moving meshes on the GPU: a script builds the surface with EditableMesh.</li>
					<li>No vertex shaders: a script moves every point, every frame.</li>
					<li>No pixel shaders: colour, glow and ripples are painted into images.</li>
					<li>No tessellation: rings of patches around the camera instead.</li>
					<li>No GPU compute: the FFT runs in Luau on three worker Actors.</li>
					<li>Workers take turns: a frame-counted fade hides it.</li>
					<li>No texture swaps from game scripts: every image is handed over up front.</li>
					<li>No lighting hooks: 232 materials, each with its own glow.</li>
				</ul>
			</section>

			<section class="block" id="believed" aria-labelledby="believed-title">
				<h3 id="believed-title">Things we believed about Roblox that turned out false</h3>
				<p>Each of these was treated as fact until a test in Studio said otherwise.</p>
				<ul>
					<li><strong>EditableMesh is capped at 8 meshes per player.</strong> It's a shared memory budget; fixed-size meshes are charged what they really use.</li>
					<li><strong>A script can give a material an editable image by setting its ColorMapContent.</strong> Only plugins can do that; a game script has to use CreateSurfaceAppearanceAsync.</li>
					<li><strong>Normal maps don't work on meshes built by code.</strong> They do, if the map is passed in when the material is created.</li>
					<li><strong>Luau costs about 0.1 microseconds per arithmetic operation.</strong> It's about 0.0026, roughly 40 times faster.</li>
					<li><strong>Texture coordinates stay precise far from the origin.</strong> At 100,000 the texels tore apart, so the sea re-bases them by whole tiles.</li>
					<li><strong>Normal maps show at any distance.</strong> It depends on the graphics quality: at level 6 the ripples are gone by 170 studs.</li>
					<li><strong>A running Studio picks up a newly installed plugin.</strong> It doesn't; restart it.</li>
				</ul>
			</section>

			<section class="block" id="credits" aria-labelledby="credits-title">
				<h3 id="credits-title">Credits</h3>
				<ul>
					<li>The step-by-step order comes from Acerola's two videos, <a href="https://www.youtube.com/watch?v=PH9q0HNBjT4">How Games Fake Water</a> and <a href="https://www.youtube.com/watch?v=yPfagLeUa7k">I Tried Simulating The Entire Ocean</a>. Watch them. The words, visuals and code here are mine.</li>
					<li>Jerry Tessendorf, <a href="https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf">Simulating Ocean Water</a>: the SIGGRAPH course notes (2001, revised 2004) that every FFT ocean is built on.</li>
					<li><a href="https://gpuopen.com/gdc-presentations/2019/gdc-2019-agtd6-interactive-water-simulation-in-atlas.pdf">Wakes, Explosions and Lighting: Interactive Water Simulation in Atlas</a> (Mihelich and Tcheblokov, GDC 2019): the JONSWAP setup and the scatter term behind the glow.</li>
					<li>Rare's <a href="https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf">The Technical Art of Sea of Thieves</a> (SIGGRAPH 2018; <a href="https://www.youtube.com/watch?v=y9BOz2dFZzs">the talk</a>): foam and the stylised look.</li>
					<li><a href="https://github.com/howhow2315/jonswap-ocean">howhow2315/JONSWAP-Ocean</a>: the Roblox ocean my prototype started from.</li>
					<li><a href="https://github.com/xNasuni/luau-web">luau-web</a> runs the Luau in your browser; three.js, GSAP and KaTeX do the rest.</li>
				</ul>
			</section>
		</section>
	</main>

	<footer class="site"><a href="/">Back to coleuhlig.com</a></footer>
	<script type="module" src="js/boot.js"></script>
</body>
</html>
```

- [ ] **Step 4: Replace `content/ocean/style.css`**

```css
/* The ocean showcase page (piece C): a full-screen live ocean pinned behind glass panels that
   scroll over it. Below 900 px the ocean takes the top half and the panels scroll beneath it.
   Colours are tokens with a light and a dark set. No backdrop-filter and no filter here: the
   canvas already carries render/lighting.js CSS_FILTER, and another filter over a full-screen
   WebGL canvas would be re-composited every frame (A2 final review). */
:root {
	--body-bg: #0b1a24;
	--ink: #e8eef2;
	--ink-dim: #a9bcc8;
	--glass: rgba(7, 18, 27, 0.86);
	--line: rgba(232, 238, 242, 0.14);
	--accent: #5fd4c4;
	--card-bg: rgba(92, 20, 20, 0.6);
	--card-line: #ff8a7a;
	--card-ink: #ffe3de;
	--card-head: #ffb4a8;
	--chart-bg: #0a1822;
	--chart-ink: #e8eef2;
	--chart-a: #5fd4c4;
	--chart-b: #f2b25c;
	--chart-grid: rgba(232, 238, 242, 0.18);
	--term-a: #f2b25c;
	--term-b: #5fd4c4;
	--term-c: #ff8fb1;
	--warn: #ffb4a8;
	--panel-width: clamp(300px, 30vw, 440px);
	--gutter: 16px;
}

html {
	background: var(--body-bg);
}

body {
	margin: 0;
	background: var(--body-bg);
	color: var(--ink);
	font: 16px/1.55 system-ui, -apple-system, 'Segoe UI', sans-serif;
	overflow-x: clip;
}

a {
	color: var(--accent);
}

#ocean {
	position: fixed;
	inset: 0;
	width: 100%;
	height: 100%;
	display: block;
	z-index: 0;
}

header.site {
	position: fixed;
	top: 12px;
	right: var(--gutter);
	z-index: 3;
	padding: 6px 12px;
	border-radius: 999px;
	background: var(--glass);
	border: 1px solid var(--line);
	font-size: 0.85rem;
}

header.site a {
	color: var(--ink);
	text-decoration: none;
}

#notice {
	position: fixed;
	inset: auto var(--gutter) var(--gutter) var(--gutter);
	z-index: 4;
	max-width: 640px;
	padding: 12px 16px;
	background: var(--glass);
	border-left: 3px solid var(--warn);
	color: var(--ink);
}

#stats {
	position: fixed;
	top: 8px;
	left: 8px;
	z-index: 4;
	margin: 0;
	padding: 8px 10px;
	background: var(--glass);
	color: var(--ink);
	font: 12px/1.35 ui-monospace, monospace;
	pointer-events: none;
	max-width: calc(100% - 32px);
	white-space: pre-wrap;
}

.motion {
	position: fixed;
	right: var(--gutter);
	bottom: var(--gutter);
	z-index: 3;
	padding: 8px 14px;
	border-radius: 999px;
	border: 1px solid var(--line);
	background: var(--glass);
	color: var(--ink);
	font: inherit;
	font-size: 0.9rem;
	cursor: pointer;
}

.noscript {
	position: relative;
	z-index: 1;
	margin: 16px;
}

/* The story scrolls over the canvas. Its empty space lets the pointer through to the ocean, so the
   visitor can drag to orbit between panels; everything readable takes the pointer back. */
main#story {
	position: relative;
	z-index: 1;
	pointer-events: none;
	counter-reset: step;
}

.panel,
.block,
.play-row,
.opening-inner,
footer.site {
	pointer-events: auto;
}

.opening {
	min-height: 100vh;
	min-height: 100svh;
	display: grid;
	place-items: center;
	text-align: center;
	padding: 0 var(--gutter);
	box-sizing: border-box;
}

.opening h1 {
	margin: 0 0 12px;
	font-size: clamp(2.2rem, 6vw, 4.5rem);
	line-height: 1.05;
	letter-spacing: -0.02em;
	color: #ffffff;
	text-shadow: 0 2px 24px rgba(0, 0, 0, 0.55), 0 1px 3px rgba(0, 0, 0, 0.6);
}

.opening .lede {
	max-width: 36rem;
	margin: 0 auto 20px;
	font-size: 1.15rem;
	color: #ffffff;
	text-shadow: 0 1px 12px rgba(0, 0, 0, 0.7);
}

.opening .cue {
	display: inline-block;
	padding: 8px 16px;
	border-radius: 999px;
	background: var(--glass);
	border: 1px solid var(--line);
	color: var(--ink);
}

.step {
	counter-increment: step;
	min-height: 170vh;
	min-height: 170svh;
	padding-top: 10vh;
	box-sizing: border-box;
}

.panel {
	position: sticky;
	top: 10vh;
	box-sizing: border-box;
	width: var(--panel-width);
	max-height: 84vh;
	max-height: 84svh;
	overflow-y: auto;
	margin-left: max(var(--gutter), 2.5vw);
	padding: 20px 22px;
	border-radius: 14px;
	background: var(--glass);
	border: 1px solid var(--line);
	box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
}

.panel h2 {
	margin: 0 0 10px;
	font-size: 1.45rem;
	line-height: 1.2;
}

.panel h2::before {
	content: counter(step, decimal-leading-zero);
	display: block;
	margin-bottom: 4px;
	font-size: 0.75rem;
	letter-spacing: 0.12em;
	color: var(--accent);
}

.panel p {
	margin: 0 0 12px;
}

.step.is-active .panel {
	border-color: var(--accent);
}

.controls {
	display: grid;
	gap: 12px;
	margin: 14px 0;
}

.controls:empty {
	display: none;
}

details.math {
	margin: 12px 0;
	border-top: 1px solid var(--line);
	padding-top: 8px;
}

details.math summary {
	cursor: pointer;
	color: var(--accent);
	font-weight: 600;
}

.tex {
	margin: 10px 0 6px;
	overflow-x: auto;
}

.tex code {
	display: block;
	font: 0.8rem/1.4 ui-monospace, monospace;
	white-space: pre-wrap;
	word-break: break-word;
	color: var(--ink-dim);
}

.math-note {
	font-size: 0.9rem;
	color: var(--ink-dim);
}

.t-amp, .t-count, .t-sun, .t-chop, .t-tile, .t-wind, .t-whitecap, .t-seed, .t-n, .t-layer, .t-grid {
	color: var(--term-a);
}

.t-len, .t-fetch, .t-fade, .t-glow {
	color: var(--term-b);
}

.t-speed {
	color: var(--term-c);
}

.card {
	margin: 14px 0 0;
	padding: 14px 16px;
	border-radius: 10px;
	background: var(--card-bg);
	border: 1px solid var(--card-line);
	color: var(--card-ink);
}

.card h3 {
	margin: 0 0 8px;
	font-size: 0.8rem;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--card-head);
}

.card dl {
	margin: 0;
}

.card dt {
	font-weight: 700;
	font-size: 0.85rem;
	margin-top: 8px;
}

.card dd {
	margin: 2px 0 0;
	font-size: 0.92rem;
	color: var(--card-ink);
}

.chart {
	margin: 14px 0;
	padding: 10px;
	border-radius: 10px;
	background: var(--chart-bg);
	color: var(--chart-ink);
}

.chart figcaption {
	margin-top: 6px;
	font-size: 0.8rem;
	color: var(--chart-ink);
}

.chart-body svg {
	display: block;
	width: 100%;
	height: auto;
}

body[data-ocean='unavailable'] .controls,
body[data-ocean='unavailable'] .chart {
	display: none;
}

.step-finale {
	min-height: auto;
	padding-bottom: 10vh;
}

.step-finale .panel {
	position: static;
	max-height: none;
	overflow: visible;
}

.block {
	box-sizing: border-box;
	width: min(1100px, calc(100% - 2 * var(--gutter)));
	margin: 28px auto;
	padding: 22px 24px;
	border-radius: 14px;
	background: var(--glass);
	border: 1px solid var(--line);
}

.block h3 {
	margin: 0 0 10px;
	font-size: 1.25rem;
}

.block ul {
	margin: 0;
	padding-left: 1.2rem;
}

.block li {
	margin: 6px 0;
}

.dim {
	color: var(--ink-dim);
}

.live {
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 4px 16px;
	margin: 10px 0 14px;
	font-variant-numeric: tabular-nums;
}

.live dt {
	color: var(--ink-dim);
}

.live dd {
	margin: 0;
}

.clips {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
	gap: 16px;
}

.clips video {
	width: 100%;
	height: auto;
	border-radius: 8px;
	background: #000000;
}

.play-row {
	text-align: center;
	margin: 28px 0;
}

.play {
	display: inline-block;
	padding: 12px 22px;
	border-radius: 999px;
	background: var(--accent);
	color: var(--body-bg);
	font-weight: 700;
	text-decoration: none;
}

.render-mode .segmented {
	display: inline-flex;
	border: 1px solid var(--line);
	border-radius: 999px;
	overflow: hidden;
	margin-bottom: 8px;
}

.render-mode .segmented button,
.segmented button {
	padding: 6px 14px;
	border: 0;
	background: transparent;
	color: var(--ink);
	font: inherit;
	cursor: pointer;
}

.segmented button[aria-checked='true'] {
	background: var(--accent);
	color: var(--body-bg);
}

.render-mode-label {
	margin: 0 0 6px;
	font-weight: 600;
}

footer.site {
	position: relative;
	z-index: 1;
	padding: 24px var(--gutter) 48px;
	text-align: center;
}

@media (max-width: 899.98px) {
	/* The ocean pinned to the top half, above the story, so the panels scroll beneath it. */
	#ocean {
		height: 50vh;
		height: 50svh;
		bottom: auto;
		z-index: 2;
	}

	main#story {
		padding-top: 50vh;
		padding-top: 50svh;
	}

	.opening {
		min-height: 50vh;
		min-height: 50svh;
	}

	.opening h1,
	.opening .lede {
		color: var(--ink);
		text-shadow: none;
	}

	.step {
		min-height: 120vh;
		min-height: 120svh;
		padding-top: 24px;
	}

	.panel {
		position: static;
		width: auto;
		max-height: none;
		overflow: visible;
		margin: 0 var(--gutter);
	}

	.block {
		padding: 18px 16px;
	}

	.live {
		grid-template-columns: 1fr;
	}
}

@media (prefers-reduced-motion: reduce) {
	html {
		scroll-behavior: auto;
	}

	* {
		transition: none !important;
		animation: none !important;
	}
}
```

- [ ] **Step 5: Link the ocean from the home page**

In `content/index.html`, below the line `  <h1>Hello World 2.0</h1>`, add (two spaces of indentation, as the file uses):

```html
  <p><a href="/ocean/">Building an Ocean in Roblox</a></p>
```

- [ ] **Step 6: Update the one A2 expectation the narrow layout changes**

In `tests/ocean/e2e/ocean.spec.js`, in the test `the canvas and camera follow a resize to phone portrait, pixel ratio capped (Review Focus 3)`, the canvas is now the top half of the 844-pixel-tall screen (spec 2: "Mobile (< 900px): the ocean is pinned to the top half"). Replace

```js
		await page.waitForFunction(() => Math.abs(window.__ocean.camera.aspect - 390 / 844) < 1e-3);
```

with

```js
		// Piece C: below 900 px the ocean is the top half of the screen (50svh = 422 of 844).
		await page.waitForFunction(() => Math.abs(window.__ocean.camera.aspect - 390 / 422) < 1e-3);
```

and replace `expect(size).toEqual([390 * 2, 844 * 2]);` with `expect(size).toEqual([390 * 2, 422 * 2]);`.

- [ ] **Step 7: Run the tests**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/layout.spec.js tests/ocean/e2e/ocean.spec.js tests/ocean/e2e/shell.spec.js tests/ocean/e2e/boot.spec.js`
Expected: every test passes (layout: 10 including both system colour schemes).

Run: `cd /Users/cole/Projects/Wesbite-ocean && npm run test:ocean:e2e`
Expected: the whole browser suite passes.

- [ ] **Step 8: Look at it**

Run the server (`npm run serve:ocean` in the background), then with a short Playwright script (not committed) take screenshots of `http://localhost:8767/ocean/` at 1366 x 767 with the page scrolled to the opening, to step 2 with its maths opened, to step 9, and to the credits; and at 390 x 844 (isMobile) at the opening and at step 4; once in each colour scheme. Look at every screenshot. Expected: the title readable over the ocean; panels on the left third with the card in red; on the phone the ocean above and the panel below with nothing cut off. Stop the server. Describe what you saw in your report; do not commit screenshots.

- [ ] **Step 9: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean && git add content/ocean/index.html content/ocean/style.css content/index.html tests/ocean/e2e/ocean.spec.js tests/ocean/e2e/layout.spec.js
```

```bash
cd /Users/cole/Projects/Wesbite-ocean && git commit -m "feat: the ocean showcase page, its copy and its layout"
```

---

### Task 3: Every number on the page comes from a source

The honesty rule made mechanical. `facts.test.js` measures the structural numbers the copy quotes straight from the code (so a change to the tiers or the maps breaks a test, not the page's truth). `copySources.js` lists every phrase with a number the copy may contain and, for each, a quote that must exist in a named file: the code facts, the roblox-ocean research docs, the spec and the plans. The copy check finds every number in the page's text and fails unless it sits inside one of those phrases. Numbers in maths (`data-copy-skip="math"`) and live numbers (`data-copy-skip="live"`) are skipped.

**Files:**
- Create: `tests/ocean/page/facts.test.js`, `tests/ocean/page/copySources.js`, `tests/ocean/page/copyCheck.js`, `tests/ocean/page/copy.test.js`, `tests/ocean/e2e/copy.spec.js`

**Interfaces:**
- Consumes: A1 `core/tier.js` (`presets`), `core/ringLayout.js` (`build`), A2 `engine/horizonState.js` (`create(tile, halfExtent).quads`), `engine/config.js` (`COLOUR_TEXELS`, `FOAM_TEXELS`), A3 `engine/waveBanks.js` (`teachingBank()`, `TEACHING_TILE`), Task 1 `page/notices.js` (`NOTICES`), Task 2's page.
- Produces:
  - `tests/ocean/page/copyCheck.js`: `NUMBER` (regex), `SKIP_REASONS` (`['live', 'math']`), `normalise(text) -> text` (whitespace collapsed), `uncoveredNumbers(text, phrases: string[]) -> [{ number, context }]`.
  - `tests/ocean/page/copySources.js`: `COPY_SOURCES` = frozen array of `{ phrase, source, quote }`, `source` being `site:<path from the worktree root>` or `roblox:<path from the roblox-ocean root>`; `PHRASES` = the phrases.
  - The rule for later tasks: adding a number to the copy means adding an entry here whose quote exists in its source.

- [ ] **Step 1: Write the facts test (the code is its own source)**

`tests/ocean/page/facts.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as HorizonState from '../../../content/ocean/js/engine/horizonState.js';
import { COLOUR_TEXELS, FOAM_TEXELS } from '../../../content/ocean/js/engine/config.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';

// The structural numbers the page's copy quotes, measured from the code the ocean runs. The copy
// sources (copySources.js) cite these test names, so a change to a tier or a map size fails here
// before the page can say something that is no longer true.
const layoutOf = (name) => {
	const preset = Tier.presets[name];
	return RingLayout.build({ rings: preset.rings, patchCells: preset.patchCells, textureTile: preset.textureTile });
};

test('the High tier: 224 patches in 5 rings, 18,144 vertices', () => {
	const layout = layoutOf('High');
	expect.equal(layout.patches.length, 224, 'patches');
	expect.equal(Tier.presets.High.rings.length, 5, 'rings');
	expect.equal(layout.vertexCount, 18144, 'vertices');
});

test('the horizon adds 8 quads: 232 materials', () => {
	const preset = Tier.presets.High;
	const horizon = HorizonState.create(preset.textureTile, preset.rings[preset.rings.length - 1].halfExtent);
	expect.equal(horizon.quads.length, 8, 'horizon quads');
	expect.equal(layoutOf('High').patches.length + horizon.quads.length, 232, 'materials');
});

test('ring spacing 2, 4, 8, 16 and 32 studs', () => {
	expect.equal(Tier.presets.High.rings.map((ring) => ring.spacing).join(','), '2,4,8,16,32', 'spacings');
});

test('three layers of 64 × 64 over 256, 64 and 16 studs: 3 × 64 × 64 = 12,288', () => {
	const preset = Tier.presets.High;
	expect.equal(preset.n, 64, 'grid');
	expect.equal(preset.sizes.join(','), '256,64,16', 'patch sizes');
	expect.equal(preset.sizes.length * preset.n * preset.n, 12288, 'wave components');
});

test('the colour map is 512 × 512 and the foam field 256 × 256', () => {
	expect.equal(COLOUR_TEXELS, 512, 'colour map');
	expect.equal(FOAM_TEXELS, 256, 'foam field');
});

test('the teaching bank holds 32 waves on the 256-stud tile', () => {
	expect.equal(WaveBanks.teachingBank().count, 32, 'waves');
	expect.equal(WaveBanks.TEACHING_TILE, 256, 'tile');
});

test('the phone tier (Medium) writes 6,480 vertices with two layers', () => {
	expect.equal(layoutOf('Medium').vertexCount, 6480, 'vertices');
	expect.equal(Tier.presets.Medium.sizes.length, 2, 'layers');
});
```

- [ ] **Step 2: Run it**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/facts.test.js`
Expected: PASS, 7 tests. (It tests code that already exists. If any fails, stop: the copy in Task 2 quotes that number, so report the measured value instead of changing the test.)

- [ ] **Step 3: Write the checker, the sources and their failing test**

`tests/ocean/page/copyCheck.js`:

```js
// The copy check (piece C): every number in the page's text has to sit inside one of the sourced
// phrases in copySources.js. A number is a run of digits with optional ".digits" or ",digits"
// groups: 18,144 and 0.0026 and 1.4.0 are one number each.
export const NUMBER = /\d+(?:[.,]\d+)*/g;
export const SKIP_REASONS = Object.freeze(['live', 'math']);

export const normalise = (text) => text.replace(/\s+/g, ' ').trim();

function covered(text, phrases) {
	const ranges = [];
	for (const phrase of phrases) {
		let from = 0;
		for (let at = text.indexOf(phrase, from); at !== -1; at = text.indexOf(phrase, from)) {
			ranges.push([at, at + phrase.length]);
			from = at + 1;
		}
	}
	return ranges;
}

export function uncoveredNumbers(text, phrases) {
	const ranges = covered(text, phrases);
	const out = [];
	for (const match of text.matchAll(NUMBER)) {
		const start = match.index;
		const end = start + match[0].length;
		if (!ranges.some(([a, b]) => a <= start && end <= b)) {
			out.push({ number: match[0], context: text.slice(Math.max(0, start - 40), end + 40) });
		}
	}
	return out;
}
```

`tests/ocean/page/copySources.js`:

```js
// Where every number on the ocean page comes from (piece C; spec 1, honesty rules: "every number on
// the page is measured"). Each phrase is text the page may contain; its quote must appear verbatim
// in its source: `site:` paths are from the website worktree's root, `roblox:` paths from the
// roblox-ocean checkout (ROBLOX_OCEAN_DIR, default /Users/cole/Projects/roblox-ocean). copy.test.js
// checks every quote; the copy check (copy.spec.js, copy.test.js) fails on any number in the page's
// text that no phrase covers. Adding a number to the copy means adding its phrase and source here.
const FACTS = 'site:tests/ocean/page/facts.test.js';
const SPEC = 'site:docs/superpowers/specs/2026-09-27-ocean-showcase-design.md';
const A3_PLAN = 'site:docs/superpowers/plans/2026-09-30-ocean-a3-teaching-stages.md';
const B_PLAN = 'site:docs/superpowers/plans/2026-09-30-ocean-b-luau-panel.md';
const BENCH = 'roblox:docs/research/bench.md';
const LEDGER = 'roblox:docs/research/engine-assumptions.md';

export const COPY_SOURCES = Object.freeze([
	// Structure, measured from the code (facts.test.js).
	{ phrase: '224 patches in 5 rings', source: FACTS, quote: '224 patches in 5 rings' },
	{ phrase: '18,144', source: FACTS, quote: '18,144 vertices' },
	{ phrase: '232', source: FACTS, quote: '232 materials' },
	{ phrase: '2, 4, 8, 16 and 32 studs', source: FACTS, quote: 'ring spacing 2, 4, 8, 16 and 32 studs' },
	{ phrase: '64 × 64', source: FACTS, quote: 'three layers of 64 × 64' },
	{ phrase: '3 × 64 × 64 = 12,288', source: FACTS, quote: '3 × 64 × 64 = 12,288' },
	{ phrase: '12,288', source: FACTS, quote: '3 × 64 × 64 = 12,288' },
	{ phrase: '256, 64 and 16 studs', source: FACTS, quote: 'over 256, 64 and 16 studs' },
	{ phrase: '512 × 512', source: FACTS, quote: 'the colour map is 512 × 512' },
	{ phrase: '256 × 256', source: FACTS, quote: 'the foam field 256 × 256' },
	{ phrase: '32 waves', source: FACTS, quote: 'holds 32 waves' },
	{ phrase: '256-stud', source: FACTS, quote: 'on the 256-stud tile' },
	{ phrase: '6,480', source: FACTS, quote: '6,480 vertices' },
	{ phrase: 'γ = 3.3', source: 'site:content/ocean/js/core/spectrum.js', quote: 'gamma: 3.3' },
	{ phrase: 'Luau 0.711', source: 'site:content/ocean/js/proof/runtime.js', quote: 'a fork of Luau release 0.711' },
	{ phrase: 'WebGL 2', source: 'site:content/ocean/js/webgl.js', quote: 'asks for WebGL 2 only' },
	// Studio measurements (roblox-ocean docs/research/bench.md, Mac16,12, Studio 0.739).
	{ phrase: '3.5 ms', source: BENCH, quote: 'the write dropped from 7.7 to 3.5 ms' },
	{ phrase: '7.7 ms', source: BENCH, quote: 'the write dropped from 7.7 to 3.5 ms' },
	{ phrase: '60 fps', source: BENCH, quote: '60 fps; all three criteria MET in Studio' },
	{ phrase: '16.7 ms', source: BENCH, quote: 'about 16.7 ms' },
	{ phrase: '0.037 ms', source: BENCH, quote: 'upload 0.037' },
	{ phrase: '1.00 ms', source: BENCH, quote: 'FFT.inverse2D, 64 x 64 | 1.00' },
	{ phrase: 'like 20 fps', source: BENCH, quote: 'like 20 fps' },
	{ phrase: 'about 44 fps', source: BENCH, quote: 'about 44 fps' },
	{ phrase: '15 times a second', source: BENCH, quote: '15 Hz motion' },
	{ phrase: '0.062 ms', source: BENCH, quote: 'strength 0.062' },
	{ phrase: '16.65 ms', source: BENCH, quote: '16.65 / 17.08' },
	{ phrase: '2.81 ms', source: BENCH, quote: 'at 2.81 ms' },
	// The web side's own measurements and records.
	{ phrase: 'the 16 tallest', source: A3_PLAN, quote: 'Steps 4 to 6 sum the 16 tallest' },
	{ phrase: 'All 32 over 18,144 points cost about 27 ms', source: A3_PLAN, quote: '32 waves cost about 27 ms a frame over 18,144 vertices in Node' },
	{ phrase: '196,608 float32 values', source: B_PLAN, quote: '196,608 float32 values' },
	{ phrase: 'about 4 million', source: SPEC, quote: "about 4 million on Acerola's GPU" },
	{ phrase: 'radix-2', source: SPEC, quote: 'radix-2 FFT butterflies' },
	{ phrase: 'howhow2315/JONSWAP-Ocean', source: SPEC, quote: 'howhow2315/JONSWAP-Ocean' },
	// The engine-assumptions ledger (roblox-ocean docs/research/engine-assumptions.md).
	{ phrase: 'capped at 8 meshes', source: LEDGER, quote: '"8 EditableMesh per client" is a cap' },
	{ phrase: 'about 0.1 microseconds', source: LEDGER, quote: 'about 0.1 microseconds per arithmetic op' },
	{ phrase: 'about 0.0026, roughly 40 times faster', source: LEDGER, quote: 'About 0.0026: roughly 40 times faster' },
	{ phrase: 'At 100,000', source: LEDGER, quote: 'REFUTED at 100,000' },
	{ phrase: 'at level 6', source: LEDGER, quote: 'at level 6 they render at 45 studs and are gone by 170' },
	{ phrase: 'by 170 studs', source: LEDGER, quote: 'at level 6 they render at 45 studs and are gone by 170' },
	// Credits.
	{ phrase: '(2001', source: SPEC, quote: 'Tessendorf (2001 course notes)' },
	{ phrase: 'revised 2004', source: 'roblox:docs/research/tessendorf-fft.md', quote: '*Simulating Ocean Water*, 2004' },
	{ phrase: 'GDC 2019', source: 'roblox:docs/research/atlas-shading-model.md', quote: 'GDC 2019' },
	{ phrase: 'SIGGRAPH 2018', source: 'roblox:docs/research/sea-of-thieves.md', quote: 'SIGGRAPH 2018 talk paper' },
].map((entry) => Object.freeze(entry)));

export const PHRASES = Object.freeze(COPY_SOURCES.map((entry) => entry.phrase));
```

`tests/ocean/page/copy.test.js`:

```js
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';
import { COPY_SOURCES, PHRASES } from './copySources.js';
import { NUMBER, normalise, uncoveredNumbers } from './copyCheck.js';
import { NOTICES } from '../../../content/ocean/js/page/notices.js';

const SITE = fileURLToPath(new URL('../../../', import.meta.url));
const ROBLOX = process.env.ROBLOX_OCEAN_DIR || '/Users/cole/Projects/roblox-ocean';

function sourceText(source) {
	const [root, path] = source.startsWith('site:') ? [SITE, source.slice(5)] : source.startsWith('roblox:') ? [ROBLOX, source.slice(7)] : [null, null];
	if (!root) throw new Error(`unknown source kind: ${source}`);
	return readFileSync(join(root, path), 'utf8');
}

test('every source quote is really in its source', () => {
	const cache = new Map();
	for (const { phrase, source, quote } of COPY_SOURCES) {
		if (!cache.has(source)) cache.set(source, sourceText(source));
		expect.truthy(cache.get(source).includes(quote), `"${phrase}": the quote "${quote}" is not in ${source} (ROBLOX_OCEAN_DIR=${ROBLOX})`);
	}
});

test('every phrase carries a number, and no phrase is listed twice', () => {
	for (const phrase of PHRASES) {
		expect.truthy(new RegExp(NUMBER.source).test(phrase), `"${phrase}" has no number to source`);
	}
	expect.equal(new Set(PHRASES).size, PHRASES.length, 'phrases are unique');
});

test('the checker passes a covered number and names an uncovered one with its context', () => {
	const text = normalise('The sea has   18,144 points\nand 99 bottles.');
	const missing = uncoveredNumbers(text, ['18,144']);
	expect.equal(missing.length, 1, 'one uncovered');
	expect.equal(missing[0].number, '99', 'the 99');
	expect.truthy(missing[0].context.includes('bottles'), 'context');
	expect.equal(uncoveredNumbers('3 × 64 × 64 = 12,288', ['3 × 64 × 64 = 12,288']).length, 0, 'a phrase covers every number inside it');
	expect.equal(uncoveredNumbers('64 × 64 and 64', ['64 × 64']).length, 1, 'a number outside every phrase is caught');
	expect.equal(uncoveredNumbers('version 1.4.0', ['1.4']).length, 1, 'a phrase must cover the whole number');
});

test("the notices' numbers are sourced", () => {
	for (const [name, text] of Object.entries(NOTICES)) {
		const missing = uncoveredNumbers(normalise(text), PHRASES);
		expect.equal(missing.length, 0, `${name}: ${JSON.stringify(missing)}`);
	}
});
```

- [ ] **Step 4: Run the unit tests**

Run: `cd /Users/cole/Projects/Wesbite-ocean && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web node --test tests/ocean/page/copy.test.js tests/ocean/page/facts.test.js && node --test tests/ocean/page/copy.test.js`
Expected: PASS, 4 copy tests and 7 fact tests, against both roblox-ocean checkouts (the second run uses the default `/Users/cole/Projects/roblox-ocean`). If a quote is missing, fix the quote to the source's exact wording only if the phrase still says the same thing; otherwise stop and report.

- [ ] **Step 5: Write the browser copy check**

`tests/ocean/e2e/copy.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { PHRASES } from '../page/copySources.js';
import { SKIP_REASONS, normalise, uncoveredNumbers } from '../page/copyCheck.js';

// The page's text as a visitor could read it (hidden paragraphs included, since they show on some
// devices), minus maths, live numbers, scripts and styles.
function pageText(page) {
	return page.evaluate(() => {
		const parts = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				const skipped = node.parentElement.closest('[data-copy-skip], script, style, noscript, .katex');
				return skipped ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
			},
		});
		for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push(node.textContent);
		return parts.join(' ');
	});
}

async function checkPage(page) {
	const text = normalise(await pageText(page));
	expect(text.length).toBeGreaterThan(5000);
	const missing = uncoveredNumbers(text, PHRASES);
	expect(missing, `numbers with no source: ${JSON.stringify(missing, null, 1)}`).toEqual([]);
	const reasons = await page.evaluate(() => [...document.querySelectorAll('[data-copy-skip]')].map((el) => el.dataset.copySkip));
	for (const reason of reasons) expect(SKIP_REASONS).toContain(reason);
	expect(await page.locator('.tex:not([data-copy-skip="math"])').count()).toBe(0);
}

test('every number in the page text sits inside a sourced phrase', async ({ page }) => {
	await page.goto('/ocean/');
	await expect(page.locator('#step-13-title')).toHaveText('The whole thing');
	await checkPage(page);
});

test('the copy check still holds once the ocean runs and the page has built its controls', async ({ page }) => {
	await page.goto('/ocean/');
	await page.waitForFunction(() => document.body.dataset.ocean === 'running' && (window.__ocean?.status().frame ?? 0) > 5, null, { timeout: 90_000 });
	await checkPage(page);
});
```

- [ ] **Step 6: Run the browser copy check**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/copy.spec.js`
Expected: PASS, 2 tests. A failure lists each unsourced number with its context: fix the copy or the phrase list so the number is sourced; never add a phrase without a real quote.

- [ ] **Step 7: Run the whole unit suite**

Run: `cd /Users/cole/Projects/Wesbite-ocean && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean`
Expected: PASS, with the new page tests listed.

- [ ] **Step 8: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean && git add tests/ocean/page/facts.test.js tests/ocean/page/copySources.js tests/ocean/page/copyCheck.js tests/ocean/page/copy.test.js tests/ocean/e2e/copy.spec.js
```

```bash
cd /Users/cole/Projects/Wesbite-ocean && git commit -m "test: every number on the ocean page is checked against its source"
```

---

### Task 4: The scroll story: which step is being read, and how far through it

GSAP ScrollTrigger follows the scroll and a pure function turns the scroll position into a reading: the opening, or a step and the progress through it. The reading line sits at the middle of the viewport on desktop and the middle of the lower half on narrow screens (where the ocean covers the top half). If GSAP never arrives, a native scroll listener does the same job. The step being read gets `.is-active`.

**Files:**
- Create: `content/ocean/js/page/scrollMap.js`, `content/ocean/js/ui/story.js`, `tests/ocean/e2e/helpers/story.js`
- Modify: `content/ocean/js/ui/page.js` (the story feature)
- Test: `tests/ocean/page/scrollMap.test.js`, `tests/ocean/e2e/story.spec.js`

**Interfaces:**
- Consumes: Task 1 `ui/page.js` (the two insertion lines; `handle.story` from `startOcean`, null until Task 5); Task 2's `section.step[data-step]`, `#opening .cue`, `main#story`; A3 `stages/recipes.js` `STEP_COUNT` (tests only).
- Produces:
  - `page/scrollMap.js`: `NARROW_QUERY` (`'(max-width: 899.98px)'`), `LAST_STEP` (13), `SMOOTH_SECONDS` (0.25), `readingLine(viewportHeight, narrow) -> px`, `readScroll(sections: [{ step, top, height }], anchor) -> { phase: 'opening' | 'step', step, progress }`, `positionOf(reading) -> number` (`step + progress`, the finale without progress), `splitPosition(position) -> { step, progress }`, `smoothPosition(current, target, dt, tau = SMOOTH_SECONDS) -> number` (cuts to the target when it is more than one step away).
  - `ui/story.js`: `loadScrollTrigger() -> Promise<{ gsap, ScrollTrigger }>`, `startStory({ reducedMotion = false, load = loadScrollTrigger } = {}) -> { reading() -> Reading, engine() -> 'starting' | 'gsap' | 'native', onChange(listener) -> unsubscribe, relayout() }` (`onChange` calls the listener at once with the current reading, then on every change).
  - In `ui/page.js`: a `story` variable later features use, and `window.__page = { reading(), scrollEngine() }` (test hook). When the ocean runs in story mode, every reading goes to `handle.story.setScroll(reading)`.
  - `tests/ocean/e2e/helpers/story.js`: `watchErrors(page) -> string[]` (uncaught errors and console errors), `oceanRunning(page, url = '/ocean/', frames = 5)`, `waitFrames(page, frames)`, `scrollToStep(page, step, progress = 0.3)`, `scrollToOpening(page)`.

- [ ] **Step 1: Write the failing unit tests**

`tests/ocean/page/scrollMap.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { LAST_STEP, NARROW_QUERY, SMOOTH_SECONDS, positionOf, readScroll, readingLine, smoothPosition, splitPosition } from '../../../content/ocean/js/page/scrollMap.js';
import { STEP_COUNT } from '../../../content/ocean/js/stages/recipes.js';

const SECTIONS = [
	{ step: 1, top: 1000, height: 1000 },
	{ step: 2, top: 2000, height: 1000 },
	{ step: 3, top: 3000, height: 500 },
];

test('the reading line is the middle of the view, or of the lower half on a narrow screen', () => {
	expect.equal(readingLine(800, false), 400, 'desktop');
	expect.equal(readingLine(800, true), 600, 'narrow');
	expect.equal(NARROW_QUERY, '(max-width: 899.98px)', 'the stylesheet breakpoint');
	expect.equal(LAST_STEP, STEP_COUNT, 'as many steps as the recipes');
});

test('above the first step is the opening; inside a step is its progress', () => {
	expect.equal(readScroll(SECTIONS, 999).phase, 'opening', 'just above step 1');
	const reading = readScroll(SECTIONS, 2250);
	expect.equal(reading.phase, 'step', 'a step');
	expect.equal(reading.step, 2, 'step 2');
	expect.near(reading.progress, 0.25, 1e-12, 'a quarter through');
	expect.equal(readScroll(SECTIONS, 1000).step, 1, 'the top edge belongs to the step');
	expect.equal(readScroll(SECTIONS, 99999).progress, 1, 'past the last section clamps to its end');
});

test('bad input reads as the opening instead of throwing', () => {
	expect.equal(readScroll([], 5000).phase, 'opening', 'no sections');
	expect.equal(readScroll(SECTIONS, Number.NaN).phase, 'opening', 'NaN anchor');
	expect.equal(readScroll([{ step: 1, top: 0, height: 0 }], 10).progress, 0, 'a zero-height section');
});

test('a position is step plus progress, and splits back; the finale has no progress', () => {
	expect.equal(positionOf({ phase: 'step', step: 4, progress: 0.5 }), 4.5, 'step 4 halfway');
	expect.equal(positionOf({ phase: 'step', step: 13, progress: 0.7 }), 13, 'the finale');
	const split = splitPosition(7.25);
	expect.equal(split.step, 7, 'step');
	expect.near(split.progress, 0.25, 1e-12, 'progress');
	expect.equal(splitPosition(13.4).step, 13, 'clamped to the finale');
	expect.equal(splitPosition(13.4).progress, 0, 'no progress on the finale');
	expect.equal(splitPosition(0.2).step, 1, 'clamped to step 1');
});

test('the position eases toward the scroll, and cuts when the scroll jumps more than a step (Review Focus 1)', () => {
	let p = 3;
	for (let i = 0; i < 5; i++) p = smoothPosition(p, 3.8, 0.05);
	expect.truthy(p > 3.3 && p < 3.8, `eased part of the way: ${p}`);
	for (let i = 0; i < 200; i++) p = smoothPosition(p, 3.8, 0.05);
	expect.equal(p, 3.8, 'arrives exactly');
	expect.equal(smoothPosition(2, 9.5, 0.016), 9.5, 'a fling cuts straight there');
	expect.equal(smoothPosition(Number.NaN, 4, 0.016), 4, 'no position yet: take the target');
	expect.equal(smoothPosition(4, 4.5, 0), 4, 'no time, no movement');
	expect.equal(SMOOTH_SECONDS, 0.25, 'time constant');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/scrollMap.test.js`
Expected: FAIL: `Cannot find module .../page/scrollMap.js`.

- [ ] **Step 3: Write `content/ocean/js/page/scrollMap.js`**

```js
// The scroll story's arithmetic (piece C; browser-free): where the reading line sits, which step
// section it is in and how far through, and the continuous position (step + progress) the story
// stage smooths before handing it to A3's director. A position that would move more than one step
// in one go is taken at once rather than eased, so a fling never sweeps the engine through every
// recipe in between.
export const NARROW_QUERY = '(max-width: 899.98px)';
// The recipes' STEP_COUNT (stages/recipes.js); scrollMap.test.js checks they agree.
export const LAST_STEP = 13;
export const SMOOTH_SECONDS = 0.25;

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

// The line the visitor reads at: the middle of the viewport, or on a narrow screen (where the ocean
// covers the top half) the middle of the lower half.
export function readingLine(viewportHeight, narrow) {
	return viewportHeight * (narrow ? 0.75 : 0.5);
}

// sections: the step sections in document order, as { step, top, height } in document pixels;
// anchor: the document y of the reading line.
export function readScroll(sections, anchor) {
	if (sections.length === 0 || !(anchor >= sections[0].top)) {
		return { phase: 'opening', step: 1, progress: 0 };
	}
	let current = sections[0];
	for (const section of sections) {
		if (section.top > anchor) break;
		current = section;
	}
	const progress = current.height > 0 ? clamp01((anchor - current.top) / current.height) : 0;
	return { phase: 'step', step: current.step, progress };
}

export function positionOf(reading) {
	return reading.step + (reading.step >= LAST_STEP ? 0 : reading.progress);
}

export function splitPosition(position) {
	const p = Math.min(Math.max(position, 1), LAST_STEP);
	const step = Math.min(Math.floor(p), LAST_STEP);
	return { step, progress: step === LAST_STEP ? 0 : p - step };
}

export function smoothPosition(current, target, dt, tau = SMOOTH_SECONDS) {
	if (!Number.isFinite(current) || Math.abs(target - current) > 1) {
		return target;
	}
	if (!(dt > 0)) {
		return current;
	}
	const next = current + (target - current) * (1 - Math.exp(-dt / tau));
	return Math.abs(target - next) < 1e-4 ? target : next;
}
```

- [ ] **Step 4: Run the unit tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/scrollMap.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the browser test helpers and the failing browser tests**

`tests/ocean/e2e/helpers/story.js`:

```js
// Shared helpers for the ocean page's story tests (piece C). Not a spec file: Playwright runs only
// *.spec.js.
export function watchErrors(page) {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	return errors;
}

export async function oceanRunning(page, url = '/ocean/', frames = 5) {
	await page.goto(url);
	await page.waitForFunction((target) => document.body.dataset.ocean === 'running' && (window.__ocean?.status().frame ?? 0) > target, frames, { timeout: 90_000 });
}

export async function waitFrames(page, frames) {
	const start = await page.evaluate(() => window.__ocean.status().frame);
	await page.waitForFunction((target) => window.__ocean.status().frame >= target, start + frames, { timeout: 120_000 });
}

// Scrolls so the reading line sits `progress` of the way through step `step`, then waits for the
// story to read it.
export async function scrollToStep(page, step, progress = 0.3) {
	await page.evaluate(([n, p]) => {
		const section = document.getElementById(`step-${n}`);
		const rect = section.getBoundingClientRect();
		const narrow = window.matchMedia('(max-width: 899.98px)').matches;
		const line = window.innerHeight * (narrow ? 0.75 : 0.5);
		window.scrollTo(0, rect.top + window.scrollY + p * rect.height - line);
	}, [step, progress]);
	await page.waitForFunction((n) => {
		const reading = window.__page?.reading();
		return reading && reading.phase === 'step' && reading.step === n;
	}, step, { timeout: 30_000 });
}

export async function scrollToOpening(page) {
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForFunction(() => window.__page?.reading().phase === 'opening', null, { timeout: 30_000 });
}
```

`tests/ocean/e2e/story.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { scrollToOpening, scrollToStep, watchErrors } from './helpers/story.js';

test('scrolling reads the step and how far through it, and marks the panel', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/ocean/');
	expect(await page.evaluate(() => window.__page.reading().phase)).toBe('opening');
	await scrollToStep(page, 4, 0.5);
	const reading = await page.evaluate(() => window.__page.reading());
	expect(reading.step).toBe(4);
	expect(reading.progress).toBeGreaterThan(0.45);
	expect(reading.progress).toBeLessThan(0.55);
	await expect(page.locator('#step-4')).toHaveClass(/is-active/);
	await expect(page.locator('#step-3')).not.toHaveClass(/is-active/);
	await expect(page.locator('body')).toHaveAttribute('data-phase', 'step');
	await scrollToOpening(page);
	await expect(page.locator('body')).toHaveAttribute('data-phase', 'opening');
	expect(errors).toEqual([]);
});

test('GSAP ScrollTrigger drives the reading when it loads', async ({ page }) => {
	await page.goto('/ocean/');
	await page.waitForFunction(() => window.__page.scrollEngine() === 'gsap', null, { timeout: 30_000 });
	await scrollToStep(page, 9);
	await scrollToStep(page, 13);
});

test('with GSAP blocked a native listener reads the scroll instead (Review Focus 3)', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/npm/gsap@3.15.0/**', (route) => route.abort());
	await page.goto('/ocean/');
	await page.waitForFunction(() => window.__page.scrollEngine() === 'native', null, { timeout: 30_000 });
	await scrollToStep(page, 6);
	await scrollToStep(page, 2);
	expect(errors).toEqual([]);
});

test('opening a maths line moves everything below it, and the reading follows', async ({ page }) => {
	await page.goto('/ocean/');
	await scrollToStep(page, 2);
	await page.locator('#step-2 details.math summary').click();
	await scrollToStep(page, 3, 0.1);
	await scrollToStep(page, 12, 0.9);
});

test.describe('on a phone in portrait', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the reading line sits in the lower half, under the ocean', async ({ page }) => {
		await page.goto('/ocean/');
		await scrollToStep(page, 7, 0.4);
		const reading = await page.evaluate(() => window.__page.reading());
		expect(reading.progress).toBeGreaterThan(0.35);
		expect(reading.progress).toBeLessThan(0.45);
	});
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/story.spec.js`
Expected: FAIL: `window.__page` is undefined.

- [ ] **Step 7: Write `content/ocean/js/ui/story.js`**

```js
// The scroll story (piece C; spec 2 and 4.1 "story.js: GSAP ScrollTrigger -> active step and
// progress within it"). A ScrollTrigger over the whole story calls update() as the page scrolls and
// relayout() when it refreshes; a ResizeObserver on the story re-measures when the page's own
// content changes height (a maths line opened, the footage appearing). update() reads the scroll
// through page/scrollMap.js and tells its listeners. If GSAP never arrives (offline, blocked), a
// passive native scroll listener does the same, so the story works without it.
import { NARROW_QUERY, readScroll, readingLine } from '../page/scrollMap.js';

export async function loadScrollTrigger() {
	const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
	gsap.registerPlugin(ScrollTrigger);
	return { gsap, ScrollTrigger };
}

export function startStory({ reducedMotion = false, load = loadScrollTrigger } = {}) {
	const story = document.getElementById('story');
	const sections = [...document.querySelectorAll('section.step[data-step]')];
	const narrow = window.matchMedia(NARROW_QUERY);
	const listeners = new Set();
	let measured = [];
	let reading = Object.freeze({ phase: 'opening', step: 1, progress: 0 });
	let engine = 'starting';
	let scrollTrigger = null;

	function measure() {
		measured = sections.map((section) => {
			const rect = section.getBoundingClientRect();
			return { step: Number(section.dataset.step), top: rect.top + window.scrollY, height: rect.height };
		});
	}

	function mark() {
		for (const section of sections) {
			section.classList.toggle('is-active', reading.phase === 'step' && Number(section.dataset.step) === reading.step);
		}
		document.body.dataset.phase = reading.phase;
	}

	function update() {
		const next = readScroll(measured, window.scrollY + readingLine(window.innerHeight, narrow.matches));
		const same = next.phase === reading.phase && next.step === reading.step;
		if (same && Math.abs(next.progress - reading.progress) < 1e-4) {
			return;
		}
		reading = Object.freeze(next);
		if (!same) {
			mark();
		}
		for (const listener of listeners) {
			listener(reading);
		}
	}

	function relayout() {
		measure();
		update();
	}

	function followNatively() {
		let queued = false;
		window.addEventListener('scroll', () => {
			if (queued) return;
			queued = true;
			window.requestAnimationFrame(() => {
				queued = false;
				update();
			});
		}, { passive: true });
		window.addEventListener('resize', relayout);
		engine = 'native';
	}

	measure();
	mark();
	update();
	new ResizeObserver(() => {
		relayout();
		scrollTrigger?.refresh();
	}).observe(story);

	load()
		.then(({ gsap, ScrollTrigger }) => {
			ScrollTrigger.create({ trigger: story, start: 'top top', end: 'bottom bottom', onUpdate: update, onRefresh: relayout });
			const cue = document.querySelector('#opening .cue');
			if (cue && !reducedMotion) {
				gsap.to(cue, { autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '#opening', start: 'top top', end: 'bottom 60%', scrub: true } });
			}
			scrollTrigger = ScrollTrigger;
			engine = 'gsap';
			relayout();
		})
		.catch((error) => {
			console.warn('[ocean] GSAP ScrollTrigger did not load; following the scroll without it', error);
			followNatively();
			relayout();
		});

	return Object.freeze({
		reading: () => reading,
		engine: () => engine,
		onChange(listener) {
			listeners.add(listener);
			listener(reading);
			return () => listeners.delete(listener);
		},
		relayout,
	});
}
```

- [ ] **Step 8: Add the story to `content/ocean/js/ui/page.js`**

Directly above `// Feature imports end.` add:

```js
import { startStory } from './story.js';
```

Directly above `// Features end.` add:

```js
	// Task 4: the scroll story. In story mode the ocean's stage follows every reading.
	const story = startStory({ reducedMotion });
	window.__page = Object.freeze({ reading: () => story.reading(), scrollEngine: () => story.engine() });
	features.push({
		attachOcean(handle) {
			if (handle.story) {
				story.onChange((reading) => handle.story.setScroll(reading));
			}
		},
	});
```

- [ ] **Step 9: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/story.spec.js && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean && node --test tests/ocean/page/bootGraph.test.js`
Expected: PASS: 5 story browser tests, the unit suite, and the boot graph still clean (story.js imports GSAP only dynamically).

Run: `cd /Users/cole/Projects/Wesbite-ocean && npm run test:ocean:e2e`
Expected: the whole browser suite passes.

- [ ] **Step 10: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean && git add content/ocean/js/page/scrollMap.js content/ocean/js/ui/story.js content/ocean/js/ui/page.js tests/ocean/page/scrollMap.test.js tests/ocean/e2e/helpers/story.js tests/ocean/e2e/story.spec.js
```

```bash
cd /Users/cole/Projects/Wesbite-ocean && git commit -m "feat: the scroll story reads the step and the progress through it"
```

---

### Task 5: The story drives the ocean: director, look, camera shots and free orbit

The story stage turns each scroll reading into A3's `director.setStep(step, progress)`, applies the blended look and camera shot every frame, and lets the visitor orbit between shots. It leaves the ocean alone until the first scroll into step 1, cuts on the opening boundary, cuts when the scroll jumps more than a step, and eases the camera back to the shot 1.2 s after the visitor has orbited away and the step changes. In story mode the orbit has no zoom (the wheel scrolls), no pan and a limited reach; touch-first screens get no orbit.

**Files:**
- Create: `content/ocean/js/page/shotControl.js`, `content/ocean/js/ui/storyStage.js`
- Modify: `content/ocean/js/render/cameraRig.js` (three methods), `content/ocean/js/main.js` (create the story stage)
- Test: `tests/ocean/page/shotControl.test.js`, `tests/ocean/e2e/storyStage.spec.js`

**Interfaces:**
- Consumes: A3 `stages/director.js` `createDirector(ocean) -> { setStep(step, progress), setSlider(id, value) -> value, press(id) -> value, sliders() -> [{ ...slider, value, available }], frame() -> { recipe, look, shot, charts }, state() -> { step, progress, values } }`; `stages/recipes.js` `recipeFor(step)` (a recipe's `shot` is `{ position, target, move: 'still' | 'drift' }`, `engine.sea` is `{ windSpeed, fetch }`), `STEP_COUNT`; `render/stageLook.js` `createStageLook({ view, meshes, materials, config }) -> { apply(look), probe() }`; `render/cameraRig.js` `SHOTS`, rig `applyShot(shot, seconds)`, `update()`; `render/scene.js` view `settleEnvironment()`; `engine/ocean.js` `teachTime(ocean)`, `ocean.live.params`, `ocean.preset.{ sizes, n }`, `ocean.t`; `engine/charts.js` `spectrumCurve`, `createPhaseArrows`, `phaseArrowsAt`, `measureTransforms`; `engine/surfaceProbe.js` `probeSurface`; Task 4 `page/scrollMap.js` (`positionOf`, `smoothPosition`, `splitPosition`) and the readings `ui/page.js` forwards to `handle.story.setScroll`; Task 4 test helpers.
- Produces:
  - `page/shotControl.js`: `RETURN_SECONDS` (1.2), `DRIFT_PERIOD_SECONDS` (240), `resolveShot(shot, seconds) -> { position, target }` (drift resolved as `rig.applyShot` does), `createShotControl({ returnSeconds = RETURN_SECONDS } = {}) -> { orbited(key), mode() -> 'shot' | 'free' | 'returning', frame(key, pose, target, dt, { cut = false } = {}) -> pose | null }`.
  - `render/cameraRig.js`: `STORY_MAX_DISTANCE` (1200); rig gains `pose() -> { position: [x, y, z], target: [x, y, z] }`, `onUserOrbit(callback) -> unsubscribe`, `limitForStory({ coarsePointer })`.
  - `ui/storyStage.js`: `createStoryStage({ ocean, view, rig, meshes, materials, config, reducedMotion = false }) -> story`, `story = { setScroll(reading), beforeStep(dt), afterStep(), sliders(step) -> [{ ...slider, value, available }], setSlider(step, id, value) -> value, press(step, id) -> value, charts: { spectrum(), phaseArrows(), transforms(n), seed() }, hooks }`.
  - `main.js`: without a route, `handle.story` is that object and `window.__ocean.story` is `story.hooks` = `{ started(), reading(), state(), recipe(), look(), shotMode(), trail(), clearTrail(), surface(), sliders(step), setSlider(step, id, value), press(step, id) }`.

- [ ] **Step 1: Write the failing unit tests**

`tests/ocean/page/shotControl.test.js`:

```js
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
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/shotControl.test.js`
Expected: FAIL: `Cannot find module .../page/shotControl.js`.

- [ ] **Step 3: Write `content/ocean/js/page/shotControl.js`**

```js
// The story's camera between shots (piece C; spec 2: "Scrolling blends between shots. Between steps
// the visitor can drag to orbit; the next step's shot takes over again"). Browser-free. The shot is
// applied every frame until the visitor orbits; the camera is then theirs until the step being read
// changes, and eases back to the new shot over RETURN_SECONDS from wherever they left it. A cut
// (the opening boundary) goes straight to the shot, and so does everything under reduced motion
// (returnSeconds 0).
export const RETURN_SECONDS = 1.2;
// render/cameraRig.js applyShot's drift: once round the target every 240 s.
export const DRIFT_PERIOD_SECONDS = 240;

const smoothstep = (x) => x * x * (3 - 2 * x);
const lerp3 = (a, b, w) => a.map((value, i) => value + (b[i] - value) * w);

export function resolveShot(shot, seconds) {
	const [tx, ty, tz] = shot.target;
	let [px, py, pz] = shot.position;
	if (shot.move === 'drift') {
		const angle = (seconds * 2 * Math.PI) / DRIFT_PERIOD_SECONDS;
		const dx = px - tx;
		const dz = pz - tz;
		px = tx + dx * Math.cos(angle) - dz * Math.sin(angle);
		pz = tz + dx * Math.sin(angle) + dz * Math.cos(angle);
	}
	return { position: [px, py, pz], target: [tx, ty, tz] };
}

export function createShotControl({ returnSeconds = RETURN_SECONDS } = {}) {
	let mode = 'shot';
	let anchor = null;
	let from = null;
	let elapsed = 0;
	return Object.freeze({
		orbited(key) {
			mode = 'free';
			anchor = key;
			from = null;
		},
		mode: () => mode,
		// Once a frame. key: the step being read (0 for the opening); pose: where the camera is now;
		// target: the pose the shot asks for. Returns the pose to apply, or null to leave the camera
		// to the visitor.
		frame(key, pose, target, dt, { cut = false } = {}) {
			if (cut) {
				mode = 'shot';
				return target;
			}
			if (mode === 'free') {
				if (key === anchor) {
					return null;
				}
				if (!(returnSeconds > 0)) {
					mode = 'shot';
					return target;
				}
				mode = 'returning';
				from = pose;
				elapsed = 0;
			}
			if (mode === 'returning') {
				elapsed += Math.max(0, dt);
				if (elapsed >= returnSeconds) {
					mode = 'shot';
					return target;
				}
				const w = smoothstep(elapsed / returnSeconds);
				return { position: lerp3(from.position, target.position, w), target: lerp3(from.target, target.target, w) };
			}
			return target;
		},
	});
}
```

- [ ] **Step 4: Run the unit tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/shotControl.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing browser tests**

`tests/ocean/e2e/storyStage.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { oceanRunning, scrollToOpening, scrollToStep, waitFrames, watchErrors } from './helpers/story.js';

const story = (page, name, ...args) => page.evaluate(([n, a]) => window.__ocean.story[n](...a), [name, args]);
const camera = (page) => page.evaluate(() => window.__ocean.camera.position.toArray());

// Waits until the smoothed position has caught up with the scroll, then checks the camera stands
// where the blended recipe's shot says.
async function expectAtShot(page) {
	await page.waitForFunction(() => {
		const s = window.__ocean.story.state();
		const r = window.__ocean.story.reading();
		return r.phase === 'step' && s.step === r.step && (r.step === 13 || Math.abs(s.progress - r.progress) < 1e-3);
	}, null, { timeout: 60_000 });
	await waitFrames(page, 2);
	const shot = (await story(page, 'recipe')).shot;
	const position = await camera(page);
	shot.position.forEach((value, i) => expect(Math.abs(position[i] - value)).toBeLessThan(0.5));
}

test.describe.configure({ timeout: 240_000 });

test('before the first scroll the ocean is left exactly as A2 built it', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page, '/ocean/', 20);
	expect(await story(page, 'started')).toBe(false);
	const status = await page.evaluate(() => window.__ocean.status());
	expect(status.parts).toEqual({ cascades: true, painter: true, glow: true, still: false });
	const position = await camera(page);
	[0, 14, 40].forEach((value, i) => expect(position[i]).toBeCloseTo(value, 3));
	expect(errors).toEqual([]);
});

test('the first scroll into step 1 cuts to the flat white plane under its shot', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToStep(page, 1, 0.1);
	await waitFrames(page, 15);
	expect(await story(page, 'started')).toBe(true);
	expect((await story(page, 'state')).step).toBe(1);
	const look = await story(page, 'look');
	expect(look.mode).toBe('white');
	expect(look.wireframe).toBe(true);
	// A tenth of the way toward step 2's 1.5-stud sine: the height has only begun to lerp in.
	expect((await story(page, 'surface')).maxAbsY).toBeLessThan(0.25);
	await expectAtShot(page);
	expect(errors).toEqual([]);
});

test('step 6 flies the camera up, and step 7 brings in the FFT', async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 6, 0.2);
	await waitFrames(page, 15);
	expect((await camera(page))[1]).toBeGreaterThan(400);
	await scrollToStep(page, 7, 0.2);
	await page.waitForFunction(() => window.__ocean.status().source === 'fft', null, { timeout: 120_000 });
	expect((await story(page, 'look')).mode).toBe('painted');
});

test('a jump from step 1 to step 12 cuts straight there (Review Focus 1)', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToStep(page, 1, 0.1);
	await waitFrames(page, 5);
	await story(page, 'clearTrail');
	await scrollToStep(page, 12, 0.2);
	await waitFrames(page, 10);
	const trail = await story(page, 'trail');
	expect(trail.length).toBeGreaterThan(5);
	expect(trail.every((step) => step === 1 || step === 12)).toBe(true);
	expect((await story(page, 'state')).step).toBe(12);
	await expectAtShot(page);
	expect(errors).toEqual([]);
});

test('dragging the ocean frees the camera until the step changes, then the shot takes over', async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 3, 0.3);
	await waitFrames(page, 15);
	await page.mouse.move(1000, 420);
	await page.mouse.down();
	await page.mouse.move(1150, 380, { steps: 5 });
	await page.mouse.up();
	expect(await story(page, 'shotMode')).toBe('free');
	const dragged = await camera(page);
	await scrollToStep(page, 3, 0.6);
	await waitFrames(page, 5);
	expect(await story(page, 'shotMode')).toBe('free');
	expect(await camera(page)).toEqual(dragged);
	await scrollToStep(page, 4, 0.3);
	await page.waitForFunction(() => window.__ocean.story.shotMode() === 'shot', null, { timeout: 60_000 });
	await waitFrames(page, 3);
	await expectAtShot(page);
});

test('the wheel over the ocean scrolls the page instead of zooming (Review Focus 2)', async ({ page }) => {
	await oceanRunning(page);
	const before = await camera(page);
	await page.mouse.move(1000, 420);
	await page.mouse.wheel(0, 800);
	await page.waitForFunction(() => window.scrollY > 0, null, { timeout: 10_000 });
	await scrollToOpening(page);
	const after = await camera(page);
	const distance = (p) => Math.hypot(p[0], p[1] - 2, p[2] + 120);
	expect(Math.abs(distance(after) - distance(before))).toBeLessThan(0.5);
});

test('scrolling back to the opening shows the finished sea under the opening camera', async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 2, 0.3);
	await waitFrames(page, 10);
	await scrollToOpening(page);
	await waitFrames(page, 10);
	expect((await story(page, 'state')).step).toBe(13);
	expect((await story(page, 'look')).mode).toBe('painted');
	const position = await camera(page);
	[0, 14, 40].forEach((value, i) => expect(position[i]).toBeCloseTo(value, 1));
});

test.describe('under reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test("each step's own shot, with no blending toward the next", async ({ page }) => {
		await oceanRunning(page);
		await scrollToStep(page, 5, 0.5);
		await waitFrames(page, 5);
		const position = await camera(page);
		[0, 5, 25].forEach((value, i) => expect(position[i]).toBeCloseTo(value, 3));
	});
});

test.describe('on a touch-first phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('a touch-first screen gets no orbit, so a swipe over the ocean scrolls (Review Focus 2)', async ({ page }) => {
		await oceanRunning(page);
		expect(await page.evaluate(() => document.getElementById('ocean').style.touchAction)).toBe('pan-y');
	});
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/storyStage.spec.js`
Expected: FAIL: `window.__ocean.story` is null.

- [ ] **Step 7: Give the camera rig its story methods**

In `content/ocean/js/render/cameraRig.js`, above `export function createCameraRig`, add:

```js
// Piece C: how far the visitor may orbit from the target in the story, in studs, which keeps the
// sky dome, the fog and the horizon in the range they were tuned for. The farthest story shot,
// step 6's fly-up, stands about 1,078 studs from its target.
export const STORY_MAX_DISTANCE = 1200;
```

and add these three methods to the object `createCameraRig` returns (next to `applyShot`):

```js
		// Piece C: where the camera is and what it looks at; the story eases back to a shot from here.
		pose() {
			return { position: camera.position.toArray(), target: controls.target.toArray() };
		},
		// Piece C: calls back when the visitor starts dragging the camera.
		onUserOrbit(callback) {
			controls.addEventListener('start', callback);
			return () => controls.removeEventListener('start', callback);
		},
		// Piece C: the story's orbit. No zoom, so the wheel scrolls the page (OrbitControls returns
		// before preventDefault when zoom is off); no pan, since the rings follow the target; a limited
		// reach. A touch-first screen gets no orbit at all, so a swipe over the ocean scrolls.
		limitForStory({ coarsePointer }) {
			controls.enableZoom = false;
			controls.enablePan = false;
			controls.maxDistance = STORY_MAX_DISTANCE;
			if (coarsePointer) {
				controls.enabled = false;
				dom.style.touchAction = 'pan-y';
			}
		},
```

- [ ] **Step 8: Write `content/ocean/js/ui/storyStage.js`**

```js
// The story's hold on the live ocean (piece C). It turns the scroll reading (ui/story.js) into A3's
// director step and progress, applies each frame's look and camera shot, lets the visitor orbit
// between shots (page/shotControl.js), and serves the panels' sliders and the charts' data.
// Until the visitor first scrolls into a step the ocean is left exactly as A2 built it. Above step
// 1 (the opening) it shows step 13's recipe, the finished sea, under the opening camera. The
// position (step + progress) is smoothed toward the scroll and cut when it jumps more than a step,
// so a fling never sweeps the engine through the recipes in between (page/scrollMap.js). Under
// reduced motion there is no smoothing, no blending of shots, no drift and no easing back.
// A slider on a panel that is not the step being read is applied to that panel's own step: the
// director is set to it, the slider applied, and the director set back before the next frame.
import * as Charts from '../engine/charts.js';
import * as Ocean from '../engine/ocean.js';
import { probeSurface } from '../engine/surfaceProbe.js';
import { createDirector } from '../stages/director.js';
import { recipeFor, STEP_COUNT } from '../stages/recipes.js';
import { createStageLook } from '../render/stageLook.js';
import { SHOTS } from '../render/cameraRig.js';
import { positionOf, smoothPosition, splitPosition } from '../page/scrollMap.js';
import { createShotControl, resolveShot } from '../page/shotControl.js';

const TRAIL_LENGTH = 64;
const MAX_FRAME_SECONDS = 0.25;

export function createStoryStage({ ocean, view, rig, meshes, materials, config, reducedMotion = false }) {
	const director = createDirector(ocean);
	const look = createStageLook({ view, meshes, materials, config });
	const shots = createShotControl(reducedMotion ? { returnSeconds: 0 } : {});
	const openingShot = Object.freeze({ ...(SHOTS[config.camera] ?? SHOTS.deck), move: 'still' });
	const trail = [];
	let reading = Object.freeze({ phase: 'opening', step: 1, progress: 0 });
	let started = false;
	let cutPending = false;
	let position = Number.NaN;
	let key = 0;

	rig.onUserOrbit(() => shots.orbited(key));

	function setScroll(next) {
		if (next.phase !== reading.phase) {
			cutPending = true;
			position = Number.NaN;
		}
		if (next.phase === 'step') {
			started = true;
		}
		reading = next;
	}

	function followScroll(seconds) {
		if (reading.phase === 'opening') {
			director.setStep(STEP_COUNT, 0);
			return 0;
		}
		const target = positionOf(reading);
		position = reducedMotion ? target : smoothPosition(position, target, seconds);
		const { step, progress } = splitPosition(position);
		director.setStep(step, reducedMotion ? 0 : progress);
		return step;
	}

	function beforeStep(dt) {
		if (!started) {
			return;
		}
		const seconds = Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_FRAME_SECONDS) : 0;
		key = followScroll(seconds);
		trail.push(key);
		if (trail.length > TRAIL_LENGTH) trail.shift();
		const out = director.frame();
		look.apply(out.look);
		const shot = key === 0 ? openingShot : reducedMotion ? { ...recipeFor(key).shot, move: 'still' } : out.shot;
		const pose = shots.frame(key, rig.pose(), resolveShot(shot, Ocean.teachTime(ocean)), seconds, { cut: cutPending });
		cutPending = false;
		if (pose) {
			rig.applyShot({ position: pose.position, target: pose.target, move: 'still' }, 0);
		}
	}

	function afterStep() {
		if (started) {
			view.settleEnvironment();
		}
	}

	function onStep(step, fn) {
		const saved = director.state();
		director.setStep(step, 0);
		try {
			return fn();
		} finally {
			director.setStep(saved.step, saved.progress);
		}
	}

	const sliders = (step) => onStep(step, () => director.sliders());
	const setSlider = (step, id, value) => onStep(step, () => director.setSlider(id, value));
	const press = (step, id) => onStep(step, () => director.press(id));
	const sliderValue = (step, id) => sliders(step).find((slider) => slider.id === id)?.value;

	// The phase arrows are built once per sea and seed (a cascade build, 4 to 9 ms) and turned every
	// call. Step 8's sea is its recipe's own (it has no sea sliders), so a blend from step 7 does not
	// rebuild them every frame.
	let arrows = null;
	let arrowsKey = '';
	const charts = Object.freeze({
		spectrum() {
			const params = { ...ocean.live.params, windSpeed: sliderValue(7, 'wind'), fetch: sliderValue(7, 'fetch') };
			return Charts.spectrumCurve(params, { sizes: ocean.preset.sizes, n: ocean.preset.n });
		},
		phaseArrows() {
			const sea = recipeFor(8).engine.sea;
			const params = { ...ocean.live.params, windSpeed: sea.windSpeed, fetch: sea.fetch };
			const seed = sliderValue(8, 'seed');
			const arrowsFor = `${params.windSpeed}|${params.fetch}|${seed}`;
			if (arrowsFor !== arrowsKey) {
				arrows = Charts.createPhaseArrows(params, { seed, sizes: ocean.preset.sizes, n: ocean.preset.n });
				arrowsKey = arrowsFor;
			}
			return Charts.phaseArrowsAt(arrows, ocean.t);
		},
		transforms: (n) => Charts.measureTransforms(n),
		seed: () => sliderValue(8, 'seed'),
	});

	const hooks = Object.freeze({
		started: () => started,
		reading: () => reading,
		state: () => director.state(),
		recipe: () => (started ? director.frame().recipe : null),
		look: () => look.probe(),
		shotMode: () => shots.mode(),
		trail: () => [...trail],
		clearTrail: () => {
			trail.length = 0;
		},
		surface: () => probeSurface(ocean.surface),
		sliders,
		setSlider,
		press,
	});

	return Object.freeze({ setScroll, beforeStep, afterStep, sliders, setSlider, press, charts, hooks });
}
```

- [ ] **Step 9: Create the story stage in `content/ocean/js/main.js`**

Add the import below the other `./ui/` imports:

```js
import { createStoryStage } from './ui/storyStage.js';
```

Replace

```js
	const dev = route ? startStageRoute({ route, ...parts }) : null;
	const stage = dev;
```

with

```js
	const dev = route ? startStageRoute({ route, ...parts }) : null;
	// Piece C: without a route the scroll story drives the ocean (ui/storyStage.js).
	const story = route ? null : createStoryStage({ ...parts, reducedMotion });
	if (story) {
		rig.limitForStory({ coarsePointer: window.matchMedia('(pointer: coarse)').matches });
	}
	const stage = dev ?? story;
```

In the `window.__ocean` object replace `story: null,` with `story: story ? story.hooks : null,`, and in the returned object replace `story: null` with `story`.

- [ ] **Step 10: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/storyStage.spec.js`
Expected: PASS, 9 tests. A threshold that fails on a page behaving correctly (for example the 0.5-stud shot tolerance) is reported with its measured value, not loosened.

Run: `cd /Users/cole/Projects/Wesbite-ocean && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean && npm run test:ocean:e2e`
Expected: everything passes, including A2's tests (which never scroll, so the story never starts) and A3's `?step` tests (the dev route, no story).

- [ ] **Step 11: Look at it in motion**

Run the server, and with a short uncommitted Playwright script at 1366 x 767 scroll slowly (in steps of 150 px, 400 ms apart) from the opening through step 13, taking a screenshot every 1,500 px. Look at them in order. Expected: the flat white plane with its grid, the sine rolling, the waves adding up, the lit sea, the crests, the fly-up with the visible repetition, the painted FFT sea, the high view of three layers, foam, the glow toward the sun, the finale drifting. Report anything that jumps or goes black. Stop the server.

- [ ] **Step 12: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean && git add content/ocean/js/page/shotControl.js content/ocean/js/ui/storyStage.js content/ocean/js/render/cameraRig.js content/ocean/js/main.js tests/ocean/page/shotControl.test.js tests/ocean/e2e/storyStage.spec.js
```

```bash
cd /Users/cole/Projects/Wesbite-ocean && git commit -m "feat: the scroll story drives the director, the look and the camera"
```

---

### Task 6: The panels' sliders, and URL knobs held to the sliders' ranges

Each panel builds its controls from its recipe's sliders once the ocean runs: ranges (with a log scale for fetch), toggles, the New sea button and the grid-size choice, each with a colour swatch matching its term in "The math". A control on any panel sets that panel's own step, whatever step is being read. A layer toggle the tier has no cascade for is shown disabled with the reason. In story mode, URL knobs that a slider owns are clamped into that slider's range before the ocean starts.

**Files:**
- Create: `content/ocean/js/page/sliderModel.js`, `content/ocean/js/page/knobs.js`, `content/ocean/js/ui/controls.js`
- Modify: `content/ocean/js/ui/page.js` (the controls feature), `content/ocean/js/boot.js` (the clamp)
- Test: `tests/ocean/page/sliderModel.test.js`, `tests/ocean/page/knobs.test.js`, `tests/ocean/e2e/controls.spec.js`

**Interfaces:**
- Consumes: Task 5 `handle.story` (`sliders(step)`, `setSlider(step, id, value) -> value`, `press(step, id) -> value`) and `window.__ocean.story` hooks; A3 slider shape `{ id, label, kind: 'range' | 'toggle' | 'counter' | 'choice', bind, default, min?, max?, step?, unit?, scale?, options? }` plus the director's `value` and `available`; A3 `stages/recipes.js` `recipeFor`; A2 `readConfig` (frozen config with `params.windSpeed`, `params.fetch`, `chop`, `foam.whitecap`, `foam.decay`, `scatter.strength`, `warnings`); Task 4 `story.relayout()` in `ui/page.js`; Task 4 test helpers.
- Produces:
  - `page/sliderModel.js`: `LOG_STEPS` (1000), `TERM_BY_SLIDER` (slider id -> term class), `inputRange(slider) -> { min, max, step }`, `toInput(slider, value) -> number`, `fromInput(slider, position) -> number`, `formatValue(slider, value) -> string`.
  - `page/knobs.js`: `SLIDER_KNOBS`, `clampKnobsToSliders(config, recipeFor) -> { config, warnings: string[] }` (a new frozen config only when something was clamped).
  - `ui/controls.js`: `UNAVAILABLE_NOTE`, `mountControls({ root, step, story, onChange = () => {} }) -> { refresh() }`; each control is `.control[data-slider="<id>"]` inside the panel's `.controls`; ranges have `input[type=range]` and `output.control-value`; toggles `input[type=checkbox][role=switch]`; counters `button.control-press`; choices `button[role=radio][data-option]`; unavailable ones carry `.control-note`.
  - A DOM event on `document` after every change: `ocean:slider` with `detail = { step, id, value }` (Task 8's charts listen).

- [ ] **Step 1: Write the failing unit tests**

`tests/ocean/page/sliderModel.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { formatValue, fromInput, inputRange, LOG_STEPS, TERM_BY_SLIDER, toInput } from '../../../content/ocean/js/page/sliderModel.js';
import { RECIPES } from '../../../content/ocean/js/stages/recipes.js';

const WIND = { id: 'wind', label: 'Wind speed', kind: 'range', min: 3, max: 25, step: 0.5, unit: 'm/s', scale: 'linear' };
const FETCH = { id: 'fetch', label: 'Fetch', kind: 'range', min: 5000, max: 200000, step: 1000, unit: 'm', scale: 'log' };
const SUN = { id: 'sunAzimuth', label: 'Sun direction', kind: 'range', min: 0, max: 360, step: 1, unit: '°', scale: 'linear' };

test('a linear range maps straight through; a log range spreads its decades over the track', () => {
	expect.equal(inputRange(WIND).step, 0.5, 'linear step');
	expect.equal(toInput(WIND, 12), 12, 'linear in');
	expect.equal(fromInput(WIND, 12.5), 12.5, 'linear out');
	const log = inputRange(FETCH);
	expect.equal(`${log.min}..${log.max}/${log.step}`, `0..${LOG_STEPS}/1`, 'log track');
	expect.equal(toInput(FETCH, 5000), 0, 'bottom');
	expect.equal(toInput(FETCH, 200000), LOG_STEPS, 'top');
	expect.near(fromInput(FETCH, toInput(FETCH, 80000)), 80000, 400, 'round trip');
	expect.equal(toInput(FETCH, 1), 0, 'below the range clamps');
	expect.equal(fromInput(FETCH, 5000), 200000, 'past the track clamps');
});

test('values read as the panel shows them', () => {
	expect.equal(formatValue(WIND, 12), '12.0 m/s', 'one decimal for a 0.5 step');
	expect.equal(formatValue(FETCH, 80000), '80,000 m', 'thousands');
	expect.equal(formatValue(SUN, 173), '173°', 'degrees without a space');
	expect.equal(formatValue({ kind: 'toggle' }, true), 'On', 'toggle on');
	expect.equal(formatValue({ kind: 'toggle' }, false), 'Off', 'toggle off');
	expect.equal(formatValue({ kind: 'counter' }, 8), 'Sea 8', 'the seed');
	expect.equal(formatValue({ kind: 'choice' }, 32), '32 × 32', 'a grid size');
	expect.equal(formatValue({ kind: 'range', step: 1, unit: '' }, 16), '16', 'no unit');
});

test('only range sliders have a track, and every recipe slider has a term colour', () => {
	let message = '';
	try {
		inputRange({ kind: 'toggle' });
	} catch (error) {
		message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
	}
	expect.truthy(message.includes('range'), message);
	for (const recipe of RECIPES) {
		for (const slider of recipe.sliders) {
			expect.truthy(typeof TERM_BY_SLIDER[slider.id] === 'string', `step ${recipe.step} slider ${slider.id} has no term colour`);
		}
	}
});
```

`tests/ocean/page/knobs.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { clampKnobsToSliders, SLIDER_KNOBS } from '../../../content/ocean/js/page/knobs.js';

test('the shipped defaults sit inside every slider: nothing changes', () => {
	const config = readConfig('cam=deck');
	const { config: out, warnings } = clampKnobsToSliders(config, recipeFor);
	expect.equal(out, config, 'the same object');
	expect.equal(warnings.length, 0, 'no warnings');
});

test('knobs past a slider are clamped into it, each with a warning naming the knob', () => {
	const config = readConfig('wind=90&fetch=900000&chop=50&whitecap=-3&foamDecay=2&scatter=1000');
	const { config: out, warnings } = clampKnobsToSliders(config, recipeFor);
	expect.equal(out.params.windSpeed, 25, 'wind to the slider max');
	expect.equal(out.params.fetch, 200000, 'fetch');
	expect.equal(out.chop, 1, 'chop');
	expect.equal(out.foam.whitecap, 0, 'whitecap to the slider min');
	expect.equal(out.foam.decay, 0.97, 'fade');
	expect.equal(out.scatter.strength, 60, 'glow');
	for (const knob of ['wind=90', 'fetch=900000', 'chop=50', 'whitecap=-3', 'foamDecay=2', 'scatter=1000']) {
		expect.truthy(warnings.some((w) => w.startsWith(knob)), `a warning for ${knob}: ${warnings.join(' | ')}`);
	}
	expect.truthy(Object.isFrozen(out) && Object.isFrozen(out.params) && Object.isFrozen(out.foam), 'frozen');
	expect.equal(config.params.windSpeed, 90, 'the original is untouched');
});

test('every knob names a slider its step really has', () => {
	for (const { step, slider } of SLIDER_KNOBS) {
		expect.truthy(recipeFor(step).sliders.some((s) => s.id === slider && s.kind === 'range'), `step ${step} has range slider ${slider}`);
	}
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/sliderModel.test.js tests/ocean/page/knobs.test.js`
Expected: FAIL: `Cannot find module .../page/sliderModel.js` and `.../page/knobs.js`.

- [ ] **Step 3: Write `content/ocean/js/page/sliderModel.js`**

```js
// How a recipe slider (stages/recipes.js) looks as a control (piece C; browser-free): the track an
// <input type=range> gets (fetch runs on a log scale over LOG_STEPS positions, so each decade of
// fetch gets the same length of track), the value text beside it, and the term colour that
// matches the slider to its symbol in "The math" (style.css .t-* classes).
export const LOG_STEPS = 1000;

export const TERM_BY_SLIDER = Object.freeze({
	wireframe: 't-grid',
	amplitude: 't-amp',
	wavelength: 't-len',
	speed: 't-speed',
	waveCount: 't-count',
	sunAzimuth: 't-sun',
	shading: 't-sun',
	chop: 't-chop',
	wind: 't-wind',
	fetch: 't-fetch',
	seed: 't-seed',
	transformN: 't-n',
	layer1: 't-layer',
	layer2: 't-layer',
	layer3: 't-layer',
	whitecap: 't-whitecap',
	fade: 't-fade',
	sunHeight: 't-sun',
	glow: 't-glow',
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const isLog = (slider) => slider.scale === 'log';

export function inputRange(slider) {
	if (slider.kind !== 'range') {
		throw new RangeError(`only a range slider has a track, not a ${slider.kind}`);
	}
	return isLog(slider) ? { min: 0, max: LOG_STEPS, step: 1 } : { min: slider.min, max: slider.max, step: slider.step };
}

export function toInput(slider, value) {
	if (!isLog(slider)) {
		return value;
	}
	const position = (LOG_STEPS * Math.log(value / slider.min)) / Math.log(slider.max / slider.min);
	return clamp(Math.round(position), 0, LOG_STEPS);
}

export function fromInput(slider, position) {
	if (!isLog(slider)) {
		return Number(position);
	}
	return slider.min * (slider.max / slider.min) ** (clamp(Number(position), 0, LOG_STEPS) / LOG_STEPS);
}

function decimalsOf(step) {
	const text = String(step);
	const dot = text.indexOf('.');
	return dot === -1 ? 0 : text.length - dot - 1;
}

export function formatValue(slider, value) {
	switch (slider.kind) {
		case 'toggle':
			return value ? 'On' : 'Off';
		case 'counter':
			return `Sea ${value}`;
		case 'choice':
			return `${value} × ${value}`;
		default: {
			const digits = decimalsOf(slider.step ?? 1);
			const text = Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
			if (!slider.unit) return text;
			return slider.unit === '°' ? `${text}°` : `${text} ${slider.unit}`;
		}
	}
}
```

- [ ] **Step 4: Write `content/ocean/js/page/knobs.js`**

```js
// URL knobs that a panel's slider owns, held to that slider's range in story mode (piece C; A2
// final review: "unbounded URL knobs clamped by sliders"). readConfig accepts any finite number
// for these; a slider can only show its own range, and the opening's sea should be one the story's
// controls can reach. Browser-free. Each clamped knob gives a warning naming the knob, its value
// and the range used; the config returned is new and frozen, the one given is untouched.
const freezeWith = (object, changes) => Object.freeze({ ...object, ...changes });

export const SLIDER_KNOBS = Object.freeze([
	{ knob: 'wind', step: 7, slider: 'wind', read: (c) => c.params.windSpeed, write: (c, v) => ({ ...c, params: freezeWith(c.params, { windSpeed: v }) }) },
	{ knob: 'fetch', step: 7, slider: 'fetch', read: (c) => c.params.fetch, write: (c, v) => ({ ...c, params: freezeWith(c.params, { fetch: v }) }) },
	{ knob: 'chop', step: 5, slider: 'chop', read: (c) => c.chop, write: (c, v) => ({ ...c, chop: v }) },
	{ knob: 'whitecap', step: 11, slider: 'whitecap', read: (c) => c.foam.whitecap, write: (c, v) => ({ ...c, foam: freezeWith(c.foam, { whitecap: v }) }) },
	{ knob: 'foamDecay', step: 11, slider: 'fade', read: (c) => c.foam.decay, write: (c, v) => ({ ...c, foam: freezeWith(c.foam, { decay: v }) }) },
	{ knob: 'scatter', step: 12, slider: 'glow', read: (c) => c.scatter.strength, write: (c, v) => ({ ...c, scatter: freezeWith(c.scatter, { strength: v }) }) },
].map((entry) => Object.freeze(entry)));

export function clampKnobsToSliders(config, recipeFor) {
	let next = config;
	const warnings = [];
	for (const entry of SLIDER_KNOBS) {
		const slider = recipeFor(entry.step).sliders.find((s) => s.id === entry.slider);
		if (!slider) {
			throw new Error(`knobs: step ${entry.step} has no slider ${entry.slider}`);
		}
		const value = entry.read(next);
		const clamped = Math.min(Math.max(value, slider.min), slider.max);
		if (clamped !== value) {
			warnings.push(`${entry.knob}=${value} is outside the ${slider.label} slider's ${slider.min}..${slider.max}; using ${clamped}`);
			next = entry.write(next, clamped);
		}
	}
	return { config: next === config ? config : Object.freeze(next), warnings };
}
```

- [ ] **Step 5: Run the unit tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/sliderModel.test.js tests/ocean/page/knobs.test.js`
Expected: PASS, 3 and 3 tests.

- [ ] **Step 6: Write the failing browser tests**

`tests/ocean/e2e/controls.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { oceanRunning, scrollToStep, waitFrames, watchErrors } from './helpers/story.js';

const story = (page, name, ...args) => page.evaluate(([n, a]) => window.__ocean.story[n](...a), [name, args]);

// Sets a range control's value the way a drag does (an input event), without scrolling it into view:
// Playwright cannot fill a range input, and scrolling would move the story.
function setRange(page, step, id, value) {
	return page.evaluate(([s, i, v]) => {
		const input = document.querySelector(`#step-${s} [data-slider="${i}"] input[type=range]`);
		input.value = String(v);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, [step, id, value]);
}

test.describe.configure({ timeout: 240_000 });

test("every panel builds its recipe's controls", async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await expect(page.locator('#step-2 .control')).toHaveCount(3);
	await expect(page.locator('#step-2 .control label')).toHaveText(['Height', 'Length', 'Speed']);
	await expect(page.locator('#step-2 [data-slider="amplitude"] output')).toHaveText('1.50 studs');
	await expect(page.locator('#step-1 [data-slider="wireframe"] input[role=switch]')).toBeChecked();
	await expect(page.locator('#step-8 [data-slider="seed"] button.control-press')).toHaveText('New sea');
	await expect(page.locator('#step-9 [data-slider="transformN"] button[role=radio]')).toHaveCount(4);
	await expect(page.locator('#step-7 [data-slider="fetch"] output')).toHaveText('80,000 m');
	await expect(page.locator('#step-13 .control')).toHaveCount(0);
	await expect(page.locator('#step-2 [data-slider="amplitude"] .swatch.t-amp')).toHaveCount(1);
	expect(errors).toEqual([]);
});

test('the height slider on step 2 raises the sine on screen', async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 2, 0.05);
	await waitFrames(page, 10);
	await setRange(page, 2, 'amplitude', 4);
	await expect(page.locator('#step-2 [data-slider="amplitude"] output')).toHaveText('4.00 studs');
	await waitFrames(page, 10);
	expect((await story(page, 'surface')).maxAbsY).toBeGreaterThan(3);
});

test('a slider on the next panel changes that step, not the one being read (Review Focus 4)', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToStep(page, 6, 0.2);
	await waitFrames(page, 5);
	for (const value of [5, 9, 14, 18, 22]) await setRange(page, 7, 'wind', value);
	const state = await story(page, 'state');
	expect(state.step).toBe(6);
	expect(state.values['7'].wind).toBe(22);
	await expect(page.locator('#step-7 [data-slider="wind"] output')).toHaveText('22.0 m/s');
	await scrollToStep(page, 7, 0.2);
	await page.waitForFunction(() => Math.abs(window.__ocean.status().windSpeed - 22) < 1e-9, null, { timeout: 120_000 });
	expect(errors).toEqual([]);
});

test('New sea rolls the seed', async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 8, 0.2);
	const before = await page.locator('#step-8 [data-slider="seed"] output').textContent();
	await page.locator('#step-8 [data-slider="seed"] button.control-press').click();
	const after = await page.locator('#step-8 [data-slider="seed"] output').textContent();
	expect(after).not.toBe(before);
	const seed = Number(after.replace('Sea ', ''));
	await page.waitForFunction((s) => window.__ocean.status().seed === s, seed, { timeout: 120_000 });
});

test("URL knobs past a slider's range are clamped into it, with a warning", async ({ page }) => {
	const warnings = [];
	page.on('console', (message) => {
		if (message.type() === 'warning') warnings.push(message.text());
	});
	await oceanRunning(page, '/ocean/?wind=90&chop=50');
	expect(warnings.some((w) => w.includes('wind=90'))).toBe(true);
	expect(warnings.some((w) => w.includes('chop=50'))).toBe(true);
	expect(await page.evaluate(() => window.__ocean.status().windSpeed)).toBeLessThanOrEqual(25);
});

test('without WebGL there are no controls to confuse anyone', async ({ page }) => {
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
			return kind === 'webgl' || kind === 'webgl2' ? null : original.call(this, kind, ...rest);
		};
	});
	await page.goto('/ocean/');
	await expect(page.locator('body')).toHaveAttribute('data-ocean', 'unavailable');
	await expect(page.locator('.control')).toHaveCount(0);
});

test.describe('on a phone, on the lighter tier by rule', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the third layer toggle is disabled and says why (Review Focus 5)', async ({ page }) => {
		await oceanRunning(page);
		expect(await page.evaluate(() => window.__ocean.status().tierReason)).toBe('phone rule');
		await expect(page.locator('#step-10 [data-slider="layer3"] input')).toBeDisabled();
		await expect(page.locator('#step-10 [data-slider="layer3"] .control-note')).toHaveText("Not on this device's lighter tier");
		await expect(page.locator('#step-10 [data-slider="layer1"] input')).toBeEnabled();
		await expect(page.locator('#step-10 [data-slider="layer2"] input')).toBeEnabled();
	});
});
```

- [ ] **Step 7: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/controls.spec.js`
Expected: FAIL: no `.control` elements (and no clamp warnings).

- [ ] **Step 8: Write `content/ocean/js/ui/controls.js`**

```js
// The controls on one panel (piece C; spec 2: "one or two sliders that change the live ocean"),
// built from the recipe's sliders through the story stage, which applies every change to this
// panel's own step. Each control shows the director's value after it clamps and snaps, carries a
// swatch in its term's colour, and says so when the tier cannot run it. After each change the
// document gets an `ocean:slider` event for the charts.
import { TERM_BY_SLIDER, formatValue, fromInput, inputRange, toInput } from '../page/sliderModel.js';

export const UNAVAILABLE_NOTE = "Not on this device's lighter tier";

function element(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	Object.assign(node, props);
	node.append(...children);
	return node;
}

function labelFor(slider, forId) {
	const label = element('label', { htmlFor: forId });
	label.append(element('span', { className: `swatch ${TERM_BY_SLIDER[slider.id] ?? ''}`, ariaHidden: 'true' }), slider.label);
	return label;
}

export function mountControls({ root, step, story, onChange = () => {} }) {
	const rows = new Map();

	function changed(id, value) {
		refresh();
		onChange({ step, id, value });
	}

	function rangeRow(slider, id) {
		const track = inputRange(slider);
		const input = element('input', { type: 'range', id, min: String(track.min), max: String(track.max), step: String(track.step) });
		const output = element('output', { className: 'control-value', htmlFor: id });
		input.addEventListener('input', () => changed(slider.id, story.setSlider(step, slider.id, fromInput(slider, Number(input.value)))));
		return {
			children: [labelFor(slider, id), output, input],
			show(s) {
				input.value = String(toInput(s, s.value));
				output.textContent = formatValue(s, s.value);
				input.disabled = !s.available;
			},
		};
	}

	function toggleRow(slider, id) {
		const input = element('input', { type: 'checkbox', id });
		input.setAttribute('role', 'switch');
		const output = element('output', { className: 'control-value', htmlFor: id });
		input.addEventListener('change', () => changed(slider.id, story.setSlider(step, slider.id, input.checked)));
		return {
			children: [input, labelFor(slider, id), output],
			show(s) {
				input.checked = Boolean(s.value);
				output.textContent = formatValue(s, s.value);
				input.disabled = !s.available;
			},
		};
	}

	function counterRow(slider, id) {
		const button = element('button', { type: 'button', id, className: 'control-press', textContent: slider.label });
		const output = element('output', { className: 'control-value', htmlFor: id });
		button.addEventListener('click', () => changed(slider.id, story.press(step, slider.id)));
		return {
			children: [element('span', { className: `swatch ${TERM_BY_SLIDER[slider.id] ?? ''}`, ariaHidden: 'true' }), button, output],
			show(s) {
				output.textContent = formatValue(s, s.value);
				button.disabled = !s.available;
			},
		};
	}

	function choiceRow(slider, id) {
		const group = element('div', { className: 'segmented', id });
		group.setAttribute('role', 'radiogroup');
		group.setAttribute('aria-label', slider.label);
		const buttons = slider.options.map((option) => {
			const button = element('button', { type: 'button', textContent: formatValue(slider, option) });
			button.setAttribute('role', 'radio');
			button.dataset.option = String(option);
			button.addEventListener('click', () => changed(slider.id, story.setSlider(step, slider.id, option)));
			return button;
		});
		group.append(...buttons);
		const label = element('span', { className: 'control-label' });
		label.append(element('span', { className: `swatch ${TERM_BY_SLIDER[slider.id] ?? ''}`, ariaHidden: 'true' }), slider.label);
		return {
			children: [label, group],
			show(s) {
				for (const button of buttons) {
					button.setAttribute('aria-checked', String(Number(button.dataset.option) === s.value));
					button.disabled = !s.available;
				}
			},
		};
	}

	const BUILDERS = { range: rangeRow, toggle: toggleRow, counter: counterRow, choice: choiceRow };

	function build() {
		root.replaceChildren();
		rows.clear();
		for (const slider of story.sliders(step)) {
			const id = `control-${step}-${slider.id}`;
			const row = BUILDERS[slider.kind](slider, id);
			const note = element('span', { className: 'control-note', textContent: UNAVAILABLE_NOTE });
			const wrapper = element('div', { className: `control control-${slider.kind}` }, [...row.children, note]);
			wrapper.dataset.slider = slider.id;
			rows.set(slider.id, { row, note });
			root.append(wrapper);
		}
		refresh();
	}

	function refresh() {
		for (const slider of story.sliders(step)) {
			const entry = rows.get(slider.id);
			if (!entry) continue;
			entry.row.show(slider);
			entry.note.hidden = slider.available;
		}
	}

	build();
	return Object.freeze({ refresh });
}
```

Add to `content/ocean/style.css`, after the `.controls:empty` rule:

```css
.control {
	display: grid;
	grid-template-columns: 1fr auto;
	align-items: center;
	gap: 4px 10px;
}

.control input[type='range'] {
	grid-column: 1 / -1;
	width: 100%;
	accent-color: var(--accent);
}

.control-toggle {
	grid-template-columns: auto 1fr auto;
}

.control-counter {
	grid-template-columns: auto auto 1fr;
}

.control-press {
	padding: 6px 14px;
	border-radius: 999px;
	border: 1px solid var(--line);
	background: transparent;
	color: var(--ink);
	font: inherit;
	cursor: pointer;
}

.control-value {
	font-variant-numeric: tabular-nums;
	color: var(--ink-dim);
	text-align: right;
}

.control-note {
	grid-column: 1 / -1;
	font-size: 0.8rem;
	color: var(--ink-dim);
}

.control-note[hidden] {
	display: none;
}

.swatch {
	display: inline-block;
	width: 0.6em;
	height: 0.6em;
	margin-right: 6px;
	border-radius: 50%;
	background: currentColor;
	vertical-align: middle;
}
```

- [ ] **Step 9: Add the controls to `content/ocean/js/ui/page.js`**

Directly above `// Feature imports end.` add:

```js
import { mountControls } from './controls.js';
```

Directly above `// Features end.` add:

```js
	// Task 6: the panels' controls, once the ocean runs in story mode.
	features.push({
		attachOcean(handle) {
			if (!handle.story) {
				return;
			}
			for (const root of document.querySelectorAll('.controls[data-controls]')) {
				const step = Number(root.dataset.controls);
				mountControls({
					root,
					step,
					story: handle.story,
					onChange: (detail) => document.dispatchEvent(new CustomEvent('ocean:slider', { detail })),
				});
			}
			story.relayout();
		},
	});
```

- [ ] **Step 10: Clamp the slider-owned knobs in `content/ocean/js/boot.js`**

Add the imports:

```js
import { recipeFor } from './stages/recipes.js';
import { clampKnobsToSliders } from './page/knobs.js';
```

Replace

```js
const config = readConfig(searchFor(location.search, route));
for (const warning of [...config.warnings, ...(route?.warnings ?? [])]) {
	console.warn(`[ocean] ${warning}`);
}
```

with

```js
const read = readConfig(searchFor(location.search, route));
// In the story, knobs a slider owns stay inside that slider's range (page/knobs.js).
const clamped = route ? { config: read, warnings: [] } : clampKnobsToSliders(read, recipeFor);
const config = clamped.config;
for (const warning of [...read.warnings, ...clamped.warnings, ...(route?.warnings ?? [])]) {
	console.warn(`[ocean] ${warning}`);
}
```

- [ ] **Step 11: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/controls.spec.js && node --test tests/ocean/page/bootGraph.test.js`
Expected: PASS: 7 browser tests; the boot graph still clean (recipes and knobs are local and free of CDN imports).

Run: `cd /Users/cole/Projects/Wesbite-ocean && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean && npm run test:ocean:e2e`
Expected: everything passes, including the copy check (controls are inside `data-copy-skip="live"`).

- [ ] **Step 12: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean && git add content/ocean/js/page/sliderModel.js content/ocean/js/page/knobs.js content/ocean/js/ui/controls.js content/ocean/js/ui/page.js content/ocean/js/boot.js content/ocean/style.css tests/ocean/page/sliderModel.test.js tests/ocean/page/knobs.test.js tests/ocean/e2e/controls.spec.js
```

```bash
cd /Users/cole/Projects/Wesbite-ocean && git commit -m "feat: the panels' sliders, bound to each panel's own step"
```

---

### Task 7: "The math", typeset by KaTeX when a visitor opens it

The maths lines stay collapsed raw TeX in the HTML. The first time any of them is opened, the page loads KaTeX (script and stylesheet, both from jsDelivr, never before) and typesets all twelve, keeping the term colour classes (`\htmlClass`, the only trusted command). If KaTeX never arrives, the TeX source stays readable.

**Files:**
- Create: `content/ocean/js/page/mathTrust.js`, `content/ocean/js/ui/math.js`
- Modify: `content/ocean/js/ui/page.js` (the maths feature), `content/ocean/style.css` (rendered maths)
- Test: `tests/ocean/page/mathTrust.test.js`, `tests/ocean/e2e/math.spec.js`

**Interfaces:**
- Consumes: Task 2's `details.math` > `.tex[data-copy-skip="math"]` > `code`, and the `.t-*` colour classes; Task 1's import map entry `katex`; Task 4 `story.relayout()`; Task 6's slider swatches (test only).
- Produces:
  - `page/mathTrust.js`: `KATEX_CSS` (the stylesheet URL), `trustHtmlClass(context) -> boolean`, `KATEX_OPTIONS` (frozen).
  - `ui/math.js`: `loadKatex() -> Promise<katex>`, `startMath({ load = loadKatex, onRendered = () => {} } = {}) -> { ensure() -> Promise, state() -> 'waiting' | 'loading' | 'rendered' | 'failed' }`. A rendered line's `.tex` holds `div.tex-rendered` (KaTeX output) and keeps its source in `data-tex`.

- [ ] **Step 1: Write the failing unit test**

`tests/ocean/page/mathTrust.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { KATEX_CSS, KATEX_OPTIONS, trustHtmlClass } from '../../../content/ocean/js/page/mathTrust.js';

test('KaTeX may run \\htmlClass (the term colours) and nothing else it would need trust for', () => {
	expect.equal(trustHtmlClass({ command: '\\htmlClass', class: 't-amp' }), true, 'htmlClass');
	for (const command of ['\\href', '\\url', '\\includegraphics', '\\htmlId', '\\htmlStyle', '\\htmlData']) {
		expect.equal(trustHtmlClass({ command }), false, command);
	}
	expect.equal(KATEX_OPTIONS.trust, trustHtmlClass, 'the options use it');
	expect.equal(KATEX_OPTIONS.throwOnError, false, 'a bad formula renders in red instead of throwing');
	expect.truthy(Object.isFrozen(KATEX_OPTIONS), 'frozen');
	expect.equal(KATEX_CSS, 'https://cdn.jsdelivr.net/npm/katex@0.18.10/dist/katex.min.css', 'the pinned stylesheet');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/mathTrust.test.js`
Expected: FAIL: `Cannot find module .../page/mathTrust.js`.

- [ ] **Step 3: Write `content/ocean/js/page/mathTrust.js`**

```js
// How the page asks KaTeX to typeset "The math" (piece C; browser-free). The formulas colour their
// terms with \htmlClass{t-...}{...} to match the sliders (style.css); that is the only command
// that needs KaTeX's trust, so it is the only one allowed.
export const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.18.10/dist/katex.min.css';

export const trustHtmlClass = (context) => context.command === '\\htmlClass';

export const KATEX_OPTIONS = Object.freeze({
	displayMode: true,
	throwOnError: false,
	trust: trustHtmlClass,
	strict: 'ignore',
	output: 'htmlAndMathml',
});
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/mathTrust.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing browser tests**

`tests/ocean/e2e/math.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { oceanRunning } from './helpers/story.js';

function countKatex(page) {
	const seen = { requests: 0 };
	page.on('request', (request) => {
		if (request.url().includes('katex@0.18.10')) seen.requests++;
	});
	return seen;
}

test('nothing of KaTeX loads until a maths line is opened; then all twelve are typeset', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const seen = countKatex(page);
	await page.goto('/ocean/');
	await page.locator('#step-9').scrollIntoViewIfNeeded();
	await page.waitForTimeout(500);
	expect(seen.requests).toBe(0);
	await page.locator('#step-2 details.math summary').click();
	await expect(page.locator('#step-2 .tex .katex')).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('.tex .katex')).toHaveCount(12);
	await expect(page.locator('.tex .katex-error')).toHaveCount(0);
	await expect(page.locator('#step-2 .tex')).toHaveAttribute('data-tex', /\\sin/);
	expect(seen.requests).toBeGreaterThan(0);
	expect(errors).toEqual([]);
});

test("a term's colour in the maths matches its slider's swatch", async ({ page }) => {
	await oceanRunning(page);
	await page.locator('#step-2 details.math summary').click();
	await expect(page.locator('#step-2 .tex .t-amp').first()).toBeVisible({ timeout: 30_000 });
	const colours = await page.evaluate(() => ({
		term: getComputedStyle(document.querySelector('#step-2 .tex .t-amp')).color,
		swatch: getComputedStyle(document.querySelector('#step-2 [data-slider="amplitude"] .swatch')).color,
		speed: getComputedStyle(document.querySelector('#step-2 .tex .t-speed')).color,
	}));
	expect(colours.term).toBe(colours.swatch);
	expect(colours.speed).not.toBe(colours.term);
});

test('with KaTeX blocked the TeX source stays readable (Review Focus 3)', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/npm/katex@0.18.10/**', (route) => route.abort());
	await page.goto('/ocean/');
	await page.locator('#step-7 details.math summary').click();
	await page.waitForTimeout(1000);
	await expect(page.locator('#step-7 .tex code')).toBeVisible();
	await expect(page.locator('#step-7 .tex code')).toContainText('\\omega_p');
	await expect(page.locator('.tex .katex')).toHaveCount(0);
	expect(errors).toEqual([]);
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/math.spec.js`
Expected: FAIL: no `.katex` appears after opening a line.

- [ ] **Step 7: Write `content/ocean/js/ui/math.js`**

```js
// "The math" lines (piece C; spec 2: "a collapsed 'The math' line with the real equation (KaTeX),
// terms coloured to match what they control"). The HTML carries each formula as TeX source, which
// is what shows if KaTeX never arrives. The first time any line is opened, KaTeX's stylesheet and
// module are fetched from jsDelivr (never before, so a visitor who never opens one downloads
// none of it) and every line is typeset at once.
import { KATEX_CSS, KATEX_OPTIONS } from '../page/mathTrust.js';

export async function loadKatex() {
	if (!document.querySelector(`link[href="${KATEX_CSS}"]`)) {
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = KATEX_CSS;
		document.head.append(link);
	}
	const module = await import('katex');
	return module.default ?? module;
}

export function startMath({ load = loadKatex, onRendered = () => {} } = {}) {
	const lines = [...document.querySelectorAll('details.math')];
	let loading = null;
	let state = 'waiting';

	function typeset(katex) {
		for (const details of lines) {
			const tex = details.querySelector('.tex');
			const code = tex?.querySelector('code');
			if (!code) continue;
			const source = code.textContent;
			const target = document.createElement('div');
			target.className = 'tex-rendered';
			katex.render(source, target, KATEX_OPTIONS);
			tex.dataset.tex = source;
			tex.replaceChildren(target);
		}
	}

	function ensure() {
		if (!loading) {
			state = 'loading';
			loading = load()
				.then((katex) => {
					typeset(katex);
					state = 'rendered';
					onRendered();
				})
				.catch((error) => {
					state = 'failed';
					console.warn('[ocean] KaTeX did not load; the maths stays as TeX source', error);
				});
		}
		return loading;
	}

	for (const details of lines) {
		details.addEventListener('toggle', () => {
			if (details.open) ensure();
		});
	}
	return Object.freeze({ ensure, state: () => state });
}
```

Add to `content/ocean/style.css`, after the `.tex code` rule:

```css
.tex-rendered {
	overflow-x: auto;
	overflow-y: hidden;
	padding: 4px 0;
	font-size: 0.95rem;
}
```

- [ ] **Step 8: Add the maths to `content/ocean/js/ui/page.js`**

Directly above `// Feature imports end.` add:

```js
import { startMath } from './math.js';
```

Directly above `// Features end.` add:

```js
	// Task 7: "The math" lines, typeset the first time one is opened.
	startMath({ onRendered: () => story.relayout() });
```

- [ ] **Step 9: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/math.spec.js && node --test tests/ocean/page/bootGraph.test.js`
Expected: PASS: 3 browser tests; the boot graph clean (`katex` only by dynamic import).

Then open each of the twelve lines in a short uncommitted Playwright script at 1366 x 767 and at 390 x 844, screenshot each panel, and look: every formula typeset, the coloured terms visible, nothing overflowing the panel (wide formulas scroll sideways inside `.tex-rendered`). Report what you saw.

Run: `cd /Users/cole/Projects/Wesbite-ocean && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean && npm run test:ocean:e2e`
Expected: everything passes.

- [ ] **Step 10: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean && git add content/ocean/js/page/mathTrust.js content/ocean/js/ui/math.js content/ocean/js/ui/page.js content/ocean/style.css tests/ocean/page/mathTrust.test.js tests/ocean/e2e/math.spec.js
```

```bash
cd /Users/cole/Projects/Wesbite-ocean && git commit -m "feat: the maths lines, typeset by KaTeX on first open"
```

---

### Task 8: The charts: the spectrum, the spinning phase arrows and the FFT timing

Three inline-SVG charts, drawn from A3's chart data through the story stage and coloured by theme tokens so they read in light and dark: step 7's JONSWAP curve on a fixed log axis (so a stronger wind visibly raises and shifts the peak) with the three layers' bands shaded; step 8's eight tallest waves of the 256-stud layer as arrows turning at their own speeds, animated only while on screen; step 9's naive-sum versus FFT timing, measured in the visitor's browser when the chart is on screen and whenever the grid size changes. Every number in them is live and labelled so.

**Files:**
- Create: `content/ocean/js/page/chartGeometry.js`, `content/ocean/js/ui/charts.js`
- Modify: `content/ocean/js/ui/storyStage.js` (one chart helper), `content/ocean/js/ui/page.js` (the charts feature), `content/ocean/style.css` (chart marks)
- Test: `tests/ocean/page/chartGeometry.test.js`, `tests/ocean/e2e/charts.spec.js`

**Interfaces:**
- Consumes: Task 5 `handle.story.charts` (`spectrum() -> { omega, physical, shaped, peakOmega, peakWavelength, bands: [{ size, omegaMin, omegaMax }] }`, `phaseArrows() -> [{ re, im, amplitude, wavelength }]`, `transforms(n) -> { n, naiveMs, fftMs, speedup, maxDifference }`), `handle.story.sliders(9)` (the `transformN` value); A3 `stages/recipes.js` `recipeFor(7)` (the wind and fetch slider maxima); Task 6's `ocean:slider` events; Task 2's `figure.chart[data-chart] > .chart-body` and the chart tokens; Task 4/6 test helpers.
- Produces:
  - `page/chartGeometry.js`: `linearScale([d0, d1], [r0, r1]) -> (v) => px`, `logScale([d0, d1], [r0, r1]) -> (v) => px` (throws `RangeError` for a domain that is not positive), `linePath(xs, ys, x, y, { top, bottom }) -> 'M…L…'` (skips non-finite points, clamps to the plot), `niceTicks(min, max, count = 5) -> number[]`, `arrowEnd(re, im, maxAmplitude, radius) -> { x, y }` (SVG y down).
  - `storyStage` charts gain `spectrumCeiling() -> number` (the largest JONSWAP value at the wind and fetch sliders' maxima, computed once).
  - `ui/charts.js`: `mountCharts(story) -> { redraw() }`; SVG classes `chart-line`, `chart-band`, `chart-grid`, `chart-text`, `chart-peak`, `chart-arrow`, `chart-ring`, `chart-bar-naive`, `chart-bar-fft`; `figure[data-chart="transforms"]` gets `data-state` `'waiting' | 'measuring' | 'done'`.

- [ ] **Step 1: Write the failing unit tests**

`tests/ocean/page/chartGeometry.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { arrowEnd, linearScale, linePath, logScale, niceTicks } from '../../../content/ocean/js/page/chartGeometry.js';

test('scales map their domain onto the plot', () => {
	const x = linearScale([0, 10], [30, 310]);
	expect.equal(x(0), 30, 'left');
	expect.equal(x(10), 310, 'right');
	expect.equal(x(5), 170, 'middle');
	const y = logScale([1e-4, 1], [170, 10]);
	expect.near(y(1), 10, 1e-9, 'top');
	expect.near(y(1e-2), 90, 1e-9, 'two decades down is half way');
	let message = '';
	try {
		logScale([0, 1], [0, 1]);
	} catch (error) {
		message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
	}
	expect.truthy(message.includes('positive'), message);
});

test('a path skips points it cannot place and keeps the rest inside the plot', () => {
	const x = linearScale([0, 3], [0, 30]);
	const y = linearScale([0, 1], [100, 0]);
	const d = linePath([0, 1, 2, 3], [0.5, Number.NaN, 5, 0], x, y, { top: 0, bottom: 100 });
	expect.equal(d, 'M0.00 50.00 L20.00 0.00 L30.00 100.00', d);
	expect.equal(linePath([], [], x, y, { top: 0, bottom: 100 }), '', 'nothing to draw');
});

test('ticks land on round numbers across the range', () => {
	expect.equal(niceTicks(0.2, 6, 6).join(','), '1,2,3,4,5,6', 'the spectrum axis');
	expect.equal(niceTicks(0.2, 6).join(','), '2,4,6', 'fewer ticks asked for, wider steps');
	expect.equal(niceTicks(0, 1).join(','), '0,0.2,0.4,0.6,0.8,1', 'fractions');
});

test("an arrow is its wave's phasor, scaled so the tallest reaches the ring", () => {
	const end = arrowEnd(3, 4, 5, 20);
	expect.near(end.x, 12, 1e-12, 'x');
	expect.near(end.y, -16, 1e-12, 'y up is negative in SVG');
	const none = arrowEnd(1, 1, 0, 20);
	expect.equal(none.x, 0, 'no amplitude, no arrow');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/chartGeometry.test.js`
Expected: FAIL: `Cannot find module .../page/chartGeometry.js`.

- [ ] **Step 3: Write `content/ocean/js/page/chartGeometry.js`**

```js
// The geometry of the story's charts (piece C; browser-free): scales, a clipped SVG path, round
// tick values and the end of a phase arrow.
export function linearScale([d0, d1], [r0, r1]) {
	const k = (r1 - r0) / (d1 - d0);
	return (value) => r0 + (value - d0) * k;
}

export function logScale([d0, d1], [r0, r1]) {
	if (!(d0 > 0 && d1 > 0)) {
		throw new RangeError(`a log scale needs a positive domain, got ${d0} .. ${d1}`);
	}
	const l0 = Math.log10(d0);
	const k = (r1 - r0) / (Math.log10(d1) - l0);
	return (value) => r0 + (Math.log10(value) - l0) * k;
}

export function linePath(xs, ys, x, y, { top, bottom }) {
	const points = [];
	for (let i = 0; i < xs.length; i++) {
		const px = x(xs[i]);
		const py = y(ys[i]);
		if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
		points.push(`${px.toFixed(2)} ${Math.min(Math.max(py, top), bottom).toFixed(2)}`);
	}
	return points.length === 0 ? '' : `M${points.join(' L')}`;
}

function niceStep(raw) {
	const power = 10 ** Math.floor(Math.log10(raw));
	const fraction = raw / power;
	return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

export function niceTicks(min, max, count = 5) {
	const step = niceStep((max - min) / count);
	const ticks = [];
	for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
		ticks.push(Number(value.toFixed(10)));
	}
	return ticks;
}

export function arrowEnd(re, im, maxAmplitude, radius) {
	const scale = maxAmplitude > 0 ? radius / maxAmplitude : 0;
	return { x: re * scale, y: -im * scale };
}
```

- [ ] **Step 4: Run the unit tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/chartGeometry.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Give the story stage the spectrum's ceiling**

In `content/ocean/js/ui/storyStage.js`, above `const charts = Object.freeze({`, add:

```js
	// The spectrum chart's fixed top: JONSWAP at the wind and fetch sliders' maxima, so a stronger
	// wind raises the curve on the chart instead of rescaling the axis.
	let ceiling = null;
```

and add this entry inside the `charts` object, after `spectrum() { ... },`:

```js
		spectrumCeiling() {
			if (ceiling === null) {
				const slider = (id) => recipeFor(7).sliders.find((s) => s.id === id);
				const storm = { ...ocean.live.params, windSpeed: slider('wind').max, fetch: slider('fetch').max };
				ceiling = Math.max(...Charts.spectrumCurve(storm, { sizes: ocean.preset.sizes, n: ocean.preset.n }).physical);
			}
			return ceiling;
		},
```

- [ ] **Step 6: Write the failing browser tests**

`tests/ocean/e2e/charts.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { oceanRunning, scrollToStep, waitFrames, watchErrors } from './helpers/story.js';

function contrast(a, b) {
	const lum = (rgb) => {
		const [r, g, bl] = rgb.map((v) => {
			const c = v / 255;
			return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}
const rgb = (css) => css.match(/[\d.]+/g).slice(0, 3).map(Number);

function setRange(page, step, id, value) {
	return page.evaluate(([s, i, v]) => {
		const input = document.querySelector(`#step-${s} [data-slider="${i}"] input[type=range]`);
		input.value = String(v);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, [step, id, value]);
}

test.describe.configure({ timeout: 240_000 });

test('step 7 draws the spectrum of the sea on screen, and a stronger wind moves it', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToStep(page, 7, 0.2);
	const line = page.locator('#step-7 figure.chart path.chart-line');
	await expect(line).toHaveCount(1);
	const before = await line.getAttribute('d');
	expect(before.split('L').length).toBeGreaterThan(100);
	await expect(page.locator('#step-7 figure.chart .chart-band')).toHaveCount(3);
	const peakBefore = await page.locator('#step-7 figure.chart .chart-peak-label').textContent();
	await setRange(page, 7, 'wind', 22);
	await expect.poll(() => line.getAttribute('d')).not.toBe(before);
	await expect(page.locator('#step-7 figure.chart .chart-peak-label')).not.toHaveText(peakBefore);
	expect(errors).toEqual([]);
});

test("step 8's arrows are eight real waves, turning while the ocean runs", async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 8, 0.2);
	const arrows = page.locator('#step-8 figure.chart line.chart-arrow');
	await expect(arrows).toHaveCount(8);
	const first = async () => arrows.first().evaluate((l) => `${l.getAttribute('x2')},${l.getAttribute('y2')}`);
	const before = await first();
	await waitFrames(page, 10);
	expect(await first()).not.toBe(before);
});

test('step 9 times both ways in the visitor browser, again for a new grid size', async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 9, 0.2);
	const figure = page.locator('#step-9 figure.chart');
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
	await expect(figure).toContainText('Measured in your browser just now');
	await expect(figure).toContainText('32 × 32');
	const widths = await figure.evaluate((f) => [f.querySelector('.chart-bar-naive').getAttribute('width'), f.querySelector('.chart-bar-fft').getAttribute('width')].map(Number));
	expect(widths[0]).toBeGreaterThan(widths[1]);
	await page.locator('#step-9 [data-slider="transformN"] button[data-option="64"]').click();
	await expect(figure).toContainText('64 × 64', { timeout: 60_000 });
	await expect(figure).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
});

for (const scheme of ['dark', 'light']) {
	test(`the charts read when the system prefers ${scheme} (the page is always dark)`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });
		await oceanRunning(page);
		await scrollToStep(page, 7, 0.2);
		await expect(page.locator('#step-7 figure.chart path.chart-line')).toHaveCount(1);
		const colours = await page.evaluate(() => ({
			bg: getComputedStyle(document.querySelector('#step-7 figure.chart')).backgroundColor,
			line: getComputedStyle(document.querySelector('#step-7 figure.chart .chart-line')).stroke,
			text: getComputedStyle(document.querySelector('#step-7 figure.chart .chart-text')).fill,
		}));
		expect(contrast(rgb(colours.line), rgb(colours.bg))).toBeGreaterThanOrEqual(3);
		expect(contrast(rgb(colours.text), rgb(colours.bg))).toBeGreaterThanOrEqual(4.5);
	});
}
```

- [ ] **Step 7: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/charts.spec.js`
Expected: FAIL: no `path.chart-line`.

- [ ] **Step 8: Write `content/ocean/js/ui/charts.js`**

```js
// The story's three charts (piece C; spec 3, steps 7 to 9), inline SVG coloured by the theme's
// chart tokens (style.css), fed by A3's chart data through the story stage. Every number they show
// is computed live, and the figures carry data-copy-skip="live".
//   spectrum (step 7): JONSWAP energy against wave frequency on a log axis whose top is the
//     stormiest sea the sliders allow, with each wave layer's band shaded and the peak marked.
//   phase (step 8): the eight tallest waves of the 256-stud layer, each an arrow turning at its own
//     speed; animated only while the chart is on screen.
//   transforms (step 9): the wave-by-wave sum against the FFT, timed in this browser when the
//     chart comes on screen and again for each new grid size.
import { arrowEnd, linearScale, linePath, logScale, niceTicks } from '../page/chartGeometry.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 320;
const H = 180;
const PLOT = Object.freeze({ left: 30, right: 312, top: 16, bottom: 150 });
const DECADES = 4;

function svg(tag, attributes = {}, text = null) {
	const node = document.createElementNS(NS, tag);
	for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
	if (text !== null) node.textContent = text;
	return node;
}

function canvasFor(figure, height = H) {
	const root = svg('svg', { viewBox: `0 0 ${W} ${height}`, role: 'img' });
	figure.querySelector('.chart-body').replaceChildren(root);
	return root;
}

// Calls onShow each time `figure` comes on screen and onHide when it leaves; returns whether it is
// on screen now.
function whileVisible(figure, onShow, onHide = () => {}) {
	let visible = false;
	new IntersectionObserver((entries) => {
		const now = entries.some((entry) => entry.isIntersecting);
		if (now && !visible) onShow();
		if (!now && visible) onHide();
		visible = now;
	}).observe(figure);
	return () => visible;
}

function spectrumChart(figure, story) {
	function draw() {
		const curve = story.charts.spectrum();
		const top = story.charts.spectrumCeiling() * 1.5;
		const x = linearScale([curve.omega[0], curve.omega[curve.omega.length - 1]], [PLOT.left, PLOT.right]);
		const y = logScale([top / 10 ** DECADES, top], [PLOT.bottom, PLOT.top]);
		const root = canvasFor(figure);
		root.setAttribute('aria-label', `JONSWAP spectrum, peak at ${curve.peakWavelength.toFixed(0)} metre waves`);
		for (const band of curve.bands) {
			const from = Math.max(band.omegaMin, curve.omega[0]);
			const to = Math.min(band.omegaMax, curve.omega[curve.omega.length - 1]);
			if (!(to > from)) continue;
			root.append(svg('rect', { class: 'chart-band', x: x(from), y: PLOT.top, width: x(to) - x(from), height: PLOT.bottom - PLOT.top }));
			root.append(svg('text', { class: 'chart-text', x: (x(from) + x(to)) / 2, y: PLOT.top - 4, 'text-anchor': 'middle' }, `${band.size}-stud layer`));
		}
		for (const tick of niceTicks(curve.omega[0], curve.omega[curve.omega.length - 1], 6)) {
			root.append(svg('line', { class: 'chart-grid', x1: x(tick), x2: x(tick), y1: PLOT.top, y2: PLOT.bottom }));
			root.append(svg('text', { class: 'chart-text', x: x(tick), y: PLOT.bottom + 12, 'text-anchor': 'middle' }, String(tick)));
		}
		root.append(svg('text', { class: 'chart-text', x: (PLOT.left + PLOT.right) / 2, y: H - 4, 'text-anchor': 'middle' }, 'wave frequency ω (rad/s)'));
		root.append(svg('text', { class: 'chart-text', x: 10, y: (PLOT.top + PLOT.bottom) / 2, transform: `rotate(-90 10 ${(PLOT.top + PLOT.bottom) / 2})`, 'text-anchor': 'middle' }, 'energy (log)'));
		root.append(svg('path', { class: 'chart-line', d: linePath(curve.omega, curve.physical, x, y, PLOT) }));
		const px = x(curve.peakOmega);
		root.append(svg('line', { class: 'chart-peak', x1: px, x2: px, y1: PLOT.top, y2: PLOT.bottom }));
		root.append(svg('text', { class: 'chart-text chart-peak-label', x: Math.min(px + 4, PLOT.right - 90), y: PLOT.top + 22 }, `peak: ${curve.peakWavelength.toFixed(0)} m waves`));
	}
	return { draw };
}

function phaseChart(figure, story) {
	const RADIUS = 30;
	let lines = [];
	let frame = 0;
	function build(arrows) {
		const root = canvasFor(figure, 170);
		root.setAttribute('aria-label', 'Eight waves drawn as arrows turning at their own speeds');
		lines = arrows.map((arrow, i) => {
			const cx = 40 + (i % 4) * 80;
			const cy = 40 + Math.floor(i / 4) * 85;
			root.append(svg('circle', { class: 'chart-ring', cx, cy, r: RADIUS }));
			const line = svg('line', { class: 'chart-arrow', x1: cx, y1: cy, x2: cx, y2: cy });
			root.append(line);
			root.append(svg('text', { class: 'chart-text', x: cx, y: cy + RADIUS + 12, 'text-anchor': 'middle' }, `${arrow.wavelength.toFixed(0)} m`));
			return { line, cx, cy };
		});
	}
	function turn() {
		const arrows = story.charts.phaseArrows();
		if (lines.length !== arrows.length) build(arrows);
		const tallest = Math.max(...arrows.map((a) => a.amplitude));
		arrows.forEach((arrow, i) => {
			const end = arrowEnd(arrow.re, arrow.im, tallest, RADIUS - 3);
			lines[i].line.setAttribute('x2', (lines[i].cx + end.x).toFixed(2));
			lines[i].line.setAttribute('y2', (lines[i].cy + end.y).toFixed(2));
		});
	}
	function loop() {
		turn();
		frame = requestAnimationFrame(loop);
	}
	const visible = whileVisible(figure, () => {
		frame = requestAnimationFrame(loop);
	}, () => cancelAnimationFrame(frame));
	return {
		draw() {
			lines = [];
			if (visible()) turn();
		},
	};
}

function transformChart(figure, story) {
	let stale = true;
	let timer = 0;
	const gridSize = () => story.sliders(9).find((s) => s.id === 'transformN').value;
	const ms = (value) => (value < 1 ? `${value.toFixed(3)} ms` : `${value.toFixed(1)} ms`);
	function measure() {
		stale = false;
		figure.dataset.state = 'measuring';
		clearTimeout(timer);
		// Let the "measuring" state paint before the naive sum blocks the thread.
		timer = setTimeout(() => {
			const n = gridSize();
			const result = story.charts.transforms(n);
			const root = canvasFor(figure, 120);
			root.setAttribute('aria-label', `Wave by wave ${ms(result.naiveMs)}, FFT ${ms(result.fftMs)}`);
			const x = linearScale([0, result.naiveMs], [0, 200]);
			const rows = [['Wave by wave', result.naiveMs, 'chart-bar-naive'], ['FFT', result.fftMs, 'chart-bar-fft']];
			rows.forEach(([label, value, cls], i) => {
				const y = 14 + i * 34;
				root.append(svg('text', { class: 'chart-text', x: 0, y: y + 12 }, label));
				root.append(svg('rect', { class: cls, x: 90, y, width: Math.max(1, x(value)).toFixed(2), height: 18 }));
				root.append(svg('text', { class: 'chart-text', x: 94 + Math.max(1, x(value)), y: y + 13 }, ms(value)));
			});
			root.append(svg('text', { class: 'chart-text', x: 0, y: 96 }, `${n} × ${n} grid: the FFT was ${result.speedup.toFixed(0)}× faster, same answer to within ${result.maxDifference.toExponential(0)}.`));
			root.append(svg('text', { class: 'chart-text', x: 0, y: 114 }, 'Measured in your browser just now.'));
			figure.dataset.state = 'done';
		}, 30);
	}
	figure.dataset.state = 'waiting';
	const visible = whileVisible(figure, () => {
		if (stale) measure();
	});
	return {
		draw() {
			stale = true;
			if (visible()) measure();
		},
	};
}

export function mountCharts(story) {
	const figures = Object.fromEntries([...document.querySelectorAll('figure.chart[data-chart]')].map((f) => [f.dataset.chart, f]));
	const charts = {
		spectrum: figures.spectrum ? spectrumChart(figures.spectrum, story) : null,
		phase: figures.phase ? phaseChart(figures.phase, story) : null,
		transforms: figures.transforms ? transformChart(figures.transforms, story) : null,
	};
	const BY_STEP = { 7: 'spectrum', 8: 'phase', 9: 'transforms' };
	let queued = new Set();
	document.addEventListener('ocean:slider', (event) => {
		const name = BY_STEP[event.detail.step];
		if (!name || !charts[name]) return;
		if (queued.size === 0) {
			requestAnimationFrame(() => {
				const names = queued;
				queued = new Set();
				for (const n of names) charts[n].draw();
			});
		}
		queued.add(name);
	});
	charts.spectrum?.draw();
	return Object.freeze({
		redraw() {
			for (const chart of Object.values(charts)) chart?.draw();
		},
	});
}
```

Add to `content/ocean/style.css`, after the `.chart-body svg` rule:

```css
.chart-line {
	fill: none;
	stroke: var(--chart-a);
	stroke-width: 2;
}

.chart-band {
	fill: var(--chart-a);
	opacity: 0.12;
}

.chart-grid,
.chart-ring {
	fill: none;
	stroke: var(--chart-grid);
	stroke-width: 1;
}

.chart-peak {
	stroke: var(--chart-b);
	stroke-width: 1.5;
	stroke-dasharray: 4 3;
}

.chart-arrow {
	stroke: var(--chart-a);
	stroke-width: 2.5;
	stroke-linecap: round;
}

.chart-text {
	fill: var(--chart-ink);
	font: 10px system-ui, sans-serif;
}

.chart-bar-naive {
	fill: var(--chart-b);
}

.chart-bar-fft {
	fill: var(--chart-a);
}
```

- [ ] **Step 9: Add the charts to `content/ocean/js/ui/page.js`**

Directly above `// Feature imports end.` add:

```js
import { mountCharts } from './charts.js';
```

Directly above `// Features end.` add:

```js
	// Task 8: the charts for steps 7 to 9, once the ocean runs in story mode.
	features.push({
		attachOcean(handle) {
			if (handle.story) {
				mountCharts(handle.story);
			}
		},
	});
```

- [ ] **Step 10: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/charts.spec.js`
Expected: PASS, 5 tests.

Screenshot the three charts in both colour schemes (short uncommitted Playwright script at 1366 x 767) and look: labels readable and inside the chart, the bands shaded, the arrows visible, the bars in proportion. Report what you saw.

Run: `cd /Users/cole/Projects/Wesbite-ocean && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean && npm run test:ocean:e2e`
Expected: everything passes (the copy check skips the charts: they are `data-copy-skip="live"`).

- [ ] **Step 11: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean && git add content/ocean/js/page/chartGeometry.js content/ocean/js/ui/charts.js content/ocean/js/ui/storyStage.js content/ocean/js/ui/page.js content/ocean/style.css tests/ocean/page/chartGeometry.test.js tests/ocean/e2e/charts.spec.js
```

```bash
cd /Users/cole/Projects/Wesbite-ocean && git commit -m "feat: the spectrum, phase-arrow and FFT timing charts"
```

---

### Task 9: The finale: live numbers, footage, proof panel, Play, render toggle, motion button

The finale's working parts: live numbers measured in the visitor's browser (with the phone-rule sentence when it applies and a plain sentence when there is no ocean), the footage section that appears only when `media/footage.json` lists a valid clip, the Luau proof panel mounted when the visitor nears it, the Play button shown only for a real place URL, the Roblox/Unleashed toggle shown only if the renderer can switch, and the Play/Pause button (the ocean starts paused under reduced motion).

**Files:**
- Create: `content/ocean/js/page/liveSummary.js`, `content/ocean/js/page/renderMode.js`, `content/ocean/js/ui/finale.js`, `content/ocean/media/footage.json`
- Modify: `content/ocean/js/ui/page.js` (the finale feature), `content/ocean/js/main.js` (the handle gains `status` and `report`)
- Test: `tests/ocean/page/liveSummary.test.js`, `tests/ocean/page/renderMode.test.js`, `tests/ocean/e2e/finale.spec.js`

**Interfaces:**
- Consumes: D `engine/showcase.js` (`placeUrl() -> string | null`, `footageClips(manifest) -> [{ shot, webm, mp4, poster, width, height, seconds }]`, `FOOTAGE_MANIFEST` = `'media/footage.json'`); B `ui/proofLazy.js` `mountProofPanelWhenNear(root, { panelDeps: { embedded: true } }) -> { mountNow(), destroy() }` (embedded drops the panel's own h2, lede and glass box; the finale supplies them) (and `proof.css`, linked in Task 2); A2/A3 `Ocean.status(ocean)` (`frame`, `tier`, `tierReason`, `vertices`, `mode`, `fallbackReason`, `layers`) and `Ocean.report(ocean)` (`writeMs`, `paintMs`, `strengthMs`, `renderMs`, `cascadeMs`, or null before the first 300-frame window); Task 1 `clock` (`playing()`, `play()`, `pause()`) and `startPage`'s insertion lines; Task 2's finale DOM; Task 4 `story.relayout()`; Task 4 test helpers.
- Produces:
  - `page/liveSummary.js`: `summarizeLive({ status, report, fps }) -> { rows: [{ label, value }], phoneRule: boolean }`.
  - `page/renderMode.js`: `RENDER_MODES` (`['roblox', 'unleashed']`), `renderModeControl(handle) -> null | { modes, mode(), choose(mode) }` (the A4 contract: available only when `handle.setRenderMode` is a function).
  - `ui/finale.js`: `CLIP_CAPTIONS`, `mountPlayButton(anchor, url = placeUrl()) -> boolean`, `mountFootage(section, { fetchManifest, onShown } = {}) -> Promise<number>`, `mountLiveNumbers(section, handle) -> { paint() }`, `mountRenderToggle(root, handle) -> control | null`, `mountMotionButton(button, clock)`.
  - `main.js` handle gains `status() -> Ocean.status(ocean)` and `report() -> Ocean.report(ocean)`.
  - `window.__proof` on the ocean page: the proof panel's lazy handle.

- [ ] **Step 1: Write the failing unit tests**

`tests/ocean/page/liveSummary.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { summarizeLive } from '../../../content/ocean/js/page/liveSummary.js';

const STATUS = { frame: 900, tier: 'High', tierReason: 'probe', vertices: 18144, mode: 'workers', fallbackReason: null, layers: [true, true, true] };
const REPORT = { writeMs: 2.345, paintMs: 0.5, strengthMs: 0.07, renderMs: 4.2, cascadeMs: 6.1 };
const value = (summary, label) => summary.rows.find((row) => row.label === label)?.value;

test('the rows say what was measured, with units', () => {
	const summary = summarizeLive({ status: STATUS, report: REPORT, fps: 58 });
	expect.equal(value(summary, 'Frame rate'), '58 fps', 'fps');
	expect.equal(value(summary, 'Surface points'), '18,144', 'points');
	expect.equal(value(summary, 'Quality tier'), 'High', 'tier');
	expect.equal(value(summary, 'Wave layers'), '3', 'layers');
	expect.equal(value(summary, 'Waves computed on'), 'worker threads', 'workers');
	expect.equal(value(summary, 'Writing the points'), '2.35 ms', 'write');
	expect.equal(value(summary, 'Drawing the frame'), '4.20 ms', 'render');
	expect.equal(summary.phoneRule, false, 'not a phone');
});

test('the phone rule and a main-thread fallback are said plainly', () => {
	const summary = summarizeLive({ status: { ...STATUS, tier: 'Medium', tierReason: 'phone rule', vertices: 6480, mode: 'main-thread', fallbackReason: 'worker failed to start', layers: [true, true] }, report: null, fps: 31 });
	expect.equal(summary.phoneRule, true, 'phone');
	expect.truthy(value(summary, 'Quality tier').includes('phone rule'), value(summary, 'Quality tier'));
	expect.truthy(value(summary, 'Quality tier').includes('unmeasured'), value(summary, 'Quality tier'));
	expect.equal(value(summary, 'Waves computed on'), 'the main thread (worker failed to start)', 'fallback');
	expect.equal(value(summary, 'Per-stage timings'), 'still collecting', 'no report yet');
});
```

`tests/ocean/page/renderMode.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { renderModeControl, RENDER_MODES } from '../../../content/ocean/js/page/renderMode.js';

test('no setRenderMode on the handle, no toggle', () => {
	expect.equal(renderModeControl({}), null, 'plain handle');
	expect.equal(renderModeControl(null), null, 'no handle');
	expect.equal(renderModeControl({ setRenderMode: 'yes' }), null, 'not a function');
});

test('with setRenderMode the toggle calls it and remembers the mode', () => {
	const calls = [];
	const control = renderModeControl({ setRenderMode: (mode) => calls.push(mode) });
	expect.equal(control.modes.join(','), RENDER_MODES.join(','), 'modes');
	expect.equal(control.mode(), 'roblox', 'starts in Roblox mode');
	control.choose('unleashed');
	expect.equal(calls.join(','), 'unleashed', 'called');
	expect.equal(control.mode(), 'unleashed', 'remembered');
});

test('a mode it does not know, or a renderer that throws, leaves the mode as it was', () => {
	const control = renderModeControl({ setRenderMode: (mode) => { if (mode === 'unleashed') throw new Error('no float textures'); } });
	let message = '';
	try {
		control.choose('turbo');
	} catch (error) {
		message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
	}
	expect.truthy(message.includes('turbo'), message);
	try {
		control.choose('unleashed');
	} catch {
		// the renderer's own error reaches the caller
	}
	expect.equal(control.mode(), 'roblox', 'unchanged');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/liveSummary.test.js tests/ocean/page/renderMode.test.js`
Expected: FAIL: `Cannot find module .../page/liveSummary.js` and `.../page/renderMode.js`.

- [ ] **Step 3: Write the two pure modules**

`content/ocean/js/page/liveSummary.js`:

```js
// The finale's live numbers (piece C; spec 1: web numbers "measured live in the visitor's browser
// and labelled as such"; spec 7: the performance readout doubles as the page's live numbers).
// Browser-free: turns the ocean's status and report (the Roblox report line's fields) and a frame
// rate into labelled rows, and says when the tier came from the phone rule, which is unmeasured.
const ms = (value) => (value == null || !Number.isFinite(value) ? '-' : `${value.toFixed(2)} ms`);

export function summarizeLive({ status, report, fps }) {
	const phoneRule = status.tierReason === 'phone rule';
	const rows = [
		{ label: 'Frame rate', value: `${fps} fps` },
		{ label: 'Quality tier', value: phoneRule ? `${status.tier} (picked by the phone rule, unmeasured)` : status.tier },
		{ label: 'Surface points', value: status.vertices.toLocaleString('en-US') },
		{ label: 'Wave layers', value: status.layers ? String(status.layers.filter(Boolean).length) : '-' },
		{ label: 'Waves computed on', value: status.mode === 'workers' ? 'worker threads' : `the main thread (${status.fallbackReason})` },
	];
	if (report) {
		rows.push(
			{ label: 'Writing the points', value: ms(report.writeMs) },
			{ label: 'Painting the maps', value: ms(report.paintMs) },
			{ label: 'Setting the glow', value: ms(report.strengthMs) },
			{ label: 'Drawing the frame', value: ms(report.renderMs) },
			{ label: "One layer's FFT, on its worker", value: ms(report.cascadeMs) },
		);
	} else {
		rows.push({ label: 'Per-stage timings', value: 'still collecting' });
	}
	return { rows, phoneRule };
}
```

`content/ocean/js/page/renderMode.js`:

```js
// The finale's Roblox / Unleashed toggle (piece C, for piece A4). Browser-free. The toggle exists
// only when the ocean's handle has a setRenderMode function (A4 adds it); until then the page
// hides it. A mode the renderer does not know is refused; if the renderer throws, the toggle
// keeps showing the mode it was in.
export const RENDER_MODES = Object.freeze(['roblox', 'unleashed']);

export function renderModeControl(handle) {
	if (typeof handle?.setRenderMode !== 'function') {
		return null;
	}
	let mode = 'roblox';
	return Object.freeze({
		modes: RENDER_MODES,
		mode: () => mode,
		choose(next) {
			if (!RENDER_MODES.includes(next)) {
				throw new RangeError(`render mode must be one of ${RENDER_MODES.join(', ')}, got ${next}`);
			}
			handle.setRenderMode(next);
			mode = next;
			return mode;
		},
	});
}
```

- [ ] **Step 4: Run the unit tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/liveSummary.test.js tests/ocean/page/renderMode.test.js`
Expected: PASS, 2 and 3 tests.

- [ ] **Step 5: Write the failing browser tests**

`tests/ocean/e2e/finale.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { oceanRunning, waitFrames, watchErrors } from './helpers/story.js';

const CLIP = { shot: 'deck', webm: 'deck.webm', mp4: 'deck.mp4', poster: 'deck.jpg', width: 1280, height: 720, seconds: 20 };

// The surface's vertex statistics (A3's probe): identical from frame to frame only if the waves
// have not moved. (The canvas is not used here: foam keeps settling for a while even with the
// clock held, since each fold test adds to it.)
const surface = (page) => page.evaluate(() => JSON.stringify(window.__ocean.story.surface()));

test.describe.configure({ timeout: 240_000 });

test('the live numbers are labelled as measured in your browser, and fill in', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await page.locator('#live').scrollIntoViewIfNeeded();
	await expect(page.locator('#live .dim')).toHaveText('Measured in your browser, right now.');
	await expect(page.locator('#live [data-live]')).toContainText('Frame rate', { timeout: 30_000 });
	await expect(page.locator('#live [data-live]')).toContainText('fps');
	await expect(page.locator('#live [data-live]')).toContainText('18,144');
	await expect(page.locator('#live [data-live-phone]')).toBeHidden();
	await expect(page.locator('#motion')).toHaveText('Pause the ocean');
	expect(errors).toEqual([]);
});

test('footage stays hidden while the manifest lists no clips, and the manifest does not 404', async ({ page }) => {
	const statuses = [];
	page.on('response', (response) => {
		if (response.url().endsWith('/ocean/media/footage.json')) statuses.push(response.status());
	});
	await page.goto('/ocean/');
	await expect.poll(() => statuses.length).toBeGreaterThan(0);
	expect(statuses[0]).toBe(200);
	await expect(page.locator('#footage')).toBeHidden();
});

test('footage appears when the manifest lists a clip, lazily and with its caption', async ({ page }) => {
	await page.route('**/ocean/media/footage.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ clips: [CLIP] }) }));
	await page.goto('/ocean/');
	await expect(page.locator('#footage')).toBeVisible();
	const video = page.locator('#footage video');
	await expect(video).toHaveCount(1);
	await expect(video).toHaveAttribute('preload', 'none');
	await expect(video).toHaveAttribute('poster', 'media/deck.jpg');
	await expect(page.locator('#footage video source')).toHaveCount(2);
	await expect(page.locator('#footage figcaption')).toHaveText('Deck height, where a player would stand.');
});

test('a manifest that is not JSON keeps the footage hidden and throws nothing', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/ocean/media/footage.json', (route) => route.fulfill({ contentType: 'application/json', body: 'not json' }));
	await page.goto('/ocean/');
	await page.waitForTimeout(1000);
	await expect(page.locator('#footage')).toBeHidden();
	expect(errors).toEqual([]);
});

test('Play in Roblox stays hidden while no public place URL is set', async ({ page }) => {
	await page.goto('/ocean/');
	await expect(page.locator('#play')).toBeHidden();
	expect(await page.locator('#play').getAttribute('href')).toBeNull();
});

test('the Luau proof panel mounts as the visitor nears it, and its runtime waits for Run', async ({ page }) => {
	let runtime = 0;
	page.on('request', (request) => {
		if (request.url().includes('luau-web@')) runtime++;
	});
	await page.goto('/ocean/');
	await page.locator('#proof-block').scrollIntoViewIfNeeded();
	await expect(page.locator('#proof .proof')).toBeVisible({ timeout: 30_000 });
	expect(runtime).toBe(0);
});

test('the render toggle stays hidden, and appears and switches for a renderer that can', async ({ page }) => {
	await oceanRunning(page);
	await expect(page.locator('[data-render-mode]')).toBeHidden();
	await page.evaluate(async () => {
		const { mountRenderToggle } = await import('/ocean/js/ui/finale.js');
		window.__modes = [];
		mountRenderToggle(document.querySelector('[data-render-mode]'), { setRenderMode: (mode) => window.__modes.push(mode) });
	});
	await expect(page.locator('[data-render-mode]')).toBeVisible();
	await page.locator('[data-render-mode] button[data-mode="unleashed"]').click();
	expect(await page.evaluate(() => window.__modes)).toEqual(['unleashed']);
	await expect(page.locator('[data-render-mode] button[data-mode="unleashed"]')).toHaveAttribute('aria-checked', 'true');
});

test('without WebGL the finale says there is nothing to measure; the proof and credits still show', async ({ page }) => {
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
			return kind === 'webgl' || kind === 'webgl2' ? null : original.call(this, kind, ...rest);
		};
	});
	await page.goto('/ocean/');
	await expect(page.locator('#live [data-live-none]')).toBeVisible();
	await expect(page.locator('#live [data-live]')).toBeHidden();
	await expect(page.locator('#motion')).toBeHidden();
	await page.locator('#proof-block').scrollIntoViewIfNeeded();
	await expect(page.locator('#proof .proof, #proof .proof-placeholder').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('#credits')).toBeVisible();
});

test.describe('on a phone, on the lighter tier by rule', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the finale says the tier was picked by rule and is unmeasured (Review Focus 5)', async ({ page }) => {
		await oceanRunning(page);
		await page.locator('#live').scrollIntoViewIfNeeded();
		await expect(page.locator('#live [data-live-phone]')).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('#live [data-live-phone]')).toContainText('by rule');
		await expect(page.locator('#live [data-live-phone]')).toContainText("haven't measured");
		await expect(page.locator('#live [data-live]')).toContainText('phone rule, unmeasured');
	});
});

test.describe('under reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('the ocean holds still until the visitor presses Play', async ({ page }) => {
		await oceanRunning(page, '/ocean/', 30);
		await page.waitForFunction(() => {
			const s = window.__ocean.status();
			return s.painterReady && s.workersReady > 0 && s.frame > 60;
		}, null, { timeout: 120_000 });
		await expect(page.locator('#motion')).toHaveText('Play the ocean');
		const held = await surface(page);
		await waitFrames(page, 10);
		expect(await surface(page)).toBe(held);
		await page.locator('#motion').click();
		await expect(page.locator('#motion')).toHaveText('Pause the ocean');
		await waitFrames(page, 10);
		expect(await surface(page)).not.toBe(held);
	});
});
```

- [ ] **Step 6: Run them and watch them fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/finale.spec.js`
Expected: FAIL: `[data-live]` stays empty, the manifest 404s.

- [ ] **Step 7: Commit the empty footage manifest**

Create `content/ocean/media/footage.json`:

```json
{
	"clips": []
}
```

(`scripts/ocean-footage.mjs` reads this through `withClip` and adds clips to it; an empty list keeps the section hidden.)

- [ ] **Step 8: Give the handle `status` and `report` in `content/ocean/js/main.js`**

Replace the return statement with:

```js
	return Object.freeze({
		...parts,
		canvas,
		reducedMotion,
		stage: dev ? dev.hooks : null,
		story,
		status: () => Ocean.status(ocean),
		report: () => Ocean.report(ocean),
	});
```

- [ ] **Step 9: Write `content/ocean/js/ui/finale.js`**

```js
// The finale's working parts (piece C; spec 3, step 13, and the 2026-09-30 decisions): the live
// numbers, measured in this browser twice a second while they are on screen; the footage, shown
// only when media/footage.json lists a valid clip (engine/showcase.js decides what is valid),
// videos loading nothing until played; the Play button, shown only for a real place URL
// (placeUrl); the Roblox / Unleashed toggle, shown only if the renderer can switch
// (page/renderMode.js); and the Play / Pause button over the ocean's clock (paused from the start
// under reduced motion). The Luau proof panel is B's, mounted by page.js.
import { FOOTAGE_MANIFEST, footageClips, placeUrl } from '../engine/showcase.js';
import { summarizeLive } from '../page/liveSummary.js';
import { renderModeControl } from '../page/renderMode.js';

export const CLIP_CAPTIONS = Object.freeze({
	deck: 'Deck height, where a player would stand.',
	flyup: 'Rising until the far sea comes into view.',
	crest: 'Down low, on the foam and the glow.',
	studio: 'The Studio window around it, profiler open.',
});
const PAINT_EVERY_MS = 500;

export function mountPlayButton(anchor, url = placeUrl()) {
	if (!url) {
		anchor.hidden = true;
		anchor.removeAttribute('href');
		return false;
	}
	anchor.href = url;
	anchor.hidden = false;
	return true;
}

async function fetchManifest() {
	const response = await fetch(FOOTAGE_MANIFEST, { cache: 'no-cache' });
	if (!response.ok) {
		throw new Error(`${FOOTAGE_MANIFEST}: HTTP ${response.status}`);
	}
	return response.json();
}

function clipFigure(clip) {
	const figure = document.createElement('figure');
	figure.className = 'clip';
	figure.dataset.shot = clip.shot;
	const video = document.createElement('video');
	video.controls = true;
	video.muted = true;
	video.playsInline = true;
	video.preload = 'none';
	video.poster = `media/${clip.poster}`;
	video.width = clip.width;
	video.height = clip.height;
	for (const [file, type] of [[clip.webm, 'video/webm'], [clip.mp4, 'video/mp4']]) {
		const source = document.createElement('source');
		source.src = `media/${file}`;
		source.type = type;
		video.append(source);
	}
	const caption = document.createElement('figcaption');
	caption.textContent = CLIP_CAPTIONS[clip.shot];
	figure.append(video, caption);
	return figure;
}

export async function mountFootage(section, { fetchManifest: read = fetchManifest, onShown = () => {} } = {}) {
	let clips = [];
	try {
		clips = footageClips(await read());
	} catch (error) {
		console.warn('[ocean] the footage manifest could not be read; the footage stays hidden', error);
	}
	if (clips.length === 0) {
		section.hidden = true;
		return 0;
	}
	section.querySelector('[data-clips]').replaceChildren(...clips.map(clipFigure));
	section.hidden = false;
	onShown();
	return clips.length;
}

export function mountLiveNumbers(section, handle) {
	const list = section.querySelector('[data-live]');
	const phone = section.querySelector('[data-live-phone]');
	let last = { frame: handle.status().frame, time: performance.now() };
	let visible = false;

	function paint() {
		const status = handle.status();
		const time = performance.now();
		const fps = Math.round(((status.frame - last.frame) * 1000) / Math.max(1, time - last.time));
		last = { frame: status.frame, time };
		const { rows, phoneRule } = summarizeLive({ status, report: handle.report(), fps });
		list.replaceChildren(...rows.flatMap(({ label, value }) => {
			const dt = document.createElement('dt');
			dt.textContent = label;
			const dd = document.createElement('dd');
			dd.textContent = value;
			return [dt, dd];
		}));
		phone.hidden = !phoneRule;
	}

	new IntersectionObserver((entries) => {
		visible = entries.some((entry) => entry.isIntersecting);
	}, { rootMargin: '200px 0px' }).observe(section);
	setInterval(() => {
		if (visible) paint();
	}, PAINT_EVERY_MS);
	return Object.freeze({ paint });
}

export function mountRenderToggle(root, handle) {
	const control = renderModeControl(handle);
	if (!control) {
		root.hidden = true;
		return null;
	}
	const buttons = [...root.querySelectorAll('button[data-mode]')];
	const show = () => {
		for (const button of buttons) button.setAttribute('aria-checked', String(button.dataset.mode === control.mode()));
	};
	for (const button of buttons) {
		button.addEventListener('click', () => {
			try {
				control.choose(button.dataset.mode);
			} catch (error) {
				console.error('[ocean] the render mode could not change', error);
			}
			show();
		});
	}
	show();
	root.hidden = false;
	return control;
}

export function mountMotionButton(button, clock) {
	const show = () => {
		button.textContent = clock.playing() ? 'Pause the ocean' : 'Play the ocean';
	};
	button.addEventListener('click', () => {
		if (clock.playing()) clock.pause();
		else clock.play();
		show();
	});
	show();
	button.hidden = false;
}
```

- [ ] **Step 10: Add the finale to `content/ocean/js/ui/page.js`**

Directly above `// Feature imports end.` add:

```js
import { mountFootage, mountLiveNumbers, mountMotionButton, mountPlayButton, mountRenderToggle } from './finale.js';
import { mountProofPanelWhenNear } from './proofLazy.js';
```

Directly above `// Features end.` add:

```js
	// Task 9: the finale. Play, footage and the proof panel need no ocean; the live numbers, the
	// render toggle and the motion button do.
	mountPlayButton(document.getElementById('play'));
	mountFootage(document.getElementById('footage'), { onShown: () => story.relayout() });
	window.__proof = mountProofPanelWhenNear(document.getElementById('proof'), { panelDeps: { embedded: true } });
	features.push({
		attachOcean(handle) {
			mountLiveNumbers(document.getElementById('live'), handle);
			mountRenderToggle(document.querySelector('[data-render-mode]'), handle);
			mountMotionButton(document.getElementById('motion'), clock);
		},
		oceanUnavailable() {
			const live = document.getElementById('live');
			live.querySelector('[data-live]').hidden = true;
			live.querySelector('[data-live-none]').hidden = false;
		},
	});
```

- [ ] **Step 11: Run the tests and watch them pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/finale.spec.js && node --test tests/ocean/page/bootGraph.test.js`
Expected: PASS: 10 browser tests; the boot graph clean (`showcase.js` and `proofLazy.js` import nothing from a CDN).

Run: `cd /Users/cole/Projects/Wesbite-ocean && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean && npm run test:ocean:e2e`
Expected: everything passes, including B's proof tests on `proof.html` and the copy check (the finale's static copy is sourced; the live list and proof panel are `data-copy-skip="live"`).

- [ ] **Step 12: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean && git add content/ocean/js/page/liveSummary.js content/ocean/js/page/renderMode.js content/ocean/js/ui/finale.js content/ocean/js/ui/page.js content/ocean/js/main.js content/ocean/media/footage.json tests/ocean/page/liveSummary.test.js tests/ocean/page/renderMode.test.js tests/ocean/e2e/finale.spec.js
```

```bash
cd /Users/cole/Projects/Wesbite-ocean && git commit -m "feat: the finale's live numbers, footage, proof, Play and render toggle"
```

---

### Task 10: Deploy-ready branch, a walk through the whole page, and the status line

The branch becomes deploy-ready without deploying: Azure Static Web Apps gets a MIME type for `.luau` (the proof panel fetches `luau/ocean-bundle.luau`), checked by a unit test against every file type under `content/`. A browser walk scrolls the whole page on desktop and on a phone with no console errors and no sideways scroll, and checks the dev route still works beside the story. The spec gets C's status line.

**Files:**
- Create: `content/staticwebapp.config.json`, `tests/ocean/page/deployConfig.test.js`, `tests/ocean/e2e/walk.spec.js`
- Modify: `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md` (C's status line)

**Interfaces:**
- Consumes: everything above; `scripts/deploy.sh` (which copies `content/` and merges an `X-Git-Commit` header into `staticwebapp.config.json` with `jq`, keeping every other key); Task 4 test helpers; A3's `?step` dev route (`window.__ocean.stage`).
- Produces: `content/staticwebapp.config.json` with `mimeTypes[".luau"] = "text/plain; charset=utf-8"`; the whole-page walk; the spec's C line.

- [ ] **Step 1: Write the failing deploy-config test**

`tests/ocean/page/deployConfig.test.js`:

```js
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';

const CONTENT = fileURLToPath(new URL('../../../content/', import.meta.url));
// Types Azure Static Web Apps serves correctly without a mimeTypes entry.
const SERVED_BY_DEFAULT = ['.html', '.css', '.js', '.mjs', '.json', '.jpg', '.jpeg', '.png', '.svg', '.webm', '.mp4', '.ico', '.txt', '.wasm', '.woff2'];

function extensions(dir) {
	const found = new Set();
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) extensions(path).forEach((ext) => found.add(ext));
		else if (extname(entry.name)) found.add(extname(entry.name).toLowerCase());
	}
	return found;
}

test('the Static Web Apps config gives .luau a text type and changes nothing else', () => {
	const config = JSON.parse(readFileSync(join(CONTENT, 'staticwebapp.config.json'), 'utf8'));
	expect.equal(Object.keys(config).join(','), 'mimeTypes', 'only mimeTypes (deploy.sh adds globalHeaders at deploy time)');
	expect.equal(config.mimeTypes['.luau'], 'text/plain; charset=utf-8', '.luau');
});

test('every file type under content/ is served with a known type', () => {
	const config = JSON.parse(readFileSync(join(CONTENT, 'staticwebapp.config.json'), 'utf8'));
	const known = new Set([...SERVED_BY_DEFAULT, ...Object.keys(config.mimeTypes)]);
	for (const ext of extensions(CONTENT)) {
		expect.truthy(known.has(ext), `${ext} has no MIME type: add it to content/staticwebapp.config.json`);
	}
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/deployConfig.test.js`
Expected: FAIL: `ENOENT ... content/staticwebapp.config.json`.

- [ ] **Step 3: Write `content/staticwebapp.config.json`**

```json
{
	"mimeTypes": {
		".luau": "text/plain; charset=utf-8"
	}
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd /Users/cole/Projects/Wesbite-ocean && node --test tests/ocean/page/deployConfig.test.js`
Expected: PASS, 2 tests. If the second fails for an extension that is not `.luau`, add that extension's proper type to the config and say so in the report.

- [ ] **Step 5: Write the walk**

`tests/ocean/e2e/walk.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { oceanRunning, scrollToOpening, scrollToStep, waitFrames, watchErrors } from './helpers/story.js';

test.describe.configure({ timeout: 420_000 });

async function walk(page, width) {
	const errors = watchErrors(page);
	await oceanRunning(page);
	for (let step = 1; step <= 13; step++) {
		await scrollToStep(page, step, 0.35);
		// The position eases toward the scroll (0.25 s time constant); wait for it rather than a
		// fixed number of frames, since the frame rate differs between viewports.
		await page.waitForFunction((s) => window.__ocean.story.state().step === s, step, { timeout: 60_000 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
	}
	await page.locator('#credits').scrollIntoViewIfNeeded();
	await expect(page.locator('#credits')).toBeVisible();
	await page.locator('footer.site').scrollIntoViewIfNeeded();
	await scrollToOpening(page);
	await waitFrames(page, 4);
	expect((await page.evaluate(() => window.__ocean.story.state())).step).toBe(13);
	expect(await page.evaluate(() => window.__ocean.frameFailures())).toBe(0);
	expect(errors).toEqual([]);
}

test('the whole page, top to bottom and back, on a desktop', async ({ page }) => {
	await walk(page, 1366);
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the whole page, top to bottom and back, on a phone', async ({ page }) => {
		await walk(page, 390);
	});
});

test('the dev route still drives the ocean from the URL, with no story attached', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/ocean/?step=7&progress=0.2');
	await page.waitForFunction(() => (window.__ocean?.status().frame ?? 0) > 10, null, { timeout: 120_000 });
	expect(await page.evaluate(() => window.__ocean.story)).toBeNull();
	expect(await page.evaluate(() => window.__ocean.stage.recipe().step)).toBe(7);
	await expect(page.locator('.control')).toHaveCount(0);
	expect(errors).toEqual([]);
});
```

- [ ] **Step 6: Run the walk**

Run: `cd /Users/cole/Projects/Wesbite-ocean && npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/walk.spec.js`
Expected: PASS, 3 tests.

- [ ] **Step 7: Run everything**

Run: `cd /Users/cole/Projects/Wesbite-ocean && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean && npm run test:ocean:e2e`
Expected: every unit and browser test passes. Note the counts for the status line.

- [ ] **Step 8: Look at the finished page**

Serve `content/` and, with a short uncommitted Playwright script, screenshot at 1366 x 767 and at 390 x 844 (isMobile): the opening; each of the thirteen steps at progress 0.35 with its maths opened; the live numbers; the proof panel after pressing Run and waiting for `data-proof-state="done"`; the recap, the "things we believed" list and the credits. Do it once in each colour scheme. Look at every screenshot and report, step by step, anything unreadable, overlapping, cut off or wrong against the copy (for example a card whose number does not match what the ocean shows). Stop the server. Do not commit screenshots.

- [ ] **Step 9: Write C's status line into the spec**

In `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md`, after the A3 status line (or after the A2 line if there is no A3 line), add one line, filling in today's date, the short hash of Task 9's commit and the two test counts from Step 7:

```markdown
**C (the page):** built on <date> at commit <hash>: the scrolling page "Building an Ocean in Roblox" at `content/ocean/index.html`, booted without the CDN (`js/boot.js`, dynamic import of the ocean), thirteen glass panels driving A3's director through GSAP ScrollTrigger (native fallback), sliders per panel, KaTeX maths on first open, cards, charts for steps 7 to 9, shots with free orbit between, and the finale (live numbers measured in the browser, the Luau proof panel, the footage section hidden until `media/footage.json` lists clips, the Play button hidden until `ROBLOX_PLACE_URL` is set, the Roblox/Unleashed toggle hidden until A4 provides `setRenderMode`); every number in the copy checked against a source (`tests/ocean/page/copySources.js`); <unit count> unit and <browser count> browser tests. Not deployed. Not yet measured: the page on a real GPU and on a phone (phones get Medium by rule, and the page says so).
```

- [ ] **Step 10: Commit**

```bash
cd /Users/cole/Projects/Wesbite-ocean && git add content/staticwebapp.config.json tests/ocean/page/deployConfig.test.js tests/ocean/e2e/walk.spec.js docs/superpowers/specs/2026-09-27-ocean-showcase-design.md
```

```bash
cd /Users/cole/Projects/Wesbite-ocean && git commit -m "chore: the ocean page is deploy-ready, walked end to end, and recorded in the spec"
```

