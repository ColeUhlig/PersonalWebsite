// The copy check (piece C): every number in the page's text has to sit inside one of the sourced
// phrases in copySources.js. A number is a run of digits with optional ".digits" or ",digits"
// groups: 18,144 and 0.0026 and 1.4.0 are one number each.
export const NUMBER = /\d+(?:[.,]\d+)*/g;
export const SKIP_REASONS = Object.freeze(['live', 'math']);

export const normalise = (text) => text.replace(/\s+/g, ' ').trim();

function covered(text, phrases) {
	const ranges = [];
	for (const phrase of phrases) {
		let from = 0;
		for (let at = text.indexOf(phrase, from); at !== -1; at = text.indexOf(phrase, from)) {
			ranges.push([at, at + phrase.length]);
			from = at + 1;
		}
	}
	return ranges;
}

export function uncoveredNumbers(text, phrases) {
	const ranges = covered(text, phrases);
	const out = [];
	for (const match of text.matchAll(NUMBER)) {
		const start = match.index;
		const end = start + match[0].length;
		if (!ranges.some(([a, b]) => a <= start && end <= b)) {
			out.push({ number: match[0], context: text.slice(Math.max(0, start - 40), end + 40) });
		}
	}
	return out;
}
