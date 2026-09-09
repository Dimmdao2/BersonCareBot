# Ops worker — recover a browser-visible Android emulator with a fresh API 34 guest (#915 M7-04)

## Authority and why this is a new strategy

- Work only in `/home/dev/dev-projects/bcb-wt-mobile-emulator-api34-viewer-20260910` on `wt/mobile-emulator-api34-viewer-20260910`. This is a second bounded DEV-host runtime strategy after the committed report `053d873f1`; do not repeat its two failed API 35 AVD boots.
- Before every action obey the `AGENTS.md` heading-map gate. Read in full the global decision method, §1/§1a/§1b, §7, §9–§10b and §24; read `docs/ORCHESTRATION_BINDINGS.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `deploy/HOST_DEPLOY_README.md`, `apps/mobile-shell/README.md`, `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M2-00/M2-00a/M7-04/§6, and `/home/dev/dev-projects/bcb-wt-mobile-emulator-browser-view-20260910/.lead/runs/mobile-emulator-browser-view-20260910/90-report.md`.
- Source oracle: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` states «строка остаётся открытой до пригодного emulator runtime».
- The prior run already proved the existing API 35 AVDs do not currently reach adb/boot and cleaned its attempts. It also rebuilt both current TEST debug APKs. The materially different strategy here is a fresh, run-owned stable API 34 Google APIs x86_64 system image and AVD, not another retry of the corrupted/unusable API 35 state.

## Exact objective

Install the official API 34 Google APIs x86_64 image under the already owner-authorized `/home/dev/.local/share/bcb-android` prefix if absent, create one fresh run-owned AVD named `bcb-viewer-api34`, boot it graphically with KVM under a fresh Xvfb display, install and visibly launch both current TEST APKs, and expose the accepted display through noVNC bound only to the existing Amnezia `awg0` address.

## Required path and acceptance

1. Prove this is DEV/RELAY/TEST host, not PROD; re-measure `awg0`, free disk, KVM access through `sg kvm`, current emulator/platform tools and absence of running emulator/VNC processes. Do not modify group permissions, firewall, DNS, nginx, TLS, systemd, cron or shell startup files.
2. Use only the official installed Android CLI to install `system-images;android-34;google_apis;x86_64` if needed. Create only `bcb-viewer-api34` with a modest existing device profile (Pixel 2-class), 2–4 cores and 2–4 GiB RAM. Existing AVDs are read-only; do not wipe/delete/repair them.
3. Start one new Xvfb with TCP disabled and cold-boot the fresh AVD graphically (no `-no-window`) through `sg kvm`. Use an unoccupied exact display and console/adb pair. Prefer the most conservative software renderer supported by the installed emulator. Wait boundedly up to five minutes for `adb device` and `sys.boot_completed=1`, retaining concise emulator/adb/logcat evidence if it fails.
4. If the first renderer fails before adb/boot, stop only exact owned PIDs, preserve the diagnostic reason, wipe only the run-owned new AVD data, and make one second boot with a materially different supported renderer. No third attempt and no API 35 retry.
5. On a stable boot, install the two exact TEST debug APKs built from the current integrated mobile source (rebuild under the host lock only if absent/stale), launch TherapyGo then Therapysto through ordinary launcher intents, and visually prove correct patient/staff surface without a System UI ANR. Do not enter credentials, invoke Capacitor plugins/activities directly, send provider traffic, or mutate DEV/TEST data.
6. Expose Xvfb through `x11vnc` bound only to loopback; expose `/usr/share/novnc` through `websockify` bound only to the exact `awg0` address. Never bind to `0.0.0.0` or a public interface. The existing VPN is the access boundary, so a loopback-only passwordless VNC backend is allowed. Verify exact sockets and the HTTP/noVNC page, then report the exact Safari/Chrome URL with autoconnect and scale resize.
7. Leave only the accepted AVD, Xvfb, x11vnc and websockify running for owner inspection. Record exact PIDs, AVD, display, ports, package currently visible, URL, stop commands and one screenshot under `.lead/runs/mobile-emulator-api34-viewer-20260910/90-report.md`. If both boots fail, leave no process/listener and report the exact failure honestly.

## Scope, tests and delivery

- Product code, tests, plans, taskdb, env files, databases, shared Next `:5200`, integrator `:4200`, TEST services and PROD are out of scope. No test files: this is one-time graphical/runtime evidence and UI automation tests are forbidden by `AGENTS.md` §10a.
- Do not clean Gradle/SDK caches or unrelated processes. The newly installed API 34 image and run-owned AVD may remain if successful; on failure retain the image/AVD for lead diagnosis unless it is demonstrably corrupt, but stop processes/listeners.
- Commit only `.lead/runs/mobile-emulator-api34-viewer-20260910/**` with explicit paths; never `git add -A`. Do not push or land. Finish with SHA and exact runtime verdict.
