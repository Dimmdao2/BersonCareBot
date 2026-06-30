# Re-Audit 1 — QW-A3 — After Fix Commit 6f1937a1
- auditor: reaudit1-qw-a3c
- date: 2026-06-19

## Fix verification

| Issue | Fixed? | Evidence |
|---|---|---|
| A3-08 (audit-1): `appDisplayTimeZone` missing from ungrouped-items `PatientInstanceStageItemCard` call | YES | Line 198 in PatientInstanceStageBody.tsx: `appDisplayTimeZone={appDisplayTimeZone}` |
| B3 (audit-2): `lastDoneAtIsoByItemId` never passed to any `PatientInstanceStageItemCard` through `PatientInstanceStageBody` | YES | Line 199 in PatientInstanceStageBody.tsx: `lastDoneAtIsoByItemId={lastDoneAtIsoByItemId}` |

## Clause-by-clause results

| Clause | Check | Result | Evidence |
|---|---|---|---|
| 1 | GROUPED call has `appDisplayTimeZone={appDisplayTimeZone}` | PASS | PatientInstanceStageBody.tsx line 159 |
| 1 | GROUPED call has `lastDoneAtIsoByItemId={lastDoneAtIsoByItemId}` | PASS | PatientInstanceStageBody.tsx line 160 |
| 2 | UNGROUPED call has `appDisplayTimeZone={appDisplayTimeZone}` | PASS | PatientInstanceStageBody.tsx line 198 |
| 2 | UNGROUPED call has `lastDoneAtIsoByItemId={lastDoneAtIsoByItemId}` | PASS | PatientInstanceStageBody.tsx line 199 |
| 3 | Props interface declares `appDisplayTimeZone?: string` | PASS | PatientInstanceStageBody.tsx line 54 |
| 3 | Props interface declares `lastDoneAtIsoByItemId?: Readonly<Record<string, string>>` | PASS | PatientInstanceStageBody.tsx line 56 |
| 4 | Both destructured in function body | PASS | PatientInstanceStageBody.tsx lines 77–78 |
| 5a | `MessageCircle` shown only when `totalCount > 0` | PASS | PatientInstanceStageItemCard.tsx line 281: `(discussionSummary?.totalCount ?? 0) > 0` |
| 5b | Unread dot shown when `unreadCount > 0` | PASS | PatientInstanceStageItemCard.tsx line 285: `(discussionSummary?.unreadCount ?? 0) > 0` |
| 5c | `AlertTriangle` for contraindications | PASS | PatientInstanceStageItemCard.tsx line 290–292 |
| 5d | Execution row rendered when `appDisplayTimeZone` is provided | PASS | PatientInstanceStageItemCard.tsx line 293: `{appDisplayTimeZone ? (` |
| 6 | TypeScript clean | PASS | `tsc --noEmit` exited with no output (zero errors) |

## Notes

- `PatientTreatmentProgramStagePageClient.tsx` correctly passes both `appDisplayTimeZone` and `lastDoneAtIsoByItemId` (`effectiveLastDoneAtIsoByItemId`) through `PatientTreatmentProgramStagePageProgramSection` (lines 539–541), which is the live interactive path.
- The `pastReadOnly` branch at line 424–444 passes `appDisplayTimeZone` but omits `lastDoneAtIsoByItemId` — this is intentional: the read-only past-stage view uses `todayCountByStageItemId={undefined}` and `doneItemIds={[]}`, so execution-dot cooldown data is irrelevant.
- Both grouped and ungrouped item card renders now receive both props consistently.

## OVERALL: PASS
