---
name: Doctor patient PWA split wave 2
overview: "DOCTOR_PATIENT_PWA_SPLIT: волна 1 runtime + волна 2 §A access/toast, §B Staff PWA, §C staff web push. Patient PWA frozen. Инициатива closed 2026-06-07."
status: completed
completedAt: 2026-06-07
closeoutCommit: 290df2ba
ciBarrier: passed
ciVerifiedAt: 2026-06-07
canonicalPath: .cursor/plans/archive/doctor_patient_pwa_split_wave2.plan.md
todos:
  - id: w1-runtime
    content: "Волна 1: guards, doctor.css admin parity, cross-role tests"
    status: completed
  - id: w2a-access-toast
    content: "§A 2.A0–2.A5+: cross-zone block + react-hot-toast (hub + install next=)"
    status: completed
  - id: w2b-staff-pwa
    content: "§B 2.B0–2.B8: manifest-staff, install, icons, SW bootstrap, navigation, install marker"
    status: completed
  - id: w2c-staff-push
    content: "§C 2.C0–2.C4: /api/doctor/web-push, settings matrix, per-staff delivery, bootstrap + install opt-in"
    status: completed
  - id: docs-acceptance
    content: "Docs: WAVE2, ACCEPTANCE_WAVE2, INVENTORY, ROADMAP, STAFF_PWA_ADR, SCOPE_BOUNDARIES, api.md, INTEGRATOR_CONTRACT, PWA_INITIATIVE"
    status: completed
  - id: tests-ci
    content: "Vitest fast 63 + pnpm run ci green (commit 290df2ba)"
    status: completed
isProject: false
---

# DOCTOR_PATIENT_PWA_SPLIT — волны 1–2 (закрыто)

Канон инициативы: [`docs/DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/README.md`](../../docs/DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/README.md).

## Scope

- **In:** `/app/doctor`, `/app/settings`, `/app/admin`, guards, staff PWA, staff push, cross-zone toast.
- **Out:** patient `manifest.ts`, `PwaAppAccessGate`, patient push stack, subdomain deploy.

## Волна 1 (2026-06-06)

- `doctor.css` в `admin/layout.tsx`.
- Guards + redirects: client↔staff; тесты `requireRole`, layout redirects, `POST /api/doctor/clients` 403.

## Волна 2 §A (2026-06-06)

- `appAccessDeniedToast.ts`, `AppAccessDeniedToastEffect` в shells + `LandingPwaClientBootstrap`.
- Staff/patient layouts → hub + `?app_access_denied=1`; без forbidden-экранов.

## Волна 2 §B (2026-06-07)

- ADR [`STAFF_PWA_ADR.md`](../../docs/DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/STAFF_PWA_ADR.md).
- `/manifest-staff.webmanifest`, `/app/doctor/install`, `StaffPwaBootstrap`, `staffPwaInstallState`.

## Волна 2 §C — staff push (2026-06-07)

- API `/api/doctor/web-push/status|subscribe|unsubscribe`.
- Модуль `doctor-notifications`: темы, resolve каналов, per-staff fan-out.
- UI `/app/settings`: `DoctorNotificationChannelsSection`, `DoctorWebPushControls`.
- `StaffWebPushBootstrap`, `StaffPwaPushOptIn`; integrator `sync-user-message` → notify.

## Definition of Done

- [x] §A + §B + §C — [`ACCEPTANCE_WAVE2.md`](../../docs/DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/ACCEPTANCE_WAVE2.md).
- [x] Patient PWA frozen — без регрессии в diff.
- [x] Vitest fast **63** — [`WAVE2_STAFF_PWA.md`](../../docs/DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/WAVE2_STAFF_PWA.md) §Проверки.
- [x] `pnpm run ci` green · commit `290df2ba`.
- [ ] Ручной smoke install + push на стенде — опционально оператору.

## Проверки (копипаст)

```bash
pnpm --filter webapp exec vitest run \
  src/shared/lib/appAccessDeniedToast.test.ts \
  src/shared/ui/AppAccessDeniedToastEffect.test.tsx \
  src/app-layer/guards/requireRole.doctorStaffAccess.test.ts \
  e2e/doctor-patient-role-layout-redirects.test.ts \
  src/app/api/doctor/clients/route.test.ts \
  src/shared/lib/pwa/pwaAppAccessPolicy.test.ts \
  src/shared/lib/pwa/staffPwaManifest.test.ts \
  src/shared/lib/pwa/staffPwaInstallState.test.ts \
  src/app/manifest-staff.webmanifest/route.test.ts \
  src/shared/ui/doctor/pwa/StaffPwaInstallSection.test.tsx \
  e2e/doctor-staff-pwa-install.test.ts \
  src/modules/doctor-notifications \
  src/app/api/doctor/web-push \
  src/modules/specialist-tasks/dispatchDueReminders.test.ts
# 63 tests — green
```

Журнал: [`LOG.md`](../../docs/DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE/LOG.md).
