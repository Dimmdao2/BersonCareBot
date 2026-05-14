# program-detail — страница `/app/patient/treatment/[instanceId]`

Клиентский слой **«Мой план»** (программа лечения): один корневой оркестратор состояния и вложенные модули по визуальным слоям.

## Точки входа

| Экспорт | Файл-баррель |
|---------|----------------|
| `PatientTreatmentProgramDetailClient`, `PatientInstanceStageBody`, `PatientStageHeaderFields`, `patientStageHasHeaderFields` | [`../PatientTreatmentProgramDetailClient.tsx`](../PatientTreatmentProgramDetailClient.tsx) |

Реализация корневого клиента: [`PatientTreatmentProgramDetailClient.tsx`](PatientTreatmentProgramDetailClient.tsx) в этой папке.

## Карта модулей

| Файл | Роль |
|------|------|
| `patientPlanDetailFormatters.ts` | Чистые утилиты подписей и истории (без React). |
| `patientTreatmentProgramListItemClass.ts` | Общий класс плотной строки списка (программа + экран этапа). |
| `PatientProgramHeroHistoryPopover.tsx` | Popover «История программы» в hero (`z-20`). |
| `PatientPlanHero.tsx` | Hero завершённой (`PatientPlanHeroCompleted`) и активной (`PatientPlanHeroActive`) программы. |
| `PatientPlanTodayRemindersCard.tsx` | Для **активной** программы: краткая сводка напоминаний «сегодня» (реабилитация + разминки при доступности раздела) и ссылка «Настроить расписание» → `/app/patient/reminders#patient-reminders-rehab`. Данные и строки сводки собираются в RSC `[instanceId]/page.tsx` (`planReminderStrip`). |
| `PatientPlanTabStrip.tsx` | Липкая полоска вкладок (`sticky`, `z-[5]`). |
| `PatientPlanTabPanels.tsx` | Панели вкладок: `lazy` + `Suspense` для «Программа»/«Рекомендации», блок «Прогресс». |
| `PatientProgramStagesTimeline.tsx` | Timeline этапов на вкладке «Прогресс». |
| `PatientProgramControlCard.tsx` | Карточка «Следующий контроль». |
| `PatientProgramPassageStatisticsSection.tsx` | Статистика прохождения (прогресс). |
| `PatientProgramBlockHeading.tsx` | Заголовок секции с иконкой. |
| `PatientStageHeaderFields.tsx` | Поля шапки этапа (экспорт для страницы этапа и др.). |
| `PatientInstanceStageBody.tsx` / `PatientInstanceStageItemCard.tsx` | Тело этапа и карточка пункта (списки, действия). Встроенный **`clinical_test`**: после `refresh` (форма, «Снять Новое», `mark-viewed` по видимости) повторно подтягивается snapshot через `reloadClinicalTestSnap`. |
| `PatientLfkChecklistRow.tsx` | Форма отметки ЛФК за сегодня. |
| `usePostMarkItemViewedWhenVisible.ts` | IntersectionObserver → `mark-viewed`. |

## Инварианты после декомпозиции

- Один клиентский корень состояния на странице детали; без нового сегмента `layout.tsx` только ради разбиения.
- Вкладки «Программа» и «Рекомендации» остаются на `React.lazy` + prefetch в оркестраторе.
- Публичные импорты для [`PatientTreatmentProgramStagePageClient`](../PatientTreatmentProgramStagePageClient.tsx) не меняются (баррель выше).

Документ инициативы (от корня репозитория): `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md`.
