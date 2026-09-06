# Patient Work3 — independent closing review of the final-CI correction

Reviewed commit: `913d69385 fix(patient): close media and booking CI gaps` on `wt/patient-work3-20260906`,
at current HEAD `7a512be1c` (merge of `feat/doctor-ui-rebuild` into the workstream branch).
Reviewer did not modify product code or tests. Nothing pushed, nothing landed.

## Verdict

**PASS** — all five verification points hold. No finding.

A finding here would need a reachable regression against the two exact CI failures
(`AGENTS.md` §24.6). None exists: both formerly red oracles are green, and the only changed
runtime branch is field-for-field equivalent to what it replaced. Three observations are recorded
in §7; none of them is in owner scope, so none becomes work.

## 0. Classification before opening tests (§24.4, §10a, §10b)

| Item | Nature | Proof chosen |
|---|---|---|
| 1, 2, 4 red oracles | repeated behavior/security | rerun the two exact existing red oracles + retained discussion/modal tests; no test written or modified |
| 1, 2 seam shape | one-time integration shape | diff/port-boundary inspection of the three changed paths and of the union discriminator against every producer |
| 3 blast radius | one-time action | `git show --name-only` + `git diff` of merge vs correction; not a source-text/count test |

## 1. Scope statement — what belongs to this correction

`git show --name-only --format= 913d69385` returns exactly three paths:

```
apps/webapp/src/app/app/patient/treatment/ProgramItemDiscussionMessageBody.tsx
apps/webapp/src/infra/repos/publicBookingDoors.unit.test.ts
apps/webapp/src/shared/ui/patient/PatientCatalogMediaStaticThumb.tsx
```

HEAD is a merge, so the tree at HEAD also contains the **already-accepted** clinical appointment
overlap workstream (declaration, generated privileges SQL, booking-engine route, doctor calendar
files). That content arrived through `7a512be1c`/`3a6117035`, **not** through this correction, and is
out of this review. Confirmed disjoint:

```
$ git diff 913d69385 HEAD --stat -- <the three reviewed paths>
(empty)
```

`git status --porcelain` → empty before and after the review; the only commit added by this pass is
this artifact.

## 2. Point 1 — the patient discussion callsite no longer crosses the recommendations boundary

`ProgramItemDiscussionMessageBody.tsx:49` previously typed the video poster as
`import('@/modules/recommendations/types').RecommendationMediaItem` and built a
`mediaType`/`mediaUrl`/`sortOrder` literal. It now types it `MediaPreviewUiModel | null` and builds
that shape directly.

- **No new import.** `import type { MediaPreviewUiModel } from '@/shared/ui/patient/media/mediaPreviewUiModel'`
  already existed at line 9 (it types `imagePreview`). The correction reuses the existing shared
  presentation model rather than adding a second one — §5 "один общий проход" satisfied by parameter,
  not by a new door.
- **No dynamic reference left.** No `import('@/modules/recommendations/...')` and no
  `RecommendationMediaItem` remains anywhere in the file.
- **Poster is already loaded.** `playback` comes from the existing
  `useDiscussionMessageMediaPlayback(mediaId)` hook; the correction reads `playback.posterUrl`
  from the value already in hand. No DB access, no new fetch, no new port.

Why the census went red before, measured rather than assumed. `assertPatientCallsiteDoors`
(`deploy/postgres/privileges/access-census.mjs`) flags a declared `codePath` that is (a) in
`patientOnlyModules()` and (b) names the relation in code after string literals are stripped by
`namesRelationInCode`. Replaying that exact predicate on both revisions:

```
$ node /tmp/probe_names.mjs <old file> <new file> ...   # replica of namesRelationInCode + relationCodePatterns
/tmp/OLD_body.tsx                        => match: true
  ctx: "... the user '' image '' failed '' pending '' @/modules/recommendations/types '' video ..."
apps/.../ProgramItemDiscussionMessageBody.tsx  => match: false
apps/.../PatientCatalogMediaStaticThumb.tsx    => match: false
apps/.../patient/media/mediaPreviewUiModel.ts  => match: false
apps/.../PatientTreatmentTabRecommendations.tsx => match: false
```

The old file matched on the bare token `recommendations`; the new file has no such token at all.
The file is still patient-only (`patientOnlyModules()` at HEAD lists it, 399 modules total), so the
gate is still *evaluating* this callsite — it passes on substance, not because the callsite dropped
out of the check.

## 3. Point 2 — `PatientCatalogMediaStaticThumb` widened without a second renderer

Prop is now `RecommendationMediaItem | MediaPreviewUiModel | null`; the body branches once,
`const ui = 'kind' in media ? media : recommendationMediaItemToPreviewUi(media)`, and then renders
**the same single** `MediaThumb`. No second media renderer, no DB access, no new component.

The discriminator is sound at type level and at runtime:

- `RecommendationMediaItem` (`modules/recommendations/types.ts:4`) declares
  `mediaUrl`/`mediaType`/`sortOrder`/`previewSmUrl`/`previewMdUrl`/`previewStatus`/`standardRendition`
  — no `kind`. `MediaPreviewUiModel` declares `kind` as required. TypeScript `in`-narrowing therefore
  splits the union exactly.
- No producer can smuggle a stray `kind` at runtime: `parseCatalogMediaRows`
  (`stageItemSnapshot.ts:68`) builds an allow-listed literal field by field rather than spreading the
  raw row; `dailyWarmupListImageToMedia` (`PatientDailyWarmupQuickList.tsx:21`), `normalizeMedia` in
  `pgRecommendations.ts:28` and `inMemoryRecommendations.ts:29` do the same.

All seven previous consumers still compile and still take the `recommendationMediaItemToPreviewUi`
path (they pass `RecommendationMediaItem | null`):

```
PatientTreatmentProgramStageRecommendationsCollapsible.tsx:88
PatientTreatmentProgramStagePageProgramSection.tsx:617
PatientTreatmentTabRecommendations.tsx:87
PatientStageCompositionList.tsx:102
program-detail/PatientInstanceStageItemCard.tsx:227
content/[slug]/PatientDailyWarmupQuickList.tsx:72
treatment/ProgramItemDiscussionMessageBody.tsx:76   (the one new MediaPreviewUiModel consumer)
```

**The changed video branch is behavior-identical.** `MediaThumb` reads only
`kind`, `previewStatus`, `previewSmUrl`, `previewMdUrl`, `standardRendition`, `url`; it never reads
`id`, `sourceWidth` or `sourceHeight`. Old → new for the same input:

| field | before (via `recommendationMediaItemToPreviewUi`) | after (direct) | observable? |
|---|---|---|---|
| `kind` | `'video'` (derived from `mediaType: 'video'`) | `'video'` | same |
| `url` | `posterUrl` | `posterUrl` | same |
| `previewStatus` | `undefined ?? null` → `null` | `null` | same |
| `previewSmUrl` / `previewMdUrl` | `posterUrl` | `posterUrl` | same |
| `standardRendition` | `undefined ?? null` → `null` | `null` | same |
| `id` | `posterUrl` | `mediaId` | **unused by `MediaThumb`** |
| `sourceWidth` / `sourceHeight` | `null` | absent | **unused by `MediaThumb`** |

With `previewStatus: null`, `getMediaThumbPhase` (`mediaThumbState.ts:31`) returns `pending` for
`kind: 'video'` both before and after — the rendered result is the same "Видео готовится" state.
The change is presentation-model plumbing, not a behavior change.

## 4. Point 3 — nothing else changed

Against the three-file list in §1:

- **DB grant / named root / privileges declaration** — untouched. `deploy/postgres/privileges/**` is
  absent from the correction diff.
- **Route** — untouched. No `app/api/**/route.ts`, no `page.tsx`.
- **Recommendation repository** — untouched. `pgRecommendations.ts`, `inMemoryRecommendations.ts`,
  `modules/recommendations/**` all unchanged; `recommendationMediaItemToPreviewUi` itself is
  unchanged and still the sole mapper for the old shape.
- **Doctor files** — untouched. `DoctorProgramItemDiscussionMessageBody.tsx` and
  `shared/ui/doctor/**` unchanged; no patient→doctor or doctor→patient import introduced (§17 clean).
- **Unrelated patient behavior** — the only shared file touched is
  `PatientCatalogMediaStaticThumb.tsx`, and the widening is additive (§3). All 13 existing test files
  over `patient/treatment`, `patient/content` and `shared/ui/patient` are green (§6).

## 5. Point 4 — booking fixture only

`publicBookingDoors.unit.test.ts` gains exactly one line inside `slotSnapshotPayload()`:
`availabilityHorizonDays: 30`.

Production Zod is untouched and still required and strict:
`pgBookingScheduling.ts:131` — `availabilityHorizonDays: z.number().int().min(1).max(92)`.
`30` is inside that range, so the fixture is made **valid**, not the parser made **lax**. The
fallback path (`pgBookingScheduling.ts:667`,
`requirePublicBookingRuntimeSettings().availabilityHorizonDays`) is unchanged. This is the
"тесты подгоняются под код" direction §10 requires, not the reverse.

## 6. Reruns — exact commands and results

All commands run in `/home/dev/dev-projects/bcb-wt-patient-work3-20260906` at HEAD `7a512be1c`.
Exit codes captured via `PIPESTATUS[0]`, not from the tail of a pipe.

| # | Command | Result |
|---|---|---|
| R1 | `node --test deploy/postgres/privileges/tenant-predicate-invariant.test.mjs` | **5/5 pass, 0 fail**, rc=0. Includes the formerly red `a patient-only callsite may not reach a relation without a patient door`. |
| R2 | `pnpm run test:db-privileges` (the exact failed CI step, `node --test deploy/postgres/privileges/*.test.mjs`) | **341 tests: 184 pass / 0 fail / 157 skip**, rc=0, 18.2s. CI had `183 pass / 1 fail / 157 skip` — the one failure is gone and no test was lost. |
| R3 | `pnpm --dir apps/webapp exec vitest run src/infra/repos/publicBookingDoors.unit.test.ts` | **1 file / 6 tests pass**, rc=0. |
| R4 | `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment/ProgramItemDiscussionMessageBody.ui.test.tsx src/app/app/patient/treatment/ProgramItemDiscussionDialog.ui.test.tsx` | **2 files / 10 tests pass**, rc=0. |
| R5 | `pnpm --dir apps/webapp exec vitest run src/app/app/patient/treatment src/app/app/patient/content src/shared/ui/patient` (every consumer of the widened prop) | **13 files / 41 tests pass**, rc=0. |
| R6 | `pnpm --dir apps/webapp run typecheck` (`tsc --noEmit`) | PASS, rc=0. |
| R7 | `pnpm --dir apps/webapp exec eslint` on the three changed paths | PASS, rc=0, no output. |
| R8 | `git diff --check` and `git diff 913d69385^ 913d69385 --check` | PASS, rc=0 both. |

No full CI was run (§9: the failed step plus targeted gates is the sanctioned accelerated cycle).
No new blind audit, no second fault injection, no test added or modified.

## 7. Observations — not findings (§24.6)

1. **The A3 gate matched the old file through a quote-stripping desync, not through the import
   specifier.** `namesRelationInCode` strips `'…'` pairs; the English comment "the user's own bytes"
   contains a lone apostrophe, which desynchronizes the pairing so that
   `'@/modules/recommendations/types'` was left standing as bare code. The comment is still present at
   `ProgramItemDiscussionMessageBody.tsx:38`, but there is no `recommendations` token left anywhere in
   the file, so the gate is green on substance. This makes the oracle occasionally **over**-strict,
   never lax, and it is a pre-existing property of `access-census.mjs` that this correction neither
   introduced nor weakened. Owner question at most; not in Work3 scope, not fixed here.
2. **`declaration.ts` still lists three patient paths under `public.recommendations` `codePaths`**
   (`ProgramItemDiscussionMessageBody.tsx`, `PatientCatalogMediaStaticThumb.tsx`,
   `shared/ui/patient/media/mediaPreviewUiModel.ts`). Gate-neutral: `assertPatientCallsiteDoors` skips
   a declared path that does not name the relation in code, and `assertNoUndeclaredRuntimeSurface`
   only requires that at least one production callsite exists (many do). Correcting the census is a
   privileges-declaration change, i.e. exactly the DB surface this correction was told not to touch —
   recommendation for a later declaration pass, not work for this candidate.
3. **The retained discussion tests cover only the image branch** (`mimeType: 'image/jpeg'`,
   `posterUrl: null`); the changed video branch is not exercised by a test. Per the brief no test was
   added; the branch is verified by inspection instead (§3 table), and it is field-for-field
   equivalent. Related pre-existing behavior, unchanged by this correction and out of scope: because
   `previewStatus` is not plumbed into the video thumb, the poster resolves to the `pending` phase
   rather than `ready` — that was equally true before `913d69385`.

## 8. Owner instruction preserved

Owner said **do not land Work3**. This review landed nothing, pushed nothing, merged nothing and
changed no product code or test. The only commit added is this artifact, staged by explicit path.
The candidate remains prepared for the owner's later review.
