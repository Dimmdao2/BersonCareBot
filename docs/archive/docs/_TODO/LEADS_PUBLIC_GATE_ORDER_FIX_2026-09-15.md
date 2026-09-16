# Л3: порядок гейта публичных дверей — 15.09.2026

## Scope

Исправлена одна причина отказа: вычисление в `DECLARE` до
`app.require_accepted_context(...)` в публичных lead-дверях. Приземлённые
миграции не менялись; новая
`apps/webapp/db/drizzle-migrations/20260915T140000_pre_session_lead_doors_gate_before_compute.sql`
заменяет только тела функций. Прав в миграции нет: декларация
`deploy/postgres/privileges/declaration.ts` не менялась.

## Проверенные двери

Проверены все функции, созданные миграциями Л3 в этом candidate checkout:

| Миграция | Дверь | Было до гейта | Итог |
|---|---|---|---|
| `20260915T120000_public_lead_intake.sql` | `app.list_public_booking_form_fields(text)` | `v_org uuid := app.current_org_id()` | `v_org` объявлен без значения; присваивание после гейта |
| `20260915T120000_public_lead_intake.sql` | `app.create_public_lead(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)` | `v_org uuid := app.current_org_id()` | то же |
| `20260915T130000_the_public_lead_captcha_burns_once.sql` | `app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone)` | `v_now timestamptz := statement_timestamp()` | `v_now` объявлен без значения; присваивание после гейта |
| `20260915T130000_the_public_lead_captcha_burns_once.sql` | `app.public_lead_consume_altcha_challenge(text,uuid,text)` | `v_now timestamptz := statement_timestamp()` | то же |

Л4 в этом checkout не создаёт SQL-функций, поэтому соседних тел для этой
проверки нет.

## Сверка DEV

Все живые DB-прогоны шли через общий замок
`/home/dev/brain/host-orch/run-tests.sh`; изменений в DEV не осталось.

### До исправления

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "set -o pipefail; node deploy/postgres/privileges/generate-cli.mjs --db bcb_webapp_dev --pre-session-gate-verify | sudo -n -u postgres psql -X -d bcb_webapp_dev -v ON_ERROR_STOP=1"
```

Вывод:

```text
ERROR:  pre-session exact gate missing or mismatched: app.public_lead_consume_altcha_challenge(text,uuid,text)
CONTEXT:  PL/pgSQL function inline_code_block line 114 at RAISE
```

### Candidate preflight

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "node deploy/postgres/privileges/generate-cli.mjs --check && bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"
```

Ключевой вывод:

```text
--check: артефакты соответствуют декларации побайтно.
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=224 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

### После исправления — проверка в той же откатываемой транзакции

Четыре тела были исполнены под их real statement owners с
declaration-generated temporary access; затем в **той же транзакции** запущены
`--pre-session-gate-verify` и полный `--port-context-verify`, после чего
транзакция завершилась `ROLLBACK`.

Вывод:

```text
NOTICE:  BCB_PRE_SESSION_GATES_VERIFIED database=bcb_webapp_dev roots=101
DO
SELECT 324
ERROR:  port-context capability catalog closure failed: missing/mutated=3, extra/stale/mutated=0
CONTEXT:  PL/pgSQL function inline_code_block line 9 at RAISE
```

То есть прежний exact-gate отказ устранён: сверка проходит эту дверь и доходит
до независимого незасеянного каталога capability. Число объявленных
capability в текущем candidate — **324**, измерено той же командой
`--port-context-verify` (строка `SELECT 324`); значение `276 из 279` из
постановки не соответствует текущей декларации checkout и не переносилось в
результат без повторного измерения.

## НЕ СДЕЛАНО

- Три `missing/mutated` capability из полного `port-context` closure не исправлялись: это
  отдельный Л4-объём и не следствие порядка гейта.
- Новая миграция на DEV не применялась. Выполнены только rollback-only preflight и
  откатываемая owner-aware проверка.
- Строка вердикта в очередь `feat` не добавлялась; текст для ведущего:
  `Л3 gate-order correction: PASS — pre-session verifier passes 101 roots; candidate preflight rollback-only PASS; port-context closure now reaches independent 3 missing/mutated capabilities.`
