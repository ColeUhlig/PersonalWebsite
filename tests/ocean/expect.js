// The Luau specs' expect helpers (roblox-ocean/tests/expect.luau), so carried-over cases read the same.

export function equal(actual, expected, label) {
	if (actual !== expected) {
		throw new Error(`${label}: expected ${expected}, got ${actual}`);
	}
}

// Stricter than the Luau original in one way: a NaN fails here, where Luau's `>` let it pass.
export function near(actual, expected, tolerance, label) {
	if (!(Math.abs(actual - expected) <= tolerance)) {
		throw new Error(`${label}: expected ${expected} +/- ${tolerance}, got ${actual}`);
	}
}

// Luau truthiness: only false and nil fail (0 and "" pass, unlike JavaScript).
export function truthy(condition, label) {
	if (condition === false || condition === null || condition === undefined) {
		throw new Error(label);
	}
}
