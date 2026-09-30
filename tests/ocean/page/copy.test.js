// The copy check's unit tests (piece C, Task 3): every source quote is really in its source, the
// checker catches an unsourced number, and the notices' and the proof panel's numbers are sourced.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';
import { COPY_SOURCES, PHRASES } from './copySources.js';
import { NUMBER, normalise, uncoveredNumbers } from './copyCheck.js';
import { NOTICES } from '../../../content/ocean/js/page/notices.js';
import { LUAU_FORK, LUAU_RELEASE, LUAU_WEB_VERSION } from '../../../content/ocean/js/proof/runtime.js';
import { cascadeOptions } from '../../../content/ocean/js/proof/proofConfig.js';

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
// whole. Its fixed text is checked here instead: the template's placeholders are filled from the
// modules the panel reads them from (proofConfig.js for the grid and seed, runtime.js for the
// runtime), the result must say what the page's sourced phrases say, and every number in it must
// sit inside a sourced phrase.
test("the proof panel's fixed text matches runtime.js and proofConfig.js, and its numbers are sourced", () => {
	const panel = readFileSync(join(SITE, 'content/ocean/js/ui/proofPanel.js'), 'utf8');
	const options = cascadeOptions();
	const fieldsInWords = /const FIELDS_IN_WORDS = '([^']*)';/.exec(panel)?.[1];
	expect.truthy(fieldsInWords, 'FIELDS_IN_WORDS is a plain string in proofPanel.js');
	const values = { 'o.n': options.n, 'o.seed': options.seed, LUAU_FORK, LUAU_RELEASE, LUAU_WEB_VERSION, FIELDS_IN_WORDS: fieldsInWords };
	const fill = (template) =>
		template.replace(/\$\{([^}]+)\}/g, (_, name) => {
			if (!(name in values)) throw new Error(`proofPanel.js fixed text uses \${${name}}, which this test does not know`);
			return String(values[name]);
		});
	const fixed = [...panel.matchAll(/<(h2|p) class="proof-(?:title|lede|note)">(.*?)<\/\1>/g)].map((match) => fill(match[2]));
	expect.equal(fixed.length, 5, 'the heading, the lede and three notes');
	const text = normalise(fixed.join(' '));
	expect.truthy(text.includes('one wave cascade, 64 × 64 cells at seed 7.'), `grid and seed: ${text}`);
	expect.truthy(text.includes('My Luau runs on luau-interop, a fork of Luau 0.711, packaged as luau-web 1.4.0:'), `runtime: ${text}`);
	const missing = uncoveredNumbers(text, PHRASES);
	expect.equal(missing.length, 0, `unsourced numbers in the proof panel: ${JSON.stringify(missing)}`);
});
