import { test } from 'node:test';
import * as expect from '../expect.js';
import * as FieldStore from '../../../content/ocean/js/core/fieldStore.js';
import * as MapRotation from '../../../content/ocean/js/core/mapRotation.js';
import * as WaterColour from '../../../content/ocean/js/core/waterColour.js';
import { color3 } from '../../../content/ocean/js/core/luau.js';
import { createPainterWorker } from '../../../content/ocean/js/workers/painterWorkerCore.js';

const N = 16;
const SIZES = [256, 64, 16];

function config(role, overrides = {}) {
	return {
		// colourTexels 512: FoamPaint.lace needs it to be a multiple of 64 cells x 2^(4 - 1) octaves.
		role, n: N, sizes: SIZES, texels: 64, colourTexels: 512, bandRows: 128, tile: 256,
		blockTexels: 32, blockStuds: 64, imageTexels: 64,
		maskCascades: [1, 2, 3], colourCascades: [1, 2, 3], normalCascades: [2, 3],
		peak: 10.3, tint: 0.35, gamma: 0.8, decay: 0.98,
		lut: WaterColour.lut(color3(8 / 255, 46 / 255, 72 / 255), color3(28 / 255, 168 / 255, 156 / 255)),
		foamEnabled: true, foamTexels: 64, foamWhitecap: 0.35, foamGrow: 2, foamDecay: 0.86,
		foamThreshold: 0, foamFeather: 1.3, foamLace: 0.3, foamOpacity: 0.7, foamRoughness: 1,
		foamColour: [232, 228, 210], ringRoughness: [0.15, 0.2, 0.3], chop: 0.8,
		...overrides,
	};
}

function fieldBuffers() {
	return SIZES.map((size, i) => {
		const fields = FieldStore.newFields(N, size);
		for (let c = 0; c < N * N; c++) {
			fields.height[c] = Math.sin(c * 0.3 + i) * 3;
			fields.jxx[c] = Math.cos(c * 0.17) * 0.6;
		}
		const packed = new Float32Array(FieldStore.bufferSize(N * N) / 4);
		FieldStore.pack(fields, packed);
		return packed.buffer;
	});
}

function run(role, overrides) {
	const replies = [];
	const handle = createPainterWorker((message, transfer) => replies.push({ message, transfer }));
	handle({ type: 'configure', config: config(role, overrides) });
	return { handle, replies };
}

test('the colour worker answers ready and paints a band of RGBA rows', () => {
	const { handle, replies } = run('colour');
	expect.equal(replies[0].message.type, 'ready', 'ready');
	const fields = fieldBuffers();
	handle({ type: 'paint', turn: 1, sequence: 1, t: 0, fields });
	const reply = replies[1].message;
	expect.equal(reply.slot, MapRotation.COLOUR, 'colour slot');
	expect.equal(reply.band, 1, 'band 1');
	expect.equal(reply.pixels.length, 512 * 128 * 4, 'one band of RGBA');
	expect.equal(reply.fields.length, 3, 'field buffers returned');
	expect.truthy(replies[1].transfer.includes(fields[0]), 'and transferred back');
	expect.truthy(Number.isFinite(reply.first) && Number.isFinite(reply.third), 'foam cover and colour ms');
	expect.equal(reply.roughness, undefined, 'no roughness before the last band');
});

test('band 4 with foam on also returns the coverage and one roughness map per ring', () => {
	const { handle, replies } = run('colour');
	for (let band = 1; band <= 4; band++) {
		handle({ type: 'paint', turn: band, sequence: band, t: 0, fields: fieldBuffers() });
	}
	const last = replies[4].message;
	expect.equal(last.band, 4, 'band 4');
	expect.equal(last.coverage.length, 64 * 64, 'coverage over the base texels');
	expect.equal(last.roughness.length, 3, 'one map per ring');
	expect.equal(last.roughness[0].length, 64 * 64 * 4, 'RGBA roughness');
});

test('with foam off band 4 sends no roughness', () => {
	const { handle, replies } = run('colour', { foamEnabled: false });
	for (let band = 1; band <= 4; band++) {
		handle({ type: 'paint', turn: band, sequence: band, t: 0, fields: fieldBuffers() });
	}
	expect.equal(replies[4].message.roughness, undefined, 'no roughness');
});

test('the maps worker paints the mask and the normal block', () => {
	const { handle, replies } = run('maps');
	const coverage = new Float32Array(64 * 64);
	handle({ type: 'paint', turn: MapRotation.MASK, sequence: 1, t: 0, fields: fieldBuffers(), coverage });
	const mask = replies[1].message;
	expect.equal(mask.slot, MapRotation.MASK, 'mask slot');
	expect.equal(mask.pixels.length, 64 * 64 * 4, 'RGBA mask');
	expect.truthy(mask.first > 0, `running maximum found a crest: ${mask.first}`);
	handle({ type: 'paint', turn: MapRotation.NORMAL, sequence: 2, t: 0, fields: fieldBuffers(), coverage });
	expect.equal(replies[2].message.pixels.length, 32 * 32 * 4, 'RGBA normal block');
});

test('a paint with the wrong number of field buffers or an unknown role is refused', () => {
	const { handle } = run('colour');
	let message = '';
	try {
		handle({ type: 'paint', turn: 1, sequence: 1, t: 0, fields: fieldBuffers().slice(0, 2) });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('expected 3'), `field count error: ${message}`);
	let roleError = '';
	try {
		createPainterWorker(() => {})({ type: 'configure', config: config('sideways') });
	} catch (error) {
		roleError = error.message;
	}
	expect.truthy(roleError.includes('role'), `role error: ${roleError}`);
});

// fieldBuffers with every height scaled.
function scaledFieldBuffers(scale) {
	return SIZES.map((size, i) => {
		const fields = FieldStore.newFields(N, size);
		for (let c = 0; c < N * N; c++) {
			fields.height[c] = Math.sin(c * 0.3 + i) * 3 * scale;
			fields.jxx[c] = Math.cos(c * 0.17) * 0.6;
		}
		const packed = new Float32Array(FieldStore.bufferSize(N * N) / 4);
		FieldStore.pack(fields, packed);
		return packed.buffer;
	});
}

test('an update changes the knobs without resetting the running maximum; a Configure resets it', () => {
	const coverage = new Float32Array(64 * 64);
	const viaUpdate = run('maps');
	viaUpdate.handle({ type: 'paint', turn: MapRotation.MASK, sequence: 1, t: 0, fields: scaledFieldBuffers(1), coverage });
	const first = viaUpdate.replies[1].message.first;
	viaUpdate.handle({ type: 'update', settings: { gamma: 0.5, chop: 0.4 } });
	expect.equal(viaUpdate.replies.length, 2, 'an update sends no reply');
	viaUpdate.handle({ type: 'paint', turn: MapRotation.MASK, sequence: 2, t: 0, fields: scaledFieldBuffers(0.5), coverage });
	expect.near(viaUpdate.replies[2].message.first, first * 0.98, 1e-4 * first, 'the running maximum carried on and decayed');
	const viaConfigure = run('maps');
	viaConfigure.handle({ type: 'paint', turn: MapRotation.MASK, sequence: 1, t: 0, fields: scaledFieldBuffers(1), coverage });
	viaConfigure.handle({ type: 'configure', config: config('maps', { gamma: 0.5 }) });
	viaConfigure.handle({ type: 'paint', turn: MapRotation.MASK, sequence: 2, t: 0, fields: scaledFieldBuffers(0.5), coverage });
	expect.near(viaConfigure.replies.at(-1).message.first, first / 2, 1e-4 * first, 'a Configure starts the maximum again');
});

test('an update reaches the colour role: fewer cascades paint a different band, and foam off paints none', () => {
	const all = run('colour');
	all.handle({ type: 'paint', turn: 1, sequence: 1, t: 0, fields: fieldBuffers() });
	const one = run('colour');
	one.handle({ type: 'update', settings: { colourCascades: [1] } });
	one.handle({ type: 'paint', turn: 1, sequence: 1, t: 0, fields: fieldBuffers() });
	const a = all.replies[1].message.pixels;
	const b = one.replies[1].message.pixels;
	expect.truthy(a.some((value, i) => value !== b[i]), 'the band differs with cascades 2 and 3 left out');
	const off = run('colour');
	off.handle({ type: 'update', settings: { foamEnabled: false } });
	for (let band = 1; band <= 4; band++) {
		off.handle({ type: 'paint', turn: band, sequence: band, t: 0, fields: fieldBuffers() });
	}
	expect.equal(off.replies[4].message.roughness, undefined, 'foam switched off by update: no roughness');
});

test('an update may only change what needs no reallocation, and only to valid values', () => {
	const { handle } = run('colour');
	const attempt = (settings) => {
		try {
			handle({ type: 'update', settings });
			return 'ok';
		} catch (error) {
			return error.message;
		}
	};
	expect.truthy(attempt({ texels: 32 }).includes('texels'), 'texels needs a Configure');
	expect.truthy(attempt({ colourCascades: [0, 4] }).includes('colourCascades'), 'cascades out of range');
	expect.truthy(attempt({ chop: Number.NaN }).includes('chop'), 'a NaN chop');
	expect.truthy(attempt({ foamEnabled: 1 }).includes('foamEnabled'), 'not a boolean');
	expect.equal(attempt({ chop: 0.5, foamWhitecap: 0.6, maskCascades: [] }), 'ok', 'a valid update is taken');
	let before = '';
	try {
		createPainterWorker(() => {})({ type: 'update', settings: { chop: 1 } });
	} catch (error) {
		before = error.message;
	}
	expect.truthy(before.includes('update before configure'), before);
});

test('an update refuses duplicate cascades, a gamma that is not positive and a decay outside 0..1', () => {
	const { handle } = run('maps');
	const attempt = (settings) => {
		try {
			handle({ type: 'update', settings });
			return 'ok';
		} catch (error) {
			return error.message;
		}
	};
	expect.truthy(attempt({ maskCascades: [1, 1] }).includes('maskCascades'), 'a cascade listed twice');
	expect.truthy(attempt({ gamma: 0 }).includes('gamma'), 'gamma 0');
	expect.truthy(attempt({ gamma: -0.5 }).includes('gamma'), 'a negative gamma');
	expect.truthy(attempt({ decay: -0.1 }).includes('decay'), 'decay below 0');
	expect.truthy(attempt({ decay: 1.5 }).includes('decay'), 'decay above 1');
	expect.equal(attempt({ decay: 0, gamma: 0.1, normalCascades: [1, 2] }), 'ok', 'the edges and cascade 1 in the normal list are taken');
	expect.equal(attempt({ decay: 1 }), 'ok', 'decay 1 is taken');
});

test('foam switched off by update reports a foam cover of zero', () => {
	const { handle, replies } = run('colour');
	handle({ type: 'paint', turn: 1, sequence: 1, t: 0, fields: fieldBuffers() });
	expect.truthy(replies[1].message.first > 0, `some foam first: ${replies[1].message.first}`);
	handle({ type: 'update', settings: { foamEnabled: false } });
	handle({ type: 'paint', turn: 2, sequence: 2, t: 0, fields: fieldBuffers() });
	expect.equal(replies[2].message.first, 0, 'no foam cover with foam off');
});

test('the foam field and its quarter means carry over an update; a Configure starts them again', () => {
	const cover = (between) => {
		const { handle, replies } = run('colour');
		for (let band = 1; band <= 4; band++) {
			handle({ type: 'paint', turn: band, sequence: band, t: 0, fields: fieldBuffers() });
		}
		between(handle);
		handle({ type: 'paint', turn: 1, sequence: 5, t: 0, fields: fieldBuffers() });
		return replies.at(-1).message.first;
	};
	const plain = cover(() => {});
	// The opacity only changes the paint, not the step, so the foam must be exactly as without it.
	const updated = cover((handle) => handle({ type: 'update', settings: { foamOpacity: 0.4 } }));
	const configured = cover((handle) => handle({ type: 'configure', config: config('colour', { foamOpacity: 0.4 }) }));
	expect.equal(updated, plain, 'the field and the four quarter means carried on');
	expect.truthy(configured !== plain, `a Configure resets them: ${configured} vs ${plain}`);
});
