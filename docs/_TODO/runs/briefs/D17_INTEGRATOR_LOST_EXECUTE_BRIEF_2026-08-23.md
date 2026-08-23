# Бриф-фикс: после сужения роли интегратора запись на приём осталась без подтверждения и напоминаний

**Регрессия D17, найдена живым прогоном на TEST 23.08.** Это не «замечание аудитора» — это сломанный
пользовательский путь: человек записывается, запись создаётся, а уведомление и напоминания не создаются.

- **План-файл:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, пункт **D17**.
- **Канон — `AGENTS.md`.** `grep -n "^## \|^### " AGENTS.md`; §1 (миграции НЕ выдают прав), §5, §6, §10a, §24.

**Источник оракула:** `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — «узкая роль интегратора не мешает доставке»

## Что измерено (повтори сам)

Пациент создал запись через `POST /api/booking/create` (успех, `status: confirmed`), затем отменил.
В журнале вебаппа TEST на оба события:

```
[booking-lifecycle] deferred integrator event failed
  eventType: 'booking.created'
  err: Error: appointment_reminders: APPOINTMENT_REMINDER_MATERIALIZATION_FAILED:403
```

В журнале Postgres того же момента (TEST):

```
bcb_test_integrator@bersoncarebot_test 42501 ERROR: permission denied for function read_integrator_google_calendar_setting
STATEMENT: SELECT app.read_integrator_google_calendar_setting($1, NULL) AS value_json
```

Снимок каталога TEST:

- `proacl` функции: `{app_seam_settings_integrator_owner=X/…, app_tenant_service=X/…}` — у узкой роли
  интегратора EXECUTE нет;
- гейт в сгенерированном артефакте:
  `app.require_attested_context_for_roles('app_seam_settings_integrator_owner'::name, ARRAY['app_tenant_service'::name])`
  — то есть даже с EXECUTE тело откажет, потому что в списке принимаемых ролей узкой роли нет.

Причина понятна: 22.08 (D17, `da5d1107a`) у логина интегратора сняли членство в широкой роли
`app_tenant_service` и перевели на `app_integrator_tenant_service`, а эта дверь осталась описанной
через старую роль.

## Что сделать

1. **Сначала ПЕРЕПИСЬ, а не точечная заплатка.** Найди ВСЕ корни, которые зовёт интегратор и у которых
   грант или список принимаемых ролей называет только `app_tenant_service`. Перечисли их в отчёте
   таблицей: имя корня, кто зовёт (файл:строка), чего не хватает — гранта, роли в гейте, или обоих.
   Метод переписи назови явно (я должен его повторить). Одиночная правда «починил одну функцию» не
   принимается: тот же класс наверняка ждёт на других путях.
2. Почини **через `deploy/postgres/privileges/declaration.ts`** и генерацию (`generate-cli.mjs --all`,
   затем `--all --port-context-only`, затем `--all --check` побайтово). **Миграция не содержит
   `GRANT`/`REVOKE`.** Гейт, где надо, принимает ОБЕ роли — старую и узкую — либо только узкую, если
   старая этот путь больше не ходит; что выбрал, обоснуй.
3. **Стену не расширять:** узкая роль не должна получить доступ к медицинским отношениям. Каждое
   добавленное право назови и объясни одной строкой «зачем это нужно приёму или доставке».
4. `bash deploy/host/migrate-dev.sh --preflight`. `--execute` НЕ запускать (на DEV сейчас чужой
   незакрытый объект, реконсайл падает не на нас — это нормально).

## Доказательство

- Поведенческий тест: под узкой ролью интегратора вызов каждой починенной двери проходит, а без
  принятого контекста — отказывает. Fault injection с показанным красным и зелёным.
- Отдельно докажи, что **материализация напоминаний о приёме** проходит целиком, а не только один вызов.
- `typecheck` и `lint` зелёные.

## Границы

TEST и PROD не трогать, `--execute` и `push` не делать, галочки плана не ставить.
Отчёт: `docs/_TODO/runs/integrator-cleanup/D17_INTEGRATOR_LOST_EXECUTE_2026-08-23.md`.

## Перепись, уже снятая мной с ЖИВОГО каталога TEST (проверь и дополни, за основу бери её)

```bash
sudo -n -u postgres psql -X -h /var/run/postgresql -d bersoncarebot_test -At -c "
SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='app'
   AND has_function_privilege('app_tenant_service', p.oid, 'EXECUTE')
   AND NOT has_function_privilege('app_integrator_tenant_service', p.oid, 'EXECUTE')
 ORDER BY 1;"
```

Пятнадцать корней открыты широкой роли и закрыты узкой:

```
app.commit_patient_reminder_materialization(uuid,text,text,uuid,text,timestamptz,integer,text)
app.list_public_booking_form_fields()
app.read_integrator_clinic_delivery_credential(text,uuid)
app.read_integrator_delivery_target_snapshot(uuid,text,text,text,uuid,bigint,text,timestamptz)
app.read_integrator_google_calendar_setting(text,uuid)
app.read_integrator_web_push_delivery_settings(uuid)
app.read_integrator_web_push_subscriptions(uuid,uuid)
app.read_patient_reminder_delivery_target_snapshot(uuid,uuid,bigint,text,timestamptz)
app.read_patient_reminder_materialization_snapshot(uuid,timestamptz)
app.read_public_booking_catalog(uuid,uuid)
app.read_public_booking_slot_snapshot(uuid,uuid,text,text)
app.record_integrator_support_delivery_attempt(uuid,text,text,text,text,integer,text,text,timestamptz)
app.record_reminder_occurrence_finalized_projection(text,text,bigint,uuid,uuid,text,text,text,text,timestamptz)
app.replace_appointment_reminder_generation(uuid,uuid,timestamptz,text,text)
app.resolve_organization_mechanic_access(uuid,text)
```

**Это список кандидатов, а НЕ список «выдать всем».** По каждому ответь одной строкой: зовёт ли его
интегратор (файл:строка) — тогда чинить; или зовёт только вебапп/публичный маршрут (например,
`read_public_booking_*`, `list_public_booking_form_fields`) — тогда НЕ трогать. Право получают только
те, где вызывающий доказан кодом.

Учти: у корня две стены, и обе названы старой ролью — **грант** (`execute: [...]` в декларации) и
**список принимаемых ролей в attested-гейте**. Починка только гранта оставит 42501 из тела.
