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
	return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

function paramList(params) {
	return PARAM_ORDER.map((name) => {
		const value = params[name] ?? (name === 'isotropy' ? 0 : undefined);
		if (typeof value !== 'number') {
			throw new Error(`params.${name} must be a number`);
		}
		return value;
	});
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
			const [hex, ms] = await cascade(o.index, o.seed, o.time, o.n, ...o.sizes, o.loopPeriod, ...paramList(o.params));
			return { packed: float32s(hexToBytes(hex)), ms };
		},
		/**
		 * @param {MapsOptions} o
		 * @returns {Promise<{ base: Uint8Array, mask: Uint8Array, foam: Float32Array, found: number, ms: number }>}
		 */
		maps: async (o) => {
			checkSizes(o.sizes);
			const [base, mask, foam, found, ms] = await maps(
				o.seed, o.time, o.n, ...o.sizes, o.loopPeriod,
				o.chop, o.peak, o.tint, o.gamma, o.foam.whitecap, o.foam.grow, o.foam.decay,
				o.foamSteps, o.texels, o.foamTexels, ...o.deep, ...o.subsurface,
				...paramList(o.params),
			);
			return { base: hexToBytes(base), mask: hexToBytes(mask), foam: float32s(hexToBytes(foam)), found, ms };
		},
	});
}
