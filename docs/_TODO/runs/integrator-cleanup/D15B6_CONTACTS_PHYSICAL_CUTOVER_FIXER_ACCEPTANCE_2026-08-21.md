# D15b/6 fixer acceptance — 2026-08-21

Candidate `63ce08b99933e1445423b7db992a65540d976919` was reviewed in full against integration base
`eff0ca9b3bc42cb0bd41158314e6e63411157199` (83 changed files). Verdict: **PASS**.

- **MF1 → PASS.** The pending migration rejects cross-owner collisions, preserves every legacy contact before
  rewriting the five scalar fields, and its final null-safe predicate compares all five scalar values with the
  canonical primary phone/email. It therefore converges the saved named-DEV mismatch classes and cannot pass with
  remaining legacy/canonical disagreement.
- **MF2 → PASS.** The recreated `app.read_current_patient_identity_contacts()` reads phone and email only from
  primary `public.user_contacts`; production TypeScript has 0 direct `platformUsers` legacy-contact field reads.
- **MF3 → PASS.** Inspection of the final physical-reference proof shows qualified-column, table-alias and
  `%ROWTYPE`-alias binding to `platform_users`; canonical/derived aliases are not candidates and cannot self-match.
  Existing migration parser/order tests pass 22/22; no source-string test was added.
- **MF4 → PASS.** Trusted resolution accepts any confirmed canonical phone without requiring `is_primary`; the
  saved webapp and integrator behavior suites exercise confirmed non-primary resolution successfully.
- **MF5 → PASS.** The saved targeted integrator suite passes 3/3 files and 40/40 tests on the final head and uses the
  canonical contacts model used by production.
- **MF6 → PASS.** Manual merge promotes transferred contacts without changing `confirmed_at` or `source_origin`;
  the OAuth-provenance test and the existing medical-history conflict, one-sided-history and visit-transfer tests
  all pass.

## Commands and exit codes

```bash
bash apps/webapp/scripts/check-drizzle-migration-order.sh &&
node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test &&
node scripts/check-migration-privileges.mjs &&
node scripts/check-migration-privileges.mjs --self-test &&
node scripts/check-c4-migration-owned-function-bodies.mjs &&
node --test deploy/postgres/privileges/migration-order.test.mjs
```

Exit `0`: transaction-safe timestamp ordering and applied/pending selection pass; migration privilege check and
self-test pass; owner/body gate passes; migration-order/parser suite passes 22/22. This covers owner markers and
the prohibition on `GRANT`/`REVOKE`/policy/access DDL in migrations.

```bash
node deploy/postgres/privileges/generate-cli.mjs --check &&
node --test deploy/postgres/privileges/function-census.test.mjs &&
node scripts/check-no-new-raw-sql.mjs &&
node scripts/check-db-chokepoint.mjs &&
node scripts/check-webapp-infra-import-boundary.mjs &&
node scripts/check-webapp-infra-import-boundary.mjs --self-test &&
git diff --check eff0ca9b3..HEAD
```

Exit `0`: all four generated DEV/TEST privilege/allowlist artifacts are byte-identical; function census passes
19/19; raw-SQL, DB chokepoint, infra-boundary and diff checks pass.

```bash
pnpm --dir apps/webapp exec vitest run --project unit \
  src/infra/repos/userContactsSql.unit.test.ts \
  src/infra/repos/d15b5FioDualWriteGaps.unit.test.ts \
  src/infra/repos/d15b6DoctorClientCreateRace.unit.test.ts \
  src/infra/repos/d15b6PhoneMessengerBindMirror.unit.test.ts \
  src/infra/repos/pgCanonicalPlatformUser.unit.test.ts \
  src/modules/auth/oauthWebLoginResolve.unit.test.ts \
  src/modules/auth/oauthVkResolve.unit.test.ts \
  src/modules/auth/emailOtpPublic.unit.test.ts \
  src/infra/accountMergeMedicalHistory.unit.test.ts --reporter dot
```

Exit `0`: 9/9 files, 46/46 tests.

```bash
pnpm --dir apps/integrator exec vitest run \
  src/infra/db/messengerPhonePublicBind0380.unit.test.ts \
  src/infra/db/userUpsert.identity.test.ts \
  src/infra/adapters/deliveryTargetsPort.test.ts --reporter dot
```

Exit `0`: 3/3 files, 40/40 tests.

```bash
pnpm --dir packages/platform-merge run build &&
pnpm --dir packages/operator-db-schema run build &&
pnpm --dir packages/db-principal run build &&
pnpm --dir packages/error-tracking run build &&
pnpm --dir apps/integrator typecheck &&
pnpm --dir apps/webapp typecheck
```

Exit `0`: all package builds and both strict TypeScript checks pass.

```bash
mapfile -t changed_sources < <(git diff --diff-filter=ACMRT --name-only eff0ca9b3..HEAD -- '*.ts' '*.tsx' '*.mjs')
pnpm exec eslint --no-warn-ignored "${changed_sources[@]}"
```

Exit `0`: scoped lint passes for every changed source file still present on the final head.

```bash
rg -n 'platformUsers\.(phoneNormalized|phoneConfirmedAt|emailNormalized|emailVerifiedAt|email)' \
  apps/integrator/src apps/webapp/src packages/platform-merge/src --glob '!*.test.*' | wc -l
rg -n 'mutateCanonicalUserContacts\(' \
  apps/integrator/src apps/webapp/src packages/platform-merge/src --glob '!*.test.*' | wc -l
rg -Ul '(INSERT[[:space:]]+INTO|UPDATE|DELETE[[:space:]]+FROM)[[:space:]]+public\.user_contacts' \
  apps/integrator/src apps/webapp/src packages/platform-merge/src --glob '!*.test.*' | wc -l
```

Exit `0`; outputs `0`, `7` (one definition plus six production callers), and `1` physical DML file respectively.

The migration remains pending. This acceptance did not apply a migration, access or mutate DEV/TEST/PROD data,
create fixtures or a disposable database, reconcile data, deploy, push, or run full CI.
