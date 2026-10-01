// The recipes (A3, extended by piece C2 Task 0): 28 steps in the spec's order, each a recipe the
// engine accepts, with the contract's fields, sources, materials, graph, overlays and charts in the
// places spec section 10.7 puts them. Lanes tune shots and slider values; these hold the structure.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as StageControl from '../../../content/ocean/js/engine/stageControl.js';
import { MAX_POLAR, polarOf } from '../../../content/ocean/js/page/orbitLimits.js';
import { FLAT_BAND, GRAPH_HOLD, GRAPH_PLANE_X, NO_CLIP, graphBand, graphClips } from '../../../content/ocean/js/stages/graph.js';
import { getPath } from '../../../content/ocean/js/stages/paths.js';
import * as Recipes from '../../../content/ocean/js/stages/recipes.js';
import { KINDS, clampSlider } from '../../../content/ocean/js/stages/sliders.js';
import { STEP_IDS, stepOf } from '../../../content/ocean/js/stages/steps.js';
import { presets } from '../../../content/ocean/js/core/tier.js';

const R = Recipes.RECIPES;
const at = (id) => R[stepOf(id) - 1];
const deepFrozen = (value) => value === null || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(deepFrozen));
const column = (read) => R.map(read).join(',');

test('28 recipes in step order, ids from steps.js, frozen all the way down', () => {
	expect.equal(R.length, Recipes.STEP_COUNT, 'one per step');
	R.forEach((recipe, i) => {
		expect.equal(recipe.step, i + 1, `step ${i + 1}`);
		expect.equal(recipe.id, STEP_IDS[i], `id ${i + 1}`);
		expect.truthy(typeof recipe.title === 'string' && recipe.title.length > 0, `title ${recipe.id}`);
		expect.truthy(!/\d/.test(recipe.title), `${recipe.id}'s title has no digit (copy rule)`);
	});
	expect.truthy(deepFrozen(R), 'deep frozen');
	expect.equal(Recipes.recipeFor(stepOf('jonswap')), at('jonswap'), 'recipeFor');
});

test("every recipe's engine part is settings the engine accepts, and every look field is in range", () => {
	for (const recipe of R) {
		expect.equal(Object.keys(recipe.engine).sort().join(','), [...Recipes.ENGINE_FIELDS].sort().join(','), `${recipe.id} engine fields`);
		StageControl.normalise({ ...recipe.engine, normals: true, warm: { fft: false, maps: false, layers: [false, false, false] } });
		const look = recipe.look;
		expect.truthy(Recipes.MATERIALS.includes(look.material), `${recipe.id} material`);
		expect.truthy(Recipes.MOVES.includes(recipe.shot.move), `${recipe.id} move`);
		expect.truthy(Recipes.OVERLAYS.includes(look.overlay.kind), `${recipe.id} overlay`);
		expect.truthy(look.overlay.spacing > 0, `${recipe.id} spacing`);
		expect.truthy(look.fog > 0, `${recipe.id} fog`);
		expect.truthy(Array.isArray(look.wireFade) && look.wireFade.length === 2 && look.wireFade[0] > 0 && look.wireFade[1] > look.wireFade[0], `${recipe.id} wire fade`);
		expect.truthy(['diffuse', 'specular', 'fresnel'].every((t) => typeof look.terms[t] === 'boolean'), `${recipe.id} terms`);
		const g = look.graph;
		expect.truthy(g.opacity >= 0 && g.opacity <= 1 && g.yScale >= 1 && g.near > 0 && g.far > 0 && typeof g.components === 'boolean', `${recipe.id} graph`);
		expect.truthy(Recipes.PHASE_ARROWS.includes(recipe.charts.phaseArrows), `${recipe.id} phase arrows`);
	}
});

test('sources and spreads: the sine, the bank along one axis, the bank fanned, then the FFT (spec 10.7)', () => {
	expect.equal(column((r) => r.engine.source), 'sine,sine,bank,bank,bank,bank,bank,bank,bank,bank,bank,bank,bank,bank,bank,fft,fft,fft,fft,fft,fft,fft,fft,fft,fft,fft,fft,fft', 'sources');
	expect.equal(column((r) => (r.engine.source === 'bank' ? r.engine.bank.fan : '-')), '-,-,0,0,1,1,1,1,1,1,1,1,1,0,0,-,-,-,-,-,-,-,-,-,-,-,-,-', 'spreads');
	expect.equal(column((r) => (r.id === 'mesh' ? '*' : r.engine.chop > 0)), 'false,false,false,false,false,false,false,false,false,false,false,true,true,false,false,false,false,false,false,true,true,true,true,*,true,true,true,true', 'chop at 12 and 13, then from 20');
	expect.equal(column((r) => r.engine.layers.filter(Boolean).length), '1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,3,3,3,3,3,3,3', 'three layers from 21');
	expect.equal(column((r) => r.engine.maps), 'false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,true,true,true,true,true,true,true,true,true,true,true,true,true', 'maps from 16');
	expect.equal(column((r) => r.engine.foam), 'false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,true,true,true', 'foam from 26');
	expect.equal(column((r) => r.engine.glow), 'false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,true,true', 'glow from 27');
});

// The story and the dev route ask every banded frame whether the band clips the sea; graphClips
// answers from near and far without building graphBand's range (C2 final review style item 1).
test('graphClips agrees with graphBand on every step, at the edges of NO_CLIP and beyond it', () => {
	const cases = [...R.map((r) => r.look.graph), { near: NO_CLIP, far: NO_CLIP }, { near: NO_CLIP * 2, far: NO_CLIP }, { near: NO_CLIP, far: FLAT_BAND }, { near: FLAT_BAND, far: NO_CLIP }, { near: NO_CLIP - 1e-9, far: NO_CLIP }];
	for (const graph of cases) {
		expect.equal(graphClips(graph), graphBand(graph) !== null, `near ${graph.near}, far ${graph.far}`);
	}
	expect.equal(graphClips({ near: NO_CLIP, far: NO_CLIP }), false, 'both at NO_CLIP: no clip');
	expect.equal(graphClips({ near: FLAT_BAND, far: NO_CLIP }), true, 'one side in: a clip');
});

test('materials, overlays, the graph and the charts sit where the contract puts them', () => {
	expect.equal(column((r) => (r.id === 'mesh' ? '*' : r.look.material)), 'white,white,white,white,white,white,white,white,white,terms,terms,terms,terms,white,white,painted,painted,painted,painted,painted,painted,painted,painted,*,painted,painted,painted,painted', 'materials');
	expect.equal(column((r) => r.look.overlay.kind ?? '-'), '-,-,-,-,directions,-,-,normals,slopes,-,-,-,tiles,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-', 'overlays (Task 15: the tile edges on step 13)');
	expect.equal(column((r) => (r.look.graph.opacity >= GRAPH_HOLD ? 'G' : graphBand(r.look.graph) ? 'b' : '-')), 'G,G,G,b,-,-,-,-,-,-,-,-,-,G,G,-,-,-,-,-,-,-,-,-,-,-,-,-', 'graph steps');
	expect.equal(column((r) => r.look.graph.components), 'false,false,true,false,false,false,false,false,false,false,false,false,false,true,false,false,false,false,false,false,false,false,false,false,false,false,false,false', 'components');
	expect.equal(column((r) => r.charts.phaseArrows || '-'), '-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,-,still,turning,-,-,-,-,-,-,-,-,-,-', 'phase arrows');
	expect.equal(at('jonswap').charts.spectrum, true, 'the spectrum chart');
	expect.equal(at('fft').charts.transformN, 32, 'the FFT timing');
	expect.equal(JSON.stringify(at('fourier').charts.notes), '[true,true,true]', "step 15's tones");
	expect.equal(at('diffuse').look.terms.specular, false, 'diffuse alone');
	expect.equal(at('highlights').look.terms.fresnel, true, 'every term');
	for (const id of ['sine', 'moving-sine', 'sum-of-sines', 'frequency', 'fourier']) {
		const g = at(id).look.graph;
		expect.truthy(g.near === FLAT_BAND && g.far === FLAT_BAND && g.yScale > 1 && g.opacity === 1, `${id} is the flat graph`);
	}
	expect.truthy(at('into-3d').look.graph.far > 100 && at('into-3d').look.graph.near === FLAT_BAND, 'step 4 unrolls behind the curve');
	expect.equal(at('directions').look.graph.near, NO_CLIP, 'step 5 has no clip');
});

test('graph shots face the plane side-on, inside the orbit tilt, from the dry side; the finale drifts', () => {
	for (const id of ['sine', 'moving-sine', 'sum-of-sines', 'into-3d', 'frequency', 'fourier']) {
		const { position, target } = at(id).shot;
		expect.truthy(position[0] < GRAPH_PLANE_X - at(id).look.graph.near, `${id}'s camera is on the dry side of the band`);
		expect.truthy(polarOf(at(id).shot).polar <= MAX_POLAR, `${id}'s tilt is inside the orbit limit`);
		if (at(id).look.graph.opacity === 1) {
			expect.truthy(Math.abs(target[2] - position[2]) < 1e-9 && target[0] > position[0], `${id} looks along +x`);
		}
	}
	expect.equal(at('finale').shot.move, 'drift', 'the finale drifts');
	expect.truthy(R.filter((r) => r.shot.move === 'drift').length === 1, 'only the finale');
});

test('every slider binds a value its recipe declares, has a known kind, and its default is a value it takes', () => {
	const ids = new Map();
	for (const recipe of R) {
		for (const slider of recipe.sliders) {
			expect.truthy(KINDS.includes(slider.kind), `${recipe.id} ${slider.id} kind`);
			const bound = getPath(recipe, slider.bind);
			expect.truthy(clampSlider(slider, slider.default) === slider.default, `${recipe.id} ${slider.id} default fits`);
			expect.truthy(bound === slider.default, `${recipe.id} ${slider.id}: the recipe holds its default`);
			ids.set(slider.id, [...(ids.get(slider.id) ?? []), recipe.id]);
		}
	}
	expect.equal(column((r) => r.sliders.map((s) => s.id).join('+') || '-'),
		'amplitude+wavelength,speed,waveCount,wireframe,fan,waveCount,wireframe,-,spacing,sunAzimuth,specular+fresnel,chop,-,waveCount,note1+note2+note3,wind+fetch,seed,-,transformN,chop,layer1+layer2+layer3,-,-,wireframe,-,whitecap+fade,sunHeight+glow,-',
		'the contract slider ids');
});

// C2 pre-flight R17: numbers other lanes' tests are written against, frozen in the contract
// (stages/recipeKit.js). A lane tuning its chapter keeps them.
test("the frozen values: the directions step's waves, the tiling step's waves, the frequency step's band", async () => {
	const Kit = await import('../../../content/ocean/js/stages/recipeKit.js');
	expect.equal(Kit.DIRECTIONS_WAVES, 6, 'six headings on the directions step');
	expect.equal(Kit.TILING_WAVES, 4, "the tiling step sums the bank's 4 tallest");
	expect.equal(Kit.FREQUENCY_BAND, FLAT_BAND, "the frequency step's band is the flat graph's");
	expect.equal(at('directions').engine.bank.count, Kit.DIRECTIONS_WAVES, 'directions');
	expect.equal(at('tiling').engine.bank.count, Kit.TILING_WAVES, 'tiling');
	const band = at('frequency').look.graph;
	expect.equal(`${band.near},${band.far}`, `${Kit.FREQUENCY_BAND},${Kit.FREQUENCY_BAND}`, 'frequency');
});

// Kept from A3 and piece C, renamed to step ids (Task 0 Step 13).
test('the finale is the hero sea: the rough default, every part on, the place sun and A2 fog', async () => {
	const Lighting = await import('../../../content/ocean/js/render/lighting.js');
	const { PLACE_SUN } = await import('../../../content/ocean/js/stages/sun.js');
	const finale = at('finale');
	for (const field of Recipes.ENGINE_FIELDS) {
		expect.equal(JSON.stringify(finale.engine[field]), JSON.stringify(StageControl.DEFAULT_SETTINGS[field]), `finale ${field}`);
	}
	expect.equal(finale.look.fog, Lighting.FOG_DENSITY, 'the A2 fog');
	expect.equal(finale.look.sun.azimuth, PLACE_SUN.azimuth, "the place's sun");
	expect.equal(finale.look.sun.elevation, PLACE_SUN.elevation, "at the place's height");
});

test('the seed counter stops at 9999; fetch steps 100 m on a log track inside 5,000 .. 200,000', async () => {
	const { sliderById } = await import('../../../content/ocean/js/stages/sliders.js');
	const seed = sliderById(at('random-sea'), 'seed');
	expect.equal(seed.max, 9999, 'max');
	expect.equal(clampSlider(seed, 1e305), 9999, '1e305 clamps');
	const settings = StageControl.normalise({ ...at('random-sea').engine, seed: 9999, normals: true, warm: { fft: false, maps: false, layers: [false, false, false] } });
	expect.equal(settings.seed, 9999, 'the engine takes the counter at its cap');
	const fetch = sliderById(at('jonswap'), 'fetch');
	expect.equal(fetch.scale, 'log', 'log');
	expect.equal(fetch.step, 100, 'step');
	expect.equal(clampSlider(fetch, 4000), 5000, 'min');
	expect.equal(clampSlider(fetch, 1e9), 200000, 'max');
	expect.equal(clampSlider(fetch, 5260), 5300, 'snapped to 100 m');
	expect.equal(at('fft').sliders[0].options.join(','), '8,16,32,64', 'naive sum against FFT at these grid sizes');
});

test("the choppiness sliders run to the engine's 2; the layer toggles name the High tier's sizes", async () => {
	const Tier = await import('../../../content/ocean/js/core/tier.js');
	for (const id of ['gerstner', 'choppiness']) {
		const chop = at(id).sliders.find((s) => s.id === 'chop');
		expect.equal(`${chop.min},${chop.max}`, '0,2', `${id} 0 .. 2`);
		expect.equal(at(id).engine.chop, chop.default, `${id} runs its default`);
	}
	expect.equal(at('gerstner').engine.chop, 1.3, 'the Gerstner step starts well into it');
	at('layers').sliders.forEach((slider, i) => {
		expect.truthy(slider.label.includes(String(Tier.presets.High.sizes[i])), `${slider.label}`);
		expect.equal(slider.bind, `engine.layers.${i}`, 'bound to its layer');
	});
});

test('the tiling step flies up and looks steeply down under the A2 fog; the lit sun is ahead of the deck', async () => {
	const Lighting = await import('../../../content/ocean/js/render/lighting.js');
	const tiling = at('tiling');
	expect.truthy(tiling.shot.position[1] > 5 * at('gerstner').shot.position[1], 'far higher than the Gerstner step');
	const [x, y, z] = tiling.shot.position.map((v, i) => v - tiling.shot.target[i]);
	expect.truthy(Math.atan2(y, Math.hypot(x, z)) > (60 * Math.PI) / 180, 'looking down at more than 60 degrees');
	expect.equal(tiling.look.fog, Lighting.FOG_DENSITY, "A2's fog");
	expect.equal(at('layers').look.fog, Lighting.FOG_DENSITY, "A2's fog for the layers too");
	const lit = at('diffuse');
	const [fx, , fz] = lit.shot.target.map((v, i) => v - lit.shot.position[i]);
	const a = (lit.look.sun.azimuth * Math.PI) / 180;
	const off = (Math.acos((fx * Math.cos(a) + fz * Math.sin(a)) / Math.hypot(fx, fz)) * 180) / Math.PI;
	expect.truthy(off < 60, `the sun is ${off.toFixed(0)} degrees off the line of sight`);
	// Lane D tunes the lit steps' sun (Task 0 fix round 1, U4): no literal here. A sun slider starts
	// at its own recipe's sun, so the panel never shows one sun and the sea another.
	for (const recipe of R) {
		for (const slider of recipe.sliders.filter((s) => s.bind.startsWith('look.sun.'))) {
			expect.equal(slider.default, getPath(recipe, slider.bind), `${recipe.id} ${slider.id} starts at the recipe's sun`);
		}
	}
});

// Task 14: the mesh step teaches its rings, nested squares each twice as coarse as the one inside
// (2, 4, 8 and 16 studs on High; 4 and 8 on Medium). The wireframe fades out with view depth, so
// from its shot the wire must still be fully drawn out to the far edge of High's 8-stud ring (where
// the 16-stud ring starts), and the camera looks steeply down so the rings read as squares, not as
// a strip near the horizon. Every other step keeps A3's fade.
test('the mesh step looks steeply down at its rings with the wire drawn out to the 16-stud ring', async () => {
	const { WIRE_FADE } = await import('../../../content/ocean/js/stages/recipeKit.js');
	const mesh = at('mesh');
	const { position, target } = mesh.shot;
	const view = target.map((t, i) => t - position[i]);
	const length = Math.hypot(...view);
	const forward = view.map((v) => v / length);
	expect.truthy(forward[1] < -Math.sin(Math.PI / 4), `looks down at least 45 degrees (direction y ${forward[1].toFixed(2)})`);
	const level = Math.hypot(forward[0], forward[2]);
	const ahead = [forward[0] / level, 0, forward[2] / level];
	const eightRing = presets.High.rings.find((ring) => ring.spacing === 8);
	// The 8-stud ring's far edge straight ahead of the target, one snap further to be safe.
	const reach = eightRing.halfExtent + 2 * eightRing.spacing;
	const farEdge = target.map((t, i) => t + ahead[i] * reach);
	const depth = farEdge.reduce((sum, v, i) => sum + (v - position[i]) * forward[i], 0);
	expect.truthy(mesh.look.wireFade[0] >= depth, `the fade starts at ${mesh.look.wireFade[0]} studs, past the 8-stud ring's far edge at ${depth.toFixed(0)}`);
	for (const recipe of R.filter((r) => r.id !== 'mesh')) {
		expect.equal(recipe.look.wireFade.join(','), WIRE_FADE.join(','), `${recipe.id} keeps A3's fade`);
	}
});

test('recipeFor refuses a step outside 1..STEP_COUNT', () => {
	for (const bad of [0, Recipes.STEP_COUNT + 1, 2.5, '3']) {
		let message = '';
		try {
			Recipes.recipeFor(bad);
		} catch (error) {
			message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
		}
		expect.truthy(message.includes('step'), `${bad}: ${message}`);
	}
});

// Task 15 (the Task 14 review's item 2): from the mesh step's shot the 8-stud ring's change to the
// 16-stud ring shows as more than one edge at the frame's top. On High at 16:9 the middle of the
// 8-stud ring's right edge and of its far edge both stand well inside the frame (NDC within 0.8),
// so two sides of that square read, right of the panel's column and under the math box's row.
test("the mesh step's shot shows the 8-stud ring's right and far edges well inside a 16:9 frame", async () => {
	const { FIELD_OF_VIEW } = await import('../../../content/ocean/js/render/lighting.js');
	const tanHalf = Math.tan((FIELD_OF_VIEW / 2) * (Math.PI / 180));
	const { position, target } = at('mesh').shot;
	const sub = (a, b) => a.map((v, i) => v - b[i]);
	const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
	const unit = (a) => a.map((v) => v / Math.hypot(...a));
	const forward = unit(sub(target, position));
	const right = unit([-forward[2], 0, forward[0]]);
	const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
	const half = presets.High.rings.find((ring) => ring.spacing === 8).halfExtent;
	for (const [name, point] of [['right', [target[0] + half, 0, target[2]]], ['far', [target[0], 0, target[2] - half]]]) {
		const v = sub(point, position);
		const depth = dot(v, forward);
		const x = dot(v, right) / depth / (tanHalf * (16 / 9));
		const y = dot(v, up) / depth / tanHalf;
		expect.truthy(depth > 0 && Math.abs(x) <= 0.8 && Math.abs(y) <= 0.8, `the ${name} edge's middle at NDC (${x.toFixed(2)}, ${y.toFixed(2)})`);
	}
});

// Task 15 polish (the walk: step 13 showed stripes, no tile): the tiling step draws the tile's edges,
// and only it. The edges are honest: the step's waves (the bank's tallest at full spread, chop and
// all) give the same surface at (x, z), (x + 256, z) and (x, z + 256), so every square the edges cut
// holds the same picture.
test('the tiling step alone draws the tile edges, and its surface repeats across them', async () => {
	const WaveBanks = await import('../../../content/ocean/js/engine/waveBanks.js');
	const WaveSampler = await import('../../../content/ocean/js/core/waveSampler.js');
	for (const recipe of R) {
		expect.equal(recipe.look.overlay.kind === 'tiles', recipe.id === 'tiling', `${recipe.id}: tile edges ${recipe.look.overlay.kind}`);
	}
	const tiling = at('tiling');
	const tile = WaveBanks.TEACHING_TILE;
	const bank = WaveBanks.withCount(WaveBanks.withFan(WaveBanks.teachingBank(), tiling.engine.bank.fan), tiling.engine.bank.count);
	const at0 = new Float64Array(7);
	const moved = new Float64Array(7);
	for (const [x, z, t] of [[3.7, -12.1, 0], [101.3, 47.9, 7.5], [-200.2, 133.3, 61]]) {
		WaveSampler.sample(bank.packed, bank.count, t, x, z, tiling.engine.chop, bank.weights, 0, at0);
		for (const [dx, dz] of [[tile, 0], [0, tile], [-tile, 2 * tile]]) {
			WaveSampler.sample(bank.packed, bank.count, t, x + dx, z + dz, tiling.engine.chop, bank.weights, 0, moved);
			for (let i = 0; i < 7; i++) expect.truthy(Math.abs(moved[i] - at0[i]) < 1e-6, `(${x}, ${z}) and ${dx}, ${dz} on: output ${i} ${at0[i]} vs ${moved[i]}`);
		}
	}
});
