# Live DEV/TEST fixture retirement — current procedure closure

Роль: same-branch worker/fixer в `wt/live-fixtures-retirement-20260821`. Это продолжение уже проведённого
независимого аудита и приёмочного прохода, не новый blind audit.

До действия прочитать карту `AGENTS.md`, §«Как решать, что делать», §0, §1a/§1b, §7, §12 и §24; затем
повторить `code-search` и точный поиск более поздних owner-решений. Текущий oracle:
`docs/OWNER_DECISIONS.md:870-871` — отдельное fixture-наполнение live DEV/TEST запрещено; используются уже
зарегистрированные owner-учётки и клиники; rollback-only probe не оставляет fixture-сущностей. Более позднее
явное owner-решение, если найдётся, заменяет этот brief и должно быть названо в результате.

## Findings приёмки SHA `6f4874aad`

1. Активный `SAAS_S3_TEST_WALKTHROUGH.md` получил верхний баннер, но под ним осталась исполняемая будущая
   инструкция: hard-wrapper fixture step, `/opt/env/bersoncarebot/saas-test-fixture.env`, фиксированная fixture-v2
   картина, fixture manifest/packet и fixture-derived ожидания. В current plan нельзя оставлять old-then-new.
2. Активный `SAAS_ENFORCE_ROADMAP.md` всё ещё хранит мёртвый executable command block с
   `/run/bersoncarebot/saas-smoke.fixture`, а также текущие D3/D4 exits/summary, которые требуют operator fixture.
3. `runs/clickthrough/` — живой исполняемый механизм, читающий `/run/bersoncarebot/saas-smoke.fixture` и
   содержащий TEST seeder. Exact `rg` не нашёл ни одного caller/checklist вне самого каталога и текущего result.
   Он не owner-account login helper, а retired fixture consumer; удаляется целиком, replacement не строится.
4. Current runbook `HARD_MIGRATION_PROTOCOL.md` хранит длинный SUPERSEDED fixture/reconciliation block и
   disposable fixture proof. История уже в Git; current runbook не должен предлагать эти команды даже под баннером.
5. В активном `S7_3_TEST_LADDER_RUN.md` будущий остаток ещё просит `fixture packet or smoke refs`; прошлый
   FAIL evidence можно оставить, но следующий шаг обязан требовать обычный вход существующей owner-учёткой.

## Scope

- `docs/_TODO/SAAS_FOUNDATION/SAAS_S3_TEST_WALKTHROUGH.md`
- `docs/_TODO/SAAS_FOUNDATION/SAAS_ENFORCE_ROADMAP.md`
- `docs/_TODO/SAAS_FOUNDATION/HARD_MIGRATION_PROTOCOL.md`
- `docs/_TODO/runs/tariff/S7_3_TEST_LADDER_RUN.md`
- весь tracked `runs/clickthrough/` (удаление)
- `docs/_TODO/runs/integrator-cleanup/LIVE_DEV_TEST_FIXTURES_RETIREMENT_2026-08-21.md`

Не менять архивы, REPORTS, audit/evidence/log records, dated 2026-07 handoff, закрытые `[x]` evidence rows,
код продукта, миграции, DB, DEV/TEST/PROD, deploy и AGENTS/canon.

## Required correction

1. Переписать S3 current procedure в одну положительную форму: две существующие зарегистрированные клиники и
   owner-учётки, обычный штатный login, read-only наблюдение фактических данных. Удалить fixture seeding/env/packet,
   фиксированные synthetic counts/IDs и fixture-derived manifest expectations. Не изобретать новые аккаунты,
   cookie cache, helper, seeder или credential env. Если у существующей клиники нет данных, это наблюдаемый факт,
   а не повод их создавать.
2. В SAAS roadmap удалить мёртвый command block целиком. Исправить только текущие/открытые D3/D4 exit и сводные
   строки, где они всё ещё требуют persistent/operator fixtures: существующие owner accounts/clinics для live view;
   гарантированный ROLLBACK для допустимого mutation probe. Закрытые `[x]` historical evidence не переписывать.
3. Удалить tracked `runs/clickthrough/` целиком. До удаления повторно доказать отсутствие caller/активного checkbox
   точным `rg`; это доказательство записать в result. Не строить replacement harness.
4. Из current HARD_MIGRATION_PROTOCOL удалить целиком superseded executable fixture/reconciliation block и
   disposable fixture proof; оставить короткий текущий запрет и current named DEV→TEST route. Не переносить старые
   команды в другой раздел и не создавать архивную копию.
5. В S7.3 сохранить честное прошлое FAIL evidence, но заменить только будущий следующий шаг на обычный owner UI
   login без fixture packet/smoke refs.
6. Исправить result pass 3: убрать «flagged outside scope» как незакрытый хвост, перечислить удалённый каталог,
   current-doc corrections и remaining matches по классу.

## Gate and commit

- `git diff --check`.
- `git ls-files runs/clickthrough` пуст.
- Exact `rg` по current active scope не оставляет executable/reference requirement для
  `saas-smoke.fixture`, `saas-test-fixture.env`, `SAAS_TEST_FIXTURE_*`, fixture seed/reconcile/packet или disposable
  fixture proof. Past-tense S7.3 FAIL evidence допустимо и отдельно перечисляется.
- S3/roadmap сохраняют реальные открытые product checks, но не требуют создания данных.
- Явно stage только scoped paths; без `git add -A`; commit до конца хода.
- Финал: SHA, exact commands и `NOT DONE: platform-merge rebuild / ordinary owner-login live gate / landing /
  TEST deploy / push / full CI`.

