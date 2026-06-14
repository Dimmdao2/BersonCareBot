# Контент page rework — implementation plan

Generated: 2026-06-14. Branch: `feat/doctor-ui-rebuild` (worktree `doctor-pages`).

---

## 1. Current implementation map

### Page entry

**`apps/webapp/src/app/app/doctor/content/page.tsx`** (L1-289)

Server component. Loads `deps.contentPages.listAll()` and `deps.contentSections.listAll()`, then groups pages by section. Active section driven by `?section=` (article kind) or `?systemParentCode=` (system cluster root). Renders `DoctorAppShell` wrapping two-column layout: sidebar left, section-list right.

Key helpers used here:
- `groupBySection` — pure client-side group-by
- `isArticlePage` / `isHelpSectionSlug` / `isSectionSlugProtectedFromDelete` from `content-sections/types.ts`
- `SYSTEM_PARENT_CODES` ("situations" | "sos" | "warmups" | "lessons")

### Left sidebar

**`apps/webapp/src/app/app/doctor/content/ContentPagesSidebar.tsx`** (L1-124)

Static nav built with `<Link>`. Four fixed groups: Мотивации link, Разделы link, Справка (help section), Статьи (article sections from DB + Все страницы catch-all), Системные папки (`SYSTEM_PARENT_CODES` hard-coded). No collapsing or active-section highlighting beyond class toggling.

**Not** the target IA: current sidebar mixes nav entry points (Мотивации, Разделы as management pages) rather than acting as a pure left-panel switcher.

### Section list (right panel)

**`apps/webapp/src/app/app/doctor/content/ContentPagesSectionList.tsx`** (L1-356)

"use client". DnD-sortable list of pages within one section. Each row:
- Drag handle
- Title link → `/app/doctor/content/edit/[id]`
- Slug (monospace hint)
- `requiresAuth` toggle button (Shield/ShieldOff) — calls `setContentPageRequiresAuth` server action
- `ContentLifecycleDropdown` (publish/archive/delete)

**No** card/tile view. **No** list/card toggle. **No** rating display in list. Visibility here is `requiresAuth` (auth-gate), not the section's `isVisible` (on-home visibility). The section-level `isVisible` toggle lives on the sections admin page instead.

### Content editor (separate route)

**`apps/webapp/src/app/app/doctor/content/edit/[id]/page.tsx`** (L1-60)

Full-page route (separate navigate), not a slide-in right-pane. Uses `DoctorAppShell` with `backHref`. Embeds `ContentForm`.

**`apps/webapp/src/app/app/doctor/content/ContentForm.tsx`** (L1-343)

Fields: title, section (select), slug (with auto-gen), summary (Textarea), body_md (MarkdownEditorToastUi), isPublished (checkbox), requiresAuth (checkbox), linkedCourseId (select), image (MediaLibraryPickerDialog), video (MediaLibraryPickerDialog), preview toggle. Saves via `saveContentPage` server action in `actions.ts`. Rating summary shown read-only from `deps.materialRating.getPublicAggregate`.

### New page route

**`apps/webapp/src/app/app/doctor/content/new/page.tsx`** — same `ContentForm` but without `page` prop (creation mode).

### Lifecycle

**`apps/webapp/src/app/app/doctor/content/ContentLifecycleDropdown.tsx`** (L1-145)

Menu: Редактировать (router.push to edit route), В архив / Из архива, Удалить / Восстановить. Plus inline publish/unpublish Eye/EyeOff button. Server action: `applyContentLifecycleForm` in `lifecycleActions.ts`.

### Section visibility

**`apps/webapp/src/app/app/doctor/content/sections/sectionVisibilityActions.ts`** (L1-49)

Two server actions: `setSectionVisibility(slug, isVisible)` and `setSectionRequiresAuth(slug, requiresAuth)`. Both call `deps.contentSections.update(slug, patch)` and revalidate `/app/patient` + `/api/menu`.

### Section management (separate route)

**`apps/webapp/src/app/app/doctor/content/sections/`**: separate full-page CRUD for sections (list `/sections`, new `/sections/new`, edit `/sections/edit/[slug]`).

### Motivation (separate route)

**`apps/webapp/src/app/app/doctor/content/motivation/`**: separate sub-page `/content/motivation` with drag-sortable quote rows (`MotivationListClient`), Eye/EyeOff toggle per quote, inline edit expand.

### Media library (separate route)

**`apps/webapp/src/app/app/doctor/content/library/`**: at `/app/doctor/content/library`. Has `MediaLibraryClient` (upload, grid of `MediaCard` components), `MediaLightbox`, `MediaCardActionsMenu`. Already fully functional.

### Backend ports

**`ContentPagesPort`** — defined inline in `apps/webapp/src/infra/repos/pgContentPages.ts` (L45-59). Methods: `listBySection`, `getBySlug`, `getById`, `listAll`, `upsert`, `updateFull`, `updateLifecycle`, `reorderInSection`, `countPagesWithSectionSlug`, `listMetaByIds`.

**`ContentSectionsPort`** — `apps/webapp/src/modules/content-sections/ports.ts` (L48-88). Has `listAll`, `getBySlug`, `upsert`, `update` (patch including `isVisible`, `requiresAuth`), `reorderSlugs`, `renameSectionSlug`, `deleteSectionWithPageReassign`.

**No `viewsCount` in `content_pages`** — the DB schema (`schema.ts` L458-482) has no views column. The wireframe's "👁 views" is aspirational. Rating (avg/count) exists via `materialRating.getAggregate` (used already in the edit page).

---

## 2. Target IA (from wireframe `#p-content`, lines 1860-2012)

### Left navigation panel

Two labelled groups:

**Системные разделы** (fixed, never deletable):
1. Главная пациента (links to patient-home block editor)
2. Разминки (warmups system cluster)
3. SOS
4. Ситуации
5. Уроки · Новости · Мотивации (lessons cluster, with Мотивации subgroup)

**Статьи и страницы** (user-created, "+" button adds new section):
- Each article section listed as nav item
- Renameable and deletable

**Медиа**:
- Файлы и медиа link (to library page/pane)

Clicking a nav item switches the right panel client-side (no server re-fetch per tab — see memory `doctor-tabs-load-once-client.md`).

### Right panel per section

**Material cards view (target for all sections)**:

Card shows:
- Preview (image or video thumbnail)
- Title (bold)
- Slug (monospace hint)
- Rating chip: ★ avg (e.g. "★ 5.0") in green; or "скрыта" chip when hidden
- 👁 eye toggle button (isVisible on-home, currently only on sections not pages)
- ⋮ context menu (Редактировать, В архив, Удалить)

**Toggle**: ☰ список / ⊞ карточки button in the panel header (DoctorCatalogMasterListHeader).

Header also shows: section title, page count hint, "Создать" button, "Редактировать раздел" link.

**List view row** (same data, horizontal):
- Media icon (▶)
- Title + slug
- Rating chip
- 👁 eye toggle
- ⋮ menu

### Material editor (right pane, not separate route)

Opened by clicking a card/row. Target: inline right pane (master-detail split), not a full-page navigate. Shows `← к списку` back button.

Fields: Заголовок, Раздел (select), Slug, Краткое описание, Содержимое (markdown Toast UI), ✓ Опубликовано, ✓ Только для залогиненных, Картинка (MediaLibraryPickerDialog), Видео (MediaLibraryPickerDialog), Связан с курсом, Сохранить button.

### Главная пациента panel

Blocks list with 👁 visibility toggle per block, ⚙ content picker, 🔒 for undeletable blocks (plan, booking). This already exists at `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient.tsx`. Navigation entry is the only gap.

### Файлы и медиа panel

Existing `MediaLibraryClient` embedded as a panel (instead of separate route).

---

## 3. Gap analysis

| Area | Current state | Gap |
|---|---|---|
| **Left nav IA** | Static links to separate sub-routes (Motivation, Sections) + systemParentCode filter params | Must become a pure client-side switcher panel; "Главная пациента" and "Файлы и медиа" entries must appear in it |
| **Material card view** | None — list only (text rows in ContentPagesSectionList) | Need `ContentPageTileCard` component (image preview, rating chip, 👁 toggle, ⋮ menu) |
| **List/card toggle** | None | Need `DoctorCatalogMasterListHeader` wired to view state |
| **Rating display in list/card** | Shown only in edit page header (one item) | Need batch rating fetch for list view: new `listRatings(ids)` port method or defer per-card async |
| **👁 visibility toggle on pages** | `requiresAuth` toggle exists in ContentPagesSectionList; `isVisible` toggle only on sections | Need page-level `isPublished` toggle in card/row (the Eye button is currently lifecycle-only, not inline per card) |
| **Section `isVisible` in left nav** | Not shown; lives on `/content/sections` page | Show `isVisible` next to each section nav item (small Eye badge) |
| **Editor as right pane** | Full-page navigate to `/content/edit/[id]` | Convert to `CatalogSplitLayout` right-pane (or keep separate route and just style the page consistently — see risk note below) |
| **"+" new section action** | Via separate `/content/sections/new` route | Keep route but surface it as the "+" button in left nav "Статьи и страницы" label |
| **Главная пациента in Контент nav** | At `/app/doctor/patient-home` — no Контент nav entry | Add nav item + render `PatientHomeBlocksSettingsPageClient` inline or link to `/app/doctor/patient-home` |
| **Файлы и медиа in Контент nav** | At `/app/doctor/content/library` as separate page | Add nav item that renders `MediaLibraryClient` inline or links to existing route |
| **Мотивации** | Separate `/content/motivation` route | Add nav item that links to or embeds `MotivationListClient` |
| **Rating batch for list** | No backend method | Needs new port method or embed async-on-demand |
| **viewsCount** | No DB column, not in port | Out of scope for this rework (aspirational in wireframe only) |

---

## 4. Shared catalog primitives to reuse

All from `apps/webapp/src/shared/ui/doctor/catalog/` and `apps/webapp/src/shared/ui/doctor/`:

### `CatalogSplitLayout`
`import { CatalogSplitLayout } from "@/shared/ui/doctor/catalog/CatalogSplitLayout"`

Props: `left`, `right`, `mobileView: "list"|"detail"`, `mobileBackSlot`. CSS: 2-column grid on `lg:`, absolute slide-in on mobile. Usage in exercises (`ExercisesPageClient.tsx` L339-405):

```tsx
<CatalogSplitLayout
  left={<CatalogLeftPane ...>{/* list or tiles */}</CatalogLeftPane>}
  right={<CatalogRightPane className="h-full"><ExerciseForm ... /></CatalogRightPane>}
  mobileView={mobileSheet != null ? "detail" : "list"}
  mobileBackSlot={mobileSheet != null ? <Button ...>← Назад</Button> : null}
/>
```

For Контент: left = nav + section page-list (cards/rows), right = ContentForm inline.

### `CatalogLeftPane`
`import { CatalogLeftPane } from "@/shared/ui/doctor/catalog/CatalogLeftPane"`

Props: `headerSlot`, `children`, `stickySplit`, `stickyToolbarRows`, `className`. Renders `<aside>` with border/card bg + scroll. Usage:

```tsx
<CatalogLeftPane
  stickySplit={false}
  headerSlot={<DoctorCatalogMasterListHeader summaryLine="Материалов: N" viewMode={viewMode} onToggleView={...} titleSort={null} onTitleSortChange={...} />}
>
  {/* list rows or VirtualizedItemGrid tiles */}
</CatalogLeftPane>
```

### `CatalogRightPane`
`import { CatalogRightPane } from "@/shared/ui/doctor/catalog/CatalogRightPane"`

Thin wrapper (border + padding). Wraps the editor form.

### `DoctorCatalogMasterListHeader`
`import { DoctorCatalogMasterListHeader } from "@/shared/ui/doctor/DoctorCatalogMasterListHeader"`

Props: `summaryLine`, `viewMode: "tiles"|"list"`, `onToggleView`, `titleSort`, `onTitleSortChange`, `listBusy?`, `archiveScope?`. Renders sort select + count text + ☰/⊞ toggle button. Exercises usage (ExercisesPageClient.tsx L351-365):

```tsx
<DoctorCatalogMasterListHeader
  summaryLine={displayExercises.length === 0 ? "Нет упражнений" : `Упражнений: ${displayExercises.length}`}
  viewMode={toolbarViewMode}
  onToggleView={toggleViewMode}
  titleSort={filters.titleSort}
  onTitleSortChange={changeTitleSort}
  listBusy={isListPending}
/>
```

For Контент: same pattern; `summaryLine` = "Материалов: N"; no `archiveScope` initially (all pages shown).

### `VirtualizedItemGrid`
`import { VirtualizedItemGrid } from "@/shared/ui/doctor/catalog/VirtualizedItemGrid"`

Props: `items`, `columns`, `estimatedRowHeight`, `renderItem`, `keyExtractor`, `containerClassName`, `gridClassName`. Virtualizes a CSS grid. Usage:

```tsx
<VirtualizedItemGrid
  items={displayPages}
  columns={3}
  estimatedRowHeight={160}
  keyExtractor={(p) => p.id}
  renderItem={(p) => <ContentPageTileCard page={p} onSelect={...} isActive={...} />}
/>
```

### `DoctorCatalogFiltersToolbar` / `DoctorCatalogPageLayout`
`import { DoctorCatalogFiltersToolbar, DoctorCatalogToolbarFiltersSlot } from "@/shared/ui/doctor/DoctorCatalogFiltersToolbar"`
`import { DoctorCatalogPageLayout } from "@/shared/ui/doctor/catalog/DoctorCatalogPageLayout"`

Optional: `DoctorCatalogPageLayout` wraps toolbar + split. Can be used if a search/filter bar is wanted in a later step (not needed for MVP).

### `DoctorAppShell` + `DoctorPageHeader`
Already used in current `page.tsx`. Keep `DoctorAppShell`. The sidebar nav shifts to a left panel _inside_ the page, separate from the app shell.

---

## 5. Incremental implementation plan

Each step is independently committable and shippable on its own.

---

### Step 1 — Rebuild the left navigation as a client-side panel switcher (pure UI, no new backend)

**Scope**: Replace `ContentPagesSidebar` with a new `ContentNav` client component that holds active-pane state internally. Clicking a nav item changes `activePaneKey` state; does not navigate. The right panel renders the existing `ContentPagesSectionList` per section (unchanged).

**Files to add/edit**:
- `apps/webapp/src/app/app/doctor/content/ContentNav.tsx` — new "use client" component. Accepts `{ articleSections, systemSections }` props. State: `activePaneKey: string`. Renders nav items grouped as described in §2. On click sets state; items get aria-current + active styling.
- `apps/webapp/src/app/app/doctor/content/page.tsx` — replace `ContentPagesSidebar` + URL-query logic with `<ContentNav>` + client-tab pattern. Simplify: remove `?section` / `?systemParentCode` query-param reading (move to ContentNav client state). Pass all sections and pages down as props.

**Sidebar entries** (in ContentNav):
- Системные: Главная пациента, Разминки, SOS, Ситуации, Уроки·Новости·Мотивации
- Статьи и страницы (label + "+" link to `/content/sections/new`)
- Each article section from DB
- Медиа: Файлы и медиа

Nav items for Главная пациента and Файлы и медиа can initially be links (`<Link>`) to existing routes; content embedding comes in Step 5.

**Layer touched**: UI only (page component + new client component).

**Test/verify**: Navigate to `/app/doctor/content`, click each sidebar item, confirm right panel switches without full-page navigate. Existing functionality (section lists, lifecycle dropdowns) remains untouched.

**Backend dependency**: None.

---

### Step 2 — Material tile card + list/card toggle in section right-panel (UI only)

**Scope**: Add `ContentPageTileCard` component and wire `DoctorCatalogMasterListHeader` into the right panel for each section. The right panel switches between card grid (`VirtualizedItemGrid`) and the existing list rows.

**Files to add/edit**:
- `apps/webapp/src/app/app/doctor/content/ContentPageTileCard.tsx` — new component. Props: `page: ContentPageListRow & { imageUrl?: string | null; ratingAvg?: number | null }`, `onSelect`, `isActive`. Renders: preview area (image via `<img>` or `<MediaThumb>`, else gradient placeholder), title, slug, rating chip (★ avg or empty), 👁 Eye button (toggles `isPublished` inline via existing `applyContentLifecycleForm` publish action), ⋮ `ContentLifecycleDropdown`. Pattern mirrors `ExerciseTileCard` in exercises.
- `apps/webapp/src/app/app/doctor/content/ContentPagesSectionList.tsx` — add `viewMode: "list" | "tiles"` prop. In tiles mode render `VirtualizedItemGrid<ContentPageListRow>` with `ContentPageTileCard`. In list mode keep existing `SortablePageRow` list (DnD stays list-only for now). Add `DoctorCatalogMasterListHeader` as the section header slot.
- `apps/webapp/src/app/app/doctor/content/ContentNav.tsx` — pass `viewMode` state down (or store per-section in localStorage like exercises do).

**Note on `imageUrl`**: `ContentPageListRow` (L31-41 of `ContentPagesSectionList.tsx`) currently does not include `imageUrl`. Add it to the type and include it in the `toListRow` mapping in `page.tsx` (it's available from `ContentPageRow`).

**Note on rating**: For Step 2 skip batch rating — show rating only when already loaded (empty / skeleton). Batch fetch is Step 3.

**Layer touched**: UI only. Existing server actions (lifecycle, requiresAuth) reused as-is.

**Test/verify**: Toggle between ☰ and ⊞ in section header; confirm cards render with preview placeholder and lifecycle menu works; confirm list DnD still functional.

**Backend dependency**: None.

---

### Step 3 — Batch rating fetch for card/list display (backend port method + UI)

**Scope**: Expose a batch aggregate method on `materialRating` so the section list can show per-page rating without N+1 fetches.

**Files to add/edit**:
- `apps/webapp/src/modules/material-rating/ports.ts` — add `listAggregates(input: { targetKind: MaterialRatingTargetKind; targetIds: string[] }): Promise<Map<string, MaterialRatingAggregate>>` to `MaterialRatingPort`.
- `apps/webapp/src/infra/repos/pgMaterialRating.ts` — implement with a single SQL query grouping by `target_id` (WHERE `target_id = ANY($1)` + `GROUP BY`).
- `apps/webapp/src/modules/material-rating/service.ts` — expose `listAggregates` through the service (pass-through after auth check; no patient-visible restriction needed for doctor context).
- `apps/webapp/src/app/app/doctor/content/page.tsx` — after `pages = await deps.contentPages.listAll()`, load `ratingMap = await deps.materialRating.listAggregates({ targetKind: "content_page", targetIds: pages.map(p => p.id) })`. Pass ratings into the section list as `ratingsById: Map<string, { avg: number | null; count: number }>`.
- `apps/webapp/src/app/app/doctor/content/ContentPagesSectionList.tsx` and `ContentPageTileCard.tsx` — accept `ratingsById` and display `★ avg` chip.

**Layer touched**: Module port + infra repo + page server component + UI display.

**Test/verify**: Cards show correct ratings. Section with no ratings shows empty chip. Confirm no N+1 (one extra query per page load, not per card).

**Backend dependency**: New port method + SQL query (no schema migration needed, reads from existing `material_ratings` table).

---

### Step 4 — Inline editor right pane (master-detail split for the content page)

**Scope**: Convert the content list + editor into `CatalogSplitLayout`: clicking a card/row opens `ContentForm` in the right pane instead of navigating to `/content/edit/[id]`.

**Files to add/edit**:
- `apps/webapp/src/app/app/doctor/content/ContentSectionPanel.tsx` — new "use client" component. Props: `sectionSlug`, `pages: ContentPageListRow[]`, `sections: ContentSectionRow[]`, `ratingsById`, `publishedCourses`. State: `selectedPageId: string | null`. Renders `CatalogSplitLayout` with:
  - `left`: `CatalogLeftPane` with `DoctorCatalogMasterListHeader` header + card/list grid
  - `right`: `CatalogRightPane` wrapping `ContentFormInline` (see below)
  - `mobileView` based on selection
  - `mobileBackSlot`: "← к списку" button
- `apps/webapp/src/app/app/doctor/content/ContentFormInline.tsx` — thin wrapper around `ContentForm` that loads the full page record client-side (via a server action / `getById` fetch) when `selectedPageId` changes. Or: pass the full `ContentPageRow` list from the server (more data upfront, simpler client logic).
- `apps/webapp/src/app/app/doctor/content/page.tsx` — replace `ContentPagesSectionList` calls with `ContentSectionPanel`. The existing `/content/edit/[id]` route remains as a fallback deep-link; it is not removed.
- `apps/webapp/src/app/app/doctor/content/actions.ts` — `saveContentPage` already revalidates paths; it also needs to update `selectedPageId` after save. Pass `onSaved` callback from `ContentSectionPanel`.

**Important risk**: `ContentForm` uses `MarkdownEditorToastUi` (dynamic import) which has known hydration sensitivity. Wrap in `Suspense` with a loading skeleton. Test markdown editor mount in the right pane carefully before marking done.

**Layer touched**: UI (new components), page component. No new backend needed.

**Test/verify**: Click a card → right pane slides in with ContentForm pre-filled; save → form updates in place; ← button returns to list. Mobile: list → tap card → slide to editor → ← back to list.

**Backend dependency**: None (uses existing `saveContentPage` action).

---

### Step 5 — Embed Файлы и медиа and Главная пациента as panels in ContentNav

**Scope**: Wire the two remaining nav items to render inline panels instead of linking to separate routes.

**Files to add/edit**:
- `apps/webapp/src/app/app/doctor/content/ContentNav.tsx` — when `activePaneKey === "media"` render `<MediaLibraryClient>` (import from `./library/MediaLibraryClient`); when `activePaneKey === "patient-home"` render a link or embed `PatientHomeBlocksSettingsPageClient`.

  For Главная пациента: the settings client needs async-loaded data (blocks, pages, sections, system settings). Two options:
  1. Simple: render a `<Link href="/app/doctor/patient-home">` from the nav item (1-line change, works immediately).
  2. Embedded: extract data loading into a new server RSC and render inline. More complex (requires Suspense streaming).

  **Recommended for this step**: Option 1 (Link). Option 2 deferred to a follow-up.

- `apps/webapp/src/app/app/doctor/content/page.tsx` — remove `MediaLibraryClient` standalone entry from `ContentPagesSidebar` if previously linked; the nav item now handles it.

**Layer touched**: UI only (nav wiring + conditional render).

**Test/verify**: Click "Файлы и медиа" in nav → MediaLibraryClient renders in right area. Click "Главная пациента" → navigates to `/app/doctor/patient-home`.

**Backend dependency**: None.

---

### Step 6 — Section `isVisible` badge in nav + page-level publish toggle in card (polish)

**Scope**: Surface the two visibility toggles that are currently hidden from the Контент hub.

**Files to add/edit**:
- `apps/webapp/src/app/app/doctor/content/ContentNav.tsx` — receive `sectionsWithVisibility: Array<{ slug, title, isVisible }>`. Render small Eye/EyeOff icon next to each article section nav item. On click call `setSectionVisibility` server action (already exists at `sections/sectionVisibilityActions.ts`).
- `apps/webapp/src/app/app/doctor/content/ContentPageTileCard.tsx` — the 👁 button on each card: wire it to toggle `isPublished` (not `isVisible`, which doesn't exist at page level — pages use `isPublished` as their visibility). The `ContentLifecycleDropdown` already has publish/unpublish, but it's in a menu. The card's inline Eye button should call the same `applyContentLifecycleForm("publish"|"unpublish")` action without opening the dropdown.

**Note**: The wireframe shows "👁 видна" on page cards as isPublished (published = visible to patient). There is no separate `isVisible` field on `content_pages` in the DB — do not add one. `isPublished` is the correct mapping.

**Layer touched**: UI only (no new backend, existing server actions used).

**Test/verify**: Eye toggle on a card publishes/unpublishes the page without navigating. Eye badge on section nav item toggles section visibility.

**Backend dependency**: None.

---

## 6. Главная пациента under Контент — wiring note

The patient-home block editor (`apps/webapp/src/app/app/doctor/patient-home/page.tsx`) is a full RSC that already has:
- 👁 per-block visibility (`setBlockVisibility` server action)
- ⚙ content picker per block (`PatientHomeBlockItemsDialog`)
- 🔒 lock badge for system blocks (plan, booking) — currently implemented in `PatientHomeBlockSettingsCard` by checking `blockCode`: blocks `"plan"` and `"booking"` have no delete/hide option (🔒 icon shown instead of eye toggle).

The only gap is navigation: there is no entry point from the Контент page.

**Implementation** (Step 5, Option 1): Add a nav item "Главная пациента" under "Системные разделы" in `ContentNav.tsx` that is a `<Link href="/app/doctor/patient-home">`. Zero new components, zero backend.

**Blocks that should show 🔒**:
- `plan` ("Мой план") — core clinical block, always visible
- `booking` ("Запись на приём") — booking CTA, always visible

Both are already marked as lock-only in the wireframe (line 1963, 1970: `🔒 Всегда виден`). The existing `PatientHomeBlockSettingsCard.tsx` renders this based on block code. No changes needed to the component; the nav wiring is sufficient.

---

## Biggest risks

1. **MarkdownEditorToastUi in right pane (Step 4)**: `dynamic(() => import("./ExerciseForm"), { loading: ... })` pattern used in exercises works. The content form must follow the same `dynamic` import. If Toast UI editor has CSS/SSR issues in a pane (not a full page), tests on actual dev instance are essential before shipping Step 4.

2. **Batch rating query (Step 3)**: The `material_ratings` table may be large. The `listAggregates` query must filter by `target_kind = 'content_page' AND target_id = ANY($1)`. Verify the existing index covers this (check schema for `idx_material_ratings_*`).

3. **Client-side nav state vs. deep-links (Step 1)**: Removing `?section` URL params from the Контент page means deep-linking to a section is lost. Acceptable if the nav is fast (client state). However, if the owner wants shareable URLs, a minimal compromise is to keep `?pane=` as a URL param initializer for `ContentNav` state (one extra `useEffect` on mount). Flag for decision.

4. **Rating display without `viewsCount`**: The wireframe shows "👁 views" on cards. There is no `views_count` column in `content_pages` and no view-tracking query in the infra. Do not add this column or table in this rework — treat it as a separate future initiative. Display only rating (avg stars) in the chip.

5. **Concurrent section-filter and DnD**: Current `ContentPagesSectionList` supports drag-reorder. In the new `ContentSectionPanel` (Step 4) with CatalogSplitLayout, DnD reorder in the left pane is still possible in list mode but not in tiles mode. Tiles view should not have DnD (matches exercises pattern). Ensure DnD is only rendered in list mode.
