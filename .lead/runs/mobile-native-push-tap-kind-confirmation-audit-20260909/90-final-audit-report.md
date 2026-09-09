# Final audit report — #915 K15 native Push tap-kind confirmation

**Candidate:** `f156170e9` "fix(mobile): preserve native Push tap kind #915" (base for this pass:
`2fd85ce9e` "audit(mobile): confirm native Push wire, find tap-event kind gap #915"), on
`wt/mobile-native-capabilities-audit-20260909` = `5635e8bc5` at the start of this pass. **Role:**
`auditor-live`, confirmation-only pass per brief
`.lead/briefs/mobile-native-push-tap-kind-confirmation-auditor-20260909.md`. Product code is
read-only in this pass; only the auditor-owned `UniversalPushPluginTest.java` fixture/oracle was
touched. **Authority:** `MASTER_PLAN.md` M6-09 ("Tap ведёт внутрь правильной поверхности
приложения; внешние и обманные маршруты отклоняются.") together with M6-09's fixed data-only wire
and M6-10's channel distinction — the accepted contract is the typed tap payload
`{pushSurface,notificationKind,route}`. Prior finding:
`.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/90-final-audit-report.md` §K15.

## Verdict: **PASS**

K15's original regression (Android's tap event omitted `notificationKind`) is fixed by product
commit `f156170e9` and is now caught by an exact-value assertion, not merely presence, plus two new
negative cases proving the validator gate is real (missing/invalid kind → no tap, and the
surface/route extras it never got to consume are left on the intent). All 22 tests in
`UniversalPushPluginTest` (20 pre-existing + 2 new) are green on all 4 brand×environment variants.

**Убито 1 / непойманных 0.**

## What was inspected before editing (per brief)

- `AGENTS.md` heading map → §10/§10a/§10b (test-or-view classification, canon of test authoring),
  §24 (orchestration: 24.1 delegation gate, 24.4 test-or-view, 24.5 blind audit, 24.6 findings/fix).
- Active plan `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M6-09/M6-10/M7 (oracle text
  quoted above; M7-01/M7-02 confirm workers don't write tests and auditors own the kill-set).
- K15 finding in `mobile-native-push-wire-confirmation-audit-20260909/90-final-audit-report.md`.
- Product diff `2fd85ce9e..f156170e9`: `PushRuntime.java` adds
  `.putExtra("nativePushKind", kind)` to the tap `Intent`; `UniversalPushPlugin.java`'s
  `deliverPendingTap()` adds `validKind(kind)` to the gate and forwards `notificationKind` in the
  retained tap event, removing `nativePushKind` from the intent on success.
- The exact retained test method before editing: it fabricated the pre-fix `Intent` shape (no
  `nativePushKind` extra set on the launch intent) and asserted only `tapEvent.has("notificationKind")`
  — i.e. it exercised the code path where `validKind(null)` rejects the tap and no event is ever
  retained, so `.has()` on an empty/absent event list was never actually reachable as a *positive*
  assertion; the test as written could not have gone green by exercising the fixed code path with a
  present kind. It needed updating, not weakening.
- `PushRuntime.showNotification` (view/inspection only — one-time construction, not repeatable
  behavior per §24.4, no test warranted): confirmed the `Intent` built at
  `PushRuntime.java` (the block `.setAction("ru.therapygo.app.PUSH_TAP").putExtra("nativePushSurface",
  surface).putExtra("nativePushKind", kind).putExtra("nativePushRoute", route)`) is the exact `Intent`
  passed to `PendingIntent.getActivity(...)`, i.e. the same object becomes the tap `PendingIntent`'s
  content intent — so `nativePushKind` really is placed on the real `PendingIntent`, not a copy.

## Test changes

File: `apps/mobile-shell/android/app/src/test/java/ru/therapygo/app/UniversalPushPluginTest.java`
(auditor-owned oracle, no production code touched).

1. **Updated** `deliverPendingTapEmitsPushSurfaceNotificationKindAndRoute`: launch intent now
   supplies a valid `nativePushKind` ("reminder"); `deliverPendingTap()` runs for real (reflection,
   as before — no mock of the protected `notifyListeners`); assertions changed from
   `tapEvent.has(...)` to `assertEquals(...)` against the exact expected `pushSurface`,
   `notificationKind` and `route` values.
2. **New** `deliverPendingTapRejectsMissingKindAndDoesNotConsumeValidExtras`: launch intent has valid
   surface+route but no kind extra at all → asserts no tap event is retained, and asserts
   `nativePushSurface`/`nativePushRoute` are still present unchanged on the intent (proving the
   `validSurface && validKind && validRoute` short-circuit never reaches the `removeExtra` calls when
   kind fails).
3. **New** `deliverPendingTapRejectsInvalidKindAndDoesNotConsumeValidExtras`: same shape with an
   undocumented kind (`"marketing"`) → same two assertions, plus confirms the kind extra itself is
   also left untouched.

Self-test per §10a "Проверь себя перед коммитом": named поломка = "Android's tap event omits/mis-carries
`notificationKind`, or the validator gate is bypassable". Verified experimentally, not just by
inference: temporarily restored the pre-edit (unmodified `HEAD`) test file against the already-fixed
product code (`f156170e9` unchanged) and ran
`bash apps/mobile-shell/scripts/gradle.sh testTherapygoEnvironmentTestDebugUnitTest --tests
'ru.therapygo.app.UniversalPushPluginTest' --continue` under the host lock — the unedited test fails
(`deliverPendingTapEmitsPushSurfaceNotificationKindAndRoute FAILED`, `AssertionError` at its "must
retain exactly one tap event" line, because it never supplied `nativePushKind` on the launch intent
so the fixed `validKind` gate now rejects the tap outright) — confirming the retained test could not
have passed unedited even against the fix, and had to be rewritten rather than merely accepted. The
test file was then restored to this pass's edited version (byte-identical to the version already
proven green above) before continuing. No refactor of the test touches source text/positions/call-
counts (checked against §10a's "как не надо" list).

## Commands run

```
source /home/dev/.local/share/bcb-android/env.sh
bash /home/dev/brain/host-orch/run-tests.sh \
  "bash apps/mobile-shell/scripts/gradle.sh --continue \
   testTherapygoEnvironmentTestDebugUnitTest testTherapygoProductionDebugUnitTest \
   testTherapystoEnvironmentTestDebugUnitTest testTherapystoProductionDebugUnitTest"
# BUILD SUCCESSFUL in 48s; 119 actionable tasks: 20 executed, 99 up-to-date
```

Per-variant `UniversalPushPluginTest` result (`app/build/test-results/test<Variant>UnitTest/TEST-ru.therapygo.app.UniversalPushPluginTest.xml`):

| Variant | tests | failures | errors | skipped |
|---|---|---|---|---|
| TherapygoEnvironmentTestDebug | 22 | 0 | 0 | 0 |
| TherapygoProductionDebug | 22 | 0 | 0 | 0 |
| TherapystoEnvironmentTestDebug | 22 | 0 | 0 | 0 |
| TherapystoProductionDebug | 22 | 0 | 0 | 0 |

(20 pre-existing + 2 new = 22, all four brand×environment variants green.)

```
git diff --check   # clean
```

Android lint/assemble/build gates were **not** re-run: this pass changed only
`UniversalPushPluginTest.java` (a test file already compiled and exercised by the 4 unit-test tasks
above); no production source or its covered inputs changed beyond what those tasks already compile.
Per `AGENTS.md` §10 Strong reuse rule, the prior pass's `BUILD SUCCESSFUL` evidence for the 8
`assemble*` + 4 `lint*` variants on the unchanged production SHA (`f156170e9`) is reused rather than
re-run.

## Scope and safety

- No product code modified in this pass (`git diff --stat` outside the test file is empty).
- Kill-set was not expanded; the 19 already-passing K1–K14/K16–K20 items and 8 structural V1–V8 items
  were not revisited.
- No DB, DEV/TEST write, device, real provider request, credential read, or PROD access was used.
- Only the test file and this report are staged for commit; `git add -A` was not used.

## External/host blockers

None new. `M7-04`/`M7-05` (emulator/device, real RuStore delivery) remain externally blocked per
earlier reports, unaffected by this confirmation pass.
