## Архив исходного плана

# Этап 12: Напоминания (Reminders)

> Приоритет: P2  
> Зависимости: Этап 6 (дневники), существующая projection-схема `reminder_rules`/`reminder_occurrence_history`  
> Риск: средний (согласованность webapp projection и integrator)

---

## Шаг 12.1: Привести модуль reminders к рабочему сервису (убрать MVP stub)

1. **Цель шага**  
   Заменить заглушки в `modules/reminders/service.ts` на реальные операции чтения и обновления правил.
2. **Точная область изменений**  
   Только `apps/webapp/src/modules/reminders/service.ts`, новый порт `apps/webapp/src/modules/reminders/ports.ts`, адаптер `apps/webapp/src/infra/repos/pgReminderRules.ts` (новый), `buildAppDeps.ts`.
3. **Конкретные действия**  
   - Добавить контракт сервиса: `listRulesByIntegratorUserId`, `getRuleByCategory`, `toggleRuleEnabled`, `updateRuleSchedule`.  
   - Не смешивать это с projection-ingest: чтение/запись пользовательских настроек только через новый порт rules.  
   - Сохранить текущую `validateReminderDispatchPayload` как отдельную функцию в модуле dispatch-validation.
4. **Проверки после шага**  
   - `buildAppDeps` поднимается без ошибок.  
   - Сервис возвращает правила для существующего `integratorUserId`.
5. **Критерий успешного выполнения**  
   `modules/reminders/service.ts` больше не возвращает пустой массив-заглушку.
6. **Тесты**  
   - Полностью обновить `apps/webapp/src/modules/reminders/service.test.ts` под новый API сервиса.  
   - Добавить integration тест для `pgReminderRules` (чтение и update).  
   - E2E не требуется на этом шаге.
7. **Обновление документации**  
   Обновить `apps/webapp/src/modules/reminders/reminders.md` с актуальным портом и зонами ответственности.

---

## Шаг 12.2: Добавить patient-экран управления правилами напоминаний

1. **Цель шага**  
   Вынести настройку напоминаний в отдельный экран, не смешивая с каналами уведомлений на странице `/app/patient/notifications`.
2. **Точная область изменений**  
   Только `apps/webapp/src/app/app/patient/reminders/page.tsx` (новый), `apps/webapp/src/app/app/patient/reminders/actions.ts` (новый), `apps/webapp/src/app-layer/routes/paths.ts`, `apps/webapp/src/shared/ui/PatientHeader.tsx` (меню-ссылка).
3. **Конкретные действия**  
   - Добавить route `/app/patient/reminders` и `routePaths.patientReminders`.  
   - На странице показать список категорий из `reminder_rules` и управление: enabled, interval, window, days_mask.  
   - Обновления выполнять через server actions, строго валидируя диапазоны (`interval_minutes`, `window_start_minute`, `window_end_minute`).
4. **Проверки после шага**  
   - Правила загружаются при открытии страницы.  
   - Изменение любой настройки сохраняется и видно после reload.
5. **Критерий успешного выполнения**  
   Пациент может включать/выключать и настраивать расписание напоминаний в отдельном экране.
6. **Тесты**  
   - Integration тесты server actions (`valid update`, `invalid bounds`, `unauthorized`).  
   - Component test страницы на рендер правил и локальные ошибки валидации.  
   - E2E: добавить сценарий “patient opens reminders and toggles category”.
7. **Обновление документации**  
   Обновить `apps/webapp/src/app/app/patient/patient.md` (добавить новый экран напоминаний).

---

## Шаг 12.3: Реализовать синхронизацию изменения правил в integrator

1. **Цель шага**  
   После изменения правил в webapp отправлять событие, чтобы integrator начал использовать новые настройки.
2. **Точная область изменений**  
   Только `apps/webapp/src/modules/integrator/*`, `apps/webapp/src/app/api/integrator/reminders/rules/route.ts`, `apps/webapp/src/app/api/integrator/reminders/rules/by-category/route.ts`, `apps/webapp/src/modules/reminders/service.ts`.
3. **Конкретные действия**  
   - Добавить явный use-case: после update правила вызвать webapp->integrator relay endpoint (подписанный запрос).  
   - В payload использовать те же поля, что ingest-обработчик `reminder.rule.upserted` в `modules/integrator/events.ts`.  
   - Зафиксировать idempotency key для повторных отправок.
4. **Проверки после шага**  
   - Ошибка relаy не приводит к silent success (возвращается явная ошибка клиенту).  
   - Успешный relay отражается в projection таблице после ingest.
5. **Критерий успешного выполнения**  
   Изменение правил в webapp синхронизируется с integrator по согласованному контракту.
6. **Тесты**  
   - Обновить route tests для `integrator/reminders/rules` и `by-category`.  
   - Добавить unit test на формирование relay payload/idempotency.  
   - E2E не требуется на этом шаге.
7. **Обновление документации**  
   Обновить `apps/webapp/src/infra/webhooks/webhooks.md` и `apps/webapp/src/app/api/api.md` (раздел reminders relay).

---

## Шаг 12.4: Включить колокольчик в `PatientHeader` (без disabled)

1. **Цель шага**  
   Активировать UX-точку входа в пропущенные напоминания в шапке пациента.
2. **Точная область изменений**  
   Только `apps/webapp/src/shared/ui/PatientHeader.tsx`, новый хук `apps/webapp/src/modules/reminders/hooks/useReminderUnreadCount.ts` (новый), endpoint чтения истории `apps/webapp/src/app/api/integrator/reminders/history/route.ts`.
3. **Конкретные действия**  
   - Убрать `disabled` у кнопки Bell.  
   - Подключить polling/refresh unread-count на основе `reminder_occurrence_history` (статусы sent/failed из projection; критерий “непрочитано” определить явно и хранить отдельно, см. шаг 12.5).  
   - По клику открывать dropdown/sheet с последними событиями.
4. **Проверки после шага**  
   - Бейдж меняется при появлении новых событий.  
   - Открытие списка не ломает работу menu/messages.
5. **Критерий успешного выполнения**  
   Колокольчик работает как активный элемент интерфейса и показывает актуальный счётчик.
6. **Тесты**  
   - Component test для `PatientHeader` на отображение бейджа и открытие списка.  
   - Unit test для `useReminderUnreadCount`.  
   - E2E не требуется на этом шаге.
7. **Обновление документации**  
   Обновить `apps/webapp/src/shared/ui` документацию/комментарии по `PatientHeader`.

---

## Шаг 12.5: Добавить явный статус “seen” и статистику на экране напоминаний

1. **Цель шага**  
   Исключить неоднозначность статусов (`sent/failed`) и корректно считать “просмотрено/пропущено”.
2. **Точная область изменений**  
   Только `apps/webapp/migrations/032_reminder_seen_status.sql`, `apps/webapp/src/infra/repos/pgReminderProjection.ts`, `apps/webapp/src/app/app/patient/reminders/page.tsx`, server actions reminders.
3. **Конкретные действия**  
   - Добавить хранение признака просмотра (`seen_at` или отдельная таблица `reminder_seen_events`).  
   - Реализовать действие “Отметить просмотренным” из UI колокольчика/страницы reminders.  
   - На странице reminders вывести агрегаты: total sent, seen, unseen, failed (за фиксированный период, например 30 дней).
4. **Проверки после шага**  
   - После отметки “seen” счётчик в header уменьшается.  
   - Статистика совпадает с данными БД.
5. **Критерий успешного выполнения**  
   Есть однозначная модель “непрочитанных” и корректная статистика по напоминаниям.
6. **Тесты**  
   - Integration тест репозитория на отметку `seen` и агрегации.  
   - Обновить `apps/webapp/src/app/api/integrator/reminders/history/route.test.ts`.  
   - E2E: сценарий “mark reminder as seen -> badge decreases”.
7. **Обновление документации**  
   Обновить `apps/webapp/src/modules/reminders/reminders.md` и API-документацию reminders endpoints.

---

## Общий критерий завершения этапа 12

- [ ] `modules/reminders/service.ts` реализован без stub-логики.
- [ ] Есть отдельный экран `/app/patient/reminders` с редактированием правил.
- [ ] Изменения правил синхронизируются с integrator по подписанному контракту.
- [ ] Колокольчик в `PatientHeader` активен и показывает непрочитанные.
- [ ] Реализована явная модель `seen` и статистика на экране напоминаний.
- [ ] Все новые и изменённые функции покрыты unit/integration тестами.
- [ ] Добавлены e2e для ключевых пользовательских сценариев reminders.
- [ ] `pnpm run ci` проходит.

---

## Новая рабочая версия плана (для auto-агента)

### Цель этапа
Довести reminders-контур webapp до рабочего состояния: управляемые правила, синхронизация с integrator, читаемый UI пациента и корректная модель непросмотренных напоминаний.

### Зона изменений этапа
- Только `apps/webapp` (`modules/reminders`, `modules/integrator`, `app/api/integrator/reminders/*`, `app/app/patient/*`, `shared/ui/PatientHeader`, миграции и тесты).
- Не менять integrator-код и не расширять scope на уведомления других модулей вне reminders.

### Последовательность действий для автоагента

#### Шаг 12.1 — Убрать заглушки и ввести рабочий сервис reminders
1. **Цель шага**: заменить MVP stub в `modules/reminders/service.ts` на рабочие use-cases.
2. **Точная область изменений**: `apps/webapp/src/modules/reminders/service.ts`, `apps/webapp/src/modules/reminders/ports.ts` (новый), `apps/webapp/src/infra/repos/pgReminderRules.ts` (новый), `apps/webapp/src/app-layer/di/buildAppDeps.ts`.
3. **Конкретные действия**:
   - реализовать методы чтения/изменения правил;
   - оставить валидацию dispatch payload отдельной функцией;
   - подключить сервис в DI.
4. **Что проверить и при необходимости изменить (сущности)**:
   - `ReminderRule` типы и DTO;
   - SQL-доступ к `reminder_rules`;
   - сборку зависимостей в `buildAppDeps`.
5. **Проверки после шага**:
   - сервис возвращает реальные правила пользователя;
   - нет пустого массива по умолчанию без обращения к данным.
6. **Критерий успешного выполнения шага**: reminders service работает как production-модуль, а не заглушка.
7. **Тесты**:
   - обновить `apps/webapp/src/modules/reminders/service.test.ts`;
   - добавить integration тест `pgReminderRules`;
   - e2e: не требуется.
8. **Обновление документации**: обновить `apps/webapp/src/modules/reminders/reminders.md`.

#### Шаг 12.2 — Экран пациента `/app/patient/reminders`
1. **Цель шага**: выделить настройки reminders в отдельный пользовательский экран.
2. **Точная область изменений**: `apps/webapp/src/app/app/patient/reminders/page.tsx` (новый), `apps/webapp/src/app/app/patient/reminders/actions.ts` (новый), `apps/webapp/src/app-layer/routes/paths.ts`, `apps/webapp/src/shared/ui/PatientHeader.tsx`.
3. **Конкретные действия**:
   - добавить маршрут и пункт навигации;
   - реализовать редактирование enabled/schedule/days;
   - валидировать диапазоны расписания на сервере.
4. **Что проверить и при необходимости изменить (сущности)**:
   - `routePaths` и меню patient;
   - server actions reminders;
   - рендер категорий и форма редактирования.
5. **Проверки после шага**:
   - настройки загружаются при открытии;
   - изменения сохраняются и видны после reload.
6. **Критерий успешного выполнения шага**: пациент управляет правилами reminders без перехода в технические разделы.
7. **Тесты**:
   - integration tests server actions;
   - component test страницы reminders;
   - e2e: обязателен сценарий изменения категории.
8. **Обновление документации**: обновить `apps/webapp/src/app/app/patient/patient.md`.

#### Шаг 12.3 — Синхронизация изменений правил с integrator
1. **Цель шага**: обеспечить доставку изменённых правил в integrator pipeline.
2. **Точная область изменений**: `apps/webapp/src/modules/integrator/*`, `apps/webapp/src/modules/reminders/service.ts`, `apps/webapp/src/app/api/integrator/reminders/rules/route.ts`, `apps/webapp/src/app/api/integrator/reminders/rules/by-category/route.ts`.
3. **Конкретные действия**:
   - добавить relay-вызов после update rule;
   - использовать payload, совместимый с `reminder.rule.upserted` обработчиком;
   - фиксировать idempotency-key для повторов.
4. **Что проверить и при необходимости изменить (сущности)**:
   - `modules/integrator/events.ts` контракт полей;
   - сигнатуры и webhook-валидация;
   - обработка ошибок relay в UI.
5. **Проверки после шага**:
   - relay ошибка возвращается пользователю явно;
   - успешный relay отражается в projection-данных.
6. **Критерий успешного выполнения шага**: webapp и integrator используют один и тот же контракт rule update.
7. **Тесты**:
   - обновить route tests reminders rules;
   - unit test формирования relay payload/idempotency;
   - e2e: не требуется.
8. **Обновление документации**: обновить `apps/webapp/src/infra/webhooks/webhooks.md` и `apps/webapp/src/app/api/api.md`.

#### Шаг 12.4 — Активировать колокольчик в `PatientHeader`
1. **Цель шага**: включить рабочий индикатор reminders в шапке пациента.
2. **Точная область изменений**: `apps/webapp/src/shared/ui/PatientHeader.tsx`, `apps/webapp/src/modules/reminders/hooks/useReminderUnreadCount.ts` (новый), `apps/webapp/src/app/api/integrator/reminders/history/route.ts`.
3. **Конкретные действия**:
   - убрать `disabled` у Bell;
   - добавить чтение unread count;
   - показать список последних reminder событий по клику.
4. **Что проверить и при необходимости изменить (сущности)**:
   - badge rendering;
   - hook polling/refresh;
   - endpoint выдачи истории.
5. **Проверки после шага**:
   - бейдж обновляется;
   - открытие списка не ломает меню/сообщения.
6. **Критерий успешного выполнения шага**: Bell работает как активный элемент reminders UX.
7. **Тесты**:
   - component test `PatientHeader` (badge + open list);
   - unit test `useReminderUnreadCount`;
   - e2e: не требуется.
8. **Обновление документации**: обновить модульное описание `shared/ui` для поведения `PatientHeader`.

#### Шаг 12.5 — Ввести явную модель `seen` и статистику reminders
1. **Цель шага**: однозначно считать непросмотренные и метрики reminders.
2. **Точная область изменений**: `apps/webapp/migrations/032_reminder_seen_status.sql`, `apps/webapp/src/infra/repos/pgReminderProjection.ts`, `apps/webapp/src/app/app/patient/reminders/page.tsx`, reminders actions, `apps/webapp/src/app/api/integrator/reminders/history/route.ts`.
3. **Конкретные действия**:
   - добавить хранение признака просмотра;
   - реализовать действие mark-as-seen;
   - вывести статистику (sent/seen/unseen/failed) за фиксированный период.
4. **Что проверить и при необходимости изменить (сущности)**:
   - таблица/поле `seen` в reminder history модели;
   - API history response shape;
   - UI статистики на странице reminders.
5. **Проверки после шага**:
   - mark-as-seen уменьшает бейдж;
   - статистика совпадает с БД.
6. **Критерий успешного выполнения шага**: есть непротиворечивая модель seen/unseen и корректная статистика.
7. **Тесты**:
   - integration tests репозитория агрегаций;
   - обновить `apps/webapp/src/app/api/integrator/reminders/history/route.test.ts`;
   - e2e: обязателен сценарий mark-as-seen -> badge decrease.
8. **Обновление документации**: обновить `apps/webapp/src/modules/reminders/reminders.md` и API-контракт reminders history.

### Финальный критерий этапа 12
- Все шаги 12.1–12.5 закрыты.
- Для новых/изменённых функций есть unit/integration/e2e по требованиям шагов.
- `pnpm run ci` проходит.
