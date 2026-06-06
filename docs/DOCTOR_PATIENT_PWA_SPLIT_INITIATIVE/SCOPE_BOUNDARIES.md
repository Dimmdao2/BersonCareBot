# Scope boundaries — Doctor Cabinet (Patient PWA frozen)

## Absolute rule

**Не менять файлы и поведение пациентской PWA** в рамках этой инициативы. Регрессии patient-контура — блокер приёмки.

## Запрещено трогать (patient baseline)

```
apps/webapp/src/app/app/patient/**          # см. исключения волны 2 §A ниже
apps/webapp/src/shared/ui/patient/pwa/**
apps/webapp/src/shared/lib/pwa/pwaAppAccessPolicy.ts
apps/webapp/src/app/app/patient/PatientClientLayout.tsx
apps/webapp/src/app/manifest.ts          # start_url / scope — patient-centric by design
apps/webapp/public/sw.js                 # patient push handler — без изменений
apps/webapp/src/app/api/patient/web-push/**
apps/webapp/src/app/app/patient/notifications/**
apps/webapp/src/shared/lib/webPush/**    # patient client stack
```

Исключение: **чтение** этих файлов для аудита и документирования матрицы «staff vs patient».

### Исключения волны 2 §A (допустимые правки)

| Файл | Что разрешено |
|------|----------------|
| `app/app/patient/layout.tsx` | Только role-block: staff → `buildOwnHubUrlWithAccessDeniedToast` |
| `shared/ui/patient/PatientAppShell.tsx` | Подключение `AppAccessDeniedToastEffect` (toast на hub) |
| `components/landing/LandingPwaClientBootstrap.tsx` | Toast из `next=` после `PwaAppAccessGate` → install landing (без правки gate) |

**Не трогали:** `PwaAppAccessGate`, `pwaAppAccessPolicy.ts`, `PatientClientLayout`, manifest, SW, push.

## Разрешено трогать (staff runtime)

```
apps/webapp/src/app/app/doctor/**
apps/webapp/src/app/app/settings/**
apps/webapp/src/app/app/admin/**
apps/webapp/src/app/styles/doctor.css
apps/webapp/src/shared/ui/doctor/**
apps/webapp/src/app-layer/guards/requireRole.ts   # cross-zone block (волна 2 §A)
apps/webapp/src/modules/roles/service.ts          # canAccessDoctor и т.п.
apps/webapp/src/app/api/doctor/**
apps/webapp/src/shared/lib/appAccessDeniedToast.ts
apps/webapp/src/shared/ui/AppAccessDeniedToastEffect.tsx
```

### Исключения волны 2 §B (staff PWA — допустимые правки)

| Файл / путь | Что разрешено |
|-------------|----------------|
| `app/manifest-staff.webmanifest/route.ts` | Отдельный staff manifest (patient `manifest.ts` не меняем) |
| `shared/lib/pwa/staffPwaManifest.ts`, `staffPwaLayoutMetadata.ts` | Канон staff manifest + metadata |
| `shared/lib/pwa/staffPwaInstallState.ts` | Marker staff install (не patient standalone) |
| `shared/ui/doctor/pwa/StaffPwaBootstrap.tsx`, `StaffPwaInstallSection.tsx` | SW register + install UI |
| `shared/ui/doctor/shell/DoctorAdminSidebar.tsx`, `DoctorHeader.tsx` | Ссылка «Установить приложение» |
| `doctor/install/page.tsx` | Страница установки staff PWA |
| `doctor/settings/admin/layout.tsx` | `metadata.manifest` → staff manifest |
| `public/staff-pwa-icon-*.png`, `staff-pwa-apple-touch.png` | Иконки LOGO_BERSONADMIN |

### Post-§B — staff push (допустимые правки)

| Файл / путь | Что разрешено |
|-------------|----------------|
| `app/api/doctor/web-push/**` | Staff subscribe/status/unsubscribe |
| `modules/doctor-notifications/**` | Темы, resolve, delivery helpers |
| `app/app/settings/DoctorNotification*.tsx`, `doctorNotificationPrefsActions.ts` | UI матрицы |
| `shared/lib/webPush/staffWebPushApi.ts`, `subscribeStaffWebPush.ts` | **Новые** staff-файлы (patient helpers не меняли) |
| `shared/ui/doctor/pwa/StaffWebPushBootstrap.tsx`, `StaffPwaPushOptIn.tsx` | Auto-restore + install opt-in |
| `infra/repos/pgStaffUsers.ts` | Список staff для fan-out сообщений |

**Не трогали:** `manifest.ts` (patient), `PwaAppAccessGate`, `sw.js` (логика push), `/api/patient/web-push/*`, patient notification UI.

## Осторожно (shared, только staff-эффект)

| Файл | Допустимо | Запрещено |
|------|-----------|-----------|
| `apps/webapp/src/app/app/layout.tsx` | Не менять в волне 1 (patient.css на всём `/app`) | Убирать patient.css, route groups |
| `modules/auth/redirectPolicy.ts` | Уточнить redirect **doctor/admin** | Менять `isSafeNext`, client `next`, bind-phone |
| `AppEntryRsc.tsx` | Документировать; правка только если doctor застревает на patient **login shell** | Менять patient guest chrome |
| `proxy.ts` / `platformContext.ts` | Не менять (patient + miniapp) | — |

## Продуктовые инварианты (не оспариваем в этой волне)

1. PWA устанавливается как **пациентское** приложение (`manifest.start_url = /app/patient`).
2. Doctor/admin работают в **браузере** на тех же origin; **опционально** — staff PWA install (`/app/doctor/install`, отдельная иконка).
3. `PwaAppAccessGate` применяется **только** к `/app/patient/**` — gate **не меняем**; toast для browser client — через `next=` на лендинге `/`.

## Definition of Done по границам

- [x] `git diff` волны 2 §A не затрагивает запрещённые patient PWA файлы (gate, manifest, SW, push).
- [x] Допустимые исключения §A задокументированы (layout role-block, shell toast, landing `next`).
- [x] Staff + cross-zone guards + staff push покрыты тестами (**63** fast — см. `WAVE2_STAFF_PWA.md` §Проверки).
- [x] `git diff` волны 2 §B не затрагивает запрещённые patient PWA файлы; staff manifest/install — только разрешённые пути §B.
- [x] Инициатива **done** (волны 1–2) — см. [`README.md`](README.md), [`ACCEPTANCE_WAVE2.md`](ACCEPTANCE_WAVE2.md).
