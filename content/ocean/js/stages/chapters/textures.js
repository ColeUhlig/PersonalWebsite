// Chapter five, Textures (steps 22 to 25; piece C2; lane F tunes this file, spec 10.7): the FFT's
// output as grids of numbers, sampling between grid points, the mesh's rings under a wireframe, and
// the painted maps. The sea is the hero sea's layers without foam or glow (those are chapter six).
import { toggle } from '../recipeKit.js';

const SEA = { source: 'fft', foam: false, glow: false };

export const TEXTURES = Object.freeze({
	fields: { title: 'The answer is a grid of numbers', engine: SEA, shot: { position: [0, 60, 110], target: [0, 0, -40] } },
	sampling: { title: 'Reading between the grid points', engine: SEA, shot: { position: [0, 30, 60], target: [0, 0, 0] } },
	mesh: {
		title: 'The mesh',
		// A still white sea (no chop, no paint) so the wire's rings and their step in spacing read. Task
		// 14: and a calm one (the jonswap slider's lightest wind over its shortest fetch, under a stud
		// high), so the rings read as nested flat squares rather than a rough sheet.
		engine: { ...SEA, chop: 0, sea: { windSpeed: 3, fetch: 5000 } },
		// Thicker fog past the wire grid's fade: past about 600 studs a grid's lines crowd into grey
		// moire bands (A3 fix round 1, piece C's old step 1). Task 14: the camera stands high and looks
		// steeply down so the rings show as squares, so the wire's fade (stages/recipeKit.js WIRE_FADE)
		// starts past the far edge of High's 8-stud ring, where the 16-stud ring begins. Task 15: higher
		// and further back (322 studs from the target), so that ring's right and far edges both show,
		// and its step to the 16-stud ring reads on two sides of the square, not one edge at the top.
		look: { material: 'white', wireframe: true, fog: 0.0015, wireFade: [500, 1000] },
		shot: { position: [0, 260, 190], target: [0, 0, 0] },
		sliders: [toggle('wireframe', 'Wireframe', 'look.wireframe', true)],
	},
	painted: { title: 'Painted maps', engine: SEA, shot: { position: [0, 20, 45], target: [0, 1, -20] } },
});
