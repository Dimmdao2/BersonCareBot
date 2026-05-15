---
name: Wave2 Phase01 Integrator tail SQL
overview: Убрать остатки сырого DbPort.query/pg-строк в apps/integrator для outgoing_delivery_queue, bookingProfilesRepo и мелких repos-чтений; claim-ветки очередей сохранить через execute(sql) при необходимости.
status: pending
isProject: false
todos:
  - id: p01-inventory-scope
    content: "Сверить scope с [RAW_SQL_INVENTORY.md](../RAW_SQL_INVENTORY.md) §1.2–1.3; зафиксировать список файлов этапа (outgoingDeliveryQueue, bookingProfilesRepo, canonicalUserId, platformUserDeliveryPhone, linkedPhoneSource, idempotencyKeys, adminStats, …) без расширения на P4-репо без причины."
    status: pending
  - id: p01-outgoing-delivery
    content: "outgoingDeliveryQueue.ts: Drizzle insert/update/reschedule/mark*; claim CTE+SKIP LOCKED — либо оставить execute(sql), либо перенос только с EXPLAIN+тестом конкуренции; обновить/добавить unit-тесты порта."
    status: pending
  - id: p01-booking-profiles
    content: "bookingProfilesRepo.ts: поэтапно заменить db.query на getIntegratorDrizzleSession + builder/+sql; отдельно учесть риск дублей rubitime_* (см. LOG/TODO)."
    status: pending
  - id: p01-small-repos
    content: "Мелкие чтения (canonicalUserId, platformUserDeliveryPhone, linkedPhoneSource, resolvePlatformUserIdForRubitimeBooking, integrationDataQualityIncidents): Drizzle select; динамику — whitelist + sql фрагменты."
    status: pending
  - id: p01-settings-sync-route
    content: "settingsSyncRoute.ts: insert onConflict через Drizzle; проверить инвалидации кэшей и зеркало system_settings (правила system-settings-integrator-mirror)."
    status: pending
  - id: p01-verify
    content: "pnpm --dir apps/integrator run typecheck && pnpm --dir apps/integrator run test; точечный rg на оставшийся db.query в зоне этапа."
    status: pending
---

# Wave 2 — этап 1: хвост интегратора (сырой SQL → Drizzle)

## Размер и приоритет

**M / L** (высокий риск у `bookingProfilesRepo` и очередей). Первый этап волны Wave 2 по [DRIZZLE_TRANSITION_PLAN.md](../DRIZZLE_TRANSITION_PLAN.md).

## Definition of Done

- [ ] В перечисленных файлах этапа нет «случайного» строкового `db.query`, кроме явно задокументированных исключений (мигратор, execute(sql) для claim).
- [ ] `pnpm --dir apps/integrator run typecheck` и `pnpm --dir apps/integrator run test` зелёные.
- [ ] В [LOG.md](../LOG.md) кратко зафиксирован итог этапа и известные остатки/backlog.

## Scope

**Разрешено:** `apps/integrator/src/infra/db/repos/*`, `apps/integrator/src/integrations/bersoncare/settingsSyncRoute.ts`, схемы в `apps/integrator/src/infra/db/schema/*`, тесты рядом с репозиториями.

**Вне scope:** webapp, `packages/*`, смена корневого CI, изменение контракта `DbPort` без отдельной задачи.

## Шаги и локальные проверки

1. **Сверка инвентаризации** — `rg "await db\\.query\\(" apps/integrator/src/infra/db/repos` + сверка с таблицей в RAW_SQL_INVENTORY.
2. **outgoingDeliveryQueue** — чеклист: идемпотентный insert; reset stale; claim семантика; mark sent/dead/reschedule.
3. **bookingProfilesRepo** — чеклист: ключевые SELECT/UPSERT; не смешивать cutover v1/v2 без постановки из TODO.
4. **Мелкие repos** — чеклист: каждый файл — хотя бы один тест или расширение существующего readPort-теста где уместно.
5. **settingsSyncRoute** — чеклист: JSON колонки, `updated_by`, поведение ON CONFLICT.

## Лог выполнения

Вести кратко в [../LOG.md](../LOG.md) под датой выполнения (решения, что не делали, ссылки на PR).
