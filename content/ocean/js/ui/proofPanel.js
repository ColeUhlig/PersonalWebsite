// The Luau proof panel (spec section 5): one button runs one cascade at one seed through the Luau
// modules from roblox-ocean (in the WebAssembly runtime, in a Web Worker) and through the A1
// JavaScript twin, then shows both height maps, their difference, the largest difference, the
// verdict and both timings, next to the Luau source that ran. Self-contained: piece C places it
// in the finale; content/ocean/proof.html shows it on its own.
//
// Every failure ends in a sentence in the status line, never an uncaught error: no Web Workers,
// a runtime or bundle that cannot load, a Luau error, a crashed or silent runtime. The JavaScript
// result is drawn first, so it stays on screen whatever happens to the Luau side.
import { runCascadeTwin } from '../proof/twinRunner.js';
import { cascadeOptions } from '../proof/proofConfig.js';
import { compareFloat32, verdict } from '../proof/compare.js';
import { createLuauClient } from '../proof/luauClient.js';
import { BUNDLE_URL, LUAU_RELEASE, LUAU_WEB_VERSION } from '../proof/runtime.js';
import { differenceImage, heightImage, symmetricScale } from './proofImages.js';
import { moduleSections } from './luauSource.js';

const DEFAULT_MODULE = 'Cascade';

const EXPLANATIONS = Object.freeze({
	spawn: 'This browser cannot start a Web Worker, so the Luau side cannot run here. The JavaScript result is shown alone.',
	load: 'The Luau runtime could not be loaded (offline, blocked, or not supported by this browser). The JavaScript result is shown alone.',
	crash: 'The Luau runtime stopped (it ran out of memory or hit a fault). Press Run to start a fresh one.',
	timeout: 'The Luau run did not finish within a minute and was stopped. Press Run to try again.',
});

function defaultClient() {
	return createLuauClient({
		spawn: () => new Worker(new URL('../workers/luau.worker.js', import.meta.url), { type: 'module' }),
	});
}

async function defaultLoadSource() {
	const response = await fetch(BUNDLE_URL);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	return response.text();
}

function explain(error) {
	const known = EXPLANATIONS[error?.stage];
	if (known) {
		return known;
	}
	if (error?.stage === 'run') {
		return `The Luau code raised an error: ${error.message}`;
	}
	return `Something went wrong: ${error?.message ?? error}`;
}

function markup(o) {
	const cells = `${o.n} x ${o.n}`;
	return `
		<h2 class="proof-title">This is the actual Roblox code, running in your browser.</h2>
		<p class="proof-lede">One wave cascade (${cells} cells, seed ${o.seed}) computed twice: by the Luau modules from the Roblox project, running in Luau compiled to WebAssembly, and by this page's JavaScript port.</p>
		<div class="proof-body">
			<div class="proof-results">
				<button type="button" class="proof-run" data-proof="run">Run both</button>
				<p class="proof-status" data-proof="status" role="status" aria-live="polite"></p>
				<div class="proof-maps">
					<figure><canvas width="${o.n}" height="${o.n}" data-proof="luau-map"></canvas><figcaption>Luau height</figcaption></figure>
					<figure><canvas width="${o.n}" height="${o.n}" data-proof="js-map"></canvas><figcaption>JavaScript height</figcaption></figure>
					<figure><canvas width="${o.n}" height="${o.n}" data-proof="diff-map"></canvas><figcaption>Difference (black: identical)</figcaption></figure>
				</div>
				<dl class="proof-numbers">
					<div><dt>Verdict</dt><dd data-proof="verdict">Not run yet</dd></div>
					<div><dt>Largest difference</dt><dd data-proof="largest">–</dd></div>
					<div><dt>Values that differ</dt><dd data-proof="differing">–</dd></div>
					<div><dt>Luau time</dt><dd data-proof="luau-ms">–</dd></div>
					<div><dt>JavaScript time</dt><dd data-proof="js-ms">–</dd></div>
				</dl>
				<p class="proof-note">Both times cover building, evolving and transforming the cascade. The Luau runs in an interpreter compiled to WebAssembly (Luau ${LUAU_RELEASE}, luau-web ${LUAU_WEB_VERSION}), not in Roblox's own VM, so its time is not Roblox's. Both sides draw their random numbers from the same documented generator, not from Roblox's.</p>
			</div>
			<div class="proof-source">
				<label class="proof-module">Luau module <select data-proof="module"></select></label>
				<p class="proof-origin" data-proof="origin"></p>
				<pre><code data-proof="source">Loading the Luau source…</code></pre>
			</div>
		</div>`;
}

function draw(canvas, pixels, n) {
	const context = canvas.getContext('2d');
	if (context) {
		context.putImageData(new ImageData(pixels, n, n), 0, 0);
	}
}

/**
 * @param {HTMLElement} root emptied and filled with the panel
 * @param {{ createClient?: () => ReturnType<typeof createLuauClient>, loadSource?: () => Promise<string>, runTwin?: typeof runCascadeTwin, options?: import('../proof/luauRunner.js').CascadeOptions }} [deps]
 */
export function mountProofPanel(root, deps = {}) {
	const { createClient = defaultClient, loadSource = defaultLoadSource, runTwin = runCascadeTwin, options = cascadeOptions() } = deps;
	const section = document.createElement('section');
	section.className = 'proof';
	section.dataset.proofState = 'idle';
	section.innerHTML = markup(options);
	root.replaceChildren(section);
	const find = (name) => section.querySelector(`[data-proof="${name}"]`);
	const button = find('run');
	const cells = options.n * options.n;
	let client = null;
	let running = null;
	let destroyed = false;

	const setState = (state) => {
		section.dataset.proofState = state;
	};
	const setStatus = (text) => {
		find('status').textContent = text;
	};
	const setNumber = (name, text) => {
		find(name).textContent = text;
	};

	function showSource(sections, name) {
		const part = sections.get(name);
		find('origin').textContent = part.origin;
		find('source').textContent = part.text;
	}

	loadSource()
		.then((text) => {
			if (destroyed) {
				return;
			}
			const sections = moduleSections(text);
			const select = find('module');
			for (const name of sections.keys()) {
				select.append(new Option(name, name, false, name === DEFAULT_MODULE));
			}
			select.addEventListener('change', () => showSource(sections, select.value));
			showSource(sections, sections.has(DEFAULT_MODULE) ? DEFAULT_MODULE : select.value);
		})
		.catch((error) => {
			if (!destroyed) {
				find('source').textContent = `The Luau source could not be loaded (${error?.message ?? error}).`;
			}
		});

	async function runOnce() {
		setState('running');
		button.disabled = true;
		for (const name of ['largest', 'differing', 'luau-ms', 'js-ms']) {
			setNumber(name, '–');
		}
		setNumber('verdict', 'Running');
		let js;
		try {
			js = runTwin(options);
		} catch (error) {
			setStatus(`The JavaScript port failed: ${error?.message ?? error}`);
			setNumber('verdict', 'Not compared');
			setState('failed');
			return;
		}
		const scale = symmetricScale(js.packed, cells);
		draw(find('js-map'), heightImage(js.packed, options.n, scale), options.n);
		setNumber('js-ms', `${js.ms.toFixed(1)} ms`);
		const firstRun = client === null;
		setStatus(firstRun ? 'Loading the Luau runtime (first run only) and running the Luau…' : 'Running the Luau…');
		let luau;
		try {
			client ??= createClient();
			luau = await client.runCascade(options);
		} catch (error) {
			if (destroyed) {
				return;
			}
			setStatus(explain(error));
			setNumber('verdict', 'Not compared: the Luau side did not run');
			setState('failed');
			return;
		}
		if (destroyed) {
			return;
		}
		draw(find('luau-map'), heightImage(luau.packed, options.n, scale), options.n);
		const heights = compareFloat32(luau.packed.subarray(0, cells), js.packed.subarray(0, cells));
		draw(find('diff-map'), differenceImage(luau.packed, js.packed, options.n, heights.largest > 0 ? heights.largest : 1), options.n);
		const all = compareFloat32(luau.packed, js.packed);
		setNumber('verdict', verdict(all));
		setNumber('largest', all.differing === 0 ? '0 (none)' : `${all.largest.toExponential(2)} studs`);
		setNumber('differing', `${all.differing.toLocaleString('en-US')} of ${all.count.toLocaleString('en-US')} (all eight fields)`);
		setNumber('luau-ms', `${luau.ms.toFixed(1)} ms`);
		setStatus(luau.loadMs > 0 ? `Done. Loading the Luau runtime took ${Math.round(luau.loadMs)} ms.` : 'Done.');
		setState('done');
	}

	function run() {
		if (!running) {
			running = runOnce()
				.catch((error) => {
					// Nothing above should throw; if something does, it still ends as a sentence.
					setStatus(`Something went wrong: ${error?.message ?? error}`);
					setState('failed');
				})
				.finally(() => {
					button.disabled = false;
					running = null;
				});
		}
		return running;
	}

	button.addEventListener('click', () => {
		run();
	});

	function destroy() {
		destroyed = true;
		client?.dispose();
		root.replaceChildren();
	}

	return Object.freeze({ run, destroy, element: section });
}
