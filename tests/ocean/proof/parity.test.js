// The proof itself: the Luau modules from roblox-ocean, run through the WebAssembly runtime, and
// the A1 JavaScript twins, at the same seeds, compared byte for byte (spec sections 5 and 7).
//
// Pass line: every float32 within float32 rounding (compare.js FLOAT32_ULPS, fixed by the first
// measurement on 2026-09-30: no value differed at all), every map byte within one step, the mask's
// largest height (a double) within DOUBLE_RELATIVE. A failure here means a twin disagrees with the
// Luau: find which, fix the twin in core/ with a test, and never widen a tolerance to pass.
// Beside each pass line the tests also pin the measured state, 0 values differing, so even a
// change inside the tolerance shows up here first.
//
// The two divergences the A1 twins record, and why neither reaches this comparison:
// - Spectrum.validateParams: the JavaScript refuses a zero or negative wind, fetch or depth (and
//   the other bad values it lists) with a RangeError; the Luau has no such check and builds a sea
//   of NaN. Only valid parameters are compared; the last test pins the divergence itself.
// - The sampler's wrap fold: a coordinate a hair below zero (about -1e-15) makes the floored
//   modulo in Cascade's corners and sampleHeight round up to exactly n; the twin folds it to cell
//   0, the Luau reads past the grid. Nothing compared here samples below zero: the cascade fields
//   are compared cell for cell with no sampling, WaterColour and PeakMask sample at texel centres
//   ((i + 0.5) * step > 0) and FoamField at i * step >= 0, where both sides compute the same cell.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';
import { LuauState } from 'luau-web';
import { BUNDLE_URL } from '../../../content/ocean/js/proof/runtime.js';
import { createLuauRunner } from '../../../content/ocean/js/proof/luauRunner.js';
import { runCascadeTwin, runMapsTwin } from '../../../content/ocean/js/proof/twinRunner.js';
import { cascadeOptions, mapsOptions } from '../../../content/ocean/js/proof/proofConfig.js';
import { DOUBLE_RELATIVE, compareBytes, compareFloat32 } from '../../../content/ocean/js/proof/compare.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SOURCE = readFileSync(fileURLToPath(BUNDLE_URL), 'utf8');
const runner = await createLuauRunner(LuauState, SOURCE);

function describe(result) {
	return `${result.differing} of ${result.count} differ, largest ${result.largest} at ${result.largestAt}` + (result.maxUlps === undefined ? '' : `, ${result.maxUlps} ulp`);
}

// Seeds the page uses (7), small and huge and negative ones, all three cascades, time 0, the
// frozen time and a time past several loop periods.
const CASES = [
	{ seed: 7, index: 1, time: 12 },
	{ seed: 7, index: 2, time: 12 },
	{ seed: 7, index: 3, time: 12 },
	{ seed: 1, index: 1, time: 0 },
	{ seed: 123456, index: 2, time: 77.7 },
	{ seed: -3, index: 3, time: 500 },
];

for (const { seed, index, time } of CASES) {
	test(`cascade ${index} at seed ${seed}, time ${time}: the packed fields agree within float32 rounding`, async (t) => {
		const options = cascadeOptions({ seed, index, time });
		const luau = await runner.cascade(options);
		const js = runCascadeTwin(options);
		const result = compareFloat32(luau.packed, js.packed);
		t.diagnostic(`${describe(result)}; Luau ${luau.ms.toFixed(1)} ms, JavaScript ${js.ms.toFixed(1)} ms`);
		expect.equal(luau.packed.length, 8 * options.n * options.n, 'eight fields');
		expect.truthy(js.packed.some((value) => value !== 0), 'the packed fields are not all zero, so the comparison is not of two empty fields');
		expect.truthy(result.within, describe(result));
		expect.equal(result.differing, 0, `the measured state is bit for bit: ${describe(result)}`);
	});
}

test('the maps agree: water colour base, peak mask and foam field', async (t) => {
	const options = mapsOptions();
	const luau = await runner.maps(options);
	const js = runMapsTwin(options);
	const base = compareBytes(luau.base, js.base);
	const mask = compareBytes(luau.mask, js.mask);
	const foam = compareFloat32(luau.foam, js.foam);
	t.diagnostic(`base ${describe(base)}; mask ${describe(mask)}; foam ${describe(foam)}; found ${luau.found} vs ${js.found}; Luau ${luau.ms.toFixed(0)} ms, JavaScript ${js.ms.toFixed(0)} ms`);
	expect.truthy(base.within, `base: ${describe(base)}`);
	expect.equal(base.differing, 0, `base, measured bit for bit: ${describe(base)}`);
	expect.truthy(mask.within, `mask: ${describe(mask)}`);
	expect.equal(mask.differing, 0, `mask, measured bit for bit: ${describe(mask)}`);
	expect.truthy(foam.within, `foam: ${describe(foam)}`);
	expect.equal(foam.differing, 0, `foam, measured bit for bit: ${describe(foam)}`);
	expect.near(luau.found, js.found, Math.abs(js.found) * DOUBLE_RELATIVE, 'the mask\'s largest height');
	let foamed = 0;
	for (const value of js.foam) {
		foamed += value > 0 ? 1 : 0;
	}
	expect.truthy(foamed > 0, 'the foam field has foam in it, so the comparison is not of two empty fields');
});

// Review Focus 5: a browser without JSPI (Safari) gets luau-web's Asyncify build.
test('the Asyncify build (browsers without JSPI) gives the same bytes', () => {
	const script = `
		delete WebAssembly.Suspending; delete WebAssembly.promising;
		const { readFileSync } = await import('node:fs');
		const { LuauState } = await import('luau-web');
		const { createLuauRunner } = await import('./content/ocean/js/proof/luauRunner.js');
		const { cascadeOptions } = await import('./content/ocean/js/proof/proofConfig.js');
		const runner = await createLuauRunner(LuauState, readFileSync('content/ocean/luau/ocean-bundle.luau', 'utf8'));
		const { packed } = await runner.cascade(cascadeOptions());
		process.stdout.write(JSON.stringify({ jspi: 'Suspending' in WebAssembly, bytes: Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength).toString('base64') }));
	`;
	const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 60_000 });
	expect.truthy(!result.error && result.signal === null, `the Asyncify child did not finish within 60 s: ${result.error?.message ?? `killed by ${result.signal}`}`);
	expect.equal(result.status, 0, result.stderr);
	const { jspi, bytes } = JSON.parse(result.stdout);
	expect.equal(jspi, false, 'JSPI hidden');
	const js = runCascadeTwin(cascadeOptions()).packed;
	expect.equal(bytes, Buffer.from(js.buffer, js.byteOffset, js.byteLength).toString('base64'), 'identical to the twin');
});

test('the recorded validateParams divergence: wind 0 is refused by the twin and is NaN in the Luau', async () => {
	const options = cascadeOptions();
	const calm = { ...options, params: { ...options.params, windSpeed: 0 } };
	let refused = false;
	try {
		runCascadeTwin(calm);
	} catch (error) {
		refused = error instanceof RangeError;
	}
	expect.truthy(refused, 'the twin throws a RangeError');
	const { packed } = await runner.cascade(calm);
	expect.truthy(packed.every((value) => Number.isNaN(value)), 'the Luau field is all NaN');
});
