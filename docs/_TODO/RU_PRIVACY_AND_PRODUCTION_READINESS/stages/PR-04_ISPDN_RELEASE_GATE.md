# PR-04 — ISPDn and release gate

## Зависимости

Для `PR-04A`: все launch-blocking application/security/DR/crypto stages имеют evidence; `PR-03A` принят;
`PR-03B` допускается только как явный accepted deferral с технически доказанным `purge disabled`; `INFRA-01/I1-I4`
доказал dark target и rollback; active SaaS TEST roadmap принят владельцем; release SHA выбран. Для `PR-04B`:
cutover/soak/rotation/decommission evidence из `INFRA-01/I5-I6` закрыто.

## File scope gate

Allowed: эта инициатива, evidence indices и точные docs/runbooks, перечисленные в accepted stage manifests. Out of
scope: новый product/application scope, исправления «заодно» и любые production mutations; находка возвращается в
свою stage/task.

## Работа

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [ ] Зафиксировать физические/логические границы ИСПДн, компоненты, пользователей, каналы и trust boundaries.
- [ ] Внешний специалист утверждает модель угроз, уровень защищённости и применимый набор мер.
- [ ] Сопоставить controls с ПП №1119/приказом ФСТЭК №21: implemented / compensating / not applicable / gap.
- [ ] Проверить локальные акты, ответственных, обучение/доступы, РКН, договоры и incident contacts.
- [ ] Собрать результаты tenant tests, CI/SAST/DAST, host review, secret rotation, restore и tabletop.
- [ ] Независимый technical audit проверяет release SHA и evidence provenance.
- [ ] Внешний reviewer подписывает свою область; владелец закрывает `G-12` и выдаёт GO/NO-GO.

## Два решения вместо циклического gate

- `PR-04A PRE-CUTOVER GO`: относится к release SHA и подготовленной target topology; разрешает открыть `G-11`, но
  не объявляет фактическую миграцию завершённой.
- `PR-04B POST-CUTOVER CLOSURE`: проверяет реальный host, encrypted mounts/swap/PG, storage coverage, secret
  rotation, soak и удаление старых resources/copies. B может принять продолжающийся `PR-03B` только с выключенным
  purge, owner/deadline и работающим manual request process; полный initiative closure ждёт `PR-03B`.

## Запреты

- Не писать «полное соответствие» без внешнего заключения и закрытого checklist.
- Не снижать severity или удалять finding ради даты запуска.
- Не включать production change в docs gate: для применения нужен отдельный `G-11` task/runbook.

## Выход

- `PR-04A` заполнен до cutover; `FINAL_ACCEPTANCE.md` окончательно закрыт фактами только в `PR-04B`.
- Каждый residual risk имеет severity, compensating control, owner, deadline и acceptance provenance.
- GO относится только к указанному release SHA, topology и дате; изменение границ запускает delta review.
