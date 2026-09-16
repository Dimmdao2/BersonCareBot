# Final audit report — #915 NativeRuntime / native-push lifecycle — auditor-live continuation

**Verdict: PASS**

Candidate: `4e6a5b188` (`fix(mobile): serialize native push lifecycle #915`) on branch
`wt/mobile-web-runtime-push-20260909`, base `feat/doctor-ui-rebuild` @ `36db05106`. Scope: continuation of
M1-07, M3-01…M3-03, and the authenticated web-client half of M6-03/M6-09
(`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`). Product code is read-only in this run; only
existing acceptance test files and this artifact directory were modified/added.

## Why the first pass (`2a49acab0`) was not accepted

Per brief `.lead/briefs/mobile-web-runtime-push-audit-correction-20260909.md`: K1 (safe fallback) was never
actually fault-injected in the first pass, K5 (idempotent lifecycle) only exercised sequential calls, and
neither covered the reachable logout→login dedupe failure: `revokeNativePushBeforeLogout` never cleared the
durable `bersoncare.nativePushLastSyncedTokenHash.*` marker, so a device that reuses the same native push
token across logins (the normal case — the token is bound to the device/app install, not the account)
stayed silently unregistered for the next logged-in user after logout. The lead's `4e6a5b188` fixes this
plus two related gaps: an unguarded synchronous `isNativePlatform()` call, a blank/whitespace project id
reaching `UniversalPush.configure`, and a fingerprint-fallback collision for equal-length tokens when
`crypto.subtle` is unavailable — by adding a `registrationBlocked` set and a per-`kind` `enqueueMutation`
serialization queue around every register/rotate/revoke path.

## Method

Reused the original blind kill-set (`.lead/runs/mobile-web-runtime-push-audit-20260909/00-blind-killset.md`)
unchanged — no second kill-set was written. Read `4e6a5b188`'s diff (`nativePushClient.ts`,
`nativePushInstallation.ts`, `nativeShellRuntime.ts`, `nativePushApi.ts`) against `d54b34775`, identified the
five still-unproven classes named in the brief, and added the missing assertions to the two existing files
that already own this behavior (`nativeShellRuntime.unit.test.ts` owns K1/K2 + `configureUniversalPush`;
`nativePushClient.unit.test.ts` owns K4/K5 + the lifecycle-serialization/permission-gating continuation). No
parallel test file was created. For each of the 6 independent classes below: ran green on the untouched
candidate, hand-injected the exact corresponding product fault (reverting to the pre-fix `d54b34775` byte
pattern, or a synthetic regression for the one class the diff didn't touch), confirmed red, restored the
committed product bytes via `git checkout --`, confirmed green again. Product working tree is byte-identical
to `4e6a5b188` right now (`git status --porcelain` shows only the two test files).

## Test/fault matrix — continuation classes

| # | Class (brief item) | Test file / new tests | Injected fault | Result |
|---|---|---|---|---|
| 1a | `isNativeShellActive()` fails browser-safe on a throwing sync detector | `nativeShellRuntime.unit.test.ts` → `isNativeShellActive` — "returns false instead of throwing…" | removed the `try/catch` around `cap?.isNativePlatform?.()` (reverted to pre-fix) | red (`toThrow` assertion caught the thrown `Error`) → restored → green |
| 1b | Blank/whitespace project id never reaches `UniversalPush.configure` | `nativeShellRuntime.unit.test.ts` → new `configureUniversalPush` describe (4 tests) | removed `normalizedProjectId`/trim+empty guard (reverted to pre-fix) | red (all 4: blank ids reached the plugin, valid id wasn't trimmed) → restored → green |
| 2 | Genuinely concurrent mount/resume/token-event reconcile of the same token → exactly one POST (not sequential-only) | `nativePushClient.unit.test.ts` → new "K5 continuation: genuinely concurrent reconcile" | reverted `nativePushClient.ts` to pre-fix `d54b34775` (no `enqueueMutation`/`registrationBlocked`) | red — 3 POSTs instead of 1 (the exact double/triple-register race) → restored → green |
| 3 | Equal-length, different tokens stay distinguishable when `crypto.subtle.digest` is unavailable; never persists/logs the raw token | `nativePushClient.unit.test.ts` → new "K5 continuation: fallback fingerprint distinguishes equal-length tokens" | reverted `nativePushInstallation.ts`'s `shortTokenFingerprint` fallback to pre-fix `` `len:${token.length}` `` | red — 1 POST instead of 2 (equal-length collision silently deduped a genuine rotation) → restored → green |
| 4a | Logout/disable serializes DELETE behind an in-flight register, clears the durable dedupe marker, blocks a later same-page lifecycle event | `nativePushClient.unit.test.ts` → new "logout/disable serialize behind an in-flight register" (test 1) | reverted `nativePushClient.ts` to pre-fix `d54b34775` | red — DELETE fired immediately, racing ahead of the still-pending register POST → restored → green |
| 4b | After a fresh module/session reload, the same device token registers again for the newly authenticated user (the concrete regression `4e6a5b188` fixes) | same describe, test 2 | same revert as 4a (pre-fix never cleared the hash in `revokeNativePushBeforeLogout`) | red — 0 POSTs instead of 1 (stale hash silently blocked the next login's registration) → restored → green |
| 5 | `requestUniversalPushPermission` is never reached from mount/resume/token-event reconcile, only from the explicit enable action | `nativePushClient.unit.test.ts` → new "K5 continuation: permission request stays out of reconcile" | synthetic regression: added a `requestUniversalPushPermission()` call inside `reconcileNativePushToken` (not part of the `4e6a5b188` diff — this class was already correct in both `d54b34775` and `4e6a5b188`, so the fault is a hypothetical future regression, matching this class's own oracle) | red — mock called twice instead of zero → restored → green |

All 6 fault injections were performed one at a time on an otherwise-clean tree; each restore was verified
with `git diff --check` / `git status --porcelain` before moving to the next, and a final full run confirmed
every fault was reverted (product tree byte-identical to `4e6a5b188`).

## Full retained/new acceptance run (final, on the untouched candidate)

71/71 tests pass across the 5 files that own this surface (61 retained from the first pass + 10 new: 2 in
`nativeShellRuntime.unit.test.ts`, 8 in `nativePushClient.unit.test.ts`). No pre-existing test was weakened,
deleted or renamed; `nativePushTapRoute.unit.test.ts`, `pwaNativeShellDoors.unit.test.ts` and
`LogoutForm.ui.test.tsx` were re-run unmodified as regression evidence (K3/K6/K7 unaffected by this diff).

## One-time inspection facts (reused from the first pass, re-checked against `4e6a5b188`)

- `git diff d54b34775..4e6a5b188 --stat`: 4 files changed (`nativePushApi.ts`, `nativePushClient.ts`,
  `nativePushInstallation.ts`, `nativeShellRuntime.ts`), 75 insertions / 21 deletions — no new file, no
  touched file outside `apps/webapp/src/shared/lib/{nativePush,nativeShellRuntime.ts}`.
- No file under `apps/mobile-shell/**`, `shared/ui/video/**`, `db/schema/**`, `**/migrations/**`, or
  `apps/integrator/src/**` is touched by `4e6a5b188` (`git show --name-only` — zero matches).
- `rg 'window\.Capacitor' apps/webapp/src` still matches only `nativeShellRuntime.ts` (+ its own doc/test
  comments) — the fix didn't introduce a second reader of the global.

## Findings

None. No MUST FIX. All 6 continuation classes named in the brief are now caught by a green behavioral test
under fault injection; the reachable logout→login dedupe regression is proven fixed and covered.

## Commands run

```
pnpm --dir apps/webapp exec vitest run \
  src/shared/lib/nativeShellRuntime.unit.test.ts \
  src/shared/lib/nativePush/nativePushTapRoute.unit.test.ts \
  src/shared/lib/nativePush/nativePushClient.unit.test.ts \
  src/shared/lib/webPush/pwaNativeShellDoors.unit.test.ts \
  src/shared/ui/LogoutForm.ui.test.tsx          # 5 files, 71 tests, all green (final, untouched candidate)
pnpm --dir apps/webapp exec tsc --noEmit         # clean
pnpm --dir apps/webapp exec eslint src/shared/lib/nativeShellRuntime.unit.test.ts \
  src/shared/lib/nativePush/nativePushClient.unit.test.ts   # 0 errors
git diff --check                                  # clean
git status --porcelain                            # only the two modified test files + this artifact dir
```

Per-class fault-injection commands (repeated for each of the 6 rows above): edit the named product file to
the described fault → `pnpm --dir apps/webapp exec vitest run <owning test file>` (red, matching the row) →
`git checkout -- <product file>` → re-run the same command (green) → `git status --porcelain` (clean before
moving to the next class).

SHA audited: `4e6a5b188` (working tree confirmed byte-identical to it after every restore — read-only
product review). No shared dev server used; no full CI run — this is a `local`/`app`-scope targeted
continuation per `AGENTS.md` §10 Audit validation, and no repo-level factor is touched (no shared package,
no root config, no lockfile, no cross-app contract) beyond what the first pass already scoped.

## Live blockers (unchanged from the first pass)

None encountered for this workstream's scope. M7-03 browser/PWA live acceptance and M7-04/M7-05
Android/device/RuStore-delivery gates remain open and are unaffected by this continuation.
