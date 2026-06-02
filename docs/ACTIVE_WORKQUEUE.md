# Активная очередь (врач + пациент + CMS)

**Синхронизация:** 2026-06-02. План-очередь (канон в git): [`.cursor/plans/archive/active_workqueue_plan_30236040.plan.md`](../.cursor/plans/archive/active_workqueue_plan_30236040.plan.md); IDE-копия — `~/.cursor/plans/active_workqueue_plan_30236040.plan.md`. Фаза 1: `phase1_support_model_7c745931`. Сводка чеклистов — [`TODO.md`](TODO.md) §Doctor card.

| Фаза | Статус | План / лог |
|------|--------|------------|
| **0** — hotfix UI «Упражнения» (P0) | **Закрыта** | active workqueue §Фаза 0 |
| **1** — «На сопровождении» + гейты comment/media | **Закрыта** | Cursor `phase1_support_model_7c745931.plan.md`; LOG: [`DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md`](DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) |
| **2A** — дизайн карточки врача | **Закрыта** | [`CARD_REDESIGN_PLAN.md`](DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/CARD_REDESIGN_PLAN.md) |
| **2B** — реализация карточки | **Закрыта** | LOG §2026-06-02 |
| **2C** — задачи специалиста | **Закрыта** (аудит 2026-06-02) | [`SPECIALIST_TASKS.md`](DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/SPECIALIST_TASKS.md), LOG §2C |
| **3** — черновик редактора программы | **Закрыта** (2026-06-02) | LOG §фаза 3 |
| **4** — фильтры каталога (регион + нагрузка) | **Закрыта** (2026-06-02) | LOG §фаза 4 |
| **5** — cross-patient inbox «К проверке» на «Сегодня» + `focusItemId` | **Закрыта** (2026-06-02) | LOG §фаза 5 |
| **6** — CMS enum + `/help` | Открыта | **следующая** |
| **7** — хвосты docs/шаблонов | Частично | этот файл |

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

**Следующий шаг очереди:** фаза **6** — CMS enum типов контента + `/help`.

## Фаза 5 (закрыта)

- Cross-patient «К проверке» на `/app/doctor` («Сегодня»): `countPendingTestEvaluationAttemptsGlobal` + `listPendingTestEvaluationsGlobal` (top 10 попыток), секция `#doctor-today-section-pending-tests`, строка в «Требует внимания».
- Deep link `focusItemId` (UUID) на экране инстанса — scroll/highlight с retry; `discussionItem` — тоже только валидный UUID; карточка / «Сегодня» «Оценить» — тот же query.
- Бейдж меню «Сегодня»: `GET /api/doctor/pending-program-tests/summary` → `{ ok, count }`; `useDoctorPendingProgramTestsCount`.
- ROADMAP_2 §2.2–2.3 — closed; план §фаза 5, `api.md`, targeted vitest — см. [`LOG.md`](DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) §фаза 5.

## Вне scope «сейчас»

D5 `domain→kind`, полная переработка `/diary`, курсы, proactive-лента (после карточки), UX истории тестов (после доработки элементов тестов).
