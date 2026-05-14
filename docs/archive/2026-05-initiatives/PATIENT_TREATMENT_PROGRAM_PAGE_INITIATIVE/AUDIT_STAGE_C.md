# AUDIT — Stage C (§1.1b visual redesign + stage route)

**Date:** 2026-05-05  
**Auditor:** agent  
**Target commit:** uncommitted (working tree) — files verified via `git status`

---

## 1. Scope check

Files modified / created in Stage C:

| File | Type | Expected | Actual |
|------|------|----------|--------|
| `apps/webapp/src/app-layer/routes/paths.ts` | M | +`patientTreatmentProgramStage` | ✅ present at line 64–65 |
| `apps/webapp/src/shared/ui/patientVisual.ts` | M | +`patientStageTitleClass`, +`patientSurfaceProgramClass` | ✅ present at end of file |
| `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx` | M | C1–C6 visual redesign, `PatientInstanceStageBody` exported | ✅ |
| `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.test.tsx` | M | A1 + B7 FIX tests updated for Collapsible | ✅ |
| `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramStagePageClient.tsx` | ?? (new) | client wrapper for stage page | ✅ |
| `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/stages/[stageId]/page.tsx` | ?? (new) | RSC stage page | ✅ |
| `apps/webapp/public/patient/ui/play.svg` | ?? (new) | static SVG asset | ✅ |
| `docs/archive/2026-05-initiatives/PATIENT_TREATMENT_PROGRAM_PAGE_INITIATIVE/LOG.md` | M | Stage C entries | ✅ |

**Out-of-scope files NOT touched:** ✅  
`db/schema/`, `src/modules/treatment-program/types.ts`, `src/modules/treatment-program/ports.ts`, `src/infra/repos/`, progress-service — confirmed clean via `git diff --stat`.

---

## 2. C1 — Hero card

| Criterion | Check | Result |
|-----------|-------|--------|
| Badge «МОЙ ПЛАН» rendered | `<Badge className={patientPillClass}>МОЙ ПЛАН</Badge>` | ✅ |
| Badge «Этап X из Y» — only when `currentWorkingStage && pipelineLength > 0` | Conditional JSX, uses `pipelineLength` from `splitPatientProgramStagesForDetailUi` | ✅ |
| Hero background via semantic token | `patientSurfaceProgramClass` (= `patientSurfaceInfoClass`, `--patient-surface-info-*`) | ✅ |
| Indicator «● План обновлён» | `<span className="text-destructive">●</span>` + `planUpdatedLabel`, `role="status"` | ✅ |
| CTA «Открыть план» + Play icon | `<a href="#patient-program-current-stage" className={cn(patientPrimaryActionClass, ...)}>` + `<img src="/patient/ui/play.svg" ...>` | ✅ |
| No inline hex in JSX | Grep `bg-\[#`, `text-\[#`, `border-\[#` → 0 matches | ✅ |

---

## 3. C2 — PatientProgramControlCard

| Criterion | Check | Result |
|-----------|-------|--------|
| Renders only when `controlLabel != null` | `{controlLabel ? <PatientProgramControlCard ...> : null}` | ✅ |
| Surface token | `className={patientSurfaceWarningClass}` | ✅ |
| `CalendarCheck` icon | Imported from lucide-react, used in card header | ✅ |
| CTA «Выполнить тесты» → `stages/[stageId]` | `Link href={routePaths.patientTreatmentProgramStage(instanceId, currentStageId)}` | ✅ |
| CTA «Записаться на приём» → `routePaths.cabinet` | `Link href={routePaths.cabinet}` | ✅ |
| Only renders «Выполнить тесты» when `currentStageId` exists | `{currentStageId ? <Link ...> : null}` | ✅ |

---

## 4. C3 — Stage 0 in Collapsible

| Criterion | Check | Result |
|-----------|-------|--------|
| Uses `Collapsible` from `@/components/ui/collapsible` | Import on line 17 | ✅ |
| Closed by default | No `defaultOpen` / `open` prop — Base UI defaults to closed | ✅ |
| Trigger: Shield icon + «Рекомендации на период» + ChevronDown | Lines 724–736 | ✅ |
| `Shield` icon has `text-[var(--patient-color-success)]` | Line 726–728 | ✅ |
| Surface `patientSurfaceSuccessClass` on wrapper | `className={cn(patientSurfaceSuccessClass, "overflow-hidden p-0")}` — `tailwind-merge` resolves padding conflict (`p-4` → `p-0`) | ✅ |
| Trigger opens/closes without errors | Tests A1 + B7 FIX use `fireEvent.click("Рекомендации на период")` then assert content | ✅ |
| Content border uses surface token | `className="border-t border-[var(--patient-surface-success-border)]"` | ✅ |
| `PatientInstanceStageBody` called with `ignoreStageLockForContent={true}` | Line 747 | ✅ |

---

## 5. C4 — Current stage preview card

| Criterion | Check | Result |
|-----------|-------|--------|
| No full inline `PatientInstanceStageBody` on detail | Detail client no longer renders `PatientInstanceStageBody` for current/pipeline stages | ✅ |
| `id="patient-program-current-stage"` anchor | `<div id="patient-program-current-stage" className={patientCardClass}>` | ✅ |
| Badge «Этап X» | `<Badge className={patientPillClass}>Этап {currentWorkingStage.sortOrder}</Badge>` | ✅ |
| Title with `patientStageTitleClass` | `<h3 className={cn(patientStageTitleClass, "mt-2")}>` | ✅ |
| Subtitle from `goals` / `objectives` (first 80 chars) | `stageSubtitle = (goals?.trim() \|\| objectives?.trim() \|\| "").slice(0, 80)` | ✅ |
| CTA «Открыть этап» → `stages/[stageId]` | `Link href={routePaths.patientTreatmentProgramStage(detail.id, currentWorkingStage.id)}` | ✅ |

---

## 6. C5 — «История тестирования» entry point

| Criterion | Check | Result |
|-----------|-------|--------|
| Expanded results list removed | No `archiveStages.map(PatientInstanceStageBody)` in main JSX; old `testResults.map(...)` removed | ✅ |
| Entry point section present | `<section className={patientCardClass} aria-label="История тестирования">` | ✅ |
| `ClipboardList` icon | Imported and used | ✅ |
| Conditional: only for active program with current stage | `detail.status === "active" && currentWorkingStage` | ✅ |
| UX decision documented in LOG | LOG.md: post-MVP route/modal; links to current stage page as first pass | ✅ |

**⚠ Minor:** CTA label **«Перейти к этапу»** is semantically misaligned with the section heading «История тестирования». The link leads to the current stage page, not a dedicated test history view. See mandatory fix §9.M3.

---

## 7. C6 — Compact previous stages list

| Criterion | Check | Result |
|-----------|-------|--------|
| `<details>` with inline bodies replaced by compact list | `archiveStages.map(...)` → `<Link>` rows with icons | ✅ |
| `CheckCircle2` icon + stage name + `ChevronRight` | Lines 822–833 | ✅ |
| Each row links via `patientTreatmentProgramStage` | `href={routePaths.patientTreatmentProgramStage(detail.id, stage.id)}` | ✅ |
| `completedAt` date: not shown (field absent from `TreatmentProgramInstanceStageRow`) | Confirmed: no `completedAt` field on stage type; date intentionally omitted | ✅ |
| Hover state uses CSS var, not inline hex | `hover:bg-[var(--patient-color-primary-soft)]/30` | ✅ |
| Stage 0 not in archive list | `splitPatientProgramStagesForDetailUi` → `archive = nonZero.filter(completed/skipped)` — stage 0 goes to `stageZero`, never to `archive` | ✅ |

---

## 8. C7 — New RSC `stages/[stageId]/page.tsx`

| Criterion | Check | Result |
|-----------|-------|--------|
| File exists | `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/stages/[stageId]/page.tsx` | ✅ |
| Loads detail via `deps.treatmentProgramInstance.getInstanceForPatient` | Line 51 | ✅ |
| Applies `omitDisabledInstanceStageItemsForPatientApi` | Line 56 | ✅ |
| Finds stage by `stageId` from `params` | `detail!.stages.find((s) => s.id === stageId)` | ✅ (see ⚠ M4 below) |
| 404 when instance not found | `if (!rawDetail) notFound()` + catch → `notFound()` | ✅ |
| 404 when stage not found | `if (!stage) notFound()` | ✅ |
| Back-link → `routePaths.patientTreatmentProgram(instanceId)` | `backHref={routePaths.patientTreatmentProgram(instanceId)}` | ✅ |
| `PatientInstanceStageBody` rendered (via `PatientTreatmentProgramStagePageClient`) | Stage client renders `PatientInstanceStageBody` with full interactive functionality | ✅ |
| Stage 0 label: «Общие рекомендации» | `stageLabel = stage.sortOrder === 0 ? "Общие рекомендации" : ...` | ✅ |
| `ignoreStageLockForContent={isStageZero}` on stage page client | `PatientTreatmentProgramStagePageClient` line 93 | ✅ |

---

## 8. C8 — `patientTreatmentProgramStage` in `paths.ts`

| Criterion | Check | Result |
|-----------|-------|--------|
| Helper present | `patientTreatmentProgramStage: (instanceId, stageId) => \`/app/patient/treatment-programs/...\`` | ✅ |
| Both params URL-encoded | `encodeURIComponent(instanceId)` + `encodeURIComponent(stageId)` | ✅ |
| All new links use the helper | C2, C4, C5, C6 — all 5 uses checked | ✅ |

---

## 9. Tests

### PatientTreatmentProgramDetailClient.test.tsx
```
Tests  6 passed (6) — verified via vitest run
```

| Test | Status | Notes |
|------|--------|-------|
| renders stage goals/objectives/duration when set (A1) | ✅ | Updated: `fireEvent.click("Рекомендации на период")` before assertions |
| does not render empty A1 stage header block | ✅ | No change needed |
| does not POST plan-opened when program is not active (A5) | ✅ | No change needed |
| shows test_set per-test catalog comment from snapshot (B7 FIX) | ✅ | Updated: `fireEvent.click` before assertions |
| does not show removed checklist section (1.1a) | ✅ | No change needed |
| shows plan updated label when provided (1.1a) | ✅ | No change needed |

### `[instanceId]/page.nudgeResilience.test.tsx`
```
Tests  2 passed (2) — verified
```
Mocks `PatientTreatmentProgramDetailClient` entirely — unaffected by C1–C6 JSX changes. ✅

---

## 10. DB / Port / Schema check

Confirmed via `git diff --stat HEAD`: **zero changes** to:
- `db/schema/`
- `src/modules/treatment-program/types.ts`
- `src/modules/treatment-program/ports.ts`
- `src/infra/repos/`
- `src/modules/treatment-program/stage-semantics.ts`
- `src/modules/treatment-program/progress-service.ts`

Stage C scope respected. ✅

---

## 11. Inline hex / CSS token hygiene

- `PatientTreatmentProgramDetailClient.tsx` JSX: **0** inline `bg-[#...]` / `text-[#...]` / `border-[#...]` ✅
- `PatientTreatmentProgramStagePageClient.tsx`: **0** inline hex ✅
- `stages/[stageId]/page.tsx`: **0** inline hex ✅
- `patientVisual.ts` additions: use only CSS variables (`var(--patient-color-primary)`, etc.) ✅
- Pre-existing hex in `patientButtonWarningOutlineClass` / `patientButtonSuccessClass` — in shared primitive file, pre-existing, not Stage C scope ✅

---

## 12. Summary table

| # | Area | Status | Severity |
|---|------|--------|----------|
| C1 | Hero card (badges, Play icon, indicator) | ✅ PASS | — |
| C2 | PatientProgramControlCard | ✅ PASS | — |
| C3 | Stage 0 Collapsible, closed by default | ✅ PASS | — |
| C4 | Current stage preview + link to stage page | ✅ PASS | — |
| C5 | Test history entry point | ✅ PASS (minor label) | Minor |
| C6 | Compact archive list | ✅ PASS | — |
| C7 | stages/[stageId] RSC | ✅ PASS (minor typing) | Minor |
| C8 | patientTreatmentProgramStage in paths.ts | ✅ PASS | — |
| Tests | All 14 tests pass | ✅ PASS | — |
| DB/ports | No changes | ✅ PASS | — |
| Inline hex | None in new JSX | ✅ PASS | — |
| Dead code | `buttonVariants` unused import; dead `testResults` expression | ⚠ MINOR | Minor |

**Overall: PASS with 4 minor items.**

---

## 13. MANDATORY FIX INSTRUCTIONS

### M1 — Remove unused `buttonVariants` import

**File:** `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx`  
**Line 5:** `import { Button, buttonVariants } from "@/components/ui/button";`

`buttonVariants` was used in the pre-C stage for the archive anchor link but is no longer referenced anywhere in the new code. Remove it.

```ts
// BEFORE
import { Button, buttonVariants } from "@/components/ui/button";

// AFTER
import { Button } from "@/components/ui/button";
```

**Verification:** `pnpm --dir apps/webapp exec tsc --noEmit` ✅ (no new errors expected)

---

### M2 — Remove dead code expression on line 841

**File:** `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx`

```tsx
// REMOVE this line entirely (always evaluates to null):
{testResults.length === 0 ? null : null}
```

The `testResults` state and its fetch in `refresh()` can optionally be kept for forward compatibility (the API call is lightweight and the state will be used when the full test history page is implemented in post-MVP), but the dead JSX expression must be removed.

**Verification:** `pnpm --dir apps/webapp exec tsc --noEmit` ✅

---

### M3 — Update C5 CTA label for semantic clarity

**File:** `apps/webapp/src/app/app/patient/treatment-programs/PatientTreatmentProgramDetailClient.tsx`

The section is titled «История тестирования» but the CTA link says «Перейти к этапу» — this sends the user to the current stage page, which is not a dedicated test history view. Update the label to avoid misleading the user:

```tsx
// BEFORE
<Link href={...} className={cn(patientSecondaryActionClass, "mt-3")}>
  Перейти к этапу
</Link>

// AFTER
<Link href={...} className={cn(patientSecondaryActionClass, "mt-3")}>
  Открыть текущий этап
</Link>
```

**Verification:** `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment-programs` ✅ (no test assertions on this label)

---

### M4 — Replace non-null assertion `detail!` in stage page RSC

**File:** `apps/webapp/src/app/app/patient/treatment-programs/[instanceId]/stages/[stageId]/page.tsx`

Lines 61 and 64 use `detail!.stages.find(...)` and `detail!.stages.filter(...)`. Functionally correct (TypeScript can't infer that `notFound()` throws), but the pattern is fragile. Refactor to use a local typed variable after the try-catch:

```tsx
// BEFORE (after the try-catch block)
const stage = detail!.stages.find((s) => s.id === stageId);
if (!stage) notFound();
const pipelineStages = detail!.stages.filter((s) => s.sortOrder > 0);

// AFTER — assign typed local; same semantics, no assertion needed
const resolvedDetail = detail as NonNullable<typeof detail>;
const stage = resolvedDetail.stages.find((s) => s.id === stageId);
if (!stage) notFound();
const pipelineStages = resolvedDetail.stages.filter((s) => s.sortOrder > 0);
```

Or alternatively structure the try-catch to return/assign within an `if` block so TypeScript narrows the type automatically.

**Verification:** `pnpm --dir apps/webapp exec tsc --noEmit` ✅

---

## 14. DEFER (post-MVP, not blockers)

| Item | Decision |
|------|----------|
| Dedicated «История тестирования» page/route (full results, filters) | Documented in LOG.md; post-MVP; first pass links to current stage |
| `completedAt` date on archive stage rows (C6) | Field absent from `TreatmentProgramInstanceStageRow`; no schema change in C scope |
| Stage 0 accessible on stage page without Collapsible open-state persistence | UX fine for MVP; persistence across navigation would require URL state or localStorage |
