import { test } from 'node:test';
import * as expect from '../expect.js';
import * as FoamRoughness from '../../../content/ocean/js/core/foamRoughness.js';
import { clamp } from '../../../content/ocean/js/core/luau.js';

function byte(value) {
	return clamp(Math.floor(value * 255 + 0.5), 0, 255);
}

test("roughness bytes run from the ring's base to the foam roughness by coverage", () => {
	const texels = 2;
	const coverage = new Float32Array(texels * texels);
	coverage[0] = 0;
	coverage[1] = 1;
	coverage[2] = 0.5;
	coverage[3] = 0.25;
	const out = new Uint8Array(texels * texels * 4);
	FoamRoughness.fill(out, texels, coverage, 0.15, 0.8);
	const expected = [byte(0.15), byte(0.8), byte(0.15 + 0.5 * 0.65), byte(0.15 + 0.25 * 0.65)];
	for (let index = 0; index <= 3; index++) {
		const offset = index * 4;
		expect.equal(out[offset], expected[index], `R at ${index}`);
		expect.equal(out[offset + 1], expected[index], `G at ${index}`);
		expect.equal(out[offset + 2], expected[index], `B at ${index}`);
		expect.equal(out[offset + 3], 255, `alpha at ${index}`);
	}
});
