# D17 финал — реляционные ЧИТАТЕЛИ интегратора: что переведено, что осталось, почему членство на месте

**Ветка:** `wt/d17-relation-readers-20260822` · **база:** `bdf11109e`
**Оракул:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт «**D17 — узкая роль в базе**».
**Это отчёт исполнителя, НЕ приёмка.** Галочку D17 ставит ведущий.

## Короткий итог

Семь живых читателей `public.*` переведены на **три** именованных корня; четыре мёртвых удалены.
`app_integrator_request` табличных прав на `public.*` не получил — их у неё ноль и было, и осталось
(пункт приёмки **(б) выполнен**).

**Пункты (а) и (в) НЕ выполнены, и это не пропуск, а измеренный вывод: премиса брифа не сходится.**
Бриф считает, что перепись `integratorDoorsOnTheWebappTenantRole` опустеет, когда читатели `public.*`
уедут на корни. Это не так. В переписи одна запись — `tenant_service -> relation-wide`, и это НЕ дверь
к семи отношениям `public.*`, а **сквозная реляционная дверь ОРГАНИЗАЦИОННОГО принципала**: рантайм
порта (`apps/integrator/src/infra/db/portContextRuntime.ts:199`) выбирает её для КАЖДОГО реляционного
запроса, сделанного внутри `runWithOrganizationPrincipal(...)`, — включая запросы к схеме `integrator`,
а не только к `public`. Чтобы перепись опустела, из интегратора должен исчезнуть **весь реляционный
трафик под организационным принципалом**, а не только чтение `public.*`. Что именно осталось — §4,
поимённо и с замером. Поэтому членство `bcb_*_integrator` в `app_tenant_service` **не снято**
(бриф, п.7).

---

## 1. Замер до правки — почему список читателей шире, чем в брифе

Бриф называет четыре файла (`platformUserByChannel.ts`, `reminders.ts`, `adminStats.ts`,
`broadcastAudit.ts`) и просит сверить самому. Сверил: файлов-читателей `public.*` в интеграторе
**шесть**, плюс общий с вебаппом пакет.

```
$ grep -rn "public\.\(platform_users\|user_contacts\|user_channel_bindings\|org_enrollments\
|be_organization_members\|reminder_rules\|broadcast_audit\)" apps/integrator/src --include=*.ts \
  | grep -v '\.test\.ts'
$ grep -rn "integratorPublicProduct" apps/integrator/src --include=*.ts | grep -v '\.test\.ts'
```

| файл | что читает | принципал живого маршрута |
|---|---|---|
| `repos/platformUserByChannel.ts` | `platform_users`, `user_contacts`, `user_channel_bindings`, `org_enrollments` | организационный + bootstrap |
| `repos/platformUserDeliveryPhone.ts` | `platform_users`, `user_contacts` | организационный |
| `repos/reminders.ts` | `reminder_rules`, `platform_users`, `org_enrollments`, `be_organization_members` | организационный |
| `repos/adminStats.ts` | `platform_users`, `user_contacts`, `user_channel_bindings` | организационный |
| `repos/broadcastAudit.ts` | `broadcast_audit` | организационный (опционально) |
| `directPublic/resolveDirectPublicActor.ts` | `org_enrollments` | организационный |
| `packages/platform-merge` (общий с вебаппом) | `platform_users`, `user_contacts`, `user_channel_bindings` | организационный |

`platformUserDeliveryPhone.ts` и `resolveDirectPublicActor.ts` в брифе не названы — они читают ровно те
же ПДн-отношения; молча пропустить их значило бы объявить работу законченной при живой двери.

### 1.1 Два читателя были СЛОМАНЫ до этой ветки — измерено, не выведено

```
$ sudo -n -u postgres psql -X -h /var/run/postgresql -d bcb_webapp_dev -Atc "
    SELECT r.rolname, has_schema_privilege(r.rolname,'public','USAGE'),
           has_column_privilege(r.rolname,'public.user_channel_bindings','user_id','SELECT')
    FROM pg_roles r WHERE r.rolname IN
      ('app_integrator_request','app_integrator_resolver','app_tenant_service')"
app_integrator_request  | false | false
app_integrator_resolver | false | false
app_tenant_service      | true  | true
```

1. **Пред-маршрутизация клиники по привязке канала не работала вообще.**
   `app/routes.ts:44` зовёт `resolveActiveOrganizationIdForChannel` внутри
   `runWithBootstrapPrincipal`, то есть под `app_integrator_resolver`, у которой **ноль табличных
   прав** (в `deploy/postgres/generated/privileges.bcb_webapp_dev.sql` нет ни одной строки
   `GRANT … ON TABLE … TO "app_integrator_resolver"` — только четыре `GRANT EXECUTE`). Чтение
   `org_enrollments` всегда падало `42501`, `reportIntegratorIsolationFailure` его глотал, функция
   всегда возвращала `null`. Этот корень (§2, R2) чинит путь как побочный эффект перевода.
2. **Опознание получателя под ИНТЕГРАТОРСКИМ принципалом падало.** Вебхуки всех трёх каналов
   (`telegram/webhook.ts:371`, `max/webhook.ts:310`, `vk/webhook.ts:61`) выбирают принципал
   тройкой: `integrator` (клиника И integrator_user_id известны) → `organization` → `bootstrap`.
   `handleIncomingEvent:123` читает `user.byIdentity` под ЛЮБЫМ из трёх, а работало это только под
   средним: `app_integrator_request` и `app_integrator_resolver` не видят `public` вовсе (замер выше).
   После перевода эти два случая по-прежнему не проходят — но отказом рантайма порта
   («Missing unique declared integrator port capability»), а не `42501`. Класс отказа тот же (событие
   отклоняется gateway'ем), поведение для человека не изменилось. **Вторая дверь класса `integrator`
   у корня R1 это бы починила — но это изменение поведения, а не перевод, и в плане владельца его
   нет; вынесено вопросом (§6).**

---

## 2. Что сделано: три корня на семь читателей

Миграция `apps/webapp/db/drizzle-migrations/20260822T150000_the_integrator_readers_get_named_roots.sql`
— три `CREATE OR REPLACE FUNCTION`, каждый `SECURITY DEFINER`, `search_path` задан,
`app.require_accepted_context` — **первый исполняемый оператор** каждого тела.
`GRANT`/`REVOKE`/`CREATE POLICY` в миграции нет (AGENTS.md §1); разбор прав — в её шапке.
Владелец всех трёх — `app_seam_identity_lookup_owner`: он уже владеет этим швом и уже имеет SELECT на
все пять читаемых отношений (тот же владелец несёт `app.resolve_active_organization_for_integrator_user_id`).

| корень | роль / класс | заменил |
|---|---|---|
| `app.integrator_read_channel_binding_identity(text,text,text)` | `app_integrator_request` / `tenant_service` | `resolveCanonicalPlatformUserIdFromId`, `resolveCanonicalPlatformUserIdByChannel`, `getChannelBindingLinkData`, `findChannelBindingByPhone` |
| `app.resolve_active_organization_for_channel_binding(text,text)` | `app_integrator_resolver` / `integrator` | `resolveActiveOrganizationIdForChannel` |
| `app.integrator_read_platform_user_delivery_identity(text)` | `app_integrator_request` / `tenant_service` | `getCanonicalPlatformUserDeliveryIdentity`, `getPhoneNormalizedForDeliveryLookup` |

**Корней мало намеренно.** Четыре прежних читателя привязки канала — это ОДНО чтение двумя формами
поиска (по внешнему id канала и по подтверждённому телефону), поэтому дверь одна с параметром, а не
две; ровно одна из двух форм обязана быть заполнена, иначе `22023` — дверь не гадает. Два читателя
телефона доставки различались только формой ключа (uuid человека либо числовой `integrator_user_id`) —
дверь одна принимает обе.

**Существующий корень проверен перед заведением нового.** `app.resolve_active_organization_for_integrator_user_id(bigint)`
делает то же дело по ДРУГОМУ ключу — по `integrator_user_id`, а не по привязке канала; добавить ему
дверь нельзя, потому что аргумент другой. Поэтому это второй корень, а не вторая дверь в первый; форма
тела и владелец скопированы у соседа дословно.

**Корни отдают ровно то, что нужно вызывающему.** `platform_users` наружу не выходит ни одной колонкой
сверх `id`: R1 отдаёт id человека, ручку канала и подтверждённый телефон; R2 — один uuid организации;
R3 — телефон доставки и `integrator_user_id`.

**Стена арендатора повторена в теле дословно.** Сегодня эти чтения сужает RLS-политика
`rev10_tenant_select_*` роли `app_tenant_service`: человек виден клинике, только если он её активный
сотрудник (`be_organization_members`) ЛИБО активный зачисленный (`org_enrollments`). `SECURITY DEFINER`
обходит RLS, поэтому предикат выписан в телах R1 и R3 — без него корень был бы ШИРЕ прежнего чтения.
Именно поэтому `be_organization_members` и `org_enrollments` есть в переписи `relationSurfaces` этих
двух корней: это стена, а не расширение доступа.

### 2.1 Права — только через декларацию

`deploy/postgres/privileges/declaration.ts`: три дескриптора возможностей + три объявления функций.
Артефакты пересобраны `--all` и `--all --port-context-only`, оба `--check` побайтно (EXIT=0).
Весь дифф артефактов:

```
+GRANT EXECUTE ON FUNCTION app.integrator_read_channel_binding_identity(text,text,text) TO "app_integrator_request";
+GRANT EXECUTE ON FUNCTION app.integrator_read_platform_user_delivery_identity(text) TO "app_integrator_request";
+GRANT EXECUTE ON FUNCTION app.resolve_active_organization_for_channel_binding(text,text) TO "app_integrator_resolver";
+GRANT SELECT ("id","integrator_user_id","merged_into_id") ON TABLE "public"."platform_users" TO "app_seam_identity_lookup_owner";
```

Одна колоночная строка — владельцу шва (новая комбинация трёх колонок, каждая у него уже была).
**Табличных прав на `public.*` ни одной роли рантайма не добавлено:**

```
$ grep -c '^GRANT .* ON TABLE "public"\..* TO "app_integrator_request";' \
    deploy/postgres/generated/privileges.bcb_webapp_dev.sql
0
```

### 2.2 Мёртвое удалено, а не переведено

Доказательство смерти — перечислением мест, где искал (`grep -rn <имя> apps packages tools deploy
--include=*.ts --include=*.tsx --include=*.mjs --include=*.js --include=*.json`, вне `node_modules`):
кроме собственного определения, ни одной ссылки.

- `repos/reminders.ts`: `getReminderRulesForUser`, `getReminderRuleForUserAndCategory`,
  `getReminderRuleById`, `resolveReminderRuleOrganizationId` + `ruleSelectShape` + `normalizeRuleRow`
  (все читали `public.reminder_rules`);
- `infra/db/readPort.ts`: ветка `reminders.rule.byId` и её тип в `kernel/contracts/ports.ts` — запрос
  такого типа не строит ни один вызывающий;
- `repos/integratorUserOrganizationSql.ts` — файл целиком: мёртвый дубль локальной
  `organizationIdForIntegratorUserSql` из `reminders.ts:22`, импортирующих ноль.

Оставлены живые, но не относящиеся к `public.*`, и мёртвые не по этой теме: их я в этой ветке не
трогал и называю в §4.

---

## 3. Доказательства (реальный вывод)

`--execute` на DEV не запускался (запрещено брифом). Поэтому корни материализуются **внутри
откатываемой транзакции** дословно из файла миграции, гранты навешиваются дословными строками
генератора, строки каталога возможностей вставляются дословно из
`deploy/postgres/generated/port-context-capabilities.bcb_webapp_dev.sql` — **с одной названной
подстановкой:** `session_login = session_user`. Причина: живой логин `bcb_dev_integrator` не может сам
создать корни, а на DEV они не приземлены. Всё остальное проверяется дословно: класс контекста,
целевая роль, цель, идентичность функции, матрица классов `app.install_port_context`,
`app_ext.assert_port_context_claim`, гейт тела и RLS шва. Каждая проба — своя транзакция, каждая
кончается `ROLLBACK`; DEV не изменён.

**Приземляемость: `bash deploy/host/migrate-dev.sh --preflight` → EXIT=0.**
```
CREATE FUNCTION ×3 (session_user=bcb_dev_migrator, current_user=app_seam_identity_lookup_owner)
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev": pending=1 total=43
migrate-dev preflight: PASS (post-cutover DEV; rollback-only webapp DDL validation complete)
```

**Живые прогоны настоящим маршрутом порта** (фикстура DEV: организация
`a0000000-…-0001`, человек `093d8c23-1910-48f1-8f7f-ba2993004827`, telegram `957924152`,
телефон `+79060432251`, `integrator_user_id` 126; чужая организация `e0000000-…-0001`):

```
P1  R1 по внешнему id канала      → 093d8c23-… | 957924152 |  | +79060432251
P2  R1 по подтверждённому телефону → 093d8c23-… | 957924152 |  | +79060432251   (тот же человек)
P3  R1 без принятого контекста     → ERROR: accepted port context required
P4  R1 под ЧУЖОЙ организацией      → 0 строк                     (стена арендатора)
P5  R1 с двумя ключами сразу       → ERROR: integrator_channel_binding_identity_needs_exactly_one_key
P6  R2 под app_integrator_resolver → a0000000-0000-4000-8000-000000000001
P6' R2 с ДРУГИМ аргументом в том же контексте → ERROR: accepted port context required
       (расшифровка: гейт сверяет хеш ТИПИЗИРОВАННЫХ АРГУМЕНТОВ, а не только имя функции)
P7  R3 по uuid человека            → +79060432251 | 126
P8  R3 по числовому ключу '126'    → +79060432251 | 126   (та же строка через ту же дверь)
P9  R3 под ЧУЖОЙ организацией      → 0 строк
P10 R3 без контекста               → ERROR: accepted port context required
P11 R2 без контекста               → ERROR: accepted port context required
```

**Граница EXECUTE: каждый корень достижим ровно ОДНОЙ ролью логина, `app_tenant_service` — ни одним.**
```
 root                                            | as_role                         | verdict
-------------------------------------------------+---------------------------------+---------------------------------
 integrator_read_channel_binding_identity        | app_integrator_request          | допущен до двери: accepted port context required
 integrator_read_channel_binding_identity        | остальные пять, включая app_tenant_service | НЕТ ДОСТУПА К ФУНКЦИИ
 integrator_read_platform_user_delivery_identity | app_integrator_request          | допущен до двери: accepted port context required
 integrator_read_platform_user_delivery_identity | остальные пять, включая app_tenant_service | НЕТ ДОСТУПА К ФУНКЦИИ
 resolve_active_organization_for_channel_binding | app_integrator_resolver         | допущен до двери: accepted port context required
 resolve_active_organization_for_channel_binding | остальные пять, включая app_tenant_service | НЕТ ДОСТУПА К ФУНКЦИИ
(18 строк)
```

**Инъекции неисправности — по одной на корень и по одной на стену, все в откаченной транзакции:**

```
A  гейт R1 снова называет 'app_tenant_service'  → ДО: 1 строка → ПОСЛЕ: accepted port context required
D  гейт R2 снова называет 'app_tenant_service'  → ДО: организация → ПОСЛЕ: accepted port context required
B  из R1 вырезан org-предикат стены             → ДО (чужая клиника): 0 → ПОСЛЕ: 1
C  из R3 вырезан org-предикат стены             → ДО (чужая клиника): 0 → ПОСЛЕ: 1
```
B и C доказывают, что стена в теле — несущая, а не украшение: без неё чужая клиника видит человека.
(Первая версия B/C заменяла предикат регэкспом, который ничего не находил, и «инъекция» тихо ничего не
делала — 0 → 0. Заменено на подстановку с обязательной проверкой `strpos(...)=0 → RAISE`: инъекция,
которая не сработала, теперь падает, а не выглядит успешной.)

**Тесты и статика:**
- `pnpm test:db-privileges` — `# tests 205 # pass 143 # fail 0 # skipped 62` (столько же, сколько до правки);
- оба `--check` генератора — побайтно, EXIT=0;
- новый `apps/integrator/src/infra/db/repos/platformUserReaders.namedRoot.unit.test.ts` — 10 тестов:
  сторожат имя корня, ПОЛНЫЙ позиционный набор аргументов и форму поиска (перестановка двух
  `text`-аргументов — валидный SQL и зелёный деплой, а в базе поиск идёт не по тому ключу);
- `npx vitest run src/infra/db src/infra/runtime/worker src/kernel` — 62 файла, 297 тестов, 0 падений;
- `npx tsc --noEmit` (интегратор) — EXIT=0;
- `npx eslint apps/integrator/src/infra/db deploy/postgres/privileges/declaration.ts` — чисто;
- гейты репозитория `check-db-chokepoint`, `check-no-new-raw-sql`, `check-queue-port-boundary`,
  `check-test-runner-visibility`, `check-c4-migration-owned-function-bodies` — все OK.

---

## 4. Что НЕ переведено — поимённо, с замером

Перепись `integratorDoorsOnTheWebappTenantRole` осталась прежней (`tenant_service -> relation-wide`),
и вот весь реляционный трафик, который её ещё держит.

**`public.*` (пять мест):**

| место | отношение | почему не в этой ветке |
|---|---|---|
| `packages/platform-merge/src/identityProjectionWrite.ts:129` `collectIdentityProjectionCandidates` | `platform_users`, `user_contacts`, `user_channel_bindings` | **общий код с вебаппом.** Интегратор входит сюда через `directPublic/writeIdentityAndPreferencesDirect.ts:114` из `resolveDirectPublicActor` и `writeReminderRulesDirect:143`. Перевод — свой корень интегратора со всей семантикой неоднозначности и `channel_anchor_owned_by_other_user`, вебапп не трогая |
| `directPublic/resolveDirectPublicActor.ts:81` `resolveExactActiveOrganizationId` | `org_enrollments` | то же чтение, что у R2, но зовётся **внутри `db.tx`**, а `runIntegratorNamedRoot` отказывает внутри уже открытой реляционной транзакции («Integrator named root must start before the relation transaction»). Едет вместе с платформенным слиянием, в одной транзакции с ним |
| `repos/reminders.ts:22` `organizationIdForIntegratorUserSql` | `platform_users`, `org_enrollments`, `be_organization_members` | выражение **внутри `INSERT … VALUES`** (`createContentAccessGrant:452`), а не отдельное чтение; корень `app.resolve_active_organization_for_integrator_user_id(bigint)` делает ровно это, но встроить его вызов в реляционный INSERT нельзя — принятый контекст один на транзакцию. Едет вместе с самим INSERT |
| `repos/reminders.ts:190,210,242` | `reminder_rules` | три чтения контекста срабатывания напоминания; кандидат на ОДИН корень (`getReminderOccurrenceContextForProjection`, `getReminderOccurrenceOwnerUserId`, `resolveReminderOccurrenceOrganizationId`), но два из трёх зовутся внутри `db.tx` (`writePort.ts:517,567,676`) — тот же барьер |
| `repos/adminStats.ts:38` | `platform_users`, `user_contacts`, `user_channel_bindings` | счёт для админ-дашборда; кандидат на корень-счётчик рядом с `app.count_active_canonical_appointments()` |
| `repos/broadcastAudit.ts:9` | `broadcast_audit` | **уже сломан и без нас:** колонку `organization_id` не видит ни одна роль логина (замер §1.5 отчёта шага 3, воспроизведён), функция всегда возвращает `null`. Корень её починит — то есть это изменение поведения, а не перевод |

**Схема `integrator` (то, о чём бриф не говорит, но что держит дверь ровно так же):** любой реляционный
оператор внутри `runWithOrganizationPrincipal(...)` идёт через ту же возможность. Сегодня у
`app_tenant_service` на схеме `integrator` ровно два права —
`SELECT("rule_id","status")` и `DELETE` на `integrator.user_reminder_occurrences`;
их держит `expireOrphanedPendingReminderOccurrences` (`repos/reminders.ts:184`, живой через
`writePort.ts:160`). Его `UPDATE` в той же функции (`:210`) роли не выдан вовсе — то есть эта ветка
падает `42501` и сегодня; находка не моя и не чинилась.

**Почему нельзя просто перецелить возможность `integrator_tenant_service_relation` на
`app_integrator_request` (проверено, а не предположено).** Ограничительная политика
`rev10_context_gate_*` вычисляет класс контекста ИЗ `current_user` фиксированным `CASE`
(`declaration.ts:7551`): для `app_integrator_request` она требует класс `integrator`. Реляционный
доступ этой роли под классом `tenant_service` отвергнет сама политика; вдобавок разрешающая
`rev10_saas_org_dormant_*` требует у неё `app.current_integrator_user_id() IS NOT NULL`, а класс
`tenant_service` обязан нести пустой `integrator_user_id`. Перецеливание — не правка одной строки, а
смена класса контекста организационного принципала.

---

## 5. Пункты приёмки

| пункт | статус |
|---|---|
| (а) перепись `integratorDoorsOnTheWebappTenantRole` ПУСТА | **НЕТ.** В ней одна запись — сквозная реляционная дверь организационного принципала. Она опустеет не когда уедут читатели `public.*`, а когда из интегратора исчезнет ВЕСЬ реляционный трафик под организационным принципалом (§4) |
| (б) у `app_integrator_request` ноль табличных грантов на `public.*` | **ДА.** 0 и до, и после; выдано только три `GRANT EXECUTE` |
| (в) членство `bcb_*_integrator` в `app_tenant_service` снято | **НЕТ, и снимать нельзя.** Снятие сегодня выключает приём сообщения: без него не работают шесть мест §4, включая опознание человека при входящем сообщении |

## НЕ СДЕЛАНО

- **Членство не снято** — блокер §4. Это ответ на задачу, а не пропуск.
- **Шесть читателей `public.*` не переведены** — §4, с причиной по каждому. Три из шести упираются в
  один и тот же барьер: чтение живёт внутри уже открытой реляционной транзакции, и корень туда не
  входит по построению. Это следующая связная работа, и она про транзакционную границу, а не про права.
- **Реляционный трафик по схеме `integrator` под организационным принципалом не тронут** — брифом не
  назван, но держит ту же дверь.
- **`app_operational_delivery_worker` не тронута** — бриф запрещает явно.
- **`--execute` на DEV, деплой, запись на TEST, `push`, full CI** — не запускались, запрещено брифом.
- **Находки §1.1 и §4 (сломанная пред-маршрутизация под резолвером, сломанный
  `resolveBroadcastAuditOrganizationId`, отсутствующий `UPDATE` у `expireOrphaned…`) не чинились
  отдельно** — их нет в плане владельца. Первую перевод чинит попутно: корень R2 просто работает там,
  где реляционное чтение всегда падало.

## ВОПРОС ВЕДУЩЕМУ (один)

`handleIncomingEvent` читает получателя под тремя разными принципалами (§1.1 п.2), а работает это
только под организационным — и до этой ветки, и после. Дать корню R1 **вторую дверь** класса
`integrator` (роль та же, `app_integrator_request`; гейт ветвится по двери, как уже сделано у
`record_reminder_occurrence_finalized_projection`) — значит починить опознание человека там, где оно
сегодня молча отказывает. Это **изменение поведения**, а не перевод, и в плане владельца его нет,
поэтому я его не делал. Делать?
