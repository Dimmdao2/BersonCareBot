# B0.2 — независимый аудит deploy-гейта mock payment (#1057)

Тест или взгляд: **тест + inspection**. Поведение shell-гейта можно сломать временными артефактами; одного чтения
недостаточно. Прочитать `AGENTS.md` §9/§10/§24, authority
`docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` B0.2/B0.3 и worker brief
`docs/_TODO/runs/briefs/BILLING_MOCK_DEPLOY_GATE_REPAIR_BRIEF.md`. Candidate — commit `5e438a486` в
`wt/billing-mock-deploy-gate`.

Источник оракула: B0.2 — «Гейт деплоя отказывает, если в собираемом артефакте присутствуют маршруты
`*/payments/mock-complete` или предикат `isMockPaymentConfirmEnabled`»; безопасное дерево после B0.3 содержит
ровно ноль обоих артефактов.

## Проверить независимо

1. До чтения реализации сформировать три обязательных исхода: чистая поверхность PASS; любой matching route
   REFUSE; exact predicate-file REFUSE. Запустить selftest и отдельно current-tree gate.
2. Inspection exact path matching: gate не может принять вложенный matching route; отсутствие файла не зависит от
   NODE_ENV/VITEST; неправильная arity/несуществующий root отказаны понятным non-zero.
3. Ровно три deploy caller-а вызывают gate с одним repo-root аргументом. Остальной порядок stop/migrate/gates/
   restart не изменён, особенно в `deploy-test-saas.sh`; deploy не выполнять.
4. `bash -n` для двух gate scripts и трёх caller-ов; `git diff --check`; проверить, что product diff ограничен
   worker brief. Полный CI не нужен.
5. Отдельно проверить отчёт worker-а: строка «Independent behavior/inspection audit: PASS» до этого прогона —
   ложная запись готовности. Удалить/заменить её фактическим результатом этого аудита. Если остальной product
   имеет finding, продукт не чинить: verdict FAIL и точный достижимый сценарий. Если product green, разрешено
   коммитить только audit artifact и коррекцию ложной audit-строки.

## Выход

Создать `docs/_TODO/runs/billing/B0.2_MOCK_DEPLOY_GATE_INDEPENDENT_AUDIT_2026-08-02.md` с командами, выводом,
kill-set и verdict PASS/FAIL. При PASS — один audit commit; B0.2 checkbox не закрывать, DB/DEV/TEST/PROD/deploy/
taskdb не трогать.
