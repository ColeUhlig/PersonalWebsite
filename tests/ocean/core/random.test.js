import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Random from '../../../content/ocean/js/core/random.js';

function draws(generator, count) {
	const values = [];
	for (let i = 0; i < count; i++) {
		values.push(generator.nextU32());
	}
	return values.join(' ');
}

test('xoshiro128** matches the reference sequence from state 1, 2, 3, 4', () => {
	expect.equal(draws(Random.fromState(1, 2, 3, 4), 6), '11520 0 5927040 70819200 2031721883 1637235492', 'sequence');
});

test('SplitMix32 seeding matches the reference C code', () => {
	const cases = [
		[0, '2462723854 1020716019 454327756 1275600319', '3809008728 1133695204 53579671 2891528803'],
		[7, '588686121 1937383562 4286812467 2372217166', '1004282400 2200021487 1928073449 741806228'],
		[4294967295, '920564995 4230986166 697614773 1778835764', '835879718 1921286648 2356205009 1885780724'],
	];
	for (const [seed, state, next] of cases) {
		const generator = Random.create(seed);
		expect.equal(generator.state().join(' '), state, `seed ${seed} state`);
		expect.equal(draws(generator, 4), next, `seed ${seed} draws`);
	}
});

test('seeds are floored then taken modulo 2^32', () => {
	expect.equal(Random.create(-1).state().join(' '), Random.create(4294967295).state().join(' '), '-1 is 2^32 - 1');
	expect.equal(Random.create(7.9).state().join(' '), Random.create(7).state().join(' '), '7.9 floors to 7');
	expect.equal(Random.create(4294967296 + 7).state().join(' '), Random.create(7).state().join(' '), 'wraps at 2^32');
	// WaveField derives seed * 7919 + index, which passes 2^32 for a seed above about 542,000 and goes
	// negative for a negative seed; the floored modulo must reduce it exactly well past 2^32 on both
	// sides (2^40 + 7 is exactly representable; 2^60 + 7 would round to 2^60).
	expect.equal(Random.create(2 ** 40 + 7).state().join(' '), Random.create(7).state().join(' '), '2^40 + 7 wraps to 7');
	expect.equal(Random.create(-(2 ** 40) + 7).state().join(' '), Random.create(7).state().join(' '), '-2^40 + 7 wraps to 7');
});

test('non-finite seeds throw', () => {
	for (const seed of [NaN, Infinity, -Infinity]) {
		let threw = false;
		try {
			Random.create(seed);
		} catch (error) {
			threw = error instanceof RangeError;
		}
		expect.truthy(threw, `seed ${seed}`);
	}
});

test('nextNumber is in [0, 1) and nextNumber(min, max) in [min, max)', () => {
	const generator = Random.create(42);
	let low = Infinity;
	let high = -Infinity;
	for (let i = 0; i < 10000; i++) {
		const value = generator.nextNumber();
		low = Math.min(low, value);
		high = Math.max(high, value);
	}
	expect.truthy(low >= 0 && high < 1, `unit range ${low} .. ${high}`);
	expect.truthy(low < 0.01 && high > 0.99, 'spans the range');
	const ranged = Random.fromState(1, 2, 3, 4);
	expect.equal(ranged.nextNumber(-1, 1), -1 + 2 * (11520 / 4294967296), 'maps the first draw');
});
