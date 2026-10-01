// The flat graph in the browser (piece C2, lane B; spec 10.4): a dark frame with the bright curve on
// it, the curve's true height, the components in step 3, the sheet under the curve in step 4 and no
// graph from step 5 on.
import { test, expect } from '@playwright/test';
import { load, stage, grid, mean, watchErrors, waitFrames } from './helpers/stage.js';

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

// The brightest pixel of a full-resolution strip down the middle of the canvas, where the graph's
// plane faces the camera (pre-flight R20: a three-pixel line can vanish in a scaled-down copy).
async function brightest(page) {
	return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const width = Math.min(240, source.width);
		const copy = document.createElement('canvas');
		copy.width = width;
		copy.height = source.height;
		const context = copy.getContext('2d');
		context.drawImage(source, (source.width - width) / 2, 0, width, source.height, 0, 0, width, source.height);
		const data = context.getImageData(0, 0, copy.width, copy.height).data;
		let most = 0;
		for (let i = 0; i < data.length; i += 4) most = Math.max(most, 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
		resolve(most);
	})));
}

test('step 1: a dark graph with the sine drawn on it, true height 2.5 studs, the sea emptied', async ({ page }) => {
	await load(page, 'step=sine&freeze=12', 10);
	const graph = await stage(page, 'graph');
	expect(graph.shown).toBe(1);
	expect(graph.emptied).toBe(true);
	expect(graph.band).toEqual([-0.5, 0.5]);
	expect(graph.curve.points).toBe(257);
	expect(graph.curve.maxAbsY).toBeGreaterThan(2.45);
	expect(graph.curve.maxAbsY).toBeLessThan(2.55);
	expect(graph.yScale).toBe(4);
	expect(mean(await grid(page))).toBeLessThan(45);
	expect(await brightest(page)).toBeGreaterThan(110);
});

test('step 2: the curve slides', async ({ page }) => {
	await load(page, 'step=moving-sine', 10);
	const before = (await stage(page, 'graph')).curve.first[1];
	await waitFrames(page, 20);
	const after = (await stage(page, 'graph')).curve.first[1];
	expect(Math.abs(after - before)).toBeGreaterThan(0.05);
});

test('step 3: one faint curve per summed wave under the bold sum', async ({ page }) => {
	await load(page, 'step=sum-of-sines&freeze=12', 10);
	expect((await stage(page, 'graph')).components).toBe(3);
	await stage(page, 'setSlider', 'waveCount', 6);
	await waitFrames(page, 4);
	expect((await stage(page, 'graph')).components).toBe(6);
});

// Pre-flight R19: the sheet behind the curve is read from the surface probe, not a brightness that
// the sky alone would pass. The waves all run along +z here, so the sheet's tallest point and the
// curve's are the same wave heights over different stretches of z.
test('step 4: no backdrop, the sheet unrolled behind the curve, the curve on its edge', async ({ page }) => {
	await load(page, 'step=into-3d&freeze=12', 10);
	const graph = await stage(page, 'graph');
	expect(graph.shown).toBe(0);
	expect(graph.emptied).toBe(false);
	expect(graph.band[0]).toBe(-0.5);
	expect(graph.band[1]).toBe(400);
	expect(graph.yScale).toBe(1);
	expect(graph.curve).not.toBe(null);
	const surface = await stage(page, 'surface');
	expect(surface.patches).toBeGreaterThan(0);
	expect(surface.xSpread).toBeLessThan(1e-4);
	expect(surface.zSpread).toBeGreaterThan(0.05);
	expect(graph.curve.maxAbsY).toBeGreaterThan(0.95 * surface.maxAbsY);
	expect(graph.curve.maxAbsY).toBeLessThan(1.05 * surface.maxAbsY);
	expect((await stage(page, 'look')).clipped).toBe(true);
});

test('step 5 on: no graph, no clip', async ({ page }) => {
	await load(page, 'step=directions&freeze=12', 10);
	const graph = await stage(page, 'graph');
	expect(graph.band).toBe(null);
	expect(graph.curve).toBe(null);
	expect((await stage(page, 'look')).clipped).toBe(false);
});
