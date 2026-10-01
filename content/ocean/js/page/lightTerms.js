// The lighting terms of steps 7 to 11 (piece C2; lane D owns this file; spec 10.6; browser-free): the
// reference for render/termsMaterial.js's shader, which is the same arithmetic in GLSL, and what the
// math box writes for step 11: colour = (1 - F)(c_sea (a + max(0, n.s)) + (n.h)^p) + F c_sky, where
// a is the sky ambient (hemisphere light: ground below, sky above, by the normal's height), the
// highlight is Blinn-Phong on the half vector h between the sun s and the eye v, F is Schlick's
// Fresnel with F0 for water, and c_sky is a sky colour by the reflected ray's height. Each term
// switches on alone; with all off the sea is its own flat colour. Colours are linear.
// This is a browser demonstration only: a Roblox script cannot write a shader, so in Roblox these
// terms come from the engine's own lighting (its sun, ambient and sky reflections on the material),
// and nothing here runs there.
export const TERMS = Object.freeze({
	ambient: 0.6, // render/lighting.js AMBIENT_INTENSITY
	sun: 1.6, // tuned by eye (C2 lane D): at 1 the deck shot, lit from ahead, read near black
	shininess: 120,
	specular: 1.2,
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
	let colour = [...sea];
	if (terms.diffuse) {
		const ambient = mix(ambientGround, ambientSky, 0.5 + 0.5 * n[1]).map((c) => c * constants.ambient);
		const lambert = Math.max(dot(n, s), 0);
		colour = sea.map((c, i) => c * (ambient[i] + sunColour[i] * constants.sun * lambert));
	}
	if (terms.specular) {
		const h = normalise([s[0] + v[0], s[1] + v[1], s[2] + v[2]]);
		const highlight = constants.specular * Math.max(dot(n, h), 0) ** constants.shininess;
		colour = colour.map((c, i) => c + sunColour[i] * highlight);
	}
	if (terms.fresnel) {
		const F = schlick(dot(n, v), constants.f0);
		const along = 2 * dot(n, v);
		const r = [n[0] * along - v[0], n[1] * along - v[1], n[2] * along - v[2]];
		const sky = mix(skyHorizon, skyZenith, clamp01(r[1]));
		colour = mix(colour, sky, F);
	}
	return colour;
}
