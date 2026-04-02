# Checklists: Booking Rework City Service

## 1) Pre-start checklist

- [x] `STAGE_1_SPEC_AND_CONTRACTS.md` прочитан целиком (самоаттестация команды; при смене ответственного — перечитать)
- [x] подтверждено: online не входит в текущий scope
- [x] подтверждено: source of truth каталога в webapp DB
- [x] согласован `API_CONTRACT_V2.md`
- [x] согласован `MIGRATION_CONTRACT_V2.md`

## 2) Stage completion checklist

Применять в конце каждого этапа.

- [x] Все задачи этапа в `EXECUTION_LOG.md` имеют `done`
- [x] Нет `blocked` без owner/next-step
- [x] Все новые файлы добавлены в тесты/доки где нужно
- [x] Локально пройдены релевантные тесты этапа
- [x] Нет новых lint/type ошибок

## 3) DB migration checklist (Stage 2)

- [x] Миграции применяются с нуля
- [x] Миграции корректно применяются поверх существующей БД
- [x] Seed идемпотентен
- [x] Backfill поддерживает dry-run
- [x] Backfill формирует отчет `updated/skipped/conflicts`
- [x] Нет разрушающих изменений до cutover switch

## 4) API contract checklist (Stage 4-5)

- [x] In-person slots/create принимают explicit Rubitime IDs
- [x] Для in-person v2 нет обязательного `category`
- [x] Ошибки API детерминированы и документированы
- [x] HMAC-подпись и guard в integrator не ослаблены
- [x] Backward compatibility policy соблюдена

## 5) Sync and webhook checklist

- [x] Запись создается в webapp и синкается в Rubitime
- [x] Отмена записи корректно синкается
- [x] Webhook апдейтит локальную запись по `rubitime_id`
- [x] Snapshot-поля в `patient_bookings` сохраняются корректно
- [x] Legacy записи читаются без регрессии UI
- [x] **F-04 / Stage 2:** compat `full` только при реальном `branch_service_id` (lookup по каталогу), `compat_quality` из `computeCompatSyncQuality`, provenance-колонки + UI-маркер «Из расписания», backfill `backfill-rubitime-compat-snapshots` (payload + catalog)

## 6) Release readiness checklist (in-person rework, Stages 1–7)

- [x] Stage 1-7 завершены
- [x] Аудит `S6.T04` имеет статус approve (`AUDIT_STAGE_2_6.md`), включая реестр замечаний этапов 1–5 (§2)
- [x] `pnpm run ci` green на коммите, который уходит в merge/release (зафиксировать `git rev-parse HEAD` в `EXECUTION_LOG.md`)
- [x] Тест-матрица: `TEST_MATRIX.md` §6 (ID → автотесты) актуальна
- [x] Подготовлен `CUTOVER_RUNBOOK.md`
- [x] Зафиксирован rollback plan (`CUTOVER_DB_PLAN.md` + runbook)
- [x] Заполнен итог в `EXECUTION_LOG.md` — **`ready`**

## 7) Online intake + compat-sync release readiness checklist (Stages 8–15)

- [x] Stage 8 (audit remediation) завершён: docs-sync, legacy-policy, SHA-traceability
- [x] Stage 9–10 (online intake): спека, миграции, репозитории, API утверждены и реализованы
- [x] Stage 11 (compat-sync): ручные записи из Rubitime появляются в `patient_bookings` с полными данными
- [x] Stage 12–13 (UX + inbox): patient wizard online и doctor/admin inbox готовы
- [x] Stage 14 (hardening): runbook обновлён, monitoring-queries задокументированы
- [ ] online-safe gate закрыт перед `RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED=false`
- [x] `pnpm run ci` green на финальном SHA Stage 15
- [ ] `EXECUTION_LOG.md` содержит итоговую SHA + дату CI для каждого Stage 8–15
