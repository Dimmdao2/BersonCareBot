# FAIL — тела исправлены точно, но migration потеряла три owner-секции и не проходит preflight

Проверен committed candidate `a440910ba86cc33867ce0ecc76702b587ba75221` в
`wt/altcha-gate-order`. Оракул —
`docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, «Очередь до цели», Л3, и brief
повторного аудита. Отчёт прошлого круга использован как источник точной команды сверки, не как
доказательство нового результата.

Метод по `AGENTS.md` §24.4: неизменность четырёх тел и порядок файлов проверены построчно; права,
exact gate и поведение — живыми транзакционными пробами на именованной DEV `bcb_webapp_dev` через
общий host-lock. Постоянный тест SQL не создавался (§10a); временный one-shot harness удалён после
проб. PROD, TEST, второй Next и полный CI не запускались.

## MUST FIX 1 — четыре функции слиты в один statement под неверным владельцем

В correction-коммите исчезли три `--> statement-breakpoint` и три следующих за ними owner-header.
Парсер мигратора поэтому видит не четыре owner-ordered блока, а один и исполняет все четыре
`CREATE OR REPLACE FUNCTION` от `app_seam_public_booking_owner`:

```bash
node --experimental-strip-types --input-type=module - <<'NODE'
import fs from 'node:fs';
import { parseOwnerStatements } from './deploy/postgres/privileges/migrate-local-parse.mjs';
const file = 'apps/webapp/db/drizzle-migrations/20260915T141000_pre_session_lead_doors_gate_before_compute.sql';
const blocks = parseOwnerStatements(fs.readFileSync(file, 'utf8'), file);
console.log(`parsed_blocks=${blocks.length}`);
for (const [index, block] of blocks.entries()) {
  const functions = [...block.sql.matchAll(/CREATE OR REPLACE FUNCTION\s+([^\s(]+(?:\([^)]*\))?)/g)];
  console.log(`block=${index + 1} owner=${block.owner} functions=${functions.length}`);
}
NODE
```

Вывод дословно:

```text
parsed_blocks=1
block=1 owner=app_seam_public_booking_owner functions=4
```

Это нарушает `AGENTS.md` §1 «Контракт statement-owner обязателен для каждого блока миграции».
Достижимое последствие предъявлено штатным owner-aware rollback-only preflight: первые две функции
владелец заменить может, на первой функции captcha PostgreSQL останавливает выкладку, потому что её
владелец — `app_seam_password_auth_owner`.

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "node deploy/postgres/privileges/generate-cli.mjs --check && bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"
```

Ключевой вывод дословно:

```text
--check: артефакты соответствуют декларации побайтно.
BEGIN
GRANT
GRANT ROLE
GRANT
GRANT
SET
SET
   session_user   |         current_user          | can_create_public
------------------+-------------------------------+-------------------
 bcb_dev_migrator | app_seam_public_booking_owner | f
(1 row)

CREATE FUNCTION
CREATE FUNCTION
ERROR:  must be owner of function public_lead_issue_altcha_challenge
[2026-09-15T08:08:20+03:00] pid=2334493 RELEASED test lock (rc=3, 3s)
```

`migrate-local.mjs --rollback-only` подаёт весь pending-набор внутри `BEGIN … ROLLBACK`; из-за
`ON_ERROR_STOP` соединение завершилось на ошибке, и PostgreSQL откатил открытую транзакцию. Отдельная
проверка после всех проб подтвердила отсутствие ledger-строки и фикстур (команда в разделе
«Чистота DEV»).

Форма исправления следует из прежней рабочей версии migration и декларации: перед второй функцией
нужен отдельный блок `app_seam_public_booking_owner`, перед каждой из двух captcha-функций — отдельный
блок `app_seam_password_auth_owner`; каждый блок несёт собственные `SCHEMA-CREATE` и
`LANGUAGE-USAGE` markers. Product-тела менять не требуется.

## Построчная сверка четырёх тел — PASS

Повторена команда прошлого отчёта с новым именем replacement-файла:

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
  diff -u --label "landed:${name}" --label "candidate:${name}" \
    <(extract_function "$file" "$name") \
    <(extract_function "$replacement" "$name") || :
done
```

Вывод для каждой функции имеет ровно одну удалённую строку объявления с инициализатором и одну
добавленную строку того же присвоения сразу после exact gate:

```diff
-DECLARE v_org uuid := app.current_org_id(); v_fields jsonb;
+DECLARE v_org uuid; v_fields jsonb;
 BEGIN
   PERFORM app.require_accepted_context(...);
+  v_org := app.current_org_id();

-DECLARE v_org uuid := app.current_org_id(); v_lead public.leads%ROWTYPE;
+DECLARE v_org uuid; v_lead public.leads%ROWTYPE;
 BEGIN
   PERFORM app.require_accepted_context(...);
+  v_org := app.current_org_id();

-  v_now timestamptz := statement_timestamp();
+  v_now timestamptz;
   v_live_count integer;
 BEGIN
   PERFORM app.require_accepted_context(...);
+  v_now := statement_timestamp();

-  v_now timestamptz := statement_timestamp();
+  v_now timestamptz;
   v_challenge public.password_altcha_challenges%ROWTYPE;
 BEGIN
   PERFORM app.require_accepted_context(...);
+  v_now := statement_timestamp();
```

Полный фактический diff не ограничен этими восемью строками: именно вне тел удалены три обязательных
owner-секции, что и составляет finding выше.

## Поведение тел и права — PASS при правильном owner-разделении

Чтобы отделить ошибку упаковки migration от поведения тел, one-shot harness взял четыре тела
дословно из candidate, в потоке SQL распределил их по владельцам из
`deploy/postgres/privileges/declaration.ts`, добавил declaration-derived временные права и capability
seed, вызвал двери и завершил всё явным `ROLLBACK`. Репозиторий и DEV не изменялись.

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "set -o pipefail; node .audit-leads-gate-probe.mjs | sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev"
```

Ключевой вывод дословно:

```text
NOTICE:  BCB_PRE_SESSION_GATES_VERIFIED database=bcb_webapp_dev roots=101
                                                                             ?column?
------------------------------------------------------------------------------------------------------------------------------------------------------------------
 behavior|bucket_1=true,bucket_2=true,bucket_3=true,bucket_4=false,captcha_consume_1=true,captcha_consume_2=false,captcha_issue=true,lead_create=true,lead_rows=1
(1 row)

                                                                                                                                                                                                   ?column?
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 owners|app.create_public_lead(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)=app_seam_public_booking_owner,app.list_public_booking_form_fields(text)=app_seam_public_booking_owner,app.public_lead_consume_altcha_challenge(text,uuid,text)=app_seam_password_auth_owner,app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone)=app_seam_password_auth_owner
(1 row)

                       ?column?
------------------------------------------------------
 rights|lead_select_columns=19,lead_insert_columns=12
(1 row)

                                 ?column?
--------------------------------------------------------------------------
 rights|captcha_table_select=true,captcha_insert=true,captcha_update=true
(1 row)

 exact_declared_capability_count
---------------------------------
                             324
(1 row)

ROLLBACK
[2026-09-15T08:15:59+03:00] pid=2349111 RELEASED test lock (rc=0, 1s)
```

Измерено конечное поведение: выдача captcha разрешена; первое consume разрешено, повторное отказано;
для одного identifier разрешены три живые задачи и четвёртая отказана; дверь заявки создала ровно
одну строку с организацией принятого tenant-контекста. `INSERT … RETURNING *` исполнился с полным
набором declaration-прав.

Отдельное существующее доказательство независимого lead rate-limit bucket прогнано через host-lock:

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest run --project unit src/modules/auth/authRateLimits.unit.test.ts"
```

Вывод дословно:

```text
 Test Files  1 passed (1)
      Tests  1 passed (1)
[2026-09-15T08:18:07+03:00] pid=2352415 RELEASED test lock (rc=0, 1s)
```

## Exact gate и дальнейшая сверка — ожидаемый результат воспроизведён

Вторая one-shot транзакция поставила те же candidate-тела под их правильными владельцами, но не
засевала candidate capability-каталог. Поэтому она повторила прежнюю последовательность: exact gate
проходит, а полная closure останавливается на отдельном разрыве Л4. Решённую владельцем находку про
`current_org_id()` не переоткрываю; новой механики, опровергающей записанные владельцем факты, не
обнаружено.

Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "set -o pipefail; PROBE_MODE=closure node .audit-leads-gate-probe.mjs | sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev"
```

Вывод дословно:

```text
BEGIN
GRANT
GRANT
SET
CREATE FUNCTION
CREATE FUNCTION
RESET
SET
CREATE FUNCTION
CREATE FUNCTION
RESET
DO
NOTICE:  BCB_PRE_SESSION_GATES_VERIFIED database=bcb_webapp_dev roots=101
SELECT 324
ERROR:  port-context capability catalog closure failed: missing/mutated=3, extra/stale/mutated=0
CONTEXT:  PL/pgSQL function inline_code_block line 9 at RAISE
ERROR:  current transaction is aborted, commands ignored until end of transaction block
ROLLBACK
[2026-09-15T08:17:40+03:00] pid=2351637 RELEASED test lock (rc=0, 0s)
```

`missing/mutated=3` — известный внешний разрыв Л4 и не finding этого повторного аудита.

## Порядок migration — PASS

Команда штатного гейта:

```bash
/home/dev/brain/host-orch/run-tests.sh "bash apps/webapp/scripts/check-drizzle-migration-order.sh"
```

Вывод дословно:

```text
run-webapp-drizzle-migrate transaction-safe migration layout check: OK
check-drizzle-migration-order: OK
[2026-09-15T08:08:12+03:00] pid=2334334 RELEASED test lock (rc=0, 0s)
```

Проверка соседних имён в candidate и клоне Л4:

```bash
find apps/webapp/db/drizzle-migrations /home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp/db/drizzle-migrations \
  -maxdepth 1 -type f \( -name '20260915T130000*.sql' -o -name '20260915T140000*.sql' -o -name '20260915T141000*.sql' \) \
  -printf '%f\n' | sort -u
find apps/webapp/db/drizzle-migrations -maxdepth 1 -type f -name '20260915T141000_*.sql' -printf '%f\n' | wc -l
```

Вывод дословно:

```text
20260915T130000_the_public_lead_captcha_burns_once.sql
20260915T140000_lead_notification_profiles_root.sql
20260915T141000_pre_session_lead_doors_gate_before_compute.sql
1
```

То есть `T141000` стоит после `T130000` и после migration Л4 `T140000`; в самом candidate второй
миграции с `T141000` нет.

## Разбор прав по §1

| Функции | Требуемый statement owner / runtime | Права тела | Declaration |
|---|---|---|---|
| `list_public_booking_form_fields`, `create_public_lead` | `app_seam_public_booking_owner` / `app_tenant_service` | `SELECT` формы и public directory; `INSERT` и полный `SELECT` `leads` под `RETURNING *` | Объявлено; живая проба: `lead_select_columns=19`, `lead_insert_columns=12` |
| `public_lead_issue_altcha_challenge`, `public_lead_consume_altcha_challenge` | `app_seam_password_auth_owner` / `app_pre_session` | `SELECT`+`INSERT`; table `SELECT` для `FOR UPDATE`; column `UPDATE` | Объявлено; живая проба: `true,true,true` |

Проверка запрещённых privilege statements в candidate migration:

```bash
rg -n "\b(GRANT|REVOKE|CREATE[[:space:]]+ROLE|ALTER[[:space:]]+ROLE|ALTER[[:space:]]+DEFAULT[[:space:]]+PRIVILEGES|CREATE[[:space:]]+POLICY)\b" apps/webapp/db/drizzle-migrations/20260915T141000_pre_session_lead_doors_gate_before_compute.sql
```

Вывод пустой. Права остаются только в `deploy/postgres/privileges/declaration.ts`; finding относится
не к составу прав, а к потере owner-boundaries, из-за которой мигратор не может применить тела под
объявленными владельцами.

## Чистота DEV

После всех транзакционных проб выполнено:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -A -t -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c \"SELECT 'cleanup|leads=' || (SELECT count(*) FROM public.leads WHERE message_text='gate-order-proof-20260915') || ',captcha=' || (SELECT count(*) FROM public.password_altcha_challenges WHERE identifier_key IN ('lead-email:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','lead-email:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')) || ',ledger=' || (SELECT count(*) FROM drizzle.__drizzle_migrations WHERE tag='20260915T141000_pre_session_lead_doors_gate_before_compute');\""
```

Вывод дословно:

```text
cleanup|leads=0,captcha=0,ledger=0
[2026-09-15T08:18:36+03:00] pid=2353363 RELEASED test lock (rc=0, 0s)
```

## НЕ СДЕЛАНО

- Product-код и migration не исправлялись: аудитор не принимает собственный fix.
- Строка вердикта в очередь и `feat` не писалась.
- Решённая владельцем находка Л4 про `current_org_id()` не переоткрывалась.
- Полный CI, автоматические UI-тесты, второй Next, TEST и PROD не запускались.

Текст строки вердикта для ведущего:

`Л3 gate-order correction round 2: FAIL — четыре тела теперь построчно отличаются ровно переносом одного присвоения и при правильных owner-секциях проходят live behavior/rights (captcha true,true,false; bucket true,true,true,false; lead_rows=1; exact gate roots=101), но committed T141000 migration потеряла три statement-breakpoint/owner-header и parseOwnerStatements видит один блок app_seam_public_booking_owner для четырёх функций; штатный DEV rollback-only preflight падает rc=3: must be owner of function public_lead_issue_altcha_challenge. migration-order PASS; дальнейшая closure ожидаемо останавливается на чужом Л4 missing/mutated=3.`
