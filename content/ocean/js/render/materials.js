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
import { BAND_ROWS, COLOUR_TEXELS, MAP_TEXELS, NORMAL_BLOCK_TEXELS, NORMAL_IMAGE_TEXELS } from '../engine/config.js';
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
	// A ring's roughness at rest: its base everywhere, as no foam leaves it.
	const restRoughness = (texture, i) => {
		const base = config.roughness[Math.min(i + 1, config.roughness.length) - 1];
		FoamRoughness.fill(texture.image.data, MAP_TEXELS, coverage, base, base);
		texture.needsUpdate = true;
	};
	const roughness = Array.from({ length: ringCount }, (_, i) => {
		const texture = dataTexture(MAP_TEXELS, [0, 0, 0], THREE.NoColorSpace, anisotropy);
		restRoughness(texture, i);
		return texture;
	});
	const emissive = new THREE.Color().setRGB(config.subsurface[0] / 255, config.subsurface[1] / 255, config.subsurface[2] / 255, THREE.SRGBColorSpace);
	// ONE Vector2 for every material: the constructor would copy it into a vector of each material's
	// own, so it is assigned after. The renderer copies it into the uniform on every draw, so
	// setNormalScale reaches all 232 materials at once and recompiles nothing.
	const normalScale = new THREE.Vector2(1, Lighting.NORMAL_SCALE_Y);
	const make = (ring) => {
		const material = new THREE.MeshStandardMaterial({
			map: colour,
			normalMap: normal,
			roughnessMap: roughness[ring - 1],
			roughness: 1,
			metalness: 0,
			emissive,
			emissiveMap: mask,
			emissiveIntensity: 0,
		});
		material.normalScale = normalScale;
		return material;
	};
	const patchMaterials = ocean.surface.patches.map((state) => make(state.ring));
	const quadMaterials = ocean.horizon.quads.map(() => make(ringCount));
	const counts = { colour: 0, mask: 0, normal: 0, roughness: 0 };
	// The sizes the painter's buffers must have, checked as Materials.luau checks them: a short
	// buffer would be a torn image rather than an error anyone could see. The normal block is the
	// whole image under ?calibrate=map (the painter paints all 512 texels there) and the 128-texel
	// block that tiles into it otherwise.
	const bandBytes = COLOUR_TEXELS * BAND_ROWS * 4;
	const mapBytes = MAP_TEXELS * MAP_TEXELS * 4;
	const blockTexels = config.calibrate === 'map' ? NORMAL_IMAGE_TEXELS : NORMAL_BLOCK_TEXELS;
	const blockBytes = blockTexels * blockTexels * 4;

	const sink = {
		uploadColourBand(band, pixels) {
			if (pixels.byteLength !== bandBytes) {
				throw new Error(`colour band ${band} was given ${pixels.byteLength} bytes, expected ${bandBytes}`);
			}
			colour.image.data.set(pixels, (band - 1) * BAND_ROWS * COLOUR_TEXELS * 4);
			colour.needsUpdate = true;
			counts.colour += 1;
		},
		uploadMaskOrNormal(slot, pixels) {
			if (slot === MapRotation.MASK) {
				if (pixels.byteLength !== mapBytes) {
					throw new Error(`the emissive mask was given ${pixels.byteLength} bytes, expected ${mapBytes}`);
				}
				mask.image.data.set(pixels);
				mask.needsUpdate = true;
				counts.mask += 1;
			} else if (slot === MapRotation.NORMAL) {
				if (pixels.byteLength !== blockBytes) {
					throw new Error(`the normal block was given ${pixels.byteLength} bytes, expected ${blockBytes}`);
				}
				// A block the size of the image tiles as one copy.
				NormalTexels.tile(pixels, blockTexels, normal.image.data, NORMAL_IMAGE_TEXELS);
				normal.needsUpdate = true;
				counts.normal += 1;
			} else {
				throw new Error(`uploadMaskOrNormal was given an unknown map slot: ${slot}`);
			}
		},
		uploadRoughness(ring, pixels) {
			if (pixels.byteLength !== mapBytes) {
				throw new Error(`ring ${ring} roughness was given ${pixels.byteLength} bytes, expected ${mapBytes}`);
			}
			roughness[ring - 1].image.data.set(pixels);
			roughness[ring - 1].needsUpdate = true;
			counts.roughness += 1;
		},
		// A3 (PainterClient.update): the painter has no cascade left for the normal map, so the last
		// ripples must not stay on the water: back to flat.
		clearNormal() {
			const data = normal.image.data;
			for (let i = 0; i < data.length; i += 4) {
				data[i] = 128;
				data[i + 1] = 128;
				data[i + 2] = 255;
				data[i + 3] = 255;
			}
			normal.needsUpdate = true;
		},
		// A3: the foam was switched off, so every ring's roughness goes back to its base.
		resetRoughness() {
			roughness.forEach(restRoughness);
		},
	};

	function applyStrengths(strengths) {
		const patchCount = patchMaterials.length;
		for (let i = 0; i < patchCount; i++) patchMaterials[i].emissiveIntensity = strengths[i] * Lighting.EMISSIVE_SCALE;
		for (let i = 0; i < quadMaterials.length; i++) quadMaterials[i].emissiveIntensity = strengths[patchCount + i] * Lighting.EMISSIVE_SCALE;
	}

	// A test hook for the calibration: the painted normal map off (0, 0) or read with either sign.
	function setNormalScale(x, y) {
		normalScale.set(x, y);
	}

	function probe() {
		const data = colour.image.data;
		const distinct = new Set();
		for (let i = 0; i < data.length; i += 4 * 97) distinct.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
		const all = [...patchMaterials, ...quadMaterials];
		return {
			colourUploads: counts.colour,
			maskUploads: counts.mask,
			normalUploads: counts.normal,
			roughnessUploads: counts.roughness,
			maxEmissiveIntensity: Math.max(...all.map((m) => m.emissiveIntensity)),
			distinctColourTexels: distinct.size,
			materialCount: all.length,
			colourBound: all.every((m) => m.map === colour),
			normalBound: all.every((m) => m.normalMap === normal),
			maskBound: all.every((m) => m.emissiveMap === mask),
			roughnessBound:
				patchMaterials.every((m, i) => m.roughnessMap === roughness[ocean.surface.patches[i].ring - 1]) &&
				quadMaterials.every((m) => m.roughnessMap === roughness[ringCount - 1]),
			normalScaleShared: all.every((m) => m.normalScale === normalScale),
			normalScale: [normalScale.x, normalScale.y],
		};
	}

	return { patchMaterials, quadMaterials, sink, applyStrengths, setNormalScale, probe, textures: { colour, mask, normal, roughness } };
}
