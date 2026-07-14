# D1 #664 WITH CHECK and deferred columns re-verify

Status: repo/scratch evidence package, 2026-07-14. This document does not authorize TEST/PROD/dev
database access, runtime credential flips, service restarts, live delivery, or S3 work.

## Scope

Authoritative source: `SAAS_ENFORCE_ROADMAP.md` finalization v0.3. taskdb #664 is already done/sealed
at commit `02936c257`; D1 is an independent re-verify, not a reimplementation.

The exact #664 columns are pinned here and in
`scripts/check-d1-664-with-check-reverify.mjs`:

- `user_channel_preferences.is_preferred_for_auth` — patient OTP-channel preference.
- `public.treatment_program_events.actor_id` — patient progress/audit actor.

Do not re-derive or expand these columns from older roadmap text.

## Repo/scratch evidence

Static grant contract:

- `scripts/p0-5b-grants-sql.mjs` keeps `public.treatment_program_events` at app_patient
  table-level `SELECT` and adds a column-level `INSERT` grant that excludes `actor_id`.
- The same generator keeps `public.user_channel_preferences` at table-level `SELECT` and permits
  column-level `INSERT`/`UPDATE` of `is_preferred_for_auth` only as part of the curated patient OTP
  channel surface.
- `P0_5B_GRANTS.md` documents why `actor_id` remains excluded at the grant layer and why
  `is_preferred_for_auth` is re-added only behind the P2-C2 value guard.

Value/WITH CHECK-equivalent guard contract:

- `deploy/postgres/p2-b-protected-principal-context.sql` grants the protected-context owner `USAGE`
  on `app_ext`, so the SECURITY DEFINER `app.install_signed_context(...)` function can call
  `app_ext.hmac(...)` during scratch/live proof execution.
- `deploy/postgres/p2-c1-patient-value-guards.sql` fills `treatment_program_events.actor_id` from
  `app.current_patient_user_id()` for patient-context inserts, rejects explicit foreign actor ids,
  verifies owned program instance/org, and lets staff context bypass the patient-only guard.
- `deploy/postgres/p2-c2-patient-value-guards.sql` permits preferred auth channel writes only for
  owned rows and auth-capable channels (`telegram`, `max`, `email`, `sms`), and rejects a second
  preferred auth row before the partial unique index is the only line of defense.

Scratch proof coverage to run where local postgres sudo is available:

- `smoke-p0-5b-grants.mjs`: app_patient cannot insert `treatment_program_events.actor_id`; app_patient
  can write `user_channel_preferences.is_preferred_for_auth` because P2-C2 owns value safety. This
  older smoke uses fixed cluster roles `app_staff`/`app_patient`; on a shared server where those roles
  already own objects in non-scratch databases, it may prove assertions and then fail cleanup. Treat it
  as safe to run only where those roles are disposable or cross-database role dependencies are absent.
- `smoke-p2-c1-patient-value-guards.mjs`: treatment event actor auto-fill succeeds, cross-org /
  cross-patient instance writes are rejected, explicit forged actor is rejected, forbidden event shape
  is rejected, and staff context bypasses the patient guard.
- `smoke-p2-c2-patient-value-guards.mjs`: owned auth-channel insert/update succeeds, legacy
  platform-owned row update succeeds, non-auth preferred channel is rejected, foreign patient row is
  rejected, and second preferred row is rejected.
- `smoke-p2-composed-rls-grants-value-guards.mjs`: grants + P2-C1/C2/C3 guards + generated enforce RLS
  work together for the representative synthetic schema; it covers actor auto-fill/forgery denial and
  channel preference non-auth/foreign-user denial under composed policy/grant conditions.

## Checklist

- [x] Code-search used before exact file reads for D1/#664/patient value guard locations.
- [x] #664 exact columns pinned without re-deriving them.
- [x] `public.treatment_program_events.actor_id` excluded from app_patient INSERT column grant.
- [x] `user_channel_preferences.is_preferred_for_auth` allowed only through the curated column grant
  plus P2-C2 ownership/auth-channel/one-preferred guard.
- [x] Patient treatment event actor auto-fill, cross-org / cross-patient instance rejection, forged
  actor rejection, and staff bypass are covered by scratch smoke assertions.
- [x] User channel preference owned auth-channel writes, non-auth rejection, foreign patient rejection,
  and second-preferred rejection are covered by scratch smoke assertions.
- [x] Bootstrap/legacy semantics documented honestly: legacy `user_id` rows are allowed only when
  owned by `platform_user_id`; no separate bootstrap/pre-auth smoke is claimed in D1.
- [ ] Owner-authorized strict+FORCE/live gates remain future work.

## Future owner-authorized gates

The repo/scratch package does not prove live TEST/PROD behavior. A later owner-approved gate must run
the strict+FORCE/live role matrix against an authorized disposable prod-copy or TEST target, with real
runtime roles and without printing PII. That future gate should explicitly confirm the same two
columns under the deployed policy/grant state and should record whether any bootstrap/pre-auth OTP
flow needs a separate role/grant smoke.

No prod/test/dev DB, `/opt/env`, SSH, service restart, real delivery, or S3 operation is part of D1.
