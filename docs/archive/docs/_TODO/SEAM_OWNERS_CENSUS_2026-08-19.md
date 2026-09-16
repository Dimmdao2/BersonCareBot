# Перепись владельцев швов — 43 штуки: что это, зачем и сколько лишних

Дата: 2026-08-19. Среда: **живой DEV `bcb_webapp_dev`, только чтение** (`sudo -u postgres psql`, ни одного
DDL/DML). Прод не затрагивался ничем.

Вопрос владельца 19.08 дословно: «43 владельца шва, 14 из них держат одну-две функции — это правильные
числа, такие как должны быть, или просто так есть, и это можно упростить, объединить?»

Оракул: `AGENTS.md` §5 «Как решать, что делать», п. 6 «Не плодить сущности» — «Новая сущность нужна только
когда существующая не может нести требуемое поведение без нарушения своей границы»; там же §5 «Варианты
одного действия — параметры одной точки, а не отдельные функции».

---

## Числа

| Что | Сколько | Чем получено |
|---|---:|---|
| Владельцев швов `app_seam_%_owner` в DEV | **43** | `select count(*) from pg_roles where rolname like 'app_seam%'` |
| из них владеют хотя бы одной функцией | 42 | `pg_proc join pg_roles on proowner` |
| владеют ровно **одной** функцией | 3 | там же, `group by rolname having count=1` |
| владеют **двумя** функциями | 10 | там же |
| владеют **нулём** функций | 1 | там же (`app_seam_public_clinic_card_owner`) |
| **итого «одна-две-или-ноль»** | **14** | цифра владельца подтверждена |
| Функций у всех швов | **384** | `select count(*) from pg_proc p join pg_roles r on r.oid=p.proowner where r.rolname like 'app_seam%'` |
| из них `SECURITY DEFINER` | 382 | `count(*) filter (where prosecdef)` |
| из них `SECURITY INVOKER` | 2 | оба у `app_seam_context_owner` |
| Различных отношений, до которых достают швы | 158 | `information_schema.role_column_grants`, `count(distinct table_schema||'.'||table_name)` |
| Пар (шов, отношение) | 338 | там же |
| Троек (шов, отношение, колонка) | **2312** | там же |
| Возможных пар швов (у 42 непустых) | 861 | 42·41/2 |
| Пар, чьи наборы отношений **пересекаются** | 319 | расчёт по выгрузке грантов, скрипт ниже |
| Пар с **полным вложением** одного набора в другой | **38** | из них с точным совпадением наборов — **0** |
| Пар с **непересекающимися** наборами | 542 | 861 − 319 |
| **Групп-кандидатов на слияние без расширения** | **3** | объединение не добавляет объединённому шву ни одной таблицы |
| **Кандидатов на слияние итого (роли к снятию)** | **6** | 3 группы (−4 роли) + публичная витрина по §33.3 (−1) + мёртвая роль (−1) |
| **Мёртвых швов** (ни одной функции, ни одного гранта) | **1** | `app_seam_public_clinic_card_owner` |
| **Мёртвых функций** (никто не вызывает) | **9** | в 6 швах; способ доказательства — ниже |
| Швов, где выданный грант шире, чем тело функций | **0** | сверка `role_column_grants` против лексической поверхности всех 384 `prosrc` |

**Как получено каждое число.** Все счётчики сняты одной сессией `psql` под `postgres` на `bcb_webapp_dev`
в режиме чтения. Ноль строк нигде не использован как доказательство пустоты: «мёртвость» доказывается не
отсутствием строк, а перечнем мест, где искали (см. §5). Поверхности отношений получены двумя независимыми
путями и сошлись: (1) живые колоночные гранты `information_schema.role_column_grants`; (2) лексический
верхний предел по телам всех 384 функций из `pg_proc.prosrc`, разобранный существующим в репозитории
`deploy/postgres/privileges/function-body-surface.mjs` (`extractRelationOperations`). Расхождений между
(1) и (2) — ноль, ни в одну сторону: ни одного шва с грантом на таблицу, которой он не касается, и ни
одного касания без гранта.

---

## Ответ на вопрос владельца

**Числа не «правильные» и не «случайные» — они наследственные.** 40 владельцев из 43 появились не по одному
на фичу, а **двумя коммитами одного дня, 2026-08-09** (`dcedf88bb` «design #1085 definer seams without
bypass» и `b023017b8` «complete full definer seam census»): это был разрез единого `app_owner` с
`BYPASSRLS`, владевшего 132 функциями, на владельцев по потребности. Разрез считался по функциям («132
функции → 35 швов»), а не по классам данных, поэтому границы швов повторили границы **тогдашних наборов
функций**, а не границы того, что нужно защищать. Отсюда и одно-двухфункциональные швы: шов, которому в
момент разреза досталось две функции, так и остался с двумя. Оставшиеся 3 владельца заведены уже поштучно,
19.08 (`platform_analytics`, `retention_sweep`, `public_clinic_card`) — это уже
другой механизм: каждый агент решал локально и всегда в пользу нового, потому что правила «когда
переиспользовать» в каноне нет вовсе.

**Упростить можно, но не так сильно, как выглядит по числу «14».** Малый шов сам по себе не дефект: 11 из
14 малых швов держат ровно одну закрытую вещь (`login_tokens`, `user_oauth_bindings`,
`clinic_dedicated_bot_bindings`, `email_send_cooldowns`, `staff_security_profiles`), и их малость — это и
есть их смысл. Реальный избыток другой: **три шва настроек — это одна дверь, разрезанная на три**
(23 функции одинаковой формы «прочитать значение по ключу из `system_settings`/`app_runtime_settings`»,
объединение их наборов даёт ровно 3 таблицы — столько же, сколько уже у самого широкого из них); **два шва
публичной витрины** не должны быть швами вообще по решению владельца §33.3; **один шов мёртв полностью**;
**один шов назван не тем, что делает** (`catalog_admin` читает `integrator.schema_migrations`, а числится
«clinical measure kinds»). Итог: 43 → **37** без единой новой таблицы ни у кого и без потери стены. Дальше
резать нельзя: 542 пары из 861 не пересекаются вообще, а самые заманчивые по числам слияния —
это склеивание крошечного шва с огромным, что не экономит, а расширяет.

---

## 1. Перепись: 43 владельца

Колонка «Колонок» — число различных колонок, на которые у владельца есть колоночный грант (сумма по всем
его таблицам). «EXECUTE выдан ролям» — из `pg_proc.proacl`, роль-владелец из списка исключена.
«Заведён» — первый коммит, вносящий имя роли (`git log --reverse -S'<роль>' --all`).

| # | Владелец шва | Назначение | Функций | Таблиц | Колонок | EXECUTE выдан ролям | Заведён |
|---:|---|---|---:|---:|---:|---|---|
| 1 | `patient_self_actions` | patient self actions | 54 | 43 | 331 | `patient` | 2026-08-09 `dcedf88bb` |
| 2 | `patient_booking` | patient booking | 34 | 33 | 332 | `patient`, `service`, `tenant_service`, `worker` | 2026-08-09 `dcedf88bb` |
| 3 | `email_otp` | email OTP | 26 | 5 | 56 | `patient`, `pre_session` | 2026-08-09 `dcedf88bb` |
| 4 | `telemetry_operator` | operator telemetry/probes | 26 | 17 | 125 | `operational_delivery_worker`, `operational_scheduler`, `platform_admin`, `pre_session`, `service`, `worker`, `saas_telemetry_operator` | 2026-08-09 `dcedf88bb` |
| 5 | `password_auth` | парольный вход и общая auth-защита | 19 | 7 | 44 | `patient`, `pre_session`, `staff` | 2026-08-09 `dcedf88bb` |
| 6 | `context` | подписанный контекст | 13 | 2 | 27 | все 63 runtime- и seam-ролей | 2026-08-09 `dcedf88bb` |
| 7 | `delivery_scope` | delivery scope | 13 | 20 | 95 | `operational_delivery_worker`, `patient`, `pre_session`, `service`, `staff`, `tenant_service`, `worker` | 2026-08-09 `dcedf88bb` |
| 8 | `staff_security` | staff 2FA/TOTP/recovery | 12 | 1 | 14 | `patient`, `seam_password_auth_owner`, `seam_self_security_owner`, `seam_specialist_provision_owner`, `staff` | 2026-08-09 `b023017b8` |
| 9 | `phone_binding` | привязка контакта/канала | 11 | 10 | 54 | `integrator_resolver`, `patient`, `pre_session`, `staff`, `worker` | 2026-08-09 `dcedf88bb` |
| 10 | `phone_otp` | phone OTP/challenges | 11 | 2 | 10 | `pre_session` | 2026-08-09 `b023017b8` |
| 11 | `specialist_provision` | specialist/first-org provisioning | 11 | 18 | 120 | `clinic_billing`, `patient`, `platform_settings`, `staff` | 2026-08-09 `dcedf88bb` |
| 12 | `org_commerce` | SaaS/org commerce | 10 | 13 | 104 | `clinic_billing`, `patient`, `platform_settings`, `staff`, `tenant_service`, `worker` | 2026-08-09 `dcedf88bb` |
| 13 | `patient_lfk_media` | patient LFK/platform-media entitlement | 10 | 11 | 78 | `operational_media_worker`, `patient`, `staff` | 2026-08-09 `b023017b8` |
| 14 | `reminder_materialization` | reminder materialization/discovery | 10 | 15 | 122 | `operational_delivery_worker`, `operational_scheduler`, `tenant_service` | 2026-08-09 `dcedf88bb` |
| 15 | `reminder_patient` | patient reminders | 10 | 12 | 105 | `integrator_request`, `patient`, `staff`, `tenant_service` | 2026-08-09 `dcedf88bb` |
| 16 | `settings_integrator` | integrator settings | 10 | 1 | 4 | `operational_delivery_worker`, `operational_scheduler`, `service`, `tenant_service` | 2026-08-09 `dcedf88bb` |
| 17 | `identity_lookup` | предсессионный identity lookup | 9 | 8 | 35 | `integrator_resolver`, `patient`, `platform_admin`, `pre_session`, `seam_context_owner`, `staff` | 2026-08-09 `dcedf88bb` |
| 18 | `passkey` | passkey | 9 | 3 | 19 | `patient`, `pre_session` | 2026-08-09 `dcedf88bb` |
| 19 | `payment_webhook` | payment webhook | 9 | 7 | 39 | `clinic_billing`, `patient`, `platform_settings`, `pre_session`, `worker` | 2026-08-09 `dcedf88bb` |
| 20 | `patient_invite` | patient invite | 7 | 6 | 48 | `patient` | 2026-08-09 `dcedf88bb` |
| 21 | `public_slug` | public slug | 7 | 6 | 35 | `pre_session`, `staff` | 2026-08-09 `dcedf88bb` |
| 22 | `settings_preauth` | preauth settings | 7 | 2 | 9 | `patient`, `pre_session` | 2026-08-09 `dcedf88bb` |
| 23 | `reminder_specialist` | specialist reminder | 6 | 10 | 68 | `operational_delivery_worker`, `patient`, `staff`, `tenant_service` | 2026-08-09 `dcedf88bb` |
| 24 | `settings_runtime` | runtime settings | 6 | 3 | 14 | `integrator_request`, `operational_media_worker`, `patient`, `pre_session` | 2026-08-09 `dcedf88bb` |
| 25 | `login_token` | messenger login tokens | 5 | 1 | 8 | `pre_session` | 2026-08-09 `b023017b8` |
| 26 | `oauth` | OAuth identity binding | 5 | 1 | 5 | `patient`, `pre_session`, `staff`, `worker` | 2026-08-09 `b023017b8` |
| 27 | `patient_org_projection` | patient/org presentation projection | 4 | 6 | 34 | `patient`, `staff` | 2026-08-09 `dcedf88bb` |
| 28 | `public_booking` | public booking resolver | 4 | 12 | 88 | `pre_session`, `tenant_service` | 2026-08-09 `dcedf88bb` |
| 29 | `telemetry_exclusion` | telemetry exclusion | 3 | 5 | 20 | `patient`, `platform_settings` | 2026-08-09 `dcedf88bb` |
| 30 | `catalog_public` | public catalogs | 2 | 2 | 7 | `patient`, `pre_session`, `staff` | 2026-08-09 `dcedf88bb` |
| 31 | `dedicated_bot` | dedicated bot resolver | 2 | 1 | 5 | `integrator_resolver` | 2026-08-09 `dcedf88bb` |
| 32 | `org_directory` | platform org directory | 2 | 2 | 14 | `platform_settings`, `pre_session`, `staff` | 2026-08-09 `dcedf88bb` |
| 33 | `org_invite` | staff organization invite | 2 | 7 | 55 | `patient` | 2026-08-09 `dcedf88bb` |
| 34 | `patient_program_resolver` | patient program resolver | 2 | 4 | 14 | `patient` | 2026-08-09 `dcedf88bb` |
| 35 | `reminder_appointment` | appointment reminder | 2 | 8 | 46 | `operational_delivery_worker` | 2026-08-09 `dcedf88bb` |
| 36 | `reminder_email_cooldown` | email cooldown | 2 | 1 | 3 | `operational_delivery_worker` | 2026-08-09 `dcedf88bb` |
| 37 | `self_security` | PIN/session epoch | 2 | 1 | 3 | `patient` | 2026-08-09 `dcedf88bb` |
| 38 | `telemetry_media` | media telemetry | 2 | 3 | 13 | `patient` | 2026-08-09 `dcedf88bb` |
| 39 | `telemetry_patient` | patient telemetry | 2 | 5 | 44 | `patient` | 2026-08-09 `dcedf88bb` |
| 40 | `catalog_admin` | clinical measure kinds | 1 | 1 | 2 | `service` | 2026-08-09 `dcedf88bb` |
| 41 | `platform_analytics` | дашборд платформенной аналитики (одна функция на 19 таблиц) | 1 | 19 | 59 | `platform_settings` | 2026-08-19 `332f2edd3` |
| 42 | `retention_sweep` | уборка по срокам хранения телеметрии | 1 | 4 | 4 | `operational_maintenance` | 2026-08-19 `e0cf19a04` |
| 43 | `public_clinic_card` | визитка клиники (снят по OWNER_PRODUCT_RULES §33.3) | 0 | 0 | 0 | — | 2026-08-19 `6e5000b5a` |

Точный состав отношений и колонок каждого шва — приложение А в конце документа.

**Наследственность видна в колонке «Заведён»:** 40 из 43 — `2026-08-09`, два коммита; 3 — `2026-08-19`. Причина одна на всех
и записана в самом дизайне (`docs/_TODO/DB_PRIVILEGE_LAYER_REBUILD/evidence/25-definer-seams-without-bypassrls.md`):
«`app_owner` надо заменить не одним новым „сильным владельцем“, а 35 владельцами 35 швов… После разреза ни
одна функция чтения passkey, OTP, reminder, биллинга или телеметрии не получает власть соседнего шва».
Причина верная; разрез по функциям — вот что дало числа.

Три поздних владельца заведены поштучно и по разным поводам (четвёртая строка — добор той же переписи 09.08, не поздний):

| Владелец | Заведён | Причина одной строкой |
|---|---|---|
| `platform_analytics` | 19.08 `332f2edd3` | «дашборд платформы читал девятнадцать таблиц, не имея прав ни на одну дверь» — одна функция закрыла разрыв, владелец заведён под неё |
| `retention_sweep` | 19.08 `e0cf19a04` | «уборка запертых таблиц — один корень с закрытым списком целей» |
| `public_clinic_card` | 19.08 `6e5000b5a` | визитка `/{clinic}`; **снят в тот же день** по §33.3, но роль осталась в кластере |
| `staff_security`, `login_token`, `oauth`, `phone_otp`, `patient_lfk_media` | 09.08 `b023017b8` | добор той же переписи: 112 функций, не попавших в первый проход |

---

## 2. Матрица пересечений

Строится по **выданным** наборам отношений (это то, что реально сложится при слиянии владельцев: слияние
объединяет гранты). Отношение пары — одно из четырёх: `EQUAL` (наборы совпадают), `SUBSET` (один вложен в
другой), `PARTIAL` (пересекаются, но ни один не вложен), `DISJOINT` (не пересекаются).

| Отношение пары | Пар | Доля от 861 |
|---|---:|---:|
| `DISJOINT` | 542 | 63% |
| `PARTIAL` | 281 | 33% |
| `SUBSET` | 38 | 4% |
| `EQUAL` | **0** | 0% |

**Первое, что говорит матрица: двух швов с одинаковой поверхностью нет ни одной пары.** Значит, буквальных
дублей на уровне доступа не существует — каждый шов чем-то отличается от каждого. Дубли, если они есть, —
смысловые, не структурные (§4).

**Второе: 38 вложений почти все тривиальны.** Вложение возникает, когда у меньшего шва **одна-две** таблицы.
Три шва дают 33 из 38 пар: `self_security` (1 таблица — `platform_users`) вложен в 15 других,
`settings_integrator` (1 таблица — `system_settings`) — в 9, `org_directory` (2 таблицы) — в 8. Это не
кандидаты на слияние: слить шов из одной таблицы с швом из 43 таблиц — не экономия, а расширение его двух
функций в 43 раза.

**Формулировка «слияние не даёт объединённому шву ни одной новой таблицы» верна, но неполна.** При вложении
A ⊂ B объединённый шов действительно получает ровно набор B — новых таблиц ноль. Но **функции меньшего шва
A получают доступ ко всему B**. Поэтому ниже каждая пара оценивается по двум вопросам сразу: «сколько
таблиц добавилось объединению» и «куда дотянутся функции меньшего».

### 2.1. Группа «сливаются без расширения» (объединение не добавляет ни одной таблицы)

| Группа | Швов | Функций | Объединение | Самый широкий в одиночку | Новых таблиц |
|---|---:|---:|---:|---:|---:|
| **настройки**: `settings_preauth` + `settings_runtime` + `settings_integrator` | 3 | 23 | 3 | 3 (`settings_runtime`) | **0** |
| **идентичность**: `org_directory` + `identity_lookup` | 2 | 11 | 8 | 8 (`identity_lookup`) | **0** |
| **коммерция**: `patient_org_projection` + `org_commerce` | 2 | 14 | 13 | 13 (`org_commerce`) | **0** |

**Настройки — чистая экономия и прямое нарушение §5 «варианты одного действия».** Все 23 функции имеют
буквально одну форму: `require_*_context(<владелец>, <роль вызывающего>, <цель>)`, затем
`SELECT value_json FROM system_settings|app_runtime_settings WHERE key IN (<белый список ключей>) AND scope=… LIMIT 1`.
Различаются они тремя параметрами: какая роль вызывающего утверждается, какой белый список ключей, какая из
двух таблиц настроек. Ни один из трёх параметров не зависит от того, кто владеет функцией. Стена здесь —
белый список ключей внутри тела и роль в `require_*_context`; имя владельца не добавляет к ней ничего.
Сравнить: `app.get_public_config_bool` (шов `preauth`, `system_settings`, один ключ
`specialist_signup_enabled`), `app.read_public_runtime_setting` (шов `runtime`, `app_runtime_settings`,
`audience='public'`), `app.read_integrator_runtime_setting` (шов `integrator`, `system_settings`, список из
десятка ключей). Три владельца на три параметра одной двери. Класс данных у всех трёх один —
конфигурация. **Рекомендация: сливать, −2 роли.**

**Идентичность — сливается, выигрыш скромный.** `org_directory` (2 функции: список участников организации,
разрешение workspace-принадлежности сотрудника) читает `be_organization_members` и `platform_users` —
обе уже есть у `identity_lookup`. Класс данных совпадает: «кто этот человек и к какой организации
относится». Функции `org_directory` при слиянии дотянутся до `variant_a_identity_refs`, `user_contacts`,
`user_identity`, `user_channel_bindings/preferences` — тот же класс, не здоровье и не деньги.
**Рекомендация: сливать, −1 роль.** Выигрыш — одна роль, риск — нулевой.

**Коммерция — НЕ сливать, несмотря на нулевой прирост таблиц.** Формально `patient_org_projection` (4
функции, всё «какой тариф и какие права у организации этого пациента») вложен в `org_commerce`. Но у
`org_commerce` есть `UPDATE` на `saas_billing_invoices` (`amount_minor`, `currency`, `tariff_id`,
`tariff_snapshot`, …) и `SELECT` на `patient_files`. Слияние дало бы четырём функциям, которые вызывает
`app_patient`, владельца с правом писать в счета. Прирост таблиц ноль, прирост радиуса поражения —
существенный и в сторону денег. **Это тот случай, ради которого «без расширения» нельзя читать как
«безопасно».**

### 2.2. Группа «сливаются с расширением» (объединение добавляет таблицы)

| Группа | Швов | Функций | Новых таблиц | Какие именно | Приемлемо? |
|---|---:|---:|---:|---|---|
| **публичная витрина**: `public_slug` + `public_booking` | 2 | 11 | 4 | `be_organizations`, `media_files`, `organization_slug_claims`, `organization_slug_rename_events` | **да** — публичное к публичному; но по §33.3 правильный шаг не слияние, а снятие обоих |
| **запись**: `patient_booking` + `public_booking` | 2 | 38 | 1 | `clinic_public_directory_entries` | **да** по классу (публичная таблица к записи), но бессмысленно: публичная воронка получит 33 таблицы записи |
| **напоминания у воркера**: `reminder_materialization` + `reminder_appointment` + `reminder_specialist` | 3 | 18 | 2 | `be_organization_members`, `specialist_tasks` | **условно** — один класс (доставка), но `reminder_appointment` уже полностью вложен в `materialization`, слияние именно этой пары даёт 0 новых таблиц |
| **коммерция ×3** (+ `org_invite`) | 3 | 16 | 1 | `platform_users` | **нет** — та же проблема, что в §2.1: запись в счета |
| **аналитика**: `telemetry_patient` + `telemetry_exclusion` + `retention_sweep` | 3 | 6 | 4 | `media_hls_proxy_error_events`, `platform_users`, `system_settings`, `user_channel_bindings` | **нет** — уборщик по срокам хранения получил бы `platform_users`; уборка не должна видеть людей |

Единственная строка отсюда, которую стоит взять: **`reminder_appointment` ⊂ `reminder_materialization`
полностью** (8 таблиц вложены в 15, обе вызываются `app_operational_delivery_worker`, класс один —
доставка напоминаний). Слияние этой пары даёт 0 новых таблиц объединению; функции `reminder_appointment`
дотянутся до `reminder_rules`, `content_pages`, `content_sections` — тот же контур доставки. Это
**кандидат, но не очевидный**: `reminder_appointment` работает с `be_appointments` (записи на приём),
`materialization` — с расписанием напоминаний; сегодня это разные вещи в продукте. Выношу как вопрос, не
как рекомендацию.

### 2.3. Группа «не сливаются» — принципиально разные поверхности

**542 пары из 861 не пересекаются вообще.** Ядро этой группы — швы, держащие секреты:

| Шов | Таблицы | С кем пересекается |
|---|---|---|
| `passkey` | `user_passkey_accounts`, `user_passkey_challenges`, `user_passkey_credentials` | **ни с кем** |
| `phone_otp` | `phone_challenges`, `phone_otp_locks` | **ни с кем** |
| `staff_security` | `staff_security_profiles` | **ни с кем** |
| `login_token` | `login_tokens` | **ни с кем** |
| `oauth` | `user_oauth_bindings` | **ни с кем** |
| `dedicated_bot` | `clinic_dedicated_bot_bindings` | **ни с кем** |
| `catalog_admin` | `integrator.schema_migrations` | **ни с кем** |
| `reminder_email_cooldown` | `email_send_cooldowns` | только с `email_otp` |

Пять секретных швов (`passkey`, `phone_otp`, `staff_security`, `login_token`, `oauth`) не пересекаются ни с
одним другим швом ни одной таблицей. Это не избыточность, это ровно то, ради чего разрез делался. Их не
трогать.

Среди auth-швов, которые пересекаются, пересечение минимально и осмысленно: `password_auth` ∩ `email_otp` =
`{email_challenges, platform_users}` — оба участвуют в подтверждении почты; `platform_users` — общая
таблица людей, к которой почти все имеют узкий колоночный грант. Слияние `password_auth` с `email_otp`
дало бы одному владельцу и хеши паролей (`user_password_credentials`), и хеши OTP (`email_challenges`) —
**нет**.

Отдельно: `patient_self_actions` (54 функции, 43 таблицы, 331 колонка) — самый широкий шов и единственный,
кто держит здоровье и переписку человека (`symptom_entries`, `patient_diary_day_snapshots`,
`support_conversation_messages`, `treatment_program_*`, `program_item_discussion_*`). Его нельзя сливать ни
с чем; наоборот, он единственный, к кому вопрос «а не надо ли разрезать» имеет смысл — но это не сегодняшняя
работа и владелец её не заказывал.

---

## 3. Швы, существующие ради ОДНОЙ функции

Их три (плюс один вообще без функций, см. §5).

| Шов | Функция | Таблиц | Оправдан? |
|---|---|---:|---|
| `platform_analytics` | `app.read_platform_analytics_dashboard(…)` | **19** | **да, и это не «малый шов»**. Одна функция, но радиус — 19 таблиц: `be_appointments`, `clinical_visit`, `symptom_entries`, `symptom_trackings`, `treatment_program_instances`, `program_action_log`… То есть дашборд платформы читает здоровье людей поперёк всех арендаторов. Отдельный владелец здесь — единственное, что не даёт `app_platform_settings` получить это напрямую. Если бы эту функцию отдали существующему шову, им пришлось бы стать `patient_self_actions` — и тогда пациентские функции получили бы кросс-арендное чтение. Заводить было правильно. |
| `retention_sweep` | `app.prune_retention_target(p_target, p_retention_days, p_dry_run)` | 4 | **да**. Единственный шов с `DELETE` по срокам хранения на телеметрии (`product_analytics_events_recent`, `product_analytics_user_hourly`, `product_push_notifications`, `media_hls_proxy_error_events`) и единственный, кого вызывает `app_operational_maintenance`. Ближайший по таблицам — `telemetry_patient` (3 общие из 4), но у него `app_patient` в `EXECUTE`; слияние дало бы пациентскому контуру владельца с правом удалять телеметрию. Держать отдельно. |
| `catalog_admin` | `app.read_integrator_migration_ledger()` | 1 | **нет — но не из-за размера, а из-за имени.** Шов называется «catalog admin», в переписи 09.08 числится как «clinical measure kinds» с тремя функциями; сегодня у него одна функция, читающая `integrator.schema_migrations` — журнал миграций, диагностика, а не каталог. Имя не описывает работу. По §5 «если после расширения имя точки перестало описывать её работу, точка переименовывается в том же изменении» — этого не сделали. По содержанию это операторская диагностика, и её место — `telemetry_operator` (17 таблиц, уже читает `integrator.delivery_attempt_logs`, `integrator.projection_outbox`, `operator_job_status`). Слияние добавило бы `telemetry_operator` одну таблицу `integrator.schema_migrations` — тот же класс, ничего чувствительного. **Кандидат на слияние с расширением на 1 таблицу.** |

Два вывода. Первый: **число функций — плохая мера избыточности шва.** `platform_analytics` с одной функцией
опаснее и нужнее, чем `settings_integrator` с десятью. Правильная мера — сколько **классов данных** шов
держит и что случится, если его функции ошибутся. Второй: из трёх однофункциональных швов лишний ровно
один, и он лишний потому, что его назвали не тем, что он делает.

Одиннадцать двухфункциональных швов проверены тем же вопросом. Оправданы девять:

- `dedicated_bot`, `login_token`(5), `oauth`(5), `phone_otp`(11), `staff_security`(12) — держат по одной
  секретной таблице, ни с кем не пересекаются;
- `reminder_email_cooldown` — держит `email_send_cooldowns` для `app_operational_delivery_worker`.
  Формально вложен в `email_otp` (у того та же таблица). **Но слияние дало бы воркеру доставки владельца,
  который читает `email_challenges` — хеши OTP.** Шов существует ровно чтобы этого не было: это образцовый
  случай «маленький шов оправдан»;
- `telemetry_media` — 2 функции записи телеметрии проигрывания (`media_playback_resolution_events`,
  `media_playback_stats_hourly`), вызывает только `app_patient`. Пересекается с `platform_analytics` по
  `media_files`/`media_playback_resolution_events`, но у того `EXECUTE` только у `app_platform_settings`;
- `telemetry_patient` — 2 функции записи пользовательской аналитики. См. `retention_sweep` выше;
- `patient_program_resolver` — 2 функции, разрешающие организацию и описание программы лечения; читает
  `treatment_program_instances`/`templates`. Пересекается с `patient_self_actions` по
  `treatment_program_instances` и `org_enrollments` — но `patient_self_actions` держит 43 таблицы здоровья,
  и слияние туда — расширение в худшую сторону.

Не оправданы два, и оба уже названы: `org_directory` (сливается в `identity_lookup`, §2.1) и
`self_security` — 2 функции (`bump_platform_user_session_epoch_self`, триггер
`propagate_staff_session_version_to_session_epoch`), одна таблица `platform_users`, 3 колонки. Он вложен в
15 других швов, то есть «слить его» технически можно с чем угодно — и именно поэтому нельзя ни с чем: любой
адресат расширит его функции в разы. **Оставить как есть.** Это честный ответ «маленький, но пусть живёт».

---

## 4. Швы-дубликаты по смыслу

Структурных дублей нет: пар с совпадающими наборами отношений — **0**. Смысловых дублей — три случая.

**1. Три двери настроек — одна дверь (сильный дубль).** `settings_preauth` (7 функций),
`settings_runtime` (6), `settings_integrator` (10). 23 функции одной формы, две таблицы на всех, объединение
= 3 таблицы = столько же, сколько уже у самого широкого. Разрез сделан по **вызывающему** (pre-session /
runtime / integrator), но вызывающий и так утверждается внутри тела через `require_*_context(…, 'app_pre_session', …)`
и `require_attested_context_for_roles(…, ARRAY['app_integrator_request'])`. Владелец шва здесь дублирует
проверку, которая уже стоит строкой ниже. Это ровно §5: «Записаться по телефону, по почте и без контактов
вообще — это один вход с разными параметрами, а не три».

**2. `catalog_admin` — не дубль, а неверное имя.** См. §3. Дверь одна, но она не про каталог.

**3. `org_directory` и `identity_lookup` — две двери к одному вопросу.** «Кто этот человек и в какой он
организации». `org_directory.resolve_staff_workspace_memberships(p_platform_user_id)` и
`identity_lookup`-набор отвечают на соседние половины одного вопроса, читают пересекающиеся таблицы,
`org_directory` полностью вложен. Мягкий дубль: два имени для двери «разрешить принадлежность».

Проверено и **не** признано дублями: `public_slug` и `public_booking` (разные таблицы: слаги и справочник
против расписания и услуг — но оба подпадают под §33.3 и снимаются целиком, а не сливаются);
`telemetry_patient` и `telemetry_media` (разные события, разные таблицы, общий только `org_enrollments`);
`reminder_patient` и `reminder_specialist` (разные адресаты, `specialist_tasks` только у второго).

---

## 5. Мёртвые швы и мёртвые функции

### 5.1. Мёртвый шов: `app_seam_public_clinic_card_owner`

Роль существует в кластере и **не держит ничего**. Семь независимых проверок на живом DEV, все дали ноль:

| Проверка | Запрос | Результат |
|---|---|---:|
| владеет функциями | `pg_proc join pg_roles on proowner` | 0 |
| табличные гранты | `information_schema.role_table_grants where grantee=…` | 0 |
| колоночные гранты | `information_schema.role_column_grants where grantee=…` | 0 |
| упомянута в чьём-либо `EXECUTE` | `pg_proc where proacl::text like '%…%'` | 0 |
| владеет отношениями | `pg_class join pg_roles on relowner` | 0 |
| состоит в ролях / имеет членов | `pg_auth_members` в обе стороны | 0 / 0 |
| гранты на схему | `pg_namespace where nspacl::text like '%…%'` | 0 |

**Ноль здесь пустотой не является по построению:** это не «выборка под RLS вернула ноль строк», а семь
разных системных каталогов, каждый из которых перечисляет ВСЕ существующие связи этого класса. Роль
заведена 19.08 (`6e5000b5a`, визитка `/{clinic}`) и в тот же день снята из декларации по §33.3 — комментарий
об этом стоит прямо в `deploy/postgres/privileges/declaration.ts:3993-3996`: «Отдельного владельца под
визитку здесь БЫЛО (`app_seam_public_clinic_card_owner`) и он снят по OWNER_PRODUCT_RULES §33.3/§33.5».
Из декларации ушёл, из кластера — нет. Это тот самый случай, который владелец описал в §33.3: «один такой
владелец уронил выкатку на TEST, появившись в кластере раньше, чем в декларации».

### 5.2. Мёртвые функции: 9 штук в 6 швах

Достижимость считалась так: корни — функции, у которых есть (а) вызов из продуктового кода
(`apps/webapp/src`, `apps/integrator/src`, `apps/media-worker/src`, `packages`, тесты исключены), либо
(б) привязка триггером (`pg_trigger where not tgisinternal`, 20 живых триггеров); затем транзитивное
замыкание по графу вызовов, построенному по телам ВСЕХ функций базы (не только швовых), чтобы
функция-делегат считалась живой. Недостижимые:

| Функция | Шов | Чем проверено «нет вызовов» |
|---|---|---|
| `app.email_otp_public_delete_unverified_registration` | `email_otp` | точный `grep` по 4 продуктовым корням; `code-search --repo bcb`; поиск по телам всех функций базы; `pg_trigger` |
| `app.email_otp_public_find_latest_email_challenge_by_email` | `email_otp` | то же |
| `app.list_active_booking_cities` | `catalog_public` | то же |
| `app.list_web_push_reminder_organization_ids` | `reminder_materialization` | то же |
| `app.mark_patient_reminder_occurrence_queued` | `reminder_materialization` | то же |
| `app.upsert_patient_reminder_occurrence_plan` | `reminder_materialization` | то же |
| `app.patient_set_reminder_muted_until` | `reminder_patient` | то же + ручная проверка: вызываются соседи `app.patient_set_reminder_mute` (`apps/integrator/src/infra/adapters/remindersWritesPort.ts:86`) и `app.set_current_patient_reminder_muted_until` (`apps/webapp/src/infra/repos/pgReminderRules.ts:498`) — а эта третья нет |
| `app.require_platform_principal` | `context` | то же; единственные вхождения — `deploy/postgres/port-context/contract.sql` (определение) и `function-census.test.mjs` |
| `app.set_staff_security_self_password_hash` | `password_auth` | то же; вхождения только в сгенерированных `privileges.*.sql` и `d3-4-bootstrap-base-login-read-grants.sql` (гранты, не вызовы) |

**Где искали, полный перечень** (это доказательство «нет», а не его отсутствие): 1) `grep -rlE` по
`apps/webapp/src`, `apps/integrator/src`, `apps/media-worker/src`, `packages` — шаблон ловит и
`app.имя`, и голое `'имя'` в SQL-строке, тестовые файлы исключены; 2) `grep -rn` по всему репозиторию
включая `*.sql`, `*.md`, тесты — все попадания оказались в сгенерированных файлах привилегий, декларации,
переписи и старых документах-евиденсах; 3) `node /home/dev/brain/tools/code-search.mjs "<имя>" --repo bcb`
(BM25-индекс от 2026-08-19T17:00, 24105 чанков) — по каждой из пяти самых спорных; 4) поиск подстроки
`<короткое_имя>(` по `prosrc` всех функций схем `app`/`app_ext`/`integrator`/`public` живой DEV;
5) `pg_trigger`. **Ни один шов не мёртв целиком по функциям** — самая высокая доля мёртвых у
`reminder_materialization`: 3 из 10.

Мёртвые функции — не задача этой работы (§5 канона: «Мёртвый код не стоит миграции ради его удаления»), но
они объясняют часть чисел: `catalog_public` держит 2 функции, из которых работает одна.

---

## 6. Сверка декларации с живым кластером

| Что сверялось | Результат |
|---|---|
| Список ролей в `declaration.ts` (`REV10_SEAM_OWNERS`) против `pg_roles` | 42 `app_seam_*` в декларации, **43** в кластере. Лишняя в кластере — `app_seam_public_clinic_card_owner` (§5.1) |
| Колоночные гранты против лексической поверхности тел (`prosrc` → `extractRelationOperations`) | **расхождений 0** в обе стороны: ни одного гранта на таблицу, которой шов не касается; ни одного касания без гранта |
| Владелец каждой функции в кластере против `owner` в `function-census.ts` | сходится (владельцы функций брались из `pg_proc.proowner`, имена совпали) |
| Назначение шва в `evidence/30` против фактического тела | одно расхождение: `catalog_admin` числится «clinical measure kinds» (3 функции), фактически — `read_integrator_migration_ledger` на `integrator.schema_migrations` (1 функция) |

Нулевое расхождение по грантам — хороший знак: артефакт привилегий действительно держит гранты в
синхроне с телами. Проблема не в рассинхроне, а в том, что **число владельцев ничем не ограничено**.

---

## 7. Чего не хватает в каноне — проект правила (ведущему, в `AGENTS.md` не вписан)

Сегодня правила «когда заводить нового владельца шва, а когда переиспользовать существующего» **нет вовсе**.
Проверено: `AGENTS.md` §5 п. 6 говорит только общее «не плодить сущности»; `OWNER_PRODUCT_RULES.md` §33.3
закрывает **один частный случай** (публичные данные — швом не охранять) и появился 19.08;
`deploy/postgres/privileges/README.md` описывает, КАК завести владельца, но не КОГДА. Из-за этого локально
всегда дешевле завести своего владельца, чем доказать, что подходит существующий: доказательство требует
прочитать чужие поверхности, заведение — дописать строку. Отсюда 43 владельца, 14 из которых держат
одну-две функции, и один — ноль.

Ниже — проект. Форма — «условие → действие → граница → что считается выполненным → смысл», как в остальных
разделах канона.

> ### Владелец шва заводится только на границе класса данных
>
> **Условие (когда дверь вообще нужна).** `SECURITY DEFINER`-дверь нужна ровно тогда, когда вызывающей роли
> нельзя дать прямой доступ к строкам, которые дверь обслуживает: секрет аутентификации, данные о здоровье
> и переписка человека, деньги с правом записи, кросс-арендный агрегат. Публичная витрина — не этот случай
> (`OWNER_PRODUCT_RULES.md` §33.3): она читается обычным чтением, без двери и без владельца.
>
> **Действие (кому дверь принадлежит) — в этом порядке, первый подошедший выигрывает:**
> 1. Есть существующий владелец, чей набор отношений уже **содержит все** отношения новой двери и чей класс
>    данных совпадает → дверь отдаётся ему. Новый владелец не заводится.
> 2. Полного надмножества нет, но есть владелец **того же класса**, которому объединение добавит только
>    отношения того же класса → расширить его, назвав в коммите добавленные отношения поимённо.
> 3. Новый владелец заводится, только когда любое объединение с существующим пересекло бы границу класса.
>
> **Граница — классы данных. Владелец шва живёт ровно в одном:**
> `S` секреты аутентификации (хеши паролей/PIN/OTP, passkey, токены входа, OAuth-привязки) ·
> `H` здоровье и переписка человека (программы, дневники, симптомы, файлы, сообщения) ·
> `M` деньги с правом записи (счета, платежи, тарифные переходы) ·
> `O` операционная телеметрия, очереди и уборка ·
> `I` идентичность и принадлежность к организации ·
> `C` конфигурация (`system_settings`, `app_runtime_settings`) ·
> `P` публичное — швом не охраняется вовсе.
> Дверь, которой нужны два класса, — не повод завести третьего владельца: это признак, что дверь делает две
> вещи, и её делят.
>
> **Варианты одного действия — один владелец и одна дверь с параметрами** (`AGENTS.md` §5). «Прочитать
> настройку», «прочитать настройку интегратора», «прочитать публичную настройку» — это одна дверь с
> параметрами `ключ`/`область`/`аудитория`, а не три двери и тем более не три владельца. Стена там — белый
> список ключей в теле и роль в `require_*_context`, не имя владельца.
>
> **Имя владельца описывает его работу.** Если после расширения имя перестало описывать, что дверь делает,
> владелец переименовывается тем же изменением.
>
> **Что считается выполненным.** В PR, заводящем `app_seam_*_owner`, названы: (а) класс данных двери;
> (б) какие существующие владельцы проверены по п. 1–2 и почему не подошли; (в) какое именно объединение
> пересекло бы границу класса. Без (в) новый владелец не проходит. Механическая часть: список владельцев в
> `declaration.ts` — единственный источник, роль в кластере без строки в декларации роняет выкатку (это уже
> работает и уже поймало `public_clinic_card`).
>
> **Смысл.** Владелец шва сам по себе защиты не даёт — защиту дают тело функции и колоночный грант. Владелец
> ограничивает только то, до чего дотянется **ошибка в теле**. Поэтому его стоит заводить ровно там, где
> ошибка дотянулась бы до другого класса данных, и не стоит — там, где она осталась бы внутри своего.
> Лишний владелец не бесплатен: строка в декларации, строка в переписи, строка в сверке и отказ выкатки при
> рассинхроне.

**Что это правило дало бы на сегодняшних числах, если применить задним числом:** три шва настроек стали бы
одним (класс `C`, п. 1 — все три читают одни и те же таблицы); `org_directory` ушёл бы в `identity_lookup`
(класс `I`, п. 1); `catalog_admin` не завёлся бы вовсе (класс `O`, п. 2 — расширение `telemetry_operator`);
`public_clinic_card` не завёлся бы (класс `P` — двери нет); `platform_analytics` и `retention_sweep`
завелись бы как есть (п. 3 — пересекают границу `H` и `O` соответственно). 43 → 37.

---

## 8. Итог: что можно снять, что нельзя

| Действие | Ролей | Новых таблиц кому-либо | Основание |
|---|---:|---:|---|
| Снять мёртвую `public_clinic_card` из кластера | −1 | 0 | §5.1, уже снята из декларации |
| Слить три шва настроек в один | −2 | 0 | §2.1, `AGENTS.md` §5 «варианты одного действия» |
| Слить `org_directory` в `identity_lookup` | −1 | 0 | §2.1, один класс `I`, полное вложение |
| Снять швы публичной витрины (`public_slug`, `public_booking`) | −2 | 0 | `OWNER_PRODUCT_RULES.md` §33.3/§33.5 — решение владельца, отдельная работа |
| **Итого** | **43 → 37** | **0** | |

Не трогать: пять секретных швов (`passkey`, `phone_otp`, `staff_security`, `login_token`, `oauth`) — ни
одного пересечения ни с кем; `reminder_email_cooldown` — существует ровно чтобы воркер доставки не видел
хеши OTP; `self_security` — вложен в 15 швов, поэтому не сливается ни с одним; `platform_analytics` и
`retention_sweep` — однофункциональные, но пересекают границу класса; `patient_self_actions` — 43 таблицы
здоровья, единственный кандидат на разрез, а не на слияние.

Открытые вопросы владельцу (не решаю сам):
1. `reminder_appointment` полностью вложен в `reminder_materialization`, оба у воркера доставки. Слить (−1
   роль, 0 новых таблиц) или это разные вещи в продукте — напоминание о записи и материализация расписания?
2. `catalog_admin` (журнал миграций интегратора) переименовать или влить в `telemetry_operator` (+1 таблица
   `integrator.schema_migrations`, тот же класс)?
3. Девять мёртвых функций (§5.2) — удалять отдельной работой или оставить?

---

## Приложение А. Точный состав каждого шва

Формат: `отношение` — `ПРАВО(колонки)`. Источник — `information_schema.role_column_grants` живого
`bcb_webapp_dev` (для двух таблиц `app_ext` — табличные гранты). ⚠️мёртвая — функция недостижима (§5.2).

#### `app_seam_patient_self_actions_owner` — 54 функц., 43 отношений

EXECUTE: `app_patient`

Функции: `app.append_current_patient_program_discussion`, `app.append_current_patient_program_event`, `app.append_current_patient_support_message`, `app.apply_current_patient_warmup_feeling`, `app.capture_current_patient_diary_day_snapshot`, `app.complete_current_patient_program_item`, `app.configure_current_patient_assigned_symptom_tracking`, `app.create_current_patient_reminder_rule`, `app.current_patient_lfk_sessions`, `app.delete_current_patient_program_actions_in_window`, `app.delete_current_patient_reminder_rule`, `app.delete_current_patient_symptom_entry`, `app.enrich_current_patient_program_completion`, `app.ensure_current_patient_support_conversation`, `app.ensure_current_patient_system_symptom_tracking`, `app.ensure_current_patient_test_attempt`, `app.mark_all_current_patient_reminder_history_seen`, `app.mark_current_patient_program_discussion_read`, `app.mark_current_patient_program_item_viewed`, `app.mark_current_patient_reminder_history_seen`, `app.mark_current_patient_support_conversation_read`, `app.mark_current_patient_support_messages_read`, `app.mark_current_patient_support_notifications_read`, `app.read_current_patient_fio`, `app.read_current_patient_material_rating_snapshot`, `app.record_current_patient_content_rating_feedback`, `app.record_current_patient_daily_warmup_video_view`, `app.record_current_patient_playback_client_event`, `app.record_current_patient_playback_first_resolve`, `app.record_current_patient_practice_completion`, `app.record_current_patient_program_action`, `app.record_current_patient_reminder_journal_action`, `app.record_current_patient_symptom_entry`, `app.remove_all_current_patient_web_push_subscriptions`, `app.remove_current_patient_web_push_subscription`, `app.save_current_patient_channel_preference`, `app.save_current_patient_daily_warmup_presentation`, `app.save_current_patient_test_result`, `app.save_current_patient_web_push_subscription`, `app.set_current_patient_calendar_timezone`, `app.set_current_patient_notification_topic`, `app.set_current_patient_notification_topic_channel`, `app.set_current_patient_preferred_auth_channel`, `app.set_current_patient_reminder_muted_until`, `app.start_current_patient_test_attempt`, `app.submit_current_patient_test_attempt`, `app.touch_current_patient_plan_last_opened`, `app.touch_current_patient_program_item`, `app.touch_current_patient_support_conversation_activity`, `app.update_current_patient_fio`, `app.update_current_patient_practice_completion_feeling`, `app.update_current_patient_reminder_rule`, `app.update_current_patient_symptom_entry`, `app.upsert_current_patient_material_rating`

- `public.admin_audit_log` — INSERT(action,actor_id,details,organization_id,target_id)
- `public.app_runtime_settings` — SELECT(audience,key,organization_id,scope,value_json)
- `public.content_pages` — SELECT(archived_at,body_html,body_md,deleted_at,id,image_url,is_published,organization_id,slug,video_url)
- `public.lfk_complexes` — SELECT(id,is_active,organization_id,platform_user_id,title,user_id)
- `public.lfk_sessions` — INSERT(comment,completed_at,complex_id,created_at,difficulty_0_10,duration_minutes,id,organization_id,pain_0_10,recorded_at,source,user_id); SELECT(comment,completed_at,complex_id,created_at,difficulty_0_10,duration_minutes,id,organization_id,pain_0_10,recorded_at,source,user_id); UPDATE(comment,completed_at,complex_id,created_at,difficulty_0_10,duration_minutes,id,organization_id,pain_0_10,recorded_at,source,user_id)
- `public.material_ratings` — INSERT(organization_id,stars,target_id,target_kind,updated_at,user_id); SELECT(organization_id,stars,target_id,target_kind,updated_at,user_id); UPDATE(organization_id,stars,target_id,target_kind,updated_at,user_id)
- `public.media_files` — SELECT(id,organization_id,owner_kind,uploaded_by,usage_purpose)
- `public.media_playback_client_events` — INSERT(delivery,error_detail,event_class,media_id,organization_id,user_agent,user_id)
- `public.media_playback_user_video_first_resolve` — INSERT(media_id,organization_id,user_id); SELECT(media_id,user_id)
- `public.org_enrollments` — SELECT(id,organization_id,platform_user_id,status)
- `public.patient_content_rating_feedback` — INSERT(comment,content_page_id,id,organization_id,rating_value,reason_codes,user_id); SELECT(id)
- `public.patient_daily_warmup_presentations` — INSERT(content_page_id,last_rotation_at,organization_id,skip_next_scheduled_rotation,updated_at,user_id); SELECT(content_page_id,last_rotation_at,organization_id,skip_next_scheduled_rotation,updated_at,user_id); UPDATE(content_page_id,last_rotation_at,organization_id,skip_next_scheduled_rotation,updated_at,user_id)
- `public.patient_daily_warmup_video_views` — INSERT(content_page_id,organization_id,user_id)
- `public.patient_diary_day_snapshots` — INSERT(iana,local_date,organization_id,plan_done_mask,plan_instance_id,plan_item_ids,platform_user_id,warmup_all_done,warmup_done_count,warmup_slot_limit); SELECT(local_date,platform_user_id)
- `public.patient_home_block_items` — SELECT(block_code,is_visible,organization_id,target_ref,target_type)
- `public.patient_home_blocks` — SELECT(code,is_visible,organization_id)
- `public.patient_practice_completions` — INSERT(content_page_id,feeling,id,notes,organization_id,source,user_id); SELECT(completed_at,feeling,id,organization_id,source,user_id); UPDATE(completed_at,feeling,id,organization_id,source,user_id)
- `public.platform_users` — SELECT(calendar_timezone,email_verified_at,id,merged_into_id,reminder_muted_until,role,updated_at); UPDATE(calendar_timezone,display_name,first_name,id,last_name,merged_into_id,patronymic,reminder_muted_until,role,updated_at)
- `public.program_action_log` — INSERT(action_type,created_at,id,instance_id,instance_stage_item_id,note,organization_id,patient_user_id,payload,session_id); SELECT(action_type,created_at,id,instance_id,instance_stage_item_id,note,organization_id,patient_user_id,payload,session_id); UPDATE(action_type,created_at,id,instance_id,instance_stage_item_id,note,organization_id,patient_user_id,payload,session_id)
- `public.program_item_discussion_messages` — INSERT(body,created_at,id,instance_stage_item_id,media_file_id,organization_id,origin,patient_user_id,sender_role,support_message_id); SELECT(body,created_at,id,instance_stage_item_id,media_file_id,organization_id,origin,patient_user_id,sender_role,support_message_id)
- `public.program_item_discussion_reads` — INSERT(instance_stage_item_id,last_read_at,organization_id,patient_user_id); SELECT(instance_stage_item_id,last_read_at,organization_id,patient_user_id); UPDATE(instance_stage_item_id,last_read_at,organization_id,patient_user_id)
- `public.reference_categories` — SELECT(code,id)
- `public.reference_items` — SELECT(category_id,id,is_active,organization_id)
- `public.reminder_journal` — INSERT(action,created_at,id,occurrence_id,organization_id,rule_id,skip_reason,snooze_until); SELECT(action,created_at,id,occurrence_id,organization_id,rule_id,skip_reason,snooze_until)
- `public.reminder_occurrence_history` — SELECT(integrator_occurrence_id,organization_id,platform_user_id,seen_at); UPDATE(integrator_occurrence_id,organization_id,platform_user_id,seen_at)
- `public.reminder_rules` — INSERT(category,content_mode,created_at,custom_text,custom_title,days_mask,display_description,display_title,id,integrator_rule_id,integrator_user_id,interval_minutes,is_enabled,linked_object_id,linked_object_type,notification_topic_code,organization_id,platform_user_id,quiet_hours_end_minute,quiet_hours_start_minute,reminder_intent,schedule_data,schedule_type,timezone,updated_at,window_end_minute,window_start_minute); SELECT(category,content_mode,created_at,custom_text,custom_title,days_mask,display_description,display_title,id,integrator_rule_id,integrator_user_id,interval_minutes,is_enabled,linked_object_id,linked_object_type,notification_topic_code,organization_id,platform_user_id,quiet_hours_end_minute,quiet_hours_start_minute,reminder_intent,schedule_data,schedule_type,timezone,updated_at,window_end_minute,window_start_minute); UPDATE(category,content_mode,created_at,custom_text,custom_title,days_mask,display_description,display_title,id,integrator_rule_id,integrator_user_id,interval_minutes,is_enabled,linked_object_id,linked_object_type,notification_topic_code,organization_id,platform_user_id,quiet_hours_end_minute,quiet_hours_start_minute,reminder_intent,schedule_data,schedule_type,timezone,updated_at,window_end_minute,window_start_minute)
- `public.support_conversation_messages` — INSERT(conversation_id,created_at,delivered_at,delivery_status,external_chat_id,external_message_id,id,integrator_message_id,media_type,media_url,message_type,organization_id,read_at,sender_role,source,text); SELECT(conversation_id,created_at,delivered_at,delivery_status,external_chat_id,external_message_id,id,integrator_message_id,media_type,media_url,message_type,organization_id,read_at,sender_role,source,text); UPDATE(conversation_id,created_at,delivered_at,delivery_status,external_chat_id,external_message_id,id,integrator_message_id,media_type,media_url,message_type,organization_id,read_at,sender_role,source,text)
- `public.support_conversations` — INSERT(admin_scope,channel_code,channel_external_id,close_reason,closed_at,created_at,id,integrator_conversation_id,integrator_user_id,last_message_at,opened_at,organization_id,pending_message_drafts,platform_user_id,source,status,updated_at); SELECT(admin_scope,channel_code,channel_external_id,close_reason,closed_at,created_at,id,integrator_conversation_id,integrator_user_id,last_message_at,opened_at,organization_id,pending_message_drafts,platform_user_id,source,status,updated_at); UPDATE(admin_scope,channel_code,channel_external_id,close_reason,closed_at,created_at,id,integrator_conversation_id,integrator_user_id,last_message_at,opened_at,organization_id,pending_message_drafts,platform_user_id,source,status,updated_at)
- `public.symptom_entries` — INSERT(created_at,entry_type,id,notes,organization_id,patient_practice_completion_id,platform_user_id,recorded_at,source,tracking_id,user_id,value_0_10); SELECT(created_at,entry_type,id,notes,organization_id,patient_practice_completion_id,platform_user_id,recorded_at,source,tracking_id,user_id,value_0_10); UPDATE(created_at,entry_type,id,notes,organization_id,patient_practice_completion_id,platform_user_id,recorded_at,source,tracking_id,user_id,value_0_10)
- `public.symptom_trackings` — INSERT(created_at,deleted_at,diagnosis_ref_id,diagnosis_text,id,is_active,organization_id,platform_user_id,region_ref_id,side,stage_ref_id,symptom_key,symptom_title,symptom_type_ref_id,updated_at,user_id); SELECT(created_at,deleted_at,diagnosis_ref_id,diagnosis_text,id,is_active,organization_id,platform_user_id,region_ref_id,side,stage_ref_id,symptom_key,symptom_title,symptom_type_ref_id,updated_at,user_id); UPDATE(created_at,deleted_at,diagnosis_ref_id,diagnosis_text,id,is_active,organization_id,platform_user_id,region_ref_id,side,stage_ref_id,symptom_key,symptom_title,symptom_type_ref_id,updated_at,user_id)
- `public.test_attempts` — INSERT(accepted_at,accepted_by,id,instance_stage_item_id,organization_id,patient_user_id,started_at,submitted_at); SELECT(accepted_at,accepted_by,id,instance_stage_item_id,organization_id,patient_user_id,started_at,submitted_at); UPDATE(accepted_at,accepted_by,id,instance_stage_item_id,organization_id,patient_user_id,started_at,submitted_at)
- `public.test_results` — INSERT(attempt_id,created_at,decided_by,id,normalized_decision,organization_id,raw_value,test_id); SELECT(attempt_id,created_at,decided_by,id,normalized_decision,organization_id,raw_value,test_id); UPDATE(attempt_id,created_at,decided_by,id,normalized_decision,organization_id,raw_value,test_id)
- `public.treatment_program_events` — INSERT(actor_id,created_at,event_type,id,instance_id,organization_id,payload,reason,target_id,target_type); SELECT(actor_id,created_at,event_type,id,instance_id,organization_id,payload,reason,target_id,target_type)
- `public.treatment_program_instance_stage_items` — SELECT(completed_at,id,is_actionable,item_ref_id,item_type,last_viewed_at,organization_id,snapshot,stage_id,status); UPDATE(completed_at,id,is_actionable,item_ref_id,item_type,last_viewed_at,organization_id,snapshot,stage_id,status)
- `public.treatment_program_instance_stages` — SELECT(id,instance_id,organization_id,sort_order,started_at,status); UPDATE(id,instance_id,organization_id,sort_order,started_at,status)
- `public.treatment_program_instances` — SELECT(assignment_source,id,organization_id,patient_plan_last_opened_at,patient_user_id,status,updated_at); UPDATE(assignment_source,id,organization_id,patient_plan_last_opened_at,patient_user_id,status,updated_at)
- `public.user_channel_bindings` — SELECT(channel_code,user_id)
- `public.user_channel_preferences` — INSERT(channel_code,created_at,id,is_enabled_for_messages,is_enabled_for_notifications,is_preferred_for_auth,platform_user_id,updated_at,user_id); SELECT(channel_code,created_at,id,is_enabled_for_messages,is_enabled_for_notifications,is_preferred_for_auth,platform_user_id,updated_at,user_id); UPDATE(channel_code,created_at,id,is_enabled_for_messages,is_enabled_for_notifications,is_preferred_for_auth,platform_user_id,updated_at,user_id)
- `public.user_identity` — INSERT(display_name,first_name,last_name,patronymic,platform_user_id,updated_at); SELECT(display_name,first_name,last_name,patronymic,platform_user_id,updated_at); UPDATE(display_name,first_name,last_name,patronymic,platform_user_id,updated_at)
- `public.user_notification_topic_channels` — INSERT(channel_code,is_enabled,topic_code,updated_at,user_id); SELECT(channel_code,is_enabled,topic_code,updated_at,user_id); UPDATE(channel_code,is_enabled,topic_code,updated_at,user_id)
- `public.user_notification_topics` — INSERT(is_enabled,topic_code,updated_at,user_id); SELECT(is_enabled,topic_code,updated_at,user_id); UPDATE(is_enabled,topic_code,updated_at,user_id)
- `public.user_phone_history` — SELECT(platform_user_id,valid_to)
- `public.user_web_push_subscriptions` — INSERT(auth,created_at,endpoint,id,p256dh,updated_at,user_agent,user_id); SELECT(auth,created_at,endpoint,id,p256dh,updated_at,user_agent,user_id); UPDATE(auth,created_at,endpoint,id,p256dh,updated_at,user_agent,user_id)

#### `app_seam_patient_booking_owner` — 34 функц., 33 отношений

EXECUTE: `app_patient`, `app_service`, `app_tenant_service`, `app_worker`

Функции: `app.apply_current_patient_booking_cancellation`, `app.apply_current_patient_booking_reschedule`, `app.count_active_canonical_appointments`, `app.create_current_patient_booking_appointments`, `app.create_current_patient_booking_pending`, `app.delete_google_calendar_event_id`, `app.get_google_calendar_event_id`, `app.is_current_patient_self_booking_allowed`, `app.list_active_canonical_appointments_by_phone`, `app.mutate_current_patient_booking`, `app.patch_current_patient_booking_notifications`, `app.read_booking_calendar_latest_staff_comment`, `app.read_booking_calendar_patient_profile`, `app.read_canonical_appointment_by_external_id`, `app.read_current_patient_appointment_history`, `app.read_current_patient_booking_appointment`, `app.read_current_patient_booking_busy_intervals`, `app.read_current_patient_booking_catalog`, `app.read_current_patient_booking_creation_snapshot`, `app.read_current_patient_booking_form_fields`, `app.read_current_patient_booking_packages`, `app.read_current_patient_booking_policies`, `app.read_current_patient_booking_prepayment_policy`, `app.read_current_patient_booking_reschedules`, `app.read_current_patient_booking_row`, `app.read_current_patient_booking_rows`, `app.read_current_patient_booking_runtime_integer`, `app.read_current_patient_booking_slot_snapshot`, `app.read_current_patient_identity_contacts`, `app.record_current_patient_booking_contact`, `app.reserve_current_patient_booking_package`, `app.save_current_patient_booking_form_answers`, `app.set_current_patient_booking_reminder_preset`, `app.upsert_google_calendar_event_id`

- `public.app_runtime_settings` — SELECT(audience,key,organization_id,scope,value_json)
- `public.be_appointment_cancellations` — INSERT(actor_id,actor_type,applied_policy_id,applied_policy_snapshot,appointment_id,cancellation_type,created_at,manual_override,notifications_sent,organization_id,package_session_charged,prepayment_refunded,prepayment_retained,reason,staff_comment,was_free,was_penalized); SELECT(appointment_id,created_at,id,notifications_sent,organization_id); UPDATE(appointment_id,created_at,id,notifications_sent,organization_id)
- `public.be_appointment_history_events` — INSERT(actor_id,appointment_id,event_type,occurred_at,organization_id,payload)
- `public.be_appointment_reschedules` — INSERT(actor_id,actor_type,applied_policy_id,applied_policy_snapshot,appointment_id,created_at,free_cancellation_available_after,free_cancellation_available_at_reschedule,from_end_at,from_start_at,manual_override,notifications_sent,organization_id,reason,staff_comment,to_end_at,to_start_at,was_in_free_reschedule_window); SELECT(actor_id,actor_type,applied_policy_id,applied_policy_snapshot,appointment_id,created_at,free_cancellation_available_after,free_cancellation_available_at_reschedule,from_end_at,from_start_at,id,manual_override,notifications_sent,organization_id,reason,staff_comment,to_end_at,to_start_at,was_in_free_reschedule_window); UPDATE(appointment_id,created_at,id,notifications_sent,organization_id)
- `public.be_appointment_staff_comments` — SELECT(appointment_id,body,created_at,organization_id)
- `public.be_appointments` — INSERT(appointment_reminder_allowed_preset_ids,appointment_reminder_preset_id,appointment_reminder_selection_source,attribution_json,branch_id,chain_id,chain_position,created_at,deleted_at,duration_minutes,end_at,id,organization_id,original_start_at,package_usage_ref,payment_ref,phone_normalized,platform_user_id,reschedule_count,room_id,service_id,source,specialist_id,start_at,status,updated_at); SELECT(appointment_reminder_allowed_preset_ids,appointment_reminder_preset_id,appointment_reminder_selection_source,attribution_json,branch_id,chain_id,chain_position,created_at,deleted_at,duration_minutes,end_at,id,organization_id,original_start_at,package_usage_ref,payment_ref,phone_normalized,platform_user_id,reschedule_count,room_id,service_id,source,specialist_id,start_at,status,updated_at); UPDATE(appointment_reminder_allowed_preset_ids,appointment_reminder_preset_id,appointment_reminder_selection_source,attribution_json,branch_id,chain_id,chain_position,created_at,deleted_at,duration_minutes,end_at,id,organization_id,original_start_at,package_usage_ref,payment_ref,phone_normalized,platform_user_id,reschedule_count,room_id,service_id,source,specialist_id,start_at,status,updated_at)
- `public.be_availability_rules` — SELECT(config,is_active,organization_id,rule_type,specialist_id,updated_at)
- `public.be_booking_form_fields` — SELECT(field_key,field_type,id,is_active,is_required,label,organization_id,placeholder,sort_order,visible_to_patient,visible_to_staff)
- `public.be_booking_form_submissions` — INSERT(appointment_id,field_id,organization_id,value_text); SELECT(appointment_id,field_id,organization_id,value_text); UPDATE(appointment_id,field_id,organization_id,value_text)
- `public.be_branches` — SELECT(address,city_code,color,created_at,id,is_active,organization_id,short_title,sort_order,timezone,title,updated_at)
- `public.be_cancellation_policies` — SELECT(cancellation_allowed,charge_package_session_on_late,created_at,free_cancel_hours_before,id,is_active,late_cancellation_behavior,notify_patient,notify_staff,organization_id,refund_prepayment_on_late,requires_staff_confirmation,scope_entity_id,scope_level,sort_order,title,updated_at)
- `public.be_clinic_services` — SELECT(admin_manual_only,buffer_after_minutes,created_at,description,duration_minutes,id,is_active,online_payment_applicable,organization_id,prepayment_applicable,price_minor,public_widget_visible,sort_order,title,updated_at,usable_in_packages)
- `public.be_package_history_events` — INSERT(event_type,occurred_at,organization_id,patient_package_id,payload_json)
- `public.be_package_usages` — INSERT(appointment_id,comment,created_at,created_by_platform_user_id,id,occurred_at,organization_id,patient_package_id,patient_package_item_id,quantity,usage_kind); SELECT(appointment_id,comment,created_at,created_by_platform_user_id,id,occurred_at,organization_id,patient_package_id,patient_package_item_id,quantity,usage_kind)
- `public.be_patient_booking_profiles` — SELECT(booking_blocked,is_problematic,organization_id,platform_user_id,problematic_note)
- `public.be_patient_package_items` — SELECT(id,patient_package_id,quantity_initial,service_id,sort_order)
- `public.be_patient_packages` — SELECT(created_at,currency,deduction_mode,display_number,id,notes,organization_id,paid_amount_minor,paid_currency,payment_intent_id,payment_ref,platform_user_id,price_minor,sold_at,status,subscription_package_id,title,valid_from,valid_until,validity_days)
- `public.be_patient_timeline_events` — INSERT(domain,event_type,linked_object_id,linked_object_type,occurred_at,organization_id,payload,platform_user_id)
- `public.be_prepayment_policies` — SELECT(amount_minor,currency,id,is_active,mode,online_category,organization_id,percent_bps,service_id)
- `public.be_reschedule_policies` — SELECT(allow_different_branch,allow_different_city,allow_different_service,allow_different_specialist,created_at,id,is_active,limit_exceeded_behavior,max_self_reschedules,notify_patient,notify_staff,organization_id,requires_staff_confirmation,scope_entity_id,scope_level,self_reschedule_hours_before,sort_order,title,updated_at)
- `public.be_rooms` — SELECT(branch_id,id,organization_id,title)
- `public.be_schedule_blocks` — SELECT(end_at,organization_id,room_id,specialist_id,start_at)
- `public.be_specialist_service_availability` — SELECT(branch_id,city_code,created_at,id,is_active,organization_id,room_id,service_id,specialist_id,updated_at)
- `public.be_specialists` — SELECT(appointment_reminder_allowed_preset_ids,appointment_reminder_default_preset_id,created_at,full_name,id,is_active,organization_id,updated_at)
- `public.be_working_days` — SELECT(branch_id,breaks,end_minute,id,is_closed,organization_id,room_id,specialist_id,start_minute,work_date)
- `public.be_working_hours` — SELECT(branch_id,end_minute,is_active,organization_id,room_id,specialist_id,start_minute,weekday)
- `public.booking_calendar_map` — INSERT(appointment_key,gcal_event_id,updated_at); SELECT(appointment_key,gcal_event_id,updated_at); UPDATE(appointment_key,gcal_event_id,updated_at)
- `public.org_enrollments` — SELECT(created_at,id,organization_id,platform_user_id,status)
- `public.patient_bookings` — INSERT(booking_type,branch_id,branch_service_id,branch_title_snapshot,cancelled_at,canonical_appointment_id,category,city,city_code_snapshot,contact_email,contact_name,contact_phone,created_at,duration_minutes_snapshot,id,organization_id,platform_user_id,price_minor_snapshot,service_id,service_title_snapshot,slot_end,slot_start,status,updated_at); SELECT(booking_type,branch_id,branch_service_id,branch_title_snapshot,cancel_reason,cancelled_at,canonical_appointment_id,category,city,city_code_snapshot,compat_quality,contact_email,contact_name,contact_phone,created_at,duration_minutes_snapshot,gcal_event_id,id,organization_id,platform_user_id,price_minor_snapshot,provenance_created_by,provenance_updated_by,reminder_24h_sent,reminder_2h_sent,service_id,service_title_snapshot,slot_end,slot_start,source,status,updated_at); UPDATE(booking_type,branch_id,branch_service_id,branch_title_snapshot,cancel_reason,cancelled_at,canonical_appointment_id,category,city,city_code_snapshot,contact_email,contact_name,contact_phone,created_at,duration_minutes_snapshot,gcal_event_id,id,organization_id,platform_user_id,price_minor_snapshot,provenance_created_by,provenance_updated_by,reminder_24h_sent,reminder_2h_sent,service_id,service_title_snapshot,slot_end,slot_start,status,updated_at)
- `public.patient_specialist_links` — INSERT(created_via,organization_id,patient_user_id,specialist_id,status)
- `public.platform_user_contacts` — INSERT(contact_type,created_at,id,organization_id,platform_user_id,source,updated_at,value,value_normalized); SELECT(contact_type,created_at,id,organization_id,platform_user_id,source,updated_at,value,value_normalized); UPDATE(contact_type,created_at,id,organization_id,platform_user_id,source,updated_at,value,value_normalized)
- `public.platform_users` — SELECT(email,id,merged_into_id)
- `public.user_contacts` — SELECT(contact_kind,is_primary,platform_user_id,value_normalized)

#### `app_seam_email_otp_owner` — 26 функц., 5 отношений

EXECUTE: `app_patient`, `app_pre_session`

Функции: `app.email_auth_delete_email_challenge_by_id`, `app.email_auth_delete_email_challenges_for_user`, `app.email_auth_enqueue_otp_delivery`, `app.email_auth_find_email_challenge_for_confirm`, `app.email_auth_find_email_challenge_for_consume`, `app.email_auth_find_email_otp_lock`, `app.email_auth_find_email_owner_conflict`, `app.email_auth_find_email_send_cooldown`, `app.email_auth_find_latest_email_challenge_for_user`, `app.email_auth_find_latest_pending_email_challenge_for_user`, `app.email_auth_increment_email_challenge_attempts`, `app.email_auth_insert_email_challenge`, `app.email_auth_register_email_otp_lockout`, `app.email_auth_reset_email_otp_lockout`, `app.email_auth_set_email_challenge_delivery_code`, `app.email_auth_set_email_challenge_purpose`, `app.email_auth_start_challenge`, `app.email_auth_upsert_email_send_cooldown`, `app.email_auth_verify_user_email`, `app.email_otp_public_consume_latest_challenge`, `app.email_otp_public_delete_unverified_registration` ⚠️мёртвая, `app.email_otp_public_find_email_send_cooldown_by_email`, `app.email_otp_public_find_latest_email_challenge_by_email` ⚠️мёртвая, `app.email_otp_public_find_or_create_user`, `app.email_otp_public_find_user_by_email`, `app.email_otp_public_register_patient`

- `public.email_challenges` — INSERT(attempts,code_hash,delivery_claimed_at,delivery_token,email,expires_at,id,pending_delivery_code,purpose,user_id); SELECT(attempts,code_hash,created_at,delivery_claimed_at,delivery_token,email,expires_at,id,pending_delivery_code,purpose,user_id); UPDATE(attempts,code_hash,created_at,delivery_claimed_at,delivery_token,email,expires_at,id,pending_delivery_code,purpose,user_id)
- `public.email_otp_locks` — INSERT(locked_until,lockout_cycle,user_id); SELECT(locked_until,lockout_cycle,user_id); UPDATE(locked_until,lockout_cycle,user_id)
- `public.email_send_cooldowns` — INSERT(email_normalized,last_sent_at,user_id); SELECT(email_normalized,last_sent_at,user_id); UPDATE(email_normalized,last_sent_at,user_id)
- `public.outgoing_delivery_queue` — INSERT(attempt_count,channel,event_id,id,kind,max_attempts,next_retry_at,organization_id,payload_json,priority,status); SELECT(event_id)
- `public.platform_users` — INSERT(birth_date,blocked_at,blocked_by,blocked_reason,calendar_timezone,created_at,display_name,email,email_normalized,email_verified_at,first_name,gender,height_cm,id,integrator_user_id,is_archived,is_blocked,last_name,merged_at,merged_into_id,patient_phone_trust_at,patronymic,phone_normalized,reminder_muted_until,role,session_epoch,updated_at,weight_kg); SELECT(birth_date,blocked_at,blocked_by,blocked_reason,calendar_timezone,created_at,display_name,email,email_normalized,email_verified_at,first_name,gender,height_cm,id,integrator_user_id,is_archived,is_blocked,last_name,merged_at,merged_into_id,patient_phone_trust_at,patronymic,phone_normalized,reminder_muted_until,role,session_epoch,updated_at,weight_kg); UPDATE(birth_date,blocked_at,blocked_by,blocked_reason,calendar_timezone,created_at,display_name,email,email_normalized,email_verified_at,first_name,gender,height_cm,id,integrator_user_id,is_archived,is_blocked,last_name,merged_at,merged_into_id,patient_phone_trust_at,patronymic,phone_normalized,reminder_muted_until,role,session_epoch,updated_at,weight_kg)

#### `app_seam_telemetry_operator_owner` — 26 функц., 17 отношений

EXECUTE: `app_operational_delivery_worker`, `app_operational_scheduler`, `app_platform_admin`, `app_pre_session`, `app_service`, `app_worker`, `saas_telemetry_operator`

Функции: `app.acknowledge_open_outbound_provider_incidents`, `app.append_platform_audit_event`, `app.archive_operator_health_failures`, `app.list_google_calendar_probe_organization_ids`, `app.list_integration_webhook_burst_signals`, `app.list_operator_alert_staff_push_recipients`, `app.list_platform_health_failure_archive`, `app.mark_operator_incident_alert_sent`, `app.open_or_touch_operator_critical_incident`, `app.open_or_touch_operator_incident`, `app.open_or_touch_operator_probe_incident`, `app.operator_incident_alert_already_sent`, `app.prune_integration_webhook_error_events`, `app.prune_operator_health_failure_archive`, `app.read_admin_notification_targets`, `app.read_operator_delivery_queue_health`, `app.read_operator_health_digest_last_sent_at`, `app.read_operator_outbound_probe_meta`, `app.read_outbound_provider_incident_health`, `app.record_integrator_webhook_outcome`, `app.record_operational_delivery_attempt_audit`, `app.record_operator_delivery_attempt`, `app.record_operator_outbound_probe_run`, `app.resolve_all_open_operator_incidents`, `app.resolve_operator_probe_incidents`, `app.resolve_platform_audit_conflict`

- `integrator.delivery_attempt_logs` — INSERT(attempt,channel,correlation_id,intent_event_id,intent_type,occurred_at,organization_id,payload_json,reason,status)
- `integrator.projection_outbox` — SELECT(attempts_done,created_at,event_type,id,idempotency_key,last_error,status)
- `public.admin_audit_log` — INSERT(action,actor_id,details,id,organization_id,status); SELECT(action,actor_id,details,id,organization_id,resolved_at,status); UPDATE(action,id,resolved_at)
- `public.be_organization_members` — SELECT(organization_id,platform_user_id,status)
- `public.broadcast_audit` — SELECT(actor_id,id,message_title,organization_id)
- `public.integration_webhook_error_events` — INSERT(error_class,source); SELECT(error_class,occurred_at,source)
- `public.integration_webhook_last_status` — INSERT(detail,error_class,http_status_returned,processed_ok,received_at,source); SELECT(detail,error_class,http_status_returned,processed_ok,received_at,source); UPDATE(detail,error_class,http_status_returned,processed_ok,received_at,source)
- `public.integrator_push_outbox` — SELECT(created_at,id,kind,last_error,status)
- `public.notification_delivery_attempts` — INSERT(channel,event_id,integrator_user_id,intent_type,metadata,occurrence_id,organization_id,reason,status,topic_code,user_id)
- `public.operator_health_failure_archive` — INSERT(archived_by_user_id,doctor_user_id,health_probe,organization_id,raw_error_truncated,severity_at_archive,source_id,source_kind,summary_json); SELECT(archived_at,archived_by_user_id,doctor_user_id,health_probe,id,organization_id,raw_error_truncated,severity_at_archive,source_id,source_kind,summary_json)
- `public.operator_incidents` — INSERT(dedup_key,direction,error_class,error_detail,id,integration,last_seen_at,occurrence_count,opened_at,resolved_at); SELECT(acknowledged_at,alert_claim_phase,alert_claim_token,alert_claimed_at,alert_sent_at,dedup_key,direction,error_class,error_detail,id,integration,last_seen_at,occurrence_count,opened_at,resolved_at); UPDATE(acknowledged_at,alert_claim_phase,alert_claim_token,alert_claimed_at,alert_sent_at,dedup_key,direction,error_class,error_detail,id,integration,last_seen_at,occurrence_count,opened_at,resolved_at)
- `public.operator_job_status` — INSERT(job_family,job_key,last_duration_ms,last_error,last_failure_at,last_finished_at,last_started_at,last_status,last_success_at,meta_json); SELECT(job_family,job_key,last_duration_ms,last_error,last_failure_at,last_finished_at,last_started_at,last_status,last_success_at,meta_json); UPDATE(job_family,job_key,last_duration_ms,last_error,last_failure_at,last_finished_at,last_started_at,last_status,last_success_at,meta_json)
- `public.outgoing_delivery_queue` — SELECT(channel,created_at,event_id,failure_class,id,kind,last_error,next_retry_at,organization_id,payload_json,sent_at,status,updated_at)
- `public.platform_users` — SELECT(display_name,first_name,id,is_archived,last_name,merged_into_id,phone_normalized,role)
- `public.system_settings` — SELECT(key,organization_id,scope,updated_at,value_json)
- `public.user_channel_bindings` — SELECT(channel_code,external_id,user_id)
- `public.user_contacts` — SELECT(contact_kind,is_primary,platform_user_id,value_normalized)

#### `app_seam_password_auth_owner` — 19 функц., 7 отношений

EXECUTE: `app_patient`, `app_pre_session`, `app_staff`

Функции: `app.auth_rate_limit_check_and_record`, `app.current_patient_has_password_credentials`, `app.email_password_delete_unverified_registration`, `app.email_password_find_login_candidate`, `app.email_password_find_reset_candidate`, `app.email_password_find_user_id_by_email_challenge`, `app.email_password_register_pending`, `app.password_credentials_replace_self`, `app.password_credentials_upsert_self`, `app.password_login_acquire`, `app.password_login_acquire_impl`, `app.password_login_complete`, `app.password_login_complete_impl`, `app.password_login_issue_altcha_challenge`, `app.password_login_issue_altcha_challenge_impl`, `app.password_login_read_altcha_secret`, `app.password_login_read_altcha_secret_impl`, `app.set_staff_security_self_password_hash` ⚠️мёртвая, `app.staff_user_has_password_credentials`

- `public.auth_rate_limit_events` — INSERT(key,occurred_at,scope); SELECT(key,occurred_at,scope)
- `public.email_challenges` — SELECT(id,user_id)
- `public.password_altcha_challenges` — INSERT(challenge_digest,challenge_id,consumed_at,expires_at,identifier_key,purpose); SELECT(challenge_digest,challenge_id,consumed_at,created_at,expires_at,identifier_key,purpose); UPDATE(challenge_digest,challenge_id,consumed_at,expires_at,identifier_key,purpose)
- `public.password_login_identifier_protection` — INSERT(failed_attempts,identifier_key,leased_user_id,locked_until,next_allowed_at,updated_at,verification_lease_token,verification_lease_until); SELECT(failed_attempts,identifier_key,leased_user_id,locked_until,next_allowed_at,updated_at,verification_lease_token,verification_lease_until); UPDATE(failed_attempts,identifier_key,leased_user_id,locked_until,next_allowed_at,updated_at,verification_lease_token,verification_lease_until)
- `public.platform_users` — INSERT(display_name,email,email_normalized,first_name,id,last_name,merged_into_id,patronymic,role,updated_at); SELECT(display_name,email,email_normalized,email_verified_at,first_name,id,last_name,merged_into_id,patronymic,role,updated_at)
- `public.system_settings` — SELECT(key,organization_id,scope,value_json)
- `public.user_password_credentials` — INSERT(failed_attempts,locked_until,next_allowed_at,password_hash,updated_at,user_id,verification_lease_token,verification_lease_until); SELECT(algo,failed_attempts,locked_until,next_allowed_at,password_hash,updated_at,user_id,verification_lease_token,verification_lease_until); UPDATE(failed_attempts,locked_until,next_allowed_at,password_hash,updated_at,user_id,verification_lease_token,verification_lease_until)

#### `app_seam_context_owner` — 13 функц., 2 отношений

EXECUTE: `app_clinic_billing`, `app_integrator_request`, `app_integrator_resolver`, `app_operational_delivery_worker`, `app_operational_maintenance`, `app_operational_media_worker`, `app_operational_scheduler`, `app_patient`, `app_platform_admin`, `app_platform_settings`, `app_pre_session`, `app_seam_catalog_admin_owner`, `app_seam_catalog_public_owner`, `app_seam_dedicated_bot_owner`, `app_seam_delivery_scope_owner`, `app_seam_email_otp_owner`, `app_seam_identity_lookup_owner`, `app_seam_login_token_owner`, `app_seam_oauth_owner`, `app_seam_org_commerce_owner`, `app_seam_org_directory_owner`, `app_seam_org_invite_owner`, `app_seam_passkey_owner`, `app_seam_password_auth_owner`, `app_seam_patient_booking_owner`, `app_seam_patient_invite_owner`, `app_seam_patient_lfk_media_owner`, `app_seam_patient_org_projection_owner`, `app_seam_patient_program_resolver_owner`, `app_seam_patient_self_actions_owner`, `app_seam_payment_webhook_owner`, `app_seam_phone_binding_owner`, `app_seam_phone_otp_owner`, `app_seam_platform_analytics_owner`, `app_seam_public_booking_owner`, `app_seam_public_slug_owner`, `app_seam_reminder_appointment_owner`, `app_seam_reminder_email_cooldown_owner`, `app_seam_reminder_materialization_owner`, `app_seam_reminder_patient_owner`, `app_seam_reminder_specialist_owner`, `app_seam_retention_sweep_owner`, `app_seam_self_security_owner`, `app_seam_settings_integrator_owner`, `app_seam_settings_preauth_owner`, `app_seam_settings_runtime_owner`, `app_seam_specialist_provision_owner`, `app_seam_staff_security_owner`, `app_seam_telemetry_exclusion_owner`, `app_seam_telemetry_media_owner`, `app_seam_telemetry_operator_owner`, `app_seam_telemetry_patient_owner`, `app_service`, `app_staff`, `app_tenant_service`, `app_worker`, `bcb_dev_integrator`, `bcb_dev_webapp_global_admin`, `bcb_dev_webapp_patient`, `bcb_dev_webapp_staff`, `saas_system_health_owner`, `saas_telemetry_operator`, `saas_telemetry_owner`

Функции: `app.begin_port_context`, `app.clear_port_context`, `app.current_actor_user_id`, `app.current_integrator_user_id`, `app.current_org_id`, `app.current_patient_user_id`, `app.hash_port_typed_args`, `app.install_port_context`, `app.require_accepted_context`, `app.require_attested_context_for_roles`, `app.require_attested_target_role`, `app.require_platform_principal` ⚠️мёртвая, `app_ext.expire_accepted_port_context`

- `app_ext.accepted_port_contexts` — INSERT(actor_ref,backend_pid,capability_id,cleared_at,context_class,database_oid,function_identity,installed_at,integrator_user_id,organization_id,port,purpose,request_id,session_login,subject_ref,target_role,transaction_id,typed_args_hash); REFERENCES(actor_ref,backend_pid,capability_id,cleared_at,context_class,database_oid,function_identity,installed_at,integrator_user_id,organization_id,port,purpose,request_id,session_login,subject_ref,target_role,transaction_id,typed_args_hash); SELECT(actor_ref,backend_pid,capability_id,cleared_at,context_class,database_oid,function_identity,installed_at,integrator_user_id,organization_id,port,purpose,request_id,session_login,subject_ref,target_role,transaction_id,typed_args_hash); UPDATE(actor_ref,backend_pid,capability_id,cleared_at,context_class,database_oid,function_identity,installed_at,integrator_user_id,organization_id,port,purpose,request_id,session_login,subject_ref,target_role,transaction_id,typed_args_hash)
- `app_ext.port_context_capabilities` — INSERT(active_from,active_until,capability_id,context_class,function_identity,port,purpose,session_login,target_role); REFERENCES(active_from,active_until,capability_id,context_class,function_identity,port,purpose,session_login,target_role); SELECT(active_from,active_until,capability_id,context_class,function_identity,port,purpose,session_login,target_role); UPDATE(active_from,active_until,capability_id,context_class,function_identity,port,purpose,session_login,target_role)

#### `app_seam_delivery_scope_owner` — 13 функц., 20 отношений

EXECUTE: `app_operational_delivery_worker`, `app_patient`, `app_pre_session`, `app_service`, `app_staff`, `app_tenant_service`, `app_worker`

Функции: `app.enqueue_integrator_inbound_reply`, `app.enqueue_operator_health_digest_delivery`, `app.enqueue_outbound_message`, `app.integrator_event_idempotency_read`, `app.integrator_event_idempotency_store`, `app.read_integrator_delivery_target_snapshot`, `app.read_integrator_projection_health`, `app.read_patient_telegram_display_handle`, `app.record_integrator_support_delivery_attempt`, `app.release_integrator_idempotency`, `app.resolve_outgoing_delivery_scope`, `app.try_acquire_integrator_idempotency`, `app.upsert_integration_data_quality_incident`

- `integrator.idempotency_keys` — INSERT(expires_at,key,request_hash,response_body,status); SELECT(expires_at,key,request_hash,response_body,status); UPDATE(expires_at,key,request_hash,response_body,status)
- `integrator.integration_data_quality_incidents` — INSERT(entity,error_reason,external_id,field,first_seen_at,integration,last_seen_at,occurrences,raw_value,status,timezone_used); SELECT(entity,error_reason,external_id,field,first_seen_at,integration,last_seen_at,occurrences,raw_value,status,timezone_used); UPDATE(entity,error_reason,external_id,field,first_seen_at,integration,last_seen_at,occurrences,raw_value,status,timezone_used)
- `integrator.projection_outbox` — SELECT(attempts_done,next_try_at,status,updated_at)
- `integrator.user_reminder_occurrences` — SELECT(id,organization_id,rule_id)
- `public.be_organization_members` — SELECT(organization_id,platform_user_id,status)
- `public.broadcast_audit` — SELECT(id,organization_id)
- `public.idempotency_keys` — INSERT(expires_at,key,request_hash,response_body,status); SELECT(expires_at,key,request_hash,response_body,status); UPDATE(expires_at,request_hash,response_body,status)
- `public.operator_incidents` — SELECT(id)
- `public.org_enrollments` — SELECT(organization_id,platform_user_id,status)
- `public.outgoing_delivery_queue` — INSERT(attempt_count,channel,event_id,kind,max_attempts,next_retry_at,organization_id,payload_json,priority,status); SELECT(attempt_count,channel,event_id,id,kind,max_attempts,next_retry_at,organization_id,payload_json,priority,status)
- `public.platform_users` — SELECT(email,email_verified_at,id,integrator_user_id,is_archived,is_blocked,merged_into_id,reminder_muted_until)
- `public.reminder_rules` — SELECT(id,integrator_rule_id,organization_id)
- `public.support_delivery_events` — INSERT(attempt,channel_code,conversation_message_id,correlation_id,id,integrator_intent_event_id,occurred_at,organization_id,payload_json,reason,status); SELECT(attempt,channel_code,conversation_message_id,correlation_id,id,integrator_intent_event_id,occurred_at,organization_id,payload_json,reason,status)
- `public.system_settings` — SELECT(key,organization_id,scope,value_json)
- `public.user_channel_bindings` — SELECT(bot_blocked_at,channel_code,display_handle,external_id,user_id)
- `public.user_channel_preferences` — SELECT(channel_code,is_enabled_for_messages,is_enabled_for_notifications,is_preferred_for_auth,platform_user_id)
- `public.user_contacts` — SELECT(contact_kind,platform_user_id,value_normalized)
- `public.user_notification_topic_channels` — SELECT(channel_code,is_enabled,topic_code,user_id)
- `public.user_notification_topics` — SELECT(is_enabled,topic_code,user_id)
- `public.user_web_push_subscriptions` — SELECT(user_id)

#### `app_seam_staff_security_owner` — 12 функц., 1 отношений

EXECUTE: `app_patient`, `app_seam_password_auth_owner`, `app_seam_self_security_owner`, `app_seam_specialist_provision_owner`, `app_staff`

Функции: `app.begin_staff_login_challenge`, `app.complete_staff_totp_enrollment`, `app.confirm_staff_recovery_codes`, `app.consume_staff_recovery_login`, `app.consume_staff_totp_login`, `app.ensure_staff_security_profile`, `app.get_staff_security_profile`, `app.get_staff_security_session_state`, `app.record_failed_staff_factor_attempt`, `app.require_staff_security_self_user_id`, `app.revoke_staff_sessions`, `app.save_pending_staff_totp`

- `public.staff_security_profiles` — INSERT(failed_attempts,locked_until,pending_totp_secret_ciphertext,updated_at,user_id); SELECT(factor_type,factor_verified_at,failed_attempts,locked_until,login_challenge_expires_at,login_challenge_hash,pending_totp_secret_ciphertext,recovery_code_hashes,recovery_codes_confirmed_at,replacement_required,session_version,totp_secret_ciphertext,updated_at,user_id); UPDATE(factor_type,factor_verified_at,failed_attempts,locked_until,login_challenge_expires_at,login_challenge_hash,pending_totp_secret_ciphertext,recovery_code_hashes,recovery_codes_confirmed_at,replacement_required,session_version,totp_secret_ciphertext,updated_at,user_id)

#### `app_seam_phone_binding_owner` — 11 функц., 10 отношений

EXECUTE: `app_integrator_resolver`, `app_patient`, `app_pre_session`, `app_staff`, `app_worker`

Функции: `app.auth_channel_link_lock_unused_secret`, `app.auth_channel_link_mark_secret_used`, `app.auth_channel_link_mark_secret_used_if_unused`, `app.auth_channel_link_read_secret`, `app.auth_channel_link_replace_secret`, `app.auth_phone_bind_lock_channel_binding`, `app.auth_phone_bind_upsert_channel_binding`, `app.close_active_user_phone_history`, `app.integrator_bind_bootstrap_channel_phone`, `app.phone_messenger_bind_completion_state`, `app.phone_messenger_bind_secret`

- `public.be_organization_members` — SELECT(platform_user_id)
- `public.channel_link_secrets` — INSERT(channel_code,expires_at,token_hash,user_id); SELECT(channel_code,expires_at,id,token_hash,used_at,user_id); UPDATE(id,used_at)
- `public.org_enrollments` — SELECT(platform_user_id)
- `public.phone_messenger_bind_secrets` — INSERT(challenge_id,channel_code,consumed_at,expires_at,failure_code,id,phone_normalized,purpose,status,token_hash,user_id); SELECT(challenge_id,channel_code,consumed_at,created_at,expires_at,failure_code,id,phone_normalized,purpose,status,token_hash,user_id); UPDATE(challenge_id,channel_code,consumed_at,expires_at,failure_code,id,phone_normalized,purpose,status,token_hash,user_id)
- `public.platform_users` — SELECT(created_at,email,id,integrator_user_id,merged_into_id,patient_phone_trust_at,phone_normalized,updated_at); UPDATE(email,id,integrator_user_id,merged_into_id,patient_phone_trust_at,phone_normalized,updated_at)
- `public.user_channel_bindings` — INSERT(channel_code,external_id,user_id); SELECT(channel_code,external_id,user_id); UPDATE(channel_code,external_id,user_id)
- `public.user_channel_preferences` — INSERT(channel_code,is_enabled_for_messages,is_enabled_for_notifications,platform_user_id,updated_at,user_id); SELECT(channel_code,is_enabled_for_messages,is_enabled_for_notifications,platform_user_id,updated_at,user_id); UPDATE(channel_code,is_enabled_for_messages,is_enabled_for_notifications,platform_user_id,updated_at,user_id)
- `public.user_contacts` — INSERT(confirmed_at,contact_kind,is_primary,platform_user_id,source_origin,updated_at,value_normalized); SELECT(confirmed_at,contact_kind,is_primary,platform_user_id,source_origin,updated_at,value_normalized); UPDATE(confirmed_at,contact_kind,is_primary,platform_user_id,source_origin,updated_at,value_normalized)
- `public.user_identity` — SELECT(birth_date,first_name,last_name,patronymic,platform_user_id)
- `public.user_phone_history` — INSERT(phone_normalized,platform_user_id,source,valid_from,valid_to); SELECT(phone_normalized,platform_user_id,source,valid_from,valid_to); UPDATE(phone_normalized,platform_user_id,source,valid_from,valid_to)

#### `app_seam_phone_otp_owner` — 11 функц., 2 отношений

EXECUTE: `app_pre_session`

Функции: `app.phone_auth_find_latest_challenge_created_at`, `app.phone_auth_find_otp_lock`, `app.phone_auth_register_otp_lockout`, `app.phone_auth_reset_otp_lockout`, `app.phone_challenge_store_delete`, `app.phone_challenge_store_delete_by_phone`, `app.phone_challenge_store_increment_attempts`, `app.phone_challenge_store_read`, `app.phone_challenge_store_upsert`, `app.phone_otp_public_booking_consume_challenge`, `app.phone_otp_public_booking_issue_challenge`

- `public.phone_challenges` — INSERT(challenge_id,channel_context,code,created_at,expires_at,phone,verify_attempts); SELECT(challenge_id,channel_context,code,created_at,expires_at,phone,verify_attempts); UPDATE(challenge_id,channel_context,code,expires_at,phone,verify_attempts)
- `public.phone_otp_locks` — INSERT(locked_until,lockout_cycle,phone_normalized); SELECT(locked_until,lockout_cycle,phone_normalized); UPDATE(locked_until,lockout_cycle,phone_normalized)

#### `app_seam_specialist_provision_owner` — 11 функц., 18 отношений

EXECUTE: `app_clinic_billing`, `app_patient`, `app_platform_settings`, `app_staff`

Функции: `app.choose_organization_first_tariff`, `app.create_specialist_signup_intent`, `app.current_provisioned_owner_organization`, `app.get_latest_specialist_signup_intent_for_user`, `app.get_pending_specialist_signup_intent`, `app.get_specialist_signup_intent_by_challenge`, `app.provision_specialist_owner`, `app.replace_pending_specialist_signup_challenge`, `app.seed_reference_catalog_after_organization_insert`, `app.seed_reference_catalog_snapshot`, `app.start_provisioned_organization_trial`

- `public.admin_audit_log` — INSERT(action,actor_id,details,id,organization_id,status,target_id)
- `public.be_organization_members` — INSERT(created_at,id,organization_id,platform_user_id,role,specialist_id,status,updated_at); SELECT(created_at,id,organization_id,platform_user_id,role,specialist_id,status,updated_at); UPDATE(created_at,id,organization_id,platform_user_id,role,specialist_id,status,updated_at)
- `public.be_organizations` — INSERT(created_at,id,is_active,sort_order,title,updated_at); SELECT(created_at,id,is_active,tariff_id,updated_at); UPDATE(id,is_active,tariff_id,updated_at)
- `public.be_specialists` — INSERT(created_at,full_name,id,is_active,organization_id,sort_order,updated_at); SELECT(created_at,full_name,id,is_active,organization_id,sort_order,updated_at)
- `public.clinic_public_directory_entries` — INSERT(created_at,display_name,is_published,organization_id,published_at,slug,updated_at)
- `public.organization_slug_claims` — INSERT(created_at,created_by_platform_user_id,id,kind,organization_id,slug,updated_at)
- `public.platform_users` — SELECT(created_at,display_name,email_verified_at,id,merged_into_id,role,updated_at); UPDATE(created_at,display_name,email_verified_at,id,merged_into_id,role,updated_at)
- `public.reference_catalog_baselines` — SELECT(definition_json,version)
- `public.reference_catalog_snapshot_receipts` — INSERT(baseline_version,organization_id); SELECT(baseline_version,organization_id)
- `public.reference_categories` — INSERT(code,id,is_user_extensible,organization_id,title); SELECT(code,id,is_user_extensible,organization_id,title)
- `public.reference_items` — INSERT(category_id,code,id,is_active,meta_json,organization_id,sort_order,title)
- `public.saas_billing_accounts` — INSERT(id,organization_id,updated_at); SELECT(id,organization_id,updated_at); UPDATE(id,organization_id,updated_at)
- `public.saas_billing_subscriptions` — INSERT(current_period_ends_at,current_period_starts_at,id,lifecycle_state,organization_id,pending_tariff_id,saas_billing_account_id,source,status,tariff_id,tariff_snapshot,updated_at); SELECT(current_period_ends_at,current_period_starts_at,id,lifecycle_state,organization_id,pending_tariff_id,saas_billing_account_id,source,status,tariff_id,tariff_snapshot,updated_at); UPDATE(current_period_ends_at,current_period_starts_at,id,lifecycle_state,organization_id,pending_tariff_id,saas_billing_account_id,source,status,tariff_id,tariff_snapshot,updated_at)
- `public.saas_organization_trials` — INSERT(created_by,discount_ends_at,ends_at,id,organization_id,post_trial_behavior,post_trial_tariff_id,started_at,status,tariff_id,updated_at); SELECT(created_by,discount_ends_at,ends_at,id,organization_id,post_trial_behavior,post_trial_tariff_id,started_at,status,tariff_id,updated_at)
- `public.saas_registration_tariff_policy` — SELECT(key,tariff_id,updated_at)
- `public.saas_tariffs` — SELECT(id,is_active,updated_at)
- `public.saas_trial_policy` — SELECT(discount_window_days,duration_days,is_active,key,post_trial_behavior,post_trial_tariff_id,start_event,updated_at)
- `public.specialist_signup_intents` — INSERT(challenge_id,email_normalized,id,organization_slug,organization_title,specialist_full_name,user_id); SELECT(challenge_id,created_at,email_normalized,id,organization_slug,organization_title,provisioned_at,provisioned_membership_id,provisioned_organization_id,provisioned_specialist_id,specialist_full_name,status,user_id); UPDATE(challenge_id,created_at,id,organization_slug,organization_title,provisioned_at,provisioned_membership_id,provisioned_organization_id,provisioned_specialist_id,specialist_full_name,status,user_id)

#### `app_seam_org_commerce_owner` — 10 функц., 13 отношений

EXECUTE: `app_clinic_billing`, `app_patient`, `app_platform_settings`, `app_staff`, `app_tenant_service`, `app_worker`

Функции: `app.apply_paid_saas_billing_tariff`, `app.list_saas_billing_subscriptions_due_for_renewal`, `app.prepare_organization_lifecycle_notification_context`, `app.read_current_org_tariff_transition_usage`, `app.read_org_enforced_quota_usage`, `app.refresh_saas_billing_invoice_purchased_tariff`, `app.resolve_organization_cabinet_access`, `app.resolve_organization_mechanic_access`, `app.saas_billing_effective_tariff`, `app.saas_billing_effective_tariff_for_current_org`

- `public.admin_audit_log` — SELECT(action,created_at,details,id,organization_id,status,target_id)
- `public.be_branches` — SELECT(is_active,organization_id)
- `public.be_organization_members` — SELECT(id,organization_id,specialist_id,status)
- `public.be_organizations` — SELECT(cabinet_first_entered_at,created_at,id,is_active,tariff_id,updated_at); UPDATE(cabinet_first_entered_at,id,tariff_id,updated_at)
- `public.org_enrollments` — SELECT(id,organization_id,status)
- `public.organization_member_invites` — SELECT(accepted_membership_id,expires_at,id,invited_role,organization_id,status)
- `public.patient_files` — SELECT(id,organization_id,size_bytes)
- `public.saas_billing_invoices` — SELECT(description,expires_at,id,invoice_kind,organization_id,provider_invoice_ref,saas_billing_subscription_id,status,tariff_id,updated_at); UPDATE(additional_seat_quantity,amount_minor,currency,tariff_billing_period,tariff_id,tariff_name,tariff_snapshot,updated_at)
- `public.saas_billing_subscriptions` — SELECT(autopay_consented_at,autopay_revoked_at,created_at,current_period_ends_at,current_period_starts_at,grace_ends_at,id,organization_id,paid_additional_seats,pending_tariff_id,read_only_ends_at,saved_payment_method_id,source,status,tariff_id,tariff_snapshot)
- `public.saas_org_entitlement_overrides` — SELECT(created_at,enabled,expires_at,id,mechanic,organization_id)
- `public.saas_organization_trials` — SELECT(created_at,created_by,discount_ends_at,ends_at,id,organization_id,post_trial_behavior,post_trial_tariff_id,started_at,status,tariff_id,updated_at); UPDATE(id,organization_id,status,tariff_id,updated_at)
- `public.saas_paid_period_policy` — SELECT(created_at,is_active,key,post_paid_period_behavior,post_paid_period_tariff_id)
- `public.saas_tariffs` — SELECT(additional_seat_price_minor,billing_period,created_at,currency,description,discounted_price_minor,downgrade_policies,id,included_seats,is_active,mailing_templates,mechanic_access_policies,mechanics,name,price_minor,quotas,system_access_policy,updated_at)

#### `app_seam_patient_lfk_media_owner` — 10 функц., 11 отношений

EXECUTE: `app_operational_media_worker`, `app_patient`, `app_staff`

Функции: `app.abort_patient_program_submission_media`, `app.confirm_patient_program_submission_media`, `app.create_patient_program_submission_media`, `app.enqueue_media_transcode_job_core`, `app.enqueue_media_transcode_job_for_service`, `app.enqueue_media_transcode_job_for_staff`, `app.read_patient_lfk_complex_cover`, `app.read_patient_lfk_complex_exercise_lines`, `app.read_platform_lfk_media_entitlement_refs`, `app.read_platform_media_row`

- `public.lfk_complex_exercises` — SELECT(comment,complex_id,exercise_id,id,local_comment,organization_id,sort_order)
- `public.lfk_complex_template_exercises` — SELECT(exercise_id,id,organization_id,owner_kind,template_id)
- `public.lfk_complex_templates` — SELECT(id,organization_id,owner_kind,status)
- `public.lfk_complexes` — SELECT(created_at,id,organization_id,platform_user_id,title,user_id)
- `public.lfk_exercise_media` — SELECT(created_at,exercise_id,id,media_type,media_url,organization_id,owner_kind,sort_order)
- `public.lfk_exercises` — SELECT(id,organization_id,owner_kind,title)
- `public.media_files` — INSERT(folder_id,id,mime_type,organization_id,original_name,owner_kind,s3_key,size_bytes,status,stored_path,uploaded_by,usage_purpose,video_delivery_override); SELECT(available_qualities_json,created_at,hls_master_playlist_s3_key,id,mime_type,organization_id,owner_kind,poster_s3_key,preview_md_key,preview_sm_key,preview_status,s3_key,status,stored_path,uploaded_by,usage_purpose,video_delivery_override,video_duration_seconds,video_processing_error,video_processing_status); UPDATE(hls_master_playlist_s3_key,id,mime_type,organization_id,s3_key,status,uploaded_by,usage_purpose,video_processing_error,video_processing_status)
- `public.media_folders` — INSERT(id,kind,name,organization_id,parent_id,patient_user_id); SELECT(id,kind,name,organization_id,parent_id,patient_user_id)
- `public.media_transcode_jobs` — INSERT(attempts,created_at,id,media_id,organization_id,status,updated_at); SELECT(attempts,created_at,id,media_id,organization_id,status,updated_at)
- `public.org_enrollments` — SELECT(organization_id,platform_user_id,status)
- `public.user_identity` — SELECT(display_name,first_name,last_name,patronymic,platform_user_id)

#### `app_seam_reminder_materialization_owner` — 10 функц., 15 отношений

EXECUTE: `app_operational_delivery_worker`, `app_operational_scheduler`, `app_tenant_service`

Функции: `app.commit_patient_reminder_materialization`, `app.list_scheduler_reminder_organization_ids`, `app.list_web_push_reminder_organization_ids` ⚠️мёртвая, `app.mark_patient_reminder_occurrence_queued` ⚠️мёртвая, `app.patient_reminder_materialization_fingerprint`, `app.read_patient_reminder_delivery_target_snapshot`, `app.read_patient_reminder_materialization_snapshot`, `app.replace_appointment_reminder_generation`, `app.revalidate_patient_reminder_delivery_materialization`, `app.upsert_patient_reminder_occurrence_plan` ⚠️мёртвая

- `integrator.user_reminder_occurrences` — INSERT(created_at,delivery_generation,id,occurrence_key,organization_id,planned_at,platform_user_id,queued_at,rule_id,status,updated_at); SELECT(created_at,delivery_generation,id,occurrence_key,organization_id,planned_at,platform_user_id,queued_at,rule_id,status,updated_at); UPDATE(created_at,delivery_generation,id,occurrence_key,organization_id,planned_at,platform_user_id,queued_at,rule_id,status,updated_at)
- `public.be_appointments` — SELECT(deleted_at,id,organization_id,start_at,status)
- `public.content_pages` — SELECT(deleted_at,id,is_published,organization_id,slug,title,updated_at)
- `public.content_sections` — SELECT(id,is_visible,organization_id,slug,title,updated_at)
- `public.org_enrollments` — SELECT(organization_id,platform_user_id,status)
- `public.outgoing_delivery_queue` — INSERT(attempt_count,channel,created_at,dead_at,event_id,kind,last_error,max_attempts,next_retry_at,organization_id,payload_json,priority,status,updated_at); SELECT(attempt_count,channel,created_at,dead_at,event_id,id,kind,last_error,max_attempts,next_retry_at,organization_id,payload_json,priority,status,updated_at); UPDATE(attempt_count,channel,created_at,dead_at,event_id,id,kind,last_error,max_attempts,next_retry_at,organization_id,payload_json,priority,status,updated_at)
- `public.platform_users` — SELECT(created_at,email,email_verified_at,id,integrator_user_id,is_archived,is_blocked,merged_into_id,reminder_muted_until,updated_at)
- `public.reminder_journal` — SELECT(action,id,occurrence_id,organization_id,rule_id)
- `public.reminder_rules` — SELECT(category,created_at,custom_text,custom_title,days_mask,display_title,id,integrator_rule_id,integrator_user_id,interval_minutes,is_enabled,linked_object_id,linked_object_type,notification_topic_code,organization_id,platform_user_id,quiet_hours_end_minute,quiet_hours_start_minute,reminder_intent,schedule_data,schedule_type,timezone,updated_at,window_end_minute,window_start_minute)
- `public.system_settings` — SELECT(key,organization_id,scope,updated_at,value_json)
- `public.user_channel_bindings` — SELECT(bot_blocked_at,channel_code,created_at,external_id,user_id)
- `public.user_channel_preferences` — SELECT(channel_code,created_at,id,is_enabled_for_messages,is_enabled_for_notifications,is_preferred_for_auth,platform_user_id,updated_at,user_id)
- `public.user_notification_topic_channels` — SELECT(channel_code,is_enabled,topic_code,updated_at,user_id)
- `public.user_notification_topics` — SELECT(is_enabled,topic_code,updated_at,user_id)
- `public.user_web_push_subscriptions` — SELECT(auth,created_at,endpoint,id,p256dh,updated_at,user_id)

#### `app_seam_reminder_patient_owner` — 10 функц., 12 отношений

EXECUTE: `app_integrator_request`, `app_patient`, `app_staff`, `app_tenant_service`

Функции: `app.enqueue_current_reminder_rule_push`, `app.patient_cancel_pending_reminder_occurrences`, `app.patient_disable_reminder_messenger_topic`, `app.patient_done_reminder_occurrence`, `app.patient_reminder_notification_settings`, `app.patient_set_reminder_mute`, `app.patient_set_reminder_muted_until` ⚠️мёртвая, `app.patient_skip_reminder_occurrence`, `app.patient_snooze_reminder_occurrence`, `app.record_reminder_occurrence_finalized_projection`

- `integrator.user_reminder_occurrences` — SELECT(created_at,delivery_channel,delivery_generation,delivery_job_id,error_code,failed_at,id,organization_id,planned_at,platform_user_id,queued_at,rule_id,sent_at,status,updated_at); UPDATE(delivery_channel,delivery_generation,delivery_job_id,error_code,failed_at,id,organization_id,planned_at,platform_user_id,queued_at,rule_id,sent_at,status,updated_at)
- `public.app_runtime_settings` — SELECT(key,organization_id,scope,value_json)
- `public.integrator_push_outbox` — INSERT(attempts_done,idempotency_key,kind,last_error,next_try_at,payload,status,updated_at); SELECT(attempts_done,idempotency_key,kind,last_error,next_try_at,payload,status,updated_at); UPDATE(attempts_done,idempotency_key,kind,last_error,next_try_at,payload,status,updated_at)
- `public.org_enrollments` — SELECT(created_at,id,organization_id,platform_user_id,status)
- `public.platform_users` — SELECT(created_at,email,email_verified_at,id,integrator_user_id,reminder_muted_until,updated_at); UPDATE(id,integrator_user_id,reminder_muted_until)
- `public.reminder_journal` — INSERT(action,created_at,id,occurrence_id,organization_id,rule_id,skip_reason,snooze_until); SELECT(action,created_at,id,occurrence_id,organization_id,rule_id,snooze_until)
- `public.reminder_occurrence_history` — INSERT(category,created_at,delivery_channel,error_code,id,integrator_occurrence_id,integrator_rule_id,integrator_user_id,occurred_at,organization_id,platform_user_id,skip_reason,skipped_at,snoozed_at,snoozed_until,status); SELECT(category,created_at,delivery_channel,error_code,id,integrator_occurrence_id,integrator_rule_id,integrator_user_id,occurred_at,organization_id,platform_user_id,skip_reason,skipped_at,snoozed_at,snoozed_until,status); UPDATE(category,delivery_channel,error_code,id,integrator_occurrence_id,integrator_rule_id,integrator_user_id,occurred_at,organization_id,platform_user_id,skip_reason,skipped_at,snoozed_at,snoozed_until,status)
- `public.reminder_rules` — SELECT(category,created_at,custom_text,custom_title,days_mask,display_description,display_title,id,integrator_rule_id,integrator_user_id,interval_minutes,is_enabled,linked_object_id,linked_object_type,notification_topic_code,organization_id,platform_user_id,quiet_hours_end_minute,quiet_hours_start_minute,reminder_intent,schedule_data,schedule_type,timezone,updated_at,window_end_minute,window_start_minute)
- `public.user_channel_bindings` — SELECT(channel_code,user_id)
- `public.user_channel_preferences` — SELECT(channel_code,id,is_enabled_for_notifications,platform_user_id,updated_at,user_id)
- `public.user_notification_topic_channels` — INSERT(channel_code,is_enabled,topic_code,updated_at,user_id); SELECT(channel_code,is_enabled,topic_code,updated_at,user_id); UPDATE(channel_code,is_enabled,topic_code,updated_at,user_id)
- `public.user_web_push_subscriptions` — SELECT(id,updated_at,user_id)

#### `app_seam_settings_integrator_owner` — 10 функц., 1 отношений

EXECUTE: `app_operational_delivery_worker`, `app_operational_scheduler`, `app_service`, `app_tenant_service`

Функции: `app.read_integrator_auth_channel_setting`, `app.read_integrator_clinic_delivery_credential`, `app.read_integrator_google_calendar_setting`, `app.read_integrator_platform_integration_availability`, `app.read_integrator_provider_runtime_setting`, `app.read_integrator_runtime_setting`, `app.read_integrator_smtp_outbound_setting`, `app.read_integrator_web_push_delivery_settings`, `app.read_operator_health_probe_config`, `app.read_outgoing_delivery_reclaim_config`

- `public.system_settings` — SELECT(key,organization_id,scope,value_json)

#### `app_seam_identity_lookup_owner` — 9 функц., 8 отношений

EXECUTE: `app_integrator_resolver`, `app_patient`, `app_platform_admin`, `app_pre_session`, `app_seam_context_owner`, `app_staff`

Функции: `app.auth_channel_binding_session`, `app.find_platform_user_ids_by_any_confirmed_email`, `app.get_preferred_auth_channel_code`, `app.integrator_upsert_channel_identity`, `app.pre_session_resolve_identity`, `app.resolve_active_organization_for_integrator_user_id`, `app_ext.assert_port_context_claim`, `app_ext.resolve_variant_a_identity`, `app_ext.resolve_variant_a_physical`

- `app_ext.variant_a_identity_refs` — INSERT(created_at,opaque_ref,physical_user_id); REFERENCES(created_at,opaque_ref,physical_user_id); SELECT(created_at,opaque_ref,physical_user_id); UPDATE(created_at,opaque_ref,physical_user_id)
- `public.be_organization_members` — SELECT(organization_id,platform_user_id,status)
- `public.org_enrollments` — SELECT(organization_id,platform_user_id,status)
- `public.platform_users` — INSERT(display_name,id,merged_into_id); SELECT(display_name,email,id,integrator_user_id,merged_into_id,role)
- `public.user_channel_bindings` — INSERT(channel_code,display_handle,external_id,user_id); SELECT(channel_code,display_handle,external_id,user_id); UPDATE(channel_code,display_handle,external_id,user_id)
- `public.user_channel_preferences` — INSERT(channel_code,is_enabled_for_messages,is_enabled_for_notifications,platform_user_id,updated_at,user_id); SELECT(channel_code,is_enabled_for_messages,is_enabled_for_notifications,is_preferred_for_auth,platform_user_id,updated_at,user_id); UPDATE(channel_code,is_enabled_for_messages,is_enabled_for_notifications,platform_user_id,updated_at,user_id)
- `public.user_contacts` — SELECT(confirmed_at,contact_kind,id,is_primary,platform_user_id,value_normalized)
- `public.user_identity` — INSERT(display_name,platform_user_id,updated_at); SELECT(display_name,platform_user_id)

#### `app_seam_passkey_owner` — 9 функц., 3 отношений

EXECUTE: `app_patient`, `app_pre_session`

Функции: `app.passkey_complete_authentication`, `app.passkey_complete_registration`, `app.passkey_delete_current_credential`, `app.passkey_get_or_create_account`, `app.passkey_issue_challenge`, `app.passkey_list_current_credentials`, `app.passkey_list_current_exclusions`, `app.passkey_read_challenge`, `app.passkey_read_credential`

- `public.user_passkey_accounts` — INSERT(user_handle,user_id); SELECT(user_handle,user_id)
- `public.user_passkey_challenges` — INSERT(challenge,expected_origin,expires_at,id,purpose,rp_id,user_id); SELECT(challenge,consumed_at,expected_origin,expires_at,id,purpose,rp_id,user_id); UPDATE(challenge,consumed_at,expires_at,id,purpose,user_id)
- `public.user_passkey_credentials` — INSERT(backed_up,counter,credential_id,device_type,public_key,transports,user_id); SELECT(backed_up,counter,created_at,credential_id,device_type,last_used_at,public_key,transports,user_id); UPDATE(backed_up,counter,credential_id,device_type,last_used_at,user_id)

#### `app_seam_payment_webhook_owner` — 9 функц., 7 отношений

EXECUTE: `app_clinic_billing`, `app_patient`, `app_platform_settings`, `app_pre_session`, `app_worker`

Функции: `app.list_saas_billing_period_catalog`, `app.list_saas_billing_period_catalog_platform`, `app.read_saas_billing_payment_provider_clinic`, `app.read_saas_billing_payment_provider_platform`, `app.read_saas_billing_payment_provider_preauth`, `app.resolve_patient_acquiring_webhook_organization`, `app.resolve_payment_webhook_organization`, `app.resolve_saas_billing_invoice_for_webhook`, `app.resolve_saas_billing_refund_for_webhook`

- `public.be_payment_intents` — SELECT(idempotency_key,organization_id,provider_id)
- `public.be_payment_provider_events` — SELECT(event_type,idempotency_key,organization_id,provider_id)
- `public.patient_payment` — SELECT(kind,organization_id,provider,provider_payment_id,status)
- `public.saas_billing_invoices` — SELECT(amount_minor,currency,id,organization_id,provider_id,provider_invoice_ref)
- `public.saas_billing_periods` — SELECT(code,is_selectable,label,months,sort_order)
- `public.saas_billing_refunds` — SELECT(amount_minor,confirmed_at,created_at,currency,id,organization_id,provider_id,provider_idempotency_key,provider_refund_ref,saas_billing_invoice_id,status,updated_at)
- `public.system_settings` — SELECT(key,organization_id,scope,value_json)

#### `app_seam_patient_invite_owner` — 7 функц., 6 отношений

EXECUTE: `app_patient`

Функции: `app.cancel_patient_invite_email_proof`, `app.claim_unbound_patient_invite_email`, `app.exchange_patient_invite`, `app.lookup_patient_invite_continuation`, `app.redeem_patient_invite_email`, `app.start_patient_invite_email_proof`, `app.verify_patient_invite_email_proof`

- `app.context_signing_secrets` — SELECT(id,secret)
- `public.be_organizations` — SELECT(id,is_active,title,updated_at)
- `public.org_enrollments` — SELECT(id,organization_id,platform_user_id,portal_activated_at,portal_activated_via,status); UPDATE(id,organization_id,platform_user_id,portal_activated_at,portal_activated_via,status)
- `public.patient_invites` — SELECT(accepted_at,accepted_by_platform_user_id,accepted_via,bearer_exchanged_at,continuation_expires_at,continuation_hash,enrollment_id,expires_at,id,invited_email_normalized,organization_id,patient_user_id,proof_attempts,proof_code_hash,proof_email_normalized,proof_expires_at,proof_started_at,proof_verified_at,recipient_binding,status,token_hash,updated_at); UPDATE(accepted_at,accepted_by_platform_user_id,accepted_via,bearer_exchanged_at,continuation_expires_at,continuation_hash,enrollment_id,expires_at,id,invited_email_normalized,organization_id,patient_user_id,proof_attempts,proof_code_hash,proof_email_normalized,proof_expires_at,proof_started_at,proof_verified_at,recipient_binding,status,token_hash,updated_at)
- `public.patient_merge_candidates` — INSERT(anchor_user_id,candidate_user_id,id,organization_id,payload,reason,status); SELECT(anchor_user_id,candidate_user_id,organization_id,status)
- `public.platform_users` — SELECT(email,email_normalized,email_verified_at,id,merged_into_id,role,updated_at); UPDATE(email,email_normalized,email_verified_at,id,merged_into_id,role,updated_at)

#### `app_seam_public_slug_owner` — 7 функц., 6 отношений

EXECUTE: `app_pre_session`, `app_staff`

Функции: `app.assert_organization_slug_alias_complete`, `app.assert_organization_slug_rename_complete`, `app.is_organization_slug_available`, `app.read_public_clinic_card`, `app.resolve_public_organization_by_slug`, `app.resolve_public_organization_slug`, `app.save_public_clinic_card`

- `public.be_branches` — SELECT(address,city_code,is_active,organization_id,sort_order,title)
- `public.be_organizations` — SELECT(id,is_active)
- `public.clinic_public_directory_entries` — SELECT(card_is_published,description,display_name,is_published,locations_json,logo_media_id,organization_id,photo_media_ids,public_contact_email,public_contact_phone,public_website_url,slug,updated_at); UPDATE(card_is_published,description,locations_json,logo_media_id,organization_id,photo_media_ids,public_contact_email,public_contact_phone,public_website_url,updated_at)
- `public.media_files` — SELECT(id,mime_type,organization_id,owner_kind,s3_key,status,stored_path)
- `public.organization_slug_claims` — SELECT(id,kind,organization_id,slug)
- `public.organization_slug_rename_events` — SELECT(next_slug,organization_id,previous_slug)

#### `app_seam_settings_preauth_owner` — 7 функц., 2 отношений

EXECUTE: `app_patient`, `app_pre_session`

Функции: `app.get_public_config_bool`, `app.get_web_push_vapid_public_key`, `app.is_max_bot_configured`, `app.is_sms_provider_configured`, `app.is_smtp_outbound_configured`, `app.is_telegram_login_configured`, `app.read_webapp_preauth_provider_setting`

- `public.app_runtime_settings` — SELECT(audience,key,organization_id,scope,value_json)
- `public.system_settings` — SELECT(key,organization_id,scope,value_json)

#### `app_seam_reminder_specialist_owner` — 6 функц., 10 отношений

EXECUTE: `app_operational_delivery_worker`, `app_patient`, `app_staff`, `app_tenant_service`

Функции: `app.apply_specialist_task_reminder_success_outcome`, `app.read_current_patient_staff_notification_profiles`, `app.read_integrator_web_push_subscriptions`, `app.refresh_specialist_task_reminder_materialization`, `app.revalidate_specialist_task_reminder_materialization`, `app.specialist_task_reminder_materialization_fingerprint`

- `public.be_organization_members` — SELECT(organization_id,platform_user_id,status)
- `public.org_enrollments` — SELECT(organization_id,platform_user_id,status)
- `public.outgoing_delivery_queue` — SELECT(event_id,id,kind,last_error,next_retry_at,organization_id,payload_json,sent_at,status,updated_at); UPDATE(event_id,id,kind,last_error,next_retry_at,organization_id,payload_json,sent_at,status,updated_at)
- `public.platform_users` — SELECT(created_at,email,email_verified_at,id,merged_into_id,role,updated_at)
- `public.specialist_tasks` — SELECT(completed_at,created_at,description,due_at,id,is_important,organization_id,owner_user_id,patient_user_id,remind_at,reminder_sent_at,title,updated_at); UPDATE(id,organization_id,reminder_sent_at)
- `public.system_settings` — SELECT(key,organization_id,scope,updated_at,value_json)
- `public.user_channel_bindings` — SELECT(bot_blocked_at,bot_blocked_reason,channel_code,created_at,external_id,user_id)
- `public.user_channel_preferences` — SELECT(channel_code,created_at,id,is_enabled_for_messages,is_enabled_for_notifications,is_preferred_for_auth,platform_user_id,updated_at,user_id)
- `public.user_notification_topic_channels` — SELECT(channel_code,is_enabled,topic_code,updated_at,user_id)
- `public.user_web_push_subscriptions` — SELECT(auth,created_at,endpoint,id,p256dh,updated_at,user_id)

#### `app_seam_settings_runtime_owner` — 6 функц., 3 отношений

EXECUTE: `app_integrator_request`, `app_operational_media_worker`, `app_patient`, `app_pre_session`

Функции: `app.read_current_patient_booking_payment_setting`, `app.read_current_patient_ui_setting`, `app.read_global_server_runtime_setting`, `app.read_media_worker_runtime_setting`, `app.read_public_runtime_setting`, `app.read_webapp_server_runtime_setting`

- `public.app_runtime_settings` — SELECT(audience,key,organization_id,scope,value_json)
- `public.org_enrollments` — SELECT(organization_id,platform_user_id,status)
- `public.system_settings` — SELECT(key,organization_id,scope,updated_at,updated_by,value_json)

#### `app_seam_login_token_owner` — 5 функц., 1 отношений

EXECUTE: `app_pre_session`

Функции: `app.auth_login_token_confirm`, `app.auth_login_token_create`, `app.auth_login_token_expire_past`, `app.auth_login_token_mark_session_issued`, `app.auth_login_token_read`

- `public.login_tokens` — INSERT(expires_at,id,method,status,token_hash,user_id); SELECT(confirmed_at,expires_at,id,method,session_issued_at,status,token_hash,user_id); UPDATE(confirmed_at,expires_at,session_issued_at,status,token_hash)

#### `app_seam_oauth_owner` — 5 функц., 1 отношений

EXECUTE: `app_patient`, `app_pre_session`, `app_staff`, `app_worker`

Функции: `app.auth_oauth_find_user`, `app.auth_oauth_list_user_providers`, `app.auth_oauth_upsert_binding`, `app.current_patient_has_web_oauth_binding`, `app.staff_user_has_web_oauth_binding`

- `public.user_oauth_bindings` — INSERT(email,provider,provider_user_id,user_id); SELECT(email,id,provider,provider_user_id,user_id)

#### `app_seam_patient_org_projection_owner` — 4 функц., 6 отношений

EXECUTE: `app_patient`, `app_staff`

Функции: `app.current_patient_has_active_org_enrollment`, `app.read_current_patient_active_organizations`, `app.read_current_patient_organization_entitlements`, `app.read_org_brand_core_context`

- `public.be_organizations` — SELECT(created_at,id,is_active,tariff_id,title)
- `public.org_enrollments` — SELECT(created_at,id,organization_id,platform_user_id,status)
- `public.saas_billing_subscriptions` — SELECT(current_period_ends_at,id,organization_id,status,tariff_id)
- `public.saas_org_entitlement_overrides` — SELECT(enabled,expires_at,id,mechanic,organization_id,quota,seat_limit_override)
- `public.saas_organization_trials` — SELECT(created_by,ends_at,id,organization_id,post_trial_behavior,post_trial_tariff_id,status,tariff_id)
- `public.saas_paid_period_policy` — SELECT(is_active,key,post_paid_period_behavior,post_paid_period_tariff_id)

#### `app_seam_public_booking_owner` — 4 функц., 12 отношений

EXECUTE: `app_pre_session`, `app_tenant_service`

Функции: `app.list_public_booking_form_fields`, `app.read_public_booking_catalog`, `app.read_public_booking_slot_snapshot`, `app.resolve_public_booking_organization`

- `public.app_runtime_settings` — SELECT(audience,key,organization_id,scope,value_json)
- `public.be_appointments` — SELECT(deleted_at,end_at,organization_id,service_id,specialist_id,start_at,status)
- `public.be_availability_rules` — SELECT(config,is_active,organization_id,rule_type,specialist_id,updated_at)
- `public.be_booking_form_fields` — SELECT(field_key,field_type,id,is_active,is_required,label,organization_id,placeholder,sort_order,visible_to_patient,visible_to_staff)
- `public.be_branches` — SELECT(address,city_code,color,id,is_active,organization_id,short_title,sort_order,timezone,title)
- `public.be_clinic_services` — SELECT(admin_manual_only,buffer_after_minutes,description,duration_minutes,id,is_active,online_payment_applicable,organization_id,prepayment_applicable,price_minor,public_widget_visible,sort_order,title,usable_in_packages)
- `public.be_schedule_blocks` — SELECT(end_at,organization_id,specialist_id,start_at)
- `public.be_specialist_service_availability` — SELECT(branch_id,created_at,id,is_active,organization_id,room_id,service_id,specialist_id)
- `public.be_specialists` — SELECT(id,is_active,organization_id)
- `public.be_working_days` — SELECT(branch_id,breaks,end_minute,id,is_closed,organization_id,room_id,specialist_id,start_minute,work_date)
- `public.be_working_hours` — SELECT(branch_id,end_minute,is_active,organization_id,room_id,specialist_id,start_minute,weekday)
- `public.clinic_public_directory_entries` — SELECT(is_published,organization_id)

#### `app_seam_telemetry_exclusion_owner` — 3 функц., 5 отношений

EXECUTE: `app_patient`, `app_platform_settings`

Функции: `app.is_current_patient_test_account`, `app.is_platform_registration_analytics_user_excluded`, `app.list_platform_registration_analytics_events`

- `public.org_enrollments` — SELECT(id,organization_id,platform_user_id,status)
- `public.platform_users` — SELECT(id,phone_normalized,role)
- `public.product_analytics_events_recent` — SELECT(entry_channel,event_type,id,metadata,occurred_at,user_id)
- `public.system_settings` — SELECT(key,organization_id,scope,value_json)
- `public.user_channel_bindings` — SELECT(channel_code,external_id,user_id)

#### `app_seam_catalog_public_owner` — 2 функц., 2 отношений

EXECUTE: `app_patient`, `app_pre_session`, `app_staff`

Функции: `app.get_public_reference_baseline`, `app.list_active_booking_cities` ⚠️мёртвая

- `public.booking_cities` — SELECT(code,id,is_active,sort_order,title)
- `public.reference_catalog_baselines` — SELECT(definition_json,version)

#### `app_seam_dedicated_bot_owner` — 2 функц., 1 отношений

EXECUTE: `app_integrator_resolver`

Функции: `app.resolve_clinic_dedicated_bot_organization`, `app.sync_clinic_dedicated_bot_binding`

- `public.clinic_dedicated_bot_bindings` — INSERT(channel,credential_fingerprint,is_active,organization_id,updated_at); SELECT(channel,credential_fingerprint,is_active,organization_id,updated_at)

#### `app_seam_org_directory_owner` — 2 функц., 2 отношений

EXECUTE: `app_platform_settings`, `app_pre_session`, `app_staff`

Функции: `app.list_platform_organization_members`, `app.resolve_staff_workspace_memberships`

- `public.be_organization_members` — SELECT(created_at,doctor_screens_disabled,id,organization_id,platform_user_id,role,specialist_id,status,updated_at)
- `public.platform_users` — SELECT(created_at,display_name,id,role,updated_at)

#### `app_seam_org_invite_owner` — 2 функц., 7 отношений

EXECUTE: `app_patient`

Функции: `app.accept_org_invite`, `app.lookup_pending_org_invite`

- `public.be_organization_members` — INSERT(created_at,id,organization_id,platform_user_id,role,specialist_id,status,updated_at); SELECT(created_at,id,organization_id,platform_user_id,role,specialist_id,status,updated_at); UPDATE(created_at,id,organization_id,platform_user_id,role,specialist_id,status,updated_at)
- `public.be_organizations` — SELECT(created_at,id,tariff_id,title,updated_at)
- `public.organization_member_invites` — SELECT(accepted_at,accepted_by_platform_user_id,accepted_membership_id,created_at,created_by_platform_user_id,expires_at,id,invited_email,invited_role,organization_id,status,token_hash); UPDATE(accepted_at,accepted_by_platform_user_id,accepted_membership_id,created_at,expires_at,id,invited_email,invited_role,organization_id,status,token_hash)
- `public.platform_users` — SELECT(created_at,display_name,email,email_normalized,email_verified_at,id,merged_into_id,role,updated_at); UPDATE(created_at,display_name,email,email_normalized,email_verified_at,id,merged_into_id,role,updated_at)
- `public.saas_billing_subscriptions` — SELECT(created_at,id,organization_id,paid_additional_seats,source,status,tariff_id,updated_at)
- `public.saas_org_entitlement_overrides` — SELECT(created_at,enabled,expires_at,id,mechanic,organization_id,seat_limit_override,updated_at)
- `public.saas_tariffs` — SELECT(created_at,id,included_seats,mechanics,updated_at)

#### `app_seam_patient_program_resolver_owner` — 2 функц., 4 отношений

EXECUTE: `app_patient`

Функции: `app.read_current_patient_treatment_program_description`, `app.resolve_current_patient_treatment_program_organization`

- `public.be_organizations` — SELECT(id,is_active)
- `public.org_enrollments` — SELECT(id,organization_id,platform_user_id,status)
- `public.treatment_program_instances` — SELECT(id,organization_id,patient_user_id,status,template_id)
- `public.treatment_program_templates` — SELECT(description,id,organization_id)

#### `app_seam_reminder_appointment_owner` — 2 функц., 8 отношений

EXECUTE: `app_operational_delivery_worker`

Функции: `app.advance_appointment_reminder_messenger_ladder`, `app.revalidate_appointment_reminder_materialization`

- `public.be_appointments` — SELECT(deleted_at,id,organization_id,platform_user_id,start_at,status,updated_at)
- `public.outgoing_delivery_queue` — SELECT(attempt_count,channel,dead_at,id,kind,last_error,next_retry_at,organization_id,payload_json,status,updated_at); UPDATE(attempt_count,channel,dead_at,id,kind,last_error,next_retry_at,organization_id,payload_json,status,updated_at)
- `public.platform_users` — SELECT(id,is_archived,is_blocked,merged_into_id,reminder_muted_until,updated_at)
- `public.user_channel_bindings` — SELECT(bot_blocked_at,channel_code,external_id,user_id)
- `public.user_channel_preferences` — SELECT(channel_code,id,is_enabled_for_notifications,platform_user_id,updated_at,user_id)
- `public.user_notification_topic_channels` — SELECT(channel_code,is_enabled,topic_code,updated_at,user_id)
- `public.user_notification_topics` — SELECT(is_enabled,topic_code,updated_at,user_id)
- `public.user_web_push_subscriptions` — SELECT(id,updated_at,user_id)

#### `app_seam_reminder_email_cooldown_owner` — 2 функц., 1 отношений

EXECUTE: `app_operational_delivery_worker`

Функции: `app.read_reminder_transactional_email_cooldown`, `app.record_reminder_transactional_email_cooldown`

- `public.email_send_cooldowns` — INSERT(email_normalized,last_sent_at,user_id); SELECT(email_normalized,last_sent_at,user_id); UPDATE(email_normalized,last_sent_at,user_id)

#### `app_seam_self_security_owner` — 2 функц., 1 отношений

EXECUTE: `app_patient`

Функции: `app.bump_platform_user_session_epoch_self`, `app.propagate_staff_session_version_to_session_epoch`

- `public.platform_users` — SELECT(id,session_epoch,updated_at); UPDATE(id,session_epoch,updated_at)

#### `app_seam_telemetry_media_owner` — 2 функц., 3 отношений

EXECUTE: `app_patient`

Функции: `app.increment_media_playback_resolution_stat`, `app.record_media_playback_resolution_event`

- `public.media_files` — SELECT(id,organization_id)
- `public.media_playback_resolution_events` — INSERT(delivery,fallback_used,id,media_id,organization_id,user_id)
- `public.media_playback_stats_hourly` — INSERT(bucket_hour,delivery,fallback_count,organization_id,resolved_count); SELECT(bucket_hour,delivery,fallback_count,organization_id,resolved_count); UPDATE(bucket_hour,delivery,fallback_count,organization_id,resolved_count)

#### `app_seam_telemetry_patient_owner` — 2 функц., 5 отношений

EXECUTE: `app_patient`

Функции: `app.record_current_patient_analytics_event`, `app.record_current_patient_push_open`

- `public.org_enrollments` — SELECT(id,organization_id,platform_user_id,status)
- `public.product_analytics_events_recent` — INSERT(client_session_id,entry_channel,event_type,id,metadata,occurred_at,organization_id,page_key,push_kind,push_tracking_id,topic_code,user_id,warmup_slogan_key); SELECT(event_type,push_tracking_id)
- `public.product_analytics_hourly` — INSERT(bucket_hour,entry_channel,event_count,event_type,organization_id,page_key,push_kind,topic_code,updated_at,warmup_slogan_key); SELECT(bucket_hour,entry_channel,event_count,event_type,organization_id,page_key,push_kind,topic_code,updated_at,warmup_slogan_key); UPDATE(bucket_hour,entry_channel,event_count,event_type,organization_id,page_key,push_kind,topic_code,updated_at,warmup_slogan_key)
- `public.product_analytics_user_hourly` — INSERT(active_minutes,app_opens,bucket_hour,entry_channel,last_seen_at,organization_id,page_key,page_views,push_opens,updated_at,user_id); SELECT(active_minutes,app_opens,bucket_hour,entry_channel,last_seen_at,organization_id,page_key,page_views,push_opens,updated_at,user_id); UPDATE(active_minutes,app_opens,bucket_hour,entry_channel,last_seen_at,organization_id,page_key,page_views,push_opens,updated_at,user_id)
- `public.product_push_notifications` — SELECT(id,organization_id,push_kind,topic_code,user_id,warmup_slogan_key)

#### `app_seam_catalog_admin_owner` — 1 функц., 1 отношений

EXECUTE: `app_service`

Функции: `app.read_integrator_migration_ledger`

- `integrator.schema_migrations` — SELECT(applied_at,version)

#### `app_seam_platform_analytics_owner` — 1 функц., 19 отношений

EXECUTE: `app_platform_settings`

Функции: `app.read_platform_analytics_dashboard`

- `public.be_appointments` — SELECT(created_at,deleted_at,status,updated_at)
- `public.be_organizations` — SELECT(created_at,is_active)
- `public.be_specialists` — SELECT(created_at,is_active)
- `public.clinical_visit` — SELECT(created_at)
- `public.content_pages` — SELECT(created_at,deleted_at,section,video_url)
- `public.content_sections` — SELECT(slug,system_parent_code)
- `public.lfk_exercise_media` — SELECT(exercise_id,media_type,media_url)
- `public.lfk_exercises` — SELECT(catalog_scope,created_at,created_by,id,owner_kind)
- `public.media_files` — SELECT(id,size_bytes,video_duration_seconds)
- `public.media_hls_proxy_error_events` — SELECT(created_at)
- `public.media_playback_client_events` — SELECT(created_at)
- `public.media_playback_resolution_events` — SELECT(delivery,media_id,resolved_at,user_id)
- `public.platform_users` — SELECT(created_at,id,is_archived,merged_into_id,phone_normalized,role)
- `public.product_analytics_user_hourly` — SELECT(bucket_hour,entry_channel,page_key,page_views,user_id)
- `public.program_action_log` — SELECT(action_type,created_at,instance_id,patient_user_id,payload)
- `public.symptom_entries` — SELECT(recorded_at,tracking_id)
- `public.symptom_trackings` — SELECT(id,symptom_key)
- `public.treatment_program_instances` — SELECT(created_at,id,patient_user_id,status)
- `public.user_channel_bindings` — SELECT(channel_code,external_id,user_id)

#### `app_seam_retention_sweep_owner` — 1 функц., 4 отношений

EXECUTE: `app_operational_maintenance`

Функции: `app.prune_retention_target`

- `public.media_hls_proxy_error_events` — SELECT(created_at)
- `public.product_analytics_events_recent` — SELECT(occurred_at)
- `public.product_analytics_user_hourly` — SELECT(bucket_hour)
- `public.product_push_notifications` — SELECT(created_at)

#### `app_seam_public_clinic_card_owner` — 0 функц., 0 отношений

EXECUTE: **никому**

Функции: **нет**

_Ни одного гранта._

---

## Приложение Б. Воспроизведение

Все числа получены на живом DEV в режиме чтения. Ключевые команды:

```bash
# 43 владельца и число функций у каждого
sudo -u postgres psql -d bcb_webapp_dev -At -F$'\t' -c "
  select r.rolname, count(p.oid) from pg_roles r
  left join pg_proc p on p.proowner = r.oid
  where r.rolname like 'app_seam%' group by 1 order by 2 desc, 1;"

# колоночные гранты (2312 троек)
sudo -u postgres psql -d bcb_webapp_dev -At -c "
  select grantee, table_schema||'.'||table_name, privilege_type, column_name
  from information_schema.role_column_grants where grantee like 'app_seam%';"

# тела всех функций швов (для лексической поверхности)
sudo -u postgres psql -d bcb_webapp_dev -At -c "select json_agg(row_to_json(t))::text from (
  select r.rolname owner, n.nspname||'.'||p.proname fname, p.prosrc body, p.proacl::text acl
  from pg_proc p join pg_roles r on r.oid=p.proowner join pg_namespace n on n.oid=p.pronamespace
  where r.rolname like 'app_seam%') t;"

# первый коммит, вносящий имя роли
git log --reverse --format='%h|%ad|%s' --date=short -S'<роль>' --all | head -1
```

Разбор поверхностей — существующим модулем репозитория
`deploy/postgres/privileges/function-body-surface.mjs`, функция `extractRelationOperations(body)`;
имена, совпавшие с реальными отношениями `pg_class`, оставлены, вызовы делегированных функций отброшены.
