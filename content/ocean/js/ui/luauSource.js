// Splits the generated Luau bundle into the modules it was made from, so the proof panel can show
// the source that ran, one module at a time. roblox-ocean's scripts/web_bundle.py marks each part:
//   -- @module Cascade (src/shared/Ocean/Cascade.luau)
//   ...the module, verbatim apart from its require lines and `export` before its type aliases...
//   -- @end Cascade
const BEGIN = /^-- @module (\w+) \((.*)\)$/;
const END = /^-- @end (\w+)$/;

/**
 * @param {string} bundle
 * @returns {Map<string, { origin: string, text: string }>} in bundle order; origin is the note in
 *   the marker's brackets (the module's path in roblox-ocean, or what the part is)
 */
export function moduleSections(bundle) {
	const sections = new Map();
	let open = null;
	let lines = [];
	// Split on either line ending, so a bundle checked out with CRLF reads the same.
	for (const line of bundle.split(/\r?\n/)) {
		const begin = BEGIN.exec(line);
		const end = END.exec(line);
		if (begin) {
			if (open) {
				throw new Error(`the bundle opens ${begin[1]} inside ${open.name}`);
			}
			if (sections.has(begin[1])) {
				throw new Error(`the bundle marks ${begin[1]} twice`);
			}
			open = { name: begin[1], origin: begin[2] };
			lines = [];
		} else if (end) {
			if (!open) {
				throw new Error(`the bundle closes ${end[1]} without opening it`);
			}
			if (open.name !== end[1]) {
				throw new Error(`the bundle closes ${end[1]} while ${open.name} is open`);
			}
			sections.set(open.name, { origin: open.origin, text: lines.join('\n') });
			open = null;
		} else if (open) {
			lines.push(line);
		}
	}
	if (open) {
		throw new Error(`the bundle never closes ${open.name}`);
	}
	if (sections.size === 0) {
		throw new Error('the bundle has no marked modules');
	}
	return sections;
}
