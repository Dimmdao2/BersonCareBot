# 18. Сплошная проверка на дубли: где ещё один и тот же факт лежит в двух местах

**Распоряжение владельца (08.08), дословно:** «если это ещё не в списке сносимых таблиц, значит могут быть
и другие такие дубли — проверить, переделать и снести».

**Повод.** Разбор `integrator` (`15-integrator-tables-disposition.md`) доказал шаблон:
`integrator.contacts.value_normalized` зеркалило `public.platform_users.phone_normalized`, писалось строкой
ниже него, а запасная ветка чтения не срабатывала НИКОГДА, потому что источник заполнен 78/78. Владелец прав:
если такое нашлось один раз, оно есть и в других местах. Этот документ — сплошной поиск того же шаблона по
ВСЕЙ базе, кроме 20 таблиц `integrator` (они разобраны в док. 15 и здесь не переоткрываются).

**Только чтение.** DDL/DML не выполнялся. Все замеры — `sudo -u postgres psql -d bersoncarebot_test -Atc`,
счётчики и агрегаты; строк с ПДн не читал, сравнивал ключи, определения колонок и совпадение значений через
`EXISTS`/`IS NOT DISTINCT FROM`, а не выгрузку. `bcb_webapp_prod` не трогался.

---

## Короткий вывод

Просмотрено **20 кластеров-кандидатов**. Подтверждённых дублей — **8**.

| Вердикт | Сколько | Кто |
|---|---:|---|
| **ДУБЛЬ — СНОСИТЬ** | **3** | `be_appointment_events`, `public.schema_migrations`, срез `user_contacts.contact_kind='channel'` |
| **ДУБЛЬ — СНАЧАЛА ПЕРЕВЕСТИ КОД** | **5** | `user_identity` ↔ ФИО в `platform_users`; `user_contacts` ↔ контакты в `platform_users`; легаси-колонка `user_id text` в 5 таблицах; `appointment_records` ↔ `be_appointments`; `reminder_delivery_events` ↔ `integrator.user_reminder_delivery_logs` |
| **НЕ ДУБЛЬ (обосновано)** | **8** | `app_runtime_settings`, `platform_user_contacts`, `user_phone_history`, `content_access_grants_webapp`, `reminder_occurrence_history`, снимки/роллапы, три очереди доставки, `be_appointment_history_events` |
| **ВОПРОС владельцу** | **4** | направление cutover D15b; `patient_bookings`; журналы настроек; `be_external_entity_mappings` |

**Самый крупный дубль — не по строкам, а по стенам.** `user_identity` и `user_contacts` вдвоём несут
**18 RLS-политик и 31 grant** (из 281 политики и 2722 grants во всей схеме `public` — 6.4 % всех политик),
и при этом **не хранят ни одного собственного факта**: обе целиком собираются `INSERT … SELECT` из
`platform_users` и трёх соседних таблиц. То есть шестая часть работы по стенам на сегодня охраняет копию.

**Главная поправка к документу 15.** Строки 14, 17 и 18 таблицы «Сводка по всем 20» утверждают, что у
`delivery_attempt_logs`, `user_reminder_occurrences` и `user_reminder_delivery_logs` «нет аналога» в вебаппе.
Для `user_reminder_delivery_logs` это неверно: `public.reminder_delivery_events` — его полная проекция,
**1735/1735 в обе стороны**. Для двух других поправка мягче — аналоги есть, но несут собственные факты
(см. §6, §11).

---

## Метод (что именно делалось, чтобы «нет» значило «нет»)

1. **Кластеризация имён колонок по всей базе.** Выгружены все 2400 колонок четырёх схем
   (`public`, `app`, `app_ext`, `integrator`) из `information_schema.columns`, сгруппированы по имени+типу.
   Отдельно просмотрены все кластеры ПДн-имён: `phone*`, `email*`, `value_normalized`, `first_name`,
   `last_name`, `patronymic`, `display_name`, `full_name`, `birth_date`, `telegram_id`, `external_id`,
   `timezone`, `gender`.
2. **Дублирующиеся ключи идентичности.** Запрос по таблицам, где рядом стоят два ключа на одного человека
   (`user_id` + `platform_user_id`, `platform_user_id` + `integrator_user_id`) — 10 таблиц.
3. **Замер перекрытия — решающий тест.** Для каждой пары считалось, сколько строк B уже лежит в A с тем же
   значением, и сколько строк A НЕ покрыто B. Пара считается зеркалом только когда обе цифры сходятся
   (X/X и 0 непокрытых), как в разборе `contacts` 78/78.
4. **Чтение кода: срабатывает ли запасная ветка.** Для каждого кандидата найдены все `SELECT` и все
   `INSERT/UPDATE` (поиск и по SQL-имени, и по camelCase-экспорту drizzle из `apps/webapp/db/schema/*.ts`),
   отдельно помечено, читается ли B как `COALESCE(B, A)` / `if (!B) read A`. Никогда не срабатывающая
   ветка — доказательство мёртвого веса.
5. **Маркеры легаси.** Поиск таблиц и колонок `*_legacy|_old|_backup|_v1|_snapshot|_cache|_mirror|deprecated`
   + все комментарии `pg_description` (3 комментария к таблицам, 14 к колонкам). Явных маркеров `legacy`
   в базе нет ни одного — все найденные `*_snapshot` оказались намеренными неизменяемыми слепками (§13).

---

## Детально по каждому кандидату

### 1. `public.user_identity` ↔ ФИО в `public.platform_users` — **ДУБЛЬ — СНАЧАЛА ПЕРЕВЕСТИ КОД**

**Пара.** `user_identity(first_name, last_name, patronymic, display_name, birth_date)` против одноимённых
пяти колонок `platform_users`.

**Канонический источник — `platform_users`.** Весь продуктовый код пишет ФИО в неё; `user_identity`
не получает ни одного независимого значения. Единственный писатель зеркала —
`packages/platform-merge/src/userIdentityFioWrite.ts:15`, и это дословно копия:

```sql
INSERT INTO user_identity (platform_user_id, first_name, last_name, patronymic, display_name, birth_date, updated_at)
SELECT id, first_name, last_name, patronymic, COALESCE(display_name, ''), birth_date, now()
FROM platform_users WHERE id = $1::uuid AND merged_into_id IS NULL
ON CONFLICT (platform_user_id) DO UPDATE SET …
```

**Замер перекрытия — 237/237, расхождений ноль.**

| Что мерил | Результат |
|---|---:|
| строк в `user_identity` | 237 |
| из них совпадают с `platform_users` по всем 5 колонкам (`IS NOT DISTINCT FROM`) | **237** |
| строк, где хоть одна колонка расходится | **0** |
| строк-сирот без `platform_users` | 0 |
| пользователей с ФИО, но БЕЗ строки в `user_identity` | **41** |

То есть `COALESCE(ui.x, pu.x)` возвращает `pu.x` в 100 % случаев: там, где зеркало есть, оно равно
источнику; там, где его нет (41 человек) — работает запасная ветка.

**Читает ли код запасную ветку — да, ВСЕГДА.** `apps/webapp/src/infra/repos/userIdentityFioSql.ts:15-21`:

```ts
export const FIO = {
  firstName: 'COALESCE(ui.first_name, pu.first_name)',
  …
  birthDate: 'COALESCE(ui.birth_date, pu.birth_date)',
} as const;
```

Чтения без `COALESCE` нет ни одного — этот хелпер (в SQL-виде `USER_IDENTITY_FIO_JOIN`/`FIO`/`FIO_SELECT`
и в drizzle-виде `drizzleUserIdentityFioJoin`/`drizzleFioCols`) используют **25 нетестовых файлов** infra:
`pgUserProjection.ts:113-140` (загрузка сессии), `pgDoctorCanonicalAppointments.ts:204…324`,
`pgOrganizationMembership.ts:153,207`, `pgBookingEngine.ts:454`, `pgDoctorAnalyticsMetricAccounts.ts:117…630`,
`s3MediaStorage.ts:220,373` и др. Зеркало вызывают после записи 13 мест
(`pgUserByPhone.ts:302,398,420`, `pgIdentityResolution.ts:140,164`, `pgDoctorClientCreate.ts:82,185`,
`pgUserProjection.ts:188,390`, `pgPhoneMessengerBind.ts:272`, `pgOAuthUserResolve.ts:170`,
`pgDoctorClients.ts:1359,1411`, `pgPublicBookingUserResolve.ts:49`,
`packages/platform-merge/src/identityProjectionWrite.ts:241,312`, `pgPlatformUserMerge.ts:643`).

**Что это на самом деле.** Не случайный мусор, а НЕДОДЕЛАННЫЙ перенос: шаг D15b/5 работ-ордера
(`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:565`) помечен `[x]`, но закрыта только половина —
зеркало создано и все читатели переведены на `COALESCE`, а колонки-источники в `platform_users` НЕ сняты.
Замысел шага понятен и правилен: **у `platform_users` RLS выключена**
(`relrowsecurity=f`, замерено в `D15B1_IDENTITY_CENSUS_2026-08-03.md` §1.1), а у `user_identity` — 9 политик.
ФИО выносили под стену.

**Вердикт.** Дубль реален и полный, но снос ЗЕРКАЛА был бы движением назад. Правильный порядок —
доделать перенос: снять `COALESCE` (читать только `ui`), убрать зеркальный писатель, снести пять колонок
ФИО из `platform_users`. **Направление — вопрос владельцу (В-1),** потому что это меняет источник истины,
а не просто чистит.

Цена бездействия: 9 RLS-политик + 15 grants на таблице, из которой сегодня нельзя прочитать ничего нового.

---

### 2. `public.user_contacts` ↔ контакты в `platform_users` + `user_channel_bindings` — **ДУБЛЬ — СНАЧАЛА ПЕРЕВЕСТИ КОД**

**Пара.** `user_contacts(contact_kind, channel_code, value_normalized, confirmed_at)` против
`platform_users.phone_normalized` / `.email_normalized` / `.patient_phone_trust_at` / `.email_verified_at`,
`user_oauth_bindings.email`, `user_phone_history`, `user_channel_bindings`.

**Канонический источник — четыре исходные таблицы.** `user_contacts` не содержит НИ ОДНОГО собственного
факта: единственный писатель `packages/platform-merge/src/userContactsMirrorWrite.ts:15-82` сначала
`DELETE FROM user_contacts WHERE platform_user_id = $1`, затем пять `INSERT … SELECT` из этих четырёх мест.
Ни одного `INSERT … VALUES` с данными из приложения.

**Замер перекрытия — 444/444, в обе стороны.**

| Срез | Строк в `user_contacts` | Совпадает с источником | Строк источника, не покрытых зеркалом |
|---|---:|---:|---:|
| `contact_kind='phone'` ↔ `platform_users.phone_normalized` | 192 | **192** | **0** |
| `contact_kind='email'` ↔ `platform_users.email_normalized` | 121 | **121** | **0** |
| `contact_kind='channel'` ↔ `user_channel_bindings` (user+channel+external_id) | 131 | **131** | **0** |
| подтверждённые e-mail ↔ `platform_users.email_verified_at` | 34 | **34** | 1 (у слитого аккаунта, `merged_into_id IS NOT NULL`, — а функция логина такие исключает сама) |

**Читает ли код запасную ветку — да, почти везде.** `apps/webapp/src/infra/repos/userContactsSql.ts:36-38`:

```ts
export const CONTACTS = {
  phoneNormalized: 'COALESCE(uc_pri_phone.value_normalized, pu.phone_normalized)',
  emailNormalized: 'COALESCE(uc_pri_email.value_normalized, pu.email_normalized)',
} as const;
```

Хелпер используют 23 нетестовых файла. Двухзапросный фолбэк — `pgCanonicalPlatformUser.ts:105-134`
(`if (fromContacts != null) return fromContacts;` → далее `select … from platformUsers where phoneNormalized = …`)
и то же в `findTrustedCanonicalUserIdByPhone` (`:190-205`). Замер выше показывает, что вторая ветка
не может дать ничего, чего не даёт первая, и наоборот.

**НО две вещи держат таблицу по-настоящему — поэтому не «снести».**

1. **Уникальность уже переехала сюда.** Миграция
   `apps/webapp/db/drizzle-migrations/0380_drop_platform_users_contact_unique_d15b6_local.sql:45,47`
   сняла `platform_users_phone_normalized_key` и `uq_platform_users_email_normalized_active`.
   Проверено на живой базе: у `platform_users` уникальных индексов на телефон/почту БОЛЬШЕ НЕТ, правило
   «один телефон = один аккаунт» держат `uq_user_contacts_phone` / `uq_user_contacts_email`.
   Снос таблицы молча разрешил бы дубли аккаунтов.
2. **Вход по паролю читает только её.** `pgEmailPasswordLookup.ts:90-91` зовёт SECURITY DEFINER-функцию
   `app.find_platform_user_ids_by_any_confirmed_email`, тело (проверено в `pg_proc`):
   `FROM public.user_contacts uc … WHERE uc.contact_kind='email' AND uc.confirmed_at IS NOT NULL AND pu.merged_into_id IS NULL`.
   Фолбэка нет. При этом замер показывает, что эта выборка ТОЧНО воспроизводима из
   `platform_users(email_normalized, email_verified_at)` — 34/34.

**Вердикт.** Данные дублированы целиком, но `user_contacts` — не мусор, а недоделанная замена (D15b/6,
`WORK_ORDER.md:579`). Как и в §1, правильный ход — доделать: перевести читателей на `user_contacts` без
`COALESCE`, убрать зеркальный писатель, снести `platform_users.phone_normalized`/`.email_normalized`.
**Направление — тот же вопрос В-1.**

**Подпункт 2а. Срез `contact_kind='channel'` (131 строка) — ДУБЛЬ — СНОСИТЬ.**
Он не участвует ни в одном из двух пунктов выше и дублируется дважды: и данными
(131/131 = `user_channel_bindings`), и уникальным индексом (`uq_user_contacts_channel(channel_code, value_normalized)`
против `user_channel_bindings_channel_code_external_id_key(channel_code, external_id)`).
Читатель ровно один — `pgCanonicalPlatformUser.ts:213-224`, и он падает в фолбэк:

```ts
  if (viaContacts[0]?.user_id) return viaContacts[0].user_id;
  const legacy = await db.select({ user_id: userChannelBindings.userId }).from(userChannelBindings)
```

`user_channel_bindings`, наоборот, читают независимо и много кто, включая горячий путь интегратора
(`apps/integrator/src/infra/db/repos/platformUserByChannel.ts:44-51`). Убрать пятый `INSERT … SELECT`
из `userContactsMirrorWrite.ts:71-82`, убрать одну ветку в `pgCanonicalPlatformUser.ts`, снести
`uq_user_contacts_channel` — и 131 строка уходит без последствий.

---

### 3. `public.be_appointment_events` ↔ `public.be_appointment_history_events` — **ДУБЛЬ — СНОСИТЬ**

**Пара.** Два журнала событий на одном родителе `be_appointments`, набор колонок идентичен, у `history`
дополнительно `occurred_at`.

**Канонический — `be_appointment_history_events`,** потому что он строгое надмножество и у него есть читатель.

**Замер перекрытия — 434/434.**

| Что мерил | Результат |
|---|---:|
| строк в `be_appointment_events` | 434 |
| из них есть в `history` с тем же `appointment_id`+`event_type`+`payload` | **434** |
| строк `history`, которых нет в `events` | **10** (тип `rubitime_projection_mapping_recovered`) |

Разбивка по типам совпадает один в один по всем шести типам, кроме этого одного.

**Читает ли код — `be_appointment_events` НЕ ЧИТАЕТСЯ НИГДЕ.** Проверено по обоим именам (SQL и drizzle-экспорт
`beAppointmentEvents`), исключая миграции и тесты: 6 `INSERT` и **ноль `SELECT`**.
Вставки идут парами, буквально в семи строках друг от друга:

- `pgBookingEngine.ts:205` (`events`) и `:212` (`history`)
- `pgBookingEngine.ts:1760`/`:1767`, `:1817`/`:1824`
- `pgBookingAppointmentLifecycle.ts:253`/`:260`, `:362`/`:369`, `:496`/`:503`

Единственный читатель во всей паре — `pgBookingEngine.ts:1378-1381`, и он читает `history`
(`getStatusBeforePackageCharge`, откат статуса при возврате в абонемент). Единственное другое упоминание
`be_appointment_events` — `TRUNCATE` в нагрузочном скрипте `scripts/run-b3-booking-concurrency.ts:42`.

Отдельно: UI-таймлайн визитов — вообще третья таблица, `be_patient_timeline_events`
(пишется `pgBookingEngine.ts:221,1776`, читается `pgClientHistory.ts:116,514`). Ни один из двух журналов
в интерфейс не попадает.

**Вердикт.** Чистый мёртвый вес: пишется, никогда не читается, содержимое целиком есть в соседней таблице.
Снос — удаление 6 `INSERT`-блоков и `DROP TABLE`. FK-зависимых нет.

---

### 4. `public.schema_migrations` ↔ `public.webapp_schema_migrations` — **ДУБЛЬ — СНОСИТЬ**

**Пара.** Два журнала применённых миграций в ОДНОЙ схеме, одинаковой формы (`filename` PK + `applied_at`).

**Канонический — вообще третий.** Живой мигратор вебаппа — drizzle:
`apps/webapp/scripts/run-webapp-drizzle-migrate.mjs:494-495` пишет и проверяет `drizzle.__drizzle_migrations`
(374 записи). `public.webapp_schema_migrations` — журнал аварийного SQL-раннера
(`scripts/run-migrations.mjs:27`, там же на `:69-72` написано, что раннер «emergency/bootstrap only»).

**Замер перекрытия — 73/73, и он ЗАМЁРЗ.**

| Журнал | Строк | Первая | Последняя |
|---|---:|---|---|
| `public.schema_migrations` | 73 | 2026-03-20 | **2026-04-13** |
| `public.webapp_schema_migrations` | 89 | 2026-03-20 | 2026-05-15 |
| строк `schema_migrations`, отсутствующих в `webapp_schema_migrations` | **0** | | |

**Читает ли код — единственный путь недостижим.** `run-migrations.mjs:89-113`
(`backfillLedgerFromLegacyWebappTable`) — единственное место, где `public.schema_migrations` вообще
упоминается в рантайме, и оно защищено двумя условиями подряд: колонка `filename` должна существовать
(`:90-95`) И новый журнал должен быть ПУСТ (`:105-108` `if (ledgerCount.c > 0) return;`).
В `webapp_schema_migrations` 89 строк — второе условие не выполнится уже никогда.

Побочно найдено рассогласование: drizzle-экспорт `schemaMigrations` в `apps/webapp/db/schema/schema.ts:3420`
описывает таблицу с PK `version` — это форма журнала ИНТЕГРАТОРА (`integrator.schema_migrations`), а не то,
что реально лежит в `public` (там `filename`). Артефакт устаревшего introspect; символ не импортируется
ниоткуда. Снести вместе с таблицей.

**Вердикт.** Замороженное подмножество живого журнала с недостижимым читателем. `DROP TABLE`.
Осторожность: перед сносом снять дамп 73 строк — это единственная запись о том, что миграции
026–071 применялись SQL-раннером, а не drizzle.

---

### 5. Легаси-колонка `user_id text` рядом с `platform_user_id uuid` (5 таблиц) — **ДУБЛЬ — СНАЧАЛА ПЕРЕВЕСТИ КОД**

**Пара.** Одна и та же ссылка на человека, записанная дважды в одной строке: старым текстовым ключом
и новым uuid-ключом.

| Таблица | Строк | `user_id = platform_user_id::text` | `platform_user_id IS NULL` |
|---|---:|---:|---:|
| `symptom_entries` | 622 | **622** | 0 |
| `symptom_trackings` | 258 | **258** | 0 |
| `user_channel_preferences` | 121 | **121** | 0 |
| `lfk_complexes` | 1 | **1** | 0 |
| `message_log` | 0 | — | — |
| **итого** | **1002** | **1002 (100 %)** | **0** |

**Канонический — `platform_user_id`:** это он несёт FK на `platform_users(id) ON DELETE CASCADE`,
у текстовой колонки FK нет вообще.

**Читает ли код запасную ветку — да, и она не может ничего добавить.** Слияние аккаунтов пишет обе колонки
одной командой: `packages/platform-merge/src/pgPlatformUserMerge.ts:459,464,469` —
`UPDATE symptom_trackings SET user_id = $1::text, platform_user_id = $1::uuid …` (тот же приём для
`symptom_entries` и `lfk_complexes`). А превью слияния защитно читает обе:
`pgPlatformUserMerge.ts:922,926` — `WHERE platform_user_id = $1::uuid OR user_id = $2::text`.
При 1002/1002 совпадения ветка `OR user_id = …` не добавляет ни одной строки НИКОГДА.
Продуктовый код (модули `patient-mood`, `doctor-messaging`, `doctor-clients`) фильтрует по
`platform_user_id`; текстовую колонку не читает никто.

**Вердикт.** Дубль на уровне колонки, ровно того же класса, что `contacts.value_normalized`.
Перевод тривиален: убрать `SET user_id = …` из трёх строк, убрать `OR user_id = …` из двух запросов,
`ALTER TABLE … DROP COLUMN user_id` в пяти таблицах. Внимание: у `user_channel_preferences` на этой колонке
висят два индекса (`user_channel_preferences_user_id_channel_code_key`,
`idx_user_channel_preferences_one_auth_pref … WHERE is_preferred_for_auth`) — второй придётся
пересоздать на `platform_user_id`, иначе потеряется правило «один предпочтительный канал входа».

---

### 6. `public.reminder_delivery_events` ↔ `integrator.user_reminder_delivery_logs` — **ДУБЛЬ — СНАЧАЛА ПЕРЕВЕСТИ КОД** (и поправка к документу 15)

**Пара.** Журнал попыток доставки напоминания. Ключ связи — `reminder_delivery_events.integrator_delivery_log_id`.

**Замер перекрытия — 1735/1735, В ОБЕ СТОРОНЫ.**

| Что мерил | Результат |
|---|---:|
| строк в `public.reminder_delivery_events` | 1735 |
| из них совпадают с интеграторным логом по `id`+`channel`+`status`+`payload_json` | **1735** |
| строк `integrator.user_reminder_delivery_logs`, не спроецированных в `public` | **0** |

**Поправка к документу 15.** Строка 18 его сводной таблицы говорит про
`integrator.user_reminder_delivery_logs`: «Дублирует вебапп? — **нет**». Замер это опровергает:
дублирует целиком, 1735/1735. Вердикт «ОСТАВИТЬ» для интеграторной стороны сам по себе не отменяется
(её читает интегратор), но обоснование «нет аналога» — неверное, и его надо поправить в самом документе 15.

**Читает ли код.** Обе стороны читаются, но по-разному «жирно»:
- `public.reminder_delivery_events` — пишется одним местом (`pgReminderProjection.ts:85`, приём событий
  интегратора через `POST /api/integrator/events`) и читается РОВНО ОДНИМ:
  `app-layer/health/adminReminderPipelineMetrics.ts:91-96` — счётчики статусов за 24 часа в админской
  плитке здоровья. Больше нигде (остальные касания — чистка: `platformUserFullPurge.ts:175`,
  `webappIntegratorUserProjectionRealignment.ts:32,50`, `scripts/user-phone-admin.ts:444`).
- `integrator.user_reminder_delivery_logs` — читается интегратором
  (`apps/integrator/src/infra/db/repos/reminders.ts:622`, в JOIN с occurrences).

Перекрёстных чтений нет: интегратор никогда не читает публичную проекцию, вебапп никогда не читает
интеграторный оригинал.

**Вердикт.** 2 МБ и 13 grants ради одной админской плитки, которую можно посчитать по интеграторному
логу напрямую (или, наоборот, интеграторный чтец перевести на публичную таблицу). Одна из двух копий
должна уйти. Какая именно — зависит от общего решения «интегратор не хранит данные людей» из документа 15;
здесь фиксирую только факт полного дублирования и обе точки чтения.

---

### 7. `public.appointment_records` ↔ `public.be_appointments` — **ДУБЛЬ — СНАЧАЛА ПЕРЕВЕСТИ КОД**

**Пара.** Запись на приём: «сырая» таблица с `integrator_record_id` против канонической `be_appointments`.
Связь — через `be_external_entity_mappings(entity_type='appointment', external_id)`.

**Канонический — `be_appointments`.** Причём НАПРАВЛЕНИЕ УЖЕ РАЗВЁРНУТО: `appointment_records` сегодня
не приём извне, а проекция ИЗ канона. Единственная цепочка записи —
`pgAppointmentProjection.ts:171,205` (upsert), `:364` (мягкое удаление) ←
`modules/patient-booking/projectCanonicalAppointment.ts:39,58,77,98` ←
`app-layer/booking/staffAppointmentLifecycleEffects.ts:59,114,168`. Порт так и подписан в
`modules/patient-booking/ports.ts:31`: «Doctor cabinet compatibility projection».

**Замер перекрытия — 394/410.**

| Что мерил | Результат |
|---|---:|
| строк в `appointment_records` | 410 (из них не удалённых 307) |
| имеют отображение на `be_appointments` через `be_external_entity_mappings` | **394** |
| у отображённых совпадает `phone_normalized` с `be_appointments.phone_normalized` | **394 / 394** |
| у отображённых совпадает `record_at` с `be_appointments.start_at` | 385 / 394 |
| телефонов, которых нет в `platform_users.phone_normalized` | 3 из 408 |

**Читает ли код — да, и НЕ как фолбэк.** Это отличает случай от §3: копия ещё нужна живым поверхностям.
`pgAppointmentProjection.ts:256` (→ `api/integrator/appointments/record/route.ts:22`),
`:279 listActiveByPhoneNormalized` (→ `api/integrator/appointments/active-by-user/route.ts:32`,
`buildAppDeps.ts:1392 getUpcomingAppointments`), `:308 listHistoryByPhoneNormalized`
(→ `buildAppDeps.ts:1477`), `:333`, `:444`; админский дашборд интегратора
`apps/integrator/src/infra/db/repos/adminStats.ts:26`; JOIN в списке клиентов врача
`pgDoctorClients.ts:250`.

**Важно, почему это всё-таки дубль, а не законный кэш.** Ключ поиска в этих читателях — `phone_normalized`,
то есть таблица существует ради поиска записи по телефону для бот-поверхностей. Тот же поиск возможен по
`be_appointments.phone_normalized` (колонка есть, значения совпадают 394/394) — 1.4 МБ и вторая копия ПДн
(телефон + `payload_json`) держатся только потому, что читатели не переписаны.

**Вердикт.** Перевести 6 читателей на `be_appointments`, затем снести. До перевода — не трогать:
это единственный случай в списке, где снос СЕГОДНЯ сломает живого человека (пациент в боте не увидит
свои записи).

---

### 8. `public.app_runtime_settings` ↔ `public.system_settings` — **НЕ ДУБЛЬ (обосновано)**

**Пара.** Две таблицы настроек ключ→значение с одинаковыми `key/scope/value_json/organization_id`.
Плюс триггер `system_settings_sync_registered_runtime`, который проецирует одну в другую.

**Замер перекрытия — 64 из 88, и это НЕ копия.**

| Что мерил | Результат |
|---|---:|
| строк в `app_runtime_settings` | 88 |
| из них дословная копия строки `system_settings` (тот же ключ/скоуп/орг И то же значение) | 64 |
| из них есть в `system_settings`, но значение ДРУГОЕ | 0 |
| из них **нет** в `system_settings` вовсе — вычисляемые | **24** |
| строк `system_settings`, которых нет в `app_runtime_settings` | **61** |
| разбивка `app_runtime_settings` по `audience` | public 24 / authenticated_client 25 / server 39 |

**Почему это не дубль — три причины, каждая проверена.**

1. **Разделение по классу ключа, а не копия.** `modules/system-settings/registry.ts:10` вводит
   `SystemSettingStorage = 'restricted' | 'runtime'`. `restricted` (секреты интеграций) живут ТОЛЬКО в
   `system_settings` — отсюда 61 строка без пары. Схема прямо это фиксирует:
   `apps/webapp/db/schema/appRuntimeSettings.ts:17-18` — «Restricted integration/admin settings remain in
   `system_settings`; only registry-approved safe projections are stored here».
2. **24 строки вычисляемые, а не скопированные — и в этом смысл.** Тело триггера (прочитано из `pg_proc`)
   не переносит секрет наружу, а сворачивает его в булево: три секрета Яндекса → один ключ
   `oauth_yandex_enabled` с `count(*) FILTER (…) = 3`. Публичной странице отдаётся «вход через Яндекс включён»,
   а не `client_secret`. Это стена, а не зеркало.
3. **Запасной ветки чтения нет — наоборот, fail-closed.** `modules/system-settings/runtimeConfig.ts:198`:
   `if (value === null) throw new RuntimeSettingUnavailableError(key)`. Ни одного `?? systemSettings…`
   во всём коде. `configAdapter.ts:58-59` направляет runtime-ключи в один порт, `:147` — restricted-ключи
   в другой. Это маршрутизация по классу ключа, а не цепочка фолбэков.

**Вердикт.** Настоящий денормализованный проекционный слой с живым писателем И живым читателем
(вебапп `pgAppRuntimeSettings.ts:42,59,70,94`; интегратор `publicRuntimeSettings.ts:24` через
`app.read_global_server_runtime_setting`) и с внятной причиной существования — не выпускать секреты
в клиентский периметр. Не трогать.

**Но два журнала при них — вопрос (В-3):** `system_settings_audit` (56 строк) имеет 2 `INSERT`
(`pgSystemSettings.ts:311,508`) и **ноль `SELECT`** в коде; `app_runtime_settings_audit` (**5653 строки**,
84 ключа) не упоминается в коде ВООБЩЕ — пишется только триггером `app_runtime_settings_audit_change`
и не читается ничем. Это не дубль (истории разные), это вопрос удержания — смежен с
`16-journal-retention.md`.

---

### 9. `public.platform_user_contacts` — **НЕ ДУБЛЬ (обосновано)**

Имя и колонка `value_normalized` делают её похожей на `user_contacts` и `integrator.contacts`, поэтому
проверена отдельно и тщательно.

**Замер — перекрытия НОЛЬ.** 3 строки; ни одна не совпадает ни с `user_contacts` того же пользователя
(0/3), ни с `platform_users.phone_normalized`/`.email_normalized` (0/3). То есть она хранит контакты,
которых больше нигде нет.

**Живая с обеих сторон.** Читатели: `pgPlatformUserContacts.ts:33-35,43-47,88-93` →
`api/doctor/clients/[userId]/supplementary-contacts/route.ts:46` и SSR карточки пациента
`loadDoctorPatientCardPageBootstrap.ts:531`. Писатели: тот же репозиторий `:59-79`, `:108-115`, вызывается
из doctor POST/DELETE и из брони (`modules/patient-booking/canonicalCreate.ts:62` →
`bookingContactUpsert.ts:31,48`). Фолбэков нет. Схема подписана
(`apps/webapp/db/schema/platformUserContacts.ts:15`): «Doctor-facing supplementary contacts; not used for
login / identity».

**Вердикт.** Отдельная функция (доктор вписывает дополнительный телефон/мессенджер пациента), а не копия.
3 строки означают «фичей мало пользуются», а не «мертва». Не трогать.

---

### 10. `public.user_phone_history` — **НЕ ДУБЛЬ (обосновано)**

**Замер выглядит подозрительно:** 92 строки, у всех 92 `phone_normalized` равен ТЕКУЩЕМУ телефону
пользователя, закрытых записей (`valid_to IS NOT NULL`) — **ноль**. То есть на TEST история пока
дословно повторяет `platform_users.phone_normalized`.

**Но это не мусор, а темпоральная таблица с двумя НЕ-фолбэковыми читателями.**
`pgDoctorClients.ts:261,272` — единственный источник ответа «принадлежал ли этот номер кому-то другому
на дату той записи», через `valid_from`/`valid_to`:

```sql
NOT EXISTS (SELECT 1 FROM user_phone_history h_other_claim
  WHERE h_other_claim.phone_normalized = …
    AND h_other_claim.platform_user_id <> …
    AND h_other_claim.valid_from <= … AND (h_other_claim.valid_to IS NULL OR h_other_claim.valid_to > …))
```

`platform_users` этого ответить не может в принципе — там только текущее значение.
Второй читатель — `pgChannelPreferences.ts:184` (`confirming_channel` для выбора канала OTP).

**Вердикт.** Ноль закрытых строк — это «на TEST никто ещё не менял телефон», а не «таблица не работает».
Не трогать. (Замечено попутно: 92 строки истории против 192 пользователей с телефоном — история заполнена
не для всех; это отдельный вопрос полноты, не дублирования.)

---

### 11. `public.reminder_occurrence_history` ↔ `integrator.user_reminder_occurrences` — **НЕ ДУБЛЬ (обосновано)**

**Замер.** 2592 строки в публичной таблице, все 2592 находят свой `integrator_occurrence_id`
в интеграторной (в которой 2787) — то есть публичная это подмножество-проекция.

**Но у публичной есть СОБСТВЕННЫЕ факты, которых нет в источнике:** `seen_at`, `snoozed_at`,
`snoozed_until`, `skipped_at`, `skip_reason` — их пишет пациентский интерфейс
(`pgReminderProjection.ts:365,380 markSeen/markAllSeen` ← `api/patient/reminders/mark-seen/route.ts:22,35`).
Читателей у неё три независимых поверхности: бот-интерфейс (`api/integrator/reminders/history/route.ts:25`),
пациент (`getUnseenCount`, `getStats`), врач/админ (`pgDoctorAnalyticsMetricAccounts.ts:686`,
`loadAdminReminderStats.ts:312,323,333`, `adminReminderPipelineMetrics.ts:83-88`).

**Вердикт.** Копия ключа и статуса — да; копия всей сущности — нет. Это законный read-model с собственным
состоянием прочтения. Документ 15 (строка 17) описывает её как «аналитический» — уточнение: она ещё и
операционная (кнопка «прочитано» у пациента пишет именно сюда).

Попутно найдено и стоит поправить отдельно: `pgReminderProjection.ts:310-330` и далее оборачивают чтения
в `try { … } catch { return 0 }` с устаревшим комментарием «seen_at column doesn't exist yet (migration 032
pending)» — такой глушитель вернёт 0 и при отказе RLS, то есть спрячет ровно ту ошибку, которую эта
работа по правам ищет.

---

### 12. `public.content_access_grants_webapp` ↔ `integrator.content_access_grants` — **НЕ ДУБЛЬ (обосновано)**

Обе пусты (0 строк), и документ 15 (#2) справедливо приговорил интеграторную к сносу: у неё писатель
недостижим, `SELECT` нет нигде.

**Вебапп-сторона — другая.** Она подключена с ОБЕИХ сторон: пишет `pgReminderProjection.ts:103-113`
(приём событий интегратора), читает `pgEntitlements.ts:13-23` → `modules/entitlements/service.ts:9` →
пациентский UI: `resolvePatientCanViewContent.ts:19`, `resolvePatientSectionContentAccess.ts:18,37`,
страницы `app/app/patient/content/[slug]/page.tsx:63`, `.../sections/[slug]/page.tsx:73,83`,
`.../help/[slug]/page.tsx:56`. Ноль строк здесь означает «вышестоящее событие ни разу не пришло»,
а не «код мёртв». Промах не имеет фолбэка — просто отказ в доступе.

**Вердикт.** Сносится ОДНА из двух — интеграторная, как и записано в документе 15. Вебапп-сторону не трогать.

---

### 13. Снимки и роллапы — **НЕ ДУБЛЬ (обосновано)**

Поиск по маркерам `*_snapshot|_cache|_mirror|_legacy|_old|_backup|_v1` дал 24 колонки и ни одной таблицы
с маркером легаси. Все найденные снимки — намеренные неизменяемые слепки, которые ПО ОПРЕДЕЛЕНИЮ нельзя
пересчитать из источника, потому что источник с тех пор изменился:

- `patient_bookings.{city_code,branch_title,service_title,duration_minutes,price_minor}_snapshot` —
  цена и название на момент брони; справочник потом правят.
- `be_appointment_{cancellations,reschedules}.applied_policy_snapshot` — политика отмены на момент отмены.
- `saas_billing_{invoices,subscriptions}.tariff_snapshot` — тариф на момент выставления счёта.
- `treatment_program_instance_stage_items.snapshot` — карточка упражнения на момент назначения.
- `patient_diary_day_snapshots` (582 строки) — план дня и маска выполнения за конкретную дату вместе с
  тогдашней `iana`-зоной; после правки плана вывести это из `patient_practice_completions` уже нельзя.
- `product_analytics_{hourly,user_hourly}`, `media_playback_stats_hourly` — почасовые агрегаты над
  сырыми событиями; классический роллап с живым писателем и живым читателем.
- `reference_catalog_baselines` / `reference_catalog_snapshot_receipts` — у обеих есть комментарий в БД,
  прямо говорящий, что копия ОДНОРАЗОВАЯ и обратной синхронизации не будет.

---

### 14. Три очереди/журнала доставки — **НЕ ДУБЛЬ (обосновано)**

`outgoing_delivery_queue` (633), `notification_delivery_attempts` (12 626) и `support_delivery_events` (6182)
кластеризовались вместе по именам колонок (`status`, `attempt*`, `last_error`, `channel`), но это три
разные вещи: очередь к отправке с ретраями и dead-letter; журнал ПОПЫТОК push/уведомлений с
`endpoint_hash`/`provider_status_code`; журнал доставки сообщений ПОДДЕРЖКИ, привязанный к
`support_conversation_messages`. Общих ключей нет, перекрытия измерять не по чему.

---

### 15. `public.be_specialists.full_name` ↔ ФИО в `platform_users` — **ВОПРОС (В-4)**

Единственная строка `be_specialists` на TEST, и её `full_name` совпадает с `platform_users.display_name`
связанного через `be_organization_members.specialist_id` человека (1/1). **Выборка размером один — это не
замер**, вывод на ней делать нельзя. К тому же специалист может существовать без аккаунта (импорт из
Rubitime), и тогда `full_name` — единственное место, где его имя вообще есть.
Помечаю как вопрос, а не как дубль; проверять надо на данных прода, а не на одной строке.

---

### 16. `public.patient_bookings` ↔ `public.be_appointments` — **ВОПРОС (В-2)**

Выглядит как четвёртая таблица записей и содержит ПДн (`contact_phone`, `contact_email`, `contact_name`),
поэтому проверена.

**Замер показывает, что это НЕ зеркало:**

| Что мерил | Результат |
|---|---:|
| строк в `patient_bookings` | 263 |
| имеют `canonical_appointment_id` | **44** |
| из них ссылка ведёт на существующую `be_appointments` | 44 / 44 |
| строк `be_appointments`, на которые никто из `patient_bookings` не ссылается | **340** |
| разбивка по `source` | imported 204 / native 59 |

То есть 219 из 263 записей канонического двойника не имеют вовсе. Снос уничтожил бы данные.
При этом таблица живая: пациентский кабинет читает её через SECURITY DEFINER
`app.read_current_patient_booking_rows` (`pgPatientBookings.ts:104-115`), и код сам себя называет
временным — `modules/patient-booking/canonicalCreate.ts:135`: «`patient_bookings` is retained for
historical projection only».

**Вопрос владельцу — не «дубль ли», а «доводим ли до конца»:** 219 исторических броней либо переносятся
в `be_appointments`, либо остаются вечной второй таблицей с ПДн, которую придётся обносить стенами наравне
с канонической.

---

### 17. `public.be_external_entity_mappings` — **ВОПРОС (В-5), не дубль**

408 строк, из них 394 — отображение `appointment`. По данным не дубль: это единственное место связи
`rubitime.external_id → canonical uuid`. Но в коде вебаппа **нет ни одного `SELECT`** и **ни одного
`INSERT`** (вне тестов) — только `.delete(...)` при жёстком удалении записи
(`pgBookingEngine.ts:1867-1872`). Таблица, которую только удаляют, — либо её наполняет скрипт импорта вне
рантайма, либо связь давно держится иначе. Требует ответа до того, как её начнут обносить стенами.

Попутно там же найден мёртвый переключатель: `apps/webapp/src/infra/repos/bookingCalendarReadSwitch.ts:4`
`createBookingCalendarReadSwitchPort({legacyPort, canonicalPort, resolveReadSource})` — ровно тот самый
шаблон «переключатель legacy/canonical», который мы ищем, — **не импортируется ниоткуда**. Мёртвый код,
удалить.

---

### 18. Двойной ключ `integrator_user_id` + `platform_user_id` (5 таблиц) — **ВОПРОС (В-1, часть)**

В отличие от §5, здесь дубль НЕ чистый, и это важно не спутать.

| Таблица | Строк | оба ключа | только integrator | только platform | integrator-ключ сходится с `platform_users.integrator_user_id` |
|---|---:|---:|---:|---:|---:|
| `reminder_rules` | 46 | 27 | 2 | 17 | 22 из 27 |
| `support_conversations` | 256 | 15 | 11 | 228 | 11 из 15 |
| `reminder_occurrence_history` | 2592 | 2592 | 0 | 0 | **2209 из 2592** |

383 строки `reminder_occurrence_history` имеют пару ключей, которая НЕ сходится через `platform_users`
(вероятно, следствие слияний аккаунтов). Пока это так, снос текстового/числового ключа потеряет связь.
Это часть работы D25/D26 по консолидации идентичности, а не отдельная уборка; фиксирую замер, чтобы он
не потерялся.

---

### 19–20. Проверено и отвергнуто без отдельного разбора

- **`lfk_exercise_media.media_url` ↔ `media_files.s3_key`** — не дубль: `media_url` это внешний URL,
  FK на `media_files` у таблицы нет вовсе, связь не установлена.
- **Кластеры `token_hash` (8 таблиц), `channel_code` (8), `external_id` (4), `s3_key` (4), `staff_comment`
  (3), `local_comment` (3), `manual_override` (3), `warmup_slogan_key` (3), `page_key` (3)** — во всех
  случаях это одноимённые колонки РАЗНЫХ сущностей (токен приглашения ≠ токен сессии; комментарий к отмене
  ≠ комментарий к переносу). Общих ключей нет, дублирования факта нет.
- **`operator_incidents` ↔ `operator_health_failure_archive`** — разные вещи: живой дедуплицированный
  инцидент против ручного архива разобранных отказов.
- **`program_action_log` ↔ `treatment_program_events`** — разные акторы: действия пациента против правок
  программы врачом.

---

## Сводная таблица

| # | Пара (B → A) | Замер перекрытия | Читает ли код запасную ветку | Вердикт |
|---:|---|---|---|---|
| 1 | `user_identity` → `platform_users` (5 колонок ФИО) | **237/237**, расхождений 0; 41 человек вообще без зеркала | `COALESCE(ui.x, pu.x)` во ВСЕХ 25 файлах-читателях; `userIdentityFioSql.ts:15-21` | **ДУБЛЬ — СНАЧАЛА ПЕРЕВЕСТИ КОД** |
| 2 | `user_contacts` → `platform_users` + `user_channel_bindings` | phone **192/192**, email **121/121**, channel **131/131**, непокрытых 0 | `COALESCE` в `userContactsSql.ts:36-38`; двухзапросный фолбэк `pgCanonicalPlatformUser.ts:105-134` | **ДУБЛЬ — СНАЧАЛА ПЕРЕВЕСТИ КОД** |
| 2а | срез `user_contacts.contact_kind='channel'` → `user_channel_bindings` | **131/131** | 1 читатель, падает в фолбэк `pgCanonicalPlatformUser.ts:224-238` | **ДУБЛЬ — СНОСИТЬ** |
| 3 | `be_appointment_events` → `be_appointment_history_events` | **434/434**; у history +10 строк | читателей НЕТ вообще: 6 `INSERT`, 0 `SELECT` | **ДУБЛЬ — СНОСИТЬ** |
| 4 | `public.schema_migrations` → `webapp_schema_migrations` | **73/73**, замёрз 2026-04-13 | единственный путь `run-migrations.mjs:89-113` недостижим (второй гейт `ledgerCount>0`) | **ДУБЛЬ — СНОСИТЬ** |
| 5 | `user_id text` → `platform_user_id uuid` (5 таблиц) | **1002/1002** | `OR user_id = $2::text` в `pgPlatformUserMerge.ts:922,926` — не даёт ни строки | **ДУБЛЬ — СНАЧАЛА ПЕРЕВЕСТИ КОД** |
| 6 | `reminder_delivery_events` ↔ `integrator.user_reminder_delivery_logs` | **1735/1735 в обе стороны** | фолбэка нет; у публичной 1 читатель (админ-плитка), у интеграторной 1 (`reminders.ts:622`) | **ДУБЛЬ — СНАЧАЛА ПЕРЕВЕСТИ КОД** |
| 7 | `appointment_records` → `be_appointments` | **394/410** отображены, phone **394/394** | фолбэка нет — 6 живых читателей (бот, админ интегратора, список врача) | **ДУБЛЬ — СНАЧАЛА ПЕРЕВЕСТИ КОД** |
| 8 | `app_runtime_settings` ↔ `system_settings` | 64 копии, **24 вычисляемых**, 61 строка только в источнике | фолбэка НЕТ — fail-closed `runtimeConfig.ts:198`; маршрутизация по классу ключа | **НЕ ДУБЛЬ** |
| 9 | `platform_user_contacts` → `user_contacts` | **0/3** — не пересекается ни с чем | фолбэков нет; живой UI врача читает и пишет | **НЕ ДУБЛЬ** |
| 10 | `user_phone_history` → `platform_users.phone_normalized` | 92/92 равны текущему, закрытых 0 | 2 не-фолбэковых читателя, `platform_users` их заменить не может | **НЕ ДУБЛЬ** |
| 11 | `reminder_occurrence_history` ↔ `integrator.user_reminder_occurrences` | 2592/2787 спроецированы | у публичной 5 собственных колонок состояния + 3 независимых читателя | **НЕ ДУБЛЬ** |
| 12 | `content_access_grants_webapp` ↔ `integrator.content_access_grants` | обе 0 строк | вебапп-сторона полностью подключена к пациентскому UI | **НЕ ДУБЛЬ** (сносится только интеграторная) |
| 13 | снимки и роллапы (8 групп) | — | неизменяемые слепки / агрегаты с живыми писателем и читателем | **НЕ ДУБЛЬ** |
| 14 | три очереди доставки | — | разные сущности, общих ключей нет | **НЕ ДУБЛЬ** |
| 15 | `be_specialists.full_name` → ФИО `platform_users` | 1/1 — выборка размером один | — | **ВОПРОС (В-4)** |
| 16 | `patient_bookings` → `be_appointments` | **44/263** связаны; 340 канонических без пары | живой читатель — пациентский кабинет | **ВОПРОС (В-2)** |
| 17 | `be_external_entity_mappings` | 408 строк | 0 `SELECT`, 0 `INSERT`, только `DELETE` | **ВОПРОС (В-5)** |
| 18 | `integrator_user_id` + `platform_user_id` (5 таблиц) | 383 строки НЕ сходятся | — | **ВОПРОС (В-1, часть)** |
| 19 | `lfk_exercise_media.media_url` → `media_files` | связи нет | — | **НЕ ДУБЛЬ** |
| 20 | 9 кластеров одноимённых колонок разных сущностей | — | — | **НЕ ДУБЛЬ** |

---

## Что снести первым

Порядок построен по одному правилу: **сначала то, снос чего не требует ни одной правки кода и не может
задеть живого человека**, потом то, что требует перевода, и в самом конце — то, что упирается в решение
владельца. Внутри первой группы — по убыванию снимаемых стен.

**Группа 1 — снос без перевода кода (можно делать сразу, живой человек не затронут).**

1. **`public.be_appointment_events`** — 434 строки, 1 политика, 13 grants. Ноль читателей, содержимое
   целиком есть в `be_appointment_history_events`. Работа: убрать 6 `INSERT`-блоков
   (`pgBookingEngine.ts:205,1760,1817`, `pgBookingAppointmentLifecycle.ts:253,362,496`), поправить
   `TRUNCATE` в нагрузочном скрипте, `DROP TABLE`. FK-зависимых нет.
2. **`public.schema_migrations`** — 73 строки, 7 grants. Читатель недостижим. Работа: снять дамп 73 строк,
   `DROP TABLE`, удалить мёртвый drizzle-экспорт `schema.ts:3420` и ветку
   `backfillLedgerFromLegacyWebappTable` в `run-migrations.mjs`.
3. **Срез `user_contacts.contact_kind='channel'`** — 131 строка. Работа: убрать пятый `INSERT … SELECT`
   (`userContactsMirrorWrite.ts:71-82`), убрать первую ветку в `pgCanonicalPlatformUser.ts:213-238`,
   `DROP INDEX uq_user_contacts_channel`. Таблица остаётся — уходит только дублирующий срез.
4. **Мёртвый `bookingCalendarReadSwitch.ts`** — не таблица, но ровно тот же класс: переключатель
   legacy/canonical, который не импортируется ниоткуда. Удалить файл.

**Группа 2 — снос после перевода читателей (правка кода обязательна, порядок по объёму работы).**

5. **Легаси-колонка `user_id text` в 5 таблицах** (1002/1002) — самый дешёвый перевод во всём списке:
   3 строки в `pgPlatformUserMerge.ts:459,464,469`, 2 запроса на `:922,926`, затем `DROP COLUMN` ×5.
   Не забыть пересоздать `idx_user_channel_preferences_one_auth_pref` на `platform_user_id`.
6. **`reminder_delivery_events` ИЛИ `integrator.user_reminder_delivery_logs`** (1735/1735) — одна из двух
   уходит. Читатель у каждой ровно один, перевод любого из них — однодневная работа. Какую именно снести,
   определяет общее решение по документу 15.
7. **`appointment_records`** (394/410, 1.4 МБ, вторая копия телефонов) — перевести 6 читателей на
   `be_appointments.phone_normalized`, затем `DROP TABLE`. **Строго после** живой проверки бота: это
   единственный пункт списка, где ошибка видна пациенту.

**Группа 3 — упирается в решение владельца, до ответа не трогать.**

8. **`user_identity` + контактные колонки `platform_users`** (В-1). Это самый крупный кусок по стенам
   (18 политик, 31 grant на двоих с `user_contacts`), и одновременно единственный, где «снести» может
   означать движение в обратную сторону.

---

## Вопросы владельцу

**В-1. Куда доводим перенос идентичности — в зеркала или обратно?** Сегодня ФИО и контакты человека лежат
в базе ДВАЖДЫ: в `platform_users` (у которой RLS выключена) и в `user_identity`/`user_contacts`
(у которых 18 политик на двоих). Половина переноса D15b сделана — читатели переведены на
`COALESCE(зеркало, оригинал)` и уникальность телефона/почты уже переехала в `user_contacts`. Вторая
половина — снятие колонок из `platform_users` — не сделана, и пока она не сделана, каждая правка прав
делается в двух местах.
Рекомендация: **доводить вперёд** — снять `COALESCE`, снести пять колонок ФИО и две контактные колонки
из `platform_users`. Безопасный дефолт, если решать сейчас не хочется: **ничего не сносить и не добавлять
стен на `platform_users`**, чтобы не оплачивать одну и ту же работу дважды.

**В-2. `patient_bookings`: 219 исторических броней переносим в `be_appointments` или оставляем навсегда?**
Пока не перенесены, это вторая таблица с ПДн (телефон, почта, имя), которую придётся обносить стенами
наравне с канонической.

**В-3. Журналы настроек: `app_runtime_settings_audit` — 5653 строки, читателей в коде НОЛЬ;
`system_settings_audit` — 56 строк, тоже только пишется.** Это регуляторное требование (кто и когда менял
настройку) или можно ограничить срок хранения? Смежно с `16-journal-retention.md`.

**В-4. `be_specialists.full_name`** — дублирует ли он ФИО аккаунта, проверять надо на прод-данных: на TEST
всего один специалист, и на одной строке вывода делать нельзя.

**В-5. `be_external_entity_mappings`** — 408 строк связи с Rubitime, которые код только удаляет, но никогда
не читает и не пишет. Кто её наполняет и нужна ли она дальше?
