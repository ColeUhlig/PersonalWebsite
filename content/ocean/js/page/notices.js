// The notices the page can show over the story (piece C). Plain sentences; the copy check
// (tests/ocean/page/copy.test.js) checks their numbers like the rest of the copy.
export const NOTICES = Object.freeze({
	webgl: 'The live simulation requires WebGL 2, which this browser has disabled or does not support. The text, the mathematics and the footage remain available.',
	load: 'The live simulation could not load: one of its scripts did not arrive from cdn.jsdelivr.net. The text remains available; reload the page to try again.',
	frames: 'The live simulation encountered an error and may have stopped. The text remains available; reload the page to try again.',
});
