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
4. **A3 Teaching stages:** steps 1 to 8.
5. **C The page:** story, panels, sliders, equations, cards, opening, finale.
6. **A4 Unleashed.**
7. **D Roblox side:** M4 merge, film mode, recordings; the public place when Cole says go.
