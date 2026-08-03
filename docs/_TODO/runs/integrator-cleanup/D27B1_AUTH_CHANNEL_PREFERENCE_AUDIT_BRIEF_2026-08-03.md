# D27-B1 — independent audit brief

Rules: `AGENTS.md` — read Маршрут, CORE rules, §5, §10/§10a/§10b, §21/§22 (UI text and `<Select>`), §24.
Language: internal work and this brief are English.

Candidate: `6e89e1910` on branch `wt/trackd-d27b1-auth-channel-preference`
(clone `/home/dev/dev-projects/bcb-wt-trackd-d27b1-auth-channel-preference`).

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — item **D27** and decision **Р-D27** (§2.3);
slice brief `docs/_TODO/runs/integrator-cleanup/D27B1_AUTH_CHANNEL_PREFERENCE_BRIEF_2026-08-03.md`.

Owner requirement being audited (D27, verbatim): «поле-список «куда слать код» … экран после ввода номера — поле кода,
повторная отправка, «подтвердить другим способом»». This pass covers ONLY the preference field
(«куда слать код») and the login path honouring it. The confirmation screen is a later slice — its absence is not a
finding here.

## Step 1 — classify every point as «тест или взгляд» (test or view) before checking anything

Per §24.4, split the slice: repeatable behavior (what the login route and the server action do with a preference,
what the allowed set is derived from) gets behavioral tests; one-off quality (that the Select really is back on the
profile page, that it reuses existing primitives and does not create a parallel component) is verified by reading the
final state, not by a test asserting source text. Write the classification down before you inspect the diff.

## Step 2 — blind kill-set, written before reading the candidate's tests

Derive named faults from the authority above. At minimum these must be covered by your kill-set:

- A client-submitted channel is trusted without server-side re-derivation, so a patient can select a channel that the
  admin policy has disabled, that is not linked to their own account, or whose phone is not trusted.
- The preference of one account influences delivery for another account, or the preference lookup happens on the
  anonymous/decoy path and becomes an enumeration oracle (this would regress the accepted D27-A1 closure).
- A stale, disabled or unlinked preference hard-fails login instead of degrading to the existing default order.
- The default order (RU mobile → SMS, otherwise email with verified email + trusted phone) is changed silently.
- The delivery actually sent does not match the honoured preference (telegram/max recipient id, sms, email).

## Step 3 — verify

Inspect the diff, the route, the server action, the UI and the existing tests. Missing behavioral acceptance tests
you write once. Green tests you confirm once by fault injection per independent fault class. Revert every temporary
production mutation; do not write the product fix yourself.

## Boundaries

- Do not change product code permanently. Only your acceptance tests and this audit artifact may stay.
- Do not touch DB, migrations, env, deploy, `feat`, or any path outside the candidate's file scope.
- A finding exists only for a reachable violation of the owner requirement or a repo rule (§24.6). Style, alternative
  architecture and speculative hardening are not findings. Anything outside D27's owner scope is an owner question.

## Deliverable

`docs/_TODO/runs/integrator-cleanup/D27B1_AUTH_CHANNEL_PREFERENCE_INDEPENDENT_AUDIT_2026-08-03.md` with: the
test-or-view classification, the blind kill-set, per-fault result (killed by a green test under injection, or
represented by a red acceptance test on the unchanged candidate), the exact commands with counts, and a binary
PASS/FAIL. Commit your tests and the artifact to the candidate branch; do not push, do not merge.
