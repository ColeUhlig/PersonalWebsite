// Measures the WebAssembly Luau runtime the proof panel loads: download size, start-up time and
// speed against the same loop in JavaScript, and whether the fallback toolchain (Emscripten) is
// installed. Prints one line per number; run from the repo root: node scripts/luau-runtime-probe.mjs
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { LUAU_WEB_VERSION } from '../content/ocean/js/proof/runtime.js';

const require = createRequire(import.meta.url);
const packageDir = require.resolve('luau-web/package.json').replace(/package\.json$/, '');
const files = ['src/index.js', 'src/lib/Luau.Web.JSPI.js', 'src/lib/Luau.Web.Asyncify.js'];
console.log(`luau-web ${LUAU_WEB_VERSION}, Node ${process.version}, JSPI ${'Suspending' in WebAssembly}`);
for (const file of files) {
	const bytes = statSync(packageDir + file).size;
	const gzipped = gzipSync(readFileSync(packageDir + file)).length;
	console.log(`size ${file}: ${bytes} bytes, ${gzipped} gzipped`);
}

const started = performance.now();
const { LuauState } = await import('luau-web');
const state = await LuauState.createAsync();
console.log(`start-up (import, instantiate, first state): ${(performance.now() - started).toFixed(1)} ms`);

const COUNT = 5_000_000;
const chunk = state.loadstring('local count = ... local s = 0 for i = 1, count do s += math.sin(i) * 0.5 + i % 7 end return s', 'bench', true);
let t = performance.now();
const [luauSum] = await chunk(COUNT);
const luauMs = performance.now() - t;
t = performance.now();
let jsSum = 0;
for (let i = 1; i <= COUNT; i++) {
	jsSum += Math.sin(i) * 0.5 + (i % 7);
}
const jsMs = performance.now() - t;
console.log(`loop of ${COUNT} sines: Luau ${luauMs.toFixed(0)} ms, JavaScript ${jsMs.toFixed(0)} ms, ratio ${(luauMs / jsMs).toFixed(1)}`);
console.log(`sums differ by ${Math.abs(luauSum - jsSum).toExponential(2)}`);

const emcc = spawnSync('emcc', ['--version'], { encoding: 'utf8' });
console.log(`emcc: ${emcc.error ? 'not installed' : emcc.stdout.split('\n')[0]}`);
