# Ops brief — Android toolchain for #915

This is a bounded DEV-host setup pass for `M2-00` and `M2-00a`, not product implementation. The owner explicitly
authorized completing the mobile initiative on this development server. Do not touch TEST or PROD, do not read
secrets, and do not modify repository files.

## Mandatory rules and authority

1. Run `grep -n "^## \|^### " AGENTS.md`, then read in full the global decision method, §1/§1b server and DEV
   safety, §9–§10 validation, §12 plan evidence, and §24 orchestration.
2. Read `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`,
   `deploy/HOST_DEPLOY_README.md`, and the active `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`
   sections M2-00/M2-00a/§6a G-1.
3. Prove this is the documented DEV host and abort if the target is or could be PROD `135.106.162.170`.

## Task

Install a reproducible Android build and emulator toolchain for the shared Capacitor 8 shell under the explicit
user-owned prefix `/home/dev/.local/share/bcb-android`:

- a full JDK 21 containing `javac` (reuse the system JDK only if it actually contains the compiler);
- the current official Android command-line tools;
- platform-tools, Android platform/compile SDK 36, matching build-tools, emulator, and one x86_64 Google APIs
  system image suitable for API 36;
- one non-running AVD named `bcb-api36`;
- `/home/dev/.local/share/bcb-android/env.sh` exporting explicit `JAVA_HOME`, `ANDROID_HOME`,
  `ANDROID_SDK_ROOT` and PATH. Do not edit shell startup files.

Use only primary vendor download metadata. Verify downloads with the vendor-published checksum when available.
Accept Android SDK licenses non-interactively. If the `kvm` group exists and passwordless DEV sudo is available,
add user `dev` to it; never weaken `/dev/kvm` permissions. Record that a new login/`sg kvm` is required. If sudo
is unavailable, finish the non-privileged setup and report only that exact remaining blocker.

Do not delete unrelated SDKs/caches or clean disk. Before and after, measure `/` free space with the exact command.
Do not start an emulator in this pass. Do not run commands in the background. Do not expose proxy credentials,
tokens, or full environment dumps.

## Acceptance and report

Run and wait for all of:

- `javac -version` using the persisted env;
- `sdkmanager --list_installed` and report installed package IDs/versions;
- `adb --version`, `emulator -version`, and `avdmanager list avd`;
- `id dev` and `ls -l /dev/kvm` without changing broad permissions;
- exact before/after `df -B1 /` figures and calculated bytes consumed.

This ops pass has no git commit because repository files are forbidden. Leave no installer/archive outside the
explicit prefix except normal temporary files, and remove only temporary files created by this run.
