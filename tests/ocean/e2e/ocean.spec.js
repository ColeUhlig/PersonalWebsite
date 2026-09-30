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

// The canvas's lower half (all below the horizon in the deck shot) as 64x18 luminances, read in a
// frame callback like canvasVariance.
async function lowerHalf(page) {
	return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const copy = document.createElement('canvas');
		copy.width = 64;
		copy.height = 18;
		const context = copy.getContext('2d');
		context.drawImage(source, 0, source.height / 2, source.width, source.height / 2, 0, 0, 64, 18);
		const data = context.getImageData(0, 0, 64, 18).data;
		const luminances = [];
		for (let i = 0; i < data.length; i += 4) {
			luminances.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
		}
		resolve(luminances);
	})));
}

// Mean absolute luminance change of the lower half over `frames` frames with the clock running.
// The sky and lights are static, so only the vertices written each frame can move these pixels:
// this is what proves the per-frame upload reaches the screen (a sky-only canvas passes the
// variance check on its own).
// Measured under SwiftShader on 2026-09-29: 24 to 47 with the ocean, 0.00 with the ocean's group
// left out of the scene and 0.00 with the position upload skipped.
const MOTION_THRESHOLD = 5;

async function lowerHalfMotion(page, frames = 30) {
	const before = await lowerHalf(page);
	const start = await page.evaluate(() => window.__ocean.status().frame);
	await page.waitForFunction((target) => window.__ocean.status().frame >= target, start + frames);
	const after = await lowerHalf(page);
	let sum = 0;
	for (let i = 0; i < before.length; i++) sum += Math.abs(after[i] - before[i]);
	return sum / before.length;
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
	expect(await lowerHalfMotion(page)).toBeGreaterThan(MOTION_THRESHOLD);
	expect(errors).toEqual([]);
});

test('workers off still renders on the main thread (Review Focus 1)', async ({ page }) => {
	await page.goto('/ocean/?workers=0&cam=deck');
	await ready(page);
	const status = await page.evaluate(() => window.__ocean.status());
	expect(status.mode).toBe('main-thread');
	expect(await canvasVariance(page)).toBeGreaterThan(20);
	expect(await lowerHalfMotion(page)).toBeGreaterThan(MOTION_THRESHOLD);
});

test.describe('on a device pixel ratio 3 screen', () => {
	// A smaller landscape start than the default 1366x767: at a capped ratio of 2 SwiftShader draws
	// a quarter of the pixels, which keeps the test well inside its timeout.
	test.use({ deviceScaleFactor: 3, viewport: { width: 640, height: 360 } });

	test('the canvas and camera follow a resize to phone portrait, pixel ratio capped (Review Focus 3)', async ({ page }) => {
		await page.goto('/ocean/?cam=deck');
		await ready(page);
		expect(await page.evaluate(() => window.devicePixelRatio)).toBe(3);
		await page.setViewportSize({ width: 390, height: 844 });
		// resize() sets the camera aspect and the canvas size together: wait for it to have run.
		// Piece C: below 900 px the ocean is the top half of the screen (50svh = 422 of 844).
		await page.waitForFunction(() => Math.abs(window.__ocean.camera.aspect - 390 / 422) < 1e-3);
		const size = await page.evaluate(() => {
			const canvas = document.getElementById('ocean');
			return [canvas.width, canvas.height];
		});
		expect(size).toEqual([390 * 2, 422 * 2]);
	});
});

test('stats=1 shows the live numbers', async ({ page }) => {
	await page.goto('/ocean/?stats=1&cam=deck');
	await ready(page);
	await expect(page.locator('#stats')).toBeVisible();
	await expect(page.locator('#stats')).toContainText('fps');
	await expect(page.locator('#stats')).toContainText('workers');
	// The report lines appear once the first 300-frame window closes; slow under SwiftShader.
	test.setTimeout(240_000);
	await page.waitForFunction(() => window.__ocean.report() !== null, null, { timeout: 200_000 });
	await expect(page.locator('#stats')).toContainText('render');
	await expect(page.locator('#stats')).toContainText('copy');
	const renderMs = await page.evaluate(() => window.__ocean.report().renderMs);
	expect(Number.isFinite(renderMs) && renderMs > 0).toBe(true);
});

test('the camera shots place the camera where the Studio captures stand', async ({ page }) => {
	await page.goto('/ocean/?cam=high&focus=origin');
	await ready(page);
	const position = await page.evaluate(() => window.__ocean.camera.position.toArray());
	[0, 110, 150].forEach((value, i) => expect(position[i]).toBeCloseTo(value, 6));
});
