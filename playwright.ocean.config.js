import { defineConfig } from '@playwright/test';

// Browser tests for the ocean page. Headless Chromium draws WebGL on the machine's GPU through ANGLE's
// Metal backend (about 60 fps on an M4, against about 1 fps on SwiftShader). OCEAN_GL=swiftshader
// switches back to the CPU renderer, for a machine without a usable GPU. These tests check behaviour
// and that pixels appear, never frame rates.
// OCEAN_PORT picks the test server's port (default 8767), so two worktrees can test side by side.
// A server already on that port is reused only when OCEAN_REUSE_SERVER=1; otherwise Playwright fails
// loudly, so a run never tests another tree's content/ by accident.
const PORT = process.env.OCEAN_PORT || '8767';
const GL_ARGS = process.env.OCEAN_GL === 'swiftshader'
	? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
	: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

export default defineConfig({
	testDir: 'tests/ocean/e2e',
	timeout: 90_000,
	expect: { timeout: 30_000 },
	workers: 1,
	use: {
		baseURL: `http://localhost:${PORT}`,
		viewport: { width: 1366, height: 767 },
		launchOptions: { args: GL_ARGS },
	},
	webServer: {
		command: `python3 -m http.server ${PORT} --directory content`,
		url: `http://localhost:${PORT}/ocean/`,
		reuseExistingServer: process.env.OCEAN_REUSE_SERVER === '1',
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
