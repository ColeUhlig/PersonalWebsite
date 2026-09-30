// The scroll story's arithmetic (piece C): page/scrollMap.js, the reading line, the reading, the
// smoothed position, and the sticky top that keeps a tall panel's bottom in view.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { LAST_STEP, NARROW_QUERY, SMOOTH_SECONDS, positionOf, readScroll, readingLine, smoothPosition, splitPosition, stickyTop } from '../../../content/ocean/js/page/scrollMap.js';
import { STEP_COUNT } from '../../../content/ocean/js/stages/recipes.js';

const SECTIONS = [
	{ step: 1, top: 1000, height: 1000 },
	{ step: 2, top: 2000, height: 1000 },
	{ step: 3, top: 3000, height: 500 },
];

test('the reading line is the middle of the view, or of the lower half on a narrow screen', () => {
	expect.equal(readingLine(800, false), 400, 'desktop');
	expect.equal(readingLine(800, true), 600, 'narrow');
	expect.equal(NARROW_QUERY, '(max-width: 899.98px)', 'the stylesheet breakpoint');
	expect.equal(LAST_STEP, STEP_COUNT, 'as many steps as the recipes');
});

test('above the first step is the opening; inside a step is its progress', () => {
	expect.equal(readScroll(SECTIONS, 999).phase, 'opening', 'just above step 1');
	const reading = readScroll(SECTIONS, 2250);
	expect.equal(reading.phase, 'step', 'a step');
	expect.equal(reading.step, 2, 'step 2');
	expect.near(reading.progress, 0.25, 1e-12, 'a quarter through');
	expect.equal(readScroll(SECTIONS, 1000).step, 1, 'the top edge belongs to the step');
	expect.equal(readScroll(SECTIONS, 99999).progress, 1, 'past the last section clamps to its end');
});

test('bad input reads as the opening instead of throwing', () => {
	expect.equal(readScroll([], 5000).phase, 'opening', 'no sections');
	expect.equal(readScroll(SECTIONS, Number.NaN).phase, 'opening', 'NaN anchor');
	expect.equal(readScroll([{ step: 1, top: 0, height: 0 }], 10).progress, 0, 'a zero-height section');
});

test('a position is step plus progress, and splits back; the finale has no progress', () => {
	expect.equal(positionOf({ phase: 'step', step: 4, progress: 0.5 }), 4.5, 'step 4 halfway');
	expect.equal(positionOf({ phase: 'step', step: 13, progress: 0.7 }), 13, 'the finale');
	const split = splitPosition(7.25);
	expect.equal(split.step, 7, 'step');
	expect.near(split.progress, 0.25, 1e-12, 'progress');
	expect.equal(splitPosition(13.4).step, 13, 'clamped to the finale');
	expect.equal(splitPosition(13.4).progress, 0, 'no progress on the finale');
	expect.equal(splitPosition(0.2).step, 1, 'clamped to step 1');
});

test('the position eases toward the scroll, and cuts when the scroll jumps more than a step (Review Focus 1)', () => {
	let p = 3;
	for (let i = 0; i < 5; i++) p = smoothPosition(p, 3.8, 0.05);
	expect.truthy(p > 3.3 && p < 3.8, `eased part of the way: ${p}`);
	for (let i = 0; i < 200; i++) p = smoothPosition(p, 3.8, 0.05);
	expect.equal(p, 3.8, 'arrives exactly');
	expect.equal(smoothPosition(2, 9.5, 0.016), 9.5, 'a fling cuts straight there');
	expect.equal(smoothPosition(Number.NaN, 4, 0.016), 4, 'no position yet: take the target');
	expect.equal(smoothPosition(4, 4.5, 0), 4, 'no time, no movement');
	expect.equal(SMOOTH_SECONDS, 0.25, 'time constant');
});

test('a sticky panel sits 10vh down, or high enough that its bottom stays 16 px inside the view', () => {
	expect.equal(stickyTop(500), 'min(10vh, 100svh - 500px - 16px)', 'a short panel keeps 10vh');
	expect.equal(stickyTop(843.7), 'min(10vh, 100svh - 843.7px - 16px)', 'a tall panel goes above the top');
	expect.equal(stickyTop(Number.NaN), '10vh', 'no height yet: the stylesheet value');
	expect.equal(stickyTop(-5), '10vh', 'a negative height: the stylesheet value');
});
