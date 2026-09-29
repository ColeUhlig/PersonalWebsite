// The renderer, camera, sun, ambient light, sky and fog: the Studio place's Lighting and Atmosphere
// approximated in Three.js (values in lighting.js).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import * as Lighting from './lighting.js';

const srgb = (rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);

export function createScene(canvas) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = Lighting.EXPOSURE;
	canvas.style.filter = Lighting.CSS_FILTER;

	const scene = new THREE.Scene();
	scene.fog = new THREE.FogExp2(srgb(Lighting.FOG_COLOUR), Lighting.FOG_DENSITY);
	const camera = new THREE.PerspectiveCamera(Lighting.FIELD_OF_VIEW, 1, 0.5, 9000);

	const sunDirection = new THREE.Vector3(...Lighting.SUN_DIRECTION).normalize();
	const sun = new THREE.DirectionalLight(srgb(Lighting.SUN_COLOUR), Lighting.SUN_INTENSITY);
	sun.position.copy(sunDirection).multiplyScalar(1000);
	scene.add(sun, sun.target);
	scene.add(new THREE.HemisphereLight(srgb(Lighting.SKY_AMBIENT), srgb(Lighting.GROUND_AMBIENT), Lighting.AMBIENT_INTENSITY));

	const sky = new Sky();
	sky.scale.setScalar(8000);
	const uniforms = sky.material.uniforms;
	uniforms.turbidity.value = Lighting.SKY.turbidity;
	uniforms.rayleigh.value = Lighting.SKY.rayleigh;
	uniforms.mieCoefficient.value = Lighting.SKY.mieCoefficient;
	uniforms.mieDirectionalG.value = Lighting.SKY.mieDirectionalG;
	uniforms.sunPosition.value.copy(sunDirection);
	scene.add(sky);

	// Environment reflections from the same sky (Roblox EnvironmentSpecularScale 1).
	const pmrem = new THREE.PMREMGenerator(renderer);
	const environmentScene = new THREE.Scene();
	const environmentSky = new Sky();
	environmentSky.scale.setScalar(8000);
	Object.assign(environmentSky.material.uniforms, THREE.UniformsUtils.clone(uniforms));
	environmentScene.add(environmentSky);
	const environment = pmrem.fromScene(environmentScene).texture;
	scene.environment = environment;
	pmrem.dispose();

	// The direction the engine is handed each frame: setSun rewrites it in place, so the caller's
	// reference follows.
	const sunArray = sunDirection.toArray();
	// A test hook for the calibration (tests/ocean/e2e/materials.spec.js): moves the DirectionalLight
	// and the engine's sun vector to `direction`. The sky and its environment reflections keep the
	// place's sun; nothing in the shipped page calls this.
	function setSun(direction) {
		const v = new THREE.Vector3(...direction);
		const length = v.length();
		if (!Number.isFinite(length) || length === 0 || direction.length !== 3) {
			throw new Error(`setSun needs a non-zero 3-vector, got ${JSON.stringify(direction)}`);
		}
		v.divideScalar(length);
		sun.position.copy(v).multiplyScalar(1000);
		v.toArray(sunArray);
	}

	// A test hook for the calibration: the sky's environment reflections off (false) or back (true).
	// They keep the place's sun lobe off along -x whatever setSun does, so the calibration takes
	// them out; the shipped page keeps them.
	function setEnvironment(enabled) {
		scene.environment = enabled ? environment : null;
	}

	function resize() {
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, Lighting.MAX_PIXEL_RATIO));
		renderer.setSize(width, height, false);
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
	}

	return {
		renderer,
		scene,
		camera,
		sunDirection: sunArray,
		setSun,
		setEnvironment,
		resize,
		render: () => renderer.render(scene, camera),
	};
}
