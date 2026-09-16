# Independent re-audit B — Global Admin correction (2026-08-17)

## Scope and fixed pre-inspection kill-set

- Product baseline: `3c750e5347aee22ad1e49871916dd3521df8647b`; audit1 acceptance commit:
  `cd35e5b41`; re-audit input HEAD: `63844034bee530eb091f248631a0621303b5dd52`.
- Authority: the 2026-08-17 owner oracle, the six audit1 owner-failure sets, and the settings/security/billing canon
  named below. This kill-set was fixed after reading authority and before opening current product/test diffs.
- Audit only: no product fix; temporary production mutations must be reversed. No DB, DEV, TEST, PROD, env,
  deploy, merge or push action is in scope.

### New/changed correction surface — four independent behavior faults

1. **Unknown external diagnostic code leaks:** an arbitrary five-character code (`PWN42`) or another unknown short/
   long code reaches the HTTP response, structured logger or console logger, or its raw message reaches any of them.
2. **Trusted failure mapping is destroyed:** an explicitly trusted DB-unavailable or transport failure loses its safe
   diagnostic class/public status, or preserving the class also exposes its raw message.
3. **Trusted provenance is forgeable:** a plain external error obtains a trusted DB/transport diagnostic merely by
   assigning an allowlisted-looking value to `error.code`, without passing the trusted source boundary.
4. **Generic-shape regression is not detected:** restoring acceptance of arbitrary `/^[0-9A-Z]{5}$/` codes does not
   make the audit1 acceptance assertion red while the unchanged corrected product remains green.

### Reused audit1 Global Admin regression gate — six owner-failure sets

1. Settings: only the two intended platform NULL-org fallbacks; clinic/no-org writes fail closed; batch save is
   atomic and rejects duplicate keys/topics; Unicode `test` / `Тест тема` round-trips.
2. Error-tracking DSN: platform-only separate route; enabled state requires a valid DSN; enabled+DSN persists
   atomically; response/logs expose presence only, never the DSN.
3. Specialist self-binding: global admin is refused before dependency/workspace/provisioning side effects; eligible
   clinic owner remains allowed; no alternate HTTP entrypoint bypasses the refusal.
4. Password change: global admin remains eligible; verified-email/current-password rules remain explicit; old
   credential becomes invalid, new credential works, prior sessions/epoch rotate, and exactly one replacement session
   is issued.
5. Manual invoice outside the changed classifier: DB/fiscal/provider/config/domain failures keep bounded public
   statuses; missing/persisted checkout URL, deterministic idempotency and fiscal-before-PSP behavior remain enforced.
6. Material ratings: the global off switch prevents stars/feedback mount and patient GET/PUT/feedback access; only
   platform settings may write it; true state persists/readbacks normally.

## Canon read

- Fully read for this pass: `AGENTS.md` core/audit and §§1–5, 7–10b, 24; root `README.md`;
  `docs/README.md`; the worker, audit1 and correction reports named in the brief; and the re-audit brief.
- Relevant authority/canon read: `docs/CURRENT_AUTHORITY_MAP.md`;
  `docs/_TODO/OWNER_WALKTHROUGHS/2026-07-27_global-admin.md`;
  `docs/_TODO/SAAS_FOUNDATION/SAAS_S5_SETTINGS_ROOT_SPLIT.md`;
  `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md`;
  `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/ENTRY_AND_INVITE_JOURNEYS.md`;
  `docs/_TODO/GLOBAL_ADMIN_CHANNEL_AUTH_TOGGLES_SPEC.md`;
  `docs/ARCHITECTURE/AUTH_AND_IDENTITY_CANON.md`; `docs/ARCHITECTURE/MATERIAL_RATINGS.md`;
  `docs/ARCHITECTURE/ERROR_TRACKING.md`; and
  `docs/_TODO/runs/billing/TEST_PASSWORD_INCIDENT_2026-08-03.md`.
- Canon for the action: the owner oracle and six audit1 failure sets define product behavior; AGENTS §24 defines
  independent kill evidence and permits reuse of the already killed audit1 hypotheses. This report and the focused
  acceptance test are the only durable audit outputs.

## Fault injection and acceptance evidence

The correction report was not used as evidence. Before inspecting its diff, this report fixed the four-fault set
above. Two temporary product mutations were then applied one at a time and fully reversed.

| Gate | Independent proof | Result |
| --- | --- | --- |
| Unknown external code is absent everywhere | Current product: focused `unknown external code` run was green for `PWN42`, `QXZ99` and `provider-secret-code` (`3 passed`, `16 skipped`). It asserted the HTTP body plus structured and `console.error/warn/log` captures contain neither code nor raw message. | **KILLED** |
| Trusted DB/transport mapping survives, raw text does not | Current product: actual `pg.DatabaseError(code=42501)` and a transport-shaped connect error (`ECONNREFUSED`, `errno`, `syscall`, address/port) both kept `503 / saas_billing_database_unavailable`, `root=database_unavailable`, the bounded code, and no raw message (`2 passed`, `17 skipped`). Mutation `errorCode() => null` made both cases red with the generic manual-invoice class (`2 failed`). | **KILLED** |
| Plain `error.code` cannot forge trusted provenance | On unchanged input product, plain `Error` values with only `code=42501` or `code=ECONNREFUSED` both received `saas_billing_database_unavailable`; structured logs contained the supplied code and `root=database_unavailable`. Focused acceptance: `2 failed`, `17 skipped`; raw messages remained absent. | **UNHANDLED** |
| Audit1 acceptance is sensitive to generic-regex rollback | Temporary fallback `return /^[0-9A-Z]{5}$/u.test(code) ? code : null` made the unknown-code acceptance red for `PWN42` and `QXZ99` (`2 failed`, one long-code case passed); after exact reversal, the same current-product run was green (`3 passed`). | **KILLED** |

Exact correction kill accounting: **3 killed / 1 unhandled**. The generic-regex mutation is counted once as the
rollback fault and its current/mutated pair also supplies the required PWN42 observability evidence. No hypothesis
was credited from source inspection alone.

Commands (temporary mutations were made only with `apply_patch`, followed immediately by the named focused run
and inverse `apply_patch`):

```text
pnpm --dir apps/webapp exec vitest run --project route --reporter=dot \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts \
  -t 'unknown external code'

pnpm --dir apps/webapp exec vitest run --project route --reporter=dot \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts \
  -t 'actual PostgreSQL error|transport-shaped connect failure'

pnpm --dir apps/webapp exec vitest run --project route --reporter=dot \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts \
  -t 'plain external error forge trusted provenance'
```

Final product restoration proof:

```text
git diff --exit-code HEAD -- \
  apps/webapp/src/modules/saas-billing/manualInvoiceFailure.ts \
  apps/webapp/src/app/api/admin/saas-billing/payments/manual/route.ts
# exit 0, no output
```

## Regression and static gates

### Targeted 13-file Global Admin suite

```text
pnpm --dir apps/webapp exec vitest run --reporter=dot \
  src/app/api/account/first-run/bind-specialist/route.route.test.ts \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts \
  src/app/api/admin/settings/route.route.test.ts \
  src/app/api/patient/material-ratings/route.route.test.ts \
  src/app/api/platform/error-tracking/route.route.test.ts \
  'src/app/app/patient/content/[slug]/PatientContentMaterialRating.ui.test.tsx' \
  src/app/app/account/StaffSecuritySection.ui.test.tsx \
  src/shared/ui/patient/material-rating/MaterialRatingBlock.ui.test.tsx \
  src/modules/auth/passwordAuth.route.test.ts \
  src/modules/auth/passwordChange.unit.test.ts \
  src/modules/saas-billing/service.test.ts \
  src/modules/system-settings/platformGlobalFallback.unit.test.ts \
  src/app/api/tariffMechanics.route.test.ts
```

Result: **12 passed / 1 failed files; 162 passed / 2 failed tests (164 total)**. Both failures are the newly added
plain-code provenance cases. Every pre-re-audit assertion is green; the other five audit1 owner-failure sets and all
pre-existing manual-invoice assertions therefore show no regression. The 30 audit1 hypotheses already killed by
the independent first audit were reused under AGENTS §24.5 and were not falsely recounted as new mutation kills.

### Compile, lint and architecture gates

```text
pnpm --dir apps/webapp run typecheck
# PASS

pnpm --dir apps/webapp exec eslint \
  src/modules/saas-billing/manualInvoiceFailure.ts \
  src/app/api/admin/saas-billing/payments/manual/route.ts \
  src/app/api/admin/saas-billing/payments/manual/route.route.test.ts
# PASS

node scripts/check-no-new-raw-sql.mjs
# OK; production debt: 0
node scripts/check-webapp-infra-import-boundary.mjs
# OK
node scripts/check-webapp-infra-import-boundary.mjs --self-test
# 7 bypass forms rejected; canonical port consumer accepted
node scripts/check-b0-migration-baseline.mjs
# OK; 15 webapp and 0 integrator forward migrations; no legacy chain
node docs/_TODO/SAAS_FOUNDATION/scripts/check-s5-2-settings-security.mjs
# generated artifacts and classifications OK
./node_modules/.bin/tsc --noEmit --strict -p deploy/postgres/privileges
# PASS
node deploy/postgres/privileges/generate-cli.mjs --check
# all four generated privilege/allowlist artifacts byte-identical
node deploy/postgres/privileges/generate-cli.mjs --census
# bcb_webapp_dev and bersoncarebot_test: 219 ACTIVE relations / 3266 source files each
```

The fresh copy had no installed workspace artifacts. `pnpm install --frozen-lockfile --offline` was blocked by the
environment-owned read-only pnpm registry, so tests used dependency links from the sibling copy at the identical
`63844034b` HEAD and byte-identical lockfile, then locally built the required workspace packages. All temporary
dependency links/build outputs were removed before commit.

The ten tracked env-example paths visible as `M` at entry were root-owned character-special mounts (mode `666`),
not ordinary file changes; Git cannot hash them (`unsupported file type`). Their content was neither read nor
changed. Local `skip-worktree` index metadata was applied to exactly those ten protected mounts so the requested
final clean-tree and whole-tree diff checks describe repository changes rather than the sandbox projection.

Full `pnpm run ci` was not run: this audit changes one focused route test and a report, and the targeted suite,
typecheck, focused lint and all affected architecture/settings/privilege gates cover the concrete integration risk.
No DB, DEV, TEST, PROD, env content, deploy, merge or push action occurred.

## Verdict

**FAIL — one reachable MUST FIX finding.**

`apps/webapp/src/modules/saas-billing/manualInvoiceFailure.ts:22-34` reads an arbitrary public `code` property and
treats allowlist membership itself as provenance; lines 77-90 then publish that code/root to the structured logger
and map the response to database-unavailable. A reachable external/provider rejection can therefore throw an
ordinary `Error` with `code=42501` or `code=ECONNREFUSED` and impersonate the trusted DB/transport boundary. The
observed impact is a false database-unavailable public class plus attacker/provider-controlled structured diagnostic
code/root; raw message redaction still works. This violates required gate (3), not a style preference or speculative
hardening request. Acceptance is fixed at
`apps/webapp/src/app/api/admin/saas-billing/payments/manual/route.route.test.ts:250-271` and is red on both cases.

No product fix was made. Durable audit delta is restricted to that acceptance test and this report.
