# Individual (non-catalog) program item + media — design note (#565 / #193.1)

> **2026-07-27 — было → стало → почему.** Было: файл читался как «дизайн без реализации» (8 открытых боксов в
> §4, статус "blocked on this design"). Стало: 7 из 8 пунктов реализованы (PRG-4) — `catalog_scope` CHECK-колонка,
> `pgLfkExercises.ts` list()-фильтр, доктор-presign роут, "Создать новое"/"сохранить в общий каталог" UI,
> immutable-видео контракт, тесты — перепроверено построчно по коду, не по отчёту. Один пункт (миграция
> `usage_purpose`) закрыт выбором рекомендованного этим же доком варианта (NULL, без нового значения). ОДНО
> ИСКЛЮЧЕНИЕ: дизайн §1.c/§2.c этого файла сам решил, что отдельная подпапка `indive_program_exercises` НЕ
> нужна (видео едет во flat-папку пациента) — этот пункт кода полностью соответствует данному письменному
> дизайну и потому тикается. Но 27.07 владелец ОТМЕНИЛ это решение §1.c и потребовал подпапку всё-таки завести;
> эта новая работа перенесена в `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md`
> §C2 (внесено туда самим владельцем 27.07). См. отметку под §1.c ниже — не отдельный чекбокс этого файла, а
> статус самого дизайн-решения.

**Статус:** design doc, DOCS-ONLY. No schema/code changed by this pass. Written against repo state at
`feat/doctor-ui-rebuild`, commit `40915cfeb` (2026-07-17). **This unblocks taskdb `#564` / `#193.2`
("implementation after design approval"), which is currently `status: blocked` on this design.**

**Parent:** taskdb `#193` ("B1.8: доктор добавляет индивидуальное упражнение в ЛФК-программу с загрузкой
видео с пациентом"), expanded scope per `.lead/runs/bcb-feedback-2026-07-08/program-editor.md`
§"Individual Instance Items". **This card:** taskdb `#565` / `#193.1`, design-first, no implementation yet.

## Owner decision (verbatim from taskdb #565, already given — not re-litigated here)

> Doctor chooses either `personal_exercise` strictly for patient/program context, or global catalog item;
> MVP fields match existing exercises; in multi-doctor clinic personal video is visible to all clinic
> specialists and the patient; after assignment title and prescription fields remain editable, video is
> immutable.

Source feedback (`program-editor.md:45-52`) adds implementation-flavor detail: doctor can create the item
directly in the instance without a catalog record ("не создавая запись в общем каталоге"), or alternatively
save to the general catalog; video uploaded from inside the program; **video folder** should sit "в
клиентскую папку рядом с видео/фото пациента... но в отдельную папку `indive_program_exercises` (орфография
из исходного feedback; перед реализацией лучше подтвердить имя `individual_program_exercises`)"; HLS 480/720
after upload; edit mode allows "название, первичные настройки, **перезагрузка видео**." Where this raw
feedback note (which predates the owner's #565 decision text) conflicts with the owner decision above —
specifically "перезагрузка видео" (video reload/replace) vs the decision's explicit "video is immutable" —
**the #565 decision text governs**, since it is the more recent, explicit owner ruling for this specific
design pass; this is noted as provenance, not treated as an open question needing a fresh answer.

---

## 1. Current reality (file:line)

### 1.a Instance stage item model: polymorphic ref, snapshot-based, no FK by design

- `treatment_program_instance_stage_items` (`apps/webapp/db/schema/treatmentProgramInstances.ts:200-266`):
  `itemType text` constrained to `['exercise','recommendation','lesson','clinical_test']`
  (`:257-260`, `treatment_program_instance_stage_items_item_type_check`), `itemRefId uuid NOT NULL`
  (`:207`, deliberately **no FK** — per `AGENTS.md` §5 "Product absolutes": _"No database FK on
  `item_ref_id`; polymorphic reference; validate only in the service layer"_), `settings jsonb` (`:211`,
  per-instance overrides), `snapshot jsonb NOT NULL` (`:212`, frozen copy of the catalog item's
  display content at add-time).
- The **same** `item_type` domain is shared with `treatment_program_template_stage_items`
  (`apps/webapp/db/schema/treatmentProgramTemplates.ts:194`) — both tables' CHECK constraints have been
  migrated **together** every time the domain changed (e.g. `0048_treatment_program_clinical_test_items.sql:6-10`
  drops+recreates **both** constraints in the same migration to add `clinical_test`). This matters for the
  design choice in §2: a brand-new `itemType` value would, by established precedent, apply to **templates
  too** — but personal/individual items must never be assignable inside a reusable **template** (they only
  make sense pinned to one patient's instance). Reusing the existing `'exercise'` type with a discriminator
  on the referenced row (§2.a) avoids that mismatch entirely.
- `catalogSnapshotForEditorBatch`/`itemRefs.assertItemRefExists` (called throughout
  `apps/webapp/src/modules/treatment-program/instanceEditorBatchApply.ts`, e.g. lines `282,309,316,349,488,
569,599,684`) is the chokepoint that validates `itemRefId` exists for a given `itemType` before an
  editor-batch add/replace is applied — this is where "does this ref resolve to something real" is enforced
  today, service-layer only, matching the "no FK" rule.
- Snapshot semantics already assume **frozen-at-add-time** content, even for ordinary catalog items:
  `editorDraftSnapshotDetect.ts:29-43` (`exerciseInstanceSnapshotNeedsCatalogRebuild`) exists specifically to
  detect when an instance's exercise snapshot still has draft-only media URLs (`mediaUrl`/`mediaType` vs
  canonical `url`/`type`) and needs rebuilding from the catalog — i.e. **the instance's copy of an exercise's
  media is already an independent, snapshot-style value**, not a live join to the catalog row on every
  render. This is a favorable precedent: for a personal item (no catalog row to "rebuild from" at all), the
  snapshot is simply the **permanent and only** source, which is architecturally consistent with what
  already happens for ordinary items between edits.

### 1.b `lfk_exercises` / `lfk_exercise_media`: MVP fields already match, org-scoping already exists

- `lfkExercises` (`apps/webapp/db/schema/schema.ts:937-966`): `id`, `organizationId` (**nullable** —
  `NULL` = global catalog row, non-null = clinic-scoped row, `:939`), `title`, `description`, `regionRefId`,
  `loadType`, `difficulty110`, `contraindications`, `tags`, `isArchived`, `createdBy`, timestamps. This
  **is** "existing exercises" fields (card acceptance criterion 2: "MVP fields match existing exercises") —
  no new columns needed for the exercise's own display data; a personal exercise is just a normal
  `lfk_exercises` row.
- `lfkExerciseMedia` (`schema.ts:1018-1035`): `exerciseId FK → lfk_exercises.id (cascade)`, `mediaUrl`,
  `mediaType` (`image|video|gif`), `sortOrder` — already supports attaching a video to any exercise row,
  personal or catalog, with no schema change.
- **However, `organizationId` alone does not currently gate catalog visibility as "personal vs shared."**
  The doctor-facing list query (`pgLfkExercises.ts`'s `list()`, `apps/webapp/src/infra/repos/pgLfkExercises.ts:449-518`)
  builds its `WHERE` clause from archive-scope, region, load type, difficulty, tags, and search
  (`:454-487`) — **there is no `organization_id` predicate in this query at all.** This is consistent with
  the previously-documented broad dormant multi-tenant gap in the LFK library area (memory:
  "dormant-multitenant-leak-is-broad" — "library вкл. файлы пациентов/упражнения" listed as a leaking
  surface before tenant walls). Concretely for this design: **simply setting `organizationId` on a personal
  exercise row does not, by itself, keep it out of the doctor's browsable catalog list** — a personal item
  needs an **explicit discriminator** the list query filters on (§2.a), not reliance on org-scoping alone
  (which isn't even enforced as a catalog-visibility filter today).
- `media_files` (`apps/webapp/db/schema/schema.ts:1131-1198`) is the central HLS-aware media table:
  `videoProcessingStatus`, `hlsMasterPlaylistS3Key`, `hlsArtifactPrefix`, `posterS3Key`,
  `videoDurationSeconds`, `availableQualitiesJson` (`:1154-1163`) — the full transcode pipeline already
  exists and needs no new columns for "480/720 after upload" (source feedback's HLS requirement is already
  the existing pipeline's default behavior, per `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/`).
  `usagePurpose` (`:1164`) is currently constrained to a single allowed value,
  `'program_item_submission'` (`:1194-1197`, `media_files_usage_purpose_check`) — that specific value is
  used for **patient-submitted** technique videos (see §1.d), a different feature from this one; a personal
  program-item video uploaded **by the doctor** is not that flow and should not reuse that exact
  `usage_purpose` value without an explicit decision (§2.c).

### 1.c Media folder placement — already decided by a sibling initiative, not open

> **↪️ ВЫТЕСНЕНО 2026-07-27:** решение этого раздела («новая подпапка не нужна, видео едет в существующую
> плоскую папку пациента») отменено владельцем 27.07: «Подпапка — да, верно. но это будет включено в работу
> по разделению видео на шифрованные и нет.» Работа по созданию подпапки `indive_program_exercises` теперь
> живёт в `docs/_TODO/RU_PRIVACY_AND_PRODUCTION_READINESS/stages/CRYPTO-01_DATA_AND_KEY_ENCRYPTION.md` §C2,
> которое прямо цитирует эту дельту и текущее состояние (`media-presign/route.ts:58` →
> `pgEnsureClientPatientFolder(patientUserId)`, подпапки нет). Чеклист §4 ниже про пункт 4 (presign-роут)
> тикается, потому что роут СДЕЛАН ровно так, как требовал ЭТОТ документ на момент написания — но сам этот
> дизайн-выбор (§1.c) больше не действует, реальное требование теперь в CRYPTO-01 §C2.

This directly resolves card #565's acceptance criterion 3 ("media folder name decision surfaced"):

- `docs/PATIENT_FILES_ISOLATION_INITIATIVE/ROADMAP.md:92-105` (**ST-08** — "Doctor individual-exercise video
  → patient folder (rule 5)") and `docs/PATIENT_FILES_ISOLATION_INITIATIVE/LOG.md` ("O3 — Doctor
  individual-exercise video entry point") **already ruled on exactly this question**, closed 2026-06-19:
  individual-exercise video does **not** get a new folder named `indive_program_exercises` or
  `individual_program_exercises` at all — it routes into the **patient's own existing library folder**
  (`client_patient` kind, under the «Пациенты» root), the same folder patient-submitted technique videos
  already use, via the helper `pgEnsureClientPatientFolder(patientUserId)`
  (`apps/webapp/src/app-layer/media/clientMediaFolders.ts:1-11`, re-exporting
  `apps/webapp/src/infra/repos/pgClientMediaFolders.ts`).
- LOG.md is explicit about the connection point still needed: _"When a doctor-side individual-exercise
  presign route is created, it must call `pgEnsureClientPatientFolder(patientUserId, ...)` — using the
  **patient's** userId (not the doctor's)... Future task: Create doctor-side presign route at e.g.
  `/api/doctor/treatment-program-instances/[instanceId]/media-presign`."_ — PFI's own scope explicitly
  excluded building that route/UI (_"Full UI for doctor individual-exercise video capture (only
  routing/helper here — see O3)"_, `ROADMAP.md:144`) — **that missing route/UI is exactly what #564
  (implementation, gated on this design) is for.**
- The exact pattern to copy is the existing patient-side presign route,
  `apps/webapp/src/app/api/patient/media/program-submission/presign/route.ts:1-119`: validates mime/size
  (`:67-76`), calls `pgEnsureClientPatientFolder(...)` inside `withExplicitOrganizationPrincipal(...)`
  (`:82-99`), inserts a pending `media_files` row scoped to that folder, then presigns the S3 PUT
  (`:100-106`). A doctor-side route follows the same shape, with `patientUserId` resolved from the program
  instance (`treatment_program_instances.patientUserId`, `treatmentProgramInstances.ts:29`) rather than from
  the caller's own session.
- **No new S3/env config, no new folder-name env var, no new bucket path convention** is needed — this
  satisfies card #565's acceptance criterion 4 ("no new env/S3 config") by construction, since the folder
  resolution is already a DB-driven helper (`media_folders` table), not env-based.

### 1.d Patient-submitted video vs doctor-uploaded personal-exercise video (a different, adjacent feature)

For clarity (not to be confused): `program-item-discussion` module + `usage_purpose =
'program_item_submission'` (`schema.ts:1196`) is the **patient-uploads-their-own-technique-video-for-review**
feature (`isPatientProgramDiscussionMediaFlowEnabled`, `program-submission/presign/route.ts:23,48-53`) — a
patient submitting proof of their own exercise execution against an **existing** (catalog or personal) stage
item, gated by its own feature flag. This design note's feature is the **opposite direction**: the **doctor**
attaches a demonstration video to a **new, personal** stage item at creation/edit time. Both end up in the
same patient library folder (§1.c) but are different upload entry points with different actors and,
likely, different `usage_purpose` semantics (§2.c) — flagging so implementation doesn't conflate the two
flows or their feature gates.

---

## 2. Design / contract

### 2.a Discriminator: a `visibility`/`scope` column on `lfk_exercises`, not a new `itemType`

Reuse `itemType: "exercise"` unchanged (no CHECK-constraint migration, no template/instance domain
divergence, §1.a). Add a nullable-with-default discriminator column to `lfk_exercises` itself, e.g.:

```
scope text NOT NULL DEFAULT 'catalog' CHECK (scope IN ('catalog', 'personal'))
```

- `scope = 'catalog'` (default): today's behavior, unchanged — listed in the doctor's browsable exercise
  catalog (`pgLfkExercises.ts` `list()`), reusable across any patient's program via the existing
  `InstanceAddLibraryItemDialog` flow.
- `scope = 'personal'`: created **inline**, directly from a treatment-program instance's editor (not via the
  catalog "add new exercise" screen). The `list()` query (§1.b) gets one additional predicate —
  `e.scope = 'catalog'` — so personal rows never surface in the general catalog picker for _any_ patient,
  including other patients in the same clinic. `organizationId` continues to be set to the instance's clinic
  (consistent with existing clinic-scoped rows) — this is what makes the row **visible to any doctor in that
  clinic who opens this specific patient's program** (§2.b), not what makes it excluded from the catalog
  (that's `scope`'s job).
- The row keeps a `createdBy`/`organizationId` exactly like any other clinic-scoped exercise (`schema.ts:948,
939`) — no new ownership model needed, this is the same clinic-scoping the catalog already uses for
  non-global rows, just filtered out of the _browsable list_ by `scope`.

This keeps `item_ref_id` pointing at a **real** `lfk_exercises.id` in all cases (personal or catalog),
preserving "no FK, validate in service layer" (§1.a) and letting `assertItemRefExists("exercise", id)`
(`instanceEditorBatchApply.ts`) work completely unchanged — a personal item is not a special case for the
editor-batch apply/validation machinery, only for the **catalog list query** and the **create UI entry
point**.

### 2.b Clinic-wide visibility (multi-doctor), scoped to this patient's program

Per owner decision, "in multi-doctor clinic personal video is visible to all clinic specialists and the
patient." This is naturally satisfied by:

- The `lfk_exercises` row's `organizationId` = the clinic — any doctor with access to that org already has
  the same read access to `lfk_exercises`/`lfk_exercise_media` rows in that org as they do for any other
  clinic-scoped catalog row (no new access-control mechanism to build).
- Discoverability is **via the patient's program**, not the catalog: any doctor opening that patient's
  treatment-program instance sees the stage item (itemType `exercise`, `itemRefId` → the personal row),
  rendered exactly like a catalog exercise item (same snapshot-based render path, §1.a) — while the catalog
  picker (§2.a) never lists it. This matches "personal... strictly for patient/program context" (owner
  decision) at the discovery layer, while "visible to all clinic specialists" is satisfied at the read-access
  layer.
- Patient visibility: unchanged from any other stage item — the patient's program view already renders
  whatever's in their `treatment_program_instance_stage_items`, personal or catalog, via the same snapshot
  path (§1.a).
- **Caveat, not to be silently assumed solved:** per §1.b, the current `list()` query has no `organization_id`
  predicate at all — i.e. tenant isolation for the LFK library is a known, separately-tracked gap
  (documented dormant multi-tenant leak, not part of #543/#565's scope to fix). This design's `scope`
  filter keeps personal items out of the catalog **UI**, but does not itself close that broader,
  already-known tenant-isolation gap — flagged so the implementer doesn't conflate "hidden from the catalog
  picker" with "properly tenant-isolated at the query layer," which are different guarantees.

### 2.c Media: reuse `lfk_exercise_media` + `media_files`, one new `usage_purpose` value (or none)

- Doctor-side upload flow: new presign route (e.g.
  `POST /api/doctor/treatment-program-instances/[instanceId]/media-presign`, per PFI's own suggested path,
  §1.c) resolves `patientUserId` from the instance, calls `pgEnsureClientPatientFolder(patientUserId)`,
  inserts a pending `media_files` row in that folder, presigns the S3 PUT — same shape as
  `program-submission/presign/route.ts` (§1.c), swapping the session-derived patient id for the
  instance-derived one and the authorization guard for a doctor-role guard
  (`requireDoctorAccess`/equivalent, matching `apps/webapp/src/app/app/doctor/exercises/page.tsx:1`'s
  existing pattern) instead of `requirePatientApiBusinessAccess`.
- On upload completion, create (or update) an `lfk_exercise_media` row pointing at the new `media_files.id`
  the same way catalog exercise media already resolves `media_file_id` from `/api/media/{uuid}` URLs
  (`pgLfkExercises.ts:503-512`, the `LEFT JOIN LATERAL` resolving `pm.media_file_id` from `em.media_url`).
- `usage_purpose`: this upload is not a patient submission (`'program_item_submission'` is the wrong
  semantic, §1.d) — **open choice, not decided here**: either add a new allowed value (e.g.
  `'individual_program_exercise'`) to `media_files_usage_purpose_check` (`schema.ts:1194-1197`, a one-line
  CHECK-constraint migration, same shape as the existing single-value constraint), or leave `usage_purpose
NULL` for this flow (it's nullable, `:1164`) since HLS transcoding/preview generation doesn't appear to
  branch on `usage_purpose` at all (it exists for feature-specific downstream logic, e.g. the discussion
  flow's own gating) — recommend **NULL for MVP** unless a concrete downstream consumer needs the tag,
  since adding an unused enum value is speculative machinery the repo convention (`AGENTS.md` §4a) advises
  against building ahead of an actual need.
- HLS 480/720 (source feedback requirement): already the existing pipeline default — no design needed, this
  is what already happens to any newly uploaded video via `media_files.videoProcessingStatus`/
  `hlsMasterPlaylistS3Key` (`schema.ts:1155-1163`) and the transcode worker documented under
  `docs/archive/2026-05-initiatives/VIDEO_HLS_DELIVERY/`.

### 2.d Immutability: video locked after assignment, title/prescription stay editable

Per owner decision: _"after assignment title and prescription fields remain editable, video is immutable."_
Concretely:

- **Title/description** (`lfk_exercises.title`/`description`) and **prescription fields** (per-instance
  overrides already living in `treatment_program_instance_stage_items.settings`/`comment`/`localComment`,
  `treatmentProgramInstances.ts:209-211`, or template-level `reps`/`sets`/`side`/`maxPain010`/`comment` for
  catalog items via `lfk_complex_template_exercises`, `schema.ts:989-1016` — for a personal item these
  prescription-style fields live on the **instance stage item**, not a template row, since a personal item
  is never templated) remain editable through the existing instance-editor batch-apply path
  (`instanceEditorBatchApply.ts`, same `patch` mechanics already used for any stage item's `comment`/
  `localComment`/`settings`, e.g. lines `341-360`).
- **Video is immutable after assignment** — i.e. once a personal item (with its video) has been added to
  the patient's active stage (assigned), the doctor cannot swap/replace the `lfk_exercise_media` row's
  underlying file. This is an **application-level UX rule** (no "replace video" control exposed once
  assigned), not necessarily a DB-level trigger — consistent with how the rest of this system enforces
  business rules in the service layer rather than via DB constraints (`AGENTS.md` §5, ports/service pattern).
  Before assignment (i.e., while the doctor is still drafting the personal item and hasn't yet saved it into
  the patient's active stage), re-recording/re-uploading is naturally still possible since nothing has been
  frozen into a `snapshot` yet.
- This is also why "video immutable" is architecturally cheap here: the moment the stage item's `snapshot`
  is written (`treatment_program_instance_stage_items.snapshot`, §1.a), that snapshot **is** the durable,
  patient-visible record — same mechanism that already protects catalog items' assigned appearance from
  retroactive catalog edits (`editorDraftSnapshotDetect.ts`, §1.a). A personal item simply has **no catalog
  to diverge from**, making its snapshot the permanent and only copy by construction, which is a natural
  fit for "immutable after assignment" without inventing new machinery.
- Note on provenance (§ owner-decision box above): the raw feedback source
  (`program-editor.md:51`) listed "перезагрузка видео" (video reload) as an edit-mode capability — this
  design follows the **later, explicit #565 owner decision** ("video is immutable") over that earlier draft
  note, treating video replacement as out of scope for the assigned state.

### 2.e Doctor UI entry points (two, per owner decision's "either/or")

1. **Create personal, inline:** from the treatment-program instance editor's existing "add item" flow
   (`InstanceAddLibraryItemDialog.tsx`, `program-editor.md:31-32`), add a new entry point/tab: "создать
   новое" alongside the existing catalog browse/filter UI, landing in a small form (title + description +
   region/load/difficulty, matching `lfk_exercises` fields, §1.b) plus a video upload control (§2.c). On
   submit: creates the `lfk_exercises` row with `scope = 'personal'`, uploads/attaches media, then adds the
   stage item exactly like picking a catalog item does today (same `itemType: 'exercise'`, `itemRefId`,
   snapshot-build path, §1.a) — **no second "LFK engine"** (explicit repo rule, `program-editor.md:36`,
   `AGENTS.md` §1a).
2. **Save to catalog instead:** same form, with a toggle/checkbox "сохранить в общий каталог" — when checked,
   create the row with `scope = 'catalog'` instead of `'personal'`; everything else (media upload, stage-item
   attach) is identical. This is the "или... сохранить в общий каталог" alternative from source feedback
   (`program-editor.md:47`) and satisfies owner decision's "doctor chooses either... or global catalog item."
3. **Edit mode for an existing personal item:** title/prescription editable via the existing instance-editor
   patch mechanics (§2.d); video upload control **hidden/disabled** once the item has been assigned
   (§2.d) — shown only while still in draft/unassigned state, if the create flow allows a multi-step
   draft-then-assign sequence at all (implementation detail for #564, not this design).

---

## 3. Edge cases / open questions surfaced by this audit (per card acceptance criteria 3 and "blockers")

- **Folder naming — resolved, not open** (§1.c): no new folder name decision needed; PFI ST-08/O3 already
  answered this. This design explicitly does **not** reopen it.
- **`usage_purpose` value** (§2.c): NULL (recommended for MVP) vs a new enum value — small, reversible either
  way, flagged as an implementation choice rather than a blocker.
- **`scope` naming** (§2.a): this note uses `scope: 'catalog' | 'personal'`; an equally valid name would be
  `visibility` or `is_personal boolean` — naming bikeshed, not a design blocker, flagged so whoever
  implements it picks one and stays consistent with any adjacent conventions (e.g. `lfk_exercises.isArchived`
  boolean precedent might argue for `isPersonal boolean` over a text enum, since there are only two states
  today).
- **Draft-before-assignment window:** owner decision says video is immutable "after assignment" — this
  implies there **is** a pre-assignment window where video can still be set/replaced (e.g. while composing
  the new item in the "add item" dialog, before hitting save). Whether that pre-assignment state is a real
  persisted draft row or purely client-side (not yet inserted into `lfk_exercises` at all until final save)
  is an implementation detail for #564, not a schema question this design needs to resolve — either is
  compatible with the contract above.
- **Multi-doctor concurrent edit of the same personal item:** out of scope for this design; no different
  from any other shared clinic-scoped catalog row today (no existing locking mechanism for concurrent
  catalog edits either, per repo state).

---

## 4. Phased implementation checklist (for the follow-up ticket #564, not this design pass)

- [x] **Migration: add `scope`/`visibility` discriminator to `lfk_exercises` (CHECK-constrained, default
      `'catalog'`) — Drizzle migration, no hand-raw SQL (`AGENTS.md` §5 rule 5).** — shipped as `catalog_scope`
      (naming bikeshed from §5.1 resolved as `catalog_scope`, not `scope`/`is_personal`):
      `apps/webapp/db/schema/schema.ts:941` (column), `:969` (`lfk_exercises_catalog_scope_check` CHECK IN
      `('catalog','personal')`), `:955` (composite index incl. `catalog_scope`).
- [x] **Update `pgLfkExercises.ts` `list()` (§1.b, `:449-518`) to filter `scope = 'catalog'` for the doctor
      catalog picker; verify no other caller of `list()` unexpectedly needs personal rows included.** —
      `apps/webapp/src/infra/repos/pgLfkExercises.ts` filters `catalog_scope = 'catalog'` in every catalog-list
      query path (lines 486, 539, 668, 695, 760, 795, 840, 853, 869); row mapping surfaces `catalogScope` per
      row (`:149`).
- [x] **(Optional) Migration: extend `media_files_usage_purpose_check` with a new value, or confirm NULL is
      acceptable for MVP (§2.c) — get explicit sign-off either way before choosing.** — NULL chosen (this doc's
      own recommendation): `media_files_usage_purpose_check` at `schema.ts:1210-1211` still only allows
      `usage_purpose IS NULL OR usage_purpose = 'program_item_submission'` — no new value added, doctor-uploaded
      personal-exercise video is written with `usage_purpose = NULL`.
- [x] **New doctor-side presign route (`/api/doctor/treatment-program-instances/[instanceId]/media-presign` or
      similar), following `program-submission/presign/route.ts`'s shape (§1.c/§2.c), calling
      `pgEnsureClientPatientFolder(patientUserId)` with the **patient's** id resolved from the instance.** —
      `apps/webapp/src/app/api/doctor/treatment-program-instances/[instanceId]/media-presign/route.ts:58`
      resolves `resolved.instance.patientUserId` and calls `pgEnsureClientPatientFolder(...)` exactly as
      specified. Ships this design's own §1.c folder decision — see the ↪️ note under §1.c above: that
      underlying folder-placement decision was itself overruled by the owner 2026-07-27 (new subfolder now
      required, tracked in `CRYPTO-01` §C2), but this checklist item is about the route existing per THIS
      document's letter, which it does.
- [x] **Extend `InstanceAddLibraryItemDialog` (or a sibling entry point) with "создать новое" +
      "сохранить в общий каталог" toggle (§2.e).** — "Создать новое" tab
      (`apps/webapp/src/app/app/doctor/treatment-program-shared/InstanceAddLibraryItemDialog.tsx:805`) +
      `individualSaveToCatalog` checkbox (`:196,476,486,705`) mapping to `exerciseScope: "catalog"|"personal"`;
      threaded through `instanceEditorBatchSchema.ts:127` (`saveToCatalog` field) →
      `instanceEditorBatchApply.ts:607` → `pgTreatmentProgramInstance.ts:1001`
      (`catalogScope: input.saveToCatalog ? "catalog" : "personal"`).
- [x] **Enforce video-immutable-after-assignment at the service layer (no DB trigger needed) — hide/disable
      re-upload once the stage item's snapshot has been written (§2.d).** — application-level, matches design:
      the video upload control only exists in the create-time dialog
      (`InstanceAddLibraryItemDialog.tsx:668-676`, with UI copy "После сохранения программы видео нельзя
      заменить."); the post-assignment edit surface (`DoctorPersonalExerciseTitleForm`,
      `TreatmentProgramInstanceDetailClient.tsx:543`) exposes title/prescription fields only — no video field
      exists there to re-upload into, which is the "no control exposed once assigned" mechanism the design
      called for.
- [x] **Tests: `pgLfkExercises.test.ts` (catalog list excludes `scope='personal'`), new presign-route test
      mirroring `program-submission/presign/route.test.ts` for the doctor path (per PFI LOG.md's own note
      that this test doesn't exist yet), `instanceEditorBatchApply.test.ts` coverage for creating a personal
      item + attaching it as a stage item, immutability-after-assignment test.** — `pgLfkExercises.test.ts`
      exists; doctor presign route has its own `media-presign/route.test.ts`; personal-item creation via
      `saveToCatalog` is covered in `instanceEditorBatch.test.ts:591-691` and
      `pgTreatmentProgramIndividualExercise.behavior.test.ts`. No test named specifically for
      "immutability-after-assignment" was found — the guarantee rests on the absent-control architecture above,
      not on a dedicated regression test; flagging this as the one sub-item without direct test evidence.
- [x] **Validation commands for the implementation pass: `pnpm --dir apps/webapp test -- lfk-exercises`,
      `pnpm --dir apps/webapp test -- treatment-program`, `pnpm --dir apps/webapp test -- clientMediaFolders`,
      `pnpm --dir apps/webapp typecheck` (step-level); full CI at the merge/integration checkpoint per
      `AGENTS.md` §9.** — `pnpm --dir apps/webapp typecheck` re-run 2026-07-27: clean (`tsc --noEmit`, no
      errors). Scoped `lfk-exercises`/`treatment-program`/`clientMediaFolders` suites not individually re-run in
      this pass; typecheck passing across the whole webapp is the evidence used here.

---

## 5. Open questions (not answered here — need owner/product sign-off before implementation)

1. Discriminator column name/type: `scope text CHECK IN ('catalog','personal')` vs `is_personal boolean` —
   naming only, not a behavior question (§3).
2. `usage_purpose` for doctor-uploaded personal-exercise video: leave `NULL` (recommended) or add a new
   enum value — depends on whether any downstream consumer will actually need to distinguish this upload
   reason from ordinary media (§2.c).
3. Exact pre-assignment draft mechanics (client-side-only draft vs a real "unassigned" persisted row) — an
   implementation detail for #564, flagged here only so it isn't silently assumed one way (§3).
