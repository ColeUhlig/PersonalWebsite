// Screenshots the ocean page at the three Studio camera shots, frozen at t = 12 with the rings
// pinned to the origin as the Edit-mode preview pins them, at Studio's 1366 x 767 viewport.
// Usage: node scripts/ocean-capture.mjs <out-dir> [extra query, e.g. "scale=4&whitecap=0.55"]
// Needs the page served on :8767 (npm run serve:ocean).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = 'capture', extra = ''] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 767 } });
for (const cam of ['deck', 'high', 'crest']) {
	const query = `?freeze=12&cam=${cam}&focus=origin&hud=0${extra ? `&${extra}` : ''}`;
	await page.goto(`http://localhost:8767/ocean/${query}`);
	await page.waitForFunction(() => {
		const s = window.__ocean?.status();
		return s && s.painterReady && s.frame > 150;
	}, null, { timeout: 180_000 });
	const file = join(outDir, `web-${cam}.png`);
	await page.screenshot({ path: file });
	console.log(`wrote ${file}`);
}
await browser.close();
