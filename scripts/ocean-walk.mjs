// Walks the story in a real scroll and screenshots every step (piece C2, Task 15): at each step's
// hold (progress 0.25) and in its blend into the next (0.8), on a laptop (1366 x 767) and a phone
// (390 x 844, touch, the Medium tier by rule), and records each step's worst gap between frames.
// For the controller and Cole to look at; it judges nothing. Exits non-zero on a page error.
// Usage: node scripts/ocean-walk.mjs <out-dir>   (serve the page first on OCEAN_PORT, default 8767)
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STEP_IDS, stepOf } from '../content/ocean/js/stages/steps.js';

const [outDir = 'ocean-walk'] = process.argv.slice(2);
const port = process.env.OCEAN_PORT || '8767';
const SCREENS = [
	{ name: 'laptop', viewport: { width: 1366, height: 767 } },
	{ name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];
mkdirSync(outDir, { recursive: true });
const errors = [];
const gaps = {};
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
	for (const screen of SCREENS) {
		const page = await browser.newPage({ viewport: screen.viewport, isMobile: screen.isMobile ?? false, hasTouch: screen.hasTouch ?? false });
		page.on('pageerror', (error) => errors.push(`${screen.name}: ${error.message}`));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(`${screen.name}: ${message.text()}`);
		});
		await page.goto(`http://localhost:${port}/ocean/`);
		await page.waitForFunction(() => document.body.dataset.ocean === 'running' && window.__ocean.status().frame > 30, null, { timeout: 120_000 });
		for (const id of STEP_IDS) {
			for (const progress of [0.25, 0.8]) {
				await page.evaluate(([n, p]) => {
					const section = document.getElementById(`step-${n}`);
					const rect = section.getBoundingClientRect();
					const narrow = window.matchMedia('(max-width: 899.98px)').matches;
					window.scrollTo(0, rect.top + window.scrollY + p * rect.height - window.innerHeight * (narrow ? 0.75 : 0.5));
				}, [stepOf(id), progress]);
				const worst = await page.evaluate(() => new Promise((resolve) => {
					let last = performance.now();
					let most = 0;
					let frames = 0;
					const tick = (now) => {
						most = Math.max(most, now - last);
						last = now;
						frames += 1;
						if (frames < 90) requestAnimationFrame(tick);
						else resolve(most);
					};
					requestAnimationFrame(tick);
				}));
				gaps[`${screen.name} ${String(stepOf(id)).padStart(2, '0')} ${id} @${progress}`] = Math.round(worst);
				await page.screenshot({ path: join(outDir, `${screen.name}-${String(stepOf(id)).padStart(2, '0')}-${id}-${progress}.png`) });
			}
		}
		await page.close();
	}
} finally {
	await browser.close();
}
writeFileSync(join(outDir, 'frame-gaps.json'), `${JSON.stringify(gaps, null, '\t')}\n`);
console.log(JSON.stringify(gaps, null, '\t'));
if (errors.length > 0) {
	console.error(errors.join('\n'));
	process.exit(1);
}
