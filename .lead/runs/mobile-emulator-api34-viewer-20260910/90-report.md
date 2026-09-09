# #915 M7-04 fresh API 34 browser-viewer recovery — runtime report

Verdict: **BLOCKED — fresh API 34 reaches KVM-backed ADB boot, but System UI ANR prevents an accepted emulator runtime.** No browser viewer URL exists. `x11vnc` and noVNC/websockify were never started.

## Host boundary and preflight

This run was made only on the documented DEV/RELAY/TEST host. The exact commands and measured results were:

```bash
hostname -I
# 151.241.228.122 ...
ip -4 -o addr show dev awg0
# 10.9.0.1/24
df -B1 /home/dev | tail -n 1
# 64,956,035,072 bytes available
sg kvm -c 'id; test -r /dev/kvm && test -w /dev/kvm && echo kvm-access-pass'
# kvm-access-pass
```

The official Android CLI installed the absent user-owned package
`system-images;android-34;google_apis;x86_64` below
`/home/dev/.local/share/bcb-android`. A new run-owned AVD, and no existing AVD,
was created:

```text
bcb-viewer-api34 — Android 14 / API 34 Google APIs x86_64, Pixel 2,
2 cores, 2 GiB RAM
```

Preflight found no emulator, VNC/noVNC process or relevant listener. The selected initial pairs were Xvfb `:110` / emulator console+ADB `5580/5581`; the second attempt used `:111` / `5582/5583`. The latter display and ports were verified free before use.

## APK evidence

The TEST APKs were absent in this worktree, so the documented host-locked build completed its artifact production:

```bash
/home/dev/brain/host-orch/run-tests.sh "source /home/dev/.local/share/bcb-android/env.sh && pnpm install --frozen-lockfile && pnpm --dir apps/mobile-shell run sync && pnpm --dir apps/mobile-shell run assemble:debug"
```

`sha256sum` returned:

| TEST package | SHA-256 |
| --- | --- |
| `ru.therapygo.app.test` | `f3e8ea18ae628430c583e17b9266952a5127280a6c2e6c85a2e16febfb91b373` |
| `ru.therapysto.app.test` | `d60be00c8593e4b744fb33e1e444369329c5601244654e5c1eb635c81563bda9` |

## Bounded fresh-AVD attempts

| Attempt | Renderer / KVM path | Result |
| --- | --- | --- |
| 1 | SwiftShader, `:110`, `5580/5581` | Failed before ADB: the emulator launch was not wrapped by `sg kvm` and reported `x86_64 emulation currently requires hardware acceleration` / no `/dev/kvm` permission. Only exact owned emulator PID `760556` and Xvfb PID `760490` were stopped. |
| 2 | Swangle, `:111`, `5582/5583`, `sg kvm -c`, `-wipe-data` | Passed bounded boot gate: `adb -s emulator-5582 get-state` returned `device`; `adb -s emulator-5582 shell getprop sys.boot_completed` returned `1`; `dev.bootcomplete=1` and boot animation was stopped. |

The second boot then regressed to a visible System UI ANR before a valid app surface could be accepted. The exact inspection was:

```bash
adb -s emulator-5582 shell dumpsys window
# mCurrentFocus=... Application Not Responding: com.android.systemui
```

The visual evidence is [failed-api34-systemui-anr.png](failed-api34-systemui-anr.png): it shows Android's "System UI isn't responding" modal. TherapyGo was installed before the ANR (`pm list packages` returned `package:ru.therapygo.app.test`); the staff install was still blocked when cleanup began. No launcher intent, patient/staff surface, noVNC page, or viewer URL is claimed as successful.

## Final cleanup and retained diagnosis state

The API 34 image and `bcb-viewer-api34` AVD remain for lead diagnosis, as required on a non-corrupt failure. All run-owned runtime processes were stopped: QEMU `761797`, its `sg`/shell parents `761794`/`761796`, netsim `761957`, Xvfb `761682`, and the in-flight exact install shell/ADB PIDs `767929`/`769549`.

The final exact checks were:

```bash
adb devices -l
# List of devices attached
ss -ltnp | rg ':(5582|5583|5909|6090)\\b'
# no output
test -e /tmp/.X111-lock || test -S /tmp/.X11-unix/X111
# false (display cleared)
```

There are no retained PIDs, display, ports, package view, stop command, or Safari/Chrome URL for owner inspection because no accepted runtime exists.
