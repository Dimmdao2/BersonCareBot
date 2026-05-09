---
name: Reminder UX Full
overview: "Reminder UX — закрыт (2026-05-09): rehab slots_v1, mute, integrator-проекция, главная n/N; документы в docs/PATIENT_REMINDER_UX_INITIATIVE/; план ниже — нормативный слепок решений и этапов."
status: completed
completedAt: "2026-05-09"
mergeRef: "677a18d0"
todos:
  - id: docs-initiative-and-decisions
    content: Создать docs/PATIENT_REMINDER_UX_INITIATIVE (README/ROADMAP/LOG), cross-links в docs/README; зафиксировать ADR с Locked Decisions.
    status: completed
  - id: schema-domain-rehab-slots-mute
    content: "Миграции и контракты: rehab_program, reminder_intent, slots_v1 JSON, optional label/description, сущность mute_until."
    status: completed
  - id: recurrence-policy-home-helpers
    content: Обновить policy (integrator) и nextReminderOccurrence + backward compat interval_window; дефолт будни 12/15/17 при первичной инициализации rehab.
    status: completed
  - id: snooze-skip-done-webapp-integrator
    content: API/UI snooze 15/30 + custom via deeplink; skip optional reason; quick-action done → reminder_journal; inline keyboard + handlers; лимит 64B callback.
    status: completed
  - id: mute-all-dispatch-ui
    content: User-level mute 2h/8h/custom; фильтр в dispatch pipeline; отображение в reminders/home.
    status: completed
  - id: home-reminder-progress-n-of-n
    content: PatientHomeToday + карточки — n/N по правилам ниже, empty-state при N=0; не смешивать с PatientHomeProgressBlock (короткие практики).
    status: completed
  - id: e2e-tests-docs-closeout
    content: Целевые тесты, обновление LOG, финальный pnpm run ci перед merge/push по правилам репо.
    status: completed
isProject: false
---

# Reminder UX — полный план (решения + этапы)

## Статус выполнения

- **Состояние:** все YAML-todos — `completed`; инициатива закрыта (**2026-05-09**).
- **Код / merge:** ветка `main`, коммит `677a18d0` (после него — только правки docs при необходимости).
- **Документы:** [`docs/PATIENT_REMINDER_UX_INITIATIVE/README.md`](../../docs/PATIENT_REMINDER_UX_INITIATIVE/README.md) (ADR), [`ROADMAP`](../../docs/PATIENT_REMINDER_UX_INITIATIVE/ROADMAP.md), [`LOG`](../../docs/PATIENT_REMINDER_UX_INITIATIVE/LOG.md); оглавление — [`docs/README.md`](../../docs/README.md) §Архив.
- **Миграции (факт):** webapp SQL `084_reminder_rehab_slots_mute.sql`; integrator `20260509_0001_reminder_rules_multi_and_enrichment.sql`.

---

## Цель

Сделать напоминания предметными и быстрыми: из пуша — ключевые действия в 1–2 тапа; главная — актуальный статус на сегодня (`n из N` или явное «на сегодня нет напоминаний»). Привязка к **программе реабилитации как целому**, не к этапу.

## Scope

**In scope**

- Пуш-действия: пропуск сегодня (причина опциональна), «Уже выполнено», отложить (`15м`, `30м`, «Своя настройка» → редактирование / deeplink), отключить все напоминания (`2ч`, `8ч`, «Своя настройка»).
- Правила: `linked_object_type=rehab_program`, пользовательские название/описание где нужно; intent для CTA в пуше.
- Расписание: несколько времён в сутки, будни / дни недели / каждые N дней; дефолт для нового rehab-потока: будни `12:00`, `15:00`, `17:00` в TZ пациента.
- Синхронизация главной: next reminder + прогресс напоминаний на день.

**Out of scope**

- Booking/course логика вне reminders/home; перепроектирование stage FSM treatment-program; полная склейка `/notifications` и `/reminders` в один экран (допускаются только переходы).

---

## Locked Decisions (зафиксировано до реализации)

### 1) Source of truth и dual-model

- Каноника: `public.reminder_rules` (webapp).
- Для новых program-based правил **не** опираться на integrator `user_reminder_rules` как источник истины из-за `UNIQUE(user_id, category)`.
- Integrator читает правила через webapp-projection (`remindersReadsPort`) и работает по **`rule.id`**, не по `(user, category)`.

### 2) Семантика `n из N` на главной

- `N` — число запланированных occurrence на текущий календарный **день приложения** (активные правила, после учёта mute). Слоты каждого правила считаются в его **`timezone`**; для границы дня и агрегата `n` используется **часовой пояс отображения приложения** (как на главной) — см. ADR в README инициативы.
- `n` — число occurrence за день с финальным действием пользователя: **`done` или `skipped`**.
- `snoozed` не увеличивает `n`.
- При `N = 0` — явный empty-state («На сегодня напоминаний нет»), не «0 из 0».

### 3) Модель расписания

- Новый тип: `schedule_type='slots_v1'` + колонка `schedule_data JSONB` (nullable) в `reminder_rules`.
- Формат `slots_v1`: `timesLocal` (массив `HH:mm`), `dayFilter` (`weekdays` | `weekly_mask` | `every_n_days`), `daysMask` (7-char bitmask), при `every_n_days` — `everyNDays: number` + `anchorDate: ISO date`.
- Легаси `interval_window` сохраняется для обратной совместимости; `schedule_data = NULL` при `schedule_type='interval_window'`.

### 4) Rehab program и intent / CTA

- `linked_object_type='rehab_program'`.
- Поле `reminder_intent` (колонка `reminder_intent TEXT`): `warmup | exercises | stretch | generic`. Значение по умолчанию `generic`.
- Текст primary CTA в пуше: `warmup` → «Начать разминку»; `exercises` / `stretch` → «Выполнить упражнения»; `generic` → «Открыть программу».
- Integrator категория для `rehab_program`-правил: `exercise` (из `REMINDER_CATEGORIES` integrator) — используется при проекции из webapp. Конкретный маппинг фиксируется в `remindersReadsPort.ts` при добавлении `rehab_program`.

### 5) «Уже выполнено»

- Quick-action `done` (webapp + integrator callback/deeplink).
- Webapp API: `POST /api/patient/reminders/[id]/done` (по аналогии со `/skip`); принимает `{ occurrenceId: string }`.
- Пишет `reminder_journal.action='done'` по `occurrence_id`; один `done` на occurrence (инвариант БД — уникальный индекс `uq_reminder_journal_once_done_per_occurrence`).
- Integrator callback: `rem_done:<occurrenceId>` → handler вызывает webapp signed API.

### 6) Snooze / custom / Telegram

- Быстрые кнопки: `15м`, `30м`.
- «Своя настройка» — deeplink на экран редактирования напоминаний, не длинный `callback_data`.
- Все callback в пределах **64 bytes** UTF-8; длинные сценарии только URL/deeplink.

### 7) Mute all

- User-level mute: колонка **`platform_users.reminder_muted_until`** (`TIMESTAMPTZ`, nullable). Альтернатива из черновика плана — отдельная таблица — **не использовалась**.
- Проверка `muted_until > NOW()` в dispatch pipeline до отправки; те же данные в UI reminders/home.

### 8) Дефолт новых пользователей (rehab-поток)

- Один раз при первичной инициализации: будни + `12:00`, `15:00`, `17:00` в TZ пациента.

---

## Архитектурные ограничения (применяются на всех этапах)

- **Clean Architecture:** новые файлы в `modules/*` не импортируют `@/infra/db/*` или `@/infra/repos/*` напрямую — только через порты.
- **Drizzle / SQL:** изменения схемы webapp — `drizzle-kit generate` → SQL в `apps/webapp/migrations/` с порядковым номером (в этой инициативе — **`084_reminder_rehab_slots_mute.sql`**), затем `pnpm --dir apps/webapp run migrate`. Типы из `schema.$inferSelect`.
- **`handleReminderDispatch` (webapp):** текущий stub (`accepted: false`) **не реализовывать** в рамках этой инициативы — dispatch идёт только через integrator-планировщик. Stub можно задокументировать, но не расширять, чтобы не создавать двойной путь.

---

## Ключевые зоны кода

**Webapp**

- [`apps/webapp/db/schema/schema.ts`](apps/webapp/db/schema/schema.ts)
- [`apps/webapp/src/modules/reminders/types.ts`](apps/webapp/src/modules/reminders/types.ts)
- [`apps/webapp/src/modules/reminders/service.ts`](apps/webapp/src/modules/reminders/service.ts)
- [`apps/webapp/src/modules/reminders/ports.ts`](apps/webapp/src/modules/reminders/ports.ts)
- [`apps/webapp/src/infra/repos/pgReminderRules.ts`](apps/webapp/src/infra/repos/pgReminderRules.ts)
- [`apps/webapp/src/infra/repos/pgReminderJournal.ts`](apps/webapp/src/infra/repos/pgReminderJournal.ts)
- [`apps/webapp/src/app/api/patient/reminders/create/route.ts`](apps/webapp/src/app/api/patient/reminders/create/route.ts)
- [`apps/webapp/src/app/api/patient/reminders/[id]/snooze/route.ts`](apps/webapp/src/app/api/patient/reminders/[id]/snooze/route.ts)
- [`apps/webapp/src/app/api/patient/reminders/[id]/skip/route.ts`](apps/webapp/src/app/api/patient/reminders/[id]/skip/route.ts)
- [`apps/webapp/src/app/app/patient/reminders/ReminderRulesClient.tsx`](apps/webapp/src/app/app/patient/reminders/ReminderRulesClient.tsx)
- [`apps/webapp/src/modules/reminders/components/ReminderCreateDialog.tsx`](apps/webapp/src/modules/reminders/components/ReminderCreateDialog.tsx)
- [`apps/webapp/src/modules/patient-home/nextReminderOccurrence.ts`](apps/webapp/src/modules/patient-home/nextReminderOccurrence.ts)
- [`apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx)
- [`apps/webapp/src/app/app/patient/home/PatientHomeNextReminderCard.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeNextReminderCard.tsx)
- [`apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx) — **короткие практики**; reminder `n/N` — отдельно
- [`apps/webapp/src/modules/integrator/reminderDispatch.ts`](apps/webapp/src/modules/integrator/reminderDispatch.ts)

**Integrator**

- [`apps/integrator/src/kernel/contracts/reminders.ts`](apps/integrator/src/kernel/contracts/reminders.ts)
- [`apps/integrator/src/kernel/domain/reminders/policy.ts`](apps/integrator/src/kernel/domain/reminders/policy.ts)
- [`apps/integrator/src/kernel/domain/reminders/reminderInlineKeyboard.ts`](apps/integrator/src/kernel/domain/reminders/reminderInlineKeyboard.ts)
- [`apps/integrator/src/kernel/domain/reminders/buildPatientReminderDeepLink.ts`](apps/integrator/src/kernel/domain/reminders/buildPatientReminderDeepLink.ts)
- [`apps/integrator/src/infra/adapters/remindersReadsPort.ts`](apps/integrator/src/infra/adapters/remindersReadsPort.ts)
- [`apps/integrator/src/kernel/domain/executor/handlers/reminders.ts`](apps/integrator/src/kernel/domain/executor/handlers/reminders.ts)
- [`apps/integrator/src/integrations/telegram/mapIn.ts`](apps/integrator/src/integrations/telegram/mapIn.ts)

---

## План по этапам

### Этап 0: Инициатива и контракт

- Создать `docs/PATIENT_REMINDER_UX_INITIATIVE/` (`README.md`, `ROADMAP.md`, `LOG.md`).
- Включить в README краткий **ADR** со всеми пунктами Locked Decisions.
- Ссылки: [`docs/README.md`](docs/README.md), при необходимости кросс-ссылка из initiatives roadmap.

Проверки: `rg PATIENT_REMINDER_UX_INITIATIVE docs`; стартовая запись в `LOG.md`.

### Этап 1: Домен и схема (`rehab_program`, labels, mute, slots)

- Расширить `linked_object_type` чеком на DB и типами TS: добавить `'rehab_program'`.
- Добавить колонки в `reminder_rules`: `reminder_intent TEXT DEFAULT 'generic'`, `schedule_data JSONB`.
- Решить хранение mute (см. Locked Decisions §7) и добавить миграцию.
- Добавить опциональные человекочитаемые поля (`custom_label TEXT`) для `rehab_program`-правил при необходимости.
- Deep link для `rehab_program` в [`buildPatientReminderDeepLink.ts`](apps/integrator/src/kernel/domain/reminders/buildPatientReminderDeepLink.ts): маршрут страницы программы пациента.
- Адаптировать `pgReminderRules`, `ports.ts`, `service.ts`, API create/update и integrator `remindersReadsPort` под новые поля.
- Все миграции через Drizzle (`drizzle-kit generate` → SQL → `drizzle-kit migrate`).

Gate: lint/typecheck чисто; targeted tests repo/service/routes зелёные; `rg rehab_program apps/` находит только ожидаемые места.

### Этап 2: Расписание и пресеты

- Реализовать `slots_v1` в integrator [`policy.ts`](apps/integrator/src/kernel/domain/reminders/policy.ts) (`planDueReminderOccurrences`) и в [`nextReminderOccurrence.ts`](apps/webapp/src/modules/patient-home/nextReminderOccurrence.ts) (`computeNextOccurrenceUtcForRule`); сохранить поведение `interval_window`.
- Дефолт-инициализация будни + `12:00 / 15:00 / 17:00` в `slots_v1` при первичном добавлении rehab-правила.
- Unit tests: несколько time-slots в сутки, `every_n_days`, граница TZ, backward compat.

Gate: только targeted тесты расписания; `interval_window`-путь не сломан (существующие тесты).

### Этап 3: Snooze, skip, done

- **Snooze:** webapp API принимает `15` и `30` (минуты); server-side проверка max (`≤ 720 мин`). Integrator keyboard: кнопки `rem_snooze:<id>:15` и `rem_snooze:<id>:30`; «Своя настройка» — кнопка `url` (deeplink на экран reminders).
- **Skip:** убедиться, что `reason` опционален (`null` / пустая строка) во всех каналах; идемпотентность по `uq_reminder_journal_once_skipped_per_occurrence`.
- **Done:** добавить `POST /api/patient/reminders/[id]/done` в webapp; `pgReminderJournal.logAction('done', ...)`. Integrator: кнопка `rem_done:<id>`, handler по аналогии со snooze.
- Обновить [`reminderInlineKeyboard.ts`](apps/integrator/src/kernel/domain/reminders/reminderInlineKeyboard.ts): строка CTA по `reminder_intent` (primary URL button), snooze 15/30, skip, done.

Gate: `isTelegramCallbackDataWithinLimit` тесты зелёные; route tests snooze/skip/done; handler unit tests.

### Этап 4: Mute all

- Запись `mute_until` (выбор хранения из Locked Decisions §7); webapp API для установки mute.
- Фильтр в integrator dispatch: если `muted_until > now()` — пропустить dispatch, сохранить occurrence со статусом `planned`.
- Быстрые кнопки в пуше: `2ч`, `8ч` и deeplink на custom.
- Отображение активного mute в UI reminders-экрана; учёт `mute_until` в `N` на главной.

Gate: dispatch-pipeline тесты учитывают muted case; webapp/integrator mute API-тесты.

### Этап 5: Главная (`n/N`, next reminder)

- В [`PatientHomeToday.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx) добавить вычисление дневного reminder progress: новая функция `todayReminderOccurrences(rules, journalEntries, date, tz)` → `{ total: N, done: n }`.
- Обновить [`PatientHomeNextReminderCard.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeNextReminderCard.tsx) или добавить отдельный блок: при `N > 0` — `n из N`; при `N = 0` — «На сегодня напоминаний нет».
- **Не** менять метрику в [`PatientHomeProgressBlock.tsx`](apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx) — этот блок остаётся только для коротких практик.

Gate: component tests home reminder block; edge cases: N=0, all done, partially snoozed.

### Этап 6: Закрытие

- E2E-сценарии вручную: push → snooze 15/30 / skip / done / mute; home корректно показывает n/N / пустой стейт.
- Обновить `docs/PATIENT_REMINDER_UX_INITIATIVE/ROADMAP.md` и `LOG.md`.
- Финальный барьер: `pnpm install --frozen-lockfile && pnpm run ci`.

---

## Риски и меры

| Риск | Мера |
|------|------|
| Коллизия `(user_id, category)` в integrator | **Снято:** источник истины — webapp `reminder_rules` по `rule.id`; projection по HTTP. |
| Сложность recurrence | Выделить модуль нормализации + table-driven tests по TZ. |
| Разъезд контрактов webapp/integrator | Сначала контракты и route tests, затем UI. |
| Длинные `occurrenceId` и Telegram | Короткие префиксы callback; при нехватке места — только URL row; тесты как в [`reminderInlineKeyboard.test.ts`](apps/integrator/src/kernel/domain/reminders/reminderInlineKeyboard.test.ts). |
| `handleReminderDispatch` stub — соблазн расширить | **Не трогать.** Dispatch только через integrator-планировщик. Stub документируется как «not implemented by design». |

---

## Definition of Done

**Выполнено** (2026-05-09, CI зелёный на merge-коммите).

- Документы инициативы и ADR отражают Locked Decisions.
- Доступны: `rehab_program`, intent/CTA, правила с названием/описанием где задумано; расписание slots + легаси; дефолт 12/15/17 по будням при первичной инициализации rehab.
- Snooze 15/30 + custom path; skip без обязательной причины; done в журнале; mute-all 2h/8h/custom в dispatch и UI.
- Главная: корректное reminder `n/N` при `N>0`; при `N=0` — явный текст; не смешивать с прогрессом коротких практик.
- Тесты и `LOG` обновлены; CI зелёный на merge-коммите.
