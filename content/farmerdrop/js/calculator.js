import { computeOrderFinancials } from "./financials.js";
import { parseDecimal, format, mul } from "./numeric.js";

const FIELDS = [
  { id: "subtotal", label: "Goods subtotal", scale: 2, value: "8.71", unit: "$" },
  { id: "tax", label: "Sales tax", scale: 2, value: "0.74", unit: "$" },
  { id: "cardPct", label: "card_percentage", scale: 5, value: "0.02900" },
  { id: "transferPct", label: "transfer_percentage", scale: 5, value: "0.00250" },
  { id: "platformPct", label: "platform_percentage", scale: 5, value: "0.10000" },
  { id: "drophostPct", label: "drophost_percentage", scale: 5, value: "0.10000" },
];

const LEGS = [
  { id: "fg", name: "farmer gross", expr: (i, f) => `round(${f} × ${i.subtotal}, 2)`, to: "farmer" },
  { id: "fc", name: "farmer's card share", expr: (i, f, ot) => `round(${i.cardPct} × ${f} × ${ot}, 2)`, to: "platform pot" },
  { id: "ft", name: "farmer's transfer reserve", expr: (i, f) => `round(${i.transferPct} × ${f} × ${i.subtotal}, 2)`, to: "held until payout" },
  { id: "dg", name: "drop host gross", expr: (i) => `round(${i.drophostPct} × ${i.subtotal}, 2)`, to: "drop host" },
  { id: "dc", name: "host's card share", expr: (i, f, ot) => `round(${i.cardPct} × ${i.drophostPct} × ${ot}, 2)`, to: "platform pot" },
  { id: "dt", name: "host's transfer reserve", expr: (i) => `round(${i.transferPct} × ${i.drophostPct} × ${i.subtotal}, 2)`, to: "held until payout" },
  { id: "pcp", name: "platform's card share", expr: (i, f, ot) => `round(${i.cardPct} × ${i.platformPct} × ${ot}, 2)`, to: "display only" },
];

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

function readInputs(form) {
  const values = {};
  const display = {};
  for (const field of FIELDS) {
    const text = form.elements[field.id].value;
    const parsed = parseDecimal(text, field.scale);
    if (!parsed) return { error: `${field.label} must be a non-negative number with at most ${field.scale} decimal places.` };
    values[field.id] = parsed;
    display[field.id] = format(parsed);
  }
  for (const rate of ["cardPct", "transferPct", "platformPct", "drophostPct"]) {
    if (values[rate].v > 100000n) return { error: "Rates are fractions between 0 and 1, as stored in numeric(6,5)." };
  }
  if (values.platformPct.v + values.drophostPct.v > 100000n) {
    return { error: "platform_percentage + drophost_percentage must not exceed 1." };
  }
  return { values, display };
}

function legRow(leg, result, display) {
  const f = format(result.farmerShare);
  const ot = format(result.orderTotal);
  const tr = el("tr");
  tr.dataset.leg = leg.id;
  tr.append(
    el("td", { className: "mono" }, leg.id),
    el("td", {}, leg.name),
    el("td", { className: "mono expr" }, leg.expr(display, f, ot)),
    el("td", { className: "mono num" }, format(result.raw[leg.id], { trim: true })),
    el("td", { className: "mono num strong" }, format(result.rounded[leg.id])),
    el("td", { className: "to" }, leg.to),
  );
  return tr;
}

function totalRow(id, label, formula, value) {
  const tr = el("tr", { className: "total" });
  tr.dataset.leg = id;
  tr.append(el("td", { className: "mono", colSpan: 2 }, label), el("td", { className: "mono expr", colSpan: 2 }, formula), el("td", { className: "mono num strong" }, value), el("td"));
  return tr;
}

function render(table, summary, result, display) {
  const r = result.rounded;
  const body = el("tbody");
  body.append(
    ...LEGS.map((leg) => legRow(leg, result, display)),
    totalRow("fp", "farmer_payout", `${format(r.fg)} − ${format(r.fc)} − ${format(r.ft)}`, format(result.farmerPayout)),
    totalRow("dp", "drophost_payout", `${format(r.dg)} − ${format(r.dc)} − ${format(r.dt)}`, format(result.drophostPayout)),
    totalRow("pt", "platform_total", `${format(result.orderTotal)} − ${display.tax} − ${format(result.farmerPayout)} − ${format(result.drophostPayout)}`, format(result.platformTotal)),
  );
  table.querySelector("tbody").replaceWith(body);
  const parts = [result.farmerPayout, result.drophostPayout, result.platformTotal].map((v) => format(v));
  summary.replaceChildren(
    el("span", { className: "mono" }, `farmer ${parts[0]} + host ${parts[1]} + platform ${parts[2]} + tax ${display.tax} = ${format(result.orderTotal)} = order_total`),
  );
}

/** Run many random orders through the port and report the identity and the rounding spread. */
function stressTest(count) {
  let held = 0;
  let minDrift = Infinity;
  let maxDrift = -Infinity;
  const rates = { cardPct: parseDecimal("0.029", 5), transferPct: parseDecimal("0.0025", 5), platformPct: parseDecimal("0.1", 5), drophostPct: parseDecimal("0.1", 5) };
  for (let i = 0; i < count; i += 1) {
    const subtotal = { v: BigInt(1 + Math.floor(Math.random() * 99999)), s: 2 };
    const tax = { v: (subtotal.v * BigInt(Math.floor(Math.random() * 11))) / 100n, s: 2 };
    const res = computeOrderFinancials({ subtotal, tax, ...rates });
    if (res.farmerPayout.v + res.drophostPayout.v + res.platformTotal.v + tax.v === res.orderTotal.v) held += 1;
    const residual = subtotal.v - res.rounded.fg.v - res.rounded.dg.v;
    const nominal = mul(rates.platformPct, subtotal);
    const drift = Number(residual) - Number(nominal.v) / 1e5;
    minDrift = Math.min(minDrift, drift);
    maxDrift = Math.max(maxDrift, drift);
  }
  return { held, minDrift, maxDrift };
}

export function createCalculator(host, sqlPanel) {
  const form = el("form", { className: "calc-inputs" });
  for (const field of FIELDS) {
    const input = el("input", { name: field.id, value: field.value, inputMode: "decimal", spellcheck: false, autocomplete: "off" });
    form.append(el("label", {}, el("span", { className: field.unit ? "" : "mono" }, field.label), input));
  }
  const error = el("p", { className: "calc-error", role: "alert" });
  const table = el("table", { className: "legs" });
  table.append(
    el("thead", {}, el("tr", {}, ...["alias", "leg", "expression", "exact", "round(…, 2)", "goes to"].map((h) => el("th", {}, h)))),
    el("tbody"),
  );
  const summary = el("p", { className: "calc-summary" });
  const stressButton = el("button", { type: "button", className: "stress" }, "Run 10,000 random orders");
  const stressOut = el("p", { className: "stress-out", "aria-live": "polite" });
  stressButton.addEventListener("click", () => {
    const { held, minDrift, maxDrift } = stressTest(10000);
    stressOut.textContent = `${held.toLocaleString()} of 10,000 split exactly to the cent. The platform's 10% of goods absorbed rounding between ${minDrift.toFixed(1)}¢ and +${maxDrift.toFixed(1)}¢.`;
  });

  host.replaceChildren(form, error, el("div", { className: "table-scroll" }, table), summary, el("div", { className: "stress-row" }, stressButton, stressOut));

  const update = () => {
    const { values, display, error: message } = readInputs(form);
    error.textContent = message || "";
    table.classList.toggle("is-stale", Boolean(message));
    if (!message) render(table, summary, computeOrderFinancials(values), display);
  };
  form.addEventListener("input", update);
  update();

  const link = (leg, on) => {
    sqlPanel.querySelectorAll(`[data-leg="${leg}"]`).forEach((n) => n.classList.toggle("is-linked", on));
    table.querySelectorAll(`[data-leg="${leg}"]`).forEach((n) => n.classList.toggle("is-linked", on));
  };
  for (const root of [table, sqlPanel]) {
    root.addEventListener("pointerover", (e) => {
      const target = e.target.closest("[data-leg]");
      if (target) link(target.dataset.leg, true);
    });
    root.addEventListener("pointerout", (e) => {
      const target = e.target.closest("[data-leg]");
      if (target) link(target.dataset.leg, false);
    });
  }
}

/** Tag the SQL panel's lines with the leg they compute, so hovering links code and numbers. */
export function tagSqlLegs(panel) {
  const rules = [
    [/AS fg\b/, "fg"], [/AS fc\b/, "fc"], [/AS ft\b/, "ft"], [/AS dg\b/, "dg"], [/AS dc\b/, "dc"], [/AS dt\b/, "dt"],
    [/AS pcp\b/, "pcp"], [/farmer_payout/, "fp"], [/drophost_payout/, "dp"], [/-- platform_total/, "pt"],
  ];
  for (const line of panel.querySelectorAll(".line")) {
    const hit = rules.find(([re]) => re.test(line.textContent));
    if (hit) line.dataset.leg = hit[1];
  }
}
