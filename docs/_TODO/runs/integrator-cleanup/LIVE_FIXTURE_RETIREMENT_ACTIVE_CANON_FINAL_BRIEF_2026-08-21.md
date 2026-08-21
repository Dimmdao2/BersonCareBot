# Live DEV/TEST fixture retirement — active canon final pass (2026-08-21)

Role: same-branch documentation/current-procedure worker on `wt/live-fixtures-retirement-20260821`.

Источник оракула: `docs/OWNER_DECISIONS.md:870-871` — «отдельное fixture-наполнение для проверок на live
DEV/TEST запрещено. Агенты, deploy и тесты используют уже зарегистрированные owner-учётки и клиники;
rollback-only probe не оставляет fixture-сущностей».

## Authority

- Read `AGENTS.md` heading map, then §0, §1a/§1b, §12 and §24 before editing.
- Owner decision: `docs/OWNER_DECISIONS.md:870-871` — live DEV/TEST checks use already registered owner accounts
  and clinics; separate fixture filling is forbidden; rollback-only probes leave no fixture entities.
- Owner correction in this thread: active plans/checklists must not retain old fixture wording beside the new
  decision; update stale checkboxes and acceptance text so a later agent cannot execute the retired path.
- `AGENTS.md` §«Как решать, что делать»: incompatible old prose is removed from active owner registry/canon/open
  plan, not preserved struck through or under `SUPERSEDED`; completed audit/evidence/log records are history and
  are not rewritten.
- Previous product commit `d4ffa79a1` is a partial result. Preserve its valid removal of `runs/clickthrough/` and
  the relocated generic browser resolver.

Before editing, search all later owner decisions and reverse references again. If a later owner ruling conflicts,
stop and report it instead of choosing.

## Exact problem to close in one pass

The executable fixture machinery is gone, but active plans/maps/runbooks still tell later agents that fixture
reconciliation is part of deploy, that a deleted operator packet is live, or that D30 is blocked on
`/run/bersoncarebot/saas-smoke.fixture`. The active document must contain one current procedure, not old-then-new.

## Allowed files

- `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md`
- `docs/_TODO/SAAS_FOUNDATION/FOUNDATION_PLAN.md`
- `docs/_TODO/SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md`
- `docs/_TODO/SAAS_FOUNDATION/OWNER_READY_TEST/ROADMAP.md`
- `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md`
- `docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md`
- `docs/_TODO/SAAS_FOUNDATION_PLAN_MAP_2026-08-01.md`
- `docs/_TODO/PLAN_HYGIENE_REGISTRY_2026-07-29.md`
- `docs/_TODO/runs/integrator-cleanup/LIVE_FIXTURE_RETIREMENT_CURRENT_PROCEDURE_CLOSURE_BRIEF_2026-08-21.md`
- `docs/_TODO/runs/integrator-cleanup/LIVE_DEV_TEST_FIXTURES_RETIREMENT_2026-08-21.md`

Do not edit outside this list. If another active operational contradiction is found, list it in the result as a
lead finding; do not expand scope.

## Required corrections

1. D30 Ш3: remove the dependency on the absent fixture file and temporary auth harness. Keep the real remaining
   acceptance requirement, but express it only as an ordinary check with an already registered owner account on
   named DEV/TEST. Do not create/send to a synthetic user and do not claim provider delivery has already passed.
2. `FOUNDATION_PLAN.md`: replace the live `seed two cabinets + shared Person` quality-gate instruction with the
   current existing-account/clinic isolation proof and rollback-only mutation boundary; remove the duplicate
   fixture wording from sequencing.
3. `SAAS_DEPLOY_SEQUENCE.md`: it is still classified as live. Remove active fixture reconciliation/product-smoke
   requirements and disposable compatibility instructions. Leave one short positive route to the current hard
   protocol and ordinary existing-owner acceptance; do not retain the old procedure under a historical banner.
4. `OWNER_READY_TEST/ROADMAP.md`: replace the `УСТАРЕЛО/ЗАМЕНЕНО` old-then-new bullet with one positive current
   checkbox/evidence line. No retired seeder or fixture-dependent smoke wording remains active.
5. `SAAS_ENFORCE_ROADMAP.md`: remove incompatible completed/open fixture mechanics from the active A1/product-smoke
   plan and status tables, including struck retired operator-packet gates. Preserve unrelated test-local data used
   by unit/integration tests and C3/C4 queue behavior; this task is only persistent/live DEV/TEST fixture machinery.
6. `SAAS_PROD_DEPLOY_PROCESS.md`: delete the whole superseded historical demo-fixture execution section from this
   active runbook. Git/audit records retain history. Preserve unrelated current PROD material and do not authorize
   PROD work.
7. Remove stale rows that call the already absent
   `SAAS_PRODUCT_SMOKE_FIXTURE_OPERATOR_PACKET.md` a live contract from the active plan map and hygiene registry;
   update any directly derived nearby status/count text only if needed for internal truth.
8. Normalize the pass-4 brief EOF so branch-wide `git diff --check feat/doctor-ui-rebuild...HEAD` is clean.
9. Extend the existing retirement result with this final pass, exact commands and remaining classified matches.
   Do not create another result file.

## Non-goals and prohibitions

- No code, migration, DB, server, deploy, login, TEST/PROD, CI, push or landing.
- No fixture/account/seed/env-password/cookie/auth helper replacement.
- No disposable database or historical migration replay.
- Do not delete ordinary unit-test fixtures or rewrite completed audit/evidence/log records.
- Do not use `git add -A`; stage only the allowed files actually changed.

## Acceptance

- Exact searches prove there is no active executable/reference path for `saas-smoke.fixture`,
  `saas-test-fixture.env`, `SAAS_TEST_FIXTURE_*`, `fixture-file`, fixture seed/reconcile/packet in the allowed active
  plans/runbooks. Any remaining match is listed with file:line and classified as test-local or historical
  audit/evidence/log, never an active named-DEV/TEST instruction.
- The deleted packet is no longer called live in the plan map or hygiene registry.
- D30 Ш3 names ordinary existing-owner verification and no fixture blocker.
- `git diff --check feat/doctor-ui-rebuild...HEAD` passes.
- Commit all changed allowed paths explicitly, leave the tree clean, and report SHA. Do not stop with uncommitted
  work.
