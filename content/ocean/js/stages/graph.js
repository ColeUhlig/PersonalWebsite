// The flat graph's numbers (piece C2, Task 0; not a twin; spec 10.4). Browser-free, so the recipes,
// the blend and the shot checks share them with render/graphStage.js. The graph is drawn on the plane
// x = GRAPH_PLANE_X, which the camera faces looking along +x, and the surface is clipped to the band
// [GRAPH_PLANE_X - near, GRAPH_PLANE_X + far] around it. A band whose near and far both reach NO_CLIP
// is no clip at all.
//
// The graph stage's probe (render/graphStage.js, lane B) returns { opacity, shown, yScale, band,
// emptied, components, curve }, where `components` is a NUMBER: how many component curves are drawn
// (0 when none). The recipe's look.graph.components is the boolean switch that asks for them.
export const GRAPH_PLANE_X = 0;
// Studs: further than the last ring and the horizon reach from any story shot, so a band this wide
// is the whole sea.
export const NO_CLIP = 4096;
// Studs either side of the plane while the graph shows: the sea is a sliver behind the curve. The
// blend lerps near and far on a log scale, so they are never 0.
export const FLAT_BAND = 0.5;
// The graph draws heights this many times taller than they are (the teaching waves are a few studs
// tall and tens of studs long); its height axis says so, and step 4 brings it back to 1.
export const GRAPH_Y_SCALE = 4;
// From this backdrop opacity up, the visitor's orbit and the phone's tilt are held.
export const GRAPH_HOLD = 0.5;
export const GRAPH_OFF = Object.freeze({ opacity: 0, yScale: 1, near: NO_CLIP, far: NO_CLIP, components: false });

/** @returns {null | [number, number]} the surface's x range for a blended look.graph, or null for none */
export function graphBand(graph) {
	if (graph.near >= NO_CLIP && graph.far >= NO_CLIP) {
		return null;
	}
	return [GRAPH_PLANE_X - graph.near, GRAPH_PLANE_X + graph.far];
}
