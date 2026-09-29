import { defineConfig } from '@playwright/test';

// Browser tests for the ocean page. Headless Chromium renders WebGL through SwiftShader, which is
// slow but deterministic: these tests check behaviour and that pixels appear, never frame rates.
export default defineConfig({
	testDir: 'tests/ocean/e2e',
	timeout: 90_000,
	expect: { timeout: 30_000 },
	workers: 1,
	use: {
		baseURL: 'http://localhost:8767',
		viewport: { width: 1366, height: 767 },
		launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
	},
	webServer: {
		command: 'python3 -m http.server 8767 --directory content',
		url: 'http://localhost:8767/ocean/',
		reuseExistingServer: true,
	},
	projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
