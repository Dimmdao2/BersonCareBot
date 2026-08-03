# D27-A1 — independent audit of anonymous phone/channel concealment

Product candidate: `1e160cac6` (`wt/trackd-d27a1-enumeration`).

Authority: `WORK_ORDER.md` Р-D27/D27 and `IDENTITY_AND_MERGE_SCHEME.md` §3.3/§3.6. The public surface must not
reveal whether a person, binding, PIN, email or delivery preference exists. Its channel list may depend only on
global configured-and-enabled capabilities.

## Classification before candidate-test inspection

- **B1–B12 — repeatable public behavior:** public route/caller acceptance plus one targeted fault injection per
  independent decision/failure class.
- **A1–A2 — one-time architecture/scope state:** production diff, import/call-graph inspection, exact search and
  back-reference review. No permanent source-text test.

## Blind kill-set

This list was written from the authority before opening any candidate test file.

1. **B1 — account existence:** known and unknown phones return different bytes, status, or minimum-time class.
2. **B2 — messenger bindings:** independently changing Telegram or MAX binding state changes the public response.
3. **B3 — other identity state:** independently changing PIN, email presence/value, or preferred delivery channel
   changes the public response.
4. **B4 — recursive disclosure:** a top-level or nested account/PII field (`exists`, binding state, PIN state,
   preference, email/address or equivalent alias) appears in the public response.
5. **B5 — identity access:** the anonymous route calls an identity repository/port/helper; an injected throw from
   that boundary is observable instead of the same neutral response.
6. **B6 — global capability policy:** a configured-and-enabled capability is omitted, or a disabled/unconfigured
   capability is exposed; the same policy does not change known and unknown responses identically.
7. **B7 — compatibility caller:** the old MiniApp/compatibility caller cannot consume the neutral contract after a
   deploy, or recreates PII/account-derived channel choice client-side.
8. **B8 — main phone start:** absent account/binding produces a distinguishable status/body/minimum-time class.
9. **B9 — authenticated self bind:** messenger-bind capability becomes anonymously queryable or stops being scoped
   to the authenticated account.
10. **B10 — validation:** malformed/invalid phone input reaches capability/auth work or receives weakened validation.
11. **B11 — rate limiting:** the anonymous check/start path bypasses or weakens the existing rate-limit decision.
12. **B12 — server timing floor:** a known/unknown or early-return branch completes outside the same server-enforced
    minimum-time class, or the delay is moved to/bypassed by the client.
13. **A1 — anonymous architecture boundary:** production route/service imports or reaches identity lookup,
    account-derived/PII models, or an alias/helper that restores such access.
14. **A2 — D27-A1 diff boundary:** candidate changes email delivery, OTP/session/attempt/2FA/identity model, DB/env/
    deploy, D30, tariffs/CMS, or anything else outside the explicitly allowed route/callers/tests/D27 documentation.

## Result

**PASS.** The candidate removes the anonymous identity-derived contract, preserves the old caller's neutral
compatibility path, keeps the main phone start opaque, and routes profile binding through an authenticated
self-scoped door. No product finding remains.

The audit added the missing timing-floor, legacy-caller, validation, rate-limit and self-bind acceptance oracles.
It also repaired the candidate's recursive-key assertion: the previous `not.toEqual(arrayContaining(...))` would
allow any single forbidden key as long as every forbidden key was not present together.

## Kill-set verdict

| Item                      | Verdict | Evidence                                                                                                                                                                                                                                                                             |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1 account existence      | PASS    | Route acceptance compares response bytes/status for two phones; injected per-phone `exists` made the equality assertion red.                                                                                                                                                         |
| B2 messenger bindings     | PASS    | Identity-state acceptance supplies opposite Telegram/MAX binding state; separate per-phone Telegram and MAX availability injections each made byte equality red.                                                                                                                     |
| B3 PIN/email/preference   | PASS    | Identity-state acceptance supplies PIN, full email and preference values while the injected identity path throws; separate per-phone PIN, full-email and `preferredOtpChannel` injections each made byte equality red.                                                               |
| B4 recursive disclosure   | PASS    | Per-key recursive assertion plus full-email scan; injected nested `meta.account.emailAddress` made the dedicated assertion red.                                                                                                                                                      |
| B5 identity access        | PASS    | Injected identity resolver and repo methods throw and remain uncalled; a temporary dynamic `buildAppDeps().userByPhone.findByPhone()` call made the route test red with `identity port must not be called`.                                                                          |
| B6 global policy          | PASS    | Route acceptance applies one effective policy identically to both phones. Public-policy acceptance proves enabled **and** configured; ignoring `configured` exposed unconfigured SMS, while ignoring `enabled` exposed disabled MAX. Each dedicated assertion went red.              |
| B7 old caller             | PASS    | Added a pre-deploy caller consumer for the retained `{ ok, methods }` contract; renaming `methods` to `capabilities` made only that targeted compatibility assertion red.                                                                                                            |
| B8 main phone start       | PASS    | Existing route acceptance keeps account/no-account status and response keys equal and checks the 500 ms floor; injected `404 account_not_found` made it red.                                                                                                                         |
| B9 self bind              | PASS    | UI acceptance now proves no anonymous check, then exact `profile_bind` request to `messenger-bind/start`; route acceptance proves anonymous `profile_bind` gets `401` before deps. Changing UI purpose to `login` and removing the server auth gate each made its own assertion red. |
| B10 validation            | PASS    | Invalid E.164 input remains `400` before rate/policy work; injected `200` made the targeted assertion red.                                                                                                                                                                           |
| B11 rate limiting         | PASS    | Limited input remains `429` before capability work; injected `200` made the targeted assertion red.                                                                                                                                                                                  |
| B12 timing floor          | PASS    | Added pending-at-499-ms/settled-at-500-ms route acceptance; injected floor `0` made it red at the pending assertion.                                                                                                                                                                 |
| A1 anonymous architecture | PASS    | Route imports only bootstrap, HTTP/Zod, pure phone validation/rate-limit, global channel policy and the pure public mapper. Exact forbidden import/call search returned no matches; production back-references are only the public UI caller and the self-bind caller.               |
| A2 D27-A1 scope           | PASS    | Candidate name-status is limited to the public route/mapper, two auth UI callers plus picker, their targeted tests and the D27 status note. No DB/env/deploy, D30, tariffs/CMS, email delivery, OTP/session/attempt/2FA or identity-model path is changed.                           |

Kill-set result: **B1–B12 caught, A1–A2 passed, no uncaught item**. Count command after the finalized report:

```bash
sed -n '/^## Kill-set verdict$/,/^## Fault injection ledger$/p' docs/_TODO/runs/integrator-cleanup/D27A1_PHONE_ENUMERATION_INDEPENDENT_AUDIT_2026-08-03.md | rg -c '^\| B[0-9]+'
sed -n '/^## Kill-set verdict$/,/^## Fault injection ledger$/p' docs/_TODO/runs/integrator-cleanup/D27A1_PHONE_ENUMERATION_INDEPENDENT_AUDIT_2026-08-03.md | rg -c '^\| A[0-9]+'
```

## Fault injection ledger

Every mutation below was made in production code only for its targeted run and reverted immediately afterward.

| Kill item | Temporary production fault                                              | Red oracle                                                      |
| --------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| B1        | Add per-phone `exists` to `check-phone`                                 | byte-equivalent response and legacy no-account-field assertions |
| B2        | Separately derive Telegram and MAX availability from the phone suffix   | known/unknown and independent-identity-state byte equality      |
| B3        | Separately return per-phone PIN, full email and `preferredOtpChannel`   | known/unknown and identity-state byte equality                  |
| B4        | Return nested full `emailAddress`                                       | recursive forbidden-key assertion                               |
| B5        | Dynamically call `buildAppDeps().userByPhone.findByPhone(phone)`        | injected identity-port throw                                    |
| B6        | Separately bypass configured and enabled halves of effective policy     | unconfigured- and disabled-channel policy acceptance            |
| B7        | Rename response `methods` to `capabilities`                             | pre-deploy caller compatibility acceptance                      |
| B8        | Return `404 account_not_found` for absent account in public phone start | account/no-account neutral phone-start acceptance               |
| B9        | Skip self-bind session gate; separately send UI purpose `login`         | server `401` acceptance; exact UI request-body acceptance       |
| B10       | Return `200` for invalid phone                                          | validation status assertion                                     |
| B11       | Return `200` for limited phone                                          | rate-limit status assertion                                     |
| B12       | Set server response floor to `0`                                        | pending-at-499-ms assertion                                     |

After the ledger, this command showed no production diff; only the two audit-updated tests and this report remained:

```bash
git diff -- apps/webapp/src/app/api/auth/check-phone/route.ts apps/webapp/src/modules/auth/checkPhoneMethods.ts apps/webapp/src/modules/auth/authChannelPolicy.ts apps/webapp/src/app/api/auth/phone/start/route.ts apps/webapp/src/app/api/auth/phone/messenger-bind/start/route.ts apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx apps/webapp/src/shared/ui/patient/auth/ChannelPicker.tsx apps/webapp/src/shared/ui/patient/auth/PhoneMessengerAuthFlow.tsx
```

## Architecture and scope inspection

Candidate paths and clean patch check:

```bash
git diff --name-status 1e160cac6^ 1e160cac6
git diff --check 1e160cac6^ 1e160cac6
```

The first command returned exactly:

```text
A apps/webapp/src/app/api/auth/check-phone/checkPhoneEnumeration.route.test.ts
M apps/webapp/src/app/api/auth/check-phone/route.ts
M apps/webapp/src/modules/auth/checkPhoneMethods.ts
M apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx
M apps/webapp/src/shared/ui/patient/auth/ChannelPicker.tsx
M apps/webapp/src/shared/ui/patient/auth/PhoneMessengerAuthFlow.tsx
M apps/webapp/src/shared/ui/patient/auth/PhoneMessengerAuthFlow.ui.test.tsx
M docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md
```

Forbidden identity import/call search (no matches):

```bash
rg -n "from ['\"][^'\"]*(userByPhone|identity|userPins|oauthBindings|channelPreferences|buildAppDeps)|\b(findByPhone|getVerifiedEmailForUser|getPreferredAuthOtpChannel|getByUserId|resolveAuthMethodsForPhone)\b" apps/webapp/src/app/api/auth/check-phone/route.ts apps/webapp/src/modules/auth/checkPhoneMethods.ts
```

Production back-references:

```bash
rg -n "resolveAuthMethodsForPhone|['\"]/api/auth/check-phone['\"]|['\"]/api/auth/phone/messenger-bind/start['\"]" apps/webapp/src --glob '!**/*.test.*' --glob '!**/*.spec.*'
```

It returned only `AuthFlowV2.tsx` for public `check-phone` and `PhoneMessengerAuthFlow.tsx` for self bind; the old
personalized resolver has no production reference. Two lexical `code-search` passes over the indexed repository
were also performed before exact search: `check-phone public auth route callers identity lookup channel capabilities`
and `PhoneMessengerAuthFlow checkPhoneMethods phone start messenger bind`.

## Final validation

Behavioral set before the final typing-only mock-signature correction:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-trackd-d27a1-enumeration-audit && pnpm --dir apps/webapp exec vitest run src/app/api/auth/check-phone/checkPhoneEnumeration.route.test.ts src/shared/ui/patient/auth/PhoneMessengerAuthFlow.ui.test.tsx src/modules/auth/phoneStartFallback.route.test.ts src/modules/auth/publicAuthPolicy.unit.test.ts"
```

Result: `4` files / `26` tests passed. After the mock received its explicit TypeScript call signature, only the
changed UI file was rerun, per the no-repeat rule:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-trackd-d27a1-enumeration-audit && pnpm --dir apps/webapp exec vitest run --project ui src/shared/ui/patient/auth/PhoneMessengerAuthFlow.ui.test.tsx"
```

Result: `1` file / `4` tests passed.

The added disabled-toggle policy case was then run at the final tree:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-trackd-d27a1-enumeration-audit && pnpm --dir apps/webapp exec vitest run --project unit src/modules/auth/publicAuthPolicy.unit.test.ts"
```

Result: `1` file / `6` tests passed.

Type boundary (workspace dependencies were built once in this fresh worktree; after correcting the audit-test type,
the failed step alone was rerun):

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-trackd-d27a1-enumeration-audit && pnpm --dir apps/webapp typecheck"
```

Result: exit `0`.

Targeted lint and the existing import boundary plus its self-test:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-trackd-d27a1-enumeration-audit && pnpm --dir apps/webapp exec eslint src/app/api/auth/check-phone/checkPhoneEnumeration.route.test.ts src/shared/ui/patient/auth/PhoneMessengerAuthFlow.ui.test.tsx src/app/api/auth/check-phone/route.ts src/modules/auth/checkPhoneMethods.ts src/shared/ui/patient/auth/AuthFlowV2.tsx src/shared/ui/patient/auth/ChannelPicker.tsx src/shared/ui/patient/auth/PhoneMessengerAuthFlow.tsx && node scripts/check-webapp-infra-import-boundary.mjs && node scripts/check-webapp-infra-import-boundary.mjs --self-test"
```

Result: exit `0`; boundary `OK`, self-test rejected all bypass fixtures and accepted the canonical port consumer.

The later policy-test addition was linted separately without repeating the unchanged boundary gate:

```bash
pnpm --dir apps/webapp exec eslint src/modules/auth/publicAuthPolicy.unit.test.ts
```

Result: exit `0`.

Full CI, DB, env, deploy and live DEV/TEST/PROD checks were intentionally not run for this local audit scope.
