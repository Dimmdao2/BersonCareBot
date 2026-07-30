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

## Fix 2 — the ladder applies to EVERY mechanic, including payments and branding

Owner ruling 30.07, verbatim: «конечно отключаются и оплаты и лестницы, но мы вернулись к началу — ты вместо того чтобы
дать мне ручки настройки, решаешь как захардкодить поведение при завершении оплаты. Это не решается тобой сейчас — я
должен это поведение настраивать в тарифах для всех механик и я говорил тебе об этом дважды».

So the previous instruction in this brief («remove payments and branding from the ladder») was WRONG and is withdrawn.
Required instead:

- every mechanic is laddered and configurable — `payments` and `branding` included; no agent-chosen exception list;
- the only mechanics outside the ladder are the critical ones the owner named himself (patient card, patient app,
  reminders and notifications, two-factor authentication, the operations log, export, emergency help);
- delete any code or comment that hardcodes «money is never blocked» or a branding fallback as a rule — those were the
  agent's inventions, now removed from the canon too;
- what happens to payments or branding when the right is lost comes from the owner's four fields, exactly like any other
  mechanic. Do not add a special case, a softer path or a warning-only mode for them.

Prove it by behaviour: with a policy configured for `payments`, the ladder moves it through grace, read-only and the
terminal state like any other mechanic; a test goes red if a special case for payments or branding reappears.

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
