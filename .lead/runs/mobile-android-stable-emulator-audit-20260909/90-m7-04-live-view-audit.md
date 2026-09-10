# #915 M7-04 — API 35 live-view audit

Candidate inspected: `980f01515fe61265f72145c4aeeaf9f121e93544` on
`wt/mobile-android-stable-emulator-audit-20260909`, including the requested
Android WebView thread fix `8dff11a6b` and landing `164d71f9c`.

Verdict: **BLOCKED — M7-04 is not complete.** This is an emulator/runtime
blocker, not a product finding. The provided API 35 guest initially booted and
rendered both shells' public WebView pages, but ordinary acceptance could not
be carried through the authenticated paths: a first TherapyGo launch returned
`UiTestAutomationBridge`'s `null root node`, and the later freshly-cleared
Therapysto launch remained on splash before returning to the launcher. No
bridge/plugin/activity invocation, real provider, fixture, DB/service/env,
or production code/test change was used.

## Preconditions and artifacts

The only targeted device was the already-running `emulator-5560` / `bcb-api35`:

```bash
source /home/dev/.local/share/bcb-android/env.sh
adb devices -l
adb -s emulator-5560 shell getprop sys.boot_completed
adb -s emulator-5560 shell getprop ro.build.version.sdk
# emulator-5560 device; sys.boot_completed=1; SDK=35
```

The APKs were absent from this worktree, so the documented build was required.
The first sync stopped because `node_modules` was absent (`sharp` unavailable);
the lockfile-exact install and then the documented sync/build completed:

```bash
pnpm install --frozen-lockfile
pnpm --dir apps/mobile-shell run sync
pnpm --dir apps/mobile-shell run assemble:debug
sha256sum \
  apps/mobile-shell/android/app/build/outputs/apk/therapygoEnvironmentTest/debug/app-therapygo-environmentTest-debug.apk \
  apps/mobile-shell/android/app/build/outputs/apk/therapystoEnvironmentTest/debug/app-therapysto-environmentTest-debug.apk
```

| TEST package | APK SHA-256 | size |
|---|---|---:|
| `ru.therapygo.app.test` | `bcdd30f499e2860343331afc1b0a593021f0fb874cfa86f4c85f7f024e1f163a` | 197014845 bytes |
| `ru.therapysto.app.test` | `5efb2ea260f438ff971319d5cab2a36361e05c174ceffeca106e9f8fe417f384` | 197039597 bytes |

Both exact APKs were installed with `adb -s emulator-5560 install -r …`; only
their two package data stores were cleared with `pm clear` before ordinary UI
entry. No other package, AVD configuration, SDK component, emulator process,
or snapshot was changed.

## Visible acceptance record

| M7-04 observation | Result | Live evidence |
|---|---|---|
| TherapyGo and Therapysto launch their compiled TEST shell | **PASS** | Ordinary launcher actions `adb -s emulator-5560 shell monkey -p <package> 1` gave focused `MainActivity` windows for respectively `ru.therapygo.app.test` and `ru.therapysto.app.test`. The visible pages show TherapyGo client and Therapysto staff identities: `screenshots/03-therapygo-after-28s.png`, `screenshots/06-therapysto-current.png`. |
| First-party internal link remains in WebView; visible third-party HTTPS opens external Android browser without bridge | **BLOCKED** | The normal visible pages were reached, but guest UI instability prevented a safe completion of either link flow. No direct navigation policy/bridge call substituted for it. |
| Patient passwordless OTP path | **BLOCKED** | TherapyGo visibly reached its email-code form (`screenshots/04-therapygo-login-cta.png`), but no OTP was read, printed, bypassed, or injected. |
| Doctor ordinary password login | **BLOCKED** | Therapysto visibly reached the email/password form (`screenshots/07-therapysto-password-form.png`). A clean entry attempt was interrupted by guest UI instability before a safe post-login state; no credentials are retained in this evidence. |
| Camera Photo/Video switch; permission grant, deny/retry | **BLOCKED** | Requires authenticated ordinary media action; no direct DeviceMedia call was used. |
| Gallery and separate document picker cancellation/selection | **BLOCKED** | Requires authenticated ordinary media action; no sample document was created or selected. |
| Native Jitsi start; camera/mic grant, deny/retry; back/home/PiP/return; explicit end and duplicate-start guard | **BLOCKED** | Requires ordinary doctor call page; no NativeJitsi activity/plugin invocation was used. |
| Substitute notification provider: denied permission and actual notification tap to allowlisted route | **BLOCKED** | No documented fake/harness could be reached through ordinary app UI; no real RuStore/Universal Push provider or fabricated bridge callback was used. |

## Runtime blocker evidence

The initial public TherapyGo render was successful after 28 seconds and was
captured without credentials or health data. Immediately after its earlier
launcher action, however:

```bash
adb -s emulator-5560 shell uiautomator dump /sdcard/m7-04-therapygo.xml
# ERROR: null root node returned by UiTestAutomationBridge.
adb -s emulator-5560 shell dumpsys window | rg 'mCurrentFocus|mFocusedApp'
# mCurrentFocus=null
# mFocusedApp=... ru.therapygo.app.test/ru.therapygo.app.MainActivity
```

After clearing only `ru.therapysto.app.test` and repeating its ordinary
launcher launch, the visible splash was captured at
`screenshots/08-therapysto-clean-form.png`; the process then returned to the
Nexus launcher. Final device state was deliberately left running for owner
inspection:

```bash
adb -s emulator-5560 get-state
adb -s emulator-5560 shell getprop sys.boot_completed
adb -s emulator-5560 shell dumpsys window | rg 'mCurrentFocus|mFocusedApp'
# device
# 1
# ... NexusLauncherActivity
```

## Cleanup and scope

- Removed every auditor-created guest `/sdcard/m7-04-*.xml` observation file.
- No guest sample media/document was created; none remains to remove.
- Removed the two transient screenshots/XML files that could have included form input; no credentials, OTPs, cookies, tokens, or health data are retained in the committed artifacts.
- Stopped both app packages and sent Home; **did not** stop, wipe, snapshot, kill, or otherwise alter `emulator-5560`.
- `убито 0 / непойманных 0`: this is one live-view audit and authored no permanent acceptance test.

The only blocker is the guest/UI runtime failing to stay reliably usable across
ordinary launches. It does not demonstrate a reachable owner-requirement
failure in the candidate and therefore creates no product finding.
