// How a recipe slider (stages/recipes.js) looks as a control (piece C; browser-free): the track an
// <input type=range> gets (fetch runs on a log scale over LOG_STEPS positions, so each decade of
// fetch gets the same length of track), the value text beside it, and the term colour that
// matches the slider to its symbol in "The math" (style.css .t-* classes). A slider whose step's
// math has no symbol for it (the Wireframe switch shows the triangles, it is not a term in any
// formula) maps to null and gets no swatch. tests/ocean/page/sliderModel.test.js checks every class against the
// step's formula in index.html.
export const LOG_STEPS = 1000;

export const TERM_BY_SLIDER = Object.freeze({
	// C2: the wireframe switch is not a term in any formula.
	wireframe: null,
	amplitude: 't-amp',
	wavelength: 't-len',
	speed: 't-speed',
	waveCount: 't-count',
	sunAzimuth: 't-sun',
	shading: null,
	chop: 't-chop',
	wind: 't-wind',
	fetch: 't-fetch',
	seed: 't-seed',
	transformN: 't-n',
	layer1: 't-layer',
	layer2: 't-layer',
	layer3: 't-layer',
	whitecap: 't-whitecap',
	fade: 't-fade',
	sunHeight: 't-sun',
	glow: 't-glow',
	// C2 (spec 10.3): the new steps' sliders.
	fan: 't-dir',
	spacing: 't-h',
	specular: 't-spec',
	fresnel: 't-fresnel',
	note1: 't-note',
	note2: 't-note',
	note3: 't-note',
});

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const isLog = (slider) => slider.scale === 'log';

export function inputRange(slider) {
	if (slider.kind !== 'range') {
		throw new RangeError(`only a range slider has a track, not a ${slider.kind}`);
	}
	return isLog(slider) ? { min: 0, max: LOG_STEPS, step: 1 } : { min: slider.min, max: slider.max, step: slider.step };
}

export function toInput(slider, value) {
	if (!isLog(slider)) {
		return value;
	}
	const position = (LOG_STEPS * Math.log(value / slider.min)) / Math.log(slider.max / slider.min);
	return clamp(Math.round(position), 0, LOG_STEPS);
}

export function fromInput(slider, position) {
	if (!isLog(slider)) {
		return Number(position);
	}
	return slider.min * (slider.max / slider.min) ** (clamp(Number(position), 0, LOG_STEPS) / LOG_STEPS);
}

function decimalsOf(step) {
	const text = String(step);
	const dot = text.indexOf('.');
	return dot === -1 ? 0 : text.length - dot - 1;
}

export function formatValue(slider, value) {
	switch (slider.kind) {
		case 'toggle':
			return value ? 'On' : 'Off';
		case 'counter':
			return `Sea ${value}`;
		case 'choice':
			return `${value} × ${value}`;
		default: {
			const digits = decimalsOf(slider.step ?? 1);
			const text = Number(value).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
			if (!slider.unit) return text;
			return slider.unit === '°' ? `${text}°` : `${text} ${slider.unit}`;
		}
	}
}
