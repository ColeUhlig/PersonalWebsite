// The Luau semantics JavaScript does not share, for the core twins. Each helper names the Luau it
// stands in for; the twins call these instead of the JavaScript operator that looks the same.

export const HUGE = Infinity; // math.huge

// a % b: Luau's modulo is floored (the result takes the divisor's sign); JavaScript's % truncates.
export function mod(a, b) {
	return a - Math.floor(a / b) * b;
}

// a // b
export function idiv(a, b) {
	return Math.floor(a / b);
}

// math.round: halves go away from zero; Math.round sends -2.5 to -2.
export function round(x) {
	return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
}

// math.clamp, which errors when max < min.
export function clamp(x, min, max) {
	if (max < min) {
		throw new RangeError(`clamp: max ${max} is below min ${min}`);
	}
	return x < min ? min : x > max ? max : x;
}

// math.sign
export function sign(x) {
	return x > 0 ? 1 : x < 0 ? -1 : 0;
}

// bit32: arguments are taken modulo 2^32 and results are unsigned.
export const bit32 = Object.freeze({
	band: (...values) => values.reduce((a, b) => a & b, -1) >>> 0,
	bxor: (...values) => values.reduce((a, b) => a ^ b, 0) >>> 0,
	rshift: (x, n) => (n >= 32 ? 0 : x >>> n),
	lshift: (x, n) => (n >= 32 ? 0 : (x << n) >>> 0),
});

// table.create(count, 0)
export function zeros(count) {
	return new Float64Array(count);
}

// assert(condition, message)
export function check(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

// Color3: Roblox stores the channels as 32-bit floats. Roblox does not document Lerp's rounding;
// this rounds once per channel, and the specs only use eighths, which are exact either way.
const f32 = Math.fround;

export function color3(r, g, b) {
	return Object.freeze({ r: f32(r), g: f32(g), b: f32(b) });
}

export function lerpColor3(a, c, alpha) {
	const t = f32(alpha);
	return color3(a.r + (c.r - a.r) * t, a.g + (c.g - a.g) * t, a.b + (c.b - a.b) * t);
}
