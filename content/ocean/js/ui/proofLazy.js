// Puts the Luau proof panel on the page only when the visitor scrolls near it or asks for it, so
// a visitor who never reaches the finale downloads none of it. Until then the spot holds a short
// placeholder with a button. The panel module is imported on demand; the WebAssembly runtime waits
// longer still, for the panel's own Run button (luau.worker.js imports it on the first run).
const PLACEHOLDER = `
	<p>The Luau proof panel: the Roblox modules themselves, running here and checked against this page's JavaScript.</p>
	<button type="button" data-proof="show">Show the Luau proof</button>`;

/**
 * @param {HTMLElement} root
 * @param {{ rootMargin?: string, importPanel?: () => Promise<typeof import('./proofPanel.js')>, panelDeps?: object, Observer?: typeof IntersectionObserver }} [options]
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
	placeholder.className = 'proof-placeholder';
	placeholder.dataset.proofState = 'waiting';
	placeholder.innerHTML = PLACEHOLDER;
	root.replaceChildren(placeholder);
	let observer = null;
	let mounting = null;
	let panel = null;

	function mountNow() {
		if (!mounting) {
			observer?.disconnect();
			placeholder.dataset.proofState = 'loading';
			mounting = importPanel()
				.then(({ mountProofPanel }) => {
					panel = mountProofPanel(root, panelDeps);
					return panel;
				})
				.catch((error) => {
					// A module that failed to load stays failed for this page (the browser keeps the
					// failure in its module map), so the button goes and the text says to reload.
					placeholder.dataset.proofState = 'failed';
					placeholder.querySelector('p').textContent = `The Luau proof panel could not be loaded (${error?.message ?? error}). Reload the page to try again.`;
					placeholder.querySelector('[data-proof="show"]').hidden = true;
					return null;
				});
		}
		return mounting;
	}

	placeholder.querySelector('[data-proof="show"]').addEventListener('click', () => {
		mountNow();
	});
	if (typeof Observer === 'function') {
		observer = new Observer(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					mountNow();
				}
			},
			{ rootMargin },
		);
		observer.observe(root);
	}

	function destroy() {
		observer?.disconnect();
		panel?.destroy();
		root.replaceChildren();
	}

	return Object.freeze({ mountNow, destroy });
}
