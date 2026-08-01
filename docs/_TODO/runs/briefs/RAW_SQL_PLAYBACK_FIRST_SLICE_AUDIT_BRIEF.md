# Независимый аудит первого raw-SQL text slice (#1082)

## Тест или взгляд

Это разовая transport-конверсия одного repository-файла: проверять взглядом, AST census, компиляцией Drizzle
fragment и targeted type/lint. Permanent тест на импорт/строку исходника не писать.

Прочитать `AGENTS.md`, особенно §5, §10a и §24. Authority:
`docs/_TODO/runs/briefs/RAW_SQL_TEXT_FIRST_SLICE_PLAYBACK_BRIEF.md`; candidate `1c020485c`.

Проверить независимо:

1. В `pgPlaybackResolutionEvents.ts` больше нет legacy `$1..$n`/`runWebappPgText`; все четыре значения связаны
   параметрами Drizzle, а не `sql.raw`/интерполяцией строки.
2. Вызывается та же функция `app.record_media_playback_resolution_event(uuid,uuid,text,boolean)` с тем же порядком
   аргументов; новый helper/port/schema/migration не появился.
3. Caller best-effort semantics и analytics readers не менялись.
4. Scoped lint, webapp typecheck, `git diff --check` зелёные; diff ограничен product-файлом и evidence report.

Никакой DB/DEV/TEST/PROD. Не исправлять product. Оставить один короткий audit-report и коммит; verdict PASS/FAIL с
конкретным достижимым последствием. Fault injection и новый behavior harness для механической конверсии запрещены.

