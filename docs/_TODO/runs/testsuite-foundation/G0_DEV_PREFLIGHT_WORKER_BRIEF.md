# #1074 — repair stale DEV runtime-overlay preflight for G0

Authority:

- `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, owner gate G0/0175 and
  current-order step 2 live-DB foundation;
- `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, DEV migration and
  TEST→DEV refresh order;
- `docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md`, section
  `Existing DEV database runtime-overlay recovery`;
- repository rules in `AGENTS.md`, `.cursor/rules/test-execution-policy.md`,
  and `docs/ORCHESTRATION_BINDINGS.md`.

Observed evidence, already measured read-only by the lead:

- `bash deploy/host/migrate-dev.sh --preflight` stops inside
  `dev-runtime-overlay-rehydrate.sh` with `division by zero`;
- replay of the exact first preflight heredoc reports failure at its
  `dev_runtime_roles_safe` guard;
- the canonical database has exactly these auxiliary incoming edges to
  `app_staff`: `app_platform_settings -> app_staff` and
  `app_clinic_billing -> app_staff`, both `ADMIN FALSE, INHERIT FALSE,
  SET TRUE`;
- `deploy/postgres/c5a-platform-operations-runtime.sql` intentionally creates
  `app_clinic_billing NOLOGIN NOINHERIT NOBYPASSRLS` and grants that exact
  SET-only edge;
- the DEV preflight and its contract test still allow/count only the older
  `app_platform_settings` edge. This makes the current canonical C5A closure
  fail the older DEV guard.

Deliver one minimal coherent fix:

1. Update `deploy/host/dev-runtime-overlay-rehydrate.sh` so the first
   fail-closed role-topology guard accepts exactly both canonical auxiliary
   roles/edges and still rejects every unlisted incoming edge.
2. Validate safe attributes for `app_clinic_billing` in that guard, consistently
   with `c5a-platform-operations-runtime.sql`; do not weaken the wall by merely
   broadening a filter or deleting the exact-set comparison.
3. Update `deploy/host/dev-runtime-overlay-rehydrate.test.mjs` to pin both exact
   roles, both exact SET-only edges, safe role attributes, and the exact count.
   Rename the test description if needed so it no longer falsely says “only
   U9A”.
4. Do not change database state, migrations, C5A SQL, application code,
   deployment paths, A0 files, TEST, or PROD.
5. Run:
   - `node --test deploy/host/dev-runtime-overlay-rehydrate.test.mjs`;
   - scoped lint/checks already defined for these files, if any;
   - `git diff --check` for the two files.
6. You may attempt
   `bash deploy/host/dev-runtime-overlay-rehydrate.sh --preflight` once because
   it is read-only and DEV-only. If sandbox/sudo blocks it, report that exact
   limitation; do not improvise SQL or modify roles. The lead will perform the
   host-side preflight.
7. Commit only the two scoped files with `#1074`. The commit body must state
   why, exact validation, the plan clause, and what remains undone. Do not push.

Return:

- commit SHA;
- exact diff and validations;
- whether the DEV preflight itself ran;
- residual risks for an independent auditor.
