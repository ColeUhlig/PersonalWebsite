/**
 * Sequence diagrams of the failure paths. kind: "msg" (default), "reply" (dashed), "fail" (never arrives),
 * "note" (work on one lane), "crash" (a process dies), "recover" (a request that repairs a failure).
 */

const BROWSER = { id: "browser", label: "Browser" };
const ADMIN = { id: "admin", label: "Admin" };
const SERVER = { id: "server", label: "Server" };
const DB = { id: "db", label: "Postgres" };
const STRIPE = { id: "stripe", label: "Stripe" };
const SWEEP = { id: "sweep", label: "5-min job" };

export const SCENES = Object.freeze({
  race: {
    title: "Webhook and mark-paid race for one order",
    lanes: [BROWSER, SERVER, DB, STRIPE],
    rows: [
      { from: "browser", to: "server", label: "A: POST /orders/42/mark-paid" },
      { from: "stripe", to: "server", label: "B: payment_intent.succeeded" },
      { from: "server", to: "stripe", label: "A: retrieve pi_42, must be succeeded" },
      { from: "server", to: "db", label: "A: SELECT … FOR UPDATE" },
      { from: "server", to: "db", label: "B: SELECT … FOR UPDATE (blocks)" },
      { at: "db", kind: "note", label: "A: 7 ledger rows, status paid, COMMIT" },
      { from: "db", to: "server", kind: "reply", label: "B: row unlocked, status = paid, return" },
      { from: "server", to: "browser", kind: "reply", label: "A booked it, A sends the email" },
    ],
  },

  tabClosed: {
    title: "The browser never reports the payment",
    lanes: [BROWSER, SERVER, DB, STRIPE, SWEEP],
    rows: [
      { from: "browser", to: "stripe", label: "confirmPayment" },
      { at: "stripe", kind: "note", label: "card charged $10.00" },
      { from: "browser", to: "server", kind: "fail", label: "mark-paid: tab closed" },
      { from: "stripe", to: "server", kind: "fail", label: "webhook: 5xx, Stripe retries" },
      { from: "sweep", to: "db", kind: "recover", label: "orders in payment_processing" },
      { from: "sweep", to: "stripe", kind: "recover", label: "retrieve pi_42" },
      { from: "stripe", to: "sweep", kind: "reply", label: "succeeded" },
      { from: "sweep", to: "db", kind: "recover", label: "applySucceededPaymentIntent" },
      { from: "stripe", to: "server", label: "webhook retry delivered" },
      { from: "server", to: "db", kind: "reply", label: "already paid: no rows written" },
    ],
  },

  crash: {
    title: "The server dies between Stripe and Postgres",
    lanes: [BROWSER, SERVER, DB, STRIPE],
    rows: [
      { from: "browser", to: "server", label: "POST /create-payment-intent" },
      { from: "server", to: "db", label: "INSERT outbox, key charge:42:1000" },
      { from: "server", to: "stripe", label: "paymentIntents.create, same key" },
      { at: "server", kind: "crash", label: "process exits before saving pi_42" },
      { from: "browser", to: "server", kind: "recover", label: "retry" },
      { from: "server", to: "db", kind: "recover", label: "ON CONFLICT DO NOTHING: existing row" },
      { from: "server", to: "stripe", kind: "recover", label: "paymentIntents.create, same key" },
      { from: "stripe", to: "server", kind: "reply", label: "the original pi_42" },
      { from: "server", to: "browser", kind: "reply", label: "client_secret" },
    ],
  },

  payout: {
    title: "An admin clicks Execute payout twice",
    lanes: [ADMIN, SERVER, DB, STRIPE],
    rows: [
      { from: "admin", to: "server", label: "A: execute payout 17" },
      { from: "admin", to: "server", label: "B: execute payout 17" },
      { from: "server", to: "db", label: "A, B: SET idempotency_key = COALESCE(…)" },
      { from: "db", to: "server", kind: "reply", label: "both get payout:17:<uuid>" },
      { from: "server", to: "stripe", label: "transfers.list(transfer_group payout:17)" },
      { from: "server", to: "stripe", label: "transfers.create, same key" },
      { from: "stripe", to: "server", kind: "reply", label: "one transfer, tr_17" },
      { from: "server", to: "db", label: "A: UPDATE … WHERE status = 'pending'" },
      { from: "server", to: "db", kind: "fail", label: "B: 0 rows, already executed" },
    ],
  },
});
