# 17. Снос 11 таблиц `integrator`: план, миграции, гейт прода

**Распоряжение владельца (08.08.2026):** «так сноси, миграцией, чтобы и в тесте и в проде снеслось».

**Вход:** [`15-integrator-tables-disposition.md`](15-integrator-tables-disposition.md) — вердикты по 20 таблицам.
СНОСИТЬ: `telegram_users`, `content_access_grants`, `message_retry_jobs`, `user_reminder_rules`, `contacts`.
ПЕРЕНЕСТИ И СНЕСТИ: `conversations`, `conversation_messages`, `user_questions`, `question_messages`,
`identities`, `users`.

**Что сделано этой работой:** авторская работа и проверка. **Ни одна миграция не запускалась, ничего не
снесено, деплой не трогался.** Все замеры — только чтение на `bersoncarebot_test`; `bersoncarebot` (PROD)
не открывался вообще.

---

## 🔴 ГЛАВНОЕ: ГЕЙТ ПРОДА. Читать до всего остального

**Зеркалирование замерено на TEST. Для PROD оно НЕ доказано.** Снести на проде таблицу, которая там
окажется единственным источником, — значит уничтожить данные живых людей.

Поэтому сделано две вещи, а не одна:

1. **Гейт вшит в сами миграции.** Каждая из трёх миграций перед `DROP TABLE` проверяет свой инвариант
   зеркала НА ТОЙ БАЗЕ, ГДЕ ВЫПОЛНЯЕТСЯ, и при непрохождении **самоустраняется**: печатает `RAISE NOTICE`
   с числами и выходит, не тронув таблицу. Мигратор при этом остаётся зелёным, а строка остаётся в базе.
   Это не «документная договорённость», которую можно забыть, — это предохранитель в двери.
   Прецедент, из-за которого он выглядит именно так: `rubitime/20260724_0002_drop_r7_raw_tables.sql`,
   ORDER GUARD в её шапке — там **дроп без предохранителя дважды уничтожил исходник** на from-zero
   прогонах прод-дампа.

2. **Отдельный ручной гейт на СВЕЖЕМ ПРОД-ДАМПЕ.** Дамп — единственное разрешённое взаимодействие с
   продом. Ниже — read-only запросы, по одному на таблицу, с порогами. **Миграции не приземляются на прод,
   пока все три не дали PASS.**

### Прод-гейт: запустить на восстановленном свежем прод-дампе (не на живом проде)

```bash
# 0) свежий дамп прода → одноразовая база на dev-боксе (прод при этом только читается штатным дампом)
sudo -u postgres createdb bcb_prodgate && sudo -u postgres pg_restore -d bcb_prodgate <свежий-дамп>
```

| # | Таблица | Запрос (одна строка) | PASS |
|---|---|---|---|
| G1 | `telegram_users` | `SELECT count(*) AS total, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM integrator.identities i WHERE i.resource='telegram' AND i.external_id=t.telegram_id::text)) AS decomposed, count(*) FILTER (WHERE t.phone IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.platform_users pu WHERE pu.phone_normalized=t.phone)) AS phone_only_here FROM integrator.telegram_users t;` | `decomposed = total` И `phone_only_here = 0` |
| G2 | `user_reminder_rules` | `SELECT count(*) AS total, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.reminder_rules p WHERE p.integrator_rule_id=r.id)) AS mirrored FROM integrator.user_reminder_rules r;` | `mirrored = total` |
| G3 | `content_access_grants` | `SELECT count(*) AS total FROM integrator.content_access_grants;` | `total = 0` |

Дополнительно — те же четыре структурные проверки, что сделаны на TEST (см. §2), обязаны дать ноль строк
на прод-дампе: определительские функции, представления, чужие FK, чужие RLS-политики.

**Замер на TEST (08.08.2026):** G1 → `2 / 2 / 0` PASS · G2 → `27 / 27` PASS · G3 → `0` PASS.

---

## 1. Короткий вывод: 3 сносим, 8 блокированы

| Статус | Кол-во | Таблицы |
|---|---:|---|
| **СНОСИМ** (миграция написана) | **3** | `telegram_users`, `user_reminder_rules`, `content_access_grants` |
| **БЛОКИРОВАНО — живой писатель** | **8** | `contacts`, `message_retry_jobs`, `conversations`, `conversation_messages`, `user_questions`, `question_messages`, `identities`, `users` |

Правило, по которому проведена граница: **таблица с живым писателем в drop-набор не входит.** Дроп из-под
живого писателя — это не «снос мусора», это поломка. У восьми таблиц писатель не просто есть в коде, а
достижим с живого HTTP-роута, вебхука или воркер-цикла — доказательства в §5.

Три таблицы, которые сносим, объединяет не «мало строк», а то, что **их сегодня никто не пишет**:
у `telegram_users` `n_tup_upd = 0` и `idx_scan = 0` с марта, у `user_reminder_rules` `n_tup_ins = 27` и ни
одной вставки после forward-copy, у `content_access_grants` `n_tup_ins = 0` за всю историю.

---

## 2. Независимая проверка каталога (не по документу 15, а по `pg_catalog`)

Документ 15 утверждает: «Ни одна definer-функция не ссылается ни на одну таблицу из списка». Перепроверено
самостоятельно, шире и по авторитетным источникам (`pg_depend`, а не только текстовый поиск по `prosrc`).

| Что проверял | Как | Результат |
|---|---|---|
| SECURITY DEFINER и обычные функции | `pg_proc.prosrc ~ 'integrator\.<t>\M'` по всем 11 + отдельный проход по НЕквалифицированным именам | **0 строк** — подтверждено |
| Представления и матвью | `pg_depend` через `pg_rewrite` (не `pg_get_viewdef`-грепом) | **0 строк** — подтверждено |
| Пользовательские триггеры | `pg_trigger WHERE NOT tgisinternal` | **0 строк** — подтверждено |
| Входящие FK извне drop-набора | `pg_constraint contype='f'` | **2 строки** — см. ниже |
| RLS-политики на чужих таблицах | `pg_depend` от `pg_policy` | **1 значимая** — см. ниже |

**Найдено сверх документа 15 — два блокера, которых в нём нет:**

1. **`integrator.message_drafts` и `integrator.telegram_state` (обе ОСТАЮТСЯ) держат FK на
   `integrator.identities`.** `message_drafts_identity_id_fkey`, `telegram_state_identity_id_fkey`.
   Пока эти FK не перевешены на `public.user_channel_bindings.id`, `identities` физически не дропнуть.
2. **RLS-политика `saas_org_dormant_p0_8_5` на `integrator.message_drafts` (ОСТАЁТСЯ) зависит от
   `integrator.identities`** (`pg_depend`: `pg_policy → integrator.identities`). Дроп без `CASCADE`
   откажет; дроп с `CASCADE` **тихо снимет стену с `message_drafts`** — регресс безопасности.
   Документ 15 упоминает пациентские ветки политик на `conversations`/`user_questions`/`question_messages`
   (они уходят вместе со своими таблицами), но `message_drafts` в этом списке нет, а он остаётся.

**Опровергнуто (тревога оказалась ложной, но проверять было обязательно).** Миграция
`apps/webapp/db/drizzle-migrations/0175_p0_8_b4_roles_1_is_staff_wall_rls.sql:525,528` создаёт политики на
ОСТАЮЩИХСЯ `user_reminder_occurrences` и `user_reminder_delivery_logs`, чья пациентская ветка джойнит
`integrator.user_reminder_rules`. По файлу миграции это выглядит как жёсткий блокер.
**Живой `pg_policies` показывает, что обе политики уже переписаны на `public.reminder_rules`**
(`b4f_rule.integrator_rule_id`, `b4f_rule.integrator_user_id`), и `pg_depend` подтверждает: ни одна
политика вне drop-набора от `user_reminder_rules` не зависит. **Вывод: смотреть надо в живой каталог, а не
в текст миграции — миграция показывает прошлое, каталог показывает настоящее.**

Побочно это объясняет аномалию, которая сначала выглядела как «живой горячий читатель»:
`user_reminder_rules_pkey` имеет **3 769 609 `idx_scan`** при 27 строках и нулевых рантайм-ссылках.
Это накоплено СТАРОЙ политикой, пока она была жива (`pg_stat_database.stats_reset IS NULL` — статистика
кумулятивна с рождения базы), а не сегодняшним потребителем.

---

## 3. Миграции: где лежат, почему так, порядок в цепочке

Все 11 таблиц созданы миграциями интегратора (`telegram_users` — в scope `telegram`, остальные — в `core`),
значит **схемой владеет интегратор** и дропы принадлежат его каталогу миграций:

```
apps/integrator/src/infra/db/migrations/core/
  20260808_0001_drop_legacy_telegram_users.sql
  20260808_0002_drop_legacy_user_reminder_rules.sql
  20260808_0003_drop_dead_content_access_grants.sql
```

**Одна таблица — один файл.** Требование частичного отката выполняется буквально: любую из трёх можно
откатить (восстановить из дампа) и переприменить независимо от двух других. Плюс это совпадает с
конвенцией репозитория — `docs/_TODO/SAAS_FOUNDATION/scripts/actual-schema-tables.mjs` разбирает
`DROP_TABLE_RE`, который берёт только первую таблицу после `DROP TABLE`, поэтому списки через запятую
запрещены.

**Порядок в общей цепочке — не случайность, а гарантия.** `scripts/migrate-all.sh` гоняет три фазы:

```
Фаза 1: integrator, версия < 20260708
Фаза 2: webapp Drizzle — ВСЕ
Фаза 3: integrator, версия ≥ 20260708
```

Имена `20260808_*` ≥ `20260708` → миграции идут в **ФАЗЕ 3, после всех webapp-миграций**. Это снимает
самый опасный класс отказа: webapp-миграции `0109`, `0260`, `0282`, `0312`, `0323` ссылаются на
`integrator.user_reminder_rules` **без `to_regclass`-охраны**, и на from-zero прогоне прод-дампа они
успевают отработать до сноса. Если бы дроп попал в Фазу 1 — цепочка развалилась бы ровно так, как она
разваливалась на R7.

**Старые миграции не редактируем.** Не только из гигиены: `apps/webapp/scripts/run-webapp-drizzle-migrate.mjs`
сверяет журнал по **хешу файла** (`ledgerHashes.has(migration.hash)`), поэтому правка применённой миграции
превращает её в «missing» и валит преднастройку деплоя. Санкционированный способ заменить старую миграцию —
новая forward-миграция с маркером `-- RECONCILES-MIGRATION-HASH: <tag>` (регэксп в том же файле, `:33`).
Здесь он не нужен: Фаза 3 решает вопрос без правки прошлого.

**FK-порядок внутри трёх сносимых.** Зависимостей между ними нет: `telegram_users` — изолирована (FK сняты
ещё `telegram/20260306_0010`), `user_reminder_rules` и `content_access_grants` — только исходящие FK
(на `integrator.users` и `public.be_organizations`), входящих нет. Порядок применения безразличен;
файлы пронумерованы для читаемости.

### ⚠ Два свойства мигратора, которые надо знать до мержа

1. **Отложенный дроп записывается в журнал как ПРИМЕНЁННЫЙ и сам никогда не повторится.**
   `migrate.ts:applyMigration` пишет строку в `integrator.schema_migrations` после любого успешного
   выполнения SQL — а `DO`-блок, вышедший по `RETURN` из гейта, успешен. То есть если прод-гейт не прошёл
   ВО ВРЕМЯ миграции, таблица останется, миграция будет числиться применённой, и **автоматически ничего
   не досносится**. Это сделано намеренно (fail-safe: лучше живая таблица, чем потерянные данные), но
   означает, что **после деплоя обязательно смотреть `NOTICE` в логе миграции**, а не считать зелёный
   мигратор доказательством сноса. Досносить придётся новой миграцией.

2. **Файлы миграций в репозитории — это гейт запуска интегратора.** В режимах `locked`/`shadow`
   (TEST и PROD) `runStartupMigrationGate` идёт в `verify-ledger-only` и **не даёт процессу подняться**,
   если в репозитории есть миграция, которой нет в журнале (`migrate.ts:verifyStartupMigrationState`).
   Следствие: эти три файла нельзя мержить и катить code-only деплоем — миграции обязаны отработать в
   том же деплое, иначе интегратор не встанет.

**Проверка синтаксиса без выполнения (08.08).** Все три `DO`-блока прогнаны на `bersoncarebot_test` в
режиме dry-run: строка `DROP TABLE` заменена на `RAISE NOTICE`, остальное — дословно. Все три разобрались
plpgsql'ом, прошли свои гейты и дошли до ветки дропа (`2/2`, `27/27`, `0`). Таблицы после прогона на месте —
проверено `pg_class`.

---

## 4. Код: что снять и в каком порядке

**Железный порядок: код перестаёт трогать таблицу → потом дроп.** Обратный порядок = 500-е на живых
роутах между деплоем и миграцией.

### Шаг 1 — код приложений (один коммит на таблицу)

#### `telegram_users` — тривиально, 2 места
| Файл:строка | Что | Класс |
|---|---|---|
| `apps/webapp/db/schema/schema.ts:3873-3907` | `export const telegramUsers = pgTable('telegram_users', …)` | мёртвый артефакт introspect: **bare `pgTable`** → схема `public`, где такой таблицы уже нет; потребителей ноль |
| `scripts/check-telegram-users.ts` | весь файл | одноразовый отладочный скрипт |

Запросов к `telegram_users` в `apps/integrator/src`, `apps/webapp/src`, `packages/` — **ноль**.

#### `user_reminder_rules` — 5 мест, все вне рантайма
| Файл:строка | Что |
|---|---|
| `apps/webapp/scripts/backfill-reminders-domain.mjs:69,140,209` | backfill (`FROM user_reminder_rules`, 2 JOIN) |
| `apps/webapp/scripts/reconcile-reminders-domain.mjs:67` | сверка |
| `apps/webapp/scripts/integrator-schema-cleanup/01_audit.ts:23` | запись реестра |
| `apps/webapp/scripts/integrator-schema-cleanup/03_reconcile.ts:21,24` | запись реестра |
| `apps/webapp/scripts/integrator-schema-cleanup/05_drop_deprecated.ts:22,25` | запись реестра |

Drizzle-объявления НЕТ ни в одном приложении — символ `userReminderRules` не существует.
Комментарии-упоминания (`integratorM2mPosts.ts:28`, `notificationTopicCode.ts:17`) — текст, не запросы;
по желанию поправить, на работоспособность не влияет.

#### `content_access_grants` — 9 мест, и одно из них достижимо
| Файл:строка | Что | Класс |
|---|---|---|
| `apps/integrator/src/infra/db/repos/mergeIntegratorUsers.ts:433` (+ поля `:74,:279,:306,:435,:453`) | `UPDATE content_access_grants SET user_id …` | 🔴 **ДОСТИЖИМЫЙ ПИСАТЕЛЬ** — живой M2M-роут `integrations/bersoncare/userMergeM2mRoute.ts:128,154`. Переклейка пустоты (0 строк), но после дропа даст 42P01 → 500 на слиянии |
| `apps/integrator/src/infra/adapters/protectedAccessPort.ts` | весь файл | `issueAccess()` не вызывается ниоткуда + заглушен отсутствием env `:29-31` |
| `apps/integrator/src/infra/db/repos/reminders.ts:507-534` | `createContentAccessGrant` (INSERT `:522`) | недостижим: `n_tup_ins = 0` за всю историю |
| `apps/integrator/src/infra/db/writePort.ts:1457-1471` (+ импорт `:35`) | `case 'content.access.grant.create'` | |
| `apps/integrator/src/kernel/contracts/ports.ts:278` | тип `issueAccess` | |
| `apps/integrator/src/infra/db/schema/integratorDomainRepos.ts:75` | Drizzle-объявление | |
| `apps/integrator/src/infra/db/integratorDrizzleSchema.ts:11,30` | импорт + регистрация | |
| `apps/integrator/src/app/di.ts:271,281` | DI-проводка | |
| `apps/webapp/db/schema/schema.ts:3843` + `relations.ts:74,600,670,672` | мёртвый артефакт (bare `pgTable` → `public`) | |

Не путать с `public.content_access_grants_webapp` — **другая, живая** таблица
(`apps/webapp/src/infra/repos/pgEntitlements.ts:3,13-23`), её не трогать.

### Шаг 2 — деплой-артефакты (без этого деплой упадёт, а не «предупредит»)

Это самая недооценённая часть: три из них применяются с `ON_ERROR_STOP=1` и **не проверяют существование
таблицы**.

| Артефакт | Строки | Почему упадёт |
|---|---|---|
| `deploy/postgres/p0-5b-grants.sql` | `:59,:71,:75` (+ patient-списки `:267,:268`) | `GRANT … ON TABLE %I.%I` без охраны; применяется деплоем с `ON_ERROR_STOP=1` → падает шаг установки P0.5b-стены. **Файл генерируемый — править генератор**: `docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs`, там уже есть механизм ровно под это (`r7DroppedRawRubitimeTables`, `:117` — комментарий дословно описывает этот класс отказа). Затем `node docs/_TODO/SAAS_FOUNDATION/scripts/p0-5b-grants-sql.mjs > deploy/postgres/p0-5b-grants.sql` |
| `scripts/deploy-saas-667.sh` | `:485` | `FOREACH v_table IN ARRAY ARRAY['contacts','content_access_grants','user_reminder_rules',…]` → `SELECT count(*) FROM integrator.%I WHERE organization_id IS NULL` → `RAISE EXCEPTION` |
| `deploy/postgres/phase4-locked-helper-rls-policies.sql` | `:38-44` (`content_access_grants`) | `ALTER TABLE … ENABLE ROW LEVEL SECURITY` на снесённой таблице |
| `deploy/postgres/phase4-force-rls-cutover.sql` | `:236` | то же |
| `deploy/postgres/p0-5-role-split.sql` | `:91,:98` | GRANT-список |
| `docs/_TODO/SAAS_FOUNDATION/scripts/check-p0-10-tier-completeness.mjs` | — | по прецеденту R7 обновляется тем же изменением: перестаёт ждать таблицы в живой схеме |

### Шаг 3 — миграции (после Шага 1 и Шага 2, зелёного CI и PASS прод-гейта)

---

## 5. БЛОКИРОВАНО: 8 таблиц и доказательства

Ни одна не входит в drop-набор. Причина у всех одна и та же — **живой писатель**, достижимый с живого входа.

| Таблица | Живой писатель | Доказательство достижимости |
|---|---|---|
| `contacts` | ДА, **в двух приложениях** | интегратор `repos/channelUsers.ts:737` (DELETE) + `:749` (INSERT…ON CONFLICT) в `setUserPhone` ← `writePort.ts:441` (`user.phone.link`) и `kernel/domain/usecases/handleUpdate.ts:105`. Вебапп — **своя копия** `apps/webapp/src/infra/repos/pgMessengerPhoneHttpBind.ts:181,190` ← живой роут `app/api/integrator/messenger-phone/bind/route.ts:79`. Плюс 9 читателей. Переключатель `repos/linkedPhoneSource.ts` по дефолту `public_then_contacts` |
| `message_retry_jobs` | ДА, воркер-цикл `while(true)` | `repos/jobQueue.ts:64,104,126,140,151` (UPDATE) ← `runtime/worker/main.ts:66-92`. Сверх того **два деплой/старт-пробника** жёстко ломаются: `deploy/host/assert-c4-operational-runtime-ready.sh:106` (`UPDATE … WHERE false`) и `infra/db/operationalPoolReadiness.ts:30` (`SELECT 1 … WHERE false`). Замер: **10 строк `pending` с `next_try_at` до 2026-08-29 16:59** — это неотправленные сообщения живым людям |
| `conversations` | ДА | `repos/messageThreads.ts:229` INSERT, `:308` UPDATE ← `writePort.ts:602,810` ← `executeAction.ts:1439` ← вебхуки Telegram/MAX. 7 читателей + крон `auto-close-stale-conversations.ts` |
| `conversation_messages` | ДА | `messageThreads.ts:269` INSERT ← `writePort.ts:720` ← `executeAction.ts:1453`. 3 читателя |
| `user_questions` | ДА | `messageThreads.ts:572` INSERT, `:621` UPDATE ← `writePort.ts:882,1096` ← `executeAction.ts:1469` |
| `question_messages` | ДА (читателей ноль) | `messageThreads.ts:601` INSERT ← `writePort.ts:992` ← `executeAction.ts:1481`. Единственная из восьми, у кого нет ни одного SELECT — но писатель живой |
| `identities` | ДА, **в двух приложениях** | интегратор `channelUsers.ts:278`, `messageThreads.ts:350`, `mergeIntegratorUsers.ts:390,398`; вебапп `pgMessengerPhoneHttpBind.ts:132`. ~25 читателей. **Плюс 2 FK и 1 RLS-политика с ОСТАЮЩИХСЯ таблиц** (§2) |
| `users` | ДА, **в двух приложениях** | интегратор `channelUsers.ts:266`, `messageThreads.ts:337`, `mergeIntegratorUsers.ts:441`; вебапп `pgMessengerPhoneHttpBind.ts:119`, `platformUserFullPurge.ts:489` |

### Отдельно: зеркалирование `identities` и `users` — НЕ 100 %

Задача пришла с формулировкой «measured as already fully mirrored». **Замер этого не подтверждает.**

| Что | В `integrator` | Есть в `public` | Доля |
|---|---:|---:|---:|
| `identities` → `user_channel_bindings` (по `external_id`) | 134 | 131 | 98 % |
| `users` → `platform_users.integrator_user_id` | 134 | **122** | **91 %** |

12 строк `integrator.users` не имеют пары в `platform_users` по `integrator_user_id`; ни одна из них не
помечена `merged_into_user_id`, и у всех 12 есть `identities`. Из этих 12 десять всё же достижимы через
`user_channel_bindings` (то есть человек в платформе есть, не проставлена колонка связи), а **два — нет**.
Цифры «100 %» по этой паре в документе 15 не было — но и «полностью зеркалировано» утверждать нельзя.
Для `identities`/`users` это ещё один довод сверх живых писателей: **сносить нечего не потому, что рано,
а потому, что перенос не закончен**.

Три остальные пары зеркалирование подтверждают полностью и независимо: поддержка `21/21`, `34/34`,
`16/16`, `20/20`; `user_reminder_rules` `27/27`; `contacts` `78/78` при нуле телефонов, которых нет в
`platform_users`.

### Условия разблокировки (кратко; полный порядок волн — в документе 15, §«ЧТО СНОСИТЬ И В КАКОМ ПОРЯДКЕ»)

- **`message_retry_jobs`** — дождаться `count(*) FILTER (WHERE status='pending') = 0` (не раньше
  **2026-08-29 17:00 MSK**), снять слив в воркере и **оба пробника готовности**, иначе упадёт деплой.
- **`contacts`** — переключить `integrator_linked_phone_source` → `public_only`, выждать окно без событий
  `linked_phone_legacy_fallback` (`channelUsers.ts:526`), снять **две** независимые реализации
  `setUserPhone` (интегратор + вебапп) и 9 читателей.
- **Кластер поддержки (4)** — перевести чтения `messageThreads.ts` и `readPort.ts:102` на `public.support_*`,
  убрать локальную половину дуальной записи в `writePort.ts`, увезти крон `auto-close-stale-conversations.ts`.
  Порядок дропа по FK: `question_messages` → `user_questions` → `conversation_messages` → `conversations`.
- **`identities`, `users`** (D25) — только после всех предыдущих: перевесить FK `message_drafts.identity_id`
  и `telegram_state.identity_id` на `public.user_channel_bindings.id`, **переписать RLS-политику
  `message_drafts`**, перевести резолв на существующий порт `repos/platformUserByChannel.ts:38`, догнать
  зеркалирование до 100 %, вырезать `userMergeM2mRoute` (Р-D26).

---

## 6. Страховка

### 6.1 Дамп до дропа — по таблице, отдельным файлом

Отдельные файлы, а не общий дамп: восстановление одной таблицы не должно требовать разбора остальных.

```bash
STAMP=$(date +%F)
OUT=/var/backups/bcb/predrop/$STAMP && sudo -u postgres mkdir -p "$OUT"

# TEST
for T in telegram_users user_reminder_rules content_access_grants; do
  sudo -u postgres pg_dump -d bersoncarebot_test --table="integrator.$T" \
    --file="$OUT/test.integrator.$T.sql"
done

# PROD — выполняется на прод-хосте штатным дампером, схема+данные, ОДНА таблица на файл
for T in telegram_users user_reminder_rules content_access_grants; do
  sudo -u postgres pg_dump -d bersoncarebot --table="integrator.$T" \
    --file="$OUT/prod.integrator.$T.sql"
done

# контрольные суммы — по прецеденту R7 (архив без сумм не считается архивом)
cd "$OUT" && sudo -u postgres sha256sum *.sql | sudo -u postgres tee SHA256SUMS
```

Откат одной таблицы: `psql -d <db> -f "$OUT/<env>.integrator.<T>.sql"` — файл несёт и DDL, и данные.

### 6.2 Проверка после дропа: что обязано НЕ отдавать 500

Полный список путей, которые касались трёх снесённых таблиц. Он короткий — в этом и смысл выбора именно
этих трёх.

| Путь / поток | Касался | Ожидание после дропа |
|---|---|---|
| `POST /api/integrator/users/merge` (M2M слияние) → `mergeIntegratorUsers` | `content_access_grants` (UPDATE `:433`) | 🔴 **единственный реальный риск 500.** После снятия строки `:433` — 200. Проверить обязательно |
| Вебхук Telegram/MAX → `incomingEventPipeline` → `upsertUser` | `telegram_users` — нет (разложена), `identities`/`telegram_state` — есть и остаются | без изменений |
| Старт интегратора (`main.ts` → `runStartupMigrationGate`) | журнал `schema_migrations` | поднимается; в `locked`/`shadow` режиме DDL не гоняет |
| `POST /api/integrator/patient-reminders/materialize-wake` → `user_reminder_occurrences` | RLS-политика occurrences (уже на `public.reminder_rules`) | без изменений |
| Пациентские действия по напоминаниям (skip/done/snooze/cancel) — 10 definer-функций | `user_reminder_occurrences` | без изменений — ни одна definer-функция не ссылалась на снесённое (§2) |
| Воркер доставки напоминаний `outgoingDeliveryWorker` | `user_reminder_occurrences`, `user_reminder_delivery_logs` | без изменений |
| `/admin_users` (бот) → `repos/adminStats.ts` | `identities`, `contacts` — обе ОСТАЮТСЯ | без изменений |

Запросы-подтверждения после дропа:

```sql
-- 1) таблиц нет
SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='integrator' AND c.relname IN ('telegram_users','user_reminder_rules','content_access_grants');
-- PASS: 0

-- 2) ничего не осиротело: нет висящих FK/политик/функций на снесённое
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname NOT IN ('pg_catalog','information_schema')
   AND p.prosrc ~ 'integrator\.(telegram_users|user_reminder_rules|content_access_grants)\M';
-- PASS: 0

-- 3) стены на ОСТАВШИХСЯ reminder-таблицах живы (главная проверка на регресс безопасности)
SELECT tablename, policyname FROM pg_policies
 WHERE schemaname='integrator' AND tablename IN ('user_reminder_occurrences','user_reminder_delivery_logs');
-- PASS: обе строки на месте, обе с saas_org_dormant_p0_8_5

-- 4) канонические данные целы
SELECT (SELECT count(*) FROM public.reminder_rules), (SELECT count(*) FROM integrator.identities);
-- PASS: не меньше, чем до дропа
```

Плюс обязательный прогон гейтов деплоя, которые правились в Шаге 2:
`bash deploy/host/assert-c4-operational-runtime-ready.sh` и установка P0.5b-стены из
регенерированного `deploy/postgres/p0-5b-grants.sql`.

---

## 7. Нормализация телефона: функция остаётся, хранилище уходит

Владелец: «модулю нужна функция нормализации, а не хранилище». Проверено — так и есть, и разделение
уже физически существует.

`apps/integrator/src/infra/phone/normalizeRuPhoneE164.ts` — **чистая функция**, 9 строк, `string → string`,
**ноль импортов**, ни SQL, ни I/O, ни состояния модуля. Никакого отношения к таблице `contacts` она не
имеет: `setUserPhone` (`channelUsers.ts:724`) ничего не нормализует, ему приезжает готовый E.164.
Байт-в-байт близнец живёт в вебаппе — `apps/webapp/src/shared/phone/normalizeRuPhoneE164.ts` (синхронизация
конвенцией комментария).

Потребителей — 16 продуктовых (2 в интеграторе: `bookingLifecycleRoute.ts:426,464`,
`calendarDescription.ts:65`; 14 в вебаппе), и **ни один из них не трогает `integrator.contacts`**.

**Вывод: функция переживает снос хранилища без единой правки.** Отдельного действия «сохранить
нормализатор» не требуется — он и так не связан с таблицей. Формулировка карты D20 (`:319`) остаётся
верной дословно: «ОСТАЁТСЯ (форма адреса канала); доверие к телефону — УЕЗЖАЕТ (D25)».

---

## 8. Что удивило (расхождения с входными документами — зафиксировано здесь, в источнике)

1. **Миграция врёт о настоящем.** Политики `0175:525,528` выглядят как блокер `user_reminder_rules`, но
   живьём давно переписаны на `public.reminder_rules`. Проверка «по файлу миграции» дала бы ложный блокер;
   правильный источник — `pg_policies`/`pg_depend`.
2. **`users` зеркалирована на 91 %, не на 100 %.** 12 строк без пары в `platform_users`, из них 2 не
   достижимы даже через `user_channel_bindings`. Формулировка задачи «fully mirrored» по этой таблице
   не подтверждается.
3. **`message_drafts` — забытый держатель зависимости.** Остающаяся таблица держит и FK, и RLS-политику на
   `identities`. Документ 15 перечисляет пациентские ветки политик на уходящих таблицах, но эту —
   остающуюся — не называет.
4. **Деплой ломается раньше рантайма.** Три артефакта (`p0-5b-grants.sql`, `deploy-saas-667.sh:485`,
   `phase4-locked-helper-rls-policies.sql`) применяются с `ON_ERROR_STOP=1` без проверки существования
   таблицы. Снести таблицу и забыть про них — значит положить деплой, а не получить деградацию.
   В генераторе грантов уже есть готовый механизм под это (`r7DroppedRawRubitimeTables`) — с комментарием,
   описывающим ровно этот отказ.
5. **`contacts` пишется ДВАЖДЫ, из двух приложений.** Документ 15 называет вебапповского писателя
   (`pgMessengerPhoneHttpBind.ts:181,190`) третьим в списке; по факту это **независимая вторая реализация
   `setUserPhone` со своим HTTP-входом**, и снимать надо обе.
6. **Трёхфазный порядок миграций спасает бесплатно.** `scripts/migrate-all.sh` кладёт всё `≥ 20260708` в
   Фазу 3, после webapp-цепочки. Именно поэтому неохраняемые ссылки на `integrator.user_reminder_rules` в
   `0109/0260/0282/0312/0323` не превращаются в повторение R7 — но это свойство ИМЕНИ ФАЙЛА, и его легко
   потерять, назвав миграцию датой из прошлого.
7. **`3.7 млн idx_scan` при 27 строках и нуле читателей.** Выглядело как доказательство живого горячего
   пути; оказалось следом умершей RLS-политики в кумулятивной статистике, которую ни разу не сбрасывали.
   Счётчик `pg_stat_*` без `stats_reset` — это история, а не «сейчас».
8. **Зелёный мигратор ≠ снесено.** Отложенный гейтом дроп записывается в журнал как применённый и сам
   не повторяется (§3). Единственное доказательство сноса — `NOTICE` в логе миграции и `pg_class` после.
   Ровно этой ловушкой объясняется формулировка в шапке R7: «historical drop was completed at the END of
   the retirement pipeline» — то есть отдельным ручным шагом, а не самой миграцией.
