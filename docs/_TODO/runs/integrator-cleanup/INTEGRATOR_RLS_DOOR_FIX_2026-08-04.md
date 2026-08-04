# Интегратор перестал писать людей после FORCE RLS — третья дверь: закрыто

Brief: `INTEGRATOR_RLS_DOOR_BRIEF_2026-08-04.md`. Authority: `docs/_TODO/ACCESS_SWEEP_2026-08-04.md`
("Топ находка").

## 1. Перепись мутаций `writePort.ts` против `platform_users`

Прошёл все 25 `case` в `apps/integrator/src/infra/db/writePort.ts` (`event.log` …
`message.retry.enqueue`). Только два трогают `public.platform_users` напрямую (сырой SQL через
`@bersoncare/platform-merge`, не через SECURITY DEFINER — принцип решает всё):

| Mutation | Путь записи | Принципал ДО фикса | `platform_users`? |
| --- | --- | --- | --- |
| `user.upsert` | `writeIdentityAndPreferencesDirect` → `identityProjectionWrite` (insert/enrich + `user_channel_bindings`) | integrator (`app_patient`, org set, `patient_user_id` NULL) | ДА — сломано |
| `user.phone.link` | `applyMessengerPhonePublicBind` (тот же движок, bind-by-phone) | integrator | ДА — сломано |
| `user.phone.link` (ветка блокировки) | `recordMessengerPhoneBindBlocked` → `public.admin_audit_log` | integrator | Не `platform_users`, но тот же класс: org-scoped RLS (`saas_org_dormant_p0_8_3`), `app_patient` вообще без грантов на таблицу — permission denied на КАЖДЫЙ вызов, не только сегодня |

Остальные 22 mutation-типа: либо не касаются `public.*` вовсе (integrator-only состояние —
`draft.*`, `identity.ensure`, `user.state.set`, `message.retry.enqueue`), либо УЖЕ обёрнуты
`runDirectPublicWriteWithOrgPrincipal`/`runWithOrganizationPrincipal` (D3-D5: `conversation.*`,
`question.*`, `reminders.rule.upsert`, `delivery.attempt.log`) — построчно сверено, пробелов нет.
`specialistTask.reminder.markSent` не трогает `public.*` вовсе (`applySpecialistTaskReminderSuccessOutcome`
— только `integrator`-таблицы/интегратор-локальный статус).

## 2. Фикс — идиома D3-D5, применённая к D1/phone-link

Ровно тот класс, что уже несёт комментарий `runDirectPublicWriteWithOrgPrincipal` в `writePort.ts:100-127`
("Re-verified 2026-07-25... mirrors persistWritesByOrganization"): переустановить `SET ROLE app_staff`
+ ТОТ ЖЕ `organizationId`, что уже ambient у принципала, на время прямой записи. Никакой новой роли,
никакого расширения политики `platform_users`, никакого гранта `app_patient` на таблицу — снятый вчера
барьер остаётся снятым НЕ по конструкции RLS, а потому что на это время роль другая.

Правки (все чисто TS, без миграции — существующие политики `platform_users`/`admin_audit_log` и гранты
`app_staff` уже покрывают нужный доступ, ничего в схеме менять не нужно):

- `apps/integrator/src/infra/db/writePort.ts`
  - `user.upsert`: `writeIdentityAndPreferencesDirect(...)` обёрнут `runDirectPublicWriteWithOrgPrincipal`.
  - `user.phone.link`: весь `db.tx(...)` (integrator-local `ensureIdentityForMessenger`/`setUserPhone` +
    публичная `applyMessengerPhonePublicBind` — ОДНА транзакция, поэтому обёртка снаружи `db.tx`, а не
    внутри) обёрнут той же функцией. `integrator.identities`/`integrator.users` без RLS — работа под
    `app_staff` их не задевает (грант на `integrator.*` у `app_staff` уже есть, p0-5b-grants.sql).
  - `recordMessengerPhoneBindBlocked(...)` (ветка блокировки бинда) — тоже обёрнут.
- `apps/integrator/src/infra/db/repos/messengerPhoneBindAudit.ts`: обе INSERT-ветки (`conflict_key`
  найден/не найден) теперь пишут `organization_id` (раньше колонка не заполнялась вовсе — под
  `app_staff` c ambient org в `WITH CHECK` пустая колонка сама по себе давала бы отказ). Значение — тот
  же `getCurrentDbPrincipalOrganizationId()`, что читает вызывающая обёртка, не отдельное разрешение.

## 3. Закрытие молчаливости

Для обоих чинимых путей молчаливость закрыта не добавлением новой "различи пустое от отказа" машинерии,
а тем, что запрос теперь идёт под принципалом, которому эта строка ВИДНА по праву (тот же `app_staff`
+ org, каким уже работают D3-D5 с 25.07 без нареканий): `platform_users_staff_org_select`/`_update`
проверяют `is_staff() AND org_id = current_org_id() AND EXISTS(...org_enrollments/be_organization_members)`
— органо-широкая видимость для персонала этой клиники, шире чем нужно только внутри самой организации,
не вовне. После фикса пустой результат для уже известного (по `integrator_user_id`) контакта означает
РЕАЛЬНОЕ отсутствие строки или то, что она принадлежит другой организации — не артефакт RLS. Заводить
отдельный "explicit denial vs empty" сигнал поверх этого было бы новой сущностью без нового класса
дефекта, который она бы ловила (см. AGENTS.md «не плодить сущности») — старый молчаливый разрыв был
именно в том, что принципал НЕ имел доступа вообще ни к одной строке; после фикса он его имеет.

## 4. `list_web_push_reminder_organization_ids` — вердикт: ПОДТВЕРЖДЕНО, не тронуто

Проверено на DEV (`bcb_webapp_dev`) напрямую, независимо от аудита на TEST — то же самое:

```sql
select p.proname, r.rolname as owner, r.rolbypassrls,
       pg_has_role(r.rolname,'app_identity_bootstrap','member') as in_bootstrap
from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
where n.nspname='app' and p.proname='list_web_push_reminder_organization_ids';
-- owner=app_web_push_reminder_discovery_definer, rolbypassrls=f, in_bootstrap=f
```

`grep -rn list_web_push_reminder_organization_ids apps/ packages/ scripts/` — совпадений в рабочем коде
НЕТ (только `scripts/a0-greenfield-baseline*.mjs`, роль там просто создаётся как часть baseline-сида).
Не вызывается нигде — молчаливый ноль сегодня безвреден. Сломается ровно так же, как чинится здесь,
в момент подключения фичи web-push reminder discovery: тому коду тогда понадобится либо
`app_owner`-владение (0356-идиома), либо членство роли-владельца в `app_identity_bootstrap`. Не чинить
сейчас — по брифу, вне охвата этой задачи.

## Поведенческое доказательство (живое, DEV `bcb_webapp_dev`, транзакционно, ничего не оставлено)

Реальная строка: `platform_users.id=b0021a38-fb86-45e9-9aec-d85014e932d4`,
`integrator_user_id=2`, `be_organization_members.organization_id=a0000000-0000-4000-8000-000000000001`.
`app.principal_context` заполнен вручную (та же техника, что в самом аудите), `bcb_webapp_dev_user`
временно введён в `app_patient`/`app_staff` ТОЛЬКО на время проверки и выведен обратно сразу после
(`pg_auth_members` до/после идентичны — только `app_identity_bootstrap`, `count(*) platform_users` = 287
без изменений, `updated_at` целевой строки не тронут).

- **ДО фикса** (`SET ROLE app_patient`, org set, `patient_user_id` NULL — ровно принцип "integrator"):
  `SELECT ... WHERE integrator_user_id=2` → `0 rows` (молчаливый пустой, как в аудите);
  `UPDATE ...` → `ERROR: permission denied for table platform_users`.
- **ПОСЛЕ фикса** (`SET ROLE app_staff`, тот же org — форма `runDirectPublicWriteWithOrgPrincipal`):
  `SELECT` → строка найдена (`display_name = "Дмитрий Берсон"`); `UPDATE ... RETURNING id, updated_at` →
  успех. Транзакция закрыта `ROLLBACK`.
- `admin_audit_log`: `INSERT ... (organization_id, ...)` под `app_staff` с ambient org → успех,
  `RETURNING organization_id` = ожидаемый org. Тоже `ROLLBACK`.

Тот же механизм, что чинит код — `SET ROLE app_staff` с ambient org — прогнан вживую до правки кода.
