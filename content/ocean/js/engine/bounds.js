// A patch's bounding volume and the skirt under it have to cover the worst displacement the sea
// can reach. Twin of the coordinator's bounds guess (OceanClient.client.luau), moved out of
// ocean.js by A3 and extended for the page's sliders: Studio never changed the wind while the
// ocean ran, the page does, so the guess scales with the sea state as well as the shape knobs.
import * as Spectrum from '../core/spectrum.js';

const REFERENCE = Spectrum.NORMAL;

// How much taller this sea is than the shipped one (wind 12 m/s, fetch 80,000 m): the square root
// of the ratio of the JONSWAP spectrum's total variance, which for the fetch-limited form is
// proportional to alpha / peakOmega^4 (the integral of alpha g^2 w^-5 exp(-1.25 (wp / w)^4) over
// w is alpha g^2 / (5 wp^4)). The gamma bump and the depth factor change that by a factor that
// barely moves with the wind, and the FFT lattice holds less than the whole spectrum, so this
// over-covers: on the three High cascades (2026-09-30, t = 0, 12, 40, 77) wind 25 m/s at
// 200,000 m reached 47.8 studs where this gives 110. Exactly 1 at the reference sea.
export function seaFactor(params) {
	Spectrum.validateParams(params);
	const variance = (p) => Spectrum.alpha(p) / Spectrum.peakOmega(p) ** 4;
	return Math.sqrt(variance(params) / variance(REFERENCE));
}

// A2's generous linear guesses (lateral 46.4 and height 40 at the shipped sea, against measured
// extremes of about 10 and 17.5), with the amplitude scaled by the sea factor.
export function boundsFor({ params, chop, swellScale }) {
	const scale = params.scale * seaFactor(params);
	return Object.freeze({
		lateral: 8 + 6 * chop * scale + 2 * swellScale,
		height: 8 + 4 * scale + 2.5 * swellScale,
	});
}

// A Gerstner bank can stand no taller than its summed amplitude (waveBanks.bankExtent), nor move a
// vertex further sideways than chop times that. The same 8 studs of headroom as above.
export function bankBounds(extent, chop) {
	return Object.freeze({ lateral: 8 + chop * extent, height: 8 + extent });
}

// The bounds only grow while the page runs: a sea that calms keeps the wider volume rather than
// making the renderer refit 224 spheres back and forth as a slider moves.
export function grow(a, b) {
	return Object.freeze({ lateral: Math.max(a.lateral, b.lateral), height: Math.max(a.height, b.height) });
}
