// Where every number on the ocean page comes from (piece C; spec 1, honesty rules: "every number on
// the page is measured"). Each phrase is text the page may contain; its quote must appear verbatim
// in its source: `site:` paths are from the website worktree's root, `roblox:` paths from the
// roblox-ocean checkout (ROBLOX_OCEAN_DIR, default /Users/cole/Projects/roblox-ocean). copy.test.js
// checks every quote; the copy check (copy.spec.js, copy.test.js) fails on any number in the page's
// text that no phrase covers. Adding a number to the copy means adding its phrase and source here.
//
// A phrase is the page's own wording around the number, long enough that it can only match where
// the claim it sources is made: "holds 60 fps", not "60 fps", so a false "60 fps in a live game"
// elsewhere is not covered by accident. Words a writer puts next to a covered phrase (a false
// qualifier such as "in Studio") are not caught by substring matching: review owns those.
// copy.spec.js also fails on a phrase the page, the notices and the proof panel no longer use, so a
// stale source cannot linger here.
const FACTS = 'site:tests/ocean/page/facts.test.js';
const SPEC = 'site:docs/superpowers/specs/2026-09-27-ocean-showcase-design.md';
const RUNTIME = 'site:content/ocean/js/proof/runtime.js';
const B_PLAN = 'site:docs/superpowers/plans/2026-09-30-ocean-b-luau-panel.md';
const BENCH = 'roblox:docs/research/bench.md';
const LEDGER = 'roblox:docs/research/engine-assumptions.md';

export const COPY_SOURCES = Object.freeze([
	// Structure, measured from the code (facts.test.js; the test names carry the page's wording).
	{ phrase: '224 patches in 5 rings on the top tier', source: FACTS, quote: 'the High tier: 224 patches in 5 rings' },
	{ phrase: '18,144 of them on the top tier', source: FACTS, quote: 'the High tier: 224 patches in 5 rings, 18,144 vertices' },
	{ phrase: "On the top tier that's three layers, 232 materials and 18,144 points", source: FACTS, quote: 'the top tier: three layers, 232 materials and 18,144 points' },
	{ phrase: 'the lighter tier by rule: 6,480 points instead of 18,144', source: FACTS, quote: 'the lighter tier by rule: 6,480 points instead of 18,144' },
	{ phrase: '232 separate materials on the top tier (224 patches plus 8 horizon pieces)', source: FACTS, quote: '232 materials: 224 patches plus 8 horizon pieces' },
	{ phrase: '232 materials on the top tier, each with its own glow', source: FACTS, quote: '232 materials: 224 patches plus 8 horizon pieces' },
	{ phrase: 'Points 2, 4, 8, 16 and 32 studs apart, ring by ring', source: FACTS, quote: 'ring spacing 2, 4, 8, 16 and 32 studs' },
	{ phrase: '(Parallel Luau), 64 × 64 per layer', source: FACTS, quote: 'three layers of 64 × 64' },
	{ phrase: 'Kept every layer at 64 × 64, so the whole sea is at most 3 × 64 × 64 = 12,288 wave components', source: FACTS, quote: 'three layers of 64 × 64 over 256, 64 and 16 studs: 3 × 64 × 64 = 12,288' },
	{ phrase: "One 64 × 64 grid can't hold", source: FACTS, quote: 'three layers of 64 × 64' },
	{ phrase: 'tiling patches of 256, 64 and 16 studs', source: FACTS, quote: 'over 256, 64 and 16 studs' },
	{ phrase: 'so the 256-stud pattern gets harder to spot', source: FACTS, quote: 'over 256, 64 and 16 studs' },
	{ phrase: "That's how 12,288 wave components pass for far more", source: FACTS, quote: '3 × 64 × 64 = 12,288' },
	{ phrase: 'The tallest waves in the 256-stud layer', source: FACTS, quote: 'over 256, 64 and 16 studs' },
	{ phrase: "The 256-stud layer's height, slope and sideways push", source: FACTS, quote: 'over 256, 64 and 16 studs' },
	{ phrase: 'A 256 × 256 foam field, painted into the 512 × 512 colour map', source: FACTS, quote: 'the colour map is 512 × 512 and the foam field 256 × 256' },
	{ phrase: 'they fit a 256-stud tile exactly', source: FACTS, quote: 'the teaching bank sits on the 256-stud tile' },
	{ phrase: 'Here L is the 256-stud tile', source: FACTS, quote: 'the teaching bank sits on the 256-stud tile' },
	{ phrase: 'the speeds the dispersion gives them, looping every 120 s', source: FACTS, quote: 'the phase arrows loop every 120 s' },
	{ phrase: 'long waves travel fastest), looping every 120 s', source: FACTS, quote: 'the phase arrows loop every 120 s' },
	{ phrase: 'The code rounds each ω down to a whole number of turns per 120 s, so the sea repeats every 120 s', source: FACTS, quote: "every wave's ω is rounded down to a whole number of turns per 120 s, so the sea repeats every 120 s" },
	{ phrase: 'd is the water depth the engine uses, 60 studs (the engine treats a stud as a metre), deep enough that tanh(kd) is close to 1 for all but the longest waves', source: FACTS, quote: 'the water depth the engine uses is 60 studs (the engine treats a stud as a metre), deep enough that tanh(kd) is close to 1 for all but the longest waves' },
	{ phrase: 'one wave cascade, 64 × 64 cells at seed 7', source: FACTS, quote: 'the proof panel runs one wave cascade, 64 × 64 cells at seed 7' },
	{ phrase: 'γ = 3.3 sharpens the peak', source: 'site:content/ocean/js/core/spectrum.js', quote: 'gamma: 3.3' },
	{ phrase: 'This live ocean needs WebGL 2', source: 'site:content/ocean/js/webgl.js', quote: 'asks for WebGL 2 only' },
	// The teaching recipes (facts.test.js checks the count in the recipe's data).
	{ phrase: 'The page keeps only the 4 tallest (the small ones would blur at this distance)', source: FACTS, quote: "the tiling step sums the bank's 4 tallest waves" },
	// C2 lane G, step 6 (spec 10: never "all directions").
	{ phrase: 'fan out within 45° either side of one heading', source: FACTS, quote: "the teaching bank's headings lie within 45° either side of one heading" },
	// The proof panel's runtime (proofPanel.js fills its note from runtime.js; copy.test.js checks it).
	{ phrase: 'a fork of Luau 0.711', source: RUNTIME, quote: "LUAU_RELEASE = '0.711'" },
	{ phrase: 'packaged as luau-web 1.4.0', source: RUNTIME, quote: "LUAU_WEB_VERSION = '1.4.0'" },
	// Studio measurements (roblox-ocean docs/research/bench.md, Mac16,12, Studio 0.739).
	{ phrase: "About 3.5 ms a frame in Studio with Luau's native code generation, 7.7 ms without it", source: BENCH, quote: 'the write dropped from 7.7 to 3.5 ms' },
	{ phrase: 'back when the game handed Roblox one whole image a frame: 0.037 ms of script time in Studio', source: BENCH, quote: 'upload 0.037' },
	{ phrase: 'One 64 × 64 inverse FFT takes 1.00 ms in Studio', source: BENCH, quote: 'FFT.inverse2D, 64 x 64 | 1.00' },
	{ phrase: 'it looked like 20 fps to me', source: BENCH, quote: 'like 20 fps' },
	{ phrase: 'the game ran at about 44 fps', source: BENCH, quote: 'about 44 fps' },
	{ phrase: 'the waves only moved 15 times a second', source: BENCH, quote: '15 Hz motion' },
	{ phrase: 'Those 232 glow writes take 0.062 ms a frame in Studio', source: BENCH, quote: 'strength 0.062' },
	{ phrase: 'the ocean just before I added foam held 60 fps', source: BENCH, quote: '60 fps; all three criteria MET in Studio' },
	{ phrase: 'a 16.65 ms median frame', source: BENCH, quote: '16.65 / 17.08' },
	{ phrase: 'with 2.81 ms of script time', source: BENCH, quote: 'at 2.81 ms' },
	// The web side's own records.
	{ phrase: 'all 196,608 float32 values matched bit for bit', source: B_PLAN, quote: 'six cascades at four seeds (196,608 float32 values)' },
	{ phrase: "Acerola's GPU ocean runs about 4 million", source: SPEC, quote: "about 4 million on Acerola's GPU" },
	{ phrase: 'The radix-2 FFT', source: SPEC, quote: 'radix-2 FFT butterflies' },
	{ phrase: 'howhow2315/JONSWAP-Ocean', source: SPEC, quote: 'howhow2315/JONSWAP-Ocean' },
	// The engine-assumptions ledger (roblox-ocean docs/research/engine-assumptions.md).
	{ phrase: 'EditableMesh is capped at 8 meshes per player', source: LEDGER, quote: '"8 EditableMesh per client" is a cap' },
	{ phrase: 'Luau costs about 0.1 microseconds per arithmetic operation', source: LEDGER, quote: 'Luau costs about 0.1 microseconds per arithmetic op' },
	{ phrase: "It's about 0.0026 microseconds, roughly 40 times faster", source: LEDGER, quote: 'About 0.0026: roughly 40 times faster' },
	{ phrase: 'At texture coordinates of 100,000 the texels tore apart', source: LEDGER, quote: 'Large world-anchored UV values keep enough precision far from the origin | **REFUTED at 100,000' },
	{ phrase: 'at level 6 the ripples are gone by 170 studs', source: LEDGER, quote: 'at level 6 they render at 45 studs and are gone by 170' },
	// Credits.
	{ phrase: 'the SIGGRAPH course notes (2001', source: SPEC, quote: 'Tessendorf (2001 course notes)' },
	{ phrase: 'revised 2004)', source: 'roblox:docs/research/tessendorf-fft.md', quote: '*Simulating Ocean Water*, 2004' },
	{ phrase: 'Mihelich and Tcheblokov, GDC 2019', source: 'roblox:docs/research/atlas-shading-model.md', quote: 'GDC 2019' },
	{ phrase: 'The Technical Art of Sea of Thieves (SIGGRAPH 2018', source: 'roblox:docs/research/sea-of-thieves.md', quote: 'SIGGRAPH 2018 talk paper' },
].map((entry) => Object.freeze(entry)));

export const PHRASES = Object.freeze(COPY_SOURCES.map((entry) => entry.phrase));
