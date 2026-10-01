// What of the page sits over the ocean's canvas (piece C2, Task 14; integration's file), in CSS
// pixels, so the flat graph can keep its words out from under it (render/graphStage.js keepClear):
// the pills (the motion and tilt buttons, style.css .pills) at the canvas's bottom right, and on a
// wide screen the steps' panels down its left (they all stand in one column) and the math box at its
// top right. Measured when the
// canvas, the pills' column or a panel changes size (a resize, the text size, a pill shown, hidden or
// reworded), never per frame.

// { width, height } of the pills' column measured in from the canvas's right and bottom edges, or
// null when no pill shows over the canvas.
export function pillsOver(canvasRect, pillsRect) {
	const width = canvasRect.right - pillsRect.left;
	const height = canvasRect.bottom - pillsRect.top;
	const over = pillsRect.width > 0 && pillsRect.height > 0 && pillsRect.left < canvasRect.right && pillsRect.top < canvasRect.bottom && width > 0 && height > 0;
	return over ? { width, height } : null;
}

// How far in from the canvas's left edge the panels' column reaches, or 0 when the panels do not
// stand over the canvas (a narrow screen puts them under the ocean's half).
export function panelsOver(canvasRect, panelRect, wide) {
	if (!wide || !panelRect || panelRect.width <= 0 || panelRect.left >= canvasRect.right) return 0;
	return Math.max(0, panelRect.right - canvasRect.left);
}

// { width, height } of the math box measured in from the canvas's right and top edges, or null when
// it does not stand over the canvas (hidden, or a narrow screen's bar under the ocean's half).
export function boxOver(canvasRect, boxRect, wide) {
	if (!wide || !boxRect || boxRect.width <= 0 || boxRect.height <= 0 || boxRect.left >= canvasRect.right || boxRect.top >= canvasRect.bottom) return null;
	return { width: canvasRect.right - boxRect.left, height: boxRect.bottom - canvasRect.top };
}

const sameZone = (a, b) => (a === null ? b === null : b !== null && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5);

// Calls onChange({ pills: pillsOver(...), left: panelsOver(...), box: boxOver(...) }) now and
// whenever it changes. Returns a function that stops it.
export function watchKeepClear(canvas, pills, panel, box, onChange) {
	if (!canvas || typeof ResizeObserver !== 'function') {
		onChange({ pills: null, left: 0, box: null });
		return () => {};
	}
	const wide = window.matchMedia('(min-width: 900px)');
	let last = null;
	const measure = () => {
		const frame = canvas.getBoundingClientRect();
		const next = {
			pills: pills ? pillsOver(frame, pills.getBoundingClientRect()) : null,
			left: panel ? panelsOver(frame, panel.getBoundingClientRect(), wide.matches) : 0,
			box: box && !box.hidden ? boxOver(frame, box.getBoundingClientRect(), wide.matches) : null,
		};
		if (last === null || !sameZone(last.pills, next.pills) || !sameZone(last.box, next.box) || Math.abs(last.left - next.left) >= 0.5) {
			last = next;
			onChange(next);
		}
	};
	const observer = new ResizeObserver(measure);
	observer.observe(canvas);
	if (pills) observer.observe(pills);
	if (panel) observer.observe(panel);
	if (box) observer.observe(box);
	window.addEventListener('resize', measure);
	measure();
	return () => {
		observer.disconnect();
		window.removeEventListener('resize', measure);
	};
}
