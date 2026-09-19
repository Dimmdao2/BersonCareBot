# S11 PAY-REL-04 — correction after independent audit

Канон: `AGENTS.md`, обязательно §§1 (миграции), 5, 10a, 10b, 24. Authority: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, первоначальный brief `docs/_TODO/runs/s11-payment-reconciliation-brief.md`, сохранённый независимый oracle/report `docs/_TODO/runs/s11-payment-reconciliation-audit.md`, queue verdict в `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md`.

Исправь exact findings F1–F6 одним цельным проходом. Новый blind audit, новый kill-set и новые тесты не нужны: переиспользуй тесты коммита `ca35b7a1b` и все inspection-критерии отчёта. Продуктовый результат должен сохранять архитектуру candidate `1d518c38a`: существующие `outgoing_delivery_queue`, scheduler, provider adapter и единственный `settleProviderWebhookEvent`/atomic SQL root; без второй очереди, второго журнала, нового процесса, env/system settings, UI и ручного fallback.

## Обязательные исправления

1. **F1 typecheck.** Убери двойное поле `ok` в process route без ослабления строгой схемы/подписи/tenant principal.
2. **F2 repeat point lane.** Nonterminal appointment intent должен получать новый due point-row после предыдущего `sent`; active `pending/processing/failed_retryable` row остаётся единственным. Не допускай lifetime collision `event_id`. Повторный tick/provider ответ остаётся идемпотентным в canonical settlement root.
3. **F3 YooKassa invoice.** Appointment intent с deadline создаётся как invoice, поэтому provider ref `in-…` нельзя передавать в `GET /payments/{id}`. Следуй официальному протоколу YooKassa: authenticated `GET /v3/invoices/{invoice_id}` → при наличии `payment_details.id` authenticated `GET /v3/payments/{payment_id}` → нормализованный fact сохраняет local invoice ref для binding и тот же webhook-compatible idempotency key. Источник: <https://yookassa.ru/developers/payment-acceptance/scenario-extensions/invoices/payments>. Direct payment ref продолжает читаться как payment. Сохрани совместимость с уже созданными intent; не полагайся только на новый metadata, которого у старых строк нет.
4. **F4 unbound item.** Appointment-looking provider success нельзя `continue`-нуть только из-за отсутствующего/повреждённого `purpose`. Если признаки appointment binding есть, элемент обязан разрешиться в локальный intent и пройти полную проверку либо остановить checkpoint стабильной диагностируемой категорией. Нерелевантные SaaS/package payments не должны попасть в appointment settlement.
5. **F5 incidents.** Не стирай безопасные категории на signed HTTP/queue boundary. Truncated list, appointment-looking unbound item, binding mismatch, unavailable capability/provider и terminal timeout/5xx exhaustion должны стать различимыми low-cardinality incident keys. Сырые provider response/payload, credentials, checkout URL и patient data не возвращать и не сохранять. Не превращай динамический `Error.message` в incident key: только allowlist mapping.
6. **F6 late success.** `success_after_local_expiry` должен реально и идемпотентно открывать/touch operator incident, при этом деньги проходят canonical settlement, отменённая запись не воскресает. Locally cancelled/failed appointment intent с provider ref не должен выпадать из point/sweep discovery до наблюдения terminal provider outcome; после terminal provider event он перестаёт удерживать окно. Не делай вечный sweep от самого старого исторического cancelled intent без способа доказать завершённость.

Сохрани bounded/fair materialization: один проблемный tenant/intent не должен навечно вытеснить остальные из лимита. Checkpoint двигается только после полного, неусечённого прохода, где каждый appointment-looking item либо проведён, либо pass останавливается ошибкой. Safe upper bound и overlap остаются явными.

## Проверки и выход

- Не менять смысл сохранённых acceptance tests и не подгонять oracle под код. Если fixture требует честного дополнения для официального invoice response, объясни это в evidence, но не ослабляй утверждение.
- Повтори обе красные команды из audit report до GREEN; затем scheduler/settlement fault-injection acceptance set, existing provider/webhook/settlement, scheduler/worker/queue suites.
- Запусти webapp/integrator typecheck и lint, `pnpm run check:db-privileges-generated`, migration order/targeted privilege gates, `git diff --check`.
- Если меняется migration/declaration: обнови существующую ещё не применённую reconciliation migration и generated artifacts, затем canonical owner-aware rollback-only `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot`. Execute/full CI/push/deploy запрещены.
- Обнови `docs/_TODO/runs/s11-payment-reconciliation-evidence.md`: по F1–F6 назови исправление, команды и результаты. Не переписывай независимый audit report.
- Коммить только явные task paths, без `git add -A`; дерево чистое. Не заканчивай ход в ожидании фоновой команды.
