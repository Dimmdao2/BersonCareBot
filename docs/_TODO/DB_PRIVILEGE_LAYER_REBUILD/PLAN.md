# PLAN v10 — единый слой доступа PostgreSQL

Дословный owner-канон: [`docs/OWNER_DECISIONS.md`](../../OWNER_DECISIONS.md), раздел «Права БД, роли и стены».
Этот файл — исполняемый порядок и состояние работ. Более позднее owner-решение всегда заменяет старый пункт;
история замен остаётся в git и [`AUDIT_LOG.md`](./AUDIT_LOG.md), но не действует одновременно с новым планом.

## OWNER-CORRECTION 16.08.2026 — B0, без исторического replay

Текущая доведённая структура DEV становится baseline `B0`. Все прежние migration-файлы/manifests и активная
historical ledger-chain удаляются из checkout; ledgers DEV/TEST ребейзятся на один marker `B0`, после которого
начинаются только новые forward-миграции. Переход существующего PROD-снимка `A → B0` — одна цельная атомарная
миграция. Все формулировки ниже про replay legacy/history, A0/A1/disposable bootstrap, восстановление цепочки и
ordinary deploy через старые migrations являются историческим evidence и больше не задают работу.

Текущий порядок: довести и доказать весь DEV как `B0`, включая страницы, действия, сервисы, воркеры и доставки →
удалить активную историю и второй путь → проверить новые chokepoints/marker → один раз перевести текущую именованную
TEST в финальное состояние через `deploy-test` → удалить необходимость в этом переходном механизме → полностью
проверить TEST. Живая отправка TEST разрешена только на аккаунты Дмитрия Берсона. Любая ошибка TEST исправляется
в коде и канонической DEV-базе/схеме с мигратором, после чего DEV и TEST проходят заново. Только затем отдельным
этапом готовится одна `A → B0` миграция на чистом PROD-дампе для SaaS prod test deploy.

## Конечный результат

Рабочая цепочка: **PostgreSQL mTLS → минимальные logins/roles/grants → transaction-bound context → нативный
FORCE RLS → узкие SECURITY DEFINER-функции**.

- Портов два: webapp и integrator. Мимо них прикладная БД не доступна.
- Runtime DB-logins четыре: `webapp_patient`, `webapp_staff`, `webapp_global_admin`, `integrator`; мигратор
  существует только в окне deploy. Точные env-префиксы имён формирует target-конфигурация.
- Неизвестный человек не получает DB credentials. До человеческой сессии только webapp может открыть короткую
  attested `pre_session`-транзакцию с exact function/purpose/typed-args hash.
- У runtime/seam ролей нет `BYPASSRLS`; global-admin пересекает организации отдельным login/certificate/pool,
  но не получает clinical/medical роли.
- Всё, чего нет в единой декларации, запрещено. Миграции меняют schema/data, а generator после миграций одной
  транзакцией приводит owners, roles, memberships, grants, policies и context catalog к декларации.
- Любая новая управляемая таблица рождается закрытой и остаётся недоступной до явной классификации и стены.
- Отказ без требуемого контекста означает: **данные не раскрыты, statement падает с SQLSTATE `42501`, отказ
  виден в системном журнале PostgreSQL**. Формулировка «одновременно ошибка и возвращены 0 строк» не используется.

## Неизменяемый порядок владельца

Ни номер фазы ниже, ни удобство скрипта не могут переставить эти шаги:

0. Не тушить отдельные дыры заплатками; строить целую воспроизводимую систему.
1. Почистить разросшиеся журналы и обеспечить регулярную очистку.
2. Сохранить все реальные находки в общем audit log, исправленные громко помечать.
3. Разобрать дубли integrator/legacy, перевести живых потребителей и удалить мусор миграциями.
4. На target-БД сначала удалить старые application logins/roles/grants/default privileges, закрыть `PUBLIC` и
   получить доказанную **точку ноль: никто из прикладных принципалов не получает данные**.
5. От потребности спроектировать минимальный состав logins/roles и доступ каждой таблицы/функции.
6. Ввести неэкспортируемое доказательство порта: mTLS при connection + private transaction context.
7. Только после доказанной точки ноль наложить из декларации минимальные grants/RLS/definer-допуски.
8. Выполнить живую проверку: сначала агент, затем владелец руками.
9. Каждый громкий отказ разобрать по одному: удалить лишний вызов, провести его через порт/узкий seam либо
   добавить доказанно необходимое право в декларацию; затем повторить проверку.

## Один target за любой deploy/cutover

Каждый запуск принимает одну явно названную target-среду и изменяет только её БД. Для initial cutover или
cutover восстановленного dump порядок:

`legacy(target) → zero(target) → prove-zero(target) → install-access(target) → live-proof(target)`.

- После принятого cutover обычный deploy **не повторяет legacy/zero и не удаляет runtime logins**. Его цикл:
  `schema/data migrations (birth-closed) → declaration reconcile → bidirectional catalog audit → smoke`.
- Ни initial cutover, ни обычный deploy не делает `DROP/CREATE` target-БД и не создаёт пустую TEST.
- DEV и TEST не объединяются в одну обязательную транзакцию/цепочку. Один и тот же переносимый механизм
  выполняется для каждой среды отдельно.
- Общие cluster roles приводятся идемпотентным cluster-baseline; env-login удаляется только после проверки
  зависимостей во всех БД кластера.
- HBA/mTLS — разовое host provisioning при вводе среды плюс ротация сертификатов. Обычный deploy сохраняет
  соседние HBA-блоки и только проверяет готовность своего target. DB roles/grants/RLS сверяются каждый deploy.
- TEST и PROD проходят offline cutover: сервисы не запускаются между legacy-drop, zero и положительным proof.

## Текущее фактическое положение на 13.08

**DEV находится на шагах 8–9 owner-порядка.** Legacy удалён; target прошёл backup → offline zero/proof →
cluster baseline → mTLS readiness → declaration install. Webapp и integrator поднялись через новые pools;
идёт разбор оставшихся громких runtime-отказов по одному до полного green live matrix.

- [x] Полезные ветки сведены в `feat/doctor-ui-rebuild`; ветка запушена до live-операций.
- [x] Написаны и на disposable PostgreSQL 16 доказаны legacy migrations, revoke-only zero, post-zero installer,
  declaration generator, port-context contract и host-mTLS primitive.
- [x] На DEV каталогом подтверждено отсутствие 11 старых integrator tables, `integrator.telegram_state` и
  `public.appointment_records`.
- [x] На DEV применён zero-state; wrapper получил `BCB_ZERO_STATE_VERIFIED`, после чего только на закрытый target
  наложен новый доступ. База не пересоздавалась, данные не обнулялись.
- [x] Target declaration/contract обновлены под отдельный global-admin login и универсальную birth wall;
  `pnpm test:db-initial-cutover` доказал target-only zero/install, неизменность соседней БД, late-fault возврат в
  zero и неизменность OID обеих БД.
- [x] Новый доступ на DEV применён; четыре независимых DEV-login проходят `/api/me`, patient/doctor/clinic-admin/
  global-admin representative pages завершаются `200`, включая тариф/биллинг клиники после
  `dd2d3dff3`; integrator `/health` и `/health/projection` возвращают `200`. После `bed5c1323` все 32 статических
  patient route из живого census возвращают `200` без нового `ERROR/FATAL/PANIC` в PostgreSQL journal. Staff
  render проверен на `260` role/path сочетаниях и `28/28` живых dynamic URL; global-admin — на `13` прямых
  страницах, трёх ожидаемых redirect и живой dynamic clinic page. Signed integrator relay уже доказывает
  `400` без headers, `401` с чужой подписью, `200 accepted`, durable `200 duplicate` и exact delivery audit
  без внешней отправки. Исчерпывающая role/definer negative matrix закрыта; оставшиеся действия всех ролей,
  остальные integrator routes и ручная проверка владельцем остаются открыты ниже.

### Исправление ошибочного ухода в пустую TEST

- [x] До ошибочного пересоздания сохранён backup исходной именованной TEST:
  `/var/backups/bersoncarebot-test-portctx/bersoncarebot_test-pre-portctx-20260812T143633Z.dump`;
  SHA-256 `364cb1c35778fe5b7fca8ab0134545dfd2b1aae1bc5a12ac02d0c2aea64fceeb`; archive list читается.
- [ ] Вернуть именованную TEST из этого pre-error backup и проверить данные/ledger/catalog. Это ремонт инцидента,
  не репетиция production dump и не доказательство целевого cutover.
- [x] Коммиты `5a01acf81..cad14a1c6` проверены: empty-TEST-specific обходы и совместный DEV+TEST installer удалены;
  переносимые schema/cutover исправления сведены в target-neutral механизм для существующей БД.

## Ф0–Ф1 — исследование и схема

- [x] PostgreSQL-примитивы проверены исполнением на PostgreSQL 16; первичные факты сведены в `FACTS.md`.
- [x] Схема revision 10 была пересобрана от owner-решений, а revision 11 синхронизировала её с поздним решением
  об отдельном global-admin login, одним target за запуск и универсальной стеной рождения.
- [x] Вариант A выбран для текущего pre-session; вариант I оставлен будущим privacy-этапом; port proof и human
  identity proof разделены.
- [x] `SCHEME.md`, declaration и generated artifacts синхронизированы с отдельным global-admin login и
  универсальной стеной рождения; independent audit и live catalog negative matrix пройдены.

## Шаги 1–2 owner-порядка — журналы и сохранение находок

- [x] Разовая инвентаризация и очистка разросшихся DB-журналов выполнена в `bca1d376a`, evidence
  `evidence/16-journal-retention.md`.
- [ ] Реализовать и live-доказать регулярную retention/rotation: DB cleanup под `app_operational_maintenance`
  только через webapp port; PostgreSQL/systemd/application log rotation проверить новым фактическим замером.
- [x] Все findings этой инициативы ведутся в одном [`AUDIT_LOG.md`](./AUDIT_LOG.md); новый отдельный audit-документ
  не создаётся.
- Постоянное правило: каждую новую реальную находку добавлять туда; после исправления менять её статус на
  **ИСПРАВЛЕНО ГРОМКО** с проверяемым evidence, не оставляя активной рядом со старой формулировкой.

## Ф2 — pre-zero: мусор и старые потребители

Этот этап исполняется **до точки ноль**, а не в конце.

- [x] Production-callers старого Telegram dialogue/state/user store удалены; channel binding хранится в
  `public.user_channel_bindings`, дедуп — в `integrator.idempotency_keys`.
- [x] Fail-loud migration удаляет `telegram_state`, `message_drafts`, `identities`, `users` без `CASCADE`,
  переносит только необходимые channel facts и доказана positive/idempotent/rollback сценариями.
- [x] `public.appointment_records` и его callers заменены `public.be_appointments`; migration `0386` доказана
  positive/idempotent/rollback сценариями.
- [x] Код очереди доставки переведён с удалённой `integrator.message_retry_jobs` на
  `public.outgoing_delivery_queue`; соответствующие callers старой очереди удалены.
- [x] DEV: 11 legacy integrator tables, `telegram_state` и `appointment_records` отсутствуют.
- [ ] TEST: проверять legacy-drop только после восстановления pre-error TEST; не создавать ради этого пустую БД.
- [ ] Классифицировать оставшуюся аналитику: владелец данных, видимость и точная стена; лишнее удалить.

## Ф3 — точка ноль

- [x] Revoke-only generator снимает database/schema/table/column/sequence/function/type/large-object/FDW ACL,
  policies, memberships и default privileges, закрывает `PUBLIC`, не выдавая ни одного нового права.
- [x] Zero-state acceptance на одноразовом PostgreSQL краснеет после каждого повторно внесённого rogue grant,
  policy, membership и default privilege.
- [x] Zero/apply механизм target-neutral: один явно заданный target, соседняя БД сохраняется побайтно и
  семантически, `DROP/CREATE DATABASE` отсутствует; disposable acceptance зелёный.
- [ ] Сформировать минимальный именованный allowlist исключений точки ноль: PostgreSQL superuser и migrator
  только в окне миграций.
- [x] DEV offline: применить legacy migrations → zero; каталогом доказать `PUBLIC` closed, runtime login/roles без
  data ACL/membership, default privileges closed, policies absent, permanent `BYPASSRLS=0`.
- [x] Негативный контроль DEV: все `16` достижимых login→role сочетаний без port context дали `42501`; все
  `236` runtime definer + `6` context-helper functions дали `42501`, а PostgreSQL journal записал физический
  login, function и statement. Остальные `12` definer functions runtime-ролям не исполнимы; `PUBLIC` ACL = `0`.

## Ф4 — минимальная модель logins, roles и seam owners

- [x] Зафиксированы четыре runtime login: webapp patient/staff/global-admin и integrator; migrator — только deploy.
- [ ] Для каждого login/role/seam owner назвать единственную потребность; сущность без потребителя удалить.
- [x] Global-admin login: отдельные mTLS certificate/pool, только platform/global membership, mandatory human
  global-admin context + 2FA; без patient/staff/clinical membership и без medical access.
- [x] Staff login не может `SET ROLE` global-admin; global-admin login не может `SET ROLE` staff/patient/clinical;
  двусторонняя изоляция membership проверяется catalog test.
- [ ] `saas_operator` провести через webapp role; отдельный pool/login убрать. Потребителя `saas_diag` доказать
  либо роль удалить. Пустые operational roles свести к необходимому.
- [x] Integrator target memberships ограничены request, narrow resolver, delivery worker, scheduler,
  tenant-service и no-tenant service; все SET-only/non-transitive.
- [ ] Приёмка: полный список login/roles/owners, у каждого есть потребность и exact access surface; лишних нет.

## Ф5 — два порта, mTLS и transaction context (вариант A)

- [x] Exact SQL contract реализован: private capabilities/accepted contexts, binding к database/login/backend/
  transaction/role/class/purpose/typed-args, SQLSTATE `42501`, cleanup и revocation.
- [x] Webapp и integrator используют общий exact-client transaction wrapper: begin → clear → install context →
  `SET LOCAL ROLE` → queries → cleanup → commit/rollback; cleanup failure уничтожает connection. Отдельный
  global-admin physical pool включён и прошёл базовый live proof в Ф7.
- [x] Общий `webapp_pre_session_relation` удалён: production callsite oracle и capability catalog оставляют только
  named roots; generic pre-session relation descriptor отсутствует.
- [x] Все `45` уникальных callable pre-session SECURITY DEFINER roots первым действием требуют accepted exact
  function/purpose/typed-args. Catalog verifier проверяет реальные `prosrc`; четыре старых password-login body
  сохранены как private `*_impl` без EXECUTE, наружу доступны только exact-gated wrappers. Function census,
  callsite oracle, real PG16 post-zero replay и single-target late-fault acceptance зелёные.
- [x] Revoke-only zero/post-zero artifacts снимают старые direct bootstrap grants и `PUBLIC EXECUTE`; membership
  само по себе не открывает accepted context. Применение и доказательство на DEV остаются в Ф3/Ф7.
- [x] Accessors fail loudly; disposable faults проверяют wrong database/login/backend/transaction/role/class/
  purpose/args, reuse, direct definer call и `SET ROLE` без accepted context.
- [x] Контекст versioned и не криптографически привязан навсегда к `platform_users.id`; путь A → I сохранён.
- [x] Contract/declaration/tests расширены четвёртым global-admin login без создания третьего software port.
- [ ] Host target provisioning: exact first-match HBA/CN/login rules, CA/CRL, certificate overlap, reload,
  revocation и mandatory pool drain. Private keys только в env соответствующего порта.
- [ ] Live proof на DEV: wrong/missing/expired/revoked certificate, CN/login/port, non-TLS/socket и server
  impersonation; positive pre-session/staff/patient/global-admin/integrator только через свои pools.

## Ф6 — декларация, generator и стена рождения

- [x] Generator умеет сначала оптом отзывать ACL у `PUBLIC`, runtime login и roles, затем создавать exact
  grants/policies одной транзакцией.
- [ ] Удалить из executable declaration устаревшие `revoke`/`OWNER_GATES_OPEN`, diagnostic/operator login и
  трёх-login/global-admin assumptions: декларация должна перечислять только актуально выдаваемое.
- [x] Механизм relation/function/capability matrix и fault injection существует: ручной extra grant/policy/
  membership делает disposable catalog audit красным.
- [x] Current acceptance возвращён в green без зависимости от именованной TEST: function census, named-root
  callsite catalog и target-only post-zero replay проходят на disposable PostgreSQL 16 fixture.
- [ ] Подключить обязательные function-census/callsite-catalog/post-zero gates в обычный CI после исправления;
  текущий `pnpm run ci` их не запускает и не является доказательством этих инвариантов.
- [x] Исправить ordinary DEV migration entrypoint под новую схему: `migrate-dev.sh` не должен требовать
  удалённый `bcb_webapp_dev_user`/`DATABASE_URL`; мигратор получает повышенные права только на время deploy,
  затем declaration reconcile и catalog audit возвращают стационарное deny-by-default состояние.
  - [x] Отдельный повторяемый reconcile уже выполняет declaration apply + environment/catalog audit одной
    транзакцией без legacy/zero/login cleanup; два живых повтора DEV и disposable drift-repair сохранили данные.
  - [x] Перевести на deploy-only `bcb_dev_migrator` сам schema/data migration шаг и вызвать reconcile из
    `migrate-dev.sh`; до этого весь пункт остаётся открытым.
- [ ] Удалить из активных migrations доступ как источник истины: новые
  `GRANT/REVOKE/CREATE POLICY/ALTER POLICY/CREATE ROLE` запрещены; legacy migration SQL не переписывается.
- [x] Generator/audit проверяет обе стороны: relation есть, declaration нет; declaration есть, relation нет;
  плюс owners, role attributes, memberships, table/column/sequence/function ACL, policies и defaults. Live
  function-body verifier также сверяет объявленные `SELECT/INSERT/UPDATE/DELETE` с фактическим `prosrc`, включая
  дополнительные права, требуемые `ON CONFLICT` и `RETURNING`; расхождение прерывает reconcile.
- [x] Универсальная birth wall для **каждой** managed table: default ACL закрыты у всех creators; tenant/clinical
  получает `ENABLE+FORCE RLS` и свои объявленные tenant/patient policies; platform/system/identity/closed/definer
  получает явно объявленную class wall.
- [x] Невозможность классифицировать/наложить стену прерывает DDL/deploy. Позднее добавление tenant/patient
  признака через `ALTER TABLE` повторно проверяется. Event trigger защищён от рекурсии.
- [x] Generated artifacts синхронизированы после global-admin/birth-wall изменений; disposable fault suite даёт:
  defect red → fixed green → injected defect red again.

## Ф7 — DEV: наложение и живой прогон

- [x] Host cutover wrapper fail-closed: с начала изменения доступа target держится с `CONNECTION LIMIT 0`, при
  любой ошибке install/HBA/readiness снова закрывается, исходный limit возвращается только после полного PASS;
  шесть fault points проверены self-test.
- [x] После доказанного DEV zero применить cluster-baseline, host mTLS readiness, port-context catalog и
  declaration-generated grants/RLS/seams — строго в этом порядке.
- [x] Проверить все cluster logins из `pg_roles`, все SET-able roles, `PUBLIC` и каждую definer-функцию; исключения
  перечислить поимённо. Из `16` cluster login к DEV подключаются только четыре `bcb_dev_*` и именованный DBA
  `postgres`; `bcb_test_integrator`, `bcb_test_webapp_patient`, `bcb_test_webapp_staff`, `brain`, `brain_ro`,
  `code_search_ro`, `storylama_dev`, `storylama_prod`, `tgcarebot`, `pbt_tpl_1785583727857_d29e62` и
  `pbt_tpl_1785583783003_37ea98` к `bcb_webapp_dev` не подключаются. `16/16` разрешённых login→role,
  `236/236` runtime definer и `6/6` context-helper negative probes дали `42501`; `12` внутренних definer не имеют
  runtime EXECUTE; `PUBLIC` relation/routine ACL = `0/0`; отказы присутствуют в PostgreSQL system log.
- [x] Базовый положительный контроль: четыре новых pool/login проходят реальные `/api/me`, representative
  patient/staff/global-admin pages и integrator health. Стена, которая не пускает приложение, не принимается.
- [x] Patient render/action slice: `32/32` статических patient routes дали `200`; support mark-read и
  reminder done/snooze/skip дали `4/4` HTTP `200`, а PostgreSQL state подтвердил все три изменения без новой
  строки системного журнала (`/tmp/bcb-patient-write-actions-r6.json`, log cursor `394370..394369`). Одноразовая
  treatment-program fixture прошла own list/detail, touch и complete; строка другой организации скрыта (`404`),
  state подтвердил `in_progress|1|1|2`, cleanup вернул `0` оставшихся probe-строк.
- [ ] Пройти полный смысловой live census действий staff/clinic, global-admin и integrator; для patient ещё
  остаются остальные непроверенные mutation-пути; доступ не выводить из одного наличия вызова в коде.
  Staff render закрыт: `260` role/path сочетаний без `4xx/5xx` и `28/28` живых dynamic URL дали `200`.
  Global-admin render закрыт: `13` прямых страниц дали `200`, три product redirect соответствуют маршрутам,
  dynamic clinic page дала `200`. Integrator signed relay auth/dedup/audit slice закрыт; отдельные signed
  SMS/email/MAX-OTP routes прошли central no-send guard и exact audit, включая OTP payload redaction. Signed
  operator-alert прошёл auth/dedup/no-send/audit, а operator-health прошёл portable scheduler seams и запись
  `health.outbound_probe.run` на живой DEV без ошибки приложения/PostgreSQL. Signed request-contact теперь
  доказан как global pre-login handshake: без угадывания deployment organization, identity write и внешней
  отправки, с accepted/duplicate и exact audit. Dedicated Telegram/MAX webhook pre-routing теперь использует
  exact named resolver без identity/org claims; неизвестный fingerprint закрывается как `Unknown bot`, а
  одноразовая положительная DEV-привязка вернула ровно объявленную организацию для обоих каналов. Webhook status
  и error event записываются одной атомарной exact-функцией; health aggregate/retention вынесены в отдельные
  exact roots, поэтому `app_worker` не имеет direct table grants. Ещё открыты staff/global mutations, оставшиеся
  patient mutations и остальные incoming/outgoing/scheduler/worker integrator-сценарии. Staff/clinic census
  выявил и кодом закрыл systemic hybrid-guard blocker: все `29` route-файлов со старым
  `requireAdminBookingEngine` оказались legacy HTTP/UI поверхностью и удалены; живые clinic-management routes
  используют `requireClinicManagementBookingEngine`, doctor schedule/package/appointment paths — doctor routes.
  Пять platform audit/health mutations переведены с невозможного clinical membership на обязательный
  `requirePlatformOperationsApiContext`; два небезопасных orphan routes удалены. Targeted route tests `24/24`,
  entitlement registry coverage `8/8` и webapp typecheck зелёные. После owner-ordered migration + declaration
  reconcile четыре login дали `/api/me=200`; global-admin audit/archive и doctor archive дали `200`, platform
  archive не вернул clinical-поля. Exact resolve-missing дал `404`, acknowledge и два пустых archive batch дали
  `200` с обязательными строками platform audit. Непустой live slice тоже закрыт: resolve-all закрыл ровно `2`
  открытых incident, а outgoing/reminder archive перенёс `3+12` dead-строк в tenant-walled архив и удалил их из
  рабочей очереди; platform list вернул `59` строк без единого clinical value. Два последовательно найденных
  live-only дефекта `pg_catalog.coalesce/greatest` исправлены forward migrations `0400/0401`; обычный
  `migrate-dev.sh --execute` применил их и повторно прошёл declaration reconcile/catalog audit.
  Clinic-topology mutation block закрыт живым DEV-прогоном после нового clinic-management guard. Текущий тариф
  осмысленно отверг создание лишнего физического филиала (`403 entitlement_required`), поэтому DB grant не
  расширялся. Synthetic service/specialist/location/availability созданы и обновлены в своей организации;
  чужой specialist дал `404` и не изменился; DELETE-пути деактивировали свои строки. Live нашёл один класс
  потерянных column grants: Drizzle явно испускает default-колонки в INSERT, поэтому семь topology relations
  получили exact перечисление этих колонок без table-wide write. Built-in Online отдельно перестала потреблять
  stock физических филиалов: toggle off/on прошёл `200/200`, исходные state/color/timestamp восстановлены.
  Все fixture-строки удалены точечно; оба исходных `42501` присутствуют в PostgreSQL system log.
  Integrator census свёл остаток к `6` HTTP route-группам, `5` projection event types, `8` outgoing kinds и
  `4` scheduler paths. Action/worker-пробы запускаются только отдельным one-shot process с отключёнными default
  redirect targets и пустым passthrough: обычный DEV redirect перенаправляет, а не гарантирует no-send.
  Patient reminder/mood block закрыт живым own+foreign прогоном: mark-specific и mark-all обновили только две
  собственные history-строки, mute/unmute изменили только собственный `reminder_muted_until`, mood create/update
  и today/week дали `200`, а hash `617` чужих symptom entries остался неизменным. В декларацию возвращены
  потерянные при rebuild смысловые patient-права на current-clinic reference catalog и собственные symptom
  entries; старый reminder query больше не зависит от выбранной клиники и не глотает DB-отказ как ноль.
  Reminders read-page без выбранной клиники больше не пытается читать/материализовать clinic promo до проверки
  `canMaterialize`: повторный live render `200` без `ensure_default_promo_failed` и без нового DB grant.
  Независимый аудит затем нашёл, что настоящий integrator producer терял `platform_user_id` и `organization_id`
  finalized occurrence, поэтому ручной fixture не доказывал весь путь. Поля теперь проходят occurrence → event →
  consumer, но повторный аудит поймал второй разрыв до ложного закрытия: signed HTTP route оставлял finalized
  event в bootstrap context, а INSERT ошибочно принадлежал staff. Финальное решение не оставляет direct INSERT
  ни staff, ни tenant relation-role: signed route ставит organization principal, а запись выполняет одна exact
  SECURITY DEFINER-функция, которая сама требует active patient enrollment именно в payload organization.
  Живой DEV proof закрыт: свой event принят и записан, replay обслужен durable idempotency без повторного handler,
  чужая organization дала громкий PostgreSQL-отказ и ноль строк; fixtures очищены.
  Patient analytics page-view и push-open прошли live: первый push-open записан, повтор дедуплицирован, агрегаты
  выросли ровно на один. Route теперь устанавливает authenticated patient context; прежний pre-login mutation
  удалён. Найденный класс PostgreSQL `ON CONFLICT DO NOTHING` проверяется generator body verifier. Повторный аудит
  исправил завышенную первую реализацию: targetless/plain INSERT больше не требуют SELECT, а targeted variants
  получают operation-specific доступ только к arbiter/predicate columns. Новый reconcile после correction
  выполнен штатным `migrate-dev.sh --execute`; targetless finalized projection также прошла положительный и
  отрицательный live. Повтор отдельного push-open остаётся частью общего незакрытого action census, а не условием
  готовности finalized projection.
  Patient material-rating slice также закрыт live. Оба mutation-route больше не читают закрытую
  `system_settings`, а используют один server-runtime accessor; global-admin может менять тот же флаг через
  существующий settings service. Drizzle default/`RETURNING` surface описан exact-column grants, собственная
  rating/feedback запись и повторное чтение дали `200/200/200`, а в другой активной клинике тот же target дал
  `404/404`; MD5 обеих foreign relation до/после совпал. Флаг возвращён в `false`, synthetic rows и test audit
  удалены, миграционная runtime-строка сохранена. Owner-ordered migrator теперь поддерживает один общий
  `BCB-MIGRATION-BACKFILL` marker вместо отдельного ad-hoc пути; parser test и штатный DEV migration/reconcile
  прошли. Независимый audit-gate не принял первый вариант: direct patient SELECT раскрывал строки других
  пациентов, data-only migration рендерила нетипизированный `ARRAY[]`, а runtime-роли могли напрямую подделать
  immutable audit. Все три разрыва закрыты централизованно: patient aggregate+own value возвращает один exact
  named root при self-only relation policy; data-only path не рендерит пустую membership-проверку; audit пишет
  только SECURITY DEFINER trigger-owner без direct runtime INSERT. Живой accepted-context proof дал patient
  relation `1` собственную строку при aggregate `7`, а platform direct audit INSERT — PostgreSQL `42501`;
  штатный PATCH/trigger при этом остался рабочим. Отдельно live поймал и закрыл пропущенную capability-запись
  named root в том же declaration/generator; после env projection и контролируемого restart GET дал `200`.
  Из шести integrator HTTP route-групп отдельно закрыт reminder-rule upsert, поэтому route-остаток теперь `5`.
  Signed route использует один exact resolver integrator user → platform user + organization и передаёт тот же
  результат в organization principal и direct writer без повторного identity-query. Rule upsert и отмена
  `planned/queued` occurrences выполняются в одной transaction; tenant-service имеет только `DELETE` и
  `SELECT(rule_id,status)` под current-organization RLS. Живой disabled synthetic rule дважды дал `HTTP 200`,
  второй прогон удалил одну заранее созданную planned occurrence, outbox остался `0`; cleanup вернул
  rule/occurrence/projection `0/0/0`.
  Следующая HTTP route-группа booking lifecycle также закрыта, поэтому route-остаток теперь `4`. Route ставит
  organization principal из signed payload только для tenant-событий; context-free delete/package events не
  делают неиспользуемый DB timezone read. Общий fixed-allowlist `read_integrator_runtime_setting` переведён на
  существующий `app_service` named-capability шаблон без прямого table grant. Живые context-free delete и tenant
  reminder-update дали first/replay `200/200`; synthetic idempotency/DQ cleanup `0/0`, PostgreSQL cursor без новых
  строк. Отдельно исправлен reminder-rule outbox fallback: он повторно входит в exact integrator request context,
  иначе наблюдавшийся direct-write error превращался в потерю durable fallback.
  Последние четыре HTTP route — generic/dedicated Telegram и MAX — закрыты одним provider-free production
  composition proof. Все public Drizzle relations интегратора теперь явно квалифицированы `public.*`, поэтому
  locked `search_path` больше не превращает рабочую таблицу в `42P01`. Identity projection не перестраивает
  contact index при name-only messenger update без phone/email. Обычные ответы получают пару egress-marker один
  раз на общей границе accepted-event pipeline; явные/частичные marker не переписываются и по-прежнему fail-closed.
  Провалившийся `inbound_reply` записывается не широким INSERT, а одной exact-функцией
  `app.enqueue_integrator_inbound_reply(...)` под delivery-worker context. Команда
  `bash /home/dev/brain/host-orch/run-tests.sh pnpm --dir apps/integrator exec tsx
  src/infra/scripts/check-live-incoming-no-send.ts` вернула `4/4` HTTP `200/ok=true`, четыре
  `PRE_FORK_DEV_DELIVERY_REDIRECT_SUPPRESS` и оба канала `telegram/max`; реальной внешней отправки не было.
  После времени пробы PostgreSQL journal не содержит нового `ERROR/FATAL/PANIC` от runtime login. Route-остаток
  теперь `0`. Финальный полный `pnpm run ci` под host-lock завершился exit `0`: lint, strict typecheck, все
  test suites, disposable PostgreSQL principal/zero-state acceptance, обе production build и общий audit прошли.
  Живые health-check после CI дали webapp/integrator `db=up`, projection `pending=0/dead=0/processing=0`.
  Отдельный исчерпывающий live action/worker/scheduler census остаётся частью ручного прохода и owner-gated
  эксплуатационных этапов; внешние delivery/provider действия на DEV намеренно доказываются central no-send,
  а не реальной отправкой.
  OWNER-DEFERRED 14.08.2026: текущий Chromium-проход измерил первую DEV/Turbopack-компиляцию части patient
  routes примерно в `100–120 s`. Это отдельный будущий разбор производительности, а не условие текущего
  security/correctness-прохода: сначала измерить отдельно compile, SSR/loaders/DB и client render, затем выбирать
  оптимизацию. Текущий приоритет владельца — рабочий DEV и корректная изоляция данных.
  Live census 14.08.2026 нашёл и текущий bounded-fix закрыл два эксплуатационных шва в phone messenger bind.
  (1) Secret
  lifecycle проведён через один exact pre-session root
  `app.phone_messenger_bind_secret(text,text,uuid,text,text,text,uuid,text,text,timestamptz)`; прямого runtime
  доступа к `phone_messenger_bind_secrets` нет. Штатный DEV migrate/reconcile прошёл, живой `start → status`
  дал `200 → pending_contact`, а синтетическая запись закрыта тем же application port и вернула `consumed`.
  Отдельно route теперь явно связывает system-settings adapter: до правки валидный start падал `500` раньше БД.
  (2) Signed integrator completion после secret read входил в
  старую безымянную identity transaction; безопасный no-op checkout на DEV воспроизвёл
  `Missing declared webapp port capability: pre_session`. Миграции `0415`–`0418` добавили exact completion-state,
  bootstrap channel-upsert и bootstrap phone-bind roots; integrator bootstrap больше не открывает relation
  transaction. Живой `user.phone.link` попутно вскрыл более ранний незавершённый D15b/6:
  `syncUserContactsMirror` требует читать чужие source-таблицы и пересобирает `user_contacts` как зеркало.
  Прямой relation grant запрещён. Целевое решение — `user_contacts` как единственный источник phone/email,
  direct canonical contact writes и последующее удаление дублирующих колонок. Более позднее owner-указание того
  же дня откладывает этот большой cutover и единый rich user facade до рабочего DEV → TEST → отдельно
  разрешённого PROD. В текущем этапе допустим только ограниченный compatibility-срез без расширения прав:
  симметричный phone/email snapshot в `SessionUser`, удаление старого общего `DATABASE_URL` из runtime checks и
  узкий phone-only sync, который не читает OAuth. Полный live HTTP путь browser start → messenger `user.upsert`
  → first complete `phone_sync_required` → bootstrap phone link → final complete → browser status дал
  `200 → phone_sync_required → userPhoneLinkApplied=true → otp_ready → 200/otp_ready`; OTP в evidence не
  печатался. Read-only aggregate для external id `99000000817` вернул
  `user=d8903136-1b97-44fa-8099-a4e6af803d42 | phone=+79009990817 | trusted=1 | contacts=1 | active_history=1 | challenge=1`.
  Отдельно доказаны идемпотентный повтор и merge пустого bootstrap-аккаунта к уже существующему владельцу
  телефона: оба bindings указывают на один UUID, одна contact и одна active history row. Generator `--check` и
  `--gaps` зелёные (`unresolved=0`, `gaps=0` для DEV/TEST), function/callsite oracle `11/11`, полный
  `pnpm run ci` завершился `rc=0`. Этот compatibility slice закрывает текущий runtime-разрыв, но не D15b/6:
  зеркало и большой identity/contact cutover остаются явно названным post-production долгом.
  OWNER-SUPERSEDED 14.08.2026: A0/disposable/ошибка `0391` не входят в текущий маршрут и не блокируют DEV/TEST.
  Если отдельная временная база когда-либо понадобится, она получает уже отработанную структуру из DEV,
  проверяется и уничтожается; историческая сборка схемы с нуля для этого не выполняется.
  Maintenance-screen снят по прямому owner-разрешению штатным admin API; итоговое значение `false`, protection
  trigger включён. DEV fixture теперь даёт два режима: существующая клиника/пациент и отдельная синтетическая
  клиника/специалист/пациент; для обеих организаций точечно включён только DEV entitlement главной пациента.
  Chromium content+interaction census прошёл doctor, colleague/isolated doctor, clinic-admin, global-admin и оба
  patient режима. Финальные patient-артефакты: isolated `32` routes / `111` controls / `8` interactions, existing
  `32` routes / `154` controls / `30` interactions. Найденные live-only разрывы закрыты: каталог бронирования
  читается через один patient named root вместо direct relation grants; история визитов — через существующий
  self-only maintenance root; дневник, пакеты и платежная история получили exact self/current-org права; запись
  выполнения и ротация разминки всегда несут organization principal; patient media delivery устанавливает
  выбранную организацию до единого authorization chokepoint; notification settings больше не допускают hydration
  race. Повторные точечные Chromium-прогоны главной, бронирования, дневника, адреса и уведомлений — без
  app/API/console/layout diagnostics. Единственный нестабильный шум полного прохода — скрипт внешнего iframe
  `https://dmitryberson.ru/adress`, который на HTTP DEV иногда пытается читать parent window HTTPS→HTTP; страница
  и повторный прогон рабочие, это не выдача данных и не отказ PostgreSQL.
  **CORRECTION 16.08.2026 — booking lifecycle не был доказан:** прежний Chromium census подтвердил загрузку
  страницы и чтение каталога, но не выполнял создание, повторное чтение, перенос и отмену записи. Реальный
  authenticated patient-проход дал рабочие слоты, затем `POST /api/booking/create` вернул `503 create_failed` на
  прямом чтении `be_branches` из staff-oriented create-пути; confirm page одновременно показала недоказанные
  `booking/form-fields` и `booking/memberships/available`. Поэтому формулировка «повторный прогон бронирования без
  diagnostics» относится только к render/read и не является готовностью booking lifecycle. Открытый gate:
  `create → upcoming readback → reschedule → rescheduled readback → cancel → history`, с exact patient roots и без
  direct relation grants.
- [x] Собрать системный лог отказов; по каждому отдельно выбрать: удалить вызов, провести через порт/narrow seam
  или добавить минимальное право в declaration. Ручные GRANT запрещены.
- [ ] **CORRECTION 17.08.2026 — DEV не green:** latest aggregate evidence fails doctor
  authentication/identity and has no complete patient/global-admin artifacts; booking lifecycle evidence is also
  incomplete. The previous readiness statement is superseded. TEST remains untouched until the full role/page/action,
  worker, scheduler and delivery matrix is green.

## Ф8 — финальная TEST-репетиция после зелёного DEV

OWNER-REPLACED 16.08.2026: TEST запрещено трогать до полного зелёного DEV-прохода. После него `deploy-test`
выполняет один раз переход текущей именованной TEST в финальное состояние; механизм этого разового перехода затем
удаляется. PROD и production dump в эту операцию не входят.

- [ ] Все Ф0–Ф7, относящиеся к рабочему DEV, завершены; branch committed/pushed, проверки зелёные.
- [ ] До удаления показать владельцу измеренный список database и cluster login/role с точной командой; удалить
  что-либо из этого списка только после его утверждения. Владелец утвердил список 14.08; удалены три базы и
  `14/18` независимых ролей, ещё четыре снимаются только после устранения их точных object dependencies.
- [ ] Сохранить Brain/TaskDB, StoryLama DEV+PROD и BersonCareBot DEV+TEST вместе с нужными им ролями/логинами;
  локальной BersonCareBot PROD и иных старых/backup/copy баз после утверждённой очистки быть не должно.
- [ ] Не обнуляя и не пересоздавая TEST, один раз перевести её текущее состояние в финальное через `deploy-test`;
  не собирать отдельную A0-базу и не восстанавливать production dump. После успешного перехода удалить разовую
  переходную ветку из `deploy-test`: дальнейший deploy применяет только post-B0 forward-миграции.
- [ ] Доказать migration ledger, отсутствие legacy/лишних grants и positive/negative controls обоих портов;
  затем проверить все страницы/действия, services, workers и все типы доставки на TEST. Живая отправка разрешена
  только на аккаунты Дмитрия Берсона.
- [ ] Любой TEST-дефект исправить в коде и канонической DEV-базе/схеме с мигратором; заново получить полный зелёный
  DEV и только затем повторить TEST-гейт.

## Ф9 — одна A → B0 миграция на чистом PROD-дампе

- [ ] Только после зелёных DEV и TEST подготовить и отрепетировать для SaaS prod test deploy одну атомарную
  миграцию чистого PROD-дампа из состояния `A` в `B0`, без historical replay и промежуточных состояний.
- [ ] После принятой репетиции отдельно подготовить production operation/rollback.
- [ ] Ничего на PROD не выполнять без нового явного разрешения владельца и подтверждения host `135.106.162.170`.

## Что не считается готовностью

Документ, audit PASS, generated SQL, disposable DB или зелёный CI сами по себе не закрывают live DEV/TEST.
Пункт закрывается только evidence той же природы: код — tests/fault injection; каталог — read-only catalog proof;
живой путь — реальный runtime; owner-gated этап — прямое решение владельца.
