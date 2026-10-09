// What index.html's story must hold (piece C2, Task 0): one section per step in order with its id,
// title, controls and math, the cards and slots where the contract puts them, the chapter labels,
// the math box and the stylesheets. Lane G rewrites the words and must keep this structure; Node
// reads it with regular expressions, so it needs no browser.
import { CHAPTERS, STEP_IDS } from '../../../content/ocean/js/stages/steps.js';

export const CARD_STEP_IDS = Object.freeze(['into-3d', 'many-waves', 'highlights', 'fft', 'layers', 'sampling', 'mesh', 'painted', 'foam', 'glow']);
export const SLOTS = Object.freeze({
	slopes: ['data-readout="slopes"'],
	frequency: ['data-chart="frequency"'],
	fourier: ['data-chart="fourier"'],
	jonswap: ['data-chart="spectrum"'],
	'random-sea': ['data-chart="phase" data-motion="still"'],
	time: ['data-chart="phase" data-motion="turning"'],
	fft: ['data-chart="transforms"'],
	fields: ['data-inset="fields"'],
	sampling: ['data-inset="sampling"'],
	painted: ['data-inset="painted"'],
});
export const CHAPTER_WORDS = Object.freeze(['one', 'two', 'three', 'four', 'five', 'six']);
export const STYLESHEETS = Object.freeze(['/ocean/style.css', '/ocean/proof.css', '/ocean/css/mathbox.css', '/ocean/css/frequency.css', '/ocean/css/insets.css']);

// Each step section's opening tag attributes and inner HTML, in document order.
export function structureOf(html) {
	const sections = [...html.matchAll(/<section class="step[^"]*" id="step-(\d+)" data-step="(\d+)" data-step-id="([a-z0-9-]+)"[^>]*>([\s\S]*?)(?=<section class="step|<\/main>)/g)];
	return sections.map((m) => ({ n: Number(m[1]), dataStep: Number(m[2]), id: m[3], inner: m[4] }));
}

export const EXPECTED = Object.freeze(STEP_IDS.map((id, i) => Object.freeze({ n: i + 1, id, chapter: CHAPTERS.findIndex((c) => c.first === id) })));
