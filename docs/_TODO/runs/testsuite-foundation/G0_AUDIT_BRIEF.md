# #1074 — G0/0175 TEST-only evidence audit

Authority:

- `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, current order lines 88–91 and
  `HOW-D / EXEC` → `G0`;
- `docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/README.md`;
- `docs/ARCHITECTURE/DB_DUMPS/a1-rls/README.md`;
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md`;
- `deploy/HOST_DEPLOY_README.md`.

This is an evidence-only TEST gate. Do not edit repository files. Do not touch,
read, compare, connect to, or mention PROD beyond stating it was excluded.

Goal:

Determine whether the committed `a0-greenfield` baseline and the disposable A0
database path represent the schema/migration state that exists on TEST with
respect to historical migration
`0175_p0_8_b4_roles_1_is_staff_wall_rls.sql`.

Required sequence:

1. Read all authority sources and use existing scripts/runbooks only.
2. Run the static A0 check and disposable A0 verifier through the shared test
   mutex where they execute tests/heavy DB work.
3. Inspect the committed 0175 hash and the TEST migration ledger/state through
   an existing documented read-only TEST path. Never print connection strings,
   credentials, env contents, identities, or row data.
4. If permissions prevent the TEST comparison, report the exact blocker and
   the exact existing owner/root command needed; do not invent SQL or bypass
   permissions.
5. Do not refresh the baseline, edit historical migration 0175, migrate TEST,
   restart services, or create a non-disposable database.
6. Return a matrix:
   - committed 0175 bytes/hash;
   - A0 manifest/hash;
   - disposable verifier result;
   - TEST ledger/state evidence;
   - verdict `PASS`, `DRIFT`, or `BLOCKED`.

This role is launched as `auditor-live` only because the orchestration read-only
sandbox masks operational paths. The repository must remain byte-for-byte
clean. Do not commit and do not push.

