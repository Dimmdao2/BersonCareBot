# Stage 7: Финальный интеграционный аудит

Цель этапа: подтвердить релизную готовность всего блока после закрытия F-01..F-06.

## S7.T01 - Full CI

**Цель:** получить единый технический сигнал готовности.

**Шаги:**

1. `pnpm install --frozen-lockfile`
2. `pnpm run ci`
3. Зафиксировать SHA и время прогона.

**Критерии готовности:**

- полный CI green на финальном SHA.

---

## S7.T02 - SQL/метрики compat и inbox

**Цель:** подтвердить data-quality и отсутствие регрессий в критичных потоках.

**Проверки:**

1. Compat quality:
   - количество degraded строк;
   - количество строк без обязательных полей full compat.
2. Outbox health:
   - новые `dead` по `platform_user_id null`.
3. Online intake inbox:
   - корректность count по статусам;
   - наличие patient identity в doctor list/details выборке.

**Критерии готовности:**

- метрики в допустимых границах и без новых критичных отклонений.

---

## S7.T03 - Ручной smoke (booking/intake/doctor)

**Цель:** подтвердить e2e поведение глазами оператора.

**Обязательные smoke-сценарии:**

1. Booking ingest + compat update.
2. Online intake LFK с mixed attachments.
3. Doctor inbox list/details с patientName/patientPhone.
4. Уведомление TG/MAX с deep-link на конкретный request.

**Критерии готовности:**

- все 4 сценария проходят без блокеров.

---

## S7.T04 - Финальный аудит и релизный вердикт

**Цель:** формально закрыть master-plan.

**Шаги:**

1. Composer 2 проводит финальный аудит блока.
2. Формируется итог: `approve_for_release | rework_required`.
3. При `rework_required` запускается точечный `GLOBAL FIX` только по findings.
4. Финальный результат фиксируется в `AGENT_EXECUTION_LOG.md`.

**Критерии готовности:**

- итоговый вердикт `approve_for_release`.

---

## Audit Gate Stage 7 (финальный)

`PASS` только если одновременно:

1. `pnpm run ci` green;
2. SQL/метрики подтверждают отсутствие новых критичных проблем;
3. smoke booking/intake/doctor flows пройден;
4. Composer 2 выдал `approve_for_release`.
