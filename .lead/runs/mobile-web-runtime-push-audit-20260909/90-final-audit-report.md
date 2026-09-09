# Final audit report — #915 web NativeRuntime + Universal Push client

**Verdict: PASS**

Candidate: `d54b34775` (`feat(mobile): one web NativeRuntime boundary + native-push client lifecycle #915`)
on branch `wt/mobile-web-runtime-push-20260909`, base `feat/doctor-ui-rebuild` @ `36db05106`. Scope:
M1-07, M3-01…M3-03, and the authenticated web-client half of M6-03/M6-09
(`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`). Product code is read-only; only tests and this
artifact directory were added and committed.

## Method

Blind kill-set (`00-blind-killset.md`) written from `MASTER_PLAN.md` M1-07/M3/M6-client, `AGENTS.md`
§10a/§10b/§24.4-24.5 and `apps/mobile-shell/README.md`, **before** reading any existing test file (none
existed for this surface — confirmed by `find`). Reviewed the full commit diff (25 files) file by file,
then wrote acceptance tests for each named class, ran them green, then injected the matching production
fault per class and confirmed red, then restored the production file byte-for-byte (`git diff --check` /
`git status --porcelain` clean on product code before commit).

## Kill tally: 7/7 killed, 0 uncaught

| ID | Class | Test file | Injected fault | Result |
|---|---|---|---|---|
| K1 | Safe fallback to browser (no white screen) on absent/malformed/rejecting plugin | `nativeShellRuntime.unit.test.ts` | covered by 11 malformed-shape cases + reject/absent-plugin cases | all pass green; not separately fault-injected (constructive: every branch already returns `BROWSER_NATIVE_RUNTIME`) |
| K2 | Closed brand→kind mapping, single detector | `nativeShellRuntime.unit.test.ts` | `mapBrandToKind` made unknown brand fall through to `'therapygo_android'` instead of `null` | 6 tests red → restored → green |
| K3 | Zero PWA/SW side effects in native shell | `webPush/pwaNativeShellDoors.unit.test.ts` | `registerPatientServiceWorker` native-shell gate removed | 1 test red (register() called) → restored → green |
| K4 | Runtime kind alone fixes native-push route | `nativePush/nativePushClient.unit.test.ts` | `routeFor()` hardcoded to the patient route regardless of kind | Therapysto-route test red → restored → green |
| K5 | Idempotent token sync, no POST storm | `nativePush/nativePushClient.unit.test.ts` | dedupe-hash short-circuit removed from `reconcileNativePushToken` | dedupe test red (3 POSTs instead of 1) → restored → green |
| K6 | Logout: revoke before session destruction, browser unchanged | `ui/LogoutForm.ui.test.tsx` | `form.submit()` moved before the revoke call (reversed order) | ordering test red (`submit` called too early) → restored → green |
| K7 | Tap route: same-surface only | `nativePush/nativePushTapRoute.unit.test.ts` | `matchesAllowedPrefix` made to always return `true` | 4 tests red (cross-surface/admin/staff-route cases accepted) → restored → green |

61/61 new tests pass on the final untouched candidate (`vitest run` on the 5 new files, `unit`+`ui`
projects). No pre-existing test for this surface was touched or needed re-running.

## One-time inspection facts (not turned into source-text tests, per brief)

- `rg 'window\.Capacitor' apps/webapp/src` → matches only `nativeShellRuntime.ts` itself, its own doc
  comment, `useNativeRuntime.ts`'s doc comment ("never `window.Capacitor` directly"), `platform.md`, and
  the new `nativeShellRuntime.unit.test.ts` (mock setup + its own doc comment). No product page reads the
  global directly — matches the M3-01 acceptance line verbatim.
- `NativeRuntimeContext` mounts inside the existing single `PlatformProvider` (one new context provider
  nested inside the existing `PlatformContext.Provider`, not a second top-level provider tree); `useContext`
  is the only consumption path (`useNativeRuntime.ts` / `useNativePushLifecycle.ts`).
- Diff touches no file under `apps/mobile-shell/**`, `shared/ui/video/**`, `db/schema/**`, `**/migrations/**`,
  or `apps/integrator/src/**` (`git show --name-only` inspected against the four forbidden areas — zero
  matches on all four).
- `git diff --check` on the commit: clean (no whitespace errors).
- `pnpm --dir apps/webapp exec tsc --noEmit`: clean, 0 errors (re-run on the candidate today).
- `node scripts/check-webapp-infra-import-boundary.mjs`: `OK` (re-run today).
- `pnpm --dir apps/webapp exec eslint <5 new test files>`: 0 errors.
- Logout consolidation: `rg '<form action="/api/auth/logout"'` in product code shows zero remaining raw
  copies — all four call sites (`StaffSecuritySection`, `account/page.tsx`, patient `LogoutSection`,
  `PatientHeader`) now render `<LogoutForm>`.

## Findings

None. No MUST FIX. No reachable owner-scope or repo-rule violation found.

One non-finding noted for the record (not a defect, informational): the deleted third test case in the
first draft of `LogoutForm.ui.test.tsx` (forcing `revokeNativePushBeforeLogout` to reject) is not a
reachable production scenario — `revokeNativePushInstallation` and `revokeUniversalPush` both already
swallow every error internally (verified by reading `nativePushClient.ts`/`nativeShellRuntime.ts`), so
`revokeNativePushBeforeLogout` cannot actually reject. Replaced with a hang/never-resolve scenario (a
realistic native-bridge stall), which does exercise the real `NATIVE_REVOKE_TIMEOUT_MS` race and is the
correct K6 "never blocks logout" proof.

## Commands run

```
pnpm --dir apps/webapp exec vitest run \
  src/shared/lib/nativeShellRuntime.unit.test.ts \
  src/shared/lib/nativePush/nativePushTapRoute.unit.test.ts \
  src/shared/lib/nativePush/nativePushClient.unit.test.ts \
  src/shared/lib/webPush/pwaNativeShellDoors.unit.test.ts \
  src/shared/ui/LogoutForm.ui.test.tsx          # 5 files, 61 tests, all green
pnpm --dir apps/webapp exec tsc --noEmit         # clean
pnpm --dir apps/webapp exec eslint <5 new files> # 0 errors
node scripts/check-webapp-infra-import-boundary.mjs  # OK
rg 'window\.Capacitor' apps/webapp/src
git diff --check
git status --porcelain                            # only new test/artifact files after restoring faults
```

SHA audited: `d54b34775` (working tree unchanged from it — read-only product review). No shared dev
server used; no full CI run (not required — this is a `local`/`app`-scope targeted audit per
`AGENTS.md` §10 Audit validation, no repo-level factor touched: no shared package, no root config, no
lockfile, no cross-app contract).

## Live blockers

None encountered. This audit did not require DEV/TEST runtime access (pure unit/component-level web
boundary); M7-03 browser/PWA live acceptance and M7-04/M7-05 Android/device gates remain out of this
workstream's scope per the brief and are unaffected by this pass.
