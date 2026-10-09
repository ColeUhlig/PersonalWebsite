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
	// Give a stray runtime request time to show before saying there was none.
	await page.waitForTimeout(500);
	expect(loads.runtime).toBe(0);
});

test('the placeholder button mounts the panel, and only Run loads the runtime', async ({ page }) => {
	const loads = watchLoads(page);
	await page.goto('/ocean/proof.html');
	await page.locator('[data-proof="show"]').click();
	await expect(page.locator('.proof')).toBeVisible();
	await page.waitForTimeout(500);
	expect(loads.runtime).toBe(0);
	await page.locator('[data-proof="run"]').click();
	await expect(page.locator('.proof')).toHaveAttribute('data-proof-state', 'done', { timeout: 60_000 });
	expect(loads.runtime).toBeGreaterThan(0);
});

test('a panel module that fails to load leaves a short message, logs the detail and throws nothing', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const logged = [];
	page.on('console', (message) => {
		if (message.type() === 'error') logged.push(message.text());
	});
	await page.route('**/js/ui/proofPanel.js', (route) => route.abort());
	await page.goto('/ocean/proof.html');
	await page.locator('[data-proof="show"]').click();
	await expect(page.locator('.proof-placeholder')).toHaveAttribute('data-proof-state', 'failed');
	await expect(page.locator('.proof-placeholder p')).toHaveText('The verification panel could not be loaded. Reload the page to try again.');
	await expect(page.locator('[data-proof="show"]')).toBeHidden();
	await expect.poll(() => logged.some((text) => text.includes('proof panel'))).toBe(true);
	expect(errors).toEqual([]);
});

test('the placeholder speaks in the first person', async ({ page }) => {
	await page.goto('/ocean/proof.html');
	await expect(page.locator('.proof-placeholder p')).toHaveText("The Roblox game's Luau code, executed in this browser and checked against this page's JavaScript port.");
});

// The page's panel spot sits below a 300vh spacer; the observer's margin is 600 px.
test('the panel loads inside 600 px of the viewport and not before', async ({ page }) => {
	const loads = watchLoads(page);
	await page.goto('/ocean/proof.html');
	const { top, height } = await page.evaluate(() => ({
		top: document.getElementById('proof').getBoundingClientRect().top + window.scrollY,
		height: window.innerHeight,
	}));
	await page.evaluate((y) => window.scrollTo(0, y), top - height - 650);
	await page.waitForTimeout(700);
	expect(loads.panel).toBe(0);
	await expect(page.locator('.proof-placeholder')).toHaveAttribute('data-proof-state', 'waiting');
	await page.evaluate((y) => window.scrollTo(0, y), top - height - 550);
	await expect.poll(() => loads.panel).toBe(1);
	await expect(page.locator('.proof')).toBeAttached();
});

test('two mountNow calls at once mount one panel', async ({ page }) => {
	const loads = watchLoads(page);
	await page.goto('/ocean/proof.html');
	const same = await page.evaluate(async () => {
		const [a, b] = await Promise.all([window.__proof.mountNow(), window.__proof.mountNow()]);
		return a !== null && a === b;
	});
	expect(same).toBe(true);
	await expect(page.locator('.proof')).toHaveCount(1);
	expect(loads.panel).toBe(1);
});

// Runs mountProofPanelWhenNear on a fresh element in the page, with no observer unless given.
// `scenario` runs in the browser with the module, the new root and a helper that imports the
// real panel module; it returns what the test checks.
async function inPage(page, scenario) {
	return page.evaluate(async (source) => {
		const lazy = await import('/ocean/js/ui/proofLazy.js');
		const root = document.createElement('div');
		document.body.append(root);
		const realPanel = () => import('/ocean/js/ui/proofPanel.js');
		const run = new Function('lazy', 'root', 'realPanel', `return (${source})(lazy, root, realPanel);`);
		return run(lazy, root, realPanel);
	}, scenario.toString());
}

test('destroy while the panel module loads mounts nothing', async ({ page }) => {
	await page.goto('/ocean/proof.html');
	const result = await inPage(page, async ({ mountProofPanelWhenNear }, root, realPanel) => {
		let finishImport;
		const handle = mountProofPanelWhenNear(root, { Observer: null, importPanel: () => new Promise((resolve) => { finishImport = resolve; }) });
		const mounting = handle.mountNow();
		handle.destroy();
		finishImport(await realPanel());
		const panel = await mounting;
		return { panel, children: root.children.length, panels: root.querySelectorAll('.proof').length };
	});
	expect(result).toEqual({ panel: null, children: 0, panels: 0 });
});

test('mountNow after destroy mounts nothing and imports nothing', async ({ page }) => {
	await page.goto('/ocean/proof.html');
	const result = await inPage(page, async ({ mountProofPanelWhenNear }, root, realPanel) => {
		let imports = 0;
		const handle = mountProofPanelWhenNear(root, { Observer: null, importPanel: () => { imports++; return realPanel(); } });
		handle.destroy();
		const panel = await handle.mountNow();
		return { panel, imports, children: root.children.length };
	});
	expect(result).toEqual({ panel: null, imports: 0, children: 0 });
});

test('an intersection already queued when destroy runs mounts nothing', async ({ page }) => {
	await page.goto('/ocean/proof.html');
	const result = await inPage(page, async ({ mountProofPanelWhenNear }, root, realPanel) => {
		let deliver;
		let imports = 0;
		class Observer {
			constructor(callback) {
				deliver = callback;
			}
			observe() {}
			disconnect() {}
		}
		const handle = mountProofPanelWhenNear(root, { Observer, importPanel: () => { imports++; return realPanel(); } });
		handle.destroy();
		deliver([{ isIntersecting: true }]);
		await new Promise((resolve) => setTimeout(resolve, 300));
		return { imports, children: root.children.length };
	});
	expect(result).toEqual({ imports: 0, children: 0 });
});

test('a panel that throws while mounting says so apart from a failed import, and logs the detail', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	const logged = [];
	page.on('console', (message) => {
		if (message.type() === 'error') logged.push(message.text());
	});
	await page.goto('/ocean/proof.html');
	const result = await inPage(page, async ({ mountProofPanelWhenNear }, root) => {
		const handle = mountProofPanelWhenNear(root, {
			Observer: null,
			importPanel: async () => ({ mountProofPanel: () => { throw new Error('injected mount failure'); } }),
		});
		const panel = await handle.mountNow();
		const placeholder = root.querySelector('.proof-placeholder');
		return {
			panel,
			state: placeholder?.dataset.proofState,
			text: placeholder?.querySelector('p').textContent,
			buttonHidden: placeholder?.querySelector('[data-proof="show"]').hidden,
		};
	});
	expect(result).toEqual({ panel: null, state: 'failed', text: 'The verification panel could not be started. Reload the page to try again.', buttonHidden: true });
	await expect.poll(() => logged.some((text) => text.includes('injected mount failure') || text.includes('failed to start'))).toBe(true);
	expect(errors).toEqual([]);
});

test('panelDeps reach the panel: embedded, the placeholder and the panel bring no glass', async ({ page }) => {
	await page.goto('/ocean/proof.html');
	const result = await inPage(page, async ({ mountProofPanelWhenNear }, root) => {
		const handle = mountProofPanelWhenNear(root, { Observer: null, panelDeps: { embedded: true } });
		const placeholder = root.querySelector('.proof-placeholder');
		const placeholderGlass = getComputedStyle(placeholder).backgroundColor;
		const placeholderEmbedded = placeholder.classList.contains('proof-placeholder--embedded');
		await handle.mountNow();
		const panel = root.querySelector('.proof');
		return {
			placeholderEmbedded,
			placeholderGlass,
			panelEmbedded: panel.classList.contains('proof--embedded'),
			title: panel.querySelectorAll('.proof-title').length,
			panelGlass: getComputedStyle(panel).backgroundColor,
		};
	});
	expect(result).toEqual({ placeholderEmbedded: true, placeholderGlass: 'rgba(0, 0, 0, 0)', panelEmbedded: true, title: 0, panelGlass: 'rgba(0, 0, 0, 0)' });
});
