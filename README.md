# BersonCareBot

Telegram-бот для записи на приём, управления уведомлениями и интеграции с внутренней системой реабилитации.

- Webhook Telegram, дедупликация по `update_id`, валидация входящих данных
- TypeScript (ESM), Fastify, PostgreSQL, grammY, Vitest
- Деплой: systemd, GitHub Actions по SSH

**Внутренняя структура:** [src/architecture.md](src/architecture.md) — слои, папки, файлы, поток данных.

Для разработки: строгий TypeScript (без `any`), исходники в `src/`, перед новой фичей — тесты.

---

## Установка и запуск

```bash
pnpm install
cp .env.example .env
# заполнить .env (см. ниже)
pnpm run typecheck && pnpm run lint && pnpm test && pnpm run build
pnpm run dev
```

Production: `pnpm start` (перед этим `pnpm run build`).

---

## Переменные окружения

Источник истины: **src/config/env.ts**. Пример: `.env.example`.

**Обязательные:** `BOT_TOKEN`, `ADMIN_TELEGRAM_ID`, `INBOX_CHAT_ID`, `BOOKING_URL`, `DATABASE_URL`

**Опциональные:** `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL` (есть умолчания); `TG_WEBHOOK_SECRET` — в production рекомендуется задать.

В production: `/opt/tgcarebot/.env`.

---

## Основные команды

| Команда | Назначение |
|--------|------------|
| `pnpm run dev` | Dev-сервер (tsx watch) |
| `pnpm run build` | Сборка в dist |
| `pnpm start` | Запуск собранного приложения |
| `pnpm test` | Тесты (Vitest, включая e2e-сценарии webhook) |
| `pnpm run lint` | ESLint |
| `pnpm run typecheck` | Проверка типов |
| `pnpm run migrate` | Применить миграции к БД |
| `pnpm run scenarios` | Прогон e2e-сценариев отдельным скриптом |

---

## API

- **POST /webhook/telegram** — входящие апдейты Telegram (секрет в заголовке `x-telegram-bot-api-secret-token` при заданном `TG_WEBHOOK_SECRET`).
- **GET /health** — ответ `{ ok: true, db: 'up' | 'down' }`.

---

## Миграции БД

Миграции: папка **migrations/** (SQL). Таблица контроля: **schema_migrations**.

```bash
pnpm run migrate
```

На проде после деплоя миграции выполняются из workflow (см. ниже).

---

## Деплой (production)

Сервер: каталог приложения `/opt/tgcarebot` (в нём `.env`, подкаталог app с репо: src, dist, migrations). Сервис systemd: `tgcarebot`. Деплой от пользователя **deploy** по SSH; ключ — по усмотрению (например `~/.ssh/...`).

GitHub Actions: push в main → checkout → `pnpm install --frozen-lockfile` → `pnpm build` → загрузка `.env` и `pnpm exec tsx src/db/migrate.ts` → `systemctl restart tgcarebot`.

Полезные команды на сервере:

```bash
sudo systemctl restart tgcarebot
sudo systemctl status tgcarebot
journalctl -u tgcarebot -n 100 --no-pager
```

---

## Безопасность

- Webhook: проверка секрета по заголовку (если задан).
- Данные: PostgreSQL, один пул, конфиг только из env.
- Сервис и деплой: отдельный пользователь (tgcarebot / deploy), без лишних прав.

---

## Дальнейшее развитие

Запрос телефона, запись на приём (очно/онлайн), интеграция с Rubitime, напоминания, расширенная логика подписок.

---

Автор: Dmitry Berson · Rehabilitation & Digital Health Systems
