# BersonCareBot

Telegram-бот для записи на приём, управления уведомлениями и интеграции с внутренней системой реабилитации.

Проект ориентирован на:

- надёжную работу через Telegram Webhook
- персистентную дедупликацию `update_id`
- безопасный деплой на сервер с systemd
- строгую типизацию (TypeScript, без `any`)
- автоматические тесты (Vitest)

---

## 🚀 Технологический стек

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- pnpm
- Vitest
- systemd (production)
- GitHub Actions (deploy через SSH)

---

## 📦 Установка (локально)

```bash
pnpm install
cp .env.example .env
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build

Запуск:

pnpm run dev


⸻

⚙️ Переменные окружения

Источник истины: `src/config/env.ts`. Пример: `cp .env.example .env`

Обязательные: `BOT_TOKEN`, `ADMIN_TELEGRAM_ID`, `INBOX_CHAT_ID`, `BOOKING_URL`, `DATABASE_URL`

Опциональные (есть значения по умолчанию): `NODE_ENV`, `HOST`, `PORT`, `LOG_LEVEL`. Секрет webhook: `TG_WEBHOOK_SECRET` (в production рекомендуется задать).

В production используется файл: `/opt/tgcarebot/.env`


⸻

🗄 Миграции

Запуск вручную:

pnpm exec tsx src/db/migrate.ts

Миграции хранятся в:

/migrations

Таблица контроля:

schema_migrations


⸻

🧠 Дедупликация Telegram update_id
 • В таблице telegram_users хранится last_update_id
 • Обработка апдейта происходит только если update_id больше предыдущего
 • Решение персистентное (не in-memory)
 • Защищает от повторных webhook-запросов

⸻

🧪 Тесты

pnpm test

Покрывается:
 • webhook
 • секрет Telegram
 • дедупликация update_id
 • устойчивость к ошибкам tgCall

⸻

🖥 Production

Структура сервера

/opt/tgcarebot
  ├── .env
  ├── app
  │     ├── src
  │     ├── dist
  │     ├── migrations

systemd сервис

/etc/systemd/system/tgcarebot.service

Запуск:

sudo systemctl restart tgcarebot
sudo systemctl status tgcarebot

Логи:

journalctl -u tgcarebot -n 100 --no-pager


⸻

🔐 SSH и деплой

Деплой выполняется пользователем deploy.

GitHub подключается через SSH-ключ:

/home/deploy/.ssh/bersoncarebot_deploy

Проверка:

sudo -u deploy ssh -T git@github.com


⸻

🔁 GitHub Actions Deploy

Workflow:
 • git sync
 • pnpm install
 • pnpm build
 • migrate
 • systemctl restart

Все шаги выполняются под пользователем deploy.

⸻

📡 Webhook

Route:

POST /webhook/telegram

Healthcheck:

GET /health


⸻

🛡 Безопасность
 • Webhook secret проверяется через header
x-telegram-bot-api-secret-token
 • Данные хранятся в PostgreSQL
 • systemd запускает сервис от отдельного пользователя tgcarebot
 • pnpm и git выполняются только от deploy

⸻

📌 Текущее состояние
 • Дедупликация работает
 • Меню inline стабильно
 • Перезапуск сервиса корректный
 • CI зелёный
 • Production билд стабильный

⸻

🧭 Дальнейшее развитие
 • Запрос номера телефона
 • Запись на приём (очно / онлайн)
 • Интеграция с Rubitime
 • Напоминания
 • Расширенная логика подписок

⸻

👤 Автор

Dmitry Berson
Rehabilitation & Digital Health Systems

