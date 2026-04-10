# Audit — Stage 4 (webapp projection realignment, `integrator_user_id`)

**Дата аудита:** 2026-04-10  
**Follow-up (закрытие GAP §3 дублирования gate UNION):** 2026-04-10 — см. [§8](#8-follow-up-2026-04-10--единый-источник-gate-sql).  
**Источник требований:** [`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md), [`MASTER_PLAN.md`](MASTER_PLAN.md)

**Проверяемые артефакты:**

- SQL: [`sql/realign_webapp_integrator_user_id.sql`](sql/realign_webapp_integrator_user_id.sql), [`sql/preview_webapp_realignment_collisions.sql`](sql/preview_webapp_realignment_collisions.sql), [`sql/diagnostics_webapp_integrator_user_id.sql`](sql/diagnostics_webapp_integrator_user_id.sql), [`sql/README.md`](sql/README.md)
- Job: [`apps/webapp/scripts/realign-webapp-integrator-user-projection.ts`](../../apps/webapp/scripts/realign-webapp-integrator-user-projection.ts)
- Инвариант таблиц: [`apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts`](../../apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts), тест [`webappIntegratorUserProjectionRealignment.test.ts`](../../apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.test.ts)
- Ingestion (read-side projection): [`pgReminderProjection.ts`](../../apps/webapp/src/infra/repos/pgReminderProjection.ts), [`pgSupportCommunication.ts`](../../apps/webapp/src/infra/repos/pgSupportCommunication.ts), [`pgSubscriptionMailingProjection.ts`](../../apps/webapp/src/infra/repos/pgSubscriptionMailingProjection.ts)
- Контекст integrator: канонизация `users.id` в write path — [`STAGE_2_CANONICAL_READ_WRITE_PATH.md`](STAGE_2_CANONICAL_READ_WRITE_PATH.md), dedup подписок/рассылок в merge — [`mergeIntegratorUsers.ts`](../../apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts)

---

## 1) После realignment loser `integrator_user_id` отсутствует в целевых таблицах

### 1.1 Покрытие таблиц

| Таблица | Мутация в `realign_webapp_integrator_user_id.sql` | Строка в gate (`diagnostics_webapp_integrator_user_id.sql`) |
|---------|---------------------------------------------------|-------------------------------------------------------------|
| `user_subscriptions_webapp` | `DELETE` (dedup) + `UPDATE` | да |
| `mailing_logs_webapp` | `DELETE` (dedup) + `UPDATE` | да |
| `reminder_rules` | `UPDATE` | да |
| `reminder_occurrence_history` | `UPDATE` | да |
| `reminder_delivery_events` | `UPDATE` | да |
| `content_access_grants_webapp` | `UPDATE` | да |
| `support_conversations` | `UPDATE` (`IS NOT NULL` на loser) | да |

**Вывод:** набор таблиц в **realign** и **gate** совпадает; для подписок/рассылок перед `UPDATE` выполняется **dedup**, согласованный с integrator `mergeIntegratorUsers` (удаление loser-строк при уже существующей паре у winner по topic / mailing).

### 1.2 Логическое следствие gate

При успешном `COMMIT` транзакции realignment каждая строка с `integrator_user_id::text = loser_id` либо удалена (dedup), либо обновлена на `winner_id`; повторный поиск по `loser_id` даёт **ноль** строк — это ровно то, что проверяет `diagnostics_webapp_integrator_user_id.sql`.

**Вердикт §1:** **PASS** (при условии, что оператор запускает полный скрипт/job до конца и gate выполняется на той же БД webapp).

### 1.3 Оговорка (scope Stage 4)

Gate **не** включает раскомментированный запрос к `platform_users` внизу `diagnostics_webapp_integrator_user_id.sql`. Отсутствие loser на **канонической** строке `platform_users` — отдельный шаг webapp merge / Stage 5 flow ([`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md)). Это **не дефект** gate projection-таблиц, но **GAP для полного «loser нигде в webapp»** без доп. проверки.

---

## 2) Регрессия ingestion (reminders / support / subscriptions)

Аудит статический: поведение кода не менялся в рамках Stage 4; оценивается **совместимость** rekey с существующими upsert-путями.

### 2.1 Reminders + content access (`pgReminderProjection`)

- Идемпотентность по **`integrator_rule_id`**, **`integrator_occurrence_id`**, **`integrator_delivery_log_id`**, **`integrator_grant_id`** — не завязана на значение `integrator_user_id` как на ключ конфликта.
- При `ON CONFLICT (integrator_rule_id) DO UPDATE` поле `integrator_user_id` берётся из **`EXCLUDED`** (payload события). После Stage 2 integrator шлёт **канонический** `users.id` → согласовано с rekey на winner.
- **Риск:** событие с **неканоническим** loser id после integrator merge, но до/вместо Stage 4, снова записало бы loser в колонку; realignment исправляет исторические строки; дальнейшие события с winner не создают дубликат правила из-за того же `integrator_rule_id`.

**Вердикт:** **PASS** при соблюдении контракта Stage 2 на outbox; иначе инцидент лечится повторной проекцией / политикой остановки worker (см. [`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md)).

### 2.2 Support (`pgSupportCommunication`)

- Конфликт по **`integrator_conversation_id`**; `integrator_user_id` и `platform_user_id` обновляются через `COALESCE` с `EXCLUDED` там, где задано в upsert-путях.
- Rekey строки `support_conversations` на winner выравнивает read-side и будущие upsert по тому же `integrator_conversation_id` с каноническим user id.

**Вердикт:** **PASS** (косвенные `support_questions` / `support_question_messages` не хранят `integrator_user_id` — согласовано с [`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md)).

### 2.3 Subscriptions + mailing (`pgSubscriptionMailingProjection`)

- `user_subscriptions_webapp`: `ON CONFLICT (integrator_user_id, integrator_topic_id) DO UPDATE` — rekey + предшествующий dedup устраняют нарушение UNIQUE и оставляют одну строку на (winner, topic).
- `mailing_logs_webapp`: `ON CONFLICT (integrator_user_id, integrator_mailing_id) DO NOTHING` — после dedup + rekey коллизий нет; повторная вставка с тем же mailing id и winner не ломает инвариант.

**Вердикт:** **PASS**.

### 2.4 Сводка по регрессии

| Поток | Вердикт | Замечание |
|-------|---------|-----------|
| Reminders / content access | **PASS** | Ключи — `integrator_*` id; user id в payload должен быть каноническим (Stage 2). |
| Support | **PASS** | Rekey `support_conversations` достаточен для перечисленных ingestion-путей. |
| Subscriptions / mailing | **PASS** | Dedup + rekey зеркалят integrator merge по смыслу UNIQUE. |

---

## 3) SQL gates воспроизводимы

| Критерий | Факт | Вердикт |
|----------|------|---------|
| Единый стиль параметров psql | `\set loser_id '…'`, `\set winner_id '…'` + подстановка `:'loser_id'` / `:'winner_id'` документированы в [`sql/README.md`](sql/README.md) | **PASS** |
| Production подключение | В README ссылка на префикс env из [`SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md) / [`CUTOVER_RUNBOOK.md`](CUTOVER_RUNBOOK.md) (webapp `DATABASE_URL`) | **PASS** |
| Эквивалент job ↔ SQL | `realign-webapp-integrator-user-projection.ts` с `--commit` повторяет порядок: dedup subscriptions/mailing → те же `UPDATE` | **PASS** |
| Дрейф списка таблиц | `WEBAPP_INTEGRATOR_USER_ID_GATE_TABLE_SPECS` задаёт gate UNION; `WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES` + тест проверяют равенство множеств имён; job использует `buildWebappLoserIntegratorUserIdDiagnosticsSqlNodePg()` | **PASS** |
| Полный паритет gate-UNION ↔ job ↔ `.sql` | Единый билдер в [`webappIntegratorUserProjectionRealignment.ts`](../../apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts); `diagnostics_webapp_integrator_user_id.sql` совпадает с `fullDiagnosticsWebappIntegratorUserIdSqlFileContent()` (vitest) | **PASS** |

**Вывод §3:** воспроизводимость для оператора — **PASS**; рассинхрон gate между `.sql` и job **снимается CI-тестом**.

---

## 4) CI evidence

| Проверка | Результат (зафиксировано при аудите) |
|----------|--------------------------------------|
| Полный pipeline из корня | `pnpm install --frozen-lockfile && pnpm run ci` — **exit 0** |
| Integrator tests | **646 passed**, 6 skipped |
| Webapp tests | **1397 passed**, 5 skipped (после follow-up единого gate SQL) |
| Сборки | `apps/integrator` + `apps/webapp` production build — **OK** |
| Audit prod dependencies | `pnpm audit --prod` — **No known vulnerabilities** |

**Воспроизведение:**

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

Журнал репозитория: [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) — запись «2026-04-10 — Stage 4: webapp projection realignment».

**Вердикт §4:** **PASS**.

---

## 5) Сводный вердикт по запросу аудита

| # | Вопрос | Вердикт |
|---|--------|---------|
| 1 | После realignment loser отсутствует в целевых projection-таблицах (gate = 0) | **PASS** |
| 2 | Нет регрессии для ingestion reminders / support / subscriptions (статическая совместимость) | **PASS** (при каноническом user id из integrator, Stage 2) |
| 3 | SQL gates воспроизводимы | **PASS** (единый билдер + тест совпадения файла) |
| 4 | CI evidence есть | **PASS** |

**Общий вердикт Stage 4 (репозиторий):** **PASS** по целевому чеклисту аудита.

---

## 6) MANDATORY FIX INSTRUCTIONS

Ниже — **обязательные действия**, если срабатывает триггер; либо плановый hardening перед расширением схемы/потоков.

### MANDATORY FIX §1 — Gate ≠ 0 после realignment

**Триггер:** `diagnostics_webapp_integrator_user_id.sql` показывает `cnt > 0` для `loser_id` после заявленного успешного realignment.

**Действия:**

1. Убедиться, что `psql` подключён к **webapp** БД (не integrator), с корректным `loser_id` / `winner_id` (те же id, что при merge в integrator).
2. Выполнить `preview_webapp_realignment_collisions.sql` — проверить незакоммиченный сбой транзакции или частичное применение (не должно быть при одном `BEGIN`/`COMMIT` из файла).
3. Повторить `realign_webapp_integrator_user_id.sql` **или** `pnpm realign-webapp-integrator-user -- --winner=… --loser=… --commit` из `apps/webapp` с тем же `DATABASE_URL`.
4. Если счётчик не падает — искать **новые** строки от ingestion (события всё ещё с loser id): проверить integrator canonical path (Stage 2), остановку/политику worker ([`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md)).
5. Зафиксировать вывод gate (все `cnt = 0`) как evidence в тикете.

### MANDATORY FIX §2 — Новая таблица с `integrator_user_id` в webapp

**Триггер:** миграция или фича добавляет projection-таблицу с колонкой `integrator_user_id`, читаемую ingestion или purge.

**Действия:**

1. Добавить запись в **`WEBAPP_INTEGRATOR_USER_ID_GATE_TABLE_SPECS`** в [`webappIntegratorUserProjectionRealignment.ts`](../../apps/webapp/src/infra/ops/webappIntegratorUserProjectionRealignment.ts) (и пересобрать тело `diagnostics_webapp_integrator_user_id.sql` из `fullDiagnosticsWebappIntegratorUserIdSqlFileContent()` **или** вручную синхронизировать файл с билдером так, чтобы vitest «diagnostics_webapp… matches canonical builder» проходил).
2. Добавить в **`realign_webapp_integrator_user_id.sql`** соответствующий `UPDATE` (и при наличии составного UNIQUE с `integrator_user_id` — dedup `DELETE` **перед** `UPDATE`, по аналогии с подписками/рассылками).
3. Обновить **`WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES`** и массив `updates` в **`realign-webapp-integrator-user-projection.ts`** (порядок UPDATE и согласованность имён с gate проверяются тестами).
4. Обновить ожидаемый порядок/список в тесте **`webappIntegratorUserProjectionRealignment.test.ts`** при необходимости и строки в [`sql/README.md`](sql/README.md) / [`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md).
5. Прогнать **`pnpm run ci`**.

### MANDATORY FIX §3 — `platform_users` всё ещё с loser на канонической строке

**Триггер:** gate по projection = 0, но канонический `platform_users` (без alias) всё ещё имеет `integrator_user_id = loser`.

**Действия:**

1. Выполнить политику **webapp platform user merge** / cutover Stage 5 по [`MASTER_PLAN.md`](MASTER_PLAN.md) и [`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md) — это **вне** SQL-файла realignment.
2. При необходимости раскомментировать и запустить диагностический `SELECT` к `platform_users` в конце `diagnostics_webapp_integrator_user_id.sql` и зафиксировать результат.

### MANDATORY FIX §4 — Гонка: ingestion пишет loser между integrator merge и Stage 4

**Триггер:** после integrator merge и до webapp realignment снова появились строки с `integrator_user_id = loser` (новые события/задержка worker).

**Действия:**

1. Операционно: согласовать окно (пауза worker / drain outbox) с [`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md) и Deploy 3 runbook.
2. Повторить realignment + gate; устранить источник неканонического user id на integrator (Stage 2 write path), если события продолжают нести loser.

### MANDATORY FIX §5 — Несоответствие winner/loser при ручном вводе

**Триггер:** ошибка уникальности при `UPDATE` или очевидно неверные затронутые строки.

**Действия:**

1. **Не** коммитить частичные правки; при ошибке внутри транзакции из файла SQL откатится весь блок (при использовании одного `BEGIN`/`COMMIT`).
2. Проверить, что `winner` / `loser` — это именно пара из успешного `mergeIntegratorUsers` (loser имеет `merged_into_user_id = winner` в integrator DB).
3. Перечитать preview: `preview_webapp_realignment_collisions.sql`.

---

## 8) Follow-up 2026-04-10 — единый источник gate SQL

| Тема | Сделано |
|------|---------|
| GAP §3 дублирование UNION | `WEBAPP_INTEGRATOR_USER_ID_GATE_TABLE_SPECS`, `buildWebappLoserIntegratorUserIdGateUnionSql`, `buildWebappLoserIntegratorUserIdDiagnosticsSqlNodePg`; job импортирует билдер вместо встроенной строки `loserCountSql`. |
| Совпадение с `diagnostics_webapp_integrator_user_id.sql` | `fullDiagnosticsWebappIntegratorUserIdSqlFileContent()` + vitest «matches canonical builder»; в каждой ветке UNION явный `AS tbl` и `COUNT(*)::bigint`. |
| Согласованность множеств таблиц | Тест: множество имён из gate specs = множество из `WEBAPP_INTEGRATOR_USER_REALIGNMENT_UPDATE_TABLES`. |

**CI:** `pnpm install --frozen-lockfile && pnpm run ci` — **OK** (integrator **646** passed, webapp **1397** passed, build, `pnpm audit --prod`); журнал — [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) (запись follow-up AUDIT Stage 4).

---

## 7) Ссылки

- Спека этапа: [`STAGE_4_WEBAPP_REALIGNMENT.md`](STAGE_4_WEBAPP_REALIGNMENT.md)
- SQL пакет: [`sql/README.md`](sql/README.md)
- Журнал выполнения: [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md)
