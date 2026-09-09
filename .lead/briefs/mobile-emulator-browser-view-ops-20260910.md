# Ops worker — browser-visible Android emulator for #915 M7-04

## Authority and mandatory reading

- This is one bounded DEV-host/runtime workstream for the owner's explicit request to view the Android emulator in Safari/Chrome through the existing Amnezia VPN. It is not a product implementation and must not expand into RuStore, TEST deploy, PROD, firewall redesign, or a second Next server.
- Before every action follow the `AGENTS.md` heading-map gate. Read in full the global decision method, §1/§1a/§1b, §7, §9–§10b and §24; read `docs/ORCHESTRATION_BINDINGS.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `deploy/HOST_DEPLOY_README.md`, `apps/mobile-shell/README.md`, and `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M2-00/M2-00a/M7-04/§6.
- Source oracle: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` states: «строка остаётся открытой до пригодного emulator runtime». The owner additionally requires the viewer to be reachable only through the existing Amnezia VPN subnet and asks for the concrete browser address.

## Exact objective

Bring up one stable KVM-backed Android emulator with a graphical display and expose that display to the owner through noVNC over the existing `awg0` VPN address only.

Current measured facts from the lead, to verify rather than assume:

- Android env: `/home/dev/.local/share/bcb-android/env.sh`.
- AVDs include `bcb-api35`, `bcb-api36`, `m7-04-api35`, `m7-04-recovery2-api35-pixel2`.
- `Xvfb`, `x11vnc`, `websockify`, and `/usr/share/novnc` exist.
- `awg0` currently owns `10.9.0.1/24`.
- There is no running emulator/adb device. Two orphan Xvfb instances existed on displays `:107` and `:108`; remove only those exact processes after proving they have no emulator/VNC child and are not owned by another live run.
- Existing TEST debug APKs are under `apps/mobile-shell/android/app/build/outputs/apk/**`; rebuild only if the current integrated mobile source is newer or artifacts are missing, using the repository's documented Android commands and host test lock where required.

## Required implementation and acceptance

1. Select one existing API 35 AVD that previously booted, prefer a graphical Xvfb-backed cold boot over `-no-window`, and use one unoccupied owned display/console pair. Do not wipe or delete any AVD. Remove only stale lock files belonging to the selected AVD after proving no matching emulator process exists.
2. Start Xvfb with TCP disabled, start the emulator with KVM and its normal graphical window on that display, and wait boundedly for `adb device` plus `sys.boot_completed=1`. Do not finish the turn while a foreground verification command is still running.
3. Install both exact current TEST debug APKs and launch each through the ordinary launcher path. At minimum verify the correct TherapyGo patient and Therapysto staff surface becomes visible without a System UI ANR. Do not use a direct Capacitor bridge/plugin/activity invocation as a substitute for UI behavior; do not enter or print account credentials, OTPs, tokens, patient data, or provider data.
4. Expose the X display with `x11vnc` bound to loopback only and noVNC/websockify bound only to the exact current `awg0` address. The VPN is the access boundary; do not bind either service to `0.0.0.0`, a public interface, or localhost-only for the browser endpoint. Do not modify firewall, nginx, DNS, TLS, systemd or cron. A passwordless VNC backend is permitted only because it is loopback-only and the browser endpoint is bound exclusively to `awg0`; otherwise create a temporary credential without printing it.
5. Verify listening sockets and local HTTP/noVNC response, and derive the exact URL the owner can open while connected to Amnezia. Use an auto-connect and scale-resize query when supported. Capture one screenshot proving the visible app surface and store it under `.lead/runs/mobile-emulator-browser-view-20260910/`.
6. Leave only the single accepted emulator, Xvfb, x11vnc and websockify processes running for owner inspection. Record exact PIDs, ports, display, AVD, package/app shown, URL, and stop commands in `.lead/runs/mobile-emulator-browser-view-20260910/90-report.md`. Stop and clean any failed attempt before switching strategy. Never kill by broad pattern or delete broad directories.

## Scope and safety

- Repository product code, tests, plans, taskdb, DEV/TEST databases, env files, shared Next `:5200`, integrator `:4200`, TEST services and PROD are read-only/out of scope.
- No test files. This is one-time runtime evidence; permanent automated UI tests would violate `AGENTS.md` §10a. Do not clean SDK/Gradle caches or unrelated processes.
- If the first AVD fails before ordinary app UI is usable, one materially different existing API 35 AVD may be tried. After two failed strategies, stop with exact evidence; do not burn more configurations.
- Commit only `.lead/runs/mobile-emulator-browser-view-20260910/**` to `wt/mobile-emulator-browser-view-20260910`, with explicit paths (never `git add -A`), and leave the worktree clean. Do not push or land.

