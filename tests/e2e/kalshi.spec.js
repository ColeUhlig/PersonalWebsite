import { test, expect } from '@playwright/test';

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function open(page) {
  await page.goto('/kalshi/', { waitUntil: 'networkidle' });
}

test('the paper loads with a title, an abstract and no console errors', async ({ page }) => {
  const errors = collectErrors(page);
  await open(page);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('#abstract')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the AI-assistance statement comes before the introduction', async ({ page }) => {
  await open(page);
  const order = await page.evaluate(() => {
    const disclosure = document.querySelector('#ai-statement');
    const intro = document.querySelector('#sec-introduction');
    return disclosure && intro ? disclosure.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING : 0;
  });
  expect(order).toBeTruthy();
});

test('sections are numbered consecutively and the contents list links to each one', async ({ page }) => {
  await open(page);
  const numbers = await page.locator('main > section.numbered > h2 .secno').allTextContents();
  expect(numbers.length).toBeGreaterThanOrEqual(8);
  numbers.forEach((n, i) => expect(n.trim()).toBe(String(i + 1)));
  const targets = await page.locator('nav.toc a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(targets.length).toBeGreaterThan(0);
  for (const href of targets) {
    expect(await page.locator(href).count(), href).toBe(1);
  }
});

test('every citation resolves to a reference and every reference is cited', async ({ page }) => {
  await open(page);
  const { cited, refs } = await page.evaluate(() => ({
    cited: [...document.querySelectorAll('a.cite')].map((a) => a.getAttribute('href').slice(1)),
    refs: [...document.querySelectorAll('#references li[id]')].map((li) => li.id),
  }));
  expect(refs.length).toBeGreaterThan(0);
  for (const id of cited) expect(refs, id).toContain(id);
  for (const id of refs) expect(cited, id).toContain(id);
});

test('every table and figure reference points at a captioned element', async ({ page }) => {
  await open(page);
  const broken = await page.evaluate(() => [...document.querySelectorAll('a.xref')]
    .map((a) => a.getAttribute('href'))
    .filter((href) => {
      const el = document.querySelector(href);
      return !el || !el.querySelector('caption, figcaption');
    }));
  expect(broken).toEqual([]);
  const uncaptioned = await page.locator('table:not(:has(caption))').count();
  expect(uncaptioned).toBe(0);
});

test('equations render with KaTeX and none fail to parse', async ({ page }) => {
  await open(page);
  const total = await page.locator('.eq, .m').count();
  expect(total).toBeGreaterThan(0);
  await expect(page.locator('.eq .katex-display')).toHaveCount(await page.locator('.eq').count());
  await expect(page.locator('.m .katex')).toHaveCount(await page.locator('.m').count());
  await expect(page.locator('.katex-error')).toHaveCount(0);
});

test('the page never scrolls sideways', async ({ page }) => {
  await open(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the home page links to the paper', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.click('a[href="/kalshi/"]');
  await expect(page).toHaveURL(/\/kalshi\/$/);
  await expect(page.locator('#abstract')).toBeVisible();
});
