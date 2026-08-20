# ui

Product-specific UI lives in isolated trees — **не** в корне `shared/ui/`.

## Patient (`shared/ui/patient/**`)

- **PatientAppShell** — оболочка `#app-shell-patient` (top/bottom chrome, main).
- **patient/shell/** — `PatientTopNav`, `PatientBottomNav`, `PatientHeader`, …
- **patient/primitives/** — fork shadcn (`button`, `dialog`, `select`, …).
- **patient/patientVisual.ts** — классы и токены patient UI.
- **AuthBootstrap**, **FeatureCard** — в `patient/` и `patient/auth/`.

Стили: `app/styles/patient.css` (подключается из `app/app/layout.tsx`).

## Doctor (`shared/ui/doctor/**`)

- **DoctorAppShell** — контейнер `#app-shell-doctor` (шапка/меню в `DoctorWorkspaceShell`).
- **doctor/shell/** — `DoctorHeader`, `DoctorWorkspaceShell`, …
- **doctor/catalog/** — split-layout каталогов.
- **doctor/primitives/** — fork shadcn для doctor/settings.
- **doctor/doctorVisual.ts** — классы doctor UI.

Стили: `app/styles/doctor.css`.

## Общее

- **tailwind-engine.css** — Tailwind + shadcn tokens (`app/layout.tsx`).
- **`components/ui/`** — источник для копирования в primitives; **не** импортировать из product routes.
- Инфра в корне `shared/ui/`: `PlatformProvider`, `BuildVersionWatcher` (root layout). Загрузку
  `telegram-web-app.js` убрал владелец 18.08: боты больше не открывают мини-приложение (проверки
  `executeAction*MiniAppRemoval` в интеграторе), поэтому SDK грузился впустую и шумел в консоли
  обычного браузера. Код, умеющий работать внутри мини-приложения, оставлен спящим — решение
  владельца «мини-апп если и будет, то отдельно».

См. `AGENTS.md` §17 «Patient / Doctor UI Isolation».
