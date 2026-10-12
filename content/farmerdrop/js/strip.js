import { SEGMENTS, MONEY_STATES, CRATE_STOPS, TOTAL_CENTS, dollars } from "./money.js";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** The pinned status bar: where the crate is, and who owns each cent of the $10.00. */
export function createStrip(host) {
  const track = el("ol", "crate-track");
  const stops = CRATE_STOPS.map((stop) => {
    const li = el("li", "crate-stop");
    li.dataset.stop = stop.id;
    li.append(el("span", "crate-dot"), el("span", "crate-name", stop.label));
    track.append(li);
    return li;
  });

  const bar = el("div", "money-bar");
  const segments = SEGMENTS.map((seg) => {
    const part = el("span", `seg seg-${seg.id}`);
    part.title = seg.label;
    bar.append(part);
    return { seg, part };
  });
  const legend = el("ul", "money-legend");

  const crateBox = el("div", "strip-crate");
  crateBox.append(el("p", "strip-label", "The crate"), track);
  const moneyBox = el("div", "strip-money");
  moneyBox.append(el("p", "strip-label", "The $10.00"), bar, legend);
  host.replaceChildren(crateBox, moneyBox);

  return {
    set({ money, crate }) {
      const balances = MONEY_STATES[money] || MONEY_STATES.card;
      for (const { seg, part } of segments) {
        const cents = balances[seg.id] || 0;
        part.style.flexBasis = `${(cents / TOTAL_CENTS) * 100}%`;
        part.classList.toggle("is-empty", cents === 0);
      }
      legend.replaceChildren(
        ...SEGMENTS.filter((seg) => balances[seg.id]).map((seg) => {
          const li = el("li", `legend-${seg.id}`);
          li.append(el("span", "swatch"), el("span", "legend-name", seg.label), el("span", "legend-amount", dollars(balances[seg.id])));
          return li;
        }),
      );
      const at = CRATE_STOPS.findIndex((stop) => stop.id === crate);
      stops.forEach((li, i) => {
        li.classList.toggle("is-here", i === at);
        li.classList.toggle("is-passed", i < at);
      });
    },
  };
}
