# FINDINGS_TABLES — сводный реестр находок по классификации 239 таблиц

**Дата сведения:** 2026-08-08. **База замеров:** `bersoncarebot_test` (где явно сказано — `bcb_webapp_dev`).

**Что это.** Единый реестр находок из четырёх файлов классификации. Первоисточники остаются на месте и
остаются авторитетными по деталям:

- `evidence/14-classification-part-1.md` — 61 таблица (`app.*`, `drizzle.*`, `integrator.*`, `public.admin_audit_log`…`be_schedule_blocks`);
- `evidence/14-classification-part-2.md` — 61 таблица (`public.be_schedule_templates`…`media_playback_stats_hourly`);
- `evidence/14-classification-part-3.md` — 58 таблиц (`public.media_playback_user_video_first_resolve`…`reminder_occurrence_history`);
- `evidence/14-classification-part-4.md` — 59 таблиц (`public.reminder_rules`…`webapp_schema_migrations`).

**Чем этот документ НЕ является.** Это не переаудит: ни один вердикт частей не смягчён, не ужесточён и не
пересмотрен. Где две части по одному и тому же механизму дали разные вердикты — записаны ОБА и расхождение
помечено явно (§6, К1–К7). Каждое утверждение несёт указатель на часть-источник; числа взяты из частей, а не
измерены заново.

**Норма, против которой классифицировали (слова владельца, одинаково во всех четырёх частях):**
> «Все таблицы с любыми данными клиник/докторов и пациентов должны быть обязательно закрыты стенами и клиники
> и пациента, с правильным доступом глобал админа. Как и системные таблицы платформы должны нести стену своей роли.»

Классы данных: **P** — данные пациента · **C** — операционные данные клиники/врача · **S** — системные таблицы
платформы · **R** — глобальный справочник · **T** — техническое.

---

## 1. Сводка

### 1.1 Класс данных × количество таблиц

| Класс | Часть 1 | Часть 2 | Часть 3 | Часть 4 | **Всего** |
|---|---:|---:|---:|---:|---:|
| P — данные пациента | 33 | 20 | 33 | 24 | **110** |
| C — данные клиники/врача | 14 | 25 | 13 | 14 | **66** |
| S — системные таблицы платформы | 9 | 10 | 9 | 17 | **45** |
| R — глобальный справочник | 0 | 2 | 1 | 2 | **5** |
| T — техническое | 5 | 4 | 2 | 2 | **13** |
| **Всего таблиц** | **61** | **61** | **58** | **59** | **239** |

### 1.2 Вердикты

| Вердикт | Часть 1 | Часть 2 | Часть 3 | Часть 4 | **Всего** |
|---|---:|---:|---:|---:|---:|
| НАРУШЕНИЕ (табличных вердиктов, TEST) | 12 | 16 | 12 | 15 | **55** |
| НАРУШЕНИЕ только на `bcb_webapp_dev` | 0 | 0 | 1 | 0 | **1** |
| ВОПРОС (таблиц; без тех, что уже в нарушениях) | 2 | 11 | 9 | 2 | **24** |
| OK | 47 | 34 | 37 | 42 | **160** |

Сходится: 55 + 24 + 160 = 239 (таблица `reference_catalog_snapshot_receipts` из части 3 несёт и НАРУШЕНИЕ,
и ВОПРОС — посчитана один раз, как нарушение; `patient_specialist_links` на TEST — OK, на dev — нарушение).

**Вопросов сформулировано:** 7 (ч.1) + 9 (ч.2) + 9 (ч.3) + 5 (ч.4) = **30**; после слияния дублей —
**20 уникальных**, из них **4 требуют решения владельца** (§3.2), 16 решаются инженерно (§3.1).

### 1.3 Головные числа

| Число | Значение | Источник |
|---|---|---|
| Классифицировано таблиц | **239** | четыре части, 61+61+58+59 |
| Таблиц с колонкой `organization_id` на TEST | **172** | `evidence/13-f2-census.md` §2.3 (запрос приведён там же) |
| org-таблиц без RLS **или** без FORCE | **6 на TEST / 7 на dev** | `evidence/13-f2-census.md` §2.3; FACTS §1.3 отмечает дрейф от «пяти» |
| Таблиц, отдающих строки тенантной роли **без принципала** (RLS off + грант `app_staff`/`app_patient`) | **41** | сведено из четырёх частей: 12 (ч.1) + 12 (ч.2) + 8 (ч.3) + 9 (ч.4) |
| То же, но стена «есть» и не действует (`USING true` при включённом RLS) | **+1** (`operator_job_status`) | часть 3, Н8 |
| Из них **доказано живым исполнением** (`SET ROLE` + `count(*)`) | **9 таблиц** | часть 3, §НАРУШЕНИЯ и приложение-команды |
| Уникальных дефектов после слияния | **27** (Д1–Д27) | §2, сверка в §2.10 |

**Девять таблиц, доказанных исполнением** (часть 3; читались только счётчики, ни одной строки ПДн):
`platform_users` 278 строк под `bcb_test_nonstaff_login` и под `bcb_test_integrator_login` ·
`patient_bookings` 263 · `outgoing_delivery_queue` 812 · `product_analytics_hourly` 5421 ·
`operator_health_alert_sent` 56 · `phone_messenger_bind_secrets` 26 · `operator_job_status` 20 ·
`operator_incidents` 9 · `phone_challenges` 4. Остальные 33 выведены из каталога (RLS-флаги + `relacl`) —
часть 4 живой `SET ROLE` намеренно не выполняла (постановка принципала — это DML, запрещён брифом).

**⚠ Два числа из частей уже опровергнуты замером — не переносить их дальше.** `evidence/15` §16 показал, что
`pg_class.reltuples` в этой базе врёт на churn-таблицах: `integrator.idempotency_keys` — не 221 476 строк, а
**~225**, и ПДн там нет вовсе (см. исправление в Д14). По той же причине под подозрением 1 251 959 строк
`public.idempotency_keys` из части 2 (см. К8 и примечание к Д19). Правило для всех дальнейших работ по этому
реестру: **объём таблицы — только `count(*)`, никогда `reltuples`.**

**⚠ Часть находок по схеме `integrator` снимается не стеной, а сносом таблицы.** `evidence/15` вынес по 20
таблицам схемы: СНОСИТЬ 5, ПЕРЕНЕСТИ И СНЕСТИ 6, ОСТАВИТЬ 9. Из 9 табличных вердиктов находки Д14 стены
по-настоящему требует **одна** (`integrator.delivery_attempt_logs`); подробности и разнесение — в Д14 и §2.10.

**⚠ Охват.** FACTS §1.6 фиксирует 307 отношений в базе; четыре среза покрыли 239 таблиц
(`public`/`app`/`integrator`/`drizzle`, `relkind IN ('r','p')`). Разница не разобрана ни в одной из частей —
это пробел ПОКРЫТИЯ реестра, а не находка; в счёт 30 вопросов не входит и требует отдельного замера
перед тем, как объявлять классификацию полной.

---

## 2. Нарушения по степени опасности

Один нумерованный список, самое опасное — первым. Группировка по КЛАССУ дефекта, а не по таблице: один
дефект часто повторён на нескольких таблицах и в нескольких частях. Внутри каждой записи сохранены все
табличные строки с их доказательствами и указателем на часть-источник.

### Класс A — доступ к чужим учётным записям (пароли, OTP, токены, контакты входа)

#### Д1. Прямой табличный грант `app_staff` на таблицы аутентификации в обход definer-шва — 13 таблиц

**В чём дефект.** У всех тринадцати штатный путь доступа — SECURITY DEFINER-аксессоры `app.*` (владелец
`app_owner`). При этом на самой таблице висит прямой грант арендной роли `app_staff` (в большинстве — `arwd`),
а RLS выключен и политик нет. Терминал персонала ЛЮБОЙ клиники читает и перезаписывает секреты входа ВСЕХ
пользователей платформы. Это не утечка чтения — это захват учётной записи.

| Таблица | Что открыто | Доказательство | Часть |
|---|---|---|---|
| `user_password_credentials` | `password_hash`, `algo`, `failed_attempts`, `locked_until`; 26 строк | RLS off/off, 0 политик, `app_staff=arwd`; штатный путь — 12 definer `app.password_login_*`/`app.password_credentials_*_self`; сырой SQL ещё жив: `pgEmailSetupFlowPort.ts:63`, `pgEmailPasswordLookup.ts:88` | 4, Н-8 |
| `user_pins` | `pin_hash`, `attempts_failed`, `locked_until`; 2 строки | RLS off/off, `app_staff=arwd`; путь — `app.auth_user_pin_read/upsert/reset_attempts` + `_self` | 4, Н-8 |
| `user_email_setup_tokens` | `token_hash`, `email_normalized`, `expires_at`; 29 строк | RLS off/off, `app_staff=arwd`; путь — `app.auth_email_setup_read/insert/mark_used/revoke_active/delete` | 4, Н-8 |
| `user_oauth_bindings` | `provider`, `provider_user_id`, `email`; 14 строк | RLS off/off, `app_staff=arwd`; путь — `app.auth_oauth_find_user/upsert_binding/list_user_providers` | 4, Н-8 |
| `email_challenges` | почтовый адрес + **открытый OTP** в `pending_delivery_code` | RLS off/off, pol=0, org нет, `app_staff=arwd`; открытость кода доказана тестом `authEmailOtpDeliveryOwnership.postgres.integration.test.ts:210` (`expect(row.pending_delivery_code).toBe('222333')`); штатный путь — 15 definer `app.email_auth_*`/`app.email_otp_public_*` | 2, Н4 |
| `email_otp_locks` | `user_id`, `locked_until`, `lockout_cycle` | RLS off/off, `app_staff=arwd`; **собственный код репозитория противоречит гранту**: `pgEmailAuth.ts:282` — «no direct grant on `email_otp_locks`…» | 2, Н5 |
| `email_send_cooldowns` | `email_normalized` (ПДн), `last_sent_at` | RLS off/off, `app_staff=arwd`; шов — `app.email_auth_*_email_send_cooldown` | 2, Н6 |
| `login_tokens` | `token_hash`, `user_id`, `method`, `status` | RLS off/off, `app_staff=arwd`; шов — `app.auth_login_token_create/read/confirm/mark_session_issued/expire_past`, владелец `app_owner` (`0258_bootstrap_auth_table_accessors.sql:479-563`) | 2, Н7 |
| `channel_link_secrets` | `token_hash`, `channel_code`, `expires_at`, `used_at` | RLS off/off, `app_staff=arwd`; шов — `app.auth_channel_link_*` (`0258_…sql:140-221`) | 2, Н8 |
| `phone_challenges` | `phone` + **`code` — ОТП открытым текстом** | RLS off/off, pol=0; `SET ROLE app_staff` без принципала → **4 строки**; контракт кода нарушен явно: `pgPublicBookingOtp.ts:6-8` — «вызывающей роли нужен EXECUTE на функцию и НИЧЕГО на `public.phone_challenges`» | 3, Н2 |
| `phone_otp_locks` | `phone_normalized`, `locked_until`, `lockout_cycle` | RLS off/off, pol=0, `app_staff` — полный CRUD → тенантная роль может **снять антиперебор любому телефону**; тот же нарушенный контракт `pgPublicBookingOtp.ts:6-8` | 3, Н3 |
| `phone_messenger_bind_secrets` | `token_hash`, `phone_normalized`, `user_id`, `status` | RLS off/off, pol=0; `SET ROLE app_staff` → **26 строк** | 3, Н4 |
| `auth_rate_limit_events` | счётчик попыток входа/отправки кода (`scope`, `key` = IP либо userId) | RLS off/off, pol=0; ACL `app_staff=arwd`, `app_owner=ard`; код ходит ТОЛЬКО через definer `app.auth_rate_limit_prune_scope/prune_key` (`pgAuthRateLimitEvents.ts:47,59`) — табличный грант арендной роли лишний | 1, №3 |

**Что требуется.** Отозвать табличные гранты у всех арендных ролей, оставить только EXECUTE на definer-аксессоры;
объявить этот класс в декларации (`scope=NONE, mechanism=definer`) и решить вопрос И1 — нужен ли поверх этого
RLS+FORCE как backstop. Правильная форма в базе уже есть: `staff_security_profiles` и три `user_passkey_*` лежат
в том же шве и **не имеют ни одного гранта рантайм-ролям** (часть 4, класс S).

#### Д2. `user_contacts` — стена клиники есть на чтение и отсутствует на записи

- **Дефект.** `user_contacts_staff_update` и `user_contacts_staff_delete` (`TO app_staff`) имеют предикат ровно
  `app.is_staff()` — без `organization_id`, без `org_enrollments`. `user_contacts_staff_insert` — `WITH CHECK (app.is_staff())`.
  Соседняя `user_contacts_staff_org_select` при этом полностью org-скоуплена. Политики PERMISSIVE → объединяются по OR.
- **Доказательство.** `apps/webapp/db/drizzle-migrations/0379_user_contacts_d15b6_local.sql:155-172`; в таблице
  444 строки телефонов/почт.
- **Почему это класс A, а не просто утечка.** Таблица — точка входа по почте
  (`app.find_platform_user_ids_by_any_confirmed_email`, там же строка 178): подмена `value_normalized` =
  перенаправление входа на чужой аккаунт. Сотрудник любой клиники может изменить или удалить контакт любого из
  444 человек, включая пациентов и владельцев чужих клиник.
- **Часть-источник:** 4, Н-1.
- **Требуется.** Тот же org-предикат, что уже написан в `_staff_org_select`, поставить в `USING`/`WITH CHECK`
  политик update/delete/insert. (Вторая дыра той же таблицы — Д5.)

### Класс B — доступ к ключам и секретам платформы

#### Д3. `system_settings` и `system_settings_audit` — секреты платформы открыты любой клинике

- **Дефект.** Политика `saas_bootstrap_hybrid_p0_8_6`, `FOR ALL TO public`:
  `USING (organization_id IS NULL OR (app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id()))`.
  Первая ветка не проверяет ни роль, ни принципал. Грант `app_staff=arwd` — то есть чтение, изменение и удаление.
- **Доказательство (замер по живой базе, читалась только колонка `key`).** `system_settings`: `org_null = 121`,
  `org_set = 4`, точный total = 125. Ключи с `organization_id IS NULL` и секретным именем (17):
  `apple_oauth_private_key`, `auth_altcha_hmac_secret`, `google_client_secret`, `google_refresh_token`,
  `integrator_webapp_entry_secret`, `integrator_webhook_secret`, `max_api_key`, `max_bot_api_key`,
  `max_webhook_secret`, `rubitime_api_key`, `rubitime_webhook_token`, `smsc_api_key`, `telegram_bot_token`,
  `vk_id_client_secret`, `yandex_oauth_client_secret`, `apple_oauth_key_id`, `auth_passkey_enabled`.
  `system_settings_audit` (52 строки) — та же безусловная ветка, `app_staff=arwd`, а значения секретов лежат в
  `old_value_json`/`new_value_json`: `src/app/api/admin/settings/route.ts:230` прямо фиксирует, что независимый
  аудит 28.07 нашёл там `vk_id_client_secret` в открытом виде.
- **Часть-источник:** 4, Н-7.
- **Требуется.** Стена своей (платформенной) роли: глобальные строки (`organization_id IS NULL`) не должны быть
  доступны арендной роли ни на чтение, ни на запись; безусловную ветку заменить проверкой роли.

### Класс C — эскалация роли

#### Д4. `app_staff` может встать глобальной ролью — стена клиники на всём биллинге обходится одним `SET ROLE`

- **Дефект.** Наследования привилегий нет, но переход разрешён:
  ```
  pg_has_role('app_staff','app_platform_settings','MEMBER') = true
  pg_has_role('app_staff','app_platform_settings','USAGE')  = false
  pg_auth_members: app_platform_settings <- app_staff, inherit_option = false
  ```
  То же для `app_clinic_billing`. После `SET ROLE app_platform_settings` действуют политики
  `*_platform_select/insert/update` с `USING/WITH CHECK = true`.
- **Радиус.** 14 таблиц: `saas_billing_accounts`, `saas_billing_invoices`, `saas_billing_subscriptions`,
  `saas_billing_provider_events`, `saas_billing_refunds`, `saas_org_entitlement_overrides`,
  `saas_organization_trials`, `saas_tariffs`, `saas_trial_policy`, `saas_registration_tariff_policy`,
  `saas_paid_period_policy`, `saas_billing_periods`, `system_settings`, `system_settings_audit`.
- **Часть-источник:** 4, Н-9. Собственного табличного вердикта не имеет — это сквозной дефект границы областей.
- **Что это значит для остальных находок.** Пока переход возможен, ЛЮБАЯ org-политика на перечисленных таблицах —
  рекомендация, а не стена. Формально это не «утечка» FACTS §1.2 (там мерили саму глобальную роль), а отсутствие
  границы между областями ORG и GLOBAL.
- **Требуется.** Убрать членство `app_staff → app_platform_settings`/`app_clinic_billing` либо объявить и закрыть
  переход; решение о том, куда переносится глобальный путь, — вопрос владельца О1.

### Класс D — пробитая стена ПДн (политики без org/own-фильтра, выданные PUBLIC или логин-ролям)

#### Д5. `app_identity_bootstrap` — политики проверяют «кто ты», и ничего про строку: `platform_users`, `user_contacts`, `user_identity`

- **Дефект.** Предикат политик — только `pg_has_role(CURRENT_USER,'app_identity_bootstrap','member')`, без
  какого-либо org/own-фильтра. `pg_has_role(…,'member')` истинно независимо от `NOINHERIT`.
  - `platform_users` — три политики `platform_users_identity_bootstrap_{select,insert,update}`, `polroles = PUBLIC`;
  - `user_contacts` — четыре политики, грант `app_identity_bootstrap=arwd`;
  - `user_identity` — три политики, грант `app_identity_bootstrap=arw`.
  Членами роли являются логин-роли `bcb_test_nonstaff_login`, `bcb_test_integrator_login`,
  `bcb_dev_runtime_nonstaff_login`, `bcb_webapp_dev_user`; у первых двух есть и табличный SELECT на `platform_users`.
- **Доказательство исполнением (часть 3):**
  ```
  SET ROLE bcb_test_nonstaff_login;   SELECT count(*) FROM public.platform_users;  -- 278
  SET ROLE bcb_test_integrator_login; SELECT count(*) FROM public.platform_users;  -- 278
  SET ROLE app_patient;               SELECT count(*) FROM public.platform_users;  -- 0
  ```
  Часть 4: после `SET ROLE app_identity_bootstrap` пациентский (nonstaff) логин и логин интегратора получают
  сплошное чтение и запись **всех 444 контактов и всех 237 ФИО/дат рождения по всем клиникам**.
- **Части-источники:** 3, Н1 (`platform_users`) + 4, Н-2 (`user_contacts`, `user_identity`) — один и тот же дефект,
  слит.
- **Две поправки к прежним документам, зафиксированные самими частями.** (1) FACTS §1.4 «`app_patient` под
  `SET ROLE` видит 0» — верно и **вводит в заблуждение**: дыра не в терминальной роли, а в ЛОГИН-ролях, которых
  замер §1.4 не касался (часть 3). (2) `evidence/13-f2-census.md` §4 присвоил `app_identity_bootstrap` область
  `OWN` со знаком «?ВОПРОС» — по факту область **GLOBAL** (часть 4).
- **Требуется.** Форма bootstrap-пути — вопрос И15; в любом варианте предикат обязан фильтровать строку, а не роль.

#### Д6. `user_identity` — INSERT без стены клиники

- **Дефект.** `user_identity_staff_insert`: `WITH CHECK (app.is_staff())`. DELETE/UPDATE/SELECT у той же роли
  org-скоуплены, INSERT — нет. Сотрудник любой клиники может завести строку идентичности на произвольный
  `platform_user_id`.
- **Часть-источник:** 4, Н-3. (Табличный вердикт `user_identity` учтён в Д5 — здесь второй дефект той же таблицы.)
- **Требуется.** org-предикат в `WITH CHECK`, как у соседних команд.

#### Д7. `platform_user_contacts` — нет стены пациента, и первый дизъюнкт не требует персонала

- **Дефект.** Единственная политика `saas_bootstrap_hybrid_p0_8_6` целиком:
  ```
  ((app.current_org_id() IS NOT NULL AND organization_id = app.current_org_id())
   OR (organization_id IS NULL AND app.current_org_id() IS NULL
       AND app.current_patient_user_id() IS NULL AND app.current_integrator_user_id() IS NULL
       AND NOT app.is_staff()))
  ```
  Ветки `current_patient_user_id()` нет вообще, а `app_patient` держит SELECT. Первый дизъюнкт НЕ требует
  `app.is_staff()`, а пациентский принципал по построению может нести организацию
  (`packages/db-principal/src/index.ts:543-546`: «A patient identity may … carry the application-selected organization»).
- **Следствие.** Пациент, открывший экран конкретной клиники, читает телефоны и почты ВСЕХ людей этой клиники.
  Второй дизъюнкт отдельно открывает все строки с `organization_id IS NULL` сессии вообще без принципала
  (сейчас таких строк 0 — дыра дремлет, не закрыта).
- **Часть-источник:** 3, Н11.
- **Требуется.** Пациентская ветка по `platform_user_id = app.current_patient_user_id()`; первый дизъюнкт —
  под `app.is_staff()`.

#### Д8. `user_phone_history` — нет стены пациента + табличный грант выдан логин-роли напрямую

- **Дефект.** Единственная политика `saas_bootstrap_hybrid_p0_8_6` = только org-ветка (плюс тот же хвост
  «без принципала»); ветки «свой пациент» нет, а грант `app_patient=r` есть. Пациент с принципалом своей
  организации видит историю телефонов **всех 92 записей этой организации**, а не свою.
- **Второй слой.** `bcb_test_nonstaff_login=arw` — табличный грант выдан ЛОГИН-роли напрямую, минуя рантайм-роль;
  это ломает модель «грант живёт на рантайм-роли» (см. вопрос И2).
- **Часть-источник:** 4, Н-4. Норма — FACTS §1.5, `evidence/13-f2-census.md` §4 (`app_patient` = OWN).
- **Требуется.** Пациентская ветка в предикате; грант перенести на рантайм-роль.

#### Д9. `media_files` — в пациентской ветке нет стены клиники

- **Дефект.** `saas_org_dormant_p0_8_3`, пациентская ветка:
  ```
  OR ((app.current_patient_user_id() IS NOT NULL)
      AND ((usage_purpose IS DISTINCT FROM 'program_item_submission') OR (uploaded_by = app.current_patient_user_id())))
  ```
  Проверки `organization_id` в ней нет вообще; `app_patient=r`.
- **Следствие.** Пациент клиники A читает метаданные и `s3_key` любого файла клиники B (кроме чужих присланных заданий).
- **Часть-источник:** 2, Н3. *(Ветки `pg_has_role(… 'app_worker' …)` и `… 'app_operational_media_worker' …`
  глобальны намеренно — инфра-роли области NONE; часть 2 их не трогала.)*
- **Требуется.** `organization_id = app.current_org_id()` в пациентской ветке.

### Класс E — стена есть, но предикат содержит безусловную ветку

#### Д10. `comments` — клиническая стена отключена для пяти типов целей

- **Дефект.** В `saas_org_dormant_p0_8_4` (`pg_policies.qual`) дизъюнкт **без единого условия**:
  ```
  OR (target_type = ANY (ARRAY['exercise','test','test_set','recommendation','lesson']))
  ```
  Не проверяет ни `app.is_staff()`, ни `app.current_org_id()`, ни `app.current_patient_user_id()`; стоит
  одинаково в `USING` и в `WITH CHECK`. Гранты `app_staff=arwd`, `app_patient=r`.
- **Следствие.** Сотрудник клиники A читает, правит и удаляет комментарии клиники B ко всем
  упражнениям/тестам/рекомендациям/урокам; пациент читает чужие.
- **Часть-источник:** 2, Н1. **Требуется:** снять безусловный дизъюнкт либо обусловить его org/own-проверкой.

#### Д11. `media_folders` — клиническая стена отключена для всех непациентских папок

- **Дефект.** `saas_org_dormant_p0_8_3`, дизъюнкт без условий: `OR ((patient_user_id IS NULL) OR (…))`. Любая
  строка с `patient_user_id IS NULL` — а это вся библиотека клиники (`kind='standard'`, `kind='client_files_root'`,
  `pgClientMediaFolders.ts:56`) — проходит `USING` и `WITH CHECK` для любой сессии с грантом.
- **Следствие.** Staff клиники A видит и может изменить/удалить дерево папок клиники B.
- **Часть-источник:** 2, Н2. **Требуется:** org-предикат на непациентских папках.

#### Д12. `operator_job_status` — «default_deny» по имени, `USING true` по факту

- **Дефект.** RLS+FORCE включены (проверка «rls=t» её пропускает), но политика
  `saas_enforce_default_deny_p0_9_1` выдана `PUBLIC` с `USING = true` и `CHECK = true`. Две другие политики
  (`c4_web_push_reminder_status`, `…_restrictive`) сужают только `app_operational_web_push_reminder`.
- **Доказательство.** `SET ROLE app_staff` → **20 строк**; у неё же INSERT/UPDATE/DELETE на состояние
  планировщика платформы. Эта же таблица — корень 61 050 отказов FACTS §1.1.
- **Часть-источник:** 3, Н8. **Требуется:** реальный предикат стены платформенной роли вместо `USING true`.

#### Д13. `saas_billing_refunds` — у клиники нет своей стены, потому что у клиники нет доступа вовсе

- **Дефект.** Три политики, все `TO app_platform_settings`, `USING/WITH CHECK = true`. Ни `app_clinic_billing`,
  ни `app_staff` не имеют ни политики, ни гранта — в отличие от `saas_billing_invoices`/`saas_billing_subscriptions`,
  где для этих ролей есть `*_clinic_billing_*` и `*_staff_capture_*` с org-предикатом. То есть «стена клиники»
  на возвратах не существует как объект, а единственный путь — глобальная роль без org-фильтра, достижимая
  из тенантного рантайма (Д4).
- **Доказательство.** 0 строк, но `api/payments/saas-webhook/[provider]/route.ts` в неё пишет.
- **Часть-источник:** 4, Н-6. **Требуется:** пара политик по образцу invoices/subscriptions, либо объявленное
  решение «возвраты — только платформа» вместе с закрытием Д4.

### Класс F — стены нет вовсе (RLS off) при наличии гранта тенантной роли

#### Д14. Схема `integrator` вне волны стен — 9 таблиц

**В чём дефект.** Стена клиники в `integrator` включена ровно там, где в 2026-07 добавляли `organization_id`
(миграции `20260707_0001_p0_4_i0…`, `20260708_000{2,3}…`); всё, что эта волна не тронула, осталось голым:
`relrowsecurity=f`, политик 0, ACL `app_staff=arwd`.

| Таблица | Что открыто (как записано в части 1) | Доказательство | Часть | **Судьба по `evidence/15`** |
|---|---|---|---|---|
| `integrator.identities` | связка «человек ↔ внешний аккаунт»: `user_id`, `resource`, `external_id` | RLS off/off, org нет, pol=0; `app_staff=arwd`, `bcb_test_integrator_login r`; R/W `channelUsers.ts:278`, `resolveDirectPublicActor.ts` | 1, №4 | **ПЕРЕНЕСТИ И СНЕСТИ** — 131 из 134 уже в `public.user_channel_bindings` (98 %); работа D25 |
| `integrator.users` | реестр пользователей интегратора, `merged_into_user_id` | RLS off/off, pol=0, `app_staff=arwd` | 1, №5 | **ПЕРЕНЕСТИ И СНЕСТИ** — зеркало `public.platform_users.integrator_user_id`/`.merged_into_id`; работа D25 |
| `integrator.telegram_state` | **ПДн**: `username`, `first_name`, `last_name`, состояние диалога, `notify_*` | RLS off/off, pol=0, `app_staff=arwd` | 1, №6 | **ОСТАВИТЬ, урезав 7 колонок** — после удаления `username`/`first_name`/`last_name` и четырёх `notify_*`+`is_active` таблица перестаёт быть носителем ПДн, и вопрос о стене снимается сам |
| `integrator.telegram_users` | **телефон** + имена; таблица объявлена мёртвой | RLS off/off, pol=0, 2 строки, `app_staff=arwd`; `apps/integrator/src/infra/db/schema.md:41` — «legacy/deprecated storage, активный runtime в неё не пишет» | 1, №7 | **СНОСИТЬ** — единственная таблица, где обе оценки сошлись |
| `integrator.delivery_attempt_logs` | `payload_json` = тело отправленного сообщения | RLS off/off, pol=0, 6 223 строки (по `evidence/15` — 6 324, свежесть 2026-08-05); редактируется ТОЛЬКО OTP — `dispatchPort.ts:85-93` (`sanitizePayloadForLogs`), `messageLogs.ts:83` | 1, №8 | **ОСТАВИТЬ — 🔴 ЕДИНСТВЕННАЯ, где стена реально нужна** (`evidence/15` §14) |
| `integrator.message_retry_jobs` | **`phone_normalized` + `message_text`** в открытом виде | RLS off/off, pol=0, `app_staff=arwd`, `app_operational_delivery_worker rw` | 1, №9 | **СНОСИТЬ после 2026-08-29** — заменена `public.outgoing_delivery_queue`, производитель вырезан, остались 10 `pending`; пункт плана D30 Ш7 |
| `integrator.projection_outbox` | `payload` с событиями по конкретным пациентам/записям | RLS off/off, pol=0, 3 768 строк, `app_staff=arwd` | 1, №10 | **ОСТАВИТЬ** — стена по роли осмысленна, но ставить её логично ПОСЛЕ переезда поддержки, когда ясен остаточный состав событий |
| `integrator.idempotency_keys` | ~~`response_body` — полные тела ответов API, в т.ч. по бронированиям; 221 476 строк~~ **ИСПРАВЛЕНО, см. ниже** | ~~`pgStore.ts:65` пишет тело целиком~~ — атрибуция писателя неверна | 1, №11 | **ОСТАВИТЬ** — ПДн нет; класс стены понижается до «стена роли», приоритет низкий |
| `integrator.integration_data_quality_incidents` | `raw_value` — исходное значение поля пациента/филиала | RLS off/off, pol=0, 3 строки, `app_staff=arwd`, `organization_id` нет | 1, №12 | **ОСТАВИТЬ** — стена клиники осмысленна, но при 3 строках приоритет низкий |

**🔴 ИСПРАВЛЕНО (`integrator.idempotency_keys`) — опровергнуто замером, `evidence/15` §16 и §«Три вещи».**
Часть 1 (`14-classification-part-1.md:108,152`) записала: «221 476 строк», «`response_body` хранит тела ответов
API (в т.ч. по бронированиям)», писатель — `apps/webapp/src/infra/idempotency/pgStore.ts:65`. Ни одно из трёх
утверждений не подтвердилось:

- **строк ~225**, замерено трижды подряд (225/225/225, из них 45-46 просроченных). 221 476 — протухшая оценка
  `pg_class.reltuples`: `n_tup_ins = 235 038`, `n_tup_del = 234 811` за жизнь таблицы, TTL 900 с — таблица
  перемалывает поток вебхуков и остаётся крошечной;
- **ПДн нет вообще:** 261 строка из 261 несёт `request_hash = '__integrator_incoming_event__'` и
  `response_body = '{}'`; строк с непустым телом — **ноль**. Это sentinel-значения под `NOT NULL`
  (`repos/idempotencyKeys.ts:13-15`);
- **писатель другой:** `pgStore.ts` пишет неквалифицированное имя → `public.idempotency_keys`, это **другая
  таблица** (Д19).

Оригинальное утверждение оставлено видимым (зачёркнутым), чтобы находка не «исчезла» из истории.
**Новое требование по этой таблице:** стена РОЛИ (у арендной роли `app_staff` не должно быть табличного гранта
на очередь дедупа вебхуков), приоритет — низкий. Стены клиники/пациента не требуется: данных людей нет.
Отдельно `evidence/15` §16 отмечает: планового сборщика просроченных ключей в коде нет, но таблица не растёт.

**🔴 СНЯТИЕ СКОУПА — 5 из 9 таблиц этой находки стеной не закрываются, а сносятся.** `evidence/15` разобрал все
20 таблиц схемы `integrator` и вынес: **СНОСИТЬ — 5**, **ПЕРЕНЕСТИ И СНЕСТИ — 6**, **ОСТАВИТЬ — 9**. Главный
факт разбора: **переносить нечего, данные уже целиком лежат в вебаппе** (поштучный замер на TEST):
`conversations` 21/21 · `conversation_messages` 34/34 · `user_questions` 16/16 · `question_messages` 20/20 ·
`user_reminder_rules` 27/27 · `contacts` 78/78 · `identities` 131/134 (98 %). Обносить их стенами означало бы
охранять копию.

Итог по девяти таблицам Д14: **4 уходят вместе с таблицей** (`telegram_users`, `message_retry_jobs` — СНОСИТЬ;
`identities`, `users` — ПЕРЕНЕСТИ И СНЕСТИ) · **1 снимается урезанием колонок** (`telegram_state` — после
удаления 7 колонок ПДн в ней не остаётся) · **1 требует стены по-настоящему** (`delivery_attempt_logs`) ·
**3 остаются с пониженным приоритетом** (`projection_outbox` — после переезда поддержки;
`idempotency_keys` — стена роли, ПДн нет; `integration_data_quality_incidents` — 3 строки).

**Требуется (переформулировано с учётом `evidence/15`).** Развилка И16 (арендная модель против операционной
роли) сохраняется, но применяется уже НЕ к девяти таблицам, а к четырём остающимся; для пяти остальных
правильное действие — не стена, а снос/урезание по волнам `evidence/15` §«ЧТО СНОСИТЬ И В КАКОМ ПОРЯДКЕ».
Порядок важен: `telegram_state` держит FK на `integrator.identities` — дропать `identities` раньше нельзя;
`message_retry_jobs` сносится не раньше 2026-08-29 17:00 MSK (10 строк `pending`).

#### Д15. `public.appointment_records` — легаси-проекция записей на приём без обеих стен

- **Дефект.** `organization_id` есть, RLS/FORCE выключены, политик 0; ACL `app_staff=arwd`. Внутри —
  `phone_normalized`, `record_at`, `status`, `payload_json`, `platform_user_id`.
- **Доказательство.** Срез + `pg_class.relrowsecurity=f`; совпадает с FACTS §1.3 и `13-f2-census.md` §2.3.
  Читатели живы: `pgAppointmentProjection.ts:171` (W), `adminStats.ts:26` (R), `platformUserFullPurge.ts:144`.
- **Часть-источник:** 1, №1. **Требуется:** RLS+FORCE + обе стены (клиника + пациент).

#### Д16. `public.be_organization_members` — живая межарендная утечка

- **Дефект.** `organization_id` в таблице есть, RLS выключен, политик 0; ACL `app_staff=arwd`,
  `app_platform_settings r`, `bcb_test_nonstaff_login r`, `bcb_test_integrator_login r`.
- **Доказательство.** FACTS §1.2: `app_staff` читает строку о владельце чужой организации
  (`{"organization_id":"da6a96cb-…","role":"owner","status":"active"}`); после дрейфа 08.08 это **2 из 2**
  оставшихся живых ячеек утечки (`evidence/13-f2-census.md` §2.4).
- **Почему это опаснее, чем выглядит.** На этой таблице стоит определение «кто врач/админ клиники» — то есть
  авторизация кабинета.
- **Часть-источник:** 1, №2. **Требуется:** RLS+FORCE + стена клиники + объявленный путь глобал-админа (О1).

#### Д17. `public.patient_bookings` — 263 строки контактов без обеих стен

- **Дефект.** RLS off/off, pol=0 при наличии `organization_id`. `SET ROLE app_staff` без принципала → **263 строки**
  с `contact_phone`, `contact_email`, `contact_name`.
- **Усугубление.** 219 из 263 строк несут `organization_id IS NULL` — одним `ENABLE ROW LEVEL SECURITY` дефект не
  закрыть, стена отрежет 83 % данных (см. Д27).
- **Часть-источник:** 3, Н5; известен как FACTS §1.3.

#### Д18. `public.outgoing_delivery_queue` — 812 строк с текстами сообщений людям

- **Дефект.** RLS off/off, pol=0. `SET ROLE app_staff` → **812 строк** с `payload_json` (тела сообщений пациентам).
  Нет ни стены клиники, ни стены роли.
- **Усугубление.** **812 из 812** строк имеют `organization_id IS NULL` — колонка есть, не пишется никогда (Д27).
- **Часть-источник:** 3, Н6; известен как FACTS §1.3.

#### Д19. Платформенные операторские и межсервисные таблицы без стены своей роли — 6 таблиц

| Таблица | Что открыто | Доказательство | Часть |
|---|---|---|---|
| `public.idempotency_keys` | `response_body` — тела ответов по обращениям пациентов и привязке телефонов; **1 251 959 строк** | RLS off/off, pol=0, org нет; `app_staff=arwd`; пишется на `/api/integrator/support/question`, `…/support/admin-reply:73`, `…/messenger-phone/bind:93`, `…/program-note/reply-begin:62,73`, `…/reminders/dispatch:79` | 2, Н9 |
| `public.integrator_push_outbox` | `payload` межсервисных событий | RLS off/off, pol=0; `app_staff=arwd`, `app_owner=arw` | 2, Н10 |
| `public.integration_webhook_error_events` | `source`, `error_class`, `occurred_at` | RLS off/off, pol=0; `app_staff=arwd` — арендная роль может писать и **удалять** записи об ошибках интеграций платформы | 2, Н11 |
| `public.integration_webhook_last_status` | `received_at`, `processed_ok`, `http_status_returned`, `detail` | RLS off/off, pol=0; `app_staff=arwd`, `saas_system_health_owner=r` | 2, Н12 |
| `public.operator_incidents` | реестр инцидентов интеграций, включая `alert_claim_token` | RLS off/off, pol=0; `SET ROLE app_staff` → **9 строк**, полный CRUD у тенантной роли | 3, Н9 |
| `public.operator_health_alert_sent` | `dedup_key`, `severity`, `sent_at` | RLS off/off, pol=0; `SET ROLE app_staff` → **56 строк**, полный CRUD | 3, Н10 |

**Требуется.** Стена своей (операторской/платформенной) роли; арендной роли на этих таблицах не место вовсе.

**⚠ Число строк `public.idempotency_keys` под вопросом — противоречие источников (К8).** Часть 2 (Н9) пишет
**1 251 959 строк** и «в `response_body` оседают ответы по обращениям пациентов и по привязке телефонов».
`evidence/15` §16 п.2, разбирая соседнюю таблицу, замерил её и пишет: «`public.idempotency_keys` — ОТДЕЛЬНАЯ
таблица (существует, **0 строк на TEST**)». Оба утверждения записаны, ни одно не отменено. Поводов
перепроверить именно часть 2 два: (1) ровно на такой же оценке `reltuples` уже подорвалась находка по
`integrator.idempotency_keys` (см. Д14); (2) 1 251 959 — характерная величина накопленной оценки планировщика.
**Требуется точный `SELECT count(*)` и проверка `response_body <> '{}'` перед тем, как ставить эту таблицу
в план работ по приоритету «самая большая таблица среза».** Сам дефект стены (RLS off + `app_staff=arwd`)
от числа строк не зависит и остаётся.

Про `public.idempotency_keys` и `integrator.idempotency_keys` (Д14) — это ДВЕ разные таблицы в разных схемах,
обе без стен; писатель `apps/webapp/src/infra/idempotency/pgStore.ts` пишет неквалифицированное имя, то есть
в `public` (`evidence/15` §16).

#### Д20. Пять таблиц пациентских уведомлений и каналов — RLS выключен, стен нет ни одной

| Таблица | Строк | RLS | Политики | Опасный грант | Часть |
|---|---:|---|---|---|---|
| `user_channel_bindings` | 131 | off/off | 0 | `app_patient=r`, `app_staff=arwd`, `bcb_test_nonstaff_login=r` | 4, Н-5 |
| `user_channel_preferences` | 122 | off/off | 1 — **инертна** | `app_patient=r` + колоночные `aw`, `app_staff=arwd` | 4, Н-5 |
| `user_notification_topics` | 349 | off/off | 0 | `app_patient=arw`, `app_staff=arwd` | 4, Н-5 |
| `user_notification_topic_channels` | 290 | off/off | 1 — **инертна** | `app_patient=arw`, `app_staff=arwd` | 4, Н-5 |
| `user_web_push_subscriptions` | 34 | off/off | 1 — **инертна** | `app_patient=arwd` (**в т.ч. DELETE**), `app_staff=arwd` | 4, Н-5 |

- **Следствие.** Любой пациент читает `external_id` мессенджеров всех 131 привязки платформы (в
  `user_channel_bindings` это прямой идентификатор человека в Telegram/MAX), правит чужие подписки на уведомления
  и **удаляет чужие push-подписки**. Сотрудник любой клиники — то же по всем клиникам. Ни у одной нет
  `organization_id`.
- **«Инертна»** = политика `c4_web_push_reminder_user` в каталоге есть, но `relrowsecurity=false` → PostgreSQL её
  не применяет. Это опаснее отсутствия политики: перепись по `pol=N` показывает «стена есть», а её нет (см. класс G).
- **Связь с FACTS §11.6:** одна из двух живых находок ACCESS_SWEEP от 04.08 — «500 на входе по телефону через
  `user_channel_preferences`» — приходится на эту же таблицу.

#### Д21. Межарендные справочники и агрегат, доступные арендной роли на ЗАПИСЬ — 3 таблицы

| Таблица | Дефект | Доказательство | Часть |
|---|---|---|---|
| `booking_cities` | общий на всю платформу список городов; клиника A может переименовать/деактивировать/удалить город, который видит клиника B | RLS off/off, pol=0, org нет; **`app_staff=arwd`**, `app_owner=r`; 2 строки | 2, Н14 |
| `clinical_test_measure_kinds` | арендная роль имеет INSERT в пул, который сам код называет глобальным | RLS off/off, pol=0; **`app_staff=ar`**; `src/modules/tests/measureKindCode.ts:1` — «глобальный пул measure_kinds»; `src/app/api/api.md:100` даёт врачу `POST`/`PATCH` | 2, Н15 |
| `media_playback_stats_hourly` | строка `bucket_hour × delivery` суммирует воспроизведения ВСЕХ клиник, арендная роль пишет и читает | RLS off/off, pol=0; `app_staff=arwd`; 529 строк | 2, Н16 |

**Требуется.** Запрет записи для арендной роли (чтение справочника — законно); для агрегата — стена платформенной
роли, у `app_staff` не должно быть ни записи, ни чтения. Судьба `booking_cities` отдельно — §4 и О4.

#### Д22. `booking_calendar_map` — структурно нечем закрыть

- **Дефект.** RLS off/off, pol=0, **колонки `organization_id` нет**. Данные — `appointment_key ↔ gcal_event_id`,
  то есть связь конкретной записи пациента с событием календаря; читает/пишет интегратор
  (`apps/integrator/src/infra/db/repos/bookingCalendarMap.ts:13-26`).
- **Особенность.** Прикладных грантов в `relacl` нет (только владелец базы) — сейчас закрыто **фактом отсутствия
  гранта, а не объявленной стеной**; любой будущий GRANT откроет таблицу целиком.
- **Часть-источник:** 2, Н13. **Требуется:** добавить `organization_id` (без него стену наложить нельзя) либо
  объявить класс «закрыто нулевым грантом» (вопрос И1).

### Класс G — политика существует, но RLS выключен (стена «на бумаге»)

#### Д23. `product_analytics_hourly` — политика написана и молча не работает

- **Дефект.** `relrowsecurity=false` при `pol=1` (`c4_web_push_reminder_org`). Проверка «политика есть» проходит,
  стены нет.
- **Доказательство.** `SET ROLE app_staff` → **5421 строка**; 5300 из 5421 — `organization_id IS NULL`.
- **Часть-источник:** 3, Н7; известен как FACTS §1.3. Часть 3 называет это «худшим видом зелёного состояния».
- **Требуется.** `ENABLE ROW LEVEL SECURITY` + FORCE; но сперва решить Д27 (иначе стена отрежет 98 % строк).

#### Д24. `patient_specialist_links` — RLS без FORCE (только `bcb_webapp_dev`)

- **Дефект.** На dev `relrowsecurity=t, relforcerowsecurity=f` → владелец таблицы обходит политику. На TEST — `t/t`,
  чисто.
- **Доказательство.** `evidence/13-f2-census.md` §2.3 (dev-таблица приведена в списке дефектных).
- **Часть-источник:** 3, Н13 (единственный дефект, живущий только на dev).
- **Требуется.** FORCE на dev; и вывод, зафиксированный частью 3: **управляемые базы расходятся по набору
  дефектов — декларация обязана иметь per-базовый раздел** (совпадает с SCHEME §A и FACTS §1.3).

**Перекрёстная ссылка:** три из пяти таблиц Д20 (`user_channel_preferences`, `user_notification_topic_channels`,
`user_web_push_subscriptions`) несут ровно этот же дефект — политика в каталоге есть, RLS выключен. Отдельной
записью не считаются, чтобы не задваивать находку части 4.

### Класс H — стена стоит на незакрытом фундаменте

#### Д25. Пациентские стены `integrator.*` опираются на незакрытую `integrator.identities`

- **Дефект.** Пациентские ветки политик `integrator.conversations`, `integrator.conversation_messages`,
  `integrator.message_drafts`, `integrator.user_questions`, `integrator.question_messages` построены на
  `EXISTS (… FROM integrator.identities … user_id = app.current_integrator_user_id())`. Сама `identities` —
  RLS off, политик 0, `app_staff=arwd` (Д14).
- **Почему это отдельная находка.** Все пять таблиц получили вердикт **OK** в части 1 — их стены выглядят
  корректными, но опираются на таблицу, у которой стены нет. Табличного вердикта эта запись не потребляет.
- **Часть-источник:** 1, №4 (раздел «усугубляет») и строки таблицы класса P.
- **🔴 Снятие скоупа (`evidence/15`).** Чинить этот фундамент стенами не нужно: `identities` — **ПЕРЕНЕСТИ И
  СНЕСТИ** (131 из 134 строк уже в `public.user_channel_bindings`), а четыре из пяти зависимых таблиц —
  `conversations` (21/21), `conversation_messages` (34/34), `user_questions` (16/16), `question_messages`
  (20/20) — тоже **ПЕРЕНЕСТИ И СНЕСТИ**: всё уже зеркалировано в `public.support_*`. Пятая,
  `message_drafts`, — **ОСТАВИТЬ** (транзитное состояние канала, аналога в `public` нет), и её пациентская
  ветка после сноса `identities` должна быть перевешена на `public.user_channel_bindings`.
- **Требуется.** Не «закрыть `identities` стеной», а провести волну 3 `evidence/15` (D25) в правильном
  порядке: `telegram_state` держит FK на `identities`, поэтому `identities` дропается не раньше урезания
  `telegram_state`. До этого момента стены пяти таблиц остаются недействующими — это надо знать при
  любом отчёте «стены поддержки стоят».

#### Д26. `reference_catalog_snapshot_receipts` — org-таблица без RLS+FORCE, читаемая политиками других таблиц

- **Дефект.** `relrowsecurity=false`, pol=0 при `organization_id NOT NULL`. Фактической достижимости из тенантных
  ролей нет (`SET ROLE app_staff` → `permission denied`; грант только `app_owner`), но правило владельца и §A.9
  требуют RLS на org-таблице.
- **Почему это не механическая правка.** Расписку читают ПОЛИТИКИ других таблиц (`reference_catalog_seed_owner`
  на `reference_categories`/`reference_items`) через `EXISTS` — включение RLS здесь изменит поведение засева.
- **Доказательство.** Уже помечено как GAP G7 в `deploy/postgres/privileges/declaration.ts:50-52,797`;
  новый дефект переписи `evidence/13-f2-census.md` §2.3 (не входил в «пять таблиц» FACTS §1.3).
- **Часть-источник:** 3, Н12 (единственная таблица частей с двойным вердиктом НАРУШЕНИЕ+ВОПРОС).

### Класс I — дискриминатор аренды пуст (включение стены отрежет данные)

#### Д27. `organization_id IS NULL` массово на живых таблицах — 8 таблиц

- **Замер** `count(*) FILTER (WHERE organization_id IS NULL)` по срезу части 3:

| Таблица | NULL / всего | Доля |
|---|---:|---:|
| `outgoing_delivery_queue` | 812 / 812 | 100 % |
| `product_analytics_hourly` | 5300 / 5421 | 98 % |
| `patient_bookings` | 219 / 263 | 83 % |
| `reminder_journal` | 5 / 9 | 56 % |
| `patient_diary_day_snapshots` | 22 / 582 | 4 % |
| `patient_practice_completions` | 4 / 242 | 2 % |
| `patient_daily_warmup_video_views` | 1 / 250 | 0,4 % |
| `notification_delivery_attempts` | 8 / 12 626 | 0,06 % |

- **Почему это дефект, а не наблюдение.** На таблицах со ВКЛЮЧЁННЫМ RLS (`reminder_journal`,
  `patient_diary_day_snapshots`, `patient_practice_completions`, `patient_daily_warmup_video_views`,
  `notification_delivery_attempts`) эти строки уже сегодня невидимы никому — стена fail-closed, данные де-факто
  потеряны для продукта. На выключенных (`outgoing_delivery_queue`, `product_analytics_hourly`, `patient_bookings`)
  включение стены «в лоб» отрежет от 83 % до 100 % данных.
- **Часть-источник:** 3, В6 (замер) + Н5/Н6/Н7 (как усугубление). Собственного табличного вердикта не потребляет.
- **Родственный случай в другой части:** `system_settings` — 121 из 125 строк `organization_id IS NULL`, но там
  это не «незаполненный дискриминатор», а механизм дефекта Д3 (безусловная ветка по NULL).
- **Требуется.** Решение владельца О3: сперва backfill `organization_id`, потом стена — или включаем стену и
  списываем NULL-строки.

---

### 2.10 Сверка полноты (арифметика)

**Табличные вердикты «НАРУШЕНИЕ»:**

```
часть 1: 12  +  часть 2: 16  +  часть 3: 12  +  часть 4: 15  =  55  (на TEST)
                                     + 1 (Н13, только bcb_webapp_dev)  =  56
```

**Как 56 вердиктов распределились по 27 уникальным дефектам:**

| Дефект | Табличных вердиктов | Дефект | Табличных вердиктов |
|---|---:|---|---:|
| Д1 (13 таблиц аутентификации) | 13 | Д15 `appointment_records` | 1 |
| Д2 `user_contacts` | 1 | Д16 `be_organization_members` | 1 |
| Д3 `system_settings` + `_audit` | 2 | Д17 `patient_bookings` | 1 |
| Д4 эскалация `SET ROLE` | 0 (сквозной) | Д18 `outgoing_delivery_queue` | 1 |
| Д5 `app_identity_bootstrap` | 2 (`platform_users`, `user_identity`) | Д19 операторские/межсервисные | 6 |
| Д6 `user_identity` INSERT | 0 (та же таблица, что в Д5) | Д20 уведомления и каналы | 5 |
| Д7 `platform_user_contacts` | 1 | Д21 справочники/агрегат на запись | 3 |
| Д8 `user_phone_history` | 1 | Д22 `booking_calendar_map` | 1 |
| Д9 `media_files` | 1 | Д23 `product_analytics_hourly` | 1 |
| Д10 `comments` | 1 | Д24 `patient_specialist_links` (dev) | 1 |
| Д11 `media_folders` | 1 | Д25 фундамент `integrator.identities` | 0 (следствие) |
| Д12 `operator_job_status` | 1 | Д26 `reference_catalog_snapshot_receipts` | 1 |
| Д13 `saas_billing_refunds` | 1 | Д27 пустой дискриминатор аренды | 0 (сквозной замер) |
| Д14 схема `integrator` (9 таблиц) | 9 | | |

**Итого:** 13+1+2+0+2+0+1+1+1+1+1+1+1+9+1+1+1+1+6+5+3+1+1+1+0+1+0 = **56** = 55 (TEST) + 1 (dev). Сходится.

**Где произошло реальное слияние** (один дефект собран из нескольких частей):
Д1 = ч.1 №3 + ч.2 Н4–Н8 + ч.3 Н2–Н4 + ч.4 Н-8 (13 табличных вердиктов, четыре части) ·
Д5 = ч.3 Н1 + ч.4 Н-2 (две части) ·
Д19 = ч.2 Н9–Н12 + ч.3 Н9–Н10 (две части) ·
Д14, Д20, Д21 — слияние внутри одной части по единой форме дефекта.

**Разнесение по способу закрытия (после `evidence/15`):**

| Способ закрытия | Табличных вердиктов | Какие |
|---|---:|---|
| **Снимается сносом таблицы** | 4 | `integrator.telegram_users`, `integrator.message_retry_jobs` (СНОСИТЬ) · `integrator.identities`, `integrator.users` (ПЕРЕНЕСТИ И СНЕСТИ) |
| **Снимается урезанием колонок** | 1 | `integrator.telegram_state` (7 колонок: 3 имени + 4 `notify_*`/`is_active`) |
| **Требует стены, приоритет понижен** | 3 | `integrator.projection_outbox` (после переезда поддержки) · `integrator.idempotency_keys` (только стена роли, ПДн нет) · `integrator.integration_data_quality_incidents` (3 строки) |
| **Требует стены как записано** | 48 | остальные, включая единственную из схемы `integrator` — `delivery_attempt_logs` |
| **Итого** | **56** | |

Плюс находка Д25 (0 табличных вердиктов) закрывается той же волной сноса, а не постановкой стены: фундамент
`integrator.identities` исчезает вместе с таблицей, а пять зависимых стен либо уезжают в `public.support_*`,
либо (только `message_drafts`) перевешиваются на `public.user_channel_bindings`.

**Исходные счётчики частей при этом не меняются** — 12 / 16 / 12 / 15 = 55 (+1 dev). Снятие скоупа меняет
ТРЕБУЕМОЕ ДЕЙСТВИЕ по пяти вердиктам, а не сам факт, что дефект был найден: до сноса эти таблицы стоят голыми
и `app_staff` любой клиники их читает.

**Ни один табличный вердикт не потерян и ни один не посчитан дважды:** таблицы между четырьмя срезами не
пересекаются (срезы алфавитные и по схемам), поэтому дублей на уровне ТАБЛИЦ нет вовсе; слияние прошло
исключительно на уровне КЛАССОВ дефектов. Единственная пара похожих имён —
`integrator.idempotency_keys` (ч.1) и `public.idempotency_keys` (ч.2) — это две РАЗНЫЕ таблицы, обе учтены
(Д14 и Д19).

---

## 3. Вопросы

30 вопросов из четырёх частей после слияния дублей — **20 уникальных**: 16 решаются инженерно, 4 требуют
решения владельца. Отображение «источник → сводный вопрос» приведено в §3.3.

### 3.1 Решается инженерно (рекомендация + основание)

**И1. Достаточно ли «definer-шов + нулевой грант» как стены, или сверху нужен RLS+FORCE как backstop?**
Затрагивает `auth_rate_limit_events`, `idempotency_keys` (ч.1 В-7), `password_altcha_challenges`,
`password_login_identifier_protection` (ч.3 В5), `specialist_signup_intents`, `staff_security_profiles`,
`user_passkey_accounts/_challenges/_credentials` (ч.4 В-3), а также `booking_calendar_map` (Д22),
`app.principal_context`, `app.context_signing_secrets`, `app.context_nonce_ledger` (ч.1, класс T).
**Рекомендация:** записать в декларацию отдельный класс `scope=NONE, mechanism=definer` **и одновременно
требовать RLS+FORCE как backstop.** **Основание:** канон репо «FORCE RLS не снимать — backstop для definer-швов»;
SCHEME §G.2 (свип караулит FORCE); и прямое доказательство из Д1 — «стена только грантом» держится ровно до дня,
когда грант однажды выдали, а таблиц, где его выдали, тринадцать. **Цена ответа:** от него зависит вердикт по
5 таблицам части 4, сейчас помеченным OK.

**И2. Прямые табличные гранты LOGIN-ролям в обход рантайм-ролей.**
`be_specialists`, `be_specialist_service_availability` — `bcb_test_nonstaff_login=r` (ч.2 В5);
`user_phone_history` — `bcb_test_nonstaff_login=arw` (ч.4 Н-4); `platform_users`, `be_organization_members` —
SELECT у `bcb_test_nonstaff_login`/`bcb_test_integrator_login` (ч.3 Н1, ч.1 №2).
**Рекомендация:** гранты живут только на рантайм/терминальных ролях, логин получает права членством.
**Основание:** SCHEME §I Р8 уже держит провижининг логинов в контуре декларации; иначе истина уровня логина живёт
в двух местах. **Замечание:** часть 2 назвала это ВОПРОСОМ, части 3 и 4 — компонентом НАРУШЕНИЯ (расхождение К3).

**И3. `app.is_staff()` проверяет `member` вместо `usage`.**
`pg_has_role('bcb_test_integrator_login','app_staff','MEMBER')=true` при `USAGE=false` → соединение интегратора,
обслуживающее пациентские каналы, является «персоналом» для RLS **до всякого `SET ROLE`** (ч.4 В-5).
**Рекомендация:** проверять `'usage'` либо исключить логин интегратора из членов `app_staff`.
**Основание:** FACTS §1.5 — область роли должна быть ОБЪЯВЛЕНА, а не выведена из членства.
**Важно для чтения всего реестра:** каждый вывод «читает `app_staff` любой клиники» в частях 1–3 по факту шире —
включает и соединение интегратора.

**И4. Мёртвый грант при FORCE RLS («тихий ноль»).**
`clinic_dedicated_bot_bindings` — `app_staff=arwd` без единой staff-политики; единственная политика
`…_owner_manage` выдана `app_owner` с `USING true` (ч.2 В1). `broadcast_audit` — `app_owner=r` без политики (ч.2 В2).
**Рекомендация:** отозвать грант там, где путь идёт через definer (`app.resolve_clinic_dedicated_bot_organization`),
либо дописать политику — но не оставлять пару «грант без политики»: это класс FACTS §1.5 (тихий ноль).

**И5. Два разных аксессора организации в политиках одной базы.**
`c4_web_push_reminder_catalog` на `content_pages`/`content_sections` читает
`(NULLIF(current_setting('app.org', true),''))::uuid`, все прочие политики — `app.current_org_id()` (ч.2 В6);
та же форма у `notification_delivery_attempts` и `product_push_notifications` (ч.3).
**Рекомендация:** свести к `app.current_org_id()` либо объявить исключение для роли области NONE
(`app_operational_web_push_reminder`, которой `current_org_id` может быть не выдан) — но зафиксировать выбор в
декларации, а не оставлять два аксессора одной величины.

**И6. Политика выдана роли `public` вместо `app_patient`.**
`content_section_slug_history.patient_current_org_select` (ч.2 В7). На безопасность не влияет (PERMISSIVE, только
SELECT, staff уже покрыт `p0_8_4`), но расходится с шаблоном соседних таблиц.
**Рекомендация:** привести к `app_patient`.

**И7. Несогласованный набор привилегий и «тихий ноль» на телеметрии.**
`media_hls_proxy_error_events` и `media_playback_client_events` — у `app_staff` есть `awd`, но нет `r`, при этом
`playbackClientEvents.ts:113-127` строит SELECT-агрегаты (ч.2 В8). `media_playback_user_video_first_resolve` —
вставку делает пациентская сессия (`playbackUserVideoFirstResolve.ts:16-27`), табличного гранта у `app_patient`
нет, ошибка глотается (`catch → logger.error; return false`, строки 29-35), `organization_id` при вставке не
задаётся (ч.3 В8).
**Рекомендация:** назвать роль, под которой реально исполняется каждый путь, и привести гранты к ней; проверить,
не пишется ли метрика молча в ноль. **Основание:** это тот же класс, что 61 050 отказов FACTS §1.1 —
угаданная роль плюс проглоченная ошибка.

**И8. `saas_paid_period_policy` — 720 отказов у staff-пути.**
Таблица одного класса с `saas_trial_policy` и `saas_registration_tariff_policy`, но без RLS и без политик, при
этом FACTS §1.1 фиксирует **720 строк `permission denied` от `bcb_test_staff_login`** именно по ней:
`pgOrgEntitlements.ts` её читает, а гранта не имеет (ч.4 В-1).
**Рекомендация:** если величина нужна клинике на экране — `GRANT SELECT` + RLS+FORCE + read-политика по образцу
`saas_tariffs`; если не нужна — убрать чтение из staff-пути. Сейчас поведение «ни то ни сё»: код ходит, база
отказывает 720 раз, ошибка глотается.

**И9. `saas_billing_periods` — грант вместо read-политики.**
`relrowsecurity=false`, 0 политик, единственный грант `app_platform_settings=arw` (ч.4 В-2). Формально закрыто,
но механизм отличается от `saas_tariffs` — справочника того же назначения с RLS+FORCE и четырьмя read-политиками.
**Рекомендация:** read-политика по образцу `saas_tariffs`, иначе на экране выбора периода оплаты появится «тихий
ноль».

**И10. `organization_slug_claims` — реестр уникальности под арендной стеной.**
Политика показывает клинике только её собственные строки; проверка «свободен ли slug» через такую стену
невозможна в принципе (чужая занятая строка невидима → выглядит свободной, `UNIQUE` даст ошибку на вставке) (ч.3 В7).
**Рекомендация:** найти и объявить definer-шов, через который реально идёт проверка занятости, как именованное
исключение декларации — иначе стена и функция противоречат друг другу.

**И11. `media_transcode_jobs` — обход арендной стены воркер-ролями зафиксировать явно.**
Политика начинается с `pg_has_role(CURRENT_USER,'app_worker') OR pg_has_role(CURRENT_USER,'app_operational_media_worker')`
— полный обход org-фильтра (ч.3 В9).
**Рекомендация:** оставить и объявить ИМЕНОВАННЫМ исключением с обоснованием. **Основание:** модель владельца
«фильтр воркера на ENQUEUE, не в RLS»; без записи следующий аудит прочитает это как дефект.

**И12. `lfk_complexes` — пациентская ветка смотрит только на `platform_user_id`, а колонок две.**
В таблице есть и legacy `user_id text`, и `platform_user_id uuid` (бэкфилл —
`migrations/063_platform_user_owned_refs_backfill.sql:26`); строка с `platform_user_id IS NULL` пациенту невидима (ч.2 В4).
**Рекомендация:** замерить сирот (`scripts/audit-platform-user-merge.sql:27`) → либо гарантировать NOT NULL,
либо расширить предикат. Это подкласс Д27 (стена fail-closed прячет данные).

**И13. `motivational_quotes` — пациентский контент без пациентского пути к нему.**
`pgPatientHomeLegacyContent.ts:20-36` читает активные цитаты для главной пациента, но у `app_patient` нет ни
гранта, ни политики (единственная политика — `app.is_staff() AND org`); под `app_patient` это `42501` (ч.3 В4).
**Рекомендация:** установить фактом, под какой ролью рендерится страница. Два исхода, оба требуют действия: либо
блок цитат де-факто мёртв (тихий 42501), либо пациентский экран рендерится НЕ под пациентской ролью — и это
обход стены пациента, который надо назвать и закрыть.

**И14. `app.context_nonce_ledger` растёт неограниченно.**
7 538 213 строк, 1341 МБ, из них 8 228 863 записи уже просрочены по `expires_epoch`; механизма очистки в
репозитории нет — `rg -l "context_nonce_ledger"` даёт 6 файлов (deploy-SQL, deploy-скрипт, стенд A1, дамп a0,
SCHEME.md, smoke) и ни одной операции удаления/крона (ч.1 В-5).
**Рекомендация:** прунер (крон либо внутри `install_signed_context`). Это не дыра в стене, но это несущая таблица
шва принципала, и она уже больше всей остальной базы. Стены на ней корректны (ACL только `app_owner`).
**⚠ Сперва перепроверить объём точным `count(*)`:** оба числа взяты из части 1, а `reltuples` в этой базе уже
один раз соврал в 1000 раз (Д14). Если 7,5 млн подтвердится — прунер нужен; если это тоже оценка планировщика —
вопрос закрывается замером.

**И15. `platform_users` — какую форму должен иметь bootstrap-путь регистрации.**
Регистрация нового человека требует INSERT до появления org-контекста; текущая форма даёт той же роли и SELECT
по всем 278 строкам, и UPDATE по всем (ч.3 В1). Варианты: (а) только INSERT; (б) SELECT, суженный до строки,
которую сессия сейчас создаёт (по `phone_normalized`/`email_normalized` из аргумента); (в) целиком в
SECURITY DEFINER-аксессор.
**Рекомендация:** (в) — definer-аксессор. **Основание:** ровно эта форма уже применена ко всем остальным
таблицам аутентификации (`0258_bootstrap_auth_table_accessors.sql`), она не меняет UX регистрации и снимает Д5
целиком. **Гейт:** если выбранный вариант потребует изменить сам сценарий регистрации (а не только SQL) — вопрос
возвращается владельцу.

**И16. `integrator.*` очереди — доводить до арендной модели или до операционной роли?**
Исходно (ч.1 В-4) вопрос стоял по четырём таблицам: `projection_outbox`, `message_retry_jobs`,
`delivery_attempt_logs`, `idempotency_keys`. **После `evidence/15` скоуп сузился:** `message_retry_jobs`
сносится (D30 Ш7, после 2026-08-29), `idempotency_keys` не несёт ПДн (нужна только стена роли, низкий
приоритет), `projection_outbox` ждёт переезда поддержки. Реально открытым вопрос остаётся по
**`delivery_attempt_logs`** — единственной таблице схемы, где `payload_json` действительно несёт тела сообщений.
**Рекомендация:** (б) — не добавлять `organization_id`, а отозвать `app_staff` и ходить операционными ролями
области NONE. **Основание:** канон «фильтр воркера на ENQUEUE, dispatch — инфра-роль»; на `delivery_attempt_logs`
уже висят две definer-функции (`app.record_global_email_delivery_attempt`,
`app.record_operational_delivery_attempt_audit`) — шов существует, достаточно снять прямой грант.

### 3.2 Требует решения владельца

**О1. Путь глобал-админа к клиническим и медицинским данным — какой он?**
Сегодня доступа нет, и это не решено, а просто не сделано: из 33 таблиц классов P/C с включённым RLS явный путь
`app_platform_settings` есть только у четырёх — `be_organizations`, `be_branches`, `be_clinic_services`,
`admin_audit_log` (ч.1 В-1). Часть 4 подтвердила по всему своему срезу: у единственной роли области GLOBAL нет
ни одного гранта и ни одной политики на `treatment_program_*` (9 таблиц), `support_*` (5), `tests`/`test_sets`/
`test_set_items`/`test_attempts`/`test_results`, `symptom_*`, `specialist_tasks`, `reminder_rules` (ч.4 В-4). Где
глобальный путь всё-таки есть, он сделан через `USING true` — `operator_health_failure_archive` (с
`doctor_user_id` всех клиник) и `product_analytics_registration_platform_operations_select` (с `user_id` всех
клиник) (ч.3 В2).
**Вопрос:** (а) глобал-админ принципиально НЕ видит медданные — платформа отвечает только за коммерцию и каркас
клиник (тогда так и записать в декларацию и читать норму владельца как «глобал-админ по коммерции, не по
медицине»), или (б) должен быть объявленный доступ с журналом?
**Что тянется за ответом:** пока переход `app_staff → app_platform_settings` открыт (Д4), любой ответ «б»
означает, что глобальный доступ достижим из тенантного рантайма. Сейчас платформа не может ни продиагностировать,
ни восстановить программу лечения клиники иначе как под ролью-владельцем базы.

**О2. Что из служебной оценки клиники и из клинических артефактов видит пациент?**
Три места, все — продуктовая граница, не SQL:
- `be_appointment_staff_comments` — пациент читает **внутренние комментарии персонала о себе**: `app_patient=r`
  + пациентская ветка `platform_user_id = app.current_patient_user_id()`; колонка `body` заполняется
  врачом/администратором (`pgClientHistory.ts`), название таблицы — «staff comments» (ч.1 В-2);
- `be_patient_booking_profiles` — пациент читает собственную пометку «проблемный»: `is_problematic`,
  `problematic_note`, `booking_blocked`, `no_show_count` (ч.1 В-3);
- `clinical_test_regions` — у пациента гранта НЕТ вовсе: видит ли пациент свои клинические тесты (тогда нужна
  ветка `EXISTS(clinical_tests … patient_user_id=…)`), или тесты — врачебный артефакт и «закрыто по умолчанию»
  — правильное конечное состояние (ч.2 В3)?
**Почему владельцу:** технически стены на первых двух стоят и работают; вопрос ровно в том, что показывать
человеку. Модель «стена пациента = свои данные» здесь открывает служебную оценку клиники о нём.

**О3. Пустой дискриминатор аренды: чинить данные или менять стену?**
`outgoing_delivery_queue` 812/812 · `product_analytics_hourly` 5300/5421 · `patient_bookings` 219/263 ·
`patient_diary_day_snapshots` 22/582 · `reminder_journal` 5/9 · `notification_delivery_attempts` 8/12626 ·
`patient_practice_completions` 4/242 · `patient_daily_warmup_video_views` 1/250 (ч.3 В6, дефект Д27).
**Вопрос:** порядок работ — сперва backfill `organization_id`, потом включение стены; или включаем стену и
списываем NULL-строки как потерянные?
**Почему владельцу:** это решение про ДАННЫЕ (в том числе про 812 неотправленных сообщений людям), а не про SQL.

**О4. Судьба мёртвых и недостроенных таблиц с ПДн — удалять или закрывать стенами?**
- `booking_cities` + её definer-шов `app.list_active_booking_cities()` — ни одного вызова в `apps/**`, 2 строки,
  публичная запись оперирует свободным `cityCode` (ч.2 В9);
- `online_intake_answers` (4 строки) и `online_intake_status_history` (8 строк) — ни одного читателя/писателя в
  `apps/**/src`; `online_intake_requests`/`_attachments` имеют потребителей только по слиянию и удалению
  аккаунтов, не по продуктовому пути (ч.3 В3);
- по схеме `integrator` вопрос уже разобран отдельно: `evidence/15` даёт вердикты СНОСИТЬ (5) /
  ПЕРЕНЕСТИ И СНЕСТИ (6) / ОСТАВИТЬ (9) и волны работ; исходный вопрос части 1 про `integrator.telegram_users`
  (ч.1 В-6) закрыт там вердиктом **СНОСИТЬ**. Владельцу остаётся подтвердить **порядок и сроки** сноса, а не
  судьбу каждой таблицы.
**Вопрос:** дропать (freeze + dump сперва; на TEST обратимо) или закрывать стенами и держать?
**Почему владельцу:** удаление данных и вывод продуктовой функции — не инженерное решение. Подробности — §4.

### 3.3 Отображение «источник → сводный вопрос» (проверка полноты)

| Сводный | Источники | Шт. |
|---|---|---:|
| О1 | ч.1 В-1 · ч.3 В2 · ч.4 В-4 | 3 |
| О2 | ч.1 В-2 · ч.1 В-3 · ч.2 В3 | 3 |
| О3 | ч.3 В6 | 1 |
| О4 | ч.1 В-6 (закрыт `evidence/15`) · ч.2 В9 · ч.3 В3 | 3 |
| И1 | ч.1 В-7 · ч.3 В5 · ч.4 В-3 | 3 |
| И2 | ч.2 В5 | 1 |
| И3 | ч.4 В-5 | 1 |
| И4 | ч.2 В1 · ч.2 В2 | 2 |
| И5 | ч.2 В6 | 1 |
| И6 | ч.2 В7 | 1 |
| И7 | ч.2 В8 · ч.3 В8 | 2 |
| И8 | ч.4 В-1 | 1 |
| И9 | ч.4 В-2 | 1 |
| И10 | ч.3 В7 | 1 |
| И11 | ч.3 В9 | 1 |
| И12 | ч.2 В4 | 1 |
| И13 | ч.3 В4 | 1 |
| И14 | ч.1 В-5 | 1 |
| И15 | ч.3 В1 | 1 |
| И16 | ч.1 В-4 (скоуп сужен `evidence/15`) | 1 |
| **Итого** | 7 + 9 + 9 + 5 | **30** |

---

## 4. Таблицы под вопросом существования

**Схема `integrator` — не здесь.** Судьба всех 20 таблиц схемы разобрана в
`evidence/15-integrator-tables-disposition.md`: **СНОСИТЬ 5** (`telegram_users`, `content_access_grants`,
`message_retry_jobs`, `user_reminder_rules`, `contacts`), **ПЕРЕНЕСТИ И СНЕСТИ 6** (`conversations`,
`conversation_messages`, `user_questions`, `question_messages`, `identities`, `users`), **ОСТАВИТЬ 9**.
Дублировать этот разбор здесь нельзя; в реестре его результат отражён в Д14, Д25 и §2.10. Из вопросов частей
туда полностью уехал ч.1 В-6 (`integrator.telegram_users`) — вердикт **СНОСИТЬ**.

**Кандидаты вне схемы `integrator`:**

| Таблица | Строк | На чём основана «мёртвость» | Часть |
|---|---:|---|---|
| `public.booking_cities` | 2 | Имя drizzle-экспорта `bookingCities` не встречается нигде вне `db/schema/`; definer-шов `app.list_active_booking_cities()` (создан `0306_v9b_capability_seams_local.sql:11`, EXECUTE выдан `app_patient`/`app_staff`) **не вызывается ни разу** в `apps/**`; публичная запись оперирует свободным `cityCode` (`src/app/book/service/page.tsx:17,35`). Функцию справочника де-факто выполняет строка `cityCode`, а не таблица | 2, В9 (+ Н14) |
| `public.online_intake_answers` | 4 | Ни одного читателя/писателя в `apps/**/src`: только миграции `048_online_intake.sql`, `0150_p0_4_p5_online_intake_org.sql` и `scripts/consolidate-owner-identity.sql` | 3, В3 |
| `public.online_intake_status_history` | 8 | То же — только миграция и разовый скрипт | 3, В3 |
| `public.online_intake_requests` | — | Потребители есть, но ТОЛЬКО по слиянию/удалению аккаунтов (`platformUserFullPurge.ts`, `pgPlatformUserMerge.ts`, `pgChannelLinkClaim.ts`), не по продуктовому пути | 3, В3 |
| `public.online_intake_attachments` | — | То же: чтение ключей S3 при purge (`platformUserFullPurge.ts`) | 3, В3 |

**Формулировка вопроса по `online_intake_*` дословно из части 3:** «Это функция, которую не достроили, или
мёртвая ветка под удаление? Стены на них корректные — вопрос не про стены, а про то, надо ли их вообще держать.»

**Проверить перед решением:** числа строк в этой таблице взяты из частей; `evidence/15` показал, что оценка
`reltuples` в этой базе врёт (Д14). Для решения о сносе нужен точный `count(*)` — как и по любой другой таблице
реестра.

**Мёртвый ПУТЬ, а не таблица** (отдельно, чтобы не смешивать): `media_playback_user_video_first_resolve` — 563
строки, вставка идёт на пациентском действии, гранта у `app_patient` нет, ошибка глотается; часть 3 (В8)
допускает, что «строки писались до включения стен и сейчас метрика молча не пишется». Это вопрос И7, не кандидат
на удаление.

**Легаси, но НЕ кандидаты на вывод** (читатели живы, поэтому в этот список не попадают, хотя обе — легаси):
`public.appointment_records` (проекция из Rubitime; `pgAppointmentProjection.ts:171`, `adminStats.ts:26`) и
`public.patient_bookings` (старые записи на приём; `pgPatientBookings.ts:124-168`). Обе — нарушения Д15 и Д17.

**Мёртвые ГРАНТЫ/ШВЫ, а не таблицы** (вопрос И4): `clinic_dedicated_bot_bindings` — `app_staff=arwd` без
staff-политики; `broadcast_audit` — `app_owner=r` без политики.

---

## 5. Что НЕ является нарушением

**160 таблиц из 239 получили вердикт OK.** Это не «не проверено» — по каждой в частях указан потребитель
(файл:строка), нужные стены и фактическое состояние.

| Часть | OK | Форма |
|---|---:|---|
| Часть 1 | 47 из 61 | Весь блок `be_appointment*`/`be_patient*`/`be_payment*` (записи, абонементы, платежи) закрыт `saas_org_dormant_*` с обеими ветками; `integrator.conversations`/`conversation_messages`/`message_drafts`/`user_questions`/`question_messages`/`user_reminder_*`/`contacts`/`content_access_grants` — RLS+FORCE с org-веткой и пациентской через EXISTS (⚠ но см. Д25 — фундамент, и `evidence/15` — 6 из них вообще сносятся); все 5 таблиц класса T закрыты грантами `app_owner` |
| Часть 2 | 34 из 61 | Весь клинический блок `clinical_*` (анамнез, жалобы, диагнозы, визиты), `doctor_notes`, `doctor_patient_support`, `lfk_*`, `courses`, `broadcast_*`, `be_working_*`, `be_specialist_*` — RLS+FORCE, `p0_8_3`/`p0_8_4` с обеими ветками |
| Часть 3 | 37 из 58 | `org_enrollments`, `patient_files`, `patient_payment`, `patient_invites`, `patient_merge_candidates`, `program_*`, `reminder_*`, `product_analytics_user_hourly`, `message_log`, `online_intake_requests`/`_attachments`, `org_brand_revisions`, `patient_home_*`, `reference_categories`/`reference_items`, `recommendations` |
| Часть 4 | 42 из 59 | Все `treatment_program_*` (9), все `support_*` (5), `symptom_*`, `test_*`, `tests`/`test_sets`/`test_set_items`, `specialist_tasks`, `reminder_rules`, 6 из 7 `saas_billing_*`/`saas_*_policy`, `saas_isolation_*` (3), `user_passkey_*` (3), `staff_security_profiles`, `specialist_signup_intents`, оба журнала миграций |

**Образцы, которые части назвали эталонами** (полезны как форма для декларации):

- `public.org_brand_revisions` — «эталон правильной пары стен»: `…_exact_org_staff` (staff по org) +
  `…_enrolled_patient_published_read` (`status='published' AND app.current_patient_has_active_org_enrollment(organization_id)`), ч.3;
- `public.reference_categories` / `reference_items` — «эталон: обе стены + явный засевочный шов»: staff-org +
  `reference_catalog_patient_select` (org + активный `org_enrollments`) + `reference_catalog_seed_owner` для
  `app_owner` только пока нет receipt, ч.3;
- `public.app_runtime_settings` — «образцовая стена роли»: `s5_runtime_settings_isolation` (staff — своя орг;
  пациент — только `audience in (public, authenticated_client)`; воркер — только `audience='server'`) +
  `u9a_platform_runtime_global_only` (`app_platform_settings` только `organization_id IS NULL`), ч.1;
- `public.staff_security_profiles`, `user_passkey_accounts/_challenges/_credentials`, `specialist_signup_intents`,
  `public.reference_catalog_baselines` — definer-шов замкнут: НИ ОДНОГО гранта рантайм-ролям, только
  владелец/`app_owner`; часть 4 прямо использует их как доказательство, что правильная форма в базе уже есть
  (сравнение с Д1). ⚠ Именно этот класс — предмет вопроса И1;
- `public.saas_isolation_events`/`_hourly`/`_coverage_runs` — ACL только у `saas_telemetry_owner`, доступ через
  `app.report_saas_isolation_event`/`app.read_saas_isolation_events`, ч.4;
- `public.manual_patient_commands` — пациентская стена сделана ОТСУТСТВИЕМ доступа (у `app_patient` гранта нет,
  поверхности у пациента нет), и это проверяется стендом `patient-invites-disposable-proof.mjs:1023`, ч.2;
- `public.patient_invites`, `patient_merge_candidates` — та же форма: «стена пациента = отсутствие гранта», что
  верно для таблицы секретов и для служебного реестра дублей, ч.3;
- `public.be_package_items`, `be_patient_package_items` — `organization_id` нет НАМЕРЕННО, стена родительская
  через `EXISTS`, ч.1;
- `public.lfk_complex_templates`/`_exercises`, `lfk_exercises`, `lfk_exercise_media`, `lfk_exercise_regions` —
  глобальная библиотека объявлена явно и только на чтение (`c4d_platform_library_read`:
  `owner_kind='platform' AND organization_id IS NULL`), ч.2;
- `public.media_transcode_jobs` — обход воркер-ролями признан соответствующим модели владельца («фильтр воркера
  на ENQUEUE, не в RLS»); вердикт OK с требованием записать исключение явно (И11), ч.3;
- `integrator.schema_migrations` — служебный журнал без данных людей; часть 1 и `evidence/15` §20 оценили
  одинаково (единственная таблица схемы, где оценки сошлись без правок).

**⚠ Оговорка к «OK» по схеме `integrator`.** Пять таблиц части 1 (`conversations`, `conversation_messages`,
`user_questions`, `question_messages`, `user_reminder_rules`, `contacts`) получили OK по стенам — и это
по-прежнему верно, но их стены стоят на незакрытом фундаменте (Д25), а сами таблицы `evidence/15` вынес к
сносу как зеркала вебаппа. То есть «OK» здесь означает «стена написана правильно», а не «работа по таблице
закончена».

---

## 6. Расхождения между частями и с прежними документами

Записаны, а НЕ разрешены: разрешение расхождения = новый вердикт, а это уже переаудит, не сведение.
Исключение — К8/К9: там расхождение уже разрешено ЗАМЕРОМ в `evidence/15`, и исправленный факт внесён в §2.

**К1. Один и тот же шаблон `app_platform_settings … USING true` получил разные вердикты.**
Часть 1 засчитывает его как «путь глобал-админа» и ставит **OK** (`be_organizations`, `be_branches`,
`be_clinic_services`, `admin_audit_log`). Часть 2 — тоже **OK** (`be_service_location_availability`,
`be_specialists`, `be_working_hours`, `be_specialist_service_availability`). Часть 3 — **ВОПРОС** на том же
шаблоне (`operator_health_failure_archive` с `doctor_user_id` всех клиник; `product_analytics_events_recent` по
событиям регистрации). Часть 4 — **OK** на `saas_*`, но её же Н-9 доказывает, что роль достижима из тенантного
рантайма через `SET ROLE`. → Развязывается ответом владельца О1 + закрытием Д4.

**К2. Класс «definer-шов + нулевой грант» тоже оценён по-разному.**
Часть 1 — **OK** и прямо пишет «стена сделана грантами, а не RLS, и это здесь верно» (`app.principal_context`,
`app.context_signing_secrets`, `app.context_nonce_ledger`). Часть 4 — **OK** (`staff_security_profiles`,
`user_passkey_*`, `specialist_signup_intents`), но со своим вопросом В-3. Часть 3 — **ВОПРОС**
(`password_altcha_challenges`, `password_login_identifier_protection`). Механизм один, вердикты три. → Вопрос И1;
от ответа зависит вердикт минимум по 5 таблицам, помеченным сейчас OK.

**К3. Прямой табличный грант LOGIN-роли — ВОПРОС в одной части, компонент НАРУШЕНИЯ в двух других.**
Часть 2: `bcb_test_nonstaff_login=r` на `be_specialists`/`be_specialist_service_availability` → В5 (вопрос).
Часть 3: SELECT у `bcb_test_nonstaff_login`/`bcb_test_integrator_login` на `platform_users` → часть Н1 (нарушение).
Часть 4: `bcb_test_nonstaff_login=arw` на `user_phone_history` → часть Н-4 (нарушение). → Вопрос И2.

**К4. Части поправляют прежние документы расследования (это не спор между частями, а уточнение факта).**
- Часть 3 (Н1): FACTS §1.4 «`app_patient` под `SET ROLE` видит 0» — верно и **вводит в заблуждение**: дыра в
  ЛОГИН-ролях, которых замер §1.4 не касался.
- Часть 4 (Н-2): `evidence/13-f2-census.md` §4 присвоил `app_identity_bootstrap` область `OWN` со знаком
  «?ВОПРОС» — по факту область **GLOBAL**.
- Часть 3 (Н12) + перепись §2.3: FACTS §1.3 «пять таблиц» → фактически **6 на TEST / 7 на dev**
  (+`reference_catalog_snapshot_receipts`, +dev-`patient_specialist_links`). FACTS уже несёт эту пометку дрейфа.
- Часть 4: `system_settings` — «в slice-03 стоит rows=123, это оценка `reltuples`, не точный счёт»; точный
  замер 125. Часть 3 отдельно фиксирует: «живой каталог на 08.08 авторитетнее чисел в срезе-задании».

**К5. Одинаковые имена в разных схемах — не дубль.** `integrator.idempotency_keys` (ч.1 №11) и
`public.idempotency_keys` (ч.2 Н9) — ДВЕ разные таблицы, обе без стен, обе учтены (Д14, Д19); писатель
`pgStore.ts` пишет неквалифицированное имя, то есть в `public` (`evidence/15` §16 — часть 1 приписала его не
той таблице). Та же осторожность нужна с `schema_migrations`: `integrator.schema_migrations` (ч.1, 68 строк по
части / 79 по `evidence/15`) и `public.schema_migrations` (ч.4, 73 строки) — разные объекты, оба OK.

**К6. Радиус слова «`app_staff`» в частях 1–3 занижен.** Части 1–3 читают `app_staff` как терминал персонала.
Часть 4 доказала: `app.is_staff()` истинно для пяти ролей (`app_staff`, `bcb_test_staff_login`,
`bcb_test_integrator_login`, `bcb_dev_runtime_staff_login`, `postgres`) — то есть соединение интегратора для RLS
является персоналом до всякого `SET ROLE`. Каждый вывод «читает `app_staff` любой клиники» в первых трёх частях
следует читать шире. → Вопрос И3.

**К7. Разный метод доказательства.** Части 1, 2 и 4 выводили достижимость из каталога (RLS-флаги + `relacl` +
тексты политик); часть 3 дополнительно выполняла `SET ROLE` + `count(*)`. Часть 4 указала причину, по которой
не делала живой обход: постановка принципала — это DML (строка в `app.principal_context`), запрещённый брифом.
Поэтому 9 таблиц доказаны исполнением, а 33 — каталогом; это разница в СИЛЕ доказательства, не в вердикте.

**К8. 🔴 РАЗРЕШЁННОЕ расхождение: `integrator.idempotency_keys` — находка части 1 опровергнута замером.**
Часть 1 (`14-classification-part-1.md:108,152`): 221 476 строк, `response_body` с телами ответов API, писатель
`pgStore.ts:65`. `evidence/15` §16: ~225 строк (замер трижды), `response_body='{}'` в 261 строке из 261, ПДн нет,
писатель — другая таблица. Замер сильнее оценки → исправленный факт внесён в Д14, оригинал оставлен зачёркнутым.
**Дополнительно к этому расхождению — расхождение в НУМЕРАЦИИ источников:** `evidence/15` называет эту находку
«часть 3», но цитирует файл `14-classification-part-1.md`. Находка — из **части 1**; при поиске в части 3 её не
будет. Записано, чтобы никто не искал не в том файле.

**К9. 🔴 НЕразрешённое расхождение по объёму `public.idempotency_keys`.** Часть 2 (Н9): **1 251 959 строк**,
«в `response_body` оседают ответы по обращениям пациентов и по привязке телефонов». `evidence/15` §16 п.2:
«`public.idempotency_keys` — ОТДЕЛЬНАЯ таблица (существует, **0 строк на TEST**)». Оба утверждения записаны.
Ни одно не проверено точным `count(*)` в контексте этого реестра, а после К8 доверия к большим числам без
`count(*)` нет. **Требуется замер.** На сам дефект стены (RLS off + `app_staff=arwd`) это не влияет.

**К10. Снятие скоупа `evidence/15` не отменяет находок частей.** По пяти таблицам схемы `integrator` требуемое
действие меняется со «стена» на «снос/урезание». Вердикты частей остаются в силе: до сноса эти таблицы стоят
без стен и читаются `app_staff` любой клиники. Разнесение — §2.10.

---

## 7. Указатели

- Первоисточники (не изменялись): `evidence/14-classification-part-{1,2,3,4}.md`.
- Судьба таблиц схемы `integrator` (СНОСИТЬ / ПЕРЕНЕСТИ И СНЕСТИ / ОСТАВИТЬ, волны работ, опровержение числа
  221 476): `evidence/15-integrator-tables-disposition.md`.
- Перепись каталога и роли/области: `evidence/13-f2-census.md` (§2.3 org-таблицы, §4 области ролей, §5 stray).
- Живые дефекты и открытый список: `FACTS.md` §1 и §11.
- Принятые решения и границы схемы: `SCHEME.md` §I (Р1–Р10), §A (декларация), §G (свип).
