// The copy check's unit tests (piece C, Task 3): every source quote is really in its source, the
// checker catches an unsourced number, and the notices' and the proof panel's numbers are sourced.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import { COPY_SOURCES, PHRASES } from './copySources.js';
import { NUMBER, normalise, uncoveredNumbers } from './copyCheck.js';
import { NOTICES } from '../../../content/ocean/js/page/notices.js';
import { proofPanelText, readProofPanel } from './proofPanelText.js';

const SITE = fileURLToPath(new URL('../../../', import.meta.url));
const ROBLOX = process.env.ROBLOX_OCEAN_DIR || '/Users/cole/Projects/roblox-ocean';

function sourceText(source) {
	const [root, path] = source.startsWith('site:') ? [SITE, source.slice(5)] : source.startsWith('roblox:') ? [ROBLOX, source.slice(7)] : [null, null];
	if (!root) throw new Error(`unknown source kind: ${source}`);
	return readFileSync(join(root, path), 'utf8');
}

test('every source quote is really in its source', () => {
	const cache = new Map();
	for (const { phrase, source, quote } of COPY_SOURCES) {
		if (!cache.has(source)) cache.set(source, sourceText(source));
		expect.truthy(cache.get(source).includes(quote), `"${phrase}": the quote "${quote}" is not in ${source} (ROBLOX_OCEAN_DIR=${ROBLOX})`);
	}
});

test('every phrase carries a number, and no phrase is listed twice', () => {
	for (const phrase of PHRASES) {
		expect.truthy(new RegExp(NUMBER.source).test(phrase), `"${phrase}" has no number to source`);
	}
	expect.equal(new Set(PHRASES).size, PHRASES.length, 'phrases are unique');
});

test('the checker passes a covered number and names an uncovered one with its context', () => {
	const text = normalise('The sea has   18,144 points\nand 99 bottles.');
	const missing = uncoveredNumbers(text, ['18,144']);
	expect.equal(missing.length, 1, 'one uncovered');
	expect.equal(missing[0].number, '99', 'the 99');
	expect.truthy(missing[0].context.includes('bottles'), 'context');
	expect.equal(uncoveredNumbers('3 × 64 × 64 = 12,288', ['3 × 64 × 64 = 12,288']).length, 0, 'a phrase covers every number inside it');
	expect.equal(uncoveredNumbers('64 × 64 and 64', ['64 × 64']).length, 1, 'a number outside every phrase is caught');
	expect.equal(uncoveredNumbers('version 1.4.0', ['1.4']).length, 1, 'a phrase must cover the whole number');
});

test("the notices' numbers are sourced", () => {
	for (const [name, text] of Object.entries(NOTICES)) {
		const missing = uncoveredNumbers(normalise(text), PHRASES);
		expect.equal(missing.length, 0, `${name}: ${JSON.stringify(missing)}`);
	}
});

// B's proofPanel.js builds the panel's markup at run time, so the page's copy check skips #proof
// whole. Its fixed text is checked here instead: proofPanelText.js fills the panel's INTRO, markup
// and map templates from the modules the panel reads (proofConfig.js for the grid and seed,
// runtime.js for the runtime), and every number in the result must sit inside a sourced phrase.
test("the proof panel's fixed text matches runtime.js and proofConfig.js, and its numbers are sourced", () => {
	const { text, attributes } = proofPanelText();
	expect.truthy(text.includes('Run both') && text.includes('Luau height') && text.includes('Verdict'), `the button, a caption and a term are read: ${text}`);
	expect.truthy(text.includes("The Roblox game's Luau code, running in this browser."), `the heading is read: ${text}`);
	expect.truthy(text.includes('one wave cascade, 64 × 64 cells at seed 7.'), `grid and seed: ${text}`);
	expect.truthy(text.includes('The Luau runs on luau-interop, a fork of Luau 0.711, packaged as luau-web 1.4.0:'), `runtime: ${text}`);
	const missing = [...uncoveredNumbers(text, PHRASES), ...uncoveredNumbers(attributes, PHRASES)];
	expect.equal(missing.length, 0, `unsourced numbers in the proof panel: ${JSON.stringify(missing)}`);
});

test('the proof panel check catches a new number anywhere in its templates', () => {
	const source = readProofPanel();
	const mutations = [
		['a new paragraph', '<p class="proof-note">The comparison', '<p class="proof-note">It ran 3 times.</p>\n\t\t\t\t<p class="proof-note">The comparison'],
		['the button', '>Run both</button>', '>Run both 2 ways</button>'],
		['a term', '<dt>Verdict</dt>', '<dt>Verdict 9</dt>'],
		['a caption', "'Luau height'", "'Luau height 5'"],
		['the heading', 'running in this browser.</h2>', 'running in this browser 4 times.</h2>'],
		['an attribute', '<select data-proof="module">', '<select data-proof="module" aria-label="Module 6 of 9">'],
	];
	for (const [where, from, to] of mutations) {
		expect.truthy(source.includes(from), `${where}: "${from}" is in proofPanel.js`);
		const { text, attributes } = proofPanelText(source.replace(from, to));
		const missing = [...uncoveredNumbers(text, PHRASES), ...uncoveredNumbers(attributes, PHRASES)];
		expect.truthy(missing.length > 0, `${where}: the extra number was not caught`);
	}
	expect.truthy(
		(() => {
			try {
				proofPanelText(source.replace('at seed ${o.seed}', 'at seed ${o.seed} of ${o.count}'));
				return false;
			} catch (error) {
				return error.message.includes('o.count');
			}
		})(),
		'an unknown placeholder throws',
	);
});

// C final review fix 1: Roblox makes one worker Actor per cascade (OceanClient.client.luau), so the
// lighter tier runs two; the page counts them per layer and gives three only for the top tier.
test('the worker Actors are counted one per layer, never as a flat three', () => {
	const roblox = sourceText('roblox:src/client/OceanCoordinator/OceanClient.client.luau');
	expect.truthy(/for index = 1, #preset\.sizes do\s+local actor = Instance\.new\("Actor"\)/.test(roblox), 'Roblox makes one Actor per cascade');
	expect.equal(`${Tier.presets.High.sizes.length},${Tier.presets.Medium.sizes.length}`, '3,2', 'layers on the top and the lighter tier');
	const page = readFileSync(join(SITE, 'content/ocean/index.html'), 'utf8');
	expect.truthy(!/three worker Actors/i.test(page), 'no flat "three worker Actors"');
	expect.equal((page.match(/worker Actor per layer/g) ?? []).length, 3, 'the FFT card, the layers card and the recap count per layer');
	expect.equal((page.match(/one worker Actor per layer \(three on the top tier\)/g) ?? []).length, 2, 'the two cards give the top tier its three');
});
