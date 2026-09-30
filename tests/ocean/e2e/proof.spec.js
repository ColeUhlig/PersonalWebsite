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
	await expect(page.locator('[data-proof="status"]')).toHaveText(/^Done: (identical, bit for bit|within float32 rounding)\./);
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
	await expect(page.locator('[data-proof="status"]')).toHaveText(/^Done: (identical, bit for bit|within float32 rounding)\.$/);
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

// Mounts a fresh panel in #proof in place of the page's, with the given deps built in the page.
// `makeDeps` runs in the browser and receives the imported modules.
async function remount(page, makeDeps) {
	await page.evaluate(async (source) => {
		const { mountProofPanel } = await import('/ocean/js/ui/proofPanel.js');
		const { createLuauClient } = await import('/ocean/js/proof/luauClient.js');
		const { runCascadeTwin } = await import('/ocean/js/proof/twinRunner.js');
		const makeDeps = new Function('modules', `return (${source})(modules);`);
		window.__proof.destroy();
		window.__proof = mountProofPanel(document.getElementById('proof'), makeDeps({ createLuauClient, runCascadeTwin }));
	}, makeDeps.toString());
}

// A real worker client whose second run fails as a crashed runtime would; the others are real.
function crashSecondRun({ createLuauClient }) {
	let calls = 0;
	return {
		createClient: () => {
			const real = createLuauClient({ spawn: () => new Worker('/ocean/js/workers/luau.worker.js', { type: 'module' }) });
			return {
				runCascade: (options) => {
					calls++;
					if (calls === 2) {
						return Promise.reject(Object.assign(new Error('injected crash'), { stage: 'crash' }));
					}
					return real.runCascade(options);
				},
				dispose: () => real.dispose(),
			};
		},
	};
}

// Review fix 1: a failed Run must not leave the last good Luau map and a black difference beside
// "Not compared"; the JavaScript result is shown alone, as the status says.
test('a failed Run after a good one blanks the Luau and difference maps, and the next Run says the runtime is reloading', async ({ page }) => {
	const errors = watchErrors(page);
	await openPanel(page);
	await remount(page, crashSecondRun);
	const proof = page.locator('.proof');
	await page.evaluate(() => window.__proof.run());
	await expect(proof).toHaveAttribute('data-proof-state', 'done');
	expect(await drawn(page, 'luau-map')).toBe(true);
	await page.evaluate(() => window.__proof.run());
	await expect(proof).toHaveAttribute('data-proof-state', 'failed');
	expect(await drawn(page, 'luau-map')).toBe(false);
	expect(await drawn(page, 'diff-map')).toBe(false);
	expect(await drawn(page, 'js-map')).toBe(true);
	await expect(page.locator('[data-proof="verdict"]')).toHaveText('Not compared');
	await expect(page.locator('[data-map="luau-map"]')).toContainText('Not run');
	await expect(page.locator('[data-map="diff-map"]')).toContainText('Not compared');
	await expect(page.locator('[data-proof="status"]')).toContainText('(injected crash)');
	const status = await page.evaluate(() => {
		window.__third = window.__proof.run();
		return document.querySelector('[data-proof="status"]').textContent;
	});
	expect(status).toContain('Reloading the Luau runtime');
	await page.evaluate(() => window.__third);
	await expect(proof).toHaveAttribute('data-proof-state', 'done');
	expect(await drawn(page, 'luau-map')).toBe(true);
	expect(errors).toEqual([]);
});

// Review fix 2: Run stays focusable while it runs (aria-disabled, not disabled).
test('Run keeps keyboard focus while it runs and after', async ({ page }) => {
	await page.context().route(RUNTIME, async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 1500));
		await route.continue();
	});
	await openPanel(page);
	const run = page.locator('[data-proof="run"]');
	await run.focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('.proof')).toHaveAttribute('data-proof-state', 'running');
	await expect(run).toHaveAttribute('aria-disabled', 'true');
	await expect(run).toBeFocused();
	await expect(page.locator('.proof')).toHaveAttribute('data-proof-state', 'done', { timeout: 60_000 });
	await expect(run).not.toHaveAttribute('aria-disabled', 'true');
	await expect(run).toBeFocused();
});

// Review fix 6: the largest difference names its field, in studs only for the three lengths.
test('the largest difference names its field, and only lengths are in studs', async ({ page }) => {
	await openPanel(page);
	// The JavaScript result with one value moved by one float32 step in field window.__nudge
	// (0-based, FIELD_NAMES order).
	await remount(page, ({ runCascadeTwin }) => ({
		runTwin: (options) => {
			const result = runCascadeTwin(options);
			const bits = new Uint32Array(result.packed.buffer);
			bits[window.__nudge * options.n * options.n + 5] += 1;
			return result;
		},
	}));
	const largest = page.locator('[data-proof="largest"]');
	const cases = [
		[1, /^\d\.\d\de-\d+ studs in dispX$/],
		[3, /^\d\.\d\de-\d+ in slopeX$/],
		[0, /^\d\.\d\de-\d+ studs in height$/],
	];
	for (const [field, text] of cases) {
		await page.evaluate(async (nudge) => {
			window.__nudge = nudge;
			await window.__proof.run();
		}, field);
		await expect(page.locator('.proof')).toHaveAttribute('data-proof-state', 'done');
		await expect(largest).toHaveText(text);
		await expect(page.locator('[data-proof="verdict"]')).toHaveText('Within float32 rounding');
		await expect(page.locator('[data-proof="differing"]')).toContainText('1 of 32,768');
	}
	// Only the last case moved a height, so only it lights the height difference.
	expect(await drawn(page, 'diff-map')).toBe(true);
	await expect(page.locator('[data-map="diff-map"] figcaption')).toContainText('Height difference');
});

// Review fix 9: destroy() mid-run ends quietly, stops the worker, and run() afterwards does nothing.
test('destroying the panel mid-run throws nothing, leaves no worker, and a later Run does nothing', async ({ page }) => {
	const errors = watchErrors(page);
	const workers = [];
	page.on('worker', (worker) => workers.push(worker));
	await page.context().route(RUNTIME, async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 1500));
		await route.continue();
	});
	await openPanel(page);
	await page.evaluate(() => {
		window.__running = window.__proof.run();
	});
	await expect.poll(() => workers.length).toBe(1);
	const state = await page.evaluate(async () => {
		const before = window.__proof.element.dataset.proofState;
		window.__proof.destroy();
		await window.__running;
		await window.__proof.run();
		return before;
	});
	expect(state).toBe('running');
	await expect(page.locator('.proof')).toHaveCount(0);
	await expect.poll(() => page.workers().length).toBe(0);
	await page.waitForTimeout(500);
	expect(workers.length).toBe(1);
	expect(errors).toEqual([]);
});
