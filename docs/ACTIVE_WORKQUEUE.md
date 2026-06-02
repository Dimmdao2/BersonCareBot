# Активная очередь (врач + пациент + CMS)

**Синхронизация:** 2026-06-02. Зеркало плана Cursor `active_workqueue_plan_30236040` и деталей фазы 1 в `phase1_support_model_7c745931`. Сводка чеклистов — [`TODO.md`](TODO.md) §Doctor card.

| Фаза | Статус | План / лог |
|------|--------|------------|
| **0** — hotfix UI «Упражнения» (P0) | **Закрыта** | active workqueue §Фаза 0 |
| **1** — «На сопровождении» + гейты comment/media | **Закрыта** | Cursor `phase1_support_model_7c745931.plan.md`; LOG: [`DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md`](DOCTOR_PATIENT_CARD_TREATMENT_PROGRAM_INITIATIVE/LOG.md) |
| **2A** — дизайн карточки врача | Открыта | active workqueue §Фаза 2A |
| **2B** — реализация карточки | Открыта | после 2A |
| **3** — черновик редактора программы | Открыта | |
| **4** — фильтры каталога (регион + нагрузка) | Открыта | |
| **5** — cross-patient inbox «Сегодня» | Открыта | после 2 |
| **6** — CMS enum + `/help` | Открыта | |
| **7** — хвосты docs/шаблонов | Частично | этот файл |

## Фаза 0 (закрыта)

Компактный ряд «Комментарии» + «Отметить выполнение» на плитках программы (`PatientTreatmentProgramStagePageProgramSection`, согласование с item page). Тесты: `PatientTreatmentProgramStagePageProgramSection.test.tsx`.

## Фаза 1 (закрыта)

- Таблица `doctor_patient_support`, миграция `0101_doctor_patient_support.sql`, backfill активных doctor-программ.
- `onSupportCount` / «Сегодня» / `?support=on` / `?support=programWithoutSupport`.
- Врач: `DoctorClientSupportPanel`, `GET/PATCH …/support-settings`, defaults в `/app/settings`.
- Пациент: `loadPatientProgramInteractionBundle`, UI visible/disabled, API `patient_support_*_disabled`.
- Док: [`DOCTOR_DASHBOARD_METRICS.md`](ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md), [`PROMO_ASSIGNMENT_SOURCE.md`](PROMO_ASSIGNMENT_SOURCE.md), `apps/webapp/src/app/api/api.md`.

**Следующий шаг очереди:** фаза **2A** (дизайн карточки врача) — обязателен до кода 2B.

## Вне scope «сейчас»

D5 `domain→kind`, полная переработка `/diary`, курсы, proactive-лента (после карточки), UX истории тестов (после доработки элементов тестов).
