// The free camera (orbit and drag) and the fixed shots the Studio captures use. The rings follow
// what the camera looks at (its orbit target), never its position, as the Roblox rings follow
// Camera.Focus; focus=origin pins that point to (0, 0) the way the Edit-mode preview does.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MAX_POLAR, STORY_MAX_DISTANCE } from '../page/orbitLimits.js';
import { resolveShot } from '../page/shotControl.js';

export const SHOTS = Object.freeze({
	orbit: Object.freeze({ position: [0, 30, 60], target: [0, 0, 0] }),
	deck: Object.freeze({ position: [0, 14, 40], target: [0, 2, -120] }),
	high: Object.freeze({ position: [0, 110, 150], target: [0, 0, -60] }),
	crest: Object.freeze({ position: [0, 5, 25], target: [0, 1, -15] }),
});

// Piece C: how far the visitor may orbit from the target in the story, in studs, which keeps the
// sky dome, the fog and the horizon in the range they were tuned for. The farthest story shot,
// step 10's high view, stands about 398 studs from its target (page/orbitLimits.js).
export { STORY_MAX_DISTANCE };

export function createCameraRig(camera, dom, config) {
	const shot = SHOTS[config.camera];
	camera.position.set(...shot.position);
	const controls = new OrbitControls(camera, dom);
	controls.target.set(...shot.target);
	controls.enableDamping = config.camera === 'orbit';
	controls.maxPolarAngle = MAX_POLAR;
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
		// A3: puts the camera where a stage recipe's shot says (its target is what the rings
		// follow). Damping is turned off so no leftover orbit momentum carries the camera off the
		// shot; piece C decides when the visitor may orbit freely between steps.
		// The finale's `drift` circles the shot's target once every four minutes (page/shotControl.js
		// resolveShot, which the story uses too).
		applyShot(shot, seconds) {
			const { position, target } = resolveShot(shot, seconds);
			controls.enableDamping = false;
			camera.position.set(...position);
			controls.target.set(...target);
			controls.update();
		},
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
		// Piece C: the tilt range (radians from straight down) the visitor may orbit through from the
		// current shot (page/orbitLimits.js polarRange). update() clamps to it, so the story sets a
		// range that holds the shot before applying it.
		limitTilt(min, max) {
			controls.minPolarAngle = min;
			controls.maxPolarAngle = max;
		},
	};
}
