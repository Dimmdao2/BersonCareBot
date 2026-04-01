# Мастер-план: Механика напоминаний

---

## Обзор стадий

```
STAGE 1  Контракты и схема              (1 день)    — спека, типы, миграции, API-контракты
STAGE 2  DB + Core-сервис webapp        (2 дня)     — миграции, порты, сервис, API
STAGE 3  Integrator: бот-уведомления    (2–3 дня)   — шаблоны, inline-кнопки, snooze/skip, фикс вопросов
STAGE 4  Webapp: пациентский UI         (3–4 дня)   — ЛФК-список, разминки, создание/управление
STAGE 5  Тест, аудит, релиз            (1–2 дня)   — тест-матрица, CI, чеклисты
```

**Суммарная оценка:** 9–12 дней.

---

## STAGE 1 — Контракты и схема

**Цель:** зафиксировать модель данных, API-контракты, формат inline-кнопок до начала кодирования.

**Исполнитель:** декомпозитор (Sonnet 4.6 / GPT 5.3)

| ID | Задача | Артефакт |
|----|--------|----------|
| S1.T01 | Расширить доменную модель `ReminderRule`: добавить `linked_object_type` (`lfk_complex` / `content_section` / `content_page` / `custom`), `linked_object_id`, `custom_title`, `custom_text` | Обновить `types.ts`, описать в спеке |
| S1.T02 | Спроектировать таблицу `reminder_journal` (пропуски, отложения, выполнения). Колонки: `rule_id`, `occurrence_id`, `action` (`done` / `skipped` / `snoozed`), `snooze_until`, `skip_reason`, `created_at` | SQL-миграция (draft) |
| S1.T03 | Расширить `reminder_occurrence_history`: добавить `snoozed_at`, `snoozed_until`, `skipped_at`, `skip_reason` | SQL-миграция (draft) |
| S1.T04 | Описать API-контракты для новых эндпоинтов webapp: `POST /api/patient/reminders/create`, `PATCH /api/patient/reminders/:id`, `DELETE /api/patient/reminders/:id`, `GET /api/patient/reminders/list`, `POST /api/patient/reminders/:id/snooze`, `POST /api/patient/reminders/:id/skip` | Markdown-спека |
| S1.T05 | Описать inline-keyboard layout бот-уведомлений: кнопки, callback_data format, snooze flow, skip → comment flow | Markdown-спека |
| S1.T06 | Описать UX фикса механизма вопросов: «Отправить ваш вопрос Дмитрию?» + да/нет inline-кнопки | Markdown-спека |
| S1.T07 | Описать формат deep link для открытия ЛФК-комплекса / раздела разминок из бота | Markdown-спека |

**Критерии готовности:**
- [ ] Все артефакты записаны в `STAGE_1_CONTRACTS.md`
- [ ] Миграции (draft) прошли ревью на бумаге
- [ ] API-контракты покрывают все user stories

---

## STAGE 2 — DB + Core-сервис (webapp)

**Цель:** реализовать backend — миграции, порты, сервис, API-хендлеры.

**Исполнитель:** auto-agent (Composer / Agent auto)

| ID | Задача | Файлы | Сложность |
|----|--------|-------|-----------|
| S2.T01 | Миграция `048_reminder_object_link.sql`: `ALTER reminder_rules ADD COLUMN linked_object_type, linked_object_id, custom_title, custom_text` | `apps/webapp/migrations/` | S |
| S2.T02 | Миграция `049_reminder_journal.sql`: таблица `reminder_journal` (rule_id, occurrence_id, action, snooze_until, skip_reason, created_at) + индексы | `apps/webapp/migrations/` | S |
| S2.T03 | Расширить `ReminderRule` type и `ReminderRulesPort`: добавить поля объекта, CRUD-методы (`create`, `delete`, `listByUser`) | `apps/webapp/src/modules/reminders/types.ts`, `ports.ts` | M |
| S2.T04 | Реализовать `pgReminderRules` — новые методы: `create`, `delete`, `listByPlatformUserWithObjects` | `apps/webapp/src/infra/repos/pgReminderRules.ts` | M |
| S2.T05 | Порт и repo для `reminder_journal`: `ReminderJournalPort` (`logAction`, `listByRule`, `statsForUser`) | Новые файлы в `modules/reminders/` и `infra/repos/` | M |
| S2.T06 | Расширить `createRemindersService`: методы `createObjectReminder`, `createCustomReminder`, `deleteReminder`, `snoozeOccurrence`, `skipOccurrence` | `apps/webapp/src/modules/reminders/service.ts` | L |
| S2.T07 | API route handlers: `POST create`, `PATCH :id`, `DELETE :id`, `POST :id/snooze`, `POST :id/skip` | `apps/webapp/src/app/api/patient/reminders/` | L |
| S2.T08 | Интегратор-facing API: `GET /api/integrator/reminders/rules` — расширить ответ полями объекта и deep link | `apps/webapp/src/app/api/integrator/reminders/` | S |
| S2.T09 | Wiring в `buildAppDeps.ts`: `reminderJournal`, расширенный `reminders` | `apps/webapp/src/app-layer/di/buildAppDeps.ts` | S |
| S2.T10 | Тесты сервиса: create/delete/snooze/skip | `apps/webapp/src/modules/reminders/service.test.ts` | M |

**Критерии готовности:**
- [ ] Миграции применяются без ошибок
- [ ] API-эндпоинты возвращают корректные ответы
- [ ] Тесты зелёные
- [ ] `pnpm run ci` зелёный

---

## STAGE 3 — Integrator: бот-уведомления

**Цель:** интерактивные уведомления в Telegram/MAX с inline-кнопками; фикс вопросов.

**Исполнитель:** auto-agent (Composer / Agent auto)

| ID | Задача | Файлы | Сложность |
|----|--------|-------|-----------|
| S3.T01 | Расширить шаблон напоминания: включить заголовок комплекса / разминки / произвольный текст, обложку (если поддерживается каналом) | `apps/integrator/src/content/telegram/user/templates.json` или handlers | M |
| S3.T02 | Inline-кнопки уведомления: `[Открыть видео]` (webapp deep link), `[Отложить ▾]` (submenu 30/60/120 мин), `[Пропущу сегодня]` | `apps/integrator/src/kernel/domain/executor/handlers/reminders.ts` | L |
| S3.T03 | Callback handler: `reminder_snooze:{occurrenceId}:{minutes}` — создать snoozed-запись, запланировать повторную отправку через N минут | Новый handler или расширение `reminders.ts` | L |
| S3.T04 | Callback handler: `reminder_skip:{occurrenceId}` — запросить причину (текстовый ввод), записать skip в журнал. **Не пересылать текст админу** (установить флаг `skipAdminForward` в контексте пользователя) | Handler + состояние пользователя | L |
| S3.T05 | Deep link формат: `{APP_BASE_URL}/app/patient/content/{slug}?from=reminder` для ЛФК; `{APP_BASE_URL}/app/patient/sections/warmups?from=reminder` для разминок | URL builder в handler | S |
| S3.T06 | **Фикс механизма вопросов:** при определении текста как вопроса — отправить «Отправить ваш вопрос Дмитрию?» с inline [Да] [Нет]. Если «Нет» — ничего не делать. Если «Да» — переслать. | `apps/integrator/src/kernel/domain/usecases/handleMessage.ts` или `supportRelay.ts` | M |
| S3.T07 | Убедиться, что при ожидании комментария пропуска текст **не** уходит админу (отключить `adminForward` для состояния `waiting_skip_reason`) | `handleMessage.ts` / `mapIn.ts` | S |
| S3.T08 | MAX-адаптация inline-кнопок (Telegram `callback_data` → MAX `payload`) | `apps/integrator/src/integrations/max/deliveryAdapter.ts` | S |
| S3.T09 | Тесты: snooze callback, skip callback, question confirmation | Тесты в `apps/integrator/` | M |

**Критерии готовности:**
- [ ] В Telegram/MAX приходит напоминание с 3 рядами кнопок
- [ ] Snooze корректно перепланирует
- [ ] Skip записывает причину, не пересылает админу
- [ ] «Отправить вопрос Дмитрию?» работает с да/нет
- [ ] `pnpm run ci` зелёный

---

## STAGE 4 — Webapp: пациентский UI

**Цель:** создание/управление напоминаниями из webapp — ЛФК, разминки, произвольные.

**Исполнитель:** auto-agent (Composer / Agent auto)

### Блок 4.A — ЛФК-список с напоминаниями (2 дня)

| ID | Задача | Файлы | Сложность |
|----|--------|-------|-----------|
| S4.T01 | Новый компонент `LfkComplexCard` — строка-карточка: обложка (фото), заголовок, описание, иконка 🔔 (bell) для создания/редактирования напоминания. Стиль похож на admin page-list, но строка выше и включает обложку | Новый компонент в `app/patient/diary/` или `shared/ui/` | M |
| S4.T02 | Список ЛФК-комплексов с `LfkComplexCard` вместо текущего view | Страница `diary?tab=lfk` или отдельная | M |
| S4.T03 | При клике на 🔔 — `ReminderCreateDialog`: выбор расписания (время, дни, интервал), выбор канала (Telegram / MAX), preview. Если напоминание уже есть — режим редактирования | Новый `ReminderCreateDialog.tsx` | L |
| S4.T04 | API-интеграция: `POST /api/patient/reminders/create` с `linked_object_type=lfk_complex`, `linked_object_id` | Client fetch | S |

### Блок 4.B — Разминки с напоминаниями (1 день)

| ID | Задача | Файлы | Сложность |
|----|--------|-------|-----------|
| S4.T05 | Кнопка «Напоминать сделать разминку» в разделе разминок (`/app/patient/sections/warmups`) → открывает `ReminderCreateDialog` с `linked_object_type=content_section`, `linked_object_id=warmups` | Страница разминок | S |
| S4.T06 | (v2, позже) Возможность выбрать конкретные страницы разминок — мульти-селект в диалоге. Пока MVP: одна кнопка на весь раздел | — | — |

### Блок 4.C — Произвольные напоминания и управление (1–2 дня)

| ID | Задача | Файлы | Сложность |
|----|--------|-------|-----------|
| S4.T07 | Кнопка «Создать напоминание» в разделе помощника / напоминаний → `ReminderCreateDialog` с `linked_object_type=custom`, ввод заголовка и текста | Страница `/app/patient/reminders` | M |
| S4.T08 | Единый список всех напоминаний (объектных + произвольных) с toggle, edit, delete. Иконка типа (ЛФК / разминка / произвольное) + название объекта | Расширить `ReminderRulesClient.tsx` | M |
| S4.T09 | Редактирование расписания из контекста: в ЛФК-детали и в разминках — кнопка «Изменить расписание» если напоминание уже привязано | `LfkComplexCard`, страница разминок | S |
| S4.T10 | Статистика и журнал: в карточке напоминания — мини-блок (выполнено / пропущено / отложено за 30 дней) + ссылка на полный журнал | `ReminderRulesClient.tsx` | M |

**Критерии готовности:**
- [ ] Из ЛФК-списка можно создать напоминание в 2 клика
- [ ] Из разминок можно создать напоминание в 1 клик
- [ ] Произвольное напоминание создаётся из раздела помощника
- [ ] Все напоминания видны и управляемы в едином списке
- [ ] Mobile-first: все диалоги — Sheet на мобильном, Dialog на десктопе
- [ ] `pnpm run ci` зелёный

---

## STAGE 5 — Тест, аудит, релиз

**Цель:** полное покрытие, чистый CI, готовность к деплою.

**Исполнитель:** auto-agent (тесты) + аудитор (GPT 5.3 Codex)

| ID | Задача | Сложность |
|----|--------|-----------|
| S5.T01 | Тест-матрица: webapp service tests (create/delete/snooze/skip), API route tests, integrator handler tests | M |
| S5.T02 | Проверка миграций: `pnpm run db:migrate` на чистой / существующей базе без ошибок | S |
| S5.T03 | Проверка inline-кнопок: mock Telegram update → callback → response (unit) | M |
| S5.T04 | Полный `pnpm run ci` | S |
| S5.T05 | Pre-release checklist | S |

**Критерии готовности:**
- [ ] Тест-матрица заполнена, все тесты зелёные
- [ ] `pnpm run ci` зелёный
- [ ] Чеклист подписан аудитором

---

## Сводная таблица

| Стадия | Задач | Оценка | Исполнитель |
|--------|-------|--------|-------------|
| S1 — Контракты | 7 | 1 дн | Декомпозитор (Sonnet 4.6) |
| S2 — DB + сервис | 10 | 2 дн | Auto-agent |
| S3 — Бот-уведомления | 9 | 2–3 дн | Auto-agent |
| S4 — Webapp UI | 10 | 3–4 дн | Auto-agent |
| S5 — Тест/релиз | 5 | 1–2 дн | Auto-agent + аудитор |
| **Итого** | **41** | **9–12 дн** | |

---

## Зависимости между стадиями

```
S1 ──→ S2 ──→ S3 ──→ S5
              ↘
              S4 ──→ S5
```

S3 и S4 могут идти параллельно после S2, но S3.T05 (deep links) нужен для S4.T01–T04.
S5 запускается только после завершения S3 и S4.

---

## Выбор моделей

| Этап | Модель | Обоснование |
|------|--------|-------------|
| S1 (контракты) | Sonnet 4.6 Opus | Глубокий анализ, проектирование модели |
| S2–S4 exec | Auto-agent (Composer 1.5) | Массовая реализация по чётким спекам |
| Промежуточный аудит | GPT 5.3 Codex | Оптимальное соотношение цена/качество |
| Фикс замечаний | Auto-agent (Composer 1.5) | Быстрые правки |
| Финальный аудит | GPT 5.3 Codex → эскалация на 5.4 при > 2 rework | Контроль качества |
