# Worker correction brief — #915 shared multipart lifecycle

Authority: `docs/_TODO/NATIVE_MOBILE_APP_INITIATIVE/MASTER_PLAN.md`, exact M5-04, M5-05 and M7-01/M7-02;
independent verdict `.lead/runs/mobile-media-multipart-backend-audit-20260909/90-final-audit-report.md` on candidate
`2a1787827`, audit/tests `1969f9eef`. Deliver one coherent same-branch correction. Do not split this into small
passes.

## Mandatory reading

Before any action run the AGENTS.md heading map. Read the global decision method; §1/§1b; §5 completely; §9;
§10/§10a/§10b; §12 and §24. Read the active plan items above, the original worker brief, full independent report,
retained failing acceptance test, `modules/media/media.md`, every candidate-touched multipart route/app-layer/repo
path and the existing patient-file/program-submission finalizers before editing. Use code-search before blind grep.

## Required product outcome

1. A patient-owned `patient-program-submission` multipart session can be aborted before S3 object completion.
   Authorize from durable server-owned session policy/usage and principal, never from `HeadObject` metadata that
   cannot exist until completion. Preserve idempotent/best-effort S3 abort and the existing pending-submission
   failure semantics; do not weaken owner/session/surface authorization.
2. Aborting a doctor-started pending patient-file multipart upload atomically removes or terminally hides the
   linked pending `patient_files` record together with the pending media/session state. It must not reappear through
   the legacy-null-media listing path. Reuse the existing expiry/finalizer semantics instead of adding a parallel
   cleanup route.
3. Inspect the complete begin → part URL → complete/abort state machine for the same new policies and close any
   actually reachable integrity gap in this candidate, specifically:
   - doctor sessions remain bound to the requested workspace organization even when the same user belongs to more
     than one organization; patient sessions remain bound to their server-installed patient principal;
   - creation of the pending media/session and its policy-linked program-submission/patient-file/individual-exercise
     record is atomic on the provided transaction client, so a thrown second step cannot leave a visible orphan;
   - complete/abort never trusts client policy/tenant fields or a row reached outside the caller's authorized
     predicate.
   If inspection proves one of these concerns impossible, record the exact durable predicate/transaction path in
   the result rather than changing code speculatively.
4. Preserve the common authorized multipart chokepoint, upload-policy/size/MIME checks, idempotent complete,
   existing CMS behavior, browser callers and privilege declaration parity. Do not add a second upload service or
   client-supplied storage key/policy/tenant.

## Boundaries

Production scope is the candidate's existing multipart app-layer/routes/repos/module files and the minimum existing
patient-file/program-submission/exercise port implementation needed for atomic lifecycle cleanup. No schema or
migration is expected; if one appears necessary, stop and report instead of inventing it. Do not touch PWA,
Capacitor/Android, Push, Jitsi, UI, unrelated media playback, PROD/TEST/deploy or real S3/DB data.

You are a worker: **do not create, edit, delete or reformat tests or audit artifacts**. The auditor owns tests.
The retained failing route test is read-only and must turn green through product code. Do not weaken it or adjust a
fake to hide a product defect.

## Validation and delivery

Use the shared host test lock. Run the retained failing route test, relevant existing multipart/media lifecycle
tests, webapp typecheck, scoped ESLint, media upload-door normal/self-test, privilege generated check/census if
privilege files are touched, architecture gates and `git diff --check`. Full root CI waits for final integration.

Commit only explicit in-scope production paths with a meaningful `#915` message; never `git add -A`; do not push.
Report exact SHA, files, behavior fixed, concern-3 evidence, commands/results and clean status. Do not finish while
a foreground command is still running.
