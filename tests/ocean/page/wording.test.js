// The page's words against the C2 copy rules (piece C2, lane G; spec 1 and 10): no placeholder left
// in the steps already written, no Acerola image or wording, no digit in a title or chapter label,
// and none of the claims the rulings struck.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as expect from '../expect.js';
import { structureOf } from './structure.js';

const html = readFileSync(new URL('../../../content/ocean/index.html', import.meta.url), 'utf8');
const sections = structureOf(html);
const text = (inner) => inner.replace(/<div class="tex"[\s\S]*?<\/div>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// The steps this lane has written so far: Task 12 sets 13, Task 13 sets 28.
export const WRITTEN_UP_TO = 28;

test('no placeholder is left in the steps written so far', () => {
	for (const section of sections.filter((s) => s.n <= WRITTEN_UP_TO)) {
		expect.truthy(!/Placeholder/i.test(section.inner), `${section.id} still has a placeholder`);
	}
});

test("no Acerola image or turn of phrase, and none of the claims the rulings struck", () => {
	const all = text(html).toLowerCase();
	const banned = ["plato", 'projector', 'crank', 'pasta', 'level 9', 'spell', 'free salad', 'taco bell', 'sum of signs', 'genuinely sucks', 'kind of sucks', 'have hands', 'all directions', 'at their own speeds', '32 waves', 'tiles disappear', 'tiling disappears'];
	for (const phrase of banned) expect.truthy(!all.includes(phrase), `the page says "${phrase}"`);
});

test('titles and chapter labels use words, not digits', () => {
	for (const section of sections) {
		const title = /<h2[^>]*>([^<]*)<\/h2>/.exec(section.inner)?.[1] ?? '';
		const label = /<p class="chapter">([^<]*)<\/p>/.exec(section.inner)?.[1] ?? '';
		expect.truthy(!/\d/.test(title + label), `${section.id}: "${title}" / "${label}"`);
	}
});

// C2 pre-flight R21, Task 0's review and the honesty facts (rules.md): the tiling step may not say
// every wave on the page fits the tile (false at an in-between Spread on the directions step, and
// for the lone sine, whose length need not divide 256), and the Gerstner step
// says the teaching bank is Gerstner, as the original Roblox prototype was.
test('the tiling step claims the tile only at full spread, and the Gerstner step names the teaching waves', () => {
	const of = (id) => text(sections.find((s) => s.id === id).inner);
	expect.truthy(!/every wave on this page/i.test(text(html)), 'the page says every wave on it fits the tile');
	expect.truthy(/spread full/i.test(of('tiling')), 'the tiling step says its waves are at full spread');
	expect.truthy(/not the lone sine/.test(of('tiling')), 'the tiling step says the lone sine is not on the tile');
	expect.truthy(/Gerstner/.test(of('gerstner')) && /teaching waves/.test(of('gerstner')) && /prototype/.test(of('gerstner')), 'the Gerstner step names the teaching waves and the prototype');
});

// Task 14: the recap at the foot of the page lists every "Roblox says no" card, in story order.
// Each line names the card it sums up with data-card (the card's step id); a card may take more than
// one line (the painted maps' card makes two points), but none is left out and none is out of order.
test('the recap has a line for every card, in story order', async () => {
	const { CARD_STEP_IDS } = await import('./structure.js');
	const recap = /<section class="block" id="recap"[\s\S]*?<\/section>/.exec(html)[0];
	const lines = [...recap.matchAll(/<li([^>]*)>/g)].map((m) => /data-card="([^"]+)"/.exec(m[1])?.[1] ?? null);
	expect.truthy(lines.every((id) => id !== null), `every recap line names its card: ${JSON.stringify(lines)}`);
	const distinct = lines.filter((id, i) => i === 0 || id !== lines[i - 1]);
	expect.equal(distinct.join(','), CARD_STEP_IDS.join(','), 'one run of lines per card, in story order');
});

// Task 15 (the Task 14 review's item 1): step 15 keeps step 14's waves on its big graph, summed into
// one curve (realOcean.js: the same bank, no faint components), while its words were all about the
// chord in the small chart. The paragraph says what the big graph is and how it relates to the chord.
test("the chord step says what its big graph shows", () => {
	const words = text(sections.find((s) => s.id === 'fourier').inner);
	expect.truthy(/big graph/i.test(words) && /last step's waves/i.test(words) && /one curve/i.test(words), `step 15 explains its big graph: "${words.slice(0, 200)}..."`);
});
