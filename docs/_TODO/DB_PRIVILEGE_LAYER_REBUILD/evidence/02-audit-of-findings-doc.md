1. **CRITICAL — WRONG.** The conclusion “the DB itself is in order; only management is broken” directly contradicts the document’s own established findings. [FINDINGS.md:54](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:54) and [FINDINGS.md:280](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:280) call DB state clean, while [FINDINGS.md:121](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:121)–145 claim a reproduced cross-tenant leak and five tenant-readable tables lacking RLS+FORCE, including medical data. Those cannot both be true. At most, three narrow hygiene checks passed; the DB state as a whole is not “in order.”

2. **CRITICAL — MISPLACED.** Parts 1–4 do not satisfy the document’s own evidence rule. [FINDINGS.md:4](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:4)–6 promise a recheck method for every fact, but many “commands” are merely fragments such as `pg_proc × pg_namespace`, `WHERE prosecdef`, and `WHERE relrowsecurity` at [FINDINGS.md:43](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:43)–50. The leak at lines 121–145 prints results without the SQL, principal/context setup, or transaction. The EXPLAIN, PREPARE, AST, Atlas, daily-count, and overlay-execution claims at lines 165–257 likewise omit executable probes. They may be true, but here they are **UNVERIFIABLE-HERE** and belong in Part 5 until complete commands or durable probe artifacts are supplied.

3. **CRITICAL — WRONG.** “PostgreSQL’s log contains the complete inventory” is false. The only printed count command at [FINDINGS.md:93](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:93)–98 matches only the literal `ERROR:  permission denied`. It does not count the RLS violation or either `42P01` signature printed at lines 111–119. More fundamentally, silent zero, partial visibility, excess visibility, and `SELECT *` column exposure produce no denial to log. This contradicts [FINDINGS.md:28](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:28)–29 and makes the stronger conclusion at [FINDINGS.md:286](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:286)–288 unproven. The printed grep also proves only a count, not the claim that all 141,248 entries include both role and query.

4. **HIGH — WRONG.** The `platform_users` finding at [FINDINGS.md:151](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:151) incorrectly infers “SELECT only, no DML” from table-level `insert=f, update=f`. The repository explicitly grants `app_patient` column-level update:

   [p0-5b-grants.sql:435](/home/dev/dev-projects/BersonCareBot/deploy/postgres/p0-5b-grants.sql:435) explains that these are column-level grants, and [p0-5b-grants.sql:439](/home/dev/dev-projects/BersonCareBot/deploy/postgres/p0-5b-grants.sql:439) contains:

   ```sql
   GRANT UPDATE ("calendar_timezone", "reminder_muted_until")
   ON TABLE "public"."platform_users" TO app_patient;
   ```

   A false result from `has_table_privilege(...,'UPDATE')` does not mean all `has_column_privilege` checks are false.

5. **HIGH — MISSING.** The late-proven **partial visibility** class is absent. The document covers zero rows, excess visibility, and new `SELECT *` columns, but never records a role seeing a plausible subset. The supplied probe output was:

   ```text
   partial_rows_visible|1
   restrictive_plus_permissive_visible|0
   ```

   The permissive/restrictive-policy result is also absent. These live results are **UNVERIFIABLE-HERE**, but they are established dossier facts and should appear with their disposable-probe command. “Two-sided” at [FINDINGS.md:284](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:284) is incomplete because partial visibility is neither detectable as zero nor necessarily recognizable as excess.

6. **HIGH — WRONG.** The claim that `check-new-table-rls-coverage.mjs` is not connected to CI at [FINDINGS.md:85](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:85)–87 is repository-checkably false:

   - CI runs `pnpm run audit`: [ci.yml:114](/home/dev/dev-projects/BersonCareBot/.github/workflows/ci.yml:114)–120.
   - `audit` runs `check-saas-db-regression.mjs`: [package.json:77](/home/dev/dev-projects/BersonCareBot/package.json:77).
   - That script invokes the coverage gate and its self-test: [check-saas-db-regression.mjs:19](/home/dev/dev-projects/BersonCareBot/scripts/check-saas-db-regression.mjs:19)–26.

   Repository execution returned:

   ```text
   check-new-table-rls-coverage: active public organization tables are covered
   check-new-table-rls-coverage self-test: missing descriptor detection OK
   check-new-table-rls-coverage self-test: missing policy detection OK
   ```

   The accurate criticism is that this CI-connected static gate can pass while the live catalog has unregistered tables—not that it is absent from CI.

7. **HIGH — MISSING.** The decisive M3 failure is absent. Repository inspection proves `rls-descriptor-model.mjs` reads TSVs and hardcoded sets, not `pg_policies`: `rg 'pg_policies|pg_policy' .../rls-descriptor-model.mjs` returns no matches. Its generic BOOTSTRAP fallback emits `predicateTemplate: 'bootstrap_readable'` at [rls-descriptor-model.mjs:205](/home/dev/dev-projects/BersonCareBot/docs/_TODO/SAAS_FOUNDATION/scripts/rls-descriptor-model.mjs:205)–220. Therefore the document omits the repo-provable fact that this model cannot derive or evaluate the live bespoke policy inventory, including its named `platform_users` case.

8. **HIGH — MISSING.** The decisive M5 registry/renderer limitation is also absent. The document records only registry drift, not that the registry lacks role and capability-ACL dimensions. Repository evidence:

   - `tiers-218.tsv` contains only `TIER|schema.table`.
   - `rg app_operational_scheduler docs/_TODO/SAAS_FOUNDATION/scope-derivation` returns no matches.
   - The renderer’s privilege-relevant output is limited to ENABLE, FORCE, and one `FOR ALL` policy shape at [rls-sql-renderer.mjs:622](/home/dev/dev-projects/BersonCareBot/docs/_TODO/SAAS_FOUNDATION/scripts/rls-sql-renderer.mjs:622)–641; it emits no `GRANT`, `REVOKE`, or role DDL.

9. **HIGH — WRONG.** The “ten defects, one mechanism, nothing logs or fails” description at [FINDINGS.md:12](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:12)–14 contradicts both the document and source:

   - The same table says patient login returned 500 and the scheduler tick failed 17,246 times: lines 24–25.
   - Telegram’s catch logs a warning at [telegram/webhook.ts:109](/home/dev/dev-projects/BersonCareBot/apps/integrator/src/integrations/telegram/webhook.ts:109)–120.
   - `42P01` is not necessarily missing privilege: [messageLogs.ts:90](/home/dev/dev-projects/BersonCareBot/apps/integrator/src/infra/db/repos/messageLogs.ts:90)–94 records the actual cause as unqualified name resolution under the wrong `search_path`.

   This is a family of authorization/name-resolution/visibility failures with different outcomes, not the single exact causal chain stated.

10. **HIGH — MISSING.** The claimed ten defects are not actually enumerated. Part 1 lists seven damage rows. Repository evidence explicitly records two omitted consequences: clinic notification templates silently fell back to hardcoded text and timezone silently fell back to the compiled default at [integrator-server-runtime-config.sql:193](/home/dev/dev-projects/BersonCareBot/deploy/postgres/integrator-server-runtime-config.sql:193)–199. The document neither includes these nor maps its “10” to ten concrete defects.

11. **MEDIUM — WRONG.** “The webhook returns 200 in all branches” at [FINDINGS.md:196](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:196) is overstated. Telegram returns 503 when disabled at [telegram/webhook.ts:420](/home/dev/dev-projects/BersonCareBot/apps/integrator/src/integrations/telegram/webhook.ts:420)–424; MAX does the same at [max/webhook.ts:197](/home/dev/dev-projects/BersonCareBot/apps/integrator/src/integrations/max/webhook.ts:197)–200. The narrower and relevant statement is confirmed: caught processing exceptions return 200, e.g. [max/webhook.ts:336](/home/dev/dev-projects/BersonCareBot/apps/integrator/src/integrations/max/webhook.ts:336)–346.

12. **MEDIUM — WRONG / MISPLACED.** The pool inventory is not a proven census.

   - [FINDINGS.md:74](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:74) says exactly four webapp scripts use raw pools; repository search returns **10** files under `apps/webapp/scripts`.
   - The main webapp provider physically creates staff and nonstaff pools, not a third worker pool: [webappPoolProvider.ts:274](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/infra/db/webappPoolProvider.ts:274)–303.
   - The integrator provider file also contains a separate telemetry pool at [integratorPoolProvider.ts:158](/home/dev/dev-projects/BersonCareBot/apps/integrator/src/infra/db/integratorPoolProvider.ts:158)–167.
   - Webapp SaaS telemetry creates two lazy pools at [saasIsolationTelemetry.ts:36](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/infra/db/saasIsolationTelemetry.ts:36)–45.
   - `getConfigReaderPool` has no non-test caller outside its own definition and import; its runtime reachability is therefore unconfirmed and belongs in Part 5.

13. **MEDIUM — WRONG.** The migration census is internally incomplete. [FINDINGS.md:42](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:42) gives 377 SQL migrations, but its three displayed subcategories total only `176 + 57 + 107 = 340`. Thirty-seven files are unexplained, and “character-by-character analysis” is not a reproducible command. The total `377` itself is confirmed by repository count.

14. **MEDIUM — MISPLACED.** “63 tables without RLS” is quarantined at [FINDINGS.md:274](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:274), but Part 2 already presents `176 of 239` as established at [FINDINGS.md:50](/home/dev/dev-projects/BersonCareBot/docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/FINDINGS.md:50). Under the document’s own scope that yields exactly `239 − 176 = 63`. Either promote 63 or quarantine the underlying 176/239 census too.

15. **MEDIUM — MISSING.** Important repository-proven usable infrastructure never made it into the findings:

   - The readiness gate logs in through four distinct operational URLs, runs allowed operations, runs must-deny probes, and asserts four distinct roles at [assert-c4-operational-runtime-ready.sh:97](/home/dev/dev-projects/BersonCareBot/deploy/host/assert-c4-operational-runtime-ready.sh:97)–142.
   - The A0 greenfield baseline exists with hashes, source commit, schema/function/policy census, and migration manifest in [migration-manifest.json:1](/home/dev/dev-projects/BersonCareBot/docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/migration-manifest.json:1).
   - Its check and verification commands are exposed at [package.json:40](/home/dev/dev-projects/BersonCareBot/package.json:40)–42.

   These materially affect what the plan can reuse and are more foundational than several speculative sections retained in Part 4.

16. **LOW — CONFIRMED-OK.** A limited subset is reproducible and correct:

   ```text
   deploy/postgres/*.sql                         61
   apps/webapp/db/drizzle-migrations/*.sql      377
   tiers-218.tsv lines                          227
   overlays containing EXCEPT                    2
   overlays containing RAISE EXCEPTION          28
   ```

   The webapp test DB blanking is present at [env.ts:32](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/config/env.ts:32)–37; `healthCheckDb` deliberately returns false at [client.ts:233](/home/dev/dev-projects/BersonCareBot/apps/integrator/src/infra/db/client.ts:233)–243; the incident capability denies webapp roles at [integrator-server-runtime-config.sql:880](/home/dev/dev-projects/BersonCareBot/deploy/postgres/integrator-server-runtime-config.sql:880)–887; and `c5a` contains bidirectional table/function ACL comparisons plus policy-inventory comparisons at [c5a-platform-operations-runtime.sql:1340](/home/dev/dev-projects/BersonCareBot/deploy/postgres/c5a-platform-operations-runtime.sql:1340)–1350 and [c5a-platform-operations-runtime.sql:1713](/home/dev/dev-projects/BersonCareBot/deploy/postgres/c5a-platform-operations-runtime.sql:1713)–1721. Structurally, the file is one coherent document rather than scattered notes, but that does not cure its factual incompleteness.

No — this document is not fit to be the factual foundation for the plan.