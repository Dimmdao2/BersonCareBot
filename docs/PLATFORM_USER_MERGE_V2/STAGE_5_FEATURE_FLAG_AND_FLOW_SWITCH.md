# Stage 5 — Feature flag и смена flow (Deploy 4)

**Цель:** включить продуктовый сценарий «два разных non-null `integrator_user_id`» под управлением флага и изменить порядок операций: **сначала integrator merge, затем** существующий webapp manual merge.

## Конфигурация

- Хранить флаг в **`system_settings`** (scope `admin`), ключ добавить в `ALLOWED_KEYS` в [`apps/webapp/src/modules/system-settings/types.ts`](../../apps/webapp/src/modules/system-settings/types.ts).
- **Не** вводить новые env vars для этой бизнес-логики (правило проекта: integration/операционные переключатели в БД).

## Поведение webapp

| Флаг | Поведение |
|------|-----------|
| **off** | Как v1: hard blocker `different_non_null_integrator_user_id` в preview и `pgPlatformUserMerge.ts` |
| **on** | Если оба integrator id заданы и различны: UI/бэкенд требуют успешного integrator merge (или показывают шаг «выполнить объединение в integrator»), затем разрешают webapp merge |

## Integrator API

- **Реализовано:** HMAC M2M (те же заголовки, что `settings/sync` / reminders), секрет — `INTEGRATOR_WEBHOOK_SECRET` (или fallback `INTEGRATOR_SHARED_SECRET`) на обеих сторонах.
- `POST {INTEGRATOR_API_URL}/api/integrator/users/canonical-pair` — тело `{ integratorUserIdA, integratorUserIdB }` → `{ ok, sameCanonical, canonicalA, canonicalB }`.
- `POST {INTEGRATOR_API_URL}/api/integrator/users/merge` — тело `{ winnerIntegratorUserId, loserIntegratorUserId, dryRun? }` → вызов `mergeIntegratorUsers`.
- **Webapp proxy (admin + admin mode):** `POST /api/doctor/clients/integrator-merge` — только при включённом `platform_user_merge_v2_enabled`; тело `{ targetId, duplicateId, dryRun? }` (winner integrator = `integrator_user_id` **целевого** platform user).

## Изменения в коде (чек-лист)

- [x] `platformUserMergePreview.ts` — условный hard blocker (`different_non_null_integrator_user_id` vs `integrator_canonical_merge_required` / `integrator_merge_status_unavailable`).
- [x] `pgPlatformUserMerge.ts` — условная проверка двух integrator id (`allowDistinctIntegratorUserIds` после gate).
- [x] `AdminMergeAccountsPanel` / `adminMergeAccountsLogic.ts` — копирайт и шаги UX.
- [x] `api.md` — описание нового порядка и флага.

## Rollback

- Выключить флаг в Settings → поведение откатывается к v1 без redeploy.

## Gate

- E2E под флагом: merge пары с двумя integrator id успешен; с выключенным флагом — прежний blocker.

## Связь с todo «enablement-closeout»

Реализация флага и flow — основная часть enablement; финальный отчёт — [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md).
