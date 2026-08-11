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

| ID               | Entrypoint                    | Source file                                           | Principal source                              | DB surfaces                                                                                     | Locked-mode posture                                                                                                                                   | Repo-side proof                                       |
| ---------------- | ----------------------------- | ----------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `scheduler-lock` | Runtime scheduler leader lock | `apps/integrator/src/infra/runtime/scheduler/main.ts` | `infra`, source `scheduler:acquire-lock`      | advisory lock via `tryAcquireSchedulerLock`                                                     | Pre-checkout routing selects `DATABASE_URL_SCHEDULER`; locked checkout executes `SET ROLE app_operational_scheduler`.                                 | Static checker and focused lifecycle tests.           |
| `scheduler-tick` | `schedule.tick` event loop    | `apps/integrator/src/infra/runtime/scheduler/main.ts` | `infra`, source `scheduler:handle-tick-event` | `integrator.idempotency_keys` (`SELECT/INSERT/UPDATE/DELETE`), then tenant-scoped handler chain | Same scheduler capability; nested organization principal routes back to the request pool and ALS restores the outer capability after the nested call. | Static checker and focused routing/restoration tests. |

Remaining gate: run scheduler fixtures under strict roles/FORCE and prove due work is partitioned by organization,
with missing-org/cross-org rows denied and counted.

## Media-Worker

| ID                     | Entrypoint                                    | Source file                                                                                      | Principal source                                  | DB / external surfaces                                          | Locked-mode posture                                                                                                                                                   | Repo-side proof                                             |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `media-worker-main`    | systemd process loop                          | `apps/media-worker/src/main.ts`                                                                  | control-only process                              | authenticated HTTP control, S3 and FFmpeg                       | Worker env has no DB URL/login/principal material; startup first proves the authenticated control route is ready.                                                     | Env/startup tests plus DB-door chokepoint.                  |
| `media-worker-tick`    | pipeline flag, stale reclaim, claim           | `apps/media-worker/src/workerTick.ts`, `control.ts`                                               | bearer-authenticated webapp command               | control commands for setting, reclaim and claim                 | Every queue/config operation crosses the bounded HTTP client; no PostgreSQL dependency is importable by the media-worker package.                                    | Focused client/tick tests and chokepoint self-test.         |
| `media-worker-control` | authenticated command route and DB seam       | `apps/webapp/src/app/api/internal/media-worker/control/route.ts`, `app-layer/media/mediaWorkerControl.ts` | webapp infra principal, exact media capability    | `media_transcode_jobs`, `media_files`, runtime settings         | Webapp verifies the shared internal secret, installs `app_operational_media_worker` inside its DB chokepoint, and exposes only the typed command union.                | Route tests plus disposable PostgreSQL seam proof.         |
| `media-worker-process` | transcode and terminal state                  | `apps/media-worker/src/processTranscodeJob.ts`                                                   | control client; no local DB principal              | S3/FFmpeg; state transitions through authenticated HTTP control | Heavy processing stays outside Next.js; load/processing/retry/fail/complete state changes return through the same webapp seam.                                        | Focused media-worker processing/control tests.             |

Remaining gate: strict+FORCE fixture must claim and complete a real fake-S3 media job once, then prove a missing-org
job fails closed and surfaces in metrics.

## Operational Login / Capability Contract

| Process contour        | Env URL                                                | SET-only capability                 | Exact DB surface                                                                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API diagnostic         | `DATABASE_URL_DIAGNOSTIC`                              | `app_operational_diagnostic`        | `integrator.projection_outbox`: `SELECT`                                                                                                                                                                                |
| Delivery worker        | `DATABASE_URL_DELIVERY_WORKER`                         | `app_operational_delivery_worker`   | `integrator.projection_outbox`, `integrator.message_retry_jobs` (renamed from `rubitime_create_retry_jobs` 2026-07-24), `public.outgoing_delivery_queue`: `SELECT/UPDATE`; narrow operator-alert attempt audit function |
| Scheduler              | `DATABASE_URL_SCHEDULER`                               | `app_operational_scheduler`         | `integrator.idempotency_keys`: `SELECT/INSERT/UPDATE/DELETE`; PostgreSQL advisory lock                                                                                                                                  |
| Media worker           | no DB URL; `MEDIA_WORKER_CONTROL_URL` + `INTERNAL_JOB_SECRET` | selected by the webapp control seam | `public.media_transcode_jobs`, `public.media_files`: narrow operations behind the authenticated typed control route                                                                                                    |
| Web Push reminder tick | `DATABASE_URL_WEB_PUSH_REMINDER` in `webapp.prod/test` | `app_operational_web_push_reminder` | organization-ID discovery definer, organization-scoped reminder occurrence/delivery/analytics writes, exact `operator_job_status` key                                                                                   |

The database base logins in this table are `LOGIN NOINHERIT NOBYPASSRLS`, have no target-table privileges and retain
only their declared SET-only memberships. The media worker is deliberately not a database base login: the existing
webapp login selects `app_operational_media_worker` only inside the authenticated control-route transaction. The
repeatable overlays remain `deploy/postgres/c4-operational-runtime.sql` and
`deploy/postgres/c4-web-push-reminder-runtime.sql`; TEST deploy proves the three integrator operational DB URLs,
the webapp-owned contour and the separate media HTTP control before restart.
The Web Push capability alone receives `EXECUTE` on the complete locked-policy dependency bundle:
`app.is_staff()`, `app.current_org_id()`, `app.current_patient_user_id()`, and
`app.current_integrator_user_id()`. Existing strict policies may evaluate those helpers in addition to the dedicated
C4 policy. Reapply removes PUBLIC, base-login, discovery-definer and grant-option drift for this bundle and asserts
the helpers remain `app_owner`-owned; it does not widen staff/patient/table access. DOWN independently revokes the
same helper ACL drift before dropping C4 roles and does not rely on a preceding successful UP/reapply.
`operator_job_status` deliberately retains the P0.9 permissive PUBLIC policy for existing app-staff/owner operational
writers. Because permissive PostgreSQL policies compose with OR, the Web Push capability has a second
`AS RESTRICTIVE` exact-key policy in addition to its exact-key permissive allow policy. Their intersection limits this
capability to `reminders.web_push_only.tick` without changing other operator keys. Reapply removes any stale policy
targeted directly at the Web Push capability and asserts the exact three-policy inventory plus SELECT/INSERT/UPDATE
without DELETE. It also removes and inventories table and column ACL drift for PUBLIC, the base LOGIN, the capability,
and the discovery definer; a stale column-only grant therefore cannot bypass the key restriction. DOWN removes only
the two C4 policies, preserves the canonical P0.9 policy, and is repeat-safe after its overlay-owned roles are absent.
The generic 163-target phase4 artifact excludes this explicit-global INFRA table. Therefore this localized overlay
materializes the canonical generated P0.9 `ENABLE` + `FORCE` + stable PUBLIC-true policy before adding the two C4
policies, and reports each RLS/ACL/policy sub-invariant by name if the exact inventory does not converge.
The overlays scrub current-database, direct, column, type, and default ACLs for all managed base logins and capabilities across
non-system schemas, then rebuilds and catalog-asserts the exact allowlist. Managed roles are rejected if they own the
current database, an independent enum/domain/composite/range/base type, or another object recorded by PostgreSQL owner
dependencies. Only true autogenerated array types are excluded through the structural `typelem`/`typarray` relation;
user domains over arrays remain managed even though PostgreSQL classifies them in category `A`. Reapply removes injected
stale database/table/sequence/function/column/type/default ACLs; DOWN scrubs the same catalog before
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
The event key contains a stable HMAC-SHA-256 recipient digest keyed by the protected C2 signing secret, never the raw
Telegram/MAX identifier. The SQL privilege boundary accepts only `success/NULL`,
`success/dev_redirect_suppressed`, or `failed/provider_rejected`; arbitrary reason text is rejected. Provider success,
provider rejection, audit-write failure, and development suppression exercise the real dispatch chain: rejection writes
only `failed/provider_rejected`, then rethrows the original provider error, while audit failure cannot mask it.

First production rollout is a separate root/DB-admin operation:
`deploy/host/provision-c4-operational-runtime.sh`. Before mutation it runs the shared all-URL C2 preflight across the
root-owned webapp/API/media env files. It then creates or normalizes the five distinct LOGIN roles, sets their existing passwords without printing them, applies both overlays as PostgreSQL admin, and
runs readiness. Ordinary deploy remains readiness-only and receives no role-creation sudo authority.
PROD env credentials are prepared once by the operator before that initial provision. A later explicit root invocation
of the provision command is the only C4 password reassertion/rotation path; ordinary code deploy/migrate never invokes
bootstrap, provision, or the password setter, never rewrites PROD env, and only checks the already-provisioned contract.
Password rotation is fully noninteractive through `deploy/host/set-postgres-role-password.mjs`: the decoded URL
password is stdin-only and reaches a fixed temporary server-side function only as an extended-protocol bind parameter;
the function quotes the identifier and value with `format(%I, %L)`. Before that bind, the privileged session disables
statement, duration, parameter, error-context and optional pgAudit logging. The secret never enters argv, SQL text, stdout/stderr,
xtrace, committed files, or persistent temporary files. `smoke-set-postgres-role-password.sh` proves non-TTY and PTY
execution, multiple roles, idempotent rotation, old-password rejection, adversarial quoting, no captured/process/log
leak under forced server logging (including a deliberate post-bind server error), timeout/no prompt, and cleanup.
Fresh TEST may invoke the same root script with `--bootstrap-test-env` and the three canonical `.test` env paths.
That explicit mode creates missing, distinct operational credentials and `media-worker.test` before the shared
collision preflight, replaces each protected env file atomically as `root:deploy 0640` (not one transaction across
all files), never prints their values, and is
idempotent. It is path-locked to TEST and cannot bootstrap PROD.
The project root is also locked to the canonical `/opt/projects/bersoncarebot-test` checkout, preventing a TEST
bootstrap from running a stale or PROD artifact.
The canonical fresh/code-only TEST strict closure now owns this bootstrap/provision step. It runs after migrations,
protected principal helpers, and the base/FORCE finalizer, then reapplies both overlays again after the locked DB
matrix. The shared readiness script must authenticate through five distinct URLs, and the webapp systemd unit must
expose the exact `/opt/env/bersoncarebot/webapp.test` file containing `DATABASE_URL_WEB_PUSH_REMINDER` before restart.
An earlier read-only `--check` validates the api/webapp source contract while allowing a missing media env, and proves
that the missing output can be rendered without writing. Runtime readiness performs real fail-if-succeeds sibling
denials and transactionally proves only the exact `reminders.web_push_only.tick` status row is writable/visible.
Failure leaves all TEST writers stopped; completed per-file atomic root-owned env updates and idempotent role/overlay provisioning are
retained for a safe rerun. The deploy wrapper never installs the cron task: cronport installation and the first live tick
remain a separate owner-authorized gate after a complete fresh rehearsal.
Scheduler discovery returns `SETOF uuid`, so runtime/readiness SQL must give the scalar function result an explicit
`organization_id` column alias. The TEST media-worker unit is pinned to
`/opt/projects/bersoncarebot-test/apps/media-worker`, runs as `deploy:deploy`, and the fresh wrapper verifies those
effective systemd properties before restart. It also requires the exact system unit fragment
`/etc/systemd/system/bersoncarebot-media-worker-test.service` and exactly one canonical
`/opt/env/bersoncarebot/media-worker.test` environment file; substring/suffix matches and extra env files fail closed.

## Webapp Internal Cron / Internal HTTP Jobs

All webapp internal HTTP jobs are Bearer-gated by `INTERNAL_JOB_SECRET` and now enter a named infra principal after
auth succeeds. Under the current C1 webapp request pool, infra principals are still fail-closed in locked mode until
C4/F phases add a separate operational pool/grants contract. That is deliberate: this repo stage makes the source
explicit and prevents false green; it does not grant cross-tenant DB visibility.

| ID                               | Internal path                                    | Source file                                                                  | Principal source                                     | DB/S3 surface                                            | Locked-mode posture                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webpush_reminders`              | `/api/internal/reminders/web-push-only/tick`     | `apps/webapp/src/app/api/internal/reminders/web-push-only/tick/route.ts`     | `api/internal/reminders/web-push-only/tick:POST`     | due reminder planning/dispatch, operator status          | Dedicated `app_operational_web_push_reminder` pool; organization discovery is a narrow function, all work is delegated per org. Schedule is managed only by `web-push-only-reminder-cron.sh` → cronport. |
| `media_purge`                    | `/api/internal/media-pending-delete/purge`       | `apps/webapp/src/app/api/internal/media-pending-delete/purge/route.ts`       | `api/internal/media-pending-delete/purge:POST`       | pending-delete media rows, S3 delete                     | Explicit infra; future fake-S3 purge fixture required.                                                                                                                                                   |
| `media_multipart`                | `/api/internal/media-multipart/cleanup`          | `apps/webapp/src/app/api/internal/media-multipart/cleanup/route.ts`          | `api/internal/media-multipart/cleanup:POST`          | expired multipart sessions, pending media rows, S3 abort | Explicit infra; future fake-S3 multipart fixture required.                                                                                                                                               |
| `media_preview`                  | `/api/internal/media-preview/process`            | `apps/webapp/src/app/api/internal/media-preview/process/route.ts`            | `api/internal/media-preview/process:POST`            | pending preview rows, S3 preview objects                 | Explicit infra; separate process `media-preview:tick` remains preferred in ops docs and needs the same operational-pool decision.                                                                        |
| `media_transcode_enqueue`        | `/api/internal/media-transcode/enqueue`          | `apps/webapp/src/app/api/internal/media-transcode/enqueue/route.ts`          | `api/internal/media-transcode/enqueue:POST`          | single media enqueue                                     | Explicit infra; enqueue copies media org in repository layer.                                                                                                                                            |
| `media_transcode_reconcile`      | `/api/internal/media-transcode/reconcile`        | `apps/webapp/src/app/api/internal/media-transcode/reconcile/route.ts`        | `api/internal/media-transcode/reconcile:POST`        | legacy video scan/enqueue                                | Explicit infra; future gate must prove it partitions or only enqueues org-stamped jobs.                                                                                                                  |
| `outbound_integration_probes`    | `/internal/operator-health-probe`                | `apps/integrator/src/integrations/bersoncare/operatorHealthProbeRoute.ts`    | signed integrator internal probe from C3             | synthetic operator probe delivery/status                 | C3-inventoried integrator route; C4 final gate must prove send-safe/no-real-delivery behavior.                                                                                                           |
| `system_health_guard`            | `/api/internal/system-health-guard/tick`         | `apps/webapp/src/app/api/internal/system-health-guard/tick/route.ts`         | `api/internal/system-health-guard/tick:POST`         | integrator push outbox health, optional alert intent     | Explicit infra; final send-safe proof remains future.                                                                                                                                                    |
| `operator_health_critical`       | `/api/internal/operator-health-critical/tick`    | `apps/webapp/src/app/api/internal/operator-health-critical/tick/route.ts`    | `api/internal/operator-health-critical/tick:POST`    | critical operator health alerting                        | Explicit infra; final send-safe proof remains future.                                                                                                                                                    |
| `operator_health_digest`         | `/api/internal/operator-health-digest/tick`      | `apps/webapp/src/app/api/internal/operator-health-digest/tick/route.ts`      | `api/internal/operator-health-digest/tick:POST`      | operator digest alerting                                 | Explicit infra; final send-safe proof remains future.                                                                                                                                                    |
| `playback_retention`             | `/api/internal/media-playback-stats/retention`   | `apps/webapp/src/app/api/internal/media-playback-stats/retention/route.ts`   | `api/internal/media-playback-stats/retention:POST`   | playback hourly retention                                | Explicit infra; retention is separately reviewed infra operation.                                                                                                                                        |
| `hls_proxy_retention`            | `/api/internal/media-hls-proxy-errors/retention` | `apps/webapp/src/app/api/internal/media-hls-proxy-errors/retention/route.ts` | `api/internal/media-hls-proxy-errors/retention:POST` | HLS proxy error retention                                | Explicit infra; retention is separately reviewed infra operation.                                                                                                                                        |
| `product_analytics_retention`    | `/api/internal/product-analytics/retention`      | `apps/webapp/src/app/api/internal/product-analytics/retention/route.ts`      | `api/internal/product-analytics/retention:POST`      | product analytics retention                              | Explicit infra; telemetry retention is separately reviewed infra operation.                                                                                                                              |
| `specialist_task_reminders_tick` | `/api/internal/specialist-task-reminders/tick`   | `apps/webapp/src/app/api/internal/specialist-task-reminders/tick/route.ts`   | `api/internal/specialist-task-reminders/tick:POST`   | specialist task reminder queue                           | Explicit infra; future gate must prove org partitioning.                                                                                                                                                 |

The checker recursively scans `apps/webapp/src/app/api/internal/**/route.ts`; adding a new internal route without
inventory/checker coverage fails `pnpm run check:saas-c4-scheduler-media-cron-fanout`.

## Webapp Media Presign / Upload / Playback Matrix

| Surface                     | Source files                                                                                              | Principal / authorization source                                                                                      | Object-key posture                                                                | Repo-side proof status                                                                                | Remaining gate                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Single PUT presign          | `apps/webapp/src/app/api/media/presign/route.ts`                                                          | doctor session via `getCurrentSession` + `canAccessDoctor`; folder checked by `pgValidateUserAssignableMediaFolder`   | server generates `s3ObjectKey(mediaId, filename)` after DB pending row insert     | Static checker verifies server-generated key, folder gate, pending-row insert, and presign call.      | Fake/local object storage route test must prove same-org allow and cross-org folder/key deny under locked context. |
| Multipart init / part URL   | `apps/webapp/src/app/api/media/multipart/init/route.ts`, `part-url/route.ts`                              | doctor session; session ownership gates part presign by `gateUploadSessionForPartUrl(sessionId, session.user.userId)` | server stores `s3Key` in upload session; part URLs use stored key only            | Static checker verifies server-generated key, upload-session owner gate, and stored-key part presign. | Fake/local matrix must prove another org/user cannot get part URL for a foreign session/key.                       |
| Playback descriptor         | `apps/webapp/src/app/api/media/[id]/playback/route.ts`                                                    | session + `assertMediaPlaybackAccess`; DB row via `getMediaAccessRow`                                                 | playback payload resolver signs known row artifacts only                          | Static checker verifies row lookup, access assertion, and resolver call.                              | Locked fake/local playback test must prove allowed patient/doctor access and cross-org denial.                     |
| HLS/preview/object delivery | `apps/webapp/src/app/api/media/[id]/hls/[[...path]]/route.ts`, `preview/[size]/route.ts`, `[id]/route.ts` | same media row/session family                                                                                         | path is derived from DB media row/artifact fields, not client-supplied raw S3 key | Documented as part of C4 matrix; full static proof is deferred to route-level fake/local tests.       | Fake/local object storage must prove cross-org object keys cannot be presigned or proxied.                         |

## Implemented Artifacts

- [`../../../apps/integrator/src/infra/runtime/scheduler/main.ts`](../../../apps/integrator/src/infra/runtime/scheduler/main.ts)
- [`../../../apps/integrator/src/infra/db/integratorPoolProvider.ts`](../../../apps/integrator/src/infra/db/integratorPoolProvider.ts)
- [`../../../apps/integrator/src/infra/db/operationalPoolReadiness.ts`](../../../apps/integrator/src/infra/db/operationalPoolReadiness.ts)
- [`../../../apps/media-worker/src/control.ts`](../../../apps/media-worker/src/control.ts)
- [`../../../apps/media-worker/src/workerTick.ts`](../../../apps/media-worker/src/workerTick.ts)
- [`../../../apps/media-worker/src/processTranscodeJob.ts`](../../../apps/media-worker/src/processTranscodeJob.ts)
- [`../../../apps/webapp/src/app/api/internal/media-worker/control/route.ts`](../../../apps/webapp/src/app/api/internal/media-worker/control/route.ts)
- [`../../../apps/webapp/src/app-layer/media/mediaWorkerControl.ts`](../../../apps/webapp/src/app-layer/media/mediaWorkerControl.ts)
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
