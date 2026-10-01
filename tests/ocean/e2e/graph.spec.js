// The flat graph in the browser (piece C2, lane B; spec 10.4): a dark frame with the bright curve on
// it, the curve's true height, the components in step 3, the sheet under the curve in step 4 and no
// graph from step 5 on.
import { test, expect } from '@playwright/test';
import { load, stage, story, grid, mean, watchErrors, waitFrames } from './helpers/stage.js';
import { oceanRunning, restAtFoot, scrollToId, scrollToOpening } from './helpers/story.js';
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

// Task 14: the coarser rings' skirts hang under a finer ring's edge, and where the band cuts them
// they showed as short dark wire stubs under the curve (up to 4.7 studs). While the band is on the
// stage look leaves out every triangle that touches a skirted vertex, so under the curve, column by
// column, there is nothing dark: only the white sheet's own edge and the sky.
test('step 4: no skirt stubs hang under the curve', async ({ page }) => {
	await load(page, 'step=into-3d&freeze=12', 20);
	expect((await stage(page, 'look')).skirtsHidden).toBe(true);
	const stubs = await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const copy = document.createElement('canvas');
		copy.width = source.width;
		copy.height = source.height;
		const context = copy.getContext('2d');
		context.drawImage(source, 0, 0);
		const { data, width, height } = context.getImageData(0, 0, copy.width, copy.height);
		const at = (x, y) => (y * width + x) * 4;
		// The curve's accent (#5fd4c4): green and blue well above red.
		const isCurve = (i) => data[i + 1] - data[i] > 70 && data[i + 2] - data[i] > 60;
		const luminance = (i) => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
		const scale = height / window.innerHeight;
		const reach = Math.round(24 * scale);
		let columns = 0;
		let dark = 0;
		for (let x = 0; x < width; x += 2) {
			let bottom = -1;
			for (let y = height - 1; y >= 0; y--) {
				if (isCurve(at(x, y))) {
					bottom = y;
					break;
				}
			}
			if (bottom < 0) continue;
			columns += 1;
			for (let y = bottom + Math.round(3 * scale); y < Math.min(height, bottom + reach); y++) {
				if (luminance(at(x, y)) < 150) {
					dark += 1;
					break;
				}
			}
		}
		resolve({ columns, dark });
	})));
	expect(stubs.columns).toBeGreaterThan(200);
	expect(stubs.dark).toBe(0);
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
	await restAtFoot(page);
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
	const trail = (await story(page, 'cameraTrail')).filter((t) => t.step >= 16);
	expect(trail.length, 'frames watched on the far side').toBeGreaterThan(0);
	expect(trail.every((t) => t.position[1] > 14), 'the lens stays above the crests').toBe(true);
	const pictures = (await story(page, 'pictures')).filter((p) => p.key >= 16 && !p.held);
	expect(pictures.length, 'pictures watched on the far side').toBeGreaterThan(0);
	expect(pictures.every((p) => p.maxAbsY > 0), 'no flat sea shown').toBe(true);
});

test.describe('reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('the swing is a cut and the backdrop does not fade', async ({ page }) => {
		test.setTimeout(180_000);
		await oceanRunning(page);
		// Reduced motion boots with the clock paused, and a stopped clock snaps every fade anyway: play
		// it, so what holds the backdrop still is the stage's own reduced-motion branch (fix round 1).
		await expect(page.locator('#motion')).toHaveText('Play the ocean');
		await page.locator('#motion').click();
		await expect(page.locator('#motion')).toHaveText('Pause the ocean');
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

// Fix round 1: the curve fades out when step 4's band ends (and when the camera stops facing the
// plane), rather than popping; with the clock running, some frames show it part-way.
test('the curve fades out, not pops, when the band releases', async ({ page }) => {
	await load(page, 'step=into-3d', 10);
	await page.waitForFunction(() => window.__ocean.stage.graph().curveShown === 1, null, { timeout: 30_000 });
	await stage(page, 'set', stepOf('directions'), 0);
	const samples = [];
	for (let i = 0; i < 40; i++) {
		samples.push((await stage(page, 'graph')).curveShown);
		if (samples.at(-1) === 0) break;
	}
	expect(samples.some((s) => s > 0.02 && s < 0.98), `a fade, not a pop: ${samples.map((s) => s.toFixed(2)).join(' ')}`).toBe(true);
	await page.waitForFunction(() => window.__ocean.stage.graph().curve === null, null, { timeout: 10_000 });
	expect((await stage(page, 'graph')).band).toBe(null);
});

// Fix round 2: on a phone the graph's words never print over each other, at small and large heights
// and with the λ bracket over the crests or under the troughs, and they stay on the canvas.
test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
	async function wordsKeepClear(page, label) {
		const { labelRects, lambdaSide } = await stage(page, 'graph');
		const { width, height } = await page.evaluate(() => ({ width: document.getElementById('ocean').clientWidth, height: document.getElementById('ocean').clientHeight }));
		expect(labelRects.length, `${label}: words drawn`).toBeGreaterThan(3);
		for (const r of labelRects) {
			expect(r.x0 >= 0 && r.x1 <= width && r.y0 >= 0 && r.y1 <= height, `${label}: "${r.text}" on the canvas ${JSON.stringify(r)}`).toBe(true);
		}
		for (let i = 0; i < labelRects.length; i++) {
			for (let j = i + 1; j < labelRects.length; j++) {
				expect(overlaps(labelRects[i], labelRects[j]), `${label}: "${labelRects[i].text}" over "${labelRects[j].text}"`).toBe(false);
			}
		}
		return lambdaSide;
	}

	// At 22 studs no crest pair fits between a 390-pixel phone's axes at the sine's phase, so the
	// bracket goes under the troughs: the case where its word met the distance numbers at small A.
	test('the words keep clear of each other at small and large heights', async ({ page }) => {
		test.setTimeout(180_000);
		const sides = new Set();
		for (const wavelength of [20, 22]) {
			for (const amplitude of [0.5, 0.75, 1, 4]) {
				await load(page, `step=sine&freeze=12&s.amplitude=${amplitude}&s.wavelength=${wavelength}`, 10);
				sides.add(await wordsKeepClear(page, `A ${amplitude}, λ ${wavelength}`));
			}
		}
		expect([...sides].sort()).toEqual(['crest', 'trough']);
	});

	test('the words keep clear of each other with the λ bracket over the crests or under the troughs', async ({ page }) => {
		const sides = new Set();
		for (let t = 0; t < 2.5; t += 0.3) {
			await load(page, `step=moving-sine&freeze=${t.toFixed(1)}`, 10);
			sides.add(await wordsKeepClear(page, `t ${t.toFixed(1)}`));
		}
		expect([...sides].sort()).toEqual(['crest', 'trough']);
	});
});

// Task 14 (lane B's note): the page's chrome sits over the canvas, the pills at the bottom right and
// the home link at the top right. At the tallest sine (A = 4) the distance word and the last tick
// numbers ran under the "Pause the ocean" pill. No graph word or number sits under either, on a phone
// at 390 and 320 px and on a laptop, at the tallest sine and on the other graph steps.
for (const { width, height } of [{ width: 390, height: 844 }, { width: 320, height: 700 }, { width: 1366, height: 767 }]) {
	test.describe(`on a ${width} × ${height} screen`, () => {
		test.use({ viewport: { width, height }, isMobile: width < 900, hasTouch: width < 900 });

		test("no graph word sits under the page's pills or its home link", async ({ page }) => {
			test.setTimeout(180_000);
			const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
			for (const query of ['step=sine&s.amplitude=4', 'step=sine', 'step=moving-sine', 'step=sum-of-sines', 'step=frequency']) {
				await load(page, `${query}&freeze=12`, 30);
				await waitFrames(page, 5);
				const { labels, chrome } = await page.evaluate(() => {
					const canvas = document.getElementById('ocean').getBoundingClientRect();
					const chrome = [...document.querySelectorAll('.pills > *, header.site a')].filter((e) => !e.hidden && e.offsetParent !== null).map((e) => {
						const r = e.getBoundingClientRect();
						return { name: e.id || e.textContent.trim(), x0: r.left - canvas.left, y0: r.top - canvas.top, x1: r.right - canvas.left, y1: r.bottom - canvas.top };
					});
					return { labels: window.__ocean.stage.graph().labelRects, chrome };
				});
				expect(labels.length, `${query}: words drawn`).toBeGreaterThan(3);
				expect(chrome.length).toBeGreaterThan(0);
				const covered = labels.flatMap((l) => chrome.filter((c) => hit(l, c)).map((c) => `"${l.text}" under ${c.name}`));
				expect(covered, query).toEqual([]);
			}
		});
	});
}

// Task 14: on a wide screen the step's panel covers the left of the canvas and the math box its top
// right; the graph's words and numbers (the height axis' among them) stand clear of both.
for (const { width, height } of [{ width: 1366, height: 767 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
	test.describe(`in the story on a ${width} × ${height} screen`, () => {
		test.use({ viewport: { width, height } });

		test("no graph word sits under the step's panel or the math box", async ({ page }) => {
			test.setTimeout(180_000);
			const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
			await oceanRunning(page);
			for (const id of ['sine', 'moving-sine', 'sum-of-sines', 'frequency', 'fourier']) {
				await scrollToId(page, id, 0.35);
				await page.waitForFunction(() => window.__ocean.story.graph().shown === 1, null, { timeout: 30_000 });
				await waitFrames(page, 5);
				const { labels, covers } = await page.evaluate((step) => {
					const canvas = document.getElementById('ocean').getBoundingClientRect();
					const box = (el) => {
						const r = el.getBoundingClientRect();
						return { name: el.id || el.className, x0: r.left - canvas.left, y0: r.top - canvas.top, x1: r.right - canvas.left, y1: r.bottom - canvas.top };
					};
					const covers = [document.querySelector(`section[data-step-id="${step}"] .panel`), document.getElementById('mathbox')].filter((el) => el && !el.hidden).map(box);
					return { labels: window.__ocean.story.graph().labelRects, covers };
				}, id);
				expect(labels.length, `${id}: words drawn`).toBeGreaterThan(3);
				// The sine steps still mark the length: under the troughs when the crests' pair would reach the box.
				if (id === 'sine' || id === 'moving-sine') expect(labels.some((l) => l.text.startsWith('λ')), `${id}: the λ word`).toBe(true);
				const covered = labels.flatMap((l) => covers.filter((c) => hit(l, c)).map((c) => `"${l.text}" under ${c.name}`));
				expect(covered, id).toEqual([]);
			}
		});
	});
}
