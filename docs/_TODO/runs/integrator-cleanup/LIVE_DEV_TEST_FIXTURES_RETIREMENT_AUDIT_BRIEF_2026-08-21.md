# Независимый аудит удаления persistent fixture-механизма DEV/TEST

Роль: `auditor-live`. Тест или взгляд: удаление файлов, ссылок, прав и противоречивого active canon проверяется
взглядом/diff/callsite-census; сохраняющееся поведение deploy, dev-login и privilege generator проверяется
существующими целевыми тестами, syntax/typecheck/generator gates. Не писать тесты на отсутствие строк или файлов.

Перед любым действием прочитать карту `AGENTS.md`, затем §0, §1, §1a–§1b, §5, §9–§10b и §24. Повторить поиск
более поздних owner-решений в `docs/OWNER_DECISIONS.md`, `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`, актуальном
`WORK_ORDER.md` и датированных owner-строках. Более позднее несовместимое решение останавливает аудит как
`OWNER QUESTION`; не выбирать мягкий вариант.

## Authority

- `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md`, §10: «на именованных DEV и TEST не создают, не сидируют,
  не reconcile-ят и не требуют persistent fixture-клиники, учётки и наборы данных; удалённый fixture-механизм
  не восстанавливают».
- `docs/_TODO/runs/integrator-cleanup/LIVE_DEV_TEST_FIXTURES_RETIREMENT_2026-08-21.md` — границы удаления.
- Product commit `ce5d5cccf`; canon-normalization commit `dc2fdbcd023d7b69ba238dece12dd0ce952e6063`.
- `AGENTS.md` §0: одна действующая редакция правила, конфликтующие активные формулировки удаляются вместе с
  executable gate/generator; архивные evidence не переписываются.

## Проверяемый результат

1. DEV/TEST deploy, readiness, CI и package scripts больше не требуют и не вызывают seed/reconcile/fixture-account
   machinery; удалённые entrypoints не имеют живых callers или package-script references.
2. Обычный DEV bypass/login для уже зарегистрированных owner-аккаунтов не пишет и не пересобирает пользователей,
   клиники, memberships, телефоны или пароли; удаление DB-writing bypass ports не оставило DI/runtime разрыв.
3. TEST deploy сохраняет migrations, security closure, unit start и canonical health; fixture-шаг не заменён
   скрытым seed/reconcile либо необязательным fallback.
4. Удаление privilege/functions/relations ограничено fixture/test roots: не отозваны права и не удалены roots,
   нужные production DEV/TEST приложению; generated artifacts совпадают с generator output.
5. Диагностика и visual session используют уже существующие аккаунты и не зависят от удалённого mint/fixture
   контракта.
6. Активные `AGENTS.md`, `OWNER_DECISIONS.md`, `OWNER_PRODUCT_RULES.md` и `WORK_ORDER.md` содержат одну
   непротиворечивую редакцию решений про fixtures, D15b/6, D30 и HTTP ownership; старые technical assumptions не
   остаются действующими. Архивные audit/history документы не переписаны.
7. Нет unrelated product refactor, fixture-данные не удаляются из DEV/TEST, пароли owner-аккаунтов не меняются.

## Метод и проверки

- Сначала составить точный список удалённых entrypoints и их бывших callers по diff; затем code-search и точный
  `rg` по активному коду/package/deploy/docs. Не считать архивные evidence живым caller.
- Проверить весь diff от актуального `feat/doctor-ui-rebuild`, а не только отчёт исполнителя.
- Запустить только целевые проверки, дающие сигнал: `bash -n` изменённых shell entrypoints, `node --check` для
  изменённых `.mjs`, соответствующие deploy-host tests, webapp strict typecheck и затронутые auth tests,
  privilege generator `--check`/function census и `git diff --check`. Если точная команда отсутствует — сначала
  найти существующую в package/scripts; новую машинерию не писать.
- Для повторяемого сохранившегося поведения допустима одна fault injection на независимый класс только если
  существующий тест заявлен как proof; все production mutations обязательно откатить. Для механического удаления
  достаточно inspection/census, постоянный negative source-string test запрещён.
- Full CI не запускать: его решение остаётся lead-owned после интеграционного batch.

## Жёсткие границы

- Не обращаться к DEV/TEST/PROD, не применять миграции, не запускать deploy и не читать секреты.
- Не создавать fixture, seed, тестовую учётку, одноразовую базу или historical replay.
- Product fix запрещён. Допустимы только намеренные acceptance-тесты и один audit-artifact; временные поломки
  production-кода откатить.
- Не закрывать D15b/6, D30 или Track D по факту docs-нормализации.
- Дождаться foreground-проверок; если созданы audit artifacts, коммитить только их явными путями, без `git add -A`.

Итог: `FIXTURE RETIREMENT → PASS|FAIL|BLOCKED → evidence`, точный список живых/мёртвых backreferences, команды и
exit codes, SHA audit artifact и явный `NOT DONE`.
