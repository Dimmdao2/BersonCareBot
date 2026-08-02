# SaaS first payment + paid additional seats — worker brief (0308)

## Authority and outcome

Read `AGENTS.md` §1/§4a/§5/§10b/§24, both canonical plans below, current billing/invite ports and existing
PostgreSQL smokes before editing.

Источник оракула: `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a/5.1 — «Места специалистов:
база и цена за дополнительного; превышение разрешено и оплачивается; сумма к подтверждению; выставление счёта —
#1057».

Billing authority: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` — «счёт клиники = цена тарифа +
дополнительные специалисты сверх базы» and the invariant that a clinic can always pay the platform.

Human outcome: the first real tariff payment opens the bought period; a clinic over its included specialist seats
must pay before one more invite exists, can reach checkout from Team/Billing, and renewal charges the base tariff plus
the purchased seat quantity. No paid seat invoice may activate or move the tariff period.

Branch/worktree: `wt/saas-seat-billing` / `bcb-wt-saas-seat-billing`. Migration `0308` is already reserved on the
parallel board; create exactly one temporary-numbered migration and journal entry after re-reading the board.

## Measured breaks to remove

- Current invite POST commits/sends an over-limit invite, then best-effort creates a manual invoice and swallows
  failure.
- There is no invoice kind or persisted paid additional-seat allowance.
- All capture goes through tariff-period promotion; a seat invoice can move tariff access.
- First ordinary tariff capture cannot promote because `currentPeriodEndsAt` is NULL.
- Both renewal writers charge only tariff base price.
- Accept SQL treats the existence of an extra-seat price as if the seat were paid.
- Team ignores invoice outcome; billing overview drops checkout URL/purpose.

## One schema change, no new table

Extend the existing schema/ports/types/in-memory implementation and migration `0308`:

- `saas_billing_subscriptions.paid_additional_seats integer NOT NULL DEFAULT 0`, non-negative check;
- invoice kind union exactly `tariff_period | seat_overage`, stored in
  `saas_billing_invoices.invoice_kind text NOT NULL` with no permanent DB default after backfill;
- `saas_billing_invoices.additional_seat_quantity integer NOT NULL`, non-negative; `seat_overage` requires `>0`;
- replace the global subscription+period unique constraint with the same unique key partial to
  `invoice_kind='tariff_period'`, so multiple separately identified seat purchases do not collide;
- unique partial provider `(provider_id, provider_invoice_ref)` when ref is non-NULL.

Backfill only the exact legacy seat description prefix
`Дополнительное место специалиста сверх тарифа — ` as `seat_overage`, quantity 1; all other historic invoices are
`tariff_period`, quantity 0. Seed each subscription allowance from its already-paid legacy seat invoice quantity.
Then set NOT NULL/checks and remove any temporary default on `invoice_kind`. Do not add another table/entity.

Every new invoice writer explicitly supplies kind and quantity. Manual platform-admin invoices are tariff-period
invoices: they are operator-issued bills for the existing tariff period, not generic add-ons.

## One capture state machine

Keep `captureSaasBillingPaymentSucceeded` as the only live promotion door; exact caller census must prove
`markSaasBillingInvoicePaid` and `activateSaasBillingSubscriptionPeriod` have no product callers before deleting them
from both port implementations/types.

Use one lock order for capture, boundary promotion and seat-refund application: subscription row, then invoice row.

`tariff_period`:

- on the first paid invoice, NULL current period is legal: activate the subscription, install invoice period/snapshot
  and end active trial in the same transaction;
- on renewal, promote only at the exact paid boundary; an early-paid future invoice remains paid until that boundary;
- stale/mismatched invoice must not overwrite a current period.

`seat_overage`:

- pending/draft changes no capacity;
- first successful capture atomically adds `additionalSeatQuantity` once;
- replay under the same or another provider event id adds nothing;
- never changes tariff id, pending tariff, status/lifecycle, paid dates or tariff snapshot;
- only a full refund is allowed; after trusted `refund.succeeded`, decrement allowance once. Never delete/archive an
  existing specialist; falling above capacity freezes new growth only.

## Amount and capacity

Both base/renewal invoice writers charge:

```text
tariff.priceMinor + paidAdditionalSeats * tariff.additionalSeatPriceMinor
```

and persist the purchased quantity in `additionalSeatQuantity` plus the existing full tariff snapshot. If allowance
is positive but the target tariff has no additional-seat price, renewal/transition fails explicitly before provider
side effects.

Effective seat capacity in the clinic seat projection, atomic invite creation and accept overlay is exactly:

```text
(active seat-limit override ?? effective tariff includedSeats) + paid subscription paidAdditionalSeats
```

Remove the accept-time shortcut «additional seat price exists => allow». A price permits offering checkout; only a
paid allowance expands capacity. Existing members are never removed.

## Human/API path — reuse existing screens and routes

1. Invite POST at capacity returns existing `402 seat_overage_confirmation_required` with server price/currency and
   creates/sends nothing. Remove `confirmedSeatOveragePriceMinor` from invite API/port/service.
2. Extend existing `POST /api/clinic/billing` with a typed `purchase='seat_overage'`, stable client `requestKey`, and
   confirmed amount/currency. Do not add a second billing route.
3. Under the organization billing principal, re-resolve actual usage, base/override capacity, paid allowance and
   current price. Client org/amount is never authority. If a seat became free, return `seat_available`; if price
   changed, return a fresh 402 without an invoice.
4. Same request key gives one invoice and one provider intent. If an idempotent retry finds a draft invoice with no
   provider ref/checkout, retry the PSP with the same key instead of returning a permanently unusable draft.
5. Return URL is Team settings with only invoice id, e.g. `/app/settings?tab=team&seatPayment=<invoiceId>`.
   `TeamSection` stores email/role/requestKey in `sessionStorage`, redirects to checkout, polls the existing scoped
   billing GET after return, and once paid replays the ordinary invite POST. If the browser state is lost, the paid
   generic capacity remains usable by the next invite; no money is lost.
6. `SaasBillingOverview` shows invoice kind/purpose/seat quantity and an `Оплатить` link for pending invoices with a
   checkout URL. Platform payments breakdown distinguishes tariff-period and seat-overage money.

Do not copy email/role into a new billing entity or make webhook depend on plaintext invite tokens.

## Architecture constraint

Updating the legacy text in `pgOrganizationInvites.createReplacingPending` would be new raw SQL. Move that bounded
write transaction to the existing Drizzle application port/pattern while preserving the organization lock and atomic
capacity proof. Update the existing `organization-member-invites-rls.sql` function/permissions via established
overlay/deploy patterns; do not invent a parallel function or bypass the shared DB port.

## Required oracle / fault classes

Reuse existing service/route/UI and `check-c4a-843-clinic-invite-concurrency.mjs`; extend them, do not create a new DB
harness. Required behavior:

1. PostgreSQL first tariff payment: pending/NULL → active/non-NULL period and active trial ended.
2. Seat capture allowance +1 with every tariff/status/period/snapshot field unchanged; replay same/different event id
   remains +1.
3. Before payment no invite exists; after payment the ordinary invite succeeds.
4. Two concurrent invites for one paid extra place: exactly one succeeds.
5. Same checkout requestKey: one invoice/one PSP intent, including retry of a draft without provider ref; two distinct
   paid requests give allowance +2.
6. Renewal amount is exact base + quantity×unit, snapshot quantity preserved; missing unit price with quantity fails.
7. Accept overlay rejects legacy unpaid overage and accepts within paid capacity.
8. Pending seat invoice is visible/payable; return flow retries the saved invite once.
9. Full seat refund decrements once; partial seat refund is rejected.

Fault injections must kill at least: remove kind switch and always promote; restore price-based accept bypass; count a
pending invoice; omit paid allowance from any one of create/accept/UI capacity; omit seat component from renewal;
remove decisive transaction lock; return unusable draft on retry; reject first tariff payment at NULL boundary.

## Boundaries, validation and delivery

No receipt/fiscalization, VAT/tax setting, payment-provider adapter, nginx, unrelated quota, new table, PROD or deploy.
Do not apply `0308` to DEV/TEST; lead does that only after audit/land. Do not push the worker branch.

Run focused service/route/UI tests, existing private PostgreSQL concurrency smoke, migration/journal/schema gates,
typecheck, scoped ESLint, raw-SQL gate and `git diff --check`. Update §5.1 and the billing plan only with exact evidence
in the same final product commit; do not close B0.3 live TEST acceptance. Commit explicit paths with #1057/#1069 and
report commands/counts, SHA and remaining limits.

