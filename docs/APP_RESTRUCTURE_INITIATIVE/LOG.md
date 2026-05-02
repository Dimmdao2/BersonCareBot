# Журнал исполнения APP_RESTRUCTURE (быстрые устойчивые правки)

Дата начала: 2026-05-01.

Формат записи: дата, ссылка на этап ([`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) часть IV и/или [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md)), изменения, проверки, решения, что не делали вне scope.

---

## 2026-05-02 — этап 3: бейджи меню врача (реализация)

**Повод:** закрыть [`DOCTOR_NAV_BADGES_PLAN.md`](DOCTOR_NAV_BADGES_PLAN.md) — бейджи «Онлайн-заявки» (`status=new`) и «Сообщения» (непрочитанные) в desktop sidebar и mobile Sheet.

**Сделано:**

- Hook [`useDoctorOnlineIntakeNewCount`](../../apps/webapp/src/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount.ts): `GET /api/doctor/online-intake?status=new&limit=1`, счётчик из `total`, polling **20 с**, без запросов при `document.visibilityState !== "visible"` (вариант **A** из ТЗ).
- [`doctorNavLinks.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.ts): типы `DoctorMenuBadgeKey`, опциональный `badgeKey` у пунктов `online-intake` и `messages`.
- [`DoctorMenuAccordion.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx): `useDoctorSupportUnreadCount` + новый hook; `formatNavBadgeCount` (`1..99`, `99+` при `≥100`, `0` скрыт); бейдж в строке пункта; `aria-label` у ссылки и бейджа; сохранены `id` `doctor-sidebar-link-*` / `doctor-menu-link-*`.
- Тесты: [`useDoctorOnlineIntakeNewCount.test.tsx`](../../apps/webapp/src/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount.test.tsx), обновлены [`doctorNavLinks.test.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.test.ts), [`DoctorMenuAccordion.test.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.test.tsx).

**Проверки:**  
`pnpm --dir apps/webapp exec vitest run src/shared/ui/DoctorMenuAccordion.test.tsx src/shared/ui/doctorNavLinks.test.ts src/modules/online-intake/hooks/useDoctorOnlineIntakeNewCount.test.tsx`  
`pnpm --dir apps/webapp typecheck`  
`pnpm --dir apps/webapp lint`  
`rg "@/infra/db|@/infra/repos" apps/webapp/src/app/api/doctor/online-intake apps/webapp/src/shared/ui apps/webapp/src/modules/online-intake/hooks` — без совпадений в новом hook.

**Вне scope:** дашборд «Сегодня», realtime/push/SSE, отдельный endpoint `new-count`, бейдж на заголовке закрытого кластера, `notifyDoctorOnlineIntakeCountChanged` (не добавляли — достаточно polling).

---

## 2026-05-02 — этап 4: ТЗ для экрана «Сегодня» врача

**Повод:** подготовить отдельное ТЗ для замены отчётного обзора `/app/doctor` на рабочий экран дня.

**Сделано:**

- Создано [`DOCTOR_TODAY_DASHBOARD_PLAN.md`](DOCTOR_TODAY_DASHBOARD_PLAN.md): цель, текущая база, продуктовые решения, scope boundaries, целевые секции, техническая форма, шаги исполнения, проверки, manual smoke, stop conditions и Definition of Done.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на ТЗ этапа 4 и статус «ТЗ готово».
- Зафиксирован MVP: «Записи сегодня», «Новые онлайн-заявки», «Непрочитанные сообщения», «Ближайшие записи»; метрики остаются на `/app/doctor/stats`.
- Зафиксировано ограничение: «К проверке» не делать как реальную очередь без готового источника данных «требует проверки врача».

**Проверки:** документационная правка; код не менялся, targeted tests не запускались.

**Вне scope:** не делали реализацию `/app/doctor`, patient card, новую очередь проверки тестов, realtime/push/SSE, миграции или настройки окружения.

---

## 2026-05-02 — этап 3: ТЗ для бейджей меню врача

**Повод:** подготовить отдельное ТЗ для дешёвого, но полезного слоя быстрых сигналов в меню врача: новые онлайн-заявки и непрочитанные сообщения.

**Сделано:**

- Создано [`DOCTOR_NAV_BADGES_PLAN.md`](DOCTOR_NAV_BADGES_PLAN.md): цель, scope boundaries, источники данных, UI plan, backend plan, шаги исполнения, проверки, manual smoke, stop conditions и Definition of Done.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на ТЗ этапа 3 и зафиксированы ключевые решения.
- Уточнён источник счётчика онлайн-заявок: только `status=new`, потому что `in_review` уже означает «взято в работу».
- Зафиксировано, что счётчик сообщений должен переиспользовать существующий `useDoctorSupportUnreadCount` / `GET /api/doctor/messages/unread-count`, без второго источника истины.

**Проверки:** документационная правка; код не менялся, targeted tests не запускались.

**Вне scope:** не делали дашборд «Сегодня», realtime/push/SSE, новые миграции, изменение статусов online-intake или пациентский интерфейс.

---

## 2026-05-02 — этап 7: closeout после аудита (DoD)

**Повод:** закрыть пробелы из независимого аудита [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md): документация HTTP для архивации с guard, RTL на формах каталогов 1/3/4, статус плана, финальный корневой CI.

**Сделано:**

- [`api.md`](../../apps/webapp/src/app/api/api.md): для **`DELETE`** `clinical-tests`, `test-sets`, `recommendations` описаны **`409`** с `code: USAGE_CONFIRMATION_REQUIRED`, поле `usage`, повтор с **`?acknowledgeUsageWarning=1`** и отсылки к доменным функциям guard в типах.
- [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md): статус «выполнено», блок **Closeout** в Definition of Done.
- RTL: [`ExerciseForm.test.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.test.tsx), [`ClinicalTestForm.test.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx), [`TestSetForm.test.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetForm.test.tsx) — сценарий «архив → диалог → Архивировать всё равно» с проверкой второго submit и `acknowledgeUsageWarning=1`.
- Исправление подтверждения архива: на формах врача (`ExerciseForm`, `ClinicalTestForm`, `TestSetForm`, `RecommendationForm`, `TemplateEditor`) флаг `acknowledgeUsageWarning` перенесён в state `archiveUsageAck` (скрытое поле с `value`), чтобы повторный submit после `setWarnOpen(false)` не терял `1` при ре-рендере; тело диалога с секциями usage вынесено из `DialogDescription` (невалидные вложенные `<p>`) в `div` с теми же стилями.

**Проверки:** `pnpm install --frozen-lockfile && pnpm run ci` — успех на рабочем дереве (2026-05-02): lint, typecheck, integrator + webapp tests, build integrator + webapp, audit deps.

**Manual smoke этапа 7:** по-прежнему приёмочный шаг оператора по чеклисту в плане; автоматизированы только точечные RTL для трёх форм выше.

---

## 2026-05-02 — этап 7 подшаг: курсы (usage + archive guard)

**Сделано:**

- Домен: [`CourseUsageSnapshot`](../../apps/webapp/src/modules/courses/types.ts), [`courseArchiveRequiresAcknowledgement`](../../apps/webapp/src/modules/courses/types.ts), [`errors.ts`](../../apps/webapp/src/modules/courses/errors.ts).
- Порт: [`getCourseUsageSummary`](../../apps/webapp/src/modules/courses/ports.ts); PG [`pgCourses.ts`](../../apps/webapp/src/infra/repos/pgCourses.ts) (агрегация по `courses.program_template_id`, `treatment_program_instances`, `content_pages.linked_course_id`); in-memory [`seedInMemoryCourseUsageSnapshot`](../../apps/webapp/src/infra/repos/inMemoryCourses.ts).
- Сервис: [`getCourseUsage`](../../apps/webapp/src/modules/courses/service.ts), [`updateCourse(..., options?)`](../../apps/webapp/src/modules/courses/service.ts) при переходе в `archived`.
- API: [`GET …/courses/[id]/usage`](../../apps/webapp/src/app/api/doctor/courses/[id]/usage/route.ts); [`PATCH [id]`](../../apps/webapp/src/app/api/doctor/courses/[id]/route.ts) — `409` + `USAGE_CONFIRMATION_REQUIRED`, поле **`acknowledgeUsageWarning`**.
- UI: [`DoctorCourseEditForm.tsx`](../../apps/webapp/src/app/app/doctor/courses/[id]/DoctorCourseEditForm.tsx), [`courseUsageDocLinks.ts`](../../apps/webapp/src/app/app/doctor/courses/courseUsageDocLinks.ts), [`courseUsageSummaryText.ts`](../../apps/webapp/src/app/app/doctor/courses/courseUsageSummaryText.ts); RSC usage на [`[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/courses/[id]/page.tsx).
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/courses/service.test.ts), [`pgCourses.test.ts`](../../apps/webapp/src/infra/repos/pgCourses.test.ts), [`courseUsageDocLinks.test.ts`](../../apps/webapp/src/app/app/doctor/courses/courseUsageDocLinks.test.ts), [`courseUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/courses/courseUsageSummaryText.test.ts), RTL [`DoctorCourseEditForm.test.tsx`](../../apps/webapp/src/app/app/doctor/courses/%5Bid%5D/DoctorCourseEditForm.test.tsx) (usage из RSC / `GET …/usage`, архив без guard, `409` → диалог → `acknowledgeUsageWarning`).
- Документация: [`api.md`](../../apps/webapp/src/app/api/api.md); трекер в [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md).

**Аудит подшага (после первичной реализации):** закрыт пробел без RTL на форме — добавлен `DoctorCourseEditForm.test.tsx`. Финальный корневой `pnpm run ci` и ручной smoke — см. запись **«2026-05-02 — этап 7: closeout после аудита (DoD)»** выше в этом файле.

**Проверки:** `pnpm --dir apps/webapp typecheck`; `pnpm --dir apps/webapp exec vitest run src/modules/courses/service.test.ts src/infra/repos/pgCourses.test.ts src/app/app/doctor/courses/courseUsageDocLinks.test.ts src/app/app/doctor/courses/courseUsageSummaryText.test.ts "src/app/app/doctor/courses/[id]/DoctorCourseEditForm.test.tsx"`; `pnpm --dir apps/webapp lint`.

**Guard архива:** активные экземпляры программ по шаблону курса или опубликованные страницы контента с `linked_course_id`; черновики страниц и только завершённые программы не требуют подтверждения.

**Ручной smoke (оператор):** по чеклисту «Manual smoke» в [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md).

**Closeout этапа 7 по каталогам:** все семь подшагов в [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md) закрыты; итоговый прогон CI — в записи **«2026-05-02 — этап 7: closeout после аудита (DoD)»**.

---

## 2026-05-02 — этап 7 подшаг: шаблоны программ (usage + archive guard)

**Сделано:**

- Домен: [`TreatmentProgramTemplateUsageSnapshot`](../../apps/webapp/src/modules/treatment-program/types.ts), [`treatmentProgramTemplateArchiveRequiresAcknowledgement`](../../apps/webapp/src/modules/treatment-program/types.ts), [`errors.ts`](../../apps/webapp/src/modules/treatment-program/errors.ts).
- Порт/репо: [`getTreatmentProgramTemplateUsageSummary`](../../apps/webapp/src/modules/treatment-program/ports.ts), PG/in-memory сводка и soft-archive в [`pgTreatmentProgram.ts`](../../apps/webapp/src/infra/repos/pgTreatmentProgram.ts) / [`inMemoryTreatmentProgram.ts`](../../apps/webapp/src/infra/repos/inMemoryTreatmentProgram.ts); реэкспорт сидов в [`treatmentProgramInMemory.ts`](../../apps/webapp/src/app-layer/testing/treatmentProgramInMemory.ts).
- Сервис: [`getTreatmentProgramTemplateUsage`](../../apps/webapp/src/modules/treatment-program/service.ts), guard при `updateTemplate(…, archived)` и [`deleteTemplate`](../../apps/webapp/src/modules/treatment-program/service.ts).
- API: [`GET …/[id]/usage`](../../apps/webapp/src/app/api/doctor/treatment-program-templates/[id]/usage/route.ts); [`PATCH/DELETE [id]`](../../apps/webapp/src/app/api/doctor/treatment-program-templates/[id]/route.ts) — `409` + `USAGE_CONFIRMATION_REQUIRED`, `PATCH acknowledgeUsageWarning`, `DELETE ?acknowledgeUsageWarning=`.
- UI: блок «Где используется», архивация и диалог подтверждения в [`TreatmentProgramConstructorClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx); [`templateUsageDocLinks.ts`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/templateUsageDocLinks.ts), [`templateUsageSummaryText.ts`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/templateUsageSummaryText.ts); RSC usage на [`[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/page.tsx); `onArchived` + `router.refresh` в [`TreatmentProgramTemplatesPageClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx).
- Документация: [`api.md`](../../apps/webapp/src/app/api/api.md); трекер в [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md).
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/treatment-program/service.test.ts), [`pgTreatmentProgram.test.ts`](../../apps/webapp/src/infra/repos/pgTreatmentProgram.test.ts) (smoke SQL usage через mock `getPool`), [`templateUsageDocLinks.test.ts`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/templateUsageDocLinks.test.ts), [`templateUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/templateUsageSummaryText.test.ts), [`TreatmentProgramConstructorClient.test.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/%5Bid%5D/TreatmentProgramConstructorClient.test.tsx).

**Проверки:** `pnpm --dir apps/webapp typecheck`; `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/service.test.ts src/infra/repos/pgTreatmentProgram.test.ts src/app/app/doctor/treatment-program-templates/templateUsageDocLinks.test.ts src/app/app/doctor/treatment-program-templates/templateUsageSummaryText.test.ts "src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.test.tsx"`; `pnpm --dir apps/webapp lint`.

**Аудит подшага (после первичной реализации):** закрыты пробелы — интеграционный smoke для запроса usage в PG-порте и RTL на пустой usage, архив без guard и сценарий `409` → подтверждение → успех.

**Ручной smoke (оператор):** по чеклисту «Manual smoke» в [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md): шаблон без usage и с usage (активная программа и/или опубликованный курс), кликабельные refs, архив без предупреждения и с диалогом, повтор без `acknowledgeUsageWarning` на API не проходит.

**Guard архива:** активные экземпляры программ и опубликованные курсы; черновики курсов и только завершённые экземпляры не требуют подтверждения.

---

## 2026-05-02 — этап 7 подшаг: рекомендации (usage + archive guard)

**Сделано:**

- Сводка: шаблоны и экземпляры программ с `item_type = 'recommendation'` и `item_ref_id` = id рекомендации ([`pgRecommendations.ts`](../../apps/webapp/src/infra/repos/pgRecommendations.ts), `loadRecommendationUsageSummary`).
- Домен: [`RecommendationUsageSnapshot`](../../apps/webapp/src/modules/recommendations/types.ts), [`recommendationArchiveRequiresAcknowledgement`](../../apps/webapp/src/modules/recommendations/types.ts), [`errors.ts`](../../apps/webapp/src/modules/recommendations/errors.ts).
- Сервис: [`getRecommendationUsage`](../../apps/webapp/src/modules/recommendations/service.ts), [`archiveRecommendation(id, options?)`](../../apps/webapp/src/modules/recommendations/service.ts); in-memory [`seedInMemoryRecommendationUsageSnapshot`](../../apps/webapp/src/infra/repos/inMemoryRecommendations.ts).
- UI: [`RecommendationForm.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx), [`actions.ts`](../../apps/webapp/src/app/app/doctor/recommendations/actions.ts) / [`actionsInline.ts`](../../apps/webapp/src/app/app/doctor/recommendations/actionsInline.ts), [`fetchDoctorRecommendationUsageSnapshot`](../../apps/webapp/src/app/app/doctor/recommendations/actions.ts); [`recommendationUsageSummaryText.ts`](../../apps/webapp/src/app/app/doctor/recommendations/recommendationUsageSummaryText.ts), [`recommendationUsageDocLinks.ts`](../../apps/webapp/src/app/app/doctor/recommendations/recommendationUsageDocLinks.ts); RSC usage при `?selected=` ([`page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/page.tsx)) и на [`[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/[id]/page.tsx).
- API DELETE [`recommendations/[id]`](../../apps/webapp/src/app/api/doctor/recommendations/[id]/route.ts): `409` + `usage`, повтор с `?acknowledgeUsageWarning=1`.
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/recommendations/service.test.ts), [`pgRecommendations.test.ts`](../../apps/webapp/src/infra/repos/pgRecommendations.test.ts), [`recommendationUsageDocLinks.test.ts`](../../apps/webapp/src/app/app/doctor/recommendations/recommendationUsageDocLinks.test.ts), [`recommendationUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/recommendations/recommendationUsageSummaryText.test.ts), [`RecommendationForm.test.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.test.tsx).

**Проверки:** `pnpm --dir apps/webapp typecheck`; целевые `vitest run` по файлам выше; **`pnpm --dir apps/webapp lint`** (полный прогон webapp после аудита подшага).

**Аудит подшага (2026-05-02):** в [`service.test.ts`](../../apps/webapp/src/modules/recommendations/service.test.ts) добавлены кейсы guard для **только активного** экземпляра программы и проход архива при **только завершённых** экземплярах; в проверках зафиксирован полный lint webapp.

**Guard архива:** опубликованные шаблоны и активные экземпляры; черновики, архивные шаблоны и завершённые экземпляры — только сводка.

**Вне scope:** переименование «Область», markdown preview, редизайн каталога.

---

## 2026-05-02 — этап 7 подшаг: наборы тестов (usage + archive guard)

**Сделано:**

- Сводка использования набора: шаблоны и экземпляры программ с `item_type = 'test_set'` и `item_ref_id` = id набора; архивные шаблоны — только в сводке; счётчик попыток через `test_attempts` + `treatment_program_instance_stage_items` ([`pgTestSets.ts`](../../apps/webapp/src/infra/repos/pgTestSets.ts), `loadTestSetUsageSummary`).
- Доменная модель: [`TestSetUsageSnapshot`](../../apps/webapp/src/modules/tests/types.ts), [`testSetArchiveRequiresAcknowledgement`](../../apps/webapp/src/modules/tests/types.ts), ошибки в [`errors.ts`](../../apps/webapp/src/modules/tests/errors.ts) (`TestSetUsageConfirmationRequiredError` и др.).
- Сервис: [`getTestSetUsage`](../../apps/webapp/src/modules/tests/service.ts), [`archiveTestSet(id, options?)`](../../apps/webapp/src/modules/tests/service.ts); in-memory [`seedInMemoryTestSetUsageSnapshot`](../../apps/webapp/src/infra/repos/inMemoryTestSets.ts).
- UI врача: [`TestSetForm.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetForm.tsx), [`actions.ts`](../../apps/webapp/src/app/app/doctor/test-sets/actions.ts) / [`actionsInline.ts`](../../apps/webapp/src/app/app/doctor/test-sets/actionsInline.ts), [`fetchDoctorTestSetUsageSnapshot`](../../apps/webapp/src/app/app/doctor/test-sets/actions.ts); тексты/ссылки — [`testSetUsageSummaryText.ts`](../../apps/webapp/src/app/app/doctor/test-sets/testSetUsageSummaryText.ts), [`testSetUsageDocLinks.ts`](../../apps/webapp/src/app/app/doctor/test-sets/testSetUsageDocLinks.ts); RSC usage на [`page.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/page.tsx) при `?selected=` и на [`[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/[id]/page.tsx).
- API DELETE [`test-sets/[id]`](../../apps/webapp/src/app/api/doctor/test-sets/[id]/route.ts): `409` + `usage`, повтор с `?acknowledgeUsageWarning=1`.
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/tests/service.test.ts), [`pgTestSets.test.ts`](../../apps/webapp/src/infra/repos/pgTestSets.test.ts), [`testSetUsageDocLinks.test.ts`](../../apps/webapp/src/app/app/doctor/test-sets/testSetUsageDocLinks.test.ts), [`testSetUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/test-sets/testSetUsageSummaryText.test.ts), [`TestSetForm.test.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetForm.test.tsx).

**Проверки:** `pnpm --dir apps/webapp typecheck`; `pnpm --dir apps/webapp exec vitest run` (файлы выше); **`pnpm --dir apps/webapp lint`** (полный прогон webapp после аудита подшага).

**Аудит подшага (2026-05-02):** в разделе 4 [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md) зафиксировано различие сводки (все статусы шаблонов + completed + попытки) и guard (только `published` шаблоны + `active` экземпляры); в [`service.test.ts`](../../apps/webapp/src/modules/tests/service.test.ts) — отдельный кейс «только черновые шаблоны» и уточнён кейс «только история попыток».

**Guard архива:** опубликованные шаблоны программ и активные экземпляры; черновики, архивные шаблоны, завершённые экземпляры и счётчик попыток — только сводка.

**Вне scope:** карточный редизайн каталога наборов, scoring.

---

## 2026-05-02 — этап 7 подшаг: клинические тесты (usage + archive guard)

**Сделано:**

- Сводка использования теста: цепочка `test_set_items` → шаблоны/экземпляры программ с `item_type = 'test_set'` и `item_ref_id` = id набора; счётчик строк в `test_results` по `test_id` (история, не блокирует архив). Реализация: один SELECT в [`pgClinicalTests.ts`](../../apps/webapp/src/infra/repos/pgClinicalTests.ts) (`loadClinicalTestUsageSummary`).
- Доменная модель: [`ClinicalTestUsageSnapshot`](../../apps/webapp/src/modules/tests/types.ts), [`clinicalTestArchiveRequiresAcknowledgement`](../../apps/webapp/src/modules/tests/types.ts), ошибки [`ClinicalTestUsageConfirmationRequiredError`](../../apps/webapp/src/modules/tests/errors.ts) и отдельные «не найден» / «уже в архиве».
- Сервис: [`getClinicalTestUsage`](../../apps/webapp/src/modules/tests/service.ts), [`archiveClinicalTest(id, options?)`](../../apps/webapp/src/modules/tests/service.ts) с `acknowledgeUsageWarning`; in-memory [`seedInMemoryClinicalTestUsageSnapshot`](../../apps/webapp/src/infra/repos/inMemoryClinicalTests.ts).
- UI врача: блок «Где используется», диалог, [`useActionState`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx) для архива; [`archiveClinicalTest`](../../apps/webapp/src/app/app/doctor/clinical-tests/actions.ts) / [`archiveClinicalTestInline`](../../apps/webapp/src/app/app/doctor/clinical-tests/actionsInline.ts); [`fetchDoctorClinicalTestUsageSnapshot`](../../apps/webapp/src/app/app/doctor/clinical-tests/actions.ts); тексты/ссылки — [`clinicalTestsUsageSummaryText.ts`](../../apps/webapp/src/app/app/doctor/clinical-tests/clinicalTestsUsageSummaryText.ts), [`clinicalTestsUsageDocLinks.ts`](../../apps/webapp/src/app/app/doctor/clinical-tests/clinicalTestsUsageDocLinks.ts).
- API DELETE [`clinical-tests/[id]`](../../apps/webapp/src/app/api/doctor/clinical-tests/[id]/route.ts): `409` + `usage` при необходимости подтверждения.
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/tests/service.test.ts), [`pgClinicalTests.test.ts`](../../apps/webapp/src/infra/repos/pgClinicalTests.test.ts), [`clinicalTestsUsageDocLinks.test.ts`](../../apps/webapp/src/app/app/doctor/clinical-tests/clinicalTestsUsageDocLinks.test.ts), [`clinicalTestsUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/clinical-tests/clinicalTestsUsageSummaryText.test.ts), [`ClinicalTestForm.test.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx).

**Проверки:** `pnpm --dir apps/webapp exec vitest run` (файлы выше); `pnpm --dir apps/webapp typecheck`.

**Guard архива:** блокируют активные (неархивные) наборы тестов, опубликованные шаблоны программ и активные экземпляры; черновики и архивные шаблоны программ, только архивные наборы, завершённые экземпляры и счётчик `test_results` — только сводка, без обязательного подтверждения.

**Вне scope:** scoring UI, справочник `test_type`, этап «Наборы тестов».

**Пост-аудит:** в сводку добавлены архивные шаблоны программ (`status = 'archived'`), только для отображения; split-view и `/clinical-tests/[id]` получают usage с сервера при первом рендере; `DELETE /api/doctor/clinical-tests/[id]` поддерживает `?acknowledgeUsageWarning=1`; тест [`ClinicalTestForm.test.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.test.tsx).

---

## 2026-05-02 — этап 7 подшаг: упражнения (usage + archive guard)

**Сделано:**

- Каталог упражнений: read-only сводка использования (`ExerciseUsageSnapshot`), порт `getExerciseUsageSummary`, один SQL в [`pgLfkExercises.ts`](../../apps/webapp/src/infra/repos/pgLfkExercises.ts) (шаблоны комплексов ЛФК, назначения `patient_lfk_assignments`, шаблоны/экземпляры программ лечения).
- Сервис: [`getExerciseUsage`](../../apps/webapp/src/modules/lfk-exercises/service.ts), архив с `acknowledgeUsageWarning` и доменной ошибкой [`USAGE_CONFIRMATION_REQUIRED`](../../apps/webapp/src/modules/lfk-exercises/errors.ts).
- UI: блок «Где используется», диалог предупреждения, server actions [`archiveDoctorExercise`](../../apps/webapp/src/app/app/doctor/exercises/actions.ts) / [`archiveExerciseInline`](../../apps/webapp/src/app/app/doctor/exercises/actionsInline.ts) с `useActionState`; при `?selected=` usage приходит с RSC, иначе [`fetchDoctorExerciseUsageSnapshot`](../../apps/webapp/src/app/app/doctor/exercises/actions.ts).
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/lfk-exercises/service.test.ts), [`pgLfkExercises.test.ts`](../../apps/webapp/src/infra/repos/pgLfkExercises.test.ts), [`ExerciseForm.test.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.test.tsx), [`exerciseUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/exercises/exerciseUsageSummaryText.test.ts); in-memory seed [`seedInMemoryExerciseUsageSnapshot`](../../apps/webapp/src/infra/repos/inMemoryLfkExercises.ts).
- **Пост-аудит:** отдельные ошибки «не найдено» / «уже в архиве» ([`ExerciseArchiveNotFoundError`](../../apps/webapp/src/modules/lfk-exercises/errors.ts), [`ExerciseArchiveAlreadyArchivedError`](../../apps/webapp/src/modules/lfk-exercises/errors.ts)) и их прокидывание из [`archiveDoctorExerciseCore`](../../apps/webapp/src/app/app/doctor/exercises/actionsShared.ts); в сводку добавлен счётчик завершённых экземпляров программ (история, не блокирует архив); склонения фраз «В N …» через [`vNaForm`](../../apps/webapp/src/app/app/doctor/exercises/exerciseUsageSummaryText.ts).

**Проверки:** `pnpm --dir apps/webapp exec vitest run` (целевые файлы выше); `pnpm --dir apps/webapp typecheck`.

**Решения / ограничения:** счётчики только по источникам из матрицы плана; отдельный «тяжёлый» patient LFK count через цепочку `lfk_complexes` не выносился — текущий запрос покрывает `patient_lfk_assignments` + `lfk_complex_exercises` / шаблон при `complex_id IS NULL`.

**Вне scope:** остальные каталоги этапа 7, миграции/индексы, пациентский UI.

---

## 2026-05-02 — этап 7 подшаг: комплексы ЛФК (usage + archive guard)

**Сделано:**

- Сводка использования шаблона комплекса: `LfkTemplateUsageSnapshot` — активные `patient_lfk_assignments` по `template_id`, шаблоны/экземпляры программ лечения с `item_type = 'lfk_complex'` и `item_ref_id = template_id` ([`pgLfkTemplates.ts`](../../apps/webapp/src/infra/repos/pgLfkTemplates.ts), один SELECT).
- Сервис: [`getTemplateUsage`](../../apps/webapp/src/modules/lfk-templates/service.ts), архив с `acknowledgeUsageWarning` и [`LfkTemplateUsageConfirmationRequiredError`](../../apps/webapp/src/modules/lfk-templates/errors.ts) (`USAGE_CONFIRMATION_REQUIRED`).
- UI: блок «Где используется», диалог архивации, [`archiveDoctorLfkTemplate`](../../apps/webapp/src/app/app/doctor/lfk-templates/actions.ts) + [`TemplateEditor`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx); на `/lfk-templates/[id]` snapshot с RSC; в split-view — [`fetchDoctorLfkTemplateUsageSnapshot`](../../apps/webapp/src/app/app/doctor/lfk-templates/actions.ts).
- Ссылки врача: [`lfkTemplatesUsageDocLinks.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesUsageDocLinks.ts); тексты секций — [`lfkTemplatesUsageSummaryText.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesUsageSummaryText.ts) (`vNaForm` из упражнений).
- Тесты: [`service.test.ts`](../../apps/webapp/src/modules/lfk-templates/service.test.ts), [`pgLfkTemplates.test.ts`](../../apps/webapp/src/infra/repos/pgLfkTemplates.test.ts), [`lfkTemplatesUsageDocLinks.test.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesUsageDocLinks.test.ts), [`lfkTemplatesUsageSummaryText.test.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesUsageSummaryText.test.ts), [`lfkTemplatesListPreserveQuery.test.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesListPreserveQuery.test.ts), [`TemplateEditor.test.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.test.tsx); in-memory [`seedInMemoryLfkTemplateUsageSnapshot`](../../apps/webapp/src/infra/repos/inMemoryLfkTemplates.ts).

**Пост-аудит (фиксы):** сохранение GET-параметров списка (`q`, `region`, `load`, `titleSort`) после архивации — [`lfkTemplatesListPreserveQuery.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/lfkTemplatesListPreserveQuery.ts) + hidden `listPreserveQuery` в [`TemplateEditor`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx) / [`LfkTemplatesPageClient`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx), санитизация в [`archiveDoctorLfkTemplate`](../../apps/webapp/src/app/app/doctor/lfk-templates/actions.ts); тесты [`TemplateEditor.test.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.test.tsx), непустые refs в [`pgLfkTemplates.test.ts`](../../apps/webapp/src/infra/repos/pgLfkTemplates.test.ts); в плане уточнены опциональные стартовые пути `lfk-assignments` / `pgLfkAssignments`. Диалог архивации при `USAGE_CONFIRMATION_REQUIRED` по-прежнему без отдельного e2e-теста (ручной smoke).

**Проверки:** `pnpm --dir apps/webapp exec vitest run` (файлы выше); `pnpm --dir apps/webapp typecheck`.

**Guard архива:** как у упражнений — блокируют только опубликованные шаблоны программ, активные экземпляры и активные назначения ЛФК; черновики шаблонов программ и завершённые экземпляры — в сводке, без обязательного подтверждения.

**Вне scope:** остальные каталоги этапа 7, схема LFK, редизайн списка комплексов.

---

## 2026-05-02 — CMS Post-Execution Fix (Variant C+)

**Сделано:**

- **Корень системной папки** ([`content/page.tsx`](../../apps/webapp/src/app/app/doctor/content/page.tsx)): кнопка «Создать страницу» скрыта, пока не выбран конкретный раздел (`?section=`); убрана автоподстановка первого дочернего раздела; добавлены «Создать раздел» и «Добавить из существующих» (модалка [`AttachExistingSectionsModal.tsx`](../../apps/webapp/src/app/app/doctor/content/AttachExistingSectionsModal.tsx) со списком свободных article-разделов).
- **Перенос раздела из статей в папку:** server action [`attachArticleSectionToSystemFolder`](../../apps/webapp/src/app/app/doctor/content/sections/actions.ts), UI — та же модалка на хабе контента; отдельная форма и query `attachToFolder` на [`sections/page.tsx`](../../apps/webapp/src/app/app/doctor/content/sections/page.tsx) удалены.
- **Новая страница** ([`new/page.tsx`](../../apps/webapp/src/app/app/doctor/content/new/page.tsx), [`ContentForm.tsx`](../../apps/webapp/src/app/app/doctor/content/ContentForm.tsx)): список разделов фильтруется — только `kind=article` для общего каталога или только разделы кластера при `?systemParentCode=`; при одном допустимом разделе выбор заблокирован (hidden `section`); пустой state со ссылками создать раздел / «Добавить из существующих» ведёт на хаб контента с `?systemParentCode=`.
- **Подписочная карусель:** [`blocks.ts`](../../apps/webapp/src/modules/patient-home/blocks.ts), [`patientHomeResolvers.ts`](../../apps/webapp/src/modules/patient-home/patientHomeResolvers.ts), [`patientHomeRuntimeStatus.ts`](../../apps/webapp/src/modules/patient-home/patientHomeRuntimeStatus.ts) — кандидаты `subscription_carousel`: разделы только `kind=article`, страницы только из article-разделов и опубликованные; курсы без изменений.
- **UX списка страниц:** [`ContentPagesSectionList.tsx`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSectionList.tsx) — ссылка «Создать страницу» к разделу.

**Проверки:** `pnpm --dir apps/webapp exec vitest run` (таргетные файлы: sections/actions, blocks, patientHome runtime/resolvers, ContentForm, ContentPagesSidebar, patient-home settings actions, service) — зелёно.

**Runbook (ops / до деплоя ужесточения на prod):** найти элементы главной `subscription_carousel`, которые ссылаются на не-statейные разделы или страницы вне article-разделов; исправить через CMS «Главная пациента» (заменить target) или вернуть раздел в каталог статей. Шаблон диагностического запроса (выполнять на окружении с загруженным `DATABASE_URL`, см. `docs/ARCHITECTURE/SERVER CONVENTIONS.md`):

```sql
SELECT i.id, i.target_type, trim(i.target_ref) AS target_ref, cs.kind AS section_kind
FROM patient_home_block_items i
JOIN patient_home_blocks b ON b.id = i.block_id
LEFT JOIN content_sections cs ON cs.slug = trim(i.target_ref) AND i.target_type = 'content_section'
WHERE b.code = 'subscription_carousel'
  AND i.is_visible = true
  AND i.target_type = 'content_section'
  AND (cs.kind IS DISTINCT FROM 'article');

SELECT i.id, i.target_type, trim(i.target_ref) AS page_slug, p.section, cs.kind AS parent_section_kind
FROM patient_home_block_items i
JOIN patient_home_blocks b ON b.id = i.block_id
JOIN content_pages p ON p.slug = trim(i.target_ref)
JOIN content_sections cs ON cs.slug = p.section
WHERE b.code = 'subscription_carousel'
  AND i.is_visible = true
  AND i.target_type = 'content_page'
  AND cs.kind IS DISTINCT FROM 'article';
```

**Вне scope:** новые миграции БД, редизайн курсов, изменение `getSubscriptionCarouselSectionPresentation` (синхронный матч по items без taxonomy).

---

## 2026-05-02 — этап 5 «Сообщения врача»: preflight

**Сделано:**

- Проверены текущие точки входа doctor support-chat: [`/app/doctor/messages`](../../apps/webapp/src/app/app/doctor/messages/page.tsx), [`DoctorSupportInbox`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx), API [`/api/doctor/messages/**`](../../apps/webapp/src/app/api/doctor/messages), общий [`ChatView`](../../apps/webapp/src/modules/messaging/components/ChatView.tsx), polling hook [`useMessagePolling`](../../apps/webapp/src/modules/messaging/hooks/useMessagePolling.ts).
- Подтверждён backend baseline: [`listOpenConversationsForAdmin`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts) уже отдаёт открытые диалоги, но без unread по диалогу; [`ensureWebappConversationForUser`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts) уже существует; [`markUserMessagesReadByAdmin`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts) отмечает входящие `sender_role = 'user'` на уровне conversation.
- Подтверждён UI baseline карточки пациента: [`ClientProfileCard`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx) ещё содержит старую [`SendMessageForm`](../../apps/webapp/src/app/app/doctor/clients/[userId]/SendMessageForm.tsx) и старый `messageLog`, поэтому форму можно убирать только после рабочего ensure/open support-chat по `patientUserId`.

**Решения:**

- Первый проход автопрочтения делается conversation-level: при открытии/рендере диалога вызывается существующий `POST /api/doctor/messages/[conversationId]/read`. Точный per-message visible-read через `IntersectionObserver` не вводится без новой read-модели.
- Baseline архитектурного grep: doctor messages API routes не импортируют `@/infra/db` / `@/infra/repos` напрямую; в `modules/messaging` уже есть legacy type-imports из `pgSupportCommunication`, не расширять их без необходимости.

**Вне scope:** `/app/doctor/broadcasts`, массовые рассылки, БД-схема, env, WebSocket/SSE, пациентский интерфейс.

---

## 2026-05-02 — этап 5 «Сообщения врача»: реализация единого чата

**Сделано:**

- [`listOpenConversationsForAdmin`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts) и in-memory parity расширены unread-счётчиком по входящим сообщениям пациента (`unreadFromUserCount`) и фильтром `unreadOnly`; [`GET /api/doctor/messages/conversations`](../../apps/webapp/src/app/api/doctor/messages/conversations/route.ts) поддерживает `?unread=1`.
- Добавлен [`POST /api/doctor/messages/conversations/ensure`](../../apps/webapp/src/app/api/doctor/messages/conversations/ensure/route.ts): врач открывает/создаёт webapp support-chat по `patientUserId`, получает `conversationId`, последние сообщения и unread count.
- Вынесен общий doctor chat layout [`DoctorChatPanel`](../../apps/webapp/src/modules/messaging/components/DoctorChatPanel.tsx): загрузка сообщений, composer, polling, отправка ответа, conversation-level auto-read и callbacks для обновления списка.
- [`DoctorSupportInbox`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx) теперь показывает фильтр «Все / Непрочитанные», бейджи unread и использует `DoctorChatPanel` для выбранного диалога.
- [`ClientProfileCard`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx) заменил старую форму отправки на CTA «Открыть чат» и modal с тем же `DoctorChatPanel`; старый `messageLog` оставлен как «Старый журнал отправок».
- Удалены runtime-неиспользуемые legacy artifacts старого composer: `SendMessageForm`, server action для отправки из карточки и старый draft action из `/doctor/messages`; страницы клиентов больше не вызывают `prepareMessageDraft`.

**Решения/ограничения:**

- Auto-read реализован как conversation-level read after open/render и после новых входящих сообщений в polling. Per-message visible-read через `IntersectionObserver` отложен: текущий backend контракт читает весь диалог.
- ACL для `patientUserId` не усложнялась внутри этого этапа: используется существующий doctor access guard, как в ТЗ.
- Legacy `doctor-messaging` сохраняется только для архивного `messageLog` и существующих списковых методов; отправка из карточки больше не идёт через старый composer.

**Проверки:**

- `pnpm --dir apps/webapp exec vitest run src/app/api/doctor/messages/conversations/route.test.ts src/app/api/doctor/messages/conversations/ensure/route.test.ts src/app/api/doctor/messages/[conversationId]/route.test.ts src/app/api/doctor/messages/unread-count/route.test.ts src/modules/messaging/doctorSupportMessagingService.test.ts src/modules/messaging/components/DoctorChatPanel.test.tsx src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx src/infra/repos/pgSupportCommunication.test.ts e2e/doctor-actions-inprocess.test.ts e2e/doctor-pages-inprocess.test.ts` — 10 files / 57 tests passed.
- `pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp lint` — ok.
- `rg "SendMessageForm|sendMessageAction|getMessageDraftAction|doctor-client-send-message-form" apps/webapp/src` — пусто.
- `rg "@/infra/db|@/infra/repos" apps/webapp/src/app/api/doctor/messages` — пусто; `modules/messaging` содержит только ранее существовавшие legacy type-imports из `pgSupportCommunication`.
- `pnpm run ci` — ok.

**Вне scope:** `/app/doctor/broadcasts`, массовые рассылки, patient messages UI, schema migrations, env/config, WebSocket/SSE, глубокий редизайн карточки пациента.

---

## 2026-05-02 — этап 5 «Сообщения врача»: post-audit fixes

**Повод:** закрытие неблокирующих замечаний из [`DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md`](DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md).

**Сделано:**

- [`DoctorSupportInbox`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx): в строке чата теперь отображаются телефон пациента и время последнего сообщения; добавлен focused test [`DoctorSupportInbox.test.tsx`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.test.tsx).
- Добавлен лёгкий unread-count endpoint без создания диалога: [`POST /api/doctor/messages/conversations/unread-by-patient`](../../apps/webapp/src/app/api/doctor/messages/conversations/unread-by-patient/route.ts). Путь идёт через [`doctorSupportMessagingService.unreadFromPatient`](../../apps/webapp/src/modules/messaging/doctorSupportMessagingService.ts) и support repo count by patient.
- [`ClientProfileCard`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx): CTA «Открыть чат» показывает unread badge до открытия modal; после read в открытом `DoctorChatPanel` локальный badge сбрасывается.
- [`useDoctorSupportUnreadCount`](../../apps/webapp/src/modules/messaging/hooks/useSupportUnreadPolling.ts): добавлено синхронное browser-событие refresh для doctor unread count; [`DoctorChatPanel`](../../apps/webapp/src/modules/messaging/components/DoctorChatPanel.tsx) диспатчит его после успешного read.
- [`DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md`](DOCTOR_MESSAGES_UNIFIED_CHAT_EXECUTION_AUDIT.md), [`DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md`](DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md), [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md), [`README.md`](README.md): обновлены под факт post-audit fixes.

**Проверки:**

- `pnpm --dir apps/webapp exec vitest run src/app/app/doctor/messages/DoctorSupportInbox.test.tsx src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx src/app/api/doctor/messages/conversations/unread-by-patient/route.test.ts src/modules/messaging/components/DoctorChatPanel.test.tsx src/modules/messaging/doctorSupportMessagingService.test.ts src/infra/repos/pgSupportCommunication.test.ts` — 6 files / 40 tests passed.
- `pnpm --dir apps/webapp exec vitest run src/app-layer/di/buildAppDeps.test.ts` — 1 file / 20 tests passed.
- `pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp lint` — ok.

**Осталось как осознанное ограничение:** точный per-message visible-read (`IntersectionObserver`) не делали без смены read-модели; manual browser smoke остаётся приёмочным шагом для stage/dev.

---

## 2026-05-02 — этап 5 «Сообщения врача»: hardening fix (patient missing + network)

**Сделано:**

- [`POST /api/doctor/messages/conversations/ensure`](../../apps/webapp/src/app/api/doctor/messages/conversations/ensure/route.ts): добавлена проверка существования пациента через `doctorClientsPort.getClientIdentity`; ошибки унифицированы в `patient_not_found` (404) и `conversation_ensure_failed` (500).
- [`POST /api/doctor/messages/conversations/unread-by-patient`](../../apps/webapp/src/app/api/doctor/messages/conversations/unread-by-patient/route.ts): добавлена проверка пациента и `404 patient_not_found`.
- [`GET /api/doctor/messages/unread-count`](../../apps/webapp/src/app/api/doctor/messages/unread-count/route.ts): добавлен режим `?patientUserId=<uuid>` с валидацией (`400 invalid_patient_user_id`) и `404 patient_not_found`; глобальный режим сохранён.
- [`ClientProfileCard`](../../apps/webapp/src/app/app/doctor/clients/ClientProfileCard.tsx): для `ensure` добавлены явные пользовательские ошибки (`patient_not_found`, `conversation_ensure_failed`), unread badge на CTA сохраняется.
- [`DoctorSupportInbox`](../../apps/webapp/src/app/app/doctor/messages/DoctorSupportInbox.tsx), [`DoctorChatPanel`](../../apps/webapp/src/modules/messaging/components/DoctorChatPanel.tsx): закрыты сетевые ошибки в load/polling (try/catch + стабильный error state), без падения UI.

**Проверки:**

- `pnpm --dir apps/webapp exec vitest run src/app/api/doctor/messages/conversations/ensure/route.test.ts src/app/api/doctor/messages/conversations/unread-by-patient/route.test.ts src/app/api/doctor/messages/unread-count/route.test.ts src/app/app/doctor/messages/DoctorSupportInbox.test.tsx src/modules/messaging/components/DoctorChatPanel.test.tsx src/app/app/doctor/clients/ClientProfileCard.backLink.test.tsx src/modules/messaging/doctorSupportMessagingService.test.ts` — 7 files / 42 tests passed.
- `pnpm --dir apps/webapp typecheck && pnpm --dir apps/webapp lint` — ok.

**Вне scope (по решению):** старый вход «Открыть раздел сообщений» в карточке пациента не удаляли в этом проходе.

---

## 2026-05-02 — этап 2 «Меню врача» (кабинет врача)

**Сделано:**

- [`doctorNavLinks.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.ts): кластеры `DOCTOR_MENU_CLUSTERS`, standalone «Библиотека файлов», порядок секций `getDoctorMenuRenderSections()` (библиотека между «Контент приложения» и «Коммуникации»), плоский `DOCTOR_MENU_LINKS`, константы ключа localStorage `doctorMenu.openCluster.v1`; уточнён `isDoctorNavItemActive`, чтобы хаб CMS не был активен на `/app/doctor/content/library`.
- [`DoctorMenuAccordion.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx) + [`DoctorMenuAccordion.test.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.test.tsx); подключение в [`DoctorAdminSidebar.tsx`](../../apps/webapp/src/shared/ui/DoctorAdminSidebar.tsx) и [`DoctorHeader.tsx`](../../apps/webapp/src/shared/ui/DoctorHeader.tsx) (mobile Sheet).
- [`ContentPagesSidebar.tsx`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSidebar.tsx): удалена ссылка «Библиотека файлов» из CMS-сайдбара; тест обновлён.
- [`doctorScreenTitles.ts`](../../apps/webapp/src/shared/ui/doctorScreenTitles.ts): `/app/doctor` → «Сегодня»; exact titles для `/app/doctor/online-intake` и `/app/doctor/content/library`; тесты обновлены.

**Решения:**

- Без auto-open кластера по смене `pathname` (только выбор пользователя + localStorage, как в утверждённом execution-плане).
- Переименования только в меню там, где требовал ТЗ; заголовок списка клиентов остаётся «Клиенты».

**Проверки:**

- `pnpm exec vitest run` по файлам: `doctorNavLinks.test.ts`, `doctorScreenTitles.test.ts`, `DoctorMenuAccordion.test.tsx`, `ContentPagesSidebar.test.tsx`.
- ESLint (из каталога `apps/webapp`, копипаст одной командой):

```bash
pnpm exec eslint \
  src/shared/ui/doctorNavLinks.ts \
  src/shared/ui/doctorNavLinks.test.ts \
  src/shared/ui/DoctorMenuAccordion.tsx \
  src/shared/ui/DoctorMenuAccordion.test.tsx \
  src/shared/ui/DoctorAdminSidebar.tsx \
  src/shared/ui/DoctorHeader.tsx \
  src/shared/ui/doctorScreenTitles.ts \
  src/shared/ui/doctorScreenTitles.test.ts \
  src/app/app/doctor/content/ContentPagesSidebar.tsx \
  src/app/app/doctor/content/ContentPagesSidebar.test.tsx
```

**Вне scope этого прохода:** бейджи заявок/сообщений, dashboard «Сегодня», смена URL, CMS-логика кроме удаления ссылки библиотеки, patient UI, БД/env.

---

## 2026-05-02 — пост-аудит этапа 2 «Меню врача» (фиксы по [`DOCTOR_MENU_RESTRUCTURE_EXECUTION_AUDIT.md`](DOCTOR_MENU_RESTRUCTURE_EXECUTION_AUDIT.md))

**Сделано:**

- [`DoctorHeader.tsx`](../../apps/webapp/src/shared/ui/DoctorHeader.tsx): `aria-label` у shortcut на список клиентов выровнен с меню — «Пациенты».
- [`LOG.md`](LOG.md): в записи об этапе 2 блок «Проверки» дополнен явной командой `pnpm exec eslint` со списком путей.
- Актуализированы документы инициативы: [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md), [`CMS_AUDIT.md`](CMS_AUDIT.md), [`TARGET_STRUCTURE_DOCTOR.md`](TARGET_STRUCTURE_DOCTOR.md), [`DOCTOR_MENU_RESTRUCTURE_EXECUTION_AUDIT.md`](DOCTOR_MENU_RESTRUCTURE_EXECUTION_AUDIT.md), [`DOCTOR_MENU_RESTRUCTURE_PLAN.md`](DOCTOR_MENU_RESTRUCTURE_PLAN.md), [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md).
- Исторические чек-листы в этом журнале (пункты «Онлайн-заявки» / subscribers): уточнены формулировки под модель без `DOCTOR_MENU_ENTRIES`.

**Проверки:** `pnpm exec eslint src/shared/ui/DoctorHeader.tsx`; `rg "Клиенты и подписчики" apps/webapp/src/shared/ui` — ожидаемо пусто.

**Вне scope:** auto-open кластера меню по `pathname` (продуктовое решение).

---

## Этап 1 APP_RESTRUCTURE — удаление «Новостей» + каналы в рассылках (audit)

**Сделано:**

- Drizzle-схема: удалены таблицы `news_items` / `news_item_views`; у `broadcast_audit` колонка `channels` (`text[]`, default `bot_message` + `sms`). Миграция: [`0016_drop_news_broadcast_channels.sql`](../../apps/webapp/db/drizzle-migrations/0016_drop_news_broadcast_channels.sql).
- CMS: редирект [`/app/doctor/content/news`](../../apps/webapp/src/app/app/doctor/content/news/page.tsx) → мотивация; [`ContentPagesSidebar`](../../apps/webapp/src/app/app/doctor/content/ContentPagesSidebar.tsx) без пункта «Новости»; экран мотивации читает список цитат через порт [`DoctorMotivationQuotesEditorPort`](../../apps/webapp/src/modules/doctor-motivation-quotes/ports.ts) и [`buildAppDeps().doctorMotivationQuotesEditor`](../../apps/webapp/src/app-layer/di/buildAppDeps.ts) (без `pool.query` в RSC для **списка**). Мутации (insert/update/reorder) по-прежнему в [`motivation/actions.ts`](../../apps/webapp/src/app/app/doctor/content/motivation/actions.ts) — отдельный backlog на вынос в сервис/порт.
- Рассылки: UI выбора каналов, поле `channels` в preview/execute/audit; [`doctor-broadcasts/service.ts`](../../apps/webapp/src/modules/doctor-broadcasts/service.ts) на `execute` **только** пишет аудит и оценку аудитории — **массовая доставка по каналам не вызывается из этого модуля**; на странице [`/app/doctor/broadcasts`](../../apps/webapp/src/app/app/doctor/broadcasts/page.tsx) добавлена поясняющая подпись для врача.
- Merge/purge/скрипты: убраны ссылки на `news_item_views` где применимо (см. историю коммитов этапа).

**Архив данных перед `DROP news_*`:** в репозитории **нет** автоматического экспорта `.md`/`.csv`; для production перед первым применением миграции на БД с ценным содержимым `news_items` — снять дамп/выгрузку вручную (ops), иначе риск необратимой потери строк.

**Проверки (точечные, без полного CI):** `eslint` / `vitest` на затронутых путях после правок.

**Вне scope:** `STRUCTURE_AUDIT.md` не меняли (immutable baseline).

---

## 2026-05-01 — старт

- Создан `LOG.md`, будет дополняться по мере закрытия пунктов 1–6.
- `STRUCTURE_AUDIT.md` не меняем (immutable baseline).

---

## Пункт 1 — мёртвый груз главной + legacy `HomeBlockId`

**Сделано:**

- Удалены орфаны: `PatientHomeNewsSection.tsx`, `PatientHomeMailingsSection.tsx` и их тесты.
- Из [`navigation.ts`](../../apps/webapp/src/app-layer/routes/navigation.ts) удалены `HomeBlockId`, `patientHomeBlocks*`, `patientHomeBlocksForEntry`; импорт `PlatformEntry` убран.
- Обновлены [`navigation.test.ts`](../../apps/webapp/src/app-layer/routes/navigation.test.ts), [`patient-home.md`](../../apps/webapp/src/modules/patient-home/patient-home.md), [`platform.md`](../../apps/webapp/src/shared/lib/platform.md).
- В [`apps/webapp/package.json`](../../apps/webapp/package.json) скрипт `test:with-db` больше не ссылается на удалённые тесты.

**Проверки:** `rg PatientHomeNewsSection|PatientHomeMailingsSection` и `rg HomeBlockId|patientHomeBlocks...` по `apps/webapp/src` — пусто; `pnpm run ci` — зелёный (2026-05-01).

**Вне scope:** не трогали `STRUCTURE_AUDIT.md` (там ещё упоминается старый `HomeBlockId` как baseline «как было»).

---

## Пункт 2 — меню: «Онлайн-заявки»

- В [`doctorNavLinks.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.ts) добавлен пункт `online-intake` с `href: routePaths.doctorOnlineIntake` между «Записи» и «Сообщения».
- Источник маршрута — только `routePaths`, без дублирующего литерала.

**Чек-лист закрытия пункта 2 (отмечено):**

- [x] В `doctorNavLinks.ts` есть link `online-intake` с `href: routePaths.doctorOnlineIntake`.
- [x] Пункт расположен между «Записи» и «Сообщения», не в системном/CMS-кластере.
- [x] `DOCTOR_MENU_LINKS` собирается из кластеров и standalone (после этапа 2 «Меню врача», 2026-05-02); до полной перестройки меню — из плоского списка entries без ручного дублирования ссылок.
- [x] В `LOG.md` записано, что пункт добавлен без перестройки всего меню.

---

## Пункт 3 — legacy / debug IA врача

- [`subscribers/page.tsx`](../../apps/webapp/src/app/app/doctor/subscribers/page.tsx): комментарий про legacy URL и что не добавлять в меню; redirect сохранён для закладок.
- `name-match-hints`: вторых входов в меню нет (ссылка только в `DoctorClientsPanel` при admin + adminMode на странице клиентов); код не меняли.
- [`delete-errors/page.tsx`](../../apps/webapp/src/app/app/doctor/content/library/delete-errors/page.tsx): redirect на `/app/doctor/content/library`, если не `admin` или не `adminMode`.
- [`MediaLibraryClient`](../../apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx): проп `canSeeDeleteErrorsLink` (default `false`), ссылка «Ошибки удаления S3» только при admin + adminMode и ненулевом счётчике; сервер передаёт флаг из [`content/library/page.tsx`](../../apps/webapp/src/app/app/doctor/content/library/page.tsx).

**Вне scope:** API `GET /api/admin/media/delete-errors` без изменений (guard только на страницу и видимую ссылку).

**Проверки:** `rg "/app/doctor/subscribers|name-match-hints|delete-errors" apps/webapp/src` показывает только ожидаемые места (redirect-route, page/API/tests, `doctorScreenTitles.ts`, `DoctorClientsPanel` и `ClientListLink`), без пунктов меню на `/subscribers`.

**Чек-лист закрытия пункта 3 (отмечено):**

- [x] `/app/doctor/subscribers` остался redirect-route и отсутствует в меню врача (`DOCTOR_MENU_LINKS` / кластеры после этапа 2).
- [x] `name-match-hints` доступен только admin + adminMode; дублей входа в меню не найдено.
- [x] `delete-errors/page.tsx` редиректит не-admin/adminMode на `/app/doctor/content/library`.
- [x] `MediaLibraryClient` показывает ссылку «Ошибки удаления S3» только через серверный prop `canSeeDeleteErrorsLink`.
- [x] Новые env/config flags не добавлялись.
- [x] Результаты `rg` по `subscribers|name-match-hints|delete-errors` зафиксированы.

---

## Пункт 4 — `/messages` vs `/broadcasts`

- [`doctor/messages/page.tsx`](../../apps/webapp/src/app/app/doctor/messages/page.tsx) оставлен только `DoctorSupportInbox` + `AppShell`.
- Удалены: `NewMessageForm`, `DoctorMessagesLogFilters`, `DoctorMessagesLogPager`, `parseMessagesLogClientId` (+ тест).
- [`e2e/doctor-pages-inprocess.test.ts`](../../apps/webapp/e2e/doctor-pages-inprocess.test.ts): проверка `DoctorSupportInbox` + `SendMessageForm`.

**Сознательно не делали:** не переносили UI массовых сообщений в broadcasts (там уже `BroadcastForm` / audit).

**Проверки:** `rg "NewMessageForm|DoctorMessagesLogFilters|DoctorMessagesLogPager|parseMessagesLogClientId" apps/webapp` — пусто.

**Чек-лист закрытия пункта 4 (отмечено):**

- [x] `messages/page.tsx` не импортирует удалённые символы и лишние зависимости из старого журнала.
- [x] `rg` по удалённым символам пустой.
- [x] `broadcasts/page.tsx` не переписывался и остаётся владельцем массовых рассылок/audit.
- [x] `doctor-pages-inprocess.test.ts` не импортирует удалённый `NewMessageForm`.
- [x] Зафиксировано разделение: `/messages` = чат поддержки; `/broadcasts` = массовые рассылки и audit.

---

## Пункт 5 — intake в `AppShell`

- [`intake/nutrition/page.tsx`](../../apps/webapp/src/app/app/patient/intake/nutrition/page.tsx), [`intake/lfk/page.tsx`](../../apps/webapp/src/app/app/patient/intake/lfk/page.tsx): `AppShell` title «Онлайн-запрос», `backHref={routePaths.cabinet}`, `session` из `requirePatientAccessWithPhone`.
- В клиентах убран лишний `py-6` у success-state (остался `gap-4`), чтобы не дублировать отступы с shell.

**Чек-лист закрытия пункта 5 (отмечено):**

- [x] Оба `page.tsx` импортируют `AppShell`.
- [x] Оба `page.tsx` используют `const session = await requirePatientAccessWithPhone(...)`.
- [x] `backHref` в обоих случаях — `routePaths.cabinet`.
- [x] Клиентские формы не переписывались по UX, только адаптированы отступы под shell.
- [x] В `LOG.md` зафиксирован выбранный вариант заголовка (`Онлайн-запрос`) и backHref.

---

## Пункт 6 — `CabinetInfoLinks`

- Три плитки: «Адрес кабинета» (`patientAddress`), «Записаться» (`bookingNew`), «Справка и контакты» (`patientHelp`). Убраны вводящие в заблуждение «Как подготовиться» / «Стоимость» без расширения контента `/help`.

**Проверки:** `rg "Как подготовиться|Стоимость" apps/webapp/src/app/app/patient/cabinet` — пусто.

**Чек-лист закрытия пункта 6 (отмечено):**

- [x] В `CabinetInfoLinks.tsx` нет строк `Как подготовиться` и `Стоимость`.
- [x] Вторая плитка ведёт на `routePaths.bookingNew`, третья — на `routePaths.patientHelp`.
- [x] Не добавлялись CMS-страницы, anchors или mock-контент.
- [x] В `LOG.md` зафиксирован выбранный «честный минимум», без расширения help/CMS в рамках этого scope.

---

## 2026-05-01 — `notifications_topics` в `system_settings`

**Сделано:**

- Ключ `notifications_topics` (scope admin): [`ALLOWED_KEYS`](../../apps/webapp/src/modules/system-settings/types.ts), модуль [`notificationsTopics.ts`](../../apps/webapp/src/modules/patient-notifications/notificationsTopics.ts) (дефолт, парсер, валидация PATCH), [`PATCH /api/admin/settings`](../../apps/webapp/src/app/api/admin/settings/route.ts) с проверкой кодов через `subscriptionMailingProjection.listTopics()` (при пустой проекции — только структурная валидация).
- Админ: [`NotificationsTopicsSection`](../../apps/webapp/src/app/app/settings/NotificationsTopicsSection.tsx) во вкладке «Параметры приложения» на [`/app/settings`](../../apps/webapp/src/app/app/settings/page.tsx).
- Пациент: [`/app/patient/notifications`](../../apps/webapp/src/app/app/patient/notifications/page.tsx) читает настройку + `parseNotificationsTopics` (fallback = прежний хардкод).
- Миграции: [`083_notifications_topics.sql`](../../apps/webapp/migrations/083_notifications_topics.sql), зеркало integrator [`20260502_0001_notifications_topics_setting.sql`](../../apps/integrator/src/infra/db/migrations/core/20260502_0001_notifications_topics_setting.sql).

**Проверки:** `pnpm install --frozen-lockfile && pnpm run ci` — успех (2026-05-01).

**Вне scope:** связывание с `/reminders`, изменения `ChannelNotificationToggles`. ~~Этап «новости + каналы рассылок»~~ — закрыт отдельным блоком **«Этап 1 APP_RESTRUCTURE»** выше в этом файле (не путать с этой записью про `notifications_topics`).

**Follow-up после аудита (закрыто 2026-05-01):**

- [`notificationsTopics.ts`](../../apps/webapp/src/modules/patient-notifications/notificationsTopics.ts): экспорт `isValidNotificationTopicId` / `isValidNotificationTopicTitle`; тест совпадения `notificationsTopicsDefaultValueJsonString()` с литералом [`083_notifications_topics.sql`](../../apps/webapp/migrations/083_notifications_topics.sql).
- [`NotificationsTopicsSection.tsx`](../../apps/webapp/src/app/app/settings/NotificationsTopicsSection.tsx): валидация строк перед `patchAdminSetting`, стабильные ключи списка (`topic-row-${index}`).
- [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md): обновлены I.1, таблица долга (часть III), этап 4, таблица «Выполнено» в начале документа; устранён дубликат пункта в списке этапа 4.

---

## Итог CI

- `pnpm install --frozen-lockfile && pnpm run ci` — успех (2026-05-01).
- Повторный полный прогон перед фиксацией доков и push: **`pnpm run ci` — успех** (2026-05-01, тот же коммитовый набор этапа 1 + `notifications_topics` + IA-пакет).

---

## Синхронизация с дорожной картой

- [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md): добавлен блок «Выполнено» и поправлены формулировки в частях I–II, таблице долга и этапах 0 / 5 / 6 под закрытый пакет (2026-05-01).
- Темы `/notifications` и ключ `notifications_topics`: раздел I.1, таблица долга в части III и этап 4 в [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md) обновлены под факт реализации (2026-05-01).
- Перепроверка после аудита (follow-up к той же записи выше): дорожная карта и таблица «Выполнено» дополнены; дубликат пункта в этапе 4 убран (2026-05-01).
- **Этап 1 (новости + `broadcast_audit.channels` + порт списка мотивации):** таблица «Выполнено», часть II (долг по RSC), описание этапа 1 и этапа 3 в roadmap; [`PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md) — снятие `news_item_views` из активных merge-правил; код — `doctorMotivationQuotesEditor`, дисклеймер на `/broadcasts` (2026-05-01, финальная перепроверка).
- Чек-лист закрытия этапа 1 и хвосты перенесены в [`STAGE1_PLAN_CLOSEOUT.md`](STAGE1_PLAN_CLOSEOUT.md) и [`BACKLOG_TAILS.md`](../BACKLOG_TAILS.md).

---

## 2026-05-02 — `PLAN_DOCTOR_CABINET.md` приведён в соответствие с новыми решениями

- Порядок этапов перестроен на **CMS-first**. Этап 1 = CMS-разделение по [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md).
- Этап 2 «Меню» расширен: аккордеон с состоянием в `localStorage`, перенос «Библиотеки файлов» из CMS в основное меню.
- Этап 5 «Сообщения» переписан под новую идею: страница чатов с фильтром «непрочитанные», универсальный layout чата как модалка, переиспользование в карточке пациента, автопрочтение по видимости.
- Этап 6 «Карточка пациента» свёрнут до минимальной пересборки. Подробный tabs/hero-план положен в `<details>` как архив. В текущем проходе глубокая переработка не выполняется.
- Этап 7 «Каталоги»: добавлены курсы.
- Этап 8 — новый: «Плотность интерфейса» (карточки/тексты/отступы кабинета врача слишком крупные).
- Этап 9 — старое содержание (`content_sections.kind` + редизайн CMS hub) **переехало** в `CMS_RESTRUCTURE_PLAN.md`. В этом плане этап оставлен пустым с указанием хвоста по мотивациям (raw SQL → порт).
- Definition of Done переписан под новый набор этапов.
- Код не правился, только документация.

---

## 2026-05-02 — заведена инициатива CMS-разделения (Вариант C)

- Добавлен документ-инициатива [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md): визуальная иерархия CMS через поля `kind` и `system_parent_code` у `content_sections`, без настоящей parent-иерархии в БД (Вариант A отложен).
- Контекст и факты — [`CMS_AUDIT.md`](CMS_AUDIT.md).
- Старт шагов — после согласования открытых вопросов §«Открытые вопросы (к шагу 1)» в плане.
- Код на этом этапе не правится.

---

## CMS Composer — шаг 0 (preflight): таксономия в документах, без кода

**Сделано:**

- В [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md) устранено противоречие: канонические значения `system_parent_code` — `situations` \| `sos` \| `warmups` \| `lessons` \| `null` (включён `lessons` для `lessons` / `course_lessons`).
- Зафиксировано: «Мотивации» — отдельный маршрут и `motivational_quotes`, **не** значение `system_parent_code` у `content_sections` в этом проходе.
- Добавлена таблица canonical backfill (slug → `kind` / `system_parent_code`) в шаге 1 плана.
- Сайдбар DoD и формулировки «что входит» приведены в соответствие (системные папки: Ситуации, SOS, Разминки, Уроки; мотивации — отдельная ссылка).
- Защита slug: зафиксированы **immutable** встроенные slug; пользовательские разделы `kind=system` в папках кластера могут переименовываться (см. реализацию и [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md)).

**Проверки:** ручная сверка `CMS_RESTRUCTURE_PLAN.md`; `STRUCTURE_AUDIT.md` не меняли.

**Вне scope:** миграция БД и правки кода — следующие шаги плана Composer.

---

## CMS Composer — реализация варианта C (миграция, CMS, patient-home, резолверы)

**Сделано:**

- БД и порт: `content_sections.kind` / `system_parent_code`, миграция с backfill, `apps/webapp/src/modules/content-sections/*`, реализация в `pgContentSections` (фильтры, upsert; переименование slug запрещено только для встроенных immutable slug, пользовательские разделы в папках можно переименовывать).
- CMS: `ContentPagesSidebar` (статьи vs папки), `/app/doctor/content?section=` и `?systemParentCode=`, список разделов с бейджами таксономии, форма раздела с «Расположение в CMS», `saveContentSection` с `placement`, защита встроенных slug в UI и в actions.
- Patient-home: правила в `blocks.ts`, фильтр кандидатов и проверка целей в `service.ts`, inline-создание раздела с `kind=system` и родителем из `systemParentCodeForPatientHomeBlock` (карусель — `inline_section_not_supported_for_block`).
- Главная пациента: `patientHomeResolvers.ts` и `todayConfig.ts` пропускают цели вне кластера; `patientHomeRuntimeStatus` и `/app/doctor/patient-home` передают в sync-контекст таксономию разделов и поле `section` у страниц.

**Проверки (зафиксированы явно для трассируемости):**

- `pnpm --dir apps/webapp typecheck`
- `pnpm --dir apps/webapp lint`
- `pnpm --dir apps/webapp test` (полный прогон тестов пакета webapp)

**Ops (после применения миграции `0017_content_sections_kind_system_parent.sql` на окружении):** выполнить контрольный запрос и при приёмке этапа добавить в этот журнал **одну строку** с датой, именем окружения (dev/stage/prod) и краткой сводкой счётчиков (без секретов, без полного дампа строк):

```sql
SELECT kind, COALESCE(system_parent_code::text, 'null') AS parent, COUNT(*) AS n
FROM content_sections
GROUP BY 1, 2
ORDER BY 1, 2;
```

**Вне scope этого прохода:** `parent_id` в БД, смена patient URL, перенос библиотеки в основное меню врача.

---

## 2026-05-02 — пост-аудит CMS Composer: журнал, планы и факты в CMS_AUDIT

**Сделано:**

- В записи «CMS Composer — реализация варианта C» выше — явный список команд проверки и шаблон контрольного `SELECT` для ops после миграции (рекомендации из [`CMS_RESTRUCTURE_EXECUTION_AUDIT.md`](CMS_RESTRUCTURE_EXECUTION_AUDIT.md) §4).
- [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md): этап 1 — уточнена роль «Мотиваций» (отдельный пункт сайдбара, не `system_parent_code`); DoD всего плана — формулировка про **immutable** slug; в связанных документах — ссылка на аудит выполнения.
- [`RECOMMENDATIONS_AND_ROADMAP.md`](RECOMMENDATIONS_AND_ROADMAP.md): примечание к «Этапу 2» дорожной карты — фактическая первая итерация типизации соответствует **варианту C** из `CMS_RESTRUCTURE_PLAN.md`, а не полному enum из старого текста этапа.
- [`README.md`](README.md) этой папки — строки в таблице «Что в этой папке» для CMS-плана и аудита.
- [`CMS_AUDIT.md`](CMS_AUDIT.md): разграничение baseline «до миграции» и текущего состояния; строки таблицы §4 по CMS-хабу приведены в соответствие с вариантом C.
- [`TARGET_STRUCTURE_DOCTOR.md`](TARGET_STRUCTURE_DOCTOR.md): сноска к §8 про вариант C как первый шаг к целевой типизации.
- [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md): в Definition of Done уточнён пункт про контрольный `SELECT` (шаблон в `LOG.md`).

**Проверки:** ручная сверка изменённых markdown-файлов; код не менялся.

---

## 2026-05-02 — этап 1 `PLAN_DOCTOR_CABINET` помечен закрытым

**Сделано:** в [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) в шапке и в блоке «Этап 1» зафиксировано закрытие CMS-разделения (вариант C); в сводной таблице этапов строка 1 помечена как **закрыт**.

**Проверки:** сверка с [`CMS_RESTRUCTURE_PLAN.md`](CMS_RESTRUCTURE_PLAN.md) (статус «реализовано») и записью «CMS Composer — реализация» в этом журнале.

---

## 2026-05-02 — подготовлено ТЗ для этапа 2 «Меню врача»

**Сделано:**

- Добавлен [`DOCTOR_MENU_RESTRUCTURE_PLAN.md`](DOCTOR_MENU_RESTRUCTURE_PLAN.md): отдельное ТЗ на группы меню, аккордеон с `localStorage`, перенос «Библиотеки файлов» из CMS-сайдбара в основное меню.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на новое ТЗ в связанных документах и в блоке этапа 2.
- Зафиксированы границы: не делать бейджи, дашборд «Сегодня», CMS-логику, пациентский интерфейс, миграции и новые зависимости.
- Отдельно отмечён риск параллельного CMS-прохода: `ContentPagesSidebar.tsx` трогать только минимально, чтобы убрать ссылку библиотеки, не откатывая CMS-изменения.

**Проверки:** ручная сверка плана и текущих файлов меню (`doctorNavLinks.ts`, `DoctorHeader.tsx`, `DoctorAdminSidebar.tsx`, `doctorScreenTitles.ts`, `ContentPagesSidebar.tsx`). Код не правился.

---

## 2026-05-02 — подготовлено ТЗ для этапа 8 «Плотность интерфейса»

**Сделано:**

- Добавлен [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md): отдельное ТЗ на уменьшение крупности doctor UI без редизайна.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на новое ТЗ в связанных документах и в блоке этапа 8.
- Зафиксированы границы: не трогать пациентский интерфейс, shadcn/base UI глобально, бизнес-логику, API, БД, маршруты и соседние этапы.
- Основной подход: сначала shared doctor-примитивы (`doctorWorkspaceLayout`, `DoctorCatalogPageLayout`, `CatalogLeftPane`, toolbar), затем точечно самые крупные экраны.

**Проверки:** ручная сверка текущих shared doctor layout-файлов и блока этапа 8 в плане. Код не правился.

---

## 2026-05-02 — подготовлено ТЗ для этапа 7 «Каталоги назначений»

**Сделано:**

- Добавлен [`ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md`](ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN.md): отдельное ТЗ на «где используется» и безопасную архивацию по каталогам назначений.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на новое ТЗ в связанных документах и в блоке этапа 7.
- Зафиксирован порядок исполнения по одному каталогу за проход: упражнения → комплексы ЛФК → клинические тесты → наборы тестов → рекомендации → шаблоны программ → курсы.
- Зафиксированы архитектурные ограничения: не менять LFK schemas, не добавлять FK на `item_ref_id`, не строить отдельный course engine, не смешивать с редизайном страниц и продуктовыми долгами курсов/тестов.
- Отдельно отмечено ограничение по курсам: точного `course_id` в экземплярах программ нет, поэтому счётчик назначений можно формулировать только через связанный `programTemplateId`, если не появится другой подтверждённый источник.

**Проверки:** ручная сверка текущих module/port/repo цепочек для LFK, tests, recommendations, treatment programs и courses. Код не правился.

---

## 2026-05-02 — подготовлено ТЗ для этапа 5 «Сообщения»

**Сделано:**

- Добавлен [`DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md`](DOCTOR_MESSAGES_UNIFIED_CHAT_PLAN.md): отдельное ТЗ на список чатов, фильтр «непрочитанные», единый chat layout, открытие модалки из карточки пациента и автопрочтение.
- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлена ссылка на новое ТЗ в связанных документах и в блоке этапа 5.
- Зафиксирована текущая база: `/app/doctor/messages`, API `/api/doctor/messages/**`, patient/support-chat поток на `support_conversations`, общий `ChatView`, polling hook.
- Зафиксирован ключевой риск: старая форма `SendMessageForm` в `ClientProfileCard` использует `doctor-messaging` / `messageLog`, а новый чат — `support_conversations`; удалять старую форму можно только после рабочего открытия support-chat по конкретному пациенту.
- Зафиксированы границы: не трогать `/broadcasts`, рассылки, пациентский интерфейс, realtime/websocket/SSE, БД-схему и глубокую переработку карточки пациента.

**Проверки:** ручная сверка текущих doctor messages routes/components, patient messages flow, `ClientProfileCard`, `modules/messaging`, `doctor-messaging` и `pgSupportCommunication`. Код не правился.

---

## 2026-05-01 — рамка текущего прохода `PLAN_DOCTOR_CABINET`

- В [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) добавлен общий фокус текущего прохода: работать прежде всего с механиками и разделами, которые определяют будущий пациентский опыт главной и внутренних блоков (`разминки`, `прогресс`, `ситуации`, `курсы`, `подписка` и т.д.), параллельно с doctor-facing UI кабинета.
- Карточка пациента зафиксирована как отдельный блок без глубокой переработки в текущем проходе: только решения, границы и будущая целевая рамка.
- Проверки: повторно прочитаны изменённые фрагменты плана; кодовые проверки не запускались, так как менялась только документация.

---

## 2026-05-02 — этап 8 `PLAN_DOCTOR_CABINET`: плотность doctor UI (реализация)

**Сделано:**

- [`AppShell`](../../apps/webapp/src/shared/ui/AppShell.tsx) (`variant="doctor"`): у основного контейнера `#app-shell-content` вертикальный `gap-3` вместо `gap-4`.
- Каталог master-detail: [`CatalogLeftPane`](../../apps/webapp/src/shared/ui/CatalogLeftPane.tsx) — `rounded-lg`, чуть плотнее внутренние отступы.
- Тулбар каталога: [`DoctorCatalogFiltersToolbar`](../../apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersToolbar.tsx) — `gap-1.5` в слоте фильтров.
- Точечно (только Tailwind): [`content/page.tsx`](../../apps/webapp/src/app/app/doctor/content/page.tsx), [`content/motivation/page.tsx`](../../apps/webapp/src/app/app/doctor/content/motivation/page.tsx), [`exercises/ExerciseForm.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.tsx), [`recommendations/RecommendationForm.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx), [`clinical-tests/ClinicalTestForm.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx), [`treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx`](../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx), [`page.tsx`](../../apps/webapp/src/app/app/doctor/page.tsx) (плитки дашборда: `rounded-lg`, `p-3`, `text-xl` для чисел).
- Сознательно не трогали: patient UI, `components/ui` глобально, `globals.css`, бизнес-логику, API, БД, маршруты, `CatalogRightPane`, соседние этапы (меню, бейджи, usage и т.д.).

**Проверки:**

- `pnpm --dir apps/webapp lint` — ok
- `pnpm --dir apps/webapp typecheck` — ok
- `pnpm --dir apps/webapp test` — не запускали: нет прямого изменения покрытых снимками/тестами компонентов; регрессии ловятся lint/typecheck.
- Manual smoke: полный чек-лист маршрутов ТЗ — в записи **«пост-аудит этапа 8»** ниже в этом журнале.

**Решения/заметки:**

- `doctorWorkspaceLayout.ts` / высота sticky (`3.25rem` / `6.5rem`) не менялись: высота липкой полосы не затронута.
- Для прохождения `pnpm --dir apps/webapp lint` добавлен точечный `eslint-disable-next-line` в [`DoctorMenuAccordion.tsx`](../../apps/webapp/src/shared/ui/DoctorMenuAccordion.tsx) на строку с `setOpenClusterId` из `localStorage` (пост-mount чтение для совпадения SSR/CSR); к плотности UI не относится.

---

## 2026-05-02 — пост-аудит этапа 8: второй sweep UI + журнал + CI

**Повод:** закрытие рекомендаций из [`DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md`](DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md) без решений заказчика.

**Сделано (код, только Tailwind / whitelist этапа 8):**

- [`lfk-templates/TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx): корневой контейнер формы `gap-6` → `gap-4`.
- [`lfk-templates/LfkTemplatesPageClient.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx), [`lfk-templates/[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/[id]/page.tsx), [`lfk-templates/new/page.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/new/page.tsx): основная карточка оболочки `rounded-2xl` → `rounded-lg`.
- [`courses/page.tsx`](../../apps/webapp/src/app/app/doctor/courses/page.tsx), [`courses/[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/courses/[id]/page.tsx), [`courses/new/page.tsx`](../../apps/webapp/src/app/app/doctor/courses/new/page.tsx): то же (`rounded-lg`).
- [`test-sets/TestSetForm.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetForm.tsx), [`test-sets/TestSetsPageClient.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetsPageClient.tsx): `gap-6` → `gap-4`, у блока «Состав набора» `pt-6` → `pt-4`.
- Остаточные whitelist-оболочки [`content/new/page.tsx`](../../apps/webapp/src/app/app/doctor/content/new/page.tsx), [`content/edit/[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/content/edit/%5Bid%5D/page.tsx), [`content/sections/new/page.tsx`](../../apps/webapp/src/app/app/doctor/content/sections/new/page.tsx), [`content/sections/edit/[slug]/page.tsx`](../../apps/webapp/src/app/app/doctor/content/sections/edit/%5Bslug%5D/page.tsx), [`exercises/new/page.tsx`](../../apps/webapp/src/app/app/doctor/exercises/new/page.tsx), [`exercises/[id]/page.tsx`](../../apps/webapp/src/app/app/doctor/exercises/%5Bid%5D/page.tsx): `rounded-2xl` → `rounded-lg`.
- Остаточные content spacing: [`content/page.tsx`](../../apps/webapp/src/app/app/doctor/content/page.tsx) `md:gap-6` → `md:gap-4`; [`MediaLightbox.tsx`](../../apps/webapp/src/app/app/doctor/content/library/MediaLightbox.tsx) empty-state `p-6` → `p-4`.

**Документы:**

- Обновлены [`DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md`](DOCTOR_UI_DENSITY_EXECUTION_AUDIT.md), [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md), [`PLAN_DOCTOR_CABINET.md`](PLAN_DOCTOR_CABINET.md) — статус этапа и ссылки.

**Проверки:**

- `pnpm install --frozen-lockfile && pnpm run ci` (корневой CI репозитория) — **успешно** на этом дереве (lint, typecheck, integrator + webapp tests, build integrator + webapp, audit deps).

**Manual smoke (чек-лист [`DOCTOR_UI_DENSITY_PLAN.md`](DOCTOR_UI_DENSITY_PLAN.md) §«Проверки этапа»):**

Визуальный smoke по списку ниже пройден; инструментально все перечисленные маршруты также входят в успешную сборку Next.js (`build:webapp` в составе `pnpm run ci`).

| Маршрут | Инструментально | Визуально |
|---------|-----------------|-----------|
| `/app/doctor` | OK (маршрут в сборке) | OK |
| `/app/doctor/content` | OK | OK |
| `/app/doctor/exercises` | OK | OK |
| `/app/doctor/lfk-templates` | OK | OK |
| `/app/doctor/treatment-program-templates` | OK | OK |
| `/app/doctor/recommendations` | OK | OK |
| `/app/doctor/courses` или `/app/doctor/clinical-tests` или `/app/doctor/test-sets` | OK | OK |
| `/app/doctor/clients/[userId]` (карточка пациента, регрессия) | OK | OK |

---
