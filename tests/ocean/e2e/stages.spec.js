import { test, expect } from '@playwright/test';

// Loads the page and waits until it has drawn `frames` frames. Returns the page errors seen.
async function load(page, query, frames = 20) {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(`/ocean/?${query}`);
	await page.waitForFunction((target) => (window.__ocean?.status().frame ?? 0) > target, frames, { timeout: 90_000 });
	return errors;
}

test("without ?step there is no stage and the page is A2's", async ({ page }) => {
	const errors = await load(page, 'cam=deck', 5);
	expect(await page.evaluate(() => window.__ocean.stage)).toBeNull();
	const status = await page.evaluate(() => window.__ocean.status());
	expect(status.source).toBe('fft');
	expect(status.parts).toEqual({ cascades: true, painter: true, glow: true, still: false });
	expect(errors).toEqual([]);
});

test("each step's look reaches the meshes: white under its grid, the lit sea, the painted sea", async ({ page }) => {
	test.setTimeout(240_000);
	for (const [step, mode, wireframe] of [[1, 'white', true], [4, 'sea-lit', false], [7, 'painted', false], [13, 'painted', false]]) {
		const errors = await load(page, `step=${step}&freeze=12`, 10);
		const look = await page.evaluate(() => window.__ocean.stage.look());
		expect(look.mode).toBe(mode);
		expect(look.wireframe).toBe(wireframe);
		expect(await page.evaluate(() => window.__ocean.stage.recipe().step)).toBe(step);
		expect(errors).toEqual([]);
	}
});

test("the camera stands where the blended recipe's shot says", async ({ page }) => {
	await load(page, 'step=5&progress=0.5&freeze=12', 5);
	const position = await page.evaluate(() => window.__ocean.camera.position.toArray());
	// Halfway between step 5's crest shot and step 6's look-down, read from the recipes themselves.
	const [five, six] = await page.evaluate(async () => {
		const { recipeFor } = await import('/ocean/js/stages/recipes.js');
		return [recipeFor(5).shot.position, recipeFor(6).shot.position];
	});
	five.forEach((value, i) => expect(position[i]).toBeCloseTo((value + six[i]) / 2, 3));
});

test('a bad route warns and falls back instead of breaking (Review Focus 3)', async ({ page }) => {
	const warnings = [];
	page.on('console', (message) => {
		if (message.type() === 'warning') warnings.push(message.text());
	});
	const errors = await load(page, 'step=99&progress=-1&s.wind=abc', 10);
	expect(await page.evaluate(() => window.__ocean.stage.recipe().step)).toBe(13);
	expect(warnings.some((w) => w.includes('step=99'))).toBe(true);
	expect(warnings.some((w) => w.includes('progress=-1'))).toBe(true);
	expect(warnings.some((w) => w.includes('s.wind'))).toBe(true);
	expect(errors).toEqual([]);
});

// Fix round 1: the look probe reads the meshes themselves, and says whether the environment
// reflections have caught up with a moved sun (they wait for it to hold still 20 frames).
test('a moved sun reaches the light, and the reflections follow once it holds still', async ({ page }) => {
	test.setTimeout(180_000);
	const errors = await load(page, 'step=4&freeze=12&s.sunAzimuth=90', 5);
	const look = await page.evaluate(() => window.__ocean.stage.look());
	expect(look.mode).toBe('sea-lit');
	[0, 0.2822, 0.9594].forEach((value, i) => expect(look.sun[i]).toBeCloseTo(value, 3));
	await page.waitForFunction(() => window.__ocean.stage.look().environment.settled, null, { timeout: 120_000 });
	const settled = await page.evaluate(() => window.__ocean.stage.look());
	settled.environment.sun.forEach((value, i) => expect(value).toBeCloseTo(settled.sun[i], 6));
	expect(errors).toEqual([]);
});

// Fix round 1: the drift turns from the moment the move becomes 'drift', not from page start, so
// the camera does not jump at the 12 -> 13 snap however long the page has been open.
test('the finale drifts on from where the snap left the camera', async ({ page }) => {
	test.setTimeout(180_000);
	const errors = await load(page, 'step=12', 5);
	// Long enough that a drift timed from page start would have swung the camera 40 studs or more.
	await page.waitForTimeout(12_000);
	const position = async () => page.evaluate(() => window.__ocean.camera.position.toArray());
	const frames = (n) => page.evaluate((count) => new Promise((resolve) => {
		const start = window.__ocean.status().frame;
		const tick = () => (window.__ocean.status().frame >= start + count ? resolve() : requestAnimationFrame(tick));
		tick();
	}), n);
	await page.evaluate(() => window.__ocean.stage.set(12, 0.45));
	await frames(2);
	const before = await position();
	await page.evaluate(() => window.__ocean.stage.set(12, 0.55));
	await frames(2);
	const after = await position();
	// 0.1 of the way from step 12's shot to step 13's is about 5 studs; a jump would be tens.
	expect(Math.hypot(...after.map((v, i) => v - before[i]))).toBeLessThan(10);
	await page.evaluate(() => window.__ocean.stage.set(13, 0));
	await frames(2);
	const deck = await position();
	expect(Math.hypot(deck[0] - 0, deck[1] - 14, deck[2] - 40)).toBeLessThan(10);
	expect(errors).toEqual([]);
});
