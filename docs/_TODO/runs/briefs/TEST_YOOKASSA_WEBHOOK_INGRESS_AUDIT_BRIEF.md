# TEST YooKassa webhook ingress — independent audit

**Тест или взгляд:** один смешанный pass. Итоговая nginx-изоляция и scope проверяются взглядом по rendered config;
повторяемый checker/self-test проверяется временными fault injections. Authority: `AGENTS.md` §1/§1b/§9/§24,
`docs/ARCHITECTURE/SERVER CONVENTIONS.md`, B0.3 в `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md`, worker brief
`docs/_TODO/runs/briefs/TEST_YOOKASSA_WEBHOOK_INGRESS_BRIEF.md`, candidate `917e6c64a`.

До чтения изменённого checker составить blind kill-set. Источник оракула: B0.3 — «тестовой картой, от корзины до
захвата, с подтверждением по вебхуку».

## Guarantees

1. Ровно три существующих YooKassa callback URI доступны из всех семи официальных сетей и доходят до TEST webapp.
2. Другой provider id, соседний `/api/payments/*` путь и весь остальной TEST по-прежнему не получают публичный allow.
3. В callback location сохранены private/VPN entries, `deny all`, webapp upstream и реальные forwarded headers;
   `X-Real-IP` берётся из `$remote_addr`, не из клиентского заголовка.
4. Общий vhost сохраняет исходный private allowlist + `deny all`; integrator routing и maintenance behavior не
   изменены.
5. Repo dry-run проверяет именно generated config. Конфигурация проходит `bash -n`; никакого apply/reload/deploy.

## Fault evidence and scope

Временно проверить как минимум: удалить provider CIDR; расширить regex до `/api/payments/`; заменить real-IP на
`$http_x_real_ip`; удалить общий `deny all`. Все временные поломки откатить. Auditor не чинит product. Постоянными
могут остаться только audit report и недостающий acceptance self-test, если он действительно относится к named fault.

Не трогать application routes, DB/migrations/settings, `/etc/nginx`, DEV/TEST/PROD и не запускать `--apply`.
Focused commands: checker self-test, apply script `--dry-run`, `bash -n`, scoped ESLint/Node syntax, `git diff --check`.
Report: `docs/_TODO/runs/billing/TEST_YOOKASSA_WEBHOOK_INGRESS_INDEPENDENT_AUDIT_2026-08-02.md` with exact commands,
killed/missed counts, SHA and limits. Commit only allowed audit artifacts; do not push.

