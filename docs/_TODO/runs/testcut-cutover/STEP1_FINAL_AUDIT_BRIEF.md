# #1074 Step 1 — final correction audit

Authority:

- `docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`, current order step 1;
- `docs/_TODO/testsuite-rewrite-list.md` §A;
- `.cursor/rules/test-execution-policy.md`;
- `docs/ORCHESTRATION_BINDINGS.md`.

Audit target:

- baseline: `970c5f2ac`;
- final target SHA: `01ea1c9ce8bb8051d228a5d6aba893f931aad672`;
- target commits:
  - `a380533b4` bulk legacy-test deletion;
  - `34f6e7d28` residual e2e deletion;
  - `e5c6dc4ea` empty media-worker suite runner contract;
  - `ac68c0ed4` client-safe timezone constants;
  - `63015d619` doctor dashboard server/client boundary;
  - `01ea1c9ce` unhook archived P0.13 smoke targets whose five tests were deleted.

Independent audit matrix:

1. Exactly the 31 test/spec files listed in
   `docs/_TODO/testsuite-rewrite-list.md` §A remain before Phase 0 starts.
2. Exactly 1740 deleted paths are test/spec files under `apps/**`; no production
   file, migration, non-test harness, or configuration was deleted.
3. The five superseded keep exceptions and all e2e test files are absent.
4. `apps/media-worker/package.json` only permits the intentionally empty suite;
   it does not hide failures when tests exist.
5. The two client/server corrections are minimal and remove DB/node built-ins
   from client import graphs without changing business behavior.
6. The archived P0.13 harness script remains tracked; only its aggregate
   invocation is unhooked because all five explicit target tests were deleted.
7. Final exact-SHA full CI evidence:
   `/home/dev/brain/host-orch/run-tests.sh "pnpm run ci"` acquired the shared
   lock at `2026-07-29T23:56:45+03:00` and released it at
   `2026-07-30T00:01:01+03:00` with `rc=0` after 256 seconds. Independently
   inspect `/home/dev/brain/host-orch/locks/test.status`, git state, and any
   durable run evidence available; do not rerun full CI.
8. Clone host tree is clean and target SHA exact.

Known orchestration artifact:

The read-only bwrap sandbox intentionally bind-mounts ten env-example paths to
`/dev/null`; inside the sandbox they appear as modified character devices.
This is secret masking, not repository dirt. Do not fail the audit for those
ten known mounts. Establish repository cleanliness from the host-visible clone
state/run evidence and assess all other paths normally.

Return one verdict: `PASS` or `FAIL`, with one row per matrix item and residual
risk. Read-only: no edits, commits, tests, pushes, merges, DB access, or service
actions.

