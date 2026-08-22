# D17: независимая перепроверка ситуации 22.08

**Роль:** независимая адверсарная перепроверка по прямому распоряжению владельца 22.08.
**Authority:** `WORK_ORDER.md`, D17 и D15b; оракул —
`D17_RELATION_READERS_2026-08-22.md`.
**Границы:** код и миграции не менялись; `--execute`, TEST, PROD и push не запускались. Все записи в
DEV ниже сделаны внутри транзакций, завершённых `ROLLBACK`.

## Итог без смягчения

1. **Конечное направление верное, промежуточное состояние — нет.** Именной корень с точной операцией,
   аргументами и `EXECUTE` одной роли действительно уже широкого реляционного членства. Но пока
   `bcb_dev_integrator` остаётся членом `app_tenant_service`, прежняя дверь не закрыта: сегодняшняя
   эффективная власть логина не уменьшилась, а число функций, capability-строк, ACL и способов разъехаться
   выросло. Сейчас получена сложность без выигрыша; выигрыш возникнет только в момент отзыва членства.
2. **Фраза «`SECURITY DEFINER` обходит RLS» технически неверна, но описывает здешний эффект.** Ни один из
   проверенных владельцев не `SUPERUSER` и не `BYPASSRLS`, а таблицы несут `RLS + FORCE RLS`. Однако RLS-
   политики явно разрешают seam-owner по `CURRENT_USER`, поэтому тело корня фактически видит все строки.
   Стена действительно переехала в тело функции — не из-за свойства `SECURITY DEFINER` самого по себе, а
   из-за сочетания definer-owner с разрешающими seam-политиками.
3. **В DEV уже есть достижимая поломка приземлённого reader-корня.** Новое тело
   `app.integrator_read_channel_binding_identity` зовёт `app.integrator_context_installed()`, но его владелец
   `app_seam_identity_lookup_owner` не имеет `EXECUTE`; второй capability-двери класса `integrator` в живом
   каталоге тоже нет. Реальный tenant-вызов падает `42501`. Значит входящее событие с известной клиникой
   сегодня не опознаёт получателя; integrator-маршрут не доходит даже до БД из-за отсутствующей capability.
4. **«Три структурных барьера» — неверный диагноз.** Один принятый контекст на транзакцию и запрет
   `runIntegratorNamedRoot` внутри открытого `db.tx` реальны. Но это ограничение выбранного adapter-протокола,
   а не PostgreSQL и не неизбежность предметной операции. Один из названных блокеров вообще мёртв: у
   `content.access.grant.create` нет production-потребителя, а его таблицы нет в DEV. Тот же код уже заканчивает
   read-only `db.tx`, а затем открывает named root. Барьер не структурный.
5. **Самая лишняя работа 22.08:** `integrator_upsert_content_access_grant` построен для мёртвого пути и
   отсутствующей таблицы. Следом идут отдельный helper `integrator_context_installed()` и ручной тест второй
   двери. Helper существует только для ветвления одной функции между двумя классами контекста, добавил ещё
   один ACL и стал причиной текущего отказа. Тест вручную копирует обе capability-строки и физический клиент
   не исполняет ни `begin_port_context`, ни функцию — поэтому зелёный ровно при реально сломанном DEV.
6. **Глобальный lexical-гейт не бесполезен, но переоценён.** Он нашёл настоящие уязвимые корни, и live-инъекция
   подтверждает четыре достижимых foreign-org вызова. Но он добавил 1 247 строк и 45 исключений, имеет прямо
   записанные семантические слепые зоны и не является доказательством tenant isolation. Как разовый census —
   полезен; как постоянная «стена базы» — машинерия, значительная часть которой проверяет саму себя.

## 1. Живые находки в уже приземлённом

### F1 — DEV-каталог reader-двери разъехался с декларацией; маршрут реально падает

В живой базе есть миграции reader-корней и второй двери, но отсутствует последующий privilege reconcile:

```text
$ sudo -n -u postgres psql -X -At -F '|' -h /var/run/postgresql -p 5432 -d bcb_webapp_dev
SELECT tag
FROM drizzle.__drizzle_migrations
WHERE tag IN (
  '20260822T150000_the_integrator_readers_get_named_roots',
  '20260822T190000_the_incoming_recipient_door_opens_for_the_integrator_principal',
  '20260822T200000_tenant_definer_roots_validate_their_organization'
)
ORDER BY tag;
20260822T150000_the_integrator_readers_get_named_roots
20260822T190000_the_incoming_recipient_door_opens_for_the_integrator_principal

SELECT count(*) AS expected_tags_present
FROM drizzle.__drizzle_migrations
WHERE tag IN (
  '20260822T150000_the_integrator_readers_get_named_roots',
  '20260822T190000_the_incoming_recipient_door_opens_for_the_integrator_principal',
  '20260822T200000_tenant_definer_roots_validate_their_organization'
);
2
```

Три независимых каталожных факта:

```text
SELECT pg_get_functiondef(to_regprocedure('app.integrator_read_channel_binding_identity(text,text,text)'))
       ~ 'app[.]integrator_context_installed[(][)]';
t

SELECT has_function_privilege('app_seam_identity_lookup_owner',
                              'app.integrator_context_installed()', 'EXECUTE');
f

SELECT count(*) FROM app_ext.port_context_capabilities
WHERE purpose='integrator.channel-binding-identity.read';
1
```

Генерированный источник при этом содержит **две** строки, а generated privileges — нужный grant:

```text
rg -c "integrator_read_channel_binding_identity" \
  deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql
2

rg -c 'GRANT EXECUTE ON FUNCTION app\.integrator_context_installed\(\) TO "app_seam_identity_lookup_owner"' \
  deploy/postgres/generated/privileges.bcb_webapp_dev.sql
1
```

То есть дефект — не отсутствующая декларация, а неатомарное приземление migration + reconcile.

Живая проба прошла настоящие `app.begin_port_context` и функцию под
`SET SESSION AUTHORIZATION bcb_dev_integrator`; транзакция закончилась `ROLLBACK`:

```text
begin_port_context
------------------

ERROR: 42501: permission denied for function integrator_context_installed
CONTEXT: PL/pgSQL function integrator_read_channel_binding_identity(text,text,text) line 9 at PERFORM
ROLLBACK
```

Impact достижим: `platformUserByChannel.ts:52-65` вызывает этот корень для организационного и
интеграторского принципала. У организационного первая дверь находится, затем корень падает как выше. У
интеграторского capability-подбор (`portContextRuntime.ts:209-229`) находит ноль строк, потому что второй двери
в каталоге нет, и бросает `Missing unique declared integrator port capability`. Bootstrap правильно пропускает
чтение.

### F2 — тест второй двери зелёный по нарисованной реальности

Команда:

```text
pnpm --dir apps/integrator exec vitest run \
  src/infra/db/repos/platformUserReaders.namedRoot.unit.test.ts \
  src/kernel/domain/incomingRecipientDoor.audit.test.ts

Test Files  2 passed (2)
Tests      14 passed (14)
```

Но `incomingRecipientDoor.audit.test.ts:31-67` вручную объявляет обе capability, включая отсутствующую в DEV
`06d28c89-65a6-52cc-85cf-635f5c11b0de`, а `portContextHarness` возвращает строку при совпадении текста запроса. Он не исполняет
`app.begin_port_context`, не проверяет каталог, ACL helper-а и тело корня. Это не DB-аудит двери, а unit-тест
выбора заранее нарисованного дескриптора. Его зелёный цвет противоречит живой пробе F1 и ничего не доказывает
о достижимости двери.

### F3 — шесть исправлений есть в Git, но не в DEV; четыре чужих вызова сегодня проходят

Команда:

```text
RUN_DEFINER_TENANT_SIX_ROOTS_DB=1 \
  node --test deploy/postgres/privileges/definer-tenant-six-roots.devDbProof.test.mjs
```

Свежий вывод rollback-пробы:

```text
apply_foreign_before=true
refresh_foreign_before=true
release_foreign_before=not_superseded
reminder_foreign_before=true

apply_foreign_after=42501|saas_billing_organization_context_denied
refresh_foreign_after=42501|saas_billing_organization_context_denied
release_foreign_after=42501|saas_billing_organization_context_denied
reminder_foreign_after=42501|reminder_occurrence_organization_context_denied
dead_root_before=true
dead_root_after=false
```

Тест материализует candidate-тела внутри транзакции и откатывает их. Это доказывает сразу два факта: Git-
исправления правильные для проверенного класса, но живые тела DEV до них принимают чужую организацию. Тег
`20260822T200000_tenant_definer_roots_validate_their_organization` отсутствует в
`drizzle.__drizzle_migrations`. Поэтому утверждение «шесть корней закрыты» верно для ветки, но неверно для
сегодняшней DEV-ситуации.

### F4 — membership-proof стал ложной записью о несущих читателях

Команда всё ещё зелёная:

```text
RUN_INTEGRATOR_MEMBERSHIP_DB=1 \
  node --test deploy/postgres/privileges/integrator-login-membership-load.devDbProof.test.mjs

tests 3; pass 3
```

Количество записей измерено так:

```text
sed -n '/const TENANT_SERVICE_READS = \[/,/^\];/p' \
  deploy/postgres/privileges/integrator-login-membership-load.devDbProof.test.mjs \
  | rg -c "^  \['public\."
6
```

Первые три строки массива `TENANT_SERVICE_READS` ссылаются на
`platformUserByChannel.ts:127-129`. Сейчас строка 127 — конец функции, а реальные четыре чтения из файла
удалены и заменены root-вызовами (`platformUserByChannel.ts:7-18,52-65`). Проверка отвечает только на вопрос
«у какой роли до сих пор есть эти колонные права», а не «нужны ли эти права живому коду». Из шести записей
половина уже не является названным читателем. Тест не доказывает необходимость членства и должен считаться
устаревшим evidence, а не gate.

### F5 — writer-root построен для мёртвого пути и отсутствующей таблицы

`contentAccessGrants` объявлен через голый `pgTable('content_access_grants', ...)`, то есть пишет в `public`.
`writePort.ts:722-759` сначала делает реляционный INSERT через `createContentAccessGrant`, затем вызывает
`integrator_upsert_content_access_grant` — второй upsert той же logical row в ту же public-таблицу. Но в DEV
такой таблицы вообще нет, а product-кода, зовущего `ProtectedAccessPort.issueAccess`, тоже нет:

```text
printf 'PRODUCTION_ISSUE_ACCESS_CALLS|'
rg -n "\.issueAccess\(" apps/integrator/src \
  --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts' | wc -l
PRODUCTION_ISSUE_ACCESS_CALLS|0

SELECT 'content_access_grants_relations', count(*)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname='content_access_grants' AND c.relkind IN ('r','p');
content_access_grants_relations|0

SELECT 'root_writes_missing_public_table',
       pg_get_functiondef(to_regprocedure(
         'app.integrator_upsert_content_access_grant(uuid,text,text,bigint,text,text,text,timestamp with time zone,timestamp with time zone,text,timestamp with time zone)'
       )) ~ 'INSERT INTO public[.]content_access_grants';
root_writes_missing_public_table|t
```

DI создаёт и передаёт порт (`app/di.ts:270-280`, `incomingEventPipeline.ts:101-128`), но ни один action handler
его метод не вызывает. Env по умолчанию пустой, однако до этой заглушки живой код всё равно не доходит.
Следовательно, это не оставшийся D17 blocker: путь надо признать мёртвым, а не строить для него ещё один reader
или transaction bridge. Новый writer-root не предотвращает никакой достижимый вред и был работой зря.

### Что специально искалось и не найдено

- У трёх reader-корней живые owner/ACL совпадают с назначением: channel identity и delivery identity —
  `app_integrator_request`, channel→organization — `app_integrator_resolver`. Чужого runtime-`EXECUTE` не
  найдено. Ошибка — отсутствующий helper grant/capability, а не лишний grant.
- `crossesTenantWall` без причины нет. Команда
  `node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs` дала 14/14; census содержит
  45 пар в 19 функциях, и каждую пару создаёт непустая строка `TENANT_WALL_CROSSINGS`.
- В цепочке merge reader-а проверен подозрительный случай «source виден клинике, canonical target — нет».
  Живой замер:

  ```text
  WITH source_orgs AS (
    SELECT pu.id AS source_id, pu.merged_into_id AS target_id, m.organization_id
    FROM public.platform_users pu
    JOIN public.be_organization_members m
      ON m.platform_user_id=pu.id AND m.status='active'
    WHERE pu.merged_into_id IS NOT NULL
    UNION
    SELECT pu.id, pu.merged_into_id, e.organization_id
    FROM public.platform_users pu
    JOIN public.org_enrollments e
      ON e.platform_user_id=pu.id AND e.status='active'
    WHERE pu.merged_into_id IS NOT NULL
  ), suspicious AS (
    SELECT s.* FROM source_orgs s
    WHERE NOT EXISTS (
      SELECT 1 FROM public.be_organization_members m
      WHERE m.platform_user_id=s.target_id
        AND m.organization_id=s.organization_id AND m.status='active'
    ) AND NOT EXISTS (
      SELECT 1 FROM public.org_enrollments e
      WHERE e.platform_user_id=s.target_id
        AND e.organization_id=s.organization_id AND e.status='active'
    )
  )
  SELECT 'merged_source_org_without_target_org', count(*) FROM suspicious;
  merged_source_org_without_target_org|0

  SELECT count(*) FROM public.user_channel_bindings b
  JOIN public.platform_users pu ON pu.id=b.user_id WHERE pu.merged_into_id IS NOT NULL;
  binding_still_on_merged_source|0
  ```

  Поэтому возможный на чтении кода переход `v_current := v_next` без повторной проверки возвращаемого id не
  оформлен finding-ом: достижимого состояния в DEV нет, а merge переносит binding.

## 2. Направление: выигрыш или размен одной опасности на другую

Живой запрос:

```text
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname IN (
  'app_object_owner',
  'app_seam_identity_lookup_owner',
  'app_integrator_request',
  'app_tenant_service'
)
ORDER BY rolname;
app_integrator_request|f|f
app_object_owner|f|f
app_seam_identity_lookup_owner|f|f
app_tenant_service|f|f

SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN (
  'platform_users','user_contacts','user_channel_bindings','org_enrollments',
  'be_organization_members','reminder_rules','admin_audit_log','broadcast_audit'
)
ORDER BY c.relname;
-- platform_users, user_contacts, user_channel_bindings, org_enrollments,
-- be_organization_members, reminder_rules, admin_audit_log, broadcast_audit:
-- у всех t|t
```

То есть `SECURITY DEFINER` сам не отключил RLS. Он сменил `CURRENT_USER` на seam-owner, а политики
`rev10_seam_business_*`/`rev10_named_root_owner_gate_*` дают этому owner-у безусловную ветку вида
`CURRENT_USER = 'app_seam_identity_lookup_owner'`. Поэтому итоговый trust boundary такой:

```text
широкая tenant-role + общая RLS-стена
             ↓
точный capability + SECURITY DEFINER owner + предикат в каждом теле
```

Это **осознанный и в конечном состоянии разумный размен**:

- компрометация integrator login после снятия членства даёт только перечисленные операции, а не произвольные
  SELECT/UPDATE product canon;
- typed args, function identity и exact role уменьшают confused-deputy поверхность;
- write-root может атомарно держать запись и проверку.

Но цена реальна:

- организационный предикат дублируется по телам и может быть применён не к тому relation;
- schema migration, privilege reconcile, capability JSON и runtime selection должны приехать согласованно;
- lexical-гейт не доказывает семантику SQL;
- пока старое членство осталось, скомпрометированный логин по-прежнему может выбрать широкую роль.

Поэтому мой прямой ответ: **после cutover станет лучше; сегодня стало сложнее и операционно хуже, но не
безопаснее.** F1 — не гипотетическая цена, а уже случившийся отказ из-за дополнительной детали механизма.

## 3. Сколько машинерии появилось 22.08

### Функции

По D17-коммитам 22.08 затронут 21 уникальный function header: 11 новых и 10 замен существующих. Команда,
которая извлекает добавленные headers из этих коммитов и проверяет наличие имени в снимке до `8fc46b499`, дала:

```text
D17_COMMITS=(8fc46b499 cab53b7b2 da3a147ed 1bdee0f73 95ed33d3e d5d06bf71
             1472e2335 719633cb9 1da5420f1 e7b7c5235 edcc132f6 de3567366)
D17_BASE=8fc46b499^
for d17_commit in "${D17_COMMITS[@]}"; do
  git show --format= --unified=0 "$d17_commit" -- 'apps/webapp/db/drizzle-migrations/*.sql'
done | sed -n 's/^+CREATE OR REPLACE FUNCTION \([^ (]*\).*/\1/p' | sort -u \
  > /tmp/d17_function_names
while IFS= read -r d17_function; do
  if git grep -q -F "FUNCTION ${d17_function}(" "$D17_BASE" -- apps/webapp/db deploy/postgres; then
    printf 'REPLACED|%s\n' "$d17_function"
  else
    printf 'NEW|%s\n' "$d17_function"
  fi
done < /tmp/d17_function_names > /tmp/d17_function_classes
printf 'NEW_COUNT|'; rg -c '^NEW\|' /tmp/d17_function_classes
printf 'REPLACED_COUNT|'; rg -c '^REPLACED\|' /tmp/d17_function_classes

NEW_COUNT|11
REPLACED_COUNT|10
```

Новые имена, напечатанные этой командой: `integrator_append_reminder_delivery_event`,
`integrator_increment_broadcast_audit_counter`, `integrator_record_messenger_phone_bind_audit`,
`integrator_record_notification_delivery_attempt`, `integrator_set_user_channel_bot_blocked`,
`integrator_upsert_content_access_grant`, `integrator_upsert_reminder_rule`,
`integrator_read_channel_binding_identity`, `integrator_read_platform_user_delivery_identity`,
`resolve_active_organization_for_channel_binding`, `integrator_context_installed` — семь writer-root, три
reader-root и helper. Один writer-root
`integrator_record_messenger_phone_bind_audit` позже в тот же день удалён в пользу общего
`record_collapsing_audit_event`; живой запрос по этим 11 именам даёт 10 существующих функций:

```text
SELECT count(*)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='app' AND p.proname IN (
  'integrator_upsert_reminder_rule','integrator_set_user_channel_bot_blocked',
  'integrator_upsert_content_access_grant','integrator_record_notification_delivery_attempt',
  'integrator_increment_broadcast_audit_counter','integrator_append_reminder_delivery_event',
  'integrator_record_messenger_phone_bind_audit','integrator_read_channel_binding_identity',
  'resolve_active_organization_for_channel_binding','integrator_read_platform_user_delivery_identity',
  'integrator_context_installed'
);
10

rg -n "DROP FUNCTION IF EXISTS app.integrator_record_messenger_phone_bind_audit" \
  apps/webapp/db/drizzle-migrations/20260822T180000_one_door_records_the_act_of_binding_a_person_to_medicine.sql
82:DROP FUNCTION IF EXISTS app.integrator_record_messenger_phone_bind_audit(uuid, text, text, text);
```

Из 11 новых функций helper не несёт продуктовой операции, один writer позднее заменён общим корнем, а
`integrator_upsert_content_access_grant` обслуживает мёртвый путь F5. Поэтому утверждать пользу всех десяти
operation-root нельзя: по свежему коду достижимую продуктовую работу несут восемь оставшихся D17-operation
roots. Команды выше дают исходные 11/10, а нулевой consumer-count F5 — вычитание мёртвого root.

### Тесты и гейты

Точный census добавленных файлов и деклараций:

```text
D17_COMMITS=(8fc46b499 cab53b7b2 da3a147ed 1bdee0f73 95ed33d3e d5d06bf71
             1472e2335 719633cb9 1da5420f1 e7b7c5235 edcc132f6 de3567366)
for c in "${D17_COMMITS[@]}"; do
  git diff-tree --no-commit-id --name-only --diff-filter=A -r "$c"
done | sort -u | rg '(test|spec)\.(mjs|ts|tsx)$' | wc -l
10

for c in "${D17_COMMITS[@]}"; do
  git show --format= --unified=0 "$c" -- '*.test.ts' '*.test.tsx' '*.test.mjs' '*.spec.ts'
done | rg '^\+\s*(it|test)\(' | wc -l
65
```

Разложение десяти файлов по назначению:

| класс | файлов | реальная ценность |
|---|---:|---|
| feature/wiring tests writer/read roots | 6 | ловят неверное имя корня, аргументы и ветвление; почти все используют fake DB и не доказывают ACL/RLS |
| opt-in DEV proofs | 2 | six-roots proof доказывает реальный вред; membership proof устарел сразу после reader cutover |
| постоянные meta-gates | 2 | named-root column mapping полезен против лишних grants; definer predicate нашёл реальные дыры, но требует большого собственного анализатора |

У global definer-gate один commit добавил 1 247 и удалил 61 строку, net **+1 186**:

```text
git show --numstat --format= e7b7c5235
# сумма added = 1247; deleted = 61
```

Из его 14 тестов один прогоняет главное свойство по живому артефакту; остальные выводят предметы/роли,
проверяют исключения и инъекциями тестируют собственный parser. Это не «14 tenant-защит», а один приблизительный
gate с 13 опорами/self-tests. Он уже честно перечисляет слепые зоны: `OR`, `LEFT JOIN`, `NOT EXISTS`,
alias scope, read-then-reject leak, смысл проверенного ключа/колонки, writes и межпроцедурность.

### Маркеры

Команда:

```text
node - <<'NODE'
const x=require('./deploy/postgres/privileges/name-census.json').definerRootsCrossingTenantWall;
console.log(x.length, new Set(x.map(s => s.split(' -> ')[0])).size);
NODE
45 19
```

Это 45 пар relation→function в 19 функциях и один новый тип маркера. Они **не предотвращают вред напрямую**:
каждый маркер разрешает гейту пропустить отсутствие видимого предиката. Их польза — заставить назвать причину и
сделать рост списка видимым; их цена — 45 постоянных исключений, каждое из которых нужно ревьюить семантически.

Итог по машинерии: полезное ядро — operation roots, column mapping и живая foreign-org проба. Явно лишнее или
ложно позиционированное — helper, нарисованный door-test и stale membership-proof. Global parser дал настоящую
находку, но его постоянная стоимость непропорциональна D17 и он не должен называться доказательством стены.

## 4. Барьер транзакции

### Что реально структурно в сегодняшнем протоколе

- `app_ext.accepted_port_contexts` допускает один принятый контекст на transaction id; повторный
  `install_port_context` превращает `unique_violation` в 42501.
- `withPortContextTransaction` открывает `BEGIN`, устанавливает ровно одну capability и делает `SET LOCAL ROLE`.
- `runIntegratorNamedRoot` в `runIntegratorSql.ts:45-54` специально бросает, если у `DbPort` уже есть
  `integratorDrizzle`.

Named root действительно нельзя «вставить» внутрь уже открытого relation `db.tx` без изменения протокола.

### Где вывод исполнителей неверен

Это не делает сами чтения неразделимыми с транзакцией.

1. `writeReminderRulesDirect.ts:136-168` уже показывает утверждённый паттерн: bounded read-only `db.tx`
   заканчивается, затем запускается named writer. Следовательно, «root не входит в tx» не означает «read нельзя
   вынести перед tx».
2. `content.access.grant.create` (`writePort.ts:722-759`) не вставляет локальный grant: Drizzle-объект — голый
   `pgTable`, значит первый INSERT идёт в `public.content_access_grants`, а затем named root повторяет upsert той
   же строки. Таблицы в DEV нет, consumer-count равен нулю (F5). Здесь structural barrier **нет**, потому что
   предметной работы нет. Если feature когда-либо вернут отдельным owner-решением, существующий named writer
   должен быть единственной записью, но это уже новая задача, а не остаток D17.
3. Для `markSent`, `markFailed` и `delivery.log` post-update status действительно нужен из той же локальной
   транзакции (`writePort.ts:510-603,655-709`). Но public-часть контекста идёт только из `reminder_rules`; её можно
   получить узким snapshot-root до транзакции, а локальные status/timestamps вернуть `RETURNING`-ом. Если
   атомарность public rule + local occurrence действительно обязательна, один общий definer-root может владеть
   всей операцией. Это trade-off, не невозможность.
4. Живой privilege census показывает более простой недостающий кусок:

   ```text
   SELECT count(*) FROM information_schema.role_table_grants
   WHERE table_schema='public' AND grantee='app_integrator_request';
   public_table_grants|0

   SELECT count(*) FROM information_schema.column_privileges
   WHERE table_schema='public' AND grantee='app_integrator_request';
   public_column_grants|0
   ```

   При этом `app_integrator_request` уже имеет ровно локальные integrator-права: INSERT/SELECT на
   `user_reminder_delivery_logs`, SELECT/UPDATE на `user_reminder_occurrences`, INSERT retry. Значит
   tenant-service capability для **организационного** принципала может целиться в эту уже узкую роль для local
   tx, не открывая ни одной public-таблицы. Public-чтения остаются named roots. Это проще, чем превращать каждое
   локальное действие в новый root.

Вывод: один-context-per-tx — настоящий контракт. Три «структурных барьера» — неверное обобщение; один из них
точно мнимый, два решаются разделением public snapshot и local mutation либо одним атомарным root.

## 5. Что осталось до снятия membership

Поиск сделан не по отчёту, а тремя способами:

```text
node /home/dev/brain/tools/code-search.mjs \
  "integrator remaining public relation reads transaction reminders adminStats broadcastAudit" --repo bcb -k 20

rg -n "public\.[a-z_]+|integratorPublicProduct" apps/integrator/src \
  --glob '*.ts' --glob '!*.test.ts' --glob '!*.spec.ts'

rg -n "collectIdentityProjectionCandidatesShared|FROM public\." \
  packages/platform-merge/src apps/integrator/src/infra/db --glob '*.ts' --glob '!*.test.ts'
```

После исключения комментариев, named roots и отдельной operational-delivery роли остаются четыре public-read
группы и один local-capability cutover:

| остаток | живые места / последствие | минимальный объём |
|---|---|---|
| candidate + exact organization resolution | `packages/platform-merge/src/identityProjectionWrite.ts:129-200`, `resolveDirectPublicActor.ts:57-99`, reminder-rule writer | один общий actor-resolution root (кандидаты + exact org) и 2 call-site группы; **medium** |
| reminder occurrence ownership/context | `reminders.ts:181-250,319-412`, вызовы markSent/markFailed/delivery/orphan expiry | один snapshot/root или расширение существующего finalize-root + разделение local tx; **medium** |
| admin user counts | `adminStats.ts:31-66`, команды `/admin_users` | один aggregate root; **small** |
| broadcast organization resolve | `broadcastAudit.ts:5-21`, worker `:366-381` | resolver-root либо расширение существующего counter-root так, чтобы org не искало приложение; **small** |
| local integrator relation tx под organization principal | `portContextRuntime.ts:195-208`; существующие локальные grants уже на `app_integrator_request` | одна tenant-service capability на узкую роль, без public grants; **small**, но требует route-proof |

`content.access.grant` в эту таблицу не входит: точный поиск даёт ноль production-вызовов, таблицы в DEV нет.

Рациональная нижняя оценка — **четыре узких public entry point (один можно получить расширением существующего)
и одна capability-дверь**, а не новый root на каждую локальную SQL-операцию. Число
получено из таблицы выше и команд поиска; это оценка реализации, не уже выполненная работа.

После этого нужны: удалить generic organization capability на `app_tenant_service`, снять membership логина,
перегенерировать/reconcile DEV единым шагом и повторить реальные маршруты. Отдельно проверить, что
`app_operational_delivery_worker` остаётся: D17 его не снимает, и очередь доставки к этому tenant membership не
относится.

## 6. Что сломается, если снять членство сегодня

Свежая rollback-проба сняла членство, затем вызвала **живой generic relation capability**
`bd5bd4d1-83c3-5af2-8128-4f6b3fc994d0` через настоящий `app.begin_port_context`:

```text
capability=bd5bd4d1-83c3-5af2-8128-4f6b3fc994d0
organization=26aca960-950d-4f39-b67d-fcfbe06a6530
BEGIN
REVOKE ROLE
SET
ERROR: 42501: permission denied to set role "app_tenant_service"
CONTEXT: SQL statement "SET LOCAL ROLE app_tenant_service"
         PL/pgSQL function begin_port_context(uuid,port_context_claims) line 5 at EXECUTE
ROLLBACK
membership_restored|t
```

То есть отказ происходит **до первого продуктового SQL**. Упадёт любой вызов без named operation под
`runWithOrganizationPrincipal`, потому что runtime однозначно выбирает key `tenant_service`
(`portContextRuntime.ts:195-208,231-240`). Поимённые D17-пути:

- reminder-rule actor/org resolution — запись уйдёт в retry либо не сформирует projection;
- markSent/markFailed/delivery.log и orphan expiry — не зафиксируют/не спроецируют финальное состояние reminder;
- `resolveReminderOccurrenceOrganizationId` — worker не войдёт в организационный scope;
- `resolveBroadcastAuditOrganizationId` — broadcast counters не увеличатся;
- `admin.stats` user-count — `/admin_users` вернёт пустой/ошибочный результат (внутри есть catch, скрывающий 42501);
- local `user_reminder_occurrences`/delivery-log операции, когда они пришли именно под organization principal,
  не начнут транзакцию, хотя узкая роль уже имеет нужные local grants.

Named roots, чья capability целится в `app_integrator_request`, сами по себе membership не требуют. Очередь
`public.outgoing_delivery_queue` идёт под `app_operational_delivery_worker` и этой пробой не затронута.
`content.access.grant` не добавлен в список impact: production-вызовов ноль, а отсутствующая таблица делает его
уже сломанным мёртвым путём независимо от membership.

## 7. Что 22.08 делалось зря

По убыванию уверенности:

1. **`integrator_upsert_content_access_grant`.** Production-вызовов ноль, таблицы в DEV нет, а root пишет именно
   в неё. Это прямой ответ «работа решала выдуманную проблему».
2. **Membership-load proof в нынешнем виде.** Он доказывает старые grants и продолжает называть уже удалённые
   reader-ссылки. Это не страховка, а ложная запись «роль всё ещё несущая».
3. **`integrator_context_installed()` как отдельная функция.** Это служебная сущность ради ветвления одной
   двери; никакой продуктовой capability она не даёт. Её ACL уже разъехался и положил оба маршрута с арендатором.
   Нужная вторая дверь не была выдуманной проблемой; выбранный helper — лишняя машинерия.
4. **`incomingRecipientDoor.audit.test.ts` как доказательство двери.** Feature нужна, тест — нет в этой форме:
   он вручную утверждает ровно то состояние, которое обязан проверять, и потому не видит реальный отказ.
5. **Признание content-grant transaction barrier структурным.** У production-пути ноль потребителей, таблица
   уже удалена. Отложенная работа основана не просто на неверной модели транзакции, а на мёртвом коде.
6. **Постоянный lexical analyzer на 1 186 net строк как якобы DB-стена.** Его разовый census был полезен и нашёл
   реальные дыры; исправление шести корней не было зря. Зря — считать сам parser доказательством и обслуживать
   45 exceptions/13 self-tests как равноценную защиту. Семантические foreign-org rollback-пробы сильнее и короче.

Не считаю зря остальные writer-root, три reader-root, собственную runtime-роль, named doors и исправление
найденных корней. Это нужные детали конечной least-privilege модели — при условии, что cutover действительно
будет доведён и deploy/reconcile станет атомарным.

## 8. Доказательственный охват

Кроме команд, приведённых рядом с цифрами, проверены:

- owner-строки D17/D15b в `WORK_ORDER.md`, все отчёты 22.08 из
  `docs/_TODO/runs/integrator-cleanup/`, последние вердикты `NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`;
- точный code-search по relation readers, `runWithOrganizationPrincipal`, `db.tx`, candidate resolution,
  admin stats и broadcast audit;
- runtime selection `portContextRuntime.ts`, контекстный контракт `contract.sql`,
  `withPortContextTransaction`, три reader-тела и их живые ACL/capability;
- живые `pg_roles`, `pg_class`, `pg_policies`, `information_schema.*`, migration ledger DEV;
- `RUN_DEFINER_TENANT_SIX_ROOTS_DB=1` — 1/1 pass, rollback;
- `RUN_INTEGRATOR_MEMBERSHIP_DB=1` — 3/3 pass, но смысл теста опровергнут кодом;
- `definer-tenant-predicate.test.mjs` — 14/14 pass;
- два integrator reader/door unit-файла — 14/14 pass при живом отказе F1.
- точный consumer-search `ProtectedAccessPort.issueAccess` — 0; live `pg_class` по
  `content_access_grants` — 0; D17-root на отсутствующую таблицу существует.

TEST и PROD не открывались. DEV после каждой пишущей пробы возвращён `ROLLBACK`; финальная проверка членства
дала `membership_restored|t`.
