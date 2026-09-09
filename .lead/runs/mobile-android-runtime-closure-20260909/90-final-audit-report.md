# #915 Android runtime closure — M7-04 final audit

Candidate: `8dff11a6be5d6cc2e5bfd78934365d994c18f5b0` (`wt/mobile-android-runtime-closure-audit-20260909`).

Verdict: **BLOCKED — M7-04 Android acceptance is not complete.** This was a live emulator pass, not a replacement with unit/Robolectric tests or direct plugin calls. The prerequisite `com.android.systemui` failure is reproducible on the existing API 36 AVD and again prevents the ordinary TherapyGo launch on the separately created API 35 AVD. No product code, permanent test, TEST/PROD service, DB, env, credentials, or provider delivery was changed.

## Authority and method

The criterion audited was the exact M7-04 text: Android acceptance must cover origins/external links, camera, documents, native Jitsi, permission states, and notification tap with a substitute provider. `MASTER_PLAN.md` M2-00/M2-00a/M7-04, `apps/mobile-shell/README.md`, server/local UI runbooks, and the previous API 36 report were read before host work.

The initial disk measurement was:

```bash
df -B1 /
# /dev/mapper/hk-root: 80,731,840,512 bytes available
```

Only the user-owned Android toolchain was used:

```bash
source /home/dev/.local/share/bcb-android/env.sh
```

Installed versions: emulator `37.1.11.0`, adb `1.0.41` / platform-tools `37.0.1`, Android platforms 35/36 `2.0.0`, Google APIs x86_64 images API 35 `9.0.0` and API 36 `7.0.0`. KVM was used through `sg kvm -c`; no snapshot was loaded or saved.

## APK evidence

No matching TEST APK was present initially, so dependencies were restored with `pnpm install --frozen-lockfile`, then the documented commands were run:

```bash
pnpm --dir apps/mobile-shell run sync
pnpm --dir apps/mobile-shell run assemble:debug
sha256sum apps/mobile-shell/android/app/build/outputs/apk/therapygoEnvironmentTest/debug/app-therapygo-environmentTest-debug.apk \
  apps/mobile-shell/android/app/build/outputs/apk/therapystoEnvironmentTest/debug/app-therapysto-environmentTest-debug.apk
```

Fresh debug APKs built from the candidate were:

| Variant | Size | SHA-256 |
| --- | ---: | --- |
| TherapyGo TEST (`ru.therapygo.app.test`) | 197,014,845 bytes | `bcdd30f499e2860343331afc1b0a593021f0fb874cfa86f4c85f7f024e1f163a` |
| Therapysto TEST (`ru.therapysto.app.test`) | 197,039,597 bytes | `5efb2ea260f438ff971319d5cab2a36361e05c174ceffeca106e9f8fe417f384` |

## Runtime results

### Existing API 36: reproduced blocker

The existing `bcb-api36` (Google APIs x86_64, API 36) was cold-started on the separate adb port `5558`:

```bash
sg kvm -c "$ANDROID_HOME/emulator/emulator @bcb-api36 -port 5558 \
  -no-snapshot -no-snapshot-save -no-boot-anim -gpu swiftshader_indirect \
  -dns-server 1.1.1.1,8.8.8.8 -memory 2048 -cores 2 -no-audio -no-window"
```

It reached `sys.boot_completed=1` and Launcher first. On the next cold launch/install attempt the guest failed: `adb install` returned `Failure calling service package: Broken pipe (32)`, `dumpsys package` returned `Can't find service: package`, and logcat contained `ANR in com.android.systemui`, `System zygote died with fatal exception`, and `FATAL EXCEPTION IN SYSTEM PROCESS`. This reproduces the known API 36 System UI blocker and is sufficient to reject it as an acceptance runtime.

### Separate API 35: network recovered, UI still fails

With the already installed official API 35 image, a new user-owned `m7-04-api35` Pixel 7 AVD was created; existing `bcb-api35` and its process on port `5560` were never touched. It was cold-started on `5562`:

```bash
avdmanager create avd --force --name m7-04-api35 \
  --package 'system-images;android-35;google_apis;x86_64' --device pixel_7
sg kvm -c "$ANDROID_HOME/emulator/emulator @m7-04-api35 -port 5562 \
  -no-snapshot -no-snapshot-save -no-boot-anim -feature -DeviceSkinOverlay \
  -gpu swangle -skin 720x1280 -memory 4096 -cores 4 \
  -dns-server 1.1.1.1,8.8.8.8 -no-audio -no-window"
```

It reached `sys.boot_completed=1` (API `35`). After the documented reversible Wi-Fi enable requests, the guest acquired validated Wi-Fi `10.0.2.17/24`, DNS `10.0.2.3`/`10.0.2.4`, and `ping -c 1 -W 5 test.therapygo.ru` succeeded (`151.241.228.122`, 0% packet loss). The TherapyGo APK installed and `pm list packages` confirmed `ru.therapygo.app.test`.

The ordinary app launch was then attempted with the launcher package path:

```bash
adb -s emulator-5562 shell monkey -p ru.therapygo.app.test 1
adb -s emulator-5562 shell dumpsys window
```

The focused app was the expected `ru.therapygo.app.test/ru.therapygo.app.MainActivity`, but the foreground window was `Application Not Responding: com.android.systemui`. This is a visible platform failure at the ordinary UI entrance; continuing with injected intents, direct bridge/plugin calls, or fake notification callbacks would not be M7-04 acceptance. The Therapysto install/UI pass therefore was not claimed.

## M7-04 binary checklist

| Required live behavior | Verdict | Evidence |
| --- | --- | --- |
| Compiled exact origin stays in WebView; third-party HTTPS opens externally without bridge | **BLOCKED** | System UI ANR prevents interaction after the normal native app launch. |
| Patient OTP and specialist password through ordinary UI | **BLOCKED** | The UI could not advance to the login surface; no bypass was used. |
| Camera Photo/Video; grant/deny/retry | **BLOCKED** | The normal UI path is unavailable before the media action. |
| Gallery/document picker; cancel/selection with safe local sample | **BLOCKED** | The normal UI path is unavailable; no synthetic picker/bridge call was substituted. |
| Native Jitsi; camera/mic grant/deny/retry; back/home PiP/return/explicit end | **BLOCKED** | The normal UI path is unavailable; no direct `NativeJitsi` invocation was substituted. |
| Substitute-provider notification tap reaches only allowlisted route; denied notification permission separately observed | **BLOCKED** | The normal app UI cannot become usable; neither provider delivery nor real RuStore credentials were used. |

`убито 0 / непойманных 0`: no persistent acceptance test was authored in this live-view audit, so there is no kill-set score to claim. The observed reachable requirement failure is the platform ANR above, not an unreported product-code finding.

## Cleanup and residual blocker

The temporary `/sdcard/m7-04-ui.xml` sample was deleted from the owned API 35 guest. Both owned emulator instances were stopped with `adb -s emulator-5558 emu kill` and `adb -s emulator-5562 emu kill`; the final process search found no qemu process on either port. The independent pre-existing API 35 emulator on `5560` remains untouched.

`m7-04-api35` is retained under `/home/dev/.local/share/bcb-android/sdk/avd/` because it completed a KVM cold boot and NAT/DNS probe; it is not accepted as a stable M7-04 runtime because launch immediately exposed the same System UI ANR class. The residual blocker is therefore: **a cold, KVM-backed emulator that can keep `com.android.systemui` alive through ordinary application launch is required before all seven M7-04 UI outcomes can be observed.**

Final repository check before commit:

```bash
git diff --check
git status --short
```

Only this audit artifact is intended for staging.
