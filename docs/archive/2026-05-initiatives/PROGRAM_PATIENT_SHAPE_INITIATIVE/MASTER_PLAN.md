# MASTER PLAN — PROGRAM_PATIENT_SHAPE

## 1. Цель

Довести модель «любое назначение = `treatment_program_instance`» до рабочей клинической эксплуатации:

- этапы с понятной целью/задачами/сроком;
- рекомендации `actionable`/`persistent` + Этап 0;
- группы внутри этапа;
- журнал действий пациента + inbox «К проверке»;
- бейджи «План обновлён» и «Новое».

Канонический продуктовый источник: [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md).

## 2. Границы scope

### In scope

- Только этапы A1–A5 из продуктового ТЗ.
- Нужные миграции Drizzle, сервисы, route handlers, UI пациента/врача, тесты.
- Universal comment pattern в части `instance_stage_item.local_comment` и копирования template->instance.
- Все изменения держать в `treatment-program`-контуре (`modules/treatment-program`, `api/*/treatment-program-*`, `app/patient/treatment-programs/*`).

### Out of scope

- Курсы (`COURSES_INITIATIVE`) — отдельная инициатива.
- Полная переработка каталогов «Назначений» (B1–B7) — sister-инициатива.
- Push/PWA-уведомления, расширенный календарь, расширенная аналитика — backlog.

## 3. Зависимости и порядок

Базовый порядок: **A1 -> A2 -> A3 -> A4 -> A5**.

Практический порядок с учётом sister-плана:

1. B6 (визуальный pass конструктора) рекомендуется закрыть до A1/A3.
2. A1.
3. A2.
4. A3.
5. A4.
6. A5.

Между этапами допустимы паузы при выполненном DoD текущего этапа и обновлённом журнале.

### 3.1 Карта кодовой базы (зафиксировано до старта реализации)

Базовые точки входа и слои, к которым привязываются A1-A5:

- Domain/services: `apps/webapp/src/modules/treatment-program/` (`service.ts`, `instance-service.ts`, `progress-service.ts`, `ports.ts`, `types.ts`).
- Doctor API:
  - `apps/webapp/src/app/api/doctor/treatment-program-templates/**`
  - `apps/webapp/src/app/api/doctor/treatment-program-instances/**`
  - `apps/webapp/src/app/api/doctor/clients/[userId]/treatment-program-instances/route.ts`
- Patient API:
  - `apps/webapp/src/app/api/patient/treatment-program-instances/route.ts`
  - `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/route.ts`
  - `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/**`
  - `apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/test-results/route.ts`
- Patient UI:
  - `apps/webapp/src/app/app/patient/treatment-programs/page.tsx`
  - `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/page.tsx`
  - `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx`
- Doctor UI:
  - `apps/webapp/src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx`
  - `apps/webapp/src/app/app/doctor/treatment-program-templates/**`
  - `apps/webapp/src/app/app/doctor/clients/**` (точка для inbox в A4)
- Drizzle schema:
  - `apps/webapp/db/schema/treatmentProgramTemplates.ts`
  - `apps/webapp/db/schema/treatmentProgramInstances.ts`
  - `apps/webapp/db/schema/treatmentProgramEvents.ts`
  - `apps/webapp/db/schema/treatmentProgramTestAttempts.ts`

## 4. Артефакты реализации

- Этапные планы: [`STAGE_A1_PLAN.md`](STAGE_A1_PLAN.md) ... [`STAGE_A5_PLAN.md`](STAGE_A5_PLAN.md)
- Журнал: [`LOG.md`](LOG.md)
- Финальный аудит: [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md) (после A1…A5; канон итогового review вместо отдельного `PROGRAM_PATIENT_SHAPE_EXECUTION_AUDIT.md`)

## 5. Общая политика проверок

На каждом этапе:

- целевой `eslint` по затронутым файлам;
- целевой `typecheck` по `apps/webapp`, если меняются shared types/сервисы;
- unit/integration тесты по изменённым модулям;
- smoke ключевых сценариев UI.

Полный `pnpm run ci` — в конце крупного батча или перед пушем.

## 6. Composer-Safe Execution Standard

Этот раздел обязателен для исполнителя. Если план этапа и этот стандарт конфликтуют, остановиться и уточнить.

### 6.1 Разрешённые UI primitives

Doctor/admin UI:

- `@/components/ui/button` — `Button` для всех действий. Не писать raw `<button>`, кроме случаев, где текущий существующий компонент уже так устроен и правка не входит в scope.
- `@/components/ui/input` — `Input`.
- `@/components/ui/label` — `Label`.
- `@/components/ui/textarea` — `Textarea`.
- `@/components/ui/select` — `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`.
- `@/components/ui/dialog` — `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`.
- `@/components/ui/badge` — `Badge` для статусов.
- `@/components/ui/card` — `Card`, `CardHeader`, `CardContent` только если компонент уже использует card-composition или новый block реально reusable.
- `@/shared/ui/ReferenceSelect` — справочники/регионы, если нужен reference picker.

Patient UI:

- Сначала использовать `@/shared/ui/patientVisual.ts`:
  - `patientSectionSurfaceClass`
  - `patientCardClass`
  - `patientCardCompactClass`
  - `patientListItemClass`
  - `patientSectionTitleClass`
  - `patientBodyTextClass`
  - `patientMutedTextClass`
  - `patientPillClass`
  - `patientPrimaryActionClass`
  - `patientSecondaryActionClass`
  - `patientInlineLinkClass`
- Для forms внутри patient UI использовать shadcn/base-ui `Input`, `Textarea`, `Select`, `Button` только вместе с patient surface/action classes, если текущий route так устроен.

### 6.2 Запрещённые UI действия

- Не импортировать `apps/webapp/src/app/app/patient/home/*` на внутренних patient pages.
- Не делать новый home-like hero/chrome для `Plan`.
- Не создавать локальный custom select/dialog/accordion, если есть shared/shadcn primitive.
- Не добавлять новую UI-библиотеку для drag-and-drop или accordion в рамках A1–A5.
- Для A3 groups использовать сначала simple reorder buttons (`ChevronUp`, `ChevronDown`) и `Button`; drag-and-drop — отдельное улучшение после стабильной модели.
- Если нужен accordion на patient side, а shared `Accordion` отсутствует, использовать native `<details>` / `<summary>` с patient classes или создать отдельный shared primitive только отдельным подэтапом.

### 6.3 Архитектурные запреты

- `modules/*` не импортируют `@/infra/db/*` и `@/infra/repos/*`.
- Route handlers не содержат business logic и SQL.
- Новые таблицы/queries — Drizzle.
- Ports определяются в `modules/*/ports.ts`, реализации — в `infra/repos/*`.
- `buildAppDeps()` не вызывается из `modules/*`.
- Не добавлять env vars для integration config.

### 6.4 Stage gates

- A1 использует зафиксированное решение O1: `objectives` = `TEXT` (markdown) в этой инициативе. JSONB-checklist вынесен в backlog как отдельное улучшение.
- A2 использует зафиксированное решение O4: `is_actionable` хранится только на `instance_stage_item`; дефолт на каталоге не вводится в A2.
- A4 использует зафиксированные решения:
  - O2: гранулярность лога ЛФК в MVP = уровень комплекса (не упражнения).
  - O3: заметка из post-session формы пишется в `program_action_log.note`; отдельное поле `lfk_session.note` в A4 не добавляется.
- A5 нельзя включать без backfill `last_viewed_at`, иначе старые элементы станут ложными «новыми».

### 6.5 Обязательные документы после каждого прохода

- Добавить запись в [`LOG.md`](LOG.md) по [`LOG_TEMPLATE.md`](LOG_TEMPLATE.md).
- Если этап закрыт — создать stage audit по [`EXECUTION_AUDIT_TEMPLATE.md`](EXECUTION_AUDIT_TEMPLATE.md) или записать в будущий общий audit.
- Если принято продуктовое решение — синхронизировать `../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md` §8.

## 7. Completion Criteria

- Все этапы A1–A5 закрыты и отмечены в [`LOG.md`](LOG.md).
- Реализация соответствует `PROGRAM_PATIENT_SHAPE_PLAN.md`.
- Нет regressions по текущим patient/doctor сценариям назначения.
- `pnpm install --frozen-lockfile && pnpm run ci` зелёный на финальном коммите.
- Подготовлен итоговый аудит: [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md).
