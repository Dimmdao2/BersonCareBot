# #1074 — correction после worker FAIL: удалить оставшиеся e2e test-файлы

Authority:

- `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md:67-74`: оставить **ТОЛЬКО** 31 live-DB файл §A и CI-harness scripts,
  которые прямо названы «это не тесты».
- `docs/_TODO/testsuite-rewrite-list.md`, §A.
- Worker verdict `testcut-cutover-worker-r2`: пункты 1, 2, 4, 5, 6 PASS; пункт 3 FAIL из-за 24 tracked e2e tests.

Исправь только FAIL пункта 3:

1. Получи tracked test/spec inventory через `git ls-files apps | rg '\\.(test|spec)\\.(ts|tsx)$'`.
2. Удали 24 лишних файла, которые не входят в §A. Сейчас это один `apps/integrator/e2e/*.test.ts` и
   двадцать три `apps/webapp/e2e/*.test.ts`.
3. Не трогай `.next`, untracked/generated файлы, production source, scripts/harness, configs, migrations.
4. Перепроверь: tracked remaining test/spec set равен §A в обе стороны; `git diff --check HEAD^` чист.
5. Закоммить correction с `#1074`; в сообщении назови worker FAIL, доказательство и что не сделано
   (independent audit, full CI, plan checkbox, push).

Это correction к существующему шагу 1, не новый audit-pass и не новый scope. Новые тесты не писать.

Финальный ответ: SHA, точные команды/результаты, изменённые файлы, остаточные риски.
