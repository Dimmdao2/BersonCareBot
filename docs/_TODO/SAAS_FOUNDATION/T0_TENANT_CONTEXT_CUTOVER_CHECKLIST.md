> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

# T0 tenant-context cutover checklist

Status: compatibility checklist created during T0.4-pre taskdb `#635`. Current branch already completed Phase 0 artifacts and T0.3 doctor/admin principal closure per `LOG.md`.

## T0.4-pre gate

- [x] Inventory domains classified in `T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md`.
- [x] Table matrix created in `scope-derivation/t0-4-pre-table-matrix.tsv`.
- [x] ADR decisions recorded in `T0_4_PRE_SCHEMA_CLEANUP_ADR.md`.
- [x] Destructive drops blocked where live runtime references exist.
- [x] Dry-run scripts validated.
- [x] Audit review completed.
- [x] Commit and push completed: `f262b84c6fa1ddcebfd5e246ee5fc94a4b76019f`.

## T0.4 planned scope

Do not start until T0.4-pre validation/audit is complete.

Progress:

- [x] Support transport slice: `integrator.message_drafts`, `integrator.conversations`, `integrator.conversation_messages`, `integrator.user_questions`, and `integrator.question_messages` write paths derive/copy `organization_id`; legacy conversation merge re-stamps moved children to the target thread org.
- [x] Reminder dispatch slice: `integrator.user_reminder_rules` and `integrator.content_access_grants` write paths stamp `organization_id` from the current organization principal or the target integrator user's single active organization; `integrator.user_reminder_occurrences` and `integrator.user_reminder_delivery_logs` continue copying org from parent rule/occurrence rows.
- [x] Contacts fallback slice: `integrator.contacts` phone-link writes stamp `organization_id` from the current organization principal or the canonical integrator user's single active organization; conflict updates preserve existing org when no new org is derivable.
- [x] Mailing/subscription slice: `integrator.user_subscriptions` and `integrator.mailing_logs` writes stamp `organization_id` from the current organization principal or the canonical integrator user's single active organization; conflict updates preserve existing org when no new org is derivable. `mailing_topics` remains a global catalog projection in this slice.
- [x] Media-worker context slice: tenant-filtered webapp enqueue stamps `media_transcode_jobs.organization_id` from `media_files.organization_id`; claim requires non-null equal job/media organizations and quarantines violations; processing runs as the narrow tenant-agnostic infra dispatcher.
- [x] Rubitime/appointment writer audit: legacy `integrator.rubitime_records`, `integrator.rubitime_events`, and `public.appointment_records` remain live unscoped compatibility projections; canonical `be_*` projection writes already require explicit `organizationId`; multi-org Rubitime ingress remains an entrypoint-map/cutover decision, not an implicit T0.4 legacy-table stamp.
- [x] Entrypoint/worker/scheduler map: `T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md` documents Telegram, MAX, BersonCare M2M, Rubitime, scheduler, outgoing-delivery worker, projection worker, and generic retry-job organization context. The source audit confirms `integrator.mailings` has no current live runtime insert/update writer under `apps/integrator/src`; current mailing runtime writes are `integrator.mailing_logs` and already stamped.

- [x] Integrator DB trunk: every SCOPED integrator writer derives or receives organization context.
- [x] Integrator entrypoint-to-org map: Telegram/MAX/Rubitime/M2M/worker/scheduler sources documented and tested.
- [x] Integrator worker/scheduler: jobs that touch SCOPED rows run with the correct organization principal.
- [x] Media-worker claim/reclaim: enqueue stamping and claim equality/quarantine keep audit metadata safe.
- [x] Media-worker processing/failure/duration writes: the narrow `app_worker` is the explicit exception to tenant-principal worker processing.
- [x] Focused tests and source audit cover runtime paths.

## T0.5-T0.8 readiness markers

These markers are affirmed by `T0_5_T0_8_READINESS_REVIEW.md`. This does not execute T0.5-T0.8 runtime changes, migrations, RLS role flips, or table drops.

- [x] System settings mirror removal is not assumed; runtime reads already use public canonical settings.
- [x] Reminder bot dispatch is not assumed public-only; integrator dispatch state remains live.
- [x] Rubitime legacy paths are not assumed removed; canonical booking cutover is a separate gate.
- [x] `integrator.contacts` fallback is not assumed removed; `public_only` cutover needs a clean exception audit.
- [x] Queue/retention cleanup is not treated as business-data migration.

## R2 readiness closure

Closure artifact: `R2_READINESS_CLOSURE.md`.

- [x] R2 deliverables mapped to current T0/P0 artifacts.
- [x] R2 exit-gate evidence mapped to `check:saas-db-regression` and full CI.
- [x] Enforcement execution remains explicitly out of scope: no runtime role/env/grant flip, no production/test deploy, no DB writes, no external-channel calls.
- [x] Final R2 readiness validation passed and is recorded in `LOG.md`.
