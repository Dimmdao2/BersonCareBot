# Базовая структура webapp (фиксация под PWA и Web Push)

Дата снимка: 2026-05-15. Цель документа — зафиксировать состояние **до** внедрения service worker, офлайн‑кэша и push, чтобы не смешивать слои.

## Стек и сборка

- **`apps/webapp`**: Next.js **App Router** (`src/app/**`), `output: "standalone"` в `next.config.ts`.
- **Корневой UI:** `src/app/layout.tsx` — `lang="ru"`, общие шрифты/стили, `telegram-web-app.js` (**lazyOnload**), `PlatformProvider`, `BuildVersionWatcher`.
- **Сессия:** привычные cookie‑сессии приложения; отдельный cookie контекста платформы **`bersoncare_platform`** (`bot` | иначе).

## Платформа: бот vs браузер / PWA

- **Канон:** см. `apps/webapp/src/shared/lib/platform.md` — `PlatformEntry` / `PlatformMode`, cookie, proxy `?ctx=bot`, детект Mini App на клиенте.
- **Маршруты мини‑аппов:** `/app/tg`, `/app/max` (см. архивные планы miniapp в `docs/README.md`).
- **Страница «установить приложение»:** `/app/patient/install` — сейчас только **инструкция** для пользователя; технический manifest подключается с **корня** сайта (один origin для бота и браузера).

## Что появилоcь в рамках PWA (фаза 0)

- **`src/app/manifest.ts`** — Web App Manifest (имя, `start_url`, `display`, иконки).
- **Статические иконки** в `public/`: `pwa-icon-192.png`, `pwa-icon-512.png`, `apple-touch-icon.png` (временные плейсхолдеры под фирменный дизайн).
- **Корневой `metadata` / `viewport`:** иконка Apple, `themeColor`, `appleWebApp` — улучшают поведение при «Добавить на экран Домой» (iOS).

## Чего пока нет (намеренно)

- **Service worker** — не регистрируется: нет перехвата fetch, нет влияния на мини‑апп и кэш.
- **Web Push** — нет подписок, нет VAPID, нет API отправки; при появлении ключи и URL провайдера — по канону проекта в **`system_settings`**, не env.

## Связка с будущим push

1. Регистрация SW и `PushManager` — только в **браузерном** контексте; для Mini App обычно **пропуск регистрации** при детекте Telegram/MAX (см. `messengerMiniApp.ts` / `PlatformProvider`).
2. Scope SW — сузить до нужного префикса (например `/app/patient`), если не хотим охватывать весь сайт.
3. Хранение **PushSubscription** — новые таблицы/поля в webapp, API подписки/отписки, фоновая отправка (отдельный дизайн).
