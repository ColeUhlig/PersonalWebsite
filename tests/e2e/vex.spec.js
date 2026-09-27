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

test('arrow keys still operate the panel\'s own controls', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#tryit-odometry').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const before = await page.textContent('#odom-readout');
  await page.focus('#odom-noise');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  expect(await page.inputValue('#odom-noise')).toBe('0.5');
  expect(await page.textContent('#odom-readout')).toBe(before);
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

test('without WebGL the notice shows and the story text and formulas are still readable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function patched(type, ...rest) {
      return type === 'webgl' || type === 'webgl2' ? null : original.call(this, type, ...rest);
    };
  });
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await expect(page.locator('#stage-notice')).toBeVisible();
  await expect(page.locator('.beat h1').first()).toBeVisible();
  for (const id of ['f-heading', 'f-chord', 'f-rotate']) {
    expect((await page.locator(`#${id}`).innerHTML()).length, `${id} rendered`).toBeGreaterThan(0);
  }
});

// Scrolls so that beat `k` sits at a given fraction of its own scroll range, then settles.
async function scrollWithinBeat(page, k, fraction) {
  await page.evaluate(([k, f]) => {
    const beat = document.querySelectorAll('.beat')[k];
    const top = beat.getBoundingClientRect().top + window.scrollY;
    const start = top - window.innerHeight * 0.65;
    window.scrollTo(0, start + f * beat.offsetHeight);
  }, [k, fraction]);
  await page.waitForTimeout(200);
}

test('scrolling through a beat drives its progress all the way to the end', async ({ page, isMobile }) => {
  test.skip(isMobile, 'trigger geometry is viewport-independent, and the fine sweep is too slow under software rendering at phone pixel density');
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  let maxLocal = 0;
  const { start, span } = await page.evaluate(() => {
    const beat = document.querySelectorAll('.beat')[5];
    const top = beat.getBoundingClientRect().top + window.scrollY;
    return { start: top - window.innerHeight, span: beat.offsetHeight + window.innerHeight };
  });
  for (let y = start; y <= start + span; y += 20) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(30);
    const view = await page.evaluate(() => window.__vex.story.active()._view);
    if (view.beat === 5) maxLocal = Math.max(maxLocal, view.local);
  }
  expect(maxLocal).toBeGreaterThan(0.95);
});

test('the close-up beat makes the chassis see-through', async ({ page }) => {
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await scrollWithinBeat(page, 2, 0.7);
  const opacity = await page.evaluate(() => window.__vex.robot.parts.chassis.material.opacity);
  expect(opacity).toBeLessThan(0.6);
});

test('the flatten beat scrubs the camera from perspective to top-down', async ({ page }) => {
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await scrollWithinBeat(page, 3, 0.5);
  const mid = await page.evaluate(() => window.__vex.camera.state.topdown);
  expect(mid).toBeGreaterThan(0.1);
  expect(mid).toBeLessThan(0.9);
  await scrollWithinBeat(page, 3, 0.98);
  expect(await page.evaluate(() => window.__vex.camera.state.topdown)).toBeGreaterThan(0.95);
});

test('the sideways-offset beat keeps the robot still', async ({ page }) => {
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await scrollWithinBeat(page, 9, 0.2);
  const a = await page.evaluate(() => window.__vex.story.active()._frame.truth);
  await scrollWithinBeat(page, 9, 0.8);
  const b = await page.evaluate(() => window.__vex.story.active()._frame.truth);
  expect(b).toEqual(a);
});

test('the try-it panel has a reset button and resets when the robot leaves the field', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#tryit-odometry').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const start = await page.textContent('#odom-readout');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  expect(await page.textContent('#odom-readout')).not.toBe(start);
  await page.click('#odom-reset');
  await page.waitForTimeout(100);
  expect(await page.textContent('#odom-readout')).toBe(start);
  // Drive off the top of the field (72" from the start at 60 in/s) and keep going: it must come back.
  await page.keyboard.down('KeyW'); await page.waitForTimeout(2600); await page.keyboard.up('KeyW');
  const y = Number((await page.textContent('#odom-readout')).match(/y (-?[\d.]+)/)[1]);
  expect(y).toBeLessThan(40);
});

test('a touch drag on the stage drives the robot on a phone', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch only');
  await page.goto('/vex/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.querySelector('#tryit-odometry').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const before = await page.textContent('#odom-readout');
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const box = await page.locator('#stage').boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2; const y0 = box.y + box.height * 0.75;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 8; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - i * 12 }] });
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(400);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.textContent('#odom-readout')).not.toBe(before);
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThan(2);
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
