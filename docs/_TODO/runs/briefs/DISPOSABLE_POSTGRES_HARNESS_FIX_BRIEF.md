# Б1 — fix-round после независимого FAIL-аудита disposable PostgreSQL harness

## Роль и authority

Ты bounded worker. До действий прочитай `AGENTS.md` по маршруту (§1/§6 для private PostgreSQL harness,
§7/§9/§10/§24), `docs/ORCHESTRATION_BINDINGS.md` и соседний harness code/report. Authority —
`docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, Б1, и уже зафиксированный
независимый kill-set в
`docs/_TODO/runs/testsuite-v2/DISPOSABLE_POSTGRES_HARNESS_BLIND_AUDIT_REPORT.md`. Исправить только три
`MUST FIX` из отчёта. Не расширять Б1 до Б3, A1/RLS, integrator test-contour, сигналов, DEV/TEST/PROD,
deploy или полного CI. Push запрещён.

Источник оракула: `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, Б1 — «Общий harness строит один template из
`a0-greenfield` + pending webapp Drizzle migrations и даёт отдельный clone тесту; A0/A1 остаются отдельными
repo-level gates»; «cleanup переживает setup/test failure».

## Зафиксированные разрывы

1. Template переносит Drizzle ledger, но оставляет `integrator.schema_migrations` пустым: runtime `0` против
   `68` committed entries в A0 manifest. Нельзя запускать integrator migrations — Б1 обязан трансплантировать
   уже зафиксированные ledger rows из committed
   `docs/ARCHITECTURE/DB_DUMPS/a0-greenfield/migration-manifest.json`.
2. Cleanup доверяет координатам из env и форме пути. Чужой mode-`0700` decoy с допустимым
   `pbt_cluster_*` prefix был удалён. У teardown должна быть проверяемая exact-invocation ownership, а не
   только prefix/mode/canonical-path guard. Чужая или cross-wired цель не останавливается и не удаляется.
3. `stopCluster()` игнорирует error/status `pg_ctl stop`, удаляет data root и возвращает success при живом
   postmaster. Root удаляется только после доказанной остановки exact own process; любой непроверенный stop
   даёт nonzero/throw и не маскируется как cleanup success.

## Необходимый и достаточный результат

- A0 schema/seed остаются единственным baseline; pending применяются только webapp Drizzle runner.
- Committed integrator ledger rows переносятся как данные baseline, без исполнения SQL интегратора.
- Exact ownership создаётся при start и проверяется при каждом stop/drop/remove. Соседний/подложный guarded
  root переживает cleanup неизменным.
- Stop проверяет spawn error, exit status/signal и фактическое завершение собственного postmaster до удаления
  root. Не добавлять broad glob cleanup и не убивать процесс по одному непроверенному PID.
- Existing healthy/setup/migration/test/list/parallel cleanup и private Unix-only transport сохраняются.

## Acceptance — тот же kill-set, не новый аудит

- Сохранённый красный oracle
  `pgDisposableHarness.postgres.integration.test.ts` зеленеет: integrator versions равны committed manifest
  (на audit target было `68`, число берётся из manifest, не хардкодится).
- Fault для env-shaped чужого decoy: команда teardown завершается отказом для чужой цели, decoy и sentinel
  остаются; собственный target после этого штатно убирается.
- Fault для неуспешного stop command: harness не сообщает success, не удаляет root до остановки и не оставляет
  незамеченный живой postmaster; тест адресно убирает только собственный временный процесс после проверки.
- Повторить audit evidence для broken pending migration, две одинаковые fresh schema, два parallel clone,
  healthy и failure cleanup, runner visibility, A0 `8/8`, typecheck, targeted lint и `git diff --check`.

Не оставлять test-only fault hooks в production path. Если для детерминированного теста нужна инъекция
command/filesystem adapter, она должна быть узкой и использоваться обычным кодом, а не включаться скрытой env
переменной. Один содержательный commit с `#1081`, чистое дерево. Обновить
`DISPOSABLE_POSTGRES_HARNESS_TRANSPLANT_REPORT.md` и audit report секцией fix-round с точными командами;
галочку Б1 не ставить — решение о land принимает оркестратор после повторения acceptance.
