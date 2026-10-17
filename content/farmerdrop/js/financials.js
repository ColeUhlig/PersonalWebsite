import { mul, round } from "./numeric.js";

/**
 * A line-for-line port of compute_order_financials (LocalHarvest migrations/0018_fees_taxes.sql:102).
 * Inputs: subtotal and tax at scale 2, rates at scale 5 (the numeric(6,5) columns snapshotted on the order).
 * Every leg is rounded once from the raw inputs, exactly as the SQL does.
 */
export function computeOrderFinancials({ subtotal, tax, cardPct, transferPct, platformPct, drophostPct }) {
  const one = { v: 100000n, s: 5 };
  const farmerShare = { v: one.v - platformPct.v - drophostPct.v, s: 5 };
  const ot = { v: subtotal.v + tax.v, s: 2 };

  const raw = {
    fg: mul(farmerShare, subtotal),
    fc: mul(cardPct, farmerShare, ot),
    ft: mul(transferPct, farmerShare, subtotal),
    dg: mul(drophostPct, subtotal),
    dc: mul(cardPct, drophostPct, ot),
    dt: mul(transferPct, drophostPct, subtotal),
    pcp: mul(cardPct, platformPct, ot),
  };
  const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, round(v, 2)]));
  const farmerPayout = r.fg.v - r.fc.v - r.ft.v;
  const drophostPayout = r.dg.v - r.dc.v - r.dt.v;
  const platformTotal = ot.v - tax.v - farmerPayout - drophostPayout;

  return {
    farmerShare,
    raw,
    rounded: r,
    orderTotal: ot,
    farmerPayout: { v: farmerPayout, s: 2 },
    drophostPayout: { v: drophostPayout, s: 2 },
    platformTotal: { v: platformTotal, s: 2 },
  };
}
