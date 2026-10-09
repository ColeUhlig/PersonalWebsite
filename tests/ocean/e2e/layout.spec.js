// The ocean page's layout (piece C, Task 2; the step list from the C2 contract, Task 0): the title,
// the story's steps and their math, cards and slots, the finale's blocks, the desktop and phone
// layouts, contrast, and a story that reads with three blocked.
import { test, expect } from '@playwright/test';
import { RECIPES } from '../../../content/ocean/js/stages/recipes.js';
import { STEP_COUNT, stepOf } from '../../../content/ocean/js/stages/steps.js';
import { CARD_STEP_IDS, SLOTS } from '../page/structure.js';

const TITLES = RECIPES.map((r) => r.title);
const CARD_STEPS = CARD_STEP_IDS.map(stepOf);
const at = (id) => `#step-${stepOf(id)}`;
// The math box's pinned bar on a phone (style.css --mathbar-height): the story starts below it.
const MATHBAR_HEIGHT = 44;

function watch(page) {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	return errors;
}

// WCAG contrast of two sRGB colours given as [r, g, b] bytes.
function contrast(a, b) {
	const lum = (rgb) => {
		const [r, g, bl] = rgb.map((v) => {
			const c = v / 255;
			return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
	};
	const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

const parse = (css) => css.match(/[\d.]+/g).map(Number);
const over = (rgba, backdrop) => {
	const alpha = rgba.length > 3 ? rgba[3] : 1;
	return [0, 1, 2].map((i) => rgba[i] * alpha + backdrop[i] * (1 - alpha));
};

test("the title, the opening and the story's steps in order", async ({ page }) => {
	await page.goto('/ocean/');
	await expect(page).toHaveTitle('Building an Ocean in Roblox');
	await expect(page.locator('#opening h1')).toHaveText('Building an Ocean in Roblox');
	await expect(page.locator('#opening .cue')).toContainText('Scroll to begin');
	await expect(page.locator('#opening .lede')).toContainText('a platform without vertex, pixel or compute shaders');
	const steps = page.locator('section.step[data-step]');
	await expect(steps).toHaveCount(STEP_COUNT);
	for (let n = 1; n <= STEP_COUNT; n++) {
		await expect(page.locator(`#step-${n}`)).toHaveAttribute('data-step', String(n));
		await expect(page.locator(`#step-${n}-title`)).toHaveText(TITLES[n - 1]);
		await expect(page.locator(`#step-${n} [data-controls="${n}"]`)).toHaveCount(1);
	}
});

test('every step but the finale has a collapsed math line, and the cards sit where the spec puts them', async ({ page }) => {
	await page.goto('/ocean/');
	for (let n = 1; n < STEP_COUNT; n++) {
		const math = page.locator(`#step-${n} details.math`);
		await expect(math).toHaveCount(1);
		expect(await math.evaluate((d) => d.open)).toBe(false);
		await expect(math.locator('summary')).toHaveText('Mathematical detail');
		expect((await math.locator('.tex code').textContent()).trim().length).toBeGreaterThan(10);
		const cards = page.locator(`#step-${n} aside.card`);
		await expect(cards).toHaveCount(CARD_STEPS.includes(n) ? 1 : 0);
		if (CARD_STEPS.includes(n)) {
			await expect(cards.locator('h3')).toHaveText('Platform constraint');
			// A placeholder card (lane G writes it) has no number yet.
			const terms = await cards.locator('dt').allTextContents();
			expect(terms.slice(0, 3)).toEqual(['Conventional approach', 'In Roblox', 'Approach taken']);
			expect(terms.length === 3 || terms[3] === 'Measurement').toBe(true);
		}
	}
	await expect(page.locator(`${at('finale')} aside.card`)).toHaveCount(0);
	for (const [id, slots] of Object.entries(SLOTS)) {
		for (const slot of slots) {
			await expect(page.locator(`${at(id)} [${slot.replaceAll('" ', '"][')}]`)).toHaveCount(1);
		}
	}
});

test('the finale holds its blocks, with footage, Play and the render toggle hidden', async ({ page }) => {
	await page.goto('/ocean/');
	for (const id of ['live', 'proof-block', 'recap', 'believed', 'references']) {
		await expect(page.locator(`${at('finale')} #${id}`)).toHaveCount(1);
	}
	await expect(page.locator('#footage')).toBeHidden();
	await expect(page.locator('#play')).toBeHidden();
	await expect(page.locator('[data-render-mode]')).toBeHidden();
	await expect(page.locator('#believed h3')).toHaveText('Assumptions refuted by testing');
	for (const href of [
		'https://www.youtube.com/watch?v=PH9q0HNBjT4',
		'https://www.youtube.com/watch?v=yPfagLeUa7k',
		'https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf',
		'https://gpuopen.com/gdc-presentations/2019/gdc-2019-agtd6-interactive-water-simulation-in-atlas.pdf',
		'https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf',
		'https://github.com/howhow2315/jonswap-ocean',
	]) {
		await expect(page.locator(`#references a[href="${href}"]`)).toHaveCount(1);
	}
});

test('on desktop the panels sit in the left third over the full-screen ocean', async ({ page }) => {
	await page.goto('/ocean/');
	const canvas = await page.locator('#ocean').boundingBox();
	expect(canvas.width).toBe(1366);
	expect(canvas.height).toBe(767);
	await page.locator(at('sum-of-sines')).scrollIntoViewIfNeeded();
	const panel = await page.locator(`${at('sum-of-sines')} .panel`).boundingBox();
	expect(panel.x).toBeGreaterThanOrEqual(16);
	expect(panel.x + panel.width).toBeLessThanOrEqual(1366 / 3);
});

// Task 14 review item 4: the graph keeps its words clear of the panels by measuring only the first
// step's panel (ui/keepClear.js, watched from ui/storyStage.js), which is right only while every
// step's panel stands in that same column. On wide screens of three sizes they all do.
for (const { width, height } of [{ width: 1366, height: 767 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
	test(`every step's panel stands in one column at ${width} × ${height}, the one the graph keeps clear of`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		await page.goto('/ocean/');
		const columns = await page.evaluate(() => [...document.querySelectorAll('.step .panel')].map((panel) => {
			const r = panel.getBoundingClientRect();
			return { step: panel.closest('.step').dataset.stepId, left: r.left, right: r.right };
		}));
		expect(columns.length).toBe(STEP_COUNT);
		const [first] = columns;
		const off = columns.filter((c) => Math.abs(c.left - first.left) > 0.5 || Math.abs(c.right - first.right) > 0.5);
		expect(off, `the first panel spans ${first.left} to ${first.right}`).toEqual([]);
	});
}

test('no panel scrolls inside itself: a tall panel grows with the page (1366 x 767)', async ({ page }) => {
	await page.goto('/ocean/');
	for (const [name, text] of [['closed', false], ['math open', true]]) {
		if (text) await page.evaluate(() => document.querySelectorAll('details.math').forEach((d) => { d.open = true; }));
		const scrollers = await page.evaluate(() => [...document.querySelectorAll('.panel')]
			.map((panel) => ({
				id: panel.closest('section.step').id,
				overflowY: getComputedStyle(panel).overflowY,
				hidden: panel.scrollHeight - panel.clientHeight,
			}))
			.filter((row) => row.overflowY !== 'visible' || row.hidden > 1));
		expect(scrollers, name).toEqual([]);
	}
	// The point of the test: at this height some panels are taller than the screen once their math opens.
	const tallest = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.panel')].map((panel) => panel.offsetHeight)));
	expect(tallest).toBeGreaterThan(767);
});

test('nothing on the page uses backdrop-filter, and only the canvas carries a filter', async ({ page }) => {
	await page.goto('/ocean/');
	const offenders = await page.evaluate(() => [...document.querySelectorAll('*')]
		.filter((el) => {
			const style = getComputedStyle(el);
			return (style.backdropFilter && style.backdropFilter !== 'none') || (style.filter !== 'none' && el.id !== 'ocean');
		})
		.map((el) => el.tagName + (el.id ? `#${el.id}` : '') + (el.className ? `.${el.className}` : '')));
	expect(offenders).toEqual([]);
});

for (const scheme of ['dark', 'light']) {
	test(`panel text keeps 4.5:1 contrast over a black or a white sea when the system prefers ${scheme} (the page is always dark)`, async ({ page }) => {
		await page.emulateMedia({ colorScheme: scheme });
		await page.goto('/ocean/');
		const { ink, glass, cardInk, cardBg, ledeInk, scrim } = await page.evaluate((step) => ({
			ink: getComputedStyle(document.querySelector(`${step} .panel p`)).color,
			glass: getComputedStyle(document.querySelector(`${step} .panel`)).backgroundColor,
			cardInk: getComputedStyle(document.querySelector(`${step} .card dd`)).color,
			cardBg: getComputedStyle(document.querySelector(`${step} .card`)).backgroundColor,
			ledeInk: getComputedStyle(document.querySelector('#opening .lede')).color,
			scrim: getComputedStyle(document.querySelector('#opening .opening-inner')).backgroundColor,
		}), at('into-3d'));
		for (const backdrop of [[0, 0, 0], [255, 255, 255]]) {
			const panel = over(parse(glass), backdrop);
			expect(contrast(parse(ink).slice(0, 3), panel)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(parse(cardInk).slice(0, 3), over(parse(cardBg), panel))).toBeGreaterThanOrEqual(4.5);
			// The opening's lede sits on its own faint scrim, straight over the sea.
			expect(contrast(parse(ledeInk).slice(0, 3), over(parse(scrim), backdrop))).toBeGreaterThanOrEqual(4.5);
		}
	});
}

test.describe('on a phone in portrait', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

	test('the ocean fills the top half above the panels and nothing scrolls sideways (Review Focus 5)', async ({ page }) => {
		await page.goto('/ocean/');
		const canvas = await page.locator('#ocean').boundingBox();
		expect(canvas.y).toBe(0);
		expect(Math.abs(canvas.height - 422)).toBeLessThanOrEqual(1);
		const layers = await page.evaluate(() => ({
			canvas: Number(getComputedStyle(document.getElementById('ocean')).zIndex),
			story: Number(getComputedStyle(document.getElementById('story')).zIndex),
		}));
		expect(layers.canvas).toBeGreaterThan(layers.story);
		// C2: the story starts below the top half and the math box's pinned bar.
		const top = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.getElementById('story')).paddingTop));
		expect(Math.abs(top - (422 + MATHBAR_HEIGHT))).toBeLessThanOrEqual(1);
		await page.locator(at('unlit')).scrollIntoViewIfNeeded();
		const panel = await page.locator(`${at('unlit')} .panel`).boundingBox();
		expect(panel.x).toBeGreaterThanOrEqual(15);
		expect(panel.x + panel.width).toBeLessThanOrEqual(375);
		for (const id of ['opening', `step-${stepOf('into-3d')}`, `step-${STEP_COUNT}`, 'references']) {
			await page.locator(`#${id}`).scrollIntoViewIfNeeded();
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
		}
	});
});

test('with three blocked the whole story still reads (Review Focus 3)', async ({ page }) => {
	const errors = watch(page);
	await page.route('**/npm/three@0.186.1/**', (route) => route.abort());
	await page.goto('/ocean/');
	await expect(page.locator('body')).toHaveAttribute('data-ocean', 'unavailable');
	for (let n = 1; n <= STEP_COUNT; n++) {
		await page.locator(`#step-${n}`).scrollIntoViewIfNeeded();
		await expect(page.locator(`#step-${n}-title`)).toBeVisible();
	}
	await expect(page.locator(`${at('fft')} .card`)).toContainText('12,288');
	await expect(page.locator(`${at('jonswap')} figure.chart`)).toBeHidden();
	expect(errors).toEqual([]);
});

test('the home page links to the ocean, and the ocean links home', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('a[href="/ocean/"]')).toHaveText('Building an Ocean in Roblox');
	await page.goto('/ocean/');
	await expect(page.locator('header.site a[href="/"]')).toHaveCount(1);
	await expect(page.locator('footer.site a[href="/"]')).toHaveCount(1);
});

// Task 14 (from C Task 9b's re-review): on a wide screen the opening card sits centred in the window
// (not raised by the pills' room), the finale's blocks are centred with the pills' column clear on
// both sides, and on a short landscape phone, even with the text at twice its size, the pills cover
// none of the opening's words.
async function openingLayout(page) {
	return page.evaluate(() => {
		const box = (el) => el.getBoundingClientRect();
		const pills = [...document.querySelectorAll('.pills > *')].filter((el) => !el.hidden).map(box);
		const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
		const covered = [];
		const walker = document.createTreeWalker(document.querySelector('.opening'), NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			if (!n.textContent.trim()) continue;
			const range = document.createRange();
			range.selectNodeContents(n);
			for (const rect of range.getClientRects()) if (pills.some((p) => hit(rect, p))) covered.push(n.textContent.trim().slice(0, 30));
		}
		const card = box(document.querySelector('.opening-inner'));
		return { pills: pills.length, covered, cardCentre: (card.top + card.bottom) / 2, height: window.innerHeight };
	});
}

for (const { width, height } of [{ width: 1366, height: 767 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
	test.describe(`on a ${width} × ${height} touch screen`, () => {
		test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

		test('the opening card is centred in the window and clear of the pills', async ({ page }) => {
			await page.goto('/ocean/');
			await page.waitForFunction(() => document.body.dataset.ocean === 'running', null, { timeout: 90_000 });
			const layout = await openingLayout(page);
			expect(layout.pills).toBeGreaterThan(0);
			expect(Math.abs(layout.cardCentre - layout.height / 2)).toBeLessThan(2);
			expect(layout.covered).toEqual([]);
		});

		test("the finale's blocks are centred, the pills' column clear on both sides", async ({ page }) => {
			await page.goto('/ocean/');
			await page.waitForFunction(() => document.body.dataset.ocean === 'running', null, { timeout: 90_000 });
			const blocks = await page.evaluate(() => {
				const room = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pill-width')) * parseFloat(getComputedStyle(document.documentElement).fontSize) + 32;
				return [...document.querySelectorAll('.step-finale .block')].filter((b) => !b.hidden).map((b) => {
					const r = b.getBoundingClientRect();
					return { left: r.left, right: window.innerWidth - r.right, width: r.width, room };
				});
			});
			expect(blocks.length).toBeGreaterThan(0);
			for (const block of blocks) {
				expect(Math.abs(block.left - block.right)).toBeLessThan(1.5);
				expect(block.right).toBeGreaterThanOrEqual(block.room - 0.5);
				expect(block.width).toBeLessThanOrEqual(1100.5);
			}
		});
	});
}

for (const scale of ['100%', '200%']) {
	test.describe(`on a 932 × 430 landscape phone with the text at ${scale}`, () => {
		test.use({ viewport: { width: 932, height: 430 }, isMobile: true, hasTouch: true });

		test("the pills cover none of the opening's words", async ({ page }) => {
			await page.addInitScript((size) => {
				document.addEventListener('DOMContentLoaded', () => {
					document.documentElement.style.fontSize = size;
				});
			}, scale);
			await page.goto('/ocean/');
			await page.waitForFunction(() => document.body.dataset.ocean === 'running', null, { timeout: 90_000 });
			const layout = await openingLayout(page);
			expect(layout.pills).toBeGreaterThan(0);
			expect(layout.covered).toEqual([]);
		});
	});
}
