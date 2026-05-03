---
name: Batch PATCH modes and phone preview
status: completed
closed_at: 2026-05-02
execution_audit: MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md
related_plan: MODES_SETTINGS_CLEANUP_PLAN.md
log_entry: LOG.md (2026-05-02 — режимы…; пункт batch + preview)
---

# План (зеркало): составной PATCH «Режимы» и предпросмотр телефонов тестовых аккаунтов

Канонический Cursor-план выполнен в коде; **факт закрытия, чек-листы и команды** — в [`MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md`](MODES_AND_TEST_ACCOUNTS_EXECUTION_AUDIT.md) (§«Третий прогон»).

## Цель

1. **Один HTTP-запрос** при сохранении вкладки «Режимы»: тело `PATCH /api/admin/settings` с `{ items: Array<{ key, value }> }`, ключи из единого списка **`MODES_FORM_KEYS`** ([`modesFormKeys.ts`](../../apps/webapp/src/modules/system-settings/modesFormKeys.ts)).
2. **Атомарность БД:** все строки пакета в одной транзакции `public.system_settings` — [`upsertManyInTransaction`](../../apps/webapp/src/infra/repos/pgSystemSettings.ts); post-commit — по каждому ключу `syncSettingToIntegrator` + `invalidateConfigKey` в [`persistAdminModesBatch`](../../apps/webapp/src/modules/system-settings/service.ts) (зеркало integrator вне TX, как при одиночном `updateSetting`).
3. **Общая нормализация** с одиночным PATCH — [`adminSettingsPatchNormalize.ts`](../../apps/webapp/src/modules/system-settings/adminSettingsPatchNormalize.ts), `normalizeModesFormBatchItems`.
4. **Предпросмотр телефонов** до Save — [`previewTestAccountPhoneTokens`](../../apps/webapp/src/modules/system-settings/testAccounts.ts) + UI в [`AdminSettingsSection.tsx`](../../apps/webapp/src/app/app/settings/AdminSettingsSection.tsx).

## Контракт batch (ошибки)

| `error` | Условие |
|---------|---------|
| `empty_batch` | `items: []` |
| `invalid_body` | `items` не массив; zod batch; невалидные элементы |
| `ambiguous_body` | одновременно строковый `key` и непустой `items` |
| `duplicate_key_in_batch` | повтор `key` в массиве (`atIndex` — второе вхождение) |
| `invalid_key` | ключ не в `ALLOWED_KEYS` |
| `invalid_value` | нормализация; ответ с `atIndex` (0-based), опционально `key` |

## Definition of Done (все выполнено)

- [x] Один `fetch` из UI — [`patchAdminSettingsBatch`](../../apps/webapp/src/app/app/settings/patchAdminSetting.ts).
- [x] Одиночный PATCH без `items` не сломан.
- [x] Тесты: `route.test.ts` (batch + регресс), `adminSettingsPatchNormalize.test.ts`, `testAccounts.test.ts` (preview), `service.test.ts` (`persistAdminModesBatch`), `AdminSettingsSection.test.tsx`.
- [x] Корневой **`pnpm run ci`** зелёный.

## Команды верификации (целевые)

```bash
pnpm --dir apps/webapp exec vitest run \
  src/app/api/admin/settings/route.test.ts \
  src/modules/system-settings/adminSettingsPatchNormalize.test.ts \
  src/modules/system-settings/testAccounts.test.ts \
  src/modules/system-settings/service.test.ts \
  src/app/app/settings/AdminSettingsSection.test.tsx
pnpm --dir apps/webapp typecheck
pnpm --dir apps/webapp lint
```

Перед push: **`pnpm run ci`** из корня репозитория.
