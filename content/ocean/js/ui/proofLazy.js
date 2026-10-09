// Puts the Luau proof panel on the page only when the visitor scrolls near it or asks for it, so
// a visitor who never reaches the finale downloads none of it. Until then the spot holds a short
// placeholder with a button. The panel module is imported on demand; the WebAssembly runtime waits
// longer still, for the panel's own Run button (luau.worker.js imports it on the first run).
//
// Once destroy() has run, nothing mounts: not a module import still in flight, not a later
// mountNow(), not an intersection the observer had already queued.
const PLACEHOLDER = `
	<p>The Roblox game's Luau code, executed in this browser and checked against this page's JavaScript port.</p>
	<button type="button" data-proof="show">Show the panel</button>`;
// Short sentences for the page; the detail goes to the console.
const IMPORT_FAILED = 'The verification panel could not be loaded. Reload the page to try again.';
const MOUNT_FAILED = 'The verification panel could not be started. Reload the page to try again.';

/**
 * @param {HTMLElement} root
 * @param {{ rootMargin?: string, importPanel?: () => Promise<typeof import('./proofPanel.js')>, panelDeps?: object, Observer?: typeof IntersectionObserver }} [options]
 *   panelDeps goes to mountProofPanel as it is; `panelDeps.embedded` also makes the placeholder
 *   bare, since the host page supplies the glass box.
 * @returns {{ mountNow: () => Promise<ReturnType<typeof import('./proofPanel.js').mountProofPanel> | null>, destroy: () => void }}
 */
export function mountProofPanelWhenNear(root, options = {}) {
	const {
		rootMargin = '600px 0px',
		importPanel = () => import('./proofPanel.js'),
		panelDeps = {},
		Observer = globalThis.IntersectionObserver,
	} = options;
	const placeholder = document.createElement('div');
	placeholder.className = panelDeps.embedded ? 'proof-placeholder proof-placeholder--embedded' : 'proof-placeholder';
	placeholder.dataset.proofState = 'waiting';
	placeholder.innerHTML = PLACEHOLDER;
	root.replaceChildren(placeholder);
	let observer = null;
	let mounting = null;
	let panel = null;
	let destroyed = false;

	function showFailure(sentence) {
		placeholder.dataset.proofState = 'failed';
		placeholder.querySelector('p').textContent = sentence;
		placeholder.querySelector('[data-proof="show"]').hidden = true;
	}

	function mount({ mountProofPanel }) {
		if (destroyed) {
			return null;
		}
		try {
			panel = mountProofPanel(root, panelDeps);
			return panel;
		} catch (error) {
			console.error('The proof panel failed to start', error);
			root.replaceChildren(placeholder); // the panel may have replaced it before it threw
			showFailure(MOUNT_FAILED);
			return null;
		}
	}

	function importFailed(error) {
		// A module that failed to load stays failed for this page (the browser keeps the failure
		// in its module map), so the button goes and the text says to reload.
		if (!destroyed) {
			console.error('The proof panel module failed to load', error);
			showFailure(IMPORT_FAILED);
		}
		return null;
	}

	function mountNow() {
		if (destroyed) {
			return mounting ?? Promise.resolve(null);
		}
		if (!mounting) {
			observer?.disconnect();
			placeholder.dataset.proofState = 'loading';
			mounting = importPanel().then(mount, importFailed);
		}
		return mounting;
	}

	placeholder.querySelector('[data-proof="show"]').addEventListener('click', () => {
		mountNow();
	});
	if (typeof Observer === 'function') {
		observer = new Observer(
			(entries) => {
				if (!destroyed && entries.some((entry) => entry.isIntersecting)) {
					mountNow();
				}
			},
			{ rootMargin },
		);
		observer.observe(root);
	}

	function destroy() {
		destroyed = true;
		observer?.disconnect();
		panel?.destroy();
		panel = null;
		root.replaceChildren();
	}

	return Object.freeze({ mountNow, destroy });
}
