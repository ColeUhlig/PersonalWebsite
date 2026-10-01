// index.html's structure against the contract (piece C2, Task 0; tests/ocean/page/structure.js).
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as expect from '../expect.js';
import { RECIPES } from '../../../content/ocean/js/stages/recipes.js';
import { CARD_STEP_IDS, CHAPTER_WORDS, EXPECTED, SLOTS, STYLESHEETS, structureOf } from './structure.js';

const html = readFileSync(new URL('../../../content/ocean/index.html', import.meta.url), 'utf8');
const sections = structureOf(html);

test('one section per step, in order, with its number, id and the recipe title', () => {
	expect.equal(sections.length, EXPECTED.length, 'every step has a section');
	sections.forEach((section, i) => {
		const want = EXPECTED[i];
		expect.equal(`${section.n}/${section.dataStep}/${section.id}`, `${want.n}/${want.n}/${want.id}`, `section ${i + 1}`);
		const title = new RegExp(`<h2 id="step-${want.n}-title">([^<]*)</h2>`).exec(section.inner)?.[1];
		expect.equal(title, RECIPES[i].title, `${want.id}'s title is the recipe's`);
		expect.truthy(section.inner.includes(`<div class="controls" data-controls="${want.n}" data-copy-skip="live"></div>`), `${want.id} controls`);
		const maths = (section.inner.match(/<details class="math">/g) ?? []).length;
		expect.equal(maths, want.id === 'finale' ? 0 : 1, `${want.id} math`);
	});
});

test('cards, slots and chapter labels sit where the contract puts them', () => {
	for (const section of sections) {
		const cards = (section.inner.match(/<aside class="card">/g) ?? []).length;
		expect.equal(cards, CARD_STEP_IDS.includes(section.id) ? 1 : 0, `${section.id} cards`);
		for (const slot of SLOTS[section.id] ?? []) {
			expect.truthy(section.inner.includes(slot), `${section.id} has ${slot}`);
		}
		const want = EXPECTED[section.n - 1];
		const label = /<p class="chapter">([^<]*)<\/p>/.exec(section.inner)?.[1] ?? null;
		if (want.chapter >= 0) {
			expect.truthy(label !== null && label.startsWith(`Chapter ${CHAPTER_WORDS[want.chapter]} · `), `${section.id} names its chapter in words`);
		} else {
			expect.equal(label, null, `${section.id} has no chapter label`);
		}
	}
	const allSlots = Object.values(SLOTS).flat();
	for (const slot of allSlots) {
		expect.equal(html.split(slot).length - 1, 1, `${slot} appears once`);
	}
});

test('the math box slot and the stylesheets, all site-absolute', () => {
	expect.truthy(html.includes('<aside id="mathbox" class="mathbox" data-mathbox aria-label="The math so far" hidden></aside>'), 'the math box slot');
	let last = -1;
	for (const href of STYLESHEETS) {
		const at = html.indexOf(`<link rel="stylesheet" href="${href}">`);
		expect.truthy(at > last, `${href} linked, in order`);
		last = at;
	}
});
