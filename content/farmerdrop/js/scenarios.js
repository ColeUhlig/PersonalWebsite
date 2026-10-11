// "What if" replays. Each scenario is a list of steps drawn on the same map as
// the happy path. Behaviour is taken from research/08-what-if-failure-catalogue.md;
// amounts reuse the $10.00 order so every tube still sums to $10.00.
//
// Step fields: title, tone ("ok" | "fail" | "recover"), goods {at, state},
// system (lit nodes), failed (nodes with ✕), edges / brokenEdges ([from, to]),
// badges {node: text}, flows ([from, to, cents]; "@node" means a system node),
// balances (omit to keep the previous step's), caption, ledger.

import { START, PAID, RECEIVED, PICKED_UP, balances } from "./data.js";

const FARM = { at: "farm", state: "growing" };
const AT_HOST = { at: "dropHost", state: "packed" };
const AT_CUSTOMER = { at: "customer", state: "packed" };

const BOOK_FROM_STRIPE = [
  ["@stripe", "holding", 916],
  ["@stripe", "stripeFee", 59],
  ["@stripe", "platform", 25],
];

const BOOKED_LEDGER = ["Stripe fees +$0.59", "Farmerdrop +$0.25", "Holding +$9.16"];

const FARMER_PAID = balances({
  stripeFee: 59, farmerBank: 673, host: 84, tax: 74, platform: 110,
});

const CAPTURED = balances({});

const LOST_CRATE_REFUNDED = balances({
  card: 945, stripeFee: 32, holding: 2, farmer: 673, host: -760, platform: 108,
});

export const SCENARIOS = Object.freeze([
  {
    id: "tab-closed",
    question: "What if the customer closes the tab right after paying?",
    category: "Confirming a payment",
    start: { balances: START, goods: FARM },
    outcome: "Booked once, within five minutes, without the browser or the webhook.",
    steps: [
      {
        title: "The card is charged",
        tone: "ok",
        goods: FARM,
        system: ["checkout", "stripe"],
        edges: [["checkout", "stripe"]],
        badges: { stripe: "$10.00 captured" },
        flows: [["card", "@stripe", 1000]],
        balances: CAPTURED,
        caption:
          "Stripe takes the $10.00 into Farmerdrop's balance. My ledger doesn't know yet: until the server hears about it, the money is real but unbooked.",
        ledger: ["Nothing booked yet."],
      },
      {
        title: "The tab closes",
        tone: "fail",
        goods: FARM,
        system: ["stripe"],
        failed: ["checkout"],
        brokenEdges: [["checkout", "server"]],
        badges: { stripe: "$10.00 unbooked" },
        caption:
          "The browser was about to tell the server the payment went through. It never gets the chance.",
        ledger: ["Nothing booked yet."],
      },
      {
        title: "The webhook doesn't arrive either",
        tone: "fail",
        goods: FARM,
        system: ["stripe"],
        failed: ["checkout", "webhook"],
        brokenEdges: [["stripe", "webhook"], ["webhook", "server"]],
        badges: { stripe: "$10.00 unbooked" },
        caption:
          "Maybe the server was restarting. Stripe will keep retrying for days, but I don't want to depend on that.",
        ledger: ["Nothing booked yet."],
      },
      {
        title: "The reconciler asks Stripe directly",
        tone: "recover",
        goods: FARM,
        system: ["reconciler", "stripe"],
        edges: [["reconciler", "stripe"]],
        badges: { reconciler: "checks every 5 min", stripe: "succeeded" },
        caption:
          "Every five minutes a job looks at every order still marked 'processing' and asks Stripe what really happened. It doesn't need the browser or the webhook.",
        ledger: ["Nothing booked yet."],
      },
      {
        title: "Booked through the same door",
        tone: "recover",
        goods: FARM,
        system: ["reconciler", "server"],
        edges: [["reconciler", "server"]],
        badges: { server: "one booking function" },
        flows: BOOK_FROM_STRIPE,
        balances: PAID,
        caption:
          "The reconciler calls the exact function the webhook would have called. One transaction books the ledger and marks the order paid.",
        ledger: BOOKED_LEDGER,
      },
      {
        title: "The late webhook changes nothing",
        tone: "ok",
        goods: FARM,
        system: ["webhook", "server"],
        edges: [["stripe", "webhook"], ["webhook", "server"]],
        badges: { server: "already paid: no-op" },
        caption:
          "When Stripe's retry finally lands, the server sees the order is already paid and books nothing. The money is counted once.",
        ledger: ["No new entries."],
      },
    ],
  },
  {
    id: "race",
    question: "What if the webhook and the browser arrive at the same moment?",
    category: "Confirming a payment",
    start: { balances: START, goods: FARM },
    outcome: "Two messages, one booking. A row lock decides, a unique index backs it up.",
    steps: [
      {
        title: "The card is charged",
        tone: "ok",
        goods: FARM,
        system: ["checkout", "stripe"],
        edges: [["checkout", "stripe"]],
        badges: { stripe: "$10.00 captured" },
        flows: [["card", "@stripe", 1000]],
        balances: CAPTURED,
        caption: "The payment succeeds at Stripe.",
        ledger: ["Nothing booked yet."],
      },
      {
        title: "Two messages race in",
        tone: "fail",
        goods: FARM,
        system: ["checkout", "webhook", "server"],
        edges: [["checkout", "server"], ["stripe", "webhook"], ["webhook", "server"]],
        badges: { server: "2 requests, same order", stripe: "$10.00 unbooked" },
        caption:
          "The browser says 'paid' and Stripe's webhook says 'paid' within milliseconds. Booking both would count $10.00 twice.",
        ledger: ["Nothing booked yet."],
      },
      {
        title: "The browser's claim is checked",
        tone: "recover",
        goods: FARM,
        system: ["server", "stripe"],
        edges: [["server", "stripe"]],
        badges: { server: "never trust the browser", stripe: "succeeded" },
        caption:
          "The server doesn't take the browser's word for it. It asks Stripe for the payment itself before doing anything.",
        ledger: ["Nothing booked yet."],
      },
      {
        title: "First one in books it",
        tone: "recover",
        goods: FARM,
        system: ["server"],
        badges: { server: "order row locked" },
        flows: BOOK_FROM_STRIPE,
        balances: PAID,
        caption:
          "Both requests queue on a lock on the order's row. The first books the ledger and marks the order paid, in one transaction.",
        ledger: BOOKED_LEDGER,
      },
      {
        title: "The second walks away",
        tone: "ok",
        goods: FARM,
        system: ["server"],
        badges: { server: "already paid: no-op" },
        caption:
          "The second request gets the lock, sees 'paid', and books nothing. If anything ever slipped past the lock, a unique index on the payment entry would reject the copy.",
        ledger: ["No new entries."],
      },
    ],
  },
  {
    id: "crash-setup",
    question: "What if the server crashes while setting up the payment?",
    category: "Confirming a payment",
    start: { balances: START, goods: FARM },
    outcome: "The intent is written down before Stripe is called, so a retry reuses it. One charge at most.",
    steps: [
      {
        title: "Write it down first",
        tone: "ok",
        goods: FARM,
        system: ["checkout", "server"],
        edges: [["checkout", "server"]],
        badges: { server: "outbox: charge key saved" },
        caption:
          "Before calling Stripe, the server records what it's about to do in an outbox table, under a key made from the orders and the amount.",
        ledger: ["Nothing booked."],
      },
      {
        title: "Stripe creates the payment",
        tone: "ok",
        goods: FARM,
        system: ["server", "stripe"],
        edges: [["server", "stripe"]],
        badges: { stripe: "payment created (same key)" },
        caption: "Stripe is called with the same key as its idempotency key.",
        ledger: ["Nothing booked."],
      },
      {
        title: "The server dies",
        tone: "fail",
        goods: FARM,
        system: ["stripe"],
        failed: ["server"],
        brokenEdges: [["server", "stripe"]],
        caption:
          "The process crashes before it saves what Stripe sent back. A naive retry would create a second payment.",
        ledger: ["Nothing booked."],
      },
      {
        title: "The customer tries again",
        tone: "recover",
        goods: FARM,
        system: ["checkout", "server"],
        edges: [["checkout", "server"]],
        badges: { server: "same key: same outbox row" },
        caption:
          "The retry (or a double-click) builds the same key, so the outbox hands back the existing row instead of a new one.",
        ledger: ["Nothing booked."],
      },
      {
        title: "Stripe returns the same payment",
        tone: "recover",
        goods: FARM,
        system: ["server", "stripe"],
        edges: [["server", "stripe"]],
        badges: { stripe: "same payment, not a new one" },
        caption:
          "Stripe recognises the key and returns the payment it already made. The customer can be charged at most once.",
        ledger: ["Nothing booked."],
      },
    ],
  },
  {
    id: "tax-down",
    question: "What if Stripe Tax is down when the order is placed?",
    category: "Placing an order",
    start: { balances: START, goods: FARM },
    outcome: "The whole order rolls back. An untaxed order can never exist.",
    steps: [
      {
        title: "One transaction opens",
        tone: "ok",
        goods: FARM,
        system: ["checkout", "server"],
        edges: [["checkout", "server"]],
        badges: { server: "transaction open" },
        caption:
          "Placing an order writes the order, its lines and its packing slips inside one database transaction.",
        ledger: ["Nothing booked."],
      },
      {
        title: "The tax call fails",
        tone: "fail",
        goods: FARM,
        system: ["server"],
        failed: ["stripe"],
        brokenEdges: [["server", "stripe"]],
        caption:
          "Sales tax is calculated by Stripe Tax inside that same transaction. Stripe Tax times out.",
        ledger: ["Nothing booked."],
      },
      {
        title: "Everything rolls back",
        tone: "recover",
        goods: FARM,
        system: ["server", "checkout"],
        failed: ["stripe"],
        badges: { server: "rolled back", checkout: "cart kept" },
        caption:
          "The transaction is undone: no order, no lines, no slips. The customer keeps their cart, sees the reason, and can try again. The $10.00 never left the card.",
        ledger: ["Nothing booked."],
      },
    ],
  },
  {
    id: "stripe-down",
    question: "What if Stripe is down when the customer clicks Pay?",
    category: "Placing an order",
    start: { balances: START, goods: FARM },
    outcome: "Fails closed: no charge, no stock taken, the order is cancelled cleanly.",
    steps: [
      {
        title: "Pay is clicked",
        tone: "ok",
        goods: FARM,
        system: ["checkout", "server"],
        edges: [["checkout", "server"]],
        caption: "The server is asked to set up a card payment for the order.",
        ledger: ["Nothing booked."],
      },
      {
        title: "Stripe doesn't answer",
        tone: "fail",
        goods: FARM,
        system: ["server"],
        failed: ["stripe"],
        brokenEdges: [["server", "stripe"]],
        caption: "Creating the payment fails: a network error, a 5xx, or a rate limit.",
        ledger: ["Nothing booked."],
      },
      {
        title: "Nothing is half-done",
        tone: "recover",
        goods: FARM,
        system: ["server", "checkout"],
        failed: ["stripe"],
        badges: { server: "order cancelled", checkout: "error shown" },
        caption:
          "The unpacked order is cancelled and the customer is sent back to review with the error. Stock is only taken after payment, so the farmer's inventory was never touched.",
        ledger: ["Nothing booked."],
      },
    ],
  },
  {
    id: "lost-crate",
    question: "What if the drop host loses the crate, and Stripe is down when I refund?",
    category: "Refunds and liability",
    start: { balances: RECEIVED, goods: AT_HOST },
    outcome: "The customer gets $9.45 back, the host owes $7.60, and the failed refund retried itself.",
    steps: [
      {
        title: "The crate is on the shelf",
        tone: "ok",
        goods: AT_HOST,
        system: [],
        caption:
          "The host counted the crate in, so the farmer has already been credited. From here the host is responsible for it.",
        ledger: ["No new entries."],
      },
      {
        title: "The customer gets nothing",
        tone: "fail",
        goods: { at: "dropHost", state: "lost" },
        goodsFailed: ["dropHost"],
        system: ["server"],
        badges: { server: "claim: host liable" },
        caption:
          "At pickup the crate can't be found. The host records zero handed over. The host held it last, so the shortfall is the host's.",
        ledger: ["No money moves yet."],
      },
      {
        title: "The refund is priced in Postgres",
        tone: "ok",
        goods: { at: "dropHost", state: "lost" },
        goodsFailed: ["dropHost"],
        system: ["server"],
        badges: { server: "refund $9.45" },
        flows: [["holding", "host", 84], ["holding", "tax", 74]],
        balances: PICKED_UP,
        caption:
          "The database computes the refund: $8.71 of goods plus $0.74 of tax. The pickup itself still settles the host's cut and the tax out of Holding.",
        ledger: ["Holding −$1.58", "Owed to host +$0.84", "Sales tax +$0.74"],
      },
      {
        title: "Stripe is down",
        tone: "fail",
        goods: { at: "dropHost", state: "lost" },
        system: ["server"],
        failed: ["stripe"],
        brokenEdges: [["server", "stripe"]],
        badges: { server: "refund saved as failed" },
        caption:
          "The refund call fails. The outbox row is marked failed and nothing is written to the ledger, so the books never claim a refund that didn't happen.",
        ledger: ["No refund entries."],
      },
      {
        title: "The reconciler retries",
        tone: "recover",
        goods: { at: "dropHost", state: "lost" },
        system: ["reconciler", "server", "stripe"],
        edges: [["reconciler", "server"], ["server", "stripe"]],
        badges: { reconciler: "retry, same key", stripe: "refund $9.45" },
        flows: [["host", "card", 844], ["tax", "card", 74], ["stripeFee", "card", 27]],
        balances: LOST_CRATE_REFUNDED,
        caption:
          "Five minutes later the retry goes out with the same key, so it can't refund twice. Stripe returns its 27¢ percentage fee, which is netted against what the host owes.",
        ledger: [
          "Customer's card +$9.45",
          "Owed to host −$8.44",
          "Sales tax −$0.74",
          "Stripe fees −$0.27",
        ],
      },
      {
        title: "The host owes $7.60",
        tone: "ok",
        goods: { at: "dropHost", state: "lost" },
        system: ["server"],
        badges: { server: "next payout absorbs it" },
        caption:
          "The host's balance is negative. Their next payout has to cover it before they're paid anything. The farmer, who delivered, keeps $6.73.",
        ledger: ["Owed to host: −$7.60"],
      },
    ],
  },
  {
    id: "double-click",
    question: "What if an admin double-clicks “Execute payout”?",
    category: "Paying out",
    start: { balances: PICKED_UP, goods: AT_CUSTOMER },
    outcome: "One transfer. A stored key, a lookup, and a compare-and-set each block the second.",
    steps: [
      {
        title: "Two clicks",
        tone: "fail",
        goods: AT_CUSTOMER,
        system: ["admin", "server"],
        edges: [["admin", "server"]],
        badges: { admin: "clicked twice" },
        caption: "Two requests to pay the farmer arrive at once.",
        ledger: ["No new entries."],
      },
      {
        title: "Both get the same key",
        tone: "recover",
        goods: AT_CUSTOMER,
        system: ["server"],
        badges: { server: "one stored key" },
        caption:
          "The payout's idempotency key is stored on its row the first time. Row locking means both requests read that same key.",
        ledger: ["No new entries."],
      },
      {
        title: "Look before sending",
        tone: "recover",
        goods: AT_CUSTOMER,
        system: ["server", "stripe"],
        edges: [["server", "stripe"]],
        badges: { stripe: "any transfer for this payout?" },
        caption:
          "Before moving money the server asks Stripe whether a transfer for this payout already exists.",
        ledger: ["No new entries."],
      },
      {
        title: "One transfer goes out",
        tone: "ok",
        goods: AT_CUSTOMER,
        system: ["server", "stripe"],
        edges: [["server", "stripe"]],
        badges: { stripe: "1 transfer" },
        flows: [["farmer", "farmerBank", 673], ["holding", "platform", 2]],
        balances: FARMER_PAID,
        caption:
          "Even if both requests reach Stripe, the shared key means Stripe creates one transfer. $6.73 lands in the farmer's own account.",
        ledger: ["Owed to farmer −$6.73 → farmer's account", "Holding −$0.02 → Farmerdrop"],
      },
      {
        title: "The second is refused",
        tone: "ok",
        goods: AT_CUSTOMER,
        system: ["server", "admin"],
        badges: { server: "pending → confirmed: once", admin: "1 paid, 1 'already done'" },
        caption:
          "Confirming flips the payout from pending to confirmed only if it's still pending. The second request finds it already confirmed and reports a no-op.",
        ledger: ["No new entries."],
      },
    ],
  },
  {
    id: "transfer-fails",
    question: "What if the transfer to the farmer fails?",
    category: "Paying out",
    start: { balances: PICKED_UP, goods: AT_CUSTOMER },
    outcome: "The farmer's money waits safely in the ledger; a fresh key lets the retry through.",
    steps: [
      {
        title: "Pay the farmer",
        tone: "ok",
        goods: AT_CUSTOMER,
        system: ["admin", "server", "stripe"],
        edges: [["admin", "server"], ["server", "stripe"]],
        caption: "An admin runs the payout and the server asks Stripe for a transfer.",
        ledger: ["No new entries."],
      },
      {
        title: "Stripe refuses",
        tone: "fail",
        goods: AT_CUSTOMER,
        system: ["server"],
        failed: ["stripe"],
        brokenEdges: [["server", "stripe"]],
        badges: { server: "insufficient available funds" },
        caption:
          "The card money is still 'pending' at Stripe, so there's nothing available to transfer yet.",
        ledger: ["No new entries."],
      },
      {
        title: "Clear the key",
        tone: "recover",
        goods: AT_CUSTOMER,
        system: ["server"],
        badges: { server: "definite 4xx: key cleared" },
        caption:
          "A definite refusal means nothing was created, so the stored key is cleared. Keeping it would make Stripe replay the same failure for 24 hours. The farmer is still owed $6.73.",
        ledger: ["Owed to farmer still +$6.73"],
      },
      {
        title: "Retry the next day",
        tone: "recover",
        goods: AT_CUSTOMER,
        system: ["admin", "server", "stripe"],
        edges: [["admin", "server"], ["server", "stripe"]],
        badges: { stripe: "new key: transfer created" },
        flows: [["farmer", "farmerBank", 673], ["holding", "platform", 2]],
        balances: FARMER_PAID,
        caption: "With funds available and a fresh key, the transfer goes through and the payout is confirmed.",
        ledger: ["Owed to farmer −$6.73 → farmer's account", "Holding −$0.02 → Farmerdrop"],
      },
    ],
  },
  {
    id: "forged",
    question: "What if someone sends a fake 'payment succeeded' webhook?",
    category: "Confirming a payment",
    start: { balances: START, goods: FARM },
    outcome: "Rejected on the signature. A fake message can't book a cent.",
    steps: [
      {
        title: "A forged message arrives",
        tone: "fail",
        goods: FARM,
        system: ["webhook"],
        edges: [["webhook", "server"]],
        badges: { webhook: "'paid!' (not from Stripe)" },
        caption: "Someone posts a convincing 'payment succeeded' event to the webhook address.",
        ledger: ["Nothing booked."],
      },
      {
        title: "The signature doesn't match",
        tone: "recover",
        goods: FARM,
        system: ["server"],
        failed: ["webhook"],
        brokenEdges: [["webhook", "server"]],
        badges: { server: "400: bad signature" },
        caption:
          "Every webhook is checked against Stripe's signing secret using the raw request body. This one fails and is rejected before any code reads it.",
        ledger: ["Nothing booked."],
      },
    ],
  },
]);
