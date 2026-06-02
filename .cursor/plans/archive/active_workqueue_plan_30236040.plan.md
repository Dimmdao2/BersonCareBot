---
name: Active workqueue plan
status: completed
overview: "Очередь: фазы 0–7 закрыты (2026-06-02); workqueue patient/doctor/CMS help + B6 превью + proactive MVP (с аудитом)."
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
    content: "CMS help: CONTENT_PAGE_ROLES, раздел help (0103), /help UI, revalidate, редирект /content, canonical slug preparation/cost"
    status: completed
  - id: phase-7-docs-queue
    content: Завести docs/ACTIVE_WORKQUEUE.md и синхронизировать TODO/LOG после фаз
    status: completed
  - id: phase7-b6-preview
    content: "B6: MediaThumb + previewSmUrl в списке шаблонов программ"
    status: completed
  - id: phase7-proactive-mvp
    content: "Proactive MVP на «Сегодня» (doctor-proactive-insights)"
    status: completed
  - id: phase7-audit-remediation
    content: "Аудит фазы 7: queryInsights, instance inactivity, deep links, badge/card, docs+tests"
    status: completed
isProject: false
---

# План: актуальная очередь (врач + пациент + CMS)

**Статус:** **закрыт** (`status: completed`, 2026-06-02). **Канон:** этот файл в [`.cursor/plans/archive/active_workqueue_plan_30236040.plan.md`](.cursor/plans/archive/active_workqueue_plan_30236040.plan.md). IDE-копия `active_workqueue_plan_24dee701` синхронизирована с ним. Очередь: [`docs/ACTIVE_WORKQUEUE.md`](docs/ACTIVE_WORKQUEUE.md), [`docs/TODO.md`](docs/TODO.md) §Doctor card. Карточка: [`CARD_REDESIGN_PLAN.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/CARD_REDESIGN_PLAN.md), журнал [`LOG.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md), задачи: [`SPECIALIST_TASKS.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/SPECIALIST_TASKS.md). Фаза 1: `phase1_support_model_7c745931.plan.md`.

## Источник правды

- Сводка задач: [`docs/TODO.md`](docs/TODO.md) §Doctor card, §CMS, §Patient
- Контекст roadmap: [`docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md), [`docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/ROADMAP.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/ROADMAP.md)
- **Вне scope workqueue:** D5 `domain→kind`, полная переработка `/diary`, курсы, UX истории тестов (после доработки элементов тестов), inline quick-reply в карточке (ответ — на экране инстанса)
- **Proactive backlog (этап 8):** настраиваемые пороги, сигналы ЛФК/сессий/боли — [`RECOMMENDATIONS_AND_ROADMAP.md`](docs/APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md)
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

## Фаза 6 — CMS enum + `/help` — **закрыта** (2026-06-02)

**База:** [x] `CONTENT_PAGE_ROLES` (`help_article`, `thematic_article`, `system_cluster_page`) в `content-page-roles.ts`; раздел `help` — миграция `0103_help_content_section.sql`; CMS-сайдбар «Статьи справки» (`?section=help`); patient `/app/patient/help`, `/app/patient/help/[slug]` (`force-dynamic`); модуль `help-content/`.

**Хвосты (аудит 2026-06-02):** [x] `revalidatePatientContentPaths` — save/lifecycle/auth CMS; [x] редирект `/app/patient/content/[slug]` → `/help/[slug]` для `section=help`; [x] canonical slug `preparation` / `cost` — `CabinetInfoLinks` (RSC, плитки только при опубликованных статьях); [x] подсказка slug в `ContentForm`; [x] vitest 34+ (`help-content`, `revalidatePatientContentPaths`, `cabinetInfoLinkTiles`).

**Не в scope / отложено (на момент закрытия 2026-06-02):** полный enum §3.3 (`situation`, `course_lesson` в DDL); RTL страниц `/help`. **С 2026-06-03:** `CabinetInfoLinks` на `/app/patient/booking/new` — план `patient_help_booking_surface` фаза 2.

**Доки:** [`LOG.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) §фаза 6, [`ACTIVE_WORKQUEUE.md`](docs/ACTIVE_WORKQUEUE.md), [`TODO.md`](docs/TODO.md), [`ROADMAP_2.md`](docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §1.7/§3.3, [`DOCTOR_CMS_AND_RUNTIME.md`](docs/ARCHITECTURE/DOCTOR_CMS_AND_RUNTIME.md).

---

## Фаза 7 — B6 превью + proactive «Сегодня» (MVP) — **закрыта** (2026-06-02)

### B6

- [x] Список шаблонов: `MediaThumb` + `templateListPreviewToPreviewUi`; enrich `previewSmUrl` из `media_files` (`pgTreatmentProgram.enrichTemplateListPreviewMedia`).

### Proactive MVP (`doctor-proactive-insights`)

- [x] Сигналы для `on_support`: `wellbeing_low_streak` (3 дн. ≤ 2/5, якорь сегодня/вчера), `program_inactivity` (5+ дн. без `done` по **активному instance**).
- [x] Порт: `queryInsights` (один проход), `listForPatient` (scoped).
- [x] UI: секция «Сигналы пациентов» на «Сегодня»; блок «Сигналы» в карточке (Обзор); deep links; бейдж `todayAttention` = pending tests + proactive.
- [x] API: `GET /api/doctor/proactive-insights/summary`.
- [x] Аудит (2026-06-02): исправления выше + docs (`DOCTOR_DASHBOARD_METRICS`, `api.md`, `ROADMAP_2` §4.1) + тесты.

**Backlog:** admin-пороги, расширение сигналов — RECOMMENDATIONS этап 8.

**DoD:** [`LOG.md`](docs/DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) §фаза 7, [`ACTIVE_WORKQUEUE.md`](docs/ACTIVE_WORKQUEUE.md), targeted vitest + `tsc` webapp.

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
9. ~~**Фаза 6**~~ — закрыта (2026-06-02).
10. ~~**Фаза 7**~~ — закрыта (2026-06-02): B6 превью + proactive MVP + аудит; дальше — [`TODO.md`](docs/TODO.md) (diary, D5, расширение proactive этап 8).

**CI:** полный `pnpm run ci` — перед push ([`.cursor/rules/pre-push-ci.mdc`](.cursor/rules/pre-push-ci.mdc)).

**Документация после фазы:** `LOG.md` инициативы + [`ACTIVE_WORKQUEUE.md`](docs/ACTIVE_WORKQUEUE.md) / [`TODO.md`](docs/TODO.md).
