# Фаза 7 — Backfill appointment_records (prod)

**Статус:** `deferred` — не в волне 1; задачи сохранены ([`SCOPE_DECISIONS.md`](SCOPE_DECISIONS.md), 2026-05-19)  
**Канон:** [MAIN PLAN.md](MAIN%20PLAN.md) §10  
**Зависит от:** [PHASE_01](PHASE_01_RUBITIME_PLATFORM_USER.md)

## Цель

Связать исторические `appointment_records` без `platform_user_id` с find/create логикой фазы 1; **без** массовых setup-писем.

## Этапы внутри фазы

### 7a — Dry-run (обязательно первым)

- [ ] Скрипт/report: строки с `phone_normalized` и `platform_user_id IS NULL`
- [ ] Счётчики: link by phone, by email, need new user, unresolvable
- [ ] 10–20 примеров строк в отчёт (без PII в git — обезличить или только на хосте)
- [ ] **Никакого** destructive SQL

### 7b — Apply (только после явного OK)

- [ ] Транзакционный или батчевый backfill по согласованному плану
- [ ] Email из payload → unverified contact **если безопасно**
- [ ] **Не** вызывать mass setup email (см. фаза 8)
- [ ] Запись в [`LOG.md`](LOG.md) + runbook в `docs/REPORTS/` при необходимости

## Prod команды

См. [`SERVER CONVENTIONS.md`](../ARCHITECTURE/SERVER%20CONVENTIONS.md) — `psql` только с `set -a && source /opt/env/bersoncarebot/webapp.prod`.

## Definition of Done (7a)

- [ ] Dry-run отчёт согласован
- [ ] Риски (дубли, конфликт email) перечислены

## Definition of Done (7b)

- [ ] Apply выполнен на prod по окну
- [ ] Выборочная проверка врачом: карточки после Rubitime-истории

## Вне scope

- Автоматическая рассылка setup всем историческим клиентам
