// Runs the generated Luau bundle (content/ocean/luau/ocean-bundle.luau) in the WebAssembly Luau
// runtime and turns its answers into the typed arrays the JavaScript twins produce. Browser-free:
// the caller hands in the runtime's LuauState class (from node_modules in Node, from jsDelivr in
// the worker) and the bundle's text.
//
// The bundle's Entry table takes plain numbers only: luau-web turns a JavaScript object into a
// proxy whose arrays index from 0 and whose missing keys are not nil, so tables are never passed.
// Bytes come back as hex strings, since the bridge carries strings as UTF-8 text.

// Spectrum.Params, in the order the bundle's Entry reads them (roblox-ocean scripts/web_bundle.py).
export const PARAM_ORDER = Object.freeze(['windSpeed', 'fetch', 'depth', 'gamma', 'swell', 'windDirection', 'gravity', 'scale', 'tailBoost', 'isotropy']);

const CASCADES = 3; // the bundle's Entry builds a three-cascade field

/**
 * @typedef {object} CascadeOptions
 * @property {number} index Luau cascade number, 1 .. 3
 * @property {number} seed the field seed; the cascade draws from seed * 7919 + index
 * @property {number} time seconds
 * @property {number} n
 * @property {ReadonlyArray<number>} sizes three patch sizes, largest first
 * @property {number} loopPeriod
 * @property {import('../core/spectrum.js').Params} params
 */

/**
 * @typedef {CascadeOptions & {
 *   chop: number, peak: number, tint: number, gamma: number,
 *   foam: { whitecap: number, grow: number, decay: number },
 *   foamSteps: number, texels: number, foamTexels: number,
 *   deep: ReadonlyArray<number>, subsurface: ReadonlyArray<number>,
 * }} MapsOptions deep and subsurface are [r, g, b] bytes; the tile is sizes[0]
 */

const HEX_VALUES = (() => {
	const table = new Int16Array(128).fill(-1);
	for (let i = 0; i < 16; i++) {
		table['0123456789abcdef'.charCodeAt(i)] = i;
	}
	return table;
})();

// Lowercase hex, two characters a byte, to bytes. Anything else is an error: a truncated or
// mangled answer must not turn into plausible numbers.
export function hexToBytes(hex) {
	if (typeof hex !== 'string' || hex.length % 2 !== 0) {
		throw new Error('the Luau answer is not an even-length hex string');
	}
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		const high = HEX_VALUES[hex.charCodeAt(i * 2)] ?? -1;
		const low = HEX_VALUES[hex.charCodeAt(i * 2 + 1)] ?? -1;
		if (high < 0 || low < 0) {
			throw new Error(`the Luau answer has a non-hex character near byte ${i}`);
		}
		bytes[i] = high * 16 + low;
	}
	return bytes;
}

// buffer.writef32 is little-endian, and so is every typed array on the platforms browsers run on.
function float32s(bytes) {
	if (bytes.byteLength % 4 !== 0) {
		throw new Error(`the Luau answer is ${bytes.byteLength} bytes, not a whole number of float32s`);
	}
	return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

// A decoded answer must be exactly the size that was asked for: a short or long one means the
// bundle and this runner disagree about the layout.
function checkLength(what, array, expected) {
	if (array.length !== expected) {
		throw new Error(`the Luau ${what} has ${array.length} values, expected ${expected}`);
	}
	return array;
}

// [name, value] pairs to their values, refusing anything that is not a finite number.
function finite(named) {
	return named.map(([name, value]) => {
		if (!Number.isFinite(value)) {
			throw new Error(`${name} must be a finite number, got ${value}`);
		}
		return value;
	});
}

function rgb(name, bytes) {
	const list = bytes == null ? [] : Array.from(bytes);
	if (list.length !== 3) {
		throw new Error(`${name} must be three bytes [r, g, b]; got ${list.length} values`);
	}
	return finite(list.map((value, i) => [`${name}[${i}]`, value]));
}

function paramList(params) {
	return finite(PARAM_ORDER.map((name) => [`params.${name}`, params?.[name] ?? (name === 'isotropy' ? 0 : undefined)]));
}

function checkSizes(sizes) {
	if (!sizes || sizes.length !== CASCADES) {
		throw new Error(`the Luau bundle builds exactly ${CASCADES} cascades; got ${sizes?.length} sizes`);
	}
}

/**
 * @param {{ createAsync(): Promise<any> }} LuauState luau-web's class
 * @param {string} source the bundle's text
 */
export async function createLuauRunner(LuauState, source) {
	const state = await LuauState.createAsync();
	const [entry] = await state.loadstring(source, 'ocean-bundle', true)();
	const call = (name) => {
		const fn = entry.get(name);
		if (typeof fn !== 'function') {
			throw new Error(`the Luau bundle has no Entry.${name}`);
		}
		return fn;
	};
	const seedState = call('seedState');
	const draws = call('draws');
	const lerp = call('lerp');
	const cascade = call('cascade');
	const maps = call('maps');
	return Object.freeze({
		/** @returns {Promise<number[]>} the four xoshiro128** words Random.new(seed) starts from */
		seedState: async (seed) => [...(await seedState(seed))],
		/** `count` draws, space-separated, from a seed or from four state words */
		draws: async (count, ...words) => (await draws(count, ...words))[0],
		/** Color3.new(a):Lerp(Color3.new(b), alpha) with a and b as { r, g, b } */
		lerp: async (a, b, alpha) => {
			const [r, g, bl] = await lerp(a.r, a.g, a.b, b.r, b.g, b.b, alpha);
			return { r, g, b: bl };
		},
		/**
		 * @param {CascadeOptions} o
		 * @returns {Promise<{ packed: Float32Array, ms: number }>} FieldStore.pack's layout
		 */
		cascade: async (o) => {
			checkSizes(o.sizes);
			const args = finite([
				['index', o.index], ['seed', o.seed], ['time', o.time], ['n', o.n],
				['sizes[0]', o.sizes[0]], ['sizes[1]', o.sizes[1]], ['sizes[2]', o.sizes[2]],
				['loopPeriod', o.loopPeriod],
			]);
			const [hex, ms] = await cascade(...args, ...paramList(o.params));
			return { packed: checkLength('cascade', float32s(hexToBytes(hex)), 8 * o.n * o.n), ms };
		},
		/**
		 * @param {MapsOptions} o
		 * @returns {Promise<{ base: Uint8Array, mask: Uint8Array, foam: Float32Array, found: number, ms: number }>}
		 */
		maps: async (o) => {
			checkSizes(o.sizes);
			const args = finite([
				['seed', o.seed], ['time', o.time], ['n', o.n],
				['sizes[0]', o.sizes[0]], ['sizes[1]', o.sizes[1]], ['sizes[2]', o.sizes[2]],
				['loopPeriod', o.loopPeriod], ['chop', o.chop], ['peak', o.peak], ['tint', o.tint], ['gamma', o.gamma],
				['foam.whitecap', o.foam?.whitecap], ['foam.grow', o.foam?.grow], ['foam.decay', o.foam?.decay],
				['foamSteps', o.foamSteps], ['texels', o.texels], ['foamTexels', o.foamTexels],
			]);
			const [base, mask, foam, found, ms] = await maps(
				...args, ...rgb('deep', o.deep), ...rgb('subsurface', o.subsurface), ...paramList(o.params),
			);
			const texels = o.texels * o.texels;
			return {
				base: checkLength('base', hexToBytes(base), texels * 3),
				mask: checkLength('mask', hexToBytes(mask), texels * 4),
				foam: checkLength('foam', float32s(hexToBytes(foam)), o.foamTexels * o.foamTexels),
				found,
				ms,
			};
		},
	});
}
