// Takes the home page's preview of each mini site: a still of the top of its page and a short clip of
// it in motion (scrolling down, or just running for pages that move by themselves), both 1280×800, saved
// to content/img/previews/<slug>.jpg and <slug>.mp4. Serves content/ itself on a private port. Needs ffmpeg.
//   node scripts/capture-previews.mjs            # every project
//   node scripts/capture-previews.mjs farmerdrop # just these
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTS } from '../content/js/projects.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = 8791;
const OUT = `${ROOT}content/img/previews`;
const VIEWPORT = { width: 1280, height: 800 };
const SETTLE_MS = 2500;
const CLIP_MS = 6000;
const CLIP_WIDTH = 960;
const DEFAULT_SCROLL = 1400;
// How far down each clip scrolls, in px, where the default doesn't suit the page. 0 = hold still: the page
// moves by itself, so its still is taken from the middle of the clip rather than the first settled frame.
const CLIP_SCROLL = { ocean: 0 };

const wanted = process.argv.slice(2);
const unknown = wanted.filter((slug) => !PROJECTS.some((p) => p.slug === slug));
if (unknown.length) {
  console.error(`Not in content/js/projects.js: ${unknown.join(', ')}`);
  process.exit(1);
}
const targets = PROJECTS.filter((p) => !wanted.length || wanted.includes(p.slug));
const base = `http://127.0.0.1:${PORT}`;

const server = spawn(`${ROOT}node_modules/.bin/http-server`, ['content', '-p', String(PORT), '-s', '-c-1'], { cwd: ROOT });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const work = mkdtempSync(join(tmpdir(), 'previews-'));
try {
  await waitForServer(`${base}/`);
  mkdirSync(OUT, { recursive: true });
  for (const { slug } of targets) {
    const scrollPx = CLIP_SCROLL[slug] ?? DEFAULT_SCROLL;
    await captureClip(slug, scrollPx);
    if (scrollPx === 0) stillFromClip(slug);
    else await captureStill(slug);
    console.log(`captured ${slug}`);
  }
} finally {
  await browser.close();
  server.kill();
  rmSync(work, { recursive: true, force: true });
}

async function captureStill(slug) {
  const page = await browser.newPage({ viewport: VIEWPORT, colorScheme: 'light' });
  await page.goto(`${base}/${slug}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: `${OUT}/${slug}.jpg`, type: 'jpeg', quality: 82 });
  await page.close();
}

async function captureClip(slug, scrollPx) {
  const dir = join(work, slug);
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'light',
    recordVideo: { dir, size: VIEWPORT },
  });
  const page = await context.newPage();
  const recordingStarted = Date.now();
  await page.goto(`${base}/${slug}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SETTLE_MS);
  const startSec = (Date.now() - recordingStarted) / 1000;
  await page.evaluate(([px, ms]) => new Promise((done) => {
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      window.scrollTo(0, px * (0.5 - Math.cos(Math.PI * t) / 2));
      if (t < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }), [scrollPx, CLIP_MS]);
  const video = page.video();
  await context.close();
  const raw = await video.path();
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-ss', startSec.toFixed(2), '-i', raw, '-t', String(CLIP_MS / 1000),
    '-vf', `scale=${CLIP_WIDTH}:-2`, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${OUT}/${slug}.mp4`,
  ]);
}

function stillFromClip(slug) {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-ss', String(CLIP_MS / 2000), '-i', `${OUT}/${slug}.mp4`,
    '-frames:v', '1', '-q:v', '3', `${OUT}/${slug}.jpg`,
  ]);
}

async function waitForServer(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`server at ${url} never came up`);
}
