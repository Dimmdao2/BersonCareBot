# Rollback SQL (операционно) - PATIENT_HOME_REDESIGN

Фрагменты для ручного отката DDL-миграций Drizzle при необходимости.

## Production execution preamble

На production не запускать `psql "$DATABASE_URL"` без загрузки env-файла. Канонический контекст webapp:

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1
```

После unification `api.prod` и `webapp.prod` обычно указывают на одну PostgreSQL; таблицы этой инициативы находятся в схеме `public`.

## Full rollback order

Для полного отката инициативы выполнять блоки в обратном порядке:

1. `0011_patient_daily_mood`
2. `0010_patient_practice_completions`
3. `0009_content_pages_linked_course`
4. `0008_material_frightful_four`

## 0011_patient_daily_mood

```sql
DROP TABLE IF EXISTS patient_daily_mood CASCADE;
```

## 0010_patient_practice_completions

```sql
DROP TABLE IF EXISTS patient_practice_completions CASCADE;
```

## 0009_content_pages_linked_course

```sql
ALTER TABLE content_pages DROP CONSTRAINT IF EXISTS content_pages_linked_course_fkey;
DROP INDEX IF EXISTS idx_content_pages_linked_course;
ALTER TABLE content_pages DROP COLUMN IF EXISTS linked_course_id;
```

## 0008_material_frightful_four

```sql
DROP TABLE IF EXISTS patient_home_block_items CASCADE;
DROP TABLE IF EXISTS patient_home_blocks CASCADE;
ALTER TABLE content_sections DROP COLUMN IF EXISTS cover_image_url;
ALTER TABLE content_sections DROP COLUMN IF EXISTS icon_image_url;
```
