# DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE — кабинет врача отдельно от пациентской PWA

**Статус:** **done** — волна 1 (2026-06-06) · волна 2 (2026-06-07): §A access+toast · §B Staff PWA · **staff push** (post-§B)  
**Дата старта:** 2026-06-06

## Главное ограничение

**Patient PWA не трогаем.**

Замороженный baseline patient PWA — см. [`SCOPE_BOUNDARIES.md`](SCOPE_BOUNDARIES.md).

**Исключения волны 2 §A:** `patient/layout.tsx` (role-block), `PatientAppShell` (toast), `LandingPwaClientBootstrap` (toast из `next=`).

**Исключения волны 2 §B:** staff manifest/install/metadata/SW-bootstrap — см. `SCOPE_BOUNDARIES` §B; patient `manifest.ts`, gate, push **не меняли**.

Staff runtime: `/app/doctor/**`, `/app/settings/**`, `/app/admin/**`, guards, doctor shell/CSS, API `doctor/*`, staff PWA install `/app/doctor/install`.

## Цели (выполнены)

| Волна | Цель |
|-------|------|
| **1** | Кабинет специалиста — самостоятельный runtime в браузере (guards, CSS, redirects) |
| **2 §A** | Cross-zone block + toast на своём hub (без forbidden-экранов) |
| **2 §B** | Staff PWA: manifest, иконки BersonAdmin, install, SW register |
| **post-§B** | Staff web push + матрица каналов уведомлений (`/app/settings`, `/api/doctor/web-push/*`) |

UI/CSS split закрыт ранее: [`PATIENT_DOCTOR_UI_SPLIT`](../archive/2026-06-initiatives/PATIENT_DOCTOR_UI_SPLIT_INITIATIVE/README.md).

## Документы

1. [`ROADMAP.md`](ROADMAP.md) — обе волны, индекс.
2. [`ACCEPTANCE_WAVE1.md`](ACCEPTANCE_WAVE1.md) — приёмка волны 1.
3. [`ACCEPTANCE_WAVE2.md`](ACCEPTANCE_WAVE2.md) — приёмка волны 2 (§A + §B).
4. [`STAFF_PWA_ADR.md`](STAFF_PWA_ADR.md) — ADR staff manifest/install (2.B0).
5. [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md) — план и DoD волны 2.
6. [`SCOPE_BOUNDARIES.md`](SCOPE_BOUNDARIES.md) — patient frozen.
7. [`INVENTORY_AND_MATRIX.md`](INVENTORY_AND_MATRIX.md) — маршруты, матрица ролей, PWA.
8. [`LOG.md`](LOG.md) — журнал.

## Вне scope инициативы

- Любые изменения patient PWA (кроме задокументированных исключений §A);
- guest/mass mode, Product Platform, монетизация, CRM;
- визуальный редизайн doctor UI;
- offline cache staff, subdomain deploy — backlog;
- patient Web Push hardening — [`PWA_INITIATIVE`](../PWA_INITIATIVE/README.md).

## Код

| Область | Файлы |
|---------|--------|
| Doctor layout + CSS | `doctor/layout.tsx`, `styles/doctor.css` |
| Settings / admin | `settings/layout.tsx`, `admin/layout.tsx` |
| Guards §A | `requireRole.ts` |
| Toast §A | `appAccessDeniedToast.ts`, `AppAccessDeniedToastEffect.tsx`; shells + `LandingPwaClientBootstrap` |
| Staff PWA §B | `staffPwaManifest.ts`, `staffPwaLayoutMetadata.ts`, `staffPwaInstallState.ts`, `manifest-staff.webmanifest/route.ts`, `doctor/install/page.tsx`, `StaffPwaBootstrap`, `StaffPwaInstallSection`, `public/staff-pwa-icon-*` |
| Staff push | `modules/doctor-notifications/`, `api/doctor/web-push/*`, `DoctorNotificationChannelsSection`, `StaffWebPushBootstrap`, `staffWebPushApi.ts` |
| Навигация install | `routePaths.doctorInstall`, `DoctorAdminSidebar`, `DoctorHeader` Sheet |
| Тесты | **63** fast (49 §A+§B + 14 staff push) — [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md) §Проверки |
