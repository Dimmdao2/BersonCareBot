# Execution log: doctor-only завершение этапа

**Последняя синхронизация с репозиторием и документацией:** `2026-05-14T07:19:26Z` (UTC).

## Журнал записей (ISO, append-style)

- `2026-05-14T07:19:26Z` — после аудита: актуализирован preflight; runbook дополнен блоками Preconditions / Post-check / Rollback; зафиксирован отсутствие автотестов doctor UI (ручной smoke); добавлен unit-тест `skipped` → `in_progress` и очистка `skip_reason`; в FSM-док добавлен backlog про reopen при уже выполненных пунктах.
- `2026-05-14T07:25:00Z` — `pnpm install --frozen-lockfile && pnpm run ci` (корень монорепо) завершился успешно после правок.

## Цель

Этап экземпляра программы не переходит в `completed` от пациентских действий; закрытие и пропуск — только врач; штатный откат закрытого этапа через UI врача.

---

## Шаг 0 — Preflight

- **До изменений:** `rg "maybeCompleteStageFromItems" apps/webapp/src` — вхождения только в `progress-service.ts` (определение и два вызова).
- **После merge:** `rg "maybeCompleteStageFromItems" apps/webapp/src` → **0** совпадений.
- Врачебный путь: `doctorSetStageStatus` → `instances.updateInstanceStage` (контракт API пациента не менялся).

## Шаг 1 — Удаление автозавершения пациентом

- Удалены `maybeCompleteStageFromItems` и вызовы из `patientCompleteSimpleItem` / `patientSubmitTestResult` (ветка `allDone`).
- Сохранён переход `available` → `in_progress` в `patientTouchStageItemInner`.
- Проверка: `rg "maybeCompleteStageFromItems" apps/webapp/src` → нет совпадений.

## Шаг 2 — Тесты

- Обновлён `progress-service.test.ts`: сценарии §3, clinical_test, A2 — после пациента этап не `completed`; разблокировка следующего — после `doctorSetStageStatus({ status: "completed" })`; после пациента нет события `stage_completed` до шага врача (где применимо).
- Тест reopen: врач `completed` → `in_progress`; следующий этап остаётся `available` (v1 без re-lock).
- Тест reopen: врач `skipped` → `in_progress`; `skipReason` сбрасывается (`null` в строке этапа) — покрывает требование плана про отсутствие «залипания» причины пропуска.

## Шаг 3 — Регрессия модуля

- Команда: `cd apps/webapp && pnpm exec vitest run src/modules/treatment-program/` (все `.test.ts` в каталоге модуля).
- Полный барьер перед merge: `pnpm install --frozen-lockfile && pnpm run ci` (корень монорепо) — выполнять при передаче в main/релиз.

## Шаг 4–5 — Документация и лог

- `PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md` — раздел FSM + backlog про reopen без сброса `completed_at`.
- `DB_STRUCTURE.md` §2.9 — семантика статусов этапа экземпляра + отсылка к FSM.
- Этот файл — execution log.

## Шаг 6 — Repair / откат (runbook)

### Preconditions

- Сессия врача с доступом к карточке клиента и инстансу программы.
- Инстанс программы не в read-only для мутаций (`editLocked` / завершённый инстанс — те же правила, что у кнопок этапа в UI).
- Для **пропуска** этапа по-прежнему нужна причина (отдельный диалог «Пропустить этап»); **«Открыть заново»** применяется к уже `completed` / `skipped`.

### Основной путь (после релиза UI)

1. Врач открывает деталь инстанса: `/app/doctor/clients/[userId]/treatment-programs/[instanceId]`.
2. Для этапа в **`completed`** или **`skipped`** — **«Открыть заново»** → `PATCH` с телом `{ "status": "in_progress" }` на `/api/doctor/treatment-program-instances/{instanceId}/stages/{stageId}`.
3. Стандартный doctor UI по-прежнему блокирует «Завершить этап» / «Пропустить этап» на `completed`/`skipped` через `stageActionsLocked`; кнопка **«Открыть заново»** в `disabled` **не** использует `stageActionsLocked` (только `saving` и `editLocked`).

### Post-check

- В кабинете пациента этап снова в рабочем контуре (pipeline), при прочих равных.
- После перехода из `skipped` в не-`skipped`: поле причины пропуска в БД/модели этапа — `null` (реализация `updateInstanceStage` в PG и in-memory порте).
- При наличии второго этапа, ранее разблокированного при закрытии первого: по политике **v1** он **остаётся** `available` — автоматический re-lock не выполняется.

### Fallback: PATCH без UI

- Тот же `PATCH` под сессией врача (например `curl` с cookie) — только под контролем и с записью в тикет.

### Fallback: SQL (массовые или аварийные случаи)

- Только по согласованию с ops; учитывать цепочку `completed`/`skipped` → разблокировка следующего `locked` → `available`.
- После правки строки этапа проверить соседние этапы по `sort_order` и при необходимости вручную скорректировать статусы.

### Когда PATCH vs SQL

- **PATCH/UI** — единичные случаи, штатный откат, аудит через приложение.
- **SQL** — массовый инцидент, нет доступа врача в UI, миграции данных (отдельный runbook на инцидент).

### Rollback (откат релиза кода)

- Откат ветки: прежняя версия `progress-service.ts`, тестов и UI без «Открыть заново».
- После отката кода синхронизировать этот документ и `PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md` с фактическим поведением.

---

## Шаг 7 — Врачебный UI

- Кнопка **«Открыть заново»** в `TreatmentProgramInstanceDetailClient.tsx` (`StageDoctorControls`): `completed` | `skipped` → `PATCH` `{ "status": "in_progress" }`.
- **Автотестов React-компонента нет**; проверка сценария кнопки — **ручной smoke** в браузере (визуально + сеть DevTools на PATCH).

---

## Политика «следующий этап» (v1)

При закрытии этапа врачом следующий `locked` становится `available`. При **«Открыть заново»** текущий этап снова `in_progress`, но **следующий этап не переводится обратно в `locked` автоматически**. Если следующий этап должен снова быть закрыт для пациента — вручную (будущее действие в UI или SQL под контролем).

## Известное ограничение / backlog

- Повторное открытие этапа врачом при том, что пациент уже отметил пункты или сдал тесты, **не** сбрасывает автоматически `completed_at` и историю тестов; дублирование отметок и сценарии «обнулить прогресс при reopen» — **не** входили в объём изменения; см. FSM в `PATIENT_TREATMENT_PROGRAM_STAGE_SURFACES.md`.

## Намеренно не делали в этом изменении

- Автоматический re-lock следующего этапа по эвристике «нет активности пациента».
- Миграции схемы БД и массовый backfill прод-данных.
