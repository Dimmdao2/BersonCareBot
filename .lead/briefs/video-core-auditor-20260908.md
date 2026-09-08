# Тест или взгляд

Повторяемые security/lifecycle-контракты проверяются поведенчески слепым kill-set и fault injection; одноразовые
schema/rights/architecture/registry-свойства — чтением diff, generated checks и rollback-only DEV proof. Тесты на
строки исходников, SQL-текст, имена классов и внутренний порядок вызовов запрещены.

# Independent auditor-live — #1100 video core

## Authority and exact candidate

You are the independent auditor of exact committed candidate `e0bac698bcdfab28e551c27c1b30f6a75e8bce11` on branch
`wt/video-core-20260908`, based on `3249e88b5`. Before any inspection, read the `AGENTS.md` heading map and fully
read §1 migration/rights, §§2–5 architecture/config, §10a, §10b and §24. Authority is
`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`: Wave 1 stream A and VM-07, ACC-01..04, ACC-06, GATE-01..04.

Do not change product code. You may add/adjust and commit only genuinely missing behavioral acceptance tests and a
concise audit artifact. Revert every fault injection. Do not push, land, deploy, execute a migration, start a shared
server or run full CI. Work only against this exact candidate. Use named DEV only for rollback-only proof through the
canonical candidate entrypoint; never create a database or read/print secrets.
If the canonical DEV migration lock is occupied, retry at most three times with a bounded 60-second interval; do
not bypass the lock or turn a concurrent run into a product finding.

## Blind kill-set — prepare before reading tests

Name the observable failure, impact and owner ID for each independent class before opening tests:

1. A doctor can create/resume for another tenant, inaccessible client, wrong active workspace or without specialist
   role (ACC-01).
2. Create/join succeeds when `video_meetings` entitlement is denied or the built-in Online branch is inactive;
   hidden UI is not evidence (GATE-01/02).
3. Raw guest secret, Jitsi JWT or TURN credential is persisted, returned to the wrong role, logged, or placed in a
   path/query; tampered, expired, revoked and rotated secrets remain usable (ACC-02/03/06).
4. Guest capability can read patient/doctor data or claim the doctor seat; authenticated patient join does not
   independently match the meeting client (ACC-03/04).
5. Concurrent retry creates duplicate active meetings/invites, or rotation leaves two usable raw capabilities
   (ACC-02/03).
6. Missing/unhealthy provider config fails open or leaks internal existence/config details to a guest (GATE-04).
7. A Jitsi room/JWT shape leaks across the provider-neutral service/API boundary, preventing adapter replacement
   (VM-07).
8. `video_meetings` is absent from the mechanic/protected-action chokepoints or the developer-tariff path hardcodes a
   side channel instead of the existing configurable mechanic path (GATE-02/03).
9. New relations/functions lack exact runtime access/RLS or a function body requires undeclared access and would
   fail with `42501`; migrations issue grants or do not satisfy owner-marker/verify/index rules.

For repeatable behavior, use the cheapest public module/route boundary and retain only tests with a named oracle.
For route claims, invoke the real handler wiring. For DB/RLS, use only an existing or genuinely necessary opt-in
rollback-only devDbProof against `bcb_webapp_dev`; fake DB tests cannot prove grants/RLS. Each green protected class
needs one deliberate temporary production fault and a recorded red assertion; an already-red acceptance test is a
valid handoff and must not be fixed by you.

## Required checks and result

Inspect the complete diff from `3249e88b5`, schema/migration, declaration/generated artifacts, route wiring,
system-settings secrecy and entitlement chokepoints. Run the canonical owner-aware candidate preflight:

`bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot`

Run focused tests you select, generated privilege parity, migration/order/architecture gates, webapp typecheck,
scoped ESLint and `git diff --check`. Write a four-point rights analysis for every migration: objects; statement/body
owners and runtime roles; exact required relation/column/function access; declaration coverage/gaps.

Return binary PASS or FAIL. Every FAIL must give a reachable scenario, impact, exact plan ID/rule and evidence; no
style or speculative hardening findings. The report must list candidate SHA, commands/counts, every kill-set class,
fault injection mapping and number caught/uncaught. If tests/artifact changed, explicitly stage only those allowed
paths and commit; otherwise leave the candidate tree clean. Do not finish while a foreground command is running.
