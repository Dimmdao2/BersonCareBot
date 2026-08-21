# Удаление persistent DEV/TEST fixture-механизма — исправления после аудита

Роль: worker/fixer в той же ветке. Authority — owner-решение 2026-08-21 и единственный первичный независимый
аудит `LIVE_DEV_TEST_FIXTURES_RETIREMENT_INDEPENDENT_AUDIT_2026-08-21.md`. Новый слепой аудит не запускать:
закрыть F1–F3 и прогнать тот же acceptance-набор.

Перед действием прочитать карту `AGENTS.md`, §0, §1/§1a/§1b, §5, §7, §9–§10b и §24. Снова поискать более поздние
owner-решения в `docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` и актуальном WORK_ORDER.
Более поздний конфликт — `OWNER QUESTION`, не мягкая трактовка.

## Источник оракула

`docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §10: «named DEV/TEST do not create, seed, reconcile, or require
persistent fixture clinics, accounts, or datasets». Последнее прямое owner-указание в текущей оркестрации:
проверки используют уже зарегистрированные owner-аккаунты/клиники; fixture-механизм, инструкции по его созданию и
активные зависимости от него удалить. Никаких одноразовых баз.

Audit commit `ac9821747306e93489c561dd31a81baf6f231400` доказал три MUST FIX. Исправить ровно их.

## F1 — synthetic `dev:*` bypass и живой writer

Текущее поведение нельзя оставлять полуработающим: восемь hard-coded `dev:*` preset требуют persistent synthetic
users/bindings, а `seed-qa-broadcast-fake-clients.mjs` заново их пишет. Целевое решение владельца — обычный вход
зарегистрированными owner-учётками, не другой seed и не новый mapping/packet/env-механизм.

- Удалить authenticated synthetic `dev:*` bypass целиком: presets, route, UI-кнопки/query redirect, специальные
  branches в auth service и активные runner/scripts, которые требуют эти токены/аккаунты.
- Удалить `seed-qa-broadcast-fake-clients.mjs`; не оставлять «ручной» или package entrypoint, который пишет fake
  clients/bindings.
- Сохранить обычный email/password/OAuth/messenger login и dev-only `/api/auth/dev-public` clear-session helper.
- Активный канон (`AGENTS.md` owning §1a, `LOCAL_DEV_AND_AGENT_TESTING.md`, webapp README и точечные активные
  backreferences) должен говорить только про обычный вход уже зарегистрированными owner-аккаунтами. Исторические
  логи, audit records и archive не переписывать.
- Не создавать replacement helper, второй login path, fixture packet, hard-coded owner identity или новую env/DB
  настройку. Сначала расширять/сохранять существующий штатный login; новая абстракция не нужна.

## F2 — stale C4 self-test artifact

`deploy/host/smoke-set-postgres-role-password.sh` уже выведен коммитом `fb44002ce`; не восстанавливать его.
Удалить stale `C4_OPERATIONAL_PASSWORD_SMOKE` из required artifact/self-test chain и сохранить реальные действующие
C4 checks (`set-postgres-role-password.mjs`, provisioner/readiness/media retirement и их существующие self-tests).
Команда из аудита должна стать зелёной:

```bash
bash deploy/host/deploy-test-saas.sh --strict-closure-catalog-self-test && \
bash deploy/host/deploy-test-saas.sh --c4-operational-chain-self-test
```

## F3 — fixture-dependent ZAP TEST job

Удалить условно активируемый `zap-test-active-scan` и весь его fixture-seeded TEST/firewall contract. Не
перенацеливать active attack scan на живые owner-данные named TEST. Сохранить только отдельный manual owner-approved
PROD baseline/passive job; если weekly schedule после удаления TEST job ничего законно не запускает, убрать schedule
и оставить `workflow_dispatch`.

## Acceptance

- повторить команды первичного audit report: deploy/privilege tests, generator `--check`, webapp strict typecheck,
  auth composition/env tests, visual-session checks, shell/MJS/JSON syntax, `git diff --check`;
- обе C4 self-test команды выше exit 0;
- точный active-path census подтверждает отсутствие synthetic `dev:*` authenticated path, persistent fixture
  writers/reconcile/seed entrypoints и fixture-dependent ZAP job; не писать постоянный тест на отсутствие строк;
- проверить, что обычные login routes и `/api/auth/dev-public` остаются достижимы по коду/существующим tests.

Не обращаться к DEV/TEST/PROD, не читать secrets, не создавать/менять аккаунты или данные, не запускать fixture,
migration, deploy, full CI или push. Коммитить только явные затронутые пути, без `git add -A`. В конце дерево чистое;
дать SHA, полный file census, команды/exit codes и `NOT DONE: live owner-account login and deploy are lead gates`.
