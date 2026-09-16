# Final audit report — #915 end-to-end Universal Push wire confirmation

**Candidate:** `b31e104d6` "fix(mobile): unify native Push wire, route allowlist and copy #915" +
`fd3f6a3b5` "fix(mobile): degrade missing push keyring safely #915" + `759c80cd1` (docs-only),
merged into `wt/mobile-native-capabilities-audit-20260909` = `8e94cb55a`. **Role:** `auditor-live`,
first independent pass over this corrected wire (worker `mobile-native-push-wire-correction-worker-20260909`
was tests-out-of-scope per its own brief). **Authority:** `MASTER_PLAN.md` M6 (M6-01…M6-11), M7-01/M7-02;
`OWNER_PRODUCT_RULES.md` §2/§15/§18/§21–§25/§27/§28. Blind kill-set:
`.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/00-blind-killset.md`, written before
reading the candidate diff, existing tests, or the two earlier independent reports
(`mobile-native-capabilities-confirmation-audit-20260909`, `mobile-rustore-provider-contract-audit-20260909`).

## Overall verdict: **FAIL — one real, reachable defect (K15); everything else PASS**

**FAIL only on K15** (Android's tap event omits `notificationKind`, contradicting the brief's own
mandated tap-event contract). All 19 other behavioral kill-set items and all 8 structural items
PASS with test+fault-injection or inspection evidence. A red acceptance test proving K15 is
committed as the handoff oracle; no product code was changed by this audit (all fault injections
were reverted; `git diff --stat` on every touched production file is empty).

**Убито 19 / непойманных 1** (of 20 behavioral kill-set items; the 8 structural items are PASS-by-view,
not part of this fault-injection tally, per the kill-set's own split).

## Test-or-view classification and producer matrix

Per `AGENTS.md` §24.4: K1–K20 (repeatable behavior, dorogoy+molчаливый) → behavioral test;
V1–V8 (one-time/structural shape) → view (`rg`/read). Full classification and rationale is in
`00-blind-killset.md`, written before any test or diff was read.

**Producer matrix** (every production `web_push` producer that sets `pushSurface`, read from the
candidate diff): `patientWebPushNotify.ts` (reminder/message by intentType), `materializePatientReminderDeliveries.ts`
(reminder), `notifySpecialistTaskReminder.ts` + `prepareReminderDeliveries.ts` (reminder),
`videoMeetingInvitationNotification.ts` (call, dedicated native route independent of guest URL),
`notifyDoctorPatientMessage.ts` + `notifyDoctorPatientProgramNote.ts` + `notifyPatientDoctorReply.ts`
(message), `sendAdminIncidentStaffWebPush.ts` + `prepareOperatorHealthDigestDeliveries.ts` (message,
kind-only — correctly no `nativeRoute`, both target the out-of-allowlist global-admin surface).

## Kill-set results

| ID | Item | Method | Result | Evidence |
|---|---|---|---|---|
| K1 | Producers emit 3 typed facts together, mutually consistent | test (new + fault-inject) | **PASS** | `deliveryAdapter.dataOnlyWire.contract.test.ts`: mutual-consistency case + kind-without-route case; both fault-injected red, reverted |
| K2 | Reminders → `reminder` | view (producer diffs read) | **PASS** | `appointmentReminderMaterialization.ts`, `materializePatientReminderDeliveries.ts`, `notifySpecialistTaskReminder.ts`, `prepareReminderDeliveries.ts` all set `notificationKind:'reminder'` |
| K3 | Video invitation → `call` | test (fixed stale oracle + fault-inject via existing suite) | **PASS** | `videoMeetingInvitationNativePush.contract.test.ts` rewritten to assert `notificationKind:'call'`; green |
| K4 | Message/reply/news/admin/operator → `message` | view + K1 test | **PASS** | all message-class producers set `notificationKind:'message'`; admin/operator kind-only case covered by K1's new test |
| K5 | Video invite: guest URL unchanged for browser, native route fixed `/app/patient/live/${meetingId}` | test (existing, rewritten) | **PASS** | `videoMeetingInvitationNativePush.contract.test.ts` asserts both `url` (unchanged guest link) and `pushExtras.nativeRoute` in the same call |
| K6 | Legacy fallback only from strict relative same-surface `url` | test (existing) | **PASS** | `deliveryAdapter.finalSurface.contract.test.ts` — 9 `it.each` cases (absolute/protocol-relative/encoded-traversal/backslash/admin route/invalid-surface), all skip |
| K7 | Malformed legacy row skips only native leg, browser unaffected | test (existing) | **PASS** | `deliveryAdapter.nativeFanOut.contract.test.ts` "missing VAPID does not block native" + inverse structurally guaranteed (native/browser legs are independent `Promise.all` branches in `send()`) |
| K8 | Provider body is exactly the 5 named keys, no extras/secrets | test (new + fault-inject) | **PASS** | `deliveryAdapter.dataOnlyWire.contract.test.ts` — fault: spread `pushKind` into wire → red; reverted |
| K9 | `route` comes from `nativeRoute`, never `url` | test (new + existing) | **PASS** | same test: absolute clinic `url` present, wire `route` is the bounded `nativeRoute` |
| K10 | title/body trimmed to 120/240 Unicode code points | test (new + fault-inject, both TS and Android) | **PASS** | integrator: fault (removed `truncateCodePoints` calls) → red; reverted. Android: `validCopyCountsUnicodeCodePointsNotChars` (new) proves code-point, not UTF-16-unit, counting |
| K11 | Android rejects missing/malformed/overlong data before display | test (new) | **PASS** | `validCopyRejectsMissingBlankOrOversizedFields` (new); `handleMessage`'s `validCopy` gate read and confirmed to run before `showNotification` |
| K12 | Brand + route allowlist enforced before render/route | test (existing + new) | **PASS** | `rejectsTheSiblingBrandAsSurface` (existing); `acceptsTherapystoSettingsAndAccountPrefixesNotJustDoctor` (new — the pre-existing suite never exercised `/app/settings`/`/app/account`) |
| K13 | Allowlist rejects lookalikes/absolute/protocol-relative/fragments/userinfo/sibling/backslash/traversal | test (existing) | **PASS** | `UniversalPushPluginTest` 7 existing route-rejection cases + `deliveryAdapter.finalSurface.contract.test.ts` 9 cases — both sides |
| K14 | Server/Android allowlists observationally identical | view + test | **PASS** | Android now uses the same 3-prefix therapysto set (`/app/doctor`,`/app/settings`,`/app/account`) as `surfaceForPathname` in `deliveryAdapter.ts`; both independently tested |
| K15 | Tap event is exactly `{pushSurface,notificationKind,route}` | test (new) | **FAIL — real defect** | see "Finding" below |
| K16 | Cold-process receipt renders; invalid never renders | inspection (cost-proportionality reused from prior audit, §10a) | **PASS** | `PushRuntime.handleMessage`/`showNotification` depend only on `appContext` (set in `bootstrap()`, independent of WebView/listener) and the same `validSurface/validKind/validRoute/validCopy` gates; a full behavioral test would require faking the real RuStore SDK singleton — same disproportionality call the prior confirmation audit documented and attempted (`mobile-native-capabilities-confirmation-audit-20260909/90-final-audit-report.md` §F) |
| K17 | Skip outcomes don't create a second notification family / messenger fallback | view (`rg`) | **PASS** | no new table/schema, no messenger-fallback code path added in this diff (`git diff --stat` scope confirmed below) |
| K18 | Keyring absent → ordinary Next/PWA bootstrap stays operational | test (new, fault-injected) | **PASS** | `nativePush.unit.test.ts` — fault: reverted wrapper to always throw → red; reverted. Confirmed by reading `buildAppDeps.ts:546` (module-scope construction) that it now calls the non-throwing wrapper |
| K19 | Keyring absent → typed skip on register/rotate/delivery, not throw/500 | test (new, fault-injected both classes) | **PASS** | `keyringUnavailable.route.test.ts` (6 cases, both routes × GET/POST/DELETE) — fault A (wrapper throws) and fault B (route drops its own `!targets` guard) both independently reddened; reverted |
| K20 | Keyring present → unaffected (no accidental universal skip) | test (existing + new) | **PASS** | `fixedSurfaceProjectId.route.test.ts` (existing, still green); `nativePush.unit.test.ts` round-trip encrypt/decrypt case |

## Structural items (view, not fault-injected)

| ID | Item | Result |
|---|---|---|
| V1 | One typed `pushExtras`/queue path | **PASS** — `outboundMessageQueuePort.ts`'s `OutboundMessageContent.pushExtras` gained 2 optional fields; no second field/queue |
| V2 | One composite `web_push` adapter | **PASS** — `deliveryAdapter.ts` unchanged as the sole `DeliveryAdapter` for `web_push`; RuStore fan-out lives inside its `send()` |
| V3 | One pre-provider environment gate, not duplicated for RuStore | **PASS** — `assertOutboundMessagePolicy`/`applyPreForkEnvironmentDeliveryPolicy` called once in `dispatchPort.ts:329-330`, upstream of `deliveryAdapter.send()`; no `readChannel`/policy call inside `deliveryAdapter.ts` |
| V4 | No duplicate route-policy/notification-event stack | **PASS** — `rg` for a second allowlist/route table or `notification_events`-shaped schema: none in this diff |
| V5 | No raw secret/token logged | **PASS** — the 4 `logger.*` call sites in `deliveryAdapter.ts` log `pushUserId`/counts/`endpointHash`/reason codes only; no `authToken`/`token` field |
| V6 | No DB/schema/migration changes | **PASS** — `git diff --stat` scoped to `apps/webapp/db/**`/migrations: empty |
| V7 | No unrelated UI changes | **PASS** — full file list of `b31e104d6`/`fd3f6a3b5` is producers, `deliveryAdapter.ts`, Android plugin/runtime, DI wiring, 2 API routes, README; no UI component touched |
| V8 | Worker's own "not fixed" note (stale test/type error) is real and scoped | **PASS** — reproduced exactly (`videoMeetingInvitationNativePush.contract.test.ts` TS2322 + stale assertion), fixed in this pass, scoped to that one file |

## Finding

### K15 — Android's tap event omits `notificationKind` (the brief's own mandated `{pushSurface,notificationKind,route}` contract)

**Summary.** `PushRuntime.showNotification()` builds the tap `PendingIntent`'s `Intent` extras as only
`nativePushSurface` + `nativePushRoute` (`PushRuntime.java`, the `Intent tap = ...putExtra(...)` block) —
`kind`/`notificationKind` is never attached. `UniversalPushPlugin.deliverPendingTap()` correspondingly
reads only `nativePushSurface`/`nativePushRoute` from the launch intent and emits
`{event:'tap', pushSurface, route}` to the JS bridge — `notificationKind` is structurally absent from
both the carrier `Intent` and the JS event.

**Impact.** The web `NativeRuntime` (queued for the next mobile web-adapter workstream per
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` parallel workstream 3) cannot distinguish a
tap on a reminder/call/message notification from the tap event alone — it would need to re-derive kind
from `route`, which the typed contract exists specifically to avoid. This is the exact requirement the
audit brief itself names verbatim: "Android ... emits the typed tap event
`{pushSurface,notificationKind,route}}` without copy or token extras." It is reachable on every real
device tap, not an edge case.

**Evidence.** New test `deliverPendingTapEmitsPushSurfaceNotificationKindAndRoute`
(`UniversalPushPluginTest.java`) builds the launch `Intent` exactly as `showNotification` does (with
`nativePushSurface`/`nativePushRoute` set), invokes the real `deliverPendingTap()` via reflection, and
reads the retained JS event from `Plugin`'s own `retainedEventArguments` (no mock of `notifyListeners`
needed — it is `protected` across the `com.getcapacitor`/`ru.therapygo.app` package boundary). The test
is **red on the current candidate** in all 4 brand×environment variants (confirmed by direct execution,
not inspection):

```
UniversalPushPluginTest > deliverPendingTapEmitsPushSurfaceNotificationKindAndRoute FAILED
    java.lang.AssertionError: tap event must carry notificationKind ...
87 tests completed, 1 failed
```
(same single failure reproduced on `testTherapygoEnvironmentTestDebugUnitTest`,
`testTherapygoProductionDebugUnitTest`, `testTherapystoEnvironmentTestDebugUnitTest`,
`testTherapystoProductionDebugUnitTest` — all other 86 tests green on each variant, including the 19
new/pre-existing tests this pass added or re-verified.)

**This is a genuine finding, not scope creep**: it is one of the brief's own explicitly-listed
kill-set requirements, not an invented improvement. Per `AGENTS.md` §10a/§24.5, the failing test stays
committed **red** as the handoff oracle; this audit does not fix product code. The fix is a one-line
addition (carry `kind` through the `Intent` extra and the `pendingTap` JSObject), squarely a
delegation-gate §24.1 "known one function/file microfix" — not a new correction-stage worker.

## Observations (not findings — no plan requirement violated, recorded for the record)

1. **`appointment_lifecycle` classified as `notificationKind:'reminder'`** (`patientWebPushNotify.ts`).
   The brief names "appointment/patient/specialist reminders" and "message/reply/news/admin/operator"
   explicitly but does not name booking-lifecycle (created/cancelled/rescheduled) events, which are
   status changes rather than upcoming-event reminders. Current code buckets them with `appointment_reminder`
   under `reminder`. No cited plan text contradicts this; recorded as an owner-classification note, not
   a violation.
2. **`buildDoctorMessagesOpenPath`'s `encodeURIComponent(conversationId)` could theoretically produce a
   `%`-containing path** that `parseBoundedRoute`'s charset (`[A-Za-z0-9/_?=&.-]`) rejects, silently
   skipping the native leg for that one message. `conversationId` is a DB-generated UUID in every real
   caller (no `%`-requiring characters), so this is not demonstrated reachable; not a finding.
3. `deliveryAdapter.nativeFanOut.contract.test.ts`'s first test's own comment ("no producer in this repo
   sets `pushExtras.pushSurface`") is now stale — every producer does, after this fix. The assertion
   itself remains correct and green; not touched (no false protection, purely a comment).

## Fault-injection log (all reverted; `git diff --stat` empty on every listed file after each)

| # | File | Fault | Command | Result |
|---|---|---|---|---|
| 1 | `apps/webapp/.../nativePush.ts` | wrapper always throws (pre-fix behavior) | `vitest run nativePush.unit.test.ts` | red → reverted → green |
| 2 | `apps/webapp/.../patient/native-push/route.ts` | dropped `!targets` guard on POST | `vitest run keyringUnavailable.route.test.ts` | red → reverted → green |
| 3 | `apps/integrator/.../deliveryAdapter.ts` | spread `pushKind` into RuStore wire | `vitest run deliveryAdapter.dataOnlyWire.contract.test.ts` | red → reverted → green |
| 4 | same | removed `truncateCodePoints` calls | same | red → reverted → green |
| 5 | same | dropped `surfaceForPathname` mismatch check | same | red → reverted → green |
| 6 | same | let kind-only fall back to `url` inference | full `web-push` dir | red (new test) → reverted → green |

Android: no product-code fault injection this pass (the K12–K14 validators were already proven by the
prior `mobile-native-capabilities-confirmation-audit-20260909` pass's fault injections against
`validSurface`/`validRoute`, reused per §10 Strong reuse rule — same file, unchanged logic except the
therapysto prefix-set widening, which this pass covers with a **new** positive test rather than
re-deriving the traversal-rejection fault already proven). K15's defect is real (not injected).

## Commands run (all foreground; no DB/device/provider/PROD; `git diff --check` clean throughout)

```
pnpm --dir apps/webapp exec vitest run <targeted files>          # green (final), red (fault injections, reverted)
pnpm --dir apps/webapp exec tsc --noEmit -p tsconfig.json         # clean (fixed the one pre-existing TS2322)
pnpm --dir apps/integrator exec vitest run src/integrations/web-push   # 27/27 green
pnpm --dir apps/integrator run typecheck                          # clean
pnpm --dir apps/integrator run build                               # clean
node scripts/check-db-chokepoint.mjs / check-no-new-raw-sql.mjs / check-queue-port-boundary.mjs  # OK
gitleaks detect --no-git --source <new/changed test files>        # no leaks
git diff --check                                                  # clean

source /home/dev/.local/share/bcb-android/env.sh
bash /home/dev/brain/host-orch/run-tests.sh \
  "bash apps/mobile-shell/scripts/gradle.sh --continue \
   testTherapygoEnvironmentTestDebugUnitTest testTherapygoProductionDebugUnitTest \
   testTherapystoEnvironmentTestDebugUnitTest testTherapystoProductionDebugUnitTest"
# 87 tests × 4 variants; 1 known failure (K15) × 4, 0 unexpected failures
```

Assemble/release/lint gates (8 `assemble*` + 4 `lint*` variants) were **not** re-run: no Android
production source changed in this pass (only `UniversalPushPluginTest.java`, a test file), and the
worker's own commit (`b31e104d6`) already ran and recorded `BUILD SUCCESSFUL` for all 8+4 on this exact
SHA. Per `AGENTS.md` §10 Strong reuse rule / Audit validation "проверить свежесть уже имеющегося
evidence на том же SHA", that evidence is reused rather than re-run. Full root `pnpm run ci` was not
run — this is a per-workstream confirmation with direct targeted evidence, and the diff touches no
root-level shared config/lockfile/CI workflow (per M7-06 that gate is reserved for the final
`feat/doctor-ui-rebuild` integration checkpoint).

## Scope and safety

- No product code left modified: `git diff --stat` on every production file listed in the "Fault
  injection log" is empty as of this report.
- Only tests and this run's own artifacts are staged for commit (`git add` explicit paths below), never
  `git add -A`.
- No DB, DEV/TEST write, device, real provider request, credential read, or PROD access was used.
- One pre-existing type error and one stale assertion in `videoMeetingInvitationNativePush.contract.test.ts`
  (named by the worker's own commit message as "the next auditor-live's to rewrite") were fixed in this
  pass — this is exactly the handoff this audit exists to close, not scope creep.

## External/host blockers

None new. `M7-04`/`M7-05` (emulator/device, real RuStore delivery) remain externally blocked per the two
earlier reports' unchanged findings (`id` still lacks `kvm` group); not exercised by this confirmation.
