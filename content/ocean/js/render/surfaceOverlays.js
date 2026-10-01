// Arrows on the surface (piece C2; lane C owns this file; spec 10.7 steps 5, 8 and 9): each wave's
// heading, the surface's normals, and the central-difference normal beside the exact one. Task 0's
// version is the interface with nothing drawn.
export function createSurfaceOverlays({ view, ocean }) {
	let kind = null;
	let spacing = 4;
	return {
		apply(overlay) {
			kind = overlay.kind;
			spacing = overlay.spacing;
		},
		frame(t, focus) {},
		probe() {
			return { kind, arrows: 0, spacing, meanAngle: null, finite: true };
		},
	};
}
