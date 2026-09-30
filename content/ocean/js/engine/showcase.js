// The two things the showcase page takes from the Roblox side, in one place: the public place's
// URL (the "Play in Roblox" button) and the footage clips' contract (names, format, manifest).
// Both start empty, and the page hides what is empty: ROBLOX_PLACE_URL stays '' until Cole makes
// the place public, and media/footage.json does not exist until the first clip is encoded
// (scripts/ocean-footage.mjs writes it). How to set the URL: roblox-ocean docs/publishing.md.

// Paste the experience page's address here after the place is public, e.g.
// 'https://www.roblox.com/games/1234567890/Ocean'. Anything else keeps the button hidden, and
// tests/ocean/engine/showcase.test.js fails so the mistake is caught before it ships.
export const ROBLOX_PLACE_URL = '';

// An experience page on roblox.com over https: /games/<place id>, optionally followed by the name.
// Share links, Creator Dashboard links (those carry the universe id, not the place id), query
// strings and lookalike hosts are refused rather than guessed at.
const PLACE_PATTERN = /^https:\/\/(?:www\.)?roblox\.com\/games\/(\d{1,20})(?:\/[A-Za-z0-9_-]*)?\/?$/;

export function placeUrl(raw = ROBLOX_PLACE_URL) {
	if (typeof raw !== 'string') {
		return null;
	}
	const match = PLACE_PATTERN.exec(raw.trim());
	return match ? `https://www.roblox.com/games/${match[1]}` : null;
}

export const FOOTAGE_MANIFEST = 'media/footage.json';
export const FOOTAGE_SHOTS = Object.freeze(['deck', 'flyup', 'crest', 'studio']);

const MAX_SIDE = 8192;
const MAX_SECONDS = 600;

export function clipFiles(shot) {
	return Object.freeze({ webm: `${shot}.webm`, mp4: `${shot}.mp4`, poster: `${shot}.jpg` });
}

const wholeSide = (value) => Number.isInteger(value) && value > 0 && value <= MAX_SIDE;

function validClip(clip) {
	if (!clip || typeof clip !== 'object' || !FOOTAGE_SHOTS.includes(clip.shot)) {
		return null;
	}
	const files = clipFiles(clip.shot);
	if (clip.webm !== files.webm || clip.mp4 !== files.mp4 || clip.poster !== files.poster) {
		return null;
	}
	if (!wholeSide(clip.width) || !wholeSide(clip.height)) {
		return null;
	}
	if (!(Number.isFinite(clip.seconds) && clip.seconds > 0 && clip.seconds <= MAX_SECONDS)) {
		return null;
	}
	return Object.freeze({ shot: clip.shot, ...files, width: clip.width, height: clip.height, seconds: clip.seconds });
}

// The clips the page can show, in story order. A later entry for the same shot wins.
export function footageClips(manifest) {
	const clips = manifest?.clips;
	if (!Array.isArray(clips)) {
		return Object.freeze([]);
	}
	const byShot = new Map();
	for (const clip of clips) {
		const valid = validClip(clip);
		if (valid) {
			byShot.set(valid.shot, valid);
		}
	}
	return Object.freeze(FOOTAGE_SHOTS.filter((shot) => byShot.has(shot)).map((shot) => byShot.get(shot)));
}

export function withClip(manifest, clip) {
	const valid = validClip(clip);
	if (!valid) {
		throw new Error(`not a valid clip: ${JSON.stringify(clip)}`);
	}
	const others = footageClips(manifest).filter((existing) => existing.shot !== valid.shot);
	return { clips: [...footageClips({ clips: [...others, valid] })] };
}
