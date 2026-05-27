# Legacy TODO: шаблоны программ с элементом `lfk_complex`

**Статус (2026-05-27):** миграция данных выполнена (`0081_expand_lfk_complex_stage_items.sql`). Тип `lfk_complex` убран из CHECK пунктов шаблона и инстанса (`0082_drop_lfk_complex_item_type_check.sql`). Новые строки `lfk_complex` в stage items не создаются; добавление комплекса в **инстанс** и **шаблон** — только разворот в `exercise` (`from-lfk-complex`). Пациентский legacy (`lfk-session`, карточка комплекса) удалён; комментарии к программе врача — `observation-note` + notify только для `assignment_source=doctor`.

## Выкат миграций (production)

Порядок обязателен: **`0081_expand_lfk_complex_stage_items.sql`**, затем **`0082_drop_lfk_complex_item_type_check.sql`** (`pnpm --dir apps/webapp run migrate` после deploy webapp с файлами миграций).

После наката — проверка (без секретов в лог):

```sql
SELECT count(*) FROM treatment_program_template_stage_items WHERE item_type = 'lfk_complex';
SELECT count(*) FROM treatment_program_instance_stage_items WHERE item_type = 'lfk_complex';
```

Ожидание: **0** в обеих таблицах.

## Вне scope (без изменений)

- Напоминания с `linked_object_type = lfk_complex` (каталог).
- Исторический `program_action_log` с `lfk_exercise_done` / `lfk_session`.
- Каталог `lfk_complex_templates` и API материалов с `target_kind = lfk_complex`.

Секреты и ключи в этот файл не записывать.
