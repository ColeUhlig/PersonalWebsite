// The lighting terms in the browser (piece C2, lane D; spec 10.6): each term switches on alone and
// changes the sea, the material clips with the graph's band, and the page without ?step, before the
// first scroll, is A2's painted Roblox mode exactly.
import { test, expect } from '@playwright/test';
import { grid, load, mean, meanDiff, spread, stage, story, watchErrors, waitFrames } from './helpers/stage.js';
import { oceanRunning } from './helpers/story.js';
import { FOG_DENSITY, SUN_DIRECTION } from '../../../content/ocean/js/render/lighting.js';

const DIFFERENT = 1; // mean absolute luminance change (0..255) that counts as "the canvas changed"

let errors;
test.beforeEach(({ page }) => {
	errors = watchErrors(page);
});
test.afterEach(() => {
	expect(errors).toEqual([]);
});

test('the page without ?step is painted Roblox mode until the first scroll', async ({ page }) => {
	await oceanRunning(page, '/ocean/', 30);
	expect(await story(page, 'started')).toBe(false);
	const look = await story(page, 'look');
	// Every patch and horizon quad wears its own painted material (the probe reads the meshes).
	expect(look.mode).toBe('painted');
	expect(look.terms).toBe(null);
	expect(look.clipped).toBe(false);
	expect(look.wireframe).toBe(false);
	// The place's sun and A2's fog: no stage look has been applied.
	look.sun.forEach((value, i) => expect(value).toBeCloseTo(SUN_DIRECTION[i], 6));
	expect(look.fog).toBe(FOG_DENSITY);
	const materials = await page.evaluate(() => window.__ocean.materialsProbe());
	expect(materials.colourBound && materials.normalBound && materials.maskBound && materials.roughnessBound).toBe(true);
	expect(materials.materialCount).toBeGreaterThan(0);
});

test('step 7 is a white blob with no form; step 10 lights it by Lambert alone', async ({ page }) => {
	await load(page, 'step=unlit&freeze=12', 10);
	expect((await stage(page, 'look')).mode).toBe('white');
	const blob = spread(await grid(page, true));
	await load(page, 'step=diffuse&freeze=12', 10);
	const look = await stage(page, 'look');
	expect(look.mode).toBe('terms');
	expect(look.terms).toEqual({ diffuse: true, specular: false, fresnel: false });
	const lit = spread(await grid(page, true));
	expect(lit, `the lit sea varies more than the blob (${lit.toFixed(1)} against ${blob.toFixed(1)})`).toBeGreaterThan(blob * 1.5);
	const before = await grid(page, true);
	await stage(page, 'setSlider', 'sunAzimuth', 35);
	await waitFrames(page, 3);
	expect(meanDiff(before, await grid(page, true))).toBeGreaterThan(DIFFERENT);
});

test('step 11: the highlight and Fresnel each change the sea when switched off', async ({ page }) => {
	await load(page, 'step=highlights&freeze=12', 10);
	expect((await stage(page, 'look')).terms).toEqual({ diffuse: true, specular: true, fresnel: true });
	const all = await grid(page, true);
	await stage(page, 'setSlider', 'specular', false);
	await waitFrames(page, 3);
	expect((await stage(page, 'look')).terms.specular).toBe(false);
	const noHighlight = await grid(page, true);
	expect(meanDiff(all, noHighlight)).toBeGreaterThan(DIFFERENT);
	await stage(page, 'setSlider', 'fresnel', false);
	await waitFrames(page, 3);
	expect(meanDiff(noHighlight, await grid(page, true))).toBeGreaterThan(DIFFERENT);
});

// At 0.45 of the blend from the tiling step into the flat graph the camera is still high and the
// band is about 70 studs either side of x = 0, narrower than the ground in view: the frame's sides
// must show the flat backdrop and no sea (fix round 1: a shader that ignored the clip planes
// passed the old left-against-middle check on the sun's glitter alone). Task 14: since lane B's
// backdrop (the page's dark body colour, drawn over the scene as it fades in) the sides are no
// longer pale: 145 and 136 of 255 at this blend, against a fixed 150 chosen for Task 0's pale backdrop. The
// check now holds the sides flat and far brighter than the sea in the band's middle (about 48 here;
// unclipped sea at the sides would read as dark as that, and vary).
test('the terms material clips with the graph band (the blend from the tiling step into the graph)', async ({ page }) => {
	await load(page, 'step=tiling&progress=0.45&freeze=12', 20);
	const look = await stage(page, 'look');
	expect(look.mode).toBe('terms');
	expect(look.clipped).toBe(true);
	expect(look.termsClips).toBe(true);
	const band = (await stage(page, 'graph')).band;
	expect(band[1]).toBeLessThan(100);
	const cells = await grid(page);
	const columns = (from, to) => {
		const values = [];
		for (let row = 0; row < 36; row++) for (let x = from; x < to; x++) values.push(cells[row * 64 + x]);
		return values;
	};
	const sea = mean(columns(28, 36));
	for (const [name, from] of [['left', 0], ['right', 56]]) {
		const side = columns(from, from + 8);
		expect(mean(side), `the ${name} eighth is the backdrop, far brighter than the sea (${sea.toFixed(1)})`).toBeGreaterThan(sea + 60);
		expect(spread(side), `the ${name} eighth is flat`).toBeLessThan(10);
	}
});

// Fix round 1: the shader against its reference, term by term. One fragment of a quad with a chosen
// normal is drawn offscreen into a linear float target (no tone mapping, no fog, no colour space),
// read back and compared with page/lightTerms.js's shade() for the same uniforms. The second normal
// leans so that n.v, n.s and the reflected ray's height all differ from their stand-ins.
test('the shader is page/lightTerms.js, term by term', async ({ page }) => {
	await load(page, 'step=unlit&freeze=12', 5);
	const rows = await page.evaluate(async () => {
		const THREE = await import('three');
		const { createTermsMaterial } = await import('/ocean/js/render/termsMaterial.js');
		const { shade } = await import('/ocean/js/page/lightTerms.js');
		const unit = (a) => {
			const l = Math.hypot(...a);
			return a.map((x) => x / l);
		};
		const renderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
		const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.FloatType });
		const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
		camera.position.set(0, 0, 10);
		camera.lookAt(0, 0, 0);
		const geometry = new THREE.PlaneGeometry(4, 4);
		const material = createTermsMaterial({ seaColour: new THREE.Color().setRGB(0.1, 0.3, 0.4, THREE.SRGBColorSpace), sunDirection: [0, 1, 0] });
		const scene = new THREE.Scene();
		scene.add(new THREE.Mesh(geometry, material));
		const u = material.uniforms;
		const rgb = (c) => [c.r, c.g, c.b];
		const v = [0, 0, 1];
		const mirrorNormal = unit([0.3, 0.4, 0.85]);
		const along = 2 * mirrorNormal[2];
		const cases = [
			{ n: mirrorNormal, s: unit(mirrorNormal.map((x, i) => x * along - v[i])) },
			{ n: unit([0.2, 0.9, 0.4]), s: unit([-0.5, 0.5, 0.3]) },
		];
		const termSets = [0, 1, 2, 3, 4, 5, 6, 7].map((bits) => ({ diffuse: !!(bits & 1), specular: !!(bits & 2), fresnel: !!(bits & 4) }));
		const out = new Float32Array(4);
		const rows = [];
		for (const { n, s } of cases) {
			const normals = geometry.attributes.normal;
			for (let i = 0; i < normals.count; i++) normals.setXYZ(i, n[0], n[1], n[2]);
			normals.needsUpdate = true;
			material.setSun(s);
			for (const terms of termSets) {
				material.setTerms(terms);
				renderer.setRenderTarget(target);
				renderer.render(scene, camera);
				renderer.readRenderTargetPixels(target, 0, 0, 1, 1, out);
				const expected = shade({
					n, v, s, terms,
					sea: rgb(u.seaColour.value),
					sunColour: rgb(u.sunColour.value),
					ambientSky: rgb(u.ambientSky.value),
					ambientGround: rgb(u.ambientGround.value),
					skyHorizon: rgb(u.skyHorizon.value),
					skyZenith: rgb(u.skyZenith.value),
				});
				rows.push({ label: `${JSON.stringify(n.map((x) => +x.toFixed(2)))} ${JSON.stringify(terms)}`, got: [out[0], out[1], out[2]], expected });
			}
		}
		renderer.dispose();
		target.dispose();
		return rows;
	});
	expect(rows).toHaveLength(16);
	for (const { label, got, expected } of rows) {
		got.forEach((value, i) => expect(Math.abs(value - expected[i]), `${label} channel ${i}: ${value} against ${expected[i]}`).toBeLessThan(2e-3));
	}
});

// Task 15 polish (the walk: step 10 at rest was an even dark teal, so "as bright as it faces the
// sun" needed the slider). With the recipe's own sun, the lit and shadowed faces differ clearly on the
// hold: the water's brightness spread, right of the panel's column and below the horizon, is at least
// 18 (of 255). A survey of sun directions on this sea (1366 x 767, frozen at 12 s) measured 14.1 at
// the old 215 degrees (behind the view, to the left), 7.5 to 7.7 with the sun straight to either side
// (the crests run across the view, so both their faces turn equally from a side sun), and 21 to 23.4
// with the sun along the waves' travel (60 to 120 degrees, behind the camera, or 240 to 300).
for (const { width, height } of [{ width: 1366, height: 767 }, { width: 390, height: 844 }]) {
	test(`step 10's own sun lights some faces and leaves others dark on the hold (${width} × ${height})`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		await load(page, 'step=diffuse&freeze=12', 40);
		const spread = await page.evaluate((narrow) => new Promise((resolve) => requestAnimationFrame(() => {
			const s = document.getElementById('ocean');
			const c = document.createElement('canvas');
			c.width = 200;
			c.height = 100;
			const x = c.getContext('2d');
			const left = narrow ? 0 : 0.35;
			x.drawImage(s, s.width * left, s.height * 0.55, s.width * (1 - left), s.height * 0.45, 0, 0, 200, 100);
			const d = x.getImageData(0, 0, 200, 100).data;
			const L = [];
			for (let i = 0; i < d.length; i += 4) L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
			const m = L.reduce((a, b) => a + b) / L.length;
			resolve(Math.sqrt(L.reduce((a, b) => a + (b - m) ** 2, 0) / L.length));
		})), width < 900);
		expect(spread).toBeGreaterThanOrEqual(18);
	});
}
