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

1. ~~**db-profile**~~ — `[x]` closed evidence-only (DL-DB-01/02, 2026-08-05): route→port trace ([Trace route DB work](fe8f0801-3186-41e6-9003-7c0eb745532e)); `EXPLAIN` не снимали. FCP на 4G (~3.4–3.7s при TTFB 82–209ms) — client JS, не SSR/DB (nginx p95 0.10–0.37s §7). Отдельная DB-оптимизация без owner-go не делалась.
2. ~~**test-rollout**~~ — `[x]` closed owner Safari (DL-RUNTIME-03, 2026-08-05): владелец прошёлся по кабинету в Safari на TEST (`a71e222b3`); переходы между страницами показались медленными, но owner: «сейчас всё тупит» — субъективная оценка затруднена. Автоматический curl/Chromium soak — §9.
3. ~~**TEST deploy lag**~~ — closed by §6 post-rollout capture on `33f9b2b82`; final EXEC_SHA `bb4752368` on TEST repo.
4. ~~**Cron noise**~~ — `[x]` post-deploy: scheduler `digest-wake` **200**, `materialize-wake` **200/400** (no 403/500); loopback signed verify 2026-08-05T20:16Z on `bb4752368`.
5. ~~**Acceptance criteria**~~ — measured on EXEC_SHA §7; binary gates: unsolicited patient detail **0** PASS; schedule warm reload **0** duplicate `/api/doctor/schedule*` PASS; p95 −40% **partial** (communications, treatment-program-templates, recommendations PASS; home, schedule, lfk-templates, patient-card FAIL vs §2); patient-card bundle −30% **FAIL** (manifest sum unchanged vs §4).

---

## 6. Post-rollout re-measure (TEST `33f9b2b82`, 2026-08-05)

**Deploy:** `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild` from dev repo (`151.241.228.122`). TEST deploy SHA `33f9b2b82` (includes deploy grant fix on top of CI-green `101ad229b`). **Push:** `origin/feat/doctor-ui-rebuild` only (`101ad229b` then `33f9b2b82`); `dimmdao` not used — TEST uses git-bundle per `SERVER CONVENTIONS.md`.

**CI evidence:** local `pnpm run ci` green in 492s on `101ad229b` before push (`/tmp/bcb-full-ci-20260805-pass2.log`).

**Wake verify (post-restart):**

| Endpoint | Loopback signed POST (:6300) | Scheduler nginx since ~18:56 MSK |
|----------|------------------------------|----------------------------------|
| `digest-wake` | **200** `{"ok":true,"sent":false,"reason":"not_slot"}` | **200** (0×500) |
| `materialize-wake` | **400** `invalid payload` (not 403) | **400** (0×403) |

**Auth / method:** same as §2 (`dimmdao@yandex.ru` + `saas-smoke-login.env`); patient card `e9621f63-75f7-4849-8fef-ba627041d78a`.

**Method:** 3 sequential GET samples per route; nginx `upstream_response_time` p50/p95 from `/var/log/nginx/bersoncare-test-webapp-access.log` window `19:01` MSK.

| Route | HTTP | §2 p50 → post p50 | §2 p95 → post p95 | Δ p95 |
|-------|------|-------------------|-------------------|-------|
| `/app/doctor` | 200 | 0.386 → 0.350 | 0.388 → 0.381 | −2% |
| `/app/doctor/patients` | 200 | 0.165 → 0.166 | 0.169 → 0.167 | −1% |
| `/app/doctor/patients/{uuid}` | 200 | 0.151 → 0.062 | 0.195 → 0.068 | **−65%** |
| `/app/doctor/schedule` | 200 | 0.075 → 0.094 | 0.087 → 0.112 | +29% |
| `/app/doctor/communications` | 200 | 0.177 → 0.060 | 0.196 → 0.063 | **−68%** |
| `/app/doctor/treatment-program-templates` | 200 | 0.276 → 0.072 | 0.368 → 0.158 | **−57%** |
| `/app/doctor/lfk-templates` | 200 | 0.270 → 0.338 | 0.288 → 0.341 | +18% |
| `/app/doctor/recommendations` | 200 | 0.075 → 0.065 | 0.114 → 0.086 | −25% |
| `/app/doctor/content` | **200** (was 404) | 0.074 → 0.063 | 0.083 → 0.067 | n/a |

Raw JSON: `/tmp/bcb-doctor-postdeploy-parsed.json` on host (not committed).

**Deploy incident (first attempt `101ad229b`):** `c5a-platform-operations-runtime.sql` 0376 grant assertion failed — `saas_paid_period_policy` still on `app_staff` after P0.5b regen. Fixed in `33f9b2b82` (drop from P0.5b staff surface + `REVOKE` in c5a). Services were down between failed and successful deploy (~18:38–18:56 MSK).

---

## 7. Closure EXEC_SHA re-measure (`bb4752368`, 2026-08-05)

**EXEC_SHA:** `bb475236898` at `/opt/projects/bersoncarebot-test` (matches `origin/feat/doctor-ui-rebuild` `bb4752368`). `/api/health` → `{ok:true,db:"up"}`; `/api/version` exposes `buildId` only (use deploy repo SHA for version proof).

**CI / Security (EXEC_SHA):** local `pnpm run ci` exit 0 in 491s (`/tmp/bcb-full-ci-3-20260805-193017.log`); GitHub Security on `bb4752368` green (Gitleaks, Semgrep, Trivy, dependency audit). Local Gitleaks: `no leaks found` with `.gitleaksignore`.

**Wake verify (loopback :6300, 2026-08-05 ~20:16 MSK):**

| Endpoint | Status | Notes |
|----------|--------|-------|
| `digest-wake` | **200** | `{"ok":true,"sent":false,"reason":"not_slot"}` |
| `materialize-wake` | **200** | valid org `d0000000-0000-4000-8000-00000000000d`; not 403 |
| nginx tail | **PASS** | no `digest-wake`/`materialize-wake` **403/500** since deploy |

**Auth / method:** same as §2 (`dimmdao@yandex.ru` + `saas-smoke-login.env`). **Patient card fixture:** `1c312a64-fab8-4b75-b24e-88a1d6ebe4e0` (first UUID in patients HTML — same as §2).

**Timing method:** 1 cold + **30 warm** authenticated GET per route; nginx `upstream_response_time` p50/p95 via nearest-rank on log window starting ~20:21 MSK (`/var/log/nginx/bersoncare-test-webapp-access.log`). Raw JSON: `/tmp/bcb-doctor-exec-sha.json` on host (not committed).

| Route | n | p50 (s) | p95 (s) | §2 p95 | Δ p95 | −40% gate |
|-------|---|---------|---------|--------|-------|-----------|
| `/app/doctor` | 31 | 0.301 | 0.365 | 0.388 | −6% | **FAIL** |
| `/app/doctor/patients` | 33 | 0.164 | 0.197 | 0.169 | +17% | n/a (prefetch gate) |
| `/app/doctor/patients/{uuid}` | 31 | 0.144 | 0.178 | 0.195 | −9% | **FAIL** |
| `/app/doctor/schedule` | 31 | 0.088 | 0.100 | 0.087 | +15% | **FAIL** |
| `/app/doctor/communications` | 31 | 0.053 | 0.067 | 0.196 | −66% | **PASS** |
| `/app/doctor/treatment-program-templates` | 31 | 0.059 | 0.072 | 0.368 | −80% | **PASS** |
| `/app/doctor/lfk-templates` | 31 | 0.283 | 0.332 | 0.288 | +15% | **FAIL** |
| `/app/doctor/recommendations` | 43 | 0.059 | 0.067 | 0.114 | −41% | **PASS** |
| `/app/doctor/content` | 62 | 0.052 | 0.063 | n/a | n/a | n/a |

**Request inventory (curl, EXEC_SHA):**

| Check | Result |
|-------|--------|
| `/app/doctor/patients` unsolicited patient-detail document | **0** |
| `/app/doctor/schedule?tab=cal` warm reload → `/api/doctor/schedule*` | **0** (SSR seed; no duplicate bootstrap fetch) |
| Runtime pages (doctor, patients, schedule, communications, patient-card) | all **200** |

**Bundle proxy (deployed `.next` client-reference-manifest.js, uncompressed static chunk sum):**

| Route | Chunks | Bytes | §4 bytes | Δ |
|-------|--------|-------|----------|---|
| patient-card | 22 | 1,022,728 | 1,018,664 | +0.4% |
| home | 22 | 1,355,717 | 1,024,420 | +32% (shared chunk accounting) |
| patients | 18 | 757,682 | 440,502 | +72% (shared chunk accounting) |

Patient-card **−30% bundle gate FAIL** (manifest method unchanged vs §4; no `pnpm run analyze`). Communications/schedule list manifests differ from §4 method — compare like-for-like only within same manifest parser.

**db-profile:** `[x]` closed evidence-only (DL-DB-02, 2026-08-05) — `EXPLAIN` не снимали. Маршруты выше −40% gate (home, schedule, lfk, patient-card) остаются в диапазоне ~0.10–0.37 s SSR; closure/audit срез чинил баги и дубли запросов, не DB. Отдельная оптимизация БД без owner-go не делалась.

**Safari / test-rollout:** `[x]` owner Safari soak (DL-RUNTIME-03, 2026-08-05) — владелец проверил в Safari на TEST; переходы между страницами «тупят», но общая медлительность системы затрудняет оценку. Chromium/curl — §9.

---

## 8. Post-audit remediation (`a71e222b3`, 2026-08-05)

**EXEC_SHA (final executable):** `a71e222b3` — `fix(doctor-loading): audit remediation — schedule load-key, messages poll, deep-link`.

**CI / Security:** exit 0 `/tmp/bcb-full-ci-audit-fixes-20260805-213033.log`; Security workflow `31036275429` success.

**TEST deploy:** exit 0 `/tmp/bcb-deploy-test-a71e222b3.log`; `/opt/projects/bersoncarebot-test` HEAD `a71e222b3c5`; health **200**.

**Code fixes (vs audit `bf710216`):**

| Area | Evidence |
|------|----------|
| Schedule StrictMode / duplicate bootstrap | `ssrLoadKeyRef` + `scheduleCalendarLoadKey`; UI test under `<StrictMode>` |
| Patient deep-link `?tab=` | `initialTab={activeTab}`; `tabPromise` before `await shellMeta` |
| Messages continuation | `messagesSnapshot.route.test.ts`; generation guards on null SSR seed |
| Identity oracle | `messengerPhoneLink.identity.test.ts` bindings + `integrator_user_id` mock |

**Metrics:** timing/bundle gates — §7 (`bb4752368` n=30); не переснимали на `a71e222b3` (runtime-only delta).

---

## 9. Final runtime acceptance (`a71e222b3`, TEST, 2026-08-05 ~22:11 MSK)

**Method:** curl loopback → `127.0.0.1` + `Host: test.bersoncare.ru`; auth via `saas-smoke-login.env`. Raw JSON: `/tmp/bcb-runtime-soak-a71e222b3.json`.

**Wake (loopback :6300):** `digest-wake` **200** `not_slot`.

| Role | Pages (doctor, patients, schedule, communications, patient-card) | Prefetch detail | Schedule API dup on warm reload |
|------|------------------------------------------------------------------|-----------------|--------------------------------|
| doctor (`dimmdao@yandex.ru`) | all **200** | **0** | **0** |
| global_admin (smoke login, `-L`) | all **200** | **0** | **0** |

**DL-STREAM-05 (patient card `1c312a64-…`):** в первых 50 KB HTML есть tab/shell сигналы, **нет** clinical/appointments payload → shell раньше тяжёлого tab body (heuristic PASS).

**DL-RUNTIME-01:** doctor + global_admin document paths **200**; entitlement matrix 1/10/100+ clients и cold/warm RSC navigation **не** прогонялись; Chromium headless на TEST не использовали (curl/nginx).

**DL-RUNTIME-03 Safari:** `[x]` owner real Safari 2026-08-05 — qualified (см. §11).

**Closure status:** engineering + audit remediation **done** on `a71e222b3`; Safari gate closed owner-qualified; product gates −40% p95 / −30% bundle (§7) и bundle lazy-load (§10) — открыты по смыслу перф, не по багам деплоя.

---

## 10. FCP vs DB route trace (`a71e222b3`, 2026-08-05)

**Advisory:** [Trace route DB work](fe8f0801-3186-41e6-9003-7c0eb745532e) + [Trace first-load bundles](ef3a13eb-7457-428f-b7cb-40d4d8c6c427) (read-only, no code edits).

**Verdict:** DB profiling **не** является основным рычагом для «долго при первом открытии». TTFB 82–209ms vs FCP ~3.4–3.7s на типичном 4G → узкое место **transfer/parse/hydrate JS** (home 459KB, schedule 509KB, patient-card 378KB, lfk 401KB gzip на TEST).

| Route | SSR p95 (§7) | DB surface (port trace) | FCP lever |
|-------|--------------|-------------------------|-----------|
| `/app/doctor` | 0.365s | `loadDoctorTodayDashboard` N+1 в `loadPeopleRealtimeStats` / exercise attention | FullCalendar на home (`DoctorTodayMiniCalendar`) |
| `/app/doctor/schedule` | 0.100s | `loadDoctorScheduleCalendarBootstrap` только при `tab=cal` | FullCalendar в default tab chunk |
| `/app/doctor/patients/{uuid}` | 0.178s | 13× `allSettled` tab bootstrap | default overview chunk + static chat import chain |
| `/app/doctor/lfk-templates` | 0.332s | `pgLfkTemplates.list` + `pgLfkExercises.list` | always-mounted `TemplateEditor` + `@dnd-kit` |

**DL-DB-01/02:** port trace **done**; `EXPLAIN (ANALYZE, BUFFERS)` **не** запускали — SSR bounded, FCP gap не DB. Опциональный EXPLAIN только при owner-go и цели p95 gate (`home`, `lfk-templates`), через `runWithDbOrganizationPrincipal`, не голый `psql`.

**Chromium headless (local profile, TEST cookies, no 4G throttle):** raw `/tmp/doctor-runtime-a71e222b3.json` — cold FCP 180–304ms, idle 1.1–1.6s; patient tab switch → duplicate `GET …/payments` (×2). Stream heuristic: shell/tabs before heavy overview media; `?tab=records` deep-link — no overview APIs.

**Next product slice (FCP, не DB):** advisory [Trace first-load bundles](ef3a13eb-7457-428f-b7cb-40d4d8c6c427) — gzip cold JS доминирует FCP на 4G; TTFB не узкое место.

| P0 | Маршрут | Файлы | Est. −gzip | Статус |
|----|---------|-------|------------|--------|
| 1 | lfk-templates | `LfkTemplatesPageClient.tsx` — не монтировать `TemplateEditor` до create/select | ~80–120KB | open |
| 2 | patient-card (+ home/schedule panel) | `DoctorOpenChatButton.tsx` — `next/dynamic` chat chunk | ~40–70KB | **code** `DoctorOpenChatButton.tsx` |
| 3 | home | `DoctorTodayMiniCalendar.tsx` — убрать/отложить FullCalendar с first paint | ~100–180KB | open |
| 3b | home (мин.) | `TodayMiniCalendarWithModal.tsx` — dynamic только `DoctorCalendarEventPanel` | ~30–50KB | open |
| 4–5 | schedule | `ScheduleCalendarTab.tsx` — dynamic event panel / FC grid | med | open |

**Bundle gate:** patient-card −30% **FAIL** (manifest +0.4% §7); `patient-card-progressive` todo = streaming code only, **не** bundle acceptance.

**Проверка после slice:** compressed JS / manifest на TEST, не только nginx p95.

---

## 11. Owner Safari soak (2026-08-05)

**Owner (чат 2026-08-05):** «я проверял в сафари — можешь пока отметить что пройдено. при переходе по страницам еще тупит, но надо признать что у меня сейчас все тупит так что сложно оценивать».

**Закрывает:** closure DL-RUNTIME-03, performance `test-rollout`, closure `test-runtime` frontmatter todo.

**Qualified PASS:** функциональный soak на реальном Safari hardware; явных регрессий/блокеров closure не названо. Переходы между страницами owner воспринимает как медленные, но с пометкой что общая тормозность окружения делает субъективную оценку скорости неоднозначной — не считается FAIL product gate и не требует отката deploy.
