// The finale's working parts in the browser (piece C, Task 9): the live numbers, measured here and
// never empty; the footage, hidden until the manifest lists a clip, fetched from a site-absolute
// path; the embedded proof panel; the Play button and the render toggle, hidden until real; and the
// motion button over the play clock, paused from the start under reduced motion.
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { oceanRunning, waitFrames, watchErrors } from './helpers/story.js';

const INDEX_HTML = readFileSync(new URL('../../../content/ocean/index.html', import.meta.url));
const SHOWCASE_JS = readFileSync(new URL('../../../content/ocean/js/engine/showcase.js', import.meta.url), 'utf8');
const PLAY_ANCHOR = '<a id="play" class="play" rel="noopener" target="_blank" hidden>Play it in Roblox</a>';
const CLIP = { shot: 'deck', webm: 'deck.webm', mp4: 'deck.mp4', poster: 'deck.jpg', width: 1280, height: 720, seconds: 20 };

// The surface's vertex statistics (A3's probe): identical from frame to frame only if the waves
// have not moved. (The canvas is not used here: foam keeps settling for a while even with the
// clock held, since each fold test adds to it.)
const surface = (page) => page.evaluate(() => JSON.stringify(window.__ocean.story.surface()));
const liveText = (page) => page.locator('#live [data-live]').textContent();

test.describe.configure({ timeout: 240_000 });

test('the live numbers are labelled as measured in your browser, and fill in', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await page.locator('#live').scrollIntoViewIfNeeded();
	await expect(page.locator('#live .dim')).toHaveText('Measured in your browser, right now.');
	await expect(page.locator('#live [data-live]')).toContainText('Frame rate', { timeout: 30_000 });
	await expect(page.locator('#live [data-live]')).toContainText('fps');
	// The tier is the probe's on this machine, so read the point count rather than assume High.
	const vertices = await page.evaluate(() => window.__ocean.status().vertices.toLocaleString('en-US'));
	await expect(page.locator('#live [data-live]')).toContainText(vertices);
	await expect(page.locator('#live [data-live-phone]')).toBeHidden();
	await expect(page.locator('#motion')).toHaveText('Pause the ocean');
	const text = await liveText(page);
	expect(text).not.toMatch(/roblox|studio|unleashed/i);
	expect(errors).toEqual([]);
});

// A reviewer saw the block blank 25 s in. It says it is measuring from the start, and a report
// arrives in story mode (the first 300-frame window), after which the per-stage timings show.
test('the live block is never empty: measuring at first, then the per-stage timings once a report arrives', async ({ page }) => {
	await page.goto('/ocean/');
	await expect(page.locator('#live [data-live]')).toContainText('measuring');
	await page.waitForFunction(() => document.body.dataset.ocean === 'running', null, { timeout: 90_000 });
	await page.locator('#live').scrollIntoViewIfNeeded();
	expect((await liveText(page)).trim()).not.toBe('');
	await page.waitForFunction(() => window.__ocean.report() !== null, null, { timeout: 90_000 });
	await expect(page.locator('#live [data-live]')).toContainText('Writing the points', { timeout: 5_000 });
	await expect(page.locator('#live [data-live]')).toContainText('Drawing the frame');
	await expect(page.locator('#live [data-live]')).not.toContainText('measuring');
});

test('the live numbers change at most twice a second', async ({ page }) => {
	await oceanRunning(page);
	await page.locator('#live').scrollIntoViewIfNeeded();
	await expect(page.locator('#live [data-live]')).toContainText('fps', { timeout: 30_000 });
	const paints = await page.evaluate(() => new Promise((resolve) => {
		let count = 0;
		const observer = new MutationObserver((records) => {
			if (records.some((record) => record.type === 'childList')) count++;
		});
		observer.observe(document.querySelector('#live [data-live]'), { childList: true });
		setTimeout(() => {
			observer.disconnect();
			resolve(count);
		}, 3000);
	}));
	expect(paints).toBeGreaterThan(2);
	expect(paints).toBeLessThanOrEqual(7);
});

// The finale grows while the visitor reads above it (the live rows filling in, the proof panel
// mounting, footage appearing), and the story re-measures. ScrollTrigger scrolls the page to the top
// while it refreshes; a reading taken then would say "opening" and cut the camera mid-ease.
test('the finale growing while step 12 is read never reads as the opening or cuts the camera', async ({ page }) => {
	await oceanRunning(page);
	await page.waitForFunction(() => window.__page.scrollEngine() === 'gsap', null, { timeout: 30_000 });
	await page.evaluate(() => {
		const section = document.getElementById('step-12');
		const rect = section.getBoundingClientRect();
		window.scrollTo(0, rect.top + window.scrollY + 0.6 * rect.height - window.innerHeight * 0.5);
	});
	await page.waitForFunction(() => window.__page.reading().step === 12, null, { timeout: 30_000 });
	await waitFrames(page, 30);
	const applied = await page.evaluate(() => window.__ocean.story.applied());
	await page.evaluate(() => {
		window.__phases = [];
		new MutationObserver(() => window.__phases.push(document.body.dataset.phase)).observe(document.body, { attributes: true, attributeFilter: ['data-phase'] });
		const grow = document.createElement('div');
		grow.style.height = '300px';
		document.getElementById('live').append(grow);
	});
	await waitFrames(page, 30);
	expect(await page.evaluate(() => window.__phases)).toEqual([]);
	expect(await page.evaluate(() => window.__page.reading().step)).toBe(12);
	// The camera was already where step 12 holds it; a cut would have placed it again.
	expect(await page.evaluate(() => window.__ocean.story.applied())).toBe(applied);
});

// A refresh that throws never reaches its 'refresh' event; the story must still read the scroll.
test('a ScrollTrigger refresh that throws leaves the story reading the scroll', async ({ page }) => {
	await oceanRunning(page);
	await page.waitForFunction(() => window.__page.scrollEngine() === 'gsap', null, { timeout: 30_000 });
	const thrown = await page.evaluate(async () => {
		const { ScrollTrigger } = await import('gsap/ScrollTrigger');
		let armed = false;
		ScrollTrigger.create({ trigger: document.body, onRefresh() { if (armed) throw new Error('a refresh that fails'); } });
		armed = true;
		try {
			ScrollTrigger.refresh();
			return 'did not throw';
		} catch (error) {
			return error.message;
		}
	});
	expect(thrown).toBe('a refresh that fails');
	await page.evaluate(() => {
		const rect = document.getElementById('step-4').getBoundingClientRect();
		window.scrollTo(0, rect.top + window.scrollY + 0.3 * rect.height - window.innerHeight * 0.5);
	});
	await page.waitForFunction(() => window.__page.reading().step === 4, null, { timeout: 10_000 });
});

test('footage stays hidden while the manifest lists no clips, and the manifest does not 404', async ({ page }) => {
	const statuses = [];
	page.on('response', (response) => {
		if (response.url().endsWith('/ocean/media/footage.json')) statuses.push(response.status());
	});
	await page.goto('/ocean/');
	await expect.poll(() => statuses.length).toBeGreaterThan(0);
	expect(statuses[0]).toBe(200);
	await expect(page.locator('#footage')).toBeHidden();
});

// The 2026-09-30 live incident: at /ocean (no slash) a relative path resolves to the site root.
test('at /ocean without the trailing slash the manifest is fetched from /ocean/media/, not /media/', async ({ page }) => {
	const fetched = [];
	page.on('request', (request) => {
		const path = new URL(request.url()).pathname;
		if (path.endsWith('footage.json') || path.startsWith('/media/')) fetched.push(path);
	});
	await page.route('**/ocean', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: INDEX_HTML }));
	await page.route('**/ocean/media/footage.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ clips: [CLIP] }) }));
	await page.goto('/ocean');
	expect(new URL(page.url()).pathname).toBe('/ocean');
	await expect(page.locator('#footage')).toBeVisible();
	expect(fetched).toEqual(['/ocean/media/footage.json']);
	await expect(page.locator('#footage video')).toHaveAttribute('poster', '/ocean/media/deck.jpg');
	await expect(page.locator('#footage video source').first()).toHaveAttribute('src', '/ocean/media/deck.webm');
});

test('footage appears when the manifest lists a clip, lazily and with its caption', async ({ page }) => {
	await page.route('**/ocean/media/footage.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ clips: [CLIP] }) }));
	await page.goto('/ocean/');
	await expect(page.locator('#footage')).toBeVisible();
	const video = page.locator('#footage video');
	await expect(video).toHaveCount(1);
	await expect(video).toHaveAttribute('preload', 'none');
	await expect(video).toHaveAttribute('poster', '/ocean/media/deck.jpg');
	await expect(page.locator('#footage video source')).toHaveCount(2);
	await expect(page.locator('#footage figcaption')).toHaveText('Deck height, where a player would stand.');
});

test('a manifest that is not JSON keeps the footage hidden, says why in the console and throws nothing', async ({ page }) => {
	const errors = [];
	const warnings = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'warning') warnings.push(message.text());
	});
	await page.route('**/ocean/media/footage.json', (route) => route.fulfill({ contentType: 'application/json', body: 'not json' }));
	await page.goto('/ocean/');
	await expect.poll(() => warnings.some((text) => text.includes('[ocean] the footage manifest could not be read; the footage stays hidden'))).toBe(true);
	await expect(page.locator('#footage')).toBeHidden();
	expect(errors).toEqual([]);
});

test('Play in Roblox stays hidden while no public place URL is set', async ({ page }) => {
	await page.goto('/ocean/');
	await expect(page.locator('#play')).toBeHidden();
	expect(await page.locator('#play').getAttribute('href')).toBeNull();
});

// The two above hold for the served HTML alone, so these prove the page itself decides: an anchor
// served visible with an address is hidden and stripped, and a real place URL shows the button.
test('the page hides a Play anchor and drops its address while placeUrl() gives none', async ({ page }) => {
	const html = String(INDEX_HTML).replace(PLAY_ANCHOR, '<a id="play" class="play" rel="noopener" target="_blank" href="https://example.com/">Play it in Roblox</a>');
	expect(html).not.toBe(String(INDEX_HTML));
	await page.route('**/ocean/', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
	await page.goto('/ocean/');
	await expect(page.locator('#play')).toBeHidden();
	await expect.poll(() => page.locator('#play').getAttribute('href')).toBeNull();
});

test('a real public place URL shows Play in Roblox with the canonical address', async ({ page }) => {
	const placed = SHOWCASE_JS.replace("export const ROBLOX_PLACE_URL = '';", "export const ROBLOX_PLACE_URL = 'https://roblox.com/games/1234567890/Ocean';");
	expect(placed).not.toBe(SHOWCASE_JS);
	await page.route('**/ocean/js/engine/showcase.js', (route) => route.fulfill({ contentType: 'text/javascript', body: placed }));
	await page.goto('/ocean/');
	await expect(page.locator('#play')).toBeVisible();
	await expect(page.locator('#play')).toHaveAttribute('href', 'https://www.roblox.com/games/1234567890');
});

test('the Luau proof panel mounts embedded as the visitor nears it, and its runtime waits for Run', async ({ page }) => {
	let runtime = 0;
	page.on('request', (request) => {
		if (request.url().includes('luau-web@')) runtime++;
	});
	await page.goto('/ocean/');
	await page.locator('#proof-block').scrollIntoViewIfNeeded();
	await expect(page.locator('#proof .proof')).toBeVisible({ timeout: 30_000 });
	// Embedded: the finale's one heading and glass, not the panel's own.
	await expect(page.locator('#proof .proof')).toHaveClass(/proof--embedded/);
	await expect(page.locator('#proof .proof-title, #proof .proof-lede')).toHaveCount(0);
	await expect(page.locator('#proof-block h3')).toHaveCount(1);
	expect(await page.evaluate(() => typeof window.__proof?.mountNow)).toBe('function');
	await page.waitForTimeout(500);
	expect(runtime).toBe(0);
});

test('the render toggle stays hidden, and appears and switches for a renderer that can', async ({ page }) => {
	await oceanRunning(page);
	await expect(page.locator('[data-render-mode]')).toBeHidden();
	await page.evaluate(async () => {
		const { mountRenderToggle } = await import('/ocean/js/ui/finale.js');
		window.__modes = [];
		mountRenderToggle(document.querySelector('[data-render-mode]'), { setRenderMode: (mode) => window.__modes.push(mode) });
	});
	await expect(page.locator('[data-render-mode]')).toBeVisible();
	await page.locator('[data-render-mode] button[data-mode="unleashed"]').click();
	expect(await page.evaluate(() => window.__modes)).toEqual(['unleashed']);
	await expect(page.locator('[data-render-mode] button[data-mode="unleashed"]')).toHaveAttribute('aria-checked', 'true');
});

test('without WebGL the finale says there is nothing to measure; the proof and credits still show', async ({ page }) => {
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
			return kind === 'webgl' || kind === 'webgl2' ? null : original.call(this, kind, ...rest);
		};
	});
	await page.goto('/ocean/');
	await expect(page.locator('#live [data-live-none]')).toBeVisible();
	await expect(page.locator('#live [data-live]')).toBeHidden();
	await expect(page.locator('#live .dim')).toBeHidden();
	await expect(page.locator('#motion')).toBeHidden();
	await page.locator('#proof-block').scrollIntoViewIfNeeded();
	await expect(page.locator('#proof .proof, #proof .proof-placeholder').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('#credits')).toBeVisible();
});

test.describe('on a phone, on the lighter tier by rule', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the finale says the tier was picked by rule and is unmeasured (Review Focus 5)', async ({ page }) => {
		await oceanRunning(page);
		await page.locator('#live').scrollIntoViewIfNeeded();
		await expect(page.locator('#live [data-live-phone]')).toBeVisible({ timeout: 30_000 });
		await expect(page.locator('#live [data-live-phone]')).toContainText('by rule');
		await expect(page.locator('#live [data-live-phone]')).toContainText("haven't measured");
		await expect(page.locator('#live [data-live]')).toContainText('phone rule, unmeasured');
	});
});

test.describe('under reduced motion', () => {
	test.use({ reducedMotion: 'reduce' });

	test('the ocean holds still until the visitor presses Play', async ({ page }) => {
		await oceanRunning(page, '/ocean/', 30);
		await page.waitForFunction(() => {
			const s = window.__ocean.status();
			return s.painterReady && s.workersReady > 0 && s.frame > 60;
		}, null, { timeout: 120_000 });
		await expect(page.locator('#motion')).toHaveText('Play the ocean');
		const held = await surface(page);
		await waitFrames(page, 10);
		expect(await surface(page)).toBe(held);
		await page.locator('#motion').click();
		await expect(page.locator('#motion')).toHaveText('Pause the ocean');
		await waitFrames(page, 10);
		expect(await surface(page)).not.toBe(held);
	});

	// A still sea costs less than a moving one: once the held time is caught up, the cascades and
	// painters rest (engine/ocean.js), and the live numbers say the ocean is paused.
	test('a paused ocean rests its cascades and painters, and the live numbers say it is paused', async ({ page }) => {
		await oceanRunning(page, '/ocean/', 30);
		await page.waitForFunction(() => window.__ocean.status().resting === true, null, { timeout: 120_000 });
		await page.locator('#live').scrollIntoViewIfNeeded();
		await expect(page.locator('#live [data-live]')).toContainText('held rather than recomputed');
		await expect(page.locator('#live [data-live]')).toContainText('(last measured)');
		await page.locator('#motion').click();
		await page.waitForFunction(() => window.__ocean.status().resting === false, null, { timeout: 10_000 });
		await expect(page.locator('#live [data-live]')).not.toContainText('paused');
	});
});
