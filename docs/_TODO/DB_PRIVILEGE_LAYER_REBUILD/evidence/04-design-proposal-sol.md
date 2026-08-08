## ИТОГ

Нужна одна несущая конструкция: **закрытый capability-API PostgreSQL**.

Runtime-роли полностью лишаются эффективных прав на таблицы, колонки, sequences и views. Они могут только вызывать точный список функций/процедур `app.*` с фиксированными сигнатурами. Приложения больше не получают `Pool`, Drizzle или `query(sql)` — только сгенерированный клиент своего контура.

```text
service / domain port
        ↓
typed client конкретного контура — без query(sql)
        ↓
app.some_capability(...) — роль имеет только EXECUTE
        ↓
tables / RLS / sequences / triggers
```

Это минимально по архитектуре, хотя миграция будет большой. Меньшее решение оставляет произвольный SQL и потому не может доказать ни полноту поверхности, ни silent subset/excess.

## ОДИН load-bearing mechanism

Инвариант:

> Любая runtime-учётка имеет ноль прямых прав на data objects и может исполнить только закрытый, исполняемо проверенный database API.

Предлагаемые владельцы конструкции:

- `deploy/postgres/runtime-db-contract.sql` — единственный активный current-state артефакт ролей, membership, owners, ACL, политик и экспортированных `app.*` routines.
- `packages/db-runtime/` — единственное место с зависимостью от `pg`; создаёт физические пулы и экспортирует только contour-specific capability clients.
- [verify-a1-rls-conformance.mjs](/home/dev/dev-projects/BersonCareBot/scripts/verify-a1-rls-conformance.mjs) эволюционирует в `scripts/verify-runtime-db-contract.mjs` — исполняемое доказательство.

В финальном состоянии:

- `app_staff`, `app_patient`, `app_identity_bootstrap`, `app_operational_scheduler`, `app_operational_delivery_worker`, `app_operational_diagnostic`, `app_operational_media_worker`, `app_config_reader`, `app_platform_settings`, `app_clinic_billing` и соответствующие LOGIN-роли не имеют table/column/sequence/view ACL ни непосредственно, ни через membership.
- Они не владеют объектами, не имеют `BYPASSRLS`, grant options или пути `SET ROLE` к owner/migrator.
- Их `EXECUTE` ACL в точности равен списку capability API.
- `PUBLIC` не имеет `EXECUTE` на `app.*`.
- Tenant/self routines получают authority только из подписанного principal context; переданный вызывающим `organization_id` не считается authority.
- Выходы фиксированы: `RETURNS TABLE` с именованными полями или scalar. Запрещены экспортируемые `SETOF public.some_table`, открытый `record` и сериализация целой строки в JSON.
- Lookup возвращает явный `found/status`, write — явный domain outcome/affected count. Ноль строк не считается неявным успехом.

`SECURITY DEFINER` исполняется с правами owner, поэтому contract фиксирует owner, `prosecdef`, `search_path` и тело каждой экспортированной routine. PostgreSQL также по умолчанию даёт новым функциям `EXECUTE` для `PUBLIC`, поэтому создание, revoke и selective grant выполняются в одной транзакции, как рекомендует [документация PostgreSQL 16](https://www.postgresql.org/docs/16/sql-createfunction.html).

Почему обход невозможен обычным кодом:

- новый `SELECT public.foo` под runtime credential физически не имеет права исполниться;
- новая таблица или колонка по умолчанию никому не открывается;
- приложение не имеет API для произвольного SQL;
- сырой `new Pool` с тем же credential всё равно не даёт доступа к data objects;
- для расширения доступа требуется изменить `runtime-db-contract.sql` либо вернуть приложению DB driver/admin credential. Оба — очевидные security-boundary diff.

## Где именно авторизация доказывается

Не в static analysis, не в `EXPLAIN` и не на живом TEST.

Доказательство выполняется в disposable PG16:

1. Существующий A0/A1-код поднимает rootless cluster в `/tmp`; `sudo` не нужен.
2. Восстанавливается [a0-greenfield baseline](/home/dev/dev-projects/BersonCareBot/scripts/a0-greenfield-baseline-lib.mjs), применяются текущие migrations и `runtime-db-contract.sql`.
3. Создаются настоящие LOGIN-роли, membership и connection startup options каждого контура.
4. Вызовы идут через тот же `packages/db-runtime`, что production: реальный checkout, principal install, `SET ROLE`, transaction и cleanup.
5. Каждая пара `(контур, granted capability)` реально исполняется с настоящими параметрами и fixture rows.
6. Catalog census требует двустороннего равенства:

```text
actual EXECUTE pairs = declared capability pairs = pairs exercised by proof suite
effective base-object privileges(runtime roles) = ∅
```

Здесь реально выполняются INSERT/UPDATE, defaults/sequences, trigger bodies, RLS `WITH CHECK`, SECURITY DEFINER bodies и `CALL`. Поэтому все семь способов, которыми лжёт `EXPLAIN`, находятся исполнителем PostgreSQL, а не планировщиком.

После этого deploy:

- применяет contract последним, до запуска нового release;
- выполняет расширенный bidirectional `EXCEPT` из [c5a-platform-operations-runtime.sql](/home/dev/dev-projects/BersonCareBot/deploy/postgres/c5a-platform-operations-runtime.sql);
- подключается через каждый реальный DSN и сверяет `session_user`, `current_user`, `search_path`, contract hash и доступный capability set.

Target gate не является вторым способом доказать семантику. Он только подтверждает: целевая БД имеет ровно то состояние, которое уже было исполнено в disposable PostgreSQL.

## Silent zero, subset и excess

Проверяется не эвристика «вернулось ли что-нибудь», а **точное равенство независимому oracle**.

Каждая tenant-sensitive fixture содержит минимум:

- две разрешённые строки A;
- строку того же tenant, но другого владельца/пациента;
- строку tenant B;
- NULL/global/orphan shape, если таблица допускает её.

Для list capability ожидается, например, ровно `[A1, A2]`:

- `[]` — red;
- `[A1]` — red;
- `[A1, A2, B1]` — red;
- лишнее поле `secret` — red.

Для aggregate проверяется точное значение. Для write отдельное owner-соединение сверяет точный before/after delta и неизменность foreign rows. Expected result задаётся owner contract/бизнес-правилом, а не вычисляется тем же SQL, который тестируется.

Постоянные calibration cases обязаны включать:

- `platform_users` под integrator principal: exact own/foreign set;
- Telegram/MAX staff recognition;
- обе Google Calendar organizations;
- clinic delivery credential против platform sender;
- operator alert creation и dispatch state;
- bootstrap phone login через `user_channel_preferences`;
- scheduler tick с реальным `operator_job_status`;
- write с sequence и trigger;
- owner-view excess и restrictive+permissive RLS.

Политики PostgreSQL действительно комбинируются как permissive `OR` и restrictive `AND`, а owner/BYPASSRLS может их обходить; поэтому их форма не анализируется, а итог исполняется. Это соответствует [официальной семантике RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html). Views runtime-ролям вообще не выдаются: обычный view применяет права/RLS owner, если не настроен иначе, что подтверждает [CREATE VIEW](https://www.postgresql.org/docs/16/sql-createview.html).

## Fail-open остаётся fail-open

Глобального «denial всегда throw» нет.

`packages/db-runtime` возвращает единый discriminated outcome:

- `ok`;
- `unavailable`;
- `authorization_fault`;
- `database_fault`.

На `42501`, `42P01`, missing routine и аналогичный contract fault слой до возврата:

- пишет безопасное структурированное событие `db_contract_fault` в stderr/journald;
- ставит process-local health latch;
- не вызывает никакую DB-функцию инцидентов.

Поэтому нет рекурсии «denial → incident DB write → denial».

Поведение вызывающих остаётся предметным:

- `healthCheckDb()` и `checkDbHealth()` возвращают `false`;
- inbound Telegram/MAX всё равно отвечает HTTP 200;
- operator probe продолжает работу в degraded state;
- media queue не получает навязанный throw внутри claim-транзакции;
- `23505` превращается capability-функцией в `already_exists/conflict`, а не считается infrastructure fault;
- `pgEmailSetupFlowPort` больше не может превратить privilege fault в `user_not_found`, не оставив глобального contract-fault signal.

## Миграция по порядку

1. **Зафиксировать новый инвариант.** v3 пометить superseded. Новый direct grant или overlay допускается только через будущий current-state contract. Trusted host job выгружает catalog baseline; Codex-доступ к TEST не нужен. На этом шаге доказано только текущее состояние, не корректность.

2. **Калибровать proof engine.** Расширить A1 и сначала воспроизвести десять дефектов и семь EXPLAIN-lies. Обязательные fault injections: снять sequence privilege, сломать trigger owner/ACL, поменять definer owner, сделать partial/excess policy, добавить колонку к leaky return, добавить restrictive false. Каждая поломка обязана сделать gate красным.

3. **Построить закрытый API без revoke.** Переиспользовать существующие `app.*` routines; для оставшихся direct queries добавить узкие capabilities. Сгенерировать contour clients. Сервисы и domain ports сохраняются — меняются только infra implementations. Generic `DbPort.query`, `runWebappSql`, `getDrizzle`, `getPool`, `runIntegratorSql`, `runMediaWorkerSql` постепенно исчезают из runtime surface.

4. **Cutover по одному контуру, атомарно.** Сначала operational scheduler/diagnostic/delivery/media, затем bootstrap/config/telemetry/purge, integrator request, webapp nonstaff, webapp staff/platform/billing. Контур считается закрытым только когда одновременно:

   - все его operations имеют semantic cases;
   - infra использует только generated client;
   - contract revokes его direct ACL;
   - target gate подтверждает exact EXECUTE set;
   - documented fail-open behavior проверен.

   До этого конкретный контур остаётся явно `legacy`, без заявления о системной защите.

5. **Свести все pool creation sites.** Физические пулы не объединяются: разные credentials, timeouts и workloads нужны. Объединяется их конструктор и возвращаемый интерфейс.

   [integratorPoolProvider.ts](/home/dev/dev-projects/BersonCareBot/apps/integrator/src/infra/db/integratorPoolProvider.ts) регистрирует четыре контура: request, diagnostic, delivery-worker, scheduler. [webappPoolProvider.ts](/home/dev/dev-projects/BersonCareBot/apps/webapp/src/infra/db/webappPoolProvider.ts) — staff/nonstaff. Media, telemetry, purge и projection-health получают свои contour IDs, но тот же factory.

   `integratorMigrationPoolProvider` остаётся единственным произвольным SQL transport в отдельном admin/deploy entry point и не импортируется runtime-кодом. Boot probe заменяется API contract-version handshake. У `getConfigReaderPool()` сейчас нет source-callers; после boot/runtime подтверждения его следует удалить, а не мигрировать вслепую. Все 51 raw-pool файла классифицируются по достижимости: service/cron/runtime → capability client; действительно one-shot ops → admin plane.

6. **Заменить overlays одним current-state contract.** После последнего contour cutover удаляются generic runtime transports и старые разрозненные gates. Полный успех объявляется только при нуле effective base privileges у всех runtime ролей.

## Судьба существующего SQL

| Сегодня | Конечное состояние |
|---|---|
| 61 overlays | Authorization/function/policy effects поглощаются `runtime-db-contract.sql`; schema/data-only части при необходимости получают обычную forward migration. Overlay удаляется из [runtime-overlay-rehydrate-lib.sh](/home/dev/dev-projects/BersonCareBot/deploy/host/runtime-overlay-rehydrate-lib.sh) только после exact catalog equality. В конце активных overlays — 0. |
| 28 overlay drift assertions | Их рабочая bidirectional логика переносится в один contract finalizer. Отдельные копии удаляются. |
| 164 privilege-bearing migrations | Никогда не редактируются и не переигрываются. Это immutable history. На upgrade их старые эффекты нормализует finalizer; greenfield A0 уже без ACL, после schema migrations применяется contract. |
| Новые migrations | Структура и data transition. Даже если кто-то добавит GRANT, finalizer либо отзовёт его, либо exact assertion уронит deploy. Regex-ban не является защитой. |
| 9 provider-файлов / больше физических pools | Все runtime creation branches используют один factory и typed clients. Число физических соединений остаётся workload-driven, а не file-driven. Migrator остаётся отдельным admin plane. |

## Что намеренно не делать

- Не использовать `EXPLAIN`, PREPARE или recorded `db-surface`.
- Не пытаться получить покрытие из текущих unit/smoke/route tests.
- Не строить AST-анализ swallowed denials.
- Не вычислять policy satisfiability из descriptor model.
- Не делать blanket throw и DB-backed incident recursion.
- Не строить полный tier/role/table registry и не генерировать 291 bespoke policy из модели, которая их не понимает.
- Не требовать RLS на каждой таблице: runtime role всё равно не имеет table privilege.
- Не переписывать историю migrations.
- Не мигрировать на NestJS и не переписывать SQL в Drizzle ради формы.
- Не запрещать любой privilege SQL regex-гейтом. Security diff разрешён ровно в одном current-state entry point и проверяется итоговым состоянием PostgreSQL.
- Не зависеть от agent-side TEST access. CI использует rootless disposable PG; target attestation запускает trusted deploy job.

## Остаточный риск

После полной реализации обычный application diff не сможет создать новую DB authorization surface. Останутся риски другого класса:

- неправильный business oracle или непротестированная ветка внутри разрешённой capability;
- ошибка в SECURITY DEFINER body, особенно у широко привилегированного `app_owner`;
- неверно установленный, но формально валидный signed principal;
- осознанный одновременный небезопасный diff contract + oracle, принятый review;
- superuser/deploy compromise или изменение DB после успешного deploy;
- редкая production data-shape, которой нет в deterministic fixtures;
- DB/network/provider outage: он будет видим, но fail-open путь всё ещё может потерять конкретное сообщение.

То есть система делает **необъявленный или непротестированный доступ структурно невозможным для обычного кода**, но не превращает произвольную SQL-бизнес-логику в математически доказанную программу. Это честная граница того, что можно гарантировать без формальной спецификации всей предметной модели.