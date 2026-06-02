# Активная очередь (врач + пациент + CMS)

**Статус:** **workqueue закрыт** (2026-06-02, фазы 0–7). План: [`.cursor/plans/archive/active_workqueue_plan_30236040.plan.md`](../.cursor/plans/archive/active_workqueue_plan_30236040.plan.md) (`status: completed`). Сводка чеклистов — [`TODO.md`](TODO.md). Активные хвосты вне очереди — diary, D5, расширение proactive (этап 8).

| Фаза | Статус | План / лог |
|------|--------|------------|
| **0** — hotfix UI плиток программы (P0): «Комментарии» + «Отметить выполнение» | **Закрыта** | active workqueue §Фаза 0 |
| **1** — «На сопровождении» + гейты comment/media | **Закрыта** | Cursor `phase1_support_model_7c745931.plan.md`; LOG: [`DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md`](DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) |
| **2A** — дизайн карточки врача | **Закрыта** | [`CARD_REDESIGN_PLAN.md`](DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/CARD_REDESIGN_PLAN.md) |
| **2B** — реализация карточки | **Закрыта** | LOG §2026-06-02 |
| **2C** — задачи специалиста | **Закрыта** (аудит 2026-06-02) | [`SPECIALIST_TASKS.md`](DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/SPECIALIST_TASKS.md), LOG §2C |
| **3** — черновик редактора программы | **Закрыта** (2026-06-02) | LOG §фаза 3 |
| **4** — фильтры каталога (регион + нагрузка) | **Закрыта** (2026-06-02) | LOG §фаза 4 |
| **5** — cross-patient inbox «К проверке» на «Сегодня» + `focusItemId` | **Закрыта** (2026-06-02) | LOG §фаза 5 |
| **6** — CMS enum + `/help` | **Закрыта** (2026-06-02) | LOG §фаза 6, `content-page-roles.ts`, миграция `0103` |
| **7** — B6 превью + proactive «Сегодня» (MVP + аудит) | **Закрыта** (2026-06-02) | LOG §фаза 7, `doctor-proactive-insights` |

## Фаза 0 (закрыта)

Компактный ряд «Комментарии» + «Отметить выполнение» на плитках программы (`PatientTreatmentProgramStagePageProgramSection`, согласование с item page). Тесты: `PatientTreatmentProgramStagePageProgramSection.test.tsx`.

## Фаза 1 (закрыта)

- Таблица `doctor_patient_support`, миграция `0101_doctor_patient_support.sql`, backfill активных doctor-программ.
- `onSupportCount` / «Сегодня» / `?support=on` / `?support=programWithoutSupport`.
- Врач: `DoctorClientSupportPanel`, `GET/PATCH …/support-settings`, defaults в `/app/settings`.
- Пациент: `loadPatientProgramInteractionBundle`, UI visible/disabled, API `patient_support_*_disabled`.
- Док: [`DOCTOR_DASHBOARD_METRICS.md`](ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md), [`PROMO_ASSIGNMENT_SOURCE.md`](PROMO_ASSIGNMENT_SOURCE.md), `apps/webapp/src/app/api/api.md`.

## Фаза 3 (закрыта)

- In-memory черновик редактора инстанса (этап/группа/комментарии/нагрузка), одна кнопка «Сохранить», модалка перед сменой статуса этапа и «Завершить программу» при несохранённых правках; `beforeunload` при dirty.
- Normalize no-op патчей (blur без изменений); partial batch save — baseline sync + сообщение в UI.
- Завершение программы переводит все этапы (кроме skipped) в `completed`.
- На «Обзоре» карточки — блок «Изменения программы» (до 5 последних событий).

## Фаза 4 (закрыта)

- Shared picker filters: упражнения **и комплексы ЛФК** — регион, тип нагрузки, поиск; empty state по фильтрам.
- Экран **назначенной программы** (`InstanceAddLibraryItemDialog`) и **конструктор шаблона** — один toolbar/hook (`TreatmentProgramLibraryPickerToolbar` + `useTreatmentProgramLibraryPickerList`).
- RSC: `bodyRegionIdToCode`, `includeExerciseDetails` для метаданных комплексов.
- **Продукт:** в picker **нет** «Без региона» / «Без типа» — эти пункты только в `DoctorCatalogFiltersForm` на экранах каталога врача (аудит незаполненных полей). См. LOG §фаза 4 (финал).

## Фаза 6 (закрыта)

- **Таксономия:** `apps/webapp/src/modules/content-sections/content-page-roles.ts` (`CONTENT_PAGE_ROLES`); роль `help_article` = страницы в `content_pages.section = help`.
- **БД:** `apps/webapp/db/drizzle-migrations/0103_help_content_section.sql` — раздел CMS `help` (`kind=article`).
- **Врач:** `ContentPagesSidebar` → «Статьи справки»; хаб `/app/doctor/content?section=help`; slug раздела `help` зарезервирован; подсказка canonical slug в `ContentForm`.
- **Пациент:** `/app/patient/help`, `/app/patient/help/[slug]` (`listHelpArticlesForPatient`, `PatientContentSlugArticle`); `force-dynamic`.
- **Хвосты:** `app-layer/content/revalidatePatientContentPaths.ts` (save/lifecycle/auth); редирект `/app/patient/content/[slug]` → `/help/[slug]`; `CabinetInfoLinks` + `buildCabinetInfoLinkTiles` (плитки «Как подготовиться» / «Стоимость» при slug `preparation` / `cost` опубликованы).
- **Примечание:** `CabinetInfoLinks` — RSC готов, на экран «Запись» пока не смонтирован (`cabinet/page` → redirect booking). Контент для плиток — создать в CMS вручную.
- **Проверки:** vitest `help-content`, `revalidatePatientContentPaths`, `cabinetInfoLinkTiles`; см. [`LOG.md`](DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) §фаза 6.

## Фаза 5 (закрыта)

- Cross-patient «К проверке» на `/app/doctor` («Сегодня»): `countPendingTestEvaluationAttemptsGlobal` + `listPendingTestEvaluationsGlobal` (top 10 попыток), секция `#doctor-today-section-pending-tests`, строка в «Требует внимания».
- Deep link `focusItemId` (UUID) на экране инстанса — scroll/highlight с retry; `discussionItem` — тоже только валидный UUID; карточка / «Сегодня» «Оценить» — тот же query.
- Бейдж меню «Сегодня» (фаза 5): `GET /api/doctor/pending-program-tests/summary`. С фазой 7 — суммарный `todayAttention` (+ `GET /api/doctor/proactive-insights/summary`).
- ROADMAP_2 §2.2–2.3 — closed; план §фаза 5, `api.md`, targeted vitest — см. [`LOG.md`](DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) §фаза 5.

## Фаза 7 (закрыта)

- **B6:** превью в списке шаблонов — `MediaThumb` + worker `previewSmUrl` из `media_files` (`enrichTemplateListPreviewMedia`, `templateListPreviewToPreviewUi`).
- **Proactive MVP на «Сегодня»:** модуль `doctor-proactive-insights`; сигналы `wellbeing_low_streak` / `program_inactivity` (только `on_support`); порт `queryInsights` + `listForPatient`.
- **UI:** секция «Сигналы пациентов»; блок «Сигналы» в карточке (Обзор); deep links (`#doctor-client-section-wellbeing`, экран instance); бейдж меню `todayAttention` = «К проверке» + proactive.
- **API:** `GET /api/doctor/proactive-insights/summary`; доки — `DOCTOR_DASHBOARD_METRICS.md`, `api.md`, `ROADMAP_2.md` §4.1.
- **Аудит (2026-06-02):** inactivity по активному instance; якорь streak сегодня/вчера; один проход insights; scoped `listForPatient`; тесты `mapProactiveInsightsForToday`, `doctorNavLinks`, `mediaPreviewUiModel.templateList`.
- **Backlog:** настраиваемые пороги / доп. сигналы — RECOMMENDATIONS этап 8.
- **Проверки:** vitest proactive + DoctorTodayDashboard + loadDoctorTodayDashboard; `tsc --noEmit` webapp. См. [`LOG.md`](DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) §фаза 7.

## Вне scope workqueue

D5 `domain→kind`, полная переработка `/diary`, курсы, UX истории тестов (после доработки элементов тестов). Proactive: **MVP закрыт** (фаза 7); настраиваемые пороги и расширение сигналов — backlog этап 8 ([`RECOMMENDATIONS_AND_ROADMAP.md`](APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md)).
