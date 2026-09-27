# VEX Motion Explainer — Design

**Date:** 2026-09-27
**Status:** Draft, awaiting review
**Lives at:** `content/vex/` → `https://coleuhlig.com/vex/`

## 1. Purpose

A showcase page for Cole's personal site that visually explains the motion software behind his VEX robots:
how a robot knows where it is (odometry), how it drives to places (PID, heading correction, motion
profiles), how it follows curves (paths, pure pursuit, boomerang), and how it corrects its own drift
(distance-sensor resets, Kalman filtering).

**Success means:** someone who has never heard of odometry scrolls through and comes away understanding it,
and someone technical (a recruiter, mentor, another team) sees real algorithms rendered with polish.
Presentation and explanation come before simulation accuracy.

### Decided with Cole

- A scroll-driven story (explainer), not a playable game or a dashboard.
- Algorithms, not library ports. Cole's code spans LemLib, EZ-Template and RW Template; each library matters
  only as the source of a technique worth explaining. Autons are not ported.
- Our own Three.js field and robot. xRC Simulator is closed source, so nothing is taken from it.
- Controller math is ported from LemLib (MIT) and EZ-Template (MPL-2.0), credited on the page. Visual ideas
  are taken from LemLib Path-Gen, path.jerryio and rcya1's pure pursuit visualizer (all GPL-3.0). We study
  them but copy no code.
- Explanations follow the Purdue SIGBots wiki (CC BY-SA): its teaching order and notation, our own wording,
  and each chapter links to its wiki page.
- Chapter 8 covers Cole's own distance-sensor localization and adds a short Kalman filter section.
  RAMSETE is out (Cole doesn't use it).

### Non-goals

- Running real PROS/C++ code in the browser.
- Game-specific field elements, scoring, match flow.
- Physics fidelity beyond what makes the visuals honest (drivetrain kinematics, motor lag, slip, noise).

## 2. Page and layout

- A standalone page at `content/vex/index.html`, linked from the site home page (`content/index.html`).
  It loads `/js/canonical-host.js` like every page on the site.
- **Desktop:** the 3D field is pinned on the right (~60% of the width) and the chapter text scrolls on the left.
- **Mobile (< 900px):** the field is pinned to the top ~50% of the screen and the text scrolls beneath it.
  No horizontal scrolling. Try-it controls sit in the text column.
- **Visual style:** dark "engineering blueprint" theme. Each overlay color means one thing on every chapter:

  | Meaning | Color |
  |---|---|
  | True robot pose ("ghost") | translucent white |
  | Odometry estimate / the robot | cyan |
  | Targets, goal points, carrots | amber |
  | Error, drift | red |
  | Construction geometry (arcs, circles, lerp lines) | magenta |
  | Paths | colored by speed, green → yellow → red |

  Formula terms use the same color as the geometry they describe.
- **Libraries** (loaded from jsDelivr with exact pinned versions, chosen and checked on npm at implementation time,
  via an import map): Three.js, GSAP + ScrollTrigger, KaTeX. No build step.
- `prefers-reduced-motion`: camera moves and auto-playing animation become instant state changes, and
  scroll still steps through the beats.
- No WebGL: the text shows without the field, plus a notice saying the 3D view needs WebGL.

## 3. Architecture

```
content/vex/
  index.html
  style.css
  js/
    main.js              boot: WebGL check, create scene/sim/story, start render loop
    story.js             GSAP ScrollTrigger → active chapter + progress within it
    core/                pure math, no DOM, no Three.js; importable from Node
      random.js          seeded RNG (reproducible chapters, deterministic tests)
      geometry.js        vectors, angle wrap, rotations, line–circle intersection
      drivetrain.js      tank-drive kinematics, motor lag, slip → next true pose
      sensors.js         true motion → tracking-wheel / motor-encoder / IMU / distance readings (+ noise)
      odometry.js        5225A arc method (port of LemLib TrackingWheelOdometry::update)
      pid.js             PID with windup handling and exit conditions
      heading-correction.js  EZ-style drive-straight
      motion-profile.js  trapezoidal and S-curve profiles
      bezier.js          cubic Bézier: point, derivative, curvature, de Casteljau levels, arc-length sampling
      pure-pursuit.js    goal point search (bounded line–circle), curvature to goal
      boomerang.js       carrot point (port of LemLib moveToPose)
      distance-reset.js  two-sensor wall localization + plausibility checks
      kalman.js          1D Gaussian predict / update
      sim.js             fixed 10 ms step combining the pieces above
    scene/
      style.js           shared matte materials + edge-outline helper (see "3D models" below)
      field.js           procedural V5 field: 6×6 tiles of 24", perimeter walls, markings
      robot.js           procedural robot: box chassis, 4 drive wheels, tracking wheels, IMU, 2 distance
                         sensors; named parts can be highlighted/spun; x-ray (semi-transparent chassis) mode
      camera-rig.js      perspective ↔ top-down orthographic transition
      overlay.js         2D drawing layer lined up with the field (world → screen projection);
                         arcs, circles, rays, dimension lines, trails, labels
      graphs.js          small live time-series graphs (error, velocity, P/I/D terms)
    chapters/
      01-odometry.js … 09-finale.js   one file per chapter
  vendor/                (empty unless a library must be self-hosted)

tests/vex/               node:test unit tests for js/core/* (not deployed)
tests/e2e/               Playwright smoke test (not deployed)
package.json             repo root; devDependencies + "test" scripts only (not deployed)
```

### 3D models

- **For now, no CAD.** The field and robot are built in code from simple shapes. The robot is a box chassis
  plus only the parts the chapters point at: 4 drive wheels (they spin at simulated speed), left/right/strafe
  tracking wheels (they spin), an IMU block, and rear + left distance sensors (with laser beams when active).
  Part positions come from one shared `robotConfig` (track width, wheel offsets s_L/s_R/s_S, sensor mounts),
  and the same config feeds `core/`, so the model and the math always agree.
- **Look:** matte materials with crisp edge outlines (a clean CAD-render look) on the dark theme. For the
  flatten beat, shading fades out and only the outlines remain, so the 3D robot becomes the 2D diagram.
- **Swapping in CAD later:** `robot.js` and `field.js` each export a builder that returns
  `{ root: THREE.Object3D, parts: { name → Object3D } }`. A later glTF loader only has to return the same
  shape, with the named parts (`driveWheels`, `trackingWheels.left|right|strafe`, `imu`,
  `distanceSensors.rear|left`, `chassis`), and no chapter code changes. Future sources: Cole's early-season
  robot CAD (Onshape export → glTF), with sensors added from VEX's official parts CAD if missing, and VEX's
  official field CAD. Raw CAD would live in a git-ignored `cad-src/`; optimized `.glb` files
  (field < 4 MB, robot < 3 MB) in `content/vex/models/`. Not part of the current milestones.

### Core rules

- All `core/` functions are pure and immutable: they take state and return new state, and never mutate their
  inputs. Randomness always comes from an injected seeded RNG.
- All units are inches, radians, seconds and inches/second, matching the SIGBots wiki. Headings are displayed
  in degrees.
- Visualization data is a first-class output. For example, `odometry.update(pose, readings, config)` returns
  `{ pose, debug }`, where `debug` holds the arc center, radius, local chord, rotation angle and Δθ used for
  that tick. Chapters draw from `debug` instead of recomputing the math.

### Sim loop

`sim.step(state, commands, dt = 0.01, rng)` returns a new state containing:
- `truth`: the actual pose and wheel velocities (from `drivetrain`)
- `readings`: sensor readings for this tick (from `sensors`, with noise)
- `estimate` + `odomDebug`: from `odometry`
- `history`: bounded ring of past states for trails and graphs (the last 20 s)

Controllers only ever see `estimate`, like a real robot. The gap between the white ghost (truth) and the cyan
robot (estimate) is how drift is shown.

The render loop runs on `requestAnimationFrame` and advances the sim in whole 10 ms steps with an accumulator
(capped at 10 steps per frame so a background tab doesn't cause a spiral of catch-up steps). Scroll-scrubbed
beats don't run the live loop. They compute the state for a given progress value (which is deterministic
thanks to the seeded RNG and precomputed runs), so scrolling backwards works.

### Chapter interface

```js
export default {
  id: 'odometry',
  title: 'How does a robot know where it is?',
  wikiUrl: 'https://wiki.purduesigbots.com/software/odometry',
  beats: 11,                      // number of scroll steps
  setup(ctx) {},                  // build overlays/UI; ctx = { scene, overlay, graphs, camera, sim, ui }
  progress(p) {},                 // p ∈ [0, beats]; fractional = between beats
  frame(dt) {},                   // live loop (try-it sections only)
  teardown() {},                  // remove everything setup() added
};
```

`story.js` makes sure exactly one chapter is set up at a time and calls `teardown()` before the next chapter's
`setup()`, in both scroll directions.

## 4. Chapters

Each chapter: scroll beats → one "Try it" interactive → credit/wiki link.

### 1. Odometry: "How does a robot know where it is?" (centerpiece)

Notation from the wiki: ΔL, ΔR, ΔS for wheel travel; s_L, s_R, s_S for wheel offsets from the tracking center.

1. **Opening shot.** The camera slowly orbits the 3D field while the robot drives an S-curve and leaves a glowing trail.
2. **No GPS.** The field fades to dark, leaving only the robot. The text: it has no cameras watching the field, only its own sensors.
3. **The sensors.** The camera moves in close and the chassis goes x-ray. Left, right and strafe tracking wheels light up with offset dimension lines; the IMU pulses.
4. **The flatten.** The camera rises to overhead and the perspective eases into orthographic. The 3D robot cross-fades into its 2D diagram (rectangle, wheel lines, dimension marks).
5. **Heading from wheels.** `Δθ = (ΔL − ΔR) / (s_L + s_R)`, shown as the two parallel wheels tracing arcs of different lengths. The IMU is then introduced as the simpler alternative.
6. **One tick.** Time freezes on a single 10 ms step. Draw the arc, its center, the radius `ΔR/Δθ + s_R` and the chord. The KaTeX formula `Δd_local = 2 sin(Δθ/2) · [ΔS/Δθ + s_S, ΔR/Δθ + s_R]` appears with each term colored like its geometry.
7. **Robot frame → field frame.** Local and global axes are both drawn, and the chord rotates by `θ + Δθ/2` into field coordinates.
8. **Stacking ticks.** Time speeds up. Tiny arcs chain into the S-curve from the opening shot while the camera zooms out.
9. **Arcs vs. straight lines.** Side by side: the arc method vs. naive straight-line steps. A loop-period slider (10 → 100 ms) shows the straight-line error growing.
10. **Only the sideways offset matters.** The reader drags a tracking wheel forward and back along the robot. Its reading doesn't change; only its sideways offset does (the wiki's position-independence proof).
11. **The flaw.** Slip and noise are turned on and the white ghost separates from the cyan estimate. "We'll fix this in chapter 8."

**Try it:** drive with WASD/arrow keys, a gamepad, or touch-drag. Live x/y/θ readout, real-time arcs, a noise
slider, and a sensor setup switcher (3 tracking wheels / 2 wheels + IMU / drive motor encoders + IMU) showing
the drift each setup produces.
**Credit:** "Same math as LemLib's tracking-wheel odometry, based on 5225A's tracking paper."

### 2. Bang-bang → PID

Bang-bang overshoots back and forth around a target line. Then P, I and D are added one at a time with live
term bars and an error graph labeled with the wiki's terms (rise time, overshoot, settling time,
steady-state error). Refinements: integral windup (clamp, reset on sign change) and LemLib-style exit
conditions (small/large error windows + timeout). Ends with turn-to-heading using the same controller.
**Try it:** kP / kI / kD sliders and a "shove the robot" button.

### 3. Heading correction (EZ-Template)

One drivetrain side is 8% weaker. Without correction the robot curves off. With correction, a heading PID
output is added to one side and subtracted from the other, shown as two stacked bars per side.
**Try it:** motor imbalance slider, correction on/off.

### 4. Motion profiling

A trapezoidal velocity graph runs in sync with the robot, and the shaded area under the curve grows as the
distance traveled. Then an S-curve profile, with the acceleration graph below it. **Try it:** max velocity
and max acceleration sliders, trapezoid/S-curve toggle.

### 5. Path generation

Cubic Bézier with draggable control points. De Casteljau's construction animates as nested magenta lerp
lines. A curvature comb, then speed limited by curvature, with the path colored by speed.
**Try it:** drag the control points.

### 6. Pure pursuit

Follows the wiki page: the lookahead circle, the line–circle intersection on each segment with bounds
checking (valid intersections amber, rejected ones faded), picking the goal point, the curvature arc
`κ = 2x / L²` to the goal, and left/right wheel velocity graphs. **Try it:** lookahead slider (small →
wobble, large → corner cutting).

### 7. Boomerang (LemLib `moveToPose`)

The carrot `target − d · lead · (cos θ_t, sin θ_t)` slides into the target as the distance d shrinks. Faint
trails compare lead values. **Try it:** drag and rotate the target pose, lead slider.

### 8. Distance-sensor resets + Kalman filter (Cole's technique)

Two distance sensor beams (e.g. rear and left) hit two perimeter walls. Rotating each sensor's mounting
offset by the heading and subtracting the reading from the wall coordinate gives x and y. Plausibility
checks, shown as rejected beams: the beam hits the wall at too shallow an angle, the reading is outside the
sensor's range, or the reading disagrees too much with odometry. The chapter 1 drift snaps back to truth.

**Kalman section:** instead of snapping, fuse. Odometry is a bell curve that widens as the robot drives;
the distance-sensor reading is a narrow bell curve; the fused estimate is the product of the two, drawn
per axis. Kalman gain `K = σ²_odom / (σ²_odom + σ²_sensor)` shown as a slider-like bar.
**Try it:** sensor noise slider, snap vs. fuse toggle.

### 9. Finale

A full auton run that uses every technique: Bézier path → pure pursuit → boomerang into a pose → distance
reset → PID turn. Toggles turn each overlay on or off. The live loop runs, and the reader can restart it or
drag targets. The page ends with links to Cole's GitHub and the credits block.

## 5. Credits block (page footer)

LemLib (MIT), EZ-Template (MPL-2.0), the 5225A E-Bots PiLons tracking paper, the Purdue SIGBots wiki
(CC BY-SA), plus inspiration from LemLib Path-Gen, path.jerryio and rcya1/pure-pursuit-visualizer. Each
entry links to its source. Wiki-derived explanation text is our own wording; if a figure or passage is
adapted, it's marked and shared under CC BY-SA.

## 6. Testing

- **Unit (`node --test tests/vex`)**, one file per `core/` module:
  - odometry: straight line (Δθ = 0 guard), rotation in place (returns to the same point), a constant-radius
    arc run over 1000 ticks lands on the analytic circle within 0.01"; matches hand-computed values from
    LemLib's formula for a known tick.
  - drivetrain/sensors: with zero noise, the sensors fed into odometry reproduce truth; with a seed, the
    noise is reproducible.
  - pid: each term alone, windup clamp, exit conditions fire as expected.
  - motion-profile: area under the velocity curve equals the distance; respects vmax/amax; triangle case for
    short moves.
  - bezier: endpoints, tangent direction, curvature of a known curve, arc-length sampling spacing.
  - pure-pursuit: line–circle cases (0/1/2 intersections, out-of-bounds rejected), goal point never goes
    backward, curvature sign.
  - boomerang: carrot formula, carrot → target as d → 0.
  - distance-reset: exact readings recover the true pose; each plausibility rule rejects its case.
  - kalman: fused variance < both inputs; K = 0 and K = 1 limits.
  - geometry: angle wrapping, rotation round-trips.
  - Coverage target: 80%+ of `core/` (`node --test --experimental-test-coverage`).
- **E2E (Playwright):** load `/vex/` from a local static server, scroll through every chapter beat forward and
  backward, and assert no console errors, a canvas present, and each chapter's heading visible. Plus one
  mobile-viewport run.
- **Manual:** visual checks in Chrome, Safari and a phone before each milestone ships.

## 7. Milestones

Every push to `main` deploys, so each milestone ships in a finished, presentable state. Unfinished chapters
are simply not in the page yet (no "coming soon" placeholders).

1. **Foundation + Odometry.** Page shell, scroll engine, field, robot, camera rig, overlay, sim core,
   chapter 1 complete, home page link, tests + E2E harness.
2. **Driving.** Chapters 2–4 (PID, heading correction, motion profiling).
3. **Curves.** Chapters 5–7 (paths, pure pursuit, boomerang).
4. **Correction + finale.** Chapters 8–9 and the credits block.

## 8. Risks

- **Scope.** Nine rich chapters is a lot. The milestones keep each shipment complete, and chapter 1 gets the
  most polish.
- **Overlay/3D alignment during the camera transition.** The overlay is only drawn once the camera is fully
  orthographic. During the transition, magenta geometry fades in only after the camera move ends.
- **Mobile performance.** Cap the device pixel ratio at 2, simple materials, no shadows on phones, and limit
  trail length.
- **CDN dependency.** Versions are pinned. If jsDelivr is unreachable the page degrades to text only, and the
  libraries can move to `vendor/` later if needed.
