# Checklists: Booking Rework City Service

## 1) Pre-start checklist

- [ ] `STAGE_1_SPEC_AND_CONTRACTS.md` прочитан целиком
- [ ] подтверждено: online не входит в текущий scope
- [ ] подтверждено: source of truth каталога в webapp DB
- [ ] согласован `API_CONTRACT_V2.md`
- [ ] согласован `MIGRATION_CONTRACT_V2.md`

## 2) Stage completion checklist

Применять в конце каждого этапа.

- [ ] Все задачи этапа в `EXECUTION_LOG.md` имеют `done`
- [ ] Нет `blocked` без owner/next-step
- [ ] Все новые файлы добавлены в тесты/доки где нужно
- [ ] Локально пройдены релевантные тесты этапа
- [ ] Нет новых lint/type ошибок

## 3) DB migration checklist (Stage 2)

- [ ] Миграции применяются с нуля
- [ ] Миграции корректно применяются поверх существующей БД
- [ ] Seed идемпотентен
- [ ] Backfill поддерживает dry-run
- [ ] Backfill формирует отчет `updated/skipped/conflicts`
- [ ] Нет разрушающих изменений до cutover switch

## 4) API contract checklist (Stage 4-5)

- [ ] In-person slots/create принимают explicit Rubitime IDs
- [ ] Для in-person v2 нет обязательного `category`
- [ ] Ошибки API детерминированы и документированы
- [ ] HMAC-подпись и guard в integrator не ослаблены
- [ ] Backward compatibility policy соблюдена

## 5) Sync and webhook checklist

- [ ] Запись создается в webapp и синкается в Rubitime
- [ ] Отмена записи корректно синкается
- [ ] Webhook апдейтит локальную запись по `rubitime_id`
- [ ] Snapshot-поля в `patient_bookings` сохраняются корректно
- [ ] Legacy записи читаются без регрессии UI

## 6) Release readiness checklist

- [ ] Stage 1-6 завершены
- [ ] Аудит `S6.T04` имеет статус approve
- [ ] `pnpm run ci` green
- [ ] Подготовлен `CUTOVER_RUNBOOK.md`
- [ ] Зафиксирован rollback plan
- [ ] Заполнен итог в `EXECUTION_LOG.md` (`ready/not-ready`)
