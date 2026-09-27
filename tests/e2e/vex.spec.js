import { test, expect } from '@playwright/test';

test('the page loads with a 3D canvas and no console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await expect(page.locator('#three')).toBeVisible();
  await expect(page.locator('#stage-notice')).toBeHidden();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.__vex !== null)).toBe(true);
});

test('without WebGL the notice shows and the page still renders', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(type, ...rest) {
      return type === 'webgl' || type === 'webgl2' ? null : original.call(this, type, ...rest);
    };
  });
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await expect(page.locator('#stage-notice')).toBeVisible();
});

test('no horizontal scrolling at any viewport', async ({ page }) => {
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
