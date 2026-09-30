// A throwing page feature stays that feature's problem (piece C). The page's ui/page.js is served
// with two extra features spliced in: one that throws first, and one at the end that records what
// reached it. The ocean must still run (or, with three blocked, still say why it doesn't), no
// "needs WebGL 2" notice may appear for a feature's fault, and the features after the throwing one
// must still be told. The same goes for the scroll story's listeners.
import { test, expect } from '@playwright/test';
import { scrollToStep, waitFrames } from './helpers/story.js';

const THROWING = `features.push({
		attachOcean() { throw new Error('injected feature fault (attach)'); },
		oceanUnavailable() { throw new Error('injected feature fault (unavailable)'); },
	});
`;
const RECORDING = `	features.push({
		attachOcean(handle) { window.__recorded = { attached: Boolean(handle) }; },
		oceanUnavailable(reason) { window.__recorded = { unavailable: reason }; },
	});
`;

async function spliceFeatures(page) {
	await page.route('**/ocean/js/ui/page.js', async (route) => {
		const response = await route.fetch();
		const source = await response.text();
		const first = 'const features = [];\n';
		const last = '\t// Features end.';
		if (!source.includes(first) || !source.includes(last)) {
			throw new Error('ui/page.js lost the lines this test splices at');
		}
		const body = source.replace(first, `${first}\t${THROWING}`).replace(last, `${RECORDING}${last}`);
		await route.fulfill({ response, body });
	});
}

function watch(page) {
	const pageErrors = [];
	const consoleErrors = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});
	return { pageErrors, consoleErrors };
}

test('a feature that throws on attach leaves the ocean running and the other features attached', async ({ page }) => {
	const { pageErrors, consoleErrors } = watch(page);
	await spliceFeatures(page);
	await page.goto('/ocean/');
	await page.waitForFunction(() => (window.__ocean?.status().frame ?? 0) > 5, null, { timeout: 90_000 });
	await waitFrames(page, 5);
	await expect(page.locator('body')).toHaveAttribute('data-ocean', 'running');
	await expect(page.locator('#notice')).toBeHidden();
	await expect(page.locator('body')).not.toContainText('WebGL 2');
	expect(await page.evaluate(() => window.__recorded)).toEqual({ attached: true });
	expect(await page.evaluate(() => window.__page.reading().phase)).toBe('opening');
	expect(consoleErrors.some((text) => text.includes('injected feature fault (attach)'))).toBe(true);
	expect(pageErrors).toEqual([]);
});

test('a feature that throws on unavailable leaves the notice and the other features told', async ({ page }) => {
	const { pageErrors, consoleErrors } = watch(page);
	await spliceFeatures(page);
	await page.route('**/npm/three@0.186.1/**', (route) => route.abort());
	await page.goto('/ocean/');
	await expect(page.locator('#notice')).toBeVisible();
	await expect(page.locator('#notice')).toContainText('cdn.jsdelivr.net');
	await expect(page.locator('body')).toHaveAttribute('data-ocean-reason', 'load');
	await page.waitForFunction(() => window.__recorded !== undefined, null, { timeout: 30_000 });
	expect(await page.evaluate(() => window.__recorded)).toEqual({ unavailable: 'load' });
	expect(consoleErrors.some((text) => text.includes('injected feature fault (unavailable)'))).toBe(true);
	expect(pageErrors).toEqual([]);
});

test('a scroll story listener that throws is logged once, and the others still hear every reading', async ({ page }) => {
	const { pageErrors, consoleErrors } = watch(page);
	await page.route('**/ocean/js/ui/page.js', async (route) => {
		const response = await route.fetch();
		const source = await response.text();
		const anchor = '\t// Features end.';
		if (!source.includes(anchor)) {
			throw new Error('ui/page.js lost the line this test splices at');
		}
		const listeners = `\tstory.onChange(() => { throw new Error('injected listener fault'); });
	story.onChange((reading) => { window.__heard = reading; });
`;
		await route.fulfill({ response, body: source.replace(anchor, `${listeners}${anchor}`) });
	});
	await page.goto('/ocean/');
	await page.waitForFunction(() => window.__page.scrollEngine() === 'gsap', null, { timeout: 30_000 });
	await scrollToStep(page, 5, 0.5);
	await page.waitForFunction(() => window.__heard?.step === 5, null, { timeout: 30_000 });
	await scrollToStep(page, 8, 0.5);
	await page.waitForFunction(() => window.__heard?.step === 8, null, { timeout: 30_000 });
	expect(await page.evaluate(() => window.__page.scrollEngine())).toBe('gsap');
	expect(consoleErrors.filter((text) => text.includes('scroll story listener failed')).length).toBe(1);
	expect(pageErrors).toEqual([]);
});
