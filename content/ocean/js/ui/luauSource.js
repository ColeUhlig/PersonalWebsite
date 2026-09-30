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
	for (const line of bundle.split('\n')) {
		const begin = BEGIN.exec(line);
		const end = END.exec(line);
		if (begin) {
			if (open) {
				throw new Error(`the bundle opens ${begin[1]} inside ${open.name}`);
			}
			open = { name: begin[1], origin: begin[2] };
			lines = [];
		} else if (end) {
			if (!open || open.name !== end[1]) {
				throw new Error(`the bundle closes ${end[1]} without opening it`);
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
	return sections;
}
