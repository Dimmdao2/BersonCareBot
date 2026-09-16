# Blind kill-set — #915 M6 native Push backend (auditor-live, 2026-09-09)

Persisted before reading any product code or test file for this surface. No pre-existing test file
covers `apps/webapp/db/schema/nativePushTargets.ts`, `apps/webapp/src/modules/web-push/nativePush.ts`,
`apps/webapp/src/infra/repos/pgNativePushTargets.ts`, `apps/webapp/src/app/api/{account,patient}/native-push/**`,
`apps/webapp/src/app/api/integrator/web-push/**`, or `apps/integrator/src/integrations/web-push/**` at the
candidate SHA `1814ee1da` — confirmed by `find`/`ls` before this file was written, so there is nothing to
contaminate against.

Authority read in full before this list: `AGENTS.md` global decision method, §1/§1b, §2–§5, §9–§12, §24;
`README.md`; `docs/ORCHESTRATION_BINDINGS.md`; `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md` M0–M7
(M6 in full); `docs/ARCHITECTURE/OWNER_PRODUCT_RULES.md` §2, §15, §18, §21–§25, §27, §28.

## Fault classes (independent — one fault-injection/inspection pass per class)

1. Self-scope bypass: client-spoofed user/surface, restricted staff session, installation already bound to
   another user, malformed app/provider/token, replay — must fail closed, no raw-token leak/storage.
2. M2M read/write for `(organization, user)` omits or loosens the active membership/enrollment filter, or
   returns/mutates targets outside the addressed **surface** (Therapy Go vs Therapysto), not just outside the
   org.
3. Rotation/idempotency: re-registration duplicates a target row instead of updating in place; revoke/logout/
   purge/offboarding fails to disable the correct (and only the correct) target.
4. Cipher: ciphertext decrypts under the wrong record/namespace (no AAD binding), old-key read or new-key
   write breaks, tamper is undetected, wrong/unknown key id is accepted.
5. Environment/gate ordering: native provider is reachable before the single pre-fork
   `assertOutboundMessagePolicy` / `applyPreForkEnvironmentDeliveryPolicy` gate, or a second local/TEST gate is
   introduced for RuStore.
6. Fan-out truthfulness: one transport configured and the other absent still yields `no_active_target`; a
   mixed success+failure is reported as total failure; a skipped leg (no config/no target) is counted as an
   attempted/failed provider call; **a notification produced for one app surface reaches a native target
   registered for the other app surface** (cross-surface content leak).
7. Global `web_push` toggle: disabled blocks both transports; missing VAPID blocks only browser; missing/
   redacted RuStore config blocks only native; absence of both is a typed skip, not a crash.
8. Native payload/route: uses the target's own app config/token; internal deep-link route is allowlisted and
   canonicalized; external/traversal/cross-surface routes are rejected before the provider call.
9. Payload/copy: only fact + date/time + in-app link for sensitive classes; no chat/task/clinical/file/
   presigned/cookie/token/org secret in the provider request or logs.
10. Provider error handling: a bare/generic 400 must never mass-deactivate; only an exact typed invalid-token
    identity deactivates that one target, idempotently; existing 404/410 web-push cleanup is untouched.
11. RuStore settings: restricted secret envelope, `authToken` redacted in admin API/audit, survives an
    unchanged/blank admin update; persisted channel stays `web_push`, UI label is one "Push".
12. Lifecycle registration: platform-user merge dedupes/repoints native targets without ownership loss; full
    purge removes them; migration-created objects run under only their declared capability (privilege
    declaration coverage), no direct runtime-role relation access outside it.

## Method (per §24.4 "test or look")

- Repeatable behavior (1, 2, 3, 5, 6, 7, 8, 10) → behavioral test through the real public seam
  (route/service/adapter), fault-injected once per class.
- One-time/state items (4's key-management wiring, 11's registry shape, 12's migration/merge/purge SQL, all
  privilege-declaration coverage) → diff read + static gate + rollback-only introspection, not a permanent
  test asserting source text.
