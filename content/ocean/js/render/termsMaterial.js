// The lighting terms as a material (piece C2; lane D owns this file; spec 10.6): page/lightTerms.js's
// arithmetic in GLSL, line for line (tests/ocean/e2e/lightTerms.spec.js reads one fragment back and
// holds it to the reference), so each term the math box shows switches on alone on the screen: with
// all off the flat sea colour; the water's own colour c_d = c_sea (a + k_sun max(0, n.s)) with the sky
// ambient; the Blinn-Phong highlight c_s = k_spec (n.h)^p, added to it while Fresnel is off; and
// with Fresnel on, c = (1 - F) c_d + F (c_s + c_sky), Schlick's F weighting the sun's glint and the
// sky together. c_sky is a two-colour gradient (horizon to zenith) by the reflected ray's height,
// not the scene's sky: sampling the PMREM environment from a ShaderMaterial would mean copying
// three's cube-UV defines and following each rebuild when the stage sun settles, for a teaching
// step that only needs to show where the sky enters. It reads the vertex normals the engine writes
// from the waves' exact slopes (stageControl.js writes them for 'terms'), takes the scene's fog, and
// clips like every other surface material (clipping: true, so the stage look's setClip reaches
// it). Only the teaching steps wear it; the painted Roblox-mode materials are never touched. It
// demonstrates the terms in the browser only: Roblox scripts cannot write shaders, so the Roblox
// build gets these terms from the engine's own lighting, not from this.
import * as THREE from 'three';
import * as Lighting from './lighting.js';
import { TERMS } from '../page/lightTerms.js';

const srgb = (rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);

const vertexShader = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
	vec4 world = modelMatrix * vec4(position, 1.0);
	vWorld = world.xyz;
	vNormalW = normalize(mat3(modelMatrix) * normal);
	vec4 mvPosition = viewMatrix * world;
	gl_Position = projectionMatrix * mvPosition;
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
#include <clipping_planes_pars_fragment>
uniform vec3 seaColour;
uniform vec3 sunDirection;
uniform vec3 sunColour;
uniform vec3 ambientSky;
uniform vec3 ambientGround;
uniform float ambientStrength;
uniform float sunStrength;
uniform vec3 skyHorizon;
uniform vec3 skyZenith;
uniform float shininess;
uniform float specularStrength;
uniform float f0;
uniform vec3 terms;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
	#include <clipping_planes_fragment>
	vec3 n = normalize(vNormalW);
	vec3 v = normalize(cameraPosition - vWorld);
	vec3 s = normalize(sunDirection);
	vec3 diffuse = seaColour;
	if (terms.x > 0.5) {
		vec3 ambient = mix(ambientGround, ambientSky, 0.5 + 0.5 * n.y) * ambientStrength;
		diffuse = seaColour * (ambient + sunColour * sunStrength * max(dot(n, s), 0.0));
	}
	vec3 specular = vec3(0.0);
	if (terms.y > 0.5) {
		vec3 h = normalize(s + v);
		specular = sunColour * specularStrength * pow(max(dot(n, h), 0.0), shininess);
	}
	vec3 colour = diffuse + specular;
	if (terms.z > 0.5) {
		float F = f0 + (1.0 - f0) * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
		vec3 r = reflect(-v, n);
		vec3 sky = mix(skyHorizon, skyZenith, clamp(r.y, 0.0, 1.0));
		colour = (1.0 - F) * diffuse + F * (specular + sky);
	}
	gl_FragColor = vec4(colour, 1.0);
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}
`;

export function createTermsMaterial({ seaColour, sunDirection }) {
	const uniforms = THREE.UniformsUtils.merge([
		THREE.UniformsLib.fog,
		{
			seaColour: { value: seaColour.clone() },
			sunDirection: { value: new THREE.Vector3(sunDirection[0], sunDirection[1], sunDirection[2]) },
			sunColour: { value: srgb(Lighting.SUN_COLOUR) },
			ambientSky: { value: srgb(Lighting.SKY_AMBIENT) },
			ambientGround: { value: srgb(Lighting.GROUND_AMBIENT) },
			ambientStrength: { value: TERMS.ambient },
			sunStrength: { value: TERMS.sun },
			skyHorizon: { value: srgb(Lighting.FOG_COLOUR) },
			skyZenith: { value: srgb(TERMS.zenith) },
			shininess: { value: TERMS.shininess },
			specularStrength: { value: TERMS.specular },
			f0: { value: TERMS.f0 },
			terms: { value: new THREE.Vector3(1, 1, 1) },
		},
	]);
	const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, fog: true, clipping: true });
	material.setTerms = ({ diffuse, specular, fresnel }) => {
		uniforms.terms.value.set(diffuse ? 1 : 0, specular ? 1 : 0, fresnel ? 1 : 0);
	};
	material.setSun = (direction) => {
		uniforms.sunDirection.value.set(direction[0], direction[1], direction[2]);
	};
	material.terms = () => {
		const t = uniforms.terms.value;
		return { diffuse: t.x > 0.5, specular: t.y > 0.5, fresnel: t.z > 0.5 };
	};
	return material;
}
