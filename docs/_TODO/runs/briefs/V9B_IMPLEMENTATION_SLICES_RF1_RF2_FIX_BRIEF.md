# В9б — bounded docs fix RF1/RF2 (#1081)

Прочитать `AGENTS.md`, особенно §24. Это разовая docs-only правка; способ проверки — взгляд/точный census, не тест.
Authority: `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md` В9б, а точные два finding —
`docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES_REAUDIT_REPORT.md` RF1/RF2.

## Последствие

Если исполнять текущую декомпозицию буквально, S02 отзывает доступ у живого doctor route до его adoption, а S05a
падает на несуществующей колонке push-subscriptions. До исправления product/DDL В9б запускать нельзя.

## Scope

Править только:

- `docs/_TODO/runs/testsuite-v2/V9B_IMPLEMENTATION_SLICES.md`;
- существующий re-audit report или один короткий fix-report рядом.

Исправить ровно два факта:

1. `clinical_test_measure_kinds`: записать реальный route → DI → `pgClinicalTestMeasureKinds` caller, exact seam,
   S04 adoption evidence и только затем S04 revoke. Удалить формулировки S02 revoke для этого живого caller.
2. `user_web_push_subscriptions`: predicate по реальной колонке
   `user_id = app.current_patient_user_id()`; ещё раз exact-сверкой подтвердить все десять FORCE owner columns.

Не писать product code, SQL/migration, тесты, новый план или новую архитектуру. Не трогать DB/DEV/TEST/PROD.

## Приёмка и сдача

Повторить только RF1/RF2 evidence-команды из re-audit report, пересчитать 10/29/9 matrices и итоговые 9 gates.
Если два факта исправлены и других изменений нет, записать `9/9 PASS` в fix-report. Коммитить только два разрешённых
docs-файла, не пушить. Новый независимый audit не нужен: это один bounded fix разовой документации, итог принимает лид.

