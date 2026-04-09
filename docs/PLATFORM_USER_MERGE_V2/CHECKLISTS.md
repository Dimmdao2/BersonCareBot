# Platform User Merge v2 — Checklists по deploy

## Общие правила (каждый PR в `main`)

- [ ] Локально: `pnpm run ci` (как в GitHub Actions).
- [ ] Ветка: `feature/merge-v2-deploy-N-...` (N = 1…4).
- [ ] На проде деплой идёт через [`deploy/host/deploy-prod.sh`](../../deploy/host/deploy-prod.sh): бэкап **обеих** БД → миграции integrator → миграции webapp → рестарт `bersoncarebot-api-prod`, `bersoncarebot-worker-prod`, `bersoncarebot-webapp-prod`.
- [ ] После деплоя: health API (`/health`), webapp (`/api/health`), при необходимости [`apps/integrator/scripts/projection-health.mjs`](../../apps/integrator/scripts/projection-health.mjs).
- [ ] Мониторинг: `admin_audit_log` — `user_purge`, `user_merge`, `auto_merge_conflict` (см. [`STAGE_A_V1_STABILIZATION.md`](STAGE_A_V1_STABILIZATION.md)).

## Коммиты, миграции и деплой (координация)

| Факт | Деталь |
|------|--------|
| Один репозиторий | Push в `main` деплоит **весь** монорепо (integrator + webapp). |
| Порядок миграций | Сначала integrator (`pnpm --dir apps/integrator run db:migrate:prod`), затем webapp (`pnpm --dir apps/webapp run migrate`). |
| Пути миграций | Integrator core: `apps/integrator/src/infra/db/migrations/core/`. Webapp: `apps/webapp/migrations/`. |
| CI-only webapp | Скрипт `deploy-webapp-prod.sh` существует, в CI **не** используется; для v2 cross-DB — предпочтительно только полный `deploy-prod.sh`. |
| Обратная совместимость | Пока webapp не меняется, новая колонка/инвариант integrator не должен ломать существующий webapp runtime. |

Имена БД на production (не секреты): см. [`../ARCHITECTURE/SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md) — integrator `tgcarebot`, webapp `bcb_webapp_prod`.

---

## Deploy 1 — Schema prep (integrator only DDL)

- [ ] Новый SQL в `apps/integrator/src/infra/db/migrations/core/` (имя вида `YYYYMMDD_NNNN_*.sql`).
- [ ] `users.merged_into_user_id` nullable, FK на `users(id)`, `CHECK (merged_into_user_id IS NULL OR merged_into_user_id <> id)` (constraint `users_merged_into_user_id_not_self_check`), partial index `idx_users_merged_into_user_id` для поиска alias.
- [ ] Обновить [`apps/integrator/src/infra/db/schema.md`](../../apps/integrator/src/infra/db/schema.md) и при необходимости [`../ARCHITECTURE/DB_STRUCTURE.md`](../ARCHITECTURE/DB_STRUCTURE.md).
- [ ] **Нет** изменений write path (кроме возможных no-op). Webapp blocker **активен**.
- [ ] Rollback-нота: DDL откат вручную только если не было данных в колонке (операционно задокументировать в runbook).

**Gate:** миграция применена; сервисы подняты; поведение продукта не изменилось.

---

## Deploy 2 — Canonical read/write (integrator)

- [ ] Перед enqueue в `projection_outbox`: разрешение `integratorUserId` → canonical winner (обход `merged_into_user_id`).
- [ ] Запись в доменные таблицы integrator: не оставлять «живые» обновления на loser-строке `users` (политика: redirect / reject — зафиксировать в коде и STAGE_2).
- [ ] Тесты: unit/integration на writePort / ключевые repos.
- [ ] Webapp **без** снятия blocker.

**Gate:** нет новых anomaly в outbox из-за loser id; projection-health стабилен.

---

## Deploy 3 — Merge service + outbox + webapp realignment

- [ ] `mergeIntegratorUsers(winnerId, loserId, …)` в транзакции, порядок блокировок детерминирован.
- [ ] Политика по каждому типу события в `projection_outbox`: rewrite payload / пересчёт idempotency / cancel+replay (см. STAGE_3).
- [ ] Webapp: job или controlled SQL batch для rekey таблиц с `integrator_user_id` (инвентаризация в STAGE_4).
- [ ] Проверочные SQL из [`sql/README.md`](sql/README.md).

**Gate:** на стенде/проде после тестового merge — нет loser id в целевых projection-таблицах webapp.

---

## Deploy 4 — Feature flag + flow switch

- [ ] Ключ в `system_settings` (scope `admin`) в [`ALLOWED_KEYS`](../../apps/webapp/src/modules/system-settings/types.ts) + UI настроек при необходимости.
- [ ] При включённом флаге: вызов integrator merge **до** `POST /api/doctor/clients/merge`.
- [ ] Снять **безусловный** hard blocker только когда флаг on **или** заменить на «блокер если флаг off».
- [ ] Документировать быстрый rollback: выключить флаг без redeploy.

**Gate:** e2e сценарий «два integrator id» проходит; при выключенном флаге поведение как v1.

---

## Междеплойная пауза

Рекомендация: **24–48 ч** мониторинг audit + projection health между N и N+1.
