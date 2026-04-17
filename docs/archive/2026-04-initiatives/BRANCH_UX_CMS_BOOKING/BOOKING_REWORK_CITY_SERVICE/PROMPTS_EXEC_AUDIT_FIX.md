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
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_7_BOOKING_WIZARD_PAGES.md
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

---

## STAGE 7 - EXEC

**Рекомендуемая модель:** Composer/Auto agent

```text
Выполни этап строго по документу:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_7_BOOKING_WIZARD_PAGES.md

Контекст:
- Цель: убрать Dialog/Sheet попап из кабинета пациента, перевести booking flow
  в самостоятельные URL-ориентированные страницы под /app/patient/booking/new/.
- Онлайн-поток также переводится в wizard (не сохранять диалог для online).
- Хуки (useBookingCatalogCities, useBookingCatalogServices, useBookingSlots, useCreateBooking)
  остаются в cabinet/ — импортируй из текущего расположения.
- Не трогать API, integrator, DB, seed, cutover — только frontend UX.

Задачи:
1) Выполни S7.T01–S7.T09 последовательно.
2) После каждой задачи обновляй статус в:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md
3) На каждом шаге:
   - Server Component для page.tsx (guard + redirect при невалидных params).
   - Client Component для *StepClient.tsx (hooks, router.push, интерактивность).
   - URL search params — единственный транспорт состояния между шагами.
4) После S7.T09 прогони: pnpm run ci.

Ограничения:
- Не добавлять глобальный state (zustand, context) для wizard.
- Не переносить хуки cabinet/ в другие директории в этом этапе.
- CabinetBookingEntry после S7.T08 — только Link кнопка, без диалога.

Вывод:
- список выполненных задач S7.T0X + статус + ключевые созданные/изменённые файлы.
```

## STAGE 7 - AUDIT

**Рекомендуемая модель:** GPT 5.3 Codex

```text
Проведи аудит выполненного этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_7_BOOKING_WIZARD_PAGES.md

Проверь:
1) Соответствие каждой задаче S7.T01–S7.T09:
   - Все 5 шагов wizard реализованы как отдельные страницы.
   - routePaths содержит все новые константы.
   - CabinetBookingEntry не содержит Dialog/Sheet/local state.
2) URL-state корректность:
   - Каждый page.tsx читает searchParams и redirect при невалидных params.
   - Search params схема соответствует документу (type, cityCode, cityTitle, branchServiceId, serviceTitle, category, date, slot).
3) Server/Client разделение:
   - page.tsx — Server Component (нет "use client", нет browser hooks).
   - *StepClient.tsx — "use client" с useSearchParams/useRouter.
4) Покрытие форматов:
   - in_person path: format → city → service → slot → confirm работает.
   - online path: format → slot → confirm работает.
5) Тесты и CI статус (S7.T09).
6) Заполненность EXECUTION_LOG.md задачами S7.T01–S7.T09.

Формат:
- verdict: approve | rework
- замечания с severity (critical/major/minor) + файл + как исправить
```

## STAGE 7 - FIX

```text
Исправь замечания аудита для этапа:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_7_BOOKING_WIZARD_PAGES.md

Вход:
- Последний audit-report по Stage 7 (verdict=rework, список замечаний).

Сделай:
1) Исправь все замечания без изменения архитектурных решений этапа
   (URL-driven state, Server/Client split, хуки остаются в cabinet/).
2) Не добавляй новый scope сверх замечаний.
3) Обнови статусы в:
   docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md
4) Повторно прогони: pnpm run ci.

Результат:
- список исправлений в формате "замечание -> фикс -> файл".
```

---

## STAGE 8 - EXEC

**Рекомендуемая модель:** Sonnet (docs-sync, policy)

```text
Выполни Stage 8 — Audit Remediation строго по документу:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_8_AUDIT_REMEDIATION.md

Контекст:
- Закрываем замечания финального аудита, фиксируем legacy-off policy, синхронизируем индексы.
- Не трогаем код integrator/webapp в этом этапе.

Задачи:
1) Выполни S8.T01–S8.T06 последовательно.
2) После каждой задачи обновляй статус в EXECUTION_LOG.md.
3) Фиксируй SHA после CI: git rev-parse HEAD → добавить в итог Stage 8.

Результат:
- список выполненных S8.Txx + файлы + SHA.
```

## STAGE 8 - AUDIT

```text
Проведи аудит Stage 8 — Audit Remediation:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_8_AUDIT_REMEDIATION.md

Проверь:
1) README.md содержит все Stages 1–15 с корректными ссылками.
2) CHECKLISTS.md §6 обновлён до Stage 1-7; §7 добавлен с gate-пунктами.
3) CUTOVER_RUNBOOK.md §6 содержит online-safe gate с явными условиями.
4) STAGE_5 содержит POLICY-блок с условиями безопасного legacy-off.
5) EXECUTION_LOG.md содержит SHA для последнего CI Stages 1–7.
6) COMPATIBILITY_RUBITIME_WEBAPP.md создан с definition of done и обязательными полями.

Формат:
- verdict: approve | rework
- замечания с severity (critical/major/minor)
```

## STAGE 8 - FIX

```text
Исправь замечания аудита Stage 8.

Сделай только фиксы из audit-report, без добавления нового scope.
Обнови EXECUTION_LOG.md.
```

---

## STAGE 9 - EXEC

**Рекомендуемая модель:** Sonnet (спека + контракты)

```text
Выполни Stage 9 — Online Intake Model строго по документу:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_9_ONLINE_INTAKE.md

Контекст:
- Online больше не записывает в Rubitime напрямую.
- LFK: свободное описание проблемы + вложения/ссылки -> уведомление врачу.
- Nutrition: пошаговая анкета -> уведомление врачу.
- Данные остаются в patient history.

Задачи:
1) Выполни S9.T01–S9.T07 последовательно.
2) Обновляй EXECUTION_LOG.md после каждой задачи.

Ограничения:
- Только спека и контракты; код не пишем (Stage 10).
- Не изменять in_person flow.
```

## STAGE 9 - AUDIT

```text
Проведи аудит Stage 9 — Online Intake Model:

Проверь:
1) STAGE_9_ONLINE_INTAKE.md описывает оба сценария (LFK + nutrition).
2) API_CONTRACT_ONLINE_INTAKE_V1.md содержит submit/list/read/status-change эндпоинты.
3) MIGRATION_CONTRACT_ONLINE_INTAKE_V1.md содержит все таблицы (requests/answers/attachments).
4) Privacy/retention policy описана.
5) Notification routing к врачу задокументирован.
6) TEST_MATRIX_STAGE9.md содержит happy/negative/security cases.

Формат: verdict + замечания с severity.
```

## STAGE 9 - FIX

```text
Исправь замечания аудита Stage 9 — только scope контрактов и спек.
Обнови EXECUTION_LOG.md.
```

---

## STAGE 10 - EXEC

**Рекомендуемая модель:** Sonnet (DB + API)

```text
Выполни Stage 10 — DB + Repositories для intake:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_10_INTAKE_DB_API.md

Задачи S10.T01–S10.T10:
1) Создать SQL миграции для online_intake_requests / online_intake_answers / online_intake_attachments.
2) Создать репозитории + порты в webapp.
3) Создать service layer use-cases.
4) Создать API endpoints: patient submit + list; doctor/admin read + status-change.
5) Написать unit/integration тесты.
6) После S10.T09 прогони: pnpm run ci. Зафиксировать SHA в EXECUTION_LOG.

Ограничения:
- Не трогать in_person flow и integrator.
- Не изменять существующие миграции.
```

## STAGE 10 - AUDIT

```text
Проведи аудит Stage 10 — DB + Repositories:

Проверь:
1) Все три таблицы созданы с корректными FK/индексами.
2) Репозитории покрывают все use-cases из контракта.
3) API эндпоинты соответствуют API_CONTRACT_ONLINE_INTAKE_V1.md.
4) Авторизация: patient read own only; doctor/admin read all + status write.
5) Тесты покрывают happy path + authz + errors.
6) pnpm run ci green.

Формат: verdict + замечания.
```

## STAGE 10 - FIX

```text
Исправь замечания аудита Stage 10.
Обнови EXECUTION_LOG.md. Повтори pnpm run ci.
```

---

## STAGE 11 - EXEC

**Рекомендуемая модель:** Sonnet (compat-bridge)

```text
Выполни Stage 11 — Rubitime Compatibility Bridge (variant B: отдельного STAGE_11_*.md нет):
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md` — §Stage 11
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/README.md` — строка Stage 11 в таблице Stages 8–15
- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/COMPATIBILITY_RUBITIME_WEBAPP.md`

Контекст:
- Ручные записи в Rubitime должны появляться в patient_bookings.
- Источник: webhook -> integrator -> appointment_records -> compat-sync -> patient_bookings.
- Нельзя создавать дубли при повторных webhook.

Задачи S11.T01–S11.T12:
1) Расширить payload extraction в connector.ts.
2) Обогатить projection payload в writePort.ts.
3) Добавить mapping в webapp events.ts.
4) Расширить pgPatientBookings.upsertFromRubitime — добавить create compat-row при отсутствии.
5) Реализовать dedup + lifecycle mapping.
6) Написать тесты: create/update/dedup/cancel.
7) После S11.T11 прогони: pnpm run ci. Зафиксировать SHA.

Ограничения:
- Snapshot columns native bookings не перетираются.
- Source field = 'rubitime_projection' для compat-rows.
```

## STAGE 11 - AUDIT

```text
Проведи аудит Stage 11 — Rubitime Compatibility Bridge:

Проверь:
1) connector.ts извлекает branch/service/title/time поля из webhook.
2) pgPatientBookings.upsertFromRubitime создаёт compat-row при отсутствии rubitime_id.
3) Нет дублей при повторном webhook с тем же rubitime_id.
4) Cancel/update меняет status существующей записи.
5) Тесты покрывают все 4 сценария (create/update/dedup/cancel).
6) pnpm run ci green.
7) COMPATIBILITY_RUBITIME_WEBAPP.md DoD выполнен.

Формат: verdict + замечания с severity.
```

## STAGE 11 - FIX

```text
Исправь замечания аудита Stage 11.
Обнови EXECUTION_LOG.md. Повтори pnpm run ci.
```

---

## STAGE 12 - EXEC

**Рекомендуемая модель:** Sonnet (UI)

```text
Выполни Stage 12 — Patient Wizard Online:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_12_PATIENT_WIZARD_ONLINE.md

Контекст:
- Online format кнопки ведут в intake flow, а не в slots.
- LFK: форма с описанием + file attach + ссылки.
- Nutrition: пошаговый questionnaire engine.
- После submit: intake request создаётся через Stage 10 API.
- Patient history: intake requests отображаются в кабинете.

Задачи S12.T01–S12.T08:
1) Обновить FormatStepClient для online -> intake flow.
2) Создать LFK request page.
3) Создать nutrition questionnaire engine (draft persistence).
4) Валидация + submit UX.
5) Success state с четким messaging.
6) Patient history integration.
7) RTL тесты steps/validation/submit.
8) pnpm run ci. Зафиксировать SHA.

Ограничения:
- Не менять in_person wizard.
- Server/Client split сохранять.
```

## STAGE 12 - AUDIT

```text
Проведи аудит Stage 12 — Patient Wizard Online.

Проверь:
1) Online format button ведёт в /intake и не через /slot.
2) LFK форма: description required, attachments optional.
3) Nutrition: пошаговый flow с draft, все вопросы заданы.
4) Submit вызывает Stage 10 API, не старый Rubitime v1 API.
5) Patient cabinet показывает intake requests.
6) RTL тесты green.
7) pnpm run ci green.

Формат: verdict + замечания.
```

## STAGE 12 - FIX

```text
Исправь замечания аудита Stage 12.
Обнови EXECUTION_LOG.md. Повтори pnpm run ci.
```

---

## STAGE 13 - EXEC

**Рекомендуемая модель:** Sonnet (admin inbox)

```text
Выполни Stage 13 — Doctor/Admin Inbox:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_13_DOCTOR_ADMIN_INBOX.md

Задачи S13.T01–S13.T07:
1) Inbox list: список новых online заявок с фильтрами.
2) Request details page: полный просмотр анкеты/описания/вложений.
3) Status actions: in_review/contacted/closed с audit trail.
4) Notification bridge: уведомление врачу TG/MAX + deep-link.
5) Security: только doctor/admin доступ; patient read own only.
6) Тесты: API authz + UI smoke + status transitions.
7) pnpm run ci. Зафиксировать SHA.
```

## STAGE 13 - AUDIT

```text
Проведи аудит Stage 13 — Doctor/Admin Inbox.

Проверь:
1) Inbox list доступен только doctor/admin role.
2) Patient не может видеть чужие заявки.
3) Все три статуса переходят корректно с audit trail.
4) Уведомление отправляется в TG/MAX.
5) API authz тесты green.
6) pnpm run ci green.

Формат: verdict + замечания.
```

## STAGE 13 - FIX

```text
Исправь замечания аудита Stage 13.
Обнови EXECUTION_LOG.md. Повтори pnpm run ci.
```

---

## STAGE 14 - EXEC

**Рекомендуемая модель:** Sonnet (hardening)

```text
Выполни Stage 14 — Release Hardening:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_14_RELEASE_HARDENING.md

Задачи S14.T01–S14.T06:
1) Обновить CHECKLISTS.md release block с gates online intake + compat sync.
2) Обновить CUTOVER_RUNBOOK.md: последовательность включения compat-sync, мониторинг, rollback.
3) Документировать monitoring SQL-queries (count compat rows, duplicates, null fields, lag).
4) Rollback playbook: отключение compat-create feature switch.
5) Known limitations: best-effort поля, возможные null в legacy-origin данных.
6) Заполнить EXECUTION_LOG.md S14.*.
```

## STAGE 14 - AUDIT

```text
Проведи аудит Stage 14 — Release Hardening.

Проверь:
1) CUTOVER_RUNBOOK.md содержит compat-sync gate и порядок включения.
2) Monitoring queries документированы и корректны.
3) Rollback playbook понятен и исполним.
4) Known limitations задокументированы.

Формат: verdict + замечания.
```

## STAGE 14 - FIX

```text
Исправь замечания аудита Stage 14. Обнови EXECUTION_LOG.md.
```

---

## STAGE 15 - EXEC

**Рекомендуемая модель:** Sonnet (final)

```text
Выполни Stage 15 — Final Test/Audit/Release:
docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/STAGE_15_FINAL_TEST_AUDIT_RELEASE.md

Задачи S15.T01–S15.T08:
1) Расширить TEST_MATRIX.md: online-intake + rubitime-manual-booking.
2) Integrator test suite: webhook payload variants.
3) Webapp test suite: compat-create/update/dedup/history merge.
4) E2E smoke: in_person booking + online LFK submit + online nutrition submit + manual Rubitime -> patient history.
5) pnpm run ci. Зафиксировать финальный SHA.
6) Global audit по всем docs Stages 1–15.
7) Global fix (только scope аудита).
8) Final readiness log: ready/not-ready + blockers + SHA + дата.
```

## STAGE 15 - AUDIT (GLOBAL AUDIT)

```text
Проведи финальный глобальный аудит всего rework (Stages 1–15):

Обязательные документы:
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/README.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CHECKLISTS.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/EXECUTION_LOG.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/CUTOVER_RUNBOOK.md
- docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/COMPATIBILITY_RUBITIME_WEBAPP.md
- apps/integrator/src/integrations/rubitime/connector.ts
- apps/webapp/src/infra/repos/pgPatientBookings.ts
- apps/webapp/src/modules/integrator/events.ts

Проверь:
1) Все stages 1–15 завершены и залогированы в EXECUTION_LOG.md.
2) CI green на финальном SHA.
3) Online intake работает по новой модели (LFK + nutrition).
4) Ручные записи из Rubitime видны в patient history.
5) Нет дублей и lifecycle корректен.
6) legacy-off условия либо выполнены, либо явно задокументирован gate.

Формат:
- verdict: approve_for_merge | rework_required
- findings по severity
- mandatory fixes если rework
```

## STAGE 15 - FIX (GLOBAL FIX)

```text
Исправь замечания финального глобального аудита.
Только scope аудита, без нового функционала.
Обнови EXECUTION_LOG.md. Прогони pnpm run ci. Зафиксируй финальный SHA.
```

