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

/** Rows of a failure diagram that are currently shown (not hidden for a later step). */
async function shownRows(figure) {
  return figure.locator('.seq-canvas .row:not(.is-hidden)').count();
}

/** Sum of the ledger bar's legend amounts, in cents. */
async function legendTotal(page) {
  const amounts = await page.locator('.money-legend b').allTextContents();
  return amounts.reduce((sum, text) => sum + Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100), 0);
}

test('the page loads the calculator, the ledger and every diagram with no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('#ledger-stepper .flow')).toBeVisible();
  const figures = page.locator('figure.failure');
  await expect(figures).toHaveCount(4);
  for (const figure of await figures.all()) await expect(figure.locator('.seq-canvas svg')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('each failure diagram reveals its rows one step at a time', async ({ page }) => {
  await open(page);
  for (const figure of await page.locator('figure.failure').all()) {
    await figure.scrollIntoViewIfNeeded();
    const total = await figure.locator('.seq-canvas .row').count();
    const next = figure.locator('.step-btn', { hasText: 'Next' });
    const prev = figure.locator('.step-btn', { hasText: 'Prev' });
    await expect(prev).toBeDisabled();
    // Step 1 draws in once the figure scrolls into view.
    await expect.poll(() => shownRows(figure)).toBeGreaterThan(0);
    let shown = await shownRows(figure);
    expect(shown).toBeLessThan(total);
    while (await next.isEnabled()) {
      await next.click();
      const now = await shownRows(figure);
      expect(now).toBeGreaterThan(shown);
      shown = now;
    }
    expect(shown).toBe(total);
    // Next is now disabled; focus has moved to Prev, so the arrow keys still step.
    await expect(prev).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    expect(await shownRows(figure)).toBeLessThan(total);
  }
});

test('rapid stepping back and forth leaves every shown row fully drawn', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await open(page);
  const figure = page.locator('figure.failure').first();
  await figure.scrollIntoViewIfNeeded();
  const next = figure.locator('.step-btn', { hasText: 'Next' });
  const prev = figure.locator('.step-btn', { hasText: 'Prev' });
  for (const button of [next, next, prev, next, next, prev, next]) await button.click({ delay: 0 });
  await page.waitForTimeout(2000);
  await expect(figure.locator('.seq-canvas [clip-path]')).toHaveCount(0);
  await expect(figure.locator('.seq-canvas clipPath')).toHaveCount(0);
});

test('the ledger moves the crate and keeps the bar at $10.00 at every phase', async ({ page }) => {
  await open(page);
  const tabs = page.locator('#ledger-stepper [role="tab"]');
  await expect(tabs).toHaveCount(5);
  const where = [];
  for (const tab of await tabs.all()) {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(await legendTotal(page)).toBe(1000);
    where.push(await page.locator('.crate-stop.is-here').textContent());
  }
  expect(where).toEqual(['Farm', 'Drop host', 'Customer', 'Customer', 'Customer']);
  await expect(page.locator('.identity')).toContainText('✓');
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
