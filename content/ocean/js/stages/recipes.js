// The thirteen steps of the story (spec section 3), each as a recipe (spec 4.3; A3; not a twin): which parts
// of the engine are on and the sea they run (`engine`, the EngineSettings stageControl.js takes,
// less the `normals` and `warm` the blend works out), how the surface is drawn (`look`), where the
// camera stands (`shot`), which charts the step shows (`charts`) and which sliders its panel
// offers, with their ranges and the value each drives (`sliders`). Pure data: the director
// (director.js) binds slider values in, blends two neighbours by the scroll progress (blend.js)
// and hands the result to the engine and the renderer.
//
// Steps 1 to 6 run the Gerstner sum (the `sine` source, then the 32-wave `bank`, through
// WaveSampler as the original Roblox prototype did); from step 7 the surface is the FFT pipeline,
// one layer until step 10 brings in all three. Every step starts from the hero sea, the rough
// default Cole judged in A2 (stageControl.js DEFAULT_SETTINGS), which the finale is unchanged.
// Steps 4 and 5 sum the 16 tallest bank waves rather than 32: 32 cost about 27 ms a frame over
// 18,144 vertices in Node (2026-09-30), and waves 17 to 32 are under 0.15 studs tall.
//
// The two high shots (steps 6 and 10) look steeply down on the sea from a few hundred studs, so
// the frame never reaches the flat horizon plane past the last ring (Task 10 fix round 1: from
// 700 studs up the plane's join read as the edge of a swimming pool, and thin fog showed the
// world's own square edge). They keep A2's fog: nothing in their frames is far enough to need
// thinning it, and the blends into them stay hazed at the horizon. Step 6 also sums only the bank's
// 4 tallest waves (40 to 85 studs): its lit sea has no painted maps to even out the rings, and the
// shorter waves alias on the 16-stud ring, where the frame's outer half sits, into blurrier, paler
// water with a hard square edge around the 8-stud ring. The 4 still repeat every 256 studs, which
// is the step's point. tests/ocean/stages/shots.test.js checks all of this from the geometry.
import { DEFAULT_SETTINGS } from '../engine/stageControl.js';
import { SEED } from '../engine/config.js';
import { FOG_DENSITY } from '../render/lighting.js';
import { deepFreeze } from './paths.js';
import { PLACE_SUN } from './sun.js';

export const STEP_COUNT = 13;
export const MATERIALS = Object.freeze(['white', 'sea', 'painted']);
export const MOVES = Object.freeze(['still', 'drift']);
// The recipe fields the engine reads (EngineSettings without `normals` and `warm`).
export const ENGINE_FIELDS = Object.freeze(['source', 'sine', 'bank', 'chop', 'sea', 'seed', 'layers', 'maps', 'foam', 'foamKnobs', 'glow', 'glowStrength']);

const BASE = deepFreeze({
	engine: Object.fromEntries(ENGINE_FIELDS.map((name) => [name, DEFAULT_SETTINGS[name]])),
	look: { material: 'painted', shading: true, wireframe: false, fog: FOG_DENSITY, sun: { azimuth: PLACE_SUN.azimuth, elevation: PLACE_SUN.elevation } },
	shot: { position: [0, 14, 40], target: [0, 2, -120], move: 'still' },
	charts: { spectrum: false, phaseArrows: false, transformN: null },
	sliders: [],
});

const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Plain objects merge key by key; arrays and everything else replace.
function merge(base, over) {
	const result = { ...base };
	for (const [key, value] of Object.entries(over)) {
		result[key] = isPlain(value) && isPlain(base[key]) ? merge(base[key], value) : value;
	}
	return result;
}

function make(step, id, title, over) {
	return deepFreeze({ step, id, title, ...merge(BASE, over) });
}

function range(id, label, bind, { min, max, step, value, unit = '', scale = 'linear' }) {
	return { id, label, kind: 'range', bind, min, max, step, default: value, unit, scale };
}

function toggle(id, label, bind, value) {
	return { id, label, kind: 'toggle', bind, default: value };
}

// A whole number from 1; `max`, when given, caps it (the seed: see the seed slider below).
function counter(id, label, bind, value, max) {
	return { id, label, kind: 'counter', bind, min: 1, ...(max === undefined ? {} : { max }), default: value };
}

function choice(id, label, bind, options, value) {
	return { id, label, kind: 'choice', bind, options, default: value };
}

// The Gerstner steps: one layer named (so the painter's lists match step 7's while it warms up),
// no chop until step 5, and no maps, foam or glow.
const TEACHING = { layers: [true, false, false], chop: 0, maps: false, foam: false, glow: false };
const ONE_LAYER = { source: 'fft', layers: [true, false, false], foam: false, glow: false };
const WHITE = { material: 'white', wireframe: true };
const DECK = { position: [0, 14, 40], target: [0, 2, -120] };
const CREST = { position: [0, 5, 25], target: [0, 1, -15] };
const HIGH = { position: [0, 110, 150], target: [0, 0, -60] };

export const RECIPES = Object.freeze([
	make(1, 'flat-plane', 'A flat white plane', {
		engine: { ...TEACHING, source: 'sine', sine: { amplitude: 0 } },
		// Thicker than A2's fog (fix round 1): past about 600 studs the grid's lines crowd into
		// grey moire bands that read as swells on a plane that is meant to be flat.
		look: { ...WHITE, fog: 0.0015 },
		shot: { position: [0, 40, 70], target: [0, 0, 0] },
		sliders: [toggle('wireframe', 'Wireframe', 'look.wireframe', true)],
	}),
	make(2, 'one-sine', 'One sine wave', {
		engine: { ...TEACHING, source: 'sine' },
		look: WHITE,
		shot: { position: [0, 12, 45], target: [0, 0, 0] },
		sliders: [
			range('amplitude', 'Height', 'engine.sine.amplitude', { min: 0, max: 4, step: 0.05, value: 1.5, unit: 'studs' }),
			range('wavelength', 'Length', 'engine.sine.wavelength', { min: 8, max: 120, step: 1, value: 40, unit: 'studs' }),
			range('speed', 'Speed', 'engine.sine.speed', { min: 0, max: 20, step: 0.1, value: 8, unit: 'studs/s' }),
		],
	}),
	make(3, 'many-sines', 'Many sine waves', {
		engine: { ...TEACHING, source: 'bank', bank: { count: 8 } },
		look: WHITE,
		shot: { position: [0, 18, 55], target: [0, 0, -20] },
		sliders: [range('waveCount', 'Waves', 'engine.bank.count', { min: 1, max: 32, step: 1, value: 8 })],
	}),
	make(4, 'light', 'Light', {
		engine: { ...TEACHING, source: 'bank', bank: { count: 16 } },
		look: { material: 'sea', shading: true },
		shot: DECK,
		sliders: [
			range('sunAzimuth', 'Sun direction', 'look.sun.azimuth', { min: 0, max: 360, step: 1, value: PLACE_SUN.azimuth, unit: '°' }),
			toggle('shading', 'Shading', 'look.shading', true),
		],
	}),
	make(5, 'pointy-crests', 'Pointy crests', {
		engine: { ...TEACHING, source: 'bank', bank: { count: 16 }, chop: 0.6 },
		look: { material: 'sea' },
		shot: CREST,
		sliders: [range('chop', 'Choppiness', 'engine.chop', { min: 0, max: 1, step: 0.01, value: 0.6 })],
	}),
	make(6, 'repetition', 'The repetition problem', {
		engine: { ...TEACHING, source: 'bank', bank: { count: 4 }, chop: 0.6 },
		look: { material: 'sea' },
		shot: { position: [0, 300, 90], target: [0, 0, 0] },
	}),
	make(7, 'real-data', 'Real ocean data', {
		engine: ONE_LAYER,
		shot: { position: [0, 60, 110], target: [0, 0, -40] },
		charts: { spectrum: true },
		sliders: [
			range('wind', 'Wind speed', 'engine.sea.windSpeed', { min: 3, max: 25, step: 0.5, value: 12, unit: 'm/s' }),
			range('fetch', 'Fetch', 'engine.sea.fetch', { min: 5000, max: 200000, step: 100, value: 80000, unit: 'm', scale: 'log' }),
		],
	}),
	make(8, 'random-ocean', 'A random ocean, moving', {
		engine: ONE_LAYER,
		shot: { position: [0, 30, 60], target: [0, 0, 0] },
		charts: { phaseArrows: true },
		// Capped: seeds 1 .. 9999 are plenty of seas, and far inside the engine's 2^31 - 1 (stageControl.js).
		sliders: [counter('seed', 'New sea', 'engine.seed', SEED, 9999)],
	}),
	make(9, 'fft', 'The FFT', {
		engine: ONE_LAYER,
		shot: HIGH,
		charts: { transformN: 32 },
		sliders: [choice('transformN', 'Waves per side', 'charts.transformN', [8, 16, 32, 64], 32)],
	}),
	make(10, 'three-layers', 'Three layers of waves', {
		engine: { source: 'fft', foam: false, glow: false },
		shot: { position: [0, 380, 120], target: [0, 0, 0] },
		sliders: [
			toggle('layer1', '256-stud layer', 'engine.layers.0', true),
			toggle('layer2', '64-stud layer', 'engine.layers.1', true),
			toggle('layer3', '16-stud layer', 'engine.layers.2', true),
		],
	}),
	make(11, 'foam', 'Foam', {
		engine: { glow: false },
		shot: { position: [0, 8, 30], target: [0, 1, -20] },
		sliders: [
			range('whitecap', 'Whitecaps', 'engine.foamKnobs.whitecap', { min: 0, max: 1, step: 0.01, value: DEFAULT_SETTINGS.foamKnobs.whitecap }),
			range('fade', 'Fade', 'engine.foamKnobs.decay', { min: 0.5, max: 0.97, step: 0.01, value: DEFAULT_SETTINGS.foamKnobs.decay }),
		],
	}),
	make(12, 'glow', 'Glow', {
		// Looking towards the sun (azimuth about 173 degrees, towards -x), where the scatter lobe glows.
		shot: { position: [40, 12, 10], target: [-120, 2, 20] },
		sliders: [
			range('sunHeight', 'Sun height', 'look.sun.elevation', { min: 2, max: 50, step: 0.5, value: PLACE_SUN.elevation, unit: '°' }),
			range('glow', 'Glow strength', 'engine.glowStrength', { min: 0, max: 60, step: 1, value: DEFAULT_SETTINGS.glowStrength }),
		],
	}),
	make(13, 'finale', 'Finale', {
		shot: { ...DECK, move: 'drift' },
	}),
]);

export function recipeFor(step) {
	if (!Number.isInteger(step) || step < 1 || step > STEP_COUNT) {
		throw new RangeError(`step must be an integer 1..${STEP_COUNT}, got ${step}`);
	}
	return RECIPES[step - 1];
}
