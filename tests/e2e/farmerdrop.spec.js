import { test, expect } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function open(page) {
  await page.goto('/farmerdrop/', { waitUntil: 'networkidle' });
}

/** Scroll a step to the line where the page activates it (lower on phones, where the diagram is pinned on top). */
async function scrollToStep(page, step) {
  await step.evaluate((el) => {
    const line = window.matchMedia('(max-width: 900px)').matches ? 0.8 : 0.45;
    window.scrollBy(0, el.getBoundingClientRect().top - window.innerHeight * line + 8);
  });
}

/** Sum of the strip's legend amounts, in cents. */
async function legendTotal(page) {
  const amounts = await page.locator('.legend-amount').allTextContents();
  return amounts.reduce((sum, text) => sum + Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100), 0);
}

test('the page loads the strip, the split and every diagram with no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('.crate-stop')).toHaveCount(4);
  await expect(page.locator('.split-piece')).toHaveCount(8);
  const scrollies = page.locator('.scrolly[data-scene]');
  expect(await scrollies.count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.seq-canvas svg[role="img"]')).toHaveCount(await scrollies.count());
  expect(errors).toEqual([]);
});

test('scrolling through every step reveals the diagram and keeps the money at $10.00', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  const steps = page.locator('.step');
  const count = await steps.count();
  for (let i = 0; i < count; i += 1) {
    const step = steps.nth(i);
    await scrollToStep(page, step);
    await expect(step).toHaveClass(/is-active/);
    const block = step.locator('xpath=ancestor::div[contains(@class,"scrolly")]');
    await expect(block.locator('.row.is-now').first()).toBeAttached();
    expect(await legendTotal(page)).toBe(1000);
  }
  expect(errors).toEqual([]);
});

test('the strip shows unrecorded money while the card is charged but not yet booked', async ({ page }) => {
  await open(page);
  await scrollToStep(page, page.locator('[data-scene="pay"] .step[data-step="2"]'));
  await expect(page.locator('.legend-unrecorded')).toBeVisible();
  await scrollToStep(page, page.locator('[data-scene="pay"] .step[data-step="4"]'));
  await expect(page.locator('.legend-holding .legend-amount')).toHaveText('$9.16');
});

test('the page never scrolls sideways', async ({ page }) => {
  await open(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the home page links to the payments page', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.click('a[href="/farmerdrop/"]');
  await expect(page).toHaveURL(/\/farmerdrop\/$/);
  await expect(page.locator('h1')).toBeVisible();
});
