# D17 — узкая роль интегратора достигает корней приёма и доставки

Дата проверки: 2026-08-23. Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт D17 — «узкая роль интегратора не мешает доставке». Исполнительский brief фактически лежит в `docs/_TODO/runs/briefs/D17_INTEGRATOR_LOST_EXECUTE_BRIEF_2026-08-23.md` (указанный в старой ссылке путь `runs/briefs/...` в этом worktree отсутствует).

## Итог

Регрессия закрыта в declaration/generated/migration/test-пакете salvage-коммита `132de6191`: узкая роль `app_integrator_tenant_service` получила только три необходимые function-двери, без табличных прав на медицинский канон. Два settings-корня сужены до одной узкой роли только после отдельной проверки отсутствия webapp-вызывающего. Общий mechanic-корень сохранил все прежние роли и получил узкую роль дополнительно.

TEST, PROD, `--execute`, push и галочки плана не затрагивались. Проверка БД выполнена только на именованной DEV `bcb_webapp_dev` внутри `BEGIN ... ROLLBACK`.

## Метод переписи

1. Список кандидатов взят из owner-provided каталожного запроса TEST в brief; TEST повторно не запрашивался из-за прямого запрета текущего хода. Число строк перепроверено командой:

   ```bash
   sed -n '/^app.commit_patient_reminder_materialization/,/^app.resolve_organization_mechanic_access/p' docs/_TODO/runs/briefs/D17_INTEGRATOR_LOST_EXECUTE_BRIEF_2026-08-23.md | rg -c '^app\.'
   ```

   Результат: `15`.

2. Для всех имён выполнен точный поиск production-вызовов по обоим приложениям (тесты исключены при классификации):

   ```bash
   rg -n --glob '*.{ts,tsx,mjs,js}' 'commit_patient_reminder_materialization|list_public_booking_form_fields|read_integrator_clinic_delivery_credential|read_integrator_delivery_target_snapshot|read_integrator_google_calendar_setting|read_integrator_web_push_delivery_settings|read_integrator_web_push_subscriptions|read_patient_reminder_delivery_target_snapshot|read_patient_reminder_materialization_snapshot|read_public_booking_catalog|read_public_booking_slot_snapshot|record_integrator_support_delivery_attempt|record_reminder_occurrence_finalized_projection|replace_appointment_reminder_generation|resolve_organization_mechanic_access' apps/integrator/src apps/webapp/src deploy/postgres/privileges
   ```

3. Для двух суженных roots отсутствие webapp-вызова перепроверено отдельно:

   ```bash
   rg -n --glob '*.{ts,tsx,mjs,js}' 'app\.read_integrator_(clinic_delivery_credential|google_calendar_setting)' apps/webapp/src
   node /home/dev/brain/tools/code-search.mjs "read_integrator_clinic_delivery_credential caller webapp" --repo bcb -k 20
   node /home/dev/brain/tools/code-search.mjs "read_integrator_google_calendar_setting caller webapp" --repo bcb -k 20
   bash /home/dev/brain/tools/codeq.sh "webapp caller of read_integrator_clinic_delivery_credential or read_integrator_google_calendar_setting" --repo bcb --semantic --k 20
   rg -n 'app\.read_integrator_(clinic_delivery_credential|google_calendar_setting)' deploy/postgres/privileges/declaration.ts deploy/postgres/privileges/function-census.ts
   ```

   Exact search по `apps/webapp/src` вернул пустой результат. Индексный поиск нашёл production-вызовы только в integrator; смысловой поиск не нашёл webapp-вызывающего. Обратные ссылки есть только в declaration/census и integrator runtime/config documentation.

## Перепись 15 корней

«Обеих не хватает» ниже означает исходное несоответствие именно узкой роли: нет ни `EXECUTE`, ни её имени в attested-гейте. Для roots, которым узкая роль по фактическому вызывающему не нужна, это не дефект.

| Корень | Production-вызывающий (`файл:строка`) | Исходно для узкой роли | Что сделано |
| --- | --- | --- | --- |
| `app.commit_patient_reminder_materialization(...)` | `apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts:116` | Узкая дверь не нужна | Оставлено как есть: зовёт только webapp под `app_tenant_service` |
| `app.list_public_booking_form_fields()` | `apps/webapp/src/infra/repos/pgBookingForm.ts:53` | Узкая дверь не нужна | Оставлено как есть: зовёт только webapp/public booking |
| `app.read_integrator_clinic_delivery_credential(...)` | `apps/integrator/src/infra/db/publicSystemSettings.ts:140` | Не хватало обоих | Сужено до одной роли: grant и gate теперь только `app_integrator_tenant_service` |
| `app.read_integrator_delivery_target_snapshot(...)` | `apps/webapp/src/infra/repos/pgIntegratorDeliveryTargets.ts:89` | Узкая дверь не нужна | Оставлено как есть: несмотря на имя, зовёт только webapp-порт |
| `app.read_integrator_google_calendar_setting(...)` | `apps/integrator/src/infra/db/publicSystemSettings.ts:172,191` | Не хватало обоих | Сужено до одной роли: grant и gate теперь только `app_integrator_tenant_service` |
| `app.read_integrator_web_push_delivery_settings(...)` | `apps/webapp/src/infra/repos/pgIntegratorWebPushDelivery.ts:62` | Узкая дверь не нужна | Оставлено как есть: зовёт только webapp-порт |
| `app.read_integrator_web_push_subscriptions(...)` | `apps/webapp/src/infra/repos/pgIntegratorWebPushDelivery.ts:44` | Узкая дверь не нужна | Оставлено как есть: зовёт только webapp-порт |
| `app.read_patient_reminder_delivery_target_snapshot(...)` | `apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts:92` | Узкая дверь не нужна | Оставлено как есть: зовёт только webapp |
| `app.read_patient_reminder_materialization_snapshot(...)` | `apps/webapp/src/infra/repos/pgPatientReminderMaterialization.ts:73` | Узкая дверь не нужна | Оставлено как есть: зовёт только webapp |
| `app.read_public_booking_catalog(...)` | `apps/webapp/src/infra/repos/pgBookingEngine.ts:299` | Узкая дверь не нужна | Оставлено как есть: зовёт только webapp/public booking |
| `app.read_public_booking_slot_snapshot(...)` | `apps/webapp/src/infra/repos/pgBookingScheduling.ts:186` | Узкая дверь не нужна | Оставлено как есть: зовёт только webapp/public booking |
| `app.record_integrator_support_delivery_attempt(...)` | integrator: `apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts:95`; webapp: `apps/webapp/src/infra/repos/pgIntegratorSupportQuestionOwnership.ts:140` | Узкая дверь не нужна | Оставлено как есть: webapp сохраняет `app_tenant_service`, integrator уже входит через отдельную capability `app_integrator_request`; выдача третьей роли расширила бы стену без нужды |
| `app.record_reminder_occurrence_finalized_projection(...)` | integrator: `apps/integrator/src/infra/db/directPublic/writeReminderProjectionDirect.ts:66`; webapp: `apps/webapp/src/infra/repos/pgReminderProjection.ts:83` | Узкая дверь не нужна | Оставлено как есть: webapp сохраняет `app_tenant_service`, integrator имеет отдельные двери `app_integrator_request`/`app_operational_delivery_worker` |
| `app.replace_appointment_reminder_generation(...)` | `apps/webapp/src/infra/repos/pgAppointmentReminderMaterialization.ts:54` | Узкая дверь не нужна | Оставлено как есть: зовёт только webapp; это DB-материализатор, а не integrator DB-call |
| `app.resolve_organization_mechanic_access(...)` | integrator: `apps/integrator/src/infra/db/organizationMechanicLifecycleDoor.ts:96`; webapp: `apps/webapp/src/infra/repos/pgOrgEntitlements.ts:318` | Не хватало обоих | Выдано узкой роли дополнительно; прежние `app_patient`, `app_staff`, `app_tenant_service` сохранены |

## Что изменено и зачем это нужно приёму или доставке

| Изменение | Зачем |
| --- | --- |
| `read_integrator_clinic_delivery_credential`: `EXECUTE` + attested-gate переведены с широкой роли на узкую | Доставка должна получить клинический SMTP/SMSC/messenger credential после снятия широкого членства с integrator login |
| `read_integrator_google_calendar_setting`: `EXECUTE` + attested-gate переведены с широкой роли на узкую | Booking lifecycle должен прочитать подключение календаря и не оборвать подтверждение/напоминания на `42501` |
| `resolve_organization_mechanic_access`: узкая роль добавлена к grant и gate, старые роли сохранены | Integrator проверяет разрешённость clinic mechanic перед mutation доставки/приёма; webapp-пути при этом не лишены своей двери |
| `resolve_organization_mechanic_access` объявляет `delegatesTo: app.saas_billing_effective_tariff(...)`, а helper-gate принимает узкий контекст | Внутренний расчёт тарифа должен завершиться под тем же принятым org-контекстом; прямой `EXECUTE` helper узкой роли не выдаётся |
| Оба generated privilege-шаблона пересобраны из declaration | DEV и TEST reconcile получают одинаковое проверяемое состояние ролей; SQL migration не содержит `GRANT`/`REVOKE` |
| Rollback-only DB proof добавлен рядом с privilege gates | Ловит потерю grant/gate, отсутствие принятого контекста, медицинское расширение стены и обрыв полной materialization цепочки |

## Разбор миграции и прав

`apps/webapp/db/drizzle-migrations/20260823T030000_integrator_tenant_role_reaches_delivery_roots.sql` меняет четыре существующих функции и не создаёт/меняет таблицы:

- два settings-root выполняются/остаются owned by `app_seam_settings_integrator_owner`;
- mechanic-root и его delegated tariff helper выполняются/остаются owned by `app_seam_org_commerce_owner`;
- runtime получает только `EXECUTE` трёх входных roots через declaration; helper отдельного `EXECUTE` узкой роли не получает;
- migration меняет только тела gates, в ней нет `GRANT`, `REVOKE`, role/policy DDL;
- новых relation grants нет. DEV proof под узкой ролью измерил `medical_relation_privileges=0` для `public.patient_bookings`, `public.treatment_program_instances`, `public.symptom_entries`.

## Проверки

```bash
pnpm run lint
```

PASS, exit 0. ESLint сообщил 0 errors и два non-fatal warning вне D17 в `AppointmentPaymentSection.tsx`; все structural lint-gates зелёные.

```bash
pnpm run typecheck
```

PASS, exit 0: packages, integrator, webapp и media-worker.

```bash
node deploy/postgres/privileges/generate-cli.mjs --all --check
```

PASS, exit 0: DEV/TEST privileges и allowlist совпадают с declaration побайтово.

```bash
RUN_D17_INTEGRATOR_ROOTS_DB=1 node --test deploy/postgres/privileges/integrator-narrow-delivery-roots.devDbProof.test.mjs
```

PASS на именованной DEV: `tests=1, pass=1, fail=0`. В одной откатываемой транзакции проверено:

- без принятого контекста все три входных roots отвечают `42501`;
- с принятым org-контекстом узкая роль проходит оба settings-root и mechanic-root;
- прямых прав на три медицинских relations — `0`;
- `replace_appointment_reminder_generation` возвращает `current=true`, `inserted=1`, и до rollback существует `1` соответствующая pending-строка `appointment_reminder`.

Fault injection: в DEV generated artifact временно заменён grant `app_integrator_tenant_service` на `app_tenant_service` для `read_integrator_clinic_delivery_credential`, после чего та же команда завершилась exit 1. Покрасневший oracle:

```text
app.read_integrator_clinic_delivery_credential(text,uuid): extra EXECUTE app_tenant_service
app.read_integrator_clinic_delivery_credential(text,uuid): missing EXECUTE app_integrator_tenant_service
```

Временная поломка возвращена. Повторный `node deploy/postgres/privileges/generate-cli.mjs --all --check` — PASS побайтово; `git diff --check` — PASS.

## Круг 4 — calendar-root привязан к принятой клинике

Повторный аудит `D17_REAUDIT_2026-08-23.md` дал FAIL по предсуществующей дыре
`app.read_integrator_google_calendar_setting(text,uuid)`: арендная ветка выбирала строку по
`p_organization_id`, не сверяя его с принятым port-context. В этом круге тело приведено к форме
соседнего credential-root:

- attested-gate остаётся первым оператором;
- `app.current_org_id()` читается после гейта;
- ненулевой аргумент только сверяется с принятой организацией, несовпадение даёт `42501`;
- арендная строка выбирается по переменной из контекста, а не по аргументу;
- глобальная ветка `p_organization_id IS NULL` сохранена и по-прежнему читает только три глобальных
  OAuth-ключа с `organization_id IS NULL`.

Права не менялись: `declaration.ts` по-прежнему выдаёт узкой роли ровно три входные двери, а
`app.saas_billing_effective_tariff(uuid,uuid)` остаётся только делегатом mechanic-root без прямого
`EXECUTE` для `app_integrator_tenant_service`. В миграции нет `GRANT`, `REVOKE`, role/policy DDL.

### Повторная проверка всех четырёх тел другим способом

Вместо ещё одного построчного чтения тел выполнена поведенческая матрица на именованной DEV внутри
одной транзакции `BEGIN … ROLLBACK`. Команда:

```bash
RUN_D17_INTEGRATOR_ROOTS_DB=1 node --test deploy/postgres/privileges/integrator-narrow-delivery-roots.devDbProof.test.mjs
```

Итог: `tests=1, pass=1, fail=0`, `exit=0`. Матрица доказала:

- credential-root: контекст клиники A + аргумент клиники B → `42501`;
- calendar-root: контекст клиники A + аргумент клиники B → `42501`, посаженная строка B не возвращена;
- mechanic-root: контекст клиники A + аргумент клиники B → `42501`;
- tariff-helper: `has_function_privilege('app_integrator_tenant_service',
  'app.saas_billing_effective_tariff(uuid,uuid)', 'EXECUTE') = false`; доступ идёт только через
  объявленное делегирование mechanic-root;
- без принятого контекста все три входные двери отвечают `42501`, а со своим контекстом узкая роль
  проходит каждую из трёх;
- команда измерила `medical_relation_privileges=0` на трёх контрольных медицинских отношениях и
  сохранила зелёной прежнюю materialization-проверку (`current=true`, `inserted=1`, pending rows=`1`).

DB-proof теперь берёт канонический список миграций через `readMigrationFolder` /
`selectPendingMigrations` и подмешивает все pending-файлы до D17 в ту же rollback-транзакцию. Поэтому
он больше не падает на отсутствующей предшествующей функции
`app.pre_session_get_default_auth_otp_channel(uuid)`, как было отмечено повторным аудитом.

### Инъекция

Временно удалена сверка аргумента с контекстом и арендная выборка возвращена на
`setting.organization_id = p_organization_id`. Та же команда завершилась `exit=1`; покрасневшее
утверждение получило фактическую чужую строку:

```text
actual:   {"value": "D17_FOREIGN_GOOGLE_REFRESH_TOKEN"}
expected: 42501
```

Временная поломка снята, после чего тот же DB-proof снова дал `tests=1, pass=1, fail=0`, `exit=0`.

### Генерация и статические проверки

Команды выполнены в требуемом порядке:

```bash
node deploy/postgres/privileges/generate-cli.mjs --all
node deploy/postgres/privileges/generate-cli.mjs --all --port-context-only
node deploy/postgres/privileges/generate-cli.mjs --all --check
git diff --exit-code -- deploy/postgres/generated
```

Итог: `exit=0`; `--all --check` сообщил четыре побайтовых совпадения, а последний `git diff`
подтвердил отсутствие изменений во всех generated-артефактах. Значит права круга 3 не откатились и
не расширились.

```bash
node --test deploy/postgres/privileges/definer-tenant-predicate.test.mjs deploy/postgres/privileges/migration-order.test.mjs deploy/postgres/privileges/migrate-local-parse.test.mjs
```

Итог: `tests=44, pass=44, fail=0`, `exit=0`.

```bash
pnpm run typecheck
pnpm run lint
```

Обе команды дали `exit=0`. Lint сохранил два прежних warning вне D17 в
`AppointmentPaymentSection.tsx`, ошибок нет.

Owner-aware wrapper дополнительно запрошен точной командой
`bash deploy/host/migrate-dev.sh --preflight`, но остановился **до обращения к БД** с
`FATAL: DEV API env path guard failed`: в изолированном worktree нет канонического `.env`, а переносить
или копировать секретный env в рабочее дерево нельзя. Это не заменяет зелёный DB-proof выше и не
объявляется PASS preflight.

TEST, PROD, `--execute`, push и галочки плана не затрагивались.
