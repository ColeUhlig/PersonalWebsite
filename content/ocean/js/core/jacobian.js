// Jacobian of the horizontal displacement (Tessendorf eq 45, 46). Inputs are the three
// derivative fields dDx/dx, dDz/dz, dDx/dz (equal to dDz/dx) and the choppiness lambda.
// Determinant 1 is flat water, toward 0 crests pinch, below 0 the surface has folded. The
// smallest eigenvalue signals folding first, and its eigenvector is the direction the
// crest is throwing water: the spray direction, for free.
// Twin of roblox-ocean/src/shared/Ocean/Jacobian.luau.

export function determinant(jxx, jzz, jxz, lambda) {
	const a = 1 + lambda * jxx;
	const d = 1 + lambda * jzz;
	const b = lambda * jxz;
	return a * d - b * b;
}

// Writes the smallest eigenvalue and its unit eigenvector (ex, ez) into out[0..2] and returns out.
export function minimum(jxx, jzz, jxz, lambda, out = new Float64Array(3)) {
	const a = 1 + lambda * jxx;
	const d = 1 + lambda * jzz;
	const b = lambda * jxz;
	const mean = (a + d) / 2;
	const halfDiff = (a - d) / 2;
	const radius = Math.sqrt(halfDiff * halfDiff + b * b);
	const value = mean - radius;
	if (radius < 1e-12) {
		out[0] = value;
		out[1] = 1;
		out[2] = 0;
		return out;
	}
	let ex;
	let ez;
	if (Math.abs(b) > 1e-12) {
		ex = b;
		ez = value - a;
	} else if (a <= d) {
		ex = 1;
		ez = 0;
	} else {
		ex = 0;
		ez = 1;
	}
	const length = Math.sqrt(ex * ex + ez * ez);
	out[0] = value;
	out[1] = ex / length;
	out[2] = ez / length;
	return out;
}
