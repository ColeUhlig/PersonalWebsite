// The math box's content, one entry per step (piece C2; lane A owns this file; spec 10.3): `tex` is
// the equation so far (cumulative within a lesson), with \htmlClass{fresh}{...} round what the step
// adds and the sliders' \htmlClass{t-...} term colours (style.css), so a swatch on a slider finds its
// symbol in the box; `changed` is one plain sentence on what changed, with no digits (the copy check
// would need a source for them). Checked against: the sine and bank (engine/waveBanks.js,
// core/waveSampler.js: the normal is dP/dz x dP/dx), the lighting terms (page/lightTerms.js,
// render/termsMaterial.js, lane D's, which mirror step 11's formula), the spectrum and the time
// evolution (core/spectrum.js, core/cascade.js), the choppy displacement's sign (core/cascade.js: +i,
// which moves water toward the crests), the rings (core/tier.js: 2 to 32 studs; core/ringLayout.js
// windowCentre snaps a ring's window to twice its spacing), the ripple map's bytes
// (core/normalTexels.js: R from n.x, G from n.z, B from n.y), the foam (core/foamField.js, whose fold
// test is core/jacobian.js's determinant with the chop c inside it) and the glow (core/scatterLobe.js
// with engine/config.js LOOK.SCATTER: view power 3, face power 1, which is what runs; the module's
// own default face power of 2 is not).
import { STEP_IDS } from '../stages/steps.js';

const entry = (tex, changed) => Object.freeze({ tex, changed });

export const MATH_STEPS = Object.freeze({
	sine: entry(
		String.raw`y = \htmlClass{fresh}{\htmlClass{t-amp}{A}\,\sin(\htmlClass{t-len}{k}\,x)}, \quad \htmlClass{t-len}{k} = \frac{2\pi}{\htmlClass{t-len}{\lambda}}`,
		'A wave is a height that rises and falls as you move along it: A is how tall, λ how long from crest to crest.',
	),
	'moving-sine': entry(
		String.raw`y = \htmlClass{t-amp}{A}\,\sin(\htmlClass{t-len}{k}\,x \htmlClass{fresh}{{} - \htmlClass{t-speed}{\omega}\,t})`,
		'Time goes inside the sine, so the whole curve slides along at ω/k studs a second.',
	),
	'sum-of-sines': entry(
		String.raw`y = \htmlClass{fresh}{\sum_{i=1}^{\htmlClass{t-count}{N}}} A_i \sin(k_i x - \omega_i t + \htmlClass{fresh}{\varphi_i})`,
		'Several waves, each with its own height, length, speed and starting point, simply added together.',
	),
	'into-3d': entry(
		String.raw`y(x, \htmlClass{fresh}{z}, t) = \sum_{i=1}^{N} A_i \sin(k_i x - \omega_i t + \varphi_i)`,
		'Nothing in the sum depends on z, so the curve is just stretched sideways into a sheet.',
	),
	directions: entry(
		String.raw`y(\htmlClass{fresh}{\mathbf{x}}, t) = \sum_{i=1}^{N} A_i \sin\big(k_i\,(\htmlClass{fresh}{\htmlClass{t-dir}{\hat{\mathbf{d}}_i}\cdot\mathbf{x}}) - \omega_i t + \varphi_i\big)`,
		'Each wave gets a heading, and where you stand becomes a point on the ground instead of a spot on a line.',
	),
	'many-waves': entry(
		String.raw`y(\mathbf{x}, t) = \sum_{i=1}^{\htmlClass{fresh}{\htmlClass{t-count}{N}}} A_i \sin\big(k_i\,(\hat{\mathbf{d}}_i\cdot\mathbf{x}) - \omega_i t + \varphi_i\big)`,
		'The same sum with more of the bank in it, tallest waves first.',
	),
	unlit: entry(
		String.raw`y = \sum_i A_i \sin\theta_i, \qquad \text{colour} = \htmlClass{fresh}{\text{white}}`,
		'No light yet: every point is drawn the same white, so the shape disappears.',
	),
	normals: entry(
		String.raw`\mathbf{T} = (1,\ \partial_x y,\ 0), \quad \mathbf{B} = (0,\ \partial_z y,\ 1), \quad \htmlClass{fresh}{\mathbf{n} = \frac{\mathbf{B}\times\mathbf{T}}{\lVert\mathbf{B}\times\mathbf{T}\rVert}}`,
		'The normal points straight out of the surface: cross the two slope directions and there it is.',
	),
	slopes: entry(
		String.raw`\partial_x y \approx \htmlClass{fresh}{\frac{y(x+\htmlClass{t-h}{h}) - y(x-\htmlClass{t-h}{h})}{2\htmlClass{t-h}{h}}}, \quad \partial_x y = \htmlClass{fresh}{\sum_i A_i k_i\,\hat{d}_{i,x}\cos\theta_i}`,
		'Two ways to get a slope: measure it from neighbours h studs away, or take the exact derivative.',
	),
	diffuse: entry(
		String.raw`\text{colour} = c_{\text{sea}}\,\big(a + \htmlClass{fresh}{\max(0,\ \mathbf{n}\cdot\htmlClass{t-sun}{\mathbf{s}})}\big)`,
		'The more a point faces the sun, the brighter it gets, on top of a little light from the sky.',
	),
	highlights: entry(
		String.raw`\text{colour} = (1 - \htmlClass{fresh}{\htmlClass{t-fresnel}{F}})\,c_{\text{sea}}\big(a + \max(0,\ \mathbf{n}\cdot\htmlClass{t-sun}{\mathbf{s}})\big) + \htmlClass{fresh}{\htmlClass{t-fresnel}{F}\big(\htmlClass{t-spec}{(\mathbf{n}\cdot\mathbf{h})^{p}} + c_{\text{sky}}\big)}, \quad \htmlClass{t-fresnel}{F} = F_0 + (1 - F_0)(1 - \mathbf{n}\cdot\mathbf{v})^5`,
		"A glint where the sun bounces straight at you, and the sky mirrored in the water: both are reflections, so both grow stronger as you look across it.",
	),
	gerstner: entry(
		String.raw`\mathbf{x}' = \mathbf{x} + \htmlClass{fresh}{\htmlClass{t-chop}{c}\sum_i \hat{\mathbf{d}}_i A_i \cos\theta_i}, \quad y = \sum_i A_i \sin\theta_i`,
		'Points also slide sideways toward each crest, so the tops pinch and the troughs widen.',
	),
	tiling: entry(
		String.raw`y(\mathbf{x} + \htmlClass{fresh}{\htmlClass{t-tile}{L}\,\mathbf{e}}) = y(\mathbf{x}), \quad \mathbf{e} = \mathbf{e}_x \text{ or } \mathbf{e}_z`,
		'Every wave fits the tile exactly, so the whole sea repeats every L studs.',
	),
	frequency: entry(
		String.raw`y(x) = \sum_{i=1}^{\htmlClass{t-count}{N}} A_i \sin(k_i x + \varphi_i) \;\Longleftrightarrow\; \htmlClass{fresh}{\hat{y}(k)}:\ \text{a spike of height } A_i \text{ at each } k_i`,
		'The same waves written as a list instead of a curve: one spike per wave, at its frequency.',
	),
	fourier: entry(
		String.raw`y(t) = \sum_j \htmlClass{t-note}{a_j}\sin(2\pi f_j t), \qquad \hat{y} = \htmlClass{fresh}{\mathcal{F}}\{y\}, \qquad y = \htmlClass{fresh}{\mathcal{F}^{-1}}\{\hat{y}\}`,
		'Going to frequencies and back loses nothing, so you can take one tone out and rebuild the rest.',
	),
	jonswap: entry(
		String.raw`S(\omega) = \htmlClass{fresh}{\frac{\alpha g^2}{\omega^5}\exp\!\left[-\tfrac{5}{4}\left(\tfrac{\omega_p}{\omega}\right)^4\right]\gamma^{\,r}}, \quad \omega_p = 22\left(\frac{g^2}{\htmlClass{t-wind}{U}\,\htmlClass{t-fetch}{F}}\right)^{1/3}`,
		'Instead of picking the spikes by hand, a measured spectrum says how much energy each frequency gets.',
	),
	'random-sea': entry(
		String.raw`\tilde h_0(\mathbf{k}) = \htmlClass{fresh}{\tfrac{1}{2}\,\htmlClass{t-seed}{(\xi_r + i\,\xi_i)}}\sqrt{S(\mathbf{k})\,\Delta k_x\,\Delta k_z}`,
		"Each wave's height and starting angle are rolled at random around what the spectrum allows.",
	),
	time: entry(
		String.raw`\tilde h(\mathbf{k}, t) = \tilde h_0(\mathbf{k})\,\htmlClass{fresh}{e^{-i\omega t}} + \tilde h_0^{*}(-\mathbf{k})\,\htmlClass{fresh}{e^{i\omega t}}, \quad \omega = \sqrt{g k \tanh(k d)}`,
		"Euler's formula spins every arrow at the speed the dispersion gives it, and the sea starts to move.",
	),
	fft: entry(
		String.raw`h(\mathbf{x}, t) = \sum_{\mathbf{k}} \tilde h(\mathbf{k}, t)\,e^{i\,\mathbf{k}\cdot\mathbf{x}}, \quad O(\htmlClass{t-n}{N}^4) \to \htmlClass{fresh}{O(\htmlClass{t-n}{N}^2 \log \htmlClass{t-n}{N})}`,
		'The same sum for the whole grid at once, reusing work instead of starting over at every point.',
	),
	choppiness: entry(
		String.raw`\mathbf{D}(\mathbf{x}, t) = \htmlClass{fresh}{\sum_{\mathbf{k}} i\,\frac{\mathbf{k}}{\lvert\mathbf{k}\rvert}\,\tilde h(\mathbf{k}, t)\,e^{i\,\mathbf{k}\cdot\mathbf{x}}}, \quad \mathbf{x}' = \mathbf{x} + \htmlClass{t-chop}{c}\,\mathbf{D}`,
		'Another set of transforms gives every point a sideways push toward the crests.',
	),
	layers: entry(
		String.raw`h = \htmlClass{fresh}{\sum_{j=1}^{3} h_j}, \quad \htmlClass{t-layer}{L_j} = 256,\ 64,\ 16`,
		'Grids of three sizes added together, so each one hides where the others repeat.',
	),
	fields: entry(
		String.raw`\htmlClass{fresh}{h_{ij},\ \ \partial_x h_{ij},\ \ D_{x,ij}}, \quad i, j = 0 \ldots N-1`,
		"What the transform hands back isn't a surface: it's grids of numbers, heights and slopes and pushes.",
	),
	sampling: entry(
		String.raw`h(u, v) = \htmlClass{fresh}{(1-f_u)(1-f_v)\,h_{00}} + \htmlClass{fresh}{f_u(1-f_v)\,h_{10}} + \htmlClass{fresh}{(1-f_u)f_v\,h_{01}} + \htmlClass{fresh}{f_u f_v\,h_{11}}, \quad \text{indices} \bmod N`,
		'A point between grid points blends its four neighbours, and the indices wrap round so the grid tiles.',
	),
	mesh: entry(
		String.raw`\Delta_r = 2^r\ \text{studs}, \quad \mathbf{c}_r = \htmlClass{fresh}{2\Delta_r\,\operatorname{round}\big(\mathbf{p} / 2\Delta_r\big)}`,
		'Rings of points around the camera, each twice as coarse as the one inside it, snapped to a fixed grid.',
	),
	painted: entry(
		String.raw`\text{ripple map bytes} = \htmlClass{fresh}{\tfrac{1}{2}(n_x,\ n_z,\ n_y) + \tfrac{1}{2}}`,
		'Workers paint the colour, the glow mask and the ripples into images, and Roblox wraps them onto the mesh.',
	),
	foam: entry(
		String.raw`J = (1 + c\,\partial_x D_x)(1 + c\,\partial_z D_z) - (c\,\partial_x D_z)^2, \quad \htmlClass{fresh}{f} \leftarrow \operatorname{clamp}\!\big(\htmlClass{t-fade}{\delta}\,f + \htmlClass{fresh}{\beta\,\max(0,\ \htmlClass{t-whitecap}{w} - J)},\ 0,\ 1\big)`,
		'Where the surface folds, foam grows, and everywhere it fades a little every step.',
	),
	glow: entry(
		String.raw`E = \htmlClass{fresh}{\htmlClass{t-glow}{\kappa}\,\max(0,\ -\mathbf{s}\cdot\mathbf{v})^{3}\,\big(\tfrac{1}{2} - \tfrac{1}{2}\,\htmlClass{t-sun}{s_y}\big)}, \quad \text{glow} = E \cdot M(h)`,
		'Crests glow when you look toward a low sun through them.',
	),
	finale: entry(
		String.raw`h = \sum_j h_j, \quad \mathbf{x}' = \mathbf{x} + c\,\mathbf{D}, \quad \text{colour} = \text{painted maps} + \text{foam} + \text{glow}`,
		'Nothing new: every piece from the steps above, all at once.',
	),
});

export function mathFor(id) {
	const found = Object.hasOwn(MATH_STEPS, id) ? MATH_STEPS[id] : null;
	if (!found) {
		throw new RangeError(`the math box has no entry for ${JSON.stringify(id)}`);
	}
	return found;
}

// Every step has an entry (mathSteps.test.js checks it too); a missing one would show nothing.
for (const id of STEP_IDS) mathFor(id);
