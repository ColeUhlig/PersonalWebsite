// The surface overlays in the browser (piece C2, lane C; spec 10.7): arrows on the surface in steps
// 5, 8 and 9, none elsewhere, finite at the sliders' ends (Review Focus 5, Task 6).
import { test, expect } from '@playwright/test';
import { load, stage, watchErrors, waitFrames } from './helpers/stage.js';
import { oceanRunning, scrollToId } from './helpers/story.js';
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

test('step 9: exact and difference arrows, a gap that grows with the spacing', async ({ page }) => {
	await load(page, 'step=slopes&freeze=12', 10);
	const small = await stage(page, 'overlays');
	expect(small.kind).toBe('slopes');
	expect(small.arrows).toBe(2 * GRID * GRID);
	await stage(page, 'setSlider', 'spacing', 12);
	await waitFrames(page, 4);
	const large = await stage(page, 'overlays');
	expect(large.meanAngle).toBeGreaterThan(small.meanAngle);
});

// Review Focus 5.
test('the overlays hold at the sliders ends', async ({ page }) => {
	for (const value of [0.5, 16]) {
		await load(page, `step=slopes&freeze=104.6&s.spacing=${value}`, 10);
		const probe = await stage(page, 'overlays');
		expect(probe.finite).toBe(true);
		expect(Number.isFinite(probe.meanAngle)).toBe(true);
		expect(probe.arrows).toBe(2 * GRID * GRID);
	}
	for (const value of [0, 1]) {
		await load(page, `step=directions&freeze=104.6&s.fan=${value}`, 10);
		const probe = await stage(page, 'overlays');
		expect(probe.finite).toBe(true);
		expect(probe.arrows).toBe(DIRECTIONS_WAVES);
	}
});

test('the readout under step 9 is live, follows the slider, and is empty in the served page', async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await expect(page.locator('[data-readout="slopes"]')).toHaveText('');
	await scrollToId(page, 'slopes', 0.2);
	await expect(page.locator('[data-readout="slopes"]')).toContainText('°', { timeout: 10_000 });
	const before = await page.locator('[data-readout="slopes"]').textContent();
	await page.locator('section[data-step-id="slopes"] [data-slider="spacing"] input').fill('14');
	await expect(page.locator('[data-readout="slopes"]')).not.toHaveText(before, { timeout: 10_000 });
	await expect(page.locator('[data-readout="slopes"]')).toContainText('14 studs');
});
