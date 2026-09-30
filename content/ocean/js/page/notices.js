// The notices the page can show over the story (piece C). Plain sentences; the copy check
// (tests/ocean/page/copy.test.js) checks their numbers like the rest of the copy.
export const NOTICES = Object.freeze({
	webgl: "This live ocean needs WebGL 2, which this browser has turned off or doesn't support. The story, the maths and the footage still work.",
	load: "The live ocean couldn't load: one of its scripts didn't arrive from cdn.jsdelivr.net. The story still works; reload the page to try again.",
	frames: 'The live ocean hit an error and may have stopped moving. The story still works; reload the page to try again.',
});
