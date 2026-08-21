# Fixture retirement — убрать три активных ложных backreference

Роль: same-branch worker/fixer в `wt/live-fixtures-retirement-20260821`. Authority — owner-решение
2026-08-21 в `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §10 и уже принятый scope F1–F3 из
`LIVE_DEV_TEST_FIXTURES_RETIREMENT_FIXER_BRIEF_2026-08-21.md`. Новый продуктовый scope, новый аудит и
переименование env/API запрещены.

Перед действием прочитать карту `AGENTS.md`, затем §0, §1/§1a, §7 и §24; снова проверить более поздние
owner-решения в `docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` и актуальном
`WORK_ORDER.md`.

## Точный остаточный дефект приёмки

Продуктовый authenticated `dev:*` bypass, writer и UI уже удалены коммитом `12ca8b0ed`, но lead-census нашёл
три активные формулировки, которые всё ещё учат следующего агента обратному:

1. `deploy/HOST_DEPLOY_README.md` говорит, что «dev-bypass разрешён только локальному DEV»;
2. `AGENTS.md` §23 называет `ALLOW_DEV_AUTH_BYPASS` действующим пересечением с `dev_mode`, не поясняя, что
   исторически названный env теперь лишь гейтит сохранённый `/api/auth/dev-public` clear-session helper;
3. заголовочный комментарий `sessionCanonicalUserIdPolicy.ts` перечисляет `dev bypass` как живой compatibility path.

Источник оракула: `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §10 — «на именованных DEV и TEST не создают,
не сидируют, не reconcile-ят и не требуют persistent fixture-клиники, учётки и наборы данных; удалённый
fixture-механизм не восстанавливают»; `AGENTS.md` §1a сохраняет только обычный owner login и
`/api/auth/dev-public` как unauthenticated clear-session helper.

## Scope

Изменить только:

- `deploy/HOST_DEPLOY_README.md` — заменить ложную фразу на точное описание: на TEST значение false;
  локально true разрешает только `/api/auth/dev-public`, authenticated bypass удалён;
- `AGENTS.md` — переписать одну строку §23 как ссылочный backreference без второй редакции правила;
- `apps/webapp/src/modules/auth/sessionCanonicalUserIdPolicy.ts` — убрать `dev bypass` из заголовочного
  комментария, не меняя код.

Не переименовывать `ALLOW_DEV_AUTH_BYPASS`, `devBypassPolicy.ts`, функции или route: это совместимый env-name
с сохранённым helper, а не fixture/authenticated path. Не менять поведение, тесты, workflow, deploy logic и другие
документы. Исторические логи/audit records не переписывать.

Проверить `git diff --check` и точным `rg` по активным `AGENTS.md apps deploy docs/ARCHITECTURE` (с исключением
`**/LOG.md`) доказать, что нет формулировки, разрешающей authenticated `dev-bypass`, и нет code-comment,
считающего его живым. Тесты не запускать: меняются только docs/comments, поведение SHA `12ca8b0ed` не меняется.

Коммитить только три перечисленных пути явным staging без `git add -A`. В отчёте дать SHA, exact diff, команды и
`NOT DONE: lead acceptance / live owner-account login / landing / deploy`.
