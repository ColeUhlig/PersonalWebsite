// The finale's working parts (piece C; spec 3, step 13, and the 2026-09-30 decisions): the live
// numbers, measured in this browser at most twice a second while they are on screen, saying they
// are measuring until the first report so the block is never empty; the footage, shown only when
// media/footage.json lists a valid clip (engine/showcase.js decides what is valid), fetched from a
// site-absolute path so the page works at /ocean without a slash, videos loading nothing until
// played; the Play button, shown only for a real place URL (placeUrl); the Roblox / Unleashed
// toggle, shown only if the renderer can switch (page/renderMode.js); and the Play / Pause button
// over the ocean's clock (paused from the start under reduced motion). The Luau proof panel is
// B's, mounted embedded by page.js.
import { FOOTAGE_DIR, FOOTAGE_MANIFEST, footageClips, placeUrl } from '../engine/showcase.js';
import { MEASURING, summarizeLive } from '../page/liveSummary.js';
import { renderModeControl } from '../page/renderMode.js';

export const CLIP_CAPTIONS = Object.freeze({
	deck: 'Deck height, where a player would stand.',
	flyup: 'Rising until the far sea comes into view.',
	crest: 'Down low, on the foam and the glow.',
	studio: 'The Studio window around it, profiler open.',
});
// Twice a second at most; a timer that fires a little early still paints.
const PAINT_EVERY_MS = 500;
const PAINT_SLACK_MS = 30;
// A frame rate averaged over less than this is too noisy to show.
const MIN_FPS_WINDOW_MS = 250;

export function mountPlayButton(anchor, url = placeUrl()) {
	if (!url) {
		anchor.hidden = true;
		anchor.removeAttribute('href');
		return false;
	}
	anchor.href = url;
	anchor.hidden = false;
	return true;
}

async function fetchManifest() {
	const response = await fetch(FOOTAGE_MANIFEST, { cache: 'no-cache' });
	if (!response.ok) {
		throw new Error(`${FOOTAGE_MANIFEST}: HTTP ${response.status}`);
	}
	return response.json();
}

function clipFigure(clip) {
	const figure = document.createElement('figure');
	figure.className = 'clip';
	figure.dataset.shot = clip.shot;
	const video = document.createElement('video');
	video.controls = true;
	video.muted = true;
	video.playsInline = true;
	video.preload = 'none';
	video.poster = `${FOOTAGE_DIR}${clip.poster}`;
	video.width = clip.width;
	video.height = clip.height;
	for (const [file, type] of [[clip.webm, 'video/webm'], [clip.mp4, 'video/mp4']]) {
		const source = document.createElement('source');
		source.src = `${FOOTAGE_DIR}${file}`;
		source.type = type;
		video.append(source);
	}
	const caption = document.createElement('figcaption');
	caption.textContent = CLIP_CAPTIONS[clip.shot];
	figure.append(video, caption);
	return figure;
}

export async function mountFootage(section, { fetchManifest: read = fetchManifest, onShown = () => {} } = {}) {
	let clips = [];
	try {
		clips = footageClips(await read());
	} catch (error) {
		console.warn('[ocean] the footage manifest could not be read; the footage stays hidden', error);
	}
	if (clips.length === 0) {
		section.hidden = true;
		return 0;
	}
	section.querySelector('[data-clips]').replaceChildren(...clips.map(clipFigure));
	section.hidden = false;
	onShown();
	return clips.length;
}

function showRows(list, rows) {
	list.replaceChildren(...rows.flatMap(({ label, value }) => {
		const dt = document.createElement('dt');
		dt.textContent = label;
		const dd = document.createElement('dd');
		dd.textContent = value;
		return [dt, dd];
	}));
}

// Before the ocean runs: the block says it is getting there rather than sitting empty.
export function showLiveStarting(section) {
	showRows(section.querySelector('[data-live]'), [{ label: 'Live ocean', value: `starting, then ${MEASURING}` }]);
}

// No ocean in this browser: one plain sentence instead of the numbers and their label.
export function showLiveUnavailable(section) {
	section.querySelector('[data-live]').hidden = true;
	section.querySelector('.dim').hidden = true;
	section.querySelector('[data-live-phone]').hidden = true;
	section.querySelector('[data-live-none]').hidden = false;
}

export function mountLiveNumbers(section, handle, { paused = () => false } = {}) {
	const list = section.querySelector('[data-live]');
	const phone = section.querySelector('[data-live-phone]');
	let last = null;
	let paintedAt = -Infinity;
	let visible = false;

	// The frame rate since the last sample; null until there is a long enough interval.
	function frameRate(frame, time) {
		const previous = last;
		last = { frame, time };
		if (previous === null || time - previous.time < MIN_FPS_WINDOW_MS) {
			return null;
		}
		return Math.round(((frame - previous.frame) * 1000) / (time - previous.time));
	}

	function paint() {
		const status = handle.status();
		const time = performance.now();
		paintedAt = time;
		const fps = frameRate(status.frame, time);
		const { rows, phoneRule } = summarizeLive({ status, report: handle.report(), fps, paused: paused() });
		showRows(list, rows);
		phone.hidden = !phoneRule;
	}

	function paintIfDue() {
		if (performance.now() - paintedAt >= PAINT_EVERY_MS - PAINT_SLACK_MS) {
			paint();
		}
	}

	paint();
	if (typeof IntersectionObserver === 'function') {
		new IntersectionObserver((entries) => {
			visible = entries.some((entry) => entry.isIntersecting);
			if (visible) paintIfDue();
		}, { rootMargin: '200px 0px' }).observe(section);
	} else {
		visible = true;
	}
	setInterval(() => {
		if (visible) {
			paintIfDue();
		} else {
			// Off screen: keep the frame-rate sample fresh so the first paint back is about now.
			last = { frame: handle.status().frame, time: performance.now() };
		}
	}, PAINT_EVERY_MS);
	return Object.freeze({ paint });
}

export function mountRenderToggle(root, handle) {
	const control = renderModeControl(handle);
	if (!control) {
		root.hidden = true;
		return null;
	}
	const buttons = [...root.querySelectorAll('button[data-mode]')];
	const show = () => {
		for (const button of buttons) button.setAttribute('aria-checked', String(button.dataset.mode === control.mode()));
	};
	for (const button of buttons) {
		button.addEventListener('click', () => {
			try {
				control.choose(button.dataset.mode);
			} catch (error) {
				console.error('[ocean] the render mode could not change', error);
			}
			show();
		});
	}
	show();
	root.hidden = false;
	return control;
}

export function mountMotionButton(button, clock) {
	const show = () => {
		button.textContent = clock.playing() ? 'Pause the ocean' : 'Play the ocean';
	};
	button.addEventListener('click', () => {
		if (clock.playing()) clock.pause();
		else clock.play();
		show();
	});
	show();
	button.hidden = false;
}
