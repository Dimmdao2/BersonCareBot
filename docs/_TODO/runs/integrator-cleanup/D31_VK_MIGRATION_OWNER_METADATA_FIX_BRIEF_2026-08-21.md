# D31 VK migration — owner-execution metadata correction (2026-08-21)

Role: same-branch mechanical migration worker on `wt/d31-vk-channel-20260821`.

Источник оракула: `AGENTS.md` §1b/§24.3 — «DB migration — owner-aware rollback-only preflight on named DEV before
landing»; saved D15 live failures in `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` prove that function/DO
statements without their temporary schema/language capability metadata fail under the exact declared owner.

Read the `AGENTS.md` heading map, then §1 migration rules, §7, §10 and §24. Before editing, search later owner
decisions and the current D31 plan/owner punchlist again. A later owner ruling replaces this brief.

## Exact candidate and problem

Preserve accepted D31 product SHA `e8009c501` and edit only:

`apps/webapp/db/drizzle-migrations/20260821T050000_add_vk_messenger_settings.sql`

The migration has four existing `CREATE OR REPLACE FUNCTION app.*` statements and one owner-marked `DO` statement
that dynamically executes an existing `CREATE OR REPLACE FUNCTION` definition. Their exact declared owners need
only the capabilities required while the owner-aware migrator executes those statements:

1. `app.read_integrator_provider_runtime_setting(text)` — add `BCB-MIGRATION-SCHEMA-CREATE: app` and
   `BCB-MIGRATION-LANGUAGE-USAGE: plpgsql` after its owner marker.
2. `app.read_integrator_clinic_delivery_credential(text,uuid)` — add the same two markers.
3. `app.read_patient_reminder_delivery_target_snapshot(...)` — keep its existing language marker and add only
   `BCB-MIGRATION-SCHEMA-CREATE: app` before it.
4. `app.set_current_patient_notification_topic_channel(...)` — keep its existing language marker and add only
   `BCB-MIGRATION-SCHEMA-CREATE: app` before it.
5. `$bcb_vk_reminder_commit$` DO block — add `BCB-MIGRATION-SCHEMA-CREATE: app` and
   `BCB-MIGRATION-LANGUAGE-USAGE: plpgsql` after its owner marker and before its verify marker, because it executes
   the existing function definition under `app_seam_reminder_materialization_owner`.

Do not change executable SQL, bodies, order, owners, verify statements, breakpoints or any product/test file.
Prove executable SQL is byte-identical after stripping only the added metadata lines.

## Validation and result

Run only focused static gates that cover migration parsing/order and owner execution rendering, including the
existing `migrate-local-parse` and `migrate-local` tests, the migration-order/privilege checks applicable to this
file, and `git diff --check`. Do not create a new test for metadata text.

Append the exact diff, commands and results to existing
`docs/_TODO/runs/integrator-cleanup/D31_VK_CHANNEL_AUDIT_RESULT_2026-08-21.md`; stage only the migration and that
result plus this brief, commit before ending and leave the tree clean.

Forbidden: DB access, direct SQL, named-DEV preflight, migration execute/reapply, fixtures, disposable DB,
historical replay, TEST/PROD, landing, deploy, push or full CI. D31 live preflight waits for accepted D15 and then
validates the combined 04:00 → 05:00 migration order before landing.
