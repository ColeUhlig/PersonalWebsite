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
		engine: SEA,
		// Thicker fog past the wire grid's fade (render/stageLook.js WIRE_FADE): past about 600 studs
		// a grid's lines crowd into grey moire bands (A3 fix round 1, piece C's old step 1).
		look: { wireframe: true, fog: 0.0015 },
		shot: { position: [0, 40, 70], target: [0, 0, 0] },
		sliders: [toggle('wireframe', 'Wireframe', 'look.wireframe', true)],
	},
	painted: { title: 'Painted maps', engine: SEA, shot: { position: [0, 20, 45], target: [0, 1, -20] } },
});
