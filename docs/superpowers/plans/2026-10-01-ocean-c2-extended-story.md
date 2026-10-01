# Ocean Showcase C2: The Extended Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the scrolling story of `content/ocean/index.html` as 27 steps in six chapters plus the finale, Acerola-paced: a dark flat graph of one sine that becomes the 3D surface in one camera swing, normals and slopes on the surface, light split into its terms, frequency-domain charts, the real textures and their sampling, and an always-on math box (a top-right card on desktop, a pinned bar on phones).

**Architecture:** One contract task (Task 0) fixes the 28 step ids, the recipe schema and a recipe skeleton for every step, the DOM slots, the module interfaces (stub modules that already work) and the shared test helpers, and generalises everything that assumed 13 steps. Seven lanes then run at the same time, each in its own git worktree on its own port, each owning a disjoint set of files: the math box (A), the graph stage and the swing (B), the surface overlays (C), the lighting terms (D), the frequency charts (E), the texture insets (F) and the copy (G). An integration task merges the lanes in a fixed order and reconciles them; a final walk checks the whole page in motion on desktop and phone.

**Tech Stack:** Plain ES modules, no build step; three@0.186.1, gsap@3.15.0 and katex@0.18.10 from cdn.jsdelivr.net through the page's import map (nothing new). Node 25 `node --test` for browser-free modules; `@playwright/test` 1.63.0, headless Chromium drawing on the GPU through ANGLE Metal.

**Spec:** `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md`, section 10 ("C2: the extended story", binding; it supersedes section 3's table), section 1 (honesty rules, credits), section 2 (layout, reduced motion, no-WebGL), section 4 (engine), and the decisions lists. Interfaces built on: `docs/superpowers/plans/2026-09-30-ocean-a3-teaching-stages.md` (director, recipes, blend, stage look, dev route), `docs/superpowers/plans/2026-09-30-ocean-c-page.md` (story, story stage, controls, math, charts, finale, copy check), and the rulings in `/Users/cole/Projects/Wesbite-ocean/.superpowers/sdd/2026-09-30-ocean-c-page/progress.md`.

**Decisions this plan takes, so no task re-decides them:**

- **28 sections:** 27 teaching steps plus the finale (step 28). Steps are named by kebab-case ids in `content/ocean/js/stages/steps.js`; code and tests take numbers only from `stepOf(id)`. Section elements keep `id="step-N"` (N from the order) and gain `data-step-id`.
- **Recipes split by chapter file**, each file owned by one lane after Task 0: `stages/chapters/waves.js` (steps 1 to 6, lane B), `light.js` (7, 10, 11, lane D), `vectors.js` (8, 9, lane C), `betterWaves.js` (12, 13, lane B), `realOcean.js` (14 to 21, lane E), `textures.js` (22 to 25, lane F), `finish.js` (26 to 28, frozen). `recipes.js` assembles them in `STEP_IDS` order and fails loudly on a missing or extra id.
- **Lanes tune, Task 0 decides:** a lane may change shots, slider ranges and defaults and the values inside its own chapter's recipes, and nothing else about them. It may not add or remove a step, a slider id, a look or engine field, or change a step's source, material, overlay kind or chart switch; those are the contract. A lane that finds the contract wrong stops and reports.
- **The flat graph** is drawn in the main canvas by `render/graphStage.js` from `ocean.waves` through `WaveSampler`; the surface is clipped to the band `[-near, far]` around the plane x = 0 by the stage look; heights on the graph are drawn `GRAPH_Y_SCALE` = 4 times taller (labelled); the 2D camera looks along +x from `GRAPH_SHOT`.
- **The teaching bank's spread** is a new engine field `bank.fan` (0 to 1), lerped by the blend; `WaveBanks.withFan(bank, 1)` returns the bank itself, so every A3 test of the bank still holds.
- **Lighting terms** are a new material, `'terms'`, with `look.terms = { diffuse, specular, fresnel }`; `c = (1 − F)(c_sea (a + max(0, n·s)) + (n·h)^p) + F c_sky`. The painted materials are never touched.
- **The math box's data** lives in `content/ocean/js/page/mathSteps.js` (lane A), one `{ tex, changed }` per step id; its sentences carry no digits.
- **Page features** start from `ui/page.js` through four stubs Task 0 writes and their lanes fill: `ui/mathBox.js` (A), `ui/overlayReadout.js` (C), `ui/frequencyCharts.js` (E), `ui/insets.js` (F). Each lane with styles has its own stylesheet, linked by Task 0: `/ocean/css/mathbox.css` (A), `/ocean/css/frequency.css` (E), `/ocean/css/insets.css` (F).
- **Steps 16 to 19 run the FFT sea without chop**; step 20 brings it in. The clearance check reads each lens against its own frame's chop.
- **Copy:** lane G owns every word of `index.html` and the copy-check sources. Other lanes put no digit in static text they build in JavaScript; computed numbers go inside `data-copy-skip="live"` elements.

## Global Constraints

- Work starts from branch `ocean-page` in `/Users/cole/Projects/Wesbite-ocean-page` once Task 9b (phone gyroscope) and Task 8's fix round 2 of the C plan have landed there (Task 0 Step 1 checks). Task 0, Task 14 and Task 15 run in that worktree on `OCEAN_PORT=8774`. Each lane runs in its own worktree (see "Lanes and waves"). Never touch `/Users/cole/Projects/Wesbite` or `/Users/cole/Projects/Wesbite-ocean`. Nothing is deployed: never run `scripts/deploy.sh`, never push.
- **File ownership is exclusive.** A lane creates or modifies only the files listed for it in "Lanes and waves". Every other file is the contract's (Task 0's), changed again only by Tasks 14 and 15. A lane that needs a change to a file it does not own stops and reports; it never edits it.
- No build step. External code only through the import map in `index.html`: `three@0.186.1`, `gsap@3.15.0`, `katex@0.18.10` (and B's `luau-web@1.4.0` in its worker). No new library. Stylesheets: the page's own and `katex@0.18.10/dist/katex.min.css`.
- **Boot rule:** `content/ocean/js/boot.js` and everything it imports statically never import `three`, `three/addons/...`, `gsap` or `katex` (`tests/ocean/page/bootGraph.test.js`). `ui/page.js` and the four page-feature modules are in that graph: KaTeX only through `loadKatex()` from `ui/math.js` (a dynamic import), three never.
- Browser-free code (`js/page/`, `js/engine/`, `js/stages/`, `js/core/`) imports cleanly in Node: no `window`, `document`, no three. DOM code lives in `js/ui/`; three.js code in `js/render/`. Unit tests in `tests/ocean/{page,stages,engine}/`, browser tests in `tests/ocean/e2e/`, never under `content/`.
- **Site-absolute paths** for every asset `index.html` references (`/ocean/style.css`, `/ocean/css/*.css`, `/ocean/js/boot.js`); the page must load at `/ocean` with no trailing slash.
- **Copy:** first person, casual, true, never overstated. Every number in the page's text sits inside a phrase in `tests/ocean/page/copySources.js` whose quote exists in its named source; computed numbers only inside `data-copy-skip="live"` elements, labelled as measured or computed in the visitor's browser; maths inside `.tex[data-copy-skip="math"]` only. No wave count in the copy ("the whole bank", never a number of waves). Words, not digits, for chapter labels and titles ("Chapter one", "From a line to a surface"). Acerola is credited as the inspiration for the order; no sentence reuses or closely paraphrases his wording or his images (no Plato's cave, no projector crank, no pasta, no spell levels, no "free salad").
- **Honesty facts the copy keeps:** the three layers hide the 256-stud tiling, they do not remove it; at most 3 × 64 × 64 = 12,288 wave components on a CPU script beside Acerola's about 4 million on the GPU; the teaching bank is Gerstner, as the original Roblox prototype was; its headings lie within 45° either side of one heading (never "all directions"); the phase arrows turn "at the speeds the dispersion gives them, looping every 120 s"; phones get the lighter tier by rule, unmeasured; native code on a live Roblox client is unmeasured; the page is not pixel-identical to Roblox.
- **Roblox mode without `?step` stays identical to A2** until the first scroll: no stage look, no clip, no graph, no overlay touches it.
- **Performance:** no `backdrop-filter`, no new CSS `filter`. No per-frame DOM writes except the phase arrows' existing ones; live numbers update at most twice a second; insets redraw at most four times a second (the sampling inset ten) and only while on screen. The per-frame render paths (graph, overlays, terms) allocate nothing per frame: buffers and scratch vectors are made once. Motion reads the play clock (`Ocean.teachTime`, `ocean.teachT`), never the frame's `dt`; with the clock stopped, eased things go straight to their targets.
- **Kept behaviours:** the hold while reading (`holdThenBlend`), the flat-sea hold on jumps into FFT steps, the finale's drift and ease back, orbit limits (`STORY_MAX_DISTANCE` 450, tilt range, floor), the read-only director for other steps (`slidersFor`/`valueOf`, never `setStep` flips for reads), reduced motion (cuts, no blending, no drift, no pulses), the gyroscope, the phone layout (ocean in the top half, no horizontal scroll from 320 px).
- **Shots:** every recipe shot and every blend between neighbours passes `tests/ocean/stages/clearance.test.js` (lens clearance), `tests/ocean/stages/shots.test.js` (world edge) and `tests/ocean/page/orbitLimits.test.js` (reach and tilt). Lanes run these; they never edit them.
- Files use tabs. Every new file opens with a header comment saying what it is, that it is piece C2's and which lane owns it. No `Math.random` anywhere (the engine's `core/random.js` is the only generator).
- Unit tests: `ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean` from the worktree root; a single file: `node --test tests/ocean/page/<file>.test.js`. Browser tests: `OCEAN_PORT=<lane port> npm run test:ocean:e2e -- tests/ocean/e2e/<file>.spec.js`. Wait in frames; read canvases inside `requestAnimationFrame`. Thresholds are chosen before measuring; if one fails on a page that behaves correctly, report the measured value, never lower it silently. `OCEAN_GL=swiftshader` only to compare a suspected GPU quirk.
- Commit messages `<type>: <description>` (feat, fix, test, docs, chore, refactor), no trailers. A hook blocks any Bash command containing `git commit` with a `-n` flag: never use `-n` or `--no-verify`; run `git commit` in its own command.
- Subagents (implementers and reviewers) run on opus and never use the Roblox Studio MCP tools.

## Review Focus

Inputs a visitor's browser will produce that the spec implies but no step row names, most likely first; each has its test in the named task:

1. **A fling across the flat graph's boundary** (the End key from step 2, Home from the finale, a find-in-page jump from step 2 into step 16): the clip band, the backdrop and the orbit hold land on the target step's values at once, no frame shows water at the lens or the sea through a half-drawn graph, and nothing throws. Test in Task 4 ("a fling across the graph's boundary lands clean").
2. **KaTeX never arrives** (a blocked CDN, offline): the math box shows each step's TeX source, readable, and its "what changed" line still follows the scroll; nothing throws uncaught and nothing waits forever. Test in Task 1 ("the box reads as TeX source when KaTeX is blocked").
3. **A phone 320 px wide** (and 390): the pinned bar never covers a panel's text, the page never scrolls sideways, the sheet opens and closes by tap, Enter and Escape, and focus goes back to the bar. Test in Task 2 ("the pinned bar at 320 and 390 px").
4. **The Medium tier** (phones by rule: two layers, smaller lattice): the field, sampling and painted-map insets read the layers and texture sizes this tier has, with no error and nothing blank. Test in Task 11 ("every inset works on Medium").
5. **Sliders at their ends on the new steps** (spread 0 and 1, sample spacing 0.5 and 16 studs): every arrow stays finite and drawn, the live readout stays a finite number, and no NaN reaches a vertex buffer. Test in Task 6 ("the overlays hold at the sliders' ends").

## Lanes and waves

Wave 0 runs alone; every lane of wave 1 starts at the same moment from the tag `c2-contract`; within a lane its tasks run in order. Wave 2 and wave 3 run in `ocean-page` after every lane has finished.

| Wave | Lane | Tasks | Worktree, branch | Port | Depends on | Files owned (create C, modify M) |
|---|---|---|---|---|---|---|
| 0 | Contract | 0 | `Wesbite-ocean-page`, `ocean-page` | 8774 | C plan Task 9b and Task 8 round 2 landed | Everything not listed below; after Task 0, only Tasks 14 and 15 change these |
| 1 | A: math box | 1, 2 | `Wesbite-ocean-c2-a`, `ocean-c2-a` | 8781 | Task 0 | M `content/ocean/js/page/mathSteps.js`; C `content/ocean/js/page/mathBoxModel.js`; M `content/ocean/js/ui/mathBox.js`; M `content/ocean/css/mathbox.css`; C `tests/ocean/page/mathSteps.test.js`; C `tests/ocean/page/mathBoxModel.test.js`; C `tests/ocean/e2e/mathBox.spec.js` |
| 1 | B: graph and swing | 3, 4 | `Wesbite-ocean-c2-b`, `ocean-c2-b` | 8782 | Task 0 | M `content/ocean/js/render/graphStage.js`; C `content/ocean/js/page/graphModel.js`; C `content/ocean/js/render/graphLabels.js`; M `content/ocean/js/stages/chapters/waves.js`; M `content/ocean/js/stages/chapters/betterWaves.js`; C `tests/ocean/page/graphModel.test.js`; C `tests/ocean/e2e/graph.spec.js` |
| 1 | C: surface overlays | 5, 6 | `Wesbite-ocean-c2-c`, `ocean-c2-c` | 8783 | Task 0 | M `content/ocean/js/render/surfaceOverlays.js`; C `content/ocean/js/page/overlayModel.js`; M `content/ocean/js/ui/overlayReadout.js`; M `content/ocean/js/stages/chapters/vectors.js`; C `tests/ocean/page/overlayModel.test.js`; C `tests/ocean/e2e/overlays.spec.js` |
| 1 | D: lighting terms | 7 | `Wesbite-ocean-c2-d`, `ocean-c2-d` | 8784 | Task 0 | M `content/ocean/js/render/stageLook.js`; C `content/ocean/js/render/termsMaterial.js`; C `content/ocean/js/page/lightTerms.js`; M `content/ocean/js/stages/chapters/light.js`; C `tests/ocean/page/lightTerms.test.js`; C `tests/ocean/e2e/lightTerms.spec.js` |
| 1 | E: frequency charts | 8, 9 | `Wesbite-ocean-c2-e`, `ocean-c2-e` | 8785 | Task 0 | C `content/ocean/js/page/frequencyMath.js`; M `content/ocean/js/ui/frequencyCharts.js`; M `content/ocean/js/ui/charts.js`; M `content/ocean/css/frequency.css`; M `content/ocean/js/stages/chapters/realOcean.js`; C `tests/ocean/page/frequencyMath.test.js`; C `tests/ocean/e2e/frequency.spec.js`; M `tests/ocean/e2e/charts.spec.js` |
| 1 | F: texture insets | 10, 11 | `Wesbite-ocean-c2-f`, `ocean-c2-f` | 8786 | Task 0 | C `content/ocean/js/page/fieldViews.js`; M `content/ocean/js/ui/insets.js`; M `content/ocean/css/insets.css`; M `content/ocean/js/stages/chapters/textures.js`; C `tests/ocean/page/fieldViews.test.js`; C `tests/ocean/e2e/insets.spec.js` |
| 1 | G: copy | 12, 13 | `Wesbite-ocean-c2-g`, `ocean-c2-g` | 8787 | Task 0 | M `content/ocean/index.html` (words only: never its sections, ids, slots, `data-*` attributes or links); M `tests/ocean/page/copySources.js`; M `tests/ocean/page/facts.test.js`; C `tests/ocean/page/wording.test.js` |
| 2 | Integration | 14 | `Wesbite-ocean-page`, `ocean-page` | 8774 | Tasks 1 to 13 | Any file, to merge and reconcile |
| 3 | Final walk | 15 | `Wesbite-ocean-page`, `ocean-page` | 8774 | Task 14 | Any file, for the fixes the walk finds |

Every lane's first task begins by making its worktree (the commands are in that task). Each lane's tests run in isolation: its own unit test files with `node --test`, its own spec file with its own port, then the whole unit suite and the shared shot checks before each commit.

## The contract (what Task 0 fixes for every lane)

**Step ids** (`content/ocean/js/stages/steps.js`), in order, with chapters starting at `sine`, `unlit`, `gerstner`, `frequency`, `fields`, `foam`:

`sine`, `moving-sine`, `sum-of-sines`, `into-3d`, `directions`, `many-waves`, `unlit`, `normals`, `slopes`, `diffuse`, `highlights`, `gerstner`, `tiling`, `frequency`, `fourier`, `jonswap`, `random-sea`, `time`, `fft`, `choppiness`, `layers`, `fields`, `sampling`, `mesh`, `painted`, `foam`, `glow`, `finale`.

Exports: `STEP_IDS`, `STEP_COUNT` (28), `CHAPTERS` (`{ number, first, title }`), `stepOf(id) -> number`, `idOf(step) -> string`, `chapterOf(step) -> chapter`. `recipes.js` re-exports `STEP_COUNT`.

**Graph constants** (`content/ocean/js/stages/graph.js`, browser-free): `GRAPH_PLANE_X = 0`, `NO_CLIP = 4096`, `FLAT_BAND = 0.5`, `GRAPH_Y_SCALE = 4`, `GRAPH_HOLD = 0.5`, `GRAPH_OFF = { opacity: 0, yScale: 1, near: NO_CLIP, far: NO_CLIP, components: false }`, `graphBand(graph) -> null | [xMin, xMax]` (null when both `near` and `far` are at least `NO_CLIP`).

**Recipe schema additions** (every recipe has every field; `BASE` in `stages/recipeKit.js`):

| Field | Values | Blend |
|---|---|---|
| `engine.bank.fan` | 0 .. 1 (0: every wave along +z on the 256-stud lattice; 1: the bank as built) | lerp |
| `look.material` | `'white'`, `'sea'`, `'painted'`, `'terms'` | snap at 0.5 |
| `look.terms` | `{ diffuse, specular, fresnel }` booleans (read when the material is `'terms'`) | snap |
| `look.graph` | `{ opacity 0..1, yScale >= 1, near > 0, far > 0, components boolean }` | opacity and yScale lerp; near and far lerp on a log scale; components snaps |
| `look.overlay` | `{ kind: null \| 'directions' \| 'normals' \| 'slopes', spacing > 0 (studs; the central difference's h) }` | kind snaps; spacing lerps |
| `charts.phaseArrows` | `false`, `'still'`, `'turning'` | snap |
| `charts.notes` | `null` or three booleans (step 15's tones) | snap |

`engineSettings(blended).normals` is true for `'painted'`, `'terms'` and lit `'sea'`.

**Render hooks** (wired by Task 0 into `ui/storyStage.js` and `ui/devStage.js`):

- `createGraphStage({ view, ocean, look, reducedMotion = false }) -> { apply(graph), frame(t), probe() }` in `render/graphStage.js`. `apply` takes the blended `look.graph` before `Ocean.step`; `frame` takes `ocean.teachT` after it. `probe()` returns `{ opacity, shown, yScale, band: null | [xMin, xMax], emptied, components, curve: null | { points, maxAbsY, first: [x, y, z], last: [x, y, z] } }`.
- `createSurfaceOverlays({ view, ocean }) -> { apply(overlay), frame(t, focus), probe() }` in `render/surfaceOverlays.js`; `focus` is `[x, z]` (what the rings follow). `probe()` returns `{ kind, arrows, spacing, meanAngle: null | number, finite: boolean }`.
- `stageLook.setClip(planes | null)`: clips every surface material (the shared ones, the wireframe, the 232 painted ones) to `planes` (an array of `THREE.Plane`), or none. `stageLook.probe()` adds `clipped` (boolean) and `terms` (`null` or `{ diffuse, specular, fresnel }`).
- `rig.holdOrbit(held)`: holds the visitor's orbit while true; the story holds it while the blended `look.graph.opacity >= GRAPH_HOLD`, and the phone's tilt offset is dropped then too.
- Story hooks (`window.__ocean.story`) and dev hooks (`window.__ocean.stage`) gain `graph()` and `overlays()`. The story stage's `charts.phaseArrows(t = ocean.t)` takes an optional time (step 17's arrows are drawn still at t = 0).

**Page features** (wired by Task 0 into `ui/page.js`; each returns `{ hooks }`, published on `window`):

- `mountMathBox({ root, watchReading, reducedMotion })` (`ui/mathBox.js`, starts with the page, no ocean) -> `window.__mathbox`.
- `mountOverlayReadout({ handle, watchReading })` (`ui/overlayReadout.js`, story mode) -> `window.__overlayReadout`.
- `mountFrequencyCharts({ story, ocean, onLayout })` (`ui/frequencyCharts.js`, story mode) -> `window.__frequency`.
- `mountInsets({ handle, watchReading, onLayout })` (`ui/insets.js`, story mode) -> `window.__insets`.
- `watchReading(listener)` is the scroll story's `onChange` (called at once with the current reading, then on every change; returns an unsubscribe). `handle` is what `startOcean` returns (`ocean`, `materials`, `story`, `view`, ...).

**DOM slots** (Task 0 writes them; lane G never moves them):

- `<aside id="mathbox" class="mathbox" data-mathbox aria-label="The math so far" hidden></aside>` after `#stats`.
- Every step: `<section class="step" id="step-N" data-step="N" data-step-id="ID" aria-labelledby="step-N-title">`; a chapter's first step's panel opens with `<p class="chapter">Chapter one · One wave</p>` (words).
- `figure.inset[data-inset="fields"]` (step 22), `[data-inset="sampling"]` (23), `[data-inset="painted"]` (25), each `<div class="inset-body" data-copy-skip="live"></div>` then a `<figcaption>`.
- `figure.chart[data-chart="frequency"]` (14), `[data-chart="fourier"]` (15), `[data-chart="spectrum"]` (16), `[data-chart="phase"][data-motion="still"]` (17), `[data-chart="phase"][data-motion="turning"]` (18), `[data-chart="transforms"]` (19), each with `.chart-body[data-copy-skip="live"]` and a figcaption.
- `<p class="readout" data-readout="slopes" data-copy-skip="live"></p>` in step 9.
- Stylesheets after `/ocean/style.css`: `/ocean/css/mathbox.css`, `/ocean/css/frequency.css`, `/ocean/css/insets.css`.

**Slider ids** (all in `page/sliderModel.js TERM_BY_SLIDER`): existing ids keep their terms, except `wireframe` now has none (`null`). New: `fan` -> `t-dir`, `spacing` -> `t-h`, `specular` -> `t-spec`, `fresnel` -> `t-fresnel`, `note1`, `note2`, `note3` -> `t-note`. A slider's term must appear as `\htmlClass{t-...}` both in its step's panel math (`index.html`, lane G) and in its step's box math (`mathSteps.js`, lane A).

**Shared test helpers** (Task 0): `tests/ocean/e2e/helpers/stage.js` (`load`, `waitFrames`, `stage`, `story`, `grid`, `meanDiff`, `mean`, `spread`, `lowerHalfMotion`, `watchErrors`), `tests/ocean/e2e/helpers/story.js` (existing, plus `scrollToId`), `tests/ocean/stages/frames.js` (`everyFrame`, `lensIsDry`, `edgeBand`), `tests/ocean/page/structure.js` (`CARD_STEP_IDS`, `SLOTS`, `structureOf(html)`).

## File map

New, Task 0: `js/stages/steps.js`, `js/stages/graph.js`, `js/stages/recipeKit.js`, `js/stages/chapters/{waves,light,vectors,betterWaves,realOcean,textures,finish}.js`, `js/render/graphStage.js` (clip only), `js/render/surfaceOverlays.js` (stub), `js/ui/{mathBox,overlayReadout,frequencyCharts,insets}.js` (stubs), `js/page/mathSteps.js` (skeleton), `css/{mathbox,frequency,insets}.css` (headers), `tests/ocean/stages/steps.test.js`, `tests/ocean/stages/frames.js`, `tests/ocean/page/structure.js`, `tests/ocean/page/structure.test.js`, `tests/ocean/e2e/helpers/stage.js`, `tests/ocean/e2e/contract.spec.js`.

Modified, Task 0: `js/stages/recipes.js` (assembler), `js/stages/blend.js`, `js/stages/route.js`, `js/engine/waveBanks.js`, `js/engine/stageControl.js`, `js/engine/ocean.js` (two fields), `js/render/stageLook.js`, `js/render/cameraRig.js`, `js/ui/storyStage.js`, `js/ui/devStage.js`, `js/ui/page.js`, `js/ui/charts.js`, `js/ui/liveTiming.js`, `js/page/scrollMap.js`, `js/page/knobs.js`, `js/page/sliderModel.js`, `index.html`, `style.css`, `scripts/ocean-stage-capture.mjs`, and every test that names a step by number (the list is in Task 0 Step 11).

Each lane's files are in "Lanes and waves".

---

## Wave 0

### Task 0: The contract: 28 steps, the recipe skeleton, the slots, the stubs and the shared helpers

The page must work at the end of this task (placeholder copy for new steps, the existing copy moved to where it is still true), with every existing test passing after it is renamed to step ids, and the new contract tests passing.

**Files:**
- Create: `content/ocean/js/stages/steps.js`, `content/ocean/js/stages/graph.js`, `content/ocean/js/stages/recipeKit.js`, `content/ocean/js/stages/chapters/waves.js`, `.../chapters/light.js`, `.../chapters/vectors.js`, `.../chapters/betterWaves.js`, `.../chapters/realOcean.js`, `.../chapters/textures.js`, `.../chapters/finish.js`, `content/ocean/js/render/graphStage.js`, `content/ocean/js/render/surfaceOverlays.js`, `content/ocean/js/ui/mathBox.js`, `content/ocean/js/ui/overlayReadout.js`, `content/ocean/js/ui/frequencyCharts.js`, `content/ocean/js/ui/insets.js`, `content/ocean/js/page/mathSteps.js`, `content/ocean/css/mathbox.css`, `content/ocean/css/frequency.css`, `content/ocean/css/insets.css`
- Create (tests): `tests/ocean/stages/steps.test.js`, `tests/ocean/stages/frames.js`, `tests/ocean/page/structure.js`, `tests/ocean/page/structure.test.js`, `tests/ocean/e2e/helpers/stage.js`, `tests/ocean/e2e/contract.spec.js`
- Modify: `content/ocean/js/stages/recipes.js` (replaced), `content/ocean/js/stages/blend.js`, `content/ocean/js/stages/route.js`, `content/ocean/js/engine/waveBanks.js`, `content/ocean/js/engine/stageControl.js`, `content/ocean/js/engine/ocean.js`, `content/ocean/js/render/stageLook.js`, `content/ocean/js/render/cameraRig.js`, `content/ocean/js/ui/storyStage.js`, `content/ocean/js/ui/devStage.js`, `content/ocean/js/ui/page.js`, `content/ocean/js/ui/charts.js`, `content/ocean/js/ui/liveTiming.js`, `content/ocean/js/page/scrollMap.js`, `content/ocean/js/page/knobs.js`, `content/ocean/js/page/sliderModel.js`, `content/ocean/index.html`, `content/ocean/style.css`, `scripts/ocean-stage-capture.mjs`, `tests/ocean/page/copySources.js`, `tests/ocean/page/facts.test.js`
- Modify (tests renamed to step ids): `tests/ocean/stages/{recipes,blend,director,route,clearance,shots,crests,sliders}.test.js`, `tests/ocean/engine/{waveBanks,stageControl,bounds}.test.js`, `tests/ocean/page/{scrollMap,shotControl,sliderModel,orbitLimits,spectrumLayout,facts,knobs}.test.js`, `tests/ocean/e2e/{stageSteps,stages,storyStage,story,controls,charts,math,layout,tilt,features,finale,copy}.spec.js`

**Interfaces:**
- Consumes: the A3 director (`createDirector`, `setStep`, `setSlider`, `slidersFor`, `valueOf`, `frame`), `blendRecipes`, `engineSettings`, `WaveBanks.teachingBank`/`withCount`/`nextSine`, `createStageLook`, `createCameraRig`, the C page features in `ui/page.js`.
- Produces: everything in "The contract" above, exactly as named there. In particular `stepOf`, `idOf`, `chapterOf`, `STEP_IDS`, `STEP_COUNT`, `CHAPTERS`; `GRAPH_*`, `NO_CLIP`, `FLAT_BAND`, `graphBand`; `WaveBanks.withFan(full, fan, tile?)`; `createGraphStage`, `createSurfaceOverlays`, `stageLook.setClip`, `rig.holdOrbit`; `mountMathBox`, `mountOverlayReadout`, `mountFrequencyCharts`, `mountInsets`; `MATH_STEPS`, `mathFor(id)`; the test helpers.

- [ ] **Step 1: Check the starting point**

Run:
```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git status --short && git log --oneline -15 && ls content/ocean/js/ui/tilt.js content/ocean/js/page/tiltLook.js tests/ocean/e2e/tilt.spec.js
```
Expected: a clean tree; the log shows the C plan's Task 9b (gyroscope) commit and Task 8's fix round 2 commit; the three tilt files exist and are tracked. If the tree is dirty or either commit is missing, stop and report: C2 builds on both. Then run the suites once to know the baseline:
```bash
cd /Users/cole/Projects/Wesbite-ocean-page && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -5 && OCEAN_PORT=8774 npm run test:ocean:e2e 2>&1 | tail -5
```
Expected: every test passes. Note the counts in the task report.

- [ ] **Step 2: Write the failing steps test**

Create `tests/ocean/stages/steps.test.js`:
```js
// The story's step ids (piece C2, Task 0): 27 steps in six chapters plus the finale, named so code
// and tests never hard-code a step number (spec section 10.7).
import { test } from 'node:test';
import * as expect from '../expect.js';
import { CHAPTERS, STEP_COUNT, STEP_IDS, chapterOf, idOf, stepOf } from '../../../content/ocean/js/stages/steps.js';

test('28 unique kebab-case ids, in the spec order, the finale last', () => {
	expect.equal(STEP_COUNT, 28, 'twenty-seven steps and the finale');
	expect.equal(STEP_IDS.length, STEP_COUNT, 'one id per step');
	expect.equal(new Set(STEP_IDS).size, STEP_COUNT, 'unique');
	expect.truthy(STEP_IDS.every((id) => /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(id)), 'kebab-case');
	expect.equal(STEP_IDS.join(','), 'sine,moving-sine,sum-of-sines,into-3d,directions,many-waves,unlit,normals,slopes,diffuse,highlights,gerstner,tiling,frequency,fourier,jonswap,random-sea,time,fft,choppiness,layers,fields,sampling,mesh,painted,foam,glow,finale', 'order');
	expect.truthy(Object.isFrozen(STEP_IDS), 'frozen');
});

test('stepOf and idOf are inverses, and both refuse what is not a step', () => {
	STEP_IDS.forEach((id, i) => {
		expect.equal(stepOf(id), i + 1, id);
		expect.equal(idOf(i + 1), id, `step ${i + 1}`);
	});
	for (const bad of ['flat-plane', '', 'Sine']) {
		let message = '';
		try { stepOf(bad); } catch (error) { message = error instanceof RangeError ? error.message : String(error); }
		expect.truthy(message.includes('no step'), `stepOf(${JSON.stringify(bad)})`);
	}
	for (const bad of [0, 29, 1.5, '1']) {
		let message = '';
		try { idOf(bad); } catch (error) { message = error instanceof RangeError ? error.message : String(error); }
		expect.truthy(message.includes('step'), `idOf(${JSON.stringify(bad)})`);
	}
});

test('six chapters, in order, each starting where the spec says, every step in one', () => {
	expect.equal(CHAPTERS.map((c) => c.first).join(','), 'sine,unlit,gerstner,frequency,fields,foam', 'chapter starts');
	expect.equal(CHAPTERS.map((c) => c.number).join(','), '1,2,3,4,5,6', 'numbers');
	expect.equal(CHAPTERS.map((c) => c.title).join('|'), 'One wave|Light|Better waves|The real ocean|Textures|The look', 'titles');
	expect.equal(chapterOf(stepOf('sine')).number, 1, 'step 1');
	expect.equal(chapterOf(stepOf('highlights')).number, 2, 'the last of chapter two');
	expect.equal(chapterOf(stepOf('finale')).number, 6, 'the finale ends chapter six');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd /Users/cole/Projects/Wesbite-ocean-page && node --test tests/ocean/stages/steps.test.js`
Expected: FAIL, `Cannot find module .../stages/steps.js`.

- [ ] **Step 4: Write `steps.js` and `graph.js`**

Create `content/ocean/js/stages/steps.js`:
```js
// The story's steps by name (piece C2, Task 0; not a twin). The extended story (spec section 10)
// has 27 steps in six chapters plus the finale. Every module and test names a step by its id here and
// takes its number from stepOf, so a step can move without a search for numbers. The section
// elements keep id="step-N" (N from this order) and carry data-step-id.
export const STEP_IDS = Object.freeze([
	'sine', 'moving-sine', 'sum-of-sines', 'into-3d', 'directions', 'many-waves',
	'unlit', 'normals', 'slopes', 'diffuse', 'highlights',
	'gerstner', 'tiling',
	'frequency', 'fourier', 'jonswap', 'random-sea', 'time', 'fft', 'choppiness', 'layers',
	'fields', 'sampling', 'mesh', 'painted',
	'foam', 'glow', 'finale',
]);
export const STEP_COUNT = STEP_IDS.length;

// Each chapter's first step and its title, in order; the finale belongs to the last chapter.
export const CHAPTERS = Object.freeze([
	Object.freeze({ number: 1, first: 'sine', title: 'One wave' }),
	Object.freeze({ number: 2, first: 'unlit', title: 'Light' }),
	Object.freeze({ number: 3, first: 'gerstner', title: 'Better waves' }),
	Object.freeze({ number: 4, first: 'frequency', title: 'The real ocean' }),
	Object.freeze({ number: 5, first: 'fields', title: 'Textures' }),
	Object.freeze({ number: 6, first: 'foam', title: 'The look' }),
]);

const NUMBERS = new Map(STEP_IDS.map((id, i) => [id, i + 1]));

export function stepOf(id) {
	const step = NUMBERS.get(id);
	if (step === undefined) {
		throw new RangeError(`there is no step called ${JSON.stringify(id)}`);
	}
	return step;
}

export function idOf(step) {
	if (!Number.isInteger(step) || step < 1 || step > STEP_COUNT) {
		throw new RangeError(`step must be an integer 1..${STEP_COUNT}, got ${JSON.stringify(step)}`);
	}
	return STEP_IDS[step - 1];
}

export function chapterOf(step) {
	idOf(step);
	let found = CHAPTERS[0];
	for (const chapter of CHAPTERS) {
		if (stepOf(chapter.first) <= step) found = chapter;
	}
	return found;
}
```
(The error says "there is no step called", which contains "no step", as the test reads.)

Create `content/ocean/js/stages/graph.js`:
```js
// The flat graph's numbers (piece C2, Task 0; not a twin; spec 10.4). Browser-free, so the recipes,
// the blend and the shot checks share them with render/graphStage.js. The graph is drawn on the plane
// x = GRAPH_PLANE_X, which the camera faces looking along +x, and the surface is clipped to the band
// [GRAPH_PLANE_X - near, GRAPH_PLANE_X + far] around it. A band whose near and far both reach NO_CLIP
// is no clip at all.
export const GRAPH_PLANE_X = 0;
// Studs: further than the last ring and the horizon reach from any story shot, so a band this wide
// is the whole sea.
export const NO_CLIP = 4096;
// Studs either side of the plane while the graph shows: the sea is a sliver behind the curve. The
// blend lerps near and far on a log scale, so they are never 0.
export const FLAT_BAND = 0.5;
// The graph draws heights this many times taller than they are (the teaching waves are a few studs
// tall and tens of studs long); its height axis says so, and step 4 brings it back to 1.
export const GRAPH_Y_SCALE = 4;
// From this backdrop opacity up, the visitor's orbit and the phone's tilt are held.
export const GRAPH_HOLD = 0.5;
export const GRAPH_OFF = Object.freeze({ opacity: 0, yScale: 1, near: NO_CLIP, far: NO_CLIP, components: false });

/** @returns {null | [number, number]} the surface's x range for a blended look.graph, or null for none */
export function graphBand(graph) {
	if (graph.near >= NO_CLIP && graph.far >= NO_CLIP) {
		return null;
	}
	return [GRAPH_PLANE_X - graph.near, GRAPH_PLANE_X + graph.far];
}
```

- [ ] **Step 5: Run the steps test to verify it passes**

Run: `cd /Users/cole/Projects/Wesbite-ocean-page && node --test tests/ocean/stages/steps.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 6: The bank's spread: failing tests, then `withFan` and the engine field**

Append to `tests/ocean/engine/waveBanks.test.js`:
```js
// C2 (spec 10.4): the teaching bank's spread.
test('withFan(bank, 1) is the bank itself; withFan(bank, 0) lays every wave along +z on the lattice', () => {
	const full = WaveBanks.teachingBank();
	expect.equal(WaveBanks.withFan(full, 1), full, 'the identical object at 1');
	const line = WaveBanks.withFan(full, 0);
	const unit = (2 * Math.PI) / WaveBanks.TEACHING_TILE;
	const STRIDE = WaveSampler.STRIDE;
	for (let wave = 0; wave < full.count; wave++) {
		const o = wave * STRIDE;
		expect.equal(line.packed[o + 4], 0, `wave ${wave} dx`);
		expect.equal(line.packed[o + 5], 1, `wave ${wave} dz`);
		const n = line.packed[o] / unit;
		expect.near(n, Math.round(n), 1e-9, `wave ${wave} sits on the lattice`);
		expect.truthy(Math.round(n) >= 1, `wave ${wave} moves`);
		expect.equal(line.packed[o + 2], full.packed[o + 2], `wave ${wave} keeps its height`);
		expect.equal(line.packed[o + 3], full.packed[o + 3], `wave ${wave} keeps its phase`);
		expect.near(line.packed[o + 1], Math.sqrt(9.81 * line.packed[o]), 1e-9, `wave ${wave} deep-water dispersion`);
	}
	// Along one axis: nothing changes along x, and the sum repeats every tile along z.
	const out = new Float64Array(7);
	const at = (x, z) => WaveSampler.sample(line.packed, line.count, 3.7, x, z, 0, line.weights, 0, out)[1];
	expect.near(at(0, 10), at(37, 10), 1e-9, 'no change along x');
	expect.near(at(5, 10), at(5, 10 + WaveBanks.TEACHING_TILE), 1e-9, 'repeats every tile');
});

test('withFan between 0 and 1 stays finite, and refuses a spread outside 0..1', () => {
	const full = WaveBanks.teachingBank();
	for (const fan of [0.001, 0.25, 0.5, 0.999]) {
		const bank = WaveBanks.withFan(full, fan);
		expect.truthy([...bank.packed].every(Number.isFinite), `finite at ${fan}`);
		for (let wave = 0; wave < bank.count; wave++) {
			const o = wave * WaveSampler.STRIDE;
			expect.near(Math.hypot(bank.packed[o + 4], bank.packed[o + 5]), 1, 1e-12, `unit heading at ${fan}`);
		}
	}
	for (const bad of [-0.01, 1.01, Number.NaN]) {
		let message = '';
		try { WaveBanks.withFan(full, bad); } catch (error) { message = error.message; }
		expect.truthy(message.includes('fan'), `refused ${bad}`);
	}
});
```
(If `WaveSampler` is not already imported in that file, add `import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';` with the other imports. Check the gravity constant: `Jonswap.GRAVITY`; if it is not 9.81, use `Jonswap.GRAVITY` in the assertion instead of the literal.)

Append to `tests/ocean/engine/stageControl.test.js`:
```js
// C2: bank.fan reaches the surface and is checked like every other field.
test('bank.fan must be a number in 0..1, and a new spread rebuilds the waves the surface draws', async () => {
	const ocean = await makeOcean();
	const settings = (fan) => ({ ...StageControl.DEFAULT_SETTINGS, source: 'bank', bank: { count: 4, fan }, layers: [true, false, false] });
	for (const bad of [-0.5, 2, Number.NaN, undefined]) {
		let message = '';
		try { StageControl.configure(ocean, settings(bad)); } catch (error) { message = error.message; }
		expect.truthy(message.includes('bank.fan'), `refused ${bad}`);
	}
	StageControl.configure(ocean, settings(0));
	const line = ocean.waves;
	expect.equal(line.packed[4], 0, 'spread 0: the first wave along +z');
	StageControl.configure(ocean, settings(1));
	expect.truthy(ocean.waves.packed !== line.packed, 'a new spread, new waves');
	expect.equal(ocean.waves.packed, ocean.teachingBank.packed, 'spread 1 draws the bank itself');
});
```
Use the file's existing helper for building an ocean (look for the function the other tests in `stageControl.test.js` call to create an ocean with in-process workers, and call it in place of `makeOcean()`). The last assertion says: at spread 1 the waves share the teaching bank's own packed array (`withFan(bank, 1)` returns the bank, and `withCount` keeps its `packed`).

Run: `cd /Users/cole/Projects/Wesbite-ocean-page && node --test tests/ocean/engine/waveBanks.test.js tests/ocean/engine/stageControl.test.js`
Expected: FAIL (`WaveBanks.withFan is not a function`, and `bank.fan` not refused).

In `content/ocean/js/engine/waveBanks.js`, add after `withCount`:
```js
/**
 * The bank with its headings spread by `fan` (piece C2; spec 10.4). At 1 it is the bank as built
 * (the same object). At 0 every wave lies along +z with its wavenumber rounded to the tile's lattice
 * (n = max(1, round(k / unit))), so the sum varies along z only and repeats every tile exactly: the
 * flat graph's curve and its frequency spikes. Between, each wavevector moves in a straight line
 * from (0, n0 unit) to its own lattice point (m unit, n unit). Heights, phases and weights are kept;
 * omega follows deep-water dispersion for the new k, as teachingBank's does.
 */
export function withFan(full, fan, tile = TEACHING_TILE) {
	if (!(Number.isFinite(fan) && fan >= 0 && fan <= 1)) {
		fail('wave bank fan', 'a number in 0 .. 1', fan);
	}
	if (fan === 1) {
		return full;
	}
	const unit = TAU / tile;
	const total = full.packed.length / STRIDE;
	const packed = new Float64Array(full.packed.length);
	for (let wave = 0; wave < total; wave++) {
		const o = wave * STRIDE;
		const k = full.packed[o];
		const m = round((k * full.packed[o + 4]) / unit);
		const n = round((k * full.packed[o + 5]) / unit);
		const along = Math.max(1, round(k / unit));
		let kx = fan * m * unit;
		let kz = ((1 - fan) * along + fan * n) * unit;
		if (kx === 0 && kz === 0) {
			kz = unit;
		}
		const length = Math.hypot(kx, kz);
		packed[o] = length;
		packed[o + 1] = Math.sqrt(Jonswap.GRAVITY * length);
		packed[o + 2] = full.packed[o + 2];
		packed[o + 3] = full.packed[o + 3];
		packed[o + 4] = kx / length;
		packed[o + 5] = kz / length;
	}
	return bank(packed, full.count, full.weights);
}
```
Update the module's header comment: add a bullet "* the spread (C2): `withFan` lays the bank along one axis for the flat graph, or fans it back out".

In `content/ocean/js/engine/stageControl.js`:
- `DEFAULT_SETTINGS.bank` becomes `Object.freeze({ count: 32, fan: 1 })`.
- In `normalise`, after the `bank.count` check:
```js
	if (!finite(s.bank?.fan) || s.bank.fan < 0 || s.bank.fan > 1) {
		fail('bank.fan', 'a number in 0 .. 1', s.bank?.fan);
	}
```
- In `applySource`, replace the `bank` branch with:
```js
	} else if (s.source === 'bank') {
		ocean.teachingBank ??= WaveBanks.teachingBank();
		if (before?.source !== 'bank' || before.bank.count !== s.bank.count || before.bank.fan !== s.bank.fan) {
			// The spread rebuilds the bank's headings only when it changes (a blend lerps it every
			// frame between two spreads; at a step's own spread it is built once).
			if (ocean.fannedAt !== s.bank.fan) {
				ocean.fanned = WaveBanks.withFan(ocean.teachingBank, s.bank.fan);
				ocean.fannedAt = s.bank.fan;
			}
			ocean.waves = WaveBanks.withCount(ocean.fanned, s.bank.count);
		}
	}
```
- Add a line to the header comment's list: "the teaching bank's spread (`bank.fan`, C2), rebuilt only when it changes".

In `content/ocean/js/engine/ocean.js` `create`, after `teachingBank: null, ...` add:
```js
		fanned: null, // the teaching bank at the spread last asked for (stageControl.js, C2)
		fannedAt: null,
```

Run: `cd /Users/cole/Projects/Wesbite-ocean-page && node --test tests/ocean/engine/waveBanks.test.js tests/ocean/engine/stageControl.test.js`
Expected: PASS.

- [ ] **Step 7: The blend's new fields: failing tests, then `blend.js`**

Append to `tests/ocean/stages/blend.test.js` (it builds its own recipes so it does not depend on the chapters):
```js
// C2 (Task 0): the new look and engine fields blend as the contract says.
test('C2 fields: spread, graph opacity and scale lerp; the band lerps on a log scale; kinds and switches snap', async () => {
	const { BASE } = await import('../../../content/ocean/js/stages/recipeKit.js');
	const { FLAT_BAND, NO_CLIP } = await import('../../../content/ocean/js/stages/graph.js');
	const recipe = (step, look, engine = {}, charts = {}) => ({ ...BASE, step, id: `r${step}`, title: 't', look: { ...BASE.look, ...look }, engine: { ...BASE.engine, ...engine }, charts: { ...BASE.charts, ...charts } });
	const a = recipe(1, { graph: { opacity: 1, yScale: 4, near: FLAT_BAND, far: FLAT_BAND, components: true }, overlay: { kind: null, spacing: 2 }, terms: { diffuse: true, specular: false, fresnel: false } }, { bank: { count: 3, fan: 0 } }, { phaseArrows: 'still', notes: [true, false, true] });
	const b = recipe(2, { graph: { opacity: 0, yScale: 1, near: NO_CLIP, far: NO_CLIP, components: false }, overlay: { kind: 'slopes', spacing: 8 }, terms: { diffuse: true, specular: true, fresnel: true } }, { bank: { count: 7, fan: 1 } }, { phaseArrows: 'turning', notes: null });
	const quarter = blendRecipes(a, b, 0.25);
	expect.near(quarter.engine.bank.fan, 0.25, 1e-12, 'fan lerps');
	expect.near(quarter.look.graph.opacity, 0.75, 1e-12, 'opacity lerps');
	expect.near(quarter.look.graph.yScale, 3.25, 1e-12, 'yScale lerps');
	expect.near(quarter.look.graph.near, FLAT_BAND * (NO_CLIP / FLAT_BAND) ** 0.25, 1e-9, 'near is geometric');
	expect.near(quarter.look.graph.far, FLAT_BAND * (NO_CLIP / FLAT_BAND) ** 0.25, 1e-9, 'far is geometric');
	expect.equal(quarter.look.graph.components, true, 'components snap: first half');
	expect.near(quarter.look.overlay.spacing, 3.5, 1e-12, 'spacing lerps');
	expect.equal(quarter.look.overlay.kind, null, 'kind snaps');
	expect.equal(JSON.stringify(quarter.look.terms), JSON.stringify(a.look.terms), 'terms snap');
	expect.equal(quarter.charts.phaseArrows, 'still', 'phase arrows snap');
	const late = blendRecipes(a, b, 0.75);
	expect.equal(late.look.overlay.kind, 'slopes', 'kind past the middle');
	expect.equal(late.look.graph.components, false, 'components past the middle');
	expect.equal(late.charts.notes, null, 'notes past the middle');
	const end = blendRecipes(a, b, 1);
	expect.equal(end.look.graph.near, NO_CLIP, 'exactly the far end at 1');
});

test('engineSettings asks for vertex normals for the terms material too', async () => {
	const { BASE } = await import('../../../content/ocean/js/stages/recipeKit.js');
	const r = { ...BASE, step: 1, id: 'r', title: 't', look: { ...BASE.look, material: 'terms' } };
	expect.equal(engineSettings(blendRecipes(r, r, 0)).normals, true, 'terms needs normals');
	const w = { ...r, look: { ...r.look, material: 'white' } };
	expect.equal(engineSettings(blendRecipes(w, w, 0)).normals, false, 'white does not');
});
```
(Import `engineSettings` alongside `blendRecipes` at the top of the file if it is not imported.)

Run: `node --test tests/ocean/stages/blend.test.js`. Expected: FAIL (`recipeKit.js` missing, then the fields).

In `content/ocean/js/stages/blend.js`:
- Extend the header's list: "* C2: the spread (`bank.fan`), the graph's opacity and height scale lerp; its band (near, far) lerps on a log scale, so the sea fills in mostly in the second half of a blend; the overlay's spacing lerps; the overlay kind, the graph's components, the lighting terms, the phase-arrow motion and step 15's tones snap with the rest".
- In `blendRecipes`, `bank:` becomes `bank: { count: lerp(ea.bank.count, eb.bank.count, p), fan: lerp(ea.bank.fan, eb.bank.fan, p) },`
- The `look:` object becomes:
```js
		look: {
			material: near.look.material,
			shading: near.look.shading,
			wireframe: near.look.wireframe,
			fog: logLerp(a.look.fog, b.look.fog, p),
			sun: { azimuth: angleLerp(a.look.sun.azimuth, b.look.sun.azimuth, p), elevation: lerp(a.look.sun.elevation, b.look.sun.elevation, p) },
			terms: near.look.terms,
			graph: {
				opacity: lerp(a.look.graph.opacity, b.look.graph.opacity, p),
				yScale: lerp(a.look.graph.yScale, b.look.graph.yScale, p),
				near: logLerp(a.look.graph.near, b.look.graph.near, p),
				far: logLerp(a.look.graph.far, b.look.graph.far, p),
				components: near.look.graph.components,
			},
			overlay: { kind: near.look.overlay.kind, spacing: lerp(a.look.overlay.spacing, b.look.overlay.spacing, p) },
		},
```
- `engineSettings`: `normals: look.material === 'painted' || look.material === 'terms' || (look.material === 'sea' && look.shading),` and its comment "(lit materials do; white and the unlit sea colour do not)" gains "the terms material does".

(The test passes once Step 8 creates `recipeKit.js`.)

- [ ] **Step 8: The recipe kit, the chapters and the assembler**

Create `content/ocean/js/stages/recipeKit.js`:
```js
// What every chapter's recipes are built from (piece C2, Task 0; not a twin): the base recipe each
// step starts from (the hero sea, the painted look, the deck camera, no graph, no overlay), the slider
// builders, and the teaching settings and shots the chapters share. Pure data. recipes.js assembles
// the chapters (stages/chapters/) in story order (stages/steps.js).
//
// A recipe's fields (spec 4.3, A3, extended by C2 in spec 10): `engine` (the EngineSettings
// stageControl.js takes, less `normals` and `warm`), `look` (material, shading, wireframe, fog, sun,
// and C2's `terms`, `graph` and `overlay`), `shot`, `charts` and `sliders`. The low shots keep their
// lens clear of the water (tests/ocean/stages/clearance.test.js); a camera on the dry side of the
// graph's band (stages/graph.js) is clear by construction.
import { DEFAULT_SETTINGS } from '../engine/stageControl.js';
import { FOG_DENSITY } from '../render/lighting.js';
import { FLAT_BAND, GRAPH_OFF, GRAPH_Y_SCALE } from './graph.js';
import { deepFreeze } from './paths.js';
import { PLACE_SUN } from './sun.js';

export const MATERIALS = Object.freeze(['white', 'sea', 'painted', 'terms']);
export const MOVES = Object.freeze(['still', 'drift']);
export const OVERLAYS = Object.freeze([null, 'directions', 'normals', 'slopes']);
export const PHASE_ARROWS = Object.freeze([false, 'still', 'turning']);
// The recipe fields the engine reads (EngineSettings without `normals` and `warm`).
export const ENGINE_FIELDS = Object.freeze(['source', 'sine', 'bank', 'chop', 'sea', 'seed', 'layers', 'maps', 'foam', 'foamKnobs', 'glow', 'glowStrength']);

export const BASE = deepFreeze({
	engine: Object.fromEntries(ENGINE_FIELDS.map((name) => [name, DEFAULT_SETTINGS[name]])),
	look: {
		material: 'painted',
		shading: true,
		wireframe: false,
		fog: FOG_DENSITY,
		sun: { azimuth: PLACE_SUN.azimuth, elevation: PLACE_SUN.elevation },
		terms: { diffuse: true, specular: true, fresnel: true },
		graph: { ...GRAPH_OFF },
		overlay: { kind: null, spacing: 4 },
	},
	shot: { position: [0, 14, 40], target: [0, 2, -120], move: 'still' },
	charts: { spectrum: false, phaseArrows: false, transformN: null, notes: null },
	sliders: [],
});

const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Plain objects merge key by key; arrays and everything else replace.
export function merge(base, over) {
	const result = { ...base };
	for (const [key, value] of Object.entries(over)) {
		result[key] = isPlain(value) && isPlain(base[key]) ? merge(base[key], value) : value;
	}
	return result;
}

/** A recipe for step `step` from a chapter's spec `{ title, ...over }`. */
export function make(step, id, { title, ...over }) {
	if (typeof title !== 'string' || title.length === 0) {
		throw new RangeError(`step ${id} needs a title`);
	}
	return deepFreeze({ step, id, title, ...merge(BASE, over) });
}

export function range(id, label, bind, { min, max, step, value, unit = '', scale = 'linear' }) {
	return { id, label, kind: 'range', bind, min, max, step, default: value, unit, scale };
}

export function toggle(id, label, bind, value) {
	return { id, label, kind: 'toggle', bind, default: value };
}

// A whole number from 1; `max`, when given, caps it.
export function counter(id, label, bind, value, max) {
	return { id, label, kind: 'counter', bind, min: 1, ...(max === undefined ? {} : { max }), default: value };
}

export function choice(id, label, bind, options, value) {
	return { id, label, kind: 'choice', bind, options, default: value };
}

// The lit teaching steps' sun: the place's height, ahead and to the left of the deck camera, so its
// highlight lies on the water in the frame's left third without its glare filling the sky (A3 final
// review minor 1). Every teaching step keeps it, so no blend swings the sun.
export const TEACHING_SUN = deepFreeze({ azimuth: 215, elevation: PLACE_SUN.elevation });
// The teaching steps: one layer named (so the painter's lists match the FFT steps' while they warm
// up), no chop, no maps, foam or glow, and the bank at its own headings.
export const TEACHING = deepFreeze({ layers: [true, false, false], chop: 0, maps: false, foam: false, glow: false, bank: { count: 8, fan: 1 } });
export const ONE_LAYER = deepFreeze({ source: 'fft', layers: [true, false, false], foam: false, glow: false });
export const WHITE = deepFreeze({ material: 'white', wireframe: true, sun: TEACHING_SUN });
// The flat graph (spec 10.4): opaque backdrop, heights drawn GRAPH_Y_SCALE times taller, the sea a
// sliver behind the curve.
export const GRAPH_FLAT = deepFreeze({ opacity: 1, yScale: GRAPH_Y_SCALE, near: FLAT_BAND, far: FLAT_BAND, components: false });
// Side-on to the plane x = 0, looking along +x, so waves travelling +z run left to right. A hair
// above the target: the tilt, atan2(32, 0.8) = 88.6 degrees, is inside the orbit limit's 89.1
// (page/orbitLimits.js MAX_POLAR), so applying the shot never tilts it.
export const GRAPH_SHOT = deepFreeze({ position: [-32, 0.8, 0], target: [0, 0, 0] });
export const DECK = deepFreeze({ position: [0, 14, 40], target: [0, 2, -120] });
// Across the waves, side-on, at a few crests 30 to 120 studs off (piece C Task 6;
// tests/ocean/stages/crests.test.js).
export const CREST = deepFreeze({ position: [-40, 14, -20], target: [30, 0, -20] });
export const HIGH = deepFreeze({ position: [0, 110, 150], target: [0, 0, -60] });
// The finale drifts at this height: the hero sea's tallest crest on the drift circle stays under the
// lens with a margin (A3); at A2's deck height of 14 it crossed the lens.
export const FINALE_HEIGHT = 21;
```

Create the seven chapter files. Each opens with a header naming its steps and its owning lane. Lanes tune the values; the structure (ids, sources, materials, overlay kinds, chart switches, slider ids and binds) is the contract.

`content/ocean/js/stages/chapters/waves.js`:
```js
// Chapter one, One wave (steps 1 to 6; piece C2; lane B tunes this file, spec 10.4 and 10.7): the
// flat graph of one sine, the sine moving, a sum of the teaching bank's waves laid along one axis,
// the swing that shows the curve is the edge of a surface, the waves' headings fanning out, and more
// of the bank. Steps 1 to 3 face the graph from GRAPH_SHOT; step 4's camera stays on the dry side of
// the band (x < 0) while the sheet unrolls behind the curve.
import { FLAT_BAND } from '../graph.js';
import { GRAPH_FLAT, GRAPH_SHOT, TEACHING, WHITE, range, toggle } from '../recipeKit.js';

const SINE = { amplitude: 2.5, wavelength: 40 };

export const WAVES = Object.freeze({
	sine: {
		title: 'One sine wave',
		engine: { ...TEACHING, source: 'sine', sine: { ...SINE, speed: 0 } },
		look: { ...WHITE, graph: GRAPH_FLAT },
		shot: GRAPH_SHOT,
		sliders: [
			range('amplitude', 'Height', 'engine.sine.amplitude', { min: 0, max: 4, step: 0.05, value: SINE.amplitude, unit: 'studs' }),
			range('wavelength', 'Length', 'engine.sine.wavelength', { min: 8, max: 120, step: 1, value: SINE.wavelength, unit: 'studs' }),
		],
	},
	'moving-sine': {
		title: 'Make it move',
		engine: { ...TEACHING, source: 'sine', sine: { ...SINE, speed: 8 } },
		look: { ...WHITE, graph: GRAPH_FLAT },
		shot: GRAPH_SHOT,
		sliders: [range('speed', 'Speed', 'engine.sine.speed', { min: 0, max: 20, step: 0.1, value: 8, unit: 'studs/s' })],
	},
	'sum-of-sines': {
		title: 'Adding waves together',
		engine: { ...TEACHING, source: 'bank', bank: { count: 3, fan: 0 } },
		look: { ...WHITE, graph: { ...GRAPH_FLAT, components: true } },
		shot: GRAPH_SHOT,
		sliders: [range('waveCount', 'Waves', 'engine.bank.count', { min: 1, max: 8, step: 1, value: 3 })],
	},
	'into-3d': {
		title: 'From a line to a surface',
		engine: { ...TEACHING, source: 'bank', bank: { count: 3, fan: 0 } },
		look: { ...WHITE, graph: { opacity: 0, yScale: 1, near: FLAT_BAND, far: 400, components: false } },
		shot: { position: [-70, 38, 60], target: [60, 0, -20] },
		sliders: [toggle('wireframe', 'Wireframe', 'look.wireframe', true)],
	},
	directions: {
		title: 'Waves going somewhere',
		engine: { ...TEACHING, source: 'bank', bank: { count: 6, fan: 1 } },
		look: { ...WHITE, overlay: { kind: 'directions', spacing: 4 } },
		shot: { position: [0, 45, 70], target: [0, 0, -10] },
		sliders: [range('fan', 'Spread', 'engine.bank.fan', { min: 0, max: 1, step: 0.01, value: 1 })],
	},
	'many-waves': {
		title: 'Lots of waves, lots of directions',
		engine: { ...TEACHING, source: 'bank', bank: { count: 16, fan: 1 } },
		look: WHITE,
		shot: { position: [0, 18, 55], target: [0, 0, -20] },
		sliders: [range('waveCount', 'Waves', 'engine.bank.count', { min: 1, max: 32, step: 1, value: 16 })],
	},
});
```

`content/ocean/js/stages/chapters/light.js`:
```js
// Chapter two's lighting steps (steps 7, 10 and 11; piece C2; lane D tunes this file, spec 10.6):
// the unlit white blob, the sea lit by Lambert alone, then the highlight and Fresnel with the sky.
// Steps 8 and 9 (normals and slopes) are chapters/vectors.js.
import { DECK, TEACHING, TEACHING_SUN, range, toggle } from '../recipeKit.js';

const BANK = { ...TEACHING, source: 'bank', bank: { count: 16, fan: 1 } };

export const LIGHT = Object.freeze({
	unlit: {
		title: "Shape isn't enough",
		engine: BANK,
		look: { material: 'white', wireframe: false, sun: TEACHING_SUN },
		shot: DECK,
		sliders: [toggle('wireframe', 'Wireframe', 'look.wireframe', false)],
	},
	diffuse: {
		title: 'Sunlight',
		engine: BANK,
		look: { material: 'terms', terms: { diffuse: true, specular: false, fresnel: false }, sun: TEACHING_SUN },
		shot: DECK,
		sliders: [range('sunAzimuth', 'Sun direction', 'look.sun.azimuth', { min: 0, max: 360, step: 1, value: TEACHING_SUN.azimuth, unit: '°' })],
	},
	highlights: {
		title: 'Highlights, Fresnel and the sky',
		engine: BANK,
		look: { material: 'terms', terms: { diffuse: true, specular: true, fresnel: true }, sun: TEACHING_SUN },
		shot: DECK,
		sliders: [toggle('specular', 'Highlight', 'look.terms.specular', true), toggle('fresnel', 'Fresnel and sky', 'look.terms.fresnel', true)],
	},
});
```

`content/ocean/js/stages/chapters/vectors.js`:
```js
// Chapter two's vector steps (steps 8 and 9; piece C2; lane C tunes this file, spec 10.7): arrows
// out of the surface from the engine's exact normals, then the central difference beside the exact
// derivative. The surface stays white: the arrows are the lesson.
import { TEACHING, TEACHING_SUN, range } from '../recipeKit.js';

const BANK = { ...TEACHING, source: 'bank', bank: { count: 16, fan: 1 } };
const CLOSE = { position: [0, 16, 34], target: [0, 0, 0] };

export const VECTORS = Object.freeze({
	normals: {
		title: 'Which way the surface faces',
		engine: BANK,
		look: { material: 'white', wireframe: false, sun: TEACHING_SUN, overlay: { kind: 'normals', spacing: 4 } },
		shot: CLOSE,
	},
	slopes: {
		title: 'Getting the slope',
		engine: BANK,
		look: { material: 'white', wireframe: false, sun: TEACHING_SUN, overlay: { kind: 'slopes', spacing: 4 } },
		shot: CLOSE,
		sliders: [range('spacing', 'Sample spacing', 'look.overlay.spacing', { min: 0.5, max: 16, step: 0.5, value: 4, unit: 'studs' })],
	},
});
```

`content/ocean/js/stages/chapters/betterWaves.js`:
```js
// Chapter three, Better waves (steps 12 and 13; piece C2; lane B tunes this file): choppiness on the
// Gerstner bank from the side (piece C Task 6), then the fly-up that shows the tiling. The tiling
// step sums only the bank's 4 tallest waves (40 to 85 studs): from a few hundred studs up the shorter
// ones alias on the coarse rings into blurrier, paler water with a hard square edge (A3 Task 10 fix
// round 1); the 4 still repeat every 256 studs, which is the step's point
// (tests/ocean/stages/shots.test.js checks the frame from the geometry).
import { CREST, TEACHING, TEACHING_SUN, range } from '../recipeKit.js';

export const BETTER_WAVES = Object.freeze({
	gerstner: {
		title: 'Sharper peaks',
		engine: { ...TEACHING, source: 'bank', bank: { count: 16, fan: 1 }, chop: 1.3 },
		look: { material: 'terms', sun: TEACHING_SUN },
		shot: CREST,
		sliders: [range('chop', 'Choppiness', 'engine.chop', { min: 0, max: 2, step: 0.01, value: 1.3 })],
	},
	tiling: {
		title: 'The tiling problem',
		engine: { ...TEACHING, source: 'bank', bank: { count: 4, fan: 1 }, chop: 0.6 },
		look: { material: 'terms', sun: TEACHING_SUN },
		shot: { position: [0, 300, 90], target: [0, 0, 0] },
	},
});
```

`content/ocean/js/stages/chapters/realOcean.js`:
```js
// Chapter four, The real ocean (steps 14 to 21; piece C2; lane E tunes this file, spec 10.7): back to
// the flat graph for time and frequency and the chord, then the FFT pipeline: the spectrum, the random
// sea with its arrows still, the arrows turning, the FFT timing, choppiness, and the three layers.
// Steps 16 to 19 run the FFT sea without chop, so step 20 is where the sideways push arrives.
import { DEFAULT_SETTINGS } from '../../engine/stageControl.js';
import { SEED } from '../../engine/config.js';
import { GRAPH_FLAT, GRAPH_SHOT, HIGH, ONE_LAYER, TEACHING, WHITE, choice, counter, range, toggle } from '../recipeKit.js';

const LINE = { ...TEACHING, source: 'bank', bank: { count: 4, fan: 0 } };
const ROUND = { ...ONE_LAYER, chop: 0 };
const ARROWS = { position: [0, 30, 60], target: [0, 0, 0] };

export const REAL_OCEAN = Object.freeze({
	frequency: {
		title: 'Time and frequency',
		engine: LINE,
		look: { ...WHITE, graph: { ...GRAPH_FLAT, components: true } },
		shot: GRAPH_SHOT,
		sliders: [range('waveCount', 'Waves', 'engine.bank.count', { min: 1, max: 8, step: 1, value: 4 })],
	},
	fourier: {
		title: 'Taking a chord apart',
		engine: LINE,
		look: { ...WHITE, graph: GRAPH_FLAT },
		shot: GRAPH_SHOT,
		charts: { notes: [true, true, true] },
		sliders: [toggle('note1', 'Low tone', 'charts.notes.0', true), toggle('note2', 'Middle tone', 'charts.notes.1', true), toggle('note3', 'High tone', 'charts.notes.2', true)],
	},
	jonswap: {
		title: 'Real ocean data',
		engine: ROUND,
		shot: { position: [0, 60, 110], target: [0, 0, -40] },
		charts: { spectrum: true },
		sliders: [
			range('wind', 'Wind speed', 'engine.sea.windSpeed', { min: 3, max: 25, step: 0.5, value: 12, unit: 'm/s' }),
			range('fetch', 'Fetch', 'engine.sea.fetch', { min: 5000, max: 200000, step: 100, value: 80000, unit: 'm', scale: 'log' }),
		],
	},
	'random-sea': {
		title: 'A random ocean',
		engine: ROUND,
		shot: ARROWS,
		charts: { phaseArrows: 'still' },
		// Capped: seeds 1 .. 9999 are plenty of seas, and far inside the engine's 2^31 - 1.
		sliders: [counter('seed', 'New sea', 'engine.seed', SEED, 9999)],
	},
	time: {
		title: 'Setting it moving',
		engine: ROUND,
		shot: ARROWS,
		charts: { phaseArrows: 'turning' },
	},
	fft: {
		title: 'The FFT',
		engine: ROUND,
		shot: HIGH,
		charts: { transformN: 32 },
		sliders: [choice('transformN', 'Waves per side', 'charts.transformN', [8, 16, 32, 64], 32)],
	},
	choppiness: {
		title: 'Choppiness',
		engine: ONE_LAYER,
		shot: { position: [-40, 16, -20], target: [30, 0, -20] },
		sliders: [range('chop', 'Choppiness', 'engine.chop', { min: 0, max: 2, step: 0.01, value: DEFAULT_SETTINGS.chop })],
	},
	layers: {
		title: 'Three layers of waves',
		engine: { source: 'fft', foam: false, glow: false },
		shot: { position: [0, 380, 120], target: [0, 0, 0] },
		sliders: [
			toggle('layer1', '256-stud layer', 'engine.layers.0', true),
			toggle('layer2', '64-stud layer', 'engine.layers.1', true),
			toggle('layer3', '16-stud layer', 'engine.layers.2', true),
		],
	},
});
```
(If `DEFAULT_SETTINGS.chop` is not a multiple of 0.01, `clampSlider` keeps a default off the grid, as the place sun's does; nothing more is needed.)

`content/ocean/js/stages/chapters/textures.js`:
```js
// Chapter five, Textures (steps 22 to 25; piece C2; lane F tunes this file, spec 10.7): the FFT's
// output as grids of numbers, sampling between grid points, the mesh's rings under a wireframe, and
// the painted maps. The sea is the hero sea's layers without foam or glow (those are chapter six).
import { toggle } from '../recipeKit.js';

const SEA = { source: 'fft', foam: false, glow: false };

export const TEXTURES = Object.freeze({
	fields: { title: 'The answer is a grid of numbers', engine: SEA, shot: { position: [0, 60, 110], target: [0, 0, -40] } },
	sampling: { title: 'Reading between the grid points', engine: SEA, shot: { position: [0, 30, 60], target: [0, 0, 0] } },
	mesh: {
		title: 'The mesh',
		engine: SEA,
		// Thicker fog past the wire grid's fade (render/stageLook.js WIRE_FADE): past about 600 studs
		// a grid's lines crowd into grey moire bands (A3 fix round 1, piece C's old step 1).
		look: { wireframe: true, fog: 0.0015 },
		shot: { position: [0, 40, 70], target: [0, 0, 0] },
		sliders: [toggle('wireframe', 'Wireframe', 'look.wireframe', true)],
	},
	painted: { title: 'Painted maps', engine: SEA, shot: { position: [0, 20, 45], target: [0, 1, -20] } },
});
```

`content/ocean/js/stages/chapters/finish.js`:
```js
// Chapter six, The look, and the finale (steps 26 to 28; piece C2, Task 0; unchanged from piece C's
// steps 11 to 13). No lane edits this file.
import { DEFAULT_SETTINGS } from '../../engine/stageControl.js';
import { DECK, FINALE_HEIGHT, range } from '../recipeKit.js';
import { PLACE_SUN } from '../sun.js';

export const FINISH = Object.freeze({
	foam: {
		title: 'Foam',
		engine: { glow: false },
		shot: { position: [0, 20, 45], target: [0, 1, -20] },
		sliders: [
			range('whitecap', 'Whitecaps', 'engine.foamKnobs.whitecap', { min: 0, max: 1, step: 0.01, value: DEFAULT_SETTINGS.foamKnobs.whitecap }),
			range('fade', 'Fade', 'engine.foamKnobs.decay', { min: 0.5, max: 0.97, step: 0.01, value: DEFAULT_SETTINGS.foamKnobs.decay }),
		],
	},
	glow: {
		title: 'Glow',
		// Looking towards the sun (azimuth about 173 degrees, towards -x), where the scatter lobe glows.
		shot: { position: [40, 18, 10], target: [-120, 2, 20] },
		sliders: [
			range('sunHeight', 'Sun height', 'look.sun.elevation', { min: 2, max: 50, step: 0.5, value: PLACE_SUN.elevation, unit: '°' }),
			range('glow', 'Glow strength', 'engine.glowStrength', { min: 0, max: 60, step: 1, value: DEFAULT_SETTINGS.glowStrength }),
		],
	},
	finale: {
		title: 'The whole thing',
		shot: { position: [0, FINALE_HEIGHT, DECK.position[2]], target: DECK.target, move: 'drift' },
	},
});
```

Replace `content/ocean/js/stages/recipes.js` with:
```js
// The story's steps as recipes (spec section 10; A3, extended by piece C2; not a twin). Each chapter
// file (stages/chapters/) holds its steps' specs, keyed by step id; this assembles them in story order
// (stages/steps.js STEP_IDS) into frozen recipes (stages/recipeKit.js make) and fails at load if a
// step has no spec or a spec names no step. Pure data: the director (director.js) binds slider values
// in, blends two neighbours by the scroll progress (blend.js) and hands the result to the engine and
// the renderer.
//
// Steps 1 to 15 run the teaching sources (the sine, then the teaching bank through WaveSampler, as
// the original Roblox prototype drew its sea); from step 16 the surface is the FFT pipeline, one layer
// until step 21 brings in all three. Every step starts from the hero sea (stageControl.js
// DEFAULT_SETTINGS), which the finale is unchanged.
import { make } from './recipeKit.js';
import { STEP_COUNT, STEP_IDS } from './steps.js';
import { WAVES } from './chapters/waves.js';
import { LIGHT } from './chapters/light.js';
import { VECTORS } from './chapters/vectors.js';
import { BETTER_WAVES } from './chapters/betterWaves.js';
import { REAL_OCEAN } from './chapters/realOcean.js';
import { TEXTURES } from './chapters/textures.js';
import { FINISH } from './chapters/finish.js';

export { STEP_COUNT } from './steps.js';
export { ENGINE_FIELDS, MATERIALS, MOVES, OVERLAYS, PHASE_ARROWS } from './recipeKit.js';

const CHAPTER_SPECS = Object.freeze([WAVES, LIGHT, VECTORS, BETTER_WAVES, REAL_OCEAN, TEXTURES, FINISH]);

function assemble() {
	const specs = {};
	for (const chapter of CHAPTER_SPECS) {
		for (const [id, spec] of Object.entries(chapter)) {
			if (Object.hasOwn(specs, id)) {
				throw new Error(`recipes: step ${id} is specified twice`);
			}
			specs[id] = spec;
		}
	}
	const missing = STEP_IDS.filter((id) => !Object.hasOwn(specs, id));
	const extra = Object.keys(specs).filter((id) => !STEP_IDS.includes(id));
	if (missing.length > 0 || extra.length > 0) {
		throw new Error(`recipes: no spec for ${missing.join(', ') || 'none'}; not a step: ${extra.join(', ') || 'none'}`);
	}
	return Object.freeze(STEP_IDS.map((id, i) => make(i + 1, id, specs[id])));
}

export const RECIPES = assemble();

export function recipeFor(step) {
	if (!Number.isInteger(step) || step < 1 || step > STEP_COUNT) {
		throw new RangeError(`step must be an integer 1..${STEP_COUNT}, got ${step}`);
	}
	return RECIPES[step - 1];
}
```

Replace `tests/ocean/stages/recipes.test.js` with:
```js
// The recipes (A3, extended by piece C2 Task 0): 28 steps in the spec's order, each a recipe the
// engine accepts, with the contract's fields, sources, materials, graph, overlays and charts in the
// places spec section 10.7 puts them. Lanes tune shots and slider values; these hold the structure.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as StageControl from '../../../content/ocean/js/engine/stageControl.js';
import { MAX_POLAR, polarOf } from '../../../content/ocean/js/page/orbitLimits.js';
import { FLAT_BAND, GRAPH_HOLD, GRAPH_PLANE_X, NO_CLIP, graphBand } from '../../../content/ocean/js/stages/graph.js';
import { getPath } from '../../../content/ocean/js/stages/paths.js';
import * as Recipes from '../../../content/ocean/js/stages/recipes.js';
import { KINDS, clampSlider } from '../../../content/ocean/js/stages/sliders.js';
import { STEP_IDS, stepOf } from '../../../content/ocean/js/stages/steps.js';

const R = Recipes.RECIPES;
const at = (id) => R[stepOf(id) - 1];
const deepFrozen = (value) => value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen));
const column = (read) => R.map(read).join(',');

test('28 recipes in step order, ids from steps.js, frozen all the way down', () => {
	expect.equal(R.length, Recipes.STEP_COUNT, 'one per step');
	R.forEach((recipe, i) => {
		expect.equal(recipe.step, i + 1, `step ${i + 1}`);
		expect.equal(recipe.id, STEP_IDS[i], `id ${i + 1}`);
		expect.truthy(typeof recipe.title === 'string' && recipe.title.length > 0, `title ${recipe.id}`);
		expect.truthy(!/\d/.test(recipe.title), `${recipe.id}'s title has no digit (copy rule)`);
	});
	expect.truthy(deepFrozen(R), 'deep frozen');
	expect.equal(Recipes.recipeFor(stepOf('jonswap')), at('jonswap'), 'recipeFor');
});

test("every recipe's engine part is settings the engine accepts, and every look field is in range", () => {
	for (const recipe of R) {
		expect.equal(Object.keys(recipe.engine).sort().join(','), [...Recipes.ENGINE_FIELDS].sort().join(','), `${recipe.id} engine fields`);
		StageControl.normalise({ ...recipe.engine, normals: true, warm: { fft: false, maps: false, layers: [false, false, false] } });
		const look = recipe.look;
		expect.truthy(Recipes.MATERIALS.includes(look.material), `${recipe.id} material`);
		expect.truthy(Recipes.MOVES.includes(recipe.shot.move), `${recipe.id} move`);
		expect.truthy(Recipes.OVERLAYS.includes(look.overlay.kind), `${recipe.id} overlay`);
		expect.truthy(look.overlay.spacing > 0, `${recipe.id} spacing`);
		expect.truthy(look.fog > 0, `${recipe.id} fog`);
		expect.truthy(['diffuse', 'specular', 'fresnel'].every((t) => typeof look.terms[t] === 'boolean'), `${recipe.id} terms`);
		const g = look.graph;
		expect.truthy(g.opacity >= 0 && g.opacity <= 1 && g.yScale >= 1 && g.near > 0 && g.far > 0 && typeof g.components === 'boolean', `${recipe.id} graph`);
		expect.truthy(Recipes.PHASE_ARROWS.includes(recipe.charts.phaseArrows), `${recipe.id} phase arrows`);
	}
});

test('sources and spreads: the sine, the bank along one axis, the bank fanned, then the FFT (spec 10.7)', () => {
	expect.equal(column((r) => r.engine.source), 'sine,sine,bank,bank,bank,bank,bank,bank,bank,bank,bank,bank,bank,bank,bank,fft,fft,fft,fft,fft,fft,fft,fft,fft,fft,fft,fft,fft', 'sources');
	expect.equal(column((r) => (r.engine.source === 'bank' ? r.engine.bank.fan : '-')), '-,-,0,0,1,1,1,1,1,1,1,1,1,0,0,-,-,-,-,-,-,-,-,-,-,-,-,-', 'spreads');
	expect.equal(column((r) => r.engine.chop > 0), 'false,false,false,false,false,false,false,false,false,false,false,true,true,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true', 'chop at 12 and 13, then from 20');
	expect.equal(column((r) => r.engine.layers.filter(Boolean).length), '1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3', 'three layers from 21');
	expect.equal(column((r) => r.engine.maps), 'false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,true,true', 'maps from 16');
	expect.equal(column((r) => r.engine.foam), 'false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,true,true,true', 'foam from 26');
	expect.equal(column((r) => r.engine.glow), 'false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,true,true', 'glow from 27');
});

test('materials, overlays, the graph and the charts sit where the contract puts them', () => {
	expect.equal(column((r) => r.look.material), 'white,white,white,white,white,white,white,white,white,terms,terms,terms,terms,white,white,painted,painted,painted,painted,painted,painted,painted,painted,painted,painted,painted,painted,painted', 'materials');
	expect.equal(column((r) => r.look.overlay.kind ?? '-'), '-,-,-,-,directions,-,-,normals,slopes,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-', 'overlays');
	expect.equal(column((r) => (r.look.graph.opacity >= GRAPH_HOLD ? 'G' : graphBand(r.look.graph) ? 'b' : '-')), 'G,G,G,b,-,-,-,-,-,-,-,-,-,G,G,-,-,-,-,-,-,-,-,-,-,-,-,-', 'graph steps');
	expect.equal(column((r) => r.look.graph.components), 'false,false,true,false,false,false,false,false,false,false,false,false,false,true,false,false,false,false,false,false,false,false,false,false,false,false,false,false', 'components');
	expect.equal(column((r) => r.charts.phaseArrows || '-'), '-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,still,turning,-,-,-,-,-,-,-,-,-,-', 'phase arrows');
	expect.equal(at('jonswap').charts.spectrum, true, 'the spectrum chart');
	expect.equal(at('fft').charts.transformN, 32, 'the FFT timing');
	expect.equal(JSON.stringify(at('fourier').charts.notes), '[true,true,true]', "step 15's tones");
	expect.equal(at('diffuse').look.terms.specular, false, 'diffuse alone');
	expect.equal(at('highlights').look.terms.fresnel, true, 'every term');
	for (const id of ['sine', 'moving-sine', 'sum-of-sines', 'frequency', 'fourier']) {
		const g = at(id).look.graph;
		expect.truthy(g.near === FLAT_BAND && g.far === FLAT_BAND && g.yScale > 1 && g.opacity === 1, `${id} is the flat graph`);
	}
	expect.truthy(at('into-3d').look.graph.far > 100 && at('into-3d').look.graph.near === FLAT_BAND, 'step 4 unrolls behind the curve');
	expect.equal(at('directions').look.graph.near, NO_CLIP, 'step 5 has no clip');
});

test('graph shots face the plane side-on, inside the orbit tilt, from the dry side; the finale drifts', () => {
	for (const id of ['sine', 'moving-sine', 'sum-of-sines', 'into-3d', 'frequency', 'fourier']) {
		const { position, target } = at(id).shot;
		expect.truthy(position[0] < GRAPH_PLANE_X - at(id).look.graph.near, `${id}'s camera is on the dry side of the band`);
		expect.truthy(polarOf(at(id).shot).polar <= MAX_POLAR, `${id}'s tilt is inside the orbit limit`);
		if (at(id).look.graph.opacity === 1) {
			expect.truthy(Math.abs(target[2] - position[2]) < 1e-9 && target[0] > position[0], `${id} looks along +x`);
		}
	}
	expect.equal(at('finale').shot.move, 'drift', 'the finale drifts');
	expect.truthy(R.filter((r) => r.shot.move === 'drift').length === 1, 'only the finale');
});

test('every slider binds a value its recipe declares, has a known kind, and its default is a value it takes', () => {
	const ids = new Map();
	for (const recipe of R) {
		for (const slider of recipe.sliders) {
			expect.truthy(KINDS.includes(slider.kind), `${recipe.id} ${slider.id} kind`);
			const bound = getPath(recipe, slider.bind);
			expect.truthy(clampSlider(slider, slider.default) === slider.default, `${recipe.id} ${slider.id} default fits`);
			expect.truthy(bound === slider.default, `${recipe.id} ${slider.id}: the recipe holds its default`);
			ids.set(slider.id, [...(ids.get(slider.id) ?? []), recipe.id]);
		}
	}
	expect.equal(column((r) => r.sliders.map((s) => s.id).join('+') || '-'),
		'amplitude+wavelength,speed,waveCount,wireframe,fan,waveCount,wireframe,-,spacing,sunAzimuth,specular+fresnel,chop,-,waveCount,note1+note2+note3,wind+fetch,seed,-,transformN,chop,layer1+layer2+layer3,-,-,wireframe,-,whitecap+fade,sunHeight+glow,-',
		'the contract slider ids');
});
```

Run: `cd /Users/cole/Projects/Wesbite-ocean-page && node --test tests/ocean/stages/recipes.test.js tests/ocean/stages/blend.test.js tests/ocean/stages/steps.test.js`
Expected: the new recipes tests and the C2 blend tests PASS. Older blend tests that name steps by number fail until Step 11; note which.

- [ ] **Step 9: The dev route takes an id; the scroll map, the knobs and the timing take numbers from ids**

Append to `tests/ocean/stages/route.test.js`:
```js
// C2: ?step= takes a step id as well as a number.
test('the dev route takes a step id, and warns on an id that is no step', async () => {
	const { stepOf } = await import('../../../content/ocean/js/stages/steps.js');
	expect.equal(parseStageRoute('?step=into-3d').step, stepOf('into-3d'), 'an id');
	expect.equal(parseStageRoute('?step=finale&progress=0.4').step, stepOf('finale'), 'the finale by name');
	const bad = parseStageRoute('?step=flat-plane');
	expect.equal(bad.step, 1, 'falls back to step 1');
	expect.truthy(bad.warnings.some((w) => w.includes('flat-plane')), 'and says so');
	expect.equal(parseStageRoute('?step=7').step, 7, 'numbers still work');
});
```
In `content/ocean/js/stages/route.js`, import `{ STEP_COUNT, STEP_IDS, stepOf }` from `./steps.js` (drop the `recipes.js` import), and replace the `const step = readNumber(...)` line with:
```js
	const raw = query.get('step').trim();
	let step;
	if (/^[a-z][a-z0-9-]*$/.test(raw)) {
		// C2: a step's id (?step=into-3d).
		if (STEP_IDS.includes(raw)) {
			step = stepOf(raw);
		} else {
			warnings.push(`step=${raw} is not a step; using 1`);
			step = 1;
		}
	} else {
		step = readNumber(query, 'step', 1, 1, STEP_COUNT, warnings, true);
	}
```
and add "or a step id (`?step=into-3d`, C2)" to the header's first sentence.

In `content/ocean/js/page/scrollMap.js`: replace `export const LAST_STEP = 13;` and its comment with
```js
// The story's last step (stages/steps.js); scrollMap.test.js checks it is STEP_COUNT.
import { STEP_COUNT } from '../stages/steps.js';
export const LAST_STEP = STEP_COUNT;
```
(put the import at the top of the module with a blank line after the header comment).

In `content/ocean/js/page/knobs.js`: import `{ stepOf }` from `'../stages/steps.js'` and replace the steps: `wind` and `fetch` -> `stepOf('jonswap')`, `chop` -> `stepOf('choppiness')`, `whitecap` and `foamDecay` -> `stepOf('foam')`, `scatter` -> `stepOf('glow')`.

In `content/ocean/js/ui/liveTiming.js`: import `{ stepOf }` from `'../stages/steps.js'`; `export const TIMING_STEP = stepOf('many-waves');`; the header says "beside step 6's wave-count slider (`many-waves`)". `recipeFor(TIMING_STEP).engine.chop` stays (0).

In `content/ocean/js/page/sliderModel.js`: in `TERM_BY_SLIDER`, `wireframe: null` (C2: the wireframe switch is not a term in any formula) and add `fan: 't-dir'`, `spacing: 't-h'`, `specular: 't-spec'`, `fresnel: 't-fresnel'`, `note1: 't-note'`, `note2: 't-note'`, `note3: 't-note'`. Update its header's example ("step 4's Shading") to "the Wireframe switch".

In `content/ocean/js/ui/charts.js`: import `{ stepOf }` from `'../stages/steps.js'`; `const SLOW_NOTE_ID = \`control-${stepOf('fft')}-transformN-slow\`;`; `optionButton` and `gridControl` select `#step-${stepOf('fft')} ...`; `const BY_STEP = { [stepOf('jonswap')]: 'spectrum', [stepOf('random-sea')]: 'phase', [stepOf('time')]: 'phase', [stepOf('fft')]: 'transforms' };`. Leave the rest for lane E (the header's step numbers become ids: "spectrum (`jonswap`)", "phase (`random-sea` and `time`)", "transforms (`fft`)").

In `scripts/ocean-stage-capture.mjs`: import `{ STEP_COUNT, STEP_IDS, stepOf }` from `'../content/ocean/js/stages/steps.js'`; a step in the list may be a number or an id; default `Array.from({ length: STEP_COUNT }, (_, i) => i + 1)`; validate `1..STEP_COUNT` after mapping ids with `stepOf`; the header says "the story's steps" and "e.g. \"11\" or \"sine,into-3d,28\"".

- [ ] **Step 10: The render and page hooks: stage look clip, orbit hold, graph and overlay stubs, page stubs, wiring**

In `content/ocean/js/render/cameraRig.js`, inside `createCameraRig` after `let applying = false;` add `let storyOrbit = true; let orbitHeld = false;`; in `limitForStory`, inside `if (coarsePointer) {`, add `storyOrbit = false;` next to `controls.enabled = false;`; add to the returned object:
```js
		// C2: while the flat graph shows, the visitor's orbit is held (the story calls this every
		// frame; only a change does anything). A touch-first screen never had the orbit.
		holdOrbit(held) {
			if (held === orbitHeld) {
				return;
			}
			orbitHeld = held;
			controls.enabled = storyOrbit && !held;
		},
```

In `content/ocean/js/render/stageLook.js`:
- `const MODES = Object.freeze(['white', 'sea-lit', 'sea-flat', 'painted', 'terms']);`
- In `modeOf`, first line: `if (look.material === 'terms') return 'terms';`
- In `shared`, add `// C2: lane D replaces this stand-in with the term-by-term material (render/termsMaterial.js).` and `terms: new THREE.MeshStandardMaterial({ color: sea, roughness: SEA_ROUGHNESS, metalness: 0 }),`
- After `let sunElevation = Number.NaN;` add:
```js
	// C2: the planes every surface material is clipped to (stages/graph.js), or null.
	let clip = null;
	const surfaceMaterials = () => [...new Set([...Object.values(shared), wireMaterial, ...materials.patchMaterials, ...materials.quadMaterials])];
	function setClip(planes) {
		const next = planes && planes.length > 0 ? planes : null;
		if (next === clip) {
			return;
		}
		view.renderer.localClippingEnabled = true;
		for (const material of surfaceMaterials()) {
			material.clippingPlanes = next;
		}
		clip = next;
	}
```
- In `probe()`, add `clipped: clip !== null,` and `terms: null,` (lane D fills `terms`).
- `return { apply, probe, setClip };`
- Header: add "C2: the `terms` material (a stand-in until lane D's) and `setClip`, which clips every surface material to the flat graph's band".

Create `content/ocean/js/render/graphStage.js`:
```js
// The flat graph of steps 1 to 4, 14 and 15 (piece C2; lane B owns this file; spec 10.4). Task 0's
// version only clips the surface to the graph's band (stages/graph.js graphBand) through the stage
// look; lane B adds the backdrop, the axes and the curves. The planes are kept and only their
// constants change, so a band that moves every frame costs nothing.
import * as THREE from 'three';
import { GRAPH_OFF, graphBand } from '../stages/graph.js';

export function createGraphStage({ view, ocean, look, reducedMotion = false }) {
	// Points whose signed distance n.p + c is negative are clipped: keep x >= xMin and x <= xMax.
	const minPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
	const maxPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
	const planes = [minPlane, maxPlane];
	let current = GRAPH_OFF;
	let band = null;

	function apply(graph) {
		current = graph;
		band = graphBand(graph);
		if (band === null) {
			look.setClip(null);
			return;
		}
		minPlane.constant = -band[0];
		maxPlane.constant = band[1];
		look.setClip(planes);
	}

	function frame(t) {}

	function probe() {
		return {
			opacity: current.opacity,
			shown: current.opacity,
			yScale: current.yScale,
			band: band === null ? null : [band[0], band[1]],
			emptied: false,
			components: 0,
			curve: null,
		};
	}

	return { apply, frame, probe };
}
```
(`view`, `ocean` and `reducedMotion` are unused until lane B; keep the parameters, they are the contract.)

Create `content/ocean/js/render/surfaceOverlays.js`:
```js
// Arrows on the surface (piece C2; lane C owns this file; spec 10.7 steps 5, 8 and 9): each wave's
// heading, the surface's normals, and the central-difference normal beside the exact one. Task 0's
// version is the interface with nothing drawn.
export function createSurfaceOverlays({ view, ocean }) {
	let kind = null;
	let spacing = 4;
	return {
		apply(overlay) {
			kind = overlay.kind;
			spacing = overlay.spacing;
		},
		frame(t, focus) {},
		probe() {
			return { kind, arrows: 0, spacing, meanAngle: null, finite: true };
		},
	};
}
```

In `content/ocean/js/ui/storyStage.js`:
- Imports: add `import { createGraphStage } from '../render/graphStage.js';`, `import { createSurfaceOverlays } from '../render/surfaceOverlays.js';`, `import { GRAPH_HOLD } from '../stages/graph.js';`, `import { stepOf } from '../stages/steps.js';`.
- After `const look = createStageLook(...)`:
```js
	// C2: the flat graph and the arrows on the surface (spec 10.4, 10.7).
	const graph = createGraphStage({ view, ocean, look, reducedMotion });
	const overlays = createSurfaceOverlays({ view, ocean });
	const focusNow = [0, 0];
	// True while the graph's backdrop is at least GRAPH_HOLD opaque: the visitor's orbit and the
	// phone's tilt are held then, so nobody drags the camera off the graph.
	let graphHeld = false;
```
- In `beforeStep`, right after `look.apply(out.look);`:
```js
		graph.apply(out.look.graph);
		overlays.apply(out.look.overlay);
		graphHeld = out.look.graph.opacity >= GRAPH_HOLD;
		rig.holdOrbit(graphHeld);
```
- In `afterStep`, right after `view.settleEnvironment();`:
```js
		graph.frame(ocean.teachT);
		overlays.frame(ocean.teachT, rig.focus(focusNow));
```
- In `tiltOffset`, the last line becomes `return graphHeld || isZeroOffset(offset) ? null : offset;`
- In `charts`: `director.valueOf(7, ...)` -> `director.valueOf(stepOf('jonswap'), ...)` (both), `recipeFor(7)` -> `recipeFor(stepOf('jonswap'))`, `recipeFor(8)` -> `recipeFor(stepOf('random-sea'))`, `director.valueOf(8, 'seed')` -> `director.valueOf(stepOf('random-sea'), 'seed')` (both places). `phaseArrows()` takes an optional time, `phaseArrows(t = ocean.t)`, passed to `arrowsAt(..., t)`: lane E draws step 17's arrows still at t = 0.
- In `hooks`, add `graph: () => graph.probe(),` and `overlays: () => overlays.probe(),`.
- Header: "shows step 13's recipe" -> "shows the last step's recipe (the finale)"; add a paragraph "C2: each frame also applies the flat graph (render/graphStage.js) and the surface overlays (render/surfaceOverlays.js); while the graph's backdrop is half opaque or more the orbit and the phone's tilt are held."

In `content/ocean/js/ui/devStage.js`: import the two creators; after `const look = createStageLook(...)` add `const graph = createGraphStage({ view, ocean, look }); const overlays = createSurfaceOverlays({ view, ocean }); const focusNow = [0, 0];`; in `beforeStep` after `look.apply(out.look);` add `graph.apply(out.look.graph); overlays.apply(out.look.overlay);`; in `afterStep` after `view.settleEnvironment();` add `graph.frame(ocean.teachT); overlays.frame(ocean.teachT, rig.focus(focusNow));`; add `graph: () => graph.probe(), overlays: () => overlays.probe(),` to `hooks`. The comment "step 13" becomes "the finale".

Create the four page-feature stubs:

`content/ocean/js/ui/mathBox.js`:
```js
// The always-on math box (piece C2; lane A owns this file; spec 10.3). Task 0's version is the
// interface: it leaves the slot hidden.
export function mountMathBox({ root, watchReading, reducedMotion = false }) {
	return Object.freeze({ hooks: Object.freeze({ shown: () => null }) });
}
```
`content/ocean/js/ui/overlayReadout.js`:
```js
// The live readout under step 9's arrows (piece C2; lane C owns this file; spec 10.7). Task 0's
// version is the interface: the readout stays empty.
export function mountOverlayReadout({ handle, watchReading }) {
	return Object.freeze({ hooks: Object.freeze({ text: () => '' }) });
}
```
`content/ocean/js/ui/frequencyCharts.js`:
```js
// The frequency-domain charts of steps 14 and 15 (piece C2; lane E owns this file; spec 10.7).
// Task 0's version is the interface: the charts stay empty.
export function mountFrequencyCharts({ story, ocean, onLayout = () => {} }) {
	return Object.freeze({ hooks: Object.freeze({ drawn: () => [] }) });
}
```
`content/ocean/js/ui/insets.js`:
```js
// The texture insets of steps 22, 23 and 25 (piece C2; lane F owns this file; spec 10.7). Task 0's
// version is the interface: the insets stay empty.
export function mountInsets({ handle, watchReading, onLayout = () => {} }) {
	return Object.freeze({ hooks: Object.freeze({ drawn: () => [] }) });
}
```

Create `content/ocean/js/page/mathSteps.js`:
```js
// The math box's content, one entry per step (piece C2; lane A owns this file; spec 10.3): the
// equation so far as TeX (`tex`, with \htmlClass{fresh}{...} round what the step adds and the
// sliders' \htmlClass{t-...} term colours) and one plain sentence on what changed (`changed`, no
// digits). Task 0's version is a placeholder per step.
import { STEP_IDS } from '../stages/steps.js';

export const MATH_STEPS = Object.freeze(Object.fromEntries(STEP_IDS.map((id) => [id, Object.freeze({ tex: String.raw`\text{${id}}`, changed: 'Placeholder until the math box is written.' })])));

export function mathFor(id) {
	const entry = MATH_STEPS[id];
	if (!entry) {
		throw new RangeError(`the math box has no entry for ${JSON.stringify(id)}`);
	}
	return entry;
}
```

Create `content/ocean/css/mathbox.css`, `content/ocean/css/frequency.css` and `content/ocean/css/insets.css`, each holding one header comment only, e.g. `/* The math box (piece C2; lane A owns this file; spec 10.3). */`, `/* The frequency charts of steps 14 and 15 (piece C2; lane E owns this file). */`, `/* The texture insets of steps 22, 23 and 25 (piece C2; lane F owns this file). */`.

In `content/ocean/js/ui/page.js`, add to the feature imports (above `// Feature imports end.`):
```js
import { mountMathBox } from './mathBox.js';
import { mountOverlayReadout } from './overlayReadout.js';
import { mountFrequencyCharts } from './frequencyCharts.js';
import { mountInsets } from './insets.js';
```
and above `// Features end.`:
```js
	// C2 (spec 10.3): the math box, which needs no ocean: it follows the scroll story from the start.
	try {
		window.__mathbox = mountMathBox({ root: document.getElementById('mathbox'), watchReading: (listener) => story.onChange(listener), reducedMotion }).hooks;
	} catch (error) {
		console.error('[ocean] the math box could not start', error);
	}
	// C2 (spec 10.7): step 9's readout, steps 14 and 15's charts and the texture insets, once the
	// ocean runs in story mode. Each is its own feature, so one that throws never stops the others.
	features.push({
		attachOcean(handle) {
			if (handle.story) {
				window.__overlayReadout = mountOverlayReadout({ handle, watchReading: (listener) => story.onChange(listener) }).hooks;
			}
		},
	});
	features.push({
		attachOcean(handle) {
			if (handle.story) {
				window.__frequency = mountFrequencyCharts({ story: handle.story, ocean: handle.ocean, onLayout: () => story.relayout() }).hooks;
			}
		},
	});
	features.push({
		attachOcean(handle) {
			if (handle.story) {
				window.__insets = mountInsets({ handle, watchReading: (listener) => story.onChange(listener), onLayout: () => story.relayout() }).hooks;
			}
		},
	});
```
In the "Task 6" feature, `step === TIMING_STEP` stays (it is `stepOf('many-waves')` now). Update the "Task 8" comment to "the charts for steps 16 to 19".

- [ ] **Step 11: The page: 28 sections with their slots, the stylesheet additions**

Restructure `content/ocean/index.html`. Keep the head, the import map, the header, canvas, notices, `#stats`, `#motion`, `#tilt`, noscript, the opening and everything after the story as they are, with these changes:
- In the head, after `<link rel="stylesheet" href="/ocean/proof.css">`, add the three stylesheet links `/ocean/css/mathbox.css`, `/ocean/css/frequency.css`, `/ocean/css/insets.css` (site-absolute).
- After `<pre id="stats" hidden></pre>` add `<aside id="mathbox" class="mathbox" data-mathbox aria-label="The math so far" hidden></aside>`.
- Replace the 13 step sections with 28, in `STEP_IDS` order, each:
```html
		<section class="step" id="step-N" data-step="N" data-step-id="ID" aria-labelledby="step-N-title">
			<article class="panel">
				<p class="chapter">Chapter WORD · TITLE</p>   <!-- only on sine, unlit, gerstner, frequency, fields, foam -->
				<h2 id="step-N-title">TITLE (the recipe's title, exactly)</h2>
				<p>PARAGRAPH</p>
				<div class="controls" data-controls="N" data-copy-skip="live"></div>
				SLOTS
				<details class="math">
					<summary>The math</summary>
					<div class="tex" data-copy-skip="math"><code>TEX</code></div>
					<p class="math-note">NOTE</p>
				</details>
				CARD
			</article>
		</section>
```
Chapter labels: `Chapter one · One wave`, `Chapter two · Light`, `Chapter three · Better waves`, `Chapter four · The real ocean`, `Chapter five · Textures`, `Chapter six · The look`. "Old step K" below means piece C's step K in `git show HEAD:content/ocean/index.html`, moved verbatim with only its ids and numbers changed. A placeholder paragraph is `Placeholder: ` followed by the "Visitor sees" text given, with no digits. Every new figcaption, math note and card text is a placeholder without digits; lane G rewrites them all.

| N | id | Paragraph | Slots | TeX (`TEX`) | Note | Card |
|---|---|---|---|---|---|---|
| 1 | sine | Placeholder: one still sine curve on a dark graph; change its height and length. | — | old step 2's TeX | old step 2's note | — |
| 2 | moving-sine | Placeholder: the curve slides along; set its speed. | — | old step 2's TeX | old step 2's note | — |
| 3 | sum-of-sines | Placeholder: waves laid along one line, each faint, their sum bold. | — | old step 3's TeX | Placeholder. | — |
| 4 | into-3d | Placeholder: the camera swings round and the curve is the edge of a surface. | — | `y(x, z, t) = \sum_{i=1}^{N} A_i \sin(k_i x - \omega_i t + \varphi_i)` | Placeholder. | old step 2's card |
| 5 | directions | Placeholder: each wave gets its own heading; arrows show them. | — | `y(\mathbf{x}, t) = \sum_i A_i \sin\big(k_i\,(\htmlClass{t-dir}{\hat{\mathbf{d}}_i}\cdot\mathbf{x}) - \omega_i t + \varphi_i\big)` | Placeholder. | — |
| 6 | many-waves | old step 3's paragraph | — | old step 3's TeX | old step 3's note | old step 3's card, with its "What I did" row replaced by `<dd>Kept the count down, and the page keeps fewer still where the small ones wouldn't show.</dd>` |
| 7 | unlit | Placeholder: the wireframe off, a white blob with no form. | — | `c = c_{\text{white}}` | Placeholder. | — |
| 8 | normals | Placeholder: arrows out of the surface show which way it faces. | — | `\mathbf{n} = \frac{(-\partial_x y,\ 1,\ -\partial_z y)}{\lVert(-\partial_x y,\ 1,\ -\partial_z y)\rVert}` | Placeholder. | — |
| 9 | slopes | Placeholder: two arrows per point, measured from neighbours and taken exactly. | `<p class="readout" data-readout="slopes" data-copy-skip="live"></p>` | `\partial_x y \approx \frac{y(x + \htmlClass{t-h}{h}) - y(x - \htmlClass{t-h}{h})}{2\htmlClass{t-h}{h}}` | Placeholder. | — |
| 10 | diffuse | Placeholder: the sea lit by the sun alone. | — | `L = \max(0,\ \mathbf{n}\cdot\htmlClass{t-sun}{\mathbf{s}})` | Placeholder. | — |
| 11 | highlights | old step 4's paragraph | — | `L = \max(0,\ \mathbf{n}\cdot\htmlClass{t-sun}{\mathbf{s}}), \quad \htmlClass{t-spec}{S} = (\mathbf{n}\cdot\mathbf{h})^{p}, \quad \htmlClass{t-fresnel}{F} = F_0 + (1 - F_0)(1 - \mathbf{n}\cdot\mathbf{v})^5` | old step 4's note | placeholder card: the three `dt`s Normally, In Roblox, What I did, each `<dd>Placeholder.</dd>` |
| 12 | gerstner | old step 5's paragraph | — | old step 5's TeX | old step 5's note | — |
| 13 | tiling | old step 6's paragraph | — | old step 6's TeX | old step 6's note | — |
| 14 | frequency | Placeholder: back to the flat graph, and the same waves as spikes. | `figure.chart[data-chart="frequency"]` | `y(x) = \sum_{i=1}^{\htmlClass{t-count}{N}} A_i \sin(k_i x + \varphi_i)` | Placeholder. | — |
| 15 | fourier | Placeholder: a chord split into its tones and put back together. | `figure.chart[data-chart="fourier"]` | `y(t) = \sum_{j} \htmlClass{t-note}{a_j} \sin(2\pi f_j t), \qquad \hat{y} = \mathcal{F}\{y\}` | Placeholder. | — |
| 16 | jonswap | old step 7's paragraph | old step 7's spectrum figure | old step 7's TeX | old step 7's note | — |
| 17 | random-sea | Placeholder: each wave's random height and starting angle, as arrows held still. | `figure.chart[data-chart="phase"][data-motion="still"]` | `\tilde h_0(\mathbf{k}) = \tfrac{1}{2}\,\htmlClass{t-seed}{(\xi_r + i\,\xi_i)}\sqrt{S(\mathbf{k})\,\Delta k_x\,\Delta k_z}` | Placeholder. | — |
| 18 | time | old step 8's paragraph | old step 8's phase figure, with `data-motion="turning"` added | old step 8's TeX | old step 8's note | — |
| 19 | fft | old step 9's paragraph | old step 9's transforms figure | old step 9's TeX | old step 9's note | old step 9's card |
| 20 | choppiness | Placeholder: the sea from the side; a second set of transforms pushes points sideways. | — | `\mathbf{x}' = \mathbf{x} + \htmlClass{t-chop}{c}\,\mathbf{D}(\mathbf{x}, t)` | Placeholder. | — |
| 21 | layers | old step 10's paragraph | — | old step 10's TeX | old step 10's note | old step 10's card |
| 22 | fields | Placeholder: the transform's answer as images of numbers. | `figure.inset[data-inset="fields"]` | `h_{ij},\ \ \partial_x h_{ij},\ \ D_{x,ij}` | Placeholder. | — |
| 23 | sampling | Placeholder: one point among its four neighbours, and the wrap at the edge. | `figure.inset[data-inset="sampling"]` | `h = (1-f_u)(1-f_v)\,h_{00} + f_u(1-f_v)\,h_{10} + (1-f_u)f_v\,h_{01} + f_u f_v\,h_{11}` | Placeholder. | placeholder card as in step 11 |
| 24 | mesh | Placeholder: the rings of the mesh under a wireframe. | — | `\Delta_r = 2^r, \qquad \mathbf{c}_r = \Delta_r \operatorname{round}(\mathbf{p} / \Delta_r)` | Placeholder. | the merged rings card below |
| 25 | painted | Placeholder: the painted colour, glow and ripple maps, live. | `figure.inset[data-inset="painted"]` | `\text{rgb} = \tfrac{1}{2}(n_x,\ n_z,\ n_y) + \tfrac{1}{2}` | Placeholder. | old step 4's card |
| 26 | foam | old step 11's paragraph | — | old step 11's TeX | old step 11's note | old step 11's card |
| 27 | glow | old step 12's paragraph | — | old step 12's TeX | old step 12's note | old step 12's card |
| 28 | finale | old step 13's section contents, whole (panel, live, footage, proof, play, recap, believed, credits), as `step-finale` with `data-step-id="finale"` | — | (no math) | — | — |

The new figures are written as:
```html
				<figure class="chart" data-chart="frequency">
					<div class="chart-body" data-copy-skip="live"></div>
					<figcaption>Placeholder caption.</figcaption>
				</figure>
```
(with `data-chart="fourier"`, or `data-chart="phase" data-motion="still"` for step 17), and the insets as:
```html
				<figure class="inset" data-inset="fields">
					<div class="inset-body" data-copy-skip="live"></div>
					<figcaption>Placeholder caption.</figcaption>
				</figure>
```
The merged rings card for step 24:
```html
				<aside class="card">
					<h3>Roblox says no</h3>
					<dl>
						<dt>Normally</dt>
						<dd>You hand the graphics card a mesh once, and tessellation hardware adds triangles near the camera and drops them far away, on the fly.</dd>
						<dt>In Roblox</dt>
						<dd>There's no way to give the GPU your own moving mesh, and no tessellation. The surface has to be built by a script while the game runs, with EditableMesh, and whatever detail it has must already be in the mesh.</dd>
						<dt>What I did</dt>
						<dd>Rings of patches around the camera, each ring twice as coarse as the one inside it, snapping to a fixed world grid as the camera moves so nothing swims, plus a horizon that reaches the edge of the world.</dd>
						<dt>The number</dt>
						<dd>224 patches in 5 rings on the top tier. Points 2, 4, 8, 16 and 32 studs apart, ring by ring.</dd>
					</dl>
				</aside>
```
The finale's recap list stays as it is (lane G updates it).

In `content/ocean/style.css` (it stays the contract's after this task):
- In `:root`, add `--mathbar-height: 44px;` after `--gutter`.
- After `.panel h2::before { ... }` add:
```css
/* C2: a chapter's first panel names the chapter, in words (the copy check reads digits). */
.chapter {
	margin: 0 0 6px;
	font-size: 0.75rem;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--ink-dim);
}

/* C2: a live line under a panel's picture (step 9's readout). */
.readout {
	margin: 10px 0 0;
	font-size: 0.9rem;
	color: var(--ink-dim);
}

.readout:empty {
	display: none;
}
```
- Extend the term colour rules: the `--term-a` list gains `.t-h, .t-note`; the `--term-b` list gains `.t-spec`; the `--term-c` rule becomes `.t-speed, .t-dir, .t-fresnel`.
- In the narrow `@media (max-width: 899.98px)` block, the lower half starts below the math bar: `html { scroll-padding-top: calc(50vh + var(--mathbar-height)); scroll-padding-top: calc(50svh + var(--mathbar-height)); }` and `main#story { padding-top: calc(50vh + var(--mathbar-height)); padding-top: calc(50svh + var(--mathbar-height)); }` (replacing the two `50vh`/`50svh` declarations there).

Update `tests/ocean/page/copySources.js` and `tests/ocean/page/facts.test.js` (lane G owns them from Task 0's commit on):
- Remove the three phrases the moved copy no longer uses: `'Steps 4 and 5 sum the 16 tallest'`, `'In step 6 the camera flies up'`, `'where the small waves would blur, so the page keeps only the 4 tallest'`. Remove the `RECIPES` constant if nothing uses it.
- Re-source `'The page keeps only the 4 tallest (the small ones would blur at this distance)'` to `FACTS` with the quote `"the tiling step sums the bank's 4 tallest waves"`, and add that test to `facts.test.js`:
```js
test("the tiling step sums the bank's 4 tallest waves", async () => {
	const { recipeFor } = await import('../../../content/ocean/js/stages/recipes.js');
	const { stepOf } = await import('../../../content/ocean/js/stages/steps.js');
	expect.equal(recipeFor(stepOf('tiling')).engine.bank.count, 4, 'four waves');
});
```
- Any other test in `facts.test.js` that names a step by number takes it from `stepOf`.

Create `tests/ocean/page/structure.js`:
```js
// What index.html's story must hold (piece C2, Task 0): one section per step in order with its id,
// title, controls and math, the cards and slots where the contract puts them, the chapter labels,
// the math box and the stylesheets. Lane G rewrites the words and must keep this structure; Node
// reads it with regular expressions, so it needs no browser.
import { CHAPTERS, STEP_IDS } from '../../../content/ocean/js/stages/steps.js';

export const CARD_STEP_IDS = Object.freeze(['into-3d', 'many-waves', 'highlights', 'fft', 'layers', 'sampling', 'mesh', 'painted', 'foam', 'glow']);
export const SLOTS = Object.freeze({
	slopes: ['data-readout="slopes"'],
	frequency: ['data-chart="frequency"'],
	fourier: ['data-chart="fourier"'],
	jonswap: ['data-chart="spectrum"'],
	'random-sea': ['data-chart="phase" data-motion="still"'],
	time: ['data-chart="phase" data-motion="turning"'],
	fft: ['data-chart="transforms"'],
	fields: ['data-inset="fields"'],
	sampling: ['data-inset="sampling"'],
	painted: ['data-inset="painted"'],
});
export const CHAPTER_WORDS = Object.freeze(['one', 'two', 'three', 'four', 'five', 'six']);
export const STYLESHEETS = Object.freeze(['/ocean/style.css', '/ocean/proof.css', '/ocean/css/mathbox.css', '/ocean/css/frequency.css', '/ocean/css/insets.css']);

// Each step section's opening tag attributes and inner HTML, in document order.
export function structureOf(html) {
	const sections = [...html.matchAll(/<section class="step[^"]*" id="step-(\d+)" data-step="(\d+)" data-step-id="([a-z0-9-]+)"[^>]*>([\s\S]*?)(?=<section class="step|<\/main>)/g)];
	return sections.map((m) => ({ n: Number(m[1]), dataStep: Number(m[2]), id: m[3], inner: m[4] }));
}

export const EXPECTED = Object.freeze(STEP_IDS.map((id, i) => Object.freeze({ n: i + 1, id, chapter: CHAPTERS.findIndex((c) => c.first === id) })));
```

Create `tests/ocean/page/structure.test.js`:
```js
// index.html's structure against the contract (piece C2, Task 0; tests/ocean/page/structure.js).
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as expect from '../expect.js';
import { RECIPES } from '../../../content/ocean/js/stages/recipes.js';
import { CARD_STEP_IDS, CHAPTER_WORDS, EXPECTED, SLOTS, STYLESHEETS, structureOf } from './structure.js';

const html = readFileSync(new URL('../../../content/ocean/index.html', import.meta.url), 'utf8');
const sections = structureOf(html);

test('one section per step, in order, with its number, id and the recipe title', () => {
	expect.equal(sections.length, EXPECTED.length, 'every step has a section');
	sections.forEach((section, i) => {
		const want = EXPECTED[i];
		expect.equal(`${section.n}/${section.dataStep}/${section.id}`, `${want.n}/${want.n}/${want.id}`, `section ${i + 1}`);
		const title = new RegExp(`<h2 id="step-${want.n}-title">([^<]*)</h2>`).exec(section.inner)?.[1];
		expect.equal(title, RECIPES[i].title, `${want.id}'s title is the recipe's`);
		expect.truthy(section.inner.includes(`<div class="controls" data-controls="${want.n}" data-copy-skip="live"></div>`), `${want.id} controls`);
		const maths = (section.inner.match(/<details class="math">/g) ?? []).length;
		expect.equal(maths, want.id === 'finale' ? 0 : 1, `${want.id} math`);
	});
});

test('cards, slots and chapter labels sit where the contract puts them', () => {
	for (const section of sections) {
		const cards = (section.inner.match(/<aside class="card">/g) ?? []).length;
		expect.equal(cards, CARD_STEP_IDS.includes(section.id) ? 1 : 0, `${section.id} cards`);
		for (const slot of SLOTS[section.id] ?? []) {
			expect.truthy(section.inner.includes(slot), `${section.id} has ${slot}`);
		}
		const want = EXPECTED[section.n - 1];
		const label = /<p class="chapter">([^<]*)<\/p>/.exec(section.inner)?.[1] ?? null;
		if (want.chapter >= 0) {
			expect.truthy(label !== null && label.startsWith(`Chapter ${CHAPTER_WORDS[want.chapter]} · `), `${section.id} names its chapter in words`);
		} else {
			expect.equal(label, null, `${section.id} has no chapter label`);
		}
	}
	const allSlots = Object.values(SLOTS).flat();
	for (const slot of allSlots) {
		expect.equal(html.split(slot).length - 1, 1, `${slot} appears once`);
	}
});

test('the math box slot and the stylesheets, all site-absolute', () => {
	expect.truthy(html.includes('<aside id="mathbox" class="mathbox" data-mathbox aria-label="The math so far" hidden></aside>'), 'the math box slot');
	let last = -1;
	for (const href of STYLESHEETS) {
		const at = html.indexOf(`<link rel="stylesheet" href="${href}">`);
		expect.truthy(at > last, `${href} linked, in order`);
		last = at;
	}
});
```

- [ ] **Step 12: The shared test helpers and the shot checks' graph rules**

Create `tests/ocean/e2e/helpers/stage.js`:
```js
// Shared helpers for the C2 browser tests (piece C2, Task 0). Not a spec file. Every lane's spec
// imports these rather than copying them, so a fix lands everywhere.
export function watchErrors(page) {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	return errors;
}

// Loads the page (any query, e.g. 'step=into-3d&freeze=12') and waits until the ocean has drawn
// `frames` frames.
export async function load(page, query, frames = 20) {
	await page.goto(`/ocean/?${query}`);
	await page.waitForFunction((target) => (window.__ocean?.status().frame ?? 0) > target, frames, { timeout: 120_000 });
}

export async function waitFrames(page, frames) {
	const start = await page.evaluate(() => window.__ocean.status().frame);
	await page.waitForFunction((target) => window.__ocean.status().frame >= target, start + frames, { timeout: 120_000 });
}

// A dev-route hook (window.__ocean.stage[name]) or a story hook (window.__ocean.story[name]).
export const stage = (page, name, ...args) => page.evaluate(([n, a]) => window.__ocean.stage[n](...a), [name, args]);
export const story = (page, name, ...args) => page.evaluate(([n, a]) => window.__ocean.story[n](...a), [name, args]);

// The canvas (or its lower half) as a 64-wide luminance grid, read inside a frame callback after the
// page's own render: the renderer does not keep its drawing buffer between frames.
export async function grid(page, lower = false) {
	return page.evaluate((half) => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const copy = document.createElement('canvas');
		copy.width = 64;
		copy.height = half ? 18 : 36;
		const context = copy.getContext('2d');
		const top = half ? source.height / 2 : 0;
		context.drawImage(source, 0, top, source.width, source.height - top, 0, 0, copy.width, copy.height);
		const data = context.getImageData(0, 0, copy.width, copy.height).data;
		const out = [];
		for (let i = 0; i < data.length; i += 4) out.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
		resolve(out);
	})), lower);
}

export const meanDiff = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
export const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
// The standard deviation: how much a picture varies (a formless blob varies little).
export const spread = (values) => {
	const m = mean(values);
	return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
};

export async function lowerHalfMotion(page, frames) {
	const before = await grid(page, true);
	await waitFrames(page, frames);
	return meanDiff(before, await grid(page, true));
}
```
Add to `tests/ocean/e2e/helpers/story.js`:
```js
// C2: scrollToStep by step id (stages/steps.js), so a test never hard-codes a step number.
export async function scrollToId(page, id, progress = 0.3) {
	const { stepOf } = await import('../../../../content/ocean/js/stages/steps.js');
	await scrollToStep(page, stepOf(id), progress);
}
```

Create `tests/ocean/stages/frames.js`:
```js
// The frames the shot checks walk (piece C2, Task 0; shared by clearance.test.js, shots.test.js and
// orbitLimits.test.js): every recipe's own shot and every blend between neighbours, and the graph's
// rules: a lens on the dry side of the graph's band has no water under it, and while the graph's
// backdrop is (nearly) opaque the world behind it does not show.
import { blendRecipes } from '../../../content/ocean/js/stages/blend.js';
import { graphBand } from '../../../content/ocean/js/stages/graph.js';
import { recipeFor, STEP_COUNT } from '../../../content/ocean/js/stages/recipes.js';

export function everyFrame(progressStep) {
	const frames = [];
	for (let n = 1; n <= STEP_COUNT; n++) {
		frames.push({ name: `step ${n} (${recipeFor(n).id})`, blended: blendRecipes(recipeFor(n), recipeFor(n), 0) });
		if (n < STEP_COUNT) {
			for (let i = 1; i * progressStep < 1 - 1e-9; i++) {
				const p = i * progressStep;
				frames.push({ name: `${recipeFor(n).id} -> ${recipeFor(n + 1).id} at ${p.toFixed(2)}`, blended: blendRecipes(recipeFor(n), recipeFor(n + 1), p) });
			}
		}
	}
	return frames;
}

// True when the frame's surface is clipped to a band the lens (a square `lens` studs either side of
// the camera's x) lies wholly outside: no water can be under it.
export function lensIsDry(blended, position, lens) {
	const band = graphBand(blended.look.graph);
	if (band === null) return false;
	return position[0] + lens < band[0] || position[0] - lens > band[1];
}

// The x range of ground the frame can show, or null for the whole world; and whether the backdrop
// hides the world at all.
export function edgeBand(blended) {
	return { band: graphBand(blended.look.graph), hidden: blended.look.graph.opacity >= 0.95 };
}
```

In `tests/ocean/stages/clearance.test.js`:
- Import `everyFrame` and `lensIsDry` from `./frames.js`, `withFan` via `WaveBanks`, and `stepOf` from steps.js; delete the local `everyFrame` and call `everyFrame(PROGRESS_STEP)`.
- Add a header paragraph: "C2: a lens on the dry side of the flat graph's band (stages/graph.js) is clear by construction and skipped; the FFT lenses are read against the hero sea's waves at their own frame's chop (steps 16 to 19 run without chop)."
- In both tests, filter lenses: skip any lens with `lensIsDry(frame.blended, position, LENS)`.
- `heroSample(field, t, x, z, out)` takes a sixth argument `chop` and uses it in place of `field.config.chop`; each lens passes `lens.engine.chop`. The hero check becomes `e.sea.windSpeed === config.params.windSpeed && e.sea.fetch === config.params.fetch && e.seed === SEED` (chop no longer required to be the hero's).
- In the Gerstner test: `const heightSlider = recipeFor(stepOf('sine')).sliders.find((s) => s.id === 'amplitude');` and the bank is `WaveBanks.withCount(WaveBanks.withFan(bank, e.bank.fan), e.bank.count)`.

In `tests/ocean/stages/shots.test.js`:
- Import `everyFrame` and `edgeBand` from `./frames.js` and `stepOf`; delete the local `everyFrame` and call `everyFrame(PROGRESS_STEP)`.
- In the world-edge test, before measuring a frame: `const { band, hidden } = edgeBand(blended); if (hidden) continue;` and when `band` is not null measure only the edge points whose x (relative to the world) lies inside `band`: give `edgeFog` an optional `[xMin, xMax]` argument and skip sample points outside it (`if (band && (centre[0] + x < band[0] || centre[0] + x > band[1])) continue;`).
- The high-shots test reads `for (const id of ['tiling', 'layers'])` with `recipeFor(stepOf(id))`; step 6's ring test reads `recipeFor(stepOf('tiling'))` and sums `withCount(withFan(teachingBank(), fan), count)`.
- The crests-across-the-view test runs over `['many-waves', 'unlit', 'diffuse']` (the deck-like 3D teaching steps), each bank built with its spread.

In `tests/ocean/stages/crests.test.js`: `recipeFor(5)` -> `recipeFor(stepOf('gerstner'))`, and the bank is built with `withFan(teachingBank(), recipe.engine.bank.fan)`.

In `tests/ocean/page/orbitLimits.test.js`: use `everyFrame(0.05)` from `../stages/frames.js` for `everyShot` (`.map(({ name, blended }) => ({ name, shot: blended.shot }))`); the low shots `[4, 5]` become `['diffuse', 'gerstner']` via `stepOf`; the high shots `[6, 10]` become `['tiling', 'layers']`; `recipeFor(STEP_COUNT)` stays.

- [ ] **Step 13: Rename every other test's step numbers to ids**

Old piece-C step K maps to the new step id below. Replace each numeric step in the listed test files with `stepOf('<id>')` (unit tests import `stepOf` from `content/ocean/js/stages/steps.js`; specs too), including `#step-${...}` selectors, `scrollToStep(page, N, ...)` (or use `scrollToId`), `?step=N` URLs (use the id: `?step=jonswap`), `recipeFor(N)`, `valueOf(N, ...)`, `sliders(N)`, `.step === N` and `toBe(N)` on steps, `control-N-...` ids:

| Old K | New id | Notes |
|---|---|---|
| 1 flat plane | `unlit` for the wireframe switch; `sine` where a test only means "the first step" | The flat-plane assertions (`maxAbsY` 0, `still` true) have no new home: rewrite them for `unlit` (a moving white bank: `still` false, wireframe switch changes the canvas) |
| 2 one sine | `sine` (Height, Length) and `moving-sine` (Speed) | `#step-2 .control` count 3 becomes `sine` 2 (Height, Length) and `moving-sine` 1 (Speed); the step-2 dev-route test ("changing along one axis only, moving") moves to `moving-sine` |
| 3 many sines | `many-waves` | The live timing lives here |
| 4 light | `diffuse` (sun) and `highlights` (switches) | The Shading switch is gone: assert `look().mode === 'terms'` and the `specular` switch changes `recipe().look.terms.specular` |
| 5 pointy crests | `gerstner` | |
| 6 repetition | `tiling` | |
| 7 real data | `jonswap` | |
| 8 random ocean | `random-sea` (seed, arrows) and `time` (arrows turning) | A test that the arrows turn uses `time` |
| 9 FFT | `fft` | |
| 10 three layers | `layers` | |
| 11 foam | `foam` | |
| 12 glow | `glow` | |
| 13 finale | `finale` (`STEP_COUNT`) | `#step-13-title` becomes `#step-${STEP_COUNT}-title` |

Files: `tests/ocean/stages/{blend,director,route,sliders}.test.js`, `tests/ocean/engine/bounds.test.js`, `tests/ocean/page/{scrollMap,shotControl,sliderModel,spectrumLayout,knobs}.test.js`, `tests/ocean/e2e/{stageSteps,stages,storyStage,story,controls,charts,math,layout,tilt,features,finale,copy}.spec.js`. Rules:
- A blend test that compared two steps' fogs uses `mesh` (fog 0.0015) and `painted`; one that blended "step 1 into step 2" for a rising sine uses `sine` into `moving-sine` (speed lerps; amplitude is the same) and asserts the speed.
- `director.test.js`'s "step 2 puts one sine wave on the surface" uses `sine`; "press on step 8" uses `random-sea`; "step 14 is refused" becomes `STEP_COUNT + 1`.
- `layout.spec.js`: `TITLES` becomes `RECIPES.map((r) => r.title)` (import from recipes.js), counts read `STEP_COUNT`, `CARD_STEPS` becomes `CARD_STEP_IDS.map(stepOf)` from `../page/structure.js`, the chart list reads `SLOTS`. The phone-layout expectations that measure where the story starts add `--mathbar-height` (44 px) to the 50% offset.
- `stageSteps.spec.js` imports `load`, `waitFrames`, `stage`, `grid`, `meanDiff`, `mean`, `lowerHalfMotion` from `./helpers/stage.js` instead of defining them; its per-step tests use ids in their names and URLs. The old step-4 Shading test becomes "highlights: switching the highlight off changes the sea" (`s.specular`), "diffuse: moving the sun changes the sea" stays as the sun half.
- `copy.spec.js`: the anchor `#step-13-title`/`'The whole thing'` becomes `#step-${STEP_COUNT}-title`; the "phrase still used" corpus also includes every `MATH_STEPS[id].changed` (import from `content/ocean/js/page/mathSteps.js`).
- Keep each test's intent; where an asserted behaviour no longer exists, assert its equivalent on the new home named above, or delete the assertion and say which in the commit body.

- [ ] **Step 14: Write the contract browser test**

Create `tests/ocean/e2e/contract.spec.js`:
```js
// The C2 contract in the browser (piece C2, Task 0): the dev route takes ids, the graph's band clips
// the surface, the orbit is held on the graph, the hooks and slots exist, and the opening is A2's.
import { test, expect } from '@playwright/test';
import { STEP_COUNT, idOf, stepOf } from '../../../content/ocean/js/stages/steps.js';
import { NO_CLIP } from '../../../content/ocean/js/stages/graph.js';
import { load, stage, story, watchErrors, waitFrames } from './helpers/stage.js';
import { oceanRunning, scrollToId, scrollToOpening } from './helpers/story.js';

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

test('the dev route takes a step id and the graph steps clip the surface to their band', async ({ page }) => {
	await load(page, 'step=sum-of-sines&freeze=12', 10);
	expect((await stage(page, 'state')).step).toBe(stepOf('sum-of-sines'));
	const graph = await stage(page, 'graph');
	expect(graph.band).toEqual([-0.5, 0.5]);
	expect((await stage(page, 'look')).clipped).toBe(true);
	await load(page, 'step=directions&freeze=12', 10);
	expect((await stage(page, 'graph')).band).toBe(null);
	expect((await stage(page, 'look')).clipped).toBe(false);
	expect((await stage(page, 'overlays')).kind).toBe('directions');
});

test('every step loads through the dev route by id without an error', async ({ page }) => {
	test.setTimeout(600_000);
	for (let n = 1; n <= STEP_COUNT; n++) {
		await load(page, `step=${idOf(n)}&freeze=12`, 8);
		expect((await stage(page, 'state')).step).toBe(n);
	}
});

test('the story holds the orbit on the graph and lets it go on the surface; the opening is untouched', async ({ page }) => {
	test.setTimeout(240_000);
	await oceanRunning(page);
	expect((await story(page, 'look')).mode).toBe('painted');
	expect((await story(page, 'look')).clipped).toBe(false);
	await scrollToId(page, 'sine', 0.2);
	await waitFrames(page, 10);
	expect(await story(page, 'orbitEnabled')).toBe(false);
	expect((await story(page, 'graph')).band).toEqual([-0.5, 0.5]);
	await scrollToId(page, 'many-waves', 0.2);
	await waitFrames(page, 10);
	expect(await story(page, 'orbitEnabled')).toBe(true);
	expect((await story(page, 'graph')).band).toBe(null);
	await scrollToOpening(page);
	await waitFrames(page, 10);
	expect((await story(page, 'look')).clipped).toBe(false);
	expect(NO_CLIP).toBeGreaterThan(1000);
});

test('the page features are mounted on their slots', async ({ page }) => {
	await oceanRunning(page);
	await expect(page.locator('#mathbox')).toHaveCount(1);
	expect(await page.evaluate(() => typeof window.__mathbox?.shown)).toBe('function');
	await page.waitForFunction(() => window.__insets && window.__frequency && window.__overlayReadout, null, { timeout: 60_000 });
	await expect(page.locator('section[data-step-id]')).toHaveCount(STEP_COUNT);
});
```

- [ ] **Step 15: Run everything**

Run:
```bash
cd /Users/cole/Projects/Wesbite-ocean-page && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -15
```
Expected: every unit test passes, including `steps`, `recipes`, `blend`, `structure`, `clearance`, `shots`, `crests`, `orbitLimits`, `bootGraph`, `copy`, `facts`, `sliderModel` (every swatch's term is in its step's panel TeX). If `clearance` or `shots` fails for a new shot, move that shot within its chapter (higher, or further onto the dry side for a graph step) and rerun; never loosen the checks. Then:
```bash
cd /Users/cole/Projects/Wesbite-ocean-page && OCEAN_PORT=8774 npm run test:ocean:e2e 2>&1 | tail -15
```
Expected: every browser test passes (the renamed ones and `contract.spec.js`). Then capture the steps once and look at four of them (`sine`, `into-3d`, `diffuse`, `fields`) to confirm the page draws:
```bash
cd /Users/cole/Projects/Wesbite-ocean-page && (OCEAN_PORT=8774 npm run serve:ocean >/dev/null 2>&1 &) && sleep 2 && OCEAN_PORT=8774 node scripts/ocean-stage-capture.mjs /private/tmp/c2-contract 0 '' sine,into-3d,diffuse,fields; pkill -f "http.server 8774"
```
Expected: four PNGs, no page errors. (Step 1 shows the sky with nothing drawn: the backdrop is lane B's. That is expected here.)

- [ ] **Step 16: Commit and tag the contract**

```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git add -A content/ocean scripts/ocean-stage-capture.mjs tests/ocean
```
```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git commit -m "feat: the C2 contract: 28 named steps in six chapters, the recipe skeleton, slots, stubs and shared test helpers"
```
```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git tag c2-contract && git log --oneline -1
```
Expected: one commit, tagged `c2-contract` (a local tag; never pushed). Report the commit hash: every lane starts from it.

---

## Wave 1, lane A: the math box (worktree `Wesbite-ocean-c2-a`, branch `ocean-c2-a`, port 8781)

### Task 1: The math box's content and the desktop card

**Files:**
- Modify: `content/ocean/js/page/mathSteps.js`, `content/ocean/js/ui/mathBox.js`, `content/ocean/css/mathbox.css`
- Create: `content/ocean/js/page/mathBoxModel.js`, `tests/ocean/page/mathSteps.test.js`, `tests/ocean/page/mathBoxModel.test.js`, `tests/ocean/e2e/mathBox.spec.js`

**Interfaces:**
- Consumes: `STEP_IDS`, `stepOf`, `idOf` (steps.js); `RECIPES` (recipes.js); `TERM_BY_SLIDER` (page/sliderModel.js); `KATEX_OPTIONS`, `stackEquations` (page/mathTrust.js); `loadKatex()` (ui/math.js); `PHRASES` (tests/ocean/page/copySources.js, read only); the scroll story's `watchReading`; the `#mathbox` slot; `mountMathBox({ root, watchReading, reducedMotion })` called by `ui/page.js`.
- Produces: `MATH_STEPS[id] = { tex, changed }` and `mathFor(id)` (mathSteps.js); `entryFor(reading)`, `readCollapsed(storage)`, `writeCollapsed(storage, collapsed)`, `freshCount(tex)`, `termsIn(tex)`, `COLLAPSE_KEY`, `FRESH_SECONDS`, `PROMPT` (mathBoxModel.js); `window.__mathbox` hooks `{ shown(), state(), collapsed(), show(id), open() , close(), isOpen() }` (Task 2 adds the last three).

- [ ] **Step 1: Make the lane's worktree**

```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git worktree add /Users/cole/Projects/Wesbite-ocean-c2-a -b ocean-c2-a c2-contract
```
```bash
ln -s /Users/cole/Projects/Wesbite-ocean/node_modules /Users/cole/Projects/Wesbite-ocean-c2-a/node_modules && cd /Users/cole/Projects/Wesbite-ocean-c2-a && git log --oneline -1 && node --test tests/ocean/stages/steps.test.js
```
Expected: the contract commit, and 3 passing tests. Every later command in lane A runs in `/Users/cole/Projects/Wesbite-ocean-c2-a` with `OCEAN_PORT=8781`.

- [ ] **Step 2: Write the failing content and model tests**

Create `tests/ocean/page/mathSteps.test.js`:
```js
// The math box's content (piece C2, lane A, Task 1; spec 10.3): one entry per step, each slider's term
// colour in its step's equation, a highlight on what each step adds, and sentences with no numbers.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { MATH_STEPS, mathFor } from '../../../content/ocean/js/page/mathSteps.js';
import { freshCount, termsIn } from '../../../content/ocean/js/page/mathBoxModel.js';
import { TERM_BY_SLIDER } from '../../../content/ocean/js/page/sliderModel.js';
import { RECIPES } from '../../../content/ocean/js/stages/recipes.js';
import { STEP_IDS } from '../../../content/ocean/js/stages/steps.js';
import { PHRASES } from './copySources.js';
import { uncoveredNumbers } from './copyCheck.js';

const balanced = (tex) => {
	let depth = 0;
	for (let i = 0; i < tex.length; i++) {
		if (tex[i] === '\\') { i++; continue; }
		if (tex[i] === '{') depth++;
		if (tex[i] === '}') depth--;
		if (depth < 0) return false;
	}
	return depth === 0;
};

test('one entry per step, nothing else, each with an equation and a sentence', () => {
	expect.equal(Object.keys(MATH_STEPS).join(','), STEP_IDS.join(','), 'the steps, in order');
	for (const id of STEP_IDS) {
		const { tex, changed } = mathFor(id);
		expect.truthy(tex.length > 10 && !tex.includes('\\text{' + id + '}'), `${id} has a real equation`);
		expect.truthy(changed.length > 20 && !changed.startsWith('Placeholder'), `${id} has a real sentence`);
		expect.truthy(balanced(tex), `${id}'s braces balance`);
	}
	expect.equal(new Set(STEP_IDS.map((id) => mathFor(id).changed)).size, STEP_IDS.length, 'every sentence says something new');
});

test("every slider's term colour is in its own step's equation", () => {
	for (const recipe of RECIPES) {
		const terms = termsIn(mathFor(recipe.id).tex);
		for (const slider of recipe.sliders) {
			const term = TERM_BY_SLIDER[slider.id];
			if (term === null) continue;
			expect.truthy(terms.has(term), `${recipe.id}: slider ${slider.id} needs \\htmlClass{${term}} in the box`);
		}
	}
});

test('every step but the finale highlights what it adds; only \\htmlClass is used of the trusted commands', () => {
	for (const id of STEP_IDS) {
		const tex = mathFor(id).tex;
		if (id === 'finale') {
			expect.equal(freshCount(tex), 0, 'the finale adds nothing');
		} else {
			expect.truthy(freshCount(tex) >= 1, `${id} marks what it adds`);
		}
		expect.truthy(!/\\(href|url|includegraphics|htmlId|htmlStyle|htmlData)\b/.test(tex), `${id} uses no other trusted command`);
	}
});

test("the sentences carry no digits, so the copy check never needs a source for them", () => {
	for (const id of STEP_IDS) {
		const { changed } = mathFor(id);
		expect.truthy(!/\d/.test(changed), `${id}: "${changed}"`);
		expect.equal(uncoveredNumbers(changed, PHRASES).length, 0, `${id} copy check`);
	}
	let message = '';
	try { mathFor('flat-plane'); } catch (error) { message = error.message; }
	expect.truthy(message.includes('flat-plane'), 'an unknown id is refused');
});
```

Create `tests/ocean/page/mathBoxModel.test.js`:
```js
// The math box's choices (piece C2, lane A, Task 1): which entry a reading shows, and the per-viewer
// collapse kept in storage that may refuse (a private window throws on every access).
import { test } from 'node:test';
import * as expect from '../expect.js';
import { COLLAPSE_KEY, entryFor, freshCount, readCollapsed, termsIn, writeCollapsed } from '../../../content/ocean/js/page/mathBoxModel.js';
import { mathFor } from '../../../content/ocean/js/page/mathSteps.js';
import { stepOf } from '../../../content/ocean/js/stages/steps.js';

const memory = () => {
	const map = new Map();
	return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
};
const refusing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

test('the opening shows nothing; a step shows its own entry', () => {
	expect.equal(entryFor({ phase: 'opening', step: 1, progress: 0 }), null, 'opening');
	expect.equal(entryFor(null), null, 'no reading');
	const entry = entryFor({ phase: 'step', step: stepOf('slopes'), progress: 0.4 });
	expect.equal(entry.id, 'slopes', 'the id');
	expect.equal(entry.tex, mathFor('slopes').tex, 'its equation');
	expect.truthy(Object.isFrozen(entry), 'frozen');
});

test('the collapse round-trips through storage, and storage that refuses is forgotten, not fatal', () => {
	const store = memory();
	expect.equal(readCollapsed(store), false, 'open by default');
	expect.equal(writeCollapsed(store, true), true, 'stored');
	expect.equal(store.getItem(COLLAPSE_KEY), '1', 'under its key');
	expect.equal(readCollapsed(store), true, 'read back');
	expect.equal(readCollapsed(refusing), false, 'a refusing store reads as open');
	expect.equal(writeCollapsed(refusing, true), false, 'and reports that it could not keep it');
	expect.equal(readCollapsed(null), false, 'no storage at all');
});

test('fresh highlights and term colours are read from the TeX', () => {
	const tex = String.raw`y = \htmlClass{fresh}{\htmlClass{t-amp}{A}} + \htmlClass{fresh}{B} + \htmlClass{t-len}{k}`;
	expect.equal(freshCount(tex), 2, 'two highlights');
	expect.equal([...termsIn(tex)].sort().join(','), 't-amp,t-len', 'two terms');
});
```

Run: `node --test tests/ocean/page/mathSteps.test.js tests/ocean/page/mathBoxModel.test.js`
Expected: FAIL (`mathBoxModel.js` missing; then the placeholders fail "a real equation").

- [ ] **Step 3: Write the content and the model**

Replace `content/ocean/js/page/mathSteps.js` with the entries below. Before writing each, check it against the code it describes (the files named in the comments); a formula that does not match the code is a bug in the box, not in the code.
```js
// The math box's content, one entry per step (piece C2; lane A owns this file; spec 10.3): `tex` is
// the equation so far (cumulative within a lesson), with \htmlClass{fresh}{...} round what the step
// adds and the sliders' \htmlClass{t-...} term colours (style.css), so a swatch on a slider finds its
// symbol in the box; `changed` is one plain sentence on what changed, with no digits (the copy check
// would need a source for them). Checked against: the sine and bank (engine/waveBanks.js,
// core/waveSampler.js), the lighting terms (page/lightTerms.js, render/termsMaterial.js), the choppy
// displacement's sign (core/cascade.js: +i, which moves water toward the crests), the ripple map's
// bytes (core/normalTexels.js: R from n.x, G from n.z, B from n.y), the foam (core/foamField.js) and
// the glow (core/scatterLobe.js).
import { STEP_IDS } from '../stages/steps.js';

const entry = (tex, changed) => Object.freeze({ tex, changed });

export const MATH_STEPS = Object.freeze({
	sine: entry(
		String.raw`y = \htmlClass{fresh}{\htmlClass{t-amp}{A}\,\sin(\htmlClass{t-len}{k}\,x)}, \quad \htmlClass{t-len}{k} = \frac{2\pi}{\htmlClass{t-len}{\lambda}}`,
		'A wave is a height that rises and falls as you move along it: A is how tall, λ how long from crest to crest.',
	),
	'moving-sine': entry(
		String.raw`y = \htmlClass{t-amp}{A}\,\sin(\htmlClass{t-len}{k}\,x \htmlClass{fresh}{{} - \htmlClass{t-speed}{\omega}\,t})`,
		'Time goes inside the sine, so the whole curve slides along at ω/k studs a second.',
	),
	'sum-of-sines': entry(
		String.raw`y = \htmlClass{fresh}{\sum_{i=1}^{\htmlClass{t-count}{N}}} A_i \sin(k_i x - \omega_i t + \htmlClass{fresh}{\varphi_i})`,
		'Several waves, each with its own height, length, speed and starting point, simply added together.',
	),
	'into-3d': entry(
		String.raw`y(x, \htmlClass{fresh}{z}, t) = \sum_{i=1}^{N} A_i \sin(k_i x - \omega_i t + \varphi_i)`,
		'Nothing in the sum depends on z, so the curve is just stretched sideways into a sheet.',
	),
	directions: entry(
		String.raw`y(\htmlClass{fresh}{\mathbf{x}}, t) = \sum_{i=1}^{N} A_i \sin\big(k_i\,(\htmlClass{fresh}{\htmlClass{t-dir}{\hat{\mathbf{d}}_i}\cdot\mathbf{x}}) - \omega_i t + \varphi_i\big)`,
		'Each wave gets a heading, and where you stand becomes a point on the ground instead of a spot on a line.',
	),
	'many-waves': entry(
		String.raw`y(\mathbf{x}, t) = \sum_{i=1}^{\htmlClass{fresh}{\htmlClass{t-count}{N}}} A_i \sin\big(k_i\,(\hat{\mathbf{d}}_i\cdot\mathbf{x}) - \omega_i t + \varphi_i\big)`,
		'The same sum with more of the bank in it, tallest waves first.',
	),
	unlit: entry(
		String.raw`y = \sum_i A_i \sin\theta_i, \qquad \text{colour} = \htmlClass{fresh}{\text{white}}`,
		'No light yet: every point is drawn the same white, so the shape disappears.',
	),
	normals: entry(
		String.raw`\mathbf{T} = (1,\ \partial_x y,\ 0), \quad \mathbf{B} = (0,\ \partial_z y,\ 1), \quad \htmlClass{fresh}{\mathbf{n} = \frac{\mathbf{B}\times\mathbf{T}}{\lVert\mathbf{B}\times\mathbf{T}\rVert}}`,
		'The normal points straight out of the surface: cross the two slope directions and there it is.',
	),
	slopes: entry(
		String.raw`\partial_x y \approx \htmlClass{fresh}{\frac{y(x+\htmlClass{t-h}{h}) - y(x-\htmlClass{t-h}{h})}{2\htmlClass{t-h}{h}}}, \quad \partial_x y = \htmlClass{fresh}{\sum_i A_i k_i\,\hat{d}_{i,x}\cos\theta_i}`,
		'Two ways to get a slope: measure it from neighbours h studs away, or take the exact derivative.',
	),
	diffuse: entry(
		String.raw`\text{colour} = c_{\text{sea}}\,\big(a + \htmlClass{fresh}{\max(0,\ \mathbf{n}\cdot\htmlClass{t-sun}{\mathbf{s}})}\big)`,
		'The more a point faces the sun, the brighter it gets, on top of a little light from the sky.',
	),
	highlights: entry(
		String.raw`\text{colour} = (1 - \htmlClass{fresh}{\htmlClass{t-fresnel}{F}})\big(c_{\text{sea}}(a + \max(0,\ \mathbf{n}\cdot\htmlClass{t-sun}{\mathbf{s}})) + \htmlClass{fresh}{\htmlClass{t-spec}{(\mathbf{n}\cdot\mathbf{h})^{p}}}\big) + \htmlClass{fresh}{\htmlClass{t-fresnel}{F}\,c_{\text{sky}}}, \quad \htmlClass{t-fresnel}{F} = F_0 + (1 - F_0)(1 - \mathbf{n}\cdot\mathbf{v})^5`,
		'A highlight where the sun bounces straight at you, and the sky mirrored in the water more and more as you look across it.',
	),
	gerstner: entry(
		String.raw`\mathbf{x}' = \mathbf{x} + \htmlClass{fresh}{\htmlClass{t-chop}{c}\sum_i \hat{\mathbf{d}}_i A_i \cos\theta_i}, \quad y = \sum_i A_i \sin\theta_i`,
		'Points also slide sideways toward each crest, so the tops pinch and the troughs widen.',
	),
	tiling: entry(
		String.raw`y(\mathbf{x} + \htmlClass{fresh}{\htmlClass{t-tile}{L}\,\mathbf{e}}) = y(\mathbf{x})`,
		'Every wave fits the tile exactly, so the whole sea repeats every L studs.',
	),
	frequency: entry(
		String.raw`y(x) = \sum_{i=1}^{\htmlClass{t-count}{N}} A_i \sin(k_i x + \varphi_i) \;\Longleftrightarrow\; \htmlClass{fresh}{\hat{y}(k)}:\ \text{a spike of height } A_i \text{ at each } k_i`,
		'The same waves written as a list instead of a curve: one spike per wave, at its frequency.',
	),
	fourier: entry(
		String.raw`y(t) = \sum_j \htmlClass{t-note}{a_j}\sin(2\pi f_j t), \qquad \hat{y} = \htmlClass{fresh}{\mathcal{F}}\{y\}, \qquad y = \htmlClass{fresh}{\mathcal{F}^{-1}}\{\hat{y}\}`,
		'Going to frequencies and back loses nothing, so you can take one tone out and rebuild the rest.',
	),
	jonswap: entry(
		String.raw`S(\omega) = \htmlClass{fresh}{\frac{\alpha g^2}{\omega^5}\exp\!\left[-\tfrac{5}{4}\left(\tfrac{\omega_p}{\omega}\right)^4\right]\gamma^{\,r}}, \quad \omega_p = 22\left(\frac{g^2}{\htmlClass{t-wind}{U}\,\htmlClass{t-fetch}{F}}\right)^{1/3}`,
		'Instead of picking the spikes by hand, a measured spectrum says how much energy each frequency gets.',
	),
	'random-sea': entry(
		String.raw`\tilde h_0(\mathbf{k}) = \htmlClass{fresh}{\tfrac{1}{2}\,\htmlClass{t-seed}{(\xi_r + i\,\xi_i)}}\sqrt{S(\mathbf{k})\,\Delta k_x\,\Delta k_z}`,
		"Each wave's height and starting angle are rolled at random around what the spectrum allows.",
	),
	time: entry(
		String.raw`\tilde h(\mathbf{k}, t) = \tilde h_0(\mathbf{k})\,\htmlClass{fresh}{e^{-i\omega t}} + \tilde h_0^{*}(-\mathbf{k})\,\htmlClass{fresh}{e^{i\omega t}}, \quad \omega = \sqrt{g k \tanh(k d)}`,
		"Euler's formula spins every arrow at the speed the dispersion gives it, and the sea starts to move.",
	),
	fft: entry(
		String.raw`h(\mathbf{x}, t) = \sum_{\mathbf{k}} \tilde h(\mathbf{k}, t)\,e^{i\,\mathbf{k}\cdot\mathbf{x}}, \quad O(\htmlClass{t-n}{N}^4) \to \htmlClass{fresh}{O(\htmlClass{t-n}{N}^2 \log \htmlClass{t-n}{N})}`,
		'The same sum for the whole grid at once, reusing work instead of starting over at every point.',
	),
	choppiness: entry(
		String.raw`\mathbf{D}(\mathbf{x}, t) = \htmlClass{fresh}{\sum_{\mathbf{k}} i\,\frac{\mathbf{k}}{\lvert\mathbf{k}\rvert}\,\tilde h(\mathbf{k}, t)\,e^{i\,\mathbf{k}\cdot\mathbf{x}}}, \quad \mathbf{x}' = \mathbf{x} + \htmlClass{t-chop}{c}\,\mathbf{D}`,
		'Another set of transforms gives every point a sideways push toward the crests.',
	),
	layers: entry(
		String.raw`h = \htmlClass{fresh}{\sum_{j=1}^{3} h_j}, \quad \htmlClass{t-layer}{L_j} = 256,\ 64,\ 16`,
		'Grids of three sizes added together, so each one hides where the others repeat.',
	),
	fields: entry(
		String.raw`\htmlClass{fresh}{h_{ij},\ \ \partial_x h_{ij},\ \ D_{x,ij}}, \quad i, j = 0 \ldots N-1`,
		"What the transform hands back isn't a surface: it's grids of numbers, heights and slopes and pushes.",
	),
	sampling: entry(
		String.raw`h(u, v) = \htmlClass{fresh}{(1-f_u)(1-f_v)\,h_{00} + f_u(1-f_v)\,h_{10} + (1-f_u)f_v\,h_{01} + f_u f_v\,h_{11}}, \quad \text{indices} \bmod N`,
		'A point between grid points blends its four neighbours, and the indices wrap round so the grid tiles.',
	),
	mesh: entry(
		String.raw`\Delta_r = 2^r\ \text{studs}, \quad \mathbf{c}_r = \htmlClass{fresh}{\Delta_r\,\operatorname{round}(\mathbf{p} / \Delta_r)}`,
		'Rings of points around the camera, each twice as coarse as the one inside it, snapped to a fixed grid.',
	),
	painted: entry(
		String.raw`\text{ripple map bytes} = \htmlClass{fresh}{\tfrac{1}{2}(n_x,\ n_z,\ n_y) + \tfrac{1}{2}}`,
		'Workers paint the colour, the glow mask and the ripples into images, and Roblox wraps them onto the mesh.',
	),
	foam: entry(
		String.raw`J = (1 + \partial_x D_x)(1 + \partial_z D_z) - \partial_x D_z\,\partial_z D_x, \quad \htmlClass{fresh}{f \leftarrow \operatorname{clamp}\!\big(\htmlClass{t-fade}{\delta}\,f + \beta\,{\max(0,\ \htmlClass{t-whitecap}{w} - J)},\ 0,\ 1\big)}`,
		'Where the surface folds, foam grows, and everywhere it fades a little every step.',
	),
	glow: entry(
		String.raw`E = \htmlClass{fresh}{\htmlClass{t-glow}{\kappa}\,\max(0,\ -\mathbf{s}\cdot\mathbf{v})^{3}\,\big(\tfrac{1}{2} - \tfrac{1}{2}\,\htmlClass{t-sun}{s_y}\big)}, \quad \text{glow} = E \cdot M(h)`,
		'Crests glow when you look toward a low sun through them.',
	),
	finale: entry(
		String.raw`h = \sum_j h_j, \quad \mathbf{x}' = \mathbf{x} + c\,\mathbf{D}, \quad \text{colour} = \text{painted maps} + \text{foam} + \text{glow}`,
		'Nothing new: every piece from the steps above, all at once.',
	),
});

export function mathFor(id) {
	const found = Object.hasOwn(MATH_STEPS, id) ? MATH_STEPS[id] : null;
	if (!found) {
		throw new RangeError(`the math box has no entry for ${JSON.stringify(id)}`);
	}
	return found;
}

// Every step has an entry (mathSteps.test.js checks it too); a missing one would show nothing.
for (const id of STEP_IDS) mathFor(id);
```

Create `content/ocean/js/page/mathBoxModel.js`:
```js
// The math box's choices (piece C2; lane A owns this file; spec 10.3; browser-free): which entry a
// scroll reading shows, the per-viewer collapse, and what the TeX says about itself. The collapse is
// a convenience kept in localStorage: storage can refuse (a private window throws on every access),
// so a refusal reads as "open" and a write reports false; the box carries on without remembering.
import { MATH_STEPS } from './mathSteps.js';
import { idOf } from '../stages/steps.js';

export const COLLAPSE_KEY = 'ocean.mathbox.collapsed';
// How long the terms a step adds glow when the step is entered (spec 10.3: about a second).
export const FRESH_SECONDS = 1.2;
// What the phone's bar says before the first step (Task 2): no digits.
export const PROMPT = 'The math shows up here as you scroll.';

export function entryFor(reading) {
	if (!reading || reading.phase !== 'step') {
		return null;
	}
	const id = idOf(reading.step);
	return Object.freeze({ step: reading.step, id, tex: MATH_STEPS[id].tex, changed: MATH_STEPS[id].changed });
}

export function readCollapsed(storage) {
	try {
		return storage?.getItem(COLLAPSE_KEY) === '1';
	} catch {
		return false;
	}
}

export function writeCollapsed(storage, collapsed) {
	try {
		if (!storage) return false;
		storage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
		return true;
	} catch {
		return false;
	}
}

export const freshCount = (tex) => (tex.match(/\\htmlClass\{fresh\}/g) ?? []).length;
export const termsIn = (tex) => new Set([...tex.matchAll(/\\htmlClass\{(t-[a-z]+)\}/g)].map((m) => m[1]));
```

Run: `node --test tests/ocean/page/mathSteps.test.js tests/ocean/page/mathBoxModel.test.js`
Expected: PASS.

- [ ] **Step 4: Write the failing desktop browser test**

Create `tests/ocean/e2e/mathBox.spec.js`:
```js
// The always-on math box on a desktop (piece C2, lane A, Task 1; spec 10.3): hidden over the opening,
// a glass card at the top right from step 1 on, the step's equation typeset with its term colours,
// the terms it adds glowing on entry, the "what changed" sentence, a remembered collapse, and readable
// TeX when KaTeX never arrives (Review Focus 2).
import { test, expect } from '@playwright/test';
import { MATH_STEPS, mathFor } from '../../../content/ocean/js/page/mathSteps.js';
import { TERM_BY_SLIDER } from '../../../content/ocean/js/page/sliderModel.js';
import { RECIPES } from '../../../content/ocean/js/stages/recipes.js';
import { STEP_IDS } from '../../../content/ocean/js/stages/steps.js';
import { watchErrors } from './helpers/stage.js';
import { scrollToId, scrollToOpening } from './helpers/story.js';

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

const box = (page) => page.locator('#mathbox');

test('hidden over the opening; at the top right from step 1, beside the panels, with its sentence', async ({ page }) => {
	await page.goto('/ocean/');
	await expect(box(page)).toBeHidden();
	await scrollToId(page, 'sine', 0.1);
	await expect(box(page)).toBeVisible();
	await expect(page.locator('#mathbox .mathbox-sentence')).toHaveText(mathFor('sine').changed);
	await expect(page.locator('#mathbox .katex')).not.toHaveCount(0, { timeout: 30_000 });
	const card = await box(page).boundingBox();
	const panel = await page.locator('#step-1 .panel').boundingBox();
	expect(card.x + card.width).toBeLessThanOrEqual(1366 - 15);
	expect(card.y).toBeGreaterThanOrEqual(40);
	expect(panel.x + panel.width).toBeLessThan(card.x);
	await scrollToId(page, 'moving-sine', 0.1);
	await expect(page.locator('#mathbox .mathbox-sentence')).toHaveText(mathFor('moving-sine').changed);
	await expect(box(page)).toHaveClass(/is-entering/);
	await expect(page.locator('#mathbox .fresh')).not.toHaveCount(0);
	await scrollToOpening(page);
	await expect(box(page)).toBeHidden();
});

test('the collapse hides the equation, says so to a screen reader, and is remembered', async ({ page }) => {
	await page.goto('/ocean/');
	await scrollToId(page, 'sine', 0.1);
	const toggle = page.locator('#mathbox .mathbox-toggle');
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(page.locator('#mathbox-body')).toBeHidden();
	await page.reload();
	await scrollToId(page, 'sine', 0.1);
	await expect(page.locator('#mathbox .mathbox-toggle')).toHaveAttribute('aria-expanded', 'false');
	await page.locator('#mathbox .mathbox-toggle').click();
	await expect(page.locator('#mathbox-body')).toBeVisible();
});

// Review Focus 2.
test('the box reads as TeX source when KaTeX is blocked, and still follows the scroll', async ({ page }) => {
	await page.route('**/katex@0.18.10/**', (route) => route.abort());
	await page.goto('/ocean/');
	await scrollToId(page, 'sine', 0.1);
	await page.waitForFunction(() => window.__mathbox.state() === 'failed', null, { timeout: 30_000 });
	await expect(page.locator('#mathbox .mathbox-eq code')).toHaveText(mathFor('sine').tex);
	await scrollToId(page, 'slopes', 0.1);
	await expect(page.locator('#mathbox .mathbox-eq code')).toHaveText(mathFor('slopes').tex);
	await expect(page.locator('#mathbox .mathbox-sentence')).toHaveText(mathFor('slopes').changed);
});

test("every step's equation typesets without a KaTeX error, fits the card, and carries its sliders' colours", async ({ page }) => {
	await page.goto('/ocean/');
	await scrollToId(page, 'sine', 0.1);
	await page.waitForFunction(() => window.__mathbox.state() === 'rendered', null, { timeout: 30_000 });
	for (const id of STEP_IDS) {
		await page.evaluate((step) => window.__mathbox.show(step), id);
		await expect(page.locator('#mathbox .katex-error')).toHaveCount(0);
		await expect(page.locator('#mathbox .katex')).not.toHaveCount(0);
		const fits = await page.evaluate(() => {
			const eq = document.querySelector('#mathbox .mathbox-eq');
			return eq.scrollWidth <= eq.clientWidth + 1;
		});
		expect(fits, `${id} fits the card`).toBe(true);
		const recipe = RECIPES.find((r) => r.id === id);
		for (const slider of recipe.sliders) {
			const term = TERM_BY_SLIDER[slider.id];
			if (term) await expect(page.locator(`#mathbox .${term}`)).not.toHaveCount(0);
		}
	}
	expect(Object.keys(MATH_STEPS).length).toBe(STEP_IDS.length);
});
```

Run: `OCEAN_PORT=8781 npm run test:ocean:e2e -- tests/ocean/e2e/mathBox.spec.js`
Expected: FAIL (the box stays hidden: the stub).

- [ ] **Step 5: Write the desktop box and its styles**

Replace `content/ocean/js/ui/mathBox.js`:
```js
// The always-on math box (piece C2; lane A owns this file; spec 10.3). It follows the scroll story,
// not the ocean, so it works without WebGL. On a desktop it is a glass card at the top right, hidden
// over the opening and shown from step 1: the step's equation so far (page/mathSteps.js), typeset by
// KaTeX with the sliders' term colours, the terms the step adds glowing for FRESH_SECONDS when the
// step is entered (a static tint under reduced motion, from mathbox.css), and one sentence on what
// changed. KaTeX loads when the story first reaches a step (ui/math.js loadKatex, a dynamic import, so
// boot stays free of it); until then, and for good if it never arrives, the TeX source shows. A
// Hide/Show button collapses it to its title, remembered per viewer (page/mathBoxModel.js).
// Task 2 adds the phone's pinned bar and sheet.
import { loadKatex } from './math.js';
import { KATEX_OPTIONS, stackEquations } from '../page/mathTrust.js';
import { FRESH_SECONDS, PROMPT, entryFor, readCollapsed, writeCollapsed } from '../page/mathBoxModel.js';
import { mathFor } from '../page/mathSteps.js';
import { stepOf } from '../stages/steps.js';

const TITLE = 'The math so far';
const CHANGED_LABEL = 'What changed: ';

function element(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	Object.assign(node, props);
	node.append(...children);
	return node;
}

function safeStorage() {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

const inert = Object.freeze({ hooks: Object.freeze({ shown: () => null, state: () => 'absent', collapsed: () => false, show() {} }) });

export function mountMathBox({ root, watchReading, reducedMotion = false, load = loadKatex, storage = safeStorage() }) {
	if (!root) return inert;
	const title = element('p', { className: 'mathbox-title', textContent: TITLE });
	const toggle = element('button', { type: 'button', className: 'mathbox-toggle' });
	toggle.setAttribute('aria-controls', 'mathbox-body');
	const head = element('div', { className: 'mathbox-head' }, [title, toggle]);
	const code = element('code');
	const eq = element('div', { className: 'tex mathbox-eq' }, [code]);
	eq.dataset.copySkip = 'math';
	const sentence = element('span', { className: 'mathbox-sentence' });
	const changed = element('p', { className: 'mathbox-changed' }, [element('span', { className: 'mathbox-label', textContent: CHANGED_LABEL }), sentence]);
	changed.setAttribute('aria-live', 'polite');
	const body = element('div', { id: 'mathbox-body', className: 'mathbox-body' }, [eq, changed]);
	root.replaceChildren(head, body);

	let katex = null;
	let loading = null;
	let state = 'waiting';
	let current = null;
	let collapsed = readCollapsed(storage);
	let freshTimer = 0;
	let reportedRender = false;

	// The equation as KaTeX's markup, or as its TeX source when KaTeX is not here (or throws).
	function render(entry) {
		if (katex) {
			try {
				const target = element('div', { className: 'tex-rendered' });
				katex.render(stackEquations(entry.tex), target, KATEX_OPTIONS);
				eq.replaceChildren(target);
				return;
			} catch (error) {
				if (!reportedRender) {
					reportedRender = true;
					console.error('[ocean] the math box could not typeset an equation; showing its TeX', error);
				}
			}
		}
		code.textContent = entry.tex;
		eq.replaceChildren(code);
	}

	function glow() {
		if (reducedMotion) return;
		root.classList.remove('is-entering');
		// Restart the animation for a step entered while the last glow is still running.
		void root.offsetWidth;
		root.classList.add('is-entering');
		clearTimeout(freshTimer);
		freshTimer = setTimeout(() => root.classList.remove('is-entering'), FRESH_SECONDS * 1000);
	}

	function ensureKatex() {
		if (loading) return loading;
		state = 'loading';
		loading = load()
			.then((module) => {
				katex = module;
				state = 'rendered';
				if (current) render(current);
			})
			.catch((error) => {
				state = 'failed';
				console.warn('[ocean] KaTeX did not load; the math box stays as TeX source', error);
			});
		return loading;
	}

	function show(entry) {
		const same = current !== null && entry !== null && current.id === entry.id;
		current = entry;
		root.hidden = entry === null;
		if (entry === null) {
			sentence.textContent = PROMPT;
			return;
		}
		if (same) return;
		render(entry);
		sentence.textContent = entry.changed;
		glow();
		ensureKatex();
	}

	function setCollapsed(next, remember = true) {
		collapsed = next;
		body.hidden = next;
		toggle.textContent = next ? 'Show' : 'Hide';
		toggle.setAttribute('aria-expanded', String(!next));
		root.classList.toggle('is-collapsed', next);
		if (remember) writeCollapsed(storage, next);
	}

	toggle.addEventListener('click', () => setCollapsed(!collapsed));
	setCollapsed(collapsed, false);
	watchReading((reading) => show(entryFor(reading)));

	return Object.freeze({
		hooks: Object.freeze({
			shown: () => current?.id ?? null,
			state: () => state,
			collapsed: () => collapsed,
			// Test hook: shows step `id`'s entry as if it were being read.
			show: (id) => show(Object.freeze({ step: stepOf(id), id, ...mathFor(id) })),
		}),
	});
}
```

Replace `content/ocean/css/mathbox.css`:
```css
/* The math box (piece C2; lane A owns this file; spec 10.3). A glass card at the top right on a
   desktop, under the site link; the phone's bar is Task 2's. No backdrop-filter (the page's rule). */
.mathbox {
	position: fixed;
	top: 56px;
	right: var(--gutter);
	z-index: 3;
	box-sizing: border-box;
	width: min(400px, 32vw);
	max-height: calc(100vh - 140px);
	max-height: calc(100svh - 140px);
	overflow-y: auto;
	padding: 12px 16px 14px;
	border-radius: 14px;
	background: var(--glass);
	border: 1px solid var(--line);
	box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
	color: var(--ink);
}

.mathbox-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.mathbox-title {
	margin: 0;
	font-size: 0.75rem;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--accent);
}

.mathbox-toggle {
	padding: 4px 12px;
	border-radius: 999px;
	border: 1px solid var(--line);
	background: transparent;
	color: var(--ink);
	font: inherit;
	font-size: 0.8rem;
	cursor: pointer;
}

.mathbox-toggle:focus-visible {
	outline: 2px solid var(--accent);
	outline-offset: 2px;
}

.mathbox-eq {
	margin: 8px 0 6px;
}

.mathbox .tex-rendered {
	font-size: 1rem;
}

.mathbox-changed {
	margin: 0;
	font-size: 0.9rem;
	line-height: 1.45;
	color: var(--ink-dim);
}

.mathbox-label {
	color: var(--ink);
	font-weight: 600;
}

/* What the step adds: a quiet tint always (and all under reduced motion), a glow on entry. */
.mathbox .fresh {
	border-radius: 4px;
	background: rgba(95, 212, 196, 0.16);
}

.mathbox.is-entering .fresh {
	animation: mathbox-fresh 1.2s ease-out;
}

@keyframes mathbox-fresh {
	0% {
		background: rgba(95, 212, 196, 0.55);
		box-shadow: 0 0 12px rgba(95, 212, 196, 0.6);
	}

	100% {
		background: rgba(95, 212, 196, 0.16);
		box-shadow: none;
	}
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/ocean/page/mathSteps.test.js tests/ocean/page/mathBoxModel.test.js && OCEAN_PORT=8781 npm run test:ocean:e2e -- tests/ocean/e2e/mathBox.spec.js`
Expected: PASS (4 browser tests). If an equation overflows the card, break it with `, \quad` between equations (`stackEquations` stacks them) rather than shrinking the font.

- [ ] **Step 7: Run the shared checks and commit**

Run: `ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -5 && OCEAN_PORT=8781 npm run test:ocean:e2e -- tests/ocean/e2e/copy.spec.js tests/ocean/e2e/math.spec.js tests/ocean/e2e/contract.spec.js`
Expected: all pass (the copy check walks the box's sentence; `bootGraph` confirms the box imports no CDN code statically).
```bash
git add content/ocean/js/page/mathSteps.js content/ocean/js/page/mathBoxModel.js content/ocean/js/ui/mathBox.js content/ocean/css/mathbox.css tests/ocean/page/mathSteps.test.js tests/ocean/page/mathBoxModel.test.js tests/ocean/e2e/mathBox.spec.js
```
```bash
git commit -m "feat: the always-on math box: each step's equation so far, what changed, and a remembered collapse"
```

### Task 2: The phone's pinned bar and sheet

**Files:**
- Modify: `content/ocean/js/ui/mathBox.js`, `content/ocean/css/mathbox.css`, `tests/ocean/e2e/mathBox.spec.js`

**Interfaces:**
- Consumes: Task 1's `mountMathBox`, `PROMPT`; `NARROW_QUERY` (page/scrollMap.js); `--mathbar-height` (style.css, 44 px), the lower half's padding that already includes it (Task 0).
- Produces: hooks `open()`, `close()`, `isOpen()`; on narrow screens the box is always shown as a bar (the prompt before step 1), opening to a sheet.

- [ ] **Step 1: Write the failing phone tests**

Append to `tests/ocean/e2e/mathBox.spec.js`:
```js
// Task 2 (spec 10.3; Review Focus 3): the phone's bar under the ocean and its sheet.
for (const width of [320, 390]) {
	test.describe(`the pinned bar at ${width} px`, () => {
		test.use({ viewport: { width, height: 760 }, hasTouch: true, isMobile: true });

		test('sits under the ocean, never covers a panel, never scrolls the page sideways', async ({ page }) => {
			await page.goto('/ocean/');
			await expect(box(page)).toBeVisible();
			await expect(page.locator('#mathbox .mathbox-sentence')).toHaveText('The math shows up here as you scroll.');
			const bar = await box(page).boundingBox();
			expect(Math.abs(bar.y - 380)).toBeLessThanOrEqual(1);
			expect(Math.round(bar.height)).toBe(44);
			expect(bar.width).toBeLessThanOrEqual(width);
			for (const id of ['sine', 'slopes', 'layers']) {
				await page.evaluate((step) => document.querySelector(`section[data-step-id="${step}"]`).scrollIntoView(), id);
				await page.waitForTimeout(200);
				const panel = await page.locator(`section[data-step-id="${id}"] .panel`).boundingBox();
				expect(panel.y, `${id}'s panel starts below the bar`).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
			}
			expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)).toBe(true);
		});

		test('opens to a sheet by tap and by Enter, closes by Escape and by its button, and gives focus back', async ({ page }) => {
			await page.goto('/ocean/');
			await scrollToId(page, 'diffuse', 0.1);
			await page.locator('#mathbox .mathbox-open').tap();
			await expect(box(page)).toHaveClass(/is-open/);
			await expect(page.locator('#mathbox .mathbox-close')).toBeFocused();
			await expect(page.locator('#mathbox .mathbox-sentence')).toBeVisible();
			const sheet = await box(page).boundingBox();
			expect(Math.abs(sheet.y + sheet.height - 760)).toBeLessThanOrEqual(1);
			await page.keyboard.press('Escape');
			await expect(box(page)).not.toHaveClass(/is-open/);
			await expect(page.locator('#mathbox .mathbox-open')).toBeFocused();
			await page.keyboard.press('Enter');
			await expect(box(page)).toHaveClass(/is-open/);
			await page.locator('#mathbox .mathbox-close').tap();
			await expect(box(page)).not.toHaveClass(/is-open/);
			expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)).toBe(true);
		});
	});
}

test.describe('reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('entering a step never pulses the new terms; they keep their quiet tint', async ({ page }) => {
		await page.goto('/ocean/');
		await page.evaluate(() => {
			window.__entered = 0;
			new MutationObserver(() => {
				if (document.getElementById('mathbox').classList.contains('is-entering')) window.__entered += 1;
			}).observe(document.getElementById('mathbox'), { attributes: true, attributeFilter: ['class'] });
		});
		await scrollToId(page, 'sine', 0.1);
		await scrollToId(page, 'moving-sine', 0.1);
		await expect(page.locator('#mathbox .mathbox-sentence')).toHaveText(mathFor('moving-sine').changed);
		expect(await page.evaluate(() => window.__entered)).toBe(0);
	});
});
```

Run: `OCEAN_PORT=8781 npm run test:ocean:e2e -- tests/ocean/e2e/mathBox.spec.js`
Expected: the new tests FAIL (no `.mathbox-open`; the box is hidden at the opening on a phone).

- [ ] **Step 2: Add the bar and the sheet**

In `content/ocean/js/ui/mathBox.js`:
- Import `{ NARROW_QUERY }` from `'../page/scrollMap.js'`.
- Add to the header: "On a narrow screen (spec 10.3: under 900 px) it is a slim bar pinned at the top of the lower half, under the ocean, always shown (the prompt before step 1), with the equation on one line; tapping it (or Enter or Space on it) opens a sheet over the lower half with the whole box; Escape or the close button closes it and gives focus back to the bar."
- After building `head` and `body`, build the bar's two buttons and add them to the root:
```js
	const open = element('button', { type: 'button', className: 'mathbox-open' });
	open.setAttribute('aria-label', 'Open the math');
	open.setAttribute('aria-expanded', 'false');
	open.setAttribute('aria-controls', 'mathbox-body');
	const close = element('button', { type: 'button', className: 'mathbox-close', textContent: 'Close' });
	head.append(close);
	root.replaceChildren(head, body, open);
	const narrow = window.matchMedia(NARROW_QUERY);
	let isOpen = false;
```
(replacing Task 1's `root.replaceChildren(head, body);`).
- In `show`, the line `root.hidden = entry === null;` becomes `root.hidden = entry === null && !narrow.matches;`, followed by `root.classList.toggle('is-empty', entry === null);`; and, for the prompt, `eq.replaceChildren();` before `sentence.textContent = PROMPT;`.
- Add, before `toggle.addEventListener`:
```js
	function setOpen(next) {
		isOpen = next && narrow.matches;
		root.classList.toggle('is-open', isOpen);
		open.setAttribute('aria-expanded', String(isOpen));
		if (isOpen) {
			body.hidden = false;
			close.focus();
		} else {
			body.hidden = collapsed && !narrow.matches;
		}
	}
	open.addEventListener('click', () => {
		setOpen(true);
	});
	close.addEventListener('click', () => {
		setOpen(false);
		open.focus();
	});
	root.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && isOpen) {
			event.preventDefault();
			setOpen(false);
			open.focus();
		}
	});
	// Crossing the breakpoint (a rotated phone, a resized window) closes the sheet and applies the
	// desktop collapse again.
	narrow.addEventListener('change', () => {
		setOpen(false);
		setCollapsed(collapsed, false);
		show(current);
	});
```
- In `setCollapsed`, `body.hidden = next;` becomes `body.hidden = next && !narrow.matches;` (the phone's bar has no collapse).
- Since `show(current)` with the same id returns early, make the breakpoint call `current = null` first: in the change listener use `const keep = current; current = null; show(keep);`.
- Add to the hooks: `open: () => setOpen(true), close: () => setOpen(false), isOpen: () => isOpen,`.

Append to `content/ocean/css/mathbox.css`:
```css
/* The bar's and the sheet's controls are a phone's only. */
.mathbox-open,
.mathbox-close {
	display: none;
}

/* Task 2: under 900 px the box is a slim bar pinned at the top of the lower half, directly under the
   ocean (whose half ends at 50svh); the lower half's padding already makes room for it (style.css
   --mathbar-height). */
@media (max-width: 899.98px) {
	.mathbox {
		top: 50vh;
		top: 50svh;
		right: 0;
		left: 0;
		width: auto;
		height: var(--mathbar-height);
		max-height: none;
		overflow: hidden;
		padding: 0 var(--gutter);
		border-radius: 0;
		border-width: 1px 0;
		display: flex;
		align-items: center;
		box-shadow: none;
	}

	.mathbox-head,
	.mathbox-changed,
	.mathbox-toggle {
		display: none;
	}

	.mathbox-body {
		flex: 1;
		min-width: 0;
	}

	/* One line, small, fading out at the right rather than wrapping. */
	.mathbox-eq {
		margin: 0;
		white-space: nowrap;
		overflow: hidden;
		-webkit-mask-image: linear-gradient(to right, #000 85%, transparent);
		mask-image: linear-gradient(to right, #000 85%, transparent);
	}

	.mathbox .tex-rendered {
		font-size: 0.8rem;
	}

	.mathbox .tex-rendered .katex-display > .katex {
		white-space: nowrap;
	}

	.mathbox-eq code {
		white-space: nowrap;
	}

	/* Before step 1 the bar shows the prompt, without its label. */
	.mathbox.is-empty .mathbox-changed {
		display: block;
		margin: 0;
	}

	.mathbox.is-empty .mathbox-label {
		display: none;
	}

	/* The whole bar is the button that opens the sheet. */
	.mathbox-open {
		display: block;
		position: absolute;
		inset: 0;
		width: 100%;
		border: 0;
		background: transparent;
		cursor: pointer;
	}

	.mathbox-open:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -3px;
	}

	/* Open: a sheet over the lower half, the whole box inside it. */
	.mathbox.is-open {
		height: auto;
		bottom: 0;
		display: block;
		overflow-y: auto;
		padding: 12px var(--gutter) 20px;
		border-width: 1px 0 0;
	}

	.mathbox.is-open .mathbox-head,
	.mathbox.is-open .mathbox-changed {
		display: flex;
	}

	.mathbox.is-open .mathbox-changed {
		display: block;
		margin-top: 8px;
	}

	.mathbox.is-open .mathbox-eq {
		white-space: normal;
		-webkit-mask-image: none;
		mask-image: none;
	}

	.mathbox.is-open .tex-rendered {
		font-size: 1rem;
	}

	.mathbox.is-open .tex-rendered .katex-display > .katex {
		white-space: normal;
	}

	.mathbox.is-open .mathbox-open {
		display: none;
	}

	.mathbox.is-open .mathbox-close {
		display: inline-block;
		padding: 4px 12px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: transparent;
		color: var(--ink);
		font: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}
}
```
The prompt before step 1 shows in the bar through the `is-empty` class `show` sets (below); the label "What changed:" is hidden then.

- [ ] **Step 3: Run the tests to verify they pass**

Run: `OCEAN_PORT=8781 npm run test:ocean:e2e -- tests/ocean/e2e/mathBox.spec.js tests/ocean/e2e/layout.spec.js tests/ocean/e2e/tilt.spec.js`
Expected: PASS. `layout.spec.js`'s phone tests and `tilt.spec.js` (whose button sits over the ocean, above the bar) still pass. If the bar covers the motion or tilt button, report the measured positions: the buttons are style.css's, not this lane's.

- [ ] **Step 4: Look at it, run the suites, commit**

Capture the phone bar for the report:
```bash
(OCEAN_PORT=8781 npm run serve:ocean >/dev/null 2>&1 &) && sleep 2 && npx playwright screenshot --viewport-size=390,844 "http://localhost:8781/ocean/#step-10" /private/tmp/c2-mathbar.png; pkill -f "http.server 8781"
```
Then:
```bash
ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -3 && OCEAN_PORT=8781 npm run test:ocean:e2e 2>&1 | tail -5
```
Expected: every unit and browser test passes in the lane's tree.
```bash
git add content/ocean/js/ui/mathBox.js content/ocean/css/mathbox.css tests/ocean/e2e/mathBox.spec.js
```
```bash
git commit -m "feat: the math box on a phone: a pinned bar under the ocean that opens to a sheet"
```

---

## Wave 1, lane B: the flat graph and the swing (worktree `Wesbite-ocean-c2-b`, branch `ocean-c2-b`, port 8782)

### Task 3: The graph: backdrop, the curve and its components, drawn from the engine's waves

**Files:**
- Create: `content/ocean/js/page/graphModel.js`, `tests/ocean/page/graphModel.test.js`, `tests/ocean/e2e/graph.spec.js`
- Modify: `content/ocean/js/render/graphStage.js`

**Interfaces:**
- Consumes: `GRAPH_PLANE_X`, `GRAPH_OFF`, `graphBand` (stages/graph.js); `WaveSampler.sample`, `STRIDE` (core/waveSampler.js); `ocean.source` (`'waves'` for the sine and the bank), `ocean.waves` (`{ packed, count, weights }`), `ocean.teachT`; `view.scene`, `view.camera`, `view.renderer`; `look.setClip(planes | null)`; the Task 0 signature `createGraphStage({ view, ocean, look, reducedMotion })` and probe shape.
- Produces: `graphModel.js` exports `CURVE_POINTS` (257), `MAX_COMPONENTS` (8), `SPAN_MARGIN`, `LINE_LIFT`, `graphSpan(camera, out)`, `sampleCurve(waves, t, span, yScale, out) -> tallest`, `sampleComponent(waves, wave, t, span, yScale, out)`, `componentWaves(waves, out) -> count`, `ribbon(points, count, halfWidth, out)`, `ribbonIndices(count)`; the graph stage's probe filled in (`shown`, `emptied`, `components`, `curve`).

- [ ] **Step 1: Make the lane's worktree**

```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git worktree add /Users/cole/Projects/Wesbite-ocean-c2-b -b ocean-c2-b c2-contract
```
```bash
ln -s /Users/cole/Projects/Wesbite-ocean/node_modules /Users/cole/Projects/Wesbite-ocean-c2-b/node_modules && cd /Users/cole/Projects/Wesbite-ocean-c2-b && git log --oneline -1 && node --test tests/ocean/stages/steps.test.js
```
Expected: the contract commit and 3 passing tests. Lane B works in `/Users/cole/Projects/Wesbite-ocean-c2-b` with `OCEAN_PORT=8782`.

- [ ] **Step 2: Write the failing model test**

Create `tests/ocean/page/graphModel.test.js`:
```js
// The flat graph's arithmetic (piece C2, lane B, Task 3; spec 10.4): the plane's span in view, the
// curve the teaching surface makes along it (the engine's own sampler), each wave alone, and ribbons.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { CURVE_POINTS, LINE_LIFT, MAX_COMPONENTS, SPAN_MARGIN, componentWaves, graphSpan, ribbon, ribbonIndices, sampleComponent, sampleCurve } from '../../../content/ocean/js/page/graphModel.js';
import { GRAPH_PLANE_X } from '../../../content/ocean/js/stages/graph.js';
import { GRAPH_SHOT } from '../../../content/ocean/js/stages/recipeKit.js';

const unit = (v) => {
	const l = Math.hypot(...v);
	return v.map((x) => x / l);
};
const forwardOf = (shot) => unit(shot.target.map((t, i) => t - shot.position[i]));
const line = (count) => WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), 0), count);

test('graphSpan: the plane in view from the graph shot, widened, and the studs a pixel covers', () => {
	const forward = forwardOf(GRAPH_SHOT);
	const span = graphSpan({ position: GRAPH_SHOT.position, forward, fovDegrees: 70, aspect: 16 / 9, heightPx: 767 });
	const along = (GRAPH_PLANE_X - GRAPH_SHOT.position[0]) / forward[0];
	const half = along * Math.tan((35 * Math.PI) / 180) * (16 / 9) * SPAN_MARGIN;
	expect.near(span.zMin, -half, 1e-9, 'left');
	expect.near(span.zMax, half, 1e-9, 'right');
	expect.near(span.depth, along, 1e-9, 'depth');
	expect.near(span.studsPerPixel, (2 * along * Math.tan((35 * Math.PI) / 180)) / 767, 1e-12, 'studs per pixel');
	expect.equal(graphSpan({ position: [10, 0, 0], forward: [-1, 0, 0], fovDegrees: 70, aspect: 1, heightPx: 100 }), null, 'looking away: no graph');
	expect.equal(graphSpan({ position: [-10, 0, 0], forward: [0, 0, -1], fovDegrees: 70, aspect: 1, heightPx: 100 }), null, 'looking along the plane: no graph');
});

test('sampleCurve is the engine sampler along the plane, drawn yScale times taller, just in front of it', () => {
	const waves = line(5);
	const span = { zMin: -60, zMax: 90 };
	const out = new Float32Array(CURVE_POINTS * 3);
	const tallest = sampleCurve(waves, 7.25, span, 4, out);
	const s = new Float64Array(7);
	let most = 0;
	for (let i = 0; i < CURVE_POINTS; i += 16) {
		const z = -60 + (150 * i) / (CURVE_POINTS - 1);
		const y = WaveSampler.sample(waves.packed, waves.count, 7.25, GRAPH_PLANE_X, z, 0, waves.weights, 0, s)[1];
		expect.near(out[i * 3 + 1], Math.fround(4 * y), 1e-5, `point ${i}`);
		expect.near(out[i * 3 + 2], Math.fround(z), 1e-4, `z ${i}`);
		expect.near(out[i * 3], Math.fround(GRAPH_PLANE_X - LINE_LIFT), 1e-7, `x ${i}`);
	}
	for (let i = 0; i < CURVE_POINTS; i++) most = Math.max(most, Math.abs(out[i * 3 + 1]) / 4);
	expect.near(tallest, most, 1e-5, 'the tallest true height');
});

test('the components add up to the curve, and only weighted waves are drawn, at most eight', () => {
	const waves = line(3);
	const span = { zMin: -40, zMax: 40 };
	const curve = new Float32Array(CURVE_POINTS * 3);
	sampleCurve(waves, 2, span, 1, curve);
	const list = new Int32Array(MAX_COMPONENTS);
	const count = componentWaves(waves, list);
	expect.equal(count, 3, 'three waves');
	const sum = new Float64Array(CURVE_POINTS);
	const one = new Float32Array(CURVE_POINTS * 3);
	for (let c = 0; c < count; c++) {
		sampleComponent(waves, list[c], 2, span, 1, one);
		for (let i = 0; i < CURVE_POINTS; i++) sum[i] += one[i * 3 + 1];
	}
	for (let i = 0; i < CURVE_POINTS; i += 8) expect.near(sum[i], curve[i * 3 + 1], 1e-5, `point ${i}`);
	expect.equal(componentWaves(WaveBanks.withCount(WaveBanks.teachingBank(), 32), list), MAX_COMPONENTS, 'capped at eight');
	expect.equal(componentWaves(WaveBanks.withCount(WaveBanks.teachingBank(), 0), list), 0, 'none summed, none drawn');
});

test('a ribbon is halfWidth either side of the line, square to it, with two triangles per segment', () => {
	const points = new Float32Array([0, 0, 0, 0, 1, 1, 0, 1, 2, 0, 0, 3]);
	const out = new Float32Array(4 * 6);
	ribbon(points, 4, 0.25, out);
	for (let i = 0; i < 4; i++) {
		const dy = out[i * 6 + 1] - out[i * 6 + 4];
		const dz = out[i * 6 + 2] - out[i * 6 + 5];
		expect.near(Math.hypot(dy, dz), 0.5, 1e-6, `width at ${i}`);
		expect.near((out[i * 6 + 1] + out[i * 6 + 4]) / 2, points[i * 3 + 1], 1e-6, `centred at ${i}`);
	}
	const indices = ribbonIndices(4);
	expect.equal(indices.length, 18, 'three segments');
	expect.truthy(Math.max(...indices) === 7, 'eight vertices');
});
```

Run: `node --test tests/ocean/page/graphModel.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Write `graphModel.js`**

```js
// The flat graph's arithmetic (piece C2; lane B owns this file; spec 10.4; browser-free): where on
// the graph's plane the camera looks, the curve the teaching surface makes along that plane (the
// engine's own WaveSampler over the waves the surface is written from, chop 0 as the teaching steps
// with a graph run), each summed wave alone for the faint component curves, and the ribbons the
// lines are drawn as (WebGL lines are one pixel wide). Nothing here allocates per call except
// ribbonIndices, which the stage calls once.
import * as WaveSampler from '../core/waveSampler.js';
import { GRAPH_PLANE_X } from '../stages/graph.js';

export const CURVE_POINTS = 257;
export const MAX_COMPONENTS = 8;
// How much wider than the frame the curve is drawn, so the swing never shows its ends.
export const SPAN_MARGIN = 1.6;
// Studs the lines sit in front of the plane (towards the camera), so they draw over the sheet's edge.
export const LINE_LIFT = 0.05;
const STRIDE = WaveSampler.STRIDE;
const SAMPLE = new Float64Array(7);

/**
 * The z range of the plane x = GRAPH_PLANE_X in view, widened by SPAN_MARGIN, its depth, and the
 * studs one pixel covers there; null when the camera does not face the plane.
 * @param {{ position: number[], forward: number[], fovDegrees: number, aspect: number, heightPx: number }} camera forward is a unit vector
 */
export function graphSpan({ position, forward, fovDegrees, aspect, heightPx }, out = { zMin: 0, zMax: 0, depth: 0, studsPerPixel: 0 }) {
	if (!(forward[0] > 0.05)) {
		return null;
	}
	const along = (GRAPH_PLANE_X - position[0]) / forward[0];
	if (!(along > 0)) {
		return null;
	}
	const tanHalf = Math.tan((fovDegrees / 2) * (Math.PI / 180));
	const centre = position[2] + forward[2] * along;
	const half = along * tanHalf * aspect * SPAN_MARGIN;
	out.zMin = centre - half;
	out.zMax = centre + half;
	out.depth = along;
	out.studsPerPixel = (2 * along * tanHalf) / Math.max(heightPx, 1);
	return out;
}

/** The surface's height along the plane, times yScale, into out (x, y, z a point); returns the tallest true |height|. */
export function sampleCurve(waves, t, span, yScale, out) {
	const step = (span.zMax - span.zMin) / (CURVE_POINTS - 1);
	let tallest = 0;
	for (let i = 0; i < CURVE_POINTS; i++) {
		const z = span.zMin + i * step;
		WaveSampler.sample(waves.packed, waves.count, t, GRAPH_PLANE_X, z, 0, waves.weights, 0, SAMPLE);
		const y = SAMPLE[1];
		if (Math.abs(y) > tallest) tallest = Math.abs(y);
		out[i * 3] = GRAPH_PLANE_X - LINE_LIFT;
		out[i * 3 + 1] = y * yScale;
		out[i * 3 + 2] = z;
	}
	return tallest;
}

/** Wave `wave` of the bank alone along the plane (the term WaveSampler adds for it), times yScale. */
export function sampleComponent(waves, wave, t, span, yScale, out) {
	const o = wave * STRIDE;
	const k = waves.packed[o];
	const omega = waves.packed[o + 1];
	const amplitude = waves.packed[o + 2] * waves.weights[wave];
	const phase = waves.packed[o + 3];
	const dx = waves.packed[o + 4];
	const dz = waves.packed[o + 5];
	const step = (span.zMax - span.zMin) / (CURVE_POINTS - 1);
	for (let i = 0; i < CURVE_POINTS; i++) {
		const z = span.zMin + i * step;
		out[i * 3] = GRAPH_PLANE_X - LINE_LIFT;
		out[i * 3 + 1] = amplitude * Math.sin(k * (dx * GRAPH_PLANE_X + dz * z) - omega * t + phase) * yScale;
		out[i * 3 + 2] = z;
	}
}

/** The summed waves with height, in bank order, at most MAX_COMPONENTS, into out; returns how many. */
export function componentWaves(waves, out) {
	let count = 0;
	for (let wave = 0; wave < waves.count && count < MAX_COMPONENTS; wave++) {
		if (waves.weights[wave] > 0 && waves.packed[wave * STRIDE + 2] !== 0) {
			out[count] = wave;
			count += 1;
		}
	}
	return count;
}

/** A ribbon halfWidth studs either side of a polyline in a plane of constant x: two vertices a point. */
export function ribbon(points, count, halfWidth, out) {
	for (let i = 0; i < count; i++) {
		const a = i === 0 ? 0 : i - 1;
		const b = i === count - 1 ? i : i + 1;
		const ty = points[b * 3 + 1] - points[a * 3 + 1];
		const tz = points[b * 3 + 2] - points[a * 3 + 2];
		const length = Math.hypot(ty, tz) || 1;
		const ny = tz / length;
		const nz = -ty / length;
		const x = points[i * 3];
		const y = points[i * 3 + 1];
		const z = points[i * 3 + 2];
		out[i * 6] = x;
		out[i * 6 + 1] = y + ny * halfWidth;
		out[i * 6 + 2] = z + nz * halfWidth;
		out[i * 6 + 3] = x;
		out[i * 6 + 4] = y - ny * halfWidth;
		out[i * 6 + 5] = z - nz * halfWidth;
	}
}

/** Two triangles per segment of a `count`-point ribbon. */
export function ribbonIndices(count) {
	const indices = new Uint16Array((count - 1) * 6);
	for (let i = 0; i < count - 1; i++) {
		const a = i * 2;
		indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
	}
	return indices;
}
```

Run: `node --test tests/ocean/page/graphModel.test.js`
Expected: PASS (4 tests).

- [ ] **Step 4: Write the failing browser test**

Create `tests/ocean/e2e/graph.spec.js`:
```js
// The flat graph in the browser (piece C2, lane B; spec 10.4): a dark frame with the bright curve on
// it, the curve's true height, the components in step 3, the sheet under the curve in step 4 and no
// graph from step 5 on.
import { test, expect } from '@playwright/test';
import { load, stage, grid, mean, watchErrors, waitFrames } from './helpers/stage.js';

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

// The brightest pixel of a 256-wide copy of the canvas (a thin line survives this, not a 64-wide grid).
async function brightest(page) {
	return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const copy = document.createElement('canvas');
		copy.width = 256;
		copy.height = 144;
		const context = copy.getContext('2d');
		context.drawImage(source, 0, 0, copy.width, copy.height);
		const data = context.getImageData(0, 0, copy.width, copy.height).data;
		let most = 0;
		for (let i = 0; i < data.length; i += 4) most = Math.max(most, 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
		resolve(most);
	})));
}

test('step 1: a dark graph with the sine drawn on it, true height 2.5 studs, the sea emptied', async ({ page }) => {
	await load(page, 'step=sine&freeze=12', 10);
	const graph = await stage(page, 'graph');
	expect(graph.shown).toBe(1);
	expect(graph.emptied).toBe(true);
	expect(graph.band).toEqual([-0.5, 0.5]);
	expect(graph.curve.points).toBe(257);
	expect(graph.curve.maxAbsY).toBeGreaterThan(2.45);
	expect(graph.curve.maxAbsY).toBeLessThan(2.55);
	expect(graph.yScale).toBe(4);
	expect(mean(await grid(page))).toBeLessThan(45);
	expect(await brightest(page)).toBeGreaterThan(110);
});

test('step 2: the curve slides', async ({ page }) => {
	await load(page, 'step=moving-sine', 10);
	const before = (await stage(page, 'graph')).curve.first[1];
	await waitFrames(page, 20);
	const after = (await stage(page, 'graph')).curve.first[1];
	expect(Math.abs(after - before)).toBeGreaterThan(0.05);
});

test('step 3: one faint curve per summed wave under the bold sum', async ({ page }) => {
	await load(page, 'step=sum-of-sines&freeze=12', 10);
	expect((await stage(page, 'graph')).components).toBe(3);
	await stage(page, 'setSlider', 'waveCount', 6);
	await waitFrames(page, 4);
	expect((await stage(page, 'graph')).components).toBe(6);
});

test('step 4: no backdrop, the sheet unrolled behind the curve, the curve on its edge', async ({ page }) => {
	await load(page, 'step=into-3d&freeze=12', 10);
	const graph = await stage(page, 'graph');
	expect(graph.shown).toBe(0);
	expect(graph.emptied).toBe(false);
	expect(graph.band[0]).toBe(-0.5);
	expect(graph.band[1]).toBe(400);
	expect(graph.curve).not.toBe(null);
	expect(mean(await grid(page))).toBeGreaterThan(80);
});

test('step 5 on: no graph, no clip', async ({ page }) => {
	await load(page, 'step=directions&freeze=12', 10);
	const graph = await stage(page, 'graph');
	expect(graph.band).toBe(null);
	expect(graph.curve).toBe(null);
	expect((await stage(page, 'look')).clipped).toBe(false);
});
```

Run: `OCEAN_PORT=8782 npm run test:ocean:e2e -- tests/ocean/e2e/graph.spec.js`
Expected: FAIL (the Task 0 stage draws nothing: `curve` is null, the frame is the sky).

- [ ] **Step 5: Write the graph stage**

Replace `content/ocean/js/render/graphStage.js`:
```js
// The flat graph of steps 1 to 4, 14 and 15 (piece C2; lane B owns this file; spec 10.4): a dark
// backdrop over the sky and the world, and the curve the teaching surface makes along the plane the
// camera faces, drawn in the main canvas so the swing into step 4 is a camera move, not a cut. The
// curve is the engine's own (page/graphModel.js samples WaveSampler over ocean.waves, the bank or
// sine the surface is written from), every frame, drawn GRAPH_Y_SCALE times taller while the graph
// shows and at true scale on the sheet's edge by the end of step 4. Step 3 adds each summed wave as a
// faint curve under the bold sum.
// The stage look clips the surface to the graph's band (stages/graph.js graphBand); while the
// backdrop is opaque the band is emptied, so no sliver of sea shows edge-on under the taller curve.
// The backdrop fades on the play clock (FADE_SECONDS) so the step from the hero sea into the graph
// is not a pop; under reduced motion, or while the clock is stopped, it goes straight to its target.
// The band never eases: the lens clearance depends on it. Nothing allocates per frame.
import * as THREE from 'three';
import { CURVE_POINTS, MAX_COMPONENTS, componentWaves, graphSpan, ribbon, ribbonIndices, sampleComponent, sampleCurve } from '../page/graphModel.js';
import { GRAPH_OFF, graphBand } from '../stages/graph.js';

const BACKDROP_DISTANCE = 3000; // studs: inside the far plane, in front of the sky box
const BACKDROP_COLOUR = new THREE.Color().setRGB(0x0b / 255, 0x1a / 255, 0x24 / 255, THREE.SRGBColorSpace); // style.css --body-bg
const CURVE_COLOUR = new THREE.Color().setRGB(0x5f / 255, 0xd4 / 255, 0xc4 / 255, THREE.SRGBColorSpace); // --accent
const COMPONENT_COLOUR = new THREE.Color().setRGB(0xa9 / 255, 0xbc / 255, 0xc8 / 255, THREE.SRGBColorSpace); // --ink-dim
const COMPONENT_OPACITY = 0.5;
const BOLD_PX = 3;
const FAINT_PX = 1.5;
export const FADE_SECONDS = 0.35;
const OPAQUE = 0.999;

function ribbonMesh(colour, opacity, order) {
	const positions = new Float32Array(CURVE_POINTS * 6);
	const attribute = new THREE.BufferAttribute(positions, 3);
	attribute.setUsage(THREE.DynamicDrawUsage);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', attribute);
	geometry.setIndex(new THREE.BufferAttribute(ribbonIndices(CURVE_POINTS), 1));
	const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthTest: false, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.renderOrder = order;
	mesh.frustumCulled = false;
	mesh.visible = false;
	return { mesh, attribute, positions, points: new Float32Array(CURVE_POINTS * 3) };
}

export function createGraphStage({ view, ocean, look, reducedMotion = false }) {
	const camera = view.camera;
	const group = new THREE.Group();
	group.visible = false;
	view.scene.add(group);
	const backdrop = new THREE.Mesh(
		new THREE.PlaneGeometry(1, 1),
		new THREE.MeshBasicMaterial({ color: BACKDROP_COLOUR, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false }),
	);
	backdrop.frustumCulled = false;
	backdrop.renderOrder = -1;
	group.add(backdrop);
	const curve = ribbonMesh(CURVE_COLOUR, 1, 12);
	group.add(curve.mesh);
	const components = Array.from({ length: MAX_COMPONENTS }, () => {
		const r = ribbonMesh(COMPONENT_COLOUR, COMPONENT_OPACITY, 11);
		group.add(r.mesh);
		return r;
	});
	// Points whose signed distance n.p + c is negative are clipped: keep x >= xMin and x <= xMax.
	const minPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
	const maxPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
	const planes = [minPlane, maxPlane];
	const forward = new THREE.Vector3();
	const forwardArray = [0, 0, 0];
	const positionArray = [0, 0, 0];
	const spanInput = { position: positionArray, forward: forwardArray, fovDegrees: 70, aspect: 1, heightPx: 1 };
	const span = { zMin: 0, zMax: 0, depth: 0, studsPerPixel: 0 };
	const chosen = new Int32Array(MAX_COMPONENTS);
	let current = GRAPH_OFF;
	let band = null;
	let shown = 0;
	let lastT = null;
	let hasSpan = false;
	let drawing = false;
	let drawn = 0;
	let tallest = 0;

	function clip() {
		if (band === null) {
			look.setClip(null);
			return;
		}
		if (shown >= OPAQUE) {
			// Keep x >= far + 1 and x <= far: nothing.
			minPlane.constant = -(band[1] + 1);
		} else {
			minPlane.constant = -band[0];
		}
		maxPlane.constant = band[1];
		look.setClip(planes);
	}

	function apply(graph) {
		current = graph;
		band = graphBand(graph);
		clip();
	}

	// The backdrop's opacity follows the recipe's on the play clock.
	function ease(t) {
		const target = current.opacity;
		const dt = lastT === null ? 0 : t - lastT;
		lastT = t;
		if (reducedMotion || !(dt > 0)) {
			shown = target;
			return;
		}
		shown = target + (shown - target) * Math.exp(-dt / FADE_SECONDS);
		if (Math.abs(shown - target) < 1e-3) shown = target;
	}

	// A plane square to the view, far behind everything the graph shows, filling the frame.
	function placeBackdrop() {
		backdrop.position.copy(camera.position).addScaledVector(forward, BACKDROP_DISTANCE);
		backdrop.quaternion.copy(camera.quaternion);
		const height = 2 * BACKDROP_DISTANCE * Math.tan((camera.fov / 2) * (Math.PI / 180)) * 1.2;
		backdrop.scale.set(height * camera.aspect, height, 1);
	}

	function drawLine(target, halfWidth) {
		ribbon(target.points, CURVE_POINTS, halfWidth, target.positions);
		target.attribute.needsUpdate = true;
	}

	function frame(t) {
		ease(t);
		clip();
		const on = band !== null || shown > 0;
		group.visible = on;
		drawing = false;
		drawn = 0;
		if (!on) {
			return;
		}
		camera.getWorldDirection(forward);
		backdrop.visible = shown > 0;
		backdrop.material.opacity = shown;
		placeBackdrop();
		forwardArray[0] = forward.x;
		forwardArray[1] = forward.y;
		forwardArray[2] = forward.z;
		positionArray[0] = camera.position.x;
		positionArray[1] = camera.position.y;
		positionArray[2] = camera.position.z;
		spanInput.fovDegrees = camera.fov;
		spanInput.aspect = camera.aspect;
		spanInput.heightPx = view.renderer.domElement.clientHeight || 1;
		if (graphSpan(spanInput, span) !== null) hasSpan = true;
		const waves = ocean.source === 'waves' ? ocean.waves : null;
		drawing = band !== null && waves !== null && hasSpan;
		curve.mesh.visible = drawing;
		if (drawing) {
			tallest = sampleCurve(waves, t, span, current.yScale, curve.points);
			drawLine(curve, (BOLD_PX * span.studsPerPixel) / 2);
			if (current.components) drawn = componentWaves(waves, chosen);
		}
		for (let c = 0; c < MAX_COMPONENTS; c++) {
			const on = c < drawn;
			components[c].mesh.visible = on;
			if (on) {
				sampleComponent(waves, chosen[c], t, span, current.yScale, components[c].points);
				drawLine(components[c], (FAINT_PX * span.studsPerPixel) / 2);
			}
		}
	}

	function probe() {
		const p = curve.points;
		const last = (CURVE_POINTS - 1) * 3;
		return {
			opacity: current.opacity,
			shown,
			yScale: current.yScale,
			band: band === null ? null : [band[0], band[1]],
			emptied: band !== null && shown >= OPAQUE,
			components: drawn,
			curve: drawing ? { points: CURVE_POINTS, maxAbsY: tallest, first: [p[0], p[1], p[2]], last: [p[last], p[last + 1], p[last + 2]] } : null,
		};
	}

	return { apply, frame, probe };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/ocean/page/graphModel.test.js && OCEAN_PORT=8782 npm run test:ocean:e2e -- tests/ocean/e2e/graph.spec.js tests/ocean/e2e/contract.spec.js`
Expected: PASS. If the dark-frame check fails, report the measured mean (the backdrop colour is the page's own background, about 22 of 255 in luminance).

- [ ] **Step 7: Commit**

```bash
git add content/ocean/js/page/graphModel.js content/ocean/js/render/graphStage.js tests/ocean/page/graphModel.test.js tests/ocean/e2e/graph.spec.js
```
```bash
git commit -m "feat: the flat graph: a dark backdrop and the teaching surface's own curve, with its waves drawn faint beneath"
```

### Task 4: Axes and labels, the hero-to-dark fade, the swing, and chapter one's shots

**Files:**
- Create: `content/ocean/js/render/graphLabels.js`
- Modify: `content/ocean/js/render/graphStage.js`, `content/ocean/js/stages/chapters/waves.js`, `content/ocean/js/stages/chapters/betterWaves.js`, `tests/ocean/e2e/graph.spec.js`, `tests/ocean/page/graphModel.test.js`

**Interfaces:**
- Consumes: Task 3's stage and model; `ocean.stageSettings.source` (`'sine'` for steps 1 and 2); the story hooks `cameraTrail`, `watchCamera`, `clock`, `graph`, `orbitEnabled`, `look`, `pictures`, `watchPictures`; `scrollToId`, `scrollToOpening`, `oceanRunning` (helpers/story.js).
- Produces: `graphLabels.js` exports `createAxes()`, `createLabel(text)`, `niceStep(range, targetCount)`, `axisTicks(min, max, step)`; the graph probe gains `axes` (boolean), `labels` (string array of the label texts shown) and `markers` (`null` or `{ wavelength, amplitude }`, step 1's live values).

- [ ] **Step 1: Write the failing tests**

Append to `tests/ocean/page/graphModel.test.js` (the tick arithmetic lives in the model so Node can test it; `graphLabels.js` re-exports it):
```js
test('axis ticks: a round step for the range, ticks on its multiples, inside the range', () => {
	expect.equal(niceStep(150, 8), 20, '150 studs in about eight ticks');
	expect.equal(niceStep(9, 6), 2, 'nine studs');
	expect.equal(niceStep(0.9, 4), 0.2, 'under a stud');
	expect.equal(axisTicks(-31, 47, 20).join(','), '-20,0,20,40', 'multiples inside');
	expect.equal(axisTicks(0, 0.5, 0.2).map((v) => v.toFixed(1)).join(','), '0.0,0.2,0.4', 'no float noise');
});
```
and add `axisTicks, niceStep` to that file's import from `graphModel.js`.

Append to `tests/ocean/e2e/graph.spec.js`:
```js
import { oceanRunning, scrollToId, scrollToOpening } from './helpers/story.js';
import { story } from './helpers/stage.js';

test('step 1 labels its axes and marks the live height and length', async ({ page }) => {
	await load(page, 'step=sine&freeze=12', 10);
	const graph = await stage(page, 'graph');
	expect(graph.axes).toBe(true);
	expect(graph.labels).toContain('height (studs, drawn ×4)');
	expect(graph.labels).toContain('distance (studs)');
	expect(graph.markers).toEqual({ wavelength: 40, amplitude: 2.5 });
	await stage(page, 'setSlider', 'wavelength', 60);
	await waitFrames(page, 4);
	expect((await stage(page, 'graph')).markers.wavelength).toBe(60);
	expect((await stage(page, 'graph')).labels).toContain('λ = 60 studs');
});

test('the hero fades to the dark graph, and back', async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	expect((await story(page, 'graph')).shown).toBe(0);
	await scrollToId(page, 'sine', 0.1);
	const samples = [];
	for (let i = 0; i < 40; i++) samples.push((await story(page, 'graph')).shown);
	expect(samples.some((s) => s > 0.02 && s < 0.98), `a fade, not a pop: ${samples.map((s) => s.toFixed(2)).join(' ')}`).toBe(true);
	await page.waitForFunction(() => window.__ocean.story.graph().shown === 1, null, { timeout: 10_000 });
	await scrollToOpening(page);
	await page.waitForFunction(() => window.__ocean.story.graph().shown === 0, null, { timeout: 10_000 });
});

test('the swing into step 4 is one smooth camera move while the backdrop fades and the sheet unrolls', async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'sum-of-sines', 0.4);
	await waitFrames(page, 20);
	await story(page, 'watchCamera', 400);
	for (let p = 0.5; p <= 1.0001; p += 0.05) {
		await scrollToId(page, 'sum-of-sines', Math.min(p, 0.999));
		await waitFrames(page, 6);
	}
	await scrollToId(page, 'into-3d', 0.1);
	await waitFrames(page, 30);
	const trail = await story(page, 'cameraTrail');
	let worst = 0;
	for (let i = 1; i < trail.length; i++) {
		const d = Math.hypot(...trail[i].position.map((v, k) => v - trail[i - 1].position[k]));
		worst = Math.max(worst, d);
	}
	expect(worst, 'studs in one frame').toBeLessThan(6);
	const graph = await story(page, 'graph');
	expect(graph.shown).toBe(0);
	expect(graph.band[1]).toBeGreaterThan(300);
});

// Review Focus 1.
test("a fling across the graph's boundary lands clean", async ({ page }) => {
	test.setTimeout(240_000);
	await oceanRunning(page);
	await scrollToId(page, 'moving-sine', 0.2);
	await waitFrames(page, 10);
	await page.keyboard.press('End');
	await page.waitForFunction(() => window.__page.reading().step === window.__ocean.story.state().step && window.__ocean.story.graph().band === null, null, { timeout: 30_000 });
	expect((await story(page, 'look')).clipped).toBe(false);
	expect(await story(page, 'orbitEnabled')).toBe(true);
	await page.keyboard.press('Home');
	await scrollToOpening(page);
	await scrollToId(page, 'moving-sine', 0.2);
	await page.waitForFunction(() => window.__ocean.story.graph().emptied === true, null, { timeout: 30_000 });
	await story(page, 'watchCamera', 120);
	await story(page, 'watchPictures', 120);
	await scrollToId(page, 'jonswap', 0.2);
	await waitFrames(page, 60);
	const graph = await story(page, 'graph');
	expect(graph.band).toBe(null);
	expect((await story(page, 'look')).clipped).toBe(false);
	const trail = await story(page, 'cameraTrail');
	expect(trail.filter((t) => t.step >= 16).every((t) => t.position[1] > 14), 'the lens stays above the crests').toBe(true);
	const pictures = await story(page, 'pictures');
	expect(pictures.filter((p) => p.key >= 16 && !p.held).every((p) => p.maxAbsY > 0), 'no flat sea shown').toBe(true);
});

test.describe('reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('the swing is a cut and the backdrop does not fade', async ({ page }) => {
		test.setTimeout(180_000);
		await oceanRunning(page);
		await scrollToId(page, 'sum-of-sines', 0.3);
		await waitFrames(page, 5);
		expect((await story(page, 'graph')).shown).toBe(1);
		await story(page, 'watchCamera', 200);
		await scrollToId(page, 'sum-of-sines', 0.8);
		await waitFrames(page, 5);
		await scrollToId(page, 'into-3d', 0.3);
		await waitFrames(page, 10);
		const { recipeFor } = await import('../../../content/ocean/js/stages/recipes.js');
		const { stepOf } = await import('../../../content/ocean/js/stages/steps.js');
		const shots = [recipeFor(stepOf('sum-of-sines')).shot.position, recipeFor(stepOf('into-3d')).shot.position];
		for (const entry of await story(page, 'cameraTrail')) {
			expect(shots.some((s) => Math.hypot(...s.map((v, k) => v - entry.position[k])) < 0.01), `${entry.position} is one of the two shots`).toBe(true);
		}
		expect((await story(page, 'graph')).shown).toBe(0);
	});
});
```
(The two `import` lines go at the top of the file with the others; `story` joins the existing import from `./helpers/stage.js`.)

Run: `node --test tests/ocean/page/graphModel.test.js && OCEAN_PORT=8782 npm run test:ocean:e2e -- tests/ocean/e2e/graph.spec.js`
Expected: FAIL: `niceStep` not exported; `graph.axes` undefined. The fade, swing, fling and reduced-motion tests may already pass on Task 3's stage: that is fine, they guard what this task tunes.

- [ ] **Step 2: Ticks in the model, labels and axes in the renderer**

Add to `content/ocean/js/page/graphModel.js`:
```js
// A round tick step (1, 2 or 5 times a power of ten) giving about `targetCount` ticks over `range`.
export function niceStep(range, targetCount) {
	const raw = range / Math.max(targetCount, 1);
	const power = 10 ** Math.floor(Math.log10(raw));
	const scaled = raw / power;
	const nice = scaled < 1.5 ? 1 : scaled < 3.5 ? 2 : scaled < 7.5 ? 5 : 10;
	return Number((nice * power).toPrecision(6));
}

// The multiples of `step` inside [min, max], free of float noise.
export function axisTicks(min, max, step) {
	const ticks = [];
	for (let n = Math.ceil(min / step); n * step <= max + 1e-9; n++) ticks.push(Number((n * step).toPrecision(6)));
	return ticks;
}
```

Create `content/ocean/js/render/graphLabels.js`:
```js
// The flat graph's axes and words (piece C2; lane B owns this file; spec 10.4): line segments for the
// two axes and their ticks, and text as camera-facing sprites drawn into small canvases, each redrawn
// only when its text changes, sized in pixels whatever the camera's distance. The numbers on them are
// live (the ticks of the span in view, the sine's own height and length), never copy.
import * as THREE from 'three';

export { axisTicks, niceStep } from '../page/graphModel.js';

const INK = '#e8eef2'; // style.css --ink
const DIM = '#a9bcc8'; // --ink-dim
const FONT_PX = 13;
const SCALE = 2; // canvas pixels per CSS pixel, for crisp text
export const MAX_SEGMENTS = 96;

export function createAxes() {
	const positions = new Float32Array(MAX_SEGMENTS * 2 * 3);
	const attribute = new THREE.BufferAttribute(positions, 3);
	attribute.setUsage(THREE.DynamicDrawUsage);
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', attribute);
	geometry.setDrawRange(0, 0);
	const material = new THREE.LineBasicMaterial({ color: new THREE.Color().setStyle(DIM, THREE.SRGBColorSpace), transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
	const lines = new THREE.LineSegments(geometry, material);
	lines.renderOrder = 10;
	lines.frustumCulled = false;
	let count = 0;
	return {
		lines,
		begin() {
			count = 0;
		},
		segment(x0, y0, z0, x1, y1, z1) {
			if (count >= MAX_SEGMENTS) return;
			positions.set([x0, y0, z0, x1, y1, z1], count * 6);
			count += 1;
		},
		end(opacity) {
			geometry.setDrawRange(0, count * 2);
			attribute.needsUpdate = true;
			material.opacity = 0.8 * opacity;
		},
	};
}

export function createLabel({ colour = INK } = {}) {
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
	const sprite = new THREE.Sprite(material);
	sprite.renderOrder = 13;
	sprite.frustumCulled = false;
	sprite.visible = false;
	let text = null;
	let widthPx = 1;
	const heightPx = FONT_PX + 6;
	return {
		sprite,
		text: () => text,
		// Redraws only for new text. `anchor` is 'left', 'centre' or 'right' of the point.
		set(next) {
			if (next === text) return;
			text = next;
			context.font = `${FONT_PX * SCALE}px system-ui, sans-serif`;
			widthPx = Math.ceil(context.measureText(next).width / SCALE) + 8;
			canvas.width = widthPx * SCALE;
			canvas.height = heightPx * SCALE;
			context.font = `${FONT_PX * SCALE}px system-ui, sans-serif`;
			context.fillStyle = colour;
			context.textBaseline = 'middle';
			context.fillText(next, 4 * SCALE, (heightPx / 2) * SCALE);
			texture.needsUpdate = true;
		},
		place(x, y, z, studsPerPixel, opacity, anchor = 'centre') {
			sprite.visible = opacity > 0 && text !== null;
			sprite.scale.set(widthPx * studsPerPixel, heightPx * studsPerPixel, 1);
			sprite.center.set(anchor === 'left' ? 0 : anchor === 'right' ? 1 : 0.5, 0.5);
			sprite.position.set(x, y, z);
			material.opacity = opacity;
		},
		hide() {
			sprite.visible = false;
		},
	};
}
```

- [ ] **Step 3: Draw the axes, labels and step 1's markers**

In `content/ocean/js/render/graphStage.js`:
- Import `{ axisTicks, createAxes, createLabel, niceStep }` from `'./graphLabels.js'` and `{ GRAPH_PLANE_X }` from `'../stages/graph.js'`, and `LINE_LIFT` from the model.
- After the components, create `const axes = createAxes(); group.add(axes.lines);`, `const words = { distance: createLabel(), height: createLabel(), lambda: createLabel(), amplitude: createLabel() };`, `const ticks = Array.from({ length: 12 }, () => createLabel({ colour: '#a9bcc8' }));`, and add every label's sprite to `group`. Keep `let markers = null; const shownLabels = [];`.
- Add this function and call it at the end of `frame` when `drawing` (with `axisOpacity = shown`), else hide every label and call `axes.begin(); axes.end(0);`:
```js
	// The axes, their ticks and words, faded with the backdrop: they belong to the flat picture and
	// go as the swing turns it into a surface. Step 1 and 2 (the sine) also mark the live height and
	// length on the curve.
	function decorate(t, opacity) {
		const x = GRAPH_PLANE_X - LINE_LIFT;
		const spp = span.studsPerPixel;
		const width = span.zMax - span.zMin;
		const left = span.zMin + width * (0.5 - 0.5 / 1.6) + 24 * spp;
		const right = span.zMax - width * (0.5 - 0.5 / 1.6) - 24 * spp;
		const heightTop = Math.max(tallest, 0.5) * current.yScale * 1.25;
		axes.begin();
		axes.segment(x, 0, left, x, 0, right);
		axes.segment(x, -heightTop, left, x, heightTop, left);
		const zStep = niceStep(right - left, 8);
		const zTicks = axisTicks(left, right, zStep);
		const yStep = niceStep(heightTop / current.yScale, 3);
		const yTicks = axisTicks(-heightTop / current.yScale, heightTop / current.yScale, yStep);
		shownLabels.length = 0;
		let label = 0;
		for (const z of zTicks) {
			axes.segment(x, -5 * spp, z, x, 5 * spp, z);
			if (label < ticks.length) {
				ticks[label].set(String(z));
				ticks[label].place(x, -14 * spp, z, spp, opacity);
				label += 1;
			}
		}
		for (const y of yTicks) {
			if (y === 0) continue;
			axes.segment(x, y * current.yScale, left - 5 * spp, x, y * current.yScale, left + 5 * spp);
			if (label < ticks.length) {
				ticks[label].set(y > 0 ? `+${y}` : `${y}`.replace('-', '−'));
				ticks[label].place(x, y * current.yScale, left - 8 * spp, spp, opacity, 'right');
				label += 1;
			}
		}
		for (let i = label; i < ticks.length; i++) ticks[i].hide();
		const scale = Math.round(current.yScale * 10) / 10;
		words.height.set(scale === 1 ? 'height (studs)' : `height (studs, drawn ×${scale})`);
		words.height.place(x, heightTop + 12 * spp, left, spp, opacity, 'left');
		words.distance.set('distance (studs)');
		words.distance.place(x, 16 * spp, right, spp, opacity, 'right');
		shownLabels.push(words.height.text(), words.distance.text());
		markers = null;
		const sine = ocean.stageSettings?.source === 'sine' ? ocean.waves : null;
		if (sine && sine.packed[2] > 0) {
			markSine(sine, t, x, spp, opacity, left, right);
		} else {
			words.lambda.hide();
			words.amplitude.hide();
		}
		axes.end(opacity);
	}

	// The sine's crest-to-crest length between two crests in view, and its height at the first.
	function markSine(sine, t, x, spp, opacity, left, right) {
		const k = sine.packed[0];
		const omega = sine.packed[1];
		const amplitude = sine.packed[2];
		const phase = sine.packed[3];
		const wavelength = (2 * Math.PI) / k;
		// Crests where k z - omega t + phase = pi/2 + 2 pi m.
		// Crests sit at z = (pi/2 + 2 pi m + omega t - phase) / k; the first at or right of a quarter
		// wavelength in from the left edge has the smallest m with z >= left + lambda / 4.
		const m = Math.ceil((k * (left + wavelength * 0.25) - Math.PI / 2 - omega * t + phase) / (2 * Math.PI));
		const first = (Math.PI / 2 + 2 * Math.PI * m + omega * t - phase) / k;
		const second = first + wavelength;
		const top = amplitude * current.yScale;
		const lift = top + 10 * spp;
		if (second < right) {
			axes.segment(x, lift, first, x, lift, second);
			axes.segment(x, lift - 4 * spp, first, x, lift + 4 * spp, first);
			axes.segment(x, lift - 4 * spp, second, x, lift + 4 * spp, second);
			words.lambda.set(`λ = ${Number(wavelength.toFixed(1))} studs`);
			words.lambda.place(x, lift + 12 * spp, (first + second) / 2, spp, opacity);
		} else {
			words.lambda.hide();
		}
		axes.segment(x, 0, first, x, top, first);
		words.amplitude.set(`A = ${Number(amplitude.toFixed(2))} studs`);
		words.amplitude.place(x, top / 2, first + 6 * spp, spp, opacity, 'left');
		markers = { wavelength: Number(wavelength.toFixed(1)), amplitude: Number(amplitude.toFixed(2)) };
		shownLabels.push(words.lambda.text(), words.amplitude.text());
	}
```
- In `probe`, add `axes: drawing && shown > 0,`, `labels: drawing && shown > 0 ? [...shownLabels] : [],`, `markers,`.
- `ocean.stageSettings` is the EngineSettings the stage last configured (engine/stageControl.js), so `source === 'sine'` is steps 1 and 2 (and a blend's first half into step 3).

- [ ] **Step 4: Tune chapter one's and chapter three's shots, then run every shot check**

Look at the swing in motion before changing numbers:
```bash
(OCEAN_PORT=8782 npm run serve:ocean >/dev/null 2>&1 &) && sleep 2 && for p in 0 0.6 0.75 0.9; do OCEAN_PORT=8782 node scripts/ocean-stage-capture.mjs /private/tmp/c2-swing $p '' sum-of-sines; done; OCEAN_PORT=8782 node scripts/ocean-stage-capture.mjs /private/tmp/c2-swing 0 '' sine,into-3d,directions,many-waves; OCEAN_PORT=8782 node scripts/ocean-stage-capture.mjs /private/tmp/c2-swing 0 'tier=Medium' sine,into-3d; pkill -f "http.server 8782"
```
Open the PNGs and judge, writing what you see in the report before changing anything (Cole rejects stills-tuned looks; these captures are for catching gross faults):
- step 1 at 16:9 and at the phone's top half shows at least one and a half wavelengths and the curve fills about half the graph's height. If not, tune it inside `waves.js` only (the sine's default wavelength, or the graph steps' height scale by overriding `GRAPH_FLAT` there: `graph: { ...GRAPH_FLAT, yScale: 5 }`); `GRAPH_SHOT` lives in `recipeKit.js`, which is the contract's, so a needed change to it is reported, not made.
- step 4 shows the sheet running away from the curve, the curve on its near edge, the camera on the dry side. Adjust `into-3d`'s `shot` and `far` in `waves.js` until it reads.
- steps 5 and 6 read as a surface with crests across the view.
Then run the checks that guard every shot:
```bash
node --test tests/ocean/stages/clearance.test.js tests/ocean/stages/shots.test.js tests/ocean/page/orbitLimits.test.js tests/ocean/stages/recipes.test.js tests/ocean/stages/crests.test.js
```
Expected: PASS. A failure names the frame: move that shot (higher, or further onto the dry side for a graph step) and rerun; never edit the checks.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/ocean/page/graphModel.test.js && OCEAN_PORT=8782 npm run test:ocean:e2e -- tests/ocean/e2e/graph.spec.js tests/ocean/e2e/contract.spec.js tests/ocean/e2e/stageSteps.spec.js`
Expected: PASS. If the swing's worst frame step is over 6 studs at the GPU's frame rate, report the measured value and the frame (it may be the shot's distance, not the stage).

- [ ] **Step 6: Run the suites and commit**

```bash
ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -3 && OCEAN_PORT=8782 npm run test:ocean:e2e 2>&1 | tail -5
```
Expected: all pass.
```bash
git add content/ocean/js/page/graphModel.js content/ocean/js/render/graphLabels.js content/ocean/js/render/graphStage.js content/ocean/js/stages/chapters/waves.js content/ocean/js/stages/chapters/betterWaves.js tests/ocean/page/graphModel.test.js tests/ocean/e2e/graph.spec.js
```
```bash
git commit -m "feat: the graph's axes, live height and length, the fade from the hero sea, and the swing into a surface"
```


---

## Wave 1, lane C: arrows on the surface (worktree `Wesbite-ocean-c2-c`, branch `ocean-c2-c`, port 8783)

### Task 5: Each wave's heading, and the surface's normals with the tangent and binormal

**Files:**
- Create: `content/ocean/js/page/overlayModel.js`, `tests/ocean/page/overlayModel.test.js`, `tests/ocean/e2e/overlays.spec.js`
- Modify: `content/ocean/js/render/surfaceOverlays.js`

**Interfaces:**
- Consumes: `WaveSampler.sample`, `STRIDE`; `ocean.source`, `ocean.waves`; the Task 0 signature `createSurfaceOverlays({ view, ocean }) -> { apply(overlay), frame(t, focus), probe() }` (`overlay = { kind, spacing }`, `focus = [x, z]`); `view.scene`.
- Produces: `overlayModel.js` exports `ARROW_STRIDE` (7: base x, y, z, tip x, y, z, colour), `GRID` (7), `GRID_SPACING` (4), `MAX_DIRECTIONS` (8), `MAX_ARROWS`, `COLOURS` (`NORMAL` 0, `TANGENT` 1, `BINORMAL` 2, `DIFFERENCE` 3, `WAVE` 4 and up), `NORMAL_LENGTH`, `directionArrows(waves, t, focus, out) -> count`, `normalArrows(waves, t, focus, out) -> count`; the overlay probe gains `first` (arrow 0 as six numbers, or null).

- [ ] **Step 1: Make the lane's worktree**

```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git worktree add /Users/cole/Projects/Wesbite-ocean-c2-c -b ocean-c2-c c2-contract
```
```bash
ln -s /Users/cole/Projects/Wesbite-ocean/node_modules /Users/cole/Projects/Wesbite-ocean-c2-c/node_modules && cd /Users/cole/Projects/Wesbite-ocean-c2-c && git log --oneline -1 && node --test tests/ocean/stages/steps.test.js
```
Expected: the contract commit, 3 passing tests. Lane C works in `/Users/cole/Projects/Wesbite-ocean-c2-c` with `OCEAN_PORT=8783`.

- [ ] **Step 2: Write the failing model test**

Create `tests/ocean/page/overlayModel.test.js`:
```js
// The surface overlays' arrows (piece C2, lane C; spec 10.7 steps 5, 8 and 9): each wave's heading,
// the surface's exact normals on a grid with the tangent and binormal at its centre, and (Task 6) the
// central difference beside the exact slope.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as WaveSampler from '../../../content/ocean/js/core/waveSampler.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { ARROW_STRIDE, COLOURS, GRID, MAX_ARROWS, MAX_DIRECTIONS, NORMAL_LENGTH, directionArrows, normalArrows } from '../../../content/ocean/js/page/overlayModel.js';

const arrow = (out, i) => Array.from(out.subarray(i * ARROW_STRIDE, (i + 1) * ARROW_STRIDE));
const unit = (v) => {
	const l = Math.hypot(...v);
	return v.map((x) => x / l);
};

test('one arrow per summed wave, along its heading, from a hub above the surface', () => {
	const out = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const fanned = WaveBanks.withCount(WaveBanks.teachingBank(), 6);
	expect.equal(directionArrows(fanned, 3, [10, -5], out), 6, 'six waves, six arrows');
	for (let i = 0; i < 6; i++) {
		const [bx, by, bz, tx, ty, tz, colour] = arrow(out, i);
		const o = i * WaveSampler.STRIDE;
		const [dx, dz] = unit([tx - bx, tz - bz]);
		expect.near(dx, fanned.packed[o + 4], 1e-9, `wave ${i} heading x`);
		expect.near(dz, fanned.packed[o + 5], 1e-9, `wave ${i} heading z`);
		expect.equal(ty, by, `wave ${i} flat`);
		expect.equal(colour, COLOURS.WAVE + i, `wave ${i} colour`);
		const length = Math.hypot(tx - bx, tz - bz);
		expect.truthy(length >= 6 && length <= 24, `wave ${i} length ${length}`);
		expect.equal(`${bx},${bz}`, '10,-5', 'from the focus');
	}
	const line = WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), 0), 6);
	directionArrows(line, 3, [0, 0], out);
	for (let i = 0; i < 6; i++) expect.near(arrow(out, i)[3], 0, 1e-12, `spread 0: wave ${i} along +z`);
	expect.equal(directionArrows(WaveBanks.withCount(WaveBanks.teachingBank(), 32), 3, [0, 0], out), MAX_DIRECTIONS, 'at most eight');
});

test('normals: a grid of exact normals on the surface, and T, B square to n with n along B x T', () => {
	const sine = WaveBanks.nextSine(null, { amplitude: 2, wavelength: 30, speed: 5 }, 0).bank;
	const out = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const count = normalArrows(sine, 1.5, [3, 7], out);
	expect.equal(count, GRID * GRID + 2, 'the grid, the tangent and the binormal');
	const k = (2 * Math.PI) / 30;
	const omega = k * 5;
	for (let i = 0; i < GRID * GRID; i++) {
		const [bx, by, bz, tx, ty, tz, colour] = arrow(out, i);
		expect.equal(colour, COLOURS.NORMAL, `arrow ${i} colour`);
		const slope = 2 * k * Math.cos(k * bz - omega * 1.5);
		const want = unit([0, 1, -slope]);
		const got = unit([tx - bx, ty - by, tz - bz]);
		want.forEach((w, j) => expect.near(got[j], w, 1e-9, `arrow ${i} component ${j}`));
		expect.near(Math.hypot(tx - bx, ty - by, tz - bz), NORMAL_LENGTH, 1e-9, `arrow ${i} length`);
		expect.near(Math.abs(bx) % 2, 0, 1e-9, `arrow ${i} on the 2-stud lattice`);
	}
	const t = arrow(out, GRID * GRID);
	const b = arrow(out, GRID * GRID + 1);
	expect.equal(t[6], COLOURS.TANGENT, 'tangent colour');
	expect.equal(b[6], COLOURS.BINORMAL, 'binormal colour');
	const centre = arrow(out, (GRID * GRID - 1) / 2);
	const n = unit([centre[3] - centre[0], centre[4] - centre[1], centre[5] - centre[2]]);
	const tv = unit([t[3] - t[0], t[4] - t[1], t[5] - t[2]]);
	const bv = unit([b[3] - b[0], b[4] - b[1], b[5] - b[2]]);
	const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
	expect.near(dot(n, tv), 0, 1e-9, 'T square to n');
	expect.near(dot(n, bv), 0, 1e-9, 'B square to n');
	const cross = [bv[1] * tv[2] - bv[2] * tv[1], bv[2] * tv[0] - bv[0] * tv[2], bv[0] * tv[1] - bv[1] * tv[0]];
	expect.near(dot(unit(cross), n), 1, 1e-9, 'n is along B x T');
});
```

Run: `node --test tests/ocean/page/overlayModel.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Write `overlayModel.js`**

```js
// The arrows of the surface overlays (piece C2; lane C owns this file; spec 10.7 steps 5, 8 and 9;
// browser-free): each wave's heading from a hub above the surface; the surface's normals on a grid
// round the focus, the exact ones the engine's own WaveSampler gives from the waves' slopes (chop 0,
// as these steps run, so a grid point is a vertex of the finest ring: they sit on the 2-stud
// lattice); the tangent T = (1, dy/dx, 0) and binormal B = (0, dy/dz, 1) at the grid's centre; and
// (Task 6) the central-difference normal beside the exact one. Arrows go into a Float64Array,
// ARROW_STRIDE numbers each: base x, y, z, tip x, y, z, colour. Nothing allocates per call.
import * as WaveSampler from '../core/waveSampler.js';

export const ARROW_STRIDE = 7;
export const GRID = 7;
export const GRID_SPACING = 4;
export const MAX_DIRECTIONS = 8;
export const MAX_ARROWS = 2 * GRID * GRID + MAX_DIRECTIONS + 2;
export const COLOURS = Object.freeze({ NORMAL: 0, TANGENT: 1, BINORMAL: 2, DIFFERENCE: 3, WAVE: 4 });
export const NORMAL_LENGTH = 3;
// Studs the arrows start above the surface, so their bases are not buried in it.
const LIFT = 0.15;
// Studs the heading hub floats above the surface.
const HUB_LIFT = 1.5;
const STRIDE = WaveSampler.STRIDE;
const SAMPLE = new Float64Array(7);

function write(out, i, bx, by, bz, tx, ty, tz, colour) {
	const o = i * ARROW_STRIDE;
	out[o] = bx;
	out[o + 1] = by;
	out[o + 2] = bz;
	out[o + 3] = tx;
	out[o + 4] = ty;
	out[o + 5] = tz;
	out[o + 6] = colour;
}

const sampleAt = (waves, t, x, z) => WaveSampler.sample(waves.packed, waves.count, t, x, z, 0, waves.weights, 0, SAMPLE);

/** One arrow per summed wave with height (at most MAX_DIRECTIONS), along its heading. */
export function directionArrows(waves, t, focus, out) {
	const hx = focus[0];
	const hz = focus[1];
	const hy = sampleAt(waves, t, hx, hz)[1] + HUB_LIFT;
	let n = 0;
	for (let wave = 0; wave < waves.count && n < MAX_DIRECTIONS; wave++) {
		const o = wave * STRIDE;
		if (waves.weights[wave] === 0 || waves.packed[o + 2] === 0) continue;
		const length = Math.min(Math.max(((2 * Math.PI) / waves.packed[o]) * 0.3, 6), 24);
		write(out, n, hx, hy, hz, hx + waves.packed[o + 4] * length, hy, hz + waves.packed[o + 5] * length, COLOURS.WAVE + n);
		n += 1;
	}
	return n;
}

// The grid's centre on the 2-stud lattice, so each point is a vertex of the finest ring.
const lattice = (value) => Math.round(value / 2) * 2;

/** GRID x GRID exact normals round the focus, then the tangent and binormal at the centre. */
export function normalArrows(waves, t, focus, out) {
	const cx = lattice(focus[0]);
	const cz = lattice(focus[1]);
	const half = (GRID - 1) / 2;
	let n = 0;
	for (let i = 0; i < GRID; i++) {
		for (let j = 0; j < GRID; j++) {
			const x = cx + (i - half) * GRID_SPACING;
			const z = cz + (j - half) * GRID_SPACING;
			const s = sampleAt(waves, t, x, z);
			const y = s[1] + LIFT;
			write(out, n, x, y, z, x + s[3] * NORMAL_LENGTH, y + s[4] * NORMAL_LENGTH, z + s[5] * NORMAL_LENGTH, COLOURS.NORMAL);
			n += 1;
		}
	}
	const s = sampleAt(waves, t, cx, cz);
	const y = s[1] + LIFT;
	// The normal lies along (-dy/dx, 1, -dy/dz), so each slope is minus a horizontal part over the vertical one.
	const sx = -s[3] / s[4];
	const sz = -s[5] / s[4];
	const tl = Math.hypot(1, sx);
	const bl = Math.hypot(sz, 1);
	write(out, n, cx, y, cz, cx + NORMAL_LENGTH / tl, y + (sx * NORMAL_LENGTH) / tl, cz, COLOURS.TANGENT);
	write(out, n + 1, cx, y, cz, cx, y + (sz * NORMAL_LENGTH) / bl, cz + NORMAL_LENGTH / bl, COLOURS.BINORMAL);
	return n + 2;
}
```

Run: `node --test tests/ocean/page/overlayModel.test.js`
Expected: PASS.

- [ ] **Step 4: Write the failing browser test**

Create `tests/ocean/e2e/overlays.spec.js`:
```js
// The surface overlays in the browser (piece C2, lane C; spec 10.7): arrows on the surface in steps
// 5, 8 and 9, none elsewhere, finite at the sliders' ends (Review Focus 5, Task 6).
import { test, expect } from '@playwright/test';
import { load, stage, watchErrors, waitFrames } from './helpers/stage.js';
import { oceanRunning, scrollToId } from './helpers/story.js';
import { GRID } from '../../../content/ocean/js/page/overlayModel.js';

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

// How many pixels of a 256-wide copy of the canvas are clearly coloured (an arrow on the white sea),
// rather than white, grey or sky blue: saturation over 0.45 and value over 0.3.
async function colouredPixels(page) {
	return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const copy = document.createElement('canvas');
		copy.width = 256;
		copy.height = 144;
		const context = copy.getContext('2d');
		context.drawImage(source, 0, 0, copy.width, copy.height);
		const data = context.getImageData(0, 0, copy.width, copy.height).data;
		let count = 0;
		for (let i = 0; i < data.length; i += 4) {
			const max = Math.max(data[i], data[i + 1], data[i + 2]);
			const min = Math.min(data[i], data[i + 1], data[i + 2]);
			if (max > 76 && (max - min) / max > 0.45) count += 1;
		}
		resolve(count);
	})));
}

test('step 8: a grid of normals and the tangent and binormal, drawn on the white sea', async ({ page }) => {
	await load(page, 'step=normals&freeze=12', 10);
	const overlays = await stage(page, 'overlays');
	expect(overlays.kind).toBe('normals');
	expect(overlays.arrows).toBe(GRID * GRID + 2);
	expect(overlays.finite).toBe(true);
	expect(await colouredPixels(page)).toBeGreaterThan(150);
});

test('step 5: one arrow per wave; spread 0 lays them all along one heading', async ({ page }) => {
	await load(page, 'step=directions&freeze=12', 10);
	expect((await stage(page, 'overlays')).arrows).toBe(6);
	await stage(page, 'setSlider', 'fan', 0);
	await waitFrames(page, 4);
	const first = (await stage(page, 'overlays')).first;
	expect(Math.abs(first[3] - first[0])).toBeLessThan(1e-6);
	expect(first[5] - first[2]).toBeGreaterThan(0);
});

test('no arrows on the steps without an overlay', async ({ page }) => {
	await load(page, 'step=unlit&freeze=12', 10);
	expect((await stage(page, 'overlays')).arrows).toBe(0);
	await load(page, 'step=jonswap&freeze=12', 20);
	expect((await stage(page, 'overlays')).arrows).toBe(0);
});
```

Run: `OCEAN_PORT=8783 npm run test:ocean:e2e -- tests/ocean/e2e/overlays.spec.js`
Expected: FAIL (the stub draws nothing).

- [ ] **Step 5: Draw the arrows**

Replace `content/ocean/js/render/surfaceOverlays.js`:
```js
// Arrows on the surface (piece C2; lane C owns this file; spec 10.7 steps 5, 8 and 9): each wave's
// heading (step 5), the surface's normals with the tangent and binormal (step 8), and the
// central-difference normal beside the exact one (step 9, Task 6). The arrows come from
// page/overlayModel.js, read from the waves the surface is written from; each is a thin cylinder and
// a cone, two instanced meshes for every arrow at once. Everything is made once; a frame writes
// matrices and colours into the instance buffers and allocates nothing. An arrow that is not finite
// (it never should be) is drawn at zero size and reported through probe().finite.
import * as THREE from 'three';
import { ARROW_STRIDE, MAX_ARROWS, directionArrows, normalArrows } from '../page/overlayModel.js';

const srgb = (hex) => new THREE.Color().setStyle(hex, THREE.SRGBColorSpace);
// Normal (a darker accent), tangent and binormal (term colours), the central difference (orange),
// then one colour per wave heading: all clear against the white teaching sea.
const PALETTE = [
	srgb('#1aa392'), srgb('#d9891a'), srgb('#d6457a'), srgb('#ef6c1a'),
	srgb('#e4572e'), srgb('#17a2a0'), srgb('#c9a000'), srgb('#5a9b2f'), srgb('#2e86ab'), srgb('#a23b72'), srgb('#f18f01'), srgb('#6a4c93'),
];
const HEAD_LENGTH = 0.6;
const UP = new THREE.Vector3(0, 1, 0);

export function createSurfaceOverlays({ view, ocean }) {
	const arrows = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const shaftGeometry = new THREE.CylinderGeometry(0.07, 0.07, 1, 6);
	shaftGeometry.translate(0, 0.5, 0); // from its base at the origin, one stud along +y
	const headGeometry = new THREE.ConeGeometry(0.22, HEAD_LENGTH, 10);
	headGeometry.translate(0, -HEAD_LENGTH / 2, 0); // its tip at the origin
	const material = new THREE.MeshBasicMaterial({ toneMapped: false });
	const shafts = new THREE.InstancedMesh(shaftGeometry, material, MAX_ARROWS);
	const heads = new THREE.InstancedMesh(headGeometry, material, MAX_ARROWS);
	for (let i = 0; i < MAX_ARROWS; i++) {
		shafts.setColorAt(i, PALETTE[0]);
		heads.setColorAt(i, PALETTE[0]);
	}
	for (const mesh of [shafts, heads]) {
		mesh.count = 0;
		mesh.frustumCulled = false;
		mesh.visible = false;
		mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		view.scene.add(mesh);
	}
	const base = new THREE.Vector3();
	const tip = new THREE.Vector3();
	const direction = new THREE.Vector3();
	const turn = new THREE.Quaternion();
	const size = new THREE.Vector3();
	const matrix = new THREE.Matrix4();
	const nothing = new THREE.Matrix4().makeScale(0, 0, 0);
	let kind = null;
	let spacing = 4;
	let count = 0;
	let meanAngle = null;
	let finite = true;

	// Arrow i's two instances, thicker for the long heading arrows so they read from higher up.
	function place(i, thick) {
		const o = i * ARROW_STRIDE;
		base.set(arrows[o], arrows[o + 1], arrows[o + 2]);
		tip.set(arrows[o + 3], arrows[o + 4], arrows[o + 5]);
		direction.subVectors(tip, base);
		const length = direction.length();
		if (!(Number.isFinite(length) && length > 0) || !Number.isFinite(base.x + base.y + base.z)) {
			finite = false;
			shafts.setMatrixAt(i, nothing);
			heads.setMatrixAt(i, nothing);
			return;
		}
		direction.divideScalar(length);
		turn.setFromUnitVectors(UP, direction);
		size.set(thick, Math.max(length - HEAD_LENGTH * thick, 0.01), thick);
		shafts.setMatrixAt(i, matrix.compose(base, turn, size));
		size.set(thick, thick, thick);
		heads.setMatrixAt(i, matrix.compose(tip, turn, size));
		const colour = PALETTE[Math.min(arrows[o + 6], PALETTE.length - 1)];
		shafts.setColorAt(i, colour);
		heads.setColorAt(i, colour);
	}

	function draw(t, focus) {
		const waves = ocean.source === 'waves' ? ocean.waves : null;
		meanAngle = null;
		if (kind === null || waves === null) return 0;
		if (kind === 'directions') return directionArrows(waves, t, focus, arrows);
		if (kind === 'normals') return normalArrows(waves, t, focus, arrows);
		return 0;
	}

	return {
		apply(overlay) {
			kind = overlay.kind;
			spacing = overlay.spacing;
		},
		frame(t, focus) {
			count = draw(t, focus);
			finite = true;
			const thick = kind === 'directions' ? 4 : 1;
			for (let i = 0; i < count; i++) place(i, thick);
			shafts.count = count;
			heads.count = count;
			shafts.visible = count > 0;
			heads.visible = count > 0;
			if (count > 0) {
				shafts.instanceMatrix.needsUpdate = true;
				heads.instanceMatrix.needsUpdate = true;
				shafts.instanceColor.needsUpdate = true;
				heads.instanceColor.needsUpdate = true;
			}
		},
		probe() {
			return { kind, arrows: count, spacing, meanAngle, finite, first: count > 0 ? Array.from(arrows.subarray(0, 6)) : null };
		},
	};
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/ocean/page/overlayModel.test.js && OCEAN_PORT=8783 npm run test:ocean:e2e -- tests/ocean/e2e/overlays.spec.js tests/ocean/e2e/contract.spec.js`
Expected: PASS. If the coloured-pixel count is under 150 on a frame where the arrows plainly show (capture it), report the measured count.

- [ ] **Step 7: Commit**

```bash
git add content/ocean/js/page/overlayModel.js content/ocean/js/render/surfaceOverlays.js tests/ocean/page/overlayModel.test.js tests/ocean/e2e/overlays.spec.js
```
```bash
git commit -m "feat: arrows on the surface: each wave's heading, and the exact normals with their tangent and binormal"
```

### Task 6: The central difference beside the exact derivative, and its live readout

**Files:**
- Modify: `content/ocean/js/page/overlayModel.js`, `content/ocean/js/render/surfaceOverlays.js`, `content/ocean/js/ui/overlayReadout.js`, `content/ocean/js/stages/chapters/vectors.js`, `tests/ocean/page/overlayModel.test.js`, `tests/ocean/e2e/overlays.spec.js`

**Interfaces:**
- Consumes: Task 5's model and renderer; `stepOf` (steps.js); `handle.story.hooks.overlays()`; `watchReading`; the slot `p.readout[data-readout="slopes"][data-copy-skip="live"]`; `mountOverlayReadout({ handle, watchReading })` called by `ui/page.js`.
- Produces: `slopeArrows(waves, t, focus, h, out, result) -> result` (`result = { count, meanAngle }`, degrees), `differenceSlope(waves, t, x, z, h, out)`, `readoutText({ meanAngle, spacing })`; the readout hook `text()`.

- [ ] **Step 1: Write the failing tests**

In `tests/ocean/page/overlayModel.test.js`, add `differenceSlope, readoutText, slopeArrows` to the import from `overlayModel.js`, then append:
```js
test('the central difference on one sine is exactly A k cos(theta) sin(kh)/(kh), and closes on the exact slope as h shrinks', () => {
	const sine = WaveBanks.nextSine(null, { amplitude: 2, wavelength: 30, speed: 5 }, 0).bank;
	const k = (2 * Math.PI) / 30;
	const out = new Float64Array(2);
	for (const h of [0.5, 4, 12]) {
		differenceSlope(sine, 1.5, 3, 7, h, out);
		const exact = 2 * k * Math.cos(k * 7 - k * 5 * 1.5);
		expect.near(out[1], (exact * Math.sin(k * h)) / (k * h), 1e-9, `dz at h ${h}`);
		expect.near(out[0], 0, 1e-12, `dx at h ${h}`);
	}
	const result = { count: 0, meanAngle: 0 };
	const arrows = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const angles = [0.01, 0.5, 4, 16].map((h) => slopeArrows(sine, 1.5, [3, 7], h, arrows, result).meanAngle);
	expect.truthy(angles[0] < 1e-3, `h 0.01: ${angles[0]} degrees`);
	expect.truthy(angles[0] < angles[1] && angles[1] < angles[2] && angles[2] < angles[3], `the gap grows with h: ${angles.join(', ')}`);
	expect.equal(result.count, 2 * GRID * GRID, 'an exact and a difference arrow per point');
	expect.equal(arrows[6], COLOURS.NORMAL, 'exact first');
	expect.equal(arrows[ARROW_STRIDE + 6], COLOURS.DIFFERENCE, 'then the difference');
});

// Review Focus 5 (the model's half; the browser's is in overlays.spec.js).
test('the overlays hold at the sliders ends: spread 0 and 1, spacing 0.5 and 16, over the whole bank', () => {
	const out = new Float64Array(MAX_ARROWS * ARROW_STRIDE);
	const result = { count: 0, meanAngle: 0 };
	for (const fan of [0, 1]) {
		const waves = WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), fan), 32);
		const n = directionArrows(waves, 100, [-37, 81], out);
		expect.truthy(Array.from(out.subarray(0, n * ARROW_STRIDE)).every(Number.isFinite), `directions finite at spread ${fan}`);
		for (const h of [0.5, 16]) {
			slopeArrows(waves, 100, [-37, 81], h, out, result);
			expect.truthy(Array.from(out.subarray(0, result.count * ARROW_STRIDE)).every(Number.isFinite), `slopes finite at spread ${fan}, h ${h}`);
			expect.truthy(Number.isFinite(result.meanAngle) && result.meanAngle >= 0 && result.meanAngle < 90, `mean angle ${result.meanAngle}`);
		}
	}
});

test('the readout says the gap and the spacing, live numbers only', () => {
	expect.equal(readoutText({ meanAngle: 3.217, spacing: 4 }), 'On this sea just now, the two arrows differ by 3.2° on average, sampling 4 studs either side.');
	expect.equal(readoutText({ meanAngle: 0.0412, spacing: 0.5 }), 'On this sea just now, the two arrows differ by 0.041° on average, sampling 0.5 studs either side.');
	expect.equal(readoutText({ meanAngle: null, spacing: 4 }), '');
});
```

Append to `tests/ocean/e2e/overlays.spec.js`:
```js
test('step 9: exact and difference arrows, a gap that grows with the spacing', async ({ page }) => {
	await load(page, 'step=slopes&freeze=12', 10);
	const small = await stage(page, 'overlays');
	expect(small.kind).toBe('slopes');
	expect(small.arrows).toBe(2 * GRID * GRID);
	await stage(page, 'setSlider', 'spacing', 12);
	await waitFrames(page, 4);
	const large = await stage(page, 'overlays');
	expect(large.meanAngle).toBeGreaterThan(small.meanAngle);
});

// Review Focus 5.
test('the overlays hold at the sliders ends', async ({ page }) => {
	for (const value of [0.5, 16]) {
		await load(page, `step=slopes&freeze=104.6&s.spacing=${value}`, 10);
		const probe = await stage(page, 'overlays');
		expect(probe.finite).toBe(true);
		expect(Number.isFinite(probe.meanAngle)).toBe(true);
		expect(probe.arrows).toBe(2 * GRID * GRID);
	}
	for (const value of [0, 1]) {
		await load(page, `step=directions&freeze=104.6&s.fan=${value}`, 10);
		const probe = await stage(page, 'overlays');
		expect(probe.finite).toBe(true);
		expect(probe.arrows).toBe(6);
	}
});

test('the readout under step 9 is live, follows the slider, and is empty in the served page', async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await expect(page.locator('[data-readout="slopes"]')).toHaveText('');
	await scrollToId(page, 'slopes', 0.2);
	await expect(page.locator('[data-readout="slopes"]')).toContainText('°', { timeout: 10_000 });
	const before = await page.locator('[data-readout="slopes"]').textContent();
	await page.locator('section[data-step-id="slopes"] [data-slider="spacing"] input').fill('14');
	await expect(page.locator('[data-readout="slopes"]')).not.toHaveText(before, { timeout: 10_000 });
	await expect(page.locator('[data-readout="slopes"]')).toContainText('14 studs');
});
```

Run: `node --test tests/ocean/page/overlayModel.test.js && OCEAN_PORT=8783 npm run test:ocean:e2e -- tests/ocean/e2e/overlays.spec.js`
Expected: FAIL (`slopeArrows` and `readoutText` missing; the slopes step draws nothing; the readout stays empty).

- [ ] **Step 2: The central difference in the model**

Add to `content/ocean/js/page/overlayModel.js` (and to its header: "step 9: at each grid point the exact normal and the one the central difference gives from heights `h` studs either side along x and z, and their mean angle in degrees; `readoutText` words it for the panel"):
```js
const height = (waves, t, x, z) => sampleAt(waves, t, x, z)[1];

/** The central-difference slopes (dy/dx, dy/dz) at (x, z) from heights h studs either side, into out. */
export function differenceSlope(waves, t, x, z, h, out) {
	out[0] = (height(waves, t, x + h, z) - height(waves, t, x - h, z)) / (2 * h);
	out[1] = (height(waves, t, x, z + h) - height(waves, t, x, z - h)) / (2 * h);
	return out;
}

const SLOPES = new Float64Array(2);
const DEGREES = 180 / Math.PI;

/** Exact and central-difference normals on the grid, in that order per point; the mean angle between them. */
export function slopeArrows(waves, t, focus, h, out, result) {
	const cx = lattice(focus[0]);
	const cz = lattice(focus[1]);
	const half = (GRID - 1) / 2;
	let n = 0;
	let sum = 0;
	for (let i = 0; i < GRID; i++) {
		for (let j = 0; j < GRID; j++) {
			const x = cx + (i - half) * GRID_SPACING;
			const z = cz + (j - half) * GRID_SPACING;
			const s = sampleAt(waves, t, x, z);
			const y = s[1] + LIFT;
			const nx = s[3];
			const ny = s[4];
			const nz = s[5];
			differenceSlope(waves, t, x, z, h, SLOPES);
			const length = Math.hypot(SLOPES[0], 1, SLOPES[1]);
			const dx = -SLOPES[0] / length;
			const dy = 1 / length;
			const dz = -SLOPES[1] / length;
			sum += Math.acos(Math.min(1, Math.max(-1, nx * dx + ny * dy + nz * dz)));
			write(out, n, x, y, z, x + nx * NORMAL_LENGTH, y + ny * NORMAL_LENGTH, z + nz * NORMAL_LENGTH, COLOURS.NORMAL);
			write(out, n + 1, x, y, z, x + dx * NORMAL_LENGTH, y + dy * NORMAL_LENGTH, z + dz * NORMAL_LENGTH, COLOURS.DIFFERENCE);
			n += 2;
		}
	}
	result.count = n;
	result.meanAngle = (sum / (GRID * GRID)) * DEGREES;
	return result;
}

const angleText = (degrees) => (degrees < 0.1 ? degrees.toFixed(3) : degrees < 10 ? degrees.toFixed(1) : degrees.toFixed(0));
const studsText = (studs) => String(Number(studs.toFixed(1)));

/** The panel's live line: empty until there is a gap to show. */
export function readoutText({ meanAngle, spacing }) {
	if (!Number.isFinite(meanAngle)) return '';
	return `On this sea just now, the two arrows differ by ${angleText(meanAngle)}° on average, sampling ${studsText(spacing)} studs either side.`;
}
```
`angleText(0.0412)` gives `0.041` and `angleText(3.217)` gives `3.2`, as the test reads.

- [ ] **Step 3: Draw the slopes, and write the readout**

In `content/ocean/js/render/surfaceOverlays.js`: add `slopeArrows` to the import; create `const slope = { count: 0, meanAngle: 0 };` next to the other scratch objects; in `draw`, replace the final `return 0;` with:
```js
		slopeArrows(waves, t, focus, spacing, arrows, slope);
		meanAngle = slope.meanAngle;
		return slope.count;
```
and add "and the central-difference normal beside each exact one, with their mean angle (Task 6)" to the header.

Replace `content/ocean/js/ui/overlayReadout.js`:
```js
// The live line under step 9's arrows (piece C2; lane C owns this file; spec 10.7): how far apart
// the exact and the central-difference normals are on the sea on screen, and the spacing the
// difference samples at, read from the overlays' probe at most twice a second while step 9 is being
// read, and written only when the words change. Its element carries data-copy-skip="live" and is
// empty in the served page: every number in it is computed in the visitor's browser.
import { readoutText } from '../page/overlayModel.js';
import { stepOf } from '../stages/steps.js';

const UPDATE_MS = 500;

export function mountOverlayReadout({ handle, watchReading }) {
	const element = document.querySelector('[data-readout="slopes"]');
	const step = stepOf('slopes');
	let timer = 0;
	let text = '';
	if (!element || !handle.story) {
		return Object.freeze({ hooks: Object.freeze({ text: () => text }) });
	}

	function update() {
		const probe = handle.story.hooks.overlays();
		const next = probe.kind === 'slopes' ? readoutText(probe) : text;
		if (next !== text) {
			text = next;
			element.textContent = text;
		}
	}

	watchReading((reading) => {
		const here = reading.phase === 'step' && reading.step === step;
		if (here && timer === 0) {
			update();
			timer = setInterval(update, UPDATE_MS);
		} else if (!here && timer !== 0) {
			clearInterval(timer);
			timer = 0;
		}
	});

	return Object.freeze({ hooks: Object.freeze({ text: () => text }) });
}
```
The readout keeps its last words after the visitor scrolls on; the probe reports `slopes` only while the blend shows step 9.

- [ ] **Step 4: Tune the vector steps' shots**

Capture them:
```bash
(OCEAN_PORT=8783 npm run serve:ocean >/dev/null 2>&1 &) && sleep 2 && OCEAN_PORT=8783 node scripts/ocean-stage-capture.mjs /private/tmp/c2-vectors 0 '' normals,slopes && OCEAN_PORT=8783 node scripts/ocean-stage-capture.mjs /private/tmp/c2-vectors 0 's.spacing=16' slopes && OCEAN_PORT=8783 node scripts/ocean-stage-capture.mjs /private/tmp/c2-vectors 0 'tier=Medium' normals,slopes; pkill -f "http.server 8783"
```
and judge: the grid of arrows fills the middle of the frame, the two colours tell apart at spacing 16, no arrow hides behind a crest. Adjust only `vectors.js` (the `CLOSE` shot; `GRID_SPACING` is the model's, fixed by its tests). Then run `node --test tests/ocean/stages/clearance.test.js tests/ocean/stages/shots.test.js tests/ocean/page/orbitLimits.test.js`. Expected: PASS.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/ocean/page/overlayModel.test.js && OCEAN_PORT=8783 npm run test:ocean:e2e -- tests/ocean/e2e/overlays.spec.js tests/ocean/e2e/copy.spec.js`
Expected: PASS (the copy check finds the readout empty in the served HTML).

- [ ] **Step 6: Run the suites and commit**

```bash
ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -3 && OCEAN_PORT=8783 npm run test:ocean:e2e 2>&1 | tail -5
```
Expected: all pass.
```bash
git add content/ocean/js/page/overlayModel.js content/ocean/js/render/surfaceOverlays.js content/ocean/js/ui/overlayReadout.js content/ocean/js/stages/chapters/vectors.js tests/ocean/page/overlayModel.test.js tests/ocean/e2e/overlays.spec.js
```
```bash
git commit -m "feat: the central difference beside the exact slope, with the gap between them measured live"
```

---

## Wave 1, lane D: light, split into its terms (worktree `Wesbite-ocean-c2-d`, branch `ocean-c2-d`, port 8784)

### Task 7: The terms material: unlit, Lambert, the highlight, Fresnel with the sky

**Files:**
- Create: `content/ocean/js/page/lightTerms.js`, `content/ocean/js/render/termsMaterial.js`, `tests/ocean/page/lightTerms.test.js`, `tests/ocean/e2e/lightTerms.spec.js`
- Modify: `content/ocean/js/render/stageLook.js`, `content/ocean/js/stages/chapters/light.js`

**Interfaces:**
- Consumes: `createStageLook({ view, meshes, materials, config })` with Task 0's `'terms'` mode, `setClip` (which clips every material in `shared`) and `probe().terms`; `view.sunDirection` (rewritten in place by `setStageSun`); `render/lighting.js` (`SUN_COLOUR`, `SKY_AMBIENT`, `GROUND_AMBIENT`, `AMBIENT_INTENSITY`, `FOG_COLOUR`); the recipe's `look.terms`; the math box's formula for step 11 (lane A: `c = (1 − F)(c_sea (a + max(0, n·s)) + (n·h)^p) + F c_sky`).
- Produces: `stageLook.probe()` gains `termsClips`; `lightTerms.js` exports `TERMS` (the constants), `schlick(cosine, f0)`, `shade({ n, v, s, terms, sea, sunColour, ambientSky, ambientGround, skyHorizon, skyZenith })` -> linear `[r, g, b]` (the reference the shader mirrors); `termsMaterial.js` exports `createTermsMaterial({ seaColour, sunDirection }) -> THREE.ShaderMaterial` with `setTerms({ diffuse, specular, fresnel })`, `setSun(direction)`, `terms()`; `stageLook.probe().terms` filled.

- [ ] **Step 1: Make the lane's worktree**

```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git worktree add /Users/cole/Projects/Wesbite-ocean-c2-d -b ocean-c2-d c2-contract
```
```bash
ln -s /Users/cole/Projects/Wesbite-ocean/node_modules /Users/cole/Projects/Wesbite-ocean-c2-d/node_modules && cd /Users/cole/Projects/Wesbite-ocean-c2-d && git log --oneline -1 && node --test tests/ocean/stages/steps.test.js
```
Expected: the contract commit, 3 passing tests. Lane D works in `/Users/cole/Projects/Wesbite-ocean-c2-d` with `OCEAN_PORT=8784`.

- [ ] **Step 2: Write the failing reference test**

Create `tests/ocean/page/lightTerms.test.js`:
```js
// The lighting terms' reference (piece C2, lane D; spec 10.6): what each term adds, as the math box
// writes it, c = (1 - F)(c_sea (a + max(0, n.s)) + (n.h)^p) + F c_sky. The shader
// (render/termsMaterial.js) is this, line for line.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { TERMS, schlick, shade } from '../../../content/ocean/js/page/lightTerms.js';

const unit = (v) => {
	const l = Math.hypot(...v);
	return v.map((x) => x / l);
};
const base = {
	sea: [0.1, 0.3, 0.4],
	sunColour: [1, 1, 1],
	ambientSky: [0.5, 0.5, 0.5],
	ambientGround: [0.5, 0.5, 0.5],
	skyHorizon: [0.8, 0.8, 0.8],
	skyZenith: [0.3, 0.5, 0.9],
};
const off = { diffuse: false, specular: false, fresnel: false };

test("Schlick's Fresnel: F0 looking straight down, 1 at grazing", () => {
	expect.near(schlick(1, TERMS.f0), TERMS.f0, 1e-12, 'normal incidence');
	expect.near(schlick(0, TERMS.f0), 1, 1e-12, 'grazing');
	expect.truthy(schlick(0.5, TERMS.f0) > TERMS.f0 && schlick(0.5, TERMS.f0) < 1, 'between');
});

test('with every term off the sea is its own flat colour, wherever the sun is', () => {
	for (const s of [[0, 1, 0], unit([1, 0.2, 0]), unit([0, -1, 0.1])]) {
		expect.equal(shade({ ...base, n: [0, 1, 0], v: [0, 1, 0], s, terms: off }).join(','), base.sea.join(','), `sun ${s}`);
	}
});

test('Lambert: brightest facing the sun, ambient alone facing away', () => {
	const terms = { ...off, diffuse: true };
	const facing = shade({ ...base, n: [0, 1, 0], v: [0, 1, 0], s: [0, 1, 0], terms });
	const away = shade({ ...base, n: [0, 1, 0], v: [0, 1, 0], s: [0, -1, 0], terms });
	const ambient = 0.5 * TERMS.ambient;
	away.forEach((c, i) => expect.near(c, base.sea[i] * ambient, 1e-12, `away ${i}`));
	facing.forEach((c, i) => expect.near(c, base.sea[i] * (ambient + TERMS.sun), 1e-12, `facing ${i}`));
});

test('the highlight peaks where the sun reflects straight at the eye', () => {
	const terms = { ...off, specular: true };
	const s = unit([1, 1, 0]);
	const mirror = shade({ ...base, n: [0, 1, 0], v: unit([-1, 1, 0]), s, terms });
	const elsewhere = shade({ ...base, n: [0, 1, 0], v: unit([1, 1, 0]), s, terms });
	expect.near(mirror[0] - base.sea[0], TERMS.specular, 1e-9, 'full strength at the mirror angle');
	expect.truthy(elsewhere[0] - base.sea[0] < 0.05 * TERMS.specular, 'little elsewhere');
});

test('Fresnel mixes in the sky: little looking down, nearly all of it at grazing', () => {
	const terms = { ...off, fresnel: true };
	const down = shade({ ...base, n: [0, 1, 0], v: [0, 1, 0], s: [0, 1, 0], terms });
	const grazing = shade({ ...base, n: [0, 1, 0], v: unit([1, 0.01, 0]), s: [0, 1, 0], terms });
	down.forEach((c, i) => expect.near(c, base.sea[i] * (1 - TERMS.f0) + base.skyZenith[i] * TERMS.f0, 1e-9, `down ${i}`));
	expect.truthy(Math.abs(grazing[0] - base.skyHorizon[0]) < 0.05, `grazing reads the sky near the horizon: ${grazing}`);
});
```

Run: `node --test tests/ocean/page/lightTerms.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the reference and the material**

Create `content/ocean/js/page/lightTerms.js`:
```js
// The lighting terms of steps 7 to 11 (piece C2; lane D owns this file; spec 10.6; browser-free): the
// reference for render/termsMaterial.js's shader, which is the same arithmetic in GLSL, and what the
// math box writes for step 11: colour = (1 - F)(c_sea (a + max(0, n.s)) + (n.h)^p) + F c_sky, where
// a is the sky ambient (hemisphere light: ground below, sky above, by the normal's height), the
// highlight is Blinn-Phong on the half vector h between the sun s and the eye v, F is Schlick's
// Fresnel with F0 for water, and c_sky is a sky colour by the reflected ray's height. Each term
// switches on alone; with all off the sea is its own flat colour. Colours are linear.
export const TERMS = Object.freeze({
	ambient: 0.6, // render/lighting.js AMBIENT_INTENSITY
	sun: 1.0,
	shininess: 120,
	specular: 1.2,
	f0: 0.02, // water's reflectance looking straight down
	zenith: Object.freeze([0.22, 0.42, 0.75]), // sRGB bytes / 255 of the sky overhead
});

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalise = (a) => {
	const l = Math.hypot(a[0], a[1], a[2]);
	return [a[0] / l, a[1] / l, a[2] / l];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);

export function schlick(cosine, f0) {
	return f0 + (1 - f0) * (1 - clamp01(cosine)) ** 5;
}

/** n, v, s unit vectors (normal, towards the eye, towards the sun); colours linear [r, g, b]. */
export function shade({ n, v, s, terms, sea, sunColour, ambientSky, ambientGround, skyHorizon, skyZenith, constants = TERMS }) {
	let colour = [...sea];
	if (terms.diffuse) {
		const ambient = mix(ambientGround, ambientSky, 0.5 + 0.5 * n[1]).map((c) => c * constants.ambient);
		const lambert = Math.max(dot(n, s), 0);
		colour = sea.map((c, i) => c * (ambient[i] + sunColour[i] * constants.sun * lambert));
	}
	if (terms.specular) {
		const h = normalise([s[0] + v[0], s[1] + v[1], s[2] + v[2]]);
		const highlight = constants.specular * Math.max(dot(n, h), 0) ** constants.shininess;
		colour = colour.map((c, i) => c + sunColour[i] * highlight);
	}
	if (terms.fresnel) {
		const F = schlick(dot(n, v), constants.f0);
		const along = 2 * dot(n, v);
		const r = [n[0] * along - v[0], n[1] * along - v[1], n[2] * along - v[2]];
		const sky = mix(skyHorizon, skyZenith, clamp01(r[1]));
		colour = mix(colour, sky, F);
	}
	return colour;
}
```

Create `content/ocean/js/render/termsMaterial.js`:
```js
// The lighting terms as a material (piece C2; lane D owns this file; spec 10.6): page/lightTerms.js's
// arithmetic in GLSL, line for line, so each term the math box shows switches on alone on the screen:
// with all off the flat sea colour, then sky ambient plus Lambert, then the Blinn-Phong highlight,
// then Schlick's Fresnel mixing in a sky colour by the reflected ray's height. It reads the vertex
// normals the engine writes from the waves' exact slopes (stageControl.js writes them for 'terms'),
// takes the scene's fog, and clips like every other surface material (clipping: true, so the stage
// look's setClip reaches it). Only the teaching steps wear it; the painted Roblox-mode materials are
// never touched.
import * as THREE from 'three';
import * as Lighting from './lighting.js';
import { TERMS } from '../page/lightTerms.js';

const srgb = (rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xyz;
	vNormalW = normalize(mat3(modelMatrix) * normal);
	vec4 mvPosition = viewMatrix * world;
	gl_Position = projectionMatrix * mvPosition;
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <clipping_planes_pars_fragment>
uniform vec3 seaColour;
uniform vec3 sunDirection;
uniform vec3 sunColour;
uniform vec3 ambientSky;
uniform vec3 ambientGround;
uniform float ambientStrength;
uniform float sunStrength;
uniform vec3 skyHorizon;
uniform vec3 skyZenith;
uniform float shininess;
uniform float specularStrength;
uniform float f0;
uniform vec3 terms;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
	#include <clipping_planes_fragment>
	vec3 n = normalize(vNormalW);
	vec3 v = normalize(cameraPosition - vWorld);
	vec3 s = normalize(sunDirection);
	vec3 colour = seaColour;
	if (terms.x > 0.5) {
		vec3 ambient = mix(ambientGround, ambientSky, 0.5 + 0.5 * n.y) * ambientStrength;
		colour = seaColour * (ambient + sunColour * sunStrength * max(dot(n, s), 0.0));
	}
	if (terms.y > 0.5) {
		vec3 h = normalize(s + v);
		colour += sunColour * specularStrength * pow(max(dot(n, h), 0.0), shininess);
	}
	if (terms.z > 0.5) {
		float F = f0 + (1.0 - f0) * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
		vec3 r = reflect(-v, n);
		colour = mix(colour, mix(skyHorizon, skyZenith, clamp(r.y, 0.0, 1.0)), F);
	}
	gl_FragColor = vec4(colour, 1.0);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}
`;

export function createTermsMaterial({ seaColour, sunDirection }) {
	const uniforms = THREE.UniformsUtils.merge([
		THREE.UniformsLib.fog,
		{
			seaColour: { value: seaColour.clone() },
			sunDirection: { value: new THREE.Vector3(sunDirection[0], sunDirection[1], sunDirection[2]) },
			sunColour: { value: srgb(Lighting.SUN_COLOUR) },
			ambientSky: { value: srgb(Lighting.SKY_AMBIENT) },
			ambientGround: { value: srgb(Lighting.GROUND_AMBIENT) },
			ambientStrength: { value: TERMS.ambient },
			sunStrength: { value: TERMS.sun },
			skyHorizon: { value: srgb(Lighting.FOG_COLOUR) },
			skyZenith: { value: srgb(TERMS.zenith) },
			shininess: { value: TERMS.shininess },
			specularStrength: { value: TERMS.specular },
			f0: { value: TERMS.f0 },
			terms: { value: new THREE.Vector3(1, 1, 1) },
		},
	]);
	const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true, clipping: true });
	material.setTerms = ({ diffuse, specular, fresnel }) => {
		uniforms.terms.value.set(diffuse ? 1 : 0, specular ? 1 : 0, fresnel ? 1 : 0);
	};
	material.setSun = (direction) => {
		uniforms.sunDirection.value.set(direction[0], direction[1], direction[2]);
	};
	material.terms = () => {
		const t = uniforms.terms.value;
		return { diffuse: t.x > 0.5, specular: t.y > 0.5, fresnel: t.z > 0.5 };
	};
	return material;
}
```

Run: `node --test tests/ocean/page/lightTerms.test.js`
Expected: PASS (5 tests).

- [ ] **Step 4: Write the failing browser test**

Create `tests/ocean/e2e/lightTerms.spec.js`:
```js
// The lighting terms in the browser (piece C2, lane D; spec 10.6): each term switches on alone and
// changes the sea, the material clips with the graph's band, and the page without ?step, before the
// first scroll, is A2's painted Roblox mode exactly.
import { test, expect } from '@playwright/test';
import { grid, load, meanDiff, spread, stage, story, watchErrors, waitFrames } from './helpers/stage.js';
import { oceanRunning } from './helpers/story.js';

const DIFFERENT = 1; // mean absolute luminance change (0..255) that counts as "the canvas changed"

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

test('the page without ?step is painted Roblox mode until the first scroll', async ({ page }) => {
	await oceanRunning(page, '/ocean/', 30);
	const look = await story(page, 'look');
	expect(look.mode).toBe('painted');
	expect(look.terms).toBe(null);
	expect(look.clipped).toBe(false);
	const materials = await page.evaluate(() => window.__ocean.materialsProbe());
	expect(materials.colourBound && materials.normalBound && materials.maskBound && materials.roughnessBound).toBe(true);
	expect(materials.materialCount).toBeGreaterThan(0);
});

test('step 7 is a white blob with no form; step 10 lights it by Lambert alone', async ({ page }) => {
	await load(page, 'step=unlit&freeze=12', 10);
	expect((await stage(page, 'look')).mode).toBe('white');
	const blob = spread(await grid(page, true));
	await load(page, 'step=diffuse&freeze=12', 10);
	const look = await stage(page, 'look');
	expect(look.mode).toBe('terms');
	expect(look.terms).toEqual({ diffuse: true, specular: false, fresnel: false });
	const lit = spread(await grid(page, true));
	expect(lit, `the lit sea varies more than the blob (${lit.toFixed(1)} against ${blob.toFixed(1)})`).toBeGreaterThan(blob * 1.5);
	const before = await grid(page, true);
	await stage(page, 'setSlider', 'sunAzimuth', 35);
	await waitFrames(page, 3);
	expect(meanDiff(before, await grid(page, true))).toBeGreaterThan(DIFFERENT);
});

test('step 11: the highlight and Fresnel each change the sea when switched off', async ({ page }) => {
	await load(page, 'step=highlights&freeze=12', 10);
	expect((await stage(page, 'look')).terms).toEqual({ diffuse: true, specular: true, fresnel: true });
	const all = await grid(page, true);
	await stage(page, 'setSlider', 'specular', false);
	await waitFrames(page, 3);
	expect((await stage(page, 'look')).terms.specular).toBe(false);
	const noHighlight = await grid(page, true);
	expect(meanDiff(all, noHighlight)).toBeGreaterThan(DIFFERENT);
	await stage(page, 'setSlider', 'fresnel', false);
	await waitFrames(page, 3);
	expect(meanDiff(noHighlight, await grid(page, true))).toBeGreaterThan(DIFFERENT);
});

// At 0.45 of the blend from the tiling step into the flat graph the camera is still high and the
// band is about 70 studs either side of x = 0, narrower than the ground in view: the frame's sides
// must show no sea.
test('the terms material clips with the graph band (the blend from the tiling step into the graph)', async ({ page }) => {
	await load(page, 'step=tiling&progress=0.45&freeze=12', 20);
	const look = await stage(page, 'look');
	expect(look.mode).toBe('terms');
	expect(look.clipped).toBe(true);
	expect(look.termsClips).toBe(true);
	const band = (await stage(page, 'graph')).band;
	expect(band[1]).toBeLessThan(100);
	const cells = await grid(page);
	const column = (from, to) => {
		const values = [];
		for (let row = 0; row < 36; row++) for (let x = from; x < to; x++) values.push(cells[row * 64 + x]);
		return values.reduce((a, b) => a + b, 0) / values.length;
	};
	expect(Math.abs(column(0, 8) - column(24, 40)), 'the left eighth is not the sea in the middle').toBeGreaterThan(5);
});
```

Run: `OCEAN_PORT=8784 npm run test:ocean:e2e -- tests/ocean/e2e/lightTerms.spec.js`
Expected: FAIL (`look.terms` is null on step 10: the stand-in material has no terms).

- [ ] **Step 5: Wear the terms material in the stage look**

In `content/ocean/js/render/stageLook.js`:
- Import `{ createTermsMaterial }` from `'./termsMaterial.js'`.
- Replace Task 0's stand-in line in `shared` with `terms: createTermsMaterial({ seaColour: sea, sunDirection: view.sunDirection }),`.
- In `apply(look)`, after `setMode(modeOf(look));`:
```js
		if (mode === 'terms') {
			shared.terms.setTerms(look.terms);
		}
```
and inside the sun-changed branch, after `view.setStageSun(sunDirection(sun));`, add `shared.terms.setSun(view.sunDirection);` (the view normalises and keeps the direction in that array).
- In `probe()`, `terms: mode === 'terms' ? shared.terms.terms() : null,` replaces Task 0's `terms: null,`, and add `termsClips: shared.terms.clipping === true && shared.terms.clippingPlanes === clip,` (a ShaderMaterial ignores clipping planes unless its `clipping` flag is on).
- Header: replace "the sea colour lit by the sun and the sky (steps 4 to 6) or unlit (step 4 with its shading off)" with "the lighting terms one at a time (C2 steps 10 to 13: render/termsMaterial.js), the sea colour lit by three's standard material or unlit (kept for any recipe that asks for `sea`)".

The `'sea-lit'` and `'sea-flat'` modes stay (no C2 recipe uses them; a test may).

- [ ] **Step 6: Tune the light chapter, then run the tests**

Capture them:
```bash
(OCEAN_PORT=8784 npm run serve:ocean >/dev/null 2>&1 &) && sleep 2 && OCEAN_PORT=8784 node scripts/ocean-stage-capture.mjs /private/tmp/c2-light 0 '' unlit,diffuse,highlights,gerstner,tiling && OCEAN_PORT=8784 node scripts/ocean-stage-capture.mjs /private/tmp/c2-light 0 's.specular=0' highlights && OCEAN_PORT=8784 node scripts/ocean-stage-capture.mjs /private/tmp/c2-light 0 's.fresnel=0' highlights; pkill -f "http.server 8784"
```
and judge: the unlit blob reads as white and formless; Lambert alone shows the waves' shape; the highlight sits on the water in the left third; Fresnel brightens the far water towards the sky's colour without washing the frame white; the high tiling shot is not blown out. You may tune `TERMS` (in `lightTerms.js`, keeping its tests true) and `light.js`'s shots and sun; `gerstner` and `tiling` are lane B's recipes, so a problem there is reported. Then:
```bash
node --test tests/ocean/page/lightTerms.test.js tests/ocean/stages/clearance.test.js tests/ocean/stages/shots.test.js tests/ocean/page/orbitLimits.test.js && OCEAN_PORT=8784 npm run test:ocean:e2e -- tests/ocean/e2e/lightTerms.spec.js tests/ocean/e2e/materials.spec.js tests/ocean/e2e/stageSteps.spec.js
```
Expected: PASS, including A2's `materials.spec.js` unchanged. If a "changed the sea" check fails on a frame that visibly changes, report the measured difference.

- [ ] **Step 7: Run the suites and commit**

```bash
ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -3 && OCEAN_PORT=8784 npm run test:ocean:e2e 2>&1 | tail -5
```
Expected: all pass.
```bash
git add content/ocean/js/page/lightTerms.js content/ocean/js/render/termsMaterial.js content/ocean/js/render/stageLook.js content/ocean/js/stages/chapters/light.js tests/ocean/page/lightTerms.test.js tests/ocean/e2e/lightTerms.spec.js
```
```bash
git commit -m "feat: light split into its terms: Lambert, the highlight and Fresnel with the sky, each on its own"
```

---

## Wave 1, lane E: the frequency charts and chapter four (worktree `Wesbite-ocean-c2-e`, branch `ocean-c2-e`, port 8785)

### Task 8: Time and frequency, and the chord taken apart, computed with the engine's FFT

**Files:**
- Create: `content/ocean/js/page/frequencyMath.js`, `tests/ocean/page/frequencyMath.test.js`, `tests/ocean/e2e/frequency.spec.js`
- Modify: `content/ocean/js/ui/frequencyCharts.js`, `content/ocean/css/frequency.css`

**Interfaces:**
- Consumes: `FFT.plan`, `FFT.inverse1D(plan, re, im, offset, stride)` (core/fft.js: x[m] = Σ X[k] e^{+2πikm/N}, no scaling); `WaveSampler.sample`; `WaveBanks.teachingBank`, `withFan`, `withCount`, `TEACHING_TILE`; `stepOf`; `story.sliders(step)` (the read-only accessor) and `ocean.teachT`; the `ocean:slider` document event (`detail: { step, id, value }`); the slots `figure.chart[data-chart="frequency"]` and `[data-chart="fourier"]`; `mountFrequencyCharts({ story, ocean, onLayout })`; style.css's chart classes (`chart-plot`, `chart-grid`, `chart-text`, `chart-line`).
- Produces: `frequencyMath.js` exports `SAMPLES` (256), `TONES`, `lineProfile(waves, t, out?)`, `forward(signal) -> { re, im }`, `inverse({ re, im }) -> Float64Array`, `amplitudes({ re, im }) -> Float64Array(SAMPLES / 2 + 1)`, `bankSpikes(waves) -> [{ n, amplitude }]`, `peaks(amplitudes, floor?) -> number[]`, `chord(notes) -> { chord, rebuilt, before, after }`; `window.__frequency` hooks `{ drawn(), frequency(), fourier() }`.

- [ ] **Step 1: Make the lane's worktree**

```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git worktree add /Users/cole/Projects/Wesbite-ocean-c2-e -b ocean-c2-e c2-contract
```
```bash
ln -s /Users/cole/Projects/Wesbite-ocean/node_modules /Users/cole/Projects/Wesbite-ocean-c2-e/node_modules && cd /Users/cole/Projects/Wesbite-ocean-c2-e && git log --oneline -1 && node --test tests/ocean/stages/steps.test.js
```
Expected: the contract commit, 3 passing tests. Lane E works in `/Users/cole/Projects/Wesbite-ocean-c2-e` with `OCEAN_PORT=8785`.

- [ ] **Step 2: Write the failing maths test**

Create `tests/ocean/page/frequencyMath.test.js`:
```js
// The frequency charts' arithmetic (piece C2, lane E; spec 10.7 steps 14 and 15): one tile of the
// flat graph's waves, its spectrum through the engine's own FFT, and a chord taken apart and rebuilt.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { SAMPLES, TONES, amplitudes, bankSpikes, chord, forward, inverse, lineProfile, peaks } from '../../../content/ocean/js/page/frequencyMath.js';

const line = (count) => WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), 0), count);

test('a pure sine of n cycles and height A is one spike of height A at n', () => {
	const signal = Float64Array.from({ length: SAMPLES }, (_, m) => 1.7 * Math.sin((2 * Math.PI * 9 * m) / SAMPLES + 0.4));
	const a = amplitudes(forward(signal));
	expect.equal(a.length, SAMPLES / 2 + 1, 'up to the Nyquist bin');
	expect.near(a[9], 1.7, 1e-9, 'the spike');
	for (let k = 0; k < a.length; k++) if (k !== 9) expect.near(a[k], 0, 1e-9, `bin ${k}`);
	expect.equal(peaks(a).join(','), '9', 'one peak');
});

test('forward then inverse gives the signal back', () => {
	const signal = lineProfile(line(6), 3.3);
	const back = inverse(forward(signal));
	for (let m = 0; m < SAMPLES; m++) expect.near(back[m], signal[m], 1e-12, `sample ${m}`);
});

test("the flat graph's waves are spikes at their own lattice frequencies, with their own heights", () => {
	for (const count of [1, 2, 4]) {
		const waves = line(count);
		const spikes = bankSpikes(waves);
		expect.equal(spikes.length, count, `${count} waves`);
		const a = amplitudes(forward(lineProfile(waves, 5.5)));
		const bins = new Set(spikes.map((s) => s.n));
		expect.equal(bins.size, count, 'the first waves sit on different bins');
		expect.equal(peaks(a).join(','), [...bins].sort((x, y) => x - y).join(','), `the spectrum finds exactly them at ${count}`);
		for (const spike of spikes) expect.near(a[spike.n], spike.amplitude, 1e-9, `the spike at ${spike.n}`);
	}
});

test('the chord: all tones rebuild it exactly; a tone switched off is gone from both pictures', () => {
	const all = chord([true, true, true]);
	for (let m = 0; m < SAMPLES; m++) expect.near(all.rebuilt[m], all.chord[m], 1e-12, `sample ${m}`);
	expect.equal(peaks(all.before).join(','), TONES.map((t) => t.cycles).join(','), 'three spikes');
	const without = chord([true, false, true]);
	expect.near(without.after[TONES[1].cycles], 0, 1e-12, 'the middle spike gone');
	expect.near(without.after[TONES[0].cycles], TONES[0].amplitude, 1e-9, 'the low one kept');
	const middle = (m) => TONES[1].amplitude * Math.sin((2 * Math.PI * TONES[1].cycles * m) / SAMPLES + 0.6);
	for (let m = 0; m < SAMPLES; m += 7) expect.near(without.rebuilt[m], all.chord[m] - middle(m), 1e-9, `sample ${m}`);
});
```

Run: `node --test tests/ocean/page/frequencyMath.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Write `frequencyMath.js`**

```js
// The arithmetic behind steps 14 and 15's charts (piece C2; lane E owns this file; spec 10.7;
// browser-free). One 256-stud tile of the flat graph's curve, sampled a stud apart along z from the
// engine's own WaveSampler over the bank laid along one axis (spread 0: every wavenumber on the
// tile's lattice, so the tile holds whole cycles and each wave is exactly one spike). Its spectrum
// comes from the engine's FFT twin (core/fft.js), which computes the inverse transform
// x[m] = sum X[k] e^{+2 pi i k m / N}: for a real signal the forward one is its conjugate over N.
// The chord is three fixed tones (TONES) summed; switching a tone off zeroes its two bins and the
// inverse transform rebuilds what is left. Nothing here is drawn by hand.
import * as FFT from '../core/fft.js';
import * as WaveSampler from '../core/waveSampler.js';
import { TEACHING_TILE } from '../engine/waveBanks.js';

export const SAMPLES = 256;
// Whole cycles across the window, so each tone is one bin; phases fixed so the chord never changes.
export const TONES = Object.freeze([
	Object.freeze({ cycles: 3, amplitude: 1, phase: 0 }),
	Object.freeze({ cycles: 7, amplitude: 0.6, phase: 0.6 }),
	Object.freeze({ cycles: 12, amplitude: 0.4, phase: 1.2 }),
]);
const PLAN = FFT.plan(SAMPLES);
const SAMPLE = new Float64Array(7);
const STRIDE = WaveSampler.STRIDE;
const UNIT = (2 * Math.PI) / TEACHING_TILE;
// Below this a bin counts as empty (the FFT's rounding is near 1e-15 of the signal).
export const FLOOR = 1e-6;

/** The surface's height along x = 0 for z = 0 .. 255 studs, at time t (chop 0, as the graph steps run). */
export function lineProfile(waves, t, out = new Float64Array(SAMPLES)) {
	for (let m = 0; m < SAMPLES; m++) {
		out[m] = WaveSampler.sample(waves.packed, waves.count, t, 0, (m * TEACHING_TILE) / SAMPLES, 0, waves.weights, 0, SAMPLE)[1];
	}
	return out;
}

/** X[k] = (1 / N) sum x[m] e^{-2 pi i k m / N}, for a real signal. */
export function forward(signal) {
	const re = Float64Array.from(signal);
	const im = new Float64Array(SAMPLES);
	FFT.inverse1D(PLAN, re, im, 0, 1);
	for (let k = 0; k < SAMPLES; k++) {
		re[k] /= SAMPLES;
		im[k] = -im[k] / SAMPLES;
	}
	return { re, im };
}

/** The signal back from forward's spectrum (its real part). */
export function inverse({ re, im }) {
	const r = Float64Array.from(re);
	const i = Float64Array.from(im);
	FFT.inverse1D(PLAN, r, i, 0, 1);
	return r;
}

/** Each frequency's height: |X0| at 0, 2|Xk| up to the Nyquist bin, |X(N/2)| there. */
export function amplitudes({ re, im }) {
	const half = SAMPLES / 2;
	const out = new Float64Array(half + 1);
	for (let k = 0; k <= half; k++) {
		const magnitude = Math.hypot(re[k], im[k]);
		out[k] = k === 0 || k === half ? magnitude : 2 * magnitude;
	}
	return out;
}

/** The bins above FLOOR (bin 0 excluded: a teaching sea has no mean height). */
export function peaks(heights, floor = FLOOR) {
	const found = [];
	for (let k = 1; k < heights.length; k++) if (heights[k] > floor) found.push(k);
	return found;
}

/** Where each summed wave of a bank laid along one axis should spike, and how tall. */
export function bankSpikes(waves) {
	const spikes = [];
	for (let wave = 0; wave < waves.count; wave++) {
		const o = wave * STRIDE;
		const amplitude = waves.packed[o + 2] * waves.weights[wave];
		if (amplitude === 0) continue;
		spikes.push({ n: Math.round((waves.packed[o] * waves.packed[o + 5]) / UNIT), amplitude });
	}
	return spikes;
}

/** The three tones summed, and rebuilt with the ones switched off removed from the spectrum. */
export function chord(notes) {
	const signal = new Float64Array(SAMPLES);
	for (const tone of TONES) {
		for (let m = 0; m < SAMPLES; m++) signal[m] += tone.amplitude * Math.sin((2 * Math.PI * tone.cycles * m) / SAMPLES + tone.phase);
	}
	const spectrum = forward(signal);
	const kept = { re: Float64Array.from(spectrum.re), im: Float64Array.from(spectrum.im) };
	TONES.forEach((tone, i) => {
		if (notes[i]) return;
		for (const bin of [tone.cycles, SAMPLES - tone.cycles]) {
			kept.re[bin] = 0;
			kept.im[bin] = 0;
		}
	});
	return { chord: signal, rebuilt: inverse(kept), before: amplitudes(spectrum), after: amplitudes(kept) };
}
```
The test's `middle(m)` uses phase 0.6 for the middle tone: `TONES[1].phase` is 0.6.

Run: `node --test tests/ocean/page/frequencyMath.test.js`
Expected: PASS.

- [ ] **Step 4: Write the failing browser test**

Create `tests/ocean/e2e/frequency.spec.js`:
```js
// Steps 14 and 15's charts in the browser (piece C2, lane E; spec 10.7): the flat graph's waves as
// spikes from the engine's FFT, following the wave slider; the chord, a tone switched off and rebuilt.
import { test, expect } from '@playwright/test';
import * as WaveBanks from '../../../content/ocean/js/engine/waveBanks.js';
import { bankSpikes } from '../../../content/ocean/js/page/frequencyMath.js';
import { watchErrors } from './helpers/stage.js';
import { oceanRunning, scrollToId } from './helpers/story.js';

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

const expectedPeaks = (count) => [...new Set(bankSpikes(WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), 0), count)).map((s) => s.n))].sort((a, b) => a - b);

test('step 14: one spike per wave of the graph, where the bank puts it, following the slider', async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'frequency', 0.2);
	const figure = page.locator('figure[data-chart="frequency"] .chart-body svg');
	await expect(figure).toHaveCount(1, { timeout: 30_000 });
	await expect.poll(() => page.evaluate(() => window.__frequency.frequency().peaks)).toEqual(expectedPeaks(4));
	await page.locator('section[data-step-id="frequency"] [data-slider="waveCount"] input').fill('2');
	await expect.poll(() => page.evaluate(() => window.__frequency.frequency().peaks)).toEqual(expectedPeaks(2));
	expect(await page.locator('figure[data-chart="frequency"] .chart-spike').count()).toBe(2);
});

test('step 15: three tones; switch one off and the chord is rebuilt without it', async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'fourier', 0.2);
	await expect(page.locator('figure[data-chart="fourier"] .chart-body svg')).toHaveCount(1, { timeout: 30_000 });
	expect(await page.evaluate(() => window.__frequency.fourier().notes)).toEqual([true, true, true]);
	const before = await page.locator('figure[data-chart="fourier"] .chart-rebuilt').getAttribute('d');
	await page.locator('section[data-step-id="fourier"] [data-slider="note2"] input').click();
	await expect.poll(() => page.evaluate(() => window.__frequency.fourier().notes)).toEqual([true, false, true]);
	await expect(page.locator('figure[data-chart="fourier"] .chart-spike-removed')).toHaveCount(1);
	expect(await page.locator('figure[data-chart="fourier"] .chart-rebuilt').getAttribute('d')).not.toBe(before);
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test('both charts fit their panel, every label inside its drawing', async ({ page }) => {
		test.setTimeout(180_000);
		await oceanRunning(page);
		for (const id of ['frequency', 'fourier']) {
			await scrollToId(page, id, 0.2);
			const name = id === 'frequency' ? 'frequency' : 'fourier';
			await expect(page.locator(`figure[data-chart="${name}"] svg`)).toHaveCount(1, { timeout: 30_000 });
			const outside = await page.evaluate((chart) => {
				const svg = document.querySelector(`figure[data-chart="${chart}"] svg`);
				const box = svg.viewBox.baseVal;
				// The rotated axis names are measured before their rotation by getBBox: skip them.
				return [...svg.querySelectorAll('text:not([transform])')].filter((t) => {
					const b = t.getBBox();
					return b.x < box.x - 0.5 || b.y < box.y - 0.5 || b.x + b.width > box.width + 0.5 || b.y + b.height > box.height + 0.5;
				}).map((t) => t.textContent);
			}, name);
			expect(outside).toEqual([]);
		}
		expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)).toBe(true);
	});
});
```

Run: `OCEAN_PORT=8785 npm run test:ocean:e2e -- tests/ocean/e2e/frequency.spec.js`
Expected: FAIL (the stub draws nothing; `window.__frequency.frequency` is not a function).

- [ ] **Step 5: Draw the charts**

Replace `content/ocean/js/ui/frequencyCharts.js`:
```js
// The frequency-domain charts of steps 14 and 15 (piece C2; lane E owns this file; spec 10.7), inline
// SVG in the page's chart tokens, drawn from page/frequencyMath.js (the engine's own sampler and FFT
// twin, nothing by hand).
//   frequency (step 14): the flat graph's waves over one tile on top (the same bank the canvas draws:
//     the teaching bank laid along one axis, as many waves as step 14's slider says, at the ocean's
//     time when drawn), and underneath the same signal as spikes, one per wave at how many times it
//     repeats across the tile, from the FFT. Redrawn when the slider moves and when the chart comes on
//     screen.
//   fourier (step 15): the three tones summed into a chord (faint) and the chord rebuilt from what is
//     left (bold) when a tone is switched off; underneath the three spikes, a switched-off one dashed.
// The numbers on the axes are computed here, so they sit in .chart-body[data-copy-skip="live"]; the
// figcaptions outside are copy (lane G). Each SVG is drawn one unit per CSS pixel of its width.
import * as WaveBanks from '../engine/waveBanks.js';
import { SAMPLES, TONES, amplitudes, chord, forward, lineProfile, peaks } from '../page/frequencyMath.js';
import { stepOf } from '../stages/steps.js';

const NS = 'http://www.w3.org/2000/svg';
const HEIGHT = 300;
const PAD = Object.freeze({ left: 44, right: 12, top: 12, bottom: 34 });
const GAP = 40; // between the two plots
const MAX_BIN = 32; // the spikes axis runs to this many cycles per tile
const MIN_WIDTH = 240;
const FALLBACK_WIDTH = 320;

function svg(tag, attributes = {}, text = null) {
	const node = document.createElementNS(NS, tag);
	for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
	if (text !== null) node.textContent = text;
	return node;
}

function widthOf(figure) {
	const width = Math.round(figure.querySelector('.chart-body').clientWidth);
	return width > 0 ? Math.max(width, MIN_WIDTH) : FALLBACK_WIDTH;
}

// The two plots' boxes for a chart `width` wide.
function boxes(width) {
	const inner = (HEIGHT - PAD.top - PAD.bottom - GAP) / 2;
	const top = { left: PAD.left, right: width - PAD.right, top: PAD.top, bottom: PAD.top + inner };
	const bottom = { left: PAD.left, right: width - PAD.right, top: top.bottom + GAP, bottom: HEIGHT - PAD.bottom };
	return { top, bottom };
}

function frame(root, box, label) {
	root.append(svg('rect', { class: 'chart-plot', x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top }));
	const middle = (box.top + box.bottom) / 2;
	root.append(svg('text', { class: 'chart-text', x: 12, y: middle, transform: `rotate(-90 12 ${middle})`, 'text-anchor': 'middle' }, label));
}

// A polyline of `values` across the box, scaled so +-range fills its height.
function trace(values, box, range) {
	const scaleY = (box.bottom - box.top) / 2 / range;
	const middle = (box.top + box.bottom) / 2;
	let d = '';
	for (let m = 0; m < values.length; m++) {
		const x = box.left + ((box.right - box.left) * m) / (values.length - 1);
		d += `${m === 0 ? 'M' : 'L'}${x.toFixed(1)} ${(middle - values[m] * scaleY).toFixed(1)}`;
	}
	return d;
}

// Spikes for bins 1..MAX_BIN; `kept` says which heights are drawn filled, `removed` dashed.
function spikes(root, box, heights, removed = []) {
	const tallest = Math.max(...Array.from(heights).slice(1, MAX_BIN + 1), ...removed.map((r) => r.height), 1e-9);
	const x = (bin) => box.left + ((box.right - box.left) * bin) / (MAX_BIN + 1);
	const y = (height) => box.bottom - ((box.bottom - box.top) * height) / (tallest * 1.1);
	for (const bin of [0, 8, 16, 24, 32]) {
		root.append(svg('line', { class: 'chart-grid', x1: x(bin), x2: x(bin), y1: box.top, y2: box.bottom }));
		root.append(svg('text', { class: 'chart-text', x: x(bin), y: box.bottom + 14, 'text-anchor': 'middle' }, String(bin)));
	}
	for (const bin of peaks(heights)) {
		if (bin > MAX_BIN) continue;
		root.append(svg('line', { class: 'chart-spike', x1: x(bin), x2: x(bin), y1: box.bottom, y2: y(heights[bin]) }));
	}
	for (const r of removed) {
		root.append(svg('line', { class: 'chart-spike-removed', x1: x(r.bin), x2: x(r.bin), y1: box.bottom, y2: y(r.height) }));
	}
	root.append(svg('text', { class: 'chart-text', x: (box.left + box.right) / 2, y: HEIGHT - 6, 'text-anchor': 'middle' }, 'times it repeats across the tile'));
}

function canvasFor(figure, width, label) {
	const root = svg('svg', { viewBox: `0 0 ${width} ${HEIGHT}`, role: 'img', 'aria-label': label });
	figure.querySelector('.chart-body').replaceChildren(root);
	return root;
}

function frequencyChart(figure, story, ocean, onLayout) {
	const step = stepOf('frequency');
	let state = { count: 0, peaks: [] };
	let drawnOnce = false;
	function draw() {
		const count = story.sliders(step).find((s) => s.id === 'waveCount').value;
		const waves = WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), 0), count);
		const profile = lineProfile(waves, ocean.teachT);
		const heights = amplitudes(forward(profile));
		const width = widthOf(figure);
		const { top, bottom } = boxes(width);
		const root = canvasFor(figure, width, 'The waves of the flat graph over one tile, and the same waves as spikes, one for each wave at how many times it repeats across the tile');
		frame(root, top, 'height');
		frame(root, bottom, 'size');
		const range = Math.max(...profile.map(Math.abs), 1e-9) * 1.15;
		root.append(svg('path', { class: 'chart-line', d: trace(profile, top, range) }));
		root.append(svg('text', { class: 'chart-text', x: (top.left + top.right) / 2, y: top.bottom + 14, 'text-anchor': 'middle' }, 'along one tile'));
		spikes(root, bottom, heights);
		state = { count, peaks: peaks(heights) };
		if (!drawnOnce) {
			drawnOnce = true;
			onLayout();
		}
	}
	return { draw, state: () => state };
}

function fourierChart(figure, story, onLayout) {
	const step = stepOf('fourier');
	let state = { notes: [true, true, true] };
	let drawnOnce = false;
	function draw() {
		const values = story.sliders(step);
		const notes = ['note1', 'note2', 'note3'].map((id) => values.find((s) => s.id === id).value);
		const result = chord(notes);
		const width = widthOf(figure);
		const { top, bottom } = boxes(width);
		const root = canvasFor(figure, width, 'Three tones summed into a chord, and the chord rebuilt from the tones still switched on, with each tone as a spike underneath');
		frame(root, top, 'sound');
		frame(root, bottom, 'size');
		const range = Math.max(...result.chord.map(Math.abs), 1e-9) * 1.15;
		root.append(svg('path', { class: 'chart-line-faint', d: trace(result.chord, top, range) }));
		root.append(svg('path', { class: 'chart-line chart-rebuilt', d: trace(result.rebuilt, top, range) }));
		const removed = TONES.map((tone, i) => (notes[i] ? null : { bin: tone.cycles, height: result.before[tone.cycles] })).filter(Boolean);
		spikes(root, bottom, result.after, removed);
		state = { notes };
		if (!drawnOnce) {
			drawnOnce = true;
			onLayout();
		}
	}
	return { draw, state: () => state };
}

// Runs a chart's drawing, logging a throw so one chart's fault never stops the other.
function safely(name, work) {
	try {
		work();
	} catch (error) {
		console.error(`[ocean] the ${name} chart failed`, error);
	}
}

export function mountFrequencyCharts({ story, ocean, onLayout = () => {} }) {
	const charts = {};
	const frequencyFigure = document.querySelector('figure.chart[data-chart="frequency"]');
	const fourierFigure = document.querySelector('figure.chart[data-chart="fourier"]');
	if (frequencyFigure) charts.frequency = { figure: frequencyFigure, chart: frequencyChart(frequencyFigure, story, ocean, onLayout), step: stepOf('frequency') };
	if (fourierFigure) charts.fourier = { figure: fourierFigure, chart: fourierChart(fourierFigure, story, onLayout), step: stepOf('fourier') };
	const drawn = new Set();
	const draw = (name) => safely(name, () => {
		charts[name].chart.draw();
		drawn.add(name);
	});
	for (const [name, { figure }] of Object.entries(charts)) {
		new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) draw(name);
		}).observe(figure);
		if (typeof ResizeObserver === 'function') {
			let width = 0;
			new ResizeObserver(([entry]) => {
				const next = Math.round(entry.contentRect.width);
				if (width !== 0 && next !== width) draw(name);
				width = next;
			}).observe(figure.querySelector('.chart-body'));
		}
	}
	// A slider on step 14 or 15 that really changed redraws its chart, once per frame of changes.
	let queued = new Set();
	document.addEventListener('ocean:slider', (event) => {
		const entry = Object.entries(charts).find(([, c]) => c.step === event.detail.step);
		if (!entry) return;
		if (queued.size === 0) {
			requestAnimationFrame(() => {
				const names = queued;
				queued = new Set();
				for (const name of names) draw(name);
			});
		}
		queued.add(entry[0]);
	});
	return Object.freeze({
		hooks: Object.freeze({
			drawn: () => [...drawn],
			frequency: () => charts.frequency?.chart.state() ?? null,
			fourier: () => charts.fourier?.chart.state() ?? null,
		}),
	});
}
```

Replace `content/ocean/css/frequency.css`:
```css
/* The frequency charts of steps 14 and 15 (piece C2; lane E owns this file). The plots, grid, text
   and lines are style.css's chart classes; these are the spikes and the chord's faint original. */
.chart-spike {
	stroke: var(--chart-a);
	stroke-width: 3;
	stroke-linecap: round;
}

.chart-spike-removed {
	stroke: var(--chart-b);
	stroke-width: 2;
	stroke-dasharray: 3 3;
}

.chart-line-faint {
	fill: none;
	stroke: var(--ink-dim);
	stroke-width: 1.5;
	opacity: 0.55;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/ocean/page/frequencyMath.test.js && OCEAN_PORT=8785 npm run test:ocean:e2e -- tests/ocean/e2e/frequency.spec.js tests/ocean/e2e/copy.spec.js`
Expected: PASS (the charts' numbers sit in the live regions; the copy check passes).

- [ ] **Step 7: Commit**

```bash
git add content/ocean/js/page/frequencyMath.js content/ocean/js/ui/frequencyCharts.js content/ocean/css/frequency.css tests/ocean/page/frequencyMath.test.js tests/ocean/e2e/frequency.spec.js
```
```bash
git commit -m "feat: the frequency charts: the graph's waves as spikes, and a chord taken apart and rebuilt, by the engine's FFT"
```

### Task 9: The arrows held still then turning, choppiness from the side, and chapter four's shots

**Files:**
- Modify: `content/ocean/js/ui/charts.js`, `content/ocean/js/stages/chapters/realOcean.js`, `tests/ocean/e2e/charts.spec.js`, `tests/ocean/e2e/frequency.spec.js`

**Interfaces:**
- Consumes: Task 0's `story.charts.phaseArrows(t = ocean.t)`, the two phase figures (`data-motion="still"` in step 17, `"turning"` in step 18), `BY_STEP` keyed by `stepOf`; `stage(page, 'surface')` (`maxLateral`), `grid`, `meanDiff` (helpers/stage.js).
- Produces: `mountCharts` drawing every `figure.chart[data-chart]`, phase charts per figure by their motion; the `charts` hooks unchanged (`useTransforms`).

- [ ] **Step 1: Write the failing tests**

In `tests/ocean/e2e/charts.spec.js`, every selector for the phase chart (`figure.chart[data-chart="phase"]`) names its figure: the turning one `figure.chart[data-chart="phase"][data-motion="turning"]` (in step `time`), and its tests scroll to `time`. Then append:
```js
test("step 17's arrows are held still at their starting angles; step 18's turn", async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	const ends = (motion) => page.evaluate((m) => [...document.querySelectorAll(`figure[data-chart="phase"][data-motion="${m}"] line.chart-arrow`)].map((l) => `${l.getAttribute('x2')},${l.getAttribute('y2')}`), motion);
	await scrollToId(page, 'random-sea', 0.2);
	await expect.poll(async () => (await ends('still')).length, { timeout: 30_000 }).toBe(8);
	const held = await ends('still');
	await waitFrames(page, 45);
	expect(await ends('still')).toEqual(held);
	await scrollToId(page, 'time', 0.2);
	await expect.poll(async () => (await ends('turning')).length, { timeout: 30_000 }).toBe(8);
	const first = await ends('turning');
	await waitFrames(page, 45);
	expect(await ends('turning')).not.toEqual(first);
});
```
(Import `scrollToId` from `./helpers/story.js` and `waitFrames` from `./helpers/stage.js` if the file does not already have them.)

Append to `tests/ocean/e2e/frequency.spec.js`:
```js
import { grid, load, meanDiff, stage, waitFrames } from './helpers/stage.js';

const VISIBLE = 3; // mean luminance change for a slider whose whole lesson is the change it makes

test("step 20: choppiness pushes the FFT sea sideways, visibly, from the side", async ({ page }) => {
	test.setTimeout(240_000);
	await load(page, 'step=choppiness&freeze=12&s.chop=0', 60);
	expect((await stage(page, 'surface')).maxLateral).toBe(0);
	const flat = await grid(page);
	const slider = (await stage(page, 'sliders')).find((s) => s.id === 'chop');
	await stage(page, 'setSlider', 'chop', slider.default);
	await waitFrames(page, 30);
	expect((await stage(page, 'surface')).maxLateral).toBeGreaterThan(0.1);
	const middle = await grid(page);
	expect(meanDiff(flat, middle)).toBeGreaterThan(VISIBLE);
	await stage(page, 'setSlider', 'chop', slider.max);
	await waitFrames(page, 30);
	expect(meanDiff(middle, await grid(page))).toBeGreaterThan(VISIBLE);
});
```
(Merge the import into the file's existing import from `./helpers/stage.js`.)

Run: `OCEAN_PORT=8785 npm run test:ocean:e2e -- tests/ocean/e2e/charts.spec.js tests/ocean/e2e/frequency.spec.js`
Expected: the still-arrows test FAILS (the step-17 figure is empty: `mountCharts` keeps one figure per chart name). The choppiness test may pass or fail on Task 0's shot; it guards Step 3.

- [ ] **Step 2: Every figure gets its chart; the still arrows**

In `content/ocean/js/ui/charts.js`:
- `phaseChart(figure, story, onLayout)` reads `const motion = figure.dataset.motion === 'still' ? 'still' : 'turning';`. In `turn()`, `const waves = motion === 'still' ? story.charts.phaseArrows(0) : story.charts.phaseArrows();`. The visibility hook starts the loop only for `'turning'`; for `'still'` it calls `turn()` once on show. In `build`, the aria label and note for `'still'` read: label `The ${waves.length} tallest waves of the 256-stud layer as arrows, held at their starting angles: each wave's random height and phase`, note `Computed from the sea on screen. Each arrow is one wave: its angle is the wave's starting phase, and its length is half that wave's crest height above the mean level, scaled so the longest arrow (${tallest.toFixed(2)} studs) fills its ring. Labels are wavelengths in studs.` (both inside `.chart-body`, a live region).
- `mountCharts`: build one chart per figure:
```js
	const all = [...document.querySelectorAll('figure.chart[data-chart]')];
	const MAKERS = { spectrum: spectrumChart, phase: phaseChart, transforms: transformChart };
	// name -> the charts drawn under that name (two phase charts: steps 17 and 18).
	const charts = { spectrum: [], phase: [], transforms: [] };
	for (const figure of all) {
		const name = figure.dataset.chart;
		if (!MAKERS[name]) continue;
		const chart = safely(name, () => MAKERS[name](figure, story, onLayout));
		if (chart) charts[name].push({ figure, chart });
	}
	const each = (name, fn) => charts[name].forEach(({ chart }) => safely(name, () => fn(chart)));
```
and use `each(name, (c) => c.draw())` wherever a single chart was drawn (`drawSpectrum`, the queued redraws, `redraw()` with `{ force: true }`), `charts.transforms[0]?.chart.useTransforms(fn)` in the hook, and `watchWidth` over `all` mapping each body back to its own chart. The figures the page does not use (lanes E's own `frequency` and `fourier`) are skipped by the `MAKERS` check.
- Header: "the phase arrows (steps 17 and 18): held still at their starting angles in step 17's figure (`data-motion="still"`), turning in step 18's".

- [ ] **Step 3: Tune chapter four's shots**

Capture them:
```bash
(OCEAN_PORT=8785 npm run serve:ocean >/dev/null 2>&1 &) && sleep 2 && for q in '' 'tier=Medium'; do OCEAN_PORT=8785 node scripts/ocean-stage-capture.mjs /private/tmp/c2-real 0 "$q" frequency,fourier,jonswap,random-sea,time,fft,choppiness,layers; done && for c in 0 2; do OCEAN_PORT=8785 node scripts/ocean-stage-capture.mjs /private/tmp/c2-real 0 "s.chop=$c" choppiness; done; pkill -f "http.server 8785"
```
Judge: step 20's frame looks across the crests so the push reads (like piece C's step 5: a side-on view of a few crests at mid distance); steps 16 to 19 read without chop. Change only `realOcean.js` (shots, slider defaults and ranges). Then:
```bash
node --test tests/ocean/stages/clearance.test.js tests/ocean/stages/shots.test.js tests/ocean/page/orbitLimits.test.js tests/ocean/stages/recipes.test.js tests/ocean/page/knobs.test.js
```
Expected: PASS (the URL `chop` knob is held to step 20's slider range: keep its 0 to 2).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `OCEAN_PORT=8785 npm run test:ocean:e2e -- tests/ocean/e2e/charts.spec.js tests/ocean/e2e/frequency.spec.js tests/ocean/e2e/stageSteps.spec.js`
Expected: PASS. If the choppiness frame changes less than `VISIBLE`, report the measured values for each half of the slider.

- [ ] **Step 5: Run the suites and commit**

```bash
ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -3 && OCEAN_PORT=8785 npm run test:ocean:e2e 2>&1 | tail -5
```
Expected: all pass.
```bash
git add content/ocean/js/ui/charts.js content/ocean/js/stages/chapters/realOcean.js tests/ocean/e2e/charts.spec.js tests/ocean/e2e/frequency.spec.js
```
```bash
git commit -m "feat: the phase arrows held still then turning, and choppiness seen from the side"
```

---

## Wave 1, lane F: the texture insets (worktree `Wesbite-ocean-c2-f`, branch `ocean-c2-f`, port 8786)

### Task 10: The field images and the sampling inset

**Files:**
- Create: `content/ocean/js/page/fieldViews.js`, `tests/ocean/page/fieldViews.test.js`, `tests/ocean/e2e/insets.spec.js`
- Modify: `content/ocean/js/ui/insets.js`, `content/ocean/css/insets.css`

**Interfaces:**
- Consumes: `handle.ocean.store.display` (FieldStore display fields: `{ n, size, height, dispX, dispZ, slopeX, slopeZ, ... }`, cascade 1 at `[0]`, on every tier), `handle.ocean.teachT`; `Cascade.sampleHeight(fields, x, z, out)` (core/cascade.js: the engine's bilinear sampler, wrapping at the patch size); `stepOf`; `watchReading`; the slots `figure.inset[data-inset="fields"]` and `[data-inset="sampling"]` with `.inset-body[data-copy-skip="live"]`; `mountInsets({ handle, watchReading, onLayout })`.
- Produces: `fieldViews.js` exports `FIELD_VIEWS`, `ZOOM` (6), `fieldToRgba(values, out) -> { min, max }`, `bilinear(fields, x, z) -> { column, row, column1, row1, fu, fv, indices, weights, value }`, `zoomWindow(fields, x, z, out) -> { first: [column, row], wraps }`, `walkPoint(t, size, out?) -> [x, z]`, `downsample(src, srcTexels, out, outTexels)`; `window.__insets` hooks `{ drawn(), fields(), sampling(), painted() }` (Task 11 fills `painted`).

- [ ] **Step 1: Make the lane's worktree**

```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git worktree add /Users/cole/Projects/Wesbite-ocean-c2-f -b ocean-c2-f c2-contract
```
```bash
ln -s /Users/cole/Projects/Wesbite-ocean/node_modules /Users/cole/Projects/Wesbite-ocean-c2-f/node_modules && cd /Users/cole/Projects/Wesbite-ocean-c2-f && git log --oneline -1 && node --test tests/ocean/stages/steps.test.js
```
Expected: the contract commit, 3 passing tests. Lane F works in `/Users/cole/Projects/Wesbite-ocean-c2-f` with `OCEAN_PORT=8786`.

- [ ] **Step 2: Write the failing model test**

Create `tests/ocean/page/fieldViews.test.js`:
```js
// The texture insets' arithmetic (piece C2, lane F; spec 10.7 steps 22, 23 and 25): a field as an
// image, the bilinear blend the engine's sampler does (wrap included), the zoom window round a point,
// the point's walk across the tile's edge, and a texture shrunk for the painted-map inset.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Cascade from '../../../content/ocean/js/core/cascade.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import { FIELD_VIEWS, ZOOM, bilinear, downsample, fieldToRgba, walkPoint, zoomWindow } from '../../../content/ocean/js/page/fieldViews.js';

// A 64 x 64, 256-stud field with a different, deterministic value in every cell.
function field() {
	const fields = FieldStore.newFields(64, 256);
	for (let i = 0; i < 64 * 64; i++) {
		fields.height[i] = Math.sin(i * 0.37) * 2 + Math.cos(i * 0.011);
		fields.dispX[i] = Math.sin(i * 0.05);
		fields.slopeX[i] = Math.cos(i * 0.21) * 0.3;
	}
	return fields;
}

test('a field as an image: zero is the pale middle, the extremes blue and amber, a flat field no NaN', () => {
	const values = Float32Array.from([-2, 0, 1, 2]);
	const out = new Uint8ClampedArray(16);
	expect.equal(JSON.stringify(fieldToRgba(values, out)), JSON.stringify({ min: -2, max: 2 }), 'range');
	expect.equal(Array.from(out.subarray(4, 8)).join(','), '232,238,242,255', 'zero');
	expect.truthy(out[2] > out[0], 'negative is blue');
	expect.truthy(out[12] > out[14], 'positive is amber');
	const flat = new Uint8ClampedArray(16);
	fieldToRgba(new Float32Array(4), flat);
	expect.truthy(Array.from(flat).every(Number.isFinite), 'a flat field is finite');
	expect.equal(FIELD_VIEWS.map((v) => v.name).join(','), 'height,slopeX,dispX', 'the three fields');
});

test("the blend is the engine's sampler, value for value, across the tile's edges and below zero", () => {
	const fields = field();
	const out = new Float64Array(3);
	for (const [x, z] of [[10.3, 77.9], [255.99, 3.1], [0, 0], [-3.2, -250.5], [127.5, 255.999], [512.25, 64.75]]) {
		const blend = bilinear(fields, x, z);
		expect.near(blend.value, Cascade.sampleHeight(fields, x, z, out)[0], 1e-12, `at ${x}, ${z}`);
		expect.near(blend.weights.reduce((a, b) => a + b, 0), 1, 1e-12, `weights sum at ${x}, ${z}`);
	}
	const edge = bilinear(fields, 255.99, 3.1);
	expect.equal(edge.column, 63, 'the last column');
	expect.equal(edge.column1, 0, 'wraps to the first');
});

test('the zoom window wraps its indices, and the walk crosses the tile edge back and forth', () => {
	const fields = field();
	const out = new Float64Array(ZOOM * ZOOM);
	const window = zoomWindow(fields, 255, 128, out);
	expect.equal(window.wraps, true, 'the window round the edge wraps');
	expect.equal(window.first[0], 61, 'starts two columns before the point');
	expect.equal(out[0 * ZOOM + 3], fields.height[window.first[1] * 64 + 0], 'its fourth column is column 0');
	const sides = new Set();
	for (let t = 0; t < 8; t += 0.1) sides.add(walkPoint(t, 256)[0] > 128 ? 'end' : 'start');
	expect.equal([...sides].sort().join(','), 'end,start', 'both sides of the edge within eight seconds');
	expect.truthy([0, 1, 2, 3].every((t) => { const [x, z] = walkPoint(t, 256); return x >= 0 && x < 256 && z >= 0 && z < 256; }), 'inside the tile');
});

test('downsample averages blocks, keeping a flat colour flat', () => {
	const src = new Uint8Array(4 * 4 * 4);
	for (let i = 0; i < 16; i++) src.set(i % 2 === 0 ? [0, 100, 200, 255] : [100, 100, 0, 255], i * 4);
	const out = new Uint8ClampedArray(2 * 2 * 4);
	downsample(src, 4, out, 2);
	expect.equal(Array.from(out.subarray(0, 4)).join(','), '50,100,100,255', 'the 2 x 2 average');
	const flat = new Uint8Array(8 * 8 * 4).fill(77);
	const small = new Uint8ClampedArray(4 * 4 * 4);
	downsample(flat, 8, small, 4);
	expect.truthy(Array.from(small).every((v) => v === 77), 'flat stays flat');
});
```

Run: `node --test tests/ocean/page/fieldViews.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Write `fieldViews.js`**

```js
// The texture insets' arithmetic (piece C2; lane F owns this file; spec 10.7 steps 22, 23 and 25;
// browser-free). The FFT's answer is grids of numbers (core/fieldStore.js display fields, n x n per
// layer): fieldToRgba draws one as an image, blue below zero, pale at zero, amber above, scaled to its
// own largest magnitude. bilinear is the blend the engine's sampler does (core/cascade.js corners:
// floored modulo, a hair below zero folded back, the right and bottom neighbours wrapping to column
// and row 0), written out with its corners and weights so the sampling inset can show them; its value
// equals Cascade.sampleHeight's exactly. The sampling inset zooms on a ZOOM x ZOOM window round a
// point that walks back and forth across the tile's edge, so the wrap is always on screen. downsample
// shrinks a painted texture for the painted-map inset by averaging blocks.
import { mod } from '../core/luau.js';

export const FIELD_VIEWS = Object.freeze([
	Object.freeze({ name: 'height', label: 'Height' }),
	Object.freeze({ name: 'slopeX', label: 'Slope along x' }),
	Object.freeze({ name: 'dispX', label: 'Sideways push along x' }),
]);
export const ZOOM = 6;
const PALE = [232, 238, 242]; // style.css --ink
const BLUE = [20, 70, 150];
const AMBER = [242, 178, 92]; // --term-a

/** values (n x n) into RGBA bytes; returns the field's range. */
export function fieldToRgba(values, out) {
	let min = Infinity;
	let max = -Infinity;
	for (let i = 0; i < values.length; i++) {
		if (values[i] < min) min = values[i];
		if (values[i] > max) max = values[i];
	}
	const scale = Math.max(Math.abs(min), Math.abs(max)) || 1;
	for (let i = 0; i < values.length; i++) {
		const t = Math.max(-1, Math.min(1, values[i] / scale));
		const to = t < 0 ? BLUE : AMBER;
		const w = Math.abs(t);
		out[i * 4] = PALE[0] + (to[0] - PALE[0]) * w;
		out[i * 4 + 1] = PALE[1] + (to[1] - PALE[1]) * w;
		out[i * 4 + 2] = PALE[2] + (to[2] - PALE[2]) * w;
		out[i * 4 + 3] = 255;
	}
	return { min, max };
}

/** The engine's bilinear blend of `fields.height` at world offset (x, z), with its working shown. */
export function bilinear(fields, x, z) {
	const n = fields.n;
	let u = mod((x / fields.size) * n, n);
	let v = mod((z / fields.size) * n, n);
	if (u >= n) u -= n;
	if (v >= n) v -= n;
	const column = Math.floor(u);
	const row = Math.floor(v);
	const fu = u - column;
	const fv = v - row;
	const column1 = (column + 1) % n;
	const row1 = (row + 1) % n;
	const indices = [row * n + column, row * n + column1, row1 * n + column, row1 * n + column1];
	const weights = [(1 - fu) * (1 - fv), fu * (1 - fv), (1 - fu) * fv, fu * fv];
	const h = fields.height;
	const value = h[indices[0]] * weights[0] + h[indices[1]] * weights[1] + h[indices[2]] * weights[2] + h[indices[3]] * weights[3];
	return { column, row, column1, row1, fu, fv, indices, weights, value };
}

/** The ZOOM x ZOOM heights round (x, z), two texels before the point's cell, indices wrapped. */
export function zoomWindow(fields, x, z, out) {
	const n = fields.n;
	const { column, row } = bilinear(fields, x, z);
	const first = [mod(column - 2, n), mod(row - 2, n)];
	let wraps = false;
	for (let j = 0; j < ZOOM; j++) {
		for (let i = 0; i < ZOOM; i++) {
			const c = mod(first[0] + i, n);
			const r = mod(first[1] + j, n);
			if (first[0] + i >= n || first[1] + j >= n) wraps = true;
			out[j * ZOOM + i] = fields.height[r * n + c];
		}
	}
	return { first, wraps };
}

/** A point swinging three studs either side of the tile's x edge, about every four seconds. */
export function walkPoint(t, size, out = [0, 0]) {
	out[0] = mod(size + 3 * Math.sin(t * 1.6), size);
	out[1] = size * 0.37;
	return out;
}

/** Shrinks srcTexels x srcTexels RGBA to outTexels x outTexels by averaging square blocks. */
export function downsample(src, srcTexels, out, outTexels) {
	const block = srcTexels / outTexels;
	const area = block * block;
	for (let y = 0; y < outTexels; y++) {
		for (let x = 0; x < outTexels; x++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (let dy = 0; dy < block; dy++) {
				const row = (y * block + dy) * srcTexels;
				for (let dx = 0; dx < block; dx++) {
					const o = (row + x * block + dx) * 4;
					r += src[o];
					g += src[o + 1];
					b += src[o + 2];
					a += src[o + 3];
				}
			}
			const o = (y * outTexels + x) * 4;
			out[o] = r / area;
			out[o + 1] = g / area;
			out[o + 2] = b / area;
			out[o + 3] = a / area;
		}
	}
}
```
In the zoom-window test the point x = 255 on a 256-stud, 64-texel field sits in column 63, so the window starts at column 61 and its fourth column (index 3) is column 0, wrapped.

Run: `node --test tests/ocean/page/fieldViews.test.js`
Expected: PASS.

- [ ] **Step 4: Write the failing browser test**

Create `tests/ocean/e2e/insets.spec.js`:
```js
// The texture insets in the browser (piece C2, lane F; spec 10.7): the 256-stud layer's fields as
// images, the sampling inset's blend matching the engine's sampler with the wrap on screen, the
// painted maps live (Task 11), on the probed tier and on Medium (Review Focus 4, Task 11).
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers/stage.js';
import { oceanRunning, scrollToId } from './helpers/story.js';

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

// How many distinct colours a canvas in the inset holds (a blank one holds one).
const colours = (page, selector) => page.evaluate((s) => {
	const canvas = document.querySelector(s);
	const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
	const seen = new Set();
	for (let i = 0; i < data.length; i += 4) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
	return seen.size;
}, selector);

test("step 22: the 256-stud layer's height, slope and push as live images, with their ranges", async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'fields', 0.2);
	await expect(page.locator('figure[data-inset="fields"] canvas')).toHaveCount(3, { timeout: 30_000 });
	await expect.poll(() => page.evaluate(() => window.__insets.fields()?.height.max ?? 0), { timeout: 30_000 }).toBeGreaterThan(0);
	const fields = await page.evaluate(() => window.__insets.fields());
	for (const name of ['height', 'slopeX', 'dispX']) expect(fields[name].min).toBeLessThan(fields[name].max);
	for (let i = 1; i <= 3; i++) expect(await colours(page, `figure[data-inset="fields"] .inset-field:nth-child(${i}) canvas`)).toBeGreaterThan(50);
});

test("step 23: the blend matches the engine's own sampler, and the point crosses the tile's edge", async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'sampling', 0.2);
	await expect(page.locator('figure[data-inset="sampling"] canvas')).toHaveCount(1, { timeout: 30_000 });
	const seen = new Set();
	for (let i = 0; i < 40; i++) {
		const s = await page.evaluate(() => window.__insets.sampling());
		if (s) {
			expect(Math.abs(s.value - s.engine)).toBeLessThan(1e-6);
			expect(s.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
			seen.add(s.x > 128 ? 'end' : 'start');
		}
		await page.waitForTimeout(250);
	}
	expect([...seen].sort()).toEqual(['end', 'start']);
	await expect(page.locator('figure[data-inset="sampling"] .inset-line')).toContainText('studs');
});
```

Run: `OCEAN_PORT=8786 npm run test:ocean:e2e -- tests/ocean/e2e/insets.spec.js`
Expected: FAIL (the stub draws nothing).

- [ ] **Step 5: Draw the field and sampling insets**

Replace `content/ocean/js/ui/insets.js`:
```js
// The texture insets of steps 22, 23 and 25 (piece C2; lane F owns this file; spec 10.7), drawn into
// 2D canvases from what the engine really holds:
//   fields (step 22): the 256-stud layer's height, slope along x and sideways push along x, straight
//     from the field store's display (the fields the surface is sampled from this frame), each with
//     its live range;
//   sampling (step 23): a zoom on one point among its grid neighbours, the four it blends outlined
//     with their weights, the tile's edge dashed where the window wraps across it, and the blended
//     height beside the engine's own sampler's (page/fieldViews.js bilinear and Cascade.sampleHeight);
//   painted (step 25, Task 11): the painters' colour, glow-mask and ripple maps.
// Each redraws only while on screen: the fields and the painted maps at most four times a second,
// the sampling inset ten. Every number shown is computed in the visitor's browser, inside the
// figure's .inset-body (data-copy-skip="live"); the words beside them carry no digits.
import * as Cascade from '../core/cascade.js';
import { FIELD_VIEWS, ZOOM, bilinear, fieldToRgba, walkPoint, zoomWindow } from '../page/fieldViews.js';

const FIELD_MS = 250;
const SAMPLING_MS = 100;
const SAMPLING_PX = 240;
const AMBER = '#f2b25c';
const INK = '#e8eef2';

function element(tag, props = {}, children = []) {
	const node = document.createElement(tag);
	Object.assign(node, props);
	node.append(...children);
	return node;
}

const studs = (value) => `${value.toFixed(2)} studs`;

// Runs `draw` every `ms` while `figure` is on screen.
function whileVisible(figure, ms, draw) {
	let timer = 0;
	new IntersectionObserver((entries) => {
		const visible = entries.some((entry) => entry.isIntersecting);
		if (visible && timer === 0) {
			draw();
			timer = setInterval(draw, ms);
		} else if (!visible && timer !== 0) {
			clearInterval(timer);
			timer = 0;
		}
	}).observe(figure);
}

function fieldsInset(figure, ocean, onLayout) {
	const body = figure.querySelector('.inset-body');
	const n = ocean.store.display[0].n;
	const image = new ImageData(n, n);
	const cells = FIELD_VIEWS.map((view) => {
		const canvas = element('canvas', { width: n, height: n });
		canvas.setAttribute('aria-hidden', 'true');
		const range = element('span', { className: 'inset-range' });
		const cell = element('div', { className: 'inset-field' }, [canvas, element('p', { className: 'inset-label', textContent: view.label }), range]);
		return { view, canvas, context: canvas.getContext('2d'), range, cell };
	});
	body.replaceChildren(...cells.map((c) => c.cell));
	onLayout();
	let ranges = null;
	function draw() {
		const fields = ocean.store.display[0];
		const next = {};
		for (const cell of cells) {
			const { min, max } = fieldToRgba(fields[cell.view.name], image.data);
			cell.context.putImageData(image, 0, 0);
			const text = `${min.toFixed(2)} to ${max.toFixed(2)}`;
			if (cell.range.textContent !== text) cell.range.textContent = text;
			next[cell.view.name] = { min, max };
		}
		ranges = next;
	}
	whileVisible(figure, FIELD_MS, draw);
	return { state: () => ranges };
}

function samplingInset(figure, ocean, onLayout) {
	const body = figure.querySelector('.inset-body');
	const scale = Math.min(window.devicePixelRatio || 1, 2);
	const canvas = element('canvas', { width: SAMPLING_PX * scale, height: SAMPLING_PX * scale });
	canvas.style.width = `${SAMPLING_PX}px`;
	canvas.style.height = `${SAMPLING_PX}px`;
	canvas.setAttribute('aria-hidden', 'true');
	const line = element('p', { className: 'inset-line' });
	body.replaceChildren(canvas, line);
	onLayout();
	const context = canvas.getContext('2d');
	const heights = new Float64Array(ZOOM * ZOOM);
	const colours = new Uint8ClampedArray(ZOOM * ZOOM * 4);
	const engineOut = new Float64Array(3);
	const point = [0, 0];
	let state = null;
	function draw() {
		const fields = ocean.store.display[0];
		walkPoint(ocean.teachT, fields.size, point);
		const blend = bilinear(fields, point[0], point[1]);
		const window = zoomWindow(fields, point[0], point[1], heights);
		fieldToRgba(heights, colours);
		const cell = (SAMPLING_PX * scale) / ZOOM;
		context.clearRect(0, 0, canvas.width, canvas.height);
		for (let j = 0; j < ZOOM; j++) {
			for (let i = 0; i < ZOOM; i++) {
				const o = (j * ZOOM + i) * 4;
				context.fillStyle = `rgb(${colours[o]}, ${colours[o + 1]}, ${colours[o + 2]})`;
				context.fillRect(i * cell, j * cell, cell - 1, cell - 1);
			}
		}
		// The tile's edge, where the window's columns wrap back to column 0.
		const n = fields.n;
		const edge = n - window.first[0];
		if (window.wraps && edge > 0 && edge < ZOOM) {
			context.setLineDash([6 * scale, 4 * scale]);
			context.strokeStyle = INK;
			context.lineWidth = 2 * scale;
			context.beginPath();
			context.moveTo(edge * cell, 0);
			context.lineTo(edge * cell, canvas.height);
			context.stroke();
			context.setLineDash([]);
		}
		// The four texels the point blends, and the point itself, at the texel centres' frame.
		const local = (index) => [mod(index % n - window.first[0], n), mod(Math.floor(index / n) - window.first[1], n)];
		const px = (mod(blend.column - window.first[0], n) + blend.fu + 0.5) * cell;
		const py = (mod(blend.row - window.first[1], n) + blend.fv + 0.5) * cell;
		context.strokeStyle = AMBER;
		context.fillStyle = AMBER;
		context.lineWidth = 2 * scale;
		context.font = `${11 * scale}px system-ui, sans-serif`;
		blend.indices.forEach((index, k) => {
			const [ci, cj] = local(index);
			context.strokeRect(ci * cell + 1, cj * cell + 1, cell - 3, cell - 3);
			context.beginPath();
			context.moveTo(px, py);
			context.lineTo((ci + 0.5) * cell, (cj + 0.5) * cell);
			context.stroke();
			context.fillText(blend.weights[k].toFixed(2), ci * cell + 4 * scale, cj * cell + 14 * scale);
		});
		context.beginPath();
		context.arc(px, py, 5 * scale, 0, Math.PI * 2);
		context.fill();
		const engine = Cascade.sampleHeight(fields, point[0], point[1], engineOut)[0];
		const text = `Blended height ${studs(blend.value)}; the engine's own sampler says ${studs(engine)}.`;
		if (line.textContent !== text) line.textContent = text;
		state = { x: point[0], z: point[1], value: blend.value, engine, weights: blend.weights, wraps: window.wraps };
	}
	whileVisible(figure, SAMPLING_MS, draw);
	return { state: () => state };
}

// Floored modulo for the inset's own index arithmetic.
function mod(a, n) {
	return ((a % n) + n) % n;
}

// One inset, started on its own: one that throws is logged and the others still start.
function safely(name, start) {
	try {
		return start();
	} catch (error) {
		console.error(`[ocean] the ${name} inset could not start`, error);
		return null;
	}
}

export function mountInsets({ handle, watchReading, onLayout = () => {} }) {
	const ocean = handle.ocean;
	const insets = {};
	const fields = document.querySelector('figure.inset[data-inset="fields"]');
	const sampling = document.querySelector('figure.inset[data-inset="sampling"]');
	if (fields) insets.fields = safely('fields', () => fieldsInset(fields, ocean, onLayout));
	if (sampling) insets.sampling = safely('sampling', () => samplingInset(sampling, ocean, onLayout));
	return Object.freeze({
		hooks: Object.freeze({
			drawn: () => Object.keys(insets).filter((name) => insets[name]?.state() != null),
			fields: () => insets.fields?.state() ?? null,
			sampling: () => insets.sampling?.state() ?? null,
			painted: () => null,
		}),
	});
}
```
(`watchReading` is part of the contract and unused here: each inset follows its own visibility.)

Replace `content/ocean/css/insets.css`:
```css
/* The texture insets of steps 22, 23 and 25 (piece C2; lane F owns this file). */
.inset {
	margin: 14px 0;
}

.inset-body {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 10px;
}

.inset[data-inset="sampling"] .inset-body {
	grid-template-columns: 1fr;
	justify-items: start;
}

.inset canvas {
	display: block;
	width: 100%;
	height: auto;
	aspect-ratio: 1;
	border-radius: 6px;
	border: 1px solid var(--line);
	image-rendering: pixelated;
}

.inset[data-inset="sampling"] canvas {
	width: 240px;
	max-width: 100%;
	image-rendering: auto;
}

.inset-label,
.inset-range,
.inset-line {
	margin: 4px 0 0;
	font-size: 0.8rem;
	color: var(--ink-dim);
}

.inset-range {
	display: block;
	font-variant-numeric: tabular-nums;
}

.inset figcaption {
	margin-top: 8px;
	font-size: 0.85rem;
	color: var(--ink-dim);
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/ocean/page/fieldViews.test.js && OCEAN_PORT=8786 npm run test:ocean:e2e -- tests/ocean/e2e/insets.spec.js tests/ocean/e2e/copy.spec.js tests/ocean/e2e/layout.spec.js`
Expected: PASS (the insets' numbers are in their live bodies; no panel scrolls inside itself; no horizontal scroll on a phone).

- [ ] **Step 7: Commit**

```bash
git add content/ocean/js/page/fieldViews.js content/ocean/js/ui/insets.js content/ocean/css/insets.css tests/ocean/page/fieldViews.test.js tests/ocean/e2e/insets.spec.js
```
```bash
git commit -m "feat: the FFT's answer as live images of numbers, and a point sampled between them across the tile's edge"
```

### Task 11: The painted maps live, the mesh step, and every inset on Medium

**Files:**
- Modify: `content/ocean/js/ui/insets.js`, `content/ocean/css/insets.css`, `content/ocean/js/stages/chapters/textures.js`, `tests/ocean/e2e/insets.spec.js`

**Interfaces:**
- Consumes: Task 10's insets; `handle.materials.textures` (`colour` 512 × 512, `mask` 128 × 128, `normal` 512 × 512 DataTextures, RGBA bytes in `.image.data`, `.version` incremented on every upload); `COLOUR_TEXELS`, `MAP_TEXELS`, `NORMAL_IMAGE_TEXELS` (engine/config.js); `downsample`; the slot `figure.inset[data-inset="painted"]`.
- Produces: the `painted()` hook `{ versions: { colour, mask, normal }, colours: { colour, mask, normal } }` (texture versions last drawn; distinct colours in each drawn image).

- [ ] **Step 1: Write the failing tests**

Append to `tests/ocean/e2e/insets.spec.js`:
```js
test("step 25: the painters' colour, glow-mask and ripple maps, live", async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'painted', 0.2);
	await expect(page.locator('figure[data-inset="painted"] canvas')).toHaveCount(3, { timeout: 30_000 });
	await expect.poll(() => page.evaluate(() => window.__insets.painted()?.colours.colour ?? 0), { timeout: 30_000 }).toBeGreaterThan(50);
	const first = await page.evaluate(() => window.__insets.painted().versions);
	await expect.poll(() => page.evaluate(() => window.__insets.painted().versions.colour), { timeout: 10_000 }).toBeGreaterThan(first.colour);
	const painted = await page.evaluate(() => window.__insets.painted());
	expect(painted.colours.normal).toBeGreaterThan(20);
});

// Review Focus 4.
test.describe('on the Medium tier (phones by rule)', () => {
	test('every inset works on Medium', async ({ page }) => {
		test.setTimeout(300_000);
		await oceanRunning(page, '/ocean/?tier=Medium');
		expect(await page.evaluate(() => window.__ocean.status().tier)).toBe('Medium');
		for (const [id, probe] of [['fields', 'fields'], ['sampling', 'sampling'], ['painted', 'painted']]) {
			await scrollToId(page, id, 0.2);
			await expect.poll(() => page.evaluate((p) => window.__insets[p]() !== null, probe), { timeout: 30_000 }).toBe(true);
		}
		const s = await page.evaluate(() => window.__insets.sampling());
		expect(Math.abs(s.value - s.engine)).toBeLessThan(1e-6);
	});
});
```

Run: `OCEAN_PORT=8786 npm run test:ocean:e2e -- tests/ocean/e2e/insets.spec.js`
Expected: the painted test FAILS (no canvases); the Medium test fails at `painted`.

- [ ] **Step 2: Draw the painted maps**

In `content/ocean/js/ui/insets.js`:
- Import `{ COLOUR_TEXELS, MAP_TEXELS, NORMAL_IMAGE_TEXELS }` from `'../engine/config.js'` and add `downsample` to the `fieldViews.js` import.
- Add:
```js
const PAINTED_TEXELS = 128;
const PAINTED = Object.freeze([
	Object.freeze({ name: 'colour', label: 'Colour', texels: COLOUR_TEXELS }),
	Object.freeze({ name: 'mask', label: 'Glow mask', texels: MAP_TEXELS }),
	Object.freeze({ name: 'normal', label: 'Ripples (the normal map)', texels: NORMAL_IMAGE_TEXELS }),
]);

// The painters' maps as the materials hold them, each shrunk to PAINTED_TEXELS and redrawn only when
// its texture has taken a new upload since the last drawing.
function paintedInset(figure, materials, onLayout) {
	const body = figure.querySelector('.inset-body');
	const image = new ImageData(PAINTED_TEXELS, PAINTED_TEXELS);
	const cells = PAINTED.map((map) => {
		const canvas = element('canvas', { width: PAINTED_TEXELS, height: PAINTED_TEXELS });
		canvas.setAttribute('aria-hidden', 'true');
		const cell = element('div', { className: 'inset-field' }, [canvas, element('p', { className: 'inset-label', textContent: map.label })]);
		return { map, canvas, context: canvas.getContext('2d'), cell, version: -1, colours: 0 };
	});
	body.replaceChildren(...cells.map((c) => c.cell));
	onLayout();
	let drawnOnce = false;
	function draw() {
		for (const cell of cells) {
			const texture = materials.textures[cell.map.name];
			if (texture.version === cell.version) continue;
			const data = texture.image.data;
			if (texture.image.width === PAINTED_TEXELS) {
				image.data.set(data);
			} else {
				downsample(data, texture.image.width, image.data, PAINTED_TEXELS);
			}
			cell.context.putImageData(image, 0, 0);
			cell.version = texture.version;
			const seen = new Set();
			for (let i = 0; i < image.data.length; i += 4 * 7) seen.add((image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2]);
			cell.colours = seen.size;
		}
		drawnOnce = true;
	}
	whileVisible(figure, FIELD_MS, draw);
	return {
		state: () => (drawnOnce ? {
			versions: Object.fromEntries(cells.map((c) => [c.map.name, c.version])),
			colours: Object.fromEntries(cells.map((c) => [c.map.name, c.colours])),
		} : null),
	};
}
```
- In `mountInsets`: `const painted = document.querySelector('figure.inset[data-inset="painted"]'); if (painted && handle.materials?.textures) insets.painted = safely('painted', () => paintedInset(painted, handle.materials, onLayout));` and the hook `painted: () => insets.painted?.state() ?? null,`.
- Header: the painted line loses "(Task 11)".
- The colour map is sRGB bytes and the normal map raw bytes (R from n.x, G from n.z, B from n.y: core/normalTexels.js); both are drawn as their bytes, which is what Roblox is handed.

Add to `content/ocean/css/insets.css`:
```css
/* The painted maps are photographs of textures: smooth them as a texture sampler would. */
.inset[data-inset="painted"] canvas {
	image-rendering: auto;
}
```

- [ ] **Step 3: Tune the textures chapter's shots**

Capture them:
```bash
(OCEAN_PORT=8786 npm run serve:ocean >/dev/null 2>&1 &) && sleep 2 && for q in '' 'tier=Medium'; do OCEAN_PORT=8786 node scripts/ocean-stage-capture.mjs /private/tmp/c2-textures 0 "$q" fields,sampling,mesh,painted; done; pkill -f "http.server 8786"
```
and judge: the mesh step's wireframe shows the rings and their step from one spacing to the next without a moire field; the other three frame the sea calmly behind the panel's inset. Change only `textures.js`. Then:
```bash
node --test tests/ocean/stages/clearance.test.js tests/ocean/stages/shots.test.js tests/ocean/page/orbitLimits.test.js tests/ocean/stages/recipes.test.js
```
Expected: PASS.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `OCEAN_PORT=8786 npm run test:ocean:e2e -- tests/ocean/e2e/insets.spec.js tests/ocean/e2e/materials.spec.js tests/ocean/e2e/layout.spec.js`
Expected: PASS (A2's `materials.spec.js` confirms reading the textures changes nothing about them).

- [ ] **Step 5: Run the suites and commit**

```bash
ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -3 && OCEAN_PORT=8786 npm run test:ocean:e2e 2>&1 | tail -5
```
Expected: all pass.
```bash
git add content/ocean/js/ui/insets.js content/ocean/css/insets.css content/ocean/js/stages/chapters/textures.js tests/ocean/e2e/insets.spec.js
```
```bash
git commit -m "feat: the painted colour, glow and ripple maps, live from the painters, on every tier"
```

---

## Wave 1, lane G: every word (worktree `Wesbite-ocean-c2-g`, branch `ocean-c2-g`, port 8787)

Lane G writes the page's copy from the spec (section 10.7) while the other lanes build what it describes; Task 14 reconciles the two. The drafts below are the starting text: check every claim against the code or the roblox-ocean docs it names, keep the voice (first person, casual, plain), and put no digit in the text unless a phrase in `copySources.js` covers it with a quote that exists in its source. Never reuse or closely paraphrase Acerola's wording or his images. Keep every title exactly as the recipe has it, and never move a section, slot, id, `data-*` attribute or link (`tests/ocean/page/structure.test.js` fails if one moves).

### Task 12: Chapters one to three (steps 1 to 13)

**Files:**
- Modify: `content/ocean/index.html` (steps 1 to 13: paragraphs, math TeX and notes, cards), `tests/ocean/page/copySources.js`, `tests/ocean/page/facts.test.js`
- Create: `tests/ocean/page/wording.test.js`

**Interfaces:**
- Consumes: Task 0's sections and slots; the recipes' titles and slider ids; `TERM_BY_SLIDER` (each slider's term must appear as `\htmlClass{t-...}` in its step's panel TeX: `sliderModel.test.js`); the copy check (`copyCheck.js`, `copySources.js`, `copy.spec.js`).
- Produces: the copy for steps 1 to 13; `wording.test.js` (no placeholder left in the steps it has written, no banned Acerola image).

- [ ] **Step 1: Make the lane's worktree**

```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git worktree add /Users/cole/Projects/Wesbite-ocean-c2-g -b ocean-c2-g c2-contract
```
```bash
ln -s /Users/cole/Projects/Wesbite-ocean/node_modules /Users/cole/Projects/Wesbite-ocean-c2-g/node_modules && cd /Users/cole/Projects/Wesbite-ocean-c2-g && git log --oneline -1 && node --test tests/ocean/page/structure.test.js
```
Expected: the contract commit and the structure test passing. Lane G works in `/Users/cole/Projects/Wesbite-ocean-c2-g` with `OCEAN_PORT=8787`.

- [ ] **Step 2: Write the failing wording test**

Create `tests/ocean/page/wording.test.js`:
```js
// The page's words against the C2 copy rules (piece C2, lane G; spec 1 and 10): no placeholder left
// in the steps already written, no Acerola image or wording, no digit in a title or chapter label,
// and none of the claims the rulings struck.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as expect from '../expect.js';
import { structureOf } from './structure.js';

const html = readFileSync(new URL('../../../content/ocean/index.html', import.meta.url), 'utf8');
const sections = structureOf(html);
const text = (inner) => inner.replace(/<div class="tex"[\s\S]*?<\/div>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// The steps this lane has written so far: Task 12 sets 13, Task 13 sets 28.
export const WRITTEN_UP_TO = 13;

test('no placeholder is left in the steps written so far', () => {
	for (const section of sections.filter((s) => s.n <= WRITTEN_UP_TO)) {
		expect.truthy(!/Placeholder/i.test(section.inner), `${section.id} still has a placeholder`);
	}
});

test("no Acerola image or turn of phrase, and none of the claims the rulings struck", () => {
	const all = text(html).toLowerCase();
	const banned = ["plato", 'projector', 'crank', 'pasta', 'level 9', 'spell', 'free salad', 'taco bell', 'sum of signs', 'genuinely sucks', 'kind of sucks', 'have hands', 'all directions', 'at their own speeds', '32 waves', 'tiles disappear', 'tiling disappears'];
	for (const phrase of banned) expect.truthy(!all.includes(phrase), `the page says "${phrase}"`);
});

test('titles and chapter labels use words, not digits', () => {
	for (const section of sections) {
		const title = /<h2[^>]*>([^<]*)<\/h2>/.exec(section.inner)?.[1] ?? '';
		const label = /<p class="chapter">([^<]*)<\/p>/.exec(section.inner)?.[1] ?? '';
		expect.truthy(!/\d/.test(title + label), `${section.id}: "${title}" / "${label}"`);
	}
});
```

Run: `node --test tests/ocean/page/wording.test.js`
Expected: FAIL (steps 1 to 13 still hold Task 0's placeholders).

- [ ] **Step 3: Write steps 1 to 13**

Replace each placeholder in steps 1 to 13 of `content/ocean/index.html` with the text below (`P` the paragraph, `TeX` the panel's math, `N` its note, `Card` the card). Where a step keeps piece C's text, it says so; check that text is still true where it now stands.

1. `sine`. P: "Let's start with no ocean at all, just a graph. This is a sine wave: a height that goes up and down as you move along. Two knobs describe it: how tall it gets, and how far it is from one crest to the next. I've drawn the heights four times taller than they are so you can see them." TeX: `y = \htmlClass{t-amp}{A}\,\sin(\htmlClass{t-len}{k}\,x), \qquad \htmlClass{t-len}{k} = \frac{2\pi}{\htmlClass{t-len}{\lambda}}`. N: "A is the height and λ the length from crest to crest; k turns that length into how fast the wave goes round as you move along x."
2. `moving-sine`. P: "Put time inside the sine and the whole curve slides along. The speed knob sets how fast; the shape doesn't change, it just travels." TeX: piece C's step 2 TeX (already there). N: "ω is how fast the wave goes round in time, so the crests travel at ω/k studs a second."
3. `sum-of-sines`. P: "One wave looks like a machine. Add a few with different heights, lengths and speeds and the sum starts to wander like water. These are the tallest waves of the Roblox ocean I started from, laid along one line for now: each one faint, their sum in bold." TeX: `y = \sum_{i=1}^{\htmlClass{t-count}{N}} A_i \sin(k_i x - \omega_i t + \varphi_i)`. N: "N waves, each with its own height, wavenumber, speed and starting phase φ, added up point by point."
4. `into-3d`. P: "Here's the trick: that graph was never flat. It's the edge of a surface, seen exactly side on. Nothing in the sum depends on the other direction, so the curve is just stretched sideways into a sheet, and every point of that sheet is a vertex the code has to move." N: "The same sum at every z: the height depends on x and time only." Card: piece C's step 2 card (already there).
5. `directions`. P: "Real waves don't all march the same way. Give each one a heading and they start crossing each other. The arrows show where each wave is going; drag Spread down to zero and they all line up again." N: "d̂ is a unit vector along a wave's heading, so d̂·x is how far along that heading a point sits."
6. `many-waves`. P: "Add more of them and it stops looking like a pattern. Their headings fan out around one direction, the way wind waves do, and the slider adds them tallest first." N: piece C's step 3 note. Card: as Task 0 left it (piece C's step 3 card, the new "What I did"); apply the parked C ruling to its last row: "When the ocean is running, the line above is measured live in your browser. In Roblox the same loop runs in Luau, on the CPU, in the same frame as everything else."
7. `unlit`. P: "Turn the wireframe off and the shape vanishes. Every point is the same flat white, so nothing tells a crest from a trough. Shape isn't what makes water look like water. Light is." TeX: `\text{colour} = c_{\text{white}}`. N: "Without light every pixel gets the same colour, whatever the surface is doing."
8. `normals`. P: "To light a surface you need to know which way each bit of it faces. That direction is the normal: the arrows sticking out of the surface. At the centre the two slope directions are drawn too, one along x (the tangent) and one along z (the binormal); cross them and you get the normal." TeX: `\mathbf{T} = (1,\ \partial_x y,\ 0), \quad \mathbf{B} = (0,\ \partial_z y,\ 1), \quad \mathbf{n} = \frac{\mathbf{B}\times\mathbf{T}}{\lVert\mathbf{B}\times\mathbf{T}\rVert}`. N: "T and B lie in the surface, and their cross product points straight out of it. These arrows come from the engine's own wave sums, not from a picture."
9. `slopes`. P: "So where do the slopes come from? You can measure them: sample the height a little way either side and divide. That's a central difference. Or, since every wave is a sine, take the derivative exactly: the slope of a sine is a cosine, and the slope of a sum is the sum of the slopes. One arrow is measured, the other exact; widen the spacing and watch them drift apart." TeX: `\partial_x y \approx \frac{y(x + \htmlClass{t-h}{h}) - y(x - \htmlClass{t-h}{h})}{2\htmlClass{t-h}{h}}, \qquad \partial_x y = \sum_i A_i k_i\,\hat{d}_{i,x}\cos\theta_i`. N: "h is the sample spacing. The measured slope needs extra heights at every point; the exact one falls out of the same loop that adds the waves up, which is what the engine does." (Check the colours the arrows really are, from lane C's palette in `render/surfaceOverlays.js`, before naming them; Task 14 reconciles if they changed.)
10. `diffuse`. P: "Now light. The simplest rule: a point is as bright as it faces the sun. Head on, full brightness; edge on, none; plus a little light from the sky everywhere so the shadows aren't black. Swing the sun round." TeX: `\text{colour} = c_{\text{sea}}\,\big(a + \max(0,\ \mathbf{n}\cdot\htmlClass{t-sun}{\mathbf{s}})\big)`. N: "n is the normal, s points at the sun and a is the sky's light. The max keeps faces turned away from the sun from going darker than the sky alone."
11. `highlights`. P: "Plain sunlight makes plastic. Water also reflects: a hot highlight where the sun bounces straight at you, and the sky itself, mirrored more and more as you look across the surface. That last part is Fresnel. Switch each one off to see what it was doing." TeX: `\text{colour} = (1 - \htmlClass{t-fresnel}{F})\big(c_{\text{sea}}(a + \max(0,\ \mathbf{n}\cdot\mathbf{s})) + \htmlClass{t-spec}{(\mathbf{n}\cdot\mathbf{h})^{p}}\big) + \htmlClass{t-fresnel}{F}\,c_{\text{sky}}, \quad \htmlClass{t-fresnel}{F} = F_0 + (1 - F_0)(1 - \mathbf{n}\cdot\mathbf{v})^5`. N: "s points at the sun and v at your eye; h is halfway between them, so the highlight peaks when the sun reflects straight at you. F (Schlick's Fresnel term) is why water turns into a mirror when you look across it." Card: Normally "You write this lighting yourself, in a pixel shader, one term at a time." In Roblox "No pixel shaders. Roblox lights every surface with its own material model: a game gets to choose the colour, a normal map and how rough the surface is, and that's all." What I did "Let Roblox do the highlight, the Fresnel and the sky reflections, and painted a roughness map so foam looks dull and open water shines." Check the roughness claim against `roblox-ocean` (FoamRoughness, the painter's roughness maps) and the material claims against its docs; drop any sentence you cannot source. No "The number" row unless a sourced number exists.
12. `gerstner`. P: "Real waves have sharp tops and wide troughs, because the water moves in circles. Slide each point toward the nearest crest as well as up and the tops pinch into points; push too far and they fold over themselves. That's a Gerstner wave, and it's what the original Roblox prototype's waves were made of." Keep piece C's step 5 TeX and note.
13. `tiling`. Keep piece C's step 6 paragraph, TeX and note.

Numbers: the drafts above carry none outside existing phrases. If a step needs one, add a phrase to `copySources.js` with a quote that exists in its source, preferring a `facts.test.js` test whose name is the quote and whose body checks the number from the code.

- [ ] **Step 4: Run the checks**

Run:
```bash
node --test tests/ocean/page/wording.test.js tests/ocean/page/structure.test.js tests/ocean/page/sliderModel.test.js tests/ocean/page/copy.test.js tests/ocean/page/facts.test.js && OCEAN_PORT=8787 npm run test:ocean:e2e -- tests/ocean/e2e/copy.spec.js tests/ocean/e2e/math.spec.js tests/ocean/e2e/layout.spec.js
```
Expected: PASS: no placeholder in steps 1 to 13, every number sourced, every phrase used, every formula typesets without a KaTeX error and fits its panel, no panel scrolls inside itself.

- [ ] **Step 5: Commit**

```bash
git add content/ocean/index.html tests/ocean/page/copySources.js tests/ocean/page/facts.test.js tests/ocean/page/wording.test.js
```
```bash
git commit -m "docs: the extended story's words, chapters one to three"
```

### Task 13: Chapters four to six, the finale's recap, and the parked copy rulings

**Files:**
- Modify: `content/ocean/index.html` (steps 14 to 28), `tests/ocean/page/copySources.js`, `tests/ocean/page/facts.test.js`, `tests/ocean/page/wording.test.js`

**Interfaces:**
- Consumes: Task 12's wording test and voice.
- Produces: the copy for steps 14 to 28; the recap list matching where the cards now stand; `WRITTEN_UP_TO = 28`.

- [ ] **Step 1: Make the wording test cover every step**

In `tests/ocean/page/wording.test.js` set `export const WRITTEN_UP_TO = 28;`. Run `node --test tests/ocean/page/wording.test.js`. Expected: FAIL (steps 14 to 28 hold placeholders).

- [ ] **Step 2: Write steps 14 to 28**

14. `frequency`. P: "Back to a flat graph for a minute. So far each wave is a curve. The same waves can be written another way: as a list of how much of each frequency there is. Then each wave is a single spike, at how often it repeats and as tall as the wave. The chart below does that with the same FFT code the ocean runs on." TeX: `y(x) = \sum_{i=1}^{\htmlClass{t-count}{N}} A_i \sin(k_i x + \varphi_i) \;\Longleftrightarrow\; \hat{y}(k)`. N: "On the left of the arrow, the waves as a curve; on the right, the same waves as one spike each." Figcaption: "The waves on the graph over one tile (top) and the same waves as spikes (bottom), worked out with the ocean's own FFT code in your browser."
15. `fourier`. P: "Going from a curve to its spikes and back loses nothing, and that's the useful part. Think of a chord: split it into its notes, drop one, put it back together, and you get the chord without that note. Switch the tones off and on." TeX: `y(t) = \sum_{j} \htmlClass{t-note}{a_j} \sin(2\pi f_j t), \qquad \hat{y} = \mathcal{F}\{y\}, \qquad y = \mathcal{F}^{-1}\{\hat{y}\}`. N: "𝓕 turns a signal into its frequencies and 𝓕⁻¹ turns them back; a tone switched off is a spike set to zero before going back." Figcaption: "Three tones summed into a chord, and the chord rebuilt from the tones still switched on (bold), with each tone as a spike underneath."
16. `jonswap`. Keep piece C's step 7 text and figure.
17. `random-sea`. P: "A real sea isn't a neat set of chosen waves, so each wave from the spectrum gets a random height from a bell curve and a random starting angle. Here they are as arrows, held still: each arrow is one wave, its length the wave's height and its angle where the wave starts." TeX: keep Task 0's. N: "The ξ are random numbers from a bell curve, picked by the seed (the New sea button). The random numbers come from a documented generator rather than Roblox's own, so this is the same kind of sea as the game's, not the same waves." (move that last sentence here from step 18's note, and drop it there). Figcaption: "The tallest waves in the 256-stud layer as arrows, held at their starting angles."
18. `time`. Keep piece C's step 8 paragraph, figure and TeX; its note loses the two sentences moved to step 17.
19. `fft`. Keep piece C's step 9 text, figure and card.
20. `choppiness`. P: "So far the FFT only moves points up and down, and the sea looks soft. Run another set of transforms over the same waves and you get a sideways push for every point, toward the crests, which is what sharpens them. It's the Gerstner idea again, done for the whole spectrum at once." TeX: `\mathbf{D}(\mathbf{x}, t) = \sum_{\mathbf{k}} i\,\frac{\mathbf{k}}{\lvert\mathbf{k}\rvert}\,\tilde h(\mathbf{k}, t)\,e^{i\,\mathbf{k}\cdot\mathbf{x}}, \qquad \mathbf{x}' = \mathbf{x} + \htmlClass{t-chop}{c}\,\mathbf{D}`. N: "D is the sideways push and c, the choppiness, scales it. Tessendorf's notes write the push with −i; the code uses +i, which moves water toward the crests, the way a Gerstner wave does."
21. `layers`. Keep piece C's step 10 text and card.
22. `fields`. P: "Here's what the FFT actually hands back: not a surface, but grids of numbers. One grid of heights, one of slopes, one of sideways pushes, for each layer. These are the real ones for the biggest layer, live, drawn as pictures: blue below zero, pale at zero, amber above." Figcaption: "The 256-stud layer's height, slope and sideways push, straight from the engine, as they are right now." (Add the phrase `The 256-stud layer's height, slope and sideways push` to `copySources.js`, sourced to `FACTS` with the quote `over 256, 64 and 16 studs`.)
23. `sampling`. P: "The mesh's points don't sit exactly on the grid, so each one blends the four grid values around it, weighted by how close it is. That's bilinear sampling. At the edge the grid wraps round to the other side, which is why the sea tiles without a seam; the dot is swinging back and forth across that edge." N: "f_u and f_v are how far the point sits between its grid neighbours; the indices wrap round at the grid's edge." Figcaption: "One point between grid values: the four it blends and how much of each, beside the engine's own answer for the same point." Card: Normally "The graphics card's texture hardware does this blend for free, for every pixel, wrap-around included." In Roblox "There's no shader to read a texture from, so nothing does it for me." What I did "Wrote the blend in Luau and ran it for every point of the sea and every layer, every frame (the outermost ring every other frame)." Check against `roblox-ocean`'s SurfaceSampler; no number row unless sourced.
24. `mesh`. P: "All those numbers end up on a mesh: rings of points around the camera, each ring twice as coarse as the one inside it, so the detail goes where you're looking. The rings snap to a fixed grid as the camera moves, so the waves don't swim." TeX: keep Task 0's. N: "Ring r has its points Δ_r apart, and its centre snaps to the nearest multiple of Δ_r under the point the camera looks at." Card: as Task 0 merged it.
25. `painted`. P: "Colour, the glow mask and the ripples (a normal map) can't be worked out pixel by pixel in Roblox, so two worker threads paint them into images and hand them over a slice at a time. These are the real maps, live, as the painters leave them." N: "Each ripple-map pixel stores the surface's direction as a colour: the normal's x, z and y, each moved from −1..1 into 0..1." Figcaption: "The colour, glow-mask and ripple maps the painters are making right now, shrunk to fit." Card: piece C's step 4 card, its "In Roblox" row ending with the sentences from piece C's step 11 card: "Game scripts can't swap a material's textures; only plugins can. Every image has to be handed over the moment the material is created, and after that I can only rewrite its pixels."
26. `foam`. Keep piece C's step 11 text; its card's "In Roblox" row becomes "No pixel shaders again: foam has to be painted into the colour map like everything else."
27. `glow`. Keep piece C's step 12 text and card.
28. `finale`. Keep piece C's finale; the recap list becomes, in story order:
	- "No vertex shaders: a script moves every point, every frame."
	- "No pixel shaders for light: Roblox's own lighting does the highlight, Fresnel and the sky."
	- "No GPU compute: the FFT runs in Luau on three worker Actors."
	- "Workers take turns: a frame-counted fade hides it."
	- "No texture hardware to sample with: the blend is Luau arithmetic."
	- "No moving meshes on the GPU and no tessellation: rings of patches built with EditableMesh."
	- "No pixel shaders: colour, glow and ripples are painted into images."
	- "No texture swaps from game scripts: every image is handed over up front."
	- "No lighting hooks: 232 materials on the top tier, each with its own glow." (the existing sourced phrase)

Apply the parked copy rulings from piece C's ledger that land in this text: step 6's live-timing row (Task 12 did it); "The number" on step 25's card says it was measured before foam (keep "Measured before I added foam"); the step-25 card's "one image a frame" reading must not imply the game stays within one image (it hands over a band of colour and the mask or the ripple map in turn).

- [ ] **Step 3: Run the checks**

Run:
```bash
node --test tests/ocean/page/wording.test.js tests/ocean/page/structure.test.js tests/ocean/page/sliderModel.test.js tests/ocean/page/copy.test.js tests/ocean/page/facts.test.js && OCEAN_PORT=8787 npm run test:ocean:e2e -- tests/ocean/e2e/copy.spec.js tests/ocean/e2e/math.spec.js tests/ocean/e2e/layout.spec.js
```
Expected: PASS. A phrase the page no longer uses fails `copy.spec.js`'s "still used" test: remove it from `copySources.js`.

- [ ] **Step 4: Run the suites and commit**

```bash
ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -3 && OCEAN_PORT=8787 npm run test:ocean:e2e 2>&1 | tail -5
```
Expected: all pass.
```bash
git add content/ocean/index.html tests/ocean/page/copySources.js tests/ocean/page/facts.test.js tests/ocean/page/wording.test.js
```
```bash
git commit -m "docs: the extended story's words, chapters four to six and the finale's recap"
```

---

## Wave 2

### Task 14: Merge the lanes, reconcile them, and run everything

**Files:**
- Modify: any file the reconciliation needs (the lanes' ownership ends here); `docs/superpowers/specs/2026-09-27-ocean-showcase-design.md` (C2's status line)

**Interfaces:**
- Consumes: the seven lane branches `ocean-c2-a` to `ocean-c2-g`, each finished and green in its own tree.
- Produces: `ocean-page` with C2 whole: every unit and browser test passing on `OCEAN_PORT=8774`, the copy matching what is drawn, the spec's status line.

- [ ] **Step 1: Check every lane is done**

Run:
```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git status --short && for lane in a b c d e f g; do echo "== $lane"; git log --oneline c2-contract..ocean-c2-$lane; done
```
Expected: a clean tree; lane A two commits, B two, C two, D one, E two, F two, G two (more if a lane had fix rounds). A lane with no commits, or a dirty `ocean-page`, stops the task: report which.

- [ ] **Step 2: Merge in order, testing after each**

For each lane in the order A, B, C, D, E, F, G:
```bash
cd /Users/cole/Projects/Wesbite-ocean-page && git merge --no-ff ocean-c2-a -m "merge: C2 lane A (the math box) into the page branch"
```
(with `b`: "the flat graph and the swing", `c`: "arrows on the surface", `d`: "light split into its terms", `e`: "the frequency charts and chapter four", `f`: "the texture insets", `g`: "every word"), then:
```bash
ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -3 && OCEAN_PORT=8774 npm run test:ocean:e2e -- tests/ocean/e2e/contract.spec.js tests/ocean/e2e/copy.spec.js
```
Expected: no conflict (the lanes own disjoint files) and both pass. A conflict means a lane edited a file it did not own: keep the owner's version of that file, re-apply the other lane's intent through the owner's interface, and note it in the report.

- [ ] **Step 3: Run every test**

```bash
cd /Users/cole/Projects/Wesbite-ocean-page && ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -8 && OCEAN_PORT=8774 npm run test:ocean:e2e 2>&1 | tail -8
```
Expected: every unit and browser test passes. Record the counts.

- [ ] **Step 4: Reconcile the words with what is drawn**

Lane G wrote from the spec while the other lanes built; read each step's panel beside its capture and its code, and fix every mismatch (in whichever file is wrong):
```bash
(OCEAN_PORT=8774 npm run serve:ocean >/dev/null 2>&1 &) && sleep 2 && OCEAN_PORT=8774 node scripts/ocean-stage-capture.mjs /private/tmp/c2-integration 0.25 && OCEAN_PORT=8774 node scripts/ocean-stage-capture.mjs /private/tmp/c2-integration 0.25 'tier=Medium'; pkill -f "http.server 8774"
```
Checklist, step by step:
- Steps 1 to 4: the paragraphs' "four times taller" matches the graph's `yScale` in `waves.js`; step 1's "two knobs" matches its sliders; the λ and A markers' words match the panel's symbols.
- Steps 5, 8, 9: every colour the copy names is the colour `surfaceOverlays.js` draws; the readout's words read as one sentence with the paragraph.
- Steps 10 and 11: the formula in the panel, the math box (`mathSteps.js`) and `lightTerms.js` are the same formula.
- Steps 14 and 15: the figcaptions describe what `frequencyCharts.js` draws (top and bottom, bold and faint, dashed for a removed tone).
- Steps 22, 23, 25: "blue below zero, pale at zero, amber above" matches `fieldViews.js`; the sampling figcaption matches the inset's line; the painted maps' three labels match the paragraph.
- Every step: the math box's equation and the panel's TeX agree on symbols (the box is the short form); each slider's swatch colour appears in both (`sliderModel.test.js`, `mathSteps.test.js`).
- The recap lists every card that is on the page, in story order.
Commit each fix as `fix: reconcile <what> with <what>` after rerunning the tests that cover it.

- [ ] **Step 5: The spec's status line**

Add to the spec's header, after the A3 line, a C2 line in the same style: what was built (27 steps and the finale in six chapters, the always-on math box, the flat graph that becomes the surface, the overlays, the lighting terms, the frequency charts, the texture insets), the test counts from Step 3, that every new shot passes the clearance and world-edge checks, and what is not yet seen or measured (Cole has not seen C2 in motion; no phone has run it; the walk is Task 15).

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-09-27-ocean-showcase-design.md
```
```bash
git commit -m "docs: the spec's status line for C2, the extended story"
```
Do not delete the lane branches or worktrees: the controller does once the final review is done.

---

## Wave 3

### Task 15: The final walk: the whole story in motion, desktop and phone

**Files:**
- Create: `tests/ocean/e2e/walk.spec.js`, `scripts/ocean-walk.mjs`
- Modify: any file a finding needs

**Interfaces:**
- Consumes: the merged page; `scrollToId`, `oceanRunning` (helpers/story.js); `watchErrors` (helpers/stage.js); `STEP_IDS`, `STEP_COUNT`.
- Produces: `walk.spec.js` (the whole page scrolled top to bottom and back at 1366 × 767 and 390 × 844 with no console error, no sideways scroll, the math box following every step); `scripts/ocean-walk.mjs` (screenshots of every step's hold and blend on both screens plus the worst frame gap per step, for the controller and Cole); a findings list. Piece C's deferred Task 10 (deploy config) reuses `walk.spec.js` rather than writing its own.

- [ ] **Step 1: Write the walk test**

Create `tests/ocean/e2e/walk.spec.js`:
```js
// The whole story, walked (piece C2, Task 15; spec 10): every step from the opening to the footer and
// back, on a laptop and a phone, with no console error, no sideways scroll, the math box on the step
// being read, and the director on that step too.
import { test, expect } from '@playwright/test';
import { STEP_IDS, STEP_COUNT, stepOf } from '../../../content/ocean/js/stages/steps.js';
import { watchErrors } from './helpers/stage.js';
import { oceanRunning, scrollToId, scrollToOpening } from './helpers/story.js';

for (const screen of [{ name: 'a laptop', viewport: { width: 1366, height: 767 } }, { name: 'a phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
	test.describe(screen.name, () => {
		test.use({ viewport: screen.viewport, isMobile: screen.isMobile ?? false, hasTouch: screen.hasTouch ?? false });

		test('down every step and back up, cleanly', async ({ page }) => {
			test.setTimeout(900_000);
			const errors = watchErrors(page);
			await oceanRunning(page);
			for (const id of STEP_IDS) {
				await scrollToId(page, id, 0.3);
				await page.waitForFunction((n) => window.__ocean.story.state().step === n, stepOf(id), { timeout: 30_000 });
				expect(await page.evaluate(() => window.__mathbox.shown())).toBe(id);
				expect(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth)).toBe(true);
			}
			await page.keyboard.press('End');
			await page.waitForFunction((n) => window.__page.reading().step === n, STEP_COUNT, { timeout: 30_000 });
			for (const id of [...STEP_IDS].reverse().filter((_, i) => i % 3 === 0)) {
				await scrollToId(page, id, 0.6);
			}
			await scrollToOpening(page);
			await page.waitForFunction(() => window.__ocean.story.graph().shown === 0, null, { timeout: 30_000 });
			expect(errors).toEqual([]);
		});
	});
}
```

Run: `cd /Users/cole/Projects/Wesbite-ocean-page && OCEAN_PORT=8774 npm run test:ocean:e2e -- tests/ocean/e2e/walk.spec.js`
Expected: PASS. A failure is a finding: fix it (any file), rerun, and list it.

- [ ] **Step 2: Write the walk capture script**

Create `scripts/ocean-walk.mjs`:
```js
// Walks the story in a real scroll and screenshots every step (piece C2, Task 15): at each step's
// hold (progress 0.25) and in its blend into the next (0.8), on a laptop (1366 x 767) and a phone
// (390 x 844, touch, the Medium tier by rule), and records each step's worst gap between frames.
// For the controller and Cole to look at; it judges nothing. Exits non-zero on a page error.
// Usage: node scripts/ocean-walk.mjs <out-dir>   (serve the page first on OCEAN_PORT, default 8767)
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STEP_IDS, stepOf } from '../content/ocean/js/stages/steps.js';

const [outDir = 'ocean-walk'] = process.argv.slice(2);
const port = process.env.OCEAN_PORT || '8767';
const SCREENS = [
	{ name: 'laptop', viewport: { width: 1366, height: 767 } },
	{ name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
mkdirSync(outDir, { recursive: true });
const errors = [];
const gaps = {};
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
	for (const screen of SCREENS) {
		const page = await browser.newPage({ viewport: screen.viewport, isMobile: screen.isMobile ?? false, hasTouch: screen.hasTouch ?? false });
		page.on('pageerror', (error) => errors.push(`${screen.name}: ${error.message}`));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(`${screen.name}: ${message.text()}`);
		});
		await page.goto(`http://localhost:${port}/ocean/`);
		await page.waitForFunction(() => document.body.dataset.ocean === 'running' && window.__ocean.status().frame > 30, null, { timeout: 120_000 });
		for (const id of STEP_IDS) {
			for (const progress of [0.25, 0.8]) {
				await page.evaluate(([n, p]) => {
					const section = document.getElementById(`step-${n}`);
					const rect = section.getBoundingClientRect();
					const narrow = window.matchMedia('(max-width: 899.98px)').matches;
					window.scrollTo(0, rect.top + window.scrollY + p * rect.height - window.innerHeight * (narrow ? 0.75 : 0.5));
				}, [stepOf(id), progress]);
				const worst = await page.evaluate(() => new Promise((resolve) => {
					let last = performance.now();
					let most = 0;
					let frames = 0;
					const tick = (now) => {
						most = Math.max(most, now - last);
						last = now;
						frames += 1;
						if (frames < 90) requestAnimationFrame(tick);
						else resolve(most);
					};
					requestAnimationFrame(tick);
				}));
				gaps[`${screen.name} ${String(stepOf(id)).padStart(2, '0')} ${id} @${progress}`] = Math.round(worst);
				await page.screenshot({ path: join(outDir, `${screen.name}-${String(stepOf(id)).padStart(2, '0')}-${id}-${progress}.png`) });
			}
		}
		await page.close();
	}
} finally {
	await browser.close();
}
writeFileSync(join(outDir, 'frame-gaps.json'), `${JSON.stringify(gaps, null, '\t')}\n`);
console.log(JSON.stringify(gaps, null, '\t'));
if (errors.length > 0) {
	console.error(errors.join('\n'));
	process.exit(1);
}
```

Run:
```bash
cd /Users/cole/Projects/Wesbite-ocean-page && (OCEAN_PORT=8774 npm run serve:ocean >/dev/null 2>&1 &) && sleep 2 && OCEAN_PORT=8774 node scripts/ocean-walk.mjs /private/tmp/c2-walk; pkill -f "http.server 8774"
```
Expected: 112 PNGs, `frame-gaps.json`, no page error.

- [ ] **Step 3: Look, list, fix**

Open every PNG (both screens, hold and blend) and write a findings list before changing anything: per step, what is wrong on screen (panel text covered by the math box or bar, a graph label off its axis, an arrow hidden, a chart overflowing, the sea through the backdrop, the camera in the water, a blank inset, copy that does not match the picture). Note every step whose worst frame gap is over 50 ms on the laptop. Fix what is plainly broken (any file, a test first where one can catch it); leave matters of taste (framing, colours, pacing) for Cole, listed with the screenshot that shows them. Rerun the suites after the fixes:
```bash
ROBLOX_OCEAN_DIR=/Users/cole/Projects/roblox-ocean-web npm run test:ocean 2>&1 | tail -3 && OCEAN_PORT=8774 npm run test:ocean:e2e 2>&1 | tail -5
```
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add tests/ocean/e2e/walk.spec.js scripts/ocean-walk.mjs
```
```bash
git commit -m "test: the whole extended story walked on a laptop and a phone, with screenshots and frame gaps"
```
(Fixes found in Step 3 are committed separately as `fix: ...`.) Report: the findings list, what was fixed, what is left for Cole, the frame-gap table's worst rows, and the screenshot folder.
