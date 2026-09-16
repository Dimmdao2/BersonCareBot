# Global Admin systemic correction — worker evidence (2026-08-17)

## Scope and authority

- Owner report (2026-08-17): Global Admin settings (`Режимы`, DSN and App theme), removal of specialist self-binding, password change, manual SaaS invoice, and the global material-ratings switch.
- Worker brief: `/tmp/bcb-dirty-salvage-20260817.8HeRlw/global-admin-systemic-worker-brief.md`.
- Branch: `wt/global-admin-systemic-20260817`.
- Parent checkpoint: `25cf57c436647cc57884930d923a683dc5f174ea`. This checkpoint already contains the shared production parts for the settings/rating projection and UI. The commit produced by this run completes the HTTP/service behavior and regression evidence on top of it.
- No DB, named DEV, TEST, PROD, deploy, env, merge, or push action was performed.

## Fault-kill set used by the worker

1. A platform write to the two intentional per-org fallbacks (`patient_booking_url`, `notifications_topics`) is rejected, or an unlisted per-org key silently becomes a NULL-org fallback.
2. A multi-key modes save is partially persisted, bypasses uniqueness/value validation, or loses `test` / `Тест тема` on readback.
3. DSN save is routed through generic settings, is non-atomic, accepts a malformed enabled DSN, or returns/logs the stored DSN.
4. A platform/global admin can reach specialist membership/provisioning side effects; an eligible clinic owner loses the retained path.
5. A global admin is role-disabled from password change, old credentials remain valid after success, the new credential cannot authenticate, or old sessions survive the epoch rotation.
6. Manual invoice failures collapse to opaque 500, provider/fiscal/customer text reaches logs, a success without a persisted checkout URL is silently accepted, fiscal misconfiguration reaches the PSP, or retry produces a duplicate draft.
7. `material_ratings_enabled=false` still mounts patient stars/feedback or reaches patient rating GET/PUT/feedback data mutations; clinic staff can write the global switch.

## Implemented result

- The service has one bounded NULL-org fallback chokepoint, with an explicit caller option and exactly two allowed keys: `patient_booking_url` and `notifications_topics`. Former notification-template fallbacks are fail-closed. Batch resolution happens before the single transaction call.
- `/api/admin/settings` passes the bounded option only for platform operations. Route behavior covers Unicode theme data, duplicate-topic validation, duplicate batch rejection, clinic org scoping, and platform-only material-ratings control.
- `/api/platform/error-tracking` remains a separate platform-only route. Enabled+valid DSN is committed through one settings transaction and only `{ enabled, hasStoredDsn }` is returned; malformed DSN is refused before write.
- Global-admin specialist binding is removed from the rendered account security surface and is refused at the HTTP boundary before workspace/membership resolution or dependency construction. The clinic-owner path is unchanged. Exact source search found no second `ensureOwnBookableSpecialist` HTTP callsite.
- Password change remains the existing self-security path, including admin. Credential replacement succeeds before revocation, the staff factor state and canonical `platform_users.session_epoch` are rotated, the user is reread, and one replacement session is issued. Missing verified email returns `password_login_unavailable`, not a role refusal.
- Manual invoice errors now emit a bounded structured root class without raw provider/fiscal/customer content and map to specific 404/409/422/501/502/503 responses. Arbitrary error codes are discarded; only known transport codes or five-character SQLSTATEs may be logged. A returned draft without checkout URL is also logged and refused. Existing deterministic request idempotency and persisted checkout-URL readback are covered, as is provider fail-closed fiscal validation.
- The inherited shared rating projection is verified at route and UI boundaries: false blocks GET/PUT/feedback data paths and does not mount either stars or low-rating feedback; clinic settings cannot write the global switch.

## Exact validation evidence

### Targeted behavior set

Command:

```bash
pnpm --dir apps/webapp exec vitest run src/app/api/admin/settings/route.route.test.ts src/app/api/platform/error-tracking/route.route.test.ts src/app/api/account/first-run/bind-specialist/route.route.test.ts src/app/app/account/StaffSecuritySection.ui.test.tsx src/modules/auth/passwordChange.unit.test.ts src/modules/auth/passwordAuth.route.test.ts src/app/api/admin/saas-billing/payments/manual/route.route.test.ts src/modules/saas-billing/service.test.ts src/app/api/patient/material-ratings/route.route.test.ts 'src/app/app/patient/content/[slug]/PatientContentMaterialRating.ui.test.tsx' src/modules/system-settings/platformGlobalFallback.unit.test.ts
```

Result: `11 passed` test files, `111 passed` tests, exit 0.

### Typecheck and focused lint

Commands:

```bash
pnpm --dir apps/webapp run typecheck
pnpm --dir apps/webapp exec eslint src/app/api/admin/saas-billing/payments/manual/route.ts src/app/api/admin/saas-billing/payments/manual/route.route.test.ts src/modules/saas-billing/manualInvoiceFailure.ts src/modules/system-settings/orgScopedKeys.ts src/modules/system-settings/platformGlobalFallback.unit.test.ts
```

Result: both exit 0.

The broader first focused ESLint run over all 18 task files also exited 0.

### Architecture and capability gates

Commands and results:

```bash
node scripts/check-no-new-raw-sql.mjs
# OK: production debt 0

node scripts/check-webapp-infra-import-boundary.mjs
# OK

node scripts/check-webapp-infra-import-boundary.mjs --self-test
# OK: 7 bypass forms rejected; canonical port consumer accepted

./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges
# exit 0

node deploy/postgres/privileges/generate-cli.mjs --check
# OK: DEV and TEST privilege/allowlist artifacts byte-identical to the declaration

node deploy/postgres/privileges/generate-cli.mjs --census
# OK: 219 ACTIVE relations across 3266 production source files for DEV and TEST

git diff --check
git diff --cached --check
# both exit 0
```

`AGENTS.md` names `apps/webapp/scripts/check-system-settings-accessors.mjs`, but the current B0-forward checkout does not contain that file. Exact discovery command `rg --files | rg 'check-system-settings-accessors|system-settings.*accessor'` returned no paths. No replacement script was invented; the actual settings route/service behavior, raw-SQL boundary, infra-import boundary, declaration check and production census were run instead.

## Shared-file overlap

- `apps/webapp/src/app/api/admin/settings/route.ts`, `apps/webapp/src/modules/system-settings/adminSettingsPatchNormalize.ts`, `apps/webapp/src/modules/system-settings/orgScopedKeys.ts`, `apps/webapp/src/app/app/account/StaffSecuritySection.tsx`, rating route/layout/context/UI, and privilege artifacts also participate in the wider B0/patient/system-settings candidate in parent checkpoint `25cf57c43`.
- This run did not take ownership of the separate systemic patient-grant conversion.
- No historical migration replay, A0, or disposable database path was added or used.

## Named-DEV checks still required after audited integration

1. As global admin, save and reload Technical `Режимы`, including `material_ratings_enabled`, and save App theme code `test` / label `Тест тема`; verify no 409 and exact readback.
2. Save a valid DSN with error tracking enabled; reload and verify only presence is exposed and logs contain no DSN.
3. Open account security as global admin: no first-run/specialist CTA; change password, verify old login fails, new login succeeds, and another pre-existing session is invalidated.
4. Issue a manual invoice against a configured Dmitry Berson test organization; verify one persisted invoice and checkout URL, then repeat the exact request and verify no duplicate. Exercise configured provider/fiscal refusal and inspect the redacted structured log root.
5. Switch material ratings off and traverse content/program surfaces: no stars, no feedback dialog, and no rating GET/PUT/feedback requests. Switch on and verify the normal path returns.

These are runtime checks only; they were deliberately not simulated against a DB in this offline worker.
