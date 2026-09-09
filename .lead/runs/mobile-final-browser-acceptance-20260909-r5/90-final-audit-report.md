# #915 final browser/PWA acceptance r5

Date: 2026-09-09. Exact committed candidate: `f87fac14fe5d1d371e78c52d2e0ca9307fe8eb64`.

This was one live, isolated browser/PWA view. Product code, tests, plan, taskdb and audit queue were read-only. No upload was completed, no data was created, and no migration, named TEST DB, shared port, provider or PROD resource was used.

## Result

| M7-03 point | Result | Observable evidence |
| --- | --- | --- |
| TherapyGo TEST APK | **PASS** | Fresh Linux build under the host lock. `aapt dump badging` for `app-therapygo-environmentTest-debug.apk` reported `ru.therapygo.app.test`, label `TherapyGo`, and `mipmap-anydpi-v26/ic_launcher.xml` for all reported densities. |
| Therapysto TEST APK | **PASS** | The same fresh locked build. `aapt dump badging` for `app-therapysto-environmentTest-debug.apk` reported `ru.therapysto.app.test`, label `Therapysto`, and the packaged launcher icon resources. |
| TherapyGo/Therapysto PWA metadata, distinct manifests/icons, platform-admin exclusion | **PASS (reused)** | `git diff --name-status 5ef73730666d53aa32e14f9af38fbb304fe9c43d..f87fac14fe5d1d371e78c52d2e0ca9307fe8eb64 -- apps/webapp/src/shared/lib/pwa apps/webapp/src/shared/lib/surface apps/webapp/src/config/productSurfaceNames.ts apps/webapp/src/app/app/patient/install apps/webapp/src/app/app/doctor/install apps/webapp/public` returned only the deleted test `apps/webapp/src/app/app/patient/install/page.ui.test.tsx`; no relevant production path changed. Therefore the fresh r3 observation for exact candidate `5ef73730666d53aa32e14f9af38fbb304fe9c43d` is reused. |
| Platform-admin PWA exclusion | **PASS (reused)** | Covered by the same r3 live metadata pass and unchanged-production-path diff above. |
| Branded patient M1-04 | **BLOCKED** | No published branded patient host/data was created. The accepted named-DEV evidence recorded in `MASTER_PLAN.md` M1-04 is `count(*) = 0` for both `org_custom_domain_bindings` and `clinic_public_directory_entries`; r3 recorded the same blocker. The relevant M1 production paths remain unchanged by the diff above, so this accepted absence evidence is reused rather than inventing data. |
| Patient ordinary passwordless login | **PASS** | On isolated `patient.localhost:5210`, the visible email-code form sent an OTP, and the freshly emitted code from that server's private log completed the ordinary OTP form to `/app/patient`. No password route was used. `typeof window.Capacitor` was `undefined`. The code, log and browser profile were erased during cleanup. |
| Patient camera/gallery/document browser fallback | **PARTIAL / instrumentation blocker** | The real patient program-item page was reached after OTP login. It rendered three source inputs: camera and gallery `accept="image/*,video/*"`, and files `accept="image/*,video/*,.heic,.heif"`. Visible `Прикрепить видео` opened `Добавить фото или видео`; its visible `Записать`, `Галерея`, and `Файлы` actions were invoked without selecting a file. With `window.Capacitor` absent, the browser input route was selected. Headless Chromium's intercepted-file-dialog instrumentation emitted no `Page.fileChooserOpened` event for any of the three actions, so actual native chooser/cancel UI cannot be claimed from this environment. No product finding follows. |
| Doctor CMS browser fallback | **PARTIAL / instrumentation blocker** | Ordinary staff email/password login reached `/app/doctor/content/library` in a separate profile. It showed visible `Снять фото/видео` and `Выбрать из файлов` plus standard inputs (capture `image/*,video/*`; file accept list including image/video/audio and documents). Both actions were invoked without a selected file; `window.Capacitor` was `undefined`. The same headless Chromium limitation produced no chooser event. |
| File-source coverage | **PASS for final-state inspection** | `rg -n 'type="file"|capture=|accept=' apps/webapp/src/app/app/patient apps/webapp/src/app/app/doctor --glob '*.tsx'` listed the patient program source inputs, CMS library inputs, patient-file actions and the remaining existing doctor input paths. The live reachable patient/CMS surfaces above used the browser branch; no source or product behavior was changed. |
| Browser Jitsi core | **PASS** | Normal doctor flow opened the real patient live route. Before explicit `Начать звонок`, iframe count was `0`; after the visible button, synthetic-media Chromium mounted exactly one iframe at `meet.test.therapysto.ru`. `window.Capacitor` was `undefined`. The desktop repeat at 1440x900 again had exactly one iframe at that host and no floating-call controls. |
| Mobile continuity, return indicator, second-start refusal | **BLOCKED by headless interaction boundary** | At 390x844 the live route and exactly one iframe were observable. The visible internal `Карта` tab could not be made to advance the route through headless CDP after the cross-origin iframe mounted; a full-document `Page.navigate` to the card is not an equivalent internal Next navigation and cleared in-memory call state, so it is not treated as product evidence or a finding. Thus the same-call continuation, exact return indicator and ordinary second-start refusal cannot be claimed in this pass. r3 cannot be reused because `apps/webapp/src/shared/ui/video/VideoMeetingStage.tsx` changed after r3. |
| External-script first failure/retry | **BLOCKED by instrumentation** | A clean staff profile was used and `Fetch` interception for `*external_api.js*` was armed before the visible start action. The ad-hoc CDP client failed with an oversized/protocol frame (`MemoryError`) before it could reliably observe a `Fetch.requestPaused` event; a forced failure/retry was therefore not manufactured or claimed. |
| Jitsi terminal/end | **BLOCKED by cross-origin/headless instrumentation** | No ordinary Jitsi terminal callback was observed. The cross-origin conference UI was not driven through a direct SDK/reflection bypass, and no conclusion about terminal behavior is claimed. |

The blockers are environment/instrumentation limits or the explicitly absent branded DEV host. They are not reachable product findings. M7-03 remains open.

## Reuse decision

`git diff --name-status 11d22d0fa..HEAD -- apps/webapp apps/mobile-shell pnpm-lock.yaml package.json pnpm-workspace.yaml` showed changes to mobile-shell native sources and `VideoMeetingStage.tsx`. Consequently APK and browser Jitsi evidence were rebuilt/re-run; no r3 APK or Jitsi claim was reused. The narrower PWA production-path diff above proved only the metadata/install evidence reusable.

## Commands and isolated runtime

```bash
bash /home/dev/brain/host-orch/run-tests.sh \
  "cd /home/dev/dev-projects/bcb-wt-mobile-final-browser-acceptance-20260909-r5 && \
  source /home/dev/.local/share/bcb-android/env.sh && pnpm install --frozen-lockfile && \
  pnpm --dir packages/operator-db-schema run build && \
  pnpm --dir packages/db-principal run build && \
  pnpm --dir packages/shared-contracts run build && \
  pnpm --dir packages/error-tracking run build && \
  pnpm --dir packages/platform-merge run build && \
  pnpm --dir apps/mobile-shell run sync && pnpm --dir apps/mobile-shell run assemble:debug"
source /home/dev/.local/share/bcb-android/env.sh
"$ANDROID_HOME/build-tools/36.0.0/aapt" dump badging <each TEST APK>
cd apps/webapp && DEV_EMAIL_OTP_DEBUG=true \
  APP_BASE_URL=http://staff.localhost:5210 PATIENT_APP_ORIGIN=http://patient.localhost:5210 \
  npx --no-install next dev -H 127.0.0.1 -p 5210
```

The browser used a separate clean profile per patient/staff role, synthetic media, and normal visible forms/buttons; it did not invoke product functions, native plugins, custom SDK methods, upload completion or provider delivery. Private local OTP/log data was never printed or committed.

## Cleanup

Stopped the owned Chromium and Next processes; verified no listener remained on `5210`, `9223`, or `9224`; removed the temporary profiles, private server/browser logs, cookies, temporary env symlinks and generated APK outputs. Shared ports `5200`, `4200`, `6200`, and `3200`, named TEST DB and PROD were untouched.

`git diff --check` is run before commit.

убито 0 / непойманных 0
