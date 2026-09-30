#!/usr/bin/env node
// Turns one of Cole's screen recordings into the showcase page's clip for a shot: WebM (VP9) and
// MP4 (H.264), two-pass to about 3.5 MB each, no audio, plus a JPEG poster from the middle of the
// clip, written as content/ocean/media/<shot>.{webm,mp4,jpg}, and records the clip in
// content/ocean/media/footage.json, which is what makes the page show it.
// Usage: node scripts/ocean-footage.mjs <shot> <recording> [--start s] [--length s] [--fps n] [--out dir]
// --start skips the film mode's lead-in (and anything before it); the clip is at most 30 s.
// Nothing is trimmed unless asked: docs/recording.md gives each shot's --start (the second the
// camera starts moving plus 0.5) and --length, which drop the half second at each end where the
// bob starts and stops at speed.
// Several shots can be encoded at once: each run stages its files in its own folder, and the
// manifest update takes footage.json.lock. Ctrl-C (SIGINT) or SIGTERM stops the running ffmpeg,
// removes the run's temp folders and exits 130 or 143; a SIGKILL cannot be caught, so staging
// folders older than 6 hours are removed at the next start.
// FFMPEG and FFPROBE in the environment override the binaries (default: Homebrew's, then PATH).
// How to record: roblox-ocean docs/recording.md.
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { FOOTAGE_SHOTS, clipFiles, footageClips, withClip } from '../content/ocean/js/engine/showcase.js';
import { MAX_BYTES, clipWindow, planEncode } from './lib/footage.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(ROOT, 'content/ocean/media');
const MANIFEST_NAME = 'footage.json';
const STAGE_PREFIX = '.ocean-footage-';
const STALE_STAGE_MS = 6 * 3600 * 1000;
const LOCK_WAIT_MS = 30_000;
const LOCK_RETRY_MS = 100;
const USAGE = [
	'usage: node scripts/ocean-footage.mjs <shot> <recording> [--start seconds] [--length seconds] [--fps n] [--out dir]',
	`shots: ${FOOTAGE_SHOTS.join(', ')}`,
	'env: FFMPEG and FFPROBE override the ffmpeg and ffprobe binaries',
].join('\n');

// The ffmpeg or ffprobe processes running now, and the signal that stopped the run, if any. A
// signal kills the running process, whose failure unwinds main through its finally blocks.
const running = new Set();
let stoppedBy = null;

function stop(signal) {
	if (stoppedBy) {
		return;
	}
	stoppedBy = signal;
	for (const child of running) {
		child.kill('SIGTERM');
	}
}

const stoppedError = () => new Error(`stopped by ${stoppedBy}; footage.json and the shot's files were not changed`);

function tool(name) {
	const fromEnv = process.env[name.toUpperCase()];
	if (fromEnv) {
		return fromEnv;
	}
	const brewed = `/opt/homebrew/bin/${name}`;
	return existsSync(brewed) ? brewed : name;
}

function run(bin, args) {
	if (stoppedBy) {
		return Promise.reject(stoppedError());
	}
	return new Promise((settle, fail) => {
		const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		running.add(child);
		const out = [];
		const err = [];
		child.stdout.on('data', (chunk) => out.push(chunk));
		child.stderr.on('data', (chunk) => err.push(chunk));
		child.on('error', (error) => {
			running.delete(child);
			fail(new Error(`${bin} could not start: ${error.message}`));
		});
		child.on('close', (status) => {
			running.delete(child);
			if (stoppedBy) {
				fail(stoppedError());
			} else if (status !== 0) {
				fail(new Error(`${bin} ${args.join(' ')} failed:\n${Buffer.concat(err).toString('utf8')}`));
			} else {
				settle(Buffer.concat(out).toString('utf8'));
			}
		});
	});
}

async function probe(file) {
	const json = JSON.parse(await run(tool('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]));
	const stream = json.streams?.[0];
	const seconds = Number(json.format?.duration);
	if (!stream || !(seconds > 0)) {
		throw new Error(`${file} has no video stream ffprobe can read`);
	}
	return { width: stream.width, height: stream.height, seconds };
}

function number(value, name) {
	if (value === undefined) {
		return undefined;
	}
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`--${name} must be a number, got ${value}`);
	}
	return parsed;
}

function parseManifest(file) {
	if (!existsSync(file)) {
		return { clips: [] };
	}
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch (error) {
		throw new Error(`${file} is not valid JSON (${error.message}); fix or delete it first`);
	}
}

// Reads the manifest and adds the clip with withClip, which refuses a manifest it would have to
// drop entries from. Called once before encoding with a stand-in clip, so a bad manifest stops the
// tool before minutes of encoding, and again under the lock with the real clip.
function manifestWith(file, clip) {
	const manifest = parseManifest(file);
	try {
		return withClip(manifest, clip);
	} catch (error) {
		throw new Error(`${file}: ${error.message}; fix or delete it first`);
	}
}

const megabytes = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;

// Checks the staged files fit the page and reads the size the page will show.
async function measure(outputs) {
	const sizes = Object.fromEntries(Object.entries(outputs).map(([kind, file]) => [kind, statSync(file).size]));
	const oversized = Object.entries(sizes).filter(([, bytes]) => bytes > MAX_BYTES);
	if (oversized.length > 0) {
		const list = oversized.map(([kind, bytes]) => `${kind} ${megabytes(bytes)}`).join(', ');
		throw new Error(`too large for the page (over ${megabytes(MAX_BYTES)}): ${list}; try a shorter --length. footage.json and the shot's files were not changed`);
	}
	return { sizes, encoded: await probe(outputs.mp4) };
}

// Removes staging folders a killed run left behind. A running encode's folder is minutes old, so
// only folders untouched for STALE_STAGE_MS go.
function clearStaleStages(outDir) {
	if (!existsSync(outDir)) {
		return;
	}
	const cutoff = Date.now() - STALE_STAGE_MS;
	for (const name of readdirSync(outDir)) {
		const path = join(outDir, name);
		if (name.startsWith(STAGE_PREFIX) && statSync(path).isDirectory() && statSync(path).mtimeMs < cutoff) {
			rmSync(path, { recursive: true, force: true });
		}
	}
}

// Runs work while holding footage.json.lock, so runs encoding different shots at once never
// overwrite each other's manifest update. The lock is only held for that update (milliseconds).
async function withLock(lockFile, work) {
	const deadline = Date.now() + LOCK_WAIT_MS;
	for (;;) {
		try {
			closeSync(openSync(lockFile, 'wx'));
			break;
		} catch (error) {
			if (error.code !== 'EEXIST') {
				throw error;
			}
		}
		if (stoppedBy) {
			throw stoppedError();
		}
		if (Date.now() > deadline) {
			throw new Error(`${lockFile} has been held for ${LOCK_WAIT_MS / 1000} s; if no other ocean-footage run is going (a killed run leaves it behind), delete it and run again. The encoded files were not installed`);
		}
		await sleep(LOCK_RETRY_MS);
	}
	try {
		return work();
	} finally {
		rmSync(lockFile, { force: true });
	}
}

// Replaces footage.json in one step, through a partial file of this run's own.
function writeManifest(file, manifest) {
	const partial = `${file}.${process.pid}.partial`;
	try {
		writeFileSync(partial, `${JSON.stringify(manifest, null, '\t')}\n`);
		renameSync(partial, file);
	} finally {
		rmSync(partial, { force: true });
	}
}

// Plans and runs the five ffmpeg commands into a staging folder inside the output directory,
// with the two-pass logs in a temp folder, then hands the measured result to install, which moves
// the files into place. A failed, oversized or stopped encode therefore never replaces a shot's
// working files or leaves partial ones; both folders are removed whatever happens. The first
// planEncode validates the shot and the frame rate before the output directory is created.
async function encode(options, install) {
	const passDir = mkdtempSync(join(tmpdir(), 'ocean-footage-'));
	try {
		const target = planEncode({ ...options, passDir });
		mkdirSync(options.outDir, { recursive: true });
		const stageDir = mkdtempSync(join(options.outDir, STAGE_PREFIX));
		try {
			const staged = planEncode({ ...options, outDir: stageDir, passDir });
			for (const args of staged.commands) {
				await run(tool('ffmpeg'), args);
			}
			const measured = await measure(staged.outputs);
			const moveFiles = () => Object.keys(target.outputs).forEach((kind) => renameSync(staged.outputs[kind], target.outputs[kind]));
			return await install(measured, moveFiles);
		} finally {
			rmSync(stageDir, { recursive: true, force: true });
		}
	} finally {
		rmSync(passDir, { recursive: true, force: true });
	}
}

function parse(argv) {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: { start: { type: 'string' }, length: { type: 'string' }, fps: { type: 'string' }, out: { type: 'string' } },
	});
	const [shot, recording] = positionals;
	if (positionals.length !== 2 || !FOOTAGE_SHOTS.includes(shot)) {
		throw new Error(USAGE);
	}
	// An absolute path, so ffmpeg never reads a name like take:1.mov as a protocol.
	const input = resolve(recording);
	if (!existsSync(input)) {
		throw new Error(`no such recording: ${input}`);
	}
	return { shot, input, values, outDir: resolve(values.out ?? DEFAULT_OUT) };
}

async function main(argv) {
	const { shot, input, values, outDir } = parse(argv);
	const manifestFile = join(outDir, MANIFEST_NAME);
	clearStaleStages(outDir);
	manifestWith(manifestFile, { shot, ...clipFiles(shot), width: 2, height: 2, seconds: 1 });
	const source = await probe(input);
	const window = clipWindow(source.seconds, { start: number(values.start, 'start'), length: number(values.length, 'length') });
	const options = { shot, input, outDir, window, fps: number(values.fps, 'fps') ?? 30 };
	const { sizes, encoded, next } = await encode(options, ({ sizes, encoded }, moveFiles) =>
		withLock(`${manifestFile}.lock`, () => {
			const clip = { shot, ...clipFiles(shot), width: encoded.width, height: encoded.height, seconds: Math.round(encoded.seconds * 100) / 100 };
			const updated = manifestWith(manifestFile, clip);
			moveFiles();
			writeManifest(manifestFile, updated);
			return { sizes, encoded, next: updated };
		}),
	);
	console.log(`${shot}: webm ${megabytes(sizes.webm)}, mp4 ${megabytes(sizes.mp4)}, poster ${megabytes(sizes.poster)}, ${encoded.width}x${encoded.height}, ${encoded.seconds.toFixed(1)} s from ${window.start} s into ${input}`);
	console.log(`${footageClips(next).length} clip(s) listed in ${manifestFile}`);
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

try {
	await main(process.argv.slice(2));
} catch (error) {
	console.error(error.message);
	process.exitCode = stoppedBy ? 128 + constants.signals[stoppedBy] : 1;
}
