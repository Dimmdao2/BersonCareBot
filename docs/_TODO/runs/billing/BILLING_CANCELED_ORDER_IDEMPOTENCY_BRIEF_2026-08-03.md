# B0.3 — a repeat upgrade after a cancellation must not hand back a dead checkout link

Rules: `AGENTS.md` — Маршрут, CORE rules, §5, §10/§10a/§10b, §24. Language: internal work is English.

⚠️ **One shot, no next turn.** Commit before you finish. Keep the run under ~20 minutes.

Authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` **B0.3**; task `#1057`. Measured evidence:
`docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, line `0b252ca66`.

Источник оракула: `#1057` — «клиника выбирает и оплачивает тариф через настоящий PSP, получает и продлевает
доступ».

## The measured defect

Live run through the product path (`PATCH /api/clinic/billing`): a repeat upgrade to the **same tariff after a
cancellation** returns the checkout URL of an order the provider has already closed. Confirmed in a real browser —
the YooKassa page opens straight into «Успешно», with no card form. So the clinic cannot start a new payment at
all: it is handed a link to a dead order.

The defect sits at `apps/webapp/src/modules/saas-billing/service.ts:265` — the reuse branch returns the existing
invoice's `providerCheckoutUrl` without asking whether that provider order is still payable.

This is the same family as the idempotence-key rotation already shipped today (`89ce666db`), but a different case:
that one covered a **refused** create, this one covers an order the provider **closed** (canceled/expired) while
our invoice still looks reusable.

## Work

1. Reuse a checkout link only while the provider order can still be paid. Decide «still payable» from the
   provider's own state, not from our invoice status alone — and say in the report which field you used and why it
   is authoritative.
2. When it is not payable, open a **fresh** provider order for the same invoice, rotating the idempotence key the
   same deterministic way the existing retry path does, so concurrent clicks converge on one order rather than
   creating two.
3. Do not weaken the protection that already works: a genuinely paid invoice must never be re-opened, and the late
   webhook retries for voided invoices must keep being refused.

## Boundaries

- No change to the webhook signature/IP verification, the invoice state machine, the guard trigger, or the tariff
  accessor.
- No migration expected; if you think one is needed, justify it before writing it. Temporary number in the clone —
  the final one is assigned at merge.
- **PROD (`135.106.162.170`) is untouchable.** No deploy in this run. No push.

## Done means

- Behavioral tests: reuse while payable returns the same link; after the provider closed the order a new payable
  link is issued; a paid invoice is never re-opened; concurrent repeats converge on one order.
- `pnpm --dir apps/webapp exec vitest run --project fast src/modules/saas-billing/service.test.ts` green, plus the
  payment-adapter tests; typecheck, scoped ESLint, `git diff --check` clean.
- One commit on `wt/billing-live-vat`. Report the exact commands with counts and state plainly whether a clinic can
  now start a fresh payment after a cancellation.
