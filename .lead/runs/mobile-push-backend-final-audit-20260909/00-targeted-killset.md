# Targeted kill-set — #915 final native Push backend correction

Candidate: `057ea56e2` (delta audited: `7574e664d..057ea56e2`). Persisted before
opening any existing candidate test. This is a narrow re-audit of only the final
project-id, explicit-surface, legacy-route and production-port seams; the retained
composite fan-out oracle and earlier finding set are reused rather than re-audited.

Authority read before this list: `AGENTS.md` global decision method, §§1/1b, 2–5,
9–12 and 24 (including §§10a/10b); `README.md`; server conventions; orchestration
bindings; `MASTER_PLAN.md` M6/M7; the original audit report/test record; fixer brief;
and `92-lead-final-correction-evidence.md`.

## Repeatable behavioral faults

1. Either authenticated fixed-surface route can source a different surface's
   `projectId`, treat an invalid app id as a valid lookup, or expose the auth token,
   provider endpoint, or an enclosing secret envelope.
2. The named settings root accepts an arbitrary app id, reads a non-global or wrong
   setting, returns more than `{ value, projectId }`, or can be reached through a
   broad patient settings read rather than its declared narrow capability.
3. A supplied invalid `pushSurface` falls back to legacy route resolution; an
   absolute, protocol-relative, userinfo, admin, cross-surface, malformed or
   traversal-shaped legacy route invokes native dispatch.
4. A video meeting invitation selected for logical `web_push` loses
   `pushSurface: 'therapygo'` before its durable queue payload, changes existing
   Telegram/email selection or dedup semantics, or creates another queue/channel/
   dispatch path.
5. A production `WebPushAccessPort` call reaches native dispatch with arbitrary
   app/provider strings, while valid legacy browser-only fakes no longer typecheck.

## One-time state inspections

6. Migration/root ownership, `EXECUTE`, body columns, port-context capability and
   generated DEV/TEST declarations diverge; migration grants/policies or a direct
   broad patient `system_settings` read exists.
7. The exact candidate diff leaks a provider credential/token envelope into a route,
   response, queue, app bundle or logging surface.

## Required fault-to-oracle mapping

- Return the full settings envelope/auth token → project-id route/service assertion
  must fail.
- Turn invalid explicit surface into URL fallback → invalid-surface dispatch
  assertion must fail.
- Accept absolute/admin legacy route → provider-not-called assertion must fail.
- Remove the video producer's explicit surface → queue content assertion must fail.
- Pass arbitrary app/provider strings through production dispatch → closed-contract
  adapter assertion must fail (or production typecheck rejects the mutation).

No source-text, migration-SQL, declaration formatting or file-count tests will be
added; those are inspected through the final diff and existing static/rollback-only
gates.
