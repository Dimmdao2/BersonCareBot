# PROD vs TEST divergence — inventory (2026-07-26)

> **Why this exists.** Owner asked when it's time to stand up the platform on a real production server —
> new box, correct environment/roles/users/DB — so testing stops happening somewhere it no longer reflects
> reality. This is a **read-only inventory** of exactly how far TEST has drifted from what PROD (135.x) can
> run today, built entirely from repo code, deploy scripts, docs, and `SELECT`-only queries against the local
> TEST database (`bersoncarebot_test`, a PROD dump plus SaaS migrations). **PROD itself was never touched,
> probed, or connected to** — every PROD fact below is inferred from what `main` branch would do if deployed,
> or comes from the repo's own prior investigations (cited). Anything that genuinely requires touching PROD to
> know is in the UNKNOWN section, not guessed.
>
> **Headline finding, stronger than the claim I was asked to verify:** the DB privilege model is not the only
> thing missing from PROD's path — **the code itself never reached `main`.** `deploy-prod.sh` always pulls and
> re-execs from `origin/main` (`deploy/host/deploy-prod.sh:26,60,65`), and `main` is frozen at commit
> `d09ea70c8` (2026-07-01). The current work (`feat/doctor-ui-rebuild`) is **1,831 commits / 3,729 files /
> +540,730 −51,399 lines** ahead of that merge-base — an entire multi-tenant SaaS product that has never been
> on the branch PROD deploys from, let alone executed against PROD's database. Confirmed directly:
> `git show main:deploy/postgres` contains exactly two files — `README.md` and `postgres-backup.sh`. Every
> `.sql` overlay discussed below is branch-local.

---

## 0. Method note on what "PROD" means below

`deploy/host/deploy-prod.sh` is branch-parameterized (`DEPLOY_BRANCH` defaults to `main`) and **self-re-execs
after `git pull`** (lines 26, 60–66) — so whatever governs PROD today is **`main`'s copy of the deploy
scripts**, not this branch's. I read both: the feature-branch version (what a future cutover would ship) and
`git show main:deploy/host/deploy-prod.sh` (what actually runs against PROD right now). They are dramatically
different — see §1.

---

## 1. Database shape

### 1.1 What runs against PROD today (`main` branch, verified via `git show main:...`)

- `git show main:deploy/host/deploy-prod.sh` references **zero** files under `deploy/postgres/`. No `psql -f`
  overlay calls exist at all.
- `git ls-tree -r --name-only main -- deploy/postgres/` → exactly `README.md` and `postgres-backup.sh`. No
  RLS, no roles, no SECURITY DEFINER seam, nothing.
- `deploy/systemd/*-prod.service` on `main` (diffed against this branch — identical except one unrelated
  `EnvironmentFile` path fix in media-worker) confirm PROD connects with **one** DB login role (`api.prod` /
  `webapp.prod` `DATABASE_URL`), no role split.
- **Corroborates `docs/_TODO/SAAS_PROD_DEPLOY_PROCESS.md:219` and `docs/_TODO/ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md:36`**, both dated 2026-07-24, which independently state the same thing ("deploy-prod.sh has ZERO grant provisioning") and record the owner's 2026-07-24 ruling that **current prod is the OLD single-owner model — ONE DB role** for the whole connection.

### 1.2 What exists only on the feature branch (never executed against real PROD)

`deploy/host/deploy-test.sh` (this branch) always runs the **full closure** `deploy-test-saas.sh
--strict-preflight` / `--post-migration-closure` (`deploy/host/deploy-test.sh:149,193` — this is not the
"full reset" wrapper, it's the _ordinary_ code-only test deploy, and it still applies every overlay below).
That closure applies, in order (`deploy/host/deploy-test-saas.sh:1760-1780`):

1. `p0-5b-role-split-staff-patient.sql` — creates `app_owner` (NOLOGIN, BYPASSRLS, 0 members), `app_staff`
   (LOGIN, NOBYPASSRLS), `app_patient` (LOGIN, NOBYPASSRLS, not a member of `app_staff`).
2. `p0-5b-grants.sql` — the grants for those roles.
3. `p2-b-protected-principal-context.sql` — `app.*` principal-context SECURITY DEFINER functions.
4. `runtime-overlay-app-owner-handoff.sql`, `organization-member-invites-rls.sql`, `patient-invites-rls.sql`,
   `store-p0-entitlements-rls.sql`, `patient-course-assignment-wall.sql`,
   `specialist-signup-public-bootstrap-rls.sql`, `specialist-owner-provisioning-rls.sql`,
   `reference-catalog-rls.sql`, `patient-visible-catalog-rls.sql`,
   `patient-web-push-vapid-public-key-accessor.sql`, `public-booking-bootstrap-resolver.sql`,
   `public-clinic-slug-bootstrap-resolver.sql`, `d3-4-bootstrap-base-login-read-grants.sql`, plus C4/telemetry
   overlays (`c4-operational-runtime.sql`, `saas-isolation-telemetry.sql`, `saas-system-health-diagnostics.sql`,
   `integrator-*-runtime-config.sql`, `e1-webapp-runtime-config.sql`).
5. `phase4-app-worker-narrow-rls.sql` and (elsewhere in the closure) `phase4-force-rls-cutover.sql`,
   `phase4-locked-helper-rls-policies.sql`, `test-strict-rls-finalizer.sql` — the **FORCE RLS** cutover itself.
6. `test-owner-ready-locked-matrix.sql`, `test-patient-identity-capability-gate.sql`,
   `test-settings-override.sql` — TEST-only fixtures/overrides, explicitly not for PROD.

**None of these 30+ files exist on `main`.** The 5 that appear in this branch's `deploy-prod.sh` (added
locally, never merged: `specialist-owner-provisioning-rls.sql`, `reference-catalog-rls.sql`,
`patient-visible-catalog-rls.sql`, `patient-media-playback-telemetry-accessors.sql`, `patient-invites-rls.sql`)
each **preflight-`RAISE EXCEPTION`** if `app_owner`/`app_staff`/`app_patient` don't already exist
(`deploy/postgres/patient-invites-rls.sql:6-9`, `deploy/postgres/patient-media-playback-telemetry-accessors.sql:3-9`)
— i.e. even the version of `deploy-prod.sh` that eventually merges will hard-abort on a real PROD run unless
role creation runs first. This is already known and sequenced correctly in
`docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md` §2.1 ("HARD PREREQUISITE... roles must exist BEFORE
the migration chain").

### 1.3 Measured TEST state (live `SELECT`, `bersoncarebot_test`, counts only)

```
FORCE RLS tables (relrowsecurity=t, relforcerowsecurity=t): 162
RLS-off tables:                                              48
Total RLS policies (pg_policies, public schema):            218
SECURITY DEFINER functions (public+app schemas):            123
Tables with an organization_id column:               159 of 210
```

None of this exists on PROD's schema (§2 below explains why — the tables carrying `organization_id` mostly
don't exist there yet, not just the policies).

### 1.4 `platform_users` — no RLS, no `organization_id` (data-shape gap, not just a config gap)

```sql
SELECT relrowsecurity, relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname='platform_users';
-- f | f
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='platform_users' AND column_name='organization_id';
-- 0 rows — the column doesn't exist
```

282 rows on TEST (count only, no PII). Matches the memory finding
`platform-users-has-no-rls-single-wall-on-pii.md` — this table carries identity PII (name/phone/email/DOB)
and has neither RLS nor a tenant column; membership/org scoping lives one hop away in
`be_organization_members`. This is a TEST-and-PROD-alike structural gap, not something the SaaS migration
chain fixes — worth flagging to the owner separately from the cutover, since it will still be true on a
freshly cut-over PROD.

---

## 2. Migrations

### 2.1 `main` has 136 migration files; this branch has 251

```
git ls-tree -r --name-only main -- apps/webapp/db/drizzle-migrations | grep -c '\.sql$'   -> 136
git ls-tree -r --name-only HEAD -- apps/webapp/db/drizzle-migrations | grep -c '\.sql$'    -> 251
```

`main`'s last migration is `0135_clinical_diagnosis_add_comment.sql`. The **entire organization/tenant model
starts at `0141_be_organization_members.sql`** and the entire role-split/RLS/FORCE apparatus is
`0169` onward. So a PROD deploy from `main` today has **no `be_organizations` table, no
`be_organization_members` table, no `app.is_staff()` helper, no organization concept at the schema level at
all** — this is upstream of "grants are missing," it's "the tables don't exist."

The migrations run via `drizzle-orm`'s own migrator (`apps/webapp/scripts/run-webapp-drizzle-migrate.mjs:9-11`,
`readMigrationFiles` + `migrate()` from `drizzle-orm/node-postgres/migrator`), tracked in
`drizzle.__drizzle_migrations(hash, created_at)`. `apps/webapp/scripts/seed-drizzle-migrations-meta.mjs`
matches by **sha256 of the file**, not `created_at` — so the previously-recorded "watermark, not hash" incident
(memory: `drizzle-migrator-watermark-not-hash.md`) is a real, separately-documented risk for the repair tool,
but the primary migrate path itself dedupes by content hash per migration. The practical risk for a cutover is
not "migrations silently skip" — it's **migrations that reference objects the chain hasn't created yet, on a
database this exact chain has never seen fresh.**

### 2.2 The chain was already proven NOT to run cleanly on a fresh PROD-shaped DB — and was fixed once

`docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md` §2.1 documents eight from-zero rehearsal failures
found 2026-07-25 (stale `/tmp` artifact permission, a data-fix asserting a row that doesn't exist on real
prod, `app.current_org_id()` referenced before any migration creates it, two more undefined-function/ownership
failures, and the discovery that **runtime roles must exist BEFORE migrations start** because the chain does
`ALTER FUNCTION ... OWNER TO app_owner`, which requires the new owner to have `CREATE` on schema `app` —
granted only by a post-chain overlay). All eight are fixed **on TEST's copy of a prod dump**. That is one
successful from-zero rehearsal, not a repeatable, CI-gated path — the fixes live in migration `0175` and
`deploy-test-saas.sh`, not in anything `main`/`deploy-prod.sh` would run.

### 2.3 30 migrations reference `app_staff`/`app_patient`/`app_owner` by name

```
grep -lE "app_staff|app_patient|app_owner" apps/webapp/db/drizzle-migrations/*.sql | wc -l   -> 30
```

First is `0175_p0_8_b4_roles_1_is_staff_wall_rls.sql`, whose own header states: _"Dormant in prod today: the
app DB role still has BYPASSRLS... the new app_staff/app_patient roles from p0-5b are not wired into any
runtime DATABASE_URL."_ This is the migration author's own contemporaneous confirmation of the same
divergence, written into the repo in real time — not just my present-day inference.

### 2.4 The org backfill is anchored to the owner's specific identities, not generic

`0145_seed_client_org_enrollments.sql:3` hardcodes `v_default_org_id constant uuid :=
'a0000000-0000-4000-8000-000000000001'` and enrolls **every** `platform_users` row with `role='client'` into
that one organization — i.e. the migration chain assumes single-tenant PROD data collapses into one canonical
org, keyed to constants matched against the owner's real phone/email
(`deploy/host/deploy-test-saas.sh:111-118`, "KNOWN ANCHORS... same on prod": doctor phone
`+79643805480`, doctor email `dimmdao@yandex.ru`, org id `a0000000-...-001`, canonical specialist UUID
`c9515025-...`). If these don't match PROD's live data exactly at cutover time, the chain **fails loudly**
(`RAISE EXCEPTION`, e.g. `0145_seed_client_org_enrollments.sql:12-14`) rather than silently drifting — good
fail-closed design, but it means **this exact migration chain has only ever been validated against one
specific, aging copy of the dump**, and needs re-validation against a fresh dump pulled at the actual cutover
moment (data changes daily on real PROD).

---

## 3. Environment, identities, secrets

### 3.1 PROD service identity: API/worker/scheduler/media-worker run as **root** today

`deploy/systemd/bersoncarebot-{api,worker,scheduler,media-worker}-prod.service` (confirmed identical on `main`
via `git diff main..HEAD`) have **no `User=`/`Group=` directive**. Absent one, systemd runs a system-manager
unit as **root**. Only `bersoncarebot-webapp-prod.service` sets `User=deploy Group=deploy` explicitly. This
matches `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/INFRA-01_ENCRYPTED_PROD_MIGRATION.md` I1's own
checklist item: _"Перевести API/worker/scheduler/media-worker/webapp на отдельные non-root service users"_ —
i.e. this is a known, already-scoped, **not-yet-done** item, independent of the SaaS DB work.

### 3.2 TEST is mid-flight on OS identity hardening PROD hasn't started

`docs/_TODO/B1_B2_IDENTITY_SPLIT_RUNBOOK.md` (owner-authorized 2026-07-26, TEST only): both
`bersoncarebot-webapp-test.service` and `bersoncarebot-api-test.service` currently run as `deploy` (a
root-equivalent account — unrestricted `sudo systemctl/sed/apt-get`, plus a NOPASSWD `bash` escape hatch into
the unrelated `tgcarebot` project's OS account). The runbook's target: dedicated `bcb-web-test`/`bcb-api-test`
system accounts (`nologin`, no sudo, own primary group only), plus removing `local all all peer` from
`pg_hba.conf` (TEST currently allows any local OS user to `psql` in as any DB role by peer auth — the runbook
proves nothing depends on it, since every app connection is already TCP+`scram-sha-256`). **This delta is
explicitly PROD's future shape, not PROD's current shape** — the runbook's own line 12-13: _"PROD (135.x)
untouched — deltas noted inline where PROD will eventually differ."_ This is the memory item referenced by the
owner's prompt ("TEST just moved... TEST is now ahead of PROD here") — confirmed accurate, and it is a
**TEST-only, in-progress** change as of this writing, not yet verified end-to-end (the runbook's own §4
verification checklist had not, as far as the repo shows, been executed and confirmed at the time this
document was written).

### 3.3 What a clean-build PROD host needs (from `INFRA-01`, not invented here)

`docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/INFRA-01_ENCRYPTED_PROD_MIGRATION.md` already scopes
this as its own initiative, independent of the SaaS work: new host, LUKS-encrypted disk (two design options
under owner decision), non-root service users for every process, systemd sandboxing
(`NoNewPrivileges`/`PrivateTmp`/filesystem protection), nftables firewall with Postgres/app ports loopback-only,
least-privilege Postgres bootstrap with checksums, encrypted backup/restore with key-presence preflight, EDR/
HIDS agent decision (`G-06B`, still open), and a disposable rehearsal (`I2`) before touching real PROD
resources. **None of `I0`–`I5` has executed** (every checkbox in that file is unchecked as of this read). This
is real, separately-scoped infra work — it is not a byproduct of merging the SaaS branch.

### 3.4 Secrets: PROD's SMTP credential situation is already resolved, worth carrying forward

`docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md` §3.6 records a corrected 2026-07-25 finding: PROD's
real SMTP credential (`system_settings.smtp_outbound`) travels _with_ the prod dump and does not need separate
provisioning — but a TEST-only reset overlay (`test-settings-override.sql:88-91`) nulls it on TEST, which
previously caused a false "SMTP missing" conclusion when someone queried the _restored TEST DB_ instead of the
dump. Relevant here only as a documented trap: **querying TEST is not always a valid proxy for PROD state**,
even for things that "travel with the dump," because TEST's own reset/override machinery actively rewrites
values (SMTP, OAuth redirect URIs, base URLs, feature toggles) by design.

---

## 4. Data

**Everything in this section is inferred from the local TEST database, which is seeded from a PROD dump plus
the SaaS migration/backfill chain. Where TEST's shape reflects genuine pre-existing PROD data vs. TEST's own
migration-time construction is called out explicitly per item — conflating the two would be the exact mistake
§3.4 documents happening once already.**

- **`be_organizations`: 2 rows on TEST.** This is _not_ a PROD-data fact — PROD's dump (pre-`0141`) has no
  `be_organizations` table at all. TEST's 2 rows are constructed by the migration/seed chain itself
  (`0143_seed_staff_organization_members.sql`, the "KNOWN ANCHORS" `ORG_ID` constant, and the demo-clinics
  fixture referenced in `docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md` §2.2(a)). A fresh cutover
  against real PROD data would produce **1** organization (the owner's own clinic), not 2 — the second is a
  TEST-only synthetic demo tenant used for isolation-proof tests, explicitly called out as retired/re-seed-gated
  in that same doc.
- **`be_organization_members`: 2 rows, 0 with NULL `organization_id`.** Consistent with the doctor-only
  membership seed (`0143`) — proxy quality: HIGH, this mechanism is deterministic and re-derivable from real
  PROD data the same way.
- **`platform_users`: 282 rows (count only, TEST).** This _is_ real PROD-derived volume (platform_users predates
  the SaaS work and is not migration-constructed) — proxy quality: HIGH for row count, but the _shape_
  (no `organization_id` column, no RLS — §1.4) is a schema fact true on both TEST and a freshly-migrated PROD
  alike, not something the migration chain changes.
- **`patient_bookings`: 263 rows (count only, TEST).** Real dump-derived data; no `organization_id` column on
  this table (confirmed via `\d`), consistent with the memory note that `appointment_records`/`patient_bookings`
  are the same unscoped-by-column class as `platform_users` — tenant scoping for these tables happens through
  joins to specialist/organization membership, not a direct column. This is a genuine open item independent of
  the cutover itself (flagged in memory as `dormant-multitenant-leak-is-broad` / `saas-enforce-audit-gate-findings`),
  not something this inventory is resolving.
- **Historical correction (2026-07-29):** Rubitime runtime was retired 2026-07-27 and its R1–R7 packet is archived.
  An old dump may still contain provider tables, but current handling is only through reviewed normal migrations
  plus schema inventory; the archived cleanup scripts are not a current executable dependency. Provider-neutral
  `appointment_records` cleanup remains a separate concern.
- **ФИО (structured name) backfill is TEST-hardcoded today.** `apps/webapp/scripts/fio-backfill/*` hardcodes
  `targetDatabase="bersoncarebot_test"` and throws on any other target; a PROD-authorized path
  (`--allow-authorized-prod-target` + exact DB match, mirroring the RLS-finalizer's own gate pattern) landed
  2026-07-25 per that doc §8 "B-8... DONE" — so the _mechanism_ exists, but has never been run against real
  PROD data, only proven via the same TEST-copy-of-dump.

---

## 5. What is genuinely unrehearsed — never executed once, anywhere

1. **The SaaS migration chain (0136–0250) against a genuinely fresh, current-day PROD dump, taken at cutover
   time.** The one successful from-zero rehearsal (§2.2) used a dump that is now stale by definition — every
   day since, real PROD accumulates more appointments/clients that the hardcoded-anchor backfill
   (`0145`, §2.4) has never seen.
2. **`deploy-prod.sh`/`deploy-webapp-prod.sh` running with the SaaS overlays present, against a real PROD
   database, end to end.** Only the TEST closure (`deploy-test-saas.sh`) has ever run this sequence for real;
   no `deploy-prod-saas.sh` exists (tracked as `docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md` §8
   "B-9... taskdb #994," not yet built — the §3 grant closure for PROD is still a **manual instruction list**,
   not a script).
3. **Merging `feat/doctor-ui-rebuild` (or any equivalent) into `main`.** 1,831 commits, 3,729 files. This has
   never been attempted, let alone landed. It is a precondition for `deploy-prod.sh` to pull anything but the
   July 1 codebase, and is its own significant integration risk (merge conflicts, CI status — the most recent
   commits on this branch describe CI as red as of 2026-07-26, per `git log`: _"docs: close F-4/F-5 and finish
   the handoff — CI is red and left for the next session"_).
4. **The strict-RLS finalizer (`test-strict-rls-finalizer.sql -v allow_authorized_prod_target=1`) against a
   real PROD-named database.** Built and gated (§3.5 of the process doc), never invoked outside TEST.
5. **The B-1/B-2 OS-identity split, end to end, verified.** Authorized and (per the runbook document) executed
   on TEST as of 2026-07-26, but this document could not confirm from the repo whether its own §4 verification
   checklist was run and passed — and even if it was, it has never been attempted against PROD's actual
   `deploy` account, which additionally carries the `tgcarebot` cross-project sudo escape hatch (§3.2) not
   present in the TEST runbook's stated scope.
6. **Root→non-root conversion of api/worker/scheduler/media-worker (§3.1) anywhere, including TEST.** This is
   scoped only in `INFRA-01` as a checklist item; no runbook or execution evidence exists in the repo for it,
   TEST included (TEST's split runbook only covers webapp+api, and even there only flips _ownership_, not
   root-vs-non-root — TEST's services were already non-root under `deploy`).
7. **A restore/DR drill of an encrypted backup** (`INFRA-01` `DR-01/02`) — gates the whole cutover per that
   doc's own dependency list (`I0`), unchecked.
8. **The Rubitime/legacy table drop (`appointment_records` specifically) against real data** — explicitly
   blocked in the repo's own tracking doc, not merely unrehearsed.

---

## 6. What a clean-build target server needs, in order, that TEST didn't need because it grew incrementally

TEST's current shape is the result of dozens of point-in-time incident fixes and manual `sudo -u postgres`
interventions (e.g. §2.2's eight rehearsal fixes, the 2026-07-24 grant-pollution incident recorded in
`docs/_TODO/ROLE_GRANTS_PROVENANCE_AND_PROD_MIGRATION_PLAN.md`). A from-zero host needs the **discovered, not
yet fully codified**, correct order:

1. Host, disk encryption, firewall, non-root OS accounts for every service (`INFRA-01` I0–I3) — **before**
   any application code lands.
2. `main` fast-forwarded/merged to include this branch's schema, deploy scripts, and `deploy/postgres/`
   overlays — otherwise there is nothing SaaS-shaped to deploy at all (§0, §1.1).
3. **Runtime roles (`app_owner`/`app_staff`/`app_patient`, C4 5-contour operational roles) created BEFORE the
   migration chain runs** — this ordering was discovered the hard way in the one rehearsal that exists
   (§2.2's "HARD PREREQUISITE"), and inverts the naive assumption that migrations happen first.
   `docs/_TODO/SAAS_FOUNDATION/SAAS_PROD_DEPLOY_PROCESS.md` §2.1 already states this reordering explicitly:
   _"roles only → migrate → grants"_ for a virgin host.
4. A fresh PROD dump, restored, with the identity data-fix (`p0-data-fix-doctor-admin-split.sql`) applied
   before the org-membership seed migration (`0143`) — order matters, already documented and scripted.
5. The full migration chain (0000–0250), including the fail-fast anchor checks (§2.4) — expect this to
   surface data drift vs. the last rehearsed dump; budget time to fix, not assume it's clean.
6. Retired provider mirrors — handled only by the reviewed normal migration chain; old archive/drop scripts are
   historical. Provider-neutral appointment cleanup remains a separate owner-reviewed workstream.
7. The manual grant-overlay sequence from `SAAS_PROD_DEPLOY_PROCESS.md` §3 (7 ordered steps, role names
   substituted for PROD) — currently hand-run, not scripted (taskdb #994 tracks building the script; not done).
8. The strict-RLS finalizer with the explicit PROD-target flag (§3.5) — after grants, before service restart.
9. Service deploy + the same `assert_*` gates TEST already runs, pointed at PROD env files, **before** traffic
   cutover (`SAAS_PROD_DEPLOY_PROCESS.md` §4) — this is the one layer that is genuinely ready as-is (env-
   parameterized, no PROD lockout).
10. Locked product smoke green, then owner GO, then DNS/traffic cutover per `INFRA-01` I5's phased rollback
    model.

Steps 3 and 7–8 are the ones TEST's incremental growth papered over (roles and grants already existed on the
long-lived TEST box from earlier deploys before anyone tried a from-zero run) — they are the steps most likely
to surprise a real cutover if skipped or under-tested.

---

## 7. What can only be found by doing it

- **Whether the fresh-dump migration chain still runs clean against a _current_ PROD dump.** The anchors
  (§2.4) are exact-match assertions against live identity data that changes daily; no amount of reading proves
  they still hold — only a rehearsal against a dump pulled close to the actual cutover date will.
- **Whether `main`, once fast-forwarded 1,831 commits, actually builds and passes full CI on the target host.**
  This branch's own recent commit history records CI red as of 2026-07-26; merge conflicts and environment
  differences (Node/pnpm versions, build toolchain) between a 25-day-old `main` and this branch are unknown
  until attempted.
- **The B-1/B-2 OS-identity split's actual blast radius against PROD's real `deploy` account**, which the TEST
  runbook explicitly did not model (PROD's `deploy` additionally holds the `tgcarebot` sudo escape hatch —
  §3.2). Whether narrowing `pg_hba.conf`'s catch-all breaks anything PROD-specific can only be proven by
  auditing PROD's actual `psql` call sites and cron jobs the way the TEST runbook did for TEST (`§1
Discovery`) — not assumed to transfer.
- **Whether the manual §3 grant sequence (7 hand-run steps) is actually complete** for PROD's role names —
  it has literally never been executed against a real PROD-shaped role set; the "MANUAL" designation in the
  owner's own plan doc is itself an admission that this hasn't been proven mechanically.
- **Real wall-clock time for the pre-migrations `pg_dump` backup step** (`deploy-prod.sh:143`,
  `sudo -n "${BACKUP_SCRIPT}" pre-migrations`) against PROD's actual data volume — TEST's dump size is a
  reasonable proxy but downtime-budget planning (`INFRA-01` I0's RPO/RTO gate) needs the real number.
- **Whether root→non-root conversion of api/worker/scheduler/media-worker breaks anything** — no rehearsal of
  this exists anywhere in the repo, TEST included; only reading the source for filesystem/socket assumptions
  can approximate it, and the TEST OS-identity runbook itself notes it found a real gap (Next.js image-cache
  writes) that pure reading would have missed had someone not checked empirically (§1 of that runbook).

---

## 8. Rough size

**This is a multi-week effort, not a day and not "just flip a flag."** Drivers, in descending order of
schedule risk:

1. **Merging 1,831 commits / 3,729 files to `main`, green CI.** By itself this is unpredictable — CI is
   currently red on the source branch, and a merge of this size routinely surfaces integration issues no
   amount of individual-file review catches. Budget days, not hours, and expect at least one full regression
   pass after landing.
2. **`INFRA-01` (new encrypted host) is its own multi-phase initiative** (I0 owner/provider gates → I1 repo
   work → I2 disposable rehearsal → I3 staging → I4 final rehearsal → I5 cutover → I6 decommission), currently
   at zero checked boxes. Some of I1's work (non-root service users) is real engineering that has not started
   anywhere, TEST included. This alone is a multi-day-to-multi-week track, partly parallel to the DB work.
3. **The prod-side grant closure script (`deploy-prod-saas.sh`, taskdb #994) does not exist** — today it is a
   7-step manual instruction list. Scripting and proving it (even reusing existing TEST overlay files) is a
   scoped multi-day engineering task per the plan doc's own estimate ("a real lift... not a one-liner").
4. **Several cutover-blocking items are explicitly unbuilt or unauthorized**, not merely undocumented: the
   `appointment_records` DROP, four owner product decisions gating the R3-CATALOG legacy-booking cleanup
   (`SAAS_PROD_DEPLOY_PROCESS.md` §8's item 4c, 4 numbered decisions), the demo-fixture-vs-real-identity choice
   for automated verification (§2.2(a) of the same doc), and the prod-side FIO apply (mechanism built, never
   run for real).
5. **A from-zero rehearsal took 8 fix-and-retry cycles the one time it was attempted** (§2.2). Each cycle on a
   real cutover costs real time and, past the point of no return, real downtime — this argues for at least one
   more full disposable rehearsal _after_ incorporating this document's findings, before touching real PROD.
6. **Owner/legal/external gates are outside engineering's control entirely** (Selectel region confirmation,
   RKN/PR-04 notification, crypto ADR sign-off, DR restore drill with the owner's own age-key) and have no
   estimate here — they are calendar-bound by the owner and external parties, not by agent throughput.

Put together: the DB-migration mechanics alone (§2, §6) are roughly a rehearsed **week** of focused work
_given_ the branch is already on `main` and roles/scripting gaps (§8.3) are closed. Add the merge (§8.1) and
the new-host build (§8.2), both of which are prerequisites, not parallel nice-to-haves for the DB work to
matter, and the realistic total is **measured in weeks**, gated at several points by explicit owner decisions
this document does not make on the owner's behalf (§5 items 3, 4; §8 items 3, 4).

---

## UNKNOWN — requires touching PROD or asking the owner

These cannot be resolved from this repo, TEST, or documentation, and were not guessed:

1. **PROD's actual live role/grant state today** — `SAAS_PROD_DEPLOY_PROCESS.md` §3's own caveat: "a migration
   comment says prod's integrator role has table access via ownership... **INFERRED, unverifiable from this
   TEST box**." Needs a read-only `\du` + `pg_tables.tableowner` inspection by whoever has sanctioned PROD
   access. Flagged in that doc as a MANUAL prerequisite, still open as far as this repo shows.
2. **PROD's `pg_hba.conf` shape.** Not documented anywhere in this repo (`grep pg_hba deploy/HOST_DEPLOY_README.md`
   returns nothing). TEST's shape (§3.2) is not assumed to transfer.
3. **Whether PROD's `deploy` OS account's `tgcarebot` sudo escape hatch and blanket root-equivalent sudo are
   still exactly as described in the TEST discovery** — that discovery was run against TEST's own `deploy`
   account, explicitly scoped to TEST (`B1_B2_IDENTITY_SPLIT_RUNBOOK.md` line 12: "PROD (135.x) untouched").
4. **Real PROD data volume/shape for `appointment_records`, `patient_bookings`, and any other table without an
   `organization_id` column** — TEST's counts (§4) are dump-derived and a reasonable proxy for _shape_, but
   not for _current_ row counts, since real PROD keeps accumulating data the TEST dump doesn't reflect.
5. **Whether the SMTP credential and other `system_settings` values in the _current_ PROD dump still match
   what was found 2026-07-25** (§3.4) — that was a one-time check against a dump that is now stale.
6. **Exact downtime/backup-duration numbers** for the pre-migration `pg_dump` step against real PROD data size
   (§7) — needed for the `INFRA-01` I0 RPO/RTO gate, not derivable from TEST's smaller/differently-shaped copy.
7. **Whether CI is still red on this branch at the moment a merge to `main` is actually attempted** — this is
   a live, changing fact, not a stable one to record here.
