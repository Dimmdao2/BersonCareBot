# Независимый аудит census сырого SQL-текста — #1082

## Классификация «тест или взгляд»

Это разовое исследование и механическая сверка итогового состояния: проверять командами и inspection. Постоянные
source-text tests не писать.

## Роль и authority

Ты независимый `auditor-live`, а не исполнитель и не автор новой архитектуры. До проверки прочитай `AGENTS.md`
§5, §7, §10a и §24, `docs/ORCHESTRATION_BINDINGS.md`, пункт 1
`docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` и Track D authority
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` D10/D15/D18.

Target — commit `064d768d3` на `wt/sql-text-census`, файл
`docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS.md`. Это разовое исследование: доказательство — точный
повторяемый census и inspection, не тесты на текст исходников. Product code, plan-checkbox, DB, DEV, TEST, PROD,
deploy и push запрещены.

## Обязательный audit gate

До доверия выводам независимо восстанови denominator всех production-вызовов `runWebappPgText(` под
`apps/webapp/src/**`, исключая tests/specs. Не используй числа отчёта как входные.

1. Сверь число файлов, число invocation и per-file counts. Каждая строка таблицы должна называть тот же измеритель,
   который заявлен в методе, а сумма строк должна в точности равняться denominator.
2. Для каждого invocation восстанови enclosing operation/export и caller reachability. Каждый invocation должен
   попасть ровно в одну из категорий `TRANSLATE_LIVE`, `WAIT_OVERLAP`, `DELETE_BY_OWNER_STAGE`,
   `LOW_LEVEL_EXEMPT`; смешанный файл делить на именованные операции с воспроизводимыми строками/символами.
3. Для `WAIT_OVERLAP` проверь конкретную owner-stage ссылку и отсутствие права преждевременно удалять reachable
   human path. Для `DELETE_BY_OWNER_STAGE` нужен доказанный текущий zero-producer/deletion authority. Наличие слова
   `projection` недостаточно.
4. Для `TRANSLATE_LIVE` проверь существование заявленного Drizzle schema/typed `sql` pattern и человеческий
   контракт. Не считай stored procedure, lock, transaction или RLS-принципал исключением: они должны идти через
   typed Drizzle fragment/transaction, если это допускает реальный port contract.
5. Сверь overlap с текущим тарифным workstream, Ч4/Ч4б/Ч7/В9б и Track D, чтобы первый implementation slice не
   полез в живой соседний scope и не переводил код, который owner-stage удалит.
6. Проверь первую bounded live-slice: действительно ли она минимальна, reachable, не требует миграции/новой
   сущности и имеет измеримый human outcome. Не принимай фиктивную integration-проверку без существующего test
   harness/pattern.

Уже известная оркестратору контрольная аномалия, которую нельзя молча исправить в target: таблица заявляет
invocation-counts, но её 44 числа суммируются в `413`, тогда как exact invocation command даёт `155`; например,
`pgDoctorClients` указан как `36`, а literal `runWebappPgText(` встречается `10` раз. Определи первопричину и все
выводы, которые из-за неё перестают быть доказанными.

## Сдача

Создай только `docs/_TODO/runs/testsuite-v2/RAW_SQL_TEXT_CENSUS_AUDIT_REPORT.md`. В отчёте: target SHA, exact
commands, independently measured totals, reconciliation table, список findings с достижимым impact, бинарный
`PASS`/`FAIL`, минимальный fix-round и `НЕ ПРОВЕРЕНО`. При `FAIL` census не переписывай. Любые временные файлы и
изменения вне audit report откати. Коммит audit artifact создаёт оркестратор после возврата.
