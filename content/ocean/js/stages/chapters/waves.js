// Chapter one, One wave (steps 1 to 6; piece C2; lane B tunes this file, spec 10.4 and 10.7): the
// flat graph of one sine, the sine moving, a sum of the teaching bank's waves laid along one axis,
// the swing that shows the curve is the edge of a surface, the waves' headings fanning out, and more
// of the bank. Steps 1 to 3 face the graph from GRAPH_SHOT; step 4's camera stays on the dry side of
// the band (x < 0) while the sheet unrolls behind the curve. The directions step's wave count is the
// contract's DIRECTIONS_WAVES (recipeKit.js): lane C's arrows are counted against it. The sine steps
// carry sum-of-sines' bank (SNAP_BANK; tests/ocean/stages/blend.test.js holds it).
import { FLAT_BAND } from '../graph.js';
import { DIRECTIONS_WAVES, GRAPH_FLAT, GRAPH_SHOT, TEACHING, WHITE, range, toggle } from '../recipeKit.js';

// 20 studs: GRAPH_SHOT (recipeKit.js) shows about 80 studs of the plane at 16:9 and about 41 in a
// 390-pixel phone's top half, so the default shows four wavelengths on a desktop and two on a phone
// (Task 4), and the λ marker finds two crests between the axes on both (render/graphStage.js).
const SINE = { amplitude: 2.5, wavelength: 20 };
// The sine steps never sum the bank, but they carry sum-of-sines' count and spread, so the blend into
// it meets the bank at its own 3 waves along one axis when the source snaps in (not 8 waves half
// fanned out, which would then line up while the visitor scrolled on; piece C Task 8 minor).
const SNAP_BANK = { count: 3, fan: 0 };

export const WAVES = Object.freeze({
	sine: {
		title: 'The sinusoid',
		engine: { ...TEACHING, source: 'sine', sine: { ...SINE, speed: 0 }, bank: SNAP_BANK },
		look: { ...WHITE, graph: GRAPH_FLAT },
		shot: GRAPH_SHOT,
		sliders: [
			range('amplitude', 'Height', 'engine.sine.amplitude', { min: 0, max: 4, step: 0.05, value: SINE.amplitude, unit: 'studs' }),
			range('wavelength', 'Length', 'engine.sine.wavelength', { min: 8, max: 120, step: 1, value: SINE.wavelength, unit: 'studs' }),
		],
	},
	'moving-sine': {
		title: 'Time dependence',
		engine: { ...TEACHING, source: 'sine', sine: { ...SINE, speed: 8 }, bank: SNAP_BANK },
		look: { ...WHITE, graph: GRAPH_FLAT },
		shot: GRAPH_SHOT,
		sliders: [range('speed', 'Speed', 'engine.sine.speed', { min: 0, max: 20, step: 0.1, value: 8, unit: 'studs/s' })],
	},
	'sum-of-sines': {
		title: 'Superposition',
		engine: { ...TEACHING, source: 'bank', bank: SNAP_BANK },
		look: { ...WHITE, graph: { ...GRAPH_FLAT, components: true } },
		shot: GRAPH_SHOT,
		sliders: [range('waveCount', 'Waves', 'engine.bank.count', { min: 1, max: 8, step: 1, value: 3 })],
	},
	'into-3d': {
		title: 'Extension to two dimensions',
		engine: { ...TEACHING, source: 'bank', bank: { count: 3, fan: 0 } },
		look: { ...WHITE, graph: { opacity: 0, yScale: 1, near: FLAT_BAND, far: 400, components: false } },
		shot: { position: [-70, 38, 60], target: [60, 0, -20] },
		sliders: [toggle('wireframe', 'Wireframe', 'look.wireframe', true)],
	},
	directions: {
		title: 'Direction of propagation',
		engine: { ...TEACHING, source: 'bank', bank: { count: DIRECTIONS_WAVES, fan: 1 } },
		look: { ...WHITE, overlay: { kind: 'directions', spacing: 4 } },
		// High three-quarter from step 4's dry side (x < 0), so headings near +z cross the frame as
		// arrows rather than pointing into the lens (lane C's arrows; trialled by lane C's reviewer).
		shot: { position: [-60, 55, 20], target: [0, 0, -10] },
		sliders: [range('fan', 'Spread', 'engine.bank.fan', { min: 0, max: 1, step: 0.01, value: 1 })],
	},
	'many-waves': {
		title: 'Directional spreading',
		engine: { ...TEACHING, source: 'bank', bank: { count: 16, fan: 1 } },
		look: WHITE,
		shot: { position: [0, 18, 55], target: [0, 0, -20] },
		sliders: [range('waveCount', 'Waves', 'engine.bank.count', { min: 1, max: 32, step: 1, value: 16 })],
	},
});
