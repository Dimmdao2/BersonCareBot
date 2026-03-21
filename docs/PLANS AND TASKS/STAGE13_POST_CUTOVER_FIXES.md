# Stage 13 — Post-Cutover Fixes

Дата: 2026-03-20.
Контекст: Stage 13 cutover выполнен на production 2026-03-20 15:02. Данные сейчас корректны, но полный аудит кодовой базы выявил ряд проблем, которые необходимо устранить до следующего деплоя.

Связанные документы:
- [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md) — общий план миграции
- [STAGES_1-13_AUDIT_REPORT.md](./STAGES_1-13_AUDIT_REPORT.md) — ревизия этапов 1–13
- [STAGE13_OWNERSHIP_MAP.md](../ARCHITECTURE/STAGE13_OWNERSHIP_MAP.md) — финальная карта владения
- [DATA_MIGRATION_CHECKLIST.md](../../deploy/DATA_MIGRATION_CHECKLIST.md) — чеклист миграции данных

---

## Статус прода (на момент аудита)

| Показатель | Значение |
|-----------|----------|
| Users backfilled | 16 |
| Conversations | 12 |
| Messages | 78 |
| Questions | 10 |
| Question messages | 19 |
| Delivery events | 816 (813 backfill + 3 projection) |
| Appointments | 53 |
| Reconcile drift | 0 missing по всем доменам |
| Projection dead | 0 |
| stage13-gate | OK |

Prod работает корректно. Исправления ниже предотвращают проблемы при повторном запуске, при дрифте данных и при будущих операциях.

---

## Блок A — CRITICAL (исправить до следующего деплоя)

### A1. Delivery events: не идемпотентный backfill

**Файлы:**
- `apps/webapp/migrations/013_delivery_events_idempotency.sql` *(новый)*
- `apps/webapp/scripts/backfill-communication-history.mjs`

**Проблема:**
Таблица `support_delivery_events` не имеет UNIQUE constraint на `integrator_intent_event_id`. INSERT в `backfillDeliveryAttemptLogs()` не содержит `ON CONFLICT`. Повторный запуск backfill создаст полный дубликат всех 813+ записей.

**Шаги:**

1. Создать миграцию `013_delivery_events_idempotency.sql`:
   ```sql
   -- Deduplicate existing delivery events before adding constraint.
   -- Keep the earliest row per integrator_intent_event_id.
   DELETE FROM support_delivery_events a
   USING support_delivery_events b
   WHERE a.integrator_intent_event_id IS NOT NULL
     AND a.integrator_intent_event_id = b.integrator_intent_event_id
     AND a.id > b.id;

   CREATE UNIQUE INDEX IF NOT EXISTS idx_support_delivery_events_integrator_intent_uniq
     ON support_delivery_events (integrator_intent_event_id)
     WHERE integrator_intent_event_id IS NOT NULL;
   ```

2. В `backfill-communication-history.mjs`, функция `backfillDeliveryAttemptLogs()` — заменить INSERT на:
   ```sql
   INSERT INTO support_delivery_events (
     integrator_intent_event_id, correlation_id, channel_code, status, attempt,
     reason, payload_json, occurred_at
   ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
   ON CONFLICT (integrator_intent_event_id)
     WHERE integrator_intent_event_id IS NOT NULL
   DO NOTHING
   ```

3. `pnpm run ci`

**Верификация:** Повторный `--dry-run` на проде после деплоя — число delivery events не должно расти.

---

### A2. identity_id → user_id путаница в backfill conversations

**Файлы:**
- `apps/webapp/scripts/backfill-communication-history.mjs`

**Проблема:**
`conversations.user_identity_id` — это FK на `identities(id)`, а не `users(id)`. Скрипт передаёт его в `resolveWebappPlatformUserId()`, который ищет `platform_users WHERE integrator_user_id = $1` (там хранится `users.id`). Результат:
- `platform_user_id` в `support_conversations` = NULL (если identity_id ≠ user_id)
- `integrator_user_id` в `support_conversations` содержит identity_id, а не user_id

На проде работает по совпадению (identity_id = user_id для текущих данных), но при появлении новых пользователей связь сломается.

**Шаги:**

1. В функции `backfillConversations()` — изменить SELECT, добавив JOIN на identities:
   ```javascript
   const { rows } = await src.query(
     `SELECT c.id, c.source, i.user_id, c.admin_scope, c.status,
             c.opened_at, c.last_message_at, c.closed_at, c.close_reason
      FROM conversations c
      LEFT JOIN identities i ON i.id = c.user_identity_id
      ORDER BY c.opened_at ASC${limitClause}`
   );
   ```

2. Обновить строку 63: `row.user_identity_id` → `row.user_id`:
   ```javascript
   const platformUserId = await resolveWebappPlatformUserId(row.user_id);
   ```

3. Обновить строку 81: параметр `integrator_user_id`:
   ```javascript
   row.user_id ? String(row.user_id) : null,
   ```

4. Аналогично в `backfillQuestions()` (строки 144-177) — JOIN identities для `user_questions.user_identity_id`, хотя questions не хранят integrator_user_id в webapp, убедиться в корректности.

5. `pnpm run ci`

**Верификация:** После деплоя перезапустить backfill `--commit` на проде — ON CONFLICT DO UPDATE обновит `integrator_user_id` и `platform_user_id` до правильных значений. Затем reconcile.

---

### A3. Reconcile person: fieldDrift и extraInWebapp игнорируются

**Файлы:**
- `apps/webapp/scripts/reconcile-person-domain.mjs`

**Проблема:**
Exit code зависит только от `missingInWebappCount`. `fieldDriftCount` и `extraInWebappCount` вычисляются, но не влияют на результат. Можно иметь 100% испорченных телефонов — reconcile пройдёт.

**Шаги:**

1. Заменить блок exit code (строки 218-224):
   ```javascript
   const totalLegacy = report.totalLegacyUsers || 0;
   const missing = report.missingInWebappCount || 0;
   const drift = report.fieldDriftCount || 0;
   const extra = report.extraInWebappCount || 0;
   const mismatchPercent = totalLegacy > 0 ? (100 * missing) / totalLegacy : 0;
   const overThreshold = maxMismatchPercent > 0 && mismatchPercent > maxMismatchPercent;
   const hasMissing = missing > 0;
   const hasDrift = drift > 0;
   const exitCode = overThreshold || hasMissing || hasDrift ? 1 : 0;
   if (hasDrift) console.error(`[reconcile-person-domain] fieldDrift: ${drift} records with mismatched fields`);
   if (extra > 0) console.warn(`[reconcile-person-domain] warning: ${extra} extra records in webapp not in integrator`);
   process.exit(exitCode);
   ```

   Примечание: `extraInWebapp` выводится как warning, но не блокирует (могут быть пользователи, зарегистрированные через webapp напрямую). `fieldDrift` — блокирует.

2. `pnpm run ci`

**Верификация:** На проде текущие данные: `fieldDriftCount=0`, `extraInWebappCount=1` (user 364943522). Reconcile должен пройти (drift=0), но показать warning про extra.

---

### A4. Reconcile subscription-mailing: только COUNT без ID matching

**Файлы:**
- `apps/webapp/scripts/reconcile-subscription-mailing-domain.mjs`

**Проблема:**
Единственный reconcile, использующий только `SELECT COUNT(*)`. Если записи удалены и заменены другими с тем же количеством — reconcile проходит.

**Шаги:**

1. Заменить count-only проверку на ID-set matching:
   ```javascript
   const pairs = [
     {
       name: "mailing_topics",
       srcQuery: "SELECT id FROM mailing_topics",
       srcKey: "id",
       tgtQuery: "SELECT integrator_topic_id FROM mailing_topics_webapp",
       tgtKey: "integrator_topic_id",
     },
     {
       name: "user_subscriptions",
       srcQuery: "SELECT user_id, topic_id FROM user_subscriptions",
       srcKeyFn: (r) => `${r.user_id}:${r.topic_id}`,
       tgtQuery: "SELECT integrator_user_id, integrator_topic_id FROM user_subscriptions_webapp",
       tgtKeyFn: (r) => `${r.integrator_user_id}:${r.integrator_topic_id}`,
     },
     {
       name: "mailing_logs",
       srcQuery: "SELECT user_id, mailing_id FROM mailing_logs",
       srcKeyFn: (r) => `${r.user_id}:${r.mailing_id}`,
       tgtQuery: "SELECT integrator_user_id, integrator_mailing_id FROM mailing_logs_webapp",
       tgtKeyFn: (r) => `${r.integrator_user_id}:${r.integrator_mailing_id}`,
     },
   ];

   for (const p of pairs) {
     const srcRes = await integrator.query(p.srcQuery);
     const tgtRes = await webapp.query(p.tgtQuery);
     const toKey = (rows, keyFn, keyCol) =>
       new Set(rows.map(keyFn ?? ((r) => String(r[keyCol]))));
     const srcSet = toKey(srcRes.rows, p.srcKeyFn, p.srcKey);
     const tgtSet = toKey(tgtRes.rows, p.tgtKeyFn, p.tgtKey);
     const missing = [...srcSet].filter((k) => !tgtSet.has(k));
     const diff = missing.length;
     const pct = srcSet.size > 0 ? (diff / srcSet.size) * 100 : 0;
     const ok = pct <= maxMismatchPercent;
     console.log(`${p.name}: source=${srcSet.size} target=${tgtSet.size} missing=${diff} ${pct.toFixed(1)}% ${ok ? "ok" : "MISMATCH"}`);
     if (!ok) exitCode = 1;
   }
   ```

2. `pnpm run ci`

**Верификация:** На проде source=0 для всех трёх таблиц (mailing не использовался). Reconcile пройдёт.

---

## Блок B — HIGH (исправить до следующего релиза)

### B1. Cutover: reconcile запускается в dry-run-only режиме

**Файлы:**
- `deploy/host/run-stage13-cutover.sh`

**Проблема:**
Строки 92-98 с reconcile и stage13-gate находятся **за пределами** `if [ "${DRY_RUN_ONLY}" -eq 0 ]`. В dry-run режиме reconcile находит все записи "missing" и `set -e` убивает скрипт.

**Шаги:**

1. Обернуть reconcile + gate в условие (заменить строки 91-98):
   ```bash
   if [ "${DRY_RUN_ONLY}" -eq 0 ]; then
     run_step "reconcile-person-domain" pnpm --dir apps/webapp run reconcile-person-domain
     run_step "reconcile-communication-domain" pnpm --dir apps/webapp run reconcile-communication-domain
     run_step "reconcile-reminders-domain" pnpm --dir apps/webapp run reconcile-reminders-domain
     run_step "reconcile-appointments-domain" pnpm --dir apps/webapp run reconcile-appointments-domain
     run_step "reconcile-subscription-mailing-domain" pnpm --dir apps/webapp run reconcile-subscription-mailing-domain

     run_step "stage13-gate" pnpm run stage13-gate
   else
     echo "[$(timestamp)] skipping reconcile + gate (dry-run-only mode)"
   fi
   ```

2. Не требует `pnpm run ci` (shell script).

**Верификация:** `bash deploy/host/run-stage13-cutover.sh --dry-run-only` завершается без ошибок.

---

### B2. projection_outbox: нет UNIQUE на idempotency_key

**Файлы:**
- `apps/integrator/src/infra/db/migrations/core/20260320_0001_outbox_idempotency_key_unique.sql` *(новый)*

**Проблема:**
При retry бизнес-операции (webhook replay) в outbox вставляется дублирующая строка. Webapp idempotency cache отклоняет доставку, но мёртвый вес копится и искажает health метрики.

**Шаги:**

1. Создать миграцию:
   ```sql
   -- Deduplicate before adding constraint.
   DELETE FROM projection_outbox a
   USING projection_outbox b
   WHERE a.idempotency_key = b.idempotency_key
     AND a.id > b.id;

   CREATE UNIQUE INDEX IF NOT EXISTS idx_projection_outbox_idempotency_key
     ON projection_outbox (idempotency_key);
   ```

2. В `enqueueProjectionEvent()` — добавить `ON CONFLICT (idempotency_key) DO NOTHING`, чтобы дубли не вставлялись.

3. `pnpm run ci`

---

### B2a. Projection delivery: `user.upserted` уходит в dead с `idempotency key reused with different payload`

**Файлы:**
- `apps/integrator/src/infra/runtime/worker/projectionWorker.ts`
- `apps/integrator/src/infra/db/writePort.ts`
- `apps/webapp/src/app/api/integrator/events/route.ts`
- `apps/webapp/src/infra/idempotency/*`

**Проблема:**
На production выявлен системный баг доставки projection events: повторная отправка `user.upserted` с тем же `idempotencyKey` может быть отклонена webapp с ошибкой:

```text
idempotency key reused with different payload
```

Типичный кейс:

- ключ идемпотентности строится детерминированно по business payload;
- при повторной доставке body отличается по полям-обёрткам (`occurredAt`, порядок/сериализация, другие transport-level поля);
- webapp idempotency store считает это reuse того же ключа с другим payload и возвращает 409;
- worker после retry переводит event в `dead`, хотя продуктовые данные уже применены.

Результат:

- `projection_outbox` загрязняется ложными `dead` rows;
- `projection-health` краснеет;
- оператору приходится вручную архивировать/закрывать dead rows.

**Шаги:**

1. Зафиксировать один источник истины для idempotency comparison между integrator → webapp:
   - либо сделать request body полностью стабильным для одного `idempotencyKey`;
   - либо исключить transport-only поля из сравнения request hash на стороне webapp;
   - либо включить все меняющиеся поля (например `occurredAt`) в fingerprint/idempotency key.

2. Предпочтительный вариант: для одного и того же projection event повторная доставка должна отправлять **тот же body**, а не только тот же `idempotencyKey`.
   - Проверить, какие поля в body меняются между retry;
   - устранить генерацию нового значения для retry одного и того же business event.

3. Добавить тест/тесты на повторную доставку:
   - `user.upserted` с тем же `idempotencyKey` и тем же body -> accepted/idempotent;
   - retry того же projection event не создаёт `dead` row;
   - `projection-health` не деградирует из-за ложных duplicate delivery conflicts.

4. После фикса очистить/переиграть существующие ложные `dead` rows на dev, затем проверить на prod runbook.

5. `pnpm run ci`

**Верификация:**

- повторная доставка `user.upserted` не уходит в `dead`;
- `projection-health` остаётся зелёным без ручного `UPDATE projection_outbox SET status='done' ...`;
- операторский сценарий `stage13-gate` не требует ручной очистки ложных duplicate conflicts.

---

### B3. backfill-person-domain: --user-id генерирует невалидный SQL

**Файлы:**
- `apps/webapp/scripts/backfill-person-domain.mjs`

**Проблема:**
Строка 90: `"AND u.id = $1"` без `WHERE`. Результат: `FROM users u AND u.id = $1` — syntax error.

**Шаги:**

1. Строка 90 — заменить:
   ```javascript
   const userFilter = filterUserId ? "WHERE u.id = $1" : "";
   ```

2. `pnpm run ci`

---

### B4. backfill-appointments-domain: нет try/finally

**Файлы:**
- `apps/webapp/scripts/backfill-appointments-domain.mjs`

**Проблема:**
При ошибке INSERT соединения не закрываются (src.end() / dst.end() не вызываются).

**Шаги:**

1. Обернуть основной цикл в функции `main()` (строки 48-83):
   ```javascript
   async function main() {
     await src.connect();
     await dst.connect();
     try {
       // ... existing logic ...
     } finally {
       await src.end();
       await dst.end();
     }
     console.log(dryRun ? "[DRY-RUN] Done." : "Done.");
   }
   ```

2. `pnpm run ci`

---

### B5. Reconcile communication: delivery_events — count-only

**Файлы:**
- `apps/webapp/scripts/reconcile-communication-domain.mjs`

**Проблема:**
Строки 125-139: `// Delivery logs: count only (no integrator_id match)`. Тот же риск, что A4.

**Шаги:**

1. После применения миграции A1 (UNIQUE INDEX на `integrator_intent_event_id`), заменить count-only на ID matching:
   ```javascript
   const delSrc = await integratorClient.query(
     "SELECT id FROM delivery_attempt_logs"
   );
   const delTgt = await webappClient.query(
     "SELECT integrator_intent_event_id FROM support_delivery_events WHERE integrator_intent_event_id IS NOT NULL"
   );
   const srcDelIds = new Set(delSrc.rows.map((r) => r.id));
   const tgtDelIds = new Set(delTgt.rows.map((r) => r.integrator_intent_event_id));
   const missingDel = [...srcDelIds].filter((id) => !tgtDelIds.has(id));
   report.delivery_events = {
     sourceCount: srcDelIds.size,
     targetCount: tgtDelIds.size,
     missingInWebappCount: missingDel.length,
     missingInWebappSample: missingDel.slice(0, sampleSize),
   };
   ```

   Зависимость: выполнить **после A1**, иначе `integrator_intent_event_id` может содержать дубли.

2. `pnpm run ci`

---

### B6. dotenv/config отсутствует в 3 backfill-скриптах

**Файлы:**
- `apps/webapp/scripts/backfill-communication-history.mjs`
- `apps/webapp/scripts/backfill-reminders-domain.mjs`
- `apps/webapp/scripts/backfill-appointments-domain.mjs`

**Проблема:**
При запуске вне cutover-скрипта (ручной запуск) .env файлы не загружаются.

**Шаги:**

1. Добавить `import "dotenv/config";` после первого `import` в каждом файле.

2. `pnpm run ci`

---

## Блок C — MEDIUM (tech debt, поправить по ходу)

### C1. Нет transaction safety в backfill-скриптах

**Проблема:** Каждый INSERT — отдельная операция. При ошибке на строке N данные частично записаны. Не критично для скриптов с ON CONFLICT (re-run безопасен), но опасно для delivery events до исправления A1.

**Действие:** После A1 это становится low-priority. При рефакторинге — обернуть batch INSERT в `BEGIN/COMMIT` блоки по 1000 строк.

---

### C2. Cutover: env-переменные перезатираются

**Проблема:** Второй `source "${WEBAPP_ENV_FILE}"` перезаписывает общие переменные из `api.prod` (`NODE_ENV`, `LOG_LEVEL`).

**Действие:** После загрузки webapp env — явно re-export только нужные переменные:
```bash
export DATABASE_URL="${WEBAPP_DB_URL}"
export INTEGRATOR_DATABASE_URL="${API_DB_URL}"
export NODE_ENV=production
```

---

### C3. Нет timeout на gate-скриптах

**Проблема:** Если reconcile или projection-health зависнет, gate висит бесконечно.

**Действие:** Добавить `timeout 120` перед `pnpm` вызовами в `run_step` или AbortSignal в JS gate-скриптах.

---

### C4. Projection worker последователен с job queue

**Проблема:** Tick проекции запускается только после обработки всех jobs. При высокой нагрузке доставка задерживается.

**Действие:** Выделить projection в отдельный `setInterval` или параллельный `Promise.all`.

---

### C5. Hardcoded message_type = 'text'

**Проблема:** Все conversation messages backfill'ятся как 'text'. Если в integrator есть non-text messages, они будут помечены неверно.

**Действие:** Проверить наличие non-text messages в integrator. Если есть — добавить column `message_type` в source query и маппинг.

---

### C6. Stage12-gate: пустой passthrough

**Проблема:** Запускает stage11-gate и всё. Не добавляет stage12-специфичных проверок.

**Действие:** Либо добавить reconcile-subscription-mailing-domain в stage12, либо задокументировать что stage12 = stage11 by design.

---

### C7. O(n²) lookup в reconcile-person-domain

**Проблема:** `usersRes.rows.find()` в цикле по bindings и topics — O(n²).

**Действие:** Заменить на `Map<userId, integratorUserId>` для O(1) lookup.

---

### C8. Freeze-триггеры без escape hatch

**Проблема:** Триггеры на `mailing_topics` / `user_subscriptions` блокируют ВСЕ записи, включая ручные корректирующие операции.

**Действие:** Добавить проверку session variable:
```sql
IF current_setting('app.stage13_bypass', true) = 'true' THEN RETURN NEW; END IF;
```

---

## Порядок выполнения

```
Фаза 1 (до деплоя):
  A1 → A2 → A3 → A4 → B1 → B3 → B4 → B5 → B6
  └─ pnpm run ci
  └─ git push

Фаза 2 (деплой на прод):
  deploy-prod.sh
  └─ миграция 013 применяется автоматически
  └─ backfill-communication-history --commit  (обновляет integrator_user_id через ON CONFLICT DO UPDATE)
  └─ reconcile по всем доменам

Фаза 3 (backlog, по ходу):
  B2 → B2a → C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8
```

---

## Критерии приёмки

- [x] `pnpm run ci` зелёный *(выполнено 2026-03-20)*
- [x] Повторный запуск `backfill-*` скриптов (--commit) не создаёт дубликатов *(подтверждено на проде 2026-03-20: ON CONFLICT DO NOTHING/UPDATE, reconcile 0 missing)*
- [x] `reconcile-*` скрипты обнаруживают field drift, extra records, ID mismatches *(подтверждено: fieldDrift=0, extra=2 warning)*
- [x] `--dry-run-only` режим cutover-скрипта завершается успешно *(reconcile/gate пропускаются в dry-run)*
- [x] На проде: identity_id → user_id маппинг корректен в support_conversations *(backfill --commit выполнен, ON CONFLICT DO UPDATE обновил данные)*
- [x] Projection health: 0 dead, 0 pending *(22 dead archived — дубли user.upserted для webapp-native users 364943522, 7924656602)*

**Фаза 1 выполнена:** A1, A2, A3, A4, B1, B3, B4, B5, B6.
**Фаза 2 выполнена:** деплой + миграция 013 + backfill --commit + reconcile + stage13-gate OK (2026-03-20 18:24).
**Фаза 3 выполнена в коде:** B2, B2a, C1–C8 (миграции integrator `20260320_*`, stable JSON для projection delivery, batch-транзакции в backfill, таймауты gate/cutover, параллельные loop worker, док stage12, bypass freeze). Деплой на прод и проверки — отдельно по runbook.
