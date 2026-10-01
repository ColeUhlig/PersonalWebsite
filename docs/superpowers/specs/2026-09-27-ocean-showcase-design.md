# Ocean Showcase — Design

**Date:** 2026-09-27
**Status:** Draft, awaiting review
**A1 (core port):** done on 2026-09-27; code at commit `a29cb26` (the final review's fix wave, after
`4a9aa21`): 21 modules, 159 carried-over Luau cases plus 28 new tests (187), line coverage 93.6% or
better per file. Node timing for one High-tier frame, cold (the first frame, V8 warm-up included):
cascades 3.8 ms, surface fill 3.8 ms; a warm second fill measured about 1.2 ms.
**Lives at:** `content/ocean/` → `https://coleuhlig.com/ocean/`
**Source project:** `~/Projects/roblox-ocean` (GitHub `ColeUhlig/tessendorf-ocean-roblox`, private), the
Sea of Thieves-style FFT ocean Cole built in Roblox.
**A2 (Roblox mode on screen):** done on 2026-09-29 at commit `7ad7cd4`: the live ocean at `content/ocean/` with cascade and painter workers (main-thread fallback), CPU-written surface, painted textures and 232 glowing materials; 234 unit and 12 browser tests. Look matched against the Studio deck and high captures in three lighting rounds. Cole's verdict in motion (2026-09-29): "looks pretty good". Not yet measured: frame rate on a real GPU and on a phone (the tier probe's thresholds need a phone measurement before piece C ships). Known look gaps: triangle faceting on near crests, a whiter sky near the horizon than Roblox's, faint far tiling.

**A3 (teaching stages, engine side):** done on 2026-09-30; code and tests final at commit `7cec38c` after the whole-branch review's fixes (this line is the commit after it): recipes for all 13 steps (parts, sea, look, camera shot, sliders with ranges and bindings) and their blending by scroll progress; teaching wave sources for steps 1 to 6 (one sine, and the prototype's 32 waves, 28 of them distinct after the snap to the 256-stud lattice, so step 6's repetition is real), both rolling towards the camera so their crests run across the view; per-stage switches so parts that are off cost nothing; cascade retune and painter update messages so sliders change the sea without restarting a worker or wiping the foam; growing bounds; chart data (spectrum curve, phase arrows, naive sum against FFT timed live); the dev route `?step=N&progress=P` (with `drift=` to pin the finale camera), and `scripts/ocean-stage-capture.mjs` to screenshot the steps. 403 unit and 44 browser tests (26 of them one per step, run on the probed tier and on Medium; the browser tests draw on the GPU through ANGLE Metal). A clearance check keeps every shot's lens out of the water over the whole loop: steps 11 and 12 look down from 20 and 18 studs, and the finale drifts at 21 studs rather than A2's deck height of 14, where crests crossed the lens (the page without `?step` keeps A2's deck); the finale's framing is Cole's call. Step 5's choppiness slider now runs to 2 (default 1.3): chop 0 against the default changes the frame by a mean 14.6 of 255 per pixel and the default against 2 by 8.1, against 2.9 over the old 0 to 1. Not yet seen or measured: Cole has not seen the steps in motion, only Claude's frozen screenshots of them; phones get Medium by rule (touch-first, screen under 900 px on its short side), and no step has been run on a phone. Step 6 (a steep look-down from 300 studs on the bank's 4 tallest waves, so the repeat shows as a regular lattice with no horizon) is a story call for Cole. Seen in Claude's screenshots, not tuned: step 5's sharpening shows mostly in the far crests; steps 7 to 9 are faceted and spiky rather than smooth; the ring squares show through step 1's wireframe; steps 4 and 5's sun highlight saturates to white at the frame's left edge; blocky near maps in the low shots of steps 11 to 13. Piece C builds the story on the director (`stages/director.js`).

## 1. Purpose

A showcase page that runs Cole's Roblox ocean live in the browser and builds it up from nothing, step by
step, the way Acerola's videos do ("How Games Fake Water", then "I Tried Simulating The Entire Ocean"):
a flat white plane, one sine wave, many sine waves, light, pointy crests, and on through the wave spectrum,
the FFT, cascades, foam and glow, until the full ocean is on screen.

Running through every step: **Roblox gives you none of the tools a normal engine uses for this** (no vertex
shaders, no pixel shaders, no GPU compute, no lighting hooks), and each step shows what we did instead.

**Audience:** people who know little about render pipelines or code (the story must make sense to them),
plus technical visitors (recruiters, developers, Roblox people) who should see real maths and real
engineering. **Success means:** a non-technical visitor scrolls to the end and can say, in their own
words, how a game ocean is built and why doing it in Roblox was hard; a technical visitor finds real
equations, real numbers and real Roblox code, and nothing overstated.

### Decided with Cole

- The ocean runs live on the page (not only video). A JavaScript port drives it; a separate panel runs the
  actual Luau modules compiled to WebAssembly and shows the two agree ("both, side by side").
- Proof it is Roblox: Studio footage and a "Play in Roblox" button to the public place. (Code excerpts
  appear inside the proof panel; they were not asked for as a separate section.)
- Every pipeline stage gets a step. The progression follows Acerola's order for a beginner.
- The "Roblox says no" story is woven into each step, not a separate act.
- Default rendering copies the Roblox pipeline exactly ("Roblox mode"); a toggle switches the same wave
  maths to GPU shaders ("Unleashed") to show what Roblox costs.
- Its own cinematic look: full-screen live ocean, the story scrolling over it in dark glass panels. It is
  not styled like the VEX page; it shares only the site-wide header and link back home.
- Engine approach A: module-by-module hand port, checked against the real Luau.
- Decided 2026-09-30 (Cole, before the headless build of B, A3, C, A4 and D): the hero sea is the rough
  default (the sea judged in A2); the copy is first person and casual ("I built this in Roblox, and
  Roblox fought me the whole way"); the page title is "Building an Ocean in Roblox"; the footage section
  is built with its film mode but stays hidden until Cole records clips; the roblox-ocean M4 branch is
  merged into main locally and the place is prepared for players, but Cole makes it public himself, and
  the Play button stays hidden until a public place URL is set; nothing is deployed: the work stays on
  the ocean-showcase branch; phones get the lighter tier by rule (screens under 900 px wide, touch-first
  devices), unmeasured, and the page's numbers say so. Plans for these pieces run without a per-plan
  review, on Cole's instruction ("execute the entire ocean website thing").

### Honesty rules

- Every number on the page is measured: Studio numbers come from `roblox-ocean/docs/research/bench.md`;
  web numbers are measured live in the visitor's browser and labelled as such.
- Our ocean uses at most 3 x 64 x 64 = 12,288 wave components on the CPU. The page says so, next to Acerola's GPU figure,
  and explains how the cascades make that look like more. It never implies GPU-scale wave counts.
- Acerola is credited as the inspiration for the progression, with links to both videos. The wording,
  visuals and code are ours. Other credits: Tessendorf (2001 course notes), the Atlas GDC talk (JONSWAP,
  scatter term), Rare's Sea of Thieves talk (foam, stylisation), howhow2315/JONSWAP-Ocean (the original
  Roblox ocean our prototype started from).

### Non-goals

- Sea spray, boats, buoyancy, wakes, underwater rendering.
- Calm / normal / stormy presets as a feature (the web wind slider covers calm-to-storm; the Roblox side
  has no presets yet).
- Any change to the Roblox ocean itself beyond the film mode (section 6.2) and the publishing preparation
  (section 6.3).
- Pixel-identical output to Roblox (section 4.5).

## 2. Page and layout

- A standalone page at `content/ocean/index.html`, linked from the site home page. It loads
  `/js/canonical-host.js` like every page on the site.
- **Layout:** one full-screen WebGL canvas, pinned. The story scrolls over it in dark translucent ("glass")
  panels, one per step, on the left third on desktop.
- **Mobile (< 900px):** the ocean is pinned to the top half; panels scroll beneath it. No horizontal scroll.
  The engine runs its lighter tier (section 4.4).
- **Each panel carries:**
  - one or two plain-English sentences;
  - one or two sliders that change the live ocean;
  - a collapsed "The math" line with the real equation (KaTeX), terms coloured to match what they control;
  - where the step has one, a red **"Roblox says no"** card: what a normal engine uses, why Roblox does not
    allow it, what we did instead, and one real number.
- **Camera:** each step declares a shot (position, target, move). Scrolling blends between shots. Between
  steps the visitor can drag to orbit; the next step's shot takes over again.
- **Opening:** the finished ocean full-screen, the title, and "Scroll to build it from nothing". The first
  scroll cuts to the flat white plane.
- **Finale:** section 3, step 13.
- **Libraries** (jsDelivr, exact pinned versions chosen and checked on npm at implementation time, via an
  import map; no build step): Three.js, GSAP + ScrollTrigger, KaTeX, and the WebAssembly Luau runtime
  (section 5).
- `prefers-reduced-motion`: camera moves become cuts; the ocean keeps animating only when the visitor
  presses play.
- No WebGL: the text, equations and footage still show, with a notice that the live ocean needs WebGL.

## 3. The story, step by step

> **Superseded on 2026-09-30 by section 10, "C2: the extended story".** The 13-step table below is
> what A3 and piece C built; C2 replaces it with 27 steps in six chapters plus the finale. It is kept
> as the record of what was built first.

Each step switches parts of the engine on (its "recipe", section 4.3). "Card" is the "Roblox says no" card.
Numbers are from the Roblox project and are re-checked against the repo when the copy is written.

| # | Step | Visitor sees and controls | The math | Card |
|---|---|---|---|---|
| 1 | A flat white plane | A white grid; toggle the wireframe | A grid of points | No way to hand the GPU your own moving mesh: the surface is built by code at runtime with EditableMesh, 224 patches in 5 rings plus a horizon |
| 2 | One sine wave | Height, length, speed sliders | $y = A \sin(kx - \omega t)$ | No vertex shaders: a script moves every point itself, 18,144 of them, every frame |
| 3 | Many sine waves | Wave count slider, 1 to 32 | Sum of sines | Every extra wave is another pass of a Luau loop over every point, on the CPU, inside the frame |
| 4 | Light | Sun direction; shading on/off | Normals, Lambert, specular, Fresnel | No pixel shaders: colour is painted into a texture; normal maps work on code-built meshes only if passed in when the surface is created (the documented way breaks the shine) |
| 5 | Pointy crests | Choppiness slider | Horizontal displacement, Gerstner form | none |
| 6 | The repetition problem | The camera flies up; the pattern tiles | Periodicity | No tessellation: detail is spent on the mesh itself, in clipmap rings (2, 4, 8, 16, 32 stud spacing) that snap to a world lattice as the camera moves |
| 7 | Real ocean data | Wind speed and fetch sliders; the spectrum chart | JONSWAP, directional spreading | none |
| 8 | A random ocean, moving | Seed button; spinning phase arrows beside the ocean | Gaussian amplitudes, dispersion $\omega = \sqrt{gk}$, Euler's formula | none |
| 9 | The FFT | Wave count: naive sum vs FFT, with measured timings | Inverse DFT and radix-2 FFT butterflies | No GPU compute: the FFT is written in Luau and runs on three worker Actors (Parallel Luau), 64 x 64 per layer; at most 12,288 wave components on a CPU script, against about 4 million on Acerola's GPU |
| 10 | Three layers of waves | Toggle each layer (256 / 64 / 16 studs); the tiling from step 6 disappears | Cascades and band splitting | The workers take turns, so the sea looked like it moved at 20 fps; a frame-counted cross-fade between results fixed it |
| 11 | Foam | Whitecap and fade sliders | Jacobian, accumulation and decay | No pixel shaders again: the foam field (256 x 256) runs on a painter worker and is painted into the 512 x 512 colour map, a quarter per frame; Roblox refuses texture writes to materials from game scripts (only plugins may), so every image is handed over when the material is created |
| 12 | Glow | Sun height slider; glow strength | The scatter term (height, view, sun, ambient) | No lighting hooks: the glow is an emissive mask plus one glow strength per patch, set on 232 separate materials every frame; Sea of Thieves' published mask measured wrong on our waves (it lit the sides of waves, not the crests) and was replaced by height above the mean surface |
| 13 | Finale | The full ocean; Roblox / Unleashed toggle; live performance numbers; Studio footage; the proof panel; Play in Roblox | — | A recap of every card, plus "things we believed about Roblox that turned out false" (from the project's ledger) |

Steps 2 to 6 run the Gerstner sum from `WaveSampler`, code that ran in the original Roblox prototype. From
step 7 on, the wave field is the real FFT pipeline.

## 4. The web ocean engine

### 4.1 Layout

```
content/ocean/
  index.html
  style.css
  media/                 footage clips (lazy-loaded), poster frames
  luau/                  WebAssembly Luau runtime and the generated Luau bundle (section 5)
  js/
    main.js              boot: WebGL check, tier, engine, story, render loop
    story.js             GSAP ScrollTrigger → active step and progress within it
    ui/                  panels, sliders, KaTeX lines, cards, charts, performance readout, proof panel
    core/                pure maths, no DOM, no Three.js; importable from Node
    workers/             cascade.worker.js, painter.worker.js
    render/              Three.js: surface, materials, horizon, sky and lighting, unleashed shaders
    stages/              one recipe per step
```

Tests live outside `content/` (which is uploaded as it is) in `tests/ocean/`, run with `node --test`, the
same arrangement as the VEX page's `tests/vex/`.

### 4.2 `core/`: one JavaScript twin per pure Luau module

Twins of `Spectrum`, `FFT`, `Cascade`, `WaveField`, `Jacobian`, `FieldStore`, `OceanClock`, `RingLayout`,
`SurfaceSampler`, `Swells`, `WaveSampler`, `FoamField`, `FoamPaint`, `WaterColour`, `PeakMask`,
`NormalTexels`, `ScatterLobe`, `MapRotation`, `Tier`, `Jonswap` (the prototype's wave bank, which steps 3
to 6 draw from) and `FoamRoughness` (about 2,900 lines of Luau), plus `random.js` (section 4.6), `luau.js`
(the Luau semantics JavaScript lacks: floored modulo, `math.round`, `bit32`, float32 `Color3`) and small
teaching helpers for steps 1 to 6. One addition the Luau does not have: `Spectrum.validateParams` rejects a
zero or negative wind, fetch or depth with a clear error, because sliders reach places Studio never did. Same names (camelCase files), same inputs, same
outputs, same constants. Typed arrays stand in for Luau `buffer`s with the same byte layouts, so the Luau
comparison (section 5) can compare bytes. The constants come from the Roblox project's `Look.luau` and
`Spectrum.NORMAL`. The hero sea state is chosen with Cole during A2, starting from what the Roblox place
runs on the day (on 2026-09-27: wind 12 m/s, fetch 80,000 m, isotropy 0.4, with the calm trial at
`OceanScale` 4 and whitecap 0.55).

### 4.3 `workers/` and `stages/`

- **Cascade workers (3):** twins of `CascadeWorker`. Each owns one layer, evolves and transforms it, and
  posts its field buffers back as transferables, the way the Roblox Actors reply by message. The
  coordinator promotes results on the same frame schedule as `FieldStore.promote`.
- **Painter worker (1):** twin of `PainterWorker`: fills one map per frame (colour, peak mask, normal) and
  steps the foam field a quarter at a time.
- **Stage recipes:** each step declares which engine parts are on (flat plane, wave source, lighting,
  choppiness, layers, foam, glow, maps), its slider bindings, and its camera shot. The engine reads the
  blended recipe every frame; parts off in a recipe cost nothing.

### 4.4 `render/`: Roblox mode and Unleashed

- **Roblox mode (default).** Copies the Roblox constraints:
  - the vertex positions and normals are written from JavaScript every frame into the ring geometry
    (18,144 vertices on the High tier), with no vertex shader doing displacement;
  - colour 512, peak mask 128 and the ripple normal map (512, tiled from a 128 block) are painted on the
    worker and uploaded as textures, one map per frame; foam 256 is painted into the colour map;
  - 232 patch materials (224 patches plus 8 horizon quads), each with its own emissive strength from
    `ScatterLobe`;
  - the same rings, lattice snapping, skirts, horizon and cross-fade.
- **Unleashed.** The same field buffers go to the GPU as float textures. Displacement moves into a vertex
  shader; colour, glow (the scatter term per pixel), foam and normals are computed per pixel at full field
  resolution; sky reflections with Fresnel. The wave maths does not change.
- **Tiers:** High on desktop; a lighter tier on phones (fewer ring vertices, smaller maps), selected the
  way the Roblox `Tier` module selects, with a URL override for testing.

### 4.5 Matching the Roblox look

Three.js lighting is not Roblox's (Future lighting, Atmosphere, SurfaceAppearance). "Matching" means close
side by side, not pixel-identical. The check: capture the Roblox ocean in Studio (Edit-mode preview,
`scripts/m2_preview.py`) and the web ocean from the same three cameras (deck, high oblique, crest
close-up) at the same frozen time, compare, and only then show Cole, who judges.

### 4.6 Randomness

The Luau `Cascade` draws its starting waves from Roblox's `Random.new(seed)`, which exists only inside
Roblox and whose algorithm Roblox does not publish. The web engine uses a documented generator,
xoshiro128** 1.1 (Blackman and Vigna) seeded through a SplitMix32 finaliser, in `core/random.js`, and the
Luau bundle (section 5) swaps in a Luau implementation of the same generator. It was chosen over PCG32
because it needs only 32-bit multiplies, where PCG32 needs 64-bit integer multiplies Luau does not have.
Every `nextU32` step is a 32-bit xor, shift or rotate or a multiply by 5 or 9, all exact in Luau's doubles
and `bit32`. The seeding is not exact as written: the fmix32 finaliser in `create(seed)` multiplies 32-bit
values by `0x85ebca6b` and `0xc2b2ae35`, and in Luau `(z * 0x85ebca6b) % 2^32` loses low bits once
z >= 2^21 (the product passes 2^53). The Luau shim must do those two multiplies as a `mul32(a, b)` built
from 16-bit halves (what `Math.imul` does in the JavaScript), and it must reproduce the test vectors of
"SplitMix32 seeding matches the reference C code" in `tests/ocean/core/random.test.js`. Reference outputs (state 1, 2, 3, 4:
11520, 0, 5927040, 70819200, 2031721883, 1637235492) were checked against the reference C code. Consequence, stated on the page: the web ocean is the same kind of sea as the game, not the
same individual waves.

## 5. The Luau proof panel

- **Bundle:** a new script in the Roblox repo, `scripts/web_bundle.py` (modelled on `m2_preview.py`),
  inlines the pure modules that the panel runs (`Spectrum`, `FFT`, `Cascade`, `WaveField`, `Jacobian`,
  `FoamField`, `WaterColour`, `PeakMask`) into one Luau chunk with shims for the Roblox-only globals they
  touch (`Random` → the xoshiro128** of section 4.6, `Color3`, `Vector3`). Its output is copied into
  `content/ocean/luau/` and committed, so the site keeps no build step.
- **Runtime:** official Luau compiled to WebAssembly. First choice: the `luau-web` npm package (MIT),
  checked at implementation time for a Luau version with the `buffer` library. Fallback: build Luau from
  its official repository at a pinned release with its `LUAU_BUILD_WEB` option (Emscripten).
- **Panel:** "This is the actual Roblox code, running in your browser." A button runs one cascade at one
  seed through the Luau bundle (in a worker) and through the JavaScript twin. It shows the two height maps,
  a difference image, the largest absolute difference, and both timings, next to the `.luau` source that
  ran. Loaded only when the visitor scrolls near it.
- **Pass line:** the largest difference is within float32 rounding (the fields are stored as float32 on
  both sides; the exact tolerance is fixed by the first measurement and written into the test).

## 6. The Roblox side (in `~/Projects/roblox-ocean`)

### 6.1 Prerequisite

M4 (foam) is merged to `main` before any footage is recorded or the place goes public.

### 6.2 Film mode and footage

- A client script, active only when the Workspace attribute `OceanFilm` names a shot, flies the camera
  along fixed paths: `deck` (sailing height), `flyup` (rise until the far field shows, no tiling),
  `crest` (low close-up on foam and glow), and `studio` (a slow orbit for a recording that includes the
  Studio window and profiler).
- Cole records with macOS screen recording (Cmd+Shift+5); the MCP cannot capture Play on this Mac. Claude
  compresses each clip with ffmpeg (WebM plus MP4, a few MB each) with a poster frame.

### 6.3 Play in Roblox

Needs Cole's explicit go-ahead; nothing is made public during the build. Preparation before that point:
tests and probes stay out of player builds; players spawn on the invisible floor; one check on a phone or
the Low tier. After publishing, the live-client measurement of `--!native` (ledger row P4) is taken and
its result goes on the page, whatever it is.

## 7. Testing

- **Core:** `node --test` for every `core/` module, with the expected numbers carried over from the matching
  Luau spec (the Roblox suite has 164 cases).
- **Parity:** a Node test runs the Luau bundle through the WebAssembly runtime and the JavaScript twins at
  the same seeds and compares bytes (section 5 pass line).
- **Visual:** section 4.5, before Cole sees any look. Never judged from a single still: at least the deck and
  high views, and in motion before a look is called done.
- **Performance:** a built-in readout (fps, per-stage milliseconds) doubles as the page's live numbers.

## 8. Targets

- 60 fps in Roblox mode on a normal laptop; 30 fps or better on a recent phone at the lighter tier.
- The text renders immediately; the ocean starts within a few seconds on broadband. Footage and the
  WebAssembly Luau (about 2 MB) load lazily.
- No console errors; a worker that fails to start falls back to running that layer on the main thread and
  says so in the readout.

## 9. Build order

Each piece gets its own implementation plan when it is reached.

1. **A1 Core port:** `core/` twins and their tests. No visuals.
2. **A2 Roblox mode on screen:** workers, rings, painter, patch glow; passes section 4.5.
3. **B Proof panel:** bundle script, WebAssembly runtime, parity test and panel. Early, because it is the
   riskiest piece and catches a twin that disagrees with the Luau before the page is built on it.
4. **A3 Teaching stages:** the engine side of all 13 steps.
5. **C The page:** story, panels, sliders, equations, cards, opening, finale.
5b. **C2 The extended story** (section 10): 27 steps in six chapters plus the finale, the always-on
   math box, the flat graph that becomes the surface. Built on piece C's page; C's walk and final
   review wait for it.
6. **A4 Unleashed.**
7. **D Roblox side:** M4 merge, film mode, recordings; the public place when Cole says go.

## 10. C2: the extended story (2026-09-30)

**Status:** approved by Cole on 2026-09-30 (evening), after viewing piece C's page on localhost. This
section supersedes section 3's 13-step table (kept above, marked superseded) and the parts of section 2
it contradicts (the opening's "first scroll cuts to the flat white plane", the collapsed-only math).
Everything else in sections 1, 2, 4 to 8 still holds, the honesty rules above all.

### 10.1 Why

Cole, viewing the built page: "it's pretty good. There's just some things that I just don't like. First
of all, the math is hidden. i want a box in the top right with the math the whole time. I think it just
goes too fast and glosses over too many things. i would start instead of with a mesh already with just a
2d sine wave, then a sum of sines in 2d. then we add that to a 3d surface, then we make it go in all
directions, etc. more like the acerola video. we gotta take it slower and explain more. i dont think we
even talk about normal vectors or how we created our textures and sampled from them. we glazed over a
bunch of shit."

### 10.2 Decisions (Cole's answers, 2026-09-30)

- **The restructure:** 27 steps in six chapters plus the finale (28 sections), paced like Acerola's two
  videos ("How Games Fake Water", then "I Tried Simulating The Entire Ocean"), and an always-on math box.
  Cole: "Yes, write it up".
- **The flat opening becomes the surface:** "Side view that becomes 3D". The ocean canvas starts as a
  flat graph, a side-on view of one curve; in step 4 the camera swings round and the curve turns out to
  be the edge of a surface. One continuous camera move, no cut.
- **The opening:** "Keep the hero, then go dark". The page still opens on the finished rough sea with
  the title as the hook; the first scroll goes into the dark graph, where the build starts from nothing.
- **The math on a phone:** "Pinned bar, tap to expand". A slim bar under the ocean half always shows the
  current equation in small type; a tap opens the full box with its term colours.
- Decided while planning (Claude, from the above and the honesty rules): the finale stays its own step
  (step 28), so the story is 27 teaching steps plus the finale; steps are named by id (`sine`,
  `into-3d`, ... `finale`) and their numbers follow from their order; the chapter labels are words
  ("Chapter one"), so a label never needs a sourced number; no title or copy uses a digit where a word
  will do ("From a line to a surface", not "Into 3D"), for the same reason.

### 10.3 The math box

- **Desktop (900 px and wider):** a glass card fixed at the top right, under the site link, visible from
  step 1 to the end (hidden over the opening, which keeps the hero clean). It shows "the equation so far"
  for the step being read, typeset by KaTeX with the same term colours as the sliders (raw TeX source
  until KaTeX arrives, and for good if it never does). On entering a step, the terms that step adds glow
  for about a second (a static tint under reduced motion), and one plain sentence under the equation
  says what changed. A Hide/Show button collapses it to its title bar for small laptops; the choice is a
  per-viewer convenience kept in localStorage inside try/catch, so a browser that refuses storage just
  forgets it.
- **Phone (under 900 px):** a slim bar pinned at the top of the lower half, directly under the ocean,
  showing the current equation in small type on one line. A tap (or Enter or Space) opens the full box
  as a sheet over the lower half, with the same equation, term colours and "what changed" line; a close
  button or Escape puts it back and returns focus to the bar. The bar's height is added to the lower
  half's top padding and the scroll padding, so it never covers a panel's first line.
- The per-panel "The math" details stay, for longer derivations and notes; the box carries the short,
  cumulative form. KaTeX now loads when the story first reaches step 1 (the box needs it at once), not
  only when a details line is opened.
- The box's sentences follow the copy rules: first person or plain, casual, and no number that is not
  sourced (in practice, the box's sentences carry no digits at all; numbers live in the equations,
  which are maths).

### 10.4 The flat graph that becomes the surface (steps 1 to 4, and 14 and 15)

- Drawn in the main three.js canvas by a graph stage, not as a separate picture: a dark backdrop that
  covers the sky and the world, axes in studs, and the curve, computed every frame from the engine's own
  wave source (`WaveSampler` over the same sine or teaching bank the surface is written from) along the
  plane the camera faces. Heights on the graph are drawn four times taller than they are, and the
  height axis says so; by the end of step 4 the curve is drawn at true scale, on the surface's edge.
- In step 3 each summed wave is also drawn alone as a faint curve under the bold sum.
- The camera stands side-on: it looks along +x at the plane x = 0, and the waves travel along +z, so
  the curve slides left to right. It stands a hair above the target, just inside the orbit limit's
  tilt, so applying the shot never tilts it.
- The surface is clipped to a band around the graph's plane (the stage look clips every surface
  material). While the graph shows, the band is a stud wide and the sea is hidden behind the curve; in
  step 4 the band grows behind the curve as the camera swings up and round, so a sheet unrolls from the
  curve; into step 5 it grows towards the camera too until the clip is gone. The band grows on a log
  scale, so the water fills in mostly once the camera is high, and the lens never meets the water
  (the clearance check counts a camera on the dry side of the band as clear).
- The teaching bank's headings get a "spread" (`bank.fan`, 0 to 1): at 0 every wave lies along +z with
  its wavevector rounded to the 256-stud lattice (so the flat graph and its frequency spikes are exact),
  at 1 the bank is exactly A3's. The spread lerps between neighbouring steps, so in the step 4 to 5
  blend the waves fan out from one heading to their own, and step 5's slider lets the visitor do it.
- While the graph shows (its backdrop half or more opaque) the visitor's orbit and the phone's tilt are
  held, so nobody drags the camera off the graph into the clipped emptiness.
- Steps 14 and 15 go back to the dark graph ("back to two dimensions") with the bank laid along one
  axis again, beside the frequency-domain charts.

### 10.5 The opening: the hero, then dark

The opening is the finished rough sea under the deck camera with the title and "Scroll to build it from
nothing", exactly as piece C built it. The first step is the dark graph: crossing from the opening into
step 1 cuts the camera to the graph shot, and the graph's backdrop fades in over about a third of a
second (no fade under reduced motion). Scrolling back up to the opening fades it out again onto the
finished sea.

### 10.6 Light, split into its terms (steps 7 to 11)

A stage-look material for the teaching steps whose terms switch on one at a time, each matching a term
in the math box: an unlit white blob (step 7); the sea colour times sky ambient plus Lambert
`max(0, n·s)` (step 10); plus a Blinn-Phong highlight `(n·h)^p`; plus Schlick's Fresnel `F` mixing in a
sky colour from the reflected direction, `c = (1 − F) c_lit + F c_sky` (step 11, with a switch for each of the last two). The surface's
vertex normals are the ones the engine writes from the waves' exact slopes. The painted Roblox-mode
materials are untouched: the page without `?step`, before the first scroll, is identical to A2.

### 10.7 The steps

"Card" is the "Roblox says no" card. Every number in a card or panel is sourced in the copy check or
live; a card whose claim has no sourced number has no "The number" row. "Math" is what the math box
shows, cumulative: each step's equation keeps what the lesson builds on.

| # | id | Step | Visitor sees and controls | Math (box) | Card |
|---|---|---|---|---|---|
| | | **Opening** | The finished rough sea, the title, "Scroll to build it from nothing" (as built) | (box hidden) | — |
| 1 | `sine` | One sine wave | **Chapter one: One wave.** The dark graph: one still sine curve, axes in studs, heights drawn four times taller; markers for the height A and the length λ. Height and Length sliders | `y = A sin(kx)`, `k = 2π/λ` | none |
| 2 | `moving-sine` | Make it move | The curve slides along. Speed slider | `y = A sin(kx − ωt)` | none |
| 3 | `sum-of-sines` | Adding waves together | The teaching bank's tallest waves, all laid along one axis: each a faint curve, their sum bold. Waves slider (1 to 8) | `y = Σᵢ Aᵢ sin(kᵢx − ωᵢt + φᵢ)` | none |
| 4 | `into-3d` | From a line to a surface | The camera swings up and round: the curve was the edge of a white wireframe sheet, the same sum stretched along the other axis, unrolling behind it. Wireframe switch | `y(x, z, t) = Σᵢ Aᵢ sin(kᵢx − ωᵢt + φᵢ)`: nothing depends on z | No vertex shaders (piece C's step 2 card: a script writes every point, 18,144 on the top tier; 3.5 ms with native code, 7.7 ms without) |
| 5 | `directions` | Waves going somewhere | The sheet fills the view and each wave gets its own heading back; an arrow per wave on the surface fans out. Spread slider (0: all one way; 1: the bank's own headings) | `θᵢ = kᵢ(d̂ᵢ·x) − ωᵢt + φᵢ` | none |
| 6 | `many-waves` | Lots of waves, lots of directions | More of the bank, tallest first, headings spread around the wind (never "all directions": they lie within 45° either side of one heading). Waves slider with the live timing beside it | `y = Σᵢ₌₁ᴺ Aᵢ sin θᵢ` | Every extra wave is another trip of a Luau loop over every point (piece C's step 3 card; "measured live above") |
| 7 | `unlit` | Shape isn't enough | **Chapter two: Light.** The wireframe off: a white blob with no form. Wireframe switch | `c = white` | none |
| 8 | `normals` | Which way the surface faces | Arrows out of the surface on a grid round the camera's target, from the engine's exact normals; at one point the tangent and binormal too | `T = (1, ∂ₓy, 0)`, `B = (0, ∂_z y, 1)`, `n = (B × T)/‖B × T‖` | none |
| 9 | `slopes` | Getting the slope | Two arrows per point: from the central difference (heights sampled h studs either side) and from the exact derivative; the mean angle between them, live. Sample spacing slider (h) | `∂ₓy ≈ [y(x+h) − y(x−h)]/2h` beside `∂ₓy = Σᵢ Aᵢkᵢd̂ᵢₓ cos θᵢ` | none |
| 10 | `diffuse` | Sunlight | The sea colour lit by the sun alone (Lambert) plus sky ambient. Sun direction slider | `c = c_sea (a + max(0, n·s))` | none |
| 11 | `highlights` | Highlights, Fresnel and the sky | Add the highlight, then Fresnel with a sky reflection. Highlight and Fresnel-and-sky switches | `c = (1 − F)(c_sea(a + max(0, n·s)) + (n·h)^p) + F c_sky`, `F = F₀ + (1 − F₀)(1 − n·v)⁵` | What Roblox's own lighting does for me: no pixel shaders, so Roblox's material lighting supplies the highlight, Fresnel and sky reflections and the game sets a roughness (sourced claims only; no number row unless one is sourced) |
| 12 | `gerstner` | Sharper peaks | **Chapter three: Better waves.** Choppiness (piece C's step 5, side-on). Gerstner is what the teaching bank uses, as the original Roblox prototype did; mention Acerola's preference for another wave shape only if sourced and true to our work | `x′ = x + c Σᵢ d̂ᵢ Aᵢ cos θᵢ` | none |
| 13 | `tiling` | The tiling problem | Fly up; it repeats (piece C's step 6) | `y(x + L e) = y(x)` | none (the rings card moves to step 24) |
| 14 | `frequency` | Time and frequency | **Chapter four: The real ocean.** Back to the dark graph with the bank laid along one axis; a panel chart shows the same waves as spikes in the frequency domain, from the engine's FFT over one 256-stud tile. Waves slider | `y(x) = Σ Aᵢ sin(kᵢx + φᵢ)` ⟷ a spike of height Aᵢ at each kᵢ | none |
| 15 | `fourier` | Taking a chord apart | A panel chart: three tones summed into a chord; the FFT finds three spikes; switch a tone off and the inverse FFT rebuilds the chord without it. A switch per tone | `ŷ = 𝓕{y}`, `y = 𝓕⁻¹{ŷ}` | none |
| 16 | `jonswap` | Real ocean data | Piece C's step 7: wind and fetch, the spectrum chart; the FFT sea, one layer, no chop yet | JONSWAP `S(ω)` | none |
| 17 | `random-sea` | A random ocean | New sea button; the tallest waves of the 256-stud layer as arrows, held still: random heights and starting angles as complex numbers | `h̃₀(k) = ½(ξᵣ + iξᵢ)√(S(k)ΔkₓΔk_z)` | none |
| 18 | `time` | Setting it moving | The arrows turn at the speeds the dispersion gives them (piece C's step 8 wording), looping every 120 s; the sea moves | `h̃(k,t) = h̃₀e^{−iωt} + h̃₀*(−k)e^{iωt}`, `ω = √(gk tanh kd)` | none |
| 19 | `fft` | The FFT | Piece C's step 9: wave-by-wave sum against the FFT, timed live | `O(N⁴) → O(N² log N)` | No GPU compute (piece C's step 9 card) |
| 20 | `choppiness` | Choppiness | The FFT sea from the side; a second set of transforms gives the sideways push. Choppiness slider | `D(x,t) = Σ i (k/|k|) h̃ e^{ik·x}`, `x′ = x + cD`: the code's sign (`core/cascade.js`), which moves water toward the crests; Tessendorf writes −i | none |
| 21 | `layers` | Three layers of waves | Piece C's step 10: layer switches; the layers hide the tiling, they do not remove it | `h = Σⱼ hⱼ` | Workers take turns (piece C's step 10 card) |
| 22 | `fields` | The answer is a grid of numbers | **Chapter five: Textures.** A panel inset: the 256-stud layer's height, slope and sideways fields as images, live from the engine's field store | `hᵢⱼ, ∂ₓhᵢⱼ, Dₓ,ᵢⱼ` on an N × N grid | none |
| 23 | `sampling` | Reading between the grid points | An inset zoomed on one point among its four grid neighbours with the bilinear weights, sliding across the tile's edge so the wrap shows; the blended value beside the engine's own sampler's | bilinear blend with indices mod N | No vertex shader, so no texture hardware for this: the four-texel blend is Luau arithmetic for every vertex and layer (number only if sourced) |
| 24 | `mesh` | The mesh | Wireframe over the painted sea: rings round the camera, snapped to the world grid. Wireframe switch | `Δᵣ = 2^r studs`, centre `Δᵣ round(p/Δᵣ)` | Piece C's step 1 and step 6 cards merged: no GPU mesh you can move, no tessellation; EditableMesh rings; 224 patches in 5 rings; points 2, 4, 8, 16 and 32 studs apart |
| 25 | `painted` | Painted maps | An inset with the live colour, glow-mask and ripple maps from the painters' real output; two worker threads paint them and each frame hand Roblox one band of colour and the mask or the ripple map in turn | the ripple map's bytes: `(nₓ, n_z, n_y)/2 + ½` (checked against `core/normalTexels.js`) | Piece C's step 4 card, plus the "only plugins can swap textures" sentence from its step 11 card |
| 26 | `foam` | Foam | **Chapter six: The look.** Piece C's step 11 | Jacobian, accumulation and decay | Piece C's step 11 card, less the sentence that moved to step 25 |
| 27 | `glow` | Glow | Piece C's step 12 | the scatter term | Piece C's step 12 card |
| 28 | `finale` | The whole thing | Piece C's finale, unchanged: live numbers, footage, proof panel, Play, recap (updated for the cards that moved), believed list, credits | the step-27 equations, nothing new highlighted | recap |

Steps 1 to 15 run the teaching sources (the sine, then the teaching bank through `WaveSampler`); from step
16 the wave field is the real FFT pipeline, one layer until step 21 brings in all three. Steps 16 to 19 run
the FFT sea without chop, so step 20 is where the sideways push arrives.

### 10.8 What stays

The engine, the director (read-only for other steps: `slidersFor`/`valueOf`), the blending, the camera
and shot control, the hold while reading (each step holds its recipe for the first half of its section),
the flat-sea hold on jumps into FFT steps, the finale's drift and its ease back, the orbit limits, the
sliders and the URL knobs held to them, the charts, the copy check, the proof panel, the finale, the
phone gyroscope, reduced motion (cuts, no blending, no drift), the phone layout (ocean in the top half,
no horizontal scroll) and site-absolute asset paths. The dev route `?step=N` also takes a step id
(`?step=into-3d`).

### 10.9 Tests that cover it

Every new shot and every blend between neighbours passes the lens clearance check and the world-edge
check (with the graph's band and backdrop taken into account); every step has a browser check through
the dev route; the copy check covers every panel and the math box's sentences; the per-step slider
swatches match terms in both the panel's math and the box's.
