# Независимый аудит media-worker DB port — #1082

Роль: `auditor-live`. Сначала классифицируй каждый пункт как **«тест или взгляд»** по `AGENTS.md` §24.4.
Это один независимый audit-pass готового продуктового коммита `8897edaef` на ветке
`wt/media-worker-port`, синхронизированной с текущей `feat/doctor-ui-rebuild` merge-коммитом
`664250538`. Продуктовый fix аудитор не делает.

## Authority

- Прочитать `AGENTS.md`: маршрут, §5 «Один общий проход» и «Доступ к базе», §9–§10b, §24.
- План: `docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md`, строки порядка работ 102–119:
  «сырого sql и запросов мимо порта не должно остаться вообще»; media-worker — пять файлов;
  новый обход переводится на порт, новые allowlist-записи запрещены.
- Контракт приложения: `apps/media-worker/README.md`, особенно очередь и claim.
- Предыдущая запись лида: `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, строка с `8897edaef`.

## Scope

Проверять только продуктовый diff `8897edaef` относительно его родителя:

- `apps/media-worker/src/jobs/claim.ts`
- `apps/media-worker/src/main.ts`
- `apps/media-worker/src/runMediaWorkerSql.ts`
- `apps/media-worker/src/saasIsolationTelemetry.ts`
- `scripts/check-no-new-raw-sql.mjs`

Допустимы чтение зависимостей, временная fault injection и один набор намеренных acceptance-тестов,
если они проверяют повторяемое поведение. Временные изменения production-кода обязательно откатить.
Оставить можно только acceptance-тесты и audit-report. Не трогать webapp, integrator, миграции,
планы тарифов/биллинга, taskdb и `feat`.

## Blind kill-set до чтения существующих тестов

Составь именованный список достижимых поломок минимум для следующих требований:

1. Все вызовы БД из media-worker проходят через один порт; прямой, алиасный, относительный,
   динамический или вынесенный в новый файл вызов `.query` вне порта должен быть механически пойман.
2. Гейт действительно сканирует весь `apps/media-worker/src`, не только известные файлы, и имеет
   подтверждённый self-test/fault injection.
3. `claimNextJob` сохраняет одну и ту же открытую транзакцию от `SELECT ... FOR UPDATE SKIP LOCKED`
   до последующего `UPDATE` и commit/rollback; порт не открывает вторую транзакцию и не теряет lock.
4. Преобразование legacy `$1..$n` сохраняет привязку значений, включая запросы, где `$2` встречается
   раньше `$1`, повторяющиеся параметры, `null` и строки, похожие на placeholders.
5. Стартовый gate и telemetry adapter сохраняют прежние запросы/параметры и не обходят principal boundary.
6. Ошибка запроса не оставляет claim-транзакцию открытой и не меняет commit/rollback semantics.

Для каждого named fault: либо тест/самотест краснеет при инъекции и зеленеет после отката, либо для
разового свойства есть конкретный inspection-evidence. Процент вместо списка не принимается.

## Проверки

- `git diff 8897edaef^ 8897edaef` и актуальный diff против current feat.
- Таргетированные тесты/самотесты, затем media-worker phase gate: typecheck, test, build; lint/gate по
  затронутым путям. Полный repo CI не запускать.
- Не поднимать dev-server. Не трогать DEV/TEST/PROD БД без отдельной необходимости; если живая БД не
  нужна для доказательства, не строить стенд.

## Результат

Создать `docs/_TODO/runs/testsuite-v2/MEDIA_WORKER_PORT_BLIND_AUDIT_REPORT.md` с:

- kill-set и классификацией «тест или взгляд»;
- точными командами и exit code;
- таблицей fault → caught/not caught → evidence;
- проверкой, что временные production-поломки откатаны;
- бинарным вердиктом PASS или FAIL и только реальными findings по критерию `AGENTS.md`.

Если PASS — закоммитить только report и/или намеренные acceptance-тесты в текущую ветку с `#1082`.
Если FAIL — также закоммитить report; продуктовый код не чинить.
