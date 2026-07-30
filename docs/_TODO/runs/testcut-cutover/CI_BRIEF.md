# #1074 Step 1 — repo-level CI gate

Role: worker for the validation-only gate of step 1 in
`docs/_TODO/TEST_SUITE_AUDIT_2026-07-29.md`.

Target:

- exact repository commit: `34f6e7d28d180a7e84b2fde5e5f59e3bc4a3ffca`;
- the two target commits after baseline `970c5f2ac` delete legacy tests and leave
  exactly the 31 live-DB tests from `docs/_TODO/testsuite-rewrite-list.md` §A;
- do not restore deleted tests and do not add replacement tests in this stage.

Required action:

1. Confirm `git rev-parse HEAD` is the target SHA.
2. Run the full repository gate exactly through the shared mutex:

   ```bash
   /home/dev/brain/host-orch/run-tests.sh "pnpm run ci"
   ```

3. Report the exact command, exit code, and failed CI step if any.
4. If CI fails only because scripts/configuration still assumes the deleted
   legacy test/e2e files exist, make the minimum in-scope fix, rerun the
   appropriate resume/full gate through the same mutex as prescribed by the
   repository policy, and commit with `#1074`.
5. If the failure is unrelated, complex, environmental, or needs owner choice,
   do not hack around it: report it to the lead with evidence.

Constraints:

- preserve strict typing and architecture;
- do not touch production behavior to satisfy an obsolete test;
- do not push or merge;
- do not touch other clones or the main working tree;
- do not investigate or modify the ten env-example paths that appear as
  `/dev/null` character devices inside the orchestration sandbox: this is the
  orchestrator's secret-masking mount. On the host, `fmtcut` is clean and those
  paths are ordinary tracked `100644` blobs. Treat this as an environment
  artifact unless it directly prevents the required command from running.

