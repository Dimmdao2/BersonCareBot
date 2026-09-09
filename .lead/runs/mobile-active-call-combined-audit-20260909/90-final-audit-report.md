# #915 mobile active-call combined independent audit

## Candidate

- Candidate SHA: `c7ce6c7ab95a9af0faa0ed0b452d520278888c21`
- Base SHA: `61ce0eaf8c8e472cd2c4ee254629d5727ef8a9a1` (`git merge-base HEAD feat/doctor-ui-rebuild`). Candidate stayed fixed; no newer `feat` was merged.

## Blind kill-set (written before reading existing tests)

| Owner requirement | Classification | Kill class / oracle |
| --- | --- | --- |
| M4-01 | behavioral test | A trusted Android start receives the same endpoint, room reference and token at the native seam; browser remains on the existing renderer. A runtime branch must not alter the server renderer contract. |
| M4-02 | behavioral test + view/build inspection | Leaving/backgrounding a native call enters supported PiP without terminal; activity destruction/background does not synthesize hangup; explicit Jitsi termination produces exactly one terminal; permission denial/retry remains correct. Inspect the Android lifecycle/API path and compile it. |
| M4-03 | behavioral test + build inspection | A compiled flavor accepts only its exact self-hosted endpoint/origin; external/JaaS endpoint is rejected and credentials are not bundled/logged. |
| M4-04 | behavioral test | Route unmount/navigation preserves the same browser/native conference; native terminal invokes the retained encounter callback once even after origin unmount. Browser guest/PWA path keeps working. |
| M4-05 | view inspection | Exactly one provider-neutral `VideoMeetingStage` seam/adapter path exists; no provider-specific product-page fork or second meeting page. |
| M4-06 | behavioral test + view inspection | The coordinator remains above routes, holds one render-session/return URL, navigation reattaches it, ordinary/direct starts cannot make replacement B while A is active, delayed A events cannot mutate B, and explicit terminal clears/calls back once. Inspect zonal patient/doctor indicators (mobile-only off-call route, safe-area, camera/pulse, accessible, desktop unchanged) and isolation/no persistence/cross-imports. |

No source-text, copy, button-count, layout, or implementation-call tests are authorized by this kill-set. New tests, if required, will use the cheapest public behavioral seam and each independent fault class will be injected once then fully reverted.

## Result

| ID | Result | Exact evidence |
| --- | --- | --- |
| M4-01 | PASS | `VideoMeetingStage.ui.test.tsx` keeps the browser renderer for browser/unavailable runtime and passes the authorized endpoint/room/token to the native seam. Targeted web suite: 6 files / 48 tests PASS. Diff inspection shows no new server renderer union or product-specific renderer branch. |
| M4-02 | PASS (repository gate) | `NativeJitsiMeetActivity` delegates `onUserLeaveHint()` to the SDK and manifest declares `supportsPictureInPicture`; `NativeJitsiPlugin` activity destruction clears launch ownership without emitting terminal. New `activityDestructionDoesNotSynthesizeATerminalConferenceEvent` passed in all four flavor unit suites. Explicit native terminal dedup remains covered. Physical Android PiP interaction is an external device/emulator gate below. |
| M4-03 | PASS | All four flavor `NativeJitsiPluginTest` suites report 20 tests / 0 failures / 0 errors. The retained endpoint oracle rejects JaaS/external host; a temporary acceptance of `https://meet.jit.si` made it red. `ShellVariant.jitsiEndpoint()` remains the exact input gate. |
| M4-04 | FAIL | `pnpm --dir apps/webapp typecheck` fails at candidate-modified `DoctorLiveMeetingClient.tsx:79` and `:84`: `appointmentId` is `string | undefined` when passed to `URLSearchParams`. This is a reachable build/type regression in the continuity path; no product fix is permitted to this auditor. Its focused behavioral web oracles otherwise pass. |
| M4-05 | PASS | One `VideoMeetingStage` provider-neutral seam remains; `rg -n '<VideoMeetingStage|ActiveCallCoordinator' apps/webapp/src --glob '!**/*test*' --glob '!**/*.test.*'` found the three existing stage callers plus the one shell coordinator and guest standalone caller. No second meeting page or server renderer value was added. |
| M4-06 | PASS (repository gate) | New `ActiveCallCoordinator.ui.test.tsx` proves navigation retains A, ordinary B cannot replace it, exact A return URL remains, and duplicate terminal invokes callback once. Patient/doctor indicators are physically separate zonal components with accessible camera button, soft pulse, safe-area bottom positioning, and `isMobile && !isActiveRoute` visibility; coordinator has no browser persistence and guest `/live` remains standalone. Existing doctor start surfaces redirect to `activeCall.returnUrl`. |

## Tests added or repaired

- Added `apps/webapp/src/shared/ui/video/ActiveCallCoordinator.ui.test.tsx`: protects silent replacement of A by B after navigation, and duplicate terminal callback after origin-route unmount.
- Added `NativeJitsiPluginTest.activityDestructionDoesNotSynthesizeATerminalConferenceEvent`: destruction must not produce a bridge terminal event.
- Repaired `DoctorLiveMeetingClient.ui.test.tsx` test setup with the now-required `next/navigation` mock; the candidate added `useRouter`, otherwise all five pre-existing UI-08 tests fail before reaching their behavioral oracle.
- Reused rather than duplicated `NativeJitsiPluginTest.latePriorConferenceTerminationCannotBeEmittedAsTheReplacementLaunch` for late A → B.

## Fault injection record

| Class | Temporary product mutation | Red assertion |
| --- | --- | --- |
| Ordinary second start replaces A | Removed coordinator's active-owner return | `ActiveCallCoordinator` oracle observed `room-b` instead of retained `room-a`. |
| Duplicate terminal callback | Retained completed owner and removed terminal guard | callback assertion received 2 calls instead of 1. |
| Delayed terminal A targets B | Removed legacy unidentified-broadcast guard | retained `latePriorConferenceTerminationCannotBeEmittedAsTheReplacementLaunch` failed with `NeverWantedButInvoked`. |
| Foreign endpoint allowed | Replaced exact endpoint comparison with `true` | retained `rejectsUnrelatedJitsiHost` failed (it no longer rejected). |
| Activity destruction synthesizes hangup | Emitted terminal from `onActivityDestroyed` | new destruction oracle failed with `NeverWantedButInvoked`. |

All mutations were reverted. **убито 5 / непойманных 0** for the injected independent behavior classes; the candidate is nevertheless rejected by the M4-04 type regression above.

## Commands and results

- `pnpm install --frozen-lockfile` — PASS; required dependencies installed without lockfile changes.
- `pnpm --dir apps/webapp exec vitest run src/shared/lib/nativeShellRuntime.unit.test.ts src/shared/ui/video/JitsiMeetingRenderer.ui.test.tsx src/shared/ui/video/VideoMeetingStage.ui.test.tsx src/shared/ui/video/ActiveCallCoordinator.ui.test.tsx src/app/app/doctor/patients/[userId]/live/DoctorLiveMeetingClient.ui.test.tsx src/app/live/GuestLivePageClient.ui.test.tsx` — PASS, 6 files / 48 tests.
- `/home/dev/brain/host-orch/run-tests.sh "bash apps/mobile-shell/scripts/gradle.sh :app:testTherapygoEnvironmentTestDebugUnitTest :app:testTherapygoProductionDebugUnitTest :app:testTherapystoEnvironmentTestDebugUnitTest :app:testTherapystoProductionDebugUnitTest --continue"` — PASS; each `NativeJitsiPluginTest` XML reports 20 tests / 0 failures / 0 errors.
- `/home/dev/brain/host-orch/run-tests.sh "bash apps/mobile-shell/scripts/gradle.sh :app:assembleTherapygoEnvironmentTestDebug"` — PASS; debug APK exists at `android/app/build/outputs/apk/therapygoEnvironmentTest/debug/app-therapygo-environmentTest-debug.apk`.
- Scoped `eslint` over all changed web video/coordinator/start-surface files and auditor tests — PASS.
- `pnpm --dir apps/webapp typecheck` — FAIL. Most diagnostics are pre-existing unresolved workspace build artifacts (`@bersoncare/db-principal`, `@bersoncare/platform-merge`, etc.); independently, the two `DoctorLiveMeetingClient.tsx:79,84` diagnostics are in this candidate's changed continuity code.
- `git diff --check` — PASS; production paths are unchanged after all fault injections.

## Inspection scope

Inspected candidate diff and these relevant paths: Android manifest, `NativeJitsiMeetActivity`, `NativeJitsiPlugin`, `nativeShellRuntime`, `VideoMeetingStage`, `ActiveCallCoordinator`, patient/doctor shell and indicator components, authenticated patient/doctor live clients and all modified doctor start surfaces, guest live client, retained/new Android and web tests.

## External gates, not repository findings

- PiP’s actual system transition, camera/microphone permission UX, and native SDK Activity behavior need emulator or physical-device acceptance. `ls -l /dev/kvm; id` shows `/dev/kvm` owned by group `kvm` while `dev` is not a member, so KVM acceleration is unavailable to this user.
- Physical device verification and RuStore signing/submission remain owner/provider gates.
- No DEV/TEST live call, PROD, external Jitsi endpoint, or RuStore interaction was performed.

## Lead acceptance after the audit

The candidate-local type regression was corrected by retaining the narrowed meeting id before the terminal and
diagnostic callbacks. `pnpm --dir apps/webapp typecheck` still exits `2` on unrelated pre-existing workspace
artifact diagnostics, but an exact filter over its output now reports zero `DoctorLiveMeetingClient` diagnostics.
The affected pre-existing doctor UI suite passed its 5 existing cases during the targeted run, and scoped ESLint
passes.

After the owner tightened `AGENTS.md` §10a, the lead rejected both tests newly introduced by this audit:

- the coordinator test replaced the real meeting stage and asserted an internal provider/context contract rather
  than an independently observed product outcome;
- the Android lifecycle test reached private plugin fields by reflection and asserted an internal callback absence.

Both were removed before landing. The `next/navigation` setup repair in the existing doctor UI suite remains because
it only lets that pre-existing suite reach its existing behavioral oracle. The audit's inspection and temporary
fault-injection observations remain evidence, but the rejected tests are not retained as regression machinery.
