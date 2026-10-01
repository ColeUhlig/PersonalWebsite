// The lighting terms worn by diffuse, highlights, gerstner and tiling (piece C2; lane D owns this
// file; spec 10.6; browser-free): the reference for render/termsMaterial.js's shader, which is the
// same arithmetic in GLSL. The water's
// own colour is c_d = c_sea (a + k_sun max(0, n.s)), where a is the sky ambient (a hemisphere light:
// ground below, sky above, by the normal's height); the highlight is c_s = k_spec (n.h)^p, Blinn-Phong
// on the half vector h between the sun s and the eye v. Without Fresnel the two add: c = c_d + c_s.
// With it, F (Schlick's, with F0 for water) is the share of light the surface reflects, so the glint
// and the sky both ride on F and the water's own colour on the rest:
//   c = (1 - F) c_d + F (c_s + c_sky)
// c_sky is a two-colour gradient (horizon to zenith) read by the reflected ray's height, not the
// scene's sky. Each term switches on alone; with all off the sea is its own flat colour. Colours
// are linear. k_sun and a are render/lighting.js's SUN_INTENSITY and AMBIENT_INTENSITY as they
// stand: three's lit sea divides the sun and ambient by pi (BRDF_Lambert) and this shader does not,
// on purpose. The ratio of sun to ambient is the place's, and the brighter teal was chosen over the
// dim navy the division gives, so do not "fix" it.
// This is a browser demonstration only: a Roblox script cannot write a shader, so in Roblox these
// terms come from the engine's own lighting (its sun, ambient and sky reflections on the material),
// and nothing here runs there.
import { AMBIENT_INTENSITY, SUN_INTENSITY } from '../render/lighting.js';

export const TERMS = Object.freeze({
	ambient: AMBIENT_INTENSITY,
	sun: SUN_INTENSITY,
	shininess: 120,
	// Fix round 1, by eye: with the glint riding on F (about 0.2 at the teaching sun's 16 degrees) it
	// needs this much to read on the water; at 1.2 it all but vanished.
	specular: 4.5,
	f0: 0.02, // water's reflectance looking straight down
	zenith: Object.freeze([0.22, 0.42, 0.75]), // sRGB bytes / 255 of the sky overhead
});

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalise = (a) => {
	const l = Math.hypot(a[0], a[1], a[2]);
	return [a[0] / l, a[1] / l, a[2] / l];
};
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (x) => Math.min(Math.max(x, 0), 1);

export function schlick(cosine, f0) {
	return f0 + (1 - f0) * (1 - clamp01(cosine)) ** 5;
}

/** n, v, s unit vectors (normal, towards the eye, towards the sun); colours linear [r, g, b]. */
export function shade({ n, v, s, terms, sea, sunColour, ambientSky, ambientGround, skyHorizon, skyZenith, constants = TERMS }) {
	let diffuse = [...sea];
	if (terms.diffuse) {
		const ambient = mix(ambientGround, ambientSky, 0.5 + 0.5 * n[1]).map((c) => c * constants.ambient);
		const lambert = Math.max(dot(n, s), 0);
		diffuse = sea.map((c, i) => c * (ambient[i] + sunColour[i] * constants.sun * lambert));
	}
	let specular = [0, 0, 0];
	if (terms.specular) {
		const h = normalise([s[0] + v[0], s[1] + v[1], s[2] + v[2]]);
		const highlight = constants.specular * Math.max(dot(n, h), 0) ** constants.shininess;
		specular = sunColour.map((c) => c * highlight);
	}
	if (!terms.fresnel) {
		return diffuse.map((c, i) => c + specular[i]);
	}
	const F = schlick(dot(n, v), constants.f0);
	const along = 2 * dot(n, v);
	const r = [n[0] * along - v[0], n[1] * along - v[1], n[2] * along - v[2]];
	const sky = mix(skyHorizon, skyZenith, clamp01(r[1]));
	return diffuse.map((c, i) => (1 - F) * c + F * (specular[i] + sky[i]));
}
