// The spectrum chart's layout (piece C, Task 8; browser-free): the plot inside an SVG `width`
// pixels wide (the chart draws one SVG unit per CSS pixel), its fixed log axis, the curve as pixel
// points and the spot for the peak's label. ui/charts.js draws from it; the unit tests place the
// label over every wind and fetch the sliders allow.
import { linearScale, logScale, placeLabel } from './chartGeometry.js';

export const SPECTRUM = Object.freeze({
	height: 196,
	left: 36,
	rightGap: 8,
	top: 26,
	bottom: 156,
	// Five decades below the stormiest sea's peak (plus headroom) hold the calmest sea's peak too
	// (3 m/s at 5,000 m sits 4.3 decades down).
	decades: 5,
	headroom: 1.5,
	// The peak label's text box about its baseline (12 px text), and how far its background patch
	// (ui/charts.js) reaches past it.
	ascent: 11,
	descent: 3,
	patch: Object.freeze({ x: 3, y: 1 }),
});

export function spectrumPlot(width) {
	return Object.freeze({ left: SPECTRUM.left, right: width - SPECTRUM.rightGap, top: SPECTRUM.top, bottom: SPECTRUM.bottom });
}

// x by omega and y by energy, on an axis whose top is `ceiling` (the stormiest sea's peak) times the
// headroom.
export function spectrumScales(curve, ceiling, plot) {
	const top = ceiling * SPECTRUM.headroom;
	return Object.freeze({
		x: linearScale([curve.omega[0], curve.omega[curve.omega.length - 1]], [plot.left, plot.right]),
		y: logScale([top / 10 ** SPECTRUM.decades, top], [plot.bottom, plot.top]),
	});
}

// The curve as [x, y] pixels, clamped into the plot as the drawn path is.
export function curvePoints(curve, { x, y }, plot) {
	return curve.omega.map((w, i) => [x(w), Math.min(Math.max(y(curve.physical[i]), plot.top), plot.bottom)]);
}

// The peak label's spot ({ x0, base, clear }): beside the peak line, low in the plot or high, its
// background patch clear of the curve; see chartGeometry.placeLabel.
export function peakLabelSpot(curve, scales, plot, labelWidth) {
	return placeLabel({
		anchor: scales.x(curve.peakOmega),
		width: labelWidth,
		rows: [plot.bottom - 6, plot.top + 15],
		ascent: SPECTRUM.ascent,
		descent: SPECTRUM.descent,
		margin: SPECTRUM.patch,
		plot,
		points: curvePoints(curve, scales, plot),
	});
}
