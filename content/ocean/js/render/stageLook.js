// The look a stage recipe asks for, applied to the ocean's meshes (A3; not a twin): which material
// the surface wears -- flat white (step 1's plane and the unlit steps 2 and 3), the sea colour lit by
// the sun and the sky (steps 4 to 6) or unlit (step 4 with its shading off), or the painted
// Roblox-mode materials (step 7 on) -- the wireframe over it, the fog and the sun. A material
// change swaps the meshes' material references; nothing is rebuilt, and the painted materials keep
// their textures and glow for when they come back. The wireframe is one extra mesh per patch,
// sharing the patch's geometry as its child (so it moves and hides with it), built the first time
// it is asked for and hidden, not removed, when it is switched off. The horizon quads get the
// material but no wireframe: two triangles 2,048 studs wide would draw one huge diagonal.
import * as THREE from 'three';
import { sunDirection } from '../stages/sun.js';

const WHITE = Object.freeze([0.95, 0.95, 0.94]);
const WIRE = Object.freeze([0.11, 0.17, 0.21]);
const WIRE_OPACITY = 0.55;
// The lit sea's roughness: shiny enough for the sun's highlight and the sky's Fresnel to read on
// the Gerstner waves of steps 4 to 6.
const SEA_ROUGHNESS = 0.3;
const MODES = Object.freeze(['white', 'sea-lit', 'sea-flat', 'painted']);

const srgb = (rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);

// The unpainted sea's colour: the painted map's own mix, deep water tinted towards the subsurface
// colour by the tint (config.deep, config.subsurface, config.tint).
function seaColour(config) {
	const mix = (i) => (config.deep[i] + (config.subsurface[i] - config.deep[i]) * config.tint) / 255;
	return srgb([mix(0), mix(1), mix(2)]);
}

function modeOf(look) {
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
	};
	const wireMaterial = new THREE.MeshBasicMaterial({ color: srgb(WIRE), wireframe: true, transparent: true, opacity: WIRE_OPACITY, toneMapped: false });
	let mode = 'painted';
	let wires = null;
	let wireframe = false;
	let sunKey = '';

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
		const key = `${look.sun.azimuth}|${look.sun.elevation}`;
		if (key !== sunKey) {
			view.setStageSun(sunDirection(look.sun));
			sunKey = key;
		}
	}

	function probe() {
		return { mode, wireframe, fog: view.scene.fog.density, sun: [...view.sunDirection], wireMeshes: wires ? wires.length : 0 };
	}

	return { apply, probe };
}
