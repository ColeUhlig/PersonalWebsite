// Which WebAssembly Luau the proof panel runs and where the browser gets it.
//
// luau-web (MIT, github.com/xNasuni/luau-web) bundles luau-interop, a fork of Luau release 0.711
// with a JavaScript bridge, compiled to WebAssembly with the .wasm inlined in its two JavaScript
// builds: one for browsers with JavaScript Promise Integration (JSPI, current Chromium) and an
// Asyncify one for the rest (Safari). Its index.js picks between them when it is imported.
//
// Loaded from jsDelivr at this exact version rather than committed under content/ocean/luau/:
// the site has no build step and loads its other libraries (three.js) from jsDelivr at pinned
// versions, and the package is 2 MB unpacked, which the repo would carry forever. Web Workers
// cannot use the page's import map, so the worker imports this URL directly. The Node tests
// import the same version from node_modules (package.json pins it exactly), and
// tests/ocean/proof/runtime.test.js checks the two versions agree.
//
// Known limits of this runtime (measured 2026-09-30, pinned in runtime.test.js):
// - the heap is fixed at about 16 MB and cannot grow; running out aborts the WebAssembly module
//   (a WebAssembly.RuntimeError), after which the worker holding it is thrown away;
// - an error inside pcall is not caught by pcall: it escapes to JavaScript. Nothing bundled
//   calls pcall;
// - strings cross the bridge as UTF-8 text, so bytes above 0x7f are mangled: binary data comes
//   back as hex.
export const LUAU_WEB_VERSION = '1.4.0';
export const LUAU_WEB_URL = `https://cdn.jsdelivr.net/npm/luau-web@${LUAU_WEB_VERSION}/src/index.js`;
export const LUAU_RELEASE = '0.711';
// The generated Luau bundle, committed under content/ocean/luau/ (written by roblox-ocean's
// scripts/web_bundle.py). Resolved against this file, which sits two folders below content/ocean/.
export const BUNDLE_URL = new URL('../../luau/ocean-bundle.luau', import.meta.url).href;
