# #915 Android emulator recovery — M7-04 continuation

Candidate under review: product `8dff11a6be5d6cc2e5bfd78934365d994c18f5b0`; this audit checkout is its report-only descendant `cb795c760ea6ac423b5288e1fb9384221b65c809`.

Verdict: **BLOCKED — no stable KVM-backed guest was obtained, so M7-04 ordinary-path acceptance was not entered.** This is emulator-infrastructure evidence, not a product finding. No product source or tests, DEV/TEST service, database, environment, provider credential, notification delivery, or APK was changed.

## Preconditions

The existing TEST APKs were the exact artifacts recorded by the prior audit:

```bash
sha256sum apps/mobile-shell/android/app/build/outputs/apk/therapygoEnvironmentTest/debug/app-therapygo-environmentTest-debug.apk \
  apps/mobile-shell/android/app/build/outputs/apk/therapystoEnvironmentTest/debug/app-therapysto-environmentTest-debug.apk
# TherapyGo:  bcdd30f499e2860343331afc1b0a593021f0fb874cfa86f4c85f7f024e1f163a
# Therapysto: 5efb2ea260f438ff971319d5cab2a36361e05c174ceffeca106e9f8fe417f384
```

The toolchain was emulator `37.1.11.0`, adb/platform-tools `37.0.1`, and the installed image was `system-images;android-35;google_apis;x86_64` version `9.0.0`. Before either attempt, `adb devices -l` and `pgrep -af 'qemu-system|emulator.*@'` showed another agent's `bcb-api35` on `5560`; it was not touched. Disk before recovery was measured with `df -B1 /`: `75,458,793,472` bytes available.

## Bounded recovery attempts

### 1. Retained API 35 repair — failed before guest usability

Started at `2026-09-09T18:16:41Z`, with an owned retained AVD only:

```bash
source /home/dev/.local/share/bcb-android/env.sh
sg kvm -c "$ANDROID_HOME/emulator/emulator @m7-04-api35 -port 5562 \
  -wipe-data -no-snapshot -no-snapshot-save -no-boot-anim \
  -feature -DeviceSkinOverlay -gpu swiftshader_indirect -skin 720x1280 \
  -memory 4096 -cores 4 -dns-server 1.1.1.1,8.8.8.8 -no-audio -no-window"
```

The emulator process and KVM guest started, and its own startup log reached `USER_INFO | Emulator is performing a full startup`. The bounded 180-second foreground polling gate never saw both `adb -s emulator-5562 get-state = device` and `sys.boot_completed=1`; every probe remained `error: device offline`. The process was stopped with `adb -s emulator-5562 emu kill`; a final `pgrep -af 'm7-04-api35.*-port 5562'` had no emulator result.

### 2. Fresh API 35 / Pixel 2 / Swangle — failed before guest usability

Started at `2026-09-09T18:21:10Z`, using a new explicitly named owned AVD, a different device definition and GPU path:

```bash
source /home/dev/.local/share/bcb-android/env.sh
avdmanager create avd --force --name m7-04-recovery2-api35-pixel2 \
  --package 'system-images;android-35;google_apis;x86_64' --device pixel_2
sg kvm -c "$ANDROID_HOME/emulator/emulator @m7-04-recovery2-api35-pixel2 -port 5564 \
  -no-snapshot -no-snapshot-save -no-boot-anim -feature -DeviceSkinOverlay \
  -gpu swangle -memory 2048 -cores 2 -dns-server 1.1.1.1,8.8.8.8 \
  -no-audio -no-window"
```

The fresh guest likewise started under KVM and its log reached `Successfully initialized netsim WiFi` and `Emulator is performing a full startup`. The separate 240-second polling gate never reached ADB `device`, `sys.boot_completed=1`, or a responsive `com.android.systemui`; probes returned `error: device offline`. Cleanup stopped only port `5564`; `adb devices -l` afterwards showed only the pre-existing `emulator-5560`.

This is the second materially distinct recovery strategy permitted by the brief. No third image, GPU mode, port, AVD repair, direct activity/plugin invocation, or injected callback was attempted.

## M7-04 ordinary-path verdicts

| Required observation | Verdict | Why |
| --- | --- | --- |
| Exact WebView origin and external-link boundary | **BLOCKED** | Neither guest reached the usable launcher/System UI prerequisite. |
| Patient OTP and specialist password through normal UI | **BLOCKED** | No normal app surface became reachable; no credentials or OTP were requested or printed. |
| Camera Photo/Video and grant/deny/retry | **BLOCKED** | Ordinary media UI was unavailable; no direct `DeviceMedia` call was used. |
| Gallery/document cancel and safe selection | **BLOCKED** | Ordinary picker UI was unavailable; no sample file or selection was created. |
| Native Jitsi permissions, navigation/PiP/return/explicit end | **BLOCKED** | Ordinary meeting UI was unavailable; no activity or plugin was directly invoked. |
| Substitute notification tap and denied notification permission | **BLOCKED** | No provider, callback, or notification harness was invoked without the normal UI path. |

`убито 0 / непойманных 0`: this was one-time runtime evidence, not a permanent acceptance-test pass.

## Cleanup and residual state

- Both owned emulator processes (`5562`, `5564`) were stopped; no process on either port remained.
- Temporary host logs and the never-used third-party APK staging paths were removed by each attempt's cleanup trap. No sample media, APK install, or guest data was retained.
- `m7-04-api35` remains the previously retained owned AVD; `m7-04-recovery2-api35-pixel2` remains explicitly named and retained as the second failed recovery configuration. Shared SDK packages, existing AVDs, and the other agent's running `bcb-api35` were not deleted or modified.

The blocker is therefore host/emulator runtime: two KVM-backed API 35 configurations could not progress from ADB `offline` to a responsive guest. It is not evidence that `8dff11a6b` causes a `com.android.systemui` failure, and it does not permit claiming any product M7-04 line passed or failed.
