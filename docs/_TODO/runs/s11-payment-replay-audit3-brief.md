# Тест или взгляд — S11 payment-level replay correction

Прочитай `AGENTS.md`: карту, §1, §5, §10a–§10b целиком, auth/M2M применимые module docs и §24.
Authority: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md` S11; owner rules §21/§24.1;
`docs/_TODO/runs/s11-lifecycle-outbox-audit2.md` findings F1/F2. Exact candidate:
`9f2c3fdc7` поверх `1daecd17b`; не подтягивай fresh feat.

## Scope новой поверхности

Взглядом + допустимыми behavioral tests проверь только correction F1/F2 и новый signed M2M write path:

- migration заменяет per-appointment jobs ровно одним stable payment-level job, не оставляет старые trigger/job
  semantics и не дублирует queue rows при повторе;
- resident worker вызывает signed webapp endpoint, а не direct unauthenticated path; endpoint fail-closed по tenant,
  payment/org binding и входному schema; чужой org/payment нельзя обработать;
- endpoint переиспользует существующий payment-confirmed handler, действительно чинит `patient_bookings`, строит
  прежнюю multi-slot aggregation и channel suppression, а любой transient downstream failure возвращается worker
  как retryable;
- webhook request больше не запускает конкурентный callback; worker retry/idempotency не создаёт повторных
  payment/feed/channel effects;
- privilege/migration replacement безопасны, старый trigger/function ownership не оставляет обход.

Не повторяй blind audit1 и не расширяй scope на ещё не реализованный общий inventory: его статус уже FAIL и будет
отдельным worker-этапом. Не писать UI/DOM/copy/source/SQL-text тесты. DB поведение допускает только именованную DEV
rollback-only проверку по канону, если она нужна и безопасна; временную БД не создавать.

Создай `docs/_TODO/runs/s11-payment-replay-audit3.md` с PASS/FAIL correction, конкретными findings и evidence.
Недостающий допустимый acceptance-test добавляй один раз, с fault injection и откатом production mutation.
Product fix не делать. Запусти прежний oracle, focused route/worker/handler tests, webapp/integrator typecheck,
migration/privilege gates. Не full CI, live UI, deploy/push. Закоммить только audit tests/artifact явными путями и
оставь дерево чистым.
