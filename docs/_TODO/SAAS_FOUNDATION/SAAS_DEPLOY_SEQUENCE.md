# SaaS deploy sequence — TEST and PROD (RECORDED, proven 2026-07-12)

> Superseded hard protocol: for the current fresh-dump hard migration sequence, use
> [`HARD_MIGRATION_PROTOCOL.md`](HARD_MIGRATION_PROTOCOL.md) and the executable wrapper
> `deploy/host/deploy-test-full-reset.sh` (public owner-gated entrypoint; `deploy-test-saas.sh` is its internal
> closure engine). The old commands below are historical context and must not override
> the wrapper's current fresh live `pg_dump` + owner/cleanup assertions.

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

## Historical A/B sequence (superseded)

The recorded 2026-07-12 rehearsal first left migration 0177 in dormant/NO FORCE state and then planned a separate
enforce flip. That split is retained only as provenance for disposable compatibility testing. It must not be copied
or run against TEST.

Current TEST has one supported outcome: writers stop, the wrapper performs migrations/data cleanup/roles/grants and
all reviewed overlays, including the E1 closed telemetry API, then `deploy/postgres/test-strict-rls-finalizer.sql`
applies base policies → safe invite/course/app_worker overlays → FORCE with exact catalog/semantic assertions.
Temporary privileges are revoked, fixtures reconcile in a separate short privilege window, and only locked units
that pass fail-closed health plus mandatory product smoke remain running. A failure is fixed in code/policy; walls
are not disabled as recovery.

Use only:

```bash
bash deploy/host/deploy-test-full-reset.sh --confirm-full-reset <hash-bound-owner-inputs> feat/doctor-ui-rebuild
```

For a code-only update of the existing TEST database use `deploy/host/deploy-test.sh`; it now owns the same controlled
migration privilege window and invokes the same shared post-migration closure (roles/helpers/grants/telemetry,
strict finalizer, fixture, restart/health/smoke). Manual restore/SQL chains are prohibited.

## PROD mapping (eventual)

- Code: merge to `main` → CI auto-deploys `deploy/host/deploy-prod.sh` (build + `pnpm migrate` + schema guardrail).
  BUT the same #667 gap applies → prod must run the **`scripts/deploy-saas-667.sh`** chain (which already bundles
  data-fix + option-D temp-BYPASSRLS migrate + post-asserts) in a stopped-writers window, NOT the plain deploy.
- Production remains a separate owner-approved cutover; this historical TEST note does not authorize it.

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

> ⚠️ **SUPERSEDED (2026-07-26).** Granting the admin role via DB-resident `admin_*`/`doctor_*` allowlists —
> the mechanism this section works around — is the superseded scheme. Canon:
> [ADMIN_ACCESS_MODEL.md](../../ARCHITECTURE/ADMIN_ACCESS_MODEL.md).

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
`public.system_settings` has PARTIAL unique indexes: global `UNIQUE (key, scope) WHERE organization_id IS NULL`
and org `UNIQUE (key, scope, organization_id) WHERE organization_id IS NOT NULL`.
The override inserts GLOBAL rows, so change every `ON CONFLICT (key, scope) DO UPDATE` →
`ON CONFLICT (key, scope) WHERE organization_id IS NULL DO UPDATE` (matches the global partial index). Applied
cleanly on test. The permanent canonical file is `deploy/postgres/test-settings-override.sql`; do not recreate
the former `/tmp/bcb-test-setup` copy.

Current mode contract (2026-07-23): callers must pass `test_settings_overlay_mode=code-only` for an ordinary
existing-DB deploy or `test_settings_overlay_mode=reset` for a fresh/reset rehearsal. Code-only preserves the
canonical global DB-backed SMTP value and aligns the integrator mirror; reset scrubs both. The SQL refuses a
missing/unknown mode before dropping locks. `smtp_outbound` is writable through Settings/`updateSetting`; the other
TEST-only locked keys remain protected.

## Current status

The single hard TEST wrapper and repo-tracked settings override are implemented. There is no separate supported
`flip-test-saas.sh`: strict/FORCE finalization is mandatory inside every supported TEST migration path.
