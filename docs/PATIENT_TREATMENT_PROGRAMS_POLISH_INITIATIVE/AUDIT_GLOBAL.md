# GLOBAL AUDIT — PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE

**Дата:** 2026-05-04  
**Объект:** мини-инициатива после закрытия этапов **A / B / C** (пункты ROADMAP_2 §3: **1.0**, **1.1a**, **1.1**).  
**Канон порядка:** [`STAGE_PLAN.md`](STAGE_PLAN.md) · журнал: [`LOG.md`](LOG.md) · этаповые аудиты: [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md), [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md), [`AUDIT_STAGE_C.md`](AUDIT_STAGE_C.md).

---

## 0) Методология (как проводился аудит)

1. **Сначала** — анализ артефактов: `LOG.md`, `STAGE_*.md`, `STAGE_PLAN.md`, `README.md`, три `AUDIT_STAGE_*.md`, фрагменты [`ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §0 и §3, запись в [`../APP_RESTRUCTURE_INITIATIVE/LOG.md`](../APP_RESTRUCTURE_INITIATIVE/LOG.md).  
2. **Точечная сверка кода** — только статические сигналы в scope инициативы (`rg` по `%`/запрещённым формулировкам в `apps/webapp/src/app/app/patient/treatment-programs`), без трактовки как «зелёный CI».  
3. **Корневой `pnpm run ci` в этом документе не запускался и не является основанием вердикта** (по условию запроса: не начинать с тестов/CI). Барьер перед push остаётся обязательным по [`.cursor/rules/pre-push-ci.mdc`](../../.cursor/rules/pre-push-ci.mdc).

---

## 1) Дифф, scope и уже выполненные проверки

### 1.1 Что считается телом работ (код + миграции)

По [`LOG.md`](LOG.md) и этаповым аудитам зафиксированы изменения в:

| Область | Этап | Назначение |
|---------|------|------------|
| `apps/webapp/db/schema/treatmentProgramInstances.ts`, миграция `0043_*`, `pg`/`inMemory` repos, `progress-service` тесты, контрактный тест `pgTreatmentProgramInstance.startedAt.contract.test.ts` | **A** | колонка `started_at`, backfill, запись при первом `in_progress` |
| `stage-semantics.ts`, `[instanceId]/page.tsx`, `PatientTreatmentProgramDetailClient.tsx`, vitest detail + semantics | **B** | MVP detail: этап 0, текущий этап, архив, дата контроля, «План обновлён», без чек-листа секцией |
| `treatment-programs/page.tsx`, `PatientTreatmentProgramsListClient.tsx` + тесты списка | **C** | hero, empty, архив, согласование `current_stage_title` с detail |

История ветки `feature/app-restructure-initiative` содержит смежные коммиты по treatment program; **точный `git diff` до merge-base с `main` в этом аудите не использовался как единственный источник правды** — первичная правда по закрытию этапов: **журнал + AUDIT_STAGE_***.

### 1.2 Уже выполненные проверки (зафиксированные, не перезапускались здесь)

| Источник | Что зафиксировано |
|----------|-------------------|
| [`LOG.md`](LOG.md) §этап A | `rg started_at/startedAt`, `tsc`, vitest progress + contract |
| [`LOG.md`](LOG.md) §AUDIT_STAGE_A FIX | повтор целевых команд A |
| [`LOG.md`](LOG.md) §этап B | `rg`, lint path `src/app/.../treatment-programs`, `tsc`, vitest detail + `stage-semantics` |
| [`LOG.md`](LOG.md) §AUDIT_STAGE_B FIX | то же + отдельный прогон `TestSetForm.test.tsx` |
| [`LOG.md`](LOG.md) §этап C + AUDIT_STAGE_C FIX | `rg`, lint, `tsc`, vitest `patient/treatment-programs` |
| [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md) §5 | таблица команд **PASS** |
| [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md) §3 | узкие команды **PASS** на момент записи |
| [`AUDIT_STAGE_C.md`](AUDIT_STAGE_C.md) §3 | узкие команды **PASS** на момент записи |

### 1.3 Stage-audits (сводка вердиктов)

| Файл | Critical | Major | Minor | INFO / defer |
|------|----------|-------|-------|----------------|
| [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md) | CLOSED | CLOSED | CLOSED + live PG **DEFER** | — |
| [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md) | CLOSED | CLOSED | CLOSED | **INFO-1 DEFER** (`/checklist-today` для `doneItemIds` без UI-секции) |
| [`AUDIT_STAGE_C.md`](AUDIT_STAGE_C.md) | CLOSED | CLOSED | CLOSED | INFO-1 **CLOSED** (ё в «Завершённые программы») |

---

## 2) Цикл EXEC → AUDIT → FIX по этапам

| Этап | EXEC (реализация + проверки в `LOG`) | AUDIT (артефакт) | FIX (артефакт + запись в `LOG`) |
|------|--------------------------------------|------------------|--------------------------------|
| **A** | [`LOG.md`](LOG.md) «2026-05-04 — этап A» | [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md) | «AUDIT_STAGE_A FIX» |
| **B** | [`LOG.md`](LOG.md) «2026-05-04 — этап B» | [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md) | «AUDIT_STAGE_B FIX» |
| **C** | [`LOG.md`](LOG.md) «2026-05-04 — этап C» | [`AUDIT_STAGE_C.md`](AUDIT_STAGE_C.md) | «AUDIT_STAGE_C FIX» |

**Вердикт:** по документированной процедуре для каждого из **A / B / C** есть **реализация**, отдельный **аудит-файл** с таблицей **FIX closure** (или эквивалентом) и **пост-аудитная** секция в [`LOG.md`](LOG.md). Цикл **EXEC → AUDIT → FIX** считается **пройденным**.

---

## 3) Порядок A → B → C

По [`LOG.md`](LOG.md):

- Этап **B** явно опирается на закрытие **A** (предпосылка + `started_at` в данных).
- Этап **C** явно опирается на закрытие **B**.

**Вердикт:** порядок **A → B → C** в исполнении **соблюдён** (нет признаков старта UI списка до data-enabler или старта detail до A).

---

## 4) MVP-инварианты (этап 0 отдельно, без %, контроль от `started_at`, «План обновлён»)

| Инвариант | Где подтверждено | Вердикт |
|-----------|------------------|---------|
| Этап **0** отдельно от «текущего» рабочего (не в одном pipeline с текущим) | [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md) §1.1–1.2; [`AUDIT_STAGE_C.md`](AUDIT_STAGE_C.md) §1.1 (заголовок списка без этапа 0 в pipeline) | **PASS** (по этаповым аудитам) |
| Нет процентной аналитики (`% этапа`, `% программы`, `% за день`, daily checklist как прогресс) в patient `treatment-programs` | `rg` по каталогу (совпадений по запрещённым ключам **нет**); [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md) §1.4; [`AUDIT_STAGE_C.md`](AUDIT_STAGE_C.md) §1.3 | **PASS** (статическая проверка в рамках global audit) |
| Дата ожидаемого контроля от **`started_at` этапа** + `expected_duration_days`, иначе `null` | [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md) §1.3; реализация `expectedStageControlDateIso` | **PASS** |
| «**План обновлён**» — сигнал изменений (тот же сервис, что Today/detail), не метрика прогресса | [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md) §1.1; [`AUDIT_STAGE_C.md`](AUDIT_STAGE_C.md) §1.1 | **PASS** |

---

## 5) Scope инициативы

**В scope (ожидаемо):** пути из [`STAGE_A.md`](STAGE_A.md), [`STAGE_B.md`](STAGE_B.md), [`STAGE_C.md`](STAGE_C.md) — согласованы с записями [`LOG.md`](LOG.md).

**Выход за scope (зафиксировано в журнале, требует учёта):**

- Правка [`apps/webapp/src/app/app/doctor/test-sets/TestSetForm.test.tsx`](../../apps/webapp/src/app/app/doctor/test-sets/TestSetForm.test.tsx) под **`pnpm tsc`** (см. [`LOG.md`](LOG.md) §AUDIT_STAGE_B FIX — «к этапу B не относится»)).

**Вердикт:** основной продуктовый scope **соблюдён**; указанная правка — **единичное расширение** за пределы файлов этапа B (см. MANDATORY **Minor** ниже).

---

## 6) Синхронизация `LOG.md` и прочих docs

> **Архив (снимок на момент первичного global audit, до `GLOBAL FIX` в документах):** таблица ниже сохранена **как исторический контекст** выявленных расхождений. **Текущее состояние** по док-синхронизации — см. [`LOG.md`](LOG.md) (секции **GLOBAL FIX**) и **§10**; по коду nudge после мини-аудита — **§11**.

| Проверка | Статус (исторический снимок) | Комментарий |
|----------|--------|-------------|
| [`LOG.md`](LOG.md) отражает read-rules, scope, checks, audit-FIX по A/B/C | **PASS** | |
| [`STAGE_A.md`](STAGE_A.md), [`STAGE_B.md`](STAGE_B.md), [`STAGE_C.md`](STAGE_C.md) — чекбоксы `[ ]` vs фактическое закрытие | **FAIL** | Все пункты остаются **неотмеченными**, хотя журнал и AUDIT декларируют закрытие — вводит в заблуждение при следующем проходе. |
| [`README.md`](README.md) строка **«Статус: в работе»** vs закрытие A/B/C | **FAIL** | Нужно обновить статус и при необходимости ссылку на этот `AUDIT_GLOBAL.md`. |
| [`STAGE_PLAN.md`](STAGE_PLAN.md) DoD п. **3** — отметки в [`ROADMAP_2.md`](../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) о выполнении **1.0 / 1.1 / 1.1a** | **FAIL / PENDING** | В §**0** «Что считаем закрытым» **нет** строки о закрытии блока 1.0+1.1+1.1a; сводная таблица §2 не содержит колонки «done». Текст DoD допускает отметку **после фактического merge** — если merge уже выполнен, это **долг синхронизации**; если нет — закрыть в том же PR, что merge. |
| [`STAGE_PLAN.md`](STAGE_PLAN.md) DoD п. **4** — запись в [`../APP_RESTRUCTURE_INITIATIVE/LOG.md`](../APP_RESTRUCTURE_INITIATIVE/LOG.md) о завершении мини-инициативы | **FAIL / PENDING** | Есть запись **2026-05-04** о создании папки и канона, **нет** явной финальной строки «закрыты A/B/C + ссылка на AUDIT_GLOBAL». |
| [`STAGE_C.md`](STAGE_C.md) блок «Локальные проверки»: путь `pnpm … -- apps/webapp/src/...` при `--dir apps/webapp` | **FAIL (minor)** | В [`LOG.md`](LOG.md) зафиксирован рабочий вариант `… -- src/app/app/patient/treatment-programs` — **привести STAGE_C (и при необходимости ROADMAP узкие проверки) к одному канону**. |

---

## 7) Definition of Done (`STAGE_PLAN.md`) — чек мини-инициативы целиком

| № DoD | Критерий | Вердикт |
|-------|----------|---------|
| 1 | Закрыты A, B, C по чек-листам в `STAGE_*.md` | **PASS** (после §10 — чекбоксы `[x]` в `STAGE_A/B/C.md`) |
| 2 | Заполнен [`LOG.md`](LOG.md) | **PASS** |
| 3 | В ROADMAP_2 отмечены 1.0, 1.1, 1.1a (после merge) | **PASS** (после §10 — строка в `ROADMAP_2` §0) |
| 4 | Запись в APP_RESTRUCTURE `LOG.md` | **PASS** (после §10 — секция **GLOBAL FIX**) |
| 5 | В `LOG.md` секции read-rules / scope / checks / audit / out-of-scope | **PASS** (с достаточной детализацией по этапам). |
| 6 | Перед push: полный CI | **Вне этого аудита** — напоминание: не пушить без [`pre-push-ci.mdc`](../../.cursor/rules/pre-push-ci.mdc). |

---

## 8) MANDATORY FIX INSTRUCTIONS (по severity)

> **Статус выполнения (2026-05-04):** пункты **Major §8.1–8.2** и **Minor §8.1–8.3** закрыты проходом **GLOBAL FIX** (см. **§10**). Пункт **§8.4** (политика внешних правок) — процессный, поддерживается записями в [`LOG.md`](LOG.md) / APP_RESTRUCTURE `LOG.md`.

Ниже — **глобальный** слой (документы + открытые defer) и **напоминание**: детальные сценарии регресса по коду остаются в [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md), [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md), [`AUDIT_STAGE_C.md`](AUDIT_STAGE_C.md) (секции **MANDATORY FIX INSTRUCTIONS**); при регрессе **сначала** этаповый AUDIT, затем обновление [`LOG.md`](LOG.md).

### Critical (блокер продукта / данных) — открытых по инициативе **нет**

На момент global audit **нет** незакрытых Critical из трёх stage-audit (таблицы FIX closure — CLOSED). При появлении регресса — следовать **Critical** в каждом `AUDIT_STAGE_*.md`.

### Major (нарушение канона / DoD мини-инициативы)

1. **Синхронизировать ROADMAP_2 с фактом закрытия 1.0 / 1.1a / 1.1** после merge в целевую ветку: добавить в §**0** строку вида «Patient treatment programs polish (1.0+1.1a+1.1) | ✅ … | `docs/PATIENT_TREATMENT_PROGRAMS_POLISH_INITIATIVE/AUDIT_GLOBAL.md`» **или** иной согласованный маркер + ссылку на эту папку (как в DoD [`STAGE_PLAN.md`](STAGE_PLAN.md) п.3).  
2. **Добавить в [`../APP_RESTRUCTURE_INITIATIVE/LOG.md`](../APP_RESTRUCTURE_INITIATIVE/LOG.md)** финальную запись: закрытие A/B/C, ссылка на [`AUDIT_GLOBAL.md`](AUDIT_GLOBAL.md) и/или stage-audits (DoD п.4).

### Minor (качество / согласованность / scope hygiene)

1. **Проставить выполненные чекбоксы** в [`STAGE_A.md`](STAGE_A.md), [`STAGE_B.md`](STAGE_B.md), [`STAGE_C.md`](STAGE_C.md) (или заменить на явный блок «Закрыто по AUDIT_GLOBAL / LOG» с датой), чтобы визуальное состояние плана совпадало с журналом.  
2. **Обновить [`README.md`](README.md)** мини-инициативы: статус не «в работе», а **закрыто A/B/C** (дата) + ссылка на этот файл.  
3. **Выровнять команды lint** в [`STAGE_C.md`](STAGE_C.md) (и при дублировании в ROADMAP §1.1) с фактически рабочим префиксом путей из [`LOG.md`](LOG.md) (`src/...` под `pnpm --dir apps/webapp`).  
4. **Изоляция внешних правок:** любые будущие фиксы вне дерева `STAGE_*` (как `TestSetForm.test.tsx`) — отдельный коммит/PR или явная строка в APP_RESTRUCTURE `LOG.md` с обоснованием «разблокировка CI», чтобы не смешивать с продуктовым diff инициативы.

### INFO / DEFER (не блокер MVP текущего среза)

1. **Stage B — INFO-1:** вызов `/checklist-today` на detail без UI-блока «Чек-лист на сегодня» (**DEFER** до отдельного решения о «ноль запросов» или альтернативном read-path для `doneItemIds`) — см. [`AUDIT_STAGE_B.md`](AUDIT_STAGE_B.md) §5–6.  
2. **Stage A — live PostgreSQL** для instance-tree: **DEFER** до появления harness / сценария в `test:with-db` — см. [`AUDIT_STAGE_A.md`](AUDIT_STAGE_A.md) FIX closure.

### После любого GLOBAL FIX по §8

- Обновить [`LOG.md`](LOG.md) этой инициативы.  
- Перед push — **`pnpm install --frozen-lockfile && pnpm run ci`** ([`pre-push-ci.mdc`](../../.cursor/rules/pre-push-ci.mdc)).

---

## 9) Итоговый вердикт global audit

| Вопрос | Вердикт |
|--------|---------|
| Полный цикл EXEC → AUDIT → FIX по A/B/C | **Да** (по артефактам). |
| Порядок A → B → C | **Да**. |
| MVP-инварианты сохранены | **Да** (по этаповым аудитам + статическому `rg` в scope списка/детали). |
| Scope не вышел | **Почти** — одна задокументированная правка вне `treatment-programs` / STAGE_B paths. |
| LOG и docs синхронизированы | **Да (после §10)** — см. исторический снимок в §6 и closure в §10. |

> **Примечание:** строка выше про «LOG и docs» отражает **итог после doc-GLOBAL-FIX**; первичный снимок расхождений — в §6 (архив).

**Общий статус мини-инициативы:** продуктовые этапы **A / B / C закрыты по журналу и stage-audit**; документационный DoD после **§10 (GLOBAL FIX)** — **закрыт**; отказоустойчивость nudge в RSC — **§11**.

---

## 10) GLOBAL FIX closure (2026-05-04)

Выполнено по §8 **MANDATORY FIX INSTRUCTIONS** (global fix pass):

| Пункт AUDIT_GLOBAL §6 | Действие |
|-------------------------|----------|
| Чекбоксы `STAGE_A/B/C.md` | Все пункты отмечены **`[x]`** по факту закрытия этапов. |
| `README.md` статус | Обновлён: закрытие A/B/C + ссылка на этот файл; в таблицу документов добавлен **`AUDIT_GLOBAL.md`**. |
| ROADMAP_2 §0 (DoD `STAGE_PLAN` п.3) | Добавлена строка таблицы «Patient treatment programs polish (1.0+1.1a+1.1)» → **`AUDIT_GLOBAL.md`**. |
| `APP_RESTRUCTURE_INITIATIVE/LOG.md` (DoD п.4) | Запись **GLOBAL FIX** со ссылками и политикой по `TestSetForm.test.tsx`. |
| Команды `lint` в `STAGE_B/C` и ROADMAP §1.1 / §1.1a | Путь **`src/app/app/patient/treatment-programs`** при `pnpm --dir apps/webapp`. |

**Актуализация после §10:** синхронизация LOG и внешних docs по историческим строкам §6 — **закрыта**. Открытые **INFO/DEFER** из stage-audit (live PG для A; `/checklist-today` на detail для B) **без изменений** — см. §8 под «INFO / DEFER».

**Узкие проверки после правок:** зафиксированы в [`LOG.md`](LOG.md) секция **GLOBAL FIX** (`rg` + `eslint` по `src/app/app/patient/treatment-programs`).

---

## 11) Post-audit code: устойчивость `patientPlanUpdatedBadgeForInstance` (2026-05-04)

**Проблема:** при ошибке сервиса nudge страница списка могла упасть; на detail ошибка nudge попадала в общий `catch` с `getInstanceForPatient` и давала **ложный `notFound()`**.

**Сделано:**

- [`apps/webapp/src/app/app/patient/treatment-programs/page.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/page.tsx): `patientPlanUpdatedBadgeForInstance` в отдельном `try/catch` — при ошибке бейдж скрывается, страница рендерится.
- [`apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/page.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/%5BinstanceId%5D/page.tsx): загрузка экземпляра и nudge разведены; `notFound()` только на отсутствии/ошибке загрузки instance.
- Регресс-тесты: [`page.nudgeResilience.test.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/page.nudgeResilience.test.tsx), [`[instanceId]/page.nudgeResilience.test.tsx`](../../apps/webapp/src/app/app/patient/treatment-programs/%5BinstanceId%5D/page.nudgeResilience.test.tsx).

**Проверки:** `vitest` на файлы выше; `pnpm --dir apps/webapp exec tsc --noEmit`; `eslint` по затронутым путям `treatment-programs` (см. [`LOG.md`](LOG.md) секция **post-audit nudge**).
