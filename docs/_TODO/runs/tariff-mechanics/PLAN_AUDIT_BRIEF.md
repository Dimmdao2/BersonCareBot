# MISSION: adversarial audit of a PLAN (read-only, no file changes)

You audit a plan document, not code. Verdict must be PASS or FAIL with numbered findings.

## Authority — read these IN FULL before writing anything

1. **The plan under audit:** `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md §5a`
2. **Owner rulings and the canonical model:** `docs/_TODO/SAAS_FOUNDATION/QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md`
   — §1.1, §1.2, §1.3 (owner rulings 30.07, verbatim quotes), §9.1–9.11 (unified structure, per-line verdicts).
3. **Owner-facing summary:** `docs/_TODO/OWNER_PUNCHLIST_2026-07-28.md` §10 (items 10.3–10.19).
4. **Rules the plan must obey:** `.cursor/rules/plan-authoring-execution-standard.mdc`,
   `.cursor/rules/tests-check-behaviour-not-circumstances.mdc`, `.cursor/rules/webapp-tests-lean-no-bloat.mdc`,
   `docs/ORCHESTRATOR_CHECKLIST.md`.
5. **Reality of the code** (verify claims, do not trust the plan): `apps/webapp/src/modules/org-entitlements/types.ts`,
   `.../service.ts`, `apps/webapp/src/app-layer/guards/requireEntitlement.ts`,
   `apps/webapp/src/app-layer/entitlements/protectedActionRegistry.ts`, `apps/webapp/db/schema/saasEntitlements.ts`,
   `docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md`, `docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md`.

## What to check — in this order

**A. Completeness against owner rulings.** Every owner ruling in design §1.1–1.3 and every per-line verdict in §9.11
must map to at least one atomic checkbox in the plan. Produce a matrix: `owner ruling → plan checkbox ID → present /
MISSING`. A missing ruling is a MUST FIX. Quote the ruling text you matched.

**B. Invented scope.** The reverse direction: every checkbox in the plan must trace to an owner ruling or to a
mechanical necessity of one. Any checkbox that is neither is invented scope — a MUST FIX (the repository has a hard
ban on agents inventing scope from findings). Name the checkbox ID and what authority it lacks.

**C. Necessary and sufficient.** Owner 30.07: «главное — не переусложнить. Делать НЕОБХОДИМО И ДОСТАТОЧНО (код
должен работать, а не быть написан ради кода, как и тесты)». Flag anything that is machinery for its own sake:
new abstractions, extra layers, gates, or tests that do not make required behaviour work. Also flag the opposite —
a stage that cannot possibly work as written because a necessary step is absent.

**D. Factual claims about the code.** The plan asserts, among others: only three mechanics are really enforced;
`cms_pages` counts archived rows; nine live surfaces have no toggle; the courses trigger and the `0270` CMS trigger
exist; mechanics are stored as jsonb so new keys need no migration; `check-s4-entitlement-coverage` proves the guard
in the named file. Verify each against the code and report any claim that is false or stale, with file:line.

**E. Execution hazards the plan must already handle.** Check the plan against known repository traps and report each
one it fails to handle: migration number assigned at merge, not in the brief; `SECURITY DEFINER` under `app_owner`
requires bumping the counter in `deploy/host/deploy-test-saas.sh` and two contract tests; deploy asserts an exact
privilege set per login role; deleting a route or page requires wiping `apps/webapp/.next/types` before full CI;
FORCE-RLS means a repository read without a principal returns empty rather than failing loudly.

**F. Ordering and parallelism.** Stage 4 and stage 5 are declared independent and parallel. Verify by file scope
that they truly do not collide (both touch the registry and the protected-action registry — say whether that is a
real conflict and how to sequence it if so). Same question for the three slices inside stage 5.

**G. Test policy.** Does the plan demand exactly what the new rules require and nothing more? Specifically: does any
checkbox invite source-text assertions, a new test file per trivial change, or a full CI run after every step? Does
every numeric mechanic have a race proof, and is the DB-privilege check (lesson 28.07) present where a new function
or trigger appears?

## Rules for your findings

- Each MUST FIX names: the concrete reachable failure, its impact, and the exact requirement or rule violated.
- Style, preferences, theoretical edge cases without an actual path, extra hardening and «could be better» are NOT
  findings. Delete them rather than reporting them.
- Do not propose an alternative architecture. Do not rewrite the plan. Report defects.
- You are read-only: change no files, create no files. Your report is your stdout.

## Output format

1. `VERDICT: PASS` or `VERDICT: FAIL`.
2. Matrix from part A (one line per owner ruling).
3. Numbered MUST FIX list, each with checkbox ID, defect, impact, violated requirement.
4. Short section «что в плане верно» — so the lead knows what not to touch.
5. Section «claims I could not verify» with the reason.
