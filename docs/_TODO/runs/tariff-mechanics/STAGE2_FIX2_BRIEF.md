# MISSION: stage 2, correction round 2 — six defects from the closing audit

The closing audit failed stage 2 again. Two of the six are the class this whole rewrite exists to kill: a second
lifecycle resolver living outside the single door, and mechanics laddered while the owner has not yet ruled on them.

## Authority

- **Plan:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §5a, stage 2 and 3.1a/3.1b.
- **Verdict you are fixing:** `docs/_TODO/runs/tariff-mechanics/STAGE2_FINAL_AUDIT_RESULT.md`, MUST FIX 1–6.
- **Canon:** `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §4a, §5.

## Fix 1 — the integrator has its own ladder

`apps/integrator/src/.../writeDiaryLfkDirect.ts:176-230` decides `no_trial / read_only / blocked` itself and never reads
the owner-configured system or mechanic policy. That is a second source of truth for exactly the thing stage 2 made
configurable. Route it through the same resolver or port. If the integrator physically cannot call the webapp resolver,
say so plainly with the reason instead of duplicating the logic — the lead will decide the seam.

## Fix 2 — revert what the owner has not decided (item 2.6c)

`POLICY_MECHANICS = OVERRIDABLE_MECHANICS` currently includes `payments` and `branding`, and their mutation routes
already call the ladder. But 2.6c is an OPEN QUESTION to the owner: canon §5.5 says the clinic's money is never blocked,
and the branding fallback («neutral platform look, the message still goes out») is an agent's choice, not his words.
**Remove both from the ladder until he rules.** Leave a comment naming plan item 2.6c so nobody re-adds them silently.
Do not invent a middle ground.

## Fix 3 — prove the real SQL output, not the mock

`pgOrgEntitlements.test.ts:36` catches losing the TypeScript mapping but not losing the policy columns from the SQL
function: the mock returns ready-made fields regardless of `0276` and the overlay. Add a proof that removing the two
policy columns from the migration or the overlay makes a gate go red.

## Fix 4 — prove persistence end to end

`CommercialConstructorClient.ui.test.tsx:39` catches a UI hardcode and a missing field in the request, but its fetch mock
stores the request directly. Removing `mechanicAccessPolicies` from the route, the service or the PG `tariffValues()`
would stay green. Add a proof that covers write-then-read-back.

## Fix 5 — a compatibility organization gets a 500 instead of a refusal

`clinic-seats/service.ts:41` throws when the seat limit is `null`, so the team page and its API answer 500 for a
compatibility organization that legitimately passes the read gate. Turn it into the visible refusal the canon requires
(§5.6), naming what to configure. No invented number.

## Fix 6 — the invite RLS still reads the old shape

`deploy/postgres/organization-member-invites-rls.sql:281` reads `tariff.mechanics->>'clinic_team'` while the constructor
now stores seats in `included_seats`, so a tariff without an override gets `entitlement_disabled` when an invite is
accepted. Align it, and keep the deploy privilege contract intact (if a `SECURITY DEFINER` under `app_owner` changes,
bump the counter in `deploy/host/deploy-test-saas.sh` and the two contract tests).

## Constraints

- Do not touch billing (`SAAS_BILLING_PLAN.md`) or the mock-payment routes. Do not edit the plan or the canon.
- Keep migration number `0276`; the lead assigns the final one at merge. Live DEV migration is the lead's job.
- Targeted runs only: `pnpm --filter webapp typecheck`, `lint`, exact `vitest run <file>`, drizzle journal check. **No
  full CI.** Never `git add -A`. Commit increments in this clone; no push, no merge.

## Report

Per fix: `what was wrong → what you changed (file:line) → the test → what you saw when you removed the fix by hand`. For
fix 1 state explicitly whether the integrator now calls the single resolver or why it cannot. For fix 2 confirm both
mechanics are out of the ladder and nothing else changed with them.
