# TEST — what the logs actually say, and why global admin has no analytics

Rules: `AGENTS.md` — Маршрут, CORE rules, §1/§1b, §6, §24. Language: internal work is English.
Authority: this brief (bounded operational diagnosis, `ORCH_OPS`). Owner findings while using TEST on 2026-08-03.

**This run diagnoses. It does not fix.** Each confirmed defect becomes its own slice with its own evidence.

## Finding 1 — the error the owner saw is unreadable

Owner, verbatim: «проблема в том что уведомление об ошибке вообще непонятное. То есть оно не про то что неверный
пароль или емэйл — оно читается как "не работает система"».

Measured from the code before this run, so you do not repeat it:

- `fetchJsonSafe` (`AuthFlowV2.tsx:94`) returns `ok:true` for **any** HTTP status; only a network failure is
  `ok:false`. So a wrong password does **not** produce the network message.
- Wrong password → `401 invalid_credentials` → «Email или пароль неверны…». Clear.
- Any `409` → «Email не подтверждён. Обратитесь в поддержку.» — shown for **every** 409, whatever the code.
- Anything else falls through to a bare `toast.error('Не удалось войти.')` — no reason at all. This is the line
  that reads as «система не работает».
- Password change has the same shape: unmatched codes fall back to «Пароль не изменён. Проверьте данные и
  повторите попытку.» (`staffSecurityErrorText.ts`).

**Your job:** find in the TEST logs what the server actually returned for the owner's attempts today — the status
code, the `error` value, and the reason behind it. nginx access log plus the webapp service log. Then say which of
the three branches above fired, and therefore which message he actually saw. Name the exact error codes that
currently reach the bare fallback, so the fixing slice knows what to write text for.

## Finding 2 — global admin has no access to analytics

Owner, verbatim: «кстати доступа к аналитике у глобал админа нет».

Establish the facts, do not guess: which analytics surface he means (find the route/page), what guard it uses,
what that guard requires, and what the global-admin session actually carries on TEST. Say plainly whether this is
(a) a missing grant/role, (b) a guard that asks for a clinic-scoped capability a platform admin cannot have by
construction, (c) a screen never wired for the platform role, or (d) working as designed and he looked in the
wrong place. Reproduce it live under a real global-admin session and record the status codes.

## Boundaries

- TEST only. **PROD (`135.106.162.170`) is untouchable.** Read-only: no product code change, no migration, no
  deploy, no grant changes, no data mutation.
- Do not write secrets, hashes or tokens anywhere.

## Done means

`docs/_TODO/runs/billing/TEST_OWNER_FINDINGS_2026-08-03.md`, in Russian, with:

- for finding 1: the actual log lines, the status/error codes, which message the owner saw, and the list of error
  codes that currently reach a message with no reason in it;
- for finding 2: the classification (a/b/c/d) with the guard, the route and the live status codes;
- for each: one sentence on what the fix would be — not the fix itself.

Commit on your branch. No push, no merge.
