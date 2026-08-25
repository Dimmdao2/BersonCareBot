# Error tracking (C1 dark launch)

## Scope

The repository contains an opt-in, server-only error transport for `webapp`, integrator `api`, `worker`, `scheduler`, and `media-worker`. It sends unexpected exceptions only. Browser monitoring, request tracing, logs, profiling, replay, sessions, breadcrumbs, local variables, default PII, client reports, and source-map uploads are disabled.

No backend is installed or configured by this stage. GlitchTip is the recommended self-hosted Sentry-compatible backend for a later owner-approved infrastructure stage; managed Sentry is protocol-compatible. Product/backend selection remains an owner decision.

## Configuration

The only source is the global `admin` settings pair:

- `error_tracking_enabled` — boolean, default `false`;
- `error_tracking_dsn` — HTTP(S) DSN, default empty.

Both live in canonical `public.system_settings` and are exposed only through the typed server resolver. No error-tracking environment variable is supported. Processes read the pair once during startup; there is no per-request database read.

Global administrators edit the pair atomically on `/app/doctor/admin/technical`. The DSN is write-only in browser surfaces: APIs/UI expose only `hasStoredDsn`. Enabling requires a valid DSN to be entered again. Disabling clears the stored DSN. A restart of all five processes is required after a change.

## Privacy contract

`beforeSend` discards the SDK event and rebuilds it from this closed allowlist:

- exception type;
- constant exception value `[REDACTED]`;
- at most 40 repository-source frame identities: only `apps`/`packages`/`scripts`, a stable SHA-256-derived token, an allowlisted source extension, line and column numbers; raw filenames and function names are never emitted;
- fixed `service`, `process_role`, `capture_point`, and `release` tags.

Requests, headers, bodies, users, organization/patient/staff identifiers, IP addresses, URLs, query strings, cookies, extra/context objects, breadcrumbs, arbitrary filename/function substrings, and original exception messages are never retained. Capture calls are non-blocking; a bounded 1.5-second flush/close happens only during shutdown/fatal handling.

Release resolution is `BUILD_ID`, then a bounded local Git SHA lookup, then `dev`/`unknown`. Exact process roles are `webapp`, `api`, `worker`, `scheduler`, and `media-worker`.

## Activation gates

The capability remains disabled until both named owner gates pass:

- **SEC-02 — privacy/security gate:** backend retention, access control, backups, TLS, data location, fake-receiver adversarial-marker proof, and received payload allowlist are owner-approved.
- **PR-04 — production-readiness gate:** backend selection/provisioning is separately approved, three-run synthetic load proof is green, the global setting pair is saved atomically, and all five processes are restarted and verified with one sanitized synthetic error each.

No backend provisioning, host configuration, live database mutation, or process restart belongs to C1 repository work.

Rollback is atomic: disable the setting pair, which also clears the DSN, then restart the five processes. With the default disabled/empty state the SDK module is not imported and no network request is made.
