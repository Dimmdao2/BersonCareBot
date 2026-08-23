# Для соседней ветки: почему на DEV падает `pre-session exact gate`

**Симптом.** Общий сверочный прогон прав на `bcb_webapp_dev` падает:

```
pre-session exact gate missing or mismatched: app.email_auth_find_email_challenge_for_confirm(uuid,uuid)
```

**Это не миграция и не код ветки `wt/therapysto-night-20260823`.** Я на неё наткнулся, потому что мои
миграции идут тем же прогоном; сама причина к брендингу отношения не имеет.

## Причина: у функции ДВА определения, и побеждает то, что накатывается последним

| Где | Что создаёт | Проходит гейт? |
| --- | --- | --- |
| `apps/webapp/db/drizzle-migrations/20260822T100000_pre_session_email_and_signup_roots_accept_their_named_context.sql:66` | `LANGUAGE plpgsql`, тело начинается с `PERFORM app.require_accepted_context('app_seam_email_otp_owner','app_pre_session','pre_session','auth')` | **да** |
| `deploy/postgres/organization-member-invites-rls.sql:957` | `CREATE FUNCTION … LANGUAGE sql`, **без** `require_accepted_context` и без `app.hash_port_typed_args` | **нет** |

Гейт (`deploy/postgres/privileges/generate.mjs:392-406`, `preSessionGateVerifierLines`) требует от каждого
`app_pre_session`-корня одновременно: `prosecdef`, тело, начинающееся ровно с
`BEGIN PERFORM app.require_accepted_context …`, наличие `app.hash_port_typed_args`, а также упоминание
собственной сигнатуры и назначения. `LANGUAGE sql`-версия не удовлетворяет ни одному из первых трёх условий.

## Замер на живом DEV (23.08.2026, ~20:10 MSK)

```
sudo -n -u postgres psql -d bcb_webapp_dev -Atc "SELECT l.lanname,
  position('require_accepted_context' in p.prosrc)>0,
  position('hash_port_typed_args' in p.prosrc)>0
 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
 WHERE p.oid='app.email_auth_find_email_challenge_for_confirm(uuid,uuid)'::regprocedure;"
→ sql|f|f
```

То есть **в базе стоит overlay-версия**, а не версия миграции. При этом миграция в журнале числится
применённой:

```
sudo -n -u postgres psql -d bcb_webapp_dev -Atc "SELECT tag FROM drizzle.__drizzle_migrations
 WHERE tag LIKE '20260822T100000%';"
→ 20260822T100000_pre_session_email_and_signup_roots_accept_their_named_context
```

**Вывод: миграция применилась, а потом её перекрыл runtime-overlay.** Overlay накатывается
`deploy/host/runtime-overlay-rehydrate-lib.sh:88` и `deploy/host/deploy-test-saas.sh:84`. `CREATE FUNCTION`
там идёт после `DROP FUNCTION IF EXISTS` (строки 41 и 955 того же файла), так что перекрытие безусловное.

## Почему у соседа может не падать

Порядок накатывания. Если у него overlay отработал ДО миграции — в базе останется plpgsql-версия с гейтом,
и прогон зелёный. Красный получает тот, у кого overlay отработал последним. Проверяется одной командой —
первой из блока замера выше: `sql` в первом столбце означает «перекрыто».

## Что, по-моему, надо чинить (решение не моё — ветка не моя)

Овердей и миграция разошлись семантически. Либо `organization-member-invites-rls.sql:957` приводится к
plpgsql-версии с `require_accepted_context`, либо это определение из overlay убирается совсем, раз миграция
уже создаёт функцию. Оставлять два расходящихся определения одного корня нельзя: результат зависит от
порядка запуска, то есть от случайности.

Рядом в том же файле лежит комментарий «Keep this runtime overlay semantically aligned with migration 0247» —
ровно про этот класс расхождения; здесь он и случился.
