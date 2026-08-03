# TEST ledger repair — независимый аудит

Кандидат: `28887ec27` (`wt/trackd-test-ledger-repair`), база `9255392a9`.

Первичный вердикт ниже **ОТКЛОНЁН последующей независимой проверкой** `audit-0330-test-ledger-r2-20260803`.
Финальный вердикт после fixer `71a3ee727` / `a2de3db52` / `72791c80b` / `844524a07` /
`eb06ced93` / `dcd4e65be`: **PASS К LAND/APPLY ПО СОХРАНЁННОМУ ORACLE**. Land/apply/deploy
этой проверкой не выполнялись, DEV/TEST/PROD не затронуты.

## Коррекция независимого аудита

- Предварительная миграция безусловно удаляла owner-настроенный `lifecyclePolicy`. Одноразовый PostgreSQL
  доказал потерю значения; fixer повторяет только exact legacy seed из `0278` и сохраняет любое owner-значение.
- Проверка требовала существования global provider row и роняла fresh deploy после штатного удаления настройки.
  Данные больше не используются как обязательный schema invariant.
- Добавленные до runtime-overlays exact ACL/owner assertions последовательно роняли fresh chain на `0259`,
  `0262`, `0266`, `0267`; они удалены, а фактические runtime-права остаются обязанностью overlay-гейтов.
- Тот же финальный прогон: `pnpm --dir apps/webapp exec tsx scripts/postgres-integration/cli.ts build-template`
  → `count=329 direct=329 reconciled=0`; временный кластер штатно удалён, оба worktree чистые.
- Повторный blind audit не запускался: fixer повторил тот же fresh-chain oracle и закрыл конкретные findings.

## Первичный evidence (историческая запись, не финальный вердикт)

## Evidence

- Все семь записанных TEST hash (`0101`, `0237`, `0259`, `0262`, `0265`, `0266`, `0267`) совпали с точными историческими телами Git. Кандидат не переигрывает исторические тела, а выполняет forward reconciliation к текущей схеме.
- Чистый прогон кандидата в транзакции TEST завершился успешно и был откачен. Fingerprint ledger до и после: `count=327`, `max(created_at)=1793539230033`, `md5=32146dc92310c80952d3efee22869232`.
- После чистого прогона сохранены текущие функции из `0274` (`functions_unchanged=t`) и строки `booking_calendar_map` (`calendar_rows_unchanged=t`); ledger не изменился (`ledger_unchanged=t`).
- Сохранённый fault set отклонён `6/6`: неверный FK `0101`; ослабленные billing RLS policy и amount constraint; расширенный unique `booking_calendar_map`; лишний `PUBLIC EXECUTE` на support-функцию; ослабленный password-attempts constraint. Каждый сценарий завершился fail-closed и `ROLLBACK`.
- `bash apps/webapp/scripts/check-drizzle-journal-sync.sh` — PASS.
- `node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --self-test` — PASS.
- `node apps/webapp/scripts/run-webapp-drizzle-migrate.mjs --check-online-index-layout` — PASS.
- `git diff --check 9255392a9..28887ec27` — PASS.
