# D10a single-writer — независимый аудит 2026-08-20

**PASS — убито 3, не поймано 0.**

## Объект и оракул

- Подсудимый: `f82326c0a` (`refactor(integrator): route delivery attempts to canonical journal`).
- В момент аудита ветка стояла на merge-SHA `b443fe4da`; команда
  `git diff --quiet f82326c0a..HEAD -- <8 affected integrator paths>` вернула `0`, то есть код и тесты
  подсудимого в этих путях после merge не менялись.
- Authority: `WORK_ORDER.md`, D10a — журнал попыток
  `public.notification_delivery_attempts`, legacy-журнал `integrator.delivery_attempt_logs` удаляется;
  Р-D10a-2 требует, чтобы канонический журнал принимал и попытку без строки очереди.
- Метод: повторяемая маршрутизация и десять полей — тест + fault injection; удаление fallback и границы
  разового diff — взгляд (`git diff`, `code-search`, `rg`), без тестов на строки исходника.

## 1. Перепись производителей, маршрутов и физических писателей

Точные production-производители мутации после коммита найдены командой:

```text
git grep -n "type: 'delivery.attempt.log'" f82326c0a -- apps/integrator/src ':(exclude)**/*.test.ts'
```

Результат — **2**, как и до коммита:

1. `apps/integrator/src/infra/adapters/dispatchPort.ts:134` — provider success/failed/skipped;
2. `apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts:561` — worker pre-dispatch skipped.

У integrator было и осталось **2 runtime-входа** записи этой мутации, но их назначения сведены:

1. `createDbWritePort()` (`writePort.ts`): до коммита звал `insertDeliveryAttemptLog()` →
   `app.record_operational_delivery_attempt_audit(...)`; после коммита зовёт
   `writeOperatorDeliveryAttempt()` → `app.record_operator_delivery_attempt(...)`.
2. `createOperatorAwareDeliveryAttemptWritePort()` (`operatorDeliveryAttemptWritePort.ts`): до коммита
   канонический root выбирался только worker-principal/audit-context, остальные principals делегировались в
   tenant/base path и попадали в legacy-root; после коммита любая `delivery.attempt.log` безусловно уходит в
   `writeOperatorDeliveryAttempt()` до проверки principal.

Следовательно, физических named-root писателей из runtime integrator было **2**, осталось **1**:

- удалённый путь: `messageLogs.ts` →
  `app.record_operational_delivery_attempt_audit(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)`;
- единственный оставшийся путь: `operatorDeliveryAttempts.ts` →
  `app.record_operator_delivery_attempt(text,text,text,uuid,text,text,integer,text,text,timestamp with time zone)`.

Команды-переписи:

```text
git grep -n -E "record_operational_delivery_attempt_audit|record_operator_delivery_attempt" f82326c0a^ -- apps/integrator/src ':(exclude)**/*.test.ts'
git grep -n -E "record_operational_delivery_attempt_audit|record_operator_delivery_attempt" f82326c0a -- apps/integrator/src ':(exclude)**/*.test.ts'
git grep -n -E "insertDeliveryAttemptLog\(|writeOperatorDeliveryAttempt\(" f82326c0a^ -- apps/integrator/src ':(exclude)**/*.test.ts'
git grep -n -E "insertDeliveryAttemptLog\(|writeOperatorDeliveryAttempt\(" f82326c0a -- apps/integrator/src ':(exclude)**/*.test.ts'
```

Все четыре команды вернули `0` и показали перечисленные выше места. Текущий worktree дополнительно проверен:

```text
rg -n --glob '!**/*.test.ts' --glob '!**/*.spec.ts' "record_operational_delivery_attempt_audit|insertDeliveryAttemptLog" apps/integrator/src
```

Результат: `exit 1`, **0 runtime-caller'ов legacy-root**. Поиск оставшихся canonical routes:

```text
rg -n --glob '!**/*.test.ts' --glob '!**/*.spec.ts' "await writeOperatorDeliveryAttempt\(" apps/integrator/src
```

Результат: `exit 0`, ровно **2** вызова — `writePort.ts:883` и
`operatorDeliveryAttemptWritePort.ts:12`; оба сходятся в один named root.

## 2. Десять полей и граничные значения

Для валидного production-домена порядок и смысл аргументов legacy и canonical doors совпадают:

| # | Логическое поле | Legacy door | Canonical door |
| ---: | --- | --- | --- |
| 1 | intent type | `intentType` | `intentType` |
| 2 | event id | `intentEventId` | `eventId` |
| 3 | correlation id | `correlationId` | `correlationId` |
| 4 | organization | `organizationId` / `null` | `organizationId` / `null` |
| 5 | channel | `channel` | `channel` |
| 6 | status | `status` | `status` |
| 7 | attempt | `attempt` | `attempt` |
| 8 | reason | `reason` / `null` | `reason` / `null` |
| 9 | payload | object JSON, иначе `{}` | object JSON, иначе `{}` |
| 10 | occurred at | исходная строка либо current ISO | исходная строка либо current ISO |

Добавлен один acceptance-test в `operatorDeliveryAttempts.test.ts`. Он передаёт отсутствие свойства
`organizationId`, непустой допустимый `reason: 'rate_limited'`, scalar payload и
`occurredAt: '2026-08-20T15:34:56.789+03:00'`; exact assertion видит у canonical door соответственно
`null`, `'rate_limited'`, `'{}'` и исходную timezone-строку. Остальные шесть аргументов проверяются тем же
assertion. Это проверка поведения вызова, не поиск текста.

## 3. Fallback и вторые писатели

- `operatorDeliveryAttemptWritePort.ts`: branch `mutation.type === 'delivery.attempt.log'` безусловный и стоит
  раньше principal-routing; ни organization, ни integrator, ни другой infra principal не могут попасть в
  `tenantWritePort` для этой мутации.
- `writePort.ts`: base path напрямую вызывает общий `writeOperatorDeliveryAttempt()`.
- `messageLogs.ts`: delivery-case и `insertDeliveryAttemptLog()` удалены; файл обслуживает только
  non-delivery diagnostic events.
- Точный current-worktree `rg` выше вернул `exit 1` для legacy-root/legacy helper в production-коде
  integrator. Остатки legacy-функции/таблицы в deploy/schema/cutover не являются runtime-caller'ами и не
  правились этим коммитом; их физический DROP находится вне данного bounded diff.

Итог: fallback действительно недостижим из `delivery.attempt.log`, а не перенесён в другую principal-ветку.

## 4. Blind fault injection

Kill-set был составлен до чтения тестов. Каждая поломка запускалась только на своём тестовом файле и затем
полностью откачивалась.

| ID | Инъекция | Собственная команда | Exit и красный oracle |
| --- | --- | --- | --- |
| K1 | В base `writePort.ts` canonical call заменён на diagnostic `appendMessageLog()` | `pnpm --dir apps/integrator exec vitest run src/infra/db/repos/messageLogs.deliveryAttemptAudit.test.ts` | `1`; 7/7 assertions красные, canonical mock получил 0 вызовов |
| K2 | В canonical mapper scalar payload сериализуется как скаляр вместо нормализации в `{}` | `pnpm --dir apps/integrator exec vitest run src/infra/db/repos/operatorDeliveryAttempts.test.ts` | `1`; красный ровно boundary-test: ожидал `'{}'`, получил JSON string |
| K3 | В operator-aware port возвращена достижимая conditional ветка: canonical только для infra, прочие principals уходят в tenant fallback | `pnpm --dir apps/integrator exec vitest run src/infra/runtime/worker/operatorDeliveryAttemptWritePort.test.ts` | `1`; красные organization и integrator cases, canonical mock получил 0 вызовов |

**Убито 3, не поймано 0.** После обратных patches команда
`git diff --quiet -- apps/integrator/src/infra/db/repos/operatorDeliveryAttempts.ts apps/integrator/src/infra/db/writePort.ts apps/integrator/src/infra/runtime/worker/operatorDeliveryAttemptWritePort.ts`
вернула `0`: временных product-инъекций не осталось.

## 5. Границы diff и отсутствие побочного поведения

Полный список `git diff --name-status f82326c0a^ f82326c0a` содержит только четыре production TS-файла
маршрутизации/репозиториев, четыре test-файла и отчёт воркера. Проверки запрещённых областей:

```text
git diff --quiet f82326c0a^ f82326c0a -- ':(glob)**/*.sql' ':(glob)**/migrations/**' 'deploy/postgres/**'
# exit 0
git diff --quiet f82326c0a^ f82326c0a -- ':(glob)**/*privilege*' ':(glob)**/*grant*'
# exit 0
```

То есть миграций, `deploy/postgres/`, grants/privileges и `*.sql` в diff нет.

Отдельно:

```text
git diff --quiet f82326c0a^ f82326c0a -- apps/integrator/src/infra/adapters apps/integrator/src/infra/runtime/worker/outgoingDeliveryWorker.ts apps/integrator/src/infra/adapters/jobQueuePort.ts
# exit 0
```

Порядок отправки, выбор транспорта, provider calls, очередь и retry/finalization не менялись. В изменённой
operator-aware обёртке non-delivery mutations по-прежнему делегируются тем же principals; изменён только текст
общего rejection error. Реального изменения transport/retry/send behavior не найдено.

## 6. Финальные проверки

```text
pnpm --dir apps/integrator exec vitest run src/infra/db/repos/operatorDeliveryAttempts.test.ts src/infra/runtime/worker/operatorDeliveryAttemptWritePort.test.ts src/infra/db/repos/messageLogs.deliveryAttemptAudit.test.ts src/infra/db/writePort.reminderRuleFallback.test.ts
# exit 0 — 4 files, 19 tests passed

pnpm --dir apps/integrator typecheck
# exit 0
```

Полный CI не запускался по brief и §10. `git diff --check` выполняется после создания этого отчёта;
финальная чистота `git status --short` проверяется после audit-коммита, потому что до него этот отчёт и новый
acceptance-test намеренно являются изменениями аудитора.

## Вердикт

**PASS — убито 3, не поймано 0.**
