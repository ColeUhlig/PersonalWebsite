// The C2 contract in the browser (piece C2, Task 0): the dev route takes ids, the graph's band clips
// the surface, the orbit is held on the graph, the hooks and slots exist, and the opening is A2's.
import { test, expect } from '@playwright/test';
import { STEP_COUNT, idOf, stepOf } from '../../../content/ocean/js/stages/steps.js';
import { load, stage, story, watchErrors, waitFrames } from './helpers/stage.js';
import { oceanRunning, scrollToId, scrollToOpening } from './helpers/story.js';

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

test('the dev route takes a step id and the graph steps clip the surface to their band', async ({ page }) => {
	await load(page, 'step=sum-of-sines&freeze=12', 10);
	expect((await stage(page, 'state')).step).toBe(stepOf('sum-of-sines'));
	const graph = await stage(page, 'graph');
	expect(graph.band).toEqual([-0.5, 0.5]);
	expect((await stage(page, 'look')).clipped).toBe(true);
	await load(page, 'step=directions&freeze=12', 10);
	expect((await stage(page, 'graph')).band).toBe(null);
	expect((await stage(page, 'look')).clipped).toBe(false);
	expect((await stage(page, 'overlays')).kind).toBe('directions');
});

test('every step loads through the dev route by id without an error', async ({ page }) => {
	test.setTimeout(600_000);
	for (let n = 1; n <= STEP_COUNT; n++) {
		await load(page, `step=${idOf(n)}&freeze=12`, 8);
		expect((await stage(page, 'state')).step).toBe(n);
	}
});

test('the story holds the orbit on the graph and lets it go on the surface; the opening is untouched', async ({ page }) => {
	test.setTimeout(240_000);
	await oceanRunning(page);
	expect((await story(page, 'look')).mode).toBe('painted');
	expect((await story(page, 'look')).clipped).toBe(false);
	await scrollToId(page, 'sine', 0.2);
	await waitFrames(page, 10);
	expect(await story(page, 'orbitEnabled')).toBe(false);
	expect((await story(page, 'graph')).band).toEqual([-0.5, 0.5]);
	await scrollToId(page, 'many-waves', 0.2);
	await waitFrames(page, 10);
	expect(await story(page, 'orbitEnabled')).toBe(true);
	expect((await story(page, 'graph')).band).toBe(null);
	await scrollToOpening(page);
	await waitFrames(page, 10);
	expect((await story(page, 'look')).clipped).toBe(false);
});

test('the page features are mounted on their slots', async ({ page }) => {
	await oceanRunning(page);
	await expect(page.locator('#mathbox')).toHaveCount(1);
	expect(await page.evaluate(() => typeof window.__mathbox?.shown)).toBe('function');
	await page.waitForFunction(() => window.__insets && window.__frequency && window.__overlayReadout, null, { timeout: 60_000 });
	await expect(page.locator('section[data-step-id]')).toHaveCount(STEP_COUNT);
});
