# Инструкция для разработки BersonCareBot

## Контекст проекта

- Node.js + TypeScript (ESM)
- Менеджер пакетов: pnpm
- Сервер: Fastify
- Валидация env: zod + dotenv
- Логирование: pino
- Тесты: Vitest
- Линтинг: ESLint (flat config), Prettier
- Миграции: SQL-файлы в migrations/, скрипт src/db/migrate.ts
- БД: PostgreSQL (pg)
- Без ORM
- Без Docker

## Основные команды

- `pnpm run dev` — запуск dev-сервера (tsx, hot reload)
- `pnpm run build` — сборка TypeScript в dist
- `pnpm start` — запуск production-сборки
- `pnpm test` — тесты (Vitest)
- `pnpm run lint` — ESLint
- `pnpm run format` — Prettier
- `pnpm run migrate` — применить миграции к БД

## Переменные окружения

- Локально: .env в корне
- Production: /opt/tgcarebot/.env
- Пример: .env.example

## БД

- Пользователь: dim (локально)
- БД: tgcarebot
- Миграции: migrations/*.sql
- Структура: telegram_users, subscriptions, schema_migrations

## Прочее

- Не использовать any, не добавлять ORM
- Все исходники в src/
- Для новых фич — сначала тесты

---

_Этот файл сгенерирован GitHub Copilot для быстрой ориентации в проекте. Обновляйте по мере изменений!_
