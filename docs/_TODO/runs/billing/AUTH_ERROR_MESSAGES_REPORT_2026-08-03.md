# Auth error messages — established practice, message table, and the fix

Executes `docs/_TODO/runs/billing/AUTH_ERROR_MESSAGES_BRIEF_2026-08-03.md` against the diagnosis in
`docs/_TODO/runs/billing/TEST_OWNER_FINDINGS_2026-08-03.md`. Wording below is a draft for the owner to edit —
nothing here is final copy.

## Step 1 — established practice, with sources

- **OWASP Authentication Cheat Sheet** — https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
  Login failure (wrong username, wrong password, unknown account) must return one generic response —
  their example: *"Login failed; Invalid user ID or password."* This is the anti-enumeration boundary: only
  the credentials check itself stays merged. It says nothing about merging rate-limit or server-error
  responses into that same bucket — those are a different failure class and the cheat sheet defers detail
  to error handling.
- **OWASP ASVS, V2.2 (anti-automation)** — https://github.com/OWASP/ASVS/blob/master/4.0/en/0x11-V2-Authentication.md
  Requires rate-limiting/throttling on credential guessing and a reaction after repeated failures. It does not
  prescribe wording, but it does establish rate-limiting as its own control, distinct from the credentials
  check — supporting a separate, more informative message for "too many attempts" than for "wrong password."
- **OWASP Error Handling Cheat Sheet** — https://cheatsheetseries.owasp.org/cheatsheets/Error_Handling_Cheat_Sheet.html
  For unexpected errors: return a **generic response to the user**, log full details **server-side only**.
  Their example payload is exactly the shape we already use elsewhere in this repo: `{"ok":false,"message":"..."}`.
  Never render stack traces, exception text, internal codes, or provider payloads to the user — those go to
  the log only, keyed however the operator can search them (we already do this: `logger.error({ error }, ...)`,
  never `error.message` in the JSON body).
- **NIST SP 800-63B** — https://pages.nist.gov/800-63-4/sp800-63b.html
  Verifiers SHALL rate-limit online guessing (§5.2.2, "Rate Limiting (Throttling)"); no specific wording
  requirement, but the control is explicitly separate from the credential-verification control itself —
  same separation ASVS draws.
- **Consumer-product practice** (Auth0, GitHub, common 429 UX) — retrieved via web search, no single
  canonical URL: the near-universal pattern for rate limiting is to **say when to come back** — "Too many
  login attempts, try again in 1 minute," `Retry-After` header mirrored into the copy. Silence about timing
  is the anti-pattern.

**Answers to the brief's four questions:**

1. **What must stay indistinguishable:** wrong email vs wrong password only. This repo already does this
   (`invalid_credentials`, one message, one status, whether the projection is missing or the password is
   simply wrong — see `passwordAuth.route.test.ts`, "keeps credential failure and a missing identity
   projection on the same public failure"). Not touched by this work.
2. **What must NOT be merged with it:** rate limiting, malformed request, and any server-side failure. Each
   is a different actionable state for the person (wait a specific time / re-check what you typed / it's not
   you, try later) and merging them into "Не удалось войти." is exactly the defect this brief fixes.
3. **Rate limit:** say when to retry. This repo already had the mechanism (`Retry-After` header +
   `retryAfterSeconds` in the body + `formatOtpRetryAfterMessage` for OTP); the login route's 429 already
   carried a concrete "Подождите 10 минут" — it just never reached the user because the client didn't read it.
4. **Server-side failure vs user mistake / correlation:** generic user-facing text, full detail only in the
   server log (`logger.error`). This repo does not have a support-facing correlation-id/error-reference UI
   convention yet (checked: no such pattern in `staffSecurityErrorText.ts`, `apiResponse.ts`, or the toast
   call sites) — introducing one is a taxonomy change beyond this brief's boundary ("no new error taxonomy
   beyond the table"), so it is **not** added here; flagging it as a candidate follow-up, not doing it now.

## Step 2 — message table

Every code the login (`POST /api/auth/email-password/login`) and password-change
(`POST /api/account/security/password/change`) paths can return, plus the two previously-unhandled cases.
"Reused" = text already existed somewhere in the repo before this change; "New" = added by this work.

| Code | HTTP | What the person sees (RU) | Next action | Status |
|---|---|---|---|---|
| `invalid_credentials` | 401 | «Email или пароль неверны. Проверьте данные или восстановите пароль.» | retype or use password recovery | Reused, unchanged |
| `email_not_verified` | 409 | «Email не подтверждён. Подтвердите адрес и повторите вход.» | confirm the email | **Fixed** — client hardcoded «Обратитесь в поддержку» while the server already sent the correct self-service text; client now shows the server's `message` |
| `rate_limited` | 429 | «Слишком много запросов. Подождите 10 минут и повторите попытку.» | wait, then retry | Reused — server already sent this; client just never rendered it |
| `proxy_configuration` | 503 | «Защита входа временно недоступна. Повторите попытку позже.» | wait, then retry | Reused — same |
| `invalid_body` | 400 | «Данные введены неверно. Проверьте их и повторите действие.» | recheck the form | **New message text** — route returned the code with no `message` before |
| `security_setup_pending` | 503 | «Не удалось подготовить защищённый вход. Повторите попытку позже.» | wait, then retry | Reused — server already sent this |
| `server_error` (unhandled exception / permission denied) | 500 | «Не удалось войти из-за сбоя на нашей стороне. Повторите попытку позже.» | wait, then retry — explicitly not a credentials message | **New** — this code path didn't exist; an unhandled exception left an **empty 500** the client silently read as `{}` |
| unrecognized/empty response (any other or missing `error`) | any | same as `server_error` above (fallback text) | wait, then retry | **New** — this is what used to render the bare «Не удалось войти.» |

Password-change (`/api/account/security/password/change`), for completeness — already routed through
`staffSecurityErrorText`, no defect found here, listed only because the brief asks for full coverage:

| Code | HTTP | What the person sees (RU) |
|---|---|---|
| `wrong_current_password` | 401 | «Текущий пароль неверен. Проверьте его или восстановите пароль.» |
| `password_temporarily_locked` | 429 | «Слишком много неверных попыток. Подождите 15 минут или восстановите пароль.» |
| `password_login_unavailable` | 409 | «Вход по паролю не настроен. Используйте другой способ входа.» |
| `weak_new_password` | 400 | «Новый пароль должен содержать от 8 до 128 символов. Измените пароль и повторите.» |
| `invalid_body` | 400 | «Данные введены неверно. Проверьте их и повторите действие.» |
| `proxy_configuration` | 503 | «Защита входа временно недоступна. Обратитесь к администратору и повторите позже.» |
| `rate_limited` | 429 | «Слишком много попыток. Подождите 10 минут и повторите.» |
| `password_change_failed` (unhandled exception) | 500 | «Пароль не изменён из-за временной ошибки. Повторите попытку позже.» |
| `password_changed_session_reissue_failed` | 500 | «Пароль изменён, но сеанс завершён. Войдите снова с новым паролем.» |

`POST /api/auth/oauth/start` also had the same empty-500 structural risk (this is Finding 1b from the
diagnosis — the actual incident the owner hit). It now returns, on any unhandled exception:
`{ ok: false, error: 'server_error', message: 'Не удалось начать вход из-за сбоя на нашей стороне.
Повторите попытку позже.' }`, 500. Its existing client fallback (`toast.error(data.message ?? 'Провайдер
недоступен')`) already reads as provider-side, not credentials-side, so it was left as-is per boundary
(no new UI mechanism beyond the table).

## Step 3 — what changed

**Client** (`apps/webapp/src/shared/ui/patient/auth/AuthFlowV2.tsx`, `submitEmailPasswordLogin`):
every code that isn't `email_not_verified`/`invalid_credentials` (which keep their own branches only because
of captcha/factor side effects) now renders through one line:
`toast.error(data.message ?? staffSecurityErrorText(data.error, 'email_password_login'))`. Reused
`staffSecurityErrorText` (`apps/webapp/src/shared/ui/auth/staffSecurityErrorText.ts`) rather than inventing a
second text mechanism: added the `email_password_login` action whose fallback is the server-error text, and
added the missing `security_setup_pending` case. An unrecognized or empty `data.error` — the exact shape a
pre-fix empty 500 produces — falls to that fallback by construction, not by a special case.

**Server:**
- `apps/webapp/src/app/api/auth/email-password/login/route.ts` — wrapped the body from after request
  validation through session issuance in `try/catch`; any unhandled exception now returns
  `{ ok:false, error:'server_error', message:'...' }` at 500 instead of an empty body. Added `message` to the
  `invalid_body` branch, which had none.
- `apps/webapp/src/app/api/auth/oauth/start/route.ts` — same shape around the three provider branches
  (the code path that actually broke on TEST today per diagnosis Finding 1b: `getYandexOauthClientId()` threw
  `permission denied for table system_settings` with no catch).

Both follow the pattern already established today for `email-otp/start` and pre-existing in
`account/security/password/change`: catch, `logger.error` server-side only, typed JSON to the client.

## Tests

- `apps/webapp/src/modules/auth/passwordAuth.route.test.ts` — new case: `verifyEmailPasswordForLogin` throws
  → route returns `{ok:false, error:'server_error', message:...}` at 500, not an empty body; no session issued.
- `apps/webapp/src/modules/auth/oauthAppleToggle.route.test.ts` — new case: `getYandexOauthClientId` throws
  (the exact diagnosed failure) → same typed 500, not an uncaught exception.
- `apps/webapp/src/shared/ui/auth/staffSecurityErrorText.unit.test.ts` — new file: an unrecognized or missing
  code under `email_password_login` resolves to the our-side-failure text (not anything credentials-shaped),
  and the rate-limit/proxy-configuration/security-setup-pending cases keep their established wording.
- Scoped run: `pnpm exec vitest run src/modules/auth src/app/api/auth src/shared/ui/auth
  src/shared/ui/patient/auth` — 19 files, 93 passed, 1 pre-existing skip, 0 failures.
- `pnpm exec tsc --noEmit` (webapp) — clean, after building the workspace packages the worktree didn't have
  pre-built (`db-principal`, `platform-merge`, `operator-db-schema`, `error-tracking` — environment setup, not
  a code change).
- Scoped ESLint on the seven touched/added files — clean.
- `git diff --check` — clean.

## Boundaries respected

- `verifyEmailPasswordForLogin`, rate-limit thresholds, and OTP neutralization untouched.
- No new UI library, no new toast mechanism, no new error taxonomy beyond the table above — `server_error` is
  an existing repo-wide code (`requireRole.ts`, `specialist-signup/*`, `AuthFlowV2.tsx`'s own OTP-confirm
  branch), reused, not invented.
- No push, no merge into `feat`.

## Not done, flagged for the owner

- No correlation-id/error-reference shown to the user for support tracing (see Step 1, point 4) — repo has no
  existing convention for this; adding one is a taxonomy decision outside this brief's boundary.
