# D40 — directPublic port report

## Result

`directPublic/` now has one production principal-selection entrypoint:
`writeDirectPublic(operation, write, options)` in
`apps/integrator/src/infra/db/directPublic/writePort.ts`.

Before:

```text
writePort.ts / directPublicWriteRetryWorker.ts
  -> local runWithOrganizationPrincipal / ambient-principal choice
  -> one of the directPublic SQL repositories
```

After:

```text
writePort.ts / directPublicWriteRetryWorker.ts
  -> writeDirectPublic(operation, write, options)
  -> selected organization principal (or existing bootstrap/infra context if no org exists)
  -> one of the directPublic SQL repositories
```

The seven D40 operation families are `identity-upsert`, `phone-bind`,
`reminder-rule-upsert`, `reminder-occurrence-finalize`, `reminder-delivery-append`,
`content-access-grant-upsert`, and `support-delivery-append`. The port’s operation map is the
only place that selects their principal strategy. The unrelated `admin-audit-write` call was
moved through the same port because it used the retired local helper and has the same public-table
organization-principal requirement.

## Consolidation decision

This is a parameterized single function, not seven role wrappers: 7 direct-public operation
families → 1 principal-selection entrypoint.

It is deliberately a separate sub-port, not code embedded into `apps/integrator/src/infra/db/writePort.ts`:
the retry worker is an independent production caller of direct-public repositories. Keeping the shared
entrypoint in `directPublic/` prevents a reverse dependency from worker → generic write-port and avoids a
cycle with `writePort.ts`, while preserving the integrator’s two distinct DB chokepoints: generic mutation
dispatch (`writePort.ts`) and bounded direct-public SQL (`directPublic/writePort.ts`). SQL remains in the
existing bounded infra repositories; the new port centralizes principal selection without changing SQL,
transactions, idempotency, fallback, or product behavior.

## Validation

Baseline on the untouched source was attempted exactly as required:

```bash
/home/dev/brain/host-orch/run-tests.sh 'pnpm --dir apps/integrator exec vitest run'
```

It could not start before dependency installation (`rc=254`, `Command "vitest" not found`). After
`pnpm install --frozen-lockfile`, the unchanged source still could not resolve the unbuilt workspace
package `@bersoncare/db-principal` (75 failed files / 10 failed tests); this is an environment-artifact
failure, not a D40 behavioral result. The normal integrator build produced the workspace artifacts.

After D40:

```bash
pnpm --dir apps/integrator typecheck
pnpm --dir apps/integrator lint
/home/dev/brain/host-orch/run-tests.sh 'pnpm --dir apps/integrator exec vitest run'
```

All passed. The final full integrator run recorded `rc=0` in the shared test-lock status and took 28s.
The added unit test verifies every D40 operation selects the ambient organization principal, honors an
explicit retry organization, and preserves no-organization bootstrap passthrough.

## Touched files

- `apps/integrator/src/infra/db/directPublic/writePort.ts`
- `apps/integrator/src/infra/db/directPublic/writePort.unit.test.ts`
- `apps/integrator/src/infra/db/directPublic/writeReminderRulesDirect.rls.integration.test.ts`
- `apps/integrator/src/infra/db/repos/messengerPhoneBindAudit.ts`
- `apps/integrator/src/infra/db/writePort.ts`
- `apps/integrator/src/infra/runtime/worker/directPublicWriteRetryWorker.ts`
- `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`
- `docs/_TODO/runs/integrator-cleanup/D40_DIRECTPUBLIC_PORT_REPORT.md`

## NOT DONE:

No migration, DDL, delivery-product behavior, idempotency behavior, or D3/D4/D20/D39 logic was changed.
