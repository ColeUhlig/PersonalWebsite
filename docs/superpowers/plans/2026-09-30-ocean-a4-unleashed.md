# Ocean Showcase A4: Unleashed Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The finale's Roblox / Unleashed toggle: the same blended cascade fields go to the GPU as float textures, a vertex shader displaces the rings' lattice, and colour, glow, foam and normals are computed per pixel at full field resolution with the sky's Fresnel reflections, while the CPU vertex write, the painter and the per-patch glow pass stop, so the page's live numbers show exactly what Roblox costs.

**Architecture:** Three layers, the same split as A2 and A3. `engine/` (browser-free, Node-tested) gains the render-path switch in the ocean (skip the vertex write, the painter and the glow), the field packing, and a JavaScript twin of every shader function, each tested against the core module whose rule it moves to the GPU (`Cascade` sampling, `SurfaceSampler.fill`, `WaterColour`, `FoamPaint`, `PeakMask`, `ScatterLobe`, `FoamField`), plus the support check, the stage gating and per-mode timings. `render/` holds the GLSL as strings (browser-free, patch tested in Node), the float textures, a ping-pong GPU foam pass, the patched `MeshStandardMaterial`s and meshes, and `renderMode.js`, which owns the switch piece C calls. The browser tests prove the path changes, the picture renders and stays close to Roblox mode, the GPU foam matches `FoamField`, switching back restores Roblox mode, toggling leaks nothing, and an unsupported GPU falls back.

**Tech Stack:** As A2 and A3: plain ES modules with no build step, `three@0.186.1` from jsDelivr through the page's import map (`MeshStandardMaterial.onBeforeCompile`, `DataArrayTexture`, `WebGLRenderTarget`, `WebGLRenderer.compileAsync`), GLSL ES 3.00 (WebGL 2), Node 25 `node --test`, `@playwright/test` 1.63.0 with headless Chromium on the GPU (ANGLE Metal; `OCEAN_GL=swiftshader` falls back to the CPU renderer).

**Spec:** `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md`: section 4.4 ("Unleashed. The same field buffers go to the GPU as float textures. Displacement moves into a vertex shader; colour, glow (the scatter term per pixel), foam and normals are computed per pixel at full field resolution; sky reflections with Fresnel. The wave maths does not change."), section 1 (the honesty rules: every web number measured live and labelled; the toggle shows what Roblox costs you), section 3 step 13 (the finale's toggle and live performance numbers), section 8 (targets: 60 fps in Roblox mode on a laptop, no console errors), the A2 status line and the A2 final review's note ("A4 only needs switches to skip the CPU vertex write and the painter, so that its cost comparison is fair"). Build step 6 of section 9. It builds on A3 (`docs/superpowers/plans/2026-09-30-ocean-a3-teaching-stages.md`): `stageControl` (`ocean.live`, `ocean.parts`, `ocean.source`, `painter.mapsConfig` kept live by `PainterClient.update`), `SurfaceState.setRingCascades` / `ringSpecs` / `contexts` / `stale` / `boundsVersion`, `render/stageLook.js` and the `?step` dev route.

**Decisions this plan takes, so no task re-decides them:**

- **Foam runs on the GPU**, in a ping-pong pair of half-float render targets, one texel per the finest cascade's cell over the 256-stud tile: 1,024 x 1,024 on High (0.25 studs, cascade 3's own lattice; `foamTexelsFor`), never coarser than the CPU's 256. The step is `FoamField`'s rule exactly (`foam = clamp(foam * decay + grow * max(0, whitecap - J), 0, 1)` on the Jacobian of the SUM of the shown cascades at the texel's world position, texel (i, j) AT world (i, j) * tile / texels), and every texel steps once per `MapRotation.BANDS` (4) frames, the rate the decay is tuned for (the whole field on every fourth frame, where the CPU steps a quarter each frame). The threshold, feather, lace erosion and opacity are then applied per pixel. Why not upload the CPU foam field: it would keep the painter worker running, which the fair comparison must stop, and it caps foam at 1 stud a texel; "computed per pixel at full field resolution" means at the fields' own finest lattice. `FoamPaint.lace` (512 texels, the painter's constants) is built once on the main thread and uploaded as a mipmapped byte texture.
- **Lighting stays Three.js's `MeshStandardMaterial`**, patched with `onBeforeCompile`, so the sun, the hemisphere light, the PMREM sky reflections with their Fresnel (Schlick through the environment BRDF), the fog, the tone mapping and the CSS grade are the ones Roblox mode is drawn with. What changes per pixel: the base colour (height tint through `WaterColour`'s ramp, then foam), the roughness (`FoamRoughness`'s lift), the normal (every shown cascade's slopes, in world space), and the emissive (`PeakMask` from the pixel's own height, times `ScatterLobe` at the pixel's own position, times `Lighting.EMISSIVE_SCALE`). That keeps "same sea, better shading" measurable: the deck shot's mean colour must stay close to Roblox mode's.
- **Field textures are one `DataArrayTexture`, RGBA32F, read with `texelFetch` and weighted by hand** with `Cascade`'s own floored-modulo wrap and fold-back. Layer 2(c-1) holds cascade c's height, dispX, dispZ, slopeX; layer 2(c-1)+1 its slopeZ, jxx, jzz, jxz. `texelFetch` needs no float filtering, so `OES_texture_float_linear` is not required at all; the texture uses `NearestFilter` and no mipmaps (a float texture with linear filtering and no extension is incomplete and reads zero). It is re-uploaded only on frames whose display fields were blended (`ocean.displayVersion`).
- **Distant pixels drop a cascade by footprint** instead of mipmaps (texelFetch has none): a cascade weighs 1 while a pixel spans at most one of its cells and fades to 0 at two (`footprintWeight`), so the 16-stud cascade does not sparkle on the far water.
- **The vertex shader is `SurfaceSampler.fill` for FFT rings with silent swells**: the same per-ring cascade lists (A3's filtered `ringSpecs`), fades measured from the focus, the skirt inside the finer ring's window and the seam averaging (each seam vertex averages the displacement at its two edge neighbours, carried by a `seamAxis` attribute). Patches wholly under a finer ring are hidden with the CPU's own rule (`patchCovered`). The horizon quads take the same material undisplaced.
- **Unleashed replaces the painted FFT sea only.** It draws when the stage's source is the FFT, the look is `painted` (A3's steps 7 to 13; the whole page without `?step`), the swells are silent (the shipped `swellScale` 0) and no calibration view is on. Otherwise Roblox mode draws and `getRenderMode().reason` says why; the request is kept and Unleashed returns when the story does. Teaching waves, the white plane, the lit and unlit Gerstner looks and the wireframe are untouched.
- **Support check:** vertex texture units (`renderer.capabilities.maxVertexTextures >= 1`), a renderable float format (`EXT_color_buffer_float` or `EXT_color_buffer_half_float`, for the half-float foam targets), `maxTextureSize >= foamTexels` and `MAX_ARRAY_TEXTURE_LAYERS >= 2 x cascades`; then, when first prepared, the foam target's framebuffer must be complete. Any failure: Roblox mode stays, `supported: false` with a reason, one `console.warn`.
- **No stalls, no leaks:** nothing is allocated until Unleashed is first requested (or `prepareUnleashed()` is called); preparation builds everything once (the lace takes about 100 ms, reported as `laceMs`) and compiles with `renderer.compileAsync`, and the path switches only when the shaders are ready. After that a switch allocates nothing and compiles nothing; switching back marks the surface stale so the first Roblox frame writes every ring in that same frame.
- **Timings per mode** are rolling means over the last 120 frames in each mode: main-thread milliseconds from `Ocean.step` through the render preparation (`cpuMs`), the `view.render()` call (`renderMs`, CPU-side submission) and the frame interval (`frameMs`, `fps`); frames longer than 1 s (a hidden tab) are skipped and counted.
- **API for piece C**, from `content/ocean/js/render/renderMode.js`: `setRenderMode('roblox' | 'unleashed') -> RenderModeState` (takes effect from the next frame; throws a `RangeError` for anything else), `getRenderMode() -> RenderModeState`, `renderTimings() -> RenderTimings`, `prepareUnleashed() -> Promise<boolean>`; the same four on `window.__ocean` (as `setRenderMode`, `renderMode`, `renderTimings`, `prepareUnleashed`) and, when `main.js` is piece C's `startOcean`, on the handle it returns (`handle.setRenderMode`, `handle.getRenderMode`, `handle.renderTimings`, `handle.prepareUnleashed`), which is what C's finale toggle looks for.

## Global Constraints

- The controller creates this plan's worktree from `ocean-showcase` after A3 has merged (piece C may or may not have merged by then; Task 7 handles both shapes of `main.js`) and names its path. Every path below is relative to that worktree's root, and every command runs from it. Never touch `/Users/cole/Projects/Wesbite` or another worktree.
- No build step; plain ES modules a browser imports as they are. The only external library is `three@0.186.1` from `cdn.jsdelivr.net/npm/` through the page's existing import map. The GLSL is written for three@0.186.1's `meshphysical` shader template (anchors `#include <common>`, `#include <begin_vertex>`, `#include <map_fragment>`, `#include <roughnessmap_fragment>`, `#include <normal_fragment_maps>`, `#include <emissivemap_fragment>`).
- The A1 core (`content/ocean/js/core/`) is used, never forked; no core file changes in A4.
- Browser-free code (`content/ocean/js/engine/`, `content/ocean/js/workers/*Core.js`, and `content/ocean/js/render/unleashedGlsl.js`, which has no imports) must import cleanly in Node: no DOM, no Three.js, no `window`/`self`/`document`.
- Roblox mode's behaviour and tests do not change: every A2 and A3 unit and browser test passes unchanged. The A4 edits to A2/A3 files are additive (new exports, new status fields, a render-path branch that is never taken until Unleashed is asked for).
- Tests: unit tests in `tests/ocean/engine/` (`ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean` runs them), browser tests in `tests/ocean/e2e/`. The A4 worktree's browser tests run with `OCEAN_PORT=8769 npx playwright test -c playwright.ocean.config.js <spec>`; never set `OCEAN_REUSE_SERVER`. Headless Chromium draws WebGL on the machine's GPU through ANGLE's Metal backend (controller change 2026-09-30: about 60 fps in Roblox mode at 1366 x 767, against about 1 fps on SwiftShader); `OCEAN_GL=swiftshader` falls back to the CPU renderer, which is far slower, so the tests must still pass there given time. `tests/ocean/e2e/unleashed.spec.js` therefore runs at a 640 x 360 viewport, waits in frames (never in wall time), reads the canvas inside `requestAnimationFrame`, and sets generous per-test timeouts. If a browser threshold fails on a page that renders correctly, report the measured value; never lower a threshold silently.
- No `Math.random` anywhere.
- Files use tabs. Every new file opens with a header comment saying what it is and that it is A4's and not a twin.
- Index rule, as in A1 to A3: cascade and ring numbers keep their Luau values (1-based) and arrays are read at `[n - 1]`; shader cascade slot `c` (0-based) is cascade `c + 1`.
- Commit messages: `<type>: <description>` (feat, fix, test, docs, chore), no attribution trailers. A hook blocks any Bash command that contains `git commit` together with a `-n` flag: never put `-n` in a commit command.
- Subagents run on opus and never use the Roblox Studio MCP tools.

## Review Focus

Inputs and conditions the spec implies but no step names, most likely to bite a visitor first; each has a test in the named task:

1. **The toggle pressed repeatedly, including before the shaders are ready** (double requests, Unleashed then Roblox before compilation ends, six switches in a row): one preparation, the last request wins, and after the first switch nothing is allocated or compiled again. Tests in Task 5 (`decideMode` while preparing), Task 7 ("asking twice while the shaders compile ...") and Task 8 ("toggling back and forth allocates nothing ...").
2. **A GPU without what Unleashed needs** (no vertex texture units, no renderable float format, textures too small, an incomplete framebuffer): Roblox mode keeps drawing, the state says `supported: false` with a readable reason, one warning, no console error. Tests in Task 5 (`supportFor`) and Task 7 ("without vertex texture units ...").
3. **Unleashed asked for on a step it does not replace** (teaching waves, the white or lit looks, a calibration view, swells switched on by URL): Roblox mode draws the step with its own look, the reason names the step, and Unleashed comes back at the finale. Tests in Task 5 (`stageBlock`) and Task 8 ("Unleashed replaces only the painted sea ...").
4. **The camera far from the origin or at negative coordinates** (orbiting, the finale's drift, a focus thousands of studs out): the GPU wraps the fields exactly as `Cascade` does and puts every vertex where `SurfaceSampler` would. Tests in Task 2 ("sampleLayers is Cascade.sample ... anywhere on the plane") and Task 3 (the far focus in "the vertex-shader twin writes what SurfaceSampler writes ...").
5. **Sliders moved while Unleashed draws** (a layer switched off, foam off, glow off, chop and the foam knobs, a wind retune): the shaders read the same live settings the painter and the glow pass would, and with every layer off nothing is re-uploaded. Tests in Task 1 ("the display version moves only when a layer blends"), Task 3 ("after a layer is switched off ...") and Task 4 ("shadingSettings reads the live sea ...").

---

## Conventions every task follows

- **RenderModeState** (`getRenderMode()`, `setRenderMode()`):

  ```
  { requested: 'roblox' | 'unleashed',   what the page asked for last
    effective: 'roblox' | 'unleashed',   what draws (changes at the start of a frame)
    reason: string | null,               why effective differs from requested, else null
    supported: boolean,                  false when this GPU cannot run Unleashed
    supportReason: string | null,
    prepared: boolean }                  Unleashed built and its shaders compiled
  ```

- **RenderTimings** (`renderTimings()`): the RenderModeState fields plus `roblox` and `unleashed`, each `null` before a frame has been drawn in that mode or `{ frames, cpuMs, renderMs, frameMs, fps }` (means over the last 120 frames in that mode), and `skipped` (frames over 1 s left out).
- **ShadingSettings** (`engine/unleashedShading.js` `shadingSettings(ocean)`), the per-frame numbers the shaders read:

  ```
  { shown: [0|1, 0|1, 0|1],   slot c = cascade c + 1 is in painter.mapsConfig.colourCascades
    chop, peak, tint (0..1), deep: [r, g, b] (sRGB 0..1), subsurface: [r, g, b],
    foam: { on, whitecap, grow, decay, threshold, slope, laceSoft, opacity (0..1), colour: [r, g, b], roughness },
    glowOn, scatter: { strength, viewPower, facePower }, gamma, ringRoughness: number[] }
  ```

- **Worker-shaped objects** and the in-process cores as in A2/A3; Node tests flush with `const flush = () => new Promise((resolve) => setImmediate(resolve));`.
- **Test style** as A1 to A3: `import { test } from 'node:test'` and the helpers in `tests/ocean/expect.js` (`equal`, `near`, `truthy`).
- **Timing** uses `performance.now()` (a global in Node and browsers).

---
### Task 1: The render-path switch in the ocean

**Files:**
- Modify: `content/ocean/js/engine/ocean.js`
- Test: `tests/ocean/engine/renderPath.test.js` (new)

**Interfaces:**
- Consumes: A3's `ocean.js` (`step` with `parts`, `source`, `live`; `blendStage` with `layerOn`; `configureStage`), `stageControl.js` (`DEFAULT_SETTINGS`), `SurfaceState.snap` (A2) and `surface.stale` (A3).
- Produces (`engine/ocean.js`):
  - `RENDER_PATHS` (frozen `['roblox', 'unleashed']`)
  - `setRenderPath(ocean, path) -> void` (throws `RangeError` naming the two paths; switching to `'roblox'` sets `ocean.surface.stale = true`)
  - new ocean fields: `renderPath` (`'roblox'` at start), `counts` (`{ write, paint, glow }`: frames on which the CPU vertex write, a painter turn and the glow pass ran), `displayVersion` (integer, bumped on every frame at least one cascade's display fields were blended)
  - `status(ocean)` gains `renderPath`, `counts` (a copy) and `displayVersion`.
  - In `'unleashed'`, `step` still evolves, blends, moves every ring's window (`SurfaceState.snap`) and the horizon, and skips the vertex write, `PainterClient.step` and `strengthStage`.

- [ ] **Step 1: Write the failing tests**

`tests/ocean/engine/renderPath.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';
import * as Ocean from '../../../content/ocean/js/engine/ocean.js';
import * as StageControl from '../../../content/ocean/js/engine/stageControl.js';

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

function build(query = '?tier=Medium&freeze=12') {
	const painterCounts = {};
	let clock = 0;
	const ocean = Ocean.create(readConfig(query), {
		spawnCascade: () => createInProcessWorker(createCascadeWorker),
		spawnPainter: counting(createPainterWorker, painterCounts),
		now: () => clock,
		log: { warn() {} },
	});
	Ocean.attachSink(ocean, { uploadColourBand() {}, uploadMaskOrNormal() {}, uploadRoughness() {} });
	const focus = [0, 0];
	const advance = async (frames) => {
		for (let i = 0; i < frames; i++) {
			clock += 1 / 60;
			Ocean.step(ocean, 1 / 60, focus, [0, 14, 40], SUN);
			await flush();
		}
	};
	return { ocean, painterCounts, focus, advance };
}

test('Unleashed stops the CPU vertex write, the painter and the glow, and keeps the windows and the fields moving', async () => {
	const { ocean, painterCounts, focus, advance } = build();
	await advance(12);
	const before = Ocean.status(ocean).counts;
	expect.truthy(before.write >= 11 && before.paint >= 11 && before.glow >= 11, `Roblox mode ran every stage: ${JSON.stringify(before)}`);
	Ocean.setRenderPath(ocean, 'unleashed');
	const paints = painterCounts.paint ?? 0;
	const version = ocean.displayVersion;
	const centre = ocean.surface.centres[0];
	focus[0] = 100;
	focus[1] = -60;
	await advance(12);
	const after = Ocean.status(ocean);
	expect.equal(after.renderPath, 'unleashed', 'the path is reported');
	expect.equal(after.counts.write, before.write, 'no vertex write');
	expect.equal(after.counts.paint, before.paint, 'no painter turn');
	expect.equal(after.counts.glow, before.glow, 'no glow pass');
	expect.equal(painterCounts.paint ?? 0, paints, 'no Paint message posted');
	expect.truthy(ocean.displayVersion > version, 'the fields still blend');
	expect.truthy(ocean.surface.centres[0].x !== centre.x, 'ring 1 followed the focus');
	expect.equal(ocean.surface.focusX, 100, 'the fades follow the focus');
	const outer = ocean.surface.centres[ocean.surface.centres.length - 1];
	expect.equal(ocean.horizon.originX, outer.x, 'the horizon follows the last ring');
	expect.truthy(Ocean.status(ocean).displayVersion === ocean.displayVersion, 'status carries the version');
});

test('switching back writes every ring whole on the very next frame', async () => {
	const { ocean, focus, advance } = build();
	await advance(8);
	Ocean.setRenderPath(ocean, 'unleashed');
	focus[0] = 70;
	await advance(5);
	const writes = ocean.counts.write;
	for (const state of ocean.surface.patches) {
		state.written = false;
	}
	Ocean.setRenderPath(ocean, 'roblox');
	expect.equal(ocean.surface.stale, true, 'the surface is marked stale');
	await advance(1);
	const visible = ocean.surface.patches.filter((state) => !state.hidden);
	expect.truthy(visible.length > 0, 'patches are visible');
	expect.truthy(visible.every((state) => state.written), 'every visible patch of every ring was written, the outermost included');
	expect.equal(ocean.counts.write, writes + 1, 'the write ran once');
	expect.truthy(ocean.surface.patches.every((p) => p.positions.every(Number.isFinite)), 'finite');
});

test('a path the renderer does not have is refused and changes nothing', () => {
	const { ocean } = build();
	let message = '';
	try {
		Ocean.setRenderPath(ocean, 'fast');
	} catch (error) {
		message = `${error.name}: ${error.message}`;
	}
	expect.truthy(message.startsWith('RangeError') && message.includes('roblox') && message.includes('unleashed'), `named error: ${message}`);
	expect.equal(ocean.renderPath, 'roblox', 'unchanged');
	expect.equal(Ocean.RENDER_PATHS.join(','), 'roblox,unleashed', 'the two paths');
});

test('the display version moves only when a layer blends (Review Focus 5)', async () => {
	const { ocean, advance } = build();
	await advance(9);
	Ocean.configureStage(ocean, { ...StageControl.DEFAULT_SETTINGS, layers: [false, false, false] });
	await advance(1);
	const held = ocean.displayVersion;
	await advance(6);
	expect.equal(ocean.displayVersion, held, 'every layer off: nothing blended, nothing to re-upload');
	Ocean.configureStage(ocean, { ...StageControl.DEFAULT_SETTINGS, layers: [true, false, false] });
	await advance(6);
	expect.truthy(ocean.displayVersion > held, 'a layer back on blends again');
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/ocean/engine/renderPath.test.js`
Expected: FAIL: `Ocean.setRenderPath is not a function` and `Ocean.status(...).counts` undefined.

- [ ] **Step 3: Add the switch to `content/ocean/js/engine/ocean.js`**

(a) Add to the header comment, after the A3 paragraph beginning "A3 adds the stage switches":

```js
//
// A4 adds the render path (setRenderPath): in 'unleashed' the GPU displaces, colours, foams and
// lights the sea from the same blended fields (render/unleashed.js), so this loop still evolves,
// blends and moves every ring's window, and skips what that path replaces: the CPU vertex write,
// the painter's turn and the per-patch glow. `counts` says which of those ran and `displayVersion`
// when the fields changed, so the renderer re-uploads them only then.
```

(b) After `export const REPORT_WINDOW = REPORT_EVERY_FRAMES;` add:

```js
// A4: which renderer draws the sea. 'roblox' is A2's CPU path; 'unleashed' is the GPU path.
export const RENDER_PATHS = Object.freeze(['roblox', 'unleashed']);
```

(c) In `create`, in the `ocean` object literal, after `stageSettings: null,` add:

```js
		// A4: the render path (setRenderPath), the frames on which each CPU stage the Unleashed path
		// skips actually ran, and a counter bumped whenever the display fields were blended.
		renderPath: 'roblox',
		counts: { write: 0, paint: 0, glow: 0 },
		displayVersion: 0,
```

(d) Replace `blendStage` with:

```js
function blendStage(ocean) {
	const store = ocean.store;
	let blended = false;
	for (let index = 1; index <= store.count; index++) {
		const fraction = OceanClock.fadeFraction(ocean.frame, store.promotedFrame[index - 1], OceanClock.PERIOD);
		if (index === 1) {
			ocean.blendSum += fraction;
		}
		// A layer switched off keeps whatever its display last held; nothing samples it meanwhile.
		// FieldStore.blend leaves a cascade with no result untouched, so it is not counted either.
		if (ocean.layerOn[index - 1] && FieldStore.hasFields(store, index)) {
			FieldStore.blend(store, index, fraction, BLEND_FIELDS);
			blended = true;
		}
	}
	if (blended) {
		ocean.displayVersion += 1;
	}
}
```

(e) In `step`, replace

```js
	if (parts.painter) {
		PainterClient.step(ocean.painter, ocean.frame, t, ocean.store);
	}
```

with

```js
	if (parts.painter && ocean.renderPath === 'roblox') {
		PainterClient.step(ocean.painter, ocean.frame, t, ocean.store);
		ocean.counts.paint += 1;
	}
```

(f) In `step`, replace the block from `const surface = ocean.surface;` down to and including `ocean.stage.write += (performance.now() - started) / 1000 - surface.snapSeconds;` with:

```js
	const surface = ocean.surface;
	if (ocean.renderPath === 'unleashed') {
		// A4: the vertex shader displaces the lattice, so only the windows move (and the patches and
		// their UVs with them); no vertex is written. setRenderPath marks the surface stale on the way
		// back, so the first Roblox-mode frame writes every ring whole.
		const started = performance.now();
		ocean.snapCount += SurfaceState.snap(surface, focus[0], focus[1]);
		ocean.stage.snap += (performance.now() - started) / 1000;
	} else {
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
		if (!surface.skipped) {
			ocean.counts.write += 1;
		}
	}
```

(If A3's merged `step` differs in the arguments to `snapAndWrite`, keep A3's arguments exactly and only wrap them in the `else` branch with the `counts.write` line.)

(g) In `step`, replace

```js
	if (parts.glow) {
		timed(ocean, 'strength', () => strengthStage(ocean, eye, sun));
	}
```

with

```js
	if (parts.glow && ocean.renderPath === 'roblox') {
		timed(ocean, 'strength', () => strengthStage(ocean, eye, sun));
		ocean.counts.glow += 1;
	}
```

(h) After `configureStage` add:

```js
/**
 * A4: which renderer draws the sea (render/renderMode.js decides; this only obeys). Back to
 * 'roblox', the vertices have stood still while the GPU drew, so the next write covers every ring.
 * @param {'roblox' | 'unleashed'} path
 */
export function setRenderPath(ocean, path) {
	if (!RENDER_PATHS.includes(path)) {
		throw new RangeError(`setRenderPath: the path must be one of ${RENDER_PATHS.join(', ')}, got ${JSON.stringify(path)}`);
	}
	if (path === ocean.renderPath) {
		return;
	}
	ocean.renderPath = path;
	if (path === 'roblox') {
		ocean.surface.stale = true;
	}
}
```

(i) In `status`, after `foamCover: ocean.painter.foamCover,` add:

```js
		renderPath: ocean.renderPath,
		counts: { ...ocean.counts },
		displayVersion: ocean.displayVersion,
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/ocean/engine/renderPath.test.js && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean`
Expected: PASS: 4 render-path tests, and the whole suite green (the A2 and A3 ocean tests prove the Roblox path is unchanged).

- [ ] **Step 5: Commit**

```bash
git add content/ocean/js/engine/ocean.js tests/ocean/engine/renderPath.test.js
git commit -m "feat: a render path in the ocean that skips the vertex write, the painter and the glow"
```

---

### Task 2: The fields as the GPU takes them

**Files:**
- Create: `content/ocean/js/engine/unleashedFields.js`
- Create: `tests/ocean/engine/unleashedFixtures.js` (shared test helper)
- Test: `tests/ocean/engine/unleashedFields.test.js`

**Interfaces:**
- Consumes: A1 `core/cascade.js` (`sample`, `sampleHeight`, `create`, `evolve`, `synthesise`), `core/peakMask.js` (`fill`, `nextMax`), `core/luau.js` (`mod`), `core/fft.js`, `core/tier.js`, `core/waveField.js`; `engine/config.js` (`FOAM_TEXELS`, `MAP_TEXELS`, `readConfig`); Task 1 `ocean.displayVersion`.
- Produces (`engine/unleashedFields.js`), used by Tasks 3, 4, 7 and 8:
  - `CASCADE_SLOTS` (3), `LAYERS_PER_CASCADE` (2), `CHANNELS` (4), `LAYER_FIELDS` (the two frozen name lists)
  - `layerFloats(n, count) -> number`
  - `cascadeSlots(list: number[]) -> number[]` (length 3, 1 where Luau cascade c is listed at slot c - 1; throws `RangeError` for a number outside 1..3)
  - `packFieldLayers(display: Fields[], out: Float32Array) -> Float32Array` (texel (column, row) of layer L at `((L * n + row) * n + column) * 4`)
  - `sampleLayers(packed, n, layer, size, x, z, out = new Float64Array(4)) -> out` (twin of GLSL `oceanField`)
  - `tallestCrest(display, cascades, texels, tile) -> number` (PeakMask's `found`)
  - `foamTexelsFor(preset) -> number`
  - `createFieldSync(ocean) -> { data: Float32Array, sync() -> boolean, uploads() -> number }`
  - `createCrestTracker(ocean, texels = MAP_TEXELS) -> { update(frame) -> number, value() -> number }`
- Produces (`tests/ocean/engine/unleashedFixtures.js`), used by the tests of Tasks 3 and 4: `heroFields(tier = 'High', t = 12) -> Cascade[]` (the hero sea's cascades at time t, synthesised; a Cascade is a `Fields`), `HERO_PARAMS`.

- [ ] **Step 1: Write the shared fixture**

`tests/ocean/engine/unleashedFixtures.js`:

```js
// A4 test fixture (not a test): the hero sea's cascades at one time, synthesised in this thread,
// the fields the Unleashed twins are checked on. The seeds are the page's (SEED * 7919 + index).
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FFT from '../../../content/ocean/js/core/fft.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as WaveField from '../../../content/ocean/js/core/waveField.js';
import { readConfig, SEED } from '../../../content/ocean/js/engine/config.js';

export const HERO_PARAMS = readConfig('').params;

export function heroFields(tier = 'High', t = 12) {
	const preset = Tier.presets[tier];
	const bands = WaveField.bands(preset.sizes, preset.n);
	const plan = FFT.plan(preset.n);
	return preset.sizes.map((size, i) => {
		const cascade = Cascade.create({
			n: preset.n,
			size,
			kMin: bands[i].kMin,
			kMax: bands[i].kMax,
			seed: SEED * 7919 + i + 1,
			loopPeriod: 120,
			params: HERO_PARAMS,
		});
		Cascade.evolve(cascade, t);
		Cascade.synthesise(cascade, plan);
		return cascade;
	});
}
```

- [ ] **Step 2: Write the failing tests**

`tests/ocean/engine/unleashedFields.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as PeakMask from '../../../content/ocean/js/core/peakMask.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import * as Fields from '../../../content/ocean/js/engine/unleashedFields.js';
import { heroFields } from './unleashedFixtures.js';

const N = 64;

test('packFieldLayers lays each cascade out as two RGBA layers', () => {
	const fields = heroFields('Medium');
	const out = new Float32Array(Fields.layerFloats(N, 2));
	expect.equal(out.length, N * N * 2 * 2 * 4, 'two layers of four channels per cascade');
	Fields.packFieldLayers(fields, out);
	const cells = N * N;
	for (const cell of [0, 5 * N + 9, cells - 1]) {
		for (let c = 0; c < 2; c++) {
			const f = fields[c];
			const first = (2 * c * cells + cell) * 4;
			const second = ((2 * c + 1) * cells + cell) * 4;
			expect.equal(out[first], Math.fround(f.height[cell]), `height c${c + 1} cell ${cell}`);
			expect.equal(out[first + 1], Math.fround(f.dispX[cell]), 'dispX');
			expect.equal(out[first + 2], Math.fround(f.dispZ[cell]), 'dispZ');
			expect.equal(out[first + 3], Math.fround(f.slopeX[cell]), 'slopeX');
			expect.equal(out[second], Math.fround(f.slopeZ[cell]), 'slopeZ');
			expect.equal(out[second + 1], Math.fround(f.jxx[cell]), 'jxx');
			expect.equal(out[second + 2], Math.fround(f.jzz[cell]), 'jzz');
			expect.equal(out[second + 3], Math.fround(f.jxz[cell]), 'jxz');
		}
	}
});

test('a buffer of the wrong size or type is refused', () => {
	const fields = heroFields('Low');
	for (const bad of [new Float32Array(10), new Float64Array(Fields.layerFloats(N, 1))]) {
		let threw = false;
		try {
			Fields.packFieldLayers(fields, bad);
		} catch (error) {
			threw = /Float32Array/.test(error.message);
		}
		expect.truthy(threw, `refused ${bad.constructor.name}(${bad.length})`);
	}
});

test('sampleLayers is Cascade.sample to float32 rounding, anywhere on the plane (Review Focus 4)', () => {
	const fields = heroFields('High');
	const packed = Fields.packFieldLayers(fields, new Float32Array(Fields.layerFloats(N, 3)));
	const points = [[0, 0], [255.999, 3], [-1e-7, 10], [-5000.3, 7777.7], [100000.25, -30000], [12.5, 64], [-0.5, -0.5]];
	const expected = new Float64Array(8);
	const got = new Float64Array(4);
	for (let c = 0; c < 3; c++) {
		for (const [x, z] of points) {
			Cascade.sample(fields[c], x, z, expected);
			Fields.sampleLayers(packed, N, 2 * c, fields[c].size, x, z, got);
			for (let ch = 0; ch < 4; ch++) {
				expect.near(got[ch], expected[ch], 1e-5 + 1e-6 * Math.abs(expected[ch]), `c${c + 1} (${x}, ${z}) first layer channel ${ch}`);
			}
			Fields.sampleLayers(packed, N, 2 * c + 1, fields[c].size, x, z, got);
			for (let ch = 0; ch < 4; ch++) {
				expect.near(got[ch], expected[4 + ch], 1e-5 + 1e-6 * Math.abs(expected[4 + ch]), `c${c + 1} (${x}, ${z}) second layer channel ${ch}`);
			}
		}
	}
});

test("tallestCrest is the maximum PeakMask.fill normalises by", () => {
	const fields = heroFields('High');
	for (const cascades of [[1, 2, 3], [1], [2, 3]]) {
		const out = new Uint8Array(128 * 128 * 4);
		const found = PeakMask.fill(out, 128, 256, fields, cascades, 0, 0.8, null);
		expect.equal(Fields.tallestCrest(fields, cascades, 128, 256), found, `cascades ${cascades}`);
	}
	expect.equal(Fields.tallestCrest(fields, [], 128, 256), 0, 'no cascade: nothing stands up');
});

test('cascadeSlots marks the listed cascades and refuses a fourth', () => {
	expect.equal(Fields.cascadeSlots([1, 3]).join(','), '1,0,1', 'slots');
	expect.equal(Fields.cascadeSlots([]).join(','), '0,0,0', 'none');
	let threw = false;
	try {
		Fields.cascadeSlots([4]);
	} catch (error) {
		threw = error instanceof RangeError;
	}
	expect.truthy(threw, 'cascade 4 refused');
});

test('createFieldSync packs only when the display version moved', () => {
	const fields = heroFields('Medium');
	const ocean = { preset: Tier.presets.Medium, store: { display: fields }, displayVersion: 0 };
	const sync = Fields.createFieldSync(ocean);
	expect.equal(sync.sync(), true, 'the first sync packs');
	expect.equal(sync.data[0], Math.fround(fields[0].height[0]), 'packed');
	expect.equal(sync.sync(), false, 'nothing moved: no pack');
	ocean.displayVersion = 1;
	fields[0].height[0] = 123.5;
	expect.equal(sync.sync(), true, 'a new version packs');
	expect.equal(sync.data[0], 123.5, 'the new value');
	expect.equal(sync.uploads(), 2, 'two packs');
});

test("createCrestTracker keeps the maps role's running maximum, on even frames", () => {
	const fields = heroFields('Medium');
	const ocean = {
		preset: Tier.presets.Medium,
		store: { display: fields },
		displayVersion: 1,
		painter: { mapsConfig: { maskCascades: [1, 2], decay: 0.98 } },
	};
	const tracker = Fields.createCrestTracker(ocean);
	const found = Fields.tallestCrest(fields, [1, 2], 128, 256);
	expect.equal(tracker.update(1), 0, 'odd frame: not yet');
	expect.equal(tracker.update(2), found, 'the first fill normalises by what it finds');
	for (const f of fields) {
		f.height.forEach((value, i) => {
			f.height[i] = value * 0.5;
		});
	}
	expect.equal(tracker.update(4), found, 'same version: unchanged');
	ocean.displayVersion = 2;
	expect.near(tracker.update(4), PeakMask.nextMax(found, found * 0.5, 0.98), 1e-9, 'a lower sea decays the maximum');
	expect.equal(tracker.value(), tracker.update(5), 'value() reads the last');
});

test("foamTexelsFor gives the finest cascade's cell, never coarser than the CPU field", () => {
	expect.equal(Fields.foamTexelsFor(Tier.presets.High), 1024, 'High: a quarter stud');
	expect.equal(Fields.foamTexelsFor(Tier.presets.Medium), 256, 'Medium: one stud');
	expect.equal(Fields.foamTexelsFor(Tier.presets.Low), 256, 'Low: the CPU floor');
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `node --test tests/ocean/engine/unleashedFields.test.js`
Expected: FAIL: cannot find module `content/ocean/js/engine/unleashedFields.js`.

- [ ] **Step 4: Write `content/ocean/js/engine/unleashedFields.js`**

```js
// A4 (not a twin): the blended cascade fields as the Unleashed shaders take them. One float texture
// array holds every cascade as two RGBA layers -- layer 2(c-1): height, dispX, dispZ, slopeX; layer
// 2(c-1)+1: slopeZ, jxx, jzz, jxz -- texel (column, row) being the cascade's cell row * n + column.
// The shaders read it with texelFetch and weight the four texels by hand, with Cascade's own floored
// modulo and fold-back (sampleLayers is the JavaScript twin of GLSL oceanField, tested against
// Cascade.sample), so no float-filtering extension is needed and the GPU wraps exactly as the CPU.
// Also here: the peak mask's normaliser (tallestCrest, PeakMask's `found`, kept as a running
// maximum on even frames as the maps role keeps it), and the GPU foam field's texel count.
import * as Cascade from '../core/cascade.js';
import * as PeakMask from '../core/peakMask.js';
import { mod } from '../core/luau.js';
import { FOAM_TEXELS, MAP_TEXELS } from './config.js';

export const CASCADE_SLOTS = 3; // the shaders' vec3 per-cascade uniforms; High has three cascades
export const LAYERS_PER_CASCADE = 2;
export const CHANNELS = 4;
export const LAYER_FIELDS = Object.freeze([
	Object.freeze(['height', 'dispX', 'dispZ', 'slopeX']),
	Object.freeze(['slopeZ', 'jxx', 'jzz', 'jxz']),
]);

export function layerFloats(n, count) {
	return n * n * count * LAYERS_PER_CASCADE * CHANNELS;
}

// Luau cascade numbers to the shaders' slots: slot c - 1 is 1 when cascade c is listed.
export function cascadeSlots(list) {
	const slots = new Array(CASCADE_SLOTS).fill(0);
	for (const cascade of list) {
		if (!Number.isInteger(cascade) || cascade < 1 || cascade > CASCADE_SLOTS) {
			throw new RangeError(`cascadeSlots: cascade numbers run 1 to ${CASCADE_SLOTS}, got ${cascade}`);
		}
		slots[cascade - 1] = 1;
	}
	return slots;
}

/**
 * @param {Array<import('../core/cascade.js').Fields>} display one Fields per cascade, all the same n
 * @param {Float32Array} out exactly layerFloats(n, display.length) floats
 */
export function packFieldLayers(display, out) {
	const count = display.length;
	const n = display[0].n;
	const needed = layerFloats(n, count);
	if (!(out instanceof Float32Array) || out.length !== needed) {
		throw new Error(`packFieldLayers needs a Float32Array of ${needed} floats, got ${out?.constructor?.name}(${out?.length})`);
	}
	const cells = n * n;
	for (let c = 0; c < count; c++) {
		const fields = display[c];
		if (fields.n !== n) {
			throw new Error(`packFieldLayers: cascade ${c + 1} has n = ${fields.n}, cascade 1 has ${n}`);
		}
		for (let half = 0; half < LAYERS_PER_CASCADE; half++) {
			const names = LAYER_FIELDS[half];
			const f0 = fields[names[0]];
			const f1 = fields[names[1]];
			const f2 = fields[names[2]];
			const f3 = fields[names[3]];
			const base = (c * LAYERS_PER_CASCADE + half) * cells * CHANNELS;
			for (let cell = 0; cell < cells; cell++) {
				const o = base + cell * CHANNELS;
				out[o] = f0[cell];
				out[o + 1] = f1[cell];
				out[o + 2] = f2[cell];
				out[o + 3] = f3[cell];
			}
		}
	}
	return out;
}

// Twin of GLSL oceanField (render/unleashedGlsl.js): Cascade's corners (floored modulo, a result of
// exactly n folded back to 0, the next cell wrapping) and bilinear weights, over one packed layer.
export function sampleLayers(packed, n, layer, size, x, z, out = new Float64Array(CHANNELS)) {
	let u = mod((x / size) * n, n);
	let v = mod((z / size) * n, n);
	if (u >= n) u -= n;
	if (v >= n) v -= n;
	const column = Math.floor(u);
	const row = Math.floor(v);
	const fu = u - column;
	const fv = v - row;
	const column1 = (column + 1) % n;
	const row1 = (row + 1) % n;
	const base = layer * n * n * CHANNELS;
	const t00 = base + (row * n + column) * CHANNELS;
	const t10 = base + (row * n + column1) * CHANNELS;
	const t01 = base + (row1 * n + column) * CHANNELS;
	const t11 = base + (row1 * n + column1) * CHANNELS;
	const w00 = (1 - fu) * (1 - fv);
	const w10 = fu * (1 - fv);
	const w01 = (1 - fu) * fv;
	const w11 = fu * fv;
	for (let ch = 0; ch < CHANNELS; ch++) {
		out[ch] = packed[t00 + ch] * w00 + packed[t10 + ch] * w10 + packed[t01 + ch] * w01 + packed[t11 + ch] * w11;
	}
	return out;
}

const HEIGHT = new Float64Array(3);

// PeakMask.fill's `found`, with the same arithmetic: the tallest summed height above the mean
// surface over the mask's texel centres. What the per-pixel peak mask divides by.
export function tallestCrest(display, cascades, texels, tile) {
	const step = tile / texels;
	const count = cascades.length;
	let found = 0;
	for (let j = 0; j <= texels - 1; j++) {
		const z = (j + 0.5) * step;
		for (let i = 0; i <= texels - 1; i++) {
			const x = (i + 0.5) * step;
			let h = 0;
			for (let index = 0; index < count; index++) {
				h += Cascade.sampleHeight(display[cascades[index] - 1], x, z, HEIGHT)[0];
			}
			const magnitude = Math.max(h, 0);
			if (magnitude > found) {
				found = magnitude;
			}
		}
	}
	return found;
}

// One GPU foam texel per cell of the finest cascade across the texture tile (a quarter stud on
// High), and never fewer than the CPU field's FOAM_TEXELS.
export function foamTexelsFor(preset) {
	const finest = Math.min(...preset.sizes.map((size) => size / preset.n));
	return Math.max(FOAM_TEXELS, Math.round(preset.textureTile / finest));
}

// The packed copy the float texture uploads from, repacked only when the ocean's display fields
// were blended since the last sync (Ocean's displayVersion).
export function createFieldSync(ocean) {
	const { n, sizes } = ocean.preset;
	const data = new Float32Array(layerFloats(n, sizes.length));
	let version = -1;
	let uploads = 0;
	return {
		data,
		sync() {
			if (ocean.displayVersion === version) {
				return false;
			}
			packFieldLayers(ocean.store.display, data);
			version = ocean.displayVersion;
			uploads += 1;
			return true;
		},
		uploads: () => uploads,
	};
}

// The per-pixel peak mask's normaliser, as the maps role keeps it: refreshed every other frame
// (the maps role paints the mask on alternate turns), only when the fields moved, over the mask's
// own cascades, with PeakMask.nextMax's hysteresis.
export function createCrestTracker(ocean, texels = MAP_TEXELS) {
	let max = 0;
	let version = -1;
	return {
		update(frame) {
			if (frame % 2 !== 0 || ocean.displayVersion === version) {
				return max;
			}
			const painter = ocean.painter.mapsConfig;
			const found = tallestCrest(ocean.store.display, painter.maskCascades, texels, ocean.preset.textureTile);
			max = PeakMask.nextMax(max, found, painter.decay);
			version = ocean.displayVersion;
			return max;
		},
		value: () => max,
	};
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `node --test tests/ocean/engine/unleashedFields.test.js && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean`
Expected: PASS: 8 tests, and the whole suite green.

- [ ] **Step 6: Commit**

```bash
git add content/ocean/js/engine/unleashedFields.js tests/ocean/engine/unleashedFixtures.js tests/ocean/engine/unleashedFields.test.js
git commit -m "feat: the cascade fields packed for the GPU, with a twin of the shader's sampling"
```

---

### Task 3: The vertex shader's twin: rings, seams and skirts

**Files:**
- Create: `content/ocean/js/engine/unleashedSurface.js`
- Test: `tests/ocean/engine/unleashedSurface.test.js`

**Interfaces:**
- Consumes: Task 2 `CASCADE_SLOTS`, `cascadeSlots`, `sampleLayers`, `packFieldLayers`, `layerFloats`, and the fixture `heroFields`, `HERO_PARAMS`; A1 `core/ringLayout.js`, `core/surfaceSampler.js` (through `SurfaceState.write`), `core/swells.js`, `core/tier.js`, `core/luau.js` (`clamp`); A2/A3 `engine/surfaceState.js` (`create`, `snap`, `write`, `setRingCascades`; state `ringSpecs`, `contexts`, `centres`, `focusX`, `focusZ`, `skirtY`, patch states `ring`, `half`, `worldX`, `worldZ`, `hidden`, `positions`), `engine/bounds.js` (`boundsFor`).
- Produces (`engine/unleashedSurface.js`), used by Task 8:
  - `seamAxes(patch) -> Float32Array` (two floats per vertex: the offset from a seam vertex to its `b` neighbour, zero off the seams)
  - `patchCovered(surface, state) -> boolean` (every vertex strictly inside the next finer ring's window: SurfaceSampler's "hide this patch")
  - `ringUniforms(surface, ring) -> { displace: 1, sampled: number[3], fades: number[3], fadeEdge, fadeWidth, innerX, innerZ, innerHalf }` (frozen)
  - `horizonUniforms() -> the same shape with displace 0`
  - `displaceVertex(input, out = new Float64Array(3)) -> out`, input `{ packed, n, sizes, uniforms, focusX, focusZ, skirtY, chop, localX, localZ, worldX, worldZ, axisX, axisZ }`: the patch-local position the vertex shader gives this vertex.

- [ ] **Step 1: Write the failing tests**

`tests/ocean/engine/unleashedSurface.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as RingLayout from '../../../content/ocean/js/core/ringLayout.js';
import * as Swells from '../../../content/ocean/js/core/swells.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import { boundsFor } from '../../../content/ocean/js/engine/bounds.js';
import * as SurfaceState from '../../../content/ocean/js/engine/surfaceState.js';
import * as Fields from '../../../content/ocean/js/engine/unleashedFields.js';
import * as Surface from '../../../content/ocean/js/engine/unleashedSurface.js';
import { heroFields, HERO_PARAMS } from './unleashedFixtures.js';

const CHOP = 0.8;
const T = 12;

function setup() {
	const preset = Tier.presets.High;
	const layout = RingLayout.build({ rings: preset.rings, patchCells: preset.patchCells, textureTile: preset.textureTile });
	const surface = SurfaceState.create(layout, boundsFor({ params: HERO_PARAMS, chop: CHOP, swellScale: 0 }), false);
	const fields = heroFields('High', T);
	const store = { display: fields };
	const swells = Swells.create([{ wavelength: 420, amplitude: 0, direction: 0.2, phase: 0 }], HERO_PARAMS, 120);
	const packed = Fields.packFieldLayers(fields, new Float32Array(Fields.layerFloats(preset.n, preset.sizes.length)));
	return { preset, surface, store, swells, packed };
}

// Every vertex of every visible patch of `rings`, the twin against what SurfaceSampler wrote.
function compare(setupState, rings, label) {
	const { preset, surface, packed } = setupState;
	const out = new Float64Array(3);
	let compared = 0;
	for (const state of surface.patches) {
		if (!rings.includes(state.ring)) {
			continue;
		}
		expect.equal(Surface.patchCovered(surface, state), state.hidden, `${label}: ring ${state.ring} patch at (${state.worldX}, ${state.worldZ}) covered`);
		if (state.hidden) {
			continue;
		}
		const uniforms = Surface.ringUniforms(surface, state.ring);
		const axes = Surface.seamAxes(state.patch);
		const { localX, localZ } = state.patch;
		for (let v = 0; v < localX.length; v++) {
			Surface.displaceVertex({
				packed,
				n: preset.n,
				sizes: preset.sizes,
				uniforms,
				focusX: surface.focusX,
				focusZ: surface.focusZ,
				skirtY: surface.skirtY,
				chop: CHOP,
				localX: localX[v],
				localZ: localZ[v],
				worldX: state.worldX,
				worldZ: state.worldZ,
				axisX: axes[v * 2],
				axisZ: axes[v * 2 + 1],
			}, out);
			for (let k = 0; k < 3; k++) {
				expect.near(out[k], state.positions[v * 3 + k], 1e-3, `${label}: ring ${state.ring} vertex ${v + 1} axis ${k}`);
			}
			compared += 1;
		}
	}
	return compared;
}

test('the vertex-shader twin writes what SurfaceSampler writes, on every ring, seams and skirts included (Review Focus 4)', () => {
	const s = setup();
	for (const [fx, fz] of [[37.3, -81.9], [-5000.3, 7777.7], [0, 0]]) {
		SurfaceState.snap(s.surface, fx, fz);
		SurfaceState.write(s.surface, s.store, s.swells, T, CHOP);
		const compared = compare(s, [1, 2, 3, 4, 5], `focus (${fx}, ${fz})`);
		expect.truthy(compared > 10000, `compared ${compared} vertices`);
		expect.truthy(s.surface.patches.some((state) => state.hidden), 'some patches are covered by a finer ring');
	}
});

test('after a layer is switched off the ring uniforms follow (Review Focus 5)', () => {
	const s = setup();
	SurfaceState.setRingCascades(s.surface, [true, false, true]);
	SurfaceState.snap(s.surface, 12.5, 3.25);
	SurfaceState.write(s.surface, s.store, s.swells, T, CHOP);
	expect.equal(Surface.ringUniforms(s.surface, 1).sampled.join(','), '1,0,0', 'ring 1 samples cascade 1 alone');
	expect.truthy(compare(s, [1, 2, 3], 'cascade 2 off') > 1000, 'compared');
	SurfaceState.setRingCascades(s.surface, [false, false, false]);
	SurfaceState.write(s.surface, s.store, s.swells, T, CHOP);
	expect.equal(Surface.ringUniforms(s.surface, 4).sampled.join(','), '0,0,0', 'nothing sampled');
	expect.truthy(compare(s, [4], 'all off') > 100, 'a flat ring');
});

test('seam axes point from each seam vertex to its b neighbour, and are zero elsewhere', () => {
	const s = setup();
	const edge = s.surface.patches.find((state) => state.ring === 1 && state.patch.seams.length > 0);
	const { patch } = edge;
	const axes = Surface.seamAxes(patch);
	let nonZero = 0;
	for (let v = 0; v < patch.localX.length; v++) {
		if (axes[v * 2] !== 0 || axes[v * 2 + 1] !== 0) nonZero += 1;
	}
	expect.equal(nonZero, patch.seams.length, 'one axis per seam vertex');
	for (const seam of patch.seams) {
		const s0 = seam.index - 1;
		expect.equal(patch.localX[seam.a - 1], patch.localX[s0] - axes[s0 * 2], 'a sits one axis back (x)');
		expect.equal(patch.localZ[seam.a - 1], patch.localZ[s0] - axes[s0 * 2 + 1], 'a sits one axis back (z)');
		expect.equal(patch.localX[seam.b - 1], patch.localX[s0] + axes[s0 * 2], 'b sits one axis on (x)');
	}
});

test('the horizon quads are not displaced and nothing is skirted under them', () => {
	const u = Surface.horizonUniforms();
	expect.equal(u.displace, 0, 'no displacement');
	expect.equal(u.innerHalf, 0, 'no skirt');
	const out = Surface.displaceVertex({ packed: new Float32Array(16), n: 1, sizes: [256], uniforms: u, focusX: 0, focusZ: 0, skirtY: -38, chop: 1, localX: -1024, localZ: 1024, worldX: 0, worldZ: 0, axisX: 0, axisZ: 0 });
	expect.equal([...out].join(','), '-1024,0,1024', 'the flat corner');
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/ocean/engine/unleashedSurface.test.js`
Expected: FAIL: cannot find module `content/ocean/js/engine/unleashedSurface.js`.

- [ ] **Step 3: Write `content/ocean/js/engine/unleashedSurface.js`**

```js
// A4 (not a twin): the surface's rings and patches as the Unleashed vertex shader takes them, and
// displaceVertex, the JavaScript twin of that shader (render/unleashedGlsl.js: oceanDisplace and
// the begin_vertex block), tested against SurfaceSampler.fill so the GPU puts every vertex where
// the CPU write would. The rules it keeps, all SurfaceSampler's, for FFT rings with silent swells:
//   * a ring samples its own (A3-filtered) cascade list, each bilinear off its own lattice;
//   * a cascade the next ring out does not sample fades by f = clamp((fadeEdge - d) / fadeWidth),
//     d the Chebyshev distance from the FOCUS; the last ring fades everything;
//   * a vertex strictly inside the next finer ring's window drops to skirtY (the skirt);
//   * a seam vertex on an edge facing a coarser ring takes the mean of its two edge neighbours,
//     which is the mean of their displacements since it sits halfway between them;
//   * a patch whose every vertex is skirted is not drawn (patchCovered, the CPU's `hidden`).
// The horizon quads use the same material undisplaced (horizonUniforms).
import { clamp } from '../core/luau.js';
import { CASCADE_SLOTS, cascadeSlots, sampleLayers } from './unleashedFields.js';

// Per vertex, the offset from a seam vertex to its `b` neighbour (its `a` neighbour is the same
// offset back); zero for every vertex that is not a seam. The vertex attribute `seamAxis`.
export function seamAxes(patch) {
	const out = new Float32Array(patch.localX.length * 2);
	for (const seam of patch.seams) {
		const s = seam.index - 1;
		const b = seam.b - 1;
		out[s * 2] = patch.localX[b] - patch.localX[s];
		out[s * 2 + 1] = patch.localZ[b] - patch.localZ[s];
	}
	return out;
}

// SurfaceSampler.fill returns true (hide the patch) when every vertex lies strictly inside the next
// finer ring's window. The vertices span worldX +- half, so that is the patch's own square strictly
// inside the window. Ring 1 has no finer ring.
export function patchCovered(surface, state) {
	if (state.ring === 1) {
		return false;
	}
	const inner = surface.centres[state.ring - 2];
	const innerHalf = surface.ringSpecs[state.ring - 2].halfExtent;
	const half = state.half;
	return (
		state.worldX - half > inner.x - innerHalf &&
		state.worldX + half < inner.x + innerHalf &&
		state.worldZ - half > inner.z - innerHalf &&
		state.worldZ + half < inner.z + innerHalf
	);
}

// One ring's uniforms, from the surface's filtered ring specs and the sampler's ring contexts.
export function ringUniforms(surface, ring) {
	const spec = surface.ringSpecs[ring - 1];
	const context = surface.contexts[ring - 1];
	const fades = new Array(CASCADE_SLOTS).fill(0);
	for (const cascade of spec.cascades) {
		fades[cascade - 1] = context.fades[cascade - 1] ? 1 : 0;
	}
	const inner = ring > 1 ? surface.centres[ring - 2] : null;
	return Object.freeze({
		displace: 1,
		sampled: cascadeSlots(spec.cascades),
		fades,
		fadeEdge: context.fadeEdge,
		fadeWidth: context.fadeWidth,
		innerX: inner ? inner.x : 0,
		innerZ: inner ? inner.z : 0,
		innerHalf: inner ? surface.ringSpecs[ring - 2].halfExtent : 0,
	});
}

export function horizonUniforms() {
	return Object.freeze({
		displace: 0,
		sampled: new Array(CASCADE_SLOTS).fill(0),
		fades: new Array(CASCADE_SLOTS).fill(0),
		fadeEdge: 1,
		fadeWidth: 1,
		innerX: 0,
		innerZ: 0,
		innerHalf: 0,
	});
}

const LAYER = new Float64Array(4);
const A = new Float64Array(3);
const B = new Float64Array(3);

// Twin of GLSL oceanDisplace: (dx, dy, dz) of the ring's cascades at world (wx, wz).
function displacement(input, wx, wz, out) {
	const { packed, n, sizes, uniforms, focusX, focusZ, chop } = input;
	const reach = Math.max(Math.abs(wx - focusX), Math.abs(wz - focusZ));
	const fade = clamp((uniforms.fadeEdge - reach) / uniforms.fadeWidth, 0, 1);
	let dx = 0;
	let dy = 0;
	let dz = 0;
	for (let c = 0; c < sizes.length; c++) {
		if (uniforms.sampled[c] > 0.5) {
			const s = sampleLayers(packed, n, 2 * c, sizes[c], wx, wz, LAYER);
			const weight = uniforms.fades[c] > 0.5 ? fade : 1;
			dx += s[1] * chop * weight;
			dy += s[0] * weight;
			dz += s[2] * chop * weight;
		}
	}
	out[0] = dx;
	out[1] = dy;
	out[2] = dz;
	return out;
}

// Twin of the begin_vertex block: the patch-local position of one vertex.
export function displaceVertex(input, out = new Float64Array(3)) {
	const { localX, localZ, worldX, worldZ, axisX, axisZ, uniforms, skirtY } = input;
	out[0] = localX;
	out[1] = 0;
	out[2] = localZ;
	if (uniforms.displace <= 0.5) {
		return out;
	}
	const wx = worldX + localX;
	const wz = worldZ + localZ;
	if (Math.abs(wx - uniforms.innerX) < uniforms.innerHalf && Math.abs(wz - uniforms.innerZ) < uniforms.innerHalf) {
		out[1] = skirtY;
		return out;
	}
	if (axisX !== 0 || axisZ !== 0) {
		displacement(input, wx - axisX, wz - axisZ, A);
		displacement(input, wx + axisX, wz + axisZ, B);
		out[0] += 0.5 * (A[0] + B[0]);
		out[1] = 0.5 * (A[1] + B[1]);
		out[2] += 0.5 * (A[2] + B[2]);
		return out;
	}
	displacement(input, wx, wz, A);
	out[0] += A[0];
	out[1] = A[1];
	out[2] += A[2];
	return out;
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/ocean/engine/unleashedSurface.test.js && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean`
Expected: PASS: 4 tests, and the whole suite green. If a comparison fails, the twin is wrong, not the sampler: fix the twin (and the GLSL in Task 6 is written from this file, so it inherits the fix).

- [ ] **Step 5: Commit**

```bash
git add content/ocean/js/engine/unleashedSurface.js tests/ocean/engine/unleashedSurface.test.js
git commit -m "feat: the vertex shader's twin, proved against SurfaceSampler on every ring"
```

---

### Task 4: The pixel and foam shaders' twins, and the live settings they read

**Files:**
- Create: `content/ocean/js/engine/unleashedShading.js`
- Modify: `content/ocean/js/workers/painterWorkerCore.js` (export the four lace constants; nothing else changes)
- Test: `tests/ocean/engine/unleashedShading.test.js`

**Interfaces:**
- Consumes: Task 2 `cascadeSlots`, the fixture `heroFields`; A1 `core/waterColour.js` (`lut`), `core/foamPaint.js` (`band`, `lace`), `core/foamField.js` (`newGrid`, `sample`, `stepRows`), `core/peakMask.js` (`fill`), `core/scatterLobe.js` (`strength`), `core/cascade.js` (`sampleHeight`, `sampleJacobian`), `core/luau.js` (`clamp`, `color3`); A3 `ocean.live`, `ocean.parts`, `ocean.painter.mapsConfig`, `Ocean.configureStage`, `StageControl.DEFAULT_SETTINGS`.
- Produces:
  - `workers/painterWorkerCore.js`: `export const LACE_CELLS` (64), `LACE_SEED` (11), `LACE_OCTAVES` (4), `LACE_FALLOFF` (0.7), unchanged values.
  - `engine/unleashedShading.js`, used by Tasks 7 and 8:
    - `HARD_EDGE` (1e30), `MIN_GAMMA` (1e-3)
    - `footprintWeight(footprint, cell) -> number` (1 up to one cell a pixel, 0 from two)
    - `waterColourSrgb(height, peak, tint, deep: byte[3], subsurface: byte[3]) -> [r, g, b]` (sRGB 0..1)
    - `foamCoverage(sum, filament, { threshold, slope, laceSoft, opacity }) -> number`
    - `peakMask(height, coverage, maskMax, gamma) -> number` (0..1)
    - `scatterStrength(x, z, eye: [x, y, z], sun: [x, y, z], scatter) -> number`
    - `foamStepValue(previous, jxx, jzz, jxz, chop, { whitecap, grow, decay }) -> number`
    - `shadingSettings(ocean) -> ShadingSettings` (Conventions)

- [ ] **Step 1: Export the lace constants from `content/ocean/js/workers/painterWorkerCore.js`**

Replace

```js
const LACE_CELLS = 64;
const LACE_SEED = 11;
const LACE_OCTAVES = 4;
const LACE_FALLOFF = 0.7;
```

with

```js
// Exported for A4, whose GPU foam erodes its veil through the same lace (render/unleashedMaterials.js).
export const LACE_CELLS = 64;
export const LACE_SEED = 11;
export const LACE_OCTAVES = 4;
export const LACE_FALLOFF = 0.7;
```

- [ ] **Step 2: Write the failing tests**

`tests/ocean/engine/unleashedShading.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FoamField from '../../../content/ocean/js/core/foamField.js';
import * as FoamPaint from '../../../content/ocean/js/core/foamPaint.js';
import * as PeakMask from '../../../content/ocean/js/core/peakMask.js';
import * as ScatterLobe from '../../../content/ocean/js/core/scatterLobe.js';
import * as WaterColour from '../../../content/ocean/js/core/waterColour.js';
import { clamp, color3 } from '../../../content/ocean/js/core/luau.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { createInProcessWorker } from '../../../content/ocean/js/engine/inProcessWorker.js';
import * as Ocean from '../../../content/ocean/js/engine/ocean.js';
import * as StageControl from '../../../content/ocean/js/engine/stageControl.js';
import * as Shading from '../../../content/ocean/js/engine/unleashedShading.js';
import { createCascadeWorker } from '../../../content/ocean/js/workers/cascadeWorkerCore.js';
import { createPainterWorker, LACE_CELLS, LACE_FALLOFF, LACE_OCTAVES, LACE_SEED } from '../../../content/ocean/js/workers/painterWorkerCore.js';
import { heroFields } from './unleashedFixtures.js';

const DEEP = [8, 46, 72];
const SUBSURFACE = [28, 168, 156];
const bytes = (rgb) => color3(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);

test("the water colour is WaterColour's ramp without the LUT's byte steps", () => {
	const lut = WaterColour.lut(bytes(DEEP), bytes(SUBSURFACE));
	for (const height of [-20, -10.3, -3, 0, 2.5, 10.3, 30]) {
		const t = clamp((height / 10.3 + 1) * 0.5, 0, 1);
		const entry = Math.floor(0.35 * t * 255 + 0.5) * 3;
		const srgb = Shading.waterColourSrgb(height, 10.3, 0.35, DEEP, SUBSURFACE);
		for (let ch = 0; ch < 3; ch++) {
			expect.near(srgb[ch] * 255, lut[entry + ch], 1.01, `height ${height} channel ${ch}`);
		}
	}
	expect.near(Shading.waterColourSrgb(5, 0, 0.35, DEEP, SUBSURFACE)[0], (8 + (28 - 8) * 0.35 * 0.5) / 255, 1e-12, 'a peak of 0 reads as mid-ramp, as the CPU does');
});

test("foam coverage is FoamPaint.band's, texel for texel", () => {
	const field = FoamField.newGrid(256, 256);
	for (let k = 0; k < field.foam.length; k++) {
		field.foam[k] = k % 5 === 0 ? (Math.sin(k * 0.37) + 1) / 2 : 0.05 * (k % 3);
	}
	const lace = FoamPaint.lace(512, LACE_CELLS, LACE_SEED, LACE_OCTAVES, LACE_FALLOFF);
	const base = new Uint8Array(128 * 128 * 3);
	for (let k = 0; k < 128 * 128; k++) {
		base[k * 3] = 10;
		base[k * 3 + 1] = 50;
		base[k * 3 + 2] = 80;
	}
	const rows = 8;
	for (const laceSoft of [0.3, 0]) {
		const params = { threshold: 0, feather: 1.3, laceSoft, opacity: 0.7, r: 232, g: 228, b: 210 };
		const out = new Uint8Array(512 * rows * 4);
		FoamPaint.band(out, 512, 0, rows, base, 128, [field], 256, params, lace, null);
		let foamed = 0;
		for (let j = 0; j < rows; j++) {
			for (let i = 0; i < 512; i += 7) {
				const sum = FoamField.sample(field, (i + 0.5) * 0.5, (j + 0.5) * 0.5);
				const coverage = Shading.foamCoverage(sum, lace[j * 512 + i], { threshold: 0, slope: 1 / 1.3, laceSoft, opacity: 0.7 });
				if (coverage > 0.05) foamed += 1;
				const o = (j * 512 + i) * 4;
				expect.near(out[o], Math.floor(10 + (232 - 10) * coverage + 0.5), 1, `laceSoft ${laceSoft} texel (${i}, ${j}) red`);
				expect.near(out[o + 2], Math.floor(80 + (210 - 80) * coverage + 0.5), 1, `laceSoft ${laceSoft} texel (${i}, ${j}) blue`);
			}
		}
		expect.truthy(foamed > 20, `laceSoft ${laceSoft}: foam was painted (${foamed} texels)`);
	}
	expect.equal(Shading.foamCoverage(0.5, 0.9, { threshold: 0, slope: Shading.HARD_EDGE, laceSoft: 0, opacity: 0.7 }), 0.7, 'a hard edge is full foam above the threshold');
});

test("the peak mask is PeakMask's byte over 255, foam held down", () => {
	const fields = heroFields('High');
	const texels = 128;
	const out = new Uint8Array(texels * texels * 4);
	const mirror = { texels, foam: new Float32Array(texels * texels), scratch: new Float32Array(0) };
	for (let k = 0; k < mirror.foam.length; k++) mirror.foam[k] = (k % 11) / 20;
	PeakMask.fill(out, texels, 256, fields, [1, 2, 3], 9, 0.8, mirror);
	const scratch = new Float64Array(3);
	let lit = 0;
	for (let j = 0; j < texels; j += 9) {
		for (let i = 0; i < texels; i += 9) {
			let h = 0;
			for (const f of fields) h += Cascade.sampleHeight(f, (i + 0.5) * 2, (j + 0.5) * 2, scratch)[0];
			const value = Shading.peakMask(h, mirror.foam[j * texels + i], 9, 0.8);
			if (value > 0.1) lit += 1;
			expect.near(value * 255, out[(j * texels + i) * 4], 0.51, `texel (${i}, ${j})`);
		}
	}
	expect.truthy(lit > 5, `some crests lit (${lit})`);
	expect.equal(Shading.peakMask(4, 0, 0, 0.8), 0, 'no maximum yet: dark');
});

test('the per-pixel scatter term is ScatterLobe.strength', () => {
	const params = { strength: 30, viewPower: 3, facePower: 1 };
	const sun = [-0.9526530504226685, 0.2821884751319885, 0.11323313415050507];
	let glowing = 0;
	for (const [x, z] of [[0, -120], [-300, 5], [40, 40], [-1000, -2000], [0, 40]]) {
		for (const eye of [[0, 14, 40], [0, 110, 150], [25, 5, 25], [0, 40, 40]]) {
			const want = ScatterLobe.strength(x, z, eye[0], eye[1], eye[2], sun[0], sun[1], sun[2], params);
			const got = Shading.scatterStrength(x, z, eye, sun, params);
			if (want > 0) glowing += 1;
			expect.near(got, want, 1e-12, `(${x}, ${z}) seen from ${eye}`);
		}
	}
	expect.truthy(glowing > 3, 'the sun side glows somewhere');
	expect.equal(Shading.scatterStrength(0, 0, [0, 0, 0], sun, params), 0, 'a camera on the point: nothing');
	expect.equal(Shading.scatterStrength(-300, 5, [0, 14, 40], sun, { ...params, strength: 0 }), 0, 'strength 0: nothing');
});

test("one foam step is FoamField's rule", () => {
	const fields = heroFields('High');
	const texels = 128;
	const field = FoamField.newGrid(texels, 256);
	for (let k = 0; k < field.foam.length; k++) field.foam[k] = (k % 13) / 13;
	const previous = Float32Array.from(field.foam);
	const params = { whitecap: 0.35, grow: 2, decay: 0.86 };
	const chop = 1.2;
	FoamField.stepRows(field, 0, texels, fields, [1, 2, 3], 256, chop, params);
	const jacobian = new Float64Array(3);
	let grew = 0;
	for (let j = 0; j < texels; j++) {
		for (let i = 0; i < texels; i++) {
			let jxx = 0;
			let jzz = 0;
			let jxz = 0;
			for (const f of fields) {
				Cascade.sampleJacobian(f, i * 2, j * 2, jacobian);
				jxx += jacobian[0];
				jzz += jacobian[1];
				jxz += jacobian[2];
			}
			const k = j * texels + i;
			const value = Shading.foamStepValue(previous[k], jxx, jzz, jxz, chop, params);
			if (value > previous[k] * params.decay + 1e-6) grew += 1;
			expect.near(value, field.foam[k], 1e-6, `texel (${i}, ${j})`);
		}
	}
	expect.truthy(grew > 0, `some texels folded and grew foam (${grew})`);
});

test('footprintWeight keeps a cascade until a pixel spans one of its cells and drops it by two', () => {
	expect.equal(Shading.footprintWeight(0.1, 0.25), 1, 'fine pixel');
	expect.equal(Shading.footprintWeight(0.25, 0.25), 1, 'one cell');
	expect.near(Shading.footprintWeight(0.375, 0.25), 0.5, 1e-12, 'halfway');
	expect.equal(Shading.footprintWeight(0.5, 0.25), 0, 'two cells');
	expect.equal(Shading.footprintWeight(40, 4), 0, 'far away');
});

test('shadingSettings reads the live sea the sliders set (Review Focus 5)', () => {
	const ocean = Ocean.create(readConfig('?tier=Medium'), {
		spawnCascade: () => createInProcessWorker(createCascadeWorker),
		spawnPainter: () => createInProcessWorker(createPainterWorker),
		now: () => 0,
		log: { warn() {} },
	});
	const shipped = Shading.shadingSettings(ocean);
	expect.equal(shipped.shown.join(','), '1,1,0', 'both Medium cascades shown');
	expect.equal(shipped.chop, 0.8, 'the shipped chop');
	expect.equal(shipped.peak, 10.3, 'peak');
	expect.equal(shipped.tint, 0.35, 'tint');
	expect.equal(shipped.deep.join(','), DEEP.map((b) => b / 255).join(','), 'deep in 0..1');
	expect.near(shipped.foam.slope, 1 / 1.3, 1e-12, 'the feather as a slope');
	expect.equal(shipped.foam.opacity, 0.7, 'opacity');
	expect.equal(shipped.foam.on, true, 'foam on');
	expect.equal(shipped.glowOn, true, 'glow on');
	expect.equal(shipped.scatter.strength, 30, 'the shipped glow strength');
	expect.equal(shipped.ringRoughness.length, 5, 'one roughness per ring');
	Ocean.configureStage(ocean, {
		...StageControl.DEFAULT_SETTINGS,
		chop: 1.2,
		layers: [true, false, false],
		foamKnobs: { whitecap: 0.5, decay: 0.9 },
		glow: false,
		glowStrength: 12,
	});
	const moved = Shading.shadingSettings(ocean);
	expect.equal(moved.shown.join(','), '1,0,0', 'cascade 2 off');
	expect.equal(moved.chop, 1.2, 'chop');
	expect.equal(moved.foam.whitecap, 0.5, 'whitecap');
	expect.equal(moved.foam.decay, 0.9, 'decay');
	expect.equal(moved.glowOn, false, 'glow off');
	expect.equal(moved.scatter.strength, 12, 'glow strength');
	Ocean.configureStage(ocean, { ...StageControl.DEFAULT_SETTINGS, foam: false });
	expect.equal(Shading.shadingSettings(ocean).foam.on, false, 'foam off');
});
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `node --test tests/ocean/engine/unleashedShading.test.js`
Expected: FAIL: cannot find module `content/ocean/js/engine/unleashedShading.js`.

- [ ] **Step 4: Write `content/ocean/js/engine/unleashedShading.js`**

```js
// A4 (not a twin): the JavaScript twins of the Unleashed fragment and foam shaders
// (render/unleashedGlsl.js), each tested against the core module whose per-texel rule it moves to
// the GPU per pixel, and shadingSettings, the per-frame numbers those shaders read, taken from the
// same live state the painter and the glow pass read in Roblox mode (A3 keeps it live).
//   waterColourSrgb  WaterColour: deep tinted towards subsurface by height, without the LUT's steps
//   foamCoverage     FoamPaint.band: threshold, feather (smoothstep), lace erosion, opacity
//   peakMask         PeakMask: height above the mean surface under the foam, normalised, gamma
//   scatterStrength  ScatterLobe.strength, at the pixel instead of the patch centre
//   foamStepValue    FoamField.stepRows' rule, one texel
//   footprintWeight  (no CPU twin) drops a cascade from a pixel wider than two of its cells, the
//                    mipmapping that texelFetch does not do
import { clamp } from '../core/luau.js';
import { cascadeSlots } from './unleashedFields.js';

// FoamPaint's own: a feather of 0 is a hard edge, one slope any sum above the threshold saturates.
export const HARD_EDGE = 1e30;
// GLSL pow(0, y) is undefined for y <= 0; a gamma the URL set that low is lifted to this.
export const MIN_GAMMA = 1e-3;

export function footprintWeight(footprint, cell) {
	return clamp(2 - footprint / cell, 0, 1);
}

export function waterColourSrgb(height, peak, tint, deep, subsurface) {
	const inversePeak = peak > 0 ? 1 / peak : 0;
	const ramp = clamp((height * inversePeak + 1) * 0.5, 0, 1);
	const k = tint * ramp;
	return [0, 1, 2].map((ch) => (deep[ch] + (subsurface[ch] - deep[ch]) * k) / 255);
}

export function foamCoverage(sum, filament, { threshold, slope, laceSoft, opacity }) {
	const fade = clamp((sum - threshold) * slope, 0, 1);
	let density = fade * fade * (3 - 2 * fade);
	if (laceSoft > 0) {
		density = clamp((filament - (1 - density)) / laceSoft, 0, 1);
	}
	return density * opacity;
}

export function peakMask(height, coverage, maskMax, gamma) {
	if (!(maskMax > 0)) {
		return 0;
	}
	const magnitude = Math.max(height, 0) * (1 - coverage);
	return clamp(magnitude / maskMax, 0, 1) ** gamma;
}

// Written the way GLSL oceanScatter is: a vector, its length, a dot and two pows.
export function scatterStrength(x, z, eye, sun, scatter) {
	let vx = eye[0] - x;
	let vy = eye[1];
	let vz = eye[2] - z;
	const length = Math.sqrt(vx * vx + vy * vy + vz * vz);
	if (length === 0 || scatter.strength === 0) {
		return 0;
	}
	vx /= length;
	vy /= length;
	vz /= length;
	const towardSun = -(sun[0] * vx + sun[1] * vy + sun[2] * vz);
	if (towardSun <= 0) {
		return 0;
	}
	const viewTerm = Math.min(towardSun, 1) ** scatter.viewPower;
	const faceTerm = Math.max(0, 0.5 - 0.5 * sun[1]) ** scatter.facePower;
	return scatter.strength * viewTerm * faceTerm;
}

export function foamStepValue(previous, jxx, jzz, jxz, chop, { whitecap, grow, decay }) {
	const a = 1 + chop * jxx;
	const d = 1 + chop * jzz;
	const b = chop * jxz;
	const fold = a * d - b * b;
	return clamp(previous * decay + grow * Math.max(0, whitecap - fold), 0, 1);
}

/**
 * The numbers the Unleashed shaders read this frame (plan Conventions: ShadingSettings). The
 * painter's live config for the colour, foam and mask knobs (PainterClient.update keeps it current),
 * the ocean's live chop and glow, and the colour role's own clamps.
 */
export function shadingSettings(ocean) {
	const painter = ocean.painter.mapsConfig;
	const feather = painter.foamFeather;
	return Object.freeze({
		shown: cascadeSlots(painter.colourCascades),
		chop: ocean.live.chop,
		peak: painter.peak,
		tint: clamp(painter.tint, 0, 1),
		deep: ocean.config.deep.map((byte) => byte / 255),
		subsurface: ocean.config.subsurface.map((byte) => byte / 255),
		foam: Object.freeze({
			on: painter.foamEnabled,
			whitecap: painter.foamWhitecap,
			grow: painter.foamGrow,
			decay: painter.foamDecay,
			threshold: painter.foamThreshold,
			slope: feather > 0 ? 1 / feather : HARD_EDGE,
			laceSoft: painter.foamLace,
			opacity: clamp(painter.foamOpacity, 0, 1),
			colour: painter.foamColour.map((byte) => byte / 255),
			roughness: painter.foamRoughness,
		}),
		glowOn: ocean.parts.glow,
		scatter: ocean.live.scatter,
		gamma: Math.max(painter.gamma, MIN_GAMMA),
		ringRoughness: painter.ringRoughness,
	});
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `node --test tests/ocean/engine/unleashedShading.test.js && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean`
Expected: PASS: 7 tests, and the whole suite green (the painter tests prove the lace export changed nothing).

- [ ] **Step 6: Commit**

```bash
git add content/ocean/js/engine/unleashedShading.js content/ocean/js/workers/painterWorkerCore.js tests/ocean/engine/unleashedShading.test.js
git commit -m "feat: the pixel and foam shaders' twins, proved against the painter's own rules"
```

---

### Task 5: Choosing the path: support, stage gating and per-mode timings

**Files:**
- Create: `content/ocean/js/engine/unleashedSupport.js`, `content/ocean/js/engine/modeTimings.js`
- Test: `tests/ocean/engine/unleashedSupport.test.js`, `tests/ocean/engine/modeTimings.test.js`

**Interfaces:**
- Consumes: Task 1 `RENDER_PATHS` (`engine/ocean.js`).
- Produces, used by Task 7:
  - `engine/unleashedSupport.js`:
    - `RENDER_MODES` (the same frozen list as `RENDER_PATHS`), `checkMode(mode) -> mode` (throws `RangeError` naming both modes)
    - `supportFor({ maxVertexTextures, maxTextureSize, maxArrayLayers, colorBufferFloat, colorBufferHalfFloat, foamTexels, layers }) -> { ok, reason: string | null, foamType: 'half-float' | null }` (frozen)
    - `stageBlock({ source, lookMode, swellsSilent, calibrate }) -> string | null` (why this step cannot be drawn by Unleashed)
    - `decideMode({ requested, support, ready, block }) -> { effective, reason }` (frozen)
  - `engine/modeTimings.js`: `TIMING_WINDOW_FRAMES` (120), `HIDDEN_FRAME_MS` (1000), `createModeTimings(windowFrames = 120) -> { record(mode, { cpuMs, renderMs, frameMs }), snapshot() -> { roblox, unleashed, skipped } }` (each mode `null` or frozen `{ frames, cpuMs, renderMs, frameMs, fps }`).

- [ ] **Step 1: Write the failing tests**

`tests/ocean/engine/unleashedSupport.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Support from '../../../content/ocean/js/engine/unleashedSupport.js';

const GOOD = Object.freeze({
	maxVertexTextures: 16,
	maxTextureSize: 16384,
	maxArrayLayers: 2048,
	colorBufferFloat: true,
	colorBufferHalfFloat: false,
	foamTexels: 1024,
	layers: 6,
});

test('a WebGL 2 GPU with float render targets runs Unleashed', () => {
	expect.equal(Support.supportFor(GOOD).ok, true, 'ok');
	expect.equal(Support.supportFor(GOOD).foamType, 'half-float', 'the foam target type');
	expect.equal(Support.supportFor({ ...GOOD, colorBufferFloat: false, colorBufferHalfFloat: true }).ok, true, 'half-float alone is enough');
});

test('a GPU without what Unleashed needs is refused with a reason (Review Focus 2)', () => {
	const cases = [
		[{ maxVertexTextures: 0 }, 'vertex'],
		[{ colorBufferFloat: false, colorBufferHalfFloat: false }, 'floating-point'],
		[{ maxTextureSize: 512 }, '1024'],
		[{ maxArrayLayers: 4 }, 'layers'],
		[{ maxVertexTextures: undefined }, 'vertex'],
	];
	for (const [change, word] of cases) {
		const support = Support.supportFor({ ...GOOD, ...change });
		expect.equal(support.ok, false, `refused: ${JSON.stringify(change)}`);
		expect.equal(support.foamType, null, 'no foam type');
		expect.truthy(support.reason.includes(word), `the reason names it: ${support.reason}`);
	}
});

test('Unleashed draws only the painted FFT sea (Review Focus 3)', () => {
	const finale = { source: 'fft', lookMode: 'painted', swellsSilent: true, calibrate: null };
	expect.equal(Support.stageBlock(finale), null, 'the finale and the page without ?step');
	expect.truthy(Support.stageBlock({ ...finale, source: 'waves' }).includes('teaching waves'), 'steps 1 to 6');
	expect.truthy(Support.stageBlock({ ...finale, lookMode: 'white' }).includes('white'), 'the white plane');
	expect.truthy(Support.stageBlock({ ...finale, lookMode: 'sea-lit' }).includes('sea-lit'), 'the lit Gerstner sea');
	expect.truthy(Support.stageBlock({ ...finale, swellsSilent: false }).includes('swells'), 'swells on by URL');
	expect.truthy(Support.stageBlock({ ...finale, calibrate: 'map' }).includes('calibration'), 'a calibration view');
});

test('the effective mode: unsupported, then the stage, then the shaders, then Unleashed (Review Focus 1)', () => {
	const ok = Support.supportFor(GOOD);
	const no = Support.supportFor({ ...GOOD, maxVertexTextures: 0 });
	const decide = (over) => Support.decideMode({ requested: 'unleashed', support: ok, ready: true, block: null, ...over });
	expect.equal(decide({}).effective, 'unleashed', 'everything ready');
	expect.equal(decide({}).reason, null, 'no reason');
	expect.equal(decide({ requested: 'roblox' }).effective, 'roblox', 'Roblox asked for');
	expect.equal(decide({ requested: 'roblox', support: no, block: 'x' }).reason, null, 'nothing to explain when Roblox is asked for');
	expect.equal(decide({ support: no }).effective, 'roblox', 'unsupported');
	expect.truthy(decide({ support: no }).reason.startsWith('not available here:'), 'unsupported reason');
	expect.equal(decide({ block: 'this step draws teaching waves' }).reason, 'this step draws teaching waves', 'the stage');
	expect.equal(decide({ ready: false }).effective, 'roblox', 'still compiling');
	expect.equal(decide({ ready: false }).reason, 'preparing the shaders', 'compiling reason');
	expect.equal(decide({ ready: false, block: 'b' }).reason, 'b', 'the stage is named before the compile');
});

test('a mode the page does not have is refused', () => {
	expect.equal(Support.checkMode('unleashed'), 'unleashed', 'passes through');
	let message = '';
	try {
		Support.checkMode('gpu');
	} catch (error) {
		message = `${error.name}: ${error.message}`;
	}
	expect.truthy(message.startsWith('RangeError') && message.includes('roblox, unleashed'), message);
	expect.equal(Support.RENDER_MODES.join(','), 'roblox,unleashed', 'the list');
});
```

`tests/ocean/engine/modeTimings.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import { createModeTimings, HIDDEN_FRAME_MS, TIMING_WINDOW_FRAMES } from '../../../content/ocean/js/engine/modeTimings.js';

test('each mode keeps its own means, and a mode not drawn yet reads null', () => {
	const timings = createModeTimings();
	expect.equal(timings.snapshot().roblox, null, 'nothing yet');
	timings.record('roblox', { cpuMs: 4, renderMs: 2, frameMs: 16 });
	timings.record('roblox', { cpuMs: 6, renderMs: 2, frameMs: 17 });
	timings.record('unleashed', { cpuMs: 1, renderMs: 3, frameMs: 20 });
	const snap = timings.snapshot();
	expect.equal(snap.roblox.frames, 2, 'two Roblox frames');
	expect.equal(snap.roblox.cpuMs, 5, 'cpu mean');
	expect.equal(snap.roblox.frameMs, 16.5, 'frame mean');
	expect.near(snap.roblox.fps, 1000 / 16.5, 1e-9, 'fps from the frame interval');
	expect.equal(snap.unleashed.cpuMs, 1, 'Unleashed on its own');
	expect.equal(snap.skipped, 0, 'nothing skipped');
});

test('the window rolls, and a hidden tab is left out', () => {
	const timings = createModeTimings();
	for (let i = 0; i < TIMING_WINDOW_FRAMES + 10; i++) {
		timings.record('roblox', { cpuMs: i < 10 ? 100 : 1, renderMs: 1, frameMs: 16 });
	}
	expect.equal(timings.snapshot().roblox.frames, TIMING_WINDOW_FRAMES, 'the window');
	expect.equal(timings.snapshot().roblox.cpuMs, 1, 'the oldest frames dropped');
	timings.record('roblox', { cpuMs: 1, renderMs: 1, frameMs: HIDDEN_FRAME_MS + 1 });
	expect.equal(timings.snapshot().skipped, 1, 'a frame over a second is counted, not averaged');
	expect.equal(timings.snapshot().roblox.frameMs, 16, 'and not averaged');
});

test('a bad sample or mode is refused', () => {
	const timings = createModeTimings();
	for (const bad of [{ cpuMs: Number.NaN, renderMs: 1, frameMs: 1 }, { cpuMs: 1, renderMs: -1, frameMs: 1 }, { cpuMs: 1, renderMs: 1 }]) {
		let threw = false;
		try {
			timings.record('roblox', bad);
		} catch (error) {
			threw = error instanceof RangeError;
		}
		expect.truthy(threw, `refused ${JSON.stringify(bad)}`);
	}
	let threw = false;
	try {
		timings.record('webgpu', { cpuMs: 1, renderMs: 1, frameMs: 1 });
	} catch (error) {
		threw = error instanceof RangeError;
	}
	expect.truthy(threw, 'unknown mode refused');
	expect.equal(timings.snapshot().roblox, null, 'nothing recorded');
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/ocean/engine/unleashedSupport.test.js tests/ocean/engine/modeTimings.test.js`
Expected: FAIL: cannot find the two modules.

- [ ] **Step 3: Write `content/ocean/js/engine/unleashedSupport.js`**

```js
// A4 (not a twin): whether Unleashed can draw, and whether it may draw this step. Three questions,
// asked in this order by decideMode:
//   1. can this GPU run it at all (supportFor): vertex texture units for the displacement, a
//      renderable float format for the foam targets, textures and array layers big enough;
//   2. does this story step have the painted FFT sea Unleashed replaces (stageBlock): the teaching
//      waves, the white plane and the Gerstner looks are Roblox mode's own and stay as they are;
//   3. are its shaders compiled yet (`ready`), so the switch never stalls a frame on a compile.
// The request is kept whatever the answer, so Unleashed comes back when the story returns to it.
import { RENDER_PATHS } from './ocean.js';

export const RENDER_MODES = RENDER_PATHS;

export function checkMode(mode) {
	if (!RENDER_MODES.includes(mode)) {
		throw new RangeError(`render mode must be one of ${RENDER_MODES.join(', ')}, got ${JSON.stringify(mode)}`);
	}
	return mode;
}

const refuse = (reason) => Object.freeze({ ok: false, reason, foamType: null });

export function supportFor({ maxVertexTextures, maxTextureSize, maxArrayLayers, colorBufferFloat, colorBufferHalfFloat, foamTexels, layers }) {
	if (!(maxVertexTextures >= 1)) {
		return refuse(`this GPU gives vertex shaders no texture units (MAX_VERTEX_TEXTURE_IMAGE_UNITS ${maxVertexTextures}), and Unleashed displaces the sea in one`);
	}
	if (!colorBufferFloat && !colorBufferHalfFloat) {
		return refuse('this GPU cannot render into floating-point textures (no EXT_color_buffer_float or EXT_color_buffer_half_float), which the foam field needs');
	}
	if (!(maxTextureSize >= foamTexels)) {
		return refuse(`the foam field needs ${foamTexels}-texel textures and this GPU stops at ${maxTextureSize}`);
	}
	if (!(maxArrayLayers >= layers)) {
		return refuse(`the wave fields need ${layers} texture array layers and this GPU allows ${maxArrayLayers}`);
	}
	return Object.freeze({ ok: true, reason: null, foamType: 'half-float' });
}

export function stageBlock({ source, lookMode, swellsSilent, calibrate }) {
	if (calibrate) {
		return 'the calibration views draw Roblox mode only';
	}
	if (source !== 'fft') {
		return 'this step draws teaching waves, which Unleashed does not replace';
	}
	if (lookMode !== 'painted') {
		return `this step's look is ${lookMode}; Unleashed replaces the painted sea only`;
	}
	if (!swellsSilent) {
		return 'the swells are on (?swellScale), and Unleashed draws the FFT sea without them';
	}
	return null;
}

export function decideMode({ requested, support, ready, block }) {
	if (requested === 'roblox') {
		return Object.freeze({ effective: 'roblox', reason: null });
	}
	if (!support.ok) {
		return Object.freeze({ effective: 'roblox', reason: `not available here: ${support.reason}` });
	}
	if (block) {
		return Object.freeze({ effective: 'roblox', reason: block });
	}
	if (!ready) {
		return Object.freeze({ effective: 'roblox', reason: 'preparing the shaders' });
	}
	return Object.freeze({ effective: 'unleashed', reason: null });
}
```

- [ ] **Step 4: Write `content/ocean/js/engine/modeTimings.js`**

```js
// A4 (not a twin): the live numbers behind the finale's toggle, one set per render mode. Each frame
// the page records what it measured in the mode that drew it: main-thread milliseconds from the
// engine step through the render preparation (cpuMs), the view.render() call (renderMs, the CPU
// side of the submission; the GPU's own time is not measured) and the frame interval (frameMs). A
// snapshot is the mean of each over the last TIMING_WINDOW_FRAMES frames in that mode, so after a
// toggle both modes still have numbers to show side by side. A frame longer than HIDDEN_FRAME_MS
// is a hidden tab or a debugger pause, not a measurement: it is counted in `skipped` and left out.
import { checkMode } from './unleashedSupport.js';

export const TIMING_WINDOW_FRAMES = 120;
export const HIDDEN_FRAME_MS = 1000;
const FIELDS = Object.freeze(['cpuMs', 'renderMs', 'frameMs']);

function summary(list) {
	if (list.length === 0) {
		return null;
	}
	const mean = (name) => list.reduce((sum, sample) => sum + sample[name], 0) / list.length;
	const frameMs = mean('frameMs');
	return Object.freeze({
		frames: list.length,
		cpuMs: mean('cpuMs'),
		renderMs: mean('renderMs'),
		frameMs,
		fps: frameMs > 0 ? 1000 / frameMs : null,
	});
}

export function createModeTimings(windowFrames = TIMING_WINDOW_FRAMES) {
	const samples = { roblox: [], unleashed: [] };
	let skipped = 0;
	return {
		record(mode, sample) {
			checkMode(mode);
			for (const name of FIELDS) {
				const value = sample?.[name];
				if (!Number.isFinite(value) || value < 0) {
					throw new RangeError(`mode timings: ${name} must be a finite time of at least 0 ms, got ${value}`);
				}
			}
			if (sample.frameMs > HIDDEN_FRAME_MS) {
				skipped += 1;
				return;
			}
			const list = samples[mode];
			list.push({ cpuMs: sample.cpuMs, renderMs: sample.renderMs, frameMs: sample.frameMs });
			if (list.length > windowFrames) {
				list.shift();
			}
		},
		snapshot() {
			return Object.freeze({ roblox: summary(samples.roblox), unleashed: summary(samples.unleashed), skipped });
		},
	};
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `node --test tests/ocean/engine/unleashedSupport.test.js tests/ocean/engine/modeTimings.test.js && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean`
Expected: PASS: 5 support and 3 timing tests, and the whole suite green.

- [ ] **Step 6: Commit**

```bash
git add content/ocean/js/engine/unleashedSupport.js content/ocean/js/engine/modeTimings.js tests/ocean/engine/unleashedSupport.test.js tests/ocean/engine/modeTimings.test.js
git commit -m "feat: which renderer may draw, and live timings kept per render mode"
```

---

### Task 6: The Unleashed shaders and the patch that splices them in

**Files:**
- Create: `content/ocean/js/render/unleashedGlsl.js` (browser-free: no imports)
- Test: `tests/ocean/engine/unleashedGlsl.test.js` (in `engine/` so `ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean` runs it; it tests a browser-free render file)

**Interfaces:**
- Consumes: nothing at run time. The GLSL is transcribed from the Task 2 to 4 twins, function by function: `oceanField` from `sampleLayers`, `oceanDisplace` and the `begin_vertex` block from `displaceVertex`, the surface block from `footprintWeight`, `foamCoverage` and `waterColourSrgb`, the emissive block from `peakMask` and `scatterStrength`, the foam step from `foamStepValue`.
- Produces (`render/unleashedGlsl.js`), used by Tasks 7 and 8:
  - `PROGRAM_KEY` (`'ocean-unleashed-1'`)
  - GLSL strings: `FIELDS_GLSL`, `VERTEX_PARS`, `VERTEX_BEGIN`, `FRAGMENT_PARS`, `FRAGMENT_SURFACE`, `FRAGMENT_ROUGHNESS`, `FRAGMENT_NORMAL`, `FRAGMENT_EMISSIVE`, `FULLSCREEN_VERTEX`, `FOAM_STEP_FRAGMENT`, `FOAM_PROBE_FRAGMENT`
  - `MATERIAL_UNIFORMS`, `FOAM_UNIFORMS` (frozen name lists; exactly the uniforms the material shaders and the foam step declare)
  - `PATCH_ANCHORS` (frozen `[stage, anchor]` pairs)
  - `patchStandardShader(shader: { vertexShader, fragmentShader }) -> shader` (checks every anchor first and throws naming the missing one, leaving the shader untouched; then replaces each anchor once)
  - `declaredUniforms(glsl: string) -> string[]` (the names of every `uniform` declaration, in order)
  - Shaders need `#define OCEAN_CASCADES <count>` (the materials and the foam pass set it through `defines`).

- [ ] **Step 1: Write the failing tests**

`tests/ocean/engine/unleashedGlsl.test.js`:

```js
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Glsl from '../../../content/ocean/js/render/unleashedGlsl.js';

// The shape of three@0.186.1's meshphysical templates where the anchors sit.
function fakeStandardShader() {
	return {
		vertexShader: '#define STANDARD\n#include <common>\nvoid main() {\n\t#include <beginnormal_vertex>\n\t#include <begin_vertex>\n\t#include <project_vertex>\n}',
		fragmentShader:
			'#define STANDARD\n#include <common>\nvoid main() {\n\t#include <map_fragment>\n\t#include <color_fragment>\n\t#include <roughnessmap_fragment>\n\t#include <normal_fragment_begin>\n\t#include <normal_fragment_maps>\n\t#include <emissivemap_fragment>\n}',
	};
}

const count = (text, part) => text.split(part).length - 1;

test('the patch replaces every anchor once and keeps the template around it', () => {
	const shader = Glsl.patchStandardShader(fakeStandardShader());
	for (const [stage, anchor] of Glsl.PATCH_ANCHORS) {
		const expected = anchor === '#include <common>' ? 1 : 0;
		expect.equal(count(shader[stage], anchor), expected, `${stage}: ${anchor}`);
	}
	expect.truthy(shader.vertexShader.includes('vec3 oceanDisplace( vec2 w )'), 'the displacement function');
	expect.truthy(shader.vertexShader.includes('vLattice = oceanWorld;'), 'the lattice varying');
	expect.truthy(shader.vertexShader.includes('#include <project_vertex>'), 'the rest of the template kept');
	expect.truthy(shader.fragmentShader.includes('float oceanCoverage'), 'the surface block');
	expect.truthy(shader.fragmentShader.includes('float roughnessFactor = uBaseRoughness'), 'the roughness');
	expect.truthy(shader.fragmentShader.includes('normal = normalize( ( viewMatrix * vec4( oceanNormal, 0.0 ) ).xyz );'), 'the normal');
	expect.truthy(shader.fragmentShader.includes('totalEmissiveRadiance = uGlowColour'), 'the glow');
	expect.truthy(shader.fragmentShader.includes('#include <color_fragment>'), 'the colour chunk kept');
	expect.truthy(shader.fragmentShader.indexOf('float oceanCoverage') < shader.fragmentShader.indexOf('float roughnessFactor'), 'coverage is worked out before the roughness reads it');
});

test('a template without an anchor is refused, naming it, and left as it was', () => {
	const shader = fakeStandardShader();
	shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '');
	const before = { ...shader };
	let message = '';
	try {
		Glsl.patchStandardShader(shader);
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('#include <normal_fragment_maps>') && message.includes('0.186.1'), message);
	expect.equal(shader.vertexShader, before.vertexShader, 'nothing half-patched');
	expect.equal(shader.fragmentShader, before.fragmentShader, 'nothing half-patched');
});

test('every uniform the shaders declare is in the lists the materials bind, and nothing else', () => {
	const material = [Glsl.FIELDS_GLSL, Glsl.VERTEX_PARS, Glsl.FRAGMENT_PARS].map(Glsl.declaredUniforms).flat();
	expect.equal([...new Set(material)].sort().join(','), [...Glsl.MATERIAL_UNIFORMS].sort().join(','), 'material uniforms');
	const foam = Glsl.declaredUniforms(Glsl.FOAM_STEP_FRAGMENT);
	expect.equal([...new Set(foam)].sort().join(','), [...Glsl.FOAM_UNIFORMS].sort().join(','), 'foam uniforms');
	expect.equal(Glsl.declaredUniforms('uniform highp sampler2DArray uA;\nuniform vec3 uB;').join(','), 'uA,uB', 'precision qualifiers');
});

test('the shaders use the per-cascade loop and no name GLSL ES reserves', () => {
	const all = [Glsl.FIELDS_GLSL, Glsl.VERTEX_PARS, Glsl.VERTEX_BEGIN, Glsl.FRAGMENT_PARS, Glsl.FRAGMENT_SURFACE, Glsl.FRAGMENT_EMISSIVE, Glsl.FOAM_STEP_FRAGMENT, Glsl.FOAM_PROBE_FRAGMENT].join('\n');
	expect.truthy(Glsl.VERTEX_PARS.includes('c < OCEAN_CASCADES'), 'the vertex loop');
	expect.truthy(Glsl.FRAGMENT_SURFACE.includes('c < OCEAN_CASCADES'), 'the fragment loop');
	expect.truthy(Glsl.FOAM_STEP_FRAGMENT.includes('c < OCEAN_CASCADES'), 'the foam loop');
	for (const word of ['half', 'sample', 'filter', 'input', 'output', 'distance']) {
		expect.truthy(!new RegExp(`\\b(float|vec2|vec3|vec4|int) ${word}\\b`).test(all), `no variable named ${word}`);
	}
	expect.truthy(!all.includes('${'), 'no template placeholders left in the GLSL');
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `node --test tests/ocean/engine/unleashedGlsl.test.js`
Expected: FAIL: cannot find module `content/ocean/js/render/unleashedGlsl.js`.

- [ ] **Step 3: Write `content/ocean/js/render/unleashedGlsl.js`**

```js
// A4 (not a twin): the Unleashed shaders, as strings, and the patch that splices them into
// three@0.186.1's MeshStandardMaterial (meshphysical template). No imports, so the patch and the
// uniform lists are tested in Node; the page compiles them. Every function has a JavaScript twin
// in engine/ that is tested against the core module the Roblox path uses:
//   oceanField                        engine/unleashedFields.js  sampleLayers
//   oceanDisplace, VERTEX_BEGIN       engine/unleashedSurface.js displaceVertex
//   FRAGMENT_SURFACE                  engine/unleashedShading.js footprintWeight, foamCoverage,
//                                     waterColourSrgb
//   FRAGMENT_EMISSIVE, oceanScatter   engine/unleashedShading.js peakMask, scatterStrength
//   FOAM_STEP_FRAGMENT                engine/unleashedShading.js foamStepValue
// A change to one side is a change to both. Everything else about the light -- the sun, the sky
// light, the environment reflections and their Fresnel, fog, tone mapping -- is the standard
// material's own, so Roblox mode and Unleashed are lit by the same Three.js lighting.
// Cascade slot c (0-based) is Luau cascade c + 1; OCEAN_CASCADES is defined by the material.

export const PROGRAM_KEY = 'ocean-unleashed-1';

// The blended fields, one sampler2DArray: layer 2c holds cascade c + 1's height, dispX, dispZ and
// slopeX, layer 2c + 1 its slopeZ, jxx, jzz and jxz, n x n texels each. Read with texelFetch and
// weighted by hand with Cascade's own wrap: no float filtering is needed.
export const FIELDS_GLSL = /* glsl */ `
uniform highp sampler2DArray uFields;
uniform float uFieldN;
uniform vec3 uFieldSizes;

vec4 oceanField( int layer, float size, vec2 w ) {
	float n = uFieldN;
	vec2 uv = mod( w / size * n, n );
	uv -= n * step( vec2( n ), uv );
	vec2 cell = floor( uv );
	vec2 f = uv - cell;
	vec2 next = mod( cell + 1.0, n );
	ivec2 c0 = ivec2( cell );
	ivec2 c1 = ivec2( next );
	vec4 t00 = texelFetch( uFields, ivec3( c0.x, c0.y, layer ), 0 );
	vec4 t10 = texelFetch( uFields, ivec3( c1.x, c0.y, layer ), 0 );
	vec4 t01 = texelFetch( uFields, ivec3( c0.x, c1.y, layer ), 0 );
	vec4 t11 = texelFetch( uFields, ivec3( c1.x, c1.y, layer ), 0 );
	return t00 * ( ( 1.0 - f.x ) * ( 1.0 - f.y ) ) + t10 * ( f.x * ( 1.0 - f.y ) ) + t01 * ( ( 1.0 - f.x ) * f.y ) + t11 * ( f.x * f.y );
}
`;

export const VERTEX_PARS = /* glsl */ `
attribute vec2 seamAxis;
uniform float uDisplace;
uniform vec3 uRingSampled;
uniform vec3 uRingFades;
uniform vec2 uFocus;
uniform float uFadeEdge;
uniform float uFadeWidth;
uniform vec2 uInnerCentre;
uniform float uInnerHalf;
uniform float uSkirtY;
uniform float uChop;
varying vec2 vLattice;

vec3 oceanDisplace( vec2 w ) {
	float reach = max( abs( w.x - uFocus.x ), abs( w.y - uFocus.y ) );
	float fade = clamp( ( uFadeEdge - reach ) / uFadeWidth, 0.0, 1.0 );
	vec3 d = vec3( 0.0 );
	for ( int c = 0; c < OCEAN_CASCADES; c ++ ) {
		if ( uRingSampled[ c ] > 0.5 ) {
			vec4 s = oceanField( 2 * c, uFieldSizes[ c ], w );
			float weight = uRingFades[ c ] > 0.5 ? fade : 1.0;
			d += vec3( s.y * uChop, s.x, s.z * uChop ) * weight;
		}
	}
	return d;
}
`;

// Replaces <begin_vertex>: the lattice point displaced as SurfaceSampler.fill would write it.
export const VERTEX_BEGIN = /* glsl */ `
vec3 transformed = vec3( position );
vec2 oceanWorld = ( modelMatrix * vec4( position, 1.0 ) ).xz;
vLattice = oceanWorld;
if ( uDisplace > 0.5 ) {
	if ( abs( oceanWorld.x - uInnerCentre.x ) < uInnerHalf && abs( oceanWorld.y - uInnerCentre.y ) < uInnerHalf ) {
		transformed.y = uSkirtY;
	} else if ( dot( seamAxis, seamAxis ) > 0.0 ) {
		transformed += 0.5 * ( oceanDisplace( oceanWorld - seamAxis ) + oceanDisplace( oceanWorld + seamAxis ) );
	} else {
		transformed += oceanDisplace( oceanWorld );
	}
}
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif
`;

export const FRAGMENT_PARS = /* glsl */ `
varying vec2 vLattice;
uniform vec3 uShown;
uniform float uPeak;
uniform float uTint;
uniform vec3 uDeep;
uniform vec3 uSubsurface;
uniform sampler2D uFoam;
uniform float uFoamTexels;
uniform float uTile;
uniform sampler2D uLace;
uniform float uFoamOn;
uniform float uFoamThreshold;
uniform float uFoamSlope;
uniform float uLaceSoft;
uniform float uFoamOpacity;
uniform vec3 uFoamColour;
uniform float uBaseRoughness;
uniform float uFoamRoughness;
uniform vec3 uSun;
uniform vec3 uScatter;
uniform float uGlowOn;
uniform float uMaskMax;
uniform float uMaskGamma;
uniform vec3 uGlowColour;
uniform float uEmissiveScale;

float oceanFootprintWeight( float footprint, float cell ) {
	return clamp( 2.0 - footprint / cell, 0.0, 1.0 );
}

float oceanScatter( vec2 w ) {
	vec3 v = vec3( cameraPosition.x - w.x, cameraPosition.y, cameraPosition.z - w.y );
	float len = length( v );
	if ( len == 0.0 || uScatter.x == 0.0 ) return 0.0;
	v /= len;
	float towardSun = - dot( uSun, v );
	if ( towardSun <= 0.0 ) return 0.0;
	float viewTerm = pow( min( towardSun, 1.0 ), uScatter.y );
	float faceTerm = pow( max( 0.0, 0.5 - 0.5 * uSun.y ), uScatter.z );
	return uScatter.x * viewTerm * faceTerm;
}
`;

// Replaces <map_fragment>: the pixel's own height and slopes from every shown cascade (a cascade
// fades out of a pixel wider than two of its cells), the foam over it, and the water colour.
export const FRAGMENT_SURFACE = /* glsl */ `
float oceanFootprint = max( length( dFdx( vLattice ) ), length( dFdy( vLattice ) ) );
float oceanHeight = 0.0;
vec2 oceanSlope = vec2( 0.0 );
for ( int c = 0; c < OCEAN_CASCADES; c ++ ) {
	if ( uShown[ c ] > 0.5 ) {
		float cascadeSize = uFieldSizes[ c ];
		float weight = oceanFootprintWeight( oceanFootprint, cascadeSize / uFieldN );
		if ( weight > 0.0 ) {
			vec4 first = oceanField( 2 * c, cascadeSize, vLattice );
			vec4 second = oceanField( 2 * c + 1, cascadeSize, vLattice );
			oceanHeight += first.x * weight;
			oceanSlope += vec2( first.w, second.x ) * weight;
		}
	}
}
float oceanCoverage = 0.0;
if ( uFoamOn > 0.5 ) {
	float foamSum = texture2D( uFoam, vLattice / uTile + 0.5 / uFoamTexels ).r;
	float foamFade = clamp( ( foamSum - uFoamThreshold ) * uFoamSlope, 0.0, 1.0 );
	float density = foamFade * foamFade * ( 3.0 - 2.0 * foamFade );
	if ( uLaceSoft > 0.0 ) {
		float filament = texture2D( uLace, vLattice / uTile ).r;
		density = clamp( ( filament - ( 1.0 - density ) ) / uLaceSoft, 0.0, 1.0 );
	}
	oceanCoverage = density * uFoamOpacity;
}
float oceanInversePeak = uPeak > 0.0 ? 1.0 / uPeak : 0.0;
float oceanRamp = clamp( ( oceanHeight * oceanInversePeak + 1.0 ) * 0.5, 0.0, 1.0 );
vec3 oceanWater = mix( uDeep, uSubsurface, uTint * oceanRamp );
vec3 oceanSrgb = mix( oceanWater, uFoamColour, oceanCoverage );
diffuseColor.rgb *= sRGBTransferEOTF( vec4( oceanSrgb, 1.0 ) ).rgb;
`;

// Replaces <roughnessmap_fragment>: FoamRoughness's lift, per pixel.
export const FRAGMENT_ROUGHNESS = /* glsl */ `
float roughnessFactor = uBaseRoughness + oceanCoverage * ( uFoamRoughness - uBaseRoughness );
`;

// Replaces <normal_fragment_maps>: the slopes' normal in world space, into view space.
export const FRAGMENT_NORMAL = /* glsl */ `
vec3 oceanNormal = normalize( vec3( - oceanSlope.x, 1.0, - oceanSlope.y ) );
normal = normalize( ( viewMatrix * vec4( oceanNormal, 0.0 ) ).xyz );
`;

// Replaces <emissivemap_fragment>: the peak mask from this pixel's height under its foam, times the
// scatter lobe at this pixel, on Roblox mode's emissive scale.
export const FRAGMENT_EMISSIVE = /* glsl */ `
totalEmissiveRadiance = vec3( 0.0 );
if ( uGlowOn > 0.5 && uMaskMax > 0.0 ) {
	float oceanMagnitude = max( oceanHeight, 0.0 ) * ( 1.0 - oceanCoverage );
	float oceanMask = pow( clamp( oceanMagnitude / uMaskMax, 0.0, 1.0 ), uMaskGamma );
	totalEmissiveRadiance = uGlowColour * ( oceanMask * oceanScatter( vLattice ) * uEmissiveScale );
}
`;

// The foam passes draw one quad over the whole target.
export const FULLSCREEN_VERTEX = /* glsl */ `
void main() {
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

// One step of FoamField's rule at every texel: texel (i, j) sits AT world (i, j) * tile / texels.
export const FOAM_STEP_FRAGMENT = /* glsl */ `${FIELDS_GLSL}
uniform sampler2D uPrevious;
uniform vec3 uShown;
uniform float uTexels;
uniform float uTile;
uniform float uChop;
uniform float uWhitecap;
uniform float uGrow;
uniform float uDecay;

void main() {
	ivec2 texel = ivec2( gl_FragCoord.xy );
	vec2 w = vec2( texel ) * ( uTile / uTexels );
	float previous = texelFetch( uPrevious, texel, 0 ).r;
	vec3 j = vec3( 0.0 );
	for ( int c = 0; c < OCEAN_CASCADES; c ++ ) {
		if ( uShown[ c ] > 0.5 ) {
			j += oceanField( 2 * c + 1, uFieldSizes[ c ], w ).yzw;
		}
	}
	float a = 1.0 + uChop * j.x;
	float d = 1.0 + uChop * j.y;
	float b = uChop * j.z;
	float fold = a * d - b * b;
	gl_FragColor = vec4( clamp( previous * uDecay + uGrow * max( 0.0, uWhitecap - fold ), 0.0, 1.0 ), 0.0, 0.0, 1.0 );
}
`;

// A test probe: fragment k reads the foam texel whose coordinates sit in texel k of uPoints.
export const FOAM_PROBE_FRAGMENT = /* glsl */ `
uniform highp sampler2D uPoints;
uniform sampler2D uFoam;

void main() {
	vec2 point = texelFetch( uPoints, ivec2( int( gl_FragCoord.x ), 0 ), 0 ).xy;
	gl_FragColor = vec4( texelFetch( uFoam, ivec2( point ), 0 ).r, 0.0, 0.0, 1.0 );
}
`;

export const MATERIAL_UNIFORMS = Object.freeze([
	'uFields', 'uFieldN', 'uFieldSizes',
	'uDisplace', 'uRingSampled', 'uRingFades', 'uFocus', 'uFadeEdge', 'uFadeWidth', 'uInnerCentre', 'uInnerHalf', 'uSkirtY', 'uChop',
	'uShown', 'uPeak', 'uTint', 'uDeep', 'uSubsurface',
	'uFoam', 'uFoamTexels', 'uTile', 'uLace', 'uFoamOn', 'uFoamThreshold', 'uFoamSlope', 'uLaceSoft', 'uFoamOpacity', 'uFoamColour',
	'uBaseRoughness', 'uFoamRoughness',
	'uSun', 'uScatter', 'uGlowOn', 'uMaskMax', 'uMaskGamma', 'uGlowColour', 'uEmissiveScale',
]);

export const FOAM_UNIFORMS = Object.freeze(['uFields', 'uFieldN', 'uFieldSizes', 'uPrevious', 'uShown', 'uTexels', 'uTile', 'uChop', 'uWhitecap', 'uGrow', 'uDecay']);

const PATCHES = Object.freeze([
	Object.freeze(['vertexShader', '#include <common>', `#include <common>\n${FIELDS_GLSL}\n${VERTEX_PARS}`]),
	Object.freeze(['vertexShader', '#include <begin_vertex>', VERTEX_BEGIN]),
	Object.freeze(['fragmentShader', '#include <common>', `#include <common>\n${FIELDS_GLSL}\n${FRAGMENT_PARS}`]),
	Object.freeze(['fragmentShader', '#include <map_fragment>', FRAGMENT_SURFACE]),
	Object.freeze(['fragmentShader', '#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS]),
	Object.freeze(['fragmentShader', '#include <normal_fragment_maps>', FRAGMENT_NORMAL]),
	Object.freeze(['fragmentShader', '#include <emissivemap_fragment>', FRAGMENT_EMISSIVE]),
]);

export const PATCH_ANCHORS = Object.freeze(PATCHES.map(([stage, anchor]) => Object.freeze([stage, anchor])));

// Called from the materials' onBeforeCompile with three's shader object. Every anchor is checked
// before anything changes, so a template this was not written for fails loudly and whole.
export function patchStandardShader(shader) {
	for (const [stage, anchor] of PATCHES) {
		if (typeof shader[stage] !== 'string' || !shader[stage].includes(anchor)) {
			throw new Error(`Unleashed: the ${stage} has no "${anchor}" to patch; the MeshStandardMaterial template is not three@0.186.1's`);
		}
	}
	for (const [stage, anchor, replacement] of PATCHES) {
		shader[stage] = shader[stage].replace(anchor, () => replacement);
	}
	return shader;
}

export function declaredUniforms(glsl) {
	return [...glsl.matchAll(/uniform\s+(?:(?:highp|mediump|lowp)\s+)?\w+\s+(\w+)\s*;/g)].map((match) => match[1]);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `node --test tests/ocean/engine/unleashedGlsl.test.js && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean`
Expected: PASS: 4 tests, and the whole suite green.

- [ ] **Step 5: Commit**

```bash
git add content/ocean/js/render/unleashedGlsl.js tests/ocean/engine/unleashedGlsl.test.js
git commit -m "feat: the Unleashed shaders, transcribed from their tested twins, and their patch"
```

---

### Task 7: The GPU fields and foam, and the render-mode switch in the page

**Files:**
- Create: `content/ocean/js/render/fieldTextures.js`, `content/ocean/js/render/foamPass.js`, `content/ocean/js/render/unleashed.js`, `content/ocean/js/render/renderMode.js`
- Modify: `content/ocean/js/render/oceanMeshes.js` (return the group), `content/ocean/js/main.js`
- Test: `tests/ocean/e2e/unleashed.spec.js` (new)

**Interfaces:**
- Consumes: Task 1 `Ocean.setRenderPath`, `status().renderPath/counts`; Task 2 `createFieldSync`, `createCrestTracker`, `foamTexelsFor`, `LAYERS_PER_CASCADE`, `CASCADE_SLOTS`; Task 4 `shadingSettings`; Task 5 `supportFor`, `stageBlock`, `decideMode`, `checkMode`, `createModeTimings`; Task 6 `FULLSCREEN_VERTEX`, `FOAM_STEP_FRAGMENT`, `FOAM_PROBE_FRAGMENT`; A1 `core/mapRotation.js` (`BANDS`), `core/swells.js` (`isSilent`); A3 `main.js` (the `stage` from `startStageRoute`, whose `hooks.look()` returns `{ mode, ... }`), `ocean.source`, `ocean.swells`.
- Produces:
  - `render/oceanMeshes.js`: `createOceanMeshes` also returns `group` (the Roblox-mode meshes' `THREE.Group`).
  - `render/fieldTextures.js`: `createFieldTextures(ocean) -> { texture: THREE.DataArrayTexture, update() -> boolean, uploads() -> number }`
  - `render/foamPass.js`: `createFoamPass({ renderer, ocean, fieldsTexture, texels }) -> { texture() -> THREE.Texture (the current field), update(frame, settings) -> boolean, reset(), steps() -> number, checkComplete() -> { ok, reason }, compile() -> Promise, readTexels(points: [i, j][]) -> number[] }`
  - `render/unleashed.js`: `readCapabilities(renderer, preset) -> caps` (Task 5's `supportFor` input); `createUnleashed({ view, ocean }) -> { group, prepare() -> Promise<{ ok, reason }>, update(), show(on), ready() -> boolean, probe() -> object, resetFoam(), readFoam(points), foamReference() -> object }`. Task 8 replaces this file with the version that draws.
  - `render/renderMode.js`: `createRenderModes({ view, ocean, meshes, materials, config, lookMode, log = console }) -> { setMode, state, prepare, beforeStep, afterStep, record(cpuMs, renderMs, frameMs), renderTimings, hooks, effective() }`; `installRenderModes(modes)`; module-level `setRenderMode(mode)`, `getRenderMode()`, `renderTimings()`, `prepareUnleashed()` (throw "render modes are not started" before `installRenderModes`).
  - `window.__ocean` gains `setRenderMode`, `renderMode()` (= `getRenderMode`), `renderTimings()`, `prepareUnleashed()`, `unleashed` (`{ probe(), resetFoam(), readFoam(points), foamReference() }`) and `rendererInfo()` (`{ geometries, textures, programs }`).
  - When `main.js` is piece C's `startOcean`, the returned handle also gains `setRenderMode`, `getRenderMode`, `renderTimings`, `prepareUnleashed`.
  - `tests/ocean/e2e/unleashed.spec.js` helpers Task 8 and 9 reuse: `SHOT`, `load(page, query, frames = 30, { painter = true } = {})` (returns the error list), `waitFrames(page, frames)`, `waitForEffective(page, mode)`, `canvasCells(page, w = 64, h = 36)` (array of `[r, g, b]`), `luminance(rgb)`, `lowerHalf(cells, w = 64, h = 36)`, `meanAbsDifference(a, b)`, `variance(values)`, `meanRgb(cells)`.

- [ ] **Step 1: Write the failing browser tests**

`tests/ocean/e2e/unleashed.spec.js`:

```js
import { test, expect } from '@playwright/test';

// SwiftShader draws every Unleashed pixel on the CPU, and the High tier's foam pass is 1,024 x 1,024
// every fourth frame: a small viewport keeps a frame to a few hundred milliseconds. Every wait is
// counted in frames, never in wall time.
test.use({ viewport: { width: 640, height: 360 } });

// The High tier by URL, not by the CPU probe, so the foam field is 1,024 texels and the surface 232
// meshes whatever machine runs the tests.
const SHOT = 'cam=deck&freeze=12&tier=High';

// Loads the page and waits until it has drawn `frames` frames (and, unless told otherwise, until
// the workers and painters are up). Returns the page errors and console errors seen.
async function load(page, query, frames = 30, { painter = true } = {}) {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`/ocean/?${query}`);
	await page.waitForFunction(
		([target, needPainter]) => {
			const s = window.__ocean?.status();
			return s && s.frame > target && (!needPainter || (s.painterReady && s.workersReady > 0));
		},
		[frames, painter],
		{ timeout: 180_000 },
	);
	return errors;
}

async function waitFrames(page, frames) {
	const start = await page.evaluate(() => window.__ocean.status().frame);
	await page.waitForFunction((target) => window.__ocean.status().frame >= target, start + frames, { timeout: 240_000 });
}

// The first compile of the patched standard material takes many seconds under SwiftShader.
async function waitForEffective(page, mode) {
	await page.waitForFunction((wanted) => window.__ocean.renderMode().effective === wanted, mode, { timeout: 240_000 });
}

// The canvas as w x h cells of [r, g, b], read in a frame callback after the page's own render (the
// renderer does not preserve its drawing buffer, so a read between frames sees a cleared canvas).
async function canvasCells(page, w = 64, h = 36) {
	return page.evaluate(([w, h]) => new Promise((resolve) => requestAnimationFrame(() => {
		const copy = document.createElement('canvas');
		copy.width = w;
		copy.height = h;
		const context = copy.getContext('2d');
		context.drawImage(document.getElementById('ocean'), 0, 0, w, h);
		const data = context.getImageData(0, 0, w, h).data;
		const cells = [];
		for (let i = 0; i < data.length; i += 4) cells.push([data[i], data[i + 1], data[i + 2]]);
		resolve(cells);
	})), [w, h]);
}

const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// Everything below the horizon in the deck shot.
const lowerHalf = (cells, w = 64, h = 36) => cells.slice((h / 2) * w);
const meanAbsDifference = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
function variance(values) {
	const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
	return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}
const meanRgb = (cells) => [0, 1, 2].map((ch) => cells.reduce((sum, cell) => sum + cell[ch], 0) / cells.length);

test('the toggle switches the engine path: in Unleashed the CPU write, the painter and the glow stop, and they resume on the way back', async ({ page }) => {
	test.setTimeout(420_000);
	const errors = await load(page, SHOT);
	expect(await page.evaluate(() => window.__ocean.renderMode())).toMatchObject({ requested: 'roblox', effective: 'roblox', supported: true, prepared: false });
	const asked = await page.evaluate(() => window.__ocean.setRenderMode('unleashed'));
	expect(asked.requested).toBe('unleashed');
	await waitForEffective(page, 'unleashed');
	expect(await page.evaluate(() => window.__ocean.status().renderPath)).toBe('unleashed');
	const before = await page.evaluate(() => ({ counts: window.__ocean.status().counts, probe: window.__ocean.unleashed.probe() }));
	await waitFrames(page, 8);
	const after = await page.evaluate(() => ({ counts: window.__ocean.status().counts, probe: window.__ocean.unleashed.probe() }));
	expect(after.counts).toEqual(before.counts);
	expect(after.probe.fieldUploads).toBeGreaterThan(before.probe.fieldUploads);
	expect(after.probe.foamSteps).toBeGreaterThan(0);
	expect(after.probe.foamTexels).toBe(1024);
	expect(after.probe.crestMax).toBeGreaterThan(0);
	await page.evaluate(() => window.__ocean.setRenderMode('roblox'));
	await waitForEffective(page, 'roblox');
	await waitFrames(page, 4);
	const resumed = await page.evaluate(() => window.__ocean.status().counts);
	expect(resumed.write).toBeGreaterThan(after.counts.write);
	expect(resumed.paint).toBeGreaterThan(after.counts.paint);
	expect(resumed.glow).toBeGreaterThan(after.counts.glow);
	const timings = await page.evaluate(() => window.__ocean.renderTimings());
	expect(timings.roblox.frames).toBeGreaterThan(0);
	expect(timings.unleashed.frames).toBeGreaterThan(0);
	expect(Number.isFinite(timings.unleashed.cpuMs) && Number.isFinite(timings.roblox.renderMs)).toBe(true);
	expect(errors).toEqual([]);
});

test('asking twice while the shaders compile builds Unleashed once, and the last request wins (Review Focus 1)', async ({ page }) => {
	test.setTimeout(420_000);
	const errors = await load(page, SHOT);
	await page.evaluate(() => {
		window.__ocean.setRenderMode('unleashed');
		window.__ocean.setRenderMode('unleashed');
		window.__ocean.setRenderMode('roblox');
	});
	await page.waitForFunction(() => window.__ocean.renderMode().prepared, null, { timeout: 240_000 });
	await waitFrames(page, 3);
	expect(await page.evaluate(() => window.__ocean.renderMode().effective)).toBe('roblox');
	expect(await page.evaluate(() => window.__ocean.unleashed.probe().builds)).toBe(1);
	const refused = await page.evaluate(() => {
		try {
			window.__ocean.setRenderMode('fast');
			return null;
		} catch (error) {
			return `${error.name}: ${error.message}`;
		}
	});
	expect(refused).toContain('RangeError');
	expect(refused).toContain('roblox, unleashed');
	expect(await page.evaluate(() => window.__ocean.renderMode().requested)).toBe('roblox');
	expect(errors).toEqual([]);
});

test('without vertex texture units the toggle falls back to Roblox mode and says why (Review Focus 2)', async ({ page }) => {
	test.setTimeout(240_000);
	// A GPU that gives vertex shaders no texture units (MAX_VERTEX_TEXTURE_IMAGE_UNITS, 0x8B4C). Roblox
	// mode never samples a texture in a vertex shader, so only Unleashed notices.
	await page.addInitScript(() => {
		const original = WebGL2RenderingContext.prototype.getParameter;
		WebGL2RenderingContext.prototype.getParameter = function getParameter(name) {
			return name === 0x8b4c ? 0 : original.call(this, name);
		};
	});
	const warnings = [];
	page.on('console', (message) => {
		if (message.type() === 'warning') warnings.push(message.text());
	});
	const errors = await load(page, SHOT);
	const before = await page.evaluate(() => window.__ocean.renderMode());
	expect(before.supported).toBe(false);
	expect(before.supportReason).toContain('vertex');
	await page.evaluate(() => {
		window.__ocean.setRenderMode('unleashed');
		window.__ocean.setRenderMode('unleashed');
	});
	await waitFrames(page, 6);
	const after = await page.evaluate(() => window.__ocean.renderMode());
	expect(after).toMatchObject({ requested: 'unleashed', effective: 'roblox' });
	expect(after.reason).toContain('not available here');
	expect(await page.evaluate(() => window.__ocean.status().renderPath)).toBe('roblox');
	expect(await page.evaluate(() => window.__ocean.unleashed.probe().builds)).toBe(0);
	expect(warnings.filter((w) => w.includes('Unleashed is not available here')).length).toBe(1);
	expect(variance((await canvasCells(page)).map(luminance))).toBeGreaterThan(20);
	expect(errors).toEqual([]);
});

test("the GPU foam follows FoamField's rule, texel for texel", async ({ page }) => {
	test.setTimeout(480_000);
	const errors = await load(page, SHOT, 60);
	await page.evaluate(() => window.__ocean.setRenderMode('unleashed'));
	await waitForEffective(page, 'unleashed');
	// The frozen sea settled long ago; start the GPU from an empty field, as the CPU reference will.
	await page.evaluate(() => window.__ocean.unleashed.resetFoam());
	await page.waitForFunction(() => window.__ocean.unleashed.probe().foamSteps >= 3, null, { timeout: 300_000 });
	const result = await page.evaluate(async () => {
		const FoamField = await import('/ocean/js/core/foamField.js');
		// Synchronous from here on: no frame (and so no foam step) runs between these reads.
		const hooks = window.__ocean.unleashed;
		const reference = hooks.foamReference();
		const ratio = reference.gpuTexels / reference.tile;
		const field = FoamField.newGrid(reference.tile, reference.tile);
		for (let s = 0; s < reference.steps; s++) {
			FoamField.stepRows(field, 0, reference.tile, reference.display, reference.cascades, reference.tile, reference.chop, reference.params);
		}
		const texels = [...field.foam.keys()].sort((a, b) => field.foam[b] - field.foam[a]).slice(0, 24);
		for (let gy = 0; gy < 5; gy++) {
			for (let gx = 0; gx < 5; gx++) texels.push((gy * 51 + 7) * reference.tile + gx * 51 + 3);
		}
		const gpu = hooks.readFoam(texels.map((k) => [(k % reference.tile) * ratio, Math.floor(k / reference.tile) * ratio]));
		return { steps: reference.steps, cpu: texels.map((k) => field.foam[k]), gpu };
	});
	expect(result.steps).toBeGreaterThanOrEqual(3);
	expect(Math.max(...result.cpu)).toBeGreaterThan(0.05);
	result.cpu.forEach((value, i) => expect(Math.abs(result.gpu[i] - value)).toBeLessThan(0.02));
	expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run the browser tests and watch them fail**

Run: `OCEAN_PORT=8769 npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/unleashed.spec.js`
Expected: FAIL in all four: `window.__ocean.renderMode is not a function`.

- [ ] **Step 3: Return the group from `content/ocean/js/render/oceanMeshes.js`**

Replace `return { sync, patchMeshes, quadMeshes };` with:

```js
	// A4: the render-mode switch hides the whole Roblox-mode group while Unleashed draws.
	return { sync, patchMeshes, quadMeshes, group };
```

- [ ] **Step 4: Write `content/ocean/js/render/fieldTextures.js`**

```js
// A4 (not a twin): the float texture array the Unleashed shaders read the blended fields from
// (layout: engine/unleashedFields.js). RGBA32F with NearestFilter and no mipmaps: the shaders read
// it with texelFetch, and a float texture set to filter linearly without OES_texture_float_linear
// is incomplete and reads zero. Re-uploaded only on frames whose fields were blended.
import * as THREE from 'three';
import { createFieldSync, LAYERS_PER_CASCADE } from '../engine/unleashedFields.js';

export function createFieldTextures(ocean) {
	const sync = createFieldSync(ocean);
	const { n, sizes } = ocean.preset;
	const texture = new THREE.DataArrayTexture(sync.data, n, n, sizes.length * LAYERS_PER_CASCADE);
	texture.format = THREE.RGBAFormat;
	texture.type = THREE.FloatType;
	texture.minFilter = THREE.NearestFilter;
	texture.magFilter = THREE.NearestFilter;
	texture.generateMipmaps = false;
	texture.needsUpdate = true;
	return {
		texture,
		update() {
			if (!sync.sync()) {
				return false;
			}
			texture.needsUpdate = true;
			return true;
		},
		uploads: () => sync.uploads(),
	};
}
```

- [ ] **Step 5: Write `content/ocean/js/render/foamPass.js`**

```js
// A4 (not a twin): the foam field on the GPU. Two half-float render targets take turns: each step
// reads one and writes FoamField's rule into the other at every texel -- texel (i, j) AT world
// (i, j) * tile / texels, the Jacobian of the SUM of the shown cascades there, foam = clamp(foam *
// decay + grow * max(0, whitecap - J), 0, 1) -- over one texel per cell of the finest cascade (a
// quarter stud on High). The whole field steps on every MapRotation.BANDS-th frame, so each texel
// steps at the rate the CPU painter steps its own (a quarter of the rows a frame), the rate the
// decay is tuned for. Mipmapped, so the material can read it at a distance without sparkle.
// readTexels is a test probe: it copies chosen texels into a byte target and reads them back.
import * as THREE from 'three';
import * as MapRotation from '../core/mapRotation.js';
import { FOAM_PROBE_FRAGMENT, FOAM_STEP_FRAGMENT, FULLSCREEN_VERTEX } from './unleashedGlsl.js';

const MAX_PROBE_POINTS = 256;

function foamTarget(texels) {
	const target = new THREE.WebGLRenderTarget(texels, texels, {
		type: THREE.HalfFloatType,
		format: THREE.RGBAFormat,
		depthBuffer: false,
		stencilBuffer: false,
		generateMipmaps: true,
		minFilter: THREE.LinearMipmapLinearFilter,
		magFilter: THREE.LinearFilter,
	});
	target.texture.wrapS = THREE.RepeatWrapping;
	target.texture.wrapT = THREE.RepeatWrapping;
	return target;
}

export function createFoamPass({ renderer, ocean, fieldsTexture, texels }) {
	const { n, sizes, textureTile } = ocean.preset;
	let read = foamTarget(texels);
	let write = foamTarget(texels);
	const uniforms = {
		uFields: { value: fieldsTexture },
		uFieldN: { value: n },
		uFieldSizes: { value: new THREE.Vector3(sizes[0] ?? 0, sizes[1] ?? 0, sizes[2] ?? 0) },
		uPrevious: { value: read.texture },
		uShown: { value: new THREE.Vector3() },
		uTexels: { value: texels },
		uTile: { value: textureTile },
		uChop: { value: 0 },
		uWhitecap: { value: 0 },
		uGrow: { value: 0 },
		uDecay: { value: 0 },
	};
	const material = new THREE.ShaderMaterial({
		defines: { OCEAN_CASCADES: sizes.length },
		uniforms,
		vertexShader: FULLSCREEN_VERTEX,
		fragmentShader: FOAM_STEP_FRAGMENT,
		depthTest: false,
		depthWrite: false,
	});
	const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
	quad.frustumCulled = false;
	const scene = new THREE.Scene();
	scene.add(quad);
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	let steps = 0;

	function renderInto(target) {
		const previous = renderer.getRenderTarget();
		renderer.setRenderTarget(target);
		renderer.render(scene, camera);
		renderer.setRenderTarget(previous);
	}

	function step(settings) {
		uniforms.uPrevious.value = read.texture;
		uniforms.uShown.value.fromArray(settings.shown);
		uniforms.uChop.value = settings.chop;
		uniforms.uWhitecap.value = settings.foam.whitecap;
		uniforms.uGrow.value = settings.foam.grow;
		uniforms.uDecay.value = settings.foam.decay;
		renderInto(write);
		[read, write] = [write, read];
		steps += 1;
	}

	// With foam off the field is left as it is, as the CPU painter leaves its own.
	function update(frame, settings) {
		if (!settings.foam.on || frame % MapRotation.BANDS !== 0) {
			return false;
		}
		step(settings);
		return true;
	}

	function reset() {
		const previous = renderer.getRenderTarget();
		const colour = renderer.getClearColor(new THREE.Color());
		const alpha = renderer.getClearAlpha();
		renderer.setClearColor(0x000000, 0);
		for (const target of [read, write]) {
			renderer.setRenderTarget(target);
			renderer.clear(true, false, false);
		}
		renderer.setRenderTarget(previous);
		renderer.setClearColor(colour, alpha);
		steps = 0;
	}

	// Binding the target makes Three.js allocate it; the driver then says whether it can draw there.
	function checkComplete() {
		const gl = renderer.getContext();
		const previous = renderer.getRenderTarget();
		renderer.setRenderTarget(read);
		const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		renderer.setRenderTarget(previous);
		if (status === gl.FRAMEBUFFER_COMPLETE) {
			return { ok: true, reason: null };
		}
		return { ok: false, reason: `the foam field's half-float target cannot be drawn into here (framebuffer status 0x${status.toString(16)})` };
	}

	function readTexels(points) {
		if (!Array.isArray(points) || points.length < 1 || points.length > MAX_PROBE_POINTS) {
			throw new RangeError(`readTexels takes 1 to ${MAX_PROBE_POINTS} points, got ${points?.length}`);
		}
		const coordinates = new Float32Array(points.length * 4);
		points.forEach(([i, j], k) => {
			if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j < 0 || i >= texels || j >= texels) {
				throw new RangeError(`readTexels: point ${k} (${i}, ${j}) is not a texel of the ${texels}-texel field`);
			}
			coordinates[k * 4] = i;
			coordinates[k * 4 + 1] = j;
		});
		const pointsTexture = new THREE.DataTexture(coordinates, points.length, 1, THREE.RGBAFormat, THREE.FloatType);
		pointsTexture.needsUpdate = true;
		const target = new THREE.WebGLRenderTarget(points.length, 1, { depthBuffer: false, stencilBuffer: false });
		const probe = new THREE.ShaderMaterial({
			uniforms: { uPoints: { value: pointsTexture }, uFoam: { value: read.texture } },
			vertexShader: FULLSCREEN_VERTEX,
			fragmentShader: FOAM_PROBE_FRAGMENT,
			depthTest: false,
			depthWrite: false,
		});
		quad.material = probe;
		const bytes = new Uint8Array(points.length * 4);
		try {
			renderInto(target);
			renderer.readRenderTargetPixels(target, 0, 0, points.length, 1, bytes);
		} finally {
			quad.material = material;
			probe.dispose();
			pointsTexture.dispose();
			target.dispose();
		}
		return points.map((_, k) => bytes[k * 4] / 255);
	}

	return {
		texture: () => read.texture,
		update,
		reset,
		steps: () => steps,
		checkComplete,
		compile: () => renderer.compileAsync(scene, camera),
		readTexels,
	};
}
```

- [ ] **Step 6: Write `content/ocean/js/render/unleashed.js`** (this task's version: the GPU data without a surface yet; Task 8 replaces the file)

```js
// A4 (not a twin): the Unleashed renderer. Built the first time Unleashed is asked for, never at
// page load; prepare() checks the foam target can be drawn into and compiles every shader with
// renderer.compileAsync, so the switch never stalls a frame on a compile. Each Unleashed frame,
// update() re-uploads the blended fields when they changed, keeps the peak mask's normaliser, and
// steps the GPU foam. (Task 7 of the A4 plan: the surface meshes arrive in Task 8.)
import * as THREE from 'three';
import { CASCADE_SLOTS, createCrestTracker, foamTexelsFor, LAYERS_PER_CASCADE } from '../engine/unleashedFields.js';
import { shadingSettings } from '../engine/unleashedShading.js';
import { createFieldTextures } from './fieldTextures.js';
import { createFoamPass } from './foamPass.js';

// What engine/unleashedSupport.js supportFor asks about this GPU.
export function readCapabilities(renderer, preset) {
	const gl = renderer.getContext();
	return Object.freeze({
		maxVertexTextures: renderer.capabilities.maxVertexTextures,
		maxTextureSize: renderer.capabilities.maxTextureSize,
		maxArrayLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
		colorBufferFloat: renderer.extensions.has('EXT_color_buffer_float'),
		colorBufferHalfFloat: renderer.extensions.has('EXT_color_buffer_half_float'),
		foamTexels: foamTexelsFor(preset),
		layers: preset.sizes.length * LAYERS_PER_CASCADE,
	});
}

export function createUnleashed({ view, ocean }) {
	const { preset } = ocean;
	if (preset.sizes.length > CASCADE_SLOTS) {
		throw new Error(`Unleashed draws at most ${CASCADE_SLOTS} cascades, the tier has ${preset.sizes.length}`);
	}
	const renderer = view.renderer;
	const texels = foamTexelsFor(preset);
	const fields = createFieldTextures(ocean);
	const foam = createFoamPass({ renderer, ocean, fieldsTexture: fields.texture, texels });
	const crest = createCrestTracker(ocean);
	const group = new THREE.Group();
	group.name = 'unleashed';
	group.visible = false;
	view.scene.add(group);
	let ready = false;
	let shown = false;
	let crestMax = 0;

	async function prepare() {
		const complete = foam.checkComplete();
		if (!complete.ok) {
			return complete;
		}
		await Promise.all([renderer.compileAsync(group, view.camera, view.scene), foam.compile()]);
		ready = true;
		return { ok: true, reason: null };
	}

	function update() {
		const settings = shadingSettings(ocean);
		fields.update();
		crestMax = crest.update(ocean.frame);
		foam.update(ocean.frame, settings);
		return settings;
	}

	function show(on) {
		shown = on;
		group.visible = on;
	}

	function probe() {
		return Object.freeze({
			prepared: ready,
			shown,
			fieldUploads: fields.uploads(),
			foamSteps: foam.steps(),
			foamTexels: texels,
			crestMax,
			drawnFrames: 0,
		});
	}

	// What the foam test needs to run FoamField on the CPU over exactly the fields the GPU stepped.
	function foamReference() {
		const painter = ocean.painter.mapsConfig;
		return {
			display: ocean.store.display,
			cascades: [...painter.colourCascades],
			tile: preset.textureTile,
			chop: ocean.live.chop,
			params: { whitecap: painter.foamWhitecap, grow: painter.foamGrow, decay: painter.foamDecay },
			gpuTexels: texels,
			steps: foam.steps(),
		};
	}

	return {
		group,
		prepare,
		update,
		show,
		ready: () => ready,
		probe,
		resetFoam: () => foam.reset(),
		readFoam: (points) => foam.readTexels(points),
		foamReference,
	};
}
```

- [ ] **Step 7: Write `content/ocean/js/render/renderMode.js`**

```js
// A4 (not a twin): which renderer draws the sea, and the switch the finale's toggle calls. Roblox
// mode is A2's (CPU-written vertices, painted maps, 232 glowing materials); Unleashed is
// render/unleashed.js. The page asks with setRenderMode; each frame beforeStep decides what may
// draw (engine/unleashedSupport.js: the GPU's support, the story step, whether the shaders are
// compiled) and switches the ocean's render path and the two groups at the start of the frame,
// so a switch back to Roblox mode writes its vertices in that same frame. afterStep does the
// drawing path's own CPU work, and record() keeps the live numbers per mode.
// Piece C imports setRenderMode, getRenderMode, renderTimings and prepareUnleashed from here;
// main.js installs the one instance once the ocean runs.
import * as Swells from '../core/swells.js';
import { createModeTimings } from '../engine/modeTimings.js';
import * as Ocean from '../engine/ocean.js';
import { checkMode, decideMode, stageBlock, supportFor } from '../engine/unleashedSupport.js';
import { createUnleashed, readCapabilities } from './unleashed.js';

/**
 * @param {object} deps
 * @param {() => string} deps.lookMode the stage look's mode ('painted' without a stage)
 */
export function createRenderModes({ view, ocean, meshes, materials, config, lookMode, log = console }) {
	let support = supportFor(readCapabilities(view.renderer, ocean.preset));
	const timings = createModeTimings();
	let requested = 'roblox';
	let effective = 'roblox';
	let reason = null;
	let unleashed = null;
	let preparing = null;
	let builds = 0;
	const warned = new Set();

	function warnOnce(text) {
		if (!warned.has(text)) {
			warned.add(text);
			log.warn(`[ocean] ${text}`);
		}
	}

	function refuse(why) {
		support = Object.freeze({ ok: false, reason: why, foamType: null });
		warnOnce(`Unleashed is not available here: ${why}; drawing Roblox mode`);
	}

	// Builds Unleashed once and compiles its shaders; every later call returns the same promise.
	function prepare() {
		if (preparing) {
			return preparing;
		}
		if (!support.ok) {
			return Promise.resolve(false);
		}
		try {
			unleashed = createUnleashed({ view, ocean });
			builds += 1;
		} catch (error) {
			refuse(`it could not be built (${error.message})`);
			preparing = Promise.resolve(false);
			return preparing;
		}
		preparing = unleashed.prepare().then(
			(result) => {
				if (!result.ok) refuse(result.reason);
				return result.ok;
			},
			(error) => {
				refuse(`its shaders did not compile (${error.message})`);
				return false;
			},
		);
		return preparing;
	}

	function state() {
		return Object.freeze({
			requested,
			effective,
			reason,
			supported: support.ok,
			supportReason: support.reason,
			prepared: unleashed?.ready() === true,
		});
	}

	// Takes effect at the start of the next frame (beforeStep).
	function setMode(mode) {
		checkMode(mode);
		requested = mode;
		if (mode === 'unleashed') {
			if (support.ok) {
				prepare();
			} else {
				warnOnce(`Unleashed is not available here: ${support.reason}; drawing Roblox mode`);
			}
		}
		return state();
	}

	function apply(next) {
		effective = next;
		Ocean.setRenderPath(ocean, next);
		meshes.group.visible = next === 'roblox';
		unleashed?.show(next === 'unleashed');
	}

	function beforeStep() {
		const block = stageBlock({
			source: ocean.source,
			lookMode: lookMode(),
			swellsSilent: Swells.isSilent(ocean.swells),
			calibrate: config.calibrate,
		});
		const decision = decideMode({ requested, support, ready: unleashed?.ready() === true, block });
		if (decision.effective !== effective) {
			apply(decision.effective);
		}
		reason = decision.reason;
	}

	// After Ocean.step: the drawing path's own CPU work for this frame.
	function afterStep() {
		if (effective === 'unleashed') {
			unleashed.update();
			return;
		}
		materials.applyStrengths(ocean.strengths);
		meshes.sync();
	}

	function record(cpuMs, renderMs, frameMs) {
		timings.record(effective, { cpuMs, renderMs, frameMs });
	}

	function renderTimings() {
		const snapshot = timings.snapshot();
		return Object.freeze({ ...state(), roblox: snapshot.roblox, unleashed: snapshot.unleashed, skipped: snapshot.skipped });
	}

	function requireUnleashed() {
		if (!unleashed) {
			throw new Error('Unleashed has not been built yet: call setRenderMode("unleashed") or prepareUnleashed() first');
		}
		return unleashed;
	}

	// Test hooks (window.__ocean.unleashed).
	const hooks = Object.freeze({
		probe: () => Object.freeze({ builds, ...(unleashed ? unleashed.probe() : { prepared: false }) }),
		resetFoam: () => requireUnleashed().resetFoam(),
		readFoam: (points) => requireUnleashed().readFoam(points),
		foamReference: () => requireUnleashed().foamReference(),
	});

	return { setMode, state, prepare, beforeStep, afterStep, record, renderTimings, hooks, effective: () => effective };
}

let installed = null;

export function installRenderModes(modes) {
	installed = modes;
}

function current() {
	if (!installed) {
		throw new Error('render modes are not started: main.js installs them once the ocean runs');
	}
	return installed;
}

/**
 * The finale's toggle. Takes effect from the next frame.
 * @param {'roblox' | 'unleashed'} mode
 * @returns {object} RenderModeState (plan Conventions)
 */
export function setRenderMode(mode) {
	return current().setMode(mode);
}

export function getRenderMode() {
	return current().state();
}

/** @returns {object} RenderTimings (plan Conventions): the live numbers for both modes */
export function renderTimings() {
	return current().renderTimings();
}

/** Builds Unleashed and compiles its shaders ahead of the toggle; resolves true when it can draw. */
export function prepareUnleashed() {
	return current().prepare();
}
```

- [ ] **Step 8: Wire the switch into `content/ocean/js/main.js`**

First read the merged `main.js`. Two shapes are possible, and the additions are the same in both:

- **A3's shape** (`function start(config, route)` with a `frame(now)` loop): apply (a) to (e) below as written.
- **Piece C's shape** (piece C planned in parallel and may have merged first: `export function startOcean({ config, route, now, ... })` returning a frozen handle, a `tick(time)` inside a guarded `frame`, `const dev = ...` / `const stage = dev;` and, after C's Task 5, a `story` object with `story.hooks.look()`): apply (a) and (b) as written; put (c) after the line that creates the last of `dev`, `stage` and `story`, with `lookMode: () => (story ?? dev)?.hooks.look().mode ?? 'painted'` (drop `story ??` if the file has no `story`); add (d) to the `window.__ocean` object; make the (e) changes inside `tick` (C's `stage?.beforeStep(dt)` and `stage?.afterStep(dt)` keep their `dt`, and any story call C placed before `Ocean.step` stays before `modes.beforeStep()`); and add to the object `startOcean` returns: `setRenderMode, getRenderMode, renderTimings, prepareUnleashed` (piece C's finale shows its toggle only when `handle.setRenderMode` is a function, and reads the live numbers from `handle.renderTimings()`).

Keep every existing line and hook of either shape; name any deviation in your report.

(a) Add to the header comment: `// A4: render/renderMode.js decides each frame whether Roblox mode or Unleashed draws.`

(b) After `import { startStageRoute } from './ui/devStage.js';` add:

```js
import { createRenderModes, getRenderMode, installRenderModes, prepareUnleashed, renderTimings, setRenderMode } from './render/renderMode.js';
```

(c) After the line `const stage = route ? startStageRoute({ route, ocean, view, rig, meshes, materials, config }) : null;` add:

```js
	// Without a stage the page shows the painted sea, which is what Unleashed replaces.
	const modes = createRenderModes({
		view,
		ocean,
		meshes,
		materials,
		config,
		lookMode: () => (stage ? stage.hooks.look().mode : 'painted'),
	});
	installRenderModes(modes);
```

(d) In the `window.__ocean` object, after `stage: stage ? stage.hooks : null,` add:

```js
		setRenderMode,
		renderMode: getRenderMode,
		renderTimings,
		prepareUnleashed,
		unleashed: modes.hooks,
		rendererInfo: () => ({
			geometries: view.renderer.info.memory.geometries,
			textures: view.renderer.info.memory.textures,
			programs: view.renderer.info.programs.length,
		}),
```

(e) Replace the `frame` function with:

```js
	function frame(now) {
		const dt = (now - last) / 1000;
		last = now;
		rig.update();
		stage?.beforeStep();
		// A4: which renderer draws this frame, decided before the engine steps so a switch back to
		// Roblox mode writes its vertices in this same frame.
		modes.beforeStep();
		const cpuStarted = performance.now();
		Ocean.step(ocean, dt, rig.focus(focus), rig.eye(eye), view.sunDirection);
		modes.afterStep();
		view.follow();
		const cpuMs = performance.now() - cpuStarted;
		stage?.afterStep();
		const renderStarted = performance.now();
		view.render();
		const renderMs = performance.now() - renderStarted;
		Ocean.addStageSeconds(ocean, 'render', renderMs / 1000);
		// The first rAF timestamp can precede the `last` taken at start-up: never a negative interval.
		modes.record(cpuMs, renderMs, Math.max(0, dt * 1000));
		readout.frame(now);
		if (config.stats) readout.show(Ocean.status(ocean), Ocean.report(ocean));
		requestAnimationFrame(frame);
	}
```

- [ ] **Step 9: Run the browser tests and watch them pass**

Run: `OCEAN_PORT=8769 npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/unleashed.spec.js`
Expected: PASS: 4 tests (several minutes under SwiftShader). The Unleashed frames show only the sky at this point; Task 8 adds the surface. A shader compile error shows up as a console error and fails the test: fix the GLSL in `unleashedGlsl.js` and its twin together.

Run: `ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean && OCEAN_PORT=8769 npm run test:ocean:e2e`
Expected: PASS: the unit suite and every browser spec (A2's shell, ocean, materials; A3's stages and stageSteps; this one).

- [ ] **Step 10: Commit**

```bash
git add content/ocean/js/render/fieldTextures.js content/ocean/js/render/foamPass.js content/ocean/js/render/unleashed.js content/ocean/js/render/renderMode.js content/ocean/js/render/oceanMeshes.js content/ocean/js/main.js tests/ocean/e2e/unleashed.spec.js
git commit -m "feat: the render-mode switch, the fields on the GPU and a GPU foam field that matches the CPU's"
```

---

### Task 8: The Unleashed surface on screen

**Files:**
- Create: `content/ocean/js/render/unleashedMaterials.js`, `content/ocean/js/render/unleashedMeshes.js`
- Modify: `content/ocean/js/render/unleashed.js` (replaced whole), `content/ocean/js/render/oceanMeshes.js` (export `patchIndices`)
- Test: `tests/ocean/e2e/unleashed.spec.js` (append)

**Interfaces:**
- Consumes: Task 3 `ringUniforms`, `horizonUniforms`, `seamAxes`, `patchCovered`; Task 4 `shadingSettings`, `LACE_*` from `painterWorkerCore.js`; Task 6 `MATERIAL_UNIFORMS`, `PROGRAM_KEY`, `patchStandardShader`; Task 7 `createFieldTextures`, `createFoamPass`, the spec helpers (`SHOT`, `load`, `waitFrames`, `waitForEffective`, `canvasCells`, `luminance`, `lowerHalf`, `meanAbsDifference`, `variance`, `meanRgb`); A1 `core/foamPaint.js` (`lace`); A2 `engine/horizonState.js` (`CORNERS`, `TRIANGLES`, `QUAD_Y`), `engine/config.js` (`COLOUR_TEXELS`), `render/lighting.js` (`EMISSIVE_SCALE`); A3 `surface.boundsVersion`, `window.__ocean.stage` (`set`, `look`), `window.__ocean.materialsProbe()`.
- Produces:
  - `render/oceanMeshes.js`: `export function patchIndices(cells) -> number[]` (unchanged body).
  - `render/unleashedMaterials.js`: `createUnleashedMaterials({ ocean, fieldsTexture, foamTexture: () => THREE.Texture, foamTexels }) -> { ringMaterials: MeshStandardMaterial[], horizonMaterial, update(settings, crestMax, sun: number[3]), laceMs }`
  - `render/unleashedMeshes.js`: `createUnleashedMeshes({ group, ocean, materials }) -> { sync(), patchMeshes, quadMeshes, drawnFrames() -> number }`
  - `render/unleashed.js`: the same API as Task 7's, now drawing; `probe()` gains `drawnFrames` (frames on which an Unleashed patch was drawn), `laceMs` and `meshes` (232 on High).

- [ ] **Step 1: Append the failing browser tests**

Append to `tests/ocean/e2e/unleashed.spec.js`:

```js
// Thresholds for the picture checks (luminance and channel values on 0..255). If one fails on a
// page that renders correctly, report the measured value rather than moving it.
const VARIANCE_FLOOR = 20;
const DIFFERENCE_FLOOR = 2;
const COLOUR_TOLERANCE = 24;
const RESTORE_TOLERANCE = 3;

test('the Unleashed sea draws, differs from Roblox mode, and stays close to its colour at the frozen deck shot', async ({ page }) => {
	test.setTimeout(480_000);
	const errors = await load(page, SHOT, 120);
	const roblox = await canvasCells(page);
	await page.evaluate(() => window.__ocean.setRenderMode('unleashed'));
	await waitForEffective(page, 'unleashed');
	await page.waitForFunction(() => window.__ocean.unleashed.probe().foamSteps >= 8, null, { timeout: 300_000 });
	const unleashed = await canvasCells(page);
	const probe = await page.evaluate(() => window.__ocean.unleashed.probe());
	expect(probe.meshes).toBe(232);
	expect(probe.drawnFrames).toBeGreaterThan(8);
	expect(variance(unleashed.map(luminance))).toBeGreaterThan(VARIANCE_FLOOR);
	// Same sea, better shading: the water below the horizon keeps its overall colour (a sky-only
	// lower half would miss by far more) but is not the same picture.
	const difference = meanAbsDifference(lowerHalf(roblox).map(luminance), lowerHalf(unleashed).map(luminance));
	expect(difference).toBeGreaterThan(DIFFERENCE_FLOOR);
	const before = meanRgb(lowerHalf(roblox));
	const after = meanRgb(lowerHalf(unleashed));
	for (let ch = 0; ch < 3; ch++) {
		expect(Math.abs(after[ch] - before[ch])).toBeLessThan(COLOUR_TOLERANCE);
	}
	expect(errors).toEqual([]);
});

test('switching back restores Roblox mode: the same frozen picture, the painter painting again', async ({ page }) => {
	test.setTimeout(480_000);
	const errors = await load(page, SHOT, 160);
	const first = (await canvasCells(page)).map(luminance);
	await page.evaluate(() => window.__ocean.setRenderMode('unleashed'));
	await waitForEffective(page, 'unleashed');
	await waitFrames(page, 8);
	const during = await page.evaluate(() => window.__ocean.materialsProbe().colourUploads);
	await page.evaluate(() => window.__ocean.setRenderMode('roblox'));
	await waitForEffective(page, 'roblox');
	await waitFrames(page, 40);
	const back = (await canvasCells(page)).map(luminance);
	expect(await page.evaluate(() => window.__ocean.materialsProbe().colourUploads)).toBeGreaterThan(during);
	expect(meanAbsDifference(first, back)).toBeLessThan(RESTORE_TOLERANCE);
	expect(errors).toEqual([]);
});

test('toggling back and forth allocates nothing after the first switch (Review Focus 1)', async ({ page }) => {
	test.setTimeout(480_000);
	const errors = await load(page, SHOT);
	await page.evaluate(() => window.__ocean.setRenderMode('unleashed'));
	await waitForEffective(page, 'unleashed');
	await waitFrames(page, 2);
	await page.evaluate(() => window.__ocean.setRenderMode('roblox'));
	await waitForEffective(page, 'roblox');
	await waitFrames(page, 2);
	const settled = await page.evaluate(() => window.__ocean.rendererInfo());
	for (let k = 0; k < 6; k++) {
		const mode = k % 2 === 0 ? 'unleashed' : 'roblox';
		await page.evaluate((wanted) => window.__ocean.setRenderMode(wanted), mode);
		await waitForEffective(page, mode);
		await waitFrames(page, 3);
	}
	expect(await page.evaluate(() => window.__ocean.rendererInfo())).toEqual(settled);
	expect(await page.evaluate(() => window.__ocean.unleashed.probe().builds)).toBe(1);
	expect(errors).toEqual([]);
});

test('Unleashed replaces only the painted sea: a teaching step keeps its look, and the finale takes Unleashed (Review Focus 3)', async ({ page }) => {
	test.setTimeout(480_000);
	const errors = await load(page, 'step=3&freeze=12&tier=High', 10, { painter: false });
	await page.evaluate(() => window.__ocean.setRenderMode('unleashed'));
	await waitFrames(page, 6);
	const teaching = await page.evaluate(() => ({ mode: window.__ocean.renderMode(), status: window.__ocean.status() }));
	expect(teaching.mode.effective).toBe('roblox');
	expect(teaching.mode.reason).toContain('teaching waves');
	expect(teaching.status.source).toBe('waves');
	expect(teaching.status.renderPath).toBe('roblox');
	expect(teaching.status.counts.write).toBeGreaterThan(0);
	await page.evaluate(() => window.__ocean.stage.set(13));
	await waitForEffective(page, 'unleashed');
	expect(await page.evaluate(() => window.__ocean.stage.look().mode)).toBe('painted');
	await page.evaluate(() => window.__ocean.stage.set(4));
	await waitFrames(page, 2);
	const back = await page.evaluate(() => ({ mode: window.__ocean.renderMode(), status: window.__ocean.status() }));
	expect(back.mode).toMatchObject({ requested: 'unleashed', effective: 'roblox' });
	expect(back.status.renderPath).toBe('roblox');
	expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run the new browser tests and watch them fail**

Run: `OCEAN_PORT=8769 npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/unleashed.spec.js -g "draws|restores|allocates|painted sea"`
Expected: FAIL: the picture test on `probe.meshes` (undefined: Task 7's Unleashed has no surface); the others may pass or fail on the sky-only picture. All four must pass after Step 7.

- [ ] **Step 3: Export `patchIndices` from `content/ocean/js/render/oceanMeshes.js`**

Replace `function patchIndices(cells) {` with:

```js
// Exported for A4: the Unleashed meshes index their lattice the same way.
export function patchIndices(cells) {
```

- [ ] **Step 4: Write `content/ocean/js/render/unleashedMaterials.js`**

```js
// A4 (not a twin): the Unleashed surface's materials. MeshStandardMaterial, so the sun, the sky
// light, the environment reflections with their Fresnel, the fog and the tone mapping are the same
// Three.js lighting Roblox mode is drawn with, patched (unleashedGlsl.js) so the vertex shader
// displaces the lattice and every pixel works out its own colour, foam, roughness, normal and glow
// from the fields. One material per ring (their fades, skirts and roughness differ) and one for the
// horizon quads, all sharing one compiled program (PROGRAM_KEY) and one set of shared uniforms.
// The lace the foam is eroded through is the painter's own (FoamPaint.lace with its constants),
// built once here (laceMs) and stored as mipmapped bytes.
import * as THREE from 'three';
import * as FoamPaint from '../core/foamPaint.js';
import { COLOUR_TEXELS } from '../engine/config.js';
import { horizonUniforms, ringUniforms } from '../engine/unleashedSurface.js';
import { LACE_CELLS, LACE_FALLOFF, LACE_OCTAVES, LACE_SEED } from '../workers/painterWorkerCore.js';
import * as Lighting from './lighting.js';
import { MATERIAL_UNIFORMS, PROGRAM_KEY, patchStandardShader } from './unleashedGlsl.js';

function laceTexture() {
	const started = performance.now();
	const lace = FoamPaint.lace(COLOUR_TEXELS, LACE_CELLS, LACE_SEED, LACE_OCTAVES, LACE_FALLOFF);
	const bytes = new Uint8Array(COLOUR_TEXELS * COLOUR_TEXELS * 4);
	for (let k = 0; k < lace.length; k++) {
		const value = Math.floor(lace[k] * 255 + 0.5);
		bytes[k * 4] = value;
		bytes[k * 4 + 1] = value;
		bytes[k * 4 + 2] = value;
		bytes[k * 4 + 3] = 255;
	}
	const texture = new THREE.DataTexture(bytes, COLOUR_TEXELS, COLOUR_TEXELS, THREE.RGBAFormat);
	texture.colorSpace = THREE.NoColorSpace;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	return { texture, ms: performance.now() - started };
}

// Three.js calls this as a method of the material, once per material, before it builds (or reuses)
// the program: the material's own uniform objects are bound into the shader's uniforms.
function onBeforeCompile(shader) {
	Object.assign(shader.uniforms, this.userData.oceanUniforms);
	patchStandardShader(shader);
}

function programKey() {
	return PROGRAM_KEY;
}

export function createUnleashedMaterials({ ocean, fieldsTexture, foamTexture, foamTexels }) {
	const { n, sizes, textureTile } = ocean.preset;
	const lace = laceTexture();
	const vector3 = () => new THREE.Vector3();
	const glow = ocean.config.subsurface;
	const shared = {
		uFields: { value: fieldsTexture },
		uFieldN: { value: n },
		uFieldSizes: { value: new THREE.Vector3(sizes[0] ?? 0, sizes[1] ?? 0, sizes[2] ?? 0) },
		uFocus: { value: new THREE.Vector2() },
		uSkirtY: { value: 0 },
		uChop: { value: 0 },
		uShown: { value: vector3() },
		uPeak: { value: 1 },
		uTint: { value: 0 },
		uDeep: { value: vector3() },
		uSubsurface: { value: vector3() },
		uFoam: { value: foamTexture() },
		uFoamTexels: { value: foamTexels },
		uTile: { value: textureTile },
		uLace: { value: lace.texture },
		uFoamOn: { value: 0 },
		uFoamThreshold: { value: 0 },
		uFoamSlope: { value: 1 },
		uLaceSoft: { value: 0 },
		uFoamOpacity: { value: 0 },
		uFoamColour: { value: vector3() },
		uFoamRoughness: { value: 1 },
		uSun: { value: vector3() },
		uScatter: { value: vector3() },
		uGlowOn: { value: 0 },
		uMaskMax: { value: 0 },
		uMaskGamma: { value: 1 },
		// Roblox mode's emissive colour, built the way materials.js builds it.
		uGlowColour: { value: new THREE.Color().setRGB(glow[0] / 255, glow[1] / 255, glow[2] / 255, THREE.SRGBColorSpace) },
		uEmissiveScale: { value: Lighting.EMISSIVE_SCALE },
	};

	function make() {
		const own = {
			uDisplace: { value: 0 },
			uRingSampled: { value: vector3() },
			uRingFades: { value: vector3() },
			uFadeEdge: { value: 1 },
			uFadeWidth: { value: 1 },
			uInnerCentre: { value: new THREE.Vector2() },
			uInnerHalf: { value: 0 },
			uBaseRoughness: { value: 1 },
		};
		const uniforms = { ...shared, ...own };
		const missing = MATERIAL_UNIFORMS.filter((name) => !(name in uniforms));
		if (missing.length > 0) {
			throw new Error(`the Unleashed materials bind no value for ${missing.join(', ')}`);
		}
		const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
		material.defines = { OCEAN_CASCADES: sizes.length };
		material.userData.oceanUniforms = uniforms;
		material.onBeforeCompile = onBeforeCompile;
		material.customProgramCacheKey = programKey;
		return { material, own };
	}

	const rings = ocean.preset.rings.map(() => make());
	const horizon = make();

	function applyRing(own, u, roughness) {
		own.uDisplace.value = u.displace;
		own.uRingSampled.value.fromArray(u.sampled);
		own.uRingFades.value.fromArray(u.fades);
		own.uFadeEdge.value = u.fadeEdge;
		own.uFadeWidth.value = u.fadeWidth;
		own.uInnerCentre.value.set(u.innerX, u.innerZ);
		own.uInnerHalf.value = u.innerHalf;
		own.uBaseRoughness.value = roughness;
	}

	/**
	 * @param {object} settings ShadingSettings (engine/unleashedShading.js)
	 * @param {number} crestMax the peak mask's normaliser (createCrestTracker)
	 * @param {number[]} sun the view's sun direction, unit
	 */
	function update(settings, crestMax, sun) {
		const surface = ocean.surface;
		shared.uFocus.value.set(surface.focusX, surface.focusZ);
		shared.uSkirtY.value = surface.skirtY;
		shared.uChop.value = settings.chop;
		shared.uShown.value.fromArray(settings.shown);
		shared.uPeak.value = settings.peak;
		shared.uTint.value = settings.tint;
		shared.uDeep.value.fromArray(settings.deep);
		shared.uSubsurface.value.fromArray(settings.subsurface);
		const foam = settings.foam;
		shared.uFoam.value = foamTexture();
		shared.uFoamOn.value = foam.on ? 1 : 0;
		shared.uFoamThreshold.value = foam.threshold;
		shared.uFoamSlope.value = foam.slope;
		shared.uLaceSoft.value = foam.laceSoft;
		shared.uFoamOpacity.value = foam.opacity;
		shared.uFoamColour.value.fromArray(foam.colour);
		shared.uFoamRoughness.value = foam.roughness;
		shared.uSun.value.fromArray(sun);
		shared.uScatter.value.set(settings.scatter.strength, settings.scatter.viewPower, settings.scatter.facePower);
		shared.uGlowOn.value = settings.glowOn ? 1 : 0;
		shared.uMaskMax.value = crestMax;
		shared.uMaskGamma.value = settings.gamma;
		const roughness = settings.ringRoughness;
		rings.forEach(({ own }, i) => applyRing(own, ringUniforms(surface, i + 1), roughness[i]));
		applyRing(horizon.own, horizonUniforms(), roughness[roughness.length - 1]);
	}

	return {
		ringMaterials: rings.map((ring) => ring.material),
		horizonMaterial: horizon.material,
		update,
		laceMs: lace.ms,
	};
}
```

- [ ] **Step 5: Write `content/ocean/js/render/unleashedMeshes.js`**

```js
// A4 (not a twin): the Unleashed surface's meshes: one per patch over the ring's flat lattice (the
// vertex shader displaces it; nothing is written from JavaScript) and one per horizon quad. Each
// patch carries a `seamAxis` attribute for the seam averaging. Every frame sync() moves each patch
// to its ring's window (SurfaceState keeps worldX/worldZ current while Unleashed draws), hides the
// patches a finer ring covers by the CPU's own rule (patchCovered), follows the horizon, and refits
// the bounding spheres when the bounds grow (A3) -- the same spheres Roblox mode's meshes use,
// since the displacement they must contain is the same.
import * as THREE from 'three';
import * as HorizonState from '../engine/horizonState.js';
import { patchCovered, seamAxes } from '../engine/unleashedSurface.js';
import { patchIndices } from './oceanMeshes.js';

export function createUnleashedMeshes({ group, ocean, materials }) {
	const { surface, horizon } = ocean;
	const cells = surface.layout.spec.patchCells;
	const index = new THREE.BufferAttribute(new Uint16Array(patchIndices(cells)), 1);
	// One flat lattice (positions and upward normals) per ring, shared by its patches.
	const lattices = new Map();
	const latticeFor = (patch) => {
		if (!lattices.has(patch.ring)) {
			const count = patch.localX.length;
			const positions = new Float32Array(count * 3);
			const normals = new Float32Array(count * 3);
			for (let v = 0; v < count; v++) {
				positions[v * 3] = patch.localX[v];
				positions[v * 3 + 2] = patch.localZ[v];
				normals[v * 3 + 1] = 1;
			}
			lattices.set(patch.ring, { position: new THREE.BufferAttribute(positions, 3), normal: new THREE.BufferAttribute(normals, 3) });
		}
		return lattices.get(patch.ring);
	};
	const sphereRadius = (state) => {
		const reach = state.half + surface.bounds.lateral;
		return Math.hypot(reach, reach, surface.bounds.height);
	};
	let boundsVersion = surface.boundsVersion;
	let drawn = 0;
	let lastDrawnFrame = -1;
	const countDraw = () => {
		if (lastDrawnFrame !== ocean.frame) {
			lastDrawnFrame = ocean.frame;
			drawn += 1;
		}
	};

	const patchMeshes = surface.patches.map((state) => {
		const lattice = latticeFor(state.patch);
		const geometry = new THREE.BufferGeometry();
		geometry.setIndex(index);
		geometry.setAttribute('position', lattice.position);
		geometry.setAttribute('normal', lattice.normal);
		geometry.setAttribute('seamAxis', new THREE.BufferAttribute(seamAxes(state.patch), 2));
		geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), sphereRadius(state));
		const mesh = new THREE.Mesh(geometry, materials.ringMaterials[state.ring - 1]);
		mesh.position.set(state.worldX, 0, state.worldZ);
		mesh.onAfterRender = countDraw;
		group.add(mesh);
		return mesh;
	});

	const quadPositions = new Float32Array(HorizonState.CORNERS.flatMap(([x, z]) => [x * horizon.half, 0, z * horizon.half]));
	const quadNormals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
	const quadMeshes = horizon.quads.map(() => {
		const geometry = new THREE.BufferGeometry();
		geometry.setIndex(HorizonState.TRIANGLES.flat());
		geometry.setAttribute('position', new THREE.BufferAttribute(quadPositions, 3));
		geometry.setAttribute('normal', new THREE.BufferAttribute(quadNormals, 3));
		geometry.setAttribute('seamAxis', new THREE.BufferAttribute(new Float32Array(HorizonState.CORNERS.length * 2), 2));
		geometry.computeBoundingSphere();
		const mesh = new THREE.Mesh(geometry, materials.horizonMaterial);
		group.add(mesh);
		return mesh;
	});

	function sync() {
		if (surface.boundsVersion !== boundsVersion) {
			surface.patches.forEach((state, i) => {
				patchMeshes[i].geometry.boundingSphere.radius = sphereRadius(state);
			});
			boundsVersion = surface.boundsVersion;
		}
		const patches = surface.patches;
		for (let i = 0; i < patches.length; i++) {
			const state = patches[i];
			const mesh = patchMeshes[i];
			mesh.position.set(state.worldX, 0, state.worldZ);
			mesh.visible = !patchCovered(surface, state);
		}
		const quads = horizon.quads;
		for (let i = 0; i < quads.length; i++) {
			quadMeshes[i].position.set(quads[i].worldX, HorizonState.QUAD_Y, quads[i].worldZ);
		}
	}

	return { sync, patchMeshes, quadMeshes, drawnFrames: () => drawn };
}
```

- [ ] **Step 6: Replace `content/ocean/js/render/unleashed.js`**

```js
// A4 (not a twin): the Unleashed renderer. The same blended fields Roblox mode samples on the CPU
// go to the GPU as a float texture array; a vertex shader displaces the rings' lattice exactly as
// SurfaceSampler would; every pixel computes its own colour, foam, roughness, normal and glow at the
// fields' full resolution, lit by the same Three.js lights and sky reflections; the foam steps on
// the GPU at the finest cascade's cell. Built the first time Unleashed is asked for, never at page
// load; prepare() checks the foam target can be drawn into and compiles every shader with
// renderer.compileAsync, so the switch never stalls a frame on a compile. Each Unleashed frame,
// update() re-uploads the fields when they changed, keeps the peak mask's normaliser, steps the
// foam, and hands the shaders this frame's settings and window positions.
import * as THREE from 'three';
import { CASCADE_SLOTS, createCrestTracker, foamTexelsFor, LAYERS_PER_CASCADE } from '../engine/unleashedFields.js';
import { shadingSettings } from '../engine/unleashedShading.js';
import { createFieldTextures } from './fieldTextures.js';
import { createFoamPass } from './foamPass.js';
import { createUnleashedMaterials } from './unleashedMaterials.js';
import { createUnleashedMeshes } from './unleashedMeshes.js';

// What engine/unleashedSupport.js supportFor asks about this GPU.
export function readCapabilities(renderer, preset) {
	const gl = renderer.getContext();
	return Object.freeze({
		maxVertexTextures: renderer.capabilities.maxVertexTextures,
		maxTextureSize: renderer.capabilities.maxTextureSize,
		maxArrayLayers: gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS),
		colorBufferFloat: renderer.extensions.has('EXT_color_buffer_float'),
		colorBufferHalfFloat: renderer.extensions.has('EXT_color_buffer_half_float'),
		foamTexels: foamTexelsFor(preset),
		layers: preset.sizes.length * LAYERS_PER_CASCADE,
	});
}

export function createUnleashed({ view, ocean }) {
	const { preset } = ocean;
	if (preset.sizes.length > CASCADE_SLOTS) {
		throw new Error(`Unleashed draws at most ${CASCADE_SLOTS} cascades, the tier has ${preset.sizes.length}`);
	}
	const renderer = view.renderer;
	const texels = foamTexelsFor(preset);
	const fields = createFieldTextures(ocean);
	const foam = createFoamPass({ renderer, ocean, fieldsTexture: fields.texture, texels });
	const crest = createCrestTracker(ocean);
	const materials = createUnleashedMaterials({ ocean, fieldsTexture: fields.texture, foamTexture: () => foam.texture(), foamTexels: texels });
	const group = new THREE.Group();
	group.name = 'unleashed';
	group.visible = false;
	view.scene.add(group);
	const meshes = createUnleashedMeshes({ group, ocean, materials });
	let ready = false;
	let shown = false;
	let crestMax = 0;

	async function prepare() {
		const complete = foam.checkComplete();
		if (!complete.ok) {
			return complete;
		}
		await Promise.all([renderer.compileAsync(group, view.camera, view.scene), foam.compile()]);
		ready = true;
		return { ok: true, reason: null };
	}

	function update() {
		const settings = shadingSettings(ocean);
		fields.update();
		crestMax = crest.update(ocean.frame);
		foam.update(ocean.frame, settings);
		materials.update(settings, crestMax, view.sunDirection);
		meshes.sync();
		return settings;
	}

	function show(on) {
		shown = on;
		group.visible = on;
	}

	function probe() {
		return Object.freeze({
			prepared: ready,
			shown,
			fieldUploads: fields.uploads(),
			foamSteps: foam.steps(),
			foamTexels: texels,
			crestMax,
			drawnFrames: meshes.drawnFrames(),
			laceMs: materials.laceMs,
			meshes: meshes.patchMeshes.length + meshes.quadMeshes.length,
		});
	}

	// What the foam test needs to run FoamField on the CPU over exactly the fields the GPU stepped.
	function foamReference() {
		const painter = ocean.painter.mapsConfig;
		return {
			display: ocean.store.display,
			cascades: [...painter.colourCascades],
			tile: preset.textureTile,
			chop: ocean.live.chop,
			params: { whitecap: painter.foamWhitecap, grow: painter.foamGrow, decay: painter.foamDecay },
			gpuTexels: texels,
			steps: foam.steps(),
		};
	}

	return {
		group,
		prepare,
		update,
		show,
		ready: () => ready,
		probe,
		resetFoam: () => foam.reset(),
		readFoam: (points) => foam.readTexels(points),
		foamReference,
	};
}
```

- [ ] **Step 7: Run the browser tests and watch them pass**

Run: `OCEAN_PORT=8769 npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/unleashed.spec.js`
Expected: PASS: all 8 tests (many minutes under SwiftShader). A shader compile or link error appears as a console error and fails every test: fix the GLSL and its twin together. If `COLOUR_TOLERANCE`, `DIFFERENCE_FLOOR` or `RESTORE_TOLERANCE` fails on a page that renders correctly, save a screenshot of both modes (`page.screenshot`) to the scratchpad, report the measured values, and stop rather than changing the constant.

Run: `ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean && OCEAN_PORT=8769 npm run test:ocean:e2e`
Expected: PASS: the unit suite and every browser spec.

- [ ] **Step 8: Look at it**

Capture both modes at the deck and high shots with the clock frozen, to the scratchpad (not the repo), and look at them before reporting:

```bash
node -e "
const { chromium } = require('@playwright/test');
(async () => {
	const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
	const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
	for (const cam of ['deck', 'high']) {
		await page.goto('http://localhost:8769/ocean/?cam=' + cam + '&freeze=12&focus=origin&tier=High');
		await page.waitForFunction(() => (window.__ocean?.status().frame ?? 0) > 120, null, { timeout: 300000 });
		await page.screenshot({ path: process.argv[1] + '/a4-' + cam + '-roblox.png' });
		await page.evaluate(() => window.__ocean.setRenderMode('unleashed'));
		await page.waitForFunction(() => window.__ocean.renderMode().effective === 'unleashed', null, { timeout: 300000 });
		await page.waitForFunction(() => window.__ocean.unleashed.probe().foamSteps >= 12, null, { timeout: 300000 });
		await page.screenshot({ path: process.argv[1] + '/a4-' + cam + '-unleashed.png' });
	}
	await browser.close();
})();
" "$SCRATCHPAD"
```

(Start the server first with `python3 -m http.server 8769 --directory content &` and stop it afterwards; `$SCRATCHPAD` is the session's scratchpad directory.) Report, per shot, what differs between the two modes (faceting on near crests gone, foam shape, glow placement, far-field tone) and anything that looks wrong (seams, cracks between rings, sparkle, a horizon line, black or white pixels). Do not tune the look in this task: the report goes to Cole.

- [ ] **Step 9: Commit**

```bash
git add content/ocean/js/render/unleashedMaterials.js content/ocean/js/render/unleashedMeshes.js content/ocean/js/render/unleashed.js content/ocean/js/render/oceanMeshes.js tests/ocean/e2e/unleashed.spec.js
git commit -m "feat: the Unleashed surface: displaced on the GPU, shaded per pixel, lit like Roblox mode"
```

---

### Task 9: The live numbers in the readout, and the status line

**Files:**
- Modify: `content/ocean/js/ui/perfReadout.js`, `content/ocean/js/main.js`
- Modify: `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md` (the A4 status line)
- Test: `tests/ocean/e2e/unleashed.spec.js` (append)

**Interfaces:**
- Consumes: Task 7 `renderTimings()` (RenderTimings, plan Conventions) and the spec helpers; A3's `perfReadout.js` (`show(status, report)`).
- Produces: `perfReadout.show(status, report, modes = null)`: with `modes` (a RenderTimings) two more lines, `drawn by <effective>` (plus `(asked for <requested>: <reason>)` when they differ) and one summary per mode (`roblox cpu 3.10 ms  render 1.20 ms  58 fps  |  unleashed -`). Without `modes` the readout is A3's, unchanged.

- [ ] **Step 1: Append the failing browser test**

Append to `tests/ocean/e2e/unleashed.spec.js`:

```js
test('stats=1 shows which renderer draws and the live numbers for both modes', async ({ page }) => {
	test.setTimeout(420_000);
	const errors = await load(page, `${SHOT}&stats=1`);
	await expect(page.locator('#stats')).toContainText('drawn by roblox');
	await expect(page.locator('#stats')).toContainText('unleashed -');
	await page.evaluate(() => window.__ocean.setRenderMode('unleashed'));
	await waitForEffective(page, 'unleashed');
	await waitFrames(page, 4);
	await expect(page.locator('#stats')).toContainText('drawn by unleashed');
	await expect(page.locator('#stats')).not.toContainText('asked for');
	await expect(page.locator('#stats')).toContainText(/unleashed cpu [\d.]+ ms/);
	await expect(page.locator('#stats')).toContainText(/roblox cpu [\d.]+ ms/);
	expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `OCEAN_PORT=8769 npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/unleashed.spec.js -g "stats=1"`
Expected: FAIL: `#stats` never contains `drawn by roblox`.

- [ ] **Step 3: Add the mode lines to `content/ocean/js/ui/perfReadout.js`**

Add to the header comment: `// A4: with the render modes' timings, which renderer draws and each mode's live numbers (main-thread cpu, the render call, fps), measured in this browser.`

Above `export function createPerfReadout` add:

```js
function modeSummary(name, summary) {
	if (!summary) {
		return `${name} -`;
	}
	const fps = summary.fps == null ? '-' : summary.fps.toFixed(0);
	return `${name} cpu ${ms(summary.cpuMs)}  render ${ms(summary.renderMs)}  ${fps} fps`;
}
```

Change the signature `show(status, report) {` to `show(status, report, modes = null) {`, and immediately before `const text = lines.join('\n');` add:

```js
			if (modes) {
				const asked = modes.requested !== modes.effective ? ` (asked for ${modes.requested}: ${modes.reason})` : '';
				lines.push(`drawn by ${modes.effective}${asked}`, `${modeSummary('roblox', modes.roblox)}  |  ${modeSummary('unleashed', modes.unleashed)}`);
			}
```

- [ ] **Step 4: Pass the timings from `content/ocean/js/main.js`**

Replace `if (config.stats) readout.show(Ocean.status(ocean), Ocean.report(ocean));` with:

```js
		if (config.stats) readout.show(Ocean.status(ocean), Ocean.report(ocean), modes.renderTimings());
```

- [ ] **Step 5: Run the browser tests and watch them pass**

Run: `OCEAN_PORT=8769 npx playwright test -c playwright.ocean.config.js tests/ocean/e2e/unleashed.spec.js -g "stats=1"`
Expected: PASS.

- [ ] **Step 6: Record A4 in the spec's status lines**

In `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md`, add after the `**A3 (teaching stages, engine side):**` line. Fill `<sha>` from `git log -1 --format=%h` run now (Task 8's commit, the one that finished the surface), `<U>` and `<B>` from the counts the last `ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean` and `OCEAN_PORT=8769 npm run test:ocean:e2e` runs printed, and `<lace>` from `window.__ocean.unleashed.probe().laceMs` as the Task 8 capture script's page reported it (add `console.log(await page.evaluate(() => window.__ocean.unleashed.probe().laceMs))` to that script and run it once):

```markdown
**A4 (Unleashed):** done on 2026-09-30 at commit `<sha>`: the finale's toggle (`render/renderMode.js`: `setRenderMode`, `getRenderMode`, `renderTimings`, `prepareUnleashed`). The blended fields go to the GPU as one RGBA32F texture array; a vertex shader displaces the rings' lattice with SurfaceSampler's fades, skirts and seams; every pixel computes its own colour (WaterColour's ramp), foam, roughness, normal (all shown cascades) and glow (PeakMask times ScatterLobe per pixel) on the same Three.js lighting and sky reflections as Roblox mode; the foam steps FoamField's rule on the GPU at a quarter stud (1,024 texels over the tile on High). In Unleashed the CPU vertex write, the painter and the per-patch glow stop; the cascades, the blend and the window snapping are unchanged. Every shader function has a JavaScript twin tested against the core. Unleashed draws the painted FFT sea only (steps 7 to 13); earlier steps keep Roblox mode and say why. <U> unit and <B> browser tests. Building it costs about <lace> ms once (the lace, SwiftShader) plus a shader compile, both before the switch. Not yet measured: frame rates on a real GPU and a phone in either mode; Cole has not seen Unleashed.
```

- [ ] **Step 7: Run everything once more**

Run: `ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean && OCEAN_PORT=8769 npm run test:ocean:e2e`
Expected: PASS, both suites.

- [ ] **Step 8: Commit**

```bash
git add content/ocean/js/ui/perfReadout.js content/ocean/js/main.js tests/ocean/e2e/unleashed.spec.js docs/superpowers/specs/2026-09-27-ocean-showcase-design.md
git commit -m "feat: the readout shows which renderer draws and both modes' live numbers; A4's status line"
```
