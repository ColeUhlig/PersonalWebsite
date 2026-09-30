// The Luau proof panel (spec section 5): one button runs one cascade at one seed through the Luau
// modules from roblox-ocean (in the WebAssembly runtime, in a Web Worker) and through the A1
// JavaScript twin, then shows both height maps, their difference, the largest difference, the
// verdict and both timings, next to the Luau source that ran. Self-contained: content/ocean/proof.html
// shows it on its own, with its own heading, lede and glass box; piece C places it in the finale
// with `embedded: true`, which leaves those three to the host.
//
// Every failure ends in a sentence in the status line, never an uncaught error: no Web Workers,
// a runtime or bundle that cannot load, a Luau error, a crashed or silent runtime. The JavaScript
// result is drawn first, so it stays on screen whatever happens to the Luau side; the Luau map and
// the difference are drawn only from the run that produced them, and are blanked (and say so)
// whenever that run has not finished or has failed, so a stale picture never sits beside a
// verdict it does not belong to.
import { runCascadeTwin } from '../proof/twinRunner.js';
import { cascadeOptions } from '../proof/proofConfig.js';
import { compareFloat32, verdict } from '../proof/compare.js';
import { createLuauClient } from '../proof/luauClient.js';
import { BUNDLE_URL, LUAU_FORK, LUAU_RELEASE, LUAU_WEB_VERSION } from '../proof/runtime.js';
import { FIELD_NAMES } from '../core/fieldStore.js';
import { differenceImage, heightImage, symmetricScale } from './proofImages.js';
import { moduleSections } from './luauSource.js';

const DEFAULT_MODULE = 'Cascade';
const NOT_COMPARED = 'Not compared';
// The packed fields measured in studs; the slopes and the Jacobian terms have no unit.
const LENGTH_FIELDS = new Set(['height', 'dispX', 'dispZ']);
// The eight packed fields in words, with the names the largest difference uses (FIELD_NAMES).
const FIELDS_IN_WORDS = 'height, sideways x/z (dispX, dispZ), slopes x/z (slopeX, slopeZ) and the three Jacobian terms (jxx, jzz, jxz)';
// The Luau map's word after a failure: 'No result' once the Luau had started, 'Not run' otherwise.
const LUAU_STARTED = new Set(['run', 'timeout']);

// The sentence for each failure stage; `detail` is the error's own message, so a missing bundle
// or a compile error is not passed off as the network.
const EXPLANATIONS = Object.freeze({
	wasm: () => "This browser has WebAssembly switched off, so I can't run the Luau here. The JavaScript result is shown alone.",
	spawn: (detail) => `This browser can't start a Web Worker (${detail}), so the Luau side can't run here. The JavaScript result is shown alone.`,
	load: (detail) => `The Luau runtime or the Luau bundle could not be loaded (${detail}). The JavaScript result is shown alone; press Run to try again.`,
	run: (detail) => `The Luau code raised an error (${detail}). The JavaScript result is shown alone.`,
	crash: (detail) => `The Luau runtime stopped (${detail}): it ran out of memory or hit a fault. The JavaScript result is shown alone; press Run to start a fresh one.`,
	timeout: (detail) => `The Luau run took too long and was stopped (${detail}). The JavaScript result is shown alone; press Run to try again.`,
});

// What the next run has to do before the Luau can run, after how the last one ended.
const RUNTIME_AFTER = Object.freeze({ wasm: 'retry', spawn: 'retry', load: 'retry', run: 'ready', crash: 'stopped', timeout: 'stopped' });
const STARTING = Object.freeze({
	fresh: 'Loading the Luau runtime (first run only) and running the Luau…',
	retry: 'Loading the Luau runtime again and running the Luau…',
	stopped: 'Reloading the Luau runtime (it stopped last time) and running the Luau…',
	ready: 'Running the Luau…',
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

function messageOf(error) {
	return error?.message ?? String(error);
}

function explain(error) {
	const known = EXPLANATIONS[error?.stage];
	return known ? known(messageOf(error)) : `Something went wrong (${messageOf(error)}).`;
}

function lowerFirst(text) {
	return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "2.38e-7 studs in dispX": the largest difference, with the field it is in. */
function describeLargest(result, cells) {
	if (result.differing === 0) {
		return '0 (none)';
	}
	const field = FIELD_NAMES[Math.floor(result.largestAt / cells)] ?? 'an unknown field';
	if (result.largest === 0) {
		// The bits differ but the values are equal: +0 against -0.
		return `0 (only the sign of a zero differs, in ${field})`;
	}
	const unit = LENGTH_FIELDS.has(field) ? ' studs' : '';
	return `${result.largest.toExponential(2)}${unit} in ${field}`;
}

function map(name, caption, n) {
	return `<figure data-map="${name}"><div class="proof-frame"><canvas width="${n}" height="${n}" data-proof="${name}"></canvas><span class="proof-empty"></span></div><figcaption>${caption}</figcaption></figure>`;
}

// The heading and lede, left out when embedded: the host page supplies its own.
const INTRO = `
		<h2 class="proof-title">This is my actual Roblox code, running in your browser.</h2>
		<p class="proof-lede">I run the same wave cascade twice: through my actual Luau modules from the Roblox game, and through the JavaScript port that drives this page. Then I compare what they produce.</p>`;

function markup(o, embedded) {
	return `${embedded ? '' : INTRO}
		<div class="proof-body">
			<div class="proof-results">
				<button type="button" class="proof-run" data-proof="run">Run both</button>
				<p class="proof-status" data-proof="status" role="status" aria-live="polite"></p>
				<div class="proof-maps">
					${map('luau-map', 'Luau height', o.n)}
					${map('js-map', 'JavaScript height', o.n)}
					${map('diff-map', 'Height difference', o.n)}
				</div>
				<dl class="proof-numbers">
					<div><dt>Verdict</dt><dd data-proof="verdict">Not run yet</dd></div>
					<div><dt>Largest difference</dt><dd data-proof="largest">–</dd></div>
					<div><dt>Values that differ</dt><dd data-proof="differing">–</dd></div>
					<div><dt>Luau time</dt><dd data-proof="luau-ms">–</dd></div>
					<div><dt>JavaScript time</dt><dd data-proof="js-ms">–</dd></div>
				</dl>
				<p class="proof-note">Each run is one wave cascade, ${o.n} × ${o.n} cells at seed ${o.seed}. Both times cover building, evolving and transforming it.</p>
				<p class="proof-note">My Luau runs on ${LUAU_FORK}, a fork of Luau ${LUAU_RELEASE}, packaged as luau-web ${LUAU_WEB_VERSION}: an interpreter compiled to WebAssembly, not Roblox's VM, so the Luau time isn't Roblox's.</p>
				<p class="proof-note">The comparison covers all eight fields: ${FIELDS_IN_WORDS}. Black in the height difference means the two agree to the bit. Both sides draw their random numbers from the same documented generator, not Roblox's.</p>
			</div>
			<div class="proof-source">
				<label class="proof-module">Luau module <select data-proof="module"></select></label>
				<p class="proof-origin" data-proof="origin"></p>
				<pre><code data-proof="source">Loading the Luau source…</code></pre>
			</div>
		</div>`;
}

/**
 * @param {HTMLElement} root emptied and filled with the panel
 * @param {{ embedded?: boolean, createClient?: () => ReturnType<typeof createLuauClient>, loadSource?: () => Promise<string>, runTwin?: typeof runCascadeTwin, options?: import('../proof/luauRunner.js').CascadeOptions }} [deps]
 *   embedded: true when a host page supplies the heading, the introduction and the glass box
 *   (piece C's finale); the panel then leaves out its h2, its lede and its own glass.
 */
export function mountProofPanel(root, deps = {}) {
	const { embedded = false, createClient = defaultClient, loadSource = defaultLoadSource, runTwin = runCascadeTwin, options = cascadeOptions() } = deps;
	const section = document.createElement('section');
	section.className = embedded ? 'proof proof--embedded' : 'proof';
	section.dataset.proofState = 'idle';
	section.innerHTML = markup(options, embedded);
	root.replaceChildren(section);
	const find = (name) => section.querySelector(`[data-proof="${name}"]`);
	const button = find('run');
	const cells = options.n * options.n;
	let client = null;
	let runtime = 'fresh';
	let running = null;
	let destroyed = false;

	const setState = (state) => {
		section.dataset.proofState = state;
	};
	const setText = (name, text) => {
		find(name).textContent = text;
	};

	// A map either shows pixels from the current run, or is blank with a word saying why.
	function blank(name, why) {
		const canvas = find(name);
		canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
		const figure = canvas.closest('figure');
		figure.dataset.empty = '';
		figure.querySelector('.proof-empty').textContent = why;
	}
	function draw(name, pixels) {
		const canvas = find(name);
		canvas.getContext('2d')?.putImageData(new ImageData(pixels, options.n, options.n), 0, 0);
		const figure = canvas.closest('figure');
		delete figure.dataset.empty;
		figure.querySelector('.proof-empty').textContent = '';
	}

	function fail(sentence, luauWord = 'Not run') {
		blank('luau-map', luauWord);
		blank('diff-map', NOT_COMPARED);
		setText('verdict', NOT_COMPARED);
		setText('status', sentence);
		setState('failed');
	}

	function showSource(sections, name) {
		const part = sections.get(name);
		setText('origin', part.origin);
		setText('source', part.text);
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
				setText('source', `The Luau source could not be loaded (${messageOf(error)}).`);
			}
		});

	function begin() {
		setState('running');
		button.setAttribute('aria-disabled', 'true');
		for (const name of ['largest', 'differing', 'luau-ms', 'js-ms']) {
			setText(name, '–');
		}
		setText('verdict', 'Running');
		blank('js-map', 'Running…');
		blank('luau-map', 'Running…');
		blank('diff-map', 'Waiting for the Luau');
	}

	function showResults(js, luau) {
		const all = compareFloat32(luau.packed, js.packed);
		const heights = compareFloat32(luau.packed.subarray(0, cells), js.packed.subarray(0, cells));
		const scale = symmetricScale(js.packed, cells);
		draw('luau-map', heightImage(luau.packed, options.n, scale));
		draw('diff-map', differenceImage(luau.packed, js.packed, options.n, heights.largest > 0 ? heights.largest : 1));
		const line = verdict(all);
		setText('verdict', line);
		setText('largest', describeLargest(all, cells));
		setText('differing', `${all.differing.toLocaleString('en-US')} of ${all.count.toLocaleString('en-US')} (all eight fields)`);
		setText('luau-ms', `${luau.ms.toFixed(1)} ms`);
		// loadMs runs from spawning the worker to its first answer, minus the Luau run itself.
		const loading = luau.loadMs > 0 ? ` Starting the Luau (worker, runtime and bundle) took ${Math.round(luau.loadMs)} ms.` : '';
		setText('status', `Done: ${lowerFirst(line)}.${loading}`);
		setState('done');
	}

	async function runOnce() {
		begin();
		let js;
		try {
			js = runTwin(options);
		} catch (error) {
			console.warn('JavaScript proof run failed', error);
			blank('js-map', 'Failed');
			fail(`The JavaScript port failed (${messageOf(error)}).`);
			return;
		}
		draw('js-map', heightImage(js.packed, options.n, symmetricScale(js.packed, cells)));
		setText('js-ms', `${js.ms.toFixed(1)} ms`);
		setText('status', STARTING[runtime]);
		let luau;
		try {
			client ??= createClient();
			luau = await client.runCascade(options);
		} catch (error) {
			if (destroyed) {
				return;
			}
			console.warn('Luau proof run failed', error);
			runtime = RUNTIME_AFTER[error?.stage] ?? runtime;
			fail(explain(error), LUAU_STARTED.has(error?.stage) ? 'No result' : 'Not run');
			return;
		}
		if (destroyed) {
			return;
		}
		runtime = 'ready';
		showResults(js, luau);
	}

	function run() {
		if (destroyed) {
			return Promise.resolve();
		}
		if (!running) {
			running = runOnce()
				.catch((error) => {
					// Nothing above should throw; if something does, it still ends as a sentence.
					console.warn('Luau proof panel failed', error);
					if (!destroyed) {
						fail(`Something went wrong (${messageOf(error)}).`);
					}
				})
				.finally(() => {
					button.removeAttribute('aria-disabled');
					running = null;
				});
		}
		return running;
	}

	button.addEventListener('click', () => {
		run();
	});

	blank('luau-map', 'Not run yet');
	blank('js-map', 'Not run yet');
	blank('diff-map', 'Not compared yet');

	function destroy() {
		destroyed = true;
		client?.dispose();
		root.replaceChildren();
	}

	return Object.freeze({ run, destroy, element: section });
}
