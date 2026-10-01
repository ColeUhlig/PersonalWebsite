// Where the page's pills (the motion and tilt buttons, style.css .pills) sit over the ocean's canvas
// (piece C2, Task 14; integration's file): the box they cover at the canvas's bottom right, in CSS
// pixels, so the flat graph can keep its words out from under them (render/graphStage.js keepClear).
// Measured when the canvas or the pills' column changes size (a resize, the text size, a pill shown,
// hidden or reworded), never per frame.

// { width, height } of the pills' column measured in from the canvas's right and bottom edges, or
// null when no pill shows over the canvas.
export function pillsOver(canvasRect, pillsRect) {
	const width = canvasRect.right - pillsRect.left;
	const height = canvasRect.bottom - pillsRect.top;
	const over = pillsRect.width > 0 && pillsRect.height > 0 && pillsRect.left < canvasRect.right && pillsRect.top < canvasRect.bottom && width > 0 && height > 0;
	return over ? { width, height } : null;
}

// Calls onChange with pillsOver(...) now and whenever it changes. Returns a function that stops it.
export function watchKeepClear(canvas, pills, onChange) {
	if (!canvas || !pills || typeof ResizeObserver !== 'function') {
		onChange(null);
		return () => {};
	}
	let last = null;
	const measure = () => {
		const next = pillsOver(canvas.getBoundingClientRect(), pills.getBoundingClientRect());
		const same = next === null ? last === null : last !== null && Math.abs(next.width - last.width) < 0.5 && Math.abs(next.height - last.height) < 0.5;
		if (!same) {
			last = next;
			onChange(next);
		}
	};
	const observer = new ResizeObserver(measure);
	observer.observe(canvas);
	observer.observe(pills);
	window.addEventListener('resize', measure);
	measure();
	return () => {
		observer.disconnect();
		window.removeEventListener('resize', measure);
	};
}
