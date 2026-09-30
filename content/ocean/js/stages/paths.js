// Small pure helpers the stage recipes share (A3; not a twin): reading and writing a value at a dotted path
// ("engine.sea.windSpeed", "engine.layers.1") without mutating anything, and freezing a recipe all
// the way down.

// Whether `key` is a value `node` declares: an object's own key (never an inherited one such as
// toString or __proto__), or an array's whole-number index below its length (never `length`).
function declares(node, key) {
	if (node === null || typeof node !== 'object') {
		return false;
	}
	if (Array.isArray(node)) {
		const index = Number(key);
		return Number.isInteger(index) && String(index) === key && index >= 0 && index < node.length;
	}
	return Object.hasOwn(node, key);
}

export function getPath(object, path) {
	let value = object;
	for (const key of path.split('.')) {
		if (!declares(value, key)) {
			throw new RangeError(`no value at ${path}`);
		}
		value = value[key];
	}
	return value;
}

// A copy of `object` with `value` at `path`: every object and array along the path is copied, the
// rest is shared. The path must already exist: a binding may change a value a recipe declares,
// never add one.
export function setPath(object, path, value) {
	const keys = path.split('.');
	const write = (node, index) => {
		const key = keys[index];
		if (!declares(node, key)) {
			throw new RangeError(`no value at ${path}`);
		}
		const next = index === keys.length - 1 ? value : write(node[key], index + 1);
		if (Array.isArray(node)) {
			const copy = node.slice();
			copy[Number(key)] = next;
			return copy;
		}
		return { ...node, [key]: next };
	};
	return write(object, 0);
}

export function deepFreeze(value) {
	if (value !== null && typeof value === 'object') {
		Object.freeze(value);
		for (const key of Object.keys(value)) {
			deepFreeze(value[key]);
		}
	}
	return value;
}
