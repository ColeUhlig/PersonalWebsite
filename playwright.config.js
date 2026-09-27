import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  webServer: {
    command: 'npx http-server content -p 8766 -s -c-1',
    url: 'http://127.0.0.1:8766/vex/',
    reuseExistingServer: true,
  },
  use: { baseURL: 'http://127.0.0.1:8766' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
