import { test, expect } from '@playwright/test';

async function ready(page) {
	await page.waitForFunction(() => {
		const s = window.__ocean?.status();
		return s && s.painterReady && s.workersReady > 0 && s.frame > 30;
	}, null, { timeout: 60_000 });
}

// The renderer does not preserve its drawing buffer, so a read between frames sees a cleared
// canvas; reading in a frame callback, after the page's own render in that frame, sees the image.
async function canvasVariance(page) {
	return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const copy = document.createElement('canvas');
		copy.width = 64;
		copy.height = 36;
		const context = copy.getContext('2d');
		context.drawImage(source, 0, 0, 64, 36);
		const data = context.getImageData(0, 0, 64, 36).data;
		let sum = 0;
		let sumSquares = 0;
		for (let i = 0; i < data.length; i += 4) {
			const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
			sum += luminance;
			sumSquares += luminance * luminance;
		}
		const count = data.length / 4;
		resolve(sumSquares / count - (sum / count) ** 2);
	})));
}

test('the ocean starts, workers and painters come up, and the canvas shows something', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
	await page.goto('/ocean/?cam=deck');
	await ready(page);
	const status = await page.evaluate(() => window.__ocean.status());
	expect(status.mode).toBe('workers');
	expect(status.vertices).toBe(18144);
	expect(await canvasVariance(page)).toBeGreaterThan(20);
	expect(errors).toEqual([]);
});

test('workers off still renders on the main thread (Review Focus 1)', async ({ page }) => {
	await page.goto('/ocean/?workers=0&cam=deck');
	await ready(page);
	const status = await page.evaluate(() => window.__ocean.status());
	expect(status.mode).toBe('main-thread');
	expect(await canvasVariance(page)).toBeGreaterThan(20);
});

test('the canvas and camera follow a resize to phone portrait, pixel ratio capped (Review Focus 3)', async ({ page }) => {
	await page.goto('/ocean/?cam=deck');
	await ready(page);
	await page.setViewportSize({ width: 390, height: 844 });
	await page.waitForFunction(() => document.getElementById('ocean').width === 390 * Math.min(window.devicePixelRatio, 2));
	const aspect = await page.evaluate(() => window.__ocean.camera.aspect);
	expect(aspect).toBeCloseTo(390 / 844, 3);
});

test('stats=1 shows the live numbers', async ({ page }) => {
	await page.goto('/ocean/?stats=1&cam=deck');
	await ready(page);
	await expect(page.locator('#stats')).toBeVisible();
	await expect(page.locator('#stats')).toContainText('fps');
	await expect(page.locator('#stats')).toContainText('workers');
});

test('the camera shots place the camera where the Studio captures stand', async ({ page }) => {
	await page.goto('/ocean/?cam=high&focus=origin');
	await ready(page);
	const position = await page.evaluate(() => window.__ocean.camera.position.toArray());
	[0, 110, 150].forEach((value, i) => expect(position[i]).toBeCloseTo(value, 6));
});
