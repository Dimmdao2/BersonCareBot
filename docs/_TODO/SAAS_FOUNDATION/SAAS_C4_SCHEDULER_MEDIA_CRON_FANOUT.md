# C4 scheduler, media-worker and cron/internal-job fanout

Status: Phase C4 repo-side package. No live DB/S3/TEST/PROD execution and no runtime credential flip.

## Scope

This stage covers the repo-side portion of `SAAS_ENFORCE_ROADMAP.md` Phase C4:

- map scheduler and webapp internal cron entrypoints to their explicit principal/infra operation, and keep the media-worker as a narrow infra dispatcher;
- keep batch jobs from silently acquiring ambient global visibility by making infra sources named and statically checked;
- prove, with local/fake tests only, the media-worker owner model: enqueue is tenant-filtered, claim requires non-null equal job/media organizations, and dispatch runs as narrow infra `app_worker` (not a tenant principal and not a bypass);
- document the fake/local proof boundary for webapp media presign/upload/playback and the remaining live gates.

This is not the final C4 exit from the roadmap. The final exit still requires owner-authorized disposable/TEST
strict+FORCE execution of scheduler tick, media claim/complete, internal cron fixtures, and media presign allow/deny
matrix against fake/local object storage.

## Scheduler

| ID | Entrypoint | Source file | Principal source | DB surfaces | Locked-mode posture | Repo-side proof |
|---|---|---|---|---|---|---|
| `scheduler-lock` | Runtime scheduler leader lock | `apps/integrator/src/infra/runtime/scheduler/main.ts` | `infra`, source `scheduler:acquire-lock` | advisory lock via `tryAcquireSchedulerLock` | Explicit infra source before DB access. C3 integrator chokepoint allowlists this source. | Static checker verifies the source and pre-`buildDeps` wrapper. |
| `scheduler-tick` | `schedule.tick` event loop | `apps/integrator/src/infra/runtime/scheduler/main.ts` | `infra`, source `scheduler:handle-tick-event` | idempotency/event gateway, then scheduler handler chain | Explicit infra source for the synthetic tick. Org partitioning inside reminder planning/dispatch remains a strict runtime fixture gate. | Static checker verifies only `schedule.tick` is raised and the wrapper is present. |

Remaining gate: run scheduler fixtures under strict roles/FORCE and prove due work is partitioned by organization,
with missing-org/cross-org rows denied and counted.

## Media-Worker

| ID | Entrypoint | Source file | Principal source | DB surfaces | Locked-mode posture | Repo-side proof |
|---|---|---|---|---|---|---|
| `media-worker-main` | systemd process loop | `apps/media-worker/src/main.ts` | delegates to tick | `media_transcode_jobs`, `media_files`, S3 object operations | No direct DB call in `main.ts`; pool provider is principal-aware. | Static checker verifies main delegates to `runMediaWorkerTick`. |
| `media-worker-tick` | pipeline flag, stale reclaim, claim | `apps/media-worker/src/workerTick.ts` | `infra`, source `media-worker:tick` | `system_settings`, stale processing reclaim, pending job claim | Explicit infra source. Media-worker pool allowlist accepts only `media-worker:tick` as infra in locked mode. | Static checker + focused media-worker tests. |
| `media-worker-claim` | `FOR UPDATE SKIP LOCKED` claim | `apps/media-worker/src/jobs/claim.ts` | tick infra source | `media_transcode_jobs`, `media_files` | Claim requires both job/media organization IDs to be non-null and equal; violations are terminally quarantined with `organization_invariant_violation`. | Existing claim tests + C4 checker verify equality and quarantine. |
| `media-worker-process` | transcode metadata updates and terminal state | `apps/media-worker/src/processTranscodeJob.ts` | narrow infra/`app_worker`, nested under tick | `media_files`, `media_transcode_jobs`, fake/local S3 in tests | Tenant-filtered enqueue plus the claim invariant establish ownership. Processing is a tenant-agnostic dispatcher, not a tenant principal, and has no tenant bypass; job organization remains audit metadata. | Focused principal tests verify infra/tick context. |
| `media-worker-sql` | media-worker SQL chokepoint | `apps/media-worker/src/runMediaWorkerSql.ts`, `withClient.ts`, `poolProvider.ts` | current ALS principal | all media-worker SQL | Locked mode accepts only allowlisted `infra` source `media-worker:tick` and rejects organization, missing, bootstrap, patient, staff, integrator, and unknown infra sources before checkout; cleanup uses principal release/reset. | Static checker verifies pre-checkout guard and allowlist. |

Remaining gate: strict+FORCE fixture must claim and complete a real fake-S3 media job once, then prove a missing-org
job fails closed and surfaces in metrics.

## Webapp Internal Cron / Internal HTTP Jobs

All webapp internal HTTP jobs are Bearer-gated by `INTERNAL_JOB_SECRET` and now enter a named infra principal after
auth succeeds. Under the current C1 webapp request pool, infra principals are still fail-closed in locked mode until
C4/F phases add a separate operational pool/grants contract. That is deliberate: this repo stage makes the source
explicit and prevents false green; it does not grant cross-tenant DB visibility.

| ID | Internal path | Source file | Principal source | DB/S3 surface | Locked-mode posture |
|---|---|---|---|---|---|
| `webpush_reminders` | `/api/internal/reminders/web-push-only/tick` | `apps/webapp/src/app/api/internal/reminders/web-push-only/tick/route.ts` | `api/internal/reminders/web-push-only/tick:POST` | due reminder planning/dispatch, operator status | Explicit infra; future gate must prove per-org planning/dispatch. |
| `media_purge` | `/api/internal/media-pending-delete/purge` | `apps/webapp/src/app/api/internal/media-pending-delete/purge/route.ts` | `api/internal/media-pending-delete/purge:POST` | pending-delete media rows, S3 delete | Explicit infra; future fake-S3 purge fixture required. |
| `media_multipart` | `/api/internal/media-multipart/cleanup` | `apps/webapp/src/app/api/internal/media-multipart/cleanup/route.ts` | `api/internal/media-multipart/cleanup:POST` | expired multipart sessions, pending media rows, S3 abort | Explicit infra; future fake-S3 multipart fixture required. |
| `media_preview` | `/api/internal/media-preview/process` | `apps/webapp/src/app/api/internal/media-preview/process/route.ts` | `api/internal/media-preview/process:POST` | pending preview rows, S3 preview objects | Explicit infra; separate process `media-preview:tick` remains preferred in ops docs and needs the same operational-pool decision. |
| `media_transcode_enqueue` | `/api/internal/media-transcode/enqueue` | `apps/webapp/src/app/api/internal/media-transcode/enqueue/route.ts` | `api/internal/media-transcode/enqueue:POST` | single media enqueue | Explicit infra; enqueue copies media org in repository layer. |
| `media_transcode_reconcile` | `/api/internal/media-transcode/reconcile` | `apps/webapp/src/app/api/internal/media-transcode/reconcile/route.ts` | `api/internal/media-transcode/reconcile:POST` | legacy video scan/enqueue | Explicit infra; future gate must prove it partitions or only enqueues org-stamped jobs. |
| `outbound_integration_probes` | `/internal/operator-health-probe` | `apps/integrator/src/integrations/bersoncare/operatorHealthProbeRoute.ts` | signed integrator internal probe from C3 | synthetic operator probe delivery/status | C3-inventoried integrator route; C4 final gate must prove send-safe/no-real-delivery behavior. |
| `system_health_guard` | `/api/internal/system-health-guard/tick` | `apps/webapp/src/app/api/internal/system-health-guard/tick/route.ts` | `api/internal/system-health-guard/tick:POST` | integrator push outbox health, optional alert intent | Explicit infra; final send-safe proof remains future. |
| `operator_health_critical` | `/api/internal/operator-health-critical/tick` | `apps/webapp/src/app/api/internal/operator-health-critical/tick/route.ts` | `api/internal/operator-health-critical/tick:POST` | critical operator health alerting | Explicit infra; final send-safe proof remains future. |
| `operator_health_digest` | `/api/internal/operator-health-digest/tick` | `apps/webapp/src/app/api/internal/operator-health-digest/tick/route.ts` | `api/internal/operator-health-digest/tick:POST` | operator digest alerting | Explicit infra; final send-safe proof remains future. |
| `playback_retention` | `/api/internal/media-playback-stats/retention` | `apps/webapp/src/app/api/internal/media-playback-stats/retention/route.ts` | `api/internal/media-playback-stats/retention:POST` | playback hourly retention | Explicit infra; retention is separately reviewed infra operation. |
| `hls_proxy_retention` | `/api/internal/media-hls-proxy-errors/retention` | `apps/webapp/src/app/api/internal/media-hls-proxy-errors/retention/route.ts` | `api/internal/media-hls-proxy-errors/retention:POST` | HLS proxy error retention | Explicit infra; retention is separately reviewed infra operation. |
| `product_analytics_retention` | `/api/internal/product-analytics/retention` | `apps/webapp/src/app/api/internal/product-analytics/retention/route.ts` | `api/internal/product-analytics/retention:POST` | product analytics retention | Explicit infra; telemetry retention is separately reviewed infra operation. |
| `specialist_task_reminders_tick` | `/api/internal/specialist-task-reminders/tick` | `apps/webapp/src/app/api/internal/specialist-task-reminders/tick/route.ts` | `api/internal/specialist-task-reminders/tick:POST` | specialist task reminder queue | Explicit infra; future gate must prove org partitioning. |

The checker recursively scans `apps/webapp/src/app/api/internal/**/route.ts`; adding a new internal route without
inventory/checker coverage fails `pnpm run check:saas-c4-scheduler-media-cron-fanout`.

## Webapp Media Presign / Upload / Playback Matrix

| Surface | Source files | Principal / authorization source | Object-key posture | Repo-side proof status | Remaining gate |
|---|---|---|---|---|---|
| Single PUT presign | `apps/webapp/src/app/api/media/presign/route.ts` | doctor session via `getCurrentSession` + `canAccessDoctor`; folder checked by `pgValidateUserAssignableMediaFolder` | server generates `s3ObjectKey(mediaId, filename)` after DB pending row insert | Static checker verifies server-generated key, folder gate, pending-row insert, and presign call. | Fake/local object storage route test must prove same-org allow and cross-org folder/key deny under locked context. |
| Multipart init / part URL | `apps/webapp/src/app/api/media/multipart/init/route.ts`, `part-url/route.ts` | doctor session; session ownership gates part presign by `gateUploadSessionForPartUrl(sessionId, session.user.userId)` | server stores `s3Key` in upload session; part URLs use stored key only | Static checker verifies server-generated key, upload-session owner gate, and stored-key part presign. | Fake/local matrix must prove another org/user cannot get part URL for a foreign session/key. |
| Playback descriptor | `apps/webapp/src/app/api/media/[id]/playback/route.ts` | session + `assertMediaPlaybackAccess`; DB row via `getMediaAccessRow` | playback payload resolver signs known row artifacts only | Static checker verifies row lookup, access assertion, and resolver call. | Locked fake/local playback test must prove allowed patient/doctor access and cross-org denial. |
| HLS/preview/object delivery | `apps/webapp/src/app/api/media/[id]/hls/[[...path]]/route.ts`, `preview/[size]/route.ts`, `[id]/route.ts` | same media row/session family | path is derived from DB media row/artifact fields, not client-supplied raw S3 key | Documented as part of C4 matrix; full static proof is deferred to route-level fake/local tests. | Fake/local object storage must prove cross-org object keys cannot be presigned or proxied. |

## Implemented Artifacts

- [`../../../apps/integrator/src/infra/runtime/scheduler/main.ts`](../../../apps/integrator/src/infra/runtime/scheduler/main.ts)
- [`../../../apps/media-worker/src/withClient.ts`](../../../apps/media-worker/src/withClient.ts)
- [`../../../apps/media-worker/src/poolProvider.ts`](../../../apps/media-worker/src/poolProvider.ts)
- [`../../../apps/media-worker/src/processTranscodeJob.ts`](../../../apps/media-worker/src/processTranscodeJob.ts)
- [`../../../apps/media-worker/src/processTranscodeJob.principal.test.ts`](../../../apps/media-worker/src/processTranscodeJob.principal.test.ts)
- webapp internal route files under [`../../../apps/webapp/src/app/api/internal`](../../../apps/webapp/src/app/api/internal)
- [`scripts/check-c4-scheduler-media-cron-fanout.mjs`](scripts/check-c4-scheduler-media-cron-fanout.mjs)

## Remaining C4 Gates

Not closed by this repo-only stage:

- separate operational DB login/pool/grants contract for unavoidable infra jobs;
- strict+FORCE disposable/TEST scheduler tick fixture with org partitioning;
- strict+FORCE media claim/complete fixture against fake/local object storage;
- webapp media presign/upload/playback allow/deny matrix against fake/local object storage;
- internal cron fixture execution under locked mode with missing-org/cross-org denial and metrics visibility;
- no-real-delivery proof for health/reminder jobs that may enqueue notifications.
