# Error tracking (C1 dark launch)

## Scope

The repository contains an opt-in, server-only error transport for `webapp`, integrator `api`, `worker`, `scheduler`, and `media-worker`. It sends unexpected exceptions only. Browser monitoring, request tracing, logs, profiling, replay, sessions, breadcrumbs, local variables, default PII, client reports, and source-map uploads are disabled.

No backend is installed or configured by this stage. GlitchTip is the recommended self-hosted Sentry-compatible backend for a later owner-approved infrastructure stage; managed Sentry is protocol-compatible. Product/backend selection remains an owner decision.

## Configuration

The only source is the global `admin` settings pair:

- `error_tracking_enabled` — boolean, default `false`;
- `error_tracking_dsn` — HTTP(S) DSN, default empty.

Both are server-audience projections in `public.app_runtime_settings`; canonical authoring uses `public.system_settings` through the existing system-settings service and integrator mirror. No error-tracking environment variable is supported. Processes read the pair once during startup; there is no per-request database read.

Global administrators edit the pair atomically on `/app/doctor/admin/technical`. The DSN is write-only in browser surfaces: APIs/UI expose only `hasStoredDsn`. Enabling requires a valid DSN to be entered again. Disabling clears the stored DSN. A restart of all five processes is required after a change.

## Privacy contract

`beforeSend` discards the SDK event and rebuilds it from this closed allowlist:

- exception type;
- constant exception value `[REDACTED]`;
- at most 40 cleaned repository-relative frames under `apps/`, `packages/`, or `scripts/`;
- fixed `service`, `process_role`, `capture_point`, and `release` tags.

Requests, headers, bodies, users, organization/patient/staff identifiers, IP addresses, URLs, query strings, cookies, extra/context objects, breadcrumbs, and original exception messages are never retained. Capture calls are non-blocking; a bounded 1.5-second flush/close happens only during shutdown/fatal handling.

Release resolution is `BUILD_ID`, then a bounded local Git SHA lookup, then `dev`/`unknown`. Exact process roles are `webapp`, `api`, `worker`, `scheduler`, and `media-worker`.

## Activation gate

Keep disabled until all of the following are explicitly approved and completed in a separate infrastructure task:

1. owner selects and provisions the backend outside this repository;
2. retention, access control, backups, TLS, and data-location/privacy terms are accepted;
3. the fake-receiver privacy test and synthetic load proof are green on the release commit;
4. a global admin stores the DSN and enables the pair atomically;
5. all five processes are restarted and one sanitized synthetic error per process is verified;
6. the owner confirms the received payload contains only the documented allowlist.

Rollback is atomic: disable the setting pair, which also clears the DSN, then restart the five processes. With the default disabled/empty state the SDK module is not imported and no network request is made.
