# DOSSIER — DB privilege system: the plan, and five audits that refuted it

Repo: /home/dev/dev-projects/BersonCareBot, branch feat/doctor-ui-rebuild.
Live TEST db readable: `sudo -n -u postgres psql -d bersoncarebot_test -Atc "..."` (READ-ONLY, wrap
mutations in BEGIN;...ROLLBACK, never COMMIT, never restart services).

## THE PROBLEM (what actually happened, 2026-08-07)

Ten defects of one class reached production behaviour and lived for months, invisible:
a query hits a DB object its role has no privilege on → Postgres answers `42501`/`42P01` →
the calling code catches it and substitutes a default → nothing logs, nothing fails.

Concrete damage, each verified:
- a doctor writing to the Telegram/MAX bot was NOT recognised as staff;
- two clinics had a connected Google Calendar that was silently disabled;
- clinics paying for tariff branding kept sending through the platform sender;
- operator critical alerts were never dispatched;
- patient phone login returned 500;
- the integrator scheduler tick failed 17246 times/day for weeks.

Plus a second, worse class found by an earlier sweep: **silent zero** — RLS returns 0 rows for
data that exists, no error at all (`platform_users` under the integrator principal).

Owner's requirement, verbatim: a correct, clear, MINIMAL, maximally correct, STABLE SYSTEM —
future development stays clean, and AGENTS CANNOT WRECK IT because the architecture is rigid and
gates do not leak. Not a patch. Not a set of checks that can be bypassed by ordinary code.

## THE PLAN THAT FAILED (v3, docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/PLAN.md)

Five mechanisms:
- M1: the port decides the fate of a denial — always throw + open an operator incident; declared
  fail-safe defaults move to one registry file.
- M2: the port records every (contour→role, canonical SQL) pair during tests/smoke into a
  committed `db-surface.tsv`; CI replays each pair through `EXPLAIN (GENERIC_PLAN)` under the real
  login role. Red build on any denial.
- M3: static policy-satisfiability per contour shape, computed from the existing descriptor model,
  to catch the silent-zero class.
- M4: extend the existing `c5a` bidirectional `EXCEPT` assertions (table ACL, function ACL, policy
  inventory) to all managed roles.
- M5: authoring — nobody writes privilege SQL by hand; a declarative registry renders it; gates
  forbid manual `.sql`, forbid privileges in new migrations, forbid unregistered tables.

## WHAT FIVE INDEPENDENT AUDITS PROVED WRONG

### A. EXPLAIN cannot decide authorization (proven live, multiple ways)
- **Writes:** `EXPLAIN INSERT INTO public.be_organizations(id,title) ...` under `app_staff` plans
  green; the identical INSERT raises `ERROR: new row violates row-level security policy`.
  `WITH CHECK` is evaluated by the executor against the actual row; EXPLAIN never gets there.
  This is a property of EXPLAIN, not a coverage gap.
- **Sequences:** role has table INSERT but not sequence USAGE → EXPLAIN green, runtime
  `permission denied for sequence`. Breaks the claim even with no RLS and no definer involved.
- **SECURITY DEFINER bodies:** `EXPLAIN SELECT app.some_fn()` verifies only the caller's EXECUTE.
  The privileges the definer body needs are unchecked. Measured: **216 of 226 distinct `app.*`
  functions called by app code are SECURITY DEFINER** (244 of 253 in the schema). So the more the
  plan leans on capability accessors (M5), the blinder M2 gets.
- **Row visibility:** EXPLAIN is green while the same query returns 0 rows under the same role.
- What EXPLAIN *does* catch (verified, and stronger than expected): missing table privilege,
  column-level denial, missing function EXECUTE, unqualified names off search_path, and privileges
  on tables referenced inside RLS policy subqueries. Also `EXPLAIN (GENERIC_PLAN)` accepts `$1`
  without values on every statement shape, and its output is byte-identical with and without an
  installed principal.

### B. The recorded surface would be ~0%
- Webapp tests cannot reach the DB by construction: `apps/webapp/src/config/env.ts` blanks
  `DATABASE_URL` unless `USE_REAL_DATABASE=1`, which is set nowhere in CI.
- Integrator: DB-gated test files skip; full suite runs in 17s.
- 487 API route files, 1 colocated route test; 0 of 404 DB-touching handlers execute a real query.
- 28 smoke scripts, exactly 1 imports an app port; the rest drive psql directly.
- Universe: ~2353 SQL-bearing call sites in 359 files. Best case with everything wired: 5–13%.
- The integration harness connects as ONE shared owner login and creates every `app_*` role
  NOLOGIN — so even captured pairs would carry the wrong role label.
- Structural: scheduler ticks, worker loops (~40 job types), webhooks, retry/compensating paths
  are not exercised by tests at all.

### C. M1 is not implementable as written and has already caused an outage
- `app.open_or_touch_operator_incident` is NOT executable by webapp roles (`app_staff`/`app_patient`
  → false). The incident write goes through the same port ⇒ denial → incident → denial.
- The exact change is documented in-repo as having taken TEST down: granting that EXECUTE "broke a
  deploy assertion and took TEST down"; the code comments say a 42501 there "must degrade … not
  propagate and drop the whole inbound message" and that granting is "the WRONG fix".
- Inbound webhooks already return HTTP 200 unconditionally, so throwing does NOT cause messenger
  retry — it causes the whole inbound message to be dropped with no reply and no redelivery.
- `healthCheckDb(): Promise<boolean>` exists to return false; forcing a throw turns a health check
  into a crash.
- Media preview worker: a throw inside `withPoolTransaction` rolls back the `FOR UPDATE SKIP
  LOCKED` claim ⇒ the batch dies on the first poisoned row every tick (head-of-line blocking).
- `getOperatorHealthProbeConfig` throwing would stop the very mechanism meant to detect this class.
- Swallow sites are **~177**, not the ~10 the plan budgeted (68 try/catch + 109 promise-form
  `.catch()`), and ~25–27 sites deliberately catch `23505` (unique_violation) as a legitimate
  insert-if-not-exists idiom.
- "Swallowing is physically impossible" is false: nothing stops `try { await port() } catch {}`.
  The only constructive enforcement is a Result-returning port — the opposite of M1's throw.
- One site where M1 would be an improvement: `pgEmailSetupFlowPort` maps any error, including
  42501, to `reason:'user_not_found'` — actively lying about the cause.

### D. M3 is not computable from what exists
- `rls-descriptor-model.mjs` GENERATES descriptors from TSVs; it never parses `pg_policies`.
- Live: 291 policies; 152 generator-shaped, 139 bespoke, 41 distinct bespoke `qual` expressions,
  64 containing EXISTS subqueries, 111 with OR chains.
- Its named acceptance case, `platform_users`, has 9 policies, none generator-shaped; the model
  emits a hardcoded `bootstrap_readable` template for it — it could not flag its own test case.
- The satisfiability model is also semantically wrong: PostgreSQL ORs permissive policies and ANDs
  restrictive ones. Proven live: one permissive `USING(true)` + one restrictive `USING(false)` →
  `One-Time Filter: false`, zero rows. A restrictive policy already exists on
  `public.operator_job_status`.
- 63 tables have RLS disabled entirely, for which "a policy must exist" is vacuous.

### E. The registry is ~5% of what M5 assumes
- `tiers-218.tsv` is 227 lines of `TIER|schema.table` — one of the three dimensions the plan needs
  (table tier / role shape / capability ACL). Roles and capability ACLs exist nowhere:
  grep for `app_operational_scheduler` across tsv/json/yaml → empty.
- `rls-sql-renderer.mjs` emits only `ALTER TABLE … ENABLE/FORCE RLS` and one policy form
  (`FOR ALL USING(p) WITH CHECK(p)`). No GRANT, no REVOKE, no CREATE ROLE, no function ACL.
  Live policies are 179 `ALL` + 112 per-command — 38% are shapes it cannot render.
- The "start from what c4/c5a already assert" baseline is ~70 rows against a live surface of
  **1369 managed table-grant rows, 253 function ACL entries, 291 policies, 45 roles**.
  `app_staff` alone holds 828 grant rows, exact-asserted nowhere.
- `check-new-table-rls-coverage.mjs` is NOT the census gate the plan claims: it parses repo
  `.sql`/`.ts` files and explicitly "does NOT touch a live database" — contradicting the plan's own
  principle of enumerating `pg_class`. It exits 0 today while 10 tables are unregistered.

### F. Ports: nine, not one
Nine runtime pool providers, each its own interception point:
integrator main (3 URLs: delivery-worker/diagnostic/scheduler), integrator migrator, integrator
projection-health, media-worker, webapp main (3 URLs: staff/nonstaff/worker), webapp config-reader
(separate LOGIN), webapp integrator-purge, webapp saas-isolation-telemetry, webapp boot-probe.
Plus ~4 ops scripts with raw `new Pool`, and **51 non-test files building a raw pg.Pool outside all
ports**. Entry-point counts: integrator ~102 files; webapp 227 files across four entry points
(`getDrizzle` 98, `getDrizzleOrMutationTx` 35, `runWebappSql` 123, raw `getPool` 54).
`EXPLAIN` also sees the ROLE's search_path, not the CONNECTION's — `platformUserFullPurge.ts` sets
`options=-c search_path=integrator,public`, the reverse of the role default, and two names exist in
both schemas (`idempotency_keys`, `schema_migrations`).

### G. A static AST detector for swallowed denials was built and DELETED
0 true positives / 6 false positives on a 21-case fixture; blind to `.catch(() => default)` (577
occurrences in server code) which is the form of two of the ten named defects; credited any `throw`
anywhere in the catch body, so `catch(e){ if(e.code==='42501') return DEFAULT; throw e }` scored
clean; flagged the port itself. Conclusion: the shape "permission denial does not reach a human" is
not a syntactic property.

## WHAT IS TRUE AND USABLE (verified, not assumed)
- DB hygiene is clean: 0 definer functions without pinned `search_path`, 0 with EXECUTE to PUBLIC,
  0 RLS tables without policies. 176 of 239 tables have RLS+FORCE.
- `c5a-platform-operations-runtime.sql` already does bidirectional `expected EXCEPT actual` over
  table ACL, function ACL AND policy inventory, with `prosecdef`/owner assertions. 28 of 61
  overlays carry drift assertions. This pattern works and is deployed.
- Deploy already hard-asserts each runtime login role's exact privilege set and fails closed.
- A live readiness gate exists that logs in as each operational role and probes both what must work
  and what must be denied.
- 235 tables live vs 227 registry rows: 10 unregistered (all `saas_billing_*`, `org_brand_revisions`,
  slug tables, `manual_patient_commands`, `booking_calendar_map`), 1–2 dead rows.
- Migration census: 176 schema/data-only, 57 privileges-only, 107 MIXED privileges+DDL in one file.
  Applied history is journaled by hash+created_at; existing DBs will not reapply edited files.
- An `a0-greenfield` schema baseline exists with a migration manifest and verification scripts.

## THE QUESTION FOR YOU

Given all of the above — design the system. Not a critique: a DESIGN.

Constraints that are non-negotiable:
1. It must make the ten defects impossible-to-miss, including the silent-zero class.
2. It must be MINIMAL — the owner explicitly rejects defensive duplication and wants one
   chokepoint, not layers of overlapping checks.
3. It must be RIGID: a future agent writing ordinary, well-intentioned code must not be able to
   reintroduce the defect class or bypass the mechanism without an obvious, reviewable diff.
4. It must not break the documented fail-open paths that keep inbound messaging alive.
5. Zero or near-zero new dependencies is strongly preferred; the owner rejected a framework
   migration (NestJS) as irrelevant to the problem.
6. It must say what happens to 61 overlays, 164 privilege-bearing migrations, and the 9 pools.

Answer these explicitly:
- What is the ONE load-bearing mechanism, and why can it not be bypassed?
- Exactly where does authorization get PROVEN, given static analysis cannot decide it?
- How is the silent-zero class detected, given it produces no error?
- What is the migration path from today's state, in order, with what is provable at each step?
- What do you deliberately NOT do, and why?
- What is the residual risk that remains even after your design is fully built?

Be concrete: name files, roles, mechanisms. Prefer one strong idea over five weak ones.

## LATE FINDINGS (added after the dossier was first written — all verified)

### EXPLAIN lies in SEVEN distinct ways, not one
A disposable PG16 cluster probe matrix (built by an auditor because it could not reach TEST):
```
sequence_explain|OK      sequence_runtime|ERROR 42501 permission denied for sequence
trigger_explain|OK       trigger_runtime|ERROR 42501 permission denied for table trigger_sink
column_b_explain|ERROR 42501            <- column privileges ARE caught (good)
partial_rows_visible|1                  <- RLS returned a SUBSET, not zero
restrictive_plus_permissive_visible|0   <- permissive OR'd, restrictive AND'd
owner_view_visible|2                    <- owner-executed view showed MORE than the role may see
select_star_after_add_column|{"a":1,"secret":"newly_exposed"}
call_explain|ERROR 42601 syntax error at or near "CALL"
set_role_explain|ERROR 42601 syntax error at or near "SET"
```
Consequences the plan never considered:
1. **PARTIAL visibility**, not just silent zero. A subset of rows looks like perfectly valid data.
   Zero is at least suspicious; a subset is undetectable by any "did it return rows" heuristic.
2. **Excess visibility.** An owner-executed VIEW shows MORE than the calling role should see. The
   defect class is therefore two-sided: "code cannot see its data" AND "code sees other tenants'
   data". For a multi-tenant medical SaaS the second is the dangerous one, and no mechanism in the
   plan looks for it.
3. **A new column silently enters existing `SELECT *` queries.** `ALTER TABLE ... ADD COLUMN secret`
   → an unchanged query starts returning it. No code diff, no surface diff, no gate sees this.
   Only a schema-side decision ("who may see this new column") can catch it.
4. **Triggers** run as another role and their denials are invisible to planning.
5. **CALL (procedures) and SET ROLE cannot be EXPLAINed at all** — outside this method by design.

### Pools: files ≠ physical pools
`integratorPoolProvider.ts` is ONE file creating FOUR pools (request, diagnostic, delivery-worker,
scheduler). `webappPoolProvider.ts` routes per-principal via `selectPool(principal)` (staff /
nonstaff). So "9 providers" is a file count; the count of live physical pools with distinct roles
is higher and must be derived from pool-creation sites, not files. `configReaderPoolProvider` is
reached only through a lazy getter in `client.ts` — possibly dead, unconfirmed.

### Tooling constraint discovered
Agents launched through the Codex port run under a sandbox with kernel `no_new_privileges`; they
CANNOT reach the TEST database (`sudo -u postgres` blocked before Postgres is involved). Opus-run
agents CAN. Any design requiring agent-side live-DB verification must account for this.
