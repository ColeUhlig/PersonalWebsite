// A throw inside a timed redraw is logged once and stops that redraw (piece C2, Task 15's final
// review fixes, Minor 9): the texture insets redraw four times a second and step 9's readout twice,
// on intervals, and an uncaught throw there would repeat as a page error on every tick while on
// screen. Each is broken on purpose here and must report itself exactly once, never as a page error.
import { test, expect } from '@playwright/test';
import { oceanRunning, scrollToFigure, scrollToId } from './helpers/story.js';

function collect(page) {
	const pageErrors = [];
	const logged = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') logged.push(message.text());
	});
	return { pageErrors, logged };
}

test('a throwing inset redraw is logged once and stops', async ({ page }) => {
	test.setTimeout(120_000);
	const { pageErrors, logged } = collect(page);
	// Every inset draws its pictures with putImageData; this one throws.
	await page.addInitScript(() => {
		CanvasRenderingContext2D.prototype.putImageData = () => {
			throw new Error('putImageData broken on purpose');
		};
	});
	await oceanRunning(page, '/ocean/', 10);
	await scrollToFigure(page, 'fields', 'figure.inset');
	await page.waitForTimeout(2000);
	expect(pageErrors).toEqual([]);
	expect(logged.filter((text) => text.includes('the fields inset stopped'))).toHaveLength(1);
});

test("a throwing readout update is logged once and stops", async ({ page }) => {
	test.setTimeout(120_000);
	const { pageErrors, logged } = collect(page);
	// The readout's element refuses its text.
	await page.addInitScript(() => {
		document.addEventListener('DOMContentLoaded', () => {
			const element = document.querySelector('[data-readout="slopes"]');
			Object.defineProperty(element, 'textContent', {
				set() {
					throw new Error('readout broken on purpose');
				},
				get() {
					return '';
				},
			});
		});
	});
	await oceanRunning(page, '/ocean/', 10);
	await scrollToId(page, 'slopes', 0.3);
	await page.waitForTimeout(2000);
	expect(pageErrors).toEqual([]);
	expect(logged.filter((text) => text.includes('the slope readout stopped'))).toHaveLength(1);
});
