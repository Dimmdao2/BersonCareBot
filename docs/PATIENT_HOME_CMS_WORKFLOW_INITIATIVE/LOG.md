# LOG - PATIENT_HOME_CMS_WORKFLOW_INITIATIVE

## How To Use

Обновлять после каждого PLAN / EXEC / AUDIT / FIX.

Обязательные поля записи:

- Date/time
- Phase
- Mode (`PLAN` | `EXEC` | `AUDIT` | `FIX`)
- Branch
- Summary of changes
- Files touched (or reviewed in PLAN/AUDIT)
- Checks run
- Result (`pass` / `pass with notes` / `blocked`)
- Next step

---

## Template Entry

```md
## YYYY-MM-DD — Phase X — MODE

- Branch: `...`
- Scope:
  - ...
- Changed files:
  - `...`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run ...` — pass/fail
  - `pnpm --dir apps/webapp exec tsc --noEmit` — pass/fail
  - `pnpm --dir apps/webapp lint` — pass/fail
- Notes / deviations:
  - ...
- Next:
  - ...
```

---

## 2026-04-29 — Initialization

- Branch: `TBD`
- Scope:
  - Created initiative docs and decomposed execution plans.
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/README.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/MASTER_PLAN.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/PROMPTS_PLAN_EXEC_AUDIT_FIX.md`
- Checks:
  - docs self-review
- Result:
  - pass
- Next:
  - start Phase 0 PLAN using `00_AUDIT_UX_CONTRACT_PLAN.md`

---

## 2026-04-29 — Phase 0 — EXEC

- Branch: `patient-app-visual-redesign-initiative`
- Scope:
  - Phase 0 по `00_AUDIT_UX_CONTRACT_PLAN.md`: контракт редактора блоков и журнал (без кода, без миграций).
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Mandatory docs reviewed (доступные в дереве):
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/README.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/MASTER_PLAN.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/00_AUDIT_UX_CONTRACT_PLAN.md`
  - `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md` (ссылки на модель блоков; README redesign по путям из Phase 0 в репозитории отсутствует)
  - `.cursor/rules/clean-architecture-module-isolation.mdc`, `.cursor/rules/000-critical-integration-config-in-db.mdc` (просмотрены по чеклисту Phase 0)
- Code / paths из Phase 0:
  - Просмотрены: `apps/webapp/src/app/app/patient/page.tsx`, `apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx`, `PatientHomeSituationsRow.tsx`, `PatientHomeSubscriptionCarousel.tsx`.
  - Пути `settings/patient-home/*`, `modules/patient-home/blocks.ts`, `patientHomeResolvers.ts`, `patientHomeUnresolvedRefs.ts` — **отсутствуют** в дереве; зафиксировано в `BLOCK_EDITOR_CONTRACT.md`.
- Checks:
  - self-review docs only (без CI, без тестов)
- Result:
  - pass with notes (легаси-сборка главной без `patient_home_blocks`; контракт = целевое состояние инициативы + явный аудит снимка)
- Next:
  - Phase 1 EXEC по `01_DIAGNOSTICS_LABELS_PLAN.md` на ветке `patient-home-cms-workflow-initiative` после появления/мержа кода редактора и метаданных блоков

---

## 2026-04-29 — Phase 0 — FIX

- Branch: `patient-app-visual-redesign-initiative`
- Scope:
  - Закрытие mandatory fixes из `AUDIT_PHASE_0.md` §2 только документацией: исполняемый чеклист повторной верификации после появления `blocks.ts`, резолверов и путей редактора.
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_0.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - self-review docs (без CI, без тестов)
- Result:
  - pass
- Next:
  - на ветке с целевым кодом выполнить чеклист в `BLOCK_EDITOR_CONTRACT.md` («Обязательная повторная верификация»), затем при необходимости обновить запись Phase 0 / AUDIT

---

## 2026-04-29 — Phase 1 — EXEC

- Branch: `patient-app-visual-redesign-initiative`
- Scope:
  - Phase 1 по `01_DIAGNOSTICS_LABELS_PLAN.md`: метаданные редактора, копирайт превью/диалогов, строки для неразрешённых целей, экран `/app/doctor/patient-home`, редирект с `/app/settings/patient-home`, пункт меню врача.
- Changed files (основные):
  - `apps/webapp/src/modules/patient-home/blocks.ts`
  - `apps/webapp/src/modules/patient-home/blockEditorMetadata.ts`
  - `apps/webapp/src/modules/patient-home/blockEditorMetadata.test.ts`
  - `apps/webapp/src/modules/patient-home/patientHomeUnresolvedRefs.ts`
  - `apps/webapp/src/modules/patient-home/patientHomeUnresolvedRefs.test.ts`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockPreview.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeAddItemDialog.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/patientHomeBlockEditor.test.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/page.tsx`
  - `apps/webapp/src/app/app/doctor/patient-home/page.tsx`
  - `apps/webapp/src/app-layer/routes/paths.ts`
  - `apps/webapp/src/shared/ui/doctorNavLinks.ts`
  - `apps/webapp/src/modules/patient-home/README.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/01_DIAGNOSTICS_LABELS_PLAN.md` (чеклист Phase 1)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md` (заметка Phase 1)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run src/modules/patient-home/blockEditorMetadata.test.ts src/modules/patient-home/patientHomeUnresolvedRefs.test.ts src/app/app/settings/patient-home/patientHomeBlockEditor.test.tsx` — pass
  - `pnpm --dir apps/webapp exec tsc --noEmit` — pass (локально при ошибках в `.next/types/validator.ts` удалён устаревший `apps/webapp/.next`)
  - `pnpm --dir apps/webapp lint` — pass
- Notes:
  - Ранее отсутствующие UI/settings-файлы введены с нуля; server actions add/edit/reorder/repair в Phase 1 не менялись (их ещё не было в дереве).
- Result:
  - pass
- Next:
  - Phase 2 по `02_UNIFIED_BLOCK_EDITOR_PLAN.md`

---

## 2026-04-29 — Phase 1 — FIX

- Branch: `patient-app-visual-redesign-initiative`
- Scope:
  - Mandatory fixes из `AUDIT_PHASE_1.md`: исполняемый чеклист на регрессию после появления add/edit/reorder/repair; актуализация `BLOCK_EDITOR_CONTRACT.md` (наличие `blocks.ts`, раздел §B после Phase 1); секция §9 в `AUDIT_PHASE_1.md`.
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_1.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run src/modules/patient-home/blockEditorMetadata.test.ts src/modules/patient-home/patientHomeUnresolvedRefs.test.ts src/app/app/settings/patient-home/patientHomeBlockEditor.test.tsx` — pass
- Result:
  - pass
- Next:
  - Phase 2 по `02_UNIFIED_BLOCK_EDITOR_PLAN.md`; при вводе actions выполнить чеклист «AUDIT_PHASE_1 §2 FIX» в `BLOCK_EDITOR_CONTRACT.md`

---

## 2026-04-29 — Phase 2 — EXEC

- Branch: `patient-app-visual-redesign-initiative`
- Scope:
  - Phase 2 по `02_UNIFIED_BLOCK_EDITOR_PLAN.md`: единая модалка «Настроить» (видимость блока, статус, превью, список элементов с dnd/глаз/удалить/исправить/ссылка в CMS, группированный picker кандидатов); отдельные add/repair-модалки свёрнуты в реэкспорты; server actions — заглушки + `revalidatePath`; без миграций БД и без inline-create (Phase 3).
- Changed files (основные):
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockEditorDialog.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockEditorItems.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockCandidatePicker.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockRuntimeStatus.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockItemsDialog.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeRepairTargetsDialog.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/actions.ts`
  - `apps/webapp/src/app/app/settings/patient-home/actions.test.ts`
  - `apps/webapp/src/app/app/settings/patient-home/patientHomeBlockEditor.test.tsx`
  - `apps/webapp/src/modules/patient-home/patientHomeEditorDemo.ts`
  - `apps/webapp/src/app/app/doctor/patient-home/page.tsx` (демо `initialItems` / `initialCandidates` для CMS-блоков)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/02_UNIFIED_BLOCK_EDITOR_PLAN.md` (чеклист Phase 2)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run src/app/app/settings/patient-home/patientHomeBlockEditor.test.tsx src/app/app/settings/patient-home/actions.test.ts` — pass
  - `pnpm --dir apps/webapp exec tsc --noEmit` — pass
  - `pnpm --dir apps/webapp lint` — pass
- Notes:
  - Синхронизация локального состояния редактора с пропсами при открытии: `key={editorSession}` на карточке + инкремент сессии по клику «Настроить» (вместо `setState` в `useEffect`, требование eslint `react-hooks/set-state-in-effect`).
- Result:
  - pass
- Next:
  - Phase 3 по `03_INLINE_CREATE_SECTIONS_PLAN.md` при необходимости; чеклист `BLOCK_EDITOR_CONTRACT.md` после появления персистентных actions

---

## 2026-04-29 — Phase 2 — AUDIT

- Branch: `patient-app-visual-redesign-initiative` (как в EXEC)
- Scope:
  - Сверка Phase 2 с `02_UNIFIED_BLOCK_EDITOR_PLAN.md`: чеклист, completion criteria, mandatory behavior, design constraints, out of scope.
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_2.md` (новый)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - обзор кода и `LOG.md` Phase 2 EXEC; grep `patient_home` в `apps/webapp/db` — без совпадений
- Result:
  - **pass with notes** (вердикт и оговорки — в `AUDIT_PHASE_2.md` §1, §4, §8)
- Next:
  - Phase 3 PLAN/EXEC по `03_INLINE_CREATE_SECTIONS_PLAN.md`

---

## 2026-04-29 — Phase 2 — FIX

- Branch: `patient-app-visual-redesign-initiative` (как в EXEC)
- Scope:
  - Mandatory fixes из `AUDIT_PHASE_2.md` §3 / §8 / §9: синхронизация плана `02_…` с отсутствием `PatientHomeAddItemDialog.tsx`; контракт Phase 2 и заглушки actions в `BLOCK_EDITOR_CONTRACT.md`; уточнение чеклиста AUDIT_PHASE_1 §2; актуализация `AUDIT_PHASE_1.md` §2/§9; закрытие §12 в `AUDIT_PHASE_2.md`.
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/02_UNIFIED_BLOCK_EDITOR_PLAN.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_1.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_2.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec tsc --noEmit` — pass (изменения только в docs; smoke-команда для регрессии TS)
- Result:
  - pass
- Next:
  - Phase 3 PLAN/EXEC по `03_INLINE_CREATE_SECTIONS_PLAN.md`

---

## 2026-04-29 — Phase 3 — EXEC

- Branch: `patient-app-visual-redesign-initiative`
- Scope:
  - Phase 3 по `03_INLINE_CREATE_SECTIONS_PLAN.md`: `createContentSectionForPatientHomeBlock` (doctor guard, блок с `content_section`, slug/title/description/sort/видимость/auth, опциональные URL иконки/обложки с `mediaUrlPolicy`, уникальность slug через `getBySlug`, создание через `deps.contentSections.upsert`); UI `PatientHomeCreateSectionInlineForm` в picker при пустых кандидатах `situations` и `onInlineSectionCreated` из диалога; кандидаты-разделы для `situations` с сервера на `doctor/patient-home/page.tsx`. Запись в `patient_home_block_items` не делалась (нет таблицы / completion «без смены схемы»); иконка/обложка в БД не пишутся до колонок в `content_sections`.
- **Контракт `createContentSectionForPatientHomeBlock` (для журнала / ops):**
  - **Доступ:** `requireDoctorAccess()` (роль врача или админа, редирект иначе).
  - **Вход (JSON-поля):** `blockCode`, `title`, `slug`, опционально `description`, `sortOrder`, `isVisible`, `requiresAuth`, опционально `iconImageUrl`, `coverImageUrl`.
  - **Проверки:** CMS-блок; `patientHomeCmsBlockAllowsContentSection`; slug `[a-z0-9-]+`, не только дефисы; непустые URL медиа — только `/api/media/{uuid}` или `http(s)://…`; `getBySlug(slug)` — при существующей строке ошибка «Раздел с таким slug уже существует» (без silent upsert-перезаписи).
  - **Успех:** `contentSections.upsert` → `{ ok: true, item: { id, targetType: 'content_section', targetRef: slug, title, isVisible, resolved: true } }` + `revalidatePath` для doctor patient-home, content, patient/sections layout.
  - **Ошибки:** Zod/валидация → `{ ok: false, error: string }`; исключение из порта → общее сообщение без утечки деталей.
  - **Не делает:** не пишет `patient_home_block_items`; не сохраняет icon/cover в БД при текущей схеме `content_sections`.
- **Edge cases:** пустые опциональные URL — ок; невалидный slug до вызова БД; гонка двух созданий с одним slug — второй получит duplicate от `getBySlug`; in-memory port в тестах/CI — upsert возвращает детерминированный id.
- Changed files (основные):
  - `apps/webapp/src/app/app/settings/patient-home/actions.ts`
  - `apps/webapp/src/app/app/settings/patient-home/actions.test.ts`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeCreateSectionInlineForm.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockCandidatePicker.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockEditorDialog.tsx`
  - `apps/webapp/src/app/app/doctor/patient-home/page.tsx`
  - `apps/webapp/src/modules/patient-home/blocks.ts` (`patientHomeCmsBlockAllowsContentSection`)
  - `apps/webapp/src/modules/patient-home/patientHomeEditorDemo.ts` (кандидаты `situations` — [])
  - `apps/webapp/src/app/app/settings/patient-home/patientHomeBlockEditor.test.tsx`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/03_INLINE_CREATE_SECTIONS_PLAN.md` (чеклист)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run src/app/app/settings/patient-home/patientHomeBlockEditor.test.tsx src/app/app/settings/patient-home/actions.test.ts` — pass
  - `pnpm --dir apps/webapp exec tsc --noEmit` — pass
  - `pnpm --dir apps/webapp lint` — pass
- Result:
  - pass
- Next:
  - Phase 4 по `04_SAFE_SLUG_RENAME_PLAN.md`

---

## 2026-04-29 — Phase 3 — FIX

- Branch: `patient-app-visual-redesign-initiative`
- Scope:
  - Mandatory fixes из `AUDIT_PHASE_3.md` §5: явный контракт action и edge cases в записи **Phase 3 — EXEC**; удаление дублирующей записи **Phase 3 — EXEC (повторный запрос)**; добавлен `AUDIT_PHASE_3.md` с §6 (статус после FIX).
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_3.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - не применялись (только markdown)
- Result:
  - pass
- Next:
  - Phase 4 по `04_SAFE_SLUG_RENAME_PLAN.md`

---

## 2026-04-29 — Phase 4 — EXEC

- Branch: `TBD` (локально)
- Scope:
  - Таблица `content_section_slug_history` + миграция `0008_content_section_slug_history.sql`; атомарный rename в `pgContentSections` (страницы, опционально `patient_home_block_items`, секция, история); `countPagesWithSectionSlug` в `pgContentPages`; редирект цепочки на `/app/patient/sections/[slug]` через `resolvePatientContentSectionSlug`; UI «Переименовать slug…» + server action `renameContentSectionSlug`; валидация slug в `shared/lib/contentSectionSlug.ts`.
- Changed files (основные):
  - `apps/webapp/db/schema/schema.ts` (`contentSectionSlugHistory`)
  - `apps/webapp/db/drizzle-migrations/0008_content_section_slug_history.sql`
  - `apps/webapp/db/drizzle-migrations/meta/_journal.json`
  - `apps/webapp/src/infra/repos/pgContentSections.ts`, `pgContentSections.test.ts`
  - `apps/webapp/src/infra/repos/pgContentPages.ts`
  - `apps/webapp/src/infra/repos/resolvePatientContentSectionSlug.ts`, `resolvePatientContentSectionSlug.test.ts`
  - `apps/webapp/src/shared/lib/contentSectionSlug.ts`, `contentSectionSlug.test.ts`
  - `apps/webapp/src/app/app/doctor/content/sections/actions.ts`, `actions.test.ts`, `SectionForm.tsx`, `SectionSlugRenameDialog.tsx`, `edit/[slug]/page.tsx`
  - `apps/webapp/src/app/app/patient/sections/[slug]/page.tsx`, `page.slugRedirect.test.tsx`, `page.warmupsGate.test.tsx`
  - `apps/webapp/scripts/verify-drizzle-public-table-count.mjs` (исключение legacy `patient_*` до появления их `pgTable` в schema slice)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/04_SAFE_SLUG_RENAME_PLAN.md` (чеклист)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/ROLLBACK_SQL.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run src/shared/lib/contentSectionSlug.test.ts src/infra/repos/resolvePatientContentSectionSlug.test.ts src/infra/repos/pgContentSections.test.ts src/app/app/doctor/content/sections/actions.test.ts src/app/app/patient/sections/[slug]/page.slugRedirect.test.tsx src/app/app/patient/sections/[slug]/page.warmupsGate.test.tsx` — pass
  - `pnpm --dir apps/webapp run db:verify-public-table-count` — pass
  - `pnpm --dir apps/webapp exec tsc --noEmit` — pass
  - `pnpm --dir apps/webapp lint` — pass
- Notes:
  - `patient_home_block_items`: `UPDATE` только если таблица есть в `information_schema` (колонки `target_type`, `target_ref` как в плане).
  - `scripts/verify-drizzle-public-table-count.mjs`: временное исключение четырёх public-таблиц (`patient_home_*`, `patient_daily_mood`, `patient_practice_completions`), пока они не добавлены в `drizzle.config.ts` schema.
- Result:
  - pass
- Next:
  - следующая фаза инициативы по `MASTER_PLAN.md`

---

## 2026-04-29 — Phase 4 — FIX

- Branch: `TBD` (локально)
- Scope:
  - Mandatory fixes из `AUDIT_PHASE_4.md` §10: фильтр правил напоминаний на странице раздела пациента — `linkedObjectId` сравнивается с **`section.slug`**, а не литералом `warmups`; зафиксированы в журнале пункты по verify-скрипту (исключения до появления `pgTable` в schema slice) и ops-проверке миграции `0008`.
- Changed files:
  - `apps/webapp/src/app/app/patient/sections/[slug]/page.tsx`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run src/app/app/patient/sections/[slug]/page.warmupsGate.test.tsx` — pass
- Notes:
  - **§10 п.2 (verify):** исключения в `scripts/verify-drizzle-public-table-count.mjs` остаются до добавления соответствующих таблиц в `drizzle.config.ts` schema; затем имена убрать из `EXCLUDED_PUBLIC_BASE_TABLES` (см. `AUDIT_PHASE_4.md` §9).
  - **§10 п.3 (ops):** на окружении проверить наличие таблицы `content_section_slug_history` и согласованность журнала Drizzle с репозиторием после `pnpm --dir apps/webapp run migrate`.
  - Правила с `linked_object_id`, зашитым под старый slug (до миграции данных), после смены slug раздела не подхватятся, пока строки в БД не обновлены или не совпадают с каноническим `section.slug`.
- Result:
  - pass
- Next:
  - Phase 5 по `05_CREATE_RETURN_FLOWS_PLAN.md`

---

## 2026-04-29 — Phase 5 — EXEC

- Branch: `TBD` (локально)
- Scope:
  - Phase 5 по `05_CREATE_RETURN_FLOWS_PLAN.md`: URL-контекст возврата (`patientHomeCmsReturnUrls.ts`), сгруппированные CTA в `PatientHomeBlockCandidatePicker` (материал / курс / раздел с `returnTo` + `patientHomeBlock`), страница `/app/doctor/content/new` с query + баннер после сохранения в `ContentForm`, страница `/app/doctor/courses/new` + черновик через POST `/api/doctor/courses`, кандидаты-курсы с БД на `doctor/patient-home` и merge для `subscription_carousel`; `SaveContentPageState` возвращает `savedSlug`/`savedSection`; без изменений модели курса и без gating/billing.
- Changed files (основные):
  - `apps/webapp/src/modules/patient-home/patientHomeCmsReturnUrls.ts`, `patientHomeCmsReturnUrls.test.ts`
  - `apps/webapp/src/modules/patient-home/patientHomeEditorDemo.ts`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockCandidatePicker.tsx`, `patientHomeBlockEditor.test.tsx`
  - `apps/webapp/src/app/app/doctor/content/new/page.tsx`, `ContentForm.tsx`, `actions.ts`, `actions.test.ts`
  - `apps/webapp/src/app/app/doctor/courses/new/page.tsx`, `DoctorCourseDraftCreateForm.tsx`
  - `apps/webapp/src/app/app/doctor/patient-home/page.tsx`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/05_CREATE_RETURN_FLOWS_PLAN.md` (чеклист)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run src/modules/patient-home/patientHomeCmsReturnUrls.test.ts src/app/app/settings/patient-home/patientHomeBlockEditor.test.tsx src/app/app/doctor/content/actions.test.ts src/app/app/doctor/content/ContentForm.test.tsx` — pass
  - `pnpm --dir apps/webapp exec tsc --noEmit` — pass
  - `pnpm --dir apps/webapp lint` — pass
- Notes:
  - В `patientHomeCmsReturnUrls.test.ts` проверка query через `URLSearchParams` (пробелы в `toString()` — `+`, не `%20`).
- Result:
  - pass
- Next:
  - Phase 6 EXEC / AUDIT по `06_QA_RELEASE_PLAN.md`

---

## 2026-04-29 — Phase 5 — AUDIT

- Branch: `TBD` (локально)
- Scope:
  - Аудит Phase 5 по `05_CREATE_RETURN_FLOWS_PLAN.md`; артефакт `AUDIT_PHASE_5.md` (**pass with notes**). Зазор §5.1 (`sections/new` без return-context) закрыт в **Phase 6 — FIX**.
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_5.md`
- Checks:
  - обзор кода и `05`
- Result:
  - pass with notes
- Next:
  - Phase 6

---

## 2026-04-29 — Phase 6 — EXEC

- Branch: `TBD` (локально)
- Scope:
  - Phase 6 по `06_QA_RELEASE_PLAN.md` и §Phase 6 `MASTER_PLAN.md`: закрыт **Documentation Checklist** в `06_…` (с пометкой, что Final Manual QA остаётся операторским gate); примечание к completion criteria про отсутствие full root CI; модульная заметка **`apps/webapp/src/modules/patient-home/patient-home.md`** (workflow редактора + ссылки на тесты/аудит); ссылка из `modules/patient-home/README.md`; **full CI не запускался** (условия §Gate Strategy не выполнены).
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/06_QA_RELEASE_PLAN.md`
  - `apps/webapp/src/modules/patient-home/patient-home.md` (новый)
  - `apps/webapp/src/modules/patient-home/README.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks (phase-level, `apps/webapp`):
  - `pnpm --dir apps/webapp exec vitest run src/modules/patient-home/blockEditorMetadata.test.ts src/modules/patient-home/patientHomeUnresolvedRefs.test.ts src/modules/patient-home/patientHomeCmsReturnUrls.test.ts src/app/app/settings/patient-home/patientHomeBlockEditor.test.tsx src/app/app/settings/patient-home/actions.test.ts src/app/app/doctor/content/actions.test.ts src/app/app/doctor/content/ContentForm.test.tsx src/shared/lib/contentSectionSlug.test.ts src/infra/repos/resolvePatientContentSectionSlug.test.ts src/infra/repos/pgContentSections.test.ts src/app/app/doctor/content/sections/actions.test.ts src/app/app/patient/sections/[slug]/page.slugRedirect.test.tsx src/app/app/patient/sections/[slug]/page.warmupsGate.test.tsx` — pass
  - `pnpm --dir apps/webapp run db:verify-public-table-count` — pass
  - `pnpm --dir apps/webapp exec tsc --noEmit` — pass
  - `pnpm --dir apps/webapp lint` — pass
- Notes:
  - `AUDIT_PHASE_6.md` — по отдельному промпту AUDIT Phase 6.
  - Final Manual QA из `06_…` — чекбоксы остаются `[ ]` до ручного smoke или release rehearsal.
- Result:
  - pass
- Next:
  - Phase 6 AUDIT по `06_QA_RELEASE_PLAN.md`

---

## 2026-04-29 — Phase 6 — AUDIT

- Branch: `TBD` (локально)
- Scope:
  - Финальная сверка с `06_QA_RELEASE_PLAN.md`: Documentation Checklist, Final Manual QA (статус gate), Gate Strategy / completion criteria; создан `AUDIT_PHASE_6.md` (вердикт **pass with notes**).
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_6.md` (новый)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/06_QA_RELEASE_PLAN.md` (строка про аудиты)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - обзор `LOG.md`, `06_QA_RELEASE_PLAN.md`, `AUDIT_PHASE_0..6`, `ROLLBACK_SQL.md`, `docs/README.md`, `patient-home.md` (без повторного прогона CI в этом AUDIT)
- Result:
  - pass with notes (см. `AUDIT_PHASE_6.md` §1, §3, §7)
- Next:
  - Phase 6 FIX по `AUDIT_PHASE_6.md` / зазоры Phase 5 §5.1

---

## 2026-04-29 — Phase 6 — FIX

- Branch: `TBD` (локально)
- Scope:
  - Mandatory / зафиксированные в `AUDIT_PHASE_6.md` пункты: ретро-запись **Phase 5 — AUDIT** в `LOG.md`; закрыт зазор **`AUDIT_PHASE_5` §5.1** — `doctor/content/sections/new` парсит patient-home query и `SectionForm` показывает баннер возврата; `SaveContentSectionState` = `{ ok: true, savedSlug } | { ok: false, error }`; актуализация `AUDIT_PHASE_5.md`, `AUDIT_PHASE_6.md`, `patient-home.md`.
- Changed files (основные):
  - `apps/webapp/src/app/app/doctor/content/sections/new/page.tsx`
  - `apps/webapp/src/app/app/doctor/content/sections/SectionForm.tsx`
  - `apps/webapp/src/app/app/doctor/content/sections/actions.ts`
  - `apps/webapp/src/modules/patient-home/patient-home.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_5.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_PHASE_6.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run src/modules/patient-home/patientHomeCmsReturnUrls.test.ts src/app/app/settings/patient-home/patientHomeBlockEditor.test.tsx src/app/app/doctor/content/sections/actions.test.ts src/shared/lib/contentSectionSlug.test.ts src/infra/repos/resolvePatientContentSectionSlug.test.ts src/infra/repos/pgContentSections.test.ts src/app/app/patient/sections/[slug]/page.slugRedirect.test.tsx src/app/app/patient/sections/[slug]/page.warmupsGate.test.tsx` — pass
  - `pnpm --dir apps/webapp exec tsc --noEmit` — pass
  - `pnpm --dir apps/webapp lint` — pass
- Notes:
  - §5.2–5.3 `AUDIT_PHASE_5` не трогались (вне mandatory Phase 6).
- Result:
  - pass
- Next:
  - перед push — `pnpm install --frozen-lockfile && pnpm run ci` + ручной QA по `06_QA_RELEASE_PLAN.md` §Final Manual QA

---

## 2026-04-29 — Release-ready — FIX (patient_home persistence + runtime)

- Branch: `TBD` (локально)
- Scope:
  - План «Patient Home CMS Release-Ready»: Drizzle `patient_home_*`, сервис + DI, персистентные actions редактора, runtime `/app/patient` от CMS, icon/cover разделов, slug history `changed_by_user_id` + CHECK, repair = refresh резолва из БД.
- Changed files (основные):
  - `apps/webapp/db/schema/patientHome.ts`, `db/drizzle-migrations/0009_patient_home_cms_blocks.sql`, `db/schema/schema.ts`, `db/schema/index.ts`, `drizzle.config.ts`, `scripts/verify-drizzle-public-table-count.mjs`, `db/drizzle-migrations/meta/_journal.json`
  - `apps/webapp/src/modules/patient-home/ports.ts`, `service.ts`, `service.test.ts`, `blocks.ts`
  - `apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts`, `inMemoryPatientHomeBlocks.ts`, `pgContentPages.ts`, `pgContentSections.ts`
  - `apps/webapp/src/app-layer/di/buildAppDeps.ts`, `eslint.config.mjs`
  - `apps/webapp/src/app/app/settings/patient-home/actions.ts`, `actions.test.ts`, `PatientHomeBlockEditorDialog.tsx`, `PatientHomeBlockEditorItems.tsx`
  - `apps/webapp/src/app/app/doctor/patient-home/page.tsx`, `doctor/content/sections/*` (rename actor, icon/cover form)
  - `apps/webapp/src/app/app/patient/page.tsx`, `patient/home/PatientHomeToday.tsx`, `PatientHomeSituationsRow.tsx`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/FINAL_AUDIT.md`, `LOG.md`, `ROLLBACK_SQL.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run src/modules/patient-home/service.test.ts src/app/app/settings/patient-home/actions.test.ts` — pass
  - `pnpm --dir apps/webapp exec tsc --noEmit` — pass
  - `pnpm --dir apps/webapp lint` — pass
- Notes:
  - `pnpm install --frozen-lockfile && pnpm run ci` (root) — pass
- Result:
  - pass with notes
- Next:
  - ручной smoke `06_QA_RELEASE_PLAN.md` (root CI выполнен в этом gate).

---

## 2026-04-29 — DOC sync / plan PASS closure (FINAL_AUDIT + навигация)

- Branch: `TBD` (локально)
- Scope:
  - Устранение противоречий в `FINAL_AUDIT.md` (§2–§8 vs §10): один narrative **PASS по коду/CI**, **OPEN** только ручной QA; §9 как историческое примечание; §11 ссылки на артефакты.
  - Канонический чеклист плана: `CMS_RELEASE_READY_PLAN_STATUS.md` (строка 8 уточнена: доки синхронизированы).
  - Навигация в `README.md` инициативы и в `docs/README.md` (индекс) на статус, финальный аудит и журнал доработки доков (`DOC_SYNC_AND_PASS_CLOSURE.md`).
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/FINAL_AUDIT.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/README.md`
  - `docs/README.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/CMS_RELEASE_READY_PLAN_STATUS.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - самопроверка согласованности ссылок и формулировок между `FINAL_AUDIT.md`, `DOC_SYNC_AND_PASS_CLOSURE.md`, `CMS_RELEASE_READY_PLAN_STATUS.md`
- Result:
  - pass
- Next:
  - ручной smoke `06_QA_RELEASE_PLAN.md` + отметка в этом `LOG.md`

---

## 2026-04-29 — Phase 4 — EXEC

- Branch: `unify/patient-2026-04-29`
- Scope:
  - Закрыты хвосты slug rename wiring + CMS return-flow без новой бизнес-логики.
- Changed files:
  - `apps/webapp/src/app/app/doctor/content/ContentForm.test.tsx`
  - `apps/webapp/src/app/app/doctor/content/ContentForm.tsx`
  - `apps/webapp/src/app/app/doctor/content/new/page.tsx`
  - `apps/webapp/src/app/app/doctor/content/sections/SectionForm.test.tsx`
  - `apps/webapp/src/app/app/doctor/content/sections/SectionForm.tsx`
  - `apps/webapp/src/app/app/doctor/content/sections/actions.test.ts`
  - `apps/webapp/src/app/app/doctor/content/sections/actions.ts`
  - `apps/webapp/src/app/app/doctor/content/sections/edit/[slug]/page.tsx`
  - `apps/webapp/src/app/app/doctor/content/sections/new/page.tsx`
  - `apps/webapp/src/app/app/patient/sections/[slug]/page.tsx`
  - `apps/webapp/src/app/app/patient/sections/[slug]/page.slugRedirect.test.tsx`
  - `apps/webapp/src/infra/repos/pgContentPages.ts`
  - `apps/webapp/src/infra/repos/pgContentSections.ts`
  - `apps/webapp/src/modules/content-catalog/service.test.ts`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/SLUG_RENAME_WIRING_TASK.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp run typecheck` — pass
  - `pnpm --dir apps/webapp exec vitest --run` (focused) — pass
  - `pnpm run ci` (полный, корневой) — pass
- Result:
  - pass
- Next:
  - manual dev QA по smoke-сценариям из этого LOG-блока:
    - создание раздела;
    - rename slug + проверка «X страниц будет переадресовано»;
    - 301 со старого slug на новый;
    - CMS return-flow (создание через `content/new` и `sections/new` с возвратом на patient-home).

---

## 2026-04-29 — CMS editor UX lift (GPT55 task) — Phases 1–4 + Phase 5 gate

- Branch: `feat/patient-home-cms-editor-uxlift-2026-04-29`
- Scope (`CMS_EDITOR_UX_LIFT_TASK_FOR_GPT55.md`): инкрементальный UX-lift редактора блоков главной пациента на `/app/doctor/patient-home` без unified Configure dialog, без удаления существующих диалогов, без UI overrides для элементов.
- Реализация Phases 1–3 частично в предыдущих коммитах ветки: **`ecfc316`** (metadata + runtime-status + wiring), **`1be60ed`** (inline dialog + action).
- **Phase 1 — metadata:** `blockEditorMetadata.ts` (все коды блоков, copy, `inlineCreate`, согласование с `allowedTargetTypesForBlock` / `canManageItemsForBlock`). Тесты: `blockEditorMetadata.test.ts`.
- **Phase 2 — runtime-status:** `patientHomeRuntimeStatus.ts`, `PatientHomeBlockRuntimeStatusBadge.tsx`, интеграция в `PatientHomeBlockSettingsCard.tsx`, проброс статусов с `doctor/patient-home/page.tsx` через `PatientHomeBlocksSettingsPageClient.tsx`. Тесты: `patientHomeRuntimeStatus.test.ts`, `PatientHomeBlockRuntimeStatusBadge.test.tsx`, обновления `PatientHomeBlockSettingsCard.test.tsx` / `PatientHomeBlocksSettingsPageClient.test.tsx`.
- **Phase 3 — inline section:** `PatientHomeCreateSectionInlineDialog.tsx`, server action `createContentSectionForPatientHomeBlock` и расширенный `revalidatePatientHomeSettings` в `actions.ts` (коммит `1be60ed` на ветке; Phases 1–2 — `ecfc316`). Тесты: `PatientHomeCreateSectionInlineDialog.test.tsx`, расширения `actions.test.ts`. Сброс формы при открытии: стабильный `key` на `Dialog` вместо синхронного `setState` в `useEffect` (eslint `react-hooks/set-state-in-effect`).
- **Phase 4 — CMS return shortcuts:** `PatientHomeAddItemDialog.tsx` — при пустых candidates и CMS-блоке ссылки на создание раздела / материала / курса через `buildPatientHomeSectionsNewUrl` / `buildPatientHomeContentNewUrl` / `buildPatientHomeCourseNewUrl` и `PATIENT_HOME_CMS_DEFAULT_RETURN_PATH`; `patientHomeCmsReturnUrls.test.ts` — доп. кейсы. Тесты: `PatientHomeAddItemDialog.test.tsx`. Аналогично `key` на `Dialog` для lint.
- **Не сделано в рамках этой задачи (явно):** unified Configure dialog (объединение add / edit / repair / preview); удаление существующих `PatientHomeAddItemDialog` / `PatientHomeBlockItemsDialog` / `PatientHomeRepairTargetsDialog`; UI для item presentation overrides (`titleOverride` / `subtitleOverride` / `imageUrlOverride` / `badgeLabel`); правки `courses/new` не требовались (reference).
- Changed files в **финальном** коммите UX-lift (поверх `ecfc316` + `1be60ed`):
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeAddItemDialog.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeCreateSectionInlineDialog.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeAddItemDialog.test.tsx` (новый)
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockRuntimeStatusBadge.test.tsx` (новый)
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeCreateSectionInlineDialog.test.tsx` (новый)
  - `apps/webapp/src/modules/patient-home/blockEditorMetadata.test.ts` (новый)
  - `apps/webapp/src/modules/patient-home/patientHomeRuntimeStatus.test.ts` (новый)
  - `apps/webapp/src/modules/patient-home/patientHomeCmsReturnUrls.test.ts`
  - `apps/webapp/src/app/app/settings/patient-home/actions.test.ts`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.test.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient.test.tsx`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - Phase 5 targeted (`CMS_EDITOR_UX_LIFT_TASK_FOR_GPT55.md` §Phase 5): `pnpm --dir apps/webapp exec vitest run` по **14** тестовым файлам (включая `PatientHomeBlocksSettingsPageClient.test.tsx` — проброс runtime status) — **pass** (14 files, 96 tests). В dev `vitest.globalSetup` при сбое migrate: `console.warn` — одна краткая строка (без dump объекта `Error`); дочерний `pnpm run migrate` всё ещё может печатать своё сообщение; тесты green.
  - `pnpm --dir apps/webapp exec tsc --noEmit` — pass
  - `pnpm --dir apps/webapp lint` — pass
  - `pnpm install --frozen-lockfile && pnpm run ci` (корень) — pass
- Result:
  - pass
- Next:
  - ручной smoke по `CMS_EDITOR_UX_LIFT_TASK_FOR_GPT55.md` §Manual smoke; push по явной команде.

---

## 2026-04-29 — CMS editor UX lift (GPT55) — FIX (сверка gate + log)

- Branch: `feat/patient-home-cms-editor-uxlift-2026-04-29`
- Scope:
  - Устранение расхождения счёта **13/95** vs **14/96**: нормативный Phase 5 gate в `CMS_EDITOR_UX_LIFT_TASK_FOR_GPT55.md` расширен `PatientHomeBlocksSettingsPageClient.test.tsx` (проброс runtime status); **14 test files, 96 tests** при полном наборе.
  - `apps/webapp/vitest.globalSetup.ts`: при optional failure migrate `console.warn` печатает краткую строку (без полного dump `Error` во втором аргументе); stderr дочернего `pnpm run migrate` при локальной БД может остаться.
  - Повторная проверка pre-push: `pnpm install --frozen-lockfile && pnpm run ci` (корень) — **pass**.
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/CMS_EDITOR_UX_LIFT_TASK_FOR_GPT55.md`
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md` (также обновлён предыдущий блок «Phases 1–4 + Phase 5 gate»)
  - `apps/webapp/vitest.globalSetup.ts`
- Checks:
  - Phase 5 vitest (14 файлов из задачи) — 14 passed, 96 passed
  - `pnpm run ci` (корень) — pass
- Result:
  - pass
- Next:
  - commit при необходимости; ручной smoke `CMS_EDITOR_UX_LIFT_TASK_FOR_GPT55.md` §Manual smoke

---

## 2026-04-30 — Patient home block icon (data layer)

- Branch: `feat/patient-home-cms-editor-uxlift-2026-04-29`
- Scope:
  - Колонка `patient_home_blocks.icon_image_url` (nullable text), поле `iconImageUrl` в типе `PatientHomeBlock`; `NULL` = Lucide fallback на карточке (runtime/UI не трогались).
  - Порт `setBlockIcon` + реализации pg / in-memory; сервис `setBlockIcon` с whitelist блоков с одной leading-иконкой (`sos`, `next_reminder`, `booking`, `progress`, `plan`) через `supportsConfigurablePatientHomeBlockIcon` в `blocks.ts`.
  - Миграция Drizzle `0013_patient_home_block_icon_image_url.sql` (SQL вручную сведён к одному `ALTER TABLE` — `drizzle-kit generate` изначально подтянул лишний DDL из-за отсутствующего `0012_snapshot` в meta).
- Changed files:
  - `apps/webapp/db/schema/schema.ts`
  - `apps/webapp/db/drizzle-migrations/0013_patient_home_block_icon_image_url.sql`
  - `apps/webapp/db/drizzle-migrations/meta/_journal.json`, `meta/0013_snapshot.json`
  - `apps/webapp/src/modules/patient-home/ports.ts`, `blocks.ts`, `service.ts`
  - `apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts`, `inMemoryPatientHomeBlocks.ts`
  - Тесты: `service.test.ts`, `pgPatientHomeBlocks.test.ts`, правки фикстур `PatientHomeBlock` в смежных тестах
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run src/modules/patient-home src/infra/repos/pgPatientHomeBlocks.test.ts` — pass
  - `pnpm --dir apps/webapp exec tsc --noEmit` — pass
- Result:
  - pass
- Next:
  - UI picker иконки и чтение `iconImageUrl` в runtime карточках — отдельные задачи.

---

## 2026-04-30 — Audit: block icon data layer

- Branch: `feat/patient-home-cms-editor-uxlift-2026-04-29`
- Scope:
  - Аудит data layer для `patient_home_blocks.icon_image_url` / порт `setBlockIcon` / сервис / repos; без правок кода.
- Changed files:
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_BLOCK_ICON_DATA_LAYER.md` (новый)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run src/modules/patient-home/service.test.ts src/infra/repos/pgPatientHomeBlocks.test.ts` — pass (2 files, 18 tests); root `pnpm run ci` — не запускался
- Result:
  - pass with notes (вердикт в аудит-доке: **PASS WITH NOTES**)
- Next:
  - по необходимости: UI picker + runtime; опционально pg-backed smoke для колонки; выравнивание Drizzle meta для будущих `generate`

---

## 2026-04-30 — Fix: block icon audit findings (6–8)

- Branch: `feat/patient-home-cms-editor-uxlift-2026-04-29`
- Scope:
  - Закрытие findings из `AUDIT_BLOCK_ICON_DATA_LAYER.md`: паритет pg/in-memory для `setBlockIcon`, цепочка Drizzle meta `0012_snapshot`, pg-backed тест `icon_image_url` + включение в `test:with-db`.
- Changed files:
  - `apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts`, `inMemoryPatientHomeBlocks.ts`
  - `apps/webapp/src/infra/repos/pgPatientHomeBlocks.test.ts`
  - `apps/webapp/package.json` (`test:with-db`)
  - `apps/webapp/db/drizzle-migrations/meta/0012_snapshot.json` (новый), `meta/0013_snapshot.json` (`prevId`)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_BLOCK_ICON_DATA_LAYER.md`, `LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run src/infra/repos/pgPatientHomeBlocks.test.ts src/modules/patient-home/service.test.ts` — pass (19 passed, 1 skipped)
  - ReadLints по затронутым ts — ok
  - root `pnpm run ci` — не запускался
- Result:
  - pass
- Next:
  - UI picker / runtime при отдельной задаче

---

## 2026-04-30 — Patient home block icon: admin picker + runtime

- Branch: `feat/patient-home-cms-editor-uxlift-2026-04-29`
- Scope:
  - CMS `/app/doctor/patient-home`: секция «Иконка блока» только для whitelist (`sos`, `next_reminder`, `booking`, `progress`, `plan`) — `MediaLibraryPickerDialog` (`kind="image"`), превью 40×40, «Очистить иконку» → `setPatientHomeBlockIcon` → NULL.
  - Server action `setPatientHomeBlockIcon` в `actions.ts` (whitelist + `API_MEDIA_URL_RE` / legacy absolute).
  - Runtime «Сегодня»: передача `iconImageUrl` из `listBlocksWithItems` в карточки; `stripApiMediaForAnonymousGuest` для гостя; в существующих leading-контейнерах — decorative `img` или Lucide fallback.
- Changed files:
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.tsx`, `actions.ts`
  - `apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx`, `PatientHomeBookingCard.tsx`, `PatientHomeProgressBlock.tsx`, `PatientHomeNextReminderCard.tsx`, `PatientHomeSosCard.tsx`, `PatientHomePlanCard.tsx`
  - Тесты: `actions.test.ts`, `PatientHomeBlockSettingsCard.test.tsx`, `PatientHomeBookingCard.test.tsx`, `PatientHomeNextReminderCard.test.tsx`, `PatientHomeSosCard.test.tsx`, `PatientHomeProgressBlock.test.tsx`, `PatientHomePlanCard.test.tsx` (новый)
  - `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`
- Checks:
  - `pnpm --dir apps/webapp exec vitest run` (7 файлов: settings actions + BlockSettingsCard + 5 patient home card tests) — pass (46 tests)
  - ReadLints — ok
  - root `pnpm run ci` — не запускался
- Result:
  - pass
- Next:
  - при необходимости: полировка копирайта / a11y превью
