// Screenshots every story step through the dev route, one PNG per step (A3), for looking at the
// thirteen steps side by side. The clock is frozen at t = 12 so a rerun draws the same seas.
// Chromium draws on the GPU (ANGLE Metal), as the browser tests do.
// Usage: node scripts/ocean-stage-capture.mjs <out-dir> [progress] [extra query, e.g. "tier=Medium"]
// Needs the page served on the port in OCEAN_PORT (default 8767), e.g. OCEAN_PORT=8768 npm run serve:ocean.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = 'stage-capture', progress = '0', extra = ''] = process.argv.slice(2);
const port = process.env.OCEAN_PORT || '8767';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 767 } });
page.on('pageerror', (error) => console.error(`page error: ${error.message}`));
page.on('console', (message) => {
	if (message.type() === 'error') console.error(`console error: ${message.text()}`);
});
for (let step = 1; step <= 13; step++) {
	const query = `?step=${step}&progress=${progress}&freeze=12&hud=0${extra ? `&${extra}` : ''}`;
	await page.goto(`http://localhost:${port}/ocean/${query}`);
	// The FFT steps need their cascades and painter warm; the Gerstner steps draw at once.
	const frames = step >= 7 ? 90 : 20;
	await page.waitForFunction((target) => (window.__ocean?.status().frame ?? 0) > target, frames, { timeout: 180_000 });
	const file = join(outDir, `step-${String(step).padStart(2, '0')}.png`);
	await page.screenshot({ path: file });
	console.log(`wrote ${file}`);
}
await browser.close();
