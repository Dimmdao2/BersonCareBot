# Security Review — webapp + integrator

**Date:** 2026-07-23
**Branch:** `feat/doctor-ui-rebuild`
**Scope:** `apps/webapp`, `apps/integrator`, `apps/media-worker`, `deploy/*`
**Method:** verify prior audit findings against current code + targeted current-code vuln scan (XSS, injection, SSRF, open redirect, authz/IDOR, secrets, cookies/CSRF, file handling, rate limiting, security headers).
**Policy applied:** security findings default to OWNER-TRIAGE; no auth/session/tenant/infra code was changed. No code changes were made (no trivially-safe, zero-behavior-risk, self-contained fix was available).

---

## Summary counts

| Status | Count |
|---|---|
| FIXED-here | 0 |
| OWNER-TRIAGE | 3 (1 medium, 2 low) |
| ALREADY-OK / verified-fixed | 9 |

No Critical or High **currently-exploitable** issues found. The prior P0/P1 audit items are resolved in current code (see table). The remaining open items are hardening (defense-in-depth), not live exploits.

---

## Prior-audit findings — re-verified against current code

| # | Prior finding (P) | Verdict | Evidence (file:line) |
|---|---|---|---|
| §2.1 | phone `confirm` trusts `channel/chatId` from body (P0) | **ALREADY-OK (fixed)** | `apps/webapp/src/app/api/auth/phone/confirm/route.ts:18-23` body schema is `{challengeId, code, browserCalendarIana?, attemptId?}` only — no channel/chatId/displayName. Channel context is read from the stored challenge: `route.ts:52-57`, and binding uses `challenge.channelContext` only: `apps/webapp/src/modules/auth/phoneAuth.ts:170-181`. |
| §2.2 | authz centralization / IDOR risk (P1) | **ALREADY-OK** for reviewed routes | Sensitive routes enter via guards and are tenant-scoped. Media: `apps/webapp/src/app/api/media/[id]/route.ts:62,81-88` (`assertMediaPlaybackAccess` + doctor/patient gates). Patient files: `apps/webapp/src/app/api/doctor/patients/[userId]/files/route.ts:52-58,72-79` (UUID validation + `getClientIdentityForOrganization(userId, organizationId)` tenant scope). |
| §2.3 | DI bypass: `support/route.ts` hits Telegram API directly (P1) | **ALREADY-OK (fixed)** | `apps/webapp/src/app/api/patient/support/route.ts:16,172-180` now emits via `relayOutbound` → integrator dispatchPort; raw `fetch(api.telegram.org)` removed (documented at `route.ts:4-7`). |
| §2.3 | DI bypass: `media/[id]/route.ts` goes straight to repo (P1) | Architectural only, not security | Route now goes through `app-layer/media/*` helpers with access gates (`route.ts:5-16`). Direct-repo concern is an architecture-policy item, not a vuln. |
| §3.1 | cookie session hardening (httpOnly/secure/sameSite/HMAC/TTL) | **ALREADY-OK** | Confirmed safe by prior audit; session codec unchanged. Session renewal applied centrally in `apps/webapp/src/proxy.ts:47,70`. |
| §3.2.3 | trust boundaries: no channel binding from request body | **ALREADY-OK** | Enforced as in §2.1; challenge-origin context is authoritative. |
| API import-policy | `route.ts` must not import `@/infra/*` | Partial (non-security) | Some routes import `@/infra/logging/logger` and a few adapters (e.g. `apps/webapp/src/app/api/doctor/clients/integrator-merge/route.ts:8-9`). This is an architecture-policy drift, **not** a security issue. |

---

## Current-code vuln scan

### XSS — ALREADY-OK
- `dangerouslySetInnerHTML` sinks all sanitized or static:
  - `apps/webapp/src/shared/ui/patient/markdown/MarkdownContent.tsx:21-25` and `.../doctor/markdown/MarkdownContent.tsx:21-25` — `DOMPurify.sanitize` (isomorphic-dompurify) for `legacy-html`; Markdown path uses `rehype-sanitize` and does **not** enable `rehype-raw` (`markdownRenderTree.tsx:4`).
  - `apps/webapp/src/app/app/patient/booking/new/service/ServiceStepClient.tsx:35,39` — `DOMPurify.sanitize` before render.
  - `apps/webapp/src/app/not-found.tsx:51-55` — static inline CSS string, no user input.
  - `apps/webapp/src/app/app/PatientUnsupportedClientFallback.tsx:36` — build-generated watchdog script, no user input.
- Tests assert `<script>` / `javascript:` are stripped: `MarkdownContent.test.tsx:19` (both patient & doctor).

### Injection — ALREADY-OK
- No `eval(`/`new Function(` in product code (only `.exec()` regex matches and test-only `window.eval`).
- `child_process` usage is confined to scripts, tests, media-worker ffmpeg (`apps/media-worker/src/ffmpeg/*`), and preview worker (`apps/webapp/src/infra/repos/mediaPreviewWorker.ts:5` via `spawn`, no shell). No user-controlled shell strings.
- No hardcoded secrets found (targeted regex over `.ts/.tsx` returned nothing; secrets come from `@/config/env`).

### SSRF — ALREADY-OK (in reviewed surface)
- No `fetch`/axios with user-controlled URLs in `apps/webapp/src/app/api/**` product routes. Outbound messaging goes through the integrator dispatch chokepoint (`relayOutbound`). Media is served via server-generated S3 presigned URLs (`apps/webapp/src/app/api/media/[id]/route.ts:21-33`), key derived server-side.

### Open redirect — ALREADY-OK
- `isSafeNext` restricts `next` to the `/app/patient` subtree (excluding `/app/patient/bind-phone`) and parses via `URL(...).pathname`, rejecting `//host` and absolute externals: `apps/webapp/src/modules/auth/redirectPolicy.ts:19-23,30-44`.
- OAuth callbacks redirect only to server-derived targets: final URL is `getRedirectPathForRole(role)` resolved against server `appBase`, not user input: `apps/webapp/src/modules/auth/oauthWebSession.ts:60-61`; google `route.ts:123`, apple `route.ts:178`.

### AuthZ / IDOR — ALREADY-OK (reviewed routes)
- Guarded via `requireDoctorWorkspaceApiContext` / `requirePatientApiBusinessAccess` and tenant-scoped by `organizationId`. Dev auth-bypass routes are hard-gated: `isDevAuthBypassEnabled` requires `NODE_ENV==='development'` AND explicit flag, and production **refuses to start** if the flag is set (`apps/webapp/src/modules/auth/devBypassPolicy.ts:19-27`); routes redirect to `/app` when disabled (`dev-bypass/route.ts:20-24`, `dev-public/route.ts:21-28`).

### Cookies / CSRF — ALREADY-OK
- Origin-based CSRF enforced in middleware for every unsafe mutation on `/app`, `/app/*`, `/api/*`: `apps/webapp/src/proxy.ts:18-36,75-77`. Logic checks `Sec-Fetch-Site`, then Origin, then Referer against the canonical request origin, with explicit exempt classes (integrator HMAC, internal bearer, payment webhooks, Apple form-post): `apps/webapp/src/middleware/csrfOrigin.ts:90-205`.

### Rate limiting / brute force — ALREADY-OK
- OTP: resend cooldown + verify-attempt cap → lock, persisted in DB in prod: `apps/webapp/src/modules/auth/phoneOtpLimits.ts:32-122` (`OTP_MAX_VERIFY_ATTEMPTS` lock, `OTP_RESEND_COOLDOWN_SEC`). Confirm route returns 429 + `Retry-After` on lock: `confirm/route.ts:74-89`.

---

## Open findings — OWNER-TRIAGE

### 1. [MEDIUM] Missing global HTTP security response headers
**File:** `apps/webapp/next.config.ts:32-49` (only `Content-Security-Policy: frame-ancestors …` on `/book/:path*`), `deploy/nginx/bersoncarebot-webapp.vhost.template.conf:19-56` (proxy block sets no security headers).
**What's missing (site-wide):** `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`/global `frame-ancestors` CSP (clickjacking on `/app/*`), `Strict-Transport-Security` (HSTS), and a real `Content-Security-Policy` (script/style/connect) for the app surface.
**Exploit scenario:** For a PHI app, absence of `nosniff` allows MIME-confusion on any user-served bytes; no HSTS leaves TLS-downgrade/SSL-strip window; no app-wide `frame-ancestors` means `/app/*` (patient/doctor workspace) can be framed for clickjacking (only `/book` is protected today); no CSP means any future injected sink has no second line of defense.
**Recommended fix (owner decides layer):** add via nginx `add_header ... always` in the `location /` block OR extend `next.config.ts headers()` for a broad `source: "/:path*"`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, and a `frame-ancestors 'self'` CSP for `/app/:path*`. Keep the existing Tilda `frame-ancestors` allowlist for `/book`. A full script/style CSP needs a nonce rollout — schedule separately.
**Why not fixed here:** cross-cutting deployment/infra decision (nginx is the owner's chosen header layer) and non-zero behavior risk (HSTS is sticky; a wrong CSP breaks the app / Tilda embeds). Per repo policy → owner triage.
**Status:** OWNER-TRIAGE.

### 2. [LOW] SVG allowed in media upload allowlist
**File:** `apps/webapp/src/modules/media/uploadAllowedMime.ts:12-13` (`image/svg+xml` in `ALLOWED_MEDIA_MIME`).
**Exploit scenario:** SVG can carry `<script>`; if ever rendered inline in an `<img>`-less context or opened directly with `Content-Type: image/svg+xml`, it executes. Current mitigation: served only via S3 presigned redirect (separate origin from the app), and code comments mark SVG as "download-only, do not inline unsanitized". Impact is therefore limited to the S3 origin, not the webapp origin — hence LOW.
**Recommended fix:** when serving user-uploaded SVG, force `Content-Disposition: attachment` (or `Content-Type: application/octet-stream`) on the S3 object / presign response, or sanitize SVG server-side on upload. Verify no UI path inlines uploaded SVG.
**Status:** OWNER-TRIAGE.

### 3. [LOW] CSRF middleware not applied outside `/app` and `/api`
**File:** `apps/webapp/src/proxy.ts:75-77` (`matcher: ["/app", "/app/:path*", "/api/:path*"]`).
**Exploit scenario:** Any future state-changing POST handler mounted outside `/app`/`/api` (e.g. a top-level route or a Server Action posting to a non-`/app` page path) would bypass the origin check. No such mutating endpoint exists today, so this is latent, not live.
**Recommended fix:** document the invariant "all mutating endpoints live under `/api` or `/app`", or widen the matcher; add a lint/test guard so a new top-level mutating route can't silently escape CSRF coverage.
**Status:** OWNER-TRIAGE.

---

## Ranked owner-triage priorities

1. **Missing global security headers (MEDIUM)** — highest value; add nginx/`next.config` headers (nosniff, Referrer-Policy, HSTS, `frame-ancestors 'self'` on `/app/*`); plan a nonce-based CSP separately.
2. **SVG serving hardening (LOW)** — force attachment/sanitize on served user SVGs.
3. **CSRF matcher invariant (LOW)** — document/guard that all mutations stay under `/api`|`/app`.

*Non-security architecture drift noted (not in scope to fix): a few `route.ts` files import `@/infra/logging/logger` and adapters, against the route→app-layer import policy.*
