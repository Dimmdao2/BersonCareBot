# Worker brief — media-worker DB port, круг исправления после `198421a4d`

Перед работой прочитать `AGENTS.md`: «Как решать, что делать», §5, §9–§10b и §24. Authority:
`docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` § порядка 1 — media-worker.

Источник оракула: план требует «сырого sql и запросов мимо порта не должно остаться вообще» и запрещает
новые allowlist-записи; `AGENTS.md` §5 требует один DB проход приложения.

Ветка содержит продуктовый коммит `8897edaef` и независимый FAIL-аудит `198421a4d`. Исправить только
подтверждённый разрыв гейта; не переписывать media-worker, не строить общий SQL parser и не менять продуктовые
запросы.

## Что исправить

1. Расширить существующий `scripts/check-no-new-raw-sql.mjs` и его существующий self-test так, чтобы вне трёх
   media-worker port files он ловил все три воспроизведённых формы:
   - destructuring alias `const { query } = pool; query(...)`;
   - константное computed имя `const method = 'query'; pool[method](...)`;
   - query-alias, экспортированный relative helper и вызванный consumer-файлом.
   Не добавлять второй gate, отдельный scanner или allowlist.
2. Сохранить разрешёнными реальные `.query` только в трёх media-worker port files; текущие claim/startup/telemetry
   transport и одна транзакция остаются без изменения.
3. В `mediaWorkerDbPort.unit.test.ts` сохранить acceptance на transaction lifecycle, out-of-order/repeated bind и
   bound values. Удалить только красный `LEGACY-SQL-LITERAL` case: это отклонённая находка, а не oracle текущего
   пути. Точный замер
   `rg -n "['\"]\\$[1-9][0-9]*['\"]" apps/media-worker/src --glob '*.ts'` на production-файлах дал exit 1:
   ни один исполняемый запрос media-worker не содержит placeholder-like SQL literal. Общая корректная разборка
   произвольного SQL относится к отдельному незакрытому этапу «сырой SQL как текст»; её нельзя притаскивать сюда.
4. Не переписывать исторический audit-report. Создать bounded
   `docs/_TODO/runs/testsuite-v2/MEDIA_WORKER_PORT_FIX_REPORT.md`, где отдельно записать исправленный gate и
   adjudication SQL-literal с точной командой выше.

## Проверки

- `node scripts/check-no-new-raw-sql.mjs --self-test` должен краснеть при удалении каждого нового assertion и
  быть зелёным после восстановления.
- `node scripts/check-no-new-raw-sql.mjs` на актуальном tree → exit 0. Если его продолжает красить чужой
  `saasBillingTariffSnapshot.devDbProof.test.ts`, не обходить и не чинить тарифный файл: blocker уже передан его
  оркестратору на доске.
- media-worker test, typecheck, build; lint/prettier по затронутым путям.
- DEV/TEST/PROD БД и сервер не использовать.

Один coherent fix-коммит с `#1082`. Product diff разрешён только в
`scripts/check-no-new-raw-sql.mjs`; кроме него — acceptance-test и новый fix-report. Исторический report не менять.
