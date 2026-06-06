# Inventory — staff routes & role matrix

**Дата снимка:** 2026-06-06 (обновлено волна 2 §A) · Patient PWA — **read-only** reference (кроме `patient/layout.tsx` role-block).

## Staff route tree

| Префикс | Layout CSS | Shell | Guard |
|---------|------------|-------|-------|
| `/app/doctor/**` | `doctor.css` (+ наследует `patient.css` с `/app/layout`) | `DoctorWorkspaceShell` + page `DoctorAppShell` | `requireDoctorAccess()` |
| `/app/settings/**` | `doctor.css` | `DoctorWorkspaceShell` | session; `client` → patient hub + toast |
| `/app/admin/**` | `doctor.css` + `patient.css` (наслед.) | `DoctorWorkspaceShell` | `admin` only, иначе doctor hub + toast |

**`doctor.css`:** готов с 2026-06-04 (UI split). Подключён в `doctor`, `settings`, **`admin`** layouts (волна 1, 2026-06-06).

## Patient zone (baseline PWA — не менять)

| Префикс | PWA gate | Guard |
|---------|----------|-------|
| `/app/patient/**` | `PwaAppAccessGate` в `PatientClientLayout` | session + role-block + `patientClientBusinessGate` |
| `/app`, `/app/tg`, `/app/max` | нет gate | `AppEntryRsc` → auth или login shell |

**Волна 2 §A:** в `patient/layout.tsx` только role-block — staff → doctor hub + `app_access_denied` query. `PatientClientLayout`, gate, manifest, SW — **без изменений**.

## Cross-zone × role × redirect (волна 2 §A)

Источник редиректа с toast: `buildOwnHubUrlWithAccessDeniedToast` (`shared/lib/appAccessDeniedToast.ts`).  
Потребитель toast: `AppAccessDeniedToastEffect` в `PatientAppShell`, `DoctorWorkspaceShell`.

| Кто | Куда лезет | Итог (server) | UX (client) |
|-----|------------|---------------|-------------|
| `client` | `/app/doctor/**` | `/app/patient?app_access_denied=1` | toast на patient hub |
| `client` | `/app/settings/**` | `/app/patient?app_access_denied=1` | toast |
| `doctor` / `admin` | `/app/patient/**` | `/app/doctor?app_access_denied=1` | toast на doctor hub |
| `doctor` (не admin) | `/app/admin/**` | `/app/doctor?app_access_denied=1` | toast |
| Entry `/app`, `/app/tg`, `/app/max` (сессия) | — | `getPostAuthRedirectTarget` — **без** toast query | обычный вход в свой hub |

### Точки enforcement

| Механизм | Файл | Роль |
|----------|------|------|
| `requireDoctorAccess` | `requireRole.ts` | client → patient hub + query |
| `requirePatientAccess` | `requireRole.ts` | staff → doctor hub + query |
| `getOptionalPatientSession` | `requireRole.ts` | staff → doctor hub + query |
| Role-block layout | `patient/layout.tsx` | staff → doctor hub + query |
| Settings layout | `settings/layout.tsx` | client → patient hub + query |
| Admin layout | `admin/layout.tsx` | non-admin → doctor hub + query |

Entry staff (`doctor`/`admin` → `/app/doctor`, `client` → safe `next` или `/app/patient`) — **`redirectPolicy.ts`**, без изменений в волне 2 §A.

### Исключения (patient paths)

| Сценарий | Поведение |
|----------|-----------|
| `/app/patient/bind-phone` | Только client onboarding; `isSafeNext` **не** принимает bind-phone в post-auth `next`; staff на patient tree → doctor hub + toast |
| Patient maintenance (`patient_app_*` settings) | Только `patient/layout.tsx`; staff не проходят role-block |
| `/app/tg`, `/app/max` + сессия staff | `AppEntryRsc` → `/app/doctor` **без** toast |
| API `/api/doctor/**`, `/api/patient/**` | 401/403 JSON, без redirect/toast |

## API boundaries (staff)

- `GET/PATCH/POST /api/doctor/**` — `canAccessDoctor` (doctor | admin).
- Client на doctor API — 401/403; spot: `POST /api/doctor/clients` — `route.test.ts`.

## PWA / push (контекст)

- **Patient** manifest: `scope: /app`, `start_url: /app/patient` — без изменений волны 2 §A.
- **Staff** install/manifest — волна 2 §B ([`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md) §B).
- SW `scope: /app` — общий origin; patient push endpoints не трогаем.

## Тесты (волна 1 + 2 §A)

| Файл | Покрытие |
|------|----------|
| `redirectPolicy.test.ts` | staff entry redirects (без toast) |
| `appAccessDeniedToast.test.ts` | helper + query strip |
| `AppAccessDeniedToastEffect.test.tsx` | client toast + replace |
| `requireRole.doctorStaffAccess.test.ts` | requireDoctor/PatientAccess, getOptionalPatientSession |
| `e2e/doctor-patient-role-layout-redirects.test.ts` | settings, admin, patient layouts |
| `api/doctor/clients/route.test.ts` | client → 403 |
| `PatientAppShell.test.tsx` | shell (mock toast effect) |

**Команда (32 tests):** см. [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md) §Проверки.

## Риски (остаток)

| Риск | Статус |
|------|--------|
| ~~Admin без `doctor.css`~~ | **Закрыто** волна 1 |
| ~~Немой cross-zone redirect~~ | **Закрыто** волна 2 §A (toast) |
| `patient.css` на всех `/app/**` включая doctor | Документировано; route-group split — backlog |
| Login shell = `PatientAppShell` на `/app` | Документировано; не менять patient chrome |
| Staff install vs patient PWA на одном origin | Волна 2 §B — в работе / planned |
