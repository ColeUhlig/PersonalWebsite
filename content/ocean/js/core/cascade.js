// One Tessendorf FFT patch: the initial spectrum for a band of wavenumbers, time evolution
// with quantised (looping) dispersion, four packed inverse FFTs into eight real fields, and
// bilinear sampling with wrap. Formulas: docs/research/tessendorf-fft.md section 1 (roblox-ocean).
// Hot paths (`evolve`, `synthesise`, and the samplers when the caller passes `out`) allocate nothing.
// Twin of roblox-ocean/src/shared/Ocean/Cascade.luau.
import * as FFT from './fft.js';
import * as Spectrum from './spectrum.js';
import * as Random from './random.js';
import { bit32, check, mod, zeros } from './luau.js';

/**
 * @typedef {object} Config
 * @property {number} n cells per side, a power of two
 * @property {number} size patch length in metres
 * @property {number} kMin wavenumber band [kMin, kMax); the finest cascade uses Infinity
 * @property {number} kMax
 * @property {number} seed
 * @property {number} loopPeriod seconds; every frequency becomes a multiple of 2 pi / loopPeriod
 * @property {import('./spectrum.js').Params} params
 */

/**
 * What the samplers need: any object with these fields. A Cascade satisfies it; so do the
 * FieldStore's display tables.
 * @typedef {object} Fields
 * @property {number} n
 * @property {number} size
 * @property {ArrayLike<number>} height
 * @property {ArrayLike<number>} dispX
 * @property {ArrayLike<number>} dispZ
 * @property {ArrayLike<number>} slopeX
 * @property {ArrayLike<number>} slopeZ
 * @property {ArrayLike<number>} jxx
 * @property {ArrayLike<number>} jzz
 * @property {ArrayLike<number>} jxz
 */

/**
 * @typedef {object} Cascade
 * @property {number} n
 * @property {number} size
 * @property {number} cells
 * @property {number} time the time the fields hold; -1 before the first synthesis
 * Per cell, fixed at creation:
 * @property {Float64Array} kx
 * @property {Float64Array} kz
 * @property {Float64Array} h0Re h~0(k)
 * @property {Float64Array} h0Im
 * @property {Float64Array} h0MirrorRe conj(h~0(-k))
 * @property {Float64Array} h0MirrorIm
 * @property {Float64Array} omega quantised dispersion
 * @property {Float64Array} unitKx kx / |k|, 0 at k = 0
 * @property {Float64Array} unitKz
 * @property {Float64Array} invK 1 / |k|, 0 at k = 0
 * Per cell, rewritten by evolve (4 packed spectra) and synthesise (8 fields):
 * @property {Float64Array[]} spectrumRe
 * @property {Float64Array[]} spectrumIm
 * @property {Float64Array} height
 * @property {Float64Array} dispX
 * @property {Float64Array} dispZ
 * @property {Float64Array} slopeX
 * @property {Float64Array} slopeZ
 * @property {Float64Array} jxx
 * @property {Float64Array} jzz
 * @property {Float64Array} jxz
 */

const PACKED = 4;

// Box-Muller. nextNumber() may return 0, which log() rejects. Writes the pair into out[0..1].
function gaussianPair(random, out) {
	const u1 = 1 - random.nextNumber();
	const u2 = random.nextNumber();
	const radius = Math.sqrt(-2 * Math.log(u1));
	const angle = 2 * Math.PI * u2;
	out[0] = radius * Math.cos(angle);
	out[1] = radius * Math.sin(angle);
	return out;
}

/** @returns {Cascade} */
export function create(config) {
	// Not in the Luau: the page's sliders can reach parameters Studio never saw.
	Spectrum.validateParams(config.params);
	const n = config.n;
	const size = config.size;
	check(n >= 2 && bit32.band(n, n - 1) === 0, `n must be a power of two, got ${n}`);
	const cells = n * n;
	const dk = (2 * Math.PI) / size;
	const nyquist = (Math.PI * n) / size;
	const kMax = Math.min(config.kMax, nyquist);
	const omega0 = (2 * Math.PI) / config.loopPeriod;
	const random = Random.create(config.seed);

	const kx = zeros(cells);
	const kz = zeros(cells);
	const h0Re = zeros(cells);
	const h0Im = zeros(cells);
	const omega = zeros(cells);
	const unitKx = zeros(cells);
	const unitKz = zeros(cells);
	const invK = zeros(cells);
	const xi = new Float64Array(2);

	for (let row = 0; row <= n - 1; row++) {
		const nz = row < n / 2 ? row : row - n;
		for (let column = 0; column <= n - 1; column++) {
			const nx = column < n / 2 ? column : column - n;
			const index = row * n + column;
			const x = nx * dk;
			const z = nz * dk;
			kx[index] = x;
			kz[index] = z;
			const k = Math.sqrt(x * x + z * z);
			// Draw the gaussians for every cell, in a fixed order, so the band mask never
			// changes which random numbers a cell receives.
			gaussianPair(random, xi);
			const xiRe = xi[0];
			const xiIm = xi[1];
			if (k > 0) {
				invK[index] = 1 / k;
				unitKx[index] = x / k;
				unitKz[index] = z / k;
				omega[index] = Math.floor(Spectrum.omega(k, config.params) / omega0) * omega0;
				if (k >= config.kMin && k < kMax) {
					// Eq 42, with the modal energy split across the two conjugate terms eq 43
					// adds: h~0 = (1 / 2)(xi_r + i xi_i) sqrt(P(k) dk^2), so E|h~0|^2 is
					// P dk^2 / 2 and E|h~|^2 is P dk^2. Tessendorf's bare 1 / sqrt 2 leaves
					// the field with twice the spectrum's variance under discrete Parseval.
					const amplitude = Math.sqrt((Spectrum.variance(x, z, config.params) * dk * dk) / 4);
					h0Re[index] = xiRe * amplitude;
					h0Im[index] = xiIm * amplitude;
				}
			}
		}
	}

	const h0MirrorRe = zeros(cells);
	const h0MirrorIm = zeros(cells);
	for (let row = 0; row <= n - 1; row++) {
		for (let column = 0; column <= n - 1; column++) {
			const index = row * n + column;
			// n - row and n - column are positive integers, so JavaScript's % matches Luau's here.
			const mirror = ((n - row) % n) * n + ((n - column) % n);
			h0MirrorRe[index] = h0Re[mirror];
			h0MirrorIm[index] = -h0Im[mirror];
		}
	}

	const spectrumRe = [];
	const spectrumIm = [];
	for (let slot = 1; slot <= PACKED; slot++) {
		spectrumRe.push(zeros(cells));
		spectrumIm.push(zeros(cells));
	}

	return {
		n,
		size,
		cells,
		time: -1,
		kx,
		kz,
		h0Re,
		h0Im,
		h0MirrorRe,
		h0MirrorIm,
		omega,
		unitKx,
		unitKz,
		invK,
		spectrumRe,
		spectrumIm,
		height: zeros(cells),
		dispX: zeros(cells),
		dispZ: zeros(cells),
		slopeX: zeros(cells),
		slopeZ: zeros(cells),
		jxx: zeros(cells),
		jzz: zeros(cells),
		jxz: zeros(cells),
	};
}

// Eq 43 with the sign of w t flipped: under the e^{+i k.x} synthesis, h0(k) e^{-i w t}
// travels toward +k (downwind), matching the swells' k.x - w t. The paper's e^{+i w t} would
// send a directional sea upwind.
// Then the derived spectra, packed two per complex array: (height, dispX), (dispZ, slopeX),
// (slopeZ, jxx), (jzz, jxz). Packing X + iY: re = Xr - Yi, im = Xi + Yr.
export function evolve(c, t) {
	const h0Re = c.h0Re;
	const h0Im = c.h0Im;
	const mRe = c.h0MirrorRe;
	const mIm = c.h0MirrorIm;
	const omega = c.omega;
	const kx = c.kx;
	const kz = c.kz;
	const ux = c.unitKx;
	const uz = c.unitKz;
	const invK = c.invK;
	const re1 = c.spectrumRe[0];
	const im1 = c.spectrumIm[0];
	const re2 = c.spectrumRe[1];
	const im2 = c.spectrumIm[1];
	const re3 = c.spectrumRe[2];
	const im3 = c.spectrumIm[2];
	const re4 = c.spectrumRe[3];
	const im4 = c.spectrumIm[3];
	const cos = Math.cos;
	const sin = Math.sin;

	for (let index = 0; index < c.cells; index++) {
		const phase = -omega[index] * t;
		const cp = cos(phase);
		const sp = sin(phase);
		// h~ = h0 (cp + i sp) + m (cp - i sp)
		const hr = (h0Re[index] + mRe[index]) * cp - (h0Im[index] - mIm[index]) * sp;
		const hi = (h0Im[index] + mIm[index]) * cp + (h0Re[index] - mRe[index]) * sp;

		const x = kx[index];
		const z = kz[index];
		const ex = ux[index];
		const ez = uz[index];
		const ik = invK[index];
		// dispX~ = i ex h~ = (-ex hi, ex hr); dispZ~ likewise. Gerstner sign: under the +i
		// synthesis this moves water toward crests, so positive chop pinches them;
		// Tessendorf's -i does the opposite here.
		const dxRe = -ex * hi;
		const dxIm = ex * hr;
		const dzRe = -ez * hi;
		const dzIm = ez * hr;
		// slopeX~ = i x h~ = (-x hi, x hr); slopeZ~ likewise.
		const sxRe = -x * hi;
		const sxIm = x * hr;
		const szRe = -z * hi;
		const szIm = z * hr;
		// jxx~ = d(dispX~)/dx = (i x)(i x / k) h~ = -(x^2 / k) h~, and so on: real factors.
		const fxx = -x * x * ik;
		const fzz = -z * z * ik;
		const fxz = -x * z * ik;

		re1[index] = hr - dxIm;
		im1[index] = hi + dxRe;
		re2[index] = dzRe - sxIm;
		im2[index] = dzIm + sxRe;
		re3[index] = szRe - fxx * hi;
		im3[index] = szIm + fxx * hr;
		re4[index] = fzz * hr - fxz * hi;
		im4[index] = fzz * hi + fxz * hr;
	}
	c.time = t;
}

// Four inverse FFTs, then unpack: real part is the first field of the pair, imaginary the
// second. Valid because every packed spectrum is Hermitian (research note, section 1.8).
export function synthesise(c, plan) {
	check(plan.n === c.n, `plan size ${plan.n} does not match cascade size ${c.n}`);
	for (let slot = 0; slot < PACKED; slot++) {
		FFT.inverse2D(plan, c.spectrumRe[slot], c.spectrumIm[slot]);
	}
	const re1 = c.spectrumRe[0];
	const im1 = c.spectrumIm[0];
	const re2 = c.spectrumRe[1];
	const im2 = c.spectrumIm[1];
	const re3 = c.spectrumRe[2];
	const im3 = c.spectrumIm[2];
	const re4 = c.spectrumRe[3];
	const im4 = c.spectrumIm[3];
	const height = c.height;
	const dispX = c.dispX;
	const dispZ = c.dispZ;
	const slopeX = c.slopeX;
	const slopeZ = c.slopeZ;
	const jxx = c.jxx;
	const jzz = c.jzz;
	const jxz = c.jxz;
	for (let index = 0; index < c.cells; index++) {
		height[index] = re1[index];
		dispX[index] = im1[index];
		dispZ[index] = re2[index];
		slopeX[index] = im2[index];
		slopeZ[index] = re3[index];
		jxx[index] = im3[index];
		jzz[index] = re4[index];
		jxz[index] = im4[index];
	}
}

// The evolved height spectrum h~(k, c.time) alone, unpacked, into re and im. Used by the
// packing spec (and by nothing per frame).
export function heightSpectrum(c, re, im) {
	const t = c.time;
	for (let index = 0; index < c.cells; index++) {
		const phase = -c.omega[index] * t;
		const cp = Math.cos(phase);
		const sp = Math.sin(phase);
		re[index] =
			(c.h0Re[index] + c.h0MirrorRe[index]) * cp - (c.h0Im[index] - c.h0MirrorIm[index]) * sp;
		im[index] =
			(c.h0Im[index] + c.h0MirrorIm[index]) * cp + (c.h0Re[index] - c.h0MirrorRe[index]) * sp;
	}
}

// Bilinear corner indices (0-based) and weights for world offset (x, z), wrapping at the patch
// size, written into the module scratch CORNERS as a, b, c, d, wa, wb, wc, wd (the Luau returns
// these eight; a shared scratch keeps the samplers allocation-free). Works on any object with n,
// size and the field arrays (Cascade or FieldStore display).
const CORNERS = new Float64Array(8);

function corners(c, x, z) {
	const n = c.n;
	// Floored modulo: x and z go negative when the camera wanders (Review Focus 1).
	const u = mod((x / c.size) * n, n);
	const v = mod((z / c.size) * n, n);
	const column = Math.floor(u);
	const row = Math.floor(v);
	const fu = u - column;
	const fv = v - row;
	// column + 1 and row + 1 are non-negative integers, so JavaScript's % matches Luau's here.
	const column1 = (column + 1) % n;
	const row1 = (row + 1) % n;
	CORNERS[0] = row * n + column;
	CORNERS[1] = row * n + column1;
	CORNERS[2] = row1 * n + column;
	CORNERS[3] = row1 * n + column1;
	CORNERS[4] = (1 - fu) * (1 - fv);
	CORNERS[5] = fu * (1 - fv);
	CORNERS[6] = (1 - fu) * fv;
	CORNERS[7] = fu * fv;
}

// Bilinear sample of all eight fields at world offset (x, z) from the patch origin, wrapping
// at the patch size. Writes height, dispX, dispZ, slopeX, slopeZ, jxx, jzz, jxz into out[0..7].
// The eight mixes are written out rather than shared through a closure.
export function sample(c, x, z, out = new Float64Array(8)) {
	corners(c, x, z);
	const a = CORNERS[0];
	const b = CORNERS[1];
	const cIndex = CORNERS[2];
	const d = CORNERS[3];
	const wa = CORNERS[4];
	const wb = CORNERS[5];
	const wc = CORNERS[6];
	const wd = CORNERS[7];
	const height = c.height;
	const dispX = c.dispX;
	const dispZ = c.dispZ;
	const slopeX = c.slopeX;
	const slopeZ = c.slopeZ;
	const jxx = c.jxx;
	const jzz = c.jzz;
	const jxz = c.jxz;
	out[0] = height[a] * wa + height[b] * wb + height[cIndex] * wc + height[d] * wd;
	out[1] = dispX[a] * wa + dispX[b] * wb + dispX[cIndex] * wc + dispX[d] * wd;
	out[2] = dispZ[a] * wa + dispZ[b] * wb + dispZ[cIndex] * wc + dispZ[d] * wd;
	out[3] = slopeX[a] * wa + slopeX[b] * wb + slopeX[cIndex] * wc + slopeX[d] * wd;
	out[4] = slopeZ[a] * wa + slopeZ[b] * wb + slopeZ[cIndex] * wc + slopeZ[d] * wd;
	out[5] = jxx[a] * wa + jxx[b] * wb + jxx[cIndex] * wc + jxx[d] * wd;
	out[6] = jzz[a] * wa + jzz[b] * wb + jzz[cIndex] * wc + jzz[d] * wd;
	out[7] = jxz[a] * wa + jxz[b] * wb + jxz[cIndex] * wc + jxz[d] * wd;
	return out;
}

// Height and displacement only (flat lighting needs no slopes). This is the sampler the flat
// look calls once per cascade per vertex, so it works `corners` out for itself rather than
// calling it. `sample` and `sampleNoJacobian`, which run on far fewer vertices, still share
// `corners`, and the spec case "sampleHeight returns the first three values of
// sampleNoJacobian" pins the two together, wrapped point included.
// Writes height, dispX, dispZ into out[0..2].
export function sampleHeight(c, x, z, out = new Float64Array(3)) {
	const n = c.n;
	// Floored modulo, as in `corners` (Review Focus 1).
	const u = mod((x / c.size) * n, n);
	const v = mod((z / c.size) * n, n);
	const column = Math.floor(u);
	const row = Math.floor(v);
	const fu = u - column;
	const fv = v - row;
	// Non-negative integers, so JavaScript's % matches Luau's here.
	const column1 = (column + 1) % n;
	const row1 = (row + 1) % n;
	const rowBase = row * n;
	const row1Base = row1 * n;
	const a = rowBase + column;
	const b = rowBase + column1;
	const cIndex = row1Base + column;
	const d = row1Base + column1;
	const wa = (1 - fu) * (1 - fv);
	const wb = fu * (1 - fv);
	const wc = (1 - fu) * fv;
	const wd = fu * fv;
	const height = c.height;
	const dispX = c.dispX;
	const dispZ = c.dispZ;
	out[0] = height[a] * wa + height[b] * wb + height[cIndex] * wc + height[d] * wd;
	out[1] = dispX[a] * wa + dispX[b] * wb + dispX[cIndex] * wc + dispX[d] * wd;
	out[2] = dispZ[a] * wa + dispZ[b] * wb + dispZ[cIndex] * wc + dispZ[d] * wd;
	return out;
}

// The five fields the surface needs everywhere: height, displacement and slopes, into out[0..4].
export function sampleNoJacobian(c, x, z, out = new Float64Array(5)) {
	corners(c, x, z);
	const a = CORNERS[0];
	const b = CORNERS[1];
	const cIndex = CORNERS[2];
	const d = CORNERS[3];
	const wa = CORNERS[4];
	const wb = CORNERS[5];
	const wc = CORNERS[6];
	const wd = CORNERS[7];
	const height = c.height;
	const dispX = c.dispX;
	const dispZ = c.dispZ;
	const slopeX = c.slopeX;
	const slopeZ = c.slopeZ;
	out[0] = height[a] * wa + height[b] * wb + height[cIndex] * wc + height[d] * wd;
	out[1] = dispX[a] * wa + dispX[b] * wb + dispX[cIndex] * wc + dispX[d] * wd;
	out[2] = dispZ[a] * wa + dispZ[b] * wb + dispZ[cIndex] * wc + dispZ[d] * wd;
	out[3] = slopeX[a] * wa + slopeX[b] * wb + slopeX[cIndex] * wc + slopeX[d] * wd;
	out[4] = slopeZ[a] * wa + slopeZ[b] * wb + slopeZ[cIndex] * wc + slopeZ[d] * wd;
	return out;
}

// The three Jacobian fields at world offset (x, z), into out[0..2]: what the foam field needs
// and nothing else.
export function sampleJacobian(c, x, z, out = new Float64Array(3)) {
	corners(c, x, z);
	const a = CORNERS[0];
	const b = CORNERS[1];
	const cIndex = CORNERS[2];
	const d = CORNERS[3];
	const wa = CORNERS[4];
	const wb = CORNERS[5];
	const wc = CORNERS[6];
	const wd = CORNERS[7];
	const jxx = c.jxx;
	const jzz = c.jzz;
	const jxz = c.jxz;
	out[0] = jxx[a] * wa + jxx[b] * wb + jxx[cIndex] * wc + jxx[d] * wd;
	out[1] = jzz[a] * wa + jzz[b] * wb + jzz[cIndex] * wc + jzz[d] * wd;
	out[2] = jxz[a] * wa + jxz[b] * wb + jxz[cIndex] * wc + jxz[d] * wd;
	return out;
}
