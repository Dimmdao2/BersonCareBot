# Тест или взгляд

Повторяемые access, lifecycle, encryption и composite-delivery контракты проверяй поведенческими тестами через
публичные module/route/adapter seams. Состав migration, grants, wiring, отсутствие секретов и итоговое состояние
проверяй чтением diff, генераторами привилегий и rollback-only introspection; тесты на строки исходника/SQL не пиши.

# Auditor-live brief — #915 native/composite Push backend

Independently audit the exact committed M6 server candidate. Product code is read-only. You may add and commit only
stable behavioral acceptance tests plus audit artifacts. Never fix product code, alter the plan/checklist, apply a
migration, send a real notification, read/print secrets, or touch `apps/mobile-shell/**`, TEST/PROD/store accounts.

## Mandatory reading and blind order

1. Run `grep -n "^## \|^### " AGENTS.md`, then read the global decision method, §1/§1b, §2–§5, §9–§12 and
   §24 completely. In particular read §10a and §10b before opening any test. Read `README.md`,
   `docs/ORCHESTRATION_BINDINGS.md`, the complete M6/M7 authority in
   `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, and `OWNER_PRODUCT_RULES.md` §2, §15, §18,
   §21–§25, §27, §28.
2. Before reading existing/candidate tests, persist the kill-set below to
   `.lead/runs/mobile-push-backend-audit-20260909/00-blind-killset.md`. Tests never define their own oracle.
3. Inspect the exact base→candidate product diff, runtime wiring and migration/declaration result. Classify every
   check as repeatable behavior or one-time state before choosing test vs inspection.

## Blind behavioral kill-set

1. A logged-in user can register/rotate/revoke/status only their own installation; a client-spoofed user/surface,
   restricted staff session, installation already bound to another user, malformed app/provider/token or replay
   fails closed without leaking/storing raw material.
2. Rotation is idempotent and changes encrypted/token-hash state without duplicate targets; revoke/logout/account
   purge disable the correct target; organization offboarding does not delete a globally owned installation while
   M2M reads for the former organization stop returning it.
3. Integrator read for `(organization,user,surface)` returns Therapy Go only with active patient enrollment and
   Therapysto only with active staff membership. Cross-org, cross-surface, inactive/revoked and nonexistent targets
   are invisible; a route cannot bypass the DB capability root.
4. Ciphertext round-trips only with the dedicated keyring/AAD, includes key id, supports old-key read/new-key write,
   rejects tamper/wrong namespace/unknown key, and never uses staff-security/system-settings/app-bundle material.
5. The logical channel remains exactly `web_push`; the existing message-policy, platform availability and the
   single pre-fork environment policy run before either provider. Local DEV calls neither provider; TEST suppresses
   a non-test original recipient for both and never redirects.
6. Browser-only availability still sends Web Push; native-only availability still sends Universal Push; both fan
   out; neither yields typed `no_active_target`. One success plus one failure is logical success with truthful
   per-transport outcome; all attempted legs failing is failure; skipped legs are not provider attempts.
7. Disabled global `web_push` blocks both. Missing VAPID does not block configured native; absent/redacted RuStore
   config does not block browser. Neither config nor target absence crashes startup.
8. Universal Push request uses the target's app-specific config/tokens and data-only safe payload. Surface is typed,
   internal route is allowlisted/canonicalized, and scheme/host/userinfo/protocol-relative/encoded traversal or
   cross-surface paths are rejected before provider invocation.
9. Payload/copy contains only the authorized fact/date/time/cabinet link for sensitive message/task classes; raw
   chat/task/clinical/file/presigned/cookie/token/organization secret cannot reach provider request or logs.
10. Provider timeouts/status/errors become bounded non-secret outcomes. Generic Universal Push 400 never mass-
    deactivates tokens; only an exact typed invalid-token identity deactivates that target idempotently. Existing
    browser 404/410 dead-subscription cleanup remains unchanged.
11. Both RuStore settings are global restricted secret envelopes; authToken redacts in API/audit and survives an
    unchanged redacted/blank admin update. Persisted platform switch remains `web_push`, visible label is one “Push”,
    and no native provider channel/preference appears.
12. Platform-user merge deterministically deduplicates/repoints native targets without ownership loss; full purge
    removes them through the declared lifecycle. Migration-created roots execute with only declared capabilities;
    direct runtime-role relation access is absent.

## Permanent tests and fault injection

Use the cheapest public layer for each silent/expensive behavior. Prefer module unit/property tests for validators,
route tests through real handler wiring for self auth/surface fixation, service tests for idempotency/cipher port,
integrator contract tests for composite outcomes and pre-provider suppression, and named-DEV PostgreSQL integration
only where the DB capability/RLS result cannot be proven cheaper. Do not add source-text, SQL-text, file/count, UI
copy/layout or mock-called-only tests. Reuse existing builders and production schemas.

Temporarily inject and restore at least these independent faults; record exact red assertion for each:

- accept client surface/arbitrary user or rebind another user's installation;
- omit org membership/enrollment or active filter in M2M read;
- bypass/tamper cipher AAD or write with old key;
- fork/provider-call before local/TEST/platform gate;
- make missing one transport suppress its configured sibling;
- mark mixed success/failure as total failure or skipped as attempt;
- pass an external/traversal route or sensitive body into native payload;
- treat generic provider 400 as every-token invalid;
- expose/erase the redacted auth token on admin update;
- drop native targets during merge or leave them after full purge.

Every named fault must be killed by a retained green test or represented by a failing acceptance test on the
untouched candidate. Restore all product mutations before commit. Do not invent findings outside M6/repo rules.

## One-time migration, privilege and integration inspection

For every migration, write a permission analysis naming objects/functions, statement owners, runtime roles,
required relation/column operations and declaration coverage. Verify timestamp naming, owner markers, verification
probe, indexes/uniqueness, empty legacy journal, no GRANT/REVOKE/POLICY/role statements, relation/lifecycle/merge
registration and no new raw SQL outside sanctioned capability roots.

Run all migration/declaration static gates and an owner-aware rollback-only candidate preflight against the named DEV
database from the exact audit checkout, using the canonical checkout only as runtime env root. Never run `--execute`
and never create a database. Validate actual function ownership/EXECUTE/relation wall inside the rollback-only path,
not by testing SQL text. Do not call a provider; use injected local transports for runtime tests.

Run changed-app typecheck/lint/build, settings-accessor/DB-chokepoint/outbound-policy gates, targeted retained tests,
`git diff --check`, clean tree and secret/raw-token/provider-env scans. Full root CI remains the lead's final
integration gate.

## Delivery

Commit only justified acceptance tests and
`.lead/runs/mobile-push-backend-audit-20260909/{00-blind-killset.md,90-final-audit-report.md}` with explicit paths,
never `git add -A`; do not push. The final report is binary PASS/MUST FIX and maps every finding to a reachable
scenario, impact and exact M6/repo-rule line. Include kill tally, fault→failed assertion, exact commands/SHA,
migration privilege analysis and remaining external/native-only gates. Do not finish while a foreground command or
rollback-only preflight is running.
