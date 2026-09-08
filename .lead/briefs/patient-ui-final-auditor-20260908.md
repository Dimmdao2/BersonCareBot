# Patient UI final candidate audit — 2026-09-08

Role: independent read-only auditor. Do not edit or commit files.

Repository/worktree: `/home/dev/dev-projects/bcb-wt-patient-ui-system-audit-20260907`.

Authority:

- Read `AGENTS.md` route first, then §10a, §10b, §15, §17, §18, §19, §21, §22, and §24.4–§24.7.
- Owner scope: consolidate equal patient UI controls and styles behind shared patient primitives/tokens; preserve the existing patient visual language and every existing screen/action; align patient chats and exercise comments with the doctor's behavior/layout while retaining patient colors/fonts and doctor/clinic title; use the doctor modal mechanics for mobile open/close and layered views; mobile video opens in a convenient fullscreen modal while desktop video remains on a separate inline page; allow patients to record doctor-assigned symptom values and see the horizontally scrollable history chart; do not implement deferred messages; do not touch specialist/admin workspace switching.
- Candidate includes committed branch diff from base `a70212e76411dafb1ee5e45ce67644bb29edc280` through `HEAD`, plus the current uncommitted working-tree changes.

Audit method:

1. Before reading tests, write a compact kill-set from the owner scope above.
2. Inspect the full production diff and current state, not only the latest files. Confirm no patient content/actions disappeared, patient/doctor UI boundaries remain intact, and new abstractions actually replace duplicated equivalent behavior without introducing a new visual DNA.
3. Inspect tests only after the kill-set. Tests must assert behavior, never source strings, formatting, CSS counts, table counts, or implementation shape.
4. You may run existing targeted tests and read the acceptance screenshots/report. Do not start a shared dev server, mutate DEV data, write tests, or change files.
5. Known external live limitation: the existing owner doctor email/password login currently returns `500`, so the new doctor-assigned symptom cannot be created live in this worktree without bypassing auth. Treat this as a named unverified acceptance step, not as permission to bypass auth or mutate the DB directly. Determine whether it blocks land-ready under §24.7.

Report only binary findings. A MUST FIX requires a reachable behavior failure, security/data risk, build/runtime break, or exact violated owner/repo requirement, with file:line evidence and impact. Style preferences, speculative hardening, and alternative architecture are not findings. End with `PASS`, `BLOCKED`, or `FAIL`, and list exact commands run.
