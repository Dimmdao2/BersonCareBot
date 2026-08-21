# D15b/7a — разделение actor/subject внутри одного Postgres: схема (22.08.2026)

**Что это.** Проектный документ, не отчёт о работе. Продуктовый код, миграции, декларация прав, схема БД и
тесты этим ходом НЕ тронуты — в ветке только этот файл.

**Оракул (дословно, `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md:588`):** «D15b/7a
(разделение actor/subject внутри одного Postgres) идёт после TEST-закрытия D15b/6; только физическое
разнесение баз (вариант I) остаётся отложенным.» Ожидаемый результат (там же, строка 591): «единый порт
аутентификации, вход в ОДИН аккаунт по любому его подтверждённому контакту, и всё работает».
Технические границы этапа — `WORK_ORDER.md:766-776`; порядок стадий — `IDENTITY_AND_MERGE_SCHEME.md` §2b,
решения владельца о двух UUID и об аудите — §2c; стадийность и её цена —
`IDENTITY_DB_SPLIT_RESEARCH_2026-08-03.md` §6.

**Статус входа.** Живая проверка D15b/6 на TEST на 22.08 не пройдена. По решению владельца 22.08 она
блокирует только закрытие пункта в документах и НЕ блокирует эту проектную работу.

**Метод замеров.** Всё в разделе 1 — либо `path:line` в текущем дереве, либо read-only интроспекция каталога
`bcb_webapp_dev` командой, приведённой рядом с выводом. Команда-обёртка везде одна (AGENTS.md §6, «Dev»):

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -d bcb_webapp_dev -v ON_ERROR_STOP=1 \
  -c "BEGIN READ ONLY; <запрос> ROLLBACK;"
```

---

## 1. Что сегодня

### 1.1 «Кто действует» — таблицы и колонки

**Корень — `public.platform_users`.** 23 колонки:

```sql
SELECT a.attname, format_type(a.atttypid,a.atttypmod), a.attnotnull
FROM pg_attribute a WHERE a.attrelid='public.platform_users'::regclass AND a.attnum>0 AND NOT a.attisdropped
ORDER BY a.attnum;
```
```
id uuid t | display_name text t | role text t | created_at t | updated_at t | integrator_user_id bigint f
first_name f | last_name f | is_blocked bool t | blocked_at f | blocked_reason f | blocked_by uuid f
is_archived bool t | merged_into_id uuid f | calendar_timezone f | reminder_muted_until f | merged_at f
birth_date date f | gender text f | patronymic f | height_cm int f | weight_kg int f | session_epoch int t
(23 rows)
```

Актор-часть этой строки: `id`, `role`, `is_blocked`/`blocked_at`/`blocked_reason`/`blocked_by`, `is_archived`,
`merged_into_id`/`merged_at`, `session_epoch`, `integrator_user_id`.

**Учётные данные и доказательства владения** (одна строка на человека или на попытку):
`user_password_credentials` (`password_hash`, `failed_attempts`, `locked_until`, `verification_lease_token`),
`user_passkey_accounts` / `user_passkey_credentials` / `user_passkey_challenges`,
`staff_security_profiles` (TOTP-секрет, recovery-хеши, `session_version`, `login_challenge_hash`),
`login_tokens`, `email_challenges`, `email_send_cooldowns`, `channel_link_secrets`,
`phone_messenger_bind_secrets`, `specialist_signup_intents`.

**Контакты и их подтверждённость:** `user_contacts` (`contact_kind`, `value_normalized`, `is_primary`,
`confirmed_at`, `source_origin`) — канон после D15b/6, 328 строк на DEV; `user_phone_history`
(`phone_normalized`, `valid_from`/`valid_to`, `confirming_channel`, `organization_id`) — 94 строки;
`platform_user_contacts` — прежняя форма, 8 строк, живого писателя канона не несёт.

**Привязки каналов и внешних личностей:** `user_channel_bindings` (`channel_code`, `external_id`,
`bot_blocked_at`, `display_handle`) — 142 строки; `user_oauth_bindings` (`provider`, `provider_user_id`,
`email`).

**Предпочтения доставки, привязанные к учётке:** `user_channel_preferences`, `user_notification_topics`,
`user_notification_topic_channels`, `user_web_push_subscriptions`.

**ФИО:** `user_identity` (`first_name`, `last_name`, `patronymic`, `display_name`, `birth_date`) — 294 строки
при 294 `platform_users`, канон после D15b/5; читается через `apps/webapp/src/infra/repos/userIdentityFioSql.ts:25-30`.

**Сессионный шов** (не строки о человеке, а строки об акте доступа): `app_ext.port_context_capabilities`,
`app_ext.accepted_port_contexts` (несёт `actor_ref`, `subject_ref`, `organization_id`, `integrator_user_id`;
`deploy/postgres/port-context/contract.sql:122-143`), `app_ext.variant_a_identity_refs`
(`physical_user_id` → `opaque_ref`; `contract.sql:144-148`), 16 строк на DEV.

### 1.2 «О ком данные» — таблицы

Клинические и продуктовые сущности адресуют человека физическим `platform_users.id` напрямую:
`clinical_visit`, `clinical_complaint`, `clinical_diagnosis`, `clinical_diagnosis_status_history`,
`clinical_anamnesis_illness` / `_lifestyle` / `_trauma`, `patient_comorbidity`, `patient_files`,
`patient_lfk_assignments`, `patient_payment`, `treatment_program_instances` и `treatment_program_events`,
`program_action_log`, `program_item_discussion_messages` / `_reads`, `symptom_entries`, `symptom_trackings`,
`test_attempts`, `test_results`, `lfk_complexes`, `lfk_sessions`, `doctor_notes`, `be_appointments` и весь
`be_appointment_*`, `be_patient_packages`, `be_package_usages`, `be_patient_timeline_events`,
`be_payment_intents`, `patient_bookings`, `online_intake_requests`, `media_folders`.

### 1.3 Где две роли смешаны сегодня

**(а) Внутри одной строки `platform_users`.** На акторском корне лежат антропометрия и пол — данные о
пациенте, а не об учётке, и у них живой врачебный писатель:

- `apps/webapp/src/infra/repos/pgDoctorClients.ts:1481-1503` — `SELECT height_cm, weight_kg FROM platform_users
  WHERE id=$1 AND role='client'` и `UPDATE … SET height_cm/weight_kg`, наружу — `apps/webapp/src/app/api/doctor/patients/[userId]/physical/route.ts`;
- `pgDoctorClients.ts:1428-1436` — `UPDATE platform_users SET gender = $2`;
- `pgDoctorClients.ts:1416-1426` — `UPDATE platform_users SET birth_date = $2::date`, следом
  `syncUserIdentityFioMirrorWebapp(tx, userId)`, то есть дата рождения ПИШЕТСЯ в акторский корень и ЧИТАЕТСЯ
  из `user_identity` (`userIdentityFioSql.ts:25`).

Заполненность на DEV (`SELECT count(*), count(first_name), …, count(height_cm), count(weight_kg) FROM
public.platform_users;`): `294 | 226 | 196 | 82 | 0 | 1 | 0 | 0 | 294 | 122` —
users 294, first_name 226, last_name 196, patronymic 82, birth_date 0, gender 1, height_cm 0, weight_kg 0,
display_name 294, integrator_user_id 122. То есть ФИО дублируются в двух местах (226/196 против 294 строк
`user_identity`), а субъектные колонки корня почти пусты, но их путь записи жив.

**(б) 21 таблица несёт actor- и subject-колонку одновременно.**

```sql
SELECT child, string_agg(col, ', ' ORDER BY col) FROM (
 SELECT c.conrelid::regclass::text AS child, a.attname AS col
 FROM pg_constraint c JOIN unnest(c.conkey) WITH ORDINALITY k(attnum,ord) ON true
 JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum
 WHERE c.contype='f' AND c.confrelid='public.platform_users'::regclass) f
GROUP BY child HAVING count(*)>1 ORDER BY child;
```
```
be_appointment_staff_comments | author_id, platform_user_id
be_patient_booking_profiles   | platform_user_id, updated_by
be_patient_packages           | assigned_by_platform_user_id, platform_user_id
clinical_anamnesis_illness    | created_by, patient_user_id
clinical_anamnesis_lifestyle  | created_by, patient_user_id
clinical_anamnesis_trauma     | created_by, patient_user_id
clinical_visit                | created_by, patient_user_id
doctor_notes                  | author_id, user_id
doctor_patient_support        | patient_user_id, updated_by
media_folders                 | created_by, patient_user_id
org_brand_revisions           | archived_by…, created_by…, published_by…
organization_member_invites   | accepted_by…, created_by…
patient_comorbidity           | created_by, patient_user_id
patient_files                 | patient_user_id, uploaded_by_user_id
patient_invites               | accepted_by…, created_by…, patient_user_id, revoked_by…
patient_lfk_assignments       | assigned_by, patient_user_id
patient_merge_candidates      | anchor_user_id, candidate_user_id, resolved_by
patient_payment               | created_by, patient_user_id
platform_users                | blocked_by, merged_into_id
test_attempts                 | accepted_by, patient_user_id
treatment_program_instances   | assigned_by, patient_user_id
(21 rows)
```

**(в) Больше половины ссылок по имени колонки не говорит, какая это роль.** Тот же запрос без `HAVING`, с
классификацией по имени: 128 FK на `platform_users` — actor-колонки 54 (48 таблиц), subject-колонки
(`*patient_user_id`) 19 (19 таблиц), **неразличимые `user_id`/`platform_user_id` — 55 (54 таблицы)**. Схема
сегодня не помечает роль ссылки ничем, кроме соглашения об именах, и это соглашение покрывает меньше
половины ссылок.

**(г) Главное: в шве actor_ref и subject_ref — ОДНО И ТО ЖЕ значение.** Пространство непрозрачных ссылок одно
(`app_ext.variant_a_identity_refs`, `physical_user_id` PRIMARY KEY, `opaque_ref` UNIQUE —
`contract.sql:144-148`), резолвер один (`app_ext.resolve_variant_a_identity(uuid)`, `contract.sql:562`;
обратный `app_ext.resolve_variant_a_physical(uuid)`, `contract.sql:590`), и приложение подставляет ОДНУ
полученную ссылку в оба поля:

- `apps/webapp/src/infra/db/portContextRuntime.ts:355-356` — класс `patient`:
  `actorRef: requiredOpaqueIdentityRef(opaqueIdentityRef), subjectRef: requiredOpaqueIdentityRef(opaqueIdentityRef)`;
- `portContextRuntime.ts:339` — класс `staff` ставит только `actorRef`, `subjectRef` у него запрещён
  матрицей классов (`contract.sql:313`);
- `portContextRuntime.ts:490-496` — единственный вызов `app.pre_session_resolve_identity(uuid)`.

Следствие: требование оракула «type-aware resolver fail-closed не принимает actor-ref вместо subject-ref и
наоборот» (`WORK_ORDER.md:772`) сегодня не просто не выполнено — оно невыразимо: подменить ссылку нечем,
потому что ссылка одна. Приёмный шов это фиксирует прямо в теле: `contract.sql:642-643` вызывает один и тот
же `resolve_variant_a_physical` для обоих полей, а проверка пациента `actor_id IS DISTINCT FROM subject_id`
(`contract.sql:688-691`) сегодня тождественно истинна-в-равенстве.

**(д) Субъектный аксессор гейтит идентичность.** Использование аксессоров в политиках:

```sql
SELECT accessor, count(*) policies, count(DISTINCT tbl) tables FROM (
 SELECT p.polrelid::regclass::text tbl, u.accessor
 FROM pg_policy p, LATERAL (VALUES ('current_actor_user_id'),('current_patient_user_id'),
      ('current_org_id'),('current_integrator_user_id')) u(accessor)
 WHERE pg_get_expr(p.polqual,p.polrelid) LIKE '%'||u.accessor||'%'
    OR pg_get_expr(p.polwithcheck,p.polrelid) LIKE '%'||u.accessor||'%') s
GROUP BY accessor ORDER BY 2 DESC;
```
```
current_org_id            | 306 | 162
current_patient_user_id   |  45 |  42
current_integrator_user_id|   4 |   4
current_actor_user_id     |   1 |   1
```

Из 42 таблиц под `current_patient_user_id()` (то есть под `subject_ref`, `contract.sql:527-534`) **девять —
чисто акторские**:

```
platform_users                   | rev10_platform_users_patient_select_156 | r
user_channel_bindings            | rev10_patient_self_managed_216 | *
user_channel_preferences         | rev10_patient_self_managed_217 | *
user_contacts                    | rev10_patient_self_managed_218 | *
user_identity                    | rev10_patient_self_managed_220 | *
user_notification_topic_channels | rev10_patient_self_managed_221 | *
user_notification_topics         | rev10_patient_self_managed_222 | *
user_phone_history               | rev10_patient_self_managed_228 | *
user_web_push_subscriptions      | rev10_patient_self_managed_230 | *
```

Единственная политика на акторском аксессоре — `platform_users.rev10_platform_users_account_timezone_update_156`.
Сегодня это работает только потому, что обе ссылки — одна. Как только пространства разойдутся, самообслуживание
по контактам, каналам и ФИО будет гейтиться медицинской ссылкой — это и есть та встреча личности с медициной,
которую разделение должно убрать.

**(е) Стена персонала субъекта не знает вовсе.** У класса `staff` `subject_ref` запрещён (`contract.sql:313`),
видимость строк даёт `current_org_id()` (306 политик, 162 таблицы). Врач адресует пациента физическим
`platform_users.id` в аргументах корней. Это не поломка, а факт границы: субъектное пространство на этом
этапе обслуживает самообслуживание пациента, а не врачебные экраны.

### 1.4 Что уже построено и переиспользуется (заново не строить)

Карта `app_ext.variant_a_identity_refs` и её владелец `app_seam_identity_lookup_owner`; резолверы
`resolve_variant_a_identity` / `resolve_variant_a_physical`; именованный корень
`app.pre_session_resolve_identity(uuid)` с проверкой capability/purpose/typed-args (`contract.sql:766-782`);
матрица классов и `assert_port_context_claim` (`contract.sql:312-345`, `630-762`); три pre-session-capability
`webapp_{staff,patient,global_admin}_identity_resolve` (`declaration.ts:2594-2602`); память ссылки на запрос
(`portContextRuntime.ts:66-80`); журнал `admin_audit_log` со схлопыванием повторов (`conflict_key`,
`repeat_count`, `last_seen_at`). Дословная ссылка WORK_ORDER на перепись D15b/1 указывает на `_TODO`, а файл
лежит в `docs/archive/2026-08-no-disposable-db-retirement/D15B1_IDENTITY_CENSUS_2026-08-03.md` — это
наблюдение, не задача.

---

## 2. Целевая схема

### 2.1 Где проходит граница

Один физический кластер, одна база, одна таблица людей. Разделяются не таблицы, а **пространства ссылок** и
**право адресовать ими**:

- **actor/identity ref** — «этот запрос делает вот этот человек». Им гейтится всё, что принадлежит учётке:
  контакты, подтверждения, привязки каналов, предпочтения доставки, ФИО, само `platform_users`.
- **medical-subject ref** — «эта запись о вот этом человеке». Им гейтится всё клиническое и продуктовое.

Оба разрешаются в текущий `platform_users.id` внутри шва. Наружу физический id не выходит ни в одном
контексте — этого правила шов уже придерживается (`contract.sql:542-544`: «No port context row contains a
physical platform_users id»).

### 2.2 Одна карта с видом ссылки, а не вторая карта

Принцип владельца «один общий проход» (AGENTS.md §5: «Варианты одного действия — параметры одной точки, а не
отдельные функции») запрещает завести вторую таблицу карт и второй резолвер. Целевая форма:

- `app_ext.variant_a_identity_refs` получает колонку `ref_kind text NOT NULL CHECK (ref_kind IN ('actor','subject'))`;
  первичный ключ становится `(physical_user_id, ref_kind)`, `opaque_ref` остаётся глобально UNIQUE — то есть
  одна ссылка не может принадлежать двум видам. Владелец таблицы не меняется: `app_seam_identity_lookup_owner`.
- Резолверы получают вид **параметром**, а не близнецом:
  `app_ext.resolve_variant_a_identity(uuid, text)` и `app_ext.resolve_variant_a_physical(uuid, text)`.
- Обратный резолвер становится **type-aware и fail-closed**: если у найденной строки `ref_kind` не совпал с
  ожидаемым — `42501`, ровно как при ненайденной ссылке. Подстановка actor-ref туда, где ждут subject-ref,
  перестаёт быть возможной, а не перестаёт быть рекомендованной.
- Именованный корень остаётся один: `app.pre_session_resolve_identity(uuid, text)`. Он и дальше единственная
  дверь, за которой живёт физический id.

Карта остаётся append-only: строка вида появляется при первом обращении (lazy mint), существующая никогда не
переписывается. Это форма, которую шов уже доказал 19.08 после инцидента с no-op upsert (`contract.sql:545-561`:
142 778 обновлений и 589 автовакуумов на 13 живых строках) — её ломать нечем и незачем.

**Как выводится `opaque_ref`.** Сегодня это `sha256(uuid_send(physical_id))`, разложенный в UUID
(`contract.sql:574-581`) — чистая функция физического id. С видом ссылки такая форма обязана перестать быть
чистой функцией одного аргумента, иначе actor- и subject-ссылка совпадут. Рекомендация — перейти на
`gen_random_uuid()`: карта уже append-only, детерминизм ей ничего не даёт, а предсказуемая ссылка — это
ссылка, которую знающий физический id вычисляет без обращения к карте. Это вопрос владельцу (раздел 6, №1),
безопасное умолчание при отсутствии ответа — детерминизм с разделителем вида
(`sha256(uuid_send(id) || ref_kind)`): поведение сохраняется, ссылки расходятся.

### 2.3 Что переезжает, что остаётся

**Остаётся на месте:** все 128 внешних ключей на `platform_users.id`; все клинические таблицы; стена
арендатора `current_org_id()`; матрица классов и её правила про то, у какого класса какие поля обязательны;
владельцы объектов; `packages/platform-merge` как движок записи (`IDENTITY_AND_MERGE_SCHEME.md` §2d).

**Меняется:**

1. Карта ссылок получает вид, резолверы — параметр вида и fail-closed проверку (2.2).
2. Приложение перестаёт подставлять одну ссылку в оба поля: `portContextRuntime.ts` для класса `patient`
   разрешает `actorRef` как `'actor'` и `subjectRef` как `'subject'`; класс `staff` — только `'actor'`.
3. Девять акторских политик из 1.3(д) переводятся с `current_patient_user_id()` на `current_actor_user_id()`.
   После этого субъектная ссылка не даёт доступа ни к одному контакту, каналу и ФИО.
4. Появляется аудит акта связывания в существующий `admin_audit_log` — только на пересечение границы
   (создание связки; вход — раз на сессию; открытие карточки — раз; список — одно событие на пакет), по
   решению владельца из `IDENTITY_AND_MERGE_SCHEME.md` §2c.

**Становится именованным корнем:** `app.pre_session_resolve_identity(uuid, text)` — единственная дверь
физический→непрозрачный; `app_ext.resolve_variant_a_physical(uuid, text)` — единственная дверь обратно,
исполнимая только владельцем шва контекста.

**Кандидат на переезд, вынесен вопросом (раздел 6, №2):** `platform_users.height_cm`, `weight_kg`, `gender`,
`birth_date` — субъектные данные на акторском корне (1.3(а)). Их переезд в клиническую таблицу — отдельный
шаг с собственной миграцией и своим откатом, он не нужен ни одному другому шагу.

### 2.4 Совместимость с вариантом I

Ни один шаг не делает физический `platform_users.id` частью доказательства порта: доказательство даёт
capability + purpose + typed-args-hash (`contract.sql:302-311`), личность приезжает отдельными непрозрачными
полями. Резолвер остаётся отдельным швом с отдельным владельцем — при переходе к варианту I меняется его тело,
а не вызывающие. Это ровно то, что зафиксировано в `docs/OWNER_DECISIONS.md:505`.

---

## 3. Права (разбор по AGENTS.md §1 «Перед приземлением миграции — разбор её прав»)

Права выдаёт только генератор (`deploy/postgres/privileges/`) шагом reconcile. Миграция создаёт и меняет
объекты и не содержит ни одного `GRANT`/`REVOKE`/`CREATE POLICY` (AGENTS.md §1, «⛔ Миграция не выдаёт и не
отзывает права»). Ниже — по каждому телу: под какой ролью исполняется и что ему нужно, чтобы **исполниться**.

### 3.1 Объекты, которые создаёт/меняет миграция

| Объект | Что с ним |
|---|---|
| `app_ext.variant_a_identity_refs` | +колонка `ref_kind`, смена PK на `(physical_user_id, ref_kind)`, `opaque_ref` остаётся UNIQUE |
| `app_ext.resolve_variant_a_identity(uuid)` | заменяется на `(uuid, text)` — DROP+CREATE, новый OID |
| `app_ext.resolve_variant_a_physical(uuid)` | заменяется на `(uuid, text)` — DROP+CREATE, новый OID |
| `app.pre_session_resolve_identity(uuid)` | заменяется на `(uuid, text)`; старая сигнатура держится один шаг как совместимость и снимается отдельным шагом |
| `app_ext.assert_port_context_claim(...)` | тело: ожидаемый вид передаётся в обратный резолвер |
| девять политик из 1.3(д) | `current_patient_user_id()` → `current_actor_user_id()` — **это декларация, не миграция** |

### 3.2 Роль исполнения и потребные права

**`app_ext.resolve_variant_a_identity(uuid, text)`** — SECURITY DEFINER, владелец
`app_seam_identity_lookup_owner` (он же владелец таблицы). Тело: `SELECT` по PK и `INSERT … ON CONFLICT DO
NOTHING`. Нужно: `SELECT` и `INSERT` на `app_ext.variant_a_identity_refs`, колонки
`physical_user_id`, `opaque_ref`, **`ref_kind`**. В декларации это `relationSurfaces` записи
`declaration.ts:6170-6173` — список колонок обязан пополниться `ref_kind` в той же ветке, иначе генератор
выдаст грант не на ту поверхность. Список колонок таблицы в `declaration.ts:2466-2468` — там же.
`execute: []` сохраняется: функция остаётся приватной за именованным корнем.

**`app_ext.resolve_variant_a_physical(uuid, text)`** — SECURITY DEFINER, тот же владелец,
`execute: ['app_seam_context_owner']`. Тело: только `SELECT`, теперь читающий и `ref_kind`. Нужно: `SELECT` на
трёх колонках. Декларация — `declaration.ts:6190-6194`.

**`app.pre_session_resolve_identity(uuid, text)`** — SECURITY DEFINER, владелец
`app_seam_identity_lookup_owner`, `execute: ['app_pre_session', 'app_platform_admin']`
(`declaration.ts:6215-6219`). Тело зовёт `app.require_accepted_context(...)` и приватный резолвер — обоим правам
уже выданы, новых объектов не появляется. **Меняется typed-args:** сегодня хеш считается по одному аргументу
(`contract.sql:776`), станет по двум — `ARRAY[ROW('uuid@1', …), ROW('text@1', …)]`. Приложение обязано считать
тот же хеш, иначе `42501` «port context capability mismatch» на первом же входе.

**`app_ext.assert_port_context_claim(...)`** — SECURITY DEFINER, владелец
`app_seam_identity_lookup_owner`. Новых таблиц не читает; передаёт ожидаемый вид в обратный резолвер.
Поверхность в `declaration.ts:6201+` не меняется.

**Политики.** Перевод девяти политик с субъектного аксессора на акторский требует, чтобы у роли `app_patient`
было `EXECUTE` на `app.current_actor_user_id()`. Оно уже есть: `GRANT EXECUTE ON FUNCTION
app.current_actor_user_id() TO app_staff, app_clinic_billing, app_patient, app_platform_settings`
(`contract.sql:807`). Новых грантов шаг не требует.

### 3.3 `SELECT … FOR UPDATE` / `FOR SHARE` — отдельно

PostgreSQL берёт за блокировку строки право **класса UPDATE**, а не `SELECT`: поколоночного `SELECT` не
хватает, запрос падает `42501 permission denied for table` до сравнения данных
(`deploy/postgres/privileges/declaration.ts:2025-2039`, `deploy/postgres/privileges/row-lock-privileges.test.mjs:4-16`).
Табличный UPDATE при этом не нужен — достаточно UPDATE на одной любой колонке. Механика: замок объявляется в
`ROW_LOCK_SURFACES` (`declaration.ts:2041+`), тест `row-lock-privileges.test.mjs` роняет
`pnpm test:db-privileges`, если в теле есть замок без строки в списке.

Что это значит здесь:

1. **Новых замков не заводить.** Целевые резолверы читают по ключу и вставляют с `ON CONFLICT DO NOTHING` —
   замка нет и не требуется. Соблазн взять `SELECT … FOR UPDATE` на карте (например, чтобы «атомарно»
   проставить вид существующим строкам) отвергается: карта append-only, гонка первой записи уже закрыта
   `DO NOTHING` + ограниченный повтор чтения (`contract.sql:562-588`). Замок здесь купил бы только новую
   строку в `ROW_LOCK_SURFACES` и право UPDATE, которого у поверхности нет.
2. **Существующий `FOR SHARE` не трогается.** `install_port_context` берёт
   `SELECT * INTO cap FROM app_ext.port_context_capabilities … FOR SHARE` (`contract.sql:305`). Строки в
   `ROW_LOCK_SURFACES` у неё нет и не нужно: функция принадлежит владельцу этой таблицы, у владельца право
   класса UPDATE есть по построению. Ни один шаг этого не меняет.
3. **Если шаг всё же добавит замок** — в той же ветке в `ROW_LOCK_SURFACES` появляется
   `'<функция>': { 'app_ext.variant_a_identity_refs': 'created_at' }` (самая слабая колонка, которой замок
   оплачивается), и это проверяется тестом до выкатки, а не на первом живом вызове.

### 3.4 Смена сигнатур

DROP+CREATE меняет OID, а `function_identity` — это `regprocedure`
(`app_ext.port_context_capabilities.function_identity`, `contract.sql:113`). Значит после каждой миграции,
меняющей сигнатуру, обязателен reconcile, и в той же ветке правятся три capability-дескриптора
`webapp_{staff,patient,global_admin}_identity_resolve` (`declaration.ts:2594-2602`), у которых
`functionIdentity: 'app.pre_session_resolve_identity(uuid)'`. Пропустить это — получить `42501` «port context
capability mismatch» на первом входе любого человека, при зелёных миграции и деплое.

---

## 4. Порядок шагов и обратимость

Каждый шаг приземляется и проверяется отдельно. Ни один не требует одномоментного переключения всего:
до шага 5 обе ссылки разрешаются в один и тот же физический id, поэтому старые политики продолжают работать
независимо от того, какого вида ссылка приехала.

**Ш1 — вид в карте, поведение не меняется.**
Миграция: `ADD COLUMN ref_kind text NOT NULL DEFAULT 'actor'` + CHECK. PK пока прежний. В той же ветке:
`ref_kind` добавляется в список колонок таблицы и в `relationSurfaces` обоих резолверов
(`declaration.ts:2466`, `6173`, `6194`). Проверка: reconcile зелёный, вход человека работает.
*Откат:* `DROP COLUMN ref_kind` + возврат декларации. Данных нет, теряется нечего.

**Ш2 — ключ по паре.**
Миграция: PK → `(physical_user_id, ref_kind)`, `opaque_ref` UNIQUE сохраняется. Пока все строки `'actor'`,
уникальность не нарушается ни одной существующей строкой.
*Откат:* вернуть PK на `physical_user_id` — обратим, пока строк вида `'subject'` нет.

**Ш3 — резолверы принимают вид, но ещё не проверяют его.**
Миграция: обе функции `app_ext.*` и корень `app.pre_session_resolve_identity` получают аргумент вида;
старая сигнатура `(uuid)` остаётся ровно на время Ш3–Ш6 как совместимость и делегирует в новую с `'actor'`.
Декларация: три capability-дескриптора получают новую `functionIdentity`; typed-args корня становятся двумя.
Приложение: `portContextRuntime.ts:490-496` зовёт корень с `'actor'` и считает хеш по двум аргументам.
Проверка: живой вход staff/patient/admin на DEV.
*Откат:* вернуть прежние тела и дескрипторы; строки карты остаются валидными (`ref_kind='actor'`).
*Почему совместимая сигнатура допустима при §5 «один общий проход»:* это не второй путь, а тонкий делегат
без собственного тела, живущий до Ш6, где снимается названным шагом. Если владелец предпочтёт одномоментную
смену — она технически возможна (один вызывающий в TS, три дескриптора), но тогда код и reconcile обязаны
приехать одной выкаткой.

**Ш4 — приложение начинает просить ссылку нужного вида.**
Код: `portContextRuntime.ts` для класса `patient` разрешает `actorRef` видом `'actor'`, `subjectRef` — видом
`'subject'` (две поездки на запрос вместо одной, обе под существующей памятью
`opaqueIdentityRefMemoKey` — ключ памяти расширяется видом). Класс `staff` — только `'actor'`.
Субъектные строки карты появляются лениво, backfill-миграции нет.
Проверка: у пациента в `accepted_port_contexts` `actor_ref <> subject_ref`, оба разрешаются в один id;
проверка `actor_id IS DISTINCT FROM subject_id` (`contract.sql:688`) по-прежнему проходит.
*Откат:* вернуть код; лишние строки `'subject'` в карте безвредны — их никто не спрашивает.

**Ш5 — fail-closed по виду.**
Миграция: `resolve_variant_a_physical(uuid, text)` поднимает `42501` при несовпадении вида;
`assert_port_context_claim` передаёт `'actor'` для `actor_ref` и `'subject'` для `subject_ref`.
С этого момента подмена ссылки отвергается базой.
Проверка: доказательство на DEV в духе `port-context-tenant-claim.devDbProof.test.mjs` — установка контекста
с actor-ref в поле `subject_ref` даёт `42501`.
*Откат:* убрать проверку вида из тела (одна строка), карта и приложение не трогаются.

**Ш6 — акторские политики уходят с субъектного аксессора.**
Декларация: девять политик из 1.3(д) переводятся на `current_actor_user_id()`. Шаг делится по таблицам —
можно вести по одной. Новых грантов не требует (3.2).
Проверка: пациент правит свои контакты/каналы/ФИО; проверка «субъектной ссылкой контакт не достаётся».
*Откат:* вернуть аксессор в политике; поведение до и после для честного пациента одинаково.

**Ш7 — снятие совместимой сигнатуры.**
Миграция: `DROP FUNCTION app.pre_session_resolve_identity(uuid)` и приватные однопараметрические варианты.
*Откат:* воссоздать (тело тривиально), но с этого шага единственный проход по-настоящему один.

**Ш8 — аудит акта связывания.**
Запись в существующий `admin_audit_log` (`conflict_key`, `repeat_count`, `last_seen_at`) на четырёх точках
пересечения границы: создание связки; вход — раз на сессию; открытие карточки — раз; список — одно событие на
пакет. Новой сущности не заводится (решение владельца, §2c). Вместе с шагом — одно правило тревоги на
аномальный объём, без него журнал по решению владельца бессмыслен.
*Откат:* выключить запись; строки журнала безвредны.

**Ш9 (по ответу владельца, раздел 6 №2) — субъектные колонки уезжают с акторского корня.**
`height_cm`, `weight_kg`, `gender`, `birth_date` из `platform_users` — в клиническую таблицу; врачебные
писатели `pgDoctorClients.ts:1416-1436`, `1481-1503` переводятся туда же; заодно исчезает расхождение
«пишем в `platform_users.birth_date`, читаем `user_identity.birth_date`». Отдельная миграция, отдельный
разбор прав, зависимости от Ш1–Ш8 нет.
*Откат:* обратная миграция колонок; данных на DEV в них практически нет (1.3(а)), на TEST/PROD объём
измеряется перед шагом.

**Порядок обратимости в целом.** Ш1–Ш8 — высокообратимые: ни один не удаляет данные и не меняет физическую
адресацию клинических записей. Единственный дорогой откат в цепочке — вариант I, и он в этот объём не входит
(раздел 5).

---

## 5. Что этот объём НЕ включает

- **Физическое разнесение баз (вариант I) — остаётся отложенным.** Ни один шаг не разносит хранилища, не
  заводит второе подключение и не убирает `JOIN`. Решение о варианте I принимается ПОСЛЕ этой стадии
  (`IDENTITY_DB_SPLIT_RESEARCH_2026-08-03.md` §6, стадия 3; `OWNER_DECISIONS.md:507`).
- **Массовый перенос клинических FK** на субъектную ссылку — прямо исключён оракулом (`WORK_ORDER.md:771`).
  Клинические таблицы продолжают ссылаться на `platform_users.id`.
- **Второй linkage-service, HTTP-hop, параллельный store** — прямо исключены (`WORK_ORDER.md:768-770`).
- **Региональное разнесение RU↔EU** — стадии нет (`IDENTITY_AND_MERGE_SCHEME.md` §2c, п.4).
- **Смена стены персонала.** Врачебные экраны остаются под `current_org_id()`; перевод врачебных корней на
  субъектную ссылку в этот объём не входит (вопрос №3 ниже).
- **TEST-гейт D15b/6** (логин/привязка/доставка) — отдельная работа; она блокирует закрытие пункта в
  документах, а не эту схему.
- **Защита от компрометации самого порта.** Разделение ссылок внутри одной базы не закрывает вектор
  «сломали то, что легитимно видит обе стороны» — против него работает только журнал акта связывания (Ш8) и
  тревога на объём.

---

## 6. Открытые вопросы владельцу

1. **Непрозрачная ссылка — случайная или вычисляемая?** Сегодня `opaque_ref = sha256(физический id)`, то есть
   знающий физический id вычисляет ссылку, не заглядывая в карту.
   *Рекомендация:* перейти на `gen_random_uuid()` — карта append-only, детерминизм ей ничего не даёт.
   *Безопасное умолчание, если ответа нет:* оставить вычисляемой, добавив в хеш разделитель вида — поведение
   прежнее, ссылки видов расходятся.

2. **Рост, вес, пол и дата рождения на акторском корне — переезжают в этом объёме или отдельно?** Это
   медицинские данные в строке учётки, с живым врачебным писателем (1.3(а)).
   *Рекомендация:* сделать шагом Ш9 в этом же объёме — иначе разделение проведено в ссылках, но не в данных.
   *Безопасное умолчание:* не делать сейчас, зафиксировать отдельной строкой плана — от Ш1–Ш8 не зависит.

3. **Врачебные экраны: переводить ли адресацию пациента на субъектную ссылку?** Сегодня врач адресует
   пациента физическим id в аргументах корней, стена — арендаторская.
   *Рекомендация:* НЕ в этом объёме — это и есть массовый перенос, исключённый оракулом.
   *Безопасное умолчание:* оставить как есть; вернуться к вопросу после стадии 2.

4. **`org_enrollments.platform_user_id` — актор или субъект?** Вопрос открыт с переписи 03.08 (спорный
   случай №6) и не закрыт до сих пор; от ответа зависит, каким аксессором гейтится зачисление.
   *Рекомендация:* актор — зачисление описывает отношение учётки с клиникой, а не медицинскую запись.
   *Безопасное умолчание:* оставить под текущим гейтом (`current_org_id()`), решение не срочное.

5. **Аудит акта связывания — подтвердить четыре точки.** Создание связки; вход — раз на сессию; открытие
   карточки — раз; список — одно событие на пакет; плюс одно правило тревоги на аномальный объём.
   *Рекомендация:* принять как есть — это уже согласованный компромисс после возражения «зачем, кроме
   нагрузки» (§2c).
   *Безопасное умолчание:* начать с одной точки (создание связки) и добавить остальные после замера объёма
   на реальных данных.
