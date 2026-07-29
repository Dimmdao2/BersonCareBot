> ВЕДЁТСЯ В [`docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md`](../../../_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md) §0. FINAL RESULT — «R2 — TEST enforced product parity plus isolation». Архивная запись, работой не является.

# R2 readiness closure

> ⚠️ **НЕ АКТУАЛЬНО (2026-07-10).** Снимок готовности к pre-pivot "R2 tenant-context cutover" (до owner-пивота
> 2026-07-15 «NO prod cutover — ever», `SAAS_R1_FINISH_LINE_AND_DOC_HYGIENE.md`). Актуально:
> [`SAAS_ENFORCE_ROADMAP.md`](SAAS_ENFORCE_ROADMAP.md), [`R2_MVP_MASTER_CHECKLIST.md`](R2_MVP_MASTER_CHECKLIST.md)
> (verified 2026-07-23), [`T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md`](T0_TENANT_CONTEXT_CUTOVER_CHECKLIST.md).

Date: 2026-07-10

Taskdb: `#641`

Purpose: close T0.5-T0.8 as readiness for R2 tenant-context cutover. This is the integration checkpoint after T0.4 and T0.5-T0.8 marker closure; it does not execute R2 enforcement, production role changes, staging shadow-run, migrations, table drops, or external-channel calls.

## R2 deliverable map

| R2 deliverable                                                             | Current readiness                                                                                                                                                                                                                                                                   | Evidence                                                                                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Request and process tenant principal set through the chokepoint.           | Ready for controlled R2 execution. P0.6 provides the dormant DB principal carrier/chokepoint contract; P0.7/T0.3/T0.4 applied context to webapp, integrator, worker/scheduler, media-worker, and payment/webhook writer families that were in scope for this branch.                | `P0_6_DORMANT_CONTEXT_CHECKLIST.md`; `P0_7_WRITER_CENSUS.md`; `T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md`; `LOG.md`                            |
| Non-bypass app DB role validated in prod-parity environment.               | Ready as a contract/proof, not flipped in runtime. P0.5 defines the non-owner `NOBYPASSRLS` app-role boundary and scratch proof; runtime env/role changes remain a later controlled cutover.                                                                                        | `P0_5_DB_ROLE_SPLIT.md`; `P0_5_DB_ROLE_SPLIT_PROOF.sql`; `scripts/check-p0-5-role-split.mjs`                                            |
| Staging shadow-run for wrong-org/empty-org/unenforced cases.               | Ready as the next operational gate, not executed here. P0.8/P0.9/P0.13 artifacts prove the static descriptors, policy renderer, enforce-mode descriptors, and synthetic two-org fixtures/smokes needed before shadow-run.                                                           | `P0_8_CODE_FACTS.md`; `P0_9_DEFAULT_DENY_CHECKLIST.md`; `P0_13_ISOLATION_FIXTURES_CHECKLIST.md`; `scripts/check-saas-db-regression.mjs` |
| RLS enforcement flip plan and rollback.                                    | Ready to draft from existing dormant policy/enforce artifacts, but not executed. P0.8 installed dormant permissive policies, P0.9 defines enforce-mode default-deny descriptors, and P0.5 defines role split. The runtime flip remains behind explicit flags/GUC and rollback docs. | `P0_8_CODE_FACTS.md`; `P0_9_DEFAULT_DENY_CHECKLIST.md`; `P0_5_DB_ROLE_SPLIT.md`; `ROADMAP_TO_SAAS.md`                                   |
| Doctor/admin gates use membership, not implicit single-clinic assumptions. | Ready for R2 checkpoint. T0.3 doctor/admin principal slices route doctor/admin writes through selected workspace/membership context; T0.4 handles non-webapp process entrypoints.                                                                                                   | `LOG.md`; taskdb `#589`-`#634`; `T0_4_ENTRYPOINT_ORG_CONTEXT_MAP.md`                                                                    |

## Exit-gate evidence

| R2 exit gate                                                                   | Status                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synthetic two-org tests prove org wall and patient wall under non-bypass role. | Covered by P0.13 DB isolation/smoke guards in `pnpm run check:saas-db-regression`; final integration validation for this closure must include full `pnpm run ci`.                                                                            |
| Single-clinic prod behavior remains stable.                                    | Current branch remains dormant for production enforcement: no runtime role/env/grant flip, no RLS enforcement activation, no prod/test deploy, and no external-channel calls. Full CI is the codebase-level stability gate for this closure. |

## T0.5-T0.8 closure statement

- T0.5-T0.8 are closed as R2 readiness constraints, not as enforcement execution.
- `system_settings` mirror removal is not assumed.
- Reminder dispatch is not treated as public-only.
- Rubitime legacy paths remain explicit cutover work.
- `integrator.contacts` fallback remains live until a `public_only` exception audit and owner-gated cutover.
- Queue/outbox retention cleanup remains operational cleanup, not business-data migration.

## Execution boundary

- No production/test deploy.
- No main/test/dimmdao push.
- No schema migration.
- No runtime role/env/grant change.
- No dev/prod/test application DB reads or writes.
- No external Telegram/MAX/Rubitime/Google Calendar/SMS/email/S3 calls.
- No queue replay.
- No subagents spawned for this closure.

## Required local validation

Before marking taskdb `#641` done:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-r2-readiness-closure.mjs
node docs/_TODO/SAAS_FOUNDATION/scripts/check-r2-readiness-closure.mjs --self-test
pnpm exec eslint docs/_TODO/SAAS_FOUNDATION/scripts/check-r2-readiness-closure.mjs
pnpm run check:saas-db-regression
pnpm run ci
git diff --check
```
