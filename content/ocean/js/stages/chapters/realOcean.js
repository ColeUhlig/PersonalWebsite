// Chapter four, The real ocean (steps 14 to 21; piece C2; lane E tunes this file, spec 10.7): back to
// the flat graph for time and frequency and the chord, then the FFT pipeline: the spectrum, the random
// sea with its arrows still, the arrows turning, the FFT timing, choppiness, and the three layers.
// Steps 16 to 19 run the FFT sea without chop, so step 20 is where the sideways push arrives. The
// frequency step's band is the contract's FREQUENCY_BAND (recipeKit.js).
import { DEFAULT_SETTINGS } from '../../engine/stageControl.js';
import { SEED } from '../../engine/config.js';
import { FREQUENCY_BAND, GRAPH_FLAT, GRAPH_SHOT, HIGH, ONE_LAYER, TEACHING, WHITE, choice, counter, range, toggle } from '../recipeKit.js';

const LINE = { ...TEACHING, source: 'bank', bank: { count: 4, fan: 0 } };
const ROUND = { ...ONE_LAYER, chop: 0 };
const ARROWS = { position: [0, 30, 60], target: [0, 0, 0] };

export const REAL_OCEAN = Object.freeze({
	frequency: {
		title: 'Time and frequency',
		engine: LINE,
		look: { ...WHITE, graph: { ...GRAPH_FLAT, near: FREQUENCY_BAND, far: FREQUENCY_BAND, components: true } },
		shot: GRAPH_SHOT,
		sliders: [range('waveCount', 'Waves', 'engine.bank.count', { min: 1, max: 8, step: 1, value: 4 })],
	},
	fourier: {
		title: 'Taking a chord apart',
		engine: LINE,
		look: { ...WHITE, graph: GRAPH_FLAT },
		shot: GRAPH_SHOT,
		charts: { notes: [true, true, true] },
		sliders: [toggle('note1', 'Low tone', 'charts.notes.0', true), toggle('note2', 'Middle tone', 'charts.notes.1', true), toggle('note3', 'High tone', 'charts.notes.2', true)],
	},
	jonswap: {
		title: 'Real ocean data',
		engine: ROUND,
		shot: { position: [0, 60, 110], target: [0, 0, -40] },
		charts: { spectrum: true },
		sliders: [
			range('wind', 'Wind speed', 'engine.sea.windSpeed', { min: 3, max: 25, step: 0.5, value: 12, unit: 'm/s' }),
			range('fetch', 'Fetch', 'engine.sea.fetch', { min: 5000, max: 200000, step: 100, value: 80000, unit: 'm', scale: 'log' }),
		],
	},
	'random-sea': {
		title: 'A random ocean',
		engine: ROUND,
		shot: ARROWS,
		charts: { phaseArrows: 'still' },
		// Capped: seeds 1 .. 9999 are plenty of seas, and far inside the engine's 2^31 - 1.
		sliders: [counter('seed', 'New sea', 'engine.seed', SEED, 9999)],
	},
	time: {
		title: 'Setting it moving',
		engine: ROUND,
		shot: ARROWS,
		charts: { phaseArrows: 'turning' },
	},
	fft: {
		title: 'The FFT',
		engine: ROUND,
		shot: HIGH,
		charts: { transformN: 32 },
		sliders: [choice('transformN', 'Waves per side', 'charts.transformN', [8, 16, 32, 64], 32)],
	},
	choppiness: {
		title: 'Choppiness',
		engine: ONE_LAYER,
		shot: { position: [-40, 16, -20], target: [30, 0, -20] },
		sliders: [range('chop', 'Choppiness', 'engine.chop', { min: 0, max: 2, step: 0.01, value: DEFAULT_SETTINGS.chop })],
	},
	layers: {
		title: 'Three layers of waves',
		engine: { source: 'fft', foam: false, glow: false },
		shot: { position: [0, 380, 120], target: [0, 0, 0] },
		sliders: [
			toggle('layer1', '256-stud layer', 'engine.layers.0', true),
			toggle('layer2', '64-stud layer', 'engine.layers.1', true),
			toggle('layer3', '16-stud layer', 'engine.layers.2', true),
		],
	},
});
