# Inventory — staff routes & role matrix

**Дата снимка:** 2026-06-06 · Patient PWA — **read-only** reference.

## Staff route tree

| Префикс | Layout CSS | Shell | Guard |
|---------|------------|-------|-------|
| `/app/doctor/**` | `doctor.css` (+ наследует `patient.css` с `/app/layout`) | `DoctorWorkspaceShell` + page `DoctorAppShell` | `requireDoctorAccess()` |
| `/app/settings/**` | `doctor.css` | `DoctorWorkspaceShell` | session; `client` → `/app/patient/profile` |
| `/app/admin/**` | `doctor.css` + `patient.css` (наслед.) | `DoctorWorkspaceShell` | `admin` only, иначе → `/app/settings` |

**`doctor.css`:** готов с 2026-06-04 (UI split). Подключён в `doctor`, `settings`, **`admin`** layouts (волна 1, 2026-06-06).

## Patient zone (baseline — не менять)

| Префикс | PWA gate | Guard |
|---------|----------|-------|
| `/app/patient/**` | `PwaAppAccessGate` в `PatientClientLayout` | session + `patientClientBusinessGate` |
| `/app`, `/app/tg`, `/app/max` | нет gate | `AppEntryRsc` → auth или login shell |

## Entry × role × redirect

Источник: `getPostAuthRedirectTarget` (`modules/auth/redirectPolicy.ts`).

| Entry | Роль | Итог |
|-------|------|------|
| `/app`, `/app/tg`, `/app/max` (сессия) | `doctor` / `admin` | `/app/doctor` (`next` игнорируется) |
| то же | `client` | safe `next` в `/app/patient/**` или `/app/patient` |
| `/app/patient/**` | `doctor` / `admin` | redirect → `/app/doctor` (`patient/layout.tsx`) |
| `/app/doctor/**` | `client` | redirect → `/app/patient` (`requireDoctorAccess`) |
| `/app/settings/**` | `client` | redirect → `/app/patient/profile` |
| `/app/admin/**` | не `admin` | redirect → `/app/settings` |

### Исключения (patient paths — не менялись в волне 1)

| Сценарий | Поведение |
|----------|-----------|
| `/app/patient/bind-phone` | Только client onboarding; `isSafeNext` **не** принимает bind-phone в post-auth `next`; doctor/admin на patient tree → `/app/doctor` |
| Patient maintenance (`patient_app_*` settings) | Только `patient/layout.tsx`; staff routes не затронуты |
| `/app/tg`, `/app/max` + сессия staff | `AppEntryRsc` → `getPostAuthRedirectTarget` → `/app/doctor` (см. `redirectPolicy.test.ts`) |

## API boundaries (staff)

- `GET/PATCH/POST /api/doctor/**` — `canAccessDoctor` (doctor | admin).
- Client на doctor API — 401/403; spot: `POST /api/doctor/clients` — `route.test.ts`.

## PWA / push (контекст, без правок patient)

- Manifest: `scope: /app`, `start_url: /app/patient` — staff **не** целевой install.
- SW `scope: /app` — общий origin; patient push endpoints не трогаем.
- Staff reminders могут использовать `user_web_push_subscriptions` того же user — вне scope волны 1.

## Тесты (есть / нет)

| Есть | Примечание |
|------|------------|
| `redirectPolicy.test.ts` | staff entry redirects |
| `requireRole.doctorStaffAccess.test.ts` | requireDoctorAccess / requirePatientAccess |
| `e2e/doctor-patient-role-layout-redirects.test.ts` | settings/admin layouts |
| `api/doctor/clients/route.test.ts` | client → 403 |
| smoke RSC pages | общий smoke |

## Риски (остаток после волны 1)

| Риск | Статус |
|------|--------|
| ~~Admin без `doctor.css`~~ | **Закрыто** волна 1 (`admin/layout.tsx`) |
| `patient.css` на всех `/app/**` включая doctor | Документировано; route-group split — вне волны 1 / backlog |
| Login shell = `PatientAppShell` на `/app` | Документировано; не менять patient chrome |
| Staff install vs patient PWA на одном origin | Волна 2 — [`WAVE2_STAFF_PWA.md`](WAVE2_STAFF_PWA.md) |
