# S11 PAY-REL-04 — independent audit brief

Канон: `AGENTS.md`, обязательно §§5, 10a, 10b, 24. Authority: `docs/_TODO/APPOINTMENT_PREPAYMENT_VISIBILITY_2026-09-11.md`, owner-решения PAY-REL-04/PAY-REL-05 и worker brief `docs/_TODO/runs/s11-payment-reconciliation-brief.md`.

## Тест или взгляд

До чтения существующих тестов классифицируй каждый пункт. Архитектуру, SQL migration/ownership/grants, tenant authority, отсутствие второго settlement-алгоритма и итоговый diff проверяй взглядом, introspection/rollback-only preflight и одноразовыми командами. Повторяемое дорогое и молчаливое поведение денег/идемпотентности допускает blind behavioral acceptance tests только с независимым oracle и конечным наблюдаемым результатом. Не писать UI/DOM/copy/source/registry/shape tests и не тестировать стены PostgreSQL как способность СУБД. Не писать тест ради каждого пункта: если проверка дешевле и честнее чтением/runtime, зафиксируй evidence без постоянного теста.

## Exact candidate

Проверить ровно commit `1d518c38a` ветки `wt/payment-reconciliation` от базы `a2fe36524`; не вливать свежий `feat`, не исправлять продуктовый код. Candidate реализует две bounded lane через существующую `outgoing_delivery_queue`: point lookup due nonterminal appointment intents и organization/provider success sweep; provider read через существующий adapter; settlement только через `settleProviderWebhookEvent`/atomic DB root; durable checkpoint с overlap и oldest unresolved; low-cardinality incidents; без нового scheduler process, queue, payment journal, env или UI.

## Blind kill-set

Составь kill-set ДО чтения тестов и сохрани его в `docs/_TODO/runs/s11-payment-reconciliation-audit.md`. Как минимум проверь конечные сценарии:

1. due pending/processing appointment intent материализуется одной low-priority queue row, повтор wake не создаёт активный дубль;
2. sweep materialизуется отдельно по organization/provider и один сбой арендатора не блокирует другие;
3. provider point/list lookup использует аутентифицированный provider adapter, а scheduler не ходит к provider и не держит длинный batch;
4. success проходит тем же atomic settlement/outbox root, сохраняет совместимый webhook idempotency key и повтор/overlap/webhook не создаёт вторые money/history/outbox/Notification facts;
5. organization — только локальная authority; до settlement проверяются provider ref, intent/idempotency, payer, purpose, appointment subject, amount и currency;
6. canceled/expired provider result может понижать только pending/processing intent, не понижает succeeded/captured и не выпускает capture fact;
7. success после локального expiry/cancel учитывает деньги, не воскрешает appointment и создаёт `success_after_local_expiry` incident;
8. sweep window равно `[min(watermark-overlap, oldest unresolved), safe upper bound]`, checkpoint двигается только после полного неусечённого успешного прохода; crash/retry безопасны;
9. truncated list, unbound appointment-looking item, binding mismatch, timeout/5xx exhaustion и unavailable provider capability становятся диагностируемым low-cardinality incident/retry, без PII/secret/raw payload;
10. tenant principal принят до provider config/read/settlement; новые roots/table имеют минимальные privileges и проходят owner-aware rollback-only migration preflight.

Сверь с каждой строкой worker brief, а не только с этим перечнем. Для любого MUST FIX назови достижимый сценарий, impact и точное нарушенное требование. Style, альтернативная архитектура и speculative hardening — не finding.

## Действия и выход

- Инспектируй diff `a2fe36524..1d518c38a`, реализацию, существующие tests и plan/owner authority.
- Установить зависимости в clone допустимо только штатным способом без изменения lockfile, если это нужно для запуска; не использовать общую DEV БД для destructive fixture. Для DB — только canonical owner-aware rollback-only `bash deploy/host/migrate-dev.sh --preflight --runtime-env-root /home/dev/dev-projects/BersonCareBot`.
- Запусти релевантные существующие provider/webhook/settlement, scheduler isolation/lock, outgoing queue, privilege generation/order checks, typecheck/lint по затронутым приложениям в объёме, оправданном аудитом. Full CI, execute migration, deploy и push запрещены.
- Fault injection — только временная и полностью откатывается. Продуктовый fix не делать.
- Оставить можно только оправданные blind behavioral acceptance tests и audit artifact. Каждый новый/изменённый тест в отчёте обязан назвать независимый oracle, дорогую молчаливую поломку и конечное наблюдаемое последствие; иначе удалить.
- В отчёте: exact SHA/base, kill-set, что проверено взглядом/командами, fault injection, PASS либо конкретные MUST FIX, число пойманных и непойманных классов. Дерево в конце чистое.
- Закоммить audit artifact и допустимые acceptance tests до завершения хода. Не ждать фоновые процессы после выхода.
