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
	// Filled at load, but not announced until the visitor reaches step 3.
	expect(await timing.getAttribute('aria-live')).toBeNull();
	await scrollToStep(page, 3, 0.2);
	await expect(timing).toHaveAttribute('aria-live', 'polite');
	await setRange(page, 3, 'waveCount', 32);
	await expect(timing).toHaveText(reads(32), { timeout: 60_000 });
	// The longest stretch the costliest measurement held the main thread for, in ms (it yields
	// between slices).
	expect(Number(await timing.getAttribute('data-longest-slice'))).toBeLessThan(30);
	await setRange(page, 3, 'waveCount', 1);
	await expect(timing).toHaveText(reads(1), { timeout: 60_000 });
	expect(await timing.textContent()).not.toContain('Roblox');
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
	// Choosing what is already chosen changes nothing, so it tells nobody.
	await page.locator('#step-9 [data-slider="transformN"] button[data-option="64"]').dispatchEvent('click');
	const events = await page.evaluate(() => window.__events);
	expect(events).toEqual([{ step: 9, id: 'transformN', value: 64 }, { step: 1, id: 'wireframe', value: false }]);
});

// Review: below about 25 km one arrow position on the log track is less than the slider's 100 m
// step, so the snap undid every key press. The value must move, and be read out as fetch, not as
// a track position.
test('the fetch slider moves under the arrow keys at both ends, and reads out its value', async ({ page }) => {
	await oceanRunning(page);
	const input = page.locator('#step-7 [data-slider="fetch"] input');
	const output = page.locator('#step-7 [data-slider="fetch"] output');
	const metres = async () => Number((await output.textContent()).replace(/[^0-9]/g, ''));
	await expect(input).toHaveAttribute('aria-valuetext', '80,000 m');
	await setRange(page, 7, 'fetch', 0);
	await expect(output).toHaveText('5,000 m');
	await input.focus();
	await page.keyboard.press('ArrowRight');
	expect(await metres()).toBeGreaterThan(5000);
	await expect(input).toHaveAttribute('aria-valuetext', await output.textContent());
	await page.keyboard.press('ArrowLeft');
	await expect(output).toHaveText('5,000 m');
	await page.keyboard.press('End');
	await expect(output).toHaveText('200,000 m');
	// Track position 752 is the default's neighbourhood (80,100 m once snapped).
	await setRange(page, 7, 'fetch', 752);
	expect(Math.abs((await metres()) - 80000)).toBeLessThanOrEqual(500);
	await input.focus();
	let presses = 0;
	while ((await metres()) >= 25300 && presses < 400) {
		await page.keyboard.press('ArrowLeft');
		presses += 1;
	}
	expect(await metres(), `after ${presses} presses`).toBeLessThan(25300);
});

test('the grid-size choice is a radio group: one tab stop, arrows and Home/End move the choice', async ({ page }) => {
	await oceanRunning(page);
	// The FFT timing chart switches 64 off on a machine too slow to time it (ui/charts.js), and a
	// loaded test machine can be; a fast stand-in timing keeps every option on, so this test is about
	// the keys alone.
	await page.evaluate(() => window.__charts.useTransforms((n) => {
		const cells = n * n;
		const naiveMs = cells * cells * 1.7e-6;
		return { n, naiveMs, fftMs: naiveMs / ((cells / Math.log2(n)) * 0.6), speedup: (cells / Math.log2(n)) * 0.6, operations: { naive: cells * cells, fft: cells * Math.log2(n) }, maxDifference: 1e-14, batches: { naive: 3, fft: 5 } };
	}));
	const radio = (n) => page.locator(`#step-9 [data-slider="transformN"] button[data-option="${n}"]`);
	const tabStops = () => page.locator('#step-9 [data-slider="transformN"] button[tabindex="0"]');
	await expect(tabStops()).toHaveCount(1);
	await expect(radio(32)).toHaveAttribute('tabindex', '0');
	await radio(32).focus();
	await page.keyboard.press('ArrowRight');
	await expect(radio(64)).toHaveAttribute('aria-checked', 'true');
	await expect(radio(64)).toBeFocused();
	await page.keyboard.press('ArrowRight');
	await expect(radio(8)).toHaveAttribute('aria-checked', 'true');
	await page.keyboard.press('End');
	await expect(radio(64)).toHaveAttribute('aria-checked', 'true');
	await page.keyboard.press('Home');
	await expect(radio(8)).toHaveAttribute('aria-checked', 'true');
	await expect(radio(8)).toBeFocused();
	await page.keyboard.press('ArrowLeft');
	await expect(radio(64)).toHaveAttribute('aria-checked', 'true');
	await expect(tabStops()).toHaveCount(1);
	await expect(radio(64)).toHaveAttribute('tabindex', '0');
	expect((await page.evaluate(() => window.__ocean.story.state())).values['9'].transformN).toBe(64);
});

// A value the director refuses (the engine would not take it) is logged and the control goes back
// to the value the director holds, with no event. Mounted on a story that refuses everything.
test('a refused change is logged and the control shows the held value again', async ({ page }) => {
	await oceanRunning(page);
	const result = await page.evaluate(async () => {
		const { mountControls } = await import('/ocean/js/ui/controls.js');
		const slider = { id: 'chop', label: 'Choppiness', kind: 'range', min: 0, max: 2, step: 0.01, default: 1.3, unit: '', scale: 'linear', value: 1.3, available: true };
		const root = document.createElement('div');
		document.body.append(root);
		const logged = [];
		const original = console.error;
		console.error = (...args) => logged.push(String(args[0]));
		const events = [];
		try {
			mountControls({
				root,
				step: 5,
				story: { sliders: () => [slider], setSlider: () => { throw new RangeError('refused'); }, press: () => 0 },
				onChange: (detail) => events.push(detail),
			});
			const input = root.querySelector('input[type=range]');
			input.value = '0.2';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			return { logged, events, position: input.value, shown: root.querySelector('output').textContent };
		} finally {
			console.error = original;
			root.remove();
		}
	});
	expect(result.logged).toEqual(['[ocean] step 5 refused chop']);
	expect(result.events).toEqual([]);
	expect(result.position).toBe('1.3');
	expect(result.shown).toBe('1.30');
});

// The clamp is the story's: the dev route (?step=N) takes the URL's knobs as they are. Wind 30 is
// past the story's wind slider, so the dev route builds a taller sea for it than for 25 (its
// bounds), and never warns about the slider.
test('the dev route is not clamped to the sliders', async ({ page }) => {
	const lines = [];
	page.on('console', (message) => lines.push(message.text()));
	const boundsFor = async (url) => {
		lines.length = 0;
		await page.goto(url);
		await page.waitForFunction(() => (window.__ocean?.status().frame ?? 0) > 5, null, { timeout: 90_000 });
		return { bounds: lines.find((line) => line.includes(' bounds='))?.match(/bounds=(\S+)/)?.[1], warned: lines.some((line) => line.includes("slider's")) };
	};
	const thirty = await boundsFor('/ocean/?step=7&wind=30');
	const top = await boundsFor('/ocean/?step=7&wind=25');
	expect(thirty.warned).toBe(false);
	expect(thirty.bounds).toBeTruthy();
	expect(thirty.bounds).not.toBe(top.bounds);
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
		await expect(page.locator('#step-10 [data-slider="layer3"] input')).toHaveAttribute('aria-describedby', 'control-10-layer3-note');
		await expect(page.locator('#control-10-layer3-note')).toHaveText("Not on this device's lighter tier");
		await expect(page.locator('#step-10 [data-slider="layer1"] input')).not.toHaveAttribute('aria-describedby', /./);
		await expect(page.locator('#step-10 [data-slider="layer1"] input')).toBeEnabled();
		await expect(page.locator('#step-10 [data-slider="layer2"] input')).toBeEnabled();
	});
});
