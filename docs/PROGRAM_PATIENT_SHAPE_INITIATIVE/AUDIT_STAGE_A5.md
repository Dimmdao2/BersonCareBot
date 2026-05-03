# AUDIT — Stage A5 (PROGRAM_PATIENT_SHAPE)

**Дата:** 2026-05-03  
**Scope:** Stage A5 — колонки `created_at` / `last_viewed_at` у пунктов плана, backfill, `patient_plan_last_opened_at`, идемпотентный mark-viewed, бейджи **«Новое»** / **«План обновлён»**, `revalidatePath` после мутаций.  
**Источники:** [`STAGE_A5_PLAN.md`](STAGE_A5_PLAN.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md) (§1.6–1.7, A5).

---

## 1. Verdict

- **Status:** **PASS** по пяти проверкам запроса (§2–§6), с **Info** по продуктовым ограничениям Today (одна «главная» активная программа) и по **строгому** сравнению timestamp события и baseline (§3). **POST-AUDIT FIX (§1b):** закрыты **Major** по `plan-opened` и типу `max(created_at)`; **Info** остаётся с обоснованным defer.
- **Summary:** Миграция backfill выставляет `last_viewed_at = created_at` для всех существующих строк до появления UI; копия дерева при назначении выставляет `last_viewed_at` вместе с `created_at`; врачебное добавление и `replaceInstanceStageItem` — `last_viewed_at: null`. Mark-viewed: владелец экземпляра, элемент в дереве пациента, `status === "active"`, SQL `WHERE last_viewed_at IS NULL`. Disabled: RSC обрезает read model + семантика бейджа + ранний выход сервиса. «План обновлён»: `max(created_at)` по whitelist типов событий vs `patient_plan_last_opened_at ?? instance.created_at`; сброс через `touchPatientPlanLastOpenedAt` при открытии экрана программы.

---

## 1b. Post-FIX / backlog (кратко)

| ID | Уровень | Статус после FIX | Комментарий |
|---|---|---|---|
| **A5-TODAY-INSTANCE-01** | Info | **Defer (product)** | Today по-прежнему считает бейдж только для **одной** активной программы (max `updatedAt`); отдельный UX для нескольких активных — вне scope POST-FIX. |
| **A5-PLAN-OPENED-SILENT-01** | Major → | **Fixed** | `patientRecordPlanOpened`: предварительный **`getInstanceForPatient`** — при отсутствии экземпляра **`throw`** → API **404**; для **`status !== "active"`** — **`{ ok: true, recorded: false }`** без записи в БД; клиент не вызывает **`POST plan-opened`** для неактивной программы. **`revalidatePath`** только при **`recorded: true`**. |
| **A5-TS-EQUALITY-01** | Info | **Defer (documented)** | Семантика «строго после» baseline без изменений; осознанное продуктовое поведение. |
| **A5-PG-MAX-TYPE-01** | Major → | **Fixed** | `coerceMaxPlanMutationCreatedAtToIso` — поддержка **`Date`** и trim строки; unit-тест `pgTreatmentProgramEvents.coerce.test.ts`. |

---

## 2. Backfill и отсутствие ложного «Новое» у старых items

| Критерий | Статус | Доказательство |
|---|---|---|
| SQL backfill `last_viewed_at = created_at` | **PASS** | `apps/webapp/db/drizzle-migrations/0031_treatment_program_a5_last_viewed.sql` — `UPDATE ... SET last_viewed_at = created_at WHERE last_viewed_at IS NULL` после появления колонки. |
| Появление `created_at` у старых строк | **PASS** | Тот же файл — backfill `created_at` из `treatment_program_instances.created_at`, затем `NOT NULL` + default `now()`. |
| Начальное копирование дерева (не «все новые») | **PASS** | `pgTreatmentProgramInstance.ts` `createInstanceTree` — для каждого пункта из шаблона `createdAt` и **`lastViewedAt`** = `treeItemTs` (одна метка времени). |
| Врач добавил пункт после назначения | **PASS** | `addInstanceStageItem` — `lastViewedAt: null` (ожидаемо «Новое» до просмотра). |
| Замена пункта | **PASS** | `replaceInstanceStageItem` — `lastViewedAt: null`, новый `createdAt`. |

---

## 3. Mark-viewed: идемпотентность и доступ

| Критерий | Статус | Доказательство |
|---|---|---|
| Идемпотентность (повторные POST) | **PASS** | `pgTreatmentProgramInstance.ts` `markStageItemViewedIfNever` — ранний выход при `lastViewedAt != null`; `UPDATE ... WHERE id = ? AND last_viewed_at IS NULL` + `returning`; in-memory зеркало (`inMemoryTreatmentProgramInstance.ts`). |
| Владелец экземпляра | **PASS** | Тот же метод — `instRow` с `eq(instTable.patientUserId, patientUserId)`; связь `stage` → `instanceId`. |
| Элемент принадлежит экземпляру | **PASS** | Проверка `stRow.instanceId === instanceId`. |
| Слой сервиса: нет «левого» id | **PASS** | `instance-service.ts` `patientMarkStageItemViewedIfNever` — `getInstanceForPatient`; поиск `stageItemId` в `d.stages.flatMap(...items)`; иначе **`throw`** «Элемент не найден» / «Программа не найдена» → route **400/404**. |
| Не-`active` пункт (в т.ч. `disabled`) | **PASS** | Перед PG: `if (hit.status !== "active") return { updated: false }` — без изменения БД. |
| API patient | **PASS** | `mark-viewed/route.ts` — `requirePatientApiBusinessAccess`, UUID Zod, `gate.session.user.userId`. |

**Info:** `getInstanceForPatient` в PG **возвращает** и `disabled` строки; для mark-viewed это не дыра в доступе благодаря проверке **`status === "active"`** в сервисе. Пациентский UI по-прежнему получает дерево после **`omitDisabledInstanceStageItemsForPatientApi`** (`[instanceId]/page.tsx`).

---

## 4. «План обновлён»: показ и сброс

| Критерий | Статус | Доказательство |
|---|---|---|
| Источник «последнего изменения» | **PASS** | `TREATMENT_PROGRAM_PLAN_MUTATION_EVENT_TYPES` в `types.ts`; `pgTreatmentProgramEvents.ts` `getMaxPlanMutationEventCreatedAt` — `max(created_at)` с фильтром по этим типам. |
| Baseline без открытия плана | **PASS** | `instance-service.ts` `patientPlanUpdatedBadgeForInstance` — `baseline = inst.patientPlanLastOpenedAt ?? inst.createdAt`. |
| Условие показа | **PASS** | `if (maxAt <= baseline) return { show: false }` — бейдж только если событие **строго позже** baseline. |
| Только активный экземпляр в логике бейджа | **PASS** | `sums.find((s) => s.id === input.instanceId && s.status === "active")` — для завершённой программы бейдж не считается. |
| Сброс при открытии плана | **PASS** | `touchPatientPlanLastOpenedAt` обновляет `patient_plan_last_opened_at`; клиент **`PatientTreatmentProgramDetailClient`** — `useEffect` с `POST .../plan-opened` при `detail.id`; `plan-opened/route.ts` вызывает сервис + `revalidatePatientTreatmentProgramUi`. |
| Отображение Today | **PASS** | `PatientHomeToday.tsx` — `patientPlanUpdatedBadgeForInstance`, строка **`План обновлён`** + дата через `formatBookingDateLongRu`; проп в `PatientHomePlanCard` (`planUpdatedLabel`). |

**Info:** см. §1b **A5-TODAY-INSTANCE-01**, **A5-TS-EQUALITY-01**, **A5-PG-MAX-TYPE-01**.

---

## 5. Disabled: бейдж «Новое»

| Критерий | Статус | Доказательство |
|---|---|---|
| Семантика | **PASS** | `stage-semantics.ts` `patientStageItemShowsNewBadge` — `!isInstanceStageItemActiveForPatient(item)` → `false` при `status === "disabled"`. |
| Тест | **PASS** | `stage-semantics.test.ts` — «hides for disabled». |
| Read model страницы программы | **PASS** | `[instanceId]/page.tsx` — `omitDisabledInstanceStageItemsForPatientApi(rawDetail)` перед клиентом; disabled **не попадают** в список для бейджа/IntersectionObserver. |
| Mark-viewed для disabled UUID | **PASS** | Сервис возвращает `{ updated: false }` при `status !== "active"` (см. §3). |

---

## 6. Регрессия patient Today / страницы программ

| Критерий | Статус | Доказательство |
|---|---|---|
| Today: данные блоков | **PASS** | Дополнительные поля в `Promise.all` только при `personalTierOk && session`; остальная сборка home без изменения контрактов блоков. |
| Карточка плана | **PASS** | `PatientHomePlanCard` — опциональная подстрока `planUpdatedLabel`; без неё визуал прежний. |
| Список программ | **PASS** | `treatment-programs/page.tsx` — без изменений контракта списка (только revalidate того же пути при мутациях). |
| Деталь программы | **PASS** | `PatientTreatmentProgramDetailClient` — добавлены эффекты plan-opened / mark-viewed и бейдж; существующие секции A4 и прогресс не удалены. |
| Тесты контракта UI | **PASS** | `PatientTreatmentProgramDetailClient.test.tsx` мокает `plan-opened` / `mark-viewed`; прогон вместе с `treatment-program-a5-badges.test.ts` (см. `LOG.md` A5). |

**POST-AUDIT:** `POST plan-opened` вызывается только при **`detail.status === "active"`** (`PatientTreatmentProgramDetailClient`); для завершённой программы запрос не уходит, метка в БД не обновляется.

---

## 7. MANDATORY FIX INSTRUCTIONS

Любой **FIX** по замечаниям A5, регрессиям бейджей или mark-viewed — выполнять **только** с соблюдением правил ниже.

### 7.1 Схема и миграции

1. **Не** удалять и **не** переписывать смысл backfill `0031_treatment_program_a5_last_viewed.sql` задним числом на проде; новые правила — только новой миграцией и с явным продуктовым обоснованием.
2. Новые поля инстанса/пунктов — только через Drizzle schema + `drizzle-kit` миграции; не оставлять «только SQL» без `db/schema/*.ts`.
3. Сохранять совместимость in-memory репозитория с PG для тестов и локальной разработки (**паритет** `lastViewedAt` / `patientPlanLastOpenedAt` / `getMaxPlanMutationEventCreatedAt`).

### 7.2 Backfill и «Новое»

4. Любой новый путь создания **видимого** пациенту пункта должен явно задать **`last_viewed_at`**: как у копии шаблона (= `created_at`/общий ts дерева), либо `null` если пункт должен считаться «непросмотренным» до первого открытия.
5. **Запрещено** массово сбрасывать `last_viewed_at` в `NULL` для старых строк без миграции и без согласованного продукта — иначе снова появится шум «Новое».

### 7.3 Mark-viewed и доступ

6. Mark-viewed **только** через связку **route → `buildAppDeps` → `createTreatmentProgramInstanceService`**; не вызывать `markStageItemViewedIfNever` напрямую из UI/других модулей.
7. Сохранять все проверки: UUID, `requirePatientApiBusinessAccess`, владелец экземпляра, элемент в дереве **`getInstanceForPatient`**, **`status === "active"`**, SQL-идемпотентность `last_viewed_at IS NULL`.
8. При расширении статусов пунктов — явно определить, какие статусы считаются «как active» для mark-viewed; по умолчанию только **`active`**.

### 7.4 «План обновлён» и события

9. Новые типы событий, влияющие на смысл «план изменился», добавлять **только** в **`TREATMENT_PROGRAM_PLAN_MUTATION_EVENT_TYPES`** в `types.ts` и убедиться, что PG `getMaxPlanMutationEventCreatedAt` и in-memory фильтр используют тот же whitelist.
10. Не смешивать в этот whitelist события прогресса пациента (тесты, завершение этапа), если продукт не требует их в Today-бейдже.
11. При изменении сравнения baseline документировать в **`LOG.md`** и в **`STAGE_A5_PLAN.md`**, если меняется семантика «строго после» vs «не раньше».
12. После правок `getMaxPlanMutationEventCreatedAt` — smoke на **реальной** БД или интеграционный тест: результат `max()` должен попадать в ветку **`typeof v === "string"`**; иначе исправить маппинг (см. §1b **A5-PG-MAX-TYPE-01**).

### 7.5 Disabled и read model пациента

13. Любой новый patient UI / API для элементов плана обязан опираться на **`omitDisabledInstanceStageItemsForPatientApi`** там, где зафиксирован A2 read model, либо дублировать те же исключения осознанно с тестом.
14. **`patientStageItemShowsNewBadge`** — единая точка правды для «Новое» на item; не дублировать условия в JSX без синхронизации с семантикой этапа (`contentBlocked`).

### 7.6 Кэш и API-документация

15. Любая новая мутация плана/просмотра, влияющая на Today или список программ, должна вызывать **`revalidatePatientTreatmentProgramUi()`** (или согласованный преемник), если данные берутся из RSC-кэша Next по тем же путям.
16. Новые поля ответа patient `GET` / новые маршруты — обновить **`apps/webapp/src/app/api/api.md`**.

### 7.7 Типичная зона файлов для FIX A5

17. `apps/webapp/db/schema/treatmentProgramInstances.ts`, `apps/webapp/db/drizzle-migrations/**`, `apps/webapp/src/modules/treatment-program/instance-service.ts`, `types.ts`, `ports.ts`, `stage-semantics.ts`, `pgTreatmentProgramInstance.ts`, `inMemoryTreatmentProgramInstance.ts`, `pgTreatmentProgramEvents.ts`, `apps/webapp/src/app/api/patient/treatment-program-instances/**`, `apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx`, `PatientHomePlanCard.tsx`, `apps/webapp/src/app/app/patient/treatment-programs/**`, `apps/webapp/src/app-layer/cache/revalidatePatientTreatmentProgramUi.ts`, врачебные route с `revalidatePatientTreatmentProgramUi`, тесты `treatment-program-a5-badges.test.ts`, `stage-semantics.test.ts`, `PatientTreatmentProgramDetailClient.test.tsx`.

---

## 8. Повторяемые проверки (smoke)

```bash
rg "last_viewed_at|lastViewedAt|patient_plan_last_opened_at|patientPlanLastOpenedAt|patientPlanUpdatedBadgeForInstance|markStageItemViewedIfNever|plan-opened|mark-viewed|revalidatePatientTreatmentProgramUi|patientStageItemShowsNewBadge" apps/webapp/src apps/webapp/db
pnpm --dir apps/webapp exec vitest run src/modules/treatment-program/treatment-program-a5-badges.test.ts src/modules/treatment-program/stage-semantics.test.ts src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx src/infra/repos/pgTreatmentProgramEvents.coerce.test.ts
pnpm --dir apps/webapp exec tsc --noEmit
```

После изменений в PG-слое событий рекомендуется однократно проверить на стенде наличие non-null строки из `getMaxPlanMutationEventCreatedAt` для экземпляра с известным событием плана (см. §1b **A5-PG-MAX-TYPE-01**).
