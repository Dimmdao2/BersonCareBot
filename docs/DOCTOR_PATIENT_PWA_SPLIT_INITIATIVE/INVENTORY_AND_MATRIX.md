# Inventory — staff routes & role matrix

**Дата снимка:** 2026-06-07 (волны 1–2 **done**) · Patient PWA — **read-only** (исключения §A/§B в [`SCOPE_BOUNDARIES.md`](SCOPE_BOUNDARIES.md)).

## Staff route tree

| Префикс | Layout CSS | Shell | Guard | Staff manifest metadata |
|---------|------------|-------|-------|-------------------------|
| `/app/doctor/**` | `doctor.css` (+ `patient.css` с `/app/layout`) | `DoctorWorkspaceShell` + `DoctorAppShell` | `requireDoctorAccess()` | `staffPwaLayoutMetadata` |
| `/app/settings/**` | `doctor.css` | `DoctorWorkspaceShell` | session; `client` → patient hub + toast | `staffPwaLayoutMetadata` |
| `/app/admin/**` | `doctor.css` + `patient.css` (наслед.) | `DoctorWorkspaceShell` | `admin` only, иначе doctor hub + toast | `staffPwaLayoutMetadata` |
| `/app/doctor/install` | то же | то же | `requireDoctorAccess()` (layout) | то же |

**`doctor.css`:** готов с 2026-06-04 (UI split). Подключён в `doctor`, `settings`, **`admin`** layouts (волна 1).

## Staff PWA (волна 2 §B)

| Элемент | Значение |
|---------|----------|
| Manifest URL | `/manifest-staff.webmanifest` |
| `id` / `start_url` | `/app-staff` / `/app/doctor` |
| `scope` | `/app` |
| Install page | `/app/doctor/install` |
| Иконки | `public/staff-pwa-icon-192/512.png`, `staff-pwa-apple-touch.png` |
| SW | `public/sw.js`, register в `StaffPwaBootstrap`, scope `/app` |
| Навигация | sidebar + mobile Sheet → «Установить приложение» |
| Install «готово» | `staffPwaInstallState` (marker), не patient `standalone` |

Канон кода: `staffPwaManifest.ts`, `staffPwaLayoutMetadata.ts`, `staffPwaInstallState.ts`, `StaffPwaInstallSection.tsx`, `StaffPwaBootstrap.tsx`.

## Patient zone (baseline PWA — не менять)

| Префикс | PWA gate | Guard |
|---------|----------|-------|
| `/app/patient/**` | `PwaAppAccessGate` в `PatientClientLayout` | session + role-block + `patientClientBusinessGate` |
| `/app`, `/app/tg`, `/app/max` | нет gate | `AppEntryRsc` → auth или login shell |

**Волна 2 §A:** в `patient/layout.tsx` только role-block — staff → doctor hub + `app_access_denied` query. Gate, manifest, SW — **без изменений**.

## Cross-zone × role × redirect (волна 2 §A)

Источник: `buildOwnHubUrlWithAccessDeniedToast` · Toast: `AppAccessDeniedToastEffect` в shells.

| Кто | Куда лезет | Итог (server) | UX (client) |
|-----|------------|---------------|-------------|
| `client` | `/app/doctor/**` | `/app/patient?app_access_denied=1` | toast на patient hub |
| `client` | `/app/settings/**` | `/app/patient?app_access_denied=1` | toast |
| `doctor` / `admin` | `/app/patient/**` | `/app/doctor?app_access_denied=1` | toast на doctor hub |
| `doctor` (не admin) | `/app/admin/**` | `/app/doctor?app_access_denied=1` | toast |
| Entry `/app`, `/app/tg`, `/app/max` (сессия) | — | `getPostAuthRedirectTarget` — **без** toast query | обычный вход в свой hub |

### Точки enforcement

| Механизм | Файл |
|----------|------|
| `requireDoctorAccess` | `requireRole.ts` |
| `requirePatientAccess`, `getOptionalPatientSession` | `requireRole.ts` |
| Role-block layout | `patient/layout.tsx` |
| Settings / admin layout | `settings/layout.tsx`, `admin/layout.tsx` |
| Toast hub | `PatientAppShell`, `DoctorWorkspaceShell` |
| Toast install `next` | `LandingPwaClientBootstrap` |

Entry staff — **`redirectPolicy.ts`**, без изменений в волне 2 §A.

### Исключения (patient paths)

| Сценарий | Поведение |
|----------|-----------|
| `/app/patient/bind-phone` | client onboarding; staff на patient tree → doctor hub + toast |
| Patient maintenance (`patient_app_*`) | только `patient/layout.tsx` |
| `/app/tg`, `/app/max` + сессия staff | `/app/doctor` **без** toast |
| API cross-role | 401/403 JSON |

## API boundaries (staff)

- `GET/PATCH/POST /api/doctor/**` — `canAccessDoctor` (doctor | admin).
- Spot: `POST /api/doctor/clients` — client → 403 (`route.test.ts`).

## PWA / push (два контура на одном origin)

| | Patient PWA | Staff PWA |
|--|-------------|-----------|
| Manifest | `manifest.ts` → `/app/patient` | `/manifest-staff.webmanifest` → `/app/doctor` |
| `id` | `/app` | `/app-staff` |
| Install | `/`, `/app/patient/install` | `/app/doctor/install` |
| Иконки | `pwa-icon-*` | `staff-pwa-icon-*` |
| SW | `public/sw.js`, scope `/app` | тот же SW |
| Push API | `/api/patient/web-push/*` | `/api/doctor/web-push/*` |
| Push UI | `/app/patient/notifications` | `/app/settings` (матрица 2 тем) |
| Push bootstrap | patient context | `StaffWebPushBootstrap` + `StaffPwaPushOptIn` |
| Темы | patient profile topics | `doctor_specialist_task_reminders`, `doctor_patient_messages`, `doctor_patient_program_notes` |
| Дефолт каналов (staff, patient comms) | **`web_push` → telegram → max** | `defaultDoctorTopicFallbackChannels` — см. [`NOTIFICATION_CHANNELS.md`](../ARCHITECTURE/NOTIFICATION_CHANNELS.md) |

Канон staff push: `modules/doctor-notifications/`, `staffWebPushApi.ts`, `subscribeStaffWebPush.ts`, `DoctorNotificationChannelsSection.tsx`.

## Тесты

### §A (38)

| Файл | Покрытие |
|------|----------|
| `redirectPolicy.test.ts` | staff entry (без toast) |
| `appAccessDeniedToast.test.ts` | helper |
| `AppAccessDeniedToastEffect.test.tsx` | toast + strip |
| `requireRole.doctorStaffAccess.test.ts` | guards |
| `e2e/doctor-patient-role-layout-redirects.test.ts` | layouts |
| `api/doctor/clients/route.test.ts` | client → 403 |
| `pwaAppAccessPolicy.test.ts` | gate + `next` |

### §B (11 fast + smoke inprocess)

| Файл | Покрытие |
|------|----------|
| `staffPwaManifest.test.ts` | manifest канон |
| `staffPwaInstallState.test.ts` | install marker |
| `manifest-staff.webmanifest/route.test.ts` | GET route |
| `StaffPwaInstallSection.test.tsx` | UI без false positive |
| `e2e/doctor-staff-pwa-install.test.ts` | layouts metadata |
| `smoke-app-router-rsc-pages-inprocess.test.ts` | `doctor/install` page |

### §C (14)

| Файл | Покрытие |
|------|----------|
| `doctor-notifications/*.test.ts` | resolve, defaults, patient message fan-out |
| `api/doctor/web-push/status/route.test.ts` | status route |
| `dispatchDueReminders.test.ts` | per-owner channel resolve |

**Команда:** [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md) §Проверки (**63** fast = 49 §A+§B + 14 §C).

## Риски (остаток)

| Риск | Статус |
|------|--------|
| ~~Admin без `doctor.css`~~ | Закрыто волна 1 |
| ~~Немой cross-zone redirect~~ | Закрыто волна 2 §A |
| ~~Staff install vs patient PWA~~ | Закрыто волна 2 §B |
| `patient.css` на всех `/app/**` | Backlog route-group split |
| Login shell = `PatientAppShell` на `/app` | Документировано |
| Ручной smoke staff install + push на стенде | Опционально оператору |
