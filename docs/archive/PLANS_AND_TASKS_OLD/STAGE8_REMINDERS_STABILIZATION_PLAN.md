# Stage 8: Стабилизация reminders domain — план для авто-агента

> **Режим:** только план. Реализацию выполняет младший агент в режиме авто по этому документу.
>
> **Источник:** [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md), этап 8.

---

## Цель этапа 8

После переноса reminders (Stage 7):

- выполнить reconciliation reminder rules и access grants (и delivery logs);
- проверить delivery logs projection;
- убрать legacy product reads для reminders в integrator;
- подтвердить, что webapp обслуживает reminder настройки и историю.

**Результат:** reminders domain устойчиво работает в новой модели (product reads только через webapp, без fallback на БД integrator).

---

## Meta-инструкция для агента

1. **Одна задача = один PR.** Следующий PR только после green CI предыдущего.
2. **Каждый шаг — атомарное изменение одного файла.** Путь, что искать, на что заменить, что проверить.
3. **Тесты — отдельный шаг после production-кода.** Не смешивать.
4. **В конце каждой задачи:** шаг верификации — `pnpm run ci` зелёный.
5. **Не редактировать документы-планы** (этот файл, `DB_ZONES_RESTRUCTURE.md` и др.) — read-only.
6. **НЕ ДЕЛАТЬ:** не менять контракты API webapp (query params, response shape); не удалять таблицы/миграции; не трогать `reminders.occurrences.due` и `reminders.rules.enabled` (они остаются на local DB); не менять di.ts логику создания remindersReadsPort (оставить как есть — создаётся при наличии APP_BASE_URL и webhook secret).

---

## Контекст кодовой базы

- **Stage 7 уже сделал:** projection reminder rules/occurrences/delivery/content access в webapp; backfill и reconcile скрипты; readPort с fallback: при наличии `remindersReadsPort` — вызов webapp, иначе чтение из БД integrator (`getReminderRulesForUser`, `getReminderRuleForUserAndCategory`).
- **Stage 8:** убрать этот fallback — для `reminders.rules.forUser` и `reminders.rule.forUserAndCategory` использовать только `remindersReadsPort`; при его отсутствии — явная ошибка (no silent fallback).
- **Reconciliation:** `apps/webapp/scripts/reconcile-reminders-domain.mjs` сравнивает integrator ↔ webapp по правилам, occurrence history, delivery events, content_access_grants. Gate: `pnpm run stage7-gate` (projection-health + reconcile).
- **Delivery logs:** integrator пишет в `user_reminder_delivery_logs` и enqueue `reminder.delivery.logged`; webapp в `handleIntegratorEvent` вызывает `rp.appendDeliveryEventFromProjection` → `reminder_delivery_events`.

---

## Затронутые файлы

| Файл | Задачи |
|------|--------|
| `apps/integrator/src/infra/db/readPort.ts` | T1 |
| `apps/integrator/src/infra/db/readPort.test.ts` | T1 |
| `apps/webapp/src/modules/integrator/events.test.ts` | T2 |
| (без изменений кода: запуск gate/reconcile) | T3 |

---

## Execution order

- **T1** → **T2** → **T3** (строго по порядку).

---

## T1 (P0): Убрать legacy product reads для reminders в readPort

**Цель:** для запросов `reminders.rules.forUser` и `reminders.rule.forUserAndCategory` не читать из БД integrator; использовать только `remindersReadsPort`. При отсутствии порта — явная ошибка.

**Текущее состояние:** В `readPort.ts` для этих двух типов запросов: если `remindersReadsPort` задан — вызов порта; иначе вызов `getReminderRulesForUser` / `getReminderRuleForUserAndCategory` (чтение из БД integrator). Нужно убрать ветку fallback.

**Решение:** В ветках `reminders.rules.forUser` и `reminders.rule.forUserAndCategory`: вызывать только `remindersReadsPort`. Если `remindersReadsPort` отсутствует — выбросить ошибку (например `new Error('reminders product reads require remindersReadsPort')`), чтобы конфигурация без webapp не молча откатывалась на устаревшие данные.

### Шаг T1.1: readPort — убрать fallback для reminders.rules.forUser

**Файл:** `apps/integrator/src/infra/db/readPort.ts`

**Найти:**
```ts
        case 'reminders.rules.forUser': {
          const userId = asNonEmptyString(query.params.userId);
          if (!userId) return [] as T;
          if (remindersReadsPort) {
            return (await remindersReadsPort.listRulesForUser(userId)) as T;
          }
          return (await getReminderRulesForUser(db, userId)) as T;
        }
```

**Заменить на:**
```ts
        case 'reminders.rules.forUser': {
          const userId = asNonEmptyString(query.params.userId);
          if (!userId) return [] as T;
          if (!remindersReadsPort) {
            throw new Error('reminders product reads require remindersReadsPort');
          }
          return (await remindersReadsPort.listRulesForUser(userId)) as T;
        }
```

**Верификация:** `pnpm --dir apps/integrator typecheck` — без ошибок.

**Критерий успеха:** типчек проходит; логика больше не вызывает `getReminderRulesForUser` для этого case.

---

### Шаг T1.2: readPort — убрать fallback для reminders.rule.forUserAndCategory

**Файл:** `apps/integrator/src/infra/db/readPort.ts`

**Найти:**
```ts
        case 'reminders.rule.forUserAndCategory': {
          const userId = asNonEmptyString(query.params.userId);
          const category = asNonEmptyString(query.params.category);
          if (!userId || !category) return null as T;
          if (remindersReadsPort) {
            return (await remindersReadsPort.getRuleForUserAndCategory(userId, category)) as T;
          }
          return (await getReminderRuleForUserAndCategory(db, userId, category as never)) as T;
        }
```

**Заменить на:**
```ts
        case 'reminders.rule.forUserAndCategory': {
          const userId = asNonEmptyString(query.params.userId);
          const category = asNonEmptyString(query.params.category);
          if (!userId || !category) return null as T;
          if (!remindersReadsPort) {
            throw new Error('reminders product reads require remindersReadsPort');
          }
          return (await remindersReadsPort.getRuleForUserAndCategory(userId, category)) as T;
        }
```

**Верификация:** `pnpm --dir apps/integrator typecheck` — без ошибок.

**Критерий успеха:** типчек проходит; логика больше не вызывает `getReminderRuleForUserAndCategory` для этого case.

---

### Шаг T1.3: Удалить неиспользуемые импорты из readPort

**Файл:** `apps/integrator/src/infra/db/readPort.ts`

**Найти (в блоке импортов из repos/reminders.js):**
```ts
import {
  getDueReminderOccurrences,
  getEnabledReminderRules,
  getReminderOccurrencesForRuleRange,
  getReminderRuleForUserAndCategory,
  getReminderRulesForUser,
} from './repos/reminders.js';
```

**Заменить на:**
```ts
import {
  getDueReminderOccurrences,
  getEnabledReminderRules,
  getReminderOccurrencesForRuleRange,
} from './repos/reminders.js';
```

**Верификация:** `pnpm --dir apps/integrator typecheck` и `pnpm --dir apps/integrator test` — без ошибок.

**Критерий успеха:** импорты соответствуют использованию; тесты проходят.

---

### Шаг T1.4: Тесты readPort — убрать fallback-кейсы, добавить кейсы на ошибку при отсутствии порта

**Файл:** `apps/integrator/src/infra/db/readPort.test.ts`

**Действия:**

1. **Удалить** два теста:
   - `it('reminders.rules.forUser falls back to DB when remindersReadsPort is undefined', ...)`
   - `it('reminders.rule.forUserAndCategory falls back to DB when remindersReadsPort is undefined', ...)`

2. **Добавить** два теста:
   - `it('reminders.rules.forUser throws when remindersReadsPort is undefined', async () => { ... })`  
     Вызвать `port.readDb({ type: 'reminders.rules.forUser', params: { userId: '42' } })` без передачи `remindersReadsPort`. Ожидать: выброс ошибки с сообщением, содержащим `remindersReadsPort` (или `reminders product reads`).
   - `it('reminders.rule.forUserAndCategory throws when remindersReadsPort is undefined', async () => { ... })`  
     Вызвать `port.readDb({ type: 'reminders.rule.forUserAndCategory', params: { userId: '42', category: 'exercise' } })` без `remindersReadsPort`. Ожидать: выброс ошибки с тем же признаком.

**Верификация:** `pnpm --dir apps/integrator test -- apps/integrator/src/infra/db/readPort.test.ts` — все тесты зелёные.

**Критерий успеха:** старые fallback-тесты удалены; новые тесты проверяют throw при отсутствии порта; остальные тесты (delegation, occurrences.due, rules.enabled) без изменений и проходят.

---

### Шаг T1.5: Верификация задачи T1

**Команда:** `pnpm run ci`

**Критерий успеха:** полный CI зелёный. DoD задачи T1: product reads для reminder rules и rule-by-category только через remindersReadsPort; при его отсутствии — явная ошибка; тесты и типчек проходят.

---

## T2 (P0): Усилить проверку delivery logs projection в тестах

**Цель:** убедиться, что обработка `reminder.delivery.logged` в webapp вызывает projection repo с корректными аргументами (покрытие и критерий успешности delivery logs projection).

**Текущее состояние:** В `events.test.ts` есть тесты "accepts reminder.delivery.logged" и "rejects ... without required fields", но не проверяется вызов `appendDeliveryEventFromProjection` с конкретными аргументами.

**Решение:** Добавить тест, в котором зависимость `reminderProjection` (или тот объект, который передаётся в `handleIntegratorEvent` и у которого вызывается `appendDeliveryEventFromProjection`) — мок; отправить событие `reminder.delivery.logged` с полным payload; утвердить, что мок был вызван ровно один раз с ожидаемыми полями (integratorDeliveryLogId, integratorOccurrenceId, integratorRuleId, integratorUserId, channel, status, createdAt и при необходимости errorCode, payloadJson).

### Шаг T2.1: Изучить контракт deps для handleIntegratorEvent

**Файл:** `apps/webapp/src/modules/integrator/events.test.ts` (и при необходимости `events.ts`)

Убедиться, какой ключ в `deps` передаётся для reminder projection (например `reminderProjection` или `rp`) и какой метод вызывается (`appendDeliveryEventFromProjection`). В тестах уже используется `depsWithRp` — проверить, как создаётся мок для `appendDeliveryEventFromProjection`.

**Верификация:** понимание зафиксировано для следующего шага (код не менять, только чтение).

---

### Шаг T2.2: Добавить тест вызова appendDeliveryEventFromProjection при reminder.delivery.logged

**Файл:** `apps/webapp/src/modules/integrator/events.test.ts`

**Действие:** Добавить один тест (например после "accepts reminder.delivery.logged"):

- Создать мок объекта с методом `appendDeliveryEventFromProjection` (vi.fn()).
- Передать его в deps так, чтобы он использовался при обработке `reminder.delivery.logged` (в том же формате, что и существующий `depsWithRp`).
- Вызвать `handleIntegratorEvent` с событием `eventType: "reminder.delivery.logged"` и полным payload (integratorDeliveryLogId, integratorOccurrenceId, integratorRuleId, integratorUserId, channel, status, errorCode, payloadJson, createdAt).
- Утвердить: `expect(mock.appendDeliveryEventFromProjection).toHaveBeenCalledTimes(1)` и `expect(mock.appendDeliveryEventFromProjection).toHaveBeenCalledWith({ integratorDeliveryLogId: '...', integratorOccurrenceId: '...', ... })` с совпадением всех переданных в payload полей.

**Верификация:** `pnpm --dir apps/webapp test -- apps/webapp/src/modules/integrator/events.test.ts` — все тесты зелёные.

**Критерий успеха:** новый тест добавлен и проходит; существующие тесты reminder.delivery.logged не сломаны.

---

### Шаг T2.3: Верификация задачи T2

**Команда:** `pnpm run ci`

**Критерий успеха:** полный CI зелёный. DoD задачи T2: есть явная проверка того, что при приёме `reminder.delivery.logged` webapp вызывает projection с правильными аргументами.

---

## T3 (P1): Reconciliation и подтверждение работы webapp API

**Цель:** убедиться, что reconciliation выполняется успешно и webapp обслуживает reminder настройки и историю (существующие маршруты и тесты — критерий успеха).

**Решение:** Не менять код. Добавить в план явные шаги проверки и критерии. Агент выполняет только запуск скриптов и тестов.

### Шаг T3.1: Запуск существующих тестов webapp API для reminders

**Команды по очереди:**

- `pnpm --dir apps/webapp test -- apps/webapp/src/app/api/integrator/reminders/rules/route.test.ts`
- `pnpm --dir apps/webapp test -- apps/webapp/src/app/api/integrator/reminders/rules/by-category/route.test.ts`
- `pnpm --dir apps/webapp test -- apps/webapp/src/app/api/integrator/reminders/history/route.test.ts`

**Верификация:** все три набора тестов проходят.

**Критерий успеха:** подтверждение, что webapp маршруты для reminder rules, rule-by-category и history покрыты тестами и зелёные.

---

### Шаг T3.2: Рекомендуемая ручная проверка (для отчёта, не блокирует CI)

**Команда (требуются DATABASE_URL и INTEGRATOR_DATABASE_URL):**

- `pnpm --dir apps/webapp run reconcile-reminders-domain`
- При необходимости с порогом: `node apps/webapp/scripts/reconcile-reminders-domain.mjs --max-mismatch-percent=0`

**Команда gate (если окружение настроено):**

- `pnpm run stage7-gate`

**Критерий успеха:** в среде с двумя БД reconciliation завершается с кодом 0; при отсутствии окружения шаг можно пропустить с пометкой "skipped (no DB URLs)".

---

### Шаг T3.3: Финальная верификация этапа 8

**Команда:** `pnpm run ci`

**Критерий успеха:** полный CI зелёный.

**DoD этапа 8:**

- Legacy product reads для reminders в readPort убраны (только remindersReadsPort; при отсутствии — throw).
- Тесты readPort обновлены (fallback удалён, добавлена проверка на throw).
- Delivery logs projection проверена тестом (вызов appendDeliveryEventFromProjection с нужными аргументами).
- Тесты webapp API для reminder rules/history зелёные.
- Рекомендовано выполнить reconcile и stage7-gate в среде с БД; reminders domain считается стабилизированным в новой модели.

---

## Ссылки на guardrails (DB_ZONES_RESTRUCTURE.md)

- Reconciliation обязательна как часть cutover — этап 8 явно включает запуск reconcile и gate (T3).
- Product reads для reminders переведены на webapp; в integrator остаются только runtime reads (occurrences.due, rules.enabled) и запись.

---

## НЕ ДЕЛАТЬ (жёсткие ограничения)

- Не редактировать планы и roadmap документы.
- Не менять контракт API webapp (query params, JSON response) для `/api/integrator/reminders/*`.
- Не удалять и не менять миграции, таблицы integrator или webapp.
- Не трогать обработку `reminders.occurrences.due` и `reminders.rules.enabled` в readPort (остаются на local DB).
- Не менять `apps/integrator/src/app/di.ts`: не делать remindersReadsPort обязательным при старте (оставить создание только при наличии APP_BASE_URL и webhook secret).
- Не удалять функции `getReminderRulesForUser` и `getReminderRuleForUserAndCategory` из `repos/reminders.ts` в рамках этапа 8 (возможен последующий cleanup в Stage 13).
