# SaaS B1 Doctor/Admin Identity Assertion

Status: Phase B1 repo-side assertion package, 2026-07-14.

Purpose: make the known dormant doctor/admin identity failure executable before any code repair. B1 must distinguish
data-fix skipped/partial, membership seed mismatch, and app/session smoke failure. This package covers the
disposable-DB assertion part and deliberately does not read live TEST/PROD/dev databases.

## Commands

DB-free validation:

```bash
pnpm run check:saas-b1-doctor-admin-identity
```

Owner-authorized disposable fresh-copy execution:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-b1-doctor-admin-identity.mjs \
  --execute \
  --database-url='<disposable-fresh-copy-runtime-url>'
```

The database name must contain `scratch`, `rehearsal`, or `copy` and must not be prod/test/dev-shaped. The script
prints only counts/booleans and failure reason enums.

## Checklist

- [x] Refuses obvious live-like DB names.
- [x] Checks owner doctor phone has exactly one live row.
- [x] Checks canonical doctor has role `doctor` and the expected doctor email.
- [x] Checks exactly one active admin and the gmail admin row.
- [x] Checks doctor and admin active organization memberships exist with the expected role shape.
- [x] Checks `admin_phones` TEST override shape when present.
- [x] Classifies likely failure reasons without guessing a code fix.
- [x] No patient samples, raw payloads, env reads, SSH, service calls, or DB writes.

## B1 Boundary

This is not the full B1 exit. Full B1 still requires running the assertion and the A1 doctor/admin smoke on an
owner-authorized disposable fresh copy, then making the smallest code/data-fix repair if the assertion identifies a
real gap.
