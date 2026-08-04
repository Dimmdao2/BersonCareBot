# ACCESS_SWEEP_2026-08-04 — сплошная сверка прав, часть 1 (статика)

Аудит по брифу `docs/_TODO/runs/briefs/ACCESS_SWEEP_STATIC_BRIEF_2026-08-04.md`. База — `bersoncarebot_test`
(TEST), только чтение, ничего не изменено (проверки под RLS — внутри `BEGIN…ROLLBACK`). Известные и уже
чинящиеся отдельно баги (14 определителей-сирот + грант на `user_channel_preferences`, ветка `wt/login-fix`)
здесь не переоткрываются, только упоминаются как контекст.

## Топ находка — интегратор ломает `user.upsert` для уже известных Telegram/Max-пользователей (CRITICAL, живое, с сегодняшнего дня)

Причина ровно того же класса, что в известных багах, но не в списке `wt/login-fix` и куда шире по площади:
`platform_users` получила `FORCE ROW LEVEL SECURITY` сегодня (`0353_platform_users_rls_d15b4_local.sql`,
D15b/4). Принцип `integrator` (используется, когда webhook-предмаршрутизация уже знает organizationId и
integratorUserId — **обычный случай для уже известного контакта**, см. комментарий в
`apps/integrator/src/infra/db/writePort.ts:99-125`) делает `SET ROLE app_patient` с `org_id` заданным и
`patient_user_id = NULL` (`packages/db-principal/src/index.ts:1081` — `case 'patient': case 'integrator':
return DB_PRINCIPAL_PATIENT_ROLE`). Под этим принципом ни одна политика `platform_users` не подходит:
`self_*` требует `current_patient_user_id() IS NOT NULL` (NULL), `staff_org_*` требует `is_staff()` (роль —
`app_patient`, не `app_staff`), `identity_bootstrap_*` требует членства `CURRENT_USER` в
`app_identity_bootstrap` (`app_patient` не член — членами являются только сами login-роли:
`bcb_test_nonstaff_login`, `bcb_test_integrator_login`, `bcb_webapp_dev_user`, `bcb_dev_runtime_nonstaff_login`).

Доказано на TEST (в одной транзакции, откачено): вручную поставлена строка `app.principal_context` с
`org_id` = реальная клиника, `patient_user_id = NULL`, `integrator_user_id = 29` (реальный, у него есть
живая `platform_users` строка `d9c34602-…`), затем `SET ROLE app_patient` — ровно то, что делает `integrator`
принцип:

```sql
SELECT id::text FROM platform_users WHERE integrator_user_id = 29 AND merged_into_id IS NULL LIMIT 3;
-- 0 rows (строка РЕАЛЬНО существует — тихий ноль, класс совпадает с bug #1)

UPDATE platform_users SET updated_at = now() WHERE id = 'd9c34602-…' RETURNING id;
-- ERROR: permission denied for table platform_users   (app_patient не имеет UPDATE/INSERT грантов вовсе,
--   только SELECT — information_schema.role_table_grants подтверждает)

INSERT INTO platform_users (id, integrator_user_id, display_name, created_at, updated_at)
VALUES (gen_random_uuid(), 999999999, 'Audit Test', now(), now());
-- ERROR: permission denied for table platform_users
```

**Кого касается:** каждое входящее сообщение Telegram/Max от уже известного (сматченного) контакта —
`user.upsert` (D1) в `apps/integrator/src/infra/db/writePort.ts:328`, идёт через общий
`@bersoncare/platform-merge/identityProjectionWrite` (сырой SQL к `platform_users`, не через SECURITY
DEFINER). Чтение возвращает тихий ноль → код решает, что пользователь не найден; запись падает с
permission denied. Та же дыра — `user.phone.link` (`writePort.ts:428`, `applyMessengerPhonePublicBind`) и
запись в `admin_audit_log` из `messengerPhoneBindAudit.ts`, вызываемая из того же case.

**Почему не поймано другим фиксом:** соседние прямые записи (`support_conversations`, `support_questions`,
`reminder_rules`, `admin_audit_log` из delivery-события) уже защищены обёрткой
`runDirectPublicWriteWithOrgPrincipal` (переустанавливает `organization`-принцип → `SET ROLE app_staff` перед
записью — комментарий в файле датирован 25.07, «Re-verified by independent audit», D3-D5). Ровно тот же
паттерн НЕ применён к D1 (`writeIdentityAndPreferencesDirect`, `user.upsert`) и к
`user.phone.link`/`messengerPhoneBindAudit` — видимо, потому что раньше (до сегодняшнего FORCE RLS на
`platform_users`) читать/писать эту таблицу под `app_patient` было безопасно, а `runDirectPublicWriteWithOrgPrincipal`
писали для ДРУГИХ таблиц. Правки не чинить (задача — не чинить), но зафиксировать: нужен тот же класс фикса,
что и D3-D5, применённый к D1 и к `user.phone.link`.

Смежная, не проверенная живьём находка того же агента (код-трасса, не подтверждена запросом): в
`apps/integrator/src/integrations/bersoncare/bookingLifecycleRoute.ts` (`POST /api/bersoncare/booking/lifecycle-event`
→ `syncCanonicalAppointmentToCalendar`) нет НИКАКОЙ обёртки `runWith*Principal` — в locked-режиме (`TEST` использует
locked, `deploy/host/deploy-test.sh`) это должно падать на первом же запросе с `DB principal context is required
before scoped DB access in locked mode», но ошибка проглатывается `try/catch { logger.warn }` — синхронизация
`patient_bookings.gcal_event_id` с Google Calendar по этому пути тихо не работает вообще, никогда. Не подтверждено
запросом к живой базе — требует отдельной проверки (не РЛС-класс, а «принципала нет вовсе»).

## А. Определители `app.*` против FORCE RLS

Запрос-основа (полный охват, не выборка):

```sql
select p.proname, r.rolname, r.rolbypassrls, p.prosecdef
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
where n.nspname='app' and p.prosecdef;
```

226 функций: 162 `app_owner` (bypassrls) + 4 `saas_system_health_owner` (bypassrls) — безопасны по
конструкции. 60 без bypassrls (`bersoncarebot_test` 51, `saas_telemetry_owner` 7, `app_platform_settings` 1,
`app_web_push_reminder_discovery_definer` 1) — для каждой проверено регэксп-сверкой тела функции
(`pg_get_functiondef`) против полного списка FORCE-RLS таблиц (173 шт.), что именно она трогает.

**Новая находка (не в списке `wt/login-fix`) — `app.list_web_push_reminder_organization_ids` отдаёт тихий
ноль.** Владелец — `app_web_push_reminder_discovery_definer` (не bypassrls, не член `app_identity_bootstrap`).
JOIN на `platform_users` под FORCE RLS без подходящей политики. Доказано:

```sql
select count(*) from reminder_rules
where integrator_user_id is null and platform_user_id is not null
  and organization_id is not null and is_enabled=true;                    -- 16

BEGIN; SET LOCAL ROLE app_web_push_reminder_discovery_definer;
SELECT app.list_web_push_reminder_organization_ids(now());                -- 0 rows
ROLLBACK;
```

Сейчас безвредно: ни функция, ни роль `app_web_push_reminder_discovery_definer` нигде не вызываются из
рабочего кода (`grep` по `apps/`, `packages/` — 0 совпадений; упоминания только в
`scripts/a0-greenfield-baseline*.mjs` и снапшоте схемы) — заготовка под нереализованную фичу web-push
reminder discovery. Сломается молча в момент, когда её подключат. Не чинить сейчас — но не забыть при
подключении: нужен либо `app_owner`-владелец, либо членство в `app_identity_bootstrap`.

**14 уже известных (в `wt/login-fix`, не трогать):** `bump_platform_user_session_epoch_self`,
`email_auth_find_email_owner_conflict`, `email_auth_verify_user_email`,
`email_otp_public_delete_unverified_registration`, `email_otp_public_find_or_create_user`,
`email_otp_public_find_user_by_email`, `email_otp_public_register_patient`,
`email_password_delete_unverified_registration`, `email_password_find_login_candidate`,
`email_password_register_pending`, `patient_done_reminder_occurrence`, `patient_skip_reminder_occurrence`,
`patient_snooze_reminder_occurrence`, `propagate_staff_session_version_to_session_epoch`.

**Проверено и в порядке:**
- `app.get_public_config_bool` (владелец `bersoncarebot_test`) трогает `system_settings` — но политика
  `saas_bootstrap_hybrid_p0_8_6` открыта для ВСЕХ ролей на `organization_id IS NULL`, а функция всегда
  фильтрует именно на это условие. Живой тест: `SET ROLE bersoncarebot_test; SELECT
  app.get_public_config_bool('specialist_signup_enabled')` → `t`.
- `app.start_provisioned_organization_trial` (владелец `app_platform_settings`) трогает `be_organizations`,
  `admin_audit_log`, `saas_organization_trials`, `saas_registration_tariff_policy`, `saas_tariffs`,
  `saas_trial_policy` — на КАЖДОЙ из них есть выделенная политика `TO app_platform_settings USING (true)`.
  Живой тест: под этой ролью функция падает на `RAISE EXCEPTION provisioning_patient_principal_required`
  (её собственная защита по аргументам, громко, не тихий ноль) — не RLS-проблема.
- 7 функций `saas_telemetry_owner` — трогают только `saas_isolation_*` таблицы, у которых
  `relrowsecurity=f` вообще (RLS выключен) — риска нет по построению.
- D30-очередь (`advance_appointment_reminder_messenger_ladder`,
  `apply_specialist_task_reminder_success_outcome`, `mark_patient_reminder_occurrence_queued`,
  `patient_reminder_materialization_fingerprint`, `refresh_specialist_task_reminder_materialization`,
  `resolve_outgoing_delivery_scope`, `revalidate_appointment_reminder_materialization`,
  `revalidate_patient_reminder_delivery_materialization`,
  `revalidate_specialist_task_reminder_materialization`,
  `specialist_task_reminder_materialization_fingerprint`, `upsert_patient_reminder_occurrence_plan`) —
  ВСЕ 11 корректно принадлежат `app_owner`, несмотря на `CREATE OR REPLACE` в новых миграциях (проверено
  прямым запросом к `pg_proc`, не предположением).

## Б. Прямые обращения кода к таблицам против грантов login-ролей

Слои и роли (по факту `pg_auth_members`): публичный/досессионный = `app_identity_bootstrap` +
`bcb_test_nonstaff_login`/`bcb_test_integrator_login` (кто именно — env-специфично); пациент = `app_patient`;
персонал = `app_staff`; воркеры = `app_worker` + 5 операционных ролей (`app_operational_delivery_worker`,
`_diagnostic`, `_media_worker`, `_scheduler`, `_web_push_reminder`).

**Критично для этого раздела: `bcb_test_integrator_login` — единственная роль на боксе с `INHERIT FALSE` на
ВСЕХ своих членствах** (`app_patient`, `app_staff`, `app_worker`, `app_identity_bootstrap` — все
`inherit_option=f`). Прямое подключение под этой ролью (без `SET ROLE`) НЕ наследует гранты этих групп
автоматически — у неё для этого есть отдельный, узкий набор прямых грантов
(`platform_users`, `be_organizations`, `be_organization_members`, `org_enrollments`,
`user_channel_bindings`, `user_channel_preferences`, `support_conversations`, `support_questions` — SELECT
only, плюс горстка `integrator.*`-таблиц). Всё, что интегратору нужно писать, обязано явно `SET ROLE`
куда-то — источник Топ-находки выше.

**Находка — критичная, разобрана в Топ-находке.**

**Проверено и в порядке (webapp, до-сессионные роуты):**
- Вся авторизация в `apps/webapp` защищена общим чекпойнтом (`getDrizzle()`, taskdb #821): принцип
  захватывается СИНХРОННО в момент вызова `.select()/.execute()`, даже у ленивого thenable — значит «голый»
  `getDrizzle().select()` не значит «без принципала», если принцип был установлен раньше в том же запросе.
  Из 51 файла `apps/webapp/src/app/api/auth/**/route.ts` 48 сразу вызывают `stampBootstrapPrincipal(...)`;
  оставшиеся 3 (`passkey/*`) — не досессионные, у них уже есть staff/patient-принцип.
- OAuth-колбэки (`google/apple/vk/yandex`) читают/пишут `platform_users` напрямую
  (`pgOAuthUserResolve.ts`), без обёртки в транзакцию — структурно похоже на класс бага, но принцип у них
  `bootstrap` (НЕ ставит `SET ROLE`), значит `CURRENT_USER` остаётся тем же login-роли, который САМ является
  членом `app_identity_bootstrap` (`bcb_test_nonstaff_login` и т.п.) → политика `platform_users_identity_bootstrap_*`
  проходит. Разница с Топ-находкой именно в том, что `bootstrap` принцип не переключает роль, а `integrator`
  переключает.
- `pgChannelPreferences.ts` (`user_channel_preferences`, `user_phone_history`, `user_channel_bindings`) —
  та же логика: `user_channel_bindings`/`user_channel_preferences` вообще без RLS
  (`relrowsecurity=f`), `user_phone_history` под FORCE RLS, но `bcb_test_nonstaff_login` имеет на неё ПРЯМОЙ
  грант (`SELECT,INSERT,UPDATE`) независимо от роли-группы — проверено `information_schema.role_table_grants`.
- `be_booking_form_fields`/`be_booking_form_submissions` (публичная форма записи) читаются/пишутся под
  `organization`-принципом (не bootstrap) через `withExplicitOrganizationPrincipal` — синхронный захват,
  корректно.
- Интегратор: D3-D5 прямые записи (`support_conversations`, `support_questions`, `reminder_rules`,
  `admin_audit_log` из delivery-события) — все обёрнуты `runDirectPublicWriteWithOrgPrincipal`, подтверждено
  построчным grep каждого вызова в `writePort.ts`.
- `outgoingDeliveryWorker.ts` (`outgoing_delivery_queue`, `broadcast_audit`, `notification_delivery_attempts`,
  `user_channel_bindings`) — внешний `infra`-принцип на общий claim/reset, затем ПОЕРЯДНАЯ переустановка
  `organization`-принципа перед любой tenant-записью. Эталонный паттерн, без пробелов.
- `notificationDeliveryAttempts.ts` — сам берёт `organizationId` аргументом и ставит принцип внутри себя, не
  полагаясь на амбиентный контекст снаружи — защищено от порядка вызовов.

**Не проверено / за рамками этого прохода (честно, не «нет» без перечисления):**
- `payments/webhook/*`, `payments/saas-webhook/*`, `payments/patient-acquiring-webhook/*` — подтверждено, что
  ставят `bootstrap`, потом `organization`-принцип, но внутренности `pgSaasBilling.ts` до прямых обращений к
  таблицам не пройдены до конца.
- `auth/telegram-login`, `auth/telegram-init`, `auth/max-init`, `auth/exchange` — не пройдены построчно
  `modules/auth/service.ts` (`setSessionFromUser`, `getCurrentSession`) и `recordAuthLogin.ts`.
- `apps/integrator`: `jobQueue.ts`, `schedulerLocks.ts`, `projectionOutbox.ts`, `messageLogs.ts`,
  `idempotencyKeys.ts`, `adminStats.ts`, `broadcastAudit.ts`, `canonicalUserId.ts`, `userLookup.ts` и ещё
  десяток репозиториев — увидены в grep, не разобраны построчно.
- `operatorHealthAlertConfigIntegrator.ts`, `doctorBroadcastIntentMenu.ts`, `platformUserByChannel.ts`,
  `platformUserDeliveryPhone.ts` — читают `platform_users`/`user_channel_bindings`, принцип на момент чтения
  не прослежен до конца.
- `bookingLifecycleRoute.ts` — см. Топ-находку, код-уровень, не подтверждено запросом к живой базе.

## В. Что изменилось за последнюю волну (миграции/деплой с 25.07, фокус на 01.08–04.08)

- **D15b/4** (`0353_platform_users_rls_d15b4_local.sql` + `0355` reconcile, роль
  `deploy/postgres/d15b4-platform-users-identity-bootstrap-role.sql`) — приземлилась СЕГОДНЯ, `platform_users`
  впервые под `FORCE ROW LEVEL SECURITY`. Корень обоих известных багов И Топ-находки этого отчёта.
  ⚠️ **Расхождение с памятью агентов от 25.07** (`platform-users-has-no-rls-single-wall-on-pii`): та запись
  фиксировала `relrowsecurity=f` — с сегодняшнего дня это устарело, таблица под RLS+FORCE. Помечаю
  устаревшей в этом отчёте; сама memory-запись не редактировалась (не входит в объём этой задачи).
- **D15b/2** (интегратор перестаёт писать идентичность напрямую, `5137e8c68`/`2c1cd63fb`, 03.08) — ввела
  общий `identityProjectionWrite`-движок (`packages/platform-merge`), которым сегодня пользуются и webapp, и
  интегратор. Сам по себе безопасен; уязвимым его сделало последующее D15b/4 (FORCE RLS), потому что движок
  не завёрнут в `runDirectPublicWriteWithOrgPrincipal` на интеграторской стороне — см. Топ-находку.
- **D30** (`0328`, `0333`, `0335`, `0338`, `0339` — очередь доставки/materialization) — все новые
  SECURITY DEFINER функции корректно принадлежат `app_owner` (проверено `pg_proc`, не миграцией на слово),
  все `GRANT`/`OWNER TO` в этих файлах целятся в `app_owner`. Грант-матрица на `outgoing_delivery_queue`,
  `reminder_journal`, `reminder_occurrence_history`, `user_reminder_occurrences` для
  `app_operational_delivery_worker`/`app_staff`/`app_patient`/`app_owner` выглядит симметрично, пробелов не
  найдено.
- Deploy-канон (`deploy/postgres/d3-4-bootstrap-base-login-read-grants.sql`, 1093 строки) — очень
  дисциплинированно ведёт закрытый список EXECUTE/SELECT-грантов для голого досессионного логина, с
  живыми комментариями о прошлых инцидентах того же класса (например, `phone_otp_public_booking_*`,
  воспроизведено на DEV 26.07). Это объясняет, почему находок в webapp-досессионном слое немного: место уже
  много раз чинили за этот тип бага. Дыра нашлась там, где такой дисциплины ещё не было — на интеграторской
  стороне для D1.

## Итог: что делать (без починки, только приоритет)

1. **Топ-находка (интегратор `user.upsert`/`user.phone.link`) — самое срочное.** Живое и с сегодняшнего дня;
   ломает обработку сообщений от уже известных Telegram/Max-контактов, не только вход.
2. `list_web_push_reminder_organization_ids` — низкий приоритет (не подключено к рабочему коду), но нужно
   поправить ДО подключения фичи, иначе повторится тот же класс молча.
3. `bookingLifecycleRoute.ts` — нужна отдельная проверка живым запуском (не РЛС-класс), не подтверждено здесь
   запросом к БД.
4. Часть Б помечена «не проверено» по нескольким веткам (список выше) — следующий проход, если владелец
   попросит углубление, стоит начать оттуда.
