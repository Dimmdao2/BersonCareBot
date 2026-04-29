# SLUG_RENAME — wiring task (follow-up для GPT 5.5)

## Контекст

В unified-ветке `unify/patient-2026-04-29` (Вариант A merge `patient-home-redesign-initiative` + `patient-app-visual-redesign-initiative`) **infrastructure** для slug rename перенесена, но UI/server-action **не подключён** в существующие формы. Этот документ — спецификация follow-up задачи для агента GPT 5.5.

## Что уже есть в unified-ветке (готовые компоненты и утилиты)

| Артефакт | Путь | Статус |
| -------- | ---- | ------ |
| Drizzle migration | `apps/webapp/db/drizzle-migrations/0012_content_section_slug_history.sql` | ✅ применима |
| Drizzle schema | `apps/webapp/db/schema/schema.ts` (`contentSectionSlugHistory`) | ✅ |
| Resolver function | `apps/webapp/src/infra/repos/resolvePatientContentSectionSlug.ts` | ✅ + unit-test |
| Slug validation | `apps/webapp/src/shared/lib/contentSectionSlug.ts` | ✅ + unit-test |
| Rename Dialog UI | `apps/webapp/src/app/app/doctor/content/sections/SectionSlugRenameDialog.tsx` | ✅ компилируется |
| Stub action | `apps/webapp/src/app/app/doctor/content/sections/actions.ts` (`renameContentSectionSlug`) | 🟡 stub, возвращает ошибку |

## Что нужно сделать

### 1. Реализовать server action `renameContentSectionSlug`

Файл: `apps/webapp/src/app/app/doctor/content/sections/actions.ts`.

Заменить stub на полную реализацию (atomic transaction):
1. Валидировать `oldSlug`/`newSlug` через `validateContentSectionSlug`.
2. В транзакции:
   - Проверить, что `content_sections.slug = oldSlug` существует.
   - Проверить, что `newSlug` не занят.
   - `UPDATE content_sections SET slug = $newSlug WHERE slug = $oldSlug`.
   - `UPDATE content_pages SET section = $newSlug WHERE section = $oldSlug`.
   - `UPDATE patient_home_block_items SET item_ref_id = $newSlug WHERE target_type = 'content_section' AND item_ref_id = $oldSlug`.
   - `INSERT INTO content_section_slug_history (old_slug, new_slug, changed_by_user_id) VALUES ($oldSlug, $newSlug, $userId)`.
3. `revalidatePath` для doctor/content/sections и patient/sections.
4. Вернуть `{ ok: true, newSlug }`.

Эталон реализации — visual-tip коммит `apps/webapp/src/infra/repos/pgContentSections.ts` (`renameSectionSlug` метод, см. `git show backup/visual-with-dirty-2026-04-29:apps/webapp/src/infra/repos/pgContentSections.ts`).

### 2. Расширить `ContentSectionsPort`

Файл: `apps/webapp/src/infra/repos/pgContentSections.ts`.

Добавить методы:
- `getRedirectNewSlugForOldSlug(oldSlug: string): Promise<string | null>` — `SELECT new_slug FROM content_section_slug_history WHERE old_slug = $1 LIMIT 1`.
- `renameSectionSlug(oldSlug, newSlug): Promise<RenameSectionSlugResult>` (использовать в action).

Также добавить метод в `ContentPagesPort` (`apps/webapp/src/infra/repos/pgContentPages.ts`):
- `countPagesWithSectionSlug(sectionSlug: string): Promise<number>` — для `pagesAffectedCount` props в Dialog.

Эталоны — visual-tip версии файлов.

### 3. Wired Dialog в `SectionForm`

Файл: `apps/webapp/src/app/app/doctor/content/sections/SectionForm.tsx`.

В режиме `isEdit`:
- Принять `pagesInSection: number` props.
- Рендерить `<SectionSlugRenameDialog oldSlug={section.slug} pagesAffectedCount={pagesInSection} />` в области slug-display (рядом с disabled inputом).

Файл: `apps/webapp/src/app/app/doctor/content/sections/edit/[slug]/page.tsx`.

- Вызвать `deps.contentPages.countPagesWithSectionSlug(slug)` и пробросить результат в `<SectionForm pagesInSection={...} />`.

### 4. Wired patient slug-redirect

Файл: `apps/webapp/src/app/app/patient/sections/[slug]/page.tsx`.

Заменить прямой `deps.contentSections.getBySlug(slug)` на:
```ts
const result = await resolvePatientContentSectionSlug(
  {
    getBySlug: (s) => deps.contentSections.getBySlug(s),
    getRedirectNewSlugForOldSlug: (s) => deps.contentSections.getRedirectNewSlugForOldSlug(s),
  },
  slug,
);
if (!result) notFound();
if (result.canonicalSlug !== slug) {
  permanentRedirect(`/app/patient/sections/${encodeURIComponent(result.canonicalSlug)}`);
}
const section = result.section;
```

Восстановить тест `apps/webapp/src/app/app/patient/sections/[slug]/page.slugRedirect.test.tsx` (см. историю в `backup/visual-with-dirty-2026-04-29`), при необходимости расширив моки `buildAppDeps` (добавить `patientHomeBlocks.listBlocksWithItems: async () => []`, `resolvePatientCanViewAuthOnlyContent`).

## Дополнительно (CMS return-flow интеграция)

Утилита `apps/webapp/src/modules/patient-home/patientHomeCmsReturnUrls.ts` уже есть (с тестами). Wiring в формы — отдельный шаг той же задачи:

- `ContentForm.tsx`, `SectionForm.tsx`: success-banner с возвратом по `returnTo` query.
- `content/new/page.tsx`, `sections/new/page.tsx`: парсить `parsePatientHomeCmsReturnQuery(searchParams)` и пробросить в форму как `patientHomeContext`.
- `courses/new/page.tsx`: уже wired (referrence-implementation).

## Acceptance criteria

1. `pnpm run ci` зелёный.
2. Slug rename для CMS-раздела работает в админке (создание-rename-просмотр пациентом).
3. Старый slug в URL пациента → 301 редирект на новый slug.
4. `content_section_slug_history` пишется при rename, `changed_by_user_id` заполняется.
5. UI в `SectionForm` показывает «X страниц будет переадресовано» по `countPagesWithSectionSlug`.

## Риски / hint-ы

- В транзакции rename важно обновить `patient_home_block_items.item_ref_id` для `target_type = 'content_section'` (item_ref_id хранит slug).
- `home`-схема `patient_home_block_items` — это таблица из migration `0008_material_frightful_four.sql` (см. home tip).
- Не использовать `getPool` в новом коде — переписать на Drizzle через `getDrizzle()` (см. как в `pgContentPages.ts` после home migration to Drizzle).
