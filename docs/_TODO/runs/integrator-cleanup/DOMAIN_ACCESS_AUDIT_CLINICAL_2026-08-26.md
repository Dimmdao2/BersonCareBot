# Domain access audit — patient lifecycle, visits, programs, LFK and files (2026-08-26)

## Authority

Read `AGENTS.md` heading map before every action, then §1/§1a/§1b, §4a–§6, §9, §10a, §10b and §24 in full.
Product authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` A4 and Track D access requirements;
`docs/OWNER_DECISIONS.md`; `docs/APP_RESTRUCTURE_INITIATIVE/`; `AGENTS.md` §18–§20 where applicable.
Candidate is the current `feat/doctor-ui-rebuild` head contained by this audit worktree.

Owner oracle from `docs/OWNER_DECISIONS.md`:
> «любой запрос к базе данных без контекста и точного совпадения разрешений выдаёт 0 строк и пишет ошибку в журнал»

## Тест или взгляд

This is an independent whole-path audit, not a product fixer. Check one-time structure by inspection, privilege
generator byte-checks and safe catalog introspection. Check repeatable behavior using the smallest existing tests and
rollback-only named DEV/TEST probes under real patient/staff/global-admin roles. Never use a disposable database. Do
not deploy, push, run full CI, print secrets or leave durable rows. Do not edit production code or leave temporary
fault injections. Return findings in the final log; make no commit unless a durable acceptance test is justified by
§10a/§10b.

## Required audit

Before reading existing tests, derive a blind kill-set. Trace the complete data-access graph for:

1. Clinic patient enrollment, clinic-scoped archive/unarchive, automatic restoration on a new appointment, global
   blocking/unblocking and the effect on login, booking and other-clinic access.
2. Patient-card read/update, visit create/save/delete, diagnoses/manipulations/recommendations, appointment comments,
   clinical files and relevant history.
3. Exercise/reference CRUD, program template/instance assignment and rename, LFK item creation/edit/completion,
   publish/archive and patient read/progress paths.
4. For every path enumerate actual ports/functions/tables/views/triggers and roles. Verify exact CRUD/EXECUTE,
   function owner and invoker/definer mode, RLS/context/tenant wall, trigger dependencies and generated privilege
   artifacts. Detect missing rights, broad grants, duplicate/obsolete reads and writes, and later overlays/migrations
   that replace the secured definition.
5. Findings require a reachable user scenario, impact, exact seam, violated authority and evidence command. Do not
   report layout/style differences, speculative hardening or alternative architecture.

Output a compact matrix `user action → runtime role → function/port → relations → PASS|FAIL|BLOCKED`, followed by a
deduplicated MUST-FIX list and unproved live cases.
