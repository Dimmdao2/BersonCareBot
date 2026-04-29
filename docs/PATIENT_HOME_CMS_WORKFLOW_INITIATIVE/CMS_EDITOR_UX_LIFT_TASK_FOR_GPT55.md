# GPT 5.5 — ++ часть: восстановление CMS-editor UX поверх home-схемы

## Контекст

Ветка `unify/patient-2026-04-29` (commit `c4fef49`) — стабильное объединение трёх инициатив (home-redesign + visual-redesign + CMS-workflow), полученное по Варианту A (`HOME-FIRST + selective port`). См.:

- Базовый коммит и состояние unified: `git log --oneline unify/patient-2026-04-29`.
- Источники истории (доступны в origin):
  - `patient-home-redesign-initiative` — функциональная база unified.
  - `patient-app-visual-redesign-initiative` + `backup/visual-with-dirty-2026-04-29` — visual-track + WIP CMS-editor (где ++ часть была реализована и работала).
- Документ slug-rename wiring (отдельная follow-up задача): `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/SLUG_RENAME_WIRING_TASK.md`. Это **другая** задача, выполняй её отдельно либо после ++ части.

## Что нужно реализовать в ++ части

Перенести из visual-tip/WIP **функциональную часть UX** CMS-editor блоков главной пациента, **переписав** под home-схему `patient_home_blocks` (`code` PK, поля `title`/`description`/`is_visible`/`sort_order`) и `patient_home_block_items` (с overrides `title_override`/`subtitle_override`/`image_url_override`/`badge_label`).

### Цели (по приоритету)

1. **Unified «Configure» dialog** — единое окно для:
   - редактирования block-метаданных (title/description/is_visible),
   - просмотра runtime-preview блока (как видит пациент),
   - управления items (CRUD),
   - выбора кандидатов (`content_section`/`content_page`/`course`) для добавления в block.

   Эталон (UX): `git show backup/visual-with-dirty-2026-04-29:apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockEditorDialog.tsx`.

   Адаптация: использовать home-схему — block PK = `code` (string), item имеет overrides и `target_type ∈ {content_section, content_page, course, static_action}`.

2. **Inline section creation** — внутри dialog'а кнопка «Создать новый раздел» → встроенная форма (slug/title/description/cover/icon) → создаёт `content_section` через server-action и сразу добавляет item в текущий блок.

   Эталон: `git show backup/visual-with-dirty-2026-04-29:apps/webapp/src/app/app/settings/patient-home/PatientHomeCreateSectionInlineForm.tsx` + server-action `createContentSectionForPatientHomeBlock` в `actions.ts`.

   Адаптация: после создания раздела item должен ссылаться на slug; учесть overrides.

3. **CMS create-and-return flows** — wiring для уже принесённого `apps/webapp/src/modules/patient-home/patientHomeCmsReturnUrls.ts`:
   - `ContentForm.tsx` (новые материалы): success-banner с возвратом `returnTo`.
   - `SectionForm.tsx`: то же.
   - `content/new/page.tsx` и `sections/new/page.tsx`: парсить `parsePatientHomeCmsReturnQuery(searchParams)` → пробросить `patientHomeContext` в форму.
   - `courses/new/page.tsx` уже wired (reference-implementation, см. `apps/webapp/src/app/app/doctor/courses/new/`).

4. **Runtime-status badge** — рядом с каждым блоком в settings/patient-home отображать визуальный индикатор «empty / hidden / ready» (по факту runtime-резолва items, а не только `is_visible` флаг).

   Эталон: `git show backup/visual-with-dirty-2026-04-29:apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockRuntimeStatus.tsx` + хук резолва.

   Адаптация: использовать home `patientHomeBlocksService.listBlocksWithItems` + резолверы из `patientHomeResolvers.ts`.

5. **Centralized admin-copy** — `blockEditorMetadata.ts` для текстов/правил каждого блока (что разрешено, какие target-типы, описание). Visual-эталон:
   `git show backup/visual-with-dirty-2026-04-29:apps/webapp/src/modules/patient-home/blockEditorMetadata.ts`.

   В unified-ветке `apps/webapp/src/modules/patient-home/blocks.ts` уже содержит `allowedTargetTypesForBlock`; metadata-блок добавляется как расширение.

### Жёсткие требования (нельзя нарушать)

1. **Не менять home-схему `patient_home_blocks` / `patient_home_block_items`.** PK — `code` для blocks, overrides и `target_type` — как в home-migration `0008_material_frightful_four.sql`.
2. **DI-контракты сохранить:** все новые server-actions через `buildAppDeps()` → `patientHomeBlocksService` (либо новый модульный сервис) → port. Не вызывать `getPool` или `getDrizzle` из server-actions/route handlers напрямую (см. `.cursor/rules/clean-architecture-module-isolation.mdc`).
3. **Зелёный pre-push CI:** `pnpm install --frozen-lockfile && pnpm run ci` обязательно успешен перед commit (`.cursor/rules/pre-push-ci.mdc`).
4. **Тесты:** для каждого нового UX-компонента — unit-test (vitest + jsdom) с проверкой ключевого поведения. Покрыть happy-path и edge cases.
5. **Слой 1a/1b абсолютов** (`.cursor/rules/clean-architecture-module-isolation.mdc`): не менять существующие LFK-таблицы; никаких FK на полиморфный `item_ref_id`; integration-config — только в `system_settings`.

### Вне scope ++ части (не делать в этой задаче)

- Slug-rename wiring (`SLUG_RENAME_WIRING_TASK.md`) — отдельный follow-up.
- PatientTopNav вмонтирование в `AppShell` lg+ (если нужно — добавь отдельной мини-задачей).
- Доработка миграций — миграция `0012` уже применима, новые таблицы не требуются (используем home-схему).

### План разбиения работы (ориентир, можно корректировать)

1. Inventory: прочитать visual-эталоны через `git show backup/visual-with-dirty-2026-04-29:<path>` для каждой группы (1–5).
2. Phase 1: Configure dialog — портировать UX, переписать на home schema.
3. Phase 2: Inline section creation — server-action + inline form внутри dialog.
4. Phase 3: CMS return-flows wiring во все 4 формы.
5. Phase 4: Runtime status badge.
6. Phase 5: blockEditorMetadata + интеграция в dialog/picker.
7. Phase 6: тесты + `pnpm run ci`.
8. Phase 7: log в `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md` + commit без push.

### Acceptance criteria

- [ ] В `/app/settings/patient-home` для каждого CMS-блока работает «Настроить» → unified dialog с метаданными + items + preview.
- [ ] Inline-section-creation создаёт `content_section` и сразу прицепляет к блоку как item.
- [ ] Из dialog'а ссылки «Создать раздел/материал/курс» уходят с `returnTo` query → после save показывается banner возврата.
- [ ] У каждого блока в settings виден runtime-status badge (`empty` / `hidden` / `ready`).
- [ ] `pnpm run ci` зелёный.
- [ ] Manual smoke (см. `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/06_QA_RELEASE_PLAN.md`): создать раздел из dialog, добавить кандидата, проверить runtime-status, выполнить CMS return-flow для одной формы.
- [ ] Лог в `LOG.md`.

### Recovery / preservation

Все исходные материалы доступны:
- visual-tip: `patient-app-visual-redesign-initiative` (origin).
- WIP-tip: `backup/visual-with-dirty-2026-04-29` (origin) — самая «свежая» visual-версия с продвинутым CMS-editor.
- Тэги (immutable recovery points): `backup/visual-redesign-2026-04-29`, `backup/home-redesign-2026-04-29`, `backup/visual-with-dirty-2026-04-29`.

Если что-то понадобится из «потерянных» в Варианте A файлов:
```bash
git show backup/visual-with-dirty-2026-04-29:<path-to-file>      # просмотр
git checkout backup/visual-with-dirty-2026-04-29 -- <path>       # восстановление в рабочее дерево
```

### Старт

Начать выполнение со ветки `unify/patient-2026-04-29` (НЕ от main). Сделать новую ветку `feat/patient-home-cms-editor-uxlift-2026-04-29` от tip unified.

```bash
git fetch origin
git switch -c feat/patient-home-cms-editor-uxlift-2026-04-29 unify/patient-2026-04-29
```

После завершения — commit без push, отчитаться о состоянии для решения о merge unified → main.
