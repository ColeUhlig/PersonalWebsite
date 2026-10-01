import { test } from 'node:test';
import * as expect from '../expect.js';
import * as StageControl from '../../../content/ocean/js/engine/stageControl.js';
import { blendRecipes, engineSettings } from '../../../content/ocean/js/stages/blend.js';
import { recipeFor, STEP_COUNT } from '../../../content/ocean/js/stages/recipes.js';
import { applySliders } from '../../../content/ocean/js/stages/sliders.js';
import { stepOf } from '../../../content/ocean/js/stages/steps.js';

// Steps by id (piece C2, Task 0): every pair blended below is a pair of neighbours.
const at = (id) => recipeFor(stepOf(id));

test('progress 0 is the first recipe and 1 the second, number for number', () => {
	const a = at('highlights');
	const b = at('gerstner');
	const start = blendRecipes(a, b, 0);
	const end = blendRecipes(a, b, 1);
	expect.equal(start.engine.chop, a.engine.chop, 'start chop');
	expect.equal(end.engine.chop, b.engine.chop, 'end chop');
	expect.equal(start.shot.position.join(','), a.shot.position.join(','), 'start shot');
	expect.equal(end.shot.position.join(','), b.shot.position.join(','), 'end shot');
	expect.equal(end.look.sun.azimuth, b.look.sun.azimuth, 'end sun');
	expect.equal(start.from, stepOf('highlights'), 'from');
	expect.equal(start.to, stepOf('gerstner'), 'to');
	expect.truthy(Object.isFrozen(start.engine.sine), 'frozen');
});

test('numbers lerp between; fetch and fog on a log scale; the sun the short way round', () => {
	const rise = blendRecipes(at('sine'), at('moving-sine'), 0.25);
	expect.near(rise.engine.sine.speed, 2, 1e-12, "a quarter of moving-sine's 8 studs/s");
	expect.equal(rise.engine.sine.amplitude, at('sine').engine.sine.amplitude, 'the same height either side');
	const fetch = blendRecipes(applySliders(at('jonswap'), { fetch: 5000 }), at('jonswap'), 0.5);
	expect.near(fetch.engine.sea.fetch, Math.sqrt(5000 * 80000), 1e-6, 'geometric midpoint of the fetches');
	// The mesh and painted steps have different fogs (0.0015 and A2's 0.0009), so a plain lerp
	// (0.0012) would miss the geometric midpoint (about 0.00116) by far more than the tolerance.
	const fog = blendRecipes(at('mesh'), at('painted'), 0.5);
	expect.truthy(at('mesh').look.fog !== at('painted').look.fog, 'the two fogs differ');
	expect.near(fog.look.fog, Math.sqrt(at('mesh').look.fog * at('painted').look.fog), 1e-12, 'geometric midpoint of the fogs');
	const sun = blendRecipes(applySliders(at('diffuse'), { sunAzimuth: 350 }), applySliders(at('diffuse'), { sunAzimuth: 10 }), 0.5);
	expect.near(sun.look.sun.azimuth, 0, 1e-9, 'through north, not round the long way');
	const shot = blendRecipes(at('gerstner'), at('tiling'), 0.5);
	const halfway = at('gerstner').shot.position.map((v, i) => (v + at('tiling').shot.position[i]) / 2);
	shot.shot.position.forEach((v, i) => expect.near(v, halfway[i], 1e-9, `the camera halfway from the crest shot to the look-down [${i}]`));
});

// Task 8 minor (piece C), kept for C2: the sine steps carry sum-of-sines' bank, so the blend into it
// meets the bank at its own count and spread when it snaps in, and nothing changes while the
// visitor scrolls on.
test("the wave count and spread are sum-of-sines' own when the bank snaps in from moving-sine", () => {
	for (const p of [0.5, 0.75]) {
		const bank = blendRecipes(at('moving-sine'), at('sum-of-sines'), p).engine.bank;
		expect.equal(bank.count, at('sum-of-sines').engine.bank.count, `count at ${p}`);
		expect.equal(bank.fan, at('sum-of-sines').engine.bank.fan, `spread at ${p}`);
	}
});

// Task 8 minor: a hair below 0 mods to exactly 360 in floating point.
test('a blended sun azimuth stays in 0 .. 360, never 360 itself', () => {
	const a = applySliders(at('diffuse'), { sunAzimuth: 0 });
	const b = applySliders(at('diffuse'), { sunAzimuth: 350 });
	for (const p of [1e-17, 1e-16, 0.5, 1]) {
		const azimuth = blendRecipes(a, b, p).look.sun.azimuth;
		expect.truthy(azimuth >= 0 && azimuth < 360, `azimuth at ${p}: ${azimuth}`);
	}
});

test('everything discrete snaps at the halfway point', () => {
	const before = blendRecipes(at('fourier'), at('jonswap'), 0.49);
	const after = blendRecipes(at('fourier'), at('jonswap'), 0.5);
	expect.equal(before.engine.source, 'bank', 'still the bank');
	expect.equal(after.engine.source, 'fft', 'the FFT from halfway');
	expect.equal(before.look.material, 'white', 'white material');
	expect.equal(after.look.material, 'painted', 'painted from halfway');
	expect.equal(before.engine.maps, false, 'maps off');
	expect.equal(after.engine.maps, true, 'maps on');
	const layers = blendRecipes(at('choppiness'), at('layers'), 0.7);
	expect.equal(layers.engine.layers.join(','), 'true,true,true', 'layers snap');
	expect.equal(layers.step, stepOf('layers'), 'the nearer step names the blend');
});

test('the parts the next step needs run warm while between, and not at the ends', () => {
	const between = blendRecipes(at('fourier'), at('jonswap'), 0.3);
	expect.equal(between.warm.fft, true, 'the FFT warming');
	expect.equal(between.warm.maps, true, 'the painter warming');
	const atFourier = blendRecipes(at('fourier'), at('jonswap'), 0);
	expect.equal(atFourier.warm.fft, false, 'at the fourier step itself nothing warms');
	const layers = blendRecipes(at('choppiness'), at('layers'), 0.2);
	expect.equal(layers.warm.layers.join(','), 'true,true,true', 'the new layers warm up before they show');
	expect.equal(layers.engine.layers.join(','), 'true,false,false', 'while only one shows');
});

test("the panel's sliders stay the step being read until the next step is reached", () => {
	const late = blendRecipes(at('jonswap'), at('random-sea'), 0.9);
	expect.equal(late.sliders.map((s) => s.id).join(','), 'wind,fetch', "the jonswap step's panel");
	expect.equal(late.charts.phaseArrows, 'still', "but the random-sea step's chart is what shows");
});

test('engineSettings adds the normals the look needs and the warm parts, and the engine accepts every one', () => {
	expect.equal(engineSettings(blendRecipes(at('sine'), at('moving-sine'), 0)).normals, false, 'white: unlit');
	expect.equal(engineSettings(blendRecipes(at('unlit'), at('normals'), 0)).normals, false, 'the unlit white blob');
	expect.equal(engineSettings(blendRecipes(at('diffuse'), at('highlights'), 0)).normals, true, 'the terms material is lit');
	expect.equal(engineSettings(blendRecipes(at('jonswap'), at('random-sea'), 0)).normals, true, 'painted');
	for (let step = 1; step <= STEP_COUNT; step++) {
		const next = recipeFor(Math.min(step + 1, STEP_COUNT));
		for (const progress of [0, 0.3, 0.5, 0.8]) {
			StageControl.normalise(engineSettings(blendRecipes(recipeFor(step), next, progress)));
		}
	}
});

test('a progress that is not a number is refused; outside 0..1 it is clamped', () => {
	let message = '';
	try {
		blendRecipes(at('sine'), at('moving-sine'), Number.NaN);
	} catch (error) {
		message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
	}
	expect.truthy(message.includes('progress'), message);
	expect.equal(blendRecipes(at('sine'), at('moving-sine'), 7).progress, 1, 'clamped to 1');
	expect.equal(blendRecipes(at('sine'), at('moving-sine'), -3).engine.sine.speed, 0, 'clamped to 0');
});

// C2 (Task 0): the new look and engine fields blend as the contract says.
test('C2 fields: spread, graph opacity and scale lerp; the band lerps on a log scale; kinds and switches snap', async () => {
	const { BASE } = await import('../../../content/ocean/js/stages/recipeKit.js');
	const { FLAT_BAND, NO_CLIP } = await import('../../../content/ocean/js/stages/graph.js');
	const recipe = (step, look, engine = {}, charts = {}) => ({ ...BASE, step, id: `r${step}`, title: 't', look: { ...BASE.look, ...look }, engine: { ...BASE.engine, ...engine }, charts: { ...BASE.charts, ...charts } });
	const a = recipe(1, { graph: { opacity: 1, yScale: 4, near: FLAT_BAND, far: FLAT_BAND, components: true }, overlay: { kind: null, spacing: 2 }, terms: { diffuse: true, specular: false, fresnel: false } }, { bank: { count: 3, fan: 0 } }, { phaseArrows: 'still', notes: [true, false, true] });
	const b = recipe(2, { graph: { opacity: 0, yScale: 1, near: NO_CLIP, far: NO_CLIP, components: false }, overlay: { kind: 'slopes', spacing: 8 }, terms: { diffuse: true, specular: true, fresnel: true } }, { bank: { count: 7, fan: 1 } }, { phaseArrows: 'turning', notes: null });
	const quarter = blendRecipes(a, b, 0.25);
	expect.near(quarter.engine.bank.fan, 0.25, 1e-12, 'fan lerps');
	expect.near(quarter.look.graph.opacity, 0.75, 1e-12, 'opacity lerps');
	expect.near(quarter.look.graph.yScale, 3.25, 1e-12, 'yScale lerps');
	expect.near(quarter.look.graph.near, FLAT_BAND * (NO_CLIP / FLAT_BAND) ** 0.25, 1e-9, 'near is geometric');
	expect.near(quarter.look.graph.far, FLAT_BAND * (NO_CLIP / FLAT_BAND) ** 0.25, 1e-9, 'far is geometric');
	expect.equal(quarter.look.graph.components, true, 'components snap: first half');
	expect.near(quarter.look.overlay.spacing, 3.5, 1e-12, 'spacing lerps');
	expect.equal(quarter.look.overlay.kind, null, 'kind snaps');
	expect.equal(JSON.stringify(quarter.look.terms), JSON.stringify(a.look.terms), 'terms snap');
	expect.equal(quarter.charts.phaseArrows, 'still', 'phase arrows snap');
	const late = blendRecipes(a, b, 0.75);
	expect.equal(late.look.overlay.kind, 'slopes', 'kind past the middle');
	expect.equal(late.look.graph.components, false, 'components past the middle');
	expect.equal(late.charts.notes, null, 'notes past the middle');
	const end = blendRecipes(a, b, 1);
	expect.equal(end.look.graph.near, NO_CLIP, 'exactly the far end at 1');
});

test('engineSettings asks for vertex normals for the terms material too', async () => {
	const { BASE } = await import('../../../content/ocean/js/stages/recipeKit.js');
	const r = { ...BASE, step: 1, id: 'r', title: 't', look: { ...BASE.look, material: 'terms' } };
	expect.equal(engineSettings(blendRecipes(r, r, 0)).normals, true, 'terms needs normals');
	const w = { ...r, look: { ...r.look, material: 'white' } };
	expect.equal(engineSettings(blendRecipes(w, w, 0)).normals, false, 'white does not');
});
