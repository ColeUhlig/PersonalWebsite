import * as THREE from 'three';
import { FIELD_SIZE } from './field.js';

// One camera rig with three framings: orbiting the whole field, close on the robot, or straight
// overhead. State is set directly by the chapters as the reader scrolls (no tweens). The overhead
// move is a dolly-zoom: the perspective camera rises while its field of view narrows to almost
// nothing, which looks orthographic, and at the end the true orthographic camera takes over so 2D
// overlays project exactly.

const ORBIT_RADIUS = 190;
const ORBIT_HEIGHT = 120;
const CLOSE_RADIUS = 40;
const CLOSE_HEIGHT = 22;
const WIDE_FOV = 40;
const NARROW_FOV = 2;

const FIELD_MARGIN = 1.08;

/** Half the field-plane extent the overhead view shows: [horizontal, vertical], inches. */
export function overheadExtent(aspect) {
  const base = (FIELD_SIZE / 2) * FIELD_MARGIN;
  return aspect >= 1 ? [base * aspect, base] : [base, base / aspect];
}

export function createCameraRig(aspect) {
  const perspective = new THREE.PerspectiveCamera(WIDE_FOV, aspect, 1, 12000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 1000);
  ortho.up.set(0, 0, -1);

  const state = { mode: 'orbit', orbitAngle: 0.6, topdown: 0, focus: new THREE.Vector3() };
  let aspectNow = aspect;

  function resize(width, height) {
    aspectNow = width / height;
    perspective.aspect = aspectNow;
    perspective.updateProjectionMatrix();
    const [hx, hy] = overheadExtent(aspectNow);
    ortho.left = -hx; ortho.right = hx; ortho.top = hy; ortho.bottom = -hy;
    ortho.updateProjectionMatrix();
  }

  function framingPosition() {
    const { mode, orbitAngle, focus } = state;
    if (mode === 'close') {
      return new THREE.Vector3(focus.x + Math.sin(orbitAngle) * CLOSE_RADIUS, CLOSE_HEIGHT, focus.z + Math.cos(orbitAngle) * CLOSE_RADIUS);
    }
    return new THREE.Vector3(Math.sin(orbitAngle) * ORBIT_RADIUS, ORBIT_HEIGHT, Math.cos(orbitAngle) * ORBIT_RADIUS);
  }

  function update() {
    const t = state.topdown;
    const fov = THREE.MathUtils.lerp(WIDE_FOV, NARROW_FOV, t);
    perspective.fov = fov;
    perspective.updateProjectionMatrix();
    // Height at which this FOV shows the same span the orthographic camera shows.
    const overheadHeight = overheadExtent(aspectNow)[1] / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const overhead = new THREE.Vector3(state.focus.x, overheadHeight, state.focus.z + 0.001);
    perspective.position.copy(framingPosition()).lerp(overhead, t);
    perspective.up.set(0, 1, 0);
    perspective.lookAt(state.focus);

    ortho.position.set(state.focus.x, 500, state.focus.z);
    ortho.lookAt(state.focus.x, 0, state.focus.z);
  }

  return {
    perspective,
    ortho,
    state,
    resize,
    update,
    /** The camera to render with this frame. */
    active: () => (state.topdown >= 0.999 ? ortho : perspective),
    isTopdown: () => state.topdown >= 0.999,
    setMode(mode) { state.mode = mode; },
    /** Beats are scroll-scrubbed, so every camera change is an instant state change. */
    set(vars) { Object.assign(state, vars); },
    setFocus: ([x, y]) => state.focus.set(x, 0, -y),
  };
}
