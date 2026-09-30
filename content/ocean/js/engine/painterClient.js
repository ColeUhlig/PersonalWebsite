// Twin of roblox-ocean/src/client/OceanCoordinator/Painter.luau: the painter half of the
// coordinator. TWO workers beside the cascade workers, both running painterWorkerCore.js and told
// apart by the `role` on their Configure. The `maps` worker paints the emissive mask and the normal
// block, one a frame in turn, so each refreshes every other frame; the `colour` worker has the
// colour map to itself and paints one BAND of its rows a frame, four bands to the map.
//
// Everything the round trips need is here: the two workers and their Configures, the ready and
// pixels replies (the uploads and the cycle bookkeeping with them), the per-frame pack-and-send
// with its back-pressure, the timeouts and the two rotations, the per-worker sequence number every
// Paint carries and every reply echoes, which is how a reply is matched to the Paint it answers,
// and the counters the coordinator prints on its report line.
//
// The foam rides with the colour: the colour worker steps the quarter of its field under each band
// before painting it, and the finished coverage comes back with band 4. The mask has to hold the
// crests under the foam down and the two workers share no memory, so the last complete coverage is
// kept here and put on every Paint the maps worker is sent.
//
// Differences from the Luau, all from the browser: the packed field buffers are TRANSFERRED to a
// worker and come back on its reply, so each role keeps its own set (both may be sent on the same
// frame) and a set lost to a dropped Paint is replaced by a fresh one. And there IS a main-thread
// painter here: when a worker cannot be spawned or reports an error, both roles move to in-process
// workers (Review Focus 1), because a frozen sea is worse than a slower one.
//
// `update` (A3) changes painter knobs without a Configure (painterWorkerCore's `update`).
import * as FieldStore from '../core/fieldStore.js';
import * as MapRotation from '../core/mapRotation.js';
import { createInProcessWorker } from './inProcessWorker.js';
import { checkUpdate, createPainterWorker } from '../workers/painterWorkerCore.js';
import { CONFIGURE_TIMEOUT_FRAMES, PAINT_TIMEOUT_FRAMES } from './config.js';

const ROLE_COLOUR = 'colour';
const ROLE_MAPS = 'maps';
const ROLES = Object.freeze([ROLE_MAPS, ROLE_COLOUR]);
// Both workers have to answer their Configure before either is painted: a sea with half its maps
// moving is a worse thing to look at than one that starts a frame later.
const WORKER_COUNT = 2;

// Which cascades each map reads. Mask and colour read them all; the normal map takes every cascade
// BUT the first, because cascade 1 is the swell whose slopes the vertices already carry, and
// painting it again would light the same hill twice. With a single cascade that list is EMPTY and
// the normal map stays at its flat resting state.
export function cascades(count) {
	const mask = [];
	const colour = [];
	const normal = [];
	for (let index = 1; index <= count; index++) {
		mask.push(index);
		colour.push(index);
		if (index > 1) {
			normal.push(index);
		}
	}
	return { mask, colour, normal };
}

function freshBuffers(painter) {
	const values = FieldStore.bufferSize(painter.cells) / 4;
	return Array.from({ length: painter.count }, () => new Float32Array(values));
}

function configure(painter) {
	painter.workers.maps.postMessage({ type: 'configure', config: painter.mapsConfig });
	painter.workers.colour.postMessage({ type: 'configure', config: painter.colourConfig });
}

// Both roles onto this thread, the reason kept and said once. Everything in flight is given up:
// the sequence numbers carry on, so nothing an old worker might still send can match.
function toMainThread(painter, why) {
	if (painter.mode === 'main-thread') {
		return;
	}
	painter.mode = 'main-thread';
	painter.reason = why;
	for (const role of ROLES) {
		painter.workers[role]?.terminate();
	}
	painter.log.warn(`[ocean] painters on the main thread: ${why}`);
	wire(painter, () => createInProcessWorker(createPainterWorker));
	painter.ready = false;
	painter.readies = 0;
	painter.pendingColour = false;
	painter.pendingMaps = false;
	// The new colour worker's base is empty until it paints band 1, so the rotation starts there
	// again rather than painting bands from a base nothing has filled.
	painter.colourFrame = 0;
	painter.buffers = { maps: null, colour: null };
	painter.configuredFrame = painter.frame;
	configure(painter);
}

function onError(painter, role, event) {
	// `||`, not `??`: a worker that fails to load reports an empty message.
	const text = event?.message || 'unknown error';
	if (painter.mode === 'workers') {
		toMainThread(painter, `${role} painter failed: ${text}`);
		return;
	}
	// Already on this thread: nothing further to fall back to. The pending paint is left to the
	// timeout, which lets painting resume; said once so a fill that throws every turn cannot flood.
	if (!painter.warnedMainThreadError) {
		painter.log.warn(`[ocean] ${role} painter failed on the main thread: ${text}`);
		painter.warnedMainThreadError = true;
	}
}

// Each worker is recorded as soon as it exists, so a spawn that throws on the second role still
// leaves the first where toMainThread can terminate it. Both handlers act only while their own
// worker is the current one: terminate() cancels nothing already queued, so when both module
// workers fail to load, the second error (or a ready one sent first) can land after the first has
// replaced them, and must not be read as a main-thread failure or counted toward the new pair.
function wire(painter, spawn) {
	painter.workers = { maps: null, colour: null };
	for (const role of ROLES) {
		const worker = spawn(role);
		worker.onmessage = ({ data }) => {
			if (painter.workers[role] === worker) {
				onReply(painter, role, data);
			}
		};
		worker.onerror = (event) => {
			// Handled (or deliberately ignored) here, so cancelled either way: the page must not
			// also report it as an uncaught error.
			event?.preventDefault?.();
			if (painter.workers[role] === worker) {
				onError(painter, role, event);
			}
		};
		painter.workers[role] = worker;
	}
}

function onStale(painter, fromColour, sequence, expected) {
	// One warn per worker for the session; the count on the report line says how often.
	painter.stale += 1;
	const key = fromColour ? 'warnedStaleColour' : 'warnedStaleMaps';
	if (!painter[key]) {
		painter.log.warn(`[ocean] painter: stale ${fromColour ? 'colour' : 'maps'} reply (sequence ${sequence}, expected ${expected})`);
		painter[key] = true;
	}
}

function uploadColour(painter, data) {
	const sink = painter.sink;
	if (sink) {
		sink.uploadColourBand(data.band, data.pixels);
	}
	// The last band brings the finished coverage and one roughness map per ring painted from it.
	// The coverage is copied whatever the sink: every maps Paint until the next cycle reads it.
	if (data.coverage) {
		painter.coverage.set(data.coverage);
		if (sink) {
			data.roughness.forEach((pixels, index) => sink.uploadRoughness(index + 1, pixels));
		}
	}
}

// One map's worth of pixels, matched to its Paint by sequence number before anything else on the
// reply is read. A reply to a Paint the timeout gave up on is counted as stale and dropped whole,
// its pixels, its coverage and its costs alike. The cycle is timed in FRAMES, from the frame the
// Paint went out on to the frame `step` last ran on.
function onPixels(painter, role, data) {
	// The field buffers come home whatever the sequence: a role without a set (its last one went
	// with a Paint the timeout gave up on) takes them, one that already has a fresh set drops them.
	if (!painter.buffers[role] && Array.isArray(data.fields)) {
		painter.buffers[role] = data.fields.map((buffer) => new Float32Array(buffer));
	}
	const fromColour = data.slot === MapRotation.COLOUR;
	const expected = fromColour ? painter.colourSequence : painter.mapsSequence;
	if (data.sequence !== expected) {
		onStale(painter, fromColour, data.sequence, expected);
		return;
	}
	if (!painter.sink) {
		painter.dropped += 1;
	}
	const started = performance.now();
	if (fromColour) {
		uploadColour(painter, data);
		painter.stage.upload += (performance.now() - started) / 1000;
		painter.foamCover = data.first;
		// Every band steps its own quarter of the field, so every band's cost is added.
		painter.foamSeconds += data.second / 1000;
		painter.colourSeconds += data.third / 1000;
		painter.pendingColour = false;
		painter.cycleColour = Math.max(painter.cycleColour, painter.frame - painter.sentColourFrame);
	} else {
		painter.sink?.uploadMaskOrNormal(data.slot, data.pixels);
		painter.stage.upload += (performance.now() - started) / 1000;
		painter.maskMax = data.first;
		painter.pendingMaps = false;
		painter.cycleMaps = Math.max(painter.cycleMaps, painter.frame - painter.sentMapsFrame);
	}
}

function onReply(painter, role, data) {
	if (data.type === 'ready') {
		// The reply carries no role that is used: what is kept is a COUNT, as in the Luau, and a
		// re-send goes to both workers and starts it again.
		painter.readies += 1;
		painter.log.info?.(`[ocean] painter ready ${painter.readies} of ${WORKER_COUNT}`);
		painter.ready = painter.readies >= WORKER_COUNT;
		return;
	}
	if (data.type === 'pixels') {
		onPixels(painter, role, data);
		return;
	}
	painter.log.warn(`[ocean] ${role} painter sent an unknown message type ${data.type}`);
}

// This role's field buffers with this frame's display fields packed in, handed over: they travel
// with the Paint and come back on its reply.
function takePacked(painter, role, store) {
	const buffers = painter.buffers[role] ?? freshBuffers(painter);
	painter.buffers[role] = null;
	for (let cascadeIndex = 1; cascadeIndex <= painter.count; cascadeIndex++) {
		FieldStore.pack(store.display[cascadeIndex - 1], buffers[cascadeIndex - 1]);
	}
	return buffers.map((values) => values.buffer);
}

// A Paint still in flight holds this frame back; one in flight longer than PAINT_TIMEOUT_FRAMES is
// given up on, said once, so a worker whose paint threw cannot stall its maps for the session. The
// next Paint carries a new sequence number, so a reply that was only slow is counted as stale.
function heldBack(painter, frame, pendingKey, sentKey, warnedKey, name) {
	if (!painter[pendingKey]) {
		return false;
	}
	painter.skipped += 1;
	if (frame - painter[sentKey] > PAINT_TIMEOUT_FRAMES) {
		if (!painter[warnedKey]) {
			painter.log.warn(`[ocean] ${name} painter silent for ${PAINT_TIMEOUT_FRAMES} frames; dropping the pending paint`);
			painter[warnedKey] = true;
		}
		painter[pendingKey] = false;
	}
	return true;
}

// The colour worker's turn: one band of the map. The turn is counted BEFORE the band is read, so
// the rotation starts on band 1, the one that paints the base the other three upsample.
function sendColour(painter, frame, t, store) {
	if (heldBack(painter, frame, 'pendingColour', 'sentColourFrame', 'warnedSilentColour', 'colour')) {
		return;
	}
	painter.colourFrame += 1;
	const band = MapRotation.band(painter.colourFrame, MapRotation.BANDS);
	painter.colourSequence += 1;
	const fields = takePacked(painter, ROLE_COLOUR, store);
	painter.workers.colour.postMessage({ type: 'paint', turn: band, sequence: painter.colourSequence, t, fields }, fields);
	painter.pendingColour = true;
	painter.sentColourFrame = frame;
}

// The maps worker's turn: the mask and the normal block in turn, behind the last foam coverage the
// colour worker sent. The turns are counted, not the frames, so the slots keep alternating when
// frames are held back. A slot with nothing to read (the normal map with a single cascade) sends
// nothing, but its turn still counts, so the mask keeps taking every other one.
function sendMaps(painter, frame, t, store) {
	if (heldBack(painter, frame, 'pendingMaps', 'sentMapsFrame', 'warnedSilentMaps', 'maps')) {
		return;
	}
	painter.mapsFrame += 1;
	const slot = MapRotation.mapsSlot(painter.mapsFrame);
	if (slot === MapRotation.NORMAL && !painter.paintsNormal) {
		return;
	}
	painter.mapsSequence += 1;
	const fields = takePacked(painter, ROLE_MAPS, store);
	// The coverage is copied by postMessage, not transferred: every maps Paint carries it.
	painter.workers.maps.postMessage({ type: 'paint', turn: slot, sequence: painter.mapsSequence, t, fields, coverage: painter.coverage }, fields);
	painter.pendingMaps = true;
	painter.sentMapsFrame = frame;
}

/**
 * @param {object} options
 * @param {object} options.config the MAPS worker's Painter.Config; the colour one is a shallow clone
 * @param {(role: string) => object} options.spawn a WorkerLike for the role, or throws
 * @param {object | null} options.sink uploadColourBand(band, pixels), uploadMaskOrNormal(slot, pixels), uploadRoughness(ring, pixels)
 * @param {{ paint: number, upload: number }} options.stage the coordinator's cumulative stage seconds
 * @param {{ warn: Function, info?: Function }} [options.log]
 */
export function create({ config, spawn, sink = null, stage, log = console }) {
	const count = config.sizes.length;
	const painter = {
		mapsConfig: config,
		colourConfig: { ...config, role: ROLE_COLOUR },
		count,
		cells: config.n * config.n,
		paintsNormal: config.normalCascades.length > 0,
		// One set of packed field buffers per role, null while that set is out with a Paint.
		buffers: { maps: null, colour: null },
		// The last complete foam coverage, zero-filled so the Paints before the first band 4 carry
		// no foam rather than no buffer.
		coverage: new Float32Array(config.texels * config.texels),
		sink,
		stage,
		log,
		workers: null,
		mode: 'workers',
		reason: null,
		warnedMainThreadError: false,
		ready: false,
		readies: 0,
		configuredFrame: 0,
		warnedNotReady: false,
		pendingColour: false,
		sentColourFrame: 0,
		colourSequence: 0,
		colourFrame: 0,
		cycleColour: 0,
		warnedSilentColour: false,
		warnedStaleColour: false,
		pendingMaps: false,
		sentMapsFrame: 0,
		mapsSequence: 0,
		mapsFrame: 0,
		cycleMaps: 0,
		warnedSilentMaps: false,
		warnedStaleMaps: false,
		skipped: 0,
		stale: 0,
		dropped: 0,
		maskMax: 0,
		foamCover: 0,
		foamSeconds: 0,
		colourSeconds: 0,
		frame: 0,
		windowFrames: 0,
		lastPaint: stage.paint,
		lastUpload: stage.upload,
		lastFoam: 0,
		lastColour: 0,
		lastSkipped: 0,
		lastStale: 0,
		lastDropped: 0,
	};
	try {
		wire(painter, spawn);
		configure(painter);
	} catch (error) {
		toMainThread(painter, `painter workers could not start: ${error.message}`);
	}
	return painter;
}

/**
 * Changes painter knobs without a Configure: both workers get it, and both kept configs take it,
 * so a Configure re-sent after a timeout or on the main-thread fallback carries it too. When the
 * normal map loses its last cascade, or the foam is switched off, what was painted before would
 * otherwise stay on the water, so the sink is asked to put those maps back to rest.
 * @param {object} settings keys from painterWorkerCore's UPDATABLE
 */
export function update(painter, settings) {
	checkUpdate(settings, painter.count);
	const hadNormal = painter.paintsNormal;
	const hadFoam = painter.mapsConfig.foamEnabled;
	painter.mapsConfig = { ...painter.mapsConfig, ...settings };
	painter.colourConfig = { ...painter.colourConfig, ...settings };
	painter.paintsNormal = painter.mapsConfig.normalCascades.length > 0;
	for (const role of ROLES) {
		painter.workers[role]?.postMessage({ type: 'update', settings });
	}
	if (hadNormal && !painter.paintsNormal) {
		painter.sink?.clearNormal?.();
	}
	if (hadFoam && !painter.mapsConfig.foamEnabled) {
		painter.coverage.fill(0);
		painter.sink?.resetRoughness?.();
	}
}

// One turn to each painter, from the fields that were just blended. The `paint` stage this charges
// measures the packs and the two sends only; the uploads are charged where they land.
export function step(painter, frame, t, store) {
	painter.frame = frame;
	painter.windowFrames += 1;
	const started = performance.now();
	if (painter.ready) {
		sendColour(painter, frame, t, store);
		sendMaps(painter, frame, t, store);
	} else if (frame - painter.configuredFrame > CONFIGURE_TIMEOUT_FRAMES) {
		// A ready carries no role, so which of the two is silent cannot be told: both are configured
		// again and the count starts over.
		if (!painter.warnedNotReady) {
			painter.log.warn(`[ocean] painters not ready after ${CONFIGURE_TIMEOUT_FRAMES} frames; re-sending Configure`);
			painter.warnedNotReady = true;
		}
		painter.configuredFrame = frame;
		painter.readies = 0;
		configure(painter);
	}
	painter.stage.paint += (performance.now() - started) / 1000;
}

// The window the report line prints: packing-and-sending and uploading in ms a frame, the Paints
// held back, the replies dropped as stale, the pixels dropped for want of a sink, the widest
// Paint-to-pixels gap in frames of the two workers, the mask's running maximum, the foam step and
// the colour turn in ms a frame, and the foam field's raw mean. Reading it starts the next window;
// the running maximum and the foam mean are not window figures and carry on.
export function report(painter) {
	const stage = painter.stage;
	const frames = Math.max(painter.windowFrames, 1);
	const result = {
		paintMs: ((stage.paint - painter.lastPaint) / frames) * 1000,
		uploadMs: ((stage.upload - painter.lastUpload) / frames) * 1000,
		skipped: painter.skipped - painter.lastSkipped,
		stale: painter.stale - painter.lastStale,
		dropped: painter.dropped - painter.lastDropped,
		// The worse of the two: one number says whether ANY map is stale by more than its refresh.
		cycleFrames: Math.max(painter.cycleColour, painter.cycleMaps),
		maskMax: painter.maskMax,
		foamMs: ((painter.foamSeconds - painter.lastFoam) / frames) * 1000,
		foamCover: painter.foamCover,
		colourMs: ((painter.colourSeconds - painter.lastColour) / frames) * 1000,
	};
	painter.lastPaint = stage.paint;
	painter.lastUpload = stage.upload;
	painter.lastFoam = painter.foamSeconds;
	painter.lastColour = painter.colourSeconds;
	painter.lastSkipped = painter.skipped;
	painter.lastStale = painter.stale;
	painter.lastDropped = painter.dropped;
	painter.windowFrames = 0;
	painter.cycleColour = 0;
	painter.cycleMaps = 0;
	return result;
}

export function mode(painter) {
	return painter.mode;
}

export function fallbackReason(painter) {
	return painter.reason;
}

export function ready(painter) {
	return painter.ready;
}
