// The free camera (orbit and drag) and the fixed shots the Studio captures use. The rings follow
// what the camera looks at (its orbit target), never its position, as the Roblox rings follow
// Camera.Focus; focus=origin pins that point to (0, 0) the way the Edit-mode preview does.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MAX_POLAR, STORY_MAX_DISTANCE } from '../page/orbitLimits.js';
import { shotPosition } from '../stages/drift.js';

export const SHOTS = Object.freeze({
	orbit: Object.freeze({ position: [0, 30, 60], target: [0, 0, 0] }),
	deck: Object.freeze({ position: [0, 14, 40], target: [0, 2, -120] }),
	high: Object.freeze({ position: [0, 110, 150], target: [0, 0, -60] }),
	crest: Object.freeze({ position: [0, 5, 25], target: [0, 1, -15] }),
});

// Piece C: how far the visitor may orbit from the target in the story, in studs, which keeps the
// sky dome, the fog and the horizon in the range they were tuned for. The farthest story shot,
// the layers step's high view, stands about 398 studs from its target (page/orbitLimits.js).
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
	// Where applyShot puts the camera, kept across frames (the shot is applied every frame).
	const placed = [0, 0, 0];
	// True while applyShot moves the camera, so its 'change' is not read as the visitor's.
	let applying = false;
	// C2: whether the story gives the visitor an orbit at all (not on a touch-first screen), and
	// whether the flat graph holds it now (holdOrbit).
	let storyOrbit = true;
	let orbitHeld = false;
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
		// shot; piece C decides when the visitor may orbit freely between steps. The finale's
		// `drift` circles the shot's target once every four minutes (stages/drift.js).
		applyShot(shot, seconds) {
			shotPosition(shot, seconds, placed);
			const target = shot.target;
			controls.enableDamping = false;
			camera.position.set(placed[0], placed[1], placed[2]);
			controls.target.set(target[0], target[1], target[2]);
			applying = true;
			try {
				controls.update();
			} finally {
				applying = false;
			}
		},
		// Piece C: where the camera is and what it looks at; the story eases back to a shot from here.
		pose() {
			return { position: camera.position.toArray(), target: controls.target.toArray() };
		},
		// Piece C: calls back when the visitor has dragged the camera: the first 'change' after a
		// 'start', so a plain click (a start and an end with no move) does not count.
		onUserOrbit(callback) {
			let pressed = false;
			const onStart = () => {
				pressed = true;
			};
			const onChange = () => {
				if (pressed && !applying) {
					pressed = false;
					callback();
				}
			};
			const onEnd = () => {
				pressed = false;
			};
			controls.addEventListener('start', onStart);
			controls.addEventListener('change', onChange);
			controls.addEventListener('end', onEnd);
			return () => {
				controls.removeEventListener('start', onStart);
				controls.removeEventListener('change', onChange);
				controls.removeEventListener('end', onEnd);
			};
		},
		// Piece C: the story's orbit. No zoom, so the wheel scrolls the page (OrbitControls returns
		// before preventDefault when zoom is off); no pan, since the rings follow the target; a limited
		// reach. A touch-first screen gets no orbit at all, so a swipe over the ocean scrolls. A screen
		// with any touch pointer (a touch laptop) keeps the orbit for its mouse, but a vertical swipe
		// still scrolls the page.
		limitForStory({ coarsePointer, anyCoarsePointer = coarsePointer }) {
			controls.enableZoom = false;
			controls.enablePan = false;
			controls.maxDistance = STORY_MAX_DISTANCE;
			if (coarsePointer) {
				storyOrbit = false;
				controls.enabled = false;
			}
			if (coarsePointer || anyCoarsePointer) {
				dom.style.touchAction = 'pan-y';
			}
		},
		// C2: while the flat graph shows, the visitor's orbit is held (the story calls this every
		// frame; only a change does anything). A touch-first screen never had the orbit.
		holdOrbit(held) {
			if (held === orbitHeld) {
				return;
			}
			orbitHeld = held;
			controls.enabled = storyOrbit && !held;
		},
		// Piece C: whether the visitor may orbit at all (limitForStory turns it off on touch-first
		// screens).
		orbitEnabled: () => controls.enabled,
		// Piece C: the tilt range (radians from straight down) the visitor may orbit through from the
		// current shot (page/orbitLimits.js polarRange). update() clamps to it, so the story sets a
		// range that holds the shot before applying it.
		limitTilt(min, max) {
			controls.minPolarAngle = min;
			controls.maxPolarAngle = max;
		},
	};
}
