// The live line under step 9's arrows (piece C2; lane C owns this file; spec 10.7): how far apart
// the exact and the central-difference normals are on the sea on screen, and the spacing the
// difference samples at, read from the overlays' probe at most twice a second while step 9 is being
// read, and written only when the words change. Its element carries data-copy-skip="live" and is
// empty in the served page: every number in it is computed in the visitor's browser.
import { readoutText } from '../page/overlayModel.js';
import { stepOf } from '../stages/steps.js';

const UPDATE_MS = 500;

export function mountOverlayReadout({ handle, watchReading }) {
	const element = document.querySelector('[data-readout="slopes"]');
	const step = stepOf('slopes');
	let timer = 0;
	let text = '';
	if (!element || !handle.story) {
		return Object.freeze({ hooks: Object.freeze({ text: () => text }) });
	}

	function update() {
		const probe = handle.story.hooks.overlays();
		const next = probe.kind === 'slopes' ? readoutText(probe) : text;
		if (next !== text) {
			text = next;
			element.textContent = text;
		}
	}

	watchReading((reading) => {
		const here = reading.phase === 'step' && reading.step === step;
		if (here && timer === 0) {
			update();
			timer = setInterval(update, UPDATE_MS);
		} else if (!here && timer !== 0) {
			clearInterval(timer);
			timer = 0;
		}
	});

	return Object.freeze({ hooks: Object.freeze({ text: () => text }) });
}
