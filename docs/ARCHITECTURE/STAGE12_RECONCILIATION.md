# Stage 12: порядок reconciliation при cutover

Рекомендуемый порядок запуска скриптов reconciliation для этапа 12 (subscription/mailing стабилизация):

1. **backfill-subscription-mailing-domain** (при необходимости) — перенос данных из integrator в webapp.
2. **reconcile-subscription-mailing-domain** — сверка счётчиков по парам: `mailing_topics` / `mailing_topics_webapp`, `user_subscriptions` / `user_subscriptions_webapp`, `mailing_logs` / `mailing_logs_webapp`.
3. **reconcile-communication-domain** (при необходимости) — сверка delivery-данных (`support_delivery_events`).

Скрипт stage12-release-gate (T7) вызывает reconcile-subscription-mailing-domain в рамках проверки перед релизом.
