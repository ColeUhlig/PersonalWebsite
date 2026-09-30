// The sea's clock. Every frequency in the cascades and swells is a multiple of
// 2 pi / loopPeriod, so the sea repeats exactly every loopPeriod seconds and the time can be
// wrapped without a seam: everything that computes the sea from the same clock computes the
// same sea. Cascades update one per frame on a fixed three-frame rotation, and the surface
// cross-fades each cascade's previous and current result over the frames since that result was
// promoted. The clock says WHAT sea to compute; the frame counter alone says how far the fade
// has run.
// Twin of roblox-ocean/src/shared/Ocean/OceanClock.luau.
import { clamp, mod } from './luau.js';

// Frames between two updates of the SAME cascade, whatever the tier. Three, because the High
// tier has three cascades and one evolve per frame is the budget; the shorter tiers keep the
// period and idle the spare slots rather than compressing it.
export const PERIOD = 3;

// serverTime % loopPeriod, floored like Luau's so a negative clock still lands in [0, loopPeriod).
export function time(serverTime, loopPeriod) {
	return mod(serverTime, loopPeriod);
}

// Which cascade this frame evolves (the Luau cascade number, 1-based), or null (Luau's nil)
// when the slot belongs to a cascade the tier does not have. The period is fixed at three: a
// one-cascade tier used to take `(frame - 1) % 1 + 1` and evolve its only cascade EVERY frame
// -- 60 Hz of FFT on the weakest machine, and a field that stepped a whole update each frame
// instead of being blended towards one. Idling the spare slots gives every tier the same 20 Hz
// per cascade, so a result is held for the same three frames wherever it runs.
export function cascadeForFrame(frame, cascadeCount) {
	const slot = mod(frame, PERIOD);
	return slot < cascadeCount ? slot + 1 : null;
}

// How far the cross-fade from previous to current has run, counted in FRAMES since the
// promotion: 1/3 on the promotion frame itself, then 2/3, then 1, and 1 until the next
// promotion. Counted rather than timed because a worker's result arrives a frame or two after
// its request and never on the same beat twice; a fraction that moved with those arrivals rose
// unevenly and Cole read it as jitter in the near water (2026-09-19). The promotion is on the
// rotation, so this is a clean third of a step per frame whatever the workers are doing, and
// holding at 1 means a result that misses its rotation shows the current fields instead of
// overshooting past them. Before the first promotion (promotedFrame 0) it is 2/3 on frame 1 and
// 1 from frame 2 on, which nothing can see: with nothing promoted there is no current result
// and blend leaves the display alone.
export function fadeFraction(frame, promotedFrame, period) {
	return clamp((frame - promotedFrame + 1) / period, 0, 1);
}
