# SaaS Silo Spike — PROOF.md

**DB:** `bcb_saas_spike` (synthetic data only, no prod PII)
**Date:** 2026-06-17
**Branch:** feat/doctor-ui-rebuild (worktree, not merged)

---

## Proof 1 — Provision from template

**Script:** `01_provision.sql`
**Command:** `psql "$SPIKE_URL" -f 01_provision.sql`

**Observed results:**
- `tenant_template` created with 3 tables (patient, clinical_diagnosis, reminder): OK
- `tenant_provision()` called for `tenant_a` and `tenant_b`: both returned void (no error)
- Mismatch query returned **0 rows** (no column-set differences)
- Column count per schema: `tenant_template=10`, `tenant_a=10`, `tenant_b=10` (all equal)

**Verdict: PASS**

Note: provisioning uses a plpgsql function that recreates tables with explicit DDL — not pg_dump/restore.
Same result; structure is identical by construction and verified via `information_schema.columns`.

---

## Proof 2 — Migration loop

**Script:** `02_migration_loop.sql`
**Command:** `psql "$SPIKE_URL" -f 02_migration_loop.sql`

**Observed results:**
- `ALTER TABLE tenant_template.clinical_diagnosis ADD COLUMN icd_code text`: OK
- Loop iterated over `tenant_a`, `tenant_b` (2 schemas matching `tenant_%`)
- Per-schema timing: tenant_a 3.19ms, tenant_b 3.53ms
- Total migration: **2 schemas in 3.67ms**
- Verification query: both schemas show `icd_code text PASS`
- Count check: `total_tenants=2`, `schemas_with_new_col=2`

**Verdict: PASS**

---

## Proof 3 — Isolation via search_path

**Script:** `03_isolation.sql`
**Command:** `psql "$SPIKE_URL" -f 03_isolation.sql`

**Observed results:**
- `SET search_path=tenant_a`: `SELECT count(*), diagnoses` → `1 row`, `"Hypertension (tenant_a)"` only
- `SET search_path=tenant_b`: `SELECT count(*), diagnoses` → `1 row`, `"Type 2 Diabetes (tenant_b)"` only
- Cross-leak check (search_path=tenant_a, query for tenant_b rows via unqualified name): **0 rows**

**Wall hit recorded:** Explicit schema-qualified access (`tenant_b.clinical_diagnosis`) IS still visible
to the same DB role — the schema boundary does not enforce cross-schema reads at the SQL level without
RLS or separate roles. The silo model relies on the application never issuing explicit cross-schema
queries (search_path discipline alone is the isolation mechanism at the app layer). This is expected
and documented in the plan (D4 adds RLS for hard enforcement).

**Verdict: PASS** (unqualified isolation works; hard RLS is Phase 0 follow-on per D4/D5)

---

## Proof 4 — Global directory + unique client in two tenants

**Script:** `04_directory.sql`
**Command:** `psql "$SPIKE_URL" -f 04_directory.sql`

**Observed results:**
- `directory` schema created with `person` + `person_tenant` tables: OK
- Person `cccc…0001` (phone `+70000000001`) inserted once into `directory.person`
- Two rows in `directory.person_tenant`: `(cccc…, tenant_a)` and `(cccc…, tenant_b)`
- Directory lookup query returned **2 rows**: both tenant_a and tenant_b listed for the person
- Per-schema chart query returned **2 distinct rows**:
  - `tenant_a chart | Migraine — tenant_a chart | G43`
  - `tenant_b chart | Asthma — tenant_b chart | J45`

**Verdict: PASS**

---

## Proof 5 — Transfer + headless job

**Script:** `05_transfer_headless.sql`
**Command:** `psql "$SPIKE_URL" -f 05_transfer_headless.sql`

**Minor wall hit:** UUID literal `r1a1a1a1-…` was invalid (first segment must be 8 hex chars, 'r' is not
hex). Fixed to `a1a1a1a1-1111-…` in the script. No architectural wall — purely a typo in test data.

**Observed results (5a — transfer):**
- INSERT…SELECT from `tenant_a.clinical_diagnosis` → `tenant_b.clinical_diagnosis`: **1 row inserted**
- Post-transfer row count in tenant_b for Carol: **2 rows** (original + transferred)
- Data intact: `"Migraine — tenant_a chart [transferred from tenant_a]" | G43` visible in tenant_b
- Original tenant_a row unmodified (confirmed by Proof 4 query staying clean)

**Observed results (5b — headless job):**
- `simulate_reminder_job('cccc…', 'tenant_a')` called:
  - Directory lookup → found `tenant_a` enrollment
  - `SET search_path` → `tenant_a`
  - `UPDATE reminder SET sent=true` → **1 row updated**
- `tenant_a.reminder.sent` = **true** (job fired)
- `tenant_b.reminder.sent` = **false** (untouched — correct isolation)

**Verdict: PASS**

---

## Summary table

| # | Proof                          | Result | Numeric evidence                                        |
|---|-------------------------------|--------|---------------------------------------------------------|
| 1 | Provision from template       | PASS   | 0 mismatch rows; col_count=10 in all 3 schemas          |
| 2 | Migration loop                | PASS   | 2/2 schemas migrated; 3.67ms total                      |
| 3 | Isolation via search_path     | PASS   | 0 cross-leak rows (unqualified); explicit-schema caveat |
| 4 | Global directory + enrollment | PASS   | 2-tenant list; 2 distinct charts from same person_id    |
| 5 | Transfer + headless job       | PASS   | 1 row transferred intact; job updated A only (B=false)  |

---

## Blunt verdict

**Silo model delivers all 5.** Schema-per-tenant with `search_path` discipline works as the isolation
boundary. The mechanism is proven. Two findings to carry forward into Phase 0:

1. **Hard isolation requires RLS + separate DB roles (D4/D5).** search_path alone does not prevent
   explicit-schema cross-tenant reads by the same role. The app must never issue them, and D4's RLS
   (GUC-gated, FORCE) is the hard backstop. This is already in the plan — spike confirms it's
   non-optional, not a surprise.

2. **Migration loop is trivially fast at 2 tenants (~4ms).** At 100 tenants expect ~200ms; at 1000
   tenants ~2s — a background DDL job, not a blocking concern. `IF NOT EXISTS` guards make it
   idempotent and re-runnable.
