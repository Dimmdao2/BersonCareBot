# TEST YooKassa webhook ingress — worker brief

## Authority and classification

Bounded infrastructure stage for `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` B0.3. Read `AGENTS.md`
§1/§1b/§6/§9/§24, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, `deploy/HOST_DEPLOY_README.md` and the current
`deploy/host/apply-test-nginx-webapp.sh` before editing. This is a one-time configuration-quality change plus a
repeatable ingress invariant; inspect the rendered nginx and add only the smallest executable guard that proves it.

Human consequence: a test-card payment can reach YooKassa, but its real callback is rejected by TEST nginx, so the
invoice/order remains pending and B0.3 cannot be accepted end-to-end.

Official source for sender networks and HTTPS/443 requirement:
<https://yookassa.ru/developers/using-api/webhooks?banner_recipes=1&projectId=1152>.

## Exact scope

- Branch/worktree: `wt/test-yookassa-webhook-ingress` / `bcb-wt-test-yookassa-webhook-ingress`.
- Primary product file: `deploy/host/apply-test-nginx-webapp.sh`.
- A narrowly related existing checker or one small self-test may be changed only if needed to make the invariant
  executable. Do not create a generic nginx framework.
- No application route, provider, database, migration, journal, environment setting or plan checkbox changes.

## Required behavior

The generated TEST vhost must continue to deny general public traffic. It must make only these existing YooKassa
callback paths reachable from the documented YooKassa sender networks, while retaining the existing owner/VPN/local
allow entries:

```text
/api/payments/saas-webhook/yookassa
/api/payments/webhook/yookassa
/api/payments/patient-acquiring-webhook/yookassa
```

Official networks to encode exactly in the route-local access policy:

```text
185.71.76.0/27
185.71.77.0/27
77.75.153.0/25
77.75.156.11/32
77.75.156.35/32
77.75.154.128/25
2a02:5180::/32
```

The callback location proxies to the TEST webapp `127.0.0.1:6300` and preserves `Host`, `X-Forwarded-Host`,
`X-Forwarded-Proto`, `X-Real-IP $remote_addr` and `X-Forwarded-For`; application verification depends on the real
sender address. Do not allow a broader `/api/payments/` prefix, other provider ids, or all public traffic.

## Prohibited actions

- Do not run `--apply`, reload nginx, deploy TEST, edit `/etc/nginx`, or mutate DEV/TEST/PROD.
- Never touch PROD host/config/path and do not run PROD commands.
- Do not print secrets or authenticated settings.
- Do not push the worker branch.

## Evidence and delivery

- Prove current failure from the repo-generated vhost, then prove the rendered config has the exact narrow location,
  all seven provider networks, existing private allow entries, webapp proxy and real-IP headers while the general
  vhost still ends in `deny all`.
- Run `bash -n deploy/host/apply-test-nginx-webapp.sh`, the repo checker/self-test, and
  `bash deploy/host/apply-test-nginx-webapp.sh --dry-run`; dry-run is read-only.
- Run `git diff --check` and relevant scoped lint/tests if another file changes.
- Commit only explicit task files with a message naming B0.3/#1057. Report exact commands/output, SHA and limits.

