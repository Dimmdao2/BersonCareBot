# Промпты: Механика напоминаний — запуск, аудит, фиксы

Ниже готовые промпты. Копируй целиком, вставляй в указанную модель.

---

## Порядок выполнения

```
ШАГ  1  STAGE 1 EXEC         → Sonnet 4.6 Opus (новый чат)
ШАГ  2  STAGE 1 AUDIT        → GPT 5.3 Codex (новый чат)
ШАГ  3  STAGE 1 FIX          → Auto-agent (тот же чат что AUDIT или новый)

ШАГ  4  STAGE 2 EXEC         → Auto-agent (новый чат)
ШАГ  5  STAGE 2 AUDIT        → GPT 5.3 Codex (новый чат)
ШАГ  6  STAGE 2 FIX          → Auto-agent (тот же чат что AUDIT или новый)

ШАГ  7  STAGE 3 EXEC         → Auto-agent (новый чат)
ШАГ  8  STAGE 3 AUDIT        → GPT 5.3 Codex (новый чат)
ШАГ  9  STAGE 3 FIX          → Auto-agent (тот же чат что AUDIT или новый)

ШАГ 10  STAGE 4 EXEC (4.A)   → Auto-agent (новый чат)
ШАГ 11  STAGE 4 EXEC (4.B+C) → Auto-agent (тот же чат)
ШАГ 12  STAGE 4 AUDIT        → GPT 5.3 Codex (новый чат)
ШАГ 13  STAGE 4 FIX          → Auto-agent (тот же чат что AUDIT или новый)

ШАГ 14  STAGE 5 EXEC         → Auto-agent (новый чат)
ШАГ 15  GLOBAL AUDIT          → GPT 5.3 Codex (новый чат)
ШАГ 16  GLOBAL FIX            → Auto-agent (тот же чат)
```

**Принцип экономии:** аудит — отдельный чат (чистый контекст, без шума выполнения). Фикс — в том же чате что аудит (замечания уже в контексте) или в новом если контекст переполнен. Exec — новый чат (максимум контекста на задачу).

---

## STAGE 1 — EXEC (контракты и схема)

**Модель:** Sonnet 4.6 Opus  
**Чат:** новый

```text
Ты проектируешь расширение системы напоминаний для BersonCareBot.

Изучи документы:
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/README.md — контекст и цели
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md — мастер-план, стадия S1
- docs/BRANCH_UX_CMS_BOOKING/DECOMPOSITION_MODEL.md — шаблон задачи

Изучи существующий код:
- apps/webapp/src/modules/reminders/types.ts — текущие типы
- apps/webapp/src/modules/reminders/ports.ts — текущие порты
- apps/webapp/src/modules/reminders/service.ts — текущий сервис
- apps/webapp/migrations/010_reminders_content_access.sql — текущая схема
- apps/webapp/migrations/032_reminder_seen_status.sql
- apps/integrator/src/kernel/domain/executor/handlers/reminders.ts — integrator handler
- apps/integrator/src/content/telegram/user/templates.json — шаблоны бота
- apps/integrator/src/kernel/domain/usecases/handleMessage.ts — механизм вопросов
- apps/webapp/src/modules/lfk-exercises/ — ЛФК-модуль
- apps/webapp/src/infra/repos/pgContentSections.ts — контент-секции

Выполни задачи S1.T01–S1.T07 из PLAN.md:

1. Расширь доменную модель ReminderRule: linked_object_type, linked_object_id, custom_title, custom_text.
2. Спроектируй миграцию для расширения reminder_rules и новую таблицу reminder_journal.
3. Опиши API-контракты для всех новых эндпоинтов.
4. Опиши inline-keyboard layout бот-уведомлений (callback_data format, snooze flow, skip→comment flow).
5. Опиши UX фикса вопросов: «Отправить ваш вопрос Дмитрию?» + да/нет.
6. Опиши формат deep link для ЛФК-комплексов и разминок.

Результат запиши в:
docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md

Формат: для каждой задачи — полная спецификация по шаблону из DECOMPOSITION_MODEL.md.
Миграции — полный SQL (draft, не apply).
API — request/response JSON schema.
Inline keyboards — визуальная схема + callback_data format.

После всех задач обнови:
docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/EXECUTION_LOG.md
```

---

## STAGE 1 — AUDIT

**Модель:** GPT 5.3 Codex  
**Чат:** новый

```text
Проведи аудит выполненного этапа S1 (контракты и схема) для механики напоминаний.

Обязательные документы для изучения:
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md — план стадии S1
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md — результат выполнения
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/EXECUTION_LOG.md — лог
- apps/webapp/src/modules/reminders/types.ts — текущие типы (для сравнения)
- apps/webapp/migrations/010_reminders_content_access.sql — текущая схема

=== МОДЕЛЬ ПОВЕДЕНИЯ АУДИТОРА ===

Ты — строгий технический ревьюер. Твоя задача — найти проблемы ДО того, как код будет написан.

ОБЯЗАТЕЛЬНЫЕ ПРОВЕРКИ (выполни каждую, отметь ✅ или ❌):

1. ПОЛНОТА (coverage):
   - [ ] Все 7 задач S1.T01–S1.T07 имеют артефакты
   - [ ] Каждый user story из README.md покрыт контрактом
   - [ ] Нет «слепых зон» — действий пользователя без описанного API/flow

2. СОГЛАСОВАННОСТЬ (consistency):
   - [ ] Новые поля в types.ts совместимы с текущей схемой reminder_rules
   - [ ] Миграции ALTER не ломают существующие данные (nullable, defaults)
   - [ ] API-контракты используют те же имена полей, что и типы
   - [ ] callback_data формат уникален и не конфликтует с существующими

3. БЕЗОПАСНОСТЬ (security):
   - [ ] Все patient API требуют аутентификации
   - [ ] Нельзя управлять чужими напоминаниями (ownership check)
   - [ ] Skip reason comment не пересылается админу (явно описано)

4. ТЕХНИЧЕСКАЯ КОРРЕКТНОСТЬ (correctness):
   - [ ] SQL миграции идемпотентны (IF NOT EXISTS / IF EXISTS)
   - [ ] Индексы покрывают частые запросы (listByUser, dueOccurrences)
   - [ ] Deep link формат корректен для Telegram WebApp и MAX
   - [ ] Snooze перепланирование не создаёт дубли

5. UX (user experience):
   - [ ] Inline keyboard не превышает лимиты Telegram (8 кнопок в ряду, 100 кнопок всего)
   - [ ] Snooze flow не требует больше 2 кликов
   - [ ] Skip flow: вопрос причины → ответ → подтверждение (не бесконечный цикл)
   - [ ] Фикс вопросов: «Нет» → ничего не делать (не отправлять, не спрашивать заново)

ФОРМАТ ВЫВОДА:

verdict: approve | rework

Для каждого замечания:
- [severity: critical | major | minor]
- Задача: S1.TXX
- Что не так: конкретное описание
- Как исправить: конкретное действие
- Файл (если применимо): путь

ПРАВИЛА:
- critical = блокер, нельзя продолжать без исправления
- major = серьёзная проблема, нужно исправить до exec S2
- minor = улучшение, можно исправить позже
- Если ≥1 critical → verdict: rework
- Если only minor → verdict: approve (замечания зафиксировать для S2)
```

---

## STAGE 1 — FIX

**Модель:** Auto-agent (Composer / тот же чат что AUDIT или новый)

```text
Исправь замечания аудита для стадии S1 (контракты и схема).

Вход:
- Последний audit-report (verdict=rework, список замечаний).
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md

Сделай:
1. Исправь все замечания severity critical и major.
2. Зафиксируй minor-замечания как TODO в STAGE_1_CONTRACTS.md.
3. Не меняй scope — только исправляй указанные проблемы.
4. Обнови EXECUTION_LOG.md.

Результат:
- Список «замечание → исправление» для каждого пункта.
```

---

## STAGE 2 — EXEC (DB + Core-сервис)

**Модель:** Auto-agent (Composer)  
**Чат:** новый

```text
Выполни стадию S2 строго по документам:
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md — задачи S2.T01–S2.T10
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md — контракты и схемы

Контекст проекта:
- docs/BRANCH_UX_CMS_BOOKING/DECOMPOSITION_MODEL.md — шаблон задачи
- ARCHITECTURE.md — конвенции

Существующий код (обязательно изучи перед изменениями):
- apps/webapp/src/modules/reminders/ — весь модуль
- apps/webapp/src/infra/repos/pgReminderRules.ts
- apps/webapp/src/app-layer/di/buildAppDeps.ts
- apps/webapp/src/app/api/patient/reminders/ — текущие API routes
- apps/webapp/src/app/api/integrator/reminders/ — integrator-facing API

Задачи:
1. Создай миграции (S2.T01, S2.T02) — SQL файлы в apps/webapp/migrations/.
2. Расширь types.ts и ports.ts (S2.T03).
3. Реализуй новые методы в pgReminderRules.ts (S2.T04).
4. Создай ReminderJournalPort и pgReminderJournal.ts (S2.T05).
5. Расширь сервис (S2.T06): createObjectReminder, createCustomReminder, deleteReminder, snoozeOccurrence, skipOccurrence.
6. Создай API route handlers (S2.T07): POST create, PATCH :id, DELETE :id, POST :id/snooze, POST :id/skip.
7. Расширь integrator-facing API (S2.T08).
8. Обнови buildAppDeps.ts (S2.T09).
9. Напиши тесты сервиса (S2.T10).

Правила:
- Следуй конвенциям проекта: порты в modules/, адаптеры в infra/repos/, routes в app/api/.
- Миграции идемпотентны (IF NOT EXISTS).
- После всех задач: pnpm run ci.
- Коммит каждой задачи: [S2.TXX] описание.
- Обнови docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/EXECUTION_LOG.md.
```

---

## STAGE 2 — AUDIT

**Модель:** GPT 5.3 Codex  
**Чат:** новый

```text
Проведи аудит стадии S2 (DB + Core-сервис) для механики напоминаний.

Обязательные документы:
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md — задачи S2
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md — контракты
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/EXECUTION_LOG.md — лог

Обязательный код для проверки:
- apps/webapp/migrations/050_*.sql, 051_*.sql — новые миграции напоминаний
- apps/webapp/src/modules/reminders/ — types, ports, service
- apps/webapp/src/infra/repos/pgReminderRules.ts
- apps/webapp/src/infra/repos/pgReminderJournal.ts (новый)
- apps/webapp/src/app/api/patient/reminders/ — все route.ts
- apps/webapp/src/app-layer/di/buildAppDeps.ts
- apps/webapp/src/modules/reminders/service.test.ts
- git diff для всех изменённых файлов

=== МОДЕЛЬ ПОВЕДЕНИЯ АУДИТОРА ===

Ты проверяешь РЕАЛИЗАЦИЮ backend-кода. Фокус — корректность, безопасность, соответствие контрактам.

ОБЯЗАТЕЛЬНЫЕ ПРОВЕРКИ (каждую отметь ✅ или ❌):

1. МИГРАЦИИ:
   - [ ] SQL синтаксис корректен
   - [ ] ALTER TABLE с IF NOT EXISTS / IF EXISTS
   - [ ] Новые колонки nullable или с default (не ломают существующие строки)
   - [ ] Индексы покрывают: listByUser, listByRuleId, dueOccurrences
   - [ ] Нет DROP без IF EXISTS
   - [ ] Порядок миграций не конфликтует с существующими (номера 050, 051; 048/049 в репо заняты)

2. ТИПЫ И ПОРТЫ:
   - [ ] Новые поля в ReminderRule backward-compatible (optional)
   - [ ] ReminderJournalPort покрывает: logAction, listByRule, statsForUser
   - [ ] Экспорты корректны (нет circular deps)

3. СЕРВИС:
   - [ ] createObjectReminder валидирует linked_object_type и linked_object_id
   - [ ] createCustomReminder валидирует custom_title (не пустой)
   - [ ] deleteReminder проверяет ownership (только свои)
   - [ ] snoozeOccurrence создаёт запись в journal + перепланирует
   - [ ] skipOccurrence создаёт запись с skip_reason, НЕ делает admin forward
   - [ ] Ошибки возвращаются как { ok: false, error: string }, не throw

4. API ROUTES:
   - [ ] Все routes требуют requirePatientAccess или аналог
   - [ ] Input validation (zod или ручная) для всех POST/PATCH
   - [ ] Корректные HTTP-статусы (201 create, 200 update, 204 delete, 404 not found)
   - [ ] Нет SQL injection (параметризованные запросы)
   - [ ] revalidatePath после мутаций

5. BUILDAPPDEPS:
   - [ ] reminderJournal порт создаётся и передаётся в сервис
   - [ ] Нет сломанных зависимостей

6. ТЕСТЫ:
   - [ ] Покрытие: create, delete, snooze, skip, listByUser
   - [ ] Тесты не зависят от внешних сервисов (моки)
   - [ ] Edge cases: duplicate create, delete non-existent, snooze expired

7. CI:
   - [ ] pnpm run ci зелёный (проверить EXECUTION_LOG)

ФОРМАТ — аналогичный Stage 1 audit. verdict: approve | rework. Замечания по severity.
```

---

## STAGE 2 — FIX

**Модель:** Auto-agent  
**Чат:** тот же что AUDIT или новый

```text
Исправь замечания аудита для стадии S2 (DB + Core-сервис).

Вход:
- Последний audit-report по S2.
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md

Правила:
1. Исправь все critical и major замечания.
2. Не расширяй scope стадии.
3. После исправлений: pnpm run ci.
4. Обнови EXECUTION_LOG.md.
5. Коммит: [S2.fix] address audit remarks.

Вывод:
- Чеклист «замечание → исправление → подтверждение».
```

---

## STAGE 3 — EXEC (бот-уведомления)

**Модель:** Auto-agent (Composer)  
**Чат:** новый

```text
Выполни стадию S3 строго по документам:
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md — задачи S3.T01–S3.T09
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md — контракты (inline keyboard layout, callback_data format, deep links, question fix UX)

Существующий код (обязательно изучи):
- apps/integrator/src/kernel/domain/executor/handlers/reminders.ts
- apps/integrator/src/content/telegram/user/templates.json
- apps/integrator/src/kernel/domain/usecases/handleMessage.ts
- apps/integrator/src/kernel/domain/usecases/handleUpdate.ts
- apps/integrator/src/kernel/domain/executor/handlers/supportRelay.ts
- apps/integrator/src/integrations/telegram/deliveryAdapter.ts
- apps/integrator/src/integrations/max/deliveryAdapter.ts
- apps/integrator/src/infra/runtime/scheduler/main.ts
- apps/integrator/src/kernel/contracts/events.ts

Задачи:
1. S3.T01: Расширь шаблон напоминания — заголовок комплекса/разминки/произвольный, deep link.
2. S3.T02: Добавь inline-кнопки: [Открыть видео] [Отложить 30м] [Отложить 60м] [Отложить 120м] [Пропущу сегодня]. Layout по контракту из STAGE_1_CONTRACTS.
3. S3.T03: Callback handler reminder_snooze — создать snoozed-запись, перепланировать отправку.
4. S3.T04: Callback handler reminder_skip — запросить причину текстом, записать skip. НЕ ПЕРЕСЫЛАТЬ ТЕКСТ АДМИНУ. Установить флаг в контексте пользователя, чтобы handleMessage не делал adminForward.
5. S3.T05: Deep link builder — формат URL для ЛФК-комплексов и разминок.
6. S3.T06: ФИКС МЕХАНИЗМА ВОПРОСОВ. При определении текста как вопроса → отправить «Отправить ваш вопрос Дмитрию?» с inline-кнопками [Да] [Нет] в один ряд. Если «Нет» → ничего не делать (не переспрашивать). Если «Да» → переслать вопрос. Найди правильное место в handleMessage.ts или supportRelay.ts.
7. S3.T07: Убедись, что при ожидании skip_reason текст НЕ уходит админу.
8. S3.T08: MAX-адаптация inline-кнопок.
9. S3.T09: Тесты.

Правила:
- Не ломай существующие reminder categories (appointment, lfk, chat, important, broadcast).
- Callback data format: `rem_snooze:{occurrenceId}:{minutes}`, `rem_skip:{occurrenceId}`, `rem_open:{ruleId}`.
  Или по формату из STAGE_1_CONTRACTS.md если он отличается.
- pnpm run ci после всех задач.
- Коммит: [S3.TXX] описание.
- Обнови EXECUTION_LOG.md.
```

---

## STAGE 3 — AUDIT

**Модель:** GPT 5.3 Codex  
**Чат:** новый

```text
Проведи аудит стадии S3 (бот-уведомления) для механики напоминаний.

Обязательные документы:
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md — задачи S3
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md — контракты
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/EXECUTION_LOG.md

Обязательный код:
- apps/integrator/src/kernel/domain/executor/handlers/reminders.ts
- apps/integrator/src/kernel/domain/usecases/handleMessage.ts (фикс вопросов)
- apps/integrator/src/integrations/telegram/deliveryAdapter.ts
- apps/integrator/src/integrations/max/deliveryAdapter.ts
- Все новые/изменённые файлы из EXECUTION_LOG
- git diff для стадии

=== МОДЕЛЬ ПОВЕДЕНИЯ АУДИТОРА ===

Фокус — корректность бот-взаимодействия, безопасность, UX.

ОБЯЗАТЕЛЬНЫЕ ПРОВЕРКИ:

1. INLINE KEYBOARDS:
   - [ ] Layout соответствует контракту из STAGE_1_CONTRACTS
   - [ ] callback_data ≤ 64 байт (лимит Telegram)
   - [ ] Не более 8 кнопок в ряду, не более 100 кнопок всего
   - [ ] Кнопки не дублируются
   - [ ] Deep link URL корректен и включает https://

2. SNOOZE FLOW:
   - [ ] Snooze корректно перепланирует (next_try_at += minutes)
   - [ ] Нет дублей (идемпотентность по occurrence_id + action)
   - [ ] Подтверждение пользователю после snooze (edit message или новое сообщение)
   - [ ] Snoozed occurrence НЕ считается пропуском

3. SKIP FLOW:
   - [ ] Skip помечает occurrence как skipped
   - [ ] Запрашивает причину ТЕКСТОМ (не inline-кнопкой)
   - [ ] Текст причины НЕ пересылается админу — КРИТИЧНО
   - [ ] После получения причины — подтверждение и возврат в нормальный режим
   - [ ] Если пользователь не отвечает на запрос причины — timeout / отмена (не зависает)

4. ФИКС ВОПРОСОВ:
   - [ ] «Отправить ваш вопрос Дмитрию?» + [Да] [Нет] в один ряд
   - [ ] «Нет» → ничего не делать, вернуть управление
   - [ ] «Да» → переслать вопрос
   - [ ] Не сломан существующий support relay
   - [ ] Не сломан существующий admin forward

5. MAX СОВМЕСТИМОСТЬ:
   - [ ] Inline-кнопки конвертируются корректно (callback_data → payload)
   - [ ] Deep link URL корректен для MAX WebView
   - [ ] Нет Telegram-only API вызовов без MAX fallback

6. ТЕСТЫ:
   - [ ] Покрытие: snooze callback, skip callback, question yes/no
   - [ ] Моки корректны (не зависят от реального бота)

7. CI:
   - [ ] pnpm run ci зелёный

ФОРМАТ: verdict + замечания по severity.
```

---

## STAGE 3 — FIX

**Модель:** Auto-agent  
**Чат:** тот же что AUDIT или новый

```text
Исправь замечания аудита для стадии S3 (бот-уведомления).

Вход: последний audit-report по S3.

Правила:
1. Исправь critical и major.
2. ОСОБОЕ ВНИМАНИЕ: если аудит нашёл, что skip_reason может утечь админу — это critical, исправь в первую очередь.
3. Не расширяй scope.
4. pnpm run ci.
5. Обнови EXECUTION_LOG.md.
6. Коммит: [S3.fix] address audit remarks.
```

---

## STAGE 4 — EXEC (блок 4.A: ЛФК-список)

**Модель:** Auto-agent (Composer)  
**Чат:** новый

```text
Выполни блок 4.A стадии S4 (ЛФК-список с напоминаниями):
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md — задачи S4.T01–S4.T04

Существующий код (обязательно изучи):
- apps/webapp/src/app/app/patient/diary/ — текущая страница дневника (tab ЛФК)
- apps/webapp/src/modules/diaries/ — diaries module
- apps/webapp/src/modules/lfk-exercises/ — ЛФК exercises
- apps/webapp/src/modules/lfk-templates/ — ЛФК templates
- apps/webapp/src/modules/lfk-assignments/ — ЛФК assignments
- apps/webapp/src/modules/reminders/ — расширенный модуль напоминаний (после S2)
- apps/webapp/src/app/api/patient/reminders/ — API (после S2)
- apps/webapp/src/shared/ui/ — существующие UI-компоненты

Задачи:
1. S4.T01: Компонент LfkComplexCard — строка-карточка с обложкой (фото), заголовком, описанием, иконкой 🔔.
   Стиль: похож на admin page-list (как глаз-иконка у страниц), но строка выше и включает фото-обложку.
   Bell-иконка: если напоминание есть — залитый колокольчик (активный цвет), если нет — outline.
2. S4.T02: Список ЛФК-комплексов с LfkComplexCard.
3. S4.T03: ReminderCreateDialog — диалог создания/редактирования напоминания.
   Desktop: Dialog (shadcn). Mobile: Sheet (shadcn).
   Поля: расписание (время, дни недели, интервал), канал (Telegram/MAX).
   Если напоминание уже есть — режим редактирования (prefill).
4. S4.T04: Интеграция с API POST /api/patient/reminders/create.

Правила:
- Mobile-first.
- Используй shadcn/ui компоненты (Button, Card, Dialog, Sheet, Badge, Switch).
- Не ломай существующий дневник (diary tabs).
- pnpm run ci после блока.
- Коммит: [S4.TXX] описание.
- Обнови EXECUTION_LOG.md.
```

---

## STAGE 4 — EXEC (блоки 4.B + 4.C)

**Модель:** Auto-agent (Composer)  
**Чат:** тот же или новый

```text
Выполни блоки 4.B и 4.C стадии S4:
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md — задачи S4.T05–S4.T10

Существующий код (обязательно изучи):
- apps/webapp/src/app/app/patient/sections/[slug]/page.tsx — динамическая секция
- apps/webapp/src/app/app/patient/reminders/ — текущая страница напоминаний
- apps/webapp/src/app/app/patient/reminders/ReminderRulesClient.tsx
- Компоненты из блока 4.A (LfkComplexCard, ReminderCreateDialog)

Задачи блока 4.B:
1. S4.T05: Кнопка «Напоминать сделать разминку» в /app/patient/sections/warmups.
   При клике → открывает ReminderCreateDialog с linked_object_type=content_section, linked_object_id=warmups.
   MVP: одна кнопка на весь раздел (не выбор отдельных страниц).

Задачи блока 4.C:
2. S4.T07: Кнопка «Создать напоминание» в /app/patient/reminders → ReminderCreateDialog с linked_object_type=custom.
3. S4.T08: Единый список всех напоминаний (объектных + произвольных). Иконка типа + название + toggle + schedule + delete.
4. S4.T09: Кнопка «Изменить расписание» в ЛФК-детали и разминках (если напоминание привязано).
5. S4.T10: Мини-статистика в карточке: выполнено/пропущено/отложено за 30 дней.

Правила:
- Mobile-first.
- Переиспользуй ReminderCreateDialog из 4.A.
- pnpm run ci.
- Коммит: [S4.TXX] описание.
- Обнови EXECUTION_LOG.md.
```

---

## STAGE 4 — AUDIT

**Модель:** GPT 5.3 Codex  
**Чат:** новый

```text
Проведи аудит стадии S4 (Webapp UI) для механики напоминаний.

Обязательные документы:
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md — задачи S4
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md — контракты
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/EXECUTION_LOG.md

Обязательный код:
- Все новые/изменённые компоненты из EXECUTION_LOG
- apps/webapp/src/app/app/patient/diary/ — ЛФК tab
- apps/webapp/src/app/app/patient/sections/ — разминки
- apps/webapp/src/app/app/patient/reminders/ — управление
- git diff стадии

=== МОДЕЛЬ ПОВЕДЕНИЯ АУДИТОРА ===

Фокус — UX, мобильная адаптивность, корректность интеграции с backend.

ОБЯЗАТЕЛЬНЫЕ ПРОВЕРКИ:

1. КОМПОНЕНТЫ:
   - [ ] LfkComplexCard: обложка отображается, fallback если нет фото
   - [ ] Bell-иконка: визуально различается active/inactive
   - [ ] ReminderCreateDialog: Sheet на mobile, Dialog на desktop
   - [ ] Все формы валидируют ввод (время, дни — не пустые)

2. ИНТЕГРАЦИЯ С API:
   - [ ] POST /api/patient/reminders/create вызывается с корректным payload
   - [ ] Error handling: показать пользователю ошибку, не crash
   - [ ] Optimistic updates или loading state

3. НАВИГАЦИЯ:
   - [ ] Кнопка «Напоминать разминку» не ломает секцию warmups
   - [ ] «Создать напоминание» доступна из /app/patient/reminders
   - [ ] «Изменить расписание» видна только если напоминание уже есть
   - [ ] Нет битых ссылок

4. СТИЛЬ:
   - [ ] LfkComplexCard: стиль похож на admin page-list, но с фото
   - [ ] Единообразие с существующими компонентами проекта
   - [ ] Нет inline styles (tailwind classes)
   - [ ] Dark mode если проект поддерживает (проверить)

5. АДАПТИВНОСТЬ:
   - [ ] Карточки ЛФК: корректно на 320px–768px–1024px
   - [ ] Диалог создания: полноэкранный Sheet на mobile
   - [ ] Список напоминаний: читаем на узком экране

6. РЕГРЕССИИ:
   - [ ] Дневник (diary tabs) работает как раньше
   - [ ] Секции контента не сломаны
   - [ ] Существующие напоминания (appointment, lfk, chat, important, broadcast) отображаются

7. CI:
   - [ ] pnpm run ci зелёный

ФОРМАТ: verdict + замечания по severity.
```

---

## STAGE 4 — FIX

**Модель:** Auto-agent

```text
Исправь замечания аудита стадии S4 (Webapp UI).

Вход: последний audit-report по S4.

Правила:
1. Исправь critical и major.
2. Не ломай существующий UI.
3. pnpm run ci.
4. Обнови EXECUTION_LOG.md.
5. Коммит: [S4.fix] address audit remarks.
```

---

## STAGE 5 — EXEC (тесты и предрелиз)

**Модель:** Auto-agent  
**Чат:** новый

```text
Выполни стадию S5 (тест и предрелиз) по:
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md — задачи S5.T01–S5.T05

Задачи:
1. S5.T01: Заполни тест-матрицу — таблица: тест-кейс / модуль / статус / файл теста.
   Обязательные кейсы:
   - webapp: create object reminder, create custom reminder, delete, snooze, skip, listByUser, stats
   - integrator: snooze callback, skip callback, skip reason without admin forward, question confirm yes/no
   - API: auth required, ownership check, validation errors

2. S5.T02: Проверь миграции: pnpm run db:migrate на dev-базе.

3. S5.T03: Допиши недостающие тесты из матрицы.

4. S5.T04: Полный pnpm run ci.

5. S5.T05: Заполни pre-release checklist в EXECUTION_LOG.md:
   - [ ] Все миграции применяются
   - [ ] Все тесты зелёные
   - [ ] CI зелёный
   - [ ] Нет TODO/FIXME/HACK без комментария
   - [ ] Нет console.log в production-коде
   - [ ] Нет hardcoded secrets
   - [ ] Inline-кнопки ≤ 64 байт callback_data
   - [ ] Skip reason не утекает админу

Обнови EXECUTION_LOG.md.
Коммит: [S5] tests and pre-release checklist.
```

---

## GLOBAL AUDIT (после всех стадий)

**Модель:** GPT 5.3 Codex (эскалация на 5.4 при > 2 rework на любой стадии)  
**Чат:** новый

```text
Проведи финальный аудит всей фазы «Механика напоминаний».

Обязательные документы:
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/README.md
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/PLAN.md
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/STAGE_1_CONTRACTS.md
- docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/EXECUTION_LOG.md
- Все аудиты стадий (в EXECUTION_LOG или отдельных файлах)

Обязательный код:
- git diff main...HEAD (или git log --oneline для коммитов фазы)
- apps/webapp/src/modules/reminders/ — весь модуль
- apps/webapp/migrations/050_*.sql, 051_*.sql
- apps/integrator/src/kernel/domain/executor/handlers/reminders.ts
- apps/integrator/src/kernel/domain/usecases/handleMessage.ts
- Все новые компоненты webapp

=== МОДЕЛЬ ПОВЕДЕНИЯ ФИНАЛЬНОГО АУДИТОРА ===

Ты — gate-keeper перед merge в main. Твоя задача — не пропустить проблемы, которые дорого исправлять в production.

УРОВЕНЬ 1: КРИТИЧЕСКИЕ ПРОВЕРКИ (блокеры merge)

1. БЕЗОПАСНОСТЬ:
   - [ ] Все patient API требуют аутентификации
   - [ ] Ownership check: пользователь управляет ТОЛЬКО своими напоминаниями
   - [ ] Skip reason текст НЕ пересылается админу ни в каком пути кода
   - [ ] Нет SQL injection (параметризованные запросы во всех repos)
   - [ ] Нет XSS в custom_title / custom_text (sanitize/escape при рендере)
   - [ ] HMAC-подпись на integrator-facing API не ослаблена

2. ЦЕЛОСТНОСТЬ ДАННЫХ:
   - [ ] Миграции не ломают существующие reminder_rules (ALTER ADD COLUMN nullable)
   - [ ] DELETE reminder каскадно чистит journal/occurrences или использует soft delete
   - [ ] Snooze не создаёт дубли occurrences
   - [ ] Concurrent snooze/skip на одну occurrence — корректное поведение (не crash)

3. РЕГРЕССИИ:
   - [ ] Существующие 5 категорий (appointment, lfk, chat, important, broadcast) работают
   - [ ] Scheduler integrator не сломан
   - [ ] Diary tabs не сломаны
   - [ ] Content sections не сломаны
   - [ ] Support relay не сломан (фикс вопросов не ломает обычный relay)
   - [ ] Admin forward для обычных сообщений работает

УРОВЕНЬ 2: ФУНКЦИОНАЛЬНЫЕ ПРОВЕРКИ

4. END-TO-END FLOWS:
   - [ ] Создание объектного напоминания (ЛФК) → integrator получает → scheduler отправляет → бот доставляет с кнопками
   - [ ] Snooze → повторная доставка через N минут
   - [ ] Skip → запрос причины → запись в журнал → НЕ отправка админу
   - [ ] Создание произвольного напоминания → доставка с custom текстом
   - [ ] «Отправить вопрос Дмитрию?» → «Да» → forwarded / «Нет» → ничего

5. UI/UX:
   - [ ] LfkComplexCard с обложкой и bell-иконкой
   - [ ] ReminderCreateDialog: mobile Sheet / desktop Dialog
   - [ ] Единый список в /app/patient/reminders
   - [ ] Мини-статистика в карточке

УРОВЕНЬ 3: КАЧЕСТВО КОДА

6. СТАНДАРТЫ:
   - [ ] Нет TODO/FIXME/HACK без issue/комментария
   - [ ] Нет console.log в production-коде (только console.warn/error для реальных ошибок)
   - [ ] Нет unused imports
   - [ ] Нет hardcoded strings (используются i18n-ключи или константы)
   - [ ] Тесты покрывают основные сценарии

7. CI:
   - [ ] pnpm run ci зелёный
   - [ ] Нет новых lint-warnings

ФОРМАТ РЕЗУЛЬТАТА:

final_verdict: approve_for_merge | rework_required

Для каждого замечания:
- [severity: critical | major | minor]
- Категория: security / data / regression / ux / code_quality
- Описание
- Как исправить
- Файл и строка (если применимо)

ПРАВИЛА ВЫНЕСЕНИЯ ВЕРДИКТА:
- ≥1 critical → rework_required (обязательные правки)
- ≥3 major → rework_required
- Only major (1-2) + minor → approve_for_merge с обязательным списком правок
- Only minor → approve_for_merge
```

---

## GLOBAL FIX (после финального аудита)

**Модель:** Auto-agent  
**Чат:** тот же что GLOBAL AUDIT или новый

```text
Исправь все замечания финального аудита фазы «Механика напоминаний».

Вход: последний GLOBAL AUDIT report.

Scope:
- Только замечания из аудита.
- Без нового функционала.

Порядок:
1. Исправь все critical замечания.
2. Исправь все major замечания.
3. Minor — по возможности.
4. После исправлений: pnpm run ci.
5. Обнови EXECUTION_LOG.md.
6. Коммит: [reminders.final-fix] address global audit remarks.

Отчёт:
- Таблица: замечание → исправление → подтверждение (тест/CI/ручная проверка).
```

---

## Справка: Модель поведения аудитора (общая для всех аудитов)

Эта секция описывает правила для ВСЕХ промежуточных и финального аудитов. Не нужно каждый раз описывать заново — правила уже встроены в каждый audit-промпт выше. Здесь — сводка для понимания.

### Принципы

1. **Чеклист обязателен.** Каждая проверка — явная строка `[ ]` в отчёте. Пропущенная проверка = пропущенный баг.

2. **Severity строга.**
   - `critical` = данные могут потеряться, безопасность нарушена, или feature не работает. Блокер.
   - `major` = функционал работает, но неправильно, или UX серьёзно пострадал. Нужно исправить.
   - `minor` = стиль, naming, edge case. Можно исправить позже.

3. **Verdict однозначен.** Никаких «скорее approve». Либо approve, либо rework с конкретным списком.

4. **Замечания конкретны.** Каждое замечание указывает: файл, что не так, как исправить. Без абстракций типа «улучшить обработку ошибок».

5. **Аудитор НЕ дописывает код.** Только описывает проблему и путь решения. Исполнитель (FIX) реализует.

6. **Контекст аудита — diff, не весь проект.** Аудитор проверяет ИЗМЕНЕНИЯ стадии, а не весь код проекта. Существующие проблемы вне scope стадии → отдельный minor-замечание «pre-existing issue, out of scope».

7. **Экскалация.** Если на одной стадии > 2 rework → в следующем аудите использовать более строгую модель (5.4 вместо 5.3). Это защита от циклических правок.

### Что аудитор НЕ делает

- Не предлагает новый функционал
- Не меняет API-контракты (только указывает несоответствия)
- Не переписывает архитектуру
- Не добавляет задачи за пределами scope стадии
