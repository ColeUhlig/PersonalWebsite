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
