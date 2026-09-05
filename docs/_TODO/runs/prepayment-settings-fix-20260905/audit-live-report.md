# Independent audit-live — prepayment settings fix

Candidate: `8278288f0` · branch `wt/prepayment-settings-fix` ·
worktree `/home/dev/dev-projects/bcb-wt-prepayment-settings-fix`
Authority: owner live report (two screenshots + TEST journal 2026-09-05 18:19:08).
Blind kill-set written before reading any test: [`kill-set-blind.md`](kill-set-blind.md).

## Verdict: FAIL

The product fix itself is correct and provably kills both owner-reported faults (evidence below).
It is blocked by one concrete regression: **the candidate leaves 5 of 7 pre-existing tests red in the
very file it edits**, and the commit's "7/7 passed" evidence belongs to a different suite. By §24.7 an
unpassed targeted gate is not `land-ready`.

## §24.4 classification — test or one-time look

| Item | Nature | Proof method |
|---|---|---|
| Save runs under the staff principal | repeatable behavior | acceptance test + fault injection |
| Rubles at the UI boundary, minor units in storage | repeatable money contract | acceptance test + fault injection (both directions) |
| No `tenant_service` / grant widening | one-time property of the access declaration | diff + declaration introspection |
| Only caller / patient path / org scoping | one-time property of the call graph | reading the route and the call graph |

## Finding 1 (blocking) — candidate leaves its own UI suite red

`apps/webapp/src/app/app/settings/BookingPrepaymentSection.ui.test.tsx` — 5 of 7 tests fail on
`8278288f0` and all 7 pass on its parent `9b805aee1`.

```
# candidate
pnpm exec vitest run src/app/app/settings/BookingPrepaymentSection.ui.test.tsx
  -> Tests  5 failed | 2 passed (7)
# same suite against the parent version of the component, then restored
  -> Tests  7 passed (7)
```

Cause: the two intended product renames are still spelled the old way in the test locators.

- `MODE_LABELS.fixed_minor`: `'Фикс (коп.)'` → `'Фиксированная сумма'` — 1 test.
- amount field now shows rubles: fixture `amountMinor: 1_000` renders `10`, not `1000` — 4 tests
  (`getByDisplayValue('1000')`).

No product defect is behind any of the 5 — every one is a stale locator, and the behavior each test
actually guards (controls disabled under a tariff refusal, save enabled for a disabled policy) is
unchanged and worth keeping. Minimal repair, for the executor chosen by §24.1: in that file replace
the option name with `'Фиксированная сумма'` and the two `getByDisplayValue('1000')` with `'10'`.

Not repaired here: §24.3 lets an auditor commit only the acceptance tests he wrote plus the artifact.

Test-quality note (§10a ⛔ 1): these tests break on a rename because they pin interface text and a
rendered value as locators. That is pre-existing debt, not a candidate defect, and not an audit
finding — recorded so the repair is not mistaken for a product change.

## Confirmed correct — behavior A, staff principal

`runPaymentMutation` wrapped the call in `runWithDbOrganizationPrincipal`, producing an `organization`
principal; `webappPortContextPrincipal` maps that kind to the descriptor name `tenant_service`, and the
webapp catalog has no such key — hence the 500 before SQL. Measured, not assumed:

```
node --experimental-strip-types deploy/postgres/privileges/_capcheck.tmp.mjs   # temporary, removed
webapp     | bare "tenant_service" key present: false
integrator | bare "tenant_service" key present: true
```

The 12 `tenant_service`-class webapp descriptors are named-root (`functionIdentity`) entries, resolved
only inside a `runWebappNamedRoot` scope; a raw Drizzle mutation is not in one, so the lookup falls back
to the bare name and misses. `runDrizzleMutationTransaction` keeps whatever principal the route
installed and stamps `app.org` from it.

Direction confirmed against the live wall, not only the capability catalog: the RLS policy on the table
is `app.is_staff() AND organization_id = app.current_org_id()`
(`deploy/postgres/phase4-locked-helper-rls-policies.sql:249`) — an organization principal is not
`is_staff()`, so it was refused twice over. Staff is the only principal that can write this table.

Acceptance test added: `apps/webapp/src/infra/repos/pgPayments.prepaymentPolicyPrincipal.unit.test.ts`.
It runs the real `@bersoncare/db-principal` ALS, installs the staff principal exactly as
`withDoctorWorkspacePrincipal` does, and records which principal stands at the write when it reaches
the DB boundary.

Fault injection (K1) — `runDrizzleMutationTransaction` → `runPaymentMutation` in both branches:

```
- "principalKind": "staff",
+ "principalKind": "organization",
```

Production code restored; `git diff HEAD` over both product files is empty.

## Confirmed correct — behavior B, money

`amountMinor` stays integer minor units end to end: the route schema demands
`z.number().int().min(0)`, the column is `integer`, and the port writes the value unchanged. The UI
boundary converts in both directions through the helpers that already served the four other admin
sections — `minorToRublesInput` / `parseRublesInput` / `rublesToMinor` in `bookingSoloAdminApi.ts`. No
new helper was invented (§5 single chokepoint holds).

Decimal semantics: `parseRublesInput` strips spaces and maps `,` → `.`, so a Russian-keyboard `500,50`
is 500.5 ₽; `rublesToMinor` is `Math.round(rubles * 100)` → 50 050, always an integer. Non-numeric or
negative input throws `invalid_price`, which `save()` catches and shows — it never reaches the API.

Acceptance test added to the existing UI file (one `it`): 50 000 minor units are shown as `500`, and
typing `500,50` sends `amountMinor: 50050`. It asserts money only — no label, count or layout.

Fault injection, two independent directions:

| Injected fault | Assertion that reddened |
|---|---|
| send side: drop `rublesToMinor`, post rubles verbatim | `expected 500.5 to be 50050` |
| display side: `minorToRublesInput` → `String(minor)` | `Unable to find an element with the display value: 500` |

Production code restored after each.

## Confirmed by one-time inspection

- **No widening.** The diff touches two application files and nothing under `deploy/`. The write
  already fits the declared surface exactly: `app_staff` holds `SELECT` (table), `INSERT` on the ten
  columns the insert sets, and `UPDATE` on the six columns `.set()` writes
  (`relation-access.ts:1575`). `tenant_service` was neither added nor needed.
- **Only one caller.** `upsertPrepaymentPolicy` is called from the admin route alone; the patient side
  reads through the definer root `app.read_current_patient_booking_prepayment_policy`, untouched. No
  non-staff path regressed.
- **Org scoping intact.** Row `organizationId` and the principal's organisation are the same
  `gate.ctx.organizationId`; RLS `WITH CHECK` enforces the equality independently. The `UPDATE`
  targets a row already fetched org-scoped.
- **`runPaymentMutation` still live** at 11 other call sites — no dead code left behind.
- **Insert-surface gate green**, callsite line 235 unchanged: `check:drizzle-insert-surface` reports
  byte-identical metadata (208 relations, 125 with a direct insert).

## Not caught by any test — facts, not tasks (§10a)

1. **The same trap is still live on a neighbouring doctor money action.** `POST /api/doctor/booking-engine/appointments/[id]/payment`
   with `action: 'link'` runs under `withDoctorWorkspacePrincipal` (staff) and reaches
   `port.createPaymentIntent` and `port.appendHistoryEvent`, both still wrapped in `runPaymentMutation`
   — the identical staff→organization swap outside any named-root scope. Code path traced, **not
   executed**. Note the difference that makes this an owner decision rather than a copy of this fix:
   `be_payment_intents` / `be_payment_history_events` declare **both** `app_staff` and
   `app_tenant_service`, so which principal *should* own a staff-initiated payment link is a product
   question, not a mechanical rename. Outside the owner's reported scope → owner question (§24.6).
2. **`fixed_minor` accepts an empty amount.** `amountMinor` is optional and nullable in the route schema
   for every mode, so an active fixed-amount policy can be stored with no amount. Behaviour is
   unchanged by this candidate (the old code produced the same `null`) → not a finding; owner question.

## Test-quality verdict

Two tests added, one per named fault class, each at the cheapest layer that can see its fault, each
proven by targeted fault injection. Neither asserts source text, labels, counts, layout or call order.
Both files are picked up by their Vitest projects — confirmed mechanically, not by inspection:
`check-test-runner-visibility` reports webapp disk 520 = runner 520, invisible 0. Kill-set items left
to one-time inspection are listed above with what was actually read. Nothing from the kill-set is
unaccounted for.

## Checks run

| Check | Result |
|---|---|
| `vitest run` route + new repo test + UI file (16 tests) | 11 passed, **5 failed** — all 5 are Finding 1 |
| same UI file against parent `9b805aee1` | 7 passed |
| `pnpm --dir apps/webapp typecheck` | exit 0 |
| `eslint` (webapp config) on both test files | exit 0 |
| `pnpm run check:drizzle-insert-surface` | exit 0 |
| `node scripts/check-test-runner-visibility.mjs` | OK, 0 invisible |

Not run: full CI, and no TEST/PROD deploy or database write of any kind. No named DEV access was
needed — the capability catalog and RLS policy answered from the declaration.
