// The math box's choices (piece C2, lane A, Task 1): which entry a reading shows, and the per-viewer
// collapse kept in storage that may refuse (a private window throws on every access).
import { test } from 'node:test';
import * as expect from '../expect.js';
import { COLLAPSE_KEY, entryFor, freshCount, readCollapsed, termsIn, writeCollapsed } from '../../../content/ocean/js/page/mathBoxModel.js';
import { mathFor } from '../../../content/ocean/js/page/mathSteps.js';
import { stepOf } from '../../../content/ocean/js/stages/steps.js';

const memory = () => {
	const map = new Map();
	return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
};
const refusing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

test('the opening shows nothing; a step shows its own entry', () => {
	expect.equal(entryFor({ phase: 'opening', step: 1, progress: 0 }), null, 'opening');
	expect.equal(entryFor(null), null, 'no reading');
	const entry = entryFor({ phase: 'step', step: stepOf('slopes'), progress: 0.4 });
	expect.equal(entry.id, 'slopes', 'the id');
	expect.equal(entry.tex, mathFor('slopes').tex, 'its equation');
	expect.truthy(Object.isFrozen(entry), 'frozen');
});

test('the collapse round-trips through storage, and storage that refuses is forgotten, not fatal', () => {
	const store = memory();
	expect.equal(readCollapsed(store), false, 'open by default');
	expect.equal(writeCollapsed(store, true), true, 'stored');
	expect.equal(store.getItem(COLLAPSE_KEY), '1', 'under its key');
	expect.equal(readCollapsed(store), true, 'read back');
	expect.equal(readCollapsed(refusing), false, 'a refusing store reads as open');
	expect.equal(writeCollapsed(refusing, true), false, 'and reports that it could not keep it');
	expect.equal(readCollapsed(null), false, 'no storage at all');
});

test('fresh highlights and term colours are read from the TeX', () => {
	const tex = String.raw`y = \htmlClass{fresh}{\htmlClass{t-amp}{A}} + \htmlClass{fresh}{B} + \htmlClass{t-len}{k}`;
	expect.equal(freshCount(tex), 2, 'two highlights');
	expect.equal([...termsIn(tex)].sort().join(','), 't-amp,t-len', 'two terms');
});
