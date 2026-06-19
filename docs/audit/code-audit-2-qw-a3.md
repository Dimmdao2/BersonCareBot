# Code Audit 2 — QW-A3 — Icon Row in Patient Item Tile (post-fix re-audit)
- auditor: audit2-qw-a3 (independent Sonnet 4.6 subagent, 2026-06-19)
- commits audited: 9ea67baa (feat), 9c810a11 (fix appDisplayTimeZone ungrouped), 6f1937a1 (fix lastDoneAtIsoByItemId ungrouped)
- prior defects from audit-1 (A3-08) and interim audit-2 (B3 + appDisplayTimeZone addendum): ALL fixed

## Data-flow trace

```
PatientTreatmentProgramStagePageClient
  → appDisplayTimeZone (prop, required string)
  → effectiveLastDoneAtIsoByItemId (state, Record<string, string>)

  Path A — archive/readOnly stage:
    PatientInstanceStageBody
      appDisplayTimeZone={appDisplayTimeZone}       ← passed (line 441)
      lastDoneAtIsoByItemId NOT passed              ← intentional: readOnly surface,
                                                       itemInteraction="readOnly", no live
                                                       checklist data; cards will silently
                                                       receive undefined → lastIso=null
      PatientInstanceStageItemCard (grouped)        ← lines 159-160: both props passed
      PatientInstanceStageItemCard (ungrouped)      ← lines 198-199: both props passed ✓

  Path B — active program (primary surface):
    PatientTreatmentProgramStagePageProgramSection
      lastDoneAtIsoByItemId={effectiveLastDoneAtIsoByItemId}  ← passed (line 539)
      appDisplayTimeZone={appDisplayTimeZone}                 ← passed (line 541)
      (this component handles its own card rendering; not PatientInstanceStageBody)
```

## Clauses

| # | Clause | Status | Notes |
|---|--------|--------|-------|
| C1 | Old "Отметок в журнале за сегодня: N" block removed | PASS | `grep` returns empty — string is completely absent from `PatientInstanceStageItemCard.tsx`. |
| C2 | Icon row rendered for non-recommendation items only | PASS | Entire `<div>` at card line 279 is inside `{item.itemType !== "recommendation" ? (...) : null}`. |
| C3 | Comment icon (MessageCircle) with count badge, null-safe | PASS | Guard `(discussionSummary?.totalCount ?? 0) > 0` — hidden when prop is undefined or totalCount is 0. Count rendered as `tabular-nums` span. |
| C4 | Unread dot shown only when unreadCount > 0 | PASS | Inner guard `(discussionSummary?.unreadCount ?? 0) > 0`; rendered as `bg-destructive` pill. |
| C5 | AlertTriangle shown only when snapshot.contraindications is truthy | PASS | `Boolean((item.snapshot as Record<string, unknown>)?.contraindications)` — safe cast, handles null/""/undefined as falsy. |
| C6 | PatientProgramItemExecutionRow variant="tile" is valid | PASS | Component declares `variant?: "tile" \| "itemPage"` with default `"tile"`. Tile branch renders label + ExecutionDots (lines 93-101). |
| C7 | appDisplayTimeZone threaded through BOTH grouped AND ungrouped loops in PatientInstanceStageBody | PASS | Fix commit 9c810a11 confirmed: grouped path line 159, ungrouped path line 198 — both present. |
| C8 | lastDoneAtIsoByItemId threaded through BOTH grouped AND ungrouped loops in PatientInstanceStageBody | PASS | Fix commit 6f1937a1 confirmed: grouped path line 160, ungrouped path line 199 — both present. Prop added to PatientInstanceStageBody interface (line 56) and destructured (line 78). |
| C9 | PatientTreatmentProgramStagePageClient passes appDisplayTimeZone to PatientInstanceStageBody | PASS | Line 441 confirmed. |
| C10 | PatientTreatmentProgramStagePageClient passes lastDoneAtIsoByItemId to PatientInstanceStageBody | NOTE | NOT passed at the archive-path PatientInstanceStageBody call (lines 424-442). This is intentional: that call uses `itemInteraction="readOnly"` for past stages where no live checklist data applies. Cards receive `undefined` → `lastIso=null` → execution dots show "no done today" state (gray dots). Correct behavior for an archive view. Not a defect. |
| C11 | All new props optional — backward compat maintained | PASS | `discussionSummary?`, `appDisplayTimeZone?`, `lastDoneAtIsoByItemId?` all optional in PatientInstanceStageItemCard interface. PatientInstanceStageBody interface likewise optional. Omitting at call sites causes no TS error and safe defaults (icons/dots hidden). |
| C12 | TypeScript compiles clean | PASS | `tsc --noEmit -p apps/webapp/tsconfig.json` exits rc=0 (8s, no errors). |
| C13 | No hand-rolled icons where shared ones exist (§6) | PASS | `MessageCircle` and `AlertTriangle` are from `lucide-react` (standard shared icon library for this codebase). `PatientProgramItemExecutionRow` and `ExecutionDots` are shared components. No duplication. |

## Edge cases verified

- **null discussionSummary**: `(undefined?.totalCount ?? 0) > 0` → false — icon row renders empty (but div still present; see note below).
- **0 totalCount**: same guard → hidden. Correct.
- **no contraindications**: `Boolean(undefined)` → false → AlertTriangle hidden. Correct.
- **missing appDisplayTimeZone**: `{undefined ? ... : null}` → execution row suppressed entirely. Correct.
- **lastDoneAtIsoByItemId undefined**: `undefined?.[item.id] ?? null` → null passed as `lastIso`. PatientProgramItemExecutionRow handles null `lastIso` cleanly (shows "not done" label + gray dots). No crash.
- **Empty icon row div**: When all three children are null (no summary, no contraindications, no timezone), the `<div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">` still renders, adding ~4px top margin. Cosmetic-only; not a DoD blocker.

## OVERALL: PASS

All DoD requirements met. Both defects from prior audits (A3-08: appDisplayTimeZone missing from ungrouped path; B3: lastDoneAtIsoByItemId not wired through PatientInstanceStageBody) were fixed in commits 9c810a11 and 6f1937a1 respectively. Data flow is complete through both grouped and ungrouped render loops. TypeScript clean. Old text gone. Icon row renders all three elements with correct null-guards. Backward compat preserved.

**One non-blocking cosmetic note**: Empty icon row div renders when all three elements are null (adds small top margin on non-recommendation items with no comments/contraindications/timezone). Acceptable.
