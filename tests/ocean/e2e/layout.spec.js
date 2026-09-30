// The ocean page's layout (piece C, Task 2): the title, the thirteen steps and their math, cards and
// charts, the finale's blocks, the desktop and phone layouts, contrast, and a story that reads with
// three blocked.
import { test, expect } from '@playwright/test';

const TITLES = [
	'A flat white plane',
	'One sine wave',
	'Many sine waves',
	'Light',
	'Pointy crests',
	'The repetition problem',
	'Real ocean data',
	'A random ocean, moving',
	'The FFT',
	'Three layers of waves',
	'Foam',
	'Glow',
	'The whole thing',
];
const CARD_STEPS = [1, 2, 3, 4, 6, 9, 10, 11, 12];

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

test('the title, the opening and thirteen steps in order', async ({ page }) => {
	await page.goto('/ocean/');
	await expect(page).toHaveTitle('Building an Ocean in Roblox');
	await expect(page.locator('#opening h1')).toHaveText('Building an Ocean in Roblox');
	await expect(page.locator('#opening .cue')).toContainText('Scroll to build it from nothing');
	await expect(page.locator('#opening .lede')).toContainText('Roblox fought me the whole way');
	const steps = page.locator('section.step[data-step]');
	await expect(steps).toHaveCount(13);
	for (let n = 1; n <= 13; n++) {
		await expect(page.locator(`#step-${n}`)).toHaveAttribute('data-step', String(n));
		await expect(page.locator(`#step-${n}-title`)).toHaveText(TITLES[n - 1]);
		await expect(page.locator(`#step-${n} [data-controls="${n}"]`)).toHaveCount(1);
	}
});

test('every step to 12 has a collapsed math line, and the cards sit where the spec puts them', async ({ page }) => {
	await page.goto('/ocean/');
	for (let n = 1; n <= 12; n++) {
		const math = page.locator(`#step-${n} details.math`);
		await expect(math).toHaveCount(1);
		expect(await math.evaluate((d) => d.open)).toBe(false);
		await expect(math.locator('summary')).toHaveText('The math');
		expect((await math.locator('.tex code').textContent()).trim().length).toBeGreaterThan(10);
		const cards = page.locator(`#step-${n} aside.card`);
		await expect(cards).toHaveCount(CARD_STEPS.includes(n) ? 1 : 0);
		if (CARD_STEPS.includes(n)) {
			await expect(cards.locator('h3')).toHaveText('Roblox says no');
			await expect(cards.locator('dt')).toHaveText(['Normally', 'In Roblox', 'What I did', 'The number']);
		}
	}
	await expect(page.locator('#step-13 aside.card')).toHaveCount(0);
	for (const [step, kind] of [[7, 'spectrum'], [8, 'phase'], [9, 'transforms']]) {
		await expect(page.locator(`#step-${step} figure.chart[data-chart="${kind}"]`)).toHaveCount(1);
	}
});

test('the finale holds its blocks, with footage, Play and the render toggle hidden', async ({ page }) => {
	await page.goto('/ocean/');
	for (const id of ['live', 'proof-block', 'recap', 'believed', 'credits']) {
		await expect(page.locator(`#step-13 #${id}`)).toHaveCount(1);
	}
	await expect(page.locator('#footage')).toBeHidden();
	await expect(page.locator('#play')).toBeHidden();
	await expect(page.locator('[data-render-mode]')).toBeHidden();
	await expect(page.locator('#believed h3')).toHaveText('Things we believed about Roblox that turned out false');
	for (const href of [
		'https://www.youtube.com/watch?v=PH9q0HNBjT4',
		'https://www.youtube.com/watch?v=yPfagLeUa7k',
		'https://jtessen.people.clemson.edu/reports/papers_files/coursenotes2004.pdf',
		'https://gpuopen.com/gdc-presentations/2019/gdc-2019-agtd6-interactive-water-simulation-in-atlas.pdf',
		'https://history.siggraph.org/wp-content/uploads/2022/09/2018-Talks-Ang_The-Technical-Art-of-Sea-of-Thieves.pdf',
		'https://github.com/howhow2315/jonswap-ocean',
	]) {
		await expect(page.locator(`#credits a[href="${href}"]`)).toHaveCount(1);
	}
});

test('on desktop the panels sit in the left third over the full-screen ocean', async ({ page }) => {
	await page.goto('/ocean/');
	const canvas = await page.locator('#ocean').boundingBox();
	expect(canvas.width).toBe(1366);
	expect(canvas.height).toBe(767);
	await page.locator('#step-3').scrollIntoViewIfNeeded();
	const panel = await page.locator('#step-3 .panel').boundingBox();
	expect(panel.x).toBeGreaterThanOrEqual(16);
	expect(panel.x + panel.width).toBeLessThanOrEqual(1366 / 3);
});

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
		const { ink, glass, cardInk, cardBg, ledeInk, scrim } = await page.evaluate(() => ({
			ink: getComputedStyle(document.querySelector('#step-2 .panel p')).color,
			glass: getComputedStyle(document.querySelector('#step-2 .panel')).backgroundColor,
			cardInk: getComputedStyle(document.querySelector('#step-2 .card dd')).color,
			cardBg: getComputedStyle(document.querySelector('#step-2 .card')).backgroundColor,
			ledeInk: getComputedStyle(document.querySelector('#opening .lede')).color,
			scrim: getComputedStyle(document.querySelector('#opening .opening-inner')).backgroundColor,
		}));
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
		await page.locator('#step-7').scrollIntoViewIfNeeded();
		const panel = await page.locator('#step-7 .panel').boundingBox();
		expect(panel.x).toBeGreaterThanOrEqual(15);
		expect(panel.x + panel.width).toBeLessThanOrEqual(375);
		for (const id of ['opening', 'step-4', 'step-13', 'credits']) {
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
	for (let n = 1; n <= 13; n++) {
		await page.locator(`#step-${n}`).scrollIntoViewIfNeeded();
		await expect(page.locator(`#step-${n}-title`)).toBeVisible();
	}
	await expect(page.locator('#step-9 .card')).toContainText('12,288');
	await expect(page.locator('#step-7 figure.chart')).toBeHidden();
	expect(errors).toEqual([]);
});

test('the home page links to the ocean, and the ocean links home', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('a[href="/ocean/"]')).toHaveText('Building an Ocean in Roblox');
	await page.goto('/ocean/');
	await expect(page.locator('header.site a[href="/"]')).toHaveCount(1);
	await expect(page.locator('footer.site a[href="/"]')).toHaveCount(1);
});
