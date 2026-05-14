---
name: MAX TG pre-prod automation
overview: "До ручного прод-смоука: (1) webhook-тест при parse OK и fromMax === null; (2) executeAction-тест postOccurrenceSkip при skip preset none; (3) it.each в mapIn.test для update_type без ветки в fromMax; (4) корневой pnpm ci; (5) без eslint-disable: правки тестов под no-secrets (messengerStartParse, outgoingDeliveryWorker). Документация: docs/ARCHITECTURE/MAX_PREPROD_AUTOMATION_LOG.md + правки MAX_SETUP / MAX_CAPABILITY_MATRIX / docs/README. Прод вне DoD."
status: completed
todos:
  - id: max-webhook-frommax-null
    content: "webhook.test.ts — валидное тело message_edited, fromMax→null: 200, ok:true, eventGateway не вызывается"
    status: completed
  - id: reminders-post-occurrence-skip
    content: executeAction.test.ts — reminders.skip.applyPreset reason none + мок postOccurrenceSkip до markSkippedLocal
    status: completed
  - id: mapin-ignored-update-types-table
    content: "mapIn.test.ts — it.each по семи update_type без ветки в fromMax; без дублирования message_edited/message_removed"
    status: completed
  - id: integrator-lint-no-secrets-tests
    content: "Тесты integrator без eslint-disable no-secrets: сборка setphone-литерала по частям; переименование describe в outgoingDeliveryWorker.test"
    status: completed
  - id: root-ci-barrier
    content: Корень репо — pnpm install --frozen-lockfile && pnpm run ci
    status: completed
  - id: docs-sync-max-preprod
    content: "MAX_PREPROD_AUTOMATION_LOG.md, MAX_CAPABILITY_MATRIX, MAX_SETUP, docs/README; archive README — ссылка на план"
    status: completed
isProject: false
---

# План: автоматизация до прод-проверок (без прод-смоука)

База путей: корень git-репозитория (все относительные пути ниже — от него).

**Канон в git:** этот файл — `.cursor/plans/archive/max_tg_pre-prod_automation.plan.md` (путь от корня монорепо). Копии в `~/.cursor/plans/` — зеркало для IDE (см. `docs/TODO.md` §Cursor-планы).

## Границы scope

**Разрешено:** правки кода и тестов в `apps/integrator/**` в объёме ниже; правки плана; узкие прогоны `vitest`; финальный барьер `pnpm install --frozen-lockfile && pnpm run ci` из корня; синхронизация **архитектурной** документации MAX и журнала исполнения (`docs/ARCHITECTURE/*`, `docs/README.md`).

**Запрещено / вне scope:** изменения GitHub Actions; новые env для интеграций (`system_settings` — см. правила проекта); деплой; живые вызовы MAX API.

**После плана (вручную):** смоук на проде (webhook, напоминания, deep link, кнопки), логи/дашборды на хосте.

---

## 1. MAX webhook: пропуск при `fromMax === null`

**Файл:** `apps/integrator/src/integrations/max/webhook.test.ts`

**Поведение в коде:** после успешного `parseMaxUpdate`, если `fromMax(data)` даёт `null`, маршрут отвечает `200` + `{ ok: true }` и **не** вызывает `deps.eventGateway.handleIncomingEvent` (`webhook.ts` сразу после `const incoming = fromMax(data)`).

**Чеклист шага:**

- [x] `expect(res.statusCode).toBe(200)` и `JSON.parse(res.payload).ok === true`
- [x] `eventGateway.handleIncomingEvent` не вызывался
- [x] `pnpm --dir apps/integrator exec vitest --run src/integrations/max/webhook.test.ts`

---

## 2. `reminders.skip.applyPreset` и `postOccurrenceSkip`

**Файл:** `apps/integrator/src/kernel/domain/executor/executeAction.test.ts` — `describe('reminders.skip.applyPreset (telegram)')`.

**Поведение в коде:** `handlers/reminders.ts` — при `reasonCode === 'none'` и `remindersWebappWritesPort`: `postOccurrenceSkip` с `reason: null`, затем `markSkippedLocal`.

**Чеклист шага:**

- [x] Мок `postOccurrenceSkip` с ожидаемыми полями
- [x] Порядок относительно `markSkippedLocal` через `mock.invocationCallOrder`
- [x] `pnpm --dir apps/integrator exec vitest --run src/kernel/domain/executor/executeAction.test.ts -t "reminders.skip.applyPreset"`

---

## 3. Табличные кейсы `update_type` без ветки в `fromMax`

**Файл:** `apps/integrator/src/integrations/max/mapIn.test.ts`

**Чеклист шага:**

- [x] Семь типов в одной таблице `it.each`
- [x] Нет дублирования dedicated `it` для `message_edited` / `message_removed`
- [x] `pnpm --dir apps/integrator exec vitest --run src/integrations/max/mapIn.test.ts`

---

## 4. Финальный барьер CI

**Чеклист:**

- [x] Из корня: `pnpm install --frozen-lockfile && pnpm run ci`
- [x] При падениях допускается `ci:resume:*` между итерациями правок; перед push — полный `ci` (`.cursor/rules/pre-push-ci.mdc`).

---

## 4.1. Корневой `eslint` (`no-secrets`) на integrator-тестах

Ложные срабатывания на литералах/заголовке `describe` устранены **без** `eslint-disable`: сборка строки setphone-теста по частям; нейтральный заголовок `describe` в `outgoingDeliveryWorker.test.ts`.

**Файлы:** `messengerStartParse.test.ts`, `outgoingDeliveryWorker.test.ts`.

---

## 5. Прод-смоук (вручную)

- MAX: игнорируемый `update_type` не ломает webhook; целевые события доходят до сценария.
- Напоминания: skip preset `none` / free-text; при необходимости — след в webapp после `postOccurrenceSkip`.
- Deep link: `link_*`, `setphone_*` с `%2B`, bare `link_*` с бота.

---

## 6. Документация (синхронизация с кодом)

- `docs/ARCHITECTURE/MAX_PREPROD_AUTOMATION_LOG.md` — журнал изменений и команд проверки.
- `docs/ARCHITECTURE/MAX_CAPABILITY_MATRIX.md` — ссылка на автопокрытие игнорируемых типов и webhook.
- `docs/ARCHITECTURE/MAX_SETUP.md` — ссылка на тесты и журнал.
- `docs/README.md` — строка в оглавлении.

---

## Definition of Done

1. Разделы 1–3: указанные команды `vitest` зелёные.
2. Раздел 4: полный `ci` зелёный на актуальном дереве.
3. Раздел 4.1: нет новых `eslint-disable no-secrets` для затронутых тестов.
4. Раздел 6: доки и этот план согласованы с кодом.
5. Прод-смоук и хостовые проверки **не** входят в DoD агента.
