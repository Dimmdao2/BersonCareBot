# D15b/6 — repeat rollback-only named-DEV preflight for corrected candidate

Роль: `auditor-live`. Проверить exact product candidate `85197a08b03ebe6a011a32ff60c2192a56461f29` из
`wt/d15b6-audit-20260821` до landing. Это повтор того же saved live gate после точной source-origin ordering
коррекции, не новый audit-cycle, не product-fix и не применение миграции.

Перед действием прочитать карту `AGENTS.md`, затем §1/§1b migration/named DEV, §5/§6, §9–§10 и §24; прочитать
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`,
`deploy/HOST_DEPLOY_README.md`, `deploy/host/migrate-dev.sh`; повторить поиск более поздних owner-решений в
`docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` и актуальном `WORK_ORDER.md`.

Источник оракула: `AGENTS.md` §1 — «До аудита и landing кандидат миграции обязан пройти owner-aware rollback-only preflight против именованной DEV из точного candidate checkout».

## Exact candidate gate

- Доказать, что `85197a08b` — предок HEAD, tracked tree чистое, и blob
  `apps/webapp/db/drizzle-migrations/20260821T040000_cut_over_canonical_contacts.sql` на HEAD совпадает с blob
  exact product SHA. После product SHA допустимы только brief/queue/integration merges без migration diff.
- Target только named DEV `bcb_webapp_dev` на `151.241.228.122`.
- Единственный DB entrypoint: `bash deploy/host/migrate-dev.sh --preflight` из candidate worktree. Wrapper выполняет
  pending owner-marked DDL в одной транзакции с ROLLBACK; migration ledger/apply не пишет. Разрешён только его
  штатный relation-wall registry seed.
- Запрещены `--execute`, `--reapply`, прямой `psql`, ручной SQL, fixture, disposable DB, TEST/PROD, landing,
  deploy, push и full CI.

## Механика

Candidate не хранит env. В detached child создать regular mode-0600 copies канонических
`/home/dev/dev-projects/BersonCareBot/.env` и
`/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` в соответствующих candidate paths; поставить trap,
удаляющий только эти две копии; запустить wrapper через `setsid` с логом
`/tmp/d15b6-candidate-preflight-retry2-20260821.log` и PID-файлом
`/tmp/d15b6-candidate-preflight-retry2-20260821.pid`. Дождаться terminal exit в этом ходу. Не читать/не печатать
env, URL или пароль. Если wrapper log содержит contact/PII detail, в артефакт переносить только безопасную
классификацию и строки без PII.

После terminal result подтвердить: child остановлен, обе env-копии и PID-файл удалены, candidate tracked tree
чистое. Не исправлять найденный дефект в роли аудитора.

Создать и закоммитить только
`docs/_TODO/runs/integrator-cleanup/D15B6_CANDIDATE_NAMED_DEV_PREFLIGHT_RETRY2_RESULT_2026-08-21.md`: exact SHA/blob,
команда, exit code, безопасные последние строки, PASS|FAIL, cleanup и
`NOT DONE: landing / execute migration / live login-bind-delivery gate / TEST / deploy / push / full CI`.
Staging только report path, без `git add -A`.
