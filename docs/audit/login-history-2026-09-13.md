# Независимый adversarial-аудит журнала входов (#1112)

Дата: 2026-09-13. Ветка: `wt/login-history`. Проверенный HEAD:
`564cd97062e5788783f7f5c736a7af8d3ec67824`.

Источник scope: `docs/_TODO/LOGIN_HISTORY_2026-09-13.md` и
`docs/_TODO/SESSIONS_AND_DEVICES_DESIGN_2026-09-13.md`. Исправления продукта не вносились; временные
инъекции отказов сняты до оформления этого отчёта. Миграции, reconcile, deploy, полный CI и vitest не
запускались.

## Итог gate

**FAIL. Найдены 2 самостоятельных дефекта:** справочник неверно определяет часть IPv6-адресов, а
свёртка устройств не ограничивает число прочитанных и агрегированных входов. Пункты C, E и J ниже
падают; J повторно учитывает те же дефекты и не увеличивает kill count.

| Claim                                  | Verdict  |
| -------------------------------------- | -------- |
| A. Chokepoint completeness             | PASS     |
| B. SECURITY DEFINER door               | PASS     |
| C. Country directory                   | **FAIL** |
| D. Device marker                       | PASS     |
| E. Device folding query                | **FAIL** |
| F. Generated privileges                | PASS     |
| G. Human-facing text                   | PASS     |
| H. Honest security screen              | PASS     |
| I. Journal failure does not fail login | PASS     |
| J. Checked plan items match reality    | **FAIL** |

## A. Chokepoint completeness — PASS

Исчерпывающий поиск production-вызовов кодировщика:

```bash
rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' 'encodeSessionCookie\(' .
rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' 'persistNewAuthSession\(' apps/webapp/src
rg -n --glob '!**/*.test.*' --glob '!**/*.spec.*' "bersoncare_webapp_session|SESSION_COOKIE_NAME" .
```

Новый сеанс записывается в `apps/webapp/src/modules/auth/service.ts:238-299`: cookie сессии, fresh-login
marker, device marker и журнал находятся в одном `persistNewAuthSession`. Пять production-входов в
этот chokepoint находятся в `service.ts:667`, `:729`, `:825`, `:908`, `:1141`; последний — общий
`setSessionFromUser` для password/OTP/passkey/OAuth/приглашений.

Остальные три production-вызова `encodeSessionCookie` не создают login session: очистка поля reauth
существующей cookie (`service.ts:1144-1151`) и два sliding-TTL renewal
(`service.ts:1158-1170`, `sessionCookie.ts:275-291`). Удаление в `service.ts:1102` пишет пустую cookie.

Отдельный подписыватель есть только в операционном TEST helper
`deploy/host/test-visual-global-admin-session.mjs:67-80`. Его `issue()` сначала получает обычную cookie
через `/api/auth/email-password/login` (`:301-318`), то есть рождение сессии уже прошло через
chokepoint; helper лишь ограничивает TTL этой TEST-сессии.

Реальный `persistNewAuthSession` дополнительно запускался при инъекциях из I: в каждом прогоне он
выставил `bersoncare_webapp_session`, `bersoncare_fresh_login`, `bersoncare_device` и вернул сессию.

## B. SECURITY DEFINER door — PASS

Проверены
`apps/webapp/db/drizzle-migrations/20260913T181500_user_login_events_device_country.sql:13-126` и
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql:2143,3101,4361-4369`.

```bash
rg -n 'DROP FUNCTION IF EXISTS app\.append_user_login_event|CREATE OR REPLACE FUNCTION app\.append_user_login_event|require_accepted_context|p_device_id !~|p_country !~|p_role NOT IN|char_length' apps/webapp/db/drizzle-migrations/20260913T181500_user_login_events_device_country.sql
rg -n -i '\b(grant|revoke)\b' apps/webapp/db/drizzle-migrations/20260913T181500_user_login_events_device_country.sql
rg -n 'append_user_login_event|device_id|country' deploy/postgres/generated/privileges.bcb_webapp_dev.sql
node deploy/postgres/privileges/generate-cli.mjs --check
```

Пролог сравнен отдельным парсером: он извлёк выражение из миграции и exact expression из generated
artifact, заменил только имена 12 параметров на их PostgreSQL-позиции `$1...$12` и нормализовал
пробелы SQL:

```bash
node <<'NODE'
const fs = require('node:fs');
const migration = fs.readFileSync('apps/webapp/db/drizzle-migrations/20260913T181500_user_login_events_device_country.sql', 'utf8');
const artifact = fs.readFileSync('deploy/postgres/generated/privileges.bcb_webapp_dev.sql', 'utf8');
const names = ['p_user_id','p_method','p_role','p_ip','p_user_agent','p_device_kind','p_os','p_browser','p_host','p_session_ref','p_device_id','p_country'];
const body = migration.match(/PERFORM (app\.require_accepted_context\([\s\S]*?\n\s*\));/)[1];
const canonical = (sql) => sql.trim().replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\[\s+/g, '[').replace(/\s+\]/g, ']');
let actual = body;
names.forEach((name, index) => { actual = actual.replace(new RegExp(`\\b${name}\\b`, 'g'), `$${index + 1}`); });
const row = artifact.split('\n').find((line) => line.includes("('app.append_user_login_event(uuid,text,text,text,text,text,text,text,text,text,text,text)', 'exact'"));
const expected = row.match(/^\s*\('(?:''|[^'])*', 'exact', '((?:''|[^'])*)', ARRAY/)[1].replace(/''/g, "'");
console.log(JSON.stringify({ equal: canonical(actual) === canonical(expected) }));
if (canonical(actual) !== canonical(expected)) process.exit(1);
NODE
```

Результат: `{"equal":true}`, exit 0.

Результат:

- Пролог имеет те же root/role/context/purpose, те же 12 typed arguments в том же порядке и ту же
  12-аргументную `regprocedure`, что exact gate артефакта. Именованные параметры миграции
  `p_user_id ... p_country` один-к-одному соответствуют `$1 ... $12` артефакта.
- В миграции нет ни `GRANT`, ни `REVOKE`; второй `rg` ничего не вернул.
- Строка 13 удаляет точный 10-аргументный предшественник до создания 12-аргументной функции.
- Дверь отвергает не-UUID через тип аргумента, пустые обязательные `method/session_ref`, роли вне
  `client|doctor|admin`, marker не из 32 lowercase hex, country не из двух uppercase букв, неверный
  `inet` и превышение caps 100/8192/100/200/200/500/200.
- Текущий writer формирует `device_kind`, `os`, `browser` из ограниченного parser, а read-side не
  печатает raw `user_agent`, `failure_reason`, marker, неизвестные method/role/outcome или raw country
  code. Текущего пути записать отображаемое машинное слово не найдено.
- `generate-cli.mjs --check` сообщил, что DEV/TEST/PROD privileges и allowlist артефакты побайтно
  соответствуют декларации.

## C. Country directory — FAIL

**В scope owner plan:** да, это прямо checked Л-6б.

Независимый временный helper прочитал исходный gzip как полные диапазоны `[first,last]`, сам разобрал
IPv4 в 32 bit и IPv6 в 128 bit, сделал binary search по raw CSV и детерминированно выбрал 2 500
случайных диапазонов каждого семейства. Для каждого проверены first, last, случайный адрес внутри и
адрес перед first. Helper не использовал builder или parser проверяемого модуля и был удалён после
прогона.

Точная команда:

```bash
cd apps/webapp
node --import tsx ../../.tmp/login-country/audit-raw-compare.mjs
```

Она прочитала 357 325 IPv4 и 359 845 IPv6 raw-диапазонов, проверила 10 000 IPv4 и 10 000 IPv6
адресов и получила 19 расхождений (IPv4: 0, IPv6: 19). Прямая минимальная репродукция одного из них:

```bash
cd apps/webapp
set -euo pipefail
NODE_ENV=test ./node_modules/.bin/tsx -e "import { lookupLoginCountry } from './src/infra/loginCountry.ts'; console.log(lookupLoginCountry('2405:2026:500::2'));"
gzip -cd ../../.tmp/login-country/dbip-country-lite-2026-09.csv.gz | rg -n '^2405:2026:500:'
```

Модуль вернул `HK`, тогда как исходник содержит:

```text
527952:2405:2026:500::,2405:2026:500::1,HK
527953:2405:2026:500::2,2405:2026:ffbf:ffff:ffff:ffff:ffff:ffff,AU
```

Причина доказана кодом builder: `build-country-index.mjs:60-72` отбрасывает младшие 64 бита IPv6,
а `:131-139` удаляет повторные top-64 starts с правилом «первый выигрывает». Утверждение в строке 60,
что страны в датасете никогда не различаются мельче `/64`, опровергается самим исходным датасетом.
Lookup повторяет эту потерю в `loginCountry.ts:106-129`.

Атака parser:

```bash
cd apps/webapp
NODE_ENV=test ./node_modules/.bin/tsx -e "import { lookupLoginCountry } from './src/infra/loginCountry.ts'; const cases=['::ffff:1.2.3.4','::1','fe80::1%eth0','1.2.3','999.1.1.1','0.0.0.0','255.255.255.255','','x'.repeat(4096),'; DROP',' 8.8.8.8 ']; for(const value of cases){try{console.log(JSON.stringify({input:value.length>80?'<4096 x>':value,result:lookupLoginCountry(value)}))}catch(error){console.log(JSON.stringify({input:value.length>80?'<4096 x>':value,threw:String(error)}));process.exitCode=1}}"
```

Ни один input не бросил исключение. Результаты по порядку: `AU`, `null`, `null`, `null`, `null`,
`null`, `null`, `null`, `null`, `null`, `US`. То есть parser-часть этого claim прошла; FAIL вызван
потерей точности индекса.

Память и lazy-load измерены отдельным чистым процессом с forced GC:

```bash
cd apps/webapp
node --expose-gc --import tsx --input-type=module -e "const snap=()=>{global.gc();const m=process.memoryUsage();return{rss:m.rss,heapUsed:m.heapUsed,external:m.external,arrayBuffers:m.arrayBuffers}};const delta=(a,b)=>Object.fromEntries(Object.keys(a).map(k=>[k,b[k]-a[k]]));const before=snap();const {lookupLoginCountry}=await import('./src/infra/loginCountry.ts');const imported=snap();lookupLoginCountry('');const afterEmpty=snap();const started=performance.now();const first=lookupLoginCountry('8.8.8.8');const firstMs=performance.now()-started;const loaded=snap();for(let i=0;i<100000;i++)lookupLoginCountry('8.8.8.8');const repeated=snap();console.log(JSON.stringify({first,firstMs,importDelta:delta(before,imported),emptyDelta:delta(imported,afterEmpty),firstLookupDelta:delta(afterEmpty,loaded),repeat100kDelta:delta(loaded,repeated)}));"
```

Первый lookup занял 185.87 ms; после него `arrayBuffers` выросли на 5 022 674 bytes, RSS — на
52 129 792 bytes. Пустой lookup индекс не загрузил, а 100 000 повторов не добавили array buffers.
Код подтверждает cache один раз на process (`loginCountry.ts:28,55-57`); base64-модуль импортируется
статически, но gunzip и typed arrays создаются при первом непустом lookup.

## D. Device marker — PASS

`sessionCookie.ts:252-264` использует `randomBytes(16).toString('hex')`; это 128-bit CSPRNG marker.
Cookie имеет `httpOnly: true`, `sameSite: lax`, `path: /`, срок 31 536 000 секунд. Прогон:

```bash
cd apps/webapp
NODE_ENV=test SESSION_COOKIE_SECRET='audit-session-secret-0123456789' ./node_modules/.bin/tsx -e "import { ensureDeviceMarkerCookie } from './src/modules/auth/sessionCookie.ts'; const make=(value)=>{const writes=[];const store={get:()=>value===undefined?undefined:{value},set:(...args)=>writes.push(args)};return{store,writes}};const fresh=make(undefined);const first=ensureDeviceMarkerCookie(fresh.store);const existing=make(first);const again=ensureDeviceMarkerCookie(existing.store);const malformed=make('attacker-value');const replaced=ensureDeviceMarkerCookie(malformed.store);const values=new Set();for(let i=0;i<10000;i++){const x=make(undefined);values.add(ensureDeviceMarkerCookie(x.store))}let noGet;try{ensureDeviceMarkerCookie({set:()=>undefined})}catch(error){noGet=String(error)}console.log(JSON.stringify({first,shape:/^[0-9a-f]{32}$/.test(first),preserved:first===again,malformedReplaced:replaced!=='attacker-value'&&/^[0-9a-f]{32}$/.test(replaced),unique10k:values.size,options:fresh.writes[0][2],noGet}));"
```

Получено: правильная форма, существующий marker сохранён, мусор заменён, 10 000 уникальных значений
из 10 000. Объект без `get` бросает `TypeError`, но production-контракт функции требует `get`, а
единственный production-caller (`service.ts:254`) передаёт Next `cookies()`, где `get` есть; пути с
set-only writer не найдено.

Production options проверены отдельно:

```bash
cd apps/webapp
NODE_ENV=production NEXT_PHASE=phase-production-build SESSION_COOKIE_SECRET='production-audit-secret-012345' ./node_modules/.bin/tsx -e "import { buildDeviceMarkerCookieOptions } from './src/modules/auth/sessionCookie.ts'; console.log(JSON.stringify(buildDeviceMarkerCookieOptions()));"
```

Получено `httpOnly=true`, `secure=true`, `sameSite=lax`, `path=/`, `maxAge=31536000`.

Подложить выбранный корректный 32-hex marker можно, потому что cookie не аутентифицирует. Но
`userLoginEventsRead.ts:142` сначала жёстко фильтрует `e.user_id = current user`, а группирует marker
только внутри этих строк. Пользователь A не может добавить строку в список пользователя B, не войдя
как B. При уже украденной аутентификации B известный marker может слить два входа B в одну группу;
это не cross-account injection и новых прав marker не даёт.

## E. Device folding query — FAIL

**В scope owner plan:** да, checked Л-6в требует рабочий список своих устройств.

Формы выражений корректны: `GROUP BY` побайтно повторяет select key; скобки вокруг
`array_agg(...)[1]` корректны; `array_remove(array_agg(DISTINCT country), NULL)` убирает неизвестную
страну. Но `LIMIT 50/200` стоит после `GROUP BY` и не ограничивает вход aggregate. Для одного
пользователя запрос читает всю 395-дневную историю и строит четыре ordered arrays плюс distinct
country до применения LIMIT (`userLoginEventsRead.ts:131-145`).

На DEV выполнен READ ONLY синтаксически эквивалентный запрос с 1 000 000 входов одного устройства:

```bash
TIMEFORMAT='wall=%R user=%U sys=%S'; time sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN READ ONLY; SET LOCAL statement_timeout = '30s'; EXPLAIN (ANALYZE, BUFFERS, SUMMARY) WITH e AS (SELECT '22222222-2222-4222-8222-222222222222'::uuid AS user_id, 'success'::text AS outcome, '0123456789abcdef0123456789abcdef'::text AS device_id, 'ua'::text AS user_agent, clock_timestamp() - g * interval '1 second' AS occurred_at, 'phone'::text AS device_kind, 'Android'::text AS os, 'Chrome'::text AS browser, 'email_password'::text AS method, CASE WHEN g % 2 = 0 THEN 'RU'::text ELSE 'US'::text END AS country FROM generate_series(1, 1000000) AS g) SELECT COALESCE(e.device_id, 'ua:' || md5(COALESCE(e.user_agent, ''))) AS group_key, max(e.device_id), min(e.occurred_at), max(e.occurred_at), count(*)::text, (array_agg(e.device_kind ORDER BY e.occurred_at DESC))[1], (array_agg(e.os ORDER BY e.occurred_at DESC))[1], (array_agg(e.browser ORDER BY e.occurred_at DESC))[1], (array_agg(e.method ORDER BY e.occurred_at DESC))[1], array_remove(array_agg(DISTINCT e.country), NULL) FROM e WHERE e.user_id = '22222222-2222-4222-8222-222222222222'::uuid AND e.outcome = 'success' GROUP BY COALESCE(e.device_id, 'ua:' || md5(COALESCE(e.user_agent, ''))) ORDER BY max(e.occurred_at) DESC LIMIT 50; ROLLBACK;"
```

PostgreSQL обработал все 1 000 000 строк, сделал external merge на 126 280 kB, записал 48 958 temp
blocks и завершил за 2 397.535 ms (`wall=2.446`). Пересчёт temp blocks:

```bash
node -e "console.log((48958*8192/1048576).toFixed(1))"
```

даёт 382.5 MiB временной записи. Это один запрос одного пользователя; LIMIT не защищает ни CPU, ни
temp I/O, ни latency, а параллельные запросы масштабируют ущерб.

## F. Generated privileges — PASS

Команды из B плюс точечный просмотр артефакта показали:

- `privileges.bcb_webapp_dev.sql:20267`: table-level
  `GRANT SELECT ON TABLE public.user_login_events TO app_platform_settings`, следовательно новые
  `device_id` и `country` входят автоматически.
- `:3101`: relation surface 12-аргументной двери перечисляет все 16 колонок таблицы, включая
  `device_id` и `country`, с `INSERT`.
- `:4364`: EXECUTE выдан `app_pre_session`; generated body gate `:2143` содержит оба новых аргумента.
- `node deploy/postgres/privileges/generate-cli.mjs --check` завершился с exit 0 и подтвердил
  побайтное соответствие всех generated artifacts декларации.

## G. Human-facing text — PASS

Сплошь прочитаны:

- `apps/webapp/src/app/app/admin/login-history/page.tsx`;
- `apps/webapp/src/app/app/admin/login-history/LoginHistoryClient.tsx`;
- `apps/webapp/src/app/app/admin/security/page.tsx`;
- `apps/webapp/src/app/app/admin/security/AdminSecurityClient.tsx`;
- `apps/webapp/src/shared/ui/security/loginHistoryText.ts`;
- вызываемые `errorCodeText`, `staffSecurityErrorText` и network fallback.

Проверочный поиск:

```bash
rg -n "error|failure|device\.key|deviceId|userAgent|failureReason|method|role|outcome|country|код|сесс|устройств|вход" apps/webapp/src/app/app/admin/security apps/webapp/src/app/app/admin/login-history apps/webapp/src/shared/ui/security/loginHistoryText.ts
```

Raw `userAgent`, `failureReason`, `deviceId/group_key` и backend error code нигде не рендерятся.
Неизвестные method/role/outcome получают человеческие fallback; country проходит через
`Intl.DisplayNames('ru')` и raw code не показывается. `os/browser` создаются ограниченным UA parser
как продукт и версия, raw UA туда не проходит. Ошибки fetch/load также имеют человеческие fallback.
Нарушения G не найдено.

## H. Honest security screen — PASS

`AdminSecurityClient.tsx:83` называет список «Устройства, с которых входили», не активными
сессиями. Строки `:143-149` обещают только доступное действие: закрыть вход сразу на всех
устройствах, после чего везде потребуется войти заново; там же явно сказано, что один отдельный вход
закрыть нельзя. Это совпадает с variant B и реальным `session_epoch` all-session revoke. Обещания
точечного revoke или знания liveness не найдено.

## I. Journal failure does not fail login — PASS

Временно и по одному были инъецированы три отказа:

1. `resolveCountry` бросает до lookup;
2. `recordUserLoginEvent` бросает до DB adapter;
3. получение `headers()` бросает внутри его защитного `try/catch`.

Для country-инъекции в `persistNewAuthSession` временно подавался `x-real-ip: 8.8.8.8`, чтобы ветка
lookup действительно исполнилась. `persistNewAuthSession` временно экспортировался только для
одноразового вызова. Команда прогона:

```bash
cd apps/webapp
set -euo pipefail
for fault in country db headers; do
  LOGIN_HISTORY_AUDIT_FAULT="$fault" NODE_ENV=test SESSION_COOKIE_SECRET='audit-session-secret-0123456789' ./node_modules/.bin/tsx -e "import { persistNewAuthSession } from './src/modules/auth/service.ts'; (async()=>{const writes=[];const store={get:()=>undefined,set:(...args)=>writes.push(args),delete:()=>undefined};const session={user:{userId:'22222222-2222-4222-8222-222222222222',role:'admin',displayName:'Auditor',bindings:{},sessionEpoch:1},issuedAt:1770000000,expiresAt:1770086400};const result=await persistNewAuthSession(store,session,'email_password');if(result.user.userId!==session.user.userId)throw new Error('session return mismatch');const names=writes.map(entry=>entry[0]);if(!names.includes('bersoncare_webapp_session')||!names.includes('bersoncare_device'))throw new Error('missing cookies: '+names.join(','));console.log(JSON.stringify({fault:process.env.LOGIN_HISTORY_AUDIT_FAULT,returnedUserId:result.user.userId,cookieNames:names}))})().catch(error=>{console.error(error);process.exit(1)});"
done
```

Все три итерации завершились exit 0, вернули того же пользователя и показали cookies
`bersoncare_webapp_session`, `bersoncare_fresh_login`, `bersoncare_device`. Country/DB faults были
залогированы, но наружу не вышли. После прогона инъекции сняты; проверка

```bash
git diff --exit-code -- apps/webapp/src/modules/auth/service.ts apps/webapp/src/app-layer/identity/recordUserLoginEvent.ts
```

завершилась exit 0.

## J. Checked plan items match reality — FAIL

**В scope owner plan:** да; это сверка checked пунктов самого owner plan.

Проверка строк плана:

```bash
rg -n "\[[xX ]\] .*Л-[12345678]|Л-6[бгвд]" docs/_TODO/LOGIN_HISTORY_2026-09-13.md
```

- Л-1: таблица, индексы, FK и закрытая дверь присутствуют — PASS.
- Л-2: declaration/generated grants и полный relation surface присутствуют — PASS.
- Л-3: общий session-birth writer, method и best-effort запись присутствуют — PASS.
- Л-4: 395 дней присутствуют в `journalRetention.ts:22,142,188`, lifecycle registry `:131-145` и
  закрытой SQL-ветке prune — PASS.
- Л-5: route принимает ровно `userId` XOR `ip`, чтение ограничено страницей и экран существует —
  PASS.
- Л-6б: **FAIL**, потому что checked справочник даёт неверную страну части IPv6; это defect C.
- Л-6г: marker, форма, cookie properties и запись в journal присутствуют — PASS.
- Л-6в: экран существует и честен, но его device query не ограничивает число входных строк —
  **FAIL** по работоспособности на большой истории; это defect E.
- Л-7: `loadLastLoginAt` читает `MAX(occurred_at)` из `user_login_events` для обеих сторон merge и
  имеет fallback при отказе — PASS.
- Л-8 не checked и потому не заявлен готовым.

J не добавляет новых defects сверх C и E.

## Kill tally: 2 реальных дефекта

1. **Потеря точности IPv6.** Reproduction из C: raw CSV говорит
   `2405:2026:500::2 → AU`, module отвечает `HK`. Причина — усечение до top 64 bits и first-wins
   дедупликация. **Owner-plan scope: Л-6б.**
2. **Неограниченная свёртка устройств.** Reproduction из E: один READ ONLY aggregate над
   1 000 000 входов до LIMIT прочитал все строки, сделал 126 280 kB external sort и 48 958 temp
   writes, заняв 2 397.535 ms. **Owner-plan scope: Л-6в.**

Вне owner plan findings нет; owner questions по этому аудиту нет.

## Что я НЕ смог проверить и почему

1. **Саму новую дверь и query против фактически мигрированной DEV schema.** Проверено командой:

   ```bash
   sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -At -F '|' -c "BEGIN READ ONLY; SELECT current_database(), current_user, to_regclass('public.user_login_events'), to_regprocedure('app.append_user_login_event(uuid,text,text,text,text,text,text,text,text,text,text,text)'); SELECT COALESCE(string_agg(attname, ',' ORDER BY attnum), '<none>') FROM pg_attribute WHERE attrelid = to_regclass('public.user_login_events') AND attnum > 0 AND NOT attisdropped; ROLLBACK;"
   ```

   DEV вернул `bcb_webapp_dev|postgres||` и `<none>`: таблицы/функции ещё нет. Применять миграции и
   повторять preflight прямо запрещено brief. Поэтому live-вызов двери и точный production query на
   новой таблице **BLOCKED**; синтаксис и ресурсная неограниченность query независимо проверены через
   эквивалентный READ ONLY CTE из E.

2. **Живой браузерный экран на общей DEV.** Owner plan сам отмечает, что он доступен после landing, а
   brief запрещает landing/deploy/migration. Проверены статическая композиция, тексты, access input и
   реальные функции, но end-to-end UI **BLOCKED**.
3. **Каждый внешний login route end-to-end.** Это потребовало бы действующих DB/integration
   credentials и применённой schema. Вместо ложного заявления использованы исчерпывающий поиск всех
   session-cookie writers, разбор всех пяти call sites chokepoint и прямой runtime-вызов самого
   chokepoint. Не найдено production writer, создающего новую сессию в обход него.

Ни один test-файл не создавался и не менялся. Full CI и vitest не запускались по прямому запрету
brief.
