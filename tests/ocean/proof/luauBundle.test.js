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

const BUNDLE_PATH = fileURLToPath(BUNDLE_URL);
const SOURCE = readFileSync(BUNDLE_PATH, 'utf8');
// Where roblox-ocean (and its scripts/web_bundle.py) is checked out; override with ROBLOX_OCEAN_DIR.
const ROBLOX_OCEAN = process.env.ROBLOX_OCEAN_DIR || '/Users/cole/Projects/roblox-ocean';
const BUNDLER = `${ROBLOX_OCEAN}/scripts/web_bundle.py`;
const runner = await createLuauRunner(LuauState, SOURCE);

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
	expect.equal(result.status, 0, `web_bundle.py --check (ROBLOX_OCEAN_DIR=${ROBLOX_OCEAN}): ${(result.stderr ?? '').trim()}`);
});

test('the bundle carries the prelude, every module the panel runs, and the entry', () => {
	for (const name of ['Prelude', 'Spectrum', 'FFT', 'Cascade', 'Jacobian', 'WaveSampler', 'Swells', 'WaveField', 'FoamField', 'WaterColour', 'PeakMask', 'FieldStore', 'Entry']) {
		expect.truthy(SOURCE.includes(`-- @module ${name} (`), `${name} begins`);
		expect.truthy(SOURCE.includes(`-- @end ${name}\n`), `${name} ends`);
	}
});

test('the Luau Random reproduces the reference vectors of core/random.js', async () => {
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
	const seeds = [1, 2, 3, 7 * 7919 + 1, 7 * 7919 + 2, 7 * 7919 + 3, 123456 * 7919 + 3, -1, -7919, 7.9, 2 ** 40 + 5, 1e15 + 0.5];
	for (const seed of seeds) {
		expect.equal(await runner.draws(64, seed), jsDraws(Random.create(seed), 64), `seed ${seed}`);
	}
});

// Why the shim needs mul32: a plain multiply in doubles, as Luau would do it, drops low bits once
// z >= 2^21, which is most of the Weyl sequence.
test('a plain double multiply would not do: it loses bits where mul32 does not', () => {
	const z = 0x9e3779b9;
	const plain = (z * 0x85ebca6b) % 2 ** 32;
	const exact = Math.imul(z, 0x85ebca6b) >>> 0;
	expect.truthy(plain !== exact, `plain ${plain} vs exact ${exact}`);
});

test('the Luau Color3 lerp rounds exactly as lerpColor3', async () => {
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
	let message = '';
	try {
		await runner.cascade({ index: 1, seed: 7, time: 0, n: 64, sizes: [256, 64], loopPeriod: 120, params: {} });
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.includes('exactly 3 cascades'), message);
});
