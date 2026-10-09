import { test, expect } from '@playwright/test';

test('the page loads without errors and hides the notice when WebGL exists', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto('/ocean/');
	await expect(page.locator('#ocean')).toBeVisible();
	await expect(page.locator('#notice')).toBeHidden();
	expect(errors).toEqual([]);
});

test('without WebGL the page shows a notice and throws nothing (Review Focus 4)', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
			return kind === 'webgl' || kind === 'webgl2' ? null : original.call(this, kind, ...rest);
		};
	});
	await page.goto('/ocean/');
	await expect(page.locator('#notice')).toBeVisible();
	await expect(page.locator('#notice')).toContainText('WebGL');
	expect(errors).toEqual([]);
});

test('with WebGL 1 but no WebGL 2 the page shows the notice and throws nothing (Review Focus 4)', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
			return kind === 'webgl2' ? null : original.call(this, kind, ...rest);
		};
	});
	await page.goto('/ocean/');
	await expect(page.locator('#notice')).toBeVisible();
	await expect(page.locator('#notice')).toContainText('WebGL');
	expect(errors).toEqual([]);
});

test('when the renderer cannot get the context the probe got, the page shows the notice and throws nothing', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		let webgl2Calls = 0;
		HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
			if (kind === 'webgl2' && ++webgl2Calls > 1) return null;
			return original.call(this, kind, ...rest);
		};
	});
	await page.goto('/ocean/');
	await expect(page.locator('#notice')).toBeVisible();
	await expect(page.locator('#notice')).toContainText('WebGL');
	expect(errors).toEqual([]);
});
