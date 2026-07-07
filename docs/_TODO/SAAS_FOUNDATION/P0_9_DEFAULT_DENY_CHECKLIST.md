# P0.9 Default-Deny Descriptor Checklist

Status: executable checklist for P0.9.1.

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

- [ ] Define enforce-mode descriptor state for SCOPED, BOOTSTRAP, INFRA, LEGACY, and TELEMETRY.
- [ ] Default for unknown/missing descriptor is deny, not permit.
- [ ] Scratch test: missing `app.org` denies SCOPED rows in enforce mode.
- [ ] Scratch test: wrong `app.org` denies SCOPED rows.
- [ ] Scratch test: correct `app.org` permits only matching rows.
- [ ] Scratch test: BOOTSTRAP global rows stay readable before org context when descriptor permits it.
- [ ] Scratch test: INFRA/TELEMETRY/LEGACY behavior matches explicit descriptors.
- [ ] Document how P0.9 differs from P0.8 permissive/dormant policies.
- [ ] Update `LOG.md`.

## Local Gate

```bash
bash /home/dev/orch/run-tests.sh "pnpm run check:saas-db-regression && <enforce-mode descriptor tests> && <scratch enforce smoke> && git diff --check"
```

## Definition Of Done

- Enforce-mode default-deny behavior is test-proven on scratch/non-prod only.
- Unknown descriptor state fails closed.
- Production remains dormant.
