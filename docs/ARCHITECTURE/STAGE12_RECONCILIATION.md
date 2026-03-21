# Stage 12: порядок reconciliation при cutover

Рекомендуемый порядок запуска скриптов reconciliation для этапа 12 (subscription/mailing стабилизация):

1. **backfill-subscription-mailing-domain** (при необходимости) — перенос данных из integrator в webapp.
2. **reconcile-subscription-mailing-domain** — сверка счётчиков по парам: `mailing_topics` / `mailing_topics_webapp`, `user_subscriptions` / `user_subscriptions_webapp`, `mailing_logs` / `mailing_logs_webapp`.
3. **reconcile-communication-domain** (при необходимости) — сверка delivery-данных (`support_delivery_events`).

Скрипт `stage12-release-gate` вызывает **`stage11-release-gate`**, который выполняет:
1. `projection-health` (integrator `projection_outbox`);
2. `reconcile-subscription-mailing-domain`.

Таким образом, subscription/mailing reconciliation уже входит в stage11; stage12 — это явная обёртка для порядка «сначала stage12, затем stage13 gate» (см. `stage13-preflight` → `stage12-gate`).
