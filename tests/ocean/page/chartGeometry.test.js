// The story charts' geometry (piece C, Task 8): scales, the clipped path, round ticks, the phase
// arrows' ends and where a label goes clear of the line.
import { test } from 'node:test';
import * as expect from '../expect.js';
import { arrowEnd, firstClearBox, linearScale, linePath, logScale, niceTicks, placeLabel } from '../../../content/ocean/js/page/chartGeometry.js';

test('scales map their domain onto the plot', () => {
	const x = linearScale([0, 10], [30, 310]);
	expect.equal(x(0), 30, 'left');
	expect.equal(x(10), 310, 'right');
	expect.equal(x(5), 170, 'middle');
	const y = logScale([1e-4, 1], [170, 10]);
	expect.near(y(1), 10, 1e-9, 'top');
	expect.near(y(1e-2), 90, 1e-9, 'two decades down is half way');
	let message = '';
	try {
		logScale([0, 1], [0, 1]);
	} catch (error) {
		message = error instanceof RangeError ? error.message : `not a RangeError: ${error}`;
	}
	expect.truthy(message.includes('positive'), message);
});

test('a path skips points it cannot place and keeps the rest inside the plot', () => {
	const x = linearScale([0, 3], [0, 30]);
	const y = linearScale([0, 1], [100, 0]);
	const d = linePath([0, 1, 2, 3], [0.5, Number.NaN, 5, 0], x, y, { top: 0, bottom: 100 });
	expect.equal(d, 'M0.00 50.00 L20.00 0.00 L30.00 100.00', d);
	expect.equal(linePath([], [], x, y, { top: 0, bottom: 100 }), '', 'nothing to draw');
});

test('ticks land on round numbers across the range', () => {
	expect.equal(niceTicks(0.2, 6, 6).join(','), '1,2,3,4,5,6', 'the spectrum axis');
	expect.equal(niceTicks(0.2, 6).join(','), '2,4,6', 'fewer ticks asked for, wider steps');
	expect.equal(niceTicks(0, 1).join(','), '0,0.2,0.4,0.6,0.8,1', 'fractions');
});

test("an arrow is its wave's phasor, scaled so the tallest reaches the ring", () => {
	const end = arrowEnd(3, 4, 5, 20);
	expect.near(end.x, 12, 1e-12, 'x');
	expect.near(end.y, -16, 1e-12, 'y up is negative in SVG');
	const none = arrowEnd(1, 1, 0, 20);
	expect.equal(none.x, 0, 'no amplitude, no arrow');
});

test("a label goes in the first box the line does not cross", () => {
	// A peak: up from (0, 100) to (50, 0), down to (100, 100).
	const line = [[0, 100], [50, 0], [100, 100]];
	const top = { x0: 60, x1: 90, y0: 0, y1: 15 };
	const bottom = { x0: 60, x1: 90, y0: 85, y1: 100 };
	const middle = { x0: 60, x1: 90, y0: 40, y1: 55 };
	expect.equal(firstClearBox(line, [middle, top]), 1, 'the line crosses the middle on its way down, not the top right');
	expect.equal(firstClearBox(line, [bottom, top]), 0, 'the bottom right is clear: the line is only down to 80 by x = 90');
	const steep = [[0, 100], [1, 0]];
	expect.equal(firstClearBox(steep, [{ x0: 0.2, x1: 0.4, y0: 65, y1: 70 }, { x0: 2, x1: 3, y0: 0, y1: 100 }]), 1, 'a steep segment crosses a box between its two points');
	expect.equal(firstClearBox(line, [{ x0: 0, x1: 100, y0: 0, y1: 100 }]), -1, 'no clear box');
});

test('a label beside a mark goes right of it, else left, else slides along, else sits on top', () => {
	const plot = { left: 0, right: 200, top: 0, bottom: 100 };
	const flat = [[0, 100], [200, 100]];
	const rows = [80, 20];
	const spot = (anchor, width, points = flat) => placeLabel({ anchor, width, rows, ascent: 10, descent: 3, plot, points });
	expect.equal(spot(50, 60).x0, 54, 'right of the mark');
	expect.equal(spot(180, 60).x0, 116, 'left of the mark near the right edge');
	const middle = spot(100, 120);
	expect.truthy(middle.clear, 'a wide label in the middle still finds a clear spot');
	expect.truthy(middle.x0 >= 0 && middle.x0 + 120 <= 200, `inside the plot: ${middle.x0}`);
	const wall = [[0, 0], [200, 100], [0, 100], [200, 0]];
	const blocked = spot(100, 120, wall);
	expect.equal(blocked.clear, false, 'nowhere is clear');
	expect.equal(blocked.base, 20, 'the fallback sits on the top row');
	expect.equal(blocked.x0, 40, 'centred on the mark');
	expect.equal(spot(100, 300).x0, 0, 'wider than the plot: from its left edge');
});
