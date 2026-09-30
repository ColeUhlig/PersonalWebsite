import { defineConfig } from '@playwright/test';

// Browser tests for the ocean page. Headless Chromium renders WebGL through SwiftShader, which is
// slow but deterministic: these tests check behaviour and that pixels appear, never frame rates.
// OCEAN_PORT picks the test server's port (default 8767), so two worktrees can test side by side.
const PORT = process.env.OCEAN_PORT || '8767';

export default defineConfig({
	testDir: 'tests/ocean/e2e',
	timeout: 90_000,
	expect: { timeout: 30_000 },
	workers: 1,
	use: {
		baseURL: `http://localhost:${PORT}`,
		viewport: { width: 1366, height: 767 },
		launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
	},
	webServer: {
		command: `python3 -m http.server ${PORT} --directory content`,
		url: `http://localhost:${PORT}/ocean/`,
		reuseExistingServer: true,
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
