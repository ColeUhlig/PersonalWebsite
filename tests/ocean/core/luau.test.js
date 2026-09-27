import { test } from 'node:test';
import * as expect from '../expect.js';
import { mod, idiv, round, clamp, sign, bit32, zeros, check, color3, lerpColor3 } from '../../../content/ocean/js/core/luau.js';

test("mod is floored like Luau's %", () => {
	expect.equal(mod(-1, 4), 3, '-1 % 4');
	expect.equal(mod(5.5, 4), 1.5, '5.5 % 4');
	expect.equal(mod(-0.5, 4), 3.5, '-0.5 % 4');
	expect.equal(mod(7, -4), -1, '7 % -4 takes the divisor sign');
});

test('idiv floors', () => {
	expect.equal(idiv(7, 2), 3, '7 // 2');
	expect.equal(idiv(-7, 2), -4, '-7 // 2');
});

test('round sends halves away from zero', () => {
	expect.equal(round(2.5), 3, '2.5');
	expect.equal(round(-2.5), -3, '-2.5');
	expect.equal(round(2.4), 2, '2.4');
	expect.equal(round(-2.6), -3, '-2.6');
});

test('clamp clamps and rejects max below min', () => {
	expect.equal(clamp(5, 0, 1), 1, 'above');
	expect.equal(clamp(-5, 0, 1), 0, 'below');
	expect.equal(clamp(0.5, 0, 1), 0.5, 'inside');
	let threw = false;
	try {
		clamp(0, 1, 0);
	} catch (error) {
		threw = error instanceof RangeError;
	}
	expect.truthy(threw, 'max below min throws a RangeError');
});

test('sign', () => {
	expect.equal(sign(-3), -1, 'negative');
	expect.equal(sign(0), 0, 'zero');
	expect.equal(sign(2), 1, 'positive');
});

test('bit32 results are unsigned 32-bit', () => {
	expect.equal(bit32.bxor(0xffffffff, 1), 4294967294, 'bxor');
	expect.equal(bit32.band(-1), 4294967295, 'band of one value');
	expect.equal(bit32.band(12, 10), 8, 'band');
	expect.equal(bit32.rshift(0x80000000, 31), 1, 'rshift');
	expect.equal(bit32.rshift(5, 32), 0, 'rshift by 32 is 0 in Luau');
	expect.equal(bit32.lshift(1, 31), 2147483648, 'lshift stays unsigned');
});

test('zeros is a Float64Array of zeros', () => {
	const values = zeros(4);
	expect.truthy(values instanceof Float64Array, 'Float64Array');
	expect.equal(values.length, 4, 'length');
	expect.equal(values[3], 0, 'zero');
});

test('check throws the message', () => {
	let message = '';
	try {
		check(false, 'broken');
	} catch (error) {
		message = error.message;
	}
	expect.equal(message, 'broken', 'message');
});

test('color3 channels are float32 and lerp between them', () => {
	const c = color3(0.1, 0.25, 1);
	expect.equal(c.r, Math.fround(0.1), 'float32 red');
	expect.truthy(Object.isFrozen(c), 'frozen');
	const mid = lerpColor3(color3(0.125, 0.25, 0.375), color3(0.625, 0.75, 0.875), 0.5);
	expect.equal(mid.r, 0.375, 'red');
	expect.equal(mid.g, 0.5, 'green');
	expect.equal(mid.b, 0.625, 'blue');
});
