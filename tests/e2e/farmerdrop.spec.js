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

/** Sum of every money tube on the map, in cents. Amounts render as "$9.45" or "−$7.60". */
async function tubeTotal(page) {
  const amounts = await page.locator('.tube-amount').allTextContents();
  return amounts.reduce((sum, text) => {
    const negative = /^[−-]/.test(text.trim());
    const cents = Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100);
    return sum + (negative ? -cents : cents);
  }, 0);
}

async function walkToEnd(page) {
  while (!(await page.locator('#next').isDisabled())) await page.click('#next');
}

test('the page loads the map and the order track with no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('#map svg[role="img"]')).toBeVisible();
  await expect(page.locator('#stages li')).toHaveCount(7);
  await expect(page.locator('#step-title')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('every track can be walked to its end and the money always adds up to $10.00', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  const tracks = await page.locator('#picker [data-track]').evaluateAll((bs) => bs.map((b) => b.dataset.track));
  expect(tracks.length).toBeGreaterThanOrEqual(10);
  for (const id of tracks) {
    await page.click(`#picker [data-track="${id}"]`);
    await expect(page.locator(`#picker [data-track="${id}"]`)).toHaveAttribute('aria-pressed', '');
    await walkToEnd(page);
    expect(await tubeTotal(page), id).toBe(1000);
    if (id !== 'order') await expect(page.locator('#outcome'), id).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('the step controls move forward and back', async ({ page }) => {
  await open(page);
  await expect(page.locator('#prev')).toBeDisabled();
  const first = await page.locator('#step-title').textContent();
  await page.click('#next');
  await expect(page.locator('#step-title')).not.toHaveText(first);
  await page.click('#prev');
  await expect(page.locator('#step-title')).toHaveText(first);
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
  await expect(page.locator('#map svg')).toBeVisible();
});
