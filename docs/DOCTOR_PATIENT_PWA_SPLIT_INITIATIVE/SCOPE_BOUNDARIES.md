# Scope boundaries — Doctor Cabinet (Patient PWA frozen)

## Absolute rule

**Не менять файлы и поведение пациентской PWA** в рамках этой инициативы. Регрессии patient-контура — блокер приёмки.

## Запрещено трогать (patient baseline)

```
apps/webapp/src/app/app/patient/**
apps/webapp/src/shared/ui/patient/pwa/**
apps/webapp/src/shared/lib/pwa/pwaAppAccessPolicy.ts
apps/webapp/src/app/app/patient/PatientClientLayout.tsx
apps/webapp/src/app/manifest.ts          # start_url / scope — patient-centric by design
apps/webapp/public/sw.js                 # patient push handler — без изменений
apps/webapp/src/app/api/patient/web-push/**
apps/webapp/src/app/app/patient/notifications/**
apps/webapp/src/shared/lib/webPush/**    # patient client stack
```

Исключение: **чтение** этих файлов для аудита и документирования матрицы «staff vs patient». Правки — только по отдельному решению вне этой волны.

## Разрешено трогать (staff runtime)

```
apps/webapp/src/app/app/doctor/**
apps/webapp/src/app/app/settings/**
apps/webapp/src/app/app/admin/**
apps/webapp/src/app/styles/doctor.css
apps/webapp/src/shared/ui/doctor/**
apps/webapp/src/app-layer/guards/requireRole.ts   # только doctor/admin ветки
apps/webapp/src/modules/roles/service.ts          # canAccessDoctor и т.п.
apps/webapp/src/app/api/doctor/**
```

## Осторожно (shared, только staff-эффект)

| Файл | Допустимо | Запрещено |
|------|-----------|-----------|
| `apps/webapp/src/app/app/layout.tsx` | Не менять в волне 1 (patient.css на всём `/app`) | Убирать patient.css, route groups |
| `modules/auth/redirectPolicy.ts` | Уточнить redirect **doctor/admin** | Менять `isSafeNext`, client `next`, bind-phone |
| `AppEntryRsc.tsx` | Документировать; правка только если doctor застревает на patient **login shell** | Менять patient guest chrome |
| `proxy.ts` / `platformContext.ts` | Не менять (patient + miniapp) | — |

## Продуктовые инварианты (не оспариваем в этой волне)

1. PWA устанавливается как **пациентское** приложение (`manifest.start_url = /app/patient`).
2. Doctor/admin работают в **браузере** на тех же origin `/app/doctor`, `/app/settings` — без отдельной установки.
3. `PwaAppAccessGate` применяется **только** к `/app/patient/**` — это корректно, не «чиним».

## Definition of Done по границам

- [x] `git diff` волны 1 не содержит путей из блока «Запрещено» (2026-06-06).
- [x] Patient paths не менялись; поведение PWA — без правок кода.
- [x] Staff guards покрыты тестами (`requireRole.doctorStaffAccess`, layout redirects, API 403).
