// What every chapter's recipes are built from (piece C2, Task 0; not a twin): the base recipe each
// step starts from (the hero sea, the painted look, the deck camera, no graph, no overlay), the slider
// builders, and the teaching settings and shots the chapters share. Pure data. recipes.js assembles
// the chapters (stages/chapters/) in story order (stages/steps.js).
//
// A recipe's fields (spec 4.3, A3, extended by C2 in spec 10): `engine` (the EngineSettings
// stageControl.js takes, less `normals` and `warm`), `look` (material, shading, wireframe, fog, sun,
// and C2's `terms`, `graph` and `overlay`), `shot`, `charts` and `sliders`. The low shots keep their
// lens clear of the water (tests/ocean/stages/clearance.test.js); a camera on the dry side of the
// graph's band (stages/graph.js) is clear by construction.
import { DEFAULT_SETTINGS } from '../engine/stageControl.js';
import { FOG_DENSITY } from '../render/lighting.js';
import { FLAT_BAND, GRAPH_OFF, GRAPH_Y_SCALE } from './graph.js';
import { deepFreeze } from './paths.js';
import { PLACE_SUN } from './sun.js';

export const MATERIALS = Object.freeze(['white', 'sea', 'painted', 'terms']);
export const MOVES = Object.freeze(['still', 'drift']);
export const OVERLAYS = Object.freeze([null, 'directions', 'normals', 'slopes']);
export const PHASE_ARROWS = Object.freeze([false, 'still', 'turning']);
// The recipe fields the engine reads (EngineSettings without `normals` and `warm`).
export const ENGINE_FIELDS = Object.freeze(['source', 'sine', 'bank', 'chop', 'sea', 'seed', 'layers', 'maps', 'foam', 'foamKnobs', 'glow', 'glowStrength']);

export const BASE = deepFreeze({
	engine: Object.fromEntries(ENGINE_FIELDS.map((name) => [name, DEFAULT_SETTINGS[name]])),
	look: {
		material: 'painted',
		shading: true,
		wireframe: false,
		fog: FOG_DENSITY,
		sun: { azimuth: PLACE_SUN.azimuth, elevation: PLACE_SUN.elevation },
		terms: { diffuse: true, specular: true, fresnel: true },
		graph: { ...GRAPH_OFF },
		overlay: { kind: null, spacing: 4 },
	},
	shot: { position: [0, 14, 40], target: [0, 2, -120], move: 'still' },
	charts: { spectrum: false, phaseArrows: false, transformN: null, notes: null },
	sliders: [],
});

const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Plain objects merge key by key; arrays and everything else replace.
export function merge(base, over) {
	const result = { ...base };
	for (const [key, value] of Object.entries(over)) {
		result[key] = isPlain(value) && isPlain(base[key]) ? merge(base[key], value) : value;
	}
	return result;
}

/** A recipe for step `step` from a chapter's spec `{ title, ...over }`. */
export function make(step, id, { title, ...over }) {
	if (typeof title !== 'string' || title.length === 0) {
		throw new RangeError(`step ${id} needs a title`);
	}
	return deepFreeze({ step, id, title, ...merge(BASE, over) });
}

export function range(id, label, bind, { min, max, step, value, unit = '', scale = 'linear' }) {
	return { id, label, kind: 'range', bind, min, max, step, default: value, unit, scale };
}

export function toggle(id, label, bind, value) {
	return { id, label, kind: 'toggle', bind, default: value };
}

// A whole number from 1; `max`, when given, caps it.
export function counter(id, label, bind, value, max) {
	return { id, label, kind: 'counter', bind, min: 1, ...(max === undefined ? {} : { max }), default: value };
}

export function choice(id, label, bind, options, value) {
	return { id, label, kind: 'choice', bind, options, default: value };
}

// The lit teaching steps' sun: the place's height, ahead and to the left of the deck camera, so its
// highlight lies on the water in the frame's left third without its glare filling the sky (A3 final
// review minor 1). Every teaching step keeps it, so no blend swings the sun.
export const TEACHING_SUN = deepFreeze({ azimuth: 215, elevation: PLACE_SUN.elevation });
// The teaching steps: one layer named (so the painter's lists match the FFT steps' while they warm
// up), no chop, no maps, foam or glow, and the bank at its own headings.
export const TEACHING = deepFreeze({ layers: [true, false, false], chop: 0, maps: false, foam: false, glow: false, bank: { count: 8, fan: 1 } });
export const ONE_LAYER = deepFreeze({ source: 'fft', layers: [true, false, false], foam: false, glow: false });
export const WHITE = deepFreeze({ material: 'white', wireframe: true, sun: TEACHING_SUN });
// The flat graph (spec 10.4): opaque backdrop, heights drawn GRAPH_Y_SCALE times taller, the sea a
// sliver behind the curve.
export const GRAPH_FLAT = deepFreeze({ opacity: 1, yScale: GRAPH_Y_SCALE, near: FLAT_BAND, far: FLAT_BAND, components: false });
// Side-on to the plane x = 0, looking along +x, so waves travelling +z run left to right. A hair
// above the target: the tilt, atan2(32, 0.8) = 88.6 degrees, is inside the orbit limit's 89.1
// (page/orbitLimits.js MAX_POLAR), so applying the shot never tilts it.
export const GRAPH_SHOT = deepFreeze({ position: [-32, 0.8, 0], target: [0, 0, 0] });
export const DECK = deepFreeze({ position: [0, 14, 40], target: [0, 2, -120] });
// Across the waves, side-on, at a few crests 30 to 120 studs off (piece C Task 6;
// tests/ocean/stages/crests.test.js).
export const CREST = deepFreeze({ position: [-40, 14, -20], target: [30, 0, -20] });
export const HIGH = deepFreeze({ position: [0, 110, 150], target: [0, 0, -60] });
// The finale drifts at this height: the hero sea's tallest crest on the drift circle stays under the
// lens with a margin (A3); at A2's deck height of 14 it crossed the lens.
export const FINALE_HEIGHT = 21;

// Values other lanes' tests read, frozen in the contract (C2 pre-flight R17): the chapter files use
// these and tests/ocean/stages/recipes.test.js holds them, so a lane tuning its chapter cannot move
// a number another lane's test was written against.
// The directions step's waves: one arrow per wave in lane C's overlay
// (tests/ocean/e2e/overlays.spec.js).
export const DIRECTIONS_WAVES = 6;
// The tiling step sums the bank's 4 tallest waves (lane G's facts test, lane D's clip test).
export const TILING_WAVES = 4;
// The frequency step's graph band, near and far, in studs (lane D's clip test): the flat graph's.
export const FREQUENCY_BAND = FLAT_BAND;
