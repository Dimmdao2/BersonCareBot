# 26 — Ф2: состав логинов и ролей, выведенный от потребности

> **УСТАРЕЛО/ЗАМЕНЕНО 12.08.2026.** Это исторический замер решения 09.08. Позднее владелец решил, что
> межорганизационный global-admin — отдельный уровень доверия: при прежних двух software ports целевой состав
> теперь четыре runtime login (`webapp_staff`, `webapp_patient`, `webapp_global_admin`, `integrator`) плюс
> deploy-only migrator. Утверждения ниже «global-admin через staff» и «4 вместе с migrator» не действуют;
> актуальный контракт — `SCHEME.md` revision 11 и `PLAN.md` v10. Команды и цифры ниже сохранены как история
> исходного каталога, а не target.

Дата: 2026-08-09. Закрывает пункты Ф2 в [`PLAN.md`](../PLAN.md). Решения владельца — дословно в
[`OWNER_DECISIONS.md`](../../../OWNER_DECISIONS.md) §«Права БД, роли и стены (владелец, 08–09.08)».

**Как построен документ.** Состав НЕ снят с кластера. Сначала выведены точки входа и различные наборы
прав, потом на этот вывод наложен живой каталог — по правилу владельца: «текущее состояние ролей и
логинов не учитывать вообще», «доступ только по потребности; лучше меньше доступа, потом на базе
проверить, куда кто не может попасть». Всё, что не доказано потребностью, помечено `не доказано` и
уходит на разбор в Ф7 живым прогоном.

**Границы.** Владельцы definer-швов здесь не назначаются: **владельцы швов — по результату Ф3**.
Форма декларации и генератор — Ф4. Журнал отказов — Ф8.

---

## ЧАСТЬ 1. Для владельца, без SQL

### Сколько получается

| | Сегодня в кластере | Целевое | Что уходит |
|---|---:|---:|---:|
| **Логины** (входы в базу) | 21 | **4 на среду** (8 на кластер: TEST + dev) | **12 логинов сносятся**, ещё 2 роли перестают быть входом |
| **Роли** (что видно за входом) | 16 наших | **10** + владельцы швов по Ф3 | **2 роли сносятся**, 4 передаются в Ф3 |

Логинов ровно четыре, потому что дверей в систему ровно четыре: **канал деплоя** (кто накатывает
миграции), **вход персонала в кабинет**, **вход пациента в кабинет**, **вход модуля доставки**.
Суперпользователь `postgres` остаётся (ваше решение), но он не прикладной вход — это дверь
администратора базы.

Всё остальное, что сегодня держит собственный ключ от базы — планировщик, отправка сообщений,
проверка живости, обработка видео, push-напоминания, чтение конфигурации, диагностика изоляции — своей
двери не получает. Оно заходит через одну из двух дверей приложения и **переключается на свою роль
внутри уже открытого соединения**.

### Почему отдельный ключ ничего не охранял

Мы проверили это на живой dev-базе, а не на бумаге. Оператор диагностики `bcb_saas_operator_dev`
имеет собственный логин, собственный пароль ≥32 байт и собственную проверку при деплое, которая
ОТКАЗЫВАЕТСЯ выкатывать систему без него. Заходим этим логином и просим телеметрию:

```
ERROR:  permission denied for schema app
```

У него ноль прав в базе: ноль таблиц, ноль функций, ноль схем. То есть отдельный ключ существует,
проверка деплоя его требует, а изоляции он не даёт никакой — изоляцию даёт роль, которой у него нет.
Это и есть общий случай: **пароль логина — не стена**. Стена — ключ порта, без которого база не
отдаёт данные. Логин, заведённый «чтобы был отдельный пул для изоляции», не имеет основания
существовать.

### Что стена делает сегодня, и где она дырявая

Проверено живьём на dev, три пробы (команды и вывод — часть 4):

1. **Работает.** Персонал заходит своим логином, встаёт ролью персонала, но **без ключа порта**
   получает **0 строк** на таблице приёмов. Ключ действительно нужен, чтобы что-то увидеть.
2. **Не работает для платформы.** Из того же соединения персонал может встать **платформенной ролью**
   и без всякого ключа увидеть **26 счетов** и **6 строк членства в организациях**. Ключ платформенную
   роль не охраняет вообще: у неё нет фильтра по организации, а значит и предъявлять ключу нечего.
3. **Не работает до опознания.** Запрос, у которого система ещё не знает, кто это (вход, регистрация,
   вебхук), доходит до базы «голым» логином — без роли и без ключа — и читает **287 строк** таблицы
   людей с персональными данными.

Пункты 2 и 3 — не «потом починим»: они определяют состав. Пункт 3 объясняет, почему вход пациента и
вход персонала — разные логины (у «голого» входа пациента не должно быть вообще ничего). Пункт 2
объясняет, почему платформенная роль должна требовать **свою** отметку в ключе, а не быть просто
следующей ступенькой после роли персонала.

### Что исчезает и почему ничего не встанет

- **8 логинов на TEST** и **1 на dev** — их работа переезжает на переключение роли внутри порта.
- **3 логина-остатка** (`bcb_dev`, два `*_c1_20260713021531`) — ноль членств, ноль прав, никем не
  используются.
- **2 роли**: `app_operational_web_push_reminder` (ноль прав, ни одного потребителя в коде — доказано
  перечнем поисков в части 4) и `app_identity_bootstrap` (её работа — «увидеть человека до входа» —
  по вашему решению делается отдельно и только под нужные таблицы, то есть швом Ф3, а не ролью с
  правами на три таблицы с персональными данными).
- **Роли `app_staff` и `app_patient` перестают быть входом** — сегодня у них по недосмотру стоит
  признак «можно войти». Роль — это не дверь.

Ничего не встанет, потому что ни один из сносимых логинов не несёт прав, которых нет у роли, на
которую он переключается. Место, где что-то всё-таки упрётся, база покажет **сама и громко** на
живом прогоне Ф7 — так и задумано: «лучше меньше доступа, потом проверить, куда кто не может попасть».

---

## ЧАСТЬ 2. Логины от потребности

**Логин = точка входа.** Не процесс, не задание, не «отдельный пул для изоляции».

### 2.1 Четыре логина на управляемую базу

| # | Логин (роль целевая) | Точка входа | Порт | Почему без него система не работает |
|---|---|---|---|---|
| 1 | `<env>_migrator` | канал деплоя | — | Кто-то обязан владеть схемой и накатывать миграции. Права на DDL не может нести ни один рантайм-вход, иначе рантайм способен переписать стены. Сегодня: `bersoncarebot_test`, `bcb_webapp_dev_user` |
| 2 | `<env>_webapp_staff` | сессия персонала в кабинете | webapp | Через него в базу приходит вся работа сотрудника клиники и, переключением роли, работа глобал-админа, биллинга клиники, фоновых заданий кабинета, медиа и телеметрии |
| 3 | `<env>_webapp_patient` | сессия пациента и **любой ещё не опознанный запрос** (вход, регистрация, публичные экраны) | webapp | Это единственный вход, куда попадает запрос, про который система ещё не знает, кто это. Он обязан быть отдельным именно потому, что должен не мочь ничего: у него нет членства в роли персонала |
| 4 | `<env>_integrator` | сессия модуля доставки | integrator | Отдельный процесс с отдельным секретом, отдельным сетевым контуром и минимальной поверхностью; через него, переключением роли, работают доставка, планировщик и проверка живости |

Плюс `postgres` — суперпользователь, решение владельца («ему дадим на проде сильный пароль»). В список
прикладных входов не входит: это канал администратора базы, а не приложения.

**Итого 4 на среду. На кластере две управляемые базы (`bersoncarebot_test`, `bcb_webapp_dev`) →
8 логинов + `postgres`.**

### 2.2 Почему больше ничего не является точкой входа

| Кандидат | Почему НЕ вход | Через что теперь ходит |
|---|---|---|
| Глобал-админ | **Решение владельца:** «глобал админ отдельного логина не имеет». В списке логинов не появляется по построению | логин 2 → `SET ROLE app_platform_settings` |
| Оператор диагностики изоляции (`saas_operator`) | **Решение владельца:** «пустить в порт». Проверено: отдельный ключ не даёт ни одного права (часть 4, П5) — изоляцию даёт роль | логин 2 → `SET ROLE saas_telemetry_operator` |
| Планировщик, доставка, проверка живости (3 логина интегратора) | Это три задания ОДНОГО процесса. Разделение достигается ролью; отдельные логины лишь дублируют то, что уже делает `SET ROLE` в том же соединении | логин 4 → `SET ROLE` одной из трёх служебных ролей |
| Медиа-воркер | Сегодня — отдельный процесс со своим ключом (`bersoncarebot-media-worker-test.service`). По решению владельца воркеры своих соединений не открывают | логин 2 → `SET ROLE app_operational_media_worker` |
| Push-напоминания | Ни потребителя, ни прав. Работа делается definer-функцией, владелец которой — Ф3 | — (роль сносится) |
| Чтение конфигурации (`DATABASE_URL_CONFIG_READER`) | Пятый пул вебаппа под роль `app_config_reader`, **которой на кластере не существует** (проверено, часть 4 П6). Отдельный вход под несуществующую роль | логин 2 → существующая роль |
| Чистка журналов / крон / прунер | **Решение владельца:** «воркеры, крон, прунер ходят через порты, своих соединений не открывают» | логин 2 → `SET ROLE app_worker` |
| Диагностический логин `saas_diag` | Потребителя нет нигде (доказательство — часть 4, П7) | — (сносится) |
| `bcb_test_maintenance_login` | Объявлен в декларации, **на кластере отсутствует**; входа, который он обслуживает, нет | — (не создавать) |

---

## ЧАСТЬ 3. Роли от потребности

**Роль существует, если она держит НАБОР ПРАВ, которого нет ни у одного соседа.** Не потому, что
существует процесс. Область (`scope`) — свои данные / своя организация / вся платформа / нет.

### 3.1 Целевой состав — 10 ролей

**Арендные, порт webapp**

| Роль | Область | Набор прав (чем отличается) | Почему не сливается |
|---|---|---|---|
| `app_staff` | своя организация | лечебная и организационная работа клиники: приёмы, расписание, услуги, пациенты, абонементы | это рабочая роль кабинета; ни у кого больше нет записи в клинические данные |
| `app_patient` | только своё | свои записи, программа, платежи, переписка; **колоночные** права на свой профиль (128 колоночных грантов — замер П3) | стена пациента абсолютна; область OWN не выразима через ORG |
| `app_clinic_billing` | своя организация | 14 табличных + 8 функциональных прав на счета/подписку своей клиники | если слить в `app_staff`, право на деньги клиники получит КАЖДАЯ сессия сотрудника, а не только та, что прошла гейт управления клиникой |
| `app_platform_settings` | вся платформа | 52 табличных + 11 функциональных + 3 колоночных права: организации, тарифы, счета, каркас клиник. **В медицину не ходит** (решение владельца) | единственная роль без арендной привязки; слить её с арендной — снять стену клиники со всей коммерции |

**Служебные, порт webapp**

| Роль | Область | Набор прав | Почему не сливается |
|---|---|---|---|
| `app_worker` | нет | фоновые задания кабинета + **чистка журналов и ретеншен** | сегодня чистка идёт под `app_staff` (`packages/db-principal/src/index.ts:1033-1036`: infra-крон → `SET ROLE app_staff`) — то есть у арендной роли есть право удалять из общих журналов. Отдельная роль ровно за этим |
| `app_operational_media_worker` | нет | `media_files`, `media_transcode_jobs`, `media_playback_stats_hourly` + одна функция настроек | ни у кого больше нет DELETE на статистику воспроизведения; в `app_worker` не сливается — это дало бы общему воркеру право стирать медиа-данные |
| `saas_telemetry_operator` | вся платформа, **только телеметрия изоляции** | 7 функций чтения/записи телеметрии, **ноль таблиц** (замер П4) | образцовая форма «только через функцию»: слить с `app_platform_settings` — дать платформенной роли ещё 7 функций, слить с `app_worker` — дать воркеру кросс-арендное чтение |

**Служебные, порт integrator**

| Роль | Область | Набор прав | Почему не сливается |
|---|---|---|---|
| `app_operational_delivery_worker` | нет | SELECT+UPDATE на трёх очередях (`integrator.projection_outbox`, `integrator_push_outbox`, `outgoing_delivery_queue`) + 12 функций доставки (перечень — П4) | пишет в очереди |
| `app_operational_scheduler` | нет | DML на `integrator.idempotency_keys` + ~10 функций тиков, инцидентов и проб (`assert-c4-operational-runtime-ready.sh:107`) | пишет инциденты и ключи идемпотентности; у доставки этих прав нет и быть не должно |
| `app_operational_diagnostic` | нет | **только чтение** `integrator.projection_outbox` (`assert-c4-operational-runtime-ready.sh:105`) | её набор — строгое подмножество доставки. Слить её ВВЕРХ в доставку = выдать проверке живости право менять очередь. Направление ошибки задано владельцем: меньше доступа — рабочая ситуация, больше — дефект |

**Владельцы definer-швов** — `app_owner`, `saas_telemetry_owner`, `saas_system_health_owner`,
`app_web_push_reminder_discovery_definer`: **владельцы швов — по результату Ф3.** Здесь не назначаются
и в счёт 10 не входят. Требование владельца к ним записано в Ф3: ни у одного нет BYPASSRLS, право
«видеть через стену» — политикой на конкретную таблицу.

### 3.2 Что здесь `не доказано`

- **Область `app_worker`** — ORG или NONE. Сегодня у него на dev **одна** функция
  (`app.report_saas_isolation_event`) и ноль таблиц; фильтр по клинике стоит на постановке в очередь,
  а не на чтении. Объявляем NONE (минимум) → Ф7 покажет, чего не хватает.
- **Нужны ли `app_worker` и чистке журналов РАЗНЫЕ роли.** Сегодня измерить нельзя: обе работы идут
  под `app_staff`. Объявляем одну роль (минимум) → Ф7.
- **Полный набор прав `app_operational_scheduler` и `_diagnostic` на TEST** — на dev у них ноль прав
  (замер П4), потребность видна только из предполётных проб деплоя. Объявляем по пробам, недостачу
  добираем в Ф7.
- **`saas_telemetry_operator` = GLOBAL или своя телеметрия** — вопрос владельцу (часть 6, В3).

---

## ЧАСТЬ 4. Отображение сегодняшнего состава на целевой

Живой каталог снят на `bcb_webapp_dev` (команды — часть 7). Для `bcb_test_*` табличные права лежат в
`bersoncarebot_test`, куда с этого бокса запроса нет — там источник `evidence/13-f2-census.md`
(перепись 08.08) и предполётные пробы деплоя; это помечено в колонке «доказательство».

### 4.1 Логины

| Логин сегодня | Вердикт | Причина | Доказательство |
|---|---|---|---|
| `bersoncarebot_test` | **нужен** → логин 1 (TEST) | владелец базы, канал миграций | `datdba` TEST, census §3.5 |
| `bcb_webapp_dev_user` | **нужен** → логин 1 (dev) | то же | П1; `datdba` dev |
| `bcb_test_staff_login` | **нужен** → логин 2 (TEST) | вход персонала | census §1.3 |
| `bcb_dev_runtime_staff_login` | **нужен** → логин 2 (dev) | то же | П1, П8 |
| `bcb_test_nonstaff_login` | **нужен** → логин 3 (TEST) | вход пациента/неопознанного | census §1.3 |
| `bcb_dev_runtime_nonstaff_login` | **нужен** → логин 3 (dev) | то же | П1, П9 |
| `bcb_test_integrator_login` | **нужен** → логин 4 (TEST), но **членства урезаются с 4 до 0** | сегодня состоит в `app_staff`, `app_patient`, `app_worker`, `app_identity_bootstrap` — то есть «персонал» ещё до переключения | census §1.3 |
| *(dev)* логина интегратора **нет** | **завести** → логин 4 (dev) | на dev интегратор ходит логином-мигратором (`.env:8` = `bcb_webapp_dev_user`) — рантайм под владельцем схемы | `.env:8` |
| `bcb_test_worker_login` | **сливается с** логином 2 | воркер работает внутри порта webapp | решение владельца; П4 (`app_worker` — 0 таблиц) |
| `bcb_test_operational_delivery_login` | **сливается с** логином 4 | роль выбирается `SET ROLE` в том же процессе | `integratorPoolProvider.ts:112-133` |
| `bcb_test_operational_scheduler_login` | **сливается с** логином 4 | то же | там же |
| `bcb_test_operational_diagnostic_login` | **сливается с** логином 4 | то же | там же |
| `bcb_test_operational_media_login` | **сливается с** логином 2 | медиа-воркер входит в порт webapp | `apps/media-worker/src/withClient.ts:65` — уже делает `SET ROLE`, отдельный логин лишний |
| `bcb_test_operational_web_push_reminder_login` | **сносится** | обслуживает роль без прав и без потребителей | П4, П10 |
| `bcb_saas_operator_test` | **сливается с** логином 2 | оператор — роль, не вход (решение владельца) | П5 |
| `bcb_saas_operator_dev` | **сносится** | на dev не состоит даже в `saas_telemetry_operator`; ноль прав; `permission denied for schema app` | П5 |
| `bcb_saas_diag_test` | **сносится** | ноль прав; ни одного потребителя (П7) | П4, П7 |
| `bcb_dev` | **сносится** | остаток: 0 членств, 0 ACL | census §5; П4 |
| `app_bootstrap_base_c1_20260713021531` | **сносится** | остаток | census §5; П4 |
| `app_runtime_login_c1_20260713021531` | **сносится** | остаток | census §5; П4 |
| `bcb_test_maintenance_login` | **не создавать** | объявлен в декларации, на кластере отсутствует | П1 (нет в `pg_roles`) |
| `bcb_webapp_prod` | **вне контура** | владелец вне-контурной копии; не наш | census §5 |

**Итог по логинам: 12 сносятся** (5 операционных TEST + worker TEST + 2 saas-operator + saas_diag +
3 остатка), **1 заводится** (интегратор на dev). Было 21 → станет 8 (по 4 на среду).

### 4.2 Роли

| Роль сегодня | Вердикт | Причина | Доказательство |
|---|---|---|---|
| `app_staff` | **нужна**, но **снять LOGIN** | роль — не дверь; сегодня несёт `rolcanlogin=t` | П1 |
| `app_patient` | **нужна**, но **снять LOGIN** | то же | П1 |
| `app_clinic_billing` | **нужна** | 14 табличных + 8 функциональных прав, которых нет у `app_staff` | П4 |
| `app_platform_settings` | **нужна**, но вход в неё переделывается | 52+11+3 права; сегодня достижима из сессии персонала без ключа (П8/В) | П4, П8 |
| `app_worker` | **нужна** (принимает на себя чистку журналов) | сегодня чистка идёт под `app_staff` | `db-principal/src/index.ts:1033-1036` |
| `app_operational_delivery_worker` | **нужна** | 3 таблицы + 12 функций | П4 |
| `app_operational_scheduler` | **нужна** | idempotency_keys + функции тиков/инцидентов | `assert-c4-…:107` |
| `app_operational_diagnostic` | **нужна** (read-only) | строгое подмножество доставки; слияние вверх = over-grant | `assert-c4-…:105` |
| `app_operational_media_worker` | **нужна** | media-таблицы, DELETE на статистику | П4 |
| `saas_telemetry_operator` | **нужна**, входит через порт webapp | 7 функций, 0 таблиц | П4 |
| `app_operational_web_push_reminder` | **сносится** | 0 таблиц, 0 функций, 0 схем; **ни одного потребителя в коде**: роли нет даже в перечне `DbOperationalRuntimeRole` (`db-principal/src/index.ts:56-61`) | П4, П10 |
| `app_identity_bootstrap` | **сносится как роль с правами**; работа → шов аутентификации, **по результату Ф3** | её политики проверяют только `pg_has_role(...)` без фильтра строки (`FINDINGS_TABLES.md:187-201`) — ровно та форма «видеть через стену навсегда», которую владелец отверг | П4 (10 табличных прав на 3 таблицы с ПДн), П9 |
| `app_config_reader` | **сносится** (создавать не надо) | код делает `SET ROLE app_config_reader`, роли **на кластере нет** | П6; `db-principal/src/index.ts:211-212` |
| `app_owner` | **по результату Ф3** | владелец 193 definer-функций; BYPASSRLS снимается решением 09.08 | census §3.2 |
| `saas_telemetry_owner` | **по результату Ф3** | владелец 3 таблиц телеметрии | П4 |
| `saas_system_health_owner` | **по результату Ф3** | владелец 20 таблиц health-сводки | П4 |
| `app_web_push_reminder_discovery_definer` | **по результату Ф3** | владелец discovery-функции | П4 |
| `app_migration_phase` | **по Ф5** | маркер окна миграций; на кластере отсутствует | не в `pg_roles` (П1) |

**Итог по ролям: было 16 наших → 10 нужных, 2 сносятся, 4 передаются в Ф3.**

---

## ЧАСТЬ 5. Что ломается ДО рантайма

Прикладные места, которые упрутся в отсутствующий доступ во время работы, здесь **сознательно не
перечисляются** — решение владельца: «2 места. 2 порта. Остальное будет чиниться на отладке потому что
база не пустила, а не пытаться заранее все места продумать». Ниже только то, что валит **деплой или
предполёт**, то есть не даёт выкатиться вообще.

### 5.1 Предполётная проверка секретов — **требует** отдельный операторский логин

`deploy/host/saas-c2-secret-preflight.mjs`:

- `:8-12` — `SAAS_ISOLATION_OPERATOR_DATABASE_URL` в списке обязательных ключей вебаппа;
- `:13-17` — `DATABASE_URL_DIAGNOSTIC`, `DATABASE_URL_DELIVERY_WORKER`, `DATABASE_URL_SCHEDULER` —
  обязательные ключи интегратора;
- `:189-193` — падение `webapp missing <key>` при отсутствии любого из трёх ключей вебаппа;
- `:203-209` — `webapp SAAS_ISOLATION_OPERATOR_DATABASE_URL must use a separate operator login`;
- `:213-218` — `integrator missing <key>`;
- `:228-244` — «четыре операционных URL обязаны быть четырьмя РАЗНЫМИ логин-ролями»;
- `:246-255` — «все вебапп-, интегратор-, операторские и медиа-URL обязаны быть разными ролями».

Это прямо тот пункт плана: «предполётную проверку, которая сегодня ТРЕБУЕТ отдельный логин, изменить
вместе с этим». **Не меняю — называю.**

### 5.2 Провижининг и предполётные ассерты операционных логинов

- `deploy/host/provision-c4-operational-runtime.sh:157-186` — берёт роли из четырёх URL и падает
  `four operational URLs must use four distinct roles`; `:190-201` — `CREATE ROLE … LOGIN NOINHERIT`
  для каждой; `:206-209` — прокидывает четыре имени логинов в SQL.
- `deploy/host/assert-c4-operational-runtime-ready.sh:105-108` — подключается каждым из четырёх URL и
  проверяет `SET ROLE` + пробные запросы; `:140-141` — падает, если «четыре контура» не
  аутентифицировались как четыре РАЗНЫЕ роли.
- `deploy/host/bootstrap-c4-test-env.mjs:23-28` — имена `bcb_test_operational_*_login` захардкожены и
  разливаются в host-env `/opt/env/bersoncarebot/{api,webapp,media-worker}.test` (`:17-21`).
- `deploy/host/render-saas-isolation-operator-provisioning.mjs:5-29` — список запрещённых ролей и
  шаблонов имён; `:44-50` — требует, чтобы имя логина содержало `operator`; `:70-77` — требует URL,
  пароль ≥32 байт и одну из двух баз.
- `deploy/host/provision-dev-saas-diagnostics.sh:12-15,:23-26` — весь скрипт построен вокруг
  `SAAS_ISOLATION_OPERATOR_DATABASE_URL` и отдельного операторского логина на dev.
- `deploy/host/deploy-test-saas.sh:80-84` (подключение обоих провижинеров), `:566-568` и `:642-644`
  (достаёт роли из `DATABASE_URL_{DIAGNOSTIC,DELIVERY_WORKER,SCHEDULER}`), `:606` (подключается
  операторским URL и сверяет `current_user`), `:2863` (self-test предполёта).
- `deploy/postgres/dev-c0-runtime-logins.sql:55-92` — создаёт `bcb_dev_runtime_{staff,nonstaff}_login`
  и падает, если такой логин владеет объектами. *Файлы `deploy/postgres/**` — зона Ф3/Ф4, здесь только
  ссылка.*

### 5.3 Перечни ролей в проверочной оснастке (валят красным, а не в рантайме)

- `scripts/verify-a1-rls-conformance.mjs:31-43` — требует существования
  `app_operational_web_push_reminder`, `app_web_push_reminder_discovery_definer`,
  `app_identity_bootstrap`, `app_operational_diagnostic` и др.
- `scripts/a0-greenfield-baseline-lib.mjs:355-368` — тот же список в greenfield-слепке.

### 5.4 Env-файлы, из которых уходят креды

- `apps/webapp/.env.dev:25` (`DATABASE_URL_STAFF`), `:26` (`DATABASE_URL_NONSTAFF`) — **остаются**;
  `:27` (`SAAS_ISOLATION_OPERATOR_DATABASE_URL`) — **уходит**.
- `.env:8` (`DATABASE_URL` = логин-мигратор) — **перестаёт быть рантайм-подключением интегратора на
  dev**; заводится отдельный dev-логин интегратора.
- `apps/webapp/.env.example:13` — образец с `bcb_dev_runtime_nonstaff_login`; правится вместе с
  переименованием.
- host-env TEST `/opt/env/bersoncarebot/api.test` — уходят `DATABASE_URL_DIAGNOSTIC`,
  `DATABASE_URL_DELIVERY_WORKER`, `DATABASE_URL_SCHEDULER`; `/opt/env/bersoncarebot/webapp.test` —
  уходит `SAAS_ISOLATION_OPERATOR_DATABASE_URL`; `/opt/env/bersoncarebot/media-worker.test` — уходит
  `DATABASE_URL` целиком (медиа-воркер перестаёт подключаться сам).
- `DATABASE_URL_CONFIG_READER` (`apps/webapp/src/infra/db/client.ts:20,:87-90`) — уходит вместе с
  несуществующей ролью `app_config_reader`.

**Прикладные места в коде здесь сознательно не перечислены**: их покажет живой прогон Ф7 громким
отказом базы, и пропущенное — ожидаемая запись отладки, а не риск.

---

## ЧАСТЬ 6. Переключение ролей: чем оно удерживается

Владелец: **«надо сделать так чтобы БД не пускала мимо порта без ключа, а ключ даётся только портом.
И порт автоматически не пускает без знания кто это».** Разберём буквально: сначала — что удерживает
переключение (механика Postgres), потом — что удерживает данные (ключ).

### 6.1 Механика, которая есть

- **Переключение.** `SET ROLE X` разрешён, только если логин сессии — член `X` (опция `SET`).
  Членство **транзитивно**. Это единственное, что Postgres проверяет.
- **Данные.** Даже встав ролью, сессия видит строки арендных таблиц лишь если политика получила
  организацию/пациента из `app.current_org_id()` / `app.current_patient_user_id()`. Эти функции
  читают `app.principal_context`, привязанный к `pg_backend_pid()` и сроку годности; строку туда
  кладёт **только** `app.install_signed_context(...)` — SECURITY DEFINER, владелец `app_owner`,
  проверяющая HMAC. Секрет — `DB_PRINCIPAL_SIGNING_SECRET`, живёт в env порта
  (`db-principal/src/index.ts:49`, `buildDbPrincipalApplyOptionsFromEnv` `:737-744`). **Это и есть
  ключ, который даётся только портом.**

### 6.2 По каждой роли, потерявшей свой логин

| Роль | Порт | Чем переключается | Что мешает арендной сессии туда войти |
|---|---|---|---|
| `app_platform_settings` (глобал-админ) | webapp | `SET ROLE` из `applySignedDbPrincipal` при `principal.kind==='platform'` (`db-principal/src/index.ts:1046-1049`), после гейта `requirePlatformOperationsPage` (`requireRole.ts:186`) / `requirePlatformOperationsApiContext` (`requireRole.ts:214`) | **Сегодня — ничего.** Членство `app_staff → app_platform_settings` делает роль достижимой транзитивно из логина персонала, и данные ключом не защищены (у роли нет org-фильтра). Проверено живьём: П8-В. **Целевое:** членство держит ЛОГИН персонала, а не роль `app_staff`; и каждая платформенная таблица требует в политике отметку платформенного контекста, поставленную ключом. Без ключа `RESET ROLE; SET ROLE app_platform_settings` даёт ноль строк и ошибку |
| `app_clinic_billing` | webapp | `setDbClinicBillingRuntimeRole` (`index.ts:228-230`) после гейта управления клиникой | То же, что выше: сегодня достижима из `app_staff` транзитивно (П8-A). Целевое — членство на логине + подпись контекста организации (у биллинга org-фильтр есть, поэтому ключ работает) |
| `saas_telemetry_operator` | webapp | `SET ROLE` после гейта оператора | Членство только у логина персонала; данных без функции нет вовсе — у роли **ноль таблиц**, 7 именованных функций (П4). Это самая крепкая форма: даже войдя в роль, без EXECUTE ничего не достанешь |
| `app_worker` (фон, чистка журналов) | webapp | `SET ROLE app_worker` вместо нынешнего `SET ROLE app_staff` для infra-крона (`index.ts:1033-1036`) | Членство только у логина персонала. Контекст организации не ставится вовсе → арендные таблицы дают ноль |
| `app_operational_media_worker` | webapp | `setDbOperationalRuntimeRole` (`media-worker/src/withClient.ts:65`) | Членство только у логина персонала; область NONE — арендных прав нет |
| `app_operational_delivery_worker` / `_scheduler` / `_diagnostic` | integrator | `prepareIntegratorTechnicalPoolClient` → `setDbOperationalRuntimeRole` (`integrator/src/infra/db/withClient.ts:68-75`) | Членство **только** у логина интегратора. Логин интегратора при этом теряет членство в `app_staff`/`app_patient`/`app_worker` — сегодня оно есть (census §1.3) и делает интегратор «персоналом» до всякого переключения |
| роли швов | — | **по результату Ф3** | — |

### 6.3 Честный остаток: где механика Postgres не спасает

**Внутри одного соединения `RESET ROLE` доступен всегда.** Значит членство ограничивает не «сессию
арендатора», а **логин**: код, исполняющийся в порте, может вернуться в логин-роль и войти в любую
роль, членом которой логин является. Отсюда два вывода, и оба — в конструкцию, а не в благие
намерения:

1. **Правило членства:** роль-цель ДОЛЖНА быть достижима из логина, который её обслуживает, и НЕ
   должна быть достижима транзитивно через другую роль. Конкретно снимается членство
   `app_staff → app_platform_settings` и `app_staff → app_clinic_billing`; вместо него членство
   получает логин 2. Это возвращает нам ровно одну проверяемую строку в каталоге вместо
   «рекомендации».
2. **Правило ключа:** для ролей, у которых нет арендного фильтра (`app_platform_settings`,
   `saas_telemetry_operator`), членство — единственная стена, и её мало. Поэтому доступ к их таблицам
   ставится через **предикат контекста**: политика требует отметку, которую кладёт только
   `app.install_signed_context` с ключом порта. Тогда «встал ролью без ключа» = ноль строк + ошибка,
   как и требует критерий приёмки владельца.

### 6.4 Порт, который не знает, кто пришёл

Сегодня неопознанный запрос **доходит до базы**. Механика: `stampBootstrapPrincipal`
(`apps/webapp/src/app-layer/principal/bootstrapPrincipal.ts:7-9`) ставит принципала вида `bootstrap`;
проверка входа в пул его пропускает — отвергаются только «принципала нет вовсе» и не-кроновый `infra`
(`db-principal/src/index.ts:752-771`); маршрутизация отправляет его на **nonstaff**-пул
(`webappPoolProvider.ts:145-158`); установка контекста для `bootstrap` возвращает `false` без подписи
(`index.ts:1039-1042`). Итог: запрос работает **голым логином**, без роли и без ключа.

Замер (П9): под таким соединением читается **287 строк `public.platform_users`** — персональные
данные. Это влияет на состав прямо:

- **логин 3 обязан остаться отдельным** — именно он принимает неопознанный запрос, и именно поэтому у
  него не должно быть членства в `app_staff` и не должно быть прямых табличных грантов (сегодня их
  **16 на 12 таблицах**, П9);
- **работа «узнать человека до сессии» уходит в шов** (Ф3): вход, регистрация, OTP, привязка телефона
  — через именованные definer-функции, а не через табличные права роли `app_identity_bootstrap`;
- **после этого целевое состояние логина 3 — ноль табличных прав**: он умеет только выполнить
  функции шва и, после опознания, встать `app_patient` с подписанным контекстом.

---

## ЧАСТЬ 7. Доказательства: команды и вывод

Все запросы — read-only на `bcb_webapp_dev`, креды из `.env` / `apps/webapp/.env.dev`. Прод и чужие
базы не трогались.

**П1 — состав ролей и логинов кластера**
```bash
psql "$DATABASE_URL" -c "SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolinherit
                         FROM pg_roles WHERE rolname NOT LIKE 'pg\_%' ORDER BY rolcanlogin DESC, rolname;"
psql "$DATABASE_URL" -Atc "SELECT count(*) FILTER (WHERE rolcanlogin), count(*) FILTER (WHERE NOT rolcanlogin), count(*)
                           FROM pg_roles WHERE rolname NOT LIKE 'pg\_%';"
```
→ `31|14|45`. Из 45: 9 чужих (`brain*`, `code_search_ro`, `storylama_*`, `tgcarebot`, `pbt_tpl_*`,
`bcb_webapp_prod`) + `postgres` → **наших 35: 21 логин и 14 безлогиновых ролей**. `app_staff` и
`app_patient` в списке логинов — `rolcanlogin=t` у обеих. `bcb_test_maintenance_login` и
`app_config_reader` и `app_migration_phase` — отсутствуют.

*(В брифе фигурировали «20 ролей и 17 логинов»; замер даёт 21 логин и 14 безлогиновых ролей —
расхождение объясняется тремя логинами-остатками и тем, что `app_staff`/`app_patient` несут LOGIN.)*

**П2 — членства**
```bash
psql "$DATABASE_URL" -c "SELECT r.rolname member, g.rolname granted, m.admin_option, m.inherit_option, m.set_option
  FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member JOIN pg_roles g ON g.oid=m.roleid
  WHERE r.rolname NOT LIKE 'pg\_%' AND g.rolname NOT LIKE 'pg\_%' ORDER BY 2,1;"
```
→ 20 строк. Существенное: `app_staff → app_clinic_billing`, `app_staff → app_platform_settings`
(обе `set=t`), `bcb_test_integrator_login` — член четырёх ролей.

**П3/П4 — поверхность прав (через `aclexplode`, БЕЗ фильтра видимости)**

`information_schema.role_table_grants` показывает только гранты, где текущая роль — грантор или
грантополучатель, и занижает картину. Считалось по каталогу:
```bash
psql "$DATABASE_URL" -c "
WITH t AS (SELECT pg_get_userbyid(a.grantee) g FROM pg_class c, aclexplode(c.relacl) a),
     f AS (SELECT pg_get_userbyid(a.grantee) g FROM pg_proc p, aclexplode(p.proacl) a),
     s AS (SELECT pg_get_userbyid(a.grantee) g FROM pg_namespace n, aclexplode(n.nspacl) a),
     col AS (SELECT pg_get_userbyid(a.grantee) g FROM pg_attribute at, aclexplode(at.attacl) a)
SELECT r.rolname, (SELECT count(*) FROM t WHERE t.g=r.rolname) tbl,
       (SELECT count(*) FROM f WHERE f.g=r.rolname) fn,
       (SELECT count(*) FROM s WHERE s.g=r.rolname) sch,
       (SELECT count(*) FROM col WHERE col.g=r.rolname) col
FROM pg_roles r WHERE r.rolname LIKE 'app\_%' OR r.rolname LIKE 'saas\_%' OR r.rolname LIKE 'bcb\_%' ORDER BY 2,3,1;"
```
Ключевые строки (`таблицы | функции | схемы | колонки`) на `bcb_webapp_dev`:

```
app_operational_diagnostic          | 0 | 0 | 0 | 0
app_operational_scheduler           | 0 | 0 | 0 | 0
app_operational_web_push_reminder   | 0 | 0 | 0 | 0
bcb_saas_diag_test                  | 0 | 0 | 0 | 0
bcb_saas_operator_dev               | 0 | 0 | 0 | 0
bcb_dev / *_c1_20260713021531 (x2)  | 0 | 0 | 0 | 0
app_worker                          | 0 | 1 | 1 | 0
saas_telemetry_operator             | 0 | 7 | 1 | 0
app_operational_media_worker        | 2 | 0 | 0 | 0
app_operational_delivery_worker     | 6 |12 | 2 | 0
app_identity_bootstrap              |10 | 3 | 2 | 0
app_clinic_billing                  |14 | 8 | 2 | 0
bcb_dev_runtime_nonstaff_login      |16 |111| 2 | 0
saas_system_health_owner            |20 | 4 | 1 | 0
saas_telemetry_owner                |21 | 5 | 0 | 0
app_platform_settings               |52 |11 | 2 | 3
app_patient                         |132| 92| 3 |128
app_staff                           |777| 29| 3 | 0
```
Оговорка: у `bcb_test_*` нули ожидаемы — их гранты лежат в `bersoncarebot_test`, куда с этого бокса
доступа нет; для TEST источник — `evidence/13-f2-census.md` и пробы деплоя.

Поимённо (`delivery`): `integrator.projection_outbox`, `public.integrator_push_outbox`,
`public.outgoing_delivery_queue` (SELECT,UPDATE) + 12 функций
(`advance_appointment_reminder_messenger_ladder`, `apply_specialist_task_reminder_success_outcome`,
`open_or_touch_operator_incident`, `read_integrator_platform_integration_availability`,
`read_outgoing_delivery_reclaim_config`, `read_reminder_transactional_email_cooldown`,
`record_reminder_transactional_email_cooldown`, `release_principal_context`,
`resolve_outgoing_delivery_scope`, `revalidate_appointment_reminder_materialization`,
`revalidate_patient_reminder_delivery_materialization`,
`revalidate_specialist_task_reminder_materialization`).
`saas_telemetry_operator`: 7 функций `app.read_*`/`app.record_saas_isolation_coverage`, ноль таблиц.
`app_worker`: одна функция `app.report_saas_isolation_event`.

**П5 — операторский логин на dev инертен**
```bash
psql "$SAAS_ISOLATION_OPERATOR_DATABASE_URL" -Atc "SELECT current_user, pg_has_role(current_user,'saas_telemetry_operator','MEMBER');"
# → bcb_saas_operator_dev|f
psql "$SAAS_ISOLATION_OPERATOR_DATABASE_URL" -Atc "SELECT count(*) FROM app.read_saas_isolation_events(10);"
# → ERROR:  permission denied for schema app
```
Отдельный ключ есть, предполёт его требует, прав — ноль.

**П6 — `app_config_reader` на кластере нет**
```bash
psql "$DATABASE_URL" -Atc "SELECT count(*) FROM pg_roles WHERE rolname='app_config_reader';"   # → 0
```
При этом `packages/db-principal/src/index.ts:211-212` делает `SET ROLE app_config_reader`, а
`apps/webapp/src/infra/db/configReaderPoolProvider.ts:43` открывает под неё отдельный пул.

**П7 — «у `saas_diag` нет потребителя»: перечень выполненных поисков**

1. `node /home/dev/brain/tools/code-search.mjs "saas_diag" --repo bcb -k 25` — ни одного попадания в
   исполняемом коде (только `declaration.ts` и документы).
2. `grep -rIn "saas_diag" .` (без `node_modules`, `.git`) → 4 файла: `declaration.ts` ×2,
   `evidence/13-f2-census.md`, `PLAN.md`, `OWNER_DECISIONS.md`. Ни одного файла кода.
3. `grep -rIn "DIAG" deploy/ scripts/ tools/ apps/ packages/` (за вычетом `diagnostic`) → только
   `PGPASSWORD_BCB_SAAS_DIAG_TEST` в `declaration.ts:641`.
4. `git log --oneline -S"saas_diag" --all` → **3 коммита, все от 08–09.08 и все — документы и
   декларация** (`4a3d365ce` перепись, `25ea3e9e7` декларация, `92a9726e4` план). То есть в коде
   репозитория этой строки не было **никогда**: логин заведён мимо репозитория.
5. Каталог: ноль табличных, функциональных, схемных и колоночных прав (П4).

Вывод: потребителя нет ни в коде, ни в истории, ни в правах. **Сносится.**

**П8 — эскалация роли из сессии персонала (живая проба, read-only)**
```bash
psql "$DATABASE_URL_STAFF" -Atc "SELECT current_user,
  pg_has_role(current_user,'app_staff','MEMBER'), pg_has_role(current_user,'app_platform_settings','MEMBER'),
  pg_has_role(current_user,'app_clinic_billing','MEMBER'), pg_has_role(current_user,'app_patient','MEMBER');"
# A → bcb_dev_runtime_staff_login|t|t|t|f

psql "$DATABASE_URL_STAFF" -Atc "SET ROLE app_staff;
  SELECT app.current_org_id() IS NULL, (SELECT count(*) FROM public.be_appointments);"
# Б → t|0        ← ключа нет → ноль строк (но ТИХО: current_org_id вернул NULL, не бросил — это Ф8)

psql "$DATABASE_URL_STAFF" -Atc "SET ROLE app_staff; SET ROLE app_platform_settings;
  SELECT current_user, (SELECT count(*) FROM public.saas_billing_invoices),
                       (SELECT count(*) FROM public.be_organization_members);"
# В → app_platform_settings|26|6   ← без ключа, из сессии персонала
```
А — членство транзитивно. Б — ключ действительно держит арендные таблицы. В — платформенную роль ключ
не держит вовсе.

**П9 — неопознанный запрос читает ПДн**
```bash
psql "$DATABASE_URL_NONSTAFF" -Atc "SELECT current_user, pg_has_role(current_user,'app_patient','MEMBER'),
  pg_has_role(current_user,'app_staff','MEMBER'), pg_has_role(current_user,'app_identity_bootstrap','MEMBER');"
# → bcb_dev_runtime_nonstaff_login|t|f|t
psql "$DATABASE_URL_NONSTAFF" -Atc "SELECT count(*) FROM public.platform_users;"
# → 287        ← без SET ROLE и без ключа
```
Его 12 таблиц с прямыми грантами: `be_branches`, `be_clinic_services`, `be_external_entity_mappings`,
`be_organization_members`, `be_specialist_service_availability`, `be_specialists`,
`platform_user_contacts`, `platform_users`, `user_channel_bindings`, `user_contacts`, `user_identity`,
`user_phone_history`.

**П10 — «у `app_operational_web_push_reminder` нет потребителя»: перечень поисков**

1. `code-search.mjs "web_push_reminder" --repo bcb` и
   `grep -rIn "web_push_reminder" apps packages deploy/host scripts` → попадания только в
   `scripts/verify-a1-rls-conformance.mjs:34-35`, `scripts/a0-greenfield-baseline*.mjs:361-365` и
   `deploy/host/render-saas-isolation-operator-provisioning.mjs:28` (шаблон запрещённого имени). Ни
   одного вызова.
2. Роли **нет в перечне переключаемых** `DbOperationalRuntimeRole`
   (`packages/db-principal/src/index.ts:56-61`) — код не умеет в неё встать в принципе.
3. Каталог: 0 таблиц, 0 функций, 0 схем (П4).
4. Работа push-discovery делается функцией `app.list_web_push_reminder_organization_ids`, владелец —
   `app_web_push_reminder_discovery_definer` (census §3.1), то есть швом, а не этой ролью.

**П11 — контекст ставится только подписью**
```bash
psql "$DATABASE_URL" -Atc "SELECT proname, pg_get_userbyid(proowner), prosecdef FROM pg_proc
  WHERE pronamespace='app'::regnamespace AND proname IN
  ('install_signed_context','release_principal_context','current_org_id','current_patient_user_id','current_integrator_user_id');"
```
→ все пять `app_owner|t` (SECURITY DEFINER). Тело `app.current_org_id`:
```sql
SELECT org_id FROM app.principal_context
 WHERE backend_pid = pg_backend_pid()
   AND expires_epoch > floor(extract(epoch FROM clock_timestamp()))::bigint
```
Возвращает NULL при отсутствии контекста — **тихий ноль**; громкий отказ ставится в Ф8.
`DB_PRINCIPAL_CONTEXT_MODE=locked` на dev (`apps/webapp/.env.dev`).

---

## ЧАСТЬ 8. ВОПРОСЫ ВЛАДЕЛЬЦУ

Ниже — то, что я считаю нужным, но чего НЕТ ни в ваших решениях, ни в `PLAN.md`. В конструкцию как
данность не внесено.

**В1. Отметка платформенного контекста.** Ваше правило — «база не пускает мимо порта без ключа».
У платформенной роли нет фильтра по организации, поэтому ключ на неё сегодня не действует (доказано:
26 счетов без ключа, П8-В). Предлагаю: платформенные таблицы получают в политике требование отметки
«платформенный контекст», которую кладёт тот же подписанный вызов порта. Тогда «встал ролью без
ключа» = ноль строк и ошибка. Это добавляет ключу ещё один вид отметки — решение ваше.
*Рекомендация: да, иначе глобальная роль остаётся вне ключевой модели.*

**В2. Куда девается медиа-воркер.** Он сегодня — отдельный процесс со своим systemd-юнитом и своим
подключением. «Через порт» для него означает либо (а) он перестаёт быть отдельным процессом, либо
(б) остаётся процессом, но ходит в базу через HTTP порта webapp. Второе — заметная переделка конвейера
видео. *Рекомендация: (б), но не в этой работе — сначала снять ему собственный логин и пустить в порт,
переделку конвейера планировать отдельно.* Нужно ваше «да» на порядок.

**В3. Область `saas_telemetry_operator`.** Телеметрия изоляции — это данные обо ВСЕХ клиниках
(кто куда не смог пройти). Считаем это платформенной диагностикой (видит всё) или сужаем? В решениях
этого нет. *Рекомендация: видит всё, но только через 7 именованных функций и без единого табличного
права — как сейчас.*

**В4. Два входа у порта webapp или один.** Ваша формулировка — «порт webapp (сессия персонала, сессия
пациента)», я читаю её как два логина. Под ключевой моделью можно было бы обойтись одним логином
с нулевыми правами. Я оставляю два, потому что живая проба (П9) показывает: неопознанный запрос
доходит до базы, и пока это так, отдельный «ничего не могущий» вход — единственное, что отделяет его
от прав персонала. *Рекомендация: оставить два.* Подтвердите — от этого зависит цифра «4».

**В5. Три служебные роли интегратора или одна.** Они держат три разных набора прав (пишет очередь /
пишет инциденты / только читает), и слияние любой пары — расширение доступа. Но все три живут в одном
процессе и выбираются строкой-источником внутри него (`integrator/src/infra/db/withClient.ts:44-54`),
то есть стеной между собой не являются — только уменьшают радиус ошибки. *Рекомендация: оставить три.*
Если вы считаете это лишней сложностью — скажите, сведу к одной с объединённым набором прав (это
осознанное расширение доступа, и я запишу его как ваше решение).

**В6. Чистка журналов — своя роль или общий воркер.** Сегодня и фоновые задания кабинета, и чистка
журналов идут под ролью персонала. Я свожу обе на `app_worker`. Разделять их на две роли сейчас
нечем — измерить, чем они отличаются, можно только после Ф7. *Рекомендация: одна роль сейчас, при
необходимости разделим по результатам живого прогона.*
