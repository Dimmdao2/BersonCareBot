# Тест или взгляд

Повторяемые project-id projection, surface routing и queue-preservation контракты проверяй поведенческими тестами
через публичные ports/services/adapters. Migration owners, declaration/generated coverage, route boundaries и
отсутствие секретов проверяй чтением итогового diff и уже выполненными статическими/rollback-only gates; тесты на
текст исходника, SQL, число файлов или форматирование не пиши.

# Targeted auditor-live brief — #915 final native Push backend correction

Audit exact committed candidate `057ea56e2` against
`docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M6-01…M6-11 and applicable M7 security/validation clauses.
This is deliberately not a second blind audit of the already-tested composite fan-out. Reuse the retained original
kill-set, test and report in `.lead/runs/mobile-push-backend-audit-20260909/` and audit only the materially new/final
surface introduced after the fixer: the non-secret project-id seam, explicit video-invitation surface, legacy-route
resolver and exact production native port typing. Product code is read-only. You may commit only justified stable
acceptance tests and `.lead/runs/mobile-push-backend-final-audit-20260909/{00-targeted-killset.md,90-final-report.md}`.
Do not alter product code, plan/checklist, migration/declaration, existing auditor test, mobile shell, credentials,
DEV/TEST/PROD state, or provider/store accounts.

## Mandatory reading and order

1. Run `grep -n "^## \|^### " AGENTS.md`; read the global decision method, §1/§1b, §2–§5, §9–§12 and §24 fully,
   especially §10a/§10b before tests. Read README, server conventions, orchestration bindings, complete M6/M7 plan
   authority, original audit report/test, fixer brief and `92-lead-final-correction-evidence.md`.
2. Before reading existing tests, persist this targeted kill-set in `00-targeted-killset.md`. Then inspect exact
   diff `7574e664d..057ea56e2` plus the runtime path around every changed boundary. Findings require a reachable
   scenario, impact and violated M6/repo-rule line; no style or speculative hardening.
3. Reuse exact green evidence on `057ea56e2` from the lead record. Do not rerun full CI or the named-DEV preflight;
   instead confirm the recorded command addressed this exact production/migration SHA and run only missing targeted
   tests/checks. Never execute a migration or call a real provider.

## Targeted kill-set

1. Both authenticated fixed-surface GET routes obtain only their own public `projectId`; invalid app ids fail closed,
   missing config returns typed unavailable/null, and auth token, provider endpoint and full secret envelope never
   cross the module/route response. Patient role reaches the value only via the declared exact named root.
2. The named root accepts only `therapygo|therapysto`, reads only the two matching global admin settings and returns
   only `{value,projectId}`. Its owner, EXECUTE role, body columns, port-context declaration and generated DEV/TEST
   artifacts are exact; there is no migration-time grant/policy or direct broad patient settings read.
3. Explicit valid `pushSurface` always wins. A present invalid value fails closed and cannot fall back. Legacy fallback
   accepts only canonical relative `/app/patient...` for Therapy Go and `/app/doctor|settings|account...` for
   Therapysto; absolute URLs, protocol-relative URLs, userinfo, admin, cross-surface, malformed and traversal-shaped
   routes do not invoke the native provider.
4. Video meeting invitations that select logical `web_push` carry `pushSurface:'therapygo'` through the exact typed
   producer content and the durable queue JSON without introducing another queue/channel/dispatch path. Existing
   Telegram/email behavior and dedup result semantics remain unchanged.
5. Production `createWebPushAccessPort` exposes exact closed `NativePushAppId`/provider/target contracts. Legacy
   browser-only test fakes remain source-compatible, but arbitrary app/provider strings cannot reach provider dispatch
   because the production adapter/runtime revalidates the closed values.
6. The original retained composite fan-out oracle remains green and all prior MUST FIX items stay closed: AAD,
   relation-specific target read/deactivation, thin route composition, 409 ownership conflict, privilege coverage,
   mixed outcome and exact invalid-token behavior.

## Fault injection and checks

For every new repeatable class, either retain a green behavioral test and show one temporary fault makes its exact
assertion red, or report a failing acceptance test on untouched candidate. Minimum faults: return the auth token/full
envelope from project-id lookup; map an invalid explicit surface through legacy fallback; accept an absolute/admin
route; remove the video producer surface; pass arbitrary app/provider strings through production dispatch. Restore
all temporary mutations. Do not duplicate existing tests if the public contract is already caught.

Run the retained integrator oracle, the smallest relevant webapp route/service/queue/video tests, both changed-app
typechecks, scoped lint for changed production paths, migration/privilege generated checks only if needed to confirm
inspection, `git diff --check`, clean status and secret-leak scan. No full root CI. If KVM/provider/physical-device
work is mentioned, record it only as an external later M7 gate, not a backend finding.

## Delivery

Return binary PASS/MUST FIX with candidate SHA, targeted kill tally, each fault→red assertion, exact commands/results,
inspection of the four-point rights record, files changed by the audit and residual external gates. Commit only the
allowed tests/artifacts with explicit paths, never `git add -A`; do not push. Finish all foreground commands before
ending the one-shot run.
