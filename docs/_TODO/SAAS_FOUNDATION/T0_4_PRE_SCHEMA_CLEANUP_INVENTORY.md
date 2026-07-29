# T0.4-pre schema cleanup inventory

Status: inventory for taskdb `#635`, based on static code/doc reads and read-only subagent reports. No production access, no database row reads, and no PII output were used.

## Summary

The current branch is already past the original Phase 0 prompt baseline: P0.4 integrator org migrations exist, P0.8.5 integrator scoped RLS migration exists, and P0.8.6 bootstrap hybrid settings policies exist. The T0.4-pre cleanup is therefore a runtime-path classification and readiness pass, not a bulk `organization_id` migration.

No domain in this inventory is safe for blind destructive drop. Every major duplicate group has live runtime references or an explicit owner/cutover gate.

## System Settings

Classification:

- `public.system_settings`: canonical runtime/business config.
- Former duplicate settings table and its outbox kind: removed by owner ruling 2026-07-29/taskdb `#1076`.

Evidence:

- Webapp writes through `createSystemSettingsService.updateSetting` and `persistAdminModesBatch`.
- Integrator runtime reads use `apps/integrator/src/infra/db/publicSystemSettings.ts`.
- `check-system-settings-accessors.mjs` blocks direct `system_settings` reads outside canonical accessors and documented global-only media-worker readers.

Decision:

- Keep `public.system_settings` as the single settings store.
- Do not add a new settings copy or replacement push machinery.

Cleanup performed in this batch:

- Removed the test-only `apps/integrator/src/infra/db/repos/notifTemplatePort.ts::setNotifTemplate` direct write to `public.system_settings`. Notification templates are written through webapp Settings service paths.

Open cleanup:

- Correct stale docs that still claim Google Calendar reads the mirror.

## Reminders

Classification:

- `public.reminder_rules`: canonical public business rule source.
- `public.reminder_journal`: canonical public patient/bot action history.
- `public.reminder_occurrence_history`: public read model/business history for finalized bot occurrences.
- `public.reminder_delivery_events`: public telemetry projection.
- `public.webapp_reminder_occurrences`: public technical dispatch state for Web Push-only reminders.
- `integrator.user_reminder_rules`: live bot-linked dispatch mirror/cache.
- `integrator.user_reminder_occurrences`: live integrator technical dispatch state.
- `integrator.user_reminder_delivery_logs`: live integrator technical delivery state.
- `public.outgoing_delivery_queue`: shared technical dispatch queue.

Evidence:

- Webapp pushes bot-linked rules to integrator through `integratorM2mPosts`.
- Integrator scheduler runs `reminders.planDue` and `reminders.dispatchDue`.
- Integrator reminder repo reads/writes `integrator.user_reminder_*` and now includes `organization_id`.
- Webapp projection handlers still consume `reminder.rule.upserted`, `reminder.occurrence.finalized`, and `reminder.delivery.logged`.

Decision:

- Reminder scheduling owner remains split: public owns business rules; integrator owns bot dispatch state; webapp owns Web Push-only dispatch state.
- Do not drop `integrator.user_reminder_*` in T0.4-pre.
- A future dispatch-from-public design is required before removal.

Open cleanup:

- Consolidate `public.reminder_delivery_events` and `public.notification_delivery_attempts` only after admin health/statistics are migrated.
- Run a metadata inventory before dropping any `public.user_reminder_*` homonym tables.

## Rubitime

Classification:

- `public.be_*` booking-engine tables: canonical booking business data.
- `public.patient_bookings`: live business/compat data. Rubitime columns are compatibility projection, but the table is not disposable.
- `public.appointment_records`: deprecated legacy doctor-facing projection, still active while read sources allow legacy.
- `public.booking_*` catalog tables: legacy adapter/mapping layer, still active for Rubitime IDs and branch-service compatibility.
- `integrator.rubitime_events`: technical raw provider event audit/replay state.
- `integrator.rubitime_records`: live Rubitime raw/projection runtime state.
- `integrator.booking_calendar_map`: technical integration map.
- `integrator.rubitime_api_throttle`: live one-row provider throttle state.
- `integrator.message_retry_jobs` (renamed from `rubitime_create_retry_jobs` 2026-07-24): live technical retry queue.
- `integrator.rubitime_branches/services/cooperators/booking_profiles`: deprecated v1 profile catalog, still referenced by legacy fallback/admin paths.

Evidence:

- Integrator webhook/runtime still writes `rubitime_events` and `rubitime_records`.
- Integrator write port still projects into `public.appointment_records` and `public.patient_bookings`.
- Webapp still handles `appointment.record.upserted`.
- Patient/public booking and some admin paths still use legacy Rubitime IDs and read-source settings.

Decision:

- Do not drop Rubitime tables in T0.4-pre.
- Freeze/drop gates require canonical parity and explicit read-source cutover.

Open owner decisions:

- Flip `booking_slots_read_source=canonical`.
- Flip `booking_doctor_appointments_read_source=canonical`.
- Decide whether Rubitime remains an active external mirror or becomes historical archive.
- Disable/freeze legacy v1 profile resolve.

## Channel Identity And Contacts

Classification:

- `public.platform_users`: canonical person/user.
- `public.user_channel_bindings`: canonical channel binding.
- `public.platform_user_contacts`: supplementary doctor-facing contacts, not identity/auth.
- `public.user_phone_history`: canonical phone history/audit.
- `integrator.users`: legacy/channel runtime user anchor.
- `integrator.identities`: active channel identity mapping.
- `integrator.telegram_state`: active Telegram runtime state.
- `integrator.contacts`: transitional legacy phone/contact fallback.

Evidence:

- `integrator_linked_phone_source` supports `public_then_contacts`, `public_only`, and `contacts_only`.
- Current default is `public_then_contacts`.
- `channelUsers.getLinkDataByIdentity`, `findByIdentityByPhone`, `findByPhone`, admin stats, and broadcast enrichment still consult `integrator.contacts`.
- Phone bind writes public canonical state first, then updates legacy contacts in the same transaction.

Decision:

- Do not remove `integrator.contacts` fallback in this batch.
- T0.4-pre should produce a non-PII exception audit and move toward `public_only`, not silently remove fallback code.

Open cleanup:

- Build counts for public phone missing/legacy phone present, public vs legacy mismatch, and orphan legacy contacts.
- Backfill, purge, or explicitly waive exceptions.
- Switch to `public_only` for one release window before removing fallback reads.
- Track the phone-history gap in the integrator hot path that updates public phone trust fields.

## Conversations, Questions, Message Drafts

Classification:

- `public.support_conversations` and `support_conversation_messages`: canonical support chat/product read model.
- `public.support_questions` and `support_question_messages`: projected question history; keep until the product surface is retired or replaced.
- `public.support_delivery_events`: support delivery audit/read model.
- `integrator.conversations` and `conversation_messages`: active integrator transport/projection source.
- `integrator.message_drafts`: active ephemeral bot/admin draft state.
- `integrator.user_questions` and `question_messages`: active/legacy question transport source.
- Legacy public same-name homonym tables, if present outside generated schema, are drop candidates only after DB metadata inventory and Drizzle schema cleanup.

Evidence:

- Integrator `writePort` and `messageThreads` still write/read these tables.
- Webapp integrator event ingest projects to `public.support_*`.
- Auto-close and fallback paths still use integrator transport state.

Decision:

- Do not drop integrator conversations/questions/drafts in this batch.
- Keep public support tables as canonical product state.

Open cleanup:

- Decide whether `support_questions` remains a product surface.
- Move auto-close/fallback reads to public support tables before dropping integrator transport tables.

## Queues, Logs, Idempotency, Provider Audit

Classification:

- Technical runtime state: `integrator.projection_outbox`, `public.outgoing_delivery_queue`, `public.integrator_push_outbox`, `integrator.message_retry_jobs` (renamed from `rubitime_create_retry_jobs` 2026-07-24), `public.idempotency_keys`, `integrator.idempotency_keys`, `integrator.rubitime_api_throttle`, `public.operator_job_status`, `public.integration_webhook_last_status`.
- Technical telemetry/ops audit: `public.notification_delivery_attempts`, `integrator.delivery_attempt_logs`, `public.integration_webhook_error_events`, `public.operator_incidents`, `public.operator_health_alert_sent`, `public.operator_health_failure_archive`, `integrator.integration_data_quality_incidents`.
- Business/audit canon: `public.broadcast_audit`, `public.broadcast_audit_recipients`, reminder occurrence/history/log tables, support delivery events, `public.admin_audit_log`.

Decision:

- Keep technical runtime tables.
- Add retention and terminal-row cleanup tooling instead of dropping.
- Do not collapse business/audit canon into queue cleanup.

Retention gaps:

- queue terminal rows: 30-90 days for successful terminal rows; manual archive for dead rows;
- idempotency keys: TTL purge for expired rows;
- `integrator.delivery_attempt_logs`: 14-30 days if retained only for debug;
- `notification_delivery_attempts`: 30-90 days unless needed for longer analytics;
- `operator_health_alert_sent`: 90-180 days;
- resolved operator/incidents/data-quality state: 180-365 days or archive-only;
- raw provider payloads such as `rubitime_events`: explicit retention because payloads may contain patient context.
