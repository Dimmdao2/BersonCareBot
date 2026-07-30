# #1074 — независимый аудит шага 1

Authority:

- `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, актуальный порядок в строках 67–92, шаг 1.
- `docs/_TODO/testsuite-rewrite-list.md`, §A.
- `.cursor/rules/test-execution-policy.md`, audit hard rule.
- `docs/ORCHESTRATION_BINDINGS.md`.

Read-only аудит текущего HEAD клона. Целевой stage — два коммита после `970c5f2ac`:
массовое удаление + correction оставшихся e2e. Не исправляй файлы и не расширяй scope.

Сначала построй матрицу по фактам diff, только затем решай, нужны ли дополнительные команды:

1. Удалены только старые test/spec-файлы под `apps/**`, включая e2e tests.
2. Production source, scripts/harness (не test/spec), конфиги и migrations не удалены.
3. Оставшийся набор app test/spec-файлов точно равен 31 строке `testsuite-rewrite-list.md §A`.
4. Актуальное owner ruling применено: пять старых исключений тоже удалены.
5. Рабочее дерево клона чистое; diff механически валиден.
6. Назови, достаточно ли worker-evidence и repo-level CI для закрытия шага 1. Сам full CI не запускай.

Формат: одна строка на каждый пункт `PASS|FAIL|BLOCKED → code evidence → command evidence → residual risk`.
Общий verdict допустим только после всех шести строк. Findings вне этих строк — owner question/recommendation,
не новый scope.
