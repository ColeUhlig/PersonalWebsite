import { createSequence } from "./sequence.js";

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

/**
 * One failure figure: its sequence diagram, drawn a step at a time, and its numbered step list.
 * Step k shows every row up to the one before step k+1's first row; the last step shows them all.
 */
export function createFailureStepper(figure, scene) {
  const canvas = figure.querySelector(".seq-canvas");
  const diagram = createSequence(canvas, scene);
  const steps = [...figure.querySelectorAll(".steps li[data-row]")];
  const firstRow = steps.map((li) => Number(li.dataset.row));
  const upto = (k) => (k < steps.length - 1 ? firstRow[k + 1] - 1 : diagram.rowCount);

  const prev = el("button", { type: "button", className: "step-btn", textContent: "← Prev" });
  const next = el("button", { type: "button", className: "step-btn", textContent: "Next →" });
  const count = el("span", { className: "step-count mono" });
  // Screen readers hear the step number and its text on every change, whichever layout is showing.
  const announce = el("span", { className: "visually-hidden" });
  announce.setAttribute("aria-live", "polite");
  // On narrow screens the step list is hidden and the current step's text sits under the controls.
  const caption = el("p", { className: "step-caption" });
  const column = el("div", { className: "seq-column" });
  canvas.replaceWith(column);
  column.append(canvas, el("div", { className: "step-controls" }, prev, count, next), caption, announce);

  let current = -1;
  function go(k, { animate = true } = {}) {
    const target = Math.max(0, Math.min(steps.length - 1, k));
    const from = target > current ? (current < 0 ? 0 : upto(current)) : firstRow[target] - 1;
    current = target;
    diagram.show(upto(target), target === 0 ? 0 : from, { animate });
    steps.forEach((li, i) => {
      li.classList.toggle("is-focus", i === target);
      li.classList.toggle("is-future", i > target);
      li.setAttribute("aria-current", i === target ? "step" : "false");
    });
    count.textContent = `step ${target + 1} of ${steps.length}`;
    caption.replaceChildren(...[...steps[target].childNodes].map((node) => node.cloneNode(true)));
    announce.textContent = `Step ${target + 1} of ${steps.length}: ${steps[target].textContent.trim()}`;
    // A focused button that becomes disabled drops focus to the page, which would end arrow-key stepping.
    const focused = document.activeElement;
    prev.disabled = target === 0;
    next.disabled = target === steps.length - 1;
    if (focused === next && next.disabled) prev.focus();
    if (focused === prev && prev.disabled) next.focus();
  }

  prev.addEventListener("click", () => go(current - 1));
  next.addEventListener("click", () => go(current + 1));
  steps.forEach((li, i) => {
    li.tabIndex = 0;
    li.addEventListener("click", () => go(i));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go(i);
      }
    });
  });
  figure.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      go(current + (e.key === "ArrowRight" ? 1 : -1));
    }
  });

  // Step 1 is laid out at once and drawn in the first time the figure scrolls into view.
  go(0, { animate: false });
  diagram.show(0, 0, { animate: false });
  new IntersectionObserver((entries, observer) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    if (current === 0) diagram.show(upto(0), 0);
  }, { threshold: 0.35 }).observe(canvas);

  return { go };
}
