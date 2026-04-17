# PLAN — API DI / import-boundary normalization (исполнительский)

**Scope:** `apps/webapp/src/app/api/**/route.ts` и связанные `app-layer` / `modules` изменения. **Не** смешивать с треком A в одном PR.

## Цель

- Свести прямые импорты `@/infra/*` в route handlers к минимуму осознанных исключений; собирать зависимости через **`buildAppDeps`** (или узкие фабрики в `app-layer/di/`), сохраняя **parity** HTTP контрактов.

## Non-goals

- Изменение интеграционных контрактов с ботом без версионирования/документации.
- Перенос **чистых** функций из `shared` в DI.
- Рефакторинг integrator `apps/integrator` (другой composition root: `src/app/di.ts`).

## Целевая import policy (API layer)

### Allowed (рабочая гипотеза, согласовать при исполнении)

- `next/server`, `next/*` types.
- `@/app-layer/*` (guards, `buildAppDeps`, будущие фабрики).
- `@/modules/*` для orchestration/use-case вызовов **после** того как deps собраны (избегать новых прямых infra вызовов из route — перенос в модуль с инжекцией портов **preferred**).
- `@/shared/*` чистые утилиты / типы.

### Restricted в `route.ts`

- `@/infra/db/client`, `@/infra/repos/*` (кроме исключений), `@/infra/s3/*`, `@/infra/idempotency*`, низкоуровневые merge/purge/m2m клиенты.

### Предварительный список accepted exceptions (**likely**, подтвердить при коде)

1. **Webhook signature verify** — `verifyIntegratorGetSignature` / `verifyIntegratorSignature` из `@/infra/webhooks/verifyIntegratorSignature` *или* тонкая re-export обёртка в `app-layer` без изменения крипто-логики.
2. **Structured logging** — `logger` / `logServerRuntimeError` из `@/infra/logging/*` *если* команда решит не оборачивать логгер в deps (**tradeoff:** меньше файлов, больше coupling).

**Правило композиции:** новые порты и выбор pg vs in-memory — в `buildAppDeps.ts` (или отдельном `app-layer/di/*` модуле), не в теле `route.ts`.

**Pure helpers:** не тащить в DI.

## Кластеры и порядок (по риску / выгоде)

1. **Cluster G — «sigGet only»** (~15 файлов integrator GET): низкий риск; единый wrapper `assertIntegratorGetRequest(request)` в app-layer → убрать дублирование; checkpoint: все `route.test.ts` integrator GET зелёные.
2. **Cluster L — logging-only routes** (`auth/*-init`, `menu`, `support`, `booking/catalog`, `media/upload`, `patient/diary/purge`): низкий риск после политики логгера.
3. **Cluster H — health** (`health/projection`): прокси на integrator; checkpoint: не сломать timeout/status mapping.
4. **Cluster O — OAuth callbacks**: pg vs in-memory выбор; checkpoint: OAuth e2e/unit tests (`auth/oauth/callback/*/route.test.ts`).
5. **Cluster R — Rubitime doctor** (`doctor/appointments/rubitime/*`): `postIntegratorSignedJson`; checkpoint: оба `route.test.ts`.
6. **Cluster I — integrator POST** (`channel-link/complete`, occurrences skip/snooze, **dispatch**, **events**, **messenger-phone/bind**): высокий риск; идти от меньшего к большему телу; **events/bind/dispatch** последними внутри кластера.
7. **Cluster M — media** (presign, multipart, confirm, `GET [id]`, internal jobs): максимальный риск; только после стабилизации предыдущих; обязательны существующие `route.test.ts` + `e2e/cms-media-inprocess` контракт.
8. **Cluster D — doctor merge / purge / admin audit**: P0 по последствиям; после отработки паттерна на менее критичных admin routes.

Для **каждого** кластера: отдельный commit (или серия). Проверки между коммитами — `.cursor/rules/test-execution-policy.md`: после точечных правок **step** (таргетированные тесты / typecheck затронутого приложения); **phase** (`pnpm test:webapp` целиком) — когда закрыт смысловой кусок кластера или перед пушем. Полный `pnpm run ci` — только перед **пушем** в remote (или при repo-уровневых изменениях). Workflow GitHub не менять.

## Parity contracts (обязательно для каждого изменённого endpoint)

Зафиксировать в PR / `LOG.md`:

- HTTP статусы success + ключевые error paths.
- Минимальный набор JSON keys (или текст ошибки / `code`), особенно для integrator и auth.
- Идемпотентность: повтор с тем же ключом / телом — ожидаемое поведение.
- Подпись: отклонение при неверном timestamp/signature.

## Enforcement после чистки

Варианты (**needs verification** что уже есть в ESLint):

1. `eslint-plugin-import` `no-restricted-paths` для `src/app/api/**/route.ts`.
2. CI шаг: `rg '@/infra/' apps/webapp/src/app/api --glob '**/route.ts'` с allowlist файлом исключений.
3. Vitest «architecture test» сканирующий AST — только если (1)-(2) недостаточно.

Текущий формальный allowlist (post-Cluster G snapshot):  
`ALLOWLIST_REMAINING_INFRA_ROUTE_IMPORTS.md`.

## Архитектурные документы — обновить после трека

| Документ | Действие |
|----------|----------|
| `apps/webapp/src/app/api/api.md` | Выровнять формулировку «тонкие роуты» с фактическими импортами; перечислить **approved exceptions**. |
| `apps/webapp/src/app-layer/di/di.md` | Описать новые поля `buildAppDeps` / фабрики. |
| `docs/ARCHITECTURE/LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md` | Пометить исправленные устаревшие примеры (напр. `events.ts` + `buildAppDeps`). |
| `docs/TEST_AND_API_DI_OPTIMIZATION/api-di-boundary-normalization/LOG.md` | Журнал кластеров + остаточные исключения. |

## Документы **не** переписывать целиком

- `ARCHITECTURE_GUARDRAILS.md` — только если меняется реальный runtime integrator guardrail.
