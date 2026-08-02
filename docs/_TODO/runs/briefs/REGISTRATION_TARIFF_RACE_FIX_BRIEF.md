# Registration tariff policy race — bounded fix brief

## Authority and oracle

Follow-up to candidate `8c7e5d9db` and independent audit/test commit `64d3c0773`. Read `AGENTS.md` §5/§10b/§24,
`docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md` §2.6a Р-1/Р-7, the original worker brief and
`docs/_TODO/runs/tariff/REGISTRATION_TARIFF_HARDENING_INDEPENDENT_AUDIT_2026-08-02.md`.

Источник оракула: `docs/_TODO/runs/tariff/REGISTRATION_TARIFF_HARDENING_INDEPENDENT_AUDIT_2026-08-02.md` —
«Both current writes commit and final state is policy → inactive tariff».

This is the one fix-round from `AGENTS.md` §24.5: reuse the saved red acceptance branch; do not create another blind
audit, test suite or harness.

## Exact product fix

In `apps/webapp/src/infra/repos/pgPlatformEntitlements.ts`, make policy assignment and tariff deactivation/archive
serialize on the same existing `saas_tariffs` row inside their current transactions:

- the active-tariff authority read used before writing a policy must lock that tariff row;
- `updateTariff` and `archiveTariff` must lock the target tariff row before checking registration/trial policy use;
- after either transaction wins, the loser must re-observe committed state and fail with the existing domain error;
- reuse row-level PostgreSQL locking through Drizzle. No advisory/global lock, retry loop, raw SQL, schema or migration.

Do not broaden product scope or change the saved race oracle to make it green. In-memory sequential guards remain as
they are unless a strict typing change is mechanically required.

## Acceptance and delivery

Run the exact saved PostgreSQL command until it is green:

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/smoke-phase3-specialist-signup-provisioning.mjs
```

Also rerun the focused org-entitlements suite, static-only smoke, typecheck, scoped ESLint, raw-SQL gate and
`git diff --check` named in the audit report. Commit only explicit product/report paths with #1057/#1069. Do not
push, touch DEV/TEST/PROD, change migration/journal/schema/deploy ordering or run a new audit.

