# Rollback SQL — Phase 4 (`content_section_slug_history`)

Цель: откат миграции `0008_content_section_slug_history` или ручное восстановление после частичного сбоя.

**Подключение к БД:** только с предварительной загрузкой env, см. `.cursor/rules/host-psql-database-url.mdc` и `docs/ARCHITECTURE/SERVER CONVENTIONS.md` (не использовать «голый» `psql "$DATABASE_URL"`).

## 1. Полный откат миграции (удаление таблицы истории)

Выполнять **только** если нет зависимостей от редиректов по истории и допустимо потерять записи истории.

```sql
BEGIN;
DROP TABLE IF EXISTS content_section_slug_history CASCADE;
COMMIT;
```

После этого в журнале Drizzle нужно согласовать состояние с репозиторием (ops: не откатывать journal без процедуры cutover — обычно откат = новый forward-migration или восстановление снапшота БД).

## 2. Откат одного переименования slug (ручная хирургия)

Если транзакция rename не завершилась — состояние уже откатилось само (`ROLLBACK`).

Если rename **успешно** применён, автоматический «откат» без знания старых значений невозможен. Типовой ручной порядок (один раздел, известны `old_slug` и `new_slug`):

```sql
BEGIN;
-- Вернуть ссылки страниц
UPDATE content_pages SET section = '<old_slug>' WHERE section = '<new_slug>';
-- Если существует patient_home_block_items с теми же колонками:
UPDATE patient_home_block_items
  SET target_ref = '<old_slug>'
  WHERE target_type = 'content_section' AND target_ref = '<new_slug>';
-- Удалить запись истории для этого шага
DELETE FROM content_section_slug_history WHERE old_slug = '<old_slug>' AND new_slug = '<new_slug>';
-- Вернуть slug в content_sections
UPDATE content_sections SET slug = '<old_slug>' WHERE slug = '<new_slug>';
COMMIT;
```

Проверьте уникальность `<old_slug>` в `content_sections` перед `COMMIT`.

## 3. Заметки

- Таблица `patient_home_block_items` в схеме webapp может отсутствовать; шаг с `UPDATE` пропускайте, если таблицы нет.
- Цепочки редиректов (несколько rename подряд) откатываются **в обратном порядке** по одному шагу.

## 4. Rollback миграции `0009_patient_home_cms_blocks`

Откатывает таблицы главной пациента и (опционально) колонки, добавленные в том же файле миграции. Выполнять только при согласовании с ops и бэкапом.

```sql
BEGIN;
DROP TABLE IF EXISTS patient_home_block_items CASCADE;
DROP TABLE IF EXISTS patient_home_blocks CASCADE;
ALTER TABLE content_section_slug_history DROP CONSTRAINT IF EXISTS content_section_slug_history_slug_diff_chk;
ALTER TABLE content_section_slug_history DROP COLUMN IF EXISTS changed_by_user_id;
ALTER TABLE content_sections DROP COLUMN IF EXISTS icon_image_url;
ALTER TABLE content_sections DROP COLUMN IF EXISTS cover_image_url;
COMMIT;
```

После отката: согласовать запись в `db/drizzle-migrations/meta/_journal.json` и фактическое состояние БД (обычно — новая forward-миграция вместо «вырезания» записи из журнала).
