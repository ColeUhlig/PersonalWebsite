// Tilting a phone to look around the ocean (piece C Task 9b): the events, the permission and the
// button. On a touch-first screen the story turns orbit off so a swipe scrolls the page; tilting
// the phone swings the camera a few degrees round the current shot instead (page/tiltLook.js does
// the maths, ui/storyStage.js applies it inside the orbit limits). Off on fine-pointer screens and
// under reduced motion. Where the browser needs a tap before it shares the phone's orientation
// (iOS: DeviceOrientationEvent.requestPermission), a button asks for it, and nothing is asked
// without that tap. Elsewhere (Android) it listens at once and turns on with the first real
// reading; if none comes within FIRST_READING_MS the phone has no sensor to offer and nothing
// shows. The button's wording is the only copy here.
import { createTiltFollower } from '../page/tiltLook.js';

export const ASK_TEXT = 'Tilt to look around';
export const DENIED_TEXT = 'Motion access was denied';
// Wall time is fine here: these are the button's and the sensor's timeouts, not motion.
const DENIED_HIDE_MS = 4000;
const FIRST_READING_MS = 3000;

// The screen's rotation in degrees (the follower rounds it to a quarter turn).
function screenAngle(win) {
	const angle = win.screen?.orientation?.angle;
	if (typeof angle === 'number') {
		return angle;
	}
	return typeof win.orientation === 'number' ? win.orientation : 0;
}

const hasReading = (event) => Number.isFinite(event.beta) && Number.isFinite(event.gamma);

/**
 * @param {{ button: HTMLButtonElement, story: { useTilt(source: object): void }, win?: Window }} parts
 * @returns {{ state(): 'off' | 'needs-permission' | 'on' | 'denied' | 'unsupported', offset(): { yaw: number, pitch: number } }}
 */
export function mountTilt({ button, story, win = window }) {
	const follower = createTiltFollower();
	let state = 'off';
	const handle = Object.freeze({ state: () => state, offset: () => follower.offset() });
	const wanted = win.matchMedia('(pointer: coarse)').matches && !win.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (!wanted) {
		return handle;
	}
	const Orientation = win.DeviceOrientationEvent;
	if (typeof Orientation !== 'function') {
		state = 'unsupported';
		return handle;
	}

	const onOrientation = (event) => follower.sense(event.beta, event.gamma, screenAngle(win));
	function turnOn() {
		state = 'on';
		follower.reset();
		story.useTilt(follower);
	}

	if (typeof Orientation.requestPermission === 'function') {
		askFirst({ button, win, Orientation, onOrientation, turnOn, setState: (next) => (state = next), getState: () => state });
		return handle;
	}

	// Android: listen at once; the first real reading turns tilt on (a browser with no sensor may
	// send one blank event, which does not count).
	const giveUp = win.setTimeout(() => {
		if (state === 'off') {
			state = 'unsupported';
			win.removeEventListener('deviceorientation', listen);
		}
	}, FIRST_READING_MS);
	function listen(event) {
		if (state === 'off' && hasReading(event)) {
			win.clearTimeout(giveUp);
			turnOn();
		}
		if (state === 'on') {
			onOrientation(event);
		}
	}
	win.addEventListener('deviceorientation', listen);
	return handle;
}

// iOS: the button asks, from its tap; a refusal (or a request that fails) says so and the button
// goes after DENIED_HIDE_MS.
function askFirst({ button, win, Orientation, onOrientation, turnOn, setState, getState }) {
	setState('needs-permission');
	button.textContent = ASK_TEXT;
	button.hidden = false;
	const deny = (error) => {
		if (error) {
			console.warn('[ocean] motion access could not be requested', error);
		}
		setState('denied');
		button.textContent = DENIED_TEXT;
		win.setTimeout(() => {
			button.hidden = true;
		}, DENIED_HIDE_MS);
	};
	// A second tap while the first request is open asks nothing more.
	let asking = false;
	button.addEventListener('click', () => {
		if (asking || getState() !== 'needs-permission') {
			return;
		}
		asking = true;
		let request;
		try {
			// Called straight from the tap: iOS only asks inside a user gesture.
			request = Promise.resolve(Orientation.requestPermission());
		} catch (error) {
			request = Promise.reject(error);
		}
		request.then(
			(answer) => {
				asking = false;
				if (answer !== 'granted') {
					deny(null);
					return;
				}
				win.addEventListener('deviceorientation', onOrientation);
				turnOn();
				button.hidden = true;
			},
			(error) => {
				asking = false;
				deny(error);
			},
		);
	});
}
