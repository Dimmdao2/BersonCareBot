# Тест или взгляд: смешанный независимый pass

Повторяемые usage/access guarantees проверяются поведенческими тестами и одной fault injection на независимый
класс; итоговые grants, scope и архитектурные границы — взглядом. Канон: `AGENTS.md`, особенно §4a, §5, §10b и
§24. Authority: `docs/_TODO/runs/briefs/PLATFORM_QUOTA_USAGE_PATIENT_FILES_BRIEF.md`; candidate `a9228257b`
вместе с merge актуального `feat` `0e2b09745`. Worker report доказательством не считать.

## Blind kill-set до чтения тестов

1. Platform operator получает три независимых usage: занятые места команды, пациенты и объём файлов.
2. Каждый счётчик ограничен запрошенной организацией; приглашённый и активный специалист учитываются ровно по
   действующему контракту, patient/file rows другой организации не протекают.
3. Пустая организация даёт нули, а не отсутствие строки/ошибку.
4. Platform runtime получает только `EXECUTE` общего accessor; прямого чтения invites/enrollments/patient files нет.
5. Application path идёт через существующий Drizzle-port и не получает второй SQL/read seam.
6. Scope не включает clinic-side enforcement файлов, новую таблицу, экран, миграцию или отдельный harness.

## Доказательство

- До чтения новых тестов зафиксировать kill-set в audit report.
- Переиспользовать существующий disposable PostgreSQL proof и релевантные unit/service tests.
- Один раз временно сломать каждый независимый класс поведения/безопасности: org filter, invited/active semantics,
  file-byte aggregation/zero row, direct table privilege или accessor grant. Каждый fault обязан быть пойман; все
  временные product-изменения откатить.
- Проверить exact diff и grants взглядом, scoped ESLint/typecheck, raw-SQL gate и `git diff --check`.
- Product fix не делать и не push. Постоянными могут остаться только недостающие acceptance tests и audit report.

Итог — бинарный `PASS` либо конкретный достижимый finding с impact, exact command и нарушенным требованием.
