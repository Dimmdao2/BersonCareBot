# D15b/6 — rollback-only preflight exact candidate на named DEV

Роль: `auditor-live`. Это pre-landing acceptance product-кандидата
`5e39a82ce15f0e5e2b39b79ac8c6207266aa5ad7` из текущей головы worktree
`wt/d15b6-audit-20260821`, где поверх product SHA допустимы только audit/brief/queue docs и integration merges;
это не product-fix и не применение миграции.

Классификация «тест или взгляд»: это разовое live-действие. Оракул — терминальный результат штатного
owner-aware rollback-only wrapper, проверка неизменности migration blob и отсутствие ledger/apply; новый тест и
blind fault injection не нужны.

Перед действием прочитать карту `AGENTS.md`, затем §1/§1b (migration + named DEV), §5/§6, §9–§10 и §24;
прочитать `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`,
`deploy/HOST_DEPLOY_README.md`, `deploy/host/migrate-dev.sh` и снова проверить более поздние owner-решения в
`docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`, актуальном `WORK_ORDER.md`.

Источник оракула: `AGENTS.md` §1 «Миграции schema B» — «До аудита и landing кандидат миграции обязан пройти
owner-aware rollback-only preflight против именованной DEV из точного candidate checkout»; §24.3 запрещает landing
ради первой проверки. Owner-решение 21.08 запрещает fixture/disposable DB; точная среда — существующая
`bcb_webapp_dev` на текущем DEV-хосте `151.241.228.122`.

## Границы

- Сначала доказать, что product SHA выше является предком текущего `HEAD`, tracked tree чистое и после него нет
  product-diff миграции: blob exact migration-файла совпадает с blob на `5e39a82ce`.
- Единственный DB entrypoint: `bash deploy/host/migrate-dev.sh --preflight` из exact candidate worktree.
- Wrapper сам проверяет target `bcb_webapp_dev`, owner-aware statement markers, выполняет pending webapp statements
  в транзакции с `ROLLBACK` и механически обновляет declaration-derived relation-wall registry перед ней. Это
  штатный известный preflight side effect; migration ledger/apply он не делает.
- Запрещены `--execute`, `--reapply`, прямой `psql`, ручной SQL, TEST/PROD, fixture, disposable DB, deploy, landing,
  push и full CI.

## Механика, чтобы preflight пережил обрыв хода

Candidate worktree намеренно не хранит secret env. Во временном отсоединённом child-process:

1. создать exact regular copies mode `0600` из
   `/home/dev/dev-projects/BersonCareBot/.env` и
   `/home/dev/dev-projects/BersonCareBot/apps/webapp/.env.dev` в соответствующие candidate paths;
2. поставить trap, который удалит **только эти две копии** при любом выходе child-process;
3. из candidate cwd запустить `bash deploy/host/migrate-dev.sh --preflight` через `setsid`, stdout/stderr писать в
   `/tmp/d15b6-candidate-preflight-20260821.log`, PID — в `/tmp/d15b6-candidate-preflight-20260821.pid`;
4. текущий ход ждёт терминальный exit; если вызывающий агент оборвётся, detached child заканчивает сам, очищает
   env-копии, а lead отдельно читает PID/log;
5. секреты и содержимое env не читать и не печатать. Итоговый лог допустимо читать только как обычный wrapper log:
   он не должен содержать URL/пароли.

Не заканчивать ход, пока процесс ещё жив. После завершения подтвердить отсутствие двух candidate env-копий и
чистоту tracked tree.

## Артефакт

Создать и закоммитить только
`docs/_TODO/runs/integrator-cleanup/D15B6_CANDIDATE_NAMED_DEV_PREFLIGHT_RESULT_2026-08-21.md` с:

- exact candidate SHA и host/DB без секретов;
- точной командой запуска и exit code;
- последними безопасными строками wrapper log;
- явным `PASS` либо `FAIL` без product-fix;
- `NOT DONE: landing / execute migration / live login-bind-delivery gate / TEST / deploy / push`.

Коммитить report явным путём без `git add -A`. Если preflight падает, всё равно сохранить точный FAIL-artifact и
не исправлять продукт в роли аудитора.
