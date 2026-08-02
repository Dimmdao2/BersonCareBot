# Media-worker DB port — исправление FAIL независимого аудита (#1082) — ОТЧЁТ

**Adjudication:** `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`, строка `198421a4d` (см. также коммиты
`7c7ab3395`, `a0f5f2337`). **Audit report (не переписан):**
[`MEDIA_WORKER_PORT_BLIND_AUDIT_REPORT.md`](MEDIA_WORKER_PORT_BLIND_AUDIT_REPORT.md).

## Итог одной строкой

Оба MUST FIX аудита `198421a4d` закрыты одним коммитом: gate `scripts/check-no-new-raw-sql.mjs` теперь ловит
все три воспроизведённых обхода (destructuring alias, constant computed member name, alias через relative
helper); красный `LEGACY-SQL-LITERAL` acceptance-case удалён как отклонённая находка. Второй scanner,
allowlist или продуктовая правка media-worker не создавались.

## Finding 1 — gate допускал три воспроизводимых обхода

Аудит `198421a4d` (fault injection, detached worktree `8897edaef`):

| Форма                                                                                 | Было (до фикса) | Стало (после фикса) |
| ------------------------------------------------------------------------------------- | --------------: | ------------------: |
| `const { query } = pool; query('SELECT 1')`                                           |        `exit 0` |            `exit 1` |
| `const method = 'query'; pool[method](...)`                                           |        `exit 0` |            `exit 1` |
| relative helper экспортирует `pool.query.bind(pool)`, consumer импортирует и вызывает |        `exit 0` |            `exit 1` |

Реализация в `scripts/check-no-new-raw-sql.mjs` (без второго gate/scanner/allowlist, тот же файл и тот же
self-test):

1. **Destructuring alias** — `computeLocalQueryAliases` распознаёт `ObjectBindingPattern` с полем `query`
   (в т.ч. переименованным: `const { query: q } = pool`) как алиас, независимо от источника — тем же
   принципом, что уже применялся к `pool.query` без проверки типа `pool`.
2. **Constant computed member name** — новый `computeQueryLiteralAliases` строит fixed point строковых
   констант, равных `'query'` (включая цепочки переприсваивания); `makeIsQueryMember` резолвит
   `pool[method]` в `pool['query']`, когда `method` доказуемо равен этой строке.
3. **Relative helper alias** — новый `analyzeProject` строит проектный fixed point поверх уже
   отсканированных файлов: для каждого файла считает локальные алиасы и то, какие из них видны наружу
   (`export const x = …` и `export { x as y }`), затем резолвит relative `import { … } from './...'`
   консьюмера на файл-источник и досевает локальный алиас consumer-файла именем, под которым он
   импортирован. Раунды повторяются до стабилизации (поддерживает многошаговые цепочки реэкспорта).

Замер, что это не создаёт ложных срабатываний на реальном дереве, сделан ДО правки (grep по
`apps/integrator/src`, `apps/media-worker/src`, `apps/webapp/src`):

```
rg -n '\{\s*query\s*[,:}]' … --glob '*.ts' -g '!*.d.ts'
# ни одного совпадения формы `const { query } = …` — единственный хит был объектным литералом
# `{ query: vi.fn() }` в mediaWorkerDbPort.unit.test.ts:48, другая AST-форма (RHS, не binding pattern)

rg -n "export (const|let) \w+ = .*\.query\b" … --glob '*.ts' -g '!*.d.ts'
# 0 совпадений — в текущем дереве нет ни одного экспортируемого query-алиаса
```

Self-test (`node scripts/check-no-new-raw-sql.mjs --self-test`) расширен тремя новыми verdict-строками
(destructuring alias, constant computed member name, relative-helper export called by consumer) и вручную
проверен на red/green для каждой новой ветки: временное нейтрализование detection-кода (destructuring block,
`queryLiteralAliases` lookup, `targetExports` seeding) по отдельности красило self-test; восстановление кода
возвращало `exit 0`. Существующие shape/manifest-assertions (comment/line-break/template/foreign
object/bind-alias/string-concat/drizzle-execute/live-manifest-deletion) не менялись и остались зелёными.

Итоговые прогоны на актуальном tree:

```
node scripts/check-no-new-raw-sql.mjs --self-test
# check-no-new-raw-sql: self-test OK. exit 0

node scripts/check-no-new-raw-sql.mjs
# exit 1 — единственный offender: apps/webapp/src/infra/repos/saasBillingTariffSnapshot.devDbProof.test.ts
# (уже переданный blocker его оркестратору на доске; не media-worker, не в scope этого фикса)
```

## Finding 2 — `LEGACY-SQL-LITERAL` — отклонено, не исправлялось

Adjudication лида (`7c7ab3395`, `a0f5f2337`): finding про `'$1'` внутри SQL string literal отклонён — общий
SQL-парсер сюда не относится, это отдельный незакрытый этап «сырой SQL как текст». Точный замер на
production-коде media-worker подтверждён повторно перед удалением теста:

```
rg -n "['\"]\$[1-9][0-9]*['\"]" apps/media-worker/src --glob '*.ts'
# exit 1 — ни один исполняемый запрос media-worker не содержит placeholder-like SQL literal
```

Красный кейс `does not reinterpret placeholder-looking SQL string literals` удалён из
`apps/media-worker/src/mediaWorkerDbPort.unit.test.ts`. Оставлены acceptance-тесты на transaction lifecycle
(`claimNextJob` — same client через select/update, commit только после успеха, rollback+release при ошибке
любого шага) и на legacy `$n`→drizzle binding (out-of-order/repeated placeholder, null/placeholder-looking
string как bound value). Исторический `MEDIA_WORKER_PORT_BLIND_AUDIT_REPORT.md` не переписывался.

## Проверки

```
pnpm --dir apps/media-worker build       # exit 0
pnpm --dir apps/media-worker typecheck   # exit 0
pnpm --dir apps/media-worker test        # exit 0 — 5/5 passed (LEGACY-SQL-LITERAL case удалён, не skip)
pnpm exec eslint apps/media-worker/src/mediaWorkerDbPort.unit.test.ts scripts/check-no-new-raw-sql.mjs
# exit 0
pnpm exec prettier --check apps/media-worker/src/mediaWorkerDbPort.unit.test.ts scripts/check-no-new-raw-sql.mjs
# exit 0
```

DEV/TEST/PROD БД и сервер не использовались.

## Scope

Product diff — только `scripts/check-no-new-raw-sql.mjs`. `apps/media-worker/src/mediaWorkerDbPort.unit.test.ts`
изменён только удалением отклонённого red case. Media-worker production-код (`claim.ts`, `main.ts`,
`runMediaWorkerSql.ts`, `saasIsolationTelemetry.ts`, три port files) не менялся. Второй gate/scanner/allowlist
не создавались.
