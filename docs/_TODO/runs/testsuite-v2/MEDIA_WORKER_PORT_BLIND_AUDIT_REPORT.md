# Media-worker DB port — blind audit report (#1082)

Аудитор: `auditor-live`. Продуктовый коммит: `8897edaef`. База синхронизации:
`664250538`. Scope ограничен брифом владельца.

## Blind kill-set и классификация «тест или взгляд»

Этот список зафиксирован после чтения authority и `apps/media-worker/README.md`, но до чтения
production diff, production-кода и существующих тестов.

| ID                    | Достижимая поломка                                                                                                                                     | Классификация                                                                | Oracle / impact                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `Q-FINAL`             | В итоговом `apps/media-worker/src` остаётся вызов БД `.query` вне трёх файлов порта либо появляется в diff новая allowlist-запись.                     | взгляд: итоговое AST/состояние и diff                                        | §5 требует одну дверь и механический запрет обхода; обход лишает principal boundary обязательности.             |
| `Q-DIRECT`            | Новый вложенный файл вызывает `pool.query("SELECT 1")`, а gate остаётся зелёным.                                                                       | тест: fault injection/self-test                                              | План, строки 102–119: обходов не должно остаться; gate обязан сканировать весь `src`.                           |
| `Q-ALIAS`             | Новый вложенный файл сохраняет/биндит `pool.query` в алиас и вызывает алиас, а gate остаётся зелёным.                                                  | тест: fault injection/self-test                                              | Тот же обязательный chokepoint нельзя обойти сменой синтаксиса вызова.                                          |
| `Q-COMPUTED`          | Новый вложенный файл вызывает `pool["query"](...)` или `pool[method](...)` при `method = "query"`, а gate остаётся зелёным.                            | тест: fault injection/self-test                                              | Динамическая форма не должна превращать прямой DB path в разрешённый.                                           |
| `Q-RELATIVE`          | Новый вложенный файл получает client через относительный import/вынесенный helper и вызывает его `.query`, а gate остаётся зелёным.                    | тест: fault injection/self-test                                              | Перемещение обхода в неизвестный gate файлу не должно исключать его из полного обхода `src`.                    |
| `Q-PORT-ALLOW`        | Сам разрешённый порт ошибочно блокируется gate и делает обязательную дверь неиспользуемой.                                                             | тест: self-test/контрольная инъекция                                         | План разрешает `.query` только как предмет файлов порта; gate должен отличать дверь от обхода.                  |
| `CLAIM-SAME-TX`       | `SELECT ... FOR UPDATE SKIP LOCKED` идёт через открытый transaction client, а `UPDATE` — через pool/вторую транзакцию, поэтому lock теряется до claim. | тест поведения + взгляд wiring                                               | README задаёт claim; запись лида требует executor на уже открытой транзакции. Возможен двойной claim одной job. |
| `CLAIM-COMMIT`        | Claim-транзакция делает commit до успешного `UPDATE` либо не commit-ит успешный claim.                                                                 | тест поведения                                                               | Job остаётся pending/может быть взята конкурентом, хотя claim вернул её воркеру.                                |
| `CLAIM-ROLLBACK`      | Ошибка `SELECT` или `UPDATE` не вызывает rollback, вызывает commit либо не освобождает client.                                                         | тест поведения                                                               | Открытая транзакция/lock зависают; pool истощается, semantics до рефакторинга меняется.                         |
| `LEGACY-ORDER-REPEAT` | Конвертер `$1..$n` формирует args по номеру параметра, а не по порядку появления: `$2` раньше `$1` или повтор `$2` связываются не с теми значениями.   | тест поведения                                                               | Legacy PostgreSQL binding задаётся номером placeholder; неверная привязка меняет выбранную/обновлённую job.     |
| `LEGACY-NULL-VALUE`   | `null` или строковое значение вроде `"$2"` интерпретируется как SQL/placeholder либо меняет позицию вместо точной передачи параметром.                 | тест поведения                                                               | Значение повреждается или становится SQL injection boundary вместо bind parameter.                              |
| `LEGACY-SQL-LITERAL`  | Текст `$1` внутри SQL string literal ошибочно считается bind-placeholder.                                                                              | тест поведения                                                               | Legacy query меняет смысл или число параметров; прежний `pg` оставлял такой текст литералом.                    |
| `START-EQUIV`         | Стартовый feature-gate после переноса выполняет не те же три запроса либо меняет их параметры/значения.                                                | взгляд: parent↔product diff + точечное исполнение адаптера при необходимости | Воркер может стартовать при выключенном pipeline или простаивать при включённом.                                |
| `TELEMETRY-EQUIV`     | Telemetry adapter меняет прежний SQL/params либо получает raw pool/client и обходит media-worker port/principal wrapper.                               | взгляд wiring + тест адаптера только если взгляд не доказывает параметры     | Телеметрия пишет неверные данные или создаёт вторую DB door мимо principal boundary.                            |
| `PORT-SECOND-TX`      | Transaction executor внутри порта сам вызывает `pool.connect()`/`BEGIN` вместо исполнения на переданном открытом client.                               | взгляд wiring + `CLAIM-SAME-TX` fault injection                              | `FOR UPDATE` lock и `UPDATE` оказываются в разных транзакциях.                                                  |

## Проверенные diff и итоговое состояние

Продуктовый diff содержит ровно пять названных брифом файлов:

```bash
git diff --name-status 8897edaef^ 8897edaef -- \
  apps/media-worker/src/jobs/claim.ts \
  apps/media-worker/src/main.ts \
  apps/media-worker/src/runMediaWorkerSql.ts \
  apps/media-worker/src/saasIsolationTelemetry.ts \
  scripts/check-no-new-raw-sql.mjs
# exit 0; пять строк `M`, только перечисленные пути
```

Полный просмотр выполнен командой:

```bash
git diff --find-renames --find-copies 8897edaef^ 8897edaef -- \
  apps/media-worker/src/jobs/claim.ts \
  apps/media-worker/src/main.ts \
  apps/media-worker/src/runMediaWorkerSql.ts \
  apps/media-worker/src/saasIsolationTelemetry.ts \
  scripts/check-no-new-raw-sql.mjs
# exit 0
```

Актуальная `feat/doctor-ui-rebuild` — `d9e72f47dd07a4815b40225645e3274c827a2eda`, она же merge-base с
`8897edaef`:

```bash
git merge-base 8897edaef feat/doctor-ui-rebuild
# exit 0; d9e72f47dd07a4815b40225645e3274c827a2eda

git diff --name-status feat/doctor-ui-rebuild HEAD -- \
  apps/media-worker/src/jobs/claim.ts \
  apps/media-worker/src/main.ts \
  apps/media-worker/src/runMediaWorkerSql.ts \
  apps/media-worker/src/saasIsolationTelemetry.ts \
  scripts/check-no-new-raw-sql.mjs
# exit 0; те же пять путей `M`
```

Inspection evidence:

- `git diff 8897edaef^ 8897edaef` показывает, что SQL-тексты и переданные values в claim/startup/telemetry
  не переписаны: заменён только transport call на `runMediaWorker*PgText`.
- `rg -n '\bquery\b' apps/media-worker/src --glob '*.ts'` на detached `8897edaef` завершился `exit 0` и
  нашёл исполняемые raw `.query` только в трёх файлах порта:
  `poolProvider.ts`, `runMediaWorkerSql.ts`, `withClient.ts`. В product diff нет новой записи frozen debt
  manifest; три `portFiles` — сами файлы двери, указанные brief/lead evidence.
- `claimNextJob` получает один `tx.client`, передаёт его и в lock-select, и в оба update-path, затем вызывает
  commit/rollback/release на том же transaction handle. `runMediaWorkerClientSql` компилирует fragment и вызывает
  только переданный client; `pool.connect()`/`BEGIN` внутри него отсутствуют.
- Startup gate по-прежнему выполняет те же readiness-запросы внутри `runMediaWorkerStartupGate`, то есть внутри
  `media-worker:tick` infra-principal context. Telemetry сохраняет прежние `sql, values`, dedicated true-global
  pool и source; единственное изменение adapter — исполнение через `runMediaWorkerPgText`.
- `git diff --check 8897edaef^ 8897edaef && git diff --check` → `exit 0`.

## Команды и exit code

Подготовка среды:

| Команда                                                          | Exit | Результат                                          |
| ---------------------------------------------------------------- | ---: | -------------------------------------------------- |
| `node scripts/check-no-new-raw-sql.mjs` (до install)             |    1 | Не запустился: `ERR_MODULE_NOT_FOUND: typescript`. |
| `node scripts/check-no-new-raw-sql.mjs --self-test` (до install) |    1 | Та же причина; это не gate verdict.                |
| `pnpm install --frozen-lockfile`                                 |    0 | Lockfile не менялся; зависимости установлены.      |

Gate проверялся на чистом detached worktree ровно `8897edaef`, потому что merge-tree `664250538` уже содержит
вне scope новый webapp test с raw `.query`:

| CWD / команда                                                                     | Exit | Результат                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/tmp/bcb-media-audit-1082` · `node scripts/check-no-new-raw-sql.mjs`             |    0 | Чистый product SHA зелёный.                                                                                                                                        |
| `/tmp/bcb-media-audit-1082` · `node scripts/check-no-new-raw-sql.mjs --self-test` |    0 | Штатный self-test зелёный.                                                                                                                                         |
| текущий worktree · `node scripts/check-no-new-raw-sql.mjs`                        |    1 | Только out-of-scope `apps/webapp/src/infra/repos/saasBillingTariffSnapshot.devDbProof.test.ts`; webapp не трогался и это не finding продуктового diff `8897edaef`. |

Targeted/phase validation на итоговом audit-tree:

| Команда                                                                                                                                                                                                                                                               | Exit | Результат                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------ |
| `pnpm --dir apps/media-worker exec vitest --run src/mediaWorkerDbPort.unit.test.ts -t 'preserves out-of-order\|keeps null\|claimNextJob transaction lifecycle'`                                                                                                       |    0 | Пять acceptance-сценариев зелёные, SQL-literal oracle намеренно исключён.                  |
| `pnpm --dir apps/media-worker test`                                                                                                                                                                                                                                   |    1 | Шесть тестов: пять PASS, один FAIL на исходном продукте (`LEGACY-SQL-LITERAL`).            |
| `pnpm --dir apps/media-worker build`                                                                                                                                                                                                                                  |    0 | Media-worker build зелёный.                                                                |
| `pnpm --dir apps/media-worker typecheck` (первый параллельный запуск до сборки dependency)                                                                                                                                                                            |    2 | Не найден собранный `@bersoncare/error-tracking`; это environment ordering, не TS finding. |
| `pnpm --dir apps/media-worker typecheck` (после `build`)                                                                                                                                                                                                              |    0 | Typecheck зелёный, включая новый test.                                                     |
| `pnpm exec eslint apps/media-worker/src/jobs/claim.ts apps/media-worker/src/main.ts apps/media-worker/src/runMediaWorkerSql.ts apps/media-worker/src/saasIsolationTelemetry.ts apps/media-worker/src/mediaWorkerDbPort.unit.test.ts scripts/check-no-new-raw-sql.mjs` |    0 | ESLint по затронутым путям зелёный.                                                        |
| `pnpm exec prettier --check apps/media-worker/src/mediaWorkerDbPort.unit.test.ts docs/_TODO/runs/testsuite-v2/MEDIA_WORKER_PORT_BLIND_AUDIT_REPORT.md` (до format)                                                                                                    |    1 | Оба audit-файла требовали штатного форматирования.                                         |
| `pnpm exec prettier --write apps/media-worker/src/mediaWorkerDbPort.unit.test.ts docs/_TODO/runs/testsuite-v2/MEDIA_WORKER_PORT_BLIND_AUDIT_REPORT.md`                                                                                                                |    0 | Оба audit-файла отформатированы.                                                           |
| `pnpm exec prettier --check apps/media-worker/src/mediaWorkerDbPort.unit.test.ts docs/_TODO/runs/testsuite-v2/MEDIA_WORKER_PORT_BLIND_AUDIT_REPORT.md` (после format)                                                                                                 |    0 | Formatting gate зелёный.                                                                   |

Полный repo CI и dev-server не запускались по brief. DEV/TEST/PROD DB не использовались.

## Fault injection

Для gate fixtures создавались по одному в новом вложенном каталоге
`apps/media-worker/src/__audit_faults__` detached worktree `8897edaef`; после каждого результата fixture
удалялся. Команда во всех строках: `node scripts/check-no-new-raw-sql.mjs` из этого worktree.

| Fault                 | Caught / not caught                            | Evidence                                                                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Q-FINAL`             | caught inspection / итог PASS                  | Чистый product gate `exit 0`; `rg -n '\bquery\b' apps/media-worker/src --glob '*.ts'` показывает исполняемый raw query только в трёх port files; product diff не добавляет debt allowlist.                                                                                                               |
| `Q-DIRECT`            | caught                                         | Новый nested `direct.ts` с `pool.query('SELECT 1')` → gate `exit 1`, offender `direct.ts:2`; после удаления gate `exit 0`.                                                                                                                                                                               |
| `Q-ALIAS`             | **not caught полностью**                       | `pool.query.bind(pool)` → `exit 1`, но `const { query } = pool; query('SELECT 1')` → **`exit 0`**.                                                                                                                                                                                                       |
| `Q-COMPUTED`          | **not caught полностью**                       | `pool['query'](...)` → `exit 1`, но `const method = 'query'; pool[method](...)` → **`exit 0`**.                                                                                                                                                                                                          |
| `Q-RELATIVE`          | **not caught**                                 | `relative-helper.ts` экспортирует `pool.query.bind(pool)`, consumer импортирует helper и вызывает возвращённый alias → **`exit 0`**.                                                                                                                                                                     |
| `Q-PORT-ALLOW`        | caught control / PASS                          | Чистый product tree содержит raw calls внутри всех трёх port files, но gate → `exit 0`.                                                                                                                                                                                                                  |
| `CLAIM-SAME-TX`       | caught                                         | Временно передан `pool` вместо `tx.client` во второй `runMediaWorkerClientPgText`; `pnpm --dir apps/media-worker exec vitest --run src/mediaWorkerDbPort.unit.test.ts -t 'uses the same open transaction client'` → `exit 1`, second-call client assertion red. После отката combined subset → `exit 0`. |
| `CLAIM-COMMIT`        | caught                                         | В success-path временно заменён `tx.commit()` на `tx.rollback()`; `pnpm --dir apps/media-worker exec vitest --run src/mediaWorkerDbPort.unit.test.ts -t 'commits only after success'` → `exit 1`, commit assertion red. После отката combined subset → `exit 0`.                                         |
| `CLAIM-ROLLBACK`      | caught                                         | В catch временно заменён rollback на commit; `pnpm --dir apps/media-worker exec vitest --run src/mediaWorkerDbPort.unit.test.ts -t 'rolls back and releases'` → `exit 1`, оба error-path сценария red. После отката combined subset → `exit 0`.                                                          |
| `LEGACY-ORDER-REPEAT` | caught                                         | Временно `idx = 0`; `pnpm --dir apps/media-worker exec vitest --run src/mediaWorkerDbPort.unit.test.ts -t 'preserves out-of-order and repeated positional parameter binding'` → `exit 1`: received params `['one','one','one']` вместо `['two','one','two']`. После отката combined subset → `exit 0`.   |
| `LEGACY-NULL-VALUE`   | caught                                         | Временно `sql.param(String(values[idx]))`; `pnpm --dir apps/media-worker exec vitest --run src/mediaWorkerDbPort.unit.test.ts -t 'keeps null and placeholder-looking strings as bound values'` → `exit 1`: received `['null','$1']` вместо `[null,'$1']`. После отката combined subset → `exit 0`.       |
| `LEGACY-SQL-LITERAL`  | caught by acceptance; **исходный продукт red** | `pnpm --dir apps/media-worker test` → `exit 1`: input `SELECT '$1' AS literal, $1::text AS bound` компилируется как `SELECT '$1' AS literal, $2::text AS bound`; один value становится двумя params.                                                                                                     |
| `START-EQUIV`         | caught inspection / PASS                       | Parent↔product diff сохраняет все query strings/отсутствующие params; меняется только вызов `tx.client.query` → client-port. Транзакция по-прежнему rollback/release в success и rollback/release в error.                                                                                               |
| `TELEMETRY-EQUIV`     | caught inspection / PASS                       | Parent↔product diff сохраняет `source`, dedicated pool и `sql, values`; adapter теперь вызывает `runMediaWorkerPgText(pool, sql, values)`, прямого pool/client у reporter больше нет.                                                                                                                    |
| `PORT-SECOND-TX`      | caught inspection + `CLAIM-SAME-TX` / PASS     | `runMediaWorkerClientSql` принимает client и делает ровно query на нём; `startMediaWorkerTransaction` вызывается один раз в `claimNextJob`, вокруг select/update.                                                                                                                                        |

## Временные production-поломки

Все production mutations откатаны:

```bash
git diff --exit-code HEAD -- \
  apps/media-worker/src/jobs/claim.ts \
  apps/media-worker/src/main.ts \
  apps/media-worker/src/runMediaWorkerSql.ts \
  apps/media-worker/src/saasIsolationTelemetry.ts \
  scripts/check-no-new-raw-sql.mjs
# exit 0
```

В detached worktree после удаления последней fixture
`git status --short -- apps/media-worker/src scripts/check-no-new-raw-sql.mjs` → `exit 0`, пустой output;
после этого выполнено:

```bash
test -L /tmp/bcb-media-audit-1082/node_modules && \
  unlink /tmp/bcb-media-audit-1082/node_modules && \
  git worktree remove /tmp/bcb-media-audit-1082 && \
  ! git worktree list --porcelain | rg -q '/tmp/bcb-media-audit-1082'
# exit 0
```

В текущем worktree остались только намеренный acceptance-test и этот report.

## Findings

1. **MUST FIX — raw-query gate допускает достижимые обходы обязательного DB port.**
   В новом nested production-файле destructuring alias, вычисляемое имя `pool[method]` и алиас, возвращённый
   relative helper, дают зелёный `node scripts/check-no-new-raw-sql.mjs` (`exit 0`). Такой код реально выполняет
   raw query вне media-worker port и может обойти principal/transaction boundary. Нарушены owner requirement 1,
   план `SINGLE_ENTRY_CLEANUP_2026-08-01.md` строки 102–116 и `AGENTS.md` §5 «Один общий проход».

2. **MUST FIX — legacy `$n` converter меняет PostgreSQL semantics для placeholder-looking SQL literal.**
   На исходном продукте публичное преобразование `SELECT '$1' AS literal, $1::text AS bound` выдаёт второй bind
   как `$2` и дублирует value в params. Запрос с literal `$1` поэтому меняет binding/может завершиться ошибкой.
   Acceptance-test красный на product SHA (`pnpm --dir apps/media-worker test` → `exit 1`). Нарушено явное
   требование 4 о сохранении legacy binding для строк, похожих на placeholders.

Других in-scope findings нет. Claim использует одну транзакцию и сохраняет commit/rollback/release; startup и
telemetry wiring сохраняют прежние запросы/параметры и границы; фактических raw calls вне port на `8897edaef` нет.

## Вердикт

**FAIL.** Оба finding соответствуют обязательным owner requirements и воспроизводятся без живой БД. Продуктовый
код аудитор не исправлял; красный acceptance-test оставлен как фиксированный oracle для worker handoff.
