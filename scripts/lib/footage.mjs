// The encode plan for one showcase clip. Pure, so the choices (sizes, bitrates, codecs, file names,
// the window taken from the recording) have tests; scripts/ocean-footage.mjs runs the commands.
// Two-pass VP9 and H.264 at a bitrate worked out from the clip's length, so every file lands near
// TARGET_BYTES whatever the sea does to the encoder; no audio; 30 frames a second by default.
import { join } from 'node:path';
import { FOOTAGE_SHOTS, clipFiles } from '../../content/ocean/js/engine/showcase.js';

export const TARGET_BYTES = 3_500_000;
export const MAX_BYTES = 6_000_000;
export const MAX_SECONDS = 30;
export const MIN_KBPS = 600;
export const MAX_KBPS = 8000;
// The studio shot shows Studio's own windows, whose text needs the extra width to stay readable.
export const WIDTHS = Object.freeze({ deck: 1280, flyup: 1280, crest: 1280, studio: 1600 });
// The share of the byte budget given to the video stream; the rest covers the container and a
// two-pass encode landing a little over its target.
const VIDEO_SHARE = 0.92;
const MAX_FPS = 60;

export function videoKbps(seconds, targetBytes = TARGET_BYTES) {
	if (!(Number.isFinite(seconds) && seconds > 0)) {
		throw new Error(`a clip needs a length above 0 seconds, got ${seconds}`);
	}
	const kbps = Math.floor((targetBytes * 8 * VIDEO_SHARE) / seconds / 1000);
	return Math.min(MAX_KBPS, Math.max(MIN_KBPS, kbps));
}

export function clipWindow(inputSeconds, { start = 0, length } = {}) {
	if (!(Number.isFinite(inputSeconds) && inputSeconds > 0)) {
		throw new Error(`the recording has no length (${inputSeconds} s)`);
	}
	if (!(start >= 0) || start >= inputSeconds) {
		throw new Error(`--start ${start} is outside the ${inputSeconds.toFixed(1)} s recording`);
	}
	const available = inputSeconds - start;
	const wanted = length ?? available;
	if (!(wanted > 0)) {
		throw new Error(`--length must be above 0, got ${length}`);
	}
	return Object.freeze({ start, length: Math.min(wanted, available, MAX_SECONDS) });
}

export function planEncode({ shot, input, outDir, passDir, window, fps = 30 }) {
	if (!FOOTAGE_SHOTS.includes(shot)) {
		throw new Error(`unknown shot ${shot}; use one of ${FOOTAGE_SHOTS.join(', ')}`);
	}
	if (!Number.isInteger(fps) || fps < 1 || fps > MAX_FPS) {
		throw new Error(`--fps must be a whole number from 1 to ${MAX_FPS}, got ${fps}`);
	}
	const files = clipFiles(shot);
	const outputs = Object.freeze({
		webm: join(outDir, files.webm),
		mp4: join(outDir, files.mp4),
		poster: join(outDir, files.poster),
	});
	const kbps = videoKbps(window.length);
	const bitrate = `${kbps}k`;
	// Never wider than the recording, and always an even width for the 4:2:0 encoders.
	const scale = `scale='trunc(min(${WIDTHS[shot]},iw)/2)*2':-2:flags=lanczos`;
	const source = ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(window.start), '-t', String(window.length), '-i', input];
	const video = ['-vf', `fps=${fps},${scale},format=yuv420p`, '-an'];
	const vp9 = ['-c:v', 'libvpx-vp9', '-b:v', bitrate, '-row-mt', '1', '-deadline', 'good'];
	const x264 = ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-b:v', bitrate];
	const vp9Log = join(passDir, `${shot}-vp9`);
	const x264Log = join(passDir, `${shot}-x264`);
	const posterAt = String(window.start + window.length / 2);
	const commands = [
		[...source, ...video, ...vp9, '-cpu-used', '4', '-pass', '1', '-passlogfile', vp9Log, '-f', 'null', '-'],
		[...source, ...video, ...vp9, '-cpu-used', '2', '-pass', '2', '-passlogfile', vp9Log, outputs.webm],
		[...source, ...video, ...x264, '-pass', '1', '-passlogfile', x264Log, '-f', 'null', '-'],
		[...source, ...video, ...x264, '-pass', '2', '-passlogfile', x264Log, '-movflags', '+faststart', outputs.mp4],
		['-hide_banner', '-loglevel', 'error', '-y', '-ss', posterAt, '-i', input, '-frames:v', '1', '-vf', scale, '-q:v', '3', '-update', '1', outputs.poster],
	];
	return Object.freeze({ outputs, kbps, commands: Object.freeze(commands.map((command) => Object.freeze(command))) });
}
