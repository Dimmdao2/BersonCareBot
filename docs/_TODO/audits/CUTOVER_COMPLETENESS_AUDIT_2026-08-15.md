# Cutover completeness audit — 2026-08-15

## Итоговый вердикт

Системный аудит нужен **сейчас, до ручного прохода владельца по страницам**. Ручной проход не обнаружит потерянную tenant-видимость пациентов, загрязнённый тарифный baseline, несовпадение snapshot целевой схемы с текущим DEV и неработающий асинхронный consumer. Более того, ручная мутация данных до устранения первых двух блокеров закрепит неверное состояние и сделает результаты прохода недостоверными.

Решение по классам риска:

- **Сейчас, до следующей полной репетиции:** закрыть B0–B2 ниже; на том же commit выполнить snapshot-check и затем один полный fresh-dump → preparation/backfill → A→B → role/grant/RLS reset → verification прогон. B3 не запрещает перенос данных, но запрещает объявлять email/уведомления принятыми.
- **Сразу после системной репетиции:** автоматизировать безопасную risk-oriented матрицу мутаций и один реальный tick каждого фонового контура на TEST без внешней доставки.
- **После зелёных системных оракулов:** владельцу вручную пройти UI-смысл и браузерные контуры: список и карточку каждого класса пациента, реабилитационную программу, выбор правильного первого тарифа, passkey/OAuth, media playback и разрешённую тестовую доставку.

Иными словами: ждать полного ручного просмотра страниц нерационально. Он нужен как поздний поведенческий слой, а не как способ искать системные cutover-дефекты.

Аудит был read-only: fresh PROD dump только читался через `pg_restore`; TEST/PROD БД, сервисы, конфигурация и TaskDB не менялись; deploy, restart, реальные уведомления и полный CI не запускались. Актуальная authority — `docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md` и owner-решение о fresh PROD dump → одна A→B транзакция → точная DEV-схема → декларативный reset ролей/grants/RLS → проверка. Более старые DEV→TEST планы не трактовались как активное требование.

## Подтверждённые блокеры и дефекты

### B0 — BLOCKER: пациенты с реальными данными теряют tenant enrollment

**Достижимый сценарий.** Generic copy переносит patient/clinical/program/task/support таблицы и проставляет им canonical `organization_id`, но `org_enrollments` и `patient_specialist_links` восстанавливаются только из неудалённых `be_appointments`: `deploy/postgres/prod-to-target-cutover-data.sql:389`. Pre-stage проверяет owner/specialist/Rubitime, но не полный patient-domain → enrollment инвариант: `deploy/postgres/pre-cutover-data-stage-assertions.sql:27`. Финальный gate проверяет enrollment только у пациентов, присутствующих в `be_appointments`: `deploy/postgres/prod-to-target-cutover-finish.sql:77`.

На свежем dump есть активные canonical client identities с patient-domain фактами, но без appointment/Rubitime факта, из которого текущий transition мог бы создать enrollment:

```bash
sudo -u postgres node --input-type=module <<'NODE'
import { execFileSync } from 'node:child_process';
const sql=execFileSync('pg_restore',['--data-only','--file=-','/tmp/bcb-prod-fresh.dump'],{encoding:'utf8',maxBuffer:256*1024*1024});
const specs = new Map([
 ['public.platform_users',['id','phone_normalized','role','is_archived','merged_into_id']],
 ['public.be_appointments',['platform_user_id','phone_normalized','deleted_at']],
 ['public.appointment_records',['platform_user_id','phone_normalized','deleted_at']],
 ['public.patient_bookings',['platform_user_id','contact_phone']],
 ['integrator.rubitime_records',['phone_normalized']],
 ...['clinical_anamnesis_illness','clinical_anamnesis_lifestyle','clinical_anamnesis_trauma','clinical_complaint','clinical_diagnosis','clinical_visit','doctor_patient_support','media_folders','patient_comorbidity','patient_files','patient_lfk_assignments','patient_payment','program_action_log','program_item_discussion_messages','program_item_discussion_reads','specialist_tasks','test_attempts','treatment_program_instances'].map((name)=>[`public.${name}`,['patient_user_id']]),
]);
const rows = new Map(); const lines=sql.split('\n');
for(let i=0;i<lines.length;i++){const m=lines[i].match(/^COPY ((?:public|integrator)\.[a-z0-9_]+) \((.*)\) FROM stdin;$/);if(!m)continue;const need=specs.get(m[1]);if(!need){while(++i<lines.length&&lines[i]!=='\\.'){}continue;}const cols=m[2].split(', ');const ix=need.map(n=>cols.indexOf(n));const out=[];while(++i<lines.length&&lines[i]!=='\\.'){const v=lines[i].split('\t');out.push(Object.fromEntries(need.map((n,j)=>[n,ix[j]<0||v[ix[j]]==='\\N'?null:v[ix[j]]])));}rows.set(m[1],out);}
const users=new Map((rows.get('public.platform_users')??[]).map(r=>[r.id,r])); const coveredIds=new Set(); const appointmentPhones=new Set();
for(const r of rows.get('public.be_appointments')??[]){if(!r.deleted_at&&r.platform_user_id)coveredIds.add(r.platform_user_id);if(!r.deleted_at&&r.phone_normalized)appointmentPhones.add(r.phone_normalized);}
for(const r of rows.get('public.appointment_records')??[]){if(!r.deleted_at&&r.platform_user_id)coveredIds.add(r.platform_user_id);if(!r.deleted_at&&r.phone_normalized)appointmentPhones.add(r.phone_normalized);}
for(const r of rows.get('public.patient_bookings')??[]){if(r.platform_user_id)coveredIds.add(r.platform_user_id);if(r.contact_phone)appointmentPhones.add(r.contact_phone);}
for(const r of rows.get('integrator.rubitime_records')??[])if(r.phone_normalized)appointmentPhones.add(r.phone_normalized);
const domain=new Set(); for(const [table,rs] of rows)if(specs.get(table)?.includes('patient_user_id'))for(const r of rs)if(r.patient_user_id)domain.add(r.patient_user_id);
const uncovered=[...domain].filter(id=>!coveredIds.has(id));
const canonical=uncovered.filter(id=>{const u=users.get(id);return u?.role==='client'&&!u.merged_into_id&&u.is_archived!=='t';});
const canonicalNoPhoneFact=canonical.filter(id=>{const p=users.get(id)?.phone_normalized;return !p||!appointmentPhones.has(p);});
console.log(`uncovered patient-domain identities=${uncovered.length}`);
console.log(`uncovered active canonical clients=${canonical.length}`);
console.log(`uncovered active canonical clients whose phone has no appointment/Rubitime fact=${canonicalNoPhoneFact.length}`);
NODE
```

Результат этой команды:

```text
uncovered patient-domain identities=19
uncovered active canonical clients=18
uncovered active canonical clients whose phone has no appointment/Rubitime fact=18
```

**Impact.** Doctor roster фильтруется по активному enrollment (`apps/webapp/src/infra/repos/pgDoctorClients.ts:76`, `apps/webapp/src/infra/repos/pgDoctorClients.ts:283`). Patient organization resolver возвращает `no_active_enrollment` (`apps/webapp/src/modules/patient-organization/service.ts:60`), после чего patient layout показывает recovery screen вместо программы (`apps/webapp/src/app/app/patient/layout.tsx:84`). Это не физическое удаление строк, но реальная потеря доступа врача и пациента к уже перенесённым программам/карточкам/задачам.

**Обязательный oracle.** До уничтожения source schemas сформировать expected patient-domain membership manifest; после cutover потребовать ровно один active enrollment в canonical organization для каждого active canonical client с любым clinical/program/task/support/patient-card фактом и требуемую specialist link. Gate должен охватывать не только `be_appointments`.

Дополнительный table-level сигнал: generic copy молча делает `CONTINUE`, если target-таблице нет одноимённого source (`deploy/postgres/prod-to-target-cutover-data.sql:37`) или нет общей same-type колонки (`deploy/postgres/prod-to-target-cutover-data.sql:41`). В dump и target inventory есть непересекающиеся таблицы; не все они дефекты, но без явного disposition allowlist их сохранность не доказана:

```bash
src=$(mktemp); tgt=$(mktemp); nonempty=$(mktemp); sudo -u postgres pg_restore --list /tmp/bcb-prod-fresh.dump | awk '$4=="TABLE" && ($5=="public"||$5=="integrator"||$5=="drizzle"){print $5"."$6}' | sort -u > "$src"; sed -nE 's/^CREATE TABLE ([a-z_]+\.[a-zA-Z0-9_]+) \(.*/\1/p' deploy/postgres/generated/prod-to-target/schema-pre.sql | sort -u > "$tgt"; sudo -u postgres pg_restore --data-only --file=- /tmp/bcb-prod-fresh.dump | awk '/^COPY (public|integrator|drizzle)\./{name=$2; rows=0; in_copy=1; next} in_copy && $0=="\\."{if(rows>0)print name; in_copy=0; next} in_copy{rows++}' | sort -u > "$nonempty"; printf 'source_only=%s; source_only_nonempty=%s\n' "$(comm -23 "$src" "$tgt" | wc -l)" "$(comm -12 <(comm -23 "$src" "$tgt") "$nonempty" | wc -l)"; rm -f "$src" "$tgt" "$nonempty"
```

Результат: `source_only=45; source_only_nonempty=28`. Нужен reviewed mapping `copy / transform / intentionally retire` именно для этих source-only relations; B0 уже доказывает один реальный пропуск.

### B1 — HIGH: в целевой billing baseline попадает активный DEV-тариф

**Достижимый сценарий.** Generator переносит из live DEV не только migration ledgers, но и данные `public.saas_tariffs` и policies: `scripts/refresh-prod-to-target-cutover.mjs:32`. В сгенерированном baseline активен synthetic тариф `DEV Trial` без цены/валюты и с пустыми mechanics: `deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql:587`.

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
const source=fs.readFileSync('deploy/postgres/generated/prod-to-target/ledgers-and-baseline.sql','utf8');
const rows=[];
for(const match of source.matchAll(/INSERT INTO public\.saas_tariffs \(([^)]*)\) VALUES \(([\s\S]*?)\);/g)){
 const cols=match[1].split(',').map(s=>s.trim()); const vals=[]; let cur='',quoted=false,depth=0;
 for(let i=0;i<match[2].length;i++){const ch=match[2][i],next=match[2][i+1];if(ch==="'"&&quoted&&next==="'"){cur+="''";i++;continue;}if(ch==="'"){quoted=!quoted;cur+=ch;continue;}if(!quoted&&ch==='(')depth++;if(!quoted&&ch===')')depth--;if(!quoted&&depth===0&&ch===','){vals.push(cur.trim());cur='';}else cur+=ch;} vals.push(cur.trim());
 rows.push(Object.fromEntries(cols.map((c,i)=>[c,vals[i]])));
}
const unquote=v=>v?.startsWith("'")?v.slice(1,-1).replace(/''/g,"'"):v;
const active=rows.filter(r=>r.is_active==='true'); const synthetic=active.filter(r=>/DEV|TEST|AUDIT|delete-me/i.test(unquote(r.name)));
console.log(`seeded saas_tariffs=${rows.length}; active=${active.length}; active synthetic-name=${synthetic.length}`);
console.log(`active synthetic names=${synthetic.map(r=>unquote(r.name)).join(' | ')||'none'}`);
NODE
```

Результат:

```text
seeded saas_tariffs=8; active=5; active synthetic-name=1
active synthetic names=DEV Trial
```

**Impact.** Список выбора отдаёт все active тарифы без дополнительного допуска (`apps/webapp/src/infra/repos/pgSaasBilling.ts:343`). Для организации без назначенного тарифа первый выбор сразу запускает first-tariff/trial path (`apps/webapp/src/modules/saas-billing/service.ts:1028`). Владелец может выбрать synthetic DEV plan и получить неверный entitlement, trial/billing state и недостоверную финансовую приёмку.

**Обязательный oracle.** Baseline должен собираться из reviewed target tariff catalog, а gate — отклонять active synthetic/test rows и активные тарифы без обязательных billing/access полей. До этого ручной выбор тарифа не выполнять.

### B2 — HIGH: one-process reset не гарантирует, что A→B snapshot соответствует тому же commit

**Достижимый сценарий.** Snapshot generator/check существует как отдельная package-команда, но destructive wrapper его не вызывает:

```bash
rg -n "check:prod-to-target-cutover|refresh-prod-to-target-cutover|check.*prod-to-target" deploy/host/deploy-test-full-reset.sh deploy/host/deploy-test-saas.sh || printf 'no wrapper invocation\n'
```

Результат: `no wrapper invocation`.

На проверенном checkout snapshot сейчас совпадает с текущей DEV schema B:

```bash
pnpm run check:prod-to-target-cutover
```

Результат:

```text
ok schema-pre.sql
ok schema-post.sql
ok ledgers-and-baseline.sql
ok runtime-settings.sql
prod-to-target cutover snapshot matches current DEV schema B
```

Но команды refresh/check остаются только ручными script entrypoints (`package.json:51`), тогда как wrapper непосредственно исполняет сохранённый `deploy/postgres/prod-to-target-cutover.sql`. Если после generation появляется новая migration/schema/config baseline change, wrapper может поставить старую B и всё равно пройти свои узкие финальные gates. Impact — runtime/build integration failure после рестарта либо тихое отсутствие нового DB-объекта.

**Обязательный oracle.** На commit, который запускает rehearsal, `pnpm run check:prod-to-target-cutover` должен быть обязательным preflight того же единого процесса до первого destructive шага. Текущее зелёное состояние закрывает риск только для этого checkout, не воспроизводимость процесса.

### B3 — HIGH acceptance defect: `DONE` не доказывает email/notification delivery

**Достижимый сценарий.** SMTP preflight принимает любую единственную строку, где `value_json.value` лишь не JSON `null`; он не валидирует host/from/port, credentials, TLS, recipient или round-trip (`deploy/host/deploy-test-saas.sh:320`). Затем reset восстанавливает snapshot (`deploy/host/deploy-test-saas.sh:3694`) и может вывести `DONE` (`deploy/host/deploy-test-saas.sh:3744`). Конфигурация с непустым envelope и просроченным паролем либо `{"value":{}}` проходит этот predicate, но auth recovery, приглашения и reminders не доставляются.

**Impact.** Обязательный асинхронный путь человека не работает, хотя cutover сообщает успех. То же разделение относится к Telegram/MAX/SMSC/webpush: row/config/queue existence не равно provider acceptance и доставке.

**Граница.** Это не доказательство, что текущий SMTP provider неисправен; статически доказан false-success path. В рамках этого аудита реальная отправка запрещена. После cutover нужен allowlisted TEST round-trip с наблюдением queue → attempt → provider/message receipt; до него формулировка результата должна быть «DB/schema/runtime ready, external delivery unverified».

## Доказанные закрытые классы риска

| Область | Что переносится / invariant | Имеющийся fail-fast или доказательство | Остаточная граница |
| --- | --- | --- | --- |
| Canonical user merge/dedup и роли | Owner consolidation перепривязывает известные FK, удаляет только reviewed dead identities и запрещает dangling refs | `apps/webapp/scripts/consolidate-owner-identity.sql:22`; pre-stage фиксирует один canonical active specialist и canonical doctor (`deploy/postgres/pre-cutover-data-stage-assertions.sql:27`) | B0: patient membership выводится из слишком узкого факта |
| Credentials, verified contacts, preferred channel | Common-table copy сохраняет password credentials и channel preferences; `user_identity` строится только для unmerged users, phone/email contacts сохраняют существующие trust/verified timestamps | `deploy/postgres/prod-to-target-cutover-data.sql:293`; final gate требует `user_identity` для каждого canonical user (`deploy/postgres/prod-to-target-cutover-finish.sql:59`) | Фактический login по каждому каналу — runtime acceptance |
| FIO CSV/manual overrides | Full-reset hash-привязывает reviewed packet, применяет owner-approved consolidation и FIO corrections до A→B | `deploy/host/deploy-test-saas.sh`; `deploy/postgres/pre-cutover-data-stage-assertions.sql` | Визуальная правильность FIO остаётся ручной |
| Rubitime appointments и specialist identity | Reviewed transfer/mapping выполняется до A→B; pre-stage запрещает live unresolved appointment, unmapped raw record и duplicate mapping | `deploy/postgres/pre-cutover-data-stage-assertions.sql:57` | UI semantics времени/статуса и внешний Rubitime API статически не доказаны |
| Patient cards, rehabilitation programs, tasks, clinical rows | Same-name/same-type columns копируются, новый required `organization_id` инъецируется canonical organization; schema-post накладывает constraints после data copy | `deploy/postgres/prod-to-target-cutover-data.sql:3`; `deploy/postgres/prod-to-target-cutover.sql:5` | B0 делает часть перенесённых строк недоступной |
| Legacy retry debt/outbox | Live Rubitime retry rows (`pending`/`processing`) переводятся в canonical outgoing queue с event-id dedup | `deploy/postgres/prod-to-target-cutover-data.sql:360`; final queue checks находятся в том же data transition | Provider delivery и обработка dead-letter требуют runtime ticks |
| Runtime configuration projection | Canonical PROD `system_settings` values перекрывают same-key DEV-generated runtime registry до удаления source schemas | `deploy/postgres/prod-to-target-cutover-finish.sql:3` | Новые/отсутствующие keys, OAuth/provider acceptance и B3 проверяются отдельно |
| Atomic A→B | schema-pre → data → ledgers/baseline → runtime settings → schema-post → finish включены в одну `ON_ERROR_STOP` транзакцию; source schemas удаляются перед final gates и commit | `deploy/postgres/prod-to-target-cutover.sql:1`; `deploy/postgres/prod-to-target-cutover-finish.sql:17` | Snapshot freshness — B2 |
| Functions/views/triggers/sequences/defaults/constraints/indexes/extensions | DEV `pg_dump` pre/post snapshots несут schema objects; sequence reseed идёт после explicit-id copy | `scripts/refresh-prod-to-target-cutover.mjs`; `deploy/postgres/prod-to-target-cutover-data.sql:437`; текущий check выше зелёный | Owners/grants/RLS намеренно не берутся из dump и закрываются overlay |
| Owners/grants/RLS/runtime principals | Strict closure заново ставит roles/grants, test overlay, FORCE RLS, port-context capabilities, затем проверяет live auth и cross-contour access | `deploy/host/deploy-test-saas.sh:3061` | GET/health не заменяет role-oriented write matrix |
| Migration ledgers | Drizzle/integrator ledgers и target baseline фиксируются из текущего DEV; исторические alias/hash reconciliation уже реализованы runner-ом | `scripts/refresh-prod-to-target-cutover.mjs:32`; `apps/webapp/scripts/run-webapp-drizzle-migrate.mjs:167` | Нужна read-only post-cutover сверка ledger с checkout; B2 делает её обязательной |
| TEST isolation | Flow явно адресует TEST DB/units и после перехода ставит target-only port context | `deploy/host/deploy-test-full-reset.sh`; `deploy/host/deploy-test-saas.sh:3738` | Никакого вывода о PROD readiness из этого аудита нет |

Старые source-only tables сами по себе не объявлены дефектами: часть — явно retired legacy. Finding возникает только там, где есть достижимое последствие; B0 — такой доказанный случай. Аналогично отсутствие старых PIN/setup-token путей не восстанавливалось как требование: актуальный post-production identity authority их не требует.

## Конфигурация и destructive/reset границы

| Класс | Что делает transition/reset | Что ещё надо доказать |
| --- | --- | --- |
| SMTP/email sender | Сохраняет TEST `smtp_outbound` отдельно, reset scrubs settings, затем восстанавливает snapshot | B3: auth/TLS/round-trip и реальная allowlisted доставка |
| Auth policies, verified identity, OAuth | PROD same-key settings сохраняются; отсутствующие target admin keys создаются с пустым значением, не подменяя существующее (`deploy/postgres/prod-to-target-cutover-finish.sql:21`) | Password login автоматизировать; passkey/OAuth redirects/provider callback проверить браузером и у provider |
| S3/media metadata | DB metadata/common tables и target settings переносятся; media worker unit входит в closure | Физическое существование объектов, presign, HLS/MP4 playback, transcode claim/complete |
| Timezone и notification templates | Same-name settings/tables копируются, test overlay меняет только TEST-owned safety/runtime values | По одному reminder вокруг timezone/DST boundary и rendering шаблона |
| Tariffs/billing/provider settings | Target policies/catalog сейчас приходят из DEV baseline; same-key provider settings сохраняются | B1; затем sandbox/allowlisted provider handshake без реальных денег |
| Runtime projections | Registry берётся из target DEV, same-key values — из restored canonical settings | Запретить silent missing required key и проверить consumers после restart |
| Operator/cron | DB/operator overlays и internal signed routes ставятся closure; host cron не является частью schema transaction | Наличие cron записи недостаточно: нужен observed signed tick и его journal/effect |

Destructive точки — полный drop/recreate TEST, reset `system_settings` test overlay, удаление `cutover_source_*`, reset runtime principals/grants/RLS. Их порядок в целом соответствует owner-решению; ложный успех остаётся в B2/B3, а неполная data derivation — в B0.

## Фоновые и асинхронные пути, не доказанные открытием страниц

- Integrator worker: claim/retry/dead-letter для canonical outgoing queue и перенесённого legacy retry debt.
- Scheduler/internal signed routes: specialist reminders, SaaS renewal, operator/system health, digest/retention.
- Email/SMS/Telegram/MAX/webpush: channel policy, allowlist/suppression, provider acceptance, retry и terminal state.
- Media worker: enqueue → claim → transcode/preview → ready/failure, multipart cleanup и pending-delete purge.
- Cron: наличие расписания, корректный signature/config audience и наблюдаемый tick.
- Runtime projections: consumer читает новый `app_runtime_settings`, а не только факт наличия row.

Активный systemd unit и HTTP health доказывают только процесс/endpoint. Они не доказывают, что после schema cutover worker может взять конкретную задачу, записать result под новой RLS/grant моделью и перевести её в terminal state.

## Неизвестное / статически непроверяемое

- Фактическая финальная TEST БД: полный reset/rehearsal этим аудитом не выполнялся, поэтому post-cutover row/hash invariants ещё не измерены.
- Внешние provider paths: SMTP, Telegram, MAX, SMSC, webpush, OAuth, calendar и payment provider.
- S3 object existence, реальные presign URLs, HLS/MP4 playback и FFmpeg/transcode lifecycle.
- Клиническая/визуальная корректность FIO, appointment time/status, patient card, rehab program и текстов.
- Browser-bound auth: passkey, OAuth popup/redirect, cookie/session transitions.
- Ручной выбор первого тарифа и отображение entitlement после него; до B1 выполнять нельзя.
- Полнота host cron определяется не только DB/repo; нужен post-reset read-only inventory плюс observed tick.

## Минимальный post-cutover acceptance harness

### 1. До destructive шага

1. Выполнить обязательный same-SHA oracle `pnpm run check:prod-to-target-cutover` — это B2 gate, не полный CI.
2. Использовать существующие hash-bound FIO/Rubitime/test access packets и штатный `deploy/host/deploy-test-full-reset.sh`; не собирать вторую последовательность вручную.
3. Из fresh dump получить read-only manifest и hashes/counts по классам, а не только общий table count:
   - canonical users, roles, merge links, credentials, verified contacts, preferences/bindings;
   - appointments + external Rubitime mappings;
   - patient-domain identities + expected membership/link;
   - programs/tasks/clinical/card/media references;
   - queues by live/terminal state;
   - settings by `(key, scope, organization_id)` без печати secrets;
   - tariffs/policies/subscriptions/invoices/payment facts.
4. Для каждой nonempty source-only relation иметь reviewed disposition `transform / archive-retire`; generic silent `CONTINUE` не считать доказательством.

### 2. После единого wrapper

1. Переиспользовать встроенные pre-stage, final-shape, role/grant/RLS, live-login и cross-contour gates.
2. Сверить manifest: canonical identity cardinality/reference closure, credentials/contact trust, Rubitime one-to-one, programs/tasks/card/media ownership, live queues, settings и money facts.
3. Добавить B0 oracle по всем patient-domain facts и выборочно открыть тем же synthetic users doctor roster + patient program.
4. Read-only сравнить schema fingerprint с generated B: schemas, extensions, types, functions, views, triggers, sequences/defaults, constraints/indexes, owners, grants, RLS/FORCE и оба migration ledgers.
5. Проверить B1 tariff catalog и first-choice transition на отдельной synthetic organization; удалить synthetic mutation штатным API/fixture cleanup.

### 3. Минимальная risk-oriented write/background matrix

| Роль / контур | Безопасно автоматизировать на TEST сейчас | Ручная/owner-controlled проверка после системных gates |
| --- | --- | --- |
| Anonymous/auth | `POST /api/auth/email-password/login`; неверный credential; `POST` start/confirm только на synthetic identity; cross-role denial | Passkey, OAuth/provider redirect, реальный recovery email |
| Doctor | На synthetic patient: `POST` manual appointment, task/program assignment/comment; `PATCH` FIO/program/task; `DELETE` созданный comment/program item/file; затем cleanup и invariant comparison | Реальная карточка пациента, клинический смысл программы, расписание и Rubitime status/time |
| Patient | На synthetic enrollment: `POST` practice completion/message/reminder; `PATCH` feeling/reminder; `DELETE` созданный reminder; проверить doctor-side visibility | Реальный patient UI, программа/медиа, тексты и notification preference UX |
| Clinic owner | Reversible settings `PATCH` только с exact before-value restore; first-tariff path только после B1 на отдельной synthetic organization | Выбор правильного первого тарифа и понятность access/trial/billing UI |
| Global admin | Negative tenant-boundary checks; CRUD synthetic notification template/media folder with cleanup | Provider secrets, OAuth/calendar setup и любые реальные деньги |
| Internal/worker | Signed `POST` по одному internal tick; synthetic queued event с запрещённой внешней доставкой; дождаться terminal DB state; media worker synthetic object lifecycle | Allowlisted real email/channel receipt, S3/HLS playback и provider acceptance |

Route matrix основана на реальных handlers, среди прочего: doctor manual appointment (`apps/webapp/src/app/api/doctor/booking-engine/appointments/manual/route.ts:27`), doctor task (`apps/webapp/src/app/api/doctor/tasks/route.ts:48`), patient completion (`apps/webapp/src/app/api/patient/treatment-program-instances/[instanceId]/items/[itemId]/progress/complete/route.ts:16`), patient reminder PATCH/DELETE (`apps/webapp/src/app/api/patient/reminders/[id]/route.ts:13`), admin setting PATCH/DELETE (`apps/webapp/src/app/api/admin/settings/route.ts:440`), media upload/presign/confirm (`apps/webapp/src/app/api/media/upload/route.ts:92`, `apps/webapp/src/app/api/media/presign/route.ts:26`, `apps/webapp/src/app/api/media/confirm/route.ts:19`) и internal SaaS renewal/media worker ticks (`apps/webapp/src/app/api/internal/saas-billing/renewal/tick/route.ts:37`, `apps/webapp/src/app/api/internal/media-worker/control/route.ts:39`).

Existing focused route/service tests и `docs/_TODO/SAAS_FOUNDATION/scripts/smoke-patient-write-actions.mjs` следует переиспользовать как оракулы. Полный CI не нужен: конкретный непокрытый integration risk здесь — только связка restored data → new schema → new roles/RLS → mutation/background terminal state, её и должен проверять harness.

## TaskDB workstream

TaskDB не менялся. Точный поиск:

```bash
node /home/dev/brain/tools/taskdb.mjs find bcb "Prod cutover"
```

Результат:

```text
#996 {bcb} [done] Prod cutover: ONE consolidated runbook + close blocked steps + fresh-dump rehearsal
— найдено 1
```

Это существующий связанный workstream. Его `[done]` не является evidence полноты текущего fresh-dump A→B transition и противоречит подтверждённым B0–B2; аудит карточку не редактирует.

## Вопросы владельцу

Нет вопроса, без которого меняется вывод аудита. Сохранность пациентов с уже существующими domain facts, отсутствие synthetic DEV tariff в пользовательском выборе и воспроизводимое соответствие target текущему DEV следуют из действующего owner-решения, а не требуют нового продуктового выбора.
