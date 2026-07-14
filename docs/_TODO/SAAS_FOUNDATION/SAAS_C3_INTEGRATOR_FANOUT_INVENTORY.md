# C3 integrator fanout inventory and missing-principal gate

Status: Phase C3 repo-side inventory/fail-closed package. No live delivery proof.

## Scope

This stage builds on the existing
[`T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md`](T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md) source audit and tightens the
default integrator DB chokepoint:

- Telegram/MAX/BersonCare M2M/scheduler/worker entrypoints remain mapped through the T0.4 checklist.
- Locked-mode integrator DB access now rejects a missing principal before `pool.connect()`.
- Legacy mode remains compatible for current dormant deployments.
- Technical queue/outbox paths that intentionally do not carry a business organization principal remain a
  later C3/C4 operational-pool decision; this stage does not silently treat them as staff or patient.

## Implemented Artifacts

- [`../../../apps/integrator/src/infra/db/withClient.ts`](../../../apps/integrator/src/infra/db/withClient.ts)
- [`../../../apps/integrator/src/infra/db/integratorPoolProvider.ts`](../../../apps/integrator/src/infra/db/integratorPoolProvider.ts)
- [`../../../apps/integrator/src/infra/db/withClient.test.ts`](../../../apps/integrator/src/infra/db/withClient.test.ts)
- [`scripts/check-c3-integrator-fanout-inventory.mjs`](scripts/check-c3-integrator-fanout-inventory.mjs)

## Remaining C3 Gates

Not closed by this repo-only stage:

- real staff/nonstaff integrator pool split where both role families are needed;
- Telegram/MAX/webhook/public-booking send-safe process-family proof;
- no-real-delivery/no-real-S3 runtime proof;
- explicit operational-pool contract for technical queue/outbox state.
