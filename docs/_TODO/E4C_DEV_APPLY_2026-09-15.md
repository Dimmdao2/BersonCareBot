# Э4c: приземлённая миграция и двери решения врача на DEV

Дата исполнения: 2026-09-15. Цель: только именованный DEV `bcb_webapp_dev` и единственный webapp
`http://127.0.0.1:5200`. Источник миграции и декларации: главное дерево
`/home/dev/dev-projects/BersonCareBot`, ветка `feat/doctor-ui-rebuild`, `HEAD=6e6dcb5b9`
(содержит merge `260d55362`). TEST и оба PROD не открывались и не затрагивались.

## Итог

Штатный путь полностью прошёл:

```text
migrate-dev: PASS (pending migrations applied; declaration reconciled and catalog-audited)
```

На DEV применена ровно одна pending webapp-миграция:
`20260915T102455_doctor_merge_decision_has_a_record`. Полный reconcile прав закоммичен, каталог способностей
и runtime-env синхронизированы. После рестарта тот же единственный Turbopack слушает
`127.0.0.1:5200`; штатный вход врача и все проверенные маршруты отвечают не `500`.

## Канонический маршрут

Перед действием прочитаны `AGENTS.md` §1, §1a, §6, §7, §10a, §10b, §24,
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `deploy/HOST_DEPLOY_README.md`, `README.md`,
`docs/README.md` и owner-оракул `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md`.
Поиск штатного entrypoint выполнен командой:

```bash
node /home/dev/brain/tools/code-search.mjs \
  "apply webapp migrations dev generated snapshot drizzle bcb_webapp_dev" --repo bcb -k 12
```

Результат указал на `deploy/host/migrate-dev.sh`. Именно этот entrypoint применяет миграции из текущего
главного checkout, затем выполняет declaration reconcile, catalog audit и обновляет capability JSON.

## ДО

Главное дерево:

```bash
git -C /home/dev/dev-projects/BersonCareBot status --short --branch
git -C /home/dev/dev-projects/BersonCareBot rev-parse HEAD
git -C /home/dev/dev-projects/BersonCareBot branch --show-current
```

```text
## feat/doctor-ui-rebuild...origin/feat/doctor-ui-rebuild [ahead 111]
6e6dcb5b9d512fa7764f9def7914899253b46a85
feat/doctor-ui-rebuild
```

Ledger и функции проверены read-only через канонический локальный admin socket:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev \
  -v ON_ERROR_STOP=1 -P pager=off
```

Запрос ledger по четырём относящимся тегам дал:

```sql
SELECT tag, created_at
FROM drizzle.__drizzle_migrations
WHERE tag IN (
  '20260914T220000_doctor_resolves_medical_merge_conflict',
  '20260915T102455_doctor_merge_decision_has_a_record',
  '20260915T120000_public_lead_intake',
  '20260915T130000_the_public_lead_captcha_burns_once'
)
ORDER BY tag;
```

```text
20260914T220000_doctor_resolves_medical_merge_conflict | 1800000301000
20260915T120000_public_lead_intake                     | 1800000302000
20260915T130000_the_public_lead_captcha_burns_once     | 1800000303000
(3 rows)
```

`20260915T102455_doctor_merge_decision_has_a_record` отсутствовала. Запрос `pg_proc` по трём требуемым
сигнатурам дал `(0 rows)`. Каталог:

```sql
SELECT count(*)
FROM app_ext.port_context_capabilities
WHERE port='webapp' AND active_until IS NULL;

SELECT purpose, function_identity::text
FROM app_ext.port_context_capabilities
WHERE port='webapp' AND active_until IS NULL
  AND function_identity::text IN (
    'app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid,text)',
    'app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)',
    'app.read_staff_patient_medical_merge_refusal(uuid)'
  );
```

```text
count = 280
target rows: (0 rows)
```

Сравнение декларации с фактическим `WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON` из
`apps/webapp/.env.dev` выполнено импортом `declaration` и `renderPortContextRuntimeEnv`:

```bash
node --experimental-strip-types - <<'NODE'
import { readFileSync } from 'node:fs';
import { declaration } from './deploy/postgres/privileges/declaration.ts';
import { renderPortContextRuntimeEnv } from './deploy/postgres/privileges/generate.mjs';
const parseEnvValue = (text, key) => {
  const line = text.split(/\r?\n/u).find((candidate) => candidate.startsWith(`${key}=`));
  if (!line) throw new Error(`missing ${key}`);
  const raw = line.slice(key.length + 1);
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replaceAll("'\"'\"'", "'");
  }
  return raw;
};
const rendered = JSON.parse(
  renderPortContextRuntimeEnv(declaration, 'dev', 'bcb_webapp_dev', 'webapp').value,
);
const live = JSON.parse(parseEnvValue(
  readFileSync('apps/webapp/.env.dev', 'utf8'),
  'WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON',
));
const target = [
  'app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid,text)',
  'app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)',
  'app.read_staff_patient_medical_merge_refusal(uuid)',
];
const entries = (object, identity) => Object.entries(object)
  .filter(([, value]) => value.functionIdentity === identity)
  .map(([name]) => name);
console.log('declaration descriptors:', Object.keys(rendered).length);
console.log('live env descriptors:', Object.keys(live).length);
console.log('descriptor count equal:', Object.keys(rendered).length === Object.keys(live).length);
console.log('descriptor JSON equal:', JSON.stringify(rendered) === JSON.stringify(live));
for (const identity of target) {
  console.log(identity);
  console.log('  declaration:', JSON.stringify(entries(rendered, identity)));
  console.log('  live env:', JSON.stringify(entries(live, identity)));
}
NODE
```

```text
declaration descriptors: 281
live env descriptors: 280
descriptor count equal: false
descriptor JSON equal: false
app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid,text)
  declaration: []
  live env: []
app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)
  declaration: ["staff_patient_medical_merge_conflict_refuse"]
  live env: []
app.read_staff_patient_medical_merge_refusal(uuid)
  declaration: ["staff_patient_medical_merge_refusal_read"]
  live env: []
```

Пятиаргументная transfer-функция является внутренней attested-дверью: отдельный runtime capability descriptor
ей не объявлен. Внешние capability-двери здесь — `refuse` и `read-refusal`.

Owner-aware rollback-only preflight из главного дерева:

```bash
cd /home/dev/dev-projects/BersonCareBot
bash deploy/host/migrate-dev.sh --preflight
```

Значимые итоговые строки полного вывода:

```text
ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=227 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

## Применение и сверка прав

Единственный webapp был остановлен только на окно миграции; integrator и PROD-порты команда не затрагивает:

```bash
cd /home/dev/dev-projects/BersonCareBot
bash scripts/kill-local-dev-ports.sh webapp
bash deploy/host/migrate-dev.sh --execute
```

```text
kill-local-dev-ports: webapp dev :5200 (integrator and prod untouched)
port 5200: stopping PID(s): 2254475
STOP_EXIT=0
integrator owner-ordered migrations current for "bcb_webapp_dev": pending=0 eligible=0 total=1
COMMIT
Drizzle owner-ordered migration committed for "bcb_webapp_dev": pending=1 total=227 reapplied=0 foreign-ledger-rows=4 relabeled=0 dropped-foreign=0 dropped-foreign-by-hash=0 unapplied=0
integrator owner-ordered migrations current for "bcb_webapp_dev": pending=0 eligible=1 total=1
access reconcile committed: env=dev database=bcb_webapp_dev; local admin socket=/run/postgresql
DEV port-context runtime env synchronized with declaration
migrate-dev: PASS (pending migrations applied; declaration reconciled and catalog-audited)
MIGRATE_EXECUTE_EXIT=0
```

Reconcile не отказал ни на одном объекте. Правила в миграцию не добавлялись; права приехали только из
`deploy/postgres/privileges/declaration.ts` и сгенерированного SQL.

Точный diff с первым родителем merge:

```bash
git diff --numstat 1de2ae66c..260d55362 -- \
  deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql \
  deploy/postgres/generated/privileges.bcb_webapp_dev.sql \
  deploy/postgres/privileges/declaration.ts

git diff --unified=8 1de2ae66c..260d55362 -- \
  deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql \
  deploy/postgres/generated/privileges.bcb_webapp_dev.sql \
  deploy/postgres/privileges/declaration.ts \
  | rg "^[+-].*(medical_merge|medical-merge|transfer_staff|refuse_staff|read_staff)"
```

```text
2  1  deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql
57 24 deploy/postgres/generated/privileges.bcb_webapp_dev.sql
50 29 deploy/postgres/privileges/declaration.ts
```

По capability SQL изменилось следующее:

```text
identity.medical-merge-conflict.refuse:
  app.refuse_staff_patient_medical_merge_conflict(uuid,uuid)
  -> app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)

добавлено:
  identity.medical-merge-conflict.read-refusal
  -> app.read_staff_patient_medical_merge_refusal(uuid)
```

То есть из прежних 280 дескрипторов 279 строк не изменились, одна строка `refuse` получила новую сигнатуру,
и одна строка `read-refusal` добавлена; итог — 281.

Синхронность закоммиченных артефактов проверена:

```bash
node deploy/postgres/privileges/generate-cli.mjs --check
```

```text
ok bcb_webapp_dev/privileges: deploy/postgres/generated/privileges.bcb_webapp_dev.sql совпадает побайтно
ok bcb_webapp_dev/allowlist: deploy/postgres/generated/org-allowlist.bcb_webapp_dev.sql совпадает побайтно
ok bersoncarebot_test/privileges: deploy/postgres/generated/privileges.bersoncarebot_test.sql совпадает побайтно
ok bersoncarebot_test/allowlist: deploy/postgres/generated/org-allowlist.bersoncarebot_test.sql совпадает побайтно
ok therapysto_prod/privileges: deploy/postgres/generated/privileges.therapysto_prod.sql совпадает побайтно
ok therapysto_prod/allowlist: deploy/postgres/generated/org-allowlist.therapysto_prod.sql совпадает побайтно
--check: артефакты соответствуют декларации побайтно.
```

Это чтение/сравнение файлов; TEST/PROD базы не открывались.

## ПОСЛЕ: ledger, функции, ACL, каталог и env

Тот же ledger-запрос:

```text
20260914T220000_doctor_resolves_medical_merge_conflict | 1800000301000
20260915T102455_doctor_merge_decision_has_a_record     | 1800000307000
20260915T120000_public_lead_intake                     | 1800000302000
20260915T130000_the_public_lead_captcha_burns_once     | 1800000303000
(4 rows)
```

Пост-preflight тем же штатным entrypoint:

```bash
bash deploy/host/migrate-dev.sh --preflight
```

```text
Drizzle owner-ordered migration already current for "bcb_webapp_dev": pending=0 total=227 verified-objects=398 foreign-ledger-rows=4
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

Существование, точные сигнатуры и владельцы:

```sql
SELECT p.oid::regprocedure::text AS signature,
       pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='app'
  AND p.oid = ANY (ARRAY[
    to_regprocedure('app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid,text)'),
    to_regprocedure('app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)'),
    to_regprocedure('app.read_staff_patient_medical_merge_refusal(uuid)')
  ])
ORDER BY signature;
```

```text
app.read_staff_patient_medical_merge_refusal(uuid)
  owner=app_seam_identity_lookup_owner security_definer=t
app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)
  owner=app_seam_identity_lookup_owner security_definer=t
app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid,text)
  owner=app_seam_identity_lookup_owner security_definer=t
(3 rows)
```

ACL всех трёх функций одинаков по границе исполнения:

```text
app_seam_identity_lookup_owner=X/app_seam_identity_lookup_owner
app_staff=X/app_seam_identity_lookup_owner
```

Итог каталога:

```text
catalog webapp descriptors: 281
identity.medical-merge-conflict.read-refusal | app.read_staff_patient_medical_merge_refusal(uuid)
identity.medical-merge-conflict.refuse       | app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)
```

Повторное сравнение декларации и runtime-env:

```text
declaration descriptors: 281
live env descriptors: 281
descriptor count equal: true
descriptor JSON equal: true
app.transfer_staff_approved_platform_user_merge_data(uuid,uuid,uuid,uuid,text)
  declaration: []
  live env: []
app.refuse_staff_patient_medical_merge_conflict(uuid,uuid,text,boolean)
  declaration: ["staff_patient_medical_merge_conflict_refuse"]
  live env: ["staff_patient_medical_merge_conflict_refuse"]
app.read_staff_patient_medical_merge_refusal(uuid)
  declaration: ["staff_patient_medical_merge_refusal_read"]
  live env: ["staff_patient_medical_merge_refusal_read"]
```

## Единственный DEV webapp и живые маршруты

После reconcile перезапущен не второй сервер, а тот же канонический Turbopack:

```bash
launch_log="$(mktemp /tmp/e4c-webapp-launch.XXXXXX)"
nohup setsid bash scripts/run-webapp-dev.sh turbo >"$launch_log" 2>&1 </dev/null &
curl -sS -o /tmp/e4c_api_me_after.body -w '%{http_code}' \
  http://127.0.0.1:5200/api/me
ss -ltnp '( sport = :5200 )'
```

```text
dev:turbo ready on 127.0.0.1:5200 (PID 3568540, log /home/dev/dev-projects/BersonCareBot/apps/webapp/.next/dev-server-turbo.log)
READY_ATTEMPT=5 HTTP=401
LISTEN 0 511 127.0.0.1:5200 0.0.0.0:* users:(("next-server (v1",pid=3568540,fd=22))
```

Первый login probe без `Origin` ожидаемо был отсечён CSRF-гейтом:

```text
{"ok":false,"error":"csrf_origin_forbidden"}
HTTP 403
```

Повтор выполнен корректно со штатной owner-учёткой врача, cookie jar в `/tmp`:

```bash
cookie_jar="$(mktemp /tmp/e4c-doctor-cookie.XXXXXX)"
curl -sS -c "$cookie_jar" \
  -H 'origin: http://127.0.0.1:5200' -H 'content-type: application/json' \
  --data '{"email":"dimmdao@yandex.ru","password":"123456testTEST"}' \
  -w '\nHTTP %{http_code}\n' \
  http://127.0.0.1:5200/api/auth/email-password/login
```

```text
{"ok":true,"redirectTo":"/app/doctor","role":"doctor"}
HTTP 200
```

Безопасные чтения и валидационные POST (probe UUID заранее проверен как отсутствующий):

```bash
curl -sS -b "$cookie_jar" -w '\nHTTP %{http_code}\n' \
  http://127.0.0.1:5200/api/doctor/account-merge-conflicts
curl -sS -b "$cookie_jar" -w '\nHTTP %{http_code}\n' \
  http://127.0.0.1:5200/api/doctor/account-merge-conflicts/00000000-0000-4000-8000-00000000e4c1
curl -sS -b "$cookie_jar" -w '\nHTTP %{http_code}\n' \
  http://127.0.0.1:5200/api/doctor/patients/00000000-0000-4000-8000-00000000e4c1/merge-refusals
curl -sS -b "$cookie_jar" -H 'origin: http://127.0.0.1:5200' \
  -H 'content-type: application/json' --data '{}' -w '\nHTTP %{http_code}\n' \
  http://127.0.0.1:5200/api/doctor/account-merge-conflicts/00000000-0000-4000-8000-00000000e4c1
curl -sS -b "$cookie_jar" -H 'origin: http://127.0.0.1:5200' \
  -H 'content-type: application/json' \
  --data '{"action":"merge","comment":"validation only"}' -w '\nHTTP %{http_code}\n' \
  http://127.0.0.1:5200/api/doctor/account-merge-conflicts/not-a-uuid
curl -sS -b "$cookie_jar" -H 'origin: http://127.0.0.1:5200' \
  -H 'content-type: application/json' \
  --data '{"action":"refuse","comment":"validation only","supportRequested":false}' \
  -w '\nHTTP %{http_code}\n' \
  http://127.0.0.1:5200/api/doctor/account-merge-conflicts/not-a-uuid
```

```text
GET /api/doctor/account-merge-conflicts
{"ok":true,"hasConflicts":false,"conflictIds":[],"clientIds":[],"conflicts":[]}
HTTP 200

GET /api/doctor/account-merge-conflicts/00000000-0000-4000-8000-00000000e4c1
{"ok":false,"error":"forbidden"}
HTTP 403

GET /api/doctor/patients/00000000-0000-4000-8000-00000000e4c1/merge-refusals
{"ok":true,"refusals":[]}
HTTP 200

POST /api/doctor/account-merge-conflicts/00000000-0000-4000-8000-00000000e4c1 {}
{"ok":false,"error":"invalid_request"}
HTTP 400

POST /api/doctor/account-merge-conflicts/not-a-uuid
  {"action":"merge","comment":"validation only"}
{"ok":false,"error":"invalid_request"}
HTTP 400

POST /api/doctor/account-merge-conflicts/not-a-uuid
  {"action":"refuse","comment":"validation only","supportRequested":false}
{"ok":false,"error":"invalid_request"}
HTTP 400
```

Все маршруты ответили не `500`. GET подробностей и GET отказов дошли до соответствующих DB read-дверей;
записывающие функции merge/refuse намеренно не вызывались.

## Данные DEV

До и после HTTP проверен один и тот же read-only агрегат:

```sql
SELECT count(*) AS total,
       count(*) FILTER (WHERE status='pending') AS pending,
       count(*) FILTER (WHERE status='dismissed') AS dismissed,
       count(*) FILTER (WHERE status='escalated') AS escalated,
       count(*) FILTER (WHERE doctor_comment IS NOT NULL) AS with_comment
FROM public.patient_merge_candidates;
```

```text
before_http:              total=1 pending=1 dismissed=0 escalated=0 with_comment=0
after_authenticated_http: total=1 pending=1 dismissed=0 escalated=0 with_comment=0
probe UUID rows: 0 -> 0
```

Фикстуры не создавались. Временные cookie-файлы `/tmp/e4c-doctor-cookie.U4TtVi` и
`/tmp/e4c-doctor-cookie.CfMFvP` удалены командой `shred -u -- <оба точных пути>` после проверки.

## НЕ СДЕЛАНО

- Не вызывались успешные `merge`/`refuse`; решение врача и строки конфликтов не изменялись.
- Не создавались и не оставлялись фикстуры.
- Не запускались автоматические UI-тесты.
- Не запускались тестовые наборы и полный CI: изменение кода здесь не выполнялось, а полный CI оставлен ведущему
  согласно brief.
- TEST не читался и не менялся. Режим TEST на новом PROD не снимался.
- Ни старый, ни новый PROD не читались, не проверялись и не менялись.
- Главное дерево, его ветка и tracked-файлы не менялись; operational `.env` обновлён только штатным wrapper.
- Push не выполнялся: brief требует только коммит отчёта в текущем клоне.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. Блокеров сверки прав и живого DEV-прохода не осталось.
