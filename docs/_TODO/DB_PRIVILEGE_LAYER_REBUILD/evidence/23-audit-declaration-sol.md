# GATE REPORT — декларация доступа 239 таблиц

**Вердикт: FAIL.** Проверены все 239 строк декларации: 228 существующих отношений измерены в
`bcb_webapp_dev` через каталоги и точный `count(*)`, ещё 11 проверены как отсутствующие. Найдено
**6 сгруппированных расхождений**. Это gate против строк Ф2/Ф3/Ф5 плана и дословной нормы владельца;
новых задач и новой машинерии этот отчёт не создаёт.

## Authority и способ проверки

- Authority: `docs/OWNER_DECISIONS.md:192-248`, прежде всего критерий `:205-211`, норма
  классификации `:213-217` и порядок «кто куда должен ходить» `:225-231`.
- Checklist: `PLAN.md:81-89` (полная декларация + полный SQL), `:91-100` (org-стена при рождении),
  `:102-119` (двусторонняя сверка и поведенческий обход).
- Классификация §24.4: **view с live read-only measurement**. DDL/DML не выполнялись; продуктовые
  файлы и тесты не менялись.
- Host gate: подключение подтверждено как
  `bcb_webapp_dev | bcb_webapp_dev_user | default_transaction_read_only=on | 127.0.0.1:5432` командой C1.

## Coverage

| Поверхность | Фактическое покрытие |
|---|---:|
| Строки long form ↔ compact form | 239/239 в каждой из двух баз; decision-поля `wall/rls/grants/owner/org/disposition` |
| Существование в live DEV | 239/239: 228 существуют, 11 отсутствуют |
| `organization_id`, RLS, FORCE | 239/239 через `pg_class`/`pg_attribute` |
| Реальные table grants | все 228 существующих через `information_schema.role_table_grants` |
| Реальные policies | все 228 существующих через `pg_policies` |
| Точный объём | 228/228 существующих через отдельный `count(*)`; 11 отсутствующим считать нечего |
| `why` | 239/239: пустых 0, полных дублей 0; числовые утверждения перепроверены `count(*)`; подозрительные потребители — сначала `code-search` |
| Missing-context live probe | 6 наиболее рискованных таблиц; staff и patient логины обоих webapp-подключений |

Точный census C5: **228** таблиц, из них **174** непустых и **54** пустых, суммарно **85 769** строк.
Это сумма результатов отдельных `count(*)`, не `reltuples`.

## Расхождения

### BLOCKER 1. 225 ACTIVE-строк не объявляют полный доступ; 222 FORCE-строки не объявляют ни одной policy

**Таблицы:** все 225 `ACTIVE`.

**Декларация:** у всех 225 стоит `grantMatrix: 'G2-pending'`; table-level grant-строк — **0**,
колоночных записей — **3**; у 222 строк с `rls:'force'` массивов `policies` — **0**. Это не
«кто куда ходит»: это в основном список отзывов плюс человеческий `policyRequirement`.

**Live:** C4 измерила **619** non-owner пар `таблица × роль`; только **38** из них помечены
`revoke`, остальные **581** на **208** таблицах не объявлены ни как требуемые, ни как отзываемые.
После одинакового in-memory заполнения девяти уже названных census-gap генератор выдаёт **222**
пары `ENABLE+FORCE RLS`, **0** `CREATE POLICY` и только **2** `GRANT ... ON TABLE` (обе — колоночные).

**Почему это важно:** такой SQL не восстанавливает «правильные разрешения», а превращает приложение в
deny-all. Ф2 требует «декларация заполнена из живого каталога» и «полный идемпотентный SQL прав»
(`PLAN.md:83-86`). Это не новая задача из аудита, а незакрытая строка существующего плана.

**Доказательство:** C3, C4, C8.

### BLOCKER 2. У 49 live org-таблиц отсутствует `org:true`; allowlist содержит 116 вместо 165

**Таблицы (все 49):**

```text
public.appointment_records
public.be_appointment_cancellations
public.be_appointment_events
public.be_appointment_history_events
public.be_appointment_no_shows
public.be_appointment_reschedules
public.be_appointment_staff_comments
public.be_booking_form_submissions
public.be_package_history_events
public.be_package_usages
public.be_patient_booking_profiles
public.be_patient_packages
public.be_patient_timeline_events
public.be_payment_history_events
public.be_payment_intents
public.be_payments
public.be_refunds
public.saas_billing_accounts
public.saas_billing_invoices
public.saas_billing_provider_events
public.saas_billing_refunds
public.saas_billing_subscriptions
public.saas_org_entitlement_overrides
public.saas_organization_trials
public.specialist_tasks
public.support_conversation_messages
public.support_conversations
public.support_delivery_events
public.support_question_messages
public.support_questions
public.symptom_entries
public.symptom_trackings
public.system_settings
public.system_settings_audit
public.test_attempts
public.test_results
public.test_set_items
public.test_sets
public.tests
public.treatment_program_events
public.treatment_program_instance_stage_groups
public.treatment_program_instance_stage_items
public.treatment_program_instance_stages
public.treatment_program_instances
public.treatment_program_template_stage_groups
public.treatment_program_template_stage_items
public.treatment_program_template_stages
public.treatment_program_templates
public.user_phone_history
```

**Декларация:** `orgTableAllowlist` выводится только из `tables[*].org === true`; объявлено 116.

**Live:** из 228 существующих строк декларации колонка `organization_id` есть у **165**; ложных
`org:true` нет, но 49 истинных org-таблиц не отмечены. In-memory generator рендерит ровно 116 строк
allowlist (C8).

**Почему это важно:** стационарный event trigger сочтёт легальный `ALTER TABLE` этих существующих
org-таблиц необъявленным, а принцип «стена в точке рождения» опирается на неполное множество.
Расхождение прямо относится к Ф2 и Ф3 (`PLAN.md:83`, `:97-100`).

**Доказательство:** C2, C8.

### HIGH 3. Шесть ACTIVE-таблиц класса P не имеют одновременно стены клиники и пациента

| Таблица | Объявленная стена | Что лежит |
|---|---|---|
| `integrator.telegram_state` | `platform-role` | состояние диалога и пока ещё 7 колонок ПДн |
| `public.be_appointment_staff_comments` | `clinic` | комментарии персонала о пациенте |
| `public.be_patient_booking_profiles` | `clinic` | problematic/block/no-show профиль пациента |
| `public.manual_patient_commands` | `clinic` | команды по конкретному пациенту |
| `public.patient_invites` | `clinic` | приглашение конкретного пациента |
| `public.patient_merge_candidates` | `clinic` | кандидаты-дубли конкретных пациентов |

**Норма:** brief и `OWNER_DECISIONS.md:215-217` требуют для любой таблицы с пациентскими данными
обе стены. Решение D2 запрещает пациенту видеть внутренние комментарии и флаг «проблемный», но не
отменяет patient boundary: отсутствие гранта пациенту и отсутствие пациентской стены — разные вещи.

**Почему это важно:** декларация сама классифицирует строки как `P`, но затем кодирует только clinic
или platform boundary. Это расхождение verdict с owner-rule, а не пожелание другой архитектуры.

**Доказательство:** C6.

### HIGH 4. Acceptance criterion провален: есть и выдача строк без контекста, и тихий ноль без журнала

**Таблицы и live результат C7:**

- `app_staff` без principal: `patient_files=0`, `platform_users=0`, `test_attempts=0`,
  `saas_billing_invoices=0`, но `system_settings=119`;
- `app_patient` без principal: `patient_files=0`, `platform_users=0`, `test_attempts=0`, но
  `user_notification_topics=349`.

Маркер обоих успешных запросов отсутствует во всех найденных PostgreSQL-журналах:
`postgresql-16-main.log`, `.1`, `.2.gz` … `.10.gz` (C7). Это не «не нашли где-то»: C7 сначала
перечисляет все 11 файлов, затем делает `zgrep` по каждому.

Каталог C9 объясняет обе формы провала:

- `system_settings` имеет policy `TO public` с безусловной веткой `organization_id IS NULL`;
- `user_notification_topics` имеет RLS/FORCE `false/false`, policies 0 и `app_patient` INSERT/SELECT/UPDATE;
- три `app.current_*_id()` — обычные SQL SELECT из `app.principal_context`, `RAISE` в телах нет (C10).

**Почему это важно:** дословный критерий требует одновременно «0 строк» **и** запись ошибки
(`OWNER_DECISIONS.md:205-211`). Здесь нарушены обе половины. Это существующая строка owner-acceptance
и Ф5, не новый scope.

**Доказательство:** C7, C9, C10.

### MEDIUM 5. Семь обоснований опираются на ложные либо устаревшие числовые факты

| Таблица | Что написано | Точный live `count(*)` C11 |
|---|---|---:|
| `public.idempotency_keys` | `1 251 959` по `reltuples` | 0 |
| `integrator.idempotency_keys` | `~225`, далее `261 из 261` | 0 |
| `public.platform_users` | 278 строк; «единственная таблица ПДн» | 287; `user_identity` уже канонический read-source ФИО |
| `public.system_settings` | 121 из 125 глобальные | 119 из 123 |
| `public.notification_delivery_attempts` | 8 из 12 626 без org | 0 из 12 403 |
| `public.outgoing_delivery_queue` | 812 из 812 без org | 2 664 из 2 666 |
| `public.product_analytics_hourly` | 5 300 из 5 421 без org | 5 300 из 5 326 |

По `public.idempotency_keys` потребитель реальный: первый `code-search` нашёл
`apps/webapp/src/infra/idempotency/pgStore.ts`; ложен именно объём. По `platform_users` первый
`code-search` нашёл миграцию `0381_user_identity_total_mirror_d15b5_local.sql`, которая называет
`user_identity` единственным read-source ФИО, поэтому фраза «единственная таблица ПДн» противоречит
коду и соседним строкам самой декларации.

**Почему это важно:** O3 и приоритеты стен обоснованы долей `organization_id IS NULL`; один дефект
(`notification_delivery_attempts`) уже исчез, другие изменили объём. В шапке самой декларации G11
запрещает решения по `reltuples`, но `public.idempotency_keys` всё равно несёт такое число в `why`.

**Доказательство:** C11, C12.

### LOW 6. Одиннадцать строк всё ещё `PENDING_REMOVAL`, хотя отношений уже нет

**Таблицы:** `integrator.contacts`, `content_access_grants`, `conversation_messages`,
`conversations`, `identities`, `message_retry_jobs`, `question_messages`, `telegram_users`,
`user_questions`, `user_reminder_rules`, `users`.

**Декларация:** строки входят в число 239 как `PENDING_REMOVAL`.

**Live:** `to_regclass`/каталог C2 не нашли ни одной из 11; undeclared live-таблиц в управляемых
схемах при этом 0.

**Почему это важно:** owner-решение «11 таблиц интегратора сносить» уже исполнено в DEV, а
декларация остаётся в предшествующем состоянии. Это делает её двустороннюю картину существования
ложной, хотя security impact удаления положительный.

**Доказательство:** C2.

## Что проверено чисто

1. **Compression не изменила wall/rls/grant.** C3: 239/239 строк в обеих базах; различий в
   `wall`, `rls`, `grants`, `owner`, `org`, `disposition` нет. Различаются сокращённые тексты
   `why`/причин и порядок двух массивов. Девять штатных gap одинаковы до и после.
2. **Generator output от сжатия побайтово не изменился.** После одинакового in-memory заполнения
   тех же девяти gap четыре пары артефактов совпали:
   `a0864d5f…` (DEV privileges, 338646 bytes), `353f45aa…` (DEV allowlist, 6277),
   `b2202d55…` (TEST privileges, 341800), `e085798d…` (TEST allowlist, 6289). Команда C3.
3. **Имена строк:** дублей table-key нет (импорт прошёл), `why` непуст у 239/239, полных дублей
   `why` — 0 (C6/C12).
4. **Org в обратную сторону:** ни одна из 116 строк с `org:true` не указывает на таблицу без
   `organization_id` (C2).
5. **Каталог:** среди текущих 228 live-таблиц нет ни одной не представленной в декларации; измерены
   285 live policy-строк на 172 таблицах. Единственная live RLS-таблица без policy —
   `integrator.message_drafts` (C9).
6. **Проверенные `why`:** `booking_cities` действительно содержит 2 строки (C11), а
   `code-search "listActiveBookingCities booking_cities consumer"` не нашёл live consumer;
   exact `rg -n 'listActiveBookingCities' apps packages deploy` нашёл только строку самой
   декларации (`declaration.ts:1054`), в `apps/**` и `packages/**` потребителя нет. У
   `public.idempotency_keys` consumer существует (C12), то есть расхождение ограничено ложным числом.

## Команды доказательства

### C1 — host/db identity

```bash
set -a
source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev
set +a
PGOPTIONS='-c default_transaction_read_only=on' \
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -F $'\t' \
  -c "SELECT current_database(),current_user,current_setting('default_transaction_read_only'),inet_server_addr(),inet_server_port();"
```

### C2 — 239 строк против live catalog

```bash
node --input-type=module --eval '
import {execFileSync} from "node:child_process";
import {declaration} from "./deploy/postgres/privileges/declaration.ts";
const t=declaration.databases.bcb_webapp_dev.tables;
const sql=`SET default_transaction_read_only=on;
 SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,
 EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname=\x27organization_id\x27
   AND a.attnum>0 AND NOT a.attisdropped)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN(\x27r\x27,\x27p\x27)
 AND n.nspname IN(\x27public\x27,\x27app\x27,\x27integrator\x27,\x27drizzle\x27) ORDER BY 1,2`;
const out=execFileSync("sudo",["-n","-u","postgres","psql","-d","bcb_webapp_dev",
 "-v","ON_ERROR_STOP=1","-At","-F","\t","-c",sql],{encoding:"utf8"});
const live=new Map(out.trim().split("\n").filter(x=>x!=="SET").map(x=>{const [s,n,r,f,o]=x.split("\t");
 return [`${s}.${n}`,{r:r==="t",f:f==="t",o:o==="t"}]}));
const missing=Object.keys(t).filter(k=>!live.has(k));
const undeclared=[...live.keys()].filter(k=>!t[k]);
const orgMiss=Object.keys(t).filter(k=>live.get(k)?.o&&t[k].org!==true);
const orgFalse=Object.keys(t).filter(k=>t[k].org===true&&!live.get(k)?.o);
const rlsMismatch=Object.keys(t).filter(k=>{const a=live.get(k);if(!a)return false;
 return (t[k].rls==="force"&&!(a.r&&a.f))||(t[k].rls==="off"&&(a.r||a.f))||
  (t[k].rls==="on"&&!(a.r&&!a.f))});
console.log({declared:Object.keys(t).length,live:live.size,missing:missing.length,
 undeclared:undeclared.length,actualOrg:[...live.values()].filter(x=>x.o).length,
 declaredOrg:Object.values(t).filter(x=>x.org===true).length,orgMiss:orgMiss.length,
 orgFalse:orgFalse.length,rlsMismatch:rlsMismatch.length,missingList:missing,orgMissList:orgMiss});'
```

Сопоставление по ключу `<schema>.<table>` дало: declared 239; live 228; missing 11;
undeclared-live 0; actual-org 165; declared-org 116; actual-org-not-declared 49;
declared-org-without-column 0; сопоставимых target-RLS/actual mismatch 55.

### C3 — long form ↔ compact и четыре generator artifact

```bash
audit_tmp=$(mktemp -d /tmp/bcb-decl-audit.XXXXXX)
git archive 89759ee08^ | tar -x -C "$audit_tmp"
OLD_ROOT="$audit_tmp" node --input-type=module --eval '
// import old/new declaration; deep-compare every decision field named below;
// clone both; identically replace the same 9 named TODO/count gaps in memory;
// run collectGaps(), generatePrivilegesSql() and generateOrgAllowlistSql();
// compare byte length and sha256 for both databases.
import {pathToFileURL} from "node:url"; import {createHash} from "node:crypto";
const oldD=(await import(pathToFileURL(`${process.env.OLD_ROOT}/deploy/postgres/privileges/declaration.ts`))).declaration;
const newD=(await import(pathToFileURL(`${process.cwd()}/deploy/postgres/privileges/declaration.ts`))).declaration;
const gen=await import(pathToFileURL(`${process.cwd()}/deploy/postgres/privileges/generate.mjs`));
const fields=["wall","rls","grants","owner","org","disposition"];
for(const db of Object.keys(newD.databases).sort()){
 let diffs=0;for(const k of Object.keys(newD.databases[db].tables))for(const f of fields)
  if(JSON.stringify(oldD.databases[db].tables[k][f])!==JSON.stringify(newD.databases[db].tables[k][f]))diffs++;
 console.log(db,"rows",Object.keys(newD.databases[db].tables).length,"decisionFieldDiffs",diffs);}
for(const db of Object.keys(newD.databases).sort()){
 const x=gen.collectGaps(oldD,db),y=gen.collectGaps(newD,db);
 console.log(db,x.length,y.length,"gapsIdentical",JSON.stringify(x)===JSON.stringify(y));}
// Заполнитель не меняет ни одной table decision: только TODO functions/views и fullCountLive.
function filled(src){const d=structuredClone(src);for(const db of Object.values(d.databases)){
 if(db.functionsViews.views?.todo)db.functionsViews.views={};
 for(const group of [db.definerExceptions.ownershipExceptions.intentional,db.definerExceptions.ownershipExceptions.drift])
  for(const [owner,s] of Object.entries(group)){let f=Array.isArray(s.functions)?[...s.functions]:[...(s.known??[])];
   while(f.length<s.count)f.push(`app.__audit_placeholder_${owner}_${f.length}()`);s.functions=f;s.known=f;delete s.todo;}
 db.orgTableAllowlist.fullCountLive=Object.values(db.tables).filter(x=>x.org===true).length;delete db.orgTableAllowlist.todo;}return d;}
const a=filled(oldD),b=filled(newD),h=s=>createHash("sha256").update(s).digest("hex");
for(const db of Object.keys(b.databases).sort())for(const [k,fn] of [["privileges",gen.generatePrivilegesSql],["allowlist",gen.generateOrgAllowlistSql]]){
 const x=fn(a,db,{source:"deploy/postgres/privileges/declaration.ts"}),y=fn(b,db,{source:"deploy/postgres/privileges/declaration.ts"});
 console.log(db,k,Buffer.byteLength(x),Buffer.byteLength(y),h(x),h(y),x===y);}
const sql=gen.generatePrivilegesSql(b,"bcb_webapp_dev",{source:"deploy/postgres/privileges/declaration.ts"});
const lines=sql.split("\n"),allow=gen.generateOrgAllowlistSql(b,"bcb_webapp_dev",{source:"deploy/postgres/privileges/declaration.ts"});
console.log({createPolicy:lines.filter(x=>/^CREATE POLICY /.test(x)).length,
 grantTable:lines.filter(x=>/^GRANT .* ON TABLE /.test(x)).length,
 enable:lines.filter(x=>/^ALTER TABLE .* ENABLE ROW LEVEL SECURITY;/.test(x)).length,
 force:lines.filter(x=>/^ALTER TABLE .* FORCE ROW LEVEL SECURITY;/.test(x)&&!x.includes(" NO FORCE ")).length,
 allowlistRows:(allow.match(/^  \(/gm)||[]).length});
'
rm -rf "$audit_tmp"
```

### C4 — actual grants против объявленных grants/revoke

```bash
node --input-type=module --eval '
import {execFileSync} from "node:child_process";
import {declaration} from "./deploy/postgres/privileges/declaration.ts";
const t=declaration.databases.bcb_webapp_dev.tables;
let tablePrivs=0,columnEntries=0;for(const v of Object.values(t))for(const g of Object.values(v.grants))
 for(const p of g.privs){if(typeof p==="string")tablePrivs++;else columnEntries+=p.columns.length;}
console.log({active:Object.values(t).filter(x=>x.disposition==="ACTIVE").length,
 pending:Object.values(t).filter(x=>x.grantMatrix==="G2-pending").length,
 force:Object.values(t).filter(x=>x.rls==="force").length,
 policyArrays:Object.values(t).filter(x=>x.policies!==undefined).length,tablePrivs,columnEntries});
const roles=new Set([...Object.keys(declaration.cluster.roles),...Object.keys(declaration.envMapping.dev),
 ...Object.keys(declaration.envMapping.test),"PUBLIC"]);
const sql=`SET default_transaction_read_only=on;
 SELECT g.table_schema,g.table_name,g.grantee,g.privilege_type,pg_get_userbyid(c.relowner)
 FROM information_schema.role_table_grants g JOIN pg_namespace n ON n.nspname=g.table_schema
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=g.table_name AND c.relkind IN(\x27r\x27,\x27p\x27)
 WHERE g.table_schema IN(\x27public\x27,\x27app\x27,\x27integrator\x27,\x27drizzle\x27) ORDER BY 1,2,3,4`;
const out=execFileSync("sudo",["-n","-u","postgres","psql","-d","bcb_webapp_dev",
 "-v","ON_ERROR_STOP=1","-At","-F","\t","-c",sql],{encoding:"utf8"});
const rows=out.trim().split("\n").filter(x=>x!=="SET").map(x=>x.split("\t"))
 .filter(([s,n,r,p,o])=>t[`${s}.${n}`]&&roles.has(r)&&r!==o);
const pairs=new Map();for(const [s,n,r,p] of rows){const k=`${s}.${n}\t${r}`;
 if(!pairs.has(k))pairs.set(k,[]);pairs.get(k).push(p)}
const marked=[...pairs].filter(([k])=>{const [name,r]=k.split("\t");return t[name].revoke?.[r]});
const unclassified=[...pairs].filter(([k])=>{const [name,r]=k.split("\t");return !t[name].revoke?.[r]});
console.log({privilegeRows:rows.length,pairs:pairs.size,markedRevoke:marked.length,
 unclassified:unclassified.length,tables:new Set(unclassified.map(([k])=>k.split("\t")[0])).size});'
```

Сведение по ключу `schema/table/grantee`, исключая владельца таблицы, дало 1 878 privilege-строк,
619 пар `table×role`, 38 пар помечены `revoke`, 581 не объявлены, затронуто 208 таблиц.

### C5 — точный `count(*)` для каждого существующего отношения

```bash
node --input-type=module --eval '
import {execFileSync} from "node:child_process";
import {declaration} from "./deploy/postgres/privileges/declaration.ts";
const catalog=execFileSync("sudo",["-n","-u","postgres","psql","-d","bcb_webapp_dev",
 "-v","ON_ERROR_STOP=1","-At","-F",".","-c","SET default_transaction_read_only=on; SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN (\x27r\x27,\x27p\x27) AND n.nspname IN (\x27public\x27,\x27app\x27,\x27integrator\x27,\x27drizzle\x27) ORDER BY 1,2"],{encoding:"utf8"});
const live=new Set(catalog.trim().split("\n").filter(x=>x!=="SET"));
const names=Object.keys(declaration.databases.bcb_webapp_dev.tables).filter(k=>live.has(k)).sort();
const qi=s=>`"${s.replaceAll("\"","\"\"")}"`,ql=s=>`\x27${s.replaceAll("\x27","\x27\x27")}\x27`;
const unions=names.map(k=>{const [s,t]=k.split(".");return `SELECT ${ql(k)} table_name,count(*)::bigint row_count FROM ${qi(s)}.${qi(t)}`}).join(" UNION ALL ");
console.log(`SET default_transaction_read_only=on; WITH counts AS (${unions})
 SELECT jsonb_build_object(\x27counted\x27,count(*),\x27zero\x27,count(*) FILTER(WHERE row_count=0),
 \x27nonzero\x27,count(*) FILTER(WHERE row_count>0),\x27sum\x27,sum(row_count)) FROM counts;`);
' | sudo -n -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -At
```

Исполненная форма начиналась `SET default_transaction_read_only=on; WITH counts AS (...)` и
агрегировала только результаты отдельных `count(*)`: counted=228, zero=54, nonzero=174,
sum=85769.

### C6 — owner-rule по каждому verdict

```bash
node --input-type=module --eval '
import {declaration} from "./deploy/postgres/privileges/declaration.ts";
const t=declaration.databases.bcb_webapp_dev.tables;
console.log(Object.entries(t).filter(([,v])=>v.disposition==="ACTIVE"&&v.cls==="P"&&
 !["clinic+patient","parent+patient"].includes(v.wall)).map(([k,v])=>[k,v.wall,v.wallWhy]));'
```

### C7 — no-context probes и полный поиск в журнале

```bash
set -a; source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev; set +a
PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL_STAFF" -v ON_ERROR_STOP=1 -At <<'SQL'
BEGIN READ ONLY; SET LOCAL ROLE app_staff;
SELECT 'decl_audit_missing_context_20260809_staff',current_user,
 (SELECT count(*) FROM public.patient_files),(SELECT count(*) FROM public.platform_users),
 (SELECT count(*) FROM public.test_attempts),(SELECT count(*) FROM public.saas_billing_invoices),
 (SELECT count(*) FROM public.system_settings); ROLLBACK;
SQL
PGOPTIONS='-c default_transaction_read_only=on' psql "$DATABASE_URL_NONSTAFF" -v ON_ERROR_STOP=1 -At <<'SQL'
BEGIN READ ONLY; SET LOCAL ROLE app_patient;
SELECT 'decl_audit_missing_context_20260809_patient',current_user,
 (SELECT count(*) FROM public.patient_files),(SELECT count(*) FROM public.platform_users),
 (SELECT count(*) FROM public.test_attempts),(SELECT count(*) FROM public.user_notification_topics); ROLLBACK;
SQL
sudo -n -u postgres find /var/log/postgresql -maxdepth 1 -type f -name 'postgresql-16-main.log*' -printf '%p\n' | sort
sudo -n -u postgres sh -c "zgrep -H -F 'decl_audit_missing_context_20260809' \
 /var/log/postgresql/postgresql-16-main.log /var/log/postgresql/postgresql-16-main.log.1 \
 /var/log/postgresql/postgresql-16-main.log.*.gz || true"
```

### C8 — что реально выдал бы generator после снятия только названных gap

Последние пять строк исполняемого Node-блока C3 считают statements в фактически полученном SQL.
Результат DEV: `createPolicy=0`, `grantTable=2`, `enable=222`, `force=222`, `allowlistRows=116`.

### C9 — actual RLS/FORCE/grants/policies

```bash
sudo -n -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -At <<'SQL'
SET default_transaction_read_only=on;
SELECT c.oid::regclass,c.relrowsecurity,c.relforcerowsecurity,
       g.grantee,g.privilege_type,p.policyname,p.roles,p.cmd,p.qual,p.with_check
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
LEFT JOIN information_schema.role_table_grants g ON (g.table_schema,g.table_name)=(n.nspname,c.relname)
LEFT JOIN pg_policies p ON (p.schemaname,p.tablename)=(n.nspname,c.relname)
WHERE (n.nspname,c.relname) IN (('public','system_settings'),('public','user_notification_topics'),
 ('public','patient_files'),('public','platform_users'),('public','test_attempts'),('public','saas_billing_invoices'));
SQL
```

Полный catalog census той же формой: 228 tables, 285 policy rows, policies на 172 таблицах;
`integrator.message_drafts` — единственная `relrowsecurity=true` без строки `pg_policies`.

```bash
sudo -n -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -At -c "
SET default_transaction_read_only=on;
WITH m AS (SELECT n.nspname,c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','app','integrator','drizzle'))
SELECT (SELECT count(*) FROM m),
 (SELECT count(*) FROM pg_policies p JOIN m ON (p.schemaname,p.tablename)=(m.nspname,m.relname)),
 (SELECT count(DISTINCT (p.schemaname,p.tablename)) FROM pg_policies p JOIN m ON (p.schemaname,p.tablename)=(m.nspname,m.relname)),
 (SELECT string_agg(m.nspname||'.'||m.relname,',') FROM m WHERE m.relrowsecurity AND NOT EXISTS
  (SELECT 1 FROM pg_policies p WHERE (p.schemaname,p.tablename)=(m.nspname,m.relname)));"
```

### C10 — тела трёх context accessor

```bash
sudo -n -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -At -c "
SET default_transaction_read_only=on;
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='app' AND p.proname IN
 ('current_org_id','current_patient_user_id','current_integrator_user_id') ORDER BY p.proname;"
```

### C11 — числа в `why` только через `count(*)`

```bash
sudo -n -u postgres psql -d bcb_webapp_dev -v ON_ERROR_STOP=1 -At -F $'\t' <<'SQL'
SET default_transaction_read_only=on;
SELECT 'public.idempotency_keys',count(*) FROM public.idempotency_keys
UNION ALL SELECT 'integrator.idempotency_keys',count(*) FROM integrator.idempotency_keys
UNION ALL SELECT 'public.booking_cities',count(*) FROM public.booking_cities
UNION ALL SELECT 'public.platform_users',count(*) FROM public.platform_users
UNION ALL SELECT 'public.system_settings',count(*) FROM public.system_settings
UNION ALL SELECT 'public.system_settings:null_org',count(*) FROM public.system_settings WHERE organization_id IS NULL
UNION ALL SELECT 'public.notification_delivery_attempts',count(*) FROM public.notification_delivery_attempts
UNION ALL SELECT 'public.notification_delivery_attempts:null_org',count(*) FROM public.notification_delivery_attempts WHERE organization_id IS NULL
UNION ALL SELECT 'public.outgoing_delivery_queue',count(*) FROM public.outgoing_delivery_queue
UNION ALL SELECT 'public.outgoing_delivery_queue:null_org',count(*) FROM public.outgoing_delivery_queue WHERE organization_id IS NULL
UNION ALL SELECT 'public.product_analytics_hourly',count(*) FROM public.product_analytics_hourly
UNION ALL SELECT 'public.product_analytics_hourly:null_org',count(*) FROM public.product_analytics_hourly WHERE organization_id IS NULL;
SQL
```

### C12 — `why` и потребители: code-search первым

```bash
node /home/dev/brain/tools/code-search.mjs "listActiveBookingCities booking_cities consumer" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "public.idempotency_keys idempotency cache response_body" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "platform_users user_identity user_contacts personal data date of birth name email phone" --repo bcb -k 20
node /home/dev/brain/tools/code-search.mjs "user_notification_topics patient notification topics repository" --repo bcb -k 20
rg -n 'listActiveBookingCities' apps packages deploy
node --input-type=module --eval '
import {declaration} from "./deploy/postgres/privileges/declaration.ts";
const rows=Object.entries(declaration.databases.bcb_webapp_dev.tables).map(([table,v])=>({table,why:v.why}));
const groups=Object.groupBy(rows,x=>x.why);
console.log({rows:rows.length,empty:rows.filter(x=>!x.why.trim()).length,
 duplicateWhys:Object.values(groups).filter(x=>x.length>1).length});'
```

## Итог gate

**FAIL: 239/239 строк проверены, 6 сгруппированных расхождений.** Compression само по себе чисто;
gate падает на содержании уже сжатой декларации и на её несоответствии live catalog/owner-rule.
