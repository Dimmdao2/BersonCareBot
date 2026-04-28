# Rollback SQL (операционно) — PATIENT_HOME_REDESIGN

Фрагменты для ручного отката миграций Drizzle при необходимости.

## 0009_content_pages_linked_course

```sql
ALTER TABLE content_pages DROP CONSTRAINT IF EXISTS content_pages_linked_course_fkey;
DROP INDEX IF EXISTS idx_content_pages_linked_course;
ALTER TABLE content_pages DROP COLUMN IF EXISTS linked_course_id;
```
