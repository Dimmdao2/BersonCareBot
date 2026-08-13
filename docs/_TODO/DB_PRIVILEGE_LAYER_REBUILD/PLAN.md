# PLAN v10 — единый слой доступа PostgreSQL

Дословный owner-канон: [`docs/OWNER_DECISIONS.md`](../../OWNER_DECISIONS.md), раздел «Права БД, роли и стены».
Этот файл — исполняемый порядок и состояние работ. Более позднее owner-решение всегда заменяет старый пункт;
история замен остаётся в git и [`AUDIT_LOG.md`](./AUDIT_LOG.md), но не действует одновременно с новым планом.

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
  без внешней отправки. Исчерпывающая role/definer negative matrix, оставшиеся действия всех ролей, остальные
  integrator routes и ручная проверка владельцем остаются открыты ниже.

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
- [x] Схема revision 10 была пересобрана от owner-решений, а не от живого каталога; её прежний трёх-login
  target теперь частично заменён поздним решением об отдельном global-admin login и требует синхронизации ниже.
- [x] Вариант A выбран для текущего pre-session; вариант I оставлен будущим privacy-этапом; port proof и human
  identity proof разделены.
- [ ] Синхронизировать `SCHEME.md`, declaration и generated artifacts с поздним решением об отдельном
  global-admin login и универсальной стене рождения; затем один независимый audit pass.

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
- [ ] Негативный контроль DEV: каждый login/role/definer без port context не раскрывает данные и даёт громкий
  отказ там, где соединение/вызов достижим.

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
  global-admin physical pool и live wiring остаются ниже.
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
- [ ] Исправить ordinary DEV migration entrypoint под новую схему: `migrate-dev.sh` не должен требовать
  удалённый `bcb_webapp_dev_user`/`DATABASE_URL`; мигратор получает повышенные права только на время deploy,
  затем declaration reconcile и catalog audit возвращают стационарное deny-by-default состояние.
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
- [ ] Проверить все cluster logins из `pg_roles`, все SET-able roles, `PUBLIC` и каждую definer-функцию; исключения
  перечислить поимённо. Непрошедший context — no disclosure + SQLSTATE `42501` + PostgreSQL system log.
- [x] Базовый положительный контроль: четыре новых pool/login проходят реальные `/api/me`, representative
  patient/staff/global-admin pages и integrator health. Стена, которая не пускает приложение, не принимается.
- [x] Patient render/action slice: `32/32` статических patient routes дали `200`; support mark-read и
  reminder done/snooze/skip дали `4/4` HTTP `200`, а PostgreSQL state подтвердил все три изменения без новой
  строки системного журнала (`/tmp/bcb-patient-write-actions-r6.json`, log cursor `394370..394369`).
- [ ] Пройти полный смысловой live census действий staff/clinic, global-admin и integrator; для patient ещё
  создать одноразовую treatment-program fixture и проверить touch/complete без вывода прав из наличия кода.
  Staff render закрыт: `260` role/path сочетаний без `4xx/5xx` и `28/28` живых dynamic URL дали `200`.
  Global-admin render закрыт: `13` прямых страниц дали `200`, три product redirect соответствуют маршрутам,
  dynamic clinic page дала `200`. Integrator signed relay auth/dedup/audit slice закрыт; отдельные signed
  SMS/email/MAX-OTP routes прошли central no-send guard и exact audit, включая OTP payload redaction. Signed
  operator-alert прошёл auth/dedup/no-send/audit, а operator-health прошёл portable scheduler seams и запись
  `health.outbound_probe.run` на живой DEV без ошибки приложения/PostgreSQL. Signed request-contact теперь
  доказан как global pre-login handshake: без угадывания deployment organization, identity write и внешней
  отправки, с accepted/duplicate и exact audit. Ещё открыты staff/global mutations, patient treatment-program и
  остальные incoming/outgoing/scheduler/worker integrator-сценарии.
- [x] Собрать системный лог отказов; по каждому отдельно выбрать: удалить вызов, провести через порт/narrow seam
  или добавить минимальное право в declaration. Ручные GRANT запрещены.
- [ ] Повторять до полного green live matrix; затем ручная проверка владельцем.

## Ф8 — финальная TEST-репетиция на restored production dump

Этот этап остаётся обязательным, но **не запускается автономно**.

- [ ] Все Ф0–Ф7 завершены на коде/disposable/DEV; branch committed, pushed, audited; rollback и backup проверены.
- [ ] Получена прямая команда владельца на начало, владелец контролирует окно; текущая именованная TEST сохранена.
- [ ] Production dump восстановлен именно в именованную TEST — не в пустую замену и не в придуманную среду.
- [ ] На restored dump offline выполнена та же target-neutral цепочка: legacy → zero/proof → install → live proof.
- [ ] Данные и migration ledgers сохранены; legacy relations отсутствуют; services поднимаются только после
  полного positive control обоих портов и global-admin.

## Ф9 — PROD

- [ ] Только после принятой TEST-репетиции подготовить отдельную production operation/rollback.
- [ ] Ничего на PROD не выполнять без нового явного разрешения владельца и подтверждения host `135.106.162.170`.

## Что не считается готовностью

Документ, audit PASS, generated SQL, disposable DB или зелёный CI сами по себе не закрывают live DEV/TEST.
Пункт закрывается только evidence той же природы: код — tests/fault injection; каталог — read-only catalog proof;
живой путь — реальный runtime; owner-gated этап — прямое решение владельца.
