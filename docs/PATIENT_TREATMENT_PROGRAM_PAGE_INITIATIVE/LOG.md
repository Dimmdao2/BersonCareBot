# LOG — PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE

## 2026-05-08 — аудит декомпозиции detail: чистка оркестратора, документация

- **Код:** в `apps/webapp/src/app/app/patient/treatment/program-detail/PatientTreatmentProgramDetailClient.tsx` удалены неиспользуемые `busy`, неиспользуемая переменная `base`, состояние для полей **`doneTodayCountByActivityKey`** / **`lastDoneAtIsoByActivityKey`** из ответа checklist (на экране detail они не потреблялись; ответ API по-прежнему может содержать поля; экран пункта `PatientProgramStageItemPageClient` по-прежнему ведёт полный чеклист при необходимости). Восстановлена **`formatPatientTestResultRawValue`** в `patientPlanDetailFormatters.ts`.
- **Док:** добавлен `apps/webapp/src/app/app/patient/treatment/program-detail/README.md`; обновлены `docs/TODO.md`, `README.md` инициативы, `docs/archive/2026-05-initiatives/TREATMENT_PROGRAM_INITIATIVE/LOG.md`.
- **Проверки:** `pnpm --dir apps/webapp exec tsc --noEmit`; eslint на затронутых файлах webapp; vitest на `PatientTreatmentProgramDetailClient.test.tsx`, `[instanceId]/page.nudgeResilience.test.tsx`, `[instanceId]/page.templateDescription.test.tsx`.

## 2026-05-08 — статистика прохождения, единый чеклист вкладки «Программа», декомпозиция detail

- **Статистика:** вкладка «Прогресс» — секция «Статистика прохождения»: календарные дни **0–2** от `createdAt` в зоне пациента — тексты «Статистика пока собирается» / «Регулярность в занятиях…»; с **4-го календарного дня** — метрики через **`GET /api/patient/treatment-program-instances/[instanceId]/passage-stats`** (`calendarDaysInWindow`, `daysWithActivity`, `missedDays`, `avgCompletionsPerDay`, `neverCompletedChecklistItemCount`). Окно для метрик: от начала дня назначения до «сегодня» (активная) или до дня `updatedAt` (завершённая), IANA из `resolveCalendarDayIanaForPatient`; агрегации по `program_action_log` — `ProgramActionLogPort.countDistinctLocalCalendarDaysWithDoneInWindow`, плюс сумма completion-events; **`neverCompletedChecklistItemCount`** — только пункты из **`buildPatientProgramChecklistRows(detail)`** (видимый пациенту чеклист), без заблокированных этапов. На клиенте граница «первые три дня» пересчитывается при **`refresh`** родителя и раз в минуту (`PatientProgramPassageStatisticsSection`), чтобы не зависеть только от времени монтирования.
- **Чеклист:** `PatientTreatmentProgramDetailClient` хранит полный снимок включая **`lastDoneAtIsoByItemId`**; вкладка «Программа» (`PatientTreatmentTabProgram` → `PatientTreatmentProgramStagePageClient` с `embedded`) получает **`embeddedChecklist`** и **`onRefreshDetail`** — второй **`GET …/checklist-today`** на монтировании стейдж-клиента отключён; **`refresh`** при embedded делегирует родителю; для embedded UI этапа используется **`stageForUi = props.stage`** (источник правды — родитель после обновления экземпляра), для отдельного экрана этапа — локальный **`detachedStage`**, обновляемый из **`refresh`**.
- **Структура кода:** основной клиент перенесён в **`apps/webapp/src/app/app/patient/treatment/program-detail/PatientTreatmentProgramDetailClient.tsx`**; реэкспорт из **`treatment/PatientTreatmentProgramDetailClient.tsx`**; вынесены **`PatientProgramBlockHeading.tsx`**, **`PatientProgramPassageStatisticsSection.tsx`**.
- **Тесты:** `patient-plan-passage-stats.test.ts`, расширены `patient-program-actions.test.ts` (в т.ч. сценарий «neverCompleted только видимый чеклист»), `PatientTreatmentProgramDetailClient.test.tsx` (мок `passage-stats`, сценарий первых трёх дней).
- **Проверки:** `pnpm --dir apps/webapp exec tsc --noEmit`; `pnpm --dir apps/webapp exec vitest run` на файлах выше.

## 2026-05-07 — канон пациентского «Плана»: `/treatment`, вкладки, навигация

- **Маршруты:** пациентский раздел программ — **`/app/patient/treatment`** и **`/app/patient/treatment/[instanceId]`**; код под `apps/webapp/src/app/app/patient/treatment/**`. Постоянные редиректы с **`/app/patient/treatment-programs`** — `next.config.ts`.
- **Навигация:** `getPatientPrimaryNavActiveId` — только точное совпадение или префикс с **`/`** после базы (`/treatment/...`), чтобы не подсвечивать «План» на устаревшем **`…/treatment-programs`** (ложный префикс `…/treatment`).
- **Тесты:** `navigation.test.ts` (юнит на `getPatientPrimaryNavActiveId`); `PatientTopNav.test.tsx` — канонический путь и негатив на legacy.
- **Док:** `BLOCK_LAYOUT_REFERENCE.md` (§1, §3–§6 сводка), `ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md`, корневой `docs/README.md`; комментарии в `treatment/page.tsx`, `stage-semantics.ts`.
- **Проверки:** `pnpm --dir apps/webapp exec vitest run src/app-layer/routes/navigation.test.ts src/shared/ui/PatientTopNav.test.tsx`.

## 2026-05-07 — экран этапа: аудит-фиксы и док-синхронизация

- **Описание в hero:** переключатель «развернуть / свернуть» показывается при фактическом переполнении трёх строк (`line-clamp-3`): измерение `scrollHeight` vs `clientHeight` + `ResizeObserver`; при смене текста/этапа — `key` на `StageDescriptionBlock` вместо сброса состояния в `useEffect`.
- **`mergeLastActivityDisplayedIso`:** одна реализация в `stageItemSnapshot.ts`; `PatientTreatmentProgramDetailClient.tsx` импортирует её (без дублирования тела функции).
- **Док:** `ARCHITECTURE/PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md` — раздел про маршрут `stages/[stageId]` и отличие фильтра «Программа этапа» от архива; `docs/README.md` — уточнение ссылки; план Cursor `patient_stage_screen_ui_2a5ac8a6.plan.md` — статус реализации и уточнение scope по `DetailClient`.
- **Проверки:** `pnpm install --frozen-lockfile && pnpm run ci` в корне репозитория — зелёный; точечно `eslint`/`vitest` на затронутых путях.

## 2026-05-06 — follow-up аудита снимков ЛФК (пустой `media`, парсер, тесты)

- **Контекст чата:** после аудита превью упражнений ЛФК в модалке «Состав этапа» закрыты пункты про сериализацию и покрытие парсера без отдельного PG-контракта на БД.
- **`pgTreatmentProgramItemSnapshot.ts`:** для `lfk_complex` у каждой строки `exercises[]` ключ `media` добавляется только при непустом списке; для `exercise` и `recommendation` ключ верхнего уровня `media` опускается при отсутствии каталожных медиа.
- **`programActionActivityKey.ts`:** `listLfkSnapshotExerciseLines` выставляет `line.media` только для непустого массива объектов (не массивов), чтобы битые/старые значения не протекали в UI.
- **Тесты:** добавлен `src/modules/treatment-program/programActionActivityKey.test.ts`; регрессия модалки — `PatientTreatmentProgramDetailClient.test.tsx`.
- **Проверки:** `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/programActionActivityKey.test.ts src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx` и `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/` — зелёные.
- **Док:** обновлён `BLOCK_LAYOUT_REFERENCE.md` §3 (абзац про превью ЛФК и ссылки на код/тесты).

## 2026-05-06 — модалка «Состав этапа»: иконки при пустом медиа

- **`PatientTreatmentProgramDetailClient.tsx`:** в слоте превью строки — `PatientCatalogMediaStaticThumb`, если есть выбранное медиа; иначе для упражнения (строка ЛФК, элемент `exercise`) — `Dumbbell`, для `recommendation` — `ScrollText`; наборы тестов в модалке не перечисляются (см. `stage-semantics`).
- **Тесты:** расширен сценарий модалки в `PatientTreatmentProgramDetailClient.test.tsx` (вторая строка ЛФК без `img`, рекомендация без медиа — `svg`).
- **`stage-semantics.ts`:** `isInstanceStageItemShownInPatientCompositionModal` исключает `test_set` (как поверхности программы).
- **Тесты:** расширен `stage-semantics.test.ts`.
- **Док:** `BLOCK_LAYOUT_REFERENCE.md` §3 — модалка без наборов тестов.

## 2026-05-05 — follow-up: токены плана «Мой план», RSC-тест, док-синхронизация

- **UI (detail):** строки timeline — прошлые этапы `bg-muted/20 opacity-70`, заблокированные будущие `opacity-50` (как в плане); описание шаблона под заголовком — `line-clamp-3`; на `<section>` timeline добавлен `id="patient-program-current-stage"` для якоря из roadmap.
- **Тесты:** добавлен `[instanceId]/page.templateDescription.test.tsx` — загрузка описания через `getTemplate` при `templateId`, `patientSuppressShellTitle`, отсутствие 404 при падении `getTemplate`. Обновлён `page.nudgeResilience.test.tsx` у **списка** программ: мок `redirect`, сценарий empty state без активной программы и сценарий редиректа при активной (страница списка больше не вызывает nudge).
- **Док:** `BLOCK_LAYOUT_REFERENCE.md` §3–§6 приведены к текущему коду; `STAGE_C.md` — примечание про объединение C4/C6 в timeline; `README.md` — статус и описание `BLOCK_LAYOUT_REFERENCE`.

## 2026-05-05

- Создана папка инициативы `docs/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/` с `README.md` (main plan: таблица этапов A–D и модели агентов), `STAGE_PLAN.md`, `LOG.md`.
- Источник правды по scope/DoD: `docs/APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md` §1.0, §1.1, §1.1a, §1.1b.
- Добавлена подробная декомпозиция в отдельных файлах: `STAGE_A.md`, `STAGE_B.md`, `STAGE_C.md`, `STAGE_D.md`.
- Добавлен `PROMPTS_COPYPASTE.md` с конвейером: для каждого этапа `EXEC -> AUDIT -> FIX -> COMMIT`; в конце всей инициативы `GLOBAL AUDIT -> GLOBAL FIX -> PREPUSH -> PUSH`.
- Зафиксировано правило: после каждого этапа только commit; полный `pnpm run ci` — только в финальном pre-push проходе.
- **Проверка кода (2026-05-05):** Stage A (`started_at`) **уже реализован** в полном объёме:
  - schema: `treatmentProgramInstances.ts` l.81 ✅
  - migration: `0043_treatment_program_instance_stage_started_at.sql` с backfill ✅
  - pg repo: idempotent patch при `in_progress` ✅
  - inMemory repo: аналогичная логика ✅
  - domain types: `TreatmentProgramInstanceStageRow.startedAt: string | null` ✅
  - contract test: `pgTreatmentProgramInstance.startedAt.contract.test.ts` ✅
  - `progress-service.ts` изменений не требует (логика на уровне repo-patch).
  - STAGE_A.md переориентирован на верификацию, не на имплементацию с нуля.
- **Stage A gate (EXEC/AUDIT/FIX, 2026-05-05):**
  - Прочитаны и применены: `README.md`, `docs/README.md`, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/HOST_DEPLOY_README.md`, `STAGE_A.md`, `STAGE_PLAN.md`, `ROADMAP_2.md` (§1.0), правила инициативы по модульной изоляции и patient UI/shared primitives (scope не расширяли).
  - Scope этапа подтверждён по `STAGE_A.md`: только data/repo/type/contract-test слой `started_at`, без UI и без правок `progress-service.ts`.
- **Stage A A1..A3 (verification):**
  - A1: `startedAt` присутствует и консистентен в `db/schema`, доменном типе `TreatmentProgramInstanceStageRow`, `pg` и `inMemory` репозиториях; поведение «первый вход в `in_progress`» idempotent.
  - A2: миграция `0043_treatment_program_instance_stage_started_at.sql` additive; backfill ограничен `status = 'in_progress'` и `started_at IS NULL`, уже выставленные значения не перетираются.
  - A3: дополнительных пробелов в read-модели/маппингах/edge-cases не обнаружено; кодовые правки не потребовались.
- **Stage A A4 (target checks):**
  - `pnpm --dir apps/webapp exec tsc --noEmit` ✅
  - `pnpm --dir apps/webapp lint --max-warnings=0 -- src/modules/treatment-program src/infra/repos db/schema` ✅
  - `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts src/modules/treatment-program` ✅
- **Stage A A5 (log + status):** pre-flight подтверждён, пробелов не найдено, статус этапа: **Stage A closed**.
- **Stage A closed + commit.** (Stage A — верификационный, code diff пустой; документация закоммичена в `41c4c91a` совместно с инициализацией Stage B-docs.)
- **Stage A FIX по `AUDIT_STAGE_A.md` (2026-05-05):**
  - Critical: отсутствуют, исправления не требуются.
  - Major: отсутствуют, исправления не требуются.
  - Minor: отсутствуют; defer не оформлялся, так как нет пунктов для отложенного исправления.
  - Повтор целевых проверок Stage A после FIX:
    - `pnpm --dir apps/webapp exec tsc --noEmit` ✅
    - `pnpm --dir apps/webapp lint --max-warnings=0 -- src/modules/treatment-program src/infra/repos db/schema` ✅
    - `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgTreatmentProgramInstance.startedAt.contract.test.ts src/modules/treatment-program` ✅
- **Stage B gate (EXEC старт, 2026-05-05):**
  - Прочитаны и применены: `STAGE_B.md`, `STAGE_PLAN.md`, `ROADMAP_2.md` (§1.1a), а также правила `.cursor/rules/clean-architecture-module-isolation.mdc`, `.cursor/rules/patient-ui-shared-primitives.mdc`, `.cursor/rules/no-unsolicited-followups.mdc`.
  - Подтверждено предусловие `STAGE_B.md`: Stage A закрыт (см. записи выше: `Stage A closed` + `AUDIT/FIX`).
  - Scope Stage B зафиксирован: только detail MVP `/treatment-programs/[instanceId]` (B1..B8), без миграций, без портовых контрактов, без маршрута `stages/[stageId]` (этап C).
- **Stage B B1..B6 (implementation status):**
  - B1: верхний блок detail (название, текущий этап, CTA «Открыть текущий этап», ссылка «Архив этапов») присутствует.
  - B2: этап 0 рендерится отдельным блоком «Общие рекомендации».
  - B3: текущий этап выводится как основной рабочий блок с единым списком назначений.
  - B4: завершённые/пропущенные этапы вынесены в `<details>` и скрыты по умолчанию.
  - B5: блок «Чек-лист на сегодня» на detail отсутствует.
  - B6: сигнал «План обновлён» и дата ожидаемого контроля (`started_at + expected_duration_days` при наличии обоих полей) реализованы.
  - Дополнительные правки кода в рамках Stage B не потребовались (текущая реализация уже соответствует B1..B6).
- **Stage B B7 (target checks):**
  - `pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs` ✅
  - `pnpm --dir apps/webapp exec tsc --noEmit` ✅
  - `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs` ✅
  - Включая файлы из `STAGE_B.md`: `PatientTreatmentProgramDetailClient.test.tsx` и `page.nudgeResilience.test.tsx` — зелёные.
- **Stage B B8 (log + status):** запись внесена, вне-scope изменения не выполнялись, статус этапа: **Stage B closed**.
- **Stage B FIX по `AUDIT_STAGE_B.md` (2026-05-05):**
  - Critical: отсутствуют, исправления не требуются.
  - Major: отсутствуют, исправления не требуются.
  - Minor: отсутствуют; defer не оформлялся, так как нет пунктов для отложенного исправления.
  - Повтор целевых проверок Stage B после FIX:
    - `pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs` ✅
    - `pnpm --dir apps/webapp exec tsc --noEmit` ✅
    - `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs` ✅
- **Stage B closed + commit:** этап B закрыт после FIX и подготовлен к отдельному commit (без запуска полного `pnpm run ci`, по правилу этапов).

- **Stage C gate (EXEC старт, 2026-05-05):**
  - Прочитаны и применены: `STAGE_C.md`, `STAGE_PLAN.md`, `ROADMAP_2.md` (§1.1b), правила `patient-ui-shared-primitives.mdc`, `clean-architecture-module-isolation.mdc`, `no-unsolicited-followups.mdc`.
  - Подтверждено предусловие `STAGE_C.md`: Stage B закрыт (см. записи выше: `Stage B closed`); `Collapsible` из `@base-ui/react` присутствует в `apps/webapp/src/components/ui/collapsible.tsx` ✅.
  - Scope Stage C зафиксирован: только UI-слой detail-страницы программы + новый маршрут `stages/[stageId]`; без миграций, без портовых контрактов.
- **Stage C C1–C10 (implementation):**
  - **C8**: добавлен `patientTreatmentProgramStage(instanceId, stageId)` в `apps/webapp/src/app-layer/routes/paths.ts`.
  - **patientVisual**: добавлены `patientStageTitleClass` (`text-xl font-bold text-[var(--patient-color-primary)]`) и `patientSurfaceProgramClass` (alias → `patientSurfaceInfoClass`) в `apps/webapp/src/shared/ui/patientVisual.ts`.
  - **Play SVG**: статический ассет создан в `apps/webapp/public/patient/ui/play.svg`; используется через `<img>` с `className="invert"` для белого цвета на цветном фоне hero.
  - **C7**: создан RSC `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/stages/[stageId]/page.tsx` — загружает detail программы, находит этап по `stageId`, рендерит `PatientTreatmentProgramStagePageClient`, back-link → detail, 404 при отсутствии экземпляра или этапа.
  - **Вспомогательный клиент**: создан `PatientTreatmentProgramStagePageClient.tsx` рядом с detail-клиентом; управляет state (busy/error/doneItemIds), refresh, рендерит `PatientInstanceStageBody`.
  - **C1**: hero-карточка с `patientSurfaceProgramClass`: badge «МОЙ ПЛАН» (левый верх), badge «Этап X из Y» (правый верх), заголовок программы, индикатор «● Plan обновлён» (`text-destructive`), CTA «Открыть план» + Play SVG → `#patient-program-current-stage`.
  - **C2**: `PatientProgramControlCard` — только при `controlLabel != null`; поверхность `patientSurfaceWarningClass`; иконка `CalendarCheck`; кнопка «Выполнить тесты» (`patientButtonWarningOutlineClass`) → `stages/[stageId]`; кнопка «Записаться на приём» (`patientButtonSuccessClass`) → `routePaths.cabinet`.
  - **C3**: этап 0 обёрнут в `Collapsible` из `@/components/ui/collapsible` с поверхностью `patientSurfaceSuccessClass`; trigger: иконка `Shield`, текст «Рекомендации на период», шеврон; `open` default `false` (по умолчанию Base UI).
  - **C4**: inline `PatientInstanceStageBody` текущего этапа заменён на превью-карточку (`patientCardClass`): label «Текущий этап», `patientStageTitleClass`, subtitle из `goals/objectives` (первые 80 символов), CTA «Открыть этап» → `stages/[stageId]`. `id="patient-program-current-stage"` на превью-блоке.
  - **C5 (UX-решение)**: развёрнутый список результатов тестов удалён; заменён секцией «История тестирования» с `ClipboardList`, подписью и кнопкой «Перейти к этапу» → текущий `stages/[stageId]`. Показывается только при `status === "active"` и наличии `currentWorkingStage`. Полноценная страница истории тестирования — post-MVP (отдельный маршрут/модалка); будет проработана в отдельной задаче.
  - **C6**: `<details>` с inline-телами архивных этапов заменён на компактный список `patientListItemClass`: `CheckCircle2` + «Этап N. Название» + `ChevronRight` → `Link` на `stages/[stageId]`. Дата `completedAt` не показана — поля нет в `TreatmentProgramInstanceStageRow` (не вводим в этом проходе).
  - `PatientInstanceStageBody` экспортирован из `PatientTreatmentProgramDetailClient.tsx` для использования на странице этапа.
- **Stage C C9 (тесты):**
  - `PatientTreatmentProgramDetailClient.test.tsx`: тесты A1 и B7-FIX обновлены под новую структуру C3 — добавлен `fireEvent.click(screen.getByText("Рекомендации на период"))` перед assertions (Base UI Collapsible v1.3 лениво рендерит контент Panel, только после открытия). Остальные тесты (A5, 1.1a, plan-updated) — зелёные без изменений.
  - `page.nudgeResilience.test.tsx` — зелёный без изменений (мокирует `PatientTreatmentProgramDetailClient` целиком).
- **Stage C C10 (целевые проверки):**
  - `pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs src/app-layer/routes src/shared/ui` ✅
  - `pnpm --dir apps/webapp exec tsc --noEmit` ✅
  - `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs` ✅ (14/14)
- **Stage C closed.**
- **Stage C FIX по `AUDIT_STAGE_C.md` (2026-05-05):**
  - Critical: отсутствуют.
  - Major: отсутствуют.
  - Minor M1: удалён неиспользуемый импорт `buttonVariants` из `PatientTreatmentProgramDetailClient.tsx`.
  - Minor M2: удалён мёртвый JSX-expression `{testResults.length === 0 ? null : null}` (state и fetch в refresh сохранены для post-MVP).
  - Minor M3: CTA «История тестирования» — label «Перейти к этапу» → «Открыть текущий этап» для семантической точности.
  - Minor M4: убраны non-null assertions `detail!` в `stages/[stageId]/page.tsx` → введён `resolvedDetail = detail as NonNullable<typeof detail>`.
  - Повтор целевых проверок Stage C после FIX:
    - `pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs src/app-layer/routes src/shared/ui` ✅
    - `pnpm --dir apps/webapp exec tsc --noEmit` ✅
    - `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs` ✅ (14/14)
- **Stage C closed + commit.**

- **Stage D gate (EXEC старт, 2026-05-05):**
  - Прочитаны и применены: `STAGE_D.md`, `STAGE_PLAN.md`, `ROADMAP_2.md` (§1.1), правила `patient-ui-shared-primitives.mdc`, `clean-architecture-module-isolation.mdc`, `no-unsolicited-followups.mdc`.
  - Подтверждено предусловие `STAGE_D.md`: Stage C закрыт и закоммичен (`ac219941 feat(patient): stage C — visual redesign detail page + stages/[stageId] route`).
  - Scope Stage D зафиксирован: только `/treatment-programs` (список) — `page.tsx` + `PatientTreatmentProgramsListClient.tsx`; без миграций, без портовых контрактов, без `%` прогресса.
- **Stage D D1–D4 (implementation / verify):**
  - **D1**: hero-секция активной программы уже присутствовала с полями `title`, `currentStageTitle`, `planUpdatedLabel`, CTA → detail. В рамках D1-polish: поверхность hero переведена с нейтрального `patientCardClass` на семантический `patientSurfaceProgramClass` (alias `patientSurfaceInfoClass`) для визуальной согласованности с hero detail-страницы (Stage C); индикатор `planUpdatedLabel` оформлен по-бейджевому: красная точка `● (text-destructive, aria-hidden)` + текст в отдельном `<span>` — аналогично detail-hero C1.
  - **D2**: архив завершённых программ под `<details>` с заголовком «Завершённые программы» — присутствовал, без изменений ✅.
  - **D3**: empty state «Здесь появится программа после назначения врачом» + ссылка «Написать в чат клиники» → `messagesHref` — присутствовал, без изменений ✅.
  - **D4**: отсутствие `%`-прогресса в hero и в списке подтверждено: в `PatientTreatmentProgramsListClient.tsx` нет метрик процентов ✅.
- **Stage D D5 (тесты):**
  - `PatientTreatmentProgramsListClient.test.tsx` и `page.nudgeResilience.test.tsx` (список) — зелёные без изменений (тест `planUpdatedLabel` ищет текст через дочерний `<span>`, не по всему textContent `<p>`). 14/14 ✅.
- **Stage D D6 (целевые проверки):**
  - `pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs` ✅
  - `pnpm --dir apps/webapp exec tsc --noEmit` ✅
  - `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs` ✅ (14/14)
- **Stage D closed.**
- **Stage D FIX по `AUDIT_STAGE_D.md` (2026-05-05):**
  - Critical: отсутствуют, исправления не требуются.
  - Major: отсутствуют, исправления не требуются.
  - Minor M1 (`...ListClient.tsx` без `"use client"`): **defer** — компонент функционально корректен как RSC, не использует хуков; переименование потребует правок в `page.tsx` и двух test-файлах; стоимость выше пользы в рамках Stage D.
  - Повтор целевых проверок Stage D после FIX:
    - `pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs` ✅
    - `pnpm --dir apps/webapp exec tsc --noEmit` ✅
    - `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs` ✅ (14/14)
- **Stage D closed + commit.**

- **Global Audit (2026-05-05):**
  - Файл: `AUDIT_GLOBAL.md`.
  - Вердикт: PASS — инварианты выдержаны, scope чистый, конвейер A→B→C→D пройден.
  - Critical: 0. Major: 0. Minor M1: Stage A не имеет изолированного commit + «Stage A closed + commit» отсутствовал в LOG.md.
- **Global FIX (2026-05-05):**
  - Critical: отсутствуют.
  - Major: отсутствуют.
  - Minor M1: добавлена ретроактивная запись «Stage A closed + commit» в LOG.md (одна строка, code diff не затронут).
  - Повтор целевых проверок по затронутой зоне (только docs): code-файлы не изменялись → lint/typecheck/vitest не перезапускались (no-op).
- **Global FIX closed.**

- **PREPUSH (2026-05-05):**
  - `pnpm install --frozen-lockfile` ✅
  - `pnpm run ci` ✅ (exit_code: 0)
    - lint (root + webapp) ✅
    - typecheck (webapp + integrator + media-worker + platform-merge) ✅
    - test (integrator): 765 passed, 6 skipped / 112 files ✅
    - test:webapp: 2760 passed, 9 skipped / 543 files ✅
    - test:media-worker: 11 passed / 3 files ✅
    - build ✅
    - build:webapp (Next.js, new route `/treatment-programs/[instanceId]/stages/[stageId]` в сборке) ✅
    - audit: no known vulnerabilities ✅
  - **PREPUSH PASS — инициатива готова к push.**
- **PUSH (2026-05-05):** `git push origin feature/app-restructure-initiative` — инициатива PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE закрыта.
