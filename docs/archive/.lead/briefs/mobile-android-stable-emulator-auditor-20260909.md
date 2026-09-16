# Тест или взгляд — #915 M7-04 on the now-stable API 35 emulator

## Exact subject and safety

Work only in `/home/dev/dev-projects/bcb-wt-mobile-android-stable-emulator-audit-20260909` on
`wt/mobile-android-stable-emulator-audit-20260909`. The candidate is the current committed
`feat/doctor-ui-rebuild` including Android WebView thread fix `8dff11a6b` and landing `164d71f9c`.

An already-running orphaned emulator `emulator-5560` / AVD `bcb-api35` is now `adb device` with
`sys.boot_completed=1`. It has no live parent agent. Use this exact instance without rebooting, wiping, changing its
AVD config, killing it, snapshotting it or touching any other emulator. Do not change SDK packages. You may install
the two exact TEST debug APKs, clear only these two app packages if needed, and remove auditor-created sample files.
Leave `5560` running at the end for owner/browser viewing.

Read the `AGENTS.md` map before each action and in full §1/§1a/§1b, §9, §10a, §10b, §12 and §24; read
`apps/mobile-shell/README.md`, mobile plan M2-00a/M4/M5/M6/M7-04, and both prior blocker reports under
`.lead/runs/mobile-android-*`. This is an independent live-view audit, not a fixer. Production code and permanent
tests are read-only. Add no test; the output is one audit report only. Do not read/print secrets, OTP, cookies or
tokens; do not call real RuStore/Telegram/MAX providers; no DB, DEV/TEST service, env, deploy or migration mutation.

Источник оракула: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M7-04 — «Первичная Android acceptance
на эмуляторе покрывает origins/внешние ссылки, камеру, документы, native Jitsi, состояния разрешений и tap
уведомления с подставным провайдером».

## Ordinary-path acceptance

Build/sync only if the exact APKs are absent or stale. Record SHA-256 and install both TEST variants. Use visible UI
actions through ADB input/UIAutomator/screenshot/screenrecord as observation tools; direct plugin/activity calls do
not substitute for a user path. Synthetic camera media and a safe auditor-created document are allowed only through
the actual Android system picker/camera UI and must be removed afterwards.

1. TherapyGo opens its compiled TEST origin in WebView; Therapysto opens its own TEST origin. A first-party internal
   link stays in WebView. A visible third-party HTTPS link opens the Android external browser and cannot use the
   native bridge. Record package/window evidence, not cookies.
2. Use ordinary doctor password login from `AGENTS.md` §1a in Therapysto. Patient login is passwordless only. If the
   normal TherapyGo OTP can be completed without reading/printing a secret and remains inside the TEST allowlist, do
   it; otherwise mark only patient-auth-dependent observations BLOCKED and continue every behavior reachable from
   the doctor app. Never create fixtures or use a preset/token/cookie bypass.
3. From a real visible media action, exercise camera Photo/Video switch, grant and deny/retry; gallery and separate
   document picker cancellation/selection. Do not finish an upload. Verify the system UI destination and resulting
   app-visible selection/cancellation; direct bridge invocation is forbidden.
4. Start native Jitsi from the ordinary doctor call page with synthetic camera/mic if supported. Exercise permission
   grant and deny/retry, Android back/home/internal app navigation, system PiP/return and explicit end. Only the end
   control may terminate. Confirm a second start cannot create another call and no browser iframe is used in the
   native app.
5. Use only the repository-documented substitute/fake notification provider or debug harness. Observe denied
   notification permission separately and an actual Android notification tap opening only an allowlisted internal
   route. Do not invoke real Universal Push or fabricate success by calling the web bridge directly.
6. Capture screenshots for decisive OS/app states under
   `.lead/runs/mobile-android-stable-emulator-audit-20260909/screenshots/`. Do not expose credentials or health data.

## Verdict and cleanup

Report every M7-04 item as PASS/FAIL/BLOCKED with visible evidence and exact commands. A product finding requires a
reachable owner-requirement failure; emulator/provider limitations remain blockers, not invented product failures.
No source-text test or UI-count test. Record `убито 0 / непойманных 0`. Stop only auditor-started host processes,
close apps if useful but leave emulator `5560` running. Delete only auditor-created guest files. Commit report and
safe screenshots with explicit paths; no push.
