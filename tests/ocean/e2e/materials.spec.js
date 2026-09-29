import { test, expect } from '@playwright/test';

async function settle(page, url) {
	await page.goto(url);
	await page.waitForFunction(() => {
		const s = window.__ocean?.status();
		return s && s.painterReady && s.frame > 120;
	}, null, { timeout: 90_000 });
}

// Read in a frame callback, after the page's own render in that frame: the renderer does not
// preserve its drawing buffer, so a read between frames sees a cleared canvas.
async function luminanceGrid(page) {
	return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
		const source = document.getElementById('ocean');
		const copy = document.createElement('canvas');
		copy.width = 48;
		copy.height = 27;
		const context = copy.getContext('2d');
		context.drawImage(source, 0, 0, 48, 27);
		const data = context.getImageData(0, 0, 48, 27).data;
		const grid = [];
		for (let i = 0; i < data.length; i += 4) grid.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
		resolve(grid);
	})));
}

function correlation(a, b) {
	const n = a.length;
	const ma = a.reduce((s, v) => s + v, 0) / n;
	const mb = b.reduce((s, v) => s + v, 0) / n;
	let num = 0;
	let da = 0;
	let db = 0;
	for (let i = 0; i < n; i++) {
		num += (a[i] - ma) * (b[i] - mb);
		da += (a[i] - ma) ** 2;
		db += (b[i] - mb) ** 2;
	}
	return num / Math.sqrt(da * db);
}

test('the painted maps reach the textures and the glow reaches the materials', async ({ page }) => {
	await settle(page, '/ocean/?freeze=12&cam=deck&focus=origin&hud=0');
	const probe = await page.evaluate(() => window.__ocean.materialsProbe());
	expect(probe.colourUploads).toBeGreaterThanOrEqual(4);
	expect(probe.maskUploads).toBeGreaterThanOrEqual(1);
	expect(probe.normalUploads).toBeGreaterThanOrEqual(1);
	expect(probe.roughnessUploads).toBeGreaterThanOrEqual(5);
	expect(probe.maxEmissiveIntensity).toBeGreaterThan(0);
	expect(probe.distinctColourTexels).toBeGreaterThan(8);
});

test('the normal map lights the same side of a slope as the vertex normals (calibration)', async ({ page }) => {
	await settle(page, '/ocean/?freeze=12&cam=high&focus=origin&hud=0&calibrate=vertex');
	const vertex = await luminanceGrid(page);
	await settle(page, '/ocean/?freeze=12&cam=high&focus=origin&hud=0&calibrate=map');
	const map = await luminanceGrid(page);
	const r = correlation(vertex, map);
	console.log(`[calibration] luminance correlation vertex vs map: ${r.toFixed(3)}`);
	expect(r).toBeGreaterThan(0.5);
});
