// The stage switches (A3; not a twin): how a story step's recipe reaches the running ocean (spec
// 4.3). The director hands `configure` the blended recipe's settings whenever they change, and
// this works out what differs from the last ones and does only that:
//   * the wave source: a sine or the teaching bank drawn through the surface's swells slot with
//     every ring's cascade list empty (waveBanks.js), or the FFT cascades;
//   * which parts run at all -- the cascades (evolve and blend), the painter, the glow -- so a
//     part a recipe switches off costs nothing: no evolve request, no Paint, no glow pass, and a
//     still surface is not rewritten. A part the neighbouring recipe needs keeps running while
//     the scroll is between the two (`warm`), so it is ready by the time it shows;
//   * which cascade layers run and which the rings sample (step 10), and the painter's lists;
//   * live knobs without restarting anything: chop and the foam sliders reach the painter as an
//     `update` (painterWorkerCore); a wind, fetch or seed change marks every cascade for a
//     retune, which the frame loop sends one cascade at a time, on that cascade's own rotation
//     frame and no closer than RETUNE_GAP_FRAMES to the last (retuneDue), so a slider dragged
//     every frame costs at most one spectrum rebuild in seven frames, the cascades in turn;
//   * the patch bounds, which only grow (bounds.js), and whether the vertex normals are written.
// Settings are checked whole before anything changes, so a refused set leaves the ocean as it was.
import * as Spectrum from '../core/spectrum.js';
import * as Swells from '../core/swells.js';
import { bankBounds, boundsFor, grow } from './bounds.js';
import { LOOK, SEED } from './config.js';
import * as PainterClient from './painterClient.js';
import * as SurfaceState from './surfaceState.js';
import * as WaveBanks from './waveBanks.js';

// Seven, not six: a gap that is a multiple of the three-frame rotation would land every retune on
// the same cascade's rotation frame, and while a slider is dragged (which re-marks every cascade
// each frame) that cascade would take every retune and starve the other two. Seven steps on to the
// next cascade each time, so they take turns.
export const RETUNE_GAP_FRAMES = 7;
export const SOURCES = Object.freeze(['sine', 'bank', 'fft']);

// The hero sea as settings: the rough default Cole judged in A2 (config.js's defaults), every
// part on, the FFT shown. What the ocean runs before any stage is configured.
export const DEFAULT_SETTINGS = Object.freeze({
	source: 'fft',
	sine: Object.freeze({ amplitude: 1.5, wavelength: 40, speed: 8 }),
	bank: Object.freeze({ count: 32 }),
	chop: LOOK.SEA.chop,
	sea: Object.freeze({ windSpeed: Spectrum.NORMAL.windSpeed, fetch: Spectrum.NORMAL.fetch }),
	seed: SEED,
	layers: Object.freeze([true, true, true]),
	maps: true,
	foam: true,
	foamKnobs: Object.freeze({ whitecap: LOOK.FOAM.whitecap, decay: LOOK.FOAM.decay }),
	glow: true,
	glowStrength: LOOK.SCATTER.strength,
	normals: true,
	warm: Object.freeze({ fft: false, maps: false, layers: Object.freeze([false, false, false]) }),
});

function fail(name, rule, value) {
	const shown = value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value);
	throw new RangeError(`stage settings: ${name} must be ${rule}, got ${shown}`);
}

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const flagList = (value) => Array.isArray(value) && value.length >= 1 && value.every((v) => typeof v === 'boolean');

// Checks a whole EngineSettings (see the plan's Conventions) and returns it; throws a RangeError
// naming the first field that is missing or out of range.
export function normalise(s) {
	if (s === null || typeof s !== 'object') {
		fail('settings', 'an object', s);
	}
	if (!SOURCES.includes(s.source)) {
		fail('source', `one of ${SOURCES.join(', ')}`, s.source);
	}
	WaveBanks.checkSine(s.sine ?? {});
	const most = WaveBanks.TEACHING_RECIPE.count;
	if (!finite(s.bank?.count) || s.bank.count < 0 || s.bank.count > most) {
		fail('bank.count', `a number in 0 .. ${most}`, s.bank?.count);
	}
	if (!finite(s.chop) || s.chop < 0 || s.chop > 2) {
		fail('chop', 'a number in 0 .. 2', s.chop);
	}
	if (!finite(s.sea?.windSpeed) || !finite(s.sea?.fetch)) {
		fail('sea', 'a finite windSpeed and fetch', s.sea);
	}
	if (!Number.isInteger(s.seed)) {
		fail('seed', 'an integer', s.seed);
	}
	if (!flagList(s.layers)) {
		fail('layers', 'a list of true or false', s.layers);
	}
	for (const name of ['maps', 'foam', 'glow', 'normals']) {
		if (typeof s[name] !== 'boolean') {
			fail(name, 'true or false', s[name]);
		}
	}
	if (!finite(s.foamKnobs?.whitecap) || !finite(s.foamKnobs?.decay)) {
		fail('foamKnobs', 'a finite whitecap and decay', s.foamKnobs);
	}
	if (!finite(s.glowStrength) || s.glowStrength < 0) {
		fail('glowStrength', 'a finite number >= 0', s.glowStrength);
	}
	if (typeof s.warm?.fft !== 'boolean' || typeof s.warm?.maps !== 'boolean' || !flagList(s.warm?.layers)) {
		fail('warm', '{ fft, maps, layers } of true or false', s.warm);
	}
	return s;
}

// The teaching clock: never wrapped, so a sine whose speed the visitor sets never meets the FFT's
// 120 s loop seam; the frozen time when the URL freezes the clock.
export function teachTime(ocean) {
	return ocean.config.freeze ?? ocean.now() - ocean.startedAt;
}

const sameFlags = (a, b) => a.length === b.length && a.every((value, i) => value === b[i]);
const sameLists = (a, b) => ['mask', 'colour', 'normal'].every((key) => a[key].join(',') === b[key].join(','));

// The painter's lists for the layers shown: mask and colour read every layer that is on, the
// normal map every one but cascade 1, whose slopes the vertices carry (PainterClient.cascades).
function cascadeLists(shown) {
	const on = [];
	shown.forEach((value, i) => {
		if (value) on.push(i + 1);
	});
	return { mask: on, colour: on, normal: on.filter((c) => c > 1) };
}

function applySource(ocean, s, before) {
	if (s.source === 'sine') {
		const same =
			before?.source === 'sine' &&
			before.sine.amplitude === s.sine.amplitude &&
			before.sine.wavelength === s.sine.wavelength &&
			before.sine.speed === s.sine.speed;
		if (!same) {
			ocean.sine = WaveBanks.nextSine(ocean.sine, s.sine, teachTime(ocean));
		}
		ocean.waves = ocean.sine.bank;
	} else if (s.source === 'bank') {
		ocean.teachingBank ??= WaveBanks.teachingBank();
		if (before?.source !== 'bank' || before.bank.count !== s.bank.count) {
			ocean.waves = WaveBanks.withCount(ocean.teachingBank, s.bank.count);
		}
	}
	ocean.source = s.source === 'fft' ? 'fft' : 'waves';
}

function applyLayers(ocean, s) {
	const count = ocean.preset.sizes.length;
	const shown = Array.from({ length: count }, (_, i) => s.layers[i] === true);
	const fft = s.source === 'fft';
	const running = fft || s.warm.fft;
	// What runs: the layers shown, and the ones the neighbouring recipe needs while between.
	ocean.layerOn = shown.map((on, i) => running && (on || s.warm.layers[i] === true));
	// What the rings sample: the layers shown, and only while the FFT is what shows.
	const sampled = shown.map((on) => fft && on);
	if (!sameFlags(sampled, ocean.sampled)) {
		ocean.sampled = sampled;
		SurfaceState.setRingCascades(ocean.surface, sampled);
	}
	const lists = cascadeLists(shown);
	if (!sameLists(lists, ocean.painterLists)) {
		ocean.painterLists = lists;
		const update = { maskCascades: lists.mask, colourCascades: lists.colour };
		// The calibration views set their own normal map (ocean.js painterConfigFor); leave it.
		if (!ocean.config.calibrate) {
			update.normalCascades = lists.normal;
		}
		PainterClient.update(ocean.painter, update);
	}
}

function applyKnobs(ocean, s, before, params) {
	const live = ocean.live;
	const painter = {};
	if (s.chop !== live.chop) {
		live.chop = s.chop;
		painter.chop = s.chop;
	}
	if (params.windSpeed !== live.params.windSpeed || params.fetch !== live.params.fetch || s.seed !== live.seed) {
		live.params = Object.freeze(params);
		live.seed = s.seed;
		ocean.retune.pending.fill(true);
	}
	const foamChanged =
		!before ||
		before.foam !== s.foam ||
		before.foamKnobs.whitecap !== s.foamKnobs.whitecap ||
		before.foamKnobs.decay !== s.foamKnobs.decay;
	if (foamChanged) {
		painter.foamEnabled = s.foam;
		painter.foamWhitecap = s.foamKnobs.whitecap;
		painter.foamDecay = s.foamKnobs.decay;
	}
	if (Object.keys(painter).length > 0) {
		PainterClient.update(ocean.painter, painter);
	}
	if (s.glowStrength !== live.scatter.strength) {
		live.scatter = Object.freeze({ ...live.scatter, strength: s.glowStrength });
	}
}

function applyBounds(ocean) {
	const live = ocean.live;
	let next = grow(ocean.surface.bounds, boundsFor({ params: live.params, chop: live.chop, swellScale: ocean.config.swellScale }));
	if (ocean.source === 'waves') {
		next = grow(next, bankBounds(WaveBanks.bankExtent(ocean.waves), live.chop));
	}
	if (next.lateral !== ocean.surface.bounds.lateral || next.height !== ocean.surface.bounds.height) {
		SurfaceState.setBounds(ocean.surface, next);
		ocean.bounds = ocean.surface.bounds;
	}
}

function applyParts(ocean, s) {
	const wasGlowing = ocean.parts.glow;
	const still = s.source === 'fft' ? !ocean.sampled.some(Boolean) && Swells.isSilent(ocean.swells) : ocean.waves.silent;
	ocean.parts = Object.freeze({
		cascades: ocean.layerOn.some(Boolean),
		painter: s.maps || s.warm.maps,
		glow: s.glow,
		still,
	});
	if (wasGlowing && !s.glow) {
		ocean.strengths.fill(0);
	}
}

/**
 * Brings the ocean to these settings, doing only what differs from the last ones.
 * @param {object} ocean from Ocean.create
 * @param {object} settings an EngineSettings (plan Conventions)
 */
export function configure(ocean, settings) {
	const s = normalise(settings);
	// Checked before anything changes, like the rest: a refused sea leaves the ocean as it was.
	const params = Spectrum.validateParams({ ...ocean.live.params, windSpeed: s.sea.windSpeed, fetch: s.sea.fetch });
	const before = ocean.stageSettings;
	applySource(ocean, s, before);
	applyLayers(ocean, s);
	applyKnobs(ocean, s, before, params);
	applyBounds(ocean);
	applyParts(ocean, s);
	SurfaceState.setFlatNormals(ocean.surface, !s.normals || ocean.config.flatNormals);
	ocean.stageSettings = s;
}

/**
 * Sends cascade `index` its retune if one is pending and the last retune was at least
 * RETUNE_GAP_FRAMES ago. Called by the frame loop on that cascade's own rotation frame, BEFORE its
 * evolve request, so the worker rebuilds and then answers the evolve with the new sea. A worker
 * that has not answered its Configure keeps the retune pending.
 */
export function retuneDue(ocean, index) {
	const retune = ocean.retune;
	if (!retune.pending[index - 1] || ocean.frame - retune.lastFrame < RETUNE_GAP_FRAMES) {
		return false;
	}
	if (ocean.cascades.retune(index) === 'waiting') {
		return false;
	}
	retune.pending[index - 1] = false;
	retune.lastFrame = ocean.frame;
	return true;
}
