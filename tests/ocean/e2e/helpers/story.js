// Shared helpers for the ocean page's story tests (piece C). Not a spec file: Playwright runs only
// *.spec.js.
import { stepOf } from '../../../../content/ocean/js/stages/steps.js';

export function watchErrors(page) {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	return errors;
}

export async function oceanRunning(page, url = '/ocean/', frames = 5) {
	await page.goto(url);
	await page.waitForFunction((target) => document.body.dataset.ocean === 'running' && (window.__ocean?.status().frame ?? 0) > target, frames, { timeout: 90_000 });
}

export async function waitFrames(page, frames) {
	const start = await page.evaluate(() => window.__ocean.status().frame);
	await page.waitForFunction((target) => window.__ocean.status().frame >= target, start + frames, { timeout: 120_000 });
}

// Scrolls so the reading line sits `progress` of the way through step `step`, then waits for the
// story to read it.
export async function scrollToStep(page, step, progress = 0.3) {
	await page.evaluate(([n, p]) => {
		const section = document.getElementById(`step-${n}`);
		const rect = section.getBoundingClientRect();
		const narrow = window.matchMedia('(max-width: 899.98px)').matches;
		const line = window.innerHeight * (narrow ? 0.75 : 0.5);
		window.scrollTo(0, rect.top + window.scrollY + p * rect.height - line);
	}, [step, progress]);
	await page.waitForFunction((n) => {
		const reading = window.__page?.reading();
		return reading && reading.phase === 'step' && reading.step === n;
	}, step, { timeout: 30_000 });
}

export async function scrollToOpening(page) {
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForFunction(() => window.__page?.reading().phase === 'opening', null, { timeout: 30_000 });
}

// C2: scrollToStep by step id (stages/steps.js), so a test never hard-codes a step number.
export async function scrollToId(page, id, progress = 0.3) {
	await scrollToStep(page, stepOf(id), progress);
}

// C2 (Task 14): scrolls step `id` so the first `selector` inside it sits on screen with its top at
// 55% of the window's height (below the ocean on a phone), then waits for the story to read that
// step. A chart or inset draws only while on screen, and on a phone a step's figure sits below its
// paragraphs, so at a step's start (where scrollToId puts the reading line) it can still be below
// the bottom of the window. Throws if that scroll would leave the step.
export async function scrollToFigure(page, id, selector = 'figure') {
	const step = stepOf(id);
	// The scroll is redone on each poll until the story reads the step, so a late layout change (a
	// font or KaTeX arriving) can't strand it at a stale offset.
	await page.waitForFunction(([n, sel]) => {
		const figure = document.querySelector(`#step-${n} ${sel}`);
		if (!figure) throw new Error(`no ${sel} in step ${n}`);
		const top = figure.getBoundingClientRect().top;
		const want = window.innerHeight * 0.55;
		if (Math.abs(top - want) > 1) window.scrollTo(0, top + window.scrollY - want);
		const reading = window.__page?.reading();
		return reading && reading.phase === 'step' && reading.step === n;
	}, [step, selector], { timeout: 30_000, polling: 250 });
	const box = await page.evaluate(([n, sel]) => {
		const r = document.querySelector(`#step-${n} ${sel}`).getBoundingClientRect();
		return { top: r.top, bottom: r.bottom, height: window.innerHeight };
	}, [step, selector]);
	if (box.top < 0 || box.top >= box.height) throw new Error(`step ${step} ${selector} is off screen after the scroll: ${JSON.stringify(box)}`);
}

// C2 (lane B; moved here by Task 15 for the walk): End's smooth scroll can still be running when
// the last step is read (fix round 1: 35,858 of 37,678), and a Home pressed then is lost; and the
// finale grows about 570 px in the same frames the scroll lands, so the foot it was heading for
// moves (fix round 2). Wait for the page to rest, which is scrollY unchanged for 10 frames wherever
// that is; resting short of the foot, scroll to the foot as it now is and wait again.
export async function restAtFoot(page) {
	// Each call starts its own count (final review Minor 10): a count left from an earlier call on the
	// same page could otherwise end this wait at once.
	await page.evaluate(() => {
		window.__footRest = { y: -1, still: 0 };
	});
	await page.waitForFunction(() => {
		const state = window.__footRest;
		const y = window.scrollY;
		state.still = y === state.y ? state.still + 1 : 0;
		state.y = y;
		if (state.still < 10) return false;
		if (y + window.innerHeight >= document.documentElement.scrollHeight - 2) return true;
		window.scrollTo(0, document.documentElement.scrollHeight);
		state.still = 0;
		return false;
	}, null, { polling: 'raf', timeout: 30_000 });
}
