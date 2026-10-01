// Chapter six, The look, and the finale (steps 26 to 28; piece C2, Task 0; unchanged from piece C's
// steps 11 to 13). No lane edits this file.
import { DEFAULT_SETTINGS } from '../../engine/stageControl.js';
import { DECK, FINALE_HEIGHT, range } from '../recipeKit.js';
import { PLACE_SUN } from '../sun.js';

export const FINISH = Object.freeze({
	foam: {
		title: 'Foam',
		engine: { glow: false },
		shot: { position: [0, 20, 45], target: [0, 1, -20] },
		sliders: [
			range('whitecap', 'Whitecaps', 'engine.foamKnobs.whitecap', { min: 0, max: 1, step: 0.01, value: DEFAULT_SETTINGS.foamKnobs.whitecap }),
			range('fade', 'Fade', 'engine.foamKnobs.decay', { min: 0.5, max: 0.97, step: 0.01, value: DEFAULT_SETTINGS.foamKnobs.decay }),
		],
	},
	glow: {
		title: 'Glow',
		// Looking towards the sun (azimuth about 173 degrees, towards -x), where the scatter lobe glows.
		shot: { position: [40, 18, 10], target: [-120, 2, 20] },
		sliders: [
			range('sunHeight', 'Sun height', 'look.sun.elevation', { min: 2, max: 50, step: 0.5, value: PLACE_SUN.elevation, unit: '°' }),
			range('glow', 'Glow strength', 'engine.glowStrength', { min: 0, max: 60, step: 1, value: DEFAULT_SETTINGS.glowStrength }),
		],
	},
	finale: {
		title: 'The whole thing',
		shot: { position: [0, FINALE_HEIGHT, DECK.position[2]], target: DECK.target, move: 'drift' },
	},
});
