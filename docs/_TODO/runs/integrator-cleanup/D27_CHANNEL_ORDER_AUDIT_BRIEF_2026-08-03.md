# D27 — independent audit of the code-delivery decision table

Rules: `AGENTS.md` — Маршрут, CORE rules, §5, §10/§10a/§10b, §21/§22, §24 (especially §24.4 and §24.6).
Language: internal work is English.

Candidate: `c65d911a3` on `wt/trackd-d27de-login-code-screen`
(clone `/home/dev/dev-projects/bcb-wt-trackd-d27de-login-code-screen`), together with the screen work `96bad16a3`
already on that branch and the B1 rewrite `053aad09c` that reached `feat` without any audit.

Authority: `docs/_TODO/runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` §1a, §2, §2a, §3;
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` item **D27** and **Р-D27** (§2.3);
fixer brief `D27_CHANNEL_ORDER_RECONCILE_BRIEF_2026-08-03.md` (findings F1–F4 only — F5/F6 are later slices and are
NOT part of this candidate).

## Step 1 — «тест или взгляд» before anything else

Classify each point per §24.4 and write the classification down before inspecting: which parts are repeatable
behavior (the automatic channel decision, what the screen shows, what the route sends) and which are one-off
quality (the new column and its migration, the removal of the dead ladder, the corrected notes). Prove each by the
matching method; do not write tests asserting the absence of source text.

## Step 2 — blind kill-set from the authority, before reading the candidate's tests

Cover at least these named faults:

- The default channel is not the one that confirmed **this** phone number, or the documented historical fallback
  silently becomes the rule for rows that do have provenance.
- An explicit profile preference stops winning over the computed default.
- A channel that is not configured+enabled in the admin panel still receives the code, or its refusal silently
  substitutes another channel (§2a and the corrected WORK_ORDER note must agree with the code — verify both).
- The anonymous path regains an enumeration oracle: the code path, timing, or the alternate-channel list differs
  for a known and an unknown number (this would regress the accepted D27-A1 closure).
- The code screen loses any of the four owner-required elements (code field, resend, «Подтвердить другим
  способом», top «войти иначе»), or the alternate-channel list stops showing every configured+enabled channel.
- Email delivery reaches an account whose phone is not confirmed (§2: only a confirmed contact logs in).
- The new `user_phone_history.confirming_channel` column and migration `0341`: written on the real confirmation
  paths (not only one of them), nullable-safe for existing rows, no broad new privileges, journal consistent.

## Step 3 — verify

Inspect the diff, the route, the resolver, the repo, the migration and the existing tests. Add missing behavioral
acceptance tests once; confirm green ones by fault injection per independent fault class. Revert every temporary
production mutation. Do not write the product fix.

## Boundaries

- Nothing about §2a item 7 (equal-rights login across contacts) is in scope — it is an **open owner gate**. If you
  find the candidate building anything for it, that is a finding.
- F5 (primary email) and F6 (OAuth contact resolution) are separate slices; their absence is not a finding.
- Do not touch `feat`, DEV/TEST databases, deploy, or PROD. The migration is audited by reading it, not by applying
  it — DEV apply happens after land, by the lead.

## Deliverable

`docs/_TODO/runs/integrator-cleanup/D27_CHANNEL_ORDER_INDEPENDENT_AUDIT_2026-08-03.md`: the classification, the
blind kill-set, per-fault result (killed under injection, or represented by a red acceptance test on the unchanged
candidate), exact commands with counts, and a binary PASS/FAIL. Commit your tests and the artifact to the candidate
branch. Do not push, do not merge.
