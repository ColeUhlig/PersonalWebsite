// Gerstner sum over a wave bank at one point and time. Returns the displacement, the
// analytic surface normal and the Jacobian as seven numbers (no allocation when the caller
// passes `out`: this is the per-vertex hot path). The Jacobian is the horizontal area scale of
// the displaced surface: 1 on flat water, toward 0 where crests pinch, negative where they
// fold. It drives foam.
// Same maths as the vertex shader in jonswap-ocean/js/ocean-gpu.js.
// Twin of roblox-ocean/src/shared/Ocean/WaveSampler.luau.

// The packed layout's stride, so a bank builder can lay its numbers out without depending on
// a particular builder module. `Jonswap.STRIDE` is the same number.
export const STRIDE = 6;

// packed: STRIDE numbers per wave (k, omega, A, phase, dx, dz), the layout both `Jonswap`
// and `Swells` build. chop scales the lateral term: 1 = full Gerstner, 0 = height only.
// weights[weightOffset + i] scales the amplitude of wave i; only the first `count` waves are
// summed, so pass a smaller count to skip waves that have faded out.
// Writes dx, dy, dz, nx, ny, nz, jacobian into out[0..6] and returns out.
export function sample(packed, count, t, x, z, chop, weights, weightOffset, out = new Float64Array(7)) {
	const sin = Math.sin;
	const cos = Math.cos;
	let sumX = 0;
	let sumY = 0;
	let sumZ = 0;
	// Partial derivatives of the displaced position with respect to x and z.
	let xx = 1;
	let xy = 0;
	let xz = 0;
	let zx = 0;
	let zy = 0;
	let zz = 1;

	for (let wave = 0; wave <= count - 1; wave++) {
		const o = wave * STRIDE;
		const k = packed[o];
		const omega = packed[o + 1];
		const amplitude = packed[o + 2] * weights[weightOffset + wave];
		const phase = packed[o + 3];
		const dirX = packed[o + 4];
		const dirZ = packed[o + 5];
		const phi = k * (dirX * x + dirZ * z) - omega * t + phase;
		const s = sin(phi);
		const c = cos(phi);
		const lateral = amplitude * c * chop;
		const kas = k * amplitude * s * chop;
		const kac = k * amplitude * c;

		sumX += dirX * lateral;
		sumY += amplitude * s;
		sumZ += dirZ * lateral;

		xx -= dirX * dirX * kas;
		xy += dirX * kac;
		xz -= dirX * dirZ * kas;
		zx -= dirX * dirZ * kas;
		zy += dirZ * kac;
		zz -= dirZ * dirZ * kas;
	}

	// normal = dP/dz x dP/dx
	const nx = zy * xz - zz * xy;
	const ny = zz * xx - zx * xz;
	const nz = zx * xy - zy * xx;
	const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
	const jacobian = xx * zz - xz * zx;
	out[0] = sumX;
	out[1] = sumY;
	out[2] = sumZ;
	out[3] = nx / length;
	out[4] = ny / length;
	out[5] = nz / length;
	out[6] = jacobian;
	return out;
}
