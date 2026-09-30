import { test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
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

const CLI = join(ROOT, 'scripts/ocean-footage.mjs');

// Runs the tool without blocking, so two can run at once or one can be sent a signal.
function footageAsync(args, env = {}) {
	const child = spawn(process.execPath, [CLI, ...args], { cwd: ROOT, env: { ...process.env, ...env } });
	let stderr = '';
	child.stderr.on('data', (chunk) => {
		stderr += chunk;
	});
	const done = new Promise((settle) => {
		child.on('close', (status, signal) => settle({ status, signal, stderr }));
	});
	return { child, done };
}

// Stands in for ffmpeg without encoding: first passes (output -) succeed at once; each real
// output waits FAKE_DELAY seconds, then the mp4 is a copy of a real clip (ffprobe reads it) and
// the webm and poster are a few bytes, or FAKE_WEBM_BYTES zero bytes for an oversized webm. It
// touches FAKE_MARKER, if set, whenever it runs.
const FAKE_ENCODER = `#!/bin/sh
[ -n "$FAKE_MARKER" ] && touch "$FAKE_MARKER"
for last; do :; done
[ "$last" = "-" ] && exit 0
sleep "\${FAKE_DELAY:-0}"
case "$last" in
	*.mp4) cp "$FAKE_MP4" "$last" ;;
	*.webm) if [ -n "$FAKE_WEBM_BYTES" ]; then head -c "$FAKE_WEBM_BYTES" /dev/zero > "$last"; else printf webm > "$last"; fi ;;
	*) printf poster > "$last" ;;
esac
`;

function fakeEncoder(dir) {
	const file = join(dir, 'fake-ffmpeg');
	writeFileSync(file, FAKE_ENCODER, { mode: 0o755 });
	return { FFMPEG: file, FAKE_MP4: recording(dir, 'sample.mp4', '320x180') };
}

const OLD_DECK = `${JSON.stringify({ clips: [{ shot: 'deck', webm: 'deck.webm', mp4: 'deck.mp4', poster: 'deck.jpg', width: 1280, height: 720, seconds: 20 }] })}\n`;

function seedDeck(out) {
	const old = { 'deck.webm': 'old webm', 'deck.mp4': 'old mp4', 'deck.jpg': 'old poster', 'footage.json': OLD_DECK };
	mkdirSync(out, { recursive: true });
	for (const [name, text] of Object.entries(old)) {
		writeFileSync(join(out, name), text);
	}
	return old;
}

function expectUntouched(out, old, extra = []) {
	for (const [name, text] of Object.entries(old)) {
		expect.equal(readFileSync(join(out, name), 'utf8'), text, `${name} untouched`);
	}
	expect.equal(readdirSync(out).sort().join(','), [...Object.keys(old), ...extra].sort().join(','), 'nothing else left in the output directory');
}

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

test('two shots encoded at once both end up in footage.json', { skip: SKIP, timeout: 60_000 }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const input = recording(dir, 'input.mov', '640x360');
		const env = { ...fakeEncoder(dir), FAKE_DELAY: '0.5' };
		const out = join(dir, 'media');
		const runs = ['deck', 'crest'].map((shot) => footageAsync([shot, input, '--out', out], env).done);
		const [deck, crest] = await Promise.all(runs);
		expect.equal(deck.status, 0, `deck run failed: ${deck.stderr}`);
		expect.equal(crest.status, 0, `crest run failed: ${crest.stderr}`);
		const clips = footageClips(JSON.parse(readFileSync(join(out, 'footage.json'), 'utf8')));
		expect.equal(clips.map((c) => c.shot).join(','), 'deck,crest', 'both clips listed');
		expect.equal(readdirSync(out).sort().join(','), 'crest.jpg,crest.mp4,crest.webm,deck.jpg,deck.mp4,deck.webm,footage.json', 'no lock, partial or staging files left');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('an oversized encode is refused and leaves the shot\'s files and the manifest as they were', { skip: SKIP, timeout: 60_000 }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const input = recording(dir, 'input.mov', '640x360');
		const out = join(dir, 'media');
		const old = seedDeck(out);
		const env = { ...process.env, ...fakeEncoder(dir), FAKE_WEBM_BYTES: '6000001' };
		const run = spawnSync(process.execPath, [CLI, 'deck', input, '--out', out], { cwd: ROOT, encoding: 'utf8', env });
		expect.equal(run.status, 1, `exit code: ${run.stderr}`);
		expect.truthy(run.stderr.includes('too large') && run.stderr.includes('webm 6.00 MB'), `says what is too large: ${run.stderr}`);
		expectUntouched(out, old);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('Ctrl-C mid-encode stops the tool, leaves the shot and the manifest, and removes its temp folders', { skip: SKIP, timeout: 60_000 }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const input = recording(dir, 'input.mov', '640x360');
		const out = join(dir, 'media');
		const old = seedDeck(out);
		const temp = join(dir, 'tmp');
		mkdirSync(temp);
		const marker = join(dir, 'encoding');
		// A first pass that says it has started and then takes 30 s, as a real encode would.
		const slow = join(dir, 'slow-ffmpeg');
		writeFileSync(slow, `#!/bin/sh\ntouch "${marker}"\nexec sleep 30\n`, { mode: 0o755 });
		const { child, done } = footageAsync(['deck', input, '--out', out], { FFMPEG: slow, TMPDIR: temp });
		const deadline = Date.now() + 20_000;
		while (!existsSync(marker) && Date.now() < deadline) {
			await new Promise((wake) => setTimeout(wake, 50));
		}
		expect.truthy(existsSync(marker), 'the encode started');
		expect.equal(readdirSync(temp).length, 1, 'the pass-log folder exists while encoding');
		const started = Date.now();
		child.kill('SIGINT');
		const guard = setTimeout(() => child.kill('SIGKILL'), 15_000);
		const result = await done;
		clearTimeout(guard);
		expect.truthy(Date.now() - started < 10_000, 'stopped without waiting for the encode');
		expect.equal(result.status, 130, `exit code after SIGINT (signal ${result.signal}): ${result.stderr}`);
		expect.truthy(result.stderr.includes('SIGINT'), `says it was stopped: ${result.stderr}`);
		expectUntouched(out, old);
		expect.equal(readdirSync(temp).join(','), '', 'pass-log folder removed');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('staging folders a killed run left hours ago are cleared, a running one is kept', { skip: SKIP, timeout: 60_000 }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const input = recording(dir, 'input.mov', '640x360');
		const out = join(dir, 'media');
		mkdirSync(join(out, '.ocean-footage-stale'), { recursive: true });
		writeFileSync(join(out, '.ocean-footage-stale', 'deck.webm'), 'half');
		const hoursAgo = new Date(Date.now() - 7 * 3600 * 1000);
		utimesSync(join(out, '.ocean-footage-stale'), hoursAgo, hoursAgo);
		mkdirSync(join(out, '.ocean-footage-live'));
		const env = { ...process.env, ...fakeEncoder(dir) };
		const run = spawnSync(process.execPath, [CLI, 'flyup', input, '--out', out], { cwd: ROOT, encoding: 'utf8', env });
		expect.equal(run.status, 0, `run failed: ${run.stderr}`);
		expect.equal(readdirSync(out).sort().join(','), '.ocean-footage-live,flyup.jpg,flyup.mp4,flyup.webm,footage.json', 'stale folder gone, live one kept');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a recording whose name has a colon is read as a file, not a protocol', { skip: SKIP, timeout: 60_000 }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		recording(dir, 'take:1.mov', '640x360');
		const out = join(dir, 'media');
		const run = spawnSync(process.execPath, [CLI, 'crest', 'take:1.mov', '--length', '1', '--out', out], { cwd: dir, encoding: 'utf8' });
		expect.equal(run.status, 0, `run failed: ${run.stderr}`);
		expect.equal(footageClips(JSON.parse(readFileSync(join(out, 'footage.json'), 'utf8')))[0].shot, 'crest', 'listed');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

async function until(check, ms) {
	const deadline = Date.now() + ms;
	while (!check() && Date.now() < deadline) {
		await new Promise((wake) => setTimeout(wake, 50));
	}
	return check();
}

function alive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

test('a second Ctrl-C kills an ffmpeg that ignores SIGTERM and exits at once, leaving no temp folders', { skip: SKIP, timeout: 60_000 }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const input = recording(dir, 'input.mov', '640x360');
		const out = join(dir, 'media');
		const old = seedDeck(out);
		const temp = join(dir, 'tmp');
		mkdirSync(temp);
		const marker = join(dir, 'encoding');
		// An encoder that ignores SIGTERM (sleep inherits the ignored signal), so only SIGKILL stops it.
		const stubborn = join(dir, 'stubborn-ffmpeg');
		writeFileSync(stubborn, `#!/bin/sh\ntrap '' TERM\necho $$ > "${marker}.pid"\ntouch "${marker}"\nexec sleep 30\n`, { mode: 0o755 });
		const { child, done } = footageAsync(['deck', input, '--out', out], { FFMPEG: stubborn, TMPDIR: temp });
		let exited = false;
		done.then(() => {
			exited = true;
		});
		expect.truthy(await until(() => existsSync(marker), 20_000), 'the encode started');
		const pid = Number(readFileSync(`${marker}.pid`, 'utf8'));
		child.kill('SIGINT');
		await new Promise((wake) => setTimeout(wake, 500));
		expect.equal(exited, false, 'the first SIGINT alone cannot stop an encoder that ignores SIGTERM');
		const started = Date.now();
		child.kill('SIGINT');
		const guard = setTimeout(() => child.kill('SIGKILL'), 15_000);
		const result = await done;
		clearTimeout(guard);
		expect.truthy(Date.now() - started < 3_000, `exited promptly after the second SIGINT (${Date.now() - started} ms)`);
		expect.equal(result.status, 130, `exit code after two SIGINTs (signal ${result.signal}): ${result.stderr}`);
		expect.truthy(await until(() => !alive(pid), 3_000), 'the encoder was killed');
		expectUntouched(out, old);
		expect.equal(readdirSync(temp).join(','), '', 'pass-log folder removed');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a lock a killed run left over a minute ago stops the tool before it encodes and is kept', { skip: SKIP, timeout: 60_000 }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const input = recording(dir, 'input.mov', '640x360');
		const out = join(dir, 'media');
		const old = seedDeck(out);
		const lock = join(out, 'footage.json.lock');
		writeFileSync(lock, '');
		const minutesAgo = new Date(Date.now() - 2 * 60 * 1000);
		utimesSync(lock, minutesAgo, minutesAgo);
		const marker = join(dir, 'encoded');
		const env = { ...process.env, ...fakeEncoder(dir), FAKE_MARKER: marker };
		const started = Date.now();
		const run = spawnSync(process.execPath, [CLI, 'deck', input, '--out', out], { cwd: ROOT, encoding: 'utf8', env });
		expect.equal(run.status, 1, `exit code: ${run.stderr}`);
		expect.truthy(Date.now() - started < 10_000, 'failed without waiting for the lock');
		expect.truthy(run.stderr.includes(lock) && run.stderr.includes('delete it'), `names the lock and how to recover: ${run.stderr}`);
		expect.equal(existsSync(marker), false, 'ffmpeg never ran');
		expectUntouched(out, { ...old, 'footage.json.lock': '' });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a lock taken seconds ago does not stop the tool, which waits for it', { skip: SKIP, timeout: 60_000 }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const input = recording(dir, 'input.mov', '640x360');
		const out = join(dir, 'media');
		mkdirSync(out, { recursive: true });
		const lock = join(out, 'footage.json.lock');
		writeFileSync(lock, '');
		const secondsAgo = new Date(Date.now() - 10 * 1000);
		utimesSync(lock, secondsAgo, secondsAgo);
		const marker = join(dir, 'encoded');
		const { done } = footageAsync(['crest', input, '--out', out], { ...fakeEncoder(dir), FAKE_MARKER: marker, FAKE_DELAY: '0.3' });
		expect.truthy(await until(() => existsSync(marker), 20_000), 'the encode started despite the lock');
		// Another run finishing: its lock goes away, and this run then takes it.
		rmSync(lock);
		const result = await done;
		expect.equal(result.status, 0, `run failed: ${result.stderr}`);
		expect.equal(footageClips(JSON.parse(readFileSync(join(out, 'footage.json'), 'utf8')))[0].shot, 'crest', 'listed');
		expect.equal(readdirSync(out).sort().join(','), 'crest.jpg,crest.mp4,crest.webm,footage.json', 'no lock, partial or staging files left');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('a staging folder that disappears while stale ones are being cleared does not stop the tool', { skip: SKIP, timeout: 60_000 }, () => {
	const dir = mkdtempSync(join(tmpdir(), 'ocean-footage-test-'));
	try {
		const input = recording(dir, 'input.mov', '640x360');
		const out = join(dir, 'media');
		mkdirSync(out, { recursive: true });
		// readdir lists a dangling link but stat on it fails with ENOENT: the same thing a concurrent
		// run removing its finished folder between the two calls looks like, but every time.
		symlinkSync(join(dir, 'removed-meanwhile'), join(out, '.ocean-footage-gone'));
		const env = { ...process.env, ...fakeEncoder(dir) };
		const run = spawnSync(process.execPath, [CLI, 'flyup', input, '--out', out], { cwd: ROOT, encoding: 'utf8', env });
		expect.equal(run.status, 0, `run failed: ${run.stderr}`);
		expect.equal(readdirSync(out).sort().join(','), '.ocean-footage-gone,flyup.jpg,flyup.mp4,flyup.webm,footage.json', 'encoded and listed');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
