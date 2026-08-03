# Fix the two defects the owner hit on TEST

Rules: `AGENTS.md` — Маршрут, CORE rules, §1 «Миграции», §5, §6, §10/§10a/§10b, §21 (UI copy), §24.
Language: internal work is English; UI copy is Russian.

Authority: diagnosis `docs/_TODO/runs/billing/TEST_OWNER_FINDINGS_2026-08-03.md` (landed `8bd34affa`) — it already
carries the live log lines and the root causes. Do not re-diagnose; fix.

Источник оракула: `AGENTS.md` «Как решать, что делать» — «Мера всему — человек… если этого не сделать, человек
получит то, что ему нужно, или нет?». Both defects were hit by the owner on TEST today: he could not sign in with
a provider, and he could not open analytics as global admin.

## Defect 1 — the public pre-login routes have no DB access

`GET /api/auth/oauth/start` returns **`500` with an empty body**; `journalctl` shows
`permission denied for table system_settings`. The pre-login connection has neither a grant nor a principal to
`SET ROLE` with. The same class was fixed on 2026-07-25 for authenticated platform pages — **find that fix and
follow its shape**, do not invent a second mechanism. The browser currently shows a bare «Провайдер недоступен.»,
which reads as «the system is broken».

Scope it honestly: the whole **public pre-auth route family** has this hole, not just `oauth/start`. Enumerate the
routes that run before a session exists and read settings, and cover them by the same seam. Grant exactly what
those reads need — a grant wider than the queries is a defect, not caution. If a migration is required, reserve the
number on the board before creating the file, and update the deploy-time privilege expectation in
`deploy/host/deploy-test-saas.sh` in the same commit, or the next TEST deploy fails closed on your own change.

## Defect 2 — a global admin cannot reach analytics

Classification from the diagnosis is **(b)**: the page and its `requirePlatformOperationsPage` guard are correct.
The block is one layer up — the edge portal gate in `proxy.ts` treats **any** `/app/doctor/*` URL as requiring the
literal role `doctor`, which a platform admin structurally cannot have. The platform navigation's «Аналитика» link
points at exactly such a URL, so the owner's own click gives `307` → access denied.

Fix the gate so a platform role reaches platform surfaces living under that path prefix, without loosening the gate
for anyone else — a doctor-only surface must stay doctor-only. Say in the report which URLs changed classification
and why each is safe. ⚠️ This repo has **no Next.js middleware**; route interception runs through `proxy.ts` — do
not add middleware.

## Explicitly out of scope

The bare-fallback error texts (`'Не удалось войти.'`, the blanket 409 message) and the masked email-delivery
failure from D27-A2 are **separate slices** — the diagnosis names them, and they need owner-visible copy decisions.
Do not touch them here.

## Done means

- Behavioral tests: a pre-login provider start succeeds without a session and does not raise `42501`; a global
  admin reaches the analytics page while a non-platform role still cannot.
- Live proof on DEV for both, with status codes.
- Typecheck (both apps if touched), scoped ESLint, `git diff --check` clean.
- One commit on your branch, no push. Report the exact grant, the exact gate change, and the live status codes.
