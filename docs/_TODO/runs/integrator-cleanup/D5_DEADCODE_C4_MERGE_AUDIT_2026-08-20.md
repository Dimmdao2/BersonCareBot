# D5 / D10a merge-resolution audit — 2026-08-20

Audited merge: `5195de501740829aff96482d1374d2860068aed9`  
Parents: `9c12d3285ed35c33b4e0532be8396adfe5630841`, `7ae0d8a4b1f7c22521b67ed209bdb1793e473257`  
Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, D5 / D20 item 2.  
Verdict: **PASS**. Kill score: **убито 6, не поймано 0**.

## 1. Conflict seam and deleted methods

`git show --remerge-diff --stat --oneline HEAD` exited `0` and reported one resolution file,
`apps/integrator/src/infra/adapters/webappEventsClient.ts`, with 108 deletions. The remerge diff reconstructs
one conflict hunk: parent 1 retained `emit`, parent 2 retained `syncSupportUserMessage`; the merge result retains
neither block and resumes at `setSupportStatus`.

Final-tree searches:

```text
rg ... '\bsyncSupportUserMessage\b' apps                                  exit 1
rg ... '\bWebappEventBody\b' apps/integrator                              exit 1
rg '\bemit\b' apps/integrator/src/kernel/contracts/ports.ts               exit 1
rg '\bemit\b' apps/integrator/src/infra/adapters/webappEventsClient.ts     exit 1
rg executable webappEventsPort.emit call in apps/integrator/src             exit 1
```

There is no deleted port member, adapter method, executable caller, or test reference. A broader lexical search
for `webappEventsPort.emit()` has one non-executable stale comment at
`apps/integrator/src/infra/db/directPublic/writeSupportQuestionsDirect.ts:6`; no import, type, method, or call is
attached to it. A generic test-text search also finds the English verb “emit” in an assertion message at
`executeActionBookingMiniAppRemoval.unit.test.ts:126`; it is not the removed port method.

## 2. Neighbouring live methods and fault injection

The final port and adapter both retain all twelve required methods:

`setSupportStatus`, `syncSupportQuestionWrite`, `syncSupportDeliveryAttempt`, `applySupportAdminReply`,
`wakeOperatorHealthDigest`, `wakeSystemHealthGuard`, `wakePatientReminderMaterialization`,
`beginProgramNoteReply`, `notifyPatientWebPush`, `materializeAppointmentReminders`, `completeChannelLink`,
`completePhoneMessengerBind`.

One-time mutation: changed the `wakePatientReminderMaterialization` URL suffix from `materialize-wake` to
`materialize-wake-broken-audit`, then ran:

```text
pnpm --dir apps/integrator exec vitest run src/infra/adapters/webappEventsClient.materializeWake.test.ts
exit 1
```

The exact assertion at `webappEventsClient.materializeWake.test.ts:42` failed, showing expected
`.../materialize-wake` and received `.../materialize-wake-broken-audit`. The mutation was reverted. Proof of
cleanup:

```text
git diff --exit-code HEAD -- apps/integrator/src/infra/adapters/webappEventsClient.ts  exit 0
rg --fixed-strings 'materialize-wake-broken-audit' apps/integrator/src                exit 1
```

The final required adapter/kernel suite then passed 17 files and 95 tests.

## 3. Historical reachability of `syncSupportUserMessage`

There was a real historical caller, but it was removed before the audited deletion:

- `a69aa0283` introduced `mirrorPatientUserMessageToWebapp`; its tree contains the import at
  `supportRelay.ts:29` and the real call at `supportRelay.ts:139`.
- `4a3c89ca7` deleted `supportRelay.ts` in full. Its resulting tree contains only the declaration of
  `mirrorPatientUserMessageToWebapp`, with no caller.
- `git grep` at `9c12d3285^` finds `syncSupportUserMessage` only in the port declaration, adapter implementation,
  and the property lookup inside the already-unreachable mirror. The separate exact mirror search at the same
  tree finds only the mirror declaration.

Therefore the method had historical use, but no live path existed immediately before `9c12d3285`; the audited
merge did not delete live behaviour.

## 4. Orphan `buildIntegratorEventsHttpBody`

Fact: it is dead in the final tree. Exact search exits `0` with exactly one match, its export declaration at
`apps/integrator/src/infra/adapters/jsonStableStringify.ts:53`; there is no caller.

Provenance: this is inherited from already-landed D10 stage 1, not created by merge `5195de501`.
`git grep` at `7ae0d8a4b^1` finds the declaration, adapter import, and two adapter calls. At `7ae0d8a4b`, only the
declaration remains. The D10 merge diff removes the import and the `emit` body while leaving
`jsonStableStringify.ts` unchanged. No fix was made because item 4 explicitly excludes it from this scope.

## 5. Boundaries and surviving branch work

`git show --remerge-diff --format= --name-only HEAD` exits `0` and lists only
`apps/integrator/src/infra/adapters/webappEventsClient.ts`. Path-filtered remerge inspection is empty for
`apps/webapp/db/drizzle-migrations/` and `deploy/postgres/privileges/`; `-G` inspection is empty for
`GRANT|REVOKE|CREATE ROLE|ALTER ROLE|ALTER DEFAULT PRIVILEGES|CREATE POLICY`.

```text
git diff --exit-code 9c12d3285 HEAD -- \
  deploy/postgres/c4-operational-runtime.sql \
  docs/_TODO/runs/integrator-cleanup/D5_DEADCODE_C4_ALIGN_2026-08-20.md
exit 0
```

Thus the C4 generator alignment and the original branch report are byte-for-byte unchanged by the merge.

## 6. Required gates

```text
pnpm --dir apps/integrator typecheck                                      exit 0
pnpm --dir apps/integrator exec vitest run src/infra/adapters src/kernel  exit 0 (17 files, 95 tests)
pnpm --dir apps/integrator exec eslint src --max-warnings=0               exit 0
git diff --check                                                          exit 0
```

Full repository CI was not run: the brief supplies the complete one-application audit gate, and no uncovered
repo-level risk was identified under `AGENTS.md` §9.

## Result by kill-set item

1. Resurrection of `emit` / `syncSupportUserMessage`: PASS.
2. Accidental deletion of neighbouring methods: PASS; mutation caught, then reverted.
3. Live caller at deletion time: PASS; historical caller existed, but was removed by `4a3c89ca7` before cleanup.
4. Hidden orphan builder: FACT CONFIRMED; inherited from `7ae0d8a4b` (D10 stage 1), outside scope.
5. Forbidden migration / privilege changes: PASS; none in the manual resolution diff.
6. C4 alignment and prior report survival: PASS; unchanged from `9c12d3285`.

