# Composer 2 task — инкрементальный UX-lift редактора блоков главной пациента

## Стратегия

Не переписываем редактор. Делаем **инкрементальный апдейт** существующего редактора блоков главной пациента: добавляем то, чего реально нет, и не трогаем то, что уже работает.

Принципы:

- Существующие диалоги (`PatientHomeAddItemDialog`, `PatientHomeBlockItemsDialog`, `PatientHomeRepairTargetsDialog`) и их actions **остаются**.
- Все новые компоненты пишутся **с нуля** под текущие типы и actions, без копирования кода из backup-ветки.
- Backup-ветка `refs/remotes/origin/backup/visual-with-dirty-2026-04-29` используется **только как UX-референс** через `git show`, без `git checkout/restore` поверх рабочего дерева.
- Никаких миграций БД, новых env vars, прямых `getPool` / `getDrizzle` / `@/infra/repos/*` импортов из `modules/*` или `app/api/**/route.ts`.
- Каждая фаза завершается diff-review и узкими тестами; pre-push — полный `pnpm run ci`.

## Нормативный контекст

Прочитать перед началом:

- `README.md`
- `docs/README.md`
- `docs/ARCHITECTURE/SERVER CONVENTIONS.md`
- `deploy/HOST_DEPLOY_README.md`
- `.cursor/rules/clean-architecture-module-isolation.mdc`
- `.cursor/rules/pre-push-ci.mdc`
- `docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/MASTER_PLAN.md`
- `docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md`
- `docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/06_QA_RELEASE_PLAN.md`
- этот файл полностью

Текущее unified-состояние, на которое опираемся:

- Базовая ветка: `unify/patient-2026-04-29`.
- Канонический экран настроек блоков: `/app/doctor/patient-home`. `/app/settings/patient-home` — legacy redirect (см. `apps/webapp/src/app/app/settings/patient-home/page.tsx`).
- Реальные таблицы: `patient_home_blocks` (PK `code`) и `patient_home_block_items` (`block_code`, `target_type`, `target_ref`, overrides `title_override` / `subtitle_override` / `image_url_override` / `badge_label`, `is_visible`, `sort_order`).
- Контракты модуля: `apps/webapp/src/modules/patient-home/ports.ts`, `service.ts`, `blocks.ts`, `patientHomeResolvers.ts`, `patientHomeUnresolvedRefs.ts`, `patientHomeCmsReturnUrls.ts`.
- Существующие server actions: `apps/webapp/src/app/app/settings/patient-home/actions.ts` (`togglePatientHomeBlockVisibility`, `addPatientHomeItem`, `updatePatientHomeItemVisibility`, `deletePatientHomeItem`, `reorderPatientHomeItems`, `retargetPatientHomeItem`, `listPatientHomeCandidates`, `reorderPatientHomeBlocks`).
- Slug-rename для разделов уже сделан (`SLUG_RENAME_WIRING_TASK.md`); не переделываем.
- CMS return-flow в `ContentForm` / `SectionForm` / `courses/new/page.tsx` уже частично wired; добиваем точечно, если найдём пробел.

## Жёсткие правила безопасности

1. **Нельзя bulk checkout / restore из backup-ветки.** Запрещено:
   ```bash
   git checkout backup/visual-with-dirty-2026-04-29 -- <path>
   git restore --source=backup/visual-with-dirty-2026-04-29 <path>
   ```
2. Backup читать только через явный remote ref (имя ambiguous):
   ```bash
   VISUAL_REF=refs/remotes/origin/backup/visual-with-dirty-2026-04-29
   git show "$VISUAL_REF":<path>
   ```
   Backup используется только как описание поведения и копирайта. Никакого копирования JSX, state-машин, типов (`PatientHomeEditorItemRow`, `patientHomeEditorDemo` и т.п.) в новые файлы.
3. **Не трогать**:
   - схему БД, миграции, LFK-таблицы;
   - polymorphic `target_ref` / `item_ref_id` (никаких FK на них);
   - existing dialogs/actions для add/edit/reorder/visibility/repair (если в фазе явно не написано иначе);
   - slug-rename action и dialog;
   - patient runtime `/app/patient` и `/app/patient/sections/[slug]`;
   - legacy redirect `/app/settings/patient-home`.
4. **DI-контракты**: server actions могут вызывать `buildAppDeps()` и сервисы/порты из composition root. Не импортировать `getPool`, `getDrizzle`, `@/infra/db/*`, `@/infra/repos/*` в `modules/*` или `app/api/**/route.ts`. Не расширять ESLint allowlist.
5. **Конфигурация интеграций — только в `system_settings`**, никаких env vars для ключей/URI (см. `.cursor/rules/000-critical-integration-config-in-db.mdc`). В этой задаче новые настройки не предполагаются.

## Phase 0 — baseline

```bash
git fetch origin
git switch -c feat/patient-home-cms-editor-uxlift-2026-04-29 unify/patient-2026-04-29
git status --short
```

Если `git status --short` показывает чужие изменения — не трогать их и не stash без согласования.

Прогнать baseline targeted tests, чтобы зафиксировать зелёное состояние перед правками:

```bash
pnpm --dir apps/webapp exec vitest run \
  src/app/app/settings/patient-home/actions.test.ts \
  src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.test.tsx \
  src/app/app/settings/patient-home/PatientHomeBlockPreview.test.tsx \
  src/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient.test.tsx \
  src/app/app/doctor/content/ContentForm.test.tsx \
  src/app/app/doctor/content/sections/SectionForm.test.tsx \
  src/modules/patient-home/patientHomeCmsReturnUrls.test.ts \
  src/modules/patient-home/patientHomeResolvers.test.ts \
  src/modules/patient-home/service.test.ts
```

Прочитать backup-эталоны через `git show "$VISUAL_REF":...` (но только читать):

- `apps/webapp/src/modules/patient-home/blockEditorMetadata.ts`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockRuntimeStatus.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeCreateSectionInlineForm.tsx`

Из них берём только: какие тексты, какие правила empty/hidden/ready, какие поля у inline-формы. Кода не копировать.

Phase 0 gate:

- [ ] ветка создана от `unify/patient-2026-04-29`;
- [ ] `git status --short` понятен;
- [ ] backup читается только через `git show`, без checkout/restore;
- [ ] baseline tests зелёные (или известные pre-existing failures зафиксированы).

## Phase 1 — `blockEditorMetadata.ts`

Цель: единый источник admin-copy и правил для каждого блока. **UI пока не меняем.**

Создать:

- `apps/webapp/src/modules/patient-home/blockEditorMetadata.ts`
- `apps/webapp/src/modules/patient-home/blockEditorMetadata.test.ts`

API:

```ts
export type PatientHomeBlockEditorMetadata = {
  code: PatientHomeBlockCode;
  displayTitle: string;
  itemNoun: string | null;
  addLabel: string | null;
  canManageItems: boolean;
  allowedTargetTypes: readonly PatientHomeBlockItemTargetType[];
  allowedTargetTypeLabels: Record<PatientHomeBlockItemTargetType, string>;
  emptyPreviewText: string;
  emptyRuntimeText: string;
  inlineCreate: { contentSection: boolean };
};

export function getPatientHomeBlockEditorMetadata(code: PatientHomeBlockCode): PatientHomeBlockEditorMetadata;
```

Требования:

- покрыть все коды из `PATIENT_HOME_BLOCK_CODES` (`daily_warmup`, `booking`, `situations`, `progress`, `next_reminder`, `mood_checkin`, `sos`, `plan`, `subscription_carousel`, `courses`);
- `allowedTargetTypes` брать из `allowedTargetTypesForBlock(code)`, не дублировать руками;
- `canManageItems` = `canManageItemsForBlock(code)`;
- `inlineCreate.contentSection = true` только там, где `content_section` входит в allowed target types и продуктово оправдано (минимум `situations`);
- copy — нейтральный, согласованный с `BLOCK_EDITOR_CONTRACT.md`.

Tests:

- покрыты все block codes;
- `allowedTargetTypes` совпадает с `allowedTargetTypesForBlock`;
- `situations` → только `content_section`, inline-create включён;
- `daily_warmup` → только `content_page`;
- `subscription_carousel` → `content_section` + `content_page` + `course`;
- non-CMS блоки имеют `canManageItems=false`.

Phase 1 gate:

```bash
pnpm --dir apps/webapp exec vitest run src/modules/patient-home/blockEditorMetadata.test.ts
pnpm --dir apps/webapp exec tsc --noEmit
```

UI ещё не меняется — этот PR безопасно мерджится отдельно.

## Phase 2 — runtime-status badge

Цель: показать на карточке блока `hidden / empty / ready`, отражающий **runtime-резолв**, а не только `is_visible`.

Создать pure helper:

- `apps/webapp/src/modules/patient-home/patientHomeRuntimeStatus.ts`
- `apps/webapp/src/modules/patient-home/patientHomeRuntimeStatus.test.ts`

API:

```ts
export type PatientHomeBlockRuntimeStatusKind = "hidden" | "empty" | "ready";

export type PatientHomeBlockRuntimeStatus = {
  blockCode: PatientHomeBlockCode;
  kind: PatientHomeBlockRuntimeStatusKind;
  visibleResolvedItems: number;
  visibleConfiguredItems: number;
  unresolvedConfiguredItems: number;
};
```

Правила:

- `hidden` — если `block.isVisible === false`.
- Для CMS-блоков (`situations`, `subscription_carousel`, `sos`, `courses`, `daily_warmup`): считать `visibleResolved` через текущие резолверы из `patientHomeResolvers.ts` или через готовый `patientHomeUnresolvedRefs.ts` (для daily_warmup особый случай — фиксируем в тесте, что пустой = `empty`, copy объясняет fallback).
- Non-CMS блоки (`booking`, `progress`, `next_reminder`, `mood_checkin`, `plan`): если видимы, считаются `ready`.

Helper не должен делать запросы в БД сам — он принимает `PatientHomeBlock` и нужный набор `knownRefs` / резолверов.

Создать client component badge:

- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockRuntimeStatusBadge.tsx`
- `apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockRuntimeStatusBadge.test.tsx`

Это **новый** компонент, написанный с нуля под текущие типы. JSX из backup не копируется.

Интеграция:

- в `apps/webapp/src/app/app/doctor/patient-home/page.tsx` уже грузятся `blocks` и `knownRefs` — на их основе вычислить статусы и пробросить в `PatientHomeBlocksSettingsPageClient` и далее в `PatientHomeBlockSettingsCard`.
- в `PatientHomeBlockSettingsCard.tsx` вставить `PatientHomeBlockRuntimeStatusBadge` рядом с заголовком блока. Существующий dropdown-меню и текущий `PatientHomeBlockPreview` остаются как есть.

Phase 2 gate:

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/patient-home/patientHomeRuntimeStatus.test.ts \
  src/app/app/settings/patient-home/PatientHomeBlockRuntimeStatusBadge.test.tsx \
  src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.test.tsx
pnpm --dir apps/webapp exec tsc --noEmit
```

## Phase 3 — inline section creation

Цель: из карточки блока `situations` (и других, где `inlineCreate.contentSection === true`) можно создать `content_section` и сразу прицепить как item, без перехода в CMS.

UI:

- Добавить новый action в dropdown карточки: «Создать раздел и добавить» — виден только если `metadata.inlineCreate.contentSection === true`.
- Открывает новый dialog, написанный с нуля:
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeCreateSectionInlineDialog.tsx`
  - `apps/webapp/src/app/app/settings/patient-home/PatientHomeCreateSectionInlineDialog.test.tsx`

Поля dialog (по аналогии с `SectionForm`):

- `title` (обязательно), auto-`slug` от title, кнопка «Сгенерировать»;
- `description` (опционально);
- `sortOrder` (default 0);
- `isVisible` (default true);
- `requiresAuth` (default false);
- `coverImageUrl` / `iconImageUrl` через `MediaLibraryPickerDialog` (как в `SectionForm`).

Server action:

- `apps/webapp/src/app/app/settings/patient-home/actions.ts` → новый `createContentSectionForPatientHomeBlock`.

```ts
export async function createContentSectionForPatientHomeBlock(input: {
  blockCode: string;
  title: string;
  slug: string;
  description?: string;
  sortOrder?: number;
  isVisible?: boolean;
  requiresAuth?: boolean;
  coverImageUrl?: string | null;
  iconImageUrl?: string | null;
}): Promise<
  | { ok: true; itemId: string; sectionSlug: string }
  | { ok: false; error: string }
>;
```

Implementation constraints:

- `requireDoctorForPatientHomeBlocks()` (тот же guard, что в существующих actions);
- валидировать `blockCode` через `isPatientHomeBlockCode`;
- проверять, что для этого блока `content_section` входит в `allowedTargetTypesForBlock`; иначе `error: "invalid_target_type_for_block"`;
- валидировать slug через `validateContentSectionSlug` (используется в `sections/actions.ts`);
- валидировать media URL через `API_MEDIA_URL_RE` / `isLegacyAbsoluteUrl` (как в `sections/actions.ts`);
- создать раздел через `deps.contentSections.upsert(...)`;
- прицепить через `deps.patientHomeBlocks.addItem({ blockCode, targetType: "content_section", targetRef: slug, isVisible: true })`;
- `revalidatePath` для `/app/doctor/patient-home`, `/app/settings/patient-home`, `/app/patient`, `/app/patient/sections`.

После успешного ответа dialog закрывается, карточка блока вызывает `router.refresh()` (как в `PatientHomeBlocksSettingsPageClient`).

Tests:

- action: forbidden user отклоняется;
- action: invalid block / forbidden target type;
- action: invalid slug / только дефисы;
- action: invalid media URL;
- action: happy path — вызовы `contentSections.upsert` и `patientHomeBlocks.addItem` в правильном порядке;
- dialog UI: auto-slug, manual override, submit вызывает action с правильным input, на success закрывается и зовёт `onSaved`.

Phase 3 gate:

```bash
pnpm --dir apps/webapp exec vitest run \
  src/app/app/settings/patient-home/actions.test.ts \
  src/app/app/settings/patient-home/PatientHomeCreateSectionInlineDialog.test.tsx \
  src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.test.tsx
pnpm --dir apps/webapp exec tsc --noEmit
```

## Phase 4 — добивание CMS return-flow (по факту)

Цель: убедиться, что create-and-return ссылки работают для всех CMS-блоков, и добавить в редактор полезные shortcut-ссылки на создание материала / раздела / курса с правильным `returnTo`.

Пройти и при необходимости поправить:

- `apps/webapp/src/app/app/doctor/content/new/page.tsx` — должен парсить `parsePatientHomeCmsReturnQuery(searchParams)` и пробрасывать `patientHomeContext` в `ContentForm`.
- `apps/webapp/src/app/app/doctor/content/sections/new/page.tsx` — то же для `SectionForm`.
- `apps/webapp/src/app/app/doctor/courses/new/page.tsx` — уже wired (reference).
- `ContentForm.tsx`, `SectionForm.tsx` — success-banner с возвратом по `returnTo` (часть уже есть; ничего не переписываем).

Если все три страницы уже корректно парсят query и формы показывают banner — этот phase сводится к тесту-гарду на регрессию.

В `PatientHomeAddItemDialog` (существующий) добавить **в пустом состоянии** ссылки «Создать раздел / материал / курс», построенные через helpers:

- `buildPatientHomeContentNewUrl`
- `buildPatientHomeSectionsNewUrl`
- `buildPatientHomeCourseNewUrl`

Ссылки строятся **только** по helper-ам (не string concat), `returnTo = "/app/doctor/patient-home"`, `patientHomeBlock` — текущий код блока (через `assertPatientHomeCmsBlockCode`).

Tests:

- `parsePatientHomeCmsReturnQuery` для `content/new` и `sections/new`;
- `PatientHomeAddItemDialog` показывает ссылки только когда candidates пусты и блок CMS-управляемый;
- ссылки совпадают с output helpers.

Phase 4 gate:

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/patient-home/patientHomeCmsReturnUrls.test.ts \
  src/app/app/doctor/content/ContentForm.test.tsx \
  src/app/app/doctor/content/sections/SectionForm.test.tsx \
  src/app/app/settings/patient-home/PatientHomeAddItemDialog.test.tsx
pnpm --dir apps/webapp exec tsc --noEmit
```

(Если файла `PatientHomeAddItemDialog.test.tsx` сейчас нет — создать в этой фазе.)

## Phase 5 — финальный gate и LOG

Запустить targeted final набор:

```bash
pnpm --dir apps/webapp exec vitest run \
  src/modules/patient-home/blockEditorMetadata.test.ts \
  src/modules/patient-home/patientHomeRuntimeStatus.test.ts \
  src/modules/patient-home/patientHomeCmsReturnUrls.test.ts \
  src/modules/patient-home/patientHomeResolvers.test.ts \
  src/modules/patient-home/service.test.ts \
  src/app/app/settings/patient-home/actions.test.ts \
  src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.test.tsx \
  src/app/app/settings/patient-home/PatientHomeBlockPreview.test.tsx \
  src/app/app/settings/patient-home/PatientHomeBlocksSettingsPageClient.test.tsx \
  src/app/app/settings/patient-home/PatientHomeBlockRuntimeStatusBadge.test.tsx \
  src/app/app/settings/patient-home/PatientHomeCreateSectionInlineDialog.test.tsx \
  src/app/app/settings/patient-home/PatientHomeAddItemDialog.test.tsx \
  src/app/app/doctor/content/ContentForm.test.tsx \
  src/app/app/doctor/content/sections/SectionForm.test.tsx
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp lint
```

Перед commit/push — полный CI как в pre-push правиле:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

Не пушить без зелёного `pnpm run ci`.

Обновить `docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`:

- что сделано в каждой фазе;
- какие файлы добавлены/изменены;
- какие тесты прогнаны и с каким результатом;
- что НЕ сделано в этой задаче (явно: unified Configure dialog, item presentation overrides UI, удаление существующих диалогов).

## Manual smoke

В dev UI на `/app/doctor/patient-home`:

- у каждого блока виден runtime-status badge, отражающий runtime-резолв;
- для `situations` доступно «Создать раздел и добавить»; после save раздел появляется в блоке без ручного добавления;
- в существующем «Добавить материал» при пустом списке кандидатов видны shortcut-ссылки на создание материала / раздела / курса;
- после save из CMS возвращается banner и `returnTo` ведёт обратно на `/app/doctor/patient-home`;
- существующие add / hide / reorder / delete / repair работают как раньше;
- `/app/patient` и `/app/patient/sections/[slug]` не сломаны.

## Acceptance criteria

- [ ] `blockEditorMetadata.ts` покрывает все block codes, согласован с `BLOCK_EDITOR_CONTRACT.md`.
- [ ] У каждого блока в `/app/doctor/patient-home` виден runtime-status badge (`hidden` / `empty` / `ready`).
- [ ] Для блоков с `inlineCreate.contentSection` работает создание раздела с прицеплением как item в одной операции.
- [ ] Все три CMS new-страницы (`content/new`, `sections/new`, `courses/new`) корректно парсят `patientHomeContext` и показывают return banner.
- [ ] В `PatientHomeAddItemDialog` при пустых candidates есть shortcut-ссылки на создание контента с `returnTo`.
- [ ] Существующие dialogs/actions/тесты для add / hide / reorder / delete / repair / slug-rename НЕ изменены и НЕ сломаны.
- [ ] Нет миграций, env vars, прямых DB-импортов в запрещённых слоях.
- [ ] Нет копирования кода из backup-ветки.
- [ ] Targeted tests зелёные.
- [ ] `pnpm install --frozen-lockfile && pnpm run ci` зелёный перед commit/push.
- [ ] `LOG.md` обновлён.

## Что вне scope этой задачи

Явно не делаем (могут быть отдельной задачей позже):

- unified Configure dialog (объединение add / edit / repair / preview в одно окно);
- удаление существующих `PatientHomeAddItemDialog` / `PatientHomeBlockItemsDialog` / `PatientHomeRepairTargetsDialog`;
- UI редактирования item presentation overrides (`titleOverride` / `subtitleOverride` / `imageUrlOverride` / `badgeLabel`) — данные в БД уже есть, UI можно добавить отдельно;
- любые изменения схемы `patient_home_*`, LFK, polymorphic refs;
- любые env vars / system_settings под этот редактор.

## Recovery

Источники:

- unified base: `unify/patient-2026-04-29`
- visual UX referenсе: `refs/remotes/origin/backup/visual-with-dirty-2026-04-29` (короткий ref ambiguous — всегда использовать полный)

Просмотр потерянного файла:

```bash
VISUAL_REF=refs/remotes/origin/backup/visual-with-dirty-2026-04-29
git show "$VISUAL_REF":<path-to-file>
```

Если фаза пошла плохо: смотреть `git diff` только по файлам фазы и откатывать вручную через patch/edit. Не использовать `git reset --hard`, не делать bulk `git restore` поверх рабочего дерева.

После завершения — commit без push, отчёт о состоянии для решения о merge.
