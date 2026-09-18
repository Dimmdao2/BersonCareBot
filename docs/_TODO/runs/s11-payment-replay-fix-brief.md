# Fix worker — audit3 payment replay F1–F4

Прочитай `AGENTS.md`: карту, §1/§1b migrations/DEV, §5, §10a–§10b, §24; server docs перед DEV preflight.
Authority: S11 `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, owner rules §21/§24.1,
точный handoff `docs/_TODO/runs/s11-payment-replay-audit3.md`. Работай от candidate `9f2c3fdc7` + audit test
`521a722e5`. Исправь только F1–F4; новых тестов не писать и сохранённый красный test не менять.

1. F1 privileges: исправь единственную declaration и generated artifacts так, чтобы owner-aware migration
   preflight мог создать trigger поверх `app.enqueue_captured_booking_payment_lifecycle`; declaration должна
   соответствовать актуальному replacement body, включая только реально нужные relation/row-lock surfaces.
2. F2 projection: payment replay считается успешным только если восстановлены ВСЕ appointment ids durable job.
   Частичный или несовместимый набор — retryable failure; не отправлять частичное агрегированное сообщение и не
   подтверждать queue row. Доведи сохранённый acceptance-test до зелёного.
3. F3 binding: signed route fail-closed валидирует в каноническом payment root связь
   payment↔organization↔полный набор appointments↔platform patient. Нельзя доверять payload UUID только потому,
   что он HMAC-подписан. Переиспользуй существующий payments repo/port и tenant principal; не добавляй raw DB
   чтение в route/app-layer. Missing/foreign/mismatched binding => 4xx для permanent malformed input либо 5xx
   для transient read failure, но никогда 200/side effects.
4. F4 incident: при terminal dead нового payment M2M replay записывай существующий operator incident с tenant,
   queue/event/payment context до/вместе с mark-dead semantics; transient attempts остаются обычным backoff.

Прогони неизменённый audit1 oracle, новый handler acceptance, focused signed route/worker tests, webapp/integrator
typecheck/lint, migration order, privilege generation/static tests. Затем обязательный owner-aware rollback-only
`bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot` на именованной
DEV; execute не делать. Не full CI/live UI/deploy/push.

Закоммить явные product/generated paths (не `git add -A`), дерево чистое. Отчитай SHA и точные результаты.
