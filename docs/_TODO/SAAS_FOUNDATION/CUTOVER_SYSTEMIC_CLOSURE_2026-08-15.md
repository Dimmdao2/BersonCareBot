# Cutover systemic closure — repository evidence — 2026-08-15

Scope: repository-only closure for tracked workstream #996. No DEV/TEST/PROD database, service, env, provider,
or external delivery operation was performed.

## Authority and decisions

- Execution order and no-manual-surgery oracle: `HARD_MIGRATION_PROTOCOL.md`.
- Target privilege/runtime topology: `DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`.
- B1 owner search used code-search first, then exact owner-file search:

```bash
node /home/dev/brain/tools/code-search.mjs "owner decision DEV Trial target tariff catalog TEST" --repo bcb -k 10
rg --files docs | rg '(^|/)(OWNER_DECISIONS|OWNER_RULINGS)' | sort
owner_files=$(rg --files docs | rg '(^|/)(OWNER_DECISIONS|OWNER_RULINGS)' | tr '\n' ' '); \
  rg -n -i "DEV Trial|f0000000-0000-4000-8000-000000000001" $owner_files
```

Result: the semantic search found no owner requirement for `DEV Trial`; the exact search returned zero matches in
the six listed owner-decision/ruling files. The target catalog therefore keeps the four reviewed product IDs and
excludes the four exact environment-owned fixture IDs without changing DEV.

## Implemented closure

- B0: one reviewed 18-relation patient-fact manifest feeds pre-stage evidence, enrollment/link reconstruction, and
  the final exact-one oracle. Merged/archived/non-client identities are ineligible. All 45 observed source-only
  relation classes have one `transform` / `intentionally_retire` disposition; unknown and stale classes fail.
- P1: doctor broadcast phone resolution uses only the terminal canonical `public.platform_users` Drizzle port.
  The legacy SQL reader, setting registry/UI values, generated runtime row, and failure-swallowing catch are gone.
- B2: the public full-reset wrapper invokes the same-checkout snapshot checker before entering its shared reset
  engine. The executable wrapper test proves ordering and propagates the checker exit without invoking the engine.
- B1: generator policy uses exact reviewed/environment-owned ID registries, validates required active tariff
  fields, and renders exactly four target tariffs.
- B3: SMTP snapshot/restore requires a statically valid full config without printing it. Completion wording is
  `DB/schema/runtime ready; external delivery unverified`; the opt-in SMTP route returns a correlation `probeRef`.

## Commands and results

```bash
pnpm run check:cutover-systemic-closure
```

Result: PASS — 12/12 Node tests; legacy census PASS over 7 active roots with 7 exact transition files; census
self-test PASS; SMTP shape self-test PASS.

```bash
pnpm --dir apps/integrator exec vitest --run src/infra/runtime/worker/doctorBroadcastIntentMenu.test.ts
```

Result: PASS — 1 file, 3 tests, including DB-failure propagation.

```bash
pnpm --dir packages/operator-db-schema run build && \
pnpm --dir packages/db-principal run build && \
pnpm --dir packages/platform-merge run build && \
pnpm --dir packages/error-tracking run build && \
pnpm --dir apps/integrator run typecheck && \
pnpm --dir apps/integrator run lint
```

Result: PASS — four prerequisite package builds, integrator TypeScript, ESLint, queue boundary, and legacy retry
producer gate.

```bash
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp run lint
```

Result: PASS — webapp TypeScript and its configured lint/static boundary chain.

```bash
pnpm exec eslint scripts/prod-to-target-baseline-policy.mjs \
  scripts/prod-to-target-baseline-policy.test.mjs scripts/prod-to-target-cutover-contract.test.mjs \
  scripts/check-legacy-access-census.mjs scripts/refresh-prod-to-target-cutover.mjs \
  deploy/host/deploy-test-full-reset.test.mjs deploy/host/validate-smtp-outbound-snapshot.mjs
bash -n deploy/host/deploy-test-full-reset.sh deploy/host/deploy-test-saas.sh
node --check scripts/prod-to-target-baseline-policy.mjs
node --check scripts/check-legacy-access-census.mjs
node --check deploy/host/deploy-test-full-reset.test.mjs
node --check deploy/host/validate-smtp-outbound-snapshot.mjs
git diff --check
```

Result: PASS — targeted ESLint plus shell/Node syntax and whitespace checks.

`pnpm run ci` was not run by instruction. `pnpm run check:prod-to-target-cutover` was not run during this
repository pass because it reads the live local DEV database; its same-process invocation and failure propagation
are covered by the executable wrapper test.

## Remaining live-only proof

The owner-gated TEST run must still prove the full fresh-dump order, execute the real same-checkout snapshot check,
run the SQL membership/disposition/final oracles, and verify doctor roster plus patient organization resolution.
External delivery remains unverified. A later explicitly authorized SMTP acceptance uses authenticated
`POST /api/admin/smtp-test` to an allowlisted TEST mailbox, then correlates its returned `probeRef` through the
existing delivery-attempt path and provider/mailbox receipt. Telegram/MAX/SMS/webpush require their own acceptance;
this package sends nothing.
