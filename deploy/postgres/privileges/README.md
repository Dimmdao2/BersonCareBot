# `deploy/postgres/privileges/` — DB privilege DECLARATION (Ф2.2 draft)

## What this is

`declaration.ts` is the **single typed source of truth** for the DB privilege layer: cluster roles,
per-env logins, and per-database schemas / tables / policies / definer functions / ownership /
db-settings. It is a transcription of the **live catalog census**
(`docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/13-f2-census.md`, read-only, 2026-08-08) **minus
known defects** (SCHEME §H.1), shaped per **SCHEME §A** (ten sections) and reconcilable per
**SCHEME §F**.

**Status: DRAFT.** Nothing here is wired into any deploy. No SQL has run. The generator (Ф2.3) that
turns this into `deploy/postgres/generated/privileges.<db>.sql` and `expected-state.json` does not
exist yet. Do not `import` this into deploy paths until Ф2.3.

## Who applies what (SCHEME §B — three appliers, do not confuse them)

The declaration is **one source** consumed by **three different mechanisms**. A field's *value* is
declared here; *who writes it to the catalog* is not the generator for every field:

| Field class | Applied by | Note |
|---|---|---|
| roles + attributes + memberships (cluster) | `roles-install` (§B step 1) from decl **+ env-mapping** | cluster-level; survives restore |
| login records (name, membership, `passwordEnv`, CONNECT, `rolconfig`) | **env-render** at apply time (decl + `env/<env>.json`) | **NOT committed** — never a literal password |
| schema/table/column/sequence/function/view ACLs, policies, RLS flags, owners, per-db `datdba` + `ALTER DATABASE SET`, default-priv hardening | **generator** → committed `generated/privileges.<db>.sql` | env-independent truth |
| `definerExceptions[*].searchPath` (`proconfig`) | **the function BODY in its migration** — NOT the generator | one authority (dbt #6238); §F only *compares* it |
| per-`(login,db)` `ALTER ROLE … IN DATABASE … SET` (`dbSettings.perRoleInDatabase`) | **env-render** at apply time | e.g. dev's `search_path=public, integrator` |
| org-table wall (allowlist, `ENABLE/FORCE RLS` on birth) | **event trigger** (§E) reads `orgTableAllowlist` | derived from `tables[*].org===true` |

**Byte-exactness matters:** `searchPath` and `dbSettings` strings are stored **verbatim** as the
catalog holds them (e.g. `search_path=public, integrator` — space after the comma). §F compares
byte-for-byte; a reformatted literal is a false-red.

## Census gaps still open (see the `// GAPS` block at the top of `declaration.ts`)

These are the inputs the read-only census could not settle; the generator/owner triage must close
them before this leaves draft. Grep `TODO(census-gap)` and `TODO(owner?)` in `declaration.ts`.

- **G1** — exact 11 tenant-bypassable roles (the SET ROLE × principal sweep was not re-run). One
  scope (`app_identity_bootstrap` OWN-vs-NONE) is left `TODO(owner?)`.
- **G2** — full per-table grant matrix (~235 tables): census enumerated only a handful; the rest is
  `TODO(census-gap)` rather than guessed.
- **G3** — which of the 38 migrator-owned + 1 `app_platform_settings`-owned definer functions are
  intentional vs drift; only 1 of the 38 is named in the census.
- **G4** — NOINHERIT drift on `bcb_test_staff_login`, `bcb_test_worker_login`, `bcb_webapp_dev_user`
  (live `rolinherit=t` vs SCHEME §A.1 pin) — pinned to live value, reconciliation deferred.
- **G5** — `app_ext` schema owner differs per db (TEST `postgres` / dev `bcb_webapp_dev_user`).
- **G6** — `platform_users` Ф6 red baseline (now RLS+FORCE) — owner gate at Ч1.3, not a decl value.
- **G7** — `reference_catalog_snapshot_receipts` (both) + dev `patient_specialist_links`: true org
  tables vs false-positive. Declared `org:true` (they carry `organization_id`).
- **G8** — policy names/bodies (9 on `platform_users`, 4 on `admin_audit_log`, …) not enumerated.
- **G9** — exact env-secret variable names + per-login CONNECT/VALID UNTIL/conn-limit (live in the
  deploy secret store, not the catalog). `passwordEnv` values are convention placeholders.

## Discipline honored

Every value traces to the census (`evidence/13 §N`) or repo code (`file:line`) — no invented
literals. Refuted approaches (FACTS §9: capability-only, always-throw, AST, EXPLAIN-proofs) are not
reintroduced. The two managed DBs (`bersoncarebot_test`, `bcb_webapp_dev`) are encoded separately
because they genuinely differ (SCHEME §A / evidence/13 §2.2). `prod` and out-of-jurisdiction /
foreign / ephemeral roles are excluded per SCHEME §A jurisdiction.
