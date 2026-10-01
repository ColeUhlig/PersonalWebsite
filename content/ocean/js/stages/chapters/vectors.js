// Chapter two's vector steps (steps 8 and 9; piece C2; lane C tunes this file, spec 10.7): arrows
// out of the surface from the engine's exact normals, then the central difference beside the exact
// derivative. The surface stays white: the arrows are the lesson.
import { TEACHING, TEACHING_SUN, range } from '../recipeKit.js';

const BANK = { ...TEACHING, source: 'bank', bank: { count: 16, fan: 1 } };
const CLOSE = { position: [0, 16, 34], target: [0, 0, 0] };

export const VECTORS = Object.freeze({
	normals: {
		title: 'Which way the surface faces',
		engine: BANK,
		look: { material: 'white', wireframe: false, sun: TEACHING_SUN, overlay: { kind: 'normals', spacing: 4 } },
		shot: CLOSE,
	},
	slopes: {
		title: 'Getting the slope',
		engine: BANK,
		look: { material: 'white', wireframe: false, sun: TEACHING_SUN, overlay: { kind: 'slopes', spacing: 4 } },
		shot: CLOSE,
		sliders: [range('spacing', 'Sample spacing', 'look.overlay.spacing', { min: 0.5, max: 16, step: 0.5, value: 4, unit: 'studs' })],
	},
});
