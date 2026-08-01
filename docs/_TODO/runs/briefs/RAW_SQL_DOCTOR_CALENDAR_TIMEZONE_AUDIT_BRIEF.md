# Raw SQL doctor calendar timezone — независимый inspection-аудит (#1082)

Тест или взгляд: **взгляд**. Это разовая замена транспорта одного SELECT; permanent source-shape/DB test не нужен.
Прочитать `AGENTS.md` §5/§10/§24, authority `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` пункт 1,
`docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md` и worker brief
`docs/_TODO/runs/briefs/RAW_SQL_DOCTOR_CALENDAR_TIMEZONE_BRIEF.md`. Candidate `d1e473174` в
`wt/sql-text-census`; merge `986516695` исправляет product base до актуального `wt/single-entry-integration`.

Источник оракула: `AGENTS.md` §5 — «К базе — только через порт своего приложения на drizzle»; публичный контракт
`DoctorCalendarTimezonePort` — IANA timezone указанного platform user или `null`.

## Проверить

1. Diff candidate содержит только exact Drizzle conversion и report. `DoctorCalendarTimezonePort`, callers,
   отсутствие role/org filter и semantics missing/null/error не изменены; новой абстракции/SQL-text нет.
2. Target census: `runWebappPgText`, `$n`, `webappSqlFromPgText`, `sql.raw` — ноль; imports используют существующие
   schema + `getWebappSqlDb`, exact `eq(id)` и `limit(1)`.
3. На исправленной базе повторить exact TypeScript AST команду из accepted census. Ожидаемый delta относительно
   `wt/single-entry-integration`: минус один файл/один call; абсолютные числа записать только из команды. Отдельно
   проверить broad `$n` caveat: direct bridge denominator не выдавать за полный raw-SQL-text остаток.
4. Запустить scoped eslint, webapp typecheck, raw-SQL gate, `git diff --check`.
5. Исправить worker report, если его pre-merge абсолютные числа устарели. При PASS разрешено коммитить только audit
   artifact/report correction; product fix не делать. DB/DEV/TEST/PROD/deploy/taskdb не трогать.

## Выход

`docs/_TODO/runs/testsuite-v2/RAW_SQL_DOCTOR_CALENDAR_TIMEZONE_INDEPENDENT_AUDIT.md` с exact commands/delta и
PASS/FAIL. Plan checkbox остаётся открыт.
