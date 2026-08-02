# Billing immediate upgrade proration — independent blind audit

## Verdict

**FAIL**

Audited product commit: `a9ff56e61` (`wt/billing-upgrade-proration`).

Three reachable money/state failures violate Р-14 / 5.6. The ordinary upgrade path, proration arithmetic,
request authority, request/capture idempotency, webhook mismatch rejection, downgrade scheduling, and layer reuse
otherwise passed the scoped audit.

## Authority

- `AGENTS.md` §§5, 7, 9–10, 24.
- `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md`, Р-14 / 5.6.
- `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md`.
- Owner oracle from the audit brief: an immediate upgrade charges the server-derived price difference prorated over the remaining already-paid period; the new tariff and snapshot take effect only after confirmed capture; `paidThrough` is unchanged; the next full period uses the full new-tariff price.

## Blind kill-set

This list was fixed from authority before reading existing tests, the product diff, or production implementation.

1. A request may select a target tariff ID and may attempt to forge `organizationId`, tariff price, billing-period boundaries, currency, or payable amount; the server must validate the target ID and derive every money/tenant/period value from authenticated organization state, current paid subscription/snapshot, and the server-side target tariff.
2. Full, partial, and zero remaining-period boundaries produce the exact non-negative minor-unit charge; fractional minor units are rounded deterministically upward, without floating-point or negative-charge behavior.
3. Creating an upgrade invoice, receiving a provider return, or receiving any non-captured provider result must leave the old paid tariff snapshot active.
4. A trusted successful capture applies the new tariff and copied snapshot exactly once, without moving `paidThrough`; the following renewal invoice uses the full new tariff price rather than another prorated amount.
5. Sequential retry/double-click, concurrent requests, capture retry, and webhook replay must neither create a second payable upgrade invoice nor apply the tariff change twice.
6. A provider event whose invoice/provider reference, amount, or currency does not match the server-side invoice must not apply the upgrade.
7. A downgrade remains scheduled for the next billing boundary and is never routed through immediate upgrade/capture semantics.
8. The implementation must reuse the existing SaaS billing port/repository, invoice, common payment door/provider intent, and capture path; a route-level DB/payment domain or parallel provider path is a failure.

## Audit evidence

| # | Result | Evidence |
|---|---|---|
| 1 | **PASS** | `PATCH /api/clinic/billing` accepts only `tariffId`; organization and actor come from the authenticated clinic context (`route.ts:38,75-93`). The repository locks the paid subscription and derives current price/currency/period from its paid snapshot and target price/currency from the active server tariff (`pgSaasBilling.ts:675-747`). The added route acceptance test sends forged organization, amount, currency and period fields and proves that only authenticated organization + target tariff reach the service. |
| 2 | **PASS** | `proratedTariffUpgradeAmountMinor` validates safe non-negative integer prices, clamps remaining time to `[0,total]`, uses `BigInt`, and calculates ceiling division `(numerator + total - 1) / total` (`proration.ts:13-34`). The full/partial/zero and fractional-minor-unit tests pass; replacing ceiling with floor made the fractional test fail. |
| 3 | **PASS** | Invoice creation does not change the subscription; the normal acceptance test observes the old `basic` snapshot before capture. Temporarily applying the target snapshot at invoice creation made this test fail. The provider return URL has no apply path; the only production capture caller found by `rg` is the verified SaaS webhook route. |
| 4 | **FAIL** | The normal path applies the new snapshot once and preserves the paid boundary, but the early-renewal and stale-capture scenarios below violate the next-period price/snapshot requirement. |
| 5 | **PASS** | PostgreSQL creation locks the subscription, reuses an open upgrade invoice, inserts idempotently, and provider-intent creation is guarded by a claim (`pgSaasBilling.ts:675-768`, `service.ts:224-290`). Capture locks subscription then invoice and checks `wasPaid` (`pgSaasBilling.ts:852-923`). The strengthened acceptance test uses simultaneous requests, observes one invoice/intent, and verifies capture + replay results. Weakening intent claiming made the parallel test observe two provider calls; forcing replay to report capture made its assertion fail. |
| 6 | **PASS** | The webhook resolves by provider reference and rejects amount/currency mismatch before capture. The route suite passes 11/11; temporary removal of each amount and currency guard made its corresponding mismatch test fail. |
| 7 | **PASS** | A restrictive/cheaper target still takes the scheduled next-period path. The focused downgrade test passes; temporarily forcing `appliesNextPeriod=false` made it fail. |
| 8 | **PASS** | The diff extends the existing clinic route, SaaS billing service/repository port, SaaS invoice, provider `createIntent`, and verified capture path. No route-level DB/payment implementation or parallel payment domain was added. |

PostgreSQL concurrency boundaries were inspected statically under the repository's targeted-test cost rule; no new
database integration harness was introduced for this audit.

## Findings

### MUST FIX 1 — transition classification ignores the paid price snapshot

- Reachable scenario: a clinic paid `basic=10_000`; while that period remains active an administrator edits the live
  `basic` price to `20_000`; live `pro` is `15_000`; the clinic selects `pro` halfway through the paid period.
- Observed: `resolveOwnTariffTransition` reloads the live current tariff and classifies `pro` as a downgrade
  (`org-entitlements/service.ts:521-530,586-607`), so the service returns `{ outcome: 'scheduled' }`. The billing
  repository's actual paid-snapshot comparison would classify it as an immediate upgrade and charge `2_500`.
- Impact: a valid paid-period upgrade is deferred and no required prorated invoice is offered; transition policy and
  money authority disagree.
- Violated authority: owner oracle and `TARIFFS_PAYMENTS_ADMIN_PLAN.md` Р-14 / 5.6 (`:1196-1200`): the difference is
  between the new tariff and the current **already-paid** tariff, and an upgrade takes effect immediately after payment.
- Acceptance proof: `service.test.ts:1360-1469` fails with `scheduled` instead of `checkout / 2_500`.

### MUST FIX 2 — a previously paid old-tariff renewal undercharges and can restore the old tariff

- Reachable scenario: the clinic has paid `basic=10_000` for August; it pays the September `basic` renewal early;
  during August it pays the immediate upgrade to `pro=20_000`; the September boundary is then processed.
- Observed: the unique period invoice already exists, so renewal creation returns it unchanged
  (`pgSaasBilling.ts:1294-1321`). The paid September total stays `10_000`, and that invoice carries the old `basic`
  snapshot; promotion can therefore overwrite the captured `pro` state.
- Impact: the next full period is undercharged by `10_000` minor units and the clinic can be moved back to the old
  tariff despite having paid the upgrade.
- Violated authority: owner oracle and Р-14 / 5.6 (`TARIFFS_PAYMENTS_ADMIN_PLAN.md:1198-1200`): the next full period
  must cost the full new-tariff price and use the new tariff/snapshot.
- Acceptance proof: `service.test.ts:1472-1544` fails with `10_000` paid for the next period instead of `20_000`.

### MUST FIX 3 — a late old-period upgrade capture mutates a later paid period

- Reachable scenario: an August upgrade invoice remains pending; at the September boundary the clinic pays a full
  `basic` renewal; afterward the provider delivers a successful capture for the August upgrade invoice.
- Observed: the upgrade capture branch checks only description and `!wasPaid`; it does not require the invoice service
  period to match the subscription's current paid period (`pgSaasBilling.ts:898-915`). It replaces the active September
  snapshot with `pro` while September was paid at the `basic` price.
- Impact: the active tariff no longer matches the price/snapshot paid for the current period; the clinic receives a
  later-period upgrade without the required proration/full-period charge.
- Violated authority: owner oracle and Р-14 / 5.6 (`TARIFFS_PAYMENTS_ADMIN_PLAN.md:1198-1200`): an upgrade charge is
  proportional to the remaining time of the already-paid period, and the next full period costs the full new price.
- Acceptance proof: `service.test.ts:1546-1613` fails because the September subscription becomes `pro`, expected
  the already-paid `basic` snapshot to remain authoritative for that period.

No style, hardening-only, or speculative findings are reported.

## Fault injection

All production-code mutations were temporary and reverted before the final diff check.

| Temporary mutation | Kill proof |
|---|---|
| Ceiling division changed to floor | `pnpm --dir apps/webapp exec vitest run --project fast src/modules/saas-billing/proration.test.ts` failed at the fractional result (`0`, expected `1`). |
| Webhook amount comparison bypassed | `pnpm --dir apps/webapp exec vitest run src/app/api/payments/saasWebhook.route.test.ts` failed because an amount mismatch captured instead of safe-acknowledging mismatch. |
| Webhook currency comparison bypassed | The same webhook command failed at the currency-mismatch assertion. |
| Target snapshot applied during upgrade-invoice creation | The focused normal-upgrade command failed before capture (`pro`, expected old `basic`). |
| Upgrade capture shifted the subscription period start | The focused normal-upgrade command failed on the preserved `2026-08-01` boundary. |
| Provider-intent claim made unconditional | The parallel-request assertion failed because `createIntent` ran twice. |
| Webhook replay forced to report another capture | The replay assertion failed (`true`, expected `false`). |
| Downgrade classification forced to immediate | The focused restrictive-target test failed because the change no longer stayed scheduled. |
| Route accepted client `organizationId` as authority | The forged-request route test failed with `attacker-org` instead of the authenticated organization. |

## Commands

Repository and diff:

- `git branch --show-current` → `wt/billing-upgrade-proration`.
- `git rev-parse HEAD` → `e8777c83a7d90e48580fa73b2515e4180e2d9a20`.
- `git merge-base --is-ancestor a9ff56e61 HEAD` → exit `0`.
- `git show --stat --oneline --no-renames a9ff56e61` → 12 files, 632 insertions, 40 deletions.
- `git diff --exit-code -- apps/webapp/src/modules/saas-billing/proration.ts apps/webapp/src/modules/saas-billing/service.ts apps/webapp/src/infra/repos/inMemorySaasBilling.ts apps/webapp/src/infra/repos/pgSaasBilling.ts apps/webapp/src/modules/org-entitlements/service.ts apps/webapp/src/app/api/clinic/billing/route.ts` → exit `0`; no audit/fault-injection production changes remain.
- `rg -n "captureSaasBillingProviderWebhookEvent\\(" apps/webapp/src --glob '!**/*.test.*'` → two matches: service definition and verified SaaS webhook route caller.

Validation:

- `pnpm install --frozen-lockfile` → exit `0`; required because the worktree initially had no installed Vitest binary.
- `pnpm --dir apps/webapp exec vitest run --project fast src/modules/saas-billing/service.test.ts` → exit `1`: 41 tests, 38 passed, exactly the 3 retained acceptance tests above failed.
- `pnpm --dir apps/webapp exec vitest run --project fast src/modules/saas-billing/proration.test.ts` → exit `0`: 3/3 passed.
- `pnpm --dir apps/webapp exec vitest run src/app/api/clinic/billing/route.route.test.ts` → exit `0`: 10/10 passed.
- `pnpm --dir apps/webapp exec vitest run src/app/app/settings/PayTariffButton.ui.test.tsx src/app/app/settings/BillingSection.ui.test.tsx` → exit `0`: 5/5 passed.
- `pnpm --dir apps/webapp exec vitest run src/app/api/payments/saasWebhook.route.test.ts` → exit `0`: 11/11 passed.
- `pnpm --dir apps/webapp exec vitest run --project fast src/modules/saas-billing/service.test.ts -t "keeps the old snapshot until capture"` → exit `0`: 1 passed, 40 skipped.
- `pnpm --dir apps/webapp exec vitest run --project fast src/modules/saas-billing/service.test.ts -t "schedules a restrictive target"` → exit `0`: 1 passed, 40 skipped.
- `pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build && pnpm --dir apps/webapp exec tsc --noEmit --incremental false` → exit `0`.
- `pnpm --dir apps/webapp exec eslint src/modules/saas-billing/service.test.ts src/app/api/clinic/billing/route.route.test.ts` → exit `0`.
- `git diff --check` → exit `0`.

Three initial route/UI invocations incorrectly supplied `--project fast`; Vitest exited `1` with `No test files
found` because that project excludes `*.route.test.ts` and `*.ui.test.tsx`. They were immediately rerun by the exact
commands above without the incompatible project selector. Full CI was not run, as required by the audit boundary.
