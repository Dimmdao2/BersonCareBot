# D27 F5/F6 — independent audit: who can get into an account

Rules: `AGENTS.md` — Маршрут, CORE rules, §5, §10/§10a/§10b, §24 (especially §24.4 and §24.6).
Language: internal work is English.

Candidate: `66b82d55b` on `wt/trackd-d27de-login-code-screen`
(clone `/home/dev/dev-projects/bcb-wt-trackd-d27de-login-code-screen`).

Authority: `docs/_TODO/runs/integrator-cleanup/IDENTITY_AND_MERGE_SCHEME.md` **§1, §2, §2a, §3.4** — the owner
dictated every rule there on 2026-08-03. Slice brief: `D27_F5F6_CONTACTS_BEHAVIOR_BRIEF_2026-08-03.md`.

**Why this audit exists and why it is not optional:** this candidate changes **who may log into an account**
(equal-rights login by any confirmed contact) and it edits a SQL grants file
(`d3-4-bootstrap-base-login-read-grants.sql`). A mistake here is account takeover or a privilege widening, not a
cosmetic defect.

## Step 1 — «тест или взгляд» before anything else

Classify per §24.4 and write it down before inspecting: which points are repeatable behavior (who resolves to
which account, what a refused conflict returns, what the primary email becomes) and which are one-off quality (the
grants diff, the removal of the unconditional UPDATE, whether one shared helper is really used by both resolvers
rather than a second parallel one). Prove each by the matching method.

## Step 2 — blind kill-set from the authority, before reading the candidate's tests

At minimum, name and kill these faults:

- **An unconfirmed contact logs someone in.** §1 and §2: only a confirmed contact is an identifier. A phone typed
  by clinic staff, a contact from a merge, or an address that was never verified must never authenticate.
- **Equal-rights lookup crosses accounts.** A contact belonging to account A resolves a session for account B —
  including the merged/archived/blocked cases (`merged_into_id`, `is_blocked`, `is_archived`).
- **The primary email is still reassignable.** The F5 fix claims the UPDATE now runs only when the account has
  none — verify with two consecutive sign-ins from two different provider addresses, and with a race (two
  concurrent callbacks).
- **The owner's six cases are not what the code does.** Walk each of §2a cases 1–6 separately, including case 6:
  conflicting accounts must refuse the login, show the owner's verbatim message and reach a support entry point
  that actually works for a signed-out person.
- **The refusal leaks.** Case 6's message or status must not reveal whether a given phone or email exists — check
  it against the accepted D27-A1 enumeration closure, which must not regress.
- **The grants change widens privileges.** Read `d3-4-bootstrap-base-login-read-grants.sql`: exactly what was
  added, to which role, on which tables/columns, and whether the login path genuinely needs it. A grant that is
  broader than the read the code performs is a finding.
- **The Yandex path diverges from the Google/Apple path.** The candidate claims one shared helper serves both;
  verify there is no second rule hiding in `oauthYandexResolve.ts`.

## Step 3 — verify

Inspect the diff, both resolvers, the shared helper, the lookups, the grants file and the existing tests. Write
missing behavioral acceptance tests once; confirm green ones by fault injection per independent fault class. Revert
every temporary production mutation. Do not write the product fix.

## Boundaries

- No new contact store, no migration, no DB/TEST/PROD touch, no `feat`, no push.
- Out of scope: the contact-list UI with removal, the linkage audit event, anything from D15b staging.

## Deliverable

`docs/_TODO/runs/integrator-cleanup/D27_F5F6_INDEPENDENT_AUDIT_2026-08-03.md`: the classification, the blind
kill-set, per-fault result (killed under injection, or a red acceptance test on the unchanged candidate), exact
commands with counts, and a binary PASS/FAIL. Commit tests and artifact to the candidate branch.
