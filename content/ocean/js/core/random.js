// Stands in for Roblox's Random, which exists only inside Roblox and whose algorithm Roblox does not
// publish. xoshiro128** 1.1 (Blackman and Vigna, public-domain reference code), its four words
// seeded from a SplitMix32 sequence (a golden-ratio Weyl step through the MurmurHash3 fmix32
// finaliser). Chosen because every step is a 32-bit xor, shift or rotate, or a multiply by 5 or 9,
// all exact in Luau's doubles and bit32, so the Luau shim in the proof panel draws the same numbers.
import { mod } from './luau.js';

const GOLDEN = 0x9e3779b9;
const TWO_32 = 4294967296;

function rotl(x, k) {
	return ((x << k) | (x >>> (32 - k))) >>> 0;
}

function fmix32(value) {
	let z = value;
	z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
	z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
	return (z ^ (z >>> 16)) >>> 0;
}

// Random.new(seed): any finite number; it is floored, then taken modulo 2^32.
export function create(seed) {
	if (!Number.isFinite(seed)) {
		throw new RangeError(`seed must be a finite number, got ${seed}`);
	}
	let weyl = mod(Math.floor(seed), TWO_32);
	const words = [];
	for (let i = 0; i < 4; i++) {
		weyl = (weyl + GOLDEN) >>> 0;
		words.push(fmix32(weyl));
	}
	return fromState(words[0], words[1], words[2], words[3]);
}

// A generator from four raw state words, for the reference vectors.
export function fromState(a, b, c, d) {
	const s = Uint32Array.of(a, b, c, d);
	function nextU32() {
		const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
		const t = s[1] << 9;
		s[2] ^= s[0];
		s[3] ^= s[1];
		s[1] ^= s[2];
		s[0] ^= s[3];
		s[2] ^= t;
		s[3] = rotl(s[3], 11);
		return result;
	}
	// random:NextNumber() is [0, 1); random:NextNumber(min, max) is [min, max).
	function nextNumber(min, max) {
		const unit = nextU32() / TWO_32;
		return min === undefined ? unit : min + (max - min) * unit;
	}
	function state() {
		return [s[0], s[1], s[2], s[3]];
	}
	return Object.freeze({ nextU32, nextNumber, state });
}
