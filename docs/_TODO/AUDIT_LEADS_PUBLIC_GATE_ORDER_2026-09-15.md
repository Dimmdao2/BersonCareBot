# FAIL — тела Л3 изменены не только переносом присваиваний; дверь Л4 повторяет дыру вне охвата гейта

Проверен committed candidate `a99f0a5828ed26de7c156a27510b2919bebc32e6` в
`wt/altcha-gate-order`. Оракул —
`docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`, «Очередь до цели», Л3, и точный
brief этого аудита. Отчёт автора
`docs/_TODO/LEADS_PUBLIC_GATE_ORDER_FIX_2026-09-15.md` использован только как заявка.

Метод по §24.4: неизменность тел и полнота census проверены взглядом/построчным diff; фактический
порядок гейта и продолжение сверки — owner-aware пробой на именованной DEV в одной транзакции с
`ROLLBACK`. Постоянный тест текста SQL не создавался (§10a).

## Findings

### MUST FIX 1 — четыре replacement-тела не являются построчно прежними телами с одним переносом

Токенизированная последовательность каждого тела после разрешённого переноса совпадает, то есть
другой бизнес-операции в diff не найдено. Но точное построчное сравнение каждого тела расходится:

- `app.list_public_booking_form_fields(text)` — однострочный `DECLARE` разложен на три строки;
- `app.create_public_lead(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)` —
  однострочный `DECLARE` разложен на три строки;
- `app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone)` — удалены четыре
  пустые строки тела помимо переноса `v_now`;
- `app.public_lead_consume_altcha_challenge(text,uuid,text)` — удалены четыре пустые строки тела
  помимо переноса `v_now`.

Это прямо нарушает критерий brief: «единственная разница обязана быть в порядке присвоений; любая
другая правка, даже косметическая, — находка». Impact — candidate не сохраняет проверяемую границу
микрокоррекции: построчный diff содержит несвязанные изменения в четырёх чувствительных
`SECURITY DEFINER`-телах.

Команда построчного сравнения:

```bash
set -u
source_file_l3a='apps/webapp/db/drizzle-migrations/20260915T120000_public_lead_intake.sql'
source_file_l3b='apps/webapp/db/drizzle-migrations/20260915T130000_the_public_lead_captcha_burns_once.sql'
replacement='apps/webapp/db/drizzle-migrations/20260915T140000_pre_session_lead_doors_gate_before_compute.sql'
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

Сверка токенов после единственного разрешённого переноса дала дословно:

```text
list_public_booking_form_fields: token_sequence_after_only_move=IDENTICAL; exact_lines_after_only_move=DIFFERENT
create_public_lead: token_sequence_after_only_move=IDENTICAL; exact_lines_after_only_move=DIFFERENT
public_lead_issue_altcha_challenge: token_sequence_after_only_move=IDENTICAL; exact_lines_after_only_move=DIFFERENT
public_lead_consume_altcha_challenge: token_sequence_after_only_move=IDENTICAL; exact_lines_after_only_move=DIFFERENT
```

### MUST FIX 2 — Л4 содержит ту же pre-gate форму, а генератор её не проверяет

`wt/leads-notify` на `c16b75be1` объявляет
`app.list_clinic_lead_notification_recipients(uuid)` как exact named root класса `tenant_service`,
но тело вычисляет `v_organization_id uuid := app.current_org_id()` в `DECLARE` до
`app.require_accepted_context`. Это не законное исключение: общий комментарий генератора требует,
чтобы callable runtime `SECURITY DEFINER` отвергал вызов до исполнения исходного тела; declaration
даёт этой двери точную capability с purpose и typed args, а `current_org_id()` проверяет только
наличие принятого организационного контекста, не точную capability этой функции.

Пробел механический:

- `deploy/postgres/privileges/generate.mjs:607` выбирает для проверки `:=|DEFAULT` только capability
  с `targetRole === 'app_pre_session'`;
- общий runtime-definer verifier в `deploy/postgres/privileges/generate.mjs:1802` проверяет только
  начало после `BEGIN` и не смотрит исполняемые инициализаторы в `DECLARE`;
- поэтому exact `app_tenant_service`-root проходит обе существующие проверки.

Живая owner-aware проба наложила correction Л3 и root Л4 в одной транзакции, запустила штатный
`--pre-session-gate-verify`, затем спросила `pg_proc.prosrc` о вычислении до exact gate и откатила
транзакцию. Вывод дословно:

```text
[2026-09-15T07:48:26+03:00] pid=2301934 WAITING for test lock :: set -o pipefail; printf "%s" "$BCB_L34_GATE_PROBE_JS" | base64 -d | node --input-type=module | sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1
[2026-09-15T07:48:26+03:00] pid=2301934 ACQUIRED test lock :: set -o pipefail; printf "%s" "$BCB_L34_GATE_PROBE_JS" | base64 -d | node --input-type=module | sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1
BEGIN
GRANT
GRANT
GRANT
GRANT
GRANT
GRANT
SET
CREATE FUNCTION
RESET
SET
CREATE FUNCTION
RESET
SET
CREATE FUNCTION
RESET
SET
CREATE FUNCTION
RESET
SET
CREATE FUNCTION
RESET
DO
NOTICE:  BCB_PRE_SESSION_GATES_VERIFIED database=bcb_webapp_dev roots=101
                      identity                      | computes_before_exact_gate
----------------------------------------------------+----------------------------
 app.list_clinic_lead_notification_recipients(uuid) | t
(1 row)

ROLLBACK
[2026-09-15T07:48:27+03:00] pid=2301934 RELEASED test lock (rc=0, 1s)
```

Reachable consequence: под `app_tenant_service` с принятым контекстом другой named capability
`app.current_org_id()` уже исполняется от definer до проверки purpose/function identity/typed args
этой двери. Сегодня выражение только читает организацию и затем exact gate отказывает, но защитный
инвариант «никакого тела до точной доверенности» не стоит и генератор даёт ложный PASS.

## Полный census дверей Л3/Л4

Сканировались только создающие их stage-миграции и более поздняя correction-миграция; это полный
набор distinct-дверей по Л3/Л4 из указанного owner-плана:

| Стадия | Функция | `:=` / `DEFAULT` в `DECLARE` до exact gate |
|---|---|---|
| Л3, landed | `app.list_public_booking_form_fields(text)` | `v_org := app.current_org_id()` |
| Л3, correction | та же | нет |
| Л3, landed | `app.create_public_lead(uuid,text,text,text,text,text,text,text,text,timestamp with time zone)` | `v_org := app.current_org_id()` |
| Л3, correction | та же | нет |
| Л3, landed | `app.public_lead_issue_altcha_challenge(text,uuid,text,timestamp with time zone)` | `v_now := statement_timestamp()` |
| Л3, correction | та же | нет |
| Л3, landed | `app.public_lead_consume_altcha_challenge(text,uuid,text)` | `v_now := statement_timestamp()` |
| Л3, correction | та же | нет |
| Л4, `wt/leads-notify` | `app.list_clinic_lead_notification_recipients(uuid)` | `v_organization_id := app.current_org_id()` — непокрытая та же дыра |

Файлы census:

```text
apps/webapp/db/drizzle-migrations/20260915T120000_public_lead_intake.sql
apps/webapp/db/drizzle-migrations/20260915T130000_the_public_lead_captcha_burns_once.sql
apps/webapp/db/drizzle-migrations/20260915T140000_pre_session_lead_doors_gate_before_compute.sql
/home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp/db/drizzle-migrations/20260915T140000_lead_notification_audience_root.sql
```

## Права и owner-aware preflight

Candidate меняет только четыре существующие функции и не меняет declaration:

| Двери | Statement owner / runtime | Нужные права тела | Состояние declaration |
|---|---|---|---|
| public form fields, create lead | `app_seam_public_booking_owner` / `app_tenant_service` | `SELECT` формы и public directory; `INSERT` + полный `SELECT` `leads` под `RETURNING *` | объявлено, включая typed args и exact capability |
| ALTCHA issue/consume | `app_seam_password_auth_owner` / `app_pre_session` | `SELECT`+`INSERT`; `SELECT`+`UPDATE`, включая row lock | объявлено, включая typed args и exact capability |

Проверка запрещённых privilege statements в migration:

```bash
rg -n "\b(GRANT|REVOKE|CREATE[[:space:]]+ROLE|ALTER[[:space:]]+ROLE|ALTER[[:space:]]+DEFAULT[[:space:]]+PRIVILEGES|CREATE[[:space:]]+POLICY)\b" apps/webapp/db/drizzle-migrations/20260915T140000_pre_session_lead_doors_gate_before_compute.sql
```

Вывод пустой. Проверено именно в candidate migration; права остаются только в
`deploy/postgres/privileges/declaration.ts`.

Штатный rollback-only preflight:

```bash
/home/dev/brain/host-orch/run-tests.sh "node deploy/postgres/privileges/generate-cli.mjs --check && bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"
```

Ключевой вывод дословно:

```text
--check: артефакты соответствуют декларации побайтно.
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=224 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
[2026-09-15T07:46:14+03:00] pid=2298906 RELEASED test lock (rc=0, 3s)
```

## Повтор полной сверки после exact-gate

One-shot SQL был собран из самой candidate migration через
`parseOwnerStatements`, каждый statement исполнен под его real owner с declaration-generated
temporary access, оба verifier сгенерированы `generate-cli.mjs`; всё шло через общий test lock.
Команда запуска:

```bash
/home/dev/brain/host-orch/run-tests.sh 'set -o pipefail; printf "%s" "$BCB_GATE_PROBE_JS" | base64 -d | node --input-type=module | sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev'
```

`BCB_GATE_PROBE_JS` — переданный в окружении одноразовый генератор SQL; он читает
`20260915T140000_pre_session_lead_doors_gate_before_compute.sql`, использует
`parseOwnerStatements`, добавляет `--migration-owner-access`, `--pre-session-gate-verify`,
`--port-context-verify` и завершает поток `ROLLBACK`.

Вывод дословно:

```text
[2026-09-15T07:47:30+03:00] pid=2300486 WAITING for test lock :: set -o pipefail; printf "%s" "$BCB_GATE_PROBE_JS" | base64 -d | node --input-type=module | sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev
[2026-09-15T07:47:30+03:00] pid=2300486 ACQUIRED test lock :: set -o pipefail; printf "%s" "$BCB_GATE_PROBE_JS" | base64 -d | node --input-type=module | sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev
BEGIN
GRANT
GRANT
GRANT
GRANT
GRANT
SET
CREATE FUNCTION
RESET
SET
CREATE FUNCTION
RESET
SET
CREATE FUNCTION
RESET
SET
CREATE FUNCTION
RESET
DO
NOTICE:  BCB_PRE_SESSION_GATES_VERIFIED database=bcb_webapp_dev roots=101
SELECT 324
ERROR:  port-context capability catalog closure failed: missing/mutated=3, extra/stale/mutated=0
CONTEXT:  PL/pgSQL function inline_code_block line 9 at RAISE
ERROR:  current transaction is aborted, commands ignored until end of transaction block
ROLLBACK
[2026-09-15T07:47:31+03:00] pid=2300486 RELEASED test lock (rc=0, 1s)
```

Измерение автора воспроизведено: exact pre-session gate проходит, затем полный capability verifier
доходит до отдельного разрыва Л4. Транзакция явно завершилась `ROLLBACK`.

## НЕ СДЕЛАНО

- Product-код, migration и generator не исправлялись: аудитор не принимает собственный fix.
- Непокрытый Л4 root не исправлялся в чужой ветке; её незакоммиченный audit-test не трогался.
- Candidate migration и Л4 migration на DEV не применялись; все candidate DDL-пробы завершены
  `ROLLBACK`.
- Полный CI, автоматические UI-тесты, второй Next server, TEST и PROD не запускались.
- Строка вердикта в очередь/`feat` не записывалась.

Текст строки для ведущего:

`Л3 gate-order correction: FAIL — четыре SECURITY DEFINER-тела переформатированы сверх разрешённого переноса; Л4 tenant_service root всё ещё вычисляет current_org_id() до exact gate, а verifier проверяет :=/DEFAULT только для app_pre_session. DEV owner-aware preflight rollback-only PASS; exact gate проходит roots=101 и full closure доходит до отдельного missing/mutated=3.`
