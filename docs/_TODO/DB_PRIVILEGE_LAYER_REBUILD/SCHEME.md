# SCHEME — целевая схема слоя прав БД BersonCareBot

Источник схемы — решения владельца в [`OWNER_DECISIONS.md`](../../OWNER_DECISIONS.md), раздел «Права БД,
роли и стены». Состав входов и runtime-ролей принят из [`evidence/26-roles-and-logins-from-need.md`](evidence/26-roles-and-logins-from-need.md),
состав владельцев definer-швов — из [`evidence/25-definer-seams-without-bypassrls.md`](evidence/25-definer-seams-without-bypassrls.md).
Это целевая конструкция, а не описание или diff текущего каталога.

## 1. Как будет устроен доступ

У базы ровно два прикладных порта: **webapp** и **integrator**. Порт здесь — единственная граница приложения,
которая владеет пулом соединений, выбирает допустимый login для входа, после прикладной авторизации переключает
соединение на точную runtime-роль, подписывает контекст известного принципала и устанавливает его в PostgreSQL.

У webapp один порт и два пула: login персонала и login пациента/предсессионного запроса. У integrator один порт
и один пул. Мигратор — отдельный канал деплоя, не порт и не runtime. Глобальный администратор, фоновые задания,
медиа, доставка, планировщик, диагностика, телеметрия и чистка журналов отдельных подключений не открывают: их
работа входит через один из двух портов и выполняется после `SET ROLE` в роль с нужным набором прав.

Результат конструкции: пароль login разрешает только установить соединение. Он не сообщает базе, кто действует,
не открывает таблицы и не заменяет ключ порта. Данные появляются только при одновременном совпадении четырёх
условий: вход через правильный порт, действительная подпись контекста, точная runtime-роль и точная политика
конкретной таблицы.

Норма владельца:

> «БД не пускает мимо порта без ключа, а ключ даётся только портом. И порт автоматически не пускает без знания
> кто это».

## 2. Ключ и подписанный контекст

### 2.1 Сквозной механизм

1. Ключ `DB_PRINCIPAL_SIGNING_SECRET` живёт только в env webapp и integrator. Он не хранится в таблице, не
   передаётся клиенту и не выдаётся login/runtime-ролям.
2. Порт сначала устанавливает прикладную личность и разрешённый вид действия. Неопознанному запросу не выдаётся
   обычное tenant-соединение. Предсессионные действия выполняются только через поимённые auth/resolver seams,
   чей контракт не даёт вызывающему прямого доступа к таблицам.
3. Порт подписывает короткоживущий контекст: вид принципала, его `organization_id`, `patient_user_id` или
   `integrator_user_id`, разрешённый scope/назначение, срок действия и одноразовый nonce. Контекст привязывается к
   конкретному backend-соединению.
4. `app.install_signed_context(...)` как узкая `SECURITY DEFINER`-функция проверяет HMAC, срок, nonce и привязку
   к соединению; только после этого устанавливает контекст. Повтор nonce отвергается.
5. Политики получают значения только через контекстные accessors. `app.current_org_id()`,
   `app.current_patient_user_id()` и `app.current_integrator_user_id()` обязаны **RAISE с SQLSTATE `42501`**,
   если подписанного контекста нет, он истёк, не совпадает с видом роли или не подходит запросу. Возврат `NULL`
   запрещён: это превращает отказ в тихий ноль.
6. После транзакции порт освобождает/сбрасывает контекст до возврата соединения в пул. Следующий запрос не может
   унаследовать личность предыдущего.

Таблицы ключа, nonce и установленного контекста не имеют ACL для login- и tenant/runtime-ролей. Их читает или
меняет только `app_seam_context_owner` по именованным колонкам и политикам, привязанным к текущему backend.
Поэтому роль внутри tenant-сессии не может ни узнать ключ, ни вставить себе контекст, ни продлить его.

Украденный пароль login без ключа даёт соединение с нулевой табличной поверхностью. Злоумышленник не может создать
валидную подпись; `SET ROLE` само по себе данных не открывает; первый контекстный accessor бросает `42501`, строки
не выдаются, PostgreSQL пишет ошибку в серверный лог.

### 2.2 Два обязательных изменения

- Контекстные accessors перестают возвращать `NULL` при отсутствии/несовпадении контекста и начинают бросать
  `42501`.
- Окружающий `bootstrap`-принципал перестаёт получать соединение с прямой табличной поверхностью. До установления
  личности доступны только точные `EXECUTE` на предсессионные seams; у предсессионного login нет табличных прав.

## 3. Логины: четыре входа на среду

| Login | Точка входа | Что ему разрешено |
|---|---|---|
| `<env>_migrator` | канал деплоя | schema/DDL только в окне миграции; не участвует в runtime |
| `<env>_webapp_staff` | пул персонала webapp | вход в допустимые webapp runtime-роли через `SET ROLE`; прямых прав на данные нет |
| `<env>_webapp_patient` | пул пациента и предсессионных вызовов webapp | `EXECUTE` точных pre-session seams; после опознания — `SET ROLE app_patient`; прямых прав на таблицы нет |
| `<env>_integrator` | пул integrator | вход только в три integrator runtime-роли через `SET ROLE`; прямых прав на данные нет |

`postgres` остаётся суперпользователем с сильным production-паролем, но не считается прикладным login. У
глобального администратора отдельного login нет: он входит через webapp и после прикладного gate переключается в
`app_platform_settings` с подписанным platform-контекстом.

Login состоит непосредственно только в ролях своего порта. Runtime-роли не состоят друг в друге и имеют
`NOLOGIN`; транзитивных путей вроде tenant-role → platform-role нет.

## 4. Runtime-роли: десять различных наборов прав

Все десять ролей — `NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`. Табличные,
колоночные, функциональные и схемные права перечисляются поимённо в декларации; права одного набора не наследуются
соседним набором.

| Роль | Порт | Scope | Отличительный набор прав |
|---|---|---|---|
| `app_staff` | webapp | `ORG` | лечебная и организационная работа только своей клиники: пациенты, приёмы, расписание, услуги, программы и назначения; без platform-global и без управления деньгами клиники |
| `app_patient` | webapp | `OWN` | только свои записи, программа, платежи и переписка в своей организации; профиль — только поимённые колонки; тесты — только включённые в его программу, без внутренних комментариев и служебных пометок |
| `app_clinic_billing` | webapp | `ORG` | счета, подписка и тариф только своей клиники после gate управления клиникой; эти права не входят в каждую staff-сессию |
| `app_platform_settings` | webapp | `GLOBAL` | организации, тарифы, счета и платформенный каркас; медицина и клинические данные исключены |
| `app_worker` | webapp | `NONE` | фоновые задания webapp, retention и чистка журналов; без прав обычного сотрудника клиники |
| `app_operational_media_worker` | webapp | `NONE` | точные операции над media files, заданиями транскода и технической статистикой воспроизведения |
| `saas_telemetry_operator` | webapp | `GLOBAL` | только поимённые функции телеметрии изоляции; прямых табличных прав нет |
| `app_operational_delivery_worker` | integrator | `NONE` | чтение/изменение точных очередей доставки и вызов поимённых функций materialization/delivery |
| `app_operational_scheduler` | integrator | `NONE` | idempotency, scheduler ticks, incidents и probes; не получает право изменять очередь как delivery worker |
| `app_operational_diagnostic` | integrator | `NONE` | только чтение диагностической проекции; никаких queue mutations |

Недоказанное право не выдаётся. Если живой прогон получает `42501`, решение принимается по конкретному отказу:
удалить обход порта, выдать точное право, перенести операцию в seam либо признать путь лишним. Расширение роли
«на всякий случай» запрещено.

## 5. Владельцы 35 definer-швов

132 функции разделяются по назначению между 35 владельцами. Каждый владелец имеет форму
`NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`, не имеет членов и не
владеет таблицами. Он владеет только функциями своего шва и получает только нужные операции на поимённых колонках
своих таблиц. `EXECUTE` функции выдаётся точным caller-ролям, не `PUBLIC` по умолчанию.

| # | Owner | Шов | Функций | Ограниченная поверхность |
|---:|---|---|---:|---|
| 1 | `app_seam_context_owner` | подписанный контекст | 6 | nonce, signing secret и principal context; доступ привязан к backend |
| 2 | `app_seam_password_auth_owner` | парольный вход | 9 | password credentials, ALTCHA/rate-limit, минимальные identity/settings колонки |
| 3 | `app_seam_email_otp_owner` | email OTP | 8 | challenges/cooldowns, доставка OTP, минимальная регистрация пользователя |
| 4 | `app_seam_passkey_owner` | passkey | 9 | passkey accounts, challenges и credentials |
| 5 | `app_seam_phone_binding_owner` | привязка телефона/канала | 3 | channel bindings и активный phone-history interval |
| 6 | `app_seam_self_security_owner` | self-security/session epoch | 4 | PIN и поимённое изменение session epoch |
| 7 | `app_seam_identity_lookup_owner` | предсессионный identity lookup | 2 | ID и предпочтённый auth-канал, без адресной книги |
| 8 | `app_seam_patient_invite_owner` | patient invite | 7 | invite/proof/bearer, enrollment и минимальная identity поверхность |
| 9 | `app_seam_org_invite_owner` | staff organization invite | 2 | token lookup/accept и атомарное membership creation |
| 10 | `app_seam_specialist_provision_owner` | первая организация специалиста | 5 | атомарный provisioning организации, владельца и снимка справочника |
| 11 | `app_seam_public_slug_owner` | public slug resolver | 2 | active slug/directory/organization columns |
| 12 | `app_seam_public_booking_owner` | public booking resolver | 1 | active branch/service/availability/mapping columns |
| 13 | `app_seam_dedicated_bot_owner` | dedicated bot resolver | 2 | active bot binding без выдачи credential surface caller-у |
| 14 | `app_seam_payment_webhook_owner` | payment webhook resolver | 3 | provider identifiers, invoice и точный provider setting |
| 15 | `app_seam_delivery_scope_owner` | delivery scope resolver | 1 | organization scope точной queue/reminder/broadcast/incident строки |
| 16 | `app_seam_patient_program_resolver_owner` | patient program resolver | 1 | program + active enrollment, суженные подписанным patient id |
| 17 | `app_seam_settings_preauth_owner` | preauth settings | 5 | allowlist публичных provider/VAPID ключей |
| 18 | `app_seam_settings_integrator_owner` | integrator settings | 5 | allowlist runtime-настроек integrator |
| 19 | `app_seam_settings_runtime_owner` | runtime settings | 5 | allowlist server/public/patient settings |
| 20 | `app_seam_org_commerce_owner` | SaaS/org commerce | 8 | tariff/access/quota/billing операции, суженные организацией |
| 21 | `app_seam_patient_org_projection_owner` | patient org projection | 2 | активные организации и entitlements текущего пациента |
| 22 | `app_seam_patient_booking_owner` | patient booking | 2 | appointments/booking projection текущего пациента |
| 23 | `app_seam_patient_self_actions_owner` | patient self actions | 3 | timezone, plan-open и support activity только текущего пациента |
| 24 | `app_seam_reminder_patient_owner` | patient reminder actions | 8 | occurrence/rule/settings/journal текущего пациента |
| 25 | `app_seam_reminder_materialization_owner` | reminder materialization | 5 | scheduler scan и точные materialization operations |
| 26 | `app_seam_reminder_specialist_owner` | specialist reminder | 4 | specialist task и одна transaction-local queue row |
| 27 | `app_seam_reminder_appointment_owner` | appointment reminder | 2 | appointment и одна transaction-local queue row |
| 28 | `app_seam_reminder_email_cooldown_owner` | email cooldown | 2 | exact cooldown marker columns |
| 29 | `app_seam_telemetry_patient_owner` | patient telemetry | 2 | analytics текущей организации и пациента |
| 30 | `app_seam_telemetry_media_owner` | media telemetry | 2 | media organization и resolution aggregates/events |
| 31 | `app_seam_telemetry_operator_owner` | operator telemetry | 5 | named global incident/delivery telemetry columns |
| 32 | `app_seam_catalog_public_owner` | public booking cities | 1 | только активные строки публичного справочника |
| 33 | `app_seam_catalog_admin_owner` | clinical measure kinds | 3 | нормализованные list/save/upsert справочника |
| 34 | `app_seam_org_directory_owner` | platform org directory | 1 | member identity/role/status для platform-only caller |
| 35 | `app_seam_telemetry_exclusion_owner` | telemetry exclusion | 2 | exact test-account identifiers и enrollment lookup |

`saas_system_health_owner` — отдельный уже выделенный health-шов и в число 35 не входит. Он также
`NOLOGIN NOBYPASSRLS`, не имеет членов, получает named-column `SELECT` только на curated health-таблицы и
поимённые политики `TO saas_system_health_owner`. Один общий владелец 132 функций больше не существует как
источник общей силы. Если техническая роль `app_owner` сохраняется для перехода, она `NOBYPASSRLS` и не имеет
широкой табличной или функциональной поверхности.

## 6. Стены по классам таблиц

Норма владельца:

> «Все таблицы с любыми данными клиник/докторов и пациентов должны быть обязательно закрыты стенами и клиники и
> пациента, с правильным доступом глобал админа. Как и системные таблицы платформы должны нести стену своей роли».

Стена каждой таблицы состоит одновременно из трёх слоёв: **GRANT на точную операцию/колонки · `ENABLE ROW LEVEL
SECURITY` + `FORCE ROW LEVEL SECURITY` · policy на точную роль с точным строковым предикатом**. Отсутствие любого
слоя означает отказ, а не fallback к более широкой роли.

### 6.1 Данные клиник, докторов и пациентов

К этому классу относятся строки, принадлежащие организации/клинике, специалисту или пациенту напрямую либо через
scoped parent: клинические данные, приёмы, программы, назначения, коммуникации, расписание, услуги, memberships,
файлы и связанные события.

- **Стена клиники:** policy `TO app_staff`/`TO app_clinic_billing` требует
  `row.organization_id = app.current_org_id()` либо то же равенство через объявленный scoped parent. Операции и
  колонки различаются между staff и billing.
- **Стена пациента:** отсутствие patient-policy означает полный запрет пациенту. Если пациентский доступ нужен,
  policy `TO app_patient` одновременно требует организацию и владельца:
  `row.organization_id = app.current_org_id()` **AND** `row.patient_user_id = app.current_patient_user_id()` либо
  доказанную связь через enrollment/program/appointment. Дополнительное бизнес-условие остаётся внутри policy:
  например, пациент видит только тест, включённый в его программу.
- **Глобальный администратор:** на клинических/медицинских таблицах policy для `app_platform_settings` отсутствует.
  Его корректный доступ ограничен платформенным каркасом, организациями, тарифами и коммерцией; «глобал админ не
  лезет в медицину, пока так».

Так одна и та же tenant-таблица несёт обе стены: организация ограничивает любую арендную видимость, а пациентская
policy дополнительно ограничивает видимость конкретным человеком. «Стена пациента» не означает, что пациенту
положен доступ к каждой таблице; она означает точный patient-предикат там, где доступ объявлен, и полный отказ там,
где он не объявлен.

### 6.2 Системные таблицы платформы

Организации как платформенные объекты, тарифы, SaaS billing/policies, глобальные настройки и platform directory
имеют RLS+FORCE и policy только на свою точную роль или seam owner. `app_platform_settings` требует подписанный
platform-контекст, установленный webapp-портом после gate глобального администратора. Само членство login в роли
не открывает строки. Tenant-роль не получает эти таблицы как побочный эффект staff-доступа.

### 6.3 Операционные и интеграторские таблицы

Очереди, idempotency, scheduler state, media jobs, telemetry и health имеют RLS+FORCE и policy на точную
служебную роль либо exact seam owner. Delivery, scheduler и diagnostic не делят общий широкий policy. Если
операция уже знает организацию или queue id, policy сужается этим значением и подписанным контекстом. Глобальная
техническая агрегация получает только явное исключение из следующего раздела.

### 6.4 Ключ, контекст и authentication secrets

Nonce/context/signing, password/OTP/passkey и invite secret surfaces не имеют ACL для runtime-ролей. Их стены —
RLS+FORCE, named-column grants и policies только на соответствующий `app_seam_*_owner`; наружу выходит лишь
результат фиксированной функции.

## 7. Как право проходит через стену

Обычная выдача доступа всегда поимённа:

1. декларация выдаёт роли или seam owner только нужный `USAGE`, `EXECUTE` и table/column ACL;
2. на этой же точной таблице декларация создаёт policy `TO <exact role_or_owner>`;
3. policy проверяет signed org/patient/integrator/platform context и, где нужно, дополнительную связь строки;
4. `FORCE RLS` подчиняет стене владельца таблицы; владелец функции таблицей не владеет;
5. отсутствие policy или контекста закрывает доступ. Общей policy для «всех внутренних ролей» нет.

`BYPASSRLS` не используется ни одной runtime-ролью, seam owner, `app_owner`, health owner или стационарным
мигратором. В постоянном состоянии единственное техническое исключение — суперпользователь `postgres`.

### 7.1 Честное cross-tenant исключение

До сессии или до определения scope некоторые функции действительно не могут иметь tenant predicate: поиск
публичного slug/booking, auth identity, webhook invoice, delivery scope, scheduler materialization, глобальная
операционная телеметрия и curated health. Для них допустима policy `USING (true)` только в следующей узкой форме:

- на одной поимённой таблице;
- `TO` одному точному `NOLOGIN NOBYPASSRLS` seam owner;
- только вместе с named-column ACL;
- функция имеет фиксированное тело и выдаёт наружу минимальный результат;
- `EXECUTE` функции выдан точным caller-ролям;
- policy и исключение присутствуют в декларации и видны в `pg_policy`/двусторонней сверке.

Это сознательное, видимое в каталоге cross-tenant исключение. Оно не называется tenant-policy и не маскируется
общим owner, `PUBLIC`, владением таблицей или `BYPASSRLS`. Если контекст уже существует, `USING (true)` запрещён:
policy обязана использовать signed principal или transaction-local точный идентификатор.

## 8. Окно миграции

Временная элевация существует только внутри migration wrapper:

1. до окна migrator — `NOBYPASSRLS`, не член object/seam-owner ролей; runtime writers остановлены или отдельно
   скоординированы;
2. непосредственно вокруг schema migration суперпользователь временно выдаёт migrator `BYPASSRLS` для backfill
   под FORCE и только нужные owner-memberships для owner-only DDL;
3. сразу после migration выполняются `ALTER ROLE <migrator> NOBYPASSRLS` и `REVOKE <owner> FROM <migrator>` для
   каждого временного membership;
4. cleanup повторяется обработчиком ошибки/сигнала;
5. post-state проверяет `rolbypassrls=false` и отсутствие каждого временного membership до возврата runtime.

Исторические применённые миграции не переписываются. Новая closure приводит итоговый каталог к этой схеме.

## 9. Декларация и генератор

Единственная декларация перечисляет только то, что **GRANTED**: роли/login-атрибуты и membership, database/schema
доступ, table/column/function ACL, function ownership, RLS/FORCE и policies. Поля «у кого отобрать» нет — «мы же
сбрасываем все гранты».

Генератор применяет декларацию в одной транзакции:

1. оптом отзывает управляемые database/schema/table/column/function права у `PUBLIC`, всех runtime/service/owner
   ролей **и login-ролей**;
2. удаляет управляемые policies и восстанавливает только объявленные;
3. нормализует атрибуты ролей, memberships и owners;
4. выдаёт только перечисленные гранты и создаёт только перечисленные policies;
5. выполняет двустороннюю сверку: `объявлено EXCEPT существует` и `существует EXCEPT объявлено` обязаны быть пусты
   для ACL, column ACL, function ACL, policies, ownership, memberships и role attributes;
6. при любой ошибке откатывает всю reapplication, не оставляя полуприменённых прав.

Миграции несут только schema changes. `GRANT`, `REVOKE`, `CREATE/DROP POLICY` и `CREATE/ALTER ROLE` в новых
миграциях запрещены gate-ом: права меняются только декларацией и генератором.

## 10. Deny by default и стена при рождении таблицы

- `PUBLIC`, login- и runtime-роли не получают default privileges на новые схемы, таблицы, sequences и функции.
- Создатели объектов перечислены и для каждого их `ALTER DEFAULT PRIVILEGES` закрыт отдельно.
- Новая таблица появляется только вместе с классом, owner, RLS+FORCE, точными grants и policies в декларации.
- Event trigger проверяет `CREATE TABLE` и `ALTER TABLE`: tenant/org-таблица получает стену или DDL отклоняется;
  позднее добавление ownership/org-колонки не проходит мимо gate. Trigger защищён от рекурсии и принадлежит
  суперпользователю.
- CI проверяет, что новая migration с таблицей несёт schema declaration для стены и не содержит ACL/policy/role
  DDL. Забытое объявление даёт громкий отказ, а не временную широкую доступность.
- Периодический sweep повторяет каталожные инварианты как страховку; источником стены остаётся PostgreSQL.

## 11. Журнал отказов

Журнал — системный server log PostgreSQL. Таблица-журнал в управляемой базе не создаётся.

Отсутствующий/неверный контекст вызывает `42501` в accessor или permission error на ACL; PostgreSQL сам пишет
ошибку в server log. RLS policy фильтрует строки только после доказанного принципала и не используется как
замена громкому отказу. Ни runtime-роль, ни tenant не имеют права очищать или подменять server log; его retention
и ротация — системная эксплуатация, не DML приложения.

## 12. Исполняемое доказательство приёмки

Одна acceptance-команда строит кандидатов из фактического `pg_roles`, а не из декларации, и печатает отдельный
результат по каждому принципалу и классу таблиц. Она обязана доказать всё перечисленное ниже.

0. **Красный baseline:** до применения схемы тот же сценарий прямого подключения с верным паролем и без ключа
   воспроизводит дефект — хотя бы один защищаемый запрос отдаёт контрольную строку. Это описание обязательного
   transcript из плана, а не разрешение заново обследовать текущее состояние при проектировании схемы.
1. **Каждый login кластера**, включая не созданные проектом: прямое подключение с верным паролем, но без ключа
   порта; запрос каждого класса таблиц не выдаёт ни одной строки, завершается отказом и создаёт сопоставленную
   строку в server log.
2. **Каждая роль кластера:** переключение в роль без установленного подписанного контекста даёт тот же результат.
3. **`PUBLIC`:** нет `CONNECT` к управляемой базе и `USAGE` на управляемых схемах; посторонняя роль не может даже
   начать табличный запрос.
4. **Каждая `SECURITY DEFINER`-функция:** вызов без требуемого контекста/точного caller разрешения завершается
   отказом и не выдаёт данные. Для обнаружения скрытого тихого фильтра проверочный вызов использует
   `row_security=off`, где это применимо.
5. **Исключения:** поимённо объявлены только `postgres` и migrator внутри зафиксированного migration window;
   любой другой `rolbypassrls=true`, незаявленный membership/ACL/policy или доступ считается провалом.
6. **Server log:** для каждого ожидаемого отказа найдено отдельное событие с principal, ролью, запросом/классом и
   причиной. В базе не появилось journal rows.
7. **Обязательный положительный контроль:** те же запросы через webapp и integrator с ключом, правильным login,
   ролью и подписанным контекстом возвращают заранее подготовленные строки только своей области. Отдельно
   подтверждаются staff своей клиники, patient только свои данные, platform admin только платформенная
   поверхность и три integrator роли. Если положительный контроль не видит свои строки, это поломка приложения,
   а не доказательство безопасности.

Выход команды — полный перечень проверенных login/roles/functions и бинарный PASS/FAIL для отказа, нулевой выдачи,
log event и positive control. Приёмка недействительна при выборке принципалов из декларации, пропущенной функции,
тихом нуле без server-log события или отсутствии положительного контроля.

## 13. Переходные зависимости — не часть целевой схемы

Эти пункты нужны для перехода, но не определяют состав прав:

- provisioning/preflight перестаёт требовать отдельные URL/logins для telemetry, delivery, scheduler,
  diagnostic и media; он проверяет два порта, их login-memberships и role switching;
- webapp config-reader, media worker, cron/pruner и прочие фоновые пути перестают открывать свои DB connections и
  идут через владеющий порт;
- проверки, fixtures и deploy wrappers перестают требовать постоянный `app_owner BYPASSRLS` и проверяют 35
  seam owners плюс отдельный `saas_system_health_owner` в форме `NOBYPASSRLS`;
- права, не доказанные Ф2/Ф3, остаются невыданными до конкретного отказа Ф7; тогда право добавляется только через
  декларацию либо путь удаляется/переносится в seam.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Нет. Недоказанные caller/column права намеренно не включены по правилу «лучше меньше доступа» и должны решаться
по конкретным отказам живого прогона Ф7, а не расширением этой схемы заранее.
