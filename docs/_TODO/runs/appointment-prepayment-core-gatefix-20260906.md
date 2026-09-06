# Исправление двух merge-блокеров appointment prepayment core

Прочитать `AGENTS.md`, особенно §5, §10a, §10b и §24. Работать в существующей `wt/appointment-prepayment-core`, не создавать новую ветку и не расширять scope.

## Источник оракула
`docs/_TODO/DOCTOR_MOBILE_UI_OWNER_ACCEPTANCE_2026-09-04.md`, `PAY-APPT-18`: «Снимок стоимости, условие/сумма предоплаты, дедлайн и платёжный статус имеют один канонический write-path; роли врача, пациента, системной процедуры и webhook имеют только необходимые права чтения и записи через центральную схему grants.»

Предыдущая финальная приёмка: `docs/_TODO/APPOINTMENT_PREPAYMENT_CORE_INDEPENDENT_AUDIT_2026-09-06.md`, раздел «Финальная приёмка исправлений», commit `727f9703e`.

## Исправить

1. Путь `cash` для записи в `pgPatientPayments.ts` сейчас уходит в именованный SQL-корень до существующих TypeScript-гейтов `runPatientPaymentMutation`, поэтому `pgPatientPayments.principal.unit.test.ts` имеет три падения из шести. Сохрани атомарный именованный корень и SQL-защиту, но восстанови тот же обязательный tenant/principal gate для этого пути без дублирования правил.
2. Источник `api/internal/booking-prepayment/expire:POST` добавлен в locked-набор cron-источников без объявленной relation-возможности. Добавь минимальную возможность в центральную privilege declaration и перегенерируй штатные artifacts; никаких ручных разрозненных `GRANT`.

## Приёмка

- `pgPatientPayments.principal.unit.test.ts` — 6/6 зелёных и краснеет при снятии восстановленного TS-гейта.
- `journalRetention.contract.test.ts` зелёный и по-прежнему ловит отсутствие relation-возможности для нового cron-источника.
- Существующие payment/prepayment acceptance-тесты, privilege generated check, privilege suite, typecheck и scoped lint зелёные.
- Временные fault injection изменения полностью откатить; дерево завершить чистым коммитом.

Не исправлять унаследованный `anamnesis/route.ts:PATCH` в этой ветке: это отдельный дефект основной ветки и не относится к платёжному потоку.
