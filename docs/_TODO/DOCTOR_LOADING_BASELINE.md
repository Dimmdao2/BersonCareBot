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

## 3. Background noise (ops slice 2026-08-05)

Integrator scheduler on TEST (~5s poll) was hitting signed webapp wakes and polluting
`/var/log/nginx/bersoncare-test-webapp-access.log`.

| Wake | Symptom | Root cause | Fix (feat branch) |
|------|---------|------------|-------------------|
| `POST /api/integrator/patient-reminders/materialize-wake` | **403** `csrf_origin_forbidden` | Path missing from `INTEGRATOR_HMAC_CSRF_EXEMPT_PATHS` — integrator M2M POST classified as browser mutation | Added path to `csrfOrigin.ts` |
| `POST /api/integrator/operator-health/digest-wake` | **500** `internal_error` | `enterWithDbInfraPrincipal` on webapp request pool with `DB_PRINCIPAL_CONTEXT_MODE=locked` (TEST `webapp.test`) — infra principal fail-closed by design until cron sources allowlisted | `WEBAPP_LOCKED_INFRA_CRON_SOURCES` in `@bersoncare/db-principal`: allowlisted infra cron → staff pool + `SET ROLE app_staff` |

M2M signature and `INTEGRATOR_SHARED_SECRET` parity on TEST were already correct (`match=yes` on host). Scheduler retries digest wake every poll when `runFixedCadenceWake` throws because the bucket never completes.

**Post-deploy verify (loopback, secrets from `/opt/env/bersoncarebot/webapp.test`):**

```bash
# digest-wake — expect 200 {"ok":true,...} not 500
node -e '...signed POST to http://127.0.0.1:6300/api/integrator/operator-health/digest-wake...'

# materialize-wake — expect 200/400 (org payload), not 403 csrf
node -e '...signed POST to http://127.0.0.1:6300/api/integrator/patient-reminders/materialize-wake...'
```

Evidence tests: `packages/db-principal/test/webapp-locked-infra-cron.test.mjs`, `apps/webapp/src/middleware/csrfOrigin.test.ts`.

---

## 3a. Background noise (Stage 1 baseline — superseded by §3)

Integrator cron on TEST emitted ~every 5s (pre-fix):

- `POST /api/integrator/patient-reminders/materialize-wake` → **403**
- `POST /api/integrator/operator-health/digest-wake` → **500**

These hit the same nginx vhost (webapp proxy) and polluted `/var/log/nginx/bersoncare-test-webapp-access.log` tail (~44 lines in window during capture). Treat as measurement noise until ops slice §6 of plan.

---

## 4. First-load JS (bundle proxy)

**Local build gate:** `PatientCardClient.tsx` `next/dynamic` object-literal fix landed in `b2032b468`; `pnpm --dir apps/webapp typecheck` green on feat branch (2026-08-05 acceptance). Full `pnpm --dir apps/webapp run build` / `analyze` not run in this workstream gate — re-baseline after deploy.

**Stage 1 fallback (pre-fix):** sum uncompressed static chunk bytes from TEST deploy manifests at `/opt/projects/bersoncarebot-test/apps/webapp/.next` (deployed TEST commit may lag feat branch):

| Route (client manifest) | Chunks | Uncompressed JS (bytes) | ~KB |
|-------------------------|--------|-------------------------|-----|
| `/app/doctor` | 22 | 1,024,420 | 1000 |
| `/app/doctor/patients` | 18 | 440,502 | 430 |
| `/app/doctor/patients/[userId]` | 22 | 1,018,664 | 995 |
| `/app/doctor/schedule` | 17 | 398,421 | 389 |
| `/app/doctor/communications` | 17 | 398,274 | 389 |
| `/app/doctor/treatment-program-templates` | 27 | 1,563,672 | 1527 |

`pnpm run analyze` not run. Re-baseline bundle after green build + post-rollout TEST deploy.

---

## 5. Remaining gates (post-engineering)

1. **db-profile** — no `EXPLAIN`/port profiling yet.
2. **test-rollout** — no TEST soak, no p50/p95 comparison vs §2 after deploy, no full `pnpm run ci`.
3. **TEST deploy lag** — §2 timing is pre-rollout baseline; redeploy feat branch then re-capture upstream p50/p95.
4. **Cron noise** — fix in `f7db88013` on branch; verify 200 on TEST after deploy (see §3).
5. **Acceptance criteria** — plan §7 completion metrics (40% p95 reduction, bundle delta, zero unsolicited prefetch) not measured yet.
