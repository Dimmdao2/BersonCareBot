# Опознание получателя во входящем событии — вторая дверь класса `integrator`

**Ветка:** `wt/incoming-recipient-door-20260822` · **база:** `e4ddba8ba` · **коммит правки:** `1da5420f1`
**План-файл:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт **D17**.
**Оракул:** `docs/_TODO/runs/integrator-cleanup/D17_RELATION_READERS_2026-08-22.md`, «ВОПРОС ВЕДУЩЕМУ».
**Это отчёт исполнителя, НЕ приёмка.** Галочку ставит ведущий.

## Короткий итог

Дефект подтверждён замером и оказался ШИРЕ, чем «один принципал из трёх»: из трёх маршрутов работал
ровно один, и на двух других отказ уносил НЕ опознание получателя, а всё событие целиком — человек
не получал ни одного ответа на своё сообщение.

Починка: **вторая дверь класса `integrator` у существующего корня**, роль та же
`app_integrator_request`, гейт ветвится по двери. **Третьей двери нет и быть не может** — доказано
контрактом, а не мнением: bootstrap-класс по построению не несёт организации, а без неё стена
арендатора в теле корня невыполнима. Поэтому под bootstrap чтение не переводится, а **не делается**:
вызывающий отвечает «получатель не опознан» вместо броска, роняющего событие.

---

## 1. Замер ДО правки

### 1.1 Три места — это ОДНО чтение под ТРЕМЯ принципалами

Бриф говорит «три места в `handleIncomingEvent`». Замер: **место одно**, а принципалов три, и
выбирает их вебхук ДО входа в домен.

```
$ grep -rn "handleIncomingEvent" apps/integrator/src --include=*.ts | grep -v '\.test\.ts'
```

| что | `path:line` |
|---|---|
| единственное чтение получателя | `apps/integrator/src/kernel/domain/handleIncomingEvent.ts:122` — `readPort.readDb({ type: 'user.byIdentity' })` внутри `loadUserContext` (:109–133) |
| его вызывающий | `handleIncomingEvent.ts:141` (`buildBaseContext`) → `:166` (`handleIncomingEvent`) |
| дальше по цепочке | `infra/db/readPort.ts:67` → `repos/platformUserByChannel.ts` → корень `app.integrator_read_channel_binding_identity(text,text,text)` |

Три принципала, под которыми это место исполняется (тройка `integrator` → `organization` →
`bootstrap`, одна и та же во всех каналах):

| принципал | `path:line` |
|---|---|
| **integrator** (клиника И `integrator_user_id` известны) | `integrations/telegram/webhook.ts:372` · `integrations/max/webhook.ts:311` и `:403` (выделенный бот) · `integrations/vk/webhook.ts:62` |
| **organization** (известна только клиника) | `telegram/webhook.ts:377` · `max/webhook.ts:316` и `:407` · `vk/webhook.ts:64` · `infra/runtime/scheduler/organizationTicks.ts:44` |
| **bootstrap** (клиника не определена) | `telegram/webhook.ts:378` · `max/webhook.ts:317` · `vk/webhook.ts:65` |

`telegram/webhook.ts:483` (выделенный бот) идёт через тот же `processTelegramUpdate`, поэтому
отдельной строкой не считается — те же :372/:377/:378.

### 1.2 Работал ОДИН маршрут из трёх — измерено, не выведено

Замер сделан НАСТОЯЩИМ слоем порта под продуктовым вызовом (`integratorPortContextPrincipal`), а не
заглушкой `DbPort`. Тест: `apps/integrator/src/kernel/domain/incomingRecipientDoor.audit.test.ts`
(форма взята у соседа `writePort.identityRootReachability.audit.test.ts`, D25 — тот же вопрос для
писателей). Прогон ДО правки:

```
× интеграторский принципал (telegram/webhook.ts:372) — получатель опознан
× bootstrap-принципал (telegram/webhook.ts:378) — клиники нет, читать получателя нечем
✓ организационный принципал (telegram/webhook.ts:377) — получатель опознан

Caused by: Error: Missing unique declared integrator port capability
           for app.integrator_read_channel_binding_identity(text,text,text)
 ❯ integratorPortContextPrincipal src/infra/db/portContextRuntime.ts:227:11
 ❯ readChannelBindingIdentity   src/infra/db/repos/platformUserByChannel.ts:40:15
 ❯ Object.readDb                src/infra/db/readPort.ts:67:19
 ❯ loadUserContext              src/kernel/domain/handleIncomingEvent.ts:122:16
 ❯ buildBaseContext             src/kernel/domain/handleIncomingEvent.ts:141:23
 ❯ handleIncomingEvent          src/kernel/domain/handleIncomingEvent.ts:166:7
```

Причина в одну строку: у корня была ОДНА объявленная дверь — класса `tenant_service`
(`integrator_port_channel_binding_identity_read`). Рантайм порта подбирает возможность по паре
(`functionIdentity`, класс, выведенный ИЗ ПРИНЦИПАЛА, `portContextRuntime.ts:209–230`): под
интеграторским он ищет класс `integrator`, под bootstrap — `pre_session` либо `integrator` на роли
`app_integrator_resolver`. Ни того, ни другого не было → 0 совпадений → бросок.

### 1.3 Ошибка НЕ проглатывается — она уносит всё событие

Между броском и gateway'ем нет ни одного `try`:
`loadUserContext` → `buildBaseContext` → `handleIncomingEvent` → `processAcceptedIncomingEvent:99`
(`usecases/processAcceptedIncomingEvent.ts`) → `incomingEventPipeline.ts:101` (`pipeline.run`).

Ловит только `kernel/eventGateway/index.ts:67`. Что он делает: освобождает ключ дедупа (:71),
пишет `logger.error … 'eventGateway pipeline failed'` (:79) и возвращает
`{ status: 'rejected', reason: 'PIPELINE_FAILED' }` (:80–84).

Вебхук на `rejected`:

| канал | `path:line` | ответ мессенджеру |
|---|---|---|
| telegram | `telegram/webhook.ts:381`(warn) → `:464` | **HTTP 200** `{ok:false}` |
| telegram (выделенный бот) | `:518` | **HTTP 200** `{ok:false}` |
| max | `max/webhook.ts:320`(warn) → `:329` | **HTTP 200** `{ok:false}` |
| vk | `vk/webhook.ts:67` | HTTP 500 |

### 1.4 Что именно НЕ получал живой человек (обязательный пункт)

Бросок происходит в САМОМ НАЧАЛЕ обработки — при сборке базового контекста, до построения плана и
до единого шага сценария (`handleIncomingEvent.ts:164` идёт раньше `:175`). Поэтому теряется не
«поле `phoneNormalized`» и не «признак `linkedPhone`», а **весь ответ**:

- ни одного исходящего сообщения: `steps` не строятся, `intents` пусты, `dispatchIntent` не зовётся;
- ни ответа на `/start`, ни ссылки на вход в кабинет, ни ответа на нажатие кнопки
  (`callback.answer` тоже не отправляется — в мессенджере у человека остаётся «крутилка»);
- в telegram и max вебхук отвечает **200**, то есть мессенджер считает событие доставленным и
  **повтора не будет**: сообщение человека пропадает окончательно;
- в vk отвечает 500 — VK будет повторять, но отказ детерминированный, поэтому результат тот же.

Кого бьёт: **самых связанных людей**. Интеграторский принципал выбирается ровно тогда, когда и
клиника, и `integrator_user_id` уже известны — то есть у постоянного клиента клиники бот молчал
на КАЖДОЕ сообщение. Под bootstrap — у человека, чья клиника не определилась (в том числе первый
контакт).

### 1.5 Мёртвых маршрутов нет — есть один, которому дверь не положена

Бриф допускает: «если два из трёх маршрутов мертвы — удаляй». Проверено: **все три достижимы**.
`resolveTelegramOrganizationId` (`telegram/webhook.ts:171–190`) не имеет никакого fallback на
организацию по умолчанию и возвращает `null`, когда привязки канала ещё нет, — значит ветка
bootstrap живая (`:378`).

Но **чтение получателя под bootstrap невыполнимо по контракту**, и это не мнение:
`app.install_port_context` (`deploy/postgres/port-context/contract.sql:374, 399–404`) требует
`organization_id IS NULL` и у класса `pre_session`, и у класса `integrator` с ролью
`app_integrator_resolver` — единственных двух классов, которые рантайм подбирает под bootstrap
(`portContextRuntime.ts:219–223`). Стена арендатора в теле корня берёт клинику из принятого
контекста (`app.current_org_id()`), значит без организации она невыполнима, а дверь БЕЗ стены была
бы ШИРЕ прежнего реляционного чтения — чужая клиника стала бы видна (доказано инъекцией B, §4).

**Вывод:** третья дверь не заводится. Под bootstrap чтение не делается вовсе, и правильный ответ
маршрута без клиники — «получатель не опознан», а не бросок, роняющий событие.

---

## 2. Что сделано

### 2.1 Миграция — один гейт, ветвящийся по двери

`apps/webapp/db/drizzle-migrations/20260822T190000_the_incoming_recipient_door_opens_for_the_integrator_principal.sql`
— один `CREATE OR REPLACE FUNCTION`. Сигнатура, возврат, владелец
(`app_seam_identity_lookup_owner`), волатильность, `SECURITY DEFINER`, `search_path` и хеш
типизированных аргументов прежние → OID сохраняется, ни одна ссылка `regprocedure` не протухает.
Изменён ТОЛЬКО гейт. `GRANT`/`REVOKE`/`CREATE POLICY` — ноль (AGENTS.md §1); разбор прав — в шапке.

Тело взято из `20260822T150000_the_integrator_readers_get_named_roots.sql`, а не с DEV: на момент
начала работы корень на DEV уже приземлён, но снимать `pg_get_functiondef` не понадобилось — файл
и есть источник, а `--preflight` ниже доказывает, что версия из файла приземляема.

```sql
BEGIN
  v_integrator_user_id := app.current_integrator_user_id();
EXCEPTION WHEN insufficient_privilege THEN
  v_integrator_user_id := NULL;
END;

PERFORM app.require_accepted_context(
  'app_seam_identity_lookup_owner'::name,
  'app_integrator_request'::name,
  CASE
    WHEN v_integrator_user_id IS NOT NULL THEN 'integrator'::app.port_context_class
    ELSE 'tenant_service'::app.port_context_class
  END,
  'integrator.channel-binding-identity.read', …);
```

**Почему различитель не GUC `role`, как у образца.** У образца
(`app.record_reminder_occurrence_finalized_projection`,
`20260822T140000_the_shared_roots_name_the_role_of_their_door.sql`) двери различались РОЛЬЮ, поэтому
различителем был `current_setting('role')`. Здесь роль у обеих дверей одна (`app_integrator_request`
— бриф это и предписывает), а различается КЛАСС, и `role` его не называет. Класс лежит в
`app_ext.accepted_port_contexts`, но владелец шва её не читает — замер на `bcb_webapp_dev`:

```
usage app_ext                     | true
select accepted_port_contexts     | false
exec current_org_id               | true
exec current_integrator_user_id   | true
```

Выдать SELECT значило бы завести ВТОРОГО читателя принятого контекста рядом с
`app.require_accepted_context` — ровно тот дубль прохода, который запрещает AGENTS.md §5 (та же
причина названа в шапке образца). Поэтому класс называет единственный уже объявленный аксессор
интеграторской личности; право на него у владельца шва уже есть и декларацией не добавляется.

**Проба не является проверкой.** Она только ВЫБИРАЕТ ветку; принимает или отвергает по-прежнему
`app.require_accepted_context`, сверяя роль, класс, цель, хеш аргументов и идентичность функции со
строкой принятого контекста. Ошибись проба в любую сторону — гейт отвечает 42501 (доказано
инъекцией A). Однозначность пробы — контрактная: `install_port_context` требует
`integrator_user_id IS NOT NULL` у класса `integrator` с этой ролью и `IS NULL` у `tenant_service`,
то есть непустая интеграторская личность возможна ровно у одного из двух классов.

### 2.2 Права — только декларация + генератор

`deploy/postgres/privileges/declaration.ts`: одна новая строка возможности
`integrator_port_channel_binding_identity_read_integrator_context` (роль та же, класс `integrator`,
цель та же). Объявление самой функции (`rev10Function`) НЕ менялось: ни `execute`, ни `purpose`, ни
`relationSurfaces` — читаемые отношения и колонки не изменились ни на одну.

Артефакты пересобраны `--all` и `--all --port-context-only`, оба `--check` **побайтно, EXIT=0**.
Весь дифф генерированного:

```
+ ('06d28c89-…'::uuid, 'integrator', 'bcb_dev_integrator', 'app_integrator_request',
   'integrator'::app.port_context_class, 'integrator.channel-binding-identity.read',
   'app.integrator_read_channel_binding_identity(text,text,text)'::regprocedure),   [dev]
+ ('ae08dd6f-…'::uuid, … 'bcb_test_integrator' …)                                    [test]
- ('app.integrator_read_channel_binding_identity(…)', 'exact',   'app.require_accepted_context(…)', ARRAY[]::text[]),
+ ('app.integrator_read_channel_binding_identity(…)', 'exact_existing', '', ARRAY['app.hash_port_typed_args', …, 'integrator', …, 'tenant_service']::text[]),
```

Последняя строка — не ослабление проверки, а её штатная форма для корня с несколькими дверями:
генератор сам переключает режим ассерта на `exact_existing`, когда у корня больше одного кортежа
(`generate.mjs:1429–1446`), и требует присутствия ВСЕХ токенов обеих ветвей. Ровно так же выглядит
уже живущий образец `app.record_reminder_occurrence_finalized_projection`
(`privileges.bcb_webapp_dev.sql:2381`). **Ни одного нового GRANT ни одной роли рантайма.**

### 2.3 Bootstrap: чтение не делается

`apps/integrator/src/infra/db/repos/platformUserByChannel.ts` — один chokepoint всех трёх форм
чтения (`readChannelBindingIdentity`):

```ts
if (!getCurrentOrganizationPrincipalId()) return null;
```

`getCurrentDbPrincipalOrganizationId` отдаёт организацию для принципалов `organization` и
`integrator` и `undefined` для bootstrap (`packages/db-principal/src/index.ts:562–573, 950–961`) —
то есть гейт совпадает ровно с «есть арендатор». Соседний
`resolveActiveOrganizationIdForChannel` (дверь пред-маршрутизации, bootstrap-класс) НЕ тронут.

---

## 3. Живые доказательства (реальный вывод, DEV)

`--execute` на DEV **не запускался** (запрещено брифом). Корень и его первая дверь на DEV уже
приземлены (`pending=1 total=46` — pending это ровно моя миграция). Поэтому новая версия тела и
новая строка каталога возможностей материализуются **внутри откатываемой транзакции** дословно из
файла миграции и дословно из строк генератора — **с одной названной подстановкой:**
`session_login = session_user` (живой логин `bcb_dev_integrator` корни не создаёт). Каждая проба —
своя транзакция, каждая кончается `ROLLBACK`; **DEV не изменён**.

**Приземляемость:** `bash deploy/host/migrate-dev.sh --preflight` → **EXIT=0**

```
session_user = bcb_dev_migrator | current_user = app_seam_identity_lookup_owner | can_create_public = f
CREATE FUNCTION … ROLLBACK
Drizzle owner-ordered migration validated and rolled back for "bcb_webapp_dev":
  pending=1 total=46 reapplied=0 foreign-ledger-rows=0 unapplied=0
migrate-dev preflight: PASS
```

(Из worktree обёртка требует канонические `.env` и `apps/webapp/.env.dev` — скопированы из главного
дерева на время прогона и удалены после; оба в `.gitignore`. Это ограничение worktree, не дефект.)

**Фикстура DEV:** человек `18ac6866-b626-4131-8dea-2ecc3e80eac9`, telegram `100870117`, телефон
`+79310015987`, `integrator_user_id` 17, организация `a0000000-…-0001`. Чужая организация —
`d0000000-…-0004`, и зачислен в неё ДРУГОЙ человек, `00000000-…-0001` с telegram `111111111`.

```
P1  дверь integrator, свой человек          → 1 строка: 18ac6866-… | 100870117 | +79310015987
P2  дверь tenant_service, тот же человек     → 1 строка: 18ac6866-… | 100870117 | +79310015987
P3  дверь integrator, поиск по телефону      → 1 строка: 18ac6866-… | 100870117 | +79310015987
P4  дверь integrator, человек ЧУЖОЙ клиники  → 0 строк                    (стена арендатора в теле)
P5  дверь tenant_service, ЧУЖАЯ организация  → 0 строк                    (стена арендатора в теле)
P6  дверь integrator, ЧУЖАЯ организация в заявке
      → ERROR: port context organization claim is not active for the integrator user
        (стена срабатывает ДО двери — в app_ext.assert_port_context_claim)
P7  дверь integrator, ДВА ключа сразу
      → ERROR: integrator_channel_binding_identity_needs_exactly_one_key
P8  без принятого контекста                  → ERROR: accepted port context required
P9  ЧУЖАЯ ДВЕРЬ: принят контекст СОСЕДНЕГО корня на ТОЙ ЖЕ роли
      контроль — сосед своей дверью работает: 1 строка
      этот корень той же дверью              → ERROR: accepted port context required
```

P9 — прямой ответ на «под чужой дверью отказ»: роль совпадает, логин совпадает, транзакция та же, а
корень всё равно закрыт, потому что гейт сверяет цель, идентичность функции и хеш аргументов, а не
роль.

**Граница EXECUTE — корень достижим ровно ОДНОЙ ролью:**

```
 app_integrator_request          | допущен до двери
 app_integrator_resolver         | НЕТ ДОСТУПА К ФУНКЦИИ
 app_tenant_service              | НЕТ ДОСТУПА К ФУНКЦИИ
 app_operational_delivery_worker | НЕТ ДОСТУПА К ФУНКЦИИ
 app_pre_session / app_staff / app_patient / app_service | НЕТ ДОСТУПА К ФУНКЦИИ
```

---

## 4. Инъекции неисправности — по одной на каждый вывод

Инъекции в тело идут подстановкой в текст, снятый `pg_get_functiondef`, с **обязательной** проверкой
`strpos(...) = 0 → RAISE`: инъекция, которая ничего не нашла или не заменила, падает, а не выглядит
успешной (урок предыдущей ветки, где «инъекция» тихо давала 0 → 0).

| # | что сломано | ДО | ПОСЛЕ |
|---|---|---|---|
| **A** | гейт перестал ветвиться по двери: обе ветки называют `tenant_service` | P1 = 1 строка | `ERROR: accepted port context required` |
| **B** | из тела вырезан предикат организации (стена арендатора), проба под НОВОЙ дверью | 0 строк, `—` | **1 строка, `00000000-…-0001`** — человек ЧУЖОЙ клиники |
| **C** | снят гейт арендатора в читателе (bootstrap снова идёт в базу) | тесты зелёные | 2 падения: `bootstrap-принципал …` и `never opens the door without a tenant` |
| **D** | вторая дверь удалена из `declaration.ts` | каталог-тест зелёный | `not ok — must open for the organization and the integrator principal` |
| **E** | вторая дверь убрана из каталога рантайма в тесте | тесты зелёные | `× интеграторский принципал` → `Missing unique declared integrator port capability` |

**B — это тот самый класс, на котором предыдущая ветка чуть не расширила доступ вместо сужения.**
Он доказывает, что стена в теле несущая ИМЕННО под новой дверью: `SECURITY DEFINER` обходит RLS, и
без предиката организации интеграторский принципал одной клиники достаёт человека другой.

---

## 5. Тесты и статика

- `pnpm test:db-privileges` — **236 тестов, pass 145, fail 0, skipped 91** (skipped — opt-in
  `devDbProof`, требующие явного разрешения на живую базу);
- оба `--check` генератора — **побайтно, EXIT=0**;
- новый `apps/integrator/src/kernel/domain/incomingRecipientDoor.audit.test.ts` — 3 теста: настоящий
  слой порта под продуктовым `handleIncomingEvent`, по одному на каждый принципал вебхука;
- новый тест в `deploy/postgres/privileges/port-context-catalog.test.mjs` — у корня ровно по одной
  двери на принципал, несущий арендатора, и НИ ОДНОЙ двери, достижимой под bootstrap. Он нужен
  отдельно: фикстура каталога в vitest-тесте переписана руками и сама по себе не заметила бы, что
  дверь исчезла из декларации (инъекция D);
- новый тест в `platformUserReaders.namedRoot.unit.test.ts` — читатель не идёт в базу без арендатора;
- `npx vitest run` (весь интегратор) — **110 файлов, 565 passed, 2 expected fail, 1 skipped, EXIT=0**;
- `npx tsc --noEmit` (интегратор) — **EXIT=0**;
- `npx eslint` по затронутым файлам — чисто;
- репо-гейты: `check-db-chokepoint`, `check-no-new-raw-sql`, `check-queue-port-boundary`,
  `check-test-runner-visibility`, `check-c4-migration-owned-function-bodies`,
  `check-migration-privileges`, `check-seat-overage-single-door`,
  `check-drizzle-migration-order.sh`, `check-legacy-migrations-frozen.sh` — **все OK**.

**Три соседних теста пришлось поправить, и это не подгонка под код.**
`platformUserReaders.namedRoot.unit.test.ts` (3 случая) и `recipientResolution.test.ts` (3 случая)
звали читателя ВООБЩЕ БЕЗ принципала. После правки они обёрнуты в организационный принципал —
иначе их проверки «вернулся null» проходили бы по отсутствию клиники, а не по тому, что они
сторожат. Это восстановление смысла теста, а не ослабление.

---

## 6. НЕ СДЕЛАНО

- **`--execute` на DEV, деплой, запись на TEST, `push`, full CI** — не запускались, запрещено брифом.
- **Третья дверь (bootstrap) не заведена** — это решение, а не пропуск; обоснование в §1.5, цена
  ошибки показана инъекцией B.
- **Соседний корень `app.integrator_read_platform_user_delivery_identity(text)` не тронут.** У него
  та же одна дверь класса `tenant_service` и та же стена арендатора в теле, но его живой маршрут
  (`user.phoneForDeliveryLookup`) идёт под организационным принципалом, а не тройкой вебхука; в
  брифе его нет. Если он когда-нибудь начнёт зваться из-под интеграторского принципала — сломается
  тем же способом.
- **Членство `bcb_*_integrator` в `app_tenant_service` не снималось**, `app_operational_delivery_worker`
  не тронута — запрещено брифом.
- **Перепись `integratorDoorsOnTheWebappTenantRole` не изменилась** — эта правка её не касается
  (обе двери и так на своей роли `app_integrator_request`).

## 7. Находки, которых нет в плане — ВОПРОСЫ, не работа

1. **`declaration.ts` не проходит собственный typecheck, и это было ДО меня.**
   `npx tsc --noEmit -p deploy/postgres/privileges/tsconfig.json` даёт 2 ошибки `TS2322` на базе
   `e4ddba8ba` (строки 3757 и 6906) и те же 2 после моей правки (сдвинулись на 3772 и 6921 — моя
   строка их только подвинула). Значения `evidence` не входят в объявленный union:
   `"D20 enqueue root inserts idempotently and prunes expired sent rows"` и
   `"exact UPDATE in migration 0050"`. Чинить не стал — в плане этого нет.
2. **Отказ опознания получателя нигде не различим в логе от любого другого отказа пайплайна.**
   `eventGateway` пишет один общий `'eventGateway pipeline failed'`, а вебхук — `PIPELINE_FAILED`.
   Именно поэтому дефект жил молча: в логе он выглядел как «пайплайн упал», а не как «дверь не
   объявлена». Отдельного класса ошибки не заводил — это изменение наблюдаемости, а не эта задача.
