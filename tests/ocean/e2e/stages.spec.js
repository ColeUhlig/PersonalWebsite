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
	// Step 5's crest shot [0, 5, 25] and step 6's fly-up [0, 700, 520], halfway.
	[0, 352.5, 272.5].forEach((value, i) => expect(position[i]).toBeCloseTo(value, 3));
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
