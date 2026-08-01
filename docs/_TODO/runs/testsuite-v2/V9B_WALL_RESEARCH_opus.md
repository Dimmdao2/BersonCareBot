# В9б — где должна стоять стена изоляции для таблиц без RLS (класс из 53)

Независимый исследователь (Opus), 01.08. Только оценка — код/база не менялись. Второй исследователь (Sol)
отвечает независимо; это МОЙ разбор.

Вопрос владельца («должен ли `patient_bookings` быть под RLS?») развёрнут по поправке координатора в общий:
для ЛЮБОЙ из 53 таблиц без RLS — как определить, где должна жить её стена. `patient_bookings` — иллюстрация.

Замер: dev `bcb_webapp_dev`, read-only. 219 таблиц public: **166 FORCE RLS, 53 с `relrowsecurity=false`**
(совпало с фактом лида). Классификационные колонки и пути чтения проверены по коду и грантам.

---

## 1. ПРАВИЛО: три вопроса решают стену любой таблицы

Стена для таблицы определяется не «чувствительная ли она вообще», а **где физически возможно и надёжно
поставить запрет**. Три вопроса по порядку; первый сработавший даёт вердикт.

**Q1 — Строка общая для всех арендаторов и не персональная (справочник/глобальное)?**
Признак: нет `organization_id`, нет `platform_user_id/user_id`, содержимое — каталог/справочник/метаданные
миграций. → **Оставить открытой, RLS не нужен.** Оговорка-ловушка: если у таблицы ЕСТЬ `organization_id`, она
НЕ глобальная (даже если называется «аналитика/receipts») — идёт в Q3.

**Q2 — Строка достижима ТОЛЬКО на до-принципальном пути или по владению-неугадываемым-ключом?**
Это таблицы аутентификации/бутстрапа: challenges, OTP-locks, login-tokens, passkey/password-credentials,
secrets, signup-intents, idempotency, rate-limit. В момент чтения принципала ещё НЕ существует (это сам вход),
поэтому табличный RLS — неверный инструмент: политика `= current_*()` вычислит NULL и закроет вход (ровно урок
`platform_users`, [[force-rls-cutover-breaks-unprincipled-reads]]). → **Стена законно НЕ в RLS, а в трёх слоях:**
(a) неугадываемый ключ в `WHERE` (holder-of-key), (b) чтение ТОЛЬКО через `SECURITY DEFINER app.*`-шов,
владелец которого мигратор/`app_owner` и который сам себя scoped, (c) НИ ОДИН login-роль не имеет прямого
широкого `SELECT`. Проверено: все `user_*/`*_challenges/*secrets` в коде читаются через `app.auth_*`
(`app.auth_oauth_list_user_providers`, `app.auth_login_token_read`, `app.auth_user_pin_read`, …) — шов
эксклюзивный. **Вердикт «оставить» действителен ТОЛЬКО пока шов эксклюзивен**; если у login-роля есть прямой
`SELECT *` мимо шва — это дыра, а не «по-ключу».

**Q3 — Иначе это арендаторские/пациентские бизнес-данные. Есть ли колонка-дискриминатор?**
`organization_id` (стена персонала org↔org) и/или `platform_user_id/user_id` (стена пациента own-only).
- **Дискриминатор есть** → **RLS в базе — норма и обязателен** (это ровно то, что держит 166 таблиц).
  Отсутствие RLS здесь — аномалия, которую надо оправдывать, а не наоборот.
- **Дискриминатора нет** (`patient_bookings` частично, `appointment_records`) → RLS невозможен без изменения
  схемы. Это **настоящая проектная развилка**, выбрать ОДНО:
  - (a) добить дискриминатор (`organization_id` бэкфиллом; `platform_user_id` уже есть) + FORCE RLS — вводит
    таблицу в норму, defense-in-depth; ЛИБО
  - (b) держать её как **walled projection**: каждое чтение/запись идёт через ОДИН `SECURITY DEFINER`, который
    сам scoped к принципалу (пациент — `current_patient_user_id()`; персонал — через join к родителю
    `be_appointments`, который под FORCE RLS org-walled), и НИ ОДИН login-роль не имеет прямого доступа к
    таблице. Тогда стена-источник — родитель под FORCE RLS, проекция наследует.

**Недопустимая середина (сегодняшнее состояние `patient_bookings`/`appointment_records`):** дискриминатора нет,
RLS нет, И при этом login-роль имеет прямой `SELECT/INSERT/UPDATE/DELETE`, а стена живёт только в рукописном
`WHERE platform_user_id = $1`, который забывчивый маршрут может опустить. Для PHI/PII это не стена, а
соглашение — тот самый класс, который канон Next.js DAL (цитируется в оракуле В9б) и defense-in-depth признают
недостаточным.

**Итоговая формула правила одной строкой:** *дискриминатор + принципальный путь → RLS; до-принципал/ключ →
эксклюзивный definer-шов; глобальное → открыто. Рукописный `WHERE` как ЕДИНСТВЕННАя стена для PHI — запрещён.*

---

## 2. По-табличный вердикт для чувствительного класса

Легенда: **RLS** = включить ENABLE+FORCE с политикой; **definer-шов** = стена законно на app-layer через
эксклюзивный `SECURITY DEFINER` + ключ/грант (не рукописный WHERE); **открыто** = глобальное/по-ключу, оставить.

### D-1. Арендаторские данные С дискриминатором, RLS нет = ЧИСТЫЙ ПРОБЕЛ → RLS-включить
| Таблица | Колонки | Вердикт | Причина |
|---|---|---|---|
| `be_organization_members` | `organization_id`,`platform_user_id` | **RLS** | членство/роли, org-scoped, дискриминатор есть — прямая аномалия что не под FORCE. Политика: staff org-wide (`organization_id=current_org_id()`) + self. ⚠️ dev показал `relrowsecurity=f`, а память [[force-rls-backstops...]] описывает TEST как «ENABLE-но-не-FORCE=owner-exempt» — расхождение dev/test, см. §4. |
| `product_analytics_hourly` | `organization_id` | **RLS** | лид отнёс к «глобальным», но колонка org есть → это per-clinic телеметрия. Дешёвая политика org-match, до-принципального пути нет. |
| `reference_catalog_snapshot_receipts` | `organization_id` | **RLS** (низкий приоритет) | org-scoped receipts; или owner-only definer. Утечка малочувствительна, но правило то же. |

### D-2. Пациентские бизнес-данные, дискриминатор частичный, PII → RLS-включить (пациентская стена доступна УЖЕ)
| Таблица | Колонки | Вердикт | Причина |
|---|---|---|---|
| `patient_bookings` | `platform_user_id`,`contact_phone/email/name`; **нет `organization_id`** | **RLS** | Ключевая переоценка: `platform_user_id` ЕСТЬ → пациентская own-политика (`platform_user_id=current_patient_user_id()`) строится в базе СЕГОДНЯ, схема не нужна. Заблокирована только стена персонала (нужен org — через join к `be_appointments` или бэкфилл). То есть таблица менее заблокирована чем `platform_users`. |
| `appointment_records` | `platform_user_id`; нет org | **RLS** | то же: пациентская own-политика доступна сразу; персональная org — через канонический join. |

### D-3. Идентити/PII-гибрид (читается И до принципала, И после) → RLS через ПРОЕКТИРОВАННЫЙ cutover
| Таблица | Вердикт | Причина |
|---|---|---|
| `platform_users` (284 строки PII: имя/тел/почта/др) | **RLS, но не flag-flip** | Корень идентити, читается на бутстрапе (вход/signup/invite) ДО принципала. Сегодня единственная стена — app-layer ([[platform-users-has-no-rls-single-wall-on-pii]], severity HIGH). Целевое: self-политика (`id=current_patient_user_id()`) + staff org-wide через membership-join, а бутстрап-чтения — через fail-open definer-шов. Требует спроектированного перехода, НЕ включения флага (иначе молча ломается вход). Высший приоритет. |

### D-4. CMS/каталог бронирования, org-scoped через родителя, дискриминатора нет → definer-шов (+org к multi-clinic)
| Таблицы | Вердикт | Причина |
|---|---|---|
| `branches`,`booking_branches`,`booking_services`,`booking_specialists`,`booking_branch_services`,`booking_calendar_map` | **definer-шов сейчас; RLS+org при multi-clinic** | Читаются на ПУБЛИЧНОМ пути бронирования (до логина) по clinic-slug; `public-booking-bootstrap-resolver.sql` уже ЗАПРЕЩАЕТ `app_patient` прямой SELECT и гонит через definer, scoped к разрешённой клинике. Сегодня 1 клиника → утечки нет. Под SaaS: добавить `organization_id` + политику ЛИБО оставить за публичным definer-резолвером (scope by slug→org). Это отложенный SaaS-пробел, не острый. |
| `staff_security_profiles` (`user_id`, TOTP/security PII) | **definer-шов + self-RLS backstop** | per-user security config, читается на auth-пути через definer (`consume_staff_totp_login` и пр.) = Q2. Но пост-логин тоже читается → добавить self-политику (`user_id=principal`) как backstop к defense-in-depth. |

### D-5. Auth/account-сателлиты — до-принципал/по-ключу (Q2) → оставить (стена на definer-шве)
`user_password_credentials`, `user_pins`, `user_passkey_accounts/credentials/challenges`, `user_oauth_bindings`,
`user_channel_bindings`, `user_channel_preferences`, `user_notification_topics`,
`user_notification_topic_channels`, `user_web_push_subscriptions`, `user_email_setup_tokens`,
`channel_link_secrets`, `phone_messenger_bind_secrets`, `specialist_signup_intents`, `email_challenges`,
`phone_challenges`, `login_tokens`, `email_otp_locks`, `phone_otp_locks`, `email_send_cooldowns`,
`password_altcha_challenges`, `password_login_identifier_protection`, `idempotency_keys`,
`auth_rate_limit_events`.
→ **Оставить**, стена законно = эксклюзивный `app.auth_*` definer-шов + `user_id`/ключ + узкие гранты
(подтверждено: чтения идут через SECURITY DEFINER, не прямым SELECT). **Условие вердикта:** ни один login-роль
не должен иметь прямого `SELECT *`. Для пост-логин-читаемых (`user_channel_preferences`,
`user_notification_topics`, `user_web_push_subscriptions`) — опционально self-RLS backstop; секреты/challenges
законно остаются по-ключу.

### C. Глобальное/операционное — оставить открытым
`booking_cities`,`clinical_test_measure_kinds`,`reference_catalog_baselines` (справочники);
`schema_migrations`,`webapp_schema_migrations` (метаданные мигратора); `media_playback_stats_hourly`;
`operator_incidents`,`operator_health_alert_sent`,`integration_webhook_error_events/_last_status`,
`saas_isolation_events/_event_hourly/_coverage_runs` (платформенные операции, cross-tenant by design,
читаются operational-ролями).
⚠️ Отдельно проверить гранты: `outgoing_delivery_queue`, `integrator_push_outbox` несут payload/получателей
(потенциально cross-tenant PII) — вердикт «оставить» ТОЛЬКО если грант на них = operational-worker роли, а не
`app_patient/app_staff`. Не проверил гранты этих двух построчно (см. §4).

---

## 3. Целевой дизайн стены для `patient_bookings` и его класса

**Рекомендация: RLS (defense-in-depth), не «app-layer навсегда».** Для PHI/PII (телефон, почта, имя пациента,
время визита) стена обязана жить в БД. Правильная форма — **две независимые стены**: DB-RLS + ранняя
app-проверка (последняя остаётся ради понятной ошибки, границей безопасности не считается — ровно как требует
В9б и канон Next.js DAL).

**Конкретно для `patient_bookings`:**
1. Пациентская стена — СТРОИТСЯ УЖЕ: `platform_user_id` есть. Политика
   `platform_user_id = app.current_patient_user_id()`. Это закрывает пациент↔пациент (главный приоритет
   владельца, [[saas-patient-wall-is-own-data-only]]) без изменения схемы.
2. Стена персонала (org↔org) — персонал видит клинику целиком (вариант A,
   [[patient-visibility-and-tenant-walls-decision]]). `patient_bookings` org-колонки не имеет; два пути:
   - **бэкфилл `organization_id`** из `be_appointments` (через `canonical_appointment_id`) + org-политика —
     чище, вводит в норму 166; ИЛИ
   - оставить staff-чтение только через существующую проекцию/канонический join к `be_appointments` (под
     FORCE RLS org-walled) и запретить staff прямой SELECT. Тогда родитель — стена-источник.
3. Форма политики (из [[saas-patient-wall-is-own-data-only]]):
   `(app.is_staff() AND organization_id = app.current_org_id()) OR (platform_user_id = app.current_patient_user_id())`;
   принципал не установлен → DENY.
4. Чтение пациентом уже идёт через `SECURITY DEFINER app.read_current_patient_booking_rows` (владелец
   `app_owner`, BYPASSRLS, сам scoped к пациенту) — под FORCE RLS остаётся корректным. Реминдеры — через
   `app_web_push_reminder_discovery_definer`-шов, тоже совместимо.

**Тредоффы:**
- *RLS-путь:* +1 независимая стена в БД; забытый `WHERE` в маршруте больше не утечка. Цена: спроектировать
  политику, бэкфилл org, и — главный риск — **беспринципальные ПРЯМЫЕ чтения станут пустыми** (урок
  [[force-rls-cutover-breaks-unprincipled-reads]]: FORCE-cutover молча обнулил plain `db.select()`). До
  включения FORCE все прямые пути (`getById`, `getByCanonicalAppointmentId`, счётчики в `pgChannelLinkClaim`,
  merge-preview `platformUserMergePreview`) должны быть либо обёрнуты принципалом, либо переведены на definer.
- *app-layer навсегда:* дёшево, но одна стена и забываемая — для PHI это ниже грейда.

**Что сломается при включении FORCE RLS на `patient_bookings` — беспринципальные пути чтения/записи:**
| Путь | Роль/принципал сейчас | Что нужно, чтобы пройти сквозь RLS |
|---|---|---|
| `getById(bookingId)`, `getByCanonicalAppointmentId` (pgPatientBookings.ts:313,321) | plain `runWebappPgText`, без принципала | обернуть в tx с принципалом ИЛИ definer-accessor |
| `createPending`/`markConfirmed`/`markCancelled`/`updateSlots` (мутации) | plain pool, login-роль | write-политика + установленный принципал пациента/персонала |
| `pgChannelLinkClaim` COUNT `patient_bookings WHERE platform_user_id=$1` | plain | принципал ИЛИ definer count |
| `platformUserMergePreview` (COUNT + overlap join) | `runPgPoolPgText`, admin-операция | admin/принципал или owner-definer |
| Публичная бронь / canonicalCreate, payments `prepaymentContextFromBooking` | до-принципал/сессия | resolver-definer или принципал сессии |
| Staff-delete в `pgAppointmentProjection` (`DELETE patient_bookings WHERE canonical_appointment_id=$1`) | резолвит org через `be:<uuid>` join, app-layer | staff-принципал + org-политика |

**Цена перехода:** средняя. Пациентская политика — дёшево (колонка есть). Дорогое и опасное — обёртка ВСЕХ
беспринципальных прямых чтений (это часть незакрытого #821, «single chokepoint principal-wrap»,
[[force-rls-cutover-breaks-unprincipled-reads]]). Включать только после того как все прямые пути идут через
принципал/definer, иначе тихо обнулятся кабинет и реминдеры. Делать «при свете», с adversarial-аудитом.

**Обобщение на класс D-2/D-3:** `appointment_records` — идентична `patient_bookings` (own-политика доступна,
org через канон). `platform_users` — тот же дизайн, но бутстрап-чтения обязаны идти fail-open через definer-шов,
поэтому она — отдельный проектированный cutover, не «в общей волне».

---

## 4. ЧЕГО НЕ ЗНАЮ / не проверил

- **dev vs TEST — состояние ENABLE/FORCE может расходиться.** Я мерил `relrowsecurity` на `bcb_webapp_dev`, и
  рантайм-роль там `bcb_webapp_dev_user` (владелец таблиц, НЕ bypassrls) — на dev RLS для owner всё равно не
  применяется, так что «что реально закрыто» проверяется только на TEST под `app_patient/app_staff/
  bcb_test_*_login`. Для `be_organization_members`/`platform_users`/`specialist_signup_intents` память описывает
  TEST как «RLS ENABLE, но не FORCE = owner-exempt», а мой dev-замер даёт `relrowsecurity=false`. Расхождение
  НЕ разрешил — нужно перемерить на TEST (`bcb_webapp_test`), у меня к нему доступа в этом дереве нет.
- **Гранты построчно проверил только для `patient_bookings`** (app_staff: S/I/U/D; app_owner: S; app_patient
  прямого SELECT нет — читает через definer). Для остальных 52 гранты по ролям НЕ выгружал поимённо — вердикты
  Q2/D-5 опираются на то, что чтения в КОДЕ идут через `app.auth_*`, но не исключил, что где-то есть и прямой
  широкий SELECT login-роля (это бы превратило «по-ключу» в дыру). `outgoing_delivery_queue`/
  `integrator_push_outbox` гранты особенно стоит проверить (PII в payload).
- **Мировая практика — общее знание, без конкретных цитат.** Что RLS/Postgres — признанный механизм tenant-
  изоляции для мед/health SaaS, а defense-in-depth (две независимые стены) — грейд для PHI/PII, я утверждаю как
  известную практику. HIPAA §164.312 (technical safeguards, access control) и GDPR (data minimization,
  security-by-design) требуют контроля доступа НА слое данных и «минимально необходимого», но **не предписывают
  именно RLS**. Точные формулировки статей по памяти не цитирую уверенно — если нужна нормативная привязка,
  проверить первоисточники, не с моих слов.
- **Не подтвердил живым прогоном**, что беспринципальный запрос к `patient_bookings` после гипотетического FORCE
  реально вернёт 0 (на dev owner-exempt это не воспроизвести). Список «что сломается» выведен из кода и из
  задокументированного инцидента 17.07, а не из свежего прогона на TEST.
- **`media_playback_stats_hourly`, saas_isolation_*, integration_webhook_*** — отнёс к операционным по имени и
  отсутствию дискриминатора; их пути чтения детально не читал.
