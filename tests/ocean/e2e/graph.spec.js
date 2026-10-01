// The flat graph in the browser (piece C2, lane B; spec 10.4): a dark frame with the bright curve on
// it, the curve's true height, the components in step 3, the sheet under the curve in step 4 and no
// graph from step 5 on.
import { test, expect } from '@playwright/test';
import { load, stage, story, grid, mean, watchErrors, waitFrames } from './helpers/stage.js';
import { oceanRunning, scrollToId, scrollToOpening } from './helpers/story.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { STEP_COUNT, stepOf } from '../../../content/ocean/js/stages/steps.js';
import { CURVE_POINTS } from '../../../content/ocean/js/page/graphModel.js';

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

// The brightest pixel of a full-resolution strip down the middle of the canvas, where the graph's
// plane faces the camera (pre-flight R20: a three-pixel line can vanish in a scaled-down copy).
async function brightest(page) {
	return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const width = Math.min(240, source.width);
		const copy = document.createElement('canvas');
		copy.width = width;
		copy.height = source.height;
		const context = copy.getContext('2d');
		context.drawImage(source, (source.width - width) / 2, 0, width, source.height, 0, 0, width, source.height);
		const data = context.getImageData(0, 0, copy.width, copy.height).data;
		let most = 0;
		for (let i = 0; i < data.length; i += 4) most = Math.max(most, 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
		resolve(most);
	})));
}

test('step 1: a dark graph with the sine drawn on it, true height 2.5 studs, the sea emptied', async ({ page }) => {
	await load(page, 'step=sine&freeze=12', 10);
	const graph = await stage(page, 'graph');
	expect(graph.shown).toBe(1);
	expect(graph.emptied).toBe(true);
	expect(graph.band).toEqual([-0.5, 0.5]);
	expect(graph.curve.points).toBe(CURVE_POINTS);
	// The backdrop draws over the scene with no depth test, so a fade dims the band's sliver and the
	// skirts' strands with the sky (Task 3 review): a depth-tested one let them through at full white.
	expect(graph.covers).toBe(true);
	expect(graph.curve.maxAbsY).toBeGreaterThan(2.45);
	expect(graph.curve.maxAbsY).toBeLessThan(2.55);
	expect(graph.yScale).toBe(4);
	expect(mean(await grid(page))).toBeLessThan(45);
	expect(await brightest(page)).toBeGreaterThan(110);
});

test('step 2: the curve slides', async ({ page }) => {
	await load(page, 'step=moving-sine', 10);
	const before = (await stage(page, 'graph')).curve.first[1];
	await waitFrames(page, 20);
	const after = (await stage(page, 'graph')).curve.first[1];
	expect(Math.abs(after - before)).toBeGreaterThan(0.05);
});

test('step 3: one faint curve per summed wave under the bold sum', async ({ page }) => {
	await load(page, 'step=sum-of-sines&freeze=12', 10);
	expect((await stage(page, 'graph')).components).toBe(3);
	await stage(page, 'setSlider', 'waveCount', 6);
	await waitFrames(page, 4);
	expect((await stage(page, 'graph')).components).toBe(6);
});

// Pre-flight R19: the sheet behind the curve is read from the surface probe, not a brightness that
// the sky alone would pass. The waves all run along +z here, so the sheet's tallest point and the
// curve's are the same wave heights over different stretches of z.
test('step 4: no backdrop, the sheet unrolled behind the curve, the curve on its edge', async ({ page }) => {
	await load(page, 'step=into-3d&freeze=12', 10);
	const graph = await stage(page, 'graph');
	expect(graph.shown).toBe(0);
	expect(graph.emptied).toBe(false);
	expect(graph.band[0]).toBe(-0.5);
	expect(graph.band[1]).toBe(400);
	expect(graph.yScale).toBe(1);
	expect(graph.curve).not.toBe(null);
	const surface = await stage(page, 'surface');
	expect(surface.patches).toBeGreaterThan(0);
	expect(surface.xSpread).toBeLessThan(1e-4);
	// Chop is 0 on the graph steps, so the curve's points at (0, y, z) are the sheet's own vertices.
	expect(surface.maxLateral).toBeLessThan(1e-4);
	expect(surface.zSpread).toBeGreaterThan(0.05);
	expect(graph.curve.maxAbsY).toBeGreaterThan(0.95 * surface.maxAbsY);
	expect(graph.curve.maxAbsY).toBeLessThan(1.05 * surface.maxAbsY);
	expect((await stage(page, 'look')).clipped).toBe(true);
	// The floor clip: under the deepest trough the summed waves can reach (so the sheet is whole),
	// and well above the skirts' floor, which hangs at the bounds' depth.
	expect(graph.floor).toBeLessThan(-surface.maxAbsY);
	expect(graph.floor).toBeGreaterThan(-(surface.maxAbsY + 1));
});

test('step 5 on: no graph, no clip', async ({ page }) => {
	await load(page, 'step=directions&freeze=12', 10);
	const graph = await stage(page, 'graph');
	expect(graph.band).toBe(null);
	expect(graph.curve).toBe(null);
	expect((await stage(page, 'look')).clipped).toBe(false);
});

const defaultOf = (id, slider) => recipeFor(stepOf(id)).sliders.find((s) => s.id === slider).default;

// R10: the λ marker needs two crests between the axes; 30 studs fits the 16:9 frame at any phase.
test('step 1 labels its axes and marks the live height and length', async ({ page }) => {
	await load(page, 'step=sine&freeze=12', 10);
	const graph = await stage(page, 'graph');
	expect(graph.axes).toBe(true);
	expect(graph.labels).toContain('height (studs, drawn ×4)');
	expect(graph.labels).toContain('distance (studs)');
	expect(graph.markers).toEqual({ wavelength: defaultOf('sine', 'wavelength'), amplitude: defaultOf('sine', 'amplitude') });
	await stage(page, 'setSlider', 'wavelength', 30);
	await waitFrames(page, 4);
	expect((await stage(page, 'graph')).markers.wavelength).toBe(30);
	expect((await stage(page, 'graph')).labels).toContain('λ = 30 studs');
});

test('the hero fades to the dark graph, and back', async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	expect((await story(page, 'graph')).shown).toBe(0);
	await scrollToId(page, 'sine', 0.1);
	const samples = [];
	for (let i = 0; i < 40; i++) samples.push((await story(page, 'graph')).shown);
	expect(samples.some((s) => s > 0.02 && s < 0.98), `a fade, not a pop: ${samples.map((s) => s.toFixed(2)).join(' ')}`).toBe(true);
	await page.waitForFunction(() => window.__ocean.story.graph().shown === 1, null, { timeout: 10_000 });
	await scrollToOpening(page);
	await page.waitForFunction(() => window.__ocean.story.graph().shown === 0, null, { timeout: 10_000 });
});

test('the swing into step 4 is one smooth camera move while the backdrop fades and the sheet unrolls', async ({ page }) => {
	test.setTimeout(180_000);
	await oceanRunning(page);
	await scrollToId(page, 'sum-of-sines', 0.4);
	await waitFrames(page, 20);
	await story(page, 'watchCamera', 400);
	for (let p = 0.5; p <= 1.0001; p += 0.05) {
		await scrollToId(page, 'sum-of-sines', Math.min(p, 0.999));
		await waitFrames(page, 6);
	}
	await scrollToId(page, 'into-3d', 0.1);
	await waitFrames(page, 30);
	const trail = await story(page, 'cameraTrail');
	let worst = 0;
	for (let i = 1; i < trail.length; i++) {
		const d = Math.hypot(...trail[i].position.map((v, k) => v - trail[i - 1].position[k]));
		worst = Math.max(worst, d);
	}
	expect(worst, 'studs in one frame').toBeLessThan(6);
	const graph = await story(page, 'graph');
	expect(graph.shown).toBe(0);
	expect(graph.band[1]).toBeGreaterThan(300);
});

// Review Focus 1.
test("a fling across the graph's boundary lands clean", async ({ page }) => {
	test.setTimeout(240_000);
	await oceanRunning(page);
	await scrollToId(page, 'moving-sine', 0.2);
	await waitFrames(page, 10);
	await page.keyboard.press('End');
	// All the way to the last step: End scrolls smoothly, and under load a wait that any step without
	// a band satisfies can land mid-scroll, before the frequency steps' own band comes and goes.
	await page.waitForFunction((last) => window.__page.reading().step === last && window.__ocean.story.state().step === last && window.__ocean.story.graph().band === null, STEP_COUNT, { timeout: 30_000 });
	expect((await story(page, 'look')).clipped).toBe(false);
	expect(await story(page, 'orbitEnabled')).toBe(true);
	await page.keyboard.press('Home');
	// Home scrolls smoothly too: let it land at the top, or it carries on after the next jump and
	// takes the page back to the opening.
	await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 30_000 });
	await scrollToOpening(page);
	await scrollToId(page, 'moving-sine', 0.2);
	await page.waitForFunction(() => window.__ocean.story.graph().emptied === true, null, { timeout: 30_000 });
	await story(page, 'watchCamera', 120);
	await story(page, 'watchPictures', 120);
	await scrollToId(page, 'jonswap', 0.2);
	await waitFrames(page, 60);
	const graph = await story(page, 'graph');
	expect(graph.band).toBe(null);
	expect((await story(page, 'look')).clipped).toBe(false);
	const trail = await story(page, 'cameraTrail');
	expect(trail.filter((t) => t.step >= 16).every((t) => t.position[1] > 14), 'the lens stays above the crests').toBe(true);
	const pictures = await story(page, 'pictures');
	expect(pictures.filter((p) => p.key >= 16 && !p.held).every((p) => p.maxAbsY > 0), 'no flat sea shown').toBe(true);
});

test.describe('reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('the swing is a cut and the backdrop does not fade', async ({ page }) => {
		test.setTimeout(180_000);
		await oceanRunning(page);
		await scrollToId(page, 'sum-of-sines', 0.3);
		await waitFrames(page, 5);
		expect((await story(page, 'graph')).shown).toBe(1);
		await story(page, 'watchCamera', 200);
		await scrollToId(page, 'sum-of-sines', 0.8);
		await waitFrames(page, 5);
		await scrollToId(page, 'into-3d', 0.3);
		await waitFrames(page, 10);
		const shots = [recipeFor(stepOf('sum-of-sines')).shot.position, recipeFor(stepOf('into-3d')).shot.position];
		for (const entry of await story(page, 'cameraTrail')) {
			expect(shots.some((s) => Math.hypot(...s.map((v, k) => v - entry.position[k])) < 0.01), `${entry.position} is one of the two shots`).toBe(true);
		}
		expect((await story(page, 'graph')).shown).toBe(0);
	});
});
