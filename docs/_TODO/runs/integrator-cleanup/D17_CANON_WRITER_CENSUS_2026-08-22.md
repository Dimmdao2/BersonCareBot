# D17 — перепись писателей канона в интеграторе и разбор сужения декларации (22.08.2026)

Голова: `34b7908d2` (ветка `wt/d17-narrow-role-20260822` от `feat/doctor-ui-rebuild`, D25 уже приземлён).

**Итог одной строкой: Шаг 1 дал НЕ чистый результат — живые реляционные писатели продуктового канона
в интеграторе есть, поэтому Шаг 2 (сужение декларации) НЕ начат.** Отдельно: разбор показал, что сужать
в декларации нечего — цель D17 на роли `app_integrator_request` уже выполнена, а остаточная широта живёт
не в её грантах, а в членствах логина и в оверлее мимо генератора (§3).

---

## 1. Как искал (правило «нет без списка мест, где искал»)

```bash
node /home/dev/brain/tools/code-search.mjs "integrator direct public write canon table INSERT UPDATE support reminder" --repo bcb -k 8

# сырой SQL: любая запись, любая таблица (не только канон)
grep -rnEi "(INSERT[[:space:]]+INTO|UPDATE[[:space:]]+[a-z_.\"]+[[:space:]]+SET|DELETE[[:space:]]+FROM)" \
  apps/integrator/src --include=*.ts | grep -v '\.test\.' | grep -v '__tests__'

# Drizzle: .insert(/.update(/.delete( с реальным символом таблицы
grep -rnoE "\.(insert|update|delete)\(\s*[a-zA-Z][a-zA-Z0-9_]*" apps/integrator/src --include=*.ts

# оба слоя доступа поимённо
grep -rn "runIntegratorNamedRoot(\|runIntegratorSql(" apps/integrator/src --include=*.ts
grep -rhoE "app\.[a-z_0-9]+\(" apps/integrator/src --include=*.ts | sort -u   # 62 именованных корня

# SELECT … FOR UPDATE / FOR SHARE (нужна табличная привилегия модификации)
grep -rn "FOR UPDATE\|FOR SHARE" apps/integrator/src --include=*.ts

# отдельная проверка на канон-таблицы, которых в интеграторе НЕТ вовсе
grep -rn "email_challenges\|user_identity\|user_phone_history\|user_channel_preferences\|\
user_notification_topics\|be_appointments\|patient_bookings\|treatment_program_instances" apps/integrator/src
```

Достижимость считал транзитивным замыканием импортов от трёх точек входа
(`src/main.ts`, `src/infra/runtime/scheduler/main.ts`, `src/infra/db/migrate.ts`; `package.json`
`start` / `scheduler:start` / `db:migrate`) — 223 файла. Импорт ≠ вызов, поэтому каждая функция
дополнительно проверена на наличие живого caller-а по всему репозиторию.

Схему каждой Drizzle-таблицы разрешал по определению символа: `integratorSchema.table(...)` = своё,
`publicSchema.table(...)` / `pgTable(...)` = канон (`infra/db/schema/integratorDomainRepos.ts`,
`infra/db/schema/integratorPublicProduct.ts`, `packages/operator-db-schema/src/operatorHealth.ts`).

---

## 2. Шаг 1 — перепись

### 2.1. Разрешённый путь: именованные корни `app.*` (SECURITY DEFINER) — 8 вызовов

| path:line | корень | пишет |
|---|---|---|
| `directPublic/writeIdentityAndPreferencesDirect.ts:47` | `app.integrator_upsert_channel_identity(text,text,text)` | `platform_users`, `user_contacts` |
| `directPublic/bootstrapMessengerPhoneBind.ts:35` | `app.integrator_bind_bootstrap_channel_phone(text,text,text,uuid)` | привязка телефона |
| `directPublic/writeReminderProjectionDirect.ts:50` | `app.record_reminder_occurrence_finalized_projection(...)` | проекция финализации напоминания |
| `repos/operatorDeliveryAttempts.ts:56` | `app.record_operator_delivery_attempt(...)` | журнал попыток доставки |
| `repos/outgoingDeliveryScope.ts:71` | `app.mark_operator_incident_alert_sent(...)` | инцидент оператора |
| `repos/bookingCalendarMap.ts:22,37` | `app.upsert/delete_google_calendar_event_id(...)` | привязка события календаря |
| `repos/integrationWebhookStatusDrizzle.ts:26` | `app.record_integrator_webhook_outcome(...)` | статус вебхука |
| `repos/idempotencyKeys.ts:42` | `app.try_acquire_integrator_idempotency(...)` | своя идемпотентность |

Это разрешённая форма — записи канона тут нет, есть вызов корня.

### 2.2. Реляционные писатели ПРОДУКТОВОГО канона — есть, все живые

| # | path:line | таблица | живой маршрут | статус для D17 |
|---|---|---|---|---|
| 1 | `directPublic/writeReminderRulesDirect.ts:154` (+`:198` DELETE `integrator.user_reminder_occurrences`) | `public.reminder_rules` | HTTP `reminderRulesRoute.ts:165` (`reminders.rule.upsert`, зарегистрирован `app/routes.ts:177`) → `writePort.ts:468`; повтор — `directPublicWriteRetryWorker.ts:71` | **БЛОКЕР** — канон напоминаний |
| 2 | `directPublic/writeReminderProjectionDirect.ts:80` | `public.reminder_delivery_events` | воркер доставки `outgoingDeliveryWorker.ts:526,633,927` (`reminders.delivery.log`) → `writePort.ts:698`; повтор — `directPublicWriteRetryWorker.ts:98` | **БЛОКЕР** — канон напоминаний |
| 3 | `directPublic/writeReminderProjectionDirect.ts:97` | `public.content_access_grants_webapp` | `protectedAccessPort.ts:47` (`content.access.grant.create`, собран в `app/di.ts:270`) → `writePort.ts:759`; повтор — `directPublicWriteRetryWorker.ts:103` | **БЛОКЕР** — доступы пациента к контенту |
| 4 | `directPublic/writeSupportQuestionsDirect.ts:285` | `public.support_delivery_events` | `outgoingDeliveryWorker.ts:561` (`delivery.attempt.log`) → `writePort.ts:908`; повтор — `directPublicWriteRetryWorker.ts:74` | **БЛОКЕР** — канон поддержки |
| 5 | `repos/notificationDeliveryAttempts.ts:67` | `public.notification_delivery_attempts` | HTTP `relayOutboundRoute.ts:337,383` | **БЛОКЕР** — журнал доставки уведомлений (класс P) |
| 6 | `runtime/worker/outgoingDeliveryWorker.ts:268,284,987` | `public.broadcast_audit` (UPDATE счётчиков) | тот же воркер доставки | **БЛОКЕР** — клиентский журнал рассылок (класс C) |
| 7 | `repos/userChannelBotBlocked.ts:45,56,67,86,97` | `public.user_channel_bindings` | `outgoingDeliveryWorker.ts:72` (пометка `bot_blocked`) | **не блокер** — бриф относит «привязки каналов» к «своему» |
| 8 | `repos/messengerPhoneBindAudit.ts:116 (FOR UPDATE), :120, :133, :143, :153` | `public.admin_audit_log` | `writePort.ts:321` (`admin-audit-write`) | пограничное — служебный журнал (класс S), не продуктовый канон; см. §4 |

Единственная остаточная запись из переписи K1 аудита D25 (`userChannelBotBlocked.ts`) на месте и по-прежнему
единственная в identity/контактах: ни `platform_users`, ни `user_contacts`, ни `email_challenges`,
ни `user_identity`/`user_phone_history`/`user_channel_preferences`/`user_notification_topics` из
`apps/integrator/src` реляционно не пишутся вовсе (`email_challenges` — ноль упоминаний в интеграторе).
Число выросло не из-за D25, а из-за более широкого скоупа переписи: K1 смотрел идентичность и контакты,
здесь — весь продуктовый канон (поддержка, напоминания, доступы к контенту, журналы доставки).

### 2.3. Мёртвое — доказано, что вызывающих нет

- `directPublic/writeSupportQuestionsDirect.ts:144` `createSupportQuestionDirect` → `public.support_questions`
- `directPublic/writeSupportQuestionsDirect.ts:197` `appendSupportQuestionMessageDirect` → `public.support_question_messages`
- `directPublic/writeSupportQuestionsDirect.ts:235` `markSupportQuestionAnsweredDirect` → UPDATE `public.support_questions`

Файл достижим (его четвёртый экспорт живой), но у этих трёх функций **ноль** вызовов во всём репозитории:
```bash
grep -rn "\bcreateSupportQuestionDirect\b" --include=*.ts --include=*.mjs --include=*.js . \
  | grep -v node_modules | grep -v /dist/ | grep -v writeSupportQuestionsDirect.ts   # пусто, и так по всем трём
```
Проверено вместе с `e2e/`, `tools/`, `scripts/`. Никакой тест их тоже не зовёт.

- `infra/scripts/reconcile-dev-patient-reminder-orphans.ts:69` — UPDATE `public.reminder_rules` через Drizzle.
  Мёртв для рантайма: в замыкание импортов от `main.ts` / `scheduler/main.ts` / `migrate.ts` не входит,
  запускается только вручную (`pnpm reconcile:dev-patient-reminder-orphans`, dev-инструмент).

### 2.4. Своё (не канон) — записи разрешены и остаются

`integrator.user_reminder_occurrences`, `integrator.user_reminder_delivery_logs`,
`integrator.content_access_grants`, `integrator.direct_public_write_retries`,
`integrator.outgoing_delivery_queue` / `job_queue`, `integrator.idempotency_keys`,
`integrator.schema_migrations`.

---

## 3. Шаг 2 — НЕ начат, и разбор прав объясняет почему сужать нечего

Шаг 2 не начат по границе задания: §2.2 нашёл живых реляционных писателей канона, сужение уронило бы
ровно их. Но разбор по §1 AGENTS.md («какие права нужны, чтобы тело **исполнилось**») дал вывод сильнее
простого «стоп» — **на роли интегратора цель D17 уже достигнута, а оставшаяся широта декларацией не правится.**

**Факт 1. `app_integrator_request` имеет РОВНО 6 табличных грантов, все в схеме `integrator`.**
`deploy/postgres/generated/privileges.bcb_webapp_dev.sql`:
```
10019: GRANT INSERT (cols) ON TABLE "integrator"."direct_public_write_retries"
10225-10226: GRANT SELECT/INSERT (cols) ON TABLE "integrator"."user_reminder_delivery_logs"
10262-10264: GRANT DELETE/SELECT/UPDATE ON TABLE "integrator"."user_reminder_occurrences"
```
На `public.*` — **ноль** табличных прав. Формулировка D17 «не иметь табличных прав записи на продуктовый
канон» на этой роли выполнена; строки, которую можно сузить, в декларации нет.

**Факт 2. Широта живёт в членствах логина, а не в канонической роли.**
`declaration.ts:1851-1854` и `:1871-1874`: `bcb_dev_integrator` / `bcb_test_integrator` — члены
`app_integrator_request`, `app_integrator_resolver`, `app_operational_delivery_worker`,
`app_operational_scheduler`, **`app_tenant_service`**, `app_service`.
Все прямые записи из §2.2 идут через capability `integrator_tenant_service_relation`
(`declaration.ts:2395-2397`, `targetRole: 'app_tenant_service'`): `writeDirectPublic` со стратегией
`organization` (`infra/db/directPublic/writePort.ts:52-60`) → `runWithOrganizationPrincipal` →
`portContextRuntime.ts` выбирает `tenant_service`.

`app_tenant_service` — роль **вебаппа**, у неё 132 табличных гранта, включая запись на продуктовом каноне:
`reminder_rules` (INSERT+UPDATE+DELETE), `support_questions`/`support_question_messages`/
`support_delivery_events`/`support_conversations`, `platform_users`, `user_contacts`, `user_identity`,
`user_channel_bindings`, `notification_delivery_attempts`, `broadcast_audit` (UPDATE счётчиков),
`content_access_grants_webapp` (UPDATE `platform_user_id`).

Разложение шести блокеров §2.2 по ролям, которыми они сегодня исполняются (по грантам в том же файле):

| таблица | единственная роль логина интегратора, у которой есть нужный грант |
|---|---|
| `public.reminder_rules` | `app_tenant_service` (INSERT+UPDATE+DELETE) |
| `public.support_delivery_events` | `app_tenant_service` (INSERT) |
| `public.broadcast_audit` | `app_tenant_service` (UPDATE `sent_count`/`error_count`/`blocked_recipient_count`) |
| `public.notification_delivery_attempts` | `app_tenant_service` (INSERT, DELETE) |
| `public.user_channel_bindings` (§2.2 п.7) | `app_tenant_service` (INSERT, UPDATE, DELETE) |
| `public.reminder_delivery_events` | `app_operational_delivery_worker` (SELECT+INSERT) |
| `public.content_access_grants_webapp` | `app_operational_delivery_worker` (SELECT+INSERT+UPDATE) |

Отсюда: сузить = снять у логина интегратора членства в `app_tenant_service` **и**
`app_operational_delivery_worker`. Это уронит все шесть живых путей §2.2 (`42501` на первом же вызове) —
правило 5.1.1 WORK_ORDER описывает именно этот сценарий. Сузить сами эти роли нельзя: `app_tenant_service` —
роль вебаппа, которой он и живёт.

**Факт 3. Третья дверь — мимо генератора, декларацией не закрывается.**
`deploy/postgres/integrator-login-public-identity-grants.sql` всё ещё ставится деплоем TEST
(`deploy/host/deploy-test-saas.sh:840-848`, вызовы на `:1963` и `:2119`) и выдаёт **логину** интегратора
напрямую:
```
:310,327,333,349,375,376,424,461  GRANT SELECT ON public.{platform_users, user_channel_bindings,
                                    user_channel_preferences, be_organization_members, org_enrollments,
                                    be_organizations, support_conversations, support_questions}
:432                              GRANT UPDATE ("conversation_id") ON public.support_conversation_messages
```
Это запись в канон поддержки, выданная вне `deploy/postgres/privileges/`. ⚠️ Уточнение 22.08: оверлей снят и на живом TEST его гранты не действовали. Пока оверлей был в цепочке деплоя,
правка декларации фактическую широту роли на TEST не меняет. Тот же файл уже помечен в декларации как
подлежащий снятию — `declaration.ts:191-194` (`CODE_MUST_CHANGE` C4).

**Факт 4. `SELECT … FOR UPDATE`, который бриф просил смотреть отдельно.**
`repos/messengerPhoneBindAudit.ts:116` берёт `SELECT … FOR UPDATE` на `public.admin_audit_log` — то есть
требует табличной привилегии модификации. См. §4: её сегодня нет ни у одной роли логина интегратора.

### Baseline-проверки (декларация не менялась)

```
node deploy/postgres/privileges/generate-cli.mjs --all --check   → EXIT=0, 4/4 артефакта совпадают побайтно
node deploy/postgres/privileges/generate-cli.mjs --census        → EXIT=0, 217 ACTIVE relations × 3242 файла
```
Это подтверждает, что разобранный выше `privileges.bcb_webapp_dev.sql` — ровно то, что породит декларация.

`bash deploy/host/migrate-dev.sh --preflight` **не гонял**: в ветке нет ни миграций, ни правок декларации,
preflight проверял бы неизменённое дерево и на время прогона занял бы общую именованную DEV. Как только
появится реальная правка декларации — preflight обязателен.

---

## 4. Наблюдения БЕЗ работы (§24.6 — вопрос ведущему, не мой скоуп)

Ни одно из этих не имеет пункта в план-файле владельца, поэтому работу из них не завожу.

1. **`public.admin_audit_log` недостижим для интегратора уже сегодня.** `recordMessengerPhoneBindBlocked`
   (`writePort.ts:321`, стратегия `admin-audit-write` → `organization` → `app_tenant_service`) делает
   `SELECT … FOR UPDATE` + INSERT/UPDATE на `public.admin_audit_log`. В сгенерированной декларации гранты
   на эту таблицу есть только у `app_clinic_billing`, `app_platform_settings` и четырёх seam-владельцев —
   **ни у одной** роли из членств логина интегратора. Вызов обёрнут в `void` + `try/catch`, поэтому
   отказ уходит в `logger.error` и наружу не виден. Это выглядит как существующий дефект, а не как
   следствие сужения. Проверять живьём не стал: скоуп задания — перепись и декларация.
2. **Три мёртвых writer-а поддержки** (§2.3) — кандидаты на удаление вместе с их SQL, но удаление кода
   в скоуп D17 не входит.
3. **`repos/operatorHealthDrizzle.ts:94,241,320`** пишет Drizzle-ом в `public.operator_incidents` /
   `public.operator_job_status`. Это телеметрия оператора (класс S), не продуктовый канон, поэтому в
   перепись §2.2 не включено. Гранты там только у `app_worker` и `app_seam_telemetry_operator_owner` —
   в членствах логина интегратора их нет. Тот же класс вопроса, что и п.1.

---

## 5. Что осталось до закрытия D17

Порядок, вытекающий из §2.2 и §3 (не новый скоуп — это уже перечисленные в WORK_ORDER предусловия):

1. Перенести владение шестью путями §2.2 в вебапп по форме 5.1.2 (или перевести их на именованные корни) —
   до тех пор членства `app_tenant_service` и `app_operational_delivery_worker` снять нельзя.
2. ~~Снять оверлей `integrator-login-public-identity-grants.sql` из цепочки TEST-деплоя (`CODE_MUST_CHANGE` C4).~~
   ✅ **СДЕЛАНО 22.08 по решению владельца, и оценка «оверлей ставит деплой мимо генератора» ОПРОВЕРГНУТА
   фактом.** `deploy-test.sh`, которым TEST выкатывается сегодня, оверлей не вызывал вовсе — он был только в
   `deploy-test-saas.sh`; и на живом TEST у `bcb_test_integrator` **ноль** прямых грантов на `public.*`
   (`information_schema.role_table_grants`), потому что reconcile декларации отзывает всё необъявленное.
   То есть второго источника прав не было — был мёртвый файл. Снят целиком вместе с обеими точками вызова,
   записью в самотесте и FATAL-проверкой; сам SQL удалён.
3. Только после (1) и (2) — снять эти два членства у логина интегратора в `declaration.ts`,
   прогнать `generate-cli.mjs --all` + `--check`, `migrate-dev.sh --preflight` и поведенческие тесты
   привилегий (отказ роли на запрещённой записи, успех на разрешённой).

**НЕ СДЕЛАНО:** Шаг 2 (сужение декларации) — по границе задания, §2.2 нашёл живых реляционных писателей
канона. Тесты привилегий не писал: декларация не менялась, проверять нечего. Живой прогон на TEST в объём
не входил. Галочку D17 в WORK_ORDER не ставил.
