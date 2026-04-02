# Stage 1: F-01 Critical - Устойчивый ingest и user linking

Цель этапа: перестать терять/блокировать обработку Rubitime событий при временных сбоях и при отсутствии прямого `integrator_user_id`.

## S1.T01 - Зафиксировать целевой контракт ingest resiliency

**Цель:** формально описать non-fatal обработку и критерии requeue/dead.

**Файлы (док/код):**

- `docs/BRANCH_UX_CMS_BOOKING/BOOKING_REWORK_CITY_SERVICE/COMPATIBILITY_RUBITIME_WEBAPP.md`
- `apps/webapp/src/modules/integrator/events.ts`

**Шаги:**

1. Зафиксировать, что временные ошибки (`network/timeout/503/dependency`) не переводят событие в финальный fail с первой попытки.
2. Разделить ошибки на recoverable/non-recoverable.
3. Утвердить max attempts, backoff policy, переход в dead-letter.

**Тесты:**

- [ ] contract-level test на классификацию ошибок.

**Критерии готовности:**

- ingest не падает в hard-fail на первом временном сбое.

---

## S1.T02 - Реализовать user linking по телефону

**Цель:** не блокировать create/update path при `integrator_user_id` missing.

**Файлы:**

- `apps/integrator/src/integrations/rubitime/connector.ts`
- `apps/integrator/src/infra/db/writePort.ts`
- `apps/webapp/src/infra/repos/pgPatientBookings.ts`

**Шаги:**

1. Нормализовать телефон до единого формата (`E.164` или last10 policy, единообразно по проекту).
2. Добавить fallback lookup пользователя по телефону при отсутствии `integrator_user_id`.
3. Документировать deterministic tie-break policy при нескольких совпадениях.
4. Гарантировать, что pipeline не ломается из-за `platform_user_id null` на recoverable пути.

**Тесты:**

- [ ] lookup by phone (single match).
- [ ] ambiguous match (ожидаемая безопасная деградация без crash).
- [ ] no match (событие уходит в retry queue, не в immediate dead).

**Критерии готовности:**

- новые события не падают с `null platform_user_id` как первым исходом.

---

## S1.T03 - Очередь/worker/retries/backoff

**Цель:** сделать устойчивую асинхронную обработку ingest-cases.

**Файлы:**

- `apps/integrator/src/infra/runtime/worker/main.ts`
- `apps/integrator/src/infra/runtime/worker/*`
- `apps/webapp/src/modules/integrator/*`

**Шаги:**

1. Включить bounded retry (`attempts_done`, `next_try_at`).
2. Реализовать экспоненциальный backoff с upper bound.
3. Сохранить idempotency ключи для повторной обработки одного события.
4. Развести transient/permanent ошибки в коде воркера.

**Тесты:**

- [ ] retries progression.
- [ ] upper bound attempts.
- [ ] idempotent reprocess same event.

**Критерии готовности:**

- одно событие не дублирует бизнес-запись при ретраях.

---

## S1.T04 - Dead-letter policy и управляемый requeue

**Цель:** добавить предсказуемое поведение dead-letter и безопасный возврат в pending.

**Файлы:**

- `apps/webapp/scripts/*repair*`
- `apps/webapp/scripts/*requeue*`
- `docs/BRANCH_UX_CMS_BOOKING/REMINDERS_PHASE/RUNBOOK_RUBITIME_RESYNC.md`

**Шаги:**

1. Зафиксировать критерии dead-letter (только после исчерпания retry).
2. Добавить операторский requeue для класса ошибок `platform_user_id null` после фикса linking.
3. Описать dry-run и commit режимы requeue.
4. Добавить контрольные SQL запросы до/после.

**Тесты:**

- [ ] dry-run requeue report.
- [ ] commit requeue changes counters.

**Критерии готовности:**

- requeue предсказуем, повторяем и наблюдаем.

---

## S1.T05 - Проверки этапа и фиксация gate

**Цель:** подтвердить закрытие F-01 формальными evidence.

**Шаги:**

1. Прогнать релевантные unit/integration тесты.
2. Прогнать `pnpm run ci`.
3. Выполнить SQL-проверку: нет новых `dead` по причине `platform_user_id null`.
4. Записать результаты в `AGENT_EXECUTION_LOG.md`.

**Критерии готовности:**

- CI green.
- Gate Stage 1 пройден.

---

## Audit Gate Stage 1 (обязательный)

`PASS` только если одновременно:

1. нет новых dead-case с причиной `platform_user_id null`;
2. временные ошибки уходят в retry/backoff, а не в мгновенный fail;
3. linking по телефону подтвержден тестами;
4. Composer 2 выдал `verdict: pass`.
