# DEV port-context latency audit — 2026-08-16

## Scope and evidence

Read-only bounded audit. No product code/data, server lifecycle, browser navigation, DB query, or TEST/PROD action was performed. Loopback server time is not attributed to VPN.

Evidence commands:

```bash
rg -n -C 3 '/app/(doctor|patient)|application-code|timezone|web-push|analytics|Turbopack|filesystem|slow' /home/dev/brain/host-orch/main-dev-5200.log | tail -n 500
rg -n -C 2 "Slow filesystem|benchmark took|GET /app/doctor 200|GET /app/patient 200" /home/dev/brain/host-orch/main-dev-5200.log
nl -ba apps/webapp/src/infra/db/webappPoolProvider.ts | sed -n '327,520p'
nl -ba apps/webapp/src/infra/db/withClient.ts | sed -n '24,63p'
nl -ba apps/webapp/src/app/app/doctor/loadDoctorTodayDashboard.ts | sed -n '361,511p'
nl -ba apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx | sed -n '157,427p'
```

Captured route window: `/app/doctor` 12.3 s (77 ms Next, 4 ms proxy, 12.2 s application), repeated `/app/doctor` 3.2 s (203 ms Next, 12 ms proxy, 3.0 s application), `/app/patient` 11.4 s (223 ms Next, 20 ms proxy, 11.1 s application). Alongside patient navigation: timezone 7.2 s (7.0 s application), web-push 7.4 s (7.3 s application), four analytics posts 7.0–7.3 s (~7.0 s application). This is server time.

Turbopack reports a 359 ms slow-filesystem benchmark (log 6002) and one cold patient request has 5.4 s Next time (line 3331). Both are real DEV contributors, but cannot explain the 3.0–12.2 s warm application spans.

## Confirmed mechanics

`webappPoolProvider.ts:345-351` creates hard-coded physical pools: staff=3, patient=2, global-admin=1. Its query path checks out a client, resolves the port principal, then calls `withPortContextTransaction` (`:438-480`). The direct-client path repeats this in `withClient.ts:39-63`. Per independent operation the required lifecycle is `BEGIN → install context → SET LOCAL ROLE → query → clear → COMMIT`; context ends at commit. DB privilege scheme §2.3 makes this an RLS/mTLS security requirement.

Pool selection is by principal (`webappPoolProvider.ts:425-435`); merging pools or reusing a context across roles is unsafe. No supplied log evidence shows nested transaction, deadlock, serialization retry, or lock wait: these are not causes currently established.

`git log --oneline --all -S 'max: 3' -- apps/webapp/src/infra/db/webappPoolProvider.ts` identifies introduction in `8ba36e2e1` (2026-08-11); `git blame -L 345,352 -- ...` shows staff/patient from that change and global-admin `72e82121bc`. Neither its source comments nor `DB_PRIVILEGE_LAYER_REBUILD/SCHEME.md` declares numeric maximums as a brute-force/race security invariant. This proves only that 3/2/1 are embedded with the security rollout, not that they are incidental. Do not raise them: no admission/rate-limit/race evidence supports doing so.

## Operations and independent fan-out

Counts are source-level independent port calls, not SQL statement counts: a port may issue multiple statements and the log has no query tracing.

| Reachable route path | Operations / fan-out | Evidence |
| --- | --- | --- |
| Doctor layout shell | 3-way wave, 7-way wave, then billing: 11 plus workspace guard | `loadDoctorWorkspaceShell.ts:54-93` |
| Doctor Today preflight | 5-way wave | `doctor/page.tsx:111-120` |
| Today data and working bounds | dashboard 4-way plus 2 working-bounds calls | `loadDoctorTodayDashboard.ts:372-402`, `doctor/page.tsx:137-160` |
| Today second wave | tasks 1 + pending tests 2 + comment loader | `loadDoctorTodayDashboard.ts:438-461` |
| Today per shown patient | 1 unread + up to 3 program calls each; 10 preview patients = up to 40 concurrent calls | `loadDoctorTodayDashboard.ts:276-336` |
| Exercise comments | 3 per on-support patient, then 2 per attention item; no source limit before display truncation | `loadDoctorExerciseCommentAttention.ts:128-195` |

Doctor has a fixed skeleton of at least 25 calls before guards and data-dependent branches, then grows by up to four per preview patient plus comment branches. The fan-out beyond the 3-client staff pool is confirmed code shape; its actual wait duration is unconfirmed because `waitingCount`/checkout time are not logged.

Patient RSC serially performs materialization eligibility and timezone (`PatientHomeToday.tsx:192-195`), then 3-way settings/blocks (`:197-201`), config (`:225-229`), 5-way resolvers (`:244-272`), progress work, a 6-way personal-data wave (`:302-320`), mood history (`:341-345`), optional 3-way plan work (`:356-366`), duplicate timezone lookup (`:375`), and unread count (`:426-427`). For an eligible full-home patient, before per-item CMS resolution this is at least 25 independent service/DB operations; it has a confirmed 6-way SSR wave against a 2-client patient pool. CMS resolvers and configured items add data-dependent calls.

Patient layout resolves organization context at `patient/layout.tsx:85-117` and page resolves it again at `patient/page.tsx:38-47`. It is a duplicate-work candidate, not confirmed duplicate SQL without tracing. The captured entry also fires six independent browser APIs (timezone, web-push, four analytics) beside SSR. Their near-equal 7.0–7.4 s application times are consistent with shared patient-pool admission queueing.

## Diagnosis

| Candidate | Status | Reachable impact and discriminating experiment |
| --- | --- | --- |
| Cold compilation / filesystem | Confirmed contributor, not primary warm cause | 359 ms filesystem warning and a 5.4 s cold Next span exist; repeated doctor remains 3.0 s application. Do 10 warm-ups then 30 no-edit samples, split Next/application time. |
| Per-query port-context lifecycle | Confirmed multiplicative cost | Every independent operation starts/clears a transaction context. Add checkout/install/query/clear timers and compare after reducing operation count. |
| Pool queueing | High-confidence hypothesis, not confirmed | Patient has 6-way SSR + 6 entry APIs vs max 2; doctor can issue 40+ vs max 3. Log pool `waitingCount` and checkout wait; lost seconds must appear there. |
| N+1/unbounded fan-out | Confirmed latency shape | Doctor per-patient/per-item `Promise.all` is reachable. Benchmark 0/1/10 on-support patients and multiple attention items; operation growth establishes impact. |
| Duplicated requests | Confirmed client fan-out; DB duplication hypothesis | Six client requests coexist with SSR; page/layout repeat organization resolution. Correlate route and resolver DB calls. |
| Deadlock / serialization | Not evidenced | Collect DEV-only outcome/retry and PG wait metrics; nonzero lock/serialization evidence is required before blaming it. |

## Minimum safe change sequence

1. Defer non-render-critical patient entry work (analytics and web-push status) until first interactive render, preserving retry/idempotency. This reduces SSR competition without changing RLS, mTLS, roles, or auth rate limits.
2. Request-cache timezone/organization resolution only within the identical patient principal/scope; pass existing request-local organization context from layout to page. Verify it cannot cross users or organizations.
3. Replace Doctor Today per-patient/per-item reads with bounded, set-based authorized port methods returning the same projection. A temporary concurrency cap at existing pool capacity is safe containment; prefer a declared batch relation/root, never generic role-spanning transaction reuse.
4. Add DEV-only redacted route correlation timing: pool `{total,idle,waiting}`, checkout wait, principal resolution, context install/clear, query/transaction duration, and logical-operation count. No SQL, credentials, capability IDs, or user IDs in logs.

Do not merge pools, skip install/clear, reuse context across capabilities, or raise 1/2/3 merely to mask queueing.

## Reproducible before/after benchmark

Use fixed seeded doctor/patient accounts and data cardinality; new correlation id each navigation. Exclude redirect/manifest/media/background requests from the route metric and report their entry burst separately.

1. **Warmed Turbopack DEV:** normal approved server procedure; no edits; 10 warm-ups, then 30 sequential route samples and 10 representative entry bursts.
2. **Production-build TEST:** approved TEST deployment only; same commit/accounts/dataset; 10 warm-ups then identical 30+10 samples.
3. For each route and burst report p50/p95/max for server total, `application-code`, checkout wait, context install/clear, query duration and operation count. Also record `next.js`/proxy attribution, pool wait counter, process CPU/RSS, and approved PostgreSQL wait/connection observations.
4. Accept causality only if its own counter changes: build work lowers Next time; operation reduction lowers transaction count; deferral lowers checkout wait. Hold route, account, data, request order and sample size fixed.

This separates build/filesystem, pool, context and DB effects without weakening the declared security model.
