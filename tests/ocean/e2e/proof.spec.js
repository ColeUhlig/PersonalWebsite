import { test, expect } from '@playwright/test';

const RUNTIME = 'https://cdn.jsdelivr.net/npm/luau-web@1.4.0/**';

// Uncaught errors and console errors, collected for the whole test.
function watchErrors(page) {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	return errors;
}

// The dev page may mount the panel lazily (proofLazy.js); scrolling to it mounts it either way.
async function openPanel(page) {
	await page.goto('/ocean/proof.html');
	await page.locator('#proof').scrollIntoViewIfNeeded();
	await expect(page.locator('.proof')).toBeVisible();
}

// Whether a canvas has any lit pixel.
function drawn(page, name) {
	return page.locator(`[data-proof="${name}"]`).evaluate((canvas) => {
		const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
		let lit = 0;
		for (let i = 0; i < data.length; i += 4) lit += data[i] + data[i + 1] + data[i + 2];
		return lit > 0;
	});
}

test('Run shows both height maps, the difference, the verdict and both timings', async ({ page }) => {
	const errors = watchErrors(page);
	await openPanel(page);
	await expect(page.locator('[data-proof="source"]')).toContainText('function Cascade.new');
	await page.locator('[data-proof="run"]').click();
	await expect(page.locator('.proof')).toHaveAttribute('data-proof-state', 'done', { timeout: 60_000 });
	await expect(page.locator('[data-proof="verdict"]')).toHaveText(/^(Identical, bit for bit|Within float32 rounding)$/);
	await expect(page.locator('[data-proof="differing"]')).toContainText('of 32,768');
	await expect(page.locator('[data-proof="luau-ms"]')).toHaveText(/^\d+\.\d ms$/);
	await expect(page.locator('[data-proof="js-ms"]')).toHaveText(/^\d+\.\d ms$/);
	await expect(page.locator('[data-proof="status"]')).toContainText('Done');
	expect(await drawn(page, 'luau-map')).toBe(true);
	expect(await drawn(page, 'js-map')).toBe(true);
	expect(errors).toEqual([]);
});

test('the source pane shows the module chosen', async ({ page }) => {
	await openPanel(page);
	await expect(page.locator('[data-proof="origin"]')).toHaveText('src/shared/Ocean/Cascade.luau');
	await page.locator('[data-proof="module"]').selectOption('FFT');
	await expect(page.locator('[data-proof="origin"]')).toHaveText('src/shared/Ocean/FFT.luau');
	await expect(page.locator('[data-proof="source"]')).toContainText('function FFT.plan');
	await page.locator('[data-proof="module"]').selectOption('Prelude');
	await expect(page.locator('[data-proof="source"]')).toContainText('local function mul32');
});

// Review Focus 2: pressing Run again reuses the worker and its loaded runtime.
test('a second Run reuses the worker and does not load the runtime again', async ({ page }) => {
	const workers = [];
	page.on('worker', (worker) => workers.push(worker));
	await openPanel(page);
	const run = page.locator('[data-proof="run"]');
	await run.click();
	await expect(page.locator('.proof')).toHaveAttribute('data-proof-state', 'done', { timeout: 60_000 });
	await run.click();
	await expect(page.locator('.proof')).toHaveAttribute('data-proof-state', 'done', { timeout: 60_000 });
	await expect(page.locator('[data-proof="status"]')).toHaveText('Done.');
	expect(workers.length).toBe(1);
});

// Review Focus 1: the runtime cannot be fetched (offline, blocked CDN).
test('a runtime that cannot load gives a clear message, keeps the JavaScript result and throws nothing', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.context().route(RUNTIME, (route) => route.abort());
	await openPanel(page);
	await page.locator('[data-proof="run"]').click();
	await expect(page.locator('.proof')).toHaveAttribute('data-proof-state', 'failed', { timeout: 60_000 });
	await expect(page.locator('[data-proof="status"]')).toContainText('could not be loaded');
	await expect(page.locator('[data-proof="verdict"]')).toContainText('Not compared');
	expect(await drawn(page, 'js-map')).toBe(true);
	await expect(page.locator('[data-proof="run"]')).toBeEnabled();
	expect(errors).toEqual([]);
});

// Review Focus 3: no Web Workers.
test('without Web Workers the panel says so and throws nothing', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(() => {
		delete window.Worker;
	});
	await openPanel(page);
	await page.locator('[data-proof="run"]').click();
	await expect(page.locator('.proof')).toHaveAttribute('data-proof-state', 'failed');
	await expect(page.locator('[data-proof="status"]')).toContainText('Web Worker');
	expect(errors).toEqual([]);
});

test('at phone width the page does not scroll sideways', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 740 });
	await openPanel(page);
	await expect(page.locator('[data-proof="source"]')).toContainText('function Cascade.new');
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});
