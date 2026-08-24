# Fix Therapysto domain cutover readiness — 2026-08-24

## Тест или взгляд

- Повторяемое CLI-поведение: исправить продуктовые shell-скрипты так, чтобы тот же независимый acceptance-набор аудитора стал зелёным; тесты не ослаблять и не переписывать под текущую реализацию.
- Разовое качество deploy-пакета: прочитать итоговый diff, существующий TEST nginx/apply seam, runtime origin/auth configuration и runbook; сохранить все действующие границы TEST. Это принимается взглядом по фактическому итоговому состоянию, `bash -n`, локальным render/compile и diff, а не тестом на строки исходника.

## Роль и задача

Ты один сильный fixer/worker. Доведи весь цельный пакет будущего переключения доменов до land-ready состояния в текущей отдельной ветке. Не делай серию микроправок и не заканчивай ход после первого зелёного теста: закрой все шесть blocking findings F1–F6 и все десять пунктов blind kill-set из независимого аудита.

Это только подготовка будущего cutover. Ничего не применять на DEV/TEST/PROD, не менять DNS, сертификаты, nginx, env, systemd, БД, cron/cronport и не делать deploy/merge/push. Нынешний `test.bersoncare.ru` обязан продолжать работать без изменений; ветка останется невлитой до отдельной команды владельца.

## Authority

- `AGENTS.md`, особенно §1, §1b, §2–§4, §5, §7, §9–§10b, §24.
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md`.
- `docs/ARCHITECTURE/LOCAL_DEV_AND_AGENT_TESTING.md`.
- `deploy/HOST_DEPLOY_README.md` и существующие deploy/nginx/apply scripts — фактический действующий TEST seam.
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md`.
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/SURFACE_AND_DOMAIN_MAP_2026-08-22.md`.
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_DOMAIN_CUTOVER_READY_2026-08-24.md` — независимый FAIL, kill-set и F1–F6.
- `deploy/host/therapysto-domain-cutover.acceptance.test.mjs` — уже написанные независимым аудитором public-CLI acceptance tests; не ослаблять.

Источник оракула: в `/home/dev/dev-projects/bcb-wt-therapysto-domain-cutover-ready-20260824/docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/AUDIT_DOMAIN_CUTOVER_READY_2026-08-24.md` дословно: «Existing TEST nginx seam survives (view).» и «Owner gate, pre-reload validation and rollback are atomic (repeatable CLI behavior + view).»

Позднее прямое решение владельца имеет приоритет над прежними агентскими запретами: подготовить всё в отдельной ветке, не вливать и не переключать домены; нынешняя схема на `test.bersoncare.ru` остаётся работающей до отдельной команды владельца.

## Обязательный результат

1. Не создавай второй параллельный deploy-path. Параметризуй/расширь существующие TEST nginx/apply seams либо безопасно композируй из них общий источник так, чтобы будущий пакет сохранял текущую конфигурацию целиком: старый hostname, VPN/IP allowlist, integrator routes, payment webhook exceptions, logs, maintenance fallback, upload/timeouts и forwarded Host.
2. Не угадывай runtime values. Host map должен содержать и валидировать одобренный DNS target, все runtime origins/callbacks, отдельные platform apex+wildcard certificate/key paths и отдельную exact-host certificate/key pair клиники. Все объявленные значения реально используются render/preflight.
3. Offline render не имеет host-side effects. Невалидные, пустые, повторяющиеся, пропущенные либо неразрешённые значения отвергаются.
4. Candidate nginx валидируется до замены active config. Apply допускается только точным owner gate, связанным с точным набором cutover values. Nginx и coupled env/runtime inputs устанавливаются как одна откатываемая операция: при любой ошибке старый `test.bersoncare.ru` seam и прежний env остаются/восстанавливаются, reload не достигается после failed validation.
5. Unknown TLS Host fails closed в реально валидном nginx config. Platform certificate доказывает и apex, и wildcard; custom clinic certificate доказывает exact host отдельно; cert/key pairing/path truthful.
6. Monitoring сравнивает каждый DNS answer с approved target и выходит non-zero при drift; certificate threshold configurable и выходит non-zero при истечении/окне предупреждения.
7. Runbook описывает именно исполняемый flow: offline preparation, точную проверку candidate, owner-gated activation, rollback, сохранение старого адреса. Не закрывай live/owner-gated checklist boxes без live evidence.
8. Старый слабый тест `therapysto-domain-cutover.test.mjs` либо расширь до честного поведения, либо оставь только если он не дублирует/не создаёт ложный gate. Независимый acceptance-файл не удалять и не ослаблять.

## Scope

Разрешены только файлы, необходимые для этого цельного deploy-пакета и его документации/тестов, прежде всего:

- `deploy/host/therapysto-domain-cutover*`
- `deploy/host/check-therapysto-domain-certificates.sh`
- `deploy/host/apply-test-nginx-webapp.sh`
- `deploy/host/therapysto-domain-host-map.example.env`
- `deploy/nginx/bersoncarebot-webapp.vhost.template.conf`
- `deploy/HOST_DEPLOY_README.md`
- соответствующие runtime config/env parsing files только если это необходимо для атомарного candidate flow;
- `docs/_TODO/THERAPYSTO_PATIENT_BRANDING_INITIATIVE/IMPLEMENTATION_PLAN.md` — только привести факты/evidence в соответствие, не закрывать live boxes;
- audit artifact и acceptance tests аудитора не переписывать как будто первоначальный FAIL был PASS.

Не трогать продуктовые механики F2/F2b/F5/TPB-19, Track D database functions/roles/migrations, unrelated UI, integrations и другие ветки.

## Проверка и завершение одного хода

- Сначала воспроизведи красный `node --test deploy/host/therapysto-domain-cutover.acceptance.test.mjs`.
- После исправления дождись на переднем плане и покажи зелёными тот же acceptance-набор, основной cutover test, `bash -n` всех изменённых shell scripts и `git diff --check`.
- Выполни локальный одноразовый nginx compile/render с временными fixtures, если nginx доступен; TEST/PROD не трогать.
- Запусти узкий lint/format только для изменённых файлов, если зависимости доступны. Полный CI не нужен: пакет изолирован и остаётся невлитым.
- Проверь весь итоговый diff против F1–F6 и kill-set 1–10, а не только тестовые шесть падений.
- Явно перечисли нетестовые findings и чем они закрыты.
- Закоммить все свои разрешённые изменения явными путями одним содержательным коммитом; `git add -A` запрещён. Не push/merge/apply.
