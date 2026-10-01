// The panels' controls in the browser (piece C, Task 6): each panel's sliders, toggles, New sea and grid
// choice set that panel's own step; URL knobs are held to the sliders; the live timing beside the
// many-waves step's wave count; the third layer's toggle on the phones' tier. Steps by id (piece C2,
// Task 0): `S.<id>` is the step's number, `at(id)` its section's selector.
import { test, expect } from '@playwright/test';
import { STEP_IDS, stepOf } from '../../../content/ocean/js/stages/steps.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { formatValue, toInput } from '../../../content/ocean/js/page/sliderModel.js';
import { oceanRunning, scrollToId, waitFrames, watchErrors } from './helpers/story.js';
import { story } from './helpers/stage.js';

const S = Object.fromEntries(STEP_IDS.map((id) => [id, stepOf(id)]));
const at = (id) => `#step-${stepOf(id)}`;
// A step's slider as its recipe declares it (lanes tune the values; Task 0 fix round 1, U4), and the
// text the control shows for a value.
const sliderOf = (stepId, id) => recipeFor(stepOf(stepId)).sliders.find((s) => s.id === id);
const shown = (stepId, id, value = sliderOf(stepId, id).default) => formatValue(sliderOf(stepId, id), value);


// Sets a range control's value the way a drag does (an input event), without scrolling it into view:
// Playwright cannot fill a range input, and scrolling would move the story.
function setRange(page, stepId, id, value) {
	return page.evaluate(([s, i, v]) => {
		const input = document.querySelector(`#step-${s} [data-slider="${i}"] input[type=range]`);
		input.value = String(v);
		input.dispatchEvent(new Event('input', { bubbles: true }));
	}, [stepOf(stepId), id, value]);
}

test.describe.configure({ timeout: 240_000 });

test("every panel builds its recipe's controls", async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await expect(page.locator(`${at('sine')} .control`)).toHaveCount(2);
	await expect(page.locator(`${at('sine')} .control label`)).toHaveText(['Height', 'Length']);
	await expect(page.locator(`${at('moving-sine')} .control label`)).toHaveText(['Speed']);
	await expect(page.locator(`${at('sine')} [data-slider="amplitude"] output`)).toHaveText(shown('sine', 'amplitude'));
	await expect(page.locator(`${at('into-3d')} [data-slider="wireframe"] input[role=switch]`)).toBeChecked();
	await expect(page.locator(`${at('unlit')} [data-slider="wireframe"] input[role=switch]`)).not.toBeChecked();
	await expect(page.locator(`${at('random-sea')} [data-slider="seed"] button.control-press`)).toHaveText('New sea');
	await expect(page.locator(`${at('fft')} [data-slider="transformN"] button[role=radio]`)).toHaveCount(4);
	await expect(page.locator(`${at('jonswap')} [data-slider="fetch"] output`)).toHaveText(shown('jonswap', 'fetch'));
	await expect(page.locator(`${at('finale')} .control`)).toHaveCount(0);
	await expect(page.locator(`${at('sine')} [data-slider="amplitude"] .swatch.t-amp`)).toHaveCount(1);
	// C2: the wireframe switch is not a term in any formula, so it has no swatch.
	await expect(page.locator(`${at('into-3d')} [data-slider="wireframe"] .swatch`)).toHaveCount(0);
	expect(errors).toEqual([]);
});

test('the height slider on the sine step raises the sine on screen', async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'sine', 0.05);
	await waitFrames(page, 10);
	const tallest = sliderOf('sine', 'amplitude').max;
	await setRange(page, 'sine', 'amplitude', tallest);
	await expect(page.locator(`${at('sine')} [data-slider="amplitude"] output`)).toHaveText(shown('sine', 'amplitude', tallest));
	await waitFrames(page, 10);
	expect((await story(page, 'surface')).maxAbsY).toBeGreaterThan(0.75 * tallest);
});

test('a slider on the next panel changes that step, not the one being read (Review Focus 4)', async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	await scrollToId(page, 'fourier', 0.2);
	await waitFrames(page, 5);
	const wind = sliderOf('jonswap', 'wind');
	const drag = [0.1, 0.3, 0.5, 0.8, 1].map((w) => wind.min + w * (wind.max - wind.min));
	for (const value of drag) await setRange(page, 'jonswap', 'wind', value);
	const state = await story(page, 'state');
	expect(state.step).toBe(S.fourier);
	expect(state.values[String(S.jonswap)].wind).toBe(wind.max);
	await expect(page.locator(`${at('jonswap')} [data-slider="wind"] output`)).toHaveText(shown('jonswap', 'wind', wind.max));
	await scrollToId(page, 'jonswap', 0.2);
	await page.waitForFunction((top) => Math.abs(window.__ocean.status().windSpeed - top) < 1e-9, wind.max, { timeout: 120_000 });
	expect(errors).toEqual([]);
});

test('New sea rolls the seed', async ({ page }) => {
	await oceanRunning(page);
	await scrollToId(page, 'random-sea', 0.2);
	const before = await page.locator(`${at('random-sea')} [data-slider="seed"] output`).textContent();
	await page.locator(`${at('random-sea')} [data-slider="seed"] button.control-press`).click();
	const after = await page.locator(`${at('random-sea')} [data-slider="seed"] output`).textContent();
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
	expect(await page.evaluate(() => window.__ocean.status().windSpeed)).toBeLessThanOrEqual(sliderOf('jonswap', 'wind').max);
});

// The ruling that replaced the static "about 27 ms": the many-waves step times the teaching bank's
// surface sum for the slider's wave count over the tier's real points, in this browser, off the frame.
test("the many-waves step's wave count shows a live timing of its sum, measured in this browser", async ({ page }) => {
	const errors = watchErrors(page);
	await oceanRunning(page);
	const vertices = await page.evaluate(() => window.__ocean.status().vertices);
	const points = vertices.toLocaleString('en-US');
	const timing = page.locator(`${at('many-waves')} [data-slider="waveCount"] .control-timing[data-copy-skip="live"]`);
	const reads = (count) => new RegExp(`^${count} wave${count === 1 ? '' : 's'} over ${points} points: \\d+(\\.\\d+)? ms in your browser just now$`);
	const count = sliderOf('many-waves', 'waveCount');
	await expect(timing).toHaveText(reads(count.default), { timeout: 60_000 });
	// Filled at load, but not announced until the visitor reaches the step.
	expect(await timing.getAttribute('aria-live')).toBeNull();
	await scrollToId(page, 'many-waves', 0.2);
	await expect(timing).toHaveAttribute('aria-live', 'polite');
	await setRange(page, 'many-waves', 'waveCount', count.max);
	await expect(timing).toHaveText(reads(count.max), { timeout: 60_000 });
	// The longest stretch the costliest measurement held the main thread for, in ms (it yields
	// between slices).
	expect(Number(await timing.getAttribute('data-longest-slice'))).toBeLessThan(30);
	await setRange(page, 'many-waves', 'waveCount', count.min);
	await expect(timing).toHaveText(reads(count.min), { timeout: 60_000 });
	expect(await timing.textContent()).not.toContain('Roblox');
	expect(errors).toEqual([]);
});

test('a toggle and a choice each tell the charts, with their own step', async ({ page }) => {
	await oceanRunning(page);
	await page.evaluate(() => {
		window.__events = [];
		document.addEventListener('ocean:slider', (event) => window.__events.push(event.detail));
	});
	await page.locator(`${at('fft')} [data-slider="transformN"] button[data-option="64"]`).dispatchEvent('click');
	await page.locator(`${at('into-3d')} [data-slider="wireframe"] input`).dispatchEvent('click');
	await expect(page.locator(`${at('fft')} [data-slider="transformN"] button[data-option="64"]`)).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator(`${at('into-3d')} [data-slider="wireframe"] output`)).toHaveText('Off');
	// Choosing what is already chosen changes nothing, so it tells nobody.
	await page.locator(`${at('fft')} [data-slider="transformN"] button[data-option="64"]`).dispatchEvent('click');
	const events = await page.evaluate(() => window.__events);
	expect(events).toEqual([{ step: S.fft, id: 'transformN', value: 64 }, { step: S['into-3d'], id: 'wireframe', value: false }]);
});

// Review: below about 25 km one arrow position on the log track is less than the slider's 100 m
// step, so the snap undid every key press. The value must move, and be read out as fetch, not as
// a track position.
test('the fetch slider moves under the arrow keys at both ends, and reads out its value', async ({ page }) => {
	await oceanRunning(page);
	const input = page.locator(`${at('jonswap')} [data-slider="fetch"] input`);
	const output = page.locator(`${at('jonswap')} [data-slider="fetch"] output`);
	const metres = async () => Number((await output.textContent()).replace(/[^0-9]/g, ''));
	const fetch = sliderOf('jonswap', 'fetch');
	await expect(input).toHaveAttribute('aria-valuetext', shown('jonswap', 'fetch'));
	await setRange(page, 'jonswap', 'fetch', 0);
	await expect(output).toHaveText(shown('jonswap', 'fetch', fetch.min));
	await input.focus();
	await page.keyboard.press('ArrowRight');
	expect(await metres()).toBeGreaterThan(fetch.min);
	await expect(input).toHaveAttribute('aria-valuetext', await output.textContent());
	await page.keyboard.press('ArrowLeft');
	await expect(output).toHaveText(shown('jonswap', 'fetch', fetch.min));
	await page.keyboard.press('End');
	await expect(output).toHaveText(shown('jonswap', 'fetch', fetch.max));
	// The default's track position (80,100 m once snapped, at A3's 80,000 m default).
	await setRange(page, 'jonswap', 'fetch', toInput(fetch, fetch.default));
	expect(Math.abs((await metres()) - fetch.default)).toBeLessThanOrEqual(500);
	await input.focus();
	// Down into the low end where the snap used to undo each press: five times the shortest fetch
	// (25 km at A3's 5 km minimum).
	const low = 5 * fetch.min;
	let presses = 0;
	while ((await metres()) >= low && presses < 400) {
		await page.keyboard.press('ArrowLeft');
		presses += 1;
	}
	expect(await metres(), `after ${presses} presses`).toBeLessThan(low);
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
	const radio = (n) => page.locator(`${at('fft')} [data-slider="transformN"] button[data-option="${n}"]`);
	const tabStops = () => page.locator(`${at('fft')} [data-slider="transformN"] button[tabindex="0"]`);
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
	// As ARIA's radio group has it (final review, parked item): Up goes to the previous option and
	// Down to the next, like Left and Right (a range slider's Up goes up instead).
	await page.keyboard.press('ArrowUp');
	await expect(radio(32)).toHaveAttribute('aria-checked', 'true');
	await expect(radio(32)).toBeFocused();
	await page.keyboard.press('ArrowDown');
	await expect(radio(64)).toHaveAttribute('aria-checked', 'true');
	await expect(tabStops()).toHaveCount(1);
	await expect(radio(64)).toHaveAttribute('tabindex', '0');
	expect((await page.evaluate(() => window.__ocean.story.state())).values[String(S.fft)].transformN).toBe(64);
});

// A value the director refuses (the engine would not take it) is logged and the control goes back
// to the value the director holds, with no event. Mounted on a story that refuses everything.
test('a refused change is logged and the control shows the held value again', async ({ page }) => {
	await oceanRunning(page);
	const chop = sliderOf('gerstner', 'chop');
	const result = await page.evaluate(async (declared) => {
		const { mountControls } = await import('/ocean/js/ui/controls.js');
		const slider = { ...declared, value: declared.default, available: true };
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
			input.value = String(slider.min);
			input.dispatchEvent(new Event('input', { bubbles: true }));
			return { logged, events, position: input.value, shown: root.querySelector('output').textContent };
		} finally {
			console.error = original;
			root.remove();
		}
	}, chop);
	expect(result.logged).toEqual(['[ocean] step 5 refused chop']);
	expect(result.events).toEqual([]);
	expect(result.position).toBe(String(chop.default));
	expect(result.shown).toBe(formatValue(chop, chop.default));
});

// The clamp is the story's: the dev route (?step=<id>) takes the URL's knobs as they are. A wind
// 5 m/s past the story's wind slider builds a taller sea on the dev route than the slider's top
// (its bounds), and never warns about the slider.
test('the dev route is not clamped to the sliders', async ({ page }) => {
	const lines = [];
	page.on('console', (message) => lines.push(message.text()));
	const boundsFor = async (url) => {
		lines.length = 0;
		await page.goto(url);
		await page.waitForFunction(() => (window.__ocean?.status().frame ?? 0) > 5, null, { timeout: 90_000 });
		return { bounds: lines.find((line) => line.includes(' bounds='))?.match(/bounds=(\S+)/)?.[1], warned: lines.some((line) => line.includes("slider's")) };
	};
	const { max } = sliderOf('jonswap', 'wind');
	const thirty = await boundsFor(`/ocean/?step=jonswap&wind=${max + 5}`);
	const top = await boundsFor(`/ocean/?step=jonswap&wind=${max}`);
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
		const layers = at('layers');
		await expect(page.locator(`${layers} [data-slider="layer3"] input`)).toBeDisabled();
		await expect(page.locator(`${layers} [data-slider="layer3"] input`)).not.toBeChecked();
		await expect(page.locator(`${layers} [data-slider="layer3"] output`)).toHaveText('Off');
		await expect(page.locator(`${layers} [data-slider="layer3"] .control-note`)).toHaveText("Not on this device's lighter tier");
		await expect(page.locator(`${layers} [data-slider="layer3"] input`)).toHaveAttribute('aria-describedby', `control-${S.layers}-layer3-note`);
		await expect(page.locator(`#control-${S.layers}-layer3-note`)).toHaveText("Not on this device's lighter tier");
		await expect(page.locator(`${layers} [data-slider="layer1"] input`)).not.toHaveAttribute('aria-describedby', /./);
		await expect(page.locator(`${layers} [data-slider="layer1"] input`)).toBeEnabled();
		await expect(page.locator(`${layers} [data-slider="layer2"] input`)).toBeEnabled();
	});
});
