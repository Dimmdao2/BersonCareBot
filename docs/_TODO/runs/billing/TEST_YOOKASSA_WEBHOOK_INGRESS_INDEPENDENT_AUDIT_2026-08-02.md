# TEST YooKassa webhook ingress — independent audit — 2026-08-02

## Authority and candidate

- Oracle: `docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md` B0.3 — test-card payment from cart through capture, confirmed by webhook.
- Scope/operational authority: `AGENTS.md` §1/§1b/§9/§24, `docs/ARCHITECTURE/SERVER CONVENTIONS.md`, worker brief `docs/_TODO/runs/briefs/TEST_YOOKASSA_WEBHOOK_INGRESS_BRIEF.md`.
- Candidate under audit: `917e6c64a`.
- Audit type: one mixed pass — rendered-config inspection for nginx isolation and temporary fault injections for the repeatable checker. No apply, reload, deploy, or host configuration mutation.

## Blind kill-set (written before reading the checker)

The checker/self-test must reject each of these mutations to the generated-config source; a passing result for any is a missed kill.

1. Remove one documented YooKassa CIDR from the callback policy: rejection must identify the missing sender network.
2. Broaden the callback matcher from the three exact YooKassa URIs to `/api/payments/`: rejection must identify that adjacent payment paths or other provider IDs became public.
3. Replace `X-Real-IP $remote_addr` with `$http_x_real_ip`: rejection must identify that the client controls the address used by application verification.
4. Remove the common vhost `deny all`: rejection must identify that the remaining TEST vhost is publicly reachable.

The rendered-config inspection must additionally establish the positive contract: all three exact locations, all seven official networks, retained private/VPN entries and route-local `deny all`, TEST webapp upstream `127.0.0.1:6300`, required forwarded headers, unchanged integrator/maintenance routing, and the common private allowlist plus `deny all`.

## Results

### Verdict

**PASS — 4/4 blind faults killed; 0 missed.** Candidate `917e6c64a1af595f4a59c168ff4cbf5b6be18379` is an ancestor of audited HEAD `b833e6d567268b030a3a8719ae174bb305f757f5`.

The audit added the two missing named mutations to the existing checker self-test: client-controlled `X-Real-IP` and removal of the common vhost `deny all`. This is an acceptance self-test only, not a product fix. The other two named mutations were already covered. All four are ephemeral in-memory config substitutions; no tracked production source was faulted and no host configuration was changed.

### Rendered-config inspection

The config emitted from `render_config()` has exactly one callback location:

```nginx
location ~ ^/api/payments/(?:saas-webhook|webhook|patient-acquiring-webhook)/yookassa$
```

It lists all seven required YooKassa networks and no public wildcard. That location keeps the four TEST private/VPN/loopback entries, terminates with `deny all`, proxies only to `http://127.0.0.1:6300`, and sets `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Real-IP $remote_addr`, and `X-Forwarded-For $proxy_add_x_forwarded_for`.

The enclosing vhost retains its original four private entries and `deny all`. Its integrator location still proxies to `127.0.0.1:3300`; the internal maintenance location and `error_page 502 503 504 =200 /maintenance.html` are unchanged. The candidate diff contains only the callback location and this checker, so it does not alter application routes, DB/settings, or maintenance/integrator routing.

### Fault evidence

| Blind fault | Result |
| --- | --- |
| Remove one YooKassa CIDR | Killed |
| Broaden matcher to `/api/payments/` | Killed |
| Set `X-Real-IP` from `$http_x_real_ip` | Killed |
| Remove common vhost `deny all` | Killed |

`--self-test` output: `check-saas-a2-nginx-forwarded-host: self-test OK (4/4 faults rejected)`.

### Commands and results

```bash
node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --self-test
```

Passed: 4/4 temporary faults rejected.

```bash
bash -n deploy/host/apply-test-nginx-webapp.sh
bash deploy/host/apply-test-nginx-webapp.sh --dry-run
```

Passed. Dry-run checked the generated config and reported `dry-run OK`; it did not use `--apply`, reload nginx, deploy, or edit `/etc/nginx`.

```bash
node --check docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs
git diff --check
git diff --check 917e6c64a -- deploy/host/apply-test-nginx-webapp.sh docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs
```

Passed.

```bash
pnpm exec eslint docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs
```

Not runnable in this worktree: pnpm returned `Command "eslint" not found`, despite the lockfile declaring `eslint@9.39.4`; `node --check` above passed. No dependency installation was performed solely for linting this bounded Node script.

Rendered view was extracted from the script's quoted `render_config()` heredoc into a temporary file and checked with:

```bash
tmp_rendered="$(mktemp /tmp/bcb-test-yookassa-rendered.XXXXXX)"
trap 'rm -f "$tmp_rendered"' EXIT
awk '/^  cat >"\$output" <<'\''NGINX'\''$/{render=1; next} render && /^NGINX$/{exit} render{print}' \
  deploy/host/apply-test-nginx-webapp.sh > "$tmp_rendered"
node docs/_TODO/SAAS_FOUNDATION/scripts/check-saas-a2-nginx-forwarded-host.mjs --nginx-dump="$tmp_rendered"
```

Passed; the temporary file was removed by shell trap.

### Limits

This is repository/config-generation evidence only. It does not claim B0.3's required live TEST-card payment, provider callback, capture confirmation, or deployed `nginx -T` proof. Those require the separately authorized TEST execution and remain outside this audit. No application route, DB/migration/settings, environment file, `/etc/nginx`, DEV/TEST/PROD runtime, or deploy state was touched.
