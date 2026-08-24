# Track D final live audit — delivery/scheduler path (D17 + D30)

Тест или взгляд: booking/queue/scheduler/provider behavior — живой bounded TEST journey и runtime measurements; process topology, cron absence and cleanup — inspection.

## Authority

Read `AGENTS.md` sections 1, 1a, 1b, 5, 9, 10a, 10b, and 24, then the complete D17/D30 checklist passages.

Источник оракула: `/home/dev/dev-projects/BersonCareBot/docs/_TODO/BOOKING_REMINDERS_AND_CALENDAR_2026-08-19.md` — «Живая проверка на TEST: создать запись».

Exact deployed TEST source is `3745ae24c9de62afc85f6aaf602bfecb3ada5f69`; the public old address remains
`https://test.bersoncare.ru`. Relevant authority:

- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — D17 and D30;
- `docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md` — open Ш1/Ш3/Ш4/Ш5/Ш6 gates;
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_TPB09_D17_BRANDING_INTEGRATION_2026-08-24.md`.

## Required audit

Use the normal existing-owner TEST boundaries and safe delivery redirect. Measure, do not infer from code:

1. TEST exact SHA, all four current services active, legacy worker inactive, scheduler is the sole resident
   scheduler+delivery executor, and `cronport list` contains no retired Track-D host triggers.
2. D17 booking journey: create a real TEST booking through an application/API boundary, prove confirmation plus
   reminder materialization under the narrow integrator role, exact organization credential resolution, and the
   calendar step. Replay the same lifecycle event and prove no duplicate patient/doctor message. Clean up the
   booking and all test-only artifacts through normal ports.
3. D30 Ш1: one durable delivery row visibly transitions through the canonical states to sent (or a deliberately
   safe provider result), with admin/system-health counters consistent with the queue.
4. D30 Ш3: repeat the already-designed existing-owner specialist-task create/update/complete/delete journey and
   prove write-time queue creation, old-row terminalization, resident delivery, no orphan pending row, and cleanup.
5. D30 Ш4: safe reminder provider proof through resident scheduler with consistent planned/dueClaimed/sent
   measurements and no parallel legacy sender.
6. D30 Ш5/Ш6: use post-deploy runtime/job history plus a bounded observation window (maximum 20 minutes) to prove
   resident digest/guard/probe progress and absence of a host-cron executor. Do not wait an hour if existing
   timestamped evidence answers the gate. Restore any temporarily changed `digestTime` exactly. If a real recipient
   or configured safe channel is absent, report the exact blocker; do not redirect a broad audience or manufacture
   a green result.

## Boundaries

- TEST only; PROD forbidden; no disposable DB; no synthetic user.
- Never print phones, emails, external ids, tokens, OTPs, credentials, env values, message bodies, or patient data.
- Real delivery is allowed only to the existing owner/test allowlist and only for narrowly targeted records; no
  broadcast or 45/116-recipient operation.
- Any created booking/task/config change must be cleaned/restored and absence verified. Do not delete unrelated
  rows or alter existing appointments/tasks.
- Cron operations go through `node /home/dev/brain/tools/cronport.mjs` only. Absence is a no-op, not a reason to
  invent a cron name.
- No product fixes, merge, push, deploy, or full CI.
- Write and commit a concise artifact under `docs/_TODO/runs/integrator-cleanup/` with each named gate
  `PASS|FAIL|BLOCKED`, exact sanitized measurements and cleanup evidence.
