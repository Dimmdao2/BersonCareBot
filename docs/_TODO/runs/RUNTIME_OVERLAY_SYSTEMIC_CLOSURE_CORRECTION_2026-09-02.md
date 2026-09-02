# Runtime-overlay closure — F4 correction evidence — 2026-09-02

Authority: independent FAIL `RUNTIME_OVERLAY_SYSTEMIC_CLOSURE_REAUDIT_2026-09-02.md`, finding F4.

## Result: PASS AFTER FIX

The TEST data override no longer drops or recreates `system_settings_test_lock`. It fails closed unless the
schema-B trigger is present and enabled, uses a transaction-local trigger bypass only around the protected-row
mutations, restores ordinary trigger execution immediately after each such block, and verifies after commit that
the original trigger remains enabled. Unrelated `system_settings` synchronization triggers therefore remain live.

The production-control-flow oracle now rejects removal or recreation of the lock and requires balanced bounded
trigger-bypass blocks. The same acceptance set from the independent audit is green after the correction:

- `node --test deploy/host/deploy-test-full-reset.test.mjs deploy/host/prod-to-target-cutover-path-resolvable.test.mjs`
  — 14 passed, 0 failed;
- `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check`
  — all four generated privilege/allowlist artifacts match byte-for-byte;
- `git diff --check` — PASS.

No DB, deploy, service or PROD command was used for this correction. The already-authorized full TEST rehearsal is
the later live proof of the complete reset path.
