# D15b/6 — rollback-only named-DEV preflight after schema-create marker fix

Роль: `auditor-live`. Проверить exact candidate
`b1ac4e9adf716c06f658ada83a285e5928ddb2dd` в `wt/d15b6-audit-20260821` до landing. Это повтор
того же saved live gate после точного metadata-fix, не новый blind audit, не product-fix и не применение
миграции.

Классификация «Тест или взгляд»: взгляд — разовый owner-aware rollback-only runtime gate exact candidate.
Новый тест, blind kill-set и fault injection не нужны.

Перед действием прочитать карту `AGENTS.md`, затем §1/§1b migration/named DEV, §5/§6, §9–§10 и §24;
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`,
`docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`, `deploy/HOST_DEPLOY_README.md` и
`deploy/host/migrate-dev.sh`. До запуска повторить `code-search` и exact search по более поздним
owner-решениям в `docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` и текущем
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`; более позднее решение заменяет brief.

Источник оракула: `AGENTS.md` §1 — «До аудита и landing кандидат миграции обязан пройти owner-aware rollback-only preflight против именованной DEV из точного candidate checkout».

## Exact candidate gate

- Доказать, что `b1ac4e9ad` — предок HEAD, tracked tree чистое, а blob
  `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql` на HEAD совпадает
  с exact product SHA. После него допустимы только этот brief, queue и merge commits без migration diff.
- Target только named DEV `bcb_webapp_dev` на DEV/TEST host `151.241.228.122`.
- Единственный DB entrypoint:
  `bash deploy/host/migrate-dev.sh --preflight` из candidate worktree. Wrapper исполняет pending
  owner-marked statements в транзакции и завершает ROLLBACK; ledger/apply не пишет. Разрешён только его
  штатный declaration-derived registry seed.
- Запрещены `--execute`, `--reapply`, прямой `psql`, ручной SQL, fixture, disposable DB, TEST/PROD,
  landing, deploy, push и full CI. Не чинить найденный дефект в роли аудитора.

## Механика

Candidate не хранит env. В detached child создать regular mode-0600 copies канонических
`/home/dev/dev-projects/BersonCareBot/.env` и
`/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` в соответствующих candidate paths; поставить
trap, удаляющий только эти две копии; запустить wrapper через `setsid` с логом
`/tmp/d15b6-candidate-preflight-retry3-20260821.log` и PID-файлом
`/tmp/d15b6-candidate-preflight-retry3-20260821.pid`. Дождаться terminal exit в этом ходу. Не читать и не
печатать env, URL, пароль или contact/PII values.

После terminal result подтвердить: child остановлен, обе env-копии и PID-файл удалены, candidate tracked tree
чистое. В result переносить только безопасную классификацию и строки без PII.

Создать и закоммитить только
`docs/_TODO/runs/integrator-cleanup/D15B6_CANDIDATE_NAMED_DEV_PREFLIGHT_RETRY3_RESULT_2026-08-21.md`:
exact SHA/blob, команда, exit code, безопасные последние строки, PASS|FAIL, rollback/ledger evidence, cleanup и
`NOT DONE: landing / execute migration / D31 combined preflight / live login-bind-delivery gate / TEST / deploy / push / full CI`.
Staging только result path, без `git add -A`.
