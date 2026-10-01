// The spectrum chart's layout (piece C, Task 8 fix round 1): the peak's label has a clear spot at
// every wind and fetch the step 7 sliders allow, on a phone-wide and a laptop-wide chart. Before the
// fix, nine settings with the peak near 3 rad/s (wind 7 m/s at 5,000 m, for one) had no spot and
// the chart threw.
import { test } from 'node:test';
import * as expect from '../expect.js';
import * as Charts from '../../../content/ocean/js/engine/charts.js';
import * as Tier from '../../../content/ocean/js/core/tier.js';
import { readConfig } from '../../../content/ocean/js/engine/config.js';
import { recipeFor } from '../../../content/ocean/js/stages/recipes.js';
import { fromInput, LOG_STEPS } from '../../../content/ocean/js/page/sliderModel.js';
import { peakLabelSpot, spectrumPlot, spectrumScales } from '../../../content/ocean/js/page/spectrumLayout.js';

const params = readConfig('').params;
const tier = { sizes: Tier.presets.High.sizes, n: Tier.presets.High.n };
const slider = (id) => recipeFor(7).sliders.find((s) => s.id === id);
const wind = slider('wind');
const fetch = slider('fetch');
const ceiling = Math.max(...Charts.spectrumCurve({ ...params, windSpeed: wind.max, fetch: fetch.max }, tier).physical);
// The widest label the chart writes ("peak: waves 173 studs long") at 12 px, generously.
const labelWidth = (curve) => `peak: waves ${curve.peakWavelength.toFixed(0)} studs long`.length * 6.6;

test("the peak's label has a clear spot at every wind and fetch the sliders allow", () => {
	let settings = 0;
	for (let w = wind.min; w <= wind.max + 1e-9; w += wind.step) {
		for (let position = 0; position <= LOG_STEPS; position += 25) {
			const curve = Charts.spectrumCurve({ ...params, windSpeed: w, fetch: fromInput(fetch, position) }, tier);
			for (const width of [290, 400]) {
				const plot = spectrumPlot(width);
				const scales = spectrumScales(curve, ceiling, plot);
				const label = labelWidth(curve);
				const spot = peakLabelSpot(curve, scales, plot, label);
				const at = `wind ${w}, fetch ${fromInput(fetch, position).toFixed(0)}, width ${width}`;
				expect.truthy(spot.clear, `${at}: the label crosses the curve`);
				expect.truthy(spot.x0 >= plot.left && spot.x0 + label <= plot.right, `${at}: the label leaves the plot (${spot.x0})`);
				settings += 1;
			}
		}
	}
	expect.truthy(settings > 3000, `settings checked: ${settings}`);
});

test('wind 7 m/s at 5,000 m, where the old placement threw, has a spot', () => {
	const curve = Charts.spectrumCurve({ ...params, windSpeed: 7, fetch: 5000 }, tier);
	const plot = spectrumPlot(400);
	const spot = peakLabelSpot(curve, spectrumScales(curve, ceiling, plot), plot, labelWidth(curve));
	expect.truthy(spot.clear, 'clear');
});
