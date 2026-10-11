// Frozen data for the system map. Every amount is in cents and comes from the
// "$10 protocol" fixture in LocalHarvest (tests/fees-ten-dollar-protocol.test.ts):
// $8.71 of produce + $0.74 sales tax + $0.55 finance fee = $10.00.

export const ACCOUNTS = Object.freeze([
  { id: "card", label: "Customer's card", party: "customer" },
  { id: "stripeFee", label: "Stripe fees", party: "stripe" },
  { id: "holding", label: "Holding", party: "holding", wide: true },
  { id: "farmer", label: "Owed to farmer", party: "farmer" },
  { id: "farmerBank", label: "Farmer's account", party: "farmer", paid: true },
  { id: "host", label: "Owed to host", party: "host" },
  { id: "hostBank", label: "Host's account", party: "host", paid: true },
  { id: "tax", label: "Sales tax", party: "tax" },
  { id: "platform", label: "Farmerdrop", party: "platform" },
]);

export const GOODS_NODES = Object.freeze([
  { id: "farm", label: "Farm", sub: "picks and packs" },
  { id: "truck", label: "On the road", sub: "farmer drives" },
  { id: "dropHost", label: "Drop host", sub: "a neighbour's porch" },
  { id: "customer", label: "Customer", sub: "picks up" },
]);

export const SYSTEM_NODES = Object.freeze([
  { id: "checkout", label: "Checkout", sub: "web or app" },
  { id: "stripe", label: "Stripe", sub: "cards, tax, transfers" },
  { id: "webhook", label: "Webhook", sub: "Stripe calls back" },
  { id: "server", label: "Server + ledger", sub: "Postgres" },
  { id: "reconciler", label: "Reconciler", sub: "every 5 minutes" },
  { id: "admin", label: "Admin", sub: "runs payouts" },
]);

const EMPTY = Object.freeze({
  card: 0, stripeFee: 0, holding: 0, farmer: 0, farmerBank: 0,
  host: 0, hostBank: 0, tax: 0, platform: 0,
});

export const balances = (overrides) => Object.freeze({ ...EMPTY, ...overrides });

export const START = balances({ card: 1000 });
export const PAID = balances({ stripeFee: 59, holding: 916, platform: 25 });
export const RECEIVED = balances({ stripeFee: 59, holding: 160, farmer: 673, platform: 108 });
export const PICKED_UP = balances({
  stripeFee: 59, holding: 2, farmer: 673, host: 84, tax: 74, platform: 108,
});
export const PAID_OUT = balances({
  stripeFee: 59, farmerBank: 673, hostBank: 84, tax: 74, platform: 110,
});

// One step = one moment in the order's life. `goods` is where the crate is,
// `system` the services involved, `flows` the money that moves into this step,
// `trigger` the goods node whose hand-off causes the money to move.
export const HAPPY_PATH = Object.freeze([
  {
    id: "placed",
    title: "Order placed",
    goods: { at: "farm", state: "growing" },
    system: ["checkout", "stripe", "server"],
    edges: [["checkout", "server"], ["server", "stripe"]],
    balances: START,
    flows: [],
    caption:
      "A customer orders $8.71 of tomatoes. The server asks Stripe Tax for the sales tax ($0.74), adds a flat $0.55 fee, and freezes today's fee rates onto the order. Nothing is charged yet.",
    ledger: ["No ledger entries. An unpaid order owns no money."],
  },
  {
    id: "paid",
    title: "Paid",
    goods: { at: "farm", state: "growing" },
    system: ["checkout", "stripe", "webhook", "server"],
    edges: [["checkout", "stripe"], ["stripe", "webhook"], ["webhook", "server"]],
    balances: PAID,
    flows: [
      ["card", "holding", 916],
      ["card", "stripeFee", 59],
      ["card", "platform", 25],
    ],
    caption:
      "The card is charged $10.00 into Farmerdrop's own Stripe balance. Nobody else has earned anything yet, so almost all of it goes into Holding: money that belongs to the order, not to a person.",
    ledger: [
      "Stripe cash +$10.00",
      "Stripe fees +$0.59 (2.9% + 30¢)",
      "Farmerdrop +$0.25 (the 55¢ fee less Stripe's 30¢)",
      "Holding +$9.16",
    ],
  },
  {
    id: "packed",
    title: "Packed",
    goods: { at: "farm", state: "packed" },
    system: ["server"],
    edges: [],
    balances: PAID,
    flows: [],
    caption:
      "The farmer packs the crate and the server prints a box label. Packing is a promise, not a delivery, so no money moves.",
    ledger: ["No ledger entries."],
  },
  {
    id: "driving",
    title: "On the road",
    goods: { at: "truck", state: "packed" },
    system: [],
    edges: [],
    balances: PAID,
    flows: [],
    caption:
      "The farmer drives the crate to the drop host. The farmer is still responsible for it, and the money still waits in Holding.",
    ledger: ["No ledger entries."],
  },
  {
    id: "received",
    title: "Received",
    goods: { at: "dropHost", state: "packed" },
    system: ["server"],
    edges: [],
    trigger: "dropHost",
    balances: RECEIVED,
    flows: [
      ["holding", "farmer", 673],
      ["holding", "platform", 83],
    ],
    caption:
      "The drop host counts what arrived. That count is the moment the farmer has delivered, so the farmer's share moves out of Holding and becomes money owed to them.",
    ledger: ["Holding −$7.56", "Owed to farmer +$6.73", "Farmerdrop +$0.83"],
  },
  {
    id: "pickedUp",
    title: "Picked up",
    goods: { at: "customer", state: "packed" },
    system: ["server"],
    edges: [],
    trigger: "customer",
    balances: PICKED_UP,
    flows: [
      ["holding", "host", 84],
      ["holding", "tax", 74],
    ],
    caption:
      "The customer collects the crate. Now the host has done their job too, and the sale is final, so the host's cut and the sales tax leave Holding. Two cents stay behind to cover transfer costs.",
    ledger: ["Holding −$1.58", "Owed to host +$0.84", "Sales tax +$0.74"],
  },
  {
    id: "paidOut",
    title: "Paid out",
    goods: { at: "customer", state: "done" },
    system: ["server", "stripe"],
    edges: [["server", "stripe"]],
    balances: PAID_OUT,
    flows: [
      ["farmer", "farmerBank", 673],
      ["host", "hostBank", 84],
      ["holding", "platform", 2],
    ],
    caption:
      "A payout sends Stripe transfers to the farmer's and host's own accounts. Holding is now exactly zero, and every cent of the $10.00 has a single owner.",
    ledger: [
      "Owed to farmer −$6.73 → farmer's account",
      "Owed to host −$0.84 → host's account",
      "Holding −$0.02 → Farmerdrop",
    ],
  },
]);

export const TOTAL_CENTS = 1000;
