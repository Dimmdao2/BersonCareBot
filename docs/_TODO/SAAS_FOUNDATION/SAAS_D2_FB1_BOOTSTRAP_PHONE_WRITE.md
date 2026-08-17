> RE-VERIFIED 2026-07-23 (all [x] audited vs code): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md

# D2 FB#1 bootstrap phone-write closure

Status: Repo/scratch-safe evidence package, 2026-07-14. This does not claim final D2 exit and does
not authorize TEST/PROD/dev database access, `/opt/env` reads, SSH, service restarts, live delivery,
or S3 work.

## Scope

Authoritative source: `SAAS_ENFORCE_ROADMAP.md` Phase D2 and `TASK_A_PII_TIGHTEN_PLAN.md` FB#1.

D2 closes the repo-side package for the bootstrap phone-write blocker:

- grant the nonstaff bootstrap base login the direct least-privilege phone/contact surface chosen in C0;
- prove the real phone-history repository branch can close and insert over pre-existing NULL and
  org-stamped rows under locked mode;
- prove PII isolation negatives: staff cannot see bootstrap NULL phone-history PII, and bootstrap
  cannot read/write org-stamped phone-history PII.

## Repo/scratch evidence

Grant artifact:

- `deploy/postgres/d2-fb1-bootstrap-phone-write-grants.sql` grants only `USAGE` on `public`/`app`,
  `EXECUTE` on `app.close_active_user_phone_history(uuid)`, and `SELECT, INSERT, UPDATE` on
  `public.user_phone_history` plus `public.platform_user_contacts` to the caller-supplied bootstrap
  base login.
- The artifact does not grant BYPASSRLS, owner membership, app_staff membership, or broad app_patient
  writes.

Flip preflight:

- `deploy/postgres/phase4-force-rls-cutover.sql` now asserts
  `phase4_bootstrap_base_role_user_phone_history_dml` and
  `phase4_bootstrap_base_role_platform_user_contacts_dml` before applying FORCE.
- The same preflight still asserts the bootstrap base role is NOBYPASSRLS and not staff, can execute
  the close helper, and that the helper owner is BYPASSRLS with `UPDATE` on `user_phone_history`.

Application repository path:

- `apps/webapp/src/infra/repos/pgPhoneHistory.ts` uses
  `app.close_active_user_phone_history($1::uuid)` when `DB_PRINCIPAL_CONTEXT_MODE=locked`, then
  inserts the new active row with `organization_id` from `getCurrentDbPrincipalOrganizationId()`
  or NULL for bootstrap.
- `docs/archive/2026-08-no-disposable-db-retirement/RETIREMENT.md` now has an owner-authorized
  full-rehearsal app smoke that calls `applyPlatformUserPhoneHistoryTransition` through
  `withTransaction` under locked mode for:
  - pre-existing org-stamped active row -> org-stamped new active row;
  - pre-existing NULL active row -> org-stamped new active row;
  - pre-existing NULL active row -> bootstrap NULL new active row.
- OTP/messenger callers remain pinned to the same repository function through `pgUserByPhone.ts`
  (`source: "otp"`) and `pgPhoneMessengerBind.ts` (`source: "messenger"`).
- Contact writes are pinned through `pgPlatformUserContacts.ts`, which stamps `organization_id` from
  the current principal or NULL for bootstrap; booking contact best-effort reaches that service path.

Isolation negatives:

- The full rehearsal asserts staff/org context cannot see bootstrap NULL phone-history PII.
- The full rehearsal asserts bootstrap base login cannot read org-stamped phone-history PII.
- The full rehearsal attempts and rejects bootstrap insertion of org-stamped phone-history PII.
- `smoke-r2-real-policy-isolation.mjs` remains the scratch policy proof that staff cannot see NULL
  PII rows and bootstrap only reads/writes NULL rows for the two org-gated PII tables.

## Checklist

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [x] Code-search used before exact file reads for D2/FB#1 locations. (✓ evidence)
- [x] Minimal bootstrap grant artifact exists for `user_phone_history`, `platform_user_contacts`, and
      `app.close_active_user_phone_history(uuid)`. (✓ evidence: d2-fb1-bootstrap-phone-write-grants.sql:39-42)
- [x] FORCE preflight asserts the bootstrap direct DML/function surface before flipping. (✓ evidence: phase4-force-rls-cutover.sql:62-77)
- [x] Locked phone-history repository path uses the SECURITY DEFINER close helper, not a caller-visible
      RLS-scoped `UPDATE`. (✓ evidence: pgPhoneHistory.ts:25-44)
- [x] Rehearsal app smoke exercises `applyPlatformUserPhoneHistoryTransition` over pre-existing NULL
      and org-stamped rows. (✓ evidence: rehearse-multitenant-isolation.mjs)
- [x] Rehearsal negatives cover staff cannot see bootstrap NULL phone-history PII and bootstrap cannot
      read/write org-stamped phone-history PII. (✓ evidence: rehearse-multitenant-isolation.mjs + smoke-r2-real-policy-isolation.mjs)
- [x] Static checker `check-d2-fb1-bootstrap-phone-write.mjs` pins the contract above. (✓ evidence)
- [ ] Future owner-authorized strict+FORCE production-topology gate.

## Future owner-authorized strict+FORCE production-topology gate

Final D2 exit still requires running the full application smoke and PII isolation negatives under
strict+FORCE with the production topology on an authorized disposable prod-copy or approved TEST target.
That future gate must use real runtime role URLs/credentials, the D2 grant artifact, the FORCE preflight,
and the app repository smoke. It must not print PII and must record exact PASS/FAIL evidence.

No final D2 acceptance is claimed by this repo/scratch package alone.

## D3.4 composition note

D3.4 adds `deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql` for the broader locked TEST
bootstrap/base-login read surface found after D2. That artifact intentionally duplicates the D2 FB#1
`user_phone_history` and `platform_user_contacts` grants so the TEST wrapper can apply one composed
bootstrap package before restart/product smoke. It also grants EXECUTE only on the repo-owned narrow
SECURITY DEFINER email/invite/specialist-signup accessors required while locked bootstrap remains on the
NOINHERIT base login after `RESET ROLE`. It remains limited to session identity, first membership lookup,
public booking tenant-resolution reads, and those accessors; clinical/media/content/full-settings access must run
after `SET ROLE app_staff`/`app_patient` or through a narrow accessor. D3.4 is repo-tracked only until
the owner-authorized locked TEST product smoke reruns.
