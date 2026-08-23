# Track D §C — независимый auditor-live гейт retention журналов (#987)

Кандидат: `0411d8a6c` в `wt/track-d-final-cutover-20260823` (HEAD ветки `3f7a7c72d`).
Оракул окон: `docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/16-journal-retention.md`, «Правила хранения».
Отчёт исполнителя: `TRACK_D_DUPLICATE_STORE_CUTOVER_2026-08-23.md`.

**Вердикт: FAIL.** Окна и предикаты доказаны верными на живой DEV; но `app.context_nonce_ledger` —
единственная таблица, ради которой работа затевалась (7.5 млн строк / 1.3 ГБ на TEST, рост ~630 тыс.
строк/сутки) — не чистится ни при каких условиях, а маршрут тика вообще не может открыть соединение с БД.

Отчёт исполнителя утверждает «§C выполнен целиком и проверен статически». Это ложная запись о готовности:
все перечисленные там гейты действительно зелёные, но ни один из них не проверяет ни один из четырёх
дефектов ниже. `pnpm --dir apps/webapp lint` в списке проверок отсутствует — и именно он красный.

## Результат по пунктам брифа

| # | Пункт | Итог | Доказательство |
|---|---|---|---|
| 1 | Цели и окна retention точны | **PASS** | живой rollback-only прогон кандидатного DDL на `bcb_webapp_dev` (ниже) |
| 2 | Один чокпоинт, без параллельного планировщика | **PASS** | `app.prune_retention_target` расширен 5 ветками; отдельный nonce-корень оправдан ACL и контрактом в секундах, зовётся из того же тика |
| 3 | Маршрут аутентифицирован, fail-closed, зарегистрирован | **FAIL** | F1 — источник не объявлен ни в одной relation-capability |
| 4 | Миграция forward-only/без прав; артефакты = декларация; принципалы могут ровно нужное | **FAIL** | миграция чиста и упорядочена, `--check` побайтно, `gaps=0`; но F2 и F3 — принципал не может исполнить свой корень |
| 5 | Автозапуск через существующую cron/deploy-конвенцию | **PASS** | шаблон повторяет `bersoncarebot-saas-billing-renewal`, ежечасно; реальный crontab не тронут |
| 6 | Ограниченность, идемпотентность, честный статус | **FAIL** | идемпотентность и честный статус доказаны; ограниченности у 5 новых целей нет — F4 |
| 7 | Без PROD/TEST, одна транзакция с гарантированным ROLLBACK | **PASS** | только `bcb_webapp_dev`, `ROLLBACK` подтверждён нулевыми остатками |

## Что доказано рабочим (живой DEV, одна транзакция, ROLLBACK)

Кандидатное DDL применено побайтно из файла миграции под её же statement-owner'ами, поверх смоделированного
пост-reconcile состояния (гранты и политики извлечены дословно из закоммиченного
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql`), затем синтетические строки и вызовы корня:

| Проверка | Результат |
|---|---|
| `outgoing_delivery_queue`: `sent` 31д удалён, 29д выжил; `dead` 181д удалён, 179д выжил | ✅ |
| живые статусы `pending` / `processing` / `failed_retryable` возрастом 400 суток — выжили все | ✅ |
| `pending` со СТАРЫМ `sent_at` (400д) — выжил: предикат требует терминального статуса | ✅ |
| `public.idempotency_keys` и `integrator.idempotency_keys`: истёкший 25ч удалён, 23ч и живой выжили | ✅ |
| второй прогон подряд удаляет 0 — идемпотентно | ✅ |
| `notification_delivery_attempts`: 181д удалён, 179д выжил (под FORCE RLS, по политике кандидата) | ✅ |
| `app_runtime_settings_audit` как цель — отказ `22023 unknown retention target` | ✅ |
| `support_delivery_events` как цель — тот же отказ (таблица ретирована соседней миграцией `20260823T200000`) | ✅ |
| `dryRun` — счёт возвращён, не удалено ничего | ✅ |
| после `ROLLBACK`: 0 остаточных строк, кандидатной функции нет | ✅ |

Ретированные журналы (`integrator.delivery_attempt_logs`, `message_retry_jobs`, `projection_outbox`)
на DEV отсутствуют — заменяющий журнал не заведён, снятие их retention-строк корректно.

## Находки

### F1 — маршрут тика не может открыть соединение с БД (пункт 3)

`api/internal/db-journal-retention/tick:POST` добавлен в `WEBAPP_LOCKED_INFRA_CRON_SOURCES`
(`packages/db-principal`), но НЕ добавлен в `WEBAPP_MAINTENANCE_SOURCES` в
`deploy/postgres/privileges/declaration.ts` — то есть ни одна relation-capability не несёт этот источник.
`webappPortCapabilityForInfraSource` (`apps/webapp/src/infra/db/portContextRuntime.ts:209-220`) на
неизвестном источнике бросает `Unknown webapp infra source in port-context mode`, и бросает ДО выбора
capability по имени корня — то есть падают все 6 целей, а не одна.

Замер: отрисован реальный рантайм-набор `WEBAPP_PORT_CONTEXT_CAPABILITIES_JSON` тем же генератором, что и
на деплое (`renderPortContextRuntimeEnv`, dev и test — 232 способности). Из 19 webapp-источников
locked-infra cron ровно 18 разрешаются в одну relation-capability; не разрешается только новый.

### F2 — у `app.prune_context_nonce_ledger` нет port-context capability (пункты 3, 4)

Функция объявлена только в `REV10_CONTEXT.functions` (владелец, execute, relationSurfaces) и НЕ объявлена в
`REV10_CONTEXT.capabilities`. Следствия:

1. `deploy/postgres/generated/port-context-capabilities.*.sql` не содержит строки для этого
   `function_identity` — `app.require_accepted_context` не найдёт принятого контекста и вернёт `42501`;
2. в рантайм-JSON нет дескриптора — `capabilityFor` бросает
   `Missing unique declared webapp port capability for app.prune_context_nonce_ledger(integer,integer,boolean)`;
3. генератор из-за отсутствия capability выбрал для функции gate-режим `attested`, поэтому шаг reconcile
   ПЕРЕПИШЕТ телу функции точный `require_accepted_context(...)` на
   `require_attested_context_for_roles('app_object_owner', ARRAY['app_operational_maintenance'])` — который
   join'ится с той же несуществующей строкой capability.

### F3 — `app_object_owner` не может исполнить тело своего же корня (пункт 4)

`app.prune_context_nonce_ledger` — SECURITY DEFINER с владельцем `app_object_owner`, а её тело зовёт
`app.require_accepted_context` через `app.hash_port_typed_args`. Закоммиченный артефакт
`privileges.bcb_webapp_dev.sql` не выдаёт `app_object_owner` EXECUTE ни на одну из этих функций
(строки 5305 / 7286 / 7295 — роли перечислены, `app_object_owner` среди них нет).

Живой замер: вызов корня падает с
`ERROR: permission denied for function hash_port_typed_args`.

**И даже если выдать эти EXECUTE — удаление всё равно молча не работает.** В той же транзакции гранты были
выданы временно, после чего корень вернул **0** и все шесть подопытных nonce-строк (включая просроченные на
3601 и 7200 секунд) остались на месте, без ошибки. Причина замерена отдельно: у `app.context_nonce_ledger`
`relrowsecurity=true` и `relforcerowsecurity=true`, а её единственные две политики перечисляют рантайм-роли
и НЕ включают `app_object_owner`; артефакт кандидата политики для него не добавляет. Под FORCE RLS владелец
таблицы тоже подчиняется политикам, поэтому `SELECT`/`DELETE` от `app_object_owner` видит ноль строк:

```
as postgres (superuser bypasses RLS): 1
as app_object_owner (table owner, FORCE RLS): 0
```

Это ровно «дорого И молча» из §10a: тик вернул бы успех, а реестр продолжил бы расти на ~630 тыс. строк в
сутки. Сегодня это замаскировано более громким `42501` из F3.

### F4 — 5 новых целей удаляют без ограничения (пункт 6)

`app.prune_context_nonce_ledger` имеет `p_limit` (и её комментарий в миграции прямо объясняет зачем:
«a first catch-up run cannot hold a long DELETE lock on a multi-million-row backlog»), а пять новых веток
`app.prune_retention_target` удаляют весь подходящий набор одним `DELETE` без `LIMIT`. Оракул требует
батчей явно: «Удаление внутри — теми же батчами по 200k с `LIMIT`, чтобы тик был ограничен по времени и не
держал длинных блокировок». Достижимый сценарий — первый тик после выкатки на живой базе, где
`public.idempotency_keys` копила 1.25 млн просроченных строк / 314 МБ: одна транзакция, один длинный лок,
весь бэклог в WAL. В установившемся почасовом режиме объём мал; риск сосредоточен в первом прогоне.
(Четыре ранее существовавшие ветки того же корня так же безлимитны — новым здесь является распространение
безлимитного удаления на два крупнейших оставшихся журнала.)

### F5 — `pnpm --dir apps/webapp lint` красный (repo-rule, §5)

```
src/modules/db-retention/journalRetention.ts
  1:1  error  '@/infra/db/pruneRetentionTarget' import is restricted from being used by a pattern.
              modules must not import infra/db directly. Use a port injected via DI  no-restricted-imports
```

Каталог `src/modules/db-retention/` заведён этим же коммитом, то есть нарушение внесено им, а не унаследовано.
`pnpm run ci` включает `lint`, поэтому ветка в текущем виде полный CI не проходит. Отчёт исполнителя
перечисляет `tsc --noEmit`, но не `eslint`.

## Добавленный acceptance-тест (не продуктовая правка)

`apps/webapp/src/modules/db-retention/journalRetention.contract.test.ts` — контракт между кодом, который
входит в БД infra-принципалом, и `deploy/postgres/privileges/declaration.ts`. Красный на кандидате ровно на
F1 и F2 и ни на чём другом:

```
locked-infra cron sources with no declared port capability:
  + [ "api/internal/db-journal-retention/tick:POST" ]
named roots the retention tick calls with no declared service capability:
  + [ "app.prune_context_nonce_ledger(integer,integer,boolean)" ]
```

Тест не залипший: при временном добавлении источника в `WEBAPP_MAINTENANCE_SOURCES` и capability-строки для
nonce-корня он становится зелёным (2/2), после чего временная правка декларации была откачена.
Файл выбирается проектом Vitest `fast`. Оракулом служит декларация, а не проверяемый код: набор способностей
отрисовывается настоящим генератором, а разрешение выполняют настоящие продуктовые функции.

Тест закрывает только F1/F2. F3 (EXECUTE и политика FORCE RLS) — факты декларации и артефакта, доказанные
взглядом и живым прогоном; тестом текста сгенерированного SQL их проверять запрещено (§10a).

## Слепой kill-set: что сломано → какое утверждение покраснело

Список составлен по authority ДО чтения тестов. Пять классов, которые живут в TS, уже покрыты и лично
проверены инъекцией поломки (все правки откачены, дерево чистое):

| Поломка, внесённая в продуктовый код | Покрасневшее утверждение |
|---|---|
| проверка Bearer отключена (`if (false)`) | `rejects a missing/wrong Bearer before touching the retention sweep` |
| агрегат глотает отказ цели (`if (false)` вместо `errors.length > 0`) | `keeps every target independent…` |
| цель `notification_delivery_attempts` убрана из прохода | `sweeps every still-live Track D journal target in one tick…` + `keeps every target independent…` |
| `dryRun` игнорируется (`const dryRun = false`) | `carries dryRun into every target call` |
| снят clamp grace у nonce-корня | `sweeps app.context_nonce_ledger through its own dedicated root, clamping grace and limit` |

Классы предикатов SQL (живые статусы очереди, границы окон, отказ на необъявленной цели, dry-run,
ограниченность, идемпотентность) проверены не тестом, а живым rollback-only прогоном — по §24.4 это разовые
факты поведения БД, а тест текста миграции запрещён §10a.

## Рекомендация (не находка)

`app.context_nonce_ledger` не имеет индекса по `expires_epoch` — единственный индекс это PK по `nonce`.
Почасовой прунер будет каждый час делать seq scan по таблице, растущей на ~630 тыс. строк/сутки. `LIMIT`
ограничивает объём удаления, но не стоимость поиска. Индекс уместно добавить тем же изменением, которое
делает этот скан постоянным.

## Чем измерено

```
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --check   # побайтно, 4 артефакта
node --experimental-strip-types deploy/postgres/privileges/generate-cli.mjs --gaps    # unresolved=0 gaps=0, обе БД
node --test deploy/postgres/privileges/migration-order.test.mjs \
            deploy/postgres/privileges/migrate-local-parse.test.mjs                   # 30/30
pnpm --dir apps/webapp exec vitest --run <три файла кандидата>                        # 12/12 зелёные (контроль)
pnpm --dir apps/webapp exec eslint src/modules/db-retention/journalRetention.ts        # 1 error (F5)
sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -f <probe.sql>
```

`deploy/host/migrate-dev.sh --preflight` намеренно НЕ запускался: до rollback-only шага он выполняет
`seed_relation_wall_registry`, то есть коммитит перезасев реестра стен в общую DEV из декларации этой ветки.
Бриф разрешает только доказательство внутри одной транзакции с гарантированным `ROLLBACK`. Вместо него
кандидатное DDL прогонялось из точного checkout'а с теми же временными грантами, которые выдаёт
`migrate-local.mjs:462-466`, и с `ROLLBACK` в конце. Отдельно: в этом worktree preflight и не запустился бы —
он требует `.env` и `apps/webapp/.env.dev`, которых в worktree нет.

Миграция не применена ни к одной базе; TEST и PROD не затронуты; секреты и полезная нагрузка не читались и
не печатались; доставок не было.
