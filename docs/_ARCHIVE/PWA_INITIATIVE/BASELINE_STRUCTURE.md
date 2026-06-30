# Базовая структура webapp (фиксация под PWA и Web Push)

**Снимок «до расширений»:** 2026-05-15. Ниже зафиксировано состояние **до** полноценного офлайн‑кэша и **Web Push** — чтобы не смешивать слои. **Актуальное поведение первой волны PWA** (лендинг `/`, минимальный SW, install UX) — в [`ROADMAP.md`](ROADMAP.md), [`PHASE_00`…`PHASE_03`](PHASE_00_PRINCIPLES_AND_SCOPE.md) и [`LOG.md`](LOG.md).

## Стек и сборка

- **`apps/webapp`**: Next.js **App Router** (`src/app/**`), `output: "standalone"` в `next.config.ts`.
- **Корневой UI:** `src/app/layout.tsx` — `lang="ru"`, общие шрифты/стили, `telegram-web-app.js` (**lazyOnload**), `PlatformProvider`, `BuildVersionWatcher`.
- **Сессия:** привычные cookie‑сессии приложения; отдельный cookie контекста платформы **`bersoncare_platform`** (`bot` | иначе).

## Платформа: бот vs браузер / PWA

- **Канон:** см. `apps/webapp/src/shared/lib/platform.md` — `PlatformEntry` / `PlatformMode`, cookie, proxy `?ctx=bot`, детект Mini App на клиенте.
- **Маршруты мини‑аппов:** `/app/tg`, `/app/max` (см. архивные планы miniapp в `docs/README.md`). Proxy на entry выставляет platform/surface cookies — см. `platform.md` (2026-05-27).
- **Публичная установка PWA и обложка:** **`/`** — маркетинг + `PwaInstallSection` (`src/shared/ui/marketing/`), регистрация **`public/sw.js`** только если **не** `isMessengerMiniAppHost()` (см. [`PHASE_02`](PHASE_02_INSTALL_FLOW.md)). **`/app/patient/*`** в обычном браузере без PWA — редирект на **`/`** (`PwaAppAccessGate`); Mini App exempt при `isMessengerMiniAppHost()` (initData или cookie **`bot`** + MAX/TG bridge).
- **Инструкции в кабинете пациента:** **`/app/patient/install`** — текст для **уже вошедшего** пациента (не дублирует маркетинг **`/`**).

## План дальнейших работ

- **Индекс:** [`ROADMAP.md`](ROADMAP.md)
- **По этапам:** [`PHASE_00_PRINCIPLES_AND_SCOPE.md`](PHASE_00_PRINCIPLES_AND_SCOPE.md) · [`PHASE_01_ROOT_LANDING.md`](PHASE_01_ROOT_LANDING.md) · [`PHASE_02_INSTALL_FLOW.md`](PHASE_02_INSTALL_FLOW.md) · [`PHASE_03_MANIFEST_AUDIT.md`](PHASE_03_MANIFEST_AUDIT.md) · [`WEB_PUSH_VAPID_ADMIN.plan.md`](WEB_PUSH_VAPID_ADMIN.plan.md) · [`BACKLOG.md`](BACKLOG.md)

## Что появилось в рамках PWA (фаза 0 и первая волна)

- **`src/app/manifest.ts`** — Web App Manifest (имя, `start_url`, **`scope: "/app"`**, `display`, иконки).
- **Статические иконки** в `public/`: `pwa-icon-192.png`, `pwa-icon-512.png`, `apple-touch-icon.png` (временные плейсхолдеры под фирменный дизайн).
- **Корневой `metadata` / `viewport`:** иконка Apple, `themeColor`, `appleWebApp` — улучшают поведение при «Добавить на экран Домой» (iOS).
- **Первая волна (код):** лендинг **`src/app/page.tsx`**, `src/shared/ui/marketing/*`, **`public/sw.js`** (только `install`/`activate`, без перехвата `fetch` и без кэша HTML/API).

## Чего пока нет (намеренно)

- **Полный офлайн‑кэш** страниц и данных — не вводился (см. [`BACKLOG.md`](BACKLOG.md)).
- **Web Push** — нет подписок и нет API отправки; **VAPID-пара в админке** (`web_push_vapid` в `system_settings`) — см. [WEB_PUSH_VAPID_ADMIN.plan.md](WEB_PUSH_VAPID_ADMIN.plan.md) и [LOG.md](LOG.md). Ключи и URL провайдера — по канону проекта в **`system_settings`**, не env.

## Связка с будущим push

1. Регистрация SW и `PushManager` — только в **браузерном** контексте; для Mini App обычно **пропуск регистрации** при детекте Telegram/MAX (см. `messengerMiniApp.ts` / `PlatformProvider`).
2. Scope SW — сейчас **`/`** для installability; при push можно сузить до нужного префикса (например `/app/patient`), если не хотим охватывать весь сайт — отдельное решение.
3. Хранение **PushSubscription** — новые таблицы/поля в webapp, API подписки/отписки, фоновая отправка (отдельный дизайн).
