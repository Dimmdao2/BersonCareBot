# Independent audit: same-organization custom-host reclaim (#787)

Candidate: `21da71e0509ce0b96f0018cad5aee593726ba759` (`git rev-parse HEAD`); product commit `7f277383a2d548ead1ed94cc3809f4d40a3edbb5`.
Authority: `/home/dev/dev-projects/BersonCareBot/.lead/briefs/custom-domain-same-org-reclaim-worker-20260910.md` and the audit brief. Independent oracle: “the registry must remember whose address it was; that same organization can return to its own address, while every other organization remains blocked”.

## Blind kill-set and method (recorded before reading existing tests)

TEST means repeatable security behavior eligible for existing behavior proof; VIEW includes one-time rollback runtime inspection where a permanent test would cost more than its signal. No new permanent test is justified by a loud reclaim refusal.

| ID | Method | Deliberate failure / required observable consequence |
| --- | --- | --- |
| K1 | VIEW | Restore unconditional quarantine refusal: A claims H, clears H, then cannot reclaim exact H. Inspect successful pending result, preserved owner and cleared readiness/activation in rollback runtime. |
| K2 | TEST | Remove owner comparison on quarantine reclaim: B captures A's remembered H. Oracle above; costly silent consequence is tenant address capture. Observe denial and unchanged owner/row through real DB boundary. |
| K3 | VIEW | Fail to quarantine A's current live H2 before reclaiming H: refusal, duplicate live bindings or loss of H2 on failed reclaim. Observe atomic pending H / quarantined H2 and rollback on rejection. |
| K4 | TEST | Treat null/deleted owner as current owner: an orphan hostname is captured. Oracle above; costly silent consequence is routing a former clinic address to another clinic. Observe refusal without row retarget. |
| K5 | TEST | Trust caller organization/hostname/readiness or bypass accepted staff context: unauthorized tenant/active binding appears. Observe rejection through existing staff intent boundary. |
| K6 | VIEW | Remove organization serialization, global case-insensitive uniqueness or immutable ownership: conflicting claims can produce multiple live owners. Inspect locks, constraints and trigger plus rollback runtime rejection; no persistent concurrency fixture. |
| K7 | TEST | Reclaim returns active/stale activation without verifier: unverified address becomes routable. Observe pending result and no active projection. |
| K8 | VIEW | Migration uses wrong owner, omits body privileges, adds ACL, fails repeat execution or rollback preflight. Inspect declaration/generated grants and exact candidate owner-aware DEV preflight, with no ledger/apply. |
| K9 | VIEW | Active prose retains blanket same-owner prohibition or code creates another staff door. Inspect active contract/port/schema and repository path; preserve historical evidence. |

Execution plan: inspect active authority/code/privileges and canonical runtime tooling; reuse existing behavior proof where useful; execute bounded rollback-only evidence and targeted gates; record caught/missed classes and verdict; commit only audit/acceptance artifacts. No full CI, TEST/PROD, migration apply, server or provider action.

## Verdict: PASS for land

No reachable in-scope product defect was found in the exact candidate. This is not deployed DEV/TEST acceptance. The candidate function is still absent from live DEV after the probe; the forward migration was not applied. No full CI, TEST/PROD, DNS/TLS, Next server, provider call or persistent fixture was used. No product file or existing test was changed.

### Results by requirement

| ID | Result | Evidence |
| --- | --- | --- |
| K1 | PASS | Real SQL intent: claim → clear → exact uppercase-normalized reclaim returns the original row/owner as pending. |
| K2 | PASS | A's quarantined row rejects a different accepted organization UUID with `hostname_taken`; the full row is unchanged. Removing the owner predicate makes K2 false. |
| K3 | PASS | A's live `app.second-reclaim-audit.example.test` is quarantined and original H becomes the sole live pending row. Refused orphan reclaim preserves that live row. The function's exception block encloses retirement and insert/update, so unique-violation recovery rolls retirement back as well. |
| K4 | PASS | Null-owner quarantine refuses reclaim and remains null/quarantined. Replacing `IS DISTINCT FROM` with null-unsafe `<>` makes K4 false. Deleted-owner behavior follows the unchanged `ON DELETE SET NULL` FK into the same null branch. |
| K5 | PASS | Wrong accepted typed arguments, spoofed organization and absent context reject under `app_staff`; direct INSERT/UPDATE privileges are absent. SQL signature has no hostname/readiness arguments. Gate removal and organization-check removal each make the matching assertion false. Repository/service still feed the same named root and derive fixed `app.` placement. |
| K6 | PASS (VIEW) | Same-organization advisory transaction lock precedes current-row locking; global target is locked before retirement. Unconditional unique `lower(hostname)` and partial unique live organization indexes remain; actual duplicate hostname/live-org inserts fail. Seam owner has no UPDATE privilege on `organization_id`; staff has no table mutation privilege. No parallel-session stress run is claimed. |
| K7 | PASS | Reclaimed row is pending with null reason/activation. Forced active reclaim makes K7 false. Existing active-only hostname resolver/projection and verifier transition path are unchanged; pending bindings cannot activate via staff intent. |
| K8 | PASS | Canonical generator/static gates and exact candidate owner-aware preflight pass. Runtime probe executes the candidate migration body repeatedly as its declared owner, with generated target privileges and FORCE RLS, then rolls back. |
| K9 | PASS | B2 active contract, schema and port comments now allow only original-owner reclaim; service/repository have no new write door. Historical migrations/audits are unchanged. Inspected service unit and repository DEV proof contain no superseded same-owner prohibition requiring removal. |

### Runtime method and fault injection

Command executed from the candidate checkout: `node /tmp/reclaim-audit-probe.mjs` (exit success). Exact script retained as `AUDIT_SAME_ORG_CUSTOM_DOMAIN_RECLAIM_2026-09-10.probe.mjs`; it is a candidate-pinned one-time audit artifact, not a permanent suite/CI test. Copy it to the named temporary path to reproduce from this candidate checkout. Its baseline assertions must all be true, and every injected class must make its named oracle false; an escaped mutation exits unsuccessfully.

The probe uses only the canonical local administrator socket for `bcb_webapp_dev`. It installs a transaction-local accepted context using the existing `accepted_port_contexts` proof pattern, then executes the actual function as `app_staff` → SECURITY DEFINER `app_seam_custom_domain_owner`. It loads owner schema access and the exact binding-table/function ACL from the candidate generator. No hand-added table permission masks missing body access. Data setup uses an existing DEV organization/member and its opaque identity mapping; B is a distinct UUID in the accepted context. This isolates the intent-door rule and does not claim a real second-tenant login/membership or TLS authentication proof. Initial harness setup attempts failed on organization reference-catalog seeding and opaque actor mapping; both transactions aborted. The final harness uses no synthetic organization creation and resolves the proper opaque actor reference.

Caught classes (`rg '^CAUGHT ' /tmp/reclaim-audit-probe.log`):

```text
CAUGHT K2-owner -> K2=false
CAUGHT K4-null -> K4=false
CAUGHT K5-context -> K5-context=false
CAUGHT K5-org -> K5-org=false
CAUGHT K7-activation -> K7=false
```

Missed injected classes: none (the script asserts each listed oracle becomes false). K1/K3/K6/K8/K9 were classified VIEW, not counted as mutation-tested classes. Existing repository DEV proof only covers ordinary save and spoofed organization, not reclaim; no claim is made that CI protects the new reclaim behavior. A permanent test would require maintaining candidate/accepted-context setup; the authorized one-time rollback probe is the cheaper honest evidence here (§10a cost rule).

### Privilege analysis

`20260910T023451_allow_same_org_custom_domain_reclaim.sql` replaces/comments only `app.save_custom_domain_binding_intent(text,uuid,text,text)`. No new table, index, role, signature, function OID replacement or runtime endpoint is introduced. It executes as `app_seam_custom_domain_owner`, SECURITY DEFINER, with `search_path=pg_catalog`. Caller EXECUTE remains limited to `app_staff` by the generated declaration.

The body needs SELECT on every binding column (`SELECT *`/`RETURNING *`), row-lock-compatible UPDATE access, INSERT on explicitly named intent/creator columns, and UPDATE on `base_domain`, `placement`, `subdomain_label`, `hostname`, `status`, `status_reason`, `activated_at`, `updated_at`. The declaration and generated DEV/TEST artifacts include these exact writes. Column UPDATE is sufficient for these PostgreSQL row locks, as demonstrated by the real restricted-owner execution. `organization_id`, identity, creator and creation timestamp receive no new UPDATE authority. Existing helper EXECUTE/schema access and FORCE RLS seam policies let the body run while staff direct writes stay denied. Reconcile remains the only ACL source; migration contains no ACL statement.

Owner/verify/schema/language markers are present. CREATE OR REPLACE and COMMENT are reapplicable; the runtime probe executes the body twice as the declared owner before exercising it. The canonical preflight separately validates the actual owner-ordered runner and explicitly rolls back without recording the candidate migration.

### Commands and validation limits

- `node deploy/postgres/privileges/generate-cli.mjs --check` — PASS, generated privilege/allowlist parity.
- `node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only` — PASS.
- `node deploy/postgres/privileges/generate-cli.mjs --gaps` — PASS, reported `gaps=0` for each declared target; this renders declarations and does not connect to TEST.
- `node deploy/postgres/privileges/generate-cli.mjs --census` — PASS.
- `/home/dev/dev-projects/BersonCareBot/node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges` — PASS. The initial relative binary command failed because this isolated checkout has no installed `node_modules`; the existing canonical compiler checked this candidate's tsconfig.
- `node scripts/check-migration-privileges.mjs` and `node scripts/check-c4-migration-owned-function-bodies.mjs` — PASS.
- `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` — PASS; log `/tmp/custom-reclaim-preflight.log` ends with explicit `ROLLBACK` and `migrate-dev preflight: PASS`. The log names the candidate reclaim migration. The wrapper's canonical declaration seed/shared-role checks run as documented; no execute/reconcile deployment was invoked.
- `node --test deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs deploy/postgres/privileges/migrate-local.test.mjs` — **61 passed / 7 failed**, log `/tmp/reclaim-migration-checks.log`. The failures are the existing mock-runner fixtures using undeclared `app_probe_owner`; `psql` is a filesystem stub, so their `bersoncarebot_test` strings do not access TEST. This extra suite is not reported green. `git diff 7f277383a^ 21da71e05 -- deploy/postgres/privileges/migrate-local.mjs deploy/postgres/privileges/migrate-local.test.mjs deploy/postgres/privileges/migrate-local-parse.mjs deploy/postgres/privileges/migration-order.mjs deploy/postgres/privileges/generate-cli.mjs` is empty; the reclaim declaration change does not alter migration-owner role inventory. This is an inherited harness issue outside the owner correction, not a failed candidate runtime preflight; no out-of-scope fix was made.
- `git diff --check` — PASS.

Post-probe rollback inspection (local named DEV):

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -Atc "BEGIN READ ONLY; SELECT 'candidate_function_absent=' || (to_regprocedure('app.save_custom_domain_binding_intent(text,uuid,text,text)') IS NULL)::text; SELECT 'probe_bindings=' || count(*) FROM public.org_custom_domain_bindings WHERE hostname IN ('reclaim-audit.example.test','app.second-reclaim-audit.example.test','orphan-reclaim-audit.example.test','spoof-reclaim-audit.example.test','spoof-org-reclaim-audit.example.test','no-context-reclaim-audit.example.test','duplicate-live-reclaim-audit.example.test'); SELECT 'migration_unapplied=' || NOT EXISTS(SELECT FROM drizzle.__drizzle_migrations WHERE tag='20260910T023451_allow_same_org_custom_domain_reclaim'); ROLLBACK;"
```

Output: `candidate_function_absent=true`, `probe_bindings=0`, `migration_unapplied=true`, `ROLLBACK`.

Authority discovery: code-search queries `custom-domain-same-org-reclaim` and `custom domain binding contract staff intent preflight`; worker brief from the canonical checkout's `.lead/briefs`; active plan §1.2/B2/B8/C5a and its linked historical queue; exact `custom.domain|quarantine|reclaim` search in `GLOBAL_ADMIN_UI_INITIATIVE/OWNER_DECISIONS.md`, `SAAS_FOUNDATION/OWNER_*.md`, and `SAAS_PRODUCT_UX_INITIATIVE/OWNER_RULINGS_2026-07-16.md`. No conflicting owner authority was found in those searched registries. `.cursor/rules/000-start-here.mdc` and `CLAUDE.md` point back to AGENTS.md; `.claude/` is absent in this checkout. Historical audit outcomes were not used to override the worker correction.

Handoff: lead integration/landing decision and subsequent deployed live acceptance remain outside this audit. PASS does not close B2/B8/C5a/D or claim TEST readiness.
