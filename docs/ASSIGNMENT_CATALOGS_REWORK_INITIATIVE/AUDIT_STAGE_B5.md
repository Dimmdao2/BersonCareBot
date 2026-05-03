# AUDIT_STAGE_B5 — ASSIGNMENT_CATALOGS_REWORK

**Дата:** 2026-05-03  
**Scope:** Stage B5 (комплексы ЛФК: UX pass, «глаз», статусы draft/published/archived, фильтры B1 на списке, синхронизация list ↔ editor после действий)  
**Source plan:** [`STAGE_B5_PLAN.md`](STAGE_B5_PLAN.md), [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md), [`MASTER_PLAN.md`](MASTER_PLAN.md) §9, продуктовое ТЗ [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §3 B5  
**Execution log:** [`LOG.md`](LOG.md) — раздел «Stage B5 — EXEC»

## 1. Verdict

- **Status:** **PASS** (после FIX 2026-05-03)
- **Summary:** Проблема «глаза» — **UX-ожидание** (не state-bug); список/превью/редактор — единый `TemplateStatus` через бейджи; после **publish** / **persist** на split-view — `router.refresh()` для паритета с сервером. **FIX:** toast при persist для опубликованного шаблона; синхронизация чеклиста `STAGE_B5_PLAN.md` §6; **deferred:** автотест на вызов `router.refresh()` после publish (см. §12 minor 3).

## 2. UX vs state-bug — что было не так (привязка к коду)

| Вопрос | Вердикт | Доказательство |
|--------|---------|----------------|
| Был ли «глаз» кнопкой действия? | **Нет** | До B5: в [`LfkTemplatesPageClient.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx) использовались `Eye` / `EyeOff` на **неинтерактивном** контейнере (`cursor-default`, `stopPropagation`) — индикатор «опубликован / не опубликован», а не publish/unpublish. |
| Почему казалось «багом»? | **UX** | Семантика Lucide `Eye`/`EyeOff` = видимость; для `status === "archived"` и `draft` оба давали **EyeOff** → архив визуально совпадал с черновиком, хотя в БД статусы разные. |
| Был ли рассинхрон list vs сервер до B5? | **Частично (поведение клиента)** | После `publish` / `persist` сервер уже делал [`revalidatePath(BASE)`](../../apps/webapp/src/app/app/doctor/lfk-templates/actions.ts), но клиентский split-view держал старые RSC-пропсы до навигации/обновления — **ожидаемо для App Router без `router.refresh()`**. Это не ошибка доменной модели, а отсутствие явного обновления клиентского дерева. |

**Итог классификации:** основная жалоба — **UX и читаемость статуса**; вторично — **синхронизация UI после мутации** на той же странице (исправлено `router.refresh()` в [`TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx)).

## 3. Цепочка publish / archive / restore (ЛФК)

| Действие | Точка входа (UI) | Server / домен | Кэш / навигация | Затронутые файлы |
|----------|------------------|----------------|-----------------|-------------------|
| **Publish** | Кнопка «Опубликовать» → сначала `persistLfkTemplateDraft`, затем `publishLfkTemplateAction` | [`publishTemplate`](../../apps/webapp/src/modules/lfk-templates/service.ts) — только из `draft`; иначе ошибка | `revalidatePath(BASE)` + `revalidatePath(/lfk-templates/:id)`; на клиенте после успеха **`router.refresh()`** | [`TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx), [`actions.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/actions.ts) |
| **Persist (черновик / правки)** | «Сохранить черновик» / «Сохранить изменения» | `updateTemplate` + `updateExercises`; архив запрещён | `revalidatePath(BASE)` + detail; **`router.refresh()`** после успеха | те же |
| **Archive** | Форма `archiveDoctorLfkTemplate` (+ диалог usage при необходимости) | [`archiveTemplate`](../../apps/webapp/src/modules/lfk-templates/service.ts) → `archived` | `revalidatePath(BASE)` → **`redirect`** на список с `listPreserveQuery` | [`actions.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/actions.ts), hidden `listPreserveQuery` в [`TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx) |
| **Restore (unarchive)** | Форма `unarchiveDoctorLfkTemplate` | [`unarchiveTemplate`](../../apps/webapp/src/modules/lfk-templates/service.ts) → статус **`draft`** (не `published`) | `revalidatePath(BASE)` + detail → **`redirect`** на `/lfk-templates/:id` | [`actions.ts`](../../apps/webapp/src/app/app/doctor/lfk-templates/actions.ts) |

**Продуктовая оговорка (не дефект B5):** после восстановления из архива шаблон снова **черновик** (`draft`), не «как до архивации опубликован». Список и [`LfkTemplateStatusBadge`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplateStatusBadge.tsx) должны показывать **«Черновик»** — согласовано с доменом.

## 4. Parity статуса list ↔ editor после действий

| Сценарий | Ожидание | Статус аудита |
|----------|----------|---------------|
| Split-view `/lfk-templates`: publish успешен | Список и бейдж в строке + блок в редакторе отражают `published` без ручного F5 | **PASS** — `revalidatePath` + `router.refresh()` после успеха ([`TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx) ~L412–L451). |
| Split-view: persist успешен | Счётчик упражнений / превью в списке обновляются с сервера | **PASS** — тот же refresh после persist. |
| Archive из split-view | Пользователь уходит на список с preserve; выбор строки корректируется [`useDoctorCatalogMasterSelectionSync`](../../apps/webapp/src/shared/hooks/useDoctorCatalogMasterSelectionSync.ts) (`fallbackToFirst: false` в [`LfkTemplatesPageClient.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx)) | **PASS** — полная навигация после `redirect`. |
| Unarchive | Редирект на полноэкранный `[id]`; RSC заново отдаёт шаблон | **PASS** — не требует `router.refresh()` на split-view. |
| Standalone `/lfk-templates/[id]` | Publish/persist уже ревалидируют пути; refresh обновляет страницу | **PASS** (стандартное поведение Next). |

**Ограничение (низкий риск):** локальное состояние полей (`title`, `lines`, …) сбрасывается при смене `template.id` ([`useEffect` по `recordKey`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx)), но **не** при изменении только `template.updatedAt` / упражнений с того же id без смены id. Для типичного сценария «один врач, один таб» после собственного persist/publish данные совпадают с сервером; расхождение возможно только при конкурирующих правках — **вне scope B5**.

## 5. Scope vs STAGE_B5 / ТЗ

| Требование | Статус | Примечание |
|------------|--------|------------|
| Диагностика «глаза» + классификация | **PASS** | Зафиксировано в [`LOG.md`](LOG.md) и §2 настоящего аудита. |
| Список: превью, счётчик, статус draft/published/archived | **PASS** | [`LfkTemplatesPageClient.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx) + [`LfkTemplateStatusBadge.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplateStatusBadge.tsx). |
| Карточка/превью панель | **PASS** | [`LfkTemplatePreviewPanel.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/LfkTemplatePreviewPanel.tsx). |
| Редактор: CTA, disabled, подсказки | **PASS** | [`TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx). |
| Фильтры B1 на списке | **PASS (без нового diff)** | Уже в [`page.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/page.tsx) (`parseDoctorCatalogPubArchQuery`, `lfkTemplateFilterFromPubArch`) + [`DoctorCatalogFiltersForm`](../../apps/webapp/src/shared/ui/doctor/DoctorCatalogFiltersForm.tsx) в B5 EXEC не менялись — регрессия маловероятна. |
| Сверка с `ASSIGNMENT_CATALOG_USAGE_ARCHIVE_PLAN` | **Not automated** | Логика usage + acknowledge на месте в архиве; полная сверка — ручной smoke (см. §8). |

## 6. Architecture / rules

- [x] Нет новых env для интеграций; изменения только в `app/doctor/lfk-templates/*` + shared UI.
- [x] Server actions остаются тонкими обёртками над `buildAppDeps` + `revalidatePath` / `redirect`.

## 7. Test evidence (зафиксировано в `LOG.md` B5)

Целевые: `eslint` / `vitest` (`LfkTemplateStatusBadge.test.tsx`, `TemplateEditor.test.tsx`, `lfkTemplatesListPreserveQuery.test.ts`) / `tsc --noEmit` в `apps/webapp` — **PASS** по записи EXEC.

**Пробел (deferred):** нет интеграционного теста на вызов `router.refresh()` после publish — намеренно: нужен мок цепочки server action + transition; в [`TemplateEditor.test.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.test.tsx) зафиксирован комментарий (FIX 2026-05-03).

## 8. Manual smoke (рекомендуется зафиксировать в релиз-нотах)

1. `/app/doctor/lfk-templates` (desktop split): черновик → **Опубликовать** → бейдж в списке и в редакторе **«Опубликован»** без F5.  
2. Тот же шаблон → **Архивировать** (при необходимости через usage-dialog) → редирект на список, preserve query, строка исчезает при фильтре «без архива» / видна при «архив».  
3. Открыть архивный шаблон → **Вернуть из архива** → редирект на `[id]`, бейдж **«Черновик»** (ожидаемое доменное поведение после unarchive).

## 9. Findings

### High

- Не выявлено.

### Medium

- Не выявлено (цепочки revalidate/redirect/refresh согласованы с ожиданиями B5).

### Low / risks

1. ~~**Toast vs статус**~~ — **исправлено в FIX 2026-05-03:** [`TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx) — при `template.status === "published"` toast «Изменения сохранены».  
2. ~~**Документация плана**~~ — **исправлено в FIX 2026-05-03:** [`STAGE_B5_PLAN.md`](STAGE_B5_PLAN.md) §6 — чеклист закрыт с ссылками на AUDIT/LOG.  
3. **Нет E2E** на паритет list/editor после publish — **deferred:** стоимость vs польза; ручной smoke §8 остаётся каноном до появления Playwright-контура (см. §7).

## 10. Deferred

- Расширение `useEffect` синхронизации редактора с `template.updatedAt` при многовкладочных конфликтах — только при продуктовом запросе.  
- Автотест `router.refresh()` после publish (см. §7, §12 minor 3).  
- Опционально: ссылка из этого AUDIT на результаты ручного smoke §8 (дата/исполнитель).

## 11. DoD B5 (чеклист)

- [x] Классификация «глаза» + запись в `LOG.md`.  
- [x] List / preview / editor UX по статусу.  
- [x] Parity после publish/persist на split-view.  
- [x] Целевые lint/test/tsc (не полный `pnpm run ci`).  
- [x] MANDATORY FIX §12 — **закрыт** (FIX 2026-05-03): minor 1–2 done, minor 3 deferred с обоснованием.

---

## 12. MANDATORY FIX INSTRUCTIONS — **выполнено (2026-05-03)**

### critical

*Не выявлено в первичном аудите — закрыто без действий (N/A).*

### major

*Не выявлено в первичном аудите — закрыто без действий (N/A).*

### minor — done / deferred

1. **Done:** toast после успешного `persist` — «Изменения сохранены» при `template.status === "published"`, иначе «Черновик сохранён» — [`TemplateEditor.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.tsx).

2. **Done:** чеклист §6 в [`STAGE_B5_PLAN.md`](STAGE_B5_PLAN.md) отмечен выполненным; пункты 4–5 с явной пометкой «ручной smoke / сверка по коду» (не E2E в репозитории).

3. **Deferred:** интеграционный тест на `router.refresh()` после publish — не внедрялось: требует изолированного мока `publishLfkTemplateAction` + user-event в transition; **вместо этого** комментарий в [`TemplateEditor.test.tsx`](../../apps/webapp/src/app/app/doctor/lfk-templates/TemplateEditor.test.tsx) (см. §7).

---

## 13. FIX 2026-05-03 (закрытие AUDIT)

| ID | Действие | Файлы |
|----|----------|--------|
| critical / major | Подтверждение отсутствия находок | — (N/A) |
| minor 1 | Toast при persist для опубликованного шаблона | `TemplateEditor.tsx` |
| minor 2 | Синхронизация execution checklist | `STAGE_B5_PLAN.md` |
| minor 3 | Документированный defer + комментарий в тесте | `TemplateEditor.test.tsx`, §7–§10 AUDIT |

---

## 14. После FIX (статус)

- **Verdict:** см. §1 **PASS**.  
- [`LOG.md`](LOG.md) — запись «Stage B5 — FIX (AUDIT)».  
- Коммит по [`MASTER_PLAN.md`](MASTER_PLAN.md) §9.
