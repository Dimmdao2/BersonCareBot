# В9б S01 — независимый аудит удаления пяти legacy projections (#1081)

Прочитать `AGENTS.md` §5/§10/§24. Authority:
`docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md` S01 и candidate `86344858e`.

Это one-off schema retirement: проверять diff/AST/SQL/journal, новый test или DB harness не создавать. PASS только если:

1. Удалены ровно пять legacy tables и их schema declarations/backrefs/FK: `bookings`, `services`, `specialists`,
   `branches`, `clinic_rooms`; migration `0304` содержит TEMPORARY LOCAL marker и drop ordering не ломает FK.
2. `patient_bookings`, `appointment_records`, все `be_*` booking sources и их связи не удалены/не переименованы.
3. `pgBranches` и его DI wiring исчезли, но D1 identity writer и D10 projection transport не затронуты этим срезом.
4. Grants generator больше не выдаёт права пяти удалённым таблицам и его smoke остаётся зелёным.
5. Journal/tag/index согласованы; raw-SQL gate, scoped/full webapp lint и typecheck зелёные; diff не содержит
   unrelated product/docs cleanup.

Записать короткий audit report с exact commands и PASS/FAIL по пяти пунктам, коммитить только report. Не исправлять
product, не трогать DB/DEV/TEST/PROD/deploy/taskdb/plan checkbox, не пушить.
