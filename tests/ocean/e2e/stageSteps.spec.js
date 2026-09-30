import { test, expect } from '@playwright/test';

// One browser check per story step (A3), through the dev route ?step=N: the engine state the
// recipe asks for, and the canvas changing when a slider says it should. The config draws on the
// GPU (ANGLE Metal, about 60 fps; OCEAN_GL=swiftshader drops to about 5 fps), so every wait is in
// frames, and every threshold was chosen before measuring: if one fails on a page that renders
// correctly, report the measured value rather than lowering it.
//
// Every check runs twice: on the tier this machine's probe picks (High on the M4) and on Medium,
// the tier phones get by rule (engine/config.js tierForDevice), which runs two cascade layers
// instead of three. The only steps that read differently on Medium are the ones that list layers
// (7, 10 and 13): their lists are two long, and step 10's third toggle is shown unavailable.
const DIFFERENT = 1; // mean absolute luminance change (0..255) that counts as "the canvas changed"
const MOVING = 2; // the same, over frames with the clock running
const VISIBLE = 3; // the same, for a slider whose whole lesson is the change it makes (step 5)
const TIERS = [
	{ name: 'the probed tier', query: '', layers: 3 },
	{ name: 'Medium (phones)', query: '&tier=Medium', layers: 2 },
];

let errors;
test.beforeEach(({ page }) => {
	errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

async function load(page, query, frames = 20) {
	await page.goto(`/ocean/?${query}`);
	await page.waitForFunction((target) => (window.__ocean?.status().frame ?? 0) > target, frames, { timeout: 120_000 });
}

async function waitFrames(page, frames) {
	const start = await page.evaluate(() => window.__ocean.status().frame);
	await page.waitForFunction((target) => window.__ocean.status().frame >= target, start + frames, { timeout: 120_000 });
}

const stage = (page, name, ...args) => page.evaluate(([name, args]) => window.__ocean.stage[name](...args), [name, args]);

// The canvas (or its lower half) as a 64-wide luminance grid, read inside a frame callback after
// the page's own render: the renderer does not keep its drawing buffer between frames.
async function grid(page, lower = false) {
	return page.evaluate((lower) => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const copy = document.createElement('canvas');
		copy.width = 64;
		copy.height = lower ? 18 : 36;
		const context = copy.getContext('2d');
		const top = lower ? source.height / 2 : 0;
		context.drawImage(source, 0, top, source.width, source.height - top, 0, 0, copy.width, copy.height);
		const data = context.getImageData(0, 0, copy.width, copy.height).data;
		const out = [];
		for (let i = 0; i < data.length; i += 4) out.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
		resolve(out);
	})), lower);
}

const meanDiff = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

async function lowerHalfMotion(page, frames) {
	const before = await grid(page, true);
	await waitFrames(page, frames);
	return meanDiff(before, await grid(page, true));
}

for (const tier of TIERS) {
	const q = (query) => `${query}${tier.query}`;
	// A layer list as long as this tier's cascades.
	const layers = (...list) => list.slice(0, tier.layers);

	test.describe(tier.name, () => {
		test('step 1: a flat white plane under a grid; the wireframe toggles off', async ({ page }) => {
			await load(page, q('step=1&freeze=12'), 10);
			const surface = await stage(page, 'surface');
			expect(surface.maxAbsY).toBe(0);
			expect(surface.maxLateral).toBe(0);
			const status = await page.evaluate(() => window.__ocean.status());
			expect(status.parts).toEqual({ cascades: false, painter: false, glow: false, still: true });
			const withGrid = await grid(page, true);
			expect(mean(withGrid)).toBeGreaterThan(150);
			await stage(page, 'setSlider', 'wireframe', false);
			await waitFrames(page, 3);
			expect(meanDiff(withGrid, await grid(page, true))).toBeGreaterThan(DIFFERENT);
			expect((await stage(page, 'look')).wireframe).toBe(false);
		});

		// The sine travels along +z, towards the camera, so its crests run across the view (final
		// review I2): the height changes along z only.
		test('step 2: one sine wave, changing along one axis only, moving', async ({ page }) => {
			await load(page, q('step=2'), 10);
			const surface = await stage(page, 'surface');
			expect(surface.xSpread).toBe(0);
			expect(surface.zSpread).toBeGreaterThan(0.2);
			expect(surface.maxLateral).toBe(0);
			expect(await lowerHalfMotion(page, 10)).toBeGreaterThan(MOVING);
		});

		test('step 3: the wave-count slider adds waves to the canvas', async ({ page }) => {
			await load(page, q('step=3&freeze=12&s.waveCount=1'), 10);
			const one = await grid(page);
			await stage(page, 'setSlider', 'waveCount', 32);
			await waitFrames(page, 3);
			expect(meanDiff(one, await grid(page))).toBeGreaterThan(DIFFERENT);
		});

		test('step 4: light: turning the shading off and moving the sun both change the sea', async ({ page }) => {
			await load(page, q('step=4&freeze=12'), 10);
			expect((await stage(page, 'look')).mode).toBe('sea-lit');
			const lit = await grid(page, true);
			await stage(page, 'setSlider', 'shading', false);
			await waitFrames(page, 3);
			expect((await stage(page, 'look')).mode).toBe('sea-flat');
			expect(meanDiff(lit, await grid(page, true))).toBeGreaterThan(DIFFERENT);
			await stage(page, 'setSlider', 'shading', true);
			await waitFrames(page, 3);
			const before = await grid(page, true);
			await stage(page, 'setSlider', 'sunAzimuth', 0);
			await waitFrames(page, 3);
			expect(meanDiff(before, await grid(page, true))).toBeGreaterThan(DIFFERENT);
		});

		// Final review I3: over its old 0 .. 1 the slider barely changed the frame. It now runs to 2
		// from a default of 1.3, and both halves of its travel must change the canvas visibly.
		test('step 5: choppiness moves the vertices sideways and visibly sharpens the crests', async ({ page }) => {
			await load(page, q('step=5&freeze=12&s.chop=0'), 10);
			expect((await stage(page, 'surface')).maxLateral).toBe(0);
			const flat = await grid(page);
			const slider = (await stage(page, 'sliders')).find((s) => s.id === 'chop');
			expect([slider.min, slider.max, slider.default]).toEqual([0, 2, 1.3]);
			await stage(page, 'setSlider', 'chop', slider.default);
			await waitFrames(page, 3);
			expect((await stage(page, 'surface')).maxLateral).toBeGreaterThan(0.1);
			const middle = await grid(page);
			expect(meanDiff(flat, middle)).toBeGreaterThan(VISIBLE);
			await stage(page, 'setSlider', 'chop', slider.max);
			await waitFrames(page, 3);
			expect(meanDiff(middle, await grid(page))).toBeGreaterThan(VISIBLE);
		});

		// Task 10 fix round 1 moved step 6 to a steep look-down from a few hundred studs under A2's fog,
		// so the check reads the recipe from the page's own module rather than copying its numbers.
		test('step 6: the camera rises and looks down so the repetition shows', async ({ page }) => {
			await load(page, q('step=6&freeze=12'), 10);
			const recipe = await page.evaluate(async () => (await import('/ocean/js/stages/recipes.js')).recipeFor(6));
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

		test('step 7: the FFT with one layer; a stronger wind raises the sea; the spectrum chart has data', async ({ page }) => {
			test.setTimeout(240_000);
			await load(page, q('step=7&freeze=12&s.wind=6'), 40);
			const status = await page.evaluate(() => window.__ocean.status());
			expect(status.source).toBe('fft');
			expect(status.layers).toEqual(layers(true, false, false));
			const calm = (await stage(page, 'surface')).maxAbsY;
			await stage(page, 'setSlider', 'wind', 22);
			await waitFrames(page, 60);
			expect((await stage(page, 'surface')).maxAbsY).toBeGreaterThan(calm * 1.5);
			const spectrum = await stage(page, 'spectrum');
			expect(spectrum.omega.length).toBe(200);
			expect(spectrum.physical.every(Number.isFinite)).toBe(true);
		});

		test('step 8: New sea draws another random ocean, and the phase arrows turn', async ({ page }) => {
			test.setTimeout(180_000);
			await load(page, q('step=8&freeze=12'), 40);
			const before = (await stage(page, 'surface')).sumY;
			expect(await stage(page, 'press', 'seed')).toBe(8);
			await waitFrames(page, 30);
			expect(Math.abs((await stage(page, 'surface')).sumY - before)).toBeGreaterThan(1e-3);
			const arrows = await stage(page, 'phaseArrows');
			expect(arrows.length).toBe(8);
			expect(arrows.every((a) => Number.isFinite(a.re) && Number.isFinite(a.im))).toBe(true);
		});

		test('step 9: the naive sum and the FFT are timed live and agree', async ({ page }) => {
			await load(page, q('step=9&freeze=12'), 10);
			expect((await stage(page, 'recipe')).charts.transformN).toBe(32);
			const result = await stage(page, 'transforms', 16);
			expect(result.naiveMs).toBeGreaterThan(0);
			expect(result.fftMs).toBeGreaterThan(0);
			expect(result.maxDifference).toBeLessThan(1e-6);
		});

		test('step 10: switching a layer off changes the sea on screen', async ({ page }) => {
			test.setTimeout(240_000);
			await load(page, q('step=10&freeze=12'), 60);
			expect((await page.evaluate(() => window.__ocean.status())).layers).toEqual(layers(true, true, true));
			// The third layer's toggle is shown unavailable where the tier has no third cascade.
			const available = (await stage(page, 'sliders')).map((s) => s.available);
			expect(available).toEqual([true, true, tier.layers === 3]);
			const all = await grid(page);
			await stage(page, 'setSlider', 'layer1', false);
			await waitFrames(page, 12);
			expect(meanDiff(all, await grid(page))).toBeGreaterThan(DIFFERENT);
			expect((await page.evaluate(() => window.__ocean.status())).layers).toEqual(layers(false, true, true));
		});

		test('step 11: the whitecap slider sets how much foam there is', async ({ page }) => {
			test.setTimeout(300_000);
			await load(page, q('step=11&freeze=12&s.whitecap=0'), 80);
			const little = await page.evaluate(() => window.__ocean.status().foamCover);
			await load(page, q('step=11&freeze=12&s.whitecap=1'), 80);
			const lots = await page.evaluate(() => window.__ocean.status().foamCover);
			expect(lots).toBeGreaterThan(little);
		});

		test('step 12: the glow slider drives the emissive glow and the sun-height slider moves the sun', async ({ page }) => {
			test.setTimeout(180_000);
			await load(page, q('step=12&freeze=12&s.glow=0'), 40);
			expect(await page.evaluate(() => window.__ocean.materialsProbe().maxEmissiveIntensity)).toBe(0);
			await stage(page, 'setSlider', 'glow', 60);
			await waitFrames(page, 3);
			expect(await page.evaluate(() => window.__ocean.materialsProbe().maxEmissiveIntensity)).toBeGreaterThan(0);
			await stage(page, 'setSlider', 'sunHeight', 40);
			await waitFrames(page, 3);
			expect((await stage(page, 'look')).sun[1]).toBeCloseTo(Math.sin((40 * Math.PI) / 180), 6);
		});

		test('step 13: the hero sea, every part on, moving', async ({ page }) => {
			test.setTimeout(180_000);
			await load(page, q('step=13'), 40);
			const status = await page.evaluate(() => window.__ocean.status());
			const hero = await page.evaluate(async () => (await import('/ocean/js/engine/stageControl.js')).DEFAULT_SETTINGS);
			expect(status.source).toBe('fft');
			expect(status.layers).toEqual(layers(true, true, true));
			expect(status.parts).toEqual({ cascades: true, painter: true, glow: true, still: false });
			expect(status.windSpeed).toBe(hero.sea.windSpeed);
			expect(status.chop).toBe(hero.chop);
			expect(await lowerHalfMotion(page, 30)).toBeGreaterThan(MOVING);
		});
	});
}
