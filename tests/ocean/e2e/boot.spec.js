import { test, expect } from '@playwright/test';

function watch(page) {
	const errors = [];
	const consoleErrors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});
	return { errors, consoleErrors };
}

async function running(page, url = '/ocean/?cam=deck') {
	await page.goto(url);
	await page.waitForFunction(() => (window.__ocean?.status().frame ?? 0) > 5, null, { timeout: 90_000 });
}

test('three blocked at the CDN: a notice names it, the page stays, nothing throws (Review Focus 3)', async ({ page }) => {
	const { errors } = watch(page);
	await page.route('**/npm/three@0.186.1/**', (route) => route.abort());
	await page.goto('/ocean/');
	await expect(page.locator('#notice')).toBeVisible();
	await expect(page.locator('#notice')).toContainText('cdn.jsdelivr.net');
	await expect(page.locator('body')).toHaveAttribute('data-ocean', 'unavailable');
	await expect(page.locator('body')).toHaveAttribute('data-ocean-reason', 'load');
	expect(errors).toEqual([]);
});

test('an exception inside a frame is logged once and the loop keeps going', async ({ page }) => {
	const { errors, consoleErrors } = watch(page);
	await running(page);
	await page.evaluate(() => window.__ocean.injectFrameErrors(3));
	await page.waitForFunction(() => window.__ocean.frameFailures() === 3, null, { timeout: 60_000 });
	const frame = await page.evaluate(() => window.__ocean.status().frame);
	await page.waitForFunction((f) => window.__ocean.status().frame > f + 5, frame, { timeout: 60_000 });
	expect(consoleErrors.filter((text) => text.includes('frame failed')).length).toBe(1);
	await expect(page.locator('#notice')).toBeHidden();
	expect(errors).toEqual([]);
});

test('exceptions in frame after frame raise the notice, and the loop still runs', async ({ page }) => {
	test.setTimeout(180_000);
	const { errors } = watch(page);
	await running(page);
	await page.evaluate(() => window.__ocean.injectFrameErrors(40));
	await expect(page.locator('#notice')).toBeVisible({ timeout: 120_000 });
	await expect(page.locator('#notice')).toContainText('hit an error');
	await page.waitForFunction(() => window.__ocean.frameFailures() === 40, null, { timeout: 120_000 });
	const frame = await page.evaluate(() => window.__ocean.status().frame);
	await page.waitForFunction((f) => window.__ocean.status().frame > f + 3, frame, { timeout: 60_000 });
	expect(errors).toEqual([]);
});

test('a change of device pixel ratio resizes the renderer', async ({ page }) => {
	await running(page);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 767, deviceScaleFactor: 1.5, mobile: false });
	await page.waitForFunction(() => {
		const canvas = document.getElementById('ocean');
		return canvas.width === Math.floor(canvas.clientWidth * 1.5);
	}, null, { timeout: 30_000 });
});

test('story mode opens on the deck camera when the URL names none', async ({ page }) => {
	await running(page, '/ocean/');
	const position = await page.evaluate(() => window.__ocean.camera.position.toArray());
	[0, 14, 40].forEach((value, i) => expect(position[i]).toBeCloseTo(value, 3));
});
