# P0.11 Org-Aware system_settings Checklist

Status: executable checklist for P0.11.1-P0.11.4.

Purpose: make `system_settings` support global rows and per-organization rows without breaking current
global admin settings or the integrator mirror.

## Shared Inputs

- `.cursor/rules/000-critical-integration-config-in-db.mdc`
- `.cursor/rules/system-settings-integrator-mirror.mdc`
- `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md`
- `apps/webapp/src/infra/repos/pgSystemSettings.ts`
- `apps/integrator/src/infra/db/publicSystemSettings.ts`
- `apps/webapp/scripts/check-system-settings-accessors.mjs`

## P0.11.1 Storage Shape

Checklist:

- [x] Add nullable `organization_id` to `public.system_settings`.
- [x] Add matching nullable `organization_id` to `integrator.system_settings`.
- [x] Change logical uniqueness from `(key, scope)` to org-aware uniqueness.
- [x] Add partial unique index for global rows where `organization_id IS NULL`.
- [x] Backfill existing rows as global (`organization_id NULL`).
- [x] Preserve current global settings reads.

P0.11.1 execution note (2026-07-08): storage DDL is placed before the existing P0.8.6
BOOTSTRAP hybrid RLS policies in `0163_p0_8_6_bootstrap_hybrid_rls.sql`, because those policies
already reference `organization_id` and a fresh migration chain would otherwise fail before a later
P0.11 migration could run. Current runtime settings reads/writes remain global-only by explicitly
filtering/targeting `organization_id IS NULL`; full org-context read/write semantics remain P0.11.2
and P0.11.3.

## P0.11.2 Read Path

Checklist:

- [x] Port reads accept optional organization context.
- [x] Org-specific row wins when present.
- [x] Global NULL row is fallback.
- [x] Named external readers are either org-aware or documented global-only.
- [x] `check-system-settings-accessors.mjs` still blocks raw reads outside accessors.

P0.11.2 execution note (2026-07-08): current callers remain global-only unless they pass
`organizationId`; the optional read context uses org-row-first ordering with `organization_id IS NULL`
fallback. Media-worker settings reads remain explicitly global-only (`organization_id IS NULL`) because
they have no tenant context in this stage. P0.11.3 still owns org-aware write/update semantics and
mirror payloads.

## P0.11.3 Write Path And Mirror Sync

Checklist:

- [x] `updateSetting` writes org-aware rows through the service path.
- [x] Mirror sync sends the same key/scope/org semantics to integrator.
- [x] No second sync call is added in route handlers.
- [x] Existing global admin settings still round-trip.
- [x] Audit rows preserve actor/org context where available.

P0.11.3 execution note (2026-07-08): `updateSetting` and admin batch persistence accept optional
`organizationId`, write either the global partial unique row or the org-specific partial unique row,
and pass the same org semantics to the signed integrator mirror sync/outbox idempotency key. The
integrator sync route now upserts `integrator.system_settings` with matching global/org conflict
targets. `system_settings_audit` stores nullable `organization_id` for org-scoped writes. Admin routes
still call only the service path; no route-level mirror sync was added.

## P0.11.4 UI / Rules / Docs

Checklist:

- [x] Admin UI remains global unless a setting is explicitly org-scoped.
- [x] `ALLOWED_KEYS` unchanged unless a real setting key is added.
- [x] Rules mention public/integrator mirror lockstep with org dimension.
- [x] Docs explain NULL global fallback and org-specific override.

P0.11.4 execution note (2026-07-08): updated `.cursor` rules, `AGENTS.md`, architecture docs,
and SaaS-aware development guidance to describe the org-aware logical identity
`(key, scope, organization_id)`, global `organization_id IS NULL` defaults, org-specific overrides,
and current admin Settings UI global-by-default behavior. Added
`check-p0-11-system-settings-docs-rules.mjs` to keep the docs/rules contract in SaaS regression.

## Local Gate

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <system_settings tests> && <migration rollback/scratch proof> && git diff --check"
```

## Definition Of Done

- Public and integrator mirror schemas match.
- Existing global settings behavior is preserved.
- Org-specific overrides are possible through the canonical service path.
- Raw `system_settings` reads remain guarded.
