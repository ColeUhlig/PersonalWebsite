// Typesets the paper's mathematics. Each `.m` (inline) and `.eq` (display) element holds raw TeX
// as its text, so the page still reads correctly if KaTeX fails to load.
import katex from 'katex';

const OPTIONS = { throwOnError: false, strict: 'ignore' };

function typeset(selector, displayMode) {
  for (const el of document.querySelectorAll(selector)) {
    katex.render(el.textContent.trim(), el, { ...OPTIONS, displayMode });
  }
}

typeset('.m', false);
typeset('.eq', true);
