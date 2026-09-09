# Тест или взгляд — #915 shared multipart backend correction

Повторяемые authorization, lifecycle, status-mapping and transactional-cleanup contracts are behavioral route /
repository tests. Tenant binding, transaction topology and sweep recovery are one-time DB/code inspection unless
an existing public repository seam makes a durable behavioral oracle proportionate.

# Confirmation auditor-live brief

Authority: active mobile plan M5-04 and its multipart acceptance lines; product `2a1787827`; audit authority
`f3a85aa86`; independent audit/tests `1969f9eef`; correction authority `478014817`; product correction
`c1147716e`; saved report
`.lead/runs/mobile-media-multipart-backend-audit-20260909/90-final-audit-report.md`. Audit this final corrected
surface once. Do not fix production code or expand the plan.

Before every action run the `AGENTS.md` heading map. Read the global decision method; §1/§1b; §4a; §5; §9;
§10/§10a/§10b; §12 and §24. Read the active M5 authority, original worker/auditor/correction briefs and report,
blind kill-set, exact product/audit/correction diffs, all touched routes/repository/service/ports/schema and relevant
existing tests. Use code-search before blind grep. Do not use raw SQL or create a database; DEV/TEST access is only
through established app tests/Drizzle paths if strictly required.

First persist a fresh blind failure list at
`.lead/runs/mobile-media-multipart-backend-confirmation-audit-20260909/00-blind-killset.md`. Confirm at least:

1. An authenticated patient can abort their own pending program-submission multipart session before S3 object
   completion; authorization comes from the server-owned session binding, not client policy fields or HEAD of a
   not-yet-existing object. Foreign/stale/wrong-purpose sessions remain rejected and no cross-tenant abort occurs.
2. Doctor abort of a pending `patient_file` upload atomically removes the linked `patient_files` row and stages /
   removes the media/session lifecycle as required, so the legacy list cannot expose a null-media ghost. Other
   purposes are not over-deleted; transaction rollback cannot leave a half-applied abort.
3. Patient completion rejection classifies a missing received-object (`receivedAt IS NULL`) as the plan's typed
   `session_expired`/405 outcome, while foreign/conflict cases retain their distinct status.
4. Patient program-submission presign failure cleanup references the actual created media id and cannot skip the
   compensating cleanup because of scope/shadowing.
5. Inspect and report tenant binding and the two-transaction creation/compensation/sweeper path. Treat a reachable
   permanent or visible orphan as a finding; do not demand a refactor if the existing compensation+sweep closes the
   owner-visible path.

You own tests/audit artifacts, not product code. Retain the original failing abort oracle and add/strengthen the
smallest public-boundary behavioral test for doctor abort cleanup/status mapping if currently absent. Evaluate the
existing `uploadDoorAcceptance.route.test.ts` 415-vs-409 failure against current product authority: update the
oracle only if the plan/current public contract proves the fixture is stale; otherwise report a reachable finding.
Do not change a test merely to make CI green. Ignore unrelated `videoMeetingInvitationNativePush` except to name
it as pre-existing with exact command/evidence.

Run explicit fault injections for the two corrected abort defects and any new durable oracle; restore every
production mutation and report `убито N / непойманных M`. Through the shared host lock run targeted lifecycle /
route/repository suites, webapp typecheck, scoped lint, architecture/upload-door gates and `git diff --check`.
No PROD, deploy or secret access.

Writable scope: relevant existing webapp behavioral tests and
`.lead/runs/mobile-media-multipart-backend-confirmation-audit-20260909/**`. Save the final report as
`.lead/runs/mobile-media-multipart-backend-confirmation-audit-20260909/90-final-audit-report.md`; commit only
audit-owned tests/artifacts with explicit paths and `#915`, never `git add -A`, do not push, finish clean, and
report exact SHA/verdict/commands/fault tally. A finding needs a reachable scenario, impact and violated plan line;
style, speculative hardening and alternative architecture are not findings.
