// Keeps one bad frame from killing the live ocean (piece C; A2 final review: "one exception must
// not stop the frame loop"). The loop schedules its next frame first and reports each exception
// here: the first is logged with its stack, then one line every LOG_EVERY failures, and when
// NOTICE_AFTER_FRAMES frames in a row have failed the page is told once, so it can say the ocean
// may have stopped while the story keeps working.
export const NOTICE_AFTER_FRAMES = 30;
export const LOG_EVERY = 300;

export function createFrameGuard({ log = console, onPersistent = () => {} } = {}) {
	let failures = 0;
	let streak = 0;
	let noticed = false;
	return Object.freeze({
		ok() {
			streak = 0;
		},
		failed(error) {
			failures += 1;
			streak += 1;
			if (failures === 1 || failures % LOG_EVERY === 0) {
				log.error(`[ocean] frame failed (${failures} so far)`, error);
			}
			if (!noticed && streak >= NOTICE_AFTER_FRAMES) {
				noticed = true;
				onPersistent(error);
			}
		},
		failures: () => failures,
	});
}
