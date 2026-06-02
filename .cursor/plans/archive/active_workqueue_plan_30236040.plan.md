---
name: Active workqueue plan
overview: "Очередь: фазы 0–5 закрыты (2026-06-02); следующая — 6 (CMS/help)."
todos:
  - id: phase-0-exercises-ui-hotfix
    content: "P0: починить ряд «Комментарии» + «Отметить выполнение» в PatientTreatmentProgramStagePageProgramSection (+ тесты)"
    status: completed
  - id: phase-1-on-support-model
    content: "Drizzle + API + ClientProfileCard/Today: ручной «На сопровождении», гейты comment/media, ссылка «программа без сопровождения»"
    status: completed
  - id: phase-2-doctor-card
    content: "Спроектировать карточку врача (Tabs + Hero, график самочувствия вторичный): CARD_REDESIGN_PLAN.md"
    status: completed
  - id: phase-2b-doctor-card-implementation
    content: "Реализовать карточку: Hero, Action Strip, табы, агрегаты, Care Plan/Wellbeing, чат, deep link discussionItem, UX-аудит P0/P1"
    status: completed
  - id: phase-2c-specialist-tasks-design
    content: "Спроектировать «Задача» специалиста: модель, напоминания (doctor-scope каналы), Hero + секция + «Сегодня»"
    status: completed
  - id: phase-2c-specialist-tasks-implementation
    content: "Реализовать 2C: Drizzle specialist_tasks, API, worker tick, UI карточки и «Сегодня», /app/settings"
    status: completed
  - id: phase-2c-audit-remediation
    content: "2C аудит: честный sent, undeliverable без вечного tick, getPatientClientIdentity, UI/тесты/доки/cron"
    status: completed
  - id: phase-3-instance-draft-save
    content: "Черновик редактора: batch save, gates (статус этапа + завершить программу), normalize/partial, complete→stages completed, лента на Обзоре"
    status: completed
  - id: phase-4-catalog-filters
    content: "Picker программы/шаблона: поиск + регион + тип нагрузки (exercise/lfk_complex); без «Без региона»/«Без типа»"
    status: completed
  - id: phase-5-doctor-inbox
    content: "Cross-patient «К проверке» на Сегодня: count+list global, focusItemId, бейдж меню, summary API, аудит"
    status: completed
  - id: phase-6-cms-help
    content: CMS enum типов контента + /help из статей
    status: pending
  - id: phase-7-docs-queue
    content: Завести docs/ACTIVE_WORKQUEUE.md и синхронизировать TODO/LOG после фаз
    status: completed
isProject: false
---

# План: актуальная очередь (врач + пациент + CMS)

**Синхронизация:** 2026-06-02. **Канон в репозитории:** [`.cursor/plans/archive/active_workqueue_plan_30236040.plan.md`](.cursor/plans/archive/active_workqueue_plan_30236040.plan.md) (этот файл). Очередь: [`docs/ACTIVE_WORKQUEUE.md`](docs/ACTIVE_WORKQUEUE.md), [`docs/TODO.md`](docs/TODO.md) §Doctor card. Карточка: [`CARD_REDESIGN_PLAN.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/CARD_REDESIGN_PLAN.md), журнал [`LOG.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md), задачи: [`SPECIALIST_TASKS.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/SPECIALIST_TASKS.md). Фаза 1: `phase1_support_model_7c745931.plan.md`.

## Источник правды

- Сводка задач: [`docs/TODO.md`](docs/TODO.md) §Doctor card, §CMS, §Patient
- Контекст roadmap: [`docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md), [`docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/ROADMAP.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/ROADMAP.md)
- **Вне scope «сейчас»:** D5 `domain→kind`, полная переработка `/diary`, курсы, proactive-лента (после карточки), UX истории тестов (после доработки элементов тестов), inline quick-reply в карточке (ответ — на экране инстанса)
- UX-референсы для карточки врача: care management dashboards — **patient header + active care plan + clinical timeline + vitals/observations graph + tasks/alerts**

---

## Фаза 0 — Hotfix UI «Упражнения» (P0) — **закрыта**

**DoD:** [x] на узком viewport обе кнопки видны без горизонтального скролла; «Комментарии» без иконки, с бейджем при count > 0.

---

## Фаза 1 — «На сопровождении» и гейты комментариев/медиа — **закрыта**

**DoD:** [x] врач вручную ведёт сопровождение; «Сегодня» и patient UX согласованы с флагами.

---

## Фаза 2A — Спроектировать карточку пациента врача — **закрыта**

**Deliverable:** [`CARD_REDESIGN_PLAN.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/CARD_REDESIGN_PLAN.md) — утверждён owner 2026-06-02 (Tabs + Hero; самочувствие вторичное).

**DoD:** [x] IA, component map, data contract, execution slices 2B/2C, acceptance checklist.

---

## Фаза 2B — Реализовать карточку по дизайн-плану — **закрыта**

**Сделано (кратко):** каркас Tabs + `PatientCareBar` + `PatientActionStrip`; RSC-агрегаты Action Strip / Care Plan / Wellbeing; встроенный чат; deep link `discussionItem`; UX-аудит P0/P1; acceptance §10 в `CARD_REDESIGN_PLAN.md` (кроме пунктов, перенесённых в 2C — закрыты в 2C).

**DoD:** [x] врач видит программу, самочувствие, inbox и «что горит» без «простыни».

---

## Фаза 2C — Сущность «Задача» специалиста — **закрыта** (2026-06-02)

**Цель:** task-трекер специалиста (глобальные + по пациенту), напоминания, Hero/секция/«Сегодня». Не часть `treatment_program`.

### Модель (поля)

| Поле | Смысл |
|---|---|
| Владелец | `owner_user_id` |
| Пациент | `patient_user_id` nullable (`null` = глобальная) |
| Постановка | `created_at` |
| Заголовок / описание | `title` / `description` |
| Срок / напоминание | `due_at` / `remind_at` (необяз.) |
| Важность | `is_important` (default off) |
| Выполнение | `completed_at` |
| Идемпотентность remind | `reminder_sent_at` |

### Реализация (код)

- Drizzle `specialist_tasks`, миграция `0102_specialist_tasks.sql`; модуль `apps/webapp/src/modules/specialist-tasks/`.
- API: `GET/POST /api/doctor/tasks`, `PATCH/DELETE/POST …/complete`, `GET/POST …/clients/:userId/tasks`, `GET …/tasks/summary`.
- Internal: `POST /api/internal/specialist-task-reminders/tick` (Bearer `INTERNAL_JOB_SECRET`); registry `cronJobRegistry`.
- Настройки: `doctor_specialist_task_reminder_channels` (`ALLOWED_KEYS`, `/app/settings`, doctor-scope).
- Доставка: telegram, max, email, web_push на `owner_user_id` (**SMS не используется**).
- UI: `PatientSpecialistTasksSection`, `PatientCareBar` + `PatientActionStrip` (чип «Задачи»), `DoctorGlobalTasksSection` на «Сегодня».

### Хвост аудита (финал 2026-06-02)

- `sent` только при успешной доставке; `undeliverable` (нет каналов/привязок) → `reminder_sent_at`, без вечного cron.
- `getPatientClientIdentity` — только `role = client` при привязке к пациенту.
- UI: дата постановки, «Выполненные», ошибки загрузки; одна `SpecialistTaskFormDialog` на «Сегодня».
- Тесты: notify, dispatch, route (summary/complete/global), tick 503.
- Доки: `SPECIALIST_TASKS.md`, `api.md`, `HOST_DEPLOY_README` (cron-таблица), якорь `#doctor-client-section-tasks` в `CARD_REDESIGN_PLAN.md` §8.

### DoD фазы 2C

- [x] CRUD/выполнение (глобальные + по пациенту); напоминания по каналам из настроек; без дублей.
- [x] Карточка: список + Hero; глобальные на «Сегодня».
- [x] Drizzle + порт/сервис/DI; конфиг в БД, не env; module isolation.

---

## Фаза 3 — Редактор назначенной программы: черновик + save — **закрыта** (2026-06-02)

**DoD:** [x] in-memory черновик (метаданные этапа/группы, комментарии, нагрузка); одно «Сохранить» + confirm для active; модалка перед сменой статуса этапа и «Завершить программу» при dirty; `beforeunload`; normalize no-op; partial batch failure; завершение программы → все этапы completed; краткая лента на «Обзоре» карточки; `api.md` + unit-тесты draft/flush.

---

## Фаза 4 — Добавление из каталога (фильтры) — **закрыта** (2026-06-02)

**DoD:** [x] в `InstanceAddLibraryItemDialog` и конструкторе шаблона — поиск + регион + тип нагрузки для **exercise/lfk_complex**; empty state по фильтрам; `buildTreatmentProgramLibraryPickers` + RSC `bodyRegionIdToCode` + `includeExerciseDetails`; unit-тесты shared picker.

**Продукт (финал):** «Без региона» / «Без типа» (`DOCTOR_CATALOG_FILTER_MISSING`) — **не** в picker добавления в программу/шаблон; только `DoctorCatalogFiltersForm` на экранах каталога врача (аудит незаполненных карточек). См. [`LOG.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) §фаза 4 (финал).

---

## Фаза 5 — Inbox врача (вторичный) — **закрыта** (2026-06-02)

Cross-patient «К проверке» на «Сегодня»; deep link `focusItemId` на экране инстанса; бейдж пункта «Сегодня» в меню (ROADMAP_2 §2.2–2.3).

**DoD:** [x] `countPendingTestEvaluationAttemptsGlobal` + `listPendingTestEvaluationsGlobal(maxAttempts)` — active instance, не promo, `decided_by IS NULL`, `submitted_at IS NOT NULL`; preview top **10** попыток, total без занижения. [x] Секция «К проверке» на `/app/doctor` (`DoctorTodayPendingProgramTestsSection`, `#doctor-today-section-pending-tests`, строка в «Требует внимания»). [x] CTA «Оценить» → `?focusItemId={resultId}` (UUID); scroll/highlight + retry в `TreatmentProgramInstanceDetailClient`; карточка пациента — те же href. [x] `GET /api/doctor/pending-program-tests/summary` → `{ ok, count }`; `useDoctorPendingProgramTestsCount` + `badgeKey: pendingProgramTests` на «Сегодня». [x] RSC: валидный UUID для `focusItemId` и `discussionItem`. [x] Тесты: `progress-service`, `mapPendingProgramTestsForToday`, `DoctorTodayDashboard`, `doctorClientInstanceHref`, `pending-program-tests/summary/route`, `DoctorMenuAccordion`, `useDoctorPendingProgramTestsCount`; `api.md`. Журнал: [`LOG.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) §фаза 5.

**Не в scope:** client refresh секции Today после оценки; RTL-тест scroll/highlight.

---

## Фаза 6 — CMS enum + `/help`

**DoD:** админка управляет статьями; `/help` не заглушка.

---

## Фаза 7 — Низкий приоритет

- [x] `docs/ACTIVE_WORKQUEUE.md`; синхронизация TODO/LOG после фаз 0–2C.

---

## Продуктовые решения (не reopen)

- Срок этапа **не обязателен**.
- Persistent-рекомендации после завершения → **история**; в активной программе — **общее промо**.
- UX истории попыток тестов — отложено.
- «Без региона» / «Без типа» в фильтрах — **только** экраны каталога врача (создание/редактирование карточек); **не** picker «добавить из библиотеки» в программу/шаблон.

---

## Порядок исполнения (актуальный)

1. ~~Фаза 0~~ — закрыта.
2. ~~Фаза 1~~ — закрыта.
3. ~~Фаза 2A~~ — закрыта.
4. ~~Фаза 2B~~ — закрыта.
5. ~~Фаза 2C~~ — закрыта (включая аудит).
6. ~~**Фаза 3**~~ — закрыта (2026-06-02).
7. ~~**Фаза 4**~~ — закрыта (2026-06-02).
8. ~~**Фаза 5**~~ — закрыта (2026-06-02).
9. **Фаза 6** — **следующая.**
10. Фаза 7 по очереди.

**CI:** полный `pnpm run ci` — перед push ([`.cursor/rules/pre-push-ci.mdc`](.cursor/rules/pre-push-ci.mdc)).

**Документация после фазы:** `LOG.md` инициативы + [`ACTIVE_WORKQUEUE.md`](docs/ACTIVE_WORKQUEUE.md) / [`TODO.md`](docs/TODO.md).
