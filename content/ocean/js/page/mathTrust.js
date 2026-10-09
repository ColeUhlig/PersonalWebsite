// How the page asks KaTeX to typeset "The math" (piece C; browser-free). The formulas colour their
// terms with \htmlClass{t-...}{...} to match the sliders (style.css); that is the only command
// that needs KaTeX's trust, so it is the only one allowed. Several formulas are lists of equations
// ("a, \quad b, \quad c") far wider than a panel; stackEquations puts each on its own line.
export const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.18.10/dist/katex.min.css';

export const trustHtmlClass = (context) => context.command === '\\htmlClass';

export const KATEX_OPTIONS = Object.freeze({
	displayMode: true,
	throwOnError: false,
	trust: trustHtmlClass,
	strict: 'ignore',
	output: 'htmlAndMathml',
});

// Commands that open and close a group without braces.
const OPENS = new Set(['left', 'begin']);
const CLOSES = new Set(['right', 'end']);
// Wide spaces that, with no comma before them, sit inside a sentence ("\\quad\\text{when every}\\quad").
const LONE_SPACES = new Set(['quad', 'qquad']);
// A comma followed by \quad or \qquad (and any spaces round it): how the formulas separate equations.
const SEPARATOR = /^,\s*\\q?quad(?![a-zA-Z])\s*/;

// Turns each top-level ", \quad" (or ", \qquad") separator into ", \\", a line break, so a list of
// equations stacks one per line instead of running off the panel. Separators inside braces,
// \left...\right or an environment are left alone. A top-level \quad with no comma before it (part
// of a sentence such as "\quad\text{when every}\quad") only becomes a place the line may break,
// so a long sentence wraps between its words rather than after an "=" in the middle of one side.
export function stackEquations(tex) {
	let out = '';
	let depth = 0;
	let i = 0;
	while (i < tex.length) {
		const char = tex[i];
		if (char === '\\') {
			const name = /^[a-zA-Z]+/.exec(tex.slice(i + 1))?.[0] ?? tex[i + 1] ?? '';
			if (OPENS.has(name)) depth++;
			if (CLOSES.has(name)) depth--;
			i += 1 + name.length;
			out += char + name;
			if (depth === 0 && LONE_SPACES.has(name)) {
				out += /^[a-zA-Z]/.test(tex.slice(i)) ? '\\allowbreak ' : '\\allowbreak';
			}
			continue;
		}
		if (char === '{') depth++;
		if (char === '}') depth--;
		const separator = char === ',' && depth === 0 ? SEPARATOR.exec(tex.slice(i)) : null;
		if (separator) {
			out += ', \\\\ ';
			i += separator[0].length;
			continue;
		}
		out += char;
		i++;
	}
	return out;
}
