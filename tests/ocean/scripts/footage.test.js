import { test } from 'node:test';
import { join } from 'node:path';
import * as expect from '../expect.js';
import * as Footage from '../../../scripts/lib/footage.mjs';

const throws = (run) => {
	try {
		run();
	} catch (error) {
		return error.message;
	}
	return '';
};

test('the video bitrate aims every clip at about 3.5 MB', () => {
	expect.equal(Footage.videoKbps(20), 1288, '20 s: 3.5 MB * 8 * 0.92 / 20');
	expect.equal(Footage.videoKbps(2), Footage.MAX_KBPS, 'a short clip is capped');
	expect.equal(Footage.videoKbps(60), Footage.MIN_KBPS, 'a long clip is floored');
	expect.truthy(throws(() => Footage.videoKbps(0)) !== '', 'zero seconds');
	expect.truthy(throws(() => Footage.videoKbps(Number.NaN)) !== '', 'NaN seconds');
});

test('clipWindow keeps a clip inside the recording and under 30 s', () => {
	const whole = Footage.clipWindow(45, {});
	expect.equal(`${whole.start} ${whole.length}`, '0 30', 'a long recording is cut to 30 s');
	const trimmed = Footage.clipWindow(12, { start: 2 });
	expect.equal(`${trimmed.start} ${trimmed.length}`, '2 10', 'the rest after --start');
	const asked = Footage.clipWindow(12, { start: 2, length: 50 });
	expect.equal(asked.length, 10, 'a --length past the end stops at the end');
	expect.equal(Footage.clipWindow(12, { length: 4 }).length, 4, 'a --length inside');
});

test('clipWindow refuses a window outside the recording', () => {
	expect.truthy(throws(() => Footage.clipWindow(12, { start: 12 })).includes('outside'), 'start at the end');
	expect.truthy(throws(() => Footage.clipWindow(12, { start: -1 })).includes('outside'), 'negative start');
	expect.truthy(throws(() => Footage.clipWindow(12, { start: Number.NaN })).includes('outside'), 'NaN start');
	expect.truthy(throws(() => Footage.clipWindow(12, { length: 0 })).includes('--length'), 'zero length');
	expect.truthy(throws(() => Footage.clipWindow(0, {})).includes('no length'), 'an empty recording');
});

test('planEncode writes the three fixed names with two-pass VP9 and H.264', () => {
	const plan = Footage.planEncode({ shot: 'deck', input: '/in/rec.mov', outDir: '/out', passDir: '/tmp/p', window: { start: 2, length: 20 } });
	expect.equal(plan.outputs.webm, join('/out', 'deck.webm'), 'webm');
	expect.equal(plan.outputs.mp4, join('/out', 'deck.mp4'), 'mp4');
	expect.equal(plan.outputs.poster, join('/out', 'deck.jpg'), 'poster');
	expect.equal(plan.kbps, 1288, 'bitrate');
	expect.equal(plan.commands.length, 5, 'five commands');
	const [vp9One, vp9Two, x264One, x264Two, poster] = plan.commands;
	expect.truthy(vp9One.includes('libvpx-vp9') && vp9One.includes('1288k') && vp9One.at(-1) === '-', 'VP9 pass 1 to null');
	expect.equal(vp9Two.at(-1), plan.outputs.webm, 'VP9 pass 2 writes the webm');
	expect.truthy(x264One.includes('libx264') && x264One.at(-1) === '-', 'H.264 pass 1 to null');
	expect.truthy(x264Two.includes('+faststart') && x264Two.at(-1) === plan.outputs.mp4, 'H.264 pass 2 writes a faststart mp4');
	for (const command of plan.commands.slice(0, 4)) {
		expect.truthy(command.includes('-an'), 'no audio');
		expect.equal(command[command.indexOf('-ss') + 1], '2', 'starts at --start');
		expect.equal(command[command.indexOf('-t') + 1], '20', 'runs --length');
		expect.truthy(command[command.indexOf('-passlogfile') + 1].startsWith(join('/tmp/p', 'deck-')), 'pass logs in the temp dir');
	}
	expect.equal(poster[poster.indexOf('-ss') + 1], '12', 'the poster is the middle frame');
	expect.equal(poster.at(-1), plan.outputs.poster, 'poster path');
	expect.truthy(Object.isFrozen(plan.outputs) && Object.isFrozen(plan.commands[0]), 'frozen');
});

test('planEncode never upscales and gives the studio shot more width', () => {
	const vf = (shot) => {
		const command = Footage.planEncode({ shot, input: 'a', outDir: 'o', passDir: 'p', window: { start: 0, length: 10 } }).commands[1];
		return command[command.indexOf('-vf') + 1];
	};
	expect.truthy(vf('deck').includes("scale='trunc(min(1280,iw)/2)*2':-2"), `deck: ${vf('deck')}`);
	expect.truthy(vf('studio').includes("scale='trunc(min(1600,iw)/2)*2':-2"), `studio: ${vf('studio')}`);
	expect.truthy(vf('deck').startsWith('fps=30,'), 'thirty frames a second by default');
});

test('planEncode refuses an unknown shot and a bad frame rate', () => {
	const base = { input: 'a', outDir: 'o', passDir: 'p', window: { start: 0, length: 10 } };
	expect.truthy(throws(() => Footage.planEncode({ ...base, shot: 'orbit' })).includes('deck, flyup, crest, studio'), 'unknown shot');
	for (const fps of [0, 61, 29.97]) {
		expect.truthy(throws(() => Footage.planEncode({ ...base, shot: 'deck', fps })).includes('--fps'), `fps ${fps}`);
	}
});
