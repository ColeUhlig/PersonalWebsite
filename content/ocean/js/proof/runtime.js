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
//   (a WebAssembly.RuntimeError), after which the worker holding it is thrown away. A Luau error,
//   pcall's escape included, rejects with an error named 'LuaError' instead, and a compile error
//   throws a 'CompileError'; neither is a WebAssembly.RuntimeError;
// - an error inside pcall is not caught by pcall: it escapes to JavaScript. Nothing bundled
//   calls pcall;
// - strings cross the bridge as UTF-8 text, so bytes above 0x7f are mangled: binary data comes
//   back as hex.
export const LUAU_WEB_VERSION = '1.4.0';
export const LUAU_WEB_URL = `https://cdn.jsdelivr.net/npm/luau-web@${LUAU_WEB_VERSION}/src/index.js`;
// Where 0.711 comes from: the package does not name the Luau release. luau-web 1.4 (git tag 1.4,
// commit c027116ad4, 2026-03-11) was built from luau-interop master (github.com/xNasuni/luau-interop,
// a fork of luau-lang/luau, head 7be7165613, 2026-03-11), whose last merge from upstream
// (ecdfa770f1, 2026-03-09) brought in 004d88ff2b "Sync to upstream/release/711 (#2280)".
export const LUAU_RELEASE = '0.711';
// The fork luau-web packages, which is what actually runs; the panel names it, not "Luau".
export const LUAU_FORK = 'luau-interop';
// The generated Luau bundle, committed under content/ocean/luau/ (written by roblox-ocean's
// scripts/web_bundle.py). Resolved against this file, which sits two folders below content/ocean/.
export const BUNDLE_URL = new URL('../../luau/ocean-bundle.luau', import.meta.url).href;
