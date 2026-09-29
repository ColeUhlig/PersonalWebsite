// The numbers the sea ships with and the URL knobs that override them. Twin of the Roblox
// coordinator's constants and knob reading (OceanClient.client.luau), Look.luau and FoamKnobs.luau:
// every knob the place reads from a Workspace attribute is a URL parameter here, read once.
import * as Spectrum from '../core/spectrum.js';
import * as MapRotation from '../core/mapRotation.js';
import * as Tier from '../core/tier.js';
import { clamp } from '../core/luau.js';

export const LOOP_PERIOD = 120;
export const SEED = 7;
export const SWELL_SPECS = Object.freeze([
	Object.freeze({ wavelength: 420, amplitude: 1.2, direction: 0.2, phase: 0 }),
	Object.freeze({ wavelength: 260, amplitude: 0.7, direction: -0.4, phase: 1 }),
]);
export const MAP_TEXELS = 128;
export const COLOUR_TEXELS = 512;
export const FOAM_TEXELS = 256;
export const BAND_ROWS = COLOUR_TEXELS / MapRotation.BANDS;
export const NORMAL_BLOCK_TEXELS = 128;
export const NORMAL_BLOCK_STUDS = 64;
export const NORMAL_IMAGE_TEXELS = 512;
export const REPORT_EVERY_FRAMES = 300;
export const CONFIGURE_TIMEOUT_FRAMES = 60;
export const PAINT_TIMEOUT_FRAMES = 60;
export const CAMERAS = Object.freeze(['orbit', 'deck', 'high', 'crest']);
const CALIBRATIONS = Object.freeze(['vertex', 'map']);
const GREY = Object.freeze([128, 128, 128]);

// Look.luau, verbatim. Colours are bytes (Color3.fromRGB).
export const LOOK = Object.freeze({
	SEA: Object.freeze({ scale: 8, tailBoost: -0.3, chop: 0.8, swellScale: 0, isotropy: 1, peak: 10.3 }),
	PALETTE: Object.freeze({ deep: Object.freeze([8, 46, 72]), subsurface: Object.freeze([28, 168, 156]) }),
	TINT: 0.35,
	SCATTER: Object.freeze({ strength: 30, viewPower: 3, facePower: 1 }),
	MASK_GAMMA: 0.8,
	ROUGHNESS: Object.freeze([0.15, 0.2, 0.3, 0.45, 0.6]),
	MASK_DECAY: 0.98,
	FOAM: Object.freeze({
		whitecap: 0.35,
		grow: 2,
		decay: 0.86,
		threshold: 0,
		feather: 1.3,
		lace: 0.3,
		opacity: 0.7,
		roughness: 1,
		colour: Object.freeze([232, 228, 210]),
	}),
});

// The Workspace attributes the Studio place "SOT jonswap ocean" carries on top of Look (read
// 2026-09-23): OceanIsotropy 0.4 (OceanWind 12 and OceanFetch 80000 equal the defaults).
export const PLACE = Object.freeze({ isotropy: 0.4 });

function reader(query, warnings) {
	const number = (name, fallback) => {
		if (!query.has(name)) {
			return fallback;
		}
		const text = query.get(name);
		const value = Number(text);
		if (text.trim() === '' || !Number.isFinite(value)) {
			warnings.push(`${name}=${text} is not a number; using ${fallback}`);
			return fallback;
		}
		return value;
	};
	const clamped = (name, fallback, min, max) => {
		const value = number(name, fallback);
		const result = clamp(value, min, max);
		if (result !== value) {
			warnings.push(`${name}=${value} is outside ${min}..${max}; using ${result}`);
		}
		return result;
	};
	const colour = (name, fallback) => {
		if (!query.has(name)) {
			return fallback;
		}
		const parts = query.get(name).split(',').map(Number);
		const valid = parts.length === 3 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255);
		if (!valid) {
			warnings.push(`${name}=${query.get(name)} is not three bytes r,g,b; using ${fallback.join(',')}`);
			return fallback;
		}
		return Object.freeze(parts);
	};
	const choice = (name, allowed, fallback) => {
		if (!query.has(name)) {
			return fallback;
		}
		const value = query.get(name);
		if (!allowed.includes(value)) {
			warnings.push(`${name}=${value} is not one of ${allowed.join(', ')}; using ${fallback}`);
			return fallback;
		}
		return value;
	};
	return { number, clamped, colour, choice };
}

// Roughness is a list, one value per ring; like OceanRoughness in the Luau, an entry that does not
// parse is dropped rather than becoming a hole, and an empty list keeps Look's.
function roughnessList(query, warnings) {
	if (!query.has('roughness')) {
		return LOOK.ROUGHNESS;
	}
	const entries = query.get('roughness').split(',');
	const parsed = entries.map(Number).filter((value, i) => entries[i].trim() !== '' && Number.isFinite(value));
	if (parsed.length !== entries.length) {
		warnings.push(`roughness=${query.get('roughness')} had entries that are not numbers; they were dropped`);
	}
	return parsed.length > 0 ? Object.freeze(parsed) : LOOK.ROUGHNESS;
}

export function readConfig(search) {
	const query = search instanceof URLSearchParams ? search : new URLSearchParams(search ?? '');
	const warnings = [];
	const read = reader(query, warnings);

	const defaults = Spectrum.validateParams({
		...Spectrum.NORMAL,
		scale: LOOK.SEA.scale,
		tailBoost: LOOK.SEA.tailBoost,
		isotropy: PLACE.isotropy,
	});
	let params = {
		...defaults,
		windSpeed: read.number('wind', defaults.windSpeed),
		fetch: read.number('fetch', defaults.fetch),
		scale: read.number('scale', defaults.scale),
		tailBoost: read.number('tailBoost', defaults.tailBoost),
		isotropy: read.number('isotropy', defaults.isotropy),
	};
	try {
		Spectrum.validateParams(params);
	} catch (error) {
		// Name the URL parameter as well as the Spectrum field, so the warning says what to fix.
		const url = { windSpeed: 'wind', fetch: 'fetch', scale: 'scale', tailBoost: 'tailBoost', isotropy: 'isotropy' };
		const field = Object.keys(url).find((key) => error.message.includes(key));
		warnings.push(`${field ? url[field] : 'sea'}: ${error.message}; using the default sea`);
		params = defaults;
	}

	const calibrate = read.choice('calibrate', CALIBRATIONS, null);
	const foamEnabled = query.get('foam') !== '0';
	const config = {
		params: Object.freeze(params),
		chop: read.number('chop', LOOK.SEA.chop),
		swellScale: read.number('swellScale', LOOK.SEA.swellScale),
		peak: read.number('peak', LOOK.SEA.peak),
		flatNormals: calibrate === 'map' ? true : calibrate === 'vertex' ? false : query.get('flat') === '1',
		deep: calibrate ? GREY : read.colour('deep', LOOK.PALETTE.deep),
		subsurface: calibrate ? GREY : read.colour('subsurface', LOOK.PALETTE.subsurface),
		tint: read.clamped('tint', LOOK.TINT, 0, 1),
		scatter: Object.freeze({
			strength: calibrate ? 0 : read.number('scatter', LOOK.SCATTER.strength),
			viewPower: read.number('viewPower', LOOK.SCATTER.viewPower),
			facePower: read.number('facePower', LOOK.SCATTER.facePower),
		}),
		maskGamma: read.number('gamma', LOOK.MASK_GAMMA),
		maskDecay: read.number('maskDecay', LOOK.MASK_DECAY),
		roughness: roughnessList(query, warnings),
		foam: Object.freeze({
			enabled: calibrate ? false : foamEnabled,
			whitecap: read.number('whitecap', LOOK.FOAM.whitecap),
			grow: read.number('grow', LOOK.FOAM.grow),
			decay: read.number('foamDecay', LOOK.FOAM.decay),
			threshold: read.number('threshold', LOOK.FOAM.threshold),
			feather: read.number('feather', LOOK.FOAM.feather),
			lace: read.number('lace', LOOK.FOAM.lace),
			opacity: read.clamped('opacity', LOOK.FOAM.opacity, 0, 1),
			roughness: read.number('foamRoughness', LOOK.FOAM.roughness),
			colour: read.colour('foamColour', LOOK.FOAM.colour),
		}),
		tier: read.choice('tier', Object.keys(Tier.presets), null),
		useWorkers: query.get('workers') !== '0',
		freeze: query.has('freeze') ? read.number('freeze', 12) : null,
		camera: read.choice('cam', CAMERAS, 'orbit'),
		focusOrigin: query.get('focus') === 'origin',
		hud: query.get('hud') !== '0',
		stats: query.get('stats') === '1',
		calibrate,
		warnings: Object.freeze(warnings),
	};
	return Object.freeze(config);
}
