// The surface overlays in the browser (piece C2, lane C; spec 10.7): arrows on the surface in steps
// 5, 8 and 9, none elsewhere, finite at the sliders' ends (Review Focus 5, Task 6).
import { test, expect } from '@playwright/test';
import { load, stage, watchErrors, waitFrames } from './helpers/stage.js';
import { oceanRunning, scrollToId } from './helpers/story.js';
import { COLOURS, GRID, NORMAL_ARROWS, PALETTE_HEX } from '../../../content/ocean/js/page/overlayModel.js';
import { stepOf } from '../../../content/ocean/js/stages/steps.js';
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
	expect(overlays.arrows).toBe(NORMAL_ARROWS);
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

// Fix round 2: the instance colours go up to the GPU when the overlay's kind changes, never on a
// frame that only moves the arrows. Fails if they are re-sent every frame, and fails if they are never
// re-sent after the first (the second arrow would keep the last step's colour).
test('the arrow colours are uploaded once per kind, and follow a change of kind', async ({ page }) => {
	await load(page, 'step=slopes&freeze=12', 10);
	const slopes = await stage(page, 'overlays');
	expect(slopes.colours).toEqual([PALETTE_HEX[COLOURS.NORMAL], PALETTE_HEX[COLOURS.DIFFERENCE]]);
	expect(slopes.headColours).toEqual(slopes.colours);
	await waitFrames(page, 10);
	const still = await stage(page, 'overlays');
	expect(still.colourUploads).toBe(slopes.colourUploads);
	await stage(page, 'set', stepOf('normals'), 0);
	await page.waitForFunction(() => window.__ocean.stage.overlays().kind === 'normals', null, { timeout: 30_000 });
	await waitFrames(page, 10);
	const normals = await stage(page, 'overlays');
	expect(normals.kind).toBe('normals');
	expect(normals.colours).toEqual([PALETTE_HEX[COLOURS.NORMAL], PALETTE_HEX[COLOURS.NORMAL]]);
	expect(normals.headColours).toEqual(normals.colours);
	expect(normals.colourUploads).toBeGreaterThan(still.colourUploads);
	await waitFrames(page, 10);
	expect((await stage(page, 'overlays')).colourUploads).toBe(normals.colourUploads);
});

// Fix round 3: the grid sits a fixed world offset from the focus, so orbiting round the focus moves
// the camera and never the arrows.
test('a drag on step 8 turns the camera and leaves every arrow where it stood', async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'normals', 0.3);
	await page.waitForFunction(() => window.__ocean.story.overlays().kind === 'normals', null, { timeout: 30_000 });
	await waitFrames(page, 90);
	const before = await page.evaluate(() => ({ pose: window.__ocean.story.pose(), first: window.__ocean.story.overlays().first }));
	await page.mouse.move(900, 450);
	await page.mouse.down();
	await page.mouse.move(1220, 450, { steps: 16 });
	await page.mouse.up();
	await waitFrames(page, 10);
	const after = await page.evaluate(() => ({ pose: window.__ocean.story.pose(), first: window.__ocean.story.overlays().first }));
	expect(JSON.stringify(after.pose)).not.toBe(JSON.stringify(before.pose));
	expect([after.first[0], after.first[2]]).toEqual([before.first[0], before.first[2]]);
});

// Task 15 polish: step 13 draws the tile's edges on the sea, dashed, at multiples of the 256-stud
// tile in x and z (where the surface repeats; recipes.test checks it does), with lines of both
// directions in the frame; the neighbouring steps draw none.
test('step 13 draws the tile edges at multiples of the tile, and its neighbours none', async ({ page }) => {
	await load(page, 'step=tiling&freeze=12', 10);
	await waitFrames(page, 3);
	const { tiles } = await stage(page, 'overlays');
	expect(tiles.shown).toBe(true);
	expect(tiles.tile).toBe(256);
	expect(tiles.x.length).toBeGreaterThan(2);
	expect(tiles.z.length).toBeGreaterThan(2);
	for (const v of [...tiles.x, ...tiles.z]) expect(Math.abs(v / 256 - Math.round(v / 256))).toBeLessThan(1e-9);
	const inFrame = await page.evaluate(() => {
		const camera = window.__ocean.camera;
		const { tiles: t } = window.__ocean.stage.overlays();
		const seen = (x, z) => {
			const p = camera.position.clone().set(x, 0, z).project(camera);
			return Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z < 1;
		};
		return { x: t.x.filter((x) => seen(x, camera.position.z - 150)).length, z: t.z.filter((z) => seen(camera.position.x, z)).length };
	});
	expect(inFrame.x, 'lines along z in the frame').toBeGreaterThan(0);
	expect(inFrame.z, 'lines along x in the frame').toBeGreaterThan(0);
	for (const id of ['gerstner', 'frequency']) {
		await load(page, `step=${id}&freeze=12`, 10);
		expect((await stage(page, 'overlays')).tiles.shown, id).toBe(false);
	}
	// Final review Minor 6: in the blend into step 14 the graph's band clips the sea and the backdrop
	// comes in; the tile lines go with the sea rather than float over the backdrop.
	await load(page, 'step=tiling&progress=0.3&freeze=12', 10);
	await waitFrames(page, 3);
	expect((await stage(page, 'graph')).band, 'the band is on at 0.3').not.toBe(null);
	expect((await stage(page, 'overlays')).tiles.shown, 'tile lines while banded').toBe(false);
});

// Task 15 polish (the walk: on a phone the heading arrows and the frame's T and B were a few pixels
// thick in the ocean's top half): on the narrow layout every arrow is drawn thicker, its length
// unchanged (the lengths are the model's, page/overlayModel.js); on a wide screen as before.
for (const { width, height, girth } of [{ width: 390, height: 844, girth: 1.8 }, { width: 1366, height: 767, girth: 1 }]) {
	test(`the arrows' girth on a ${width} × ${height} screen is ${girth}× the base`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		for (const id of ['directions', 'normals', 'slopes']) {
			await load(page, `step=${id}&freeze=12`, 10);
			await waitFrames(page, 3);
			const probe = await stage(page, 'overlays');
			expect(probe.arrows, id).toBeGreaterThan(0);
			expect(probe.girth, id).toBe(girth);
		}
	});
}
