// Shared helpers for the C2 browser tests (piece C2, Task 0). Not a spec file. Every lane's spec
// imports these rather than copying them, so a fix lands everywhere. watchErrors and waitFrames are
// the story helpers' own (helpers/story.js), re-exported here.
export { watchErrors, waitFrames } from './story.js';
import { waitFrames } from './story.js';

// Loads the page (any query, e.g. 'step=into-3d&freeze=12') and waits until the ocean has drawn
// `frames` frames.
export async function load(page, query, frames = 20) {
	await page.goto(`/ocean/?${query}`);
	await page.waitForFunction((target) => (window.__ocean?.status().frame ?? 0) > target, frames, { timeout: 120_000 });
}

// A dev-route hook (window.__ocean.stage[name]) or a story hook (window.__ocean.story[name]).
export const stage = (page, name, ...args) => page.evaluate(([n, a]) => window.__ocean.stage[n](...a), [name, args]);
export const story = (page, name, ...args) => page.evaluate(([n, a]) => window.__ocean.story[n](...a), [name, args]);

// The canvas (or its lower half) as a 64-wide luminance grid, read inside a frame callback after the
// page's own render: the renderer does not keep its drawing buffer between frames.
export async function grid(page, lower = false) {
	return page.evaluate((half) => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const copy = document.createElement('canvas');
		copy.width = 64;
		copy.height = half ? 18 : 36;
		const context = copy.getContext('2d');
		const top = half ? source.height / 2 : 0;
		context.drawImage(source, 0, top, source.width, source.height - top, 0, 0, copy.width, copy.height);
		const data = context.getImageData(0, 0, copy.width, copy.height).data;
		const out = [];
		for (let i = 0; i < data.length; i += 4) out.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
		resolve(out);
	})), lower);
}

export const meanDiff = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
export const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
// The standard deviation: how much a picture varies (a formless blob varies little).
export const spread = (values) => {
	const m = mean(values);
	return Math.sqrt(mean(values.map((value) => (value - m) ** 2)));
};

export async function lowerHalfMotion(page, frames) {
	const before = await grid(page, true);
	await waitFrames(page, frames);
	return meanDiff(before, await grid(page, true));
}
