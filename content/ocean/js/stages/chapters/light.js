// Chapter two's lighting steps (steps 7, 10 and 11; piece C2; lane D tunes this file, spec 10.6):
// the unlit white blob, the sea lit by Lambert alone, then the highlight and Fresnel with the sky.
// Steps 8 and 9 (normals and slopes) are chapters/vectors.js.
import { DECK, TEACHING, TEACHING_SUN, range, toggle } from '../recipeKit.js';

const BANK = { ...TEACHING, source: 'bank', bank: { count: 16, fan: 1 } };
// The deck shot turned 65 degrees towards the teaching sun (azimuth 215, 55 degrees left of the
// deck's -z), so the sun sits 10 degrees right of the view and its highlight runs down the water just
// right of the frame's middle: clear of the step's panel, which covers the left third on a wide
// screen (Task 15's walk: at 25 degrees the glint sat under it), and inside a phone's frame.
const SUNWARD = Object.freeze({ position: DECK.position, target: [-145, 2, -27.6] });

// Task 15: step 10's own sun, ahead of the deck and 15 degrees right of its line of sight (azimuth
// 285; the deck looks along -z), so the sun's glow sits in the open sky right of the panel and the
// crests' sunward faces are lit while the faces turned to the view stay dark: the bank's crests run
// across the view, so a sun along the waves' travel separates their two faces, where one straight to
// the side lights both alike. At the teaching sun (215, ahead and well to the left) the hold was an
// even teal; tests/ocean/e2e/lightTerms.spec.js holds the spread.
const DIFFUSE_SUN = Object.freeze({ ...TEACHING_SUN, azimuth: 285 });

export const LIGHT = Object.freeze({
	unlit: {
		title: 'Shape without shading',
		engine: BANK,
		look: { material: 'white', wireframe: false, sun: TEACHING_SUN },
		shot: DECK,
		sliders: [toggle('wireframe', 'Wireframe', 'look.wireframe', false)],
	},
	diffuse: {
		title: 'Diffuse illumination',
		engine: BANK,
		look: { material: 'terms', terms: { diffuse: true, specular: false, fresnel: false }, sun: DIFFUSE_SUN },
		shot: DECK,
		sliders: [range('sunAzimuth', 'Sun direction', 'look.sun.azimuth', { min: 0, max: 360, step: 1, value: DIFFUSE_SUN.azimuth, unit: '°' })],
	},
	highlights: {
		title: 'Specular reflection and the Fresnel effect',
		engine: BANK,
		look: { material: 'terms', terms: { diffuse: true, specular: true, fresnel: true }, sun: TEACHING_SUN },
		shot: SUNWARD,
		sliders: [toggle('specular', 'Highlight', 'look.terms.specular', true), toggle('fresnel', 'Fresnel and sky', 'look.terms.fresnel', true)],
	},
});
