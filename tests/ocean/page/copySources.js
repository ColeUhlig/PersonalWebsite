// Where every number on the ocean page comes from (piece C; spec 1, honesty rules: "every number on
// the page is measured"). Each phrase is text the page may contain; its quote must appear verbatim
// in its source: `site:` paths are from the website worktree's root, `roblox:` paths from the
// roblox-ocean checkout (ROBLOX_OCEAN_DIR, default /Users/cole/Projects/roblox-ocean). copy.test.js
// checks every quote; the copy check (copy.spec.js, copy.test.js) fails on any number in the page's
// text that no phrase covers. Adding a number to the copy means adding its phrase and source here.
const FACTS = 'site:tests/ocean/page/facts.test.js';
const SPEC = 'site:docs/superpowers/specs/2026-09-27-ocean-showcase-design.md';
const RECIPES = 'site:content/ocean/js/stages/recipes.js';
const CONFIG = 'site:content/ocean/js/engine/config.js';
const RUNTIME = 'site:content/ocean/js/proof/runtime.js';
const B_PLAN = 'site:docs/superpowers/plans/2026-09-30-ocean-b-luau-panel.md';
const BENCH = 'roblox:docs/research/bench.md';
const LEDGER = 'roblox:docs/research/engine-assumptions.md';

export const COPY_SOURCES = Object.freeze([
	// Structure, measured from the code (facts.test.js).
	{ phrase: '224 patches in 5 rings', source: FACTS, quote: '224 patches in 5 rings' },
	{ phrase: '18,144', source: FACTS, quote: '18,144 vertices' },
	{ phrase: '232', source: FACTS, quote: '232 materials' },
	{ phrase: '224 patches plus', source: FACTS, quote: '224 patches in 5 rings' },
	{ phrase: '8 horizon pieces', source: FACTS, quote: 'the horizon adds 8 quads' },
	{ phrase: '2, 4, 8, 16 and 32 studs', source: FACTS, quote: 'ring spacing 2, 4, 8, 16 and 32 studs' },
	{ phrase: '64 × 64', source: FACTS, quote: 'three layers of 64 × 64' },
	{ phrase: '3 × 64 × 64 = 12,288', source: FACTS, quote: '3 × 64 × 64 = 12,288' },
	{ phrase: '12,288', source: FACTS, quote: '3 × 64 × 64 = 12,288' },
	{ phrase: '256, 64 and 16 studs', source: FACTS, quote: 'over 256, 64 and 16 studs' },
	{ phrase: '512 × 512', source: FACTS, quote: 'the colour map is 512 × 512' },
	{ phrase: '256 × 256', source: FACTS, quote: 'the foam field 256 × 256' },
	{ phrase: '256-stud', source: FACTS, quote: 'on the 256-stud tile' },
	{ phrase: '6,480', source: FACTS, quote: '6,480 vertices' },
	{ phrase: 'γ = 3.3', source: 'site:content/ocean/js/core/spectrum.js', quote: 'gamma: 3.3' },
	{ phrase: 'WebGL 2', source: 'site:content/ocean/js/webgl.js', quote: 'asks for WebGL 2 only' },
	// The proof panel's runtime and run (proofPanel.js fills its notes from runtime.js and proofConfig.js,
	// which takes its seed from config.js; copy.test.js checks the filled notes).
	{ phrase: 'Luau 0.711', source: RUNTIME, quote: 'a fork of Luau release 0.711' },
	{ phrase: 'luau-web 1.4.0', source: RUNTIME, quote: "LUAU_WEB_VERSION = '1.4.0'" },
	{ phrase: 'seed 7', source: CONFIG, quote: 'export const SEED = 7;' },
	// Studio measurements (roblox-ocean docs/research/bench.md, Mac16,12, Studio 0.739).
	{ phrase: '3.5 ms', source: BENCH, quote: 'the write dropped from 7.7 to 3.5 ms' },
	{ phrase: '7.7 ms', source: BENCH, quote: 'the write dropped from 7.7 to 3.5 ms' },
	{ phrase: '60 fps', source: BENCH, quote: '60 fps; all three criteria MET in Studio' },
	{ phrase: '16.7 ms', source: BENCH, quote: 'about 16.7 ms' },
	{ phrase: '0.037 ms', source: BENCH, quote: 'upload 0.037' },
	{ phrase: '1.00 ms', source: BENCH, quote: 'FFT.inverse2D, 64 x 64 | 1.00' },
	{ phrase: 'like 20 fps', source: BENCH, quote: 'like 20 fps' },
	{ phrase: 'about 44 fps', source: BENCH, quote: 'about 44 fps' },
	{ phrase: '15 times a second', source: BENCH, quote: '15 Hz motion' },
	{ phrase: '0.062 ms', source: BENCH, quote: 'strength 0.062' },
	{ phrase: '16.65 ms', source: BENCH, quote: '16.65 / 17.08' },
	{ phrase: '2.81 ms', source: BENCH, quote: 'at 2.81 ms' },
	// The teaching recipes (recipes.js's header; facts.test.js checks the bank counts in its data).
	{ phrase: 'Steps 4 and 5 sum the 16 tallest', source: RECIPES, quote: 'Steps 4 and 5 sum the 16 tallest bank waves' },
	{ phrase: 'the fly-up in step 6', source: RECIPES, quote: 'The two high shots (steps 6 and 10) look steeply down' },
	{ phrase: 'the 4 tallest', source: RECIPES, quote: '4 tallest waves (40 to 85 studs)' },
	{ phrase: 'about 27 ms', source: RECIPES, quote: 'cost about 27 ms a frame over' },
	// The phase arrows' loop (engine/charts.js builds them with config.js's LOOP_PERIOD, in seconds).
	{ phrase: 'every 120 s', source: CONFIG, quote: 'export const LOOP_PERIOD = 120;' },
	// The web side's own measurements and records.
	{ phrase: '196,608 float32 values', source: B_PLAN, quote: '196,608 float32 values' },
	{ phrase: 'about 4 million', source: SPEC, quote: "about 4 million on Acerola's GPU" },
	{ phrase: 'radix-2', source: SPEC, quote: 'radix-2 FFT butterflies' },
	{ phrase: 'howhow2315/JONSWAP-Ocean', source: SPEC, quote: 'howhow2315/JONSWAP-Ocean' },
	// The engine-assumptions ledger (roblox-ocean docs/research/engine-assumptions.md).
	{ phrase: 'capped at 8 meshes', source: LEDGER, quote: '"8 EditableMesh per client" is a cap' },
	{ phrase: 'about 0.1 microseconds', source: LEDGER, quote: 'about 0.1 microseconds per arithmetic op' },
	{ phrase: 'about 0.0026 microseconds, roughly 40 times faster', source: LEDGER, quote: 'About 0.0026: roughly 40 times faster' },
	{ phrase: 'texture coordinates of 100,000', source: LEDGER, quote: 'Large world-anchored UV values keep enough precision far from the origin | **REFUTED at 100,000' },
	{ phrase: 'at level 6', source: LEDGER, quote: 'at level 6 they render at 45 studs and are gone by 170' },
	{ phrase: 'by 170 studs', source: LEDGER, quote: 'at level 6 they render at 45 studs and are gone by 170' },
	// Credits.
	{ phrase: '(2001', source: SPEC, quote: 'Tessendorf (2001 course notes)' },
	{ phrase: 'revised 2004', source: 'roblox:docs/research/tessendorf-fft.md', quote: '*Simulating Ocean Water*, 2004' },
	{ phrase: 'GDC 2019', source: 'roblox:docs/research/atlas-shading-model.md', quote: 'GDC 2019' },
	{ phrase: 'SIGGRAPH 2018', source: 'roblox:docs/research/sea-of-thieves.md', quote: 'SIGGRAPH 2018 talk paper' },
].map((entry) => Object.freeze(entry)));

export const PHRASES = Object.freeze(COPY_SOURCES.map((entry) => entry.phrase));
