# 21. Цепочка миграций как источник истины: 11 дропов и прогон от нуля

**Распоряжение владельца (08.08.2026, дословно):** «сносить миграциями. Чтобы все что было раньше не имело
значение».

**Что сделано:** дописаны 8 недостающих миграций сноса (было 3 из 11), и на ОДНОРАЗОВОМ кластере PostgreSQL 16
доказано, что цепочка от нуля отрабатывает ЗЕЛЁНО и все 11 таблиц после неё отсутствуют.

**Что НЕ делалось и почему (решения владельца в ходе работы):**

1. **Старые миграции НЕ охраняются.** Правило порядка `scripts/migrate-all.sh` (Фаза 1: integrator < 20260708 →
   Фаза 2: webapp Drizzle ВСЕ → Фаза 3: integrator ≥ 20260708) даёт это бесплатно: файлы `20260808_*` попадают в
   Фазу 3, то есть ПОСЛЕ всей webapp-цепочки. Неохраняемые ссылки webapp-миграций `0109/0260/0282/0312/0323` на
   `integrator.user_reminder_rules` успевают отработать до сноса. **Это не рассуждение, а замер:** обе фазы ниже
   дали exit 0 без единой правки старых файлов.
2. **Привилегические оверлеи НЕ патчатся.** Владелец 09.08.2026: «ДА ЗАЧЕМ ОВЕРЛЕИ??? ТЫ СНОСИШЬ ИХ И МЕНЯЕШЬ
   ВСЮ СИСТЕМУ ГРАНТОВ С НУЛЯ». Оверлеи вроде `deploy/postgres/p0-5b-grants.sql` уходят целиком — права
   переезжают в генератор из `deploy/postgres/privileges/declaration.ts`. Их падение на снесённой таблице ниже
   ЗАФИКСИРОВАНО как замер, но закрывается заменой оверлея генератором, а не заплаткой.

---

## 1. Что добавлено: 8 миграций, порядок от детей к родителям

Все — в `apps/integrator/src/infra/db/migrations/core/`, схемой владеет интегратор.
**Одна таблица — один файл** (конвенция `DROP_TABLE_RE` в `actual-schema-tables.mjs`: списки через запятую
запрещены, разбирается только первая таблица после `DROP TABLE`).

| # | Файл | Таблица | Гейт перед дропом |
|---|---|---|---|
| 0001 | `…_drop_legacy_telegram_users.sql` | `telegram_users` | *(было в репозитории)* |
| 0002 | `…_drop_legacy_user_reminder_rules.sql` | `user_reminder_rules` | *(было в репозитории)* |
| 0003 | `…_drop_dead_content_access_grants.sql` | `content_access_grants` | *(было в репозитории)* |
| **0004** | `…_drop_legacy_question_messages.sql` | `question_messages` | зеркало в `public.support_question_messages` |
| **0005** | `…_drop_legacy_user_questions.sql` | `user_questions` | зеркало в `public.support_questions` + нет входящих FK |
| **0006** | `…_drop_legacy_conversation_messages.sql` | `conversation_messages` | зеркало в `public.support_conversation_messages` |
| **0007** | `…_drop_legacy_conversations.sql` | `conversations` | зеркало в `public.support_conversations` + нет входящих FK |
| **0008** | `…_drop_legacy_contacts.sql` | `contacts` | ни одно значение не существует ТОЛЬКО здесь (`public.user_contacts` / `platform_users.phone_normalized`) |
| **0009** | `…_drop_legacy_message_retry_jobs.sql` | `message_retry_jobs` | ноль строк в `pending`/`processing` |
| **0010** | `…_drop_legacy_identities.sql` | `identities` | зеркало в `public.user_channel_bindings` + предохранитель неожиданных зависимостей |
| **0011** | `…_drop_legacy_users.sql` | `users` | зеркало в `public.platform_users.integrator_user_id` + нет входящих FK |

**Порядок** (дети раньше родителей) — тот же, которым прошёл живой срез 08.08 (док. 19 §3):
`question_messages` → `user_questions` → `conversation_messages` → `conversations` → `contacts` →
`message_retry_jobs` → `identities` → `users`. Благодаря ему **CASCADE не нужен нигде**.

**Гейт вместо слепого дропа.** Каждая миграция проверяет свой инвариант НА ТОЙ БАЗЕ, ГДЕ ВЫПОЛНЯЕТСЯ, и при
непрохождении САМОУСТРАНЯЕТСЯ: печатает `RAISE NOTICE` с числами и выходит, не тронув таблицу. Это конвенция
трёх уже лежавших в репозитории миграций, и она сохранена дословно. Следствие, о котором надо помнить
(док. 17 §3.1): **отложенный гейтом дроп записывается в журнал как ПРИМЕНЁННЫЙ и сам не повторится** — после
деплоя смотреть `NOTICE` в логе миграции, а не только зелёный мигратор.

### 1.1 `identities`: три объекта снимаются ПОИМЕННО, а не CASCADE

Единственная из 11, которую нельзя снести простым `DROP TABLE`. На живом срезе 08.08 обычный `DROP` отказал
одинаково в обеих базах (док. 19 §3):

```
ERROR: cannot drop table integrator.identities because other objects depend on it
DETAIL: constraint message_drafts_identity_id_fkey on table integrator.message_drafts
        constraint telegram_state_identity_id_fkey on table integrator.telegram_state
        policy    saas_org_dormant_p0_8_5        on table integrator.message_drafts
```

Тогда сработал `CASCADE`. **В миграции CASCADE не используется** — те же три объекта снимаются по имени:

```sql
DROP POLICY IF EXISTS saas_org_dormant_p0_8_5 ON integrator.message_drafts;
ALTER TABLE integrator.message_drafts  DROP CONSTRAINT IF EXISTS message_drafts_identity_id_fkey;
ALTER TABLE integrator.telegram_state  DROP CONSTRAINT IF EXISTS telegram_state_identity_id_fkey;
DROP TABLE IF EXISTS integrator.identities;   -- без CASCADE
```

Разница не косметическая: `CASCADE` унёс бы молча и то, что окажется зависимым в будущем. Поэтому перед
снятием миграция отдельно ищет зависимости ВНЕ этих трёх (`pg_constraint` по FK + `pg_depend` по `pg_policy`)
и при находке **отказывается сносить что-либо**, назвав объекты по имени.

**Политика `saas_org_dormant_p0_8_5` на `message_drafts` снимается НАМЕРЕННО и не восстанавливается.**
Документ 17 §2 предсказывал, что это «тихо снимет стену». Замер показал обратное (док. 19 §3.1): у
`message_drafts` стоит `ENABLE` **и `FORCE ROW LEVEL SECURITY`**, а эта политика была единственной. RLS с нулём
политик в PostgreSQL — это deny-all, и `FORCE` распространяет запрет даже на владельца таблицы:

```
count(*) как superuser (RLS не применяется):        17
count(*) как владелец базы под FORCE RLS:            0
```

То есть утечки нет — таблица закрыта ВСЕМ. Это и есть требуемое владельцем состояние («у нас сейчас ВСЕ должны
стать НИКОМУ»), поэтому политика не восстанавливается. Восстановительный DDL лежит в
`/home/dev/dev-projects/bcb-backups/integrator-cut-2026-08-08/RESTORE.message_drafts_policy.sql`.

---

## 2. Стенд: одноразовый кластер PostgreSQL 16, только Unix-сокет

`bcb_webapp_dev`, `bersoncarebot_test` и PROD не открывались ни на чтение, ни на запись.

```
initdb -D <tmp>/data --username=bcb_chain_operator --auth=trust --no-locale
pg_ctl -D <tmp>/data -o "-F -k <tmp>/socket -p 57441 -c listen_addresses=''" -w start
```

`listen_addresses=''` — TCP выключен физически; попасть в кластер можно только через сокет во временном
каталоге, который удаляется вместе с кластером в `trap EXIT`.

### 2.1 Что здесь значит «от нуля»

**Пустая база НЕ подходит, и это свойство репозитория, а не этой работы.** Прогон честно пустой базы был
сделан первым и падает на девятой миграции:

```
PHASE 1-integrator-lt-20260708 → exit 1
migration: telegram:20260306_0009_add_telegram_state_split.sql
SQLSTATE 42P01 — CREATE TABLE telegram_state (identity_id BIGINT ... REFERENCES identities(id))
```

Причина историческая: сортировка миграций идёт по имени файла через все scope, и
`telegram:20260306_0009` оказывается РАНЬШЕ `core:20260306_0013_create_identities.sql`. Это расхождение
существует с марта 2026, к сносу отношения не имеет и правкой применённой истории не лечится.

Поэтому «от нуля» берётся в том виде, в каком его определяет сам репозиторий
(`docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/README.md`, `retired pre-B0 disposable harness (Git history only)`):

1. восстановить структурный baseline `a0-greenfield` (`schema.sql`, только DDL, **ноль строк** — проверено:
   census 241 таблица);
2. засеять журналы миграций из `migration-manifest.json` (68 integrator + 288 drizzle);
3. применить синтетический `seed.sql`;
4. прогнать **весь хвост** миграций трёхфазным порядком `scripts/migrate-all.sh`.

Baseline снят до среза и содержит все 11 таблиц — то есть стенд стартует ровно из того мира, где они есть.

**Штатный `pnpm run verify:saas-a0-greenfield-baseline` сейчас КРАСНЫЙ по своей, посторонней причине** — он
заводит только три роли, а `schema.sql` ссылается на семь:

```
verify-a0-greenfield-baseline: restore_schema_baseline_failed:3
psql:…/a0-greenfield/schema.sql:24478: ERROR: role "app_platform_settings" does not exist
```

Это не следствие сноса (воспроизводится и на HEAD без единой из 11 миграций). Поэтому стенд собран по рабочему
рецепту из `harness-lib.ts`: роли берутся тем же регэкспом-дискавери (16 штук), `app_owner` создаётся
`BYPASSRLS`, владельцу выдаётся `GRANT USAGE, CREATE ON SCHEMA app` под перенос владения функциями.

---

## 3. Прогон ДО правки (HEAD, в репозитории только 3 миграции сноса)

```
=== PRECHECK: legacy integrator tables present in the baseline
11
=== PHASE 1-integrator-lt-20260708  exit=0
=== PHASE 2-webapp-drizzle-all      exit=0
=== PHASE 3-integrator-ge-20260708  exit=0
=== POSTCHECK-1: legacy integrator tables still present
contacts,conversation_messages,conversations,identities,message_retry_jobs,question_messages,user_questions,users
=== POSTCHECK-2: integrator ledger
71
=== POSTCHECK-3: policies left on integrator.message_drafts
saas_org_dormant_p0_8_5
=== POSTCHECK-4: FKs left pointing at integrator.identities
conversations_user_identity_id_fkey,message_drafts_identity_id_fkey,telegram_state_identity_id_fkey,user_questions_user_identity_id_fkey
=== POSTCHECK-5: message_drafts:rls=true:force=true  telegram_state:rls=false:force=false
=== POSTCHECK-6: integrator schema table census
17
```

**Главное в этом прогоне — строка POSTCHECK-1: 8 таблиц вернулись.** Цепочка их создаёт и не сносит, то есть
свежая база из `pnpm run migrate` откатывала бы срез 08.08 обратно. Именно это и требовалось закрыть.

### 3.1 Замер падения привилегических оверлеев (фиксируем, НЕ чиним)

Те же оверлеи, применённые к этой базе с `-v ON_ERROR_STOP=1`:

```
DEPLOY GATE p0-5b               exit=3  p0-5b-grants.sql:428: ERROR: relation "integrator.content_access_grants" does not exist
DEPLOY GATE phase4-locked-helper exit=3  phase4-locked-helper-rls-policies.sql:39: ERROR: relation "integrator.content_access_grants" does not exist
```

Строка 428 — тот же класс отказа, что живьём 08.08 (док. 19 §5.3, там на `integrator.contacts`, потому что на
DEV были снесены все 11). `ON_ERROR_STOP=1` останавливает шаг на середине, оставляя половину грантов
применённой.

**Закрывается заменой оверлеев генератором прав** (`deploy/postgres/privileges/declaration.ts` → SCHEME §B),
а не охраной этих файлов. Решение владельца 09.08.2026. Остальные пять оверлеев из списка дока 19 §4.3 на этом
стенде до ссылок на таблицы вообще не доходят — они падают раньше на собственных предусловиях
(отсутствующие psql-переменные, требование точного имени базы `bcb_webapp_dev`, непровизиненные ACL ролей),
что тоже подтверждает: их судьба — генератор, а не заплатка.

---

## 4. Прогон ПОСЛЕ правки (все 11 миграций сноса в цепочке)

```
=== PRECHECK: legacy integrator tables present in the baseline
11
=== PHASE 1-integrator-lt-20260708  exit=0
=== PHASE 2-webapp-drizzle-all      exit=0
=== PHASE 3-integrator-ge-20260708  exit=0
=== POSTCHECK-1: legacy integrator tables still present
(none)
=== POSTCHECK-2: integrator ledger
79
=== POSTCHECK-3: policies left on integrator.message_drafts
(none)
=== POSTCHECK-4: FKs left pointing at integrator.identities
(none)
=== POSTCHECK-5: message_drafts:rls=true:force=true  telegram_state:rls=false:force=false
=== POSTCHECK-6: integrator schema table census
9
=== TOTAL rc=0
```

Что доказано построчно:

| Проверка | ДО | ПОСЛЕ | Что это значит |
|---|---|---|---|
| Фазы 1/2/3 | 0/0/0 | 0/0/0 | **старые миграции не сломались** — ни одна не потребовала охраны |
| Легаси-таблиц осталось | 8 | **0** | цепочка стала источником истины: свежая база их больше не воскрешает |
| Журнал integrator | 71 | 79 | применены все 8 новых, ни одна не пропущена |
| Политик на `message_drafts` | 1 | **0** | deny-all под `FORCE RLS` — намеренное конечное состояние |
| FK на `identities` | 4 | **0** | три внешних сняты поимённо, один ушёл со своей таблицей |
| `message_drafts` / `telegram_state` | живы | **живы**, `force=true` | остающиеся таблицы не задеты |
| Таблиц в схеме `integrator` | 17 | **9** | ровно −8 |

### 4.1 Идемпотентность: все 11 переприменены на уже очищенной базе

Каждый файл прогнан повторно напрямую через `psql -v ON_ERROR_STOP=1` поверх результата цепочки:

```
20260808_0001_drop_legacy_telegram_users.sql        exit=0
20260808_0002_drop_legacy_user_reminder_rules.sql   exit=0
20260808_0003_drop_dead_content_access_grants.sql   exit=0
20260808_0004_drop_legacy_question_messages.sql     exit=0
20260808_0005_drop_legacy_user_questions.sql        exit=0
20260808_0006_drop_legacy_conversation_messages.sql exit=0
20260808_0007_drop_legacy_conversations.sql         exit=0
20260808_0008_drop_legacy_contacts.sql              exit=0
20260808_0009_drop_legacy_message_retry_jobs.sql    exit=0
20260808_0010_drop_legacy_identities.sql            exit=0
20260808_0011_drop_legacy_users.sql                 exit=0
IDEMPOTENCY rc=0
```

Все выходят по ветке `to_regclass(...) IS NULL → RAISE NOTICE 'уже отсутствует — пропуск' → RETURN`.

---

## 5. Что осталось незакрытым (честно, чтобы не считалось сделанным)

1. **Оверлеи прав падают** — §3.1. Закрывается генератором из `declaration.ts`, не этой работой.
2. **Код рантайма не переписан.** После этих миграций пути из док. 19 §4.1–4.2 отдают `42P01`; воркер доставки
   (`repos/jobQueue.ts`) — самый чувствительный, он ляжет целиком (док. 19 §5.1). Порядок «код → потом дроп»
   остаётся требованием плана владельца; эти миграции его не отменяют.
3. **Гейты прода не прогонялись** — по построению: они выполняются на свежем прод-дампе (док. 17 §«Прод-гейт»).
   Замеры зеркалирования `identities` (98 %) и `users` (91 %) сделаны на TEST; на базе, где перенос не
   закончен, соответствующие миграции самоустранятся и напечатают числа.
4. **Инвариант «одна открытая беседа на канал» не переехал.** Уникальный частичный индекс
   `conversations_open_user_source_uidx` ушёл вместе с таблицей, аналога в `public.support_conversations` нет
   (док. 19 §6 б-1). Это отдельная миграция на приёмник, в этот снос не входит; предупреждение вписано в шапку
   `20260808_0007` и в `RAISE NOTICE` после успешного дропа.
