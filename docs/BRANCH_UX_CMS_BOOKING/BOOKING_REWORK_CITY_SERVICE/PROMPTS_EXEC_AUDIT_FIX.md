# Промпты: запуск этапов, аудит, фиксы (copy-paste)

Ниже готовые промпты для запуска этапов из:

- `STAGE_1_SPEC_AND_CONTRACTS.md`
- `STAGE_2_DB_AND_SEED.md`
- `STAGE_3_ADMIN_CATALOG.md`
- `STAGE_4_PATIENT_FLOW_IN_PERSON.md`
- `STAGE_5_INTEGRATOR_BRIDGE_AND_CUTOVER.md`
- `STAGE_6_TEST_AUDIT_RELEASE.md`

Использование:

1. Запусти `EXEC` для этапа.
2. После завершения запусти `AUDIT` этого этапа.
3. Если аудит дал замечания - запусти `FIX` этого этапа.
4. После всех этапов запусти `GLOBAL AUDIT`.
5. Если общий аудит дал замечания - запусти `GLOBAL FIX`.

---

## STAGE 1 - EXEC

**Рекомендуемая модель:** Sonnet 4.6 (декомпозиция/спека)

```text
Выполни этап строго по документу:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_1_SPEC_AND_CONTRACTS.md

Контекст:
- Это booking rework city+service для очного приема.
- Online не трогаем.
- Нельзя менять названия этапов и файлов.

Задачи:
1) Выполни все задачи этапа S1.T01-S1.T05 последовательно.
2) Для каждой задачи обновляй статус и детали в:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md
3) Не пропускай критерии готовности.
4) Если информации не хватает - зафиксируй это в логе как blocked с конкретной причиной.

Требования к результату:
- Все задачи этапа либо done, либо явно blocked со следующими шагами.
- Изменения ограничены только нужными файлами.
- В конце дай краткий отчет: что сделано по каждому S1.T0X.
```

## STAGE 1 - AUDIT

**Рекомендуемая модель:** GPT 5.3 Codex

```text
Проведи аудит выполненного этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_1_SPEC_AND_CONTRACTS.md

Проверь:
1) Соответствие каждой задаче S1.T01-S1.T05.
2) Полноту артефактов (созданные/обновленные документы, контракты, mapping).
3) Корректность ссылок на файлы и согласованность с:
   - docs/BRANCH_UX_CMS_BOOKING/BOOKING_MODULE_SPEC.md
   - docs/BRANCH_UX_CMS_BOOKING/PHASE_2_TASKS.md
4) Актуальность логов в:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md

Формат вывода:
- verdict: approve | rework
- список замечаний по severity (critical/major/minor)
- для каждого замечания: файл, что не так, как исправить
```

## STAGE 1 - FIX

**Рекомендуемая модель:** Composer/Auto agent

```text
Исправь замечания аудита для этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_1_SPEC_AND_CONTRACTS.md

Вход:
- Последний audit-report по Stage 1 (verdict=rework, список замечаний).

Сделай:
1) Исправь все замечания без изменения названий этапов и файлов.
2) Обнови статусы/примечания в:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md
3) Не добавляй новый scope сверх замечаний.

Результат:
- список исправленных пунктов в формате "замечание -> фикс".
```

---

## STAGE 2 - EXEC

**Рекомендуемая модель:** Composer/Auto agent

```text
Выполни этап строго по документу:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_2_DB_AND_SEED.md

Ключевые ограничения:
- Source of truth каталога: webapp DB.
- Онлайн-поток не трогать.
- Seed строить на основе:
  docs/BRANCH_UX_CMS_BOOKING/FUTURE_SETTINGS_TOCHKA_ZDOROVYA.md

Задачи:
1) Выполни S2.T01-S2.T06 последовательно.
2) После каждой задачи обновляй:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md
3) Для миграций и скриптов делай безопасный порядок (без разрушающих действий до cutover).

Проверки:
- Локально прогоняй релевантные тесты по задаче.
- В конце этапа: pnpm run ci.

Вывод:
- список выполненных задач S2.T0X + статус + ключевые файлы.
```

## STAGE 2 - AUDIT

**Рекомендуемая модель:** GPT 5.3 Codex

```text
Проведи аудит этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_2_DB_AND_SEED.md

Проверь:
1) Миграции и схему на соответствие migration contract v2.
2) Seed и backfill: идемпотентность, dry-run, отчетность, fail-fast.
3) Отсутствие unsafe destructive шагов в cutover-порядке.
4) Тесты и CI статус.
5) Заполненность:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md

Формат:
- verdict: approve | rework
- замечания с severity + путь исправления
```

## STAGE 2 - FIX

```text
Исправь замечания аудита для этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_2_DB_AND_SEED.md

Правила:
1) Исправить все пункты аудита, особенно по миграциям/seed/backfill.
2) Не менять scope этапа.
3) Обновить лог:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md
4) Повторно прогнать релевантные тесты и при необходимости pnpm run ci.

Вывод:
- чеклист "было замечание -> стало исправлено".
```

---

## STAGE 3 - EXEC

**Рекомендуемая модель:** Composer/Auto agent

```text
Выполни этап строго по документу:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_3_ADMIN_CATALOG.md

Задачи:
1) Выполни S3.T01-S3.T05 последовательно.
2) Реализуй admin API и UI каталога city/branch/service/specialist/branch-service.
3) Обновляй лог после каждой задачи:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md

Ограничения:
- Не возвращай legacy booking profiles UI в качестве основного механизма.
- Соблюдай guard adminMode/role.

Проверки:
- route tests + UI smoke.
- в конце этапа: pnpm run ci.
```

## STAGE 3 - AUDIT

```text
Проведи аудит этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_3_ADMIN_CATALOG.md

Проверь:
1) Полноту CRUD для всех сущностей каталога.
2) Авторизацию admin-only.
3) Валидацию payload (ошибки 4xx там, где нужно).
4) Согласованность UI c новой моделью city+service.
5) Логи и тесты.

Формат:
- verdict: approve | rework
- замечания с severity + конкретные фиксы
```

## STAGE 3 - FIX

```text
Исправь замечания аудита для этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_3_ADMIN_CATALOG.md

Сделай:
1) Закрой все замечания audit по API/UI/валидациям.
2) Обнови EXECUTION_LOG.md.
3) Прогони релевантные тесты и при необходимости pnpm run ci.

Отчет:
- список исправлений с привязкой к замечаниям.
```

---

## STAGE 4 - EXEC

**Рекомендуемая модель:** Composer/Auto agent

```text
Выполни этап строго по документу:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_4_PATIENT_FLOW_IN_PERSON.md

Задачи:
1) Выполни S4.T01-S4.T06 последовательно.
2) Реализуй user flow: город -> услуга -> время.
3) Не показывай выбор сотрудника в UI.
4) Онлайн-кнопку и онлайн-поток не переделывай.
5) После каждой задачи обновляй:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md

Проверки:
- API и UI тесты по этапу.
- в конце этапа: pnpm run ci.
```

## STAGE 4 - AUDIT

```text
Проведи аудит этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_4_PATIENT_FLOW_IN_PERSON.md

Проверь:
1) Очный поток полностью на city+service.
2) Для in-person v2 нет обязательного category.
3) Snapshot-поля booking заполняются корректно.
4) Legacy записи читаются без регрессии.
5) Тесты/CI и лог.

Формат:
- verdict: approve | rework
- замечания по severity + как исправить
```

## STAGE 4 - FIX

```text
Исправь замечания аудита для этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_4_PATIENT_FLOW_IN_PERSON.md

Требования:
1) Закрыть все замечания по UI/API/service.
2) Не выходить за scope этапа.
3) Обновить:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md
4) Перепроверить релевантные тесты.
```

---

## STAGE 5 - EXEC

**Рекомендуемая модель:** Composer/Auto agent

```text
Выполни этап строго по документу:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_5_INTEGRATOR_BRIDGE_AND_CUTOVER.md

Задачи:
1) Выполни S5.T01-S5.T05 последовательно.
2) Переведи integrator на технический bridge с explicit Rubitime IDs.
3) Legacy mapping path оставь только как временный compatibility (если указано задачей).
4) Подготовь cutover runbook.
5) Обновляй лог после каждой задачи:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md

Проверки:
- integrator tests + contract tests.
- в конце этапа: pnpm run ci.
```

## STAGE 5 - AUDIT

```text
Проведи аудит этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_5_INTEGRATOR_BRIDGE_AND_CUTOVER.md

Проверь:
1) Integrator не резолвит in-person v2 через legacy category/city.
2) M2M contracts корректны и обратно совместимы в заявленном объеме.
3) Guard/HMAC/security не ослаблены.
4) Cutover runbook реалистичен и безопасен.
5) Тесты/CI и лог.

Формат:
- verdict: approve | rework
- замечания с severity и фиксом
```

## STAGE 5 - FIX

```text
Исправь замечания аудита для этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_5_INTEGRATOR_BRIDGE_AND_CUTOVER.md

Сделай:
1) Закрой замечания по контрактам/route/compat/cutover.
2) Не расширяй scope этапа.
3) Обнови EXECUTION_LOG.md.
4) Перепроверь тесты и CI.
```

---

## STAGE 6 - EXEC

**Рекомендуемая модель:** Composer/Auto agent

```text
Выполни этап строго по документу:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_6_TEST_AUDIT_RELEASE.md

Задачи:
1) Выполни S6.T01-S6.T05.
2) Закрой тест-матрицу, тесты webapp/integrator, аудит и pre-release check.
3) Обновляй:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md
4) Обновляй чеклисты:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md

Проверки:
- полный pnpm run ci обязателен.
```

## STAGE 6 - AUDIT

```text
Проведи аудит этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_6_TEST_AUDIT_RELEASE.md

Проверь:
1) Полноту тест-матрицы и покрытий.
2) Закрытие замечаний по всем этапам 1-5.
3) Корректность финального pre-release решения ready/not-ready.
4) Полноту логов и чеклистов.

Формат:
- verdict: approve | rework
- блокеры к релизу (если есть)
```

## STAGE 6 - FIX

```text
Исправь замечания аудита для этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_6_TEST_AUDIT_RELEASE.md

Сделай:
1) Закрой все оставшиеся test/audit/release замечания.
2) Обнови EXECUTION_LOG.md и CHECKLISTS.md.
3) Повторно прогони pnpm run ci.
```

---

## GLOBAL AUDIT (после завершения всех этапов)

**Рекомендуемая модель:** GPT 5.3 Codex (эскалация на более строгую при необходимости)

```text
Проведи финальный аудит всего rework:

Обязательные документы:
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/README.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_1_SPEC_AND_CONTRACTS.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_2_DB_AND_SEED.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_3_ADMIN_CATALOG.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_4_PATIENT_FLOW_IN_PERSON.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_5_INTEGRATOR_BRIDGE_AND_CUTOVER.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_6_TEST_AUDIT_RELEASE.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md
- docs/BRANCH_UX_CMS_BOOKING/FUTURE_SETTINGS_TOCHKA_ZDOROVYA.md

Проверь:
1) Реализована ли модель in-person city+service end-to-end.
2) Пациент выбирает город/услугу/время без выбора сотрудника.
3) В Rubitime create/slots уходят корректные explicit IDs.
4) Integrator выполняет роль технического моста.
5) Migration/seed/backfill/cutover безопасны.
6) Legacy path контролируемо отключаем.
7) Полный CI green.

Формат результата:
- final verdict: approve_for_merge | rework_required
- список замечаний с severity
- обязательные правки до merge
```

## GLOBAL FIX (после общего аудита)

```text
Исправь все замечания финального аудита по rework city+service.

Scope:
- только замечания из GLOBAL AUDIT;
- без добавления нового функционала вне аудита.

Обнови:
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md

После исправлений:
1) Прогони полный pnpm run ci.
2) Подготовь короткий отчет:
   - замечание -> исправление -> подтверждение тестом/проверкой.
```
