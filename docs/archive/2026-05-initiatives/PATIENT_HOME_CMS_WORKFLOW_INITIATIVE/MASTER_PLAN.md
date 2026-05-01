# MASTER_PLAN - Patient Home CMS Workflow

## 0. Problem Statement

После `PATIENT_HOME_REDESIGN_INITIATIVE` главная пациента технически собирается из правильных источников, но workflow наполнения слишком хрупкий:

- блок может быть `is_visible=true`, но не показываться пациенту из-за отсутствующих/скрытых/битых items;
- `situations` работает с `content_sections`, но UI говорит "материал";
- если нужного раздела нет, из настройки пустого блока нельзя быстро создать его и сразу добавить в блок;
- slug раздела заблокирован в форме CMS, но нет безопасного rename-flow;
- preview в настройках не объясняет достаточно ясно, что именно будет/не будет видно на runtime;
- `Add item`, `Edit items`, `Repair targets` - разные модалки, которые решают одну редакторскую задачу.

Цель этой инициативы - сделать настройку главной и CMS-разделов удобной, не меняя уже реализованную runtime-модель пациента.

This initiative is intentionally separate from `PATIENT_APP_VISUAL_REDESIGN_INITIATIVE`.

- CMS Workflow changes editor/admin UX, CMS sections, block settings, and slug safety.
- Visual Redesign changes patient shell/navigation/home visual primitives.
- Do not use this plan to modify patient visual tokens, shell/nav, or card styling.
- Do not use the visual redesign plan to modify CMS contracts, migrations, services, repos, or patient-home settings workflow.

## 1. Current Architecture Snapshot

### 1.1. Runtime главной

- `/app/patient` рендерит `PatientHomeToday`.
- `PatientHomeToday` читает `deps.patientHomeBlocks.listBlocksWithItems()`.
- `filterAndSortPatientHomeBlocks` учитывает `patient_home_blocks.is_visible`, `sort_order` и personal-block policy.
- Контентные блоки резолвятся через `patientHomeResolvers`:
  - `situations` -> `content_sections`;
  - `daily_warmup` -> `content_pages`;
  - `subscription_carousel` -> `content_sections | content_pages | courses`;
  - `sos` -> `content_sections | content_pages`;
  - `courses` -> `courses`.

### 1.2. Текущий admin UI

- Canonical route: `/app/doctor/patient-home`.
- Legacy route: `/app/settings/patient-home` redirects to `/app/doctor/patient-home`.
- Components currently live under `apps/webapp/src/app/app/settings/patient-home/`.
- `PatientHomeBlockSettingsCard` has menu actions:
  - show/hide block;
  - add item;
  - edit items;
  - repair CMS links if unresolved.
- `PatientHomeAddItemDialog` lists existing candidates only.
- `PatientHomeRepairTargetsDialog` can navigate to create missing CMS section only for already broken items.

### 1.3. CMS sections

- `content_sections.slug` is the natural key for:
  - `/app/patient/sections/[slug]`;
  - `patient_home_block_items.target_ref` when `target_type='content_section'`;
  - `content_pages.section` where pages are grouped by section slug.
- `SectionForm` disables slug editing in edit mode.
- `saveContentSection` upserts by slug and does not implement rename semantics.

## 2. Product Decisions

### 2.1. Empty visible block behavior

Keep current patient runtime rule by default:

- blocks with zero resolvable items may be hidden on the patient page;
- admin UI must explicitly say why: "Блок включен, но на главной пациента не появится, пока нет видимых элементов".

Exception:

- `daily_warmup` must keep a polished empty state on patient runtime; this already exists and should not regress.

### 2.2. Slug rename policy

Do not turn slug into a normal free editable field.

Implement a dedicated "Изменить slug" flow:

- validate new slug;
- show impact preview;
- update all internal references in one transaction;
- write slug history for redirects;
- revalidate affected routes.

### 2.3. Inline-create policy

For `content_section` targets, inline-create is required.

For `content_page` targets:

- phase 1 can keep "create in CMS" with `returnTo` if full draft creation is too large;
- final target is quick draft creation from block when enough required fields can be supplied.

For `course` targets:

- do not create a full course inline unless the current course creation form can be reused safely;
- provide a return flow to the course creation page and auto-add after selection.

### 2.4. Terminology policy

Button labels must reflect the block target type:

- `situations`: "Добавить раздел";
- `daily_warmup`: "Добавить материал";
- `courses`: "Добавить курс";
- `subscription_carousel`: "Добавить раздел / материал / курс";
- `sos`: "Добавить раздел или материал".

Generic "материал" is allowed only when the block truly accepts pages.

## 3. Data Model Additions

### 3.1. Slug history

Add a slug history table for content sections.

Suggested schema:

```ts
export const contentSectionSlugHistory = pgTable("content_section_slug_history", {
  oldSlug: text("old_slug").primaryKey().notNull(),
  newSlug: text("new_slug").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  changedByUserId: uuid("changed_by_user_id"),
});
```

SQL constraints:

- `old_slug <> new_slug`;
- index on `new_slug`.

No FK to `content_sections.slug` is required if the slug itself can move again. Resolve chains in service with a bounded loop.

### 3.2. No new patient-home tables

Do not add a new table for block editor state.

Continue to use:

- `patient_home_blocks`;
- `patient_home_block_items`;
- `content_sections`;
- `content_pages`;
- `courses`.

### 3.3. No env vars

No new env vars in this initiative.

## 4. Phases

Execution files for Composer:

- `00_AUDIT_UX_CONTRACT_PLAN.md`
- `01_DIAGNOSTICS_LABELS_PLAN.md`
- `02_UNIFIED_BLOCK_EDITOR_PLAN.md`
- `03_INLINE_CREATE_SECTIONS_PLAN.md`
- `04_SAFE_SLUG_RENAME_PLAN.md`
- `05_CREATE_RETURN_FLOWS_PLAN.md`
- `06_QA_RELEASE_PLAN.md`

Each phase file contains:

- scope and out-of-scope;
- required files;
- phase checklist;
- docs artifacts;
- phase-level gate commands (without mandatory full CI).

---

## Phase 0 - Audit And UX Contract

### Goal

Document exact current behavior, label decisions, and target block editor contract before code changes.

### Scope

- Read:
  - `docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md`;
  - `docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md`;
  - `docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_9.md`;
  - this `MASTER_PLAN.md`;
  - `.cursor/rules/clean-architecture-module-isolation.mdc`;
  - `.cursor/rules/000-critical-integration-config-in-db.mdc`.
- Create/update `LOG.md` in this initiative folder.
- Inventory current components and actions:
  - `PatientHomeBlockSettingsCard`;
  - `PatientHomeAddItemDialog`;
  - `PatientHomeBlockItemsDialog`;
  - `PatientHomeRepairTargetsDialog`;
  - `PatientHomeBlockPreview`;
  - `patientHomeUnresolvedRefs`;
  - `patientHomeResolvers`.
- Produce a concise contract table:
  - block code;
  - allowed target types;
  - add button label;
  - empty runtime behavior;
  - inline create availability;
  - repair behavior.

### Files

- `docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md` - create.
- `docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md` - create.

### Acceptance

- Contract document exists.
- No runtime code changes.
- No tests required except static reading.

---

## Phase 1 - Admin Diagnostics, Labels, And Empty-State Truth

### Goal

Make current settings page understandable without changing the underlying workflow heavily.

### Scope

1. Add block metadata helper in `modules/patient-home`.

   Suggested file:

   - `apps/webapp/src/modules/patient-home/blockEditorMetadata.ts`

   It should export:

   ```ts
   export type PatientHomeBlockEditorMetadata = {
     itemNoun: string;
     addLabel: string;
     emptyPreviewText: string;
     emptyRuntimeText: string;
     allowedTargetTypeLabels: Record<PatientHomeBlockItemTargetType, string>;
   };

   export function getPatientHomeBlockEditorMetadata(code: PatientHomeBlockCode): PatientHomeBlockEditorMetadata;
   ```

2. Replace generic UI labels:

   - `Добавить материал` -> metadata-based label;
   - `Выберите элемент для блока` -> context-specific copy;
   - item row type labels -> Russian labels (`раздел`, `материал`, `курс`).

3. Improve admin preview empty state.

   Current:

   - "Нет видимых элементов."

   Target:

   - if block has no visible items and block is visible:
     - "Блок включен, но на главной пациента не появится, пока нет видимых элементов."
   - if block is hidden:
     - "Блок скрыт. Пациенты его не видят."
   - if block does not require items:
     - show short explanation: "Этот блок не настраивается списком: данные приходят из ...".

4. Show unresolved/hidden/auth-only/unpublished reasons more clearly.

   Minimum:

   - missing target;
   - hidden item;
   - block hidden;
   - course not published.

   Stretch:

   - section requires auth and anonymous guest will not see it;
   - CMS section `is_visible=false`.

5. Replace menu show/hide with visible switch in card header if simple.

   If scope gets large, leave menu item but add a visible status pill next to block title.

Visual boundary:

- Do not redesign doctor/admin styling beyond clarity needed for labels/status.
- Do not touch patient `PatientHome*` runtime components.
- Do not touch `patientHomeCardStyles.ts`, `AppShell`, patient nav/header, or CSS tokens.

### Files

- `apps/webapp/src/modules/patient-home/blockEditorMetadata.ts`
- `apps/webapp/src/modules/patient-home/blockEditorMetadata.test.ts`
- `apps/webapp/src/modules/patient-home/patientHomeUnresolvedRefs.ts`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockPreview.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeAddItemDialog.tsx`
- Related RTL tests.

### Tests

- Unit test for `getPatientHomeBlockEditorMetadata`.
- RTL:
  - `situations` shows "Добавить раздел";
  - `courses` shows "Добавить курс";
  - visible empty item-list block shows warning that runtime will hide it;
  - non-item block shows correct explanation.

### Acceptance

- Editor copy matches actual target types.
- Admin can understand why a visible block is absent on runtime.
- No DB schema changes.
- `pnpm --dir apps/webapp exec vitest run <phase files>` passes.
- `pnpm --dir apps/webapp exec tsc --noEmit` passes.
- `pnpm --dir apps/webapp lint` passes.

---

## Phase 2 - Unified Block Editor

### Goal

Replace scattered add/edit/repair interactions with one contextual block editor.

### Scope

Create a single editor dialog/panel:

- trigger: "Настроить" in each block card;
- header: block title, visibility switch, runtime status;
- section "Что увидит пациент";
- section "Элементы блока":
  - drag reorder;
  - show/hide item;
  - delete item;
  - target type label;
  - target ref/title;
  - "Открыть в CMS" link if target exists;
  - "Исправить" if target missing.
- section "Добавить":
  - searchable grouped candidate list;
  - context labels;
  - empty state with "Создать раздел" for `content_section` blocks.

Do not remove old components immediately if safer. It is acceptable to keep old components internally and wrap them, but user-facing flow should be one entry point.

### Design Rules

- No nested modal chaos if avoidable.
- Dialog content should scroll; footer stays visible.
- Candidate list must be grouped by type for mixed blocks.
- Preview items remain non-clickable in admin preview; explicit "Open in CMS" is the editable path.
- Admin preview may reuse existing data shape, but must not import or restyle patient home visual primitives as part of this phase.

### Files

New candidate files:

- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockEditorDialog.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockEditorItems.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockCandidatePicker.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockRuntimeStatus.tsx`

Modify:

- `PatientHomeBlockSettingsCard.tsx`
- `PatientHomeBlockItemsDialog.tsx` (can be folded into new editor)
- `PatientHomeAddItemDialog.tsx` (can be replaced)
- `PatientHomeRepairTargetsDialog.tsx` (can be integrated)
- `actions.ts`

### Tests

- Editor opens from block card.
- `situations` editor shows section candidates and create CTA.
- Reorder/save still calls existing actions.
- Hidden item stays listed and can be shown.
- Missing target shows repair CTA.
- Mixed `subscription_carousel` groups candidates.

### Acceptance

- One clear "Настроить" entry point per block.
- Existing capabilities remain:
  - add;
  - hide/show;
  - reorder;
  - delete;
  - repair missing target.
- No runtime patient behavior changes.
- Targeted tests + typecheck + lint pass.

---

## Phase 3 - Inline Create Content Sections From Block Settings

### Goal

From a block that needs `content_section`, create a missing section without leaving the block editor and immediately add it to the block.

### Scope

1. Add server action:

   Suggested signature:

   ```ts
   export async function createContentSectionForPatientHomeBlock(input: {
     blockCode: string;
     title: string;
     slug?: string;
     description?: string;
     iconImageUrl?: string | null;
     coverImageUrl?: string | null;
     isVisible?: boolean;
     requiresAuth?: boolean;
   }): Promise<ActionState & { itemId?: string; slug?: string }>;
   ```

2. Validation:

   - doctor access;
   - block must allow `content_section`;
   - title required;
   - slug optional; if missing, generate with existing slug helper rules;
   - slug must be unique;
   - media URL validation same as section form;
   - defaults:
     - `isVisible=true`;
     - `requiresAuth=false`;
     - `description=""`.

3. Implementation:

   - create/upsert section through `deps.contentSections`;
   - add item through `deps.patientHomeBlocks.addItem`;
   - revalidate:
     - `/app/doctor/patient-home`;
     - `/app/settings/patient-home`;
     - `/app/doctor/content/sections`;
     - `/app/patient`;
     - `/app/patient/sections`.

4. UI:

   - in editor for `situations`, empty candidate list shows:
     - "Нет подходящих разделов";
     - "Создать раздел";
   - quick create form fields:
     - title;
     - slug with generated preview + manual override;
     - description;
     - icon;
     - cover;
     - requires auth checkbox.
   - after success:
     - new section appears in item list;
     - editor remains open;
     - success status shown.

5. Existing repair flow:

   - if a missing item has `targetRef='office-work'`, repair CTA should offer:
     - create section with this slug;
     - choose existing section;
     - hide/delete item.

### Files

- `apps/webapp/src/app/app/settings/patient-home/actions.ts`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeCreateSectionInlineForm.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockEditorDialog.tsx`
- `apps/webapp/src/app/app/settings/patient-home/actions.test.ts`
- RTL tests for inline form.

### Tests

- Server action rejects block that does not allow `content_section`.
- Server action creates section and adds item.
- Server action rejects duplicate slug.
- Media URL policy reused.
- UI creates section and calls `onSaved`.

### Acceptance

- Empty `situations` block can be filled from settings without visiting separate CMS section page.
- Created section has icon/cover fields available immediately.
- No slug hardcode from `CONTENT_PLAN.md`.
- Targeted tests + typecheck + lint pass.

---

## Phase 4 - Safe Section Slug Rename

### Goal

Allow changing a CMS section slug safely.

### Scope

1. Schema:

   - Add `content_section_slug_history`.
   - Add migration and rollback SQL.
   - Export schema in `apps/webapp/db/schema/index.ts`.

2. Module/port:

   Extend content sections port or add a dedicated module-level operation:

   ```ts
   renameSlug(input: {
     oldSlug: string;
     newSlug: string;
     changedByUserId: string;
   }): Promise<void>;
   resolveCurrentSlug(slug: string): Promise<{ currentSlug: string; redirected: boolean } | null>;
   ```

   Preferred placement:

   - port type in a module or infra-facing type already used by content section service;
   - implementation in `pgContentSections.ts` via Drizzle transaction.

3. Rename transaction:

   In one transaction:

   - verify old section exists;
   - verify new slug valid and not already used;
   - update `content_sections.slug`;
   - update `content_pages.section` where equals old slug;
   - update `patient_home_block_items.target_ref` where `target_type='content_section'` and `target_ref=oldSlug`;
   - insert/update `content_section_slug_history(old_slug, new_slug)`;
   - if old slug already has history, keep chain bounded and resolve to final slug.

4. Patient redirect:

   In `/app/patient/sections/[slug]/page.tsx`:

   - if direct `getBySlug(slug)` fails;
   - check history;
   - redirect to current slug if found;
   - otherwise 404/empty as current behavior.

   This is a behavioral redirect only. Do not redesign `/app/patient/sections/*`; that route is not part of this initiative's visual scope.

5. Admin UI:

   In `SectionForm` edit mode:

   - keep current slug displayed;
   - add button "Изменить slug";
   - show modal with:
     - current slug;
     - new slug;
     - impact list:
       - patient home items count;
       - content pages count;
       - route redirect note;
     - confirm action.

6. Revalidation:

   - old and new section routes;
   - patient home;
   - doctor content sections;
   - patient-home settings.

### Files

- `apps/webapp/db/schema/contentSectionSlugHistory.ts` or add to existing schema.
- `apps/webapp/db/drizzle-migrations/00xx_content_section_slug_history.sql`
- `apps/webapp/src/infra/repos/pgContentSections.ts`
- `apps/webapp/src/infra/repos/pgContentSections.test.ts`
- `apps/webapp/src/app/app/doctor/content/sections/actions.ts`
- `apps/webapp/src/app/app/doctor/content/sections/SectionSlugRenameDialog.tsx`
- `apps/webapp/src/app/app/doctor/content/sections/SectionForm.tsx`
- `apps/webapp/src/app/app/patient/sections/[slug]/page.tsx`
- `docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/ROLLBACK_SQL.md`

### Tests

- Rename updates:
  - `content_sections.slug`;
  - `content_pages.section`;
  - `patient_home_block_items.target_ref`.
- Duplicate new slug rejected.
- Invalid new slug rejected.
- History redirect works.
- UI opens rename dialog and submits.

### Acceptance

- User can change slug through explicit flow.
- Existing patient-home items continue to resolve.
- Old section URL redirects to new URL.
- No orphaned home block refs after rename.
- Targeted tests + db verify + typecheck + lint pass.

---

## Phase 5 - Create/Return Flows For Materials And Courses

### Goal

Make non-section targets practical from block settings too.

### Scope

1. `daily_warmup` / `sos` / `subscription_carousel` material creation:

   Minimum acceptable implementation:

   - "Создать материал в CMS" button;
   - route to CMS new content form with query:
     - `returnTo=/app/doctor/patient-home`;
     - `patientHomeBlock=<code>`;
     - optional `suggestedTitle`, `suggestedSlug`.
   - after saving content, show CTA "Добавить в блок главной" if query exists.

   Better final implementation:

   - quick draft material creation with title, slug, section, image, summary;
   - created as unpublished draft;
   - auto-add item to block;
   - link "Дописать материал в CMS".

2. `courses` flow:

   Minimum:

   - "Создать курс" opens existing course creation route with returnTo;
   - after publish, course appears in candidate picker.

   Do not create incomplete published courses inline.

3. `subscription_carousel` mixed flow:

   - tabs/groups:
     - "Разделы";
     - "Материалы";
     - "Курсы";
   - each group has its own "Создать ..." CTA.

4. Candidate picker quality:

   - show published/visible status;
   - hide archived courses by default;
   - search by title and slug/id.

### Files

Likely files:

- `PatientHomeBlockCandidatePicker.tsx`
- `PatientHomeCreatePageQuickFlow.tsx` if quick draft is implemented.
- CMS content form/page files if returnTo support is chosen.
- Course creation page if returnTo support is chosen.
- `actions.ts` for helper actions.

### Tests

- Candidate groups render correctly.
- Material create/return action preserves block context.
- Course create link includes returnTo.
- Adding a created/published item still validates target existence.

### Acceptance

- Editor can fill every item-list block type without needing product knowledge of internal tables.
- `situations` is fully inline.
- Materials/courses have at least a clear return flow.
- No course model changes.

---

## Phase 6 - Final QA, Docs, And Release Readiness

### Goal

Close the initiative with docs, test matrix, and release checks.

### Scope

- Update `LOG.md` with all phase statuses.
- Update `apps/webapp/src/modules/patient-home/patient-home.md` with editor workflow notes.
- Update or create rollback SQL docs for new migrations.
- Run phase-level tests for changed scope.
- Before push or explicit release rehearsal:
  - `pnpm install --frozen-lockfile`;
  - `pnpm run ci`.
- Manual QA checklist:
  - empty `situations` block -> create section inline -> appears on patient home;
  - created section has icon fallback and CMS edit link;
  - rename section slug -> home item still resolves -> old patient URL redirects;
  - block visible but empty -> admin warning;
  - course block uses published courses only;
  - subscription carousel mixed groups.

### Acceptance

- All phase acceptance criteria passed.
- No mandatory audit fixes remain.
- Docs index links to this initiative.
- Full CI green before push/release.

## 5. Cross-Phase Test Policy

Use targeted tests while developing each phase.

Run full root CI only:

- before push;
- in final Phase 6 release readiness;
- if root/package/CI/shared tooling changes.

Minimum per phase:

```bash
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp lint
pnpm --dir apps/webapp exec vitest run <changed test files>
```

If a phase adds DB schema:

```bash
pnpm --dir apps/webapp run db:verify-public-table-count
```

## 6. Composer Guardrails

Composer must not:

- invent paths or service names;
- add env vars;
- hardcode editorial slug values from `CONTENT_PLAN.md`;
- execute prompts from `PATIENT_APP_VISUAL_REDESIGN_INITIATIVE`;
- change patient visual shell/nav/card styling;
- change courses or treatment program schema except where explicitly scoped;
- make raw `pool.query` runtime code for new work;
- add new files to ESLint architecture allowlist;
- silently skip tests;
- collapse multiple phases into one large change.

Composer should:

- keep each phase independently reviewable;
- update `LOG.md` after each EXEC/FIX;
- prefer existing UI components;
- use Drizzle for new DB work;
- make labels and empty states precise;
- keep patient runtime behavior unchanged unless phase explicitly says otherwise.

