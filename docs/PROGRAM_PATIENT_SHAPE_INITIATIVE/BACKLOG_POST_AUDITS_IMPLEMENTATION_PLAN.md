---
name: Backlog post-audits implementation
overview: "Пошаговая реализация бэклога из [BACKLOG_PRODUCT_AFTER_AUDITS.md](./BACKLOG_PRODUCT_AFTER_AUDITS.md): скрытие пустых этапов у пациента, guard «одна активная программа», UI редактирования instance-группы у врача, локальный календарь для чек-листа по IANA. A5-TS — вне объёма «сейчас»."
todos:
  - id: hide-empty-stage
    content: "§1: patientStageSectionShouldRender в stage-semantics + фильтр в PatientTreatmentProgramDetailClient + тесты"
    status: completed
  - id: single-active-guard
    content: "§2: проверка в assignTemplateToPatient + сообщение + тест instance-service"
    status: completed
  - id: instance-group-edit-ui
    content: "§3: Dialog PATCH группы в TreatmentProgramInstanceDetailClient"
    status: completed
  - id: checklist-timezone
    content: "§4: миграция/настройка IANA пациента + local day window в patient-program-actions + тесты"
    status: completed
  - id: docs-log
    content: "§5: BACKLOG/LOG/api.md после мерж-батча"
    status: completed
isProject: false
---

# План: реализация замечаний «сейчас» (улучшенный)

## Что делаем сейчас

- Скрываем пустые этапы у пациента полностью.
- Ограничиваем создание второй активной программы.
- Добавляем UI редактирования группы в инстансе у врача.
- Переводим окно чек-листа «на сегодня» с UTC на локальный календарь пациента (IANA).

## Что не делаем сейчас

- Фаза B каталогов ([`MASTER_PLAN.md` (B1–B7)](../ASSIGNMENT_CATALOGS_REWORK_INITIATIVE/MASTER_PLAN.md)).
- Отдельные `viewed` записи в `program_action_log`.
- `A5-TS-EQUALITY-01` (остаётся несрочным TODO).

---

## Scope boundaries

- Разрешённые области:
  - [`apps/webapp/src/modules/treatment-program/`](../../apps/webapp/src/modules/treatment-program/)
  - [`apps/webapp/src/app/app/patient/treatment-programs/`](../../apps/webapp/src/app/app/patient/treatment-programs/)
  - [`apps/webapp/src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx`](../../apps/webapp/src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx)
  - точечные API маршруты `doctor/patient treatment-program-instances`
  - schema/migrations только при задаче timezone
  - docs инициативы: [эта папка](./)
- Вне scope:
  - курсы и integrator домен
  - рефакторы каталогов B1-B7
  - изменения CI/workflow

---

## Оценка объёма

- «Сейчас»:
  - скрытие пустого этапа: **S**
  - guard одной активной программы: **S**
  - UI редактирования instance-группы: **S**
  - timezone чек-листа: **M**
  - суммарно: **M** (1-2 рабочих батча)
- Фаза B целиком: **XL** (много экранов, фильтров, миграций и этапов)

---

## Батч 1 (быстрый): UX + guard

### 1) Скрыть пустой этап у пациента

Файлы:
- [`apps/webapp/src/modules/treatment-program/stage-semantics.ts`](../../apps/webapp/src/modules/treatment-program/stage-semantics.ts)
- [`apps/webapp/src/modules/treatment-program/stage-semantics.test.ts`](../../apps/webapp/src/modules/treatment-program/stage-semantics.test.ts)
- [`apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx)

Действия:
- Вынести условие видимости этапа в семантический helper `patientStageSectionShouldRender(...)`.
- В `PatientTreatmentProgramDetailClient` фильтровать `stageZeroStages` и `otherStages` по helper до рендера `PatientInstanceStageBody`.
- Правило:
  - секция показывается, если есть хотя бы один видимый item;
  - секция показывается, если контент заблокирован (`locked/skipped`) и нужен текст «этап откроется»;
  - иначе этап не рендерится.

Checklist проверок:
- `rg "patientStageSectionShouldRender|stageZeroStages|otherStages" apps/webapp/src/modules/treatment-program apps/webapp/src/app/app/patient/treatment-programs`
- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/stage-semantics.test.ts`
- `pnpm --dir apps/webapp exec eslint "src/modules/treatment-program/stage-semantics.ts" "src/modules/treatment-program/stage-semantics.test.ts" "src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx"`

### 2) Ограничить вторую активную программу

Файлы:
- [`apps/webapp/src/modules/treatment-program/instance-service.ts`](../../apps/webapp/src/modules/treatment-program/instance-service.ts)
- [`apps/webapp/src/modules/treatment-program/instance-service.test.ts`](../../apps/webapp/src/modules/treatment-program/instance-service.test.ts)
- при необходимости [`apps/webapp/src/app/api/doctor/clients/[userId]/treatment-program-instances/route.ts`](../../apps/webapp/src/app/api/doctor/clients/[userId]/treatment-program-instances/route.ts)
- docs API: [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md)

Действия:
- В начале `assignTemplateToPatient` проверять через `listInstancesForPatient(...)`, что нет инстанса со `status === "active"`.
- При наличии активного инстанса выбрасывать понятную доменную ошибку на русском.
- Убедиться, что route корректно отдаёт ошибку врачу (400/409 — зафиксировать и документировать единообразно).

Checklist проверок:
- `rg "assignTemplateToPatient|listInstancesForPatient|active" apps/webapp/src/modules/treatment-program apps/webapp/src/app/api/doctor/clients`
- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/instance-service.test.ts`
- `pnpm --dir apps/webapp exec eslint "src/modules/treatment-program/instance-service.ts" "src/modules/treatment-program/instance-service.test.ts" "src/app/api/doctor/clients/[userId]/treatment-program-instances/route.ts"`

### 3) UI редактирования instance-группы (A3-UI-INST-01)

Файлы:
- [`apps/webapp/src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx`](../../apps/webapp/src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx)
- [`apps/webapp/src/app/api/doctor/treatment-program-instances/[instanceId]/stage-groups/[groupId]/route.ts`](../../apps/webapp/src/app/api/doctor/treatment-program-instances/[instanceId]/stage-groups/[groupId]/route.ts)

Действия:
- Добавить кнопку «Изменить» у группы в `InstanceStageGroupsPanel`.
- Добавить `Dialog` с полями `title`, `description`, `scheduleText`.
- PATCH в существующий endpoint + `onSaved()` по успеху.
- Сохранить composer-safe primitives (`Button`, `Dialog`, `Input`, `Textarea`, `Label`).

Checklist проверок:
- `rg "InstanceStageGroupsPanel|stage-groups|PATCH" apps/webapp/src/app/app/doctor/clients/treatment-programs/[instanceId] apps/webapp/src/app/api/doctor/treatment-program-instances/[instanceId]/stage-groups/[groupId]`
- `pnpm --dir apps/webapp exec eslint "src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx" "src/app/api/doctor/treatment-program-instances/[instanceId]/stage-groups/[groupId]/route.ts"`
- smoke руками: create/edit/reorder/delete group в doctor instance UI

Gate батча 1:
- целевые тесты `vitest` и `eslint` зелёные;
- `tsc --noEmit` по webapp, если затронуты shared типы.

---

## Батч 2 (средний): timezone пациента для чек-листа

### 4) A4-UTC-01 — локальные сутки пациента

Файлы (ожидаемо):
- [`apps/webapp/db/schema/schema.ts`](../../apps/webapp/db/schema/schema.ts) + новая миграция
- [`apps/webapp/src/modules/treatment-program/patient-program-actions.ts`](../../apps/webapp/src/modules/treatment-program/patient-program-actions.ts)
- [`apps/webapp/src/modules/treatment-program/patient-program-actions.test.ts`](../../apps/webapp/src/modules/treatment-program/patient-program-actions.test.ts)
- профиль/настройки пациента (конкретный файл выбрать при реализации после `rg`)
- при необходимости `system_settings` доступ для fallback `app_display_timezone`

Решение данных:
- Добавить персональный `calendar_timezone` (IANA) пациенту.
- Fallback при `NULL`: `app_display_timezone`.
- Никаких env для timezone логики.

Действия:
- Ввести `localDayWindowIso(now, iana)` (DST-safe, через Luxon).
- Использовать окно во всех чек-листовых операциях:
  - `listChecklistDoneToday`
  - `patientToggleChecklistItem`
  - `patientSubmitLfkPostSession`
- Пробросить получение timezone по `patientUserId` через порт/репозиторий.

Checklist проверок:
- `rg "utcDayWindowIso|localDayWindowIso|checklist" apps/webapp/src/modules/treatment-program`
- `pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/patient-program-actions.test.ts`
- `pnpm --dir apps/webapp exec eslint "src/modules/treatment-program/patient-program-actions.ts" "src/modules/treatment-program/patient-program-actions.test.ts"`
- `pnpm --dir apps/webapp exec tsc --noEmit`

Gate батча 2:
- миграция применяется локально без ошибок;
- тесты на границе суток в не-UTC зоне проходят.

---

## Синхронизация документации

После каждого батча:
- Запись в [`LOG.md`](./LOG.md) по шаблону.
- Обновить [`BACKLOG_PRODUCT_AFTER_AUDITS.md`](./BACKLOG_PRODUCT_AFTER_AUDITS.md) статусами «done/todo».
- Если меняется контракт API: [`apps/webapp/src/app/api/api.md`](../../apps/webapp/src/app/api/api.md).

---

## Риски и меры

- Риск ложного скрытия этапа: не скрыть `locked/skipped` этапы с полезным сообщением.
  - Мера: отдельный тест на `contentBlocked=true && visibleItems=0`.
- Риск регресса назначения: blocker второй программы ломает существующие кейсы QA.
  - Мера: тест на «одна активная + завершённая старая» (после `completed` назначение снова разрешено).
- Риск timezone-сдвигов:
  - Мера: тесты на сутки до/после полуночи и на DST.

---

## Definition of Done

- Пустые этапы без контента не отображаются пациенту.
- Нельзя назначить вторую активную программу одному пациенту.
- Врач редактирует `title/description/schedule` группы инстанса через UI.
- Чек-лист «сегодня» использует локальные сутки пациента по IANA (+ fallback).
- Логи инициативы и backlog синхронизированы.
- Перед push: `pnpm install --frozen-lockfile && pnpm run ci`.

---

## Аудит реализации (2026-05-03)

### Вердикт

- Статус: **PASS**
- Blocker/Critical/Major: **не обнаружено**
- Все пункты `todos` в этом плане подтверждены кодом и целевыми проверками.

### Проверка по пунктам плана

1. **§1 hide-empty-stage — PASS**
   - Есть helper `patientStageSectionShouldRender(...)` в `stage-semantics.ts`.
   - Есть фильтрация `stageZeroStages`/`otherStages` в `PatientTreatmentProgramDetailClient.tsx` до рендера секций.
   - Покрыто кейсами в `stage-semantics.test.ts` (visible/empty/locked/ignore lock/A1 header).

2. **§2 single-active-guard — PASS**
   - В `assignTemplateToPatient(...)` добавлен guard через `listInstancesForPatient(...)` + доменная ошибка `SECOND_ACTIVE_TREATMENT_PROGRAM_MESSAGE`.
   - Doctor POST route возвращает **409** при этом доменном кейсе.
   - Негативный и позитивный сценарии подтверждены в `instance-service.test.ts`.

3. **§3 instance-group-edit-ui — PASS**
   - В `TreatmentProgramInstanceDetailClient.tsx` есть кнопка **«Изменить»** для группы.
   - Реализован `Dialog` с полями `title`, `description`, `scheduleText`.
   - Сохранение идёт через `PATCH /api/doctor/treatment-program-instances/[instanceId]/stage-groups/[groupId]`, после успеха вызывается `onSaved()`.
   - Endpoint PATCH подтверждён в `.../stage-groups/[groupId]/route.ts`.

4. **§4 checklist-timezone — PASS**
   - Добавлена колонка `platform_users.calendar_timezone` (миграция `0032_platform_users_calendar_timezone.sql`, схема `platformUsers.calendarTimezone`).
   - В `patient-program-actions.ts` окно суток переведено на `localDayWindowIso(...)` с IANA + fallback через `resolveCalendarDayIanaForPatient(...)` к `app_display_timezone`.
   - API профиля пациента `GET/PATCH /api/patient/profile/calendar-timezone` реализован.
   - Тесты `patient-program-actions.test.ts` покрывают окно локальных суток и применение персональной TZ.

5. **§5 docs-log — PASS**
   - Обновлены [`BACKLOG_PRODUCT_AFTER_AUDITS.md`](./BACKLOG_PRODUCT_AFTER_AUDITS.md).
   - В [`LOG.md`](./LOG.md) есть отдельная запись по post-audits batch (2026-05-03) с перечислением изменений и проверок.

### Выполненные проверки (в рамках аудита)

```bash
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/stage-semantics.test.ts src/modules/treatment-program/instance-service.test.ts src/modules/treatment-program/patient-program-actions.test.ts
pnpm --dir apps/webapp exec eslint "src/modules/treatment-program/stage-semantics.ts" "src/modules/treatment-program/stage-semantics.test.ts" "src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx" "src/modules/treatment-program/instance-service.ts" "src/modules/treatment-program/instance-service.test.ts" "src/app/api/doctor/clients/[userId]/treatment-program-instances/route.ts" "src/app/app/doctor/clients/treatment-programs/[instanceId]/TreatmentProgramInstanceDetailClient.tsx" "src/app/api/doctor/treatment-program-instances/[instanceId]/stage-groups/[groupId]/route.ts" "src/modules/treatment-program/patient-program-actions.ts" "src/modules/treatment-program/patient-program-actions.test.ts" "src/app/api/patient/profile/calendar-timezone/route.ts" "src/infra/repos/pgPatientCalendarTimezone.ts"
pnpm --dir apps/webapp exec tsc --noEmit
```

Результат: все команды завершились успешно.
