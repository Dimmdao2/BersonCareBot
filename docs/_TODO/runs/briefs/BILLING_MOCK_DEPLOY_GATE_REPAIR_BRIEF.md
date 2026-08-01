# B0.2 — repair deploy gate after complete mock-payment removal (#1057)

Прочитать `AGENTS.md` §0/§9/§10/§24 и deploy STOP-gate docs. Authority:
`docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` B0.2/B0.3 и owner ruling «моки надо запретить деплоить —
вот и всё». Base — fresh `feat/doctor-ui-rebuild`.

Источник оракула: B0.2 — «Гейт деплоя отказывает, если в собираемом артефакте присутствуют маршруты
`*/payments/mock-complete` или предикат `isMockPaymentConfirmEnabled`»; после B0.3 безопасная поверхность — полное
отсутствие обоих.

## Последствие

Текущее безопасное дерево содержит 0 mock routes и не содержит predicate, но gate требует хотя бы одну ручку и
отказывает. PROD-релиз блокируется до build/restart; TEST опаснее — migration stage уже прошёл, затем gate падает в
closure и пять сервисов остаются остановлены cleanup-ом. Самотест сейчас принимает обратное: синтетическая mock
ручка + predicate проходят baseline.

## Scope

1. `assert-no-mock-payment-deploy.sh` принимает только `repo_root` и возвращает PASS ровно когда одновременно:
   `*/payments/mock-complete/route.ts` count = 0 и
   `apps/webapp/src/modules/payments/mockPaymentGatePolicy.ts` отсутствует.
2. Любая найденная mock route либо predicate — REFUSED. NODE_ENV/VITEST mirror, route-order checks и старые
   объяснения о сохраняемых dev mocks удалить: после B0.3 это мёртвая модель.
3. Обновить ровно три callers (`deploy-prod.sh`, `deploy-webapp-prod.sh`, `deploy-test-saas.sh`): не читать и не
   передавать NODE_ENV/VITEST ради этого gate. Порядок остальных deploy gates/stop/restart не менять.
4. Переписать existing selftest на три поведения: empty surface PASS; returned route REFUSE; returned predicate
   REFUSE. Не строить новый harness и не выполнять deploy.
5. В `SAAS_BILLING_PLAN.md` исправить ложное evidence B0.3 «8/8 продолжает сторожить» на новый measured gate;
   B0.2 оставить открытым до independent audit — checkbox закрывает лид merge-коммитом.

Разрешённые пути: два gate scripts, три callers, `SAAS_BILLING_PLAN.md` и один короткий report под
`docs/_TODO/runs/billing/`. Не трогать payments product, env files, DB/DEV/TEST/PROD/systemd/taskdb.

## Приёмка

`bash -n` на изменённых shell scripts; selftest 3/3; direct current-tree gate PASS; временная route и временный
predicate каждый дают non-zero (selftest); exact caller census = 3 и старые дополнительные аргументы отсутствуют;
`git diff --check`. После worker — один independent behavior/inspection audit, без реального deploy.
