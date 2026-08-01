# Raw SQL text — doctor calendar timezone read (#1082)

Прочитать `AGENTS.md` §5/§10/§24 и authority
`docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` пункт 1 +
`docs/_TODO/runs/single-entry/RAW_SQL_TEXT_CENSUS.md`. Product base — свежий descendant
`wt/single-entry-integration`; принятый doctor-notes slice уже уменьшил direct legacy denominator.

Источник оракула: `AGENTS.md` §5 — «К базе — только через порт своего приложения на drizzle»; существующий
`DoctorCalendarTimezonePort` возвращает личную `calendar_timezone` указанного platform user либо `null`.

## Последствие

Открытие `/app/doctor/schedule` и `GET /api/doctor/booking-engine/calendar` читает личную timezone врача для
границ/отображения календаря. Простой read всё ещё исполняет legacy `$1` SQL text через bridge, поэтому пункт 1
остаётся незакрытым, хотя chokepoint gate зелёный.

## Scope

1. Изменить только `apps/webapp/src/infra/repos/pgDoctorCalendarTimezone.ts` и короткий report
   `docs/_TODO/runs/single-entry/RAW_SQL_DOCTOR_CALENDAR_TIMEZONE_REPORT.md`.
2. Заменить один `runWebappPgText` на существующий Drizzle path:
   `getWebappSqlDb().select({ calendarTimezone: platformUsers.calendarTimezone }).from(platformUsers)` с exact
   `eq(platformUsers.id, platformUserId)` и `limit(1)`; вернуть `rows[0]?.calendarTimezone ?? null`.
3. Сохранить `DoctorCalendarTimezonePort`, отсутствие organization filter, fallback/error semantics и всех callers.
   Не трогать held `pgPlatformUserCalendarTimezone.ts`, routes/modules/DI/schema/migrations/DB/harness и не создавать
   helper/abstraction.
4. Классификация — разовый transport conversion: отдельный permanent test не писать. Проверить diff/AST и
   существующие compile/gates; `timezoneContract.stage8.pg.test.ts` не является доказательством этого repo read.
5. В report честно разделить denominators: direct AST на base = 84 файлов / 552 calls, accepted disposition
   TL 386 + WO 166; broad `$n` production caller census = 99 файлов, включая 21 вне direct bridge denominator.
   После slice direct = 83/551, TL 385, WO 166. Эти числа не закрывают весь raw-SQL-text пункт.

## Приёмка

- target file: `runWebappPgText` 1→0; нет `$n`, `webappSqlFromPgText`, `sql.raw`;
- повтор exact AST census из принятого report даёт 83 files / 551 calls; broad caveat записан;
- `pnpm --dir apps/webapp exec eslint src/infra/repos/pgDoctorCalendarTimezone.ts`;
- `pnpm --dir apps/webapp typecheck`; `node scripts/check-no-new-raw-sql.mjs`; `git diff --check`;
- один product commit, не пушить и не закрывать plan checkbox.

После worker — один независимый inspection audit, без DB/DEV/TEST/PROD/deploy/taskdb.
