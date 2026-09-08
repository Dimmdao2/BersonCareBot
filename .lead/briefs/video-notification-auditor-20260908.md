# Тест или взгляд

Повторяемые dedup/channel/privacy/failure-контракты проверяются поведением и однократным fault injection; одноразовые
architecture/diff свойства проверяются чтением. Не писать тесты на строки исходника, названия функций, порядок
внутренних вызовов, конкретный copy или форму implementation.

# Independent auditor-live — #1100 meeting invitation notification

Audit exact candidate `b0c1085d606031656ab0ad694874691de3da30b5` on `wt/video-notifications-20260908`, based on
`2961859aad29d6edc66bd09f3ca08445f24b8349`. Before inspecting implementation/tests, read the `AGENTS.md` map and
full §§1b/2–5, §10a, §10b and §24. Authority is `docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`, ACC-02/03/05/06,
VM-07, GATE-01..04 and Wave 2 E.

Do not change product code. You may add/adjust and commit only genuinely missing behavioral acceptance tests and one
concise audit artifact. Revert every fault injection. Do not merge current feat, push, land, deploy, mutate DB/DEV/
TEST/PROD, deliver a real notification, start a shared server or run full CI.

## Blind kill-set — write before opening tests

1. A retry/resume of an active meeting or explicit rotate/revoke produces a second automatic event, or a newly
   created initial invite produces none/more than one (ACC-05).
2. The meeting path bypasses canonical `resolvePatientNotificationChannels`, hardcodes email/push, or sends on a
   channel unavailable/disallowed by recipient preference (ACC-05, one common chokepoint).
3. The URL uses staff `APP_BASE_URL`, a foreign/provider origin, query/path secret, or wrong organization instead of
   the canonical organization → patient public origin and `/live#secret` (ACC-02/05/06).
4. Raw invite secret enters a DB/idempotency/event key/log/error/analytics field, or content contains patient name,
   symptoms, diagnosis, notes, appointment/clinical/Jitsi/JWT/TURN detail (ACC-02/03/05).
5. Queue/channel/origin failure aborts or recreates the meeting/invite, hides the copyable link, or leaks internal
   failure detail instead of bounded best-effort status (ACC-05/GATE-04).
6. The code uses a direct sender/real DEV delivery instead of the existing durable queue, or loses dedup across the
   intended durable seam (ACC-05, §1b).
7. Notification APIs depend on Jitsi-specific render-session fields, making provider replacement change this path
   (VM-07).
8. Notification can be produced from an unauthorized/entitlement/Online-bypassed create path, or guest exchange can
   cause a notification (ACC-01/GATE-01/02).

For each repeatable green class, use the cheapest public service/module boundary and one deliberate temporary
production fault. An already-red acceptance test is a valid FAIL handoff and you must not fix it. Inspect the full
candidate diff, dependency injection, durable queue contract, payload/idempotency shapes and all call sites.

Run focused video/notification/channel tests, webapp typecheck, scoped ESLint, architecture/raw-SQL/queue-boundary and
entitlement registry gates plus `git diff --check`. Return binary PASS/FAIL with reachable scenario, impact and exact
owner ID for every finding. Report candidate/base, commands/counts, kill-set mapping, caught/uncaught totals and any
blocked live-only proof. If tests/artifact change, stage only those allowed paths and commit; otherwise keep clean. Do
not finish while a foreground command runs.
