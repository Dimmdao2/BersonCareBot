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

- [ ] Add nullable `organization_id` to `public.system_settings`.
- [ ] Add matching nullable `organization_id` to `integrator.system_settings`.
- [ ] Change logical uniqueness from `(key, scope)` to org-aware uniqueness.
- [ ] Add partial unique index for global rows where `organization_id IS NULL`.
- [ ] Backfill existing rows as global (`organization_id NULL`).
- [ ] Preserve current global settings reads.

## P0.11.2 Read Path

Checklist:

- [ ] Port reads accept optional organization context.
- [ ] Org-specific row wins when present.
- [ ] Global NULL row is fallback.
- [ ] Named external readers are either org-aware or documented global-only.
- [ ] `check-system-settings-accessors.mjs` still blocks raw reads outside accessors.

## P0.11.3 Write Path And Mirror Sync

Checklist:

- [ ] `updateSetting` writes org-aware rows through the service path.
- [ ] Mirror sync sends the same key/scope/org semantics to integrator.
- [ ] No second sync call is added in route handlers.
- [ ] Existing global admin settings still round-trip.
- [ ] Audit rows preserve actor/org context where available.

## P0.11.4 UI / Rules / Docs

Checklist:

- [ ] Admin UI remains global unless a setting is explicitly org-scoped.
- [ ] `ALLOWED_KEYS` unchanged unless a real setting key is added.
- [ ] Rules mention public/integrator mirror lockstep with org dimension.
- [ ] Docs explain NULL global fallback and org-specific override.

## Local Gate

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <system_settings tests> && <migration rollback/scratch proof> && git diff --check"
```

## Definition Of Done

- Public and integrator mirror schemas match.
- Existing global settings behavior is preserved.
- Org-specific overrides are possible through the canonical service path.
- Raw `system_settings` reads remain guarded.
