// The lighting terms in the browser (piece C2, lane D; spec 10.6): each term switches on alone and
// changes the sea, the material clips with the graph's band, and the page without ?step, before the
// first scroll, is A2's painted Roblox mode exactly.
import { test, expect } from '@playwright/test';
import { grid, load, meanDiff, spread, stage, story, watchErrors, waitFrames } from './helpers/stage.js';
import { oceanRunning } from './helpers/story.js';
import { FOG_DENSITY, SUN_DIRECTION } from '../../../content/ocean/js/render/lighting.js';

const DIFFERENT = 1; // mean absolute luminance change (0..255) that counts as "the canvas changed"

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

test('the page without ?step is painted Roblox mode until the first scroll', async ({ page }) => {
	await oceanRunning(page, '/ocean/', 30);
	expect(await story(page, 'started')).toBe(false);
	const look = await story(page, 'look');
	// Every patch and horizon quad wears its own painted material (the probe reads the meshes).
	expect(look.mode).toBe('painted');
	expect(look.terms).toBe(null);
	expect(look.clipped).toBe(false);
	expect(look.wireframe).toBe(false);
	// The place's sun and A2's fog: no stage look has been applied.
	look.sun.forEach((value, i) => expect(value).toBeCloseTo(SUN_DIRECTION[i], 6));
	expect(look.fog).toBe(FOG_DENSITY);
	const materials = await page.evaluate(() => window.__ocean.materialsProbe());
	expect(materials.colourBound && materials.normalBound && materials.maskBound && materials.roughnessBound).toBe(true);
	expect(materials.materialCount).toBeGreaterThan(0);
});

test('step 7 is a white blob with no form; step 10 lights it by Lambert alone', async ({ page }) => {
	await load(page, 'step=unlit&freeze=12', 10);
	expect((await stage(page, 'look')).mode).toBe('white');
	const blob = spread(await grid(page, true));
	await load(page, 'step=diffuse&freeze=12', 10);
	const look = await stage(page, 'look');
	expect(look.mode).toBe('terms');
	expect(look.terms).toEqual({ diffuse: true, specular: false, fresnel: false });
	const lit = spread(await grid(page, true));
	expect(lit, `the lit sea varies more than the blob (${lit.toFixed(1)} against ${blob.toFixed(1)})`).toBeGreaterThan(blob * 1.5);
	const before = await grid(page, true);
	await stage(page, 'setSlider', 'sunAzimuth', 35);
	await waitFrames(page, 3);
	expect(meanDiff(before, await grid(page, true))).toBeGreaterThan(DIFFERENT);
});

test('step 11: the highlight and Fresnel each change the sea when switched off', async ({ page }) => {
	await load(page, 'step=highlights&freeze=12', 10);
	expect((await stage(page, 'look')).terms).toEqual({ diffuse: true, specular: true, fresnel: true });
	const all = await grid(page, true);
	await stage(page, 'setSlider', 'specular', false);
	await waitFrames(page, 3);
	expect((await stage(page, 'look')).terms.specular).toBe(false);
	const noHighlight = await grid(page, true);
	expect(meanDiff(all, noHighlight)).toBeGreaterThan(DIFFERENT);
	await stage(page, 'setSlider', 'fresnel', false);
	await waitFrames(page, 3);
	expect(meanDiff(noHighlight, await grid(page, true))).toBeGreaterThan(DIFFERENT);
});

// At 0.45 of the blend from the tiling step into the flat graph the camera is still high and the
// band is about 70 studs either side of x = 0, narrower than the ground in view: the frame's sides
// must show no sea.
test('the terms material clips with the graph band (the blend from the tiling step into the graph)', async ({ page }) => {
	await load(page, 'step=tiling&progress=0.45&freeze=12', 20);
	const look = await stage(page, 'look');
	expect(look.mode).toBe('terms');
	expect(look.clipped).toBe(true);
	expect(look.termsClips).toBe(true);
	const band = (await stage(page, 'graph')).band;
	expect(band[1]).toBeLessThan(100);
	const cells = await grid(page);
	const column = (from, to) => {
		const values = [];
		for (let row = 0; row < 36; row++) for (let x = from; x < to; x++) values.push(cells[row * 64 + x]);
		return values.reduce((a, b) => a + b, 0) / values.length;
	};
	expect(Math.abs(column(0, 8) - column(24, 40)), 'the left eighth is not the sea in the middle').toBeGreaterThan(5);
});
