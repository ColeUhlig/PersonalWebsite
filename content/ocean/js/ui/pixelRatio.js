// Calls onChange when the device pixel ratio changes: a window dragged to another screen, or the
// browser's zoom (piece C; A2 final review). A resize event does not always come with it, and the
// renderer's pixel ratio is read only in view.resize(). A resolution media query matches the ratio
// at the time it was made, so each change re-arms it with the new one.
export function watchPixelRatio(onChange, win = window) {
	let query = null;
	function fire() {
		onChange();
		arm();
	}
	function arm() {
		query = win.matchMedia(`(resolution: ${win.devicePixelRatio}dppx)`);
		query.addEventListener('change', fire, { once: true });
	}
	arm();
	return () => query?.removeEventListener('change', fire);
}
