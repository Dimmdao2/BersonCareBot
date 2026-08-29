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
в коде и канонической DEV-базе/схеме с мигратором, после чего DEV и TEST проходят заново. PROD-снимок и PROD не
используются в текущем проходе; одна `A → B0` миграция готовится только отдельным будущим этапом после явного
разрешения владельца.

## Актуальное состояние на 29.08.2026

Это единственный текущий чек-лист инициативы. Датированные чекбоксы ниже сохранены как хроника построения слоя и
не определяют статус taskdb.

- [x] B0, четыре runtime-login, transaction-bound context, FORCE RLS, узкие SECURITY DEFINER roots и
  declaration/reconcile применены на named DEV и named TEST.
- [x] Канонические `user_contacts`, разделение actor/subject, узкая роль integrator и исправленные seam-owner
  privileges находятся в текущем `feat`. Накопленный runtime-пакет до `cc13a4ed4` прошёл полный CI; последующие
  изолированные cleanup/deploy-wrapper изменения прошли targeted и независимые audit-gates. Штатный TEST deploy
  завершился `PASS` на `0e8060ab4`, а точечное исправление чтения настройки digest — вторым `PASS` на
  `01530c7e3`, вместе с declaration/reconcile и финальной tenant-wall проверкой; старые
  строки ниже про merge `92cf34ffa4` и TEST HEAD `484056ae5` больше не являются текущим состоянием.
- [x] Восстановление старого TEST backup, создание пустой TEST, disposable/A0 и historical migration replay
  отменены более поздними owner-решениями. Их нельзя выполнять; история остаётся только в Git и evidence.
- [x] TEST route/API/console-crawl после финального reconcile прошёл под настоящими owner-учётками: doctor
  `74/74`, patient `54/54`, global admin `21/21`, clinic admin `8/8`. Изменяющие действия врача, пациента и
  глобального администратора, а также CMS/patient media upload/delete подтверждены предыдущим связным проходом.
  Это не закрывает отдельно перечисленные anonymous/provider/host gates ниже.
- [x] **Оставшаяся аналитика классифицирована 29.08.** Это глобальный агрегат платформы без идентификаторов
  людей, доступный только global admin через именованный definer-root. Живой TEST: global admin получает `200`,
  doctor и patient — `403`; отдельной tenant-аналитики или лишней второй поверхности не найдено.
- [ ] **Анонимная публичная запись.** Живьём пройти полный public-booking путь без кабинетной сессии и доказать,
  что узкие roots дают только публичный каталог и создание записи, не tenant-данные.
- [ ] **Реальная доставка, общий gate с Track D.** Existing owner должен пройти messenger contact proof и код
  входа; запись на приём — реально доставить подтверждение и напоминание; scheduler — реально доставить operator
  digest и перенести следующий запуск после смены `digestTime`. Часть про operator digest закрыта живьём
  29.08: тик вернул `sent:true`, e-mail-строка создана в `02:24:30+03` и с первой попытки получила `sent` в
  `02:24:39+03`; открыты contact proof, запись/напоминание и изменение времени следующего запуска.
- [x] **Retention/rotation повторно доказана на TEST 29.08.** Почасовая DB-retention задача
  установлена. Запись «завершился успехом» 28.08 оказалась неполной: 29.08 точный разбор показал, что цель
  `app.context_nonce_ledger` падала, потому что генератор не восстанавливал явно отозванные schema-привилегии
  владельца. Генератор и декларация исправлены; named DEV reconcile и dry-run всех целей зелёные. После TEST deploy
  `0e8060ab4` штатный `run-internal-job.sh test db_journal_retention` завершился с кодом `0`, а
  `operator_job_status` записал `success` в `2026-08-29 01:58:55+03`. PostgreSQL logrotate
  активен (`weekly`, `rotate 10`) и имеет живые
  ротированные файлы; systemd/application stdout живёт в journald, где фактически применены
  `SystemMaxUse=2G`, `MaxRetentionSec=90day`, `SystemKeepFree=1G`, `ForwardToSyslog=no` (`18f75d8f7`).
- [x] **mTLS host proof.** На named DEV/TEST 28.08 штатный shared-readiness повторно доказал четыре
  положительных login-пути и отказы без сертификата, с неверным CN/login, сертификатом другой среды,
  non-TLS/socket и подменой сервера. Отдельный живой lifecycle-probe на TEST доказал отказ просроченного и
  подписанного чужим CA сертификатов, одновременную работу штатного и нового сертификатов, отказ нового
  подключения после revoke+CRL reload, необходимость drain уже открытого backend и точечное завершение этого
  backend. После rollback-контроля штатный сертификат продолжил работать, общий readiness снова дал PASS,
  четыре TEST-сервиса остались active, оба health endpoint и публичный TEST вернули успех.
- [x] **Декларация как единственный исполняемый источник.** Revision 10 строится только из текущей
  исполняемой матрицы; `revoke`, `OWNER_GATES_OPEN`, очередь code-change и пустые diagnostic/config-reader
  роли удалены (`3b7ea5860`). Function census и callsite/relation census входят в штатные
  privilege-гейты CI; historical disposable post-zero replay не возвращается. Права в schema migrations
  не выдаются.
- [x] **Архитектурный follow-up слоя доступа закрыт 29.08.** Каталожный census на named TEST дал
  `owners=43`, `requirements=1334`, `missing_or_partial=0`; анонимный каталог проходит только через узкие
  public-booking doors (целевая проверка `publicBookingDoors.unit.test.ts` зелёная); D15b/7a уже разделяет
  opaque actor/identity ref и medical-subject ref внутри канонического identity/DB-port seam. Полный физический
  redesign `platform_users` сюда не возвращается: он остаётся отдельной post-production задачей `#1086`.
- [ ] **PROD — только отдельным разрешённым этапом.** Подготовить одну атомарную `A → B0` миграцию и rollback;
  на PROD ничего не выполнять без нового явного разрешения владельца и проверки host `135.106.162.170`. До этого
  все активные PROD deploy/bootstrap/provision entrypoint закрыты fail-closed, чтобы старый C4-путь
  не мог обойти cutover.

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

## Историческая хроника исполнения — состояние на 13.08 и последующие коррекции

Разделы ниже объясняют происхождение решений и прошлых FAIL/PASS. Их checkbox-синтаксис сохранён как evidence;
текущий объём и статус задаёт только раздел «Актуальное состояние на 28.08.2026» выше.

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
- [x] **ОТМЕНЕНО, НЕ ВЫПОЛНЯТЬ:** возврат именованной TEST из pre-error backup заменён работой на текущих named
  DEV и TEST. Старый snapshot больше не является действием: именованная TEST уже
  ушла вперёд: physical cutover D15b/6 задеплоен merge `92cf34ffa4`, migration verification webapp `25/25` +
  integrator `1/1` — см. [`WORK_ORDER.md` D15b/6](../UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md). Возврат
  pre-error backup сегодня откатил бы работающее состояние; новый порядок — текущая named DEV → текущая TEST,
  без restore/replay (`AGENTS.md` §1b/3a, taskdb `#1085`).
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
- [x] Регулярная retention/rotation доказана живьём 28.08: почасовой DB-retention тик завершился успехом;
  PostgreSQL logrotate хранит ротированные файлы, journald ограничен `2G`/`90day` и не дублируется в syslog
  (`18f75d8f7`, см. актуальный чек-лист выше).
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
- [x] **ОТМЕНЕНО, НЕ ВЫПОЛНЯТЬ:** зависимость TEST legacy-drop от восстановления pre-error TEST заменена
  проверкой текущего состояния named TEST;
  выполнять старый restore нельзя. Проверка отсутствия legacy остаётся частью живого TEST gate Ф8 ниже и
  [`WORK_ORDER.md` D15b/6](../UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md).
- [x] Оставшаяся аналитика классифицирована как global-admin-only агрегат платформы без идентификаторов людей;
  живой TEST даёт global admin `200`, doctor/patient `403`.

## Ф3 — точка ноль

- [x] Revoke-only generator снимает database/schema/table/column/sequence/function/type/large-object/FDW ACL,
  policies, memberships и default privileges, закрывает `PUBLIC`, не выдавая ни одного нового права.
- [x] Zero-state acceptance на одноразовом PostgreSQL краснеет после каждого повторно внесённого rogue grant,
  policy, membership и default privilege.
- [x] Zero/apply механизм target-neutral: один явно заданный target, соседняя БД сохраняется побайтно и
  семантически, `DROP/CREATE DATABASE` отсутствует; disposable acceptance зелёный.
- [x] Минимальный именованный allowlist точки ноль сформирован: постоянное исключение — PostgreSQL superuser;
  migrator получает возможность входа только в окно deploy и возвращается в стационарный no-login/no-membership
  режим. Каталожные и fault-injection проверки входят в declaration/reconcile.
- [x] DEV offline: применить legacy migrations → zero; каталогом доказать `PUBLIC` closed, runtime login/roles без
  data ACL/membership, default privileges closed, policies absent, permanent `BYPASSRLS=0`.
- [x] Негативный контроль DEV: все `16` достижимых login→role сочетаний без port context дали `42501`; все
  `236` runtime definer + `6` context-helper functions дали `42501`, а PostgreSQL journal записал физический
  login, function и statement. Остальные `12` definer functions runtime-ролям не исполнимы; `PUBLIC` ACL = `0`.

## Ф4 — минимальная модель logins, roles и seam owners

- [x] Зафиксированы четыре runtime login: webapp patient/staff/global-admin и integrator; migrator — только deploy.
- [x] Для каждого runtime login/role/seam owner зафиксирована потребность в единой declaration; пустые
  diagnostic/config-reader роли и code-change очереди удалены (`3b7ea5860`), role crawl/reconcile зелёные.
- [x] Global-admin login: отдельные mTLS certificate/pool, только platform/global membership, mandatory human
  global-admin context + 2FA; без patient/staff/clinical membership и без medical access.
- [x] Staff login не может `SET ROLE` global-admin; global-admin login не может `SET ROLE` staff/patient/clinical;
  двусторонняя изоляция membership проверяется catalog test.
- [x] Operator-действия идут через webapp port; отдельного runtime pool/login для `saas_operator`/`saas_diag`
  нет. Пустые operational/diagnostic роли удалены из исполняемой declaration (`3b7ea5860`).
- [x] Integrator target memberships ограничены request, narrow resolver, delivery worker, scheduler,
  tenant-service и no-tenant service; все SET-only/non-transitive.
- [x] Полный declaration/census/reconcile сверяет logins, memberships, owners и exact access surface в обе
  стороны; named DEV и TEST role crawl прошёл после финального reconcile 28.08.

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
- [x] Host target provisioning и lifecycle доказаны на named DEV/TEST 28.08: exact first-match HBA/CN/login,
  CA/CRL, overlap сертификатов, reload, revoke и обязательный drain уже открытого backend. Private keys остаются
  в env соответствующего порта.
- [x] Live proof 28.08 подтвердил positive patient/staff/global-admin/integrator pools и отказы при
  wrong/missing/expired/revoked/foreign-CA certificate, неверном CN/login, cross-env, non-TLS/socket и server
  impersonation; после rollback общий readiness снова PASS.

## Ф6 — декларация, generator и стена рождения

- [x] Generator умеет сначала оптом отзывать ACL у `PUBLIC`, runtime login и roles, затем создавать exact
  grants/policies одной транзакцией.
- [x] Из executable declaration удалены `revoke`, `OWNER_GATES_OPEN`, code-change очередь и пустые
  diagnostic/config-reader роли; revision 10 строится только из актуальной выдаваемой матрицы (`3b7ea5860`).
- [x] Механизм relation/function/capability matrix и fault injection существует: ручной extra grant/policy/
  membership делает disposable catalog audit красным.
- [x] Current acceptance возвращён в green без зависимости от именованной TEST: function census, named-root
  callsite catalog и target-only post-zero replay проходят на disposable PostgreSQL 16 fixture.
- [x] Function-census, callsite/relation census, generated-artifact и migration-order проверки подключены
  отдельными параллельными GitHub jobs; они не добавлены последовательным хвостом к каждому micro-fix.
- [x] Исправить ordinary DEV migration entrypoint под новую схему: `migrate-dev.sh` не должен требовать
  удалённый `bcb_webapp_dev_user`/`DATABASE_URL`; мигратор получает повышенные права только на время deploy,
  затем declaration reconcile и catalog audit возвращают стационарное deny-by-default состояние.
  - [x] Отдельный повторяемый reconcile уже выполняет declaration apply + environment/catalog audit одной
    транзакцией без legacy/zero/login cleanup; два живых повтора DEV и disposable drift-repair сохранили данные.
  - [x] Перевести на deploy-only `bcb_dev_migrator` сам schema/data migration шаг и вызвать reconcile из
    `migrate-dev.sh`; до этого весь пункт остаётся открытым.
- [x] Права удалены из active migrations как источник истины: static gate запрещает новые
  `GRANT/REVOKE/CREATE POLICY/ALTER POLICY/CREATE ROLE`, а declaration/reconcile остаётся единственным
  исполняемым источником. Historical SQL не переписывается.
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
- [x] Внутренний live census действий staff/clinic, global-admin, patient и integrator завершён: финальный
  route/API/console crawl 28.08 дал doctor `74/74`, patient `54/54`, global admin `21/21`, clinic admin `8/8`;
  связный проход подтвердил основные mutation-пути и media upload/delete. Анонимный public booking и реальные
  provider-доставки вынесены отдельными открытыми пунктами актуального чек-листа, поэтому не скрыты этой галочкой.
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
**Историческая correction 17.08 «DEV не green» закрыта внутренней приёмкой 28.08.** Doctor/patient/global-admin/
clinic-admin crawl, основные mutations, workers, scheduler, declaration/reconcile и TEST deploy прошли. Не
дублируемые здесь external gates existing-owner messenger proof и реальных доставок ведутся в единственном
актуальном чек-листе в начале файла.

### Состояние на 17.08 вечер — передача работы после смерти оркестратора

Прежний оркестратор (codex) умер на исчерпании лимита около 14:44. План отставал от репозитория на четырнадцать
часов: последняя правка файла была 01:41, вся работа после неё сюда не заносилась. Ниже — установленные факты,
проверенные против реальности, а не по отчётам исполнителей.

- **Миграция именованной DEV реально прошла.** `migrate-dev.sh --execute` отработал 17.08 в 14:41–14:42.
  Проверено по базе, не по логу (лог прогона не сохранялся): `drizzle.__drizzle_migrations` содержит `20` записей
  и `meta/_journal.json` — тоже `20`, то есть `pending=0`; хеш записи `1800000019000` побайтово совпадает с
  `sha256sum` файла `0019_*.sql` текущего HEAD; четыре функции шага `0019` принадлежат
  `app_seam_reminder_materialization_owner`; роль `bcb_dev_migrator` вернулась в стационарное состояние
  (`rolcanlogin=false, bypassrls=false, inherit=false, password IS NULL, memberships=0`). Полуприменённого
  состояния нет: схема — B0 baseline плюс 19 webapp-forward, integrator-forward ноль.
- **Три потока влиты и приняты:** обёртка миграции с гардом на пять legacy-флагов `--rollback-only`
  (`3978a940d`, аудит PASS `56860c489`), ложное «устройство не поддерживается» на медленном DEV
  (`8330cc725`, аудит PASS `302958f2e`), контракт booking lifecycle (`041092b27`).
- **Четвёртый поток остановлен на FAIL и был потерян.** Коррекция B0 — 14 коммитов, 258 файлов,
  `+5507/−37237` — жила только в отдельном клоне вне репозитория; в главном репозитории этих объектов не
  существовало. Спасена 17.08 в ветку `rescue/b0-named-dev-db-20260817` (tip `15947cb75`). Последний
  независимый аудит — `docs/REPORTS/B0_NAMED_DEV_DB_CORRECTED_REAUDIT_ONE_2026-08-17.md`, вердикт **FAIL**,
  две открытые находки: гейт B0 не fail-closed (`0/4` соседних мутаций убито, `check-b0-migration-baseline.mjs`
  отдаёт `exit 0`) и перепись недосчитывает (AST даёт `122` объявления вместо `121`, `required` не 83, а ≥84).
  **Обе закрыты и цепочка влита 17.08 — `a3c78e7d6`.** Перепись подтверждена независимым методом (исполнение
  каждого файла в песочнице со заглушками вместо разбора синтаксиса): 35 файлов, 122 объявления, `required` 84,
  совокупно 93, расхождений по файлам ноль. Гейт: первый круг закрыл четыре названные формы, но **ослабил
  родителя** — форма `const executable='psql'; spawnSync(executable, […])` перестала ловиться; второй круг
  вернул её и закрыл остальной список (команда в переменной через `exec`/`execSync`, абсолютный путь,
  рецепт Makefile, `sh -c`, образ по отпечатку в compose и в воркфлоу, `pg_restore`). Матрица самотестов
  больше не зависит от способа вызова: межпроцессный замок, обычный параллельный запуск даёт `17/17` вместо
  прежних недетерминированных 11–13. Конфликт при слиянии был ровно один —
  `reminder-materialization-boundary.test.mjs`, модифицирован на `feat` и удалён в цепочке; победило удаление,
  потому что аудит требовал убрать его как проверку по тексту исходника.
  **Остаётся открытым и объявлено, а не скрыто:** `pg_dump` гейтом не покрыт; ни одна из двух матриц
  самотестов не вызывается ни линтером, ни сборкой, ни воркфлоу — барьер, который никто не запускает.
- **DEV-стек стоял.** С 12:42 (SIGTERM) до вечера 17.08 не работало ничего: ни webapp на `5200`, ни
  integrator, ни планировщик, ни воркеры. Стек поднят заново 17.08.
- **Единственный живой отказ DEV найден, исправлен и проверен живьём — `materialize-wake`.** После подъёма
  стека маршрут падал `500` на каждом тике планировщика. Причина, воспроизведённая через порт:
  `permission denied for table user_reminder_occurrences` внутри `app.read_patient_reminder_materialization_snapshot`.
  Дефект оказался НЕ в декларации: три корня материализации читали строку целиком (`SELECT candidate.*`,
  `SELECT patient.* INTO v_patient`), звёздочка разворачивается на разборе во все колонки, и исполнитель
  требовал привилегию на каждую — включая исход доставки (`sent_at`, `failed_at`, `delivery_channel`,
  `delivery_job_id`, `error_code`) и ПДн/медицину пациента (`role`, `birth_date`, `gender`, `height_cm`,
  `weight_kg`, `session_epoch`, `blocked_reason`). Выдать их шву напоминаний означало бы штамповать текущее
  использование, поэтому применена вторая ветка пункта 9 порядка владельца: убрано лишнее чтение. Forward-миграция
  `0020_patient_reminder_materialization_narrow_column_reads.sql` сужает три тела до явных списков колонок,
  тела скопированы из `0019` побайтово. Независимый аудит —
  `docs/REPORTS/REMINDER_MATERIALIZATION_NARROW_READS_AUDIT_2026-08-17.md`, вердикт **PASS**: механический diff
  тел даёт ровно три ханка, достаточность колонок доказана по каждому корню в одноразовом кластере PG16,
  попытка «расширить грант, чтобы позеленело» проверена и валит набор. Применено на именованной DEV:
  `migrate-dev.sh --preflight` → PASS с откатом, `--execute` → COMMIT, `pending=1 total=21`, declaration
  reconcile и catalog audit зелёные. Живая проверка: `POST /api/integrator/patient-reminders/materialize-wake`
  отвечает `200` (пять тиков подряд); все 441 отказ в логе относятся к состоянию до миграции.
- [x] **Тот же класс — ещё три живых отказа у пациента, найдено аудитом 17.08, закрыто до финальной приёмки.** Владелец шва
  `app_seam_patient_self_actions_owner` сидит на поколоночных грантах, а тела читают строку целиком:
  `app.touch_current_patient_program_item` → `treatment_program_instance_stages` (нет 9 колонок из 15),
  `app.complete_current_patient_program_item` → `treatment_program_instance_stage_items` (нет 6 из 16) и те же
  9 на стадиях. Оба корня вызываются из живого кода (`pgTreatmentProgramInstance.ts`, `pgProgramActionLog.ts`):
  пациент открывает или отмечает элемент своей программы и получает `42501`. Механизм подтверждён прогоном в
  одноразовом кластере на реальном отношении и реальном гранте. Это не новый скоуп: пункт Ф7 требует полного
  смыслового прохода действий пациента, а это действие пациента не работает. Остальные восемь площадок того же
  приёма `alias.*` проверены механически и безопасны — их владельцы имеют SELECT на все колонки.
- **Разовый ремонт двух осиротевших правил напоминаний — СДЕЛАН 17.08.** Сначала исправлена асимметрия
  скрипта `reconcile-dev-patient-reminder-orphans.ts`: `--execute` шёл через транзакцию порта, а сухой прогон
  читал мимо неё и отвергался стенами, то есть предпросмотр был невозможен, а запись прошла бы. Правка —
  `f5485382f` (ветка `wt/reconcile-orphan-dryrun-20260817`), доказательство `…portSymmetry.test.ts`, 4 теста,
  подтверждено инъекцией отказа. Затем на именованной DEV: сухой прогон вернул ровно ожидаемые
  `wp-122c3af1-b81f-4602-b2e4-5bb34d84f0eb` и `wp-78d3c36d-a390-4dbc-88ea-3b94d6f2f038`, после чего `--execute`
  погасил ровно их (`reconciled` совпал с `candidates`). Запись узкая и обратимая: `is_enabled=false` при
  `platform_user_id IS NULL` в пределах одной организации, с проверкой точного набора идентификаторов.

## Ф7a — перенесено 17.08 из ночного плана 26.07 (архитектура слоя доступа)

Три требования владельца из `NIGHT_PLAN_2026-07-26.md` (раздел A) относятся к этому слою и с 30.07 не имели
живого дома. Ночной план закрыт указателями сюда; текст требований сохранён дословно, ID оригинала указан.
Ни одно из трёх не входит в критерий «DEV green» Ф7 — они идут отдельным этапом и не задерживают TEST.

- [ ] **A-1 (ориг. C1) Отдельный владелец definer-функций вместо bypass, плюс структурный allowlist.**
  Владелец: «думаю надо делать». Остаток на 30.07: группы A и C privilege sweep закрыты, группа B не
  реализована, D частична; отдельный владелец для 28 definer-функций и структурный (не перечислением)
  allowlist не сделаны. Пересекается с работой 17.08 по переписи всех 384 функций — при подъёме пункта
  сначала свериться с `runs/orchestration/full-function-surface-*` и `function-return-shape-*`, чтобы не
  делать перепись дважды.
- [ ] **A-2 (ориг. C2) Отдельная поверхность публичного чтения.** Владелец: изучить, каким действиям она
  действительно нужна, и не отдавать публичные данные под системными ролями. Форма по внешней практике —
  отдельная публичная проекция плюс выделенная read-only роль; политика поверх смешанной таблицы недостаточна
  (RLS построчна, скрытые каналы описаны самой PostgreSQL). Материал в репозитории уже есть: роль
  `app_config_reader` написана в `deploy/postgres/s5-config-reader-runtime.sql`, но **в действующую
  декларацию не входит ни разу** — то есть лежит написанной и не работает.
- [ ] **A-4 (ориг. C3) Перестройка `platform_users`.** Владелец: «ну значит переделывать». Практика:
  не навешивать RLS на существующую таблицу, а вынести опознание человека из-под RLS-поверхности (приватная
  схема + выделенная роль) либо отдать 2–3 аксессора, возвращающих скаляры, а не строки; PII вынести в
  сателлит. Обязательное ограничение: сохранить работающими ~40 pre-auth чтений и ~8 pre-auth записей.
  Состояние 17.08: стена поставлена поверх старой конструкции (`rls: 'force'` и девять политик в декларации),
  самой перестройки не было — то есть пункт открыт полностью, а не наполовину.

## Ф8 — финальная TEST-репетиция после зелёного DEV

OWNER-REPLACED 16.08.2026: TEST запрещено трогать до полного зелёного DEV-прохода. После него `deploy-test`
выполняет один раз переход текущей именованной TEST в финальное состояние; механизм этого разового перехода затем
удаляется. PROD и production dump в эту операцию не входят.

- [x] Все Ф0–Ф7, относящиеся к рабочему DEV и внутреннему TEST-пакету, завершены; branch запушен, накопленный
  CI и targeted/audit gates зелёные, финальный deploy `7f29df6a1` прошёл PASS. Аналитика и Ф7a остаются отдельными
  открытыми follow-up выше, а не скрыты этой строкой.
- [x] Измеренный список database и cluster login/role показан и утверждён владельцем 14.08; три базы и legacy-роли
  удалены после снятия object dependencies. Повторный read-only cluster census 28.08 командой
  `sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev ... SELECT ... FROM pg_roles`
  показывает только текущие BCB DEV/TEST roles/logins и сохранённые Brain/StoryLama principals; старых четырёх
  независимых ролей из промежуточного статуса больше нет.
- [x] Brain/TaskDB, StoryLama DEV+PROD и BersonCareBot DEV+TEST сохранены вместе с нужными ролями/логинами;
  cluster-census и cross-database negatives входят в финальный host proof. Локальная BersonCareBot PROD не
  используется и не создавалась.
- [x] Не обнуляя и не пересоздавая TEST, её текущее состояние переведено через штатный `deploy-test`;
  не собирать отдельную A0-базу и не восстанавливать production dump. После успешного перехода удалить разовую
  переходную ветку из `deploy-test`: дальнейший deploy применяет только post-B0 forward-миграции. Финальный
  deployment `7f29df6a1` применил только B0/post-B0 path и завершился PASS.
- [x] Migration ledger, отсутствие legacy/лишних grants, positive/negative controls обоих портов, страницы,
  основные действия, services и workers доказаны на TEST. Реальные provider-доставки только owner-аккаунтам
  остаются отдельным открытым пунктом актуального чек-листа и Track D.
- [ ] **Публичная запись без входа — пройти живьём (ПЕРЕНЕСЕНО 17.08 из `NIGHT_PLAN_2026-07-26.md` H-5, карточка
  #805).** Владелец 17.08: «надо пройти». Открыть ссылку на TEST как посторонний без учётной записи, создать
  записи («конечно, можно и не одну»), проверить попадание в нужную клинику и отсутствие чужих данных.
  Разрешение владельца получено ещё 26.07, само действие не выполнялось ни разу — это единственный путь
  человека без доступа, и он ни разу не проверен живьём. Проверять после того, как §6 `PRE_PRODUCTION_TODO.md`
  (доказательство владения контактом) будет учтено, чтобы не проверять поведение, которое всё равно меняется.
Регламент: любой новый TEST-дефект исправляется в коде и канонической DEV-базе/схеме с мигратором; затем
повторяются затронутый DEV-сегмент и TEST-гейт. Это процедура, а не незакрытая задача.

## Ф9 — одна A → B0 миграция на чистом PROD-дампе

- [x] **ОТМЕНЕНО, НЕ ВЫПОЛНЯТЬ:** репетиция на свежем/чистом PROD dump заменена owner-каноном named DEV → named TEST
  без production dump, disposable/A0 базы и historical replay (`AGENTS.md` §1b/3a; taskdb `#1085`: «No
  production dump and no local BCB PROD»). Возвращать dump/full-reset путь из старого плана запрещено.
- [ ] После принятой репетиции отдельно подготовить production operation/rollback.
Регламент: на PROD ничего не выполнять без нового явного разрешения владельца и подтверждения host
`135.106.162.170`. Это ограничение будущего этапа, а не отдельная незакрытая работа.

## Что не считается готовностью

Документ, audit PASS, generated SQL, disposable DB или зелёный CI сами по себе не закрывают live DEV/TEST.
Пункт закрывается только evidence той же природы: код — tests/fault injection; каталог — read-only catalog proof;
живой путь — реальный runtime; owner-gated этап — прямое решение владельца.
