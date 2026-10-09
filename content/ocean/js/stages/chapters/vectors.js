// Chapter two's vector steps (steps 8 and 9; piece C2; lane C tunes this file, spec 10.7): arrows
// out of the surface from the engine's exact normals, then the central difference beside the exact
// derivative. The surface stays white, with its wireframe on so the arrows visibly stand on it: the
// arrows are the lesson.
import { TEACHING, TEACHING_SUN, range } from '../recipeKit.js';

const BANK = { ...TEACHING, source: 'bank', bank: { count: 16, fan: 1 } };
// From between +x and +z, so the tangent (along x), the binormal (along z) and the normals' lean (the
// bank heads within 45 degrees of +z) all show across the screen rather than towards the lens; a stud
// above the water at the target, so the 3-stud arrows sit in the middle of the frame.
const CLOSE = { position: [27, 14, 20], target: [0, 1, 0] };

export const VECTORS = Object.freeze({
	normals: {
		title: 'Surface normals',
		engine: BANK,
		look: { material: 'white', wireframe: true, sun: TEACHING_SUN, overlay: { kind: 'normals', spacing: 4 } },
		shot: CLOSE,
	},
	slopes: {
		title: 'Computing the slope',
		engine: BANK,
		look: { material: 'white', wireframe: true, sun: TEACHING_SUN, overlay: { kind: 'slopes', spacing: 4 } },
		shot: CLOSE,
		sliders: [range('spacing', 'Sample spacing', 'look.overlay.spacing', { min: 0.5, max: 16, step: 0.5, value: 4, unit: 'studs' })],
	},
});
