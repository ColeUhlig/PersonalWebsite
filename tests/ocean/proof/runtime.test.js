// What the proof panel needs from the WebAssembly Luau runtime (luau-web), checked in Node with
// the exact version the browser loads. A failure here means the runtime cannot carry the panel:
// stop and report it, do not work around it in the bundle.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as expect from '../expect.js';
import { LuauState } from 'luau-web';
import { BUNDLE_URL, LUAU_WEB_URL, LUAU_WEB_VERSION } from '../../../content/ocean/js/proof/runtime.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// One state for every chunk here. Not a state per test: every state lives in the one fixed heap
// the WebAssembly module shares, and destroying a state can break the ones created after it
// (luau-web 1.4.0), so states are made once and kept.
const shared = await LuauState.createAsync();

function run(source, ...args) {
	const chunk = shared.loadstring(source, 'probe', true);
	return chunk(...args); // resolves to an array of the chunk's return values
}

async function rejection(promise) {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	return null;
}

// Runs a module script in a child Node process, from the repo root so `luau-web` resolves, and
// returns its stdout and stderr. `hideJspi` deletes JSPI first, which is how luau-web sees a
// browser without it (Safari): it loads its Asyncify build instead. The script must import
// luau-web with a dynamic `await import`, since a static import would run before the delete.
// The child must finish within 30 s and exit cleanly.
const CHILD_TIMEOUT_MS = 30_000;

function child(script, hideJspi = false) {
	const prefix = hideJspi ? 'delete WebAssembly.Suspending; delete WebAssembly.promising;\n' : '';
	const result = spawnSync(process.execPath, ['--input-type=module', '-e', prefix + script], { cwd: ROOT, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS });
	expect.equal(result.status, 0, `child exit status (signal ${result.signal}, error ${result.error?.message}); stderr: ${result.stderr}`);
	return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

test('the page and the tests run the same pinned luau-web', () => {
	const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8'));
	expect.equal(pkg.devDependencies['luau-web'], LUAU_WEB_VERSION, 'package.json pins the version the page loads');
	const installed = JSON.parse(readFileSync(`${ROOT}node_modules/luau-web/package.json`, 'utf8'));
	expect.equal(installed.version, LUAU_WEB_VERSION, 'installed version');
	expect.equal(LUAU_WEB_URL, 'https://cdn.jsdelivr.net/npm/luau-web@1.4.0/src/index.js', 'jsDelivr URL, exact version');
});

test('the bundle URL resolves to content/ocean/luau/ocean-bundle.luau', () => {
	expect.equal(BUNDLE_URL, pathToFileURL(`${ROOT}content/ocean/luau/ocean-bundle.luau`).href, 'an absolute file: URL in Node');
});

test('the buffer library writes and reads float32 and bytes', async () => {
	const [value, byte, length] = await run('local b = buffer.create(8) buffer.writef32(b, 0, 0.1) buffer.writeu8(b, 4, 255) return buffer.readf32(b, 0), buffer.readu8(b, 4), buffer.len(b)');
	expect.equal(value, Math.fround(0.1), 'float32 round trip');
	expect.equal(byte, 255, 'byte');
	expect.equal(length, 8, 'length');
});

test('table.freeze freezes, and writing to a frozen table is an error', async () => {
	const [frozen, plain] = await run('return table.isfrozen(table.freeze({ 1 })), table.isfrozen({})');
	expect.equal(frozen, true, 'frozen');
	expect.equal(plain, false, 'plain');
	const error = await rejection(run('local t = table.freeze({}) t.x = 1'));
	expect.truthy(error && error.message.includes('readonly'), `write to a frozen table rejects (${error?.message})`);
});

test('bit32 works on unsigned 32-bit values', async () => {
	const values = await run('return bit32.bxor(0xffffffff, 1), bit32.lrotate(0x80000001, 1), bit32.rshift(0x80000000, 31), bit32.lshift(1, 31), bit32.band(0x1234, 0xff)');
	expect.equal(values.join(' '), '4294967294 3 1 2147483648 52', 'results');
});

test('type annotations, nested type aliases and string interpolation compile', async () => {
	const [value, text] = await run('type A = { x: number }\nlocal function f(): number\n\ttype B = { y: number }\n\tlocal v: B = { y = 2 }\n\treturn v.y\nend\nlocal a: A = { x = f() }\nreturn a.x, `n={f()}`');
	expect.equal(value, 2, 'value');
	expect.equal(text, 'n=2', 'interpolation');
});

test('numbers cross the bridge exactly both ways, Infinity and NaN included', async () => {
	const source = 'local a, b = ... return a, b, a == math.huge, b ~= b';
	const [a, b, isHuge, isNan] = await run(source, Infinity, NaN);
	expect.equal(a, Infinity, 'Infinity');
	expect.truthy(Number.isNaN(b), 'NaN');
	expect.equal(isHuge, true, 'Infinity is math.huge');
	expect.equal(isNan, true, 'NaN is NaN');
	const [small, large] = await run(source, 0.1, -1e300);
	expect.equal(small, 0.1, '0.1 exactly');
	expect.equal(large, -1e300, '-1e300 exactly');
});

test('strings come back as UTF-8 text, so bytes must travel as hex', async () => {
	const [raw, hex] = await run('return string.char(65, 128), string.format("%02x%02x", 65, 128)');
	expect.equal(raw, 'A\uFFFD', 'a byte above 0x7f does not survive the bridge: it comes back as U+FFFD');
	expect.equal(hex, '4180', 'hex does');
});

// The worker (Task 5) treats a WebAssembly.RuntimeError as fatal and throws the runtime away, and
// anything else as an ordinary error of the Luau being run, so the classes are pinned here.
function expectLuaError(error, text, label) {
	expect.truthy(error && error.message.includes(text), `${label}: message (${error?.message})`);
	expect.equal(error.name, 'LuaError', `${label}: name`);
	expect.equal(error instanceof WebAssembly.RuntimeError, false, `${label}: not a WebAssembly.RuntimeError`);
}

test('a compile error comes back as a message or a CompileError, and a runtime error rejects with a LuaError', async () => {
	const message = shared.loadstring('local = 1', 'bad', false);
	expect.truthy(typeof message === 'string' && message.includes('Expected identifier'), `compile error (${message})`);
	let thrown = null;
	try {
		shared.loadstring('local = 1', 'bad', true);
	} catch (error) {
		thrown = error;
	}
	expect.truthy(thrown && thrown.message.includes('Expected identifier'), `thrown compile error (${thrown?.message})`);
	expect.equal(thrown.name, 'CompileError', 'compile error name');
	expect.equal(thrown instanceof WebAssembly.RuntimeError, false, 'a compile error is not a WebAssembly.RuntimeError');
	expectLuaError(await rejection(run('error("broken")')), 'broken', 'error()');
});

test('known limit of luau-web 1.4.0: an error inside pcall escapes to JavaScript as a LuaError', async () => {
	const error = await rejection(run('local ok = pcall(function() error("inside") end) return ok'));
	expectLuaError(error, 'inside', 'pcall did not catch it; if this fails, the runtime changed: re-check runtime.js');
});

test('a returned table is a proxy read with get(key); a missing key reads as null', async () => {
	const [record] = await run('return { a = 1.5, b = "x", inner = { y = 2 } }');
	expect.equal(typeof record.get, 'function', 'get is a function');
	expect.equal(record.get('a'), 1.5, 'number field');
	expect.equal(record.get('b'), 'x', 'string field');
	expect.equal(record.get('inner').get('y'), 2, 'nested table is a proxy too');
	expect.equal(record.get('missing'), null, 'missing key');
	const [list] = await run('return { 10, 20, 30 }');
	expect.equal(Array.isArray(list), false, 'a Luau array is not a JavaScript array');
	expect.equal(`${list.get(1)} ${list.get(3)}`, '10 30', 'array read with get, from 1');
});

// Recorded so nobody passes tables in: a JavaScript array arrives indexed from 0, and a missing key
// of a JavaScript object is not nil.
test('a JavaScript object passed in indexes from 0 and its missing keys are not nil', async () => {
	const [first, zeroth, kind] = await run('local t = ... return t[1], t[0], type(t)', [5, 6]);
	expect.equal(`${first} ${zeroth} ${kind}`, '6 5 table', 'array indexes');
	const [field, missingIsNil] = await run('local t = ... return t.a, t.zz == nil', { a: 3 });
	expect.equal(field, 3, 'present key');
	expect.equal(missingIsNil, false, 'missing key is not nil');
});

test('collectgarbage is not available', async () => {
	const [kind] = await run('return type(collectgarbage)');
	expect.equal(kind, 'nil', 'collectgarbage');
});

// In a child process, since it breaks the module for the rest of the process. Whether a state made
// after a destroy breaks depends on how many states exist (after two creates it survived, after
// one or three it did not, measured 2026-09-30), so this pins the simplest case that breaks.
test('destroying a state can break the states created after it, so destroy is never called', () => {
	const result = child(`
		const { LuauState } = await import('luau-web');
		const doomed = await LuauState.createAsync();
		doomed.destroy();
		const state = await LuauState.createAsync();
		const chunk = state.loadstring('return 2 + 2', 'after', true);
		console.log(JSON.stringify({ chunk: typeof chunk }));
	`);
	expect.equal(JSON.parse(result.stdout).chunk, 'object', 'loadstring on the new state returns a table reference, not a function');
});

test('garbage from one call is collected before the next: thirty 3 MB calls in one state', async () => {
	const state = await LuauState.createAsync();
	const chunk = state.loadstring('local mb = ... local keep = table.create(mb) for i = 1, mb do keep[i] = buffer.create(1048576) end return #keep', 'heap', true);
	for (let call = 1; call <= 30; call++) {
		const [count] = await chunk(3);
		expect.equal(count, 3, `call ${call}`);
	}
});

test('running out of the fixed heap aborts with a WebAssembly.RuntimeError', () => {
	const result = child(`
		const { LuauState } = await import('luau-web');
		const state = await LuauState.createAsync();
		try {
			await state.loadstring('local keep = {} for i = 1, 40 do keep[i] = buffer.create(1048576) end', 'oom', true)();
			console.log('no error');
		} catch (error) {
			console.log(error instanceof WebAssembly.RuntimeError ? 'RuntimeError' : 'other: ' + error.message);
		}
	`);
	expect.equal(result.stdout.trim(), 'RuntimeError', `stdout ${result.stdout} stderr ${result.stderr}`);
	expect.truthy(result.stderr.includes('OOM'), 'the runtime says OOM on stderr');
});

test('without JSPI (Safari) the Asyncify build runs the same Luau', () => {
	const script = `
		const { LuauState } = await import('luau-web');
		const state = await LuauState.createAsync();
		const values = await state.loadstring('local b = buffer.create(4) buffer.writef32(b, 0, math.sin(1)) return buffer.readf32(b, 0), bit32.bxor(0xffffffff, 1)', 'p', true)();
		console.log(JSON.stringify({ jspi: 'Suspending' in WebAssembly && 'promising' in WebAssembly, values }));
	`;
	const withJspi = JSON.parse(child(script).stdout);
	const without = JSON.parse(child(script, true).stdout);
	expect.equal(withJspi.jspi, true, 'the reference run uses the JSPI build (needs a Node with JSPI on, e.g. 25)');
	expect.equal(without.jspi, false, 'JSPI hidden');
	expect.equal(JSON.stringify(without.values), JSON.stringify(withJspi.values), 'same results');
	expect.equal(without.values[0], Math.fround(Math.sin(1)), 'float32 sin(1)');
});
