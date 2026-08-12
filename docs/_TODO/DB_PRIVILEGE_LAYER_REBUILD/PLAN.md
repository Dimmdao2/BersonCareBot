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

## Текущее фактическое положение на 12.08

**Мы между шагами 3 и 4 owner-порядка.** На DEV legacy уже удалён, но точка ноль и новый доступ ещё не
применялись. Значит DEV пока не защищён целевой схемой.

- [x] Полезные ветки сведены в `feat/doctor-ui-rebuild`; ветка запушена до live-операций.
- [x] Написаны и на disposable PostgreSQL 16 доказаны legacy migrations, revoke-only zero, post-zero installer,
  declaration generator, port-context contract и host-mTLS primitive.
- [x] На DEV каталогом подтверждено отсутствие 11 старых integrator tables, `integrator.telegram_state` и
  `public.appointment_records`.
- [ ] На DEV применить zero-state и доказать ноль.
- [ ] Обновить target declaration/contract под отдельный global-admin login и универсальную birth wall.
- [ ] На DEV применить новый доступ и выполнить живые сценарии обоих портов.

### Исправление ошибочного ухода в пустую TEST

- [x] До ошибочного пересоздания сохранён backup исходной именованной TEST:
  `/var/backups/bersoncarebot-test-portctx/bersoncarebot_test-pre-portctx-20260812T143633Z.dump`;
  SHA-256 `364cb1c35778fe5b7fca8ab0134545dfd2b1aae1bc5a12ac02d0c2aea64fceeb`; archive list читается.
- [ ] Вернуть именованную TEST из этого pre-error backup и проверить данные/ledger/catalog. Это ремонт инцидента,
  не репетиция production dump и не доказательство целевого cutover.
- [ ] Проверить коммиты `5a01acf81..cad14a1c6`: удалить empty-TEST-specific обходы, сохранить только переносимые
  исправления, которые нужны обычному deploy существующей БД.

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
- [ ] Сделать zero/apply механизм target-neutral: никаких захардкоженных совместных DEV+TEST действий и никаких
  `DROP/CREATE DATABASE`.
- [ ] Сформировать минимальный именованный allowlist исключений точки ноль: PostgreSQL superuser и migrator
  только в окне миграций.
- [ ] DEV offline: применить legacy migrations → zero; каталогом доказать `PUBLIC` closed, runtime login/roles без
  data ACL/membership, default privileges closed, policies absent, permanent `BYPASSRLS=0`.
- [ ] Негативный контроль DEV: каждый login/role/definer без port context не раскрывает данные и даёт громкий
  отказ там, где соединение/вызов достижим.

## Ф4 — минимальная модель logins, roles и seam owners

- [ ] Зафиксировать четыре runtime login: webapp patient/staff/global-admin и integrator; migrator — только deploy.
- [ ] Для каждого login/role/seam owner назвать единственную потребность; сущность без потребителя удалить.
- [ ] Global-admin login: отдельные mTLS certificate/pool, только platform/global membership, mandatory human
  global-admin context + 2FA; без patient/staff/clinical membership и без medical access.
- [ ] Staff login не может `SET ROLE` global-admin; global-admin login не может `SET ROLE` staff/patient/clinical.
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
- [ ] Завершить замену общего bootstrap на exact `pre_session`: сейчас exact descriptors покрывают только часть
  roots, а общий `webapp_pre_session_relation` capability и широкий callable auth/public surface ещё существуют.
- [ ] Каждый pre-session SECURITY DEFINER root первым действием требует accepted exact function/purpose/typed-args
  и имеет только named relation/column/action surface. Текущий function census рассинхронизирован с declaration.
- [x] Revoke-only zero/post-zero artifacts снимают старые direct bootstrap grants и `PUBLIC EXECUTE`; membership
  само по себе не открывает accepted context. Применение и доказательство на DEV остаются в Ф3/Ф7.
- [x] Accessors fail loudly; disposable faults проверяют wrong database/login/backend/transaction/role/class/
  purpose/args, reuse, direct definer call и `SET ROLE` без accepted context.
- [x] Контекст versioned и не криптографически привязан навсегда к `platform_users.id`; путь A → I сохранён.
- [ ] Расширить contract/declaration/tests четвёртым global-admin login без создания третьего software port.
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
- [ ] Вернуть current acceptance в green: function-census сейчас расходится с declaration, а post-zero replay
  зависит от повреждённой именованной TEST. После восстановления TEST убрать эту live-DB зависимость либо явно
  классифицировать, затем повторить оба proof.
- [ ] Подключить обязательные function-census/callsite-catalog/post-zero gates в обычный CI после исправления;
  текущий `pnpm run ci` их не запускает и не является доказательством этих инвариантов.
- [ ] Удалить из активных migrations доступ как источник истины: новые
  `GRANT/REVOKE/CREATE POLICY/ALTER POLICY/CREATE ROLE` запрещены; legacy migration SQL не переписывается.
- [ ] Generator/audit обязан проверять обе стороны: relation есть, declaration нет; declaration есть, relation нет;
  плюс owners, role attributes, memberships, table/column/sequence/function ACL, policies и defaults.
- [ ] Универсальная birth wall для **каждой** managed table: default ACL закрыты у всех creators; tenant/clinical
  получает `ENABLE+FORCE RLS` и свои объявленные tenant/patient policies; platform/system/identity/closed/definer
  получает явно объявленную class wall.
- [ ] Невозможность классифицировать/наложить стену прерывает DDL/deploy. Позднее добавление tenant/patient
  признака через `ALTER TABLE` повторно проверяется. Event trigger защищён от рекурсии.
- [ ] Синхронизировать generated artifacts после global-admin/birth-wall изменений; три proof-транскрипта:
  defect red → fixed green → injected defect red again.

## Ф7 — DEV: наложение и живой прогон

- [ ] После доказанного DEV zero применить cluster-baseline, host mTLS readiness, port-context catalog и
  declaration-generated grants/RLS/seams — строго в этом порядке.
- [ ] Проверить все cluster logins из `pg_roles`, все SET-able roles, `PUBLIC` и каждую definer-функцию; исключения
  перечислить поимённо. Непрошедший context — no disclosure + SQLSTATE `42501` + PostgreSQL system log.
- [ ] Положительный контроль: реальные webapp patient/staff/global-admin и integrator сценарии работают через
  свои pools. Стена, которая не пускает приложение, не принимается.
- [ ] Собрать системный лог отказов; по каждому отдельно выбрать: удалить вызов, провести через порт/narrow seam
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
