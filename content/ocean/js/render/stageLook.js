// The look a stage recipe asks for, applied to the ocean's meshes (A3; not a twin): which material
// the surface wears -- flat white (step 1's plane and the unlit steps 2 and 3), the sea colour lit by
// the sun and the sky (steps 4 to 6) or unlit (step 4 with its shading off), or the painted
// Roblox-mode materials (step 7 on) -- the wireframe over it, the fog and the sun. A material
// change swaps the meshes' material references; nothing is rebuilt, and the painted materials keep
// their textures and glow for when they come back. The wireframe is one extra mesh per patch,
// sharing the patch's geometry as its child (so it moves and hides with it), built the first time
// it is asked for and hidden, not removed, when it is switched off; it fades out with view depth
// (WIRE_FADE) so the far grid does not crowd into moire. The horizon quads get the
// material but no wireframe: two triangles 2,048 studs wide would draw one huge diagonal.
// C2: the `terms` material (a stand-in until lane D's) and `setClip`, which clips every surface
// material to the flat graph's band.
import * as THREE from 'three';
import { sunDirection } from '../stages/sun.js';

const WHITE = Object.freeze([0.95, 0.95, 0.94]);
const WIRE = Object.freeze([0.11, 0.17, 0.21]);
const WIRE_OPACITY = 0.55;
// View depths (studs) over which the wireframe fades out (fix round 1). Past a few hundred studs the
// grid's lines crowd into grey moire bands that read as swells on step 1's flat plane; the fade keeps
// the 8-stud ring's grid readable (its far edge sits about 300 studs from step 1's camera).
const WIRE_FADE = Object.freeze([120, 360]);
// The lit sea's roughness: shiny enough for the sun's highlight and the sky's Fresnel to read on
// the Gerstner waves of steps 4 to 6.
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

export function createStageLook({ view, meshes, materials, config }) {
	const sea = seaColour(config);
	const shared = {
		// Pushed back a little in depth so the wireframe drawn at the same depth sits on top of it.
		white: new THREE.MeshBasicMaterial({ color: srgb(WHITE), toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
		'sea-lit': new THREE.MeshStandardMaterial({ color: sea, roughness: SEA_ROUGHNESS, metalness: 0 }),
		'sea-flat': new THREE.MeshBasicMaterial({ color: sea }),
		// C2: lane D replaces this stand-in with the term-by-term material (render/termsMaterial.js).
		terms: new THREE.MeshStandardMaterial({ color: sea, roughness: SEA_ROUGHNESS, metalness: 0 }),
	};
	const wireMaterial = new THREE.MeshBasicMaterial({ color: srgb(WIRE), wireframe: true, transparent: true, opacity: WIRE_OPACITY, toneMapped: false });
	wireMaterial.onBeforeCompile = (shader) => {
		shader.uniforms.wireFade = { value: new THREE.Vector2(WIRE_FADE[0], WIRE_FADE[1]) };
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
		setMode(modeOf(look));
		setWireframe(look.wireframe);
		view.setFog(look.fog);
		const sun = look.sun;
		if (sun.azimuth !== sunAzimuth || sun.elevation !== sunElevation) {
			view.setStageSun(sunDirection(sun));
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
			terms: null,
		};
	}

	return { apply, probe, setClip };
}
