# TEST ledger repair — независимый аудит

Кандидат: `28887ec27` (`wt/trackd-test-ledger-repair`), база `9255392a9`.

Вердикт: **PASS К LAND/APPLY**. Это только audit gate; land/apply/deploy не выполнялись, DEV и PROD не затронуты.

## Evidence

- Все семь записанных TEST hash (`0101`, `0237`, `0259`, `0262`, `0265`, `0266`, `0267`) совпали с точными историческими телами Git. Кандидат не переигрывает исторические тела, а выполняет forward reconciliation к текущей схеме.
- Чистый прогон кандидата в транзакции TEST завершился успешно и был откачен. Fingerprint ledger до и после: `count=327`, `max(created_at)=1793539230033`, `md5=32146dc92310c80952d3efee22869232`.
- После чистого прогона сохранены текущие функции из `0274` (`functions_unchanged=t`) и строки `booking_calendar_map` (`calendar_rows_unchanged=t`); ledger не изменился (`ledger_unchanged=t`).
- Сохранённый fault set отклонён `6/6`: неверный FK `0101`; ослабленные billing RLS policy и amount constraint; расширенный unique `booking_calendar_map`; лишний `PUBLIC EXECUTE` на support-функцию; ослабленный password-attempts constraint. Каждый сценарий завершился fail-closed и `ROLLBACK`.
- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — PASS.
- `node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test` — PASS.
- `node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --check-online-index-layout` — PASS.
- `git diff --check 9255392a9..28887ec27` — PASS.

