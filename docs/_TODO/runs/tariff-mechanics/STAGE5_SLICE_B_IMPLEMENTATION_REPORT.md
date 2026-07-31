# Stage 5 / Slice B — clinical tests, online intake, specialist tasks

## Pre-diff mechanical write-path enumeration

Source of truth for scope and behaviour: `TARIFF_MECHANICS_PLAN_2026-07-30.md` §1, §1a, items 5.3/5.4/5.7 and `QUOTAS_AND_MECHANICS_DESIGN_2026-07-28.md` §§1, 5.1, 5.6, 7.  The Stage 5 Slice A R3 and re-audit reports are the completeness checklist: enumerate from the table, include routes/actions/loaders/side effects, and prove a real handler rejects a disabled mechanic.

This table was written before the implementation diff.  `left open — implementation pending` is a pre-diff status, not an exemption; the final status is updated with the implementation and evidence below.

| Mechanic / data tables | Repository mutation and every caller found mechanically | Surface / side effect | Pre-diff disposition |
|---|---|---|---|
| `clinical_tests`: `clinical_tests` | `pgClinicalTests.create/update/archive/unarchive`; `api/doctor/clinical-tests` POST, `[id]` PATCH/DELETE; clinical-test server actions (`actions.ts` and `actionsInline.ts` through `actionsShared.ts`) | doctor catalog CRUD | left open — implementation pending |
| `clinical_tests`: `test_sets`, `test_set_items` | `pgTestSets.create/update/archive/unarchive/setTestSetItems`; `api/doctor/test-sets` POST, `[id]` PATCH/DELETE, `[id]/items` PUT; test-set server actions through `actionsShared.ts` | doctor test-set CRUD and composition | left open — implementation pending |
| `clinical_tests`: treatment-program instance groups/items only | `instance-tree-system-groups.ts` may lazily materialise a `systemKind: 'tests'` group; instance readers render it in doctor and patient programme surfaces. Instance mutation paths that add tests are separately inspected; treatment-program **templates** and LFK-complex templates are excluded by owner ruling. | system test group visibility in assigned treatment programmes | left open — implementation pending |
| `clinical_tests`: `clinical_test_measure_kinds`, reference items | no writer through `ClinicalTestsPort` / `TestSetsPort`; reference-catalog administration is a different mechanic/surface | catalogue metadata | not needed — no mutation of clinical-test/test-set data was found |
| `online_intake`: `online_intake_requests`, `online_intake_answers`, `online_intake_attachments`, `online_intake_status_history` | `pgOnlineIntake.submitLfk/submitNutrition/changeStatus`; patient `online-intake/lfk` POST and `nutrition` POST; doctor `[id]/status` PATCH | patient questionnaire submission; doctor status mutation | left open — implementation pending |
| `online_intake`: same tables | doctor `[id]/reply` POST calls `sendAdminReply` and then lazily calls `changeStatus(new → in_review)` | reply plus hidden status write | left open — implementation pending |
| `online_intake`: same tables | doctor/patient list/detail/stats GET routes, doctor intake pages, communications intake tab, cabinet history, Today counters | read-only UI and direct URL/API visibility | left open — implementation pending |
| `online_intake`: same tables | `platformUserFullPurge` deletes intake rows as part of account-wide identity deletion | account lifecycle | not needed — not a reachable online-intake feature action; it is outside this slice and patient-card/app boundary |
| `specialist_tasks`: `specialist_tasks` | `pgSpecialistTasks.create/update/complete/delete`; doctor `tasks` POST, patient-linked `clients/[userId]/tasks` POST, `tasks/[taskId]` PATCH/DELETE, `complete` POST | specialist task CRUD | left open — implementation pending |
| `specialist_tasks`: `specialist_tasks` | cron tick → `dispatchDueSpecialistTaskReminders` → `markReminderSent`; notification delivery reads push subscriptions | push/reminder side effect and task-row update | left open — implementation pending |
| `specialist_tasks`: `specialist_tasks` | task list/summary GET routes; Today dashboard SSR; client-card task panels and global task panel | doctor read/navigation visibility | left open — implementation pending |
| `specialist_tasks`: notification preferences / subscriptions | read-only channel resolution and transport delivery after the task side-effect boundary | global notification system | not needed — notifications are never tariff-limited; the task-specific dispatcher itself is the guarded boundary |
| `api/admin/settings` / CMS / integrator entry points | exact searches found no setting key, CMS action, integrator/bot writer, page loader that materialises these three tables, or push-subscription writer for clinical tests or online intake | shared surfaces specifically required by Slice A lessons | not needed — no mutation of the three mechanics’ data tables; specialist-task cron is listed separately above |

## Implementation and proof

Pending implementation.
