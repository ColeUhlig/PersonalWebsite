// Chapter three, Better waves (steps 12 and 13; piece C2; lane B tunes this file): choppiness on the
// Gerstner bank from the side (piece C Task 6), then the fly-up that shows the tiling. The tiling
// step sums only the bank's 4 tallest waves (40 to 85 studs; the contract's TILING_WAVES,
// recipeKit.js): from a few hundred studs up the shorter ones alias on the coarse rings into
// blurrier, paler water with a hard square edge (A3 Task 10 fix round 1); the 4 still repeat every
// 256 studs, which is the step's point (tests/ocean/stages/shots.test.js checks the frame from the
// geometry).
import { CREST, TEACHING, TEACHING_SUN, TILING_WAVES, range } from '../recipeKit.js';

export const BETTER_WAVES = Object.freeze({
	gerstner: {
		title: 'Gerstner waves',
		engine: { ...TEACHING, source: 'bank', bank: { count: 16, fan: 1 }, chop: 1.3 },
		look: { material: 'terms', sun: TEACHING_SUN },
		shot: CREST,
		sliders: [range('chop', 'Choppiness', 'engine.chop', { min: 0, max: 2, step: 0.01, value: 1.3 })],
	},
	tiling: {
		title: 'Periodicity and tiling',
		engine: { ...TEACHING, source: 'bank', bank: { count: TILING_WAVES, fan: 1 }, chop: 0.6 },
		// Task 15: the tile's edges drawn dashed on the sea, so one square can be matched to the next.
		look: { material: 'terms', sun: TEACHING_SUN, overlay: { kind: 'tiles', spacing: 4 } },
		shot: { position: [0, 300, 90], target: [0, 0, 0] },
	},
});
