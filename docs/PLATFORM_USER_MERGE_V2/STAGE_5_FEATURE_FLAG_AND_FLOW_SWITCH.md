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

- Экспортировать безопасный endpoint (например signed internal или admin-only через webapp proxy) для вызова `mergeIntegratorUsers`.
- Аутентификация/авторизация: согласовать с существующим `INTEGRATOR_SHARED_SECRET` / admin session (детали в реализации).

## Изменения в коде (чек-лист)

- [ ] `platformUserMergePreview.ts` — условный hard blocker.
- [ ] `pgPlatformUserMerge.ts` — условная проверка двух integrator id.
- [ ] `AdminMergeAccountsPanel` / `adminMergeAccountsLogic.ts` — копирайт и шаги UX.
- [ ] `api.md` — описание нового порядка и флага.

## Rollback

- Выключить флаг в Settings → поведение откатывается к v1 без redeploy.

## Gate

- E2E под флагом: merge пары с двумя integrator id успешен; с выключенным флагом — прежний blocker.

## Связь с todo «enablement-closeout»

Реализация флага и flow — основная часть enablement; финальный отчёт — [`STAGE_C_CLOSEOUT.md`](STAGE_C_CLOSEOUT.md).
