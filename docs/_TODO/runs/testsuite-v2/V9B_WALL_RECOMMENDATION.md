# В9б — синтез tenant-wall для группы D

Дата: 2026-08-01. Статус: инженерная рекомендация; enforcement на TEST ещё не выполнен.

Основание: независимые разборы
[`V9B_WALL_RESEARCH_sol.md`](V9B_WALL_RESEARCH_sol.md) и
[`V9B_WALL_RESEARCH_opus.md`](V9B_WALL_RESEARCH_opus.md), актуальная schema и runtime access paths.
Перечень таблиц — техническое security-решение, не owner-gate.

## FORCE RLS в этом workstream

FORCE включается не отдельным слепым `ALTER TABLE`, а после remediation путей доступа и backfill в той же
поставке:

| таблица | tenant/owner predicate | prerequisite |
|---|---|---|
| `patient_bookings` | patient-own; staff current-org | добавить `organization_id`; backfill через `canonical_appointment_id → be_appointments`; orphan/ambiguous оставить fail-closed; убрать беспринципальные id-only reads |
| `appointment_records` | patient-own; staff current-org | добавить `organization_id`; canonical `be:<uuid>` связать с `be_appointments`; provider-orphan quarantine/fail-closed |
| `be_organization_members` | staff current-org | первичное self-membership lookup до principal вынести в exact capability |
| `platform_users` | patient self; staff users активных enrollment/membership current-org | login/signup/invite/merge оставить exact capabilities |
| `product_analytics_hourly` | non-null `organization_id` — current-org | строки с `organization_id IS NULL` оставить global и отдать только platform analytics/retention capability |
| `user_channel_bindings` | patient own | delivery/admin cross-user — operational capability |
| `user_channel_preferences` | patient own | staff read только при доказанной бизнес-нужде через active enrollment/membership |
| `user_notification_topic_channels` | patient own | reminder/delivery — operational capability |
| `user_notification_topics` | patient own | reminder/delivery — operational capability |
| `user_web_push_subscriptions` | patient own | endpoint/key material не выдавать прямым cross-user grant; delivery — operational capability |

Для patient predicate использовать `platform_user_id/user_id = app.current_patient_user_id()`. Для staff —
прямой `organization_id = app.current_organization_id()` либо связь через активные `org_enrollments` /
`be_organization_members`. Пустой principal видит zero rows. `WITH CHECK` совпадает с read predicate.

## Удалить, а не строить tenant-wall

`booking_branch_services`, `booking_branches`, `booking_services`, `booking_specialists` — мёртвый legacy:
runtime CRUD/admin routes уже удалены, остались schema/types/backrefs. Сначала убрать их из генератора broad grants
и отозвать app-role grants, затем убрать FK/backrefs из `patient_bookings` и drop/archive. Добавлять им новые org
колонки и policies не требуется.

`branches` — также кандидат на retirement, а не на новую стену. Точный поиск
`getByIntegratorBranchId|branches.upsertFromProjection|deps.branches` на актуальном коде находит только методы
`pgBranches.ts` и DI wiring `buildAppDeps.ts`; runtime consumers отсутствуют, старый projection-event удалён.
Сначала удалить мёртвый port/wiring и проверить FK/backrefs; только найденный живой consumer может обосновать
сохранение таблицы и тогда — org discriminator/capability. Строить backfill/RLS для неиспользуемой проекции нельзя.

## Capability/ACL, не tenant RLS

Pre-principal, exact-key и cross-tenant operational данные не получают прямых grants `app_staff` / `app_patient`:

`auth_rate_limit_events`, `booking_calendar_map`, `channel_link_secrets`, `email_challenges`, `email_otp_locks`,
`email_send_cooldowns`, `idempotency_keys`, `integration_webhook_error_events`,
`integration_webhook_last_status`, `integrator_push_outbox`, `login_tokens`, `operator_health_alert_sent`,
`operator_incidents`, `outgoing_delivery_queue`, `password_altcha_challenges`,
`password_login_identifier_protection`, `phone_challenges`, `phone_messenger_bind_secrets`, `phone_otp_locks`,
`reference_catalog_snapshot_receipts`, `specialist_signup_intents`, `staff_security_profiles`,
`user_email_setup_tokens`, `user_oauth_bindings`, `user_passkey_accounts`, `user_passkey_challenges`,
`user_passkey_credentials`, `user_password_credentials`, `user_pins`.

Их доступ — exact-key `SECURITY DEFINER` либо существующие узкие operational-роли. `user_pins` переводится с
прямого patient-grant на self-scoped set/verify capability. Для `reference_catalog_snapshot_receipts` уже есть
definer seed-шов; RLS понадобится только при появлении прямого tenant UI.

## Действительно глобальные

Tenant RLS не нужен; write/read ACL остаются минимальными:

`booking_cities`, `clinical_test_measure_kinds`, `media_playback_stats_hourly`,
`reference_catalog_baselines`, `saas_isolation_coverage_runs`, `saas_isolation_event_hourly`,
`saas_isolation_events`, `schema_migrations`, `webapp_schema_migrations`.

## Порядок реализации и enforcement gate

1. Убрать broad grants и завести необходимые exact capabilities, не меняя tenant-схему.
2. Добавить/штамповать `organization_id`, выполнить deterministic backfill; orphan/ambiguous rows fail closed.
3. Перевести беспринципальные и cross-org callers на capabilities/operational roles.
4. Добавить patient-own/staff-org policies с одинаковыми `USING`/`WITH CHECK`, затем ENABLE + FORCE RLS.
5. Расширить существующий disposable A1-контур named cases; отдельный `build-template` не создавать.
6. На TEST под реальными non-owner `app_*_login` доказать:
   - no principal → zero rows;
   - patient A → только A, patient B недоступен;
   - staff org A → вся org A, zero org B;
   - bootstrap → direct table denied, exact capabilities pass;
   - operational role → только назначенный queue/diagnostic surface;
   - SELECT и DML matrix;
   - `rolbypassrls=false`, `relrowsecurity=true`, `relforcerowsecurity=true`.

До этого прогона документ является рекомендацией, не PASS и не основанием закрыть В9б.

## Команды evidence независимого синтеза

```bash
node /home/dev/brain/tools/code-search.mjs "V9B group D FORCE RLS patient tables tenant isolation" --repo bcb -k 20
sed -n '161,215p' docs/_TODO/runs/testsuite-v2/V9B_WALL_RESEARCH_sol.md | rg -c '^\| `'
rg -n --glob '!**/*.test.*' --glob '!**/migrations/**' --glob '!**/db/drizzle-migrations/**' '\bappointment_records\b' apps packages deploy scripts
rg --files apps/webapp/src | rg 'pgBookingCatalog|pgRubitimeMapping|api/admin/booking-catalog|modules/booking-catalog'
```

Последняя команда вернула только `apps/webapp/src/modules/booking-catalog/types.ts`; старого runtime CRUD в
актуальном дереве нет. Файлы приложения, БД и серверы при синтезе не менялись.
