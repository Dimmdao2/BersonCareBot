# FIX round for `F4` — the delivery gate still reads the old global toggles

Rules: `AGENTS.md` is the single canon — `grep -n "^## \|^### " AGENTS.md`, find your topic, read that section
before acting (§24 covers delegated repo-work).

Branch `wt/night-f4-20260823`, clone `/home/dev/dev-projects/bcb-wt-night-f4-20260823`.
Independent audit verdict: `FAIL, NOT FOR LAND`, report
`docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_NIGHT_F4_2026-08-23.md` (commit `f6b15c851`).
Read blocker `B-1` and non-blocking `N-3` and `N-5` there before you touch anything.

Источник оракула: `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` §1.2j — «разделить настройки входа для клиник и пациентов В НАСТРОЙКАХ ГЛОБАЛ АДМИНА — и всё».

Owner's plan item (the ONLY source of scope) — `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`
§1.2j / `F4`: split the login settings for clinics and patients in the global-admin settings. Nothing else from
the audit is in scope. Blocker `B-2` (patient and platform_admin hosts do not exist in the deployment yet) is an
owner fork and is explicitly NOT yours — do not touch env templates, do not invent a host, do not add UI warnings.

## What is broken

`apps/webapp` now decides per surface, but `apps/integrator/src/infra/db/authChannelPolicy.ts` holds a SECOND
implementation of `isAuthChannelEnabled` reading the OLD keys (`auth_email_enabled`, `auth_sms_enabled`,
`auth_telegram_enabled`, `auth_max_enabled`). It gates four routes in `apps/integrator/src/app/routes.ts`:
`send-otp`, `send-email`, `send-sms`, `request-contact` — the actual delivery of login codes. The DB function
`app.read_integrator_auth_channel_setting` hardcodes those four legacy key names in a `WHERE p_key IN (...)`,
so the integrator physically cannot read a surface-aware key.

Reachable consequence, measured by the auditor: the owner turns Telegram on for patients, the webapp offers the
method (`botUsername` appears on the patient host), the integrator sees the old global `false` and refuses to
deliver. Button present, code never arrives. Mirror case: the owner turns email off on all three surfaces, the
webapp closes login, the integrator's `send-email` door stays open on the old key.

## Task 1 (blocking) — one source of truth for the delivery gate

FIRST measure, then choose:

1. Enumerate every caller of those four integrator routes. Is the webapp the only client, or are there others
   (bot, cron, external)? Name files and lines. This decides the shape of the fix.
2. Decide between the two shapes and say in your report WHY, with the measurement behind it:
   - **(a) thread the surface through**: the webapp already resolved the surface; pass it explicitly on the call
     and let the integrator read `auth_surface_<surface>_<method>_enabled`; the DB function's key list has to
     stop being a hardcoded four-name allowlist. A missing/unknown surface must fail CLOSED, never fall back to
     a legacy key.
   - **(b) remove the duplicate gate**: if the webapp is the only client and it has already decided, a second
     decision point contradicts the owner's standing rule «ОДИН chokepoint» and `TPB-16`. Removing a gate is only
     acceptable if you prove no other client reaches those routes.
   If both are defensible, prefer the one that leaves exactly ONE place where «is this method allowed» is decided.
   Do not build a third mechanism, do not add a config flag to choose between them.
3. Whatever you pick: after your change there must be NO code path that decides login-method availability from
   `auth_<method>_enabled`. Prove it with a repository-wide sweep in your report (command + output), not a claim.
4. Legacy rows may stay in the tables for genuinely non-login consumers — but then name each such consumer with
   file and line. If there are none, say so.

## Task 2 (blocking) — test the path that actually ships (`N-3`)

Both existing tests pass the surface as an ARGUMENT; all 72 production call sites take it from the resolved
header. The auditor proved the whole split can be deleted and the suite stays green. Add tests that drive the
real path — through `x-bc-resolved-surface`, the way `proxy.b5Audit.route.test.ts` and
`proxy.b5aAudit.route.test.ts` already do it in this repo. Cover at least: one method enabled for one surface and
disabled for another, both directions; and the delivery gate from Task 1 with the same split. Then prove the
tests bite: delete the surface split in your working copy, run them, show the failures, restore.

## Task 3 (blocking) — one declared default, not two (`N-5`)

The registry's declared defaults for the 27 new keys contradict the old declared defaults in 18 of 27 cells
(`telegram`, `max`, three OAuth providers were `true` → now `false`; `passkey` was `false` → now `true`). Nothing
reads `defaultValue` today, so this is harmless right now and hazardous the moment someone builds an environment
from the registry. Reconcile so a fresh environment gets the same set of login methods the running one has, and
write a source comment naming which of the two you kept and why. If reconciling requires an owner decision about
what the default SHOULD be, do not guess — stop and say so in the report.

## Out of scope, do not do

- `B-2` (missing patient/admin hosts, env templates) — owner's fork.
- `N-4` (`BCB-MIGRATION-VERIFY` has no executor) — a pre-existing repo-wide class, recorded 22.08, not `F4`'s.
- `N-6` (the compiled matrix copy riding in the header) — no decision reads it; leave it.
- `N-7` (`password`/`totp` per-surface toggles) — owner's question, not work.
- The neighbour's `pre-session exact gate` defect (`app.email_auth_find_email_challenge_for_confirm`): do not fix
  it, do not work around it. If the global reconcile stops there, record it and move on.
- Do not merge anything into `feat/doctor-ui-rebuild`.

## Migrations

The `F4` migration `20260823T173446_split_auth_settings_by_surface.sql` is ALREADY APPLIED on DEV. Editing an
applied migration reaches no live database — if the DB function needs to change, write a NEW forward migration.

## Proof required before you report done

- Live DEV: `apps/webapp/scripts/migrate-dev.sh --preflight` then `--execute` for anything new. `.env` and
  `apps/webapp/.env.dev` are already in this clone; if a guard refuses, report it, never bypass it.
- A live measurement of the fixed scenario: with a method enabled on the patient surface and off elsewhere, show
  that delivery is permitted for the patient and refused for the others — and the mirror case. Show the actual
  requests and responses, not a description.
- Targeted tests, `tsc`, scoped ESLint. Full CI is the lead's job, not yours.
- Report: what you measured, which shape you chose and why, what you did NOT do and why.
