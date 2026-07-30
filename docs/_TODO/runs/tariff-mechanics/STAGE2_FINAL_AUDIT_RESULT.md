# VERDICT: FAIL

## Четыре ответа

1. **Миграция — PASS по deploy-safety.**  
   [`0276_access_lifecycle_ladder_local.sql`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/db/drizzle-migrations/0276_access_lifecycle_ladder_local.sql:27) пишет только в `public.system_settings`. Удалённого зеркала в файле нет. Cleanup:

   - ограничен `organization_id IS NULL`;
   - требует точного равенства историческому `7/3/21`;
   - удаляет только `value.lifecyclePolicy`;
   - не затрагивает org-specific или owner-edited значения.

   Миграция forward-only. Реальный root runner выполняет interleave integrator → webapp → integrator; обращения к удалённой таблице больше нет, поэтому `0276` на порядке не падает. Правило `system-settings-single-source.mdc` соблюдено. Отдельно остаётся решение лида о ретроактивной правке уже существующей `0259`.

2. **Grace warning — PASS.**  
   Реальная поверхность: общий clinic-facing doctor shell [`app/doctor/layout.tsx`](/home/dev/dev-projects/bcb-wt-[redacted-token].tsx:80). Он показывает `role="alert"` с названием функции, датой, следующим состоянием и количеством из resolver warning, без локальных чисел.  
   [`accessLifecycleSurfaces.ui.test.tsx`](/home/dev/dev-projects/bcb-wt-[redacted-token].ui.test.tsx:161) краснеет при удалении banner/adapter warning; [`service.test.ts`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/org-entitlements/service.test.ts:520) отдельно защищает перенос warning через guard.

3. **Literal hunt — FAIL.**  
   Запущено:

   ```bash
   rg -n -i --glob '*.{ts,tsx,js,mjs,cjs,sql,json}' \
     '(graceDays|grace_days|readOnlyDays|read_only_days|warningCount|warning_count|terminalState|terminal_state|chargeAttempts|charge_attempts|lifecyclePolicy|lifecycle_policy|warningAtPercent|warning_at_percent|\b(grace|read[_-]?only|disabled|blocked|no_trial)\b|14[[:space:]]*(days?|дн)|80[[:space:]]*%)' \
     apps/integrator
   ```

   Значимый вывод:

   ```text
   writeDiaryLfkDirect.ts:190 ... THEN 'grace'
   writeDiaryLfkDirect.ts:195-196 ... 'no_trial'
   writeDiaryLfkDirect.ts:211 effective.access_source <> 'no_trial'
   writeDiaryLfkDirect.ts:229 access.lifecycle === 'read_only'
   writeDiaryLfkDirect.ts:230 access.lifecycle === 'blocked'
   ```

   Поиск копии `7/3/21` дал пустой вывод, exit 1. Но [`writeDiaryLfkDirect.ts`](/home/dev/dev-projects/bcb-wt-[redacted-token].ts:176) содержит собственный lifecycle-resolver и не читает owner-configured system/mechanic policy. Это обход 2.3/3.1, а не безобидные terminal-state строки.

4. **Blind spots — FAIL: полностью закрыт только один из трёх.**

   - SQL/repository projection: [`pgOrgEntitlements.test.ts`](/home/dev/dev-projects/bcb-wt-[redacted-token].test.ts:36) ловит удаление TS mapping, но не удаление policy-полей из SQL-функции. Мок сам возвращает готовые поля независимо от `0276`/overlay — такой SQL-регресс останется зелёным.
   - Реальные doctor/patient поверхности: закрыто [`accessLifecycleSurfaces.ui.test.tsx`](/home/dev/dev-projects/bcb-wt-[redacted-token].ui.test.tsx:160).
   - Submit/persistence: [`CommercialConstructorClient.ui.test.tsx`](/home/dev/dev-projects/bcb-wt-[redacted-token].ui.test.tsx:39) ловит UI-hardcode и потерю поля в request, но его fetch-мок сохраняет request напрямую. Удаление `mechanicAccessPolicies` из route/service/PG `tariffValues()` останется зелёным.

## MUST FIX

1. Перевести integrator diary/LFK write с локального `no_trial/read_only/blocked` решения на единый owner-configured resolver/port.
2. Пункт 2.6c фактически появился: `POLICY_MECHANICS = OVERRIDABLE_MECHANICS` включает `payments` и `branding`, а их mutation routes уже вызывают ladder. До решения владельца обе развилки должны оставаться нереализованными.
3. Добавить поведенческое доказательство реального SQL-выхода patient entitlement function: удаление двух policy-колонок из migration/overlay обязано краснить gate.
4. Добавить доказательство route/service/PG persistence: потеря `mechanicAccessPolicies` при записи или повторном чтении должна краснить тест.
5. Compatibility-org проходит read gate `clinic_team`, но [`clinic-seats/service.ts`](/home/dev/dev-projects/bcb-wt-tariff/apps/webapp/src/modules/clinic-seats/service.ts:41) бросает исключение при `limit=null`; team page и API получают 500 вместо видимого отказа.
6. [`organization-member-invites-rls.sql`](/home/dev/dev-projects/bcb-wt-tariff/deploy/postgres/organization-member-invites-rls.sql:281) всё ещё читает `tariff.mechanics->>'clinic_team'`, хотя конструктор хранит места в `included_seats`. Тариф без override получает `entitlement_disabled` при принятии приглашения.

## Что осталось верным

Четыре поля доступны на системном и mechanic-уровне; `null` — честное «не настроено»; mechanic policy сильнее system policy. Лестница недеструктивна. Early read-allow удалён; чтение остаётся открытым в `grace` и `read_only`. Критичные механики нельзя выключить ladder’ом. Коррекция не меняла billing, mock-payment routes, план или канон.

## Запуски

- `service.test.ts`: 17/17.
- `pgOrgEntitlements.test.ts`: 2/2.
- `accessLifecycleSurfaces.ui.test.tsx`: 2/2.
- `CommercialConstructorClient.ui.test.tsx`: 2/2.
- Итого: **4/4 файла, 23/23 теста**.
- `pnpm --filter webapp typecheck`: exit 0, 0 ошибок.
- `pnpm --filter webapp lint`: exit 0.
- Drizzle journal check: `OK` внутри lint и отдельным запуском.
- Full CI не запускался.

**Live DEV:** до исправления MUST FIX миграцию не применять; затем лиду назначить финальный номер, выполнить канонические preflight/execute и проверить warning, policy round-trip и OFF→ON без потери данных.

**Дерево:** аудит не добавил изменений — 0 staged и 0 untracked. Однако Git-дерево формально **не чистое**: в начале и конце присутствуют те же 10 предсуществующих env character-special файлов. По запрету mission я их не восстанавливал и не маскировал.