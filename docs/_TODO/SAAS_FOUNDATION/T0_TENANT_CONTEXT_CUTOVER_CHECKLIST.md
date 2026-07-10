# T0 tenant-context cutover checklist

Status: compatibility checklist created during T0.4-pre taskdb `#635`. Current branch already completed Phase 0 artifacts and T0.3 doctor/admin principal closure per `LOG.md`.

## T0.4-pre gate

- [x] Inventory domains classified in `T0_4_PRE_SCHEMA_CLEANUP_INVENTORY.md`.
- [x] Table matrix created in `scope-derivation/t0-4-pre-table-matrix.tsv`.
- [x] ADR decisions recorded in `T0_4_PRE_SCHEMA_CLEANUP_ADR.md`.
- [x] Destructive drops blocked where live runtime references exist.
- [ ] Dry-run scripts validated.
- [ ] Audit review completed.
- [ ] Commit and push completed.

## T0.4 planned scope

Do not start until T0.4-pre validation/audit is complete.

- [ ] Integrator DB trunk: every SCOPED integrator writer derives or receives organization context.
- [ ] Integrator entrypoint-to-org map: Telegram/MAX/Rubitime/M2M/worker/scheduler sources documented and tested.
- [ ] Integrator worker/scheduler: jobs that touch SCOPED rows run with the correct organization principal.
- [ ] Media-worker claim/reclaim: claim remains safe and post-claim writes run with job/media organization context.
- [ ] Media-worker processing/failure/duration writes: `media_files` and `media_transcode_jobs` writes run with organization principal.
- [ ] Focused tests and source audit cover runtime paths.

## T0.5-T0.8 readiness markers

This task does not execute these stages, but T0.4-pre findings constrain them:

- [ ] System settings mirror removal is not assumed; runtime reads already use public canonical settings.
- [ ] Reminder bot dispatch is not assumed public-only; integrator dispatch state remains live.
- [ ] Rubitime legacy paths are not assumed removed; canonical booking cutover is a separate gate.
- [ ] `integrator.contacts` fallback is not assumed removed; `public_only` cutover needs a clean exception audit.
- [ ] Queue/retention cleanup is not treated as business-data migration.
