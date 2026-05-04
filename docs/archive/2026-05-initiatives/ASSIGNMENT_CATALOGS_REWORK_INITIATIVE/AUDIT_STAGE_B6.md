# AUDIT_STAGE_B6 — ASSIGNMENT_CATALOGS_REWORK

**Дата:** 2026-05-03  
**Scope:** Stage B6 (шаблоны программ: UX pass-1 списка и конструктора, превью библиотеки, CTA публикации, без снятия A1/A3 и без смены snapshot/assign)  
**Source plan:** [`STAGE_B6_PLAN.md`](STAGE_B6_PLAN.md), [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md), [`MASTER_PLAN.md`](MASTER_PLAN.md) §9, продуктовое ТЗ [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../../../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §3 B6  
**Execution log:** [`LOG.md`](LOG.md) — разделы «Stage B6 — EXEC», «Stage B6 — FIX»

## 1. Verdict

- **Status:** **PASS**
- **Summary:** Baseline после A и scope соблюдены. **Major 1 (refresh после `PATCH` статуса в split-view)** закрыт в FIX: после успешной смены draft/published всегда вызывается `router.refresh()`. Добавлен unit-тест на паритет при переданном `onArchived`. Список шаблонов: читаемые счётчики с русским числом и `aria-label`. **Defer-closure 2026-05-03:** серверное поле `listPreviewMedia` (первый item по порядку этапов для типов `exercise` / `recommendation` / `test_set` / `lfk_complex`) + миниатюра в строке списка при наличии медиа. Полный **`pnpm run ci`** в сессии FIX не прогонялся — **остаточный риск только перед push** (см. [`MASTER_PLAN.md`](MASTER_PLAN.md) §9; рекомендация пользователя: полный CI перед пуш-чекпоинтом B6).

## 2. Соответствие STAGE_B6_PLAN §5 и baseline в LOG

| Пункт `STAGE_B6_PLAN.md` §5 | Статус после FIX |
|-----------------------------|------------------|
| 1. Pre-check в LOG | **PASS** |
| 2. Список: превью / счётчики / статус | **PASS** — миниатюра первого элемента программы, когда сервер заполняет `listPreviewMedia` (типы `exercise`, `recommendation`, `test_set`, `lfk_complex`); иначе иконка-заглушка; `lesson` — пока без превью в списке. Счётчики + бейдж статуса — как в FIX. |
| 3. Конструктор: layout + CTA + бейдж | **PASS** |
| 4. Модалка библиотеки: превью по типам | **PASS** |
| 5. `editLocked` | **PASS** |
| 6. Тесты | **PASS** — добавлен кейс на `refresh` после publish с `onArchived` |
| 7. Smoke | **Deferred** — автоматизирован паритет refresh; полный ручной smoke §8 — по желанию перед релизом / в E2E-контуре |

Чеклист §5 в [`STAGE_B6_PLAN.md`](STAGE_B6_PLAN.md) отмечен `[x]` после FIX.

## 3. Границы scope

Без изменений относительно первичного аудита: A1/A3 на месте, snapshot/assign/item-types не трогались; расширение read-модели `stageCount`/`itemCount` — задокументировано в `LOG.md` EXEC.

## 4. Регресс конструктора

| Сценарий | После FIX |
|----------|------------|
| Publish / draft в split-view | **PASS** — `router.refresh()` после успешного `PATCH` |
| Архивация + 409 + ack | **PASS** (без регрессии; `onArchived` + refresh по-прежнему согласованы) |
| Standalone `[id]` | **PASS** |

## 5–7. Architecture / UI / Test evidence

Как в первичном аудите §5–7; дополнительно: целевые `eslint` / `vitest` / `tsc` — см. запись **Stage B6 — FIX** в [`LOG.md`](LOG.md).

## 8. Manual smoke

Рекомендации §8 первичного аудита остаются полезными для QA; **не** являются блокером закрытия AUDIT после FIX.

## 9. Findings (после FIX)

### High / Medium

- Закрыто (**major 1**).

### Low

- Не требуют действия в FIX: см. §10 deferred.

## 10. Deferred

- **Расширение превью в списке:** тип элемента **`lesson`** (и прочие редкие кейсы) — при необходимости отдельным SQL/маппингом.  
- **E2E** smoke §8 — при появлении Playwright-контура.  
- **Полный `pnpm run ci`** — обязателен **перед push** рекомендуемого чекпоинта B6 ([`MASTER_PLAN.md`](MASTER_PLAN.md) §9).

## 11. DoD B6

- [x] UX + паритет списка после publish/draft.  
- [x] `LOG.md` + коммит FIX.  
- [x] `STAGE_B6_PLAN.md` §5 чекбоксы.  
- [x] Полный `pnpm run ci` на актуальном дереве — зафиксирован в [`AUDIT_PREPUSH_POSTFIX.md`](AUDIT_PREPUSH_POSTFIX.md) §1 (барьер перед push по [`MASTER_PLAN.md`](MASTER_PLAN.md) §9).

---

## 12. MANDATORY FIX INSTRUCTIONS — **выполнено (2026-05-03 FIX)**

### critical

*N/A — закрыто без действий.*

### major

1. **~~Синхронизация каталога после `PATCH status` (split-view)~~** — **done:** в [`TreatmentProgramConstructorClient.tsx`](../../../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.tsx) после успешного `patchPublicationStatus` всегда вызывается `router.refresh()`; тест [`TreatmentProgramConstructorClient.test.tsx`](../../../../apps/webapp/src/app/app/doctor/treatment-program-templates/[id]/TreatmentProgramConstructorClient.test.tsx) (`calls router.refresh after publish when onArchived is provided`).

### minor — done / deferred

1. **Done:** чекбоксы §5 в [`STAGE_B6_PLAN.md`](STAGE_B6_PLAN.md).  
2. **Deferred:** явная строка в `LOG.md` о ручном проходе §8 — не требуется при наличии unit-покрытия refresh; полный ручной smoke — перед релизом по процессу команды.  
3. **Done:** vitest на publish + `refresh` при `onArchived` (см. major 1).  
4. **Done:** [`TreatmentProgramTemplatesPageClient.tsx`](../../../../apps/webapp/src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx) — `templateListCountsText` + `aria-label`.  
5. **Deferred (push):** `pnpm install --frozen-lockfile && pnpm run ci` перед рекомендуемым пуш-чекпоинтом B6.

## 13. Закрытие

- Verdict: **PASS** (остаточный риск: только отсутствие полного CI в сессии агента → закрыть перед **push**).  
- MANDATORY: **major 1** — **done**; critical — N/A; minor — по таблице §12.
