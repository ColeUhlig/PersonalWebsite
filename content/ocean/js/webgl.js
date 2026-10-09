// Whether this browser can run the live ocean (moved here from main.js by piece C, so boot.js can
// ask before it loads anything from a CDN). No imports.
// three@0.186's WebGLRenderer asks for WebGL 2 only and throws without it, so WebGL 1 does not count.
export function webglSupported() {
	try {
		const probe = document.createElement('canvas');
		const gl = probe.getContext('webgl2');
		// Give the probe's context back now rather than at garbage collection: browsers cap live
		// contexts, and the renderer's own is next.
		gl?.getExtension('WEBGL_lose_context')?.loseContext();
		return Boolean(gl);
	} catch {
		return false;
	}
}
