// The clock the ocean reads (piece C): the wall clock, minus the time it spent paused. Reduced
// motion starts it paused and the page's Play button starts it (spec 2: "the ocean keeps animating
// only when the visitor presses play"). Both of the engine's clocks, the FFT's looping one and the
// teaching steps' unwrapped one, read ocean.now(), so pausing this holds the whole sea still.
export function createPlayClock(wall, { playing = true } = {}) {
	let removed = 0;
	let pausedAt = playing ? null : wall();
	return Object.freeze({
		now: () => (pausedAt ?? wall()) - removed,
		play() {
			if (pausedAt !== null) {
				removed += wall() - pausedAt;
				pausedAt = null;
			}
		},
		pause() {
			if (pausedAt === null) {
				pausedAt = wall();
			}
		},
		playing: () => pausedAt === null,
	});
}
