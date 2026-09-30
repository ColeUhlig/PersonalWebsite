// How the proof compares the Luau answer with the JavaScript one, and the pass line.
//
// Both sides store their fields as float32 (buffer.writef32 in Luau, a Float32Array here), so
// "within float32 rounding" means: every value is the same float32 or its immediate neighbour,
// one unit in the last place (ulp) apart. That width was fixed by the first measurement
// (2026-09-30, luau-interop, a fork of Luau 0.711, run by luau-web 1.4.0, against the A1 twins,
// Node 25): across six cascades at four seeds, 196,608 float32 values, not one differed, and the
// maps' bytes were identical. The two math
// libraries do round some doubles differently (a mask's largest height, a double, differed in its
// last bit), so a neighbouring float32 is possible, and one ulp is where float32 rounding ends.
// Byte maps quantise the same values: a float32 neighbour can move a byte by one, no more.

export const FLOAT32_ULPS = 1;
export const BYTE_STEPS = 1;
// A double both sides compute without storing it as float32 (PeakMask's largest height).
export const DOUBLE_RELATIVE = 1e-12;

const SCRATCH = new Float32Array(1);
const SCRATCH_BITS = new Uint32Array(SCRATCH.buffer);

// The float32 as a signed integer that counts representable values from zero, so the distance
// between two of them is the number of float32 steps apart; +0 and -0 are both 0.
function ordinal(value) {
	SCRATCH[0] = value;
	const bits = SCRATCH_BITS[0];
	return bits >= 0x80000000 ? -(bits - 0x80000000) : bits;
}

/** Float32 steps between a and b; Infinity when either is NaN. */
export function float32Ulps(a, b) {
	if (Number.isNaN(a) || Number.isNaN(b)) {
		return Infinity;
	}
	return Math.abs(ordinal(a) - ordinal(b));
}

function checkLengths(a, b) {
	if (a.length !== b.length) {
		throw new Error(`cannot compare ${a.length} values with ${b.length}`);
	}
}

/**
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {{ count: number, differing: number, largest: number, largestAt: number, maxUlps: number, within: boolean }}
 *   largest is the largest absolute difference (largestAt its index, -1 when none), maxUlps the
 *   largest distance in float32 steps; within says whether maxUlps is inside FLOAT32_ULPS.
 */
export function compareFloat32(a, b) {
	checkLengths(a, b);
	// Compared as bits, so "identical" means the same bytes: +0 and -0 differ here (by 0 ulps).
	const bitsA = new Uint32Array(a.buffer, a.byteOffset, a.length);
	const bitsB = new Uint32Array(b.buffer, b.byteOffset, b.length);
	let differing = 0;
	let largest = 0;
	let largestAt = -1;
	let maxUlps = 0;
	for (let i = 0; i < a.length; i++) {
		if (bitsA[i] === bitsB[i]) {
			continue;
		}
		differing++;
		const ulps = float32Ulps(a[i], b[i]);
		maxUlps = Math.max(maxUlps, ulps);
		const difference = Number.isNaN(a[i] - b[i]) ? Infinity : Math.abs(a[i] - b[i]);
		if (difference > largest || largestAt < 0) {
			largest = difference;
			largestAt = i;
		}
	}
	return { count: a.length, differing, largest, largestAt, maxUlps, within: maxUlps <= FLOAT32_ULPS };
}

/**
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 * @returns {{ count: number, differing: number, largest: number, largestAt: number, within: boolean }}
 */
export function compareBytes(a, b) {
	checkLengths(a, b);
	let differing = 0;
	let largest = 0;
	let largestAt = -1;
	for (let i = 0; i < a.length; i++) {
		const difference = Math.abs(a[i] - b[i]);
		if (difference === 0) {
			continue;
		}
		differing++;
		if (difference > largest) {
			largest = difference;
			largestAt = i;
		}
	}
	return { count: a.length, differing, largest, largestAt, within: largest <= BYTE_STEPS };
}

/** The verdict line the panel shows for a compareFloat32 result. */
export function verdict(result) {
	if (result.differing === 0) {
		return 'Identical, bit for bit';
	}
	return result.within ? 'Within float32 rounding' : 'Outside float32 rounding: the two disagree';
}
