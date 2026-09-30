// Twin of roblox-ocean/src/client/OceanCoordinator/PainterWorker.client.luau: the material painter
// in one of two ROLES. Configure once, with the role on it (it allocates), then every Paint unpacks
// the packed display fields, paints one turn's worth of texels and posts the bytes back behind the
// Paint's own sequence number, which is how the coordinator tells which Paint a reply answers.
//
// The `maps` role paints the emissive mask and the normal block, one a turn, so each is refreshed
// every other frame. The `colour` role has the colour map to itself and paints one BAND of its rows
// a turn, four bands to the map, so a colour texel comes round every fourth frame.
//
// The foam belongs to the colour role: ONE field over the same tile at its own texels, a quarter of
// whose rows are stepped before each band, the quarter that lies under the rows that band is about
// to paint. Every texel of the field therefore steps exactly once a cycle, at the rate the decay is
// tuned for. The coverage the four bands write paints the ring roughness maps, which ride back with
// the LAST band because that is the band that completed it. The mask has to hold the crests under
// the foam down, and the two roles share no memory, so the maps role is sent that coverage: the
// coordinator keeps the last complete one and puts it on every Paint it sends there.
//
// The field buffers arrive transferred and go back transferred on the reply, so one set shuttles
// per role. The pixels, the coverage and the roughness maps go back as copies, because the worker
// keeps painting into its own. Browser-free: the Worker entry point is painter.worker.js.
//
// `update` (A3; the Luau has none, Studio never moved a slider while the painter ran) changes the
// knobs a slider or a stage switch moves without a Configure: it merges them into the config and
// rebuilds the colour role's derived knobs, and reallocates and resets nothing. The foam field,
// its quarter means, the running maximum and the lace carry on, which is the whole difference: a
// Configure per slider tick would wipe the foam and stutter the maps.
import * as FieldStore from '../core/fieldStore.js';
import * as FoamField from '../core/foamField.js';
import * as FoamPaint from '../core/foamPaint.js';
import * as FoamRoughness from '../core/foamRoughness.js';
import * as MapRotation from '../core/mapRotation.js';
import * as NormalTexels from '../core/normalTexels.js';
import * as PeakMask from '../core/peakMask.js';
import * as WaterColour from '../core/waterColour.js';
import { check, clamp, idiv, zeros } from '../core/luau.js';

const BYTES_PER_TEXEL = 4; // RGBA
const BASE_BYTES_PER_TEXEL = 3; // RGB: WaterColour.base has no alpha, and the band fill adds it
// The lace, at the colour map's own texels: 64 cells across the tile is a four-stud filament at
// the coarsest lattice, four octaves take the finest to half a stud, which is the map's own texel,
// and 0.7 a lattice leaves the coarse threads carrying the shape with the fine ones breaking their
// edges. The seed is any fixed number: what it buys is that every worker and every run builds the
// same texture, so the foam does not swim when the page reloads.
const LACE_CELLS = 64;
const LACE_SEED = 11;
const LACE_OCTAVES = 4;
const LACE_FALLOFF = 0.7;
// The two roles, spelled the way the coordinator spells them on the Configure it sends.
const ROLE_COLOUR = 'colour';
const ROLE_MAPS = 'maps';

// What an `update` may change: every knob that no allocation depends on. The sizes, the texels,
// the tile, the lut, the foam colour and the ring roughness bases still need a Configure.
export const UPDATABLE = Object.freeze([
	'chop',
	'peak',
	'tint',
	'gamma',
	'decay',
	'maskCascades',
	'colourCascades',
	'normalCascades',
	'foamEnabled',
	'foamWhitecap',
	'foamGrow',
	'foamDecay',
	'foamThreshold',
	'foamFeather',
	'foamLace',
	'foamOpacity',
	'foamRoughness',
]);
const CASCADE_LISTS = Object.freeze(['maskCascades', 'colourCascades', 'normalCascades']);

// Throws naming the first key that cannot be updated or holds a value the painter cannot use.
export function checkUpdate(settings, cascadeCount) {
	for (const [key, value] of Object.entries(settings)) {
		if (!UPDATABLE.includes(key)) {
			throw new Error(`painter update: ${key} cannot change without a Configure`);
		}
		if (CASCADE_LISTS.includes(key)) {
			const valid = Array.isArray(value) && value.every((c) => Number.isInteger(c) && c >= 1 && c <= cascadeCount);
			if (!valid) {
				throw new Error(`painter update: ${key} must list cascades 1..${cascadeCount}, got ${JSON.stringify(value)}`);
			}
		} else if (key === 'foamEnabled') {
			if (typeof value !== 'boolean') {
				throw new Error(`painter update: foamEnabled must be true or false, got ${value}`);
			}
		} else if (!Number.isFinite(value)) {
			throw new Error(`painter update: ${key} must be a finite number, got ${value}`);
		}
	}
}

// The colour role's knobs that come from the config rather than being allocated: worked out by
// Configure and again by every update.
function colourKnobs(config) {
	const [r, g, b] = config.foamColour;
	return {
		// Clamped: above 1 WaterColour.base would index past the lut's end.
		tint: clamp(config.tint, 0, 1),
		stepParams: { whitecap: config.foamWhitecap, grow: config.foamGrow, decay: config.foamDecay },
		paintParams: {
			// With foam off the fade is given a foot no sum reaches, so every texel of every band is
			// the base colour exactly: the switch as one number rather than a second fill.
			threshold: config.foamEnabled ? config.foamThreshold : 2,
			feather: config.foamFeather,
			laceSoft: config.foamLace,
			// Clamped as the tint is: over 1 the byte lerp would overshoot the foam colour.
			opacity: clamp(config.foamOpacity, 0, 1),
			r,
			g,
			b,
		},
	};
}

// Everything the `colour` role paints with. The foam pieces are built whether or not foam is on:
// what the switch decides is whether anything is painted into them, not what exists.
function colourState(config) {
	check(
		config.colourTexels === config.bandRows * MapRotation.BANDS,
		"the colour map's texels are not MapRotation.BANDS whole bands",
	);
	// The field is stepped a quarter at a time and the quarters have to meet: a remainder would
	// leave the last rows of the field stepped by nobody.
	check(config.foamTexels % MapRotation.BANDS === 0, "the foam field's rows are not MapRotation.BANDS whole quarters");
	const texels = config.texels;
	const mapBytes = texels * texels * BYTES_PER_TEXEL;
	// ONE field over the whole tile at its own texels rather than at any cascade's.
	const field = FoamField.newGrid(config.foamTexels, config.tile);
	return {
		lut: config.lut,
		...colourKnobs(config),
		field,
		fieldList: [field],
		lace: FoamPaint.lace(config.colourTexels, LACE_CELLS, LACE_SEED, LACE_OCTAVES, LACE_FALLOFF),
		quarterRows: idiv(config.foamTexels, MapRotation.BANDS),
		// One entry per band, zero until each has stepped once.
		quarterMeans: zeros(MapRotation.BANDS),
		base: new Uint8Array(texels * texels * BASE_BYTES_PER_TEXEL),
		// ONE band and not the whole map: the coordinator uploads each band as it lands.
		bandPixels: new Uint8Array(config.colourTexels * config.bandRows * BYTES_PER_TEXEL),
		coverage: new Float32Array(texels * texels),
		roughness: config.ringRoughness.map(() => new Uint8Array(mapBytes)),
	};
}

// Everything the `maps` role paints with. The mirror is the colour role's foam coverage, copied in
// from every Paint, in the FoamField shape PeakMask.fill reads; nothing here steps it.
function mapsState(config) {
	const texels = config.texels;
	return {
		mask: new Uint8Array(texels * texels * BYTES_PER_TEXEL),
		normal: new Uint8Array(config.blockTexels * config.blockTexels * BYTES_PER_TEXEL),
		mirror: { texels, foam: new Float32Array(texels * texels), scratch: new Float32Array(0) },
	};
}

export function createPainterWorker(post) {
	let config = null;
	// One Fields table per cascade, refilled from the Paint buffers every paint.
	let fields = [];
	// Exactly one of these two is built by Configure, and which one is the role.
	let colour = null;
	let maps = null;
	// The maps role's: what the peak mask normalises by, the tallest crest of the recent fills.
	let runningMax = 0;
	// The colour role's: the field's mean over its four quarters, and the milliseconds the quarter
	// this band stepped took. Zero before the first step, and zero for the session with foam off.
	let foamCover = 0;
	let foamMs = 0;

	function configure(incoming) {
		check(
			incoming.role === ROLE_COLOUR || incoming.role === ROLE_MAPS,
			`PainterWorker was configured with a role it does not have: ${incoming.role}`,
		);
		const built = incoming.sizes.map((size) => FieldStore.newFields(incoming.n, size));
		if (incoming.role === ROLE_COLOUR) {
			colour = colourState(incoming);
			maps = null;
		} else {
			maps = mapsState(incoming);
			colour = null;
		}
		config = incoming;
		fields = built;
		runningMax = 0;
		foamCover = 0;
		foamMs = 0;
		post({ type: 'ready' });
	}

	// A slider's worth of change: see the header. No reply: messages arrive in order, so the next
	// Paint already sees the new settings, and that Paint's pixels are the answer.
	function update(settings) {
		if (!config) {
			throw new Error('painter worker: update before configure');
		}
		checkUpdate(settings, config.sizes.length);
		config = { ...config, ...settings };
		if (colour) {
			Object.assign(colour, colourKnobs(config));
		}
	}

	function unpackAll(buffers) {
		const count = buffers.length;
		if (count !== config.sizes.length) {
			throw new Error(`Paint carried ${count} field buffers, expected ${config.sizes.length}`);
		}
		for (let index = 1; index <= count; index++) {
			FieldStore.unpack(new Float32Array(buffers[index - 1]), fields[index - 1]);
		}
	}

	// The band's own quarter of the field, stepped before the band is painted, and the RAW mean of
	// the whole field with each quarter as its own band last left it.
	function stepFoam(state, band) {
		const quarterRows = state.quarterRows;
		const startedFoam = performance.now();
		const mean = FoamField.stepRows(
			state.field,
			(band - 1) * quarterRows,
			quarterRows,
			fields,
			config.colourCascades,
			config.tile,
			config.chop,
			state.stepParams,
		);
		foamMs = performance.now() - startedFoam;
		const means = state.quarterMeans;
		means[band - 1] = mean;
		let total = 0;
		for (let index = 1; index <= MapRotation.BANDS; index++) {
			total += means[index - 1];
		}
		foamCover = total / MapRotation.BANDS;
	}

	// The colour role's turn: the quarter of the foam field this band's rows sit over, then the band
	// itself. Band 1 also paints the water colour the four bands upsample, which belongs to band 1
	// alone: a base repainted under band 3 would leave the map half one sea and half another.
	function paintColour(state, band, sequence, buffers) {
		// The whole turn, unpack and step and base and band and roughness together.
		const started = performance.now();
		unpackAll(buffers);
		const enabled = config.foamEnabled;
		if (enabled) {
			stepFoam(state, band);
		}
		if (band === 1) {
			WaterColour.base(state.base, config.texels, config.tile, fields, config.colourCascades, config.peak, state.tint, state.lut);
		}
		FoamPaint.band(
			state.bandPixels,
			config.colourTexels,
			(band - 1) * config.bandRows,
			config.bandRows,
			state.base,
			config.texels,
			state.fieldList,
			config.tile,
			state.paintParams,
			state.lace,
			enabled ? state.coverage : null,
		);
		// A band writes its own quarter of the coverage, so the coverage is a whole map only after the
		// last one: that is the band the roughness maps are painted on and both of them ride back with.
		const last = band === MapRotation.BANDS && enabled;
		if (last) {
			const bases = config.ringRoughness;
			for (let ring = 1; ring <= state.roughness.length; ring++) {
				FoamRoughness.fill(state.roughness[ring - 1], config.texels, state.coverage, bases[ring - 1], config.foamRoughness);
			}
		}
		const colourMs = performance.now() - started;
		const pixels = state.bandPixels.slice();
		const reply = { type: 'pixels', slot: MapRotation.COLOUR, sequence, band, pixels, first: foamCover, second: foamMs, third: colourMs, fields: buffers };
		const transfer = [...buffers, pixels.buffer];
		// The LAST band carries the coverage whatever the ring count: a preset with no rings still
		// has to send it, because the maps role's mask reads it.
		if (last) {
			reply.coverage = state.coverage.slice();
			reply.roughness = state.roughness.map((map) => map.slice());
			transfer.push(reply.coverage.buffer, ...reply.roughness.map((map) => map.buffer));
		}
		post(reply, transfer);
	}

	// The maps role's turn: the mask or the normal block, whichever the rotation asks for.
	function paintMaps(state, slot, sequence, buffers, coverage) {
		unpackAll(buffers);
		const mirror = state.mirror;
		// Copied and not kept: the mask reads the mirror on later turns too, and the next Paint's
		// coverage is a fresh copy. With foam off nothing reads the mirror, so nothing fills it.
		if (config.foamEnabled) {
			const want = mirror.foam.byteLength;
			const got = coverage?.byteLength ?? 0;
			if (got !== want) {
				throw new Error(`Paint carried ${got} coverage bytes, expected ${want}`);
			}
			mirror.foam.set(coverage);
		}
		let out;
		if (slot === MapRotation.MASK) {
			out = state.mask;
			// runningMax is 0 before the first mask fill, which then normalises by the maximum it
			// finds itself. The mirror holds the crests under the foam down, in the byte alone.
			const found = PeakMask.fill(
				out,
				config.texels,
				config.tile,
				fields,
				config.maskCascades,
				runningMax,
				config.gamma,
				config.foamEnabled ? mirror : null,
			);
			runningMax = PeakMask.nextMax(runningMax, found, config.decay);
		} else if (slot === MapRotation.NORMAL) {
			out = state.normal;
			NormalTexels.fill(out, config.blockTexels, config.blockStuds, fields, config.normalCascades);
		} else {
			throw new Error(`Paint got slot ${slot}, expected the mask or the normal map`);
		}
		// Band 0: this role paints whole maps rather than bands. runningMax rides along because the
		// coordinator reports it; the two zeros hold the places the colour reply spends on its costs.
		const pixels = out.slice();
		post(
			{ type: 'pixels', slot, sequence, band: 0, pixels, first: runningMax, second: 0, third: 0, fields: buffers },
			[...buffers, pixels.buffer],
		);
	}

	// The turn number, then the sequence number (echoed so the coordinator can tell a reply to the
	// Paint in flight from a late one), then the time the fields are true at, which nothing reads.
	function paint(message) {
		if (!config) {
			throw new Error('painter worker: paint before configure');
		}
		if (config.role === ROLE_COLOUR) {
			paintColour(colour, message.turn, message.sequence, message.fields);
		} else {
			paintMaps(maps, message.turn, message.sequence, message.fields, message.coverage);
		}
	}

	return function handle(message) {
		if (message.type === 'configure') {
			configure(message.config);
			return;
		}
		if (message.type === 'paint') {
			paint(message);
			return;
		}
		if (message.type === 'update') {
			update(message.settings);
			return;
		}
		throw new Error(`painter worker: unknown message type ${message.type}`);
	};
}
