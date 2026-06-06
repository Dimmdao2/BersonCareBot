# DOCTOR_PATIENT_PWA_SPLIT_INITIATIVE — кабинет врача отдельно от пациентской PWA

**Статус:** волна 1 **done** (2026-06-06) · волна 2 Staff PWA — `planned`
**Дата старта:** 2026-06-06
**Приоритет:** ближайшая рабочая волна (вместо Product Platform)

## Главное ограничение

**Patient PWA не трогаем.**

Замороженный baseline (без правок в этой инициативе):

- `/app/patient/**` — layout, guards, `PwaAppAccessGate`, `PatientAppShell`, patient push, manifest `start_url`, SW scope;
- `apps/webapp/src/shared/lib/pwa/pwaAppAccessPolicy.ts`, `PatientClientLayout`, patient notifications UI;
- лендинг установки `/`, patient-only cron/SW-поведение.

Работаем **только** на стороне staff: `/app/doctor/**`, `/app/settings/**`, `/app/admin/**`, entry-редиректы для ролей `doctor`/`admin`, doctor shell/CSS, API `doctor/*`.

## Цель волны 1

Кабинет специалиста — самостоятельный runtime-контур в браузере: свои layout/guards/CSS, предсказуемый вход после auth, client не попадает в doctor shell. Пациентский PWA остаётся как есть.

UI/CSS split уже закрыт: [`PATIENT_DOCTOR_UI_SPLIT`](../archive/2026-06-initiatives/PATIENT_DOCTOR_UI_SPLIT_INITIATIVE/README.md).

## Две волны

| Волна | Содержание |
|-------|------------|
| **1** | Runtime в браузере: guards, CSS, redirects |
| **2** | Блок чужих зон + **Staff PWA** (BersonAdmin) — [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md) |

Patient PWA (`manifest`, install `/`, gate) — **не в волне 1 и не переписываем**; staff PWA добавляется в **волне 2**.

## Документы

1. [`ROADMAP.md`](ROADMAP.md) — обе волны, индекс.
2. [`ACCEPTANCE_WAVE1.md`](ACCEPTANCE_WAVE1.md) — приёмка волны 1.
3. [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md) — Staff PWA (следующая волна).
4. [`SCOPE_BOUNDARIES.md`](SCOPE_BOUNDARIES.md) — patient frozen.
5. [`INVENTORY_AND_MATRIX.md`](INVENTORY_AND_MATRIX.md) — аудит staff routes.
6. [`LOG.md`](LOG.md) — журнал.

## Вне scope

- Любые изменения patient PWA (см. выше);
- guest/mass mode, Product Platform;
- монетизация, курсы, CRM;
- staff manifest/install — только [волна 2](WAVE2_STAFF_PWA.md), не волна 1;
- визуальный редизайн doctor UI;
- patient Web Push hardening — остаётся в [`PWA_INITIATIVE`](../PWA_INITIATIVE/README.md), не здесь.

## Код (только staff-зона)

| Область | Файлы |
|---------|--------|
| Doctor layout + CSS | `apps/webapp/src/app/app/doctor/layout.tsx`, `styles/doctor.css` |
| Settings / admin | `apps/webapp/src/app/app/settings/layout.tsx`, `admin/layout.tsx` |
| Guards | `requireDoctorAccess`, `canAccessDoctor` в `app-layer/guards/requireRole.ts` |
| Post-auth (read-only audit) | `modules/auth/redirectPolicy.ts`, `AppEntryRsc.tsx` — менять только если нужно для **staff** redirect, без side-effect на patient |
| Shell | `DoctorWorkspaceShell`, `DoctorAppShell` (`#app-shell-doctor`) |
| Тесты волны 1 | `requireRole.doctorStaffAccess.test.ts`, `e2e/doctor-patient-role-layout-redirects.test.ts`, `api/doctor/clients/route.test.ts` |
