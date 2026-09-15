# PASS — owner-секции восстановлены, гейт первый, rollback-only preflight и живое поведение проходят

Проверен точный committed candidate `ec17206a0d2672b1fce25e058c1b7601cf40095d`
поверх `a440910ba`. Оракул —
`docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, «Очередь до цели», Л3,
лестница финиша и brief третьего аудита. Предыдущий FAIL `3124d27e8` использован как описание
устранённого дефекта, не как доказательство текущего результата.

Фактическое состояние выданного клона расходилось с названием ветки в brief: команда
`git branch --show-current` вернула `wt/altcha-gate-order`, а локальная
`wt/comms-visibility` указывала на старый `808254406`. Candidate находится в первой ветке. Для
проверок checkout временно переводился ровно на `ec17206a0`; после проб возвращён на фактическую
audit-ветку. Product-код кандидата не менялся.

Метод по `AGENTS.md` §24.4 — **ТЕСТ**: официальный owner-aware preflight и живой откатываемый
DB-harness на именованной DEV. Harness брал тела прямо из migration, разбирал их штатным
`parseOwnerStatements`, применял каждый блок под его owner, засевал declaration-derived target
access/capabilities, вызывал двери под runtime-ролями и завершал `ROLLBACK`. Одноразовый файл после
проверок удалён; постоянный тест SQL и автоматический UI-тест не создавались (§10a).

## Вердикт

**PASS, MUST FIX 0.** Candidate устраняет единственный finding прошлого круга:
`parseOwnerStatements` видит четыре независимых блока; каждый блок исполняется под владельцем той
же функции в приземлённых `T120000`/`T130000`. Preflight проходит с заявленными
`pending=1 total=224 unapplied=0` и явным `ROLLBACK`. Все четыре тела отличаются от приземлённых
ровно переносом одного присваивания за exact gate. Инъекция обратного переноса в `DECLARE`
поймана живым verifier.

## Owner-секции: candidate совпадает с приземлёнными миграциями

Команда:

```bash
node --experimental-strip-types --input-type=module - <<'NODE'
import fs from 'node:fs';
import { parseOwnerStatements } from './deploy/postgres/privileges/migrate-local-parse.mjs';
for (const file of [
  'apps/webapp/db/drizzle-migrations/20260915T120000_public_lead_intake.sql',
  'apps/webapp/db/drizzle-migrations/20260915T130000_the_public_lead_captcha_burns_once.sql',
  'apps/webapp/db/drizzle-migrations/20260915T141000_pre_session_lead_doors_gate_before_compute.sql',
]) {
  for (const block of parseOwnerStatements(fs.readFileSync(file, 'utf8'), file)) {
    const names = [...block.sql.matchAll(/CREATE OR REPLACE FUNCTION\s+app\.([^\s(]+)/g)]
      .map((match) => match[1]);
    for (const name of names) {
      if (['list_public_booking_form_fields','create_public_lead',
        'public_lead_issue_altcha_challenge','public_lead_consume_altcha_challenge'].includes(name)) {
        console.log(`${file.split('/').at(-1)}|${name}|${block.owner}`);
      }
    }
  }
}
NODE
```

Вывод дословно:

```text
20260915T120000_public_lead_intake.sql|list_public_booking_form_fields|app_seam_public_booking_owner
20260915T120000_public_lead_intake.sql|create_public_lead|app_seam_public_booking_owner
20260915T130000_the_public_lead_captcha_burns_once.sql|public_lead_issue_altcha_challenge|app_seam_password_auth_owner
20260915T130000_the_public_lead_captcha_burns_once.sql|public_lead_consume_altcha_challenge|app_seam_password_auth_owner
20260915T141000_pre_session_lead_doors_gate_before_compute.sql|list_public_booking_form_fields|app_seam_public_booking_owner
20260915T141000_pre_session_lead_doors_gate_before_compute.sql|create_public_lead|app_seam_public_booking_owner
20260915T141000_pre_session_lead_doors_gate_before_compute.sql|public_lead_issue_altcha_challenge|app_seam_password_auth_owner
20260915T141000_pre_session_lead_doors_gate_before_compute.sql|public_lead_consume_altcha_challenge|app_seam_password_auth_owner
```

Отдельный разбор только candidate:

```bash
node --experimental-strip-types --input-type=module - <<'NODE'
import fs from 'node:fs';
import { parseOwnerStatements } from './deploy/postgres/privileges/migrate-local-parse.mjs';
const file = 'apps/webapp/db/drizzle-migrations/20260915T141000_pre_session_lead_doors_gate_before_compute.sql';
const blocks = parseOwnerStatements(fs.readFileSync(file, 'utf8'), file);
console.log(`parsed_blocks=${blocks.length}`);
for (const [index, block] of blocks.entries()) {
  const names = [...block.sql.matchAll(/CREATE OR REPLACE FUNCTION\s+app\.([^\s(]+)/g)]
    .map((match) => match[1]);
  console.log(`block=${index + 1} owner=${block.owner} functions=${names.join(',')}`);
}
NODE
```

Вывод дословно:

```text
parsed_blocks=4
block=1 owner=app_seam_public_booking_owner functions=list_public_booking_form_fields
block=2 owner=app_seam_public_booking_owner functions=create_public_lead
block=3 owner=app_seam_password_auth_owner functions=public_lead_issue_altcha_challenge
block=4 owner=app_seam_password_auth_owner functions=public_lead_consume_altcha_challenge
```

Итого: две двери заявки принадлежат `app_seam_public_booking_owner`; две двери captcha —
`app_seam_password_auth_owner`. Это совпадает и с приземлёнными телами, и с
`deploy/postgres/privileges/declaration.ts`.

## Построчный diff четырёх функций

Полная команда: `extract_function` на `awk`, затем `diff -u`; число изменённых строк измерено тем
же diff:

```bash
set -u
source_file_l3a='apps/webapp/db/drizzle-migrations/20260915T120000_public_lead_intake.sql'
source_file_l3b='apps/webapp/db/drizzle-migrations/20260915T130000_the_public_lead_captcha_burns_once.sql'
replacement='apps/webapp/db/drizzle-migrations/20260915T141000_pre_session_lead_doors_gate_before_compute.sql'
extract_function() {
  local file="$1"
  local name="$2"
  awk -v needle="CREATE OR REPLACE FUNCTION app.${name}" '
    index($0, needle) { printing=1 }
    printing { print }
    printing && /END \$\$;/ { exit }
  ' "$file"
}
for spec in \
  "$source_file_l3a:list_public_booking_form_fields" \
  "$source_file_l3a:create_public_lead" \
  "$source_file_l3b:public_lead_issue_altcha_challenge" \
  "$source_file_l3b:public_lead_consume_altcha_challenge"
do
  file=${spec%%:*}
  name=${spec#*:}
  diff -u <(extract_function "$file" "$name") <(extract_function "$replacement" "$name") \
    | awk -v name="$name" 'BEGIN{a=0;d=0} /^---|^\+\+\+/{next} /^-/{d++} /^\+/{a++} \
      END{printf "%s added=%d deleted=%d changed=%d\n",name,a,d,a+d}'
done
```

Вывод дословно:

```text
list_public_booking_form_fields added=2 deleted=1 changed=3
create_public_lead added=2 deleted=1 changed=3
public_lead_issue_altcha_challenge added=2 deleted=1 changed=3
public_lead_consume_altcha_challenge added=2 deleted=1 changed=3
```

То есть на функцию изменены три diff-строки (`+2/-1`): старая строка объявления с
инициализатором удалена, объявление без вычисления добавлено, то же присваивание добавлено сразу
после exact gate. Полный diff каждой функции:

```diff
@@ list_public_booking_form_fields
-DECLARE v_org uuid := app.current_org_id(); v_fields jsonb;
+DECLARE v_org uuid; v_fields jsonb;
 BEGIN
   PERFORM app.require_accepted_context(...);
+  v_org := app.current_org_id();

@@ create_public_lead
-DECLARE v_org uuid := app.current_org_id(); v_lead public.leads%ROWTYPE;
+DECLARE v_org uuid; v_lead public.leads%ROWTYPE;
 BEGIN
   PERFORM app.require_accepted_context(...);
+  v_org := app.current_org_id();

@@ public_lead_issue_altcha_challenge
 DECLARE
-  v_now timestamptz := statement_timestamp();
+  v_now timestamptz;
   v_live_count integer;
 BEGIN
   PERFORM app.require_accepted_context(...);
+  v_now := statement_timestamp();

@@ public_lead_consume_altcha_challenge
 DECLARE
-  v_now timestamptz := statement_timestamp();
+  v_now timestamptz;
   v_challenge public.password_altcha_challenges%ROWTYPE;
 BEGIN
   PERFORM app.require_accepted_context(...);
+  v_now := statement_timestamp();
```

Других строк внутри четырёх функций diff не содержит.

## Owner-aware rollback-only preflight

Источник команды — `AGENTS.md` §1 «Миграции schema B» и
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md` §6.5: candidate source остаётся в текущем
checkout, а DEV runtime env берётся разрешённым `--runtime-env-root` из основного дерева.

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "node deploy/postgres/privileges/generate-cli.mjs --check && bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"
```

Итоговый вывод preflight дословно:

```text
--check: артефакты соответствуют декларации побайтно.
BEGIN
GRANT
GRANT ROLE
GRANT ROLE
GRANT
GRANT
GRANT
GRANT
SET
SET
   session_user   |         current_user          | can_create_public
------------------+-------------------------------+-------------------
 bcb_dev_migrator | app_seam_public_booking_owner | f
(1 row)

CREATE FUNCTION
RESET
SET
   session_user   |         current_user          | can_create_public
------------------+-------------------------------+-------------------
 bcb_dev_migrator | app_seam_public_booking_owner | f
(1 row)

CREATE FUNCTION
RESET
SET
   session_user   |         current_user         | can_create_public
------------------+------------------------------+-------------------
 bcb_dev_migrator | app_seam_password_auth_owner | f
(1 row)

CREATE FUNCTION
RESET
SET
   session_user   |         current_user         | can_create_public
------------------+------------------------------+-------------------
 bcb_dev_migrator | app_seam_password_auth_owner | f
(1 row)

CREATE FUNCTION
RESET
RESET
INSERT 0 1
SET
RESET
REVOKE
REVOKE
REVOKE
REVOKE
REVOKE
REVOKE ROLE
REVOKE ROLE
DO
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=224 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
[2026-09-15T08:27:17+03:00] pid=2366396 RELEASED test lock (rc=0, 3s)
```

Полный `--check` перед этим фрагментом также напечатал `ok` для шести generated privilege/
allowlist-артефактов трёх сред. Миграция в ledger не записана: preflight завершился `ROLLBACK`.

## Гейт действительно первый — live `pg_proc`, поведение и права

Команда одноразового harness через обязательный замок:

```bash
/home/dev/brain/host-orch/run-tests.sh "node .audit-leads-gate-round3.mjs"
```

Итоговый вывод дословно:

```text
behavior|bucket_1=t,bucket_2=t,bucket_3=t,bucket_4=f,captcha_consume_1=t,captcha_consume_2=f,lead_create=t,lead_rows=1,tenant_org_match=t,foreign_org_rows=0
gate_order_1|app.create_public_lead(uuid,text,text,text,text,text,text,text,text,timestamp with time zone),gate_pos=59,assignment_pos=999,assignment_after_gate=t
gate_order_2|app.list_public_booking_form_fields(text),gate_pos=46,assignment_pos=382,assignment_after_gate=t
gate_order_3|app.public_lead_consume_altcha_challenge(text,uuid,text),gate_pos=96,assignment_pos=561,assignment_after_gate=t
gate_order_4|app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone),gate_pos=63,assignment_pos=624,assignment_after_gate=t
owners|app.create_public_lead(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)=app_seam_public_booking_owner,app.list_public_booking_form_fields(text)=app_seam_public_booking_owner,app.public_lead_consume_altcha_challenge(text,uuid,text)=app_seam_password_auth_owner,app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone)=app_seam_password_auth_owner
rights|lead_select_columns=19,lead_insert_columns=12,captcha_select=t,captcha_insert=6,captcha_update=6
ROLLBACK
[2026-09-15T08:36:53+03:00] pid=2376845 RELEASED test lock (rc=0, 55s)
```

`gate_pos` и `assignment_pos` получены из реально созданных candidate-тел в `pg_proc.prosrc`, а не
из текста migration. У всех четырёх дверей `assignment_after_gate=t`: вычисление организации и
времени идёт после `app.require_accepted_context`.

Наблюдаемое поведение не изменилось:

- captcha issue: три живых задачки разрешены, четвёртая отказана (`t,t,t,f`);
- captcha consume: первый вызов разрешён, повторный отказан (`t,f`);
- заявка создана ровно одна; её `organizationId` совпал с принятой организацией, строк в другой
  организации с audit-message нет;
- оба семейства владельцев смогли исполнить тела с declaration-derived правами: для `leads`
  предъявлены `19` SELECT-колонок и `12` INSERT-колонок; captcha-owner имеет table SELECT и по
  `6` INSERT/UPDATE-колонок.

Черновые итерации одноразового fixture до итогового `rc=0` падали только внутри fixture
(не засеянная capability, повторный seed временной relation, `NULL` в обязательном
`platform_user_id`, формат `t/f` вместо `true/false`). Каждая открытая транзакция была откатана при
закрытии psql-соединения; итоговый прогон завершён явным `ROLLBACK`, а финальная проверка чистоты
ниже дала нули.

## Инъекция порядка гейта

В `public_lead_issue_altcha_challenge` временно возвращено исходное вычисление
`v_now timestamptz := statement_timestamp()` в `DECLARE`, а post-gate присваивание удалено. После
пробы migration побайтно возвращена к `ec17206a0`; это проверено командой:

```bash
git diff --exit-code ec17206a0 -- apps/webapp/db/drizzle-migrations/20260915T141000_pre_session_lead_doors_gate_before_compute.sql
```

Вывод пустой, exit `0`.

| Инъекция | Живой детектор | Результат |
|---|---|---|
| `public_lead_issue_altcha_challenge`: `statement_timestamp()` снова в `DECLARE` до exact gate | candidate-тело ставится в DEV-транзакции под `app_seam_password_auth_owner`, затем declaration-generated `--pre-session-gate-verify` читает живой `pg_proc` | УБИТА: exact function identity названа в ошибке; `ROLLBACK`, host-lock `rc=0` |

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "PROBE_MODE=injection node .audit-leads-gate-round3.mjs"
```

Вывод дословно:

```text
ROLLBACK
psql:<stdin>:265: ERROR:  pre-session exact gate missing or mismatched: app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone)
CONTEXT:  PL/pgSQL function inline_code_block line 114 at RAISE
[2026-09-15T08:37:19+03:00] pid=2378633 RELEASED test lock (rc=0, 1s)
```

Итого по этой обязательной таблице: одна инъекция, одна убита, непойманных нет.

## Права не переехали в migration

Команда точной проверки candidate migration:

```bash
rg -n "\b(GRANT|REVOKE|CREATE[[:space:]]+ROLE|ALTER[[:space:]]+ROLE|ALTER[[:space:]]+DEFAULT[[:space:]]+PRIVILEGES|CREATE[[:space:]]+POLICY)\b" \
  apps/webapp/db/drizzle-migrations/20260915T141000_pre_session_lead_doors_gate_before_compute.sql
```

Вывод пустой. Объявления четырёх функций и их relation surfaces находятся только в
`deploy/postgres/privileges/declaration.ts`; `node deploy/postgres/privileges/generate-cli.mjs
--check` в preflight подтвердил generated-артефакты побайтно. Candidate не меняет декларацию.

## Migration-order и чистота DEV

Команда через host-lock:

```bash
/home/dev/brain/host-orch/run-tests.sh "bash apps/webapp/scripts/check-drizzle-migration-order.sh && sudo -n -u postgres psql -X -A -t -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c \"SELECT 'cleanup|leads=' || (SELECT count(*) FROM public.leads WHERE message_text='gate-order-proof-round3-ec17206a0') || ',captcha=' || (SELECT count(*) FROM public.password_altcha_challenges WHERE identifier_key='lead-email:v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc') || ',ledger=' || (SELECT count(*) FROM drizzle.__drizzle_migrations WHERE tag='20260915T141000_pre_session_lead_doors_gate_before_compute');\""
```

Вывод дословно:

```text
run-webapp-drizzle-migrate transaction-safe migration layout check: OK
check-drizzle-migration-order: OK
cleanup|leads=0,captcha=0,ledger=0
[2026-09-15T08:37:51+03:00] pid=2379804 RELEASED test lock (rc=0, 0s)
```

DEV после всех прогонов чиста: audit-leads `0`, audit-captcha `0`, candidate ledger `0`.

## Разбор прав по §1

| Функции | Statement owner / runtime | Права тела | Результат |
|---|---|---|---|
| `list_public_booking_form_fields`, `create_public_lead` | `app_seam_public_booking_owner` / `app_tenant_service` | `SELECT` формы/public directory; `INSERT` и полный `SELECT` `leads` для `RETURNING *` | Объявлено в declaration; живой вызов создал одну tenant-bound заявку |
| `public_lead_issue_altcha_challenge`, `public_lead_consume_altcha_challenge` | `app_seam_password_auth_owner` / `app_pre_session` | `SELECT`+`INSERT`; table `SELECT` для `FOR UPDATE`; column `UPDATE` | Объявлено в declaration; живая captcha дала `t,t,t,f`, consume `t,f` |

Новых объектов, сигнатур и relation-access candidate не вводит: он заменяет четыре существующих
тела без изменения операций. Ничего недостающего в declaration по этому candidate не найдено.

## НЕ СДЕЛАНО

- Product-код, migration и declaration не исправлялись: аудитор не принимает собственный fix.
- Строка вердикта в очередь и `feat` не писалась.
- Разрешённая ведущим тема Л4 про корневую форму `v_organization_id uuid :=
  app.current_org_id()` не переоткрывалась.
- Candidate migration на DEV не применялась; выполнены только транзакционные пробы с `ROLLBACK`.
- Полный CI, `scripts/ci-record.mjs`, UI-тесты, второй Next, TEST и PROD не запускались.
- Исполняемый одноразовый harness не сохранён как постоянный тест SQL (§10a).

Текст строки вердикта для ведущего:

`Л3 gate-order correction round 3: PASS, MUST FIX 0 — ec17206a0: owner-aware DEV preflight rollback-only PASS (pending=1 total=224 unapplied=0); четыре тела отличаются от landed ровно переносом одного присваивания (+2/-1, 3 diff-строки каждое); parseOwnerStatements видит 4 блока с владельцами public-booking/public-booking/password-auth/password-auth; live pg_proc подтверждает assignment_after_gate=t у всех 4; инъекция statement_timestamp() обратно в DECLARE поймана exact pre-session verifier; captcha t,t,t,f и consume t,f, lead_rows=1, tenant_org_match=t, foreign_org_rows=0; DEV cleanup leads=0,captcha=0,ledger=0; privilege statements в migration отсутствуют.`
