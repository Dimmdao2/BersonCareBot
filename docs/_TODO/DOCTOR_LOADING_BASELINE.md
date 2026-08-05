# Doctor loading — TEST baseline (Stage 1)

Captured **2026-08-05** on DEV/TEST host `151.241.228.122` against live `https://test.bersoncare.ru` (curl → `127.0.0.1` + `Host`/`Origin`). Baseline for workstream `doctor-loading-performance`; compare after later slices against these numbers.

Related: fetch inventory [`DOCTOR_LOADING_FETCH_INVENTORY.md`](./DOCTOR_LOADING_FETCH_INVENTORY.md), plan `.cursor/plans/doctor-loading-performance_e024544d.plan.md`.

---

## 1. Nginx timing (TEST)

Applied idempotently via `bash deploy/host/apply-test-nginx-webapp.sh --apply` (2026-08-05T13:45:17Z).

| Item | Value |
|------|--------|
| Host | `151.241.228.122` (NOT PROD `135.106.162.170`) |
| Vhost | `/etc/nginx/sites-available/test.bersoncare.ru` |
| Log format name | `bersoncare_webapp_detailed` |
| Format file | `/etc/nginx/conf.d/bersoncare-webapp-access-log-format.conf` (from repo `deploy/nginx/bersoncare-webapp-access-log.example.conf`) |
| Access log path | `/var/log/nginx/bersoncare-test-webapp-access.log` |
| Fields added vs `main_safe` | `request_time=`, `upstream_response_time=` |
| Verify | `sudo nginx -t && sudo systemctl reload nginx`; log lines contain `request_time=` |

**Sample line (masked):**

```
127.0.0.1 - - [05/Aug/2026:16:47:03 +0300] "GET /app/doctor/patients HTTP/2.0" 200 716010 request_time=0.165 upstream_response_time=0.165 request_uri="/app/doctor/patients" args="[REDACTED]" "-" "curl/8.5.0"
```

Global `/var/log/nginx/access.log` (`main_safe`) unchanged — no `request_time` there.

---

## 2. Route timing baseline

**Auth:** `dimmdao@yandex.ru` (doctor) via `/opt/env/bersoncarebot/saas-smoke-login.env` + `POST /api/auth/email-password/login` with `Origin: https://test.bersoncare.ru`. Passwords were out of sync with DB; immediately before capture ran `SAAS_SMOKE_PASSWORD_CONVERGENCE_TEST_ONLY=1 node apps/webapp/scripts/converge-saas-smoke-login-passwords.mjs --packet=…` from `/opt/projects/bersoncarebot-test` (`changed=3`).

**Method:** 3 sequential GET samples per route; **primary metric:** nginx `upstream_response_time` p50/p95 (equals `request_time` here — no extra buffering). Cross-check: curl `time_starttransfer` (TTFB).

**Patient card sample:** `1c312a64-fab8-4b75-b24e-88a1d6ebe4e0` (first UUID in patients list HTML).

| Route | HTTP | nginx upstream p50 (s) | nginx upstream p95 (s) | curl TTFB p50 (s) |
|-------|------|------------------------|-------------------------|-------------------|
| `/app/doctor` | 200 | 0.386 | 0.388 | 0.388 |
| `/app/doctor/patients` | 200 | 0.165 | 0.169 | 0.118 |
| `/app/doctor/patients/{uuid}` | 200 | 0.151 | 0.195 | 0.151 |
| `/app/doctor/schedule` | 200 | 0.075 | 0.087 | 0.078 |
| `/app/doctor/communications` | 200 | 0.177 | 0.196 | 0.180 |
| `/app/doctor/treatment-program-templates` | 200 | 0.276 | 0.368 | 0.279 |
| `/app/doctor/lfk-templates` | 200 | 0.270 | 0.288 | 0.271 |
| `/app/doctor/recommendations` | 200 | 0.075 | 0.114 | 0.078 |
| `/app/doctor/content` | **404** | 0.074 | 0.083 | 0.077 |

**Heaviest SSR (p95 upstream):** treatment-program-templates (~0.37s), lfk-templates (~0.29s), home (~0.39s). Patient card p95 ~0.20s on this fixture.

Raw JSON (same numbers): captured to `/tmp/bcb-doctor-baseline.json` on host during Stage 1 run (not committed — secrets/session).

---

## 3. Background noise (not fixed in Stage 1)

Integrator cron on TEST emits ~every 5s:

- `POST /api/integrator/patient-reminders/materialize-wake` → **403**
- `POST /api/integrator/operator-health/digest-wake` → **500**

These hit the same nginx vhost (webapp proxy) and pollute `/var/log/nginx/bersoncare-test-webapp-access.log` tail (~44 lines in window during capture). Treat as measurement noise until ops slice §6 of plan.

---

## 4. First-load JS (bundle proxy)

**Local `pnpm --dir apps/webapp run build` on feat branch:** blocked at Stage 1 — `PatientCardClient.tsx` `next/dynamic` options must be object literals (build error on current tree). **Fallback:** sum uncompressed static chunk bytes referenced by TEST deploy manifests at `/opt/projects/bersoncarebot-test/apps/webapp/.next` (deployed TEST commit, not necessarily `286db9b91`).

| Route (client manifest) | Chunks | Uncompressed JS (bytes) | ~KB |
|-------------------------|--------|-------------------------|-----|
| `/app/doctor` | 22 | 1,024,420 | 1000 |
| `/app/doctor/patients` | 18 | 440,502 | 430 |
| `/app/doctor/patients/[userId]` | 22 | 1,018,664 | 995 |
| `/app/doctor/schedule` | 17 | 398,421 | 389 |
| `/app/doctor/communications` | 17 | 398,274 | 389 |
| `/app/doctor/treatment-program-templates` | 27 | 1,563,672 | 1527 |

`pnpm run analyze` not run (build gate above). Re-baseline bundle after green build + post-rollout deploy.

---

## 5. Stage 2 blockers / notes

1. **route-rollout** — catalog/schedule/home tab-aware server bootstrap not applied.
2. **db-profile** — no `EXPLAIN`/port profiling yet.
3. **test-rollout** — no soak, no p50/p95 comparison vs this doc, no full CI.
4. **Build** — fix `PatientCardClient` dynamic import literals before local bundle/analyze gate.
5. **TEST deploy lag** — timing captured on live TEST; feature branch may differ until redeploy.
6. **Cron noise** — materialize-wake/digest-wake errors skew log noise and background load.
