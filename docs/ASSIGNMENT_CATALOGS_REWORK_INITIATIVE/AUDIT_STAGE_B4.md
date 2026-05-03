# AUDIT_STAGE_B4 — ASSIGNMENT_CATALOGS_REWORK

**Дата:** 2026-05-03  
**Scope:** Stage B4 (рекомендации: тип в UI, регион тела, метрики текста, фильтры, совместимость с архивом)  
**Source plan:** [`STAGE_B4_PLAN.md`](STAGE_B4_PLAN.md), [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md) §1 B4/Q3–Q4, [`MASTER_PLAN.md`](MASTER_PLAN.md), продуктовое ТЗ [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §3 B4

## 1. Verdict

- **Status:** **PASS WITH RISKS**
- **Summary:** Колонка `domain`, UI «Тип», поля `body_region_id` / `quantity_text` / `frequency_text` / `duration_text`, расширение кодов типа без merge в миграции, фильтр списка AND по `domain` + `region`, сохранение списка при inline save/archive/unarchive — соответствуют PRE_IMP и плану B4. **Риски:** расхождение строгости query `domain`/`region` между SSR-страницей каталога и `GET /api/doctor/recommendations`; отсутствие баннера при невалидном `?domain=` (в отличие от клинических тестов и `?assessment=`). Закрытие рисков — в **MANDATORY FIX** ниже.

## 2. Scope Verification

| Requirement | Source | Status | Evidence |
|-------------|--------|--------|----------|
| Колонка БД `domain`, UI «Тип» (не переименование в `kind`) | PRE_IMP Q4, STAGE_B4 §5 | **PASS** | [`recommendationDomain.ts`](../../apps/webapp/src/modules/recommendations/recommendationDomain.ts) (коды + подписи); [`RecommendationForm.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx) лейбл «Тип»; [`RecommendationsPageClient.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationsPageClient.tsx) tertiary «Тип» |
| `body_region_id` FK, три текстовых поля | ТЗ §3 B4, STAGE_B4 §3 | **PASS** | [`0036_recommendations_b4_body_region_metrics.sql`](../../apps/webapp/db/drizzle-migrations/0036_recommendations_b4_body_region_metrics.sql); [`recommendations.ts`](../../apps/webapp/db/schema/recommendations.ts); типы [`types.ts`](../../apps/webapp/src/modules/recommendations/types.ts) |
| Без merge legacy `domain` в той же миграции | PRE_IMP Q3 | **PASS** | Миграция `0036` — только `ADD COLUMN` / FK / индекс; **нет** `UPDATE recommendations SET domain …` |
| Расширение enum/кодов типа без массовой нормализации строк | PRE_IMP Q3 | **PASS** | Новые коды в `RECOMMENDATION_DOMAIN_CODES`; строки с неизвестным `domain` в БД читаются как `domain: null` в DTO ([`mapRow` в `pgRecommendations.ts`](../../apps/webapp/src/infra/repos/pgRecommendations.ts)) — без silent DB rewrite |
| Фильтр по типу (`domain`) и региону, пересечение AND | STAGE_B4 §7 | **PASS** | [`pgRecommendations.ts`](../../apps/webapp/src/infra/repos/pgRecommendations.ts) `list`: `eq(domain)` + `eq(bodyRegionId)`; [`inMemoryRecommendations.ts`](../../apps/webapp/src/infra/repos/inMemoryRecommendations.ts) `matchesFilter`; [`service.test.ts`](../../apps/webapp/src/modules/recommendations/service.test.ts) сценарий пересечения |
| Archive / unarchive не ломают новые поля | STAGE_B4 §6 | **PASS** | `archive`/`unarchive` в `pgRecommendations` меняют только `is_archived` / `updated_at`; тест «retain B4 fields» в `service.test.ts` |
| Preserve query каталога (inline) | STAGE_B4, usage | **PASS** | [`RecommendationForm.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx) hidden `listQ` / `listTitleSort` / `listRegion` / `listDomain` / `listStatus`; [`actionsInline.ts`](../../apps/webapp/src/app/app/doctor/recommendations/actionsInline.ts) `appendRecommendationsListParams` |
| REST API согласована с полями B4 | ТЗ / api | **PASS** (с оговоркой §10) | [`route.ts`](../../apps/webapp/src/app/api/doctor/recommendations/route.ts), [`[id]/route.ts`](../../apps/webapp/src/app/api/doctor/recommendations/[id]/route.ts); [`api.md`](../../apps/webapp/src/app/api/api.md) |

## 3. Changed Files (ревью-ориентир)

| Область | Файлы | Risk |
|---------|-------|------|
| Схема / миграция | `db/schema/recommendations.ts`, `relations.ts`, `0036_*.sql`, `_journal.json` | low при применённом `migrate` |
| Домен / типы | `recommendationDomain.ts`, `types.ts`, `service.ts` | low |
| Репозитории | `pgRecommendations.ts`, `inMemoryRecommendations.ts` | low |
| Server actions | `actionsShared.ts` | low |
| Doctor UI | `RecommendationForm.tsx`, `RecommendationsPageClient.tsx`, `RecommendationForm.test.tsx` | low |
| SSR страница списка | `recommendations/page.tsx` | **medium** (см. §10, MANDATORY FIX) |
| API | `api/doctor/recommendations/route.ts`, `[id]/route.ts` | low |
| Доки / лог | `LOG.md`, `STAGE_B4_PLAN.md` | low |

## 4. Architecture Rules Check

- [x] `modules/recommendations/*` не импортирует `@/infra/db/*` / `@/infra/repos/*`.
- [x] Route handlers рекомендаций API: parse (Zod) → `buildAppDeps` → сервис → JSON.
- [x] Новые колонки через Drizzle + SQL-миграция.
- [x] Порты в `modules/recommendations/ports.ts`, реализации в `infra/repos/*`.
- [x] Интеграционные env для B4 не добавлялись.

## 5. UI Contract Check (doctor)

- [x] `ReferenceSelect`, `Input`, `Label`, shadcn-примитивы; без одноразового «хрома» вне паттерна каталога.
- [x] B6-ограничения не затрагивались.

## 6. Patient-facing

- [x] Не затрагивался (только кабинет врача).

## 7. Data Migration / Backfill

| Migration | Reversible? | Backfill? | Notes |
|-----------|-------------|------------|--------|
| `0036_recommendations_b4_body_region_metrics` | Да (DROP COLUMN / FK / index) | Нет (nullable по умолчанию) | Соответствует STAGE_B4: старые строки валидны с `NULL` регионом/метриками; **без** смешения/нормализации `domain` в этой миграции. |

## 8. Test Evidence (зафиксировано в `LOG.md` B4 EXEC)

```bash
cd apps/webapp && pnpm exec eslint <список из LOG B4>
pnpm exec vitest run \
  src/modules/recommendations/recommendationDomain.test.ts \
  src/modules/recommendations/service.test.ts \
  src/app/app/doctor/recommendations/RecommendationForm.test.tsx
pnpm exec tsc --noEmit
```

На момент аудита: **eslint / vitest / tsc — PASS** (по записи в `LOG.md`); полный `pnpm run ci` вне scope B4 EXEC.

## 9. Manual Smoke (рекомендации)

- [ ] Ручной прогон: список с `?domain=` + `?region=` + «Применить», создание/редактирование с телом региона и тремя текстами, архив/разархив с проверкой URL после inline-действий.
- [ ] Невалидный `?domain=` и невалидный `?region=` на SSR и через API — см. MANDATORY FIX.

## 10. Regressions / Findings

### High

- Не выявлено статическим аудитом (без обязательного runtime на прод-БД).

### Medium

1. **SSR `doctor/recommendations/page.tsx` vs `GET /api/doctor/recommendations`:** API возвращает **`400`** при неизвестном `domain` и при `region` не UUID ([`route.ts`](../../apps/webapp/src/app/api/doctor/recommendations/route.ts)). На SSR-странице [`page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/page.tsx) неизвестный `domain` через `parseRecommendationDomain` превращается в отсутствие фильтра (**тихий сброс фильтра**), `region` передаётся в список как строка **без** UUID-проверки (клинический каталог в SSR делает так же для `region`, но API клиники валидирует UUID — см. [`clinical-tests/route.ts`](../../apps/webapp/src/app/api/doctor/clinical-tests/route.ts)). Риск: расхождение ожиданий интегратора и врача; для `region` — теоретический риск ошибки БД при мусорном UUID-строке (зависит от драйвера/запроса).

2. **Нет UX-индикатора невалидного `?domain=`** на каталоге рекомендаций: для клинических тестов есть `invalidAssessmentQuery` + баннер в [`ClinicalTestsPageClient.tsx`](../../apps/webapp/src/app/app/doctor/clinical-tests/ClinicalTestsPageClient.tsx); для рекомендаций аналог **отсутствует**.

### Low

3. **Неизвестный текст в колонке `domain` в БД** (опечатка, старый код вне allowlist): в UI тип отображается как «не выбран» (`null` в DTO), при этом сырое значение в БД сохраняется — ожидаемо по Q3, но может сбивать с толку до ручной правки.

4. **Standalone `actions.ts`** ([`actions.ts`](../../apps/webapp/src/app/app/doctor/recommendations/actions.ts)): `saveRecommendation` / `archiveRecommendation` / `unarchiveRecommendation` редиректят без preserve списка (`listQ`, `region`, …) — **ожидаемо** для маршрутов вне master-detail; [`new/page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/new/page.tsx) не передаёт `workspaceListPreserve`.

5. **Успешный `archiveRecommendationInline`** редиректит на список **без** `selected=` — выбранная строка сбрасывается; фильтры сохраняются через `appendRecommendationsListParams`. Приемлемо, но отличается от `unarchive` (там `selected` восстанавливается).

## 11. Deferred Work

- Периодический smoke §9.
- Опционально: расширить `GET` list query оси архива до паритета с UI (`status=active|all|archived`), если API станет единственным клиентом каталога (сейчас доминирует SSR + `includeArchived`).

## 12. Final DoD (этап B4)

- [x] Поля и UI по PRE_IMP / ТЗ B4.
- [x] Миграция без merge legacy `domain`.
- [x] Фильтры type + region (AND) и тесты пересечения.
- [x] Archive/unarchive + preserve для inline-сценария.
- [x] `LOG.md` обновлён (EXEC).
- [x] Коммит за EXEC ([`MASTER_PLAN.md`](MASTER_PLAN.md) §9).
- [ ] **Открыто:** пункты MANDATORY FIX (major) до статуса **PASS** без оговорок — по решению команды.

---

## MANDATORY FIX INSTRUCTIONS

> Исполнить в рамках **FIX по AUDIT_STAGE_B4** (отдельный коммит; целевые проверки по [`STAGE_B4_PLAN.md`](STAGE_B4_PLAN.md) §8; полный `pnpm run ci` — перед пушем по [`MASTER_PLAN.md`](MASTER_PLAN.md) §9).

### critical

*Нет.* На момент аудита блокирующих дефектов целостности данных или безопасности не зафиксировано.

### major

1. **Паритет валидации query с REST для каталога рекомендаций (SSR)**  
   - **Проблема:** `GET /api/doctor/recommendations` отклоняет невалидный `domain` и не-UUID `region`; [`recommendations/page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/page.tsx) этого не делает.  
   - **Сделать:** Перед `listRecommendations` на SSR:  
     - если задан `sp.domain` и после `parseRecommendationDomain` фильтр пуст — выставить флаг `invalidDomainQuery` (аналог [`invalidAssessmentQuery`](../../apps/webapp/src/app/app/doctor/clinical-tests/page.tsx) для тестов) и **не** применять фильтр по типу **или** отдавать 400 на уровне страницы — **выбрать один канон** и синхронизировать с поведением API;  
     - для `region`: если строка непустая и не UUID — либо игнорировать фильтр + флаг `invalidRegionQuery`, либо 400 — **согласовать с `GET` API** (предпочтительно то же правило, что в [`clinical-tests/route.ts`](../../apps/webapp/src/app/api/doctor/clinical-tests/route.ts) для `region`).  
   - **Проверки:** unit/compose при необходимости; ручной smoke URL с мусором `domain`/`region`.

2. **Баннер невалидного `?domain=` в UI каталога**  
   - **Проблема:** Врач не видит, что фильтр по типу не применён (см. §10.2).  
   - **Сделать:** В [`RecommendationsPageClient.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationsPageClient.tsx) (и проп `filters` из `page.tsx`) добавить баннер по образцу клинических тестов (`invalidAssessmentQuery`).  
   - **Проверки:** визуальный smoke; при наличии тестов на клиент — snapshot/RTL.

### minor

3. **Документация:** в `api.md` или модульном README кратко описать: неизвестный `domain` в БД → `null` в API-ответе (намеренно, без auto-migration).

4. **Опционально:** в `appendRecommendationsListParams` при невалидном `listDomain` не молча пропускать параметр — логировать на сервере (debug) или не включать в redirect (сейчас уже не попадает в URL, если `parseRecommendationDomain` вернул `undefined`).

5. **Deferred:** standalone редиректы без preserve списка — оставить как есть или задокументировать в doctor UX guidelines.

---

## 13. После FIX

- Обновить **§1 Verdict** → **PASS**.  
- Закрыть critical/major в этом файле; перенести резюме в [`LOG.md`](LOG.md) (запись B4 FIX).  
- Коммит по [`MASTER_PLAN.md`](MASTER_PLAN.md) §9.
