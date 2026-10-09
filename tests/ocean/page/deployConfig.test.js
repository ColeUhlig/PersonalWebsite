// The Static Web Apps config's unit tests (piece C, Task 10): the proof panel fetches
// luau/ocean-bundle.luau, so .luau gets a text type, and every file type under content/ is either one
// Azure Static Web Apps serves by default or listed in the config's mimeTypes. scripts/deploy.sh adds
// globalHeaders at deploy time with jq, keeping every other key, so the file holds mimeTypes only.
import { test } from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';

const CONTENT = fileURLToPath(new URL('../../../content/', import.meta.url));
// Types Azure Static Web Apps serves correctly without a mimeTypes entry.
const SERVED_BY_DEFAULT = ['.html', '.css', '.js', '.mjs', '.json', '.jpg', '.jpeg', '.png', '.svg', '.webm', '.mp4', '.ico', '.txt', '.wasm', '.woff2'];

function extensions(dir) {
	const found = new Set();
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) extensions(path).forEach((ext) => found.add(ext));
		else if (extname(entry.name)) found.add(extname(entry.name).toLowerCase());
	}
	return found;
}

const readConfig = () => JSON.parse(readFileSync(join(CONTENT, 'staticwebapp.config.json'), 'utf8'));

test('the Static Web Apps config gives .luau a text type and changes nothing else', () => {
	const config = readConfig();
	expect.equal(Object.keys(config).join(','), 'mimeTypes', 'only mimeTypes (deploy.sh adds globalHeaders at deploy time)');
	expect.equal(config.mimeTypes['.luau'], 'text/plain; charset=utf-8', '.luau');
});

test('every file type under content/ is served with a known type', () => {
	const config = readConfig();
	const known = new Set([...SERVED_BY_DEFAULT, ...Object.keys(config.mimeTypes)]);
	const found = extensions(CONTENT);
	expect.truthy(found.has('.luau'), 'the walk found the proof bundle (content/ocean/luau/ocean-bundle.luau)');
	for (const ext of found) {
		expect.truthy(known.has(ext), `${ext} has no MIME type: add it to content/staticwebapp.config.json`);
	}
});
