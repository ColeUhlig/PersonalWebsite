// The look a stage recipe asks for, applied to the ocean's meshes (A3; not a twin): which material
// the surface wears -- flat white (the graph and wave steps from sine to many-waves, then unlit,
// normals and slopes, frequency and fourier), the lighting terms one at a time (diffuse, highlights,
// gerstner and tiling: render/termsMaterial.js), the sea colour lit by three's standard material or
// unlit (no C2 recipe asks for `sea`; kept for any that does), or the painted Roblox-mode materials
// (jonswap to the finale) -- the wireframe over it, the fog and the sun. A material
// change swaps the meshes' material references; nothing is rebuilt, and the painted materials keep
// their textures and glow for when they come back. The wireframe is one extra mesh per patch,
// sharing the patch's geometry as its child (so it moves and hides with it), built the first time
// it is asked for and hidden, not removed, when it is switched off; it fades out with view depth
// (the recipe's look.wireFade, stages/recipeKit.js WIRE_FADE for most steps) so the far grid does
// not crowd into moire. The horizon quads get the
// material but no wireframe: two triangles 2,048 studs wide would draw one huge diagonal.
// C2: the `terms` material (lane D's render/termsMaterial.js, a shader that switches each lighting
// term on alone and follows the stage sun) and `setClip`, which clips every surface material to the
// flat graph's band. While the band is on, the white material and the wireframe also leave out every
// triangle that touches a skirted vertex (Task 14): the coarser rings' skirts hang under a finer
// ring's edge, out of sight from above, but the band cuts them and they showed as short stubs under
// the curve, which no flat clip can remove. Those triangles lie inside the finer ring's window (a
// ring's vertices on that window's edge are never skirted), so nothing visible goes with them. The
// graph steps wear white; the painted and terms materials are never in a band except for the one
// frame of a fling, and keep their skirts.
import * as THREE from 'three';
import { WIRE_FADE } from '../stages/recipeKit.js';
import { sunDirection } from '../stages/sun.js';
import { createTermsMaterial } from './termsMaterial.js';

const WHITE = Object.freeze([0.95, 0.95, 0.94]);
const WIRE = Object.freeze([0.11, 0.17, 0.21]);
const WIRE_OPACITY = 0.55;
// The lit sea's roughness: shiny enough for the sun's highlight and the sky's Fresnel to read on
// the Gerstner waves (piece C's lit steps; no C2 recipe wears it).
const SEA_ROUGHNESS = 0.3;
const MODES = Object.freeze(['white', 'sea-lit', 'sea-flat', 'painted', 'terms']);

const srgb = (rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);

// The unpainted sea's colour: the painted map's own mix, deep water tinted towards the subsurface
// colour by the tint (config.deep, config.subsurface, config.tint).
function seaColour(config) {
	const mix = (i) => (config.deep[i] + (config.subsurface[i] - config.deep[i]) * config.tint) / 255;
	return srgb([mix(0), mix(1), mix(2)]);
}

function modeOf(look) {
	if (look.material === 'terms') return 'terms';
	const mode = look.material === 'sea' ? (look.shading ? 'sea-lit' : 'sea-flat') : look.material;
	if (!MODES.includes(mode)) {
		throw new Error(`stage look: unknown material ${look.material}`);
	}
	return mode;
}

// Studs above the skirt's depth that still count as skirted: skirted vertices sit exactly at
// surface.skirtY (a float32), and the sheet never comes within this of it (the skirt hangs at the
// bounds' depth, below the deepest the sea can reach plus SKIRT_MARGIN).
const SKIRT_TOLERANCE = 0.01;

// Adds the skirt cut to a material's shader (onBeforeCompile): a vertex at the skirt's depth marks
// its triangles, and while `skirtHide` is on every fragment of a marked triangle is discarded.
function cutSkirts(shader, uniforms) {
	shader.uniforms.skirtY = uniforms.skirtY;
	shader.uniforms.skirtHide = uniforms.skirtHide;
	shader.vertexShader = shader.vertexShader
		.replace('#include <common>', '#include <common>\nuniform float skirtY;\nvarying float vSkirt;')
		.replace('#include <begin_vertex>', `#include <begin_vertex>\n\tvSkirt = position.y <= skirtY + ${SKIRT_TOLERANCE.toFixed(3)} ? 1.0 : 0.0;`);
	shader.fragmentShader = shader.fragmentShader
		.replace('#include <common>', '#include <common>\nuniform float skirtHide;\nvarying float vSkirt;')
		.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n\tif (skirtHide > 0.5 && vSkirt > 0.0) discard;');
}

// surface: the engine's surface state (ocean.surface), whose skirtY the skirt cut reads; without it
// the skirts are never cut.
export function createStageLook({ view, meshes, materials, config, surface = null }) {
	const sea = seaColour(config);
	const shared = {
		// Pushed back a little in depth so the wireframe drawn at the same depth sits on top of it.
		white: new THREE.MeshBasicMaterial({ color: srgb(WHITE), toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
		'sea-lit': new THREE.MeshStandardMaterial({ color: sea, roughness: SEA_ROUGHNESS, metalness: 0 }),
		'sea-flat': new THREE.MeshBasicMaterial({ color: sea }),
		terms: createTermsMaterial({ seaColour: sea, sunDirection: view.sunDirection }),
	};
	const wireMaterial = new THREE.MeshBasicMaterial({ color: srgb(WIRE), wireframe: true, transparent: true, opacity: WIRE_OPACITY, toneMapped: false });
	// The skirt cut's uniforms, shared by the white material and the wireframe.
	const skirt = { skirtY: { value: -1e6 }, skirtHide: { value: 0 } };
	// The wireframe's fade depths, set from each frame's look.
	const wireFade = { value: new THREE.Vector2(WIRE_FADE[0], WIRE_FADE[1]) };
	shared.white.onBeforeCompile = (shader) => cutSkirts(shader, skirt);
	wireMaterial.onBeforeCompile = (shader) => {
		cutSkirts(shader, skirt);
		shader.uniforms.wireFade = wireFade;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying float vWireDepth;')
			.replace('#include <project_vertex>', '#include <project_vertex>\n\tvWireDepth = -mvPosition.z;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nuniform vec2 wireFade;\nvarying float vWireDepth;')
			.replace('#include <opaque_fragment>', 'diffuseColor.a *= 1.0 - smoothstep(wireFade.x, wireFade.y, vWireDepth);\n\t#include <opaque_fragment>');
	};
	let mode = 'painted';
	let wires = null;
	let wireframe = false;
	// The sun last handed to the view, compared as numbers so the per-frame check allocates nothing.
	let sunAzimuth = Number.NaN;
	let sunElevation = Number.NaN;
	// C2: the planes every surface material is clipped to (stages/graph.js), or null.
	let clip = null;
	const surfaceMaterials = () => [...new Set([...Object.values(shared), wireMaterial, ...materials.patchMaterials, ...materials.quadMaterials])];
	function setClip(planes) {
		const next = planes && planes.length > 0 ? planes : null;
		if (next === clip) {
			return;
		}
		view.renderer.localClippingEnabled = true;
		for (const material of surfaceMaterials()) {
			material.clippingPlanes = next;
		}
		clip = next;
		skirt.skirtHide.value = clip !== null && surface !== null ? 1 : 0;
	}

	function setMode(next) {
		if (next === mode) {
			return;
		}
		const material = shared[next] ?? null;
		meshes.patchMeshes.forEach((mesh, i) => {
			mesh.material = material ?? materials.patchMaterials[i];
		});
		meshes.quadMeshes.forEach((mesh, i) => {
			mesh.material = material ?? materials.quadMaterials[i];
		});
		mode = next;
	}

	function setWireframe(on) {
		if (on === wireframe) {
			return;
		}
		if (on && !wires) {
			wires = meshes.patchMeshes.map((mesh) => {
				const wire = new THREE.Mesh(mesh.geometry, wireMaterial);
				mesh.add(wire);
				return wire;
			});
		}
		for (const wire of wires ?? []) {
			wire.visible = on;
		}
		wireframe = on;
	}

	function apply(look) {
		// The skirt's depth moves with the bounds (a slider raising the sea); one number a frame.
		if (surface !== null) {
			skirt.skirtY.value = surface.skirtY;
		}
		setMode(modeOf(look));
		if (mode === 'terms') {
			shared.terms.setTerms(look.terms);
		}
		setWireframe(look.wireframe);
		wireFade.value.set(look.wireFade[0], look.wireFade[1]);
		view.setFog(look.fog);
		const sun = look.sun;
		if (sun.azimuth !== sunAzimuth || sun.elevation !== sunElevation) {
			view.setStageSun(sunDirection(sun));
			// The view normalises the direction and keeps it in this array.
			shared.terms.setSun(view.sunDirection);
			sunAzimuth = sun.azimuth;
			sunElevation = sun.elevation;
		}
	}

	// What the meshes actually wear, read from them rather than from what apply last asked for:
	// 'mixed' if the patches and quads disagree.
	function meshMode() {
		const wearing = (mesh, i, painted) => {
			const found = MODES.find((name) => name !== 'painted' && mesh.material === shared[name]);
			return found ?? (mesh.material === painted[i] ? 'painted' : 'unknown');
		};
		const seen = new Set([
			...meshes.patchMeshes.map((mesh, i) => wearing(mesh, i, materials.patchMaterials)),
			...meshes.quadMeshes.map((mesh, i) => wearing(mesh, i, materials.quadMaterials)),
		]);
		return seen.size === 1 ? [...seen][0] : 'mixed';
	}

	// The wireframe meshes that are showing: attached to their patch and visible.
	function visibleWires() {
		return (wires ?? []).filter((wire, i) => wire.visible && wire.parent === meshes.patchMeshes[i]).length;
	}

	function probe() {
		const showing = visibleWires();
		return {
			mode: meshMode(),
			wireframe: showing === meshes.patchMeshes.length,
			wireMeshes: showing,
			fog: view.scene.fog.density,
			sun: [...view.sunDirection],
			environment: view.environmentState(),
			clipped: clip !== null,
			skirtsHidden: skirt.skirtHide.value === 1,
			wireFade: [wireFade.value.x, wireFade.value.y],
			terms: mode === 'terms' ? shared.terms.terms() : null,
			// A ShaderMaterial ignores clipping planes unless its `clipping` flag is on.
			termsClips: shared.terms.clipping === true && shared.terms.clippingPlanes === clip,
		};
	}

	return { apply, probe, setClip };
}
