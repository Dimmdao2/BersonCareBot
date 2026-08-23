# D17: владелец шва не имеет прав на таблицы, которые читают его же definer-корни

**Источник оракула:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «узкая роль интегратора не мешает доставке»

Канон — `AGENTS.md` (`grep -n "^## \|^### " AGENTS.md`), §1, §5, §10a, §24.

## Живой замер, ради которого этот бриф написан

23.08.2026, TEST, после выкатки `a3c5a4f40` (в ней уже все четыре круга D17). Пациент
записался на приём через `POST /api/booking/create` — `200`, `confirmed`, письмо-подтверждение
ушло (`outgoing_delivery_queue`: `outbound_message|email|sent`). **Но напоминания снова не
материализовались**: журнал интегратора на `booking.created` даёт
`booking_lifecycle_step_failed step=appointment_reminders`, `502` наружу, и так три повтора.

Причина найдена в журнале Postgres в ту же секунду — и это НЕ узкая роль интегратора:

```
09:31:55 bcb_test_webapp_staff 42501 ERROR: permission denied for table user_contacts
         CONTEXT: SQL statement "SELECT holder.integrator_user_id, email_contact.value_normalized, …"
         STATEMENT: SELECT app.read_integrator_delivery_target_snapshot(…)
09:30:02 bcb_test_webapp_staff 42501 ERROR: permission denied for table user_channel_preferences
```

`app.read_integrator_delivery_target_snapshot` — `SECURITY DEFINER`, владелец
`app_seam_delivery_scope_owner`. У этой роли **нет ни одного гранта на `user_contacts`** и нет
членства ни в одной роли (проверено на TEST: `information_schema.role_table_grants` по
`user_contacts` не содержит ни одной строки со `seam`; `pg_auth_members` для этой роли пуст).
То есть `SECURITY DEFINER` не спасает — прав нет у самого владельца шва.

Это класс, а не единичный случай: на TEST **34 роли-владельца швов**, за ними от 7 до 54
definer-корней каждая (`app_seam_patient_self_actions_owner` — 54,
`app_seam_patient_booking_owner` — 34, `app_seam_delivery_scope_owner` — 16).

## Что сделать

1. **Перепись — главный результат.** По каждой роли-владельцу шва сопоставь: какие отношения
   читают и пишут её definer-корни против того, какие права у неё реально есть. Метод назови так,
   чтобы я его повторил. Отличай «прав нет» от «права есть через членство».
2. **Почини то, что ломает доставку сегодня.** Как минимум два места из замера выше:
   `app_seam_delivery_scope_owner` → `user_contacts`, и корень, читающий
   `user_channel_preferences`. Дай владельцу шва ровно то, что читают его корни, — не больше
   (`SELECT` там, где только читают).
3. **Права — только через `deploy/postgres/privileges/declaration.ts` и генерацию**
   (`--all`, `--all --port-context-only`, `--all --check` побайтово). В миграциях
   `GRANT`/`REVOKE`/`CREATE ROLE`/`ALTER DEFAULT PRIVILEGES`/`CREATE POLICY` **запрещены**.
4. **Не расширяй стены.** Владелец шва получает права на СВОИ отношения; арендная стена внутри тел
   остаётся (организация из принятого контекста, аргумент только сверяется).

## Доказательство

- Тест, который краснеет при отзыве нового права: вызов корня под живым принципалом должен
  возвращать данные, а без права — `42501`. Инъекция обязательна.
- `node deploy/postgres/privileges/generate-cli.mjs --all --check` и `--all --port-context-only --check` — побайтово чисто.
- `typecheck`, `lint`, `definer-tenant-predicate.test.mjs` — зелёные.
- Живую выкатку и повторную запись на TEST делает ВЕДУЩИЙ, не ты.

## Границы

`--execute`, TEST, PROD, push — запрещены. Галочки плана ставит ведущий.
Отчёт: `docs/_TODO/runs/integrator-cleanup/D17_SEAM_OWNER_PRIVILEGES_2026-08-23.md`.
