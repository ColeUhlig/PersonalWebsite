// The panels' controls in the browser (piece C, Task 6): each panel's sliders, toggles, New sea and grid
// choice set that panel's own step; URL knobs are held to the sliders; the live timing beside step 3's
// wave count; the third layer's toggle on the phones' tier.
import { test, expect } from '@playwright/test';
import { oceanRunning, scrollToStep, waitFrames, watchErrors } from './helpers/story.js';

const story = (page, name, ...args) => page.evaluate(([n, a]) => window.__ocean.story[n](...a), [name, args]);

// Sets a range control's value the way a drag does (an input event), without scrolling it into view:
// Playwright cannot fill a range input, and scrolling would move the story.
function setRange(page, step, id, value) {
	return page.evaluate(([s, i, v]) => {
		const input = document.querySelector(`#step-${s} [data-slider="${i}"] input[type=range]`);
		input.value = String(v);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, [step, id, value]);
}

test.describe.configure({ timeout: 240_000 });

test("every panel builds its recipe's controls", async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await expect(page.locator('#step-2 .control')).toHaveCount(3);
	await expect(page.locator('#step-2 .control label')).toHaveText(['Height', 'Length', 'Speed']);
	await expect(page.locator('#step-2 [data-slider="amplitude"] output')).toHaveText('2.50 studs');
	await expect(page.locator('#step-1 [data-slider="wireframe"] input[role=switch]')).toBeChecked();
	await expect(page.locator('#step-8 [data-slider="seed"] button.control-press')).toHaveText('New sea');
	await expect(page.locator('#step-9 [data-slider="transformN"] button[role=radio]')).toHaveCount(4);
	await expect(page.locator('#step-7 [data-slider="fetch"] output')).toHaveText('80,000 m');
	await expect(page.locator('#step-13 .control')).toHaveCount(0);
	await expect(page.locator('#step-2 [data-slider="amplitude"] .swatch.t-amp')).toHaveCount(1);
	expect(errors).toEqual([]);
});

test('the height slider on step 2 raises the sine on screen', async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 2, 0.05);
	await waitFrames(page, 10);
	await setRange(page, 2, 'amplitude', 4);
	await expect(page.locator('#step-2 [data-slider="amplitude"] output')).toHaveText('4.00 studs');
	await waitFrames(page, 10);
	expect((await story(page, 'surface')).maxAbsY).toBeGreaterThan(3);
});

test('a slider on the next panel changes that step, not the one being read (Review Focus 4)', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToStep(page, 6, 0.2);
	await waitFrames(page, 5);
	for (const value of [5, 9, 14, 18, 22]) await setRange(page, 7, 'wind', value);
	const state = await story(page, 'state');
	expect(state.step).toBe(6);
	expect(state.values['7'].wind).toBe(22);
	await expect(page.locator('#step-7 [data-slider="wind"] output')).toHaveText('22.0 m/s');
	await scrollToStep(page, 7, 0.2);
	await page.waitForFunction(() => Math.abs(window.__ocean.status().windSpeed - 22) < 1e-9, null, { timeout: 120_000 });
	expect(errors).toEqual([]);
});

test('New sea rolls the seed', async ({ page }) => {
	await oceanRunning(page);
	await scrollToStep(page, 8, 0.2);
	const before = await page.locator('#step-8 [data-slider="seed"] output').textContent();
	await page.locator('#step-8 [data-slider="seed"] button.control-press').click();
	const after = await page.locator('#step-8 [data-slider="seed"] output').textContent();
	expect(after).not.toBe(before);
	const seed = Number(after.replace('Sea ', ''));
	await page.waitForFunction((s) => window.__ocean.status().seed === s, seed, { timeout: 120_000 });
});

test("URL knobs past a slider's range are clamped into it, with a warning", async ({ page }) => {
	const warnings = [];
	page.on('console', (message) => {
		if (message.type() === 'warning') warnings.push(message.text());
	});
	await oceanRunning(page, '/ocean/?wind=90&chop=50');
	expect(warnings.some((w) => w.includes('wind=90'))).toBe(true);
	expect(warnings.some((w) => w.includes('chop=50'))).toBe(true);
	expect(await page.evaluate(() => window.__ocean.status().windSpeed)).toBeLessThanOrEqual(25);
});

// The ruling that replaced the static "about 27 ms": step 3 times the teaching bank's surface sum
// for the slider's wave count over the tier's real points, in this browser, off the frame.
test("step 3's wave count shows a live timing of its sum, measured in this browser", async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	const vertices = await page.evaluate(() => window.__ocean.status().vertices);
	const points = vertices.toLocaleString('en-US');
	const timing = page.locator('#step-3 [data-slider="waveCount"] .control-timing[data-copy-skip="live"]');
	const reads = (count) => new RegExp(`^${count} wave${count === 1 ? '' : 's'} over ${points} points: \\d+(\\.\\d+)? ms in your browser just now$`);
	await expect(timing).toHaveText(reads(8), { timeout: 60_000 });
	await setRange(page, 3, 'waveCount', 32);
	await expect(timing).toHaveText(reads(32), { timeout: 60_000 });
	await setRange(page, 3, 'waveCount', 1);
	await expect(timing).toHaveText(reads(1), { timeout: 60_000 });
	expect(await timing.textContent()).not.toContain('Roblox');
	// The longest stretch the measurement held the main thread for, in ms (it yields between slices).
	expect(Number(await timing.getAttribute('data-longest-slice'))).toBeLessThan(30);
	expect(errors).toEqual([]);
});

test('a toggle and a choice each tell the charts, with their own step', async ({ page }) => {
	await oceanRunning(page);
	await page.evaluate(() => {
		window.__events = [];
		document.addEventListener('ocean:slider', (event) => window.__events.push(event.detail));
	});
	await page.locator('#step-9 [data-slider="transformN"] button[data-option="64"]').dispatchEvent('click');
	await page.locator('#step-1 [data-slider="wireframe"] input').dispatchEvent('click');
	await expect(page.locator('#step-9 [data-slider="transformN"] button[data-option="64"]')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('#step-1 [data-slider="wireframe"] output')).toHaveText('Off');
	const events = await page.evaluate(() => window.__events);
	expect(events).toEqual([{ step: 9, id: 'transformN', value: 64 }, { step: 1, id: 'wireframe', value: false }]);
});

test('without WebGL there are no controls to confuse anyone', async ({ page }) => {
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
			return kind === 'webgl' || kind === 'webgl2' ? null : original.call(this, kind, ...rest);
		};
	});
	await page.goto('/ocean/');
	await expect(page.locator('body')).toHaveAttribute('data-ocean', 'unavailable');
	await expect(page.locator('.control')).toHaveCount(0);
});

test.describe('on a phone, on the lighter tier by rule', () => {
	test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

	test('the third layer toggle is disabled and says why (Review Focus 5)', async ({ page }) => {
		await oceanRunning(page);
		expect(await page.evaluate(() => window.__ocean.status().tierReason)).toBe('phone rule');
		await expect(page.locator('#step-10 [data-slider="layer3"] input')).toBeDisabled();
		await expect(page.locator('#step-10 [data-slider="layer3"] input')).not.toBeChecked();
		await expect(page.locator('#step-10 [data-slider="layer3"] output')).toHaveText('Off');
		await expect(page.locator('#step-10 [data-slider="layer3"] .control-note')).toHaveText("Not on this device's lighter tier");
		await expect(page.locator('#step-10 [data-slider="layer1"] input')).toBeEnabled();
		await expect(page.locator('#step-10 [data-slider="layer2"] input')).toBeEnabled();
	});
});
