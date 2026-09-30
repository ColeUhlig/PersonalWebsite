// The page around the live ocean (piece C): the scroll story, the panels' controls, the maths, the
// charts and the finale are features composed here. Each feature starts when the page does (none of
// them needs the ocean to show its text) and may take the ocean's handle once it runs
// (attachOcean) or learn that it will not (oceanUnavailable: 'webgl', 'load' or 'start').
// body[data-ocean] is 'loading', 'running' or 'unavailable', for the stylesheet and the tests.
// Feature imports (each later task adds its import directly above the next line).
// Feature imports end.

export function startPage({ route, reducedMotion, clock }) {
	const features = [];
	const context = Object.freeze({ route, reducedMotion, clock });
	// Features (each later task adds its lines directly above the next line, so they run in task order).
	// Features end.
	document.body.dataset.ocean = 'loading';
	return Object.freeze({
		context,
		attachOcean(handle) {
			document.body.dataset.ocean = 'running';
			for (const feature of features) {
				feature.attachOcean?.(handle);
			}
		},
		oceanUnavailable(reason) {
			document.body.dataset.ocean = 'unavailable';
			document.body.dataset.oceanReason = reason;
			for (const feature of features) {
				feature.oceanUnavailable?.(reason);
			}
		},
	});
}
