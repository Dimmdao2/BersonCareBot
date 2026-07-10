# P0.9 Default-Deny Descriptor Checklist

Status: implemented for P0.9.1.

Purpose: add enforce-mode default-deny descriptors and tests while keeping production dormant.

## Scope

Allowed:

- Add enforce-mode descriptor state.
- Add scratch/non-prod tests proving fail-closed behavior.
- Connect P0.9 descriptors to P0.8 descriptor model if already present.

Forbidden:

- No production enforce-mode activation.
- No app runtime role switch.
- No broad route/service rewrites.
- No dev/prod DB writes.

## Checklist

- [x] Define enforce-mode descriptor state for SCOPED, BOOTSTRAP, INFRA, LEGACY, and TELEMETRY.
- [x] Default for unknown/missing descriptor is deny, not permit.
- [x] Scratch test: missing `app.org` denies SCOPED rows in enforce mode.
- [x] Scratch test: wrong `app.org` denies SCOPED rows.
- [x] Scratch test: correct `app.org` permits only matching rows.
- [x] Scratch test: BOOTSTRAP global rows stay readable before org context when descriptor permits it.
- [x] Scratch test: INFRA/TELEMETRY/LEGACY behavior matches explicit descriptors.
- [x] Document how P0.9 differs from P0.8 permissive/dormant policies.
- [x] Update `LOG.md`.

## P0.9.1 Implementation Notes

- P0.8 policy migrations remain dormant/permissive where intended; P0.9.1 does not replace those production policies.
- P0.9.1 adds enforce-mode descriptor metadata and deterministic SQL rendering for a future cutover path only.
- Missing/unknown descriptors resolve to `deny` with predicate `false`.
- The unresolved polymorphic SCOPED descriptor (`public.comments`) stays fail-closed until P0.12.1.
- INFRA and TELEMETRY remain explicit global/readable descriptors in enforce mode.
- LEGACY descriptors are explicit but frozen: enforce mode renders `false` for them instead of reopening frozen legacy paths.
- Enforce-mode default-deny differs from P0.8 dormant SCOPED policies: unset/empty `app.org` denies SCOPED rows instead of permitting all rows.

## Local Gate

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-9-enforce-descriptors.mjs && <scratch enforce smoke> && git diff --check"
```

## Definition Of Done

- Enforce-mode default-deny behavior is test-proven on scratch/non-prod only.
- Unknown descriptor state fails closed.
- Production remains dormant.
