import { SPLIT, TOTAL_CENTS, dollars } from "./money.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function row(title, parts, kind) {
  const wrapper = el("div", `split-row split-${kind}`);
  wrapper.append(el("p", "split-title", title));
  const bar = el("div", "split-bar");
  for (const part of parts) {
    const piece = el("div", `split-piece ${part.id ? `seg-${part.id}` : ""}`);
    piece.style.flexGrow = String(part.cents);
    piece.append(el("span", "split-amount", dollars(part.cents)), el("span", "split-name", part.label));
    bar.append(piece);
  }
  wrapper.append(bar);
  return wrapper;
}

/** Two stacked bars: what the customer pays, and who ends up with it. */
export function renderSplit(host) {
  const total = SPLIT.paidTo.reduce((sum, p) => sum + p.cents, 0);
  if (total !== TOTAL_CENTS) throw new Error(`Split adds up to ${total}, not ${TOTAL_CENTS}`);
  host.replaceChildren(
    row("What the customer pays", SPLIT.charged, "charged"),
    row("Where it ends up", SPLIT.paidTo, "paid"),
  );
}
