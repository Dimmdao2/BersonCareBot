# Integrator ↔ platform_users migration — execution log

Единый журнал по плану миграции integrator на канон `public.platform_users` / `user_channel_bindings`, стабилизации strict purge в unified PostgreSQL и rollout `integrator_linked_phone_source`.

**Не редактировать** исходный план в `~/.cursor/plans/` — только этот файл и архитектурные документы в репозитории.

## Шаблон записи этапа

- Дата/время (UTC), ответственный, git SHA
- Изменённые файлы / PR
- Автотесты + ручные проверки
- SQL / audit evidence (без секретов)
- Go / no-go на следующий этап, риски, rollback

---

## Этап 1 — Stabilize purge (unified pool + honest outcome)

**Цель:** webapp strict purge не пропускал integrator cleanup «молча» при одном `DATABASE_URL`; `needs_retry`, если cleanup требовался, а пула нет.

**Код (репозиторий):**

- `apps/webapp/src/infra/platformUserFullPurge.ts` — `getIntegratorPoolForPurge()` fallback на `DATABASE_URL` + `options=-c search_path=integrator,public` при unified / совпадении explicit URL с `DATABASE_URL`.
- `apps/webapp/src/infra/strictPlatformUserPurge.ts` — `integratorCleanupNeeded` + `deriveOutcome`: при необходимости integrator-очистки и отсутствии пула → `needs_retry`.
- Тесты: `apps/webapp/src/infra/strictPlatformUserPurge.test.ts`.

**Проверки:** `pnpm run ci` (локально перед пушем).

**Ручная валидация (prod-like):** после purge заархивированного клиента — пустой `linkedPhone` при пустом public-телефоне; в `admin_audit_log` нет противоречия `outcome: completed` при фактически пропущенной integrator-очистке.

**Статус:** выполнено в коде (зафиксируйте SHA при merge).

---

## Этап 2 — Linked phone strategy + telemetry

**Цель:** переключаемая политика чтения `linkedPhone`; логи drift при `public_then_contacts`.

**Код:**

- `apps/integrator/src/infra/db/repos/linkedPhoneSource.ts`, `channelUsers.ts` (`getLinkDataByIdentity`).
- Admin ключ **`integrator_linked_phone_source`**: `apps/webapp/src/modules/system-settings/types.ts`, `apps/webapp/src/app/api/admin/settings/route.ts`, `AdminSettingsSection.tsx`, `settings/page.tsx`.

**Rollout:** по умолчанию `public_then_contacts`; для cutover — `public_only` после нулевого/низкого drift в логах (`linked_phone_legacy_fallback`, `linked_phone_drift_mismatch`, `linked_phone_drift_suppressed`).

**Статус:** выполнено в коде.

---

## Этап 3 — Merge / write alignment

**Цель:** не наращивать расхождения; purge/merge пути согласованы с unified pool (см. этап 1). Комментарий к `setUserPhone` в `channelUsers.ts`.

**Статус:** частично закрыто этапом 1 + комментарий; дальнейший перенос записи телефона в `public` только через webapp-first план.

---

## Этап 4 — Data cleanup (dry-run / apply)

**Назначение:** разовая чистка orphan legacy `integrator.contacts` (label `telegram` / `max`), когда канон в `public` уже не существует или телефон не должен тянуться из contacts. **Выполнять только после review** dry-run на копии БД.

### Dry-run — счётчик строк к удалению (пример)

Идея: messenger-labeled phone в `integrator.contacts`, при этом нет привязки к выжившему `public.platform_users` с тем же каналом **или** канон пользователя удалён. Уточните под вашу модель FK перед apply.

```sql
-- DRY-RUN: показать потенциально orphan phone contacts для telegram/max (НЕ DELETE)
-- Подключение: см. SERVER CONVENTIONS (set -a && source … && psql "$DATABASE_URL")
SET search_path = integrator, public;

SELECT c.id, c.user_id, c.label, c.value_normalized, i.resource, i.external_id
FROM integrator.contacts c
JOIN integrator.identities i ON i.user_id = c.user_id
WHERE c.type = 'phone'
  AND c.label IN ('telegram', 'max')
  AND i.resource = c.label
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_channel_bindings ucb
    JOIN public.platform_users pu ON pu.id = ucb.user_id
    WHERE ucb.channel_code = i.resource
      AND ucb.external_id = i.external_id
      AND pu.merged_into_id IS NULL
  )
LIMIT 500;
```

### Apply (операторский, только после dry-run и бэкапа)

```sql
-- APPLY: удалить только те же строки, что подтвердил dry-run (пример — замените WHERE на точный критерий из отчёта)
BEGIN;
-- DELETE … см. результат dry-run;
ROLLBACK; -- сначала откатить и проверить rowcount; затем повтор с COMMIT по процедуре ops
```

**Rollback policy:** вернуть `integrator_linked_phone_source` в `public_then_contacts`; не применять apply-SQL без снапшота БД.

**Статус:** SQL-шаблоны задокументированы; фактический apply — только ops после sign-off.

---

## Этап 5 — DoD / release

- [ ] `pnpm run ci` зелёный.
- [ ] Smoke: purge archived → `/start` просит контакт при `public_only` и пустом public.
- [ ] Audit: `user_purge` без ложного `completed` при пропущенной integrator-очистке.

**Статус:** закрыть при релизе ветки.
