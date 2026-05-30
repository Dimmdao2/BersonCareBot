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
| `PatientPlanTodayRemindersCard.tsx` | **Активная** программа: **сворачиваемый** блок «**Расписание**» (иконка `Bell` + шеврон, по умолчанию свёрнут). Одна строка: триггер **flex-1** + узкий аксессор **`trailingAccessory`** (обычно `PatientPlanSupportCard`). Корень `Collapsible` — **`w-full` столбца shell** (`#app-shell-content`): раскрытая область занимает **эту же ширину**, не узкую ячейку flex-ребёнка. Внутри — строки **Тренировки** / **Разминки** и ссылка «Настроить расписание» → `/app/patient/reminders#patient-reminders-rehab`. Размещение: **над** hero и вкладками в `PatientTreatmentProgramDetailClient`. Тексты строк собираются в RSC `[instanceId]/page.tsx` через **`formatPlanReminderTodayLine`** (`apps/webapp/src/modules/reminders/summarizeReminderForCalendarDay.ts`): при оставшихся слотах на сегодня — «Сегодня еще n: в ЧЧ:ММ, …»; если слоты на сегодня прошли — «На сегодня всё»; иначе — сводка как `summarizeReminderForCalendarDay` / «не настроено». |
| `PatientPlanSupportCard.tsx` | Компактная ссылка (иконка + «Поддержка», ширина по содержимому) на чат поддержки (`routePaths.patientMessages`). |
| `PatientPlanPersonalProgramCtaCard.tsx` | **Активная** программа, **production:** только если `assignment_source` — **`promo`** или **`course`** — см. `patientPersonalProgramCtaShouldRender`; **не production** (`next dev`, тесты) — блок **всегда**, чтобы можно было верстать на типичном назначении врачом. Под панелями вкладок — **hero-геометрия главной**, слот изображения **слева**, текст и кнопка **справа** (`patientHomeHeroImageSlotLeftClass`, `patientHomeHeroTextColumnImageLeftClass`, `patientHeroPrimaryActionClass`), **без** верхней строки бейджей. Статика фото: `public/patient/personal-program-consultation.png`. Кнопка «Отправить заявку» → **`routePaths.intakeLfk`** (`/app/patient/intake/lfk`, онлайн-реабилитация). |
| `PatientPlanTabStrip.tsx` | Липкая полоска вкладок (`sticky`, `z-[5]`). |
| `PatientPlanTabPanels.tsx` | Панели вкладок: `lazy` + `Suspense` для «Программа»/«Рекомендации», блок «Прогресс». |
| `PatientProgramStagesTimeline.tsx` | Timeline этапов на вкладке «Прогресс». |
| `PatientProgramControlCard.tsx` | Карточка «Следующий контроль». |
| `PatientProgramPassageStatisticsSection.tsx` | Статистика прохождения: primary — `patient_diary_day_snapshots` (`GET .../passage-stats`, поле `showCollectingCopy`); окно может начинаться раньше `createdAt` текущего инстанса при более ранних снимках. |
| `PatientProgramBlockHeading.tsx` | Заголовок секции с иконкой. |
| `PatientStageHeaderFields.tsx` | Поля шапки этапа (экспорт для страницы этапа и др.). |
| `PatientInstanceStageBody.tsx` / `PatientInstanceStageItemCard.tsx` | Тело этапа и карточка пункта (списки, действия). Встроенный **`clinical_test`**: после `refresh` (форма, «Снять Новое», `mark-viewed` по видимости) повторно подтягивается snapshot через `reloadClinicalTestSnap`. |
| `usePostMarkItemViewedWhenVisible.ts` | IntersectionObserver → `mark-viewed`. |

## Вкладка «Программа»: обсуждение с плитки

- В **`PatientTreatmentProgramStagePageProgramSection`** (только `assignment_source === doctor` и `patient_program_discussion_ui_enabled`) — кнопки «Камера» и «Комментарии» (badge/dot из batch summary) открывают **`ProgramItemDiscussionDialog`** → **`POST .../discussion`** (dual-write в `program_action_log`). При **`patient_program_discussion_media_submission_enabled`** (и UI-флаге) «Камера» сразу открывает **`ProgramItemDiscussionMediaPicker`** → presign/confirm → **`POST .../discussion/media`**. Для **promo** и при выключенном feature-flag controls скрыты.
- На странице пункта **`PatientProgramStageItemPageClient`**: layout `[Камера][Отметить выполнение]`, preview последнего комментария, `ProgramItemCompleteDialog` → **`POST .../progress/complete`** с optional payload (`perceivedDifficulty`, `reps`, `weightKg`); камера — тот же media-picker при обоих rollout-флагах.
- Ответ врача из Telegram/MAX (кнопка «Ответить» под уведомлением) и из **webapp-журнала программы** попадает в thread и в **`/app/patient/messages`** с префиксом `Ответ на ваш комментарий к упражнению «…»:` — не путать с **`/api/doctor/comments`**. Канон: [`docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md`](../../../../../../docs/ARCHITECTURE/DOCTOR_TELEGRAM_PROGRAM_NOTE_REPLY.md), инициатива: [`docs/archive/2026-05-initiatives/PROGRAM_ITEM_DISCUSSION_INITIATIVE/README.md`](../../../../../../docs/archive/2026-05-initiatives/PROGRAM_ITEM_DISCUSSION_INITIATIVE/README.md).

## Feature flags (rollout)

| `system_settings` key | Поверхность |
|------------------------|-------------|
| `patient_program_discussion_ui_enabled` | Комментарии, dialog, unread, item preview |
| `patient_program_discussion_media_submission_enabled` | Камера + upload (вместе с UI-флагом) |
| `patient_program_discussion_doctor_reply_from_log_enabled` | Ответ врача из журнала (doctor UI) |

## Инварианты после декомпозиции

- Пауза повторного «Выполнено» для **простых** пунктов плана (не ЛФК-форма): длительность из `system_settings` **`patient_treatment_plan_item_done_repeat_cooldown_minutes`** (`scope=admin`, минуты 5–180, default 60); RSC передаёт число в клиент как `planItemDoneRepeatCooldownMinutes`, на клиенте `planItemDoneRepeatCooldownMsFromMinutes` + `itemDoneCooldown.ts` (`apps/webapp/src/modules/treatment-program/itemDoneCooldown.ts`).
- Один клиентский корень состояния на странице детали; без нового сегмента `layout.tsx` только ради разбиения.
- Вкладки «Программа» и «Рекомендации» остаются на `React.lazy` + prefetch в оркестраторе.
- Публичные импорты для [`PatientTreatmentProgramStagePageClient`](../PatientTreatmentProgramStagePageClient.tsx) не меняются (баррель выше).

Документ инициативы (от корня репозитория): `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/README.md`.
