import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';
import { PROJECTS } from '../../content/js/projects.js';

const CONTENT = new URL('../../content/', import.meta.url);

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

test('every project in projects.js has its folder and preview image', () => {
  const slugs = PROJECTS.map((p) => p.slug);
  expect(new Set(slugs).size).toBe(slugs.length);
  for (const p of PROJECTS) {
    expect(existsSync(new URL(`${p.slug}/index.html`, CONTENT)), `${p.slug}/index.html`).toBe(true);
    expect(existsSync(new URL(`img/previews/${p.slug}.jpg`, CONTENT)), `preview for ${p.slug}`).toBe(true);
    expect(existsSync(new URL(`img/previews/${p.slug}.mp4`, CONTENT)), `clip for ${p.slug}`).toBe(true);
    expect(p.date, `${p.slug} date`).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    for (const key of ['title', 'summary']) expect(p[key], `${p.slug}.${key}`).toBeTruthy();
  }
});

test('the home page shows one card per project, in order, with no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/', { waitUntil: 'networkidle' });
  const cards = page.locator('#projects > li');
  await expect(cards).toHaveCount(PROJECTS.length);
  for (const [i, p] of PROJECTS.entries()) {
    const card = cards.nth(i);
    await expect(card.locator('a')).toHaveAttribute('href', `/${p.slug}/`);
    await expect(card.locator('.title')).toHaveText(p.title);
    const loaded = await card.locator('img').evaluate((img) => img.decode().then(() => img.naturalWidth > 0, () => false));
    expect(loaded, `${p.slug} preview loads`).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('each card opens its project', async ({ page }) => {
  await page.goto('/');
  for (const p of PROJECTS) {
    const res = await page.request.get(`/${p.slug}/`);
    expect(res.status(), p.slug).toBe(200);
  }
  await page.locator('#projects > li').first().locator('a').click();
  await expect(page).toHaveURL(new RegExp(`/${PROJECTS[0].slug}/$`));
});

test('hovering a tile plays its clip', async ({ page, isMobile }) => {
  test.skip(isMobile, 'touch screens show the still only');
  await page.goto('/', { waitUntil: 'networkidle' });
  const first = page.locator('#projects > li').first();
  await first.hover();
  await expect(first.locator('video')).toHaveClass(/playing/);
  await page.mouse.move(0, 0);
  await expect(first.locator('video')).not.toHaveClass(/playing/);
});

test('the page never scrolls sideways', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
