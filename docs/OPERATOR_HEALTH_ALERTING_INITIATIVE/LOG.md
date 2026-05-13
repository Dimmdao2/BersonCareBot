# Execution log — Operator Health & Alerting

Журнал исполнения инициативы. Записи добавляются по мере работы.

## Записи

### 2026-05-03 — Декомпозиция фаз

- Добавлены детальные планы **PHASE_A** … **PHASE_G** (шаги, checklist, scope, DoD по фазе); `MASTER_PLAN.md` §5 заменён на таблицу ссылок.
- Код не менялся.

### 2026-05-13 — MVP implementation plan

- Добавлен [`MVP_IMPLEMENTATION_PLAN.md`](MVP_IMPLEMENTATION_PLAN.md): уточнения после проверки кода (дедуп GCal **без** `recordId` в ключе, хуки в **postCreate + webhook**, таблица в **`public`**, защита probe, resolution MVP A/B, риски).
- Обновлён Cursor plan `mvp_operator_health_alerting_9310cffe.plan.md` — ссылка на канон в репо; todos: объединён шаг GCal в оба файла.
- План дополнительно усилен до исполняемого формата: fixed decisions, строгие scope boundaries, data contract (`public.operator_incidents`), `error_class` taxonomy, пошаговые локальные проверки и явный минимальный auto-resolve для probe-инцидентов.

### 2026-05-13 — Расширение MVP: backup lifecycle + retention + job ticks

- В [`MVP_IMPLEMENTATION_PLAN.md`](MVP_IMPLEMENTATION_PLAN.md) добавлен отдельный трек `E1..E4`: weekly+prune для `postgres-backup.sh`, фиксированная retention policy, запись last-run статусов backup jobs в БД и вывод в admin system-health.
- Зафиксировано архитектурное решение по нагрузке: **без нового постоянного daemon worker** для очистки; lifecycle через host cron в тихое окно (классический и дешёвый по ресурсам подход).

