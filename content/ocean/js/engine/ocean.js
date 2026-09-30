// Twin of roblox-ocean/src/client/OceanCoordinator/OceanClient.client.luau: the ocean on the
// client. Picks a tier, spawns one worker per cascade and two painters, builds the surface and the
// horizon, and each frame: advances the clock, promotes this frame's cascade and asks it to evolve,
// cross-fades every cascade's last two results over the three frames since it was promoted (`blend`
// on the report is the mean fade fraction and reads 0.67 while every result arrives in time for
// its rotation -- see the note at the request site), hands each painter its turn (a band of the
// colour map, and the mask or the normal block), writes the patches' vertices (every ring every
// frame except the outermost, which takes the even frames) and shifts each ring's window onto
// whatever the camera is looking at, moves the horizon onto the last ring's window, and sets every
// patch's glow from the camera and the sun. The painters' pixels come back later in the same frame,
// or a frame or two later under load, and go to the sink where they land.
//
// Not ported: the Workspace attribute reading (config.js reads the URL instead), the Gerstner-bank
// A/B, the bench and every Instance. The glow the Luau writes into 232 EmissiveStrengths
// (Materials.setStrengths) is written into `strengths` here, patches first in `surface.patches`
// order and then the horizon quads, for the renderer to copy into its materials.
//
// Differences from the Luau, all from the browser: Studio's "always High" is gone (the tier is the
// URL's, else the probe's); `step` is given the focus, the eye and the sun instead of reading the
// camera and Lighting; and `dtSeconds` only feeds the report's shifts-per-second, never the maths,
// so a tab hidden for 45 s comes back to the sea the clock says, not a 45 s step of anything.
import * as Cascade from '../core/cascade.js';
import * as FFT from '../core/fft.js';
import * as FieldStore from '../core/fieldStore.js';
import * as OceanClock from '../core/oceanClock.js';
import * as RingLayout from '../core/ringLayout.js';
import * as ScatterLobe from '../core/scatterLobe.js';
import * as Spectrum from '../core/spectrum.js';
import * as Swells from '../core/swells.js';
import * as Tier from '../core/tier.js';
import * as WaterColour from '../core/waterColour.js';
import * as WaveField from '../core/waveField.js';
import { color3 } from '../core/luau.js';
import { pageBounds } from './bounds.js';
import { createCascades } from './cascadeTransport.js';
import * as HorizonState from './horizonState.js';
import * as PainterClient from './painterClient.js';
import * as SurfaceState from './surfaceState.js';
import {
	BAND_ROWS,
	COLOUR_TEXELS,
	FOAM_TEXELS,
	LOOP_PERIOD,
	MAP_TEXELS,
	NORMAL_BLOCK_STUDS,
	NORMAL_BLOCK_TEXELS,
	NORMAL_IMAGE_TEXELS,
	REPORT_EVERY_FRAMES,
	SEED,
	SWELL_SPECS,
} from './config.js';

export const REPORT_WINDOW = REPORT_EVERY_FRAMES;

// Which fields the per-frame blend has to produce: all eight, since the painter's foam reads the
// Jacobian fields.
const BLEND_FIELDS = FieldStore.FIELD_NAMES;
// `render` is the page's own: main.js times view.render() and charges it with addStageSeconds.
const STAGES = Object.freeze(['evolve', 'blend', 'snap', 'write', 'horizon', 'paint', 'upload', 'strength', 'render']);

// The tier probe. What it replaces in the Luau: 60 frames of the empty scene, which measured
// nothing -- with no ocean to draw every machine sits on the frame cap, so every device was called
// High. This times the work the ocean actually does instead: one cascade at the High tier's
// lattice, evolved and synthesised, median of three runs (thresholds in Tier.choose).
const PROBE_N = 64;
const PROBE_SIZE = 256;
const PROBE_SIZES = Object.freeze([256, 64, 16]);
const PROBE_RUNS = 3;

export function probeCascadeMs() {
	const band = WaveField.bands(PROBE_SIZES, PROBE_N)[0];
	const cascade = Cascade.create({
		n: PROBE_N,
		size: PROBE_SIZE,
		kMin: band.kMin,
		kMax: band.kMax,
		seed: 1,
		loopPeriod: LOOP_PERIOD,
		params: Spectrum.NORMAL,
	});
	const plan = FFT.plan(PROBE_N);
	const times = [];
	for (let run = 1; run <= PROBE_RUNS; run++) {
		const started = performance.now();
		// A different time each run, so nothing can be answered from the last run's state.
		Cascade.evolve(cascade, run);
		Cascade.synthesise(cascade, plan);
		times.push(performance.now() - started);
	}
	times.sort((a, b) => a - b);
	return times[Math.ceil(times.length / 2) - 1];
}

function swellsFor(config) {
	const specs = SWELL_SPECS.map((spec) => ({
		wavelength: spec.wavelength,
		amplitude: spec.amplitude * config.swellScale,
		direction: spec.direction,
		phase: spec.phase,
	}));
	return Swells.create(specs, config.params, LOOP_PERIOD);
}

function byteColour(bytes) {
	return color3(bytes[0] / 255, bytes[1] / 255, bytes[2] / 255);
}

// The painters' Configure, exactly as the Luau's `painterConfig`: the MAPS worker's; the client
// clones it for the colour worker with the other role on it. The calibration views swap the normal
// map's cascades: `map` paints cascade 1 alone as one block over the whole tile (the vertices are
// flat, so the map carries every slope), `vertex` paints none (the vertices carry them).
function painterConfigFor(config, preset, count) {
	const { mask, colour, normal } = PainterClient.cascades(count);
	// One roughness base per ring; a list shorter than the rings repeats its last entry.
	const ringRoughness = preset.rings.map((_, i) => config.roughness[Math.min(i, config.roughness.length - 1)]);
	const foam = config.foam;
	const painterConfig = {
		role: 'maps',
		n: preset.n,
		sizes: preset.sizes,
		texels: MAP_TEXELS,
		colourTexels: COLOUR_TEXELS,
		bandRows: BAND_ROWS,
		tile: preset.textureTile,
		blockTexels: NORMAL_BLOCK_TEXELS,
		blockStuds: NORMAL_BLOCK_STUDS,
		imageTexels: NORMAL_IMAGE_TEXELS,
		maskCascades: mask,
		colourCascades: colour,
		normalCascades: normal,
		peak: config.peak,
		tint: config.tint,
		gamma: config.maskGamma,
		decay: config.maskDecay,
		// 256 deep-to-subsurface triples, built once here rather than on the painter.
		lut: WaterColour.lut(byteColour(config.deep), byteColour(config.subsurface)),
		foamEnabled: foam.enabled,
		// No cascade list of its own: the foam's fold test reads colourCascades.
		foamTexels: FOAM_TEXELS,
		foamWhitecap: foam.whitecap,
		foamGrow: foam.grow,
		foamDecay: foam.decay,
		foamThreshold: foam.threshold,
		foamFeather: foam.feather,
		foamLace: foam.lace,
		foamOpacity: foam.opacity,
		foamRoughness: foam.roughness,
		// Bytes already: the colour map is written in bytes.
		foamColour: [foam.colour[0], foam.colour[1], foam.colour[2]],
		ringRoughness,
		// The Jacobian is taken at the displacement the surface is actually written with.
		chop: config.chop,
	};
	if (config.calibrate === 'map') {
		return { ...painterConfig, normalCascades: [1], blockStuds: preset.textureTile, blockTexels: NORMAL_IMAGE_TEXELS };
	}
	if (config.calibrate === 'vertex') {
		return { ...painterConfig, normalCascades: [] };
	}
	return painterConfig;
}

function cascadeConfigFor(config, preset, bands, index) {
	return {
		n: preset.n,
		size: preset.sizes[index - 1],
		kMin: bands[index - 1].kMin,
		kMax: bands[index - 1].kMax,
		seed: SEED * 7919 + index,
		loopPeriod: LOOP_PERIOD,
		params: config.params,
	};
}

// With the workers turned off the painter runs on this thread too: a spawn that refuses sends the
// client to its in-process workers with this reason kept.
function refuseSpawn() {
	throw new Error('workers turned off (?workers=0)');
}

function tierLine(ocean, probeMs) {
	const { config, layout, bounds } = ocean;
	const probe = probeMs == null ? 'forced' : probeMs.toFixed(2);
	return `[ocean] tier=${ocean.tierName} vertices=${layout.vertexCount} cascades=${ocean.preset.sizes.length} probeMs=${probe} scale=${config.params.scale} chop=${config.chop} swellScale=${config.swellScale} peak=${config.peak} flat=${config.flatNormals} patches=${layout.patches.length} bounds=${bounds.lateral},${bounds.height} outerRate=1/2`;
}

/**
 * @param {object} config from readConfig
 * @param {object} deps
 * @param {(index: number) => object} deps.spawnCascade a WorkerLike for a cascade, or throws
 * @param {(role: string) => object} deps.spawnPainter a WorkerLike for a painter role, or throws
 * @param {() => number} deps.now the wall clock in seconds (the Luau's GetServerTimeNow)
 * @param {number} [deps.probeMs] skips the probe with this result when the URL forces no tier
 * @param {{ warn: Function, info?: Function }} [deps.log]
 */
export function create(config, { spawnCascade, spawnPainter, now, probeMs, log = console }) {
	const bounds = pageBounds({ params: config.params, chop: config.chop, swellScale: config.swellScale });
	const measured = config.tier ? null : (probeMs ?? probeCascadeMs());
	const tierName = config.tier ?? Tier.choose(measured);
	const preset = Tier.presets[tierName];
	const layout = RingLayout.build({ rings: preset.rings, patchCells: preset.patchCells, textureTile: preset.textureTile });
	const store = FieldStore.create(preset.n, preset.sizes);
	const bands = WaveField.bands(preset.sizes, preset.n);
	const surface = SurfaceState.create(layout, bounds, config.flatNormals);
	// The SAME texture tile as the patches: the quads share the patches' maps.
	const horizon = HorizonState.create(preset.textureTile, preset.rings[preset.rings.length - 1].halfExtent);
	const stage = Object.fromEntries(STAGES.map((name) => [name, 0]));
	const cascades = createCascades({
		count: preset.sizes.length,
		cells: preset.n * preset.n,
		configFor: (index) => cascadeConfigFor(config, preset, bands, index),
		spawn: spawnCascade,
		useWorkers: config.useWorkers,
		onFields: (index, packed, t) => FieldStore.receive(store, index, packed, t),
		onReady: (index) => log.info?.(`[ocean] worker ${index} ready`),
		log,
	});
	const painter = PainterClient.create({
		config: painterConfigFor(config, preset, store.count),
		spawn: config.useWorkers ? spawnPainter : refuseSpawn,
		sink: null,
		stage,
		log,
	});
	const ocean = {
		config,
		tierName,
		preset,
		layout,
		bounds,
		store,
		swells: swellsFor(config),
		surface,
		horizon,
		cascades,
		painter,
		strengths: new Float32Array(surface.patches.length + horizon.quads.length),
		frame: 0,
		t: 0,
		sink: null,
		now,
		stage,
		// The report's running totals and their values at the last report.
		elapsed: 0,
		snapCount: 0,
		blendSum: 0,
		last: { stage: { ...stage }, elapsed: 0, snapCount: 0, blendSum: 0 },
		lastReport: null,
		quadCentre: new Float64Array(2),
	};
	log.info?.(tierLine(ocean, measured));
	return ocean;
}

export function attachSink(ocean, sink) {
	ocean.sink = sink;
	ocean.painter.sink = sink;
}

// Promote BEFORE asking for the next result, on this cascade's own rotation frame: whatever arrived
// since the last rotation becomes current, the old previous becomes the free waiting slot, and only
// then can a new result be sent into it. The fixed schedule is what lets the fade be counted in
// frames, and freeing the slot first is what stops an arrival from landing in a slot the display is
// reading. The request is at the CURRENT clock: the worker answers about a frame later, so a result
// is already slightly in the past when it lands. Leading the request was tried and reverted in the
// Luau (Cole saw the near water jitter); `blend` on the report is the measurement that says whether
// the frame-counted fade is working: 0.67 when nothing misses its rotation. The main-thread path
// receives synchronously after the promotion, so its result waits one rotation before it shows.
function evolveStage(ocean, t) {
	// null on a frame whose slot belongs to a cascade this tier does not have: no evolve at all.
	const index = OceanClock.cascadeForFrame(ocean.frame, ocean.store.count);
	if (index !== null) {
		FieldStore.promote(ocean.store, index, ocean.frame);
		ocean.cascades.request(index, t, ocean.frame);
	}
}

function blendStage(ocean) {
	const store = ocean.store;
	for (let index = 1; index <= store.count; index++) {
		const fraction = OceanClock.fadeFraction(ocean.frame, store.promotedFrame[index - 1], OceanClock.PERIOD);
		if (index === 1) {
			ocean.blendSum += fraction;
		}
		FieldStore.blend(store, index, fraction, BLEND_FIELDS);
	}
}

// The glow, one strength per patch and quad. The camera POSITION here, not the focus the windows
// follow: the lobe asks where the sun's scattered light would reach the eye. It runs after the
// horizon update because a quad centre read before the first update is infinite. A hidden patch
// keeps its last value.
function strengthStage(ocean, eye, sun) {
	const { surface, horizon, strengths } = ocean;
	const params = ocean.config.scatter;
	const [ex, ey, ez] = eye;
	const [sx, sy, sz] = sun;
	const patches = surface.patches;
	for (let i = 0; i < patches.length; i++) {
		const state = patches[i];
		if (state.hidden) {
			continue;
		}
		const patch = state.patch;
		const centre = surface.centres[patch.ring - 1];
		strengths[i] = ScatterLobe.strength(centre.x + patch.centreX, centre.z + patch.centreZ, ex, ey, ez, sx, sy, sz, params);
	}
	const out = ocean.quadCentre;
	for (let q = 0; q < horizon.quads.length; q++) {
		HorizonState.quadCentre(horizon, horizon.quads[q], out);
		strengths[patches.length + q] = ScatterLobe.strength(out[0], out[1], ex, ey, ez, sx, sy, sz, params);
	}
}

// Runs one stage and charges its wall time to stage[name], in seconds like the Luau.
function timed(ocean, name, run) {
	const started = performance.now();
	run();
	ocean.stage[name] += (performance.now() - started) / 1000;
}

/**
 * One frame.
 * @param {number} dtSeconds wall time since the last frame; feeds the report only
 * @param {[number, number]} focus what the camera looks at, [x, z]: every ring follows it
 * @param {[number, number, number]} eye the camera position
 * @param {[number, number, number]} sun unit vector towards the sun
 */
export function step(ocean, dtSeconds, focus, eye, sun) {
	ocean.frame += 1;
	if (Number.isFinite(dtSeconds) && dtSeconds > 0) {
		ocean.elapsed += dtSeconds;
	}
	const config = ocean.config;
	const t = config.freeze ?? OceanClock.time(ocean.now(), LOOP_PERIOD);
	ocean.t = t;
	timed(ocean, 'evolve', () => evolveStage(ocean, t));
	timed(ocean, 'blend', () => blendStage(ocean));
	// One map to the painter, from the fields that were just blended. Sent BEFORE the vertices are
	// written so a worker paints alongside the write stage; the client charges `paint` itself.
	PainterClient.step(ocean.painter, ocean.frame, t, ocean.store);
	// Every ring follows what the camera LOOKS AT; each snaps that focus to its own lattice. The
	// frame number lets the outermost ring sit out the odd frames.
	const surface = ocean.surface;
	const started = performance.now();
	ocean.snapCount += SurfaceState.snapAndWrite(surface, focus[0], focus[1], ocean.store, ocean.swells, t, config.chop, ocean.frame);
	ocean.stage.snap += surface.snapSeconds;
	ocean.stage.write += (performance.now() - started) / 1000 - surface.snapSeconds;
	// The horizon follows the LAST ring's window, never the raw camera: the hole it leaves for the
	// patches and that ring's square must be the same square.
	timed(ocean, 'horizon', () => {
		const outer = surface.centres[surface.centres.length - 1];
		HorizonState.update(ocean.horizon, outer.x, outer.z);
	});
	timed(ocean, 'strength', () => strengthStage(ocean, eye, sun));
	if (ocean.frame % REPORT_EVERY_FRAMES === 0) {
		ocean.lastReport = buildReport(ocean);
	}
}

/**
 * Charges time spent outside step() to a stage, in seconds like the rest; the report averages it
 * over the same window. The page charges `render` (view.render()) once a frame.
 * @param {string} name one of the stages
 * @param {number} seconds a finite, non-negative wall time
 */
export function addStageSeconds(ocean, name, seconds) {
	if (!STAGES.includes(name)) {
		throw new Error(`addStageSeconds: unknown stage ${JSON.stringify(name)}`);
	}
	if (!Number.isFinite(seconds) || seconds < 0) {
		throw new Error(`addStageSeconds: ${name} needs a finite non-negative time, got ${seconds}`);
	}
	ocean.stage[name] += seconds;
}

function stageDeltaMs(ocean, name, frames) {
	return ((ocean.stage[name] - ocean.last.stage[name]) / frames) * 1000;
}

// The mean worker time over the cascades whose replies have been measured; null when the cascades
// are not on workers or none has replied yet, so a missing figure never reads as 0 ms.
function meanCascadeMs(cascades) {
	if (cascades.mode() !== 'workers') {
		return null;
	}
	let sum = 0;
	let measured = 0;
	for (let i = 0; i < cascades.lastMs.length; i++) {
		if (cascades.replied[i]) {
			sum += cascades.lastMs[i];
			measured += 1;
		}
	}
	return measured > 0 ? sum / measured : null;
}

// Cascade 1's height at (10, 10) and every cascade's current result time: the Luau line's
// `height=` and `times=`, which say the fields are alive and which clock they were computed at.
function fieldProbe(store) {
	const height = FieldStore.hasFields(store, 1) ? Cascade.sampleNoJacobian(store.display[0], 10, 10)[0] : 0;
	return { height, times: store.current.map((slot) => slot.time) };
}

// The Luau report line as numbers, over the window since the last one. `snapMs` is per ring shift
// (a ring shifts on a minority of frames); `blend` is cascade 1's mean fade fraction, 0.67 when
// every result is promoted on its own rotation and climbing towards 1 when promotions are missed.
// Not in the Luau line: `renderMs`, the page's view.render() a frame (charged after step, so the
// first window holds one render fewer), and `cascadeMs` is null until a worker reply is measured.
// Reading the painter's report closes its window too.
function buildReport(ocean) {
	const frames = REPORT_EVERY_FRAMES;
	const snaps = ocean.snapCount - ocean.last.snapCount;
	const [maxY, maxLateral] = SurfaceState.takeExtremes(ocean.surface);
	const paint = PainterClient.report(ocean.painter);
	const report = {
		frame: ocean.frame,
		t: ocean.t,
		evolveMs: stageDeltaMs(ocean, 'evolve', frames),
		blendMs: stageDeltaMs(ocean, 'blend', frames),
		blend: (ocean.blendSum - ocean.last.blendSum) / frames,
		snapMs: stageDeltaMs(ocean, 'snap', Math.max(snaps, 1)),
		snaps,
		snapsPerSec: snaps / Math.max(ocean.elapsed - ocean.last.elapsed, 1e-6),
		writeMs: stageDeltaMs(ocean, 'write', frames),
		horizonMs: stageDeltaMs(ocean, 'horizon', frames),
		paintMs: paint.paintMs,
		// The CPU copy of the painters' pixels into the texture arrays as they land (the readout
		// labels it `copy`); the GPU upload happens inside render. Name kept for compatibility.
		uploadMs: paint.uploadMs,
		strengthMs: stageDeltaMs(ocean, 'strength', frames),
		renderMs: stageDeltaMs(ocean, 'render', frames),
		paintSkipped: paint.skipped,
		paintStale: paint.stale,
		paintDropped: paint.dropped,
		cycleFrames: paint.cycleFrames,
		maskMax: paint.maskMax,
		foamMs: paint.foamMs,
		foamCover: paint.foamCover,
		colourMs: paint.colourMs,
		maxY,
		maxLateral,
		cascadeMs: meanCascadeMs(ocean.cascades),
		...fieldProbe(ocean.store),
	};
	ocean.last = { stage: { ...ocean.stage }, elapsed: ocean.elapsed, snapCount: ocean.snapCount, blendSum: ocean.blendSum };
	return report;
}

export function report(ocean) {
	return ocean.lastReport;
}

export function status(ocean) {
	const cascadeMode = ocean.cascades.mode();
	const painterMode = PainterClient.mode(ocean.painter);
	return {
		frame: ocean.frame,
		t: ocean.t,
		tier: ocean.tierName,
		mode: cascadeMode === 'workers' && painterMode === 'workers' ? 'workers' : 'main-thread',
		fallbackReason: ocean.cascades.fallbackReason() ?? PainterClient.fallbackReason(ocean.painter),
		workersReady: ocean.cascades.readyCount(),
		painterReady: PainterClient.ready(ocean.painter),
		patches: ocean.surface.patches.length,
		vertices: ocean.layout.vertexCount,
		sinkAttached: ocean.sink !== null,
	};
}
