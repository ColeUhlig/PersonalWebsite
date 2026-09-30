// One Three.js mesh per patch and per horizon quad, over the engine's own typed arrays: the
// position, normal and uv attributes ARE the Float32Arrays SurfaceSampler.fill writes, so the CPU
// write each frame is the whole vertex path (Roblox mode: no displacement shader). A mesh's
// vertices move every frame, so each gets an explicit bounding sphere large enough for the
// worst displacement the bounds allow, in place of the Roblox template's corner push-out.
// When a slider raises the sea the engine grows the bounds (A3); sync refits every sphere then.
import * as THREE from 'three';
import * as HorizonState from '../engine/horizonState.js';

function patchIndices(cells) {
	const perSide = cells + 1;
	const indices = [];
	for (let row = 0; row < cells; row++) {
		for (let column = 0; column < cells; column++) {
			const a = row * perSide + column;
			const b = a + 1;
			const c = a + perSide;
			const d = c + 1;
			indices.push(a, c, b, b, c, d);
		}
	}
	return indices;
}

function dynamic(array, itemSize) {
	const attribute = new THREE.BufferAttribute(array, itemSize);
	attribute.setUsage(THREE.DynamicDrawUsage);
	return attribute;
}

export function createOceanMeshes(scene, ocean, materials) {
	const { surface, horizon } = ocean;
	const cells = surface.layout.spec.patchCells;
	const indices = patchIndices(cells);
	const group = new THREE.Group();
	scene.add(group);

	const sphereRadius = (state) => {
		const reach = state.half + surface.bounds.lateral;
		return Math.hypot(reach, reach, surface.bounds.height);
	};
	let boundsVersion = surface.boundsVersion;

	const patchMeshes = surface.patches.map((state, i) => {
		const geometry = new THREE.BufferGeometry();
		geometry.setIndex(indices);
		geometry.setAttribute('position', dynamic(state.positions, 3));
		geometry.setAttribute('normal', dynamic(state.normals, 3));
		geometry.setAttribute('uv', dynamic(state.uvs, 2));
		geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), sphereRadius(state));
		const mesh = new THREE.Mesh(geometry, materials.patchMaterials[i]);
		mesh.position.set(state.worldX, 0, state.worldZ);
		group.add(mesh);
		return mesh;
	});

	const quadPositions = new Float32Array(HorizonState.CORNERS.flatMap(([x, z]) => [x * horizon.half, 0, z * horizon.half]));
	const quadNormals = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
	const quadMeshes = horizon.quads.map((quad, i) => {
		const geometry = new THREE.BufferGeometry();
		geometry.setIndex(HorizonState.TRIANGLES.flat());
		geometry.setAttribute('position', new THREE.BufferAttribute(quadPositions, 3));
		geometry.setAttribute('normal', new THREE.BufferAttribute(quadNormals, 3));
		geometry.setAttribute('uv', dynamic(quad.uvs, 2));
		geometry.computeBoundingSphere();
		const mesh = new THREE.Mesh(geometry, materials.quadMaterials[i]);
		mesh.position.set(quad.worldX, HorizonState.QUAD_Y, quad.worldZ);
		group.add(mesh);
		return mesh;
	});

	function sync() {
		if (surface.boundsVersion !== boundsVersion) {
			surface.patches.forEach((state, i) => {
				patchMeshes[i].geometry.boundingSphere.radius = sphereRadius(state);
			});
			boundsVersion = surface.boundsVersion;
		}
		const flat = surface.flatNormals;
		const patches = surface.patches;
		for (let i = 0; i < patches.length; i++) {
			const state = patches[i];
			const mesh = patchMeshes[i];
			mesh.visible = !state.hidden;
			if (state.written) {
				mesh.geometry.attributes.position.needsUpdate = true;
				if (!flat) mesh.geometry.attributes.normal.needsUpdate = true;
				state.written = false;
			}
			if (state.uvsChanged) {
				mesh.geometry.attributes.uv.needsUpdate = true;
				mesh.position.set(state.worldX, 0, state.worldZ);
				state.uvsChanged = false;
			}
		}
		const quads = horizon.quads;
		for (let i = 0; i < quads.length; i++) {
			const quad = quads[i];
			if (quad.uvsChanged) {
				quadMeshes[i].geometry.attributes.uv.needsUpdate = true;
				quadMeshes[i].position.set(quad.worldX, HorizonState.QUAD_Y, quad.worldZ);
				quad.uvsChanged = false;
			}
		}
	}

	return { sync, patchMeshes, quadMeshes };
}
