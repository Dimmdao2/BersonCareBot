# Stage 1 — Integrator canonical schema (Deploy 1)

**Цель:** добавить в БД integrator модель **alias** для `users` без изменения поведения приложения. Webapp blocker на разные `integrator_user_id` **сохраняется**.

## Контекст схемы

- Канонический контракт: [`../../apps/integrator/src/infra/db/schema.md`](../../apps/integrator/src/infra/db/schema.md).
- **До Deploy 1** базовая таблица `users` задаётся миграцией `20260306_0012_create_users.sql`: `id BIGSERIAL`, `created_at`, `updated_at`.
- **После Deploy 1** (миграция `20260410_0001_users_merged_into_user_id.sql`) в той же таблице добавляется nullable `merged_into_user_id` (FK на `users(id)`), CHECK и partial index — см. ниже «Предлагаемый DDL» и репозиторный SQL-файл.

## Предлагаемый DDL (черновик для ревью перед кодированием)

Разместить новый файл в `apps/integrator/src/infra/db/migrations/core/`:

- `ALTER TABLE users ADD COLUMN merged_into_user_id BIGINT NULL REFERENCES users(id) ...`
- `CHECK`: `merged_into_user_id IS NULL OR merged_into_user_id <> id`
- Индекс (имя в репозитории: `idx_users_merged_into_user_id`): `CREATE INDEX idx_users_merged_into_user_id ON users (merged_into_user_id) WHERE merged_into_user_id IS NOT NULL`
- Опционально: индекс/constraint, запрещающий цепочки глубины > 1 (если политика «только один hop») — обсудить до merge.

**Важно:** колонка **nullable**; существующие строки = canonical (`NULL`).

## Инварианты (зафиксировать в коде в Stage 2+)

- **Canonical row:** `merged_into_user_id IS NULL`.
- **Alias row:** `merged_into_user_id` указывает на живого canonical `users.id`.
- Запрет записи доменных данных «на alias» — не в этой миграции, а в Stage 2.

## Документация

- Обновить `apps/integrator/src/infra/db/schema.md` (раздел `users`).
- Обновить `docs/ARCHITECTURE/DB_STRUCTURE.md` § integrator `users`.

## Тесты / проверки

- Локально: `pnpm --dir apps/integrator run db:migrate` (или эквивалент dev) + smoke API.
- CI: существующий pipeline.

## Rollback

- Только если колонка не использовалась: `ALTER TABLE users DROP COLUMN merged_into_user_id` (операционно, в maintenance window).

## Связь с todo «integrator-schema»

Этот документ **и есть** спецификация этапа: реализация = PR с миграцией + обновление schema docs.
