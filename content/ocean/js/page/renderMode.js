// The finale's Roblox / Unleashed toggle (piece C, for piece A4). Browser-free. The toggle exists
// only when the ocean's handle has a setRenderMode function (A4 adds it); until then the page
// hides it. A mode the renderer does not know is refused; if the renderer throws, the toggle
// keeps showing the mode it was in.
export const RENDER_MODES = Object.freeze(['roblox', 'unleashed']);

export function renderModeControl(handle) {
	if (typeof handle?.setRenderMode !== 'function') {
		return null;
	}
	let mode = 'roblox';
	return Object.freeze({
		modes: RENDER_MODES,
		mode: () => mode,
		choose(next) {
			if (!RENDER_MODES.includes(next)) {
				throw new RangeError(`render mode must be one of ${RENDER_MODES.join(', ')}, got ${next}`);
			}
			handle.setRenderMode(next);
			mode = next;
			return mode;
		},
	});
}
