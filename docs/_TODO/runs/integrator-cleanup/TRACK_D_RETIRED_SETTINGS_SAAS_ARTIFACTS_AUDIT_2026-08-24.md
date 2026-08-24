# Track D — retired settings roots in active SaaS artifacts: independent audit

**Verdict: FAIL**

Candidate inspected: `a9f73e9e617c1629718e2f4b15d5eccb331abe49`
(`fix(saas): retire settings mirror from audit artifacts #987`).

## Authority and audit method

- `AGENTS.md` §4 requires the sole settings store to be
  `public.system_settings`, with no mirror or second table. Global rows are
  defaults and non-null `organization_id` rows are organization overrides.
- Per `AGENTS.md` §10a, §10b and §24.4, this is predominantly a one-off
  artifact-removal audit: final-diff reading, generator/consumer tracing,
  exact searches, and existing executable checks were used. No source-text
  test was added and no fault injection or product edit was made.
- `AGENTS.md` §1's schema-B contract makes
  `deploy/postgres/generated/prod-to-target/schema-pre.sql` and
  `schema-post.sql` active inputs to the A→B cutover, not historical
  migration-chain evidence.

## Candidate diff — complete classification

The complete candidate diff (`git diff --find-renames --find-copies
a9f73e9e^ a9f73e9e --`) changes 15 files:

| Class | Files | Audit result |
| --- | --- | --- |
| Current taxonomy input | `docs/_TODO/SAAS_FOUNDATION/scope-derivation/tiers-218.tsv` | Removes both retired BOOTSTRAP rows. |
| Active generator/checker source | `check-p0-5-role-split.mjs`, `check-p0-8-rls-descriptors.mjs`, `check-p0-9-enforce-descriptors.mjs`, `check-s5-2-settings-security.mjs`, `check-saas-d3-4-bootstrap-base-login-grants.mjs`, `p0-5-role-split-sql.mjs`, `p0-5b-grants-sql.mjs`, `p0-9-enforce-descriptors.mjs`, `phase4-locked-policy-artifact.mjs`, `rls-descriptor-model.mjs`, `rls-sql-renderer.mjs`, `s5-config-reader-sql.mjs`, `u9a-platform-settings-role-sql.mjs` | The retired-specific descriptor, policy, grant, and checker branches are removed; named checks pass. |
| Current generated output | `deploy/postgres/p0-5b-grants.sql` | Generated from `p0-5b-grants-sql.mjs`; exact byte check passes. |

`git diff --check a9f73e9e^ a9f73e9e` exited 0. The candidate changes no
product runtime, schema definition, migration, domain/environment file,
deployment wrapper, or live database action. It creates no compatibility
relation, alias, or second write path.

## Active reference inventory and consumer trace

Exact active-code search:

```bash
rg -l --glob '*.{mjs,js,ts,tsx,sh,sql}' \
  --glob '!apps/webapp/db/drizzle-migrations/**' \
  --glob '!deploy/postgres/generated/prod-to-target/schema-*.sql' \
  --glob '!**/*.test.*' \
  'public\\.app_runtime_settings(_audit)?|\\bapp_runtime_settings(_audit)?\\b' \
  apps packages deploy scripts docs/_TODO/SAAS_FOUNDATION/scripts | sort
```

returned no paths: the edited active SaaS generators/checkers no longer model
the retired tables. Historical migrations, archived plans, and evidence were
not changed.

The exclusion is material, not a claim that the snapshots are harmless:

```bash
rg -c 'app_runtime_settings(_audit)?' \
  deploy/postgres/generated/prod-to-target/schema-pre.sql \
  deploy/postgres/generated/prod-to-target/schema-post.sql
```

returned `schema-pre.sql:43` and `schema-post.sql:47`. `schema-pre.sql`
creates both relations; `schema-post.sql` installs their constraints, indexes,
RLS and policies.

These files are reachable. `deploy/postgres/prod-to-target-cutover.sql`
includes `schema-pre.sql` in P02 and `schema-post.sql` in P06, and
`deploy/host/deploy-test-saas.sh` runs that cutover as its “single PROD-dump ->
current DEV schema migration”. The same wrapper explicitly says historical
webapp/integrator migration runners are not invoked. Therefore this is not a
past snapshot that can be ignored: a reachable TEST full-reset installs the
two retired tables and their policies, while no forward runner executes the
retirement migration afterwards.

The current snapshot producer confirms the intended contract and exposes a
second blocking signal:

```bash
pnpm run check:prod-to-target-cutover
```

exited 1 before dumping, with:

```text
DEV migration ledger is not current: pending=...,
20260824T120000_make_system_settings_single_root
```

Thus the checked-in snapshots cannot presently be proved byte-synchronised to
the named DEV schema, and their existing retired-relation SQL remains an
active cutover input.

### Finding F-1 — active cutover recreates the deliberately retired settings roots

**Violated requirement:** the implementation brief requires both retired
relations to no longer participate in current checked-in SQL/executable
artifacts; `AGENTS.md` §4 permits only `public.system_settings` as settings
storage.

**Reachable scenario:** a TEST full reset follows `deploy-test-saas.sh` →
`prod-to-target-cutover.sql` → `schema-pre.sql`/`schema-post.sql`. The latter
still create and configure `public.app_runtime_settings` and
`public.app_runtime_settings_audit`; the wrapper deliberately does not invoke
the migration runner that would remove them.

**Impact:** the reset target again has a second settings relation and audit
surface, contradicting the single-root boundary. The now-green SaaS audit does
not cover this cutover artifact, so it can report success while the reachable
reset path provisions the retired roots.

## Canonical-boundary preservation in the candidate's active generators

The non-snapshot SaaS artifacts retain the canonical boundary:

- `tiers-218.tsv` names `public.system_settings` and
  `public.system_settings_audit` as BOOTSTRAP; the RLS descriptor model assigns
  only these two to `bootstrap_hybrid`. P0.9's check confirms the resulting
  global-or-matching-organization predicate, rather than a generic
  `bootstrap_global_read` allow-all descriptor.
- P0.5/S5 generated SQL revokes both canonical tables from `PUBLIC`,
  `app_patient`, and `app_runtime_nonstaff_login`; patients/nonstaff therefore
  have no direct settings or audit access through this artifact.
- The staff surface is still derived from the current tier/declaration model.
  S5 grants `app_config_reader` SELECT only on `public.system_settings`, no
  DML or canonical-audit access, and requires the reader not be a member of
  staff or patient. U9A grants `app_platform_settings` canonical settings DML
  and canonical-audit INSERT, with `organization_id IS NULL` policies.

The P0.5, P0.8, P0.9, S5, D3.4 and Phase-4 checks below all passed, so this
finding is the unchanged active cutover snapshot, not a weakened replacement
inside the candidate's simplified SaaS generators.

## Executed evidence

| Command | Result |
| --- | --- |
| `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-5-role-split.mjs` | PASS |
| `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-8-rls-descriptors.mjs` | PASS |
| `node docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-9-enforce-descriptors.mjs` | PASS |
| `node docs/_TODO/SAAS_FOUNDATION/scripts/check-s5-2-settings-security.mjs` | PASS |
| `node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-d3-4-bootstrap-base-login-grants.mjs` | PASS |
| `node docs/_TODO/SAAS_FOUNDATION/scripts/check-phase4-locked-policy-artifact.mjs` | PASS |
| `cmp -s <(node docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs) deploy/postgres/p0-5b-grants.sql` | PASS |
| `cmp -s <(node docs/_TODO/SAAS_FOUNDATION/scripts/s5-config-reader-sql.mjs) deploy/postgres/s5-config-reader-runtime.sql` | PASS |
| `cmp -s <(node docs/_TODO/SAAS_FOUNDATION/scripts/u9a-platform-settings-role-sql.mjs) deploy/postgres/u9a-platform-settings-role.sql` | PASS |
| `cmp -s <(node docs/_TODO/SAAS_FOUNDATION/scripts/phase4-locked-policy-artifact.mjs) deploy/postgres/phase4-locked-helper-rls-policies.sql` | PASS |
| `pnpm run check:prod-to-target-cutover` | **FAIL** — named DEV has five pending forward migrations, including the retirement migration; no byte-sync proof is possible. |
| `pnpm run audit` | PASS — P0.10 tier completeness and all current SaaS audit stages are green, but this command does not make the snapshot path unreachable or synchronized. |

No temporary fault injection, acceptance test, product change, migration,
schema action, database action, or deployment action remains from this audit.
