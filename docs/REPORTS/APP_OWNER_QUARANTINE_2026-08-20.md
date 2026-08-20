# Карантин `app_owner` — 20.08.2026

## Решение

`app_owner` — выведенная legacy-роль, не живая роль-владелец. Исполняемая revision-10 декларация использует
узкие `app_seam_*_owner`, а `app_owner` остаётся только в `zeroState.legacyRoles`. Старый pre-revision-10 census
больше не объявляет её живой ролью.

Решение основано на каталогах обеих именованных баз:

- на `bcb_webapp_dev` и `bersoncarebot_test` роль владеет `0` функций, `0` relations, `0` schemas и `0` types;
- на DEV SECURITY DEFINER-шов распределён между узкими владельцами; крупнейшие измеренные группы:
  `app_seam_patient_self_actions_owner` — `54`, `app_seam_patient_booking_owner` — `34`,
  `app_seam_email_otp_owner` — `26`;
- `app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)` отсутствует
  в обеих базах (`to_regprocedure(...) IS NULL`);
- у `app_owner` нет membership edges и нет `USAGE` на `app`, `app_ext`, `integrator`, `public`.

Числа выше получены командами строк `1`–`3` таблицы, а не перенесены из предыдущего отчёта.

## Исполнение и доказательства

| шаг | команда | код возврата | что увидел | вывод |
|---|---|---:|---|---|
| 1. Атрибуты и DB ACL кластера до правки | `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d postgres -v ON_ERROR_STOP=1 -P pager=off -c "SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolinherit,(SELECT count(*) FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid) AS membership_edges FROM pg_catalog.pg_roles r WHERE rolname='app_owner'; SELECT datname,datconnlimit,datallowconn,has_database_privilege('app_owner',datname,'CONNECT') AS app_owner_connect FROM pg_catalog.pg_database WHERE datname IN ('bcb_webapp_dev','bersoncarebot_test') ORDER BY datname;"` | `0` | `NOLOGIN`, но `BYPASSRLS=true`, `INHERIT=true`, edges=`0`; DEV CONNECT=`false`; TEST `datconnlimit=0`, CONNECT=`true` | падение по атрибутам воспроизведено; TEST ACL ещё не закрыт оборванным reset |
| 2. Владение и шов DEV | `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN READ ONLY; SELECT 'functions_owned' AS fact,count(*)::bigint AS n FROM pg_catalog.pg_proc WHERE proowner='app_owner'::regrole UNION ALL SELECT 'relations_owned',count(*) FROM pg_catalog.pg_class WHERE relowner='app_owner'::regrole UNION ALL SELECT 'schemas_owned',count(*) FROM pg_catalog.pg_namespace WHERE nspowner='app_owner'::regrole UNION ALL SELECT 'types_owned',count(*) FROM pg_catalog.pg_type WHERE typowner='app_owner'::regrole ORDER BY fact; SELECT owner.rolname,count(*) AS definer_functions FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner WHERE p.prosecdef GROUP BY owner.rolname ORDER BY count(*) DESC,owner.rolname; SELECT to_regprocedure('app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)'); ROLLBACK;"` | `0` | все четыре ownership count=`0`; искомая функция `NULL`; крупнейшие seam-owner counts `54/34/26` | живой definer-шов уже не зависит от `app_owner` |
| 3. Владение TEST без изменения базы | `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1 -P pager=off -c "BEGIN READ ONLY; SELECT 'functions_owned' AS fact,count(*)::bigint AS n FROM pg_catalog.pg_proc WHERE proowner='app_owner'::regrole UNION ALL SELECT 'relations_owned',count(*) FROM pg_catalog.pg_class WHERE relowner='app_owner'::regrole UNION ALL SELECT 'schemas_owned',count(*) FROM pg_catalog.pg_namespace WHERE nspowner='app_owner'::regrole UNION ALL SELECT 'types_owned',count(*) FROM pg_catalog.pg_type WHERE typowner='app_owner'::regrole ORDER BY fact; SELECT owner.rolname,count(*) AS definer_functions FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner WHERE p.prosecdef GROUP BY owner.rolname ORDER BY count(*) DESC,owner.rolname; SELECT to_regprocedure('app.record_global_email_delivery_attempt(text,text,text,text,text,integer,text,jsonb,timestamptz)'); ROLLBACK;"` | `0` | все четыре ownership count=`0`; искомая функция `NULL` | TEST подтверждает вывод; `datconnlimit=0` не менялся |
| 4. Исходный env verifier DEV | `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --env dev --db bcb_webapp_dev --env-verify \| sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1` | generator `0`<br>psql `3` | `retained legacy role is not quarantined NOLOGIN: app_owner` | блокер воспроизведён до мутации |
| 5. Проверка узкого quarantine SQL | `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --legacy-role-quarantine app_owner > /tmp/app-owner-legacy-quarantine.sql`; затем `rg -n "^[[:space:]]*(CREATE ROLE\|GRANT[[:space:]])" /tmp/app-owner-legacy-quarantine.sql` с инверсией результата | generator `0`<br>forbidden-SQL check `0` | только `ALTER ROLE ... NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT` и `ALTER ROLE ... RESET ALL` | primitive не создаёт роли, не выдаёт права и не меняет membership/ACL |
| 6. Применение общей роли | `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --legacy-role-quarantine app_owner \| sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d postgres -1 -v ON_ERROR_STOP=1` | generator `0`<br>psql `0` | `BCB_LEGACY_ROLE_QUARANTINE_RECONCILED` | общий cluster role сужен для DEV и TEST одной штатной механикой |
| 7. Env verifier DEV после правки | `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --env dev --db bcb_webapp_dev --env-verify \| sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1` | generator `0`<br>psql `0` | `BCB_ENVIRONMENT_VERIFIED env=dev database=bcb_webapp_dev logins=4` | исходный блокер DEV закрыт |
| 8. Env verifier TEST после правки | `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --env test --db bersoncarebot_test --env-verify \| sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bersoncarebot_test -v ON_ERROR_STOP=1` | generator `0`<br>psql `3` | атрибутный assert пройден; следующий assert: `retained legacy role can CONNECT target: app_owner` | кодовая правка корректна; TEST reset остаётся оборван на DB ACL, который эта задача запрещает чинить |
| 9. Генераторные проверки | `node --test deploy/postgres/privileges/port-context-catalog.test.mjs`; `node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check`; `pnpm exec eslint deploy/postgres/privileges/declaration.ts deploy/postgres/privileges/generate.mjs deploy/postgres/privileges/generate-cli.mjs` | `0`<br>`0`<br>`0` | `16` tests passed; committed artifacts byte-identical; lint clean | затронутая генераторная поверхность зелёная |

Коды generator/psql в строках `4`, `6`, `7`, `8` печатались отдельными строками через снимок
`${PIPESTATUS[@]}` сразу после pipeline.

## Что изменено

- `generateSharedRoleBaselineSql` теперь включает attribute-only карантин всех объявленных surviving
  `zeroState.legacyRoles`; отсутствующие роли не создаются.
- `--legacy-role-quarantine <role>` применяет тот же primitive к одной объявленной legacy-роли. Именно им
  сужена живая общая `app_owner`, поэтому не было побочных `CREATE ROLE`/`GRANT` полного shared baseline.
- Генератор fail-closed отклоняет имя, одновременно объявленное managed и legacy, а узкий режим отклоняет роль,
  которой нет в `zeroState.legacyRoles`.
- Из старого, неисполняемого census удалено живое объявление `app_owner`; `REV10_ROLES` остаётся единственным
  экспортируемым role graph.

## Находки

1. `deploy/host/deploy-test-saas.sh:165-169` сохраняет протухшее объяснение, будто `app_owner` владеет definer-швом.
   Сам assert там проверяет только отсутствие membership и остаётся совместимым с карантином.
2. `deploy/host/deploy-test-saas.sh:887` требует отсутствующую
   `app.record_global_email_delivery_attempt(...)` и owner=`app_owner`; при выполнении cast к `regprocedure`
   остановит этот legacy deploy path.
3. `deploy/host/deploy-test-saas.sh:985-1004` требует `BYPASSRLS`, владение тремя таблицами и двумя функциями у
   `app_owner`; живые каталоги обеих баз показывают нулевое владение. Этот gate протух.
4. Стальные ссылки не исправлены: требуемые в брифе env-verifier команды их не вызывают, поэтому они не блокируют
   эту проверку шага 5. Их ремонт означает отдельное снятие/переписывание большого legacy deploy path, а не
   минимальное закрытие атрибутного блокера.
5. TEST после оборванного reset имеет `has_database_privilege('app_owner','bersoncarebot_test','CONNECT')=true`.
   Это реальный следующий blocker env-verifier, но DB ACL TEST не менялся по прямому запрету брифа; им занимается
   владелец reset-прохода.

## Что теперь НЕ получит живой человек

При подтверждённой модели человек не теряет ни одного рабочего пути: `app_owner` не владеет функциями или
отношениями, не имеет membership и не имеет schema `USAGE`; исполняемые двери принадлежат узким seam-owner ролям.

Если решение всё же неверно и существует не попавшая в каталоги внешняя зависимость от выполнения именно с
`BYPASSRLS app_owner`, такой вызов больше не обойдёт FORCE RLS. Наблюдаемое последствие — definer-функция вернёт
пустой результат или `permission denied`; человек не получит соответствующее действие (в худшем названном старым
gate сценарии — запись результата email-доставки). Каталоги обеих именованных баз исключают этот сценарий для
текущего DEV/TEST состояния.
