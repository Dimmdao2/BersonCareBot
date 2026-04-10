# Audit — Stage 3 (transactional integrator merge + projection_outbox)

**Дата аудита:** 2026-04-10  
**Follow-up (закрытие FINDING / GAP из §7):** 2026-04-10 — см. [§10](#10-follow-up-2026-04-10--закрытие-finding--gap-stage-3).  
**Источник требований:** [`STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md`](STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md), [`MASTER_PLAN.md`](MASTER_PLAN.md)

**Проверяемые артефакты (код):**

- [`apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts`](../../apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts) — `mergeIntegratorUsers`, `realignProjectionOutboxInTx`
- [`apps/integrator/src/infra/db/repos/projectionOutboxMergePolicy.ts`](../../apps/integrator/src/infra/db/repos/projectionOutboxMergePolicy.ts) — `deepReplaceIntegratorUserIdInValue`, `recomputeProjectionIdempotencyKeyAfterMerge`
- Транзакционный контур: [`apps/integrator/src/infra/db/client.ts`](../../apps/integrator/src/infra/db/client.ts) — `DbPort.tx` (`BEGIN` / `COMMIT` / `ROLLBACK`)

---

## 1) Merge транзакционный и идемпотентный

### 1.1 Транзакционность

| Критерий | Факт в коде | Вердикт |
|----------|-------------|---------|
| Все мутации в одной транзакции | Вся логика после валидации выполняется внутри `return db.tx(async (tx) => { ... })`; финальный `UPDATE users … merged_into_user_id` и realign outbox — в том же callback. | **PASS** |
| Откат при ошибке | `createDbPort().tx` при исключении выполняет `ROLLBACK` и пробрасывает ошибку ([`client.ts`](../../apps/integrator/src/infra/db/client.ts)). | **PASS** |
| Dry-run | `dryRun: true` возвращает результат **до** любых `UPDATE`/`DELETE` доменных таблиц и outbox; транзакция при этом **коммитится** (фактически no-op мутаций). Семантика явно задокументирована в JSDoc `mergeIntegratorUsers` и в [`STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md`](STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md) — не «ROLLBACK preview». | **PASS** |

**Вывод §1.1:** merge **транзакционный** в смысле ACID одной БД-операции `tx`: либо все шаги коммитятся, либо откат без частичного применения доменных правок.

### 1.2 Идемпотентность

| Сценарий | Поведение | Вердикт |
|----------|-----------|---------|
| Повтор после **сбоя до COMMIT** | Повторный вызов с теми же `(winner, loser)` снова проходит валидацию и выполняет merge с чистого состояния. | **PASS** (at-least-once safe retry) |
| Повтор после **успешного COMMIT** (тот же winner/loser) | Если `loser.merged_into_user_id` указывает на `winner` — возврат успеха с `alreadyMerged: true`, нулевые счётчики (идемпотентный no-op). Если loser — alias **другого** пользователя — `ALREADY_MERGED_ALIAS`. | **PASS** (после follow-up §10) |
| Повтор с **переставленными** winner/loser | Иной смысл операции; возможны отказы по бизнес-инвариантам (alias, отсутствие строк и т.д.) — ожидаемо. | **N/A** |

**Вывод §1.2:** реализованы **крэш-безопасный retry** и **идемпотентный успех** при повторе того же merge после успеха (ветка `alreadyMerged`).

---

## 2) Порядок блокировок и deadlock

| Критерий | Факт в коде | Вердикт |
|----------|-------------|---------|
| Детерминированный порядок lock на `users` | Первый SQL в tx: `SELECT id FROM users WHERE id IN ($1,$2) ORDER BY id ASC FOR UPDATE` — PostgreSQL блокирует строки в порядке возрастания `id`, независимо от того, кто передан первым аргументом (`winner` или `loser`). | **PASS** |
| Два concurrent merge разных пар | Оба сначала берут lock на меньший `id` из своей пары — классический приём снижения risk deadlock на паре строк `users`. | **PASS** (для вызовов **только** через эту функцию) |
| Иные кодовые пути | Другие части integrator **не обязаны** брать lock на двух `users` в том же порядке; если позже появится второй путь с `FOR UPDATE` двух пользователей в ином порядке — теоретический cross-path deadlock. | **GAP (мониторинг)** — вне объёма одного файла; зафиксировать в конвенциях при добавлении multi-user locks |

**Вывод §2:** для **самого** `mergeIntegratorUsers` порядок **не deadlock-prone** относительно второго такого же merge. Риск остаётся только при **будущих** альтернативных путях блокировки тех же строк.

---

## 3) Outbox rewrite и UNIQUE(`idempotency_key`)

| Критерий | Факт в коде | Вердикт |
|----------|-------------|---------|
| Обновление ключа без нарушения UNIQUE | Перед `UPDATE … SET idempotency_key = $newKey` выполняется `SELECT … WHERE idempotency_key = $newKey AND id <> $currentId`. Если строка найдена — ключ **не** меняют; текущая строка переводится в `cancelled` с `last_error`. | **PASS** |
| Два pending-row в одной транзакции → один новый ключ | Обработка `ORDER BY id::bigint ASC`: первая строка занимает `newKey`, вторая при проверке видит коллизию и уходит в **dedup/cancelled**. | **PASS** |
| Ключ не меняется | Ветка `newKey === row.idempotency_key` — только `UPDATE payload`, UNIQUE не затрагивается. | **PASS** |
| Гонка вне транзакции | Все проверки и `UPDATE` outbox выполняются в **той же** `db.tx`, что и merge. | **PASS** |

**Вывод §3:** при соблюдении текущей логики **duplicate `idempotency_key` из-за rewrite в одном merge** не создаётся.

---

## 4) Поведение при коллизиях (явность)

| Класс коллизии | Политика в коде | Достаточно явно для оператора/логов? |
|----------------|-----------------|--------------------------------------|
| Одинаковый `(resource, external_id)` в `identities` (loser vs winner) | Repoint `telegram_state` / `message_drafts` / открытых дубликатов `conversations` (partial unique), `user_questions`, затем `DELETE` loser `identity`. | **PASS** (детерминированный порядок SQL) |
| `contacts` `(type, value_normalized)` | `DELETE` строк loser, конфликтующих с winner; затем `UPDATE user_id` остальных. | **PASS** |
| `user_reminder_rules` `(user_id, category)` | Аналогично: `DELETE` дубликаты loser, затем `UPDATE`. | **PASS** |
| `user_subscriptions` / `mailing_logs` (составной PK с `user_id`) | `DELETE` дубликаты loser; затем `UPDATE`. | **PASS** |
| Outbox: новый idempotency key уже существует | `status = 'cancelled'`, `last_error = 'merge:user deduped (winner idempotency_key already present)'`. | **PASS** (фиксированная строка + счётчик `projectionOutboxDedupedCancelled` в результате и `logger.info`) |
| Winner или loser — alias до merge | `MergeIntegratorUsersError` `ALREADY_MERGED_ALIAS` с текстом сообщения. | **PASS** |

**Оговорка (scope Stage 3):** строки outbox со статусом **`done`** / **`dead`** с устаревшим `integratorUserId` loser **не** переписываются этим merge — это согласовано с разделением на Stage 4 (webapp realignment), см. [`STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md`](STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md).

**Вывод §4:** коллизии домена и outbox **определены однозначно**; для outbox-dedup есть стабильный маркер в `last_error` и метрики в результате функции.

---

## 5) Прочие замечания (не блокеры PASS по чеклисту)

- **Статус `cancelled` в outbox:** `claimDueProjectionEvents` выбирает только `status = 'pending'` — отменённые строки не обрабатываются воркером. **`getProjectionHealth` / `projection-health.mjs`** возвращают отдельный **`cancelledCount`** (не смешивается с `dead` в семантике gate).
- **Статус `processing`:** realign outbox в merge обрабатывает **только `pending`**, чтобы не переписывать строку параллельно с воркером; оставшиеся после drain `pending` можно догнать повторным merge или отдельным repair (см. STAGE_3).
- **Выборка outbox:** явные пути JSON + консервативный `payload::text LIKE '%"integratorUserId":"'<id>'"%'` (и зеркально для `integrator_user_id`) для вложенных строковых id. Числовые JSON-значения без кавычек и экзотические ключи по-прежнему вне гарантии — см. §8 §3 при расширении write path.

---

## 6) CI evidence

| Проверка | Результат (зафиксировано в репозитории) |
|----------|----------------------------------------|
| Полный pipeline из корня | `pnpm run ci` — **exit 0** |
| Integrator tests | **646 passed**, 6 skipped (после follow-up §10; см. [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md)) |
| Webapp tests | **1397 passed**, 5 skipped (монорепо; актуально на момент закрытия хвостов docs Stage 3/4) |
| Сборки | `apps/integrator` + `apps/webapp` production build — **OK** |
| Audit prod dependencies | `pnpm audit --prod` — **No known vulnerabilities** (в конце `pnpm run ci`) |

**Воспроизведение:**

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

Журнал: [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) — запись «2026-04-10 — Stage 3: transactional integrator merge + projection_outbox realignment».

---

## 7) Сводный вердикт по запросу аудита

| # | Вопрос | Вердикт |
|---|--------|---------|
| 1 | Merge транзакционный и идемпотентный | **PASS** (транзакция + `alreadyMerged` при повторе того же merge после успеха). |
| 2 | Нет deadlock-prone порядка для merge | **PASS** (детерминированный `ORDER BY id ASC FOR UPDATE` на `users`). |
| 3 | Outbox rewrite не создаёт duplicate `idempotency_key` | **PASS** (проверка + ветка `cancelled`). |
| 4 | Поведение при коллизиях clearly defined | **PASS** (см. §4; исторические `done` — вне scope). |
| 5 | CI evidence есть | **PASS** (§6 + execution log). |

**Общий вердикт Stage 3 (репозиторий) после follow-up §10:** **PASS** по целевому чеклисту аудита.

---

## 10) Follow-up 2026-04-10 — закрытие FINDING / GAP Stage 3

| MANDATORY / тема | Сделано |
|------------------|---------|
| §1 Идемпотентность | `mergeIntegratorUsers`: если `loser.merged_into_user_id === winner` → `alreadyMerged: true`, нулевые счётчики; иной alias → `ALREADY_MERGED_ALIAS`. Тесты в `mergeIntegratorUsers.test.ts`. |
| §2 `cancelled` в мониторинге | `cancelledCount` в [`projectionHealth.ts`](../../apps/integrator/src/infra/db/repos/projectionHealth.ts) и [`projection-health.mjs`](../../apps/integrator/scripts/projection-health.mjs); не входит в `isProjectionHealthDegraded`. Пункты в [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) Deploy 3 и [`CHECKLISTS.md`](CHECKLISTS.md) Deploy 3. |
| §3 Покрытие outbox | Доп. фильтр `payload::text LIKE …` для строковых `"integratorUserId"` / `"integrator_user_id"` в глубине JSON (осторожно: только quoted, см. §5). |
| §4 Гонка `processing` | Realign только `status = 'pending'`; `processing` не трогаем. |
| §5 Dry-run | JSDoc на `mergeIntegratorUsers` + раздел в [`STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md`](STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md). |

**CI:** актуальные числа тестов — в [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) (записи Stage 3 / follow-up / синхронизация §6 с монорепо).

---

## 8) MANDATORY FIX INSTRUCTIONS

Инструкции ниже — **обязательные к выполнению**, если соответствующий триггер срабатывает в проде/при приёмке; либо как **плановый hardening** до расширения операторского merge. Первые пять параграфов (§1–§5) закрыты в репозитории — см. [§10](#10-follow-up-2026-04-10--закрытие-finding--gap-stage-3); текст ниже сохранён как чеклист при будущих изменениях write path / merge.

### MANDATORY FIX §1 — Строгая идемпотентность `mergeIntegratorUsers` (опционально по продукту)

**Триггер:** оператор/API должен безопасно повторять тот же merge (тот же `winnerId`, `loserId`) и получать **успех без изменений**, если merge уже выполнен.

**Действия:**

1. В начале tx после чтения строк `users`: если `loser.merged_into_user_id` указывает на `winner.id` (с учётом типов bigint/text), **вернуть** `MergeIntegratorUsersResult` с нулевыми счётчиками и флагом вроде `alreadyMerged: true` вместо `ALREADY_MERGED_ALIAS`.
2. Явно задокументировать в JSDoc и в [`STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md`](STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md), что повторный вызов идемпотентен.
3. Добавить unit-тест: второй вызов с теми же id после успешного первого (мок БД или интеграционный тест) → ожидаемый no-op успех.

**Если продукт сознательно запрещает повтор:** оставить текущее поведение, но **обязательно** описать в operator runbook: «повтор merge после успеха → ошибка `ALREADY_MERGED_ALIAS`».

### MANDATORY FIX §2 — Мониторинг и учёт `projection_outbox.status = 'cancelled'`

**Триггер:** после merge в отчётах/алертах по outbox появляются строки `cancelled` с `last_error` prefix `merge:user deduped`.

**Действия:**

1. Обновить projection health / ops-скрипты (например [`apps/integrator/scripts/projection-health.mjs`](../../apps/integrator/scripts/projection-health.mjs) и связанные SQL), чтобы **явно** показывать счётчик `cancelled` и не смешивать его с `dead` без пояснения.
2. В [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) или CHECKLISTS добавить пункт: «после integrator merge проверить, что рост `cancelled` ожидаем и drain pending стабилен».

### MANDATORY FIX §3 — Расширение покрытия outbox rewrite (при новых типах payload)

**Триггер:** новый `event_type` или новое место в JSON, где фигурирует integrator `users.id`, **вне** путей:

- `payload->>'integratorUserId'`
- `payload #>> '{payloadJson,integratorUserId}'`
- `payload #>> '{payloadJson,integrator_user_id}'`

**Действия:**

1. Добавить условие в `SELECT` внутри `realignProjectionOutboxInTx` **или** общий безопасный фильтр (например jsonpath), согласованный с `writePort`.
2. Добавить ветку в `recomputeProjectionIdempotencyKeyAfterMerge`, зеркально `writePort`.
3. Тест на новый тип события.

### MANDATORY FIX §4 — Гонка merge vs projection worker (`processing`)

**Триггер:** инцидент «событие ушло в webapp со старым user id» или дубликат логического события при merge в окне обработки.

**Действия:**

1. Операционно: выполнять merge в окне с остановленным/заглушённым worker или после drain очереди (документировать).
2. Кодово (если требуется): перед realign брать advisory lock на пару `(winner, loser)` или пропускать строки `processing` с политикой «отложенный repair»; либо переводить `processing` в `pending` только под согласованной политикой с воркером.

### MANDATORY FIX §5 — Документация dry-run

**Триггер:** оператор ожидает, что `dryRun` откатывает транзакцию.

**Действия:** в JSDoc `mergeIntegratorUsers` и в Stage 3 doc явно указать: **dry-run коммитит пустую транзакцию** (нет DDL/DML домена), блокировки удерживаются до commit. При необходимости реализовать «настоящий ROLLBACK preview» через отдельный порт/флаг, если продукт требует.

---

## 9) Ссылки

- Реализация: [`mergeIntegratorUsers.ts`](../../apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts), [`projectionOutboxMergePolicy.ts`](../../apps/integrator/src/infra/db/repos/projectionOutboxMergePolicy.ts)
- Спека этапа: [`STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md`](STAGE_3_TRANSACTIONAL_MERGE_AND_OUTBOX.md)
- Журнал выполнения: [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md)
