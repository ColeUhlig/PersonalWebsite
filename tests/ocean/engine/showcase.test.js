import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Showcase from '../../../content/ocean/js/engine/showcase.js';

const clip = (shot, overrides = {}) => ({ shot, ...Showcase.clipFiles(shot), width: 1280, height: 720, seconds: 20, ...overrides });

test('an empty URL hides the button, and placeUrl reads ROBLOX_PLACE_URL by default', () => {
	expect.equal(Showcase.placeUrl(''), null, 'empty');
	expect.equal(Showcase.placeUrl(), Showcase.placeUrl(Showcase.ROBLOX_PLACE_URL), 'default argument');
});

test('whatever ROBLOX_PLACE_URL holds is empty or a valid place URL', () => {
	const set = Showcase.ROBLOX_PLACE_URL;
	expect.truthy(set === '' || Showcase.placeUrl(set) !== null, `ROBLOX_PLACE_URL is not an experience URL: ${set}`);
});

test('an experience page URL becomes the canonical games link', () => {
	expect.equal(Showcase.placeUrl('https://www.roblox.com/games/1234567890/SOT-jonswap-ocean'), 'https://www.roblox.com/games/1234567890', 'with the name');
	expect.equal(Showcase.placeUrl('https://roblox.com/games/42'), 'https://www.roblox.com/games/42', 'bare host');
	expect.equal(Showcase.placeUrl('  https://www.roblox.com/games/42/  '), 'https://www.roblox.com/games/42', 'spaces and a trailing slash');
});

test('anything that is not an experience page URL is refused', () => {
	const refused = [
		'http://www.roblox.com/games/42',
		'https://create.roblox.com/dashboard/creations/experiences/42/overview',
		'https://www.roblox.com/share?code=abc&type=ExperienceDetails',
		'https://www.roblox.com/games/abc',
		'https://www.roblox.com/games/42?privateServerLinkCode=1',
		'https://www.roblox.com.evil.example/games/42',
		'javascript:alert(1)',
	];
	for (const url of refused) {
		expect.equal(Showcase.placeUrl(url), null, url);
	}
	expect.equal(Showcase.placeUrl(null), null, 'null');
	expect.equal(Showcase.placeUrl(42), null, 'a number');
});

test('each shot has fixed file names', () => {
	expect.equal(Showcase.FOOTAGE_SHOTS.join(','), 'deck,flyup,crest,studio', 'shots');
	expect.equal(Showcase.FOOTAGE_MANIFEST, 'media/footage.json', 'manifest path');
	const files = Showcase.clipFiles('crest');
	expect.equal(`${files.webm} ${files.mp4} ${files.poster}`, 'crest.webm crest.mp4 crest.jpg', 'crest');
	expect.truthy(Object.isFrozen(files), 'frozen');
});

test('a missing or malformed manifest gives no clips', () => {
	for (const manifest of [undefined, null, {}, { clips: 'deck' }, 'text', 7]) {
		expect.equal(Showcase.footageClips(manifest).length, 0, JSON.stringify(manifest) ?? 'undefined');
	}
});

test('footageClips keeps the valid clips in shot order', () => {
	const clips = Showcase.footageClips({
		clips: [
			clip('studio'),
			clip('deck'),
			clip('orbit'),
			clip('crest', { webm: '../elsewhere.webm' }),
			clip('flyup', { seconds: 0 }),
			clip('flyup', { width: 12.5 }),
			clip('flyup', { height: Number.NaN }),
		],
	});
	expect.equal(clips.map((c) => c.shot).join(','), 'deck,studio', 'order and filtering');
	expect.truthy(Object.isFrozen(clips) && Object.isFrozen(clips[0]), 'frozen');
});

test('withClip adds or replaces a shot without touching its input', () => {
	const first = Showcase.withClip({ clips: [] }, clip('crest'));
	const second = Showcase.withClip(first, clip('deck'));
	const third = Showcase.withClip(second, clip('crest', { seconds: 12 }));
	expect.equal(third.clips.map((c) => `${c.shot}:${c.seconds}`).join(','), 'deck:20,crest:12', 'replaced in order');
	expect.equal(second.clips.map((c) => `${c.shot}:${c.seconds}`).join(','), 'deck:20,crest:20', 'the old manifest is unchanged');
	expect.equal(Showcase.withClip(undefined, clip('deck')).clips.length, 1, 'from nothing');
});

test('withClip refuses an invalid clip', () => {
	let message = '';
	try {
		Showcase.withClip({ clips: [] }, clip('orbit'));
	} catch (error) {
		message = error.message;
	}
	expect.truthy(message.startsWith('not a valid clip'), `threw: ${message}`);
});
