// Shared helpers for the ocean page's story tests (piece C). Not a spec file: Playwright runs only
// *.spec.js.
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
