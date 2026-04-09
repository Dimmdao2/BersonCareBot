# Stage A — Стабилизация v1 (перед v2)

**Цель:** короткое окно (рекомендация 3–7 дней) после закрытия webapp-only v1, чтобы зафиксировать эксплуатацию и убедиться в отсутствии регрессий до начала integrator-side v2.

## Область наблюдения

| Сигнал | Где смотреть |
|--------|----------------|
| `user_purge`, `user_merge`, `user_purge_external_retry` | `admin_audit_log`, UI «Лог операций» `/app/settings` |
| `auto_merge_conflict`, `auto_merge_conflict_anomaly` | то же + `openAutoMergeConflictCount` |
| Конфликты ingestion | `POST /api/integrator/events` не должен зацикливаться на **503** для merge-class ошибок — ожидается **202** + аудит (см. [`../ARCHITECTURE/PLATFORM_USER_MERGE.md`](../ARCHITECTURE/PLATFORM_USER_MERGE.md)) |

## Действия оператора

1. Разбирать открытые `auto_merge_conflict` текущим v1 flow (ручное разрешение дубликатов / политика продукта).
2. При подозрении на loop: журнал `bersoncarebot-webapp-prod`, фильтр по integrator events; сверка с `events.ts` и `route.ts`.
3. Strict purge / manual merge: не ожидать новых классов ошибок без записи в audit.

## Фиксация результата

- Добавить краткую запись в [`REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md`](../REPORTS/STRICT_PURGE_MANUAL_MERGE_EXECUTION_LOG.md) или в [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md): дата, период, выводы.
- Явно указать: **hard blocker `different_non_null_integrator_user_id` остаётся до завершения v2**.

## Gate к старту Deploy 1 v2

- [ ] Нет необходимости экстренного hotfix по v1 merge/purge/conflict path.
- [ ] Команда готова к 4-шаговому деплою и мониторингу между шагами.
