# AUDIT_STAGE_B4 — ASSIGNMENT_CATALOGS_REWORK

**Дата:** 2026-05-03  
**Scope:** Stage B4 (рекомендации: тип в UI, регион тела, метрики текста, фильтры, совместимость с архивом)  
**Source plan:** [`STAGE_B4_PLAN.md`](STAGE_B4_PLAN.md), [`PRE_IMPLEMENTATION_DECISIONS.md`](PRE_IMPLEMENTATION_DECISIONS.md) §1 B4/Q3–Q4, [`MASTER_PLAN.md`](MASTER_PLAN.md), продуктовое ТЗ [`../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md`](../APP_RESTRUCTURE_INITIATIVE/ASSIGNMENT_CATALOGS_REWORK_PLAN.md) §3 B4

## 1. Verdict

- **Status:** **PASS** (после FIX 2026-05-03)
- **Summary:** Колонка `domain`, UI «Тип», поля B4, миграция без merge legacy `domain`, фильтры AND, inline preserve — закрыты. Риски SSR vs API и отсутствие баннеров — **сняты** в FIX: общий парсер `parseRecommendationCatalogSsrQuery`, баннеры на каталоге, `api.md` про `domain` вне allowlist.

## 2. Scope Verification

| Requirement | Source | Status | Evidence |
|-------------|--------|--------|----------|
| Колонка БД `domain`, UI «Тип» (не переименование в `kind`) | PRE_IMP Q4, STAGE_B4 §5 | **PASS** | [`recommendationDomain.ts`](../../apps/webapp/src/modules/recommendations/recommendationDomain.ts) (коды + подписи); [`RecommendationForm.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx) лейбл «Тип»; [`RecommendationsPageClient.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationsPageClient.tsx) tertiary «Тип» |
| `body_region_id` FK, три текстовых поля | ТЗ §3 B4, STAGE_B4 §3 | **PASS** | [`0036_recommendations_b4_body_region_metrics.sql`](../../apps/webapp/db/drizzle-migrations/0036_recommendations_b4_body_region_metrics.sql); [`recommendations.ts`](../../apps/webapp/db/schema/recommendations.ts); типы [`types.ts`](../../apps/webapp/src/modules/recommendations/types.ts) |
| Без merge legacy `domain` в той же миграции | PRE_IMP Q3 | **PASS** | Миграция `0036` — только `ADD COLUMN` / FK / индекс; **нет** `UPDATE recommendations SET domain …` |
| Расширение enum/кодов типа без массовой нормализации строк | PRE_IMP Q3 | **PASS** | Коды «типа» — справочник БД `recommendation_type` (Stage D3, см. [`AUDIT_STAGE_D3.md`](AUDIT_STAGE_D3.md)). **Сноска к формулировке B4:** ранее здесь было «неизвестный `domain` → `null` в DTO» по `mapRow` — после **D3** чтение **read tolerant** (сырое значение в DTO); см. [`AUDIT_STAGE_D3.md`](AUDIT_STAGE_D3.md) §4. Без silent rewrite строк в БД. |
| Фильтр по типу (`domain`) и региону, пересечение AND | STAGE_B4 §7 | **PASS** | [`pgRecommendations.ts`](../../apps/webapp/src/infra/repos/pgRecommendations.ts) `list`: `eq(domain)` + `eq(bodyRegionId)`; [`inMemoryRecommendations.ts`](../../apps/webapp/src/infra/repos/inMemoryRecommendations.ts) `matchesFilter`; [`service.test.ts`](../../apps/webapp/src/modules/recommendations/service.test.ts) сценарий пересечения |
| Archive / unarchive не ломают новые поля | STAGE_B4 §6 | **PASS** | `archive`/`unarchive` в `pgRecommendations` меняют только `is_archived` / `updated_at`; тест «retain B4 fields» в `service.test.ts` |
| Preserve query каталога (inline) | STAGE_B4, usage | **PASS** | [`RecommendationForm.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx) hidden `listQ` / `listTitleSort` / `listRegion` / `listDomain` / `listStatus`; [`actionsInline.ts`](../../apps/webapp/src/app/app/doctor/recommendations/actionsInline.ts) `appendRecommendationsListParams` |
| REST API согласована с полями B4 | ТЗ / api | **PASS** | [`route.ts`](../../apps/webapp/src/app/api/doctor/recommendations/route.ts), [`[id]/route.ts`](../../apps/webapp/src/app/api/doctor/recommendations/[id]/route.ts); [`api.md`](../../apps/webapp/src/app/api/api.md) (`invalid_query`, `field` для `domain`/`region`; сериализация `domain` — D3 read tolerant) |
| SSR каталог: паритет фильтров с GET API + баннеры | AUDIT §10 (FIX) | **PASS** | [`recommendationCatalogSsrQuery.ts`](../../apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.ts), [`page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/page.tsx), [`RecommendationsPageClient.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationsPageClient.tsx) |

## 3. Changed Files (ревью-ориентир)

| Область | Файлы | Risk |
|---------|-------|------|
| Схема / миграция | `db/schema/recommendations.ts`, `relations.ts`, `0036_*.sql`, `_journal.json` | low при применённом `migrate` |
| Домен / типы | `recommendationDomain.ts`, `types.ts`, `service.ts` | low |
| Репозитории | `pgRecommendations.ts`, `inMemoryRecommendations.ts` | low |
| Server actions | `actionsShared.ts` | low |
| Doctor UI | `RecommendationForm.tsx`, `RecommendationsPageClient.tsx`, `RecommendationForm.test.tsx` | low |
| SSR страница списка | `recommendations/page.tsx`, `recommendationCatalogSsrQuery.ts` | low |
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
  src/modules/recommendations/recommendationCatalogSsrQuery.test.ts \
  src/modules/recommendations/recommendationDomain.test.ts \
  src/modules/recommendations/service.test.ts \
  src/app/app/doctor/recommendations/RecommendationForm.test.tsx
pnpm exec tsc --noEmit
```

На момент первичного аудита: **eslint / vitest / tsc — PASS** (по записи в `LOG.md` B4 EXEC). После **FIX 2026-05-03** — добавлен `recommendationCatalogSsrQuery.test.ts`; те же целевые команды — **PASS** (см. `LOG.md` B4 FIX). Полный `pnpm run ci` вне scope B4 FIX.

## 9. Manual Smoke (рекомендации)

- [x] Невалидный `?domain=` / `?region=` на SSR: баннеры + список без применения невалидного фильтра (FIX).
- [ ] Периодический полный прогон сценариев §9 первичного аудита (по желанию команды).

## 10. Regressions / Findings

### High

- Не выявлено.

### Medium

1. ~~SSR vs GET API по `domain`/`region`; нет баннера для невалидного `?domain=`.~~ — **Исправлено в FIX 2026-05-03:** [`parseRecommendationCatalogSsrQuery`](../../apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.ts), баннеры в [`RecommendationsPageClient.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationsPageClient.tsx), вызов из [`page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/page.tsx).

### Low

2. **Неизвестный текст в колонке `domain` в БД** — задокументировано в [`api.md`](../../apps/webapp/src/app/api/api.md); поведение без изменений (PRE_IMP Q3).

3. **Standalone `actions.ts`** — без preserve списка; **deferred** как вне scope B4-FIX (ожидаемо для `/new` и отдельного редактора).

4. **Archive inline без `selected=`** — **deferred**: осознанное отличие от `unarchive`; менять только по продуктовому запросу.

## 11. Deferred Work

- Периодический smoke полного сценария каталога.
- Опционально: расширить `GET` list query оси архива до паритета с UI (`status=active|all|archived`), если API станет единственным клиентом каталога.
- **Deferred (minor AUDIT):** debug-log при невалидном `listDomain` в `appendRecommendationsListParams` — **не делали**: параметр и так не попадает в redirect URL; дополнительный шум в server actions не оправдан без инцидента.

## 12. Final DoD (этап B4)

- [x] Поля и UI по PRE_IMP / ТЗ B4.
- [x] Миграция без merge legacy `domain`.
- [x] Фильтры type + region (AND) и тесты пересечения.
- [x] Archive/unarchive + preserve для inline-сценария.
- [x] `LOG.md` обновлён (EXEC + FIX).
- [x] Коммит за EXEC + FIX ([`MASTER_PLAN.md`](MASTER_PLAN.md) §9).
- [x] **Открыто:** пункты MANDATORY FIX (major) — **закрыты в FIX 2026-05-03** (см. §13).

---

## MANDATORY FIX INSTRUCTIONS — **выполнено (2026-05-03)**

### critical

*Нет.*

### major — done

1. Паритет SSR с `GET /api/doctor/recommendations`: [`recommendationCatalogSsrQuery.ts`](../../apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.ts) + [`page.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/page.tsx); unit-тест [`recommendationCatalogSsrQuery.test.ts`](../../apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.test.ts).

2. Баннеры невалидных `?domain=` / `?region=` — [`RecommendationsPageClient.tsx`](../../apps/webapp/src/app/app/doctor/recommendations/RecommendationsPageClient.tsx).

### minor — done / deferred

3. **Done:** [`api.md`](../../apps/webapp/src/app/api/api.md) — `invalid_query`, контракт `domain`/`region` (D3: read tolerant serialization + явный `field` для query).

4. **Deferred:** debug-log в `appendRecommendationsListParams` — не внедрялось (см. §11).

5. **Deferred:** standalone preserve / `selected` после archive — без изменений (см. §10 Low).

---

## 13. FIX 2026-05-03 (закрытие AUDIT)

| ID | Действие | Файлы |
|----|----------|--------|
| major | Парсер SSR query (domain + region UUID), не передавать невалидное в `listRecommendations` | `recommendationCatalogSsrQuery.ts`, `recommendationCatalogSsrQuery.test.ts`, `recommendations/page.tsx` |
| major | Баннеры `invalidDomainQuery` / `invalidRegionQuery` | `RecommendationsPageClient.tsx` |
| minor | Документация API `invalid_query` + контракт `domain` | `api.md` — эволюция D3 (read tolerant), см. [`AUDIT_STAGE_D3.md`](AUDIT_STAGE_D3.md) FIX |

---

## 14. После FIX (статус)

- **Verdict:** см. §1 **PASS**.
- `LOG.md` — запись B4 FIX.
- Коммит по [`MASTER_PLAN.md`](MASTER_PLAN.md) §9.
