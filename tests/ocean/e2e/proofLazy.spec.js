import { test, expect } from '@playwright/test';

// Requests for the panel's own modules and for the WebAssembly runtime.
function watchLoads(page) {
	const loads = { panel: 0, runtime: 0 };
	page.on('request', (request) => {
		const url = request.url();
		if (url.endsWith('/js/ui/proofPanel.js')) loads.panel++;
		if (url.includes('luau-web@')) loads.runtime++;
	});
	return loads;
}

test('nothing of the panel loads until the visitor scrolls near it', async ({ page }) => {
	const loads = watchLoads(page);
	await page.goto('/ocean/proof.html');
	await expect(page.locator('.proof-placeholder')).toHaveAttribute('data-proof-state', 'waiting');
	await page.waitForTimeout(500);
	expect(loads.panel).toBe(0);
	await page.locator('#proof').scrollIntoViewIfNeeded();
	await expect(page.locator('.proof')).toBeVisible();
	await expect(page.locator('[data-proof="source"]')).toContainText('function Cascade.new');
	expect(loads.panel).toBe(1);
	expect(loads.runtime).toBe(0);
});

test('the placeholder button mounts the panel, and only Run loads the runtime', async ({ page }) => {
	const loads = watchLoads(page);
	await page.goto('/ocean/proof.html');
	await page.locator('[data-proof="show"]').click();
	await expect(page.locator('.proof')).toBeVisible();
	expect(loads.runtime).toBe(0);
	await page.locator('[data-proof="run"]').click();
	await expect(page.locator('.proof')).toHaveAttribute('data-proof-state', 'done', { timeout: 60_000 });
	expect(loads.runtime).toBeGreaterThan(0);
});

test('a panel module that fails to load leaves a message and throws nothing', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.route('**/js/ui/proofPanel.js', (route) => route.abort());
	await page.goto('/ocean/proof.html');
	await page.locator('[data-proof="show"]').click();
	await expect(page.locator('.proof-placeholder')).toHaveAttribute('data-proof-state', 'failed');
	await expect(page.locator('.proof-placeholder p')).toContainText('could not be loaded');
	await expect(page.locator('.proof-placeholder p')).toContainText('Reload the page');
	await expect(page.locator('[data-proof="show"]')).toBeHidden();
	expect(errors).toEqual([]);
});
