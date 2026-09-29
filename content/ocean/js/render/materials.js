// Twin of Materials.luau: one image set shared by every surface material, one material per patch
// and per horizon quad (232 on the High tier), each with its own emissive intensity from the glow
// lobe. The images are data textures the CPU rewrites: the colour map a band of rows at a time, the
// mask and the normal image whole, one roughness map per ring. They start at resting contents
// (deep water, an empty mask, a flat normal, the ring's base roughness) so nothing renders white
// before the painter's first pixels land.
import * as THREE from 'three';
import * as FoamRoughness from '../core/foamRoughness.js';
import * as MapRotation from '../core/mapRotation.js';
import * as NormalTexels from '../core/normalTexels.js';
import { BAND_ROWS, COLOUR_TEXELS, MAP_TEXELS, NORMAL_IMAGE_TEXELS } from '../engine/config.js';
import * as Lighting from './lighting.js';

function dataTexture(texels, fill, colourSpace, anisotropy) {
	const data = new Uint8Array(texels * texels * 4);
	for (let i = 0; i < data.length; i += 4) {
		data[i] = fill[0];
		data[i + 1] = fill[1];
		data[i + 2] = fill[2];
		data[i + 3] = 255;
	}
	const texture = new THREE.DataTexture(data, texels, texels, THREE.RGBAFormat);
	texture.colorSpace = colourSpace;
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.magFilter = THREE.LinearFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.anisotropy = anisotropy;
	texture.needsUpdate = true;
	return texture;
}

export function createMaterials(ocean, renderer) {
	const { config, preset } = ocean;
	const anisotropy = renderer.capabilities.getMaxAnisotropy();
	const colour = dataTexture(COLOUR_TEXELS, config.deep, THREE.SRGBColorSpace, anisotropy);
	const mask = dataTexture(MAP_TEXELS, [0, 0, 0], THREE.NoColorSpace, anisotropy);
	const normal = dataTexture(NORMAL_IMAGE_TEXELS, [128, 128, 255], THREE.NoColorSpace, anisotropy);
	const coverage = new Float32Array(MAP_TEXELS * MAP_TEXELS);
	const ringCount = preset.rings.length;
	const roughness = Array.from({ length: ringCount }, (_, i) => {
		const base = config.roughness[Math.min(i + 1, config.roughness.length) - 1];
		const texture = dataTexture(MAP_TEXELS, [0, 0, 0], THREE.NoColorSpace, anisotropy);
		FoamRoughness.fill(texture.image.data, MAP_TEXELS, coverage, base, base);
		texture.needsUpdate = true;
		return texture;
	});
	const emissive = new THREE.Color().setRGB(config.subsurface[0] / 255, config.subsurface[1] / 255, config.subsurface[2] / 255, THREE.SRGBColorSpace);
	const normalScale = new THREE.Vector2(1, Lighting.NORMAL_SCALE_Y);
	const make = (ring) =>
		new THREE.MeshStandardMaterial({
			map: colour,
			normalMap: normal,
			normalScale,
			roughnessMap: roughness[ring - 1],
			roughness: 1,
			metalness: 0,
			emissive,
			emissiveMap: mask,
			emissiveIntensity: 0,
		});
	const patchMaterials = ocean.surface.patches.map((state) => make(state.ring));
	const quadMaterials = ocean.horizon.quads.map(() => make(ringCount));
	const counts = { colour: 0, mask: 0, normal: 0, roughness: 0 };

	const sink = {
		uploadColourBand(band, pixels) {
			colour.image.data.set(pixels, (band - 1) * BAND_ROWS * COLOUR_TEXELS * 4);
			colour.needsUpdate = true;
			counts.colour += 1;
		},
		uploadMaskOrNormal(slot, pixels) {
			if (slot === MapRotation.MASK) {
				mask.image.data.set(pixels);
				mask.needsUpdate = true;
				counts.mask += 1;
			} else if (slot === MapRotation.NORMAL) {
				const blockTexels = Math.round(Math.sqrt(pixels.length / 4));
				if (blockTexels === NORMAL_IMAGE_TEXELS) {
					normal.image.data.set(pixels);
				} else {
					NormalTexels.tile(pixels, blockTexels, normal.image.data, NORMAL_IMAGE_TEXELS);
				}
				normal.needsUpdate = true;
				counts.normal += 1;
			} else {
				throw new Error(`uploadMaskOrNormal was given an unknown map slot: ${slot}`);
			}
		},
		uploadRoughness(ring, pixels) {
			roughness[ring - 1].image.data.set(pixels);
			roughness[ring - 1].needsUpdate = true;
			counts.roughness += 1;
		},
	};

	function applyStrengths(strengths) {
		const patchCount = patchMaterials.length;
		for (let i = 0; i < patchCount; i++) patchMaterials[i].emissiveIntensity = strengths[i] * Lighting.EMISSIVE_SCALE;
		for (let i = 0; i < quadMaterials.length; i++) quadMaterials[i].emissiveIntensity = strengths[patchCount + i] * Lighting.EMISSIVE_SCALE;
	}

	function probe() {
		const data = colour.image.data;
		const distinct = new Set();
		for (let i = 0; i < data.length; i += 4 * 97) distinct.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
		return {
			colourUploads: counts.colour,
			maskUploads: counts.mask,
			normalUploads: counts.normal,
			roughnessUploads: counts.roughness,
			maxEmissiveIntensity: Math.max(...patchMaterials.map((m) => m.emissiveIntensity)),
			distinctColourTexels: distinct.size,
		};
	}

	return { patchMaterials, quadMaterials, sink, applyStrengths, probe, textures: { colour, mask, normal, roughness } };
}
