# Тело корня опознания под структурный гейт definer-шлюза — СТОП по пункту 2 брифа

**Ветка:** `wt/recipient-door-gate-fix-20260822` · **база:** `0eb649ab3`
**Бриф:** `docs/_TODO/runs/briefs/RECIPIENT_DOOR_GATE_SHAPE_FIX_BRIEF_2026-08-22.md`
**План-файл:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт **D17**.
**Это отчёт исполнителя, НЕ приёмка.** Галочку ставит ведущий.

## Короткий итог

**Правка не написана — сработал предохранитель пункта 2 брифа:** «Если неподнимающего способа нет —
СТОП и вопрос ведущему с названной причиной, а не обход гейта».

Неподнимающего способа назвать интеграторскую личность у владельца шва
`app_seam_identity_lookup_owner` сегодня **нет**, и это не предположение, а четыре замера на живой
`bcb_webapp_dev` (§2). Оба маршрута, которые могли бы его дать, механически закрыты:

| маршрут | чем закрыт | замер |
|---|---|---|
| прочитать `app_ext.accepted_port_contexts` **напрямую** (пример из брифа) | FORCE RLS: политика таблицы пускает только `app_seam_context_owner`. **Даже с выданным SELECT** шов опознания читает `NULL` | §2.2 |
| дать единственному аксессору **флаг «не поднимать»** (§5, «варианты — параметры одной точки») | добавление параметра с DEFAULT делает КАЖДЫЙ существующий нуль-арный вызов неоднозначным; значит нужен `DROP`, а его держат **4 живых RLS-политики** | §2.3, §2.4 |

Остаётся ровно один способ — **новая внутренняя функция в шве `app_seam_context_owner`**. Её бриф
запрещает прямой строкой («Второго аксессора личности НЕ заводить»), поэтому решение — за ведущим.
Готовое предложение с уже найденным прецедентом в репозитории — §4. Смысл правки при этом не
меняется ни на слово: две двери, роль одна, третьей двери нет.

**Гейт не ослаблен, `generate.mjs` не тронут, `--execute` не запускался.**

---

## 1. Отказ воспроизведён точно тем предикатом, которым его ставит генератор

Проверяющий блок — `deploy/postgres/privileges/generate.mjs:1530`. Он требует, чтобы у plpgsql-корня
**сразу за первым `BEGIN`** стоял `PERFORM app.require_accepted_context(` — без комментария, без
пролога, без чего бы то ни было ещё.

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -c "
SELECT p.oid::regprocedure AS fn,
       (substring(p.prosrc FROM position('BEGIN' IN upper(p.prosrc)))
          !~* '^BEGIN[[:space:]]+PERFORM[[:space:]]+app[.](require_accepted_context|require_attested_context_for_roles)[[:space:]]*[(]') AS is_bad,
       substr(substring(p.prosrc FROM position('BEGIN' IN upper(p.prosrc))), 1, 60) AS after_begin
  FROM pg_proc p
 WHERE p.oid = pg_catalog.to_regprocedure('app.integrator_read_channel_binding_identity(text,text,text)');"
```

| корень | `is_bad` | что стоит за `BEGIN` |
|---|---|---|
| `app.integrator_read_channel_binding_identity(text,text,text)` | **`t`** | `-- Проба двери: непустая интеграторская личность быв…` |
| `app.record_reminder_occurrence_finalized_projection(...)` (сосед, форма которого целевая) | `f` | `PERFORM app.require_accepted_context(` |

То есть замер ведущего подтверждён на моей стороне тем же предикатом, и подтверждено же, что форма
соседа гейт проходит. Ломает тело ровно одно — блок пробы с обработчиком `insufficient_privilege`,
вынесенный ПЕРЕД приёмкой контекста.

**Смысл правки при этом верен и под сомнение не ставится.** Речь только о форме тела.

Побочный факт, который пригодится при приземлении: строки возможности для ВТОРОЙ двери на DEV ещё
нет — reconcile до неё не доходит, потому что падает на этом же гейте.

```
$ … -c "SELECT capability_id, target_role, context_class FROM app_ext.port_context_capabilities
         WHERE purpose='integrator.channel-binding-identity.read';"
 d8d41661-b77c-51d9-a469-bd70e7d3fcd0 | app_integrator_request | tenant_service   ← только одна, класса integrator нет
```

---

## 2. Почему неподнимающей пробы нет — четыре замера, а не рассуждение

### 2.1 Всё, что владелец шва вообще может позвать, — поднимает

У `app_seam_identity_lookup_owner` 28 функций с EXECUTE в схемах `app`/`app_ext`. Контекст из них
называют ровно четыре, и все четыре по построению поднимают `42501`, когда называть нечего:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev <<'SQL'
BEGIN READ ONLY;
DO $$ DECLARE fn text; res text; BEGIN
  FOREACH fn IN ARRAY ARRAY['app.current_integrator_user_id()','app.current_org_id()',
                            'app.current_patient_user_id()','app.current_actor_user_id()'] LOOP
    BEGIN EXECUTE 'SELECT ' || fn INTO res;
      RAISE NOTICE '% -> вернула % (НЕ поднимает)', fn, coalesce(res,'NULL');
    EXCEPTION WHEN OTHERS THEN RAISE NOTICE '% -> ПОДНИМАЕТ SQLSTATE %', fn, SQLSTATE; END;
  END LOOP; END $$;
ROLLBACK;
SQL
```

```
NOTICE:  app.current_integrator_user_id() -> ПОДНИМАЕТ SQLSTATE 42501 (accepted integrator context required)
NOTICE:  app.current_org_id()             -> ПОДНИМАЕТ SQLSTATE 42501 (accepted organization context required)
NOTICE:  app.current_patient_user_id()    -> ПОДНИМАЕТ SQLSTATE 42501 (accepted patient context required)
NOTICE:  app.current_actor_user_id()      -> ПОДНИМАЕТ SQLSTATE 42501 (accepted actor context required)
```

Ни у одной нет параметра «не поднимать»; внутри выражения `CASE` обработчика нет — поэтому любая из
них в аргументе гейта убивает `tenant_service`-дверь.

**Различитель соседа здесь не работает.** Сосед ветвится по `pg_catalog.current_setting('role', true)`
— это и есть «источник напрямую с флагом «не поднимать»» в его случае. У нас **роль у обеих дверей
одна и та же**, `app_integrator_request` (`declaration.ts:2623` и `:2643`), а различается КЛАСС,
которого GUC `role` не называет. GUC с классом или с интеграторской личностью порт не ставит вовсе:
единственное, что уезжает в сессию, — `SET LOCAL ROLE` внутри `app.begin_port_context`
(`packages/db-principal/src/portContext.ts:420-421`); прежние `set_config('app.integrator_user_id', …)`
живут только в легаси-пути вебаппа и в port-context-режиме не исполняются.

### 2.2 Прочитать источник напрямую — даёт НЕ тот же ответ, а всегда `NULL`

Это ровно тот способ, который бриф назвал примером, поэтому он замерен, а не отброшен рассуждением.
`app_ext.accepted_port_contexts` — `privateRelations` шва контекста (`declaration.ts:2469`), с
`relrowsecurity = t`, `relforcerowsecurity = t` и единственной политикой:

```
bcb_private_owner_app_ext_accepted_port_contexts | {app_seam_context_owner} | ALL | (CURRENT_USER = 'app_seam_context_owner'::name)
```

FORCE RLS означает, что политика действует и на владельца таблицы. Замер с **временно выданным**
SELECT (вся транзакция откачена):

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
INSERT INTO app_ext.accepted_port_contexts
  (database_oid, backend_pid, transaction_id, capability_id, session_login, port, target_role,
   context_class, purpose, function_identity, typed_args_hash, organization_id, integrator_user_id)
VALUES ((SELECT oid FROM pg_database WHERE datname = current_database()),
        pg_backend_pid(), pg_current_xact_id(), 'd8d41661-b77c-51d9-a469-bd70e7d3fcd0',
        'bcb_dev_integrator', 'integrator', 'app_integrator_request', 'integrator',
        'integrator.channel-binding-identity.read',
        pg_catalog.to_regprocedure('app.integrator_read_channel_binding_identity(text,text,text)'),
        decode(repeat('00',32),'hex'), gen_random_uuid(), 4242);
GRANT SELECT ON app_ext.accepted_port_contexts TO app_seam_identity_lookup_owner;
SELECT 'postgres (superuser, RLS bypass)' AS who, (SELECT integrator_user_id FROM app_ext.accepted_port_contexts
  WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id()) AS direct_read;
SET LOCAL ROLE app_seam_context_owner;
SELECT 'app_seam_context_owner (шов контекста)' AS who, (SELECT integrator_user_id FROM app_ext.accepted_port_contexts
  WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id()) AS direct_read;
SET LOCAL ROLE app_seam_identity_lookup_owner;
SELECT 'app_seam_identity_lookup_owner + ВЫДАННЫЙ SELECT' AS who, (SELECT integrator_user_id FROM app_ext.accepted_port_contexts
  WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id()) AS direct_read;
ROLLBACK;
SQL
```

| кто читает | `direct_read` |
|---|---|
| `postgres` (суперюзер, RLS обходится) | `4242` |
| `app_seam_context_owner` (шов контекста) | `4242` |
| **`app_seam_identity_lookup_owner`, SELECT ВЫДАН** | **`NULL`** |

Вывод прямой: прямое чтение источника **не даёт тот же ответ**. Оно даёт `NULL` ВСЕГДА — и под
интеграторской дверью тоже. Тело с такой пробой всегда выбирало бы ветку `tenant_service`, и
интеграторская дверь осталась бы закрытой ровно тем же `42501`, ради снятия которого писалась вся
правка, — только теперь молча и «зелёно». Это худший из возможных исходов, поэтому маршрут закрыт.

(Замечание о §5, которое ведущему пригодится: возражение автора миграции — «выдать право значило бы
завести ВТОРОГО читателя принятого контекста» — по существу верное, но оно даже не главное. Главное
жёстче: право тут просто не работает, стена держится не грантом, а FORCE RLS.)

### 2.3 Флаг «не поднимать» у единственного аксессора — ломает все существующие вызовы

§5 требует не заводить дубль, а параметризовать существующую точку. Замер, что будет:

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev <<'SQL'
BEGIN;
CREATE OR REPLACE FUNCTION app.current_integrator_user_id(p_missing_ok boolean DEFAULT false)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog, app, app_ext, pg_temp AS $$ BEGIN RETURN 777; END $$;
SELECT app.current_integrator_user_id(true) AS with_flag;
SELECT app.current_integrator_user_id() AS zero_arg_call;
ROLLBACK;
SQL
```

```
 with_flag
       777
ERROR:  function app.current_integrator_user_id() is not unique
HINT:  Could not choose a best candidate function.
```

PostgreSQL не заменяет функцию, а заводит перегрузку, после чего **каждый** существующий нуль-арный
вызов падает. Значит параметризация требует `DROP` старой сигнатуры.

### 2.4 `DROP` держат четыре живые RLS-политики

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev <<'SQL'
BEGIN; DROP FUNCTION app.current_integrator_user_id(); ROLLBACK;
SQL
```

```
ERROR:  cannot drop function app.current_integrator_user_id() because other objects depend on it
DETAIL:  policy rev10_saas_org_dormant_p0_8_5 on table integrator.user_reminder_delivery_logs
         policy rev10_saas_org_dormant_p0_8_5 on table integrator.user_reminder_occurrences
         policy rev10_saas_bootstrap_hybrid_p0_8_6 on table platform_user_contacts
         policy rev10_delivery_replay_staff_170 on table reminder_delivery_events
```

Плюс на аксессор ссылаются тела ещё семи definer-корней. Это не «правится тело функции», это правка
шва контекста с каскадом по политикам — отдельная работа и отдельное решение.

**Отдельно: сделать сам аксессор неподнимающим (вернуть `NULL` вместо `RAISE`) — категорически
нельзя.** Эти же политики содержат ветку «принципала нет» вида
`app.current_org_id() IS NULL AND app.current_patient_user_id() IS NULL AND
app.current_integrator_user_id() IS NULL AND NOT app.is_staff()`. Сегодня без контекста аксессор
поднимает и вся политика отказывает; начни он возвращать `NULL` — эта ветка станет ИСТИНОЙ и
откроет строки без принципала. Подъём здесь несущий.

---

## 3. Что из брифа закрыто и что нет

| пункт брифа | статус |
|---|---|
| 1. Тело в форме соседа (`PERFORM` первым, `CASE` внутри аргумента класса) | **не сделано** — упирается в пункт 2 |
| 2. Неподнимающая проба | **СТОП, причина названа и замерена** (§2) |
| 3. Проба выбирает ветку, но не решает | не начато (следует из 1–2) |
| 4. Гейт не ослаблен, `generate.mjs` не тронут | **соблюдено** — файл не изменён |
| 5. Смысл правки сохранён дословно | **соблюдено** — миграция не изменена |
| 6. Доказательства (`--preflight`, живой DO-блок, инъекции, тесты) | не применимо: доказывать нечего, кода нет. Отказ гейта воспроизведён его собственным предикатом (§1) |
| 7. `--execute` не запускать | **соблюдено** — не запускался |

Отдельно про `--preflight`: из этого worktree он в принципе не стартует — `deploy/host/migrate-dev.sh:157`
требует `$REPO_ROOT/.env`, а env-файлы живут только в основном чекауте `/home/dev/dev-projects/BersonCareBot`.
Заводить копию секретов во втором дереве ради зелёного EXIT я не стал. На результат это не влияет:
падает не preflight, а reconcile, и его причина воспроизведена напрямую (§1).

---

## 4. Предложение ведущему — один вопрос, одно решение

Единственный оставшийся способ дать телу неподнимающую пробу — **функция в шве
`app_seam_context_owner`**, потому что читать принятый контекст физически может только он (§2.2).
Бриф это запрещает строкой «Второго аксессора личности НЕ заводить», поэтому спрашиваю, а не делаю.

**В репозитории уже есть прецедент ровно этой формы** — не выдумка, а живущий объект:

```
app.require_attested_target_role(name, name[])   -- declaration.ts:3584
  owner: 'app_seam_context_owner'                -- принятый контекст читает по-прежнему ОДИН шов
  execute: ['app_seam_reminder_patient_owner']   -- позвать может только спрашивающий шов, поимённо
  invocation: 'internal'                         -- генератор такие тела не гейтит
  purpose: 'return the exact active patient or staff role to the reminder seam'
```

Он существует ровно для того же класса задачи: «шву нужно знать, какую именно дверь открыл порт».
Единственный его вызывающий — `app.enqueue_current_reminder_rule_push(text)`, где результат
используется для ветвления после приёмки контекста.

**Предлагаю (нужно ваше слово):** такая же внутренняя функция, отвечающая на тот же факт неподнимающе:

```sql
app.integrator_context_installed() RETURNS boolean
  owner: 'app_seam_context_owner'
  execute: ['app_seam_identity_lookup_owner']
  invocation: 'internal'
  -- true ⇔ принятый контекст ЭТОЙ транзакции несёт интеграторскую личность; иначе false, без подъёма
```

тело корня тогда становится дословной формой соседа:

```sql
BEGIN
  PERFORM app.require_accepted_context(
    'app_seam_identity_lookup_owner'::name,
    'app_integrator_request'::name,
    CASE WHEN app.integrator_context_installed()
           THEN 'integrator'::app.port_context_class
           ELSE 'tenant_service'::app.port_context_class END,
    'integrator.channel-binding-identity.read',
    app.hash_port_typed_args(ARRAY[…]),
    'app.integrator_read_channel_binding_identity(text,text,text)'::regprocedure
  );
```

Что это даёт против пунктов брифа:

- **пункт 1** — первый оператор `PERFORM app.require_accepted_context(`, выбор класса выражением
  `CASE` внутри аргумента. Гейт `generate.mjs:1530` проходит, `generate.mjs` не тронут;
- **пункт 2** — проба неподнимающая по построению;
- **пункт 3** — проба по-прежнему только ВЫБИРАЕТ ветку. Принимает `require_accepted_context`,
  сверяя класс со строкой принятого контекста независимо; ошибись проба в любую сторону — `42501`.
  Функция НЕ возвращает `integrator_user_id`, поэтому вторым аксессором личности не является:
  личность как значение остаётся у единственной точки `app.current_integrator_user_id()`;
- **пункт 5** — две двери, роль одна `app_integrator_request`, третьей двери нет, предикат стены
  арендатора не тронут;
- **§5** — принятый контекст читает по-прежнему ОДИН владелец; EXECUTE выдан поимённо одному шву.
  Прямую параметризацию существующей точки §5 предпочёл бы, но она замерена как невозможная (§2.3–2.4),
  и этот замер — часть ответа, а не его обход.

**Развилка, которую придётся закрыть заодно:** `app.require_attested_target_role` и предлагаемая
функция — два варианта одного действия («назови дверь, которую открыл порт»): один по роли, другой
по классу. §5 говорит «варианты одного действия — параметры одной точки». Варианта два:

- **(а)** завести отдельную функцию по классу (быстро, но два соседа с одной работой);
- **(б)** обобщить существующую точку до одной, называющей дверь по запрошенному признаку
  (чище по §5, но трогает шов контракта и единственного нынешнего вызывающего).

Рекомендую **(а) сейчас + (б) отдельной строкой плана**, если ведущий не решит иначе: (б) внутри
этой правки — вторая работа под видом первой, а живой отказ у людей висит уже сегодня.

---

## 5. НЕ СДЕЛАНО

- Тело корня не приведено к форме соседа — блокер §2, решение за ведущим.
- `--preflight` из этого worktree не запускался (нет env-файлов, §3); `--execute` не запускался по
  запрету брифа.
- Инъекции (вырез предиката стены; подмена ветки пробы) не гонялись — нечего инъецировать, пока
  правки нет.
- `pnpm test:db-privileges`, тесты интегратора, typecheck, оба `--check` не гонялись по той же причине.
- Миграция `20260822T190000_…sql`, `declaration.ts` и `generate.mjs` НЕ изменены — дерево по коду
  ровно то, что было на `0eb649ab3`.
