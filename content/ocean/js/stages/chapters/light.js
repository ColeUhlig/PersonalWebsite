// Chapter two's lighting steps (steps 7, 10 and 11; piece C2; lane D tunes this file, spec 10.6):
// the unlit white blob, the sea lit by Lambert alone, then the highlight and Fresnel with the sky.
// Steps 8 and 9 (normals and slopes) are chapters/vectors.js.
import { DECK, TEACHING, TEACHING_SUN, range, toggle } from '../recipeKit.js';

const BANK = { ...TEACHING, source: 'bank', bank: { count: 16, fan: 1 } };

export const LIGHT = Object.freeze({
	unlit: {
		title: "Shape isn't enough",
		engine: BANK,
		look: { material: 'white', wireframe: false, sun: TEACHING_SUN },
		shot: DECK,
		sliders: [toggle('wireframe', 'Wireframe', 'look.wireframe', false)],
	},
	diffuse: {
		title: 'Sunlight',
		engine: BANK,
		look: { material: 'terms', terms: { diffuse: true, specular: false, fresnel: false }, sun: TEACHING_SUN },
		shot: DECK,
		sliders: [range('sunAzimuth', 'Sun direction', 'look.sun.azimuth', { min: 0, max: 360, step: 1, value: TEACHING_SUN.azimuth, unit: '°' })],
	},
	highlights: {
		title: 'Highlights, Fresnel and the sky',
		engine: BANK,
		look: { material: 'terms', terms: { diffuse: true, specular: true, fresnel: true }, sun: TEACHING_SUN },
		shot: DECK,
		sliders: [toggle('specular', 'Highlight', 'look.terms.specular', true), toggle('fresnel', 'Fresnel and sky', 'look.terms.fresnel', true)],
	},
});
