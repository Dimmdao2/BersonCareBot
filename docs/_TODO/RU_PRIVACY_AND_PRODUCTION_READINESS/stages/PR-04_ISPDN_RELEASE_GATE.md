# PR-04 — ISPDn and release gate

## Зависимости

Все предыдущие stages имеют evidence; active SaaS TEST roadmap принят владельцем; production release SHA выбран.

## File scope gate

Allowed: эта инициатива, evidence indices и точные docs/runbooks, перечисленные в accepted stage manifests. Out of
scope: новый product/application scope, исправления «заодно» и любые production mutations; находка возвращается в
свою stage/task.

## Работа

- [ ] Зафиксировать физические/логические границы ИСПДн, компоненты, пользователей, каналы и trust boundaries.
- [ ] Внешний специалист утверждает модель угроз, уровень защищённости и применимый набор мер.
- [ ] Сопоставить controls с ПП №1119/приказом ФСТЭК №21: implemented / compensating / not applicable / gap.
- [ ] Проверить локальные акты, ответственных, обучение/доступы, РКН, договоры и incident contacts.
- [ ] Собрать результаты tenant tests, CI/SAST/DAST, host review, secret rotation, restore и tabletop.
- [ ] Независимый technical audit проверяет release SHA и evidence provenance.
- [ ] Внешний reviewer подписывает свою область; владелец закрывает `G-12` и выдаёт GO/NO-GO.

## Запреты

- Не писать «полное соответствие» без внешнего заключения и закрытого checklist.
- Не снижать severity или удалять finding ради даты запуска.
- Не включать production change в docs gate: для применения нужен отдельный `G-11` task/runbook.

## Выход

- `FINAL_ACCEPTANCE.md` закрыт фактами.
- Каждый residual risk имеет severity, compensating control, owner, deadline и acceptance provenance.
- GO относится только к указанному release SHA, topology и дате; изменение границ запускает delta review.
