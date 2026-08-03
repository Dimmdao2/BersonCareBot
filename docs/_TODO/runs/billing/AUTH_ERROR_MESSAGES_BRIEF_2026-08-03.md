# Auth error messages — take the established practice, not our invention

Rules: `AGENTS.md` — Маршрут, CORE rules, §5, §10/§10a/§10b, §21 (UI copy without redundant explanation), §24.
Language: internal work is English; all user-visible copy is Russian.

Authority: diagnosis `docs/_TODO/runs/billing/TEST_OWNER_FINDINGS_2026-08-03.md` (landed `8bd34affa`) — it names
the exact codes and the exact failing lines. Owner, 2026-08-03: «очень странные и не логичные. Стоит не
придумывать а взять уже отработанную практику взрослых систем».

Источник оракула: `AGENTS.md` «Как решать, что делать» — «Мера всему — человек… если этого не сделать, человек
получит то, что ему нужно, или нет?». Today the owner hit a real failure on TEST and the screen told him nothing
he could act on.

## The measured defect — do not re-diagnose

`submitEmailPasswordLogin` (`AuthFlowV2.tsx:842-906`) parses only two cases: `invalid_credentials` (401) and any
`409`. Everything else falls into a bare `toast.error('Не удалось войти.')` — no reason, no next step. Codes that
land there today: `proxy_configuration` (503), `rate_limited` (429), `invalid_body` (400),
`security_setup_pending` (503). Worse, an empty `500` body (the `oauth/start` case: `permission denied`) is
indistinguishable from a normal refusal, so a server-side failure reads as «you did something wrong».
Password change has its own texts (`staffSecurityErrorText.ts`) but its fallbacks name no cause either.

## Step 1 — establish the practice, with sources, before writing any Russian text

Read how mature systems handle authentication errors and write the findings down (short, with URLs): OWASP ASVS
and the Authentication Cheat Sheet, NIST SP 800-63B, and how large consumer products actually word these screens.
Cover at least these questions:

- which failures must stay deliberately indistinguishable (wrong login vs wrong password — anti-enumeration) and
  which must NOT be merged with them;
- how a rate limit is communicated (and whether the retry moment is shown);
- how a **server-side** failure is separated from a user mistake, and the error-reference/correlation-id pattern
  that lets support trace it;
- what is never shown to the user (internal codes, stack, provider text).

## Step 2 — a message table for our real codes

Produce a table: **code → HTTP status → what the person sees (Russian) → what they can do next**. Cover every code
the login and password-change paths can return, plus two cases we do not handle at all today:

- **unrecognized/empty response** — must read as «сбой на нашей стороне», never as a credentials error;
- **rate limit** — must say when to come back.

Follow §21: no redundant explanation, no scolding, no internal vocabulary. The owner will review the final wording,
so list every string in your report as a plain table.

## Step 3 — implement

- Client: distinguish an empty/unrecognized response from a real code; render each code from one place, not from
  branches scattered across the form. Reuse the existing `staffSecurityErrorText` shape rather than inventing a
  second mechanism.
- Server: wrap the public pre-auth routes (`email-password/login` and its neighbours) so an unhandled exception or
  a `permission denied` cannot leave an **empty 500** — the same thing was already done today for
  `email-otp/start`; follow that shape.
- Keep the anti-enumeration guarantee intact: the accepted D27-A1 closure must not regress, and wrong-email and
  wrong-password must stay identical to the caller.

## Boundaries

- No change to what actually authenticates anyone, to rate-limit thresholds, or to the OTP neutralization.
- No new UI library, no new toast system, no new error taxonomy beyond the table.
- No push, no merge into `feat`.

## Done means

- Behavioral tests: an unrecognized code and an empty body both produce the «our side failed» message, not a
  credentials one; a 429 produces the rate-limit message; the two indistinguishable cases stay indistinguishable.
- Typecheck, scoped ESLint, `git diff --check` clean; touched test files pass.
- The report contains the sources from step 1 and the full message table from step 2, ready for the owner to edit.
