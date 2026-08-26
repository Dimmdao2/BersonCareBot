# Domain access audit — appointments, reminders, scheduler and delivery (2026-08-26)

## Authority

Read `AGENTS.md` heading map before every action, then §1/§1a/§1b, §2–§6, §9, §10a, §10b and §24 in full.
Product authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D5–D7, D14, D17, D20, D21 and D30;
`docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md`; `docs/OWNER_DECISIONS.md`.
Candidate is the current `feat/doctor-ui-rebuild` head contained by this audit worktree.

Owner oracle from `docs/OWNER_DECISIONS.md`:
> «любой запрос к базе данных без контекста и точного совпадения разрешений выдаёт 0 строк и пишет ошибку в журнал»

## Тест или взгляд

This is an independent whole-path audit, not a product fixer. Check one-time structure by inspection, generator
byte-checks and safe catalog introspection. Check behavior with the smallest existing targeted tests and rollback-only
named DEV/TEST probes under actual scheduler, delivery-worker, integrator and webapp roles. Never create a disposable
database. Do not deploy, push, run full CI, print secrets, send external messages or leave durable rows. Do not edit
production code or leave temporary fault injections. Return findings in the final log; make no commit unless a durable
acceptance test is truly required by §10a/§10b.

## Required audit

Before reading existing tests, derive a blind kill-set. Trace these paths as one system:

1. Manual/public appointment create, reschedule and cancel; specialist-task create/update/complete/delete; patient
   reminder rule create/mute/snooze/complete/delete.
2. Materialization of the due item, resident scheduler claim, queue state transitions, retry scheduling, provider
   attempt recording, final delivered/dead state and cancellation invalidation. Detect duplicate stores, duplicate
   final-delivery journals and obsolete sweep/HTTP/direct-writer paths.
3. Enumerate every reachable port/function/relation/trigger plus runtime principal for each step. Verify exact
   `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`EXECUTE`, ownership, invoker/definer, RLS, accepted context and tenant walls.
4. Compare against privilege declarations, generated DEV/TEST artifacts, runtime overlays and systemd/scheduler
   topology. Identify missing access, broad inherited access, later overlays that replace a secured function, and
   settings that make the UI claim a channel is enabled while the resolver selects another channel.
5. Findings must give a reachable scenario, user impact, exact seam, violated authority and exact evidence command.
   Do not report style, theoretical hardening or an alternative architecture.

Output a compact matrix `business step → role → function/port → relations/settings → PASS|FAIL|BLOCKED`, then one
deduplicated MUST-FIX list and the exact unproved live cases.
