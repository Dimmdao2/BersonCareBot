# Runtime-overlay current-state audit — 2026-09-02

Candidate: `95e315101`
Authority: owner task `#1085`; `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md`;
`docs/OWNER_DECISIONS.md` § «Права БД, роли и стены» and § «B0 вместо исторической цепочки миграций»;
`docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md`;
`docs/_TODO/SAAS_FOUNDATION/SAAS_DEPLOY_SEQUENCE.md`.

No PROD command, full reset, service stop, destructive DB action, or full CI was run in this audit.

## Test-or-view classification

1. Reachable `\\ir` and file-list closure completeness — **view** for the complete call graph and resolved paths;
   **test** for the repeatable fail-closed preflight behavior.
2. No historical body replay or current-definition downgrade — **view** of the candidate diff, wrapper call graph,
   runtime-overlay list, and SQL bodies.
3. No live-row loss after removing quarantine/replay — **view** of the removed steps and every remaining closure
   step for constraint/data churn.
4. Retained E1 ownership/ACL responsibility and current A→B object existence — **view** of E1 SQL, generated
   snapshot, declaration/current owner contracts, and resolved object references.
5. Future missing overlay/root oracle — **test**, with one fault injection for each independent fault class.
6. Retired `app_owner` compatibility and first reachable failure — **view** against
   `docs/REPORTS/AUDIT_APPOWNER_2026-08-20.md` and current closure/SQL, not the historical report narrative.
7. Candidate diff and narrow host/deploy checks — **view** plus targeted test/syntax commands.

## Blind kill-set (written before opening deploy host tests)

| ID | Authority-derived fault | Required oracle |
| --- | --- | --- |
| K1 | A full-reset root file named by the public wrapper is absent. | Public preflight exits non-zero before the first stop/drop/restore action and identifies the missing root. |
| K2 | A file named only by the sourced runtime-overlay list is absent. | The same preflight exits non-zero before destructive work and identifies the missing nested overlay. |
| K3 | A retired historical overlay/body remains reachable after writers stop and recreates or replaces a current B object. | Complete call-graph inspection finds no such reachable replay; current definitions are not downgraded. |
| K4 | Removing replay also removes the only protection around historical constraint churn, allowing live-row loss. | No remaining reachable step performs that historical constraint drop/recreate/data-quarantine sequence. |
| K5 | Retained E1 SQL references an object absent from the generated B snapshot or grants/owns more than current E1 telemetry responsibilities. | Every referenced relation/function/type resolves in B and E1 stays within current ownership/ACL scope. |
| K6 | The closure still requires, elevates, owns through, or transfers to retired `app_owner`. | Current reachable closure preserves `NOLOGIN NOBYPASSRLS NOINHERIT`, zero members/owned objects, and uses current seam owners. |
| K7 | The automated oracle validates only the former first missing files, while another reachable root/list entry is missing. | Oracle walks the whole current closure, including sourced lists and `\\ir` descendants, not a frozen keep-set. |

## Results

**Overall acceptance: FAIL.** Candidate `95e315101` correctly removes the 13 deleted migration includes,
the sibling historical include, and their quarantine wrapper from E1, but it does not close the current
full-reset/runtime-overlay boundary. The default full-reset execution does not call the strict runtime-overlay
closure at all. If that closure is called directly, its first overlay fails against retired `app_owner`; the
remaining list also contains 44 post-snapshot object-body statements, and E1 finally transfers current functions
back to `app_owner`.

The current branch HEAD during the audit was `dc736c41c`; the audited target files are unchanged from candidate
`95e315101` at that HEAD.

| Requirement | Result | Evidence |
| --- | --- | --- |
| 1. No missing reachable `\\ir`/list target | **PASS** for path resolution | One-off recursive resolution of the three engine roots plus every entry in both runtime arrays found no missing root, list entry, or descendant include. The actual reachability discrepancy is finding F1. |
| 2. No retired body replay/current-definition downgrade | **FAIL** | E1 no longer contains executable `\\ir`, but eight retained list entries contain 44 post-snapshot body statements: 42 functions and two `CREATE TABLE IF NOT EXISTS` statements. These execute after schema B and are not current-state ACL-only repair. |
| 3. Quarantine/replay removal cannot lose live rows | **PASS** | The removed quarantine only surrounded the removed historical constraint sequence. Current E1 has no top-level DML, quarantine, or constraint churn; the complete retained overlay list has `quarantine=0`, `truncate=0`, `constraint_churn=0`. Ten textual `DELETE` statements found in two overlays are inside recreated function bodies, not deploy-time DML. |
| 4. E1 is current ownership/ACL only and every object exists in A→B | **FAIL** | Snapshot resolution passes (`29/29` public relations and `16/16` app functions found), but E1 grants broad relations to and transfers 14 functions to retired `app_owner`. Current function census/declaration assigns those responsibilities to narrow seam owners. |
| 5. Preflight/oracle catches a future missing root and list overlay | **PASS** for the two repeatable path fault classes | Root injection and list-entry injection each made the path test exit `1` with `2 pass / 1 fail`; both files were restored. The green oracle alone does not prove runtime reachability (F1). |
| 6. Closure is compatible with retired `app_owner` | **FAIL** | The first list entry requires `app_owner` to have `BYPASSRLS`; current contract requires `NOBYPASSRLS`. Nine listed SQL files depend directly on `app_owner`, one depends indirectly, and E1 restores `app_owner` ownership. |
| 7. Candidate readiness for authorized rehearsal | **FAIL** | Targeted tests and syntax checks pass, but F1–F3 are deterministic blockers inside the requested acceptance boundary. No full reset was run. |

## Findings

### F1 — MUST FIX — public full-reset bypasses the claimed runtime-overlay closure

The public wrapper runs the same-checkout cutover preflight and then execs `deploy-test-saas.sh`. The engine stops
writers and applies A→B, but its default path then calls `run_port_context_test_release`, which runs
`cutover-postgres-port-context.sh` and declaration reconciliation. `run_strict_post_migration_closure` is reached
only by the separate `--post-migration-closure` mode. Therefore the candidate's added E1 readability check and the
path test's synthetic E1 root do not mean E1 or either runtime array is executed by the owner-authorized default
full-reset.

Reachable consequence: the rehearsal can report success without exercising the closure whose defect task #1085
is intended to accept. Conversely, wiring that closure into the default path exposes F2 immediately.

### F2 — MUST FIX — the intended closure fails at its first overlay under the retired role contract

The first exact reachable SQL failure is
`deploy/postgres/organization-member-invites-rls.sql:72-86`. Its prerequisite requires role `app_owner` to be
`NOLOGIN BYPASSRLS`; the current contract is `NOLOGIN NOBYPASSRLS NOINHERIT`, zero members, zero DB-local objects.
The file emits a fatal message and then executes `SELECT 1/0` before applying its overlay.

Direct `app_owner` dependencies in the ordered closure are:

- `deploy/postgres/organization-member-invites-rls.sql`
- `deploy/postgres/patient-invites-rls.sql`
- `deploy/postgres/specialist-signup-public-bootstrap-rls.sql`
- `deploy/postgres/specialist-owner-provisioning-rls.sql`
- `deploy/postgres/patient-web-push-vapid-public-key-accessor.sql`
- `deploy/postgres/public-booking-bootstrap-resolver.sql`
- `deploy/postgres/public-clinic-slug-bootstrap-resolver.sql`
- `deploy/postgres/c5a-platform-operations-runtime.sql`
- `deploy/postgres/e1-webapp-runtime-config.sql`

`deploy/postgres/reference-catalog-rls.sql` is additionally dependent through the provisioning owner derived from
the retired specialist-owner overlay. E1 itself grants tables to `app_owner`, performs 14 `ALTER FUNCTION ...
OWNER TO app_owner` statements, and postchecks that retired ownership. This contradicts the same engine's later
assertions that `app_owner` owns no functions and that current definers use the declared narrow seam owners.

### F3 — MUST FIX — historical object-body replay remains outside E1

Removing E1's 13 migration includes does not remove body replay from the full runtime list. Eight retained files
contain 44 `CREATE [OR REPLACE] FUNCTION` / `CREATE TABLE IF NOT EXISTS` statements after the generated A→B
snapshot:

| File | Body statements |
| --- | ---: |
| `organization-member-invites-rls.sql` | 19 |
| `store-p0-entitlements-rls.sql` | 2 |
| `specialist-signup-public-bootstrap-rls.sql` | 15 |
| `specialist-owner-provisioning-rls.sql` | 2 |
| `c5a-platform-operations-runtime.sql` | 2 |
| `patient-web-push-vapid-public-key-accessor.sql` | 1 |
| `public-booking-bootstrap-resolver.sql` | 1 |
| `public-clinic-slug-bootstrap-resolver.sql` | 2 |

This violates the current-state boundary independently of whether a body happens to match today: `CREATE OR
REPLACE` can overwrite the generated B definition, while plain `CREATE FUNCTION` is a deterministic duplicate
failure when the B snapshot already contains that signature.

## Systemic correction boundary

No product/deploy correction was made by this audit. The acceptance boundary that must be corrected is:

1. choose one real public full-reset post-migration access closure and make the wrapper call graph and its oracle
   describe that same path;
2. remove post-snapshot schema/function/table body replay from the runtime lists; schema B plus active forward
   migrations remain the object-definition authority;
3. migrate the nine direct and one indirect `app_owner` dependencies above to current declarations and narrow
   seam owners, including E1's 14 ownership transfers and its stale postcheck;
4. retain only current ownership/ACL reconciliation whose referenced objects exist in the generated A→B snapshot;
5. preserve the current engine assertions: retired `app_owner`, current seam owners, and generated declaration
   reconciliation.

This is the systemic boundary implied by the two possible executions: the actual default path silently skips the
claimed closure, while the intended strict path fails before its first overlay and would later replay bodies and
restore retired ownership.

## Fault injections

Both injections were temporary filesystem moves followed by the existing targeted test. Restoration was done in
the same foreground shell; the final tracked diff contains neither injection.

Root-file class:

```bash
fault_dir="$(mktemp -d /tmp/bcb-runtime-overlay-injection.XXXXXX)"
mv deploy/postgres/e1-webapp-runtime-config.sql "$fault_dir/e1-webapp-runtime-config.sql"
node --test deploy/host/prod-to-target-cutover-path-resolvable.test.mjs
mv "$fault_dir/e1-webapp-runtime-config.sql" deploy/postgres/e1-webapp-runtime-config.sql
rmdir "$fault_dir"
```

Result: `ROOT_INJECTION_EXIT=1`; `2` passed, `1` failed. The failed subtest named the absent E1 path.

Sourced-list-entry class:

```bash
fault_dir="$(mktemp -d /tmp/bcb-runtime-overlay-injection.XXXXXX)"
mv deploy/postgres/organization-member-invites-rls.sql "$fault_dir/organization-member-invites-rls.sql"
node --test deploy/host/prod-to-target-cutover-path-resolvable.test.mjs
mv "$fault_dir/organization-member-invites-rls.sql" deploy/postgres/organization-member-invites-rls.sql
rmdir "$fault_dir"
```

Result: `LIST_INJECTION_EXIT=1`; `2` passed, `1` failed. The failed subtest named the absent list entry.

No new permanent test was added. Under §10a/§10b, F1–F3 are current wiring/SQL contract defects with loud,
deterministic failures or direct call-graph evidence; a source-text assertion would not be a behavioral oracle.
The existing path test already detects the two repeatable missing-file classes required here.

## Exact validation commands

Targeted host/deploy tests:

```bash
node --test deploy/host/deploy-test-full-reset.test.mjs deploy/host/prod-to-target-cutover-path-resolvable.test.mjs
```

Result: **PASS**, `7/7` tests.

Shell and Node syntax:

```bash
bash -n deploy/host/deploy-test-full-reset.sh deploy/host/deploy-test-saas.sh deploy/host/runtime-overlay-rehydrate-lib.sh deploy/host/cutover-postgres-port-context.sh
node --check deploy/host/prod-to-target-cutover-path-resolvable.test.mjs
```

Result: **PASS**.

Candidate replay inspection:

```bash
rg -n '^[[:space:]]*(DELETE|INSERT|UPDATE|TRUNCATE|ALTER[[:space:]]+TABLE.*(ADD|DROP|VALIDATE)[[:space:]]+CONSTRAINT)' deploy/postgres/e1-webapp-runtime-config.sql
rg -n -F '\ir ' deploy/postgres/e1-webapp-runtime-config.sql
git diff 95e315101^ 95e315101 -- deploy/postgres/e1-webapp-runtime-config.sql | rg -n -F '\ir '
```

Result: current E1 DML/constraint and executable-include searches returned no match; the candidate diff listed
exactly the removed 13 migration includes plus the removed sibling include.

E1 retired ownership transfers:

```bash
rg -c '^ALTER FUNCTION .* OWNER TO app_owner;$' deploy/postgres/e1-webapp-runtime-config.sql
```

Result: `14`.

Direct retired-role dependency scan:

```bash
rg -l "^[[:space:]]*(GRANT|REVOKE|ALTER[[:space:]]+FUNCTION|SET[[:space:]]+ROLE).*app_owner|rolname[[:space:]]*=[[:space:]]*'app_owner'" \
  deploy/postgres/organization-member-invites-rls.sql \
  deploy/postgres/patient-invites-rls.sql \
  deploy/postgres/store-p0-entitlements-rls.sql \
  deploy/postgres/patient-course-assignment-wall.sql \
  deploy/postgres/patient-support-mark-read-grant.sql \
  deploy/postgres/patient-write-grants-role-pool-mismatch.sql \
  deploy/postgres/specialist-signup-public-bootstrap-rls.sql \
  deploy/postgres/specialist-owner-provisioning-rls.sql \
  deploy/postgres/u9a-platform-settings-role.sql \
  deploy/postgres/c5a-platform-operations-runtime.sql \
  deploy/postgres/reference-catalog-rls.sql \
  deploy/postgres/patient-visible-catalog-rls.sql \
  deploy/postgres/patient-web-push-vapid-public-key-accessor.sql \
  deploy/postgres/public-booking-bootstrap-resolver.sql \
  deploy/postgres/public-clinic-slug-bootstrap-resolver.sql \
  deploy/postgres/e1-webapp-runtime-config.sql | sort
```

Result: the nine direct files enumerated in F2. The indirect `reference-catalog-rls.sql` dependency was established
by following its `provisioning_owner` lookup to the specialist-owner overlay.

Post-snapshot object-body count:

```bash
rg -n '^CREATE(?: OR REPLACE)? (?:FUNCTION|PROCEDURE|TABLE|VIEW|MATERIALIZED VIEW)' \
  deploy/postgres/organization-member-invites-rls.sql \
  deploy/postgres/store-p0-entitlements-rls.sql \
  deploy/postgres/specialist-signup-public-bootstrap-rls.sql \
  deploy/postgres/specialist-owner-provisioning-rls.sql \
  deploy/postgres/c5a-platform-operations-runtime.sql \
  deploy/postgres/patient-web-push-vapid-public-key-accessor.sql \
  deploy/postgres/public-booking-bootstrap-resolver.sql \
  deploy/postgres/public-clinic-slug-bootstrap-resolver.sql
```

Result: `44` statements in the eight files enumerated in F3.

Generated-snapshot object check used this read-only command over E1 plus the two generated snapshot halves:

```bash
node <<'NODE'
const fs = require('fs');
const e1 = fs.readFileSync('deploy/postgres/e1-webapp-runtime-config.sql', 'utf8');
const schema = [
  'deploy/postgres/generated/prod-to-target/schema-pre.sql',
  'deploy/postgres/generated/prod-to-target/schema-post.sql',
].map((path) => fs.readFileSync(path, 'utf8')).join('\n');
const unique = (values) => [...new Set(values)].sort();
const relations = unique([...e1.matchAll(/\bpublic\.([a-z][a-z0-9_]*)\b/g)].map((match) => match[1]));
const functions = unique([...e1.matchAll(/\bapp\.([a-z][a-z0-9_]*)\s*\(/g)].map((match) => match[1]));
const presentRelations = relations.filter((name) =>
  new RegExp(`CREATE (?:TABLE|VIEW|MATERIALIZED VIEW) (?:IF NOT EXISTS )?public\\.${name}\\b`, 'i').test(schema));
const missingFunctions = functions.filter((name) =>
  !new RegExp(`CREATE (?:OR REPLACE )?FUNCTION app\\.${name}\\s*\\(`, 'i').test(schema));
console.log(`e1_public_refs=${relations.length}`);
console.log(`e1_public_relations_found=${presentRelations.length}`);
console.log(`e1_public_refs_missing=${relations.length - presentRelations.length}`);
console.log(`e1_app_function_refs=${functions.length}`);
console.log(`e1_app_functions_found=${functions.length - missingFunctions.length}`);
console.log(`e1_app_functions_missing=${missingFunctions.length}`);
NODE
```

It printed:

```text
e1_public_refs=29
e1_public_relations_found=29
e1_public_refs_missing=0
e1_app_function_refs=16
e1_app_functions_found=16
e1_app_functions_missing=0
```

No live database check was needed: the first failures are fully determined by the current call graph, SQL role
precondition, and generated snapshot. No PROD access, service action, destructive database action, or full CI
occurred.
