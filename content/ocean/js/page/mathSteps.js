// The math box's content, one entry per step (piece C2; lane A owns this file; spec 10.3): `tex` is
// the equation so far (cumulative within a lesson), with \htmlClass{fresh}{...} round what the step
// adds and the sliders' \htmlClass{t-...} term colours (style.css), so a swatch on a slider finds its
// symbol in the box; `changed` is one plain sentence on what changed, with no digits (the copy check
// would need a source for them). Checked against: the sine and bank (engine/waveBanks.js,
// core/waveSampler.js: the normal is dP/dz x dP/dx), the lighting terms (page/lightTerms.js,
// render/termsMaterial.js, lane D's, which mirror step 11's formula), the spectrum and the time
// evolution (core/spectrum.js, core/cascade.js: ω rounded down to a multiple of 2π over
// engine/config.js LOOP_PERIOD, 120 s), the chord's phases (lane E's page/frequencyMath.js TONES), the
// sheet (at fan 0 the waves vary along world z and the sheet unrolls along world x, so the box calls
// the line's coordinate x and the new direction x⊥, never a world axis), the choppy displacement's sign (core/cascade.js: +i,
// which moves water toward the crests), the rings (core/tier.js: 2 to 32 studs; core/ringLayout.js
// windowCentre snaps a ring's window to twice its spacing), the ripple map's bytes
// (core/normalTexels.js: R from n.x, G from n.z, B from n.y), the foam (core/foamField.js, whose fold
// test is core/jacobian.js's determinant with the chop c inside it) and the glow (core/scatterLobe.js
// with engine/config.js LOOK.SCATTER: view power 3, face power 1, which is what runs; the module's
// own default face power of 2 is not).
import { STEP_IDS } from '../stages/steps.js';

// `bar` is the phone bar's one line: the same equations, in an order that puts the step's point
// first where the line is cut short (foam); by default the same as `tex`.
const entry = (tex, changed, bar = tex) => Object.freeze({ tex, changed, bar });

export const MATH_STEPS = Object.freeze({
	sine: entry(
		String.raw`y = \htmlClass{fresh}{\htmlClass{t-amp}{A}\,\sin(\htmlClass{t-len}{k}\,x)}, \quad \htmlClass{t-len}{k} = \frac{2\pi}{\htmlClass{t-len}{\lambda}}`,
		'A sinusoid in one spatial coordinate: A is the amplitude and λ the wavelength, the distance between crests.',
	),
	'moving-sine': entry(
		String.raw`y = \htmlClass{t-amp}{A}\,\sin(\htmlClass{t-len}{k}\,x \htmlClass{fresh}{{} - \htmlClass{t-speed}{\omega}\,t})`,
		'Time enters the argument of the sine, so the profile translates at the phase speed ω/k studs per second.',
	),
	'sum-of-sines': entry(
		String.raw`y = \htmlClass{fresh}{\sum_{i=1}^{\htmlClass{t-count}{N}}} A_i \sin(k_i x - \omega_i t + \htmlClass{fresh}{\varphi_i})`,
		'A superposition of components, each with its own amplitude, wavelength, frequency and initial phase.',
	),
	'into-3d': entry(
		String.raw`y(x, \htmlClass{fresh}{x_\perp}, t) = \sum_{i=1}^{N} A_i \sin(k_i x - \omega_i t + \varphi_i)`,
		'The sum is independent of the transverse coordinate, so the profile extrudes into a surface.',
	),
	directions: entry(
		String.raw`y(\htmlClass{fresh}{\mathbf{x}}, t) = \sum_{i=1}^{N} A_i \sin\big(k_i\,(\htmlClass{fresh}{\htmlClass{t-dir}{\hat{\mathbf{d}}_i}\cdot\mathbf{x}}) - \omega_i t + \varphi_i\big)`,
		'Each component receives a heading, and position becomes a point on the horizontal plane.',
	),
	'many-waves': entry(
		String.raw`y(\mathbf{x}, t) = \sum_{i=1}^{\htmlClass{fresh}{\htmlClass{t-count}{N}}} A_i \sin\big(k_i\,(\hat{\mathbf{d}}_i\cdot\mathbf{x}) - \omega_i t + \varphi_i\big)`,
		'The same sum over more components, in order of decreasing amplitude.',
	),
	unlit: entry(
		String.raw`\text{colour} = \htmlClass{fresh}{c_{\text{white}}}`,
		'Without illumination every point receives the same colour, so the shape is not visible.',
	),
	normals: entry(
		String.raw`\mathbf{T} = (1,\ \partial_x y,\ 0), \quad \mathbf{B} = (0,\ \partial_z y,\ 1), \quad \htmlClass{fresh}{\mathbf{n} = \frac{\mathbf{B}\times\mathbf{T}}{\lVert\mathbf{B}\times\mathbf{T}\rVert}}`,
		'The normal is perpendicular to the surface: the cross product of the two tangent directions.',
	),
	slopes: entry(
		String.raw`\partial_x y \approx \htmlClass{fresh}{\frac{y(x+\htmlClass{t-h}{h}) - y(x-\htmlClass{t-h}{h})}{2\htmlClass{t-h}{h}}}, \quad \partial_x y = \htmlClass{fresh}{\sum_i A_i k_i\,\hat{d}_{i,x}\cos\theta_i}`,
		'The slope by central difference over a spacing h, or exactly by differentiation.',
	),
	diffuse: entry(
		String.raw`\text{colour} = c_{\text{sea}}\,\big(a + \htmlClass{fresh}{\max(0,\ \mathbf{n}\cdot\htmlClass{t-sun}{\mathbf{s}})}\big)`,
		'Lambertian diffuse illumination from the sun, added to an ambient term for skylight.',
	),
	highlights: entry(
		String.raw`\text{colour} = (1 - \htmlClass{fresh}{\htmlClass{t-fresnel}{F}})\,c_{\text{sea}}\big(a + \max(0,\ \mathbf{n}\cdot\htmlClass{t-sun}{\mathbf{s}})\big) + \htmlClass{fresh}{\htmlClass{t-fresnel}{F}\big(\htmlClass{t-spec}{(\mathbf{n}\cdot\mathbf{h})^{p}} + c_{\text{sky}}\big)}, \quad \htmlClass{t-fresnel}{F} = F_0 + (1 - F_0)(1 - \mathbf{n}\cdot\mathbf{v})^5`,
		'A specular highlight and a sky reflection, both weighted by the Fresnel term, which grows toward grazing angles.',
	),
	gerstner: entry(
		String.raw`\mathbf{x}' = \mathbf{x} + \htmlClass{fresh}{\htmlClass{t-chop}{c}\sum_i \hat{\mathbf{d}}_i A_i \cos\theta_i}, \quad y = \sum_i A_i \sin\theta_i`,
		'Points are also displaced horizontally toward each crest, so crests sharpen and troughs broaden.',
	),
	tiling: entry(
		String.raw`y(\mathbf{x} + \htmlClass{fresh}{\htmlClass{t-tile}{L}\,\mathbf{e}}) = y(\mathbf{x}), \quad \mathbf{e} = \mathbf{e}_x \text{ or } \mathbf{e}_z`,
		'With the spread full, every component fits the tile exactly, so the surface is periodic over L studs.',
	),
	frequency: entry(
		String.raw`y(x) = \sum_{i=1}^{\htmlClass{t-count}{N}} A_i \sin(k_i x + \varphi_i) \;\Longleftrightarrow\; \htmlClass{fresh}{\hat{y}(k)}:\ \text{a spike of height } A_i \text{ at each } k_i`,
		'The same waves in the frequency domain: one spike per component, at its frequency.',
	),
	fourier: entry(
		String.raw`y(t) = \sum_j \htmlClass{t-note}{a_j}\sin(2\pi f_j t + \varphi_j), \qquad \hat{y} = \htmlClass{fresh}{\mathcal{F}}\{y\}, \qquad y = \htmlClass{fresh}{\mathcal{F}^{-1}}\{\hat{y}\}`,
		'The transform is invertible, so a tone can be removed and the remainder resynthesised.',
	),
	jonswap: entry(
		String.raw`S(\omega) = \htmlClass{fresh}{\frac{\alpha g^2}{\omega^5}\exp\!\left[-\tfrac{5}{4}\left(\tfrac{\omega_p}{\omega}\right)^4\right]\gamma^{\,r}}, \quad \omega_p = 22\left(\frac{g^2}{\htmlClass{t-wind}{U}\,\htmlClass{t-fetch}{F}}\right)^{1/3}`,
		'An empirical spectrum assigns the energy at each frequency in place of hand-chosen components.',
	),
	'random-sea': entry(
		String.raw`\tilde h_0(\mathbf{k}) = \htmlClass{fresh}{\tfrac{1}{2}\,\htmlClass{t-seed}{(\xi_r + i\,\xi_i)}}\sqrt{S(\mathbf{k})\,\Delta k_x\,\Delta k_z}`,
		'Each amplitude and initial phase is drawn at random about the value the spectrum prescribes.',
	),
	time: entry(
		String.raw`\tilde h(\mathbf{k}, t) = \tilde h_0(\mathbf{k})\,\htmlClass{fresh}{e^{-i\omega t}} + \tilde h_0^{*}(-\mathbf{k})\,\htmlClass{fresh}{e^{i\omega t}}, \quad \htmlClass{fresh}{\omega = \Big\lfloor \frac{\sqrt{g k \tanh(k d)}}{\omega_0} \Big\rfloor\,\omega_0}, \quad \omega_0 = \frac{2\pi}{120\ \text{s}}`,
		'Each phasor rotates at the rate the dispersion relation assigns, so the surface evolves in time.',
	),
	fft: entry(
		String.raw`h(\mathbf{x}, t) = \sum_{\mathbf{k}} \tilde h(\mathbf{k}, t)\,e^{i\,\mathbf{k}\cdot\mathbf{x}}, \quad O(\htmlClass{t-n}{N}^4) \to \htmlClass{fresh}{O(\htmlClass{t-n}{N}^2 \log \htmlClass{t-n}{N})}`,
		'The same sum over the whole grid at once, reusing intermediate results.',
	),
	choppiness: entry(
		String.raw`\mathbf{D}(\mathbf{x}, t) = \htmlClass{fresh}{\sum_{\mathbf{k}} i\,\frac{\mathbf{k}}{\lvert\mathbf{k}\rvert}\,\tilde h(\mathbf{k}, t)\,e^{i\,\mathbf{k}\cdot\mathbf{x}}}, \quad \mathbf{x}' = \mathbf{x} + \htmlClass{t-chop}{c}\,\mathbf{D}`,
		'A further set of transforms gives every point a horizontal displacement toward the crests.',
	),
	layers: entry(
		String.raw`h = \htmlClass{fresh}{\sum_{j=1}^{3} h_j}, \quad \htmlClass{t-layer}{L_j} = 256,\ 64,\ 16`,
		'Grids of three sizes summed, so each conceals the periodicity of the others.',
	),
	fields: entry(
		String.raw`\htmlClass{fresh}{h_{ij},\ \ \partial_x h_{ij},\ \ D_{x,ij}}, \quad i, j = 0 \ldots N-1`,
		'The transform returns grids of values rather than a surface: heights, slopes and displacements.',
	),
	sampling: entry(
		String.raw`h(u, v) = \htmlClass{fresh}{(1-f_u)(1-f_v)\,h_{00}} + \htmlClass{fresh}{f_u(1-f_v)\,h_{10}} + \htmlClass{fresh}{(1-f_u)f_v\,h_{01}} + \htmlClass{fresh}{f_u f_v\,h_{11}}, \quad \text{indices} \bmod N`,
		'A point between grid points interpolates its four neighbours, and the indices wrap so the grid tiles.',
	),
	mesh: entry(
		String.raw`\Delta_r = 2^r\ \text{studs}, \quad \mathbf{c}_r = \htmlClass{fresh}{2\Delta_r\,\operatorname{round}\big(\mathbf{p} / 2\Delta_r\big)}`,
		'Concentric rings of vertices, each twice as coarse as the one inside it, snapped to a fixed grid.',
	),
	painted: entry(
		String.raw`\text{normal rgb} = \htmlClass{fresh}{\tfrac{1}{2}(n_x,\ n_z,\ n_y) + \tfrac{1}{2}}`,
		'Workers paint the colour map, emission mask and normal map, which Roblox maps onto the mesh.',
	),
	foam: entry(
		String.raw`\htmlClass{fresh}{J = (1 + c\,\partial_x D_x)(1 + c\,\partial_z D_z) - (c\,\partial_x D_z)^2}, \quad \htmlClass{fresh}{f} \leftarrow \operatorname{clamp}\!\big(\htmlClass{t-fade}{\delta}\,f + \htmlClass{fresh}{\beta\,\max(0,\ \htmlClass{t-whitecap}{w} - J)},\ 0,\ 1\big)`,
		'Foam accumulates where the surface folds and decays everywhere at each step.',
		String.raw`\htmlClass{fresh}{f} \leftarrow \operatorname{clamp}\!\big(\htmlClass{t-fade}{\delta}\,f + \htmlClass{fresh}{\beta\,\max(0,\ \htmlClass{t-whitecap}{w} - J)},\ 0,\ 1\big), \quad \htmlClass{fresh}{J = (1 + c\,\partial_x D_x)(1 + c\,\partial_z D_z) - (c\,\partial_x D_z)^2}`,
	),
	glow: entry(
		String.raw`E = \htmlClass{fresh}{\htmlClass{t-glow}{\kappa}\,\max(0,\ -\mathbf{s}\cdot\mathbf{v})^{3}\,\big(\tfrac{1}{2} - \tfrac{1}{2}\,\htmlClass{t-sun}{s_y}\big)}, \quad \text{glow} = E \cdot M(h)`,
		'Crests glow when viewed toward a low sun, approximating light scattered within the water.',
	),
	finale: entry(
		String.raw`h = \sum_j h_j, \quad \mathbf{x}' = \mathbf{x} + c\,\mathbf{D}, \quad \text{colour} = \text{painted maps} + \text{foam} + \text{glow}`,
		'No new terms: every component from the preceding sections, combined.',
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
