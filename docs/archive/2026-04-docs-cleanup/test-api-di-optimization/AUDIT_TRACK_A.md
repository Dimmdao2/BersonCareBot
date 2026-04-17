# Audit — инвентарь трека A (TEST_AND_API_DI_OPTIMIZATION)

**Дата:** 2026-04-17. **Объект:** `test-optimization/INVENTORY.md`, согласованность с `test-optimization/PLAN.md`, отсутствие преждевременных удалений тестов, сохранение критичных семейств в плане работ. **Метод:** чтение документов и `LOG.md`; `git status` / `git diff` по каталогам тестов (без запуска `pnpm`/CI).

**История:** ниже — первичный аудит инвентаря; в конце файла — **post-EXEC** (после серии шагов, дифф + рекомендация phase).

## Verdict

**PASS** — инвентарь отражает выполненную сверку; удалений тестов и снятия критичных семейств с покрытия не зафиксировано. **Обновление 2026-04-17:** замечание DOC-1 устранено (таблица кандидатов в `PLAN.md` синхронизирована с `INVENTORY.md`); TA-MF-2 / TA-MF-3 закрыты встраиванием правил в `INVENTORY.md` (см. «MANDATORY FIX INSTRUCTIONS — closure»). **Post-EXEC:** см. раздел «Audit — post-EXEC трек A» — verdict **PASS**; полный CI в рамках аудита не запускался.

---

## 1) INVENTORY.md: классификация и overlap там, где было сравнение

### Покрытие строк таблицы e2e

В таблице **19/19** файлов `apps/webapp/e2e/*.test.ts` заданы:

- **Классификация** (тип сценария: server / in-process API / RSC / workflow и т.д.).
- **Роль после сверки** — явное описание содержимого после сравнения с кодом (не заглушки «unknown»).
- **Overlap с colocated `route.test.ts`** — дискретная оценка: *Нет*, *Частичное*, *Высокое*, *N/A*, плюс пояснение в ячейке или в «Роли».

Это согласуется с вводным абзацем INVENTORY (дата **2026-04-17**, критерии: colocated `**/app/api/**/route.test.ts` или отсутствие HTTP-слоя).

### Где сравнение «выполнено» vs «не применимо»

- Для файлов **без вызова route handlers** (RSC, wiring, сервисы, in-memory) INVENTORY корректно фиксирует overlap **«Нет»** «по определению» — не противоречит методике сверки.
- Для **api-routes-inprocess**, **api-integrator-subscriptions**, **auth-stage5**, **cms-content**, **api-auth-exchange**, **api-health**, **stage13** — указаны конкретные маршруты/слои и степень пересечения с route-тестами или с другими e2e.

### Оставшийся «unknown» вне таблицы e2e

В § Unit/hotspots по-прежнему **unknown** для профилирования — это **не** строки таблицы in-process e2e и не регресс относительно заявленной сверки e2e ↔ route.

**Итог по п. 1:** **Соответствует.**

---

## 2) Преждевременные удаления тестов без mapping

- В **`test-optimization/LOG.md`** (запись 2026-04-17 по инвентарю) явно: прод-код и тесты **не** менялись.
- **`git status`** на момент аудита: изменения только в `docs/TEST_AND_API_DI_OPTIMIZATION/**`; нет модификаций под `apps/webapp/e2e/*.test.ts` или `**/route.test.ts` в индексируемом диффе для этого шага.
- В INVENTORY для **stage13** и **live-dev** колонка «Первая волна» = **Нельзя**; для остальных — **Нет** (нет рекомендации «удалить сейчас»).

**Итог по п. 2:** **Удалений без mapping нет** (на шаге инвентаря удалений и не планировалось).

---

## 3) Критичные семейства из PLAN.md не «сняты» с покрытия

### Обязательные контракты (`PLAN.md` § «Обязательные контракты»)

План по-прежнему требует сохранять покрытие: auth (exchange, telegram/max, OAuth, logout, pin/phone), integrator (signed POST/GET, idempotency, channel-link, messenger-phone bind), messaging/reminders, media (upload/presign/multipart/confirm/get, internal purge), merge/purge/audit.

### Секции INVENTORY, выравнивающиеся с PLAN

- **«Критичные тесты (не первая волна удалений)»** в INVENTORY перечисляет те же чувствительные области (`integrator/events`, `messenger-phone/bind`, `reminders/dispatch`, `auth/exchange`, OAuth, `media/multipart/*`, merge/purge и т.д.) — **не** объявляет их вне покрытия и **не** предлагает выкинуть route-якорь.
- Кандидаты на будущий **review слияния** в INVENTORY относятся к **subscriptions topics/for-user** (happy-path дубли) и опционально health server vs in-process — это **не** замена критичных семейств из списка выше; colocated **105** `route.test.ts` остаются якорем (§ Colocated route tests).

### Риск трактовки «overlap = можно удалить»

INVENTORY явно отделяет **высокий overlap** от решения о удалении («кандидаты на будущий review», «не в этой задаче»). Для **auth/exchange** указано, что в route-тестах остаются 403 / 200 / cookie — e2e **не** заменяет этот якорь.

**Итог по п. 3:** **Критичные семейства планом не сняты** с покрытия; якорь остаётся на colocated route tests + существующих e2e без удалений.

---

## Наблюдение (документная согласованность) — **устранено**

| ID | Было | Статус |
|----|------|--------|
| DOC-1 | Таблица кандидатов в `PLAN.md` расходилась с `INVENTORY.md` | **CLOSED** — `PLAN.md` обновлён: источник правды INVENTORY + таблица-срез по фактическому overlap |

---

## MANDATORY FIX INSTRUCTIONS — closure

| ID | Уровень | Тема | Статус | Где зафиксировано |
|----|---------|------|--------|-------------------|
| TA-MF-1 | Minor | Синхронизация `PLAN.md` ↔ `INVENTORY.md` по кандидатам | **CLOSED** | `PLAN.md` § «Кандидаты на review / merge / remove» |
| TA-MF-2 | Major | Удаление/отключение теста без mapping | **CLOSED** (норма трека A) | `INVENTORY.md` § «Правила трека A перед удалением…» п. 1; `LOG.md` |
| TA-MF-3 | Critical | Снятие покрытия критичных семейств без замены | **CLOSED** (норма трека A) | `INVENTORY.md` § «Правила трека A…» п. 2; `PLAN.md` § «Обязательные контракты» |

**Verdict после closure:** **PASS**.

---

## MANDATORY FIX INSTRUCTIONS — ремедиация при нарушении

| ID | Severity | Условие | Действие |
|----|----------|---------|----------|
| TA-MF-2r | **Major** | Обнаружено удаление/отключение e2e или `route.test.ts` без записи mapping в `LOG.md` | Добавить mapping и обоснование; либо откатить изменение; иначе **REWORK_REQUIRED**. |
| TA-MF-3r | **Critical** | Suite или план снимает покрытие § «Обязательные контракты» / «Критичные тесты» без замены и без решения команды | Откатить изменения тестов; выровнять документы; эскалация команде. |

---

## Audit — post-EXEC трек A (серия шагов)

**Дата записи:** 2026-04-17. **Политика аудита:** `.cursor/rules/test-execution-policy.md` (сначала дифф → scope → reuse; **без** старта с полного `pnpm run ci`; полный CI на этом шаге **не** выполнялся).

### 0) Дифф, scope, что уже гонялось

| Изменение (относительно `HEAD`) | Scope |
|---------------------------------|--------|
| `D apps/webapp/e2e/api-integrator-subscriptions-inprocess.test.ts` | Трек A: удаление дублирующего e2e |
| `M apps/webapp/src/shared/ui/AuthBootstrap.test.tsx` | Webapp тесты, **вне** трека A (инициатива TEST_AND_API_DI_OPTIMIZATION) |
| `M apps/webapp/src/shared/ui/AuthBootstrap.tsx` | Прод-код webapp, **вне** трека A |
| Правки под `docs/TEST_AND_API_DI_OPTIMIZATION/**` | Документация инициативы |
| `**/app/api/**/route.ts` | **Нет** в диффе → смешивания с **треком B** (DI / import-boundary API) **нет** |

**Уже гонялось (по `LOG.md`, трек A EXEC):** step-level  
`pnpm exec vitest run …/topics/route.test.ts …/for-user/route.test.ts e2e/stage13-legacy-cleanup.test.ts` → 3 файла, 11 тестов, pass.

**Дополнительно (closure post-audit):** phase-level `pnpm test:webapp` — см. запись **2026-04-17 — трек A: закрытие AUDIT_TRACK_A** в `LOG.md`.

### 1) Нет удалённых тестов без mapping в `LOG.md`

Единственное удаление: `api-integrator-subscriptions-inprocess.test.ts`. В **`test-optimization/LOG.md`** (§ «2026-04-17 — трек A: удаление дублирующего e2e») есть таблица **old → replacement**, обоснование и ссылка на предварительный инвентарь/PLAN.

**Итог:** **Соответствует.**

### 2) Семейства контрактов из `PLAN.md` по-прежнему покрыты

Удалённый файл дублировал только happy-path **integrator subscriptions** `topics` / `for-user`, замещённый colocated  
`integrator/subscriptions/topics/route.test.ts` и `…/for-user/route.test.ts` (негативные ветки там же). Семейства из § «Обязательные контракты» / «Критерии нельзя удалять» — **events**, **messenger-phone/bind**, **reminders/dispatch**, **auth/exchange** (полный якорь), media multipart/merge и т.д. — **не** были целью удаления и остаются в `route.test.ts` / других e2e.

**Итог:** **Соответствует.**

### 3) Смешивание с треком B в том же коммите/PR

Трек B по репозиторию: правки `apps/webapp/src/app/api/**/route.ts` и связанный DI-boundary. В текущем диффе **нет** изменений `route.ts` под API.

**Итог:** **Смешивания трек A + трек B нет.** Отдельно: в дереве есть **не-тестовая** правка `AuthBootstrap.tsx` + тест — это не трек B, но для «чистого» PR трека A рекомендуется **разнести коммиты** (см. рекомендации ниже).

### 4) Рекомендация: нужен ли сейчас phase-level `pnpm test:webapp`

По policy: phase — когда закрыт **логический пакет** в приложении или перед пушем, если затронуто несколько зон тестов.

- После удаления одного e2e **достаточно** уже выполненного step, **если** в итоговый PR попадают **только** это удаление + доки инициативы.
- В текущем диффе **дополнительно** изменён `AuthBootstrap.test.tsx` (и прод `AuthBootstrap.tsx`). Если оба изменения уходят **в одном** PR: **рекомендуется phase** — `pnpm test:webapp` из корня (или полный `pnpm --dir apps/webapp test` без аргументов), чтобы покрыть весь webapp suite после нескольких затронутых тестовых областей; иначе минимум step по `AuthBootstrap.test.tsx` + уже пройденные replacement-тесты.
- Полный **`pnpm run ci`** — по `pre-push-ci.mdc` перед push, не как продолжение этого аудита.

**Итог:** phase **рекомендован** перед merge/push при объединённом диффе (e2e + AuthBootstrap); при изоляции только трека A — **не обязателен** после одного step, если нет других непрогнанных правок в `apps/webapp`. **Выполнено для закрытия аудита (только трек A):** phase `pnpm test:webapp` зафиксирован в `LOG.md`.

### Наблюдение (доки) — **устранено**

| ID | Было | Статус |
|----|------|--------|
| DOC-2 | Расхождение счётчика e2e и строк таблиц после удаления файла | **CLOSED** — `INVENTORY.md` / `PLAN.md` синхронизированы (**18** файлов; строка удалённого e2e убрана) |

**Проверки после исправлений (phase):** `pnpm test:webapp` (корень репо) — **349** files passed, **1775** tests passed (~28s). Полный `pnpm run ci` **не** выполнялся.

---

## MANDATORY FIX INSTRUCTIONS — post-EXEC / closure

| ID | Уровень | Тема | Статус | Где зафиксировано |
|----|---------|------|--------|-------------------|
| TA-PE-1 | Minor | DOC-2: INVENTORY / PLAN после удаления e2e | **CLOSED** | `INVENTORY.md`, `PLAN.md`; запись в `LOG.md` |
| TA-PE-2 | Major | Смешивание трека A и B в одном PR | **CLOSED** (норма) | `INVENTORY.md` § «Правила трека A…» п. 3 |
| TA-PE-3 | Major | Недостающий phase после пакета изменений webapp-тестов | **CLOSED** | Выполнен `pnpm test:webapp`; `LOG.md` |

**Verdict (post-EXEC, после closure):** **PASS**.

---

## MANDATORY FIX INSTRUCTIONS — post-EXEC / ремедиация при дрейфе

| ID | Severity | Условие | Действие |
|----|----------|---------|----------|
| TA-PE-1r | **Minor** (доки) | После удаления/переименования e2e снова разошлись `INVENTORY.md` и `PLAN.md` | Синхронизировать счётчик и таблицы. |
| TA-PE-2r | **Major** (процесс) | В один PR смешаны трек A и трек B (`route.ts` API) | Разделить PR или коммиты по `MASTER_PLAN.md`. |
| TA-PE-3r | **Major** (проверки) | Перед push после пакета правок в `apps/webapp` не было phase / pre-push CI | `pnpm test:webapp` и/или `pnpm run ci` по политике. |
