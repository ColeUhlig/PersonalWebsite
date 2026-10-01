// The page's shared motion helpers (piece C; browser-free): the one smoothstep the scroll blend
// (scrollMap.js), the tilt's ease back (tiltLook.js) and the shot's return (shotControl.js) ease
// by, and the one cap on a frame's seconds the story clock and the tilt use (ui/storyStage.js,
// tiltLook.js).

// A frame's seconds are capped here, so a stall does not land the camera in one jump.
export const MAX_FRAME_SECONDS = 0.25;

/** The cubic ease 3x² − 2x³ for x in 0..1: flat at both ends, 0.5 in the middle. */
export const smoothstep = (x) => x * x * (3 - 2 * x);
