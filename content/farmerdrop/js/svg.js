const NS = "http://www.w3.org/2000/svg";

/**
 * Create an SVG element.
 * @param {string} tag
 * @param {Record<string, string|number>} [attrs]
 * @param {string} [text]
 * @returns {SVGElement}
 */
export function svg(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

/** @param {number} cents */
export function dollars(cents) {
  const sign = cents < 0 ? "−" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Run `frame(progress)` from 0 to 1 over `ms`. Resolves when done.
 * Under reduced motion it jumps straight to the end.
 * @param {number} ms
 * @param {(p: number) => void} frame
 * @param {number} [delay]
 * @returns {Promise<void>}
 */
export function tween(ms, frame, delay = 0) {
  if (prefersReducedMotion()) {
    frame(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const begin = () => {
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / ms);
        frame(ease(p));
        if (p < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    };
    if (delay > 0) setTimeout(begin, delay);
    else begin();
  });
}
