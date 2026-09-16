# Тест или взгляд — continuation аудита clinic management workspace #1099

Это не новый blind audit. Продолжи и заверши прерванный системным лимитом проход
`clinic-management-workspace-audit-20260907` в
`/home/dev/dev-projects/bcb-wt-clinic-management-workspace-20260907`, ветка
`wt/clinic-management-workspace-20260907`.

Обязательная authority: `AGENTS.md` (карта заголовков, затем полностью §1, §5, §9, §10a, §10b, §11,
§16–§17, §21–§22, §24), `docs/_TODO/CLINIC_MANAGEMENT_WORKSPACE_2026-09-07.md`,
`docs/_TODO/CLINIC_SCHEDULE_ROLE_SCOPE_1028.md` и исходный brief
`runs/clinic-management-workspace-audit-brief-20260907.md`.

Candidate product commit: `457f745430486a6dfca8bd237d5f5168e23649fb`; текущий HEAD дополнительно содержит только merge свежего
`feat/doctor-ui-rebuild`. Сохранённые изменения первого аудитора:

- tracked test changes: stash commit `0ada0f391c9f2d595f25391e159dbf5c93692fa4`;
- new composition test: stash commit `9d85de7243eea37f79a1c2c8bafb2acbb08ad5c0`.

В начале примени оба stash commit через `git stash apply <полный SHA>` и проверь статус. Не удаляй stash до
успешного коммита — это страховочная копия.

## Завершить, не начинать заново

- Используй уже сформированный blind kill-set и написанные тесты. Не повторяй широкий поиск и не создавай второй
  набор того же покрытия.
- Проверь каждое изменение тестов: оставить только поведенческие permission/tenant/composition tests из исходного
  brief и необходимые typed fixture updates. Удалить любой UI/DOM/text/count/source-shape/format/gate test.
- Доведи targeted tests до запуска. Допустимо использовать существующие package builds/node_modules из основного
  checkout без изменения dependencies/lockfile; не запускать full CI и live UI.
- Если acceptance-test красный на candidate — это ожидаемый FAIL evidence, продукт не исправлять. Для зелёного
  нового теста требуется уже выполненная первым аудитором fault-injection evidence; если она не доказана в
  сохранённом raw run, новый постоянный тест без доказательства не оставлять.
- Заверши разовые проверки privilege/migration, single-resolver/writer reuse, doctor own scope, отсутствие M5 и
  фактически незаконченных Settings/action UI. Это «взгляд», не новые source-shape tests.
- Исправлять production code запрещено. Временные production-поломки должны отсутствовать в итоговом diff.

## Артефакт и коммит

- Создай `docs/REPORTS/CLINIC_MANAGEMENT_WORKSPACE_AUDIT_2026-09-07.md`: PASS/FAIL, base/product/candidate SHA,
  blind fault table с test/view evidence, fault injections, точные команды/результаты и только достижимые findings
  с impact и нарушенной строкой authority. Отдельно зафиксируй известный typecheck result и system interruption
  первого прохода.
- Коммитить только выбранные tests и этот artifact явными путями, `git add -A` запрещён. Subject:
  `test(clinic): audit management workspace candidate (#1099)`.
- Не пушить, не land. Закончить одним итоговым FAIL/PASS report, commit SHA и подтверждением чистого дерева.
- Не заканчивать ход в ожидании процесса; все проверки foreground, коммит до финала обязателен.
