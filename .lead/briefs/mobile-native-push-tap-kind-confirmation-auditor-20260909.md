# Тест или взгляд — #915 K15 native Push tap-kind confirmation

Confirm only the K15 correction `f156170e9` after the independent end-to-end audit commit `2fd85ce9e`. Product
code is read-only. You may maintain the auditor-owned `UniversalPushPluginTest.java` fixture/oracle and add the
single confirmation report; do not fix product code, expand the kill-set, revisit the 19 already-passing classes or
touch webapp/integrator/data/services/PROD.

Run the AGENTS.md heading map; read §10/§10a/§10b and §24, the active plan M6-09/M6-10/M7, the K15 finding in
`.lead/runs/mobile-native-push-wire-confirmation-audit-20260909/90-final-audit-report.md`, product diff
`2fd85ce9e..f156170e9`, and the exact test before editing it.

Источник оракула — `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M6-09: «Tap ведёт внутрь правильной
поверхности приложения; внешние и обманные маршруты отклоняются.» Together with the same line's fixed wire and
M6-10's channel distinction, the accepted audit contract is the typed tap payload
`{pushSurface,notificationKind,route}`.

The retained test currently fabricates the pre-fix `Intent` shape and therefore must be updated by the auditor,
not weakened: supply a valid `nativePushKind`, execute real `deliverPendingTap`, and assert the emitted event has
exactly the required surface/kind/route values. Add negative cases proving missing/invalid kind emits no tap and
does not consume valid surface/route extras. Inspect `PushRuntime.showNotification` once to prove it now places the
same kind extra on the real PendingIntent. Do not assert source strings or private call counts.

Run all four brand×environment Android unit-test tasks under `/home/dev/brain/host-orch/run-tests.sh`; the retained
K15 oracle and all neighboring tests must be green. Run the relevant Android lint/compile gate only if the test or
production correction changes its covered source inputs beyond what those unit tasks compile; run
`git diff --check`. Create
`.lead/runs/mobile-native-push-tap-kind-confirmation-audit-20260909/90-final-audit-report.md` with exact SHA,
commands/results and `убито 1 / непойманных 0` only if the original regression is now caught and green. Explicitly
stage only the test and report, never `git add -A`; commit with `#915`, do not push. Restore any temporary changes
and return binary PASS/MUST FIX.
