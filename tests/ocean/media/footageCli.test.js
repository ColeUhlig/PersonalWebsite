import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';
import { footageClips } from '../../../content/ocean/js/engine/showcase.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FFMPEG = existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
const HAS_FFMPEG = spawnSync(FFMPEG, ['-version']).status === 0;
const SKIP = HAS_FFMPEG ? false : 'ffmpeg is not installed';

// A test pattern stands in for a screen recording.
function recording(dir, name, size) {
	const file = join(dir, name);
	const made = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=60`, '-t', '4', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', file]);
	if (made.status !== 0) {
		throw new Error(`could not make ${name}: ${made.stderr}`);
	}
	return file;
}

function footage(args) {
	return spawnSync(process.execPath, [join(ROOT, 'scripts/ocean-footage.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
}

const magic = (file, length) => readFileSync(file).subarray(0, length).toString('hex');

test('encodes a recording into the three files and the manifest', { skip: SKIP, timeout: 180_000 }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const input = recording(dir, 'input.mov', '1920x1080');
		const out = join(dir, 'media');
		const first = footage(['deck', input, '--start', '1', '--length', '2', '--out', out]);
		expect.equal(first.status, 0, `deck run failed: ${first.stderr}`);
		expect.equal(magic(join(out, 'deck.webm'), 4), '1a45dfa3', 'webm is EBML');
		expect.equal(readFileSync(join(out, 'deck.mp4')).subarray(4, 8).toString('latin1'), 'ftyp', 'mp4 has ftyp');
		expect.equal(magic(join(out, 'deck.jpg'), 2), 'ffd8', 'poster is JPEG');
		const second = footage(['crest', input, '--length', '2', '--out', out]);
		expect.equal(second.status, 0, `crest run failed: ${second.stderr}`);
		const clips = footageClips(JSON.parse(readFileSync(join(out, 'footage.json'), 'utf8')));
		expect.equal(clips.map((c) => c.shot).join(','), 'deck,crest', 'both clips, in shot order');
		expect.equal(`${clips[0].width}x${clips[0].height}`, '1280x720', 'scaled to 1280 wide');
		expect.near(clips[0].seconds, 2, 0.1, 'two seconds long');
		expect.equal(readdirSync(out).sort().join(','), 'crest.jpg,crest.mp4,crest.webm,deck.jpg,deck.mp4,deck.webm,footage.json', 'no staging or partial files left');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('refuses an unknown shot and leaves nothing behind', { skip: SKIP }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const out = join(dir, 'media');
		const run = footage(['orbit', join(dir, 'missing.mov'), '--out', out]);
		expect.equal(run.status, 1, 'exit code');
		expect.truthy(run.stderr.includes('deck, flyup, crest, studio'), `names the shots: ${run.stderr}`);
		expect.equal(existsSync(out), false, 'no output directory');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a corrupt footage.json stops the tool before it encodes and is left as it was', { skip: SKIP }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const input = recording(dir, 'input.mov', '640x360');
		const out = join(dir, 'media');
		mkdirSync(out, { recursive: true });
		writeFileSync(join(out, 'footage.json'), 'not json');
		const run = footage(['deck', input, '--out', out]);
		expect.equal(run.status, 1, 'exit code');
		expect.truthy(run.stderr.includes('footage.json'), `names the file: ${run.stderr}`);
		expect.equal(readFileSync(join(out, 'footage.json'), 'utf8'), 'not json', 'untouched');
		expect.equal(existsSync(join(out, 'deck.webm')), false, 'nothing encoded');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a footage.json that is JSON but not a manifest stops the tool before it encodes and is left as it was', { skip: SKIP }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	const kept = { shot: 'deck', webm: 'deck.webm', mp4: 'deck.mp4', poster: 'deck.jpg', width: 1280, height: 720, seconds: 20 };
	const manifests = {
		'an array': '[]',
		'a number': '7',
		'clips that are not an array': '{"clips":{}}',
		'an entry it would drop': JSON.stringify({ clips: [kept, { shot: 'orbit' }] }),
	};
	try {
		const input = recording(dir, 'input.mov', '640x360');
		const out = join(dir, 'media');
		mkdirSync(out, { recursive: true });
		for (const [name, text] of Object.entries(manifests)) {
			writeFileSync(join(out, 'footage.json'), text);
			const run = footage(['crest', input, '--out', out]);
			expect.equal(run.status, 1, `${name}: exit code`);
			expect.truthy(run.stderr.includes('footage.json') && run.stderr.includes('not a valid manifest'), `${name}: names the file and the problem: ${run.stderr}`);
			expect.equal(readFileSync(join(out, 'footage.json'), 'utf8'), text, `${name}: untouched`);
			expect.equal(existsSync(join(out, 'crest.webm')), false, `${name}: nothing encoded`);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a failed encode leaves the shot\'s existing files, the manifest and no partial files behind', { skip: SKIP }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const input = recording(dir, 'input.mov', '640x360');
		const out = join(dir, 'media');
		mkdirSync(out, { recursive: true });
		const manifest = `${JSON.stringify({ clips: [{ shot: 'deck', webm: 'deck.webm', mp4: 'deck.mp4', poster: 'deck.jpg', width: 1280, height: 720, seconds: 20 }] })}\n`;
		const old = { 'deck.webm': 'old webm', 'deck.mp4': 'old mp4', 'deck.jpg': 'old poster', 'footage.json': manifest };
		for (const [name, text] of Object.entries(old)) {
			writeFileSync(join(out, name), text);
		}
		// Stands in for ffmpeg: a first pass (output -) succeeds; the first real file is written
		// partly, then the encoder fails.
		const fake = join(dir, 'fake-ffmpeg');
		writeFileSync(fake, '#!/bin/sh\nfor last; do :; done\n[ "$last" = "-" ] && exit 0\nprintf partial > "$last"\necho "encoder crashed" >&2\nexit 1\n', { mode: 0o755 });
		const run = spawnSync(process.execPath, [join(ROOT, 'scripts/ocean-footage.mjs'), 'deck', input, '--out', out], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, FFMPEG: fake } });
		expect.equal(run.status, 1, 'exit code');
		expect.truthy(run.stderr.includes('encoder crashed'), `passes on ffmpeg's message: ${run.stderr}`);
		for (const [name, text] of Object.entries(old)) {
			expect.equal(readFileSync(join(out, name), 'utf8'), text, `${name} untouched`);
		}
		expect.equal(readdirSync(out).sort().join(','), Object.keys(old).sort().join(','), 'nothing else left in the output directory');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a narrow recording is not upscaled', { skip: SKIP, timeout: 120_000 }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const input = recording(dir, 'small.mov', '640x360');
		const out = join(dir, 'media');
		const run = footage(['flyup', input, '--length', '2', '--out', out]);
		expect.equal(run.status, 0, `run failed: ${run.stderr}`);
		const [clip] = footageClips(JSON.parse(readFileSync(join(out, 'footage.json'), 'utf8')));
		expect.equal(`${clip.width}x${clip.height}`, '640x360', 'kept at its own size');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
