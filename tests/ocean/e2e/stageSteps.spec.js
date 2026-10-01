import { test, expect } from '@playwright/test';
import { grid, load, lowerHalfMotion, mean, meanDiff, stage, waitFrames, watchErrors } from './helpers/stage.js';

// One browser check per story step (A3, renamed to step ids in piece C2 Task 0), through the dev
// route ?step=<id>: the engine state the recipe asks for, and the canvas or the probes changing when
// a slider says they should. The config draws on the GPU (ANGLE Metal, about 60 fps;
// OCEAN_GL=swiftshader drops to about 5 fps), so every wait is in frames, and every threshold was
// chosen before measuring: if one fails on a page that renders correctly, report the measured value
// rather than lowering it.
//
// The graph steps (sine, moving-sine, sum-of-sines) and the lighting switches read the engine's
// probes, not pixels (C2 pre-flight R3, R4): lane B draws the graph over the canvas and lane D the
// term-by-term material, and their own specs check those pixels.
//
// Every check runs twice: on the tier this machine's probe picks (High on the M4) and on Medium,
// the tier phones get by rule (engine/config.js tierForDevice), which runs two cascade layers
// instead of three. The only steps that read differently on Medium are the ones that list layers
// (jonswap, layers and the finale): their lists are two long, and the layers step's third toggle is
// shown unavailable.
const DIFFERENT = 1; // mean absolute luminance change (0..255) that counts as "the canvas changed"
const MOVING = 2; // the same, over frames with the clock running
const VISIBLE = 3; // the same, for a slider whose whole lesson is the change it makes (the Gerstner step)
const TIERS = [
	{ name: 'the probed tier', query: '', layers: 3 },
	{ name: 'Medium (phones)', query: '&tier=Medium', layers: 2 },
];

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

const status = (page) => page.evaluate(() => window.__ocean.status());

for (const tier of TIERS) {
	const q = (query) => `${query}${tier.query}`;
	// A layer list as long as this tier's cascades.
	const layers = (...list) => list.slice(0, tier.layers);

	test.describe(tier.name, () => {
		// The sine travels along +z (final review I2): the height changes along z only. Its speed is 0
		// on this step, so the surface holds still with the clock running.
		test('sine: one still sine wave along one axis, clipped to the graph; Height and Length reshape it', async ({ page }) => {
			await load(page, q('step=sine'), 10);
			const surface = await stage(page, 'surface');
			expect(surface.xSpread).toBe(0);
			expect(surface.zSpread).toBeGreaterThan(0.2);
			expect(surface.maxLateral).toBe(0);
			// Lane B tunes the sine; the surface stands as tall as the recipe says.
			expect(surface.maxAbsY).toBeGreaterThan(0.9 * (await stage(page, 'recipe')).engine.sine.amplitude);
			expect((await stage(page, 'graph')).band).toEqual([-0.5, 0.5]);
			await waitFrames(page, 10);
			expect((await stage(page, 'surface')).sumY).toBe(surface.sumY);
			// Lane B tunes the sliders: every value here comes from the recipe (Task 0 fix round 1, U4).
			const sliders = await stage(page, 'sliders');
			const height = sliders.find((s) => s.id === 'amplitude');
			const lower = height.min + 0.4 * (height.default - height.min);
			await stage(page, 'setSlider', 'amplitude', lower);
			await waitFrames(page, 3);
			const low = (await stage(page, 'sliders')).find((s) => s.id === 'amplitude').value;
			expect((await stage(page, 'surface')).maxAbsY).toBeLessThan(low + 0.01);
			// A longer wave changes less between neighbouring vertices (A k times the spacing), a
			// shorter one more. The sum of heights cannot tell: at phase 0 the sine is odd about the
			// patches' centre.
			const length = sliders.find((s) => s.id === 'wavelength');
			const before = (await stage(page, 'surface')).zSpread;
			const longer = Math.min(length.max, 2 * length.default);
			const target = longer >= 1.5 * length.default ? longer : length.min;
			await stage(page, 'setSlider', 'wavelength', target);
			await waitFrames(page, 3);
			const after = (await stage(page, 'surface')).zSpread;
			if (target > length.default) {
				expect(after).toBeLessThan((0.5 + 0.5 * (length.default / target)) * before);
			} else {
				expect(after).toBeGreaterThan(1.2 * before);
			}
		});

		test('moving-sine: the same wave, moving, along one axis only', async ({ page }) => {
			await load(page, q('step=moving-sine'), 10);
			const surface = await stage(page, 'surface');
			expect(surface.xSpread).toBe(0);
			expect(surface.zSpread).toBeGreaterThan(0.2);
			expect(surface.maxLateral).toBe(0);
			await waitFrames(page, 20);
			expect(Math.abs((await stage(page, 'surface')).sumY - surface.sumY)).toBeGreaterThan(1e-3);
			expect((await stage(page, 'sliders')).map((s) => s.id)).toEqual(['speed']);
		});

		test('sum-of-sines: the bank laid along one axis, clipped to the graph; the wave count changes the sum', async ({ page }) => {
			await load(page, q('step=sum-of-sines&freeze=12&s.waveCount=1'), 10);
			const one = await stage(page, 'surface');
			expect(one.xSpread).toBe(0);
			expect(one.zSpread).toBeGreaterThan(0.05);
			expect((await stage(page, 'graph')).band).toEqual([-0.5, 0.5]);
			expect((await stage(page, 'look')).clipped).toBe(true);
			await stage(page, 'setSlider', 'waveCount', 8);
			await waitFrames(page, 3);
			const eight = await stage(page, 'surface');
			expect(eight.xSpread).toBe(0);
			expect(Math.abs(eight.sumY - one.sumY)).toBeGreaterThan(1e-3);
		});

		test('into-3d: the band opens behind the curve; the wireframe switch works', async ({ page }) => {
			await load(page, q('step=into-3d&freeze=12'), 10);
			// The band's far side is lane B's to tune: read it from the recipe.
			const { near, far } = (await stage(page, 'recipe')).look.graph;
			expect((await stage(page, 'graph')).band).toEqual([-near, far]);
			expect(far).toBeGreaterThan(100);
			expect((await stage(page, 'look')).wireframe).toBe(true);
			await stage(page, 'setSlider', 'wireframe', false);
			await waitFrames(page, 3);
			expect((await stage(page, 'look')).wireframe).toBe(false);
		});

		test('directions: no clip, the directions overlay, and the spread fans the waves out of one axis', async ({ page }) => {
			await load(page, q('step=directions&freeze=12&s.fan=0'), 10);
			expect((await stage(page, 'graph')).band).toBe(null);
			expect((await stage(page, 'overlays')).kind).toBe('directions');
			expect((await stage(page, 'surface')).xSpread).toBe(0);
			await stage(page, 'setSlider', 'fan', 1);
			await waitFrames(page, 3);
			expect((await stage(page, 'surface')).xSpread).toBeGreaterThan(0.01);
		});

		test('many-waves: the wave-count slider adds waves to the canvas', async ({ page }) => {
			await load(page, q('step=many-waves&freeze=12&s.waveCount=1'), 10);
			const one = await grid(page);
			await stage(page, 'setSlider', 'waveCount', 32);
			await waitFrames(page, 3);
			expect(meanDiff(one, await grid(page))).toBeGreaterThan(DIFFERENT);
		});

		// Piece C's flat plane has no home in C2; its checks moved here: a white surface with no grid,
		// moving, and the wireframe switch changes the canvas.
		test('unlit: a moving white bank with no light; the wireframe switch changes the canvas', async ({ page }) => {
			await load(page, q('step=unlit&freeze=12'), 10);
			expect((await stage(page, 'look')).mode).toBe('white');
			expect((await stage(page, 'look')).wireframe).toBe(false);
			expect((await status(page)).parts.still).toBe(false);
			expect((await stage(page, 'surface')).maxAbsY).toBeGreaterThan(0.5);
			const plain = await grid(page, true);
			expect(mean(plain)).toBeGreaterThan(150);
			await stage(page, 'setSlider', 'wireframe', true);
			await waitFrames(page, 3);
			expect(meanDiff(plain, await grid(page, true))).toBeGreaterThan(DIFFERENT);
			expect((await stage(page, 'look')).wireframe).toBe(true);
		});

		test('diffuse: the terms material; moving the sun changes the sea', async ({ page }) => {
			await load(page, q('step=diffuse&freeze=12'), 10);
			expect((await stage(page, 'look')).mode).toBe('terms');
			expect((await stage(page, 'recipe')).look.terms).toEqual({ diffuse: true, specular: false, fresnel: false });
			const before = await grid(page, true);
			await stage(page, 'setSlider', 'sunAzimuth', 0);
			await waitFrames(page, 3);
			expect(meanDiff(before, await grid(page, true))).toBeGreaterThan(DIFFERENT);
		});

		// Pre-flight R3: Task 0's terms material is a stand-in that ignores the switches, so this reads
		// the recipe; lane D's lightTerms.spec.js checks the pixels.
		test('highlights: the highlight and Fresnel switches reach the recipe the terms material reads', async ({ page }) => {
			await load(page, q('step=highlights&freeze=12'), 10);
			expect((await stage(page, 'look')).mode).toBe('terms');
			expect((await stage(page, 'recipe')).look.terms).toEqual({ diffuse: true, specular: true, fresnel: true });
			await stage(page, 'setSlider', 'specular', false);
			await waitFrames(page, 2);
			expect((await stage(page, 'recipe')).look.terms.specular).toBe(false);
			await stage(page, 'setSlider', 'fresnel', false);
			await waitFrames(page, 2);
			expect((await stage(page, 'recipe')).look.terms).toEqual({ diffuse: true, specular: false, fresnel: false });
		});

		// Final review I3: the slider runs to 2 from a default of 1.3, and both halves of its travel
		// must change the picture visibly. Since the side-on shot the full frame is a third sky and
		// read 2.73 (C Task 8 round 2); the check reads the crest region, the frame's lower half,
		// which is all water from this shot.
		test('gerstner: choppiness moves the vertices sideways and visibly sharpens the crests', async ({ page }) => {
			await load(page, q('step=gerstner&freeze=12&s.chop=0'), 10);
			expect((await stage(page, 'surface')).maxLateral).toBe(0);
			const flat = await grid(page, true);
			const slider = (await stage(page, 'sliders')).find((s) => s.id === 'chop');
			expect([slider.min, slider.max, slider.default]).toEqual([0, 2, 1.3]);
			await stage(page, 'setSlider', 'chop', slider.default);
			await waitFrames(page, 3);
			const lateral = (await stage(page, 'surface')).maxLateral;
			expect(lateral).toBeGreaterThan(0.1);
			const middle = await grid(page, true);
			expect(meanDiff(flat, middle)).toBeGreaterThan(VISIBLE);
			await stage(page, 'setSlider', 'chop', slider.max);
			await waitFrames(page, 3);
			expect((await stage(page, 'surface')).maxLateral).toBeGreaterThan(lateral);
			expect(meanDiff(middle, await grid(page, true))).toBeGreaterThan(VISIBLE);
		});

		// Task 10 fix round 1 moved the tiling shot to a steep look-down from a few hundred studs under
		// A2's fog, so the check reads the recipe from the page's own module rather than copying it.
		test('tiling: the camera rises and looks down so the repetition shows', async ({ page }) => {
			await load(page, q('step=tiling&freeze=12'), 10);
			const recipe = await page.evaluate(async () => {
				const { recipeFor } = await import('/ocean/js/stages/recipes.js');
				const { stepOf } = await import('/ocean/js/stages/steps.js');
				return recipeFor(stepOf('tiling'));
			});
			const { position, direction } = await page.evaluate(() => {
				const camera = window.__ocean.camera;
				return {
					position: camera.position.toArray(),
					direction: camera.getWorldDirection(camera.position.clone()).toArray(),
				};
			});
			expect(Math.hypot(...position.map((value, i) => value - recipe.shot.position[i]))).toBeLessThan(1);
			expect((await stage(page, 'look')).fog).toBeCloseTo(recipe.look.fog, 12);
			expect(position[1]).toBeGreaterThan(200);
			expect(direction[1]).toBeLessThan(-0.9);
		});

		test('jonswap: the FFT with one layer; a stronger wind raises the sea; the spectrum chart has data', async ({ page }) => {
			test.setTimeout(240_000);
			await load(page, q('step=jonswap&freeze=12&s.wind=6'), 40);
			const state = await status(page);
			expect(state.source).toBe('fft');
			expect(state.layers).toEqual(layers(true, false, false));
			const calm = (await stage(page, 'surface')).maxAbsY;
			await stage(page, 'setSlider', 'wind', 22);
			await waitFrames(page, 60);
			expect((await stage(page, 'surface')).maxAbsY).toBeGreaterThan(calm * 1.5);
			const spectrum = await stage(page, 'spectrum');
			expect(spectrum.omega.length).toBe(200);
			expect(spectrum.physical.every(Number.isFinite)).toBe(true);
		});

		test('random-sea: New sea draws another random ocean, and the phase arrows have data', async ({ page }) => {
			test.setTimeout(180_000);
			await load(page, q('step=random-sea&freeze=12'), 40);
			const before = (await stage(page, 'surface')).sumY;
			expect(await stage(page, 'press', 'seed')).toBe(8);
			await waitFrames(page, 30);
			expect(Math.abs((await stage(page, 'surface')).sumY - before)).toBeGreaterThan(1e-3);
			const arrows = await stage(page, 'phaseArrows');
			expect(arrows.length).toBe(8);
			expect(arrows.every((a) => Number.isFinite(a.re) && Number.isFinite(a.im))).toBe(true);
		});

		test('fft: the naive sum and the FFT are timed live and agree', async ({ page }) => {
			await load(page, q('step=fft&freeze=12'), 10);
			expect((await stage(page, 'recipe')).charts.transformN).toBe(32);
			const result = await stage(page, 'transforms', 16);
			expect(result.naiveMs).toBeGreaterThan(0);
			expect(result.fftMs).toBeGreaterThan(0);
			expect(result.maxDifference).toBeLessThan(1e-6);
		});

		test('layers: switching a layer off changes the sea on screen', async ({ page }) => {
			test.setTimeout(240_000);
			await load(page, q('step=layers&freeze=12'), 60);
			expect((await status(page)).layers).toEqual(layers(true, true, true));
			// The third layer's toggle is shown unavailable where the tier has no third cascade.
			const available = (await stage(page, 'sliders')).map((s) => s.available);
			expect(available).toEqual([true, true, tier.layers === 3]);
			const all = await grid(page);
			await stage(page, 'setSlider', 'layer1', false);
			await waitFrames(page, 12);
			expect(meanDiff(all, await grid(page))).toBeGreaterThan(DIFFERENT);
			expect((await status(page)).layers).toEqual(layers(false, true, true));
		});

		test('foam: the whitecap slider sets how much foam there is', async ({ page }) => {
			test.setTimeout(300_000);
			await load(page, q('step=foam&freeze=12&s.whitecap=0'), 80);
			const little = await page.evaluate(() => window.__ocean.status().foamCover);
			await load(page, q('step=foam&freeze=12&s.whitecap=1'), 80);
			const lots = await page.evaluate(() => window.__ocean.status().foamCover);
			expect(lots).toBeGreaterThan(little);
		});

		test('glow: the glow slider drives the emissive glow and the sun-height slider moves the sun', async ({ page }) => {
			test.setTimeout(180_000);
			await load(page, q('step=glow&freeze=12&s.glow=0'), 40);
			expect(await page.evaluate(() => window.__ocean.materialsProbe().maxEmissiveIntensity)).toBe(0);
			await stage(page, 'setSlider', 'glow', 60);
			await waitFrames(page, 3);
			expect(await page.evaluate(() => window.__ocean.materialsProbe().maxEmissiveIntensity)).toBeGreaterThan(0);
			await stage(page, 'setSlider', 'sunHeight', 40);
			await waitFrames(page, 3);
			expect((await stage(page, 'look')).sun[1]).toBeCloseTo(Math.sin((40 * Math.PI) / 180), 6);
		});

		test('finale: the hero sea, every part on, moving', async ({ page }) => {
			test.setTimeout(180_000);
			await load(page, q('step=finale'), 40);
			const state = await status(page);
			const hero = await page.evaluate(async () => (await import('/ocean/js/engine/stageControl.js')).DEFAULT_SETTINGS);
			expect(state.source).toBe('fft');
			expect(state.layers).toEqual(layers(true, true, true));
			expect(state.parts).toEqual({ cascades: true, painter: true, glow: true, still: false });
			expect(state.windSpeed).toBe(hero.sea.windSpeed);
			expect(state.chop).toBe(hero.chop);
			expect(await lowerHalfMotion(page, 30)).toBeGreaterThan(MOVING);
		});
	});
}
