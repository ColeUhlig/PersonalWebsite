import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Azure Static Web Apps serves /vex (no trailing slash) without redirecting to /vex/, so the page
// would resolve relative asset paths against the site root. Every asset the page loads must be
// site-absolute.

const html = readFileSync(new URL('../../content/vex/index.html', import.meta.url), 'utf8');

test('the explainer page references its own assets by site-absolute paths', () => {
  const local = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:)?\/\//.test(u));
  assert.ok(local.length >= 3, `expected the stylesheet, script and canonical-host paths, saw ${local.length}`);
  for (const u of local) assert.ok(u.startsWith('/'), `${u} is relative; it breaks at /vex without a trailing slash`);
});
