/**
 * Sequence-diagram scenes. Each row appears at its `step` (1-based) as the reader scrolls.
 * kind: "msg" (request), "reply" (response, dashed), "fail" (never arrives), "note" (work done on one lane),
 * "recover" (a request that repairs a failure).
 */

const BROWSER = { id: "browser", label: "Browser" };
const SERVER = { id: "server", label: "My server" };
const DB = { id: "db", label: "Database" };
const STRIPE = { id: "stripe", label: "Stripe" };
const SWEEP = { id: "sweep", label: "5-min job" };

export const SCENES = Object.freeze({
  pay: {
    title: "Paying for the order",
    lanes: [BROWSER, SERVER, DB, STRIPE],
    rows: [
      { step: 1, from: "browser", to: "server", label: "Pay $10.00" },
      { step: 1, from: "server", to: "db", label: "outbox row, key charge:42:1000" },
      { step: 1, from: "server", to: "stripe", label: "create PaymentIntent, same key" },
      { step: 1, from: "server", to: "browser", kind: "reply", label: "client secret" },
      { step: 2, from: "browser", to: "stripe", label: "card details, confirm" },
      { step: 2, at: "stripe", kind: "note", label: "charges the card $10.00" },
      { step: 3, from: "browser", to: "server", label: "mark-paid" },
      { step: 3, from: "server", to: "stripe", label: "really succeeded?" },
      { step: 3, from: "stripe", to: "server", label: "webhook: payment succeeded" },
      { step: 4, at: "db", kind: "note", label: "lock order · write ledger · paid" },
    ],
  },

  tabClosed: {
    title: "What if the tab closes right after paying?",
    lanes: [BROWSER, SERVER, DB, STRIPE, SWEEP],
    rows: [
      { step: 1, from: "browser", to: "stripe", label: "card details, confirm" },
      { step: 1, at: "stripe", kind: "note", label: "charges the card $10.00" },
      { step: 2, from: "browser", to: "server", kind: "fail", label: "mark-paid never sent" },
      { step: 2, from: "stripe", to: "server", kind: "fail", label: "webhook fails" },
      { step: 3, from: "sweep", to: "db", kind: "recover", label: "orders still processing?" },
      { step: 3, from: "sweep", to: "stripe", kind: "recover", label: "did pi_42 succeed?" },
      { step: 3, from: "stripe", to: "sweep", kind: "reply", label: "succeeded" },
      { step: 4, from: "sweep", to: "db", kind: "recover", label: "same booking function" },
      { step: 4, at: "db", kind: "note", label: "lock order · write ledger · paid" },
      { step: 5, from: "stripe", to: "server", label: "webhook retry lands" },
      { step: 5, from: "server", to: "db", label: "already paid: do nothing" },
    ],
  },

  race: {
    title: "What if both messages arrive at once?",
    lanes: [BROWSER, SERVER, DB, STRIPE],
    rows: [
      { step: 1, from: "browser", to: "server", label: "A: mark-paid" },
      { step: 1, from: "stripe", to: "server", label: "B: webhook" },
      { step: 2, from: "server", to: "db", label: "A: SELECT … FOR UPDATE" },
      { step: 2, from: "server", to: "db", label: "B: SELECT … FOR UPDATE" },
      { step: 2, at: "db", kind: "note", label: "A holds the lock, B waits" },
      { step: 3, at: "db", kind: "note", label: "A: write ledger · paid · commit" },
      { step: 3, from: "db", to: "server", kind: "reply", label: "B: order is paid, stop" },
      { step: 4, at: "db", kind: "note", label: "unique index: one payment row" },
      { step: 4, from: "server", to: "browser", kind: "reply", label: "one email, sent by A" },
    ],
  },
});
