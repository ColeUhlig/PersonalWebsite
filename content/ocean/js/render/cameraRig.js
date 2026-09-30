// The free camera (orbit and drag) and the fixed shots the Studio captures use. The rings follow
// what the camera looks at (its orbit target), never its position, as the Roblox rings follow
// Camera.Focus; focus=origin pins that point to (0, 0) the way the Edit-mode preview does.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { shotPosition } from '../stages/drift.js';

export const SHOTS = Object.freeze({
	orbit: Object.freeze({ position: [0, 30, 60], target: [0, 0, 0] }),
	deck: Object.freeze({ position: [0, 14, 40], target: [0, 2, -120] }),
	high: Object.freeze({ position: [0, 110, 150], target: [0, 0, -60] }),
	crest: Object.freeze({ position: [0, 5, 25], target: [0, 1, -15] }),
});

export function createCameraRig(camera, dom, config) {
	const shot = SHOTS[config.camera];
	camera.position.set(...shot.position);
	const controls = new OrbitControls(camera, dom);
	controls.target.set(...shot.target);
	controls.enableDamping = config.camera === 'orbit';
	controls.maxPolarAngle = Math.PI * 0.495;
	controls.minDistance = 4;
	controls.maxDistance = 2500;
	controls.update();
	// Where applyShot puts the camera, kept across frames (the shot is applied every frame).
	const placed = [0, 0, 0];
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
			controls.update();
		},
	};
}
