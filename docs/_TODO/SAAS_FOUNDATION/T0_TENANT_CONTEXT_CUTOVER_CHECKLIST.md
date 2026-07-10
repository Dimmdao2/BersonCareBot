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
- [x] Media-worker context slice: webapp enqueue stamps `media_transcode_jobs.organization_id` from `media_files.organization_id`; worker claim keeps a legacy `COALESCE(job.organization_id, media_files.organization_id)` backfill; post-claim media/job updates run through `runWithOptionalMediaWorkerOrganizationPrincipal(job.organizationId)` and the media-worker SQL chokepoint applies `app.org` inside transactions.

- [ ] Integrator DB trunk: every SCOPED integrator writer derives or receives organization context.
- [ ] Integrator entrypoint-to-org map: Telegram/MAX/Rubitime/M2M/worker/scheduler sources documented and tested.
- [ ] Integrator worker/scheduler: jobs that touch SCOPED rows run with the correct organization principal.
- [x] Media-worker claim/reclaim: claim remains safe and post-claim writes run with job/media organization context.
- [x] Media-worker processing/failure/duration writes: `media_files` and `media_transcode_jobs` writes run with organization principal.
- [ ] Focused tests and source audit cover runtime paths.

## T0.5-T0.8 readiness markers

This task does not execute these stages, but T0.4-pre findings constrain them:

- [ ] System settings mirror removal is not assumed; runtime reads already use public canonical settings.
- [ ] Reminder bot dispatch is not assumed public-only; integrator dispatch state remains live.
- [ ] Rubitime legacy paths are not assumed removed; canonical booking cutover is a separate gate.
- [ ] `integrator.contacts` fallback is not assumed removed; `public_only` cutover needs a clean exception audit.
- [ ] Queue/retention cleanup is not treated as business-data migration.
