# Independent audit — Ч4б transaction-aware quota port (#1082)

Candidate product commit: `60266ec2a` against `1401c1f48`. Current integration
comparison: committed `feat/doctor-ui-rebuild` at `5448e2585`.

Authority: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` Ч4б, `AGENTS.md` §5,
§10 and §24, plus the current tariff fail-closed contract in
`modules/org-entitlements/service.ts` / `types.ts`. No product fix, merge, DB,
migration, DEV/TEST/PROD or Track D state was changed.

## Verdict: FAIL

The candidate does preserve the shared advisory-lock key, effective paid-period
tariff reader, active override precedence, paid additional seats, exact-org
recounts and live stock usage formulas. Two mandatory findings remain.

### F1 — unconfigured legacy seat baseline can be converted into a paid overage

`decideClinicTeamQuota()` treats `includedSeats: null` as an exhausted limit and,
when the same legacy tariff happens to contain an additional-seat price and
currency, returns `seat_overage_confirmation_required`. The current tariff
contract says the opposite: `null` is a readable legacy state which refuses
growth and must never be converted into an inferred baseline
(`org-entitlements/types.ts`, `includedSeats`).

Reachable impact: a clinic on such a legacy/incompletely configured tariff can be
offered and charged for an additional specialist although no base seat allowance
exists. The saved acceptance assertion expects `seat_limit_reached` and is red on
the candidate.

Required bounded fix: in the shared decision, return `seat_limit_reached` before
considering overage price whenever `includedSeats === null`; keep explicit zero as
the valid configured baseline that may sell the first paid seat.

### F2 — the claimed single entry has no mechanical bypass gate

The stage's owner requirement and `AGENTS.md` §5 define completion as both one
door and a mechanical check that fails when a writer bypasses it. The candidate
adds the door and converts the currently known writers, but adds no gate or
self-test. `check-no-new-raw-sql.mjs` only constrains where SQL may execute; it
does not reject a new quota advisory lock, tariff/quota read, or write-side quota
decision inside another infra repository.

Reachable impact: the next patient/branch/file/team writer can compile and commit
with a duplicated check or no `transactionQuotaPort` call, restoring the exact
last-slot race Ч4б exists to eliminate. A temporary production repository with
its own `saas_quota:branches:<org>` advisory lock and count query passed both the
ordinary scoped ESLint and the current raw-SQL gate. The fixture was then deleted.

Required bounded fix: add one structural quota-port boundary gate with a built-in
self-test, wire it into the ordinary lint path, and reject production quota
enforcement outside the authorized port/caller construction. Do not add a manual
allowlist of writers that must remember to call the port.

## Blind kill-set and evidence

The kill-set was fixed before reading the candidate tests: organization/mechanic
lock before recount; fail-closed missing tariff/quota; active override over frozen
paid-period tariff; live release-aware stock recount; exact organization scope;
team usage including active specialists, valid pending doctor invites and
accepted-unbound doctors; paid-seat allowance and same-email replacement; hard
block for missing seat baseline; all writers structurally forced through the
port; preservation of newer billing/autopay repository behavior.

The candidate tests cover only the two pure happy paths. They do not detect
removal of the advisory lock, wrong organization scope, inactive override use,
wrong usage recount, missing caller, or loss of the current billing additions.
The new red assertion is the fixed oracle for F1. F2 is a structural finding and
must be closed by the gate/self-test required by the authority, not by a test that
searches source text.

`git merge-tree --write-tree 60266ec2a refs/audit/current-feat` produced tree
`ace1b5e83b969e47ce843f98a30ba22a4249ea48` without textual conflicts. Inspection
of that tree confirms the quota refactor can coexist with the newer
`claimSaasBillingInvoiceProviderIntent`, failed-invoice manual checkout,
`currentTariffId`, renewal deduplication and tariff-downgrade changes. The fixer
must merge/rebase from current `feat` and retain those additions; replacing
`pgSaasBilling.ts` with the old candidate blob is not acceptable.

## Commands and results

```bash
pnpm --dir apps/webapp exec vitest --run src/infra/repos/transactionQuotaPort.unit.test.ts src/app/api/clinic/invites/route.route.test.ts
# Before the audit oracle: 2 files / 5 tests passed.
# After the audit oracle: expected FAIL, the legacy-null assertion receives
# seat_overage_confirmation_required instead of seat_limit_reached.

pnpm --dir apps/webapp exec tsc --noEmit
node scripts/check-no-new-raw-sql.mjs
git diff --check
# Candidate before the audit artifact: all exit 0; raw-SQL gate reported OK.

git merge-tree --write-tree 60266ec2a refs/audit/current-feat
# exit 0; tree ace1b5e83b969e47ce843f98a30ba22a4249ea48.

rg -n "saas_quota:|clinic_invite_seats:|assertStockQuotaAvailable|StockQuotaReachedError|resolveClinicTeamAvailability|included_seats|paidAdditionalSeats" apps/webapp/src --glob '!**/*.test.*'
rg -n "transactionQuotaPort" apps/webapp/src --glob '!**/*.test.*'
# Inspection census used to verify the current writers and absence of a quota-specific gate.

# Temporary production bypass fixture present:
node scripts/check-no-new-raw-sql.mjs
pnpm --dir apps/webapp exec eslint src/infra/repos/auditQuotaBypass.ts
# Both exit 0; raw-SQL gate reported OK. Fixture then deleted.
```

No temporary product mutation remains. Handoff is one fixer pass for F1 and F2,
then the same saved acceptance assertion, gate self-test, focused route/unit tests,
webapp typecheck and current-feat integration inspection.
