// The geometry of the story's charts (piece C; browser-free): scales, a clipped SVG path, round
// tick values, the end of a phase arrow and a place for a label clear of the line.
export function linearScale([d0, d1], [r0, r1]) {
	const k = (r1 - r0) / (d1 - d0);
	return (value) => r0 + (value - d0) * k;
}

export function logScale([d0, d1], [r0, r1]) {
	if (!(d0 > 0 && d1 > 0)) {
		throw new RangeError(`a log scale needs a positive domain, got ${d0} .. ${d1}`);
	}
	const l0 = Math.log10(d0);
	const k = (r1 - r0) / (Math.log10(d1) - l0);
	return (value) => r0 + (Math.log10(value) - l0) * k;
}

export function linePath(xs, ys, x, y, { top, bottom }) {
	const points = [];
	for (let i = 0; i < xs.length; i++) {
		const px = x(xs[i]);
		const py = y(ys[i]);
		if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
		points.push(`${px.toFixed(2)} ${Math.min(Math.max(py, top), bottom).toFixed(2)}`);
	}
	return points.length === 0 ? '' : `M${points.join(' L')}`;
}

function niceStep(raw) {
	const power = 10 ** Math.floor(Math.log10(raw));
	const fraction = raw / power;
	return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

export function niceTicks(min, max, count = 5) {
	const step = niceStep((max - min) / count);
	const ticks = [];
	for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-9; value += step) {
		ticks.push(Number(value.toFixed(10)));
	}
	return ticks;
}

export function arrowEnd(re, im, maxAmplitude, radius) {
	const scale = maxAmplitude > 0 ? radius / maxAmplitude : 0;
	return { x: re * scale, y: -im * scale };
}

// The index of the first box ({ x0, x1, y0, y1 }, in pixels) that no segment of the polyline
// `points` ([[x, y], ...]) passes through, or -1. Each segment is checked over the part of it that
// lies across the box, so a steep one is caught between its two points.
export function firstClearBox(points, boxes) {
	return boxes.findIndex((box) => {
		for (let i = 1; i < points.length; i++) {
			const [ax, ay] = points[i - 1];
			const [bx, by] = points[i];
			const from = Math.max(Math.min(ax, bx), box.x0);
			const to = Math.min(Math.max(ax, bx), box.x1);
			if (from > to) continue;
			const at = (px) => (bx === ax ? ay : ay + ((by - ay) * (px - ax)) / (bx - ax));
			const low = Math.min(at(from), at(to), bx === ax ? by : Infinity);
			const high = Math.max(at(from), at(to), bx === ax ? by : -Infinity);
			if (high >= box.y0 && low <= box.y1) return false;
		}
		return true;
	});
}
