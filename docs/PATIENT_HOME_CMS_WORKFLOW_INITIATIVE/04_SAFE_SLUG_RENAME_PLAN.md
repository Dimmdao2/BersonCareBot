# 04 - SAFE SLUG RENAME PLAN

## Goal

Разрешить безопасное переименование slug раздела с обновлением ссылок и сохранением redirect history.

## Scope

1. Add schema + migration for `content_section_slug_history`.
2. Implement transactional rename operation:
   - validate old/new slug;
   - update `content_sections.slug`;
   - update `content_pages.section`;
   - update `patient_home_block_items.target_ref` for `content_section`;
   - upsert history row.
3. Add explicit UI flow in section edit:
   - dedicated dialog/button;
   - impact summary before confirm.
4. Add redirect resolution on patient section route:
   - old slug -> new slug redirect.

## Candidate Files

- `apps/webapp/db/schema/*` (new history table)
- `apps/webapp/db/drizzle-migrations/00xx_content_section_slug_history.sql`
- `apps/webapp/src/infra/repos/pgContentSections.ts`
- `apps/webapp/src/app/app/doctor/content/sections/actions.ts`
- `apps/webapp/src/app/app/doctor/content/sections/SectionForm.tsx`
- `apps/webapp/src/app/app/doctor/content/sections/SectionSlugRenameDialog.tsx` (new)
- `apps/webapp/src/app/app/patient/sections/[slug]/page.tsx`
- `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/ROLLBACK_SQL.md` (new or update)

## Behavior Requirements

- Slug is not free-edited in main form.
- Rename is explicit confirm action.
- Prevent collisions with existing slug.
- Reject invalid slug format.
- Keep old route functional through redirect.

## Out Of Scope

- No visual redesign of patient section page.
- No redesign of section list UI beyond rename control.
- No changes to unrelated content entities.

## Documentation Artifacts

- create/update `ROLLBACK_SQL.md`
- update `LOG.md` with migration id and rename semantics

## Phase Checklist

- [x] Migration created and schema exported.
- [x] Transactional rename implemented.
- [x] All references updated atomically.
- [x] Redirect behavior added and tested.
- [x] Section edit UI provides dedicated rename flow.
- [x] Rollback SQL documented.
- [x] `LOG.md` updated.

## Test Gate (phase-level)

```bash
pnpm --dir apps/webapp exec vitest run <changed tests>
pnpm --dir apps/webapp run db:verify-public-table-count
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp lint
```

No full root CI here.

## Completion Criteria

- Slug rename no longer requires manual DB surgery.
- Existing links continue to work after rename.

