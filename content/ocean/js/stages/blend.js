// Blending two neighbouring recipes by the scroll progress (A3; not a twin; spec 4.3 "the engine reads the
// blended recipe every frame"). What blends and what snaps:
//   * numbers lerp: the sine, the wave count, chop, wind, the foam and glow knobs, the fog, the
//     sun, the camera. Fetch and fog, which act multiplicatively, lerp on a log scale; the sun's
//     azimuth goes the short way round;
//   * everything discrete snaps at progress 0.5: the wave source, the seed, the layers, maps, foam
//     and glow, the material, shading, wireframe, the camera move and the charts;
//   * `warm`: while the scroll is strictly between the two, every part EITHER recipe runs is kept
//     running (the FFT, the painter, each layer), so what the next step shows is ready when it
//     snaps in. At the ends only the recipe's own parts run;
//   * `sliders` stay the first recipe's: the panel the visitor is reading.
import { mod } from '../core/luau.js';
import { deepFreeze } from './paths.js';

const lerp = (a, b, p) => (p === 1 ? b : a + (b - a) * p);
const logLerp = (a, b, p) => {
	if (p === 1) return b;
	return a > 0 && b > 0 ? a * (b / a) ** p : a + (b - a) * p;
};
// mod gives 360 itself for a hair below 0 (-1e-15 + 360 rounds to 360); keep to [0, 360).
const wrap360 = (angle) => {
	const wrapped = mod(angle, 360);
	return wrapped === 360 ? 0 : wrapped;
};
function angleLerp(a, b, p) {
	if (p === 1) return wrap360(b);
	const delta = mod(b - a + 180, 360) - 180;
	return wrap360(a + delta * p);
}
const lerp3 = (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p)];

/**
 * @param {object} a the recipe being read (sliders bound)
 * @param {object} b the next recipe (sliders bound); the same recipe for the last step
 * @param {number} progress 0 at a, 1 at b; clamped to 0 .. 1
 */
export function blendRecipes(a, b, progress) {
	if (typeof progress !== 'number' || !Number.isFinite(progress)) {
		throw new RangeError(`progress must be a finite number, got ${progress}`);
	}
	const p = Math.min(Math.max(progress, 0), 1);
	const near = p < 0.5 ? a : b;
	const between = p > 0 && p < 1;
	const ea = a.engine;
	const eb = b.engine;
	const en = near.engine;
	return deepFreeze({
		step: near.step,
		id: near.id,
		title: near.title,
		from: a.step,
		to: b.step,
		progress: p,
		engine: {
			source: en.source,
			sine: {
				amplitude: lerp(ea.sine.amplitude, eb.sine.amplitude, p),
				wavelength: lerp(ea.sine.wavelength, eb.sine.wavelength, p),
				speed: lerp(ea.sine.speed, eb.sine.speed, p),
			},
			bank: { count: lerp(ea.bank.count, eb.bank.count, p) },
			chop: lerp(ea.chop, eb.chop, p),
			sea: { windSpeed: lerp(ea.sea.windSpeed, eb.sea.windSpeed, p), fetch: logLerp(ea.sea.fetch, eb.sea.fetch, p) },
			seed: en.seed,
			layers: en.layers,
			maps: en.maps,
			foam: en.foam,
			glow: en.glow,
			foamKnobs: {
				whitecap: lerp(ea.foamKnobs.whitecap, eb.foamKnobs.whitecap, p),
				decay: lerp(ea.foamKnobs.decay, eb.foamKnobs.decay, p),
			},
			glowStrength: lerp(ea.glowStrength, eb.glowStrength, p),
		},
		warm: between
			? {
					fft: ea.source === 'fft' || eb.source === 'fft',
					maps: ea.maps || eb.maps,
					layers: ea.layers.map((on, i) => on || eb.layers[i] === true),
				}
			: { fft: en.source === 'fft', maps: en.maps, layers: en.layers },
		look: {
			material: near.look.material,
			shading: near.look.shading,
			wireframe: near.look.wireframe,
			fog: logLerp(a.look.fog, b.look.fog, p),
			sun: { azimuth: angleLerp(a.look.sun.azimuth, b.look.sun.azimuth, p), elevation: lerp(a.look.sun.elevation, b.look.sun.elevation, p) },
		},
		shot: { position: lerp3(a.shot.position, b.shot.position, p), target: lerp3(a.shot.target, b.shot.target, p), move: near.shot.move },
		charts: near.charts,
		sliders: a.sliders,
	});
}

// What Ocean.configureStage takes: the blended engine part, its warm parts, and whether the look
// needs vertex normals (lit materials do; white and the unlit sea colour do not).
export function engineSettings(blended) {
	const look = blended.look;
	return Object.freeze({
		...blended.engine,
		warm: blended.warm,
		normals: look.material === 'painted' || (look.material === 'sea' && look.shading),
	});
}
