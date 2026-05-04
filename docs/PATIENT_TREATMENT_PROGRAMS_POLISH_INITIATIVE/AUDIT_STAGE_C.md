# AUDIT — Stage C (`1.1` список `/treatment-programs`)

**Дата аудита:** 2026-05-04  
**Дата FIX по аудиту:** 2026-05-04  
**Канон этапа:** [`STAGE_C.md`](STAGE_C.md) · дорожная карта: [`../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §3 п. **1.1** · журнал: [`LOG.md`](LOG.md).

---

## FIX closure — Critical / Major / Minor / INFO

| Уровень | Статус | Что сделано |
|---------|--------|-------------|
| **Critical** | **CLOSED** | На аудите **0** finding’ов. Сценарии MANDATORY §Critical (hero без активной; расхождение семантики этапа; «План обновлён» не через сервис) — **не воспроизведены**; верификация [`page.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/page.tsx) + [`PatientTreatmentProgramsListClient.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.tsx). |
| **Major** | **CLOSED** | На аудите **0** finding’ов. Сценарии MANDATORY §Major (архив не в `<details>` / с `open`; empty state; проценты) — **не воспроизведены**; тест архива в [`PatientTreatmentProgramsListClient.test.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.test.tsx). |
| **Minor** | **CLOSED (верификация)** | В исходном аудите **0** finding’ов. Пункты MANDATORY §Minor (CTA `instanceId`, ссылка на сообщения, тесты списка): **закрыты подтверждением** кода и vitest — см. [`LOG.md`](LOG.md) post-FIX. |
| **INFO-1** | **CLOSED** | Расхождение «Завершенные» vs «Завершённые» в чек-листе [`STAGE_C.md`](STAGE_C.md) — **исправлено** в рамках FIX (формулировка приведена к ROADMAP §1.1 и UI). |

---

## Сводка

| Область | Вердикт |
|---------|---------|
| Соответствие `STAGE_C.md` + ROADMAP §1.1 DoD | **PASS** |
| Hero активной программы (этап + CTA + «План обновлён») | **PASS** |
| Архив завершённых под `<details>`, по умолчанию закрыт | **PASS** |
| Empty state при отсутствии активной программы | **PASS** |
| Нет процентной аналитики на списке | **PASS** |

**Finding’и (первичный аудит):** Critical **0**, Major **0**, Minor **0**. INFO **1** — закрыт в FIX (см. таблицу **FIX closure** и §5). **Post-FIX:** Critical / Major / Minor / INFO — **CLOSED** в той же таблице.

---

## 1) Список vs `STAGE_C.md` и ROADMAP_2 §1.1

### 1.1 Hero активной программы (STAGE_C §1, ROADMAP «Hero текущей активной программы»)

| Критерий | Статус | Доказательство |
|----------|--------|----------------|
| Loader: активный instance + текущий этап (логический `current_stage_title`) | **PASS** | [`page.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/page.tsx): `listForPatient` → фильтр `status === "active"`, сортировка по `updatedAt`/`id`, первая запись; затем `getInstanceForPatient` + `patientProgramsListCurrentStageTitle(detail)` — ~38–57. Заголовок этапа выводится из той же семантики, что detail (pipeline без этапа 0): [`PatientTreatmentProgramsListClient.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.tsx) `patientProgramsListCurrentStageTitle` ~22–28. |
| Hero: название программы, текущий этап, CTA в detail | **PASS** | Компонент: `hero.title`, строка «Текущий этап: …», `Link` с `routePaths.patientTreatmentProgram(hero.instanceId)` и подписью «Открыть программу» — list client ~47–77. |
| Бейдж «План обновлён» при сигнале | **PASS** | RSC: `patientPlanUpdatedBadgeForInstance` + `formatBookingDateLongRu` / fallback «План обновлён» — [`page.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/page.tsx) ~62–71; UI при непустом `planUpdatedLabel` с `role="status"` — list client ~61–64. Согласовано с каноном Today/detail (тот же сервис + формат даты). |
| CTA ведёт на `/app/patient/treatment-programs/[instanceId]` | **PASS** | `routePaths.patientTreatmentProgram` — [`paths.ts`](../../apps/webapp/src/app-layer/routes/paths.ts). |

### 1.2 Архив и empty state (STAGE_C §2, ROADMAP)

| Критерий | Статус | Доказательство |
|----------|--------|----------------|
| Завершённые программы в `<details>` | **PASS** | `archived` = `status === "completed"` — [`page.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/page.tsx) ~45–47; рендер `<details>…<summary>Завершённые программы` — list client ~98–121. |
| Архив скрыт по умолчанию | **PASS** | У элемента `<details>` **нет** атрибута `open` — list client ~99. Тест: `details.open === false` — [`PatientTreatmentProgramsListClient.test.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.test.tsx). |
| Нет активной программы: пояснение + ссылка на сообщения | **PASS** | Ветка `hero === null`: текст «Здесь появится программа после назначения врачом.» (соответствует ROADMAP §1.1) + `Link` на `messagesHref` (`routePaths.patientMessages` из page) — list client ~79–94; передача пропа — [`page.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/page.tsx) ~86. |

### 1.3 UI-инварианты (STAGE_C §3, ROADMAP «Что НЕ делать» / DoD)

| Критерий | Статус | Доказательство |
|----------|--------|----------------|
| Нет процентов прогресса на странице списка | **PASS** | `rg` по `%` / ключевым фразам в каталоге `treatment-programs` — совпадений для процентной аналитики нет (аудит); ROADMAP запрещает `daily checklist`, `% этапа`, `% программы` — не встречаются в list-файлах. |
| `patientVisual` / примитивы; без home-only геометрии | **PASS** | Импорты: `patientCardClass`, `patientCardCompactClass`, `patientSurfaceInfoClass`, `patientMutedTextClass`, `patientPrimaryActionClass`, `patientInlineLinkClass` — list client ~13–20; импортов из `app/patient/home/*` нет — `rg patientHome` по `treatment-programs` — пусто. |

---

## 2) Проверки из запроса аудита (явный чек-лист)

### 2.1 Список ↔ `STAGE_C.md` + ROADMAP §1.1

**PASS** — таблица §1 отражает цель и DoD ROADMAP **1.1** (hero, архив в `<details>`, empty state, без процентов, стили).

### 2.2 Hero: stage title + CTA + plan updated

**PASS** — см. §1.1; при ошибке `getInstanceForPatient` этап показывается как «—» (`currentStageTitle` остаётся `null`) — [`page.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/page.tsx) ~51–59.

### 2.3 Архив завершённых под `<details>`

**PASS** — см. §1.2.

### 2.4 Empty state при отсутствии активной программы

**PASS** — при `activeSummary == null` (в т.ч. только завершённые программы): hero не рендерится, показывается блок empty + при наличии `archived` ниже раскрываемый архив — list client ~45–122.

### 2.5 Нет процентной аналитики

**PASS** — см. §1.3.

---

## 3) Целевые команды (`STAGE_C.md`)

Зафиксировано в [`LOG.md`](LOG.md) (этап C): `rg`, `pnpm --dir apps/webapp lint …`, `tsc --noEmit`, `vitest run src/app/app/patient/treatment-programs` — **PASS** на момент записи в журнале.

Повторный аудит рекомендует прогнать:

```bash
rg "Завершённые программы|Завершенные программы|План обновлён|% этапа|% программы|% за день" apps/webapp/src/app/app/patient/treatment-programs
pnpm --dir apps/webapp lint --max-warnings=0 -- src/app/app/patient/treatment-programs
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs
```

---

## 4) Исторический блок «FIX closure» (до post-FIX)

Ранее: «не требуется при нуле finding’ов». После процедуры FIX см. таблицу **«FIX closure — Critical / Major / Minor / INFO»** в начале файла.

---

## 5) Наблюдения (INFO) — post-FIX

**INFO-1 (закрыт).** Чек-лист [`STAGE_C.md`](STAGE_C.md) п.2 синхронизирован с [`ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §1.1 и UI: формулировка «**Завершённые** программы».

---

## 6) Finding’и по серьёзности

| Уровень | Кол-во | Комментарий |
|---------|--------|-------------|
| Critical | 0 | — |
| Major | 0 | — |
| Minor | 0 | — |
| INFO | 0 | INFO-1 закрыт в FIX (§5) |

---

## MANDATORY FIX INSTRUCTIONS

Инструкции на случай **регресса** или повторного аудита с отрицательным результатом. Правки — в scope [`STAGE_C.md`](STAGE_C.md): [`page.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/page.tsx), [`PatientTreatmentProgramsListClient.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.tsx), тесты в той же папке; без изменения UX detail **B** без отдельного решения.

### Critical (блокер 1.1 / вводит в заблуждение)

1. **Пропал hero при наличии активной программы.**  
   - Восстановить выбор активной строки: `list.filter(status === "active")`, сортировка как на главной (`updatedAt` desc), первая запись.  
   - Не полагаться только на «первая строка списка» без фильтра по `status`.

2. **`current_stage_title` расходится с тем, что видит пациент на detail (другая семантика «текущего этапа»).**  
   - Сохранить единый расчёт: `patientProgramsListCurrentStageTitle` = `omitDisabled` + `splitPatientProgramStagesForDetailUi` + `selectCurrentWorkingStageForPatientDetail` по `TreatmentProgramInstanceDetail` — [`PatientTreatmentProgramsListClient.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.tsx). Не подставлять «первый этап в массиве» или этап 0 без split.

3. **«План обновлён» привязан не к тому же сигналу, что Today/detail.**  
   - Использовать только `patientPlanUpdatedBadgeForInstance` + `formatBookingDateLongRu` в RSC ([`page.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/page.tsx)); не смешивать с прогрессом/процентами.

### Major (нарушение STAGE_C / ROADMAP)

1. **Архив завершённых не в `<details>` или открыт по умолчанию.**  
   - Завершённые (`status === "completed"`) только внутри `<details>` **без** `open`. Не дублировать полный список завершённых в hero.

2. **Empty state не показывается при отсутствии активной программы.**  
   - Ветка `hero === null`: текст ROADMAP («Здесь появится программа после назначения врачом») + ссылка на `routePaths.patientMessages` (или эквивалентный канонический путь из [`paths.ts`](../../apps/webapp/src/app-layer/routes/paths.ts)).

3. **Появилась процентная «аналитика прогресса» на списке.**  
   - Удалить `%`, «% этапа», «% программы», `daily checklist` как метрику прогресса; прогнать `rg` из [`STAGE_C.md`](STAGE_C.md).

### Minor (качество / согласованность)

1. **CTA не ведёт на detail выбранного активного экземпляра.**  
   - Проверить `routePaths.patientTreatmentProgram(hero.instanceId)` и соответствие `instanceId` выбранной активной строки.

2. **Ссылка из empty state ведёт не на чат/сообщения пациента.**  
   - Синхронизировать с `routePaths.patientMessages`.

3. **Регресс тестов списка.**  
   - Держать [`PatientTreatmentProgramsListClient.test.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramsListClient.test.tsx): empty state, hero с nudge, архив в закрытом `details`, семантика `patientProgramsListCurrentStageTitle` (этап 0 не текущий).

### После любого FIX по этому списку

- Обновить [`LOG.md`](LOG.md).  
- Прогнать команды из §3; перед push — барьер из [`.cursor/rules/pre-push-ci.mdc`](../../.cursor/rules/pre-push-ci.mdc).
