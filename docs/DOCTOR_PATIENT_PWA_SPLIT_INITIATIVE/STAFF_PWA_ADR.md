# ADR — Staff PWA (волна 2 §B, 2.B0)

**Статус:** принято 2026-06-06 · **реализовано** 2026-06-07 (2.B0–2.B8).

## Контекст

Patient PWA (`manifest.ts`, `start_url: /app/patient`) — **без изменений**. Нужен **второй** install-контур для врача/админа с иконкой LOGO_BERSONADMIN.

## Решения

| # | Вопрос | Решение |
|---|--------|---------|
| 1 | Scope staff manifest | **`/app`** — тот же origin scope, что patient SW; покрывает `/app/doctor`, `/app/settings`, `/app/admin` |
| 2 | Два ярлыка на устройстве | **Да** — разные `id` manifest (`/app` patient vs `/app-staff` staff) и разные `start_url` |
| 3 | Staff push на install | **Нет** в §B — без web-push opt-in на install; patient push stack не трогаем |
| 4 | iOS install copy | **Да** — инструкции на `/app/doctor/install` (Safari «На экран Домой» / Mac Dock) |
| 5 | Обязательность install | **Опционально** — browser OK для staff (как волна 1); PWA — ускорение, отдельная иконка |
| 6 | Service worker | **Тот же** `public/sw.js`, `scope: /app` — без второго SW |
| 7 | Manifest URL | **`/manifest-staff.webmanifest`** — route handler, канон в `staffPwaManifest.ts` |

## Последствия

- `doctor` / `settings` / `admin` layouts: `metadata.manifest` → staff manifest; иконки `staff-pwa-icon-*`.
- Patient routes: root `manifest.ts` без изменений.
- Установка: `/app/doctor/install` + `StaffPwaBootstrap` (SW register в doctor shell).
- Навигация: sidebar + mobile Sheet → `/app/doctor/install`.
- Install «готово»: `staffPwaInstallState` (localStorage marker после `appinstalled`), без ложного срабатывания patient standalone.

## Вне scope §B

- Staff web push, offline cache, отдельный subdomain/deploy.
