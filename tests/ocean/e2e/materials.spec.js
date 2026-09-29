import { test, expect } from '@playwright/test';

const CALIBRATION_SHOT = 'freeze=12&cam=high&focus=origin&hud=0';
// The luminance grid the calibration reads, finer than the probe tests' so the ripples register.
const GRID_W = 192;
const GRID_H = 108;
// A row takes part when the vertex normals moved its mean luminance by more than this from the
// no-map baseline: the sky rows and the horizon quads (flat in both page loads) do not.
const ROW_SIGNAL = 1;
// The winning sign must beat the other by this much and correlate above MIN_R.
const MIN_MARGIN = 0.2;
const MIN_R = 0.5;

async function settle(page, url) {
	await page.goto(url);
	await page.waitForFunction(() => {
		const s = window.__ocean?.status();
		return s && s.painterReady && s.frame > 120;
	}, null, { timeout: 90_000 });
}

// Waits `frames` frames (so a changed uniform has been drawn), then reads the canvas in a frame
// callback, after the page's own render in that frame: the renderer does not preserve its drawing
// buffer, so a read between frames sees a cleared canvas.
async function luminanceGrid(page, frames = 3) {
	return page.evaluate(([w, h, frames]) => new Promise((resolve) => {
		let left = frames;
		const tick = () => {
			left -= 1;
			if (left > 0) {
				requestAnimationFrame(tick);
				return;
			}
			const copy = document.createElement('canvas');
			copy.width = w;
			copy.height = h;
			const context = copy.getContext('2d');
			context.drawImage(document.getElementById('ocean'), 0, 0, w, h);
			const data = context.getImageData(0, 0, w, h).data;
			const grid = [];
			for (let i = 0; i < data.length; i += 4) grid.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
			resolve(grid);
		};
		requestAnimationFrame(tick);
	}), [GRID_W, GRID_H, frames]);
}

async function gridAtScale(page, x, y) {
	await page.evaluate(([x, y]) => window.__ocean.setNormalScale(x, y), [x, y]);
	return luminanceGrid(page);
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

// `image - baseline` over the chosen rows, flattened.
function signal(image, baseline, rows) {
	const out = [];
	for (const row of rows) {
		for (let x = 0; x < GRID_W; x++) out.push(image[row * GRID_W + x] - baseline[row * GRID_W + x]);
	}
	return out;
}

const meanAbs = (values) => values.reduce((s, v) => s + Math.abs(v), 0) / values.length;

test('the painted maps reach the textures and the glow reaches the materials', async ({ page }) => {
	await settle(page, '/ocean/?freeze=12&cam=deck&focus=origin&hud=0');
	const probe = await page.evaluate(() => window.__ocean.materialsProbe());
	expect(probe.colourUploads).toBeGreaterThanOrEqual(4);
	expect(probe.maskUploads).toBeGreaterThanOrEqual(1);
	expect(probe.normalUploads).toBeGreaterThanOrEqual(1);
	expect(probe.roughnessUploads).toBeGreaterThanOrEqual(5);
	expect(probe.maxEmissiveIntensity).toBeGreaterThan(0);
	expect(probe.distinctColourTexels).toBeGreaterThan(8);
	expect(probe.colourBound).toBe(true);
	expect(probe.normalBound).toBe(true);
	expect(probe.maskBound).toBe(true);
	expect(probe.roughnessBound).toBe(true);
	expect(probe.normalScaleShared).toBe(true);
});

test('the uploads refuse buffers of the wrong size, as Materials.luau does', async ({ page }) => {
	await page.goto('/ocean/?hud=0');
	const results = await page.evaluate(async () => {
		const { createMaterials } = await import('/ocean/js/render/materials.js');
		const renderer = { capabilities: { getMaxAnisotropy: () => 1 } };
		const oceanFor = (calibrate) => ({
			config: { deep: [8, 46, 72], subsurface: [28, 168, 156], roughness: [0.15, 0.2, 0.3, 0.45, 0.6], calibrate },
			preset: { rings: [{}, {}, {}, {}, {}] },
			surface: { patches: [{ ring: 1 }, { ring: 5 }] },
			horizon: { quads: [{}] },
		});
		const attempt = (fn) => {
			try {
				fn();
				return 'ok';
			} catch (error) {
				return error.message;
			}
		};
		const { sink } = createMaterials(oceanFor(null), renderer);
		const calibrated = createMaterials(oceanFor('map'), renderer).sink;
		const bytes = (n) => new Uint8Array(n);
		return {
			bandOk: attempt(() => sink.uploadColourBand(2, bytes(512 * 128 * 4))),
			bandShort: attempt(() => sink.uploadColourBand(2, bytes(512 * 127 * 4))),
			maskOk: attempt(() => sink.uploadMaskOrNormal(2, bytes(128 * 128 * 4))),
			maskShort: attempt(() => sink.uploadMaskOrNormal(2, bytes(100))),
			normalOk: attempt(() => sink.uploadMaskOrNormal(3, bytes(128 * 128 * 4))),
			normalWhole: attempt(() => sink.uploadMaskOrNormal(3, bytes(512 * 512 * 4))),
			calibratedOk: attempt(() => calibrated.uploadMaskOrNormal(3, bytes(512 * 512 * 4))),
			calibratedBlock: attempt(() => calibrated.uploadMaskOrNormal(3, bytes(128 * 128 * 4))),
			slot: attempt(() => sink.uploadMaskOrNormal(1, bytes(128 * 128 * 4))),
			roughnessOk: attempt(() => sink.uploadRoughness(5, bytes(128 * 128 * 4))),
			roughnessLong: attempt(() => sink.uploadRoughness(5, bytes(128 * 129 * 4))),
		};
	});
	expect(results).toEqual({
		bandOk: 'ok',
		bandShort: `colour band 2 was given ${512 * 127 * 4} bytes, expected ${512 * 128 * 4}`,
		maskOk: 'ok',
		maskShort: `the emissive mask was given 100 bytes, expected ${128 * 128 * 4}`,
		normalOk: 'ok',
		normalWhole: `the normal block was given ${512 * 512 * 4} bytes, expected ${128 * 128 * 4}`,
		calibratedOk: 'ok',
		calibratedBlock: `the normal block was given ${128 * 128 * 4} bytes, expected ${512 * 512 * 4}`,
		slot: 'uploadMaskOrNormal was given an unknown map slot: 1',
		roughnessOk: 'ok',
		roughnessLong: `ring 5 roughness was given ${128 * 129 * 4} bytes, expected ${128 * 128 * 4}`,
	});
});

// Paired calibration. V is the high shot with cascade 1 in the vertex normals (?calibrate=vertex).
// In ONE ?calibrate=map page load (flat vertex normals, cascade 1 in the normal map, same geometry,
// sky and fog) F is the normal map switched off with normalScale (0, 0), and M+ / M- the map read
// with green as +v / -v. Everything the two modes share cancels in V - F and M - F; what is left is
// the ripples' shading, and the sign whose ripples shade like the vertex normals' wins. It is
// measured both ways, so the result does not depend on the NORMAL_SCALE_Y the page starts from;
// the last assertion is that the shipped default is the winner.
//
// The decision is taken under CALIBRATION_SUN, the place's sun turned 90 degrees about +Y at the
// same elevation, with the environment reflections off. The place's sun lies almost along -x, so
// the z slopes (the green channel) barely move its diffuse term; and the sky's environment keeps
// that sun's bright lobe off along -x whatever the light does, so its reflections follow the x
// slopes too. Under the place's lighting the two green signs differ by only ~0.12; the figures are
// measured and logged beside the decision, not asserted.
const PLACE_SUN = [-0.9526530504226685, 0.2821884751319885, 0.11323313415050507];
const CALIBRATION_SUN = [0.113, 0.282, 0.953];

async function setSun(page, direction) {
	await page.evaluate((d) => window.__ocean.setSun(d), direction);
}

async function setEnvironment(page, enabled) {
	await page.evaluate((on) => window.__ocean.setEnvironment(on), enabled);
}

async function calibrationLighting(page) {
	await setEnvironment(page, false);
	await setSun(page, CALIBRATION_SUN);
}

// Rows where the vertex normals moved the mean luminance off the no-map baseline.
function signalRows(vertex, flat) {
	const rows = [];
	for (let row = 0; row < GRID_H; row++) {
		let sum = 0;
		for (let x = 0; x < GRID_W; x++) sum += Math.abs(vertex[row * GRID_W + x] - flat[row * GRID_W + x]);
		if (sum / GRID_W > ROW_SIGNAL) rows.push(row);
	}
	return rows;
}

function paired(label, vertex, flat, maps) {
	const rows = signalRows(vertex, flat);
	const v = signal(vertex, flat, rows);
	const r = {};
	const size = {};
	for (const [name, image] of Object.entries(maps)) {
		const m = signal(image, flat, rows);
		r[name] = correlation(v, m);
		size[name] = meanAbs(m);
	}
	const winner = r['1,1'] > r['1,-1'] ? 1 : -1;
	const margin = Math.abs(r['1,1'] - r['1,-1']);
	const rWinner = Math.max(r['1,1'], r['1,-1']);
	console.log(`[calibration ${label}] rows ${rows.length}/${GRID_H} (${rows[0]}..${rows[rows.length - 1]}); mean |V-F| ${meanAbs(v).toFixed(2)}; mean |M-F| ${Object.entries(size).map(([k, s]) => `(${k}) ${s.toFixed(2)}`).join(' ')}`);
	console.log(`[calibration ${label}] ${Object.entries(r).map(([k, c]) => `r(${k}) ${c.toFixed(3)}`).join('; ')}; winner ${winner}, margin ${margin.toFixed(3)}`);
	return { rows, r, winner, margin, rWinner };
}

async function mapGrids(page, withX) {
	const flat = await gridAtScale(page, 0, 0);
	const maps = { '1,1': await gridAtScale(page, 1, 1), '1,-1': await gridAtScale(page, 1, -1) };
	if (withX) {
		maps['-1,1'] = await gridAtScale(page, -1, 1);
		maps['-1,-1'] = await gridAtScale(page, -1, -1);
	}
	return { flat, maps };
}

test('the normal map lights the same side of a slope as the vertex normals (paired calibration)', async ({ page }) => {
	// Two page loads to settle and a dozen grids three frames apart, at SwiftShader's ~5 fps.
	test.setTimeout(240_000);
	await settle(page, `/ocean/?${CALIBRATION_SHOT}&calibrate=vertex`);
	const vertexPlace = await luminanceGrid(page);
	await calibrationLighting(page);
	const vertexTurned = await luminanceGrid(page);

	await settle(page, `/ocean/?${CALIBRATION_SHOT}&calibrate=map`);
	const shipped = (await page.evaluate(() => window.__ocean.materialsProbe())).normalScale;
	const place = await mapGrids(page, true);
	await calibrationLighting(page);
	const turned = await mapGrids(page, true);
	await setSun(page, PLACE_SUN);
	await setEnvironment(page, true);
	await page.evaluate(([x, y]) => window.__ocean.setNormalScale(x, y), shipped);

	paired('place sun with environment, logged only', vertexPlace, place.flat, place.maps);
	const result = paired('rotated sun, environment off', vertexTurned, turned.flat, turned.maps);
	console.log(`[calibration] shipped normalScale ${shipped.join(',')}`);
	expect(result.rows.length).toBeGreaterThan(GRID_H / 4);
	expect(result.margin).toBeGreaterThanOrEqual(MIN_MARGIN);
	expect(result.rWinner).toBeGreaterThan(MIN_R);
	expect(shipped[1]).toBe(result.winner);
});
