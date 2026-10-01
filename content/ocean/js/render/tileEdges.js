// The tile's edges on the sea (piece C2; Task 15's polish round owns this file; spec 10.7 step 13):
// faint dashed lines at every multiple of the 256-stud teaching tile in x and in z, at the sea's mean
// level, so the eye can match one square of the repeating sea to the next. The step's waves all sit
// on the tile's lattice, so the surface really repeats across these lines (recipes.test checks it).
// The lines are made once and only shown or hidden: no per-frame work. They are drawn over the water
// (no depth test): seen from high above, crests a few studs tall would otherwise cut them up.
import * as THREE from 'three';
import { TEACHING_TILE } from '../engine/waveBanks.js';

// Lines from -REACH to +REACH tiles each way: past the tiling shot's frame on every screen shape.
const REACH = 4;
const DASH = 10;
const GAP = 7;
const OPACITY = 0.55;
const COLOUR = '#e8eef2'; // style.css --ink
const ORDER = 9; // over the water, under the graph's pieces (render/graphStage.js ORDER, 10 and up)

export function createTileEdges(view, tile = TEACHING_TILE) {
	const values = [];
	for (let i = -REACH; i <= REACH; i++) values.push(i * tile);
	const far = REACH * tile;
	const positions = new Float32Array(values.length * 2 * 2 * 3);
	let o = 0;
	for (const v of values) {
		positions.set([v, 0, -far, v, 0, far], o); // a line along z, at x = v
		positions.set([-far, 0, v, far, 0, v], o + 6); // a line along x, at z = v
		o += 12;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	const material = new THREE.LineDashedMaterial({ color: new THREE.Color().setStyle(COLOUR, THREE.SRGBColorSpace), dashSize: DASH, gapSize: GAP, transparent: true, opacity: OPACITY, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
	const lines = new THREE.LineSegments(geometry, material);
	lines.computeLineDistances();
	lines.renderOrder = ORDER;
	lines.frustumCulled = false;
	lines.visible = false;
	view.scene.add(lines);
	const xs = Object.freeze([...values]);
	return {
		show(shown) {
			lines.visible = shown;
		},
		probe: () => ({ shown: lines.visible, tile, x: xs, z: xs }),
	};
}
