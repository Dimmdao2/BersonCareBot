# LOG — ASSIGNMENT_CATALOGS_REWORK_INITIATIVE

Формат: дата, этап (B1…B7), что сделано, проверки, решения, вне scope.

Используйте [`LOG_TEMPLATE.md`](LOG_TEMPLATE.md) для новых записей.

---

## 2026-05-03 — Bootstrap

Создан execution-контур: [`README.md`](README.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), [`STAGE_B1_PLAN.md`](STAGE_B1_PLAN.md) … [`STAGE_B7_PLAN.md`](STAGE_B7_PLAN.md), шаблоны лога и аудита. Код не менялся.

Синхронизация ссылок: [`../APP_RESTRUCTURE_INITIATIVE/README.md`](../APP_RESTRUCTURE_INITIATIVE/README.md), [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §6, [`../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/PROGRAM_PATIENT_SHAPE_PLAN.md), [`../PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md`](../PROGRAM_PATIENT_SHAPE_INITIATIVE/README.md), [`../README.md`](../README.md), [`../APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md`](../APP_RESTRUCTURE_INITIATIVE/RECOMMENDATIONS_AND_ROADMAP.md) §«Этап 9»; запись в [`../APP_RESTRUCTURE_INITIATIVE/LOG.md`](../APP_RESTRUCTURE_INITIATIVE/LOG.md).

---

## 2026-05-03 — Планы + промпты (Git/CI дисциплина)

- Во все `STAGE_B1`…`B7` добавлен единый блок дисциплины (коммит после EXEC/FIX; пуш пачками после **B3, B6, B7**; CI — см. `MASTER_PLAN` §9).
- `MASTER_PLAN.md` §9: коммиты, ритм пуша, step/phase CI, **запрет** `pnpm run ci` на каждый коммит; перед пушем полный CI; при падении — `ci:resume:*` (ссылки на `.cursor/rules/test-execution-policy.md`, `pre-push-ci.mdc`).
- Этапные планы уточнены под `PRE_IMPLEMENTATION_DECISIONS` (B1 `status`/test_sets, B2 Q*, B3 Q5+dnd-kit, B4 Q3/Q4, B5 «глаз», B7 `lfk_complex_exercises.local_comment`).
- Новый [`PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`](PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md); обновлён [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md) (ссылка на промпты и §9).
- `LOG_TEMPLATE.md`: контекст Git/CI, чекбокс коммита, правка формулировки B6.

---

## 2026-05-03 — Корректировка решений (B1/test_sets, B6 vs A, Q5)

- По решению пользователя обновлено: **B1** сразу включает публикационный статус для `test_sets` + два соседних фильтра в UI (`active/archived` и `all/draft/published`).
- **Q5** закрыт в сторону удаления UUID-textarea без fallback.
- **B6**: добавлен обязательный pre-check текущего состояния конструктора после завершения фазы A перед EXEC B6.
- Документы синхронизированы: `PRE_IMPLEMENTATION_DECISIONS.md`, `MASTER_PLAN.md`, `STAGE_B1_PLAN.md`, `STAGE_B3_PLAN.md`, `STAGE_B6_PLAN.md`, `PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`, и продуктовое ТЗ `../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`.

---

## 2026-05-03 — Detail pass: планы, чек-листы, промпты

- Углублены этапные планы `STAGE_B2_PLAN.md`, `STAGE_B4_PLAN.md`, `STAGE_B5_PLAN.md`, `STAGE_B7_PLAN.md`: добавлены контракты данных, декомпозиция реализации, negative-path проверки, расширенный DoD.
- В `LOG_TEMPLATE.md` добавлен блок stage-specific completeness checks и явная фиксация smoke-результатов.
- `PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md` синхронизирован с детализацией этапов (B2/B4/B5/B7), чтобы агент не пропускал критические проверки в AUDIT/FIX.

---

## 2026-05-03 — Stage B1 — EXEC (публикация × архив, test_sets)

**Контекст:** `STAGE_B1_PLAN.md`, `PRE_IMPLEMENTATION_DECISIONS.md`, продуктовое ТЗ §3 B1.

**Сделано:**

- Drizzle `0033_test_sets_publication_status`: колонка `publication_status` (`draft`|`published`), CHECK, индекс `(is_archived, publication_status)`; схема `db/schema/clinicalTests.ts`.
- Парсинг query `arch` × `pub` + legacy `status`/`scope`: `doctorCatalogListStatus.ts`; билдеры фильтров для ЛФК, шаблонов программ, наборов тестов.
- UI `CatalogStatusFilters` + `DoctorCatalogListSortHeader` (`catalogPubArch`); подключено к спискам ЛФК, шаблонов программ, наборов тестов.
- Репозитории: `pgTestSets` / `inMemoryTestSets` — фильтр `publicationScope`, CRUD `publicationStatus`; `pgLfkTemplates` — `statusIn` для «все кроме архива».
- Форма набора: выбор публикации, preserve `listArch`/`listPub` в редиректах (`actionsInline` / `actionsShared`).
- `lfkTemplatesListPreserveQuery` переведён на `listPubArch`; тесты парсера/билдеров/preserve.

**Проверки:** `eslint` по затронутым файлам; `vitest run` на `doctorCatalogListStatus.test.ts`, `lfkTemplatesListPreserveQuery.test.ts`, `TestSetForm.test.tsx`; `pnpm exec tsc --noEmit` в `apps/webapp`.

**Вне scope:** курсы (`courses/page.tsx`) — прежний одноосевый `status`; клинические тесты / рекомендации / упражнения — без оси публикации.

