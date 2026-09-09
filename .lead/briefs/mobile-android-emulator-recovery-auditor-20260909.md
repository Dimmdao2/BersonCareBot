# Тест или взгляд — #915 Android emulator recovery and ordinary-path continuation

## Authority and exact candidate

- Continue the live audit only in `/home/dev/dev-projects/bcb-wt-mobile-android-runtime-closure-audit-20260909`, exact product candidate `8dff11a6b` plus the prior audit artifact `cb795c760`. Product code and tests are read-only.
- Before every action follow the `AGENTS.md` heading-map gate. Fully read the relevant §1/§1a/§1b, §9–§10b and §24, `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M2-00/M2-00a/M7-04, `apps/mobile-shell/README.md`, and the prior report `.lead/runs/mobile-android-runtime-closure-20260909/90-final-audit-report.md`.
- This is a bounded host/runtime continuation. Do not reinterpret a `com.android.systemui` ANR as a product finding without evidence that the app causes it on a stable guest. Do not invoke Capacitor plugins, activities, Jitsi or notification callbacks directly as a substitute for the ordinary UI path.

## Classification and objective

- Emulator health and each UI observation are one-time **взгляд/runtime evidence**, not permanent automated tests.
- First obtain one cold KVM-backed Android guest whose launcher/System UI remains responsive before and after launching an ordinary third-party app and the candidate APK. Use at most two materially different recovery strategies (for example a clean/wiped AVD with a different stable system image/device/GPU combination, or repair of an owned retained AVD). Do not touch another agent's running emulator/ports.
- If a stable guest is obtained, continue the complete M7-04 ordinary-path checklist for both TEST APKs: trusted origin and external-link boundary; patient OTP and specialist password via normal UI; camera photo/video and grant/deny/retry; gallery/document cancel and selection; native Jitsi permissions, navigation/PiP/return/explicit end; substitute notification tap and denied notification permission. Never print OTP, credentials, tokens, patient data or message content.
- If two distinct recovery strategies still reproduce a System UI/platform failure before an ordinary app path is usable, stop and report the exact blocker with commands, timestamps, log evidence and cleanup. Do not burn a third strategy in this run.

## Safety and completion

- DEV/TEST rules apply; no PROD, deploy, DB mutation, real provider delivery, real RuStore/Universal Push credentials, env edits, system package upgrades or repository product/test edits.
- Temporary AVDs, sample media and processes are owned by this run and must be cleaned or explicitly named as retained. Do not delete shared SDK packages or other AVDs.
- Commit only the new audit artifact under `.lead/runs/mobile-android-emulator-recovery-20260909/**`; leave the tree clean. Report exact verdict per M7-04 line and clearly separate product evidence from emulator infrastructure evidence.
