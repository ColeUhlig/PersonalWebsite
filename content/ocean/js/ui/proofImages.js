// Pixels for the proof panel's three small images, browser-free: a height field as grey (mid grey
// is the mean surface, white the tallest crest, black the deepest trough, on one symmetric scale)
// and the difference of two fields (black where they agree to the bit, red where they do not).
// Cell (column, row) of an n x n field (index row * n + column) is pixel (column, row).

const NAN_COLOUR = Object.freeze([255, 0, 255, 255]);

// The largest |value| over the first `count` values; 1 when they are all zero, so a flat field
// draws as mid grey instead of dividing by zero.
export function symmetricScale(values, count = values.length) {
	let largest = 0;
	for (let i = 0; i < count; i++) {
		const magnitude = Math.abs(values[i]);
		if (magnitude > largest) {
			largest = magnitude;
		}
	}
	return largest > 0 ? largest : 1;
}

/**
 * @param {ArrayLike<number>} values at least n * n; the first n * n are drawn
 * @param {number} n
 * @param {number} scale the |value| that reaches white or black
 * @returns {Uint8ClampedArray} RGBA, n * n * 4
 */
export function heightImage(values, n, scale) {
	const pixels = new Uint8ClampedArray(n * n * 4);
	for (let i = 0; i < n * n; i++) {
		const t = Math.max(-1, Math.min(1, values[i] / scale));
		if (Number.isNaN(t)) {
			// A NaN height (the Luau with invalid sea parameters makes them) is magenta: left to
			// the grey ramp it would store as 0 and pass for the deepest trough.
			pixels.set(NAN_COLOUR, i * 4);
			continue;
		}
		const grey = Math.round(127.5 + 127.5 * t);
		pixels[i * 4] = grey;
		pixels[i * 4 + 1] = grey;
		pixels[i * 4 + 2] = grey;
		pixels[i * 4 + 3] = 255;
	}
	return pixels;
}

/**
 * Black where the two agree to the bit; elsewhere red, at least a visible 96 and brighter as the
 * difference nears `scale`, so one differing cell shows even when it is tiny.
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @param {number} n
 * @param {number} scale
 * @returns {Uint8ClampedArray}
 */
export function differenceImage(a, b, n, scale) {
	// Only Float32Arrays: the bits are read through Uint32Array views of the same bytes, so any
	// other type (a Float64Array, a plain Array) would compare the wrong bits or none at all.
	if (!(a instanceof Float32Array) || !(b instanceof Float32Array)) {
		throw new TypeError('differenceImage compares two Float32Arrays');
	}
	if (a.length < n * n || b.length < n * n) {
		throw new RangeError(`differenceImage needs ${n * n} values in each array, got ${a.length} and ${b.length}`);
	}
	const bitsA = new Uint32Array(a.buffer, a.byteOffset, n * n);
	const bitsB = new Uint32Array(b.buffer, b.byteOffset, n * n);
	const pixels = new Uint8ClampedArray(n * n * 4);
	for (let i = 0; i < n * n; i++) {
		if (bitsA[i] !== bitsB[i]) {
			const difference = Math.abs(a[i] - b[i]);
			const t = Number.isFinite(difference) && scale > 0 ? Math.min(1, difference / scale) : 1;
			pixels[i * 4] = Math.round(96 + 159 * t);
		}
		pixels[i * 4 + 3] = 255;
	}
	return pixels;
}
