/**
 * Exact fixed-point arithmetic on BigInt, so the browser reproduces Postgres `numeric` to the digit.
 * A value is { v: BigInt, s: scale } meaning v / 10^s.
 */

const TEN = 10n;

export function pow10(n) {
  return TEN ** BigInt(n);
}

/** Parse a non-negative decimal string ("8.71", "2.9") into a value with exactly `scale` places. */
export function parseDecimal(text, scale) {
  const clean = String(text).trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  if (frac.length > scale) return null;
  return { v: BigInt(whole + frac.padEnd(scale, "0")), s: scale };
}

export function mul(...terms) {
  return terms.reduce((acc, t) => ({ v: acc.v * t.v, s: acc.s + t.s }), { v: 1n, s: 0 });
}

/** Postgres round(numeric, places): half away from zero. */
export function round(value, places = 2) {
  if (value.s <= places) return { v: value.v * pow10(places - value.s), s: places };
  const divisor = pow10(value.s - places);
  const sign = value.v < 0n ? -1n : 1n;
  const abs = value.v * sign;
  const q = abs / divisor;
  const r = abs % divisor;
  return { v: sign * (r * 2n >= divisor ? q + 1n : q), s: places };
}

export function format(value, { trim = false } = {}) {
  const sign = value.v < 0n ? "−" : "";
  const digits = (value.v < 0n ? -value.v : value.v).toString().padStart(value.s + 1, "0");
  const whole = digits.slice(0, digits.length - value.s);
  let frac = value.s ? digits.slice(-value.s) : "";
  if (trim) frac = frac.replace(/0+$/, "").padEnd(2, "0");
  return frac ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
}

export const cents = (value) => Number(round(value, 2).v);
