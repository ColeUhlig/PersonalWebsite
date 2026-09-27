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
