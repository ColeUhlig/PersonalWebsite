// The committed Luau bundle: it is current, its Random and Color3 shims draw and mix exactly as
// core/random.js and core/luau.js do, and the runner decodes its answers strictly.
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';
import { LuauState } from 'luau-web';
import { BUNDLE_URL } from '../../../content/ocean/js/proof/runtime.js';
import { createLuauRunner, hexToBytes } from '../../../content/ocean/js/proof/luauRunner.js';
import * as Random from '../../../content/ocean/js/core/random.js';
import { color3, lerpColor3 } from '../../../content/ocean/js/core/luau.js';
import { NORMAL } from '../../../content/ocean/js/core/spectrum.js';

const BUNDLE_PATH = fileURLToPath(BUNDLE_URL);
// Where roblox-ocean (and its scripts/web_bundle.py) is checked out; override with ROBLOX_OCEAN_DIR.
const ROBLOX_OCEAN = process.env.ROBLOX_OCEAN_DIR || '/Users/cole/Projects/roblox-ocean';
const BUNDLER = `${ROBLOX_OCEAN}/scripts/web_bundle.py`;

// Read and run lazily, so a missing or corrupt bundle fails the tests that need it and cannot stop
// the staleness test from registering and naming the fix.
let sourceText;
const source = () => (sourceText ??= readFileSync(BUNDLE_PATH, 'utf8'));
let runnerPromise;
const loadRunner = () => (runnerPromise ??= createLuauRunner(LuauState, source()));

function jsDraws(generator, count) {
	const values = [];
	for (let i = 0; i < count; i++) {
		values.push(generator.nextU32());
	}
	return values.join(' ');
}

// Review Focus 4: a module edited in roblox-ocean after the copy would leave the page proving
// agreement with Luau that no longer exists. A missing bundler fails rather than skips, so a
// wrong checkout path cannot quietly turn the check off.
test('the committed bundle is what web_bundle.py builds from roblox-ocean now', () => {
	expect.truthy(existsSync(BUNDLER), `no ${BUNDLER}: set ROBLOX_OCEAN_DIR to the roblox-ocean checkout that has scripts/web_bundle.py`);
	const result = spawnSync('python3', [BUNDLER, '--check', BUNDLE_PATH], { encoding: 'utf8' });
	const why = [result.error?.message, (result.stderr ?? '').trim()].filter(Boolean).join('; ');
	expect.equal(result.status, 0, `web_bundle.py --check (ROBLOX_OCEAN_DIR=${ROBLOX_OCEAN}): ${why}`);
});

test('the bundle carries the prelude, every module the panel runs, and the entry', () => {
	const SOURCE = source();
	for (const name of ['Prelude', 'Spectrum', 'FFT', 'Cascade', 'Jacobian', 'WaveSampler', 'Swells', 'WaveField', 'FoamField', 'WaterColour', 'PeakMask', 'FieldStore', 'Entry']) {
		expect.truthy(SOURCE.includes(`-- @module ${name} (`), `${name} begins`);
		expect.truthy(SOURCE.includes(`-- @end ${name}\n`), `${name} ends`);
	}
});

test('the Luau Random reproduces the reference vectors of core/random.js', async () => {
	const runner = await loadRunner();
	expect.equal(await runner.draws(6, 1, 2, 3, 4), '11520 0 5927040 70819200 2031721883 1637235492', 'xoshiro128** from state 1, 2, 3, 4');
	// The rows of "SplitMix32 seeding matches the reference C code" in tests/ocean/core/random.test.js.
	const cases = [
		[0, '2462723854 1020716019 454327756 1275600319', '3809008728 1133695204 53579671 2891528803'],
		[7, '588686121 1937383562 4286812467 2372217166', '1004282400 2200021487 1928073449 741806228'],
		[4294967295, '920564995 4230986166 697614773 1778835764', '835879718 1921286648 2356205009 1885780724'],
	];
	for (const [seed, state, next] of cases) {
		expect.equal((await runner.seedState(seed)).join(' '), state, `seed ${seed} state`);
		expect.equal(await runner.draws(4, seed), next, `seed ${seed} draws`);
	}
});

test('the Luau Random draws what core/random.js draws, for the seeds the cascades use and odd ones', async () => {
	const runner = await loadRunner();
	const seeds = [1, 2, 3, 7 * 7919 + 1, 7 * 7919 + 2, 7 * 7919 + 3, 123456 * 7919 + 3, -1, -7919, 7.9, 2 ** 40 + 5, 1e15 + 0.5];
	for (const seed of seeds) {
		expect.equal(await runner.draws(64, seed), jsDraws(Random.create(seed), 64), `seed ${seed}`);
	}
});

// Why the shim needs mul32: fmix32's two multiplies, done as plain double multiplies the way
// Luau's `(z * 0x85ebca6b) % 2^32` would do them, drop low bits once the product passes 2^53,
// which is most of the Weyl sequence. SplitMix32 seeding done that way gives other state words
// than the bundle does; done with exact 32-bit multiplies (core/random.js) it gives the same ones.
function plainSeedState(seed) {
	const multiply = (a, b) => (a * b) % 2 ** 32;
	const fmix = (value) => {
		let z = value;
		z = multiply((z ^ (z >>> 16)) >>> 0, 0x85ebca6b);
		z = multiply((z ^ (z >>> 13)) >>> 0, 0xc2b2ae35);
		return (z ^ (z >>> 16)) >>> 0;
	};
	const words = [];
	let weyl = seed >>> 0;
	for (let i = 0; i < 4; i++) {
		weyl = (weyl + 0x9e3779b9) >>> 0;
		words.push(fmix(weyl));
	}
	return words;
}

test('the bundle seeds with exact 32-bit multiplies, not plain double ones', async () => {
	const runner = await loadRunner();
	const luau = (await runner.seedState(0)).join(' ');
	expect.equal(luau, Random.create(0).state().join(' '), 'the bundle matches core/random.js');
	const plain = plainSeedState(0).join(' ');
	expect.truthy(plain !== luau, `a plain double multiply would give ${plain}, the bundle gives ${luau}`);
});

test('the Luau Color3 lerp rounds exactly as lerpColor3', async () => {
	const runner = await loadRunner();
	const pairs = [
		[color3(8 / 255, 46 / 255, 72 / 255), color3(28 / 255, 168 / 255, 156 / 255)],
		[color3(0.1, 0.2, 0.3), color3(0.9, 0.7, 0.5)],
	];
	for (const [a, b] of pairs) {
		for (let k = 0; k <= 255; k += 17) {
			const luau = await runner.lerp(a, b, k / 255);
			const js = lerpColor3(a, b, k / 255);
			expect.equal(`${luau.r} ${luau.g} ${luau.b}`, `${js.r} ${js.g} ${js.b}`, `alpha ${k}/255`);
		}
	}
});

test('hexToBytes decodes lowercase hex and refuses anything else', () => {
	expect.equal([...hexToBytes('00ff7f10')].join(' '), '0 255 127 16', 'decoded');
	for (const bad of ['abc', '0g', 'FF', 'é0', null]) {
		let threw = false;
		try {
			hexToBytes(bad);
		} catch {
			threw = true;
		}
		expect.truthy(threw, `refuses ${bad}`);
	}
});

test('the runner refuses sizes the bundle cannot build', async () => {
	const runner = await loadRunner();
	let message = '';
	try {
		await runner.cascade({ index: 1, seed: 7, time: 0, n: 64, sizes: [256, 64], loopPeriod: 120, params: {} });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('exactly 3 cascades'), message);
});

// The message a call rejects or throws with, or '' when it succeeds.
async function failure(call) {
	try {
		await call();
	} catch (error) {
		return error.message;
	}
	return '';
}

const SMALL_CASCADE = Object.freeze({ index: 2, seed: 7, time: 1.5, n: 64, sizes: [256, 64, 16], loopPeriod: 120, params: NORMAL });
const SMALL_MAPS = Object.freeze({
	...SMALL_CASCADE,
	chop: 1, peak: 1, tint: 0.5, gamma: 1,
	foam: { whitecap: 0.35, grow: 1, decay: 0.5 },
	foamSteps: 1, texels: 16, foamTexels: 8,
	deep: [8, 46, 72], subsurface: [28, 168, 156],
});

test('the runner decodes a cascade and the maps at the sizes asked for', async () => {
	const runner = await loadRunner();
	const { packed, ms } = await runner.cascade(SMALL_CASCADE);
	expect.equal(packed.length, 8 * 64 * 64, 'packed float32s');
	expect.truthy(packed.every(Number.isFinite), 'packed values are finite');
	expect.truthy(Number.isFinite(ms) && ms >= 0, `cascade ms ${ms}`);
	const maps = await runner.maps(SMALL_MAPS);
	expect.equal(maps.base.length, 16 * 16 * 3, 'base bytes');
	expect.equal(maps.mask.length, 16 * 16 * 4, 'mask bytes');
	expect.equal(maps.foam.length, 8 * 8, 'foam float32s');
	expect.truthy(Number.isFinite(maps.found) && Number.isFinite(maps.ms), 'found and ms are numbers');
});

test('the runner refuses arguments that are not finite numbers or not three bytes, naming them', async () => {
	const runner = await loadRunner();
	const cases = [
		[() => runner.cascade({ ...SMALL_CASCADE, seed: NaN }), 'seed'],
		[() => runner.cascade({ ...SMALL_CASCADE, sizes: [256, Infinity, 16] }), 'sizes[1]'],
		[() => runner.cascade({ ...SMALL_CASCADE, params: { ...NORMAL, fetch: undefined } }), 'params.fetch'],
		[() => runner.maps({ ...SMALL_MAPS, foam: { whitecap: 0.35, grow: 1 } }), 'foam.decay'],
		[() => runner.maps({ ...SMALL_MAPS, texels: '16' }), 'texels'],
		[() => runner.maps({ ...SMALL_MAPS, deep: [8, 46] }), 'deep must be three bytes'],
		[() => runner.maps({ ...SMALL_MAPS, subsurface: [28, 168, NaN] }), 'subsurface[2]'],
	];
	for (const [call, name] of cases) {
		const message = await failure(call);
		expect.truthy(message.includes(name), `expected an error naming ${name}, got '${message}'`);
	}
});

// A stand-in for luau-web whose Entry answers whatever it is told, to reach the decode checks.
function fakeLuauState(answers) {
	const entry = { get: (name) => async () => answers[name] };
	return { createAsync: async () => ({ loadstring: () => async () => [entry] }) };
}

test('the runner refuses answers of the wrong size', async () => {
	const good = { base: '00'.repeat(16 * 16 * 3), mask: '00'.repeat(16 * 16 * 4), foam: '00'.repeat(8 * 8 * 4) };
	const maps = (overrides) => {
		const o = { ...good, ...overrides };
		return [o.base, o.mask, o.foam, 1, 2];
	};
	const cases = [
		[{ cascade: ['00'.repeat(6), 1] }, SMALL_CASCADE, 'cascade', 'not a whole number of float32s'],
		[{ cascade: ['00'.repeat(4 * 8 * 64 * 64 - 4), 1] }, SMALL_CASCADE, 'cascade', 'the Luau cascade has 32767 values, expected 32768'],
		[{ maps: maps({ base: '00'.repeat(16 * 16 * 3 - 1) }) }, SMALL_MAPS, 'maps', 'the Luau base has'],
		[{ maps: maps({ mask: '00'.repeat(16 * 16 * 3) }) }, SMALL_MAPS, 'maps', 'the Luau mask has'],
		[{ maps: maps({ foam: '00'.repeat(4 * 16 * 16) }) }, SMALL_MAPS, 'maps', 'the Luau foam has'],
	];
	for (const [answers, options, method, expected] of cases) {
		const runner = await createLuauRunner(fakeLuauState(answers), '');
		const message = await failure(() => runner[method](options));
		expect.truthy(message.includes(expected), `expected '${expected}', got '${message}'`);
	}
	const runner = await createLuauRunner(fakeLuauState({ maps: maps({}) }), '');
	expect.equal((await runner.maps(SMALL_MAPS)).foam.length, 64, 'the right sizes decode');
});
