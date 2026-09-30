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
// How to record: roblox-ocean docs/recording.md.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { FOOTAGE_SHOTS, clipFiles, footageClips, withClip } from '../content/ocean/js/engine/showcase.js';
import { MAX_BYTES, clipWindow, planEncode } from './lib/footage.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(ROOT, 'content/ocean/media');
const MANIFEST_NAME = 'footage.json';
const USAGE = `usage: node scripts/ocean-footage.mjs <shot> <recording> [--start seconds] [--length seconds] [--fps n] [--out dir]\nshots: ${FOOTAGE_SHOTS.join(', ')}`;

function tool(name) {
	const fromEnv = process.env[name.toUpperCase()];
	if (fromEnv) {
		return fromEnv;
	}
	const brewed = `/opt/homebrew/bin/${name}`;
	return existsSync(brewed) ? brewed : name;
}

function run(bin, args) {
	const result = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
	if (result.error) {
		throw new Error(`${bin} could not start: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(`${bin} ${args.join(' ')} failed:\n${result.stderr}`);
	}
	return result.stdout;
}

function probe(file) {
	const json = JSON.parse(run(tool('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]));
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

// Reads the manifest and asks withClip, before anything is encoded, whether it could add this
// shot, with a stand-in clip, so a manifest it would refuse stops the tool here rather than after
// minutes of encoding, and footage.json is left as it was either way.
function readManifest(file, shot) {
	const manifest = parseManifest(file);
	try {
		withClip(manifest, { shot, ...clipFiles(shot), width: 2, height: 2, seconds: 1 });
	} catch (error) {
		throw new Error(`${file}: ${error.message}; fix or delete it first`);
	}
	return manifest;
}

const megabytes = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;

// Checks the staged files fit the page and reads the size the page will show.
function measure(outputs) {
	const sizes = Object.fromEntries(Object.entries(outputs).map(([kind, file]) => [kind, statSync(file).size]));
	const oversized = Object.entries(sizes).filter(([, bytes]) => bytes > MAX_BYTES);
	if (oversized.length > 0) {
		const list = oversized.map(([kind, bytes]) => `${kind} ${megabytes(bytes)}`).join(', ');
		throw new Error(`too large for the page (over ${megabytes(MAX_BYTES)}): ${list}; try a shorter --length. footage.json and the shot's files were not changed`);
	}
	return { sizes, encoded: probe(outputs.mp4) };
}

// Plans and runs the five ffmpeg commands into a staging directory inside the output directory,
// with the two-pass logs in a temp directory, and moves the three files into place only once they
// all exist and fit, so a failed or oversized encode never replaces a shot's working files or
// leaves partial ones. Both directories are removed whatever happens. The first planEncode
// validates the shot and the frame rate before the output directory is created.
function encode(options) {
	const passDir = mkdtempSync(join(tmpdir(), 'ocean-footage-'));
	try {
		const target = planEncode({ ...options, passDir });
		mkdirSync(options.outDir, { recursive: true });
		const stageDir = mkdtempSync(join(options.outDir, '.ocean-footage-'));
		try {
			const staged = planEncode({ ...options, outDir: stageDir, passDir });
			for (const args of staged.commands) {
				run(tool('ffmpeg'), args);
			}
			const measured = measure(staged.outputs);
			for (const kind of Object.keys(target.outputs)) {
				renameSync(staged.outputs[kind], target.outputs[kind]);
			}
			return measured;
		} finally {
			rmSync(stageDir, { recursive: true, force: true });
		}
	} finally {
		rmSync(passDir, { recursive: true, force: true });
	}
}

// Replaces footage.json in one step, so an interrupted write never leaves half a manifest.
function writeManifest(file, manifest) {
	const partial = `${file}.partial`;
	writeFileSync(partial, `${JSON.stringify(manifest, null, '\t')}\n`);
	renameSync(partial, file);
}

function main(argv) {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: { start: { type: 'string' }, length: { type: 'string' }, fps: { type: 'string' }, out: { type: 'string' } },
	});
	const [shot, input] = positionals;
	if (positionals.length !== 2 || !FOOTAGE_SHOTS.includes(shot)) {
		throw new Error(USAGE);
	}
	if (!existsSync(input)) {
		throw new Error(`no such recording: ${input}`);
	}
	const outDir = resolve(values.out ?? DEFAULT_OUT);
	const manifestFile = join(outDir, MANIFEST_NAME);
	const manifest = readManifest(manifestFile, shot);
	const source = probe(input);
	const window = clipWindow(source.seconds, { start: number(values.start, 'start'), length: number(values.length, 'length') });
	const { sizes, encoded } = encode({ shot, input, outDir, window, fps: number(values.fps, 'fps') ?? 30 });
	const next = withClip(manifest, { shot, ...clipFiles(shot), width: encoded.width, height: encoded.height, seconds: Math.round(encoded.seconds * 100) / 100 });
	writeManifest(manifestFile, next);
	console.log(`${shot}: webm ${megabytes(sizes.webm)}, mp4 ${megabytes(sizes.mp4)}, poster ${megabytes(sizes.poster)}, ${encoded.width}x${encoded.height}, ${encoded.seconds.toFixed(1)} s from ${window.start} s into ${input}`);
	console.log(`${footageClips(next).length} clip(s) listed in ${manifestFile}`);
}

try {
	main(process.argv.slice(2));
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
