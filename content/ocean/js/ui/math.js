// "The math" lines (piece C; spec 2: "a collapsed 'The math' line with the real equation (KaTeX),
// terms coloured to match what they control"). The HTML carries each formula as TeX source, which
// is what shows if KaTeX never arrives. The first time any line is opened, KaTeX's stylesheet and
// module are fetched from jsDelivr (never before, so a visitor who never opens one downloads
// none of it) and every line is typeset at once. Nothing is typeset until the stylesheet has
// loaded too: KaTeX's markup without it shows every formula twice, worse than the source.
import { KATEX_CSS, KATEX_OPTIONS, stackEquations } from '../page/mathTrust.js';

function loadStylesheet(href) {
	const existing = document.querySelector(`link[href="${href}"]`);
	if (existing?.sheet) {
		return Promise.resolve();
	}
	const link = existing ?? document.createElement('link');
	const loaded = new Promise((resolve, reject) => {
		link.addEventListener('load', () => resolve(), { once: true });
		link.addEventListener('error', () => reject(new Error(`the stylesheet ${href} did not load`)), { once: true });
	});
	if (!existing) {
		link.rel = 'stylesheet';
		link.href = href;
		document.head.append(link);
	}
	return loaded;
}

export async function loadKatex() {
	const [module] = await Promise.all([import('katex'), loadStylesheet(KATEX_CSS)]);
	return module.default ?? module;
}

export function startMath({ load = loadKatex, onRendered = () => {} } = {}) {
	const lines = [...document.querySelectorAll('details.math')];
	let loading = null;
	let state = 'waiting';

	function typeset(katex) {
		for (const details of lines) {
			const tex = details.querySelector('.tex');
			const code = tex?.querySelector('code');
			if (!code) continue;
			const source = code.textContent;
			const target = document.createElement('div');
			target.className = 'tex-rendered';
			katex.render(stackEquations(source), target, KATEX_OPTIONS);
			tex.dataset.tex = source;
			tex.replaceChildren(target);
		}
	}

	function ensure() {
		if (!loading) {
			state = 'loading';
			loading = load()
				.then((katex) => {
					typeset(katex);
					state = 'rendered';
				})
				.catch((error) => {
					state = 'failed';
					console.warn('[ocean] KaTeX did not load; the math stays as TeX source', error);
				})
				.then(() => {
					if (state === 'rendered') onRendered();
				})
				.catch((error) => console.error('[ocean] the page could not lay out again after typesetting the math', error));
		}
		return loading;
	}

	for (const details of lines) {
		details.addEventListener('toggle', () => {
			if (details.open) ensure();
		});
	}
	return Object.freeze({ ensure, state: () => state });
}
