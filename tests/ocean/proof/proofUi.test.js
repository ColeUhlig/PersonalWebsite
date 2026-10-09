import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';
import { differenceImage, heightImage, symmetricScale } from '../../../content/ocean/js/ui/proofImages.js';
import { moduleSections } from '../../../content/ocean/js/ui/luauSource.js';
import { BUNDLE_URL } from '../../../content/ocean/js/proof/runtime.js';

test('symmetricScale is the largest magnitude, and 1 for a flat field', () => {
	expect.equal(symmetricScale(Float32Array.of(0.5, -2, 1)), 2, 'largest magnitude');
	expect.equal(symmetricScale(Float32Array.of(0.5, -2, 1), 1), 0.5, 'first count only');
	expect.equal(symmetricScale(new Float32Array(4)), 1, 'flat');
});

test('heightImage maps -scale, 0 and +scale to black, mid grey and white, clamping beyond', () => {
	const pixels = heightImage(Float32Array.of(-2, 0, 2, 9), 2, 2);
	expect.equal(pixels.length, 16, 'RGBA for 2 x 2');
	expect.equal([...pixels.slice(0, 4)].join(','), '0,0,0,255', 'trough');
	expect.equal(pixels[4], 128, 'mean surface');
	expect.equal(pixels[8], 255, 'crest');
	expect.equal(pixels[12], 255, 'clamped');
});

test('differenceImage is black where the bits agree and visibly red where they do not', () => {
	const a = Float32Array.of(1, 2, 3, 4);
	const b = Float32Array.of(1, 2.5, 3, NaN);
	const pixels = differenceImage(a, b, 2, 1);
	expect.equal([...pixels.slice(0, 4)].join(','), '0,0,0,255', 'agree');
	expect.equal(pixels[4], Math.round(96 + 159 * 0.5), 'half the scale');
	expect.equal(pixels[5], 0, 'red only');
	expect.equal(pixels[12], 255, 'NaN is full red');
	const zeros = differenceImage(Float32Array.of(0), Float32Array.of(-0), 1, 1);
	expect.equal(zeros[0], 96, '+0 against -0 differs in bits and still shows');
});

test('moduleSections splits the committed bundle into its marked modules', () => {
	const sections = moduleSections(readFileSync(fileURLToPath(BUNDLE_URL), 'utf8'));
	expect.equal([...sections.keys()].join(' '), 'Prelude Spectrum FFT Cascade Jacobian WaveSampler Swells WaveField FoamField WaterColour PeakMask FieldStore Entry', 'order');
	const cascade = sections.get('Cascade');
	expect.equal(cascade.origin, 'src/shared/Ocean/Cascade.luau', 'origin');
	expect.truthy(cascade.text.includes('function Cascade.new(config: Config): Cascade'), 'the module text');
	expect.truthy(!cascade.text.includes('-- @end'), 'markers excluded');
});

test('moduleSections refuses unbalanced markers', () => {
	for (const bad of ['-- @module A (x)\n', '-- @end A\n', '-- @module A (x)\n-- @module B (y)\n-- @end B\n-- @end A\n']) {
		let threw = false;
		try {
			moduleSections(bad);
		} catch {
			threw = true;
		}
		expect.truthy(threw, JSON.stringify(bad));
	}
});

// Throws the test's way: returns the error, or null when nothing was thrown.
function thrown(fn) {
	try {
		fn();
	} catch (error) {
		return error;
	}
	return null;
}

test('heightImage draws a NaN height magenta, never as a trough', () => {
	const pixels = heightImage(Float32Array.of(NaN, -Infinity, Infinity, 0), 2, 1);
	expect.equal([...pixels.slice(0, 4)].join(','), '255,0,255,255', 'NaN is magenta');
	expect.equal([...pixels.slice(4, 8)].join(','), '0,0,0,255', '-Infinity clamps to black');
	expect.equal([...pixels.slice(8, 12)].join(','), '255,255,255,255', '+Infinity clamps to white');
});

test('differenceImage: one ulp still shows, the same NaN bits agree, scale 0 is full red, blue stays 0', () => {
	const one = Float32Array.of(1);
	const next = new Float32Array(1);
	new Uint32Array(next.buffer)[0] = new Uint32Array(one.buffer)[0] + 1;
	const ulp = differenceImage(one, next, 1, 1);
	expect.equal(ulp[0], 96, 'a one-ulp difference is still a visible red');
	const nan = Float32Array.of(NaN);
	expect.equal(differenceImage(nan, Float32Array.of(NaN), 1, 1)[0], 0, 'the same NaN bits agree: black');
	const zeroScale = differenceImage(Float32Array.of(1), Float32Array.of(2), 1, 0);
	expect.equal(zeroScale[0], 255, 'scale 0 draws any difference full red');
	const mixed = differenceImage(Float32Array.of(1, 2, 3, 4), Float32Array.of(1, 5, 3, NaN), 2, 1);
	for (let i = 0; i < 4; i++) {
		expect.equal(mixed[i * 4 + 1], 0, `green ${i}`);
		expect.equal(mixed[i * 4 + 2], 0, `blue ${i}`);
		expect.equal(mixed[i * 4 + 3], 255, `alpha ${i}`);
	}
});

test('differenceImage refuses anything but two Float32Arrays holding n * n values', () => {
	const four = new Float32Array(4);
	const wrongType = thrown(() => differenceImage(new Float64Array(4), four, 2, 1));
	expect.truthy(wrongType instanceof TypeError, `a Float64Array is refused (${wrongType})`);
	const plain = thrown(() => differenceImage([0, 0, 0, 0], four, 2, 1));
	expect.truthy(plain instanceof TypeError, `a plain Array is refused (${plain})`);
	const short = thrown(() => differenceImage(new Float32Array(3), four, 2, 1));
	expect.truthy(short instanceof RangeError, `too few values is refused (${short})`);
	expect.truthy(short.message.includes('4'), `the message names what is needed (${short.message})`);
});

test('moduleSections reads CRLF line endings', () => {
	const sections = moduleSections('-- @module A (a.luau)\r\nlocal a = 1\r\n-- @end A\r\n');
	expect.equal([...sections.keys()].join(' '), 'A', 'one module');
	expect.equal(sections.get('A').origin, 'a.luau', 'origin without a carriage return');
	expect.equal(sections.get('A').text, 'local a = 1', 'text without a carriage return');
});

test('moduleSections refuses a duplicate name and a bundle with no sections', () => {
	const duplicate = thrown(() => moduleSections('-- @module A (x)\n-- @end A\n-- @module A (y)\n-- @end A\n'));
	expect.truthy(duplicate?.message.includes('A twice'), `duplicate (${duplicate?.message})`);
	const none = thrown(() => moduleSections('local x = 1\n'));
	expect.truthy(none?.message.includes('no marked modules'), `none (${none?.message})`);
	expect.truthy(thrown(() => moduleSections('')) !== null, 'an empty bundle');
});

test('moduleSections says which module is open when the wrong one closes', () => {
	const wrong = thrown(() => moduleSections('-- @module A (x)\n-- @end B\n'));
	expect.equal(wrong?.message, 'the bundle closes B while A is open', 'names both');
	const stray = thrown(() => moduleSections('-- @end B\n'));
	expect.equal(stray?.message, 'the bundle closes B without opening it', 'nothing open');
});
