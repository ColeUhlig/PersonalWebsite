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

test('the explainer survives a full scroll through every beat in both directions', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/vex/', { waitUntil: 'networkidle' });

  const beats = page.locator('.beat');
  const count = await beats.count();
  expect(count).toBe(12);
  const order = [...Array(count).keys()];
  for (const i of [...order, ...order.reverse()]) {
    await page.evaluate((k) => document.querySelectorAll('.beat')[k].scrollIntoView({ block: 'center' }), i);
    await page.waitForTimeout(150);
    await expect(beats.nth(i).locator('h1, h2, h3').first()).toBeInViewport();
  }
  expect(errors).toEqual([]);
});

test('the odometry chapter is active on load', async ({ page }) => {
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  expect(await page.evaluate(() => window.__vex.story.active().id)).toBe('odometry');
});

test('the try-it panel drives the robot with the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#tryit-odometry').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const before = await page.textContent('#odom-readout');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyW');
  const after = await page.textContent('#odom-readout');
  expect(after).not.toBe(before);
});

test('changing the sensor setup resets the run', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#tryit-odometry').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const start = await page.textContent('#odom-readout');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  expect(await page.textContent('#odom-readout')).not.toBe(start);
  await page.selectOption('#odom-setup', 'twoWheelImu');
  await page.waitForTimeout(100);
  expect(await page.textContent('#odom-readout')).toBe(start);
});

test('without WebGL the notice shows and the story text is still readable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(type, ...rest) {
      return type === 'webgl' || type === 'webgl2' ? null : original.call(this, type, ...rest);
    };
  });
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await expect(page.locator('#stage-notice')).toBeVisible();
  await expect(page.locator('.beat h1').first()).toBeVisible();
});

test('resizing during a top-down beat keeps the canvases matched to the stage', async ({ page, isMobile }) => {
  test.skip(isMobile, 'viewport is fixed on the mobile project');
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelectorAll('.beat')[5].scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(300);
  const sizes = await page.evaluate(() => {
    const stage = document.getElementById('stage');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return { stage: [stage.clientWidth, stage.clientHeight], three: [document.getElementById('three').width, document.getElementById('three').height], overlay: [document.getElementById('overlay').width, document.getElementById('overlay').height], dpr };
  });
  expect(sizes.three).toEqual([Math.round(sizes.stage[0] * sizes.dpr), Math.round(sizes.stage[1] * sizes.dpr)]);
  expect(sizes.overlay).toEqual(sizes.three);
});

test('no horizontal scrolling at any viewport', async ({ page }) => {
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
