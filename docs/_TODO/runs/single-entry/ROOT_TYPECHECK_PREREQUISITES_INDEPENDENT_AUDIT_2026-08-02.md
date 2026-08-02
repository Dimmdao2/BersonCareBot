# Independent audit — root typecheck prerequisites (2026-08-02)

Reviewed product commit: `2a630c58b` (`wt/root-typecheck`). Scope: root `typecheck` prerequisite order only.

## Blind kill-set (before reading the changed root script)

1. Removing the `platform-merge` prebuild while its generated output is absent must make root typecheck fail on integrator module/type resolution.
2. Removing the `operator-db-schema` prebuild while its generated output is absent must likewise make root typecheck fail; otherwise that added build is decorative.
3. A clean-output root invocation with the accepted script must rebuild all workspace declaration outputs before recursive typechecking.
4. The audit must leave no product or generated-output change behind.

## Contract and resolution inspection

Exact inspection command:

```bash
for f in packages/operator-db-schema/package.json packages/db-principal/package.json packages/platform-merge/package.json packages/error-tracking/package.json apps/integrator/tsconfig.json apps/integrator/tsconfig.build.json; do sed -n '1,220p' "$f"; done
rg -n --glob '!node_modules/**' '"@bersoncare/(operator-db-schema|db-principal|platform-merge|error-tracking)"|from "@bersoncare/(operator-db-schema|db-principal|platform-merge|error-tracking)"|from '\''@bersoncare/(operator-db-schema|db-principal|platform-merge|error-tracking)'\''' apps/integrator packages
```

All four packages declare their public `types`/`exports.types` as `./dist/index.d.ts`. `apps/integrator/package.json` declares each as a workspace dependency and integrator source imports every package. Therefore its NodeNext type resolution requires the generated declaration entrypoints, not just source-package presence.

| Package | Root prebuild status | Evidence | Needed? |
| --- | --- | --- | --- |
| `operator-db-schema` | Added by `2a630c58b` | Fault injection below produces TS2307 for its imports | Yes |
| `platform-merge` | Added by `2a630c58b` | Fault injection below produces TS2307 for its imports | Yes |
| `db-principal` | Existing | Direct integrator imports; its contract also points types to `dist/index.d.ts` | Yes (pre-existing) |
| `error-tracking` | Existing | Direct integrator imports; its contract also points types to `dist/index.d.ts` | Yes (pre-existing) |

## Reversible fault injections

Before each run, the pre-audit `dist` directories for all four packages were moved to a unique `/tmp/root-typecheck-audit.*` backup; generated directories created by each run were moved aside, and the original directories were moved back after the accepted run. `git check-ignore -v` confirmed `dist/` is ignored by `.gitignore:18`.

### Kill 1 — omit `platform-merge`

Temporary one-line root script:

```json
"typecheck": "pnpm --dir packages/operator-db-schema run build && pnpm --dir packages/db-principal run build && pnpm --dir packages/error-tracking run build && pnpm -r --parallel run typecheck"
```

Exact command (host lock acquired):

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm typecheck"
```

Result: exit 2. Integrator failed with TS2307 for `@bersoncare/platform-merge` at `src/infra/db/directPublic/mergeCandidatesDirect.ts:23`, `src/infra/db/repos/messengerPhoneBindAudit.ts:7,12`, and `src/infra/db/repos/messengerPhonePublicBind.ts:9`. The named kill was caught. The same intentionally broken run also emitted downstream TS18046 diagnostics in `writePort.ts`; the accepted clean run below is green, so these were not a persistent finding.

### Kill 2 — omit `operator-db-schema`

Temporary one-line root script:

```json
"typecheck": "pnpm --dir packages/db-principal run build && pnpm --dir packages/platform-merge run build && pnpm --dir packages/error-tracking run build && pnpm -r --parallel run typecheck"
```

Exact command (host lock acquired):

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm typecheck"
```

Result: exit 2. Integrator failed with TS2307 for `@bersoncare/operator-db-schema` at `src/app/routes.ts:24`, `src/infra/db/integratorDrizzleSchema.ts:1`, `src/infra/db/repos/integrationWebhookStatusDrizzle.ts:5`, `src/infra/db/repos/operatorHealthDrizzle.ts:5`, `src/infra/operatorIncident/recordIntegrationWebhookOutcome.ts:1`, `src/infra/runtime/worker/outgoingDeliveryWorker.ts:23`, `src/integrations/bersoncare/relayOutboundRoute.ts:21`, and `src/integrations/bersoncare/sendEmailRoute.ts:28`. The added prebuild is necessary.

No kill was missed.

## Accepted clean-output validation

With all four relevant `dist` directories absent and the exact accepted root script from `2a630c58b` restored, ran:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm typecheck"
```

Result: exit 0. The command rebuilt `operator-db-schema`, `db-principal`, `platform-merge`, and `error-tracking`, then completed recursive typechecks, including `apps/integrator`.

Cleanup verification after restoring the original ignored outputs:

```bash
git diff --check
git status --short
```

Result: `git diff --check` exit 0; no persistent product or generated-output changes.

## Verdict

**PASS.** Both additions are required, correctly ordered before recursive typechecking, and root `pnpm typecheck` succeeds from absent generated outputs. No product change was made by this audit.
