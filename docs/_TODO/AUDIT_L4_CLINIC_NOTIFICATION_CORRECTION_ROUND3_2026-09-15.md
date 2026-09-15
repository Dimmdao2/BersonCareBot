**PASS — MUST FIX 0.** Кандидат `cabb2fd92` проходит третий аудит Л4: под принципалом публичной двери путь делает один именованный DB-вызов, после него прямых реляционных чтений нет; корень и стена арендатора доказаны на живом `bcb_webapp_dev` внутри откатываемой транзакции. Красный `leadClinicNotificationProfiles.devDbProof.test.ts` возникает до SQL из-за отсутствующей в постоянном DEV способности неприменённой миграции; скрытого продуктового дефекта за этим отказом в разрешённом rollback-only контуре не найдено.

# Л4 «уведомление клиники о новой заявке» — третий аудит, 15.09.2026

- Предмет: ветка `wt/leads-notify`, HEAD до этого отчёта `fe86c1cda`, продуктовая коррекция `cabb2fd92`.
- Оракул: `docs/_TODO/LEADS_AND_COMMUNICATION_VISIBILITY_2026-09-14.md` §8.8 — клинику уведомляет `relayOutbound`, не старый глобальный relay заявок.
- Предыдущие отчёты и отчёт автора коррекции прочитаны как заявки, не как доказательства.
- Форма `v_organization_id := app.current_org_id()` не переоткрывалась: живой no-context вызов ниже подтверждает уже принятую механику — `42501` возникает во время инициализации локальной переменной, раньше тела.

## 1. Список всех чтений на пути

Фактическая цепочка после `LeadsService.submit`:

1. `notifyClinicLeadCreated` вызывает `clinicLeadNotificationProfiles.listForLeadOrganization`.
2. `pgClinicLeadNotificationProfiles` выполняет один `runWebappNamedRoot`:
   `SELECT app.read_clinic_lead_notification_profiles(uuid,text)`.
3. `notifyDoctorPatientMessageToStaff` получает `staffProfiles`; `patientStaffNotificationProfiles` не вызывается, `staffIds` берутся из профилей.
4. Для каждого получателя тема, channel preferences, Telegram/MAX binding и признак web-push берутся из того же профиля; ветка `Promise.all` с четырьмя реляционными портами не выполняется.
5. `resolveDoctorNotificationChannels` — чистое вычисление. `reportEmptyAudience` только логирует. `relayOutbound` читает URL и секрет из env и делает HTTP `fetch`; реляционного чтения там нет (`integrationRuntime.ts:13-19`, `relayOutbound.ts:83-128`).

Список до коррекции получен точной командой:

```bash
{ git show cabb2fd92^:apps/webapp/src/modules/leads/notifyClinicLeadCreated.ts | rg -n 'listForLeadOrganization|listActiveClinicAdminUserIds'; sed -n '144,149p' apps/webapp/src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.ts | rg -n 'deps\.|getChannelBindings'; }
```

Она печатает один прежний запрос аудитории и четыре per-user чтения:

```text
19:  const staffUserIds = await deps.staffUsers.listActiveClinicAdminUserIds(lead.organizationId);
2:          deps.topicChannelPrefs.listByUserId(userId),
3:          deps.channelPreferences.getPreferences(userId),
4:          deps.getChannelBindings(userId),
5:          deps.webPushSubscriptions.hasAnyForUserId(userId),
```

Итого прежний путь — 5 app-level DB-чтений; выбранный путь — 1. Первое число получено приведённой командой, второе — точным подсчётом:

```bash
rg -n "runWebappNamedRoot<" apps/webapp/src/infra/repos/pgClinicLeadNotificationProfiles.ts | wc -l
```

Результат: `1`.

Живой сохранённый тест после профиля:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp && set -a && source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev && set +a && USE_REAL_DATABASE=1 RUN_LEAD_CLINIC_NOTIFY_PATH_DB=1 pnpm exec vitest run --project fast src/modules/leads/leadClinicNotificationPath.devDbProof.test.ts"
```

Результат: `Test Files 1 passed (1)`, `Tests 1 passed (1)`; лог дошёл до `doctor_staff_notify.channels`, `selectedChannels: []`. Получатель намеренно недостижим, поэтому внешней отправки нет, но все настоящие закрытые реляционные порты подключены и ни один не вызван.

## 2. Поверхность прав: числа и обязательное уточнение

Проверка выполнена по вычисленной `declaration`, не по строке `REVOKE` из отчёта автора:

```bash
node --experimental-strip-types --input-type=module -e "import { declaration } from './deploy/postgres/privileges/declaration.ts'; const rels=['public.user_channel_bindings','public.user_channel_preferences','public.user_notification_topic_channels','public.user_web_push_subscriptions']; const db=declaration.databases.bcb_webapp_dev; const rawAcl=rels.filter((name)=>db.tables[name]?.grants.app_tenant_service); const caps=Object.values(declaration.portContext.capabilities); const relationCaps=caps.filter((c)=>c.targetRole==='app_tenant_service'&&c.contextClass==='tenant_service'&&c.purpose==='relation'); const leadCaps=caps.filter((c)=>c.targetRole==='app_tenant_service'&&c.functionIdentity==='app.read_clinic_lead_notification_profiles(uuid,text)'); console.log('raw_acl_relations='+rawAcl.length+':'+rawAcl.join(',')); console.log('tenant_service_relation_capabilities='+relationCaps.length); console.log('lead_named_root_capabilities='+leadCaps.length);"
```

Дословный результат:

```text
raw_acl_relations=4:public.user_channel_bindings,public.user_channel_preferences,public.user_notification_topic_channels,public.user_web_push_subscriptions
tenant_service_relation_capabilities=0
lead_named_root_capabilities=1
```

Поэтому таблица автора сходится только как таблица **эффективно достижимой port-context поверхности**:

| Метрика | Запрещённая развязка | Выбранная развязка | Вердикт |
|---|---:|---:|---|
| Новые прямые relation-capabilities к таблицам персонала | 4 | 0 | сходится |
| Способности пути | 5 (корень аудитории + 4 relation) | 1 named root | сходится |
| App-level DB-вызовы | 5 | 1 | сходится |
| Raw ACL самой роли `app_tenant_service` на четырёх таблицах | 4 | 4 | **не уменьшается этой веткой** |

Последняя строка — поправка к доказательству автора: его фраза «роль стоит в REVOKE, прямого пути нет» неполна, потому что ниже сгенерированный артефакт выдаёт роли column/table grants. Это не делает путь достижимым: relation-read требует отдельный принятый контекст `purpose='relation'`, а такой webapp-capability для `app_tenant_service` отсутствует. Живая инъекция возврата к прямым чтениям ниже падает до SQL с `Missing declared webapp port capability: tenant_service`.

Миграция прав не содержит. Точное измерение:

```bash
rg -n '^\s*(GRANT|REVOKE|CREATE POLICY|ALTER DEFAULT PRIVILEGES|CREATE ROLE|ALTER ROLE)\b' apps/webapp/db/drizzle-migrations/20260915T140000_lead_notification_profiles_root.sql | wc -l
```

Результат: `0`. Права и capability живут только в `deploy/postgres/privileges/declaration.ts`.

## 3. Красный файл: причина проверена, отговорка подтверждена

Штатный прогон постоянного DEV:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp && set -a && source /home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev && set +a && USE_REAL_DATABASE=1 RUN_LEAD_CLINIC_AUDIENCE_DB=1 pnpm exec vitest run --project fast src/infra/repos/leadClinicNotificationProfiles.devDbProof.test.ts"
```

Результат: `Test Files 1 failed (1)`, `Tests 2 failed (2)`. Оба сценария останавливаются в `portContextRuntime.ts:301` с единственной первичной причиной:

```text
Missing unique declared webapp port capability for app.read_clinic_lead_notification_profiles(uuid,text)
```

То есть красный возникает до отправки SQL и ничего не говорит о теле корня.

Штатный owner-aware preflight точного candidate checkout:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-org-gate && bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot"
```

Результат: `CREATE FUNCTION`, затем `ROLLBACK`, `pending=1`, `migrate-dev preflight: PASS`.

Живое поведение проверено `docs/_TODO/L4_LEAD_NOTIFICATION_PROFILES_ROOT_PROBE_2026-09-15.sql`: функция создаётся в транзакции, owner/ACL/RLS/capability берутся из candidate declaration, вызов идёт как `session_user=bcb_dev_webapp_staff`, `current_user=app_tenant_service`. Команда:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-org-gate && set +e; probe_out=\$(sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -f docs/_TODO/L4_LEAD_NOTIFICATION_PROFILES_ROOT_PROBE_2026-09-15.sql 2>&1); probe_rc=\$?; set -e; printf '%s\n' \"\$probe_out\"; test \"\$probe_rc\" -eq 3; printf '%s\n' \"\$probe_out\" | rg -F '\"code\": \"lead_notification_organization_mismatch\"'; printf '%s\n' \"\$probe_out\" | rg -F 'accepted organization context required'"
```

Результат команды — exit `0`: своя клиника вернула `ok: true` с профилями и Telegram binding; чужая — `lead_notification_organization_mismatch`; неподдерживаемая тема — `unsupported_lead_notification_topic`; без контекста — `accepted organization context required`. Внутренний `psql` имеет exit `3` на ожидаемом последнем `42501`; разрыв соединения откатывает открытую транзакцию.

Отсутствие следов и постоянного применения измерено отдельно:

```bash
/home/dev/brain/host-orch/run-tests.sh "sudo -n -u postgres psql -X -h /var/run/postgresql -p 5432 -d bcb_webapp_dev -v ON_ERROR_STOP=1 -Atqc \"SELECT to_regprocedure('app.read_clinic_lead_notification_profiles(uuid,text)') IS NULL, (SELECT count(*) FROM public.platform_users WHERE display_name LIKE 'AUDITL4 %'), (SELECT count(*) FROM public.be_organizations WHERE id = 'a4000000-0000-4000-8000-00000000f0b0'::uuid), (SELECT count(*) FROM public.user_channel_bindings WHERE external_id = 'AUDITL4-tg-own-admin'), (SELECT count(*) FROM app_ext.port_context_capabilities WHERE purpose = 'leads.clinic-notification-profiles.read');\""
```

Результат: `t|0|0|0|0` — функции, фикстур и capability в постоянном DEV нет.

Совокупность доказательств подтверждает объяснение: сохранённый devDbProof красный из-за неприменённых migration + env capability, а не из-за дефекта candidate root.

## 4. Стена арендатора и fault injection

| Инъекция | Команда/наблюдение | Результат |
|---|---|---|
| И1. В `notifyClinicLeadCreated` `staffProfiles` временно заменён на `staffUserIds: staffProfiles.map(...)` | Повторён живой `RUN_LEAD_CLINIC_NOTIFY_PATH_DB=1` прогон из §1 | Красный: `Test Files 1 failed (1)`, первое чтение `user_notification_topic_channels`, затем `Missing declared webapp port capability: tenant_service`. Прямой fan-out пойман. |
| И2. Из candidate root и его rollback-probe временно удалён только `p_organization_id IS DISTINCT FROM v_organization_id` mismatch-блок | Повторена команда probe из §3 с обязательным `rg` по `lead_notification_organization_mismatch` | Внешняя команда exit `1`: чужой запрос вернул `ok: true` и профили принятой своей клиники; ожидаемый код исчез. Стена имеет зубы. |
| И3. В `LeadsService.submit` `void notify(...).catch(report)` временно заменён на `await notify(...)` | `/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp && pnpm exec vitest run --project unit src/modules/leads/service.unit.test.ts"` | Красный: `Test Files 1 failed (1)`, `Tests 1 failed | 2 passed (3)`; созданная заявка стала отклоняться ошибкой канала. Д2 имеет зубы. |

После каждой инъекции production-файлы возвращены. `git diff --check; git status --short; git diff -- apps/webapp/src/modules/leads/notifyClinicLeadCreated.ts apps/webapp/src/modules/leads/service.ts apps/webapp/db/drizzle-migrations/20260915T140000_lead_notification_profiles_root.sql docs/_TODO/L4_LEAD_NOTIFICATION_PROFILES_ROOT_PROBE_2026-09-15.sql` не напечатала ничего.

No-context сценарий не требует отдельной мутации: baseline probe получил `42501 accepted organization context required` во время `current_org_id()` local-variable initialization, то есть дверь закрылась раньше тела.

## 5. Д2 и Д3 не откатились

Д2, зелёный baseline:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp && pnpm exec vitest run --project unit src/modules/leads"
```

Результат: `Test Files 2 passed (2)`, `Tests 4 passed (4)`. Инъекция И3 выше красит именно сохранённый oracle отказа канала.

Д3 проверен взглядом, без запрещённого теста текста: `notifyClinicLeadCreated.ts:43` строит `notificationUrl` как `${env.APP_BASE_URL.replace(/\/$/, '')}/app/doctor/communications?tab=leads`; `nativeRoute` остаётся отдельным относительным полем. Значит Telegram/MAX получают абсолютный URL, а native push — маршрут приложения.

Регресс общего sender-path:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp && pnpm exec vitest run --project fast src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.acceptance.test.ts && pnpm exec vitest run --project unit src/modules/messaging/notifyDoctorPatientNotifications.unit.test.ts"
```

Результат: оба запуска зелёные, в каждом `Test Files 1 passed (1)`, `Tests 2 passed (2)`.

## 6. Статические гейты

Через общий замок выполнено:

```bash
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-org-gate && node deploy/postgres/privileges/generate-cli.mjs --all --check && node deploy/postgres/privileges/generate-cli.mjs --all --check --port-context-only && node scripts/check-migration-privileges.mjs && node scripts/check-c4-migration-owned-function-bodies.mjs"
/home/dev/brain/host-orch/run-tests.sh "cd /home/dev/dev-projects/bcb-wt-merge-org-gate/apps/webapp && bash scripts/check-drizzle-migration-order.sh"
```

Обе команды exit `0`; артефакты совпадают с declaration, migration privileges и owned bodies — OK, migration order — OK.

Прямо, как разрешено брифом:

```bash
cd apps/webapp && pnpm exec eslint src/app-layer/di/buildAppDeps.ts src/infra/repos/leadClinicNotificationProfiles.devDbProof.test.ts src/infra/repos/pgClinicLeadNotificationProfiles.ts src/infra/repos/pgPatientStaffNotificationProfiles.ts src/infra/repos/pgStaffUsers.ts src/infra/repos/staffNotificationProfilePayload.ts src/modules/admin-incidents/sendAdminIncidentStaffWebPush.unit.test.ts src/modules/doctor-notifications/notifyDoctorPatientMessageToStaff.ts src/modules/doctor-notifications/patientStaffNotificationProfilesPort.ts src/modules/doctor-notifications/staffNotificationProfile.ts src/modules/doctor-notifications/staffUsersPort.ts src/modules/leads/clinicNotificationProfilesPort.ts src/modules/leads/leadClinicNotificationPath.devDbProof.test.ts src/modules/leads/notifyClinicLeadCreated.ts src/modules/leads/notifyClinicLeadCreated.unit.test.ts src/modules/operator-alerts/dispatchOperatorAlert.envLabel.unit.test.ts src/modules/operator-alerts/dispatchOperatorAlert.testMode.unit.test.ts
```

Exit `0`, вывод пуст. Число файлов получено командой `git diff --name-only cabb2fd92^..cabb2fd92 | rg '^apps/webapp/src/.*\.ts$' | wc -l`, результат `17`.

`cd apps/webapp && pnpm exec tsc --noEmit` остаётся красным на постороннем состоянии сборки `@bersoncare/platform-merge`: ошибки только в `pgPatientMergeCandidate.ts` и `pgPlatformUserMerge.ts`; эти файлы не входят в `git diff --name-only cabb2fd92^..cabb2fd92`.

## НЕ СДЕЛАНО

- Полный CI (`pnpm run ci`, `scripts/ci-record.mjs`) не запускался — запрещён брифом.
- Миграция на DEV по-настоящему не применялась; `migrate-dev.sh --execute` не запускался.
- Постоянный devDbProof нового корня не делался зелёным подменой `.env.dev`: файл остаётся ожидаемо красным до штатного execute после landing.
- Сквозной HTTP-сценарий публичной отправки заявки не запускался: rollback-only DB root и путь sender после профиля проверены отдельно.
- Внешняя Telegram/MAX/web-push доставка не инициировалась; test fixture не имеет достижимого канала, а SQL-probe отправку не вызывает.
- Второй Next-сервер не поднимался. TEST и PROD не затрагивались.
- Строка очереди в `feat` не изменялась.

## Строка вердикта для ведущего

```text
PASS Л4 «уведомление клиники о новой заявке», коррекция круга 2 cabb2fd92: под принципалом публичной двери путь сведён с 5 app-level DB-чтений к 1 named root; живой path-test зелёный и краснеет при возврате к staffUserIds. Root проходит owner-aware rollback-only preflight; под bcb_dev_webapp_staff → app_tenant_service своя клиника получает профили, чужая — lead_notification_organization_mismatch, без контекста — 42501; снятие org-boundary красит probe. Д2 зелёный и краснеет при await отказавшего канала; Д3 сохраняет абсолютный URL. Уточнение поверхности: raw ACL app_tenant_service на 4 notification-отношениях уже есть, но webapp relation-capability для tenant_service = 0; достижима только 1 capability нового named root. Полный CI и execute миграции не запускались.
```
