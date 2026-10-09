import { test } from 'node:test';
import * as expect from '../expect.js';
import { BYTE_STEPS, FLOAT32_ULPS, compareBytes, compareFloat32, float32Ulps, verdict } from '../../../content/ocean/js/proof/compare.js';

// The float32 just above x.
function next(x) {
	const f = new Float32Array([x]);
	const bits = new Uint32Array(f.buffer);
	bits[0] += x >= 0 ? 1 : -1;
	return f[0];
}

test('float32Ulps counts representable steps, across zero too', () => {
	expect.equal(float32Ulps(1, 1), 0, 'same');
	expect.equal(float32Ulps(1, next(1)), 1, 'neighbour');
	expect.equal(float32Ulps(1, next(next(1))), 2, 'two apart');
	expect.equal(float32Ulps(0, -0), 0, '+0 and -0');
	expect.equal(float32Ulps(-1.5e-45, 1.5e-45), 2, 'the two smallest subnormals either side of zero');
	expect.equal(float32Ulps(NaN, 1), Infinity, 'NaN');
});

test('compareFloat32 reports the count, the largest difference and the pass line', () => {
	const a = Float32Array.of(1, 2, 3, 4);
	const same = compareFloat32(a, Float32Array.of(1, 2, 3, 4));
	expect.equal(same.differing, 0, 'none differ');
	expect.equal(same.largestAt, -1, 'no largest');
	expect.equal(verdict(same), 'Identical, bit for bit', 'verdict');
	const neighbour = compareFloat32(a, Float32Array.of(1, next(2), 3, 4));
	expect.equal(neighbour.differing, 1, 'one differs');
	expect.equal(neighbour.largestAt, 1, 'at index 1');
	expect.equal(neighbour.maxUlps, 1, 'one step');
	expect.equal(neighbour.within, true, `within ${FLOAT32_ULPS} ulp`);
	expect.equal(verdict(neighbour), 'Within float32 rounding', 'verdict');
	const far = compareFloat32(a, Float32Array.of(1, 2, 3.5, 4));
	expect.equal(far.largest, 0.5, 'largest difference');
	expect.equal(far.within, false, 'outside');
	expect.equal(verdict(far), 'Outside float32 rounding: the two disagree', 'verdict');
});

test('+0 against -0 is a difference in the bytes but none in value', () => {
	const result = compareFloat32(Float32Array.of(0), Float32Array.of(-0));
	expect.equal(result.differing, 1, 'the bytes differ');
	expect.equal(result.maxUlps, 0, 'no float32 steps apart');
	expect.equal(verdict(result), 'Within float32 rounding', 'not called identical');
});

test('a NaN on one side is the largest difference and fails the pass line', () => {
	const result = compareFloat32(Float32Array.of(1, 2), Float32Array.of(1, NaN));
	expect.equal(result.largest, Infinity, 'largest');
	expect.equal(result.within, false, 'fails');
});

test('compareBytes allows one step and no more', () => {
	const one = compareBytes(Uint8Array.of(10, 20), Uint8Array.of(10, 21));
	expect.equal(one.differing, 1, 'one differs');
	expect.equal(one.within, true, `within ${BYTE_STEPS}`);
	expect.equal(compareBytes(Uint8Array.of(10), Uint8Array.of(12)).within, false, 'two steps fail');
});

test('arrays of different lengths are an error, not a pass', () => {
	for (const [compare, Type] of [[compareFloat32, Float32Array], [compareBytes, Uint8Array]]) {
		let threw = false;
		try {
			compare(new Type(2), new Type(3));
		} catch {
			threw = true;
		}
		expect.truthy(threw, compare.name);
	}
});

// What a call with the wrong kind of array throws, or 'none' when it returns.
function thrown(call) {
	try {
		call();
	} catch (error) {
		return error.constructor.name;
	}
	return 'none';
}

test('compareFloat32 refuses anything but two Float32Arrays, rather than calling them identical', () => {
	expect.equal(thrown(() => compareFloat32([1, 2, 3], [4, 5, 6])), 'TypeError', 'two plain Arrays');
	expect.equal(thrown(() => compareFloat32(Float32Array.of(1), [1])), 'TypeError', 'a plain Array second');
	expect.equal(thrown(() => compareFloat32(Float64Array.of(1), Float64Array.of(2))), 'TypeError', 'Float64Arrays');
	expect.equal(thrown(() => compareFloat32(Uint8Array.of(1), Uint8Array.of(2))), 'TypeError', 'Uint8Arrays');
});

test('compareBytes refuses anything but two Uint8Arrays, rather than calling them within a step', () => {
	expect.equal(thrown(() => compareBytes(Float32Array.of(0.1), Float32Array.of(0.9))), 'TypeError', 'Float32Arrays');
	expect.equal(thrown(() => compareBytes([10, 20], [10, 90])), 'TypeError', 'two plain Arrays');
	expect.equal(thrown(() => compareBytes(Uint8Array.of(1), Uint8ClampedArray.of(1))), 'TypeError', 'a Uint8ClampedArray second');
});
