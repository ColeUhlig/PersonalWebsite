// The surface overlays in the browser (piece C2, lane C; spec 10.7): arrows on the surface in steps
// 5, 8 and 9, none elsewhere, finite at the sliders' ends (Review Focus 5, Task 6).
import { test, expect } from '@playwright/test';
import { load, stage, watchErrors, waitFrames } from './helpers/stage.js';
import { GRID } from '../../../content/ocean/js/page/overlayModel.js';
import { DIRECTIONS_WAVES } from '../../../content/ocean/js/stages/recipeKit.js';

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

// How many pixels of the canvas's middle half (a quarter of its area, read at full resolution so a
// thin shaft is never averaged away: pre-flight R20) are clearly coloured (an arrow on the white sea)
// rather than white, grey or sky blue: saturation over 0.45 and value over 0.3.
async function colouredPixels(page) {
	return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const width = Math.floor(source.width / 2);
		const height = Math.floor(source.height / 2);
		const copy = document.createElement('canvas');
		copy.width = width;
		copy.height = height;
		const context = copy.getContext('2d');
		context.drawImage(source, Math.floor(source.width / 4), Math.floor(source.height / 4), width, height, 0, 0, width, height);
		const data = context.getImageData(0, 0, width, height).data;
		let count = 0;
		for (let i = 0; i < data.length; i += 4) {
			const max = Math.max(data[i], data[i + 1], data[i + 2]);
			const min = Math.min(data[i], data[i + 1], data[i + 2]);
			if (max > 76 && (max - min) / max > 0.45) count += 1;
		}
		resolve(count);
	})));
}

test('step 8: a grid of normals and the tangent and binormal, drawn on the white sea', async ({ page }) => {
	await load(page, 'step=normals&freeze=12', 10);
	const overlays = await stage(page, 'overlays');
	expect(overlays.kind).toBe('normals');
	expect(overlays.arrows).toBe(GRID * GRID + 2);
	expect(overlays.finite).toBe(true);
	expect(await colouredPixels(page)).toBeGreaterThan(400);
});

test('step 5: one arrow per wave; spread 0 lays them all along one heading', async ({ page }) => {
	await load(page, 'step=directions&freeze=12', 10);
	expect((await stage(page, 'overlays')).arrows).toBe(DIRECTIONS_WAVES);
	expect(await colouredPixels(page)).toBeGreaterThan(400);
	await stage(page, 'setSlider', 'fan', 0);
	await waitFrames(page, 4);
	const first = (await stage(page, 'overlays')).first;
	expect(Math.abs(first[3] - first[0])).toBeLessThan(1e-6);
	expect(first[5] - first[2]).toBeGreaterThan(0);
});

test('no arrows on the steps without an overlay', async ({ page }) => {
	await load(page, 'step=unlit&freeze=12', 10);
	expect((await stage(page, 'overlays')).arrows).toBe(0);
	expect((await stage(page, 'overlays')).first).toBe(null);
	await load(page, 'step=jonswap&freeze=12', 20);
	expect((await stage(page, 'overlays')).arrows).toBe(0);
});
