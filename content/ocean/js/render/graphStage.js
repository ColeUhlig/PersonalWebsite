// The flat graph of steps 1 to 4, 14 and 15 (piece C2; lane B owns this file; spec 10.4). Task 0's
// version only clips the surface to the graph's band (stages/graph.js graphBand) through the stage
// look; lane B adds the backdrop, the axes and the curves. The planes are kept and only their
// constants change, so a band that moves every frame costs nothing.
// The probe's `components` is a number: how many component curves are drawn (0 here).
import * as THREE from 'three';
import { GRAPH_OFF, graphBand } from '../stages/graph.js';

export function createGraphStage({ view, ocean, look, reducedMotion = false }) {
	// Points whose signed distance n.p + c is negative are clipped: keep x >= xMin and x <= xMax.
	const minPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
	const maxPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
	const planes = [minPlane, maxPlane];
	let current = GRAPH_OFF;
	let band = null;

	function apply(graph) {
		current = graph;
		band = graphBand(graph);
		if (band === null) {
			look.setClip(null);
			return;
		}
		minPlane.constant = -band[0];
		maxPlane.constant = band[1];
		look.setClip(planes);
	}

	function frame(t) {}

	function probe() {
		return {
			opacity: current.opacity,
			shown: current.opacity,
			yScale: current.yScale,
			band: band === null ? null : [band[0], band[1]],
			emptied: false,
			components: 0,
			curve: null,
		};
	}

	return { apply, frame, probe };
}
