// The math box's content (piece C2, lane A, Task 1; spec 10.3): one entry per step, each slider's term
// colour in its step's equation, a highlight on what each step adds, and sentences with no numbers.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { MATH_STEPS, mathFor } from '../../../content/ocean/js/page/mathSteps.js';
import { freshCount, termsIn } from '../../../content/ocean/js/page/mathBoxModel.js';
import { TERM_BY_SLIDER } from '../../../content/ocean/js/page/sliderModel.js';
import { RECIPES } from '../../../content/ocean/js/stages/recipes.js';
import { STEP_IDS } from '../../../content/ocean/js/stages/steps.js';
import { PHRASES } from './copySources.js';
import { uncoveredNumbers } from './copyCheck.js';

const balanced = (tex) => {
	let depth = 0;
	for (let i = 0; i < tex.length; i++) {
		if (tex[i] === '\\') { i++; continue; }
		if (tex[i] === '{') depth++;
		if (tex[i] === '}') depth--;
		if (depth < 0) return false;
	}
	return depth === 0;
};

test('one entry per step, nothing else, each with an equation and a sentence', () => {
	expect.equal(Object.keys(MATH_STEPS).join(','), STEP_IDS.join(','), 'the steps, in order');
	for (const id of STEP_IDS) {
		const { tex, changed } = mathFor(id);
		// Not Task 0's placeholder, which was exactly \text{id} (glow's real equation names \text{glow}).
		expect.truthy(tex.length > 10 && tex !== '\\text{' + id + '}', `${id} has a real equation`);
		expect.truthy(changed.length > 20 && !changed.startsWith('Placeholder'), `${id} has a real sentence`);
		expect.truthy(balanced(tex), `${id}'s braces balance`);
	}
	expect.equal(new Set(STEP_IDS.map((id) => mathFor(id).changed)).size, STEP_IDS.length, 'every sentence says something new');
});

test("every slider's term colour is in its own step's equation", () => {
	for (const recipe of RECIPES) {
		const terms = termsIn(mathFor(recipe.id).tex);
		for (const slider of recipe.sliders) {
			const term = TERM_BY_SLIDER[slider.id];
			if (term === null) continue;
			expect.truthy(terms.has(term), `${recipe.id}: slider ${slider.id} needs \\htmlClass{${term}} in the box`);
		}
	}
});

test('every step but the finale highlights what it adds; only \\htmlClass is used of the trusted commands', () => {
	for (const id of STEP_IDS) {
		const tex = mathFor(id).tex;
		if (id === 'finale') {
			expect.equal(freshCount(tex), 0, 'the finale adds nothing');
		} else {
			expect.truthy(freshCount(tex) >= 1, `${id} marks what it adds`);
		}
		expect.truthy(!/\\(href|url|includegraphics|htmlId|htmlStyle|htmlData)\b/.test(tex), `${id} uses no other trusted command`);
	}
});

test("the sentences carry no digits, so the copy check never needs a source for them", () => {
	for (const id of STEP_IDS) {
		const { changed } = mathFor(id);
		expect.truthy(!/\d/.test(changed), `${id}: "${changed}"`);
		expect.equal(uncoveredNumbers(changed, PHRASES).length, 0, `${id} copy check`);
	}
	let message = '';
	try { mathFor('flat-plane'); } catch (error) { message = error.message; }
	expect.truthy(message.includes('flat-plane'), 'an unknown id is refused');
});

// Fix round 1 (Task 2 review): the phone's one-line bar may order an entry's equations differently
// (foam puts its update first, so a narrow bar shows it), but it is the same maths.
test("the bar's one line is the same equations, highlights and colours, with foam's update first", () => {
	const parts = (tex) => tex.split(/,\s*\\q?quad\s*/).map((part) => part.trim()).sort().join('|');
	for (const id of STEP_IDS) {
		const { tex, bar } = mathFor(id);
		expect.truthy(typeof bar === 'string' && balanced(bar), `${id} has a bar line`);
		expect.equal(parts(bar), parts(tex), `${id}: the bar holds the same equations`);
		expect.equal(freshCount(bar), freshCount(tex), `${id}: the same highlights`);
	}
	expect.truthy(mathFor('foam').bar.startsWith(String.raw`\htmlClass{fresh}{f}`), "foam's bar opens on the update");
	expect.truthy(mathFor('foam').tex.startsWith(String.raw`\htmlClass{fresh}{J`), 'the card and sheet keep J first');
});

test("the unlit step's colour is the panel's c_white, highlighted", () => {
	expect.equal(mathFor('unlit').tex, String.raw`\text{colour} = \htmlClass{fresh}{c_{\text{white}}}`, 'unlit');
});
