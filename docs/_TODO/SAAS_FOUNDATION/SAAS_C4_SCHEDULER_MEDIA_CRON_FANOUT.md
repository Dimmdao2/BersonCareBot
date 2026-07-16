# C4 scheduler, media-worker and cron/internal-job fanout

Status: Phase C4 repo-side operational-login package implemented and locally verified, including disposable PostgreSQL
16 UP/reapply/DOWN, ACL-scrub, readiness, scheduler-conflict, and operator-audit proofs. No TEST/PROD/S3 execution and no
runtime credential flip.

## Scope

This stage covers the repo-side portion of `SAAS_ENFORCE_ROADMAP.md` Phase C4:

- map scheduler and webapp internal cron entrypoints to their explicit principal/infra operation, and keep the media-worker as a narrow infra dispatcher;
- keep batch jobs from silently acquiring ambient global visibility by making infra sources named and statically checked;
- prove, with local/fake tests only, the media-worker owner model: enqueue is tenant-filtered, claim requires non-null equal job/media organizations, and dispatch runs through its dedicated operational capability (not a tenant principal and not a bypass);
- document the fake/local proof boundary for webapp media presign/upload/playback and the remaining live gates.

This is not the final C4 exit from the roadmap. The final exit still requires owner-authorized disposable/TEST
strict+FORCE execution of scheduler tick, media claim/complete, internal cron fixtures, and media presign allow/deny
matrix against fake/local object storage.

## Scheduler

| ID | Entrypoint | Source file | Principal source | DB surfaces | Locked-mode posture | Repo-side proof |
|---|---|---|---|---|---|---|
| `scheduler-lock` | Runtime scheduler leader lock | `apps/integrator/src/infra/runtime/scheduler/main.ts` | `infra`, source `scheduler:acquire-lock` | advisory lock via `tryAcquireSchedulerLock` | Pre-checkout routing selects `DATABASE_URL_SCHEDULER`; locked checkout executes `SET ROLE app_operational_scheduler`. | Static checker and focused lifecycle tests. |
| `scheduler-tick` | `schedule.tick` event loop | `apps/integrator/src/infra/runtime/scheduler/main.ts` | `infra`, source `scheduler:handle-tick-event` | `integrator.idempotency_keys` (`SELECT/INSERT/UPDATE/DELETE`), then tenant-scoped handler chain | Same scheduler capability; nested organization principal routes back to the request pool and ALS restores the outer capability after the nested call. | Static checker and focused routing/restoration tests. |

Remaining gate: run scheduler fixtures under strict roles/FORCE and prove due work is partitioned by organization,
with missing-org/cross-org rows denied and counted.

## Media-Worker

| ID | Entrypoint | Source file | Principal source | DB surfaces | Locked-mode posture | Repo-side proof |
|---|---|---|---|---|---|---|
| `media-worker-main` | systemd process loop | `apps/media-worker/src/main.ts` | delegates to tick | `media_transcode_jobs`, `media_files`, S3 object operations | No direct DB call in `main.ts`; pool provider is principal-aware. | Static checker verifies main delegates to `runMediaWorkerTick`. |
| `media-worker-tick` | pipeline flag, stale reclaim, claim | `apps/media-worker/src/workerTick.ts` | `infra`, source `media-worker:tick` | restricted runtime-setting accessor, stale processing reclaim, pending job claim | Dedicated `media-worker.prod/test` credential; locked checkout executes `SET ROLE app_operational_media_worker`. Direct `app_runtime_settings` access is denied. | Static checker + focused media-worker tests. |
| `media-worker-claim` | `FOR UPDATE SKIP LOCKED` claim | `apps/media-worker/src/jobs/claim.ts` | tick infra source | `media_transcode_jobs`, `media_files` | Claim requires both job/media organization IDs to be non-null and equal; violations are terminally quarantined with `organization_invariant_violation`. | Existing claim tests + C4 checker verify equality and quarantine. |
| `media-worker-process` | transcode metadata updates and terminal state | `apps/media-worker/src/processTranscodeJob.ts` | `app_operational_media_worker`, nested under tick | `media_files`, `media_transcode_jobs`, fake/local S3 in tests | Exact `SELECT/UPDATE` grants only. The capability cannot become staff, patient, legacy worker, or another operational capability. | Focused principal tests verify infra/tick context. |
| `media-worker-sql` | media-worker SQL chokepoint | `apps/media-worker/src/runMediaWorkerSql.ts`, `withClient.ts`, `poolProvider.ts` | current ALS principal | all media-worker SQL | Locked mode accepts only allowlisted `infra` source `media-worker:tick` and rejects organization, missing, bootstrap, patient, staff, integrator, and unknown infra sources before checkout; cleanup uses principal release/reset. | Static checker verifies pre-checkout guard and allowlist. |

Remaining gate: strict+FORCE fixture must claim and complete a real fake-S3 media job once, then prove a missing-org
job fails closed and surfaces in metrics.

## Operational Login / Capability Contract

| Process contour | Env URL | SET-only capability | Exact DB surface |
|---|---|---|---|
| API diagnostic | `DATABASE_URL_DIAGNOSTIC` | `app_operational_diagnostic` | `integrator.projection_outbox`: `SELECT` |
| Delivery worker | `DATABASE_URL_DELIVERY_WORKER` | `app_operational_delivery_worker` | `integrator.projection_outbox`, `integrator.rubitime_create_retry_jobs`, `public.outgoing_delivery_queue`: `SELECT/UPDATE`; narrow operator-alert attempt audit function |
| Scheduler | `DATABASE_URL_SCHEDULER` | `app_operational_scheduler` | `integrator.idempotency_keys`: `SELECT/INSERT/UPDATE/DELETE`; PostgreSQL advisory lock |
| Media worker | `DATABASE_URL` in `media-worker.prod/test` | `app_operational_media_worker` | `public.media_transcode_jobs`, `public.media_files`: `SELECT/UPDATE`; two-key SECURITY DEFINER runtime accessor |

All four base logins are `LOGIN NOINHERIT NOBYPASSRLS`; each has exactly one `WITH INHERIT FALSE, SET TRUE`
membership. Base logins have no target-table privileges. Capability roles are terminal leaves and cannot become
staff, patient, legacy `app_worker`, or sibling capabilities. The repeatable operator overlay is
`deploy/postgres/c4-operational-runtime.sql`; TEST deploy discovers login names from the four URLs, applies the
overlay after strict-policy installation, and runs positive plus cross-contour readiness probes before restart.
The overlay first scrubs current-database, direct, column, and default ACLs for all four base logins and all four capabilities across
non-system schemas, then rebuilds and catalog-asserts the exact allowlist. Managed roles are rejected if they own the
current database or another managed object. Reapply removes injected stale database/table/sequence/function/column/default ACLs; DOWN scrubs the same catalog before
dropping capabilities.

Scheduler uses a narrow SECURITY DEFINER discovery function that returns only organization IDs and rejects enabled/due
reminder rows without ownership. Advisory lock, discovery, and idempotency stay in the scheduler contour; the reminder
pipeline runs once per returned organization through the request pool and organization principal.

Delivery claim/reset/final queue bookkeeping stays in the delivery contour. A narrow resolver determines the trusted
organization from reminder occurrence/rule or broadcast audit before any external send. Missing, conflicting, malformed,
or mismatched ownership is quarantined without delivery. Tenant business reads/writes then run under that organization
principal; temporary returns to the delivery capability are limited to queue bookkeeping. Global operator alerts use
two dedicated incident accessors and never receive raw incident-table ACL.
Their dispatch attempt audit uses a separate narrow function that accepts only an exact queued `operator_alert`
event/channel pair and stores fixed redacted metadata; the delivery capability has no direct INSERT on the audit table.
Provider-success and development-suppression tests exercise the real dispatch chain without real delivery.

First production rollout is a separate root/DB-admin operation:
`deploy/host/provision-c4-operational-runtime.sh`. Before mutation it runs the shared all-URL C2 preflight across the
root-owned webapp/API/media env files. It then creates or normalizes the four distinct LOGIN roles, sets their existing passwords without printing them, applies the overlay as PostgreSQL admin, and
runs readiness. Ordinary deploy remains readiness-only and receives no role-creation sudo authority.

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
- [`../../../apps/integrator/src/infra/db/integratorPoolProvider.ts`](../../../apps/integrator/src/infra/db/integratorPoolProvider.ts)
- [`../../../apps/integrator/src/infra/db/operationalPoolReadiness.ts`](../../../apps/integrator/src/infra/db/operationalPoolReadiness.ts)
- [`../../../apps/media-worker/src/withClient.ts`](../../../apps/media-worker/src/withClient.ts)
- [`../../../apps/media-worker/src/poolProvider.ts`](../../../apps/media-worker/src/poolProvider.ts)
- [`../../../apps/media-worker/src/serverRuntimeConfig.ts`](../../../apps/media-worker/src/serverRuntimeConfig.ts)
- [`../../../apps/media-worker/src/processTranscodeJob.ts`](../../../apps/media-worker/src/processTranscodeJob.ts)
- [`../../../apps/media-worker/src/processTranscodeJob.principal.test.ts`](../../../apps/media-worker/src/processTranscodeJob.principal.test.ts)
- webapp internal route files under [`../../../apps/webapp/src/app/api/internal`](../../../apps/webapp/src/app/api/internal)
- [`scripts/check-c4-scheduler-media-cron-fanout.mjs`](scripts/check-c4-scheduler-media-cron-fanout.mjs)
- [`../../../deploy/postgres/c4-operational-runtime.sql`](../../../deploy/postgres/c4-operational-runtime.sql)
- [`../../../deploy/host/provision-c4-operational-runtime.sh`](../../../deploy/host/provision-c4-operational-runtime.sh)
- [`../../../deploy/host/assert-c4-operational-runtime-ready.sh`](../../../deploy/host/assert-c4-operational-runtime-ready.sh)

## Remaining C4 Gates

Not closed by this repo-only stage:

- strict+FORCE disposable/TEST scheduler tick fixture with org partitioning;
- strict+FORCE media claim/complete fixture against fake/local object storage;
- webapp media presign/upload/playback allow/deny matrix against fake/local object storage;
- internal cron fixture execution under locked mode with missing-org/cross-org denial and metrics visibility;
- no-real-delivery proof for health/reminder jobs that may enqueue notifications.
