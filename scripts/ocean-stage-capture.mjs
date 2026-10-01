// Screenshots the story steps through the dev route, one PNG per step (A3; not a twin), for looking
// at the story's steps side by side. The clock is frozen at t = 12 so a rerun draws the same seas.
// Chromium draws on the GPU (ANGLE Metal), as the browser tests do.
// Usage: node scripts/ocean-stage-capture.mjs <out-dir> [progress] [extra query] [steps]
//   extra query: overrides or adds route keys, e.g. "tier=Medium", "freeze=104.617" or "drift=120";
//     a non-empty one is added to each file name, so several runs can share a folder
//   steps: which steps, by number or id, e.g. "11" or "sine,into-3d,28" (default all of the
//     story's steps)
// Needs the page served on the port in OCEAN_PORT (default 8767), e.g. OCEAN_PORT=8768 npm run serve:ocean.
// Exits non-zero when the page throws or logs an error, so a broken capture cannot pass for a good one.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { STEP_COUNT, STEP_IDS, stepOf } from '../content/ocean/js/stages/steps.js';

const [outDir = 'stage-capture', progress = '0', extra = '', stepList = ''] = process.argv.slice(2);
const port = process.env.OCEAN_PORT || '8767';
// A step may be given by number or by id (stages/steps.js); an unknown id is reported like a bad number.
const toStep = (text) => (STEP_IDS.includes(text.trim()) ? stepOf(text.trim()) : Number(text));
const steps = stepList ? stepList.split(',').map(toStep) : Array.from({ length: STEP_COUNT }, (_, i) => i + 1);
if (!steps.every((step) => Number.isInteger(step) && step >= 1 && step <= STEP_COUNT)) {
	console.error(`steps must be a comma list of 1..${STEP_COUNT} or step ids, got ${stepList}`);
	process.exit(2);
}
const tag = extra ? `-${extra.replace(/[^A-Za-z0-9.=_-]+/g, '_')}` : '';
mkdirSync(outDir, { recursive: true });

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
	const page = await browser.newPage({ viewport: { width: 1366, height: 767 } });
	page.on('pageerror', (error) => {
		errors.push(`page error: ${error.message}`);
		console.error(`page error: ${error.message}`);
	});
	page.on('console', (message) => {
		if (message.type() === 'error') {
			errors.push(`console error: ${message.text()}`);
			console.error(`console error: ${message.text()}`);
		}
	});
	for (const step of steps) {
		const query = new URLSearchParams({ step: String(step), progress, freeze: '12', hud: '0' });
		for (const [key, value] of new URLSearchParams(extra)) {
			query.set(key, value);
		}
		await page.goto(`http://localhost:${port}/ocean/?${query}`);
		// The FFT steps need their cascades and painter warm; the teaching steps draw at once.
		const frames = step >= stepOf('jonswap') ? 90 : 20;
		await page.waitForFunction((target) => (window.__ocean?.status().frame ?? 0) > target, frames, { timeout: 180_000 });
		const file = join(outDir, `step-${String(step).padStart(2, '0')}${tag}.png`);
		await page.screenshot({ path: file });
		console.log(`wrote ${file}`);
	}
} catch (error) {
	errors.push(`capture failed: ${error.message}`);
	console.error(`capture failed: ${error.message}`);
} finally {
	await browser.close();
}
if (errors.length > 0) {
	console.error(`${errors.length} error(s) while capturing; the screenshots may not show the page as it should look`);
	process.exitCode = 1;
}
