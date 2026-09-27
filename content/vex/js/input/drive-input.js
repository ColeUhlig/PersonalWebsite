// Turns keyboard (WASD / arrows), the first connected gamepad, or a touch/mouse drag on the stage
// into tank-drive commands { left, right } in [-1, 1]. Call `read()` once per sim tick.

const KEYS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
});
const DRAG_RADIUS = 80; // px for full deflection

const arcade = (throttle, turn) => ({
  left: Math.max(-1, Math.min(1, throttle + turn)),
  right: Math.max(-1, Math.min(1, throttle - turn)),
});

export function createDriveInput(dragTarget, win = window) {
  const down = new Set();
  let drag = null; // { startX, startY, x, y }
  let enabled = false; // only capture keys while the try-it panel is on screen, so arrow keys still scroll elsewhere

  // Keys typed into the panel's own controls (the noise slider, the sensor menu) belong to them.
  const inFormField = (target) =>
    Boolean(target && (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable));

  const onKey = (pressed) => (e) => {
    const known = Object.values(KEYS).some((codes) => codes.includes(e.code));
    if (!known || !enabled || inFormField(e.target)) return;
    e.preventDefault();
    pressed ? down.add(e.code) : down.delete(e.code);
  };
  const keydown = onKey(true);
  const keyup = onKey(false);
  const release = () => { down.clear(); drag = null; }; // window lost focus: no keyup will ever arrive
  const pointerdown = (e) => { drag = { startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY }; dragTarget.setPointerCapture?.(e.pointerId); };
  const pointermove = (e) => { if (drag) { drag = { ...drag, x: e.clientX, y: e.clientY }; } };
  const pointerup = () => { drag = null; };

  win.addEventListener('keydown', keydown);
  win.addEventListener('keyup', keyup);
  win.addEventListener('blur', release);
  dragTarget.addEventListener('pointerdown', pointerdown);
  dragTarget.addEventListener('pointermove', pointermove);
  dragTarget.addEventListener('pointerup', pointerup);
  dragTarget.addEventListener('pointercancel', pointerup);

  const anyDown = (codes) => codes.some((c) => down.has(c));

  function setEnabled(on) {
    enabled = on;
    if (!on) release();
    // While driving, a finger on the stage steers instead of scrolling the page.
    if (dragTarget.style) dragTarget.style.touchAction = on ? 'none' : '';
  }

  function read() {
    if (!enabled) return { left: 0, right: 0 };
    if (drag) {
      const dx = (drag.x - drag.startX) / DRAG_RADIUS;
      const dy = (drag.startY - drag.y) / DRAG_RADIUS;
      return arcade(Math.max(-1, Math.min(1, dy)), Math.max(-1, Math.min(1, dx)));
    }
    const pad = win.navigator?.getGamepads?.()?.[0];
    if (pad && pad.axes.length >= 2 && (Math.abs(pad.axes[1]) > 0.1 || Math.abs(pad.axes[0]) > 0.1)) {
      return arcade(-pad.axes[1], pad.axes[0]);
    }
    const throttle = (anyDown(KEYS.forward) ? 1 : 0) - (anyDown(KEYS.back) ? 1 : 0);
    const turn = (anyDown(KEYS.right) ? 0.6 : 0) - (anyDown(KEYS.left) ? 0.6 : 0);
    return arcade(throttle, turn);
  }

  function destroy() {
    win.removeEventListener('keydown', keydown);
    win.removeEventListener('keyup', keyup);
    win.removeEventListener('blur', release);
    dragTarget.removeEventListener('pointerdown', pointerdown);
    dragTarget.removeEventListener('pointermove', pointermove);
    dragTarget.removeEventListener('pointerup', pointerup);
    dragTarget.removeEventListener('pointercancel', pointerup);
  }

  return { read, setEnabled, destroy };
}
