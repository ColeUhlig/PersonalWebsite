/** Where the $10.00 order's cents sit at each moment. Synthetic order; amounts in cents. */

export const TOTAL_CENTS = 1000;

export const SEGMENTS = Object.freeze([
  { id: "card", label: "Customer's card" },
  { id: "unrecorded", label: "At Stripe, not in my books" },
  { id: "holding", label: "Held for the order" },
  { id: "stripeFee", label: "Stripe fee" },
  { id: "farmer", label: "Farmer" },
  { id: "host", label: "Drop host" },
  { id: "tax", label: "Sales tax" },
  { id: "platform", label: "Farmerdrop" },
]);

export const MONEY_STATES = Object.freeze({
  card: { card: 1000 },
  unrecorded: { unrecorded: 1000 },
  paid: { holding: 916, stripeFee: 59, platform: 25 },
  received: { holding: 160, stripeFee: 59, farmer: 673, platform: 108 },
  pickedUp: { holding: 2, stripeFee: 59, farmer: 673, host: 84, tax: 74, platform: 108 },
  paidOut: { stripeFee: 59, farmer: 673, host: 84, tax: 74, platform: 110 },
});

export const CRATE_STOPS = Object.freeze([
  { id: "farm", label: "Farm" },
  { id: "road", label: "Truck" },
  { id: "host", label: "Drop host" },
  { id: "customer", label: "Customer" },
]);

/** The $10.00 split, as asserted to the cent by LocalHarvest's ten-dollar protocol test. */
export const SPLIT = Object.freeze({
  charged: [
    { label: "Food", cents: 871 },
    { label: "Sales tax", cents: 74 },
    { label: "Finance fee", cents: 55 },
  ],
  paidTo: [
    { id: "farmer", label: "Farmer", cents: 673 },
    { id: "host", label: "Drop host", cents: 84 },
    { id: "tax", label: "Sales tax", cents: 74 },
    { id: "stripeFee", label: "Stripe", cents: 59 },
    { id: "platform", label: "Farmerdrop", cents: 110 },
  ],
});

export function dollars(cents) {
  const sign = cents < 0 ? "−" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}
