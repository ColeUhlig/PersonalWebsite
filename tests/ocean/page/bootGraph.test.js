import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as expect from '../expect.js';

// Every static import and re-export ("import ... from", "export ... from", "import '...'"), across
// lines. Dynamic import() calls are not matched: they are how the page loads CDN code on purpose.
const STATIC_IMPORT = /^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;
const FORBIDDEN = /^(three|gsap|katex)(\/|$)/;
const file = (path) => fileURLToPath(new URL(`../../../content/ocean/js/${path}`, import.meta.url));

function walk(entry) {
	const seen = new Set();
	const bare = [];
	const stack = [entry];
	while (stack.length > 0) {
		const current = stack.pop();
		if (seen.has(current)) continue;
		seen.add(current);
		for (const match of readFileSync(current, 'utf8').matchAll(STATIC_IMPORT)) {
			const specifier = match[1] ?? match[2];
			if (specifier.startsWith('.')) stack.push(resolve(dirname(current), specifier));
			else bare.push({ from: current, specifier });
		}
	}
	return { files: seen, bare };
}

test('boot.js statically reaches no CDN library: three, GSAP and KaTeX load only by dynamic import', () => {
	const { files, bare } = walk(file('boot.js'));
	expect.truthy(files.size > 5, `walked ${files.size} files`);
	const forbidden = bare.filter(({ specifier }) => FORBIDDEN.test(specifier));
	expect.equal(forbidden.length, 0, `static CDN imports reachable from boot.js: ${JSON.stringify(forbidden)}`);
});

test('the walker does see three behind main.js, so the check above can fail', () => {
	const { bare } = walk(file('main.js'));
	expect.truthy(bare.some(({ specifier }) => specifier === 'three'), 'main.js reaches three');
});
