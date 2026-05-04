# AUDIT_STAGE_D3 — ASSIGNMENT_CATALOGS_REWORK

**Дата:** 2026-05-03  
**Scope:** Stage D3 (типы рекомендаций как системный справочник БД, Q3)  
**Source plan:** [`STAGE_D3_PLAN.md`](STAGE_D3_PLAN.md), [`MASTER_PLAN.md`](MASTER_PLAN.md), запись в [`LOG.md`](LOG.md) (блок Stage D3)

## 1. Verdict

- **Status:** **PASS** (после FIX 2026-05-03)
- **Summary:** Источник allowlist для «Типа» и для query `domain` — **`reference_items`** категории **`recommendation_type`** (+ сид v1 и зеркало in-memory). При **валидных** query-параметрах SSR и `GET /api/doctor/recommendations` передают в `listRecommendations` одинаковую семантику (`domain`, `regionRefId`). Чтение строк с legacy `domain` не ломает маппинг DTO. Поля и поведение B4 (регион, метрики, архив, preserve, AND-фильтры) не убраны D3. **FIX:** уточнены JSDoc SSR-парсера; `GET` возвращает `field:"region"` при не-UUID `region`; закрыты пункты low из §6 / MANDATORY low; сноска в B4-аудите. **Сноска 2026-05-04 (FILTER URL tails III):** на **странице** каталога невалидный `?region=` больше не ведёт к отдельному баннеру/`invalidRegionQuery` — см. [`AUDIT_FILTER_URL_CONTRACT_FIX.md`](AUDIT_FILTER_URL_CONTRACT_FIX.md); §3/§5 ниже синхронизированы с этим каноном.

## 2. Источник правды типа рекомендации = БД-справочник

| Критерий | Status | Evidence |
|----------|--------|----------|
| Категория и сид в БД | **PASS** | SQL [`0039_recommendation_type_reference.sql`](../../../../apps/webapp/db/drizzle-migrations/0039_recommendation_type_reference.sql); `reference_categories.code = 'recommendation_type'` |
| Единый код категории (не `recommendation_kind`) | **PASS** | [`RECOMMENDATION_TYPE_CATEGORY_CODE`](../../../../apps/webapp/src/modules/recommendations/recommendationDomain.ts) = `recommendation_type` |
| Чтение списка кодов для UI/фильтра из порта references | **PASS** | [`page.tsx`](../../../../apps/webapp/src/app/app/doctor/recommendations/page.tsx) — `deps.references.listActiveItemsByCategoryCode(...)`; [`new/page.tsx`](../../../../apps/webapp/src/app/app/doctor/recommendations/new/page.tsx), [`[id]/page.tsx`](../../../../apps/webapp/src/app/app/doctor/recommendations/[id]/page.tsx) — то же для формы |
| Фоллбек при пустой выборке активных строк | **PASS** | [`recommendationDomainWriteAllowSet`](../../../../apps/webapp/src/modules/recommendations/recommendationDomain.ts) — если в БД нет активных строк, allowlist = коды **`RECOMMENDATION_TYPE_SEED_V1`** |
| In-memory Vitest/dev без БД | **PASS** | [`inMemoryReferences.ts`](../../../../apps/webapp/src/infra/repos/inMemoryReferences.ts) — категория + 11 строк; паритет с сидом — [`recommendationTypeSeedParity.test.ts`](../../../../apps/webapp/src/modules/recommendations/recommendationTypeSeedParity.test.ts) |
| Запись строго по allowlist + legacy «без смены» | **PASS** | [`service.ts`](../../../../apps/webapp/src/modules/recommendations/service.ts) — `ReferencesPort`, `RecommendationInvalidDomainError`, правило unchanged legacy при update |

**Замечание:** константа **`RECOMMENDATION_TYPE_SEED_V1`** остаётся в TS как обязательный дубликат набора кодов (три точки синхронизации с SQL и in-memory — см. комментарий в `recommendationDomain.ts`). Это осознанная стоимость D3, не отменяет «истина в БД» для runtime-окружений с применённой миграцией.

## 3. Паритет SSR и REST фильтров (`domain`, `region`)

| Аспект | SSR (страница каталога) | REST `GET /api/doctor/recommendations` | Status |
|--------|-------------------------|----------------------------------------|--------|
| Источник allowlist для `domain` | `listActiveItemsByCategoryCode(RECOMMENDATION_TYPE_CATEGORY_CODE)` | то же через `buildAppDeps().references` | **PASS** |
| Валидация `domain` (непустой код) | [`parseRecommendationDomain(raw, refItems)`](../../../../apps/webapp/src/modules/recommendations/recommendationDomain.ts) внутри [`parseRecommendationCatalogSsrQuery`](../../../../apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.ts) | та же функция в [`route.ts`](../../../../apps/webapp/src/app/api/doctor/recommendations/route.ts) | **PASS** |
| Валидный `domain` | `domainForList` = распознанный код → передаётся в `listRecommendations({ domain })` | `domain` в сервис идентичен | **PASS** |
| Невалидный непустой `domain` | `domainForList = null`, `invalidDomainQuery = true`, список **без** фильтра по типу; баннер в UI | **`400`** `{ ok:false, error:"invalid_query", field:"domain" }` | **PASS (с оговоркой)** |
| Невалидный `region` в URL **каталога** (UUID / мусор / не-token) | `regionCodeForCatalog` через общий **`parseDoctorCatalogRegionQueryParam`** → `undefined`; клиентский фильтр по региону не применяется; **без** баннера региона (FILTER URL tails III) | **`GET /api/doctor/recommendations`** — JSON-контракт отдельно (см. [`api.md`](../../../../apps/webapp/src/app/api/api.md), [`route.ts`](../../../../apps/webapp/src/app/api/doctor/recommendations/route.ts)); HTML-каталог не обязан дублировать HTTP-ошибки | **PASS** |

**Оговорка «паритет»:** для **некорректного** `domain` **HTTP-результат различается**: SSR-страница **не** отвечает `400`, а ослабляет фильтр и показывает **баннер по типу** (как при невалидном `assessment` у clinical-tests). REST для невалидного `domain` возвращает **`400`**. Для **некорректного** `region` на SSR каталога — фильтр региона снимается **без** баннера (FILTER URL tails III). Паритет по **`domain`** — в смысле **одинаковой функции разбора allowlist**; различие транспорта (HTML vs JSON) зафиксировано в [`api.md`](../../../../apps/webapp/src/app/api/api.md).

**Нюанс `region` на GET:** ~~`listQuerySchema` использует `z.string().uuid().optional()` — пустая/отсутствующая строка валидна; **не-UUID строка** может уронить `safeParse` всего query в **`400` `invalid_query`** без поля `region`~~ — **снят в FIX 2026-05-03** (`region` как `z.string().optional()` + явная проверка UUID, `field:"region"`). SSR для невалидного региона в URL каталога — **только** снятие клиентского фильтра (см. FILTER URL audit), без отдельного amber-баннера региона.

## 4. Legacy-коды и чтение (read tolerant)

| Критерий | Status | Evidence |
|----------|--------|----------|
| `pgRecommendations.mapRow` не зануляет неизвестный `domain` | **PASS** | [`pgRecommendations.ts`](../../../../apps/webapp/src/infra/repos/pgRecommendations.ts) — `domain = domainRaw ? domainRaw : null` (после trim; пустая строка → `null`) |
| In-memory порт | **PASS** | [`inMemoryRecommendations.ts`](../../../../apps/webapp/src/infra/repos/inMemoryRecommendations.ts) — хранит/отдаёт `domain` как есть |
| Форма: отображение legacy в select | **PASS** | [`buildRecommendationDomainSelectOptions`](../../../../apps/webapp/src/modules/recommendations/recommendationDomain.ts) + [`RecommendationForm.tsx`](../../../../apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx) |
| Сервис: update без смены legacy не требует allowlist | **PASS** | [`assertRecommendationDomainWritePayload`](../../../../apps/webapp/src/modules/recommendations/service.ts) — `unchangedFromRow` |
| Падения при чтении списка/карточки из-за `domain` | **не выявлено** | Нет `parseRecommendationDomain` на read path в репозитории |

**Обновление относительно AUDIT B4:** в [`AUDIT_STAGE_B4.md`](AUDIT_STAGE_B4.md) §2 для pre-D3 указано «неизвестный `domain` → `null` в DTO» — после D3 это **не** так: неизвестное непустое значение **сохраняется** в DTO. Контракт в [`api.md`](../../../../apps/webapp/src/app/api/api.md) обновлён (read tolerant).

## 5. Регрессия B4 — отсутствует

| Элемент B4 | Проверка D3 | Status |
|------------|-------------|--------|
| Колонки `body_region_id`, метрики текста | Не удалены из схемы/типов/формы | **PASS** |
| Фильтр AND `domain` + `regionRefId` | [`service.test.ts`](../../../../apps/webapp/src/modules/recommendations/service.test.ts) сценарий пересечения; репозиторий без изменения семантики AND | **PASS** |
| Архив / unarchive, поля B4 на месте | Тест «retain B4 fields» в `service.test.ts` | **PASS** |
| Preserve query (inline) | `RecommendationForm` hidden `listDomain` и др.; [`actionsInline.ts`](../../../../apps/webapp/src/app/app/doctor/recommendations/actionsInline.ts) — проброс **trim** `domain` в URL (в т.ч. legacy для редиректа) | **PASS** |
| Баннер невалидного `domain` | [`RecommendationsPageClient.tsx`](../../../../apps/webapp/src/app/app/doctor/recommendations/RecommendationsPageClient.tsx) — **`invalidDomainQuery`** | **PASS** |
| Невалидный `region` в URL каталога | Без отдельного баннера/`invalidRegionQuery` (FILTER URL tails III); см. [`AUDIT_FILTER_URL_CONTRACT_FIX.md`](AUDIT_FILTER_URL_CONTRACT_FIX.md) | **PASS** |
| Каталог SSR вызывает общий парсер | [`page.tsx`](../../../../apps/webapp/src/app/app/doctor/recommendations/page.tsx) + `parseRecommendationCatalogSsrQuery(..., refItems)` | **PASS** |

## 6. Findings

### High

- Не выявлено.

### Medium

- Не выявлено.

### Low

1. ~~**JSDoc в `recommendationCatalogSsrQuery.ts`**~~ — **исправлено в FIX 2026-05-03** (разделение SSR vs REST по HTTP, см. файл).

2. ~~**GET `region` и Zod**~~ — **исправлено в FIX 2026-05-03:** `field:"region"` при не-UUID; тест `route.test.ts`.

## 7. Test Evidence

Зафиксировано в [`LOG.md`](LOG.md) (блок **Stage D3**), целевые команды:

```bash
cd apps/webapp && pnpm exec eslint \
  src/modules/recommendations/recommendationDomain.ts \
  src/modules/recommendations/recommendationCatalogSsrQuery.ts \
  src/modules/recommendations/service.ts \
  src/infra/repos/pgRecommendations.ts \
  src/app/api/doctor/recommendations/route.ts \
  src/app/api/doctor/recommendations/route.test.ts \
  src/app/api/doctor/recommendations/\[id\]/route.ts \
  src/app/app/doctor/recommendations/page.tsx \
  src/app/app/doctor/recommendations/RecommendationsPageClient.tsx \
  src/app/app/doctor/recommendations/RecommendationForm.tsx \
  src/infra/repos/inMemoryReferences.ts
pnpm exec vitest run \
  src/modules/recommendations/recommendationDomain.test.ts \
  src/modules/recommendations/recommendationCatalogSsrQuery.test.ts \
  src/modules/recommendations/recommendationTypeSeedParity.test.ts \
  src/modules/recommendations/service.test.ts \
  src/app/app/doctor/recommendations/RecommendationForm.test.tsx \
  src/app/api/doctor/recommendations/route.test.ts \
  e2e/treatment-program-blocks-inprocess.test.ts
pnpm exec tsc --noEmit
```

## 8. Manual Smoke (опционально)

- [ ] После деплоя миграции **`0039`** на стенде: админка справочников / `reference_items` для `recommendation_type` + страница «Рекомендации» (фильтр, форма, сохранение).
- [ ] Строка в БД с произвольным `domain` не из справочника: открытие в UI и PATCH без смены `domain`.

---

## MANDATORY FIX INSTRUCTIONS

**Статус:** **critical / major** на дату первичного аудита **не выявлены** (закрыть нечего). **После FIX 2026-05-03** закрыты пункты **low** из §6 и блока MANDATORY «low» (JSDoc, `GET region`, cross-link B4).

Ниже — **обязательные к выполнению при появлении расхождений** или **регрессионный чеклист** (не блокируют PASS D3 после FIX).

### critical (блокер релиза D3)

*На дату аудита: отсутствуют.*

Если в будущем обнаружено расхождение allowlist между:

1. SQL-сидом **`0039`**,  
2. **`RECOMMENDATION_TYPE_SEED_V1`**,  
3. **`inMemoryReferences`** для `recommendation_type`,  

— **обязательно** синхронизировать все три + прогнать **`recommendationTypeSeedParity.test.ts`** и целевой eslint/vitest из §7.

### medium (продуктовый/контрактный риск)

*На дату аудита: отсутствуют.*

Если продукт потребует **идентичный HTTP** для невалидного `domain` на странице каталога и в API — отдельное решение (например middleware `400` для doctor recommendations с query) **вне** текущего D3 DoD; до решения текущее поведение считать задокументированным в `api.md` и §3 настоящего аудита.

### low (документация / DX)

**Выполнено в FIX 2026-05-03:** JSDoc в [`recommendationCatalogSsrQuery.ts`](../../../../apps/webapp/src/modules/recommendations/recommendationCatalogSsrQuery.ts); явный `field:"region"` в [`route.ts`](../../../../apps/webapp/src/app/api/doctor/recommendations/route.ts); сноска в [`AUDIT_STAGE_B4.md`](AUDIT_STAGE_B4.md) §2 (read tolerant D3).

*(Исторические пункты 1–2 ниже оставлены только как трассировка аудита.)*

1. ~~**Обновить JSDoc**~~ — сделано.

2. ~~**Cross-link в B4**~~ — сделано.

### Регрессионный чеклист перед merge смежных изменений

- [ ] Любое изменение кодов типа — три точки (SQL + `RECOMMENDATION_TYPE_SEED_V1` + `inMemoryReferences`) + `recommendationTypeSeedParity.test.ts`.
- [ ] Любое изменение правил `domain` / **`region` в URL каталога** в query — одновременно **`route.ts` (GET)** и **`parseRecommendationCatalogSsrQuery`** / общий **`parseDoctorCatalogRegionQueryParam`** + **`recommendationCatalogSsrQuery.test.ts`** и тесты FILTER URL (`doctorCatalogRegionQuery` / `doctorCatalogClientUrlSync`).
- [ ] Любое изменение write-path — **`createRecommendationsService`** + **`RecommendationInvalidDomainError`** + тесты `service.test.ts` + POST/PATCH routes.

---

## 9. Final DoD (этап D3 — аудит)

- [x] Источник типа для allowlist/UI — БД `reference_items` / `recommendation_type` (+ фоллбек сид v1).
- [x] SSR и REST согласованы по разбору **`domain`** и передаче в `listRecommendations` при допустимых значениях; **`region`** на SSR каталога разбирается общим парсером кода региона (см. FILTER URL audit); оговорка по HTTP при невалидном `domain` задокументирована.
- [x] Legacy `domain` на чтении не ломает маппинг; write strict + unchanged legacy.
- [x] Регрессий B4 по проверенным пунктам не выявлено.
- [x] MANDATORY FIX INSTRUCTIONS добавлены в этот документ.
- [x] **FIX 2026-05-03:** low из §6 / MANDATORY low закрыты (JSDoc, `GET region`, cross-link B4); `critical`/`medium` по-прежнему «не применимо на дату аудита».
