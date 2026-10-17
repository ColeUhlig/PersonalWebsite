/**
 * The ledger rows the $10.00 order writes, phase by phase, as asserted in LocalHarvest's
 * tests/fees-ten-dollar-protocol.test.ts. Amounts in cents; positive = that account gained money.
 */

const PHASES = [
  {
    id: "paid",
    crate: "farm",
    label: "Paid",
    source: "applySucceededPaymentIntent → bookCharge",
    note: "Stripe's fee is modelled from the snapshot: round(0.029 × 1000) + 30 = 59. The finance fee less the 30¢ fixed card fee is recognised now. Everything else goes to holding.",
    rows: [
      ["member", "debit", -1000], ["member", "payment", 1000], ["stripe", "payment", 1000],
      ["holding", "payment", 916], ["platform", "earning", 25, "Finance fee"],
      ["stripe_fee", "adjustment", 59, "Stripe fee"], ["stripe", "adjustment", -59, "Stripe fee"],
    ],
  },
  {
    id: "received",
    crate: "host",
    label: "Drop host received",
    source: "applyReceiveLedger, same transaction as the receive",
    note: "The farmer earns farmer_payout. The platform earns platform_total with Stripe's variable fee taken out: round(114 × (1 − 29/114)) − 2 = 83. The 2¢ transfer reserve stays in holding.",
    rows: [
      ["holding", "adjustment", -673, "Recognize farmer"], ["farmer", "earning", 673],
      ["holding", "adjustment", -83, "Recognize platform"], ["platform", "earning", 83],
    ],
  },
  {
    id: "handover",
    crate: "customer",
    label: "Picked up",
    source: "pickup resolution, same transaction as the hand-over",
    note: "Hand-over earns the drop host its share and settles the sales tax out of holding. Only the transfer reserve is left.",
    rows: [
      ["holding", "adjustment", -84, "Drop host earning"], ["dropspot", "earning", 84],
      ["holding", "adjustment", -74, "Sales tax settled"], ["tax_authority", "tax", 74],
    ],
  },
  {
    id: "farmerPaid",
    crate: "customer",
    label: "Farmer paid",
    source: "executePayout: compare-and-set, then transfers.create",
    note: "A Connect transfer pays the farmer. The reserve is realised to the platform. Stripe's payout fee is accrued as pending rows until the month-end bill confirms it, so it is not in the balances yet.",
    rows: [
      ["farmer", "payout", -673], ["stripe", "payout", -673],
      ["holding", "adjustment", -2, "Transfer reserve realized"], ["platform", "adjustment", 2, "Transfer reserve realized"],
      ["stripe_fee", "adjustment", 27, "Expected Stripe transfer fee", "pending"],
      ["stripe", "adjustment", -27, "Expected Stripe transfer fee", "pending"],
      ["platform", "adjustment", -27, "Expected Stripe transfer fee", "pending"],
    ],
  },
  {
    id: "hostPaid",
    crate: "customer",
    label: "Drop host paid",
    source: "executePayout",
    note: "Holding is zero. The remaining stripe cash is exactly the tax still owed plus the platform's earnings.",
    rows: [
      ["dropspot", "payout", -84], ["stripe", "payout", -84],
      ["stripe_fee", "adjustment", 25, "Expected Stripe transfer fee", "pending"],
      ["stripe", "adjustment", -25, "Expected Stripe transfer fee", "pending"],
      ["platform", "adjustment", -25, "Expected Stripe transfer fee", "pending"],
    ],
  },
];

const CRATE_STOPS = [
  { id: "farm", label: "Farm" },
  { id: "host", label: "Drop host" },
  { id: "customer", label: "Customer" },
];

// The bar's segments, in order. Each is what that account has been allocated so far: its confirmed rows
// excluding payouts, so a farmer's share stays on the bar after the transfer moves the cash out.
const SEGMENTS = [
  { account: "holding", label: "holding" },
  { account: "farmer", label: "farmer" },
  { account: "dropspot", label: "dropspot" },
  { account: "tax_authority", label: "tax_authority" },
  { account: "platform", label: "platform" },
  { account: "stripe_fee", label: "stripe_fee" },
];
const TOTAL_CENTS = 1000;

const ACCOUNTS = ["stripe", "holding", "farmer", "dropspot", "tax_authority", "platform", "stripe_fee"];
const RIGHT_SIDE = ["holding", "farmer", "dropspot", "tax_authority", "platform"];

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

const signed = (c) => (c < 0 ? `−${Math.abs(c)}` : c > 0 ? `+${c}` : "0");

/** Balance = SUM(amount) WHERE status = 'confirmed', through phase `upto`. */
function balances(upto) {
  const totals = Object.fromEntries(ACCOUNTS.map((a) => [a, 0]));
  PHASES.slice(0, upto + 1).forEach((phase) =>
    phase.rows.forEach(([party, , amount, , status = "confirmed"]) => {
      if (status === "confirmed" && party in totals) totals[party] += amount;
    }),
  );
  return totals;
}

/** Per account: confirmed non-payout rows through phase `upto`, and whether a payout has gone out. */
export function allocations(upto) {
  const cents = Object.fromEntries(SEGMENTS.map(({ account }) => [account, 0]));
  const paidOut = new Set();
  PHASES.slice(0, upto + 1).forEach((phase) =>
    phase.rows.forEach(([party, type, amount, , status = "confirmed"]) => {
      if (status !== "confirmed" || !(party in cents)) return;
      if (type === "payout") paidOut.add(party);
      else cents[party] += amount;
    }),
  );
  return { cents, paidOut };
}

const dollars = (c) => `$${(c / 100).toFixed(2)}`;

/** Where the crate is and who has been allocated each of the $10.00's cents, for the selected phase. */
function createFlow() {
  const marker = el("span", { className: "crate-marker" });
  marker.setAttribute("aria-hidden", "true");
  const stops = CRATE_STOPS.map((stop) => el("li", { className: "crate-stop" }, el("span", { className: "crate-dot" }), stop.label));
  const track = el("ol", { className: "crate-track" }, ...stops);
  track.append(marker);
  const parts = SEGMENTS.map(({ account }) => el("span", { className: `seg seg-${account}` }));
  const bar = el("div", { className: "money-bar" }, ...parts);
  bar.setAttribute("aria-hidden", "true");
  const legend = el("ul", { className: "money-legend mono" });
  const box = el("div", { className: "flow" },
    el("div", { className: "flow-crate" }, el("p", { className: "flow-label" }, "crate"), track),
    el("div", { className: "flow-money" }, el("p", { className: "flow-label" }, "$10.00 by account, payouts included"), bar, legend));

  return {
    box,
    set(i) {
      const at = CRATE_STOPS.findIndex((stop) => stop.id === PHASES[i].crate);
      marker.style.left = `calc(9px + ${at / (CRATE_STOPS.length - 1)} * (100% - 18px))`;
      stops.forEach((li, j) => {
        li.classList.toggle("is-here", j === at);
        li.classList.toggle("is-passed", j < at);
      });
      const { cents, paidOut } = allocations(i);
      parts.forEach((part, j) => {
        const c = cents[SEGMENTS[j].account];
        part.style.flexGrow = String(c / TOTAL_CENTS);
        part.classList.toggle("is-paid", paidOut.has(SEGMENTS[j].account));
      });
      legend.replaceChildren(...SEGMENTS.filter(({ account }) => cents[account]).map(({ account, label }) =>
        el("li", { className: `legend-${account}` }, el("span", { className: "swatch" }), `${label} `,
          el("b", {}, dollars(cents[account])), paidOut.has(account) ? " paid out" : "")));
    },
  };
}

function rowsTable(upto) {
  let n = 0;
  const body = el("tbody");
  PHASES.slice(0, upto + 1).forEach((phase, p) => {
    phase.rows.forEach(([party, type, amount, comment = "", status = "confirmed"]) => {
      n += 1;
      const tr = el("tr", { className: `${p === upto ? "is-new" : "is-old"} ${status === "pending" ? "is-pending" : ""}` });
      tr.append(
        el("td", { className: "num" }, String(n)),
        el("td", {}, party),
        el("td", {}, type),
        el("td", {}, status),
        el("td", { className: `num ${amount < 0 ? "neg" : ""}` }, signed(amount)),
        el("td", { className: "comment" }, comment),
      );
      body.append(tr);
    });
  });
  const table = el("table", { className: "rows mono" });
  table.append(el("thead", {}, el("tr", {}, ...["id", "party_type", "entry_type", "status", "amount ¢", "comment"].map((h) => el("th", {}, h)))), body);
  return table;
}

function balanceTable(upto) {
  const b = balances(upto);
  const table = el("table", { className: "balances mono" });
  table.append(
    el("thead", {}, el("tr", {}, ...ACCOUNTS.map((a) => el("th", {}, a)))),
    el("tbody", {}, el("tr", {}, ...ACCOUNTS.map((a) => el("td", { className: `num acct-${a}` }, String(b[a]))))),
  );
  const rhs = RIGHT_SIDE.reduce((s, a) => s + b[a], 0);
  const identity = el(
    "p",
    { className: "identity mono" },
    `stripe ${b.stripe} = ${RIGHT_SIDE.map((a) => `${a} ${b[a]}`).join(" + ")} = ${rhs} ${rhs === b.stripe ? "✓" : "✗"}`,
  );
  return [table, identity];
}

export function createLedger(host) {
  const tabs = el("div", { className: "phase-tabs", role: "tablist" });
  const meta = el("div", { className: "phase-meta" });
  const rowsBox = el("div", { className: "table-scroll rows-box" });
  const balBox = el("div", { className: "table-scroll" });
  const flow = createFlow();
  let current = 0;
  const buttons = PHASES.map((phase, i) => {
    const b = el("button", { type: "button", role: "tab" }, `${i + 1}. ${phase.label}`);
    b.addEventListener("click", () => show(i));
    tabs.append(b);
    return b;
  });
  tabs.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = Math.max(0, Math.min(PHASES.length - 1, current + (e.key === "ArrowRight" ? 1 : -1)));
    show(next);
    buttons[next].focus();
  });
  const panel = el("div", { id: "ledger-phase", role: "tabpanel" }, flow.box, meta, balBox, rowsBox);
  buttons.forEach((b) => b.setAttribute("aria-controls", panel.id));
  host.replaceChildren(tabs, panel);

  function show(i) {
    current = i;
    buttons.forEach((b, j) => {
      b.setAttribute("aria-selected", String(i === j));
      b.tabIndex = i === j ? 0 : -1;
    });
    flow.set(i);
    const phase = PHASES[i];
    meta.replaceChildren(el("p", { className: "phase-source mono" }, phase.source), el("p", {}, phase.note));
    balBox.replaceChildren(...balanceTable(i));
    rowsBox.replaceChildren(rowsTable(i));
  }
  show(0);
}
