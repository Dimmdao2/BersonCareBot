# Track D D18c — production raw SQL до необходимых DB boundaries

Роль: worker. Канон — `AGENTS.md` §5, §7, §10a/§10b, §24. Authority —
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` Р-D18/D18c и
`docs/_TODO/SINGLE_ENTRY_CLEANUP_2026-08-01.md` §«Порядок работ», пункт 1.

## Источник оракула: решение владельца — «сырого sql и запросов мимо порта не должно остаться вообще»

Исключение допускается только там, где SQL является предметом самого файла (migration/deploy SQL), либо внутри
минимальной названной низкоуровневой DB boundary, которая исполняет Drizzle fragments/checkout/migrations для всех
остальных потребителей. Test-only PostgreSQL harness классифицируется отдельно и не является production debt.

## Задача

1. Перемерить текущую реальность `scripts/check-no-new-raw-sql.mjs` и AST census, не доверять старым числам.
2. Закрыть последнюю названную production-дыру integrator: `projectionHealthCore.ts` + runtime/CLI consumers
   переводятся с `query(text, params)` на параметризованные Drizzle `SQL` fragments и `execute(fragment)` через
   существующие DB adapters. Состав метрик и exit semantics deploy CLI сохраняются.
3. По каждому оставшемуся manifest/census-файлу классифицировать: migration/deploy SQL; low-level DB port/migrator;
   test-only harness; production debt. Production debt довести до нуля, а не спрятать новым allowlist.
4. Удалить debt manifest как легализацию файлов. Gate должен структурно разрешать только поимённые минимальные
   boundary-категории и падать на direct/alias/computed/dynamic обходах в новом production-файле.
5. SQL-text, который уже исполняется через порт, переводить только там, где он остаётся самостоятельно собранным
   legacy `text + values`/двойной реализацией. Drizzle `sql\`...\`` внутри канонического repository/port не является
   обходом и не переписывается ради нулевого счётчика. Отчёт обязан назвать точные необходимые остатки и почему
   каждый не может быть выше по слою.

## Scope и конфликты

Разрешены `scripts/check-no-new-raw-sql.mjs`, integrator DB/repository/CLI projection-health surface, необходимые
DB port packages/tests и точечные production offenders обоих приложений по актуальному census.

Запрещено трогать активный D21 scope: migration `0322`, reminder policy/scheduler/worker/actions/UI, delivery target,
`packages/platform-merge`, D21 audit files. Не трогать CMS/tariff/billing соседа без реально найденного raw-SQL
offender; при пересечении пропустить файл и назвать его лидеру, а не сливать чужую логику. DB/DEV/TEST/PROD и full
CI не запускать. Не менять бизнес-поведение.

## Проверки и готовность

- Старые и новые projection-health runtime/CLI метрики эквивалентны на disposable/local PostgreSQL; exit semantics
  сохранены.
- `node scripts/check-no-new-raw-sql.mjs` зелёный без production debt manifest; self-test ловит минимум direct,
  bind/alias, computed и optional/dynamic bypass.
- Production census outside named DB boundaries = 0; exact команды и результат записаны в report.
- Relevant tests, integrator/webapp typecheck по затронутому scope, scoped lint и `git diff --check` зелёные.
- Explicit staging, meaningful commit(s), no push; tree clean.
