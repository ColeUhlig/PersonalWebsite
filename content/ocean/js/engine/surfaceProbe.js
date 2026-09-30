// What the surface's finest ring is doing, as numbers a test can check (A3; not a twin): the
// tallest vertex, the furthest any vertex has moved sideways, and how much the height changes
// between neighbours along each axis. Read over the INTERIOR of every visible ring-1 patch: ring 1
// is never faded, and its edge vertices are seam averages that would make a wave running along x
// look as if it changed along z. `sumY` is a checksum that tells two seas apart.
import * as RingLayout from '../core/ringLayout.js';

export function probeSurface(surface) {
	let patches = 0;
	let maxAbsY = 0;
	let maxLateral = 0;
	let xSpread = 0;
	let zSpread = 0;
	let sumY = 0;
	for (const state of surface.byRing[0]) {
		if (state.hidden) {
			continue;
		}
		patches += 1;
		const { cells, localX, localZ } = state.patch;
		const p = state.positions;
		for (let row = 1; row < cells; row++) {
			for (let column = 1; column < cells; column++) {
				const v = RingLayout.vertexIndex(cells, column, row) - 1;
				const o = v * 3;
				const y = p[o + 1];
				sumY += y;
				maxAbsY = Math.max(maxAbsY, Math.abs(y));
				// Against the float32 the positions are stored in, so an undisplaced vertex reads exactly 0
				// on every tier (Low's 48-stud patches in six cells put local offsets off the binary grid).
				maxLateral = Math.max(maxLateral, Math.abs(p[o] - Math.fround(localX[v])), Math.abs(p[o + 2] - Math.fround(localZ[v])));
				if (column < cells - 1) {
					xSpread = Math.max(xSpread, Math.abs(y - p[(v + 1) * 3 + 1]));
				}
				if (row < cells - 1) {
					zSpread = Math.max(zSpread, Math.abs(y - p[(RingLayout.vertexIndex(cells, column, row + 1) - 1) * 3 + 1]));
				}
			}
		}
	}
	return { patches, maxAbsY, maxLateral, xSpread, zSpread, sumY };
}
