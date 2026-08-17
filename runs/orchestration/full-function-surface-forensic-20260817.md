# Full PostgreSQL function-surface forensic — 2026-08-17

Scope: independent read-only reconstruction and lexical/token audit of the full declared function universe at
`46347c4a5`; no database, env, deploy, product code, or generated privilege SQL was changed.

Machine ledger: `runs/orchestration/full-function-surface-forensic-20260817.json`.

## Measured result

Command:

```bash
node --experimental-strip-types runs/orchestration/full-function-surface-forensic-20260817.mjs \
  --output runs/orchestration/full-function-surface-forensic-20260817.json
```

The expected exit code is `1` on the audited base because six real DEFINER declaration gaps remain. The ledger
contains 384 declarations (368 DEFINER, 16 INVOKER), 382 reconstructed bodies, and two expected external extension
bodies (`app_ext.digest`, `app_ext.hmac`). The independent parser probe is `PASS`.

## Six real DEFINER under-declarations

1. `app.patient_cancel_pending_reminder_occurrences(text)` → `public.reminder_rules:SELECT` (owner grant masked by siblings).
2. `app.read_current_patient_organization_entitlements()` → `public.saas_paid_period_policy:SELECT` (the only unmasked owner ACL gap).
3. `app.create_current_patient_booking_appointments(text)` → `public.be_appointments:SELECT` (`INSERT RETURNING`; masked).
4. `app.update_current_patient_fio(text,text,text)` → `public.platform_users:SELECT` (`UPDATE` predicate; masked).
5. The same FIO function → `public.user_identity:SELECT` (`ON CONFLICT DO UPDATE`; masked).
6. `app.enqueue_media_transcode_job_for_staff(uuid)` → `public.media_files:SELECT` (`PERFORM … FROM`; masked and missed by the runtime regex).

The paid-period surface must not be encoded as a permanent DEV-only function contract. The current canonical DEV
body reads it; TEST should converge to that accepted body during the one-time transition, then both declarations
carry the same surface. The only explicit TEST-only functions are the SaaS isolation fixtures.

## Twenty-seven proven over-declared triples

Twenty-three belong to zero-direct-relation wrappers and should become `relationSurfaces: []` plus the exact
`delegatesTo` target:

- `app.email_auth_find_email_owner_conflict(uuid,text)`: `public.platform_users:SELECT`; delegates to
  `app.find_platform_user_ids_by_any_confirmed_email(text)`.
- `app.password_login_acquire(text,text,uuid,text)`: password-altcha `SELECT/UPDATE/DELETE` (3), identifier-protection
  `SELECT/INSERT/UPDATE/DELETE` (4), platform-users `SELECT` (1), password-credentials `SELECT/UPDATE` (2); delegates
  to `app.password_login_acquire_impl(text,text,uuid,text)` — 10 triples.
- `app.password_login_complete(uuid,boolean)`: identifier-protection `SELECT/UPDATE` (2), platform-users `SELECT`
  (1), password-credentials `SELECT/UPDATE` (2); delegates to `app.password_login_complete_impl(uuid,boolean)` — 5.
- `app.password_login_issue_altcha_challenge(text,uuid,text,timestamp with time zone)`: password-altcha
  `SELECT/INSERT` (2), identifier-protection `SELECT/INSERT` (2), platform-users `SELECT` (1),
  password-credentials `SELECT` (1); delegates to the same-signature `_impl` — 6.
- `app.password_login_read_altcha_secret()`: `public.system_settings:SELECT`; delegates to
  `app.password_login_read_altcha_secret_impl()` — 1.

Four other exact corrections:

- `app.provision_specialist_owner(uuid)` → remove `public.be_organizations:SELECT`; its body directly inserts only.
- `app.archive_operator_health_failures(text,integer,uuid)` → remove `UPDATE` from each of
  `public.outgoing_delivery_queue`, `public.integrator_push_outbox`, and `integrator.projection_outbox`. Each branch
  performs `SELECT … FOR UPDATE` then `DELETE`; row locking does not require table `UPDATE` privilege. These are the
  three physical owner-grant excesses. Keep each queue's `SELECT/DELETE`, archive `INSERT/SELECT`, and joined reads.

An earlier intermediate count was 29. It was rejected after the analyzer itself exposed a comment-escaping bug:
`--` inside a SQL string had hidden the tail of `start_provisioned_organization_trial`. After fixing and probing the
escape, `saas_organization_trials:SELECT/INSERT` is correctly retained and the authoritative count is 27.

## The twelve r4 INVOKER messages are not seam-owner ACL gaps

Command:

```bash
sed -n '269,285p' /tmp/bcb-migrate-dev-20260817-r4.log
```

The 12 messages cover 2 alias-trigger relations, 3 rename-trigger relations, 3 LFK-trigger relations, 1 directory
trigger relation, 1 brand-trigger relation, and 2 runtime-setting-trigger relations. All six functions are
`SECURITY INVOKER`, `invocation: trigger`, owner `app_object_owner`, execute `[]`. Applying the DEFINER
owner-surface reconciliation to them would create grants for the wrong principal: INVOKER trigger bodies use the
mutating caller's ACL. Their dependencies may be inventoried separately, but must not generate seam-owner grants.

One of the 12 is additionally a parser false positive: `guard_org_brand_revision → org_brand_revisions` occurs only
in body comments. Its real direct read is `public.media_files:SELECT`. The full independent inventory also finds two
unlogged INVOKER readers, `public.media_folders_enforce_depth()` and `public.media_folders_prevent_cycle()`, both on
`public.media_folders:SELECT`. In total, eight INVOKER functions have real relation dependencies; none is a
DEFINER-surface ACL finding.

## Escape and hidden-surface coverage

The independent tokenizer covers `PERFORM … FROM`, `SELECT … INTO`, `RETURN QUERY`, CTEs, aliases, comma-FROM,
`UPDATE … FROM`, `DELETE … USING`, `INSERT RETURNING`, `UPDATE/DELETE` predicates and `RETURNING`, targeted
`ON CONFLICT DO NOTHING`, `ON CONFLICT DO UPDATE`, quoted identifiers, strings containing `--`/`/* */`, and dynamic
`EXECUTE` reporting. Measured body-pattern counts are obtained by the audit command above: 14 `PERFORM FROM`, 132
`SELECT INTO`, 19 CTE, 310 alias, 86 `RETURN QUERY`, 21 `UPDATE FROM`, 7 `DELETE USING`, and 3 dynamic-SQL functions.

The three dynamic cases were inspected: two dynamically call `app.current_patient_user_id()` only; the postgres-owned
birth-wall event trigger dynamically issues RLS DDL under its separate contract. No hidden relation-grant gap was
found there. Eight port-context/birth-wall functions are likewise reported under their explicit special contracts,
not misclassified as general business seam surfaces.
