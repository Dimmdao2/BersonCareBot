# Сырой SQL-текст — первый bounded slice playback telemetry (#1082)

Прочитать `AGENTS.md`, особенно §5 и §24. Authority:
`docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md`, раздел `First bounded live-slice brief`; независимая
приёмка карты — `RAW_SQL_TEXT_CENSUS_REAUDIT_REPORT.md` (`300772f3d`, PASS).

## Последствие

`pgPlaybackResolutionEvents.ts` всё ещё передаёт SQL строкой с `$1..$4` в legacy bridge. Это оставляет настоящий
сырой SQL-текст в рабочем пути после разрешения медиа и не приближает код к целевой Drizzle boundary.

## Scope

Только `apps/webapp/src/infra/repos/pgPlaybackResolutionEvents.ts` и, если реально требуется, короткий fix-report
рядом с census. Заменить единственный `runWebappPgText` на существующие `getWebappSqlDb` +
`runWebappSql(db, sql\`...\`)` с Drizzle-bound параметрами. Вызов существующей
`app.record_media_playback_resolution_event` и best-effort семантику вызывающего пути не менять.

Не создавать новый port/helper/schema/migration/test-harness, не трогать `runWebappSql.ts`, функцию БД, principal,
analytics readers или другие 556 вызовов. DB/DEV/TEST/PROD не запускать.

## Приёмка и сдача

Это разовая transport-конверсия: доказательство — inspection итогового fragment, AST census ровно этого файла
`runWebappPgText` 1→0 и `runWebappSql` 0→1, webapp typecheck, scoped lint, `git diff --check`. Permanent test на
текст/импорт не писать. В fix-report назвать точные команды и результат. Коммитить только разрешённый scope, не пушить.

