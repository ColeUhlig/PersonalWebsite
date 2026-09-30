// The proof panel's fixed text, read from B's ui/proofPanel.js for the copy check (piece C, Task 3).
// The panel builds its markup at run time, so the page's copy check skips #proof whole; this fills
// the panel's three templates (INTRO, markup and map) with the values the panel itself uses and
// returns every text run and every aria-label, title and alt in them, for copy.test.js and
// copy.spec.js to check like the rest of the copy. A placeholder it does not know throws, so a new
// value in the panel cannot slip past unchecked.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LUAU_FORK, LUAU_RELEASE, LUAU_WEB_VERSION } from '../../../content/ocean/js/proof/runtime.js';
import { cascadeOptions } from '../../../content/ocean/js/proof/proofConfig.js';
import { normalise } from './copyCheck.js';

export const PROOF_PANEL_PATH = fileURLToPath(new URL('../../../content/ocean/js/ui/proofPanel.js', import.meta.url));

export const readProofPanel = () => readFileSync(PROOF_PANEL_PATH, 'utf8');

function grab(source, pattern, name) {
	const match = pattern.exec(source);
	if (!match) throw new Error(`proofPanel.js: cannot find ${name}`);
	return match[1];
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (text) => text.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity]);

/** @returns {{ text: string, attributes: string }} the panel's fixed text, normalised. */
export function proofPanelText(source = readProofPanel()) {
	const intro = grab(source, /const INTRO = `([\s\S]*?)`;/, 'INTRO');
	const mapTemplate = grab(source, /function map\(name, caption, n\) \{\s*return `([\s\S]*?)`;/, 'map()');
	const markup = grab(source, /function markup\(o, embedded\) \{\s*return `([\s\S]*?)`;\n\}/, 'markup()');
	const fieldsInWords = grab(source, /const FIELDS_IN_WORDS = '([^']*)';/, 'FIELDS_IN_WORDS');
	const options = cascadeOptions();
	const values = { 'o.n': options.n, 'o.seed': options.seed, LUAU_FORK, LUAU_RELEASE, LUAU_WEB_VERSION, FIELDS_IN_WORDS: fieldsInWords };

	const fill = (template, known) =>
		template.replace(/\$\{([^}]+)\}/g, (_, expression) => {
			const call = /^map\('([^']*)', '([^']*)', o\.n\)$/.exec(expression);
			if (call) return fill(mapTemplate, { name: call[1], caption: call[2], n: options.n });
			if (expression === "embedded ? '' : INTRO") return fill(intro, values);
			if (expression in known) return String(known[expression]);
			throw new Error(`proofPanel.js fixed text uses \${${expression}}, which the copy check does not know`);
		});

	const html = fill(markup, values);
	const attributes = [...html.matchAll(/\s(?:aria-label|title|alt|placeholder)="([^"]*)"/g)].map((match) => decode(match[1]));
	const text = decode(html.replace(/<[^>]*>/g, ' '));
	return { text: normalise(text), attributes: normalise(attributes.join(' ')) };
}
