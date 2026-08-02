# Тест или взгляд: один смешанный pass

SQL/parameter equivalence и отсутствие нового bypass проверяются взглядом и одноразовой компиляцией
`PgDialect().sqlToQuery()`; существующее public-booking поведение — уже имеющимися route/page tests. Постоянный
source-text test и новый DB harness запрещены. Канон: `AGENTS.md` §5, §10b, §24. Authority:
`RAW_SQL_PUBLIC_BOOKING_ENTRY_BRIEF.md`, raw-text census и candidate `f54f50b00`.

До чтения candidate diff/tests зафиксировать минимальный kill-set:

1. clinic lookup получает другой slug/аргумент, переставленный placeholder или изменённый PostgreSQL cast/function;
2. canonical slug/availability меняют null/boolean/result mapping;
3. OTP issue/consume меняют phone/hash/expiry argument order, result shape или одноразовую семантику;
4. один из двух adapters остаётся на `runWebappPgText`, использует `sql.raw`, сырой driver или создаёт второй port;
5. diff выходит за два production adapters и разрешённые две evidence docs либо затрагивает billing/V9б.

Сверить все 5 compiled fragments и точные params с parent, повторить четыре public-booking test files, scoped
ESLint/typecheck, raw-SQL gate, AST slice+census и diff-check. Для one-time fault evidence достаточно временно
переставить один slug/OTP параметр и показать, что compiled-query comparison ловит отличие; временный product fault
обязательно откатить. Аудитор не чинит product, не push и не трогает DEV/TEST/PROD. Итог — бинарный `PASS` либо
достижимый finding; audit report под `docs/_TODO/runs/testsuite-v2/` допустим.
