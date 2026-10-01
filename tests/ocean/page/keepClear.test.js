// Where the page's pills sit over the ocean's canvas (piece C2, Task 14): ui/keepClear.js pillsOver,
// the box the flat graph keeps its words out of.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { pillsOver } from '../../../content/ocean/js/ui/keepClear.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });

test("the pills' box is measured in from the canvas's right and bottom edges", () => {
	// A phone: the canvas is the top half, the column's foot 8 px above its bottom.
	const zone = pillsOver(rect(0, 0, 390, 422), rect(235, 324, 139, 90));
	expect.equal(zone.width, 155, 'from the column\'s left edge to the canvas\'s right');
	expect.equal(zone.height, 98, 'from the column\'s top to the canvas\'s bottom');
});

test('no pill over the canvas: nothing to keep clear of', () => {
	expect.equal(pillsOver(rect(0, 0, 390, 422), rect(0, 0, 0, 0)), null, 'both pills hidden');
	expect.equal(pillsOver(rect(0, 0, 390, 422), rect(235, 500, 139, 40)), null, 'below the canvas');
	expect.equal(pillsOver(rect(0, 0, 390, 422), rect(400, 300, 100, 40)), null, 'right of the canvas');
});
