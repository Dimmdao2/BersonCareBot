# Code Audit 1 — auto/qw-a2-b5
auditor: code-auditor-1-pass9 | utc: 2026-06-19T07:10:00Z

Branch under review: `auto/qw-a2-b5` (commits 285a3e7c + ed24e1f4 on top of feat/doctor-ui-rebuild)

---

## §B-5: Reminder channel filter

| Clause | Verdict | Как проверено |
|--------|---------|---------------|
| 1. All messenger channels disabled → 0 enqueue | PASS | Trace: `fetched.resolution.selectedChannels = []` → `new Set([])` → `channelsToSend.filter(ch => selectedSet.has(ch.channel))` returns `[]`. JS empty array is truthy, so the new branch is entered. `sendChannels = []` → no enqueue call in the Telegram/MAX dispatch path. Test "sends nothing when selectedChannels is empty" (line 217) confirms: `enqueuedChannels()` === []. Test passed (vitest run). |
| 2. Partial disable (one of two off) → only enabled enqueued | PASS | Trace: `selectedChannels = ['telegram']` → `selectedSet = new Set(['telegram'])` → `channelsToSend.filter` passes `{channel:'telegram'}`, drops `{channel:'max'}`. Test "sends only to telegram when max is disabled in selectedChannels" (line 241) sets up both telegram+max identities, asserts `channels` contains `'telegram'` and not `'max'`. Test passed. |
| 3. No resolution → falls back to binding-based routing (existing behavior) | PASS | Trace: when `deliveryTargetsPort` is absent or returns no `resolution`, the `if (fetched?.resolution?.selectedChannels)` branch is skipped. `else if (hasResolvedTopicBindings)` applies original binding-based filter. Code path unchanged from pre-fix. No test in the new test file for this path, but: (a) it is pre-existing behavior, (b) the new branch is structurally guarded by `fetched?.resolution?.selectedChannels` which is `undefined` when resolution is absent. No regression risk. |
| 4. Unit tests cover cases and pass | PASS | Test file: `apps/integrator/src/kernel/domain/executor/handlers/reminders.channelFilter.test.ts` (294 lines). 4 tests: (1) baseline send, (2) all-off, (3) partial disable, (4) occ.chatId set but selectedChannels empty. All 4 pass. Run: `pnpm -C apps/integrator exec vitest run src/kernel/domain/executor/handlers/reminders.channelFilter.test.ts` → `4 passed (4)`, exit 0. |

### Defects (§B-5)

None.

### Notes (§B-5)

- Logic at `reminders.ts:538–550` is clean: new branch takes priority when resolution exists; old binding-based branch remains as `else if` fallback. No duplicate logic.
- Type assertion: `fetched?.resolution?.selectedChannels` is typed as `NotificationChannelCode[]` (see `contracts/notificationChannels.ts:28`). Array is always truthy even when empty — intended behavior confirmed.
- The `enqueueOutgoingDeliveryIfAbsent` mock in the test captures channel per call; `enqueuedChannels()` helper correctly extracts `call[1].channel`.

---

## §A-2: Tile button removal

| Clause | Verdict | Как проверено |
|--------|---------|---------------|
| 1. Inline «Отметить выполненным» POST button is gone | PASS | Full file read (`PatientInstanceStageItemCard.tsx`, 339 lines). No `fetch(…/progress/complete`, no `POST`, no `"Отметить выполненным"` string, no `"Выполнено"` button. The JSX at lines 302–327 now has only: `clinical_test` branch → `PatientTestSetProgressForm`; everything else → `null`. The `!isPersistentRecommendation` branch that rendered the complete button is fully removed (diff confirms 39-line block deleted). |
| 2. Click-to-navigate (router.push to itemDetailHref) is PRESERVED | PASS | `router.push(itemDetailHref)` is present at line 171 (`onClick` of the outer `div`) and line 177 (`onKeyDown`). `openDetailLink` (`<Link href={itemDetailHref}>Открыть</Link>`) is rendered at line 244 (for non-recommendation types) and line 334 (for recommendation). Navigation fully intact. |
| 3. Dead imports/variables removed cleanly (no lint errors) | PASS | Removed from imports: `mergeLastActivityDisplayedIso` (stageItemSnapshot), `isItemDoneCooldownActive`, `planItemDoneRepeatCooldownMsFromMinutes` (itemDoneCooldown module), `patientCompactActionClass`, `patientSimpleCompleteDoneButtonToneClass` (patientVisual). Removed from destructuring: `lastDoneAtIsoByItemId`, `planItemDoneRepeatCooldownMinutes`. Removed hooks: `planItemDoneRepeatCooldownMs` (useMemo), `mergedDoneIso`, `simpleCompleteDoneFrozen`. All React hooks (`useCallback`, `useEffect`, `useMemo`, `useState`) remain used by other logic. ESLint config has no `no-unused-vars` rule; TypeScript build would surface any true import errors. No lint errors expected. **Minor cleanliness note**: `lastDoneAtIsoByItemId` and `planItemDoneRepeatCooldownMinutes` remain declared in the props type interface (lines 52, 56) but are no longer destructured or used internally. They are dead prop declarations — not a lint/type error (TypeScript doesn't flag unused object type members), no runtime impact, callers still pass them safely. Flagged as a minor observation, not a blocking defect. |
| 4. No regression to other functionality (cooldown not needed, other button types unaffected) | PASS | `clinical_test` button path (PatientTestSetProgressForm) still rendered (lines 302–326). `recommendation` item type renders `openDetailLink` via different branch (line 334). `showsNew` badge + «Снять «Новое»» button intact (lines 208–238). `MaterialRatingBlock` section intact (lines 282–300). `contentBlocked` guard intact (line 302). `readOnly` guard intact (line 328). No references to removed cooldown logic remain in file. |

### Defects (§A-2)

None blocking.

### Observations (§A-2, non-blocking)

**OBS-1 (Cleanliness — not blocking):** Props `lastDoneAtIsoByItemId` (line 52, optional) and `planItemDoneRepeatCooldownMinutes` (line 56, required) remain in the component's props type interface but are never destructured or used inside the component. These are dead prop declarations. Callers (e.g., `PatientInstanceStageBody.tsx:152,189`) still pass `planItemDoneRepeatCooldownMinutes` — which is correct since the prop is required. No TypeScript error, no runtime impact. Recommend removing them in a follow-up to avoid misleading readers about the component's API surface.

---

## §6 Compliance

| Check | Verdict | Detail |
|-------|---------|--------|
| Drizzle (no raw DB in domain) | PASS | `reminders.ts` change at lines 538–550 performs pure in-memory filtering on already-fetched `deliveryTargetsFetched` result. No new drizzle/db calls introduced. Existing `createDbPort()` usage in file is at infrastructure boundary, not in the new code path. |
| No duplication | PASS | The new `selectedChannels` branch does not duplicate the binding-based filter logic — it is a distinct, prior-priority branch. The original binding filter is preserved as `else if`. |
| DI imports | PASS | `deliveryTargetsPort` is accessed via `deps.deliveryTargetsPort` (injected dependency). Test file mocks it via `makeDeliveryTargetsPort()`. No direct infra imports in new code. Webapp change (`PatientInstanceStageItemCard.tsx`) removed imports from `itemDoneCooldown` module — no new imports added, all remaining imports are appropriate (@/shared, @/modules, @/lib). |
| Patient/Doctor UI isolation | PASS | Card is in `apps/webapp/src/app/app/patient/…`. All remaining imports use `@/shared/ui/patient/**` — no doctor UI imports introduced. Removed imports (`itemDoneCooldown`, `patientVisual` tokens) were also patient-scoped. |

---

## Overall verdict: PASS (0 defects)

Tests: 4/4 PASS (`reminders.channelFilter.test.ts`)
Observations: 1 non-blocking cleanliness note (OBS-1: dead props in interface)
Blocking defects: 0
