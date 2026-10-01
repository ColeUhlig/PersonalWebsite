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

// Final review (parked item): the walker follows only relative specifiers, so a bare or absolute one
// anywhere in the boot graph (which C2 grew: the page features, the math box) would hide whatever
// it imports from the check above. Every static import boot.js reaches is relative.
test('every static import boot.js reaches is relative, so the walker sees the whole graph', () => {
	const { files, bare } = walk(file('boot.js'));
	expect.equal(bare.length, 0, `bare or absolute specifiers in the boot graph: ${JSON.stringify(bare.map(({ from, specifier }) => `${from.split('/js/')[1]}: ${specifier}`))}`);
	expect.truthy([...files].some((path) => path.endsWith('ui/mathBox.js')), 'the walk reaches the math box');
});
