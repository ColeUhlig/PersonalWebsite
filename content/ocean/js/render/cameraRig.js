// The free camera (orbit and drag) and the fixed shots the Studio captures use. The rings follow
// what the camera looks at (its orbit target), never its position, as the Roblox rings follow
// Camera.Focus; focus=origin pins that point to (0, 0) the way the Edit-mode preview does.
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export const SHOTS = Object.freeze({
	orbit: Object.freeze({ position: [0, 30, 60], target: [0, 0, 0] }),
	deck: Object.freeze({ position: [0, 14, 40], target: [0, 2, -120] }),
	high: Object.freeze({ position: [0, 110, 150], target: [0, 0, -60] }),
	crest: Object.freeze({ position: [0, 5, 25], target: [0, 1, -15] }),
});

// A3: the finale's `drift` circles the shot's target once every four minutes.
const DRIFT_RADIANS_PER_SECOND = (2 * Math.PI) / 240;

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
		applyShot(shot, seconds) {
			const [tx, ty, tz] = shot.target;
			let [px, py, pz] = shot.position;
			if (shot.move === 'drift') {
				const angle = seconds * DRIFT_RADIANS_PER_SECOND;
				const dx = px - tx;
				const dz = pz - tz;
				px = tx + dx * Math.cos(angle) - dz * Math.sin(angle);
				pz = tz + dx * Math.sin(angle) + dz * Math.cos(angle);
			}
			controls.enableDamping = false;
			camera.position.set(px, py, pz);
			controls.target.set(tx, ty, tz);
			controls.update();
		},
	};
}
