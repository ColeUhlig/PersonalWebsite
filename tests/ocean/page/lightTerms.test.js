// The lighting terms' reference (piece C2, lane D; spec 10.6): what each term adds, as the math box
// writes it, c = (1 - F)(c_sea (a + max(0, n.s)) + (n.h)^p) + F c_sky. The shader
// (render/termsMaterial.js) is this, line for line.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { TERMS, schlick, shade } from '../../../content/ocean/js/page/lightTerms.js';

const unit = (v) => {
	const l = Math.hypot(...v);
	return v.map((x) => x / l);
};
const base = {
	sea: [0.1, 0.3, 0.4],
	sunColour: [1, 1, 1],
	ambientSky: [0.5, 0.5, 0.5],
	ambientGround: [0.5, 0.5, 0.5],
	skyHorizon: [0.8, 0.8, 0.8],
	skyZenith: [0.3, 0.5, 0.9],
};
const off = { diffuse: false, specular: false, fresnel: false };

test("Schlick's Fresnel: F0 looking straight down, 1 at grazing", () => {
	expect.near(schlick(1, TERMS.f0), TERMS.f0, 1e-12, 'normal incidence');
	expect.near(schlick(0, TERMS.f0), 1, 1e-12, 'grazing');
	expect.truthy(schlick(0.5, TERMS.f0) > TERMS.f0 && schlick(0.5, TERMS.f0) < 1, 'between');
});

test('with every term off the sea is its own flat colour, wherever the sun is', () => {
	for (const s of [[0, 1, 0], unit([1, 0.2, 0]), unit([0, -1, 0.1])]) {
		expect.equal(shade({ ...base, n: [0, 1, 0], v: [0, 1, 0], s, terms: off }).join(','), base.sea.join(','), `sun ${s}`);
	}
});

test('Lambert: brightest facing the sun, ambient alone facing away', () => {
	const terms = { ...off, diffuse: true };
	const facing = shade({ ...base, n: [0, 1, 0], v: [0, 1, 0], s: [0, 1, 0], terms });
	const away = shade({ ...base, n: [0, 1, 0], v: [0, 1, 0], s: [0, -1, 0], terms });
	const ambient = 0.5 * TERMS.ambient;
	away.forEach((c, i) => expect.near(c, base.sea[i] * ambient, 1e-12, `away ${i}`));
	facing.forEach((c, i) => expect.near(c, base.sea[i] * (ambient + TERMS.sun), 1e-12, `facing ${i}`));
});

test('the highlight peaks where the sun reflects straight at the eye', () => {
	const terms = { ...off, specular: true };
	const s = unit([1, 1, 0]);
	const mirror = shade({ ...base, n: [0, 1, 0], v: unit([-1, 1, 0]), s, terms });
	const elsewhere = shade({ ...base, n: [0, 1, 0], v: unit([1, 1, 0]), s, terms });
	expect.near(mirror[0] - base.sea[0], TERMS.specular, 1e-9, 'full strength at the mirror angle');
	expect.truthy(elsewhere[0] - base.sea[0] < 0.05 * TERMS.specular, 'little elsewhere');
});

// Fix round 1: Fresnel weights the reflection, the sun's glint with the sky, and (1 - F) the water's own
// colour, so the glint is F times its strength alone, not (1 - F) times.
test('with every term on, Fresnel weights the glint and the sky together', () => {
	const s = unit([1, 1, 0]);
	const v = unit([-1, 1, 0]);
	const n = [0, 1, 0];
	const all = shade({ ...base, n, v, s, terms: { diffuse: true, specular: true, fresnel: true } });
	const noGlint = shade({ ...base, n, v, s, terms: { diffuse: true, specular: false, fresnel: true } });
	const F = schlick(Math.SQRT1_2, TERMS.f0);
	const lambert = Math.SQRT1_2;
	const sky = base.skyHorizon.map((c, i) => c + (base.skyZenith[i] - c) * Math.SQRT1_2); // r = (0.71, 0.71, 0)
	all.forEach((c, i) => {
		const diffuse = base.sea[i] * (base.ambientSky[i] * TERMS.ambient + TERMS.sun * lambert);
		expect.near(c, (1 - F) * diffuse + F * (TERMS.specular + sky[i]), 1e-9, `colour ${i}`);
		expect.near(c - noGlint[i], F * TERMS.specular, 1e-9, `the glint is F-weighted ${i}`);
	});
});

test('Fresnel mixes in the sky: little looking down, nearly all of it at grazing', () => {
	const terms = { ...off, fresnel: true };
	const down = shade({ ...base, n: [0, 1, 0], v: [0, 1, 0], s: [0, 1, 0], terms });
	const grazing = shade({ ...base, n: [0, 1, 0], v: unit([1, 0.01, 0]), s: [0, 1, 0], terms });
	down.forEach((c, i) => expect.near(c, base.sea[i] * (1 - TERMS.f0) + base.skyZenith[i] * TERMS.f0, 1e-9, `down ${i}`));
	expect.truthy(Math.abs(grazing[0] - base.skyHorizon[0]) < 0.05, `grazing reads the sky near the horizon: ${grazing}`);
});
