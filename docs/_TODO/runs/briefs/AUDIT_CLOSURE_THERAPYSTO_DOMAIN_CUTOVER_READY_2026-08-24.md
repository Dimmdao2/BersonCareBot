# Closing audit — Therapysto future domain cutover readiness

## Тест или взгляд

- Повторяемое CLI-поведение: переиспользовать уже созданный независимый kill-set и `deploy/host/therapysto-domain-cutover.acceptance.test.mjs`; проверить тот же public CLI и fault classes. Новый слепой kill-set той же поверхности не писать.
- Разовое качество deploy-пакета: полным взглядом проверить итоговый diff, реальный существующий TEST nginx/apply seam, TLS/DNS модель, runtime origins/settings, owner-bound apply, pre-install compile, rollback и runbook. Это обязательно, потому что fixer существенно изменил stateful deploy surface и первичный аудит содержал нетестовые findings.

## Роль и точный кандидат

Ты независимый closing auditor, продуктовый код не исправляешь.

- Branch/worktree: `wt/therapysto-domain-cutover-ready-20260824`.
- Exact candidate: `023007142` (полный SHA получить `git rev-parse HEAD`).
- Base before the future-domain package: `5272a0761`.
- Первичный audit commit: `92d62b149`, verdict `FAIL`.
- Fixer commits: `e24a41785`, затем локальные lead corrections `023007142`.

Ничего не применять на DEV/TEST/PROD: не менять DNS, сертификаты, nginx, env, systemd, БД, cron/cronport и не делать deploy/merge/push. Текущий `test.bersoncare.ru` остаётся нетронутым.

## Authority

- `AGENTS.md`, особенно §1, §1b, §2–§4, §5, §9–§10b, §24.
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.
- `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`.
- `deploy/HOST_DEPLOY_README.md` и фактические существующие TEST deploy/nginx seams.
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`.
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SURFACE_AND_DOMAIN_MAP_2026-08-22.md`.
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_DOMAIN_CUTOVER_READY_2026-08-24.md`: исходный kill-set 1–10 и findings F1–F6.
- `deploy/host/therapysto-domain-cutover.acceptance.test.mjs` — тот же acceptance oracle; lead изменил только fixture на объявленную split-TLS модель и передал точный map digest, не удаляя ни одного из девяти сценариев.

Источник оракула: в `/home/dev/dev-projects/bcb-wt-therapysto-domain-cutover-ready-20260824/docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_DOMAIN_CUTOVER_READY_2026-08-24.md` дословно: «Existing TEST nginx seam survives (view).» и «Owner gate, pre-reload validation and rollback are atomic (repeatable CLI behavior + view).»

Позднее решение владельца: будущую новую доменную схему подготовить полностью в отдельной ветке, но не вливать и не применять; существующий TEST продолжает работать на старом `test.bersoncare.ru` до отдельной команды.

## Обязательная проверка

1. Пройди все десять исходных kill-set пунктов и F1–F6; по каждому дай PASS/FAIL с достижимым сценарием и evidence.
2. Самостоятельно проверь, что candidate действительно композирует весь существующий TEST seam, а не копию нескольких строк, и что future apply не уничтожает текущий адрес/security/integrations.
3. Проверь реальную целевую топологию из surface map: `therapysto.ru`, `admin.therapysto.ru`, apex `therapygo.ru`, wildcard `*.therapygo.ru`, branded subdomain и separate exact custom domain. Не принимай fixture-domain эвристику за product contract.
4. Проверь, что один platform cert фактически покрывает каждый server_name, custom cert отделён, key paths используются и certificate/key mismatch ловится до install. Мониторинг обязан ловить DNS drift, hostname mismatch и threshold/expiry.
5. Проверь точность callback allowlist, происхождение DB-backed `yandex_oauth_redirect_uri` и действительно ли пакет готовит/доказывает все runtime inputs до owner apply. Если ручной Admin Settings prerequisite не проверяется CLI, реши по authority, является ли это честной готовностью или достижимым разрывом.
6. Проверь точный map-bound owner gate без fixture bypass; offline modes без host effects; candidate compile до первой мутации; rollback отдельно для каждого возможного частичного env/nginx install и отсутствие reload после failed validation.
7. Прогони неизменённые девять сценариев, основной contract test, `bash -n`, `git diff --check`; локальный nginx compile только на `/tmp`/fixtures. Полный CI не нужен и live state не читать.
8. Проверь lead corrections `023007142`: wildcard должен быть `*.<patient apex>`, OAuth список — ровно два callback без extras/duplicates, rollback возвращает env даже если nginx install ещё не начался, live monitor проверяет hostname.
9. PASS возможен только если блокирующих findings нет. При FAIL не чинить продукт: оставить один audit artifact с конкретным достижимым impact. Можно добавить/закоммитить только действительно недостающие acceptance tests и audit artifact; исторический первичный FAIL не переписывать.

## Завершение одного хода

Дождись всех команд на переднем плане. Закоммить только audit artifact и при необходимости новые acceptance tests явными путями; `git add -A` запрещён. Сообщи exact candidate SHA, verdict, findings, команды/результаты, какие fault injections реально краснели и что live state не трогалось.
