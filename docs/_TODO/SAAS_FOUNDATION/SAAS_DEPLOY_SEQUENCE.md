# SaaS deploy sequence — TEST and PROD (RECORDED, proven 2026-07-12)

> The plain `deploy-test.sh` / `pnpm migrate` is **INSUFFICIENT** for the SaaS branch on a real prod DB.
> It fails because (a) a migration asserts the doctor/admin membership seed that a **data-fix** must run FIRST,
> and (b) some migrations backfill under already-installed FORCE RLS, needing a **temp BYPASSRLS** migrator.
> This is the #667/#708 gap. The sequence below is what actually works (proven end-to-end on the test box:
> restored fresh prod copy → migrations reached drizzle count 179, org columns present, app healthy).

## Roles / facts
- Test env is LOCAL on this box (no SSH). DB `bersoncarebot_test` (owner role `bersoncarebot_test`).
- Newest prod dump: `/opt/backups/postgres/hourly/unified_bcb_webapp_prod_*.dump` (hourly). Use the newest.
- Env files: `/opt/env/bersoncarebot/api.test`, `/opt/env/bersoncarebot/webapp.test`.
- Deploy repo: `/opt/projects/bersoncarebot-test` (checked out as user `deploy`).
- Test units: `bersoncarebot-{api,worker,scheduler,webapp,media-worker}-test`.

## A. DORMANT deploy to TEST (walls installed, asleep — app behaves as today)

```bash
DUMP=$(sudo -u postgres bash -lc "ls -t /opt/backups/postgres/hourly/*.dump | head -1")

# 1. Fresh test DB = clean prod copy
sudo -u postgres bash /tmp/bcb-test-setup/restore-test-db.sh "$DUMP"

# 2. Deploy code (bundle branch → build → checkout). Uses deploy-test.sh but its migrate step WILL fail —
#    that is expected; steps 3-4 do the correct migrate. (Or split: run only the build part.)
bash deploy/host/deploy-test.sh auto/code-pg-delta   # migrate step fails here — ignore, do steps 3-4

# 3. DATA-FIX first (the missing step — deploy-saas-667.sh Step 2)
sudo -u deploy bash -lc "cd /opt/projects/bersoncarebot-test && set -a && . /opt/env/bersoncarebot/webapp.test && set +a && \
  psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -f deploy/postgres/p0-data-fix-doctor-admin-split.sql"

# 4. Migrate with TEMP BYPASSRLS (backfills under FORCE RLS), always revoke
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE bersoncarebot_test BYPASSRLS;"
sudo -u deploy bash -lc "cd /opt/projects/bersoncarebot-test && \
  API_ENV_FILE=/opt/env/bersoncarebot/api.test WEBAPP_ENV_FILE=/opt/env/bersoncarebot/webapp.test pnpm migrate"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE bersoncarebot_test NOBYPASSRLS;"
# verify: drizzle count >= 178, org columns present
sudo -u postgres psql -d bersoncarebot_test -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations;"  # expect >=178

# 5. Test-only settings override (send-safety redirect targets, maintenance bypass). NOTE: the override
#    uses ON CONFLICT (key, scope); system_settings now has a wider org-aware unique key — override needs
#    updating to match (see TODO below) or apply the fixed variant.
sudo -u postgres psql -d bersoncarebot_test -v ON_ERROR_STOP=1 -f /tmp/bcb-test-setup/test-settings-override.sql

# 6. Restart + verify
for u in api worker scheduler webapp media-worker; do sudo systemctl restart "bersoncarebot-$u-test"; done
curl -sk https://test.bersoncare.ru/api/health      # expect {"ok":true,"db":"up"}
systemctl is-active awg-quick@awg0                   # must stay 'active' (prod relay untouched)
```
Walls stay DORMANT: `DB_PRINCIPAL_CONTEXT_MODE=legacy-guc` (default). App connects as owner; single-clinic = today.

## B. FLIP to ENFORCE on TEST (walls ON — real cross-clinic isolation)
> Separate, deliberate step AFTER A is verified. Do NOT bundle into A.
> This is the option-D / phase4 cutover; the rehearsal proved the exact SQL. Sequence (roles → strict policies →
> FORCE → grants → locked mode → role switch). To be scripted from `scripts/deploy-saas-667.sh` + the phase4
> artifacts (`deploy/postgres/phase4-locked-helper-rls-policies.sql -v phase4_enforce_locked_context=1`,
> `phase4-force-rls-cutover.sql` with `phase4_bootstrap_base_role`/`phase4_staff_role`/`phase4_owner_role` vars,
> `p0-5b-role-split-staff-patient.sql`, `p0-5b-grants.sql`), then set the app env to
> `DB_PRINCIPAL_CONTEXT_MODE=locked` and restart. FILL EXACT COMMANDS HERE once run on test.

## PROD mapping (eventual)
- Code: merge to `main` → CI auto-deploys `deploy/host/deploy-prod.sh` (build + `pnpm migrate` + schema guardrail).
  BUT the same #667 gap applies → prod must run the **`scripts/deploy-saas-667.sh`** chain (which already bundles
  data-fix + option-D temp-BYPASSRLS migrate + post-asserts) in a stopped-writers window, NOT the plain deploy.
- So PROD dormant deploy = `deploy-saas-667.sh` (option-D). PROD flip = phase4 enforce artifacts (section B).

## Duplicate-specialist consolidation (RESOLVED 2026-07-13)
Historical rubitime-per-branch specialists left TWO active "Дмитрий Берсон" rows in `be_specialists`
(`c9515025` = full history, `518ea988` = per-branch dup). The solo-model resolver
(`resolveDoctorOwnSpecialistId`) picks the first active specialist arbitrarily, so the doctor's schedule
showed a partial/empty set. `deploy-test-saas.sh` step 6 now runs the sanctioned, idempotent
`consolidate-specialist-identity.ts` with a PINNED `--canonical=c9515025 --org=a0000000-…-0001`: it
REPOINTS every FK ref (appointments, working-hours/days, service-availability, rubitime mappings) of the
dup → canonical and SOFT-deactivates the dup (never deletes appointment data; overlapping double-books are
left on the dup, not dropped). Step 7 asserts the end-state (1 active specialist, 0 appts on NULL/inactive,
doctor role held, `admin_phones=[]`) so every from-zero run converges to the same correct state.
NOTE: all appointments in the current prod copy are historical (newest ~2026-06-27); the current-week view
is legitimately empty — browse to June or seed a future appointment to see records.

## Identity role-allowlist normalization (RESOLVED 2026-07-13)
The prod dump carries the owner's OWN phone/telegram/MAX in the `admin_*` allowlists of
`system_settings` (BOTH `public` and the duplicate `integrator` copy). `resolveRoleAsync` reads those
DB allowlists FIRST (env is only fallback) and force-promotes the owner's DOCTOR login to admin on every
messenger poll → the doctor workspace (calendar) 403s. The canonical override
(`deploy/postgres/test-settings-override.sql`, §8) now moves the owner's identifiers `admin_* → doctor_*`
in both schemas on every deploy, so a fresh clean-cycle deploy no longer re-introduces the bug. This is a
STOPGAP; the real fix is replacing allowlist role-forcing with account+membership resolution (see
SAAS_ENFORCE_ROADMAP "replace auth mechanism").

## Settings-override fix (RESOLVED 2026-07-12; override now repo-tracked 2026-07-13)
The override moved from `/tmp/bcb-test-setup/test-settings-override.sql` into the repo at
`deploy/postgres/test-settings-override.sql`; all upserts use the org-aware partial-index conflict target
`ON CONFLICT (key, scope) WHERE organization_id IS NULL` directly (no more sed rewrite in the deploy script).
system_settings now has PARTIAL unique indexes: global `UNIQUE (key, scope) WHERE organization_id IS NULL` and
org `UNIQUE (key, scope, organization_id) WHERE organization_id IS NOT NULL` (same for integrator.system_settings).
The override inserts GLOBAL rows, so change every `ON CONFLICT (key, scope) DO UPDATE` →
`ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE` (matches the global partial index). Applied
cleanly on test. Fold this into `/tmp/bcb-test-setup/test-settings-override.sql` permanently.

## TODO (small, tracked)
- Turn section A into a single script `deploy/host/deploy-test-saas.sh`; turn section B into `flip-test-saas.sh`.
- Persist the override ON-CONFLICT fix into the canonical test-settings-override.sql.
